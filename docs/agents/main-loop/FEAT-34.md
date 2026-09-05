# FEAT-34 — 메인 루프 기록

## 필수 경로 확정 (2026-09-05)

| 경로 | 채택 | 근거 |
| --- | --- | --- |
| 1 인용 전수 대조 | ○ | 전 항목 필수 |
| 2 스케치 추출·실행 | ◎ | 스케치가 283줄 스크립트 전문이다 — 돌려보는 것이 유일한 확인 |
| 3 before/after | ○ | 선행 정리 5건 + package.json |
| 4 전칭 여집합 | ○ | "W6 위반 정확히 5건", "나머지 규칙 0건", "queries 디렉터리 없음" |
| 5 돌연변이 | × | 판정 로직이 곧 이 스크립트다 — 계획서의 셀프테스트(음성 픽스처)가 그 역할을 한다 |
| 6 실제 사건 재생 | × | 외부 신호 해석 없음 |
| 7 음성 시험 | ◎ **본체** | "규칙을 어기면 종료코드 1"이 이 항목의 존재 이유다 |
| 8 실물 렌더 | × | 화면 변경 없음 |
| 9 구조적 아티팩트 | ○ | `package.json` scripts 변경, 신규 설정성 파일 |

## 라운드 1 (편집) — 결함 3건

계획서 본문에 반영했다(그쪽 「검증 라운드 기록」에 상세). 요지:
① `stage: "done"`이 proposals README 위반 → `stage: null`
② 완료 이동 요구를 절반만 옮김 → 「Completion or Closure Notes」 절 신설과 "수행 기록으로 읽힘" 기준 명시
③ proposal 이동 담당을 "구현 단계에서 판정"으로 미룸 → `web-dev.md:22`로 이미 답이 있어 메인 루프로 확정

### 경로 7(본체) — 감시 지점 검출을 구현 전에 실증

계획서의 스크립트 전문 **283줄을 바이트 그대로 추출**해 스크래치패드에서 실행했다(`process.cwd()` 루트).

- **현 트리**: W6 **5건**만 보고, **EXIT 1**. 독립 열거한 5건과 파일·줄 완전 일치, 오탐 0.
- **음성 픽스처**: 감시 지점 둘을 주입 →
  `[W5] entity client barrel must not re-export server-only ./api; use server.ts`,
  `[W4] widget internals require the slice barrel: ~/fsd/widgets/bar/ui` — **둘 다 발화, EXIT 1**
- **대조군**: 같은 픽스처를 규약대로 고침(`index.ts` → `export {};` + `server.ts` 분리, 배럴 경유 임포트)
  → `FSD boundary check passed.` **EXIT 0**

원장의 감시 지점 두 줄(FEAT-31 「회귀 방어선 부재」·FEAT-33 「경계가 유지되는지」)을 이 검사가
실제로 닫는다는 것이 구현 전에 확정됐다.

### 경로 4 — 전칭 여집합

W6 위반 독립 열거 **5건**(계획서 선행 정리 목록과 파일·줄 일치), W5 **0**, W4 **0**(FEAT-31·33이
각각 닫아둔 결과), `entities/*/api/queries/` **0개**(R2 예외가 죽은 설정이 된다는 판단이 맞다),
`entities/*/api/`는 `index.ts` 하나씩. 계획서가 범위 밖으로 보고한 pages 인트라 자기참조도
**정확히 4건**.

### 경로 1·3 — 선행 정리 근거

`features/billing/index.ts:1`의 `PLAN_TIERS`, `features/upload/index.ts:22·23·25`의 세 심볼 재수출,
`stale-policy.ts`의 임포트 **0건**(순수 상수라 배럴에 올려도 클라이언트 안전) — 전부 확인.

## 라운드 2 (무편집) — 무소득

