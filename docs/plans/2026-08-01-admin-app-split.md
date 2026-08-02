# 어드민 앱 분리 배포 (Phase 3~4) 구현 계획서

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 어드민 화면을 `apps/admin` 신규 Next.js 앱으로 옮기고 `admin.a-pch.com`에 독립 배포한다. web의 사용자 세션은 건드리지 않는다.

**Architecture:** admin이 자체 NextAuth 인스턴스를 갖는다(Google provider, JWT 전략, Prisma adapter 없음). web과 쿠키를 공유하지 않으므로 web의 인증 코드는 한 줄도 바뀌지 않는다. `ADMIN_EMAILS` 화이트리스트를 `signIn` 콜백에서 검사해 미등재 계정은 세션 자체가 생기지 않게 한다. DB 접근은 `@repo/db`를 통하고 읽기 전용이다.

**Tech Stack:** Next.js 15.5.7, NextAuth 5.0.0-beta.25, `@repo/db`, `@sentry/nextjs` 10.68, Tailwind 4

**설계 문서:** `docs/proposals/monorepo-admin-split-2026-08-01.md` (결정 1·2·6·7·9, §4.5~4.9, §5 Phase 3~4)

**선행 계획서:** `docs/plans/2026-08-01-monorepo-conversion.md`. **완료되지 않았으면 이 계획서를 시작하지 않는다.**

## Global Constraints

- admin은 web과 **쿠키를 공유하지 않는다.** `cookies.domain`을 설정하지 않는다. web의 `src/server/auth/` 아래 파일을 수정하지 않는다.
- admin의 NextAuth에 **`adapter`를 넣지 않는다.** 어드민 로그인이 `User`/`Account` 테이블에 레코드를 만들면 안 된다.
- admin은 DB를 **읽기만 한다.** 쓰기 쿼리를 추가하지 않는다.
- admin의 `src/env.js`에 **`AWS_*`, `S3_BUCKET_NAME`, `PROCESS_VIDEO_ENDPOINT*`, `POLAR_*`, `INNGEST_*`, `CLOUDFRONT_*`, `MODAL_WEBHOOK_SECRET`, `NEXT_PUBLIC_*`를 넣지 않는다.**
- admin은 **`next-themes`를 의존성에 넣지 않는다.** sonner atom 복사 시 `useTheme()` 호출을 제거한다.
- admin의 라우트에서 `/admin` prefix를 쓰지 않는다. 서브도메인이 이미 admin을 뜻한다.
- Sentry는 **web과 같은 DSN·프로젝트**를 쓰고 `initialScope.tags.app = "admin"`으로 구분한다.
- 세션 `maxAge`는 **8시간**(`60 * 60 * 8`)이다.
- **Task 12 전까지 `apps/web`의 어드민 관련 파일을 삭제하지 않는다.** admin이 프로덕션에서 확인될 때까지 web의 `/admin`이 살아 있어야 한다.
- 커밋 메시지는 Conventional Commits 형식을 쓴다.

---

## 파일 구조

```
apps/admin/
├─ package.json                [신규] 의존성은 Task 1에 전량 명시
├─ next.config.js              [신규] dotenv 선로드 + 트레이싱 + 축소 CSP
├─ tsconfig.json               [신규] paths: { "~/*": ["./src/*"] }
├─ postcss.config.js           [신규] web에서 복사
├─ eslint.config.js            [신규] web에서 복사
├─ prettier.config.js          [신규] web에서 복사
├─ vercel.json                 [신규] regions: ["icn1"]
├─ .gitignore                  [신규] web에서 복사. generated/ 는 무시하지 않는다
└─ src/
   ├─ env.js                   [신규] 필요한 10개만
   ├─ middleware.ts            [신규]
   ├─ instrumentation.ts       [신규] web에서 복사
   ├─ sentry.server.config.ts  [신규] web 대비 축소 + app 태그
   ├─ styles/globals.css       [복사] web에서
   ├─ auth/
   │  ├─ config.edge.ts        [신규] Edge 호환. maxAge 8h, AUTH_ROUTES 분기
   │  ├─ config.ts             [신규] Google + ADMIN_EMAILS signIn 게이트
   │  ├─ index.ts              [신규] NextAuth 인스턴스
   │  └─ guard.ts              [신규] requireAdmin()
   ├─ app/
   │  ├─ layout.tsx            [이동] web app/admin/layout.tsx 기반
   │  ├─ page.tsx              [신규] /analytics로 redirect
   │  ├─ robots.ts             [신규] 전체 disallow
   │  ├─ login/page.tsx        [신규] Google 버튼 + AccessDenied 문구
   │  ├─ analytics/page.tsx    [이동] web app/admin/analytics/page.tsx
   │  ├─ observability/page.tsx[이동] web app/admin/observability/page.tsx
   │  └─ api/auth/[...nextauth]/route.ts  [신규]
   ├─ analytics/
   │  ├─ reporting.ts          [이동] web entities/analytics-event/model/reporting.ts
   │  ├─ reporting.test.mjs    [이동] 같은 위치에서
   │  └─ queries.ts            [분리] web entities/analytics-event/api/index.ts 의 리포팅 4개
   ├─ observability/
   │  ├─ report-error.ts       [복사] web shared/observability/report-error.ts
   │  ├─ index.ts              [복사] web shared/observability/index.ts
   │  └─ test-action.ts        [이동] web features/observability-test/api/index.ts
   ├─ lib/
   │  ├─ result.ts             [복사] web shared/api/result.ts
   │  ├─ utils.ts              [복사] web shared/lib/utils.ts (cn만)
   │  └─ admin-emails.test.mjs [신규] 화이트리스트 파싱 테스트
   └─ ui/
      ├─ analytics-page.tsx    [이동] web pages/admin-analytics/ui/index.tsx
      ├─ format-rate.ts        [이동] web pages/admin-analytics/lib/format-rate.ts
      ├─ types.ts              [이동] web pages/admin-analytics/model/types.ts
      ├─ observability-panel.tsx [이동] web pages/admin-observability/ui/index.tsx
      └─ atoms/                [복사] button, card, table, badge, sonner
```

admin 내부는 FSD를 적용하지 않는다. 화면 2개 규모에서 레이어 규칙은 비용만 된다.

---

## Task 0: `apps/web/CLAUDE.md` 선행 갱신

**이 Task를 Task 14로 미루면 안 된다.** 모노레포 전환이 `apps/web`의 명령을 옮겼는데 `CLAUDE.md`가 옛 것을 그대로 말하고 있다. AI 에이전트가 이 파일을 사실로 읽으므로, 갱신 전까지 Task 1~13 내내 틀린 전제로 작업하게 된다.

**Files:**
- Modify: `apps/web/CLAUDE.md`

- [ ] **Step 1: 전환으로 실제로 틀려진 것을 고친다**

| 현재 서술 | 실제 |
|---|---|
| `npm run db:push` / `db:generate` / `db:migrate` / `db:studio` | `apps/web`에서 제거됨. `npm run db:push -w @repo/db` 형태 |
| "Prisma Client regenerates automatically via postinstall hook" | `postinstall` 소유권이 `@repo/db`로 이전됨 |
| "Schema located in `prisma/schema.prisma`" | `packages/db/prisma/schema.prisma` |
| "Generated client in `generated/prisma/`" | `packages/db/generated/prisma/` |
| `npm run dev` 등 앱 루트 기준 명령 | 저장소 루트에서 `npm run dev`, 또는 `-w apps/web` |
| 테스트 명령 언급 없음 | `npm test -w apps/web` (러너는 `tsx`) |

- [ ] **Step 2: 전환 이전부터 낡아 있던 것도 함께 고친다**

이건 이 계획이 만든 문제는 아니지만 같은 파일이고 같은 종류의 해악이다.

| 현재 서술 | 실제 |
|---|---|
| "Prisma + SQLite" | Postgres (Neon) + `@prisma/adapter-neon` |
| "Credentials provider with bcrypt password hashing" | Google OAuth 전용 (2026-03-26에 Credentials 제거) |
| `src/actions/` 디렉터리 설명 | 존재하지 않음. 서버 액션은 FSD 슬라이스의 `api/`에 있음 |

- [ ] **Step 3: 커밋**

```bash
git add apps/web/CLAUDE.md
git commit -m "docs: update CLAUDE.md for the monorepo layout"
```

> Task 14는 README와 설계 문서 Status를 담당한다. 여기서는 `CLAUDE.md`만 고친다 — 그것만이 이후 Task의 작업 품질에 직접 영향을 준다.

---

## Task 1: admin 앱 스캐폴딩

**Files:**
- Create: `apps/admin/package.json`, `tsconfig.json`, `postcss.config.js`, `eslint.config.js`, `prettier.config.js`, `vercel.json`, `src/env.js`, `src/styles/globals.css`
- Modify: 루트 `package.json`

