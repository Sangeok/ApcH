# UploadedFileActions 컴포넌트 리팩토링 문서

> 본 문서는 사전 대화에서 도출된 6개 개선 항목을 기반으로 작성되었다. 세부 항목은 구현 진행 중 검토·보완이 필요할 수 있다.

**대상 파일**: `src/fsd/features/upload/ui/index.tsx`
**규모**: 소규모 (단일 파일)
**유형**: 가독성/유지보수성 리팩토링

---

## 1. 배경/동기

`UploadedFileActions` 컴포넌트는 업로드 파일의 "재처리(Reprocess)"와 "삭제(Delete)" 두 서버 액션을 한 UI에 묶어 제공한다. 현재 구현은 동작상 기능은 한다. 다만 다음과 같이 코드를 읽는 사람이 **의도와 실제 동작을 일치시키기 어려운 지점**과 **구현 세부가 엉켜 있어 향후 확장 시 비용이 커지는 지점**이 존재한다.

- 두 버튼이 하나의 `isPending`을 공유해 어느 작업이 진행 중인지 UI가 구분하지 못한다.
- `confirm()` 다이얼로그가 `startTransition` 내부에 있어 다이얼로그 표시 중에도 전환 상태가 pending으로 유지된다.
- `run` 헬퍼가 성공 처리와 네비게이션(`/dashboard` push)을 하드코딩으로 결합해, 액션별로 성공 후 동작을 다르게 가져가려 하면 헬퍼를 우회해야 한다.

현재 컴포넌트에 세 번째 액션을 추가하거나, 재처리 성공 후 현재 페이지에 머물도록 요구사항이 변경되는 경우 `run` 함수 시그니처를 바꿔야 한다. 이를 선제적으로 정리한다.

---

## 2. 분석 결과

사전 대화에서 도출된 6개 항목을 심각도로 재분류한다.

### 2.1 [High] `confirm()`이 `startTransition` 내부에 존재

- **위치**: `src/fsd/features/upload/ui/index.tsx:35-41`
- **현상**: 브라우저 `confirm()`은 동기 블로킹 호출이다. `startTransition(async () => { ... confirm(...) ... })` 구조에서는 다이얼로그가 떠 있는 동안 `isPending`이 `true`로 유지된다. 사용자가 "취소"를 눌러도 아무 작업 없이 transition이 시작·종료된다.
- **영향**: 삭제 확인을 망설이는 동안 Reprocess·Manage 두 버튼이 모두 비활성화된 것처럼 보인다. 의도한 UX가 아니다.

### 2.2 [High] 두 액션이 `isPending` 하나를 공유

- **위치**: `src/fsd/features/upload/ui/index.tsx:28, 57, 65-69, 74-79`
- **현상**: `useTransition()` 하나를 두 액션이 모두 사용한다. Reprocess를 누르면 Manage 드롭다운 트리거에도 스피너가 나타나고, 반대도 마찬가지다.
- **영향**: 어느 작업이 실제로 실행되고 있는지 화면상 분별할 수 없다. 디버깅 시 "어느 버튼이 눌렸는가"를 로그/프로파일링 없이 확인하기 어렵다.

### 2.3 [Medium] `run` 헬퍼에 네비게이션이 하드코딩됨

- **위치**: `src/fsd/features/upload/ui/index.tsx:48-49`
- **현상**: 성공 시 `toast.success(successMessage); router.push("/dashboard");`가 헬퍼 내부에 고정되어 있다.
- **영향**: `run` 시그니처(`action`, `successMessage`, `confirmationMessage?`)만 봐서는 성공 후 페이지 이동이 일어난다는 것을 알 수 없다. 새 액션이 다른 후속 처리를 필요로 하면 헬퍼 자체를 확장하거나 우회해야 한다. 성공 처리와 네비게이션이라는 두 책임이 하나의 클로저에 묶여 있다.

### 2.4 [Low] 스피너/아이콘 토글 패턴 중복

