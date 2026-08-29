# BUG-08 구현 보고 — 에러 콜백이 `clips: []`를 하드코딩해 부분 성공을 유실함

## 2026-08-29 구현 (backend-dev)

계획서 `docs/plans/BUG-08.md`(승인 계약)의 「고칠 파일」·「구현 스케치」대로 구현. 코드는 부분 `clip_results`를 에러 콜백에 싣는 backend 절반만이며, 웹 inngest 소비는 범위 밖(후속 항목).

### 고친 파일 (전수)

| 파일 | 변경 | 신규/수정 |
| --- | --- | --- |
| `apps/backend/error_callback.py` | `build_error_callback_payload(uploaded_file_id, attempt, mode, error, clip_results)` — stdlib만. `clips`에 `list(clip_results) if clip_results else []`를 실어 부분 성공 클립을 보존. `ERROR_STATUS = "error"` 리터럴 고정. | 신규 |
| `apps/backend/test_error_callback.py` | `unittest.TestCase` 9개 메서드(계획서 「테스트」 절 9단언). `error_callback`만 import, `main.py` 무접촉. | 신규 |
| `apps/backend/main.py` | (1) 순수 모듈 import 추가, (2) 이미지 체인에 `"error_callback"` 포함, (3) 포괄 except의 에러 콜백을 순수 함수 조립으로 교체. | 수정 |

### 스케치 대비 차이

- **import 위치 (`:73` 합본 관련)** — 계획서 §2 스케치는 `from translation_fallback import (...)` 블록 **바로 아래**에 `from error_callback import build_error_callback_payload`를 넣으라고 했다. 그러나 BUG-04 구현이 그 사이에 `from temp_cleanup_policy import (...)` 블록을 삽입해 둔 상태였다(계획서 §3 주석이 예고한 "먼저 구현된 쪽이 줄을 바꾼다" 상황). 순수 모듈 import를 한 묶음으로 유지하기 위해 `temp_cleanup_policy` 블록 **뒤**에 붙였다. 분기·조건·리터럴·사용자 노출 문구의 변화는 아니며 import 순서만 다르다.
- **이미지 체인 (`:73` 합본, 스케치 §3의 예고된 차이)** — 계획서 §3 before는 두 인자 형태(`"s3_upload_policy", "translation_fallback"`)였으나, BUG-04가 이미 `"temp_cleanup_policy"`를 세 번째 인자로 추가해 둔 상태(`.add_local_python_source("s3_upload_policy", "translation_fallback", "temp_cleanup_policy"))`)였다. 계획서 §3 주석("나중 구현 시 before 문자열이 달라진다 … 앞이 먼저면 세 인자 뒤에 `error_callback`을 붙인다")대로 기존 세 인자 뒤에 `"error_callback"`을 붙여 네 인자로 만들었다. 이는 계획서가 명시적으로 예고한 차이이므로 `보류` 사유가 아니다.
- **에러 콜백 조립 (§4)** — 스케치 그대로. before 블록은 BUG-04와 겹치지 않아 원문 일치로 교체됨. `clip_results` 인자는 `_do_process_video` 스코프의 기존 변수(`clip_results = []` 초기화 후 완성 클립마다 `append`)를 그대로 넘긴다.

### 검증 (실제 출력)

저장소 루트에서 맨 파이썬 실행:

```
$ python -m unittest discover -s apps/backend -p "test_*.py"
.......................................................
----------------------------------------------------------------------
Ran 55 tests in 0.001s

OK
```

`Ran 55 tests ... OK` — 기존 46 + 신규 9 = 55. `NO TESTS RAN` 아님.

```
$ python -m py_compile apps/backend/main.py
py_compile EXIT=0
```

둘 다 통과.

### 테스트가 덮은 것 (9단언)

`build_error_callback_payload`에 대해: 부분 클립 순서 보존(핵심 회귀), `[]`/`None`→빈 리스트, 얕은 복사(반환 후 원본 append 무영향), `status=="error"` 리터럴, `phase`가 `mode`(auto/render/analyze) 반영, `error` 문자열 통과, `uploadedFileId`·`attempt` 통과, 키 집합이 정확히 `{uploadedFileId, attempt, status, phase, error, clips}`.

### 못 덮은 범위 (stdlib 러너 불가 — modal run + 웹 왕복으로 사용자 확인 필요)

- 실제 `req.post` I/O와 웹훅 수신. 배포 후 확인할 것은 "에러 콜백 본문의 `clips`에 부분 클립이 실려 오는가"(웹훅 로그·`modal/video.processed` 이벤트 payload)까지다.
- `raise` 후 재시도가 같은 index S3 키를 덮어쓰는 상호작용, `isUploadedFileAttemptCurrent`의 attempt 필터.
- `clip_results` 원소의 실제 스키마가 `RawModalWebhookClip`과 맞는지 — 순수 함수는 리스트를 통과만 시키므로 원소 스키마는 이 러너로 검증되지 않는다(성공 콜백이 같은 객체를 이미 웹에 보내 호환성은 기존 경로로 입증됨).

### handoff — 필수 후속 (범위 밖, 백로그 후보)

- **web inngest가 `status: error` 페이로드의 `clips`를 소비**: `applyModalPayload`(`apps/web/src/inngest/functions.ts:479-486`)가 `!isSuccessfulModalStatus`이면 `clips`를 읽지 않고 early return한다. 실패 흐름에서 Clip 행은 웹훅 뒤 `persist-generated-clips` 스텝에서만 만들어지고, 웹훅 경로 A(`updateClipMetadataFromBackendClips`)는 그보다 먼저 돌아 0건 갱신이 된다. 따라서 backend가 부분 `clip_results`를 실어도 web이 실패 status의 `clips`를 소비하지 않는 한 사용자 가시 효과가 없다. FEAT-21(BUG-02의 web 절반) 전례와 같은 두 절반 구조 — web inngest가 `status: error`에서도 `clips`를 읽어 `backendClips`를 채워야 메타데이터 붙은 행이 생성 시점에 만들어진다. `apps/web` 계약 변경이라 backend-dev 범위 밖. 메인 루프가 인수 시 백로그 후보로 올릴 것.

### 비고

- 커밋·푸시·`modal deploy`·`modal run`은 하지 않았다(사용자 몫). 컨테이너 실행·웹 반영 검증은 `modal run`으로 사용자가 확인해야 한다.
- `asd/`·`requirements.txt`·`apps/web`·README·`apps/backend/CLAUDE.md` 무접촉.
