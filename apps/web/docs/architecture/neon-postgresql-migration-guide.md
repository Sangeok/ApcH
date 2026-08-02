# SQLite → Neon PostgreSQL 마이그레이션 가이드

## 1. 개요

AI Podcast Clipper의 데이터베이스를 로컬 SQLite에서 Neon PostgreSQL로 마이그레이션한다.

### 왜 Neon인가?

- **서버리스 아키텍처**: Vercel + Next.js 서버리스 환경에 최적화된 WebSocket 기반 연결
- **자동 스케일링**: 사용량에 따라 자동 확장/축소, 미사용 시 0으로 스케일다운
- **브랜칭**: Git처럼 DB를 브랜치하여 개발/스테이징 환경 분리 가능
- **무료 티어**: 0.5GB 스토리지, 월 190시간 컴퓨트 (초기 SaaS에 충분)
- **Prisma 공식 지원**: `@prisma/adapter-neon` 어댑터 제공

### 변경 범위

모든 DB 쿼리가 표준 Prisma Client API(`findUnique`, `create`, `update`, `delete`, `$transaction` 등)만 사용하므로 **코드 변경은 5개 파일**에 국한된다. 쿼리를 호출하는 파일들은 어댑터가 투명하게 적용되어 수정이 필요 없다.

| 파일 | 변경 내용 |
|------|-----------|
| `prisma/schema.prisma` | provider → postgresql, directUrl, previewFeatures, @db.Text |
| `src/server/db.ts` | Neon 서버리스 어댑터로 PrismaClient 초기화 변경 |
| `src/env.js` | DATABASE_URL_UNPOOLED 추가, DATABASE_URL 검증 완화 |
| `next.config.js` | `serverExternalPackages`에 `@prisma/adapter-neon` 추가 |
| `.env` | Neon 연결 문자열로 교체 |

**변경 불필요 (검증 완료)** — 아래 파일들은 모두 표준 Prisma API만 사용하므로 어댑터 전환 시 자동 호환:
- `src/actions/` 전체 (`auth.ts`, `s3.ts`, `generation.ts`, `uploaded-files.ts`)
- `src/fsd/features/` 내 API 모듈 (`auth/api`, `upload/api`, `clip/api`)
- `src/inngest/functions.ts`
- `src/server/auth/config.ts` — PrismaAdapter 동일하게 동작
- `src/app/` 내 라우트 파일 (`page.tsx`, `dashboard/layout.tsx` 등)

---

## 2. 사전 준비

### 2.1 Neon 프로젝트 생성

