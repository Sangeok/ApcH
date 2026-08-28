# FEAT-25: admin 검증기 인증 경로 — 비밀값 로그인으로 읽기 전용 verifier 세션 발급

agent: admin-dev

## 현재 동작

admin 로그인은 Google 단일 provider다. `config.ts:16`이 `providers: [Google]`이고, `config.edge.ts:6`은 Edge에서 `providers: []`이며 미들웨어(`middleware.ts:5` `NextAuth(authConfigEdge).auth`)는 JWT만 검증한다. 세션 전략은 JWT이고 전역 `maxAge`는 8시간이다(`config.edge.ts:7-11`).

인가는 세 겹이다.

- **로그인 거부**: `config.ts:21-24`의 `signIn` 콜백이 `user.email`을 소문자화해 `getAdminEmailSet()`(= `ADMIN_EMAILS` 파싱, `config.ts:10-12`·`parse-admin-emails.ts:1-8`)에 있을 때만 `true`를 돌려준다. 이메일이 없으면 `false`.
- **경로 보호**: `config.edge.ts:19-33`의 `authorized`가 `/login`을 뺀 전 경로를 로그인 상태로만 통과시킨다. 로그인 상태로 `/login`에 오면 `/analytics`로 302 리다이렉트한다(`config.edge.ts:25-28`) — verifier도 같다.
- **목적지 재검사**: `guard.ts:7-27`의 `requireAdmin()`이 세션 없으면 `redirect("/login")`(`guard.ts:10-12`), 이메일이 화이트리스트 밖이면 `notFound()`(`guard.ts:19-21`), 통과하면 `{ userId, email }`을 반환한다(`guard.ts:23-26`, `email`은 소문자 문자열).

세션 콜백은 `config.ts:25-28`에서 `token.sub`만 `session.user.id`로 옮긴다 — `role`이나 발급시각 같은 커스텀 클레임은 왕복시키지 않고, `jwt` 콜백은 아예 없다.

`requireAdmin()` 호출처는 코드에 정확히 11곳이다(테스트 제외). **읽기 7**: `app/(protected)/layout.tsx:11`, `analytics/page.tsx:49`, `observability/page.tsx:12`, `pipeline/page.tsx:18`, `pipeline/agents/[agent]/page.tsx:24`, `pipeline/docs/[...slug]/page.tsx:17`, `run-pipeline-command/api/get-pipeline-progress.ts:14`(GitHub 코멘트 읽기). **쓰기 4**: `post-pipeline-command.ts:27`(이슈 코멘트 POST), `commit-gate-transition.ts:98`(보드 PUT 승인), `commit-gate-transition.ts:121`(보드 PUT 반려), `send-observability-test-event.ts:27`(Sentry 전송 부수효과). 반환값을 쓰는 곳은 `admin.email`을 헤더에 넘기는 `layout.tsx:15`(`<AdminHeader email={admin.email} />`)와 `admin.userId`를 쓰는 `send-observability-test-event.ts:31`뿐이다. `AdminHeader`는 `email: string`을 받아 `{email}`을 렌더한다(`admin-header/ui/index.tsx:1,7`).

환경변수는 `env.js`에 정의되며 `ADMIN_EMAILS`는 production 필수(`env.js:30-33`), verifier용 비밀값 변수는 없다. Credentials provider의 전제인 JWT 세션 전략은 이미 충족돼 있고(`config.edge.ts:8`), `next-auth@5.0.0-beta.25`에 `next-auth/providers/credentials`가 존재한다.

경계 검사(`scripts/verify-fsd-boundaries.mjs`)는 `config.edge.ts`가 Node 모듈(`server-only`·`~/env`·google provider)을 import하면 R7로 막고(`:399-412`), `src/server/auth/index.ts`가 `config.edge`를 재수출하면 R11로 막으며(`:471-482`), production fetch owner를 정확히 4개로 강제한다(`:79-91`·`:498-504`·`:677-678`; 현재 owner는 pipeline queries·post-command·get-progress·commit-transition).

## 문제

