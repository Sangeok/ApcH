# FEAT-60 — 설정 미리보기에 Framing 여백 띠 + 임시 SVG 장면, 슬라이더를 미리보기 옆으로

## 2026-10-13 구현 (구현승인 → 완료)

### 계약 확인
- 계획서 `docs/plans/FEAT-60.md`를 파일에서 다시 읽고(클린 패스본 9f0dc71 그대로 승인) 구현했다.
- 「현재 동작」을 코드와 대조해 전부 일치함을 확인하고 착수했다. 인용된 줄이 전부 맞았다:
  - `CaptionPreviewPlayer.tsx` props 인터페이스(`:20-37`)에 여백 prop 없음, `PREVIEW_HEIGHT_PX = 320`·`PREVIEW_WIDTH_PX = 180`, 상자 `relative mx-auto overflow-hidden rounded-lg bg-black`, 영상 레이어는 `playUrl !== null`일 때만, 자막 레이어는 `getPreviewVerticalInset` 기준. 일치.
  - `CaptionStyleEditor.tsx` props(`:15-29`)에 여백·슬롯 없음, 2열 그리드 `grid grid-cols-1 gap-4 md:grid-cols-2`, 왼쪽 칸 `flex flex-col gap-3`, 오른쪽 칸 `flex flex-col gap-2`, 플레이어 호출에 여백 없음, 샘플 안내 문구 그대로. 일치.
  - `settings/ui/index.tsx` Framing 하위 블록(`:262-293`) + 캡션 영역 머리(`:294-319`)가 카드 본문에 있고, 그 아래 `CaptionStyleEditor`(`:320-331`)가 `sample`·`playUrl={null}`로 호출됨. 상태·핸들러(`videoPaddingPercent`/`setVideoPaddingPercent`/`persistVideoPadding`/`editLanguage`/`setEditLanguage`)·`getVideoFrameLayout`·`framing`이 설정 컴포넌트에 있음. 일치.
- 계획서가 코드와 어긋나지 않아 그대로 구현했다.

### 고친 파일 (전수)
| 파일 | 변경 |
| --- | --- |
| `apps/web/src/fsd/features/caption-style/ui/CaptionPreviewPlayer.tsx` | `paddingPercent: number` prop을 `sample` 위에 추가. 모듈 내부 비공개 컴포넌트 `SampleScene`(인라인 SVG 화자 실루엣, `viewBox="0 0 320 180"` + `preserveAspectRatio="xMidYMid slice"`) 추가. `sample === true`일 때 영상 레이어와 자막 레이어 **사이에** `top/bottom: ${paddingPercent}%` 인셋 + `overflow-hidden`으로 가운데 장면을 그림 |
| `apps/web/src/fsd/features/caption-style/ui/CaptionStyleEditor.tsx` | `import type { ReactNode }` 추가. `paddingPercent: number`·`leadingControls?: ReactNode` prop 추가·구조분해. 왼쪽 칸에 `order-2 … md:order-1` + 맨 위 `{leadingControls}` 슬롯, 오른쪽 칸에 `order-1 … md:order-2`. 플레이어에 `paddingPercent={paddingPercent}` 전달 |
| `apps/web/src/fsd/pages/settings/ui/index.tsx` | Framing 하위 블록 + 캡션 영역 머리(`Captions` 제목·안내, 편집 언어 토글, 토글 안내)를 순서 그대로 떼어 `CaptionStyleEditor`의 `leadingControls` 프래그먼트로 이동(들여쓰기만 +6칸, 문구·로직 무변경). `paddingPercent={videoPaddingPercent}` 전달 |

`git diff --stat` 해당 줄:
```
 .../caption-style/ui/CaptionPreviewPlayer.tsx      |  44 ++++++++
 .../caption-style/ui/CaptionStyleEditor.tsx        |  14 ++-
 apps/web/src/fsd/pages/settings/ui/index.tsx       | 121 +++++++++++----------
 3 files changed, 119 insertions(+), 60 deletions(-)
```
`git diff --name-only`로 FEAT-60 세 파일만 변경됨을 확인(다른 세션 card-news 변경은 손대지 않음).