**Interfaces:**
- Consumes: `@repo/db` (선행 계획서 Task 6)
- Produces: `apps/admin` 워크스페이스. 이후 모든 Task가 이 안에서 작업한다.

- [ ] **Step 1: `apps/admin/package.json` 생성**

버전은 `apps/web/package.json`과 맞춘다. 어긋나면 워크스페이스 호이스팅이 깨져 중복 설치가 생긴다.

```json
{
  "name": "apch-admin",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev --turbo --port 3001",
    "build": "next build",
    "start": "next start --port 3001",
    "check": "next lint && tsc --noEmit",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "node --experimental-strip-types --test \"src/**/*.test.mjs\""
  },
  "dependencies": {
    "@repo/db": "*",
    "@radix-ui/react-slot": "^1.2.4",
    "@sentry/nextjs": "^10.68.0",
    "@t3-oss/env-nextjs": "^0.12.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^0.553.0",
    "next": "15.5.7",
    "next-auth": "5.0.0-beta.25",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "server-only": "^0.0.1",
    "sonner": "^2.0.7",
    "tailwind-merge": "^3.4.0",
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "@eslint/eslintrc": "^3.3.1",
    "@tailwindcss/postcss": "^4.0.15",
    "@types/node": "^20.14.10",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "dotenv": "^16.4.5",
    "eslint": "^9.23.0",
    "eslint-config-next": "^15.2.3",
    "postcss": "^8.5.3",
    "prettier": "^3.5.3",
    "prettier-plugin-tailwindcss": "^0.6.11",
    "tailwindcss": "^4.0.15",
    "tw-animate-css": "^1.4.0",
    "typescript": "^5.8.2",
    "typescript-eslint": "^8.27.0"
  }
}
```

`next-themes`가 없는 것을 확인한다. sonner atom을 복사할 때 `useTheme()`을 제거할 것이다(Task 6).

**`typescript-eslint`를 빠뜨리면 안 된다.** `eslint.config.js`가 `import tseslint from "typescript-eslint"`로 직접 임포트한다. 선언하지 않아도 `apps/web`에서 호이스팅되어 당장은 동작하지만, web이 이 의존성을 버리는 순간 admin의 lint가 원인 불명으로 깨진다. 워크스페이스가 남의 의존성에 기대는 상태를 만들지 않는다.

버전은 `apps/web/package.json`과 맞춘다. **계획서 값과 `apps/web` 값이 다르면 `apps/web`이 이긴다** — 계획서 숫자는 손으로 옮겨 적은 것이라 오타 가능성이 있다.

포트를 3001로 둔 이유: web이 3000을 쓰므로 둘을 동시에 띄울 수 있어야 한다.

> **이 시점에는 `npm run check -w apps/admin`과 `npm run build -w apps/admin`이 실패한다.** `app` 디렉터리가 없어 Next가 `Couldn't find any 'pages' or 'app' directory`로 죽는다. Task 8이 라우트를 만들면 해결된다. 통과시키려고 플레이스홀더 라우트를 만들지 않는다. `npm install`과 `npm test -w apps/web`은 이 구간에서도 성공해야 한다.

- [ ] **Step 2: `apps/admin/tsconfig.json` 생성**

`apps/web/tsconfig.json`과 같되 `include`에서 `.cjs`를 뺀다(admin에는 없다).

```json
{
  "compilerOptions": {
    "esModuleInterop": true,
    "skipLibCheck": true,
    "target": "es2022",
    "allowJs": true,
    "resolveJsonModule": true,
    "moduleDetection": "force",
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "checkJs": true,
    "lib": ["dom", "dom.iterable", "ES2022"],
    "noEmit": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "preserve",
    "plugins": [{ "name": "next" }],
    "incremental": true,
    "baseUrl": ".",
    "paths": {
      "~/*": ["./src/*"]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    "**/*.js",
    ".next/types/**/*.ts"
  ],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: 설정 파일 3개를 web에서 복사**

```bash
cp apps/web/postcss.config.js apps/admin/postcss.config.js
cp apps/web/eslint.config.js apps/admin/eslint.config.js
cp apps/web/prettier.config.js apps/admin/prettier.config.js
cp apps/web/.gitignore apps/admin/.gitignore
cp apps/web/.npmrc apps/admin/.npmrc 2>/dev/null || true
mkdir -p apps/admin/src/styles
cp apps/web/src/styles/globals.css apps/admin/src/styles/globals.css
```

`.npmrc`는 선행 계획서에서 루트로 승격되어 없을 수 있다. `|| true`로 넘어간다.

- [ ] **Step 4: `apps/admin/vercel.json` 생성**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "regions": ["icn1"]
}
```

- [ ] **Step 5: `apps/admin/src/env.js` 생성**

web의 26개 중 admin이 실제로 쓰는 것만 담는다. 이 목록이 admin Vercel 프로젝트에 주입할 환경변수와 정확히 일치해야 한다.

```js
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    // DB (읽기 전용)
    DATABASE_URL: z.string(),
    DATABASE_URL_UNPOOLED: z.string().optional(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    // 인증
    AUTH_SECRET:
      process.env.NODE_ENV === "production"
        ? z.string()
        : z.string().optional(),
    AUTH_URL: z.string().url().optional(),
    AUTH_GOOGLE_ID: z.string(),
    AUTH_GOOGLE_SECRET: z.string(),
    ADMIN_EMAILS: z.string().optional(),
    // 관측 (web과 동일 값)
    SENTRY_DSN: z.string().optional(),
    SENTRY_AUTH_TOKEN: z.string().optional(),
  },

  // admin에는 클라이언트 노출 변수가 없다.
  client: {},

  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED,
    NODE_ENV: process.env.NODE_ENV,
    AUTH_SECRET: process.env.AUTH_SECRET,
    AUTH_URL: process.env.AUTH_URL,
    AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID,
    AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET,
    ADMIN_EMAILS: process.env.ADMIN_EMAILS,
    SENTRY_DSN: process.env.SENTRY_DSN,
    SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
  },

  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
```

`SENTRY_ORG`/`SENTRY_PROJECT`가 없는 것이 맞다. 그 둘은 `env.js`가 아니라 `next.config.js`가 직접 읽는다(web과 같은 구조).

- [ ] **Step 6: 루트 `package.json`에 `dev:admin` 추가**

`"dev": "npm run dev -w apps/web",` 다음 줄에 넣는다.

```json
    "dev:admin": "npm run dev -w apps/admin",
```

- [ ] **Step 7: 설치와 워크스페이스 인식 확인**

```bash
npm install
npm ls -w apps/admin --depth=0
```

Expected: `apch-admin@0.1.0 -> ./apps/admin` 출력

- [ ] **Step 8: 커밋**

```bash
git add apps/admin package.json package-lock.json
git commit -m "chore: scaffold apps/admin workspace"
```

---

## Task 2: admin 인증

**Files:**
- Create: `apps/admin/src/auth/config.edge.ts`, `config.ts`, `index.ts`, `guard.ts`
- Create: `apps/admin/src/app/api/auth/[...nextauth]/route.ts`
- Create: `apps/admin/src/middleware.ts`

**Interfaces:**
- Consumes: `env.ADMIN_EMAILS`, `env.AUTH_GOOGLE_ID`, `env.AUTH_GOOGLE_SECRET`
- Produces:
  - `auth()` — 세션 조회. `Promise<Session | null>`
  - `requireAdmin(): Promise<{ userId: string; email: string }>` — 인가 실패 시 `redirect()`/`notFound()`를 던진다(resolve하지 않는다)
  - `handlers`, `signIn`, `signOut`

- [ ] **Step 1: `config.edge.ts` 작성**

middleware가 이것만 쓴다. Prisma·env 의존이 없어야 Edge에서 돈다.

```ts
import type { NextAuthConfig } from "next-auth";

const AUTH_ROUTES = ["/login"];

export const authConfigEdge = {
  providers: [],
  session: {
    strategy: "jwt",
    // ADMIN_EMAILS에서 제거한 계정의 기존 JWT가 유효한 창을
    // 기본 30일에서 8시간으로 줄인다.
    maxAge: 60 * 60 * 8,
  },
  pages: { signIn: "/login" },
  callbacks: {
    // ⚠️ `authorized: ({ auth }) => !!auth?.user`로 축약하면 안 된다.
    // matcher가 /login을 포함하므로, 미인증 요청이 false를 받으면
    // NextAuth가 pages.signIn(= /login)으로 리다이렉트하고 미들웨어가
    // 다시 돌아 false를 받는다. 무한 리다이렉트가 된다.
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isAuthRoute = AUTH_ROUTES.some((route) =>
        nextUrl.pathname.startsWith(route),
      );

      if (isAuthRoute) {
        return isLoggedIn
          ? Response.redirect(new URL("/analytics", nextUrl))
          : true;
      }

      // /login을 뺀 전 경로가 보호 대상이다.
      return isLoggedIn;
    },
  },
} satisfies NextAuthConfig;
```

