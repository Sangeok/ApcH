# FEAT-55 — 메인 루프 기록

## 필수 경로 확정 (2026-09-20)

카탈로그(`docs/plans/verification-paths.md`)에서 **여섯**을 골랐다.

| # | 경로 | 판정 | 이유 |
| --- | --- | --- | --- |
| 1 | 인용 전수 대조 | **채택** | 모든 항목 |
| 2 | 스케치 추출·실행 | **채택** | 스케치에 파이썬 코드 블록 9개(모듈 전체 교체 1 + before/after 4쌍) |
| 3 | before/after 기계 적용 | **채택** | `main.py` 기존 파일 수정 넷 |
| 4 | 전칭 여집합 열거 | **채택** | 전칭이 여럿 — 「호출부는 한 곳뿐」, 「영구히 None」, 「import·add_local_python_source·resolve_caption_style은 무변경」, 「여기 적히지 않은 파일은 고치지 않는다」 |
| 5 | 돌연변이 검사 | **채택** | 순수 판정 함수의 **변경**. 틀리면 조용히 언어 기본값으로 접혀(silent fallback) 사용자 스타일 무시로 나타난다 — FEAT-51과 같은 이유 |
| 7 | 음성 시험 | **채택** | 계획서가 (A) 채택 근거를 `test_modal_image_sources.py`의 **비대칭**(imports⊆registered만 검사)에 건다. 그 주장이 참이어야 (B) 기각이 선다 |
| 6 | 실제 사건 재생 | **비채택** | 실측 프로덕션 페이로드가 없다. 문제의 외부 신호(render moments)의 **생산자가 저장소 안**(`apps/web`)이라 정적 전수 열거(경로 4)가 표본 재생보다 강하다. 이 판단을 여기 남긴다 |
| 8 | 실물 렌더 | **비채택** | 화면 변경 없음(백엔드 전용) |
| 9 | 구조적 아티팩트 | **비채택** | schema·config·생성 파일 변경 없음 |

## 라운드 1 — 여섯 경로 전수 (소득 3건)

하니스: `scratchpad/feat55/`.

**경로 1 — 인용 전수 대조.** 계획서의 `파일:줄` 인용 **27건**을 (파일, 줄번호, 기대
부분문자열) 쌍으로 기계 대조 — **불일치 0**. 범위 라벨도 따로 확인했다: `:62-64` 주석 3줄 참,
`:72-75` 주석 4줄 + `:76` 필드 참, `:128-144` `validate_moments` 본문 참,
`test_caption_style_source.py` 메서드 수 **8** 참.

