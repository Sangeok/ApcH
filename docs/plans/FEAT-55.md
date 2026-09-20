# FEAT-55: FEAT-52 뒤 죽는 클립별 캡션 스타일 경로 제거

agent: backend-dev

## 현재 동작

- 클립에 넘길 `caption_style` 소스는 순수 모듈이 고른다 — `caption_style_source.py:12` `def select_caption_style(moment_style, request_style):`. 로직 셋: `:31-32` `if isinstance(moment_style, dict): return moment_style`(클립별 스타일 우선), `:33-34` `if isinstance(request_style, dict): return request_style`(요청 스냅샷 폴백, auto·render 공통 — FEAT-51이 mode 게이트 제거), `:35` `return None`.
- 호출부는 한 곳뿐(전수 grep 확인) — `main.py:1169` `caption_style=select_caption_style(moment.get("caption_style"), request_caption_style),`. 이 호출은 클립 루프 `main.py:1155` `for index, moment in enumerate(validated_moments[:clip_count]):` 안에 있고, 그 루프는 `main.py:1111` `else:`(analyze가 아닌 경로 = auto·render 공유) 아래다. analyze(`main.py:1045` 부근 `if mode == "analyze":`)는 클립을 렌더하지 않아 이 함수에 닿지 않는다.
- render 모드는 웹이 돌려준 moment의 클립별 스타일을 `validate_moments`에 실어 통과시킨다 — `main.py:1113` `if mode == "render":` 아래 조립 dict의 `main.py:1123` `"caption_style": m.get("caption_style"),`. `validate_moments`(`main.py:128-144`)는 start/end·길이·영상 범위만 걸러내고 moment dict를 통째로 `main.py:143` `validated.append(moment)`한다 — `caption_style` 키를 읽거나 화이트리스트하지 않는다. 이 키가 있어야 `:1169`의 `moment.get("caption_style")`이 웹이 보낸 클립별 스타일을 본다.
- moments 요청 바디의 모양을 못박은 주석이 `caption_style`을 서술한다 — `main.py:62-64`, 그중 `main.py:64` `#   "caption_style": {"position": str, "fontSize": int|None, "color": str|None, "maxWordsPerLine": int|None} | None}]`.
- 요청 단위 스냅샷 필드와 그 위 주석은 여전히 "클립별 스타일이 있으면 그것이 우선"을 계약으로 못박는다 — `main.py:72-76`, 그중 `main.py:74` `    # 클립별 스타일이 있으면 그것이 우선(FEAT-52 배포 전 웹이 여전히 보낸다).`, 필드는 `main.py:76` `    caption_style: dict | None = None`.
- `select_caption_style`이 None을 반환하면 언어 기본값으로 접히는 곳은 `resolve_caption_style`이다 — `main.py:172` `def resolve_caption_style(caption_style, ...)`가 `main.py:177` `    style = caption_style if isinstance(caption_style, dict) else {}`로 dict가 아닌 입력을 조용히 `{}`(=언어 기본값)로 떨어뜨린다. 즉 **dict인지 판정하는 타입 가드가 이미 resolve_caption_style에 있다.**
- 모듈은 Modal 이미지에 등록돼 있다 — `main.py:45` `from caption_style_source import select_caption_style`, `main.py:93` `.add_local_python_source(... "caption_style_source", ...)`.
- 순수 모듈 테스트는 `main.py`를 import하지 않고 모듈만 import한다 — `test_caption_style_source.py:10` `from caption_style_source import select_caption_style`. 현재 8케이스이며 전부 2-인자(`moment_style, request_style`) 시그니처로 작성돼 있다.
- **착수 시점 기준선(실측)**: `PYTHONUTF8=1 python -m unittest discover -s apps/backend -p "test_*.py"` → `Ran 113 tests ... OK`.

## 문제

