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

# UploadedFileCard 리팩토링 문서

> 브리프 기반으로 작성됨 — dev-doc-review 검증 완료 (2026-04-13)

## 1. 배경/동기

`UploadedFileCard` 컴포넌트는 업로드된 파일 목록에서 각 파일을 카드 형태로 표시하며, 내부에 영상 재생 기능을 포함한다. 기능적으로는 정상 동작하지만, 다음 두 가지 구조적 문제가 존재한다.

**HTML 접근성 위반**: 카드 전체를 감싸는 `<Link>`(`<a>`) 내부에 `controls` 속성이 켜진 `<video>` 요소가 배치되어 있다. HTML5 스펙에서 `<a>` 태그 안에 interactive content를 넣는 것은 명시적으로 금지된 구조다. 현재 `e.stopPropagation()`으로 클릭 충돌만 임시 회피하고 있으나, 스크린 리더 등 보조 기기에서의 시맨틱 해석 오류는 해결되지 않는다.

**N+1 API 요청**: `UploadedFileList`가 카드를 렌더링할 때, 각 카드가 마운트 시점에 `usePlayUrl` 훅을 통해 presigned URL을 즉시 요청한다. 목록에 20개의 파일이 있으면 20건의 `getOriginalPlayUrl` 서버 액션(인증 + DB 조회 + S3 presigned URL 생성)이 동시 발생한다. 대부분의 사용자는 리스트에서 영상을 재생하지 않고 상세 페이지로 이동하므로, 이 요청들은 불필요한 서버 부하와 네트워크 비용을 발생시킨다.

## 2. 분석 결과

### 접근성/웹 표준 분석

- **발견된 문제**: `<Link>` (→ `<a>`) 내부에 `<video controls>` (interactive content) 중첩
- **심각도**: High — HTML5 스펙 위반, 보조 기기 접근성 저하
- **위치**: `src/fsd/widgets/uploaded-file-list/ui/_component/UploadedFileCard.tsx:30,50-57`

```tsx
// 현재 구조: <a> 안에 interactive content
<Link href={detailHref}>          {/* <a> 역할 */}
  <Card>
    <CardContent>
      <div onClick={(e) => e.stopPropagation()}>
        <video controls ... />    {/* interactive content */}
      </div>
    </CardContent>
  </Card>
</Link>
```

### 네트워크 성능 분석

- **발견된 문제**: 카드 마운트 시 `usePlayUrl` 훅이 즉시 API 호출 → 리스트 렌더 시 N건 동시 요청
- **심각도**: High — `getOriginalPlayUrl`은 인증 + DB 조회 + S3 presigned URL 생성을 수행하는 서버 액션으로, 불필요한 호출의 비용이 높음
- **위치**: `src/fsd/widgets/uploaded-file-list/ui/_component/UploadedFileCard.tsx:27`, `src/fsd/shared/hooks/usePlayUrl.ts:42`

```tsx
// UploadedFileCard.tsx:27 — 마운트 즉시 호출
const { playUrl, isLoading, error } = usePlayUrl(file.id, getOriginalPlayUrl);
```

```tsx
// usePlayUrl.ts:22-46 — enabled 제어 없이 즉시 fetch
useEffect(() => {
  let cancelled = false;
  const fetchUrl = async () => {
    setIsLoading(true);
    // ... fetch 실행
  };
  void fetchUrl();  // 마운트 시 무조건 실행
  return () => { cancelled = true; };
}, [id]);
```

## 3. 해결 방안 요약

두 가지 독립적인 개선을 하나의 리팩토링으로 묶는다.

1. **`usePlayUrl` 훅에 `enabled` 옵션 추가**: fetch 시점을 호출부에서 제어할 수 있게 한다. 기본값 `true`로 기존 사용처(`OriginalMediaCard`, `useClipPlayUrl`)는 변경 없이 동작한다.
2. **`UploadedFileCard` HTML 구조 변경**: `<Link>` 래퍼를 제거하고 `<CardTitle>` 안에 `<Link>`를 배치하여 interactive element 중첩을 해소한다. `shouldPlay` 상태로 lazy fetch를 구현한다.

