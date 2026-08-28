# BUG-04: 임시 디렉토리 정리가 파이프라인 성공/실패 여부와 무관하게 항상 실행됨

agent: backend-dev

## 현재 동작

`_do_process_video`(`main.py:1016`)는 실행마다 고유한 임시 디렉터리를 만들고, 끝에서 그것을 무조건 지운다.

- `main.py:1022-1024` — `run_id = str(uuid.uuid4())` → `base_dir = pathlib.Path("/tmp") / run_id` → `base_dir.mkdir(parents=True, exist_ok=True)`. **실행마다 uuid로 고유**하므로 서로 다른 호출의 임시 디렉터리는 충돌하지 않는다.
- `main.py:1025` — `video_path = base_dir / "input.mp4"`. 원본 다운로드(`main.py:1041`), 전사·크롭 산출물이 모두 `base_dir` 아래에 쌓인다.
- `main.py:1040` `try:` 본문에서 다운로드 → 전사 → 순간 식별 → `process_clip` 루프가 돈다. 성공하면 성공 콜백을 보낸다(`main.py:1189-1196`).
- `main.py:1198` `except Exception as e:` 가 모든 예외를 잡아 에러 콜백을 보내고(`:1201-1210`) `raise`(`:1213`)로 다시 던진다.
- `main.py:1215-1218` `finally:` — 성공·실패와 **무관하게** 실행된다:

  ```python
  finally:
      if base_dir.exists():
          print(f"Cleaning up temp dir after {base_dir}")
          shutil.rmtree(base_dir, ignore_errors=True)
  ```

  `ignore_errors=True`(`:1218`)라 정리 자체가 실패해도 조용히 넘어간다.

Modal 실행 모델상 이 컨테이너는 임시(serverless)이고, `process_video` 디스패처는 `min_containers=1`(`main.py:1238`), GPU 클래스도 warm 재사용된다. 즉 **한 컨테이너가 여러 호출을 처리**하므로 정리를 하지 않으면 `/tmp`가 호출마다 누적된다. 반대로 컨테이너는 사람이 셸로 들어가 열어볼 수 있는 대상이 아니다 — 프로덕션에서 실패 후 `base_dir`을 보존해도 접근 경로가 없다.

재시도 경로: 실패 시 `raise`(`:1213`)가 spawn된 Modal 호출을 실패시키고, 웹 inngest(`apps/web/src/inngest/functions.ts:286` `retries: 1`)가 재디스패치하면 `_do_process_video`가 처음부터 다시 돈다. 그때 `run_id`는 `main.py:1022`에서 **새 uuid로 다시 생성**되므로, 이전 실행의 `base_dir`을 보존했더라도 재시도가 그것을 재사용하지 않는다 — 원본 재다운로드는 어차피 새 `base_dir`에서 일어난다.

## 문제

백로그(`TASK_BACKLOG.md` BUG-04, source: README Known Issues `README.md:352` "Temporary directory cleanup regardless of success")가 지목한 한 줄에는 관측도 진단도 없다. 코드에서 확인한 실패 모드는 하나로 좁혀진다: **실패 시 `finally`(`main.py:1215-1218`)가 다운로드 원본·전사·크롭 산출물을 지워, 실패 원인을 사후 진단할 중간 산출물이 남지 않는다.**

다만 코드 증거상 이 정리는 **프로덕션 Modal에서는 옳다** — warm 컨테이너의 `/tmp` 누적을 막고(`main.py:1238` `min_containers=1`), 컨테이너에는 사람이 들어가 산출물을 열어볼 경로가 없다. 보존이 가치를 갖는 유일한 맥락은 **로컬 `modal run` 디버그**다(사용자가 실행 검증에 쓰는 경로). 재다운로드 비용 절감(백로그가 명시하진 않았으나 후보였던 실패 모드)은 코드가 뒷받침하지 않는다 — 재시도가 새 uuid `base_dir`을 쓰기 때문이다(`main.py:1022`).

