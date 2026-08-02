---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-03-23"
approved-by: null
approved-at: null
approval-scope: null
completed-at: "2026-03-23"
verification-summary: "마이그레이션 전 문서. 개별 검증 기록 없음"
closed-at: null
closed-by: null
closed-reason: null
owners: []
related: []
---

# Google Social Login 도입 제안서

> 작성일: 2026-03-23
> 대상 프로젝트: AI Podcast Clipper Frontend
> 현재 브랜치: dev

---

## 1. 개요 및 배경

### 1.1 목적

Google Social Login을 도입하여 사용자 가입/로그인 과정의 마찰을 줄이고 전환율을 높인다. 이메일/비밀번호 입력 없이 Google 계정으로 즉시 서비스를 이용할 수 있게 한다.

### 1.2 기대 효과

- 가입 전환율 향상 (소셜 로그인은 일반적으로 가입률 20-50% 향상)
- 비밀번호 관리 부담 제거 (사용자 측)
- 비밀번호 해킹/유출 리스크 감소 (서비스 측)
- Google 프로필 이미지 활용으로 UI 개선

### 1.3 현재 인증 구조 요약

| 항목 | 현재 상태 |
|------|----------|
| 인증 프레임워크 | NextAuth v5.0.0-beta.25 (Auth.js) |
| 어댑터 | @auth/prisma-adapter v2.7.2 |
| 프로바이더 | CredentialsProvider만 사용 (이메일/비밀번호) |
| 세션 전략 | JWT (데이터베이스 세션 아님) |
| 비밀번호 해싱 | bcryptjs (12 salt rounds) |
| 데이터베이스 | PostgreSQL (Neon) + Prisma ORM |
| OAuth 지원 여부 | Account/Session/VerificationToken 모델 존재하나 미사용 |

---

## 2. 현재 상태 분석

### 2.1 인증 관련 파일 구조

```
src/
├── server/auth/
│   ├── config.ts          # NextAuth 설정 (CredentialsProvider, JWT 콜백)
│   └── index.ts           # auth, handlers, signIn, signOut 내보내기
├── actions/
│   └── auth.ts            # signUp 서버 액션 (비밀번호 해싱 + DB 저장)
├── fsd/
│   ├── widgets/
│   │   ├── loginForm/ui/index.tsx    # 로그인 폼 (react-hook-form + Zod)
│   │   └── signupForm/ui/index.tsx   # 가입 폼
│   ├── entity/auth/model/schemas/auth.ts  # Zod 유효성 검증 스키마
│   ├── features/auth/api/index.ts         # signUp API 래퍼
│   └── shared/lib/auth.ts                 # hashPassword, comparePasswords
├── app/
│   ├── api/auth/[...nextauth]/route.ts    # NextAuth API 라우트
│   ├── login/page.tsx                      # 로그인 페이지
│   └── signup/page.tsx                     # 가입 페이지
└── env.js                                  # 환경변수 Zod 검증
```

### 2.2 현재 Auth 설정 (`src/server/auth/config.ts`)

```typescript
providers: [
  CredentialsProvider({
    name: "Credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      // 이메일로 사용자 조회 → bcrypt 비밀번호 비교 → 사용자 반환
    },
  }),
],
session: { strategy: "jwt" },
adapter: PrismaAdapter(db),
callbacks: {
  session: ({ session, token }) => ({
    ...session,
    user: { ...session.user, id: token.sub },
  }),
  jwt: ({ token, user }) => {
    if (user) token.id = user.id;
    return token;
  },
},
```

### 2.3 Prisma 스키마 - OAuth 관련 모델 (이미 존재)

```prisma
model Account {
    id                       String  @id @default(cuid())
    userId                   String
    type                     String
    provider                 String
    providerAccountId        String
    refresh_token            String?
    access_token             String?
    expires_at               Int?
    token_type               String?
    scope                    String?
    id_token                 String?
    session_state            String?
    user                     User    @relation(fields: [userId], references: [id], onDelete: Cascade)
    refresh_token_expires_in Int?

    @@unique([provider, providerAccountId])
}

model User {
    id            String    @id @default(cuid())
    name          String?
    email         String    @unique
    emailVerified DateTime?
    password      String          // <-- 문제: OAuth 사용자는 비밀번호 없음
    credits       Int @default(3)
    stripeCustomerId String? @unique
    image         String?         // Google 프로필 이미지 저장 가능
    accounts      Account[]
    sessions      Session[]
    // ...
}
```

