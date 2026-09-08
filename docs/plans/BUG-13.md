# BUG-13: 캡션 스타일 미리보기의 정중앙 고정 크롭이 원본 좌우를 잘라낸다 — 백엔드 resize 모드(블러 레터박스)로 교체

agent: web-dev

> 인용한 `파일:줄`은 계획 작성 시점(2026-09-08)에 다시 읽어 확인했다. 백로그 BUG-13 source가
> 인용한 줄은 아래 「대조 결과」를 빼고 전부 정확했다.
>
> **대조 결과(백로그 인용 검증)**
> - `CaptionPreviewPlayer.tsx:16` `const PREVIEW_HEIGHT_PX = 320;` ✓
> - `CaptionPreviewPlayer.tsx:17` `const PREVIEW_WIDTH_PX = 180; // 9:16` ✓
> - `CaptionPreviewPlayer.tsx:97` `// 크롭은 렌더 시 화자 추적이라 여기선 중앙 크롭(object-cover)으로 근사.` ✓
> - `CaptionPreviewPlayer.tsx:103` `className="h-full w-full object-cover"` ✓
> - `CaptionPreviewPlayer.tsx:60-79`(seek·루프·timeupdate) — 재생/루프 이펙트는 실제 `:59-81`이며 핸들러·리스너·정리가 `:63-79`에 있다. 백로그 `:60-79`는 그 이펙트 본문을 정확히 가리킨다.
> - `CaptionStyleEditor.tsx:308-309` `Live preview on your video. The final clip crops to whoever is` / `speaking, so framing will differ.` — ✓. 안내문 전체는 `:307-311`(3줄)이고 인용한 두 줄이 `:308-309`에 일치한다.
> - `CaptionStyleDialog.tsx:63` `max-h-[90dvh] max-w-2xl overflow-y-auto`(스크롤이지 클립 아님) ✓
> - `ui/index.tsx:394-398`(왼쪽 메인 플레이어, 원본 16:9 그대로) — 실제 `<video>`는 `:394-400`(컨테이너 `:392`, `className="w-full"`로 object-fit 없음 = 전체 표시). 백로그 `:394-398`은 끝이 2줄 짧으나 같은 요소를 가리킨다. 이 항목과 무관(source 범위 밖 (c)).
> - 백엔드 `main.py:198` `def create_vertical_video(...)` ✓, `:241` `mode = "crop"` ✓, `:243` `mode = "resize"` ✓, `:245-262` resize 분기 ✓, `:254` `cv2.GaussianBlur(blurred_background, (121, 121), 0)` ✓, `:262` 중앙 합성 ✓, `:270` `center_x = int(max_score_face['x'] * scale ...)` ✓.

## 현재 동작

캡션 스타일 미리보기 플레이어는 슬라이스 `widgets/clip-draft-review/ui/_component/CaptionPreviewPlayer.tsx`다.
`CaptionStyleEditor.tsx:291-304`이 이 컴포넌트를 렌더하고, 그 위 계층은
`ClipDraftCard → CaptionStyleDialog → CaptionStyleEditor`다.

**프레임과 영상 배치**

- 프리뷰 상자는 고정 9:16이다: `CaptionPreviewPlayer.tsx:16` `PREVIEW_HEIGHT_PX = 320`,
  `:17` `PREVIEW_WIDTH_PX = 180`. 컨테이너는 `:92-95` `relative ... overflow-hidden rounded-lg bg-black`에
  이 두 값을 인라인 style로 준다.
- 영상은 **한 장**이다: `:96-105`. `:97`이 스스로 근사임을 적어 뒀다
  (`// 크롭은 렌더 시 화자 추적이라 여기선 중앙 크롭(object-cover)으로 근사.`), `:103`
  `className="h-full w-full object-cover"`로 들어간다. `object-cover`는 높이 320에 맞춰 영상을
  채우고 넘치는 좌우를 **중앙에서 잘라낸다**.
- 16:9 원본을 높이 320에 맞추면 폭이 `320 × 16/9 ≈ 569px`가 되고 프레임 폭은 180px뿐이라
  가운데 `180/569 ≈ 31.6%`만 보인다. **프레임의 약 68%(좌우)가 잘려 나간다.**

**자막 오버레이 — 캔버스 기준이라 배경과 독립**

