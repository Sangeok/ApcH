# BUG-13 — 캡션 스타일 미리보기의 정중앙 고정 크롭 교체 (web-dev)

## 2026-09-08 구현

계획서 `docs/plans/BUG-13.md`의 「고칠 파일」·「구현 스케치」 ①②③④를 그대로 구현했다.
구현 전 「현재 동작」이 코드와 일치함을 확인했다 — `CaptionPreviewPlayer.tsx`의
`:16-17` 상수, `:37` videoRef, `:59-81` 재생/루프 이펙트, `:96-105` 단일 `object-cover`
`<video>`, `:97` 근사 주석과 `CaptionStyleEditor.tsx:305-311` 안내 문구가 스케치의 before와
정확히 일치.

### 고친 파일 (전수)

1. `apps/web/src/fsd/widgets/clip-draft-review/ui/_component/CaptionPreviewPlayer.tsx`
   - ① `videoRef` 아래 `const bgVideoRef = useRef<HTMLVideoElement>(null);` 추가.
   - ② 재생/루프 이펙트를 두 영상으로 재작성: `startFg`/`startBg` 분리, `onTimeUpdate`의
     루프 경계(`currentTime >= clipEnd`)에서 전경 되감기 + `startBg()` 재정렬, 배경은
     자기 `loadedmetadata`에서 시작(`bgVideo?.addEventListener("loadedmetadata", startBg)`)
     + `readyState >= 1` 즉시 시작. 정리 함수에 배경 리스너 제거 추가. 의존성 배열은
     `[playUrl, clipStart, clipEnd]` 그대로. 자막(`setActiveText`)은 전경 `currentTime`만 읽음.
   - ③ 렌더의 단일 `<video>`(object-cover)를 프래그먼트 두 장으로 교체: 배경
     `bgVideoRef`(`absolute inset-0 h-full w-full scale-110 object-cover blur-lg` + `aria-hidden`),
     전경 `videoRef`(`absolute inset-0 h-full w-full object-contain`). DOM 순서 배경→전경→
     자막 오버레이 `<div>`가 z-index 없이 페인트 순서를 정함. `:97` 근사 주석을 resize 모드
     재현 설명으로 갱신.
2. `apps/web/src/fsd/widgets/clip-draft-review/ui/_component/CaptionStyleEditor.tsx`
   - ④ 미리보기 하단 안내 문구(`:305-311`)와 그 위 주석을 "전체 프레임을 보여주되 실렌더는
     화자를 따라 크롭"으로 갱신. 아포스트로피 없는 문구 유지(`react/no-unescaped-entities`
     비접촉).

### 스케치 대비 차이

없음. 분기 순서·조건·리터럴 값(`scale-110`·`blur-lg`·`object-cover`·`object-contain`)·
사용자에게 보이는 안내 문구 모두 스케치와 동일하게 반영했다.

### 검증

- `npm run check -w apps/web` → EXIT 0 (verify:fsd:test 11/11, verify:fsd 통과, next lint 0,
  tsc --noEmit 통과).
- `npm test -w apps/web` → 123 pass / 0 fail (29 suite). 새 테스트 없음.
  회귀 가드 `caption-preview.test.mjs`(19 it) 그대로 통과.
- `git diff --name-only`로 변경 파일이 위 두 컴포넌트 + 세션 시작 시점부터 있던
  `apps/web/.claude/settings.local.json`뿐임 확인(settings는 이번 작업 무관).

### 테스트로 못 덮은 범위 (배포 후 검토 화면 수동 확인)

계획서 「테스트」 절의 못 덮는 범위 5항목 그대로 — `npm test`는 Node 내장 러너(`tsx --test`)라
DOM·React 도구가 없어 `<video>` 레이어링·CSS·재생 동기·안내 문구는 러너 밖이다.

1. 전경 `object-contain`으로 원본 좌우가 더 이상 잘리지 않고 전체 프레임이 보이는가.
2. 상하 레터박스가 블러 배경(`object-cover` + `blur-lg`)으로 검은 테두리 없이 채워지는가.
3. 자막 위치·크기가 종전과 동일(캔버스 320px 기준)한가 — 배경 교체가 자막 자리를 흔들지 않는지.
4. 전경·배경이 눈에 띄게 어긋나지 않는가(루프 경계 재정렬로 충분한지).
5. `playUrl === null`(presign 로딩/실패) 시 검은 상자 + 하단 안내만 남는지.

`scale-110`·`blur-lg` 반경/배율은 실물 대조 후 조정 가능(스케치가 승인 기준값).
