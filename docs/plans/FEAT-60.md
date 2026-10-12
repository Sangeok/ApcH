# FEAT-60: 설정 화면 미리보기에 Framing(상하 검은 여백)이 보이지 않는다 — 미리보기에 여백과 임시 장면을 그리고, 슬라이더를 미리보기 옆으로

agent: web-dev

## 현재 동작

설정 화면 `/dashboard/settings`의 `Video style` 카드는 Framing 슬라이더와 캡션 편집기를 **서로 떨어진** 두 영역으로 둔다.

- Framing 슬라이더 상태는 `pages/settings/ui/index.tsx:72-74`에서 만든다: `  const [videoPaddingPercent, setVideoPaddingPercent] = useState(` / `    initialVideoPaddingPercent,` / `  );`. 슬라이더 `onChange`는 저장 없이 상태만 바꾼다 — `:277` `              onChange={(event) => setVideoPaddingPercent(Number(event.currentTarget.value))}`. 저장은 `Save framing` 버튼이 따로 한다(`:286` `              <Button onClick={() => persistVideoPadding(videoPaddingPercent)} disabled={isSaving}>`).
- 이 슬라이더 값은 **도움말 숫자에만** 쓰인다 — `:281-283` `              {videoPaddingPercent}% on each side ({framing.paddingPx}px).` / `              Video area: {framing.width} × {framing.contentHeight}px.` / `              Captions keep their current position. Applies to both languages.`. `framing`은 `:75` `  const framing = getVideoFrameLayout(videoPaddingPercent);`.
- 미리보기는 `CaptionStyleEditor`가 그린다. 설정은 `:320-331`에서 `sample`·`playUrl={null}`로 부른다: `:323` `          sample`, `:324` `          playUrl={null}`.
- `CaptionStyleEditor`에는 여백 prop이 없다 — props는 `ui/CaptionStyleEditor.tsx:15-29`(`language`/`value`/`playUrl`/`clipStart`/`clipEnd`/`words`/`onChange`/`sample`뿐). 편집기는 2열 그리드다: `:84` `    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">`, 왼쪽 칸 `:85` `      <div className="flex flex-col gap-3">`(컨트롤), 오른쪽 칸 `:299` `      <div className="flex flex-col gap-2">`(미리보기 + `:316-319` 샘플 안내).
- 편집기는 여백을 모른 채 플레이어를 부른다 — `:300-313`에 `paddingPercent`가 없다.
- `CaptionPreviewPlayer`도 여백 prop이 없다(`ui/CaptionPreviewPlayer.tsx:20-37`). 상자는 `:114-118` `    <div` / `      className="relative mx-auto overflow-hidden rounded-lg bg-black"` / `      style={{ width: PREVIEW_WIDTH_PX, height: PREVIEW_HEIGHT_PX }}`(`:17` `const PREVIEW_HEIGHT_PX = 320;`, `:18` `const PREVIEW_WIDTH_PX = 180; // 9:16`). 영상은 `:119` `      {playUrl !== null && (`일 때만 그린다 — 설정은 `playUrl={null}`이라 영상 레이어가 없다. 남는 것은 `:141-147`의 자막 레이어(상자 전체 기준 `absolute inset-x-0`, 위치 `:103` `  const inset = getPreviewVerticalInset(props.position, PREVIEW_HEIGHT_PX);`)와 그 아래 `bg-black` 상자뿐이다. 그래서 검은 상자 위에 자막 글자만 보인다.
- 비교 선례: 업로드 폼 썸네일은 검은 9:16 상자 안에 회색 장면을 깔고 **실비율 검은 띠**를 그린다 — `ui/CaptionStyleThumbnail.tsx:40-43` `      <div` / `        className="absolute inset-x-0 bg-neutral-500"` / `        style={{ top: `${paddingPercent}%`, bottom: `${paddingPercent}%` }}` / `      />`. 즉 CSS `%`를 상자 높이 기준으로 직접 쓴다.
- 여백 픽셀식은 `shared/config/video-framing.ts:25` `  const paddingPx = Math.floor((VIDEO_FRAME_SIZE.HEIGHT * percent + 50) / 100);`(`VIDEO_FRAME_SIZE.HEIGHT = 1920`, `:8`). 백엔드도 같다 — `apps/backend/video_framing.py:20` `    padding_px = (FRAME_HEIGHT * percent + 50) // 100`.
- 자막 세로 위치 상수는 `shared/config/constants.ts:77` `  MARGINV: { top: 200, bottom: 260 }, // main.py CAPTION_POSITION_MARGINV`(PLAY_RES_Y 1920 기준), 기본 위치는 `:51` `  DEFAULT_POSITION: "middle",`. 실렌더에서 자막은 전체 캔버스에 합성돼 검은 여백에 겹칠 수 있다 — `docs/plans/FEAT-58.md:57` INV-FRAMING-004 `자막은 그 뒤 전체 캔버스에 합성하므로 자막 글자가 검은 여백에 겹칠 수 있다.`.
- 백엔드는 가운데 영역을 **cover 크롭**한다 — `apps/backend/video_framing.py:27` `    scale = max(width / source_width, height / source_height)`.
- 소비자 관계(수정 영향 범위): `CaptionStyleEditor`의 **실사용 소비자는 설정 한 곳뿐**이다(`pages/settings/ui/index.tsx:320`). `widgets/clip-draft-review/ui/index.tsx:424`의 언급은 주석일 뿐 임포트가 아니다. `CaptionPreviewPlayer`는 `CaptionStyleEditor`만 임포트한다. `CaptionStyleThumbnail`은 업로드 폼(`pages/dashboard/ui/_component/UploadPodcast.tsx:326`)만 쓴다.

