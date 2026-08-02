---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-04-13"
approved-by: null
approved-at: null
approval-scope: null
completed-at: "2026-04-13"
verification-summary: "마이그레이션 전 문서. 개별 검증 기록 없음"
closed-at: null
closed-by: null
closed-reason: null
owners: []
related: []
---

# YoutubeMetadataModal 리팩토링 문서

**작성일**: 2026-04-13  
**대상 파일**: `src/fsd/widgets/clip-display/ui/_component/YoutubeMetadataModal.tsx` (338줄)  
**소비자**: `src/fsd/widgets/clip-display/ui/_component/ClipCard.tsx`

---

## 1. 배경/동기

`YoutubeMetadataModal.tsx` 한 파일 안에 세 가지 관심사가 혼재한다.

| 관심사 | 현재 위치 | 문제 |
|--------|-----------|------|
| 프레젠테이션 컴포넌트 (`CopyButton`, `CharacterCountBar`) | 줄 26-87 | 재사용·테스트 불가, 파일 길이 증가 |
| 클립보드 비즈니스 로직 (`handleCopyMetadata`, `handleCopyAllMetadata`, `copiedField` 상태) | 줄 100-131 | 뷰 렌더링 로직과 뒤섞여 단위 테스트 불가 |
| 매직 넘버·문자열 (`2000`, `"title"`, `"description"` 등) | 줄 115, 176-198 | 변경 시 내부 탐색 필요 |

기존 UX와 기능은 일체 변경하지 않는다. 파일 분리와 추출만으로 유지보수성을 높이는 것이 목적이다.

---

## 2. 분석 결과

### 응집도(cohesion) 기준 분석

- **발견된 문제**: `CopyButton`, `CharacterCountBar`가 `YoutubeMetadataModal` 안에 정의되어 있음. 세 컴포넌트가 한 파일에 혼재.
- **심각도**: Medium — 현재 버그는 없으나 파일이 338줄이어서 수정 시 무관한 코드가 시야에 들어옴.
- **위치**: `YoutubeMetadataModal.tsx` 줄 26-87
- **적용 원칙**: "함께 변경되는 코드는 물리적으로 가까이 둔다" → `CopyButton`, `CharacterCountBar`는 이 모달 전용이므로 `_component/` 안 별도 파일로 분리하면 응집도를 유지하면서 파일 크기를 줄일 수 있다.

### 가독성(readability) 기준 분석

- **발견된 문제 1**: 매직 넘버 `2000` (줄 115) — 2초 피드백 유지 시간임을 코드만으로 알기 어려움.
- **발견된 문제 2**: 탭 값 문자열 리터럴 `"title"`, `"description"`, `"hashtags"` (줄 176-198) — 상수화되지 않아 오타 시 타입 체크가 잡지 못함.
- **발견된 문제 3**: JSX `return` 문이 약 200줄 — 가독성 가이드 권장 50줄 기준의 4배.
- **심각도**: Low~Medium — 현재 버그 유발 요소는 아니지만 추후 변경 비용을 높임.
- **위치**: 줄 115, 176-198, 133-337

### 예측가능성(predictability) 기준 분석

- **발견된 문제 1**: `handleCopyMetadata`가 클립보드 복사 + toast 표시 + 상태 변경의 세 가지 부수효과를 수행하는데, 이름이 "복사 처리"임을 드러내고 있어 큰 문제는 없음.
- **기회**: `useMetadataClipboard` 훅으로 추출하면 `YoutubeMetadataModal`의 반환 타입이 명확해지고, 테스트에서 `clip` prop만으로 훅을 격리 검증할 수 있음.
- **심각도**: Low

### ⚠️ 추가 발견 — After 코드 보완 필요 (2026-04-13 검토)

**문제 A: `setTimeout` 타이머 누수** (심각도: High)
- **위치**: `YoutubeMetadataModal.tsx` 줄 115, 제안된 After `useMetadataClipboard.ts`
- **현상**: `setTimeout(() => setCopiedField(null), 2000)` 호출 후 컴포넌트가 언마운트되면 타이머가 계속 실행되어 setState를 시도함. React Strict Mode 이중 마운트 환경에서도 잘못된 상태 전이가 발생할 수 있음.
- **수정**: `useEffect` + `clearTimeout` cleanup 패턴으로 교체해야 함 (섹션 5-B After 코드 수정됨).

