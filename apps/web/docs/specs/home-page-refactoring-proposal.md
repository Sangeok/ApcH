# Home Page Refactoring Proposal

> 대상: `src/fsd/pages/home/`
> 작성일: 2026-04-03
> 근거 스킬: typescript-clean-code, frontend-predictability, frontend-cohesion, naming-conventions, frontend-readability, frontend-coupling, frontend-file-naming

---

## 1. 타입 네이밍 컨벤션 위반 (naming-conventions)

**파일**: `model/type.ts:18`

```typescript
// AS-IS
export type heroHighlight = {
  label: string;
  value: string;
  footnote: string;
};
```

`heroHighlight`만 camelCase이고 같은 파일의 `FeatureCard`, `WorkflowStep`은 PascalCase이다. TypeScript 타입/인터페이스는 PascalCase가 표준 컨벤션이다.

**TO-BE**:
```typescript
export type HeroHighlight = {
  label: string;
  value: string;
  footnote: string;
};
```

`constants/index.ts`의 참조도 함께 수정 필요.

**영향 범위**: `model/type.ts`, `constants/index.ts`

---

## 2. 컴포넌트 응집도 부족 — 단일 파일에 6개 섹션 (frontend-cohesion, frontend-readability)

**파일**: `ui/index.tsx` (255 lines)

`HomePage` 컴포넌트 하나에 header, hero, features, workflow, CTA, footer 6개 섹션이 인라인 JSX로 작성되어 있다. FSD pages 레이어는 위젯/피처를 **조합(orchestration)** 하는 역할인데, 현재는 모든 렌더링 로직을 직접 수행하고 있다.

**TO-BE**: 섹션별 하위 컴포넌트로 분리 (기존 프로젝트 컨벤션 준수)

```
home/
  ui/
    index.tsx                    # 조합만 담당
    _component/
      HeroSection.tsx
      FeaturesSection.tsx
      WorkflowSection.tsx
      CtaSection.tsx
```

> **컨벤션 근거**: 기존 widgets에서 서브 컴포넌트는 `ui/_component/` 하위에 PascalCase로 배치한다 (`ClipActions.tsx`, `ClipCard.tsx`, `ScriptModal.tsx` 등). kebab-case 파일명(`hero-section.tsx`)이나 `ui/` 직접 배치는 프로젝트 기존 패턴과 불일치하므로 따르지 않는다.

header와 footer는 아래 3, 4번에서 별도 처리.

**⚠️ 실행 순서**: 이 항목은 **항목 3(header widget 추출) 완료 후** 진행해야 한다. 항목 3이 header를 제거하므로, 순서가 뒤바뀌면 분리 작업을 다시 해야 한다.

---

## 3. FSD 레이어 위반 — page에서 인증 로직 직접 호출 (frontend-coupling, frontend-predictability)

**파일**: `ui/index.tsx:24, 81`

```typescript
import { signOut } from "next-auth/react";
// ...
onClick={() => signOut({ redirectTo: "/login" })}
```

`signOut`은 비즈니스 로직(인증)이며, page 레이어에서 직접 호출하면:
- **coupling**: page가 `next-auth/react`에 직접 의존
- **predictability**: `HomePage`라는 이름에서 로그아웃 동작이 예측되지 않음

header + 인증 드롭다운은 이미 독립적인 UI 블록이므로 `widgets/` 레이어로 분리해야 한다.

**TO-BE**: 기존 `widgets/dashboard-header/` 패턴처럼 `widgets/site-header/` 위젯으로 추출

```
widgets/
  site-header/
    ui/
      index.tsx    # Avatar, DropdownMenu, signOut 로직 포함
```

`HomePage`에서는 `<SiteHeader isLoggedIn={...} email={...} image={...} />` 호출만 수행.

**⚠️ DashboardHeader와의 중복 고려**: `widgets/dashboard-header/ui/index.tsx`에 Avatar 드롭다운 + signOut + Billing 링크가 이미 동일한 패턴으로 존재한다. 두 위젯을 독립적으로 유지하면 signOut 로직이나 드롭다운 구조 변경 시 두 곳을 동시에 수정해야 한다. 공통 드롭다운을 `shared/ui/atoms/user-dropdown/` 등으로 추출하는 것을 권장한다.

**⚠️ `"use client"` 제거 필수**: 이 항목 완료 후 `ui/index.tsx`에서 `"use client"` 지시어를 **반드시 제거**해야 한다. 현재 `"use client"`가 필요한 이유는 오직 `signOut` (next-auth/react) 때문이며, header가 widget으로 추출되면 `HomePage`에 남는 섹션(hero, features, workflow, CTA)은 순수 프레젠테이셔널이므로 Server Component로 전환할 수 있다. 제거하지 않으면 모든 하위 섹션 컴포넌트가 불필요하게 클라이언트 번들에 포함되어 JS 번들 증가 및 서버 사이드 렌더링 최적화 손실이 발생한다.

