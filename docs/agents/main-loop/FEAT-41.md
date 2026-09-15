# FEAT-41 — 메인 루프 기록

## 게이트① (2026-09-14)

pm이 `승인대기`로 선정(FEAT-38이 소유자의 DB 마이그레이션 적용 대기로 막혀 그 체인 FEAT-39·42가 착수 불가, 선행 없는 backend 항목).
소유자에게 "웹이 요청 단위 스타일을 보내기 시작하는 것은 FEAT-42라, 이 항목만 배포해서는 사용자 체감 변화가 없다"를 고지했고,
소유자가 "진행"으로 `승인대기` → `계획지시` 개방.

담당은 `backend-dev` — area `apps/backend/main.py` + 신설 순수 모듈, 그 에이전트의 쓰기 범위 안이다.
미결 FEAT-38(main-loop, 커밋 보류 중인 변경은 `packages/db`·`apps/web` analytics)과 파일이 겹치지 않는다.

### 계획 단계에서 반드시 다룰 것

- **폴백의 단위를 정한다 — 객체 통째인가, 키 단위 병합인가.** 백로그 요구 ②는 `moment.caption_style` → `request.caption_style` →
  언어 기본값의 3단 폴백만 말하고, moment 스타일이 **일부 키만** 가질 때 나머지를 요청 단위 스타일에서 채우는지(병합)
  아니면 moment 스타일이 있으면 그것만 쓰는지(통째)는 정하지 않았다. `resolve_caption_style`이 누락 키를 언어 기본값으로
  접으므로 두 방식은 **실제로 다른 렌더를 낸다.** 웹의 검토 화면 미리보기가 무엇을 기준으로 그리는지(FEAT-42가 드래프트에
  스냅샷을 시드하는 설계)와 맞는 쪽을 근거와 함께 고른다. 판단이 제품 동작 선택이라 갈리면 소유자 결정 사항으로 적는다.
- **새 순수 모듈은 Modal 이미지 등록 목록에도 올린다.** FEAT-43이 넣은 `test_modal_image_sources.py`가 `main.py`가 import하는
  로컬 모듈이 `add_local_python_source(...)`(현재 `main.py:79`)에 전부 있는지 검사한다 — 빠뜨리면 그 테스트가 실패하고,
  테스트가 없었다면 배포 컨테이너가 시작 시 죽는다. 「고칠 파일」에 그 줄을 포함한다.
- **모드별 적용 범위.** render·auto는 폴백을 적용하고, analyze는 캡션 렌더가 없으므로 영향이 없어야 한다. 주입 지점
  (`main.py:1115` `caption_style=moment.get("caption_style"),`)과 요청 모델(`main.py:47` `class ProcessVideoRequest(BaseModel):`)에서 출발해
  `_do_process_video`로 요청 값이 어떻게 전달되는지(현재 시그니처에 caption 인자 없음)까지 따라간다.
- **배포 순서 안전성.** 새 필드는 선택·기본 `None`이라, 웹이 아직 보내지 않는 지금 배포해도 동작이 바뀌지 않아야 한다
  (요청 스타일 `None` → 기존 동작과 동일). 이 불변을 테스트로 단언한다.
- **못 덮는 범위.** 실제 렌더 결과(자막 모양)는 GPU·Modal이 필요해 unittest로 못 덮는다 — 배포 후 확인이 원장 등재 대상이다.
  다만 웹이 요청 단위 스타일을 보내는 것은 FEAT-42라, 그 확인은 FEAT-42 배포 뒤에야 가능하다는 점도 적는다.

## 필수 경로 확정 (2026-09-14)

| 경로 | 채택 | 근거 |
| --- | --- | --- |
| 1 인용 전수 대조 | ○ | 전 항목 필수. `main.py` 인용 25곳 + `test_modal_image_sources.py` |
| 2 스케치 추출·실행 | ○ | 신규 순수 모듈 전문 |
| 3 before/after 기계 적용 | ○ | before 블록 여섯(import·요청 필드·이미지 등록·시그니처·주입·spawn/remote 꼬리 2곳) |
| 4 전칭 여집합 열거 | ○ | "유일한 주입 지점", "analyze는 도달하지 않는다", "부분 키 케이스가 실제로 생기지 않는다", "범위 밖 의존 없음" |
| 5 돌연변이 검사 | ○ | 순수 함수 신설 |
| 6 실제 사건 재생 | × | 외부 신호 해석 변경 없음(새 요청 필드는 아직 아무도 보내지 않는다) |
| 7 음성 시험 | ○ | Modal 이미지 등록 가드에 기댄다 — 등록을 빼면 실패하는가 |
| 8 실물 렌더 | × | 화면 변경 없음 |
| 9 구조적 아티팩트 | × | schema·config·생성 파일 변경 없음 |