**문제 B: `useCallback` 누락** (심각도: Medium)
- **위치**: 제안된 After `useMetadataClipboard.ts`의 `handleCopyMetadata`, `handleCopyAllMetadata`
- **현상**: `next.config.js` 기준 이 프로젝트는 **React Compiler 미활성화** 상태. Compiler 없이 `useCallback`을 쓰지 않으면 훅 호출 시마다 핸들러 함수가 새로 생성되어 `CopyButton`·해시태그 버튼에 불필요한 리렌더를 유발함.
- **수정**: 두 핸들러 모두 `useCallback`으로 감싸야 함 (섹션 5-B After 코드 수정됨).

**문제 C: `format-metadata.ts`가 Prisma `Clip` 타입에 직접 의존** (심각도: Medium)
- **위치**: 제안된 After `lib/format-metadata.ts`의 함수 시그니처 `(clip: Clip, hashtags: string[])`
- **현상**: `lib/` 레이어의 순수 함수가 `generated/prisma`에 결합되면 Prisma 스키마 변경 시 파급이 생기고 단위 테스트에서 Mock 구성이 복잡해짐. `clip` 객체에서 `youtubeTitle`·`youtubeDescription` 두 필드만 사용하면 충분하므로 로컬 인터페이스로 분리해야 함.
- **수정**: 로컬 인터페이스 `ClipMetadataInput`을 선언하고 함수 시그니처를 교체함 (섹션 5-A After 코드 수정됨). TypeScript 구조적 타이핑 덕분에 호출부(`useMetadataClipboard`)는 코드 변경 없이 동작함.

---

## 3. 목표 상태

### 목표

리팩토링 완료 후 파일 구조:

```
src/fsd/widgets/clip-display/
├── lib/
│   ├── copy-to-clipboard.ts          (기존 — 변경 없음)
│   └── format-metadata.ts            ← 신규: 메타데이터 텍스트 병합 순수 함수
├── model/
│   └── useMetadataClipboard.ts       ← 신규: 클립보드 상태·핸들러 커스텀 훅
└── ui/
    └── _component/
        ├── CharacterCountBar.tsx      ← 신규: 글자 수 시각화 바 컴포넌트
        ├── ClipActions.tsx            (기존 — 변경 없음)
        ├── ClipCard.tsx               (기존 — 변경 없음)
        ├── ClipVideoPlayer.tsx        (기존 — 변경 없음)
        ├── CopyButton.tsx             ← 신규: 복사 버튼 컴포넌트
        ├── ScriptModal.tsx            (기존 — 변경 없음)
        └── YoutubeMetadataModal.tsx   (기존 — 슬림화, ~165줄 예상)
```

- `YoutubeMetadataModal.tsx`는 뷰 조합과 Sheet/Tabs 구조에만 집중한다.
- 비즈니스 로직은 `useMetadataClipboard` 훅이 전담한다.
- 순수 유틸 함수는 `lib/format-metadata.ts`에 위치한다.
- `ClipCard.tsx`의 props 인터페이스는 변경되지 않는다.

### 비목표

- `YoutubeMetadataModal`의 UI 디자인·스타일 변경은 하지 않는다.
- `ClipCard.tsx`의 `YoutubeMetadataModal` 사용 방식은 변경하지 않는다.
- Tailwind CSS 클래스를 `cva`로 전환하지 않는다 (이번 범위 밖).
- `ClipCard.tsx`에 중복된 `youtubeHashtags` useMemo는 건드리지 않는다 (별도 목적으로 사용 중).
- 단위 테스트 파일 신규 작성은 이번 범위에서 제외한다 (추후 별도 작업).

### 성공 기준

- `YoutubeMetadataModal.tsx` 줄 수가 200줄 이하가 된다.
- `npm run typecheck` (`tsc --noEmit`) 통과.
- `npm run lint` 통과.
- 브라우저에서 메타데이터 Sheet가 정상 개폐되고 각 탭(Title, Description, Hashtags) 복사가 정상 동작함을 수동 확인.

---

## 4. 대안 분석

### Option A: Tailwind 스타일을 `cva`로 전환

```tsx
import { cva } from "class-variance-authority";
const copyButtonVariants = cva("group relative w-full overflow-hidden rounded-xl ...", {
  variants: { isCopied: { true: "...", false: "..." } },
});
```

