# BUG-16: 여백 0%에서 9:16보다 세로로 긴 source가 화자 없으면 렌더가 죽고 화자 있으면 가로로 늘어난다

agent: backend-dev

작성일: 2026-09-30. 요구사항 원천: `TASK_BACKLOG.md` BUG-16(2026-09-30 FEAT-58 계획 검증 중 발견, 소유자가 백로그 등재와 즉시 진행 지시). 재현 증거는 `docs/agents/main-loop/FEAT-58.md` 라운드 1 경로 8(합성 프레임으로 HEAD `create_vertical_video`를 직접 돌림)과 인수 절의 백로그 후보다. 코드 조사 기준은 `dev` HEAD(FEAT-58 구현 `27db48f` 반영본)다. 작업 상태는 `PROJECT_BOARD.md`가 진실이며, 코드 변경은 게이트②(`구현승인`) 뒤다. 배포·실렌더 확인은 그와 별도로 소유자가 한다.

## 현재 동작

`create_vertical_video`(`apps/backend/main.py:219` `def create_vertical_video(tracks, scores, pyframes_path, pyavi_path, audio_path, output_path, framerate=25, video_padding_percent=0):`)는 프레임마다 화자 점수로 모드를 갈라 1080×1920 세로 영상을 만든다.

- **출력 크기와 writer.** `main.py:220-221`의 `target_width = 1080`·`target_height = 1920`이 출력 크기를 정한다. 프레임 writer는 `main.py:256-261`에서 `resize = (target_width, target_height)`로 열린다 — **writer에 넘긴 배열이 1080×1920이 아니면 writer가 그 크기로 리사이즈한다**(비율이 다르면 늘어난다).
- **여백 분기(FEAT-58).** `main.py:222-223`이 `padding_percent = resolve_video_padding_percent(video_padding_percent)`·`padding_px, content_height = frame_layout(padding_percent)`로 여백을 푼다. `main.py:263` `if padding_percent > 0:` 블록(`:263-301`)은 `cover_crop_geometry`/`contain_size`(`video_framing.py:24`·`:39`)로 중앙 `1080×content_height` viewport를 채운 뒤 `main.py:298-300`에서 `canvas = np.zeros((target_height, target_width, 3), ...)`에 올려 `vout.write(canvas)` 후 `main.py:301` `continue`한다. **이 경로는 항상 정확히 1080×1920 배열을 writer에 넘긴다.**
- **0% 경로 — 화자 없음(resize).** 여백이 0이면 위 블록을 건너뛰고 `main.py:303-306`의 모드 선택으로 간다. 화자가 없으면(`max_score_face`가 None, `:250`·`:252-253`) `resize` 모드(`:308-327`)다. `main.py:309` `scale = target_width / img.shape[1]`이 **폭을 1080에 맞추고**, `:310` `resized_height = int(img.shape[0] * scale)`로 높이를 정한다. `:324` `center_y = (target_height - resized_height) // 2`, `:325` `blurred_background[center_y:center_y + resized_height, :] = resized_image`가 1080×1920 블러 배경에 원본을 얹는다. `resized_height > 1920`이면 `center_y`가 음수가 되어 이 대입이 broadcast 오류를 낸다.
- **0% 경로 — 화자 있음(crop).** `crop` 모드(`:328-338`)는 `main.py:329` `scale = target_height / img.shape[0]`로 **높이를 1920에 맞추고**, `:331` `frame_width = resized_image.shape[1]`, `:334` `top_x = max(min(center_x - target_width // 2, frame_width - target_width), 0)`, `:336` `image_cropped = resized_image[0:target_height, top_x:top_x+target_width]`로 폭을 크롭한다. `frame_width < 1080`이면 슬라이스가 1080보다 좁은 배열을 내고, 그 배열이 writer에서 1080으로 **가로 확대**된다.

즉 0% 경로의 두 모드는 서로 반대되는 암묵 가정을 갖는다. `resize`는 「폭을 1080에 맞추면 높이 ≤ 1920」, `crop`은 「높이를 1920에 맞추면 폭 ≥ 1080」이다. 두 가정은 source의 세로가 9:16(높이/폭 = 16/9)보다 길면 동시에 깨진다. FEAT-58 여백 분기(`video_framing.py`)는 같은 입력을 cover/contain으로 정상 합성한다 — `docs/agents/main-loop/FEAT-58.md` 라운드 1 경로 8에서 실측(1920×1080·1080×1920·1000×1000·3840×2160 정상, 400×2000·1080×2340·1080×2400가 0%에서만 깨짐).

