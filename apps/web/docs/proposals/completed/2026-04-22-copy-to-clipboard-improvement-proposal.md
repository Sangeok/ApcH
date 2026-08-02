---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-04-22"
approved-by: null
approved-at: null
approval-scope: null
completed-at: "2026-04-22"
verification-summary: "마이그레이션 전 문서. 개별 검증 기록 없음"
closed-at: null
closed-by: null
closed-reason: null
owners: []
related: []
---

# `copyToClipboard` 유틸리티 개선 제안

- **대상 파일**: `src/fsd/widgets/clip-display/lib/copy-to-clipboard.ts`
- **작성일**: 2026-04-22
- **상태**: 제안 (미반영)

## 배경

`copyToClipboard`는 Clipboard API를 얇게 감싼 유틸리티로, 성공/실패를 Result 패턴으로 반환한다. 현재 구현은 전반적으로 양호하나, 타입 안전성과 제어 흐름 측면에서 두 가지 개선 여지가 있다.

## 현재 코드

```ts
export async function copyToClipboard(
  text: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!navigator?.clipboard?.writeText) {
      throw new Error("Clipboard API not available");
    }
    await navigator.clipboard.writeText(text);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}
```

## 개선점 1. 판별 유니온(Discriminated Union)으로 반환 타입 변경

### 문제

반환 타입 `{ success: boolean; error?: string }`는 `success`와 `error`가 독립적으로 표현되어 다음과 같은 "불가능한 상태"가 타입상 허용된다.

- `{ success: true, error: "..." }` — 성공인데 에러 메시지 존재
- `{ success: false }` — 실패인데 에러 메시지 부재

호출부에서 `if (result.success)`로 분기해도 `result.error` 타입은 여전히 `string | undefined`로 남아, 타입 좁히기 효과가 약하다.

### 제안

`success` 값에 따라 구조가 달라지는 판별 유니온으로 정의한다.

```ts
type ClipboardResult =
  | { success: true }
  | { success: false; error: string };
```

이렇게 하면:

- `success: true`일 때 `error` 접근 자체가 타입 에러 → 잘못된 사용 사전 차단
- `success: false`일 때 `error`는 반드시 `string` → 옵셔널 체크 불필요
- 판별 유니온으로 IDE 자동 완성 및 타입 좁히기 정확도 향상

### 근거

- `typescript-clean-code` 원칙: "판별 유니온으로 불가능한 상태를 제거"
- `frontend-predictability` 원칙: "isLoading + error + data 조합처럼 불가능한 상태 조합이 타입에서 허용될 때" 개선 대상

## 개선점 2. `throw` 후 즉시 `catch`하는 패턴 제거

### 문제

Clipboard API 미지원 분기에서 `throw new Error(...)`를 던진 직후 같은 함수의 `catch`에서 받아 처리한다. 제어 흐름이 간접적이며 불필요한 `Error` 객체 생성이 발생한다.

```ts
if (!navigator?.clipboard?.writeText) {
  throw new Error("Clipboard API not available"); // 바로 아래 catch로 잡힘
}
```

### 제안

즉시 `return`으로 빠져나가 제어 흐름을 명확하게 한다. 다만, 현재 구현은 `try/catch` 안에서 `navigator` 접근을 수행하므로 브라우저 외 환경에서도 예외를 Result로 흡수하는 안전성이 있다. 리팩터링 후에도 이 특성은 유지해야 한다.

```ts
if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
  return { success: false, error: "Clipboard API not available" };
}
```

## 최종 제안 코드

```ts
type ClipboardResult =
  | { success: true }
  | { success: false; error: string };

export async function copyToClipboard(text: string): Promise<ClipboardResult> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return { success: false, error: "Clipboard API not available" };
  }
  try {
    await navigator.clipboard.writeText(text);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
```

## 2026-04-22 기준 환경 검토

- **Async Clipboard API (`navigator.clipboard.writeText`)**: 보안 컨텍스트(HTTPS / localhost)에서 모든 모던 브라우저가 안정 지원. 현재의 옵셔널 체이닝 가드만으로 충분하다.
- **`document.execCommand('copy')` 폴백**: deprecated이므로 추가하지 않는다.
- **권한 체크 (`navigator.permissions.query({ name: 'clipboard-write' })`)**: 사용자 제스처에 의해 호출되는 `writeText` 시나리오에서는 불필요하다.
- **브라우저 외 환경 안전성**: 리팩터링 시 `navigator`를 `try` 밖에서 접근한다면 `typeof navigator === "undefined"` 가드를 함께 두어 SSR / 테스트 환경에서 `ReferenceError`가 생기지 않도록 한다.

## 영향 범위

- 호출부 수정 필요성 여부 확인 대상: `src/fsd/widgets/clip-display/` 내부 `copyToClipboard` 사용처
- 반환 타입이 판별 유니온으로 바뀌면서, 현재 `result.error`를 `success`와 무관하게 읽는 코드가 있다면 타입 에러가 발생할 수 있음. 반영 시 호출부 전수 점검은 필요하다.
- 다만 현재 확인된 사용처들은 모두 `if (result.success) ... else ...` 형태로 분기하고 있어, 이번 타입 변경에 따른 실제 수정 범위는 크지 않을 가능성이 높다.

## 검증 메모

- 반영 전후로 `src/fsd/widgets/clip-display/` 내부 사용처에서 타입 오류가 없는지 확인한다.
- 가능하다면 브라우저 환경과 SSR / 테스트 환경에서 모두 `copyToClipboard`가 예외를 바깥으로 던지지 않고 Result를 반환하는지 점검한다.

## 반영 여부

본 문서는 제안 단계이며, 사용자 승인 후 코드에 반영한다.
