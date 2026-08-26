# FEAT-22 — 파이프라인 보드 읽기의 최대 5분 지연 제거 (raw CDN → contents API)

## 구현 (2026-08-26, 게이트②)

계획서 `docs/plans/FEAT-22.md`의 스케치를 그대로 이식했다. 보드 읽기(투영) owner
`getPipelineBoard()`가 raw.githubusercontent.com(엣지 캐시 max-age=300, 도장 직후 최대
5분 잔상)을 읽던 것을, 토큰이 있으면 GitHub contents API로 dev HEAD를 직접 읽어(쓰기 경로
`commit-gate-transition.ts:45`와 동일 방식) 잔상을 없애도록 교체했다. 토큰 부재 시엔 미인증
contents API(60/h) 대신 raw CDN으로 폴백한다. shape/디코드 실패는 fail-closed(throw) —
런타임 raw 폴백을 하면 조용히 낡은 보드를 줘 이 항목이 없애려는 버그를 되살리기 때문이다.
지연이 사라졌으므로 실행 콘솔 게이트대기 설명과 잠금 칩 두 문구에서 "최대 5분"·"보드 반영
대기" 지연 전제를 제거했다(칩·재클릭 방지 메커니즘 자체는 유지).

### 변경 파일 (7 — 계획서 「고칠 파일」 표와 1:1)

| # | 파일 | 변경 |
| --- | --- | --- |
| 1 | `src/fsd/entities/pipeline/api/queries.ts` | 스케치 1) after로 전면 교체 — `~/env` import, 토큰 있으면 `${BOARD_CONTENTS_URL}?ref=${BOARD_BRANCH}` GET(Accept+Bearer, no-store) → base64 디코드 → parseBoard, 토큰 없으면 raw CDN 폴백. shape 누락·non-OK는 throw. 주석 블록 갱신 |
| 2 | `src/fsd/entities/pipeline/api/queries.test.mjs` | 재작성 — repo-doc `~/env` getter 모의 패턴. 토큰 있음 3케이스(contents API 정확 호출·non-OK 503 throw·content 누락 fail-closed(raw 미폴백 단언)) + 토큰 없음 2케이스(raw no-store 정확 호출·non-OK 503 throw) |
| 3 | `src/fsd/features/run-pipeline-command/model/run-plan.ts` | 게이트대기 설명에서 " 방금 찍었다면 보드 반영까지 최대 5분 걸립니다." 문장 제거 |
| 4 | `src/fsd/features/run-pipeline-command/model/run-plan.test.mjs` | `GATE_WAITING_DESC` 상수를 새 문구로 갱신, `it()` 제목의 "(반영 지연 포함)" 제거 |
| 5 | `src/fsd/features/transition-pipeline-gate/model/transitions.ts` | `GATE_LOCK_LABEL` `"도장 찍음 · 보드 반영 대기"`→`"도장 찍음"`, `rejectLockLabel` 반환에서 " · 보드 반영 대기" 접미 제거. `CardLock` 주석·`GATE_LOCK_LABEL` 주석 갱신 |
| 6 | `src/fsd/features/transition-pipeline-gate/model/transitions.test.mjs` | `GATE_LOCK_LABEL`·`rejectLockLabel` 3분기 리터럴 단언을 새 값으로, `it()` 제목 둘을 계획서 고정 리터럴로 갱신 |
| 7 | `src/fsd/entities/pipeline/config/github.ts` | `BOARD_CONTENTS_URL` 부착 주석 2줄→3줄(읽기 주 경로도 contents API·raw는 폴백) — 코드 무변경 |