- [ ] **Step 2: `config.ts` 작성**

```ts
import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

import { env } from "~/env";
import { authConfigEdge } from "./config.edge";

function getAdminEmailSet() {
  return new Set(
    (env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export const authConfig = {
  ...authConfigEdge,
  providers: [Google],
  callbacks: {
    ...authConfigEdge.callbacks,
    // 화이트리스트 밖 계정은 로그인 자체를 거부한다.
    // 세션이 만들어지지 않으므로 guard는 2차 방어선이 된다.
    signIn: ({ user }) => {
      const email = user.email?.toLowerCase();
      return !!email && getAdminEmailSet().has(email);
    },
    session: ({ session, token }) => ({
      ...session,
      user: { ...session.user, id: token.sub },
    }),
  },
} satisfies NextAuthConfig;

export { getAdminEmailSet };
```

`adapter`가 없다. Google 로그인 + JWT 전략은 어댑터 없이 동작하며, 어드민 로그인이 DB에 레코드를 만들지 않는다.

- [ ] **Step 3: `index.ts` 작성**

web의 `src/server/auth/index.ts`와 같은 패턴이다.

```ts
import NextAuth from "next-auth";
import { cache } from "react";

import { authConfig } from "./config";

const { auth: uncachedAuth, handlers, signIn, signOut } = NextAuth(authConfig);

const auth = cache(uncachedAuth);

export { auth, handlers, signIn, signOut };
```

- [ ] **Step 4: `guard.ts` 작성**

web의 `admin-guard.ts`와 **같은 시그니처**를 유지한다. 옮겨오는 페이지와 서버 액션의 호출부를 바꾸지 않기 위해서다.

```ts
import "server-only";

import { notFound, redirect } from "next/navigation";

import { auth, getAdminEmailSet } from "./index";

export async function requireAdmin() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const email = session.user.email?.toLowerCase();

  // signIn 콜백이 이미 걸렀지만 재검사를 남긴다.
  // ADMIN_EMAILS에서 제거된 계정의 기존 JWT가 maxAge(8h) 만료 전까지
  // 유효하므로, 이 검사가 다음 요청부터 차단한다.
  if (!email || !getAdminEmailSet().has(email)) {
    notFound();
  }

  return {
    userId: session.user.id,
    email,
  };
}
```

`getAdminEmailSet`이 `config.ts`에 있으므로 `index.ts`에서도 재수출해야 한다. `index.ts` 마지막에 추가한다.

```ts
export { getAdminEmailSet } from "./config";
```

- [ ] **Step 5: NextAuth 라우트 핸들러 생성**

`apps/admin/src/app/api/auth/[...nextauth]/route.ts`:

```ts
import { handlers } from "~/auth";

export const { GET, POST } = handlers;
```

- [ ] **Step 6: `middleware.ts` 생성**

`apps/admin/src/middleware.ts`:

```ts
import NextAuth from "next-auth";

import { authConfigEdge } from "~/auth/config.edge";

export default NextAuth(authConfigEdge).auth;

// /login도 matcher에 포함된다. 제외하지 않는 이유는 이미 로그인한 사용자를
// /analytics로 되돌려보내기 위해서다. 미인증 사용자가 /login에서 다시
// /login으로 튕기지 않도록 authorized 콜백이 AUTH_ROUTES를 명시 처리한다.
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 7: 타입 체크**

```bash
npm run typecheck -w apps/admin
```

Expected: 에러 없음. `next-env.d.ts`가 없다는 에러가 나면 `npm run build -w apps/admin`을 한 번 돌려 생성한다(빌드는 아직 실패해도 된다. 페이지가 없다).

- [ ] **Step 8: 커밋**

```bash
git add apps/admin/src/auth apps/admin/src/middleware.ts apps/admin/src/app/api
git commit -m "feat: add standalone auth to admin app with admin email allowlist"
```

---

## Task 3: 화이트리스트 파싱 테스트

`ADMIN_EMAILS` 파싱이 이 앱의 유일한 인가 로직이다. 공백이나 트레일링 콤마 때문에 조용히 빈 집합이 되면 아무도 못 들어온다.

**Files:**
- Create: `apps/admin/src/lib/admin-emails.test.mjs`
- Create: `apps/admin/src/lib/parse-admin-emails.ts`
- Modify: `apps/admin/src/auth/config.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `parseAdminEmails(raw: string | undefined): Set<string>` — 순수 함수. `config.ts`가 이것을 쓴다.

- [ ] **Step 1: 순수 함수로 분리하기 위한 실패 테스트를 먼저 쓴다**

`apps/admin/src/lib/admin-emails.test.mjs`:

```js
import assert from "node:assert/strict";
import { test } from "node:test";

import { parseAdminEmails } from "./parse-admin-emails.ts";

test("콤마로 나누고 공백을 제거한다", () => {
  const set = parseAdminEmails("a@x.com, b@y.com");
  assert.equal(set.size, 2);
  assert.ok(set.has("a@x.com"));
  assert.ok(set.has("b@y.com"));
});

test("대문자를 소문자로 정규화한다", () => {
  const set = parseAdminEmails("Admin@Example.COM");
  assert.ok(set.has("admin@example.com"));
});

test("트레일링 콤마가 빈 항목을 만들지 않는다", () => {
  const set = parseAdminEmails("a@x.com,");
  assert.equal(set.size, 1);
  assert.ok(!set.has(""));
});

test("undefined는 빈 집합이 된다", () => {
  assert.equal(parseAdminEmails(undefined).size, 0);
});

test("빈 문자열은 빈 집합이 된다", () => {
  assert.equal(parseAdminEmails("").size, 0);
});

test("공백만 있는 항목은 버려진다", () => {
  const set = parseAdminEmails("a@x.com, , b@y.com");
  assert.equal(set.size, 2);
});
```

- [ ] **Step 2: 실행해서 실패를 확인**

```bash
npm test -w apps/admin
```

Expected: FAIL. `Cannot find module './parse-admin-emails.ts'`

- [ ] **Step 3: 구현**

`apps/admin/src/lib/parse-admin-emails.ts`:

```ts
export function parseAdminEmails(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}
```

- [ ] **Step 4: 통과 확인**

```bash
npm test -w apps/admin
```

Expected: PASS. 6개 테스트 전부 통과.

- [ ] **Step 5: `config.ts`가 이 함수를 쓰도록 바꾼다**

`apps/admin/src/auth/config.ts`의 `getAdminEmailSet`을 교체한다.

```ts
import { parseAdminEmails } from "~/lib/parse-admin-emails";

function getAdminEmailSet() {
  return parseAdminEmails(env.ADMIN_EMAILS);
}
```

- [ ] **Step 6: 타입 체크**

```bash
npm run typecheck -w apps/admin
```

Expected: 에러 없음

- [ ] **Step 7: 커밋**

```bash
git add apps/admin/src/lib apps/admin/src/auth/config.ts
git commit -m "test: cover admin email allowlist parsing edge cases"
```

---

## Task 4: analytics 쿼리 분리

web의 `entities/analytics-event/api/index.ts`에서 리포팅 쪽만 admin으로 가져온다. **web 파일은 아직 건드리지 않는다**(Task 12에서 정리).

**Files:**
- Create: `apps/admin/src/analytics/queries.ts`
- Copy: `apps/web/src/fsd/entities/analytics-event/model/reporting.ts` → `apps/admin/src/analytics/reporting.ts`
- Copy: `apps/web/src/fsd/entities/analytics-event/model/reporting.test.mjs` → `apps/admin/src/analytics/reporting.test.mjs`

**Interfaces:**
- Consumes: `@repo/db`의 `db`, `ANALYTICS_EVENT_NAMES`, `ANALYTICS_FUNNELS`, 타입들
- Produces:
  - `getAnalyticsOverview(input: AnalyticsDateRangeInput): Promise<AnalyticsOverview>`
  - `getFunnelReport(input: FunnelReportInput): Promise<FunnelStepReport[]>`
  - `getDropOffReport(input: AnalyticsDateRangeInput): Promise<DropOffReportRow[]>`
  - `getRecentFailureEvents(input: AnalyticsDateRangeInput): Promise<RecentFailureEventRow[]>`

- [ ] **Step 1: `reporting.ts`를 복사**

이 파일은 임포트가 하나도 없는 순수 함수 모듈이라 수정 없이 옮겨진다.

```bash
mkdir -p apps/admin/src/analytics
cp apps/web/src/fsd/entities/analytics-event/model/reporting.ts apps/admin/src/analytics/reporting.ts
cp apps/web/src/fsd/entities/analytics-event/model/reporting.test.mjs apps/admin/src/analytics/reporting.test.mjs
```