1라운드에서 내가 계획서에 넣은 인용을 대조했다. `README:45`(stage는 pending 문서에만),
`README:249`(완료 시 status·stage·completed-at·verification-summary·Completion 절),
`README:279`(완료 이동 기준 머리말)·`:288`("수행 기록으로 읽힘"), `web-dev.md:22`(쓰기 범위가
`apps/web/src/**`) — 전부 내용까지 일치. 제안서에 Completion 절이 없다는 것도 재확인
(마지막 절이 `## Audit (2026-08-03)`).

편집 없음·소득 없음 → `plan-verifier` 독립 패스 디스패치 자격 확보.

**브리핑 주의**: `plan-verifier.md`의 브리핑 계약이 이번 세션에 강화됐다(위반 시 무소득 판정
자격 상실). 셋만 준다 — 항목ID·계획서 경로·필수 경로 목록.

## 라운드 3 (무편집) — 무소득

2라운드에서 내가 고친 여섯 중 **코드 수정(결함 6, `isTypeOnly` 가드)이 실제로 듣는지**를 시험했다.
갱신된 스케치를 다시 바이트 추출(286줄, 가드 포함 확인)해 세 방향으로 돌렸다.

| 시험 | 기대 | 결과 |
| --- | --- | --- |
| 실트리 재실행 | 회귀 없이 W6 5건 | **5건, EXIT 1** |
| `import type { db }` 픽스처 | 이제 발화하지 않아야 | **`FSD boundary check passed.` EXIT 0** |
| `import { db }` 값 임포트 대조군 | 여전히 발화해야 | **`[W8] db client import is outside approved owners` EXIT 1** |

가드가 의도한 것만 정확히 걷어낸다 — 과잉 교정도, 회귀도 없다.

수치 정정 다섯도 재확인: widgets 소비 9건, `web/package.json:10`의 check,
`admin/package.json:13`(check)·`:17-19`(verify 셋), admin 스크립트 730/207줄,
`entities/clip/index.ts`의 lib 재수출. 전부 실측과 일치.

편집 없음·소득 없음 → `plan-verifier` 독립 패스 2사이클 디스패치.

---

# 계획서에서 옮겨온 라운드 기록 (2026-09-06)

아래는 `docs/plans/FEAT-34.md`가 중복 보관하던 라운드 기록을 옮긴 것이다. 런북(`CLAUDE.md` 4단계)이
정한 자리가 여기이고, 계획서 쪽 중복은 감사 표면만 늘렸다(독립 패스 3사이클의 유일한 결함이 그
기록 안의 낡은 줄 수였다). 옮기면서 그 수치를 시점과 함께 정정했다.

## 검증 라운드 기록 (메인 루프, 2026-09-05 1라운드)

필수 경로: 1(인용 전수 대조) · 2(스케치 추출·실행) · 3(before/after) · 4(전칭 여집합) ·
**7(음성 시험 — 이 항목의 본체)** · 9(구조적 아티팩트 — 신설 설정·스크립트).
5·6·8은 제외(판정 로직은 스크립트 자신이라 5는 셀프테스트가 대신하고, 외부 신호 해석 없음,
화면 변경 없음). 증거는 `docs/agents/main-loop/FEAT-34.md`.

**결함 ① (구현 영향) — `stage: "done"`은 규약 위반.** proposals README:45가 "`completed` 또는
`closed` 문서는 `stage: null`로 둔다"고 못 박는다. 실제 completed 문서 표본도 `stage` 값을
쓰지 않는다. 그대로 구현하면 제안서가 **자기 규약을 어긴 상태로** 완료 처리된다. → `stage: null`로
정정하고 근거를 붙였다.

**결함 ② (구현 영향) — 완료 이동 요구를 절반만 옮겼다.** README:249는 frontmatter 넷과 함께
**「Completion or Closure Notes」 절 갱신**을 요구하고, README:279-288의 이동 기준 여덟 중 하나는
"문서가 더 이상 실행 전 제안서가 아니라 수행 기록으로 읽힘"이다. 계획서는 frontmatter만 적었다.
이 제안서에는 Completion 절이 아예 없고(마지막 절이 `## Audit (2026-08-03)`), 본문은 여전히
미래형이다. → 절 신설과 담을 내용을 명시했다.