- 자막 오버레이 `<div>`는 `:106-130`이고 영상과 별개의 `absolute` 레이어다. 세로 위치는
  `:83` `getPreviewVerticalInset(props.position, PREVIEW_HEIGHT_PX)`가 정한다 — 이 함수는
  `model/caption-preview.ts:107-117`에서 marginv(`CAPTION_RENDER.MARGINV`)를 **프레임 높이 320
  기준**으로 환산한다. 폰트·외곽선·섀도 px도 같은 모듈(`:81-104`)이 320 기준으로 환산한다.
- 즉 자막의 위치·크기는 **9:16 캔버스(320px) 기준**이지 영상 픽셀 기준이 아니다. 이는
  백엔드가 자막을 PlayResY=1920 전체 프레임에 marginv로 얹는 것(`constants.ts:75-77`,
  `main.py:141-142`)과 같은 계약이다.

**재생·큐**

- `:59-81`의 이펙트가 클립 구간을 음소거로 반복 재생하며 `timeupdate`마다 현재 큐를 고른다:
  `:63-66` `seekToStart`(loadedmetadata에서 `currentTime = clipStart` 후 play), `:67-72`
  `onTimeUpdate`(`:68` `currentTime >= clipEnd`면 `clipStart`로 되돌리는 루프 + `pickActiveCue`).
- 큐 묶기·활성 큐·px 환산은 순수 모듈 `model/caption-preview.ts`가 전담하고
  `caption-preview.test.mjs`(19 it)가 덮는다. **이번 변경은 이 순수 모듈을 건드리지 않는다.**

**백엔드 세로 영상은 프레임마다 두 모드 중 하나다** (읽기만 — 담당 범위 밖, `apps/backend/main.py`)

- `main.py:198` `create_vertical_video(...)`. `:240-243` 얼굴 검출 성공이면 `mode = "crop"`, 실패면
  `mode = "resize"`.
- `crop`(`:265-275`): 높이에 맞춰 축소 후 `:270` `center_x = int(max_score_face['x'] * scale ...)` —
  **화자 얼굴 x좌표**를 중심으로 target_width만큼 세로 크롭. 얼굴 위치는 렌더 중 ASD가 만들어
  검토 시점엔 없다.
- `resize`(`:245-262`): `:246` `scale = target_width / img.shape[1]`로 원본을 **폭에 맞춰 축소**
  (`resized_image`, 세로가 짧아 레터박스)한 뒤, `:250-254` `scale_for_bg = max(...)`(cover 스케일)로
  키운 사본을 `:254` `GaussianBlur((121,121))` 블러 처리하고 `:256-259` 가운데를 크롭해 배경으로
  깔고, `:261-262` 그 배경 위에 `resized_image`를 세로 중앙 합성한다. = **블러 배경 + 원본 전체(레터박스)**.

현재 프리뷰의 "화면 정중앙 고정 크롭(`object-cover`)"은 위 둘 중 **어느 것과도 다르다.**

## 문제

BUG-13 source가 지목한 것: 「Caption style」 다이얼로그의 "Live preview on your video"에서 원본의
**좌우가 밀려 사람이 잘린다**(자막 글자 잘림이 아니라 영상 내용 잘림). 위 「현재 동작」에서 확인한
원인은 `CaptionPreviewPlayer.tsx:103`의 단일 `object-cover` 한 장 — 16:9 원본을 9:16 프레임에
중앙 크롭해 가운데 31.6%만 보인다(`:16-17`·`:97` 근사 주석이 이를 자백).

이 중앙 크롭은 백엔드의 `crop`(화자 x 추적, `main.py:270`)도 `resize`(블러 레터박스, `:245-262`)도
아니다. 팟캐스트의 흔한 두 화자 좌우 배치에서 화자가 화면 가장자리에 있으면 실제 클립엔 잘
나오는데 프리뷰에선 잘려, **실제와 가장 먼 그림**이 된다.

