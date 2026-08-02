# clip-display 위젯 리팩토링 제안서

## 개요

| 항목 | 내용 |
|------|------|
| 대상 | `src/fsd/widgets/clip-display/` |
| 분석 기준 | TypeScript Clean Code, Frontend Predictability, Cohesion, Naming Conventions, Readability, Coupling, File Naming |
| 발견 항목 | HIGH 5 / MEDIUM 5 / LOW 2 (총 12건) |
| 관련 파일 | `ClipCard.tsx`, `ClipActions.tsx`, `ScriptModal.tsx`, `YoutubeMetadataModal.tsx`, `ClipVideoPlayer.tsx`, `useClipPlayUrl.ts` |

---

## 잘된 점

- **Optimistic delete**: `useOptimistic`을 활용한 즉각적 UI 반응이 깔끔함
- **공유 디자인 시스템 활용**: `Button`, `DropdownMenu` 등 atoms를 일관되게 사용
- **적절한 컴포넌트 분리**: Card/Actions/VideoPlayer/Modal 분리로 각 컴포넌트가 단일 책임 유지
- **접근성**: `ScriptModal`에 `role="dialog"`, `aria-modal`, `aria-labelledby`, Escape 키 핸들링, 포커스 관리 적용
- **Empty state 처리**: `ClipDisplay`에서 빈 배열에 대한 가드가 깔끔함

---

## HIGH Priority

### 1. `handleCopyScript` 로직 2곳 완전 중복

**스킬**: TypeScript Clean Code, Frontend Cohesion  
**위치**: `ClipCard.tsx:40-56`, `ScriptModal.tsx:46-62`

**현재 코드** (두 파일 모두 동일):
```typescript
const handleCopyScript = async () => {
  if (!hasScript) {
    toast.error("Script is not available yet.");
    return;
  }
  try {
    if (!navigator?.clipboard?.writeText) {
      throw new Error("Clipboard API not available");
    }
    await navigator.clipboard.writeText(scriptText);
    toast.success("Copied script.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    toast.error("Failed to copy script: " + message);
  }
};
```

**문제**: 17줄의 동일한 비동기 로직이 두 파일에 복사되어 있다. 에러 처리 방식을 변경하면 양쪽 모두 수정해야 한다. `scriptText`, `hasScript` 파생 상태도 두 곳에서 각각 계산 중 (`ClipCard.tsx:24-25`, `ScriptModal.tsx:19-20`).

또한 `YoutubeMetadataModal.tsx:39-54`의 `handleCopyMetadata`는 유사한 클립보드 로직이지만 `navigator?.clipboard?.writeText` 존재 여부 체크가 **누락**되어 있다.

**개선안**: 클립보드 복사 유틸리티를 위젯 내부 `lib/`에 추출한다.

```typescript
// src/fsd/widgets/clip-display/lib/copy-to-clipboard.ts
import { toast } from "sonner";

export async function copyToClipboard(text: string, label: string): Promise<boolean> {
  try {
    if (!navigator?.clipboard?.writeText) {
      throw new Error("Clipboard API not available");
    }
    await navigator.clipboard.writeText(text);
    toast.success(`Copied ${label}.`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    toast.error(`Failed to copy ${label}: ${message}`);
    return false;
  }
}
```

```typescript
// ClipCard.tsx, ScriptModal.tsx (개선 후)
import { copyToClipboard } from "~/fsd/widgets/clip-display/lib/copy-to-clipboard";

const handleCopyScript = async () => {
  if (!hasScript) {
    toast.error("Script is not available yet.");
    return;
  }
  await copyToClipboard(scriptText, "script");
};
```

```typescript
// YoutubeMetadataModal.tsx (개선 후) — CopiedField 타입은 Finding #8에서 정의
import { copyToClipboard } from "~/fsd/widgets/clip-display/lib/copy-to-clipboard";

const handleCopyMetadata = async (field: CopiedField, value: string) => {
  if (!value) {
    toast.error(`${field} is not available.`);
    return;
  }
  const copied = await copyToClipboard(value, field.toLowerCase());
  if (copied) {
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }
};
```

