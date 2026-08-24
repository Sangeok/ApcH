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
  - `확인(날짜, 근거)` — 사용자가 배포 화면에서 실물을 관측했거나, 실측 기록(Playwright 스윕 포함)이 있다.
  - `대체(항목ID)` — 후속 항목이 그 화면을 교체하거나 같은 확인을 재선언해 옛 줄이 무의미해졌다.
  - `이관(항목ID)` — 확인에서 결함이 나와 `TASK_BACKLOG.md` 항목이 됐다.
- **이 문서는 상태 문서다** — `PROJECT_BOARD.md`처럼 갱신하며 `docs/agents/`의 append-only
  규약을 따르지 않는다. 확인 활동의 상세는 `docs/agents/main-loop/`에 쓴다.
- 절은 항목별·최신순(보드 섹션 순서). 전부 닫힌 절도 지우지 않는다 — 닫혔다는 사실이 기록이다.
- 스윕 이력: 2026-08-24 1차(Playwright, admin 프로덕션 — 상세는 `docs/agents/main-loop/FEAT-19.md`).

---

## FEAT-18 — 대시보드 로스터 7인 동기화 (admin, 보드 2026-08-24 절)

원천: `docs/agents/admin-dev/FEAT-18.md` 「못 덮는 범위」
**⚠ 배포 전 — 프로덕션은 main 빌드(마지막 합류 PR #100)라 이 코드가 아직 없다(2026-08-24 실측: 책상 5개). dev→main 합류 후 확인 가능.**

- [ ] 새 두 책상(backend-dev·plan-verifier)의 픽셀 SVG 실제 렌더 — 스프라이트·ledger 소품 격자·명패 폭
- [ ] 말풍선 색과 "검증 중"/"작업 중" 문구의 시각 결과
- [ ] 폰 2열 / 데스크톱 flex-wrap에서 7책상 줄바꿈
- [ ] backend-work 명령 버튼 — useTransition·토스트·GitHub POST
- [ ] 프로필 라우트 실개방 — `/pipeline/agents/backend-dev`·`/pipeline/agents/plan-verifier` 라이브 fetch (2026-08-24 현재 404 — 배포 전이라 정상)
- [ ] 새 hex 색의 픽셀 대비

## FEAT-17 — 행위자 역할 정의 점진 공개 (admin, 보드 2026-08-23 절)

원천: `docs/agents/admin-dev/FEAT-17.md` 「테스트로 못 덮은 범위」
**⚠ 배포 전 — FEAT-18과 같음(2026-08-24 실측: pm 상세가 접힘 없는 전문 덤프로 렌더 = 이전 판).**

- [ ] `<details>` 실제 펼침/접힘, `+`→`×` 마커 회전(`group-open:rotate-45`), `list-none` 마커 숨김
- [ ] `hover:text-stamp`, `motion-reduce:transition-none`, 반응형 패딩(`sm:px-8`)
- [ ] `dangerouslySetInnerHTML` 실제 렌더 모양
- [ ] 명조 디스플레이(`font-briefing-display`)의 폰 폴백 — Gowun Batang → 고딕(FEAT-04와 동일 한계)

## FEAT-16 — 최종 클립에 선택 근거 저장·표시 (web, 보드 2026-08-20 절)

원천: `docs/agents/web-dev/FEAT-16.md`

- [ ] `ClipCard` 선택 근거 블록 렌더·clamp 시각·`showRationale` 분기 (web 로그인 세션 필요 — 미스윕)

## FEAT-15 — 행위자별 상세 페이지 (admin, 보드 2026-08-20 절)

원천: `docs/agents/admin-dev/FEAT-15.md` 「못 덮는 범위」

- [x] `/pipeline/agents/[agent]` 실제 진입 — `requireAdmin`·`notFound`·docs 라우트 공존 — 확인(2026-08-24, Playwright: pm 진입 렌더·roster 밖 backend-dev 404·`/pipeline/docs/**` 나란히 동작·비로그인 시 /login 리다이렉트)
- [ ] `AgentProfile` 렌더 — 렌더·빈 상태("아직 기록이 없습니다")·GFM(표·목록·코드)은 실측 확인(2026-08-24). `.doc-prose` 시각 인상·`Link` 이동 클릭은 스크린샷 판정·실사용 대기
- [ ] pixel-office 책상 `Link` hover 들림·접근명·중첩 인터랙티브(명령 버튼과 링크 분리)
- [x] raw CDN이 `dev` 브랜치 `.claude/agents/*.md`를 실제로 서빙하는지 — 확인(2026-08-24, curl 200: backend-dev.md·plan-verifier.md)

## FEAT-14 — 대시보드 내부 문서 뷰어 (admin, 보드 2026-08-19 절)

원천: `docs/agents/admin-dev/FEAT-14.md` 「테스트로 못 덮은 범위」

- [ ] `DocViewer` 렌더 — 구조는 실측 확인(2026-08-24: FEAT-16 계획서 h1+prose 18블록+형제 탭 3 렌더). 시각 스타일(명조 제목·표 하드라인·오커 인용·모노 코드)·반응형 판정은 스크린샷 대기
- [ ] `next/link` 카드 링크 네비게이션·`DocLinks` 렌더 — 목적지 라우트 동작은 확인(직접 URL 진입), 카드 클릭 경유는 미실행
- [x] 실제 raw CDN fetch·contents API 응답 — 확인(2026-08-24: 문서 본문 렌더=raw fetch 실동작, 책상 "기록 N건"=contents API 실동작)
- [ ] 배포 후 smoke 목적지 1~6 — 인가 보호(비로그인 리다이렉트)·plan 렌더·화이트리스트 밖 404(`/pipeline/docs/secrets/nope`)는 확인(2026-08-24). 잔여: 행위자 기록(report) 렌더·게이트 가시성(현재 보드에 검토대기 없음 — 조건 미충족)

제외: 헤더 게이트/반려 버튼 상호작용은 FEAT-08·09 절에서 관리(보고 스스로 승계 명시).
raw CDN 잔상(max-age=300)은 확인 항목이 아니라 수용된 트레이드오프(FEAT-10 결정 6).

## FEAT-13 — 결재함 검증 통과 칩 (admin, 보드 2026-08-18 절)

원천: `docs/agents/admin-dev/FEAT-13.md`

- [ ] `ValidationMark` 실물 렌더 — 실선 active 칩 vs 점선 hold 칩·`title` 툴팁·`flex-wrap` 반응형·토큰 시각 대비·검토대기에서만 렌더되는 조건부 (2026-08-24 스윕 시 보드에 검토대기 항목이 없어 조건 미충족 — 다음 검토대기 발생 시 확인)

## FEAT-12 — 보드 감압·행위자 보고서 표시 (admin+루트 문서, 보드 2026-08-18 절)

원천: `docs/proposals/completed/2026-08-18-board-decompression-and-agent-reports.md` 「못 덮음」

- [x] `getAgentReports`·`getAgentReportIndex` 실제 fetch·404→빈 목록 분기·토큰 유무 분기 — 확인(2026-08-24: 책상 "기록 5건/1건" 실표시, pm 프로필 "아직 기록이 없습니다"=폴더 부재의 빈 목록 처리)
- [x] `BudgetFlag` 시각 — 확인(2026-08-24: 보고 피드에 "150자 초과" 칩 다수 실렌더, 툴팁 문구 포함)
- [ ] `DeskReports` 렌더·`<details>` 펼침 (동일 네이티브 details 메커니즘은 결재함 "근거 보기"로 실측했으나 DeskReports 자체는 미클릭)

## FEAT-10 — 동적 실행 콘솔·진행 pill (admin, 보드 2026-08-16 절)

원천: 보드 FEAT-10 `결과`(구현 보고 이전 관행)

- [x] `PipelineRunControl` 폴링·disabled — 확인(2026-08-24: 35초 관찰 콘솔 에러 0, 여집합(게이트대기만) 보드에서 비활성 "진행할 작업 없음"+게이트대기 설명+"보드 반영까지 최대 5분" 카피·pill "최근 요청 없음" 실렌더 — 계획서 결정 사슬대로)
- [ ] 실행 버튼 useTransition·토스트 — 클릭이 실제 이슈 #87 코멘트라 스윕 제외. 다음 실사용 시 확인
- [ ] `ProgressPill` 다섯 상태 시각 — idle만 관측(2026-08-24). 요청 보냄/응답 옴/무응답의 점 색·awaiting 맥박·`motion-reduce`는 실제 명령이 돌 때 확인
- [ ] 헤더 `flex-wrap` 반응형·설명 `max-w-64` — 스크린샷 판정 대기
- [ ] `per_page=100` 상한(바쁜 창에서의 실동작)

제외: 폴링 race는 제어흐름 재현으로 검증 시 확인됨. CDN 잔상은 결정 6(범위 밖·후속 항목).

## FEAT-09 — 결재함 반려 세 갈래 (admin, 보드 2026-08-16 절)

원천: 보드 FEAT-09 `결과`

- [ ] `commitBoardEdit` GET/PUT·base64·sha 409·`commitRejectTransition` action 분기 — 실제 GitHub 상대 왕복 (반려 실사용 시 확인)
- [ ] `RejectActions` useState/useTransition/toast/router.refresh·여백 펜 메모 시각(평평·산세리프·회색 접힘) — 버튼 존재는 실측(2026-08-24 스냅샷), 시각·클릭은 대기
- [ ] 폐기 확인 잉크 oklch(0.50 0.20 27) 12px AA 실측·마커 3:1
- [ ] `requireAdmin` 차단 경로

## FEAT-08 — 게이트 도장 버튼 (admin, 보드 2026-08-16 절)

원천: 보드 FEAT-08 `결과`

- [ ] 도장 커밋 왕복 — contents API GET/PUT·base64·sha 409 분기·토큰 미설정 토스트 (다음 게이트 결정을 대시보드 도장으로 하면 자연 마감)
- [ ] `GateTransitionButton` useTransition·toast·router.refresh
- [ ] 도장 임프린트 시각(테두리·hard 그림자·hover 들림·active 눌림)·라벨 잉크 5.20:1 실화면·세리프 폴백(폰) — 버튼 렌더는 실측(2026-08-24 스냅샷 "계획지시"), 시각 판정은 스크린샷 대기
- [ ] 투영 지연 체감(raw CDN 잔상 — 커밋 성공 후 잠시 결재함에 남음, 성공 토스트가 결과 확정)

비고: FEAT-09 근거가 "게이트①을 도장 버튼으로 열 예정(첫 실측 겸)"이라 적었으나 실측 결과 기록을
찾지 못해 닫지 않았다 — 소유자가 실사용 기억으로 닫을 수 있다.

## FEAT-07 — 픽셀 사무실 (admin, 보드 2026-08-15 절)

원천: 보드 FEAT-07 `결과`

- [ ] SVG 렌더·`crispEdges` 선명도·격자/말풍선/명패 기하·명패 폭 초과 — 렌더 자체는 실측(2026-08-24: 5책상·말풍선 문구 정상), 선명도·기하 판정은 스크린샷 대기
- [x] 반응형 배치(폰 2열/데스크톱 flex-wrap, 5책상) — 대체(FEAT-18이 7책상 기준으로 재선언). 참고: 5책상 폰 2열은 2026-08-24 실측 확인(grid 150.5px×2·가로 스크롤 0)
- [ ] 방 배경(벽·걸레받이·체커 바닥·화분·액자)·명령 버튼 픽셀 스타일 — 스크린샷 판정 대기
- [ ] 책상 명령 버튼 5종 — `PipelineCommandButton` useTransition/토스트·`postPipelineCommand` GitHub POST (클릭이 실제 코멘트라 스윕 제외 — 실사용 시)

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
- [ ] line-clamp·group-open·색토큰(stamp/stamp-soft/active/silence/hold/briefing)·디스플레이 세리프의 시각 결과 — 스크린샷 판정 대기
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
