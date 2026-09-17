# FEAT-51 — `render` 모드도 요청 단위 캡션 스냅샷으로 폴백

## 2026-09-17 구현

계획서 `docs/plans/FEAT-51.md`(검증 클린 패스본)를 파일에서 다시 읽고 그대로 구현했다.
구현 전 계획서 「현재 동작」의 인용 줄을 실제 코드와 대조해 전부 일치함을 확인했다 —
어긋난 인용 없음:

- `caption_style_source.py:12` `REQUEST_STYLE_FALLBACK_MODE = "auto"`, `:15` `def select_caption_style(moment_style, request_style, mode):`, `:29-33`의 3분기 로직 — 일치.
- `main.py:64` moments 주석의 `caption_style` 키, `:72-76` `ProcessVideoRequest.caption_style` 필드·주석, `:1169` 호출부(`mode` 3-인자), `:1155` 클립 루프, `:1000` `_do_process_video`의 `request_caption_style` 파라미터, `:1257`·`:1273`의 `request_caption_style=request.caption_style` 배선 — 일치.
- 호출부는 정확히 한 곳(`main.py:1169`)뿐임을 grep으로 재확인(`select_caption_style`/`REQUEST_STYLE_FALLBACK_MODE`/`request_caption_style` 전수).
- 순수 모듈 테스트 기준선: `test_caption_style_source.py` 12케이스, 3-인자 시그니처. 전체 스위트 `Ran 117 tests ... OK` 실측.

### 고친 파일 (전수 — 계획 「고칠 파일」 표 그대로 3파일)

내가 실제로 고친 파일은 셋. (워킹트리에 이미 있던 `apps/web/.claude/settings.local.json`과 `nul`은 내 것이 아니라 제외.)

1. `apps/backend/caption_style_source.py` — 전체 교체(계획 「구현 스케치」 전체 코드와 바이트 동일).
   - `mode` 인자와 `REQUEST_STYLE_FALLBACK_MODE` 상수를 제거. 2-인자 `select_caption_style(moment_style, request_style)`.
   - 남는 규칙: `moment_style`이 dict면 그것 → `request_style`이 dict면 그것(모드 무관, render도 폴백) → 아니면 `None`.
   - `moment_style` 인자·우선순위는 유지(전이 구간 하위 호환). 모듈·함수 독스트링을 2026-09-16 재판정 계약으로 다시 씀.
   - torch/boto3/cv2/pysubs2/modal 미import — purity 계약 준수.

2. `apps/backend/test_caption_style_source.py` — 모듈 유지, 2-인자 새 계약으로 케이스 전체 재작성(12→8).
   - 계획 「테스트」 8케이스 그대로: ①moment 우선(키 병합 없음, `assertNotIn`) ②moment None→request 폴백(핵심 신규) ③둘 다 None→None ④빈 dict moment 유지 ⑤비-dict moment(문자열·리스트, subTest)→request ⑥둘 다 비-dict→None ⑦moment dict+request None→moment ⑧request 빈 dict 반환.
   - 반환 객체 동일성은 `assertIs`로 단언(통째 선택·키 병합 없음).
   - 구 12케이스의 `mode` 분기 중복(`_auto`/`_render` 쌍, `test_other_modes_do_not_fall_back`)은 게이트 제거로 접힘.

3. `apps/backend/main.py` — 계획 「고칠 파일」 ①② 2개 편집:
   - ① 호출부 `:1169`에서 `mode` 인자 제거 → `caption_style=select_caption_style(moment.get("caption_style"), request_caption_style)` (2-인자).
   - ② `ProcessVideoRequest.caption_style` 위 주석 `:72-75`를 auto·render 공통 폴백(FEAT-51)으로 갱신.
   - `:64` moments 주석과 `:1123` moment `caption_style` 키는 계획대로 **무변경**(전이 구간에 웹이 보내는 클립별 스타일을 계속 받아야 함). `main.py:93` 이미지 등록·`resolve_caption_style`(`:172`)도 무변경.

### 스케치 대비 차이