`scripts/verify-fsd-boundaries.mjs`는 고치지 않았다 — `queries.ts`는 이미 fetch owner라
owner 집합(6개)이 그대로다. `~/env` import는 선례 owner 둘(agent-report·repo-doc)이
이미 통과하므로 경계를 깨지 않는다(verify:fsd:test 12번 케이스 "four production fetch
owners"가 통과함으로 확인).

### 스케치 대비 차이

없음. 프로덕션 코드는 분기·조건·리터럴·사용자 노출 문구 전부 스케치대로 바이트 이식했다
(토큰 조기 반환 후 `Authorization` 무조건 부착, `Accept: application/vnd.github+json`만,
`Buffer.from(...,"base64").toString("utf-8")`, fail-closed throw 문구
`"Failed to read PROJECT_BOARD.md content"`). 테스트는 계획서 「테스트」 절 명세대로 자작
(스케치가 테스트 코드를 주지 않음) — 명세한 5케이스를 전부 포함하고, content 누락 케이스에
`assert.notEqual(calls[0][0], BOARD_RAW_URL)`로 "raw 미폴백"을 명시 단언했다.

### 검증 (전부 직접 실행, EXIT 0)

| 명령 | 결과 |
| --- | --- |
| `npm run check -w apps/admin` | EXIT 0 — verify:fsd:test 13/13, verify:fsd(migration) 통과, ESLint 0 경고, `tsc --noEmit` 0 |
| `npm test -w apps/admin` | 281 pass / 60 suite / 0 fail (278→281, queries.test.mjs 2→5) |
| `npm run verify:fsd:final -w apps/admin` | EXIT 0 — final 통과(fetch owner 불변) |
| `SENTRY_DISABLE_AUTO_UPLOAD=true npm run build -w apps/admin` | EXIT 0 — `/pipeline` 1.63 kB / First Load 130 kB |

### 못 덮는 범위 (Node 러너·DOM/외부 I/O 없음 — 배포 후 수동 확인)

- 실제 GitHub contents API 응답의 base64 라인 wrapping·`encoding: "none"`(>1MB) 경로 —
  보드가 1MB 훨씬 아래라 실사용 미발생, 라이브 응답 자체는 모의로만 검증.
- 토큰 부재 폴백이 다시 최대 5분 잔상을 낸다는 성질 — 프로덕션은 토큰 설정이라 미경유.
  토큰 설정 배포에서 도장→즉시 반영을 데스크톱에서 수동 확인 필요.
- 잠금 칩·실행 콘솔 설명의 시각/렌더(칩 새 문구 렌더·`router.refresh` 후 카드 이탈)는 수동 smoke.

### 보드·백로그 편집

- `PROJECT_BOARD.md` FEAT-22 행: 체크박스 `[ ]`→`[x]`, `status: 구현승인`→`완료`,
  `결과:` 줄을 구현 요약으로 교체(150자 이내). `근거:` 불변, `검증:` 줄은 원래 없어 신설하지 않음.
- `TASK_BACKLOG.md`: "Admin / Dashboard" 아래 FEAT-22 항목 제거. 인접 무결 확인 —
  BUG-08(Backend/Pipeline)·FEAT-23(이제 Admin/Dashboard 첫 항목)·BUG-07 각 제목·area·source 전문 온전.

### 비고 (읽기 전용 `apps/admin/CLAUDE.md` → 메인 루프 동기화, 계획서 「범위 밖 의존」 세 줄)

admin-dev 쓰기 범위 밖이라 손대지 않았다. 인수 시 시효가 되는 유지 인벤토리 세 곳:

1. `CLAUDE.md:37` 테스트 인벤토리 "278개 test" → "281개 test"(파일 27·suite 59 불변 —
   queries.test.mjs가 2→5 test로 늘 뿐).
2. `CLAUDE.md:47` `queries.test.mjs` 계약 행 "raw board no-store GET과 non-OK 실패" →
   "토큰 시 contents API GET(base64 디코드·shape fail-closed)·토큰 부재 시 raw 폴백·non-OK 실패".
3. `CLAUDE.md:111` "raw board GET owner는 `…/pipeline/api/queries.ts`다" →
   "보드 GET owner는 `…queries.ts`다(토큰 시 contents API, 부재 시 raw CDN 폴백)".