## 4. 대안 분석

| 대안 | 설명 | 기각 사유 |
|------|------|----------|
| IntersectionObserver viewport 진입 시 fetch | 카드가 뷰포트에 진입하면 presigned URL 자동 요청 | 스크롤만 해도 요청 발생, N+1 문제를 줄이지만 제거하지 못함 |
| Server Component에서 presigned URL 일괄 생성 | 리스트 렌더 시점에 서버에서 URL 일괄 생성 후 props 전달 | S3 presigned URL 만료 시간(3600s) 관리 복잡, 대량 생성 시 서버 응답 지연 |
| `<video>` 제거 후 정적 썸네일 표시 | 리스트에서는 썸네일만, 상세 페이지에서만 재생 | 썸네일 생성 인프라 미존재, 별도 작업 필요 |
| **채택: `enabled` 옵션 + 사용자 액션 기반 fetch** | 재생 버튼 클릭 시에만 fetch | 최소 변경(2파일)으로 N+1 완전 제거, 기존 사용처 영향 없음 |

## 5. 구현 계획

### `src/fsd/shared/hooks/usePlayUrl.ts`

`enabled` 옵션을 추가하여 fetch 시점을 호출부에서 제어할 수 있도록 한다. 기본값 `true`로 기존 사용처(`OriginalMediaCard`, `useClipPlayUrl`)는 변경 없이 동작한다.

**Before:**

```typescript
interface UsePlayUrlReturn {
  playUrl: string | null;
  isLoading: boolean;
  error: string | null;
}

export function usePlayUrl(
  id: string,
  fetcher: (id: string) => Promise<ActionResult<{ url: string }>>,
): UsePlayUrlReturn {
  const [playUrl, setPlayUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let cancelled = false;
    const fetchUrl = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await fetcherRef.current(id);
        if (cancelled) return;
        if (result.success) {
          setPlayUrl(result.data.url);
        } else {
          setError(result.error);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void fetchUrl();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return { playUrl, isLoading, error };
}
```

**After:**

```typescript
interface UsePlayUrlOptions {
  enabled?: boolean;
}

interface UsePlayUrlReturn {
  playUrl: string | null;
  isLoading: boolean;
  error: string | null;
}

export function usePlayUrl(
  id: string,
  fetcher: (id: string) => Promise<ActionResult<{ url: string }>>,
  options?: UsePlayUrlOptions,
): UsePlayUrlReturn {
  const enabled = options?.enabled ?? true;
  const [playUrl, setPlayUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const fetchUrl = async () => {
      try {
        const result = await fetcherRef.current(id);
        if (cancelled) return;
        if (result.success) {
          setPlayUrl(result.data.url);
        } else {
          setError(result.error);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void fetchUrl();
    return () => {
      cancelled = true;
    };
  }, [id, enabled]);

  return { playUrl, isLoading, error };
}
```

**변경 요약**:
- `UsePlayUrlOptions` 인터페이스 추가 (`enabled` 옵션)
- `enabled` 기본값 `true` → 기존 사용처 영향 없음
- `isLoading` 초기값을 `enabled`로 변경 — `enabled: true`(기존 사용처)에서는 기존과 동일하게 `true`로 시작, `enabled: false`(lazy fetch)에서는 `false`로 시작하여 기존 소비자(`ClipVideoPlayer` 등)의 시각적 퇴행 방지
- `setIsLoading(true)`, `setError(null)`을 effect 본문으로 이동하여 동기적으로 실행
- `useEffect` 의존성 배열에 `enabled` 추가

### `src/fsd/widgets/uploaded-file-list/ui/_component/UploadedFileCard.tsx`

1. `<Link>` 래퍼를 제거하고 `<CardTitle>` 안에 `<Link>`를 배치하여 interactive element 중첩을 해소한다.
2. `shouldPlay` 상태를 도입하여 사용자가 재생을 요청할 때만 `usePlayUrl`이 fetch를 시작하도록 한다.

**Before:**

