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

## 계획서 수령 (2026-09-15)

backend-dev 계획서 `docs/plans/FEAT-46.md` — 수정 1(`main.py`), 신규 2(`reference_translation.py`·`test_reference_translation.py`). 필드명 `referenceTranslation`, Korean만 키를 싣고(값 str|null) English는 키 없음. Gemini 타임아웃은 `HttpOptions(timeout=120000)`. 보드 `계획지시` → `검토대기`를 계획서와 같은 커밋으로 푸시했다.

## 검증 필수 경로 확정 (2026-09-15, 카탈로그 `docs/plans/verification-paths.md`)

| 경로 | 채택 | 근거 |
| --- | --- | --- |
| 1 인용 전수 대조 | ○ | 전 항목. `main.py` 인용 약 30곳 + `moment_prompt.py`·`translation_fallback.py`·`requirements.txt`·web 4파일 |
| 2 스케치 추출·실행 | ○ | 신규 모듈 전문 + I/O 래퍼 + 페이로드 블록 |
| 3 before/after 기계 적용 | ○ | before 둘(이미지 등록·analyze 페이로드) + 삽입 둘(import·래퍼) |
| 4 전칭 여집합 열거 | ○ | "Gemini 호출 셋에 타임아웃 없음", "`analyze_payload`는 콜백·동기 응답이 스프레드할 뿐", "English 페이로드 바이트 동일", "`validate_moments`는 원본 dict 통과", "web 무변화" |
| 5 돌연변이 검사 | ○ | 순수 함수 6개 신설 |
| 6 실제 사건 재생 | ○(변형) | 외부 신호 = Gemini 응답·전사 JSON. 과거 실측 응답이 없어 BUG-02(응답 형상 재생)·FEAT-36(생산자 계약 입력 차등 비교) 선례대로 적용 |
| 7 음성 시험 | ○ | Modal 이미지 등록 가드(`test_modal_image_sources.py`)에 기댄다 |
| 8 실물 렌더 | × | 화면 변경 없음 |
| 9 구조적 아티팩트 | × | schema·config·생성 파일 변경 없음(`requirements.txt` 무변경) |

## 1라운드 (2026-09-15, 메인 루프 — 위생·검증 가능성 결함 4건, 일괄 편집)

하니스는 스크래치패드 `feat46/`(`apply46.mjs`·`test_ref46.py`·`mutate46.py`·`wire46.py`·`neg46.mjs`·`planedit46.mjs`).

- **경로 1**: 계획서 인용 전수를 현재 트리와 내용까지 대조했다. `get_title_and_hashtags` 하나만 틀렸고(D1), 나머지는 전부 일치했다(`main.py:2·23·45·85·120-136·410·481·515·525-530·534·547-548·602·669·752·878·880-881·889·896·928·930·937·944·945·982·997·1001·1017·1019-1025·1027-1035·1037·1039-1052·1054-1061·1142·1146-1153·1156·1166-1171`, `moment_prompt.py:91`, `requirements.txt:35`, `ClipDraftCard.tsx:108-114`, `modal-contract.ts:173-201`, `functions.ts:930-946`, `env.js` LLM 키 0).
- **경로 2·3**: `apply46.mjs`가 python 블록 5개를 바이트 그대로 추출하고, 실제 트리에 앵커 1회 일치로 ①~④를 적용했다(`main.py` +60/−12).
  - 결과: `python -m unittest discover -s apps/backend -p "test_*.py"` → `Ran 79 tests … OK` · `py_compile` 0 · 실제 위치 모듈에 명세 테스트 24/24.
  - 끝에 `git checkout -- apps/backend/main.py`와 모듈 파일 삭제로 원복했다.
- **경로 4**
  - `generate_content` 호출은 `:515·:669·:945` 셋뿐이고 전부 타임아웃이 없다.
  - `analyze_payload` 사용은 `:960` 초기화·`:1039` 생성·`:1060`·`:1170` 스프레드뿐이다(`git grep HEAD`).
  - `validate_moments`는 원본 dict를 그대로 append한다(`:135`).
  - web 수신 두 경로가 새 필드를 버린다(게이트① 실측).
- **경로 5**: 계획서 「테스트」 명세를 명세 밖 단언 없이 `test_ref46.py` 24메서드로 옮기고 `mutate46.py`로 돌연변이 18종을 심었다 → **18/18 사멸**, 원본 해시 불변.
  - 돌연변이 종류: 언어 대소문자·경계 배타·join·index·빈 단어·count·ensure_ascii·index 지시·키 이름·json 접두·꼬리 펜스·빈 원문 None·누락→""·None 경로 복사·원본 변형·바깥 strip·json 대소문자.