- **위치**: `src/fsd/features/upload/ui/index.tsx:65-69, 75-79`
- **현상**: `isPending ? <Loader2 ... /> : <Icon ... />` 패턴이 버튼마다 반복된다.
- **영향**: 구조적 위험은 없으나 JSX 밀도가 높고, 버튼이 늘어날수록 동일 패턴이 늘어난다.

### 2.5 [Low] 파괴적 작업에 브라우저 네이티브 `confirm()` 사용

- **위치**: `src/fsd/features/upload/ui/index.tsx:37`
- **현상**: shadcn 기반 `dropdown-menu`가 사용되고 있으므로 같은 계열의 `alert-dialog`를 쓸 수 있는 환경이지만, 현재는 브라우저 기본 다이얼로그를 쓴다.
- **영향**: 디자인 시스템 일관성, 스타일링 가능성, 테스트 용이성, 접근성 측면에서 열등하다. 단, **현재 `src/fsd/shared/ui/atoms/`에 `alert-dialog.tsx`가 존재하지 않는다**. 이 개선은 해당 atom을 신규 추가하는 선행 작업이 필요하다.

### 2.6 [Low] 파일명·심볼명 불일치 (컨벤션 선택 사항)

- **위치**: `src/fsd/features/upload/ui/index.tsx` (export: `UploadedFileActions`)
- **현상**: 현재 `upload/ui/`에는 단일 파일 `index.tsx`만 존재한다. 한편 동일 레이어의 다른 feature인 `src/fsd/features/billing/ui/`는 **PascalCase 명시 파일명**(`OrderHistory.tsx`, `BillingPage.tsx`, `PlanCard.tsx`, `SubscriptionStatus.tsx`)을 사용한다. 즉 프로젝트의 `features/*/ui/` 실제 컨벤션은 "단일 컴포넌트일 때 `index.tsx`, 복수 컴포넌트일 때 PascalCase 명시 파일명"의 혼합 패턴이며, **kebab-case를 쓰는 feature는 0개**다.
- **영향**: 기능에는 영향 없음. 현재 `index.tsx` 그대로 두는 것이 기존 패턴에 부합한다. rename을 원한다면 `UploadedFileActions.tsx`(PascalCase)가 컨벤션상 일관된 선택이다.

---

## 3. 목표 상태

### 목표

- 각 액션이 독립적인 pending 상태를 갖는다. 하나의 버튼을 눌러도 다른 버튼의 시각적 상태는 변하지 않는다.
- 확인 다이얼로그는 transition 시작 이전에 처리되며, 사용자가 취소한 경우 어떤 transition도 시작되지 않는다.
- 성공 시 후속 동작(네비게이션, 토스트 외 추가 처리)은 호출부에서 주입 가능하다. 공용 헬퍼는 실행·결과 판정에만 책임을 진다.
- 기존 동작(Reprocess 성공 → `/dashboard` 이동, Delete 성공 → `/dashboard` 이동, 실패 시 toast로 오류 표시)은 전부 유지된다.

### 비목표

- 서버 액션(`reprocessUploadedFile`, `deleteUploadedFileWithClips`)의 시그니처 및 내부 `revalidatePath` 로직은 변경하지 않는다.
- `/dashboard`로의 네비게이션 자체를 제거하지 않는다. 호출부에서 명시적으로 호출되도록 이전시키기만 한다.
- 토스트 라이브러리(`sonner`) 교체는 범위 밖이다.
- 재처리 진행 상태를 서버에서 실시간 폴링하거나 WebSocket으로 받는 것은 범위 밖이다.

### 성공 기준

- `tsc --noEmit` 통과
- `next build` 성공
- 수동 회귀 확인 항목 전부 통과 (§9 참조)
- Reprocess 버튼 클릭 시 Manage 버튼의 시각적 상태(아이콘/비활성 여부)가 변하지 않음
- Delete 확인 다이얼로그 취소 시 이후 상태가 초기와 동일 (버튼 정상, transition 미실행)

---

## 5. 구현 계획

### 5.1 확인 로직을 transition 외부로 이동 + 성공 콜백 주입형 헬퍼 도입

**Before** (`src/fsd/features/upload/ui/index.tsx:30-51`)