FEAT-51은 클립별 우선순위(`moment_style`)를 **의도적으로 남겼다** — 전이 구간에 웹이 여전히 클립별 스타일을 보내는 동안 render 회귀를 0으로 유지하기 위해서였다(`caption_style_source.py:27-29` 독스트링, `docs/plans/FEAT-51.md` 「대안」·「범위 밖 의존」이 "별도 후속 항목이며 FEAT-51에서는 하지 않는다"로 명시적으로 미뤘다). 그 전제는 이제 사라졌다 — FEAT-52가 배포돼 웹이 `ClipDraft.captionStyle`을 끊었고, FEAT-53이 DB 컬럼까지 제거했다(둘 다 2026-09-19 완료). 그래서 render 조립의 `m.get("caption_style")`(`main.py:1123`)과 auto의 Gemini moment는 둘 다 `caption_style` 키를 갖지 않아, `moment.get("caption_style")`(`main.py:1169`)은 영구히 `None`이다.

따라서 `select_caption_style`의 `moment_style` 인자·우선순위(`caption_style_source.py:31-32`), render 조립의 moment `caption_style` 키(`main.py:1123`), moments 주석의 `caption_style` 서술(`main.py:64`)은 죽은 코드다. 죽은 채 남으면 계약 문서(주석·시그니처)가 "클립별 스타일이 존재한다"는 잘못된 인상을 계속 준다 — 백로그 FEAT-55 `source`가 지목한 문제 그대로다.

이 변경은 **동작 무변경**이다: `moment.get("caption_style")`이 이미 항상 `None`이므로, 그 인자를 지워도 render·auto 클립이 받는 `caption_style`은 지금과 같다(요청 스냅샷 dict면 그것, 아니면 언어 기본값).

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `apps/backend/caption_style_source.py` | `select_caption_style`을 1-인자 `select_caption_style(request_style)`로 축소 — `moment_style` 인자와 그 우선순위 분기(`:31-32`)를 제거한다. 남는 규칙: request_style이 dict면 그것, 아니면 None. 모듈·함수 독스트링을 새 계약(클립별 경로 소멸)으로 다시 쓴다. **모듈은 유지한다**(「대안」 (A) 채택) |
| `apps/backend/test_caption_style_source.py` | 1-인자 새 계약으로 케이스를 다시 쓴다(8→4). 「테스트」 목록 참조. **모듈 독스트링(`:1-6`)도 함께 고친다** — 지금 문장이 FEAT-51 계약(`moment 스타일 우선, 없으면 요청 단위 스냅샷으로 폴백`)을 서술하므로 그대로 두면 거짓이 된다 |
| `apps/backend/main.py` | ① 호출부 `:1169`에서 `moment.get("caption_style")` 인자를 뺀다(1-인자 호출). ② render 조립의 moment `caption_style` 키 `:1123`을 삭제한다. ③ moments 주석 `:62-64`에서 `caption_style` 서술 줄을 제거한다. ④ `ProcessVideoRequest.caption_style` 위 주석 `:72-75`에서 "클립별 스타일이 있으면 그것이 우선" 서술을 제거하고 요청 스냅샷 단일 소스로 갱신한다. **`:45` import·`:93` add_local_python_source·`:172-177` resolve_caption_style은 무변경** |

여기 적히지 않은 파일은 구현 단계에서 고치지 않는다. `apps/backend/CLAUDE.md:139`는 이 변경으로 낡지만 읽기 전용 지시 문서라 내가 고치지 않는다(「범위 밖 의존」).

## 구현 스케치

### `apps/backend/caption_style_source.py` (전체 교체)

```python
"""클립에 적용할 caption_style 소스 선택 — 순수 로직 (stdlib만).

_do_process_video의 클립 루프(auto·render 공통)가 이 함수로 "어느 caption_style
객체를 process_clip에 넘길지"를 고른다. FEAT-55 이후 소스는 요청 단위 스냅샷
하나뿐이다 — 클립별 스타일 경로는 FEAT-52 배포로 사라졌다(웹이 더는 보내지 않고
ClipDraft.captionStyle 컬럼도 FEAT-53이 제거). 언어 기본값 단계는 여기서 다루지
않는다 — None을 반환하면 main.py의 resolve_caption_style(None)이 언어 기본값으로
접는다. network·GPU·파일·pysubs2에 닿지 않는다.

backend-purity-contract: stdlib-only; torch/boto3/cv2/pysubs2/modal forbidden
"""


def select_caption_style(request_style):
    """클립에 넘길 caption_style 객체를 고른다.

    - request_style이 dict면 그것 — 업로드 시점 요청 스냅샷을 그대로 쓴다.
      빈 dict {}도 "존재하는 스타일"로 보아 반환한다.
    - dict가 아니면(None·문자열·리스트 등) None → resolve_caption_style이
      언어 기본값으로 접는다.

    auto·render 모두 같다. 과거 클립별 우선순위(moment_style)는 FEAT-55에서
    제거했다 — FEAT-52 배포로 웹이 클립별 스타일을 더는 보내지 않는다.
    """
    if isinstance(request_style, dict):
        return request_style
    return None
```