- **장점**: 변형(variant) 기반 스타일 관리에 최적화, 타입 안전
- **단점**: `cva`는 이미 `package.json` dependencies에 설치되어 있어 의존성 추가 비용은 없음. 단, `CopyButton`의 스타일은 변형이 아닌 정적 클래스이므로 variant API를 쓰는 것이 오버엔지니어링. `CharacterCountBar`의 `isOver` 분기는 인라인 삼항으로도 충분히 표현됨.

### Option B: `STYLES` 상수 객체로 상수화 (선택)

각 컴포넌트 파일 상단에 `const STYLES` 객체를 선언하여 긴 Tailwind 클래스 문자열을 분리한다.

```tsx
const STYLES = {
  button: "group relative w-full overflow-hidden rounded-xl ...",
  shimmer: "absolute inset-0 bg-gradient-to-r from-amber-500/0 ...",
} as const;
```

- **장점**: `cva` 의존성 없음, JSX가 훨씬 간결해짐, 변경 시 한 곳만 수정
- **단점**: Tailwind IntelliSense가 변수 참조 방식에서 자동완성을 제공하지 않을 수 있음

### Option C: 현행 인라인 유지 (비선택)

- **장점**: 변경 없음
- **단점**: `CopyButton` JSX의 className이 2-3줄짜리 문자열로 뷰 구조 파악을 방해함

### 선택: Option B (STYLES 상수)

**근거**: `cva`는 variant가 여러 개일 때 빛을 발한다. `CopyButton`과 `CharacterCountBar`는 variant 없이 정적 클래스 조합만 사용하므로 `STYLES` 상수가 충분하다. `cva`는 이미 설치되어 있어 의존성 비용은 없지만, variant가 없는 컴포넌트에 `cva`를 도입하는 것은 API 의도와 맞지 않는다. 프로젝트의 `button.tsx`가 `cva`를 쓰는 방식(variant 분기)과 일관성을 유지하기 위해, variant 없는 정적 스타일에는 `STYLES` 상수를 사용한다.

---

## 5. 구현 계획

### A. `lib/format-metadata.ts` (신규)

**Before** — `YoutubeMetadataModal.tsx` 줄 121-131:

```tsx
// YoutubeMetadataModal.tsx
const handleCopyAllMetadata = async () => {
  const allText = [
    clip.youtubeTitle,
    clip.youtubeDescription,
    youtubeHashtags.join(" "),
  ]
    .filter(Boolean)
    .join("\n\n");

  await handleCopyMetadata("All metadata", allText);
};
```

**After** — `src/fsd/widgets/clip-display/lib/format-metadata.ts` (신규):

```ts
// Prisma Clip 타입에 직접 의존하지 않도록 필요한 필드만 추출한 로컬 인터페이스를 선언한다.
// TypeScript 구조적 타이핑 덕분에 Clip 객체를 그대로 전달할 수 있다.
interface ClipMetadataInput {
  youtubeTitle: string | null | undefined;
  youtubeDescription: string | null | undefined;
}

export function formatAllMetadataForCopy(
  { youtubeTitle, youtubeDescription }: ClipMetadataInput,
  hashtags: string[],
): string {
  return [youtubeTitle, youtubeDescription, hashtags.join(" ")]
    .filter(Boolean)
    .join("\n\n");
}
```

---

### B. `model/useMetadataClipboard.ts` (신규)

**Before** — `YoutubeMetadataModal.tsx` 줄 24, 100-131:

```tsx
// YoutubeMetadataModal.tsx
type CopiedField = "Title" | "Description" | "Hashtags" | "Tag" | "All metadata";

// ...

export function YoutubeMetadataModal({ clip, isOpen, onClose }: YoutubeMetadataModalProps) {
  const [copiedField, setCopiedField] = useState<CopiedField | null>(null);

  const youtubeHashtags = useMemo(
    () => parseJsonArray<string>(clip.youtubeHashtags),
    [clip.youtubeHashtags],
  );

  const handleCopyMetadata = async (field: CopiedField, value: string) => {
    if (!value) {
      toast.error(`${field} is not available.`);
      return;
    }
    const result = await copyToClipboard(value);
    if (result.success) {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } else {
      toast.error(`Failed to copy ${field.toLowerCase()}: ${result.error}`);
    }
  };

  const handleCopyAllMetadata = async () => {
    const allText = [
      clip.youtubeTitle,
      clip.youtubeDescription,
      youtubeHashtags.join(" "),
    ]
      .filter(Boolean)
      .join("\n\n");
    await handleCopyMetadata("All metadata", allText);
  };
  // ...
}
```

