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