**동작 무변경 근거**: 구 함수 `select_caption_style(moment.get("caption_style"), request_caption_style)`에서 `moment.get("caption_style")`은 auto·render 모두 이미 항상 `None`이다(auto의 Gemini moment는 그 키가 없고, render 조립의 `m.get("caption_style")`도 FEAT-52 배포 뒤 항상 None). 그래서 구 함수는 첫 분기를 건너뛰고 곧장 `request_style`을 검사했다 — 신 함수 `select_caption_style(request_caption_style)`와 결과가 동일하다(request dict면 request, 빈 dict면 빈 dict, 아니면 None).

### `apps/backend/main.py`

moments 주석 — before(`:62-64`):

```python
    # render 모드 전용: [{"index": int, "start": float, "end": float, "type": str|None,
    #   "hook": str|None, "payoff": str|None,
    #   "caption_style": {"position": str, "fontSize": int|None, "color": str|None, "maxWordsPerLine": int|None} | None}]
```

after (`caption_style` 서술 제거, payoff에서 dict를 닫는다):

```python
    # render 모드 전용: [{"index": int, "start": float, "end": float, "type": str|None,
    #   "hook": str|None, "payoff": str|None}]
```

`ProcessVideoRequest.caption_style` 주석 — before(`:72-75`):

```python
    # 요청 단위 캡션 스타일 스냅샷(업로드 시점). auto·render 공통 폴백이다(FEAT-51) —
    # 클립별 caption_style이 없으면 이 값이 언어 기본값 위에 얹힌다.
    # 클립별 스타일이 있으면 그것이 우선(FEAT-52 배포 전 웹이 여전히 보낸다).
    # 선택·기본 None → 웹이 안 보내면 언어 기본값(기존 동작과 동일).
    caption_style: dict | None = None
```

after (요청 스냅샷 단일 소스로 갱신):

```python
    # 요청 단위 캡션 스타일 스냅샷(업로드 시점). auto·render 공통 폴백이다(FEAT-51/55) —
    # 이 값이 dict면 언어 기본값 위에 얹히고, 아니면 언어 기본값(기존 동작과 동일).
    # 선택·기본 None → 웹이 안 보내면 언어 기본값. 클립별 스타일 경로는 FEAT-52로 사라졌다.
    caption_style: dict | None = None
```

render 조립 moment 키 — before(`:1117-1125`):

```python
                            {
                                "start": m.get("start"),
                                "end": m.get("end"),
                                "type": m.get("type"),
                                "hook": m.get("hook"),
                                "payoff": m.get("payoff"),
                                "caption_style": m.get("caption_style"),
                            }
                            for m in (moments or [])
```

after (`caption_style` 키 삭제):

```python
                            {
                                "start": m.get("start"),
                                "end": m.get("end"),
                                "type": m.get("type"),
                                "hook": m.get("hook"),
                                "payoff": m.get("payoff"),
                            }
                            for m in (moments or [])
```

호출부 — before(`:1169`):

```python
                        caption_style=select_caption_style(moment.get("caption_style"), request_caption_style),
```

after (1-인자 호출):

```python
                        caption_style=select_caption_style(request_caption_style),
```

## 테스트