### 2.4 핵심 문제점

1. **`password` 필드가 필수(NOT NULL)**: Google OAuth 사용자는 비밀번호가 없으므로 `String?`로 변경 필요
2. **Google Provider 미설정**: `next-auth/providers/google` 미사용
3. **환경변수 부재**: `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` 미등록
4. **계정 연동 로직 없음**: 동일 이메일로 Credentials/Google 가입 시 처리 전략 부재
5. **UI에 소셜 로그인 버튼 없음**: 로그인/가입 폼에 Google 버튼 미구현
6. **프로필 이미지 미활용**: `User.image` 필드 존재하나 아바타에 미표시
7. **emailVerified 미활용**: Google은 검증된 이메일을 반환하지만 `emailVerified` 필드 설정 전략 부재

---

## 3. 구현 범위

### 3.1 변경 파일 요약

| 파일 | 변경 유형 | 설명 |
|------|----------|------|
| `prisma/schema.prisma` | 수정 | `password String` → `password String?` |
| `.env` | 수정 | `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` 추가 |
| `src/env.js` | 수정 | Google 환경변수 Zod 검증 추가 |
| `src/server/auth/config.ts` | 수정 | Google provider (`allowDangerousEmailAccountLinking`), signIn 콜백 (image/name/emailVerified 보충), password null 체크, User 타입 확장 |
| `next.config.js` | 수정 | Google 이미지 도메인 허용 |
| `src/fsd/shared/ui/atoms/icons/google.tsx` | **신규** | Google SVG 아이콘 컴포넌트 |
| `src/fsd/widgets/loginForm/ui/index.tsx` | 수정 | Google 로그인 버튼 + 구분선 |
| `src/fsd/widgets/signupForm/ui/index.tsx` | 수정 | Google 가입 버튼 + 구분선 |
| `src/fsd/widgets/dashboard-header/ui/index.tsx` | 수정 | image prop, AvatarImage 사용 |
| `src/app/dashboard/layout.tsx` | 수정 | image select + prop 전달 |
| `src/app/page.tsx` | 수정 | image select + prop 전달 |
| `src/fsd/pages/home/ui/index.tsx` | 수정 | image prop, AvatarImage 사용 |
| `src/actions/auth.ts` | 확인 | password 타입 `string \| null` 호환성 확인 (코드 변경 불필요) |

**총 12개 파일 수정 + 1개 파일 생성**

### 3.2 의존성 그래프

```
Step 1 (Google Console) ──┐
                          ├──→ Step 3 (환경변수) ──→ Step 4 (Auth 설정)
Step 2 (스키마 마이그레이션) ┘                           │
                                                        ├──→ Step 7 (Login UI)
Step 6 (Google 아이콘) ────────────────────────────────┤
                                                        ├──→ Step 7 (Signup UI)
Step 5 (Next.js 설정) ──────────────────────────────→ Step 8 (Avatar UI)
```

- Step 1, 2, 5, 6은 병렬 수행 가능
- Step 3은 Step 1에 의존 (Google 자격증명 필요)
- Step 4는 Step 2, 3에 의존
- Step 7은 Step 4, 6에 의존
- Step 8은 Step 4에 의존

---

## 4. 단계별 구현 가이드

### Step 1: Google Cloud Console 설정

> 외부 작업 - 코드 변경 없음

1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. **APIs & Services > Credentials** 이동
3. **OAuth 동의 화면** 설정:
   - 앱 이름: `AI Podcast Clipper`
   - 사용자 지원 이메일 입력
   - 승인된 도메인: `podcastclipper.com`
   - 범위(Scopes): `openid`, `email`, `profile`
4. **OAuth 2.0 클라이언트 ID** 생성 (웹 애플리케이션 유형):
   - **승인된 JavaScript 출처**:
     - `http://localhost:3000` (개발)
     - `https://podcastclipper.com` (프로덕션)
   - **승인된 리디렉션 URI**:
     - `http://localhost:3000/api/auth/callback/google` (개발)
     - `https://podcastclipper.com/api/auth/callback/google` (프로덕션)
5. **클라이언트 ID**와 **클라이언트 시크릿** 복사

> Auth.js v5는 리디렉션 URI 경로를 `/api/auth/callback/[provider]` 형태로 자동 처리한다. 이 경로는 이미 존재하는 `src/app/api/auth/[...nextauth]/route.ts` catch-all 라우트에 의해 처리된다.