**After** — `src/fsd/widgets/clip-display/model/useMetadataClipboard.ts` (신규):

```ts
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { Clip } from "generated/prisma";
import { parseJsonArray } from "~/fsd/shared/lib/utils";
import { copyToClipboard } from "~/fsd/widgets/clip-display/lib/copy-to-clipboard";
import { formatAllMetadataForCopy } from "~/fsd/widgets/clip-display/lib/format-metadata";

export type CopiedField = "Title" | "Description" | "Hashtags" | "Tag" | "All metadata";

const COPY_FEEDBACK_DELAY_MS = 2000;

export function useMetadataClipboard(clip: Clip) {
  const [copiedField, setCopiedField] = useState<CopiedField | null>(null);

  const hashtags = useMemo(
    () => parseJsonArray<string>(clip.youtubeHashtags),
    [clip.youtubeHashtags],
  );

  // [수정] copiedField가 설정되면 COPY_FEEDBACK_DELAY_MS 후 자동 초기화.
  // useEffect cleanup으로 언마운트 시 타이머 누수를 방지한다.
  // (원본의 setTimeout 직접 호출은 언마운트 후에도 setCopiedField를 시도할 수 있음)
  useEffect(() => {
    if (copiedField === null) return;
    const timer = setTimeout(() => setCopiedField(null), COPY_FEEDBACK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [copiedField]);

  // [수정] React Compiler 미활성화 환경에서 handleCopyMetadata를 useCallback으로 감싸
  // CopyButton·해시태그 버튼에 전달되는 함수 참조를 안정화한다.
  const handleCopyMetadata = useCallback(
    async (field: CopiedField, value: string) => {
      if (!value) {
        toast.error(`${field} is not available.`);
        return;
      }
      const result = await copyToClipboard(value);
      if (result.success) {
        setCopiedField(field);
        // setTimeout 제거: useEffect가 copiedField 변경을 감지해 타이머를 실행한다
      } else {
        toast.error(`Failed to copy ${field.toLowerCase()}: ${result.error}`);
      }
    },
    [], // setCopiedField, copyToClipboard, toast 모두 안정 참조
  );

  // [수정] useCallback으로 감싸 clip·hashtags 변경 시에만 재생성되도록 한다.
  const handleCopyAllMetadata = useCallback(async () => {
    const allText = formatAllMetadataForCopy(clip, hashtags);
    await handleCopyMetadata("All metadata", allText);
  }, [clip, hashtags, handleCopyMetadata]);

  return { copiedField, hashtags, handleCopyMetadata, handleCopyAllMetadata };
}
```

---

### C. `ui/_component/CopyButton.tsx` (신규)

**Before** — `YoutubeMetadataModal.tsx` 줄 26-60:

```tsx
// YoutubeMetadataModal.tsx (인라인 정의)
interface CopyButtonProps {
  field: CopiedField;
  label: string;
  value: string;
  copiedField: CopiedField | null;
  onCopy: (field: CopiedField, value: string) => Promise<void>;
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

**After** — `src/fsd/widgets/clip-display/ui/_component/CopyButton.tsx` (신규):

```tsx
import { Check, Copy } from "lucide-react";
import { Button } from "~/fsd/shared/ui/atoms/button";
import type { CopiedField } from "~/fsd/widgets/clip-display/model/useMetadataClipboard";

const STYLES = {
  button:
    "group relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 font-semibold transition-all duration-200 hover:from-amber-500/20 hover:to-orange-500/20 hover:shadow-lg",
  shimmer:
    "absolute inset-0 bg-gradient-to-r from-amber-500/0 via-amber-500/20 to-amber-500/0 opacity-0 transition-opacity duration-500 group-hover:opacity-100",
} as const;

interface CopyButtonProps {
  field: CopiedField;
  label: string;
  value: string;
  copiedField: CopiedField | null;
  onCopy: (field: CopiedField, value: string) => Promise<void>;
  disabled?: boolean;
}

