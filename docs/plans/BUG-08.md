# BUG-08: 에러 콜백이 `clips: []`를 하드코딩해 부분 성공을 유실함

agent: backend-dev

## 현재 동작

### backend (담당 범위)

`_do_process_video`(`main.py:1016`)는 클립을 하나씩 렌더하고, **끝까지 성공한 클립만** `clip_results`에 누적한다.

- `main.py:1168-1186` — `process_clip(...)`이 세로 영상·자막·S3 업로드까지 마친 뒤에야 `clip_result`에 `clipType`/`hook`/`payoff`를 붙여(`:1182-1184`) `clip_results.append(clip_result)`(`:1186`). 즉 실패 시점의 `clip_results`는 "이미 S3에 완전히 올라간 앞쪽 클립"만 담는다.
- `main.py:1189-1196` — 전 클립 성공 시 성공 콜백: `"status": "ok"`, `"clips": clip_results`(`:1195`).
- `main.py:1198` `except Exception as e:` — 클립 루프 중간(예: 뒤쪽 클립 업로드) 실패를 포함해 모든 예외를 잡는다.
- `main.py:1201-1210` — 에러 콜백을 보낸다:

  ```python
  req.post(callback_url, json={
      "uploadedFileId": uploaded_file_id,
      "attempt": attempt,
      "status": "error",
      "phase": mode,
      "error": str(e),
      "clips": [],          # main.py:1209 — 하드코딩
  }, ...)
  ```

  `"clips": []`(`:1209`)라 **이미 누적된 `clip_results`(앞쪽 성공 클립)를 버린다.**
- `main.py:1213` — `raise`로 예외를 다시 던져 Modal 호출을 실패시킨다.

### web (담당 범위 밖 — 읽기 전용 추적)

에러 콜백의 `clips: []`가 실제로 사용자에게 어떤 영향을 주는지는 웹 두 경로가 결정한다.

- **웹훅 `route.ts` (경로 A — 메타데이터 반영)**: `normalizeBody`(`apps/web/src/app/api/webhooks/modal/route.ts:200-218`)는 `clips`를 **status와 무관하게** 정규화한다(`:206-210`). 이어서 `:264-279`는 `isUploadedFileAttemptCurrent`이고 `body.clips.length > 0`이면(`:269`) `updateClipMetadataFromBackendClips`(`:271-275`)를 호출한다. 이 함수는 `updateMany`(`apps/web/src/fsd/entities/clip/api/index.ts:112-119`)로 **기존 Clip 행의 메타데이터만 갱신**한다(행을 새로 만들지 않는다). 지금은 `clips: []`라 `length > 0`이 거짓 → 이 경로가 아무 것도 안 한다.
- **inngest `functions.ts` (경로 B — 행 생성)**: 웹훅이 보낸 `modal/video.processed` 이벤트(`route.ts:252-262`)를 `applyModalPayload`(`functions.ts:471-487`)가 받는데, `!isSuccessfulModalStatus(args.status)`이면(`:479`) `backendFailureMessage`만 세우고 **`clips`를 읽지 않고 early return**(`:483`)한다. 그래서 `status: error` 콜백에서는 `backendClips`가 `undefined`로 남는다.
- **S3 폴링이 부분 클립을 구제한다(BUG-05)**: `persistGeneratedClips`(`functions.ts:183-277`)는 `findAttemptGeneratedClipKeys(outputPrefix)`로 **S3에 실제로 올라간 키를 나열**(`:200`)하고, `backendClips`에 없는 키에 대해서도 `s3Key`·`uploadedFileId`·`userId`·`processingAttempt`만 담은 **맨행(메타데이터 없음)을 생성**한다(`:236-247`). `resolveModalPollAction`이 `hasBackendFailure`면 `"failed"`를 돌려(`apps/web/src/fsd/entities/uploaded-file/model/clip-generation-outcome.ts:65-66`) 폴링 루프를 끊지만, 그 시점까지 카운트된 S3 키는 `persistGeneratedClips`가 집는다. 실패여도 `clipsFound > 0`이면 throw하지 않고 경고만 남긴다(`functions.ts:643-648`), `clipsFound === 0`일 때만 throw(`:650-652`).

