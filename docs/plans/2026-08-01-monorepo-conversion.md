# 모노레포 전환 (Phase 0~2) 구현 계획서

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `ApcH` 저장소를 npm workspaces 모노레포로 바꾸고 Prisma·analytics 계약을 `packages/db`로 분리한다. 사용자 대면 동작은 그대로 유지한다.

**Architecture:** `ai-podcast-clipper-frontend`를 `apps/web`으로 옮기고 저장소 루트에 워크스페이스를 만든다. Prisma 스키마·생성 클라이언트·analytics 이벤트 계약을 `packages/db` 하나로 뽑되, 기존 임포트 경로는 재수출 shim으로 유지해 앱 코드 수정을 최소화한다. 라이브 Vercel 프로젝트를 건드리기 전에 일회용 프로젝트로 전 과정을 검증한다.

**Tech Stack:** npm workspaces 10.9.2, Next.js 15.5.7, Prisma 6.19.1 + `@prisma/adapter-neon`, TypeScript 5.8, Node 내장 테스트 러너

**설계 문서:** `docs/proposals/monorepo-admin-split-2026-08-01.md` (결정 3·5·8·10, §4.0~4.4, §4.9, §5 Phase 0~2)

**후속 계획서:** `docs/plans/2026-08-01-admin-app-split.md` (Phase 3~4). 이 계획서를 완료해야 시작할 수 있다.

## Global Constraints

- 패키지 매니저는 **npm 10.9.2** 고정. pnpm/yarn/Turborepo를 도입하지 않는다.
- 워크스페이스 패키지 이름은 **`@repo/db`** 하나뿐. 다른 패키지를 만들지 않는다.
- **`generated/prisma`는 git 추적 대상이다.** 어떤 상황에서도 `.gitignore`에 `generated/` 또는 `generated/prisma/`를 넣지 않는다. tmp 찌꺼기 규칙(`generated/prisma/*.tmp*`)만 유지한다.
- 파일 이동은 전부 **`git mv`**로 한다. 삭제 후 재생성하지 않는다(히스토리 보존).
- `apps/web/src/` 아래 애플리케이션 코드의 임포트 경로는 **`generated/prisma` → `@repo/db` 치환 23곳 외에는 바꾸지 않는다.** 나머지는 shim으로 흡수한다.
- `DATABASE_URL` 검증은 **각 앱의 `src/env.js`가 한다.** `packages/db`는 env를 검증하지 않는다.
- `.env`는 **저장소 루트 유일본**이다. 앱 디렉터리에 `.env`를 만들지 않는다.
- 모든 커밋 메시지는 Conventional Commits 형식(`feat:`, `fix:`, `chore:`, `refactor:`, `test:`)을 쓴다.
- **라이브 Vercel 프로젝트 설정은 Task 11 전까지 건드리지 않는다.**

---

## 파일 구조

작업 후 도달할 상태다.

```
ApcH/
├─ package.json                    [신규] workspaces, 스크립트 8개
├─ .npmrc                          [신규] legacy-peer-deps=true
├─ .gitignore                      [신규] .env, .env*.local
├─ .env                            [이동] apps/web/.env 에서. git 미추적
├─ .env.example                    [이동] apps/web/.env.example 에서. git 추적
├─ package-lock.json               [재생성] 단일 lockfile
├─ apps/
│  └─ web/                         [이동] ai-podcast-clipper-frontend/ 전체
│     ├─ package.json              [수정] prisma 의존성 제거, @repo/db·dotenv 추가, test 스크립트
│     ├─ next.config.js            [수정] dotenv 선로드, transpilePackages, outputFileTracingRoot
│     ├─ .gitignore                [수정] prisma tmp 규칙 제거
│     ├─ .npmrc                    [삭제] 루트로 승격
│     └─ src/
│        ├─ server/db.ts           [축소] @repo/db 재수출 shim 1줄
│        └─ fsd/
│           ├─ shared/analytics/event-catalog.ts   [축소] shim 3줄
│           └─ entities/analytics-event/
│              ├─ api/index.ts     [축소] record/cleanup만 남김
│              └─ model/
│                 ├─ funnels.ts    [축소] shim
│                 ├─ types.ts      [축소] shim
│                 ├─ reporting.ts       [삭제 예정 — Phase 3에서 admin으로]
│                 └─ reporting.test.mjs [삭제 예정 — Phase 3에서 admin으로]
└─ packages/
   └─ db/
      ├─ package.json              [신규] @repo/db
      ├─ tsconfig.json             [신규]
      ├─ .gitignore                [신규] generated/prisma/*.tmp*
      ├─ prisma/schema.prisma      [이동]
      ├─ generated/prisma/         [이동] 27개 추적 파일
      └─ src/
         ├─ index.ts               [신규] 공개 표면
         ├─ client.ts              [이동] apps/web/src/server/db.ts 에서
         └─ analytics-contract.ts  [신규] 이벤트 이름 + 퍼널 + 타입
```

**책임 분리**

| 파일 | 단일 책임 |
|---|---|
| `packages/db/src/client.ts` | Prisma 클라이언트 인스턴스 생성과 개발 환경 캐시 |
| `packages/db/src/analytics-contract.ts` | web(쓰기)과 admin(읽기)이 공유하는 이벤트 이름·퍼널 정의·타입 |
| `packages/db/src/index.ts` | 패키지 공개 표면. 여기 없는 것은 외부에서 못 쓴다 |
| `apps/web/src/server/db.ts` | 앱 내부 간접 계층. 11개 사용처가 이 경로를 계속 쓴다 |
| `apps/web/.../event-catalog.ts` | 앱 내부 간접 계층 + web 전용 metadata 재수출 |

---

## Task 1: 테스트 러너 배선

현 구조(`ai-podcast-clipper-frontend/`)에서 먼저 한다. 이후 모든 Task의 게이트가 이것에 의존하고, 이동 전에 하면 "이동 때문에 깨진 것"과 "원래 깨져 있던 것"을 구분할 수 있다.

**Files:**
- Modify: `ai-podcast-clipper-frontend/package.json`

**Interfaces:**
- Consumes: 없음
- Produces: `npm test` 명령. 이후 모든 Task가 게이트로 쓴다.

- [ ] **Step 1: 현재 테스트가 실행되지 않는 것을 확인**

```bash
cd ai-podcast-clipper-frontend
npm test
```

Expected: FAIL. `npm error Missing script: "test"`

- [ ] **Step 2: 테스트 파일 4개가 존재하는지 확인**

```bash
find src -name "*.test.mjs"
```

Expected: 4개 출력

```
src/fsd/entities/analytics-event/model/reporting.test.mjs
src/fsd/shared/analytics/lib/metadata.test.mjs
src/fsd/shared/analytics/lib/normalize-path.test.mjs
src/fsd/widgets/clip-draft-review/model/selection-budget.test.mjs
```

- [ ] **Step 3: Node 버전 확인**

```bash
node --version
```

각 `.test.mjs`가 `.ts` 형제 모듈을 임포트한다. Node가 `.ts`를 읽으려면 조건이 있다.

| Node 버전 | 필요한 것 |
|---|---|
| ≥ 22.18 또는 ≥ 23.6 | 없음. 타입 스트리핑이 기본 동작 |
| 22.6 ~ 22.17 | `--experimental-strip-types` 플래그 |
| < 22.6 | 이 방식 불가. `tsx` 도입 필요 |

**이 저장소의 검증 환경은 v22.13.1이라 플래그가 필요하다.** 플래그 없이 돌리면 4개 파일이 전부 `ERR_UNKNOWN_FILE_EXTENSION ".ts"`로 로드에 실패한다(`# pass 0 / # fail 4`).

- [ ] **Step 4: `test` 스크립트 추가**

