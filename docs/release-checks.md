# release-checks — 배포 확인 원장

테스트가 원리상 못 덮어(Node 러너 — DOM·시각·실제 외부 I/O 없음) **배포된 실물에서만 닫히는
확인 항목**의 상태 원장이다. 완료 항목마다 계획서·구현 보고가 「못 덮는 범위」를 선언하는데,
이 원장이 생기기 전에는 그 선언이 문서 열여섯 곳에 흩어진 채 마감 기록 없이 쌓였다
(2026-08-24 FEAT-19 관측). 여기가 그 선언의 단일 수집처다.

## 규칙

- **등재**: 메인 루프가 완료 인수(런북 7단계) 시 그 항목의 「못 덮는 범위」를 여기에 옮긴다.
  원천은 구현 보고(`docs/agents/<행위자>/<항목ID>.md`)이고, 없으면 보드 `결과`·계획서다.
  구현 시점에 이미 닫히는 선언(예: BUG-06의 카피↔로직 사람 대조)은 등재하지 않는다.
- **마감**: 체크는 증거로만 한다 — 세 종류뿐이다.
  - `확인(날짜, 근거)` — 사용자가 배포 화면에서 실물을 관측했거나, 실측 기록(Playwright 스윕 포함)이 있다. `확인(날짜, 자동 — 근거)`는 release-verify 루틴(FEAT-26)이 프로덕션 응답으로 닫은 것이다.
  - `대체(항목ID)` — 후속 항목이 그 화면을 교체하거나 같은 확인을 재선언해 옛 줄이 무의미해졌다.
  - `이관(항목ID)` — 확인에서 결함이 나와 `TASK_BACKLOG.md` 항목이 됐다.
- **이 문서는 상태 문서다** — `PROJECT_BOARD.md`처럼 갱신하며 `docs/agents/`의 append-only
  규약을 따르지 않는다. 확인 활동의 상세는 `docs/agents/main-loop/`에 쓴다.
