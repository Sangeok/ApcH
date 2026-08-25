# FEAT-20 — 게이트 도장·반려 성공 후 카드 버튼을 「반영 대기」로 잠그기

구현일: 2026-08-25 (게이트②, 보드 커밋 2f5cff7 — `구현승인`)
계획서: `docs/plans/FEAT-20.md` (검증 클린 패스 2026-08-25, 독립 무편집 1라운드 — plan-verifier 2사이클째)

## 무엇을 했나

두 화면(결재함 `pages/pipeline` + 서류철 `pages/doc-viewer`)이 공유하는 게이트 feature에
**카드 단위 잠금**을 추가했다. 도장·반려가 성공하면 그 카드의 도장 버튼은 비상호작용 잠금 칩
(`도장 찍음 · 보드 반영 대기` 등)으로 바뀌고 반려 패널은 사라진다. raw CDN 잔상(최대 5분) 동안
같은 status로 카드가 다시 렌더돼도 버튼이 거짓 어포던스로 남지 않는다. 서버 스테일 가드는 불변
(데이터 방어는 이미 옳고, 이 항목은 어포던스만 고친다).

잠금은 카드마다 하나씩 감싸는 컨텍스트(`GateCardLock` Provider — DOM 미생성)로 공유해,
서로 다른 하위 트리에 있는 도장 버튼과 반려 패널이 한 성공에 함께 잠긴다. 성공 분기에서만
잠그므로 실패(스테일 등)는 버튼을 그대로 두어 새로고침 후 재시도가 열려 있다.

## 고친 파일 (신규 1 + 수정 7 — 계획서 「고칠 파일」 표와 정확히 일치)

| 파일 | 변경 |
| --- | --- |
| `src/fsd/features/transition-pipeline-gate/ui/gate-card-lock.tsx` (신규) | `GateCardLock` Provider + `useGateCardLock` 훅 + 비상호작용 `LockedChip` |
| `src/fsd/features/transition-pipeline-gate/ui/gate-transition-button.tsx` | 잠금 컨텍스트 읽기, 도장 성공 시 `setLock({label:GATE_LOCK_LABEL, marker:"bg-stamp"})`, 잠기면 `LockedChip` 렌더 |
| `src/fsd/features/transition-pipeline-gate/ui/reject-actions.tsx` | 잠금 컨텍스트 읽기, 잠기면 `null`, 반려 성공 시 `setLock({label:rejectLockLabel(action), marker:ACTION_META[action].marker})` |
| `src/fsd/features/transition-pipeline-gate/model/transitions.ts` | 순수 추가: `type CardLock`, `GATE_LOCK_LABEL` 상수, `REJECT_LOCK_WORD` 맵, `rejectLockLabel(action)` |
| `src/fsd/features/transition-pipeline-gate/model/transitions.test.mjs` | `GATE_LOCK_LABEL` 리터럴 + `rejectLockLabel` 3분기 단언(신규 describe 1 = suite +1, test +2) |
| `src/fsd/features/transition-pipeline-gate/index.ts` | `GateCardLock` public export 추가(다른 export 불변) |
| `src/fsd/pages/pipeline/ui/index.tsx` | `InboxCard`의 도장 버튼 행 + 반려 패널을 `<GateCardLock>`으로 감싸고 import 추가 |
| `src/fsd/pages/doc-viewer/ui/index.tsx` | `DocViewer`의 제목 행 + 반려 패널을 `<GateCardLock>`으로 감싸고 import 추가 |

범위 밖(고치지 않음): `scripts/verify-fsd-boundaries.mjs`(새 fetch/DB/Sentry owner 없음, public boundary는
`GateCardLock` 컴포넌트 export 하나뿐이라 owner 규칙 무변경), 서버 액션·스테일 가드·투영 경로(raw CDN),
`apps/admin/CLAUDE.md`(읽기 전용 — 아래 handoff로 보고).

## 스케치 대비 차이

**없음.** 분기·조건·리터럴·사용자 노출 문구를 스케치대로 바이트 이식했다.

- §1 `useGateCardLock`의 `setLock: () => undefined`(표현식 본문 — `@typescript-eslint/no-empty-function`
  회피)를 그대로 유지. lint EXIT 0으로 실증됨.
- §1 `LockedChip`은 `cn("inline-block size-2 rounded-[1px]", lock.marker)` + `text-xs text-muted-foreground`,
  점은 `aria-hidden="true"`. 정적(애니메이션 없음).
- §2 문구 4종 리터럴: 도장 `도장 찍음 · 보드 반영 대기` / bounce `되돌림 · 보드 반영 대기` /
  hold `보류함 · 보드 반영 대기` / discard `폐기함 · 보드 반영 대기`. `marker`는 UI가 실어 보냄
  (도장=`bg-stamp`, 반려=`ACTION_META[action].marker`) — model은 색을 정하지 않음.