`ai-podcast-clipper-frontend/package.json`의 `"scripts"` 안, `"start": "next start",` 다음 줄에 추가한다.

```json
    "test": "node --experimental-strip-types --test \"src/**/*.test.mjs\"",
```

Node가 22.18 이상이면 플래그를 빼도 되지만, 넣어두면 낮은 버전에서도 동작하고 높은 버전에서는 무시된다. 그대로 둔다.

- [ ] **Step 5: 4개 파일이 모두 실행되고 통과하는지 확인**

```bash
npm test
```

Expected: `# tests 17`, `# pass 17`, `# fail 0`

`# tests`가 0이면 glob이 안 먹은 것이다(셸에 따라 다름). 그때만 아래 형태로 바꾼다.

```json
    "test": "node --experimental-strip-types --test --test-reporter=spec src/fsd/entities/analytics-event/model/reporting.test.mjs src/fsd/shared/analytics/lib/metadata.test.mjs src/fsd/shared/analytics/lib/normalize-path.test.mjs src/fsd/widgets/clip-draft-review/model/selection-budget.test.mjs",
```

- [ ] **Step 6: 커밋**

```bash
git add ai-podcast-clipper-frontend/package.json
git commit -m "test: wire up node test runner for existing .test.mjs files"
```

---

## Task 2: 루트 워크스페이스 생성과 앱 이동

**Files:**
- Create: `package.json`, `.npmrc`, `.gitignore`
- Move: `ai-podcast-clipper-frontend/` → `apps/web/`
- Delete: `apps/web/.npmrc`, `apps/web/package-lock.json`, `apps/web/node_modules/`, `apps/web/.next/`, `apps/web/tsconfig.tsbuildinfo`

**Interfaces:**
- Consumes: Task 1의 `test` 스크립트
- Produces: `apps/web` 워크스페이스. 이후 모든 경로가 `apps/web/` 기준이 된다.

- [ ] **Step 1: 루트 `package.json` 생성**

저장소 루트에 만든다.

```json
{
  "name": "apch",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "npm run dev -w apps/web",
    "build": "npm run build --workspaces --if-present",
    "check": "npm run check --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "db:push": "npm run db:push -w @repo/db",
    "db:migrate": "npm run db:migrate -w @repo/db",
    "db:studio": "npm run db:studio -w @repo/db"
  },
  "packageManager": "npm@10.9.2"
}
```

`dev:admin`은 Phase 3에서 추가한다. 지금 넣으면 존재하지 않는 워크스페이스를 가리킨다.

- [ ] **Step 2: 루트 `.npmrc` 생성**

```
legacy-peer-deps=true
```

- [ ] **Step 3: 루트 `.gitignore` 생성**

`.env`가 루트로 올라오므로 무시 규칙도 루트에 있어야 한다.

```
# local env files
.env
.env*.local

# dependencies
node_modules

# vercel
.vercel
```

- [ ] **Step 4: 앱 이동**

```bash
mkdir -p apps
git mv ai-podcast-clipper-frontend apps/web
```

- [ ] **Step 5: 이동에 딸려온 산출물 삭제**

`git mv`는 디렉터리 rename이라 미추적 파일까지 따라온다. 남겨두면 워크스페이스 호이스팅을 가려서 "로컬은 되는데 배포는 깨지는" 상태를 만든다.

```bash
rm -rf apps/web/node_modules apps/web/.next
rm -f apps/web/tsconfig.tsbuildinfo apps/web/package-lock.json apps/web/.npmrc
```

- [ ] **Step 6: 삭제 확인**

```bash
ls -a apps/web | grep -E "node_modules|\.next|\.npmrc|package-lock"
```

Expected: 아무것도 출력되지 않음

- [ ] **Step 7: 기존 lockfile을 루트로 시드**

**이 단계를 건너뛰면 안 된다.** 빈 상태에서 `npm install`을 돌리면 npm이 모든 `^` 범위를 재해석해 전이 의존성이 올라간다. 실측 결과 4개 패키지군이 움직였고 그중 둘이 실제 실패를 냈다.

| 패키지 | 고정본 | 재해석 시 | 증상 |
|---|---|---|---|
| `@polar-sh/sdk` | 0.46.6 | 0.46.7 | `polar/route.ts:40,143` TS2322 (필드가 nullable로 바뀜) |
| `@typescript-eslint/*` | 8.46.4 | 8.65.0 | `next lint` projectService 에러 폭주 |
| `eslint-config-next` | 15.5.6 | 15.5.22 | 위와 연동 |
| `prisma` | 6.19.1 | 6.19.3 | `generated/prisma` 12개 파일 재생성 diff |

Task 2의 목적은 구조 이동이다. 여기에 의존성 업그레이드가 섞이면 Phase 0 검증(Task 10)이 실패했을 때 **이동 탓인지 새 의존성 탓인지 가릴 수 없다.**

```bash
git show HEAD:ai-podcast-clipper-frontend/package-lock.json > package-lock.json
```

- [ ] **Step 8: 루트에서 설치**

```bash
npm install
```

npm이 기존 lockfile의 `resolved` 버전을 유지하면서 워크스페이스 구조로 재작성한다. 루트에 `node_modules/`가 만들어진다.

- [ ] **Step 9: 버전이 고정됐는지 확인**

```bash
node -e "const l=require('./package-lock.json');for(const k of ['node_modules/@polar-sh/sdk','node_modules/@typescript-eslint/parser','node_modules/eslint-config-next','node_modules/prisma'])console.log(k, l.packages[k]?.version)"
```

Expected:

```
node_modules/@polar-sh/sdk 0.46.6
node_modules/@typescript-eslint/parser 8.46.4
node_modules/eslint-config-next 15.5.6
node_modules/prisma 6.19.1
```

하나라도 다르면 시드가 먹지 않은 것이다. `node_modules/`와 `package-lock.json`을 지우고 Step 7부터 다시 한다.

- [ ] **Step 10: `generated/prisma`가 재생성으로 더럽혀지지 않았는지 확인**

`postinstall`의 `prisma generate`가 돈다. Prisma 버전이 같으면 산출물도 같아야 한다.

```bash
git status --porcelain apps/web/generated
```

Expected: `edge.js`, `index.js`, `wasm.js`, `schema.prisma`, `package.json` 정도만 변경으로 뜬다. **이건 정상이다.**

생성된 Prisma 클라이언트는 **생성 시점의 절대경로를 파일 안에 박는다.**

```diff
- "value": "C:\\...\\ApcH\\ai-podcast-clipper-frontend\\generated\\prisma"
+ "value": "C:\\...\\ApcH\\apps\\web\\generated\\prisma"
```

디렉터리를 옮겼으니 경로가 바뀌는 것이 맞고, 어떤 버전 고정으로도 막을 수 없다. **재생성본을 커밋한다.** 옛 값은 이제 존재하지 않는 디렉터리를 가리킨다.

반면 `runtime/*.js` 같은 파일에서 **버전 문자열이나 로직이 바뀌면** 그건 Prisma 버전이 고정되지 않은 것이다. Step 9로 돌아간다. 구분 기준:

| 변경 내용 | 판정 |
|---|---|
| 절대경로(`\\ApcH\\...`), `"postinstall": false` | 정상. 커밋 |
| `"version": "6.19.x"`, 런타임 코드 변경 | 버전 고정 실패. Step 9로 |

> 이 절대경로 박힘은 "생성 클라이언트를 커밋한다"는 기존 컨벤션이 안고 있는 성질이다. 다른 사람이 클론하면 이 머신의 경로를 가리키는 파일을 받는다. Vercel은 `postinstall`로 다시 만들므로 배포에는 영향이 없고, 로컬에서도 첫 `npm install`이 덮어쓴다. 이 계획의 범위 밖이지만 `generated/`를 계속 커밋할지는 언젠가 재검토할 값어치가 있다.

