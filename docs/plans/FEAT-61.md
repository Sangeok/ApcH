# FEAT-61: 캡션 세로 위치를 프리셋 셋이 아니라 사용자가 정한 값으로 렌더한다

agent: backend-dev

## 현재 동작

캡션 세로 위치는 `position` enum(top/middle/bottom) 하나로만 정해지고, 사용자가 자유 여백을 줄 통로가 없다.

- 요청 모델은 `main.py:82` `    caption_style: dict | None = None` — pydantic `dict` 타입이라 스키마 밖 키도 거르지 않고 그대로 들어온다. 새 키 `marginV`는 지금도 거부 없이 들어오지만 아무도 읽지 않아 조용히 버려진다.
- 이 dict는 손대지 않고 끝까지 흐른다: `_do_process_video(..., request_caption_style=request.caption_style)`(`main.py:1315`·`:1332`) → `process_clip(..., caption_style=select_caption_style(request_caption_style), ...)`(`:1220`) → `create_subtitles_with_ffmpeg(..., caption_style=caption_style)`(`:892`) / `create_korean_subtitles_with_ffmpeg(..., caption_style=caption_style)`(`:907`) → `resolve_caption_style(caption_style, ...)`(`:355`·`:471`). 중간에 키를 거르는 곳은 없다.
- `resolve_caption_style`가 위치를 해석한다. `main.py:186` `    position = style.get("position")`가 enum만 읽고, `:187-188`이 `CAPTION_POSITION_ALIGNMENT`에 없는 값이면 `"middle"`로 접는다.
- 세로 여백은 상수표에서만 꺼낸다: `main.py:211` `        "marginv": default_marginv if position == "middle" else CAPTION_POSITION_MARGINV[position],`. 상수표는 `main.py:155` `CAPTION_POSITION_ALIGNMENT = {`(top 8 · middle 5 · bottom 2)와 `main.py:162` `CAPTION_POSITION_MARGINV = {`(top 200 · bottom 260). 이 두 dict를 **코드로 쓰는 곳은 `main.py`뿐이다**(`docs/` 밖 전 저장소 grep: `main.py:155·162·187·210·211`). 이름을 **텍스트로 가리키는** 곳은 여섯 더 있다. 넷은 계속 남는 참조다 — `apps/backend/CLAUDE.md:151`·`:152`, 그리고 웹 주석 둘 `apps/web/src/fsd/shared/config/constants.ts:77` `  MARGINV: { top: 200, bottom: 260 }, // main.py CAPTION_POSITION_MARGINV`·`apps/web/src/fsd/features/caption-style/model/caption-preview.ts:106` `// 세로 위치. top/bottom은 marginv(main.py CAPTION_POSITION_MARGINV)를 px로, middle은 중앙(둘 다 null).`. 나머지 둘은 이 항목과 FEAT-62의 백로그 `source`(`TASK_BACKLOG.md`의 FEAT-61·FEAT-62 항목)로, 각 항목이 완료될 때 담당 dev가 항목째 제거한다(`TASK_BACKLOG.md` 머리말 규칙). 상수가 `caption_position.py`로 옮겨 가면 계속 남는 넷이 낡는다(「범위 밖 의존」).
- 두 렌더 함수가 그 결과를 그대로 ASS 스타일에 싣는다: `main.py:435` `    new_style.alignment = resolved["alignment"]` / `:438` `    new_style.marginv = resolved["marginv"]`(영어), `:628` `    korean_style.alignment = resolved["alignment"]` / `:631` `    korean_style.marginv = resolved["marginv"]`(한국어).
- ASS 좌표계는 `PlayResY = 1920`(`main.py:418`·`:613`). alignment 8(top)에서 `marginv`는 위 가장자리로부터의 거리, alignment 2(bottom)에서는 아래 가장자리로부터의 거리다 — 즉 `CAPTION_POSITION_MARGINV`의 200/260은 이미 "기준 가장자리에서의 거리"다.
- 순수 모듈 등재 목록은 `main.py:100` `.add_local_python_source("s3_upload_policy", "translation_fallback", "temp_cleanup_policy", "error_callback", "moment_prompt", "caption_style_source", "reference_translation", "video_framing"))`. `test_modal_image_sources.py`가 main.py의 로컬 import와 이 목록을 대조한다.