- [ ] **Step 2: 복사된 테스트가 그대로 통과하는지 확인**

```bash
npm test -w apps/admin
```

Expected: PASS. Task 3의 6개 + reporting 테스트가 전부 통과.

테스트 파일이 `./reporting.ts`가 아닌 다른 경로를 임포트하면 상대 경로를 고친다.

- [ ] **Step 3: `queries.ts` 작성**

web의 `api/index.ts` 23~119행 중 리포팅에 필요한 것만 가져온다. `recordAnalyticsEvent`(74~86)와 `cleanupExpiredAnalyticsEvents`(121~131)는 **가져오지 않는다.** 그 둘은 web에 남는다.

```ts
import "server-only";

import {
  ANALYTICS_EVENT_NAMES,
  ANALYTICS_FUNNELS,
  db,
  type AnalyticsDateRangeInput,
  type AnalyticsDateRangeKey,
  type DropOffReportRow,
  type FunnelReportInput,
  type FunnelStepReport,
  type RecentFailureEventRow,
} from "@repo/db";

import {
  buildDropOffReportFromEvents,
  buildFunnelReportFromEvents,
  buildOverviewFromEvents,
  buildRecentFailureEventsFromEvents,
} from "./reporting";

const RANGE_DAYS = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
} as const satisfies Record<AnalyticsDateRangeKey, number>;

const FAILURE_EVENT_NAMES = [
  "upload_prepare_failed",
  "upload_s3_failed",
  "upload_confirmation_failed",
  "processing_schedule_failed",
] as const;

type AnalyticsReportEvent = {
  name: string;
  anonymousId: string;
  sessionId: string;
  path: string;
  userId: string | null;
  createdAt: Date;
};

function getRangeStart(range: AnalyticsDateRangeKey) {
  return new Date(Date.now() - RANGE_DAYS[range] * 24 * 60 * 60 * 1000);
}

async function listRangeEvents(
  input: AnalyticsDateRangeInput,
  names?: readonly string[],
): Promise<AnalyticsReportEvent[]> {
  return db.analyticsEvent.findMany({
    where: {
      createdAt: {
        gte: getRangeStart(input.range),
      },
      ...(names ? { name: { in: [...names] } } : {}),
    },
    select: {
      name: true,
      anonymousId: true,
      sessionId: true,
      path: true,
      userId: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });
}

export async function getAnalyticsOverview(input: AnalyticsDateRangeInput) {
  const events = await listRangeEvents(input, ANALYTICS_EVENT_NAMES);
  return buildOverviewFromEvents(events);
}

export async function getFunnelReport(
  input: FunnelReportInput,
): Promise<FunnelStepReport[]> {
  const steps = ANALYTICS_FUNNELS[input.funnel];
  const events = await listRangeEvents(input, steps);

  return buildFunnelReportFromEvents(events, steps) as FunnelStepReport[];
}

export async function getDropOffReport(
  input: AnalyticsDateRangeInput,
): Promise<DropOffReportRow[]> {
  const events = await listRangeEvents(input, ANALYTICS_EVENT_NAMES);

  return buildDropOffReportFromEvents(events).slice(0, 25) as DropOffReportRow[];
}

export async function getRecentFailureEvents(
  input: AnalyticsDateRangeInput,
): Promise<RecentFailureEventRow[]> {
  const events = await listRangeEvents(input, FAILURE_EVENT_NAMES);

  return buildRecentFailureEventsFromEvents(events, FAILURE_EVENT_NAMES).slice(
    0,
    25,
  ) as RecentFailureEventRow[];
}
```

- [ ] **Step 4: 타입 체크**

```bash
npm run typecheck -w apps/admin
```

Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add apps/admin/src/analytics
git commit -m "feat: move analytics reporting queries into admin app"
```

---

## Task 5: 관측 코드 이동

**Files:**
- Copy: `apps/web/src/fsd/shared/observability/report-error.ts` → `apps/admin/src/observability/report-error.ts`
- Copy: `apps/web/src/fsd/shared/observability/index.ts` → `apps/admin/src/observability/index.ts`
- Copy: `apps/web/src/fsd/shared/api/result.ts` → `apps/admin/src/lib/result.ts`
- Create: `apps/admin/src/observability/test-action.ts`
- Create: `apps/admin/src/instrumentation.ts`, `apps/admin/src/sentry.server.config.ts`

**Interfaces:**
- Consumes: `requireAdmin()` (Task 2)
- Produces:
  - `sendObservabilityTestEvent(): Promise<ActionResult<void>>` — 서버 액션
  - `type ActionResult<T>`, `success()`, `failure()`

- [ ] **Step 1: 파일 3개 복사**

```bash
mkdir -p apps/admin/src/observability apps/admin/src/lib
cp apps/web/src/fsd/shared/observability/report-error.ts apps/admin/src/observability/report-error.ts
cp apps/web/src/fsd/shared/observability/index.ts apps/admin/src/observability/index.ts
cp apps/web/src/fsd/shared/api/result.ts apps/admin/src/lib/result.ts
```

- [ ] **Step 2: `sentry.server.config.ts` 작성**

web에서 복사하지 **않는다.** web 버전은 `env.PROCESS_VIDEO_ENDPOINT`를 읽는데 admin에는 그 변수가 없다.

`apps/admin/src/sentry.server.config.ts`:

```ts
import * as Sentry from "@sentry/nextjs";

import { env } from "~/env";

// web과 같은 Sentry 프로젝트로 보내고 태그로 구분한다.
// 스크럽 규칙(X-Amz-*, PROCESS_VIDEO_ENDPOINT 호스트)은 두지 않는다.
// admin은 presigned URL을 만들지 않고 Modal을 호출하지 않으므로
// 스크럽 대상이 없다.
Sentry.init({
  dsn: env.SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? "development",
  initialScope: { tags: { app: "admin" } },
  sendDefaultPii: false,
  tracesSampleRate: 0,
});
```

- [ ] **Step 3: `instrumentation.ts` 작성**

`apps/admin/src/instrumentation.ts`:

```ts
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
```

- [ ] **Step 4: `test-action.ts` 작성**

web의 `features/observability-test/api/index.ts`를 옮기되 임포트 경로를 admin 구조에 맞춘다. **로직과 주석은 그대로 유지한다.**

`apps/admin/src/observability/test-action.ts`:

```ts
"use server";

import { requireAdmin } from "~/auth/guard";
import { type ActionResult, failure, success } from "~/lib/result";
import {
  flushReports,
  reportPipelineFailure,
  setReportUser,
  withIsolatedReportScope,
} from "./index";

/**
 * DSN·네트워크·flush·environment 태그가 전부 통하는지
 * 실제 실패를 기다리지 않고 확인하는 용도.
 *
 * ⚠️ 반환 타입이 모든 결과를 담지 않는다. 비관리자 호출은 `requireAdmin()`이
 * `redirect()`/`notFound()`를 던지므로 이 함수는 **resolve하지 않고 reject**한다
 * (Next 제어 흐름 예외). `ActionResult`는 **인가를 통과한 뒤**의 성공/실패만 표현한다.
 * requireAdmin을 try 밖에 두는 건 의도적이다 — 안에 넣으면 catch가
 * NEXT_REDIRECT를 삼켜 리다이렉트가 깨진다.
 *
 * setReportUser는 isolation scope에 쓰므로 warm 인스턴스에서 관리자 태그가
 * 이후 요청에 남지 않도록 withIsolatedReportScope 안에서만 호출한다.
 */
export async function sendObservabilityTestEvent(): Promise<ActionResult<void>> {
  // 목적지 인가. 레이아웃 가드에 기대지 않는다.
  const admin = await requireAdmin();

  return withIsolatedReportScope(async () => {
    try {
      setReportUser(admin.userId);

      reportPipelineFailure({
        kind: "stuck-processing",
        uploadedFileId: "observability-test",
        processingStartedAt: new Date().toISOString(),
        elapsedMinutes: 0,
      });

      await flushReports();

      return success();
    } catch (error) {
      console.error("Failed to send observability test event", error);
      return failure("Failed to send test event");
    }
  });
}
```

- [ ] **Step 5: 타입 체크**

```bash
npm run typecheck -w apps/admin
```

Expected: 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add apps/admin/src/observability apps/admin/src/lib/result.ts apps/admin/src/instrumentation.ts apps/admin/src/sentry.server.config.ts
git commit -m "feat: move observability helpers and test action into admin app"
```

---

## Task 6: UI atom 복사

**Files:**
- Create: `apps/admin/src/lib/utils.ts`
- Create: `apps/admin/src/ui/atoms/{button,card,table,badge,sonner}.tsx`

**Interfaces:**
- Consumes: 없음
- Produces: `cn(...)`, `Button`, `Card` 계열, `Table` 계열, `Badge`, `Toaster`