```tsx
const run = (
  action: () => Promise<ActionResult<void>>,
  successMessage: string,
  confirmationMessage?: string,
) => {
  startTransition(async () => {
    if (confirmationMessage) {
      const confirmed = confirm(confirmationMessage);
      if (!confirmed) {
        return;
      }
    }

    const result = await action();
    if (!result.success) {
      toast.error(result.error ?? "Request failed");
      return;
    }
    toast.success(successMessage);
    router.push("/dashboard");
  });
};
```

**After** (같은 파일, 책임 분리 — `runAction`은 **모듈 레벨**에 배치한다)

```tsx
// 파일 상단 import 블록 바로 아래, 컴포넌트 정의 밖.
// 컴포넌트 상태를 전혀 캡처하지 않으므로 모듈 레벨이 적절하다.

type RunOptions = {
  action: () => Promise<ActionResult<void>>;
  successMessage: string;
  confirmationMessage?: string;
  onSuccess?: () => void;
  startTransition: ReturnType<typeof useTransition>[1];
};

const runAction = ({
  action,
  successMessage,
  confirmationMessage,
  onSuccess,
  startTransition,
}: RunOptions) => {
  if (confirmationMessage && !confirm(confirmationMessage)) {
    return;
  }

  startTransition(async () => {
    const result = await action();
    if (!result.success) {
      toast.error(result.error ?? "Request failed");
      return;
    }
    toast.success(successMessage);
    onSuccess?.();
  });
};
```

변경 요지:
- `confirm()`을 `startTransition` **밖**으로 이동. 취소 시 transition 자체가 시작되지 않는다.
- `router.push("/dashboard")`를 헬퍼에서 제거하고 `onSuccess` 콜백으로 위임.
- `startTransition`을 인자로 받도록 하여, 호출부에서 **액션별 transition**을 넘길 수 있게 한다 (→ 5.2에서 사용).
- 타입은 `ReturnType<typeof useTransition>[1]`로 React 공식 시그니처를 직접 참조한다. 구조적 중복 선언을 피하고, React 버전 업데이트 시 드리프트 위험을 제거한다.
- `runAction`은 컴포넌트 상태를 캡처하지 않으므로 모듈 레벨에 둔다. 매 렌더마다 새 클로저가 생성되지 않고, "컴포넌트 의존 로직이 아닌 순수 실행 헬퍼"임이 배치로 드러난다.
- 이름을 `run` → `runAction`으로 변경. "무엇을 실행하는가"를 명시.

### 5.2 액션별 pending 상태 분리

**Before** (`src/fsd/features/upload/ui/index.tsx:24-28`)

```tsx
export default function UploadedFileActions({
  uploadedFileId,
}: UploadedFileActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
```

**After**

```tsx
export default function UploadedFileActions({
  uploadedFileId,
}: UploadedFileActionsProps) {
  const router = useRouter();
  const [isReprocessing, startReprocessTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();
```

변경 요지:
- Reprocess·Delete에 각각 독립적인 transition을 부여.
- 버튼 `disabled` 조건은 `isReprocessing || isDeleting`으로 묶어 "다른 액션이 진행 중일 때 새 액션을 시작하지 못하게" 하는 안전장치는 유지한다. 단, **아이콘 토글(스피너 표시)은 해당 액션의 pending만 보도록** 한다.

### 5.3 버튼 JSX 갱신 (onSuccess 주입 + 개별 pending 사용)

**After** (`src/fsd/features/upload/ui/index.tsx:53-100` 재작성 — 아래 블록은 전부 `UploadedFileActions` 컴포넌트 **함수 본문 내부**에 위치한다)