**효과**: 클립보드 에러 처리 로직 한 곳 집중. `YoutubeMetadataModal`의 `navigator?.clipboard?.writeText` 체크 누락도 해결. `boolean` 반환으로 성공 시에만 "Copied!" UI 상태가 표시됨 (실패 시 toast.error만 표시).

> **⚠️ UX 변화 (의도적)**: `handleCopyMetadata`의 에러 toast 메시지가 변경됨.
> - 변경 전: `"Failed to copy: ${message}"`
> - 변경 후: `"Failed to copy ${field.toLowerCase()}: ${message}"` (예: `"Failed to copy title: ..."`)
>
> 버그가 아닌 개선이지만, 사전에 인지할 것.

---

### 2. `youtubeHashtags` JSON 파싱 2곳 중복

**스킬**: TypeScript Clean Code, Frontend Cohesion  
**위치**: `ClipCard.tsx:27-34`, `YoutubeMetadataModal.tsx:30-37`

**현재 코드** (두 파일 모두 동일):
```typescript
const youtubeHashtags: string[] = useMemo(() => {
  if (!clip.youtubeHashtags) return [];
  try {
    return JSON.parse(clip.youtubeHashtags) as string[];
  } catch {
    return [];
  }
}, [clip.youtubeHashtags]);
```

**문제**: `JSON.parse() as string[]`는 런타임 검증 없는 타입 단언이다. 동일 로직이 두 곳에 중복.

> **메인 제안서 연계**: `docs/proposals/refactoring-proposal.md`에서 이미 `parseJsonArray<T>()`를 `shared/lib/utils.ts`에 추가하는 것이 제안되어 있다 (Finding 4, Phase 1).

**개선안**: `parseJsonArray<T>()`가 구현되면 해당 유틸을 사용한다.

```typescript
// ClipCard.tsx, YoutubeMetadataModal.tsx 모두
import { parseJsonArray } from "~/fsd/shared/lib/utils";

const youtubeHashtags = useMemo(
  () => parseJsonArray<string>(clip.youtubeHashtags),
  [clip.youtubeHashtags],
);
```

**효과**: 중복 제거 + `Array.isArray()` 가드 추가로 부분적 런타임 안전성 확보. 8줄 x 2곳 → 1줄 x 2곳으로 축소.

---

### 3. YoutubeMetadataModal 373줄 — 복사 버튼 패턴 3회 반복 (+ Copy All 별도)

**스킬**: Frontend Readability, TypeScript Clean Code  
**위치**: `YoutubeMetadataModal.tsx:186-206` (Title), `254-277` (Description), `311-332` (Hashtags)  
+ Footer `348-366` (Copy All)은 별도 — `variant="default"`, 파라미터 없는 `handleCopyAllMetadata()` 사용으로 나머지 3곳과 다름

**현재 코드** (Title/Description/Hashtags 3곳 동일 구조, 필드명만 다름 — Copy All 버튼 제외):
```tsx
<Button
  variant="secondary"
  size="sm"
  className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 font-semibold transition-all duration-200 hover:from-amber-500/20 hover:to-orange-500/20 hover:shadow-lg"
  onClick={() => handleCopyMetadata("Title", clip.youtubeTitle ?? "")}
>
  <div className="absolute inset-0 bg-gradient-to-r from-amber-500/0 via-amber-500/20 to-amber-500/0 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
  {copiedField === "Title" ? (
    <>
      <Check className="animate-in zoom-in mr-2 h-4 w-4 duration-200" />
      Copied!
    </>
  ) : (
    <>
      <Copy className="mr-2 h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
      Copy Title
    </>
  )}
</Button>
```

