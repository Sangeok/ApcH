# Feature-Sliced Design (FSD) 아키텍처 가이드라인

이 문서는 프로젝트에 적용되는 **Feature-Sliced Design (FSD)** 아키텍처의 핵심 규칙과 구조를 정의합니다.

## 관련 문서

- UI 구조 가이드라인: `docs/architecture/ui-structure-guidelines.md`

## 1. 핵심 개념 (Core Concepts)

FSD는 프론트엔드 애플리케이션을 **Layers(계층) > Slices(슬라이스) > Segments(세그먼트)**의 3단계 계층 구조로 나눕니다.

- **Coupling(결합도) 낮춤**: 기능 단위로 분리하여 코드 간의 의존성을 관리합니다.
- **Cohesion(응집도) 높임**: 관련된 비즈니스 로직과 UI를 한 곳에서 관리합니다.

---

## 2. 계층 구조 (Layers)

프로젝트의 최상위 디렉토리는 다음과 같은 표준화된 계층으로 구성됩니다.
**엄격한 단방향 의존성 규칙**이 적용됩니다: **상위 계층은 하위 계층만 import 할 수 있습니다.**

(상위)

1.  **`app/`**
    - 애플리케이션의 진입점 및 전역 설정.
    - Provider, Router 설정, 전역 스타일, Layout 등이 위치합니다.
    - _Next.js App Router 사용 시 `app` 폴더 자체가 라우팅 역할을 겸하므로, FSD의 `app` 레이어 개념은 `app/(providers)`나 Root Layout 등에 녹여냅니다._

2.  **`views/`** (Next.js의 라우팅 폴더와 구분 필요, FSD 논리적 페이지)
    - 실제 라우트(페이지)를 구성하는 컴포넌트 (`Page` 컴포넌트).
    - `Widgets`, `Features`, `Entities`를 조합하여 완전한 화면을 구성합니다.
    - Next.js App Router 구조에서는 `app/[route]/page.tsx`가 이 역할을 수행하되, 복잡한 로직은 FSD의 `pages` 슬라이스로 위임하기도 합니다.

3.  **`widgets/`**
    - 독립적인 기능을 수행하는 거대 컴포넌트 덩어리.
    - 여러 `Features`와 `Entities`를 조합하여 만듭니다.
    - **Widget은 조합(Composition) 계층**입니다. 화면에 필요한 데이터를 모으고 배치할 수는 있지만, 특정 도메인 테이블에 대한 직접 DB 조회 로직을 Widget이 소유해서는 안 됩니다.
    - Widget의 서버 로직은 하위 레이어의 API를 호출해 필요한 값을 조합하는 오케스트레이션에 집중합니다.
    - 예: `Header`, `Sidebar`, `PostFeed`, `VideoPlayerWidget`

4.  **`features/`**
    - 사용자의 비즈니스 행위(User Scenario)를 다루는 기능 단위.
    - 재사용 가능해야 하며, 비즈니스 가치를 가집니다.
    - 예: `AuthByEmail`, `LikeVideo`, `SearchVideo`, `CommentPost`

5.  **`entities/`**
    - 비즈니스 도메인 엔티티 (데이터 모델).
    - 데이터와 관련된 UI, 상태 등을 포함하지만 **행위(Behavior)는 포함하지 않는 것**이 원칙입니다. (단순 보여주기용 UI 등)
    - 특정 도메인 데이터의 조회/매핑 책임은 해당 Entity가 우선적으로 가집니다.
    - 예를 들어 `userProfile`, `quizQuestion`처럼 한 도메인 테이블/모델에 대한 DB 조회는 `entities/<domain>/api/`에 둡니다.
    - 예: `User`, `Video`, `Comment`, `Notification`
    - _주의: Entity 내에서는 다른 Entity를 import 할 수 없습니다._