- [ ] **Step 1: `cn`만 담은 `utils.ts` 작성**

web의 `shared/lib/utils.ts`에는 `parseJsonArray`도 있지만 admin은 쓰지 않는다.

`apps/admin/src/lib/utils.ts`:

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 2: atom 5개 복사**

```bash
mkdir -p apps/admin/src/ui/atoms
for f in button card table badge sonner; do
  cp "apps/web/src/fsd/shared/ui/atoms/$f.tsx" "apps/admin/src/ui/atoms/$f.tsx"
done
```

- [ ] **Step 3: `cn` 임포트 경로 수정**

복사된 4개 파일이 `~/fsd/shared/lib/utils`를 임포트한다. admin에는 그 경로가 없다.

```bash
for f in button card table badge; do
  sed -i 's|from "~/fsd/shared/lib/utils"|from "~/lib/utils"|g' "apps/admin/src/ui/atoms/$f.tsx"
done
```

- [ ] **Step 4: 수정 확인**

```bash
grep -rn "fsd/shared" apps/admin/src/ui/atoms/ || echo "잔여 0건"
```

Expected: `잔여 0건`

- [ ] **Step 5: `sonner.tsx`에서 `next-themes` 제거**

web에도 `ThemeProvider`가 없어 `useTheme()`이 항상 기본값을 반환한다. admin은 의존성 자체를 넣지 않았으므로 제거해야 빌드된다.

`apps/admin/src/ui/atoms/sonner.tsx`를 아래로 전체 교체한다.

```tsx
"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

// web에도 ThemeProvider가 없어 useTheme()이 항상 "system"을 반환한다.
// admin은 next-themes 의존성을 넣지 않으므로 그 값을 그대로 고정한다.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="system"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
```

`icons` 블록과 `--border-radius`를 빠뜨리면 토스트 아이콘과 모서리가 web과 달라진다. 원본에서 **`useTheme` 임포트와 호출만** 빼고 나머지는 그대로다.

- [ ] **Step 6: `next-themes`가 남아 있지 않은지 확인**

```bash
grep -rn "next-themes" apps/admin/ --include=*.tsx --include=*.ts --include=*.json || echo "잔여 0건"
```

Expected: `잔여 0건`

- [ ] **Step 7: 타입 체크**

```bash
npm run typecheck -w apps/admin
```

Expected: 에러 없음

- [ ] **Step 8: 커밋**

```bash
git add apps/admin/src/ui apps/admin/src/lib/utils.ts
git commit -m "feat: copy required UI atoms into admin app without next-themes"
```

---

## Task 7: 화면 컴포넌트 이동

**Files:**
- Copy: `apps/web/src/fsd/pages/admin-analytics/ui/index.tsx` → `apps/admin/src/ui/analytics-page.tsx`
- Copy: `apps/web/src/fsd/pages/admin-analytics/lib/format-rate.ts` → `apps/admin/src/ui/format-rate.ts`
- Copy: `apps/web/src/fsd/pages/admin-analytics/model/types.ts` → `apps/admin/src/ui/types.ts`
- Copy: `apps/web/src/fsd/pages/admin-observability/ui/index.tsx` → `apps/admin/src/ui/observability-panel.tsx`

**Interfaces:**
- Consumes: Task 6의 atom, Task 4의 타입, Task 5의 `sendObservabilityTestEvent`
- Produces:
  - `AdminAnalyticsPage` — props는 `AdminAnalyticsPageProps`
  - `ObservabilityTestPanel`

- [ ] **Step 1: 파일 4개 복사**

```bash
cp apps/web/src/fsd/pages/admin-analytics/ui/index.tsx apps/admin/src/ui/analytics-page.tsx
cp apps/web/src/fsd/pages/admin-analytics/lib/format-rate.ts apps/admin/src/ui/format-rate.ts
cp apps/web/src/fsd/pages/admin-analytics/model/types.ts apps/admin/src/ui/types.ts
cp apps/web/src/fsd/pages/admin-observability/ui/index.tsx apps/admin/src/ui/observability-panel.tsx
```

- [ ] **Step 2: `analytics-page.tsx` 임포트 수정**

원본 상단 임포트를 아래로 교체한다. 원본 2·3~6행(`funnels`, `model/types`)이 `@repo/db`로, 7~23행(atoms)이 `~/ui/atoms/*`로, 24~25행(상대 경로)이 유지된다.

```tsx
import Link from "next/link";

import {
  FUNNEL_LABELS,
  type AnalyticsDateRangeKey,
  type FunnelId,
} from "@repo/db";

import { Badge } from "~/ui/atoms/badge";
import { Button } from "~/ui/atoms/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/ui/atoms/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/ui/atoms/table";

import { formatRate } from "./format-rate";
import type { AdminAnalyticsPageProps } from "./types";
```

위 `Card`/`Table` 하위 컴포넌트 목록은 원본 `pages/admin-analytics/ui/index.tsx:9-23`과 대조해 확인한 값이다. 그대로 쓰면 된다.

- [ ] **Step 3: 링크 경로에서 `/admin` prefix 제거**

`analytics-page.tsx` 안의 `href`가 `/admin/analytics?...` 형태라면 `/analytics?...`로 바꾼다. 서브도메인이 이미 admin을 뜻한다.

```bash
grep -n "/admin" apps/admin/src/ui/analytics-page.tsx
```

찾은 곳을 전부 수정한다.

- [ ] **Step 4: `types.ts` 임포트 수정**

`apps/admin/src/ui/types.ts`의 `~/fsd/entities/analytics-event/model/types` 임포트를 `@repo/db`로 바꾼다.

```ts
import type {
  AnalyticsDateRangeKey,
  AnalyticsOverview,
  DropOffReportRow,
  FunnelId,
  FunnelStepReport,
  RecentFailureEventRow,
} from "@repo/db";
```

- [ ] **Step 5: `observability-panel.tsx` 임포트 수정**

```tsx
import { sendObservabilityTestEvent } from "~/observability/test-action";
import { Button } from "~/ui/atoms/button";
```

- [ ] **Step 6: 잔여 FSD 경로 확인**

```bash
grep -rn "~/fsd" apps/admin/src/ || echo "잔여 0건"
```

Expected: `잔여 0건`

- [ ] **Step 7: 타입 체크**

```bash
npm run typecheck -w apps/admin
```

Expected: 에러 없음

- [ ] **Step 8: 커밋**

```bash
git add apps/admin/src/ui
git commit -m "feat: move admin screens into admin app"
```

---

## Task 8: 라우트와 로그인 페이지

**Files:**
- Create: `apps/admin/src/app/layout.tsx`, `page.tsx`, `robots.ts`
- Create: `apps/admin/src/app/login/page.tsx`
- Create: `apps/admin/src/app/analytics/page.tsx`
- Create: `apps/admin/src/app/observability/page.tsx`

**Interfaces:**
- Consumes: Task 2의 `requireAdmin`, Task 4의 쿼리 4개, Task 7의 화면
- Produces: 라우트 4개 (`/`, `/login`, `/analytics`, `/observability`)

- [ ] **Step 1: `layout.tsx` 작성**

web의 `app/admin/layout.tsx`를 기반으로 하되, `requireAdmin()` 호출을 **뺀다.** 이 레이아웃은 `/login`도 감싸므로 여기서 인가를 강제하면 로그인 페이지가 열리지 않는다. 인가는 각 페이지가 한다.

```tsx
import type { Metadata } from "next";

import "~/styles/globals.css";
import { Toaster } from "~/ui/atoms/sonner";

export const metadata: Metadata = {
  title: "ApcH Admin",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
```

- [ ] **Step 2: 인증된 화면용 헤더를 페이지 쪽으로 옮긴다**

`apps/admin/src/ui/admin-header.tsx` 생성. web `app/admin/layout.tsx`의 헤더 부분이다.

```tsx
export function AdminHeader({ email }: { email: string }) {
  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <div>
          <p className="text-sm text-muted-foreground">Admin</p>
          <p className="font-medium">{email}</p>
        </div>
      </div>
    </header>
  );
}
```

web 버전에 있던 "Dashboard로 가는 Button"은 뺀다. 별도 도메인이라 상대 경로 `/dashboard`가 admin 자신을 가리켜 404가 된다. 필요하면 `https://a-pch.com/dashboard` 절대 URL로 넣는다.

- [ ] **Step 3: `page.tsx` 작성 (루트 리다이렉트)**

```tsx
import { redirect } from "next/navigation";

export default function AdminRootPage() {
  redirect("/analytics");
}
```

- [ ] **Step 4: `robots.ts` 작성**

```ts
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
```

- [ ] **Step 5: 로그인 페이지 작성**

`apps/admin/src/app/login/page.tsx`:

```tsx
import type { Metadata } from "next";

import { LoginButton } from "~/ui/login-button";

export const metadata: Metadata = {
  title: "Admin Login",
  robots: { index: false, follow: false },
};

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div>
          <h1 className="text-2xl font-semibold">ApcH Admin</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            관리자 계정으로 로그인하세요.
          </p>
        </div>

        {error === "AccessDenied" && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            이 계정은 관리자 목록에 없습니다.
          </p>
        )}

        <LoginButton />
      </div>
    </main>
  );
}
```

- [ ] **Step 6: 로그인 버튼(클라이언트 컴포넌트) 작성**

`apps/admin/src/ui/login-button.tsx`:

```tsx
"use client";

import { signIn } from "next-auth/react";

import { Button } from "~/ui/atoms/button";

export function LoginButton() {
  return (
    <Button
      className="w-full"
      onClick={() => void signIn("google", { callbackUrl: "/analytics" })}
    >
      Continue with Google
    </Button>
  );
}
```

- [ ] **Step 7: `analytics/page.tsx` 작성**

web의 `app/admin/analytics/page.tsx`를 기반으로 임포트만 바꾸고 헤더를 붙인다.

```tsx
import type { Metadata } from "next";

import type { AnalyticsDateRangeKey, FunnelId } from "@repo/db";

import { requireAdmin } from "~/auth/guard";
import {
  getAnalyticsOverview,
  getDropOffReport,
  getFunnelReport,
  getRecentFailureEvents,
} from "~/analytics/queries";
import { AdminHeader } from "~/ui/admin-header";
import { AdminAnalyticsPage } from "~/ui/analytics-page";

const VALID_RANGES = new Set<AnalyticsDateRangeKey>(["7d", "30d", "90d"]);
const VALID_FUNNELS = new Set<FunnelId>([
  "acquisition",
  "activation",
  "billing",
  "review",
]);

type AdminAnalyticsRouteProps = {
  searchParams: Promise<{
    range?: string;
    funnel?: string;
  }>;
};

export const metadata: Metadata = {
  title: "Admin Analytics",
  robots: { index: false, follow: false },
};

function parseRange(value: string | undefined): AnalyticsDateRangeKey {
  return value && VALID_RANGES.has(value as AnalyticsDateRangeKey)
    ? (value as AnalyticsDateRangeKey)
    : "30d";
}

function parseFunnel(value: string | undefined): FunnelId {
  return value && VALID_FUNNELS.has(value as FunnelId)
    ? (value as FunnelId)
    : "activation";
}

export default async function AdminAnalyticsRoute({
  searchParams,
}: AdminAnalyticsRouteProps) {
  const admin = await requireAdmin();

  const params = await searchParams;
  const range = parseRange(params.range);
  const funnel = parseFunnel(params.funnel);

  const [overview, funnelReport, dropOffReport, recentFailureEvents] =
    await Promise.all([
      getAnalyticsOverview({ range }),
      getFunnelReport({ range, funnel }),
      getDropOffReport({ range }),
      getRecentFailureEvents({ range }),
    ]);

  return (
    <>
      <AdminHeader email={admin.email} />
      <main>
        <AdminAnalyticsPage
          range={range}
          funnel={funnel}
          overview={overview}
          funnelReport={funnelReport}
          dropOffReport={dropOffReport}
          recentFailureEvents={recentFailureEvents}
        />
      </main>
    </>
  );
}
```

- [ ] **Step 8: `observability/page.tsx` 작성**

```tsx
import type { Metadata } from "next";

import { requireAdmin } from "~/auth/guard";
import { AdminHeader } from "~/ui/admin-header";
import { ObservabilityTestPanel } from "~/ui/observability-panel";

export const metadata: Metadata = {
  title: "Admin Observability",
  robots: { index: false, follow: false },
};

export default async function AdminObservabilityRoute() {
  const admin = await requireAdmin();

  return (
    <>
      <AdminHeader email={admin.email} />
      <main>
        <ObservabilityTestPanel />
      </main>
    </>
  );
}
```

- [ ] **Step 9: 타입 체크**

```bash
npm run typecheck -w apps/admin
```

Expected: 에러 없음

- [ ] **Step 10: 커밋**

```bash
git add apps/admin/src/app apps/admin/src/ui
git commit -m "feat: add admin routes with login page and analytics dashboard"
```

---

## Task 9: `next.config.js`와 빌드

**Files:**
- Create: `apps/admin/next.config.js`

**Interfaces:**
- Consumes: Task 1의 `src/env.js`
- Produces: 빌드 가능한 admin 앱

- [ ] **Step 1: `next.config.js` 작성**

web에서 복사하되 CSP를 줄이고 트레이싱을 넣는다.

```js
// 루트 .env 유일본을 읽는다. env.js 검증보다 먼저 실행되어야 한다.
import { config as loadEnv } from "dotenv";
loadEnv({ path: "../../.env" });

import "./src/env.js";

import path from "node:path";
import { fileURLToPath } from "node:url";
import { withSentryConfig } from "@sentry/nextjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import("next").NextConfig} */
const config = {
  // Prisma 엔진이 packages/db/generated/prisma/ 에 있어 앱 Root Directory
  // 바깥이다. 트레이싱 루트를 저장소 루트로 올리지 않으면 엔진이 함수 번들에
  // 들어가지 않고, 빌드는 성공한 뒤 첫 DB 접근에서 500이 난다.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  transpilePackages: ["@repo/db"],
  serverExternalPackages: ["@prisma/adapter-neon"],
  async headers() {
    if (process.env.NODE_ENV === "development") return [];
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), browsing-topics=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data:",
              // Neon만 남긴다. S3·Polar·Inngest는 admin이 쓰지 않는다.
              "connect-src 'self' https://*.neon.tech",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self' https://accounts.google.com",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(config, {
  authToken: process.env.SENTRY_AUTH_TOKEN,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  silent: true,
  // web과 같은 Sentry 프로젝트를 쓰므로 릴리스가 겹친다.
  // dist로 갈라 소스맵 매핑이 엉키지 않게 한다.
  dist: "admin",
});
```

`form-action`에 `https://accounts.google.com`을 넣은 것에 주의한다. OAuth 리다이렉트가 막히지 않게 하기 위해서다.

- [ ] **Step 2: 빌드**

```bash
npm run build -w apps/admin
```

Expected: 성공. 실패하면 누락된 의존성이 로그에 뜬다. Task 1 Step 1의 목록에 추가하고 재설치한다.

- [ ] **Step 3: 전체 게이트**

```bash
npm run check --workspaces
npm test --workspaces
```

Expected: 전부 PASS

- [ ] **Step 4: 커밋**

```bash
git add apps/admin/next.config.js
git commit -m "feat: configure admin next build with tracing and reduced CSP"
```

---

## Task 10: 로컬 동작 검증

**코드 변경이 없는 수동 Task다.**

**Files:** 없음

**Interfaces:**
- Consumes: Task 1~9 전체
- Produces: 배포 전 동작 증거

- [ ] **Step 1: `ADMIN_EMAILS`가 루트 `.env`에 있는지 확인**

```bash
grep "ADMIN_EMAILS" .env
```

없으면 추가한다. 본인 Google 계정 이메일을 넣는다.

- [ ] **Step 2: admin 개발 서버 기동**

```bash
npm run dev:admin
```

`http://localhost:3001`에서 서빙된다.

- [ ] **Step 3: 확인 a — 미인증으로 `/analytics` 접근**

브라우저에서 `http://localhost:3001/analytics` 접속.

Expected: `/login`으로 **1회** 리다이렉트된다.

- [ ] **Step 4: 확인 b — `/login`에서 루프가 없는지**

`http://localhost:3001/login` 직접 접속.

Expected: 로그인 페이지가 렌더된다. 브라우저가 "리디렉션이 너무 많습니다"를 띄우면 `config.edge.ts`의 `authorized`가 `AUTH_ROUTES`를 처리하지 않는 것이다(Task 2 Step 1).

- [ ] **Step 5: 확인 c — 관리자 계정 로그인**

"Continue with Google"을 누르고 `ADMIN_EMAILS`에 등재된 계정으로 로그인한다.

Expected: `/analytics`로 이동하고 대시보드가 렌더된다. 헤더에 이메일이 보인다.

로컬 Google OAuth가 `http://localhost:3001/api/auth/callback/google`을 리다이렉트 URI로 요구한다. Google Console에 이 주소를 임시로 추가해야 한다.

- [ ] **Step 6: 확인 d — 미등재 계정 거부**

로그아웃 후 `ADMIN_EMAILS`에 없는 다른 Google 계정으로 시도한다.

Expected: `/login?error=AccessDenied`로 돌아오고 "이 계정은 관리자 목록에 없습니다." 문구가 보인다.

- [ ] **Step 7: 확인 e — 로그인 상태로 `/login` 방문**