> 의존성 업그레이드는 이 계획의 범위가 아니다. 별건으로, 자체 테스트와 롤백 경로를 가진 변경으로 다룬다. 특히 `@polar-sh/sdk` 0.46.7의 nullable 변경은 웹훅 처리 코드를 손봐야 하므로 결제 경로 회귀 테스트가 따라야 한다.

- [ ] **Step 11: 워크스페이스 인식 확인**

```bash
npm ls -w apps/web --depth=0
```

Expected: `ai-podcast-clipper-frontend@0.1.0 -> ./apps/web` 형태로 출력

- [ ] **Step 12: 테스트와 타입 체크 통과 확인**

```bash
npm test -w apps/web
npm run check -w apps/web
```

Expected: 둘 다 PASS. `npm test`는 `# pass 17 / # fail 0`.

여기서 `polar/route.ts`의 TS2322나 `next lint`의 projectService 에러가 나오면 **소스를 고치지 말고 Step 9로 돌아간다.** 두 증상 모두 버전 고정 실패의 신호다.

- [ ] **Step 13: 커밋**

```bash
git add -A
git commit -m "chore: convert repo to npm workspaces and move frontend to apps/web"
```

---

## Task 3: `.env`를 루트로 올리고 dotenv 선로드 배선

**Files:**
- Move: `apps/web/.env` → `.env` (수동. git 미추적)
- Move: `apps/web/.env.example` → `.env.example`
- Modify: `apps/web/package.json`, `apps/web/next.config.js`

**Interfaces:**
- Consumes: Task 2의 워크스페이스 구조
- Produces: 루트 `.env` 유일본. `packages/db`의 Prisma CLI(Task 5)와 두 앱이 모두 이것을 본다.

- [ ] **Step 1: `.env` 파일을 루트로 옮긴다**

`git mv`가 아니라 일반 이동이다. `.env`는 git 추적 대상이 아니다.

```bash
mv apps/web/.env .env
git mv apps/web/.env.example .env.example
```

- [ ] **Step 2: 이동 확인**

```bash
ls -a | grep "^\.env"
ls -a apps/web | grep "^\.env" || echo "apps/web에 .env 없음 (정상)"
```

Expected: 루트에 `.env`와 `.env.example`. `apps/web`에는 없음.

- [ ] **Step 3: 루트 `.env`가 무시되는지 확인**

```bash
git status --porcelain .env
```

Expected: 아무것도 출력되지 않음(무시되고 있다는 뜻). 출력이 있으면 Task 2 Step 3의 루트 `.gitignore`를 다시 확인한다.

- [ ] **Step 4: `dotenv` 추가**

```bash
npm install -D dotenv -w apps/web
```

- [ ] **Step 5: `next.config.js` 최상단에 선로드 추가**

`apps/web/next.config.js`의 임포트 블록과 `./src/env.js` 호출을 아래로 바꾼다.

```js
// 루트 .env 유일본을 읽는다. Next.js는 process.cwd() 기준으로만 .env를
// 자동 로드하는데 cwd가 apps/web이므로 루트 파일이 자동으로는 안 읽힌다.
// ESM 정적 import는 모두 본문보다 먼저 평가되므로, ./src/env.js 검증이
// 이 dotenv 로드보다 먼저 실행되지 않도록 동적 import로 불러온다.
import { config as loadEnv } from "dotenv";
import { withSentryConfig } from "@sentry/nextjs";

loadEnv({ path: "../../.env" });

await import("./src/env.js");
```

**함정이 둘이다. 실행에서 둘 다 걸렸다.**

1. **`config`라는 이름을 쓰면 안 된다.** 파일 아래쪽에 `const config = { ... }`(NextConfig 객체)가 이미 있어 충돌한다. `loadEnv`로 별칭한다.
2. **`import "./src/env.js"`를 정적 import로 두면 동작하지 않는다.** ESM은 정적 import를 전부 본문보다 먼저 평가한다. `loadEnv()` 호출보다 아래에 적어도 먼저 실행되어 `Invalid environment variables`가 난다. "위에 쓰면 먼저 실행된다"는 직관이 여기서는 틀린다. `await import()`(동적 import)여야 실행 시점이 본문 순서를 따른다.

동적 import는 top-level await를 쓴다. Next 15.5.7 + Node 22 조합에서 동작을 확인했다.

- [ ] **Step 6: 개발 서버가 루트 `.env`를 읽는지 확인**

```bash
npm run dev -w apps/web
```

Expected: 서버가 뜬다. env 검증 실패(`Invalid environment variables`)가 나면 선로드가 안 된 것이다.

브라우저에서 `http://localhost:3000` 접속 후 정상 렌더되면 Ctrl+C로 종료한다.

- [ ] **Step 7: 빌드 확인**

```bash
npm run build -w apps/web
```

Expected: 성공

- [ ] **Step 8: `generated/prisma` 재생성분 확인**

`npm install`의 `postinstall`이 돌면서 3개 파일이 바뀐다.

```bash
git diff --stat apps/web/generated
```

Expected: `edge.js`, `index.js`, `wasm.js` 3개. 내용은 아래 한 줄이 사라진 것뿐이다.

```diff
     "rootEnvPath": null,
-    "schemaEnvPath": "../../.env"
+    "rootEnvPath": null
```

Prisma는 생성 시점에 찾은 `.env` 위치를 클라이언트에 기록해둔다. `apps/web/.env`가 사라졌으니 기록할 값이 없어진 것이고, **이 이동의 정상적인 결과다.** 커밋한다.

런타임에는 영향이 없다. 이 값은 Prisma가 스스로 `.env`를 읽을 때 쓰는데, 이제 `next.config.js`의 dotenv가 `process.env`를 먼저 채우고 Vercel은 환경변수를 직접 주입한다.

`"version"`이나 런타임 코드가 바뀌었다면 그건 다른 문제다 — Task 2 Step 10의 판별 기준을 따른다.

- [ ] **Step 9: 커밋**

```bash
git add .env.example apps/web/package.json apps/web/next.config.js package-lock.json apps/web/generated
git commit -F <메시지 파일>
```

메시지는 `chore: move .env to repo root and preload it in next.config` 형태로 하되, 본문에 동적 import를 쓴 이유(ESM 호이스팅)를 남긴다. 나중에 "왜 여기만 `await import`지" 하고 정적으로 되돌리는 일을 막는다.

> `git commit`은 마지막에 `add`한 것이 아니라 **인덱스 전체**를 커밋한다. 커밋 전 `git status`로 무관한 변경이 스테이징되어 있지 않은지 확인한다.

---

## Task 4: `packages/db` 스캐폴딩

아직 파일을 옮기지 않는다. 껍데기만 만들어 워크스페이스가 인식하는지 먼저 확인한다.

