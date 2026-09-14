# FEAT-41: 렌더 요청에 요청 단위 `caption_style`을 받아 Auto 경로에도 사용자 캡션 기본값이 먹게 한다

agent: backend-dev

## 현재 동작

- `ProcessVideoRequest`(`main.py:47` `class ProcessVideoRequest(BaseModel):`)에는 요청 단위 캡션 필드가 없다. 캡션 스타일은 **moment마다** 붙는 필드로만 존재한다 — render 모드 주석(`main.py:53-55`)이 `moments` 원소의 `"caption_style"` 키를 설명하고, `moments: list[dict] | None = None`(`main.py:56`)이 그 리스트다.
- 클립 처리 루프(`main.py:1101` `for index, moment in enumerate(validated_moments[:clip_count]):`)는 render·auto 두 모드에서 함께 돈다. 캡션 스타일이 `process_clip`으로 들어가는 **유일한 주입 지점**은 `main.py:1115` `caption_style=moment.get("caption_style"),`이다.
- render 모드에서는 각 moment 딕셔너리가 `main.py:1069` `"caption_style": m.get("caption_style"),`로 요청 `moments`에서 캡션을 실어 온다. 그래서 `moment.get("caption_style")`이 검토 화면에서 편집한 클립별 스타일이 된다.
- **render 모드에서 moment 스타일 부재는 오늘 "언어 기본값"을 뜻한다.** 웹이 렌더 페이로드를 만들 때 `captionStyle`이 null인 드래프트는 키 자체를 빼고(`apps/web/src/fsd/entities/clip-draft/api/index.ts:111` `caption_style: (draft.captionStyle as CaptionStyle | null) ?? undefined,`), null 드래프트는 두 경로로 생긴다 — 커스텀 클립은 스타일 없이 만들어지고(`entities/clip-draft/api/index.ts:117-148` `createCustomClipDraft`의 `create` 데이터에 `captionStyle` 없음), 검토 다이얼로그의 「Reset style」은 null을 저장한다(`widgets/clip-draft-review/ui/_component/CaptionStyleDialog.tsx:82` `{/* 작업본만 비운다. 저장(= 언어 기본값으로 리셋)은 Apply가 한다. */}`, `:87` `onClick={() => setWorking(null)}`, `:117` `onApply(working);`, 저장 계약 `entities/clip-draft/api/index.ts:73` `// undefined = 스타일 변경 없음, null = 기본 스타일로 리셋`). 웹 검토 미리보기도 그런 클립을 언어 기본값으로 그린다.
- auto 모드에서는 moment를 Gemini가 만든다(`main.py:1078` `identify_moments(...)` → `main.py:1099` `validate_moments(clip_moments)`). 그 딕셔너리에는 `caption_style` 키가 없으므로 `main.py:1115`의 `moment.get("caption_style")`이 **항상 `None`**이 된다.
- `None`은 `process_clip`(`main.py:746`)을 거쳐 `create_subtitles_with_ffmpeg`(`main.py:826` 호출, `main.py:288` 정의) / `create_korean_subtitles_with_ffmpeg`(`main.py:841` 호출, `main.py:404` 정의)로 전달되고, 거기서 `resolve_caption_style`(`main.py:158`)이 `dict | None`을 받아 누락·범위 밖 값을 **조용히 언어 기본값으로 접는다**(`main.py:163` `style = caption_style if isinstance(caption_style, dict) else {}`). 결국 auto는 EN 122/5/1.1·KR 130/3/1.3 기본값으로만 렌더된다.
- 요청 값이 워커까지 오는 배선: `process_video` 엔드포인트(`main.py:1180`)가 `_do_process_video.spawn(...)`(`main.py:1192-1203`)·`.remote(...)`(`main.py:1207-1218`)에 명명 인자를 넘기며 `moments=request.moments`는 싣지만 요청 단위 캡션 인자는 없다. `_do_process_video` 시그니처(`main.py:950`)에도 caption 인자가 없다. `mode`는 이미 시그니처 인자라 클립 루프에서 스코프에 있다.
- analyze 모드는 `main.py:995` `if mode == "analyze":` 블록(`main.py:995-1055`)에서 `analyze_payload`를 만들고 콜백을 보낸 뒤 `main.py:1057` `else:`(render+auto)로 들어가지 않는다 — 캡션 주입 루프(`main.py:1101`)에 **도달하지 않는다**. 즉 analyze는 캡션 렌더가 없다.
- 순수 모듈 등록: `main.py`가 import하는 로컬 모듈은 전부 `add_local_python_source(...)`(`main.py:79`)에 있어야 하고, `test_modal_image_sources.py`가 그 목록을 `main.py` import와 대조한다(`test_modal_image_sources.py:16-24`). 빠뜨리면 로컬 게이트는 통과하고 배포 컨테이너만 시작 시 죽는다.

