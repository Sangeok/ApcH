# FEAT-61 — 캡션 세로 위치를 사용자 marginV로 렌더

## 2026-10-14 구현 (구현승인 → 완료)

계획서 `docs/plans/FEAT-61.md`(클린 패스본)를 파일에서 다시 읽고 그대로 구현했다.

### 구현 전 확인

- 보드 status: `구현승인` (소유자 게이트② 2026-10-14).
- 계획서 「현재 동작」 ↔ 코드 대조: 전부 일치. `main.py:45`(import), `:82`(`caption_style: dict | None = None`), `:100`(add_local_python_source), `:154-165`(두 상수표), `:186-188`(position 블록), `:210-211`(반환) 모두 계획서 인용과 바이트 동일. 어긋남 0 → 구현 진행.
- 베이스라인: `unittest discover` 146 tests OK (다른 세션의 미추적 card-news 테스트 포함).

### 고친 파일 (전수)

1. `apps/backend/caption_position.py` **(신규)** — 계획 「구현 스케치」 전체 본문 그대로. stdlib만. 상수 `CAPTION_POSITION_ALIGNMENT`(top 8·middle 5·bottom 2)·`CAPTION_POSITION_MARGINV`(top 200·bottom 260)·`MARGINV_MIN 0`·`MARGINV_MAX 960`, 함수 `normalize_position`·`parse_marginv`·`resolve_position(style, *, default_marginv)`.
2. `apps/backend/test_caption_position.py` **(신규)** — unittest 15 메서드 (아래 테스트 절).
3. `apps/backend/main.py` **(수정, 5편집)**:
   - ① `from caption_position import resolve_position` 추가(`select_caption_style` import 아래).
   - ② `CAPTION_POSITION_ALIGNMENT`·`CAPTION_POSITION_MARGINV` 상수 정의 블록(주석 포함) 삭제 — `caption_position.py`로 이관. 앞뒤 빈 줄 둘만 남겨 `return validated` → `def parse_hex_color` 사이 2줄.
   - ③ `resolve_caption_style`의 position 블록(`position = style.get("position")` + `if position not in ...: position = "middle"`)과 뒤 빈 줄 삭제.
   - ④ 반환 dict의 `"alignment"`·`"marginv"` 두 줄을 `**resolve_position(style, default_marginv=default_marginv),` 한 줄로 교체.
   - ⑤ `add_local_python_source(...)`에 `"caption_position"` 등재.

`test_modal_image_sources.py`는 고치지 않았다(계획대로) — ⑤ 등재를 자동 대조한다.

### 스케치 대비 차이

없음. 신규 모듈은 「구현 스케치」 전체 본문과 바이트 동일, main.py 5편집도 before/after 그대로. 분기 순서·조건·리터럴·사용자 노출 문구 변경 없음. 테스트는 계획 「테스트」 절의 8개 요구 커버리지를 15개 메서드로 구성(아래).

### 테스트 (test_caption_position.py, 15 메서드)

- `NormalizePositionTests` (2): 유효 3값 통과 / 무효·누락(`"left"`·`None`·`123`·`""`) → middle.
- `ParseMarginvTests` (4): 범위 안(0·500·960) → 동값 / 범위 밖(-1·961) → None / bool(True·False) → None(1로 안 샘) / float·str·None → None.
- `ResolveMiddleTests` (3): middle 변형 3종 → alignment 5 + default_marginv / 유효 marginV 무시 / default_marginv 165·155 둘 다 흘림(돌연변이 생존자 대응).
- `ResolveTopBottomValidTests` (2): top+유효(0·500·960) → alignment 8 + 동값 / bottom+유효 → alignment 2 + 동값.
- `ResolveTopBottomFallbackTests` (3): top 무효·누락(누락·None·961·True·120.0) → 200 / bottom → 260 / top True ≠ 1 명시.
- `BackwardCompatTests` (1): marginV 키 없는 레거시 스냅샷 — `{"position":"top"}`→200, `{"position":"bottom"}`→260, `{}`→middle+default.

### 검증 (저장소 루트, 맨 파이썬)

```
python -m unittest discover -s apps/backend -p "test_*.py"
→ Ran 161 tests in 0.248s  OK   (146 → 161, 정확히 +15 = 새 파일 메서드 수)

python -m py_compile apps/backend/main.py
→ EXIT 0
```

새 모듈 단독: `python -m unittest test_caption_position` → Ran 15 tests OK.
전체 스위트 통과에 `test_modal_image_sources`도 포함 — ⑤ 등재 누락 시 실패하므로 등재가 검증됨.

### 테스트로 못 덮은 범위 (배포 후 소유자 확인)

- 컨테이너 libass의 실제 픽셀 위치(러너는 렌더 불가).
- Modal 배포·`modal run` 실행(소유자 몫). 배포 후 사용자 marginV 값을 넣은 실렌더 1개로 위치 확인 필요.
- 웹 zod 범위(0~960)와 백엔드 상수 동기 여부 — `apps/web`(FEAT-62) 담당 밖.

### 비고

- `apps/backend/CLAUDE.md:151-152`가 두 상수를 `main.py`의 것으로 설명한다. 구현 뒤 상수는 `caption_position.py`에 있고 top/bottom은 사용자 marginV로 바뀔 수 있어 낡았다. 정의 파일이라 backend-dev가 고치지 않음 — 계획 「범위 밖 의존」대로 메인 루프가 인수 때 갱신한다.
- 웹 주석 둘(`constants.ts:77`·`caption-preview.ts:106`)은 FEAT-62가 고친다.
- 배포 순서: 이 항목이 FEAT-62보다 먼저 배포돼야 한다(받는 쪽 먼저).