배포 확인 원장(`docs/release-checks.md`)을 사람 지시 없이 닫는 FEAT-26 루틴이 프로덕션 admin을 열려면 **로봇이 통과할 수 있는 인증 경로**가 있어야 한다. 현재 admin은 Google OAuth 단일 provider라 로봇이 로그인할 수 없고, 소유자 프로필 쿠키는 클라우드 루틴 환경에 없다. 백로그 FEAT-25 `source`의 수정 방향 (1)(2)(3)이 계약이다: (1) `VERIFIER_SECRET`이 설정된 경우에만 활성되는 Credentials provider로 고정 신원 `verifier`의 JWT 세션을 발급(로그인 화면 비노출·POST 전용), (2) verifier는 페이지 렌더만 허용하고 쓰기 액션은 거부(비밀값이 새도 열람 이상 불가), (3) `ADMIN_EMAILS` 우회가 아니라 별도 신원이며 화이트리스트 로직은 그대로 유지. 세션 수명은 짧게(1h). 이 항목의 **공개 계약**은 로봇이 세션을 얻는 핸드셰이크(CSRF → callback POST → 세션 쿠키)이며 FEAT-26이 그것을 그대로 소비한다.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `src/server/auth/verifier.ts` `(신규)` | verifier 상수(provider id·role·1h 수명), timing-safe 비밀값 비교, authorize, 조건부 provider 빌더를 순수 모듈로 분리 |
| `src/server/auth/next-auth.d.ts` `(신규)` | `User`·`JWT` 인터페이스에 `role`·`verifierIssuedAt` 클레임 타입 증강 |
| `src/server/auth/config.ts` | Credentials provider 조건부 등록, `signIn` provider 분기, `jwt` 콜백 신설(클레임 심기), `session` 콜백 클레임 왕복 |
| `src/server/auth/guard.ts` | `requireAdmin`에 verifier 분기(읽기 허용·1h 만료 fail-closed)와 `{ write }` 옵션(verifier 쓰기 거부), 반환 `email: string \| null` |
| `src/env.js` | `VERIFIER_SECRET: z.string().optional()` 추가(server 스키마 + runtimeEnv) |
| `src/fsd/widgets/admin-header/ui/index.tsx` | `email` prop을 `string \| null`로 넓히고 verifier 표시명 폴백 |
| `src/fsd/features/run-pipeline-command/api/post-pipeline-command.ts` | `requireAdmin()` → `requireAdmin({ write: true })` (쓰기) |
| `src/fsd/features/transition-pipeline-gate/api/commit-gate-transition.ts` | `:98`·`:121` 두 곳 `requireAdmin()` → `requireAdmin({ write: true })` |
| `src/fsd/features/send-observability-test/api/send-observability-test-event.ts` | `requireAdmin()` → `requireAdmin({ write: true })` (Sentry 전송 부수효과) |
| `src/server/auth/verifier.test.mjs` `(신규)` | 비밀값 비교·authorize·provider 빌더 테스트 |
| `src/server/auth/config.test.mjs` | Google 회귀 유지 + verifier provider 등록·signIn 분기·jwt/session 클레임 왕복 |
| `src/server/auth/guard.test.mjs` | verifier 읽기 허용·쓰기 거부·1h 만료 + admin write 허용 |

`layout.tsx`는 고치지 않는다 — `admin.email`이 `string | null`이 되고 `AdminHeader`가 같은 타입을 받으므로 `:15`가 그대로 컴파일된다. `config.edge.ts`·`middleware.ts`·`scripts/verify-fsd-boundaries.mjs`도 고치지 않는다(사유는 「구현 스케치」 끝 참고).

## 구현 스케치

### 1) `src/server/auth/verifier.ts` (신규 · 전체)

```ts
import "server-only";

import { timingSafeEqual } from "node:crypto";
import Credentials from "next-auth/providers/credentials";

export const VERIFIER_PROVIDER_ID = "verifier";
export const VERIFIER_ROLE = "verifier";
// verifier 세션의 앱 내부 수명. 전역 쿠키 maxAge(8h)와 별개로 requireAdmin이 강제한다.
export const VERIFIER_MAX_AGE_MS = 60 * 60 * 1000;

// 길이 검사 후 timing-safe 비교. 길이가 다르면 timingSafeEqual이 throw하므로 먼저 거른다.
export function verifyVerifierSecret(
  expected: string | undefined,
  provided: unknown,
): boolean {
  if (typeof expected !== "string" || expected.length === 0) return false;
  if (typeof provided !== "string") return false;
  const expectedBuf = Buffer.from(expected, "utf-8");
  const providedBuf = Buffer.from(provided, "utf-8");
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

// 성공 시 고정 신원(이메일 아님). 실패 시 null(예외 아님 → NextAuth가 CredentialsSignin으로 처리).
export function authorizeVerifier(
  expected: string | undefined,
  provided: unknown,
): { id: string; role: string } | null {
  if (!verifyVerifierSecret(expected, provided)) return null;
  return { id: VERIFIER_PROVIDER_ID, role: VERIFIER_ROLE };
}

// 비밀값이 없으면 provider를 등록하지 않는다(기능 자체가 꺼진다).
export function buildVerifierProvider(secret: string | undefined) {
  if (typeof secret !== "string" || secret.length === 0) return null;
  return Credentials({
    id: VERIFIER_PROVIDER_ID,
    name: "verifier",
    credentials: { secret: { type: "password" } },
    authorize: (credentials) => authorizeVerifier(secret, credentials?.secret),
  });
}
```