6.  **`shared/`**
    - 특정 비즈니스 로직에 종속되지 않은 재사용 가능한 컴포넌트, 유틸리티, 라이브러리.
    - 프로젝트 전반에서 공통으로 사용됩니다.
    - 예: `UI Kit(Button, Input)`, `config(앱 설정·환경값·피처 플래그)`, `lib(axios, dates)`, `hooks`
    - 앱 설정값과 피처 플래그는 `shared/config`에 둡니다. 단순히 "상수"라는 이유로 `shared/config`에 모으지 말고, 목적이 다른 상수는 별도 세그먼트(예: 테마 토큰은 `shared/ui`, 포맷팅 유틸 상수는 `shared/lib`, 라우트 상수는 `shared/routing`)로 분리합니다.
    - _주의: `shared/types` 폴더는 만들지 않습니다. 전역 타입은 목적에 맞는 세그먼트(예: 설정 관련 타입은 `shared/config`, 분석 이벤트 타입은 `shared/analytics`, 도메인 중립 유틸 타입은 `shared/lib`)에 배치합니다._

(하위)

---

## 3. 슬라이스 (Slices)

각 계층(`shared`와 `app` 제외)은 도메인별 폴더인 **Slice**로 나뉩니다.
Slice 이름은 비즈니스 도메인(예: `user`, `video`, `auth`)을 따릅니다.

- 예: `features/auth`, `entities/video`, `widgets/header`

## 4. 세그먼트 (Segments)

각 Slice 내부는 파일의 역할에 따라 다음과 같은 **Segment**로 나뉩니다.

- **`ui/`**: 리액트 컴포넌트 (`UserProfile.tsx`)
- **`model/`**: 비즈니스 로직, 상태 관리 (Zustand store), 데이터 처리 훅, 도메인 타입 정의
- **`api/`**: 서버 통신 로직, API 요청 함수, API 응답 타입, 서버 전용 데이터 접근 함수
- **`lib/`**: 해당 슬라이스 내부에서만 쓰이는 유틸리티 (선택적)
- **`config/`**: 런타임/빌드 동작을 결정하는 설정값과 피처 플래그. 상수라는 이유만으로 여기 두지 않으며, 도메인 데이터·판정 규칙은 `model/`, 표시용 매핑·포맷터는 `lib/` 또는 `ui/`에 배치합니다.

> **세그먼트 네이밍 원칙**: 세그먼트 이름은 코드의 **목적(purpose)**을 나타내야 하며, 코드의 **형태(essence)**를 나타내면 안 됩니다.
> `types`, `components`, `hooks`, `utils`는 "무엇인가(=어떻게 구현됐는가)"를 설명하므로 세그먼트 이름으로 사용하지 않습니다.
>
> 판별 질문: 폴더 이름이 **"이 코드는 무엇으로 구현됐나"**(hook? class? type?)에 답한다면 잘못된 이름입니다. **"이 코드는 무엇을 위한 것인가"**(UI? 비즈니스 로직? 서버 통신?)에 답해야 합니다.

### 서버 데이터 접근 배치 규칙

Next.js App Router에서는 서버 컴포넌트, route handler, server action 어디서든 서버 코드를 호출할 수 있으므로, "어디서든 `prisma`를 불러도 된다"는 식으로 구조가 쉽게 무너질 수 있습니다. 이 프로젝트에서는 아래 기준을 따릅니다.

1. **도메인 DB 접근 소유권은 가장 낮은 적절한 레이어에 둡니다.**
   - 단일 도메인 엔티티 조회는 `entities/<domain>/api/`
   - 사용자 행위 단위의 조합/저장은 `features/<feature>/api/`

2. **`widgets/`, `views/`, `app/`는 도메인 DB 쿼리를 직접 소유하지 않습니다.**
   - 이 레이어들은 하위 레이어 API를 호출해 화면용 데이터를 조합합니다.
   - 예: 헤더에서 프로필이 필요하면 `widgets/app-header/api/`가 직접 `prisma.userProfile`을 조회하는 대신 `entities/user/api/`를 호출합니다.

3. **상위 레이어의 `api/` 세그먼트는 오케스트레이션 전용입니다.**
   - 세션 확인, 여러 하위 API 결과 취합, 화면 전용 DTO 조립은 가능
   - 특정 도메인 테이블을 직접 조회하는 비즈니스 쿼리는 금지

4. **직접 DB 접근이 허용되는 예외는 전역 인프라 성격일 때만 제한적으로 인정합니다.**
   - 인증 세션, 전역 설정, 프레임워크 진입점 수준의 부트스트랩
   - 이 경우에도 도메인 데이터 조회와 섞지 않습니다.