**결함 ③ (정밀도) — 미뤄둔 담당 물음이 이미 답이 있다.** 계획서가 proposal 이동을 "구현 단계에서
쓰기 범위 밖으로 판정되면 그 부분만 `보류`"로 남겼는데, `.claude/agents/web-dev.md:22`가 쓰기
범위를 `apps/web/src/**`와 테스트 파일로 한정한다 — `docs/**`는 밖이다. 판정할 게 아니라 정해져
있다. → 담당을 메인 루프로 확정했다(FEAT-31·33에서 `apps/web/CLAUDE.md`를 같은 이유로 메인
루프가 처리한 전례).

**통과한 것 — 특히 경로 7(본체)**

계획서의 스크립트 전문 283줄을 **바이트 그대로 추출해 실제로 돌렸다**(스크래치패드, `process.cwd()`
루트).

- **현 트리 실행**: 정확히 **W6 5건**만 보고하고 EXIT 1. 내가 독립 열거한 5건과 파일·줄이 완전히
  일치하며 오탐 0(W1·W2·W3·W4·W5·W7·W8 전부 0 — 계획서 표와 같다).
- **음성 시험(감시 지점 둘)**: 스크래치패드에 픽스처 트리를 만들어
  ① `entities/foo/index.ts`가 `./api`(`import "server-only"`)를 재수출 →
  `[W5] entity client barrel must not re-export server-only ./api; use server.ts`,
  ② `src/app/page.tsx`가 `~/fsd/widgets/bar/ui`를 임포트 →
  `[W4] widget internals require the slice barrel` — **둘 다 발화, EXIT 1**.
- **대조군**: 같은 픽스처를 규약대로 고치니(`index.ts` → `export {};` + `server.ts` 분리,
  임포트를 배럴 경유로) `FSD boundary check passed.` **EXIT 0**.

즉 **원장의 감시 지점 두 줄을 이 검사가 실제로 닫는다**는 것이 구현 전에 실증됐다.

**경로 4 전칭 여집합** — W6 위반을 독립 열거해 **정확히 5건**, 계획서의 선행 정리 목록과 파일·줄이
일치. W5(엔티티 배럴의 `./api` 재수출) 0건, W4(비-fsd 소스의 widgets 내부 임포트) 0건 —
FEAT-31·33이 각각 닫아둔 결과다. `entities/*/api/queries/` 디렉터리 **0개**(R2 예외가 죽은 설정이
된다는 계획서 판단이 맞다), `entities/*/api/`는 `index.ts` 하나씩뿐. 계획서가 범위 밖으로 보고한
pages 인트라 자기참조도 **정확히 4건**(`UploadPodcast.tsx:26·27`, `upload-detail/ui/index.tsx:10·11`).

**경로 1·3** — 선행 정리 5건의 근거를 전수 확인: `features/billing/index.ts:1`이 `PLAN_TIERS`를,
`features/upload/index.ts:22·23·25`가 `query-options`·`useDeleteUploadedFile`·`useResumeUploadDraft`를
각각 재수출한다. `stale-policy.ts`는 임포트 **0건**의 순수 상수(`export const PROCESSING_STALE_POLICY = {`)라
배럴에 올려도 클라이언트 안전하다는 판단이 맞다.

## 검증 라운드 2 (plan-verifier 독립 패스 1사이클) — 결함 6건, 전부 반영

독립 패스가 여섯을 냈고 **구현을 틀리게 하는 것은 0건**이라고 스스로 분류했다(before 전부 바이트
일치, after-import가 실재 배럴로 해석, package.json after 상태가 구조적으로 유효). 여섯 다 메인
루프가 재현해 본문에 반영했다.

