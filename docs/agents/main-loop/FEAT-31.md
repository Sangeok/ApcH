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

## 라운드 3 (plan-verifier 독립 패스 1사이클) — 결함 1건

**결함 ② (문서 위생)**: 「현재 동작」의 선례 인용 `entities/uploaded-file/index.ts:1-55`가
한 행 초과다. 실측 **54행**(마지막 행 `export { UploadedFileStatusBadge } from "./ui/UploadedFileStatusBadge";`).
편집 대상이 아니라 참조라 구현에는 무해하지만 인용은 인용이다 → `:1-54`로 정정.
같은 절의 나머지 선례 인용(`uploaded-file/server.ts` 40행, `clip` index 2·server 10,
`clip-draft` index 2·server 11)은 전부 정확했다.

**내 1라운드가 남긴 부작용 — 기록해 둔다.** 프로브 빌드(`npm run build`) 후 소스
`src/app/barrel-probe/page.tsx`는 지웠지만 **`.next/types`의 생성물은 안 지웠다.** 그 결과
독립 검증자의 `tsc --noEmit`이 처음에 `TS2307` 3건으로 실패했고, 검증자가 소스에 프로브가
없음을 확인하고 `.next`를 지운 뒤에야 EXIT 0이 나왔다. `.next`는 gitignore라 트리는 깨끗했지만
**다음 사람의 게이트를 깨뜨렸다.** 앞으로 프로브 빌드를 돌리면 소스와 함께 `.next`도 지운다.
(현재 상태 재확인: `.next/types/app/barrel-probe` 없음, `npx tsc --noEmit` EXIT 0.)

**독립 패스가 통과시킨 것**: 다섯 `api/index.ts:1`이 전부 `server-only`, 다섯 barrel 심볼이
계획서와 일치(user 10 알파벳순·subscription 5·analytics-event 2·order 2·processing-dispatch
함수 5+타입 1), `processing-dispatch/index.ts`의 1-8/9행 구성, 임포터 **13파일 17행** 전수 일치,
여집합 다섯 종류 전부 0건(상대경로·깊은 임포트·`"use client"`·features 재수출·`.mjs/.js/.json/.cjs`
참조), 각 임포터가 가져가는 심볼이 대응 `server.ts` 스케치 export 집합에 **전부 포함**됨을
교차 확인. 현 트리 게이트 실측 — `next lint` EXIT 0, `tsc --noEmit` EXIT 0,
`npm test` **77/77**, `next build` **EXIT 0**.

**음성 시험 독립 재현** — 「누락 임포터는 TS2305로 걸린다」는 계획서 주장을 스크래치패드에서
저장소 tsc 5.9.3으로 재현: `export {};` 배럴 + 안 옮긴 임포터 →
`error TS2305: Module '"./barrel"' has no exported member 'getHomeUserProfile'.`(exit 2).
대조군으로 `export {};` 단독과 `export { … } from "./api"` 재수출은 각각 클린(exit 0) —
스케치 문법이 게이트를 깨지 않음도 확인.

**미실행 하나(정당)**: 「분할 전 프로브 → `server-only` 빌드 실패」의 독립 재현은 저장소에
파일을 만들어야 해서 `plan-verifier`의 무수정 제약과 충돌한다. 검증자는 이를 실행하지 않고,
대신 (1) 내 프로브가 남긴 `.next` 잔해로 그 실행이 있었음을 방증, (2) `server-only` 패키지
실재와 규약 문서의 같은 서술로 메커니즘, (3) 상보적 안전망(TS2305)을 기계 재현으로 각각
확인했다. 이 반쪽은 1라운드에서 메인 루프가 실행해 출력을 계획서에 인용해 뒀다.

**결과**: 소폭 편집 라운드. 다음은 무편집 패스 + 새 독립 패스.