### 슬라이스 공개 API를 런타임 기준으로 나눈다 (`index.ts` / `server.ts`)

`api/` 세그먼트가 `import "server-only"`인 슬라이스에서, 그 세그먼트를 슬라이스
barrel(`index.ts`)이 재수출하면 **클라이언트가 그 슬라이스의 공개 API를 쓸 수
없게 됩니다.** 타입 체크는 통과하고 `npm run build`에서만 깨지므로, 실제로는
클라이언트 모듈들이 barrel을 우회해 `model/*`·`ui/*`를 직접 임포트하게 되고
공개 API 경계가 사실상 사라집니다.

그래서 서버 전용 접근이 있는 슬라이스는 루트 barrel을 둘로 나눕니다.

- **`index.ts`** — 클라이언트 안전 표면. `model/`·`lib/`·`ui/`만 재수출합니다.
  여기에 `./api`를 실으면 이 barrel을 임포트하는 모든 클라이언트 모듈의 빌드가
  깨집니다.
- **`server.ts`** — 서버 전용 표면. 1행이 `import "server-only"`이고 `./api`를
  재수출합니다. 서버 컴포넌트·route handler·server action이 이쪽을 씁니다.

```ts
// entities/uploaded-file/index.ts   (클라이언트도 임포트한다)
export { uploadedFileKeys } from "./model/query-keys";
export type { UploadedFileDetail } from "./model/types";
export { UploadedFileStatusBadge } from "./ui/UploadedFileStatusBadge";

// entities/uploaded-file/server.ts  (서버만)
import "server-only";
export { getUploadedFileDetailsById } from "./api";
```

같은 이유로, `"use server"` 파일 옆에 두는 서버 전용 헬퍼 모듈은 클라이언트가
임포트하는 barrel에 싣지 않습니다. `shared/observability`처럼 barrel 자체가
`server-only` 모듈을 재수출하는 경우, 클라이언트에서 쓸 훅은 barrel이 아니라
파일 경로로 임포트합니다.

검증은 `npm run build`입니다 — `server-only` 위반과 `"use server"` export 규칙은
타입 체크가 잡지 못합니다.

### 디렉토리 구조 예시

```
src/
├── app/                  # App setup (Providers, Global Styles)
├── widgets/
│   └── Header/           # Widget Slice
│       ├── ui/           # UI Components
│       └── index.ts      # Public API
├── features/
│   └── Login/            # Feature Slice
│       ├── ui/
│       ├── model/        # Login Logic (State)
│       └── api/          # Login API
├── entities/
│   └── User/             # Entity Slice
│       ├── api/          # User DB/API access
│       ├── ui/           # UserCard, UserAvatar (Dumb Components)
│       └── model/        # User Type Definitions
└── shared/
    ├── ui/               # Generic UI (Button, Card)
    ├── config/           # App-wide settings & feature flags
    └── lib/              # Helpers
```

### 세그먼트 내부 구성 (Sub-segment Organization)

세그먼트 내부에서도 "목적 기준 그룹화" 원칙은 **재귀적으로** 적용됩니다.

`model/`이 커진다고 `model/hooks/`, `model/schema/`처럼 **파일 형태별로 묶지 마세요.** 같은 도메인의 hook과 schema가 다른 폴더로 분리되면, 변경이 잦은 축(=도메인)이 폴더 경계와 어긋나 응집도가 무너집니다.

| 세그먼트 내부 파일 수 | 권장 구조 |
|---|---|
| ~5개 | 평탄하게 배치 (`model/use-upload.ts`, `model/upload-schema.ts`) |
| 5~15개 | 도메인/목적별 하위 폴더 (`model/upload/`, `model/playback/`) |
| 15개+ | 슬라이스 자체를 쪼갤 신호 |

```
# ❌ 본질(파일 형태) 기준 — 안티패턴
model/
├── hooks/
│   ├── use-upload.ts
│   └── use-playback.ts
└── schema/
    ├── upload.ts
    └── playback.ts

# ✅ 목적(도메인) 기준 — 권장
model/
├── upload/
│   ├── use-upload.ts
│   └── schema.ts
└── playback/
    ├── use-playback.ts
    └── schema.ts
```