## 문제

백로그 `source`(2026-10-13 소유자 관측·요구 ①~⑤)가 지목한 문제: 설정에서 Framing을 조절해도 미리보기가 전부 검은색이라 여백이 적용된 모습이 보이지 않고(관측 1·2 = 위 「현재 동작」의 여백 prop 부재 + `playUrl={null}`), 슬라이더와 미리보기가 모바일에서 떨어져 있어 조작 중 결과를 볼 수 없다(관측 5). 결함이 아니라 FEAT-58이 범위 밖으로 둔 후속이다(`docs/plans/FEAT-58.md:552` `별도의 영상·실렌더 미리보기는 요구되지 않았다. ...`).

코드에서 확인한 것과 백로그 지목은 일치한다. 풀어야 할 것(요구 ①~⑤): ① 미리보기가 **저장 전 슬라이더 값**(`videoPaddingPercent`)을 받아 상하 검은 띠를 실비율로 그린다, ② 띠 사이 가운데에 인라인 SVG 화자 실루엣을 cover로 채운다, ③ 자막은 장면 위, 위치는 지금처럼 전체 프레임 기준(INV-FRAMING-004), ④ 미리보기는 하나 — 슬라이더를 편집기 왼쪽 칸 맨 위로 옮기고 모바일에선 미리보기를 컨트롤 위에, ⑤ 여백 저장 로직(`saveDefaultVideoPaddingPercent`·Save/Reset framing)은 설정 페이지에 남기고 편집기는 슬롯만 내준다(`docs/release-checks.md:93`에서 실물 확인된 「자막 저장이 여백을 건드리지 않는다」 보존).

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `src/fsd/features/caption-style/ui/CaptionPreviewPlayer.tsx` | `paddingPercent: number` prop 추가. 모듈 내부 비공개 컴포넌트 `SampleScene`(인라인 SVG 화자 실루엣) 추가. `sample`일 때 영상 레이어와 자막 레이어 **사이에** 여백 띠(상자 `bg-black` 노출) + 가운데 SVG 장면을 그린다. 자막 레이어·위치 계산은 그대로 |
| `src/fsd/features/caption-style/ui/CaptionStyleEditor.tsx` | `paddingPercent: number`·`framingSlot?: ReactNode` prop 추가. `framingSlot`을 왼쪽 칸 맨 위에 렌더. `paddingPercent`를 플레이어로 전달. 2열 그리드 두 자식에 `order` 클래스를 붙여 모바일에서 미리보기가 위로 |
| `src/fsd/pages/settings/ui/index.tsx` | Framing 하위 블록(라벨·슬라이더·도움말·Save/Reset framing 버튼)을 `framingSlot` prop으로 편집기에 넘긴다. `paddingPercent={videoPaddingPercent}`도 넘긴다. 상태(`videoPaddingPercent`)·핸들러(`setVideoPaddingPercent`·`persistVideoPadding`)·`getVideoFrameLayout`은 그대로 설정 컴포넌트에 남는다 |