## 문제

백로그 `source`(FEAT-41)가 지목한 것: **Auto 경로는 캡션 스타일을 구조적으로 받을 수 없다.** moment가 Gemini 생성이라 웹이 그 리스트에 개입하지 못하고(관측 2), 유일한 주입 지점 `main.py:1115`가 `moment.get("caption_style")` 하나뿐이라 auto에서는 언제나 `None` → 언어 기본값으로만 렌더된다. 요구는 ① `ProcessVideoRequest`에 요청 단위 `caption_style`(선택·기본 `None`) 추가, ② 클립 루프의 주입을 폴백으로 교체, ③ 검증 로직은 불필요(`resolve_caption_style`이 이미 범위 밖 값을 접는다).

**요구 ②는 소유자 결정으로 좁혀졌다(2026-09-14, 계획 검증 라운드 1에서 제기).** 원래 백로그는 `moment.caption_style` → `request.caption_style` → 언어 기본값을 "render·auto 두 모드에 같은 식"으로 적었다. 그러나 위 「현재 동작」대로 render에서 moment 스타일 부재는 "언어 기본값"(커스텀 클립·Reset)이라, render에서도 요청 스냅샷으로 떨어뜨리면 미리보기와 실렌더가 어긋난다. 그래서 **요청 단위 스타일로의 폴백은 auto 모드 전용**이다 — render는 moment 스타일만 쓰고 없으면 언어 기본값. 백로그 FEAT-41 항목도 같은 내용으로 고쳤다.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `apps/backend/caption_style_source.py` `(신규)` | 폴백의 **소스 선택**만 담는 stdlib-only 순수 함수 `select_caption_style(moment_style, request_style, mode)`. 요청 단위 스타일은 `mode == "auto"`일 때만 쓴다. 언어 기본값 단계는 여기서 다루지 않는다(`None` 반환 → `resolve_caption_style`이 접는다) |
| `apps/backend/test_caption_style_source.py` `(신규)` | `select_caption_style` unittest — 우선순위·통째 선택·모드별 폴백·배포순서 불변·비-dict 방어 |
| `apps/backend/main.py` | ① `ProcessVideoRequest`에 `caption_style: dict \| None = None` 추가 ② import 추가 `from caption_style_source import select_caption_style` ③ `add_local_python_source(...)`(`main.py:79`)에 `"caption_style_source"` 추가 ④ `_do_process_video` 시그니처(`main.py:950`)에 `request_caption_style: dict \| None = None` 추가 ⑤ 주입 지점(`main.py:1115`)을 `select_caption_style(..., mode)`로 교체 ⑥ 엔드포인트 두 호출부(`main.py:1192-1203` `.spawn`, `main.py:1207-1218` `.remote`)에 `request_caption_style=request.caption_style` 추가 |

`resolve_caption_style`(`main.py:158`)은 손대지 않는다 — 이미 관대하고, `pysubs2.Color`를 써서 stdlib-only 순수 모듈로 뺄 수 없다(계약 위반). render 모드 moment 조립(`main.py:1069`)도 그대로 둔다 — 이미 moment별 캡션을 실어 온다.