**판별 기준**: "업로드 관련 로직 전부 보고 싶다"고 했을 때 한 폴더만 열면 되는가? 그렇다면 옳은 그룹화입니다. 여러 폴더를 점프해야 한다면 잘못된 축으로 묶은 것입니다.

---

## 5. 의존성 규칙 (Dependency Rules)

FSD의 핵심은 **엄격한 의존성 관리**입니다.

1.  **Linear Flow (선형 흐름)**
    - **상위 레이어는 하위 레이어만 import 할 수 있습니다.**
    - 예: `features`는 `entities`와 `shared`를 사용할 수 있지만, `widgets`나 `pages`는 사용할 수 없습니다.
    - 예: `shared`는 프로젝트 내의 어떤 레이어도 import 할 수 없습니다.

2.  **Slice Isolation (슬라이스 격리)**
    - **같은 레이어 내의 다른 슬라이스는 서로 직접 import 할 수 없습니다.**
    - 예: `features/auth`는 `features/comment`를 import 할 수 없습니다.
    - _예외: `shared`와 `app` 레이어는 슬라이스가 없고 세그먼트로 직접 나뉘므로, 이 규칙의 적용 대상이 아닙니다. 따라서 `shared/lib`에서 `shared/config`를 참조하는 것은 허용됩니다._
    - 이 규칙은 높은 응집도와 낮은 결합도를 보장합니다.

3.  **Public API (공개 API)**
    - 각 Slice는 반드시 `index.ts` 파일을 통해 외부로 노출할 요소만 `export` 해야 합니다.
    - 외부에서는 Slice의 내부 파일(`features/auth/ui/LoginForm`)에 직접 접근하지 말고, Public API(`features/auth`)를 통해 접근해야 합니다.
    - Bad: `import { LoginForm } from 'features/auth/ui/LoginForm'`
    - Good: `import { LoginForm } from 'features/auth'`

4.  **도메인 데이터 접근 위임**
    - 상위 레이어가 특정 도메인 DB 조회가 필요하면, 해당 도메인의 `entities/*/api` 또는 해당 사용자 행위의 `features/*/api`로 위임해야 합니다.
    - Bad: `widgets/app-header/api/get-app-header-data.ts`에서 `prisma.userProfile` 직접 조회
    - Good: `widgets/app-header/api/get-app-header-data.ts`에서 `entities/user/api/get-user-profile.ts` 호출

---

## 6. Page 리팩터링과 책임 분리 기준

Page slice를 리팩터링할 때는 "파일을 더 많이 나누는 것"보다 **책임이 어느 레이어에 속하는지**를 먼저 판단합니다. `pages/<slice>/ui/index.tsx`는 화면의 최상위 조립 지점으로 두고, 도메인 규칙이나 side effect가 섞일 때만 적절한 하위 segment 또는 하위 layer로 이동합니다.

### Page 컴포넌트 분리 기준

- `pages/<slice>/ui/index.tsx`는 page layout, section 배치, widget/feature/entity 조립을 담당합니다.
- 페이지 안에서만 쓰이고 복잡도가 낮은 Summary, Section, Empty state는 억지로 `_component`로 분리하지 않습니다.
- JSX가 길더라도 단순 배치 코드라면 page에 남기는 편이 낫습니다.
- 자체 상태, side effect, fetch/polling, mutation 제어, 복잡한 파생 계산이 섞이면 UI에서 빼는 것을 고려합니다.
- page 전용 UI 조각은 `pages/<slice>/ui/_component`에 둡니다. 다른 page나 widget에서 재사용되기 시작하면 더 낮은 layer로 이동할 후보입니다.

### Page model로 분리할 것

다음 코드는 `pages/<slice>/model`로 분리합니다.

- page에 종속된 client hook
- page 전용 polling/refetch 정책
- page props를 기반으로 live data를 관리하는 query wrapper
- page UI를 위해 여러 값을 묶거나 파생하는 상태 로직

예시:

```txt
src/fsd/pages/upload-detail/model/use-live-uploaded-file-detail.ts
src/fsd/pages/upload-detail/ui/index.tsx
```