## 라운드 1 (2026-09-14) — 기계 경로 무결함, 설계 결함 후보 1건 → 소유자 결정 대기

하니스: 스크래치패드 `feat41/harness.py`.

- **경로 1**: `main.py:47·53-56·62·79·155·163·177·184·288·404·746·826·841·950·995·1055·1057·1069·1078·1099·1101·1115·1180·1192-1203·1207-1218` 전부 내용 일치.
- **경로 3**: python 블록 13개. before 여섯 전부 현재 트리와 일치·유일(spawn/remote 꼬리는 정확히 2회). 기계 적용 후 `py_compile` 통과,
  AST로 `_do_process_video` 마지막 인자 `request_caption_style` · spawn·remote 둘 다 `request_caption_style=request.caption_style` ·
  `ProcessVideoRequest.caption_style: dict | None = None` · 주입 `select_caption_style(moment.get('caption_style'), request_caption_style)` 확인.
- **경로 2·5**: 모듈 import 0개(stdlib-only). 명세 7케이스 스케치에서 통과. 돌연변이 7종(우선순위 뒤집기·키 병합·빈 dict를 부재로·
  truthy 판정·`{}` 반환·요청 무시·비-dict 요청 반환) **전부 사멸**.
- **경로 7**: 가드 `test_modal_image_sources.py`를 적용본(등록 포함)에서 `OK`, 등록만 뺀 적용본에서 `FAILED`.
- **경로 4 — 설계 결함 후보**: 「대안」의 "FEAT-42 설계에서 render moment는 스냅샷으로 시드된 완전 객체라 부분 키·부재 moment가
  실제로 발생하지 않는다"는 **거짓이다.** 여집합 열거:
  - 커스텀 클립: `entities/clip-draft/api/index.ts:117-148` `createCustomClipDraft`가 `captionStyle`을 넣지 않는다 → null.
  - 명시적 리셋: `CaptionStyleDialog.tsx:82` `{/* 작업본만 비운다. 저장(= 언어 기본값으로 리셋)은 Apply가 한다. */}` · `:87` `onClick={() => setWorking(null)}` · `:117` `onApply(working);` → null 저장(`entities/clip-draft/api/index.ts:73` `// undefined = 스타일 변경 없음, null = 기본 스타일로 리셋`).
  - 렌더 페이로드: `entities/clip-draft/api/index.ts:111` `caption_style: (draft.captionStyle as CaptionStyle | null) ?? undefined,` → null이면 moment에 키 자체가 없다.
  - FEAT-42 백로그는 시드를 `createClipDraftsBulk`에만 적는다(커스텀 클립 미포함).
  **즉 render 모드에서 "moment 스타일 부재"는 오늘 "언어 기본값"을 뜻한다.** 계획서의 통째 폴백은 부재를 "요청 스냅샷 상속"으로 바꾼다.
  render 요청에 요청 단위 스타일이 실리는 순간 null 드래프트(커스텀 클립·리셋한 클립)는 미리보기(언어 기본값)와 다르게 스냅샷으로
  렌더된다 — 계획서가 막는다고 주장한 바로 그 미리보기≠실렌더이며, FEAT-42 백로그가 기각한 "상속식 `draft.captionStyle ?? snapshot`
  간접층"을 백엔드에 다시 만드는 셈이다. 오늘은 무해하다(아무도 요청 필드를 보내지 않는다). FEAT-42 백로그는 스냅샷을 **auto
  디스패치에만** 싣는다고 적어 의도상 충돌은 없지만, 백엔드가 그 규율을 강제하지 않는다.
  **해소가 백로그 요구 ②("render·auto 두 모드에 같은 식")를 바꾸는 선택이라 소유자 결정으로 올린다.**

### 소유자 결정 (2026-09-14)

선택지 둘을 예시("기본 캡션을 노란 큰 글씨로 설정 → 한 클립만 Reset으로 흰 기본 글씨 → 미리보기는 흰 글씨")와 함께 제시 —
(가) 요청 스타일은 auto에서만, render는 클립 스타일만(없으면 언어 기본값) / (나) 계획서대로 두 모드 공통 + FEAT-42에 규율 제약.
소유자가 **(가)**를 골랐다(메인 루프 추천안).

