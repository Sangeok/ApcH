# FEAT-51: `render` 모드도 요청 단위 캡션 스냅샷으로 폴백

agent: backend-dev

## 현재 동작

- 클립에 넘길 `caption_style` 소스는 순수 모듈 `caption_style_source.py`의 `select_caption_style`이 고른다 — `caption_style_source.py:15` `def select_caption_style(moment_style, request_style, mode):`. 로직은 셋이다: `:29-30` `if isinstance(moment_style, dict): return moment_style`(클립별 스타일 우선), `:31-32` `if mode == REQUEST_STYLE_FALLBACK_MODE and isinstance(request_style, dict): return request_style`, `:33` `return None`. 요청 스냅샷 폴백은 `:12` `REQUEST_STYLE_FALLBACK_MODE = "auto"` 때문에 **`auto` 모드에서만** 열린다.
- 그래서 `render`에서 moment 스타일이 없으면 `select_caption_style`이 `None`을 반환하고, `main.py:172` `def resolve_caption_style(caption_style, ...)`가 `main.py:177` `style = caption_style if isinstance(caption_style, dict) else {}`로 그것을 언어 기본값으로 접는다.
- 그 auto-only 게이트의 이유는 모듈 독스트링에 있다 — `caption_style_source.py:26` `여기서 요청 스냅샷으로 떨어뜨리면 미리보기≠실렌더가 된다(2026-09-14 소유자 결정).`
- 호출부는 정확히 한 곳이다(전수 grep 확인) — `main.py:1169` `                        caption_style=select_caption_style(moment.get("caption_style"), request_caption_style, mode),`. 이 호출은 클립 루프 `main.py:1155` `for index, moment in enumerate(validated_moments[:clip_count]):` 안에 있고, 그 루프는 `main.py:1111` `else:`(= `analyze`가 아닌 경로) 아래라 **auto·render 두 모드가 공유**한다. `analyze`(`main.py:1045` `if mode == "analyze":`)는 클립을 렌더하지 않아 이 함수에 닿지 않는다.
- render 모드는 웹이 돌려준 moment의 클립별 스타일을 `validate_moments`로 통과시킨다 — `main.py:1113` `if mode == "render":` 아래 `main.py:1123` `                                "caption_style": m.get("caption_style"),`. 이 키가 있어야 `:1169`의 `moment.get("caption_style")`이 웹이 보낸 클립별 스타일을 본다.
- 요청 단위 스냅샷은 엔드포인트에서 워커까지 이미 배선돼 있다 — `main.py:76` `    caption_style: dict | None = None`(`ProcessVideoRequest` 필드), `main.py:1257`·`main.py:1273` `            request_caption_style=request.caption_style,`, `main.py:1000` `def _do_process_video(self, ..., request_caption_style: dict | None = None):`.
- `ProcessVideoRequest`의 그 필드 위 주석이 현재 계약을 못박고 있다 — `main.py:73` `    # auto는 moment별 caption_style이 없어 이 값이 언어 기본값 위에 얹힌다.`, `main.py:74` `    # render는 이 값을 쓰지 않는다(클립별 스타일만, 부재 = 언어 기본값).`.
- 모듈은 Modal 이미지에 이미 등록돼 있다 — `main.py:93` `.add_local_python_source(... "caption_style_source", ...)`. 이 항목은 새 모듈을 더하지 않으므로 등록은 무변경이다.
- 순수 모듈 테스트는 `test_caption_style_source.py`가 `main.py`를 import하지 않고 모듈만 import한다 — `test_caption_style_source.py:9` `from caption_style_source import select_caption_style`. 현재 12개 케이스이며 전부 3-인자(`mode` 포함) 시그니처로 작성돼 있다(`:17` `select_caption_style(moment, {"fontSize": 200}, "render")` 등).

## 문제

백로그 FEAT-51 `source`가 지목한 문제: 2026-09-14 결정("`render`는 요청 스냅샷을 쓰지 않는다")의 전제는 "검토 화면이 클립별 스타일을 미리보기로 보여준다"였다. FEAT-52가 그 미리보기와 클립별 스타일 자체를 없애므로(백로그 FEAT-52 요구 ①②) 어긋날 대상이 사라진다 — 전제가 죽으면 결정도 죽는다. 소유자가 2026-09-16 재판정했다.

코드에서 확인한 것과 어긋나지 않는다: `caption_style_source.py:31`의 `mode == REQUEST_STYLE_FALLBACK_MODE` 게이트가 render에서 요청 스냅샷 폴백을 막고, 그 결과 `main.py:1169`가 render의 스타일 없는 클립에 `None`을 넘겨 언어 기본값으로 접힌다.