1. [neon.tech](https://neon.tech) 가입
2. 새 프로젝트 생성 (리전: `ap-northeast-2` 서울 또는 가까운 리전)
3. Dashboard에서 연결 문자열 2개 확보:
   - **Pooled** (런타임용): `postgresql://user:pass@ep-xxx-yyy-pooler.ap-southeast-1.aws.neon.tech/dbname?sslmode=require`
   - **Direct** (마이그레이션용): `postgresql://user:pass@ep-xxx-yyy.ap-southeast-1.aws.neon.tech/dbname?sslmode=require`

> Pooled URL에는 호스트명에 `-pooler`가 포함된다.

### 2.2 현재 데이터 백업

```bash
# SQLite 데이터베이스 백업
cp prisma/db.sqlite prisma/db.sqlite.backup
```

---

## 3. 의존성 설치

```bash
npm install @prisma/adapter-neon
```

| 패키지 | 용도 |
|--------|------|
| `@prisma/adapter-neon` | Prisma ↔ Neon 서버리스 어댑터 (Prisma 6.6.0+에서는 Neon 드라이버를 내부적으로 관리) |

> Prisma 6.6.0 이전에는 `@neondatabase/serverless`, `ws`, `@types/ws`를 별도로 설치해야 했지만, 현재 프로젝트의 Prisma 버전(^6.19.1)에서는 `@prisma/adapter-neon`만 설치하면 된다.

---

## 4. 코드 변경 상세

### 4.1 `prisma/schema.prisma`

3곳을 수정한다.

**Before:**
```prisma
generator client {
    provider = "prisma-client-js"
    output   = "../generated/prisma"
}

datasource db {
    provider = "sqlite"
    // NOTE: When using mysql or sqlserver, uncomment the @db.Text annotations in model Account below
    url      = env("DATABASE_URL")
}

// Account 모델 내
    refresh_token            String? // @db.Text
    access_token             String? // @db.Text
    id_token                 String? // @db.Text
```

**After:**
```prisma
generator client {
    provider        = "prisma-client-js"
    output          = "../generated/prisma"
    previewFeatures = ["driverAdapters"]
}

datasource db {
    provider  = "postgresql"
    url       = env("DATABASE_URL")
    directUrl = env("DATABASE_URL_UNPOOLED")
}

// Account 모델 내
    refresh_token            String? @db.Text
    access_token             String? @db.Text
    id_token                 String? @db.Text
```

**변경 요약:**
1. `previewFeatures = ["driverAdapters"]` — Neon 어댑터 사용을 위한 필수 설정
2. `provider = "postgresql"` + `directUrl` — 풀링 URL(런타임) / 직접 URL(마이그레이션) 분리
3. `@db.Text` 주석 해제 — PostgreSQL에서 토큰 필드를 `TEXT` 타입으로 저장

---

### 4.2 `src/server/db.ts`

전체 파일을 교체한다.

**Before:**
```typescript
import { env } from "~/env";
import { PrismaClient } from "../../generated/prisma";

const createPrismaClient = () =>
  new PrismaClient({
    log:
      env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") globalForPrisma.prisma = db;
```

**After:**
```typescript
import { env } from "~/env";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../../generated/prisma";

const createPrismaClient = () => {
  const adapter = new PrismaNeon({ connectionString: env.DATABASE_URL });
  return new PrismaClient({
    adapter,
    log:
      env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
};

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") globalForPrisma.prisma = db;
```

**변경 요약:**
- Prisma 6.6.0+에서는 `PrismaNeon`에 직접 `connectionString`을 전달 (별도의 `Pool`, `neonConfig`, `ws` 불필요)
- `adapter` 옵션으로 PrismaClient에 Neon 어댑터 주입
- 기존 글로벌 캐싱 패턴은 그대로 유지

---

### 4.3 `src/env.js`

2곳을 수정한다.

**Before:**
```javascript
server: {
    // ...
    DATABASE_URL: z.string().url(),
    // ...
},
runtimeEnv: {
    // ...
    DATABASE_URL: process.env.DATABASE_URL,
    // ...
},
```

**After:**
```javascript
server: {
    // ...
    DATABASE_URL: z.string(),
    DATABASE_URL_UNPOOLED: z.string().optional(),
    // ...
},
runtimeEnv: {
    // ...
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED,
    // ...
},
```

**변경 요약:**
1. `DATABASE_URL`: `.url()` 제거 — Neon 연결 문자열이 `z.string().url()` 검증을 통과하지 못할 수 있음
2. `DATABASE_URL_UNPOOLED` 추가 — 마이그레이션 전용 직접 연결 URL (optional: 로컬 개발 시 불필요할 수 있음)

---

### 4.4 `next.config.js`

`@prisma/adapter-neon`이 내부적으로 `@neondatabase/serverless`를 사용하며, 이 패키지가 native Node.js 모듈에 의존할 수 있다. Next.js 번들러가 이를 번들링 시도하면 빌드 에러가 발생할 수 있으므로 `serverExternalPackages`에 추가한다.

**Before:**
```javascript
/** @type {import("next").NextConfig} */
const config = {};

export default config;
```

**After:**
```javascript
/** @type {import("next").NextConfig} */
const config = {
  serverExternalPackages: ["@prisma/adapter-neon"],
};

export default config;
```

**변경 요약:**
- `serverExternalPackages`에 `@prisma/adapter-neon` 추가 — 서버 사이드에서 이 패키지를 번들링하지 않고 외부 모듈로 처리

---

### 4.5 `.env`

**Before:**
```env
DATABASE_URL="file:./db.sqlite"
```

**After:**
```env
# Neon PostgreSQL (풀링된 연결 - 런타임용)
DATABASE_URL="postgresql://user:password@ep-xxx-yyy-pooler.ap-southeast-1.aws.neon.tech/dbname?sslmode=require"

# Neon PostgreSQL (직접 연결 - 마이그레이션용)
DATABASE_URL_UNPOOLED="postgresql://user:password@ep-xxx-yyy.ap-southeast-1.aws.neon.tech/dbname?sslmode=require"
```

> Neon Dashboard → Connection Details에서 실제 URL을 복사한다. 위는 예시이다.

---

> **참고**: `prisma/schema.prisma`의 `Post` 모델은 T3 Stack 템플릿 잔재로, 코드베이스 어디에서도 사용되지 않는다. PostgreSQL 마이그레이션 전에 제거하는 것을 권장한다.

## 5. DB 초기화 및 마이그레이션

### 5.1 Prisma Client 재생성

```bash
npx prisma generate
```

### 5.2 스키마를 Neon DB에 푸시 (개발 환경)

```bash
npx prisma db push
```

### 5.3 마이그레이션 생성 (프로덕션)

```bash
# 마이그레이션 파일 생성
npx prisma migrate dev --name init-postgresql

# 프로덕션 적용
npx prisma migrate deploy
```

### 5.4 기존 데이터 마이그레이션 (필요 시)

SQLite에 기존 사용자 데이터가 있다면 별도 스크립트로 옮겨야 한다:

```bash
# Prisma Studio로 데이터 확인
npx prisma studio
```

> 초기 SaaS 단계라 데이터가 적다면 수동 마이그레이션 또는 새로 시작하는 것을 권장한다.

---

## 6. 검증 체크리스트

서버 시작 후 아래 기능을 순서대로 테스트한다:

```bash
npm run dev
```

- [ ] **회원가입**: 새 사용자 생성 → DB에 User 레코드 확인
- [ ] **로그인**: 생성한 계정으로 로그인 → JWT 세션 정상 발급
- [ ] **파일 업로드**: 대시보드에서 파일 업로드 → UploadedFile 레코드 생성
- [ ] **영상 처리**: 업로드된 파일 처리 트리거 → Inngest 이벤트 발생 → 상태 변경 (queued → processing → processed)
- [ ] **클립 조회**: 처리된 영상의 클립 목록 정상 표시
- [ ] **클립 삭제**: 클립 삭제 → DB에서 제거 확인
- [ ] **크레딧 차감**: 처리 후 사용자 크레딧 정상 차감
- [ ] **Prisma Studio**: `npx prisma studio`로 PostgreSQL 데이터 직접 확인

---

## 7. Neon 특화 고려사항

### 7.1 콜드 스타트

Neon은 무료 티어에서 5분 비활성 시 컴퓨트를 suspend한다. 첫 요청 시 ~500ms~2s의 콜드 스타트가 발생할 수 있다.

**대응 방안:**
- Pro 플랜에서 `Always On` 설정으로 콜드 스타트 제거
- 또는 cron job으로 주기적 ping (예: Vercel Cron)

### 7.2 브랜칭

Neon의 브랜칭 기능으로 개발/스테이징 DB를 쉽게 분리할 수 있다:

```
main (프로덕션) → dev 브랜치 (개발) → preview 브랜치 (PR별)
```

- Vercel Preview Deployment와 연동하여 PR마다 독립 DB 브랜치 사용 가능
- 브랜치 생성 시 프로덕션 데이터의 copy-on-write 스냅샷 제공

### 7.3 연결 제한

| 플랜 | 최대 동시 연결 |
|------|----------------|
| Free | 100 |
| Pro  | 500+ |

- 풀링된 URL 사용 시 PgBouncer가 연결을 관리하므로 서버리스 환경에서 안전
- `@prisma/adapter-neon`이 내부적으로 Neon 서버리스 드라이버를 사용하여 WebSocket으로 연결하므로 TCP 연결 소모 없음

### 7.4 SSL

Neon은 기본적으로 SSL 연결을 요구한다. 연결 문자열에 `?sslmode=require`가 포함되어 있는지 확인한다.

---

## 8. Vercel 배포 시 환경변수 설정

Vercel Dashboard → Settings → Environment Variables에 아래 값을 추가한다:

| 변수 | 환경 | 값 |
|------|------|-----|
| `DATABASE_URL` | Production, Preview, Development | Neon Pooled URL |
| `DATABASE_URL_UNPOOLED` | Production, Preview, Development | Neon Direct URL |

> 기존 `DATABASE_URL`의 SQLite 경로(`file:./db.sqlite`)를 반드시 교체한다.

---

## 9. 트러블슈팅

### `Error: @prisma/adapter-neon requires driverAdapters preview feature`

→ `schema.prisma`의 generator에 `previewFeatures = ["driverAdapters"]`가 빠져있다.

### `Error validating datasource: the URL must start with the protocol postgresql:// or postgres://`

→ `DATABASE_URL`이 아직 `file:./db.sqlite`로 설정되어 있다. `.env` 파일을 확인한다.

### `ECONNREFUSED` 또는 연결 타임아웃

→ Neon 컴퓨트가 suspended 상태일 수 있다. Neon Dashboard에서 컴퓨트 상태를 확인하고, 몇 초 후 재시도한다.

### `prepared statement already exists`

→ PgBouncer(풀링 모드)에서 발생할 수 있다. `@prisma/adapter-neon` 사용 시에는 일반적으로 발생하지 않지만, 발생 시 연결 문자열에 `?pgbouncer=true` 파라미터를 추가한다.

### Prisma Migrate 실패

→ 마이그레이션은 반드시 **Direct URL** (`DATABASE_URL_UNPOOLED`)을 통해 실행되어야 한다. `schema.prisma`에 `directUrl`이 설정되어 있는지 확인한다.

### `z.string().url()` 검증 실패

→ `src/env.js`에서 `DATABASE_URL` 검증을 `z.string().url()`에서 `z.string()`으로 변경해야 한다.