## 구현 스케치

### `apps/backend/caption_style_source.py` (신규) — 전체

```python
"""클립에 적용할 caption_style 소스 선택 — 순수 로직 (stdlib만).

_do_process_video의 클립 루프가 이 함수로 "어느 caption_style 객체를
process_clip에 넘길지"를 고른다. 언어 기본값 단계는 여기서 다루지 않는다 —
None을 반환하면 main.py의 resolve_caption_style(None)이 언어 기본값으로 접는다.
network·GPU·파일·pysubs2에 닿지 않는다.

backend-purity-contract: stdlib-only; torch/boto3/cv2/pysubs2/modal forbidden
"""

# 요청 단위 스타일(업로드 시점 스냅샷)로 폴백하는 유일한 모드.
REQUEST_STYLE_FALLBACK_MODE = "auto"


def select_caption_style(moment_style, request_style, mode):
    """클립에 넘길 caption_style 객체를 **통째(객체 단위)**로 고른다. 키 병합은 하지 않는다.

    - moment_style이 dict면 그것 — 모드와 무관하게 클립별 스타일이 우선이다.
    - 아니면 mode가 "auto"이고 request_style이 dict일 때만 request_style.
      auto는 Gemini가 moment를 만들어 클립별 스타일이 없으므로 요청 단위 스냅샷이 유일한 입력이다.
    - 그 밖(render에서 moment 스타일 부재, 둘 다 dict 아님, 그 밖의 mode)은 None
      → resolve_caption_style이 언어 기본값으로 접는다.

    render에서 moment 스타일 부재는 "언어 기본값"을 뜻한다 — 커스텀 클립은 스타일 없이
    만들어지고 「Reset style」은 null을 저장하며, 웹 검토 미리보기도 그 클립을 언어 기본값으로
    그린다. 여기서 요청 스냅샷으로 떨어뜨리면 미리보기≠실렌더가 된다(2026-09-14 소유자 결정).
    빈 dict {}는 "존재하는 스타일"로 보아 그대로 반환한다(요청으로 떨어지지 않는다).
    """
    if isinstance(moment_style, dict):
        return moment_style
    if mode == REQUEST_STYLE_FALLBACK_MODE and isinstance(request_style, dict):
        return request_style
    return None
```

### `apps/backend/main.py` — before/after

**② import (`main.py:44` 아래에 추가)**

before:
```python
from moment_prompt import build_moment_prompt
```
after:
```python
from moment_prompt import build_moment_prompt
from caption_style_source import select_caption_style
```

**① 요청 모델 필드 (`main.py:62` 아래에 추가)**

before:
```python
    uploaded_file_id: str | None = None
```
after:
```python
    uploaded_file_id: str | None = None
    # 요청 단위 캡션 스타일 스냅샷(업로드 시점). auto 모드 전용 폴백이다 —
    # auto는 moment별 caption_style이 없어 이 값이 언어 기본값 위에 얹힌다.
    # render는 이 값을 쓰지 않는다(클립별 스타일만, 부재 = 언어 기본값).
    # 선택·기본 None → 웹이 아직 안 보내면 기존 동작과 동일(FEAT-42가 auto 디스패치에 싣는다).
    caption_style: dict | None = None
```

**③ Modal 이미지 등록 (`main.py:79`)**

before:
```python
    .add_local_python_source("s3_upload_policy", "translation_fallback", "temp_cleanup_policy", "error_callback", "moment_prompt"))
```
after:
```python
    .add_local_python_source("s3_upload_policy", "translation_fallback", "temp_cleanup_policy", "error_callback", "moment_prompt", "caption_style_source"))
```

**④ `_do_process_video` 시그니처 (`main.py:950`)**

before (말미):
```python
mode: str = "auto", moments: list | None = None, transcript_s3_key: str | None = None):
```
after:
```python
mode: str = "auto", moments: list | None = None, transcript_s3_key: str | None = None, request_caption_style: dict | None = None):
```