```tsx
// inside UploadedFileActions(): after the two useTransition() declarations

const anyPending = isReprocessing || isDeleting;

const handleReprocess = () => {
  runAction({
    action: () => reprocessUploadedFile(uploadedFileId),
    successMessage: "Reprocessing started",
    onSuccess: () => router.push("/dashboard"),
    startTransition: startReprocessTransition,
  });
};

const handleDelete = () => {
  runAction({
    action: () => deleteUploadedFileWithClips(uploadedFileId),
    successMessage: "Original File and clips deleted",
    confirmationMessage:
      "Are you sure you want to delete the file and all associated clips?",
    onSuccess: () => router.push("/dashboard"),
    startTransition: startDeleteTransition,
  });
};

return (
  <div className="flex items-center gap-2">
    <Button variant="outline" disabled={anyPending} onClick={handleReprocess}>
      {isReprocessing ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <RefreshCw className="mr-2 h-4 w-4" />
      )}
      Reprocess
    </Button>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" disabled={anyPending}>
          {isDeleting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <MoreHorizontal className="mr-2 h-4 w-4" />
          )}
          Manage
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          className="text-destructive"
          onClick={handleDelete}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete detail
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
);
```

변경 요지:
- 인라인 화살표 호출 대신 명시적 `handleReprocess`/`handleDelete` 핸들러. onClick 포인터를 간결화.
- `disabled`는 공용(`anyPending`), 아이콘은 액션별 pending을 참조 → "다른 작업 중 새 작업 금지"와 "어느 작업이 돌고 있는지 표시"를 동시에 만족.
- `onSuccess` 콜백으로 `/dashboard` 네비게이션을 **호출부에서 명시**.

### 5.4 (선택) 스피너/아이콘 토글 추상화

Low 우선순위. 도입 시 `LucideIcon` 타입을 위한 import를 상단에 추가한다 (프로젝트 내 동일 패턴: `src/fsd/pages/home/model/types.ts:1`):

```tsx
import type { LucideIcon } from "lucide-react";
```

그리고 다음 컴포넌트를 같은 파일 상단 또는 동일 feature 내 별도 파일로 배치한다:

```tsx
function ButtonLeadIcon({
  pending,
  Icon,
}: {
  pending: boolean;
  Icon: LucideIcon;
}) {
  const Component = pending ? Loader2 : Icon;
  const className = pending
    ? "mr-2 h-4 w-4 animate-spin"
    : "mr-2 h-4 w-4";
  return <Component className={className} />;
}
```

사용 예:

```tsx
<Button variant="outline" disabled={anyPending} onClick={handleReprocess}>
  <ButtonLeadIcon pending={isReprocessing} Icon={RefreshCw} />
  Reprocess
</Button>
```

이 단계는 버튼이 3개 이상으로 늘어날 때 도입을 권장한다. 현재는 두 곳뿐이라 즉시 필요하지는 않다.

### 5.5 (선택·별도 PR 권장) AlertDialog 도입

- `src/fsd/shared/ui/atoms/alert-dialog.tsx` 신규 추가(shadcn CLI 또는 Radix `@radix-ui/react-alert-dialog` 기반).
- `deleteUploadedFileWithClips` 트리거 시 `confirm()` 대신 `AlertDialog`를 사용.
- 신규 atom 추가가 선행되어야 하므로 **본 리팩토링과는 별도 PR로 분리**할 것을 권한다. 본 PR에서는 5.1의 "`confirm()`을 transition 밖으로" 까지만 수행해도 2.1의 실제 동작 이슈는 해소된다.

### 5.6 (선택) 파일명 정리

- 프로젝트 실제 컨벤션은 **단일 컴포넌트는 `ui/index.tsx`, 복수 컴포넌트는 PascalCase 명시 파일명**(참고: `src/fsd/features/billing/ui/*.tsx`)이다. kebab-case 사용 feature는 없다.
- 현재 `upload/ui/`는 단일 컴포넌트이므로 `index.tsx` 유지가 컨벤션에 부합한다.
- 명시적 이름을 원하는 경우 `ui/UploadedFileActions.tsx`(PascalCase)로 rename하고 호출부(`src/fsd/pages/upload-detail/ui/index.tsx:13`)의 import 경로를 `~/fsd/features/upload/ui/UploadedFileActions`로 동기화한다.

---

## 6. 실행 순서

각 Phase는 독립적으로 빌드/타입체크가 통과하며, 시스템 동작이 깨지지 않는 단위로 구성한다.

