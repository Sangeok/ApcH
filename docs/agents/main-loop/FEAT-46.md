# FEAT-46 — 메인 루프 기록

## 게이트① (2026-09-15)

소유자 직접 발주(pm 미경유) — 세션 지시 "feat-46 계획 지시". PR #119(FEAT-42·45) 배포 뒤 메인 루프가 다음 개발 항목으로 추천한 항목이다. `계획지시`로 보드에 기록했다.
발주 시점 보드 미결은 0건이다(`보류` FEAT-01 제외). `dev` = `origin/dev`.

담당은 `backend-dev`다. area `apps/backend/main.py` + 신규 순수 모듈이 그 에이전트의 쓰기 범위 안이다. 선행이 없고, FEAT-47(저장 컬럼)·FEAT-48(검토 카드 표시)이 이 항목의 필드를 받는다.

**발주 전 앵커 실측** — 백로그 인용은 FEAT-41·43 뒤에도 전부 현재 트리와 맞다.
- 전사: `main.py:896` `def transcribe_video(self, base_dir: str, video_path: str) -> str:` — 단어마다 `{"start", "end", "word"}`, 시각·텍스트가 없는 단어는 버린다(`:928`·`:937`). 정렬 모델 영어 고정 `:889`.
- 렌더 번역 프롬프트: `main.py:481` `You are a professional podcast translator. Please translate the English subtitles below into natural Korean.` — `{index, translation}` 배열 형식(`:503`)이고 파싱은 `translation_fallback.py:16` `def parse_translations(payload):`.
- analyze: `main.py:1037` `validated_moments = validate_moments(clip_moments)` → `:1039` `analyze_payload = {` — moment 필드 `index`·`startSeconds`·`endSeconds`·`clipType`·`hook`·`payoff`(`:1043-1048`). 같은 값이 동기 응답 `:1166-1171`에도 실린다.
- 후보 식별 호출: `main.py:943` `def identify_moments(...)` → `build_moment_prompt`(`moment_prompt.py`) · `gemini-2.5-flash` · `response_mime_type="application/json"`.
- Modal 이미지 등록: `main.py:85` `.add_local_python_source("s3_upload_policy", "translation_fallback", "temp_cleanup_policy", "error_callback", "moment_prompt", "caption_style_source"))` — `test_modal_image_sources.py`가 import 목록과 대조한다.
- web LLM 키: `apps/web/src/env.js`에 `GEMINI`·`OPENAI`·`ANTHROPIC` 0건.
- **"배포 순서 제약 없음" 검산 — web의 analyze moment 수신 경로 둘을 전부 확인했다.**
  - 웹훅 `apps/web/src/app/api/webhooks/modal/route.ts:83-87`: `.map(normalizeAnalyzedMoment)`. 그 함수(`inngest/modal-contract.ts:173-201`)는 명시 필드만 복사해 새 필드를 버린다.
  - 로컬 동기 모드 `inngest/functions.ts:885-887`: 정규화 없이 캐스팅한다. 다만 드래프트 저장 `:930-946`이 필드를 하나씩 매핑해 새 필드는 DB에 닿지 않는다.
  - 결론: 이 항목만 배포돼도 web은 무변화다.
- 검토 카드의 영어 본문 규칙: `widgets/clip-draft-review/ui/_component/ClipDraftCard.tsx:108-109` `word.start >= startSeconds && word.end <= endSeconds`, `:114` 공백 join.
- web 분석 대기 한도: `inngest/functions.ts:676` `const ANALYSIS_RESULT_TIMEOUT = "60m";`(`stale-policy.ts` `stuckAlertMs` 90m의 근거).

### 계획 단계에서 반드시 다룰 것

- **번역 원문을 어떻게 뽑는지 정확히 정한다.**
  - 구간은 `validate_moments` 뒤의 `start`/`end`(= web `aiStartSeconds`/`aiEndSeconds`)다.
  - 단어 포함 규칙과 join은 검토 카드 영어 본문과 같게 맞춘다(위 `ClipDraftCard.tsx:108-114`). 어긋나면 카드가 처음 보여 주는 영어와 번역이 다른 범위를 가리킨다.
  - 사용자가 경계를 옮기면 카드 영어는 바뀌지만 번역은 AI 구간 그대로다. 그 표시 문제는 FEAT-48 몫이라는 사실만 적는다.
  - 구간 안 단어가 0개인 후보의 처리도 정한다.