---

### Step 2: Prisma 스키마 마이그레이션

> 파일: `prisma/schema.prisma` (line 60)

**변경 전:**
```prisma
password      String
```

**변경 후:**
```prisma
password      String?
```

**마이그레이션 실행:**
```bash
# 개발 환경
npm run db:push

# 프로덕션 환경
npm run db:generate
npm run db:migrate
```

> 이 변경은 안전한 additive migration이다. 기존 사용자들은 모두 비밀번호가 있으므로 데이터 손실이 없다. Prisma 클라이언트에서 `password` 타입이 `string | null`로 변경된다.

---

### Step 3: 환경변수 추가

#### 3.1 `.env` 파일

```env
# Google OAuth
AUTH_GOOGLE_ID="<google-client-id>"
AUTH_GOOGLE_SECRET="<google-client-secret>"
```

#### 3.2 `src/env.js` - Zod 스키마 추가

**server 객체에 추가** (기존 `PROCESS_VIDEO_ENDPOINT_AUTH` 아래):
```javascript
server: {
    // ... 기존 변수들
    PROCESS_VIDEO_ENDPOINT_AUTH: z.string(),
    AUTH_GOOGLE_ID: z.string(),        // 추가
    AUTH_GOOGLE_SECRET: z.string(),    // 추가
},
```

**runtimeEnv 객체에 추가** (기존 `PROCESS_VIDEO_ENDPOINT_AUTH` 아래):
```javascript
runtimeEnv: {
    // ... 기존 변수들
    PROCESS_VIDEO_ENDPOINT_AUTH: process.env.PROCESS_VIDEO_ENDPOINT_AUTH,
    AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID,        // 추가
    AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET, // 추가
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
},
```

> Auth.js v5는 `AUTH_GOOGLE_ID`와 `AUTH_GOOGLE_SECRET` 환경변수를 자동으로 읽는다. `AUTH_` 접두사 컨벤션을 따르면 별도 설정 없이 Google provider가 자격증명을 인식한다.

---

### Step 4: Auth 설정 변경

> 파일: `src/server/auth/config.ts`

이 파일이 가장 많은 변경이 필요하다. 변경 사항을 순서대로 정리한다.

#### 4.1 Google Provider import 추가

```typescript
import Google from "next-auth/providers/google";
```

#### 4.2 providers 배열에 Google 추가

```typescript
providers: [
  Google({
    allowDangerousEmailAccountLinking: true,
  }),
  CredentialsProvider({
    // ... 기존 설정 유지
  }),
],
```

> **`allowDangerousEmailAccountLinking`이 필요한 이유**: Auth.js v5는 기본적으로 동일 이메일의 기존 사용자에게 OAuth 계정을 자동 연동하지 않는다. 기존 이메일/비밀번호 사용자가 Google 로그인을 시도하면 `OAuthAccountNotLinked` 에러가 발생하여 signIn 콜백에 도달하기 전에 차단된다. 이 옵션을 활성화하면 PrismaAdapter가 동일 이메일의 기존 사용자에게 Google Account를 자동으로 연결한다. Google은 이메일 소유권을 검증하므로 이메일 클레임을 통한 계정 탈취 리스크는 낮다.

#### 4.3 authorize 함수 - password null 안전성 추가

기존 `authorize` 함수에서 `comparePasswords` 호출 전에 null 체크를 추가한다:

```typescript
async authorize(credentials) {
  if (!credentials?.email || !credentials?.password) {
    return null;
  }

  const email = credentials.email as string;
  const password = credentials.password as string;

  const user = await db.user.findUnique({
    where: { email },
  });

  if (!user) {
    return null;
  }

  // Google OAuth 전용 계정은 비밀번호가 없음
  if (!user.password) {
    return null;
  }

  const passwordsMatch = await comparePasswords(password, user.password);
  if (!passwordsMatch) {
    return null;
  }

  return user;
},
```

#### 4.4 signIn 콜백 추가 (프로필 보충)

`callbacks` 객체에 `signIn` 콜백을 추가한다. signIn 콜백은 Account 연동 **전에** 실행되며 (gate 역할), `true`를 반환한 후 PrismaAdapter가 Account를 자동 연결한다. 콜백에서는 기존 사용자의 프로필 이미지/이름/emailVerified 보충을 담당하며, Google 프로필 정보는 `profile` 파라미터에서 가져온다 (`user`는 DB의 기존 사용자이므로 image/name이 null일 수 있다). Google은 이메일 소유권을 검증하므로 `emailVerified`도 함께 설정한다.