---

## 4. Footer 중복 제거 (frontend-cohesion)

**파일**: `ui/index.tsx:241-251`

이용약관/개인정보처리방침 footer가 이미 **3곳에 중복 존재**한다:

| 페이지 | 위치 |
|--------|------|
| `home/ui/index.tsx` | line 241-251 |
| `app/terms/page.tsx` | line 237-254 |
| `app/privacy/page.tsx` | line 374-391 |

한 곳만 수정하면 나머지가 불일치하는 유지보수 문제가 현재 이미 존재한다.

**TO-BE**: `widgets/site-footer/ui/index.tsx`로 추출 후 3곳 모두 교체

**우선순위**: 중간 (중복이 이미 3곳에 존재하므로 낮음에서 상향)

---

## 5. 불필요한 `as const` 단언 (typescript-clean-code)

**파일**: `constants/index.ts:13,29`

```typescript
export const heroHighlights: heroHighlight[] = [
  // ...
] as const;
```

타입 어노테이션 `heroHighlight[]`이 이미 적용되어 있으므로 `as const`는 실질적으로 무효하다. 타입 어노테이션이 `as const`의 readonly tuple 추론을 덮어쓴다. 오해를 유발하는 코드이다.

**TO-BE**: 두 가지 중 택 1
- (A) `as const` 제거: `export const heroHighlights: HeroHighlight[] = [...]`
- (B) 타입 어노테이션 제거하고 `as const satisfies`로 전환 (readonly가 필요한 경우):
  ```typescript
  export const heroHighlights = [...] as const satisfies readonly HeroHighlight[];
  ```

현재 데이터가 변경될 이유가 없으므로 (A)가 단순하다.

---

## 6. 파일 네이밍 (frontend-file-naming)

**파일**: `model/type.ts`

단수형 `type.ts`는 파일 안에 여러 타입이 존재할 때 부자연스럽다. 프로젝트 내 다른 모듈의 관례와 비교 필요.

**TO-BE**: `model/types.ts` (복수형) — 프로젝트 전체 관례에 맞춰 결정

**현황**: 프로젝트 내 `type.ts`(단수) 2개 (`home/`, `uploadDetail/`), `types.ts`(복수) 1개 (`features/billing/`). 다수파가 단수형이므로 **변경 불필요**. 변경할 경우 `pages/uploadDetail/model/type.ts`도 함께 변경해야 일관성이 유지된다.

**우선순위**: 낮음 (프로젝트 관례가 단수형이면 유지)

---

## 요약 — 우선순위별 정리

| # | 항목 | 스킬 근거 | 우선순위 | 변경 범위 |
|---|------|----------|----------|----------|
| 1 | `heroHighlight` → `HeroHighlight` | naming-conventions | **높음** | type.ts, constants/index.ts |
| 2 | 섹션별 하위 컴포넌트 분리 | cohesion, readability | **중간** | ui/_component/ 디렉토리 |
| 3 | header + signOut → widget 분리 + `"use client"` 제거 | coupling, predictability | **높음** | ui/index.tsx → widgets/, DashboardHeader 중복 고려 |
| 4 | footer 중복 제거 → widget 분리 | cohesion | **중간** | home, terms, privacy 3곳 교체 |
| 5 | 불필요한 `as const` 제거 | typescript-clean-code | **높음** | constants/index.ts |
| 6 | `type.ts` → `types.ts` | frontend-file-naming | **낮음** | 단수형 다수파이므로 유지 권장. 변경 시 uploadDetail도 함께 변경 |

---

## 실행 순서

항목 간 의존성을 고려한 권장 실행 순서:

```
Phase 1 (독립 — 병렬 가능):  항목 1, 항목 5
Phase 2:                     항목 3 (header widget 추출 + "use client" 제거)
Phase 3:                     항목 2 (섹션 분리 — 항목 3 완료 후 진행)
Phase 4:                     항목 4 (footer 중복 제거 — 3곳 교체)
Phase 5 (선택):              항목 6
```

- 항목 1, 5는 다른 항목과 의존성이 없으므로 언제든 수행 가능
- **항목 3 → 항목 2 순서 필수**: 항목 3이 header를 제거하므로, 항목 2에서 분리할 대상이 달라짐
- 항목 4는 중복이 3곳에 이미 존재하므로 진행 권장
- 항목 6은 필요 시 진행