- **경로 6(변형)**: `wire46.py`가 계획서 ③ 래퍼와 ④ before/after를 exec했다. genai는 venv 설치본 `google-genai` 2.16.0이고 클라이언트만 가짜다 → **23/23**.
  - English는 호출 없이 None, 전부 빈 원문이면 호출 없음.
  - config가 실제 `GenerateContentConfig`이고 `http_options.timeout == 120000`, 프롬프트에서 빈 원문이 빠진다.
  - 응답 형상 9종(호출 예외·text None·잘못된 JSON·오류 객체·빈 배열·문자열 index·공백 번역·모르는 index·bare 펜스)이 전부 래퍼 밖으로 새지 않는다.
  - English 페이로드는 before/after 바이트 동일이고, Korean은 전 moment에 키가 붙고 나머지 필드는 불변이다.
  - 생산자 계약 형태의 무작위 구간 300개에서 원문이 카드 본문 규칙과 전부 일치했다.
- **경로 7**: 적용 트리에서 등록 목록의 `"reference_translation"`만 빼자(`neg46.mjs`) `test_modal_image_sources` → `FAILED (failures=1)`. 원복했다.
- **추가 사실 확인**
  - `google-genai` 소스: 요청 단위 `http_options` 전달(`models.py` `parameter_model.config.http_options`), `_api_client.py:229` `timeout / 1000.0`, 재시도 옵션 없으면 `stop_after_attempt(1)`(`:536`).
  - web `parseTranscriptWords`(`features/clip-review/model/transcript.ts:11-18`)는 빈 문자열 단어도 통과시킨다. 하지만 생산자 `transcribe_video`가 빈 단어를 버리므로(`:928`·`:937`) 실데이터에서는 카드와 원문이 어긋나지 않는다.
  - `should_translate_references`·`build_reference_sources`는 `try` 밖이지만 예외에 도달할 수 없다. moment의 `start`/`end`는 `validate_moments`의 `end - start`에서 이미 수치가 보장되고, 전사 단어는 생산자가 `float()`한다.
- **스킬 floor**
  - 동시성·멱등: 해당 없음. 번역은 상태를 남기지 않고, 재분석은 새 attempt가 전체를 다시 돈다.
  - 권한 표면: 신설 없음.
  - 직렬화 형상 변경: (a) 의존성 버전 — `google-genai` 미고정은 D3에서 다룬다. (b) 옛 페이로드를 박은 fixture — 테스트 파일 grep(`normalizeAnalyzedMoment|referenceTranslation|phase analyze`) 0건. (c) 관측 — 새 로그 줄 `Reference translation error:` 외 메트릭·트레이스 없음.

**결함 — 전부 비구현 영향, 일괄 편집(`planedit46.mjs`, 앵커 1회 일치 5곳)**
- **D1 위생**: ③ 삽입 위치가 존재하지 않는 `get_title_and_hashtags`를 인용하고 "헬퍼 뒤, 클래스 앞"이 모호했다. `process_clip` 끝(`:878`) 뒤, 클래스 주석(`:880`) 앞으로 특정하고, 주석과 데코레이터 사이에 넣지 않는다고 적었다.
- **D2 위생**: 지연 추정의 "후보 수 ≤ 8"은 코드가 강제하지 않는다. 요청 수일 뿐이며 `validate_moments`는 개수를 자르지 않는다고 고쳤다.
- **D3 위생**: 미지원 시 예외를 `TypeError`로 적었지만 pydantic `extra="forbid"`라 `ValidationError`다. 설치본 2.16.0의 지원·전달·단위·재시도 증거를 적고, 「못 덮는 범위」 확인 문구를 배포 이미지(미고정 최신) 기준으로 고쳤다.
- **D4 검증 가능성**: "예상 22개 내외"로는 backend-dev B-5의 "약속한 수 이상" 판정이 서지 않는다. "신규 ≥ 20 → N ≥ 99"로 고쳤다.

**패스 상태**: Source changed = yes → 클린 패스 아님. 다음은 최신 저장본 전체에 대한 무편집 2라운드다. 트리 청결(`git status`): 계획서 편집 + 세션 전부터 있던 `settings.local.json`·`nul`뿐.

1라운드 커밋 `863d99e`.

## 2라운드 (2026-09-15, 메인 루프 — 무편집, 무소득)

최신 저장본(`863d99e`)에 대해 1라운드와 같은 경로를 다시 전부 돌렸다. 계획서는 고치지 않았다.