이 항목은 **백엔드 절반만** 고친다 — render도 요청 스냅샷으로 폴백하게 만든다(요구 ①). 웹(FEAT-52)은 별개 항목이며 내 범위가 아니다. 배포 순서와 전이 구간 하위 호환은 아래 「범위 밖 의존」에 적는다.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `apps/backend/caption_style_source.py` | `select_caption_style`에서 `mode` 인자와 `REQUEST_STYLE_FALLBACK_MODE` 상수를 제거한다. 남는 규칙: moment_style이 dict면 그것 → request_style이 dict면 그것(모드 무관) → 아니면 None. `moment_style` 인자와 그 우선순위는 **유지**한다(전이 구간 하위 호환 — 아래 「범위 밖 의존」·「대안」). 모듈·함수 독스트링을 새 계약(2026-09-16 재판정)으로 다시 쓴다 |
| `apps/backend/test_caption_style_source.py` | 2-인자 새 계약으로 케이스 전체를 다시 쓴다(모듈 유지 — 지우지 않는다). 아래 「테스트」 목록 |
| `apps/backend/main.py` | ① 호출부 `:1169`에서 `mode` 인자를 뺀다(2-인자 호출). ② `ProcessVideoRequest.caption_style` 위 주석 `:72-75`를 새 계약(auto·render 공통 폴백)으로 갱신. **`:1123`의 moment `caption_style` 키와 `:64` moments 주석은 이번에 손대지 않는다** — 전이 구간에 웹이 보내는 클립별 스타일을 계속 받아야 하기 때문(「대안」) |

여기 적히지 않은 파일은 구현 단계에서 고치지 않는다. `main.py:93` 이미지 등록은 무변경(모듈 신설 아님), `resolve_caption_style`(`:172`)도 무변경(입력 계약 그대로 — dict면 얹고 None이면 기본값).

## 구현 스케치

### `apps/backend/caption_style_source.py` (전체 교체)

```python
"""클립에 적용할 caption_style 소스 선택 — 순수 로직 (stdlib만).

_do_process_video의 클립 루프(auto·render 공통)가 이 함수로 "어느 caption_style
객체를 process_clip에 넘길지"를 고른다. 언어 기본값 단계는 여기서 다루지 않는다 —
None을 반환하면 main.py의 resolve_caption_style(None)이 언어 기본값으로 접는다.
network·GPU·파일·pysubs2에 닿지 않는다.

backend-purity-contract: stdlib-only; torch/boto3/cv2/pysubs2/modal forbidden
"""


def select_caption_style(moment_style, request_style):
    """클립에 넘길 caption_style 객체를 **통째(객체 단위)**로 고른다. 키 병합은 하지 않는다.

    - moment_style이 dict면 그것 — 클립별 스타일이 우선이다.
    - 아니면 request_style이 dict면 그것 — 업로드 시점 요청 스냅샷으로 폴백한다.
      auto·render 모두 같다(FEAT-51: render의 auto-only 게이트 제거).
    - 둘 다 dict가 아니면 None → resolve_caption_style이 언어 기본값으로 접는다.

    빈 dict {}는 "존재하는 스타일"로 보아 그대로 반환한다(요청으로 떨어지지 않는다).

    render도 request 스냅샷으로 폴백하는 이유(2026-09-16 소유자 재판정): 앞선 2026-09-14
    결정("render는 요청 스냅샷을 안 쓴다 — 미리보기≠실렌더 방지")의 전제는 "검토 화면이
    클립별 스타일을 미리보기로 보여준다"였다. FEAT-52가 그 미리보기와 클립별 스타일을
    없애므로 어긋날 대상이 사라진다 — 전제가 죽으면 결정도 죽는다.

    moment_style 인자는 FEAT-52 배포 전까지 웹이 여전히 보내는 클립별 스타일을 존중하기
    위해 남긴다(전이 구간 회귀 0). FEAT-52 뒤에는 moment_style이 항상 None이 되어
    사실상 request 폴백만 남으므로, 그때 인자·우선순위 정리는 후속 항목이 맡는다.
    """
    if isinstance(moment_style, dict):
        return moment_style
    if isinstance(request_style, dict):
        return request_style
    return None
```