새 파일은 만들지 않는다. SVG는 `CaptionPreviewPlayer.tsx` 안 비공개 컴포넌트로 둔다(같은 슬라이스·같은 레이어, 배럴 변경 없음).

## 구현 스케치

### 1. `CaptionPreviewPlayer.tsx`

**props 추가** — `:20-37` 인터페이스에 `paddingPercent`를 넣는다(`sample` 바로 위에).

```tsx
  position: CaptionStyle["position"];
  // 저장 전 슬라이더 값(0~25). 상하 검은 띠를 상자 높이의 N%로 그린다.
  paddingPercent: number;
  // 설정 화면의 정지 샘플 미리보기. true면 영상 없이 첫 큐를 고정으로 그린다.
  // playUrl === null로 추론하지 않는다 — 검토 화면은 URL 로딩·실패 동안에도 null을 넘긴다.
  sample?: boolean;
```

**모듈 내부 비공개 컴포넌트** — 기본 export 위에 추가. 바탕은 차분한 슬레이트 그라데이션, 실루엣은 어두워 흰 자막(검은 스트로크 포함)과 대비된다. `viewBox="0 0 180 320"`(9:16), `preserveAspectRatio="xMidYMid slice"`로 가운데 영역을 cover(넘치는 세로는 가운데 기준 크롭) — 백엔드 가운데 영역 cover 크롭(`video_framing.py:27` `scale = max(...)`)과 같은 계열. 색은 CSS 테마 토큰이 아니라 리터럴이라 다크 모드에서도 동일하다.

```tsx
// 정지 샘플 미리보기의 가운데 "영상" 장면. 실제 클립은 사용자 영상이다(아래 안내가 말한다).
// 색은 리터럴 — 미리보기 상자는 테마와 무관한 영상 표면이라 다크 모드에서도 같은 모습이어야 한다.
function SampleScene() {
  return (
    <svg
      viewBox="0 0 180 320"
      preserveAspectRatio="xMidYMid slice"
      className="h-full w-full"
      aria-hidden
    >
      <defs>
        <linearGradient id="caption-preview-scene-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#45566a" />
          <stop offset="1" stopColor="#28313c" />
        </linearGradient>
      </defs>
      <rect width="180" height="320" fill="url(#caption-preview-scene-bg)" />
      {/* 상반신 */}
      <path d="M26 320 C26 252 58 226 90 226 C122 226 154 252 154 320 Z" fill="#1b232c" />
      {/* 머리 */}
      <circle cx="90" cy="172" r="44" fill="#1b232c" />
      {/* 마이크 스탠드 + 헤드 */}
      <rect x="121" y="250" width="7" height="70" rx="3.5" fill="#5b6b7d" />
      <ellipse cx="124.5" cy="246" rx="15" ry="20" fill="#3a4756" />
    </svg>
  );
}
```

**장면 렌더** — 상자 안, 영상 블록(`:119-140`)과 자막 레이어(`:141` `      <div`) **사이에** 삽입한다. 띠는 상자 `bg-black`이 비치는 것이고, 가운데 영역만 `top/bottom: N%`로 인셋해 SampleScene을 채운다(썸네일 `CaptionStyleThumbnail.tsx:40-43`과 같은 방식). `overflow-hidden`으로 slice 크롭이 띠를 넘지 않게 한다.

```tsx
      {props.sample === true && (
        <div
          className="absolute inset-x-0 overflow-hidden"
          style={{ top: `${props.paddingPercent}%`, bottom: `${props.paddingPercent}%` }}
          aria-hidden
        >
          <SampleScene />
        </div>
      )}
```