- **경로 1**: 편집된 구간(계획서 160~294줄)을 다시 읽었다. 새로 들어간 인용 `main.py:2`(`import json`)·`:23`(`from google import genai`)·`:410`·`:602`·`:752`·`:878`(`    }`)·`:880`(클래스 주석)·`:881`·`:1017`·`:120-136`이 현재 트리와 일치한다. 1~159줄은 편집 대상이 아니다(`git diff` hunk 4개가 전부 189·228·280·289-290줄).
- **경로 2·3·7**: 편집본에서 python 블록 5개를 추출해 실제 트리에 적용했다 → `Ran 79 tests … OK` · `py_compile` 0. 등록을 뺀 음성 시험은 `FAILED (failures=1)`. 원복 후 `git status`에 `apps/backend` 변경 0.
- **경로 5**: 명세 테스트 OK, 돌연변이 **18/18 사멸**, 원본 해시 불변.
- **경로 6(변형)**: `wire46.py` **23/23**.
- **경로 4**: 1라운드 열거의 대상(`generate_content` 호출·`analyze_payload` 사용·web 수신 경로)은 이 라운드 사이에 트리가 바뀌지 않았다. 커밋 사이의 변경은 FEAT-49 보드 행·기록뿐이다.

결함 0 → 메인 루프 라운드 무소득. `plan-verifier`에 독립 무편집 패스를 맡긴다. 브리핑은 항목 ID·계획서 경로·필수 경로 목록(1·2·3·4·5·6변형·7)만 준다.

**병행 세션 관측**: 1라운드 푸시 때 원격이 `26dae40`이 아니라 `7e8183b`에서 넘어갔다. 다른 세션이 같은 작업 트리에서 소유자 지시로 FEAT-49 게이트①을 열고 커밋했다(`board: FEAT-49 계획지시`, 보드 5줄·`docs/agents/main-loop/FEAT-49.md`). 그 세션도 FEAT-46과 파일 교집합이 없음을 확인했다고 적었다. FEAT-46의 쓰기 범위(`apps/backend`·FEAT-46 문서)와 FEAT-49(`apps/web` 캡션 미리보기)는 겹치지 않는다. 트리 청결 판정 때 그 세션의 FEAT-49 변경분은 구분해서 본다.

2라운드 커밋 `3a37049`.

## plan-verifier 1사이클 (2026-09-15) — 결함 1건(위생), 실행하지 못한 경로 없음

브리핑 계약 준수(항목 ID·계획서 경로·필수 경로만). 필수 경로 1~7을 전부 실행했다.
- 경로 2·3: 앵커 4개가 1회 일치하고, 복사본에서 `py_compile` OK.
- 경로 5: 돌연변이 12종 전부 사멸.
- 경로 6: 실제 형상 응답 5종 재생.
- 경로 7: 등록을 빼면 `FAILED`, 기준선 79.
- 트리 청결: 검증 뒤 `git status`를 메인 루프가 직접 봤다. `M apps/web/.claude/settings.local.json`·`?? nul`만 있어 무변경이다. 그사이 새 커밋 `b082bd5`는 병행 세션의 FEAT-49 계획서다.

**[결함 1] 문서 위생 — 확인함**: 「현재 동작」 9행이 `main.py:896`을 `def transcribe_video(self, base_dir, video_path) -> str:`로 인용했다. 실제 줄은 `    def transcribe_video(self, base_dir: str, video_path: str) -> str:`로, 두 파라미터의 타입 주석이 빠져 있었다. 맥락 인용이라 구현 영향은 없다.

**메인 루프가 놓친 이유**: 1·2라운드 경로 1에서 `:896`의 줄 번호와 함수 존재만 맞춰 보고 인용 글자를 대조하지 않았다. 카탈로그 경로 1의 "줄의 존재가 아니라 **내용까지**"를 사람 눈으로만 했다.

**조치**
- 9행 인용을 실제 줄 그대로 교체했다(편집 1곳).
- 같은 누락을 여집합으로 막았다. `cite46.mjs`로 계획서에서 `파일:줄` 바로 뒤에 붙은 백틱 인용을 전부 뽑아 실제 줄(범위면 이어 붙인 줄)에 글자 그대로 들어 있는지 기계 대조했다 → **19개 중 정확 17 · 생략 표기(`...`) 2개는 조각이 전부 실제 줄에 있음 · 불일치 0**.
- 한계: 인용이 `파일:줄`과 떨어져 있는 형태(예: 필드 열거)는 이 정규식이 잡지 않는다. 그런 인용은 1라운드에서 눈으로 대조했다.
- `def` 서명 인용은 9행 하나뿐이다(grep).

## 3라운드 (2026-09-15, 메인 루프 — 무편집, 무소득)

편집본에 대해 하니스를 다시 전부 돌렸다.
- 결과: 추출 5블록 · 명세 테스트 OK · 돌연변이 **18/18** · `wire46.py` **23/23** · 실제 트리 적용 `Ran 79 tests … OK` · `py_compile` 0 · 등록 음성 시험 `FAILED (failures=1)` · 원복 후 `apps/backend` 변경 0. 인용 기계 대조 불일치 0(위).
- 결함 0. Source changed = yes(9행)였으므로 클린 패스 판정은 plan-verifier 2사이클의 독립 무편집 패스에 맡긴다.