```tsx
import Link from "next/link";
import { Badge } from "~/fsd/shared/ui/atoms/badge";
import { usePlayUrl } from "~/fsd/shared/hooks/usePlayUrl";
import { getOriginalPlayUrl } from "~/fsd/features/upload/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/fsd/shared/ui/atoms/card";
import type { UploadedFileSummary } from "~/fsd/widgets/uploaded-file-list/model/types";

// ... (dateFormatter unchanged)

export function UploadedFileCard({ file }: UploadedFileCardProps) {
  const detailHref = `/dashboard/uploads/${file.id}`;
  const createdLabel = dateFormatter.format(new Date(file.createdAt));
  const { playUrl, isLoading, error } = usePlayUrl(file.id, getOriginalPlayUrl);

  return (
    <Link href={detailHref} className="block focus:outline-none">
      <Card className="hover:border-primary h-full transition focus-visible:ring-2">
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <CardTitle className="text-base font-medium">
            {file.fileName}
          </CardTitle>
          <Badge variant="outline" className="text-xs capitalize">
            {file.status}
          </Badge>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-2 text-sm">
          {isLoading && (
            <div className="aspect-video w-full animate-pulse rounded-md bg-muted" />
          )}
          {!isLoading && error && (
            <div className="aspect-video flex items-center justify-center rounded-md bg-muted">
              <p className="text-muted-foreground text-xs">Video unavailable</p>
            </div>
          )}
          {!isLoading && playUrl && (
            <div onClick={(e) => e.stopPropagation()}>
              <video
                src={playUrl}
                controls
                preload="metadata"
                className="w-full rounded-md object-cover"
              />
            </div>
          )}
          <p>Uploaded: {createdLabel}</p>
          <p>{file.clipsCount} generated clips</p>
        </CardContent>
      </Card>
    </Link>
  );
}
```

**After:**

```tsx
import { useState } from "react";
import Link from "next/link";
import { Play } from "lucide-react";
import { Badge } from "~/fsd/shared/ui/atoms/badge";
import { usePlayUrl } from "~/fsd/shared/hooks/usePlayUrl";
import { getOriginalPlayUrl } from "~/fsd/features/upload/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/fsd/shared/ui/atoms/card";
import type { UploadedFileSummary } from "~/fsd/widgets/uploaded-file-list/model/types";

// ... (dateFormatter unchanged)

export function UploadedFileCard({ file }: UploadedFileCardProps) {
  const detailHref = `/dashboard/uploads/${file.id}`;
  const createdLabel = dateFormatter.format(new Date(file.createdAt));
  const [shouldPlay, setShouldPlay] = useState(false);
  const { playUrl, error } = usePlayUrl(
    file.id,
    getOriginalPlayUrl,
    { enabled: shouldPlay },
  );

  return (
    <Card className="h-full transition">
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <CardTitle className="text-base font-medium">
          <Link
            href={detailHref}
            className="hover:underline focus:outline-none focus-visible:ring-2"
          >
            {file.fileName}
          </Link>
        </CardTitle>
        <Badge variant="outline" className="text-xs capitalize">
          {file.status}
        </Badge>
      </CardHeader>
      <CardContent className="text-muted-foreground space-y-2 text-sm">
        {!shouldPlay && (
          <button
            type="button"
            aria-label="영상 재생"
            onClick={() => setShouldPlay(true)}
            className="aspect-video w-full rounded-md bg-muted flex items-center justify-center hover:bg-muted/80 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Play className="h-8 w-8 text-muted-foreground" />
          </button>
        )}
        {shouldPlay && !playUrl && !error && (
          <div className="aspect-video w-full animate-pulse rounded-md bg-muted" />
        )}
        {shouldPlay && error && (
          <div className="aspect-video flex items-center justify-center rounded-md bg-muted">
            <p className="text-muted-foreground text-xs">Video unavailable</p>
          </div>
        )}
        {shouldPlay && playUrl && (
          <video
            ref={(el) => { void el?.play().catch(() => {}); }}
            src={playUrl}
            controls
            playsInline
            preload="metadata"
            className="w-full rounded-md object-cover"
          />
        )}
        <p>Uploaded: {createdLabel}</p>
        <p>{file.clipsCount} generated clips</p>
      </CardContent>
    </Card>
  );
}
```