**auto 경로 무변경 근거**: auto에서는 Gemini가 만든 moment에 `caption_style` 키가 없어 `moment.get("caption_style")`이 항상 `None`이다. 새 함수는 `None`을 받으면 곧장 `request_style`을 검사한다 — 기존 `select_caption_style(None, request, "auto")`와 결과가 동일하다(request dict면 request, 아니면 None).

**render 경로 변화**: 기존 `select(moment_style, request, "render")`는 moment dict면 moment, 아니면 `mode != "auto"`라 None이었다. 새 함수는 moment dict면 moment(동일), 아니면 request dict일 때 request(**신규 폴백**), 그래도 없으면 None.

변하는 입력을 정확히 적는다(구·신 함수를 `moment_style` 6종 × `request_style` 6종 × `mode` 4종 = 144조합으로 대조한 결과, 검증 라운드 1):

- **`auto`: 144조합 중 변화 0건.** auto는 moment에 `caption_style` 키가 없어 `moment_style`이 늘 None이고, 구 함수도 그때 `request_style`을 검사했다 — 결과가 같다. 설령 auto moment에 스타일이 실려도 구·신 둘 다 첫 분기에서 moment를 반환하므로 여전히 같다.
- **`auto` 이외: `moment_style`이 dict가 아니고 `request_style`이 dict일 때 `None → request_style`** (모드당 9조합). "moment가 **없을** 때"가 아니라 "moment가 **dict가 아닐** 때"다 — 비-dict(문자열·리스트)도 폴백 대상이며, 테스트 케이스 5가 이를 덮는다.
- 그 "`auto` 이외"에 현재 **도달 가능한 모드는 `render` 하나뿐**이다. `analyze`는 클립 루프 밖에서 끝나 이 함수에 닿지 않고(`main.py:1045` `            if mode == "analyze":`), 그 밖의 값은 존재하지 않는다. 즉 관측 가능한 변화는 render뿐이며 — 이 항목의 목표 그대로다.
- **설계 귀결(의도)**: `mode` 가드를 없애므로 앞으로 클립 루프에 도달하는 모드가 추가되면 **자동으로 요청 스냅샷 폴백을 받는다.** 모드별 예외를 다시 만들지 않는 것이 이 항목의 의도다(예외가 있던 자리가 곧 FEAT-52가 지우는 전제였다). 새 모드에 다른 정책이 필요해지면 그때 명시적으로 넣는다.

### `apps/backend/main.py`

호출부 — before(`:1169`):

```python
                        caption_style=select_caption_style(moment.get("caption_style"), request_caption_style, mode),
```

after (`mode` 인자 제거):

```python
                        caption_style=select_caption_style(moment.get("caption_style"), request_caption_style),
```

`ProcessVideoRequest.caption_style` 주석 — before(`:72-75`):

```python
    # 요청 단위 캡션 스타일 스냅샷(업로드 시점). auto 모드 전용 폴백이다 —
    # auto는 moment별 caption_style이 없어 이 값이 언어 기본값 위에 얹힌다.
    # render는 이 값을 쓰지 않는다(클립별 스타일만, 부재 = 언어 기본값).
    # 선택·기본 None → 웹이 아직 안 보내면 기존 동작과 동일(FEAT-42가 auto 디스패치에 싣는다).
    caption_style: dict | None = None
```

after (auto·render 공통 폴백으로 갱신):

```python
    # 요청 단위 캡션 스타일 스냅샷(업로드 시점). auto·render 공통 폴백이다(FEAT-51) —
    # 클립별 caption_style이 없으면 이 값이 언어 기본값 위에 얹힌다.
    # 클립별 스타일이 있으면 그것이 우선(FEAT-52 배포 전 웹이 여전히 보낸다).
    # 선택·기본 None → 웹이 안 보내면 언어 기본값(기존 동작과 동일).
    caption_style: dict | None = None
```

`:64` moments 주석(`#   "caption_style": {...} | None}]`)과 `:1123` moment `caption_style` 키는 **그대로 둔다** — 전이 구간에 웹이 보내는 클립별 스타일을 계속 받아야 한다(「대안」의 이유).

## 테스트

