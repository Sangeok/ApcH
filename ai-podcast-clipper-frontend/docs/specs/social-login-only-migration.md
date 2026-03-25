# Social Login Only 전환 제안서

> 작성일: 2026-03-26
> 프로젝트: AI Podcast Clipper Frontend (Next.js 15 / T3 Stack)
> 범위: Credentials(이메일/비밀번호) 인증 제거, Social Login(Google OAuth) 전용 전환

---

## 1. 개요

### 1.1 목적

현재 프로젝트는 **Credentials(이메일/비밀번호)** + **Google OAuth** 이중 인증 체계를 운영 중이다. 본 제안서는 Credentials 인증을 완전히 제거하고 **Social Login(Google OAuth) 전용**으로 전환하기 위해 수정이 필요한 모든 파일과 변경 사항을 정의한다.

### 1.2 현재 인증 아키텍처

| 항목 | 현재 상태 |
|------|-----------|
| 인증 프레임워크 | NextAuth.js v5.0.0-beta.25 |
| 세션 전략 | JWT (데이터베이스 세션 미사용) |
| Credentials Provider | 이메일/비밀번호 로그인 (bcryptjs) |
| Google OAuth Provider | `allowDangerousEmailAccountLinking: true` |
| Adapter | PrismaAdapter (PostgreSQL / Neon) |
| 비밀번호 저장 | User.password (nullable, bcrypt hash) |
| 회원가입 | Server Action으로 DB 직접 생성 후 Credentials signIn |
| 로그인 UI | 이메일/비밀번호 폼 + Google 버튼 |
| 회원가입 UI | 이메일/비밀번호 폼 + Google 버튼 |

### 1.3 전환 후 목표 상태

| 항목 | 목표 상태 |
|------|-----------|
| Credentials Provider | **제거** |
| Google OAuth Provider | **유일한 인증 수단** |
| 비밀번호 관련 코드 | **완전 제거** (bcryptjs, hashPassword, comparePasswords) |
| 회원가입 Server Action | **제거** (PrismaAdapter가 자동으로 사용자 생성) |
| 로그인 UI | Google 버튼만 존재하는 단일 페이지 |
| 회원가입 페이지 | **제거** 또는 로그인 페이지로 리다이렉트 |
| Zod 스키마 | loginSchema, signupSchema **제거** |

---

## 2. 영향 범위 분석

### 2.1 수정 대상 파일 전체 목록

총 **18개 파일** 수정, 그 중 **7개 파일/디렉토리 삭제** 대상.

| # | 파일 경로 | 작업 유형 | 우선순위 |
|---|-----------|-----------|----------|
| 1 | `src/server/auth/config.ts` | **수정** | CRITICAL |
| 2 | `src/fsd/widgets/loginForm/ui/index.tsx` | **수정** (전면 재작성) | CRITICAL |
| 3 | `src/app/signup/page.tsx` | **삭제** 또는 리다이렉트 | HIGH |
| 4 | `src/fsd/widgets/signupForm/ui/index.tsx` | **삭제** | HIGH |
| 5 | `src/fsd/features/auth/api/index.ts` | **삭제** | HIGH |
| 6 | `src/actions/auth.ts` | **삭제** | HIGH |
| 7 | `src/fsd/shared/lib/auth.ts` | **삭제** | HIGH |
| 8 | `src/fsd/entity/auth/model/schemas/auth.ts` | **삭제** | HIGH |
| 9 | `src/app/login/page.tsx` | **수정** | MEDIUM |
| 10 | `src/server/auth/config.edge.ts` | **수정** | MEDIUM |
| 11 | `src/middleware.ts` | **수정** | MEDIUM |
| 12 | `src/fsd/pages/home/ui/index.tsx` | **수정** | MEDIUM |
| 13 | `src/app/sitemap.ts` | **수정** (`/signup` 항목 제거) | MEDIUM |
| 14 | `src/app/robots.ts` | **수정** (`/signup` allow 제거) | MEDIUM |
| 15 | `src/fsd/widgets/dashboard-header/ui/index.tsx` | **확인** (변경 불필요) | LOW |
| 16 | `prisma/schema.prisma` | **수정** | LOW |
| 17 | `package.json` | **수정** (의존성 제거) | LOW |
| 18 | `src/fsd/shared/api/auth-guard.ts` | **확인** (변경 불필요) | LOW |