로그인한 상태에서 `http://localhost:3001/login` 접속.

Expected: `/analytics`로 리다이렉트된다.

- [ ] **Step 8: 확인 f — 세션 만료가 8시간인지**

브라우저 개발자도구 → Application → Cookies → `localhost:3001` → `authjs.session-token`의 Expires 값을 본다.

Expected: 현재 시각 + 약 8시간

- [ ] **Step 9: 확인 g — 쿼리 파라미터 전환**

`/analytics?range=7d&funnel=review`로 이동해 값이 반영되는지 본다.

- [ ] **Step 10: 확인 h — 관측 패널**

`/observability`에서 테스트 이벤트를 보낸다.

Expected: 성공 토스트. Sentry 대시보드에 `app: admin` 태그가 붙은 이벤트가 도착한다.

- [ ] **Step 11: 확인 i — web 세션이 영향받지 않았는지**

다른 탭에서 `http://localhost:3000`(web)을 열고 로그인 상태가 유지되는지 본다.

Expected: 유지됨. admin 로그인이 web 쿠키를 건드리지 않았다는 확인이다.

---

## Task 11: Vercel 배포

**코드 변경이 없는 수동 Task다.**

**Files:** 없음

**Interfaces:**
- Consumes: Task 10의 검증 결과
- Produces: `admin.a-pch.com` 서빙

- [ ] **Step 1: 도메인 상태 확인**

Vercel 대시보드 → Account/Team → Domains에서 `a-pch.com`을 찾는다.

- nameserver가 `ns1.vercel-dns.com` / `ns2.vercel-dns.com`인가
- web 프로젝트에 연결되어 있는가

**둘 다 아니면 여기서 멈춘다.** 외부 레지스트라 관리 상태면 서브도메인 추가에 DNS 레코드 작업이 별도로 필요하다.

- [ ] **Step 2: Google Console에 프로덕션 redirect URI 추가**

Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 클라이언트 → 승인된 리디렉션 URI에 추가한다.

```
https://admin.a-pch.com/api/auth/callback/google
```

Task 10 Step 5에서 추가한 `http://localhost:3001/...`은 남겨둬도 된다.

- [ ] **Step 3: Vercel admin 프로젝트 생성**

- Add New → Project → 같은 저장소
- 프로젝트 이름: `apch-admin`
- **Root Directory: `apps/admin`**
- Install/Build Command: 기본값. 선행 계획서 Task 10에서 명시로 바꿨다면 같은 값을 쓴다

- [ ] **Step 4: 환경변수 주입**

`apps/admin/src/env.js`의 목록과 정확히 일치시킨다.

```
DATABASE_URL
DATABASE_URL_UNPOOLED
AUTH_SECRET            (web과 동일 값)
AUTH_URL               https://admin.a-pch.com
AUTH_GOOGLE_ID         (web과 동일 값)
AUTH_GOOGLE_SECRET     (web과 동일 값)
ADMIN_EMAILS           (web과 동일 값)
SENTRY_DSN             (web과 동일 값)
SENTRY_AUTH_TOKEN      (web과 동일 값)
SENTRY_ORG             (web과 동일 값)
SENTRY_PROJECT         (web과 동일 값)
```

`AUTH_SECRET`을 web과 같게 하는 것은 쿠키 공유 때문이 아니다. 도메인이 달라 쿠키는 공유되지 않는다. 시크릿 관리를 단순하게 두는 것뿐이며, 달라도 동작한다.

- [ ] **Step 5: 금지 변수가 없는지 확인**

환경변수 목록을 훑어 아래가 **하나도 없어야** 한다.

```
AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION / S3_BUCKET_NAME
PROCESS_VIDEO_ENDPOINT / PROCESS_VIDEO_ENDPOINT_AUTH
POLAR_ACCESS_TOKEN / POLAR_WEBHOOK_SECRET_* / POLAR_SERVER
INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY
CLOUDFRONT_*
MODAL_WEBHOOK_SECRET
NEXT_PUBLIC_*
```

하나라도 있으면 지운다. 이 분리의 목적 중 하나가 시크릿 노출면 축소다.

- [ ] **Step 6: 도메인 연결**

프로젝트 Settings → Domains → Add → `admin.a-pch.com`

DNS 레코드와 TLS 인증서는 Vercel이 자동 처리한다.

- [ ] **Step 7: 배포 후 확인**

Task 10의 확인 a~i를 프로덕션 도메인에서 반복한다. 추가로 아래를 본다.

- [ ] 빌드 로그에 `prisma generate` 출력이 있는가
- [ ] `/analytics`가 200이고 실제 수치가 나오는가 (엔진 트레이싱 성공)
- [ ] `https://admin.a-pch.com/robots.txt`가 `Disallow: /`를 반환하는가
- [ ] Sentry에 도착한 이벤트에 `app: admin` 태그가 있는가

**`/analytics`가 500이면** 엔진 트레이싱 실패다. 선행 계획서 Task 10 Step 5의 대응(웹팩 플러그인)을 admin에도 적용한다.

- [ ] **Step 8: web 세션 무영향 확인**

`https://a-pch.com`에 로그인된 상태가 유지되는지 확인한다.

---

## Task 12: web에서 어드민 잔재 제거

**admin이 프로덕션에서 확인된 뒤에만 실행한다.**

**Files:**
- Modify: `apps/web/src/middleware.ts`, `src/server/auth/config.edge.ts`, `src/env.js`
- Modify: `apps/web/src/fsd/entities/analytics-event/api/index.ts`
- Delete: `apps/web/src/app/admin/`, `src/fsd/pages/admin-analytics/`, `src/fsd/pages/admin-observability/`, `src/fsd/features/observability-test/`, `src/fsd/shared/api/admin-guard.ts`, `src/fsd/entities/analytics-event/model/reporting.ts`, `reporting.test.mjs`

**Interfaces:**
- Consumes: Task 11의 프로덕션 확인
- Produces: web에 어드민 코드가 남지 않는다

- [ ] **Step 1: `middleware.ts`에서 `/admin` 제거**

`apps/web/src/middleware.ts:7`의 matcher를 바꾼다.

```ts
export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};
```

- [ ] **Step 2: `config.edge.ts`에서 `/admin` 제거**

`apps/web/src/server/auth/config.edge.ts:3`:

```ts
const PROTECTED_ROUTES = ["/dashboard"];
```

- [ ] **Step 3: 어드민 파일 삭제**

```bash
git rm -r apps/web/src/app/admin
git rm -r apps/web/src/fsd/pages/admin-analytics
git rm -r apps/web/src/fsd/pages/admin-observability
git rm -r apps/web/src/fsd/features/observability-test
git rm apps/web/src/fsd/shared/api/admin-guard.ts
git rm apps/web/src/fsd/entities/analytics-event/model/reporting.ts
git rm apps/web/src/fsd/entities/analytics-event/model/reporting.test.mjs
```

- [ ] **Step 4: `analytics-event/api/index.ts`에서 리포팅 함수 제거**

이 파일을 아래로 **전체 교체**한다. `recordAnalyticsEvent`와 `cleanupExpiredAnalyticsEvents`만 남는다.

```ts
import "server-only";

import { Prisma, db, type RecordAnalyticsEventInput } from "@repo/db";

export async function recordAnalyticsEvent(input: RecordAnalyticsEventInput) {
  await db.analyticsEvent.create({
    data: {
      name: input.name,
      anonymousId: input.anonymousId,
      sessionId: input.sessionId,
      path: input.path,
      referrer: input.referrer ?? null,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
      userId: input.userId ?? null,
    },
  });
}

export async function cleanupExpiredAnalyticsEvents(now = new Date()) {
  const expiresBefore = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  return db.analyticsEvent.deleteMany({
    where: {
      createdAt: {
        lt: expiresBefore,
      },
    },
  });
}
```

- [ ] **Step 5: `entities/analytics-event/index.ts`의 export 정리**

리포팅 4개를 지운다.

```ts
export {
  cleanupExpiredAnalyticsEvents,
  recordAnalyticsEvent,
} from "./api";
```

- [ ] **Step 6: `env.js`에서 `ADMIN_EMAILS` 제거**

`apps/web/src/env.js`의 `server` 블록과 `runtimeEnv` 블록에서 각각 한 줄씩 지운다.

- [ ] **Step 7: 잔재 확인**

```bash
grep -rn "admin" apps/web/src --include=*.ts --include=*.tsx -il || echo "잔여 0건"
```

`admin`이 들어간 파일이 남아 있으면 내용을 확인한다. 무관한 단어일 수 있다.

- [ ] **Step 8: 게이트**

```bash
npm run check --workspaces
npm test --workspaces
npm run build -w apps/web
```

Expected: 전부 PASS

- [ ] **Step 9: 커밋과 배포**

