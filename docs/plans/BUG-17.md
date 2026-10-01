# BUG-17: 프로덕션 CSP가 `blob:` 미디어를 막아 업로드 폼의 영상 길이 측정이 항상 실패한다

agent: web-dev

## 현재 동작

- `next.config.js:58` `async headers()`는 프로덕션에서만 CSP를 붙인다 — `:60` `if (process.env.NODE_ENV === "development") return [];`가 개발 모드에서 헤더 전체를 건너뛴다.
- `:90-103`이 `Content-Security-Policy` 값을 지시자 배열로 조립한다. 그중 `:97`은 `              "media-src 'self' https://*.amazonaws.com",` — `blob:`가 없다. 바로 위 `:96` `              "img-src 'self' data: blob: https://lh3.googleusercontent.com https://*.amazonaws.com",`에는 `'self'` 다음에 `blob:`가 있다.
- 업로드 폼은 `UploadPodcast.tsx:42-57` `readVideoDurationSeconds`에서 `:44` `const url = URL.createObjectURL(file);`로 blob URL을 만들고 `:55` `video.src = url;`로 `<video>`에 걸어 `:47` `onloadedmetadata`에서 `:49` `Number.isFinite(video.duration) ? video.duration : null`을 읽는다. blob 미디어 로드가 CSP `media-src`에 막히면 `:51` `video.onerror = () => {`로 가 `:53` `resolve(null)`로 끝난다.
- 길이가 `null`이면 `clip-count-budget.ts:23-30` `getMaxFeasibleClipCount`가 가드 없음(=옵션 최댓값 4)을 돌려준다. 그래서 길이로 클립 수 옵션을 막는 것(`UploadPodcast.tsx:261-263` `const hasClipCountCap = maxFeasibleClips >= 1; ... option.value > maxFeasibleClips`), 길이 안내 줄(`:322` `{files.length > 0 && durationSeconds !== null && (`), 30초 미만 업로드 차단(`:333` `disabled={files.length === 0 || isUploading || maxFeasibleClips === 0}`)이 프로덕션에서 전부 꺼진다.

## 문제

프로덕션 CSP `media-src`(`next.config.js:97`)에 `blob:`가 없어, 업로드 폼이 고른 파일을 `<video>`로 읽어 길이를 재는 것이 항상 CSP에 차단된다(콘솔: `Loading media from 'blob:…' violates … "media-src 'self' https://*.amazonaws.com"`). 길이가 항상 `null`이 되어 길이 기반 UI 셋(클립 수 상한 disable · 길이 안내 · 30초 미만 차단)이 프로덕션에서 한 번도 동작하지 않는다. `img-src`(`:96`)에는 이미 `blob:`가 있으므로 `media-src`에 한 단어만 더한다. CSP는 개발 모드(`:60`)에서 꺼지므로 로컬에서 드러나지 않았다.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `next.config.js` | `:97` `media-src` 지시자에 `blob:`를 추가 (다른 지시자·순서 불변) |

## 구현 스케치

`next.config.js:97` 한 줄만 바꾼다. `img-src`(`:96`)와 같은 위치 — `'self'` 다음 — 에 `blob:`를 넣는다.

before (적기 직전 재확인, `:97`):

```js
              "media-src 'self' https://*.amazonaws.com",
```

after:

```js
              "media-src 'self' blob: https://*.amazonaws.com",
```

배열의 다른 지시자(`default-src`·`script-src`·`style-src`·`font-src`·`img-src`·`connect-src`·`frame-src`·`frame-ancestors`·`base-uri`·`form-action`)와 헤더 나머지(`X-Frame-Options` 등)는 손대지 않는다.

## 테스트

- **덮는 것**: 없음. 순수 함수를 새로 만들지 않는다 — CSP 문자열은 `next.config.js`의 헤더 정의라 `src/` 모듈이 아니고, 런타임 값이 아니라 빌드 설정이다.
- **못 덮는 범위**: CSP 헤더는 **프로덕션 응답에서만** 판정된다(`:60`이 개발 모드에서 CSP를 끈다). 그래서 `npm test`(Node 러너)로도, 로컬 `npm run dev`로도 이 변경의 효과를 확인할 수 없다. 배포 후 (1) `a-pch.com` 응답 헤더의 `Content-Security-Policy`에 `media-src ... blob:`가 들어갔는지, (2) `/dashboard`에서 mp4를 선택했을 때 길이 안내 줄이 뜨고 콘솔에 blob CSP 위반이 사라졌는지를 실물로 확인해야 한다. `npm run check`(lint+typecheck)로 파일이 여전히 유효한 JS인지는 확인한다.

## 범위 밖 의존

없음(막히는 지점 없음). 다만 `next.config.js`는 내 상시 쓰기 범위로 명시된 `apps/web/src/**`가 아니라 `apps/web/` 최상단이다. 보드가 이 항목을 `agent: web-dev` · `area: apps/web/next.config.js`로 배정했고, FEAT-32가 web-dev로 같은 파일의 CSP(`connect-src`)를 고친 전례가 있다 — 구현 단계에서 web-dev가 이 파일을 편집하는 근거다. 게이트②에서 소유자가 이 위치를 확인하도록 여기 남긴다.

## 대안

없음. `img-src`(`:96`)가 이미 `'self' data: blob: …` 형태로 `blob:`의 정확한 위치와 표기를 정해 두었으므로, 그것을 그대로 따른다. `media-src`에 `data:`까지 넣는 선택지는 필요 없다 — 업로드 폼은 `blob:`만 쓴다(`URL.createObjectURL`).