정리하면 **앞쪽 클립 파일은 리포트에서 완전히 사라지지 않는다** — S3 폴링(경로 B의 맨행 생성)이 구제한다. 그러나 그 행들은 `startSeconds`·`endSeconds`·`scriptText`·`youtubeTitle`·`clipType`·`hook`·`payoff`·`subtitleStatus`가 **전부 비어 있다**(메타데이터 없이 생성됨, `functions.ts:241-246`). 그 메타데이터를 채우는 유일한 경로는 웹훅 경로 A의 `updateClipMetadataFromBackendClips`인데, 지금은 `clips: []`라 건너뛴다. 성공 콜백이 보내는 `clip_results`(`main.py:1195`)와 에러 콜백이 실을 부분 `clip_results`는 **같은 객체 모양**이라(둘 다 `process_clip` 산출물 + `clipType`/`hook`/`payoff`) `RawModalWebhookClip[]`(`route.ts:62-73`의 `clips` 필드)와 호환된다.

## 문제

백로그(`TASK_BACKLOG.md` BUG-08, source: `docs/plans/BUG-03.md:279` 「범위 밖 의존」)의 관측 — "뒤쪽 업로드 실패 시 앞쪽 클립이 리포트에서 사라지고 S3에 고아 객체만 남는다" — 은 코드 대조 결과 **절반만 맞다.** 클립 파일 자체는 웹 S3 폴링(BUG-05, `functions.ts:236-247`)이 구제해 맨행으로 남는다. **실제 유실은 파일이 아니라 그 클립의 메타데이터**다: `main.py:1209`의 `"clips": []`가 이미 완성된 앞쪽 클립의 `scriptText`·`youtubeTitle`·`clipType`·`hook`·`payoff`·`subtitleStatus`를 버려, 웹훅 경로 A(`route.ts:269`의 `updateClipMetadataFromBackendClips`)가 건너뛰고 사용자에게 제목·대본·근거 없는 빈 클립으로 남는다.

이 계획의 backend 절반은 **에러 콜백이 `clips: []` 대신 부분 `clip_results`를 싣게** 한다(`main.py:1209`). 그러면 웹훅 경로 A가 그 부분 클립의 메타데이터를 기존 맨행에 반영한다 — **웹 변경 없이 호환**(경로 A는 status와 무관하게 `clips`를 읽으므로). 페이로드 조립은 stdlib 순수 함수로 빼 "에러 콜백이 [] 대신 완성 클립을 싣는다"를 unittest로 못박는다.

부분 성공이 사용자에게 **완전히** 전달되려면(맨행 생성 시점에 메타데이터가 붙고, 부분 전달 UX·크레딧 정산이 도는) inngest `applyModalPayload`(`functions.ts:479-486`)가 `status: error`에서도 `clips`를 읽어야 하는데, 이는 `apps/web` inngest 소비 계약 변경이라 담당 범위 밖이다 — 「범위 밖 의존」에 후속 항목 후보로 적는다.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `apps/backend/error_callback.py` `(신규)` | 에러 콜백 페이로드를 stdlib만으로 조립하는 순수 함수(부분 `clip_results`를 실음) |
| `apps/backend/test_error_callback.py` `(신규)` | 위 순수 함수의 `unittest` 케이스 |
| `apps/backend/main.py` | 순수 모듈 import + 에러 콜백(`1201-1210`)을 순수 함수로 조립 + 이미지 체인에 `error_callback` 포함 |

여기 적히지 않은 파일은 구현 단계에서 고치지 않는다.

## 구현 스케치

### 1. 새 순수 모듈 `apps/backend/error_callback.py` (본문 전체)

판단(에러 콜백에 무엇을 실을지)은 이 모듈이 한다. network·boto3·GPU·파일에 닿지 않는다(실제 `req.post`는 `main.py` 껍데기가 한다).

```python
"""에러 콜백 페이로드 조립 — 순수 로직 (stdlib만).

_do_process_video의 포괄 except가 이 함수를 호출해 실패 콜백 본문을 만든다.
network·boto3·GPU·파일에 닿지 않는다.

backend-purity-contract: stdlib-only; torch/boto3/cv2/pysubs2/modal forbidden
"""

ERROR_STATUS = "error"


def build_error_callback_payload(uploaded_file_id, attempt, mode, error, clip_results):
    """실패 콜백 본문. status/error/phase는 그대로 두고, clips에는 실패 시점까지
    '끝까지 완성된' 클립(main.py의 clip_results)을 싣는다.

    clip_results는 process_clip이 세로 영상·자막·S3 업로드까지 마친 클립만 append한
    리스트(main.py:1186)라, 그대로 실으면 이미 S3에 올라간 부분 성공 클립이 리포트에 남는다.
    None이거나 비어 있으면 [] (기존 main.py:1209 동작과 동치 — 클립 루프 진입 전 실패 시).

    필드 이름은 웹 RawModalWebhookBody(route.ts:62-73)와 맞춘다 — 이미 있는 clips 필드라
    웹 변경 없이 호환. clips의 각 원소는 성공 콜백(main.py:1195)이 보내는 것과 동일 모양이다.

    반환 clips는 clip_results의 얕은 복사(list(...))라, 반환 후 clip_results를 바꿔도 안전하다.
    """
    return {
        "uploadedFileId": uploaded_file_id,
        "attempt": attempt,
        "status": ERROR_STATUS,
        "phase": mode,
        "error": error,
        "clips": list(clip_results) if clip_results else [],
    }
```