`ui/index.tsx`는 hook을 호출해 데이터를 받고 화면을 조립합니다. TanStack Query의 query key, query options, polling 정책에 관한 세부 규칙은 `docs/conventions/tanstack-query-fsd-guidelines.md`를 따릅니다.

### 도메인 표시 규칙 배치

특정 도메인의 상태 label, badge variant, display text, format rule처럼 여러 화면에서 공유되는 표시 규칙은 page config에 두지 않습니다. 이때 "상수"라는 이유만으로 `config`를 선택하지 말고, 목적에 따라 segment를 나눕니다.

- 도메인 상태 목록, 타입, 상태 판정 규칙, 상태→라벨 매핑 등 도메인 표현 메타데이터: `entities/<domain>/model`
- `Badge` variant처럼 UI kit 표현과 결합된 표시 방식: `entities/<domain>/ui`
- 도메인 데이터를 표시 형태로 변환하는 순수 함수(formatter, mapper): `entities/<domain>/lib`
- 앱 전역에서 공유되는 환경 설정값과 피처 플래그: `shared/config`
- 페이지 단위 SEO 기본값이나 page 전용 피처 플래그처럼 진짜 *설정* 성격의 값: `pages/<slice>/config` (단순한 화면용 상수는 사용처(`ui/`, `model/`)에 코로케이트)

Bad:

```ts
import { STATUS_CONFIG } from "~/fsd/pages/dashboard/config";
```

Good:

```ts
import { UploadedFileStatusBadge } from "~/fsd/entities/uploaded-file/ui/UploadedFileStatusBadge";
```

특히 `widgets`나 `features`가 `pages/*`를 import하는 구조는 피합니다. page에 있던 값이 widget/feature에서도 필요해졌다면, 그 값은 page 책임이 아닐 가능성이 높습니다.

### 리팩터링 판단 체크리스트

- 이 코드가 페이지 배치만 담당하는가? 그렇다면 `ui/index.tsx`에 남깁니다.
- 이 코드가 page 전용 상태나 side effect를 관리하는가? 그렇다면 `pages/<slice>/model`로 분리합니다.
- 이 코드가 특정 도메인의 공통 표시 규칙인가? UI 표현이면 `entities/<domain>/ui`, UI와 독립적인 도메인 데이터·판정 규칙·라벨 매핑이면 `entities/<domain>/model`, 도메인 데이터를 표시 형태로 바꾸는 순수 함수면 `entities/<domain>/lib`로 이동합니다.
- 이 코드가 여러 도메인에서 쓰이는 순수 공통 유틸인가? 그렇다면 `shared`로 이동합니다.
- 이 코드를 옮기지 않으면 상위 layer를 하위 layer에서 import하게 되는가? 그렇다면 더 낮은 layer로 내려야 합니다.

---

## 7. 일반적인 고민과 해결 (FAQ)

**Q. 기능인지 엔티티인지 헷갈립니다.**

- **Entity**: "무엇인가? (Model)"에 집중. 데이터와 데이터를 보여주는 단순 UI (예: `UserCard`). 사용자 인터랙션 로직(버튼 클릭 시 API 호출 등)을 거의 포함하지 않음.
- **Feature**: "무엇을 하는가? (Action)"에 집중. 사용자 시나리오이자 비즈니스 가치 (예: `UpdateProfile`). Entity를 import하여 조작함.

**Q. 같은 레이어의 슬라이스끼리 데이터를 공유해야 한다면?**

- 데이터를 필요로 하는 상위 레이어(Widget 또는 Page)에서 데이터를 조합하여 하위로 내려주거나 컴포지션 패턴을 사용합니다.
- 또는, 공통 로직을 하위 레이어(`shared` 등)로 내리거나 리팩토링을 고려합니다.

**Q. Widget이나 View에서 바로 DB를 조회해도 되나요?**

- 원칙적으로 안 됩니다. 특히 `prisma.<domain model>` 같은 도메인 쿼리는 `widgets/`, `views/`, `app/`가 직접 소유하면 안 됩니다.
- 상위 레이어는 하위 레이어의 API를 호출해 결과를 조합하는 역할만 합니다.
- 예외는 인증 세션, 전역 설정 같은 앱 부트스트랩 성격의 전역 인프라뿐입니다.
- 판단 기준이 애매하면 먼저 "이 쿼리가 특정 도메인 모델의 책임인가?"를 보고, 그렇다면 해당 `entities/*/api` 또는 `features/*/api`로 내립니다.