## 문제

백로그 `source`(FEAT-61)가 지목한 것: 설정 화면에서 자막을 프리셋 버튼(top/middle/bottom)이 아니라 미리보기에서 끌어 **세로 위치를 자유값으로** 정하게 하려는데, 그 값을 받을 백엔드 통로가 없다. `resolve_caption_style`는 `position` enum만 읽고 여백은 상수표(`CAPTION_POSITION_MARGINV`, top 200 / bottom 260)에서만 꺼내므로, 사용자가 보낸 세로 여백은 조용히 버려진다(`main.py:186`·`:211`). FEAT-62(웹 드래그)가 먼저 배포되면 사용자가 끌어 놓은 위치가 프리셋 위치로 렌더되고 크레딧을 쓴 뒤에야 안다 — 그래서 **받는 쪽(이 항목)이 먼저 배포돼야 한다**(FEAT-51→FEAT-52 전례와 같은 순서).

자유 세로 위치는 "Top/Bottom 프리셋의 `marginv`를 사용자 값으로 바꾸는 것"이다 — 지금 top/bottom이 쓰는 libass 경로(alignment 8/2 + 가장자리 기준 marginv) 그대로라 새 렌더러 동작은 없다. 중앙(alignment 5)은 백로그·공유 계약대로 건드리지 않는다.

백로그와 코드의 어긋남: 없음. 백로그가 지목한 "위치는 정렬값 + 세로 여백 두 숫자뿐"이 코드에서 확인됐다.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `apps/backend/caption_position.py` `(신규)` | 위치·여백 해석을 stdlib 순수 모듈로 분리. `CAPTION_POSITION_ALIGNMENT`·`CAPTION_POSITION_MARGINV` 상수 이관 + `normalize_position`·`parse_marginv`·`resolve_position` |
| `apps/backend/test_caption_position.py` `(신규)` | 위 순수 함수의 unittest (아래 「테스트」) |
| `apps/backend/main.py` | ① `caption_position` import 추가 ② `CAPTION_POSITION_ALIGNMENT`·`CAPTION_POSITION_MARGINV` 상수 정의 제거(순수 모듈로 이관) ③ `resolve_caption_style`의 position 블록·alignment/marginv 반환을 `resolve_position` 호출로 교체 ④ `add_local_python_source`에 `"caption_position"` 등재 |

`test_modal_image_sources.py`는 **고치지 않는다** — main.py를 텍스트로 읽어 등재 누락을 자동 대조하므로, ④를 빠뜨리면 이 기존 테스트가 실패해 알려준다.

## 구현 스케치

### `apps/backend/caption_position.py` (신규, 전체 본문)