**계획서 일괄 편집(메인 루프, 편집 권한은 런북 4단계)**: `select_caption_style(moment_style, request_style, mode)` — moment dict 우선,
`mode == "auto"`일 때만 요청 스타일, 그 밖 `None`. 주입 줄이 `mode`를 넘긴다. 요청 필드 주석을 auto 전용으로. 「현재 동작」에
render 부재 = 언어 기본값의 근거 셋(커스텀 클립·Reset·렌더 페이로드) 추가. 「문제」에 요구 ② 축소와 결정 날짜. 테스트 7 → 10(모드별
케이스·그 밖 mode). 「대안」의 거짓 문장("부분 키·부재가 실제로 생기지 않는다") 제거·병합 기각 근거를 `captionStyleSchema`의 키별 null로
교체, "두 모드 공통 폴백" 기각을 소유자 결정으로 추가. 「범위 밖 의존」에 FEAT-42 백로그 전파 기록.
**전파**: 백로그 FEAT-41 요구 ②, FEAT-42 디스패치 문장. **계획서를 고쳤으므로 준비 상태 리셋 → 라운드 2.**

## 라운드 2 (2026-09-14) — 편집본 검증, 무결함 (편집 라운드이므로 판정 아님)

하니스 `feat41/harness.py`를 mode 인자·10케이스·돌연변이 10종으로 갱신해 편집된 계획서에 실행.

- **경로 1**: 편집으로 들어온 웹 인용 — `clip-draft/api/index.ts:73·111·117·148`, `CaptionStyleDialog.tsx:82·87·117`,
  `test_modal_image_sources.py:16·24` — 와 `main.py:47·56·62·79·950·995·1057·1069·1101·1115·1180` 전부 내용 일치.
  `ClipDraftCard.tsx:35-41` `toCaptionStyle`이 `{}`를 null 키로 채워 언어 기본값으로 그림을 확인(빈 dict 존재 취급과 대칭).
- **경로 4**: `createCustomClipDraft` 본문에 `captionStyle` 없음(여집합 열거) · `mode`가 `_do_process_video` 인자이고 함수 안에서 재대입 0.
- **경로 3**: before 여섯 일치·유일, 적용 후 `py_compile` 통과, AST로 주입 줄이 정확히
  `select_caption_style(moment.get('caption_style'), request_caption_style, mode)`.
- **경로 2·5**: 모듈 import 0. 명세 10케이스 통과. 돌연변이 10종 전부 사멸 — 모드 제한을 깨는 셋(M7 모드 검사 제거·M8 상수 render·
  M9 `mode != "analyze"`)이 t4(render는 요청 무시)·t10(그 밖 mode)에 걸림.
- **경로 7**: 등록 포함 `OK`, 등록 제외 `FAILED`.

계획서가 이 라운드에서 편집됐으므로 판정은 라운드 3(무편집)에서 한다.

## 라운드 3 (2026-09-14, 무편집) — 무소득

- 계획서를 파일에서 전문 재독(회상 아님). 라운드 2 저장 이후 계획서 편집 0.
- 하니스 재실행: FAIL 0 · 돌연변이 10종 전부 사멸 · 가드 등록 제외 시 `FAILED`.
- 계획서가 주장하는 백로그 전파 둘(「문제」 "백로그 FEAT-41 항목도 같은 내용으로 고쳤다", 「범위 밖 의존」 "FEAT-42 항목에 … 적었다")을
  `TASK_BACKLOG.md`에서 확인 — 두 문장 모두 존재(2건).
- 트리: FEAT-41 문서 셋(계획서·이 기록·백로그)과 커밋 보류 중인 FEAT-38 변경뿐.

**판정: 무소득** → `plan-verifier` 독립 패스 디스패치 자격. 필수 경로는 확정표의 1·2·3·4·5·7.

## 독립 패스 1사이클 (2026-09-14, plan-verifier)

브리핑은 계약 셋(항목ID·계획서 경로·경로 1·2·3·4·5·7 카탈로그 발췌)뿐. 검증자가 계약 준수를 스스로 확인했다.