### 2. `main.py` — 순수 모듈 import (before/after)

상단 import 블록의 순수 모듈 묶음(`main.py:33-38`, `translation_fallback` import) 아래에 추가한다.

```python
# before
from translation_fallback import (
    parse_translations,
    assemble_korean_texts,
    classify_translation,
    TRANSLATION_OK,
)
# after
from translation_fallback import (
    parse_translations,
    assemble_korean_texts,
    classify_translation,
    TRANSLATION_OK,
)
from error_callback import build_error_callback_payload
```

### 3. `main.py` — 이미지 체인에 순수 모듈 포함 (before/after)

Modal 1.x는 사이드 로컬 Python 모듈을 자동 포함하지 않는다. 이미지 체인 끝(`main.py:73`)에 명시 포함한다.

```python
# before
    .add_local_python_source("s3_upload_policy", "translation_fallback"))
# after
    .add_local_python_source("s3_upload_policy", "translation_fallback", "error_callback"))
```

> 주의: `main.py:73`은 BUG-04 계획서도 같은 줄을 고친다(`temp_cleanup_policy` 추가). 둘 중 먼저 구현되는 쪽이 이 줄을 바꾸므로, 나중 구현 시 before 문자열이 달라진다 — 구현 단계에서 현재 코드를 다시 읽어 맞춘다(예: 앞이 먼저면 `"s3_upload_policy", "translation_fallback", "temp_cleanup_policy"` 뒤에 `"error_callback"`을 붙인다).

### 4. `main.py` — 에러 콜백을 순수 함수로 조립 (before/after)

`main.py:1201-1210`:

```python
# before
            if callback_url and uploaded_file_id:
                try:
                    req.post(callback_url, json={
                        "uploadedFileId": uploaded_file_id,
                        "attempt": attempt,
                        "status": "error",
                        "phase": mode,
                        "error": str(e),
                        "clips": [],
                    }, headers={"Authorization": f"Bearer {os.environ.get('MODAL_WEBHOOK_SECRET', '')}"}, timeout=30)
                except Exception as cb_err:
                    print(f"Failed to send error callback: {cb_err}")
# after
            if callback_url and uploaded_file_id:
                try:
                    req.post(callback_url, json=build_error_callback_payload(
                        uploaded_file_id=uploaded_file_id,
                        attempt=attempt,
                        mode=mode,
                        error=str(e),
                        clip_results=clip_results,
                    ), headers={"Authorization": f"Bearer {os.environ.get('MODAL_WEBHOOK_SECRET', '')}"}, timeout=30)
                except Exception as cb_err:
                    print(f"Failed to send error callback: {cb_err}")
```

`clip_results`는 `_do_process_video` 스코프에 이미 있고(`main.py:1019`에서 초기화, 클립마다 `:1186`에서 append), except 시점에 앞쪽 성공 클립만 담고 있다. 클립 루프 진입 전(다운로드·전사·analyze 실패)에는 비어 있어 `clips: []`가 되므로 그 경로의 동작은 지금과 동일하다.

## 테스트

`apps/backend/test_error_callback.py` — `error_callback`만 import(stdlib-only, torch·boto3 불필요). `main.py`는 import하지 않는다.

**덮는 것** (약 9개 단언):

- `build_error_callback_payload`:
  - `clip_results=[{...}, {...}]` → 반환 `payload["clips"]`가 그 두 원소를 **순서대로** 담음 (부분 성공 유실 방지의 핵심 회귀)
  - `clip_results=[]` → `payload["clips"] == []` (기존 `main.py:1209` 동작과 동치)
  - `clip_results=None` → `payload["clips"] == []`
  - 반환 `clips`가 입력 `clip_results`와 **다른 리스트 객체**임(얕은 복사) — 반환 후 원본을 `append`해도 payload가 안 바뀜
  - `payload["status"] == "error"` (리터럴 고정)
  - `payload["phase"]`가 전달한 `mode`를 그대로 반영 (`"auto"`, `"render"`, `"analyze"` 각각)
  - `payload["error"]`가 전달한 `error` 문자열 그대로
  - `payload["uploadedFileId"]`·`payload["attempt"]`가 인자 그대로
  - 페이로드 키 집합이 정확히 `{uploadedFileId, attempt, status, phase, error, clips}`

