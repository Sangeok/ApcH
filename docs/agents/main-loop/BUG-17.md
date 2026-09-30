# BUG-17 — 메인 루프 기록

## 게이트① (2026-09-30)

FEAT-59(업로드 옵션 개편)를 위해 프로덕션 a-pch.com/dashboard에서 파일 선택 상태를 관찰하던 중, 브라우저 콘솔에서
`media-src` CSP 위반을 봤다. 폼의 길이 안내 줄도 나타나지 않았다. 원인 줄(`next.config.js:97`)을 소유자에게
보고했고, 소유자가 「좋다. 방금 이야기한 것을 바탕으로 수정을 진행해」로 답했다 — 소유자 직접 발주로 게이트①을
연 것으로 기록한다. 게이트②는 계획 검증 뒤 소유자가 따로 연다.

- 담당: `next.config.js`는 web-dev 정의의 「수정 가능」(`apps/web/src/**`) 목록 밖이다. 다만 FEAT-32가 web-dev로 같은
  파일의 CSP `connect-src`를 고쳤고 그대로 인수됐다(`docs/plans/FEAT-32.md` 「고칠 파일」, `docs/agents/web-dev/FEAT-32.md`).
  그 전례를 따라 web-dev로 둔다.
- 병행: FEAT-59와 파일이 겹치지 않는다.