문자 수 카운터 + 프로그레스 바 패턴도 Title/Description 탭에서 2회 반복 (각 ~20줄).

**문제**: 15줄 x 3곳 = 45줄의 거의 동일한 JSX (Title/Description/Hashtags). 스타일 변경 시 3곳 모두 수정 필요. Footer의 Copy All 버튼(`variant="default"`, 다른 className, 파라미터 없는 핸들러)은 별도 패턴으로 CopyButton 추출 대상이 아님.

**개선안**: 내부 서브컴포넌트 2개 추출.

```typescript
// YoutubeMetadataModal.tsx 파일 내부 (또는 별도 파일)

// CopiedField 타입은 Finding #8에서 동일 파일에 정의 (type CopiedField = "Title" | "Description" | ...)
interface CopyButtonProps {
  field: CopiedField;
  label: string;
  value: string;
  copiedField: CopiedField | null;
  onCopy: (field: CopiedField, value: string) => Promise<void | boolean>;
  disabled?: boolean;
}

function CopyButton({ field, label, value, copiedField, onCopy, disabled }: CopyButtonProps) {
  const isCopied = copiedField === field;

  return (
    <Button
      variant="secondary"
      size="sm"
      className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 font-semibold transition-all duration-200 hover:from-amber-500/20 hover:to-orange-500/20 hover:shadow-lg"
      onClick={() => onCopy(field, value)}
      disabled={disabled}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-amber-500/0 via-amber-500/20 to-amber-500/0 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
      {isCopied ? (
        <>
          <Check className="animate-in zoom-in mr-2 h-4 w-4 duration-200" />
          Copied!
        </>
      ) : (
        <>
          <Copy className="mr-2 h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
          {label}
        </>
      )}
    </Button>
  );
}
```

```typescript
interface CharacterCountBarProps {
  label: string;
  current: number;
  max: number;
}

function CharacterCountBar({ label, current, max }: CharacterCountBarProps) {
  const isOver = current > max;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{label}</span>
        <span className={`text-xs font-medium tabular-nums ${isOver ? "text-red-500" : "text-muted-foreground"}`}>
          {current}/{max}
        </span>
      </div>
      <div className="bg-muted/30 h-1.5 w-full overflow-hidden rounded-full">
        <div
          className={`h-full rounded-full transition-all duration-500 ${isOver ? "bg-gradient-to-r from-red-500 to-red-600" : "bg-gradient-to-r from-amber-500 to-orange-500"}`}
          style={{ width: `${Math.min((current / max) * 100, 100)}%` }}
        />
      </div>
    </div>
  );
}
```

**개선 후 사용**:
```tsx
{/* Title Tab — before: ~40줄, after: ~15줄 */}
<CharacterCountBar label="Title" current={clip.youtubeTitle?.length ?? 0} max={YOUTUBE_TITLE_MAX_LENGTH} />
{/* ... content area ... */}
<CopyButton field="Title" label="Copy Title" value={clip.youtubeTitle ?? ""} copiedField={copiedField} onCopy={handleCopyMetadata} />

{/* Description Tab */}
<CharacterCountBar label="Description" current={clip.youtubeDescription?.length ?? 0} max={YOUTUBE_DESCRIPTION_MAX_LENGTH} />
{/* ... content area ... */}
<CopyButton field="Description" label="Copy Description" value={clip.youtubeDescription ?? ""} copiedField={copiedField} onCopy={handleCopyMetadata} />

{/* Hashtags Tab — disabled 필수: 해시태그 없을 때 버튼 비활성화 */}
<CopyButton field="Hashtags" label="Copy All Hashtags" value={youtubeHashtags.join(" ")} copiedField={copiedField} onCopy={handleCopyMetadata} disabled={youtubeHashtags.length === 0} />
```

