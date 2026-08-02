# UploadedFileCard Refactoring Proposal

## 개요
`UploadedFileCard` 컴포넌트는 업로드된 파일의 카드 형태 UI를 제공하며, 내부적으로 영상 재생을 지원합니다. 하지만, 현재 코드 (2026년 4월 기준)는 기능적으로는 정상 작동함에도 불구하고 웹 표준, 네트워크 성능 측면에서 뚜렷하게 개선할 여지가 2가지 존재합니다. 본 문서는 이러한 문제점들을 파악하고 리팩토링 방안을 제안합니다.

## 대상 파일
- `src/fsd/widgets/uploaded-file-list/ui/_component/UploadedFileCard.tsx`
- `src/fsd/shared/hooks/usePlayUrl.ts`

## 주요 문제점 및 개선 방안

### 1. HTML 접근성 및 웹 표준 위반 (인터랙티브 요소 중첩)
**문제 구조 파악**
현 컴포넌트는 `<Link>` (`<a>` 태그 역할) 래퍼 내부에 카드가 있고, 그 안쪽에 `controls` 속성이 켜진 `<video>` 컴포넌트 등 대화형(Interactive) 요소가 포함되어 있습니다. `e.stopPropagation()`을 통해서 Link 클릭 충돌을 임시방편으로 막아두었으나, HTML5 표준 구조로는 **`<a>` 태그 안에 또 다른 인터랙티브 요소를 배치해서는 안됩니다.** 이는 스크린 리더 사용자나 다양한 브라우저 렌더링에서 심각한 오류와 접근성 저하를 유발합니다.

**개선 방안**
- 최상위 컨테이너로 `<Link>`를 비활성화하고, 부모를 `<div>`나 `<li>` 구조로 변경합니다.
- 카드 안의 **제목(`CardTitle`)**이나 별도에 명확한 '상세보기' 버튼을 만들어 거기를 통해 상세 링크(`/dashboard/uploads/[id]`)로 연결되도록 변경합니다. 
- 혹은, `useRouter()`를 호출하여 `onClick` 이벤트를 바인딩하되, 키보드 조작(tabIndex, onKeyDown) 핸들러를 추가합니다.

### 2. N+1 API 요청으로 인한 성능 저하 및 워터폴 현상
**문제 구조 파악**
이 카드는 리스트뷰 형태로 주로 렌더링될 확률이 큽니다. 카드 하나당 `usePlayUrl(file.id)` 훅을 호출하면서 각각 클라이언트단 비동기 API 요청(`getOriginalPlayUrl`)을 만들어냅니다. 만약 목록에 아이템이 20개가 표출된다면 컴포넌트 마운트 시 20번의 동시 다발적인 초기 로딩 통신이 발생하여 심각한 네트워크 병목이 일어납니다.

**개선 방안**
- **Lazy Fetching 도입 (가장 권장됨)**: 리스트 단계에서는 굳이 즉시 동영상 재생 URL을 가져올 필요가 없습니다. 카드가 마운트될 때는 URL 패치를 하지 않고 있다가 뷰에 진입하거나 사용자가 '재생/미리보기' 액션을 클릭하는 시점에 URL을 Fetch 하도록 훅의 동작 방식을 바꿉니다.

**주의사항**

1. **`usePlayUrl` 훅 공유 범위**: `usePlayUrl` 훅은 본 컴포넌트 외에 다음 두 경로에서도 사용됩니다.
   - `OriginalMediaCard.tsx`(`src/fsd/pages/upload-detail/ui/_component/OriginalMediaCard.tsx`) — 직접 호출
   - `useClipPlayUrl.ts`(`src/fsd/shared/hooks/useClipPlayUrl.ts`) → `ClipCard.tsx`(`src/fsd/widgets/clip-display/ui/_component/ClipCard.tsx`) — 래핑 호출

   훅 자체를 lazy 방식으로 변경하면 위 두 경로 모두 영상 URL을 즉시 가져오지 않게 되어 UX 회귀가 발생합니다. 상세 페이지(`OriginalMediaCard`)와 클립 카드(`ClipCard`) 모두 eager fetch가 적합하므로, 훅에 `enabled` 파라미터를 `default = true`로 추가하여 caller가 eager/lazy를 선택할 수 있도록 해야 합니다. 이렇게 하면 기존 소비자들은 코드 수정 없이 현행 동작을 유지합니다. 단, 훅 시그니처를 options 객체 방식 등으로 근본적으로 변경할 경우 `useClipPlayUrl`도 함께 수정해야 합니다.

2. **영상 썸네일 미리보기 손실**: 현재 리스트 카드에서 `<video preload="metadata">`를 통해 첫 프레임이 썸네일로 표시되고 있습니다. Lazy fetching 도입 시 사용자가 재생 액션을 취하기 전까지 비디오 요소 자체가 렌더되지 않으므로, 리스트에서 영상 미리보기가 완전히 사라집니다. 이는 카드의 시각적 식별력을 떨어뜨리는 UX 회귀이므로, 대체 썸네일 전략(파일 타입 아이콘, placeholder 이미지 등)을 함께 설계해야 합니다.

3. **`enabled=false`일 때 `isLoading` 영구 `true` 버그**: 현재 `usePlayUrl` 훅은 `isLoading`의 초기값이 `useState(true)`로 설정되어 있습니다. `enabled=false`로 effect를 건너뛰면 `setIsLoading(false)`가 호출되지 않아 `isLoading`이 영원히 `true`로 남습니다. 이 경우 `UploadedFileCard`에서 로딩 스켈레톤(`animate-pulse`)이 영구 표시되는 결함이 발생합니다. `enabled` 파라미터 추가 시 초기값 로직(`useState(enabled !== false)`)도 반드시 함께 수정해야 합니다.

4. **Lazy fetch 트리거 UI 부재**: 제안된 방식은 "사용자가 재생/미리보기 액션을 클릭하는 시점에 URL을 Fetch"하는 것이나, 현재 `UploadedFileCard`에는 재생 버튼이 존재하지 않습니다. `enabled=false`로 시작하면 `playUrl`이 `null`이므로 `<video>`가 렌더되지 않고, 비디오가 없으니 재생 컨트롤도 없어 fetch를 트리거할 방법이 없습니다. 재생 버튼 UI 또는 IntersectionObserver 기반 뷰포트 진입 감지 등 fetch 트리거 메커니즘을 새로 설계해야 합니다.

5. **`useEffect` 의존성 배열에 `enabled` 누락 가능성**: 현재 effect의 의존성은 `[id]`뿐입니다. `enabled` 파라미터를 추가하면서 의존성 배열에 `enabled`를 포함하지 않으면, 사용자 인터랙션으로 `enabled`가 `false → true`로 변경되어도 effect가 재실행되지 않아 fetch가 발생하지 않습니다. 의존성 배열을 `[id, enabled]`로 갱신해야 합니다.

## 기대 효과
본 리팩토링 제안이 반영될 시:
1. **웹 표준 준수**: 시각 장애인 및 보조 기기(스크린리더 등)에 있어 더 올바른 시맨틱 트리 구성을 마련합니다.
2. **트래픽 절약 및 초기 렌더링 로딩 속도 개선**: Lazy Fetching 도입으로 N+1 API 요청을 제거하여 매끄럽고 빠른 앱 체감 성능을 달성할 수 있습니다. 이에 따라 `<video>` 요소 자체가 사용자 요청 전까지 렌더되지 않으므로 `preload="metadata"`로 인한 불필요한 메타데이터 다운로드 문제도 자연 소멸합니다.