`authorize`가 돌려주는 `{ id, role }`의 `id`가 NextAuth에서 `token.sub`가 되어 `session.user.id === "verifier"`가 된다.

### 2) `src/server/auth/next-auth.d.ts` (신규 · 전체)

빈 인터페이스 `User`·`JWT`를 증강한다(둘 다 next-auth가 증강용으로 비워 둔 인터페이스다 — `User extends DefaultUser {}`, `JWT extends Record<string, unknown>, DefaultJWT`). `export {};`로 이 파일을 모듈로 만들어야 `declare module`이 ambient 재선언이 아니라 증강이 된다.

```ts
export {};

declare module "next-auth" {
  interface User {
    role?: string;
    verifierIssuedAt?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    verifierIssuedAt?: number;
  }
}
```

### 3) `src/server/auth/config.ts`

**import 추가** — before(`config.ts:1-8`):

```ts
import "server-only";

import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

import { env } from "~/env";
import { authConfigEdge } from "./config.edge";
import { parseAdminEmails } from "./parse-admin-emails";
```

after:

```ts
import "server-only";

import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

import { env } from "~/env";
import { authConfigEdge } from "./config.edge";
import { parseAdminEmails } from "./parse-admin-emails";
import {
  buildVerifierProvider,
  VERIFIER_PROVIDER_ID,
  VERIFIER_ROLE,
} from "./verifier";
```

**config 블록** — before(`config.ts:14-30`):

```ts
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
```

after:

```ts
// VERIFIER_SECRET이 있을 때만 Credentials provider가 등록된다(미설정이면 null → 미등록).
const verifierProvider = buildVerifierProvider(env.VERIFIER_SECRET);

export const authConfig = {
  ...authConfigEdge,
  providers: verifierProvider ? [Google, verifierProvider] : [Google],
  callbacks: {
    ...authConfigEdge.callbacks,
    // 화이트리스트 밖 계정은 로그인 자체를 거부한다.
    // 세션이 만들어지지 않으므로 guard는 2차 방어선이 된다.
    // verifier는 이메일이 아니라 authorize가 이미 비밀값을 검증했으므로 통과시킨다.
    signIn: ({ user, account }) => {
      if (account?.provider === VERIFIER_PROVIDER_ID) return true;
      const email = user.email?.toLowerCase();
      return !!email && getAdminEmailSet().has(email);
    },
    // verifier 로그인 시에만 role·발급시각 클레임을 심는다.
    // account는 최초 로그인에만 있으므로(이후 요청엔 없음) 발급시각은 1회만 고정된다.
    jwt: ({ token, account }) => {
      if (account?.provider === VERIFIER_PROVIDER_ID) {
        token.role = VERIFIER_ROLE;
        token.verifierIssuedAt = Date.now();
      }
      return token;
    },
    session: ({ session, token }) => ({
      ...session,
      user: {
        ...session.user,
        id: token.sub,
        role: token.role,
        verifierIssuedAt: token.verifierIssuedAt,
      },
    }),
  },
} satisfies NextAuthConfig;
```

증강 덕분에 `token.role`은 `string | undefined`, `token.verifierIssuedAt`은 `number | undefined`로 좁혀져 `session.user`(= `User`)에 추가 속성 오류 없이 대입된다. Google 경로는 `account?.provider`가 `"google"`(또는 콜백 테스트처럼 미지정)이라 세 콜백 모두 화이트리스트 검사·무클레임으로 흘러 회귀가 없다.

### 4) `src/server/auth/guard.ts` (전체 교체)

before(`guard.ts:1-27`):

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

after:

```ts
import "server-only";

import { notFound, redirect } from "next/navigation";

import { auth, getAdminEmailSet } from "./index";
import { VERIFIER_MAX_AGE_MS, VERIFIER_ROLE } from "./verifier";

export async function requireAdmin(
  options: { write?: boolean } = {},
): Promise<{ userId: string; email: string | null }> {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  // verifier: 읽기 전용·1h 수명. 이메일이 없어 아래 화이트리스트 검사에 걸리면
  // 항상 404가 되므로, admin 분기보다 먼저 처리한다.
  if (session.user.role === VERIFIER_ROLE) {
    const issuedAt = session.user.verifierIssuedAt;
    if (
      typeof issuedAt !== "number" ||
      Date.now() - issuedAt > VERIFIER_MAX_AGE_MS
    ) {
      notFound(); // 만료·클레임 부재 → 존재를 드러내지 않는다(3층 관례)
    }
    if (options.write) {
      notFound(); // verifier는 쓰기 액션 불가(비밀값이 새도 열람 이상 불가)
    }
    return { userId: session.user.id, email: null };
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

### 5) `src/env.js`

**server 스키마** — before(`env.js:30-33`):

```js
    ADMIN_EMAILS:
      process.env.NODE_ENV === "production"
        ? z.string().min(1)
        : z.string().optional(),
```

after(바로 뒤에 추가):

```js
    ADMIN_EMAILS:
      process.env.NODE_ENV === "production"
        ? z.string().min(1)
        : z.string().optional(),
    // 검증기(FEAT-25) 로그인용 비밀값. 설정된 경우에만 Credentials provider가
    // 등록되고 고정 신원 `verifier`의 읽기 전용 세션을 발급한다. 미설정이면
    // 기능 자체가 꺼진다(provider 미등록). 로그인 화면엔 노출하지 않는다.
    VERIFIER_SECRET: z.string().optional(),
```

**runtimeEnv** — before(`env.js:59`):

```js
    ADMIN_EMAILS: process.env.ADMIN_EMAILS,
```

after:

```js
    ADMIN_EMAILS: process.env.ADMIN_EMAILS,
    VERIFIER_SECRET: process.env.VERIFIER_SECRET,