> **⚠️ 주의**: Hashtags 탭의 `CopyButton`에는 반드시 `disabled={youtubeHashtags.length === 0}`을 전달해야 한다. 누락 시 해시태그가 없을 때도 버튼이 활성화되어 (클릭하면 toast.error만 표시), 현재 동작(버튼 비활성화)에서 UX 회귀가 발생한다.

**효과**: YoutubeMetadataModal 약 373줄 → ~260줄 수준으로 축소. 스타일 변경 시 한 곳만 수정 (Copy All 버튼은 기존 유지).

---

### 4. 매직 넘버: YouTube 문자 제한

**스킬**: Frontend Readability, TypeScript Clean Code  
**위치**: `YoutubeMetadataModal.tsx:154,159,167,172` (100), `220,225,233,238` (5000)

**현재 코드**:
```tsx
// 100이 3회 등장 (비교, 표시, 계산)
(clip.youtubeTitle?.length ?? 0) > 100
{clip.youtubeTitle?.length ?? 0}/100
((clip.youtubeTitle?.length ?? 0) / 100) * 100

// 5000이 3회 등장
(clip.youtubeDescription?.length ?? 0) > 5000
{clip.youtubeDescription?.length ?? 0}/5000
((clip.youtubeDescription?.length ?? 0) / 5000) * 100
```

**문제**: YouTube 제한이 변경되면 6곳을 모두 수정해야 하며, 누락 위험이 높다.

> **메인 제안서 연계**: `docs/proposals/refactoring-proposal.md` Finding 5-1에서 이미 동일 상수를 제안하고 있다.

**개선안**: `shared/config/constants.ts`에 상수 추가.

```typescript
// src/fsd/shared/config/constants.ts 에 추가
export const YOUTUBE_TITLE_MAX_LENGTH = 100;
export const YOUTUBE_DESCRIPTION_MAX_LENGTH = 5000;
```