**변경 요약**:
- `<Link>` 래퍼 제거 → `<CardTitle>` 안에 `<Link>` 배치 (접근성 해소)
- `shouldPlay` 상태 추가, `usePlayUrl`에 `{ enabled: shouldPlay }` 전달 (lazy fetch)
- 비디오 미재생 상태에서 `Play` 아이콘 버튼을 placeholder로 표시
- 재생 버튼에 `aria-label="영상 재생"` 추가하여 스크린 리더 접근성 보장
- 재생 버튼에 `focus-visible` 스타일 추가로 키보드 포커스 시각적 표시
- 재생 요청 시 callback ref에서 `play().catch(() => {})` 호출로 즉시 재생 시도 — `autoPlay` 속성은 모바일 브라우저에서 비동기 fetch 이후 사용자 제스처 체인이 끊겨 동작하지 않을 수 있으므로 사용하지 않음
- `playsInline` 추가하여 iOS에서 전체화면 전환 없이 인라인 재생
- `hover:border-primary` 제거 — `<Link>` 래퍼 제거 후 카드 전체가 클릭 불가하므로, hover 시 클릭 어포던스가 실제 동작과 불일치
- **UX 트레이드오프**: 카드 전체 클릭 영역이 제목 텍스트로 축소됨. 접근성 규격 준수를 위한 의도적 선택이며, 필요시 CSS stretched-link 패턴(`::after` + `position: absolute`)으로 카드 전체 클릭을 복원할 수 있음
- `e.stopPropagation()` wrapper 제거 (더 이상 `<Link>` 내부가 아니므로 불필요)
- 렌더링 조건을 `isLoading` 대신 실제 데이터 상태(`playUrl`, `error`)로 판단하도록 변경 — `shouldPlay` 전환 시 effect 실행 전 1프레임 렌더링 갭 방지

## 6. 실행 순서

### Phase 1: `usePlayUrl` 훅에 `enabled` 옵션 추가

- **작업 내용**: `usePlayUrl.ts`에 `UsePlayUrlOptions` 인터페이스와 `enabled` 파라미터를 추가한다. 기본값 `true`로 설정하여 기존 사용처에 영향을 주지 않는다.
- **검증**:
  - `tsc --noEmit` 통과
  - 상세 페이지(`OriginalMediaCard`)에서 영상이 기존과 동일하게 즉시 로드되는지 브라우저에서 확인
  - `useClipPlayUrl` 래퍼 훅의 동작에 변화가 없는지 확인

### Phase 2: `UploadedFileCard` HTML 구조 변경 및 lazy fetch 적용

- **작업 내용**: `<Link>` 래퍼를 제거하고 `<CardTitle>` 안에 `<Link>`를 배치한다. `shouldPlay` 상태를 도입하고, `usePlayUrl`에 `{ enabled: shouldPlay }`를 전달한다. `Play` 아이콘 버튼을 placeholder로 추가한다.
- **검증**:
  - `tsc --noEmit` 통과
  - 리스트 렌더 시 네트워크 탭에서 `getOriginalPlayUrl` 호출이 없는지 확인
  - 카드 제목 클릭 시 상세 페이지(`/dashboard/uploads/[id]`)로 이동하는지 확인
  - 재생 버튼 클릭 시 비디오가 로드되고 재생되는지 확인
  - 키보드 탐색(Tab → Enter)으로 제목 링크와 재생 버튼 모두 접근 가능한지 확인

## 7. 영향 범위

### 직접 수정 대상

| 파일 | 변경 유형 |
|------|----------|
| `src/fsd/shared/hooks/usePlayUrl.ts` | 수정 — `enabled` 옵션 추가 |
| `src/fsd/widgets/uploaded-file-list/ui/_component/UploadedFileCard.tsx` | 수정 — HTML 구조 변경 + lazy fetch |

### 간접 영향 (변경 불필요)