> **타입 주의**: signIn 콜백의 `user` 파라미터 타입은 `User | AdapterUser`이다. 기본 `User` 타입에는 `emailVerified`가 없으므로, `declare module "next-auth"` 블록에서 `User` 인터페이스를 확장해야 한다 (Step 4.5의 모듈 선언 참고).

```typescript
callbacks: {
  signIn: async ({ user, account, profile }) => {
    if (account?.provider === "google") {
      if (!user.email) return false;

      // 이 콜백은 Account 연동 전에 실행됨 (gate 역할)
      // user는 DB의 기존 사용자, profile은 Google의 원본 프로필
      // 기존 사용자의 프로필 정보가 부족하면 Google 정보로 보충
      const googleProfile = profile as { picture?: string; name?: string };
      const needsImageOrName = !user.image || !user.name;
      const needsEmailVerified = !user.emailVerified;

      if (needsImageOrName || needsEmailVerified) {
        await db.user.update({
          where: { email: user.email },
          data: {
            ...(needsImageOrName && {
              image: user.image ?? googleProfile?.picture,
              name: user.name ?? googleProfile?.name,
            }),
            ...(needsEmailVerified && {
              emailVerified: new Date(),
            }),
          },
        });
      }

      return true;
    }

    return true; // Credentials 로그인 허용
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
    // Google OAuth 로그인 시 profile에서 최신 이미지 사용
    // (기존 사용자 연동 시 user.image가 null일 수 있음)
    if (account?.provider === "google" && profile) {
      token.image = (profile as { picture?: string }).picture;
    }
    return token;
  },
},
```

#### 4.5 최종 config.ts 전체 코드

```typescript
import { PrismaAdapter } from "@auth/prisma-adapter";
import { type DefaultSession, type NextAuthConfig } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { comparePasswords } from "~/fsd/shared/lib/auth";
import { db } from "~/server/db";

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
  providers: [
    Google({
      allowDangerousEmailAccountLinking: true,
    }),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email as string;
        const password = credentials.password as string;

        const user = await db.user.findUnique({
          where: { email },
        });

        if (!user) {
          return null;
        }

        if (!user.password) {
          return null;
        }

        const passwordsMatch = await comparePasswords(password, user.password);
        if (!passwordsMatch) {
          return null;
        }

        return user;
      },
    }),
  ],
  session: { strategy: "jwt" },
  adapter: PrismaAdapter(db),
  callbacks: {
    signIn: async ({ user, account, profile }) => {
      if (account?.provider === "google") {
        if (!user.email) return false;

        // 이 콜백은 Account 연동 전에 실행됨 (gate 역할)
        // user는 DB의 기존 사용자, profile은 Google의 원본 프로필
        const googleProfile = profile as { picture?: string; name?: string };
        const needsImageOrName = !user.image || !user.name;
        const needsEmailVerified = !user.emailVerified;

        if (needsImageOrName || needsEmailVerified) {
          await db.user.update({
            where: { email: user.email },
            data: {
              ...(needsImageOrName && {
                image: user.image ?? googleProfile?.picture,
                name: user.name ?? googleProfile?.name,
              }),
              ...(needsEmailVerified && {
                emailVerified: new Date(),
              }),
            },
          });
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
      // Google OAuth 로그인 시 profile에서 최신 이미지 사용
      if (account?.provider === "google" && profile) {
        token.image = (profile as { picture?: string }).picture;
      }
      return token;
    },
  },
} satisfies NextAuthConfig;
```

#### 4.6 signUp 서버 액션 확인

> 파일: `src/actions/auth.ts`

`password` 필드가 `String?`로 변경되면서 Prisma 타입이 `string | null`이 된다. signUp 액션은 항상 비밀번호를 받아 해싱 후 저장하므로 **코드 변경은 불필요**하지만, 타입 체크를 통해 정상 동작을 확인한다:

```bash
npm run typecheck
```

확인 포인트:
- `db.user.create({ data: { password: hashedPassword } })` — `string`은 `string | null`에 할당 가능하므로 에러 없음
- `hashPassword()` 입력값은 폼에서 항상 `string`으로 전달되므로 null 위험 없음