**⑤ 주입 지점 (`main.py:1115`)**

before:
```python
                        caption_style=moment.get("caption_style"),
```
after:
```python
                        caption_style=select_caption_style(moment.get("caption_style"), request_caption_style, mode),
```

**⑥ 엔드포인트 두 호출부 (`main.py:1201-1202`의 `.spawn`, `main.py:1216-1217`의 `.remote`)**

두 곳 모두 `transcript_s3_key=request.transcript_s3_key,` 다음 줄에 한 줄 추가:

before (각 호출부 말미):
```python
            moments=request.moments,
            transcript_s3_key=request.transcript_s3_key,
        )
```
after:
```python
            moments=request.moments,
            transcript_s3_key=request.transcript_s3_key,
            request_caption_style=request.caption_style,
        )
```

### 다섯 필수 사항 요약 (main-loop 브리핑)

1. **폴백 단위 — 통째(객체 단위) 선택, 요청 폴백은 auto 전용.** 키 병합을 하지 않는 이유: 웹 검토 미리보기(`widgets/clip-draft-review/model/caption-preview` 계약)는 클립당 **단일 스타일 객체**로 렌더하므로, moment·request를 키 단위로 섞으면 미리보기가 보여준 적 없는 키가 렌더에 섞인다. 요청 폴백을 render에서 빼는 이유: render의 moment 스타일 부재는 커스텀 클립·「Reset style」의 "언어 기본값"이고 미리보기도 그렇게 그리므로, 스냅샷으로 떨어뜨리면 미리보기≠실렌더가 된다(「현재 동작」 인용). 요청 폴백 범위는 소유자 결정(2026-09-14)이다.
2. **Modal 이미지 등록.** 「고칠 파일」 ③이 `add_local_python_source(...)`에 `"caption_style_source"`를 더한다. `test_modal_image_sources.py`가 이를 검사하므로 누락 시 게이트에서 잡힌다.
3. **모드별 적용 범위.** 주입은 `main.py:1115` 한 곳만 바뀌고, 그 줄은 render+auto의 `else` 블록(`main.py:1057`) 안이다. auto는 요청 스타일로 폴백하고, render는 moment 스타일만 쓴다. analyze는 그 블록에 도달하지 않으므로(`main.py:995` 블록에서 콜백 후 이탈) 구조적으로 무영향이며, 설령 다른 mode 값이 들어와도 `select_caption_style`은 요청 스타일을 쓰지 않는다.
4. **배포 순서 안전성.** 새 필드는 선택·기본 `None`. 웹이 아직 안 보내면 `request.caption_style`이 어디서나 `None` → auto는 `select_caption_style(None, None, "auto") = None`, render는 `select_caption_style(moment.get(...), None, "render")`가 moment 값 그대로(없으면 `None`) 반환 → 오늘과 동일. 이 불변을 테스트로 단언한다.
5. **못 덮는 범위.** 「테스트」 절 참조.

## 테스트

- **덮는 것** (`test_caption_style_source.py`, `select_caption_style`):
  1. moment이 dict면 moment 반환 — render
  2. moment이 dict면 moment 반환 — auto(클립별 스타일 우선은 모드 무관)
  3. auto: moment `None`·request dict → request 반환 (auto 스냅샷 경로)
  4. render: moment `None`·request dict → `None` — **render는 요청 스타일을 쓰지 않는다**(부재 = 언어 기본값)
  5. 둘 다 `None`이면 `None` — auto·render 두 모드 모두 — **배포 순서 불변**: 웹이 안 보낼 때 오늘과 동일
  6. moment dict + request dict(auto) → request를 무시하고 moment 통째 반환 — **키 병합 안 함**(부분 키 moment + 겹치는 request 키로 확인)
  7. moment이 빈 `{}`면 `{}` 반환 (auto에서도 request로 안 떨어짐)
  8. 비-dict moment(문자열 등) + request dict: auto → request, render → `None`
  9. 둘 다 비-dict(예: 문자열, 리스트) → `None`
  10. 그 밖의 mode(`"analyze"`·`""`·`None`) + moment `None` + request dict → `None`
  - 새 모듈의 Modal 등록은 기존 `test_modal_image_sources.py`가 자동으로 검사하므로 별도 테스트를 더하지 않는다.