- 절은 항목별·최신순(보드 섹션 순서). 전부 닫힌 절도 지우지 않는다 — 닫혔다는 사실이 기록이다.
- **자동 판정 태그**: 응답 상태·본문 문구·CSS 방출만으로 판정되는 열린 줄에는 등재 시 메인 루프가 줄 끝에 `〔auto GET <경로> [status=] [text=""]… [notext=""]… [css="a,b"] [when=""]… [when-any="a|b"] [when-board="<regex>"]〕`를 붙인다(문법·판정은 `scripts/release-verify/ledger.mjs`). 루틴은 `pass`면 태그를 지우고 `[x]` + `확인(…, 자동 — …)`로 닫고, `fail`이면 줄 아래에 `  - 자동 불합격(날짜): 사유`만 남기며(이관은 사람), `when*` 전제가 안 맞으면 건드리지 않는다. **⚠️ `<경로>`의 기준 호스트는 `admin.a-pch.com` 하나다** — 루틴이 `ADMIN_BASE_URL`(`run.mjs`) 하나만 쓰고 `getWithSession`이 `${base}${path}`로 합치므로 **절대 URL도, web(`a-pch.com`) 라우트도 받지 못한다.** web 화면은 공개 라우트라 해도 태그를 붙이면 admin 루트를 쳐 엉뚱한 불합격이 난다(2026-09-23 BUG-15에서 실제로 발생 — 등재한 메인 루프가 이 제약을 놓쳤다).
- 스윕 이력: 2026-08-24 1차(Playwright, admin 프로덕션) · 2차(시각 판정 — 스크린샷 판독 + FEAT-07 승인 시안 대조) · 3차(PR #101 합류 직후 재스윕 — FEAT-17·18 마감, 실보드 파생 상태 라이브 관측). 4차(2026-09-03, PR #111 합류 직후 — web 공개 라우트만, curl 실측: C-36/C-37 마감, C-72/C-73 절반). 상세는 `docs/agents/main-loop/FEAT-19.md`.

## 지금 무엇부터 — 2026-09-21 분류

열린 줄이 157까지 쌓여 「모아둔 것」과 「잊은 것」이 구별되지 않았다. 전수를 읽고
**16줄을 판정 불가로 마감**(아래 참조), 7줄을 재앵커·정정하고, 남은 **141줄을 무엇으로
닫히는지**에 따라 묶었다. 분류 근거와 과정은 `docs/agents/main-loop/release-checks-triage.md`.

| 묶음 | 줄 | 닫는 방법 | 크레딧 |
| --- | --- | --- | --- |
| **A. 웹 화면** | 46 | 로그인 1회로 대부분 — 설정 13 · 검토 18 · 업로드/대시보드/마케팅 15 | 검토 18줄만 `review_pending` 업로드 1건 필요 |
| **B. 렌더·워커** | 39 | 실제 처리 실행 — 클립이 만들어져야 판정된다 | **든다** |
| **C. admin 화면** | 35 | `admin.a-pch.com` 로그인 1회 — 대부분 시각 확인 | 없음 |
| **D. 외부 콘솔** | 21 | Sentry·Neon·Inngest·Polar·원격 루틴 | 없음 |

**가장 값이 큰 순서**: ① **설정 화면 13줄**(크레딧 0, 로그인 1회) → ② **렌더 1회**(FEAT-55·FEAT-52·FEAT-51이 같은 `.mp4`로 닫힌다) → ③ admin 35줄 → ④ 나머지.

**이 분류에서 나온 발견 둘**

- **실영상 미리보기 기능이 통째로 도달 불가다.** FEAT-52가 검토 화면 `Caption style` 다이얼로그를 삭제하면서 `CaptionStyleEditor`의 유일한 비-`sample` 소비자가 사라졌다. FEAT-36(8줄)·BUG-13(5줄)이 지키던 확인이 **어떤 화면에서도 판정되지 않는다** — 그중 13줄을 `대체`로 닫았고, 샘플에서도 유효한 4줄은 설정 화면 기준으로 재앵커했다. 코드 정리는 FEAT-56이 받는다.
- **FEAT-41의 「auto 생성 클립이 요청 스냅샷 스타일로 렌더되는가」가 한 번도 확인된 적이 없다.** 그래서 FEAT-55 절의 확인을 「배포 전과 같은가」(회귀)에서 **「설정한 스타일 그대로 나오는가」(긍정)**로 고쳤다 — 「같다」로 보면 처음부터 틀린 상태를 통과시킨다.

---

---

## FEAT-57 — `clip_review_caption_style_edited` 계측 이름 제거 (db+web 계약, 구현 2026-09-22)

원천: `docs/plans/FEAT-57.md`의 「테스트 — 못 덮는 범위」. **미배포** — 인수 시점 기준 `dev`에만 있다. 게이트 **넷 다** 인수 시 메인 루프가 직접 재실행했다: `check -w apps/web` EXIT 0 경고 0 · `test -w apps/web` **170/40/0** · `check -w apps/admin` EXIT 0 경고 0 · `test -w apps/admin` **334/75/0** — 계획서가 못박은 숫자와 일치. 계약 이름 **31 → 30**(기계 계수).
**줄을 하나만 등재한다.** 수집 엔드포인트(`z.enum`)가 이 이름을 거부하게 되는 것은 **발신자가 0이라 도달하지 않으므로** 확인 대상이 아니다(계획서가 그렇게 선언했고 코드 전역 grep 0건으로 확인했다). 남는 것은 admin 화면의 90일 창 수치 하나뿐이다.
**`〔auto〕` 태그를 붙이지 않는다**: 로그인 뒤 admin 분석 화면이라 공개 HTTP 응답으로 판정되지 않는다.

- [ ] admin 분석 **90일 창**에서 총계가 1 줄고(1116 → 1115) 이탈 상위 25에서 그 줄이 빠진다 — **7일·30일 창은 변화 없음**(계획 검증 실측). 2026-11-12경 그 1건이 창 밖으로 나가면 90일 창도 차이가 사라지므로, **그 전에 보지 않으면 판정 기회가 닫힌다**(FEAT-51 「전이 구간 회귀 0」이 같은 이유로 만료됐다)

---

## FEAT-54 — 캡션 기본값을 언어별로 (db+web, 구현 2026-09-23)

원천: `docs/plans/FEAT-54.md`의 「테스트 — 못 덮는 범위」. **미배포·마이그레이션 미적용** — 인수 시점 기준 `dev`에만 있다. 게이트는 `npx tsc --noEmit` **EXIT 0**(이 항목의 진짜 게이트 — 모양이 바뀌면 아홉 곳이 깨진다) · `npm run check -w apps/web` EXIT 0 경고 0 · `npm test -w apps/web` **170/40/0**(착수 기준선 그대로) — 셋 다 인수 시 메인 루프가 직접 재실행했다. 구현 파일이 계획서 「고칠 파일」 14행과 **정확히 일치**하고 초과 0이다.
**적용 순서가 FEAT-53과 반대다** — ADD라 **DB 먼저**다. 마이그레이션 적용 → 코드 배포. 반대로 하면 새 클라이언트가 없는 컬럼을 `SELECT`한다.
**`〔auto〕` 태그를 붙이지 않는다**: 전부 로그인 뒤 화면(설정·대시보드 업로드 폼)이라 공개 HTTP 응답으로 판정되지 않는다(루틴의 기준 호스트는 admin 하나다 — 머리말 참조).

- [x] **마이그레이션이 프로덕션 Neon에 적용됐는가** — 적용 후 `migrate status`·`db pull --print`로 본다 — **미적용(소유자 승인 대기)**
- [ ] **`Editing` 토글이 편집 대상을 바꾸는가** — 이 항목의 존재 이유다. 설정 화면에서 한국어로 넘겨 크기·줄당 단어를 바꾸고 영어로 돌아왔을 때 **영어 값이 그대로**인지. 저장 뒤 새로고침해도 두 값이 각각 남는지
- [ ] **업로드 폼에서 언어를 바꾸면 `Video style:` 라벨이 따라 바뀌는가** — 두 언어에 다른 프리셋을 저장해 두고 대시보드 업로드 폼의 언어 드롭다운을 오가며 본다
- [ ] **업로드가 그 언어의 스냅샷을 고정하는가** — 렌더까지 가야 보인다(크레딧). 한국어 업로드가 한국어 쪽 스타일로, 영어 업로드가 영어 쪽으로 나오는지
- [ ] **저장·초기화가 둘 다에 걸리는가** — `Reset both languages`를 누르면 두 언어 모두 언어 기본값으로 돌아가는지(버튼 라벨이 그렇게 말한다)

---

## BUG-15 — 홈페이지가 만들지 못하는 화면비를 약속한다 (web, 구현 2026-09-22)

원천: `docs/agents/web-dev/BUG-15.md`의 「못 덮는 범위」. **미배포** — 인수 시점 기준 `dev`에만 있다. 게이트는 `npm run check -w apps/web` EXIT 0 경고 0 · `npm test -w apps/web` **170/40/0** — 인수 시 메인 루프가 직접 재실행했고, diff가 계획서 스케치의 after 문자열과 **완전 일치**함도 확인했다.
**`〔auto〕` 태그를 붙이지 않는다** — 등재 때 붙였다가 **2026-09-23에 걷었다.** 판정 자체는
공개 응답 본문 문구로 가능하지만, release-verify 루틴은 **admin 호스트만 조회한다**
(`scripts/release-verify/run.mjs`의 `ADMIN_BASE_URL` 기본값 `https://admin.a-pch.com`,
`http.mjs`의 `getWithSession`이 `${base}${path}`로 합쳐 **절대 URL을 받지 않는다**).
그래서 `GET /`는 web 홈이 아니라 admin 루트를 쳐 307을 받았고, 루틴이 `자동 불합격`을 달았다 —
**배포 지연이 아니라 잘못된 태그 때문이다.** 이 제약은 FEAT-31 절이 이미 같은 문장으로
적어 뒀는데(「web 라우트를 판정하지 못한다」) 등재 때 놓쳤다. 잘못된 불합격 줄은 함께 지웠다.

- [ ] 홈 `Review & publish` 설명에서 `square, and landscape` 약속이 사라지고 세로 문구로 바뀌었다 — 배포 후 `https://a-pch.com/` 본문에서 육안 또는 `curl -sL https://a-pch.com/ | grep "Export vertical"` 한 줄로 확인된다

---

## FEAT-44 — 낡는 줄번호 인용을 함수명·코드 내용 앵커로 교체 (main-loop, 구현 2026-09-22)

원천: `docs/plans/FEAT-44.md`의 「테스트 — 못 덮는 범위」. 게이트 넷을 인수 시 직접 재실행했다: `check -w apps/web` EXIT 0 경고 0 · `test -w apps/web` **170/40/0** · backend **`Ran 109 tests ... OK`** · `py_compile` EXIT 0 — **넷 다 착수 기준선과 같은 숫자**다(동작 무변경의 기계 판정).

**줄을 하나도 등재하지 않는다.** 계획서 「못 덮는 범위」가 「없다」로 선언했고 그것이 옳다 — 주석·문서 문장만 바뀌어 렌더·응답·저장값에 닿지 않으므로 **배포 실물에서 확인할 대상이 없다.** 완료 판정은 `main\.py:\d+` 전역 grep 0건으로 이미 닫혔고(요구 ④), 그것은 배포와 무관하다. 확인할 수 없는 줄을 쌓지 않는 것이 2026-09-21 원장 분류의 교훈이다.

---

## FEAT-56 — FEAT-52·53이 남긴 죽은 코드 여섯 정리 (web, 구현 2026-09-21)

원천: `docs/agents/web-dev/FEAT-56.md`의 「못 덮는 범위」. **미배포** — 인수 시점 기준 `dev`에만 있다. 게이트는 `npm run check -w apps/web` **EXIT 0 · `✔ No ESLint warnings or errors`**(백로그 요구 ②a — 기존 `playUrl` 경고 1건 소멸) · `npm test -w apps/web` **tests 170 / suites 40 / fail 0**(178→170, 42→40, 파일 25 불변 — 계획서 예측과 정확히 일치) — 둘 다 인수 시 메인 루프가 직접 재실행했다. 구현 11파일이 계획서 스케치를 기계 적용한 패치본과 **11/11 바이트 동일**이다.

**줄을 하나만 등재한다.** 이 항목의 화면 확인 대부분은 **검증 단계에서 이미 닫혔다** — 필수 경로 8(실물 렌더)로 `CaptionStyleEditor`의 before/after JSX를 `renderToStaticMarkup`으로 실제 렌더해 **도달하는 상태(`sample=true`)의 마크업이 EN·KR 모두 바이트 동일**함을 보였고(`docs/agents/main-loop/FEAT-56.md`), `previewCaptionCues` 제거의 등가성은 원본 함수 실행으로 증명했다. `ClipDraftCard`의 `playUrl`은 본문 소비가 0이라 마크업에 닿지 않는다(lint 경고가 그 증거였다). **남는 것은 「조합된 화면이 런타임에 뜨는가」 하나뿐이라 그것만 적는다** — 확인할 수 없는 줄을 쌓지 않는 것이 2026-09-21 분류의 교훈이다.

- [ ] 배포 후 **설정 화면과 검토 화면이 오류 없이 열린다** — `/dashboard/settings`의 `Video style` 카드에 샘플 미리보기가 그려지고, `review_pending` 업로드의 검토 화면에서 클립 카드·구간 편집·전체 선택이 그대로 동작한다. 마크업 동일성은 검증 단계에서 닫혔고 여기서 보는 것은 **임포트 해석과 런타임 렌더**뿐이다(11파일 중 3개가 렌더 경로다)

---

## FEAT-55 — FEAT-52 뒤 죽는 클립별 캡션 스타일 경로 제거 (backend, 구현 2026-09-21)

원천: `docs/agents/backend-dev/FEAT-55.md`의 「못 덮는 범위」와 계획서 「테스트」. **배포됨(2026-09-21)** — 소유자 승인 후 `PYTHONUTF8=1 python -m modal deploy main.py`(이 머신은 `modal`이 PATH에 없어 `python -m modal`로 돈다). `✓ App deployed in 6.717s`, 로컬 모듈 마운트에 `PythonPackage:caption_style_source` 재생성 확인(필수 6경로 중 **경로 7 음성 시험**이 "여기가 틀리면 컨테이너 시작에서만 죽는다"고 지목한 자리다), 엔드포인트 `https://sangeok--ai-podcast-clipper-process-video.modal.run`. 게이트는 `PYTHONUTF8=1 python -m unittest discover -s apps/backend -p "test_*.py"` **`Ran 109 tests ... OK`**(기준선 113, 이 모듈 8→4 — 계획서가 못박은 기대값과 정확히 일치) · `python -m py_compile apps/backend/main.py` exit 0 — 인수 시 메인 루프가 직접 재실행했다. 구현 결과물이 계획서 스케치와 **바이트 동일**이고, `main.py`가 검증 라운드의 기계 패치본과 **바이트 동일**임도 확인했다.
**이 항목은 동작 무변경이다** — 지운 `moment_style` 인자가 FEAT-52 배포·FEAT-53 DB 제거로 이미 항상 `None`이었다. 그래서 아래 두 줄의 확인 성격은 "새 기능이 보이는가"가 아니라 **"회귀가 없는가"**다.
**배포 순서 제약 없음** — FEAT-51과 달리 선행·후행이 없다.
**`〔auto〕` 태그를 붙이지 않는다**: 둘 다 Modal 워커 내부 전달이거나 GPU·ffmpeg·pysubs2가 만든 `.mp4` 자막이라 공개 HTTP 응답으로 판정되지 않는다.

- [ ] `main.py` 호출부의 실배선 — 엔드포인트 → `.spawn`/`.remote` → `_do_process_video` → 1-인자 `select_caption_style(request_caption_style)` 주입까지 요청 스냅샷이 실제로 전달된다. `main.py`가 `whisperx`→`torch`를 import해 unittest 러너로 안 돌아 `py_compile`+`git diff`로만 덮였다. `modal run` 실물 필요 (FEAT-51 절의 같은 줄을 대체한다)
- [ ] 실렌더 — 배포 후 첫 렌더의 `.mp4` 자막이 **설정한 스타일 그대로** 나온다(미설정이면 언어 기본값). auto·render 양쪽. **긍정 판정이다** — 「배포 전과 같은가」로 보면 안 된다. FEAT-41 절의 「auto 생성 클립이 요청 단위 스냅샷 스타일로 렌더되는가」가 **한 번도 확인된 적이 없어**, 「같다」는 기준으로는 처음부터 틀린 상태를 통과시킨다(2026-09-21 원장 분류에서 발견). **FEAT-52 절의 「render 실렌더가 업로드 스냅샷 스타일로 나온다」와 같은 렌더 한 번으로 함께 판정된다**

---

## FEAT-51 — `render` 모드도 요청 단위 캡션 스냅샷으로 폴백 (backend, 구현 2026-09-17)

원천: `docs/agents/backend-dev/FEAT-51.md`의 「못 덮는 범위」와 계획서 「테스트」. **배포됨(2026-09-17)** — 소유자 승인 후 `PYTHONUTF8=1 python -m modal deploy main.py`(이 머신은 `modal`이 PATH에 없어 `python -m modal`로 돈다). `✓ App deployed in 6.486s`, 로컬 모듈 마운트에 `PythonPackage:caption_style_source` 재생성 확인, 엔드포인트 `https://sangeok--ai-podcast-clipper-process-video.modal.run`. 게이트는 `PYTHONUTF8=1 python -m unittest discover -s apps/backend -p "test_*.py"` **`Ran 113 tests ... OK`**(기준선 117, 이 모듈 12→8) · `python -m py_compile apps/backend/main.py` exit 0 — 인수 시 메인 루프가 직접 재실행했고, 구현 결과물이 계획서 스케치와 **바이트 동일**임도 확인했다.
**`〔auto〕` 태그를 붙이지 않는다**: 세 줄 전부 GPU·ffmpeg·pysubs2가 만든 `.mp4` 자막이나 Modal 워커 내부 전달이라 공개 HTTP 응답으로 판정되지 않는다.
**전제 변경(2026-09-19)**: FEAT-52가 배포돼 웹이 render 요청에도 요청 단위 `caption_style`을 싣는다 — 폴백 경로의 휴면이 풀렸다. 그리고 그 배포로 **첫 줄의 확인 창이 닫혔다**(아래 참조). FEAT-55(2026-09-21 구현)는 이 절이 가리키는 `select_caption_style` 호출부를 다시 고쳤다.

- [x] 전이 구간 회귀 0 — FEAT-51만 배포된 상태에서 검토 확정 렌더가 오늘과 같은 자막으로 나온다(클립별 스타일이 계속 이김) — **대체(FEAT-52)**: 이 줄은 「FEAT-51만 배포된 상태」를 전제했는데 2026-09-19 FEAT-52 배포로 그 상태가 끝났다. **확인 창이 관측 없이 지났다** — 회귀 보고는 없었으나 확인했다는 뜻이 아니다. FEAT-55가 `moment_style` 경로 자체를 지워 이 줄이 지키려던 위험은 더 이상 존재하지 않는다.
- [x] `main.py` 호출부의 실배선 — 엔드포인트 → `.spawn`/`.remote` → `_do_process_video` → `select_caption_style` 주입까지 요청 스냅샷이 실제로 전달된다 — **대체(FEAT-55)**: FEAT-55가 바로 그 호출부를 1-인자로 고쳤다. 지금 확인해야 할 것은 FEAT-51 시점의 배선이 아니라 FEAT-55 이후의 배선이므로, FEAT-55 절이 같은 확인을 재선언한다.
- [ ] render 폴백의 실효 — 사용자가 설정한 스타일이 render 클립의 실제 `.mp4` 자막에 나타난다. **선행 충족(2026-09-19 FEAT-52 배포) — 지금 판정 가능하다.** 단 FEAT-55 배포 뒤에 보는 편이 낫다(같은 렌더 한 번으로 FEAT-55 절의 회귀 확인까지 닫힌다)

---

## FEAT-52 — 캡션 스타일을 검토 화면에서 제거하고 설정 전용으로 (web, 구현 2026-09-17)

원천: `docs/agents/web-dev/FEAT-52.md`의 「못 덮는 범위」와 계획서 「테스트」. **미배포** — 인수 시점 기준 `dev`에만 있다. 게이트는 `npm run check -w apps/web` EXIT 0(verify:fsd 통과·tsc 통과) · `npm test -w apps/web` **`tests 178 / suites 42 / pass 178`**(기준선 183→178, 파일 26→25) — 둘 다 인수 시 메인 루프가 직접 재실행했고 계획서가 못박은 기대값과 정확히 일치했다. 선행 **FEAT-51은 이미 프로덕션에 배포**돼 백엔드가 요청 스냅샷 폴백을 받을 준비를 마쳤다.
**2026-09-19 배포됨**(PR #122 `dev`→`main` 머지 → Vercel). 머리말의 「미배포」는 인수 시점 기준이며, **아래 여섯 줄은 지금 전부 판정 가능하다.**
**`〔auto〕` 태그를 붙이지 않는다**: 전부 로그인 뒤 화면(설정·업로드 폼·검토)이거나 GPU·ffmpeg·pysubs2 렌더 산출물이라 공개 HTTP 응답으로 판정되지 않는다.

- [ ] 설정 화면 카드가 **`Video style`** 제목으로 뜨고, 설명이 "업로드 시점에 고정된다"를 말하며, 안에 **`Captions` 섹션 헤더**가 보인다
- [ ] **`Default` 칩이 프리셋 칩 맨 앞에 뜬다** — 기본값을 한 번도 안 정한 계정에서 그 칩이 켜져 있고, 누르면 언어 기본값으로 돌아가며(컨트롤·미리보기가 EN 122/5단어·KR 130/3단어를 그린다), 프리셋을 고르면 `Default`가 꺼지고 그 프리셋이 켜진다
- [ ] **미리보기 언어 토글이 미리보기만 바꾼다** — `한국어`로 넘기면 샘플·숫자가 한국어 기준으로 바뀌고, 그 상태에서 업로드 기본값 카드의 `Save`를 눌러도 **다음 업로드 언어가 안 바뀐다**(관측 4의 사고 경로가 닫혔는지)
- [ ] 업로드 폼(언어·클립 수·Generation 옆)에 **`Video style: <라벨>` 읽기 전용 한 줄**과 설정 링크가 뜨고, 라벨이 실제 기본값을 따라간다(미설정 → `Default`)
- [ ] **검토 화면에서 캡션 스타일 UI가 사라졌다** — 카드에 `Caption style` 버튼이 없고 다이얼로그가 열리지 않는다. 구간·선택 편집은 그대로 동작한다
- [ ] **render 실렌더가 업로드 스냅샷 스타일로 나온다** — 검토를 켠 업로드에서 스타일을 설정해 두고 확정하면, 만들어진 `.mp4` 자막이 그 스타일이다. **FEAT-51 + FEAT-52 둘 다 배포된 뒤에만 판정된다**(FEAT-51 절의 「render 폴백의 실효」와 같은 확인이다 — 둘 중 하나로 닫으면 나머지는 대체 처리)

## FEAT-50 — 검토 화면에서 캡션 기본값 캡처 (web, 구현 2026-09-16)

원천: `docs/agents/web-dev/FEAT-50.md`의 「테스트로 못 덮는 범위」와 계획서 「테스트」. **미배포** — 인수 시점 기준 `dev`에만 있다. 게이트는 `npm run check -w apps/web` EXIT 0 · `npm test -w apps/web` **183/183 · suites 42**(176→183, 인수 시 메인 루프 재실행). 인수 때 검증 라운드의 스케치 기계 적용본과 실구현을 대조했고 10파일 중 9파일 내용 동일(나머지 1건은 보고된 주석 표현 조정), 신규 순수 함수는 바이트 동일이었다.
선행 FEAT-42(설정 화면 캡션 기본값·업로드 스냅샷)는 이미 실물에 있다.
**`〔auto〕` 태그를 붙이지 않는다**: 다섯 줄 전부 로그인 뒤 `review_pending` 업로드의 검토 다이얼로그에서만 판정되고, 저장·시드는 DB write이며 계측은 fire-and-forget I/O라 공개 응답으로 판정되지 않는다.

- [x] 캡션 스타일 다이얼로그 푸터가 **다섯 버튼**(좌: Reset style · Save as my default / 우: Cancel · Apply to all clips · Apply)으로 뜨고 좌우 그룹이 양끝으로 갈린다 — **대체(FEAT-52)**
- [x] **「Save as my default」가 실제로 저장한다** — 누른 뒤 설정 화면 캡션 기본값이 그 스타일로 바뀌어 있고, 다음 업로드의 스냅샷에도 반영된다. 작업본이 비어 있을 때(스타일 없는 드래프트를 열었거나 Reset 직후 스냅샷이 null) 그 버튼이 **비활성**이다 — 활성이면 기본값이 지워진다 — **대체(FEAT-52)**
- [x] **Reset style이 업로드 스냅샷으로 되돌린다** — 스냅샷이 있는 업로드에서 스타일을 바꾼 뒤 Reset하면 언어 기본값이 아니라 그 스냅샷 값으로 돌아온다(스냅샷이 null인 업로드에서는 지금까지처럼 언어 기본값) — **대체(FEAT-52)**
- [x] **커스텀 클립이 스냅샷으로 시드된다**(요구 ③ — FEAT-41/42의 "커스텀은 언제나 언어 기본값" 결정을 뒤집은 것) — 스냅샷이 있는 업로드에서 직접 클립을 추가하면 그 클립도 형제 AI 클립과 같은 스타일로 렌더된다 — **대체(FEAT-52)**
- [x] 계측 `settings_defaults_saved`가 `source: "review_dialog"`·`preset`과 함께 admin 분석에 기록된다(설정 화면발 `source: "settings_page"`와 구분된다) — **대체(FEAT-52)**

> **다섯 줄 전부 대체(FEAT-52, 2026-09-17).** FEAT-52가 검토 화면의 캡션 스타일 다이얼로그를
> 통째로 없앴다 — 「Save as my default」·Reset·다섯 버튼 푸터·`source: "review_dialog"` 계측이
> 모두 사라졌으므로 이 줄들은 확인할 화면이 없다. 네 번째 줄(커스텀 클립이 형제와 같은 스타일로
> 렌더된다)만 결과가 살아남되 **경로가 바뀌었다** — 드래프트 시드가 아니라 백엔드의 요청 스냅샷
> 폴백(FEAT-51)이 같은 결과를 낸다. 그 확인은 아래 FEAT-52 절의 실렌더 줄이 받는다.
> FEAT-50은 프로덕션에 배포되지 않은 채 대체됐다.

## FEAT-48 — 검토 카드에 참고 번역 저장·표시 (web, 구현 2026-09-16)

원천: `docs/agents/web-dev/FEAT-48.md`의 「테스트로 못 덮는 범위」와 계획서 「못 덮는 범위」. **배포됨 — 2026-09-16 14:02 KST**, PR #121 `main` 합류(`2d32588`, 13:59 KST 소유자) → Vercel `Production – apc-h` success(배포 id 6474129936, sha `2d32588`). 선행 둘은 이미 실물에 있다: FEAT-46(백엔드, 2026-09-15 배포, Modal v27)과 FEAT-47(컬럼, 2026-09-16 프로덕션 Neon 적용).
게이트는 `npm run check -w apps/web` EXIT 0 · `npm test -w apps/web` **176/176 · suites 41**(162→176, 인수 시 메인 루프 재실행). 인수 때 계획서 스케치 블록을 기계 추출해 구현본과 대조했고(추가된 줄이 전부 승인된 블록에서 나왔으며 스케치 밖 누출 0·삭제 0), 신규 순수 함수는 스케치와 바이트 동일(1831), 골든 문구 두 줄은 승인본 그대로였다.
**이 절이 앞 두 절의 미완을 이어받는다** — FEAT-47 절 셋째 줄(컬럼에 값이 채워지는가)과 FEAT-46 절 넷째 줄(번역이 그 후보의 뜻인가)이 예고한 대로다. 그 둘은 `대체(FEAT-48)`로 닫았다.
**`〔auto〕` 태그를 붙이지 않는다**: 로그인 뒤 `review_pending` Korean 업로드의 검토 화면에서만 판정되고, 값이 채워지는지는 DB·실제 analyze 실행이 필요하다.

- [ ] **Korean 업로드 검토 카드에 참고 번역 블록이 영어 원문 아래 뜨는가** — 카드의 `What's said in the video (English)` 원문 박스 **아래**에 `Korean reference — final subtitles are translated separately and may differ.` 라벨과 한국어 번역 박스(원문과 같은 `bg-muted` · 3줄 클램프)가 보이는지. **FEAT-46 배포 이후 새로 분석한 Korean 업로드만 해당** — 그 전 업로드와 기존 드래프트는 컬럼이 null이라 블록이 없다(백필 없음)
- [ ] **구간을 편집하면 라벨이 낡음을 밝히고, 되돌리면 복구되는가** — 넛지(`−`/`+`)로 시작이나 끝을 0.1초 넘게 옮기면 라벨이 `Korean reference for the AI-suggested range — final subtitles are translated separately and may differ.`로 바뀌는지(번역은 AI 구간 기준이라 그대로 남는다), `Reset to AI suggestion`을 누르면 다시 첫 문구로 돌아오는지. 앞으로 당기든 뒤로 밀든 같아야 한다
- [ ] **컬럼에 값이 실제로 채워지는가**(FEAT-47 절에서 이어받음) — 웹훅 → `modal/video.analyzed` 이벤트 → Inngest `persist-clip-drafts` 배선을 거쳐 `ClipDraft.referenceTranslation`에 문자열이 저장되는지. 네 곳 중 하나라도 빠지면 **에러 없이 null**이 되고 화면에는 「블록 없음」으로만 보인다 — 그래서 화면이 비어 있으면 번역 실패인지 배선 누락인지 Modal 로그(`Reference translation error:`)로 갈라야 한다
- [ ] **English 업로드와 커스텀 클립에는 블록이 없는가** — 회귀 확인. English 업로드 카드에는 번역 블록도 라벨도 없어야 하고(백엔드가 키 자체를 싣지 않는다), 검토 화면에서 직접 추가한 커스텀 클립도 마찬가지다(`createCustomClipDraft`는 이 필드를 넣지 않는다)
- [ ] **번역이 그 후보 영어 원문의 뜻인가**(FEAT-46 절에서 이어받음) — 문장 단위로 자연스러운지, 다른 후보의 번역이 붙는 인덱스 어긋남이 없는지. 카드의 영어 원문과 번역이 같은 구간을 가리키는지(구간을 편집하지 않은 상태에서)

---

## FEAT-47 — `ClipDraft.referenceTranslation` 컬럼 (db, 구현 2026-09-16)

원천: `docs/agents/main-loop/FEAT-47.md`의 「원장」과 계획서 「못 덮는 범위」. **마이그레이션은 프로덕션 Neon에 적용 완료 — 2026-09-16**, 소유자 승인("적용 진행") 뒤 메인 루프가 `migrate deploy` 실행. 코드(스키마·생성 클라이언트)도 **배포됨 — 2026-09-16 14:02 KST**, PR #121 `main` 합류(`2d32588`) → Vercel `Production – apc-h`·`Production – apch-admin` 둘 다 success.
게이트는 `npm run check --workspaces --if-present` EXIT 0 · `npm test -w apps/web` **162/0** · `-w apps/admin` **334/0** · `prisma generate` 7파일(인수 시 메인 루프 재실행). 인수 때 계획서 코드 블록 다섯을 기계 추출해 실파일과 바이트 대조했고, 스키마에서 바뀐 줄이 추가 11·삭제 4뿐임을 전수로 확인했다.
**이 항목만으로는 사용자 체감 변화가 없다** — 값을 채우는 저장 매핑과 카드 표시는 FEAT-48이다. 그때까지 모든 행이 null이므로 아래 셋째 줄은 FEAT-48 절이 이어받는다.
**`〔auto〕` 태그를 붙이지 않는다**: DB 카탈로그와 로그인 뒤 검토 화면에서만 판정된다.

- [x] **마이그레이션이 프로덕션 Neon에 실제로 적용됐는가** — 적용 후 `migrate status`와 `db pull --print`로 본다 — 확인(2026-09-16, 실측 — `migrate deploy` EXIT 0 `All migrations have been successfully applied.` · 적용 후 `migrate status` **`Database schema is up to date!`** · `db pull --print`의 `model ClipDraft` 안에 `referenceTranslation String?` 1건 · 대상 `neondb`@`ep-wild-pine-a4avujag.us-east-1.aws.neon.tech`)
- [ ] **새 생성 클라이언트가 배포된 뒤 검토 화면·편집 저장·렌더 디스패치가 그대로 도는가** — `select` 없는 `ClipDraft` 쿼리 넷이 이제 새 컬럼을 함께 읽는다(`listClipDraftsForAttempt` · 카드 편집 저장 `update` · `getSelectedRenderMomentsForAttempt` · 업로드 상세). `review_pending` 업로드의 검토 화면에 후보 카드가 뜨는지, 카드 편집이 저장되는지, 선택 후 렌더 디스패치가 시작되는지. 컬럼 적용이 코드 배포보다 앞섰으므로 정상이 기대값이다
- [x] **(FEAT-48 배포 후) 컬럼에 값이 실제로 채워지는가** — 대체(FEAT-48, 2026-09-16 — 예고대로 FEAT-48 절 셋째 줄이 같은 확인을 재선언했다) — 이 항목만으로는 전 행이 null이다(백필 없음)

---

## FEAT-49 — Korean 캡션 스타일 미리보기를 한국어 샘플로 · Uppercase·Words per line 힌트 (web, 구현 2026-09-15)

원천: `docs/agents/web-dev/FEAT-49.md`의 「테스트로 못 덮는 범위」와 계획서 「못 덮는 범위」. **배포됨 — 2026-09-15 22:28 KST**, PR #120 `main` 합류(`2af048b`, 22:25 KST 소유자) → Vercel `Production – apc-h`·`Production – apch-admin` success. (원장 표기는 FEAT-46 배포 기록 때 메인 루프가 커밋 상태로 대조해 갱신)
게이트는 `npm run check -w apps/web` EXIT 0 · `npm test -w apps/web` **162/162 · suites 37**(인수 시 메인 루프 재실행). 치환 판정은 `previewCaptionCues` 테스트가 덮지만, 플레이어가 그 함수에 실제 `language`·`sample`을 넘기는 배선과 재생 중 큐 전환은 `<video>` state라 러너·정적 렌더 밖이다 — 배선은 인수 때 diff ↔ 스케치 기계 대조로 일치를 봤고, 실물 동작은 아래 첫 줄이 맡는다.
**`〔auto〕` 태그를 붙이지 않는다**: 검토 다이얼로그는 로그인 뒤 `review_pending` 업로드에서만, 설정 화면도 로그인 뒤에만 보인다.

- [x] **Korean 업로드 검토 화면의 `Caption style` 다이얼로그 미리보기가 재생 중 한국어 샘플을 그리는가** — 영상이 도는 동안 자막 자리에 영어 원문 대신 `지금 자막 스타일을` 같은 한국어 샘플 토큰이 큐 시각에 맞춰 바뀌며 뜨는지. Words per line을 올리면 한 줄이 길어지고, Uppercase를 켜도 글자 모양이 그대로인지  
  → **대체(FEAT-52)**: 이 줄의 대상인 **검토 화면 `Caption style` 다이얼로그가 FEAT-52로 삭제됐다.** `CaptionStyleEditor`의 소비자를 전수 열거하면 이제 `pages/settings/ui/index.tsx:260` **하나뿐**이고 `sample`(항상 true)·`playUrl={null}`을 고정 전달한다(2026-09-21 메인 루프 직접 grep). 즉 **실영상 미리보기 경로 전체가 도달 불가**이며 이 확인은 어떤 화면에서도 판정할 수 없다. 관측 없이 소멸했다 — 확인했다는 뜻이 아니다.
- [ ] **샘플의 크기·줄 길이가 실제 렌더 클립과 대략 비슷해 보이는가** — 같은 스타일로 생성한 Korean 클립과 나란히 볼 때 글자 크기·한 줄 폭·화면 차지가 크게 어긋나지 않는지. 샘플은 "영어 N단어 = 한국어 N토큰" 근사라 정확히 같을 수는 없다 — 근사가 스타일 판단을 오도할 만큼 크면 이관. **[재앵커 2026-09-21]** 검토 화면 다이얼로그가 FEAT-52로 사라져 **설정 화면(`/dashboard/settings`) 캡션 섹션의 정지 샘플**에서 판정한다 — 이제 `CaptionStyleEditor`의 유일한 소비자다.
- [ ] **안내와 힌트가 언어대로 갈리는가** — **[재앵커 2026-09-21]** 인용된 Korean 라이브 안내(`… so framing will differ. The Korean words shown are a sample …`)는 `CaptionStyleEditor`의 `!sample` 갈래라 **도달 불가가 됐다**(FEAT-52가 유일한 비-sample 소비자를 삭제). 설정 화면 샘플 안내는 언어와 무관하게 `This is a sample. …` 하나다. **남은 판정 대상은 힌트 둘뿐이다** — Words per line 아래 `For Korean, this counts English source words per line before translation.`, Uppercase 아래 `Korean text isn't affected — only English words mixed into a line are uppercased.`가 보이는지. English 업로드: 안내가 `… so framing will differ.`에서 끝나고 힌트 둘이 없으며, 미리보기 글자는 영어 원문 그대로인지
- [ ] **설정 화면(언어 Korean) 캡션 섹션이 기존대로인가** — 샘플 안내 `This is a sample. …`는 그대로이고 힌트 둘이 함께 보이는지, 샘플 첫 큐가 종전처럼 `지금 자막 스타일을`(줄당 단어 기본 3)인지

---

## FEAT-46 — Korean analyze 후보마다 참고 번역(referenceTranslation) (backend, 구현 2026-09-15)

원천: `docs/agents/backend-dev/FEAT-46.md`의 「못 덮은 범위」. **배포됨 — 2026-09-15 23:42 KST**, 소유자 지시("FEAT-46 백엔드 배포 진행")로 메인 루프가 실행(`PYTHONUTF8=1 …\apch-backend\Scripts\python.exe -m modal deploy main.py`, 6.7초, EXIT 0, Modal **v27**, 마운트에 `PythonPackage:reference_translation` 포함, 엔드포인트 URL 불변). 코드는 PR #120으로 `main`에도 합류해 있다(`2af048b`). 배포 직전 unittest **117 OK** · `py_compile` 0 재실행.
게이트는 unittest **117/0**(+38) · `py_compile` 0(인수 시 메인 루프 재실행). 인수 때 신규 모듈이 계획 스케치와 동일하고 `main.py`는 빈 줄 외 동일함을 기계 대조했으며, 실제 테스트 파일에 모듈 돌연변이 18종을 심어 전부 사멸함을 확인했다.
**이 항목만으로는 사용자 체감 변화가 없다** — web 웹훅 정규화기(`normalizeAnalyzedMoment`)가 모르는 필드를 버리고, 저장은 FEAT-47·표시는 FEAT-48이다. 번역이 실제로 채워지는지·품질은 FEAT-48 배포 뒤 화면에서 보고, 이 절의 앞 세 줄은 배포 컨테이너와 analyze 무회귀를 맡는다.
**`〔auto〕` 태그를 붙이지 않는다**: Modal 실행·로그와 로그인 뒤 검토 화면에서만 판정된다.

- [x] **배포된 컨테이너가 `reference_translation`을 import하는가** — 배포 직후 `process_video`에 잘못된 토큰으로 유효한 형태의 바디를 POST → **401**(FEAT-41 절 첫 줄과 같은 확인). 이미지 등록이 빠졌으면 컨테이너가 기동하지 못해 모든 모드가 죽는다 — 확인(2026-09-15, 실측 — 배포 출력 마운트에 `PythonPackage:reference_translation` · 잘못된 토큰으로 `{"s3_key":"probe/none.mp4","language":"Korean","clip_count":1,"mode":"analyze"}` POST(23:42:56) → **401** `{"detail":"Incorrect bearer token"}`, spawn 전 거부라 부작용 없음 · `modal container list` 활성 컨테이너 1, 시작 23:43으로 배포 이후)
- [ ] **English 업로드의 분석이 이전과 같은가** — `Review first` English 업로드가 `review_pending`까지 가고 후보 카드가 이전처럼 뜨는지. English 경로는 번역 호출이 없어야 하므로 그 실행의 Modal 로그에 `Reference translation error:`가 없어야 한다
- [ ] **Korean analyze가 번역 때문에 실패·지연되지 않는가** — `Review first` Korean 업로드가 `review_pending`까지 가는지, Modal 로그에 `Reference translation error:`가 없는지(있으면 사유를 본다 — 특히 배포 이미지의 미고정 최신 `google-genai`가 `http_options` timeout을 거부한 `ValidationError`인지), analyze 소요 시간이 이전과 크게 다르지 않은지
- [x] **(FEAT-48 배포 후) 검토 카드의 참고 번역이 그 후보 영어 원문의 뜻인가** — 대체(FEAT-48, 2026-09-16 — 예고대로 FEAT-48 절 다섯째 줄이 같은 확인을 재선언했다) — 문장 단위로 자연스러운지, 다른 후보의 번역이 붙는 인덱스 어긋남이 없는지

---

## FEAT-45 — 검토 화면 "transcript/source" 문구를 사용자 말로 (web, 구현 2026-09-15)

원천: `docs/agents/web-dev/FEAT-45.md`의 「테스트로 못 덮은 범위」. **배포됨 — 2026-09-15 14:53 KST**, PR #119 `main` 합류(`5567b2f`) → Vercel `Production – apc-h` success.
게이트는 `npm run check -w apps/web` EXIT 0 · `npm test -w apps/web` **154/154**(인수 시 메인 루프 재실행, 수 불변 — 골든 문자열 2개 교체). 표시 조건(비영어 업로드에서만)은 바뀌지 않아, English 업로드에서 안내·라벨이 없는지는 아래 FEAT-37 절 셋째 줄이 계속 맡는다. FEAT-37 절의 옛 문구 관측 두 줄은 이 절로 `대체`됐다.
**`〔auto〕` 태그를 붙이지 않는다**: 로그인 뒤 `review_pending` 업로드의 검토 화면에서만 보인다.

- [ ] **Korean 업로드 검토 화면 헤더에 새 안내가 보이는가** — 「N moments suggested … credits」 문단 아래 `bg-muted` 박스로 `Subtitles will be translated to Korean when you generate. This review shows what's said in the video, in English.`가 뜨는지
- [ ] **카드마다 새 라벨이 영어 원문 위에 붙는가** — 각 카드의 영어 원문 박스 바로 위에 `What's said in the video (English)`가 보이는지. 아포스트로피가 `&apos;` 같은 엔티티 글자로 노출되지 않아야 한다
- [x] **캡션 스타일 다이얼로그 안내의 마지막 문장이 바뀌었는가** — 검토 화면 한 클립의 `Caption style` 다이얼로그에서 미리보기 밑 안내가 `… Korean clips are translated at render time — the words shown here are what's said in the video, in English.`로 끝나는지. 설정 화면(FEAT-42)의 샘플 안내 `This is a sample. …`는 그대로여야 한다  
  → **대체(FEAT-52)**: 이 줄의 대상인 **검토 화면 `Caption style` 다이얼로그가 FEAT-52로 삭제됐다.** `CaptionStyleEditor`의 소비자를 전수 열거하면 이제 `pages/settings/ui/index.tsx:260` **하나뿐**이고 `sample`(항상 true)·`playUrl={null}`을 고정 전달한다(2026-09-21 메인 루프 직접 grep). 즉 **실영상 미리보기 경로 전체가 도달 불가**이며 이 확인은 어떤 화면에서도 판정할 수 없다. 관측 없이 소멸했다 — 확인했다는 뜻이 아니다.
  - FEAT-49가 이 문장을 바꾼다(Korean은 샘플 안내, English는 프레임 안내만). FEAT-49 배포 전까지는 이 줄이 유효하고, 배포 뒤 확인하지 못했으면 `대체(FEAT-49)`로 닫는다 — 새 문장 확인은 FEAT-49 절 셋째 줄

---

## FEAT-42 — 캡션 스타일 기본값 앞 절반: 설정 캡션 섹션·업로드 스냅샷·드래프트 시드·auto 요청 페이로드 (web, 구현 2026-09-15)

원천: `docs/agents/web-dev/FEAT-42.md`의 「테스트로 못 덮은 범위」. **배포됨 — 2026-09-15 14:53 KST**, PR #119 `main` 합류(`5567b2f`) → Vercel `Production – apc-h` success. 백엔드 선행 FEAT-41은 먼저 배포됨(2026-09-15 00:00 KST).
게이트는 `npm run check -w apps/web` EXIT 0 · `npm test -w apps/web` **154/154**(인수 시 메인 루프 재실행, 145→154 — 신규 `caption-style-request.test.mjs` 3·`sample-captions.test.mjs` 6). auto 렌더가 요청 스냅샷으로 나오는지와 render에서 스타일 없는 클립이 언어 기본값인지는 아래 FEAT-41 절 「(FEAT-42 배포 후)」 두 줄이 맡고, 이 절은 설정 화면·스냅샷·검토 시드를 맡는다.
**`〔auto〕` 태그를 붙이지 않는다**: 로그인 뒤 화면과 실제 업로드·Modal 처리에서만 판정된다.

- [ ] **설정 화면에 캡션 기본 스타일 카드가 보이고 샘플 미리보기가 첫 페인트부터 그려지는가** — `/dashboard/settings`의 「Upload defaults」 아래 「Default caption style」 카드에 프리셋·위치·크기·색·외곽선·줄당 단어·Uppercase 컨트롤, 9:16 미리보기에 샘플 첫 줄(English `Style your captions the way`), 밑 안내 `This is a sample. …`, `Save caption style`·`Reset to language default`가 보이는지. 컨트롤을 바꾸면 미리보기의 크기·색·위치·줄당 단어·대문자가 즉시 바뀌는지
- [ ] **페이지 언어를 Korean으로 바꾸면 미리보기가 함께 바뀌는가** — `Subtitle language`를 `한국어`로 고르면(저장 전에도) 미리보기 문장이 `지금 자막 스타일을`, 폰트가 Noto Sans KR, 크기 표시가 130으로 바뀌는지
- [x] **저장한 캡션 기본값이 새 업로드의 검토 드래프트에 시드되는가** — 캡션 스타일 저장(토스트 `Caption style saved`) → `Review first`로 새 업로드 → 검토 화면 한 클립의 `Caption style` 다이얼로그가 저장한 스타일(해당 프리셋 칩 활성 포함)로 열리는지. 저장 전에 올린 업로드는 그대로여야 한다(업로드 시점 스냅샷)  
  → **대체(FEAT-52·FEAT-53)**: 클립별 캡션 스타일 자체가 사라졌다 — FEAT-52가 검토 화면 편집을 없애고 FEAT-53이 `ClipDraft.captionStyle` 컬럼을 drop했다(2026-09-19 적용, 6행 소멸). 「검토 드래프트에 시드된다」는 동작이 존재하지 않으므로 판정 대상이 없다. 기본값이 렌더까지 닿는지는 업로드 시점 스냅샷(`UploadedFile.captionStyle`) 경로로 바뀌었고 FEAT-52·FEAT-55 절이 그것을 확인한다.
- [x] **캡션 기본값을 초기화한 뒤의 새 업로드는 언어 기본값인가** — `Reset to language default` 뒤 새 업로드의 검토 다이얼로그가 언어 기본값(프리셋 칩 없음)으로 열리는지  
  → **대체(FEAT-52·FEAT-53)**: 클립별 캡션 스타일 자체가 사라졌다 — FEAT-52가 검토 화면 편집을 없애고 FEAT-53이 `ClipDraft.captionStyle` 컬럼을 drop했다(2026-09-19 적용, 6행 소멸). 「검토 드래프트에 시드된다」는 동작이 존재하지 않으므로 판정 대상이 없다. 기본값이 렌더까지 닿는지는 업로드 시점 스냅샷(`UploadedFile.captionStyle`) 경로로 바뀌었고 FEAT-52·FEAT-55 절이 그것을 확인한다.
- [x] **검토 화면 캡션 다이얼로그가 영상 로딩 중에도 기존 그대로인가** — 원본 영상 URL이 준비되기 전에 다이얼로그를 열어도 안내가 `Live preview on your video …`이고 `This is a sample.`이 보이지 않는지(샘플 모드는 설정 화면만)  
  → **대체(FEAT-52)**: 이 줄의 대상인 **검토 화면 `Caption style` 다이얼로그가 FEAT-52로 삭제됐다.** `CaptionStyleEditor`의 소비자를 전수 열거하면 이제 `pages/settings/ui/index.tsx:260` **하나뿐**이고 `sample`(항상 true)·`playUrl={null}`을 고정 전달한다(2026-09-21 메인 루프 직접 grep). 즉 **실영상 미리보기 경로 전체가 도달 불가**이며 이 확인은 어떤 화면에서도 판정할 수 없다. 관측 없이 소멸했다 — 확인했다는 뜻이 아니다.
- [ ] **캡션 기본값 저장이 계측에 `preset`과 함께 기록되는가** — admin 분석에 `settings_defaults_saved` 행이 `source: "settings_page"`와 `preset`(프리셋 id·`custom`·`default`)을 담아 생기는지

---

## FEAT-39 — 설정 화면 + 업로드 기본값(언어·클립 수·생성 모드) (web, 구현 2026-09-14)

원천: `docs/agents/web-dev/FEAT-39.md`의 「테스트로 못 덮은 범위」. **배포됨 — 2026-09-15 00:05 KST**, PR #118 `main` 합류(`cd01537`) → Vercel `Production – apc-h` success.
게이트는 `npm run check -w apps/web` EXIT 0 · `npm test -w apps/web` **145/145**(인수 시 메인 루프 재실행, 131→145 — 신규 `upload-defaults.test.mjs` 14). 컬럼이 실제로 읽히고 쓰이는지와 이벤트 두 개의 기록은 아래 FEAT-38 절 「(FEAT-39 배포 후)」 줄이 맡고, 이 절은 화면 흐름을 맡는다.
**`〔auto〕` 태그를 붙이지 않는다**: 로그인 뒤 화면에서만 판정되고, 미인증 리다이렉트 줄도 release-verify 루틴이 admin 호스트만 조회해(`scripts/release-verify/run.mjs` `ADMIN_BASE_URL` 기본값 `https://admin.a-pch.com`) web 라우트를 판정하지 못한다.

- [ ] **헤더 메뉴에서 설정 화면으로 가고, 화면이 열리는가** — 대시보드 우상단 메뉴에 `Settings`가 `Billing` 위에 있고, 누르면 `/dashboard/settings`에 「Upload defaults」 카드·드롭다운 셋(`Subtitle language`·`Number of clips`·`Generation`)·`Save defaults`·`Reset to system defaults`가 보이는지. 기본값을 저장한 적 없는 계정은 `English`·`3 clips`·`Auto`로 시작해야 한다
- [ ] **저장한 기본값이 업로드 폼의 초기값이 되는가** — 설정에서 예컨대 `Korean`·`2 clips`·`Review first`로 저장 → 토스트 `Defaults saved` → 새로고침해도 설정 화면이 그 값 → 대시보드에서 파일을 고르면 옵션 행이 그 값으로 시작하는지. 폼에서 이번 업로드만 바꿔도 설정 화면 값은 그대로여야 한다
- [ ] **초기화가 시스템 기본으로 되돌리는가** — `Reset to system defaults` 뒤 설정 화면과 업로드 폼이 `English`·`3 clips`·`Auto`로 돌아가는지
- [ ] **클립 수 기본값이 짧은 영상에서 기존대로 내려가는가** — 기본값을 `4 clips`로 저장하고 60초 영상을 고르면 `2 clips`로 하향되는지(`getMaxFeasibleClipCount`의 `floor(D/30)` 클램프가 사용자 기본값 초기값에도 적용)
- [x] **로그아웃 상태로 `/dashboard/settings`를 열면 로그인으로 가는가** — 미인증 접근이 `/login`으로 리다이렉트되는지(`middleware.ts` matcher `/dashboard/:path*` · 대시보드 레이아웃 가드 · 라우트의 `auth()`) — 확인(2026-09-15, 실측 — 배포 뒤 쿠키 없이 `curl https://a-pch.com/dashboard/settings` → **307** `https://a-pch.com/login?callbackUrl=https%3A%2F%2Fa-pch.com%2Fdashboard%2Fsettings`. 단서: matcher가 FEAT-39 이전부터 이 경로를 덮어 **보호 동작의 증거이지 새 라우트 반영의 증거는 아니다** — 반영은 Production 배포 sha `cd01537`로 판정)

---

## FEAT-38 — 사용자 기본값 스키마 · analytics 이벤트 2개 (db+web 계약, 구현·마이그레이션 2026-09-14)

원천: 계획서 `docs/plans/FEAT-38.md` 「못 덮는 범위」. **마이그레이션은 적용됨** — 소유자 지시("마이그레이션하자")로 메인 루프가 `packages/db`에서 `node --env-file=../../.env ../../node_modules/prisma/build/index.js migrate deploy` 실행. **코드(재생성한 Prisma 클라이언트·analytics 계약)도 배포됨 — 2026-09-15 00:05 KST**, PR #118 `main` 합류(`cd01537`) → Vercel `Production – apc-h`·`Production – apch-admin` 둘 다 success.
게이트는 `npm run check --workspaces --if-present` EXIT 0 · web test **131/131** · admin test **334/334**(인수 시 재실행). 이 항목은 저장소와 계약만 만들고 소비자는 FEAT-39·FEAT-42다.
**`〔auto〕` 태그를 붙이지 않는다**: DB 실측과 로그인 뒤 화면으로만 판정된다.

- [x] **마이그레이션이 프로덕션 Neon에 적용됐는가** — 확인(2026-09-14, 실측 — `migrate deploy` "All migrations have been successfully applied." · 이어서 `migrate status` "Database schema is up to date!" · `db pull --print` 인트로스펙션으로 `User.defaultLanguage String?`·`defaultClipCount Int?`·`defaultReviewBeforeGenerate Boolean?`·`defaultCaptionStyle Json?`·`UploadedFile.captionStyle Json?` 존재)
- [ ] **(web 배포 후) 새 Prisma 클라이언트로 기존 화면이 그대로인가** — 대시보드·업로드·업로드 상세·결제·검토 화면이 오류 없이 열리는지. 컬럼이 클라이언트보다 먼저 DB에 들어갔으므로 `User`·`UploadedFile` 조회가 깨지면 안 된다
- [ ] **(FEAT-39 배포 후) 새 컬럼이 실제로 읽히고 쓰이며 이벤트 두 개가 기록되는가** — 설정 화면 저장이 `User` 기본값 컬럼에 반영되고, admin 분석에 `settings_viewed`·`settings_defaults_saved` 행이 생기는지. FEAT-39가 첫 소비자라 그 절에서 함께 닫힌다

---
## FEAT-40 — 캡션 편집기를 features/caption-style 슬라이스로 이동 (web, 구현 2026-09-14)

원천: `docs/agents/web-dev/FEAT-40.md`의 「테스트로 못 덮은 범위」. **배포됨 — 2026-09-15 00:05 KST**, PR #118 `main` 합류(`cd01537`) → Vercel `Production – apc-h` success.
게이트는 `npm run check -w apps/web` EXIT 0 · `npm test -w apps/web` **131/131**(인수 시 메인 루프 재실행) · 옮긴 테스트 둘과 `caption-presets.ts`의 blob id가 이동 전과 동일(rename 100%). 파일 위치만 옮긴 리팩터링이라 사용자 화면은 바뀌지 않아야 한다.
**`〔auto〕` 태그를 붙이지 않는다**: 로그인 뒤 검토 화면에서만 판정된다.

- [x] **검토 화면의 캡션 스타일 다이얼로그가 이전과 똑같이 동작하는가** — `review_pending` 업로드에서 클립 카드의 캡션 스타일을 열면 프리셋 칩·크기/색/위치 조절·영상 위 자막 미리보기가 이전처럼 보이고, Apply·Apply to all이 저장되며, 저장 뒤에도 선택한 프리셋 칩이 켜져 있는지(`matchPresetId`가 새 슬라이스 barrel로 옮겨진 경로다). 달라진 게 보이면 결함이다  
  → **대체(FEAT-52)**: 이 줄의 대상인 **검토 화면 `Caption style` 다이얼로그가 FEAT-52로 삭제됐다.** `CaptionStyleEditor`의 소비자를 전수 열거하면 이제 `pages/settings/ui/index.tsx:260` **하나뿐**이고 `sample`(항상 true)·`playUrl={null}`을 고정 전달한다(2026-09-21 메인 루프 직접 grep). 즉 **실영상 미리보기 경로 전체가 도달 불가**이며 이 확인은 어떤 화면에서도 판정할 수 없다. 관측 없이 소멸했다 — 확인했다는 뜻이 아니다.

---
## FEAT-41 — 요청 단위 caption_style 폴백, auto 전용 (backend, 구현 2026-09-14)

원천: `docs/agents/backend-dev/FEAT-41.md`의 「테스트로 못 덮은 범위」. **배포됨 — 2026-09-15 00:00 KST**, 소유자 지시("배포 수행")로 메인 루프가 실행(`PYTHONUTF8=1 …\apch-backend\Scripts\python.exe -m modal deploy main.py`, 6.7초, EXIT 0, 마운트에 `PythonPackage:caption_style_source` 포함, 엔드포인트 URL 불변). 배포 직전 unittest **79 OK** · `py_compile` 0 재실행.
게이트는 unittest **79/0**(+12) · `py_compile` 0(인수 시 메인 루프 재실행). 인수 때 신규 모듈이 계획 스케치와 바이트 동일함과, 실제 테스트 파일에 돌연변이 10종을 심어 전부 실패함을 확인했다.
**이 항목만으로는 사용자 체감 변화가 없다** — 웹이 요청 단위 스타일을 보내기 시작하는 것은 FEAT-42라, 둘째·셋째 줄은 FEAT-42 배포 뒤에만 닫힌다. FEAT-42는 2026-09-15 14:53 KST에 배포됐다(PR #119, `5567b2f`). 이제 둘째·셋째 줄을 닫을 수 있다.
**`〔auto〕` 태그를 붙이지 않는다**: 로그인 뒤 생성 결과 영상과 Modal 실행에서만 판정된다.

- [ ] **배포된 컨테이너가 `caption_style_source`를 import하고 기존 렌더가 그대로인가** — 배포 직후 `process_video`에 잘못된 토큰으로 POST → 401(FEAT-43 원장 첫 줄과 같은 확인) + 배포 뒤 첫 실제 처리(auto·render 아무거나)의 캡션이 이전과 같은지. 웹이 아직 요청 필드를 보내지 않으므로 달라지면 결함이다
  - import 절반 확인(2026-09-15, 실측 — 배포 출력 마운트에 `PythonPackage:caption_style_source` · 잘못된 토큰으로 `process_video`에 유효한 형태의 바디 POST(00:02:04) → **401** `Incorrect bearer token` · `modal container list` 활성 컨테이너 1, 시작 00:01로 배포 이후). 남은 것: 배포 뒤 첫 실제 처리의 캡션이 이전과 같은지
  - 전제 변경(2026-09-15, FEAT-42 배포)
    - 이제 캡션 기본값을 저장한 계정은 auto 요청에 `caption_style`이 실린다(`apps/web/src/inngest/caption-style-request.ts` `autoRequestCaptionStyle`).
    - 그 계정의 분석 드래프트도 업로드 스냅샷으로 시드된다.
    - 그래서 "캡션 불변" 판정은 **캡션 기본값을 저장하지 않은 계정**의 처리로만 한다. 저장한 계정의 캡션이 달라지는 것은 결함이 아니라 아래 둘째 줄에서 볼 대상이다.
- [ ] **(FEAT-42 배포 후) auto 생성 클립이 요청 단위 스냅샷 스타일로 렌더되는가** — 설정한 기본 캡션(색·크기·위치)이 검토 없이 생성한 클립에 그대로 적용되는지
- [x] **(FEAT-42 배포 후) render에서 스타일 없는 클립은 언어 기본값으로 렌더되는가** — 검토 화면에서 커스텀 클립을 추가하거나 한 클립을 「Reset style」로 되돌린 뒤 생성하면, 그 클립이 미리보기대로 언어 기본값인지. 요청 스냅샷 스타일이 새어 나오면 소유자 결정(2026-09-14, render는 클립 스타일만) 위반이다  
  → **대체(FEAT-52·FEAT-55)**: 「Reset style」 버튼과 클립별 스타일이 FEAT-52로 삭제됐고 FEAT-55가 `moment_style` 경로까지 제거했다. 「render에서 스타일 없는 클립」이라는 상태가 더는 만들어지지 않는다 — 스타일 소스는 업로드 시점 스냅샷 하나뿐이고, 그것이 없으면 언어 기본값이라는 사실은 FEAT-55 절의 「실렌더 회귀 0」이 판정한다.

---
## BUG-09 — 고객 포털 실패를 Sentry 보고 + 결제 페이지 안내로 (web, 구현 2026-09-14)

원천: `docs/agents/web-dev/BUG-09.md`의 「테스트로 못 덮은 범위」 1~3. **배포됨 — 2026-09-15 00:05 KST**, PR #118 `main` 합류(`cd01537`) → Vercel `Production – apc-h` success.
게이트는 `npm run check -w apps/web` EXIT 0 · `npm test -w apps/web` **131/0**(인수 시 메인 루프 재실행). **이 항목은 500의 원인을 고치지 않는다** —
원인은 계획서 「소유자 확인 항목」(Vercel `POLAR_SERVER`·`POLAR_ACCESS_TOKEN` 환경 정합 / Polar에 `polarCustomerId` 존재 여부)이 가른다. 그래서 셋째 줄은 원인 수정 뒤에만 닫힌다.
**`〔auto〕` 태그를 붙이지 않는다**: 로그인한 유료 계정의 화면과 Sentry 콘솔에서만 판정된다.
원장 C-49(미로그인 → `/login`, 미고객 → `/dashboard/billing`)는 이 구현이 두 가드를 그대로 두므로 계속 유효하며 열린 채 둔다.

- [ ] **포털 실패가 이제 진단 정보와 함께 Sentry에 도달하는가** — 배포 후 「Manage Subscription」을 한 번 누르면(원인이 그대로라면 실패한다) Sentry에 태그 `origin: portal.customerSession` 이벤트가 컨텍스트 `server`(`sandbox`|`production`)·`customerId`·`userId`와 함께 남는지. **그 이벤트의 예외 메시지가 후보 (a) 인증 계열(401/403)인지 (b) not-found 계열(404)인지를 가른다** — 계획서 소유자 확인 항목 1을 대신한다. 마감 증거는 `확인(날짜, Sentry 이벤트 관측)`
- [ ] **실패 시 본문 없는 500 대신 결제 페이지로 돌아와 안내를 보는가** — `/dashboard/billing?portal=error`로 돌아와 토스트 `Couldn't open the subscription portal. Please try again in a moment.`이 한 번 뜨고, 주소창의 `?portal=error`가 사라지며, 새로고침해도 토스트가 다시 뜨지 않는지
- [ ] **원인을 바로잡은 뒤 포털이 실제로 열리는가** — 위 이벤트로 (a)/(b)를 판정해 소유자가 Vercel 환경변수 또는 Polar 고객 데이터를 고친 뒤, 「Manage Subscription」이 Polar 고객 포털로 이동하는지. 원장 C-02(이관 BUG-09)의 원래 기대("프로덕션 Polar 포털을 연다")가 여기서 닫힌다

---
## FEAT-43 — 클립 후보 hook·payoff를 업로드 언어로 생성 (backend, 구현 2026-09-14)

원천: `docs/agents/backend-dev/FEAT-43.md`의 「못 덮은 범위」 (a)(b)(d). **배포됨 — 2026-09-14 08:06 KST**, 소유자 승인으로 메인 루프가 실행(`PYTHONUTF8=1 …\apch-backend\Scripts\python.exe -m modal deploy main.py`, 5.9초, EXIT 0).
게이트는 unittest **67/0**(+12)·`py_compile` 0으로 닫혔고, English 프롬프트 바이트 불변은 인수 시 `HEAD` 원본 리터럴과 직접 대조해 재확인했다
(모듈 상수·테스트 frozen 사본 모두 2601자 일치). 아래는 Gemini 실출력과 Modal 컨테이너가 필요해 러너가 못 덮는 것들이다.
**`〔auto〕` 태그를 붙이지 않는다**: 로그인 뒤 검토 화면과 Modal 실행 결과에서만 판정된다.

- [x] **배포된 컨테이너가 `moment_prompt`를 import하는가** — 확인(2026-09-14, 실측 — 배포 출력의 마운트에 `PythonPackage:moment_prompt` 포함 · 배포 직후 `process_video`에 잘못된 토큰으로 POST → **401**(모듈 import 실패였다면 컨테이너 기동 실패) · 응답 시점 활성 컨테이너는 하나이고 시작 08:06으로 배포 이후). 관측한 것은 GPU 없는 디스패처 컨테이너다. GPU 워커(`AiPodcastClipper`)도 같은 이미지에서 같은 `main.py`를 모듈 수준에서 import하므로 같은 결과로 판정했다 — 워커 기동 자체는 아래 둘째 줄의 첫 실제 처리에서 함께 관측된다
- [ ] **Korean 업로드의 검토 카드 hook·payoff가 한국어로 나오는가** — `review_pending` 검토 화면 카드의 굵은 제목(hook)과 설명(payoff)이 자연스러운 한국어인지, 종류 라벨은 그대로 `Q&A`/`Insight`인지(`type`이 번역되지 않았는지). 전사 본문과 헤더 안내·카드 라벨(FEAT-45 이후 `What's said in the video (English)`)은 영어 그대로가 정상이다. **새로 분석한 업로드만 해당** — 기분석 업로드는 영어로 남는다(백필 없음)
- [ ] **같은 영상을 English·Korean으로 분석했을 때 고른 구간이 크게 다르지 않은가** — 시작·끝이 대체로 겹치는지. English 프롬프트는 바이트 동일이라 English 쪽 차이는 Gemini 비결정성 범위여야 하고, Korean 쪽은 지시문 추가가 구간 선택을 흔들지 않았는지를 본다

---
## FEAT-37 — 한국어 검토 화면의 「자막은 렌더 때 번역된다」 안내 (web, 구현 2026-09-09)

원천: `docs/agents/web-dev/FEAT-37.md`의 「못 덮은 범위」와 계획서 「테스트」. **배포됨** — PR #116 `main` 합류(2026-09-09)로 Vercel 프로덕션 반영. (원장 표기는 2026-09-15에 갱신 — 구현 커밋이 `origin/main` 첫 부모 경로의 그 머지에 처음 포함됨을 `git merge-base --is-ancestor`로 대조)
게이트는 `npm run check` EXIT 0 · `npm test` **130/0**(+7)으로 닫혔고, 문구·표시 조건은 순수 모듈 테스트 7건이 지킨다
(인수 시 출하 테스트에 변이 10종을 심어 **10/10 사멸**). 마크업 계약(Korean에서 헤더 안내·카드 라벨 존재, English/null에서 부재, 골든 문구)은
계획 검증에서 `renderToStaticMarkup` 3분기로 닫혔다. 아래는 **실제 페이지 흐름·시각 배치**라 러너가 못 덮는 것들이다.
**`〔auto〕` 태그를 붙이지 않는다**: 로그인 뒤 `review_pending` 업로드의 검토 화면에서만 보인다.

- [x] **Korean 업로드의 검토 화면 헤더에 안내가 실제로 보이는가** — 대체(FEAT-45, 2026-09-15 — 안내 문구가 `… This review shows what's said in the video, in English.`로 바뀌어 아래 옛 골든 문구의 관측이 무의미해졌다. 새 문구 기준 확인은 FEAT-45 절 첫째 줄) — 「N moments suggested … credits」 문단 바로 아래 `bg-muted` 박스로 `Subtitles will be translated to Korean when you generate. This review shows the English transcript.` 이 뜨는지. `language` 프롭이 page→section으로 실제 흘러가는 런타임 값의 확인이기도 하다. 프로덕션 업로드 `cmtsreci00001l104g6imnufl`(Korean, review_pending)이 그대로 확인 대상이다. 마감 증거는 `확인(날짜, 화면 관측)`
- [x] **카드마다 「English transcript」 라벨이 본문 위에 붙는가** — 대체(FEAT-45, 2026-09-15 — 라벨이 `What's said in the video (English)`로 바뀌었다. 새 라벨 기준 확인은 FEAT-45 절 둘째 줄) — 7장 전부, 본문 박스 스타일은 종전과 같고 `mt-2` 간격만 바깥 div로 옮겨진 상태
- [ ] **English 업로드에선 둘 다 안 보이는가** — 회귀 확인. 영어 업로드 검토 화면에 안내 박스도 라벨도 없어야 한다

---
## BUG-13 — 캡션 미리보기 크롭을 백엔드 resize 모드(블러 레터박스)로 (web, 구현 2026-09-08)

원천: `docs/agents/web-dev/BUG-13.md`의 「못 덮은 범위」와 계획서 「테스트」. **배포됨** — PR #115 `main` 합류(2026-09-08)로 Vercel 프로덕션 반영. (원장 표기는 2026-09-15에 갱신 — 구현 커밋이 `origin/main` 첫 부모 경로의 그 머지에 처음 포함됨을 `git merge-base --is-ancestor`로 대조)
게이트는 `npm run check` EXIT 0 · `npm test` **123/0**(새 테스트 0 — 순수 함수 무변경, 기존 `caption-preview.test.mjs` 19 it이 회귀 가드)로 닫혔다.
**마크업 계약은 이미 닫혔다** — `<video>` 두 장·배경 `aria-hidden`+`scale-110 object-cover blur-lg`·전경 `object-contain`·자막 오버레이가
두 video 뒤(DOM 순서=페인트 순서)·`playUrl=null` 시 `<video>` 0장은 계획 검증에서 `renderToStaticMarkup`으로 12/12 확인했고,
구현본이 그 검증 복제본과 해시까지 동일하다. 아래는 **브라우저 재생·시각 대조**가 필요해 Node 러너가 원리상 못 덮는 것들이다.
**`〔auto〕` 태그를 붙이지 않는다**: 전부 로그인 뒤 검토 화면의 「Caption style」 다이얼로그에서만 열리고 판정이 시각 대조다.

- [x] **원본 좌우가 더 이상 잘리지 않는가** — 이 항목의 존재 이유다. 두 화자가 좌우에 앉은 클립에서 「Caption style」을 열면 **두 사람이 다 보이는지**(전경 `object-contain`, 상하 레터박스). 옛 구현은 가운데 31.6%만 보여 가장자리 화자가 잘렸다. 마감 증거는 `확인(날짜, 화면 관측)`  
  → **대체(FEAT-52)**: 이 줄의 대상인 **검토 화면 `Caption style` 다이얼로그가 FEAT-52로 삭제됐다.** `CaptionStyleEditor`의 소비자를 전수 열거하면 이제 `pages/settings/ui/index.tsx:260` **하나뿐**이고 `sample`(항상 true)·`playUrl={null}`을 고정 전달한다(2026-09-21 메인 루프 직접 grep). 즉 **실영상 미리보기 경로 전체가 도달 불가**이며 이 확인은 어떤 화면에서도 판정할 수 없다. 관측 없이 소멸했다 — 확인했다는 뜻이 아니다.
- [x] **상하 레터박스가 블러 배경으로 채워지는가** — 검은 띠가 아니라 같은 영상의 블러가 위아래를 채우고, 프레임 가장자리에 **검은 테두리(blur 페이드 링)가 비치지 않는지**(`scale-110`이 밀어내는 것). 비치면 배율 조정 대상  
  → **대체(FEAT-52)**: 이 줄의 대상인 **검토 화면 `Caption style` 다이얼로그가 FEAT-52로 삭제됐다.** `CaptionStyleEditor`의 소비자를 전수 열거하면 이제 `pages/settings/ui/index.tsx:260` **하나뿐**이고 `sample`(항상 true)·`playUrl={null}`을 고정 전달한다(2026-09-21 메인 루프 직접 grep). 즉 **실영상 미리보기 경로 전체가 도달 불가**이며 이 확인은 어떤 화면에서도 판정할 수 없다. 관측 없이 소멸했다 — 확인했다는 뜻이 아니다.
- [x] **자막 위치·크기가 종전과 동일한가** — 배경 교체가 자막 자리를 흔들지 않았는지. 자막은 9:16 캔버스 기준이라 같아야 한다. FEAT-36 절의 폰트 환산 확인과 같은 화면에서 함께 본다  
  → **대체(FEAT-52)**: 이 줄의 대상인 **검토 화면 `Caption style` 다이얼로그가 FEAT-52로 삭제됐다.** `CaptionStyleEditor`의 소비자를 전수 열거하면 이제 `pages/settings/ui/index.tsx:260` **하나뿐**이고 `sample`(항상 true)·`playUrl={null}`을 고정 전달한다(2026-09-21 메인 루프 직접 grep). 즉 **실영상 미리보기 경로 전체가 도달 불가**이며 이 확인은 어떤 화면에서도 판정할 수 없다. 관측 없이 소멸했다 — 확인했다는 뜻이 아니다.
- [x] **전경·배경이 눈에 띄게 어긋나지 않는가** — 배경은 루프 경계에서만 재정렬된다(계획서가 택한 동기 방식). 블러라 프레임 정합이 안 보여야 정상이고, 배경이 늦게 로드된 첫 루프에서 어긋남이 **거슬리는지**가 판정 기준  
  → **대체(FEAT-52)**: 이 줄의 대상인 **검토 화면 `Caption style` 다이얼로그가 FEAT-52로 삭제됐다.** `CaptionStyleEditor`의 소비자를 전수 열거하면 이제 `pages/settings/ui/index.tsx:260` **하나뿐**이고 `sample`(항상 true)·`playUrl={null}`을 고정 전달한다(2026-09-21 메인 루프 직접 grep). 즉 **실영상 미리보기 경로 전체가 도달 불가**이며 이 확인은 어떤 화면에서도 판정할 수 없다. 관측 없이 소멸했다 — 확인했다는 뜻이 아니다.
- [x] **`playUrl` 로딩/실패 시** — presign이 안 왔거나 실패하면 검은 9:16 상자 + 하단 안내만 남고 깨진 `<video>` 아이콘이 없는지  
  → **대체(FEAT-52)**: 이 줄의 대상인 **검토 화면 `Caption style` 다이얼로그가 FEAT-52로 삭제됐다.** `CaptionStyleEditor`의 소비자를 전수 열거하면 이제 `pages/settings/ui/index.tsx:260` **하나뿐**이고 `sample`(항상 true)·`playUrl={null}`을 고정 전달한다(2026-09-21 메인 루프 직접 grep). 즉 **실영상 미리보기 경로 전체가 도달 불가**이며 이 확인은 어떤 화면에서도 판정할 수 없다. 관측 없이 소멸했다 — 확인했다는 뜻이 아니다.

---
## FEAT-36 — 캡션 스타일 실영상 오버레이 미리보기 (web, 구현 2026-09-08)

원천: `docs/agents/web-dev/FEAT-36.md`의 「못 덮은 범위」와 계획서 「테스트」. **배포됨** — PR #114 `main` 합류(2026-09-08)로 Vercel 프로덕션 반영. (원장 표기는 2026-09-15에 갱신 — 구현 커밋이 `origin/main` 첫 부모 경로의 그 머지에 처음 포함됨을 `git merge-base --is-ancestor`로 대조)
게이트는 `npm run check` EXIT 0 · `npm test` **107/0**(+19)로 닫혔고, 큐 묶기·범위 필터·px 환산은
순수 모듈 테스트 19건이 지킨다(백엔드 묶기 함수와의 차등 비교 300건도 계획 검증에서 통과).
아래는 **브라우저 재생·시각 대조**가 필요해 Node 러너가 원리상 못 덮는 것들이다.
**`〔auto〕` 태그를 붙이지 않는다**: 미리보기는 로그인 뒤 검토 화면(`processing` 업로드)에서만 열리고
판정이 전부 시각 대조라, 공개 프로덕션 응답 본문으로 닫을 수 있는 줄이 하나도 없다.

**크레딧 없이 확인하는 법**: 이미 생성된 클립이 있으면 그 클립의 캡션과, 같은 업로드의 검토 화면에서
**스타일을 바꾸지 않은 채로** 연 미리보기를 나란히 놓고 비교한다 — 기본 스타일끼리의 대조라 새로
생성할 필요가 없다. 아래 셋째·넷째가 이 방법으로 닫힌다.

- [x] **미리보기가 실제로 재생되는지** — 검토 화면 카드의 「Caption style」을 열면 9:16 상자에 원본 영상이 흐르고, 클립 끝에서 시작으로 되돌아가 반복되는지. 마감 증거는 `확인(날짜, 화면 관측)`  
  → **대체(FEAT-52)**: 이 줄의 대상인 **검토 화면 `Caption style` 다이얼로그가 FEAT-52로 삭제됐다.** `CaptionStyleEditor`의 소비자를 전수 열거하면 이제 `pages/settings/ui/index.tsx:260` **하나뿐**이고 `sample`(항상 true)·`playUrl={null}`을 고정 전달한다(2026-09-21 메인 루프 직접 grep). 즉 **실영상 미리보기 경로 전체가 도달 불가**이며 이 확인은 어떤 화면에서도 판정할 수 없다. 관측 없이 소멸했다 — 확인했다는 뜻이 아니다.
- [x] **자막 큐가 타이밍에 맞게 전환되는지** — 말과 자막이 맞물리고, 큐 사이 공백에서 자막이 사라지는지. `timeupdate` 주기(~250ms)만큼의 지연은 정상이다(계획서가 선언한 한계)  
  → **대체(FEAT-52)**: 이 줄의 대상인 **검토 화면 `Caption style` 다이얼로그가 FEAT-52로 삭제됐다.** `CaptionStyleEditor`의 소비자를 전수 열거하면 이제 `pages/settings/ui/index.tsx:260` **하나뿐**이고 `sample`(항상 true)·`playUrl={null}`을 고정 전달한다(2026-09-21 메인 루프 직접 grep). 즉 **실영상 미리보기 경로 전체가 도달 불가**이며 이 확인은 어떤 화면에서도 판정할 수 없다. 관측 없이 소멸했다 — 확인했다는 뜻이 아니다.
- [ ] **폰트 크기 환산이 실렌더와 맞는지 — 영어(Anton)** — 이 항목의 핵심 미확인 값. 미리보기 글자 크기 = ASS 122 × (2048/3550) × (320/1920) ≈ 11.7px가 실제 클립의 글자 크기와 **같은 비율**로 보이는지. 어긋나면 `CAPTION_RENDER.EM_SCALE.English` 분모가 틀린 것이다(libass가 OS/2 win 메트릭을 쓴다는 판정이 근거 — 소스로 확인했으나 실렌더로는 미확인) **[재앵커 2026-09-21]** 검토 화면 다이얼로그가 FEAT-52로 사라져 **설정 화면(`/dashboard/settings`) 캡션 섹션의 정지 샘플**에서 판정한다 — 이제 `CaptionStyleEditor`의 유일한 소비자다. 실영상 위 대조는 불가능하므로 **생성된 클립과 나란히 놓고 본다.**
- [ ] **폰트 크기 환산이 실렌더와 맞는지 — 한국어(Noto Sans KR)** — 같은 대조를 한국어 클립으로. 분모 1448은 hhea와 win이 일치해 위험이 낮지만, 두 폰트가 서로 다른 경로로 확정됐으므로 각각 봐야 한다 **[재앵커 2026-09-21]** 검토 화면 다이얼로그가 FEAT-52로 사라져 **설정 화면(`/dashboard/settings`) 캡션 섹션의 정지 샘플**에서 판정한다 — 이제 `CaptionStyleEditor`의 유일한 소비자다. 실영상 위 대조는 불가능하므로 **생성된 클립과 나란히 놓고 본다.**
- [ ] **폰트가 실제로 적용되는지** — 미리보기 자막이 시스템 기본 산세리프가 아니라 Anton(영어)·Noto Sans KR(한국어)로 그려지는지. `next/font`가 `--font-anton`·`--font-noto-sans-kr`를 방출하지 못하면 조용히 폴백한다 **[재앵커 2026-09-21]** 검토 화면 다이얼로그가 FEAT-52로 사라져 **설정 화면(`/dashboard/settings`) 캡션 섹션의 정지 샘플**에서 판정한다 — 이제 `CaptionStyleEditor`의 유일한 소비자다. 실영상 위 대조는 불가능하므로 **생성된 클립과 나란히 놓고 본다.**
- [ ] **위치(top/middle/bottom)가 실렌더와 맞는지** — 세 위치를 눌러 미리보기 자막이 실제 클립의 세로 위치와 같은 자리로 가는지. marginv 200/260을 1/6로 환산한 값이다 **[재앵커 2026-09-21]** 검토 화면 다이얼로그가 FEAT-52로 사라져 **설정 화면(`/dashboard/settings`) 캡션 섹션의 정지 샘플**에서 판정한다 — 이제 `CaptionStyleEditor`의 유일한 소비자다. 실영상 위 대조는 불가능하므로 **생성된 클립과 나란히 놓고 본다.**
- [x] **스타일을 바꿔도 재생이 처음으로 튀지 않는지** — 줄당 단어·대문자를 바꿀 때 재생 위치가 유지되는지. 계획 검증 라운드 1이 잡은 결함(`cues`를 이펙트 의존성에 두면 매번 리셋)의 회귀 확인이다  
  → **대체(FEAT-52)**: 이 줄의 대상인 **검토 화면 `Caption style` 다이얼로그가 FEAT-52로 삭제됐다.** `CaptionStyleEditor`의 소비자를 전수 열거하면 이제 `pages/settings/ui/index.tsx:260` **하나뿐**이고 `sample`(항상 true)·`playUrl={null}`을 고정 전달한다(2026-09-21 메인 루프 직접 grep). 즉 **실영상 미리보기 경로 전체가 도달 불가**이며 이 확인은 어떤 화면에서도 판정할 수 없다. 관측 없이 소멸했다 — 확인했다는 뜻이 아니다.
- [x] **원본 URL을 못 받았을 때의 화면** — presign이 느리거나 실패하면 검은 상자만 남고 안내 문구는 그대로 "Live preview on your video"라고 말한다. 게이트②에서 제기한 비차단 사항 — 실물에서 얼마나 거슬리는지 보고 문구·플레이스홀더 후속을 정한다  
  → **대체(FEAT-52)**: 이 줄의 대상인 **검토 화면 `Caption style` 다이얼로그가 FEAT-52로 삭제됐다.** `CaptionStyleEditor`의 소비자를 전수 열거하면 이제 `pages/settings/ui/index.tsx:260` **하나뿐**이고 `sample`(항상 true)·`playUrl={null}`을 고정 전달한다(2026-09-21 메인 루프 직접 grep). 즉 **실영상 미리보기 경로 전체가 도달 불가**이며 이 확인은 어떤 화면에서도 판정할 수 없다. 관측 없이 소멸했다 — 확인했다는 뜻이 아니다.

**이 절이 닫힐 때 함께 판단할 후속 셋** — 계획서 「범위 밖 의존」이 남긴 후보다. **지금 백로그에
등재하지 않는다**: 셋 다 "미리보기가 실물에서 얼마나 쓸 만한가"가 정해야 답이 나오는데 그 답이
바로 위 여덟 줄이다. 등재해 두면 답도 없이 pm의 후보로 올라온다. 대신 판단 지점을 여기 못박는다 —
이 절을 닫는 사람이 아래 셋을 함께 결정하고, 채택된 것만 `TASK_BACKLOG.md`에 올린다.
(백로그의 FEAT-36 항목은 완료와 함께 지워졌으므로 이 문단이 그 후속의 유일한 보관처다.)

- **(a) 렌더 후 재캡션** — 자막 넣기 직전의 세로 영상(`apps/backend/main.py` `process_clip`의 `vertical_mp4_path`
  `vertical_mp4_path`)은 지금 업로드되지 않고 버려진다. 보관하면 캡션 스타일 변경이 CPU ffmpeg
  번인 몇 초로 끝나고, 이 항목이 **원리상 못 닫는 두 근사**(화자 추적 크롭·한국어 번역문)가 실물로
  닫힌다. backend+web, S3 보관 비용과 크레딧 정책 결정이 딸린다. **판단 기준**: 위 셋째·넷째(크기
  대조)와 여섯째(위치)가 어긋나거나, 중앙 크롭 근사가 실사용에서 오해를 부르면 착수한다.
- **(b) 한국어 미리보기 번역** — 묶음 텍스트를 Gemini로 번역하는 서버 액션(초안 id + 줄당 단어 키로
  캐시). 웹에 Gemini 클라이언트가 없어 키 위치에 따라 web/backend가 갈린다. **판단 기준**: 한국어
  클립에서 영어 원문 표시가 스타일 판단을 방해하는지 — 크기·위치만 보는 용도면 불필요하다.
- **(c) 메인 패널 재사용** — 같은 `CaptionPreviewPlayer`를 검토 화면 왼쪽 플레이어에도 써서 카드의
  Preview가 저장된 스타일까지 입혀 보이게 한다. 컴포넌트가 이미 있어 가장 가볍다. **판단 기준**:
  다이얼로그를 열지 않고도 스타일을 확인하고 싶어지는지.

---

## FEAT-35 — 클립 경계 편집 루프 (web, 구현 2026-09-08)

원천: `docs/agents/web-dev/FEAT-35.md`의 「못 덮은 범위」와 계획서 「테스트」. **배포됨** — PR #114 `main` 합류(2026-09-08)로 Vercel 프로덕션 반영. (원장 표기는 2026-09-15에 갱신 — 구현 커밋이 `origin/main` 첫 부모 경로의 그 머지에 처음 포함됨을 `git merge-base --is-ancestor`로 대조)
게이트는 `npm run check` EXIT 0 · `npm test` **123/0**(+16, FEAT-36 합류 후 병합 트리 실측)로 닫혔고,
구간 계산·방향 스냅·시계 파싱은 순수 모듈 테스트 16건이 지킨다(계획 검증에서 돌연변이 18종 중
17종 사멸, 나머지 1종은 도달 불가 등가 변이로 판정·기록).
**마크업 계약은 이미 닫혔다** — 세 버튼·aria-label·입력 `type="text"`·시계 초기값(`167.893`→`2:47.9`)·
옛 라벨 소거는 계획 검증에서 패치본을 `renderToStaticMarkup`으로 렌더해 확인했다.
아래는 **브라우저 재생·입력 이벤트 순서**가 필요해 Node 러너가 원리상 못 덮는 것들이다.
**`〔auto〕` 태그를 붙이지 않는다**: 전부 로그인 뒤 검토 화면(`review_pending` 업로드)에서만 열리고
판정이 재생 동작·이벤트 순서라, 공개 프로덕션 응답 본문으로 닫을 수 있는 줄이 하나도 없다.

- [ ] **경계 프리뷰가 실제로 그 창을 재생하는지** — 카드의 `Start`는 시작 **1.5초 전**부터 3.5초, `End`는 끝 3.5초 전부터 **1.5초 뒤**까지 재생하고 각각 그 지점에서 멈추는지. `timeupdate` 주기(~250ms)만큼의 오버슛은 정상이다(계획서가 선언한 한계). **pre-roll이 이 항목의 핵심이다** — 잘린 앞말이 들려야 "말 중간이 잘렸는가"를 판정할 수 있다. 마감 증거는 `확인(날짜, 화면 관측)`
- [ ] **`Full`이 기존과 같은 전 구간 재생인지** — 회귀 확인. 구간 전체(30~90초)를 재생하고 끝에서 멈춘다
- [ ] **넛지가 침묵 구간에서도 움직이는지** — 이 항목의 존재 이유다. 문장 첫 단어에 경계가 걸린 상태(직전 단어와 1.0초 이상 떨어진 곳)에서 `−`를 눌렀을 때 **값이 실제로 이전 단어 경계로 이동**하는지. 옛 구현은 여기서 조용히 아무 일도 안 했다. `+`도 대칭으로 확인
- [ ] **입력 blur 커밋/복원** — `2:47.9` 형식으로 고쳐 포커스를 빼면 그 값이 반영되고, 읽을 수 없는 값(`abc`·`2:60`)을 넣고 빼면 **마지막 유효값으로 되돌아가는지**(빈 칸이나 `NaN`이 남지 않는지)
- [ ] **편집 중 넛지 클릭의 이벤트 순서** — 입력에 타이핑한 채로 `−`/`+`를 누르면 mousedown→blur(커밋)→click 순서로 돌아 **넛지가 방금 커밋된 값에서** 움직이는지. 계획서가 추론으로만 세운 전제이고 순수 함수 밖이라 확인 대상이다. 어긋나면 넛지가 커밋 전 값에서 움직여 한 스텝을 잃는다

---
## FEAT-32 — 클라이언트 Sentry 초기화 (web, 구현 2026-09-07)

원천: `docs/agents/web-dev/FEAT-32.md`의 「테스트로 못 덮은 범위」와 계획서 §검증. **배포됨** — PR #114 `main` 합류(2026-09-08)로 Vercel 프로덕션 반영. (원장 표기는 2026-09-15에 갱신 — 구현 커밋이 `origin/main` 첫 부모 경로의 그 머지에 처음 포함됨을 `git merge-base --is-ancestor`로 대조)
게이트는 `npm run check` EXIT 0 · `npm test` **88/0**(+11) · FSD 경계 통과로 닫혔고, 스크럽 계약은
순수 모듈 테스트가 서버·클라 양쪽을 동시에 지킨다. 아래는 **브라우저·실제 네트워크·외부 대시보드**가
필요해 Node 러너가 원리상 못 덮는 것들이다.
**`〔auto〕` 태그를 붙이지 않는다**: 전부 브라우저 실행·외부 콘솔 판정이라 프로덕션 응답 본문으로
판정할 수 없다.

**선행(사용자)**: Vercel Production·Preview 스코프에 `NEXT_PUBLIC_SENTRY_DSN`을 기존 `SENTRY_DSN`과
**같은 DSN 값**으로 주입. 없으면 클라 init이 조용히 no-op이라 아래 넷이 전부 성립하지 않는다.
(코드는 이 값 없이도 빌드·배포된다 — `.optional()`.)

- [ ] **브라우저에서 init이 실제로 돌고 이벤트가 도달하는지** — 이 항목의 본체. 프로덕션(a-pch.com) 콘솔에서 `setTimeout(() => { throw new Error("apch-sentry-client-smoke https://x.s3/y?X-Amz-Signature=SHOULD_BE_REDACTED"); })`로 에러 경계에 안 잡히는 오류를 유도하고, Sentry Issues에 뜨는지 확인. 마감 증거는 `확인(날짜, Sentry 이슈 링크/스크린샷)`
- [ ] **unhandledrejection 경로** — `Promise.reject(new Error("apch-sentry-rejection-smoke"))`가 같은 경로로 도달하는지. C-27이 남긴 버려진 프라미스 넷이 이 경로로 잡힌다
- [ ] **CSP가 이벤트 POST를 막지 않는지** — devtools Network에서 `*.ingest.*.sentry.io` POST가 200이고 콘솔에 `Refused to connect ... connect-src` 위반이 없는지. `connect-src`에 `https://*.sentry.io`를 새로 넣었고 CSP는 프로덕션에서만 적용되므로 배포 실물에서만 닫힌다
- [ ] **스크럽이 실동작하는지** — 위 스모크 이벤트의 Sentry 본문에서 서명값이 `X-Amz-Signature=[REDACTED]`로 마스킹됐는지. 테스트는 순수 함수를 덮지만 **SDK 정규화 뒤 실제 `beforeSend` 경로**를 통과하는 것은 실물에서만 확인된다
- [ ] **environment 태그가 `production`인지** — 클라는 `NEXT_PUBLIC_VERCEL_ENV`를 노출하지 않는 기본 경로라 SDK가 `NODE_ENV` 폴백으로 채운다. 노출하면 `vercel-production`이 되어 서버(`production`)와 비대칭이 되므로, 값이 `vercel-` 접두를 달고 있으면 그 변수가 어딘가에 주입된 것이다
- [ ] **`webpack.treeshake`가 실제 번들에서 tracing을 걷어냈는지** — 옵션 키가 SDK에 실재함은 인수 시 확인했으나(`webpack.js:556·559`), 산출물 크기 변화는 배포 빌드에서만 관측된다. 미달이어도 기능 결함은 아니다(번들 크기만)

---

## FEAT-34 — FSD 경계 자동 검출 도입 (web, 구현 2026-09-06)

원천: `docs/agents/web-dev/FEAT-34.md`의 「테스트로 못 덮은 범위」. 커밋 `9275ccd`. **배포 완료(2026-09-07, PR #113 머지 `f2825a5`).**
사용자 가시 동작 변화가 **없는** 항목이다(CI 검사 도입 + 선행 정리 5건의 임포트 경로 교체). 게이트는 `verify:fsd` EXIT 0 · 셀프테스트 **11/11** · `npm run check` EXIT 0 · `npm test` **77/0** · `npm run build` EXIT 0으로 통과했고, 감시 지점 둘의 검출은 메인 루프가 인수 시 위반을 심어 직접 실증했다(W5·W4 각 EXIT 1, 되돌리면 통과).
**`〔auto〕` 태그를 붙이지 않는다**: 아래는 저장소 상태·CI 동작이라 admin base의 프로덕션 응답으로 판정할 수 없다.

- [x] **선행 정리 5건의 런타임 무회귀(배포 실물)** — 확인(2026-09-07, 프로덕션 Playwright). `/pricing`: **PLAN_TIERS 렌더** — Free `$0`·「3 credits on signup」, Pro `$9.99`·`/month`·「30 credits / month」·「Yearly: $99.99/yr」. `/dashboard`: 큐·목록 쿼리 옵션 경유 화면 정상(591 Credits·Upload/My Clips 탭·업로드 패널), **콘솔 오류 0**. 남은 둘은 조건부라 미관측 — 복구 초안 카드는 이 계정에 초안이 없어 `null` 렌더, stale reconcile은 정체된 업로드가 있어야 돈다(둘 다 배럴 임포트만 바뀌었고 `tsc`가 해석을 보장)
- [ ] **CI에서 실제로 도는지**: 배포 파이프라인이나 다음 `npm run check` 실행에서 `verify:fsd:test && verify:fsd`가 앞단으로 돌고, 위반이 생기면 배포 전에 막힌다. 로컬에서는 확인했으나 CI 환경(다른 Node·경로 구분자)에서의 첫 실행은 관측 대상

---

## FEAT-33 — widgets Public API 배럴 + import 경로 위생 (web, 구현 2026-09-05)

원천: `docs/agents/web-dev/FEAT-33.md`의 「테스트로 못 덮은 범위」. 커밋 `ac7808c`. **배포 완료(2026-09-07, PR #113 머지 `f2825a5`).**
사용자 가시 동작 변화가 **없는** 항목이다(배럴 신설 + import specifier 교체, 컴포넌트 본문 무변경). 게이트는 `npm run check` EXIT 0 · `npm test` 77/0 · `npm run build` EXIT 0으로 통과했고, 경계가 실제로 생겼는지는 기계 검증 세 숫자로 판정했다 — 메인 루프가 인수 시 직접 재현: widgets 배럴 `find` **7**, 위젯 세그먼트 직접 참조 grep **0**, billing 슬라이스 자기참조 grep **0**.
**`〔auto〕` 태그를 붙이지 않는다**: 아래는 로그인 뒤 화면을 포함한 육안 렌더 확인이라 admin base의 루틴이 판정할 수 없다.

- [x] **배럴 경유 마운트 무회귀(육안)** — 확인(2026-09-07, 프로덕션). `/`·`/features`·`/guides` 200(SiteFooter·PublicHeader), `/login` 200(LoginForm), `/dashboard` 렌더(DashboardHeader·탭·업로드 패널), `/dashboard/uploads/<id>` 렌더(ClipDisplay — 처리 타임라인 4단계·Generated clips·Visible clips), `/dashboard/billing` 렌더(Pro·Active·Sep 26, 2026·결제 이력 — billing 자기참조 3건이 상대경로로 바뀐 화면). 콘솔 오류 0
- [x] **경계가 유지되는지(감시 지점)** — 대체(FEAT-34). 이제 강제된다: `npm run check`가 `verify:fsd`를 앞세우고(`package.json:10`), 규칙 **W4**(비-fsd 소스 → widgets 내부)와 **W6**(fsd 소스 → 크로스 슬라이스 딥 임포트)가 이 회귀를 잡는다. 메인 루프가 인수 시 직접 재현 — `src/app/dashboard/loading.tsx`에 `~/fsd/widgets/clip-display/ui` 임포트를 심으니 `[W4] widget internals require the slice barrel` **EXIT 1**, 되돌리니 `FSD boundary check passed.` EXIT 0. 사람이 grep을 돌릴 필요가 없어졌다

---

## FEAT-31 — 엔티티 배럴 다섯의 런타임 분할 (web, 구현 2026-09-04)

원천: `docs/agents/web-dev/FEAT-31.md`의 「테스트로 못 덮은 범위」. 커밋 `a3d85c2`. **배포 완료(2026-09-07, PR #113 머지 `f2825a5`).**
사용자 가시 동작 변화가 **없는** 항목이다(순수 배럴 재배선, DB 접근 코드 무변경). 게이트는 `npm run check` EXIT 0 · `npm test` 77/0 · `npm run build` EXIT 0으로 통과했고, 분할 효과는 프로브 빌드로 실증했다 — 메인 루프가 인수 시 직접 재현: 다섯 barrel을 `"use client"`에서 동시 임포트해 `✓ Compiled successfully`, 라우트 목록에 `/barrel-probe` 등재. 분할 **전** 같은 조건은 `server-only` 위반으로 exit 1이었다(계획 검증 1라운드 실측).
**`〔auto〕` 태그를 붙이지 않는다**: 아래는 로그인 뒤 흐름이거나 코드 상태 감시라 admin base의 루틴이 판정할 수 없다.

- [ ] **서버 경로 무회귀(배포 실물)**: 임포터 13개가 닿는 흐름
  - 절반 확인(2026-09-07, 프로덕션): 홈(`getHomeUserProfile` — `/` 200)·대시보드 레이아웃(`getDashboardHeaderUser` — 헤더에 591 Credits·아바타 렌더)·빌링(`getBillingUserSnapshot`·`findSubscriptionByUserId` — Pro/Active/갱신일/결제 이력 5건 렌더). **남은 것**: 분석 이벤트 수집·업로드 디스패치·크레딧 차감·Polar 웹훅 4종 — 실제 업로드 주행과 결제 이벤트가 있어야 돈다
- [x] **회귀 방어선 부재(감시 지점)** — 대체(FEAT-34). 규칙 **W5**가 배럴 **정의**를 보므로 **임포터 유무와 무관하게** 잡는다 — 잠복할 수 없다. 메인 루프가 인수 시 직접 재현 — `entities/user/index.ts`에 `export { getUserPolarCustomerId } from "./api";`를 심으니 `[W5] entity client barrel must not re-export server-only ./api; use server.ts` **EXIT 1**, 되돌리니 EXIT 0. `npm run check`에 배선돼 있어 사람이 기억할 필요가 없다

---

## BUG-11 · BUG-10 (web, 구현 2026-09-04)

원천: `docs/agents/web-dev/BUG-11.md`·`BUG-10.md`의 「테스트로 못 덮은 범위」. 커밋 `07c4761`. **배포 완료(2026-09-04, PR #112 머지 `3153989`).** 같은 날 메인 루프가 프로덕션에서 스윕해 9줄 중 5줄 마감.
자동 검사 게이트(`npm run check` EXIT 0 · `npm test` 77/0)는 통과했다. 아래는 그 게이트가 원리상 못 덮는 것 — 브라우저 런타임, 실제 S3·DB I/O, 외부 응답 한도.
**`〔auto〕` 태그를 붙이지 않는다**: release-verify 루틴의 base는 `admin.a-pch.com`인데 아래는 전부 web(`a-pch.com`)의 로그인 뒤 화면·브라우저 콘솔이다.

BUG-11 — 서버 액션 프록시로 CORS 제거:

- [x] **핵심 — CORS 소멸** — 확인(2026-09-04, 프로덕션 Playwright: `/dashboard/uploads/cms7kthjp0001jp04l2vybhj4` 로드에서 **콘솔 오류 0건**. 배포 전 같은 페이지는 S3 `transcript.json`에 대한 CORS 차단 + `net::ERR_FAILED`가 5s·7s·10s·15s 간격으로 반복됐다)
- [x] **전사가 실제로 로드된다** — 확인(2026-09-04: 같은 화면에 「Add a clip AI missed」 문단과 「Add custom clip」 버튼이 렌더됐다. 이 패널은 `transcriptWords.length > 0`일 때만 나오고 전사가 비면 `null`을 렌더한다 — 배포 전 스냅샷에는 이 문구가 없었다. 즉 서버 액션 `getTranscript` → `getS3ObjectText`의 실제 S3 읽기가 성공한다)
- [ ] **서버 액션의 인증 경로(테넌트 스코프)**: 남의 업로드 id로는 실패한다(`findUploadedFileReviewState(id, userId)`). 두 번째 계정이 필요해 미확인 — S3 읽기 절반은 위 줄에서 닫혔다
- [ ] **실패 안내가 몇 초 안에 뜬다**: 전사가 없는/깨진 업로드에서 "Transcript unavailable — custom clips are disabled."가 `retry: 2` 소진 후 빠르게 보인다. 이전에는 재시도가 포커스·뮤테이션마다 재점화돼 안내가 사실상 안 떴다
- [ ] **큰 전사 payload**: 긴 영상의 전사가 Vercel 함수 응답 한도(4.5MB) 안인지 실측. 넘으면 스트리밍·페이지네이션이 후속 항목이 된다

BUG-10 — 날짜 포매팅 UTC 고정:

- [x] **핵심 — React #418 소멸** — 확인(2026-09-04, 프로덕션 Playwright: `/dashboard/billing`·`/dashboard/uploads/<id>` 둘 다 **콘솔 오류 0건**. 배포 전에는 2026-09-03·09-04 두 날 매 로드 1건씩 떴다)
- [x] **날짜 하루 이월(소유자가 알고 택한 트레이드오프)** — 확인(2026-09-04, 프로덕션 실측: **빌링 화면의 날짜 6건 전부 하루 당겨졌다**. 다음 갱신 `2026. 9. 27.` → `Sep 26, 2026`, 결제 이력 `2026. 8. 27.`→`Aug 26, 2026`·`2026. 7. 27.`→`Jul 26, 2026`·`2026. 6. 27.`→`Jun 26, 2026`·`2026. 4. 27.`→`Apr 26, 2026`·`2026. 3. 27.`→`Mar 26, 2026`. 이 계정의 구독 타임스탬프가 전부 UTC 15:00 이후라는 뜻이다. 예고된 동작이며 결함이 아니다 — 소유자가 UTC를 택할 때 이 이월을 알고 있었다)
- [x] **표시 문구 전환** — 확인(2026-09-04: 업로드 상세 상단 `Aug 13, 2026, 2:23 PM`, 처리 타임라인 4단계 `Aug 25, 2026, 3:22 PM`~`3:32 PM`, 빌링 `Sep 26, 2026`. 배포 전 ko-KR `2026. 7. 30. 오후 10:55:46` 형태에서 전환됐고 화면에서 어색한 곳은 없었다)
- [ ] **러너가 못 덮는 두 곳**: `RecoverableUploadDrafts`(복구 초안이 있을 때)·`UploadedFileCard`(My Clips 탭)의 시각 표기가 서버·클라이언트 동일한지
  - 절반 확인(2026-09-04): `UploadedFileCard`는 My Clips 탭을 열어 확인 — `Uploaded: Aug 13, 2026, 2:23 PM`(배포 전 같은 카드는 KST `11:23 PM`)로 UTC 전환됐고 콘솔 오류 0건. **기존 포매터의 타임존 미고정 잠복 결함도 함께 닫혔다.** `RecoverableUploadDrafts`는 이 계정에 복구 대상 초안이 없어 미확인

---

## 클린코드 개선 (5렌즈 검토, 정규 77건) — web, 구현 2026-09-03

원천: `apps/web/docs/proposals/completed/2026-09-03-frontend-clean-code-improvements.md` §Verification Plan 수동 표.
보드 항목이 아니라 사용자 직접 지시로 돈 작업이라 항목ID가 없다. 커밋 `9dd6dfb`~`a3461aa`(159파일). **배포 완료(2026-09-03 11:02 KST, PR #111 머지).**
자동 검사 게이트(typecheck·lint·70/70 테스트·build·라우트 static/dynamic 대조)는 Phase마다 통과했다. 아래는 그 넷이 원리상 못 덮는 것뿐이다 — 외부 SaaS 테넌트, 브라우저 렌더·타이밍, 실제 워커 실행.
**`〔auto〕` 태그를 붙이지 않는다**: release-verify 루틴의 base는 `admin.a-pch.com`이고(`scripts/release-verify/run.mjs:11`) 아래는 전부 web(`a-pch.com`) 경로다. 루틴이 web을 대상으로 확장되면 공개 라우트 줄부터 태그를 붙일 수 있다.

동작이 바뀐 것 — 실물에서만 닫힌다:

- [x] **C-02 Polar 테넌트(가장 위험)**: 이관(BUG-09) — 확인 결과 **결함**이다. 프로덕션 「Manage Subscription」이 Polar 포털이 아니라 **HTTP 500**(본문 길이 0)을 낸다. 2026-09-03 13:20 KST·2026-09-04 15:30 KST 두 번 재현. 앞단 가드는 정상(비로그인 GET 307 `/login`)이라 `portalHandler` 진입 후 예외다. 원문:  프로덕션 `/dashboard/billing` → "Manage Subscription"이 **프로덕션** Polar 포털을 연다(sandbox 아님). 이전에는 `getPolarClient`가 `env.POLAR_SERVER`를 보고 포털 라우트는 `"sandbox"`를 하드코딩해 둘이 갈렸다. 반대로 지금까지 sandbox가 의도였다면 이 줄이 아니라 `POLAR_SERVER` 값을 재검토해야 한다
- [ ] **C-49 포털 미로그인·미고객 경로**〔절반 확인(2026-09-03, curl 실측): 로그아웃 상태 `GET /api/portal` → **307 `https://a-pch.com/login`**. 남은 절반(로그인했으나 Polar 고객이 아닌 계정 → `/dashboard/billing`)은 그런 계정이 없어 미확인〕:  로그아웃 상태로 `/api/portal` → `/login` 리다이렉트, 로그인했지만 Polar 고객이 아닌 계정 → `/dashboard/billing` 리다이렉트. 이전에는 빈 문자열 고객 id를 Polar에 넘겼다
- [x] **C-29 존재하지 않는 업로드**: `/dashboard/uploads/<없는 id>`가 404(not-found) 화면이다. 이전에는 `findFirstOrThrow`가 던져 에러 경계로 떨어졌다 — 확인(2026-09-04, 프로덕션 Playwright: 로그인 세션으로 `/dashboard/uploads/aaaa` → "404 / Page not found / The page you requested does not exist or has been moved." + Home 링크 렌더. 스트리밍 중 `notFound()` 전이라 콘솔에 React #419가 남지만 최종 화면은 404로 정착)
- [ ] **C-30 웹훅 입력 방어**: Modal 웹훅에 깨진 JSON을 POST하면 500이 아니라 400
- [ ] **C-63 빈 제목 클립**: DB에서 `youtubeTitle`을 `""`로 비운 클립에서 "YouTube Metadata" 메뉴가 **활성**이다(설명·해시태그가 있으면). `??`를 `||`로 고친 결과
- [ ] **C-17 마지막 클립 삭제**: 마지막 클립을 지운 직후 "No clips found"가 즉시 보인다(낙관적 목록 기준 판정)
- [ ] **C-66 자동재생 재개 없음**: 업로드 하나가 `processing`인 상태에서 목록 카드를 펼쳐 재생 → 일시정지 후 15초(7.5초 큐 폴 두 번) 관찰. 재생이 다시 시작되지 않는다
- [ ] **C-10 presign 실패 표시**: 업로드 상세의 Original media와 검토 화면 플레이어에서 presign이 실패하면 "Video unavailable"·"Preview unavailable" 문구가 보인다. 이전에는 빈 검은 상자가 영원히 남았다
- [x] **C-71 파괴적 액션 확인창**: 업로드 삭제와 구독 해지가 브라우저 `confirm()` 대신 앱 AlertDialog를 띄우고, 취소하면 아무 일도 없다 — 확인(2026-09-04, 프로덕션 Playwright 실측). 구독 해지: `alertdialog` "Cancel your subscription?" + 본문 "Your plan stays active until 2026. 9. 27., …" + 버튼 「Keep subscription」(기본 포커스)·「Cancel subscription」 → Keep 클릭 후 Pro·Active·다음 갱신 2026-09-27 **무변경**. 업로드 삭제: Manage 메뉴 → Delete detail → `alertdialog` "Delete this upload?" + "This cannot be undone, and spent credits are not refunded." + 「Cancel」·「Delete」 → Cancel 클릭 후 다이얼로그 소멸·업로드와 4클립 **생존**. 브라우저 네이티브 `confirm()`은 두 경로 어디에도 없었다

무회귀 — 형태만 바꿨으나 실물에서만 보이는 것:

- [ ] **C-72/C-73 법률 페이지와 헤더**: `/privacy`·`/terms`가 마케팅 헤더·푸터와 함께 렌더되고 URL은 그대로다. 로그인 상태로 `/`와 `/features`·`/pricing`을 오갈 때 헤더가 **같은** 인증 상태(아바타)를 보인다 — 이전에는 `/`만 아바타였다
  - 절반 확인(2026-09-03, 프로덕션 스윕): `/privacy`·`/terms` 둘 다 200·리다이렉트 0(URL 유지)·`<header>`/`<footer>` 각 1개 동반 렌더·내부링크 18개(마케팅 나머지와 동일 집합)·h1 "Privacy Policy"/"Terms of Service" 실렌더. **남은 절반은 로그인 상태의 헤더 인증 상태(아바타) 일치** — 웹 로그인 세션이 필요해 스윕 밖이다
- [ ] **C-73 분석 라벨 합류**: 합쳐진 "Log in" 버튼의 `cta_clicked` 이벤트가 `location: "public_header"`로 기록된다. 홈의 옛 `"site_header"` 시계열은 여기로 합류한다 — 분석 소유자가 다른 값을 원하면 `widgets/site-header/ui/public-header.tsx` 한 단어를 바꾼다
  - 절반 확인(2026-09-03, 프로덕션 스윕): `/features` 응답 본문에 `public_header` 1건 방출, 옛 `site_header` **0건** — 라벨 교체 자체는 실물에서 확인됐다. **남은 절반은 클릭이 실제로 `cta_clicked`를 그 값으로 기록하는지**(분석 백엔드 관측)와 값 유지 여부의 소유자 결정
- [ ] **C-33/C-34 실패 라벨**: 실패한 업로드 상세의 타임라인에 실패 사유 문구가 그대로 뜬다(어휘를 카탈로그로 옮기면서 생산자 없는 case 둘을 지웠다 — 그 둘은 원래 표시된 적이 없다)
- [x] **C-36/C-37 마케팅 라우트**: `/about`·`/contact`·`/security`·`/how-it-works`·`/changelog` 다섯이 분할 전과 같은 화면을 낸다. 푸터·헤더 nav의 링크가 전부 살아 있다 — 확인(2026-09-03, 프로덕션 스윕 — 다섯 라우트 전부 200·리다이렉트 0(URL 유지)·본문 h1 실렌더("About AI Podcast Clipper" / "Contact AI Podcast Clipper" / "Security and Data Handling" / "How AI Podcast Clipper Turns Podcasts Into Shorts" / "AI Podcast Clipper Changelog"). nav 내부링크 전수 생존 — `/about` 페이지가 방출하는 18개 내부경로(`/`·`/features`·`/pricing`·`/login`·`/privacy`·`/terms`·`/ai-podcast-clipper`·`/compare`·`/guides`·`/podcast-to-shorts`·`/product-tour`·`/youtube-shorts-generator` 포함) 전부 200. 한계: "분할 전과 같은 화면"의 픽셀 대조는 분할 전 스크린샷이 없어 불가 — 라우트 생존·헤더/푸터 동반·본문 렌더까지가 이 스윕의 범위)
- [ ] **C-74 에러 경계**: 라우트 오류를 유도하면 다섯 경계가 이전과 같은 콘솔 문구(`<라벨> error boundary caught:`)를 남긴다
- [ ] **C-75/C-76/C-56/C-46 워커 경로(자동 테스트 없음)**: 업로드 1건을 실제로 처리해 `processVideo` 완료 → 크레딧 차감 → 클립 표시까지 확인한다. 이어서 stale reconcile을 수동으로 유도(타임아웃)해 상태가 `failed`로 전이하고 `worker_timeout`이면 취소 이벤트가 나가는지 본다. 서버 모듈이 엔티티에서 feature로 옮겨간 것이 이 경로 전체의 유일한 검증이다
- [ ] **C-09 두 ingest 경로**: 위 실행에서 웹훅 직접 쓰기와 Inngest 폴링 응답이 **같은** 정규화를 거친다 — 클립 카드의 13개 필드(제목·대본·해시태그·근거·자막 상태)가 두 경로 어느 쪽으로 들어와도 동일하게 채워진다


## FEAT-29 — 정체 감시를 cron에서 건별 이벤트 감시자로 전환 (web, 구현 2026-09-02)

원천: `docs/agents/web-dev/FEAT-29.md` 「테스트로 못 덮은 범위」 + 계획서 「테스트」. **배포 완료(2026-09-03 11:02 KST, PR #111 머지).**
이 항목은 Inngest 오케스트레이션(이벤트 발송·`step.sleep` 재개·`cancelOn`·concurrency)이 본체인데 현재 러너(`tsx --test`, Inngest·DB 하니스 없음)로는 그 전부를 못 덮는다 — 아래는 배포 후 Inngest 대시보드와 Neon 콘솔에서만 닫힌다.
남는 정기 깨움: `cleanupAnalyticsEvents`(일 1회 03:00)는 유지 대상이라 정상이다.

- [ ] **배포 전 전제 — 전환 구간 공백**(⚠ 배포는 2026-09-03 11:02 KST에 이미 일어났다 — 남은 확인은 "그 순간 `processing`인 업로드가 있었나" 하나다. 없었으면 이 줄은 그대로 닫힌다): 배포 순간 이미 `processing`인 attempt는 `processing/attempt.claimed`를 받은 적이 없어 감시자가 없고, 그것을 잡던 cron은 사라진다. **처리 중 업로드가 없을 때 배포**한다. 있는 채로 배포했다면 그 건은 정체돼도 알림이 없다는 것을 알고 넘어간다(사용자 가시 영향 없음 — 조회 시점 `reconcileStaleUploadedFileForUser`가 여전히 강제 실패시킨다)
- [ ] **이벤트 발송**: 업로드 1건을 처리시키면 Inngest 대시보드에 `processing/attempt.claimed`가 claim 직후 1회 발송되고(analyze·render 각 1회), `watch-processing-attempt` 런이 그 이벤트로 시작된다
- [ ] **sleep → check 흐름**: 그 감시자 런이 `wait-for-stuck-threshold`에서 90분 잔 뒤 `check-attempt-still-processing`을 1회 실행하고, 정상 종료된 업로드였다면 `{ alerted: false }`로 끝난다(알림 없음)
- [ ] **슬롯 비점유(중요)**: 자는 감시자가 있는 동안 같은 유저의 다음 업로드가 **즉시** 처리 시작된다. 감시자에 concurrency를 두지 않은 이유가 이것이며, 막히면 유저당 1건 직렬화가 최대 90분 잠긴다 — 회귀 시 영향이 가장 큰 줄이다
- [ ] **취소 매칭**: 정체된 업로드를 화면에서 열어 `reconcileStaleUploadedFileForUser`가 강제 실패시키면, 그 attempt의 자는 감시자가 `process-video-events/cancel`(같은 `matchKey`)로 취소된다
- [ ] **정체 알림 실물**: 실제로 90분을 넘겨 `processing`에 머문 건이 생기면 Sentry에 `stuck-processing: <N>m` 이슈가 **1회** 뜬다(옛 cron은 15분마다 최대 96회 재보고했다)
- [ ] **이 항목의 목적 — Neon 유휴 깨움 소멸**: 배포 며칠 뒤 Neon 콘솔 Billing → Usage에서 compute 시간이 눈에 띄게 떨어진다. 배포 전 하루 ≈96회 깨움(15분 cron × autosuspend 5분)이 유휴 0회가 되어야 한다. 떨어지지 않으면 다른 깨움원(로컬 개발이 프로덕션 엔드포인트 공유 등)이 남은 것이므로 백로그 항목을 만든다

## FEAT-28 — 실패 콜백의 부분 클립 메타데이터 소비 (web, 구현 2026-09-02)

원천: `docs/agents/web-dev/FEAT-28.md` 「테스트로 못 덮은 범위」. **배포 완료(2026-09-03 11:02 KST, PR #111 머지).**
BUG-08(backend 절반, 2026-08-29 배포)의 두 번째 절반이라, 이 절이 닫혀야 그 항목의 사용자 가시 효과가 처음 확인된다.
`applyModalPayload`는 `processVideo` 안의 클로저라 현재 러너(`tsx --test`)로 종단 구동이 불가능하다 — 아래는 전부 실제 부분-실패 실행에서만 닫힌다.

- [ ] **핵심 — 부분 성공 클립의 메타데이터 표시**: 클립 루프 중간 실패를 유도한 실제 실행에서, 이미 S3에 오른 앞쪽 클립의 카드에 제목·대본·근거(clipType 라벨·hook·payoff)와 자막 폴백 안내가 뜬다. 수정 전에는 같은 상황에서 이 값들이 전부 빈 맨행이었다
- [ ] **실패 판정 유지**: 위와 같은 실행에서 업로드 자체는 여전히 실패/부분으로 남는다 — `failureCode`가 `PARTIAL_CLIPS_AFTER_BACKEND_ERROR`이고 성공으로 뒤집히지 않는다(수정이 `backendFailureMessage`를 건드리지 않았다는 것의 실물 확인)
- [ ] **크레딧 차감 불변**: 같은 실행에서 차감량이 전달된 클립 수(`clipsFound`)와 일치하고, 메타데이터가 붙었다고 달라지지 않는다
- [ ] **성공 경로 무회귀**: 정상 실행의 클립 메타데이터 반영·폴링 조기 탈출(settle/detected)이 이전과 동일
- [ ] **웹훅 무회귀**(BUG-08에서 이관): 실패 페이로드로 웹훅이 200을 돌려주고 `normalizeBody`를 통과한다. 단 inngest 결과는 이제 **맨행이 아니라 메타데이터 행**이며, 경로 A `updateMany` 0건은 그대로 정상이다(행 생성 시점에 메타데이터가 담기므로)

## BUG-08 — 에러 콜백에 부분 clip_results 싣기 (backend, 구현 2026-08-29)

원천: `docs/agents/backend-dev/BUG-08.md` 「못 덮은 범위」. **배포 완료(2026-08-29 11:25 KST, BUG-04와 묶어 `modal deploy` — 사용자 승인 하에 메인 루프 실행).** 주의: 이 항목만으로는 사용자 가시 변화가 없다 — web inngest가 `status: error` 페이로드의 `clips`를 소비하는 후속(백로그 후보)이 있어야 메타데이터가 행에 실린다. 아래 줄은 그 전제 절반만 확인한다.

- [ ] `modal deploy` — 이미지 번들에 `error_callback` 포함 — **번들은 배포 출력으로 실측**(2026-08-29 11:25 KST: mount에 `PythonPackage:error_callback`), 컨테이너 import는 다음 실사용 실행에서
- [ ] 에러 콜백 본문 — 클립 루프 중간 실패를 유도한 `modal run`에서 웹훅이 받은 `status: error` 페이로드의 `clips`에 그때까지 완성된 클립(성공 콜백과 같은 원소 모양, `index`·`s3Key` 포함)이 실려 옴(웹훅 로그 또는 `modal/video.processed` 이벤트 payload). 루프 진입 전 실패는 `clips: []`(기존과 동일)
- [x] 웹 무회귀 — 그 페이로드로 웹훅이 200을 돌려주고(`normalizeBody` 통과), inngest는 기존대로 실패 처리(행은 맨행) — 경로 A `updateMany`는 행 부재로 0건이 정상 — 대체(FEAT-28). "행은 맨행"은 FEAT-28 구현(2026-09-02)으로 더 이상 참이 아니다 — 이 줄을 그대로 두면 확인자가 회귀(메타데이터 유실)를 정상으로 판정한다. 200·`normalizeBody` 통과 확인은 FEAT-28 절의 「웹훅 무회귀」 줄이 이어받는다
- [ ] 성공 경로 불변 — 정상 실행의 성공 콜백·클립 메타데이터 반영이 이전과 동일

## BUG-04 — 임시 디렉토리 정리 정책(KEEP_TEMP_ON_FAILURE opt-in) (backend, 구현 2026-08-29)

원천: `docs/agents/backend-dev/BUG-04.md` 「못 덮은 범위」. **배포 완료(2026-08-29 11:25 KST, BUG-08과 묶어 `modal deploy` — 사용자 승인 하에 메인 루프 실행, `App deployed in 6.437s`).** 잔여는 다음 실사용 실행에서 닫는다.

- [ ] `modal deploy` — 이미지 번들에 `temp_cleanup_policy` 포함 — **번들은 배포 출력으로 실측**(2026-08-29 11:25 KST: `Created mount PythonPackage:s3_upload_policy, PythonPackage:translation_fallback, PythonPackage:temp_cleanup_policy, PythonPackage:error_callback`), 컨테이너 import는 다음 실사용 실행에서(첫 실행 로그에 `ModuleNotFoundError` 없음)
- [ ] 기본값 동작 불변 — 프로덕션 실행(성공·실패)에서 기존 `Cleaning up temp dir after …` 로그만 나오고 `Preserving temp dir` 로그는 없음
- [ ] 로컬 `modal run` + `KEEP_TEMP_ON_FAILURE=1` — 실패 유도 시 `Preserving temp dir for debugging after failure: …` 로그와 `/tmp/<run_id>` 잔존, 성공 시에는 정리
- [ ] `succeeded` 제어흐름 — 예외 경로에서 False 유지(실패 실행에서 보존 스위치가 켜졌을 때만 보존되는 것으로 간접 확인)

## FEAT-26 — release-verify 루틴(원장 자동 마감) (main-loop, 구현 2026-08-29)

원천: `docs/agents/main-loop/FEAT-26.md` 「구현 인수」·계획서 「못 덮는 범위」. **배포 완료(2026-08-29 11:23 KST, PR #108 머지 — 루틴은 `dev`를 pull하므로 저장소 쪽은 그 전부터 유효).**
선행(사용자, claude.ai 환경 `Default`): 환경변수 `VERIFIER_SECRET`(Vercel admin과 같은 값) + 허용 도메인 `admin.a-pch.com`·`raw.githubusercontent.com` — **아직 미설정**. 실행 이력: 즉시 실행(00:35 KST, `cse_012JpnKvc33bPw1T9PWDHfn4`)·첫 예약 실행(09:02 KST, `cse_01Cnivmce2ajszFwQcjNK7ev`) 둘 다 비밀값 부재로 SKILL 2단계에서 무변경 종료 + 푸시 알림 — 설계된 실패 모드가 cron에서도 재현됨(스케줄 발화·저장소 pull·스킬 준수 확인).

- [ ] 클라우드에서 끝까지 실행 — 비밀값·도메인 허용 뒤 `action: run` 또는 09:00 KST 예약 실행이 SKILL 3~7단계를 통과(로그인 ok, `docs/release-checks.md`만 커밋·푸시, 종료 보고에 pass/fail/skip 줄 단위)
- [ ] 첫 자동 마감 — 원장의 `〔auto …〕` 줄이 루틴 커밋으로 `[x] … 확인(날짜, 자동 — 근거)`가 됨(전제 조건이 맞는 시점: 검토대기·검증 줄이 있는 보드 등)
- [ ] 메인 루프 편집과의 커밋 왕복 — 같은 날 사람이 원장을 고친 뒤 루틴 푸시가 `pull --rebase` 재시도로 붙는지
- [ ] PR 머지 트리거 — API `create_webhook_trigger` 필터 스키마 불일치(`filter.action`·`filter.base_branch` 거부)로 미배선. 웹 UI에서 배선하거나 cron만 유지(사용자 결정)
- [ ] 네트워크 허용 — 첫 실행이 2단계에서 멈춰 `admin.a-pch.com`·raw 접근은 미검증(호스트 차단이면 `login.step = csrf`로 종료코드 2)

## FEAT-25 — admin 검증기 인증 경로(읽기 전용 verifier 세션) (admin, 구현 2026-08-28)

원천: `docs/agents/admin-dev/FEAT-25.md` 「테스트로 못 덮은 범위」. **배포 완료(2026-08-28 12:07 KST, PR #107 머지).**
선행: Vercel admin 프로젝트 env에 `VERIFIER_SECRET`(긴 난수) 주입 — 미주입이면 provider가 등록되지 않아 아래
첫 줄이 "callback 실패"로 보이는 것이 정상이다(기능 휴면). 아래 줄들은 FEAT-26 루틴이 처음 성공적으로 돌면
`대체(FEAT-26)`로 닫힌다.

- [x] 실제 핸드셰이크 — `GET /api/auth/csrf`(`__Host-authjs.csrf-token` 쿠키) → `POST /api/auth/callback/verifier`(urlencoded `csrfToken`+`secret`) → **302 + `__Secure-authjs.session-token` 설정**. 오답이면 302 `/login?error=CredentialsSignin&code=credentials` + 세션 쿠키 없음 — 확인(2026-08-28 12:28 KST, curl 실측: csrf 쿠키 2개 발급 → 정답 POST 302 `/` + `__Secure-authjs.session-token`; 오답 302 `/login?error=CredentialsSignin&code=credentials` 세션 쿠키 없음; CSRF 누락 302 `/login?error=MissingCSRF`; `/api/auth/session` = `{id: verifier, role: verifier, email: null, verifierIssuedAt: number}`. `VERIFIER_SECRET` 주입 전엔 `providers`가 `google`뿐·callback `error=Configuration`이었고 Redeploy 뒤 `verifier` 등록)
- [x] verifier 세션으로 protected 페이지 GET(`/pipeline`·`/analytics`·`/observability`·`/pipeline/docs/…`·`/pipeline/agents/…`)이 렌더되고(Edge가 실제 verifier JWT를 통과), 헤더에 「검증기 (읽기 전용)」 폴백, `/login`은 `/analytics`로 리다이렉트 — 확인(2026-08-28 12:28 KST, curl 실측: 다섯 경로 전부 200·본문에 「검증기 (읽기 전용)」·이메일 없음; `/login` 302 `Location: /analytics`; 무세션 `/pipeline` 307 `/login?callbackUrl=…`)
- [x] 쓰기 거부 — verifier 세션으로 쓰기 액션이 404(`notFound`)로 막힘 — 확인(2026-08-28 12:32 KST, Playwright 실측: verifier 세션 쿠키로 `/observability` 렌더(헤더 「검증기 (읽기 전용)」) 후 「Send test event」 클릭 → 서버 액션 POST **HTTP 404** `text/x-component`, 화면 "404: This page could not be found." 나머지 3곳(명령 POST·게이트 승인·반려)은 같은 `requireAdmin({ write: true })` 호출이며 단위 테스트가 덮는다 — 게이트 버튼은 결재함이 비어 실물 클릭 대상이 없었음)
- [ ] Google admin 회귀 없음 — 관리자 계정으로 도장·실행 버튼이 그대로 동작 (사용자의 다음 실제 도장·실행 때 확인)
- [x] 1h 만료 — 발급 1h 뒤 같은 세션 쿠키로 protected 페이지 → 404, 재로그인으로 복구 — 확인(2026-08-29 00:47 KST, curl 실측: 23:40 KST 발급 세션(JWT 8h 유효, `/api/auth/session`에 verifier 신원 그대로)으로 67분 뒤 `/pipeline`·`/analytics`·`/observability` 전부 **404**(guard의 1h 가드), 재로그인 302 → `/pipeline` 200. 참고: 12:29 KST 세션은 8h JWT 만료 뒤 확인해 `session null`·307이었음 — 가드가 아니라 쿠키 만료라 관측 창을 다시 잡았다)

## FEAT-23 — 항목 카드 파이프라인 여정 스테퍼 (admin, 구현 2026-08-27)

원천: `docs/agents/admin-dev/FEAT-23.md` 「못 덮는 범위」. **배포 완료(2026-08-27 14:23 KST, PR #106 머지).**
주의: 스테퍼는 **결재함 카드에만** 뜬다 — 미결 0건이면 결재함이 비어 관측 자체가 불가하다. 다음 pm
선정이나 게이트 항목이 생길 때 확인한다.

- [ ] 노드 색/형태 — done 흑연 채움 · **현재·사용자 게이트 = 호박 빈 링**(`border-2 border-stamp`) · **현재·팀 = 남색 채움**(`bg-active`) · upcoming 옅은 빈 링. 현재 노드 크기 강조(size-2.5 vs 1.5)와 연결선 색
- [ ] 단계 라벨 반응형 — 데스크톱(sm↑) 7 라벨 노출, 폰에서 숨김(`hidden sm:block`)이되 노드 레일은 유지
- [x] 캡션 항상 표시 — "지금 <현재> · [대기 낱말] · 다음 <다음>", 호박/남색 색 일치, `flex-wrap` 폰 줄바꿈 — 확인(2026-09-04 09:08 KST, 자동 — GET /pipeline 200 · text 2/2 · css 1/1)
- [ ] `InboxCard` 통합 — 발화↔레일↔게이트 순서, `GateCardLock` 밖 배치, `ValidationMark` 칩과 시각 일관(검증 줄 있으면 칩=통과·레일=게이트②)
- [x] 신규 Tailwind 유틸 조합 방출 — `bg-silence`·`bg-active`·`border-stamp`·`border-active/50`·`border-stamp/50`가 실빌드에서 나오는지 — 확인(2026-08-29 13:41 KST, 자동 — GET /pipeline 200 · css 5/5)

## FEAT-24 — 원격 실행 진행 로그·버튼 잠금 (admin, 구현 2026-08-27)

원천: `docs/agents/admin-dev/FEAT-24.md` 「못 덮는 범위」. **배포 완료(2026-08-27 14:23 KST, PR #106 머지).**
**선행 의존 — 해소됨**: claude.ai 루틴 지침을 새 문안으로 교체 완료(2026-08-27 05:04Z, 메인 루프가
`RemoteTrigger update`로 실행). 다음 원격 실행부터 `[claude][진행]` 코멘트가 쌓이므로 아래 running
줄들이 관측 가능해졌다 — **실행 버튼을 한 번 누르면 대부분 함께 닫힌다.**

- [ ] `running` pill 실표시 — 파랑 점 + `animate-pulse` + "진행 중 · N분째"(N=0이면 "진행 중"). `motion-reduce` 정지
- [ ] 실행 로그(`ProgressLog`) 실화면 — 단계 줄이 pill 아래로 누적, 마지막 단계만 `text-foreground` 대비, `items-end` 우측 정렬, `<ol>` 스크린리더 순서
- [ ] 버튼 잠금/해제 전환 — awaiting·running에서 회색 비활성, responded·idle·silent에서 다시 활성(재전송 경로 유지)
- [ ] `RUNNING_STALE`(10분) 오경보 여부 — 실제 루틴 진행 코멘트 간격이 전제(≤4분·커밋 직전 코멘트)를 지키는지. 어긋나면 정상 실행이 `silent`로 잘못 넘어간다 → 결함 시 백로그 이관
- [ ] 진행 코멘트 도입 후 기존 상태 회귀 없음 — pm-select류 짧은 실행에서 awaiting→responded 정상

## BUG-07 — 폰 배너 라벨 판독 불가(라벨 분리) (admin, 구현 2026-08-27)

원천: `docs/agents/admin-dev/BUG-07.md` 「못 덮는 범위」. **배포 완료(2026-08-27 10:28 KST, PR #105 머지).**
참고: FEAT-07 절 하단의 관찰(2026-08-24, 원장 밖 개선 후보)이 이 항목으로 구현됨.

- [ ] 폰 라벨 판독성 — 375px·320px에서 "당신의 책상"·부제가 고정 px(`text-sm`/`text-xs`)로 읽힘 (이전: 스케일 축소로 ≈7.8px/6.2px)
- [ ] 오버레이-배경 정렬 — `pl-[30.3%]`가 텍스트를 책상 프레임(x 57~117) 밖 원위치에 놓는지, 세로 중앙 정렬 자연스러운지 (375·320·데스크톱 세 폭 스크린샷)
- [ ] 데스크톱 회귀 없음 — 640px 콘텐츠 폭에서 이전 렌더(≈14.5px/11.6px)와 동등한 모양

## FEAT-22 — 보드 읽기 raw CDN → contents API (admin, 구현 2026-08-26)

원천: `docs/agents/admin-dev/FEAT-22.md` 「못 덮는 범위」. **배포 완료(2026-08-27 10:28 KST, PR #105 머지).**
참고: 이 항목은 클린 패스 없이 게이트②가 열렸다(3사이클 정지 규칙 위 사용자 결정 — 잔여는
문서 위생 부류였고 조립·돌연변이·라이브 API 재생 증거는 3사이클 내내 유효).

- [ ] 도장 → 즉시 반영 — 게이트 도장 후 새로고침/refresh 시 실행 콘솔이 5분 대기 없이 새 status를 반영 (토큰 설정 배포, 데스크톱)
- [ ] 잠금 칩 새 문구 렌더 — 도장 후 "도장 찍음"(· 보드 반영 대기 없이), 반려 후 액션 낱말만
- [x] 게이트대기 설명 새 문구 — "결재함 항목에 도장을 찍으면 실행할 작업이 생깁니다."(최대 5분 문장 없음) — 확인(2026-09-04 09:08 KST, 자동 — GET /pipeline 200 · text 1/1 · notext 1/1)
- [ ] 토큰 부재 폴백의 5분 잔상 재발 성질 — 프로덕션 미경유(토큰 필수)라 확인 불요, 성질만 기록

## FEAT-21 — 번역 폴백 안내의 웹 절반 (web, 구현 2026-08-26)

원천: `docs/agents/web-dev/FEAT-21.md` 「못 덮는 범위」. **배포 완료(2026-08-26 08:14 KST, PR #103 머지).**

- [x] 정상 클립 카드 회귀 없음 — `확인(2026-08-26, 프로덕션 스윕 — 최신 재처리 업로드의 4카드 전부 안내 미표시, FEAT-16 근거 블록 정상 렌더. 상세 main-loop/FEAT-21.md)`
- [ ] 폴백 안내 실표시 — amber `AlertTriangle` + 문구. **배포만으론 확인 불가**: 기존 행은 NULL이고 새 클립은 번역이 실제 실패해야 값이 실린다. 확인 방법 둘 중 사용자 선택 — (a) 번역 실패 소스 실주행(L40S 과금·비결정적) (b) 기존 행에 폴백값 임시 주입 후 되돌리기(프로덕션 DB 쓰기)
- [ ] wire 왕복 — 백엔드 콜백 → 정규화 → 이벤트 → DB `subtitleStatus` 저장. 주의: 2026-08-26 00:22~00:32 실주행(재처리 1회 성공)은 **웹 배포(08:14) 전**이라 옛 웹이 값을 버렸다 — 다음 실사용은 배포 후여야 닫힌다

## BUG-02 — 번역 폴백 subtitleStatus 전달 (backend, 구현 2026-08-25)

원천: `docs/agents/backend-dev/BUG-02.md` 「못 덮는 범위」. **배포 완료(2026-08-25, BUG-03과 묶어
`modal deploy` — 사용자 승인 하에 메인 루프 실행, 6.7초 성공).** 잔여는 다음 실사용 실행에서 닫는다.

- [ ] 실제 Gemini 호출·예외 → except 배선과 튜플 언패킹 실동작 — 다음 실사용 업로드에서
- [ ] `subtitleStatus`가 실제 콜백 페이로드로 전달(정상 `"ok"`·실패 시 폴백값 관측) — 다음 실사용에서
- [ ] 컨테이너에서 `translation_fallback` import — **번들 자체는 배포 출력으로 실측**(`Created mount PythonPackage:s3_upload_policy, translation_fallback`), import는 다음 실행에서

## FEAT-20 — 게이트 카드 잠금(반영 대기 칩) (admin, 구현 2026-08-25)

원천: `docs/agents/admin-dev/FEAT-20.md`·계획서 「못 덮는 범위」. **배포 완료 — PR #102(2026-08-25)로 이미 합류·배포됐음. 이 머리말의 "⚠ 배포 전"은 낡은 기록이었고(아래 2026-08-25 LockedChip 실사용 관측이 증거) 2026-08-27 정정.**

- [ ] 잠금 공유 — 도장 성공 → 반려 패널도 사라짐 / 반려 성공 → 도장 버튼도 칩으로 (도장 쪽 절반은 2026-08-25 실사용에서 정황상 함께 발생 — 명시 관측은 다음 도장 때)
- [x] `LockedChip` 시각 — 확인(2026-08-25, **첫 실사용 관측**: FEAT-21 게이트① 도장 직후 소유자가 "도장 찍음 · 보드 반영 대기" 칩 등장을 직접 봄. 점 마커 4색 정밀 대비는 스크린샷 판정 승계)
- [ ] 실패는 잠그지 않음 — 스테일 실패 시 버튼 활성 유지·재시도 가능
- [ ] `router.refresh()` 후 잠금 유지 + 보드 flip 시 카드 소멸로 잠금 자연 소거
- [ ] 하드 리로드 시 CDN 창(≤5분) 동안 버튼 재노출(설계된 한계 — 서버 가드가 오커밋 차단)
- [ ] 서류철(doc-viewer) 게이트②에서 동일 잠금 동작

## BUG-03 — S3 업로드 재시도·맥락 오류 (backend, 구현 2026-08-25)

원천: `docs/agents/backend-dev/BUG-03.md` 「못 덮는 범위」. **배포 완료(2026-08-25, BUG-02와 묶어
`modal deploy` — 사용자 승인 하에 메인 루프 실행).** 잔여는 다음 실사용 실행에서 닫는다.

- [ ] 컨테이너에서 `s3_upload_policy` import — **번들 자체는 배포 출력으로 실측**(mount 생성), import는 다음 실행에서
- [ ] 재시도 실동작 — 분류 로직은 검증 라운드에서 boto3 재생으로 확인됨, 컨테이너 배선은 다음 실사용에서
- [x] `modal deploy` — 확인(2026-08-25: `App deployed in 6.706s`, process_video 웹 함수 등록). 업로드 경로 정상은 다음 실사용에서

## FEAT-18 — 대시보드 로스터 7인 동기화 (admin, 보드 2026-08-24 절)

원천: `docs/agents/admin-dev/FEAT-18.md` 「못 덮는 범위」. PR #101 합류(2026-08-24 12:24Z)로 배포 → 같은 날 재스윕.

- [x] 새 두 책상(backend-dev·plan-verifier)의 픽셀 SVG 실제 렌더 — 확인(2026-08-24 재스윕: 스프라이트·소품·명패 수납, 기존 5책상과 픽셀 일관)
- [x] 말풍선 색과 "검증 중"/"작업 중" 문구 — 확인(2026-08-24, 실보드 라이브: BUG-03 검토대기 파생으로 plan-verifier "검증 중", FEAT-20 계획지시로 admin-dev "작업 중" 동시 실렌더)
- [x] 폰 2열 / 데스크톱 flex-wrap에서 7책상 줄바꿈 — 확인(grid 143px×2·넘침 0·데스크톱 wrap 실측)
- [ ] backend-work 명령 버튼 — 렌더는 확인(backend-dev 책상 "작업 진행"), useTransition·토스트·GitHub POST는 클릭이 실제 코멘트라 실사용 시
- [x] 프로필 라우트 실개방 — 확인(2026-08-24: `/pipeline/agents/backend-dev` 상세 렌더 실측·`/pipeline/agents/plan-verifier` 개방. 합류 전 404 → 합류 후 200 전환 관측)
- [x] 새 hex 색의 픽셀 대비 — 확인(2026-08-24, 스크린샷 판정: 기존 팔레트와 일관·가독)

## FEAT-17 — 행위자 역할 정의 점진 공개 (admin, 보드 2026-08-23 절)

원천: `docs/agents/admin-dev/FEAT-17.md` 「테스트로 못 덮은 범위」. PR #101 합류로 배포 → 같은 날 재스윕.

- [x] `<details>` 실제 펼침/접힘, `+`→`×` 마커 회전, `list-none` — 확인(2026-08-24: backend-dev 프로필에서 10절 접힘·클릭 펼침·열림 시 `rotate: 45deg` 실측 — Tailwind v4가 `transform`이 아닌 `rotate` 속성으로 방출·네이티브 마커 없음)
- [ ] `hover:text-stamp`, `motion-reduce:transition-none`, 반응형 패딩 — 클래스 실재·렌더 정상 확인. hover 시각만 잔여
- [x] `dangerouslySetInnerHTML` 실제 렌더 모양 — 확인(2026-08-24: 역할 정의 본문 표·코드·강조 실렌더)
- [ ] 명조 디스플레이(`font-briefing-display`)의 폰 폴백 — Gowun Batang → 고딕(실기기 필요, FEAT-04와 동일 한계)

## FEAT-16 — 최종 클립에 선택 근거 저장·표시 (web, 보드 2026-08-20 절)

원천: `docs/agents/web-dev/FEAT-16.md`

- [x] `ClipCard` 선택 근거 블록 렌더·clamp 시각·`showRationale` 분기 — 확인(2026-09-04, 프로덕션 Playwright: 업로드 `cmsrlyh3u000zsi2c0f0adgae`의 4클립 카드 전부에 유형 라벨(`Insight`×3·`Q&A`×1) + hook + payoff 3요소가 렌더. clamp 시각은 스냅샷 텍스트 기준이라 줄수 판정은 미포함)

## FEAT-15 — 행위자별 상세 페이지 (admin, 보드 2026-08-20 절)

원천: `docs/agents/admin-dev/FEAT-15.md` 「못 덮는 범위」

- [x] `/pipeline/agents/[agent]` 실제 진입 — `requireAdmin`·`notFound`·docs 라우트 공존 — 확인(2026-08-24, Playwright: pm 진입 렌더·roster 밖 backend-dev 404·`/pipeline/docs/**` 나란히 동작·비로그인 시 /login 리다이렉트)
- [x] `AgentProfile` 렌더 — 확인(2026-08-24: 렌더·빈 상태("아직 기록이 없습니다")·GFM 실측 + `.doc-prose` 시각 스크린샷 판정 합격. `Link` 클릭 경유만 실사용 시 자연 확인)
- [ ] pixel-office 책상 `Link` hover 들림·접근명·중첩 인터랙티브(명령 버튼과 링크 분리)
- [x] raw CDN이 `dev` 브랜치 `.claude/agents/*.md`를 실제로 서빙하는지 — 확인(2026-08-24, curl 200: backend-dev.md·plan-verifier.md)

## FEAT-14 — 대시보드 내부 문서 뷰어 (admin, 보드 2026-08-19 절)

원천: `docs/agents/admin-dev/FEAT-14.md` 「테스트로 못 덮은 범위」

- [x] `DocViewer` 렌더 — 확인(2026-08-24: FEAT-16 계획서 h1+prose 18블록+형제 탭 3 실측 + 시각 판정 합격 — 명조 제목·오커 인용·모노 코드·서류철 탭 활성·375px 래핑 정상)
- [x] `next/link` 카드 링크 네비게이션·`DocLinks` 렌더 — 확인(2026-08-24 재스윕: BUG-03 카드 "계획서 →" 클릭 → 뷰어가 방금 푸시된 계획서 렌더)
- [x] 실제 raw CDN fetch·contents API 응답 — 확인(2026-08-24: 문서 본문 렌더=raw fetch 실동작, 책상 "기록 N건"=contents API 실동작)
- [x] 배포 후 smoke 목적지 1~6 — 확인(2026-08-24: 인가 보호·plan 렌더·행위자 기록 렌더·화이트리스트 밖 404·카드 링크 경유·게이트 가시성(BUG-03 검토대기 카드에 구현승인 도장+검증 전 칩 노출) 전부 관측)

제외: 헤더 게이트/반려 버튼 상호작용은 FEAT-08·09 절에서 관리(보고 스스로 승계 명시).
raw CDN 잔상(max-age=300)은 확인 항목이 아니라 수용된 트레이드오프(FEAT-10 결정 6).

## FEAT-13 — 결재함 검증 통과 칩 (admin, 보드 2026-08-18 절)

원천: `docs/agents/admin-dev/FEAT-13.md`

- [x] `ValidationMark` 점선 「검증 전」 칩 + 검토대기 조건부 — 확인(2026-08-24, 실보드: BUG-03 검토대기 카드에 점선 칩 실렌더, 승인대기 BUG-02 카드엔 없음 — 조건부 양·음성 동시 관측)
- [x] `ValidationMark` 실선 「검증 통과」 칩·`title` 툴팁 — BUG-03 검증 클린 패스 후 보드에 `검증:` 줄이 생기면 자연 확인 — 확인(2026-09-06 09:06 KST, 자동 — GET /pipeline 200 · text 2/2)

## FEAT-12 — 보드 감압·행위자 보고서 표시 (admin+루트 문서, 보드 2026-08-18 절)

원천: `docs/proposals/completed/2026-08-18-board-decompression-and-agent-reports.md` 「못 덮음」

- [x] `getAgentReports`·`getAgentReportIndex` 실제 fetch·404→빈 목록 분기·토큰 유무 분기 — 확인(2026-08-24: 책상 "기록 5건/1건" 실표시, pm 프로필 "아직 기록이 없습니다"=폴더 부재의 빈 목록 처리)
- [x] `BudgetFlag` 시각 — 확인(2026-08-24: 보고 피드에 "150자 초과" 칩 다수 실렌더, 툴팁 문구 포함)
- [x] `DeskReports` 렌더·`<details>` 펼침 — 대체(FEAT-14가 책상을 "기록 N건" 문구로, FEAT-15가 클릭을 행위자 상세 페이지로 교체 — 그 details 표면 자체가 더는 없음. 2026-08-24 실측: 책상엔 문구뿐)

## FEAT-10 — 동적 실행 콘솔·진행 pill (admin, 보드 2026-08-16 절)

원천: 보드 FEAT-10 `결과`(구현 보고 이전 관행)

- [x] `PipelineRunControl` 폴링·disabled — 확인(2026-08-24: 35초 관찰 콘솔 에러 0, 여집합(게이트대기만) 보드에서 비활성 "진행할 작업 없음"+게이트대기 설명+"보드 반영까지 최대 5분" 카피·pill "최근 요청 없음" 실렌더 — 계획서 결정 사슬대로)
- [ ] 실행 버튼 useTransition·토스트 — 클릭이 실제 이슈 #87 코멘트라 스윕 제외. 다음 실사용 시 확인
- [ ] `ProgressPill` 다섯 상태 시각 — idle만 관측(2026-08-24). 요청 보냄/응답 옴/무응답의 점 색·awaiting 맥박·`motion-reduce`는 실제 명령이 돌 때 확인
- [x] 헤더 `flex-wrap` 반응형·설명 `max-w-64` — 확인(2026-08-24, 스크린샷 판정: 데스크톱 우측 정렬 폭 제한 래핑·폰 세로 배치 정상)
- [ ] `per_page=100` 상한(바쁜 창에서의 실동작)

제외: 폴링 race는 제어흐름 재현으로 검증 시 확인됨. CDN 잔상은 결정 6(범위 밖·후속 항목).

## FEAT-09 — 결재함 반려 세 갈래 (admin, 보드 2026-08-16 절)

원천: 보드 FEAT-09 `결과`

- [ ] `commitBoardEdit` GET/PUT·base64·sha 409·`commitRejectTransition` action 분기 — 실제 GitHub 상대 왕복 (반려 실사용 시 확인)
- [ ] `RejectActions` useState/useTransition/toast/router.refresh·여백 펜 메모 시각(평평·산세리프·회색 접힘) — 여백 펜 메모 시각은 스크린샷 판정 합격(2026-08-24: 도장과 형태 대비되는 평평한 회색 "반려"). 잔여: 클릭 동작
- [ ] 폐기 확인 잉크 oklch(0.50 0.20 27) 12px AA 실측·마커 3:1
- [ ] `requireAdmin` 차단 경로

## FEAT-08 — 게이트 도장 버튼 (admin, 보드 2026-08-16 절)

원천: 보드 FEAT-08 `결과`

- [x] 도장 커밋 왕복 — 확인(2026-08-24, 실사용: BUG-03 게이트① 도장 → 커밋 `f028537`, status 1줄 최소 diff 실측. 잔여 이론 분기: sha 409 경합·토큰 미설정 토스트 — 미발생, 발생 시 확인)
- [x] `GateTransitionButton` useTransition·toast — 확인(2026-08-24, 실사용: 소유자가 성공 토스트 관측. router.refresh는 CDN 잔상 탓에 화면 무변화가 설계된 정상 동작)
- [ ] 도장 임프린트 시각(테두리·hard 그림자·hover 들림·active 눌림)·라벨 잉크 5.20:1 실화면·세리프 폴백(폰) — 임프린트 렌더·라벨 가독은 스크린샷 판정 합격(2026-08-24). 잔여: hover 들림·active 눌림(정적 스크린샷으로 불가)·폰 실기기 세리프 폴백
- [x] 투영 지연 체감(raw CDN 잔상) — 확인(2026-08-24, 실사용: 도장 후 "토스트만 뜨고 화면 무변화"를 소유자가 그대로 체감 — FEAT-10이 안내 카피까지 만든 설계된 트레이드오프)

관찰(2026-08-24, 실사용 발견 → 백로그 FEAT-20 이관): 성공 후에도 도장·반려 버튼이 잔상 5분 동안
활성으로 남아 재클릭을 유도한다. 재클릭 자체는 서버 스테일 가드가 거부(데이터 안전, 실측 커밋 1건).

## FEAT-07 — 픽셀 사무실 (admin, 보드 2026-08-15 절)

원천: 보드 FEAT-07 `결과`

- [x] SVG 렌더·`crispEdges` 선명도·격자/말풍선/명패 기하·명패 폭 초과 — 확인(2026-08-24, **승인 시안 v7(`docs/design/FEAT-07/pixel-office-mock.html`)과 실물 대조**: 그림체·말풍선·명패·기하 일치, 픽셀 선명, 명패 폭은 시안 ⑥이 "책상보다 넓어도 허용")
- [x] 반응형 배치(폰 2열/데스크톱 flex-wrap, 5책상) — 대체(FEAT-18이 7책상 기준으로 재선언). 참고: 5책상 폰 2열은 2026-08-24 실측 확인(grid 150.5px×2·가로 스크롤 0)
- [x] 방 배경(벽·걸레받이·체커 바닥·화분·액자)·명령 버튼 픽셀 스타일 — 확인(2026-08-24, 시안 v7 대조 일치)
- [ ] 책상 명령 버튼 5종 — `PipelineCommandButton` useTransition/토스트·`postPipelineCommand` GitHub POST (클릭이 실제 코멘트라 스윕 제외 — 실사용 시)

관찰(2026-08-24, 원장 밖 개선 후보): 폰에서 "당신의 책상" 배너 SVG가 비율 축소돼 라벨이 매우 작다.
시안 v7의 폰 데모에는 배너가 없어 계약 위반은 아님 — 개선 여부는 소유자 결정.

## FEAT-06 — 사무실 뷰·책상별 명령 (admin, 보드 2026-08-15 절)

원천: 보드 FEAT-06 `결과`. 전부 후속 항목이 화면을 교체했다.

- [x] `AgentCharacter` 플랫 SVG·포즈 기하·상태 채움색 — 대체(FEAT-07이 픽셀 그림체로 재작성, 포즈/tone-채움 시스템 제거)
- [x] `OfficeZone`/`OfficeDesk`·당신의 책상 서류 모티프·모바일 단일 컬럼 — 대체(FEAT-07 pixel-office 재구성)
- [x] `PipelineCommandButton`·`postPipelineCommand` 계열 — 대체(FEAT-07 절이 5책상 기준으로 재선언)

## FEAT-04 — 3구역 브리핑 개편 (admin, 보드 2026-08-14 절)

원천: 보드 FEAT-04 `결과`

- [x] `TeamZone` 캐릭터 발화 칩 렌더 — 대체(FEAT-06이 책상 세로 스택으로 교체)
- [x] `getPipelineBoard` raw fetch·`postPipelineCommand` POST·토스트 — 확인(2026-08-15, 원격 파이프라인 제안서 검증 ③ — 버튼→토스트→코멘트→`[claude]` 답글 전 구간 관측)
- [x] 결재함·보고 `<details>` 피드 펼침·모바일 단일 컬럼 — 확인(2026-08-24: "근거 보기" 펼침 실측·375px 가로 스크롤 0·단일 컬럼)
- [x] line-clamp·group-open·색토큰(stamp/stamp-soft/active/silence/hold/briefing)·디스플레이 세리프의 시각 결과 — 확인(2026-08-24, 스크린샷 판정: 세리프 디스플레이 헤딩·크림/브라운 토큰 일관·피드 줄임 정상)
- [x] 폰 세리프 고딕 폴백 전제(iOS·Android) — 대체(FEAT-17이 동일 한계 재선언)
- [ ] `requireAdmin` 차단 경로 — 비로그인 리다이렉트는 확인(2026-08-24). 잔여: 로그인했으나 ADMIN_EMAILS 밖 계정의 차단

## FEAT-03 — 파이프라인 대시보드 첫 판 (admin, 보드 2026-08-14 절)

원천: 보드 FEAT-03 `결과`

- [x] `queries.ts` raw fetch·`command-action.ts` 코멘트 POST·toast — 확인(2026-08-15, 원격 파이프라인 제안서 검증 ③ 전 구간 관측)
- [x] React 카드 렌더·useTransition — 대체(FEAT-04가 pipeline-page 재작성)
- [ ] `requireAdmin` 차단 경로 — FEAT-04 절과 동일 잔여

## FEAT-02 — 영상 길이 기반 클립 개수 상한 (web, 보드 2026-08-06 절)

원천: 보드 FEAT-02 `결과`

- [ ] DOM `<video>` 길이 측정과 업로드 UI — 상한 초과 옵션 비활성화·선택값 하향 클램프·안내 문구·상한 0일 때 업로드 차단 (web 로그인 세션 필요 — 미스윕)

## BUG-05 — 부분 생성 클립 전달 (web, 2026-08-05 커밋 1a38e1e — 보드 행 없음)

원천: `docs/plans/BUG-05.md` 「테스트」 절의 못 덮는 범위·수동 검증 시나리오

- [ ] 수동 검증 시나리오 — 3개 요청/2개 생성 상황에서 워커가 60분 소진 없이 S3 2개 확인 직후(최대 2m 유예) 탈출·클립 2개 노출·2크레딧 차감·상세 페이지 부분 안내 문구
- [ ] Inngest 워커 흐름과 DB 실효 — `processed` 전이·`lastSuccessfulAttempt`·`failureCode` 노트·`clipsFound` 차감