| # | 무엇 | 실측 | 반영 |
| --- | --- | --- | --- |
| 1 | widgets 소비 "8곳" | **9곳**(계획서 자신의 내역 합도 9: 5×1+2×2) | 9로 |
| 2 | `web/package.json:8`의 check | 실제 **:10**(8행은 `inngest-dev`), 문자열은 일치 | 줄번호 정정 |
| 3 | admin `check(:11)`·`verify(:16-18)` | 실제 **:13**·**:17-19** | 정정 |
| 4 | admin 스크립트 731/208줄 | 실제 **730/207**. `typescript` 선언은 `^5.8.2`(설치본 5.9.3) | 정정 + 선언값 명시 |
| 5 | "나머지 7개는 `export {}` 또는 model만" | `entities/clip/index.ts`가 **lib**를 재수출(`clipTypeLabel`) | 세 부류로 분해 |
| 6 | W8이 "값 임포트"라 하는데 코드가 타입 임포트도 발화 | 픽스처 실측: `import type { db }`가 값 임포트와 **동일하게** `[W8]` EXIT 1 | 스케치에 `isTypeOnly` 가드 추가 |

**6에 대한 판단**: 규칙 서술을 코드에 맞추는 대신 **코드를 서술에 맞췄다.** `import type { db }`는
컴파일 시 소거돼 런타임 결합이 없으므로 경계 위반이 아니다 — W8이 잡으려는 것은 런타임 db 접근이다.
`verbatimModuleSyntax`가 켜져 있어 타입 사용은 반드시 `import type`/inline `type`으로 표기되므로
`isTypeOnly` 가드가 안전하다. 현 트리 W8=0이라 지금은 무영향이지만, 나중에 누가 타입만 참조하려다
거짓 위반을 받는 것을 막는다.

**독립 패스가 통과시킨 것**: 스크립트를 바이트 추출해 실트리 실행(당시 283줄, 가드 추가 후 286줄) — W6 5건·오탐 0·EXIT 1
(메인 루프 1라운드와 같은 결과를 독립 재현). 음성 시험을 **여덟 규칙 전부**에 돌려 각각의 음성이
발화하고 양성이 통과함을 확인했고, W8은 owner 목록에서 빼는 **변이**까지 돌려 등록이 장식이 아님을
보였다. 구조적 아티팩트 검사(경로 9)로 package.json after 상태를 JSON 파싱해 키 충돌 0·유효
재직렬화·`npm test` 글롭이 `scripts/`를 제외함(→ `verify:fsd:test` 별도 실행 필요)을 확인.

**결과**: 편집 라운드. 다음은 무편집 패스 + 새 독립 패스.

## 검증 라운드 3 (plan-verifier 독립 패스 2사이클) — 결함 1건

**결함 (문서 위생, 상호참조)**: 「현재 동작」 38행이 guidelines를
`docs/conventions/fsd-architecture-guidelines.md:108`로 인용했다. 이 계획서는 저장소 루트
`docs/plans/`에 있어 그 경로는 **루트 기준으로 해석되는데, 루트 `docs/conventions/`에는
`.gitkeep`뿐**이다(실측). 실제 파일은 `apps/web/docs/conventions/...` 하나뿐이다. 같은 계획서가
바로 옆에서는 접두사를 정확히 구분해 쓴다(`docs/release-checks.md:32·43`은 루트,
`apps/web/docs/proposals/README.md`는 접두사 있음) — 이 한 줄만 빠졌다. → `apps/web/` 접두사 추가.
줄 내용(108행 = 「슬라이스 공개 API를 런타임 기준으로 나눈다」)은 검증자가 직접 재독해 정확함을
확인했고, §4 규약은 계획서 본문 72·81행과 `apps/web/CLAUDE.md`에 중복 서술돼 있어 구현 영향은 없다.

**독립 패스 2사이클이 통과시킨 것** — 1사이클보다 넓게 갔다.

- **경로 3에서 after 상태를 실제로 조립했다**: 선행 정리 5건을 인메모리로 적용하고
  `entities/uploaded-file/index.ts`에 `PROCESSING_STALE_POLICY` 재수출을 더한 뒤
  `analyzeFsdBoundaries`를 돌려 **`[]`(클린)** 을 확인했다. 즉 "5건을 고치면 0이 된다"가
  주장이 아니라 실측이 됐다.