FEAT-36이 중앙 크롭을 근사로 택한 목적은 자막의 크기·위치·색을 9:16 캔버스에서 확인하는 것이고
(`docs/plans/FEAT-36.md:70-85`), 자막 오버레이는 배경이 어느 모드든 **캔버스 기준으로 자리가 같다**
(「현재 동작」의 오버레이 절). 따라서 근사를 백엔드 `resize` 모드 재현으로 갈아끼우면 FEAT-36의
목적을 잃지 않고 잘림을 없앤다.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `src/fsd/widgets/clip-draft-review/ui/_component/CaptionPreviewPlayer.tsx` | 단일 `object-cover` `<video>`(`:96-105`)를 **두 장**으로 교체 — 배경(같은 소스 `object-cover` + `blur` + 살짝 확대) + 전경(같은 소스 `object-contain` 레터박스). `bgVideoRef` 추가, 재생/루프 이펙트(`:59-81`)에 배경 시작·루프 재정렬 배선. `:97` 근사 주석 갱신 |
| `src/fsd/widgets/clip-draft-review/ui/_component/CaptionStyleEditor.tsx` | 미리보기 하단 안내(`:305-311`)를 "전체 프레임을 보여주되 실렌더는 화자를 따라 크롭"으로 갱신(근사 주석 포함) |

여기 적히지 않은 파일은 구현 단계에서 고치지 않는다. 특히 순수 모듈 `model/caption-preview.ts`와
그 테스트, `CaptionStyleDialog.tsx`·`ClipDraftCard.tsx`·`ui/index.tsx`(FEAT-36이 넘긴 `playUrl`
배선은 이미 있다), 백엔드(`apps/backend`)는 무변경이다. 닿게 되면 `보류`.

## 구현 스케치

**트리 전제**: 아래 before는 현재 `dev` 병합본(FEAT-36 적용본)이다. 미결 0건이라 겹치는 다른
작업은 없다.

### ① CaptionPreviewPlayer.tsx — 배경 ref 추가

`:37` `const videoRef = useRef<HTMLVideoElement>(null);` 아래에 한 줄 추가:

```tsx
  const videoRef = useRef<HTMLVideoElement>(null);
  const bgVideoRef = useRef<HTMLVideoElement>(null);
```

### ② CaptionPreviewPlayer.tsx — 재생/루프 이펙트(`:59-81`)를 두 영상으로

before(`:59-81`, 요지):

```tsx
  useEffect(() => {
    const video = videoRef.current;
    if (!video || playUrl === null) return;

    const seekToStart = () => {
      video.currentTime = clipStart;
      void video.play();
    };
    const onTimeUpdate = () => {
      if (video.currentTime >= clipEnd) video.currentTime = clipStart; // 루프
      setActiveText(
        pickActiveCue(cuesRef.current, video.currentTime - clipStart)?.text ?? "",
      );
    };

    video.addEventListener("loadedmetadata", seekToStart);
    video.addEventListener("timeupdate", onTimeUpdate);
    if (video.readyState >= 1) seekToStart();
    return () => {
      video.removeEventListener("loadedmetadata", seekToStart);
      video.removeEventListener("timeupdate", onTimeUpdate);
    };
  }, [playUrl, clipStart, clipEnd]);
```

after:

```tsx
  useEffect(() => {
    const video = videoRef.current;
    const bgVideo = bgVideoRef.current;
    if (!video || playUrl === null) return;

    // 전경·배경 두 <video>를 같은 클립 구간에서 재생한다. 배경은 블러라 프레임 단위
    // 정합이 보이지 않으므로, 매 timeupdate(~250ms)마다 seek하지 않고(그러면 배경이
    // 끊긴다) 루프 경계에서만 clipStart로 재정렬한다. 사이 구간은 둘 다 1.0×로 흐른다.
    const startFg = () => {
      video.currentTime = clipStart;
      void video.play();
    };
    const startBg = () => {
      if (!bgVideo) return;
      bgVideo.currentTime = clipStart;
      void bgVideo.play();
    };
    const onTimeUpdate = () => {
      if (video.currentTime >= clipEnd) {
        video.currentTime = clipStart; // 루프
        startBg(); // 배경도 같은 시점으로 재정렬
      }
      setActiveText(
        pickActiveCue(cuesRef.current, video.currentTime - clipStart)?.text ?? "",
      );
    };

    video.addEventListener("loadedmetadata", startFg);
    video.addEventListener("timeupdate", onTimeUpdate);
    bgVideo?.addEventListener("loadedmetadata", startBg);
    if (video.readyState >= 1) startFg();
    if (bgVideo && bgVideo.readyState >= 1) startBg();
    return () => {
      video.removeEventListener("loadedmetadata", startFg);
      video.removeEventListener("timeupdate", onTimeUpdate);
      bgVideo?.removeEventListener("loadedmetadata", startBg);
    };
  }, [playUrl, clipStart, clipEnd]);
```

