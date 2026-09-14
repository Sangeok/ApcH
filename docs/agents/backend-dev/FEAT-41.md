# FEAT-41 — 요청 단위 `caption_style` 폴백 (auto 전용)

## 2026-09-14 구현

계획서 `docs/plans/FEAT-41.md`(검증 클린 패스본)를 파일에서 다시 읽고 그대로 구현했다.
계획서 「현재 동작」의 인용 줄(`main.py:47`·`:79`·`:950`·`:1069`·`:1101`·`:1115`·`:1192-1218`)을
구현 전 코드와 대조해 전부 일치함을 확인했다 — 어긋난 인용 없음.

### 고친 파일 (전수)

내가 실제로 고친 파일은 셋. (워킹트리에 있던 FEAT-38·web·db 변경과 `nul`은 내 것이 아니라 제외.)

1. `apps/backend/caption_style_source.py` (신규) — stdlib-only 순수 모듈.
   `select_caption_style(moment_style, request_style, mode)`:
   - `moment_style`이 dict면 그것을 통째로 반환(모드 무관, 클립별 스타일 우선).
   - 아니면 `mode == "auto"`이고 `request_style`이 dict일 때만 `request_style`.
   - 그 밖은 `None`(→ `resolve_caption_style`이 언어 기본값으로 접는다).
   - 상수 `REQUEST_STYLE_FALLBACK_MODE = "auto"`. 키 병합 없음(객체 단위 선택).
   torch/boto3/cv2/pysubs2/modal 미import — purity 계약 준수.

2. `apps/backend/test_caption_style_source.py` (신규) — unittest 12개(계획 「테스트」 10케이스 커버).
   `assertIs`로 반환 객체 동일성을 확인해 "통째 선택·키 병합 없음"을 단언한다.
   - moment 우선(render·auto 2), auto 요청 폴백, render 요청 무시, 둘 다 None 불변(auto·render 2),
     키 병합 안 함, 빈 `{}` 유지, 비-dict moment(auto→request·render→None 2), 둘 다 비-dict→None,
     그 밖의 mode(`analyze`·`""`·`None`) 폴백 안 함.

3. `apps/backend/main.py` — 계획 「고칠 파일」 6항목 그대로:
   - ② import `from caption_style_source import select_caption_style` (moment_prompt import 아래).
   - ① `ProcessVideoRequest`에 `caption_style: dict | None = None` 필드 추가(주석 포함).
   - ③ `add_local_python_source(...)`에 `"caption_style_source"` 추가.
   - ④ `_do_process_video` 시그니처 말미에 `request_caption_style: dict | None = None` 추가.
   - ⑤ 주입 지점을 `caption_style=select_caption_style(moment.get("caption_style"), request_caption_style, mode)`로 교체.
   - ⑥ `.spawn`·`.remote` 두 호출부에 `request_caption_style=request.caption_style,` 추가.

### 스케치 대비 차이

없음. 신규 모듈 본문은 계획 「구현 스케치」의 전체 코드와 바이트 동일. main.py 6개 편집도
before/after 스케치와 문자 단위로 일치. 분기 순서·조건·리터럴·문구 변경 없음.

### 검증

저장소 루트에서 실행, 실제 출력 확인:

- `python -m unittest discover -s apps/backend -p "test_*.py"` → `Ran 79 tests ... OK`
  (FEAT-43 시점 67 + 신규 12 = 79. `NO TESTS RAN` 아님, 전부 통과.)
- `python -m py_compile apps/backend/main.py` → exit 0.

`git status --short`로 내 수정 3파일만 새로/변경됨을 확인(나머지는 기존 FEAT-38·web·db·`nul`).

### 테스트로 못 덮은 범위 (배포 후 수동 확인 대상)

- 실제 자막 렌더 픽셀(폰트·크기·색·위치): GPU·Modal·pysubs2 필요, unittest 불가.
- 엔드포인트→`.spawn`/`.remote`→`_do_process_video`→주입의 인자 배선: `main.py` import가
  whisperx→torch를 끌어와 러너로 못 돈다. `py_compile`로 문법만 검증. 실제 전달은 `modal run`으로
  사용자가 확인해야 한다.
- auto 경로에 사용자 스타일이 먹는 end-to-end 확인은 **FEAT-42 배포 뒤에야** 가능하다(웹이 아직
  `caption_style`을 auto 디스패치에 싣지 않음). 이 항목 단독 배포로는 사용자 체감 변화 없음(항상 `None`).

### 비고

- 배포 순서 제약: FEAT-41이 FEAT-42보다 먼저 배포되어야 한다(백엔드가 필드를 모르면 pydantic이
  웹이 보낸 스타일을 조용히 버린다). 배포는 사용자가 `PYTHONUTF8=1`로 실행한다 — 나는 modal 명령을 돌리지 않았다.