## 문제

여백 0%에서 9:16보다 세로로 긴 source(폰 세로 녹화 1080×2340 등)는 정상 출력을 못 낸다. 화자 없는 프레임은 `resize` 모드의 대입(`main.py:325`)이 `ValueError: could not broadcast input array from shape (2340,1080,3) into shape (210,1080,3)`로 죽어 **클립 렌더가 통째로 실패**한다. 화자 있는 프레임은 `crop` 모드가 폭 < 1080인 배열(`(1920,886,3)` 등)을 내고 writer(`main.py:260`)가 이를 1080으로 **가로로 늘린다**.

원천(`TASK_BACKLOG.md` BUG-16)의 요구는 「여백 0%에서도 어떤 화면비의 source든 1080×1920을 왜곡 없이 채운다」이고, 보존 조건은 「가로형·정확한 9:16 source의 0% 출력은 지금과 같아야 한다(FEAT-58이 합성 프레임 바이트 동일로 지킨 계약)」다. 코드에서 확인한 문제 지점은 원천이 지목한 것과 일치한다 — 어긋남 없음.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `apps/backend/video_framing.py` | 「중앙 합성 경로를 써야 하는가」 판단을 stdlib 순수 함수 `needs_centered_composition`으로 추가(파일 끝에 덧붙임) |
| `apps/backend/main.py` | `video_framing` import에 `needs_centered_composition` 추가 · 프레임 루프에서 source 치수 대입을 여백 가드 앞으로 옮기고 가드 `if padding_percent > 0:`를 `if needs_centered_composition(...)`로 교체 |
| `apps/backend/test_video_framing.py` | `needs_centered_composition` 케이스 클래스 추가 |
| `apps/backend/test_video_framing_wiring.py` | 가드 표현식이 바뀌므로 `test_positive_branch_...`의 `index(...)` 문자열과 모듈 docstring의 괄호 설명 갱신 |

이 집합 밖은 고치지 않는다. `test_modal_image_sources.py`는 손대지 않는다 — `video_framing`은 이미 `main.py:99`의 `add_local_python_source(...)`에 등록돼 있고, 새 모듈이 아니라 기존 모듈에 함수를 더할 뿐이라 등록 목록이 그대로다. `asd/`·`requirements.txt`·`packages/db`·웹은 대상이 아니다.

## 구현 스케치

**규칙.** 기존 파일의 편집은 before/after로 싣고 before는 현재 트리에서 정확히 1회 나온다. 신규 함수는 본문 전체를 싣는다.

### 판단을 어느 순수 모듈로 빼는가

「이 (여백, source 치수)에서 cover/contain 중앙 합성 경로를 써야 하는가, 아니면 기존 0% crop/resize 경로를 그대로 두는가」가 이 버그의 유일한 판단이고, 이는 `(padding_percent, source_width, source_height)`만의 순수 함수다. 이미 stdlib 전용인 `video_framing.py`(`backend-purity-contract` 준수)에 `needs_centered_composition`으로 둔다. `FRAME_WIDTH`(1080)·`FRAME_HEIGHT`(1920)는 같은 파일 `:3-4`에 이미 있다.

**신규 함수 — `video_framing.py` 끝에 빈 줄 하나를 두고 덧붙인다:**

```python
def needs_centered_composition(padding_percent, source_width, source_height):
    """cover/contain 중앙 합성 경로를 써야 하면 True.

    양수 여백이면 항상 True다. 여백 0%에서는 source가 target(9:16)보다 세로로 길 때만
    True다 — 기존 crop/resize 경로가 그때만 깨진다(화자 없음 → resize의 broadcast
    ValueError, 화자 있음 → crop이 폭 < 1080을 내고 writer가 가로로 늘림). 가로·정사각·
    정확히 9:16 이하인 source는 False라 기존 0% 경로가 바이트 그대로 유지된다.

    padding_percent는 main.py에서 resolve된 0~25 정수다.
    """
    if padding_percent > 0:
        return True
    return source_height * FRAME_WIDTH > source_width * FRAME_HEIGHT
```