자막 레이어(`:141-165`)와 위치 계산(`:103` `getPreviewVerticalInset(props.position, PREVIEW_HEIGHT_PX)`)은 **건드리지 않는다** — 자막은 상자 전체 기준이라 장면 위 전체 캔버스에 합성되고(INV-FRAMING-004), 여백이 커지면 띠에 겹칠 수 있다(실렌더와 같은 거동).

비율 근거: CSS `top/bottom: N%`는 상자 높이(320px = 1920 상당) 기준이라 띠 = N% × 1920 = 19.2·N 렌더-px. 백엔드/프런트 픽셀식은 `floor((1920·N+50)/100) = round(19.2·N)`. 둘 차이는 최대 0.5 렌더-px(= 1920분의 0.5 ≈ 0.026% = 320px 상자에서 0.08px 미만), N이 5의 배수면(5·10·15·20·25 → 96·192·288·384·480) **정확히 일치**. 즉 CSS `${N}%`가 비율의 정확 표현이고 백엔드 반올림과 서브픽셀로만 다르다 — 화면에선 구별되지 않으며, 썸네일이 이미 쓰는 방식이다. 정확 px는 슬라이더 도움말(`framing.paddingPx`)이 숫자로 계속 보여 준다.

### 2. `CaptionStyleEditor.tsx`

**import 추가**(파일 상단): `import type { ReactNode } from "react";`

**props 추가** — `:15-29` 인터페이스에.

```tsx
  onChange: (style: CaptionStyle | null) => void;
  // 설정 화면의 정지 샘플 미리보기. 검토 다이얼로그는 넘기지 않는다(기본 false).
  sample?: boolean;
  // 저장 전 여백 슬라이더 값. 미리보기 띠가 쓴다.
  paddingPercent: number;
  // 왼쪽 칸 맨 위에 끼울 Framing 컨트롤. 저장 로직은 설정 페이지가 소유한다(요구 ⑤).
  framingSlot?: ReactNode;
```

구조분해(`:52-61`)에 `paddingPercent`·`framingSlot` 추가.

**그리드 두 자식 order 조정** — 모바일(1열)에서 미리보기를 위로, 데스크톱(2열)에서 컨트롤을 왼쪽·미리보기를 오른쪽으로.

`:85` before: `      <div className="flex flex-col gap-3">`
after: `      <div className="order-2 flex flex-col gap-3 md:order-1">`

왼쪽 칸 맨 위(`<div className="order-2 ...">` 바로 안, Preset 블록 `:86` 앞)에 슬롯:

```tsx
      <div className="order-2 flex flex-col gap-3 md:order-1">
        {framingSlot}
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Preset
          </p>
```

`:299` before: `      <div className="flex flex-col gap-2">`
after: `      <div className="order-1 flex flex-col gap-2 md:order-2">`

**플레이어 호출**(`:300-313`)에 `paddingPercent` 전달 — `position` 아래, `sample` 위.

```tsx
          position={effectivePosition}
          paddingPercent={paddingPercent}
          sample={sample}
```

샘플 안내(`:316-319`)는 **그대로 둔다**(아래 「대안」·「테스트」 참조).

### 3. `settings/ui/index.tsx`

Framing 하위 블록(`:262-293`의 `<div className="space-y-3"> ... </div>` 전체 — `Framing` 라벨·`Top and bottom black space` 라벨·슬라이더·도움말·`Save framing`/`Reset framing` 버튼)을 `Video style` 카드 본문에서 떼어 `CaptionStyleEditor`의 `framingSlot` prop으로 넘긴다. 상태·핸들러·`getVideoFrameLayout`·`framing`은 설정 컴포넌트에 그대로 남으므로 저장 분리가 유지된다(요구 ⑤).

`:320-331` before:
```tsx
          <CaptionStyleEditor
            language={editLanguage}
            value={captionStyles[editKey]}
            sample
            playUrl={null}
            clipStart={0}
            clipEnd={SAMPLE_CAPTION_CLIP_END}
            words={sampleCaptionWords(editLanguage)}
            onChange={(style) =>
              setCaptionStyles((prev) => ({ ...prev, [editKey]: style }))
            }
          />
```

