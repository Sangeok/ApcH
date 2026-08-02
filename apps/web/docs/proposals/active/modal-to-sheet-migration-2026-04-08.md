---
status: "pending"
stage: "draft"
proposal-size: "standard"
created-at: "2026-04-10"
approved-by: null
approved-at: null
approval-scope: null
completed-at: null
verification-summary: null
closed-at: null
closed-by: null
closed-reason: null
owners: []
related: []
---

# Modal → Radix Sheet 마이그레이션 제안

> **Date**: 2026-04-08
> **Scope**: `src/fsd/widgets/clip-display/ui/_component/`
> **Priority**: Medium
> **분류**: UI 재구현 (단순 리팩토링 아님)

---

## 배경

`refactoring-proposal-2025-04-06.md` 항목 6.2의 미적용 항목이다. 해당 제안서에서 "의존성 설치 → 컴포넌트 신규 생성 → 커스텀 애니메이션 재구현 → 접근성 동작 변경이 수반되므로 **별도 PR 필수**"로 명시되어 별도 처리가 필요한 작업이다.

---

## 현황

### 대상 파일

| 파일 | 현재 구현 방식 | 누락 기능 |
|------|--------------|-----------|
| `ScriptModal.tsx` | 커스텀 오버레이 + `useEffect` 직접 구현 | 포커스 트랩, 중첩 포커스, 스크린 리더 알림 |
| `YoutubeMetadataModal.tsx` | 커스텀 오버레이만 구현 | Escape 키, 스크롤 잠금, 포커스 관리 전부 누락 |

### ScriptModal 현재 구현

```tsx
// ScriptModal.tsx:23-45
useEffect(() => {
  if (!isOpen) return;
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") { onClose(); }
  };
  document.addEventListener("keydown", handleKeyDown);
  document.body.style.overflow = "hidden";
  const raf = requestAnimationFrame(() => { closeButtonRef.current?.focus(); });
  return () => {
    cancelAnimationFrame(raf);
    document.removeEventListener("keydown", handleKeyDown);
    document.body.style.overflow = originalOverflow;
  };
}, [isOpen, onClose]);
```

Escape 키, 스크롤 잠금, 포커스 이동을 수작업으로 구현했다. 포커스 트랩(모달 안에서만 Tab 이동)은 없다.

### YoutubeMetadataModal 현재 구현

```tsx
// YoutubeMetadataModal.tsx:130-133
<div className="animate-in fade-in fixed inset-0 z-50 duration-200">
  <div className="absolute inset-0 bg-gradient-to-br ..." onClick={onClose} />
  <div role="dialog" aria-modal="true" ...>
```

오버레이 클릭 닫기만 있다. Escape 키·스크롤 잠금·포커스 관리 없음.

---

## 수정 방안

두 모달 모두 shadcn `Sheet`로 교체한다.

- `ScriptModal` → `Sheet` (side panel, 우측 슬라이드인)
- `YoutubeMetadataModal` → `Sheet` (side panel, 우측 슬라이드인)

Sheet는 Radix Dialog 위에 구축되므로 포커스 트랩, Escape 키, 스크롤 잠금, 스크린 리더 알림이 자동으로 처리된다.

---

## 사전 작업 (Prerequisites)

### 1. `components.json` alias 수정

현재 `components.json`의 alias 설정이 실제 프로젝트 구조와 **불일치**한다. `ui`뿐 아니라 `utils`도 실제 경로와 다르므로 **둘 다 수정해야 한다.** `utils`를 수정하지 않으면 생성된 `sheet.tsx`가 `import { cn } from "~/lib/utils"`를 포함하여 **빌드가 실패**한다. (기존 atoms 컴포넌트들은 이미 `~/fsd/shared/lib/utils`로 수동 수정된 상태)

```json
// 현재 (잘못됨) — src/components/ui/, src/lib/utils 디렉토리 모두 존재하지 않음
"aliases": {
  "utils": "~/lib/utils",
  "ui": "~/components/ui"
}
```