---

## 3. 파일별 상세 변경 사항

### 3.1 `src/server/auth/config.ts` - CRITICAL

**현재 상태**: CredentialsProvider + Google Provider 이중 구성 (134줄)

**변경 내용**:

1. **CredentialsProvider 완전 제거** (L38-74)
   - `import CredentialsProvider from "next-auth/providers/credentials"` 제거
   - `import { comparePasswords } from "~/fsd/shared/lib/auth"` 제거
   - CredentialsProvider 블록 전체 삭제

2. **providers 배열 단순화**
   ```typescript
   // Before
   providers: [
     Google({ allowDangerousEmailAccountLinking: true }),
     CredentialsProvider({ ... }),  // 38-74줄 전체 삭제
   ],

   // After
   providers: [
     Google({ allowDangerousEmailAccountLinking: true }),
   ],
   ```

3. **signIn callback 유지** (L79-114)
   - Google 프로필 데이터 업데이트 로직은 그대로 유지
   - Credentials 분기가 없으므로 `account?.provider === "google"` 체크 단순화 가능

4. **session, jwt callback 유지** - 변경 불필요

5. **Module augmentation** - `emailVerified` 타입은 Google OAuth에서도 사용하므로 유지

**변경 후 예상 코드**:
```typescript
import { PrismaAdapter } from "@auth/prisma-adapter";
import { type DefaultSession, type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

import { db } from "~/server/db";
import { authConfigEdge } from "./config.edge";

declare module "next-auth" {
  interface User {
    emailVerified?: Date | null;
  }
  interface Session extends DefaultSession {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

export const authConfig = {
  ...authConfigEdge,
  providers: [
    Google({
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  adapter: PrismaAdapter(db),
  callbacks: {
    ...authConfigEdge.callbacks,
    signIn: async ({ user, account, profile }) => {
      if (account?.provider === "google") {
        if (!user.email) return false;

        const existingUser = await db.user.findUnique({
          where: { email: user.email },
        });

        if (existingUser) {
          const googleProfile = profile as { picture?: string; name?: string };
          const needsImageOrName = !existingUser.image || !existingUser.name;
          const needsEmailVerified = !existingUser.emailVerified;

          if (needsImageOrName || needsEmailVerified) {
            await db.user.update({
              where: { email: user.email },
              data: {
                ...(needsImageOrName && {
                  image: existingUser.image ?? googleProfile?.picture,
                  name: existingUser.name ?? googleProfile?.name,
                }),
                ...(needsEmailVerified && {
                  emailVerified: new Date(),
                }),
              },
            });
          }
        }

        return true;
      }

      return true;
    },
    session: ({ session, token }) => ({
      ...session,
      user: {
        ...session.user,
        id: token.sub,
        image: token.image as string | undefined,
      },
    }),
    jwt: ({ token, user, account, profile }) => {
      if (user) {
        token.id = user.id;
        token.image = user.image;
      }
      if (account?.provider === "google" && profile) {
        token.image = (profile as { picture?: string }).picture;
      }
      return token;
    },
  },
} satisfies NextAuthConfig;
```

---

### 3.2 `src/fsd/widgets/loginForm/ui/index.tsx` - CRITICAL

**현재 상태**: 이메일/비밀번호 폼 + Google 버튼 (150줄)

**변경 내용**: **전면 재작성** - Google 로그인 버튼만 있는 간결한 컴포넌트로 교체

- `react-hook-form`, `zodResolver`, `loginSchema` import 제거
- 이메일/비밀번호 `<Input>` 필드 제거
- `onSubmit` 핸들러 제거
- Google signIn 버튼만 유지
- `FieldSeparator("or continue with")` 제거
- "Don't have an account? Sign Up" 링크 제거