after(새 두 prop 추가, Framing 블록을 `framingSlot`으로):
```tsx
          <CaptionStyleEditor
            language={editLanguage}
            value={captionStyles[editKey]}
            sample
            paddingPercent={videoPaddingPercent}
            framingSlot={
              <div className="space-y-3">
                <p className="text-sm font-medium">Framing</p>
                <label htmlFor="video-padding-percent" className="text-sm">
                  Top and bottom black space
                </label>
                <input
                  id="video-padding-percent"
                  type="range"
                  min={VIDEO_PADDING_PERCENT_RANGE.MIN}
                  max={VIDEO_PADDING_PERCENT_RANGE.MAX}
                  step={VIDEO_PADDING_PERCENT_RANGE.STEP}
                  value={videoPaddingPercent}
                  disabled={isSaving}
                  aria-describedby="video-padding-help"
                  aria-valuetext={`${videoPaddingPercent}% on each side`}
                  onChange={(event) => setVideoPaddingPercent(Number(event.currentTarget.value))}
                  className="w-full"
                />
                <p id="video-padding-help" className="text-muted-foreground text-xs">
                  {videoPaddingPercent}% on each side ({framing.paddingPx}px).
                  Video area: {framing.width} × {framing.contentHeight}px.
                  Captions keep their current position. Applies to both languages.
                </p>
                <div className="flex gap-x-2">
                  <Button onClick={() => persistVideoPadding(videoPaddingPercent)} disabled={isSaving}>
                    Save framing
                  </Button>
                  <Button variant="outline" onClick={() => persistVideoPadding(0)} disabled={isSaving}>
                    Reset framing
                  </Button>
                </div>
              </div>
            }
            playUrl={null}
            clipStart={0}
            clipEnd={SAMPLE_CAPTION_CLIP_END}
            words={sampleCaptionWords(editLanguage)}
            onChange={(style) =>
              setCaptionStyles((prev) => ({ ...prev, [editKey]: style }))
            }
          />
```

`:262-293`의 원래 Framing 블록은 카드 본문에서 제거한다(슬롯으로 옮겼으므로). 카드 본문의 나머지(`Captions` 블록 `:294-299`, Editing 언어 선택 `:300-319`, 캡션 Save/Reset `:332-343`)는 그대로. 결과 카드 순서: Captions 안내 → Editing 언어 선택 → 편집기(왼쪽 칸: Framing 슬롯 → Preset → …, 오른쪽 칸: 미리보기) → 캡션 Save/Reset. 사용자 문구는 한 글자도 바뀌지 않는다.

## 테스트

