# FEAT-55 — FEAT-52 뒤 죽는 클립별 캡션 스타일 경로 제거

## 2026-09-21 · backend-dev · 구현 (status → 완료)

계획서 `docs/plans/FEAT-55.md`를 파일에서 읽고 그대로 구현했다. 계획서 「현재 동작」의
`파일:줄` 인용 전수를 착수 시점 코드와 대조해 모두 일치함을 확인한 뒤 진행했다
(`caption_style_source.py:12·31-35` 2-인자 시그니처·우선순위, `main.py:45·62-64·72-76·93·1113·1123·1155·1169` 모두 일치).

### 고친 파일 (전수) — 계획 「고칠 파일」 3파일과 정확히 일치

1. **`apps/backend/caption_style_source.py`** — 「구현 스케치」의 전체 교체본 그대로 적용.
   - `select_caption_style(moment_style, request_style)` → `select_caption_style(request_style)` 1-인자화.
   - 우선순위 분기 `if isinstance(moment_style, dict): return moment_style` 제거. 남는 규칙: `request_style`이 dict면 그것, 아니면 None.
   - 모듈·함수 독스트링을 FEAT-55 계약(클립별 경로 소멸, 요청 스냅샷 단일 소스)으로 재작성. 모듈은 유지(대안 A 채택).

2. **`apps/backend/test_caption_style_source.py`** — 1-인자 계약으로 전면 재작성, 8→4 케이스.
   - `test_dict_request_is_returned`(request dict → 통째 반환, `assertIs`)
   - `test_none_is_none`(None → None)
   - `test_empty_dict_is_returned`(`{}` → `{}`, `assertIs`, 빈 dict 경계 보존)
   - `test_non_dict_is_none`(`"not-a-dict"`·`["y"]`를 `subTest` → None)
   - 모듈 독스트링도 FEAT-55 계약으로 갱신(구 FEAT-51 서술 제거).
   - 입력 공간을 dict / 빈 dict / None / 비-dict로 분할해 여집합 없음(계획 「테스트」 매핑표대로 소멸 3·접힘 5).

3. **`apps/backend/main.py`** — 4곳 편집, 모두 스케치의 before/after 그대로.
   - ① 호출부(구 `:1169`): `select_caption_style(moment.get("caption_style"), request_caption_style)` → `select_caption_style(request_caption_style)`.
   - ② render 조립(구 `:1123`): moment dict의 `"caption_style": m.get("caption_style"),` 키 삭제.
   - ③ moments 주석(구 `:62-64`): `caption_style` 서술 줄 제거, `payoff`에서 dict 닫음.
   - ④ `ProcessVideoRequest.caption_style` 주석(구 `:72-75`): "클립별 스타일이 우선" 서술 제거, 요청 스냅샷 단일 소스로 갱신(FEAT-51/55).
   - `:45` import·`:93` add_local_python_source·`resolve_caption_style`은 무변경(계획대로).

### 스케치 대비 차이

없음. 분기 순서·조건·리터럴·문구 모두 계획 「구현 스케치」와 동일하다.

### 동작 무변경 근거 (계획 재확인)

`moment.get("caption_style")`는 auto·render 모두 이미 항상 None이다(FEAT-52 배포로 웹이 클립별 스타일을 끊고 FEAT-53이 DB 컬럼까지 제거). 구 함수는 첫 분기를 건너뛰고 곧장 `request_style`을 검사했으므로, `moment_style` 인자를 지운 신 함수와 결과가 동일하다(request dict면 request, 빈 dict면 빈 dict, 아니면 None → 언어 기본값).

### 검증 (저장소 루트, 실행 출력)

- `PYTHONUTF8=1 python -m unittest discover -s apps/backend -p "test_*.py"` → `Ran 109 tests in 0.005s` / `OK`. 착수 기준선 113에서 이 모듈 8→4 감소 = 계획 기대값 109와 정확히 일치. 실행 테스트 수 0 아님, 전부 통과.
- `PYTHONUTF8=1 python -m py_compile apps/backend/main.py` → EXIT 0.
- `git diff --name-only` → `caption_style_source.py`·`main.py`·`test_caption_style_source.py` 3파일뿐. 계획 「고칠 파일」과 정확히 일치, 범위 밖 변경 없음. (LF→CRLF 경고는 줄바꿈 정규화 안내로 내용과 무관.)

### 테스트로 못 덮은 범위

- `main.py`의 4곳 실배선(`:1169`·`:1123`·주석 2곳) — `main.py`가 `whisperx`→`torch`를 import해 stdlib unittest 러너로 안 돈다. `py_compile` + `git diff`로만 확인.
- 실렌더 자막 모양 — GPU·ffmpeg·pysubs2 렌더라 러너가 판정 못 함. 이 변경은 동작 무변경이므로 확인 성격은 "회귀 없음"(auto·render 클립이 이전과 같은 자막을 낸다). 배포 후 실물 확인은 사용자 몫(`modal run`/`modal deploy`, 이 머신은 `PYTHONUTF8=1` 필요).

### 범위 밖 의존 — 후속 필요 (계획 「범위 밖 의존」)

- **`apps/backend/CLAUDE.md:139` 문서 드리프트.** 그 줄이 `select_caption_style`의 클립별 우선순위(`the clip's own style wins when present ... moment_style and its priority stay only to keep the transition window regression-free`)를 서술하는데, FEAT-55가 `moment_style`을 제거해 이제 거짓이다. `CLAUDE.md`는 backend-dev의 읽기 전용 지시 문서라 내가 고치지 않았다 — 인수 시 메인 루프가 갱신해야 한다(FEAT-43·FEAT-51 전례).