**경로 2 — 스케치 추출·실행.** 계획서에서 ```python 블록 **9개**를 바이트 그대로 추출.
모듈 전체 교체 블록을 샌드박스에 놓고 `py_compile` **OK**, import해 시그니처
`(request_style)` 확인, 네 동작(dict→동일객체 / None→None / {}→동일객체 / 비-dict→None)
모두 일치, `sys.modules`에 금지 import(torch·boto3·cv2·pysubs2·modal·whisperx·fastapi) **0건**.

**경로 3 — before/after 기계 적용.** before 4개가 각각 현재 `main.py`에 **정확히 1회**
출현하고, 손 개입 없이 after로 치환됐다. 치환본 `py_compile` **OK**. 치환 후 `caption_style`
출현 32 → 27.

**경로 4 — 전칭 여집합 열거.** 넷을 열거했다.
- `select_caption_style` 전역 grep → 프로덕션 실체는 `main.py:45`(import)·`main.py:1169`(호출)
  ·`caption_style_source.py:12`(정의)뿐. **호출부 한 곳** 참.
- **「`moment.get("caption_style")`은 영구히 None」의 생산자 전수** — render moments의 유일한
  생산자는 `entities/clip-draft/api/index.ts:83` `getSelectedRenderMomentsForAttempt`이고
  반환 키가 정확히 여섯(`index·start·end·type·hook·payoff`)으로 `caption_style` **없음**.
  소비 경로는 `features/upload/api/dispatch-processing.ts:162` → `inngest/functions.ts:374`
  한 줄기. `app/api/webhooks/modal/route.ts`의 `moments`는 analyze **역방향**(Modal→웹)이라
  렌더 요청과 무관. auto 쪽은 `moment_prompt.py`가 요구하는 키에 `caption_style` **0건**.
- 패치 후 `main.py`에 남는 `caption_style` **17줄 전수** 확인 — 전부 요청 스냅샷 계열
  (`request_caption_style`·`resolve_caption_style`·`process_clip`·자막 두 함수)이고
  moment 레벨 경로는 하나도 없다. 「무변경」 참.
- `resolve_caption_style`이 `main.py` 밖에서 테스트되는가 → **0건**. (A) 이유 ① 참.

**경로 5 — 돌연변이 검사.** 계획서 「테스트」 4케이스를 실행 가능하게 옮기고(먼저 원본에서
`Ran 4 tests OK`) 구현에 **8종**을 심었다: 분기 반전 · 사본 반환 · truthiness 가드 ·
가드 확장(dict,str) · 가드 제거(is not None) · 항상 None · 항상 그대로 반환 · 빈 dict를 None으로.
**8/8 전부 사멸, 생존 0** — 명세에 구멍 없음.

**경로 7 — 음성 시험.** 계획서가 (A) 채택의 근거로 든 `test_modal_image_sources.py`의
비대칭을 실제로 돌렸다.

| 조작 | 결과 |
| --- | --- |
| 무변경 | 통과 |
| ① 등록만 제거(import 잔존) | **실패** ← 잡힌다 |
| ② import·모듈 파일 제거(등록 잔존) | **통과** ← 안 잡힌다 |

②가 통과한다는 것이 (B)(모듈째 제거)의 배포 시점 무증상 실패 리스크를 실증한다.
계획서의 (B) 기각은 추측이 아니라 실측 위에 서 있다.

**기준선 실측**: `Ran 113 tests ... OK` — 계획서와 일치. 4메서드 중 하나가 `subTest`
2값인 샌드박스가 `Ran 4 tests`로 보고되는 것도 확인했으므로, `subTest`는 계수에 안 들어가고
8메서드 → 4메서드 = **113 → 109** 기대값이 성립한다.

### 소득 3건 (전부 문서 위생 / 경미)

| # | 결함 | 근거 |
| --- | --- | --- |
| 1 | 범위 라벨 off-by-one — `render 조립 moment 키 — before(:1117-1126)` | 스케치 블록은 9줄 = `1117-1125`. `1126`은 `],`로 블록 밖 |
| 2 | 구 8케이스 매핑 열거가 **5건뿐** | 「moment_style 분기를 다루던 것들」이라 쓰고 5개를 나열했으나, 구4 `test_empty_dict_moment_is_kept`(moment 쪽 빈 dict)와 구3 `test_both_none_is_none`(moment=None)도 그 분기를 다룬다. 구8은 새 케이스 3 설명에만 등장. 8 중 3이 매핑에서 증발 |
| 3 | 테스트 파일 **모듈 독스트링** 갱신이 「고칠 파일」에 없음 | `test_caption_style_source.py:1-6`이 FEAT-51 계약(`moment 스타일 우선`)을 서술한다. 케이스만 다시 쓰면 그 문장이 거짓으로 남는다 |

**적용한 편집(일괄 1회)**: ① 라벨을 `:1117-1125`로. ② 「테스트」의 매핑 문장을 **구 8케이스
전수 표**(소멸 3 · 접힘 5)로 교체하고, 새 4케이스가 입력 공간을
`dict / 빈 dict / None / 비-dict`로 분할해 여집합이 없음을 명시. ③ 「고칠 파일」의 테스트 행에
독스트링 갱신 지시를 추가.

## 라운드 2 — 무소득

편집이 코드 블록을 건드리지 않았음을 기계로 확인했다: 재추출 블록 **9개**(동일), before 4개
여전히 1회 일치, 모듈 스케치 블록과 치환본이 라운드 1 결과와 **바이트 동일**.
「범위 밖 의존」·「대안」의 남은 주장도 대조했다 — `CLAUDE.md:139` 인용 정확,
(A)① `resolve_caption_style` 무테스트 참, (A)② 비대칭 실증됨(경로 7).
형제 순수 모듈 목록은 예시 나열이지 전칭이 아니다(실제 6개 중 4개 거명).

**소득 0 → `plan-verifier` 독립 패스 디스패치 자격.**