```json
// 수정 후 — 실제 프로젝트 구조에 맞춤
"aliases": {
  "utils": "~/fsd/shared/lib/utils",
  "ui": "~/fsd/shared/ui/atoms"
}
```

이 수정 없이 `npx shadcn@latest add sheet`를 실행하면:
- `ui` 미수정 시: `src/components/ui/sheet.tsx`에 파일이 생성되어 import 경로 불일치
- `utils` 미수정 시: 생성된 `sheet.tsx`가 `~/lib/utils`를 import하여 **빌드 실패**

### 2. 의존성 설치

`@radix-ui/react-dialog`가 현재 `package.json`에 **없다**.

```bash
npx shadcn@latest add sheet
```

실행 시 자동으로:
- `@radix-ui/react-dialog` 설치
- `src/fsd/shared/ui/atoms/sheet.tsx` 생성 (1단계 alias 수정 후 기준)

### 3. 설치 확인

```bash
# package.json에 추가 확인
grep "@radix-ui/react-dialog" package.json

# 파일 생성 확인 (alias 수정 후 경로)
ls src/fsd/shared/ui/atoms/sheet.tsx
```

---

## 구현 계획

### ScriptModal 교체

현재 `ScriptModal`은 `ClipCard.tsx`에서 다음과 같이 사용된다:

```tsx
// ClipCard.tsx:61-65
<ScriptModal
  clip={clip}
  isOpen={isScriptOpen}
  onClose={() => setIsScriptOpen(false)}
/>
```

교체 후 인터페이스는 동일하게 유지한다. 내부에서 `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle`을 사용한다.

> **⚠️ 모바일 UX 변경**: 현재 ScriptModal은 모바일에서 **하단 시트**(`inset-x-0 bottom-0 rounded-t-2xl`), 데스크탑에서 **우측 패널**(`md:right-0 md:rounded-l-2xl`)로 동작한다. shadcn Sheet의 `side` prop은 단일 값이라 반응형 전환을 지원하지 않으므로, `side="right"` 적용 시 모바일에서도 우측 슬라이드로 변경된다. 모바일 하단 시트 패턴(엄지 접근성)이 사라지는 점을 감수해야 한다.

```tsx
// ScriptModal.tsx — 교체 후 구조
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "~/fsd/shared/ui/atoms/sheet";

export function ScriptModal({ clip, isOpen, onClose }: ScriptModalProps) {
  const scriptText = clip.scriptText?.trim() ?? "";
  const hasScript = scriptText.length > 0;
  // ... formatTimestamp 로직 유지 ...

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="flex w-full max-w-md flex-col">
        <SheetHeader>
          <SheetTitle>Script</SheetTitle>
          {/* timecodeLabel 표시 */}
        </SheetHeader>
        {/* 본문 + Copy/Close 버튼 */}
      </SheetContent>
    </Sheet>
  );
}
```

제거 가능한 코드:
- `if (!isOpen) return null` early return (Sheet의 `open` prop이 visibility를 관리하므로 불필요. 남겨두면 exit 애니메이션이 작동하지 않음)
- `useEffect` (Escape, 스크롤, 포커스 처리 전체)
- `closeButtonRef`, `scriptDialogTitleId`
- `useId`, `useRef` import
- 커스텀 오버레이 div

### YoutubeMetadataModal 교체

> **⚠️ 모바일 UX 변경**: ScriptModal과 마찬가지로, 현재 YoutubeMetadataModal도 모바일에서 **하단 시트**(`inset-x-0 bottom-0 slide-in-from-bottom`), 데스크탑에서 **우측 패널**(`md:right-0 md:slide-in-from-right`)로 동작한다. `side="right"` 적용 시 모바일에서도 우측 슬라이드로 변경되어 엄지 접근성이 사라진다.

`YoutubeMetadataModal`의 커스텀 애니메이션(`slide-in-from-bottom`, `slide-in-from-right`, gradient 배경)을 Sheet로 재현해야 한다.