```python
"""캡션 세로 위치·마진 해석 — 순수 로직 (stdlib만).

main.py의 resolve_caption_style가 "position enum을 ASS alignment로, 그리고
사용자 marginV(세로 여백)를 기준 가장자리에서의 마진 픽셀로" 바꾸는 판단을 여기서 한다.
색 해석(pysubs2.Color)은 resolve_caption_style에 남는다 — 이 모듈은 숫자 판단만 한다.

좌표계: ASS PlayResY=1920. position이 기준 가장자리를 정한다.
  top(alignment 8)    → 위 가장자리에서 블록 위쪽까지의 marginV
  bottom(alignment 2) → 아래 가장자리에서 블록 아래쪽까지의 marginV
  middle(alignment 5) → marginV 무시, 언어 기본값 그대로 (FEAT-61이 바꾸지 않는 경로)

marginV 계약(FEAT-61 ↔ 웹 FEAT-62 공유): 정수(0~960) 또는 null. null·누락·범위 밖·
정수 아님·bool이면 CAPTION_POSITION_MARGINV 상수로 폴백한다 (렌더 실패보다 기본 위치가
낫다는 resolve_caption_style 방침 그대로).

backend-purity-contract: stdlib-only; torch/boto3/cv2/pysubs2/modal forbidden
"""

# 캡션 위치 → ASS alignment (numpad 표기). "middle"(5)이 기존 하드코딩 값.
CAPTION_POSITION_ALIGNMENT = {
    "top": 8,
    "middle": 5,
    "bottom": 2,
}

# top/bottom에서 사용자 marginV가 없을 때의 폴백 마진(px, PlayResY 1920 기준).
CAPTION_POSITION_MARGINV = {
    "top": 200,
    "bottom": 260,
}

# 사용자 marginV 허용 범위(양끝 포함). 웹 zod와 동기 계약 — 0 ~ PlayResY/2.
MARGINV_MIN = 0
MARGINV_MAX = 960


def normalize_position(value):
    """position enum을 유효값으로 정규화. 유효하지 않거나 없으면 'middle'."""
    if value in CAPTION_POSITION_ALIGNMENT:
        return value
    return "middle"


def parse_marginv(value):
    """사용자 marginV를 유효 정수로 파싱. 아니면 None.

    type(value) is int라 bool은 자동 배제된다(type(True) is int → False) — isinstance(True, int)는
    참임에 주의. float·str·None도 None으로 떨어진다. video_framing.parse_video_padding_percent와 같은 꼴.
    """
    if type(value) is int and MARGINV_MIN <= value <= MARGINV_MAX:
        return value
    return None


def resolve_position(style, *, default_marginv):
    """style dict에서 ASS alignment와 marginv를 해석한다.

    - middle: alignment 5, marginv = default_marginv (사용자 marginV 무시)
    - top/bottom: alignment 8/2, marginv = 유효한 사용자 marginV면 그 값,
      아니면 CAPTION_POSITION_MARGINV[position] 폴백

    style은 dict여야 한다(resolve_caption_style가 이미 dict로 보장해 넘긴다).
    """
    position = normalize_position(style.get("position"))
    if position == "middle":
        marginv = default_marginv
    else:
        parsed = parse_marginv(style.get("marginV"))
        marginv = CAPTION_POSITION_MARGINV[position] if parsed is None else parsed
    return {
        "alignment": CAPTION_POSITION_ALIGNMENT[position],
        "marginv": marginv,
    }
```

### `apps/backend/main.py` (변경 줄만 before/after)

① import 추가 — `main.py:45` 아래에 한 줄.

before:
```python
from caption_style_source import select_caption_style
```
after:
```python
from caption_style_source import select_caption_style
from caption_position import resolve_position
```

② 상수표 제거 — `main.py:154-165`. 두 dict 정의 블록(위 주석 포함)을 통째로 삭제한다(`caption_position.py`로 이관).

before:
```python
# 캡션 위치 → ASS alignment (numpad 표기). "middle"(5)이 기존 하드코딩 값.
CAPTION_POSITION_ALIGNMENT = {
    "top": 8,
    "middle": 5,
    "bottom": 2,
}

# top/bottom 선택 시 사용할 세로 마진 초기값. 시각 튜닝 대상 (Open Questions 참고).
CAPTION_POSITION_MARGINV = {
    "top": 200,
    "bottom": 260,
}
```
after: (삭제 — 줄 없음. 앞뒤 빈 줄(`:152-153`·`:166-167`)이 넷 겹치므로 둘만 남긴다)

③ position 블록 제거 — `main.py:186-188`.

before:
```python
    position = style.get("position")
    if position not in CAPTION_POSITION_ALIGNMENT:
        position = "middle"
```
after: (삭제 — 뒤따르는 빈 줄 `:189`도 함께 지워, `style = ...` 다음 빈 줄 `:185` 하나만 남기고 fontsize 해석으로 바로 간다)

④ 반환 교체 — `main.py:210-211`.

before:
```python
        "alignment": CAPTION_POSITION_ALIGNMENT[position],
        "marginv": default_marginv if position == "middle" else CAPTION_POSITION_MARGINV[position],
```
after:
```python
        **resolve_position(style, default_marginv=default_marginv),
```

`**resolve_position(...)`가 `alignment`·`marginv` 두 키만 펼친다 — 반환 dict의 나머지 키(fontsize·max_word·primary_color·outline·outline_color·uppercase)와 겹치지 않는다.

⑤ Modal 등재 — `main.py:100`.

before:
```python
    .add_local_python_source("s3_upload_policy", "translation_fallback", "temp_cleanup_policy", "error_callback", "moment_prompt", "caption_style_source", "reference_translation", "video_framing"))
```
after:
```python
    .add_local_python_source("s3_upload_policy", "translation_fallback", "temp_cleanup_policy", "error_callback", "moment_prompt", "caption_style_source", "reference_translation", "video_framing", "caption_position"))
```