export function CopyButton({ field, label, value, copiedField, onCopy, disabled }: CopyButtonProps) {
  const isCopied = copiedField === field;

  return (
    <Button
      variant="secondary"
      size="sm"
      className={STYLES.button}
      onClick={() => onCopy(field, value)}
      disabled={disabled}
    >
      <div className={STYLES.shimmer} />
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

---

### D. `ui/_component/CharacterCountBar.tsx` (신규)

**Before** — `YoutubeMetadataModal.tsx` 줄 62-87:

```tsx
// YoutubeMetadataModal.tsx (인라인 정의)
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

**After** — `src/fsd/widgets/clip-display/ui/_component/CharacterCountBar.tsx` (신규):

```tsx
const STYLES = {
  bar: {
    normal: "bg-gradient-to-r from-amber-500 to-orange-500",
    over: "bg-gradient-to-r from-red-500 to-red-600",
  },
  count: {
    normal: "text-muted-foreground",
    over: "text-red-500",
  },
} as const;

interface CharacterCountBarProps {
  label: string;
  current: number;
  max: number;
}

export function CharacterCountBar({ label, current, max }: CharacterCountBarProps) {
  const isOver = current > max;
  const fillPercent = Math.min((current / max) * 100, 100);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{label}</span>
        <span className={`text-xs font-medium tabular-nums ${isOver ? STYLES.count.over : STYLES.count.normal}`}>
          {current}/{max}
        </span>
      </div>
      <div className="bg-muted/30 h-1.5 w-full overflow-hidden rounded-full">
        <div
          className={`h-full rounded-full transition-all duration-500 ${isOver ? STYLES.bar.over : STYLES.bar.normal}`}
          style={{ width: `${fillPercent}%` }}
        />
      </div>
    </div>
  );
}
```

---

### E. `YoutubeMetadataModal.tsx` 슬림화 (기존 파일 수정)

**Before** — import 블록 및 컴포넌트 선언부 (줄 1-131, 변경 대상 부분):

```tsx
// 변경 전 import
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { parseJsonArray } from "~/fsd/shared/lib/utils";
import { copyToClipboard } from "~/fsd/widgets/clip-display/lib/copy-to-clipboard";

// 변경 전: CopiedField 타입 인라인 정의
type CopiedField = "Title" | "Description" | "Hashtags" | "Tag" | "All metadata";

// 변경 전: CopyButton, CharacterCountBar 인라인 정의 (줄 26-87)
function CopyButton(...) { ... }
function CharacterCountBar(...) { ... }

// 변경 전: 컴포넌트 내 상태 및 핸들러
export function YoutubeMetadataModal({ clip, isOpen, onClose }) {
  const [copiedField, setCopiedField] = useState<CopiedField | null>(null);
  const youtubeHashtags = useMemo(...);
  const handleCopyMetadata = async (...) => { ... };
  const handleCopyAllMetadata = async () => { ... };
  // JSX ...
}
```

**After** — 슬림화된 `YoutubeMetadataModal.tsx` 전체:

```tsx
"use client";

import type { Clip } from "generated/prisma";
import {
  Check,
  Copy,
  FileText,
  Hash,
  Type,
  X,
} from "lucide-react";
import { YOUTUBE_DESCRIPTION_MAX_LENGTH, YOUTUBE_TITLE_MAX_LENGTH } from "~/fsd/shared/config/constants";
import { Button } from "~/fsd/shared/ui/atoms/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/fsd/shared/ui/atoms/tabs";
import {
  Sheet,
  SheetContent,
} from "~/fsd/shared/ui/atoms/sheet";
import { useMetadataClipboard } from "~/fsd/widgets/clip-display/model/useMetadataClipboard";
import { CharacterCountBar } from "./CharacterCountBar";
import { CopyButton } from "./CopyButton";

const TAB_VALUES = {
  TITLE: "title",
  DESCRIPTION: "description",
  HASHTAGS: "hashtags",
} as const;

interface YoutubeMetadataModalProps {
  clip: Clip;
  isOpen: boolean;
  onClose: () => void;
}

export function YoutubeMetadataModal({
  clip,
  isOpen,
  onClose,
}: YoutubeMetadataModalProps) {
  const { copiedField, hashtags, handleCopyMetadata, handleCopyAllMetadata } =
    useMetadataClipboard(clip);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        showCloseButton={false}
        overlayClassName="bg-gradient-to-br from-black/60 via-black/50 to-black/60 backdrop-blur-md"
        className="flex w-full max-w-md flex-col gap-0 overflow-hidden p-0"
        style={{
          boxShadow:
            "0 0 0 1px rgba(255,255,255,0.05), 0 25px 50px -12px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div className="border-border/50 relative border-b bg-gradient-to-br from-amber-500/5 via-transparent to-transparent p-5">
          <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex-1 space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 backdrop-blur-sm">
                  <Hash className="h-4 w-4 text-amber-500" />
                </div>
                <h2 className="text-lg font-bold tracking-tight">
                  YouTube Metadata
                </h2>
              </div>
              <p className="text-muted-foreground text-xs font-medium">
                SEO-optimized for YouTube Shorts
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              className="hover:bg-muted/50 shrink-0 rounded-lg transition-all duration-200 hover:rotate-90"
              aria-label="Close metadata panel"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-5">
          <Tabs defaultValue={TAB_VALUES.TITLE} className="w-full">
            <TabsList className="bg-muted/30 grid h-auto w-full grid-cols-3 gap-1.5 rounded-xl p-1.5 backdrop-blur-sm">
              <TabsTrigger
                value={TAB_VALUES.TITLE}
                className="h-auto data-[state=active]:bg-background data-[state=active]:text-foreground rounded-lg px-3 py-2.5 text-xs font-semibold transition-all duration-200 data-[state=active]:shadow-sm"
              >
                <Type className="mr-1.5 h-3.5 w-3.5" />
                Title
              </TabsTrigger>
              <TabsTrigger
                value={TAB_VALUES.DESCRIPTION}
                className="h-auto data-[state=active]:bg-background data-[state=active]:text-foreground rounded-lg px-3 py-2.5 text-xs font-semibold transition-all duration-200 data-[state=active]:shadow-sm"
              >
                <FileText className="mr-1.5 h-3.5 w-3.5" />
                Desc
              </TabsTrigger>
              <TabsTrigger
                value={TAB_VALUES.HASHTAGS}
                className="h-auto data-[state=active]:bg-background data-[state=active]:text-foreground rounded-lg px-3 py-2.5 text-xs font-semibold transition-all duration-200 data-[state=active]:shadow-sm"
              >
                <Hash className="mr-1.5 h-3.5 w-3.5" />
                Tags
              </TabsTrigger>
            </TabsList>

            {/* Title Tab */}
            <TabsContent value={TAB_VALUES.TITLE} className="mt-4 space-y-4">
              <CharacterCountBar
                label="Title"
                current={clip.youtubeTitle?.length ?? 0}
                max={YOUTUBE_TITLE_MAX_LENGTH}
              />
              <div className="group border-border/50 from-muted/30 to-muted/10 hover:border-border relative overflow-hidden rounded-xl border bg-gradient-to-br p-4 backdrop-blur-sm transition-all duration-200">
                <p className="text-sm leading-relaxed">
                  {clip.youtubeTitle ?? (
                    <span className="text-muted-foreground italic">
                      Not available
                    </span>
                  )}
                </p>
              </div>
              <CopyButton
                field="Title"
                label="Copy Title"
                value={clip.youtubeTitle ?? ""}
                copiedField={copiedField}
                onCopy={handleCopyMetadata}
              />
            </TabsContent>

            {/* Description Tab */}
            <TabsContent value={TAB_VALUES.DESCRIPTION} className="mt-4 space-y-4">
              <CharacterCountBar
                label="Description"
                current={clip.youtubeDescription?.length ?? 0}
                max={YOUTUBE_DESCRIPTION_MAX_LENGTH}
              />
              <div className="group border-border/50 from-muted/30 to-muted/10 hover:border-border relative max-h-64 overflow-auto rounded-xl border bg-gradient-to-br p-4 backdrop-blur-sm transition-all duration-200">
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {clip.youtubeDescription ?? (
                    <span className="text-muted-foreground italic">
                      Not available
                    </span>
                  )}
                </p>
                <div className="from-muted/30 pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t to-transparent" />
              </div>
              <CopyButton
                field="Description"
                label="Copy Description"
                value={clip.youtubeDescription ?? ""}
                copiedField={copiedField}
                onCopy={handleCopyMetadata}
              />
            </TabsContent>

            {/* Hashtags Tab */}
            <TabsContent value={TAB_VALUES.HASHTAGS} className="mt-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">
                  Hashtags ({hashtags.length})
                </span>
              </div>
              <div className="border-border/50 from-muted/30 to-muted/10 flex min-h-[120px] flex-wrap gap-2 rounded-xl border bg-gradient-to-br p-4 backdrop-blur-sm">
                {hashtags.length > 0 ? (
                  hashtags.map((tag, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleCopyMetadata("Tag", tag)}
                      className="group animate-clipcard-hashtag-fade-in border-border/50 from-background/80 to-background/60 relative overflow-hidden rounded-full border bg-gradient-to-br px-4 py-2 text-sm font-medium backdrop-blur-sm transition-all duration-200 hover:scale-105 hover:border-amber-500/30 hover:bg-gradient-to-br hover:from-amber-500/10 hover:to-orange-500/10 hover:shadow-md active:scale-95"
                      style={{ animationDelay: `${idx * 30}ms` }}
                    >
                      <span className="relative z-10">{tag}</span>
                      <div className="absolute inset-0 bg-gradient-to-r from-amber-500/0 via-amber-500/20 to-amber-500/0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                    </button>
                  ))
                ) : (
                  <span className="text-muted-foreground m-auto italic">
                    No hashtags available
                  </span>
                )}
              </div>
              <CopyButton
                field="Hashtags"
                label="Copy All Hashtags"
                value={hashtags.join(" ")}
                copiedField={copiedField}
                onCopy={handleCopyMetadata}
                disabled={hashtags.length === 0}
              />
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer */}
        <div className="border-border/50 from-background/80 to-background/60 border-t bg-gradient-to-br p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              className="hover:bg-muted/50 rounded-xl font-medium transition-all duration-200"
            >
              Close
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleCopyAllMetadata}
              className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 font-semibold shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-xl active:scale-95"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/25 to-white/0 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
              {copiedField === "All metadata" ? (
                <>
                  <Check className="animate-in zoom-in mr-2 h-4 w-4 duration-200" />
                  Copied All!
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
                  Copy All
                </>
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

---

## 6. 실행 순서

각 Phase 완료 후 `npm run typecheck`와 브라우저 수동 확인을 통해 시스템이 정상 동작함을 검증한다.

### Phase 1: 순수 유틸 분리 — 기존 파일 미변경

- **작업 내용**:
  1. `src/fsd/widgets/clip-display/lib/format-metadata.ts` 생성 (섹션 5-A After 코드)
- **이 Phase의 특징**: 기존 파일을 아직 변경하지 않으므로 기존 동작에 영향이 없다. 새 파일만 추가됨.
- **검증**: `npm run typecheck` 통과.

### Phase 2: 커스텀 훅 분리

- **작업 내용**:
  1. `src/fsd/widgets/clip-display/model/` 디렉토리 생성
  2. `useMetadataClipboard.ts` 생성 (섹션 5-B After 코드). `formatAllMetadataForCopy`를 Phase 1에서 생성한 `format-metadata.ts`에서 import.
- **이 Phase의 특징**: 기존 `YoutubeMetadataModal.tsx`는 아직 변경하지 않음. 새 훅만 추가.
- **검증**: `npm run typecheck` 통과.

### Phase 3: 프레젠테이션 컴포넌트 분리

- **작업 내용**:
  1. `src/fsd/widgets/clip-display/ui/_component/CopyButton.tsx` 생성 (섹션 5-C After 코드)
  2. `src/fsd/widgets/clip-display/ui/_component/CharacterCountBar.tsx` 생성 (섹션 5-D After 코드)
- **이 Phase의 특징**: 기존 `YoutubeMetadataModal.tsx`는 아직 변경하지 않음. 신규 파일만 추가.
- **검증**: `npm run typecheck` 통과.

### Phase 4: YoutubeMetadataModal.tsx 슬림화 (최종 교체)

- **작업 내용**:
  1. `YoutubeMetadataModal.tsx` 전체를 섹션 5-E After 코드로 교체
  2. 제거되는 내용: `CopiedField` 타입 인라인 정의, `CopyButton` 인라인 함수, `CharacterCountBar` 인라인 함수, `useState`/`useMemo`/`handleCopyMetadata`/`handleCopyAllMetadata` 인라인 선언, `parseJsonArray`/`copyToClipboard` import
  3. 추가되는 내용: `useMetadataClipboard` import, `CopyButton` import, `CharacterCountBar` import, `TAB_VALUES` 상수, `"title"` 하드코딩 → `TAB_VALUES.TITLE` 치환
- **검증**:
  - `npm run typecheck` 통과
  - `npm run lint` 통과
  - 브라우저에서 클립 카드의 "YouTube Metadata" 메뉴 항목 클릭 → Sheet 열림 확인
  - Title / Description / Hashtags 탭 전환 정상 확인
  - 각 탭의 "Copy" 버튼 클릭 시 "Copied!" 피드백 2초 후 복원 확인
  - "Copy All" 버튼 클릭 시 전체 메타데이터 클립보드 복사 확인
  - 해시태그 개별 클릭 복사 확인

---

## 7. 영향 범위

### 직접 수정 대상

| 파일 | 변경 유형 |
|------|----------|
| `ui/_component/YoutubeMetadataModal.tsx` | 수정 (슬림화) |

### 신규 생성 대상

| 파일 | 역할 |
|------|------|
| `lib/format-metadata.ts` | 메타데이터 텍스트 병합 순수 함수 |
| `model/useMetadataClipboard.ts` | 클립보드 상태·핸들러 커스텀 훅, `CopiedField` 타입 export |
| `ui/_component/CopyButton.tsx` | 복사 버튼 컴포넌트 |
| `ui/_component/CharacterCountBar.tsx` | 글자 수 시각화 바 컴포넌트 |

### import 변경 불필요 파일

| 파일 | 이유 |
|------|------|
| `ui/_component/ClipCard.tsx` | `YoutubeMetadataModal`의 props 인터페이스(`clip`, `isOpen`, `onClose`)가 변경되지 않음 |
| `ui/index.tsx` | `YoutubeMetadataModal` re-export 구조가 있다면 변경 없음 |

### 타입 공유 관계

`CopiedField` 타입이 `useMetadataClipboard.ts`에서 export되어 `CopyButton.tsx`에서 import된다. `YoutubeMetadataModal.tsx`에서는 암묵적으로 훅의 반환값 타입을 통해 사용되므로 별도 import 불필요.

---

## 8. 리스크 + 롤백 전략

### 리스크

| 리스크 | 가능성 | 영향도 | 대응 |
|--------|--------|--------|------|
| `CopiedField` 타입 참조 경로 오류 | Low | Low | Phase 4 전에 `npm run typecheck`로 사전 검출 |
| `model/` 디렉토리가 FSD 위반으로 판단될 경우 | Low | Low | `ui/_hooks/useMetadataClipboard.ts`로 위치 변경 후 import 경로만 수정 |
| `CharacterCountBar`에 `"use client"` 누락 시 서버 렌더링 오류 | Low | Medium | 부모인 `YoutubeMetadataModal`이 이미 `"use client"`이므로 자동으로 클라이언트 컴포넌트 경계 내에 포함됨. 별도 선언 불필요. |
| Phase 4에서 `youtubeHashtags` → `hashtags` 변수명 교체 누락 | Medium | Low | `npm run typecheck`와 `npm run lint`가 미사용 변수를 잡아냄 |

### 롤백 전략

- Phase 1-3은 기존 파일을 수정하지 않으므로 롤백이 필요 없다. 신규 파일만 삭제하면 원상 복귀된다.
- Phase 4에서 문제 발생 시: `git checkout src/fsd/widgets/clip-display/ui/_component/YoutubeMetadataModal.tsx`로 즉시 원복. 신규 파일 4개는 남아 있어도 동작에 영향 없음.

---

## 9. 검증 전략

### 타입 검증

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint
```

두 명령 모두 Phase 1-4 각각 완료 후 실행한다.

### 수동 확인 시나리오

| 시나리오 | 확인 항목 |
|----------|-----------|
| YouTube Metadata Sheet 열기 | 클립 카드 → More 메뉴 → YouTube Metadata 클릭 → Sheet 우측에서 슬라이드 인 |
| Title 탭 복사 | Title 탭 선택 → "Copy Title" 클릭 → "Copied!" 표시 → 2초 후 "Copy Title"로 복원 |
| Description 탭 복사 | Description 탭 선택 → 설명 표시 확인 → 복사 정상 동작 |
| Hashtags 탭 개별 복사 | Hashtags 탭 선택 → 개별 태그 클릭 → clipboard에 태그 텍스트 복사 확인 |
| Copy All | Footer의 "Copy All" 클릭 → 전체 메타데이터가 줄바꿈 구분으로 clipboard에 복사됨 |
| 메타데이터 없는 클립 | `youtubeTitle`이 null인 클립 → "Not available" italic 텍스트 표시 |
| Sheet 닫기 | X 버튼 / Close 버튼 / 오버레이 클릭 → Sheet 닫힘 |

### 추가 테스트 (이번 범위 외, 추후 작업)

- `useMetadataClipboard` 단위 테스트: `copyToClipboard` mock 후 `copiedField` 상태 전이, `COPY_FEEDBACK_DELAY_MS` 타이머 검증
- `formatAllMetadataForCopy` 단위 테스트: null 필드 filter 동작, join 결과 검증