```tsx
// YoutubeMetadataModal.tsx — 교체 후 구조
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "~/fsd/shared/ui/atoms/sheet";

export function YoutubeMetadataModal({ clip, isOpen, onClose }: YoutubeMetadataModalProps) {
  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        className="flex w-full max-w-md flex-col overflow-hidden p-0"
      >
        {/* 헤더: gradient 배경 + Hash 아이콘 재구현 */}
        {/* 본문: Tabs 구조 그대로 유지 */}
        {/* 푸터: Close + Copy All 버튼 유지 */}
      </SheetContent>
    </Sheet>
  );
}
```

> **오버레이 커스터마이징**: 현재 YoutubeMetadataModal은 `bg-gradient-to-br from-black/60 via-black/50 to-black/60 backdrop-blur-md` gradient 오버레이를 사용하고, ScriptModal은 `bg-black/50 backdrop-blur-sm` 단색 오버레이를 사용한다. 두 모달의 오버레이 스타일이 다르므로, `sheet.tsx`의 `SheetOverlay` className을 직접 수정하면 한쪽에만 맞춰진다. **`SheetContent`에 `overlayClassName` prop을 추가**하여 호출부에서 오버레이 스타일을 개별 지정한다.
>
> ```tsx
> // sheet.tsx — SheetContent에 overlayClassName prop 추가
> function SheetContent({ overlayClassName, className, children, ...props }) {
>   return (
>     <SheetPortal>
>       <SheetOverlay className={overlayClassName} />
>       <SheetPrimitive.Content className={cn("...", className)} {...props}>
>         {children}
>       </SheetPrimitive.Content>
>     </SheetPortal>
>   );
> }
>
> // ScriptModal — 단색 오버레이
> <SheetContent overlayClassName="bg-black/50 backdrop-blur-sm" ...>
>
> // YoutubeMetadataModal — gradient 오버레이
> <SheetContent overlayClassName="bg-gradient-to-br from-black/60 via-black/50 to-black/60 backdrop-blur-md" ...>
> ```

> **커스텀 boxShadow 보존**: 현재 dialog에 `style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.05), 0 25px 50px -12px rgba(0,0,0,0.5)" }}`가 적용되어 있다. `SheetContent`에 동일한 인라인 style 또는 Tailwind `shadow-*` 클래스로 이 효과를 유지해야 한다.