전경(`videoRef`)이 자막을 몬다(`onTimeUpdate`가 유일하게 `setActiveText`를 호출). 배경은 자기
`loadedmetadata`에서 시작하고 루프 경계에서 재정렬되므로 늦게 로드돼도 시작한다.

### ③ CaptionPreviewPlayer.tsx — 렌더의 `<video>` 블록(`:96-105`)을 두 장으로

before(`:96-105`):

```tsx
      {playUrl !== null && (
        // 크롭은 렌더 시 화자 추적이라 여기선 중앙 크롭(object-cover)으로 근사.
        <video
          ref={videoRef}
          src={playUrl}
          muted
          playsInline
          className="h-full w-full object-cover"
        />
      )}
```

after:

```tsx
      {playUrl !== null && (
        // 백엔드 resize 모드(main.py:245-262) 재현: 블러 배경(cover + 살짝 확대) 위에
        // 원본 전체(contain, 레터박스)를 얹는다. 얼굴이 잡히면 실렌더는 화자 x 크롭
        // (crop 모드, main.py:265-275)이라 이와 다르다 — 아래 안내가 그 한계를 말한다.
        <>
          <video
            ref={bgVideoRef}
            src={playUrl}
            muted
            playsInline
            aria-hidden
            className="absolute inset-0 h-full w-full scale-110 object-cover blur-lg"
          />
          <video
            ref={videoRef}
            src={playUrl}
            muted
            playsInline
            className="absolute inset-0 h-full w-full object-contain"
          />
        </>
      )}
```

- 컨테이너(`:92-95`)는 이미 `relative overflow-hidden`이라 `absolute inset-0` 자식 둘이 프레임을
  채운다. DOM 순서(배경 → 전경 → 자막 오버레이 `<div>` `:106-130`)가 곧 페인트 순서라 z-index
  없이 자막이 맨 위에 온다.
- `object-cover`(배경)는 `main.py:250-259`의 cover 스케일 + 중앙 크롭에, `object-contain`(전경)은
  `:246-247`의 폭 맞춤 축소(레터박스)에 대응한다.
- `blur-lg`(16px)·`scale-110`은 **시각 근사**다(백로그: CSS blur ≠ cv2 GaussianBlur, 픽셀 동일
  불요). `scale-110`은 CSS `filter: blur()`가 요소 가장자리에서 투명으로 페이드해 검은 컨테이너
  테두리가 비치는 것을 프레임 밖으로 밀어낸다(`overflow-hidden`이 자름). 둘 다 Tailwind 코어
  유틸리티다. 실물 대조 후 반경·배율은 조정 가능하나, 이 스케치가 승인 기준값이다.
- 자막 오버레이(`:106-130`)·`getPreviewVerticalInset` 등 지오메트리는 **무변경** — 자막은 여전히
  9:16 캔버스(320px) 기준으로 얹히고, 이는 실렌더가 marginv를 전체 프레임에 얹는 것과 같다.

### ④ CaptionStyleEditor.tsx — 안내 문구(`:305-311`)

before(`:305-311`):

```tsx
        {/* 못 닫는 근사 둘을 말한다: 크롭은 렌더 시 화자를 따라가 중앙 크롭과 다르고,
            한국어는 렌더 시 번역되므로 여기선 영어 원문으로 보인다. */}
        <p className="text-center text-[11px] text-muted-foreground">
          Live preview on your video. The final clip crops to whoever is
          speaking, so framing will differ. Korean clips are translated at
          render time — the words here are the English source.
        </p>
```

after:

```tsx
        {/* 못 닫는 근사 둘을 말한다: 미리보기는 전체 프레임(resize 모드)을 보여주지만
            실렌더는 화자를 따라 크롭하고, 한국어는 렌더 시 번역되므로 여기선 영어 원문이다. */}
        <p className="text-center text-[11px] text-muted-foreground">
          Live preview on your video — the whole frame is shown here. The final
          clip crops to follow whoever is speaking, so framing will differ.
          Korean clips are translated at render time — the words here are the
          English source.
        </p>
```

