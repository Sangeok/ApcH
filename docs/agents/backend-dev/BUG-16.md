# BUG-16 — 여백 0%에서 9:16보다 세로로 긴 source가 화자 없으면 렌더가 죽고 화자 있으면 가로로 늘어난다

## 2026-09-30 · backend-dev · 구현 (status → 완료)

계획서 `docs/plans/BUG-16.md`를 파일에서 읽고 그대로 구현했다. 계획서 「현재 동작」의
`파일:줄` 인용을 착수 시점 코드(`dev` HEAD)와 대조해 모두 일치함을 확인한 뒤 진행했다:

- `main.py:46-52` import 블록 = 계획 「import before」와 바이트 동일.
- `main.py:219` `create_vertical_video` 시그니처, `:220-221` target, `:222-223` padding resolve, `:263` `if padding_percent > 0:`, `:264` `source_height, source_width = img.shape[:2]`, `:265` `if max_score_face:`, legacy 모드 `:303-338` 모두 계획 서술과 일치.
- `video_framing.py:3-4` `FRAME_WIDTH`/`FRAME_HEIGHT`, `:39-45` `contain_size` 말미 = 신규 함수 삽입 앵커와 일치.
- `test_video_framing_wiring.py:72` `positive = tests.index("padding_percent > 0")` = 교체 대상과 일치.

어긋남 없음 → 구현 진행.

### 고친 파일 (전수) — 계획 「고칠 파일」 4파일과 정확히 일치

1. **`apps/backend/video_framing.py`** — 파일 끝 `contain_size` 뒤에 빈 줄 둘을 두고
   `needs_centered_composition(padding_percent, source_width, source_height)`를 덧붙였다.
   본문은 계획 「구현 스케치」의 신규 함수 전체와 바이트 동일. 양수 여백이면 `True`,
   여백 0%에서는 `source_height * FRAME_WIDTH > source_width * FRAME_HEIGHT`(높이/폭 > 16/9)일
   때만 `True`. stdlib(`math`)만 쓰는 기존 순수 모듈에 추가 — `backend-purity-contract` 유지.

2. **`apps/backend/main.py`** — 2곳 편집, 스케치 before/after 그대로.
   - ① import(`:46-52`): `from video_framing import (...)`에 `needs_centered_composition` 한 줄 추가.
   - ② 프레임 루프 가드(구 `:263-265`): `source_height, source_width = img.shape[:2]`를 가드
     **앞으로** 옮기고, `if padding_percent > 0:`를
     `if needs_centered_composition(padding_percent, source_width, source_height):`로 교체.
   - 여백 합성 블록 본문(`:265-301`, `continue` 포함)과 legacy resize/crop(`:303-338`),
     writer 크기(`:260`)는 한 줄도 바꾸지 않았다 — 0%·비-세로 source는 여전히 legacy 경로.

3. **`apps/backend/test_video_framing.py`** — import에 `needs_centered_composition` 추가 +
   `NeedsCenteredCompositionTest` 클래스(4 메서드) 추가.
   - `test_positive_padding_always_true`: 여백 1·10·25%에서 가로/9:16/정사각/세로 source 전부 `True`
     (단락 평가가 빠져 가로가 `False`로 새는 변이를 잡음).
   - `test_zero_padding_non_tall_is_false`: 0%에서 `(1920,1080)`·`(1000,1000)`·`(1080,1920)`·`(3840,2160)`·`(540,960)` → `False`.
   - `test_zero_padding_tall_is_true`: 0%에서 `(1080,2340)`·`(1080,2400)`·`(400,2000)` → `True`.
   - `test_boundary_is_exclusive`: 정확한 9:16 `(1080,1920)`·`(540,960)`은 `False`, 1px 더 긴
     `(1080,1921)`·`(540,961)`은 `True` — `>`를 `>=`로 바꾸는 회귀를 잡음.

4. **`apps/backend/test_video_framing_wiring.py`** — 모듈 docstring의 괄호 설명을
   중앙 합성 분기(양수 여백 또는 9:16보다 세로로 긴 0% source) 서술로 갱신, 그리고
   `test_positive_branch_precedes_mode_selection_and_continues`의 `tests.index(...)` 인자를
   `"needs_centered_composition(padding_percent, source_width, source_height)"`로 교체.
   `max_score_face` 대조·`continue` 단언·순서 단언은 그대로 유효(합성 분기가 여전히
   모드 선택보다 앞이고 `continue`로 끝남 → 갱신 후에도 통과).

