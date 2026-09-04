# FEAT-31 — 메인 루프 기록

## 필수 경로 확정 (2026-09-04)

| 경로 | 채택 | 근거 |
| --- | --- | --- |
| 1 인용 전수 대조 | ○ | 전 항목 필수 |
| 2 스케치 추출·실행 | ○ | 스케치에 코드 블록 다수(barrel·server.ts·임포터 교체) |
| 3 before/after | ○ | 기존 파일 18개 수정 |
| 4 전칭 여집합 | ◎ **본체** | "임포터 13개가 전부"·"features가 재수출하지 않는다"·"클라이언트 임포터 0건" |
| 5 돌연변이 | × | 판정 로직·순수 함수 신설이 없다(barrel 재구성) |
| 6 실제 사건 재생 | × | 외부 신호 해석 없음 |
| 7 음성 시험 | ◎ | 이 항목의 전제(잠복 파손)를 프로브로 증명·반증할 수 있다 |
| 8 실물 렌더 | × | 마크업 변경 없음 |

## 라운드 1 (편집) — 결함 1건

**결함 ① (정밀도)**: 「테스트」 3번의 "기존 70 테스트 유지"가 낡았다. 실측 **77**
(`transcript.test.mjs` 3 + `format-date.test.mjs` 4가 더해졌다). 70 기준으로 대조하면
정상을 회귀로 읽는다. → 77로 정정하고 근거를 남겼다.

**경로 7 — 전제 증명(이 라운드의 최대 소득)**

계획서가 "구현 단계에서 하라"고 적은 프로브의 **분할 전 절반을 미리 실행**했다.
`src/app/barrel-probe/page.tsx`에 `"use client"` + `import "~/fsd/entities/user";`만 넣고:

- `npm run build` → **exit 1**, `Failed to compile. / You're importing a component that needs "server-only". / 1 | import "server-only";`
- 같은 상태에서 `npx tsc --noEmit` → **EXIT 0**
- 같은 상태에서 `npx next lint` → **EXIT 0**

즉 `npm run check`는 통과하는데 `npm run build`만 깨진다는 이 항목의 전제가 실물로
확정됐다. 프로브 삭제 후 `git status` 청결 확인. 이 결과를 계획서 본문에 인용해, 구현
단계에서는 **분할 후 절반**만 실행하면 되게 했다.

**경로 4 — 전칭 여집합(본체)**

독립 열거로 계획서 표를 대조했다.

- 다섯 barrel의 bare 임포터 = **13개 파일** (계획서와 일치)
- 상대경로 임포터 **0건**
- barrel을 우회한 깊은 임포트(`entities/<slice>/...`, 엔티티 밖에서) **0건** — 아무도 우회하지
  않으므로 barrel 분할이 표면을 온전히 통제한다
- 13개 파일 중 `"use client"` **0건** (1행이 `next/server`·`"use server"`·`import "server-only"`·
  `type { Metadata }` 등 전부 서버 측)
- `features/*` 공개 API가 다섯 barrel을 재수출하는 곳 **0건** (`export … from` 검색)

**경로 1·2·3**

임포터 인용 12곳(`inngest/functions.ts:24`, `app/api/analytics/events/route.ts:3`,
`app/page.tsx:2`, `app/api/portal/route.ts:4`, `app/dashboard/layout.tsx:3`,
`handle-order-created/api/index.ts:1·2`, `upload/api/index.ts:7`,
`complete-processing-attempt.ts:3`, `billing/api/index.ts:4·5`,
`processing-dispatch/index.ts:9`)을 다시 읽어 내용까지 대조 — 전부 일치.

구조 주장도 확인: `analytics-event`·`order`·`subscription`·`user`는 세그먼트가 `api`뿐이고
`model`·`lib`·`ui`가 없다 → `index.ts`가 `export {};`가 되는 근거가 성립. `processing-dispatch`만
`api`+`model`이라 타입 하나가 남는다. `user/index.ts`가 실제로 심볼 10개를 알파벳 순으로
내보낸다. 선례 `entities/clip/server.ts`의 형태(주석 문구까지)와 스케치가 일치.
`export {};` 한 줄 모듈이 프로젝트 설정에서 `npx eslint` **0건**·`tsc --noEmit` **EXIT 0**임도
실측 — 빈 barrel이 게이트를 깨지 않는다.

## 라운드 2 (무편집) — 무소득

라운드 1에서 내가 계획서에 넣은 숫자를 대조했다. `transcript.test.mjs`의 `it()` **3개**,
`format-date.test.mjs`의 `it()` **4개**, 합 7 — "70 → 77"이 정확하다. 다른 편집분(프로브
출력 인용)은 내가 직접 실행한 출력 그대로다.

편집 없음·소득 없음 → `plan-verifier` 독립 패스 디스패치 자격 확보.