> **닫기 버튼 중복 처리**: `SheetContent`는 기본적으로 우상단에 `X` 닫기 버튼을 렌더링한다. `YoutubeMetadataModal`과 `ScriptModal` 모두 커스텀 닫기 버튼이 있으므로 기본 버튼을 숨겨야 한다. **`sheet.tsx`의 `SheetContent`에 `showCloseButton` prop(기본값 `true`)을 추가**하여 호출부에서 제어한다. `sheet.tsx`에서 `<SheetClose>` JSX를 직접 제거하면 향후 Sheet를 사용하는 모든 곳에서 기본 닫기 버튼이 없어지는 전역 영향이 있으므로 prop 방식을 사용한다.
>
> ```tsx
> // sheet.tsx — SheetContent에 showCloseButton prop 추가
> function SheetContent({ showCloseButton = true, className, children, ...props }) {
>   return (
>     <SheetPortal>
>       <SheetOverlay />
>       <SheetPrimitive.Content className={cn("...", className)} {...props}>
>         {children}
>         {showCloseButton && (
>           <SheetPrimitive.Close className="...">
>             <X className="h-4 w-4" />
>           </SheetPrimitive.Close>
>         )}
>       </SheetPrimitive.Content>
>     </SheetPortal>
>   );
> }
>
> // ScriptModal, YoutubeMetadataModal — 커스텀 닫기 버튼 사용
> <SheetContent showCloseButton={false} ...>
> ```
>
> **⚠️ 내부 자식 애니메이션 충돌**: YoutubeMetadataModal의 자식 요소들에 staggered delay 기반 순차 등장 애니메이션이 있다.
>
> | 요소 | 클래스 |
> |------|--------|
> | Header (:149) | `animate-in fade-in slide-in-from-top delay-75` |
> | Content (:178) | `animate-in fade-in delay-150` |
> | Footer (:306) | `animate-in fade-in slide-in-from-bottom delay-200` |
>
> `SheetContent`도 `tw-animate-css` 기반 `animate-in slide-in-from-right`를 사용하므로, 컨테이너가 슬라이드인하는 동안 내부 요소들이 독립적으로 fade/slide 애니메이션을 시작하여 **이중 애니메이션**이 발생한다. 마이그레이션 시 내부 자식 요소의 `animate-in` 관련 클래스(`animate-in`, `fade-in`, `slide-in-from-*`, `delay-*`)를 **모두 제거**한다. Sheet의 진입 애니메이션이 이를 대체한다.
>
> **Tabs import 정리**: 현재 `@radix-ui/react-tabs`를 직접 import하고 있으나(`YoutubeMetadataModal.tsx:3`), `src/fsd/shared/ui/atoms/tabs.tsx`에 shadcn 래핑 버전이 이미 존재한다. 마이그레이션 시 `~/fsd/shared/ui/atoms/tabs`에서 import하도록 변경한다.
>
> **⚠️ Tabs atoms 래퍼 스타일 충돌**: atoms 래퍼는 `cn(기본스타일, className)` 구조이므로, 커스텀 className으로 override되지 않는 기본 클래스가 잔존하여 시각적 차이가 발생한다. 구체적 충돌 지점:
>
> | 컴포넌트 | atoms 기본값 | 현재 커스텀 className | 충돌 |
> |----------|-------------|---------------------|------|
> | `Tabs` root (`tabs.tsx:15`) | `flex flex-col gap-2` | 없음 | `gap-2`(8px)가 추가되어 `TabsContent`의 `mt-6`(24px)과 **합산** → 간격 24px → 32px |
> | `TabsList` (`tabs.tsx:29-30`) | `h-9 inline-flex w-fit p-[3px]` | `grid w-full grid-cols-3 p-1.5` | `grid`/`w-full`/`p-1.5`은 tailwind-merge로 override되나, **`h-9`는 override 안 됨** → 높이 36px 고정 (현재는 콘텐츠 기반) |
> | `TabsTrigger` (`tabs.tsx:44-46`) | `h-[calc(100%-1px)] flex-1 dark:...` | `rounded-lg px-3 py-2.5 text-xs` | **`h-[calc(100%-1px)]`**로 35px 제한 + 다크모드 전용 스타일 추가 |
> | `TabsContent` (`tabs.tsx:58-59`) | `flex-1 outline-none` | `mt-6 space-y-4` | `flex-1` 추가 (레이아웃 영향 미미) |
>
> **해소 방법**: `TabsContent`의 `mt-6`을 `mt-4`로 줄여 `gap-2`와의 합산 간격을 보정하고, `TabsList`에 `h-auto`를 추가하여 `h-9` 고정을 해제한다. `TabsTrigger`의 `h-[calc(100%-1px)]`은 `h-auto`로 override한다.
>
> ```tsx
> // 수정 후
> <TabsList className="bg-muted/30 grid h-auto w-full grid-cols-3 gap-1.5 rounded-xl p-1.5 backdrop-blur-sm">
>   <TabsTrigger className="h-auto rounded-lg px-3 py-2.5 text-xs font-semibold ...">
> </TabsList>
> <TabsContent className="... mt-4 space-y-4 ..." />
> ```

---

## 체크리스트

### 사전 준비
- [ ] `components.json`의 `aliases.utils`를 `~/fsd/shared/lib/utils`로 수정
- [ ] `components.json`의 `aliases.ui`를 `~/fsd/shared/ui/atoms`로 수정
- [ ] `npx shadcn@latest add sheet` 실행
- [ ] `src/fsd/shared/ui/atoms/sheet.tsx` 생성 확인
- [ ] 생성된 `sheet.tsx`의 `cn` import 경로가 `~/fsd/shared/lib/utils`인지 확인
- [ ] `package.json`에 `@radix-ui/react-dialog` 추가 확인
- [ ] `sheet.tsx`의 `SheetContent`에 `overlayClassName` prop 추가 (호출부별 오버레이 스타일 개별 지정)
- [ ] `sheet.tsx`의 `SheetContent`에 `showCloseButton` prop 추가 (기본값 `true`, 호출부에서 기본 닫기 버튼 제어)