### 스케치 대비 차이
없음. 세 파일 모두 계획서 「구현 스케치」의 코드와 동일하게 넣었다:
- `SampleScene` SVG·그라데이션·좌표·색 리터럴은 스케치 1절과 바이트 동일.
- 장면 렌더 블록(`props.sample === true && …`)은 스케치 1절 동일, 삽입 위치는 영상 블록 `</>` 닫힘과 자막 레이어 `<div>` 사이.
- 편집기 그리드 order 클래스·`{leadingControls}` 슬롯 위치·플레이어 prop 순서(`position` → `paddingPercent` → `sample`)는 스케치 2절 동일.
- 설정 페이지 `leadingControls` 프래그먼트는 스케치 3절의 after와 동일. 옮긴 줄은 들여쓰기 +6칸 외 한 글자도 바꾸지 않았다(사용자 문구·`aria-*`·핸들러 동일). 분기 순서·조건·리터럴 값·사용자 문구 변경 없음.

### 검증 (명령·결과)
- `npm run check -w apps/web` → EXIT 0. `verify:fsd:test` 11/11, `verify:fsd` "FSD boundary check passed.", `next lint` "No ESLint warnings or errors", tsc(무출력) — 종료코드 0으로 별도 재확인(`echo check exit: $?` → 0).
- `npm test -w apps/web` → tests 319 / suites 49 / pass 319 / fail 0, EXIT 0.
- 둘 다 저장소 루트에서 실행. 수치는 작업 트리에 든 다른 세션 card-news 변경을 포함한 메인 트리 기준선(메인 루프 실측 319/0)과 일치한다. 계획서의 198/49/0은 HEAD 깨끗한 체크아웃 기준이며 차이는 그 때문이다. FEAT-60 세 파일 안에서 난 실패는 없다.

### 테스트로 못 덮은 범위 (배포 후 수동 확인, release-checks 등재 몫)
`npm test`는 Node 내장 러너(`tsx --test src/**/*.test.mjs`)라 DOM·React 렌더가 없어 JSX/SVG·레이어 겹침·그리드 순서를 판정하지 못한다. 미리보기가 기대는 수치 계약(픽셀식 골든 `video-framing.test.mjs`, 자막 인셋·큐 `caption-preview.test.mjs`, 첫 큐 `sample-captions.test.mjs`, 유효 스타일 `effective-caption-style.test.mjs`)은 이번 변경이 건드리지 않아 그대로 통과한다. 새 순수 함수는 없다(띠 높이는 `${paddingPercent}%` 한 줄이라 추출 시 등가 변이만 생김 — 계획서 「테스트」 판단). 배포 후 `/dashboard/settings`에서 데스크톱·모바일로 확인할 항목(계획서 「테스트」 못 덮는 범위 ①~⑥): 0%/10%/25% 띠 모습, 여백↑ 시 화자 **축소**(세로 비율이면 위아래만 잘림 — 실패 신호), 자막·띠 겹침 지점(Top ~10.4%·Bottom ~13.5%), 흰 자막 대비·다크 모드 동일, 모바일 미리보기 위·슬라이더 아래·실시간 반영, 왼쪽 칸 Framing→Captions→편집 토글→Preset 순서, `Save caption style`이 여백 불변(release-checks:93).

### 비고
- 세 파일 모두 `apps/web/src/**`(web-dev 상시 쓰기 범위) 안이다. 범위 밖 의존 없음. 계획서가 가리키는 백엔드 cover 크롭(`video_framing.py:27`)·INV-FRAMING-004·픽셀 골든은 설계 참조일 뿐 손대지 않았다.
- 커밋·푸시는 하지 않았다(메인 루프가 인수 뒤 커밋).