- **경로 4에서 계획서의 산술을 재구성했다**: "크로스 슬라이스 딥 임포트 27건 = 정당 배럴 21 +
  정당 server-action 1 + 위반 5"를 독립 검산 — `entities/*/server` 임포트 32건에서 비-fsd 소스
  11건을 빼면 21, 거기에 `features/upload/api` 1건과 위반 5건. **정확**. `db` 값 임포트도 12건
  전수 열거해 전부 승인 owner에 포섭됨을 확인.
- **경로 7에서 내 2라운드 수정을 독립 재현**: W8이 owner 값 임포트 `[]` · 비-owner 값 임포트
  `[W8]` · `import type { db }`와 `import { type db }` **둘 다 `[]`** — `isTypeOnly` 가드가
  inline `type` 지정자까지 정확히 거른다. owner 변이(`clip/api` 형제로 바꾸기)도 `[W8]`을 내
  등록이 장식이 아님을 확인.
- 게이트 베이스라인도 실행 — `typecheck` EXIT 0, `test` **77/77**, `lint` 경고·에러 0.

**결과**: 소폭 편집(경로 접두사 하나). 다음은 새 독립 패스.

## 라운드 4 (plan-verifier 독립 패스 3사이클) — 결함 1건, 구조 정리로 대응

**결함**: 계획서에 중복 보관하던 라운드 기록이 스크립트를 "283줄"이라 적었는데 현재 펜스 본문은
**286줄**이다. 283은 라운드 1 시점의 실제 값이었고(그때 내가 추출해 센 수), 라운드 2에서 내가
`isTypeOnly` 가드 3줄을 더하면서 286이 됐는데 기록은 안 고쳤다. 구현 영향 없음(구현자는 펜스를
복사하지 서술된 줄 수를 참조하지 않는다).

**대응 — 숫자만 고치지 않고 구조를 바꿨다.** 이번 사이클의 유일한 결함이 **내가 계획서에 중복해
쓴 기록 안**에 있었다는 사실이 핵심이다. 라운드마다 기록을 덧붙이면 그 기록이 다음 사이클의 새 감사
표면이 되어, 검증이 계획의 품질이 아니라 **내 산문**으로 수렴한다. 실제로 독립 패스 3사이클의 소득은
① 수치·줄번호 오기 6건 ② 경로 접두사 1건 ③ 내 기록의 낡은 줄 수 1건이었고, **구현 지시 결함은
1사이클부터 0건**이었다.

런북 `CLAUDE.md` 4단계가 이미 "검증 라운드 기록은 `docs/agents/main-loop/<항목ID>.md`에 남긴다"고
정한다. 규칙이 있는데 내가 양쪽에 썼다 — 브리핑 계약 때와 같은 부류의 실수다. 계획서에서 111줄을
걷어내고 포인터만 남겼다.

**독립 패스 3사이클이 통과시킨 것**: 인용 전수 대조 — 이번엔 `package.json`의 scripts 14개를 전수
대조(추가·누락 0)하고 admin 선례 인용 열여섯 곳을 다시 확인해 **불일치 0**. 스케치 실행 — 실트리
W6 5건·오탐 0·EXIT 1. before/after — after 상태를 인메모리 조립해 `analyzeFsdBoundaries` **`[]`**
(파일 265개 순회). 전칭 여집합 — "27 = 21 + 1 + 5" 산술 독립 검산, `db` 값 임포트 12건 전수가
owner에 포섭, 상대경로 임포트 12건이 전부 슬라이스 내부(크로스 0). 음성 시험 — 픽스처 **18개
전부 통과**(W1~W8 음성·양성, `isTypeOnly` 가드가 `import type`·inline `type` 둘 다 거름, owner
변이 발화). 구조적 아티팩트 — package.json after JSON 유효·중복 키 0.

**결과**: 편집(구조 정리). 다음은 새 독립 패스 — 이번엔 계획서에 라운드 기록이 없으므로 감사
표면이 구현 지시로만 좁혀진다.