- **못 덮는 범위**:
  - 실제 자막 렌더 결과(폰트·크기·색·위치 픽셀)는 GPU·Modal·pysubs2가 필요해 unittest로 못 덮는다 — 배포 후 수동 확인이 원장 등재 대상이다.
  - 엔드포인트→`.spawn`/`.remote`→`_do_process_video`→주입의 **인자 배선**(요청 필드 전달, 주입 줄이 `mode`를 넘기는 것)은 `main.py` import가 whisperx→torch를 끌어와 unittest 러너로 못 돈다. `py_compile`로 문법만 검증하고, 실제 전달은 `modal run`으로 사용자가 확인해야 한다.
  - 웹이 요청 단위 스타일을 **auto 디스패치에 실제로 싣는** 것은 FEAT-42라, auto 경로에 사용자 스타일이 먹는 것을 end-to-end로 보는 확인은 **FEAT-42 배포 뒤에야** 가능하다. 이 항목 단독 배포로는 사용자 체감 변화가 없다(웹이 `caption_style`을 보내지 않으므로 `None`).

## 범위 밖 의존

없음. 변경은 전부 `apps/backend/main.py`와 신규 순수 모듈·테스트 안이다. `asd/`·`requirements.txt`·다른 워크스페이스에 닿지 않는다.

소유자 결정의 전파: 백로그 FEAT-42 항목에 "백엔드는 render 모드에서 요청 단위 `caption_style`을 쓰지 않는다 — render는 드래프트 스타일만"을 적었다. FEAT-42가 요청 단위 스타일을 render 디스패치에 실어도 무해하지만 효과가 없다는 뜻이다.

## 대안

- **키 단위 병합** (moment 위에 request를 키별로 덮기). 기각. 웹 검토 미리보기가 단일 스타일 객체로 렌더하므로 병합하면 미리보기가 보여준 적 없는 키가 실렌더에 섞여 미리보기≡실렌더 계약이 깨진다(크레딧을 쓴 뒤에야 드러나는 회귀). `captionStyleSchema`가 키별 `null`을 허용하므로 부분 키 객체는 실제로 존재할 수 있고, 그래서 병합 여부는 실제 렌더를 바꾼다.
- **두 모드 공통 폴백** (render에서도 moment 스타일이 없으면 요청 스냅샷). 기각 — 소유자 결정(2026-09-14). render의 moment 스타일 부재는 커스텀 클립·「Reset style」의 "언어 기본값"이고 미리보기도 그렇게 그리므로, 공통 폴백은 웹이 render 요청에 스냅샷을 싣는 순간 그 클립들을 스냅샷으로 렌더해 미리보기≠실렌더를 만든다. FEAT-42 백로그가 웹 쪽에서 기각한 "상속식 `draft.captionStyle ?? snapshot` 간접층"을 백엔드에 다시 만드는 셈이고, 웹의 규율(auto에만 싣기)에 기대지 않고 백엔드가 직접 막는 편이 안전하다.
- **`resolve_caption_style`을 순수 모듈로 빼서 테스트.** 기각. `pysubs2.Color`(`main.py:155`·`177`·`184`)를 쓰므로 stdlib-only 계약(`torch/boto3/cv2/pysubs2/modal forbidden`) 위반이다. 폴백 **소스 선택**만 순수 모듈로 뺀다.
- **auto에서도 웹이 `moments`를 보내 클립별 캡션을 싣기.** 기각. auto는 Gemini가 moment를 만들어 웹이 그 리스트에 개입하지 못한다(백로그 관측 2). 요청 단위 필드가 auto에 스타일을 넣는 유일한 경로다.