**Q. 커스텀 hook은 어디에 두어야 하나요?**

세그먼트 이름으로 `hooks`를 사용하는 것은 FSD 안티패턴입니다. **`hooks`는 구현 방식(essence)이지 목적(purpose)이 아니기 때문**입니다. 같은 hook이라도 목적에 따라 다른 세그먼트에 들어갑니다.

| Hook 종류 | 배치 위치 | 예시 |
|----------|----------|------|
| 도메인 비즈니스 로직 hook | 해당 슬라이스의 `model/` | `useUploadPodcast`, `useAuthSession` |
| 슬라이스 내부 전용 유틸 hook | 해당 슬라이스의 `lib/` | 해당 슬라이스에서만 쓰는 포맷팅 hook |
| 컴포넌트 강결합 상태 hook | 컴포넌트 파일 내부 (`ui/`) | 특정 다이얼로그 전용 `useDialogState` |
| 전역 유틸 hook | `shared/lib/` | `useDebounce`, `useMediaQuery` |

`hooks/`를 슬라이스 레벨 세그먼트로 만들거나, `model/hooks/`처럼 세그먼트 **내부에 별도 분류 폴더**로 두는 것 모두 같은 안티패턴입니다. "React hook으로 구현됐다"는 사실은 파일을 열면 알 수 있는 구현 디테일이며, 폴더 이름의 기준이 되어선 안 됩니다.

```
# ❌ 금지: hooks를 세그먼트로 사용
features/upload/
├── hooks/                ← 슬라이스 레벨 세그먼트로 금지
│   └── use-upload.ts
└── model/

# ❌ 금지: model 내부 분류 기준으로 hooks 사용
features/upload/
└── model/
    ├── hooks/            ← model 내부 분류 기준으로도 금지
    │   └── use-upload.ts
    └── schema/
        └── upload.ts

# ✅ 허용: 비즈니스 로직 hook은 model 안에 평탄하게
features/upload/
├── model/
│   ├── use-upload.ts
│   └── upload-schema.ts
└── ui/
```

**핵심 원칙**: hook은 비즈니스 로직을 담는 *그릇* 중 하나일 뿐, 비즈니스 로직 그 자체가 아닙니다. 동일한 도메인 로직이 내일 Zustand store나 pure function으로 바뀌어도 폴더 이름이 거짓말이 되지 않으려면, 폴더는 **목적(=도메인/책임)** 으로 명명되어야 합니다.

---

**Q. TypeScript 타입은 어디에 두어야 하나요?**

세그먼트 이름으로 `types`를 사용하는 것은 FSD 안티패턴입니다. 타입은 그 목적에 맞는 세그먼트 안에 배치합니다.

| 타입 종류 | 배치 위치 |
|----------|----------|
| 도메인 데이터 모델 타입 (`FavoriteItem`, `User` 등) | `model/types.ts` 또는 사용하는 훅/스토어 파일 내부 |
| Props 타입, Context 타입 | 해당 컴포넌트 파일 내부 (`ui/` 세그먼트) |
| API 응답 타입 | `api/` 세그먼트 내부 |
| 전역 공용 타입 | `shared/`의 목적 기반 세그먼트 (설정 관련 타입은 `shared/config`, 도메인 중립 유틸 타입은 `shared/lib`) |

`model/types.ts`처럼 **기존 세그먼트 내부 파일**로 `types.ts`를 두는 것은 허용됩니다. 금지되는 것은 슬라이스 레벨에 `types/`를 **별도 세그먼트**로 만드는 것입니다.

```
# ❌ 금지: types를 슬라이스 레벨 세그먼트로 사용
features/favorites/
├── model/
├── ui/
└── types/        ← 별도 세그먼트

# ✅ 허용: model 세그먼트 내부 파일로 배치
features/favorites/
├── model/
│   ├── use-favorites.ts
│   └── types.ts  ← model 세그먼트 내부 파일
└── ui/
```