```bash
git add -A
git commit -m "chore: remove admin routes and reporting from web app"
git push
```

- [ ] **Step 10: 프로덕션 확인**

- [ ] `https://a-pch.com/admin/analytics` → **404**
- [ ] `https://a-pch.com/dashboard` → 200, 정상
- [ ] `https://admin.a-pch.com/analytics` → 200, 정상
- [ ] web에서 업로드를 한 번 돌리고 `AnalyticsEvent`에 새 행이 쌓이는지 확인

---

## Task 13: 계약 방어선 검증

`packages/db`를 만든 이유 전체가 이 검증 하나로 증명된다. **두 앱이 모두 존재하는 지금이 처음으로 실행 가능한 시점이다.**

설계 문서 §3 결정 3의 논거는 "analytics 계약을 복사하면 한쪽에서 이벤트 이름을 바꿔도 다른 쪽은 통과하고, 대시보드가 에러 없이 0을 보여준다"였다. 그 논거가 실제로 성립하는지 확인한다.

**Files:** 없음 (임시 수정 후 되돌린다)

**Interfaces:**
- Consumes: Plan1 Task 6의 `analytics-contract.ts`, Task 4·12의 양쪽 앱 사용처
- Produces: 계약 단일화가 실제로 컴파일 타임 보호를 제공한다는 증거

- [ ] **Step 1: 기준선 확인**

```bash
npm run check --workspaces
```

Expected: PASS. 여기서 실패하면 이 Task를 진행할 수 없다.

- [ ] **Step 2: 이벤트 이름 하나를 임시로 rename**

`packages/db/src/analytics-contract.ts`의 `ANALYTICS_EVENT_NAMES` 배열에서 한 줄을 바꾼다.

```diff
-  "clip_review_confirmed",
+  "clip_review_completed",
```

`clip_review_confirmed`를 고른 이유: `ANALYTICS_FUNNELS.review`의 2번째 단계이면서 web의 `clip-draft-review` 위젯이 값으로 쓰는 이름이다. 양쪽 앱이 동시에 걸린다.

- [ ] **Step 3: 양쪽 앱이 모두 실패하는지 확인**

```bash
npm run check --workspaces
```

Expected: **FAIL**. 아래 두 가지가 모두 나와야 한다.

| 위치 | 예상 에러 |
|---|---|
| `packages/db/src/analytics-contract.ts` | `ANALYTICS_FUNNELS`의 `satisfies Record<FunnelId, readonly AnalyticsEventName[]>`가 `"clip_review_confirmed"`를 더 이상 유효한 이름으로 보지 못함 |
| `apps/web/src/fsd/widgets/clip-draft-review/` | `trackAnalyticsEvent("clip_review_confirmed", ...)` 호출이 타입 불일치 |

- [ ] **Step 4: 결과를 판정**

- **양쪽 다 실패했다** → 방어선이 작동한다. Step 5로 간다.
- **한쪽만 실패했다** → 다른 쪽이 계약을 shim이 아니라 자체 복사본으로 보고 있다는 뜻이다. Plan1 Task 7의 shim(`event-catalog.ts`, `funnels.ts`, `types.ts`)이 실제로 `@repo/db`를 재수출하는지 확인한다.
- **아무데도 실패하지 않았다** → 계약이 어디에도 타입 제약으로 연결되어 있지 않다. `analytics-contract.ts`의 `satisfies` 절이 남아 있는지부터 확인한다.

- [ ] **Step 5: 되돌리고 통과 확인**

```bash
git checkout packages/db/src/analytics-contract.ts
npm run check --workspaces
```

Expected: PASS

- [ ] **Step 6: 결과를 설계 문서에 기록**

`docs/proposals/monorepo-admin-split-2026-08-01.md`의 §8 "계약 방어선 검증" 절 끝에 한 줄 추가한다.

```markdown
**검증 결과 (YYYY-MM-DD)**: `clip_review_confirmed` → `clip_review_completed` rename 시
`packages/db`와 `apps/web` 양쪽에서 컴파일 에러 발생을 확인했다. 성공 기준 6 충족.
```

이 Task는 커밋할 코드 변경이 없다. Step 6의 문서 수정만 Task 14에서 함께 커밋한다.

---

## Task 14: 문서 갱신

**Files:**
- Modify: `apps/web/CLAUDE.md`
- Modify: `README.md`, `README.ko.md`
- Modify: `docs/proposals/monorepo-admin-split-2026-08-01.md`

**Interfaces:** 없음

- [ ] **Step 1: `apps/web/CLAUDE.md` — Task 0에서 이미 처리함**

Task 0이 선행 갱신했다. 여기서는 그 이후 이 계획이 추가로 바꾼 것(어드민이 `apps/admin`으로 분리되었다는 사실)만 덧붙인다.

<details>
<summary>Task 0이 처리한 항목 (참고)</summary>

아래 항목을 고친다. 현재 문서가 낡아서 AI 에이전트가 틀린 전제로 작업하게 되어 있다.

| 현재 서술 | 실제 |
|---|---|
| "Prisma + SQLite" | Postgres (Neon) + `@prisma/adapter-neon` |
| "Credentials provider with bcrypt password hashing" | Google OAuth 전용 (Credentials는 2026-03-26 제거) |
| "Generated client in `generated/prisma/`" | `packages/db/generated/prisma/` |
| "Schema located in `prisma/schema.prisma`" | `packages/db/prisma/schema.prisma` |
| `~/*` → `./src/*` | 유지. 추가로 `@repo/db` 설명 필요 |

</details>

**이 Task에서 추가로 할 것**은 하나다.

| 항목 | 내용 |
|---|---|
| 어드민 관련 서술 | `apps/admin`으로 분리되었음을 명시. `/admin` 라우트가 web에 없다는 것 |

Development Commands 절에 `dev:admin`을 추가한다. Task 0 시점에는 `apps/admin`이 없어서 넣을 수 없었다.

```bash
npm run dev              # web (3000)
npm run dev:admin        # admin (3001)
npm run check --workspaces
npm test --workspaces
npm run db:push -w @repo/db
```

- [ ] **Step 2: 루트 README 2개에 모노레포 구조 추가**

`README.md`와 `README.ko.md`에 디렉터리 구조와 두 앱의 URL을 적는다.

- [ ] **Step 3: 설계 문서 Status 갱신**

`docs/proposals/monorepo-admin-split-2026-08-01.md`의 4행을 바꾼다.

```
Status: **Implemented** (2026-XX-XX) — 계획서: docs/plans/2026-08-01-monorepo-conversion.md, docs/plans/2026-08-01-admin-app-split.md
```

계획 대비 편차가 있었다면 문서 상단에 "구현 결과" 절을 추가해 기록한다. 이 저장소의 기존 proposal 문서들이 그 형식을 쓴다(`clip-review-ux-followup-2026-07-29.md` 참고).

- [ ] **Step 4: 커밋**

Task 13 Step 6의 검증 결과 기록도 함께 커밋한다.

```bash
git add -A
git commit -m "docs: update CLAUDE.md and READMEs for monorepo structure"
```

---

## 완료 조건

- [ ] `https://admin.a-pch.com/analytics`가 관리자 계정으로 200을 반환
- [ ] 미등재 계정이 `AccessDenied` 문구를 받음
- [ ] `/login`에서 리다이렉트 루프가 없음
- [ ] 세션 쿠키 만료가 약 8시간
- [ ] `https://a-pch.com/admin/*`가 404
- [ ] web 사용자 세션이 전 과정에서 유지됨
- [ ] `apps/admin` Vercel 환경변수에 AWS/Polar/Modal/Inngest 키가 하나도 없음
- [ ] Sentry에 `app: admin` 태그가 붙은 이벤트가 도착
- [ ] `npm run check --workspaces`, `npm test --workspaces` 통과
- [ ] `apps/admin`에 `next-themes` 의존성 없음
- [ ] 계약 방어선 검증 통과 (Task 13) — 이벤트 rename 시 양쪽 앱이 컴파일 에러

## 알려진 한계

- **web의 Sentry 전송 경로를 온디맨드로 검증할 수단이 없어진다.** 테스트 패널이 admin으로 옮겨가고, web에 남는 `reportPipelineFailure` 호출부는 `entities/processing-dispatch/api/index.ts:280`과 `inngest/functions.ts:1051` 두 곳뿐이며 둘 다 장애 시에만 발화한다. 진단이 필요해지면 `apps/web/src/app/api/internal/sentry-check/route.ts` 하나를 추가하면 된다. 설계 문서 §4.7과 Open Questions 후속 과제 참조.
- **`@prisma/adapter-neon ^7.5.0`과 `@prisma/client ^6.19.1`의 메이저 불일치**가 `packages/db`에 그대로 남는다. 이 계획이 만든 문제가 아니고 현재 동작 중이라 건드리지 않았다.