> signUp 액션 자체의 코드 수정은 필요하지 않다. password 필드의 null 안전성은 Step 4.3의 `authorize()` 함수에서만 처리하면 충분하다.

---

### Step 5: Next.js 설정 업데이트

> 파일: `next.config.js`

Google 프로필 이미지 도메인을 허용한다:

**변경 전:**
```javascript
const config = {
  serverExternalPackages: ["@prisma/adapter-neon"],
};
```

**변경 후:**
```javascript
const config = {
  serverExternalPackages: ["@prisma/adapter-neon"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        pathname: "/**",
      },
    ],
  },
};
```

> 현재 아바타는 Radix UI의 `<Avatar>` 컴포넌트를 사용하며 일반 `<img>` 태그를 렌더링한다. `next/image`를 직접 사용하지 않으므로 이 설정은 현재 필수가 아니지만, 향후 `next/image`로 전환 시 필요하므로 선제적으로 설정해둔다. 불필요하다고 판단되면 이 Step은 건너뛸 수 있다.

---

### Step 6: Google 아이콘 컴포넌트 생성

> 신규 파일: `src/fsd/shared/ui/atoms/icons/google.tsx`

`icons/` 디렉토리가 현재 존재하지 않으므로 새로 생성한다. 프로젝트는 `lucide-react`를 일반 아이콘으로 사용하지만, Google 브랜드 아이콘은 커스텀 SVG가 필요하므로 별도 디렉토리로 관리한다:

```tsx
export function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}
```

---

### Step 7: Login/Signup 폼 UI 변경

#### 7.1 LoginForm 변경

> 파일: `src/fsd/widgets/loginForm/ui/index.tsx`

**추가 import:**
```typescript
import { GoogleIcon } from "~/fsd/shared/ui/atoms/icons/google";
```

> `Separator` 별도 import 불필요 — `FieldSeparator`가 `field.tsx`에 이미 정의되어 있으며 내부적으로 `Separator`를 사용한다. 기존 import에 `FieldSeparator`만 추가하면 된다.

**기존 import 수정:**
```typescript
// 변경 전
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "~/fsd/shared/ui/atoms/field";

// 변경 후
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "~/fsd/shared/ui/atoms/field";
```

**기존 마지막 `<Field>` 블록 전체를 수정:**

현재 코드에서 `<Button type="submit">`과 `<FieldDescription>`이 하나의 `<Field>` 안에 있다. Google 버튼은 폼 필드가 아니므로 `<Field>` 밖으로 분리한다:

```tsx
{/* === 변경 전 === */}
{/* <Field>
  <Button type="submit" disabled={isSubmitting}>
    {isSubmitting ? "Logging in..." : "Log in"}
  </Button>
  <FieldDescription className="text-center">
    Don&apos;t have an account?{" "}
    <Link href="/signup">Sign Up</Link>
  </FieldDescription>
</Field> */}

{/* === 변경 후 === */}
<Field>
  <Button type="submit" disabled={isSubmitting}>
    {isSubmitting ? "Logging in..." : "Log in"}
  </Button>
</Field>

<FieldSeparator>or continue with</FieldSeparator>

<Button
  type="button"
  variant="outline"
  className="w-full"
  onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
>
  <GoogleIcon className="mr-2 size-4" />
  Sign in with Google
</Button>

<FieldDescription className="text-center">
  Don&apos;t have an account?{" "}
  <Link href="/signup">Sign Up</Link>
</FieldDescription>
```

> `FieldSeparator`는 `field.tsx`에 이미 정의된 컴포넌트로, 내부적으로 `Separator`를 렌더링하고 `bg-background` 배경의 중앙 텍스트를 표시한다. 수동으로 divider를 구성하지 않고 프로젝트 기존 컴포넌트를 활용한다.
>
> 기존 `signIn` import (`next-auth/react`)가 이미 Google provider 호출을 지원한다. 별도 import 불필요.

#### 7.2 SignupForm 변경

> 파일: `src/fsd/widgets/signupForm/ui/index.tsx`

LoginForm과 동일한 패턴으로 변경:
- `FieldSeparator`를 field import에 추가
- `GoogleIcon` import 추가
- 마지막 `<Field>` 블록을 분리하여 `<FieldSeparator>`, Google 버튼 추가
- 버튼 텍스트는 `"Sign up with Google"`로 변경

---

### Step 8: Dashboard Header 아바타 업데이트