**변경 후 예상 코드**:
```tsx
"use client";

import { cn } from "~/fsd/shared/lib/utils";
import { Button } from "~/fsd/shared/ui/atoms/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/fsd/shared/ui/atoms/card";
import { GoogleIcon } from "~/fsd/shared/ui/atoms/icons/google";
import { signIn } from "next-auth/react";

export default function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle>Welcome</CardTitle>
          <CardDescription>
            Sign in with your Google account to continue
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
          >
            <GoogleIcon className="mr-2 size-4" />
            Continue with Google
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

### 3.3 `src/app/signup/page.tsx` - HIGH

**현재 상태**: 회원가입 전용 페이지 (35줄)

**변경 방안 (택 1)**:

**Option A - 로그인 페이지로 리다이렉트 (권장)**:
```tsx
import { redirect } from "next/navigation";

export default function Page() {
  redirect("/login");
}
```
- SEO 측면에서 기존 `/signup` URL로 유입되는 트래픽 처리
- 기존 마케팅 링크나 외부 링크 호환성 유지

**Option B - 페이지 완전 삭제**:
- `src/app/signup/` 디렉토리 전체 삭제
- 404로 처리됨
- middleware에서도 `/signup` 제거 필요

---

### 3.4 `src/fsd/widgets/signupForm/ui/index.tsx` - HIGH (삭제)

**현재 상태**: 이메일/비밀번호 회원가입 폼 (158줄)

**변경**: **파일 삭제**
- Social Login에서는 PrismaAdapter가 첫 로그인 시 자동으로 User 레코드 생성
- 별도 회원가입 폼/로직 불필요

---

### 3.5 `src/fsd/features/auth/api/index.ts` - HIGH (삭제)

**현재 상태**: `signUp()` Server Action (49줄)
- 이메일/비밀번호로 DB에 User 직접 생성
- `hashPassword()` 호출

**변경**: **파일 삭제**
- `src/fsd/features/auth/` 디렉토리 전체 삭제 가능 (이 파일이 유일한 콘텐츠)

---

### 3.6 `src/actions/auth.ts` - HIGH (삭제)

**현재 상태**: 중복된 `signUp()` Server Action (52줄)
- `src/fsd/features/auth/api/index.ts`와 동일한 역할의 레거시 버전

**변경**: **파일 삭제**

---

### 3.7 `src/fsd/shared/lib/auth.ts` - HIGH (삭제)

**현재 상태**: bcryptjs 래퍼 함수 (13줄)
```typescript
import { hash, compare } from "bcryptjs";
export async function hashPassword(password: string) { ... }
export async function comparePasswords(...) { ... }
```

**변경**: **파일 삭제**
- 비밀번호 해싱/비교는 Social Login에서 완전히 불필요

---

### 3.8 `src/fsd/entity/auth/model/schemas/auth.ts` - HIGH (삭제)

**현재 상태**: Zod 스키마 (14줄)
```typescript
export const signupSchema = z.object({ email, password });
export const loginSchema = z.object({ email, password });
export type LoginFormValues = ...;
export type SignupFormValues = ...;
```

**변경**: **파일 삭제**
- `src/fsd/entity/auth/` 디렉토리 전체 삭제 가능

**Import 영향 확인**:
- `loginSchema`, `LoginFormValues` → `src/fsd/widgets/loginForm/ui/index.tsx` (재작성으로 import 제거됨)
- `signupSchema`, `SignupFormValues` → `src/fsd/widgets/signupForm/ui/index.tsx` (삭제됨)
- `signupSchema`, `SignupFormValues` → `src/actions/auth.ts` (삭제됨)
- `signupSchema`, `SignupFormValues` → `src/fsd/features/auth/api/index.ts` (삭제됨)

---

### 3.9 `src/app/login/page.tsx` - MEDIUM

**현재 상태**: LoginForm 렌더링 + 인증 사용자 리다이렉트 (27줄)

**변경 내용**:
- 기본 구조 유지 (세션 체크 + 리다이렉트 + LoginForm 렌더링)
- SEO 메타데이터 업데이트 (선택)

```typescript
// 변경 필요 없을 수 있음 - LoginForm 컴포넌트만 재작성되므로
// 단, title 등을 "Log In" → "Sign In" 으로 변경 고려
export const metadata: Metadata = {
  title: "Sign In",
  robots: {
    index: false,
    follow: false,
  },
};
```

---

### 3.10 `src/server/auth/config.edge.ts` - MEDIUM

**현재 상태**: Edge 호환 설정 (40줄)

**변경 내용**:
- `AUTH_ROUTES`에서 `"/signup"` 제거 (Option A 선택 시 유지 가능)

```typescript
// Before
const AUTH_ROUTES = ["/login", "/signup"];