각 Phase는 **단일 PR 단위**로 완성되어야 하며, Phase 종료 시점에 기존 동작(재처리 성공·삭제 성공 후 `/dashboard` 이동 포함)이 전부 유지되어야 한다. Phase 사이에 "중간적으로만 존재하는 runtime 회귀"를 만들지 않는다.

> **Phase 1 단독 배포 가능성**: Phase 1만 머지해도 §2.1(`confirm()` 배치)과 §2.3(헬퍼에 네비게이션 하드코딩) 두 이슈가 해소된다. §2.2(공유 `isPending`)는 여전히 남지만 기존 동작과 동일 수준이므로 회귀가 아니다. Phase 2가 당장 준비되지 않더라도 Phase 1은 단독으로 ship 가능한 완결 단위다.

### Phase 1: `confirm()` 위치 이동 + 성공 후 동작을 호출부로 이전 (§5.1 + §5.3의 호출부 onSuccess 부분)

- **작업 내용**:
  1. §5.1의 `runAction`을 도입한다 — `RunOptions`에 `onSuccess?`, `startTransition`을 포함한 완전한 형태로 적용한다.
  2. `confirm()`을 `startTransition` 밖으로 이동한다.
  3. 기존 `run(action, successMessage, confirmationMessage?)` 인라인 호출 2곳을 `runAction({...})` 호출로 교체하고, 두 호출부 모두 `onSuccess: () => router.push("/dashboard")`를 **반드시 포함**한다.
  4. 이 Phase에서는 `useTransition`을 아직 분리하지 않는다. 기존 단일 `[isPending, startTransition]`을 그대로 두 호출부에 주입한다 (`runAction`은 `startTransition`을 인자로 받으므로 시그니처는 호환된다).
- **이 Phase에서 의도적으로 하지 않는 것**: 액션별 pending 분리(§5.2), 스피너 추상화(§5.4), AlertDialog 도입(§5.5), 파일명 변경(§5.6).
- **검증**:
  - `pnpm tsc --noEmit` 통과.
  - 수동 ①: Delete 클릭 → 확인 다이얼로그 표시 중 Reprocess 버튼이 **즉시 비활성 상태가 되지 않음** (= transition이 아직 시작되지 않음). 취소 시 상태 원복, 이후 다른 버튼 정상 동작.
  - 수동 ②: **Reprocess 성공 후 `/dashboard`로 이동, Delete 성공 후 `/dashboard`로 이동** — 기존 동작 유지 여부를 반드시 확인(본 Phase의 리그레션 방지 핵심 체크).
  - 수동 ③: 서버 액션 실패 응답 모의 시 토스트 에러가 뜨고 페이지 이동이 일어나지 않음.

### Phase 2: 액션별 pending 분리 (§5.2 + §5.3의 JSX 재작성)

- **작업 내용**: `useTransition`을 `[isReprocessing, startReprocessTransition]`과 `[isDeleting, startDeleteTransition]` 두 개로 분리한다. 두 핸들러는 각각의 `startTransition`을 `runAction`에 주입한다. JSX를 §5.3 형태로 갱신하여 `disabled={anyPending}` 유지, 아이콘 토글은 개별 pending 참조.
- **이 Phase에서 의도적으로 하지 않는 것**: 스피너 추상화(§5.4), AlertDialog 도입(§5.5), 파일명 변경(§5.6).
- **검증**:
  - `pnpm tsc --noEmit` 통과, `pnpm build` 성공.
  - 수동 ①: Reprocess 클릭 시 Manage 버튼의 아이콘이 `MoreHorizontal`로 유지되고 스피너가 표시되지 않음. Delete 실행 중 Reprocess 버튼의 아이콘이 `RefreshCw`로 유지됨.
  - 수동 ②: 한 액션이 진행 중일 때 다른 버튼은 `disabled` 상태로 클릭이 무시됨.
  - 수동 ③: Phase 1의 `/dashboard` 네비게이션이 여전히 정상 수행됨 (리그레션 없음 확인).

### Phase 3 (선택): 스피너 추상화 / 파일명 정리 / AlertDialog 도입