### ScriptModal
- [ ] `if (!isOpen) return null` early return 제거 (Sheet `open` prop이 visibility 관리, 미제거 시 exit 애니메이션 깨짐)
- [ ] `useEffect` 전체 제거 (Escape, 스크롤 잠금, 포커스 이동)
- [ ] `useId`, `useRef`, `closeButtonRef` 제거
- [ ] 커스텀 오버레이 div 제거
- [ ] `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle` 적용
- [ ] `overlayClassName` prop으로 오버레이 스타일 지정 (`bg-black/50 backdrop-blur-sm`)
- [ ] `showCloseButton={false}` 지정 (커스텀 닫기 버튼 유지)
- [ ] 포커스 트랩 동작 확인 (Tab 키가 Sheet 내부에서만 순환)
- [ ] Escape 키로 닫히는지 확인
- [ ] 스크롤 잠금 확인

### YoutubeMetadataModal
- [ ] `if (!isOpen) return null` early return 제거 (Sheet `open` prop이 visibility 관리, 미제거 시 exit 애니메이션 깨짐)
- [ ] 커스텀 오버레이 div 제거
- [ ] `Sheet`, `SheetContent` 적용
- [ ] `overlayClassName` prop으로 gradient backdrop 지정 (`from-black/60 via-black/50 to-black/60 backdrop-blur-md`)
- [ ] `showCloseButton={false}` 지정 (커스텀 닫기 버튼 유지)
- [ ] 커스텀 boxShadow 인라인 스타일을 `SheetContent`에 적용
- [ ] 내부 자식 요소의 `animate-in` 관련 클래스 모두 제거 (Header: `animate-in fade-in slide-in-from-top delay-75`, Content: `animate-in fade-in delay-150`, Footer: `animate-in fade-in slide-in-from-bottom delay-200`)
- [ ] `@radix-ui/react-tabs` 직접 import를 `~/fsd/shared/ui/atoms/tabs`로 변경
- [ ] atoms Tabs 래퍼 기본 스타일 충돌 해소 (아래 "Tabs atoms 래퍼 스타일 충돌" 섹션 참고)
- [ ] 헤더 gradient 배경 및 Hash 아이콘 스타일 재구현
- [ ] Tabs 구조(Title / Description / Hashtags) 그대로 유지
- [ ] 푸터 Close + Copy All 버튼 유지
- [ ] Escape 키로 닫히는지 확인
- [ ] 스크롤 잠금 확인

### 공통
- [ ] `npm run typecheck` 통과
- [ ] `npm run lint` 통과
- [ ] 모바일에서 우측 슬라이드 UX 수용 가능한지 확인 (기존 하단 시트 → 우측 전환)
- [ ] 브라우저에서 시각적 회귀 없음 확인 (모바일/데스크탑)
- [ ] 스크린 리더 알림 확인 (`role="dialog"`, `aria-label` 자동 적용)

---

## 변경 파일 목록

| 파일 | 변경 종류 |
|------|-----------|
| `components.json` | `aliases.ui`, `aliases.utils` 경로 수정 |
| `package.json` | `@radix-ui/react-dialog` 추가 (npx shadcn 자동) |
| `src/fsd/shared/ui/atoms/sheet.tsx` | 신규 생성 (npx shadcn 자동) + `overlayClassName`, `showCloseButton` prop 추가 |
| `src/fsd/widgets/clip-display/ui/_component/ScriptModal.tsx` | UI 재구현 |
| `src/fsd/widgets/clip-display/ui/_component/YoutubeMetadataModal.tsx` | UI 재구현 |