(아포스트로피 없는 문구로 유지해 `react/no-unescaped-entities`를 건드리지 않는다. "the whole
frame is shown here"가 새 그림을 정직하게 알린다.)

## 테스트

- **덮는 것**: 없음(새 순수 함수 없음). 이번 변경은 자막 큐·px 환산 로직을 새로 만들지 않는다 —
  그 계산은 기존 순수 모듈 `model/caption-preview.ts`(무변경)가 하고, `caption-preview.test.mjs`
  (19 it)가 이미 덮는다. 이번 변경은 `<video>` 레이어링·CSS 클래스·두 영상 재생 동기·안내 문구뿐이라
  뽑아낼 순수 계산이 없다. **회귀 가드**: 기존 `caption-preview.test.mjs`가 그대로 통과해야 한다
  (`npm test`가 재실행).
- **못 덮는 범위**: `npm test`는 Node 내장 러너(`tsx --test`)라 DOM·React 도구가 없다. 다음은
  러너 밖이며 배포 후 검토 화면에서 실제 클립으로 수동 확인한다:
  1. 원본 좌우가 더 이상 잘리지 않고 **전체 프레임**이 보이는가(전경 `object-contain`).
  2. 상하 레터박스가 **블러 배경**으로 채워지는가(배경 `object-cover` + `blur`), 검은 테두리 없이.
  3. 자막의 위치·크기가 종전과 동일(캔버스 기준)한가 — 배경 교체가 자막 자리를 흔들지 않는지.
  4. 전경·배경이 눈에 띄게 어긋나지 않는가(루프 경계 재정렬로 충분한지).
  5. `playUrl === null`(presign 로딩/실패) 시 검은 상자 + 하단 안내만 남는지.

## 범위 밖 의존

없음(차단 없음). 요구는 전부 `apps/web` 안 두 컴포넌트에서 닫힌다. `apps/backend/main.py:245-262`는
**읽기만** 했다(resize 모드 근거). `packages/db`·다른 워크스페이스·서버 액션·DB 스키마를 건드리지 않는다.

백로그 source가 「범위 밖 의존 (a)(b)(c)」로 적은 셋은 교차 경계 차단이 아니라 **의도적으로 빼는
후속 범위**다: (a) 가로 위치 슬라이더(`object-position`) — 산출물에 영향 없는 컨트롤이라 넣지 않는다,
(b) 얼굴 추적 재현(진짜 충실도, `docs/plans/FEAT-36.md:604` 후속 (a)) — 렌더 중 생성되는 ASD
위치가 필요해 **backend 작업**이며 착수 시 별도 발주가 필요하다, (c) 왼쪽 메인 플레이어
(`ui/index.tsx:394-400`)는 원본 16:9를 그대로 보여주므로 이 항목과 무관. 셋 다 이 계획에 넣지 않는다.

## 대안

- **배경 동기: 매 timeupdate seek vs 루프 경계 재정렬** — 매 틱 `bgVideo.currentTime =
  fgVideo.currentTime`은 250ms마다 seek를 유발해 배경이 끊긴다. 배경은 블러라 프레임 정합이
  보이지 않으므로 루프 경계에서만 재정렬하고 사이엔 각자 1.0×로 흐르게 한다(백로그가 제시한 두
  방식 — "두 요소에 함께 걸거나" / "뒤 영상이 앞의 currentTime을 따라가게" — 중 후자를 루프
  경계 한정으로 채택).
- **단일 `<video>` + CSS 복제 배경** — `<video>`는 `background-image`로 복제할 수 없어 두 요소가
  필요하다(백로그도 "`<video>` 두 장" 명시). 대안 아님.
- **배경에 `scale` 없이 `blur`만** — CSS `filter: blur()`는 요소 가장자리에서 투명으로 페이드해
  검은 컨테이너 테두리가 비친다. `scale-110`으로 페이드 링을 프레임 밖으로 밀어 `overflow-hidden`이
  자른다. 백엔드는 cover까지만 확대하지만(레터박스 배경은 GaussianBlur라 테두리 페이드 없음) CSS
  blur의 아티팩트를 가리려면 약간의 확대가 필요하다.
- **전경 `object-contain` vs `object-cover`+`object-position`** — 후자는 여전히 크롭이라 원본
  전체를 못 보여준다. `object-contain`이 백엔드 resize의 폭 맞춤 레터박스(`main.py:246-247`)에
  정확히 대응한다.