없음. 순수 모듈 본문·독스트링은 계획 「구현 스케치」와 바이트 동일. main.py 2개 편집도 before/after 스케치와 문자 단위 일치. 분기 순서·조건·리터럴·사용자 문구 변경 없음. 테스트 8케이스는 계획 「테스트」 목록과 일치(케이스 5는 문자열·리스트 둘을 `subTest`로 묶어 메서드 1개 = 8개 테스트 카운트 유지).

### 검증

저장소 루트에서 실행, 실제 출력 확인:

- `PYTHONUTF8=1 python -m unittest discover -s apps/backend -p "test_*.py"` → `Ran 113 tests in 0.003s` / `OK`.
  기준선 117에서 이 모듈 12→8(−4) = 113. 계획이 못박은 기대값 `Ran 113 tests ... OK`와 일치. `NO TESTS RAN` 아님, 전부 통과.
- 모듈 단독 `PYTHONUTF8=1 python -m unittest test_caption_style_source -v` → `Ran 8 tests ... OK`(8케이스 전수 통과).
- `python -m py_compile apps/backend/main.py` → exit 0.
- `git diff --name-only` → 내 수정 3파일만(`caption_style_source.py`·`main.py`·`test_caption_style_source.py`). 나머지는 기존 워킹트리 잔여(`apps/web/.claude/settings.local.json`·`nul`).

### 테스트로 못 덮은 범위 (배포 후 수동 확인 대상)

- **실렌더 자막 모양** — 사용자 스타일이 실제 `.mp4` 자막에 나타나는지는 GPU·ffmpeg·pysubs2 렌더라 러너가 판정하지 못한다. 배포 후 실물 확인(`docs/release-checks.md` 등재 대상).
- **`main.py:1169` 호출부의 실배선** — `main.py`가 `whisperx`→`torch`를 import해 unittest 러너로 안 돈다. `py_compile` + `git diff`로만 확인. 엔드포인트→`.spawn`/`.remote`→`_do_process_video`→주입의 실제 전달은 `modal run`으로 사용자가 확인해야 한다.
- **render 폴백의 실효** — FEAT-52(웹이 render에도 요청 스냅샷을 싣는 것)가 배포돼야 실제로 발동한다. 그 전까지 render 요청의 `caption_style`은 `undefined`라 새 폴백 경로는 휴면 상태다. 두 항목 배포 후 실렌더로만 확인.

### 비고

- **`apps/backend/CLAUDE.md:139` 문서 드리프트 (내 쓰기 범위 밖 — 메인 루프 인수 시 갱신 필요).** 그 줄 `only in auto mode does it fall back to the request-level ... snapshot. In render, a clip without a style ... gets the language defaults`는 FEAT-51 뒤 거짓이 된다(이제 render도 요청 스냅샷으로 폴백한다). `apps/backend/CLAUDE.md`는 이 에이전트의 읽기 전용 지시 문서라 고치지 않았다(계획 「범위 밖 의존」 지목, FEAT-43 전례). 인수 시 메인 루프가 갱신한다.
- **배포 순서 제약 — FEAT-51이 FEAT-52보다 반드시 먼저 배포되어야 한다.** 순서가 뒤집히면 웹이 드래프트 시드를 지운 뒤 백엔드가 아직 render 폴백을 못 해 그 사이 확정되는 모든 클립이 언어 기본값으로 렌더된다. `modal deploy`(FEAT-51) → FEAT-52 웹 배포. 배포·실행 검증은 사용자 몫 — 나는 `modal run`/`modal deploy`를 실행하지 않았다(이 머신은 `PYTHONUTF8=1` 필요, cp949 크래시).
- **FEAT-52 이후 후속 정리 (내 것이 아님).** FEAT-52가 배포돼 웹이 클립별 스타일을 완전히 끊으면 `moment_style` 인자·우선순위, `main.py:1123` 키, `main.py:64` moments 주석은 죽은 코드가 된다. 그때 제거는 별도 후속 항목(백로그 후보)이며 FEAT-51에서는 하지 않았다.