- **작업 내용**: §5.4, §5.6, §5.5 중 팀이 필요로 하는 항목만 선택적 수행. AlertDialog는 atom 신규 추가(`src/fsd/shared/ui/atoms/alert-dialog.tsx`)가 선행되므로 별도 PR로 분리 권장.
- **검증**: 각 하위 작업 단위로 빌드·수동 회귀. 특히 §5.6 파일명 변경을 적용하면 호출부(`src/fsd/pages/upload-detail/ui/index.tsx:13`)의 import 경로 갱신 여부를 확인.

---

## 9. 검증 · 리스크 · 롤백

> 소규모 리팩토링 문서 규칙상 §8(리스크·롤백) 내용을 §9에 통합 수록한다.

### 9.1 자동 검증

- `pnpm tsc --noEmit` (또는 프로젝트 스크립트) → 타입 무결성.
- `pnpm build` (Next.js 프로덕션 빌드) → 서버 컴포넌트 경계 및 `"use client"` 유효성 확인.

### 9.2 수동 회귀 체크리스트

기존 동작 유지 여부:

- [ ] Reprocess 클릭 → 서버 성공 시 `Reprocessing started` 토스트 + `/dashboard` 이동.
- [ ] Reprocess 클릭 → 서버 실패 시(이미 처리 중 상태 등) 실패 메시지 토스트, 페이지 이동 없음.
- [ ] Delete detail 클릭 → 확인 다이얼로그 표시. 취소 시 아무 일도 일어나지 않음.
- [ ] Delete detail 클릭 → 확인 후 서버 성공 시 `Original File and clips deleted` 토스트 + `/dashboard` 이동.

신규/수정된 동작:

- [ ] Reprocess 진행 중 Manage 버튼은 **스피너 없이** `MoreHorizontal` 아이콘을 유지하나, `disabled`로는 눌리지 않는다.
- [ ] Delete 진행 중 Reprocess 버튼은 **스피너 없이** `RefreshCw` 아이콘을 유지하나, `disabled`로는 눌리지 않는다.
- [ ] 서버 액션 실패 응답 시 `onSuccess` 콜백(네비게이션)이 실행되지 않는다.
- [ ] Delete 확인 다이얼로그가 열려 있는 동안 transition이 시작되지 않는다.
  - *관측성 주의*: `confirm()`은 모달 동기 블로킹이므로 대화 중 페인트가 얼어 `isPending` 플립이 육안으로 잘 보이지 않을 수 있다. 코드 리뷰 시 `runAction` 내부에서 `confirm()`이 `startTransition` 호출**보다 먼저** 위치하는지를 정적으로 확인하는 쪽이 신뢰도가 높다. 필요 시 React DevTools Profiler로 transition 시작 시점을 관측한다.

### 9.3 리스크

- **누락 리스크**: Phase 1에서 두 호출부(`handleReprocess`, `handleDelete`) 중 하나라도 `onSuccess: () => router.push("/dashboard")`가 빠지면 해당 액션 후 네비게이션이 사라진다 — 기존 동작이 깨지는 리그레션. 코드리뷰 체크리스트에 "두 호출부 모두 `onSuccess` 존재"를 고정 항목으로 둔다.
- **전파 리스크**: 없음. 본 변경은 단일 파일(`src/fsd/features/upload/ui/index.tsx`) 내부에 한정된다. 서버 액션 API, `shared/ui/atoms/*`, 호출부(`src/fsd/pages/upload-detail/ui/index.tsx`)의 import 계약은 불변 (Phase 3 §5.6 파일명 변경을 적용하는 경우에만 import 경로 동기화 필요).

### 9.4 롤백

- 파일 단위 변경이므로 해당 커밋 revert만으로 완전 복구된다.
- 서버 액션·공용 atom 수정이 없으므로 사이드이펙트가 없다.
- Phase 1·2는 각각 독립 PR이므로 Phase 2에서 문제가 발생하면 Phase 2 커밋만 revert하여 Phase 1 상태로 돌아갈 수 있다.