#### 8.1 DashboardHeader 컴포넌트

> 파일: `src/fsd/widgets/dashboard-header/ui/index.tsx`

**import 변경:**
```typescript
// 변경 전
import { Avatar, AvatarFallback } from "~/fsd/shared/ui/atoms/avatar";

// 변경 후
import { Avatar, AvatarFallback, AvatarImage } from "~/fsd/shared/ui/atoms/avatar";
```

**interface 변경:**
```typescript
interface DashboardHeaderProps {
  credits: number;
  email: string;
  image?: string | null;  // 추가
}
```

**destructuring 변경:**
```typescript
export default function DashboardHeader({
  credits,
  email,
  image,  // 추가
}: DashboardHeaderProps) {
```

**Avatar 렌더링 변경:**
```tsx
// 변경 전
<Avatar>
  <AvatarFallback>{email.charAt(0)}</AvatarFallback>
</Avatar>

// 변경 후
<Avatar>
  {image && <AvatarImage src={image} alt={email} />}
  <AvatarFallback>{email.charAt(0)}</AvatarFallback>
</Avatar>
```

> `AvatarImage`가 로드 실패하면 자동으로 `AvatarFallback`이 표시된다 (Radix UI 기본 동작).

#### 8.2 Dashboard Layout

> 파일: `src/app/dashboard/layout.tsx`

**select에 image 추가:**
```typescript
const user = await db.user.findUniqueOrThrow({
  where: { id: session.user.id },
  select: {
    email: true,
    credits: true,
    image: true,  // 추가
  },
});
```

**prop 전달:**
```tsx
<DashboardHeader email={user.email} credits={user.credits} image={user.image} />
```

#### 8.3 Home Page

> 파일: `src/app/page.tsx`

**select에 image 추가:**
```typescript
const user = await db.user.findUniqueOrThrow({
  where: { id: userId },
  select: {
    email: true,
    image: true,  // 추가
  },
});
```

**image 변수 추가 및 prop 전달:**
```typescript
let email: string | null = null;
let image: string | null = null;  // 추가

if (userId) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      email: true,
      image: true,
    },
  });
  email = user.email;
  image = user.image;  // 추가
}

// ...
<HomePage isLoggedIn={isLoggedIn} email={email} image={image} />
```

#### 8.4 HomePage 컴포넌트

> 파일: `src/fsd/pages/home/ui/index.tsx`

**import 변경:**
```typescript
import { Avatar, AvatarFallback, AvatarImage } from "~/fsd/shared/ui/atoms/avatar";
```

**interface 변경:**
```typescript
interface HomePageProps {
  isLoggedIn: boolean;
  email: string | null;
  image?: string | null;  // 추가
}
```

**Avatar 렌더링 변경:**
```tsx
<Avatar>
  {image && <AvatarImage src={image} alt={email ?? ""} />}
  <AvatarFallback>{email?.charAt(0)}</AvatarFallback>
</Avatar>
```

---

## 5. 계정 연동 전략

### 5.1 시나리오별 동작

| 시나리오 | 동작 | 결과 |
|---------|------|------|
| 신규 사용자가 Google로 가입 | PrismaAdapter가 User + Account 자동 생성 | credits=3, password=null, image=Google 프로필 |
| 기존 이메일/비밀번호 사용자가 Google 로그인 | signIn 콜백에서 `profile`로 image/name/emailVerified 보충 → 콜백 true 반환 후 PrismaAdapter가 Account 자동 연결 | 기존 userId, credits 유지, Google 프로필 이미지/이름 반영, emailVerified 설정 |
| Google 사용자가 이메일/비밀번호 로그인 시도 | authorize()에서 `user.password`가 null → `return null` | "Invalid email or password" 에러 표시 |
| 동일 Google 계정으로 재로그인 | Auth.js가 기존 Account로 사용자 인증, signIn 콜백에서 image/name 이미 있으면 추가 작업 없음 | 정상 로그인 |

### 5.2 계정 연동 다이어그램