| 파일 | 영향 | 변경 필요 여부 |
|------|------|---------------|
| `src/fsd/pages/upload-detail/ui/_component/OriginalMediaCard.tsx` | `usePlayUrl`의 기본 동작(`enabled: true`)을 사용 | 불필요 |
| `src/fsd/shared/hooks/useClipPlayUrl.ts` | `usePlayUrl` 래퍼, options 미전달 시 기본값 적용 | 불필요 |
| `src/fsd/widgets/uploaded-file-list/ui/index.tsx` | `UploadedFileCard`를 렌더하는 부모, props 변경 없음 | 불필요 |
| `src/fsd/widgets/clip-display/ui/_component/ClipVideoPlayer.tsx` | `useClipPlayUrl` → `usePlayUrl` 경로로 `isLoading` 초기값에 의존하여 렌더링 분기 | 불필요 — `isLoading` 초기값을 `enabled`로 설정하여 기존 동작(`true`) 보존 |
| `src/fsd/widgets/clip-display/ui/_component/ClipCard.tsx` | `useClipPlayUrl` 호출부 | 불필요 |

## 8. 리스크 및 롤백

### 리스크

| 리스크 | 심각도 | 완화 방안 |
|--------|--------|----------|
| 카드 전체 클릭 영역이 제목 텍스트로 축소되어 사용성 저하 가능 | Medium | 제목에 `hover:underline` 시각적 힌트 제공, 추후 CSS stretched-link 패턴으로 복원 가능 |
| 모바일 브라우저에서 `el.play()` 자동 재생 차단 | Low | `controls` 속성으로 수동 재생 가능, `catch(() => {})` 로 에러 무시 |
| `enabled` false → true 전환 시 1프레임 로딩 깜박임 | Low | `isLoading` 대신 데이터 상태(`playUrl`, `error`) 기반 렌더링으로 깜박임 최소화 |

### 롤백 전략

- **영향 파일 2개**: `usePlayUrl.ts`, `UploadedFileCard.tsx`
- **롤백 방법**: `git revert` 1회로 원복 가능
- **Phase 단위 롤백**: `usePlayUrl`의 `enabled` 기본값이 `true`이므로, Phase 1만 유지하고 Phase 2를 롤백해도 기존 동작에 영향 없음

## 9. 검증 전략

### 타입 검증
- `tsc --noEmit` 통과 확인
- `usePlayUrl`의 기존 호출부(`OriginalMediaCard`, `useClipPlayUrl`)에서 타입 에러 없음 확인

### 수동 확인 — 리스트 페이지 (Dashboard)
- 카드 목록 렌더 시 네트워크 탭에서 `getOriginalPlayUrl` 호출이 0건인지 확인
- 카드 제목 클릭 → 상세 페이지 이동 확인
- 재생 버튼 클릭 → 로딩 스켈레톤 표시 → 비디오 로드 및 자동 재생 확인
- 키보드(Tab)로 제목 링크, 재생 버튼에 순차 포커스 가능한지 확인

### 수동 확인 — 상세 페이지 (Upload Detail)
- `OriginalMediaCard`의 영상이 기존과 동일하게 즉시 로드되는지 확인 (regression 없음)

### 수동 확인 — 에러 케이스
- 네트워크 차단 상태에서 재생 버튼 클릭 → "Video unavailable" 메시지 표시 확인

### 수동 확인 — ClipCard (Regression)
- `ClipVideoPlayer`에서 마운트 시 `Loader2` 스피너가 기존과 동일하게 표시되는지 확인 (`Play` 아이콘이 깜박이지 않아야 함)
- 클립 비디오 로드 완료 후 정상 재생 확인

### 수동 확인 — 모바일 재생
- 모바일 브라우저(iOS Safari, Android Chrome)에서 재생 버튼 클릭 시 비디오가 자동 재생되는지 확인
- 자동 재생이 차단되는 경우 `controls`를 통한 수동 재생이 가능한지 확인

### 수동 확인 — 접근성
- 스크린 리더(VoiceOver/NVDA)로 재생 버튼의 `aria-label`("영상 재생")이 올바르게 읽히는지 확인
- `<CardTitle>` 내 `<Link>`와 재생 `<button>` 사이에 interactive element 중첩이 없는지 DOM 검사로 확인