경계는 정확히 9:16이다. `source_height * 1080 > source_width * 1920`은 높이/폭 > 16/9와 같고, 정확한 9:16(예 1080×1920)은 `2073600 > 2073600`이 거짓이라 False → 기존 경로다. 가로(1920×1080)·정사각(1000×1000)·3840×2160도 False다. 세로로 긴 1080×2340·1080×2400·400×2000만 True다. FEAT-58 라운드 1 경로 8의 실측 분류와 일치한다.

### 0% 출력 보존 방식

보존은 두 겹으로 지킨다. ① `needs_centered_composition`이 가로·정사각·9:16 이하 source에 대해 여백 0%에서 **False**를 돌려주므로, 그 source들은 지금과 똑같은 `main.py:303-338` 경로를 탄다. ② main.py 편집이 그 legacy 블록(`:303-338`)의 코드를 **한 줄도 바꾸지 않는다** — 가드 교체와 치수 대입 이동만 한다. 두 겹이 합쳐져 FEAT-58이 합성 프레임 바이트 동일로 세운 「0% 출력 불변」 계약을 그대로 유지한다.

세로로 긴 source의 0% 출력은 지금 crash(화자 없음)이거나 왜곡(화자 있음)이라 보존할 유효 출력이 없다. 이들은 True로 갈려 여백 분기 본문(`main.py:263-301`)을 `padding_percent == 0`, `padding_px == 0`, `content_height == 1920`으로 통과한다 — `frame_layout(0)`이 `(0, 1920)`이라 canvas가 전체 1080×1920이 되고 content가 `[0:1920]`에 놓인다. cover는 화자 x를 따라가고(폭 여유가 있을 때), contain은 블러 배경 위에 원본 비율을 중앙 배치한다. 어느 쪽이든 writer에 정확히 1080×1920을 넘겨 늘어남이 없다.

경계 참고: 높이/폭이 16/9를 아주 근소하게 넘어 legacy `resize`의 `int()` 절삭이 우연히 1920 이하를 내던 극소 대역의 source는 이제 합성 경로로 간다. 그 대역의 legacy 출력도 이미 미세 왜곡(수직 압착 또는 writer 가로 확대)이었고, 그런 정확한 치수는 실질적으로 도달 불가이며 보존 대상(가로·정확한 9:16)이 아니다 — 합성 경로가 오히려 왜곡을 없앤다.

### main.py 배선

**import before — `main.py:46-52`:**

```python
from video_framing import (
    parse_video_padding_percent,
    resolve_video_padding_percent,
    frame_layout,
    cover_crop_geometry,
    contain_size,
)
```

**after:**

```python
from video_framing import (
    parse_video_padding_percent,
    resolve_video_padding_percent,
    frame_layout,
    cover_crop_geometry,
    contain_size,
    needs_centered_composition,
)
```

프레임 루프의 여백 가드를 교체한다. `source_height, source_width = img.shape[:2]`는 지금 여백 블록 첫 줄(`main.py:264`)이지만, 가드가 이 값을 필요로 하므로 가드 앞으로 옮긴다. legacy 경로(`:303-338`)는 `img.shape`를 직접 쓰므로 이 지역 변수 추가에 영향받지 않는다.

**before — `main.py:263-265`:**

```python
        if padding_percent > 0:
            source_height, source_width = img.shape[:2]
            if max_score_face:
```

**after:**

```python
        source_height, source_width = img.shape[:2]
        if needs_centered_composition(padding_percent, source_width, source_height):
            if max_score_face:
```

여백 블록의 나머지(`:265-301`)와 legacy 모드 선택·resize·crop(`:303-338`)은 그대로다. `continue`(`:301`)도 그대로라 0%·비-세로 source는 여전히 legacy 경로로 흐른다. writer 크기(`:260`)와 자막 단계(여백 개념 없음)는 바꾸지 않는다.

### 배선 테스트 갱신

`test_video_framing_wiring.py:66-75`의 `test_positive_branch_precedes_mode_selection_and_continues`가 `ast`로 가드 표현식을 문자열 대조한다. 가드가 바뀌므로 `index` 인자를 새 표현식으로 바꾼다. `max_score_face` 대조와 `continue` 단언은 그대로 유효하다(합성 분기가 여전히 모드 선택보다 앞이고 `continue`로 끝난다).

**before — `test_video_framing_wiring.py:72`:**

```python
        positive = tests.index("padding_percent > 0")
```

**after:**