```
사용자가 "Sign in with Google" 클릭
        │
        ▼
Google OAuth 동의 화면
        │
        ▼
Auth.js 내부 처리 (allowDangerousEmailAccountLinking)
        │
        ├── 기존 Account 있음 → 해당 사용자로 인증 → signIn 콜백
        │
        ├── 기존 사용자 있음 (동일 이메일) + Account 없음
        │     → signIn 콜백 실행 (profile로 image/name/emailVerified 보충)
        │     → 콜백 true 반환 후 PrismaAdapter가 Account 자동 생성
        │
        └── 사용자 없음
              → PrismaAdapter가 새 User + Account 생성 (credits: 3)
              → signIn 콜백 실행
        │
        ▼
JWT 콜백: profile.picture → token.image 설정
        │
        ▼
정상 로그인 (기존 credits 유지)
```

---

## 6. 엣지 케이스 및 보안 고려사항

### 6.1 엣지 케이스

| 케이스 | 현재 처리 | 개선 가능 여부 |
|-------|----------|--------------|
| Google OAuth 동의 취소 | Auth.js가 에러 페이지로 리디렉션 | 커스텀 에러 페이지 추가 가능 |
| OAuth 콜백 중 네트워크 실패 | Auth.js 기본 에러 처리 | 적절한 동작 |
| Google에서 이메일 없는 계정 (극히 드묾) | `if (!user.email) return false`로 차단 | 적절한 동작 |
| 동일 사용자 다수 Google 계정 | `@@unique([provider, providerAccountId])`로 중복 방지 | 적절한 동작 |
| DB 불가 시 계정 연동 실패 | signIn 콜백에서 예외 발생 → 로그인 실패 | 에러 로깅 추가 권장 |
| Google 버튼 중복 클릭 (동시 요청) | PrismaAdapter + `@@unique` 제약으로 중복 Account 방지 | 적절한 동작 |
| Google 사용자의 emailVerified 미설정 | PrismaAdapter가 신규 사용자 생성 시 자동 설정. 기존 사용자 연동 시 signIn 콜백에서 `emailVerified: new Date()` 설정 (Step 4.4 참고) | 구현 완료 |

### 6.2 보안 고려사항

| 항목 | 상태 | 설명 |
|------|------|------|
| CSRF 보호 | Auth.js 자동 처리 | `AUTH_SECRET`으로 CSRF 토큰 생성 |
| OAuth state 파라미터 | Auth.js 자동 처리 | CSRF 공격 방지 |
| 토큰 저장 | Account 모델에 평문 저장 | Prisma는 자동 암호화하지 않음. 현재 Google API를 직접 호출하지 않으므로 허용 가능. 향후 직접 호출 시 암호화 검토 필요 |
| 이메일 대소문자 | 주의 필요 | **기존 버그 존재**: signUp 액션의 `findUnique`는 원본 케이스로 조회하지만 `create`는 `toLowerCase()`로 저장. `authorize()`도 원본 케이스로 조회. 대소문자가 다른 이메일로 로그인 시 실패할 수 있음. Google OAuth는 항상 소문자 이메일을 반환하므로 Google 연동 자체에는 영향 없음. 별도 이슈로 signUp/authorize의 이메일 정규화 통일 권장 |
| 토큰 갱신 | 현재 불필요 | Google API를 직접 호출하지 않으므로 refresh_token 갱신 불필요. 향후 필요 시 JWT 콜백에서 갱신 로직 추가 |
| `allowDangerousEmailAccountLinking` | 의도적 활성화 | Google은 이메일 소유권을 검증하므로 이메일 클레임을 통한 계정 탈취 리스크는 낮음. 이 설정 없이는 기존 이메일/비밀번호 사용자의 Google 연동이 `OAuthAccountNotLinked` 에러로 차단됨 |
| 계정 삭제/연동 해제 | 미구현 | 향후 별도 기능으로 구현 가능 |

### 6.3 추가 권장사항

**권장 (구현 추천)**:
- **Google 전용 계정 안내 메시지**: Google 전용 계정이 비밀번호 로그인 시도 시 단순 "Invalid email or password" 대신 "이 계정은 Google로 가입되었습니다. Google 버튼을 사용해 주세요." 메시지 표시. `authorize()`에서 `user.password === null`일 때 별도 에러 코드를 반환하여 UI에서 분기 처리 가능

**선택 (향후 고려)**:
- **커스텀 에러 페이지**: `src/app/api/auth/[...nextauth]/route.ts` 또는 `authConfig.pages.error`로 OAuth 에러 시 사용자 친화적 페이지 표시
- **미들웨어 추가**: `middleware.ts`를 통한 라우트 보호 (현재는 layout.tsx에서 처리 중)

---

## 7. 테스트 체크리스트