- §3 도장 성공 분기에 `setLock(...)`을 `toast.success`와 `router.refresh` 사이에 삽입, 렌더 진입 직전
  `if (lock !== null) return <LockedChip lock={lock} />;` 가드. `STAMP_BUTTON_CLASS`·`<Button>` 본문 불변.
- §4 반려 성공 분기에 `setLock(...)` 삽입, 훅 뒤 이른 반환에 `if (lock !== null) return null;`를
  `if (actions.length === 0) return null;` **앞에** 추가(훅은 조건부 반환 앞에서 전부 호출).
- §6·§7 골격형: 명시된 두 블록만 `<GateCardLock>`으로 감싸고 내부 내용 불변·들여쓰기 +2.
  `<p>{item.line}</p>`·`<DocLinks>`(pipeline)와 종류 배지 주석·탭 nav(doc-viewer)는 래퍼 밖에 유지.
- import 멤버 순서는 기존 case-insensitive 정렬을 유지(`GATE_LOCK_LABEL`·`rejectLockLabel` 삽입 위치 포함).
  ESLint 0경고로 확인.

## 검증 (넷 다 실제 실행, EXIT 0)

```
npm run check -w apps/admin
  → verify:fsd:test 13/13 pass · verify:fsd migration pass · ESLint 0 warnings/errors · tsc --noEmit 0
  → EXIT 0

npm test -w apps/admin
  → tests 278 · suites 59 · pass 278 · fail 0 (기준선 276/58 → 278/59, 정확히 +2 test·+1 suite)
  → EXIT 0

npm run verify:fsd:final -w apps/admin
  → FSD boundary check passed (final).
  → EXIT 0

SENTRY_DISABLE_AUTO_UPLOAD=true npm run build -w apps/admin
  → Compiled successfully · 8/8 static pages · /pipeline 1.63 kB (First Load 130 kB) ·
    /pipeline/docs/[...slug] 372 B (First Load 129 kB)
  → EXIT 0
```

`git status --short`로 변경 파일이 계획서 8개(수정 7 + 신규 1)와 정확히 일치함을 확인.
(`apps/web/.claude/settings.local.json`은 세션 시작 시점부터 M 상태였던 범위 밖 파일 — 손대지 않음.)

## 못 덮는 범위 (Node 러너에 DOM·React 테스트 도구 없음 → 배포 후 데스크톱+폰 수동 smoke)

계획서 「못 덮는 범위」 목록 그대로:

- 잠금 컨텍스트 공유: 카드 안 두 버튼이 한 성공에 함께 잠기는지(도장→반려 패널도 사라짐,
  반려→도장 버튼도 칩으로).
- `LockedChip`이 도장 버튼 슬롯에 나타나고 반려 패널이 사라지는 시각 결과, 점 마커 색 4종
  (stamp/active/hold/destructive) 3:1·`text-xs` muted AA.
- **실패는 잠그지 않음**: 스테일 등 실패 시 버튼이 활성으로 남아 재시도 가능한지.
- `router.refresh()` 후에도 클라 잠금 상태가 유지되고(컨텍스트 useState 보존), 보드가 뒤집혀
  카드가 결재함/서류철에서 빠질 때 Provider가 언마운트되며 잠금이 자연히 사라지는지.
- 하드 리로드·이탈/재방문 시 CDN 창(≤5분) 동안 버튼 재노출(클라 메모리 한계 — 계획서 결정대로
  후속 항목 여지, 서버 스테일 가드가 여전히 잘못된 커밋을 막음).
- 서류철(doc-viewer) 게이트②(검토대기)에서 결재함과 같은 잠금이 도는지(feature 공유의 둘째 소비자).

순수 문구는 `transitions.test.mjs`가 덮음(GATE_LOCK_LABEL 리터럴 + rejectLockLabel 3분기).

## CLAUDE.md 동기화 handoff (읽기 전용 → 메인 루프)

`apps/admin/CLAUDE.md`는 읽기 전용이라 직접 고치지 않음. 다음 갱신 필요:

1. 「테스트 인벤토리」(:35~37): **27파일·58suite·276test → 27파일·59suite·278test**
   (파일 수는 불변 — 신규 test 파일 없이 기존 `transitions.test.mjs`에 describe 1개 추가).
2. 같은 표의 `transitions.test.mjs` 행(:61) 설명에 잠금 문구 계약 추가:
   현재 "승인·반려 전이, 최소 diff, stale/format 거부, 되돌리기의 `검증:` 줄 제거(1줄·2줄)"에
   **"카드 잠금 칩 문구(`GATE_LOCK_LABEL` 리터럴·`rejectLockLabel` 3분기)"**를 잇는다.