그래서 이 계획은 **프로덕션 동작을 그대로 두고**(기본값: 항상 정리), 로컬 디버그에서만 켤 수 있는 opt-in 보존 스위치(`KEEP_TEMP_ON_FAILURE` 환경변수)를 더한다. 정리 여부 판단을 stdlib 순수 함수로 빼 검증 가능하게 만든다. "현재 동작이 프로덕션에선 옳다"는 판정과 "실패 진단을 위한 보존은 로컬에서 가치가 있다"는 판정을 둘 다 반영한 결정이다. README 항목 정리는 backend-dev 쓰기 범위 밖(루트 파일)이라 「범위 밖 의존」에 handoff로 적는다.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `apps/backend/temp_cleanup_policy.py` `(신규)` | 정리 여부·환경변수 파싱을 stdlib만으로 판정하는 순수 함수 |
| `apps/backend/test_temp_cleanup_policy.py` `(신규)` | 위 순수 함수의 `unittest` 케이스 |
| `apps/backend/main.py` | 순수 모듈 import + `succeeded` 플래그·`keep_temp_on_failure` 배선 + `finally`가 정책에 따라 정리/보존 + 이미지 체인에 `temp_cleanup_policy` 포함 |

여기 적히지 않은 파일은 구현 단계에서 고치지 않는다.

## 구현 스케치

### 1. 새 순수 모듈 `apps/backend/temp_cleanup_policy.py` (본문 전체)

판단(정리할지·환경변수가 켜졌는지)은 전부 이 모듈이 한다. 파일·network·GPU에 닿지 않는다(실제 `rmtree`는 `main.py` 껍데기가 한다).

```python
"""임시 디렉터리 정리 정책 — 순수 판단 로직 (stdlib만).

_do_process_video의 finally 절이 이 함수들을 호출해 "실행 후 base_dir을 지울지"를
결정한다. 파일·network·GPU에 닿지 않는다 — 실제 rmtree는 main.py의 얇은 껍데기가 한다.

backend-purity-contract: stdlib-only; torch/boto3/cv2/pysubs2/modal forbidden
"""

# KEEP_TEMP_ON_FAILURE 환경변수가 이 값들(대소문자·앞뒤공백 무시) 중 하나면 "보존 켜짐".
_TRUTHY = frozenset({"1", "true", "yes", "on"})


def parse_keep_on_failure(env_value):
    """KEEP_TEMP_ON_FAILURE 환경변수 값을 bool로. None·비문자열·미지값·빈 문자열 → False.

    프로덕션(Modal)에서는 이 변수를 설정하지 않으므로 항상 False → 기존 '항상 정리' 동작.
    로컬 `modal run` 디버그에서만 켜서 실패 시 중간 산출물(원본·전사·크롭)을 남긴다.
    """
    if not isinstance(env_value, str):
        return False
    return env_value.strip().lower() in _TRUTHY


def should_cleanup_temp_dir(succeeded, keep_on_failure):
    """실행 후 base_dir을 rmtree할지.

    - succeeded=True  → 항상 정리(True). warm 컨테이너 재사용 시 /tmp 누적을 막는다.
    - succeeded=False → keep_on_failure가 켜졌으면 보존(False), 아니면 정리(True).
    """
    if succeeded:
        return True
    return not keep_on_failure
```

### 2. `main.py` — 순수 모듈 import (before/after)

상단 import 블록의 순수 모듈 묶음(`main.py:33-38`, `translation_fallback` import) 아래에 추가한다. (현 코드에는 `translation_fallback` import가 마지막 순수 모듈 import다.)

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
from temp_cleanup_policy import (
    parse_keep_on_failure,
    should_cleanup_temp_dir,
)
```

### 3. `main.py` — 이미지 체인에 순수 모듈 포함 (before/after)

Modal 1.x는 사이드 로컬 Python 모듈을 자동 포함하지 않는다. 컨테이너에서 `ModuleNotFoundError` 없이 import되도록 이미지 체인 끝(`main.py:73`)에 명시 포함한다.

```python
# before
    .add_local_python_source("s3_upload_policy", "translation_fallback"))
