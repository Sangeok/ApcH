# BUG-17 — 프로덕션 CSP `media-src`에 `blob:` 추가

## 2026-10-01 구현 (구현승인 → 완료)

### 계약 확인
- 계획서 `docs/plans/BUG-17.md`를 파일에서 다시 읽고 구현했다.
- 「현재 동작」을 코드와 대조해 전부 일치함을 확인하고 착수했다:
  - `next.config.js:60` `if (process.env.NODE_ENV === "development") return [];` — 개발 모드에서 CSP 헤더 전체를 건너뛴다. 일치.
  - `next.config.js:96` `img-src 'self' data: blob: https://lh3.googleusercontent.com https://*.amazonaws.com` — `'self'` 다음에 `blob:` 있음. 일치.
  - `next.config.js:97` `media-src 'self' https://*.amazonaws.com` — `blob:` 없음. 일치 (이 줄이 고칠 대상).
  - `UploadPodcast.tsx:42-57` `readVideoDurationSeconds` — `URL.createObjectURL(file)` → `<video>.src` → `onloadedmetadata`에서 `Number.isFinite(video.duration) ? video.duration : null`, `onerror`에서 `resolve(null)`. 일치.
  - `clip-count-budget.ts:23-37` `getMaxFeasibleClipCount` — `null`·비유한·`<= 0`이면 `MAX_CLIP_COUNT_OPTION`(=4) 반환. 일치.
- 계획서가 코드와 어긋나지 않아 그대로 구현했다.

### 고친 파일 (전수)
| 파일 | 변경 |
| --- | --- |
| `apps/web/next.config.js` | `:97` `media-src` 지시자에 `'self'` 다음으로 `blob:` 추가 |

diff (한 줄):
```
-              "media-src 'self' https://*.amazonaws.com",
+              "media-src 'self' blob: https://*.amazonaws.com",
```

### 스케치 대비 차이
없음. 계획서 「구현 스케치」의 before/after와 바이트 동일. `blob:`를 `img-src`(`:96`)와 같은 위치(`'self'` 다음)에 넣었고, 배열의 다른 지시자(`default-src`·`script-src`·`style-src`·`font-src`·`img-src`·`connect-src`·`frame-src`·`frame-ancestors`·`base-uri`·`form-action`)와 헤더 나머지(`X-Frame-Options` 등)는 손대지 않았다. `git diff --name-only` = `apps/web/next.config.js` 단 하나.

### 검증 (명령·결과)
- `npm run check -w apps/web` → EXIT 0. verify:fsd:test 11/11, verify:fsd 통과, next lint "No ESLint warnings or errors", tsc --noEmit 통과(무출력, 종료코드 0으로 별도 재확인).
- `npm test -w apps/web` → tests 182 / suites 45 / pass 182 / fail 0, EXIT 0.
- 둘 다 저장소 루트에서 실행.

### 테스트로 못 덮은 범위 (배포 후 수동 확인)
CSP 헤더는 **프로덕션 응답에서만** 판정된다(`:60`이 개발 모드에서 CSP를 끈다). `npm test`(Node 러너, DOM 없음)로도 로컬 `npm run dev`로도 이 변경의 효과를 확인할 수 없다. 배포 후 실물 확인이 필요하다:
1. `a-pch.com` 응답 헤더의 `Content-Security-Policy`에 `media-src 'self' blob: https://*.amazonaws.com`이 들어갔는지.
2. `/dashboard`에서 mp4를 선택했을 때 콘솔의 `Loading media from 'blob:…' violates … "media-src …"` 위반이 사라지고 길이 안내 줄(`UploadPodcast.tsx:322`)이 뜨는지 — 이어서 길이 기반 UI 셋(클립 수 상한 disable·길이 안내·30초 미만 차단)이 동작하는지.

### 비고
- `next.config.js`는 상시 쓰기 범위(`apps/web/src/**`) 밖이지만, 계획서 「범위 밖 의존」이 FEAT-32 전례(web-dev가 같은 파일의 `connect-src`를 고침)를 근거로 web-dev 편집을 명시했고 소유자가 게이트②에서 그 계획을 승인했다 — 그 범위 승인 안에서만 편집했다.
- 커밋·푸시는 하지 않았다.