- **덮는 것** (`apps/backend/test_caption_style_source.py`, `unittest.TestCase`, `main.py` import 없음 — 선례 `test_caption_style_source.py:10`). 1-인자 시그니처 `select_caption_style(request_style)`로 전체를 다시 쓴다. 4 케이스:
  1. `test_dict_request_is_returned` — request dict(`{"fontSize": 200, "color": "#00FF00"}`) → 통째 반환(`assertIs` 동일 객체). 요청 스냅샷을 그대로 쓴다.
  2. `test_none_is_none` — request `None` → `None`. 웹이 안 보내면 언어 기본값(하위 호환).
  3. `test_empty_dict_is_returned` — request `{}` → `{}` 반환(`assertIs`). 빈 dict는 "존재하는 스타일"이라 None으로 안 떨어짐(경계 보존 — 구 케이스 8과 대칭).
  4. `test_non_dict_is_none` — request 비-dict(`"not-a-dict"`, `["y"]`를 `subTest`) → `None`. dict가 아니면 없는 것으로 봄.

  **구 8케이스 전수 매핑**(여집합 없이):

  | 구 케이스 | 새 케이스 |
  | --- | --- |
  | 1 `test_moment_style_wins_over_request` | 소멸 — 우선순위 자체가 사라짐 |
  | 2 `test_moment_none_falls_back_to_request` | 1 `test_dict_request_is_returned`로 접힘 |
  | 3 `test_both_none_is_none` | 2 `test_none_is_none`으로 접힘 |
  | 4 `test_empty_dict_moment_is_kept` | 소멸 — moment 쪽 빈 dict 경계가 사라짐 |
  | 5 `test_non_dict_moment_falls_back_to_request` | 1로 접힘(비-dict moment 축이 사라짐) |
  | 6 `test_both_non_dict_is_none` | 4 `test_non_dict_is_none`으로 접힘 |
  | 7 `test_moment_dict_request_none` | 소멸 — moment 축이 사라짐 |
  | 8 `test_request_empty_dict_is_returned` | 3 `test_empty_dict_is_returned`로 접힘 |

  소멸 3 · 접힘 5 → 새 4케이스. 순 감소 **8→4**. 새 4케이스는 1-인자 함수의 입력 공간을
  **dict / 빈 dict / None / 비-dict**로 분할해 덮으므로 여집합이 없다.

  **게이트와 기대값**: `PYTHONUTF8=1 python -m unittest discover -s apps/backend -p "test_*.py"`. 착수 기준선은 실측 `Ran 113 tests ... OK`이고, 이 모듈이 8→4로 줄므로 구현 후 기대값은 **`Ran 109 tests ... OK`**다. 다른 숫자가 나오면 이 계획 밖의 무언가가 함께 바뀐 것이므로 멈추고 원인을 밝힌다. `python -m py_compile apps/backend/main.py`도 통과해야 한다. (`PYTHONUTF8=1`은 이 머신의 요구 — 없으면 한글 출력이 cp949로 크래시한다.)

- **못 덮는 범위**:
  - `main.py:1169`·`:1123`·`:62-64`·`:72-75` 편집의 실배선 — `main.py`가 `whisperx`→`torch`를 import해 unittest 러너로 안 돈다. `py_compile` + `git diff`로만 확인한다.
  - 실렌더 자막 모양 — 사용자가 설정한 스타일이 실제 `.mp4` 자막에 나타나는지는 GPU·ffmpeg·pysubs2 렌더라 러너가 판정하지 못한다. 다만 이 변경은 **동작 무변경**이라 확인의 성격은 "회귀 없음"(auto·render 클립이 이전과 같은 자막을 낸다)이다. 배포 후 실물 확인은 사용자 몫(`modal run`/`modal deploy`).

## 범위 밖 의존