// After (Option B - signup 페이지 삭제 시)
const AUTH_ROUTES = ["/login"];

// After (Option A - signup → login 리다이렉트 시)
// 변경 불필요 - 리다이렉트 페이지에 auth 체크 불필요하지만 무해
```

---

### 3.11 `src/middleware.ts` - MEDIUM

**현재 상태**: NextAuth middleware + route matcher (8줄)

**변경 내용** (signup 페이지 완전 삭제 시):
```typescript
// Before
export const config = {
  matcher: ["/dashboard/:path*", "/login", "/signup"],
};

// After
export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};
```

---

### 3.12 `src/fsd/pages/home/ui/index.tsx` - MEDIUM

**현재 상태**: 홈페이지에 signup/login 링크 다수 포함 (250줄)

**변경 내용**:

1. **CTA "Start free trial" 링크** (L232): `/signup` → `/login`
   ```tsx
   // Before
   <Link href="/signup">Start free trial</Link>
   // After
   <Link href="/login">Start free trial</Link>
   ```

2. **"Already have an account?" 링크** (L238): 제거 또는 텍스트 변경
   ```tsx
   // Before
   <Link href="/login">Already have an account?</Link>
   // After - 제거하거나 단일 CTA로 통합
   ```

3. **헤더 "Log in" 버튼** (L55): `/login` 유지 - 변경 불필요

4. **Sign out** (L81): `/login` 리다이렉트 유지 - 변경 불필요

---

### 3.13 `src/fsd/widgets/dashboard-header/ui/index.tsx` - LOW (확인만)

**현재 상태**: Sign out 버튼 → `/login` 리다이렉트 (89줄)

**변경**: **없음**
- `signOut({ redirectTo: "/login" })`는 Social Login 전용 환경에서도 그대로 동작
- Credentials 관련 코드 없음

---

### 3.14 `prisma/schema.prisma` - LOW

**현재 상태**: User 모델에 `password String?` 필드 존재

**변경 내용**:

```prisma
model User {
    id               String    @id @default(cuid())
    name             String?
    email            String    @unique
    emailVerified    DateTime?
    // password      String?   // 제거
    credits          Int       @default(3)
    polarCustomerId  String?   @unique
    image            String?
    accounts         Account[]
    sessions         Session[]
    uploadedFiles    UploadedFile[]
    clips            Clip[]
    subscription     Subscription?
    orders           Order[]
}
```

**주의사항**:
- 기존 사용자 중 Credentials로만 가입한 사용자가 있다면 **데이터 마이그레이션 필요**
- `password` 컬럼 삭제 전 기존 Credentials-only 사용자 처리 전략 수립 필요 (섹션 5 참조)

---

### 3.15 `package.json` - LOW

**변경 내용**: 불필요한 의존성 제거

```bash
npm uninstall bcryptjs @types/bcryptjs react-hook-form @hookform/resolvers
```

| 패키지 | 현재 버전 | 삭제 사유 |
|--------|-----------|-----------|
| `bcryptjs` | ^3.0.3 | 비밀번호 해싱/비교 전용 |
| `@types/bcryptjs` | (devDep) | 타입 정의 |
| `react-hook-form` | ^7.66.0 | loginForm(재작성)과 signupForm(삭제)에서만 사용 — 마이그레이션 후 프로젝트 전체에서 미사용 |
| `@hookform/resolvers` | ^5.2.2 | react-hook-form용 Zod resolver — 동일 사유 |

**유지해야 하는 의존성**:
- `zod` - env.js 등 다른 곳에서도 사용하므로 유지

---

### 3.16 `src/app/sitemap.ts` - MEDIUM

**현재 상태**: Next.js sitemap 생성 (27줄) — `/signup`이 크롤링 대상으로 등록되어 있음

```typescript
// Before
return [
  { url: SITE_URL, ... },
  { url: `${SITE_URL}/signup`, ... },  // 제거 대상
];
```

**변경 내용**:

- `/signup` 항목 제거 (페이지가 삭제 또는 리다이렉트되므로 sitemap에 유지할 이유 없음)
- 검색엔진이 존재하지 않거나 리다이렉트되는 URL을 불필요하게 크롤링하는 것을 방지

```typescript
// After
return [
  {
    url: SITE_URL,
    lastModified: LAST_UPDATED,
    changeFrequency: "weekly",
    priority: 1.0,
  },
];
```

---

### 3.17 `src/app/robots.ts` - MEDIUM

**현재 상태**: robots.txt 설정 (17줄) — `/signup`이 allow 목록에 포함

```typescript
// Before
allow: ["/", "/signup"],
```

**변경 내용**:

- `allow` 배열에서 `/signup` 제거

```typescript
// After
allow: ["/"],
```

---

### 3.18 `src/fsd/shared/api/auth-guard.ts` - LOW (확인만)

**현재 상태**: Server Action 인증 헬퍼 (30줄)

**변경**: **없음**
- `auth()` 세션 체크만 수행
- Credentials/Social 구분 없이 동작

---

## 4. 삭제 대상 요약

### 4.1 삭제할 파일

| # | 파일/디렉토리 | 줄 수 | 사유 |
|---|---------------|-------|------|
| 1 | `src/fsd/shared/lib/auth.ts` | 13 | bcryptjs 래퍼 (비밀번호 전용) |
| 2 | `src/fsd/entity/auth/model/schemas/auth.ts` | 14 | 로그인/회원가입 Zod 스키마 |
| 3 | `src/actions/auth.ts` | 52 | 레거시 signUp Server Action |
| 4 | `src/fsd/features/auth/api/index.ts` | 49 | signUp Server Action |
| 5 | `src/fsd/widgets/signupForm/ui/index.tsx` | 158 | 회원가입 폼 UI |
| **합계** | | **286줄** | |

### 4.2 삭제 가능한 디렉토리

| # | 디렉토리 | 사유 |
|---|----------|------|
| 1 | `src/fsd/entity/auth/` | 스키마 파일이 유일한 콘텐츠 |
| 2 | `src/fsd/features/auth/` | signUp API가 유일한 콘텐츠 |
| 3 | `src/fsd/widgets/signupForm/` | 회원가입 폼 전체 |
| 4 | `src/app/signup/` | 회원가입 페이지 (Option B 선택 시) |

---

## 5. 데이터 마이그레이션 고려사항

### 5.1 기존 Credentials-only 사용자 처리

기존에 이메일/비밀번호로만 가입한 사용자(`Account` 레코드 없이 `password`만 존재)는 Social Login 전환 후 로그인이 불가능해진다.

**처리 방안**:

| 방안 | 설명 | 장단점 |
|------|------|--------|
| **A. 강제 전환 안내** | 기존 사용자에게 이메일로 Google 계정 연결 요청 | 사용자 경험 저하, 구현 비용 높음 |
| **B. 동일 이메일 자동 링크** | `allowDangerousEmailAccountLinking: true`이므로 동일 이메일 Google 로그인 시 기존 계정에 자동 연결 | **가장 현실적** - 이미 설정되어 있음 |
| **C. password 컬럼 즉시 삭제** | 기존 데이터 무시, 강제 전환 | 데이터 유실 가능 |

**권장 전략**: **방안 B**
- 현재 `allowDangerousEmailAccountLinking: true`가 이미 설정되어 있음
- Credentials로 가입한 사용자가 동일 이메일의 Google 계정으로 로그인하면 기존 User 레코드에 Account가 자동 연결됨
- credits, uploadedFiles, clips 등 기존 데이터 유지됨

### 5.2 스키마 마이그레이션 순서

```
1. 코드 변경 배포 (password 컬럼은 남겨둠)
2. 충분한 기간 후 기존 사용자 전환 확인
3. password 컬럼 제거 마이그레이션 실행
```

---

## 6. 구현 순서

### Phase 1: Core 인증 변경 (CRITICAL)

```
1. src/server/auth/config.ts - CredentialsProvider 제거
2. src/fsd/widgets/loginForm/ui/index.tsx - Google 전용 UI 재작성
```

### Phase 2: 불필요 코드 삭제 (HIGH)

```
3. src/fsd/shared/lib/auth.ts - 삭제
4. src/fsd/entity/auth/ - 디렉토리 삭제
5. src/actions/auth.ts - 삭제
6. src/fsd/features/auth/ - 디렉토리 삭제
7. src/fsd/widgets/signupForm/ - 디렉토리 삭제
```

### Phase 3: 라우팅/UI/SEO 정리 (MEDIUM)

```
8. src/app/signup/page.tsx - 리다이렉트 또는 삭제
9. src/server/auth/config.edge.ts - AUTH_ROUTES 정리
10. src/middleware.ts - matcher 정리
11. src/fsd/pages/home/ui/index.tsx - 링크 업데이트
12. src/app/login/page.tsx - 메타데이터 업데이트
13. src/app/sitemap.ts - /signup 항목 제거
14. src/app/robots.ts - /signup allow 제거
```

### Phase 4: 정리 (LOW)

```
15. package.json - bcryptjs, react-hook-form, @hookform/resolvers 제거
16. prisma/schema.prisma - password 컬럼 제거 (Phase 2와 시간 간격 필요)
17. npm run check - 빌드/타입체크/린트 통과 확인
```

---

## 7. 향후 확장 고려

### 7.1 추가 Social Provider 도입 시

현재 구조에서 GitHub, Discord 등 추가 OAuth Provider 도입이 용이하다:

```typescript
// src/server/auth/config.ts
import GitHub from "next-auth/providers/github";