```

### 6) `src/fsd/widgets/admin-header/ui/index.tsx`

before(`admin-header/ui/index.tsx:1,7`):

```tsx
export function AdminHeader({ email }: { email: string }) {
```
```tsx
          <p className="font-medium">{email}</p>
```

after:

```tsx
export function AdminHeader({ email }: { email: string | null }) {
```
```tsx
          <p className="font-medium">{email ?? "검증기 (읽기 전용)"}</p>
```

사용자 노출 문구는 `검증기 (읽기 전용)`이다(verifier 세션일 때만 보인다).

### 7) 쓰기 액션 4곳 — `{ write: true }` 전달

`post-pipeline-command.ts:27` before/after:

```ts
  // 목적지 인가는 그대로 try 밖·최상단(NEXT_REDIRECT를 catch가 삼키지 않게).
  await requireAdmin();
```
```ts
  // 목적지 인가는 그대로 try 밖·최상단(NEXT_REDIRECT를 catch가 삼키지 않게).
  await requireAdmin({ write: true });
```

`commit-gate-transition.ts:98`(승인) before/after — 앞 줄 주석으로 `:121`과 구분:

```ts
  // 인가는 try 밖 최상단(NEXT_REDIRECT를 catch가 삼키지 않게, post-pipeline-command.ts와 동일).
  await requireAdmin();
```
```ts
  // 인가는 try 밖 최상단(NEXT_REDIRECT를 catch가 삼키지 않게, post-pipeline-command.ts와 동일).
  await requireAdmin({ write: true });
```

`commit-gate-transition.ts:121`(반려) before/after — 앞 두 줄 시그니처로 `:98`과 구분:

```ts
  expectedStatus: string,
): Promise<ActionResult<void>> {
  await requireAdmin();
```
```ts
  expectedStatus: string,
): Promise<ActionResult<void>> {
  await requireAdmin({ write: true });
```

`send-observability-test-event.ts:27` before/after:

```ts
  // 목적지 인가. 레이아웃 가드에 기대지 않는다.
  const admin = await requireAdmin();
```
```ts
  // 목적지 인가. 레이아웃 가드에 기대지 않는다.
  const admin = await requireAdmin({ write: true });
```

admin 신원은 `write: true`여도 통과하므로(옵션은 verifier 분기 안에서만 작동) 관리자 동작에 회귀가 없다. 읽기 7곳은 `requireAdmin()` 그대로 둔다.

### 공개 계약(FEAT-26이 소비) — CSRF 선행 핸드셰이크

로그인 화면은 커스텀 페이지(`config.edge.ts:13` `pages.signIn = "/login"`)라 NextAuth 기본 signin UI가 뜨지 않고, `src/app/login/page.tsx`는 건드리지 않는다. verifier 진입은 오직 POST다:

1. `GET /api/auth/csrf` → `{ csrfToken }` 수신 + CSRF 쿠키 설정(https 프로덕션에서는 `__Host-authjs.csrf-token`, 로컬 http에서는 `authjs.csrf-token`; double-submit).
2. `POST /api/auth/callback/verifier` — `Content-Type: application/x-www-form-urlencoded`, body `csrfToken=<토큰>&secret=<VERIFIER_SECRET>`, 1의 CSRF 쿠키 동봉. 성공 시 302 + 세션 쿠키 설정(https는 `__Secure-authjs.session-token`, http는 `authjs.session-token`).
3. 이후 protected 경로 GET에 세션 쿠키를 실으면 미들웨어 `authorized`가 통과(`config.edge.ts:19-33`, verifier도 로그인 상태) → 페이지 렌더. 쓰기 액션은 `requireAdmin({ write: true })`가 `notFound()`로 막는다.

provider id가 `verifier`이므로 callback 경로는 `/api/auth/callback/verifier`로 고정된다. 세션 쿠키 자체 수명은 전역 8h지만 verifier의 유효 열람은 1h(발급시각 클레임 기준)이며, 루틴은 매 실행마다 1~3을 새로 밟아 항상 1h 이내 토큰을 얻는다.

### 구현 후 handoff(읽기 전용 `apps/admin/CLAUDE.md` → 메인 루프 비고)

구현 단계 `결과:` 비고로 보고할 동기화(직접 편집 금지): 테스트 인벤토리(`CLAUDE.md:35-37`) 28→29 파일(+`verifier.test.mjs`)과 suite/test 수, 라우트 표 `/login`(`:12`)에 verifier POST 진입·비노출, 「인가: 세 겹 방어선」(`:96-106`)에 verifier 별도 신원·읽기 전용·1h·`requireAdmin` write 옵션, env 절(`:124`)에 `VERIFIER_SECRET` optional.

## 테스트

- **덮는 것**
  - `verifier.test.mjs` (신규): `verifyVerifierSecret`(expected `undefined`→false·빈 문자열→false·provided 비문자열→false·길이 불일치→false·정확 일치→true), `authorizeVerifier`(expected 부재→null·불일치→null·일치→`{ id: "verifier", role: "verifier" }`), `buildVerifierProvider`(secret `undefined`/빈 문자열→null·설정 시 `id === "verifier"`·`authorize`가 함수·`authorize({ secret: 정답 })`→신원·`authorize({ secret: 오답 })`→null·`authorize(undefined)`→null). `mock.module("server-only", { namedExports: {} })` 선행.
  - `config.test.mjs` (수정): 기존 Google 회귀 유지(`signIn({ user })` account 미지정 → 이메일 분기: allow/deny/missing). 추가 — provider 조건 등록(mock env에 `VERIFIER_SECRET` 설정 → `authConfig.providers` 길이 2·`id === "verifier"` 포함), `signIn` verifier 분기(`account.provider === "verifier"`·이메일 없음→true), `signIn` google account 화이트리스트 유지(`account.provider === "google"`·outsider→false), `jwt`(verifier account→`token.role === "verifier"`·`typeof token.verifierIssuedAt === "number"` / google account→무클레임 / account `null`→기존 토큰 무변경), `session`(token의 sub·role·verifierIssuedAt를 `session.user`로 왕복).
  - `guard.test.mjs` (수정): 기존 3건 유지(미인증 redirect·삭제된 admin notFound·정상 admin 신원). 추가 — verifier 읽기 허용(role=verifier·`verifierIssuedAt=Date.now()` → `{ userId: "verifier", email: null }`), verifier 쓰기 거부(`requireAdmin({ write: true })` → NOT_FOUND), verifier 1h 만료(`verifierIssuedAt = Date.now() - (VERIFIER_MAX_AGE_MS + 1000)` → NOT_FOUND), verifier 클레임 부재(`verifierIssuedAt` undefined → NOT_FOUND), admin 쓰기 허용(`requireAdmin({ write: true })`가 관리자 신원 반환 — write 옵션이 admin을 막지 않음). guard는 `./verifier`의 상수만 import하므로 `./verifier` mock은 불필요하고, 기존 `./index`·`next/navigation`·`server-only` mock으로 충분하다.

- **못 덮는 범위** (Node 러너·live I/O·DOM 없음 → 배포 후 수동/FEAT-26)
  - 실제 NextAuth 핸드셰이크(`GET /api/auth/csrf` → `POST /api/auth/callback/verifier` → 세션 쿠키): HTTP·서명된 JWT·쿠키 발급이라 module mock으로 못 덮는다. FEAT-26의 소비 경로에서 배포 후 실증.
  - `AdminHeader`의 `검증기 (읽기 전용)` 폴백 렌더: DOM 렌더라 Node 러너 밖. 수동 smoke.
  - `timingSafeEqual`의 상수시간 성질: 단위 테스트는 정오만 검증하고 타이밍은 측정하지 않는다.
  - 미들웨어 Edge가 실제 verifier JWT를 통과시키는지: Edge 런타임 실행이라 여기서 못 돈다(config.edge 테스트는 가짜 세션으로 `authorized` 로직만 덮는다).

## 범위 밖 의존

**구현을 막는 범위 밖 의존은 없다.** 코드 변경은 전부 `apps/admin/src/**`(App shell·`server/auth`·FSD·env)와 admin 테스트 안이며 `packages/db`·`apps/web`·`apps/backend`를 한 줄도 건드리지 않는다. `scripts/verify-fsd-boundaries.mjs`도 고치지 않는다 — 새 fetch/DB/Sentry owner도, public boundary 변경도 없기 때문이다(verifier는 네트워크 호출이 없어 fetch owner는 4개 그대로).

다음 둘은 **구현을 막지 않는** 외부 선행/후속이다(기능은 값 주입 전까지 휴면하되 코드는 완성된다):

- `VERIFIER_SECRET`(긴 난수)을 Vercel env(admin 프로젝트)와 claude.ai 환경변수에 주입 — 사용자 몫. 후자는 시크릿 금고가 없어 그 환경 세션 전부가 읽는다(단일 소유자라 감수). 미주입이면 provider가 등록되지 않아 기존 Google 로그인만 동작한다.
- 이 세션을 소비하는 release-verifier 루틴 = **FEAT-26**(main-loop 소유, 별도 항목). web 앱은 대상 아님(원장의 web 줄 2건은 사용자 몫 유지).

## 대안

- **`requireAdmin({ write })` 옵션 vs `requireOperator` 분리** → 옵션 채택. 쓰기 액션 4곳의 테스트가 `~/server/auth/guard`의 `requireAdmin`만 mock하므로(`commit-gate-transition.test.mjs:26`·`send-observability-test-event.test.mjs:13`·`post-pipeline-command.test.mjs:14`), 분리하면 그 mock 4곳과 import를 전부 고쳐야 하고 "auth-first, try 밖 최상단" 계약 표면이 넓어진다. 옵션은 mock이 추가 인자를 무시하고 그대로 통과하므로 액션 테스트 무변경이다.
- **타입 표면: `declare module` 증강 vs 로컬 캐스트** → 증강 채택. `User`·`JWT`는 next-auth가 증강용으로 비워 둔 인터페이스라 `role`·`verifierIssuedAt` 추가가 충돌 없이 되고, 세션 콜백과 `requireAdmin` 양쪽에서 캐스트가 흩어지지 않는다. `Session.user`를 직접 재선언하는 방식은 optional 수식자·`DefaultSession["user"]` 교집합 충돌 위험이 있어 피한다.
- **1h 수명: Edge `authorized`에서도 자르기 vs `requireAdmin`만** → `requireAdmin`만. `config.edge`는 Node 클레임을 읽지 않는 것이 계약(R7)이고, 목적지 재검사(3층)가 모든 protected 경로에서 이미 돌아 만료 verifier를 `notFound`로 막는다(삭제된 admin JWT를 maxAge까지 두되 guard가 막는 것과 동일 모델). Edge 추가는 `config.edge` 테스트 범위만 늘린다.
- **실패한 비밀값 시도 로깅** → 무로깅. `authorize`는 `null`만 반환해 순수·테스트 가능성을 유지하고, NextAuth 기본 `CredentialsSignin` 처리로 충분하다. 매 시도를 console에 남기면 로그 플러딩과 순수성 훼손을 부른다.