- **덮는 것** (`apps/backend/test_caption_style_source.py`, `unittest.TestCase`, `main.py` import 없음 — 선례 `test_caption_style_source.py:9`). 2-인자 시그니처 `select_caption_style(moment_style, request_style)`로 전체를 다시 쓴다. 8 케이스:
  1. `test_moment_style_wins_over_request` — moment dict + request dict → moment 반환(`assertIs` 동일 객체), request 키가 새지 않음(`assertNotIn`). 클립별 우선.
  2. `test_moment_none_falls_back_to_request` — moment `None` + request dict → request 반환(`assertIs`). **이 항목의 핵심 신규 동작 — 모드 게이트가 사라져 render/auto 구분 없이 폴백한다.**
  3. `test_both_none_is_none` — moment `None` + request `None` → `None`. 전이 구간 하위 호환(웹이 아직 안 보내면 오늘과 동일 = 언어 기본값).
  4. `test_empty_dict_moment_is_kept` — moment `{}` + request dict → `{}` 반환(`assertIs`). 빈 dict는 "존재하는 스타일"이라 request로 안 떨어짐.
  5. `test_non_dict_moment_falls_back_to_request` — moment `"not-a-dict"`(그리고 리스트) + request dict → request 반환. 비-dict moment는 없는 것으로 봄.
  6. `test_both_non_dict_is_none` — moment `"x"` + request `["y"]` → `None`.
  7. `test_moment_dict_request_none` — moment dict + request `None` → moment 반환. request 없이도 클립별이 이김.
  8. `test_request_empty_dict_is_returned` — moment `None` + request `{}` → `{}` 반환. request 쪽 빈 dict도 "존재하는 스타일"이라 반환(None으로 안 떨어짐) — moment 쪽 경계(케이스 4)와 대칭.

  구 12케이스에 있던 `mode` 분기 중복(`_auto`/`_render` 쌍, `test_other_modes_do_not_fall_back`)은 게이트 제거로 사라지므로 접는다.

  **게이트와 기대값**: `PYTHONUTF8=1 python -m unittest discover -s apps/backend -p "test_*.py"`. 검증 라운드 1에서 실측한 **현재 기준선은 `Ran 117 tests ... OK`**이고, 이 모듈이 12→8로 줄므로 구현 후 기대값은 **`Ran 113 tests ... OK`**다. 다른 숫자가 나오면 이 계획 밖의 무언가가 함께 바뀐 것이므로 멈추고 원인을 밝힌다. (`PYTHONUTF8=1`은 이 머신의 요구다 — 없으면 한글 출력이 cp949로 크래시한다.)

  돌연변이 검사(경로 5, 라운드 1): 위 8케이스를 실행 가능하게 옮겨 제안 구현에 돌린 뒤 돌연변이 9종(우선순위 뒤집기 · `isinstance` → `is not None` · `isinstance` → truthy(moment/request 각각) · 최종 `None` → `{}` · request 폴백 삭제(구 render 회귀) · moment/request 사본 반환 · 키 병합)을 심었다. **9/9 사멸, 생존 0** — 명세에 구멍이 없다.

- **못 덮는 범위**:
  - 실렌더 자막 모양 — 사용자가 설정한 스타일이 실제 `.mp4` 자막에 나타나는지는 GPU·ffmpeg·pysubs2 렌더라 러너가 판정하지 못한다. 배포 후 실물 확인(`docs/release-checks.md` 등재 대상).
  - `main.py:1169` 호출부가 실제로 `request_caption_style`을 render 클립까지 흘리는 배선 — `main.py`가 `whisperx`→`torch`를 import해 unittest 러너로 안 돈다. `python -m py_compile apps/backend/main.py` + `git diff`로만 확인.
  - render 폴백의 **실효**는 FEAT-52(웹이 render에도 요청 스냅샷을 싣는 것)가 배포돼야 실제로 발동한다 — 그 전까지 render 요청의 `caption_style`은 `undefined`라 새 폴백 경로가 휴면 상태다. 두 항목이 다 배포된 뒤 실렌더로만 확인된다.

## 범위 밖 의존