# after
    .add_local_python_source("s3_upload_policy", "translation_fallback", "temp_cleanup_policy"))
```

> 주의: `main.py:73`은 BUG-08 계획서도 같은 줄을 고친다(`error_callback` 추가). 둘 중 먼저 구현되는 쪽이 이 줄을 바꾸므로, 나중 구현 시 before 문자열이 달라진다 — 구현 단계에서 현재 코드를 다시 읽어 맞춘다.

### 4. `main.py` — `_do_process_video` 진입부에 플래그 배선 (before/after)

`clip_results = []` / `analyze_payload = None` 바로 아래(`main.py:1019-1020`)에 성공 플래그와 보존 스위치를 둔다.

```python
# before
        clip_results = []
        analyze_payload = None

        run_id = str(uuid.uuid4())
# after
        clip_results = []
        analyze_payload = None
        succeeded = False
        keep_temp_on_failure = parse_keep_on_failure(os.getenv("KEEP_TEMP_ON_FAILURE"))

        run_id = str(uuid.uuid4())
```

### 5. `main.py` — try 본문 끝에서 성공 표시 (before/after)

성공 콜백 블록(`main.py:1189-1196`)이 try 본문의 마지막이고 그 뒤 `except`(`main.py:1198`)가 온다. try 본문을 예외 없이 끝냈다는 표시를 그 사이(들여쓰기 12칸, try 본문 레벨)에 둔다. 아래 앵커의 `timeout=30)\n\n        except Exception as e:`는 성공 콜백 뒤에만 나타난다(analyze 콜백 `main.py:1119`은 뒤에 `else:`가 이어져 구분됨).

```python
# before
                        "clips": clip_results,
                    }, headers={"Authorization": f"Bearer {os.environ.get('MODAL_WEBHOOK_SECRET', '')}"}, timeout=30)

        except Exception as e:
# after
                        "clips": clip_results,
                    }, headers={"Authorization": f"Bearer {os.environ.get('MODAL_WEBHOOK_SECRET', '')}"}, timeout=30)

            succeeded = True

        except Exception as e:
```

### 6. `main.py` — `finally`가 정책에 따라 정리/보존 (before/after)

```python
# before
        finally:
            if base_dir.exists():
                print(f"Cleaning up temp dir after {base_dir}")
                shutil.rmtree(base_dir, ignore_errors=True)
# after
        finally:
            if base_dir.exists():
                if should_cleanup_temp_dir(succeeded, keep_temp_on_failure):
                    print(f"Cleaning up temp dir after {base_dir}")
                    shutil.rmtree(base_dir, ignore_errors=True)
                else:
                    print(f"Preserving temp dir for debugging after failure: {base_dir}")