- **덮는 것**: 새 순수 함수 없음. 미리보기가 기대는 수치 계약은 이미 러너가 지킨다 — 띠 비율의 기준인 픽셀식 골든은 `shared/config/video-framing.test.mjs`(1%→19·3%→58·10%→192·25%→480), 자막 인셋·큐·px는 `features/caption-style/model/caption-preview.test.mjs`, 첫 큐 텍스트는 `sample-captions.test.mjs`, 유효 스타일은 `effective-caption-style.test.mjs`가 고정한다. 이번 변경은 이 계약들을 바꾸지 않는다.
- **추출 순수 함수 검토 결과 — 없음**: 띠 높이는 `${paddingPercent}%`로 입력을 그대로 CSS에 쓰는 한 줄이라 함수로 빼도 구현을 그대로 베낀 등가 테스트(도달 불가·등가 변이)만 생긴다 — CLAUDE.md 테스트 표가 경고하는 부류라 만들지 않는다. SVG·레이어·그리드 order는 정적 마크업이다.
- **못 덮는 범위(배포 후 수동 확인, `docs/release-checks.md` 등재 몫)**: `npm test`는 Node 내장 러너(`tsx --test src/**/*.test.mjs`)라 DOM·React 렌더가 없어 JSX/SVG·레이어 겹침·그리드 순서를 판정하지 못한다. 배포 후 `/dashboard/settings`에서 데스크톱·모바일로 ① 0%: 띠 없음, 가운데 SVG 장면이 상자 전체를 채움 ② 10%: 상하 ~10%(실렌더 192px) 검은 띠 + 가운데 장면, 자막은 전체 프레임 기준 위치 유지 ③ 25%: 상하 ~25% 띠 — 를 본다. **자막·띠 겹침 지점**: Top 자막은 ~10.4%(200/1920), Bottom은 ~13.5%(260/1920)를 넘으면 띠 위로 올라간다(백로그의 ~11%/~14%) — 그 지점을 넘겨 겹침이 실렌더(INV-FRAMING-004)처럼 보이는지 확인. ④ 흰 자막이 실루엣·띠 양쪽과 대비되는지, 다크 모드에서 미리보기 모습이 같은지(색 리터럴이라 같아야 한다) ⑤ 모바일에서 미리보기가 컨트롤 위, Framing 슬라이더가 그 바로 아래, 드래그 중 띠가 실시간으로 바뀌는지 ⑥ `Save caption style`을 눌러도 여백이 안 바뀌는지(release-checks:93 불변 — 저장 분리 유지 확인).
- **검증 명령 주의(다른 세션 변경 영향)**: 작업 트리에 다른 세션의 커밋 안 된 card-news 변경이 `apps/web` 전반에 있다. `npm run check -w apps/web`·`npm test -w apps/web`는 `apps/web` 전체를 보므로 그 변경이 결과(테스트 수·경고)를 흔들 수 있다. 참고 기준선은 FEAT-59 시점 `198/49/0`(CLAUDE.md 테스트 절). 구현 때 게이트가 실패하면 `git diff --name-only`로 FEAT-60 세 파일 안에서 난 실패인지 가린다 — 세 파일 밖(다른 세션) 실패는 범위 밖으로 보고하고 손대지 않는다.

## 범위 밖 의존

없음. 세 파일 모두 `apps/web/src/**`(web-dev 범위) 안이다. `packages/db`·`apps/backend`·`apps/admin`을 건드리지 않는다. 백엔드 cover 크롭(`video_framing.py:27`)·INV-FRAMING-004·픽셀 골든은 **설계 참조**일 뿐 변경 대상이 아니다.

## 대안

- **업로드 폼 썸네일(`CaptionStyleThumbnail`)에도 같은 SVG 장면 쓰기** — 쓰지 않는다. 썸네일은 76px(`CaptionStyleThumbnail.tsx:38` `w-[76px]`)이라 실루엣이 뭉개져 오히려 읽기 어렵고, 지금의 평면 `bg-neutral-500`이 그 크기에선 "영상 영역 + 띠 + 자막"을 더 깔끔히 전한다(백로그 계획 단계 판단과 일치). SVG는 설정 미리보기 전용.
- **SVG를 별도 파일(`ui/CaptionPreviewScene.tsx`)로 분리** — 소비자가 플레이어 하나뿐이라 모듈 내부 비공개 컴포넌트로 두는 쪽이 파일·배럴 증가 없이 응집적이다. 재사용이 생기면 그때 분리한다.
- **미리보기 아래 안내 문구에 framing 추가** — 넣지 않는다. 그 문구(`CaptionStyleEditor.tsx:316-319` `This is a sample. Your clips use your own video and words — here you're setting the size, color, position, and words per line.`)는 **이 편집기 왼쪽 칸의 캡션 컨트롤**이 정하는 것을 열거한다. framing은 별개 관심사로 슬롯의 슬라이더 도움말(`{N}% on each side ...`)이 이미 설명하므로, 이 문구에 넣으면 "여기서 설정"이 아닌 것을 여기서 설정한다고 오도한다. 실루엣이 사용자 실제 영상이 아니라는 한계(백로그 「한계」)는 기존 `Your clips use your own video` 문구가 이미 덮는다.
- **슬라이더 옆 썸네일을 하나 더 두기 / 사용자 최근 업로드 프레임 / 그라데이션만 / 샘플 영상 루프** — 백로그 「검토 후 뺀 대안」대로 제외(두 미리보기 불일치 · 첫 사용자 업로드 없음·브라우저에서 화자 추적 재현 불가 · 영상처럼 안 보임 · 목적에 과함).