**못 덮는 범위** (stdlib 러너로 확인 불가 — `modal run` + 웹 왕복으로 사용자 확인 필요):

- 실제 `req.post` I/O와 웹훅 수신, 그리고 웹 경로 A(`updateClipMetadataFromBackendClips`)가 부분 클립 메타데이터를 기존 맨행에 반영하는지 — 웹훅↔inngest 타이밍 경쟁 포함.
- `raise`(`main.py:1213`) 후 재시도가 같은 index S3 키를 덮어쓰는 상호작용과 `isUploadedFileAttemptCurrent`(`route.ts:264`)의 attempt 필터.
- `clip_results` 원소의 실제 모양이 `RawModalWebhookClip`과 맞는지 — 순수 함수는 리스트를 그대로 통과시키므로 원소 스키마는 이 러너로 검증되지 않는다(성공 콜백 `main.py:1195`가 같은 객체를 이미 웹에 보내 호환성은 기존 경로로 입증됨).

## 범위 밖 의존

- **web inngest가 `status: error` 페이로드의 `clips`를 소비**(FEAT-21 전례의 후속 항목 후보): 부분 성공이 사용자에게 완전히 전달되려면 `applyModalPayload`(`apps/web/src/inngest/functions.ts:479-486`)가 실패 상태에서도 `clips`를 읽어 `backendClips`를 채워야 한다. 그래야 `persistGeneratedClips`(`functions.ts:200-266`)가 맨행이 아니라 **메타데이터 붙은 행을 생성 시점에** 만들고(웹훅 경로 A의 타이밍 경쟁 회피), 부분 성공 안내·크레딧 정산이 도는 UX가 완성된다. 이는 `apps/web` inngest 소비 계약 변경이라 담당 범위 밖 — 별도 항목으로 다뤄야 한다(구현 단계에서 이 경로에 닿으면 `보류`).
- **S3 고아 객체 삭제**: 관측의 "S3에 고아 객체만 남는다"는 절반. 실제로는 웹 S3 폴링이 그 객체를 클립으로 채택(`functions.ts:236-247`)하므로 고아가 아니게 되며, 삭제는 파괴적이라 이 계획에서 하지 않는다(기본은 안 함). 진짜 고아(재시도로 어느 attempt에도 안 붙는 키)의 수거는 별도 검토가 필요하고 backend 단독으로는 판단 근거가 부족하다.
- **`modal deploy`·`modal run` 검증**: 배포와 실제 콜백 왕복 검증은 사용자만 한다. 구현은 stdlib `unittest` + `py_compile`까지만 자체 검증하고, 컨테이너 실행·웹 반영은 `modal run`으로 사용자가 확인한다.

## 대안

- **에러 콜백에 `failedIndex`(실패 클립 인덱스) 필드 추가**: 진단에 유용할 수 있으나, 실패가 클립 루프 밖(다운로드·전사·업로드 전)에서 나면 인덱스가 모호하고, 웹 `RawModalWebhookBody`(`route.ts:62-73`)가 소비하지 않아 무시된다. 관측이 지목한 문제는 "부분 클립 유실"이지 "실패 지점 식별"이 아니므로 YAGNI로 기각. 필요해지면 별도 항목.
- **backend가 클립 루프 안에서 개별 업로드 실패를 잡아 부분 성공으로 계속 진행**: 배치 회복력은 좋아지나, 어느 클립까지 성공했는지 판정·전달 로직이 커지고 결국 웹 소비 계약(부분 성공 UX·크레딧)을 건드려 범위를 넘는다. 이 계획은 "실패는 그대로 raise하되 에러 콜백이 이미 완성된 것을 버리지 않게"만 하는 최소 변경으로 한정. 기각(위 「범위 밖 의존」).
- **웹 S3 폴링만으로 충분하다고 보고 backend 무변경**: 폴링이 클립 파일은 구제하지만 메타데이터(제목·대본·근거·자막 상태)는 못 살린다 — 그 유일한 반영 경로가 `clips: []`로 막혀 있다. backend 한 줄 변경으로 웹 변경 없이 그 경로를 여는 것이 이 계획의 핵심 가치라 기각.