**보고: 결함 0건.** 필수 경로 여섯 전부 실행, 실행 못 한 경로 없음. 하니스는 스크래치패드.
- 경로 1: `main.py` 인용 전부와 웹 인용(`clip-draft/api/index.ts:73·111·117-148`, `CaptionStyleDialog.tsx:82·87·117`), `test_modal_image_sources.py:16-24` 내용 일치.
- 경로 2: 신규 모듈을 바이트 그대로 추출해 `py_compile` 통과, 적용한 `main.py`도 통과.
- 경로 3: before 여섯의 출현 횟수가 계획서 기대와 일치(spawn·remote 꼬리 2회), 손 개입 없이 적용.
- 경로 4: "유일한 주입 지점" — `process_clip(` 호출부는 한 곳이고 그 `caption_style=`이 `:1115` 하나. "auto moment에 caption_style 없음" — `validate_moments`가 moment를 변형 없이 append만 한다. 배포 순서 불변을 모듈 실행으로 확인.
- 경로 5: 명세 10케이스를 unittest 12메서드로 이식해 통과, 돌연변이 6종(mode 게이트 제거·폴백 모드 render·moment 우선 제거·`is not None` 완화·truthiness 완화·request `isinstance` 제거) 전부 사멸.
- 경로 7: 샌드박스에서 등록 있으면 통과, 등록만 빼면 실패하며 `caption_style_source`를 누락 모듈로 정확히 지목.

**트리 검산**(메인 루프 직접): 패스 종료 후 `git status --short`가 디스패치 직전 스냅샷과 동일 — 커밋 보류 중인 FEAT-38 변경
(`git diff --ignore-cr-at-eol --numstat` 수치까지 동일), `apps/web/.claude/settings.local.json`, `nul`. 검증자 무수정 준수 확인.

**판정: 클린 패스.** 정지 규칙 계수 0(구현 영향 결함은 라운드 1의 설계 결함 1건뿐이고 소유자 결정으로 해소, 독립 패스 0건).
보드에 `검증:` 줄 기록. 다음은 게이트②이며 소유자만 연다.

## 게이트② (2026-09-14)

소유자가 `검토대기` → `구현승인` 개방(세션 지시 "구현"). 개방 직전에 "이 항목만 배포해서는 체감 변화가 없고(웹 미전송),
Modal 배포는 별도 승인이며, FEAT-42보다 먼저 배포돼야 한다"를 고지받았다.

앵커: 독립 패스 직후 트리 검산에서 계획서·`main.py` 불변 확인, 그 뒤 커밋은 보드 `검증:` 줄(`6a55844`)뿐 — 재검증 불요.

디스패치 시 담당에게 알릴 것: 워킹트리에 커밋 보류 중인 FEAT-38 변경(`packages/db`·`apps/web` analytics·`docs/agents/main-loop/FEAT-38.md`)이
있다. backend 게이트(`unittest`·`py_compile`)와 무관하지만 `git diff --name-only`에 나타나므로 자기 수정 목록에서 제외한다.

## 인수 (2026-09-14)

backend-dev 보고: 완료, unittest 79 · py_compile 0. 인수 조건 다섯을 보고가 아니라 직접 재현했다.

| # | 조건 | 직접 본 것 |
| --- | --- | --- |
| 1 | 변경 파일 ↔ 「고칠 파일」 | `git status`에서 FEAT-41 변경 = `apps/backend/caption_style_source.py`(신규)·`test_caption_style_source.py`(신규)·`main.py`(M) — 계획서 셋과 일치. 그 밖엔 보드·백로그·`docs/agents/backend-dev/FEAT-41.md`와 디스패치 전부터 있던 FEAT-38 보류 변경뿐 |
| 2 | diff ↔ 스케치 | 신규 모듈 = 계획서 스케치 블록과 **바이트 동일**(추출 비교 `True`). `main.py` diff = 여섯 편집 그대로(import · 요청 필드+주석 · 이미지 등록 · 시그니처 말미 · 주입 줄 `select_caption_style(moment.get("caption_style"), request_caption_style, mode)` · spawn/remote 두 호출부). 테스트 12메서드가 명세 10케이스를 덮는다. **실제 테스트 파일에 돌연변이 10종**(mode 게이트 제거·폴백 모드 render·우선순위 뒤집기·키 병합·빈 dict 부재 취급·truthy·`{}` 반환·요청 무시·`mode != "analyze"`·비-dict 요청) → 전부 `FAILED` |
| 3 | 검증 명령 재실행 | `python -m unittest discover -s apps/backend -p "test_*.py"` → `Ran 79 tests ... OK` · `py_compile` EXIT 0 |
| 4 | 백로그 제거 | `git diff TASK_BACKLOG.md` = FEAT-41 블록 삭제만(Backend / Pipeline 절이 비었다) |
| 5 | 상세 기록 실재 | `docs/agents/backend-dev/FEAT-41.md` 존재. 보드 `결과` 147자 |