- **필드명과 null 의미.** FEAT-47 컬럼·FEAT-48 표시가 이 이름을 그대로 쓴다(백로그 FEAT-47 「이름은 FEAT-46의 필드명과 맞춘다」).
  기존 moment 필드와 같은 camelCase 규약을 따르고, "번역 없음"(실패·누락 인덱스·빈 원문)을 null로 싣는지 키를 생략하는지 정한다.
  English 경로는 호출도 필드도 추가하지 않는다(백로그 요구 ①) — 이 불변을 테스트로 단언한다.
- **언어 판정.** `moment_prompt.py`(FEAT-43)가 `"Korean"`일 때만 지시문을 더하는 선례와 같은 판정을 쓰는지 근거와 함께 정한다(다른 값·대소문자·공백).
- **실패가 analyze를 실패시키지 않는다(요구 ③).**
  - analyze는 `_do_process_video`의 `try`(`main.py:982`) 안이다. 예외가 새면 `:1142` `except Exception as e:`가 에러 콜백(`:1146-1153`)을 보내고 `:1156`에서 `raise`한다.
  - 그래서 번역 호출·JSON 파싱·인덱스 매칭의 모든 예외를 번역 단계 안에서 잡는다. 무엇을 잡고 무엇이 null이 되는지 분기별로 적는다.
  - Gemini 호출이 멈추는 경우도 다룬다. 지금 `identify_moments`와 렌더 번역 호출에는 타임아웃이 없다. 멈춘 호출은 analyze 전체를 web 한도(60m)까지 끌고 가 `analysis_timeout`으로 만든다. 이 호출에 타임아웃을 둘지, 둔다면 값과 방법을 정한다.
- **한 번의 호출로 인덱스를 맞춘다(요구 ①·②).**
  - `identify_moments` 프롬프트에는 섞지 않는다 — FEAT-43 원장 「고른 구간이 크게 다르지 않은가」가 지키는 구간 선택을 흔들지 않기 위해서다.
  - 프롬프트 조립·응답 파싱·인덱스 매칭은 stdlib 순수 모듈로 뺀다.
  - 기존 `translation_fallback.parse_translations`를 재사용할지 판정한다. 그 모듈의 누락 처리는 영어 폴백이고, 여기서는 null이 요구다.
  - 코드 펜스 제거가 `main.py`에 두 번 복제돼 있다(`:1019-1025`·`:525-530`). 새 모듈이 그 형태를 어떻게 다루는지도 적는다.
  - 참고 번역은 문장 단위로 읽기 좋게 쓰는 것이 목적이다. 렌더 번역처럼 줄 수를 맞추는 제약은 없다.
- **Modal 이미지 등록.** 새 모듈을 `main.py:85` 목록에 넣는다(「고칠 파일」에 그 줄 포함). 빠지면 `test_modal_image_sources.py`가 실패한다.
- **지연·비용.** Korean analyze마다 Gemini 호출이 1회 는다. web 한도(60m)에 비하면 작지만, 입력 크기(후보 수 × 구간 단어 수)와 한 호출의 예상 크기를 적는다.
- **못 덮는 범위.**
  - Gemini 실출력의 번역 품질과 인덱스 준수, Korean analyze 지연 증가량은 unittest로 못 덮는다 — 배포 후 실제 Korean 업로드로 확인한다.
  - 이 필드는 FEAT-47·48 전까지 화면에 나오지 않는다. 그래서 배포 확인은 Modal 로그나 콜백 본문으로만 할 수 있다는 점을 적는다.
- **메인 루프 몫(인수 때).** `apps/backend/CLAUDE.md`가 analyze 필드 소비 위치(`main.py:1046-1048`)와 이미지 등록 줄(`main.py:85`)을 인용한다. 구현으로 줄이 밀리면 인수 때 메인 루프가 갱신한다. 계획서는 밀리는지 여부만 적는다.