## 테스트

- **덮는 것** (`test_caption_position.py`, stdlib `unittest`, `main.py`를 import하지 않음 — `from caption_position import ...`만):
  1. `normalize_position`: `"top"`/`"middle"`/`"bottom"` → 그대로. 유효하지 않은 값(`"left"`, `None`, `123`, `""`) → `"middle"`.
  2. `parse_marginv` 유효: 범위 안 정수(0·500·960) → 같은 값.
  3. `parse_marginv` 폴백: 범위 밖(-1·961) → None. `bool`(True·False) → None(1로 새지 않음). `float`(200.0·1.5) → None. `str`("200") → None. `None` → None.
  4. `resolve_position` middle: `position` 없음/`"middle"`/유효하지 않은 값 → `alignment` 5, `marginv == default_marginv`. **유효한 marginV를 줘도 무시**(예: `{"position":"middle","marginV":300}`, `default_marginv=165` → marginv 165). **`default_marginv`는 영어 값(165)과 한국어 값(155)을 둘 다 쓴다**(예: `{"position":"middle"}`, `default_marginv=155` → marginv 155) — 165 하나만 쓰면 middle 여백을 165로 고정한 구현이 전 케이스를 통과한다(검증 라운드 돌연변이 실측: 13마리 중 이것만 생존). 한국어 middle 스타일의 `MarginV`가 155에서 165로 바뀌어도 libass 픽셀은 같지만(「열린 질문」 1), "middle 렌더가 오늘과 바이트 동일"을 ASS 파일 수준에서 지키는 단언이다.
  5. `resolve_position` top + 유효 marginV(0·500·960) → `alignment` 8, `marginv` == 그 값.
  6. `resolve_position` bottom + 유효 marginV → `alignment` 2, `marginv` == 그 값.
  7. `resolve_position` top/bottom + 유효하지 않은/없는 marginV(누락·None·961·`True`·`120.0`) → 폴백(top 200 / bottom 260), `True`는 1이 아님을 명시 확인.
  8. 하위 호환: marginV 키 자체가 없는 기존 스냅샷 — `{"position":"top"}`→marginv 200, `{"position":"bottom"}`→260, `{}`(position 없음)→middle+`default_marginv`. 지금 동작과 동일.
  - 총 8개 이상의 `unittest` 메서드가 새로 생긴다. 기존 `test_modal_image_sources.py`는 고치지 않지만 ⑤ 등재를 자동 대조한다 — 등재를 빼면 `'caption_position'`을 짚으며 실패한다(검증 라운드 음성 시험 실측).
- **못 덮는 범위**: 컨테이너 libass의 실제 픽셀 위치(`unittest` 러너는 렌더를 하지 못한다), Modal 배포·`modal run` 실행(소유자), 웹 zod 범위(0~960)와 백엔드 상수의 동기 여부(apps/web은 담당 밖 — FEAT-62/러너 교차 확인). 메인 루프가 계획 검증에서 **로컬 ffmpeg(libass 빌드)로** alignment·marginV 거동을 실측했지만(「열린 질문」 1·2), 컨테이너의 ffmpeg·libass와는 빌드가 다르다. 배포 후 사용자 여백 값을 넣은 실렌더 1개로 소유자가 위치를 확인해야 한다.

## 범위 밖 의존

- **웹(FEAT-62, `apps/web`)**: 저장 계약(`captionStyleSchema` zod에 `marginV` 추가, nullable, **범위 0~960 동기**), 드래그/키보드 UI, 미리보기 환산, 썸네일·유효 스타일. 전부 `apps/web`이라 backend-dev 담당 밖이다 — 이 계획은 건드리지 않는다. 공유 계약(아래 키·범위·폴백)은 메인 루프가 고정했고 FEAT-62가 같은 값을 쓴다.
  - 공유 계약(메인 루프 고정, 그대로 옮김): `caption_style` dict의 새 키 `marginV`(정수 또는 null, 없으면 null과 같음). 의미 = ASS PlayResY 1920 기준 `position` 가장자리에서의 세로 여백. top→위 가장자리~블록 위쪽(alignment 8), bottom→아래 가장자리~블록 아래쪽(alignment 2), middle→무시. 허용 0~960(양끝 포함). null·누락·범위 밖·정수 아님·bool이면 `CAPTION_POSITION_MARGINV`(top 200 / bottom 260)로 폴백. 이 키 없는 기존 저장값·스냅샷은 지금과 동작 동일.
