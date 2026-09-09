# FEAT-38 — 메인 루프 기록

## 게이트① (2026-09-09)

소유자가 `승인대기` → `계획지시` 개방. BUG-09과 함께 둘 다 개방했다.

담당은 `main-loop`다 — `packages/db/prisma/schema.prisma` 수정이 web-dev의 금지
목록(`.claude/agents/web-dev.md:54`)에 있고 `db:push`/`db:migrate` 실행도
금지(`:53`)라 dev 로스터의 쓰기 범위 밖이다. FEAT-19·FEAT-26 전례를 따른다.

### 계획 단계에서 반드시 다룰 것

- **analytics 계약의 컴파일 결합.** `ANALYTICS_METADATA_KEYS_BY_EVENT`는
  `as const satisfies Record<AnalyticsEventName, readonly string[]>`로 전체 이벤트에
  대한 Record다. `packages/db/src/analytics-contract.ts`에 이름만 추가하고
  `apps/web/src/fsd/shared/analytics/lib/metadata.ts`의 키를 안 넣으면 컴파일 오류다.
  워크스페이스가 갈렸다는 이유로 쪼개면 중간 상태가 빌드되지 않는다.
- **마이그레이션은 1회.** 캡션 컬럼(`UploadedFile.captionStyle`)도 여기서 함께 만들고
  FEAT-42까지 안 쓴 채 둔다. 둘로 나누면 Neon 작업이 두 번이 된다.
- **DB를 실제로 바꾸는 명령은 구현 단계에서 소유자 승인을 따로 받는다.**
