# BUG-10 구현 보고 (web-dev)

## 2026-09-04 — 구현 (구현승인 → 완료)

계획서 `docs/plans/BUG-10.md`대로 구현했다. 로케일·타임존 미고정 날짜 포매팅
(하이드레이션 불일치 React #418)을 로케일 `"en"` + 타임존 `"UTC"` 고정 공용 포매터로
통일했다. 표시 타임존은 소유자 결정에 따라 UTC 확정.

### 시작 전 대조 (계획서 「현재 동작」 ↔ 코드)

다섯 호출부(`OrderHistory.tsx:55`, `SubscriptionStatus.tsx:95·127-129`,
`upload-detail/ui/index.tsx:87`, `ProcessingTimeline.tsx:159`, `QueueStatus.tsx:71`)와
잠복 결함 둘(`UploadedFileCard.tsx:19-22·30`, `RecoverableUploadDrafts.tsx:22-25·88`),
`site-footer/ui/index.tsx:72`(`getFullYear`) 전부 계획서 인용과 일치.

### 고친 파일 (전수)

수정 8 / 신규 2.

- `apps/web/src/fsd/shared/lib/format-date.ts` `(신규)` — `DATE_FORMATTER`·
  `DATE_TIME_FORMATTER`(둘 다 로케일 `"en"` + `timeZone: "UTC"` 고정) 상수 수출 +
  `formatDate`·`formatDateTime` 함수. 상수 수출은 테스트가 `resolvedOptions()`를 볼
  핸들 목적(결함 ⑥).
- `apps/web/src/fsd/shared/lib/format-date.test.mjs` `(신규)` — 4 케이스. 임포트 전
  `process.env.TZ = "Asia/Seoul"` 설정 후 `await import("./format-date.ts")` 동적 임포트.
- `apps/web/src/fsd/features/billing/ui/OrderHistory.tsx` — `:55` → `formatDate(order.createdAt)`.
- `apps/web/src/fsd/features/billing/ui/SubscriptionStatus.tsx` — `:95`·`:127-129` →
  `formatDate(subscription.currentPeriodEnd)`.
- `apps/web/src/fsd/pages/upload-detail/ui/index.tsx` — `:87` → `formatDateTime(createdAt)`.
- `apps/web/src/fsd/pages/upload-detail/ui/_component/ProcessingTimeline.tsx` — `:159` →
  `formatDateTime(timestamp)`(널 가드 유지).
- `apps/web/src/fsd/pages/dashboard/ui/_component/QueueStatus.tsx` — `:71` →
  `formatDateTime(file.createdAt)`.
- `apps/web/src/fsd/widgets/uploaded-file-list/ui/_component/UploadedFileCard.tsx` — 모듈
  상수 `dateFormatter` 제거, `createdLabel`을 `formatDateTime(file.createdAt)`로.
- `apps/web/src/fsd/pages/dashboard/ui/_component/RecoverableUploadDrafts.tsx` — 모듈 상수
  `formatter` 제거, `:88`을 `formatDateTime(draft.sourceUploadedAt ?? draft.createdAt)`로.
- `apps/web/src/fsd/widgets/site-footer/ui/index.tsx` — `:72` `getFullYear()` →
  `getUTCFullYear()`(현재 결함 아님; "모든 시간 UTC" 지시 명시화).

### 스케치 대비 차이

없음. 포매터 옵션(`dateStyle: "medium"`, `timeStyle: "short"`, `timeZone: "UTC"`,
로케일 `"en"`)·함수 시그니처·호출부 치환·널 처리(호출부 유지) 전부 스케치와 동일.
골든 문자열 `"Jul 30, 2026, 10:55 PM"`·`"Sep 27, 2026"`는 이 러너(Node)의 ICU로
정확히 일치해 그대로 사용.

계획서 「검증 라운드 기록」의 함정 회피:
- 결함 ④: 테스트가 임포트 전 `process.env.TZ = "Asia/Seoul"`로 프로세스 TZ를 비-UTC로
  강제 → `timeZone: "UTC"` 제거 돌연변이가 CI(UTC)에서도 사멸.
- 결함 ⑤⑥: 포매터 상수를 수출하고 `resolvedOptions().locale === "en"` 완전 일치 단언
  (`startsWith` 아님) → 로케일 인자 제거(en-US) 돌연변이가 en 계열 CI에서도 사멸.
- 결함 ⑦: 날짜만 필드도 UTC 15:00 이후 타임스탬프는 하루 이월 가능(결제일 관련) —
  못 덮는 범위에 확인 항목으로 이관.

### 검증

- `npm run check -w apps/web` → EXIT 0 (next lint 경고/에러 0, tsc --noEmit 통과).
- `npm test -w apps/web` → 73 → 77 pass / 0 fail(신규 `format-date.test.mjs` 4 케이스).

### 테스트로 못 덮은 범위 (배포 후 수동 확인)

- **프로덕션 콘솔의 React #418 소멸이 최종 판정.** 이 결함은 `npm run build`·현재
  러너로 재현되지 않는다(서버·클라 로케일·타임존이 같은 러너에서는 불일치가 안 난다).
  배포 후 `/dashboard/billing`·`/dashboard/uploads/<id>`를 열어 콘솔에
  `Minified React error #418`이 더는 뜨지 않는지 확인.
- `RecoverableUploadDrafts`(복구 초안 있을 때)·`UploadedFileCard`(My Clips 탭)의 시각
  표기가 서버·클라 동일한지는 실제 데이터·탭 전환이 필요해 러너로 못 덮는다.
- 날짜만 필드의 **하루 이월**이 실제 데이터에서 몇 건인지 — `Order.createdAt`·
  `Subscription.currentPeriodEnd` 중 UTC 15:00 이후 타임스탬프는 DB를 봐야 안다.
  배포 후 빌링 화면에서 날짜가 예상과 다른지 확인.
- UTC 표기가 사용자에게 어색한 화면이 있는지(정책은 UTC 확정) — 실물 관측.

### 비고

- 새 테스트 파일 `shared/lib/format-date.test.mjs`는 `apps/web/CLAUDE.md` 테스트 목록
  표에 행이 필요할 수 있다. 그 파일은 web-dev 쓰기 범위 밖(읽기 전용)이라 고치지
  않았다 — 메인 루프가 처리할 사항.
- 계획서 「표시 타임존 결정」이 `apps/admin`의 유사 결함을 BUG-12로 백로그 이관한다고
  기록. 그 워크스페이스는 web-dev 범위 밖이라 손대지 않았다.