- **배포 순서**: 이 항목이 FEAT-62보다 먼저 배포돼야 한다. Modal 배포·실행 검증은 소유자 몫.
- **낡는 문서·주석(이 계획이 고치지 않는다)**: `apps/backend/CLAUDE.md:151-152`가 두 상수를 `main.py`의 것으로 설명하고 "`top` uses 200 and `bottom` uses 260"이라 적는다 — 구현 뒤에는 상수가 `caption_position.py`에 있고 top/bottom은 사용자 `marginV`로 바뀔 수 있다. backend-dev는 이 파일을 고치지 않으므로(정의 파일) **메인 루프가 인수 때 갱신한다**. 웹 주석 둘(`constants.ts:77`·`caption-preview.ts:106`, 「현재 동작」)은 `main.py CAPTION_POSITION_MARGINV`를 가리키므로 **FEAT-62가 그 주석을 고친다**.

## 대안

- **상수를 main.py에 남기고 `parse_marginv`만 순수 모듈로 빼기** — 기각. FEAT-61이 바꾸는 판단(position→marginv 분기)이 main.py에 남아 `unittest`로 못 돈다. B-5 게이트가 덮는 판단은 분기 전체여야 하므로 `resolve_position`까지 통째로 순수 모듈로 옮긴다.
- **marginV에 float 허용(`fontSize`처럼 `isinstance(.., (int,float))`)** — 기각. 공유 계약이 정수 전용이고 웹이 정수로 클램프해 보낸다(FEAT-62 ⑥). `type(x) is int`가 float·bool을 함께 배제해 계약과 정확히 일치한다.
- **middle에 `\pos` 기반 자유 위치** — 기각. 백로그·계약대로 middle은 현행 유지. alignment 5는 marginV를 쓰지 않으므로(「열린 질문」 1 실측) 중앙 기준 자유 위치에는 `\pos`가 필요한데, 그 줄바꿈 폭 거동이 미확인이라 피한다.

## 열린 질문

> 템플릿 7절 외에 이 절을 둔 것은 메인 루프(호출자)가 병행 중인 FEAT-62와 계약을 맞추려 명시 지시했기 때문이다. 공유 계약에 **반대하지 않는다** — 아래는 검증 상태 기록이다.

1. **중앙 정렬(alignment 5)이 libass에서 marginV를 쓰는가** — **쓰지 않는다(메인 루프 실측, 2026-10-14)**. 로컬 ffmpeg(`ass` 필터, libass)로 Anton·크기 122·`PlayResY 1920`·alignment 5를 marginV 0과 900으로 렌더하니, 흰 글자 경계 상자가 둘 다 `top=933 bottom=1007`로 같았다. 이 계획은 middle 분기를 현행 그대로 두므로(`marginv = default_marginv`, 사용자 marginV 무시) 어느 쪽이든 정당성은 같다. 컨테이너 libass와 빌드가 달라 배포 후 실렌더 확인은 남는다(「못 덮는 범위」).
2. **0~960 상한이 블록을 화면 안에 남기는가** — **실측으로 확인**. 허용 최대 스타일(크기 200·8단어·대문자 → 3줄, 글자 높이 500px)을 marginV 960으로 렌더하니 top(alignment 8)은 `1022~1522`, bottom(alignment 2)은 `422~922`로 양쪽 다 프레임 안이다. 계약 상한에 동의, 변경 요청 없음.
3. **top(8)/bottom(2)의 marginV가 "기준 가장자리로부터의 거리"인가** — 기존 코드와 실측으로 확인. `CAPTION_POSITION_MARGINV`의 200/260이 이미 가장자리 거리로 쓰이고 있어, 사용자 값은 그 상수의 값만 바꾼다(새 의미 없음). 거리는 글자 잉크가 아니라 **줄 상자** 끝까지다 — 크기 122에서 top 200은 글자 위끝 234, bottom 260은 글자 아래끝 1646(아래에서 274)으로, 잉크가 줄 상자보다 위로 34px·아래로 14px 안쪽에 있다. 웹 미리보기 환산(FEAT-62)이 맞춰야 할 기준이다.