`test_modal_image_sources.py`는 손대지 않았다 — `video_framing`은 이미
`add_local_python_source`에 등록돼 있고 새 모듈이 아니라 기존 모듈에 함수를 더한 것뿐이라
등록 목록 불변. `asd/`·`requirements.txt`·`packages/db`·웹은 건드리지 않음.

### 스케치 대비 차이

없음. 분기 순서·조건·리터럴 값·문구 모두 계획 「구현 스케치」와 동일하다.
테스트 케이스는 계획 「테스트」 절이 열거한 입력을 그대로 덮었다(케이스 이름·묶음은
`subTest`로 정리했으나 판정 대상 입력·기대값은 계획과 일치).

### 0% 출력 보존 근거 (계획 재확인)

보존은 두 겹이다. ① `needs_centered_composition`이 가로·정사각·9:16 이하 source에 대해
여백 0%에서 `False`를 돌려주므로 그 source들은 legacy `main.py:303-338` 경로를 그대로 탄다.
② main.py 편집이 legacy 블록의 코드를 한 줄도 바꾸지 않는다(가드 교체와 치수 대입 이동만).
FEAT-58이 합성 프레임 바이트 동일로 세운 「0% 출력 불변」 계약을 유지한다.
세로로 긴 source의 0% 출력은 지금 crash(화자 없음)·왜곡(화자 있음)이라 보존할 유효 출력이
없고, 이들만 `True`로 갈려 여백 분기 본문을 `padding_percent==0`·`padding_px==0`·`content_height==1920`으로
통과해 writer에 정확히 1080×1920을 넘긴다.

### 검증 (저장소 루트, 실행 출력)

- `python -m unittest discover -s apps/backend -p "test_*.py"` → `Ran 127 tests in 0.026s` / `OK`.
  착수 기준선 123(FEAT-58 완료 시점)에서 이 모듈 +4 = 127, 계획 기대 증가와 일치.
  실행 테스트 수 0 아님, 전부 통과. 갱신한 wiring 테스트도 이 안에서 통과(새 index 문자열이
  `ast.unparse` 결과와 매칭됨을 실증).
- `python -m py_compile apps/backend/main.py` → EXIT 0.
- `git diff --name-only` → `apps/backend/{main.py, video_framing.py, test_video_framing.py, test_video_framing_wiring.py}`
  4파일 + `PROJECT_BOARD.md`·`TASK_BACKLOG.md`(상태 파일). 코드/테스트는 계획 「고칠 파일」과
  정확히 일치, 범위 밖 변경 없음. (LF→CRLF 경고는 줄바꿈 정규화 안내로 내용 무관.)

### 테스트로 못 덮은 범위

- `create_vertical_video`의 실제 픽셀 — `cv2`·`ffmpegcv`·GPU가 stdlib 러너에 없어
  (a) 세로 source가 이제 crash·왜곡 없이 1080×1920으로 렌더되는 것,
  (b) 0%·비-세로 source의 픽셀이 바이트 동일하게 유지되는 것은 이 러너로 확인 불가.
  확인은 FEAT-58 라운드 1 경로 8처럼 numpy/cv2로 합성 프레임을 만들어 함수를 직접 돌리는
  하니스(writer·ffmpeg만 스텁)나 `modal run` 실렌더로만 가능하며, 사용자(또는 인수 단계
  메인 루프)의 몫이다. `unittest`/`py_compile` 게이트는 순수 판단(`needs_centered_composition`)과
  배선(ast 대조)까지만 덮는다.

### 범위 밖 의존 — 후속 필요 (계획 「범위 밖 의존」)

이 변경 뒤 거짓이 되는 문서 둘은 backend-dev 쓰기 범위 밖이라 손대지 않았다. 인수 때
메인 루프가 고친다:

- **`apps/backend/CLAUDE.md:137`** (FEAT-58 줄) — `**0 takes the original crop/resize path unchanged.**`이
  이제 세로 source에서 거짓. 계획 「범위 밖 의존」의 after 문구로 갱신 필요.
- **`docs/release-checks.md`** FEAT-58 절의 「여백 0% 렌더가 배포 전과 같은가」 줄의
  `0%는 새 분기에 들어가지 않는다`가 이제 부정확 — 「가로·정사각·9:16 이하 source에서만」으로
  한정 필요. BUG-16 자신의 실렌더 확인 줄(세로 폰 녹화)은 원장 규칙대로 인수 시 새 절로 등재.

배포·실렌더 검증은 소유자 몫(`modal run`/`modal deploy`, 이 머신은 `PYTHONUTF8=1` 필요).