- **배포 순서 제약 — FEAT-51이 FEAT-52보다 반드시 먼저 배포되어야 한다.** FEAT-52(웹, 다른 워크스페이스 `apps/web`)는 검토 화면의 클립별 스타일과 드래프트 시드를 없애고 render 요청에 요청 스냅샷을 싣게 만든다. 순서가 뒤집혀 웹(FEAT-52)이 먼저 배포되면, 웹은 드래프트 시드를 지워 moment에 스타일이 없어지는데 백엔드는 아직 render 폴백을 못 해(`caption_style_source.py:31`의 auto-only 게이트) 그 사이 확정되는 **모든 클립이 언어 기본값으로 렌더**되어 사용자가 설정한 스타일이 조용히 무시된다. 이 제약은 내 코드 구현을 막지 않는다(FEAT-51은 `apps/backend` 안에서 완결). 다만 배포 시퀀싱은 소유자·메인 루프가 지켜야 하며, `modal deploy`(FEAT-51) → FEAT-52 웹 배포 순서를 지킨다.
- **전이 구간 하위 호환(회귀 0) — 이 계획이 보장하는 방식.** FEAT-51 배포 후 FEAT-52 전까지 웹은 여전히 moment별 `caption_style`을 보내고(FEAT-42/50이 드래프트를 업로드 스냅샷으로 시드), render 요청의 요청 단위 `caption_style`은 `undefined`다. 이 구간에서 동작이 지금과 같으려면 두 가지를 유지해야 한다 — ① `select_caption_style`의 **moment_style 우선순위**(moment dict면 그것 반환), ② `main.py:1123`의 **moment `caption_style` 키**(이게 있어야 `moment.get("caption_style")`이 웹이 보낸 클립별 스타일을 본다). 둘 다 이번에 유지하므로: moment 스타일 있음 → 오늘처럼 그 스타일(변화 없음), moment 없음 + request `undefined` → `None` → 언어 기본값(오늘과 동일). 새 폴백은 request가 dict로 실릴 때(=FEAT-52 이후)만 발동한다. **회귀 0.**
- **`apps/backend/CLAUDE.md:139` 문서 드리프트** — 그 줄 `only in auto mode does it fall back to the request-level ... snapshot. In render, a clip without a style ... gets the language defaults`는 FEAT-51 뒤 거짓이 된다. `apps/backend/CLAUDE.md`는 이 에이전트의 **읽기 전용 지시 문서**라 내가 고치지 않는다 — 구현 보고 `비고:`에 적고, 인수 시 메인 루프가 갱신한다(FEAT-43 전례).
- **FEAT-52 이후 후속 정리(내 것이 아님)** — FEAT-52가 배포돼 웹이 클립별 스타일을 완전히 끊으면 `moment_style` 인자·우선순위, `main.py:1123` 키, `main.py:64` moments 주석은 죽은 코드가 된다. 그때 이들을 제거하는 것은 별도 후속 항목이며(백로그 후보), FEAT-51에서는 하지 않는다.
- **배포·실행 검증은 사용자 몫** — `modal run`/`modal deploy`는 L40S GPU·프로덕션 S3·Gemini를 쓰므로 이 에이전트가 실행하지 않는다. 이 머신에서 `modal deploy`는 `PYTHONUTF8=1` 필요(cp949 크래시).

## 대안

- **(A) 함수 단순화 + 모듈 유지 — 채택.** `mode`/`REQUEST_STYLE_FALLBACK_MODE`만 제거하고 순수 모듈 `caption_style_source.py`는 그대로 둔다. 이유: 선택 판단(moment vs request vs None, 빈 dict `{}`의 "존재하는 스타일" 처리)이 B-5 게이트에서 stdlib `unittest`로 덮이는 유일한 자리이고, 이 로직은 조용히 기본값으로 접히는(silent-fallback) 부류라 정확히 순수 모듈로 검증해야 하는 대상이다.
- **(B) 모듈째 제거 + `main.py`에 인라인 — 기각.** 선택 로직을 `main.py:1169` 자리에 직접 쓰면 `whisperx`→`torch` 의존 때문에 stdlib 러너로 검증 불가능해져 B-5 커버리지를 잃는다(`main.py`를 import하는 테스트는 안 돈다 — `apps/backend/CLAUDE.md:73`). 조용한 폴백 로직을 테스트 밖 껍데기로 옮기는 셈이라, 순수 모듈 계약(`reference_translation`·`moment_prompt`·`temp_cleanup_policy` 선례)에 어긋난다.
- **`moment_style` 인자를 지금 제거 — 기각.** "곧 항상 None이 되니 지금 지운다"는 유혹이 있으나, 전이 구간에는 웹이 여전히 클립별 스타일을 보내고 render 요청 스냅샷은 `undefined`다. 지금 지우면 render 클립이 그 클립별 스타일을 무시해 언어 기본값으로 떨어진다 — 회귀. FEAT-52 뒤 항상 None이 될 때 후속에서 제거한다.
- **`main.py:1123`의 moment `caption_style` 키를 지금 제거 — 기각.** 같은 이유. 이 키를 지우면 `validate_moments`가 웹이 보낸 클립별 스타일을 버려 `moment.get("caption_style")`이 항상 None이 되고, 전이 구간에 render가 언어 기본값으로 떨어진다 — 회귀. 백로그 요구 ③의 "급하지 않다"는 여기서 "지우면 안 된다(FEAT-52 전까지)"로 강해진다.