providers: [
  Google({ allowDangerousEmailAccountLinking: true }),
  GitHub({ allowDangerousEmailAccountLinking: true }),  // 추가
],
```

UI에도 해당 Provider 버튼 추가만 하면 된다.

### 7.2 환경 변수 변경

**제거 불필요**: `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`은 그대로 유지.
**추가 Provider 도입 시**: 해당 Provider의 Client ID/Secret을 `src/env.js`에 추가.

---

## 8. 검증 체크리스트

변경 완료 후 다음 항목을 검증해야 한다:

- [ ] `npm run check` (lint + typecheck) 통과
- [ ] `npm run build` 성공
- [ ] `/login` 페이지에서 Google 버튼 클릭 → Google OAuth 화면 → `/dashboard` 리다이렉트
- [ ] `/signup` 접근 시 `/login`으로 리다이렉트 (Option A)
- [ ] 미인증 상태에서 `/dashboard` 접근 시 `/login`으로 리다이렉트
- [ ] 인증 상태에서 `/login` 접근 시 `/dashboard`로 리다이렉트
- [ ] Sign out 후 `/login`으로 리다이렉트
- [ ] 기존 Credentials-only 사용자가 동일 이메일 Google 계정으로 로그인 시 기존 데이터 유지
- [ ] 신규 사용자 Google 로그인 시 User 레코드 자동 생성 (credits: 3)
- [ ] 홈페이지 CTA 링크가 `/login`으로 정상 연결
- [ ] `sitemap.xml`에 `/signup` URL이 포함되지 않음
- [ ] `robots.txt`의 allow 목록에 `/signup`이 포함되지 않음
- [ ] `bcryptjs`, `react-hook-form`, `@hookform/resolvers` 패키지가 node_modules에서 제거됨

---

## 9. 리스크 및 롤백 전략

| 리스크 | 영향도 | 완화 전략 |
|--------|--------|-----------|
| 기존 Credentials 사용자 로그인 불가 | HIGH | `allowDangerousEmailAccountLinking`으로 동일 이메일 자동 연결 |
| Google OAuth 장애 시 로그인 수단 없음 | MEDIUM | 향후 추가 Social Provider 도입 고려 |
| 외부에서 `/signup` 링크 유입 | LOW | 리다이렉트 처리 (Option A) |

**롤백**: Git revert로 전체 변경 사항 원복 가능. `password` 컬럼은 Phase 4까지 유지하므로 안전한 롤백 윈도우 확보.