- **`apps/backend/CLAUDE.md:139` 문서 드리프트** — 그 줄은 `select_caption_style`의 클립별 우선순위(`the clip's own style wins when present ... moment_style and its priority stay only to keep the transition window regression-free`)를 서술하는데, FEAT-55가 `moment_style`을 제거하면 거짓이 된다. `apps/backend/CLAUDE.md`는 이 에이전트의 **읽기 전용 지시 문서**라 내가 고치지 않는다 — 구현 보고 `비고:`에 적고, 인수 시 메인 루프가 갱신한다(FEAT-43·FEAT-51 전례).
- **배포·실행 검증은 사용자 몫** — `modal run`/`modal deploy`는 L40S GPU·프로덕션 S3·Gemini를 쓰므로 이 에이전트가 실행하지 않는다. 이 머신에서 `modal deploy`는 `PYTHONUTF8=1` 필요(cp949 크래시). **FEAT-51과 달리 배포 순서 제약이 없다** — 이 변경은 동작 무변경이고 선행(FEAT-52 배포·FEAT-53 DB)이 이미 섰으므로, 언제 배포해도 회귀가 없다.

없는 것 외에는 담당 범위(`apps/backend`, 단 `asd/`·`requirements.txt`·`CLAUDE.md` 제외) 안에서 완결된다.

## 대안

- **(A) 함수 1-인자 축소 + 모듈 유지 — 채택.** `moment_style` 인자·우선순위만 제거하고 순수 모듈 `caption_style_source.py`는 그대로 둔다.
  - **FEAT-51 (B) 기각 근거 재판정(백로그 요구 ②)**: FEAT-51은 (B)(모듈째 제거·`main.py` 인라인)를 두 근거로 기각했다 — (i) `main.py`가 `whisperx`→`torch`라 stdlib 러너로 안 돌아 인라인하면 B-5 커버리지를 잃고, (ii) 조용한 폴백 로직은 순수 모듈로 검증해야 한다. 인자를 하나로 줄인 지금도 (i)는 그대로 유효하다(`main.py`는 여전히 untestable). (ii)는 **약해졌다** — 지우는 것은 다중 소스 우선순위(비자명한 결정)이고, 남는 것은 `isinstance(x, dict)` 타입 가드 한 줄이며 그것은 `resolve_caption_style`(`main.py:177`)에 이미 중복돼 있다. 즉 1-인자 `select_caption_style`은 사실상 resolve의 가드와 기능적으로 겹친다.
  - **그럼에도 (A)를 고르는 이유**: ① `resolve_caption_style`의 그 가드는 `main.py` 안이라 **테스트되지 않는다** — CLAUDE.md가 명시적으로 위험으로 지목한 "잘못된 입력을 조용히 기본값으로 떨어뜨림"(`resolve_caption_style`)의 유일한 테스트 커버 사본이 이 순수 모듈이다. ② (B)는 `main.py:93` `add_local_python_source`에서 `"caption_style_source"` 항목을 지워야 하는데, `test_modal_image_sources.py`는 **imports⊆registered만** 검사하고 registered⊆imports는 검사하지 않는다(`:24` `self.assertEqual(local - registered, set())`) — 모듈을 지우고 등록을 남기거나 순서를 틀리면 로컬 게이트를 통과하고 **배포 컨테이너 시작에서만** 죽는다(CLAUDE.md가 경고하는 바로 그 무증상 실패). 동작 무변경·비긴급 정리에 그 배포 시점 리스크를 감수할 이유가 없다. ③ 형제 순수 모듈(`moment_prompt`·`reference_translation`·`temp_cleanup_policy`·`s3_upload_policy`) 패턴과 일관되고, 「고칠 파일」이 3파일로 최소화돼 회귀 면이 작다.
- **(B) 모듈째 제거 + `main.py` 인라인(`caption_style=request_caption_style` 직접 전달) — 기각.** DRY 관점의 매력(중복 isinstance 제거)은 FEAT-51 때보다 커졌으나, 위 (A) 이유 ①②로 상쇄된다 — 테스트되는 유일한 사본을 잃고, `add_local_python_source` 편집이 배포 시점 무증상 실패를 새로 연다. 이득은 파일 하나·import 한 줄·등록 한 항목뿐이라 리스크에 못 미친다.
- **`moment_style` 인자를 유지 — 기각.** FEAT-51이 남긴 이유(전이 구간 웹이 클립별 스타일을 보냄)는 FEAT-52 배포·FEAT-53 DB 적용으로 소멸했다. `moment.get("caption_style")`이 영구히 None이므로 인자·우선순위는 죽은 코드다 — 백로그 요구 ①대로 제거한다.