### 문서 인용 드리프트 — 이번엔 인수 시점에 전역 열거로 처리

`main.py` 상단에 6줄(import 1 + 요청 필드 주석·필드 5)이 들어가 그 아래 인용이 +6 밀렸다. FEAT-43 교훈대로 `main\.py:\d+`를
살아 있는 문서 전역에서 열거하고, 새 줄번호는 **오프셋 계산이 아니라 앵커 grep으로** 확정했다.

- `apps/backend/CLAUDE.md` 10곳: `116-117`(MAX/MIN) · `85`(이미지 등록) · `164`(`resolve_caption_style`) · `298-304`/`414-420`(언어별 기본값 블록) ·
  `367`/`562`(폰트) · `140-144`(ALIGNMENT) · `147-150`(MARGINV) · `1046-1048`(analyze 페이로드) · `1124-1126`(clip_result). 같은 편집에서
  `caption_style_source.py`의 선택 규칙(클립 스타일 우선, auto만 요청 스냅샷, render 부재 = 언어 기본값) 한 줄 추가.
- `apps/web/CLAUDE.md:77` `288-346` → `294-352`(`def create_subtitles_with_ffmpeg`·마지막 `subtitles.append`).
- `docs/release-checks.md` FEAT-36 후속 (a) `main.py:756` → `762`(`vertical_mp4_path`).
- 미교정(FEAT-44 범위): 에이전트 정의 인용 · 백로그 FEAT-44 관측의 줄번호(줄 내용 동반 인용이라 재탐색 가능).

치환은 스크립트로 했고 각 원문이 파일에 정확히 1회인지 단언한 뒤 바꿨다(줄끝 보존).

### 배포 확인 원장 등재

`docs/release-checks.md` 최상단에 FEAT-41 절 — ① 배포 컨테이너 import + 기존 렌더 불변(지금 확인 가능), ② auto가 요청 스냅샷으로
렌더(FEAT-42 뒤), ③ render의 스타일 없는 클립이 언어 기본값(FEAT-42 뒤, 소유자 결정 위반 감시). `〔auto〕` 없음.

## 배포 (2026-09-15)

소유자가 FEAT-39 인수 뒤 "배포 수행"으로 지시 — 웹(`main` 합류, PR #118)과 함께 백엔드 FEAT-41을 메인 루프가 배포했다.

- 사전 확인
  - `python -m unittest discover -s apps/backend -p "test_*.py"` → `Ran 79 tests … OK` · `python -m py_compile apps/backend/main.py` 0.
  - venv `C:\Users\hamso\venvs\apch-backend`의 `python -m modal --version` → 1.2.1 · `modal app list` → `ai-podcast-clipper` `deployed`.
  - 워킹트리 `apps/backend` 청결, 로컬 `dev` = `origin/dev`(FEAT-41 커밋 `d640ab6` 포함).
- 배포: `PYTHONUTF8=1 …\python.exe -m modal deploy main.py`(cwd `apps/backend`, 23:59:54 시작) → `✓ App deployed in 6.660s!`, EXIT 0.
  마운트 `PythonPackage:s3_upload_policy, translation_fallback, temp_cleanup_policy, error_callback, moment_prompt, caption_style_source`.
  엔드포인트 URL 불변(`https://sangeok--ai-podcast-clipper-process-video.modal.run`).
- import 실측: 잘못된 토큰으로 `process_video`에 POST.
  - 첫 시도(00:01:32)는 바디에 필수 필드 `clip_count`(`main.py:51` `    clip_count: int`)를 빠뜨려 **422** — 요청 검증에서 막혀 토큰 판정까지 가지 않았으므로 import 증거로 쓰지 않았다.
  - 바디를 고쳐 재시도(00:02:04) → **401** `{"detail":"Incorrect bearer token"}`. 부작용 없음(spawn 전 거부).
  - `modal container list` → 활성 컨테이너 1, 시작 00:01(배포 이후).
  - 원장 FEAT-41 첫 줄 아래에 이 증거를 적었다. 줄은 「배포 뒤 첫 실제 처리의 캡션이 이전과 같은가」가 남아 열린 채다.
- 되돌리기 경로(미사용): FEAT-41 이전 `main.py`(커밋 `e511fe7`, FEAT-43 상태)로 재배포.