```python
        positive = tests.index(
            "needs_centered_composition(padding_percent, source_width, source_height)"
        )
```

`ast.unparse`는 이 호출을 정확히 위 문자열로 되돌린다(인자 사이 `, `, 여분 공백 없음). 모듈 docstring(`:5-6`)의 괄호 설명 `(0%는 기존 경로 그대로)`도 「가로·9:16 이하 0%는 기존 경로 그대로」로 손본다.

## 테스트

- **덮는 것** (`test_video_framing.py`, `python -m unittest discover -s apps/backend -p "test_*.py"`):
  - `needs_centered_composition`이 양수 여백(1·10·25%)에서는 source 비율과 무관하게 항상 True — 가로 source `(1920,1080)`로도 확인(단락 평가가 빠지면 가로가 False로 잘못 나오는 변이를 잡는다).
  - 여백 0%에서 가로 `(1920,1080)`·정사각 `(1000,1000)`·정확한 9:16 `(1080,1920)`·3840×2160·경계 `(540,960)` → False.
  - 여백 0%에서 세로로 긴 `(1080,2340)`·`(1080,2400)`·`(400,2000)` → True.
  - 경계 단언: 정확 비율 `(1080,1920)`·`(540,960)`은 False, 1px 더 긴 `(1080,1921)`·`(540,961)`은 True — `>`를 `>=`로 바꾸는 변이(정확한 9:16이 합성 경로로 새는 회귀)를 잡는다.
  - `FRAME_WIDTH`↔`FRAME_HEIGHT`를 뒤바꾸는 변이는 가로/세로 판정이 반대로 나와 위 케이스에서 사멸한다.
- **덮는 것** (`test_video_framing_wiring.py`, 같은 명령): 갱신한 문자열 대조가 `ast`로 가드 표현식·순서·`continue`를 확인한다. 나머지 배선 단언(HTTP StrictInt·spawn/remote·worker·process_clip·create_vertical_video 전달)은 이번 변경과 무관하게 통과한다.
- **못 덮는 범위**: stdlib 러너는 `cv2`·`ffmpegcv`·GPU가 없어 `create_vertical_video`의 실제 픽셀을 돌리지 못한다. 따라서 (a) 세로 source가 이제 crash·왜곡 없이 1080×1920으로 렌더되는 것, (b) 0%·비-세로 source의 픽셀이 바이트 동일하게 유지되는 것은 이 러너로 확인할 수 없다. 확인은 FEAT-58 라운드 1 경로 8처럼 `numpy`/`cv2`로 합성 프레임을 만들어 함수를 직접 돌리는 하니스(writer·ffmpeg만 스텁)나 `modal run` 실렌더로만 가능하며, 이는 사용자(또는 인수 단계 메인 루프)의 몫이다. `unittest`/`py_compile` 게이트는 순수 판단과 배선까지만 덮는다.

## 범위 밖 의존

없음. 변경은 전부 `apps/backend`(main.py + video_framing.py + 두 테스트) 안이고, `asd/`·`requirements.txt`·`packages/db`·웹·Modal 등록에 닿지 않는다. 실렌더·배포 검증이 필요하지만 그것은 담당 범위를 넘는 의존이 아니라 러너가 못 덮는 범위이며(위 「테스트」), 게이트②·배포는 소유자가 연다.

## 대안

- **0%도 전부 cover/contain으로 일괄 통일**: 가로·9:16 source의 0% 출력까지 바뀌어 FEAT-58의 바이트 동일 계약을 깨고 광범위 재검증이 필요하다 — FEAT-58 계획의 「0%도 새 geometry로 일괄 리팩터」 대안과 같은 이유로 기각. 세로 source에만 합성 경로를 연다.
- **legacy resize/crop 모드 안에서 직접 보정**(resize에 수직 크롭 추가, crop에 폭 맞춤 추가): 이미 존재하고 FEAT-58이 골든값으로 고정한 cover/contain 계산을 중복 구현하게 되어 코드·회귀면이 늘고 두 구현을 동기화해야 한다 — 기각. 판단만 순수 함수로 빼고 검증된 합성 본문을 재사용한다.
- **판단을 프레임마다 다르게**: source 치수는 클립 내 모든 프레임이 같으므로 `needs_centered_composition`은 클립당 한 번 값이 정해진다. 프레임 단위로 갈라 한 클립 안에서 경로가 섞이게 만들 필요가 없다.