**개선 후 사용** (Finding #3의 `CharacterCountBar`와 조합):
```tsx
import { YOUTUBE_TITLE_MAX_LENGTH, YOUTUBE_DESCRIPTION_MAX_LENGTH } from "~/fsd/shared/config/constants";

<CharacterCountBar label="Title" current={clip.youtubeTitle?.length ?? 0} max={YOUTUBE_TITLE_MAX_LENGTH} />
```

**효과**: 변경 시 한 곳만 수정. 매직 넘버가 완전히 제거됨.

---

### 5. `onCopyScript` 타입 불일치 — `() => void` vs `async`

**스킬**: Frontend Predictability, TypeScript Clean Code  
**위치**: `ClipActions.tsx:34`, `ClipCard.tsx:69`

**현재 코드**:
```typescript
// ClipActions.tsx:34 — Props 선언
interface ClipActionsProps {
  onCopyScript: () => void;  // ← 동기 시그니처
}

// ClipCard.tsx:40 — 실제 전달하는 핸들러
const handleCopyScript = async () => { // ← 비동기 핸들러
  // ... await navigator.clipboard.writeText(...)
};
```

**문제**: TypeScript에서 `async () => Promise<void>`는 `() => void`에 할당 가능하므로 컴파일 에러는 나지 않는다. `ClipActions` 내부에서 `onCopyScript()`를 `onClick={onCopyScript}`로 전달할 때 (`ClipActions.tsx:122`) 반환된 Promise가 무시된다. 실제 `handleCopyScript`에 try/catch가 있어 unhandled rejection은 발생하지 않지만, 타입 선언이 실제 동작을 반영하지 못한다.

**개선안**: Props 타입을 실제 시그니처와 일치시킨다.

```typescript
// ClipActions.tsx
interface ClipActionsProps {
  onCopyScript: () => void | Promise<void>;
}
```

**효과**: 타입 수준에서 비동기 가능성이 명시되어, 향후 호출부에서 `await`나 `.catch()`를 고려할 수 있다.

---

## MEDIUM Priority

### 6. ClipActions가 10개 props를 받음

**스킬**: Frontend Coupling, Frontend Readability  
**위치**: `ClipActions.tsx:26-37`

**현재 코드**:
```typescript
interface ClipActionsProps {
  clip: Clip;
  playUrl: string | null;
  isLoading: boolean;
  hasScript: boolean;
  hasMetadata: boolean;
  onOpenScript: () => void;
  onOpenMetadata: () => void;
  onCopyScript: () => void;
  onDelete: (clipId: string) => Promise<ActionResult<void>>;
  onDeleted: (clipId: string) => void;
}
```

**판단**: Props 수가 10개로 인터페이스가 넓지만, 단순히 객체로 감싸는 것은 복잡도를 줄이지 않고 접근 경로만 깊게 만든다. 현 단계에서는 **Finding #5의 타입 수정 + Finding #7의 네이밍 개선만 적용**하고 props 수 자체는 유지한다.

---

### 7. `onDelete` / `onDeleted` 네이밍 혼란

**스킬**: Naming Conventions, Frontend Predictability  
**위치**: `ClipCard.tsx:15-16`, `ClipActions.tsx:35-36`, `ui/index.tsx:31-32`

**현재 코드**:
```typescript
<ClipCard
  clip={clip}
  onDelete={deleteClip}        // 서버 액션 (삭제 실행)
  onDeleted={removeClipOptimistic}  // 낙관적 업데이트 (삭제 후 콜백)
/>
```

**문제**: `onDelete`와 `onDeleted`는 과거형 차이만 있어 역할이 한눈에 구분되지 않는다. `ClipActions.tsx:65-76`에서 `onDelete`를 호출하고 성공 시 `onDeleted`를 호출하는 패턴에서, `onDeleted`가 "삭제 완료 후 콜백"인지 "이미 삭제된 상태 알림"인지 모호하다.

**개선안**: `onDeleted` → `onDeleteSuccess`

```typescript
// 변경 전
onDelete: (clipId: string) => Promise<ActionResult<void>>;
onDeleted: (clipId: string) => void;

// 변경 후
onDelete: (clipId: string) => Promise<ActionResult<void>>;
onDeleteSuccess: (clipId: string) => void;
```

**변경 범위**:
- `ui/index.tsx:32` — `onDeleted` → `onDeleteSuccess`
- `ClipCard.tsx:15-16` — interface 수정
- `ClipCard.tsx:71` — prop 전달명 수정
- `ClipActions.tsx:36` — interface 수정
- `ClipActions.tsx:70` — 호출부 수정

**효과**: "삭제 성공 후 호출되는 콜백"이라는 의미가 명확해짐.

---

### 8. `copiedField` 문자열 리터럴 비교 — 유니온 타입 미사용

**스킬**: TypeScript Clean Code, Frontend Predictability  
**위치**: `YoutubeMetadataModal.tsx:28`, `195`, `268`, `321`, `355`

**현재 코드**:
```typescript
const [copiedField, setCopiedField] = useState<string | null>(null);

// 비교부 (5곳)
copiedField === "Title"
copiedField === "Description"
copiedField === "Hashtags"
copiedField === "Tag"
copiedField === "All metadata"
```

**문제**: `string | null`이므로 오타가 있어도 컴파일 에러가 나지 않는다.

**개선안**: 유니온 타입 정의 후 적용.

```typescript
type CopiedField = "Title" | "Description" | "Hashtags" | "Tag" | "All metadata";

const [copiedField, setCopiedField] = useState<CopiedField | null>(null);

const handleCopyMetadata = async (field: CopiedField, value: string) => {
  // ...
  setCopiedField(field);
};
```

**효과**: 오타 시 컴파일 에러. 자동완성 지원.

---

### 9. `useClipPlayUrl`이 `shared/hooks/`에 있으나 단일 소비자

**스킬**: Frontend Cohesion  
**위치**: `src/fsd/shared/hooks/useClipPlayUrl.ts`  
**현재 소비자**: `ClipCard.tsx` (1곳)

**문제**: FSD 원칙상 단일 slice에서만 사용하는 코드는 해당 slice에 co-locate해야 한다.

**판단**: 메인 제안서(`refactoring-proposal.md`)에서 이미 `usePlayUrl` 제네릭 훅을 `shared/hooks/`에 배치하고 `useClipPlayUrl`을 래퍼로 유지하는 구조가 제안되어 있다. **현 시점에서는 변경 불필요. 메인 제안서의 Phase 1과 함께 처리.**

---

### 10. `useState<boolean>(false)` 불필요한 타입 어노테이션

**스킬**: TypeScript Clean Code  
**위치**: `ClipCard.tsx:21-22`, `useClipPlayUrl.ts:14`

**현재 코드**:
```typescript
const [isScriptOpen, setIsScriptOpen] = useState<boolean>(false);
const [isMetadataOpen, setIsMetadataOpen] = useState<boolean>(false);
```

**개선안**:
```typescript
const [isScriptOpen, setIsScriptOpen] = useState(false);
const [isMetadataOpen, setIsMetadataOpen] = useState(false);
```

**효과**: TypeScript가 `false`에서 `boolean`을 추론하므로 어노테이션이 불필요.

---

## LOW Priority

### 11. ClipVideoPlayer — 세 번의 조건부 렌더링

**스킬**: Frontend Readability  
**위치**: `ClipVideoPlayer.tsx:11-28`

**현재 코드**:
```tsx
{isLoading && (<div>...</div>)}
{!isLoading && src && (<video ... />)}
{!isLoading && !src && (<div>...</div>)}
```

**문제**: 세 조건이 상호 배타적이므로 early return이 의도를 더 명확히 전달한다. 다만 31줄 파일에서 심각한 가독성 문제는 아니다.

**개선안**: Early return 패턴 적용.

```tsx
export function ClipVideoPlayer({ src, isLoading }: ClipVideoPlayerProps) {
  if (isLoading) {
    return (
      <div className="bg-muted flex h-full w-full items-center justify-center">
        <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!src) {
    return (
      <div className="bg-muted flex h-full w-full items-center justify-center">
        <Play className="text-muted-foreground h-10 w-10 opacity-50" />
      </div>
    );
  }

  return (
    <div className="bg-muted">
      <video src={src} controls preload="metadata" className="h-full w-full rounded-md object-cover" />
    </div>
  );
}
```

**효과**: 각 상태가 독립적인 반환 블록으로 명확히 분리됨.

---

### 12. ScriptModal과 YoutubeMetadataModal이 전체 Clip 객체를 받음

**스킬**: Frontend Coupling  
**위치**: `ScriptModal.tsx:9-13`, `YoutubeMetadataModal.tsx:17-21`

**현재 코드**:
```typescript
// ScriptModal — 실제 사용 필드: scriptText, startSeconds, endSeconds
interface ScriptModalProps {
  clip: Clip;  // Clip 전체 (13+ 필드)
  isOpen: boolean;
  onClose: () => void;
}
```

**판단**: 현재 프로젝트 규모에서는 `Clip`을 Prisma가 생성하므로 인터페이스가 안정적이고, props를 개별 필드로 나누면 `ClipCard`에서 전달할 때 오히려 번거로워진다. **현 단계에서는 변경 불필요**. Clip 스키마가 자주 변경되거나 모달을 다른 컨텍스트에서 재사용해야 할 때 `Pick<Clip, ...>` 타입으로 축소를 고려한다.

---

## 구현 순서

### Phase 1: 중복 제거 & 유틸리티 추출 (HIGH 5건 + MEDIUM 2건)

> Finding #1, #2, #3, #4, #5, #8, #10 해결

| 순서 | 작업 | 파일 |
|------|------|------|
| 1-0 | `parseJsonArray<T>()` 추가 — 메인 제안서 Finding 4와 동일 (**1-3 전에 선행 필요**) | `shared/lib/utils.ts` (수정) |
| 1-1 | `copyToClipboard` 유틸리티 생성 | `widgets/clip-display/lib/copy-to-clipboard.ts` (신규) |
| 1-2 | YouTube 문자 제한 상수 추가 | `shared/config/constants.ts` (수정) |
| 1-3 | `ClipCard.tsx` — `handleCopyScript`를 `copyToClipboard` 사용으로 전환, `parseJsonArray` 사용, `useState<boolean>` 어노테이션 제거 | `ClipCard.tsx` (수정) |
| 1-4 | `ScriptModal.tsx` — `handleCopyScript`를 `copyToClipboard` 사용으로 전환 | `ScriptModal.tsx` (수정) |
| 1-5 | `YoutubeMetadataModal.tsx` — `handleCopyMetadata`를 `copyToClipboard` 사용으로 전환, `parseJsonArray` 사용, 상수 적용, `CopiedField` 유니온 타입 추가, `CopyButton`/`CharacterCountBar` 서브컴포넌트 추출 | `YoutubeMetadataModal.tsx` (수정) |
| 1-6 | `ClipActions.tsx` — `onCopyScript` 타입을 `() => void \| Promise<void>`로 수정 | `ClipActions.tsx` (수정) |

> **의존성**: `shared/lib/utils.ts`에 `parseJsonArray<T>()`가 없으면 1-3, 1-5 단계에서 TypeScript 에러 발생. 메인 제안서 Finding 4가 선행 완료된 경우 1-0 생략 가능.

### Phase 2: 네이밍 개선 (MEDIUM 1건)

> Finding #7 해결

| 순서 | 작업 | 파일 |
|------|------|------|
| 2-1 | `onDeleted` → `onDeleteSuccess` 이름 변경 | `ui/index.tsx`, `ClipCard.tsx`, `ClipActions.tsx` (수정) |

### Phase 3: 가독성 개선 (LOW 1건)

> Finding #11 해결

| 순서 | 작업 | 파일 |
|------|------|------|
| 3-1 | `ClipVideoPlayer` early return 패턴 적용 | `ClipVideoPlayer.tsx` (수정) |

---

## 영향 범위

| 변경 대상 | 변경 유형 |
|-----------|-----------|
| `src/fsd/widgets/clip-display/lib/copy-to-clipboard.ts` | 신규 |
| `src/fsd/shared/config/constants.ts` | 수정 (상수 2개 추가) |
| `src/fsd/widgets/clip-display/ui/index.tsx` | 수정 (네이밍) |
| `src/fsd/widgets/clip-display/ui/_component/ClipCard.tsx` | 수정 (중복 제거, 타입, 네이밍) |
| `src/fsd/widgets/clip-display/ui/_component/ClipActions.tsx` | 수정 (타입, 네이밍) |
| `src/fsd/widgets/clip-display/ui/_component/ScriptModal.tsx` | 수정 (중복 제거) |
| `src/fsd/widgets/clip-display/ui/_component/YoutubeMetadataModal.tsx` | 수정 (주요 리팩토링) |
| `src/fsd/widgets/clip-display/ui/_component/ClipVideoPlayer.tsx` | 수정 (early return) |

---

## 검증 방법

1. `npm run check` — 타입 에러 + 린트 통과 확인
2. `npm run build` — 프로덕션 빌드 성공 확인
3. 클립 카드 Download 버튼 정상 동작 확인
4. Dropdown → Script 클릭 → 모달 열림, Copy 버튼 동작 확인
5. Dropdown → YouTube Metadata 클릭 → 각 탭 복사 버튼 + 문자 수 카운터 정상 확인
6. Dropdown → Copy script → 클립보드 복사 성공/실패 toast 확인
7. Dropdown → Delete → 낙관적 제거 + 서버 삭제 확인