```

기본값(`KEEP_TEMP_ON_FAILURE` 미설정 → `keep_temp_on_failure=False`)에서 성공·실패 모두 `should_cleanup_temp_dir`이 True를 돌려주므로 **프로덕션 동작은 지금과 바이트 동일**하다. 변수를 켰을 때만 실패 시 보존된다.

## 테스트

`apps/backend/test_temp_cleanup_policy.py` — `temp_cleanup_policy`만 import(stdlib-only, torch·boto3 불필요). `main.py`는 import하지 않는다.

**덮는 것** (약 12개 단언):

- `parse_keep_on_failure`:
  - truthy 값 → True: `"1"`, `"true"`, `"yes"`, `"on"`, 대문자 `"TRUE"`, 앞뒤 공백 `" true "`
  - falsy/미지값 → False: `""`, `"0"`, `"false"`, `"no"`, `"maybe"`
  - 비문자열 → False: `None`, `1`(int), `True`(bool은 str이 아님)
- `should_cleanup_temp_dir`:
  - `(succeeded=True, keep_on_failure=False)` → True (성공은 항상 정리)
  - `(succeeded=True, keep_on_failure=True)` → True (성공이면 스위치와 무관)
  - `(succeeded=False, keep_on_failure=False)` → True (기본: 실패도 정리 — 현 동작 보존)
  - `(succeeded=False, keep_on_failure=True)` → False (보존 켜짐 + 실패 → 보존)

**못 덮는 범위** (stdlib 러너로 확인 불가 — `modal run`으로 사용자 확인 필요):

- `finally`의 실제 `shutil.rmtree`·`base_dir.exists()` I/O와 보존 시 실제로 디렉터리가 남는지.
- `succeeded` 플래그가 try 본문 끝에서만 True가 되는 제어흐름(예외 시 False 유지) — 순수 함수 밖 `main.py` 배선이라 이 러너로 덮이지 않는다.
- `os.getenv("KEEP_TEMP_ON_FAILURE")`가 컨테이너 환경에서 읽히는지, 이미지에 `temp_cleanup_policy`가 번들돼 import되는지(`add_local_python_source` 효과).

## 범위 밖 의존

- **`README.md:349-352` "Known Issues & Limitations" 항목 정리**: `README.md`는 루트 파일이라 backend-dev 쓰기 범위 밖이다(FEAT-19 전례 = 루트 문서는 메인 루프 handoff). 이 계획 구현 후 "Temporary directory cleanup regardless of success"(`README.md:352`)는 더 이상 무조건이 아니므로(로컬 디버그에서 `KEEP_TEMP_ON_FAILURE`로 보존 가능), 메인 루프가 이 줄을 갱신하거나 제거해야 한다. 구현 단계에서 이 파일에 닿지 않는다.
- **`modal deploy`·`modal run` 검증**: 배포와 실제 실행(보존 동작 확인 포함)은 사용자만 한다. 구현은 stdlib `unittest` + `py_compile`까지만 자체 검증하고, 실패 시 보존 동작·warm 컨테이너 누적 방지는 `modal run`으로 사용자가 확인한다.

## 대안

- **코드 변경 0 + README 항목 정리만**(현재 동작이 옳다고 결론): 프로덕션에서 정리는 실제로 옳다는 코드 증거가 있어 이 결론도 유효하다. 그러나 사용자가 실행 검증에 쓰는 로컬 `modal run`에서 실패 진단 산출물이 사라지는 실질 손실이 남고, 검증 가능한 순수 정책이라는 backend-dev 산출물도 없다. opt-in 스위치는 프로덕션 동작을 바꾸지 않으면서(기본값 동일) 이 손실만 해소하므로 채택. README 정리는 어느 쪽이든 필요하다.
- **실패 시 S3에 진단 번들 업로드**: 컨테이너가 임시라 보존이 의미를 가지려면 산출물을 컨테이너 밖(S3)으로 올려야 프로덕션에서도 사후 진단이 가능하다. 그러나 (1) S3 쓰기·스토리지 비용 증가, (2) 무엇을 얼마나 올릴지·만료 규칙 등 범위가 크게 넓어짐, (3) 원본 영상은 이미 소스 S3에 있어 재다운로드로 대부분 재현 가능. 비용 대비 이득이 낮아 기각.
- **`try/finally`를 없애고 정리를 성공 경로에만 두기**: `finally`를 제거하고 성공 후에만 `rmtree`하면 실패 시 항상 보존된다. 그러나 프로덕션 warm 컨테이너에서 실패가 반복되면 `/tmp`가 무한 누적돼 디스크가 찬다 — 접근 불가한 산출물을 위해 프로덕션 안정성을 깨는 셈이라 기각. 보존은 환경변수로 명시 opt-in할 때만 켠다.