**Files:**
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/.gitignore`

**Interfaces:**
- Consumes: Task 2의 워크스페이스 구조
- Produces: `@repo/db` 워크스페이스 이름. Task 5~8이 이 이름으로 임포트한다.

- [ ] **Step 1: `packages/db/package.json` 생성**

```json
{
  "name": "@repo/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "db:generate:client": "prisma generate",
    "db:push": "prisma db push",
    "db:migrate": "prisma migrate deploy",
    "db:generate": "prisma migrate dev",
    "db:studio": "prisma studio"
  },
  "dependencies": {
    "@prisma/adapter-neon": "^7.5.0",
    "@prisma/client": "^6.19.1"
  },
  "devDependencies": {
    "prisma": "^6.19.1"
  }
}
```

`db:generate:client`와 `db:generate`는 다른 명령이다. 전자는 `prisma generate`(클라이언트 생성), 후자는 `prisma migrate dev`(마이그레이션 생성)다. Vercel Build Command 대안이 전자를 쓴다.

**`postinstall`은 여기 넣지 않는다. Task 5에서 스키마와 함께 추가한다.** 지금 넣으면 `prisma generate`가 없는 스키마를 찾아 `npm install`이 exit 1로 죽는다. 의존성 설치 자체는 성공하지만 종료 코드가 1이라, 이 커밋을 체크아웃한 사람은 설치가 실패한 것으로 본다. 모든 커밋이 설치 가능한 상태로 남아야 bisect와 롤백이 의미를 갖는다.

- [ ] **Step 2: `packages/db/tsconfig.json` 생성**

```json
{
  "compilerOptions": {
    "target": "es2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "resolveJsonModule": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "generated"]
}
```

`exclude`의 `generated`가 중요하다. 생성된 `index.d.ts`가 825KB이고, `strict` + `noUncheckedIndexedAccess` 아래에서 재검사하면 손댈 수 없는 에러가 쏟아진다. `apps/web/tsconfig.json`도 같은 이유로 `generated`를 제외하고 있다.

- [ ] **Step 3: `packages/db/.gitignore` 생성**

`apps/web/.gitignore`에 있던 tmp 규칙을 이 패키지가 이어받는다.

```
# Windows에서 prisma generate는 엔진을 <engine>.tmp<pid>로 쓴 뒤 rename하는데,
# 파일이 잠겨 rename이 실패하면 tmp 파일이 21MB씩 그대로 남는다.
# generated/prisma는 커밋 대상이지만 이 찌꺼기는 제외한다.
generated/prisma/*.tmp*
```

- [ ] **Step 4: 워크스페이스가 인식하는지 확인**

```bash
npm install
npm ls -w @repo/db --depth=0
```

Expected: `npm install`이 **exit 0**, 그리고 `@repo/db@0.0.0 -> ./packages/db` 출력.

`npm install`이 exit 1이면 `postinstall`이 들어가 있는 것이다. Step 1에서 뺐는지 확인한다.

`packages/db/src/index.ts`가 아직 없다는 경고는 정상이다. npm은 설치 시점에 `main`/`types` 경로를 검증하지 않는다. Task 6에서 만든다.

- [ ] **Step 5: 커밋**

```bash
git add packages/db package-lock.json
git commit -m "chore: scaffold @repo/db workspace package"
```

---

## Task 5: Prisma 자산 이동과 `client.ts`

**Files:**
- Move: `apps/web/prisma/` → `packages/db/prisma/`
- Move: `apps/web/generated/` → `packages/db/generated/`
- Move: `apps/web/src/server/db.ts` → `packages/db/src/client.ts`
- Modify: `packages/db/src/client.ts`, `apps/web/.gitignore`

**Interfaces:**
- Consumes: Task 4의 `@repo/db` 패키지
- Produces: `packages/db/src/client.ts`가 `export const db`를 내보낸다. Task 6의 `index.ts`가 이것을 재수출한다.

- [ ] **Step 1: 이동 전 추적 파일 수를 기록**

```bash
git ls-files apps/web/generated | wc -l
```

Expected: `27`. 이 숫자를 기억한다. Step 4에서 대조한다.

- [ ] **Step 2: `git mv`로 이동**

```bash
git mv apps/web/prisma packages/db/prisma
git mv apps/web/generated packages/db/generated
mkdir -p packages/db/src
git mv apps/web/src/server/db.ts packages/db/src/client.ts
```

- [ ] **Step 3: `apps/web/.gitignore`에서 tmp 규칙 제거**

`apps/web/.gitignore`의 아래 5줄을 통째로 삭제한다. 규칙 소유권이 `packages/db/.gitignore`로 넘어갔다.

```
# prisma
# Windows에서 prisma generate는 엔진을 <engine>.tmp<pid>로 쓴 뒤 rename하는데,
# 파일이 잠겨 rename이 실패하면 tmp 파일이 21MB씩 그대로 남는다.
# generated/prisma는 커밋 대상이지만(CLAUDE.md) 이 찌꺼기는 제외한다.
generated/prisma/*.tmp*
```

`.env` 규칙은 남겨둔다. 앱 디렉터리에 `.env`가 실수로 다시 생겨도 커밋되지 않게 하는 방어선이다.

- [ ] **Step 4: 추적 파일이 그대로 옮겨졌는지 확인**

```bash
git ls-files packages/db/generated | wc -l
```

Expected: `27`. Step 1과 같아야 한다. 다르면 `.gitignore`가 파일을 삼킨 것이므로 Task 4 Step 3과 이 Task Step 3을 다시 본다.

> **경로 재작성이 또 일어난다.** 생성 클라이언트가 절대경로를 박고 있어(Task 2 Step 10 참조), 이번 이동으로 `apps/web/generated/prisma` → `packages/db/generated/prisma`로 값이 바뀐다. 다음 `npm install`의 `postinstall`이 그 값을 갱신하므로 그 diff도 함께 커밋한다. 정상이다. 버전 문자열이나 런타임 코드가 바뀌면 그때만 문제다.

- [ ] **Step 5: `packages/db/src/client.ts` 재작성**

`~/env` 의존을 걷어낸다. 검증은 각 앱의 `env.js`가 한다(설계 문서 결정 8).

```ts
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../generated/prisma";

// env 검증 책임은 앱에 있다(설계 문서 결정 8). 여기서 다시 검증하면
// 스키마가 세 곳으로 갈라지고, 각 앱 next.config.js가 트리거하는
// 빌드 타임 검증이 이미 누락을 잡는다.
const createPrismaClient = () => {
  const adapter = new PrismaNeon({
    connectionString: process.env.DATABASE_URL!,
  });
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
};

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
```

- [ ] **Step 6: `postinstall`을 `packages/db/package.json`에 추가**

Task 4에서 일부러 뺐던 것을 이제 넣는다. 스키마가 들어왔으므로 `prisma generate`가 동작한다.

`"scripts"` 블록 맨 위에 추가한다.

```json
    "postinstall": "prisma generate",
```

이 스크립트가 있어야 Vercel 설치 단계에서 리눅스 엔진이 생성된다. 커밋된 엔진은 Windows 전용이라(§4.0) 이것 없이는 배포가 런타임에 죽는다.

- [ ] **Step 6b: `apps/web/package.json`에서 `postinstall` 제거**

**같은 커밋에서 해야 한다.** Task 4의 대칭이다 — 그때는 스키마 없이 `postinstall`이 있었고, 지금은 `apps/web`의 `postinstall`이 스키마를 잃는다. 결과는 같다. `npm install`이 exit 1로 죽는다.

```diff
-    "postinstall": "prisma generate",
```

`postinstall`의 소유권이 `apps/web`에서 `@repo/db`로 넘어간다. 두 줄이 한 커밋 안에서 맞바뀌어야 어느 시점에도 "스키마 없는 `prisma generate`"가 존재하지 않는다.

> 초안은 이 제거를 Task 8에 뒀는데 세 Task 늦다. Task 5·6·7이 전부 설치 불가 상태로 남는다. Task 8은 나머지 Prisma 의존성과 `db:*` 스크립트 정리만 한다.

- [ ] **Step 7: Prisma CLI가 루트 `.env`를 찾는지 확인**

```bash
npm run db:generate:client -w @repo/db
```

Expected: `Generated Prisma Client (...) to ./generated/prisma` 출력

실패하면 `packages/db/package.json`의 스크립트를 `dotenv -e ../../.env -- prisma generate` 형태로 바꾸고 `dotenv-cli`를 devDependency에 추가한다.

- [ ] **Step 8: 루트 설치가 다시 정상인지 확인**

```bash
npm install
```

Expected: **exit 0**. Task 4에서 뺐던 `postinstall`이 이제 스키마를 찾아 동작한다.

- [ ] **Step 9: 커밋**

```bash
git add -A
git commit -F <메시지 파일>
```

메시지 주제는 `refactor: move prisma schema, generated client, and db client into @repo/db` 형태로 한다. 본문에 `generated/prisma`의 절대경로 재작성이 이 이동의 정상 결과임을 남긴다.

> `git commit`은 인덱스 전체를 커밋한다. 커밋 전 `git status`로 무관한 변경이 없는지 확인한다.

---

## Task 6: `analytics-contract.ts`와 패키지 공개 표면

**Files:**
- Create: `packages/db/src/analytics-contract.ts`, `packages/db/src/index.ts`

**Interfaces:**
- Consumes: Task 5의 `client.ts`(`db`), `packages/db/generated/prisma`
- Produces: `@repo/db`가 아래를 내보낸다. Task 7·8과 후속 계획서(admin)가 전부 이 표면만 쓴다.
  - `db` — Prisma 클라이언트 인스턴스
  - `Prisma` — Prisma 네임스페이스(값). `Prisma.PrismaClientKnownRequestError` 등
  - 모든 Prisma 모델 타입(`Clip`, `ClipDraft`, `UploadedFile`, …) — 타입만
  - `ANALYTICS_EVENT_NAMES: readonly string[]` (28개), `type AnalyticsEventName`
  - `ANALYTICS_FUNNELS`, `FUNNEL_LABELS`
  - `type AnalyticsDateRangeKey`, `FunnelId`, `AnalyticsDateRangeInput`, `RecordAnalyticsEventInput`, `FunnelReportInput`, `FunnelStepReport`, `DropOffReportRow`, `RecentFailureEventRow`, `AnalyticsOverview`

- [ ] **Step 1: 원본 3개 파일의 내용을 확인**

```bash
cat apps/web/src/fsd/shared/analytics/event-catalog.ts
cat apps/web/src/fsd/entities/analytics-event/model/funnels.ts
cat apps/web/src/fsd/entities/analytics-event/model/types.ts
```

세 파일의 내용을 하나로 합칠 것이다. `event-catalog.ts`의 마지막 줄(`export { ANALYTICS_METADATA_KEYS_BY_EVENT } from "./lib/metadata";`)만 **가져오지 않는다.** 그 상수는 `recordAnalyticsEvent`만 쓰는 web 전용이다.

- [ ] **Step 2: `packages/db/src/analytics-contract.ts` 작성**

세 파일을 순서대로 이어 붙이되, 파일 간 임포트는 제거한다(같은 파일 안이 되므로).

```ts
// web(쓰기)과 admin(읽기)이 공유하는 analytics 계약.
//
// 이 파일이 한 곳에 있어야 하는 이유: 아래 ANALYTICS_FUNNELS의
// `satisfies Record<FunnelId, readonly AnalyticsEventName[]>` 절이
// "퍼널 단계는 실제 존재하는 이벤트 이름이어야 한다"를 컴파일 타임에 강제한다.
// 이 파일을 복사해 두 벌로 만들면 한쪽에서 이벤트를 rename해도 다른 쪽은
// 그대로 통과하고, 대시보드가 에러 없이 0을 보여준다.

export const ANALYTICS_EVENT_NAMES = [
  "landing_view",
  "marketing_page_view",
  "login_view",
  "cta_clicked",
  "login_started",
  "dashboard_viewed",
  "upload_file_selected",
  "upload_options_changed",
  "upload_started",
  "upload_prepare_failed",
  "upload_s3_completed",
  "upload_s3_failed",
  "upload_confirmed",
  "upload_confirmation_failed",
  "processing_scheduled",
  "processing_schedule_failed",
  "upload_detail_viewed",
  "clip_review_opened",
  "clip_review_selection_changed",
  "clip_review_custom_clip_added",
  "clip_review_generate_blocked",
  "clip_review_confirmed",
  "clip_viewed",
  "billing_viewed",
  "billing_cta_clicked",
  "checkout_started",
  "checkout_returned_success",
  "page_exited",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];

export type AnalyticsDateRangeKey = "7d" | "30d" | "90d";
export type FunnelId = "acquisition" | "activation" | "billing" | "review";

export type AnalyticsDateRangeInput = {
  range: AnalyticsDateRangeKey;
};

export type RecordAnalyticsEventInput = {
  name: AnalyticsEventName;
  anonymousId: string;
  sessionId: string;
  path: string;
  referrer?: string | null;
  metadata?: Record<string, unknown>;
  userId?: string | null;
};

export type FunnelReportInput = AnalyticsDateRangeInput & {
  funnel: FunnelId;
};

export type FunnelStepReport = {
  step: AnalyticsEventName;
  visitors: number;
  conversionFromPrevious: number | null;
  dropOffFromPrevious: number | null;
  dropOffRateFromPrevious: number | null;
};

export type DropOffReportRow = {
  eventName: AnalyticsEventName;
  path: string;
  sessions: number;
  share: number;
};

export type RecentFailureEventRow = {
  eventName: AnalyticsEventName;
  path: string;
  count: number;
  lastSeenAt: Date;
};

export type AnalyticsOverview = {
  uniqueVisitors: number;
  loggedInUsers: number;
  totalEvents: number;
  dashboardConversionRate: number | null;
};

export const ANALYTICS_FUNNELS = {
  acquisition: [
    "landing_view",
    "cta_clicked",
    "login_view",
    "login_started",
    "dashboard_viewed",
  ],
  activation: [
    "dashboard_viewed",
    "upload_file_selected",
    "upload_started",
    "upload_s3_completed",
    "processing_scheduled",
    "clip_viewed",
  ],
  billing: [
    "billing_viewed",
    "billing_cta_clicked",
    "checkout_started",
    "checkout_returned_success",
  ],
  // "Review first"로 업로드한 경우에만 밟는 경로다(reviewBeforeGenerate는
  // @default(false)). activation에 섞으면 auto 모드 사용자가 첫 검토 스텝에서
  // 걸려 그 뒤 clip_viewed가 영구히 0이 된다 — buildFunnelReportFromEvents가
  // 엄격 순차 매처이기 때문(reporting.ts).
  review: ["clip_review_opened", "clip_review_confirmed", "clip_viewed"],
} as const satisfies Record<FunnelId, readonly AnalyticsEventName[]>;

export const FUNNEL_LABELS = {
  acquisition: "Acquisition",
  activation: "Upload Activation",
  billing: "Billing",
  review: "Clip Review",
} as const satisfies Record<FunnelId, string>;
```

- [ ] **Step 3: `packages/db/src/index.ts` 작성**

```ts
export { db } from "./client";

// 모델 타입(Clip, ClipDraft, UploadedFile 등)을 전부 내보낸다.
//
// ⚠️ `export type *`는 타입만 내보낸다. 나중에 스키마에 enum을 추가하고
// 그 값을 런타임에 쓰면 여기서 재수출되지 않아 undefined가 된다.
// 그런 사용은 `import type`으로 깨끗해 tsc가 잡지 못하므로,
// enum을 도입하는 시점에 `export { SomeEnum } from "../generated/prisma"`를
// 명시적으로 추가해야 한다.
export type * from "../generated/prisma";

// Prisma 네임스페이스는 값으로도 쓰인다
// (Prisma.PrismaClientKnownRequestError 등 2곳).
export { Prisma } from "../generated/prisma";

export * from "./analytics-contract";
```

- [ ] **Step 4: 패키지 자체 타입 체크**

```bash
npx tsc --noEmit -p packages/db/tsconfig.json
```

Expected: 에러 없음

- [ ] **Step 5: 이벤트 개수가 28개인지 확인**

```bash
node -e "const s=require('fs').readFileSync('packages/db/src/analytics-contract.ts','utf8');const m=s.slice(s.indexOf('ANALYTICS_EVENT_NAMES = ['),s.indexOf('] as const;')).match(/\"[a-z0-9_]+\"/g);console.log(m.length)"
```

Expected: `28`

문자 클래스에 `0-9`가 있어야 한다. `[a-z_]+`로 쓰면 `upload_s3_completed`와 `upload_s3_failed`가 숫자 `3` 때문에 빠져 **26**이 나온다. 초안이 그렇게 적혀 있었고, 그대로 두면 멀쩡한 계약을 보고 "이벤트 2개가 사라졌다"며 없는 문제를 쫓게 된다.

개수보다 확실한 검증은 소스와 직접 대조하는 것이다.

```bash
diff <(sed -n '/ANALYTICS_EVENT_NAMES = \[/,/\] as const;/p' apps/web/src/fsd/shared/analytics/event-catalog.ts) \
     <(sed -n '/ANALYTICS_EVENT_NAMES = \[/,/\] as const;/p' packages/db/src/analytics-contract.ts)
```

Expected: 출력 없음(완전 일치). 개수가 같아도 이름이 다르면 이 검사만 잡아낸다.

- [ ] **Step 6: 커밋**

```bash
git add packages/db/src
git commit -m "feat: add analytics contract and public surface to @repo/db"
```

---

## Task 7: web 임포트 치환과 shim

**Files:**
- Modify: `apps/web/src/**/*.ts(x)` 23개 (임포트 경로만)
- Modify: `apps/web/src/server/db.ts` (신규 shim)
- Modify: `apps/web/src/fsd/shared/analytics/event-catalog.ts`
- Modify: `apps/web/src/fsd/entities/analytics-event/model/funnels.ts`
- Modify: `apps/web/src/fsd/entities/analytics-event/model/types.ts`
- Modify: `apps/web/src/fsd/entities/analytics-event/api/index.ts`

**Interfaces:**
- Consumes: Task 6의 `@repo/db` 공개 표면
- Produces: web이 `@repo/db`만 통해 DB·계약에 접근한다. `~/server/db`와 `~/fsd/shared/analytics/event-catalog` 경로는 그대로 살아 있어 46개 사용처가 무수정이다.

- [ ] **Step 1: 치환 대상 파일 목록을 기록**

```bash
grep -rl "generated/prisma" apps/web/src --include=*.ts --include=*.tsx | tee /tmp/prisma-imports.txt | wc -l
```

Expected: `22`

(Task 5에서 `server/db.ts`가 `packages/db`로 이동했으므로 23개에서 1개 줄었다. 남은 22개는 전부 베어 스펙파이어 `from "generated/prisma"` 형태다.)

- [ ] **Step 2: `@repo/db`를 web 의존성에 추가**

```bash
npm install @repo/db@* -w apps/web
```

`apps/web/package.json`의 `dependencies`에 `"@repo/db": "*"`가 들어갔는지 확인한다.

- [ ] **Step 3: 임포트 경로 일괄 치환**

```bash
while IFS= read -r f; do
  sed -i 's|from "generated/prisma"|from "@repo/db"|g' "$f"
done < /tmp/prisma-imports.txt
```

- [ ] **Step 4: 치환 누락이 없는지 확인**

```bash
grep -rn "generated/prisma" apps/web/src --include=*.ts --include=*.tsx || echo "잔여 0건"
```

Expected: `잔여 0건`

- [ ] **Step 5: `apps/web/src/server/db.ts` shim 작성**

Task 5에서 원본이 이동했으므로 이 경로에 파일이 없다. 새로 만든다.

```ts
export { db } from "@repo/db";
```

11개 사용처(`import { db } from "~/server/db"`)가 이 한 줄 덕에 무수정이다.

- [ ] **Step 6: `event-catalog.ts` shim 작성**

`apps/web/src/fsd/shared/analytics/event-catalog.ts`를 아래로 **전체 교체**한다.

```ts
export { ANALYTICS_EVENT_NAMES } from "@repo/db";
export type { AnalyticsEventName } from "@repo/db";

// 이 상수는 recordAnalyticsEvent만 쓰는 web 전용이라 @repo/db로 옮기지 않았다.
export { ANALYTICS_METADATA_KEYS_BY_EVENT } from "./lib/metadata";
```

- [ ] **Step 7: `funnels.ts`와 `types.ts` shim 작성**

`apps/web/src/fsd/entities/analytics-event/model/funnels.ts` 전체 교체:

```ts
export { ANALYTICS_FUNNELS, FUNNEL_LABELS } from "@repo/db";
```

`apps/web/src/fsd/entities/analytics-event/model/types.ts` 전체 교체:

```ts
export type {
  AnalyticsDateRangeKey,
  AnalyticsDateRangeInput,
  AnalyticsOverview,
  DropOffReportRow,
  FunnelId,
  FunnelReportInput,
  FunnelStepReport,
  RecentFailureEventRow,
  RecordAnalyticsEventInput,
} from "@repo/db";
```

- [ ] **Step 8: `analytics-event/api/index.ts`의 임포트 정리**

이 파일은 아직 리포팅 함수를 그대로 둔다(Phase 3에서 admin으로 옮긴다). 임포트만 `@repo/db` 경유로 맞춘다. 파일 상단 1~21행을 아래로 교체한다.

```ts
import "server-only";

import { ANALYTICS_EVENT_NAMES, Prisma, db } from "@repo/db";
import { ANALYTICS_FUNNELS } from "../model/funnels";
import {
  buildDropOffReportFromEvents,
  buildFunnelReportFromEvents,
  buildOverviewFromEvents,
  buildRecentFailureEventsFromEvents,
} from "../model/reporting";
import type {
  AnalyticsDateRangeInput,
  AnalyticsDateRangeKey,
  DropOffReportRow,
  FunnelReportInput,
  FunnelStepReport,
  RecentFailureEventRow,
  RecordAnalyticsEventInput,
} from "../model/types";
```

`Prisma`가 `import type`이 아니라 값 임포트로 바뀐 것에 주의한다. 82행의 `input.metadata as Prisma.InputJsonValue | undefined`는 타입 위치라 둘 다 동작하지만, `verbatimModuleSyntax`가 켜져 있으므로 값 임포트로 통일하는 편이 안전하다.

- [ ] **Step 9: 타입 체크와 테스트**

```bash
npm run check -w apps/web
npm test -w apps/web
```

Expected: 둘 다 PASS. 치환 누락이 있으면 여기서 전부 드러난다.

- [ ] **Step 10: 커밋**

```bash
git add -A
git commit -m "refactor: route web imports through @repo/db with re-export shims"
```

---

## Task 8: web 빌드 설정 정리와 엔진 트레이싱

이 Task가 **이 계획서에서 가장 위험한 부분**이다. 설정이 틀리면 빌드는 성공하고 런타임에 전면 500이 난다.

**Files:**
- Modify: `apps/web/package.json`, `apps/web/next.config.js`

**Interfaces:**
- Consumes: Task 7의 `@repo/db` 의존성
- Produces: `apps/web`이 워크스페이스 밖 Prisma 엔진을 함수 번들에 포함하는 빌드 설정

- [ ] **Step 1: 문제를 눈으로 확인**

```bash
grep -n "process.cwd()" packages/db/generated/prisma/index.js | head -4
grep -n '"engineType"' packages/db/generated/prisma/index.js
```

Expected 출력에 아래 두 줄이 있다.

```
379:path.join(process.cwd(), "generated/prisma/query_engine-windows.dll.node")
306:      "engineType": "library"
```

Vercel에서 web 함수의 `process.cwd()`는 Root Directory인 `apps/web`이다. 엔진은 `packages/db/generated/prisma/`에 있으므로 이 후보 경로는 존재하지 않는 디렉터리를 가리킨다. `engineType`이 `"library"`라 네이티브 바이너리가 실제로 필요하다(wasm 아님).

- [ ] **Step 2: `apps/web/package.json`에서 Prisma 의존성과 스크립트 제거**

`dependencies`에서 삭제:
```
"@prisma/adapter-neon": "^7.5.0",
"@prisma/client": "^6.19.1",
```

`devDependencies`에서 삭제:
```
"prisma": "^6.19.1",
```

`scripts`에서 삭제:
```
"db:push": ...,
"db:generate": ...,
"db:migrate": ...,
"db:studio": ...,
```

`postinstall`은 **Task 5 Step 6b에서 이미 제거했다.** 여기 없어야 정상이다. 남아 있다면 Task 5가 제대로 적용되지 않은 것이고, 그렇다면 Task 5~7 커밋이 전부 설치 불가 상태였다는 뜻이다.

- [ ] **Step 3: `apps/web/next.config.js`에 트레이싱 설정 추가**

Task 3에서 넣은 dotenv 두 줄 **아래**, `withSentryConfig` 임포트 근처에 경로 헬퍼를 추가한다.

```js
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
```

그리고 `const config = {` 안 맨 위에 두 줄을 넣는다.

```js
  // Prisma 엔진이 packages/db/generated/prisma/ 에 있어 앱 Root Directory
  // 바깥이다. 트레이싱 루트를 저장소 루트로 올리지 않으면 @vercel/nft가
  // 엔진을 함수 번들에 넣지 않고, 빌드는 성공한 뒤 첫 DB 접근에서
  // "Query Engine not found"로 500이 난다.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  transpilePackages: ["@repo/db"],
```

기존 `serverExternalPackages: ["@prisma/adapter-neon"]`은 그대로 둔다.

- [ ] **Step 4: 재설치와 빌드**

```bash
npm install
npm run build -w apps/web
```

Expected: 성공

- [ ] **Step 5: 엔진이 트레이싱 산출물에 들어갔는지 확인**

```bash
grep -rl "query_engine" apps/web/.next/server/ 2>/dev/null | head -3
cat apps/web/.next/next-server.js.nft.json 2>/dev/null | tr ',' '\n' | grep -c "generated/prisma" || echo 0
```

Expected: `generated/prisma` 참조가 1건 이상. 0이면 `outputFileTracingRoot`가 안 먹은 것이다.

이 확인은 참고용이다. **결정적 검증은 Task 10의 실제 배포다.** 로컬 빌드는 Vercel의 번들링과 완전히 같지 않다.

- [ ] **Step 6: 로컬 런타임 확인**

```bash
npm run start -w apps/web
```

브라우저에서 `http://localhost:3000/login` 접속. 정상 렌더되면 Ctrl+C.

- [ ] **Step 7: 전체 게이트**

```bash
npm run check --workspaces
npm test --workspaces
```

Expected: 전부 PASS

- [ ] **Step 8: 커밋**

```bash
git add -A
git commit -m "fix: trace prisma engine from repo root and drop prisma deps from web"
```

---

## Task 9: `event-catalog` shim 회귀 테스트

Task 7 Step 6에서 만든 shim이 재수출 하나를 빠뜨려도 **타입 에러가 나지 않을 수 있다.** 사용처가 `import type`이면 컴파일은 통과하고, 값으로 쓰는 곳만 런타임에 `undefined`를 받는다. 계측이 조용히 멈추는 경로라 타입 검사에 기댈 수 없다.

**Files:**
- Create: `apps/web/src/fsd/shared/analytics/event-catalog.test.mjs`

**Interfaces:**
- Consumes: Task 7의 shim
- Produces: 없음(테스트)

- [ ] **Step 1: 실패하는 테스트를 먼저 쓴다**

`apps/web/src/fsd/shared/analytics/event-catalog.test.mjs`:

```js
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ANALYTICS_EVENT_NAMES,
  ANALYTICS_METADATA_KEYS_BY_EVENT,
} from "./event-catalog.ts";

test("shim이 이벤트 이름 28개를 그대로 내보낸다", () => {
  assert.equal(ANALYTICS_EVENT_NAMES.length, 28);
  assert.ok(ANALYTICS_EVENT_NAMES.includes("clip_review_confirmed"));
  assert.ok(ANALYTICS_EVENT_NAMES.includes("landing_view"));
});

test("shim이 web 전용 metadata 재수출을 유지한다", () => {
  assert.ok(
    ANALYTICS_METADATA_KEYS_BY_EVENT,
    "재수출이 빠지면 계측이 타입 에러 없이 조용히 멈춘다",
  );
});

test("모든 이벤트 이름에 metadata 정의가 있다", () => {
  for (const name of ANALYTICS_EVENT_NAMES) {
    assert.ok(
      name in ANALYTICS_METADATA_KEYS_BY_EVENT,
      `metadata 정의 누락: ${name}`,
    );
  }
});
```

- [ ] **Step 2: 실행해서 실패를 확인**

```bash
npm test -w apps/web
```

Expected: FAIL. `.mjs`에서 `.ts`를 직접 임포트할 수 없어 `ERR_UNKNOWN_FILE_EXTENSION` 또는 유사 에러가 난다.

- [ ] **Step 3: 스크립트에 스트리핑 플래그가 있는지 확인**

Task 1 Step 4에서 이미 `--experimental-strip-types`를 넣었다. 이 테스트도 `.ts`를 임포트하므로 같은 플래그에 의존한다.

```bash
grep '"test"' apps/web/package.json
```

Expected: `--experimental-strip-types`가 포함되어 있다. 없으면 Task 1이 제대로 적용되지 않은 것이므로 먼저 고친다.

Node가 22.6 미만이면 이 방식을 쓸 수 없다. 그때는 이 테스트를 `.test.ts`로 만들고 `tsx`를 devDependency로 추가한 뒤 스크립트를 `tsx --test`로 바꾼다.

- [ ] **Step 4: 통과 확인**

```bash
npm test -w apps/web
```

Expected: PASS. 3개 테스트 모두 통과.

- [ ] **Step 5: 회귀를 잡는지 검증**

`event-catalog.ts`의 마지막 줄(`export { ANALYTICS_METADATA_KEYS_BY_EVENT } ...`)을 임시로 주석 처리한다.

```bash
npm test -w apps/web
```

Expected: FAIL. "shim이 web 전용 metadata 재수출을 유지한다"가 실패해야 한다.

**주석을 되돌린다.**

```bash
npm test -w apps/web
```

Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add apps/web/src/fsd/shared/analytics/event-catalog.test.mjs apps/web/package.json
git commit -m "test: guard event-catalog shim re-exports against silent breakage"
```

---

## Task 10: 일회용 Vercel 프로젝트로 검증 (Phase 0 게이트)

**코드 변경이 없는 수동 Task다.** 라이브 프로젝트를 건드리기 전에 전 과정을 검증한다.

Vercel의 Root Directory는 **프로젝트 단위 설정**이라 프리뷰와 프로덕션을 함께 지배한다. `apps/web` 레이아웃을 프리뷰로만 시험할 방법이 없으므로 별도 프로젝트가 필요하다.

**Files:** 없음

**Interfaces:**
- Consumes: Task 1~9의 전체 결과
- Produces: 라이브 전환이 안전하다는 증거

- [ ] **Step 1: 작업 브랜치를 원격에 올린다**

```bash
git push -u origin HEAD
```

- [ ] **Step 2: Vercel에 일회용 프로젝트를 만든다**

- Vercel 대시보드 → Add New → Project
- 같은 저장소(`Sangeok/ApcH`) 선택
- 프로젝트 이름: `apch-monorepo-probe` (나중에 지울 것이므로 알아보기 쉽게)
- **Root Directory: `apps/web`**
- Install/Build Command: 기본값 그대로
- Production Branch를 작업 브랜치로 지정
- 환경변수: 라이브 web 프로젝트의 값을 그대로 복사

- [ ] **Step 3: 확인 a — 워크스페이스 설치가 저장소 루트에서 도는가**

빌드 로그에서 install 단계를 본다.

Expected: `added N packages` 앞에 워크스페이스 링크 로그가 있고 `@repo/db` 해석 실패가 없다.

**실패 시**: `npm error notarget No matching version found for @repo/db@*`가 뜨면 Vercel이 Root Directory를 cwd로 설치한 것이다. 프로젝트 설정 → Install Command를 `npm install --workspaces --include-workspace-root`로 명시하고 재배포한다.

- [ ] **Step 4: 확인 b — `prisma generate`가 도는가**

빌드 로그에서 검색한다.

Expected: `Generated Prisma Client` 문자열이 있다.

**실패 시**: npm이 캐시로 postinstall을 건너뛴 것이다. Build Command를 `npm run db:generate:client -w @repo/db && next build`로 명시하고 재배포한다.

- [ ] **Step 5: 확인 c — DB를 실제로 읽는 페이지가 200을 반환하는가**

**이 확인이 이 Task의 존재 이유다.** `next build`는 라이브 쿼리를 실행하지 않으므로 엔진이 없어도 성공한다.

배포 URL로 접속해 Google 로그인 후 `/dashboard`에 들어간다. 업로드 목록이 렌더되면 통과다.

Expected: 200, 목록 정상 렌더

**실패 시**: 500과 함께 함수 로그에 `Query Engine not found` 또는 `PrismaClientInitializationError`가 보이면 엔진 트레이싱 실패다. 대응 순서:
1. Task 8 Step 3의 `outputFileTracingRoot`가 실제로 들어갔는지 확인
2. 그래도 실패하면 `npm install -D @prisma/nextjs-monorepo-workaround-plugin -w apps/web` 후 `next.config.js`에 웹팩 플러그인을 추가한다

```js
import { PrismaPlugin } from "@prisma/nextjs-monorepo-workaround-plugin";

// config 객체 안에 추가
  webpack: (config, { isServer }) => {
    if (isServer) config.plugins = [...config.plugins, new PrismaPlugin()];
    return config;
  },
```

- [ ] **Step 6: 확인 d — `NEXT_PUBLIC_*`가 클라이언트 번들에 인라인되었는가**

배포된 페이지에서 브라우저 개발자도구 → Console:

```js
document.querySelector('link[rel="canonical"]')?.href
```

Expected: `https://a-pch.com/...` 형태(또는 프로젝트에 주입한 `NEXT_PUBLIC_SITE_URL` 값). `undefined`거나 `localhost`면 dotenv 선로드가 Next의 인라이닝보다 늦게 돈 것이다.

**실패 시**: 결정 10을 재검토한다. `.env`를 `apps/web/.env`로 되돌리고 `packages/db`에는 `dotenv-cli`로 루트를 가리키게 한다.

- [ ] **Step 7: 로그인/업로드 스모크 테스트**

배포 URL에서 로그인 → 대시보드 → 파일 업로드 → 처리 스케줄링까지 한 번 돌린다.

- [ ] **Step 8: 계측이 살아있는지 확인**

위 스모크 테스트 후 DB를 확인한다.

```bash
npm run db:studio -w @repo/db
```

`AnalyticsEvent` 테이블에 방금 시각의 새 행이 있으면 통과다. Task 7의 `event-catalog` shim이 깨졌다면 여기서만 드러난다.

- [ ] **Step 9: 일회용 프로젝트 삭제**

a~d와 스모크 테스트가 전부 통과하면 Vercel에서 `apch-monorepo-probe` 프로젝트를 삭제한다.

Step 5나 6에서 설정을 바꿨다면(Install/Build Command, 웹팩 플러그인) **그 변경을 커밋한다.**

```bash
git add -A
git commit -m "fix: adjust build config for vercel workspace deployment"
git push
```

---

## Task 11: 라이브 Vercel 프로젝트 전환

**코드 변경이 없는 수동 Task다.** Task 10이 전부 통과한 뒤에만 실행한다.

**Files:** 없음

**Interfaces:**
- Consumes: Task 10의 검증 결과
- Produces: 프로덕션이 모노레포 구조로 서빙된다

- [ ] **Step 1: 현재 라이브 설정을 기록**

Vercel → 라이브 web 프로젝트 → Settings → General에서 아래를 적어둔다. 롤백에 필요하다.

- Root Directory (현재값)
- Install Command
- Build Command

- [ ] **Step 2: 저트래픽 시간대인지 확인하고 브랜치를 병합**

```bash
git checkout main
git merge --no-ff <작업브랜치>
git push
```

**아직 Root Directory를 바꾸지 않았으므로 이 배포는 실패한다.** 예상된 동작이다. 다음 Step에서 즉시 고친다.

- [ ] **Step 3: Root Directory 변경**

Vercel → 라이브 web 프로젝트 → Settings → General → Root Directory를 **`apps/web`**으로 변경하고 저장한다.

Task 10에서 Install/Build Command를 바꿨다면 여기에도 같이 적용한다.

- [ ] **Step 4: 재배포**

Deployments → 최신 배포 → Redeploy. **빌드 캐시를 사용하지 않는 옵션을 켠다.** Prisma 산출물 경로가 바뀌어 캐시가 오염됐을 수 있다.

- [ ] **Step 5: 프로덕션 확인**

Task 10 Step 5·7과 같은 확인을 프로덕션 도메인에서 한다.

- [ ] 로그인 → `/dashboard` 200, 목록 렌더
- [ ] 업로드 → 처리 스케줄링
- [ ] `/admin/analytics` 진입 (아직 web에 있다. 퍼널 수치가 전환 전과 같은지 대조)
- [ ] 빌링 페이지 진입

**실패 시 롤백**: Root Directory를 Step 1의 값으로 되돌리고, `git revert`로 병합을 되돌린 뒤 재배포한다. 설정 원복은 수동이며 git revert로 커버되지 않는다.

- [ ] **Step 6: lockfile 변화 폭 확인**

루트 설치가 모든 `^` 범위를 재해석했으므로 전이 의존성 버전이 달라졌을 수 있다.

```bash
git diff HEAD~1 -- package-lock.json | grep '"version"' | head -40
```

메이저 버전이 움직인 패키지가 있으면 개별 검토한다. 없으면 그대로 둔다.

- [ ] **Step 7: 완료 태그**

```bash
git tag monorepo-phase-2-complete
git push --tags
```

---

## 완료 조건

이 계획서는 아래가 전부 참일 때 완료다.

- [ ] `npm run check --workspaces`와 `npm test --workspaces`가 루트에서 통과
- [ ] 프로덕션 `a-pch.com`이 `apps/web` Root Directory로 정상 서빙
- [ ] `/dashboard`가 DB를 읽어 200을 반환 (엔진 트레이싱 성공)
- [ ] `AnalyticsEvent` 테이블에 새 이벤트가 쌓임 (계측 생존)
- [ ] `git ls-files packages/db/generated | wc -l`이 27
- [ ] `apps/web/src`에 `generated/prisma` 임포트 0건
- [ ] 사용자 세션이 전환 전후로 유지됨 (쿠키 미변경)
- [ ] 일회용 Vercel 프로젝트가 삭제됨

## 다음 단계

`docs/plans/2026-08-01-admin-app-split.md`로 진행한다. 그 계획서는 이 계획서의 `@repo/db` 공개 표면(Task 6의 Interfaces 블록)에 의존한다.
