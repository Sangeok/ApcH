---
name: release-verify
description: 배포 확인 원장(docs/release-checks.md)의 〔auto …〕 줄을 프로덕션 admin에서 판정해 마감한다. release-verify 루틴 전용 — 사람 세션에서는 메인 루프가 같은 스크립트를 직접 돌린다.
---

# release-verify — 원장 자동 마감 절차

고치는 파일은 `docs/release-checks.md` **하나**다. 다른 파일은 읽기만 한다. 작업은 네가 직접 한다(서브에이전트 금지).
`VERIFIER_SECRET` 값과 세션 쿠키 값은 어떤 출력·커밋 메시지·코멘트에도 적지 않는다.

1. `git checkout dev && git pull --ff-only origin dev`
2. `test -n "$VERIFIER_SECRET"` — 없으면 아무것도 하지 않고 "VERIFIER_SECRET 미설정 — 환경변수 필요"로 종료 보고한다.
3. `node scripts/release-verify/run.mjs --apply --report /tmp/release-verify.json`
   - 종료코드 2면 원장은 바뀌지 않았다. 보고서의 `login`(step·status)을 그대로 적어 종료 보고한다 — `csrf`/`callback` 실패는 대개 `VERIFIER_SECRET` 불일치·프로덕션 provider 미등록·네트워크 차단(`host_not_allowed`)이다. 백로그 이관은 사람이 한다.
4. `git diff --stat -- docs/release-checks.md`가 비어 있으면 "닫을 줄 없음"으로 종료한다(커밋 없음).
5. `git status --porcelain`이 `docs/release-checks.md` 한 줄뿐인지 확인한다. 다른 변경이 있으면 되돌리고(`git checkout -- <파일>`) 그 사실을 보고한다.
6. 커밋·푸시: `docs(ledger): 자동 확인 — pass N·fail M (release-verify)`, `git push origin dev`. 거부되면 `git pull --rebase origin dev` 후 한 번만 재시도한다.
7. 종료 보고(줄 단위): 닫은 줄 / 불합격 줄과 사유 / 조건 미충족으로 건너뛴 줄 수 / 로그인 canary(`login.ok`). 불합격은 원장 아래에 `자동 불합격(…)` 메모로 이미 남아 있다 — 사람이 확인해 `이관(항목ID)`으로 처리한다.

전제: 이 루틴의 클라우드 환경에 `VERIFIER_SECRET`(Vercel admin과 같은 값)이 있고, 허용 도메인에 `admin.a-pch.com`·`raw.githubusercontent.com`이 있다. PR 머지 직후 실행이 옛 배포를 봤더라도 해가 없다 — 불합격은 체크하지 않고, 다음 날 실행이 다시 본다.