### 7.1 기본 기능 테스트

- [ ] 신규 사용자 - Google 가입: Google OAuth 완료 후 DB에 User(password: null, credits: 3, image: Google URL) + Account 레코드 생성 확인
- [ ] 기존 Google 사용자 - 재로그인: 중복 User 생성 없이 정상 로그인
- [ ] 기존 이메일/비밀번호 사용자 - Google 연동: 동일 이메일로 Google 로그인 시 Account 레코드 생성, 기존 userId/credits 유지
- [ ] Google 전용 사용자 - 비밀번호 로그인 시도: "Invalid email or password" 에러 표시 (크래시 없음)
- [ ] 기존 이메일/비밀번호 로그인: Google 추가 후에도 기존 로그인 정상 동작
- [ ] 기존 이메일/비밀번호 사용자 - Google 연동 후: image/name이 Google 프로필로 갱신되는지 확인
- [ ] 기존 이메일/비밀번호 사용자 - Google 연동 후: `emailVerified`가 설정되는지 확인
- [ ] 이메일/비밀번호 신규 가입: `password String?` 변경 후에도 signUp 정상 동작 (타입 체크 포함)

### 7.2 UI 테스트

- [ ] 로그인 페이지: "or continue with" 구분선 + Google 버튼 표시
- [ ] 가입 페이지: "or continue with" 구분선 + Google 버튼 표시
- [ ] Google 버튼 클릭 시 Google OAuth 동의 화면으로 리디렉션
- [ ] 로그인 성공 후 `/dashboard`로 리디렉션

### 7.3 아바타 테스트

- [ ] Google 사용자: Dashboard 헤더에 Google 프로필 이미지 표시
- [ ] Google 사용자: Home 페이지 헤더에 Google 프로필 이미지 표시
- [ ] 이메일/비밀번호 사용자: 기존처럼 이메일 첫 글자 fallback 표시
- [ ] 프로필 이미지 로드 실패 시: fallback(이메일 첫 글자)으로 자동 전환

### 7.4 엣지 케이스 테스트

- [ ] Google OAuth 동의 취소 (사용자가 "취소" 클릭) → 크래시 없이 로그인 페이지로 복귀
- [ ] 로그아웃 후 재로그인 정상 동작
- [ ] 세션 만료 후 Google 재인증 정상 동작
- [ ] Credits가 올바르게 유지되는지 확인 (연동 시 기존 credits 보존)

### 7.5 환경별 테스트

- [ ] **개발**: `http://localhost:3000` + Google OAuth 개발 자격증명
- [ ] **프로덕션**: `https://podcastclipper.com` + Google OAuth 프로덕션 자격증명
- [ ] 리디렉션 URI 정확히 일치 확인 (후행 슬래시 주의)

---

## 8. 추가 패키지 설치 여부

**추가 패키지 설치 불필요.** `next-auth` v5.0.0-beta.25에 Google provider가 내장되어 있다.

```bash
# 이미 설치된 관련 패키지
next-auth@5.0.0-beta.25         # Google provider 내장
@auth/prisma-adapter@2.7.2      # Prisma 어댑터 (이미 설정됨)
```

---

## 9. 구현 우선순위 및 예상 리스크

### 우선순위

| 순위 | 작업 | 중요도 | 복잡도 |
|------|------|--------|--------|
| 1 | Prisma 스키마 마이그레이션 | CRITICAL | 낮음 |
| 2 | Google Cloud Console 설정 | CRITICAL | 낮음 |
| 3 | 환경변수 추가 | CRITICAL | 낮음 |
| 4 | Auth 설정 변경 (provider + 콜백) | CRITICAL | 중간 |
| 5 | Login/Signup UI 변경 | HIGH | 낮음 |
| 6 | Dashboard 아바타 업데이트 | MEDIUM | 낮음 |
| 7 | Next.js 이미지 설정 | LOW | 낮음 |

### 리스크

| 리스크 | 영향도 | 대응 |
|--------|--------|------|
| Google OAuth 자격증명 미발급 | 전체 차단 | Step 1을 최우선 수행 |
| 스키마 마이그레이션 실패 | 전체 차단 | 개발 환경에서 먼저 테스트 |
| 기존 사용자 로그인 영향 | 높음 | password null 체크로 방지됨 |
| PrismaAdapter + JWT 충돌 | 중간 | 현재 설정에서 이미 공존 중이므로 낮은 리스크 |
