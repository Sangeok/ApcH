# FEAT-10: `/pipeline` 명령 버튼이 무엇을 실행하는지·지금 무엇이 도는지 보이게 — 라벨 명시화 + 실행 상태 표시

agent: admin-dev

> template.md의 절 구조를 따르되, **admin-dev 역할 규칙(UI 작업이면 디자인 방향을 절로 남긴다)**에 따라
> 「현재 동작」과 「문제」 사이에 `## 디자인 방향` 절 하나를 추가했다(FEAT-06/07/08/09 계획과 동일 구조).
> 이 항목은 헤더의 정적 「파이프라인 실행」 버튼을 **동적 실행 콘솔**(동적 라벨 + 설명 + 진행 pill)로
> 승격하고, 도장 직후 안내를 얹는 UI 변경이므로 방향의 임무는 새 화면 제안이 아니라 그 콘솔의 명세다.

## 현재 동작

`/pipeline`은 dev 브랜치 `PROJECT_BOARD.md`를 raw CDN으로 투영해 브리핑을 렌더하고, 헤더의 「파이프라인 실행」 버튼이 이슈 #87에 고정 명령을 게시한다. **버튼 라벨은 정적이고, 실행 후 화면은 토스트 한 번 외엔 아무 말도 하지 않는다.**

- `app/pipeline/page.tsx:17-29`이 `requireAdmin()` → `getPipelineBoard()` → `buildBriefing(sections, new Date())`로 브리핑을 만들어 `<PipelineBriefing>`에 넘긴다. `dynamic = "force-dynamic"`(`:15`)이라 매 요청 재투영한다.
- `pipeline/queries.ts:6-13` `getPipelineBoard()`는 `BOARD_RAW_URL`(`github.ts:7`, `raw.githubusercontent.com` dev 브랜치)을 `cache: "no-store"`로 fetch한다. **읽기 전용 · 토큰 불필요 · CDN 경유(캐시 수 분).**
- `pipeline/briefing.ts:187-206` `buildBriefing`은 `flatten(sections)`(`:33-47`, 같은 ID는 최신 행만 남기는 dedupe)으로 `items`를 만든 뒤 `inbox`/`team`/`feed`를 도출해 `Briefing`(`:22-28`, `today`·`pendingCount`·`inbox`·`team`·`feed`)을 낸다. **각 항목의 `status`를 이미 손에 쥐고 있으나, "지금 실행하면 무슨 일이 일어나는지"를 도출하는 함수는 없다.**
- `pipeline/board.ts:4-13` `BoardItem`은 `id`·`status`(`string | null`)·`agent`·`title` 등을 담는다. `parseBoard`(`:24-95`)가 이를 채운다.
- `ui/pipeline-page.tsx:39-57` `BriefingHeader`가 좌측 제목 블록과 우측 실행 버튼을 `flex items-start justify-between`(`:41`)으로 배치한다. 버튼은 **정적**이다: `<PipelineCommandButton command="pipeline-run" label="파이프라인 실행" />`(`:55`). 라벨 `"파이프라인 실행"`은 하드코딩이다.
- `ui/pipeline-command.tsx:10-42` `PipelineCommandButton`은 `"use client"`로 `useTransition`(`:19`) + `postPipelineCommand`(`:23`) + 토스트(`:24-29`). 성공 토스트는 고정 문구 `"실행 요청을 보냈습니다 (이슈 #87)"`(`:28`), 이후 화면 갱신 없음. pending이면 `"요청 중..."`(`:39`). 이 컴포넌트는 사무실 책상 명령(`pixel-office.tsx:150-154`)에도 쓰인다.
- `pipeline/commands.ts:3-32`이 보안 경계다. `pipeline-run` 본문(`:18-19`)은 **고정 문자열**("파이프라인을 진행해 주세요. … 게이트 전이(계획지시·구현승인)는 사용자 몫이므로 바꾸지 마세요.")이고, `resolvePipelineCommand(key)`(`:27-32`)는 `Object.hasOwn`으로 화이트리스트를 검사해 밖이면 `null`. **클라이언트가 보내는 것은 key뿐, 본문은 서버가 정한다.**
- `pipeline/command-action.ts:18-56` `postPipelineCommand(command)`가 `requireAdmin()`(`:22`, try 밖 최상단) → `resolvePipelineCommand`(`:25`, 밖이면 `failure`) → 토큰 확인(`:30-33`) → `ISSUE_COMMENTS_URL`(`github.ts:8`)로 코멘트 POST(`:36-45`). 본문 계약(`:11-16` 주석): webhook은 이슈 #87의 새 코멘트에 발화하고 루틴이 **작성자=소유자 + `"[claude]"` 미시작**으로 명령을 거른다. 즉 명령 코멘트는 `[claude]`로 시작하지 않는다.
- `ui/pipeline-gate.tsx:19-53` `GateTransitionButton`(FEAT-08)은 도장 성공 후 `toast.success(\`${label}로 넘겼습니다\`)`(`:38`) + `router.refresh()`(`:39`). **결정(보드 커밋) 후 "다음에 무엇을 하라"는 안내가 없다.** `label`은 찍힌 목표 status(`계획지시`/`구현승인`)다(`pipeline-page.tsx:94, 113-118`).
- `github.ts:8` `ISSUE_COMMENTS_URL = https://api.github.com/repos/Sangeok/ApcH/issues/87/comments`. 저장소는 public(`:1` 주석 "좌표는 비밀이 아니다").
- `env.js:37-43` `GITHUB_PIPELINE_TOKEN: z.string().optional()`. 주석은 두 쓰기 용도(이슈 코멘트 POST · 보드 커밋 PUT)만 설명한다.
- 인가 3중 방어선(`CLAUDE.md:72-84`): `auth/config.ts` signIn · `config.edge.ts` authorized · `guard.ts:7-27` `requireAdmin()`(세션 읽기 + `ADMIN_EMAILS` 재검사, DB 무접근, 실패 시 `redirect`/`notFound` throw, 반환 `{userId,email}`).
- 브리핑 tone→색 토큰(`globals.css:83-90`): `--stamp`(오커) · `--active`(파랑 `oklch(0.5 0.09 250)`) · `--silence`(완료 회녹 `oklch(0.58 0.008 80)`) · `--hold`(주황 `oklch(0.5 0.13 42)`) · `--briefing`(배경). `@theme inline`(`:38-41`)이 `--color-active`/`silence`/`hold`로 노출해 `bg-active`·`text-active` 등이 쓰인다. 서체 `--font-briefing-display`(`:11-12`, Gowun Batang 세리프).
- `pipeline-page.tsx:1`은 `"use client"`가 없다 — **서버 컴포넌트**다. 순수 함수를 렌더 시점에 호출할 수 있고, 클라이언트 leaf(`PipelineCommandButton`·`GateTransitionButton`)를 조립한다.
- 타입: `noUncheckedIndexedAccess: true`(`CLAUDE.md:52`). 인덱스·`Record<string,…>` 접근은 `… | undefined`, `RegExpExecArray` 캡처도 그렇다 — FEAT-03 파서가 여기서 `check`에 걸렸다.

## 디자인 방향

_(실행 콘솔의 판단 근거. 새 화면이 아니라 기존 브리핑 세계에 헤더 우측 콘솔 하나를 심는 것이므로 방향은 그 요소에 집중한다.)_

**대상 세계 (기존 세계의 연장).** FEAT-04~09가 이 화면을 "당신의 책상 — 도장을 기다리는 결재함 + 픽셀 사무실 + 보고"의 브리핑 세계로 확정했다. 이번 항목이 손대는 곳은 그 세계의 **실행 손잡이**다 — 결재함의 도장(결정)과 구분되는, "출근시켜 일을 돌리는" 스위치. 새 은유를 들이지 않는다. 결재함이 양피지·도장(관인)이라면 실행 콘솔은 **관제(管制) 계기판** — 스위치 하나와 그 옆에서 깜빡이는 신호등이다.

**팔레트 (신규 토큰 없음).** 브리핑 tone 토큰(`globals.css:83-90`)을 그대로 재사용하고, 진행 상태를 tone에 의미론적으로 매핑한다:
- **awaiting(요청 보냄·대기)** → `--active`(파랑). "지금 돌고 있다"의 강조색.
- **responded(응답 옴)** → `--silence`(완료 회녹). 브리핑 규칙 "완료=침묵"(`globals.css:83`)을 잇는다 — 답글이 왔으니 조용해진다.
- **silent(오래 무응답)** → `--hold`(주황). "확인하라"는 주의색. **`--destructive`(빨강)를 쓰지 않는 이유**: 답글이 늦게 올 수도 있어(실측 23분 사례) 실패 단정이 아니라 점검 신호다.
- **idle/unknown** → `--muted-foreground`.
새 CSS 토큰·서체를 만들지 않는다.

**타이포 역할 (신규 서체 없음).** 실행 버튼은 **결재함 도장과 의도적으로 대비**한다 — 도장 버튼은 `font-briefing-display`(세리프, 관인)이지만 실행 버튼은 앱 기본 `Button`(산세리프)이다. 결정(세리프·의례)과 실행(산세리프·조작)을 서체로 가른다. 버튼 아래 설명·pill은 `text-xs text-muted-foreground`(기존 메타 텍스트와 동일 급).

**레이아웃 개념 — 실행 콘솔 클러스터.** `BriefingHeader`(`pipeline-page.tsx:39-57`) 우측의 단일 버튼을 세로 스택 콘솔로 바꾼다. 배치 변화 최소, 인지 연속성 최대 — 사용자의 눈이 이미 실행 버튼을 찾는 그 자리에 스위치·설명·신호가 수직으로 쌓인다.

```
좌측 제목 블록                          우측 실행 콘솔
┌──────────────────┐        ┌───────────────────────────┐
│ 파이프라인 브리핑    │        │  [ FEAT-09 계획서 작성 ]     │ ← 동적 라벨(산세리프 버튼)
│ 8월 17일           │        │  실행하면 FEAT-09 계획서 작성  │ ← 설명(xs, muted)
│ 결정 대기 1건       │        │  작업을 진행합니다.           │
└──────────────────┘        │  ● 요청 보냄 · 1분째 응답 대기 │ ← 진행 pill(시그니처)
                            └───────────────────────────┘
```

- **반응형**: `<header>`에 `flex-wrap`을 더해 폰에서 콘솔이 제목 아래로 접힌다(가로 스크롤 없음). 콘솔은 `items-end`로 우측 정렬, 설명은 `max-w-64 text-right`.
- **비활성 상태**: 진행할 작업이 없으면 버튼은 `disabled`(라벨 `"진행할 작업 없음"`), 설명이 다음 행동을 가리킨다("결재함 항목에 도장을 찍으면 …"). 게이트대기가 이유일 때는 **투영 지연도 함께 말한다** — 방금 도장을 찍었다면 raw CDN(`max-age=300` 실측) 때문에 최대 5분간 보드가 옛 상태로 보이고 그동안 이 버튼은 비활성이다.

**시그니처 요소 — 진행 pill(라이브 신호등).** 이 화면이 FEAT-10으로 기억될 한 요소이자 **무게중심(관측 3)**의 해답. 1~2분(실측 최대 23분)의 "깜깜한 창"을 눈에 보이는 심장박동으로 바꾼다. **색은 점(비텍스트, 3:1 기준)이 나르고, 상태 낱말이 함께 말한다(색 단독 전달 금지)** — 결재함의 여백 펜 메모(`pipeline-reject.tsx:110-113`, 마커 점 + 낱말)와 같은 접근이라 12px AA 대비 문제를 우회한다(점은 장식, 텍스트는 `text-foreground`/`text-muted-foreground`로 안전).

```
awaiting  ● 요청 보냄 · N분째 응답 대기     (파랑 점, 은은한 맥박)
          ● 요청 보냄 · 응답 대기           (N=0일 때. "0분째"는 어색하다)
responded ● 응답 옴                        (회녹 점, 정지)
silent    ● 무응답 N분 · 이슈 #87 확인       (주황 점, 정지)
idle      ● 최근 요청 없음                   (회색 점)
unknown   ● 진행 상태 확인 불가              (회색 점)
```

- **모션 — 목적 있는 한 곳뿐.** awaiting 점만 `animate-pulse`(Tailwind 내장) + `motion-reduce:animate-none`. FEAT-07이 "상시 애니메이션 없음"을 정했지만, 여기 맥박은 **관측 3의 문제 그 자체를 푼다** — "돌고 있는가"를 침묵이 아니라 박동으로 답한다. responded/silent/idle은 정지(더 이상 대기 아님). 신규 keyframe 불필요 → `globals.css` 무변경.
- **접근성 바닥.** 실제 `<button>`(키보드·`useTransition`), pending은 `"요청 중..."` 텍스트로 알린다. 실패는 토스트로 사유를 말한다(조용한 실패 금지). pill 상태는 낱말과 색 둘 다로 전한다.
- **pill이 말하는 범위는 버튼이 아니라 채널이다.** 이슈 #87에 나가는 명령은 헤더 실행만이 아니다 — 사무실 책상 다섯 개도 같은 경로로 명령을 게시한다(`pixel-office.tsx:150`이 `PipelineCommandButton`을 쓰고, 본문은 전부 `commands.ts`의 비-`[claude]` 화이트리스트다). `deriveProgress`는 그것들도 명령으로 세므로, 책상 버튼을 눌러도 이 pill이 반응한다. **의도된 동작이다** — pill은 "이 채널에 답 없는 요청이 있나"를 말하지 "헤더 버튼이 낸 요청"만 말하지 않는다. 그래서 문구도 채널 말투다(`최근 요청 없음`·`이슈 #87 확인`). 두 가지 귀결: (1) 라벨은 `pipeline-run`이 할 일을, pill은 채널 전체를 말하므로 **둘이 같은 대상을 가리키지 않을 수 있다**. (2) 책상 버튼에는 클릭 직후 즉시 갱신이 없어 최대 15초(다음 폴) 뒤에 pill이 반응한다 — 헤더 버튼만 즉시 갱신한다.

**도장 직후 안내 (카피).** 결재함 도장 성공 토스트에 다음 행동을 잇는다 — `계획지시로 넘겼습니다. 보드에 반영되면 파이프라인 실행을 눌러 계획서를 받으세요.` **결정(보드 커밋)과 실행(세션)이 별개**임을 말이 명시한다. FEAT-08이 기각한 자동 게시와 다르다 — 자동으로 잇지 않고 **다음 손잡이를 가리킬 뿐**, 클릭은 여전히 사용자 몫이다. 어휘 일관성: 버튼 라벨 `계획서 작성` → 도장 안내 `계획서를 받으세요` → 실행 후 pill `응답 옴`.

**"이제"가 아니라 "보드에 반영되면"인 이유(검증에서 잡힌 모순).** 도장은 보드를 **커밋**하지만 이 화면의 투영은 raw CDN이고 그 캐시는 `max-age=300`(실측)이다. 그래서 도장 직후 최대 5분간 화면은 옛 보드를 읽고, 동적 라벨은 그 보드에 actionable이 없다고 판단해 **버튼을 비활성으로 만든다.** 토스트가 "이제 …실행을 누르세요"라고 하면 **누르라는 버튼이 회색인 채로 있고**, 설명은 "결재함 항목에 도장을 찍으면 …"이라 방금 찍은 도장을 또 찍으라고 말한다 — 관측 1이 지목한 "무엇을 해야 할지 모르겠다"를 이 화면이 새 모양으로 재현하는 셈이다. 그래서 (1) 토스트는 조건을 말하고, (2) 게이트대기 설명은 반영 지연을 함께 말한다. 결정 6(투영 이관은 범위 밖)을 유지하면서 그 대가를 **화면이 설명하게** 만드는 것이 이 항목의 성격에 맞다.

## 문제

백로그 `source`(요구 원천, `TASK_BACKLOG.md:66-79`)가 지목한 **관측 셋**과 코드에서 확인한 것:

1. **도장 후 화면 무변화** — 결정(보드 커밋)과 실행(세션)이 별개인데 화면이 그 구분을 말하지 않는다. `GateTransitionButton`(`pipeline-gate.tsx:38`)은 `"…로 넘겼습니다"`만 말하고 다음 행동을 안내하지 않는다. 여기에 raw CDN 지연(`queries.ts:8`)이 겹쳐 status 변화조차 즉시 안 보인다.
2. **「파이프라인 실행」 라벨이 무슨 process인지 안 말해준다** — 라벨은 하드코딩(`pipeline-page.tsx:55`)이고, 실제 동작은 보드 상태에 따라 다르다(계획지시면 계획서 작성, 구현승인이면 구현, 없으면 no-op).
3. **실행 후 돌고 있는지 모른다(무게중심)** — 토스트 한 번(`pipeline-command.tsx:28`)이 전부고, 원격 세션이 1~2분(실측 최대 23분) 도는 사이 화면은 침묵한다. **관측된 실패**: 연속 클릭 시 뒤 명령이 답글 없이 삼켜졌던 일(2026-08-15) — 화면만으론 성공과 구분 불가.

아래는 백로그가 "구체안은 계획에서 판단"이라 남긴 지점들의 **결정과 근거**다.

**결정 1 — 진행 신호원: ⓐ 이슈 #87 코멘트.** ⓐⓑⓒ를 `curl` 실측으로 비교했다(rate limit·작성자·`[claude]` 접두는 2026-08-16, 페이로드 크기는 2026-08-17 재측정):

| 신호원 | 인증·rate limit | 읽기 비용 | "이 명령이 처리됐나"를 답하나 | 삼킴(요구 4) 탐지 |
| --- | --- | --- | --- | --- |
| ⓐ 이슈 #87 코멘트 | 미인증 60/h(실측 `X-RateLimit-Limit: 60`) / 인증 5000/h | 1 GET(`since` 6h 창 → 실측 코멘트 1건당 약 4KB, 바쁜 창 8건이 30.4KB) | **예** — 명령/답글을 순서로 매핑 | **예** — 명령:답글 **짝짓기**로 판별(아래 주의) |
| ⓑ 보드 status(raw CDN) | 미인증(현 투영) | 이미 투영 중 | 아니오 — 게이트는 사용자 전이라 pipeline-run은 status를 안 바꾼다(no-op도 무변화) + CDN 지연 | 아니오 |
| ⓒ dev 새 커밋 | 미인증 60/h / 인증 | 1 GET | 부분 — 커밋≠명령 1:1, no-op 실행은 커밋 없음 | 아니오 |

**결정적 근거(실측)**: 명령 코멘트와 답글은 **둘 다 소유자 계정(`Sangeok`)으로 게시**된다(코멘트 12개 전부 동일 작성자). 유일한 구분자는 본문 **`[claude]` 접두** — 답글만 그것으로 시작하고, 명령은 시작하지 않는다(`command-action.ts:14-15` 계약과 대칭). ⓑⓒ는 삼킴을 못 잡고 CDN에 지연된다. **ⓐ만 채택.**

**주의 — "최신 명령 뒤에 답글이 있나"로 보면 안 된다(검증에서 잡힌 결함).** 그 모델을 실제 이슈 #87 스레드로 재생하면 **삼킴 사건 당시 `responded`(응답 옴)가 뜬다**: 2026-08-15에 명령 2건(14:50:53 pipeline-run, 14:52:14 pm-select)이 연속으로 나가고 답글 1건(14:52:31)이 달렸는데, 그 답글은 **앞 명령**의 것이었다. "최신 명령 뒤 답글 유무" 모델은 이를 "뒤 명령도 응답됨"으로 읽어, 삼켜진 명령에 초록 신호를 준다 — 요구 4가 없애려는 바로 그 상태(실패가 성공으로 보임)를 새로 만든다. 사용자가 15:07:30에 같은 명령을 다시 보낸 것이 삼킴의 증거다.

따라서 **짝짓기 모델**을 쓴다: 루틴 지침이 "명령 1건당 답글 1건"을 보장하므로, 답글 1건이 미응답 명령 1건을 **오래된 것부터(FIFO) 갚는다.** 갚히지 않고 남은 가장 오래된 명령이 곧 삼켜졌을 수 있는 것이고, 화면은 그 명령의 경과를 말한다. 같은 스레드를 이 모델로 재생하면 14:52:31에 `awaiting`, 15:07:30에 `silent(15분 · 이슈 #87 확인)`이 떠서 삼킴이 드러나고, 15:10:10에 답글 둘이 다 달린 뒤에야 `responded`가 된다. 백로그 요구 4가 "화면이 그 보장을 확인해 주지 않는다"고 지목한 것이 정확히 이 짝짓기다.

**결정 2 — 인증하여 읽는다(신규 권한 없음).** 폴링 15초 = 240 req/h인데 미인증 한도는 60/h(실측)라 부족하다. **기존 `GITHUB_PIPELINE_TOKEN`으로 인증**하면 5000/h(240/h 사용=4.8%)라 여유롭다. 그 토큰은 이미 Issues RW(FEAT-08 재발급)를 가지고, **코멘트 읽기는 Issues 권한에 포함**되므로 **새 PAT 권한이 필요 없다**(FEAT-08의 Contents RW 추가 같은 재발급 전제가 이번엔 없다). 토큰 미설정이면 미인증으로 시도하되 rate limit에 걸리면 pill이 `unknown`을 보인다.

**결정 3 — 갱신 방식: 클라이언트 폴링(15초), 페이지 열려 있는 동안.** 대안은 수동 새로고침(관측 3의 핵심이 "언제 새로고침할지 모른다"라 기각)과 서버 액션 응답 편승(코멘트 POST 응답은 "게시됨"만 알지 1~2분 진행을 못 알림, 기각). 폴링만이 깜깜한 창을 채운다. 주기 15초는 15,000ms 상수로 둔다 — 인증 시 240/h로 5000/h의 5% 미만, 반응은 충분. 진행 read는 **투영(보드)과 분리한 전용 서버 액션**(`getPipelineProgress`)이라 `router.refresh`로 보드 전체를 다시 읽지 않는다.

**결정 4 — 실패 가시성: 미응답 명령(FIFO 짝짓기) + 경과 임계.** 상태 다섯:
- **awaiting** — 미응답 명령이 남아 있고, 그중 **가장 오래된 것**의 경과 < 임계.
- **silent** — 미응답 명령이 남아 있고, 가장 오래된 것의 경과 ≥ 임계.
- **responded** — 미응답 명령 없음(창 안 명령이 전부 답글로 갚혔다). `sinceIso`는 최신 명령.
- **idle** — 창 안에 명령이 없다(답글만 있거나 비었다).
- **unknown** — 읽기 실패·시각 파싱 불가. 첫 폴 전 초기값이기도 하다.

경과를 **가장 오래된 미응답 명령**으로 재는 이유: 그것이 가장 오래 방치된 요청이고, 연속 클릭으로 두 건이 밀려 있을 때 뒤엣것의 짧은 경과에 가려지면 안 되기 때문이다(2026-08-15 사건에서 15:07 시점 `silent(15분)`이 나오는 근거).

**임계 = 3분(180,000ms).** 실측 정상 응답 간격은 0.3·0.7·0.9·2.6분이고 23분 이상치가 하나(2026-08-16). 정상 최대(2.6분) 바로 위인 3분을 경계로 잡으면 정상 실행 중엔 awaiting을 유지하고, 3분을 넘기면 "확인하라"를 띄운다(23분 사례는 3분부터 silent로 보이는 게 옳다 — 사용자가 스레드를 봐야 할 상황이었다). silent는 **실패 단정이 아니라 점검 신호**다.

**결정 5 — 도장 직후 안내: 다음 손잡이를 가리킨다(단, 조건을 붙여서).** 「디자인 방향」의 카피대로 도장 성공 토스트에 `gateNextActionHint(to)`를 잇는다. 자동 게시(FEAT-08 기각)와 달리 실행은 여전히 별개 클릭이다. 문구는 `"이제 …누르세요"`가 아니라 **`"보드에 반영되면 …누르세요"`**다 — 도장 직후 최대 5분(raw CDN `max-age=300` 실측)간 동적 라벨이 옛 보드를 읽어 버튼을 비활성으로 두기 때문이다. 같은 이유로 게이트대기 설명이 반영 지연을 함께 말한다(「디자인 방향」의 근거 참조).

**결정 6 — CDN 잔상: 이번 범위 밖(후속 항목).** 투영을 contents API로 옮기면 즉시 반영되나 모든 페이지 로드에 토큰·base64·rate limit이 붙는다(FEAT-08 계획서 「대안」 `docs/plans/FEAT-08.md:436`에 트레이드오프 기록). FEAT-10의 무게중심(관측 3)은 **투영과 별개인 코멘트 신호**로 풀리므로 — 진행 pill이 CDN을 타지 않고 수 초 내 갱신한다 — 투영 경로 이관을 이 항목에 묶지 않는다. 관측 1의 "도장 후 무변화"는 **결정 5의 안내 카피**(CDN·보드 flip과 무관하게 즉시 뜨는 문구)로 답한다. 다만 그 대가가 화면에 드러나므로 **감추지 않고 설명한다** — 도장 직후 최대 5분간 버튼이 비활성인 것은 이 결정의 직접적 귀결이고, 토스트와 게이트대기 설명이 그 이유를 말한다(검증에서 이 모순을 잡아 문구를 고쳤다). CDN 잔상 자체는 별도 항목으로 남긴다(「대안」·「못 덮는 것」 참조).

**불변식 유지(제약).** 라벨·설명·pill 문구는 전부 **표시용 문자열**이고 서버로 명령 본문으로 가지 않는다. 실행 버튼은 여전히 `postPipelineCommand("pipeline-run")` — **key만** 보내고 서버가 `commands.ts` 화이트리스트에서 고정 본문을 해석한다. **라벨만 동적, 본문은 불변**(아래 스케치 §4의 `handleClick` 주석에서 명시). DB 무접근·외부 쓰기 둘(코멘트 POST·보드 커밋 PUT) 유지 — 진행 read는 새 쓰기가 아니라 읽기다.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `src/pipeline/run-plan.ts` `(신규, 순수)` | `describePipelineRun(items)` → `RunPlan{enabled,label,description}`(동적 라벨, 전 경우 열거) + `gateNextActionHint(to)`(도장 직후 안내). 런타임 임포트 없음(`board.ts` 타입만). `run-plan.test.mjs`로 덮인다 |
| `src/pipeline/run-plan.test.mjs` `(신규)` | 라벨 전 경우(빈·게이트대기만·계획지시 단·구현승인 단·복수·null/미지 status·프로토타입 오염) + `gateNextActionHint` 3분기 |
| `src/pipeline/progress.ts` `(신규, 순수)` | `deriveProgress(comments, now)` → `ProgressState`(idle/awaiting/silent/responded/unknown, **FIFO 짝짓기**) + `SILENCE_THRESHOLD_MS`. `isReply`는 모듈 내부(export 안 함). 임포트 없음. `progress.test.mjs`로 덮인다 |
| `src/pipeline/progress.test.mjs` `(신규)` | 상태 도출(빈·답글만·명령 뒤 답글=responded·경과<임계=awaiting·≥임계=silent·**이중 명령+답글 1건=미응답 잔존**·창 밖 답글·임계 경계·분 계산·시각 파싱 불가) + `isReply` 접두 간접 확인 |
| `src/pipeline/progress-action.ts` `(신규, "use server")` | `getPipelineProgress()` — `requireAdmin()` → 이슈 #87 코멘트 GET(`since` 6h 창, 토큰 있으면 인증) → `deriveProgress`. 읽기 실패(전송·상태코드·**본문 파싱**)는 전부 `unknown` |
| `src/ui/pipeline-run-control.tsx` `(신규, "use client")` | `PipelineRunControl{plan}` — 동적 라벨 버튼(disabled 지원) + 설명 + `ProgressPill`(15초 폴링, **실패는 `unknown`으로 강등**). `postPipelineCommand("pipeline-run")` 고정 key |
| `src/pipeline/briefing.ts` `(수정)` | `Briefing`에 `plan: RunPlan` 추가, `buildBriefing`이 `describePipelineRun(items)`로 채움 |
| `src/pipeline/briefing.test.mjs` `(수정)` | 기존 BOARD 픽스처의 `plan` 배선 단언 1개 추가(기존 단언 불변) |
| `src/ui/pipeline-page.tsx` `(수정)` | `BriefingHeader`의 정적 버튼(`:55`)을 `PipelineRunControl`로 교체 + 헤더 `flex-wrap` + 미사용 `PipelineCommandButton` 임포트(`:8`) 제거 |
| `src/ui/pipeline-gate.tsx` `(수정)` | 도장 성공 토스트(`:38`)에 `gateNextActionHint(label)` 이음 |
| `src/env.js` `(수정, 주석만)` | 토큰 주석에 "(3) 진행 신호로 이슈 코멘트 읽기(선택·인증 시 rate limit 5000/h)" 명기. **스키마 불변**(optional 유지) |

여기 없는 파일은 고치지 않는다. `board.ts`·`queries.ts`·`commands.ts`·`command-action.ts`·`transitions.ts`·`commit-transition.ts`·`agents.ts`·`sprites.ts`·`pipeline-command.tsx`·`pixel-office.tsx`·`pipeline-reject.tsx`·`auth/**`·`middleware.ts`·`globals.css`는 건드리지 않는다(순수 계층·명령 화이트리스트·게이트/반려 경로·인가 3중 방어선·CSS 토큰은 변경 불필요). `apps/admin/CLAUDE.md`는 읽기 전용이라 「비고」로 갱신 행을 보고한다.

## 구현 스케치

### 1) `src/pipeline/run-plan.ts` (신규) — 동적 라벨 + 도장 직후 안내

`pipeline-run`이 실제로 진행시키는 status는 **계획지시·구현승인 둘뿐**(`commands.ts:18-19` "게이트 전이는 바꾸지 마세요" → 승인대기·검토대기는 사용자 게이트 대기, 완료·보류는 종료). 그 여집합은 전부 "진행할 작업 없음"이다.

멤버십 검사는 **반드시 `Object.hasOwn`**이다(`commands.ts:29`와 같은 원칙). 인덱스 접근 후 `undefined` 가드만으로는 **못 막는다** — 객체 리터럴은 `Object.prototype`을 물려받으므로 `RUN_ACTIONS["__proto__"]`는 `Object.prototype`을, `RUN_ACTIONS["toString"]`은 함수를 돌려준다. 둘 다 `undefined`가 아니라 가드를 통과하고, `action.verb`가 `undefined`가 되어 라벨에 새어 나온다. 검증에서 실측한 실제 출력이 `label: "FEAT-01 undefined 외 2건"`, 안내 문구가 `"…눌러 undefined 받으세요."`였다. status는 보드 텍스트에서 그대로 파싱되므로(`board.ts:22` `FIELD_RE`는 임의 문자열을 받는다) 이 경로는 실재한다.

```ts
// 순수. board.ts/commands.ts와 같은 이유로 런타임 임포트 없음(run-plan.test.mjs로 덮인다).
// 보드 상태 → "지금 실행하면 무슨 일이 일어나는지" 텍스트. pipeline-run(commands.ts:18-19)이
// 실제로 진행시키는 것은 계획지시→계획서 작성, 구현승인→구현뿐이다(그 명령이 "게이트 전이는
// 바꾸지 마세요"라 승인대기·검토대기는 사용자 게이트를 기다리고, 완료·보류는 종료다).
import type { BoardItem } from "./board";

// verb=버튼/설명 라벨, deliverable=도장 직후 안내의 목적어(조사 포함 — 계획서'를'/구현'을').
const RUN_ACTIONS: Record<string, { verb: string; deliverable: string }> = {
  계획지시: { verb: "계획서 작성", deliverable: "계획서를" },
  구현승인: { verb: "구현", deliverable: "구현을" },
};

const GATE_WAITING = new Set(["승인대기", "검토대기"]);

export type RunPlan = {
  enabled: boolean;
  label: string;
  description: string;
};

export function describePipelineRun(items: BoardItem[]): RunPlan {
  const actionable: { id: string; verb: string }[] = [];
  let hasGateWaiting = false;
  for (const it of items) {
    if (it.status === null) continue;
    // Object.hasOwn: commands.ts:29와 같은 원칙. 인덱스 접근 + undefined 가드만으로는
    // 못 막는다 — 객체 리터럴은 Object.prototype을 물려받아 "__proto__"·"toString"이
    // undefined가 아닌 값을 돌려주고, 그러면 verb가 undefined로 라벨에 새어 나온다.
    const action = Object.hasOwn(RUN_ACTIONS, it.status)
      ? RUN_ACTIONS[it.status]
      : undefined; // { verb, deliverable } | undefined
    if (action !== undefined) {
      actionable.push({ id: it.id, verb: action.verb });
    } else if (GATE_WAITING.has(it.status)) {
      hasGateWaiting = true;
    }
  }

  const first = actionable[0]; // BoardItem이 아니라 {id,verb} | undefined
  if (first === undefined) {
    return {
      enabled: false,
      label: "진행할 작업 없음",
      description: hasGateWaiting
        ? "결재함 항목에 도장을 찍으면 실행할 작업이 생깁니다. 방금 찍었다면 보드 반영까지 최대 5분 걸립니다."
        : "지금 파이프라인이 진행할 항목이 없습니다.",
    };
  }

  const head = `${first.id} ${first.verb}`;
  if (actionable.length === 1) {
    return {
      enabled: true,
      label: head,
      description: `실행하면 ${head} 작업을 진행합니다.`,
    };
  }
  const listing = actionable.map((a) => `${a.id} ${a.verb}`).join(", ");
  return {
    enabled: true,
    label: `${head} 외 ${actionable.length - 1}건`,
    description: `실행하면 ${listing} 작업을 진행합니다.`,
  };
}

// 도장(게이트 결정) 직후 안내 — 결정과 실행이 별개임을 말한다(FEAT-08 자동 게시 기각과 다른 접근).
// to는 방금 커밋된 목표 status(계획지시·구현승인). RUN_ACTIONS와 같은 어휘로 잇는다.
export function gateNextActionHint(to: string): string {
  // 여기도 Object.hasOwn — "toString"이 오면 deliverable이 undefined로 문구에 샌다.
  const action = Object.hasOwn(RUN_ACTIONS, to) ? RUN_ACTIONS[to] : undefined;
  return action === undefined
    ? "보드에 반영되면 파이프라인 실행을 눌러 다음 단계를 진행하세요."
    : `보드에 반영되면 파이프라인 실행을 눌러 ${action.deliverable} 받으세요.`;
}
```

**동적 라벨 전 경우(여집합 포함)** — `describePipelineRun`이 결정적으로 도출한다:

| 보드 상태 | enabled | label | description |
| --- | --- | --- | --- |
| 항목 없음 / 전부 완료·보류 | false | `진행할 작업 없음` | `지금 파이프라인이 진행할 항목이 없습니다.` |
| 게이트대기(승인대기·검토대기)만, actionable 0 | false | `진행할 작업 없음` | `결재함 항목에 도장을 찍으면 실행할 작업이 생깁니다. 방금 찍었다면 보드 반영까지 최대 5분 걸립니다.` |
| 계획지시 1건(예 FEAT-09) | true | `FEAT-09 계획서 작성` | `실행하면 FEAT-09 계획서 작성 작업을 진행합니다.` |
| 구현승인 1건 | true | `FEAT-09 구현` | `실행하면 FEAT-09 구현 작업을 진행합니다.` |
| 복수(예 계획지시+구현승인) | true | `FEAT-06 계획서 작성 외 1건` | `실행하면 FEAT-06 계획서 작성, FEAT-07 구현 작업을 진행합니다.` |

### 2) `src/pipeline/progress.ts` (신규) — 코멘트 → 진행 상태

명령/답글의 유일한 구분자는 본문 `[claude]` 접두(실측: 작성자는 둘 다 소유자). 코멘트 순서는 REST 문서상 **ID 오름차순** 보장이고 이슈 코멘트 ID는 생성 시점에 매겨지므로 생성순과 같다(실측 12건도 `created_at` 오름차순). 그래서 앞에서부터 훑으며 **답글 1건이 미응답 명령 1건을 오래된 것부터 갚는다**(결정 1의 짝짓기 모델 — "최신 명령 뒤 답글 유무"는 삼킴 사건에서 거짓 초록을 낸다).

```ts
// 순수. board.ts/commands.ts와 같은 이유로 임포트 없음(progress.test.mjs로 덮인다).
// 이슈 #87 코멘트에서 "요청→응답"을 도출한다. 명령 코멘트와 [claude] 답글의 유일한
// 구분자는 본문 "[claude]" 접두다 — 둘 다 소유자 계정으로 게시되므로 작성자로는 못 가른다
// (2026-08-16 실측: 코멘트 12개 전부 Sangeok, 답글만 [claude] 접두). command-action.ts:14-15의
// 계약(명령 본문은 [claude]로 시작하지 않는다)과 대칭이다.
export type CommentLite = { body: string; createdAt: string };

export type ProgressState =
  | { kind: "idle" }
  | { kind: "awaiting"; sinceIso: string; minutes: number }
  | { kind: "silent"; sinceIso: string; minutes: number }
  | { kind: "responded"; sinceIso: string }
  | { kind: "unknown" };

// 3분. 실측 정상 응답은 0.3~2.6분(2026-08-16), 그 위를 "오래 무응답"으로 본다.
// 실패 단정이 아니라 "이슈 스레드를 확인하라"는 신호다(답글이 늦게 올 수도 있다 — 실측 23분).
export const SILENCE_THRESHOLD_MS = 180_000;

function isReply(body: string): boolean {
  return body.trimStart().startsWith("[claude]");
}

export function deriveProgress(
  comments: CommentLite[],
  now: Date,
): ProgressState {
  // 짝짓기 모델. 루틴 지침이 "명령 1건당 답글 1건"을 보장하므로, 답글 1건이 미응답
  // 명령 1건을 오래된 것부터(FIFO) 갚는다. 갚히지 않고 남은 가장 오래된 명령이 곧
  // "삼켜졌을 수 있는" 그것이고, 화면은 그 명령의 경과를 말한다.
  //
  // "최신 명령 뒤에 답글이 있나"로 보면 안 된다 — 2026-08-15 실측 사건에서 답글 1건이
  // 명령 2건 뒤에 달렸고, 그 답글은 앞 명령 것이었다. 그 모델이면 삼켜진 뒤 명령에
  // "응답 옴"이 떠서 성공과 구분되지 않는다(요구 4가 없애려는 바로 그 상태).
  //
  // 코멘트 순서: REST 문서가 보장하는 것은 "ID 오름차순"이고, 이슈 코멘트 ID는 생성
  // 시점에 매겨지므로 곧 생성순이다(실측한 12건도 created_at 오름차순). 앞에서부터 훑는다.
  const unanswered: string[] = []; // 미응답 명령의 createdAt(오래된 순)
  let lastCommandIso: string | null = null;
  for (const c of comments) {
    if (isReply(c.body)) {
      unanswered.shift(); // 가장 오래된 미응답 명령을 갚는다(없으면 창 밖 명령의 답글 — 무시)
    } else {
      unanswered.push(c.createdAt);
      lastCommandIso = c.createdAt;
    }
  }

  const oldest = unanswered[0]; // string | undefined (noUncheckedIndexedAccess)
  if (oldest === undefined) {
    // 미응답 없음 — 창에 명령이 있었으면 전부 응답됐고, 없었으면 추적할 요청이 없다.
    return lastCommandIso === null
      ? { kind: "idle" }
      : { kind: "responded", sinceIso: lastCommandIso };
  }

  const elapsed = now.getTime() - Date.parse(oldest);
  if (Number.isNaN(elapsed)) return { kind: "unknown" }; // created_at 파싱 불가
  const minutes = Math.max(0, Math.floor(elapsed / 60_000));
  return elapsed >= SILENCE_THRESHOLD_MS
    ? { kind: "silent", sinceIso: oldest, minutes }
    : { kind: "awaiting", sinceIso: oldest, minutes };
}
```

### 3) `src/pipeline/progress-action.ts` (신규, `"use server"`) — 코멘트 read

`command-action.ts` 패턴: `requireAdmin()` 최상단. **읽기 전용**이라 새 쓰기 경로가 아니다. `since` 6시간 창으로 스레드가 커져도 페이로드가 작게 유지된다 — 실측(2026-08-17)으로 코멘트 1건당 약 4KB이고, 가장 붐볐던 구간을 포함해 8건을 받아도 30.4KB다(전체 12건은 42.3KB). 읽기 실패는 부가 신호이므로 `unknown`으로 조용히 물러난다(쓰기 실패와 달리 삼킬 write가 없다).

**`since`의 의미에 주의한다(검증에서 확인).** GitHub REST의 `since`는 **마지막 수정 시각** 기준이지 생성 시각이 아니다. 그래서 누군가 오래된 코멘트를 편집하면 그 코멘트가 **옛 `created_at`을 달고 창에 다시 들어온다.** 이미 답글로 갚혔지만 그 답글은 창 밖이므로 짝이 없어, 짝짓기 모델에서 미응답 명령으로 되살아나 `무응답 4320분` 같은 거짓 경보가 뜬다(실측 재현). 그러므로 받은 목록을 **`created_at`이 창 안인 것으로 한 번 더 거른다** — 창의 의미를 "최근 6시간에 생성된 것"으로 고정하는 세 줄이다.

```ts
"use server";

import { env } from "~/env";
import { requireAdmin } from "~/auth/guard";
import { ISSUE_COMMENTS_URL } from "./github";
import { deriveProgress, type ProgressState } from "./progress";

// 이슈 #87 코멘트를 읽어 진행 상태를 도출한다(요구 3·4 무게중심). 읽기 전용:
// 새 외부 쓰기가 아니다(쓰기는 여전히 코멘트 POST·보드 커밋 둘뿐).
const WINDOW_MS = 6 * 60 * 60 * 1000; // 6시간: 어떤 실행+임계보다 넉넉한 창

type RawComment = { body?: string; created_at?: string };

export async function getPipelineProgress(): Promise<ProgressState> {
  // 내부 대시보드 전용 + 우리 서버가 임의 폴링으로 GitHub 프록시가 되지 않게.
  await requireAdmin();

  const windowStart = Date.now() - WINDOW_MS;
  const since = new Date(windowStart).toISOString();
  const url = `${ISSUE_COMMENTS_URL}?since=${since}&per_page=100`;

  // 인증 이유(실측): 폴링 15s=240req/h인데 미인증 한도는 60/h(측정 X-RateLimit-Limit: 60).
  // 토큰(기존 Issues RW — 코멘트 읽기 포함)으로 인증하면 5000/h라 여유롭다. 새 권한 불필요.
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = env.GITHUB_PIPELINE_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  // fetch와 본문 파싱을 한 try에 둔다 — 파싱 실패(비정상 본문)도 읽기 실패이고,
  // 여기서 새어 나가면 클라이언트 폴링이 reject를 받아 pill이 얼어붙는다.
  let raw: RawComment[];
  try {
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) return { kind: "unknown" };
    raw = (await res.json()) as RawComment[];
  } catch (error) {
    console.error("Failed to read pipeline progress", error);
    return { kind: "unknown" };
  }
  if (!Array.isArray(raw)) return { kind: "unknown" };

  // GitHub의 `since`는 **마지막 수정 시각** 기준이다(생성 시각이 아니다 — REST 문서).
  // 그래서 오래된 코멘트를 편집하면 옛 created_at을 달고 창에 다시 들어오고, 이미 답글로
  // 갚힌 명령이 짝 없는 미응답으로 되살아나 "무응답 4320분" 같은 거짓 경보가 뜬다.
  // 창의 의미를 "최근 6시간에 생성된 것"으로 고정한다.
  const comments = raw
    .flatMap((c) =>
      typeof c.body === "string" && typeof c.created_at === "string"
        ? [{ body: c.body, createdAt: c.created_at }]
        : [],
    )
    .filter((c) => Date.parse(c.createdAt) >= windowStart);
  return deriveProgress(comments, new Date());
}
```

### 4) `src/ui/pipeline-run-control.tsx` (신규, `"use client"`) — 실행 콘솔

`PipelineCommandButton`(`pipeline-command.tsx`)과 같은 뼈대(`useTransition` + 토스트)에 disabled·설명·진행 pill·폴링을 더한다. **실행은 여전히 `postPipelineCommand("pipeline-run")` 고정 key** — `label`은 표시용일 뿐 서버로 안 간다(불변식). pill 색은 점(비텍스트)이 나르고 낱말이 함께 말한다.

```tsx
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { cn } from "~/lib/utils";
import { postPipelineCommand } from "~/pipeline/command-action";
import { getPipelineProgress } from "~/pipeline/progress-action";
import type { ProgressState } from "~/pipeline/progress"; // 타입만
import type { RunPlan } from "~/pipeline/run-plan"; // 타입만
import { Button } from "~/ui/atoms/button";

const POLL_MS = 15_000; // 15초: 인증 시 240req/h(5000/h의 5% 미만), 반응은 충분

// 진행 pill: 색은 점(비텍스트, 3:1)이 나르고 낱말이 상태를 함께 말한다(색 단독 아님).
// 브리핑 tone 토큰 재사용 — awaiting=active(맥박) · responded=silence(완료=침묵) ·
// silent=hold(주의) · idle/unknown=muted. 신규 토큰·서체·keyframe 없음.
function ProgressPill({ state }: { state: ProgressState }) {
  let dot = "bg-muted-foreground";
  let text = "text-muted-foreground";
  let pulse = false;
  let label: string;
  switch (state.kind) {
    case "awaiting":
      dot = "bg-active";
      text = "text-foreground";
      pulse = true;
      label =
        state.minutes === 0
          ? "요청 보냄 · 응답 대기"
          : `요청 보냄 · ${state.minutes}분째 응답 대기`;
      break;
    case "responded":
      dot = "bg-silence";
      label = "응답 옴";
      break;
    case "silent":
      dot = "bg-hold";
      text = "text-foreground";
      label = `무응답 ${state.minutes}분 · 이슈 #87 확인`;
      break;
    case "unknown":
      label = "진행 상태 확인 불가";
      break;
    default: // idle
      label = "최근 요청 없음";
  }
  return (
    <span className={cn("flex items-center gap-1.5 text-xs", text)}>
      <span
        aria-hidden="true"
        className={cn(
          "inline-block size-2 rounded-full",
          dot,
          pulse && "animate-pulse motion-reduce:animate-none",
        )}
      />
      {label}
    </span>
  );
}

export function PipelineRunControl({ plan }: { plan: RunPlan }) {
  const [isPending, startTransition] = useTransition();
  const [progress, setProgress] = useState<ProgressState>({ kind: "unknown" });
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    const tick = async () => {
      // 서버 액션이 reject하면(전송 실패·응답 파싱 실패·그 밖의 액션 오류) 잡지 않을 경우
      // 부동 프로미스가 조용히 죽고 pill이 마지막 값에 얼어붙는다 — 직전 값이
      // "응답 옴"이면 실패가 성공으로 보인다(요구 4가 없애려는 상태). unknown으로 내린다.
      try {
        const p = await getPipelineProgress();
        if (aliveRef.current) setProgress(p);
      } catch {
        if (aliveRef.current) setProgress({ kind: "unknown" });
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => {
      aliveRef.current = false;
      clearInterval(timer);
    };
  }, []);

  const handleClick = () => {
    startTransition(async () => {
      // 고정 key. label(동적)은 표시용일 뿐 서버로 가지 않는다 — 본문은 commands.ts 화이트리스트.
      const result = await postPipelineCommand("pipeline-run");
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(
        "파이프라인 실행을 요청했습니다 (이슈 #87). 아래에서 진행을 확인하세요.",
      );
      try {
        const p = await getPipelineProgress(); // 클릭 직후 즉시 갱신
        if (aliveRef.current) setProgress(p);
      } catch {
        if (aliveRef.current) setProgress({ kind: "unknown" });
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        type="button"
        disabled={isPending || !plan.enabled}
        onClick={handleClick}
      >
        {isPending ? "요청 중..." : plan.label}
      </Button>
      <p className="max-w-64 text-right text-xs text-muted-foreground">
        {plan.description}
      </p>
      <ProgressPill state={progress} />
    </div>
  );
}
```

- 초기 상태 `unknown`(첫 폴 전). 폴은 마운트 시 1회 + 15초 간격. `aliveRef`로 언마운트 후 setState 방지. `void`로 부동 프로미스 lint 회피.
- **폴 실패는 반드시 잡아 `unknown`으로 내린다.** `void tick()`은 거부된 프로미스를 버리므로, `tick` 안에 `try/catch`가 없으면 서버 액션 거부(전송 실패·응답 파싱 실패·그 밖의 액션 오류)가 처리되지 않은 거부로 죽고 **pill은 마지막 값에 얼어붙는다**. 그 값이 `responded`였다면 실패가 "응답 옴"으로 보인다 — 요구 4가 없애려는 상태를 이 화면이 새로 만드는 셈이다. 클릭 직후 갱신도 같은 이유로 감싼다.
  세션 만료는 이 경로가 아니다 — `requireAdmin()`이 `redirect("/login")`을 던지고 Next가 서버 액션의 redirect를 **클라이언트 내비게이션**으로 처리하므로 pill이 아니라 로그인 화면으로 간다(`CLAUDE.md:131` "인가 실패는 `ActionResult`에 담기지 않는다 — `requireAdmin()`이 `redirect`/`notFound`로 던진다"). 그래도 `try/catch`는 필요하다: 위 나머지 경로가 남고, 잡지 않으면 조용히 얼어붙는다.
- `plan.enabled === false`면 버튼 disabled(라벨 `"진행할 작업 없음"`), 설명이 다음 행동을 가리킨다. 라벨이 스테일해도(작업 완료 후 보드 flip 전까지) pill이 진행을 답하고, 다음 로드에서 라벨이 갱신된다.

### 5) `src/pipeline/briefing.ts` (수정) — plan 배선

```ts
// before (:1-2 아래에 임포트 추가)
import type { BoardItem, BoardSection } from "./board";
import { identityFor, ROSTER_ORDER, type AgentIdentity } from "./agents";
// after — run-plan 추가
import { describePipelineRun, type RunPlan } from "./run-plan";
```

```ts
// before (:22-28) Briefing 타입
export type Briefing = {
  today: string;
  pendingCount: number;
  inbox: SpeechItem[];
  team: TeamMember[];
  feed: SpeechItem[];
};
// after — plan 필드 추가
export type Briefing = {
  today: string;
  pendingCount: number;
  inbox: SpeechItem[];
  team: TeamMember[];
  feed: SpeechItem[];
  plan: RunPlan;
};
```

```ts
// before (:195-205) — team 계산 후 return
  const team = ROSTER_ORDER.map((id) => {
    const { state, heldId, tone } = teamState(id, items);
    return { identity: identityFor(id), state, heldId, tone };
  });
  return {
    today: formatToday(today),
    pendingCount: inbox.length,
    inbox,
    team,
    feed,
  };
// after — describePipelineRun(items) 주입(items는 :188 flatten 결과, dedupe 반영)
  const team = ROSTER_ORDER.map((id) => {
    const { state, heldId, tone } = teamState(id, items);
    return { identity: identityFor(id), state, heldId, tone };
  });
  return {
    today: formatToday(today),
    pendingCount: inbox.length,
    inbox,
    team,
    feed,
    plan: describePipelineRun(items),
  };
```

### 6) `src/ui/pipeline-page.tsx` (수정) — 실행 콘솔 장착

```tsx
// before (:8) — 미사용이 되므로 제거
import { PipelineCommandButton } from "~/ui/pipeline-command";
// after — 실행 콘솔 임포트로 교체(PipelineCommandButton은 이 파일에서 더 안 쓴다)
import { PipelineRunControl } from "~/ui/pipeline-run-control";
```

```tsx
// before (:41) 헤더 — 폰에서 콘솔이 접히도록 flex-wrap 추가
    <header className="flex items-start justify-between gap-4">
// after
    <header className="flex flex-wrap items-start justify-between gap-4">
```

```tsx
// before (:55) 정적 버튼
      <PipelineCommandButton command="pipeline-run" label="파이프라인 실행" />
// after — 동적 실행 콘솔(briefing.plan 주입)
      <PipelineRunControl plan={briefing.plan} />
```

- `pipeline-page.tsx`는 서버 컴포넌트라 `briefing.plan`(순수 도출)을 그대로 client leaf에 넘긴다(`RunPlan`은 직렬화 가능한 평면 객체). `PipelineCommandButton`은 사무실 책상(`pixel-office.tsx:150`)이 계속 쓰므로 파일 자체는 남는다 — 이 파일의 임포트만 제거한다.

### 7) `src/ui/pipeline-gate.tsx` (수정) — 도장 직후 안내

```tsx
// before (:7) 아래에 임포트 추가
import { commitGateTransition } from "~/pipeline/commit-transition";
// after
import { gateNextActionHint } from "~/pipeline/run-plan";
```

```tsx
// before (:38) 도장 성공 토스트
      toast.success(`${label}로 넘겼습니다`);
// after — 다음 손잡이를 가리킨다(결정≠실행). label은 찍힌 목표 status(계획지시·구현승인)
      toast.success(`${label}로 넘겼습니다. ${gateNextActionHint(label)}`);
```

- 결과 예: `계획지시로 넘겼습니다. 보드에 반영되면 파이프라인 실행을 눌러 계획서를 받으세요.` / `구현승인으로 넘겼습니다. 보드에 반영되면 파이프라인 실행을 눌러 구현을 받으세요.` `gateNextActionHint`는 순수(run-plan.ts)라 client 번들에 섞여도 안전(런타임 임포트 없음).

### 8) `src/env.js` (수정, 주석만) — 토큰 세 번째(읽기) 용도 명기

```js
// before (:37-42)
    // 파이프라인 대시보드의 GitHub 토큰. 두 곳에서 쓴다:
    //  (1) 이슈 #87 코멘트 게시(command-action.ts) — Issues RW,
    //  (2) dev 브랜치 PROJECT_BOARD.md status 줄 커밋(commit-transition.ts) — Contents RW.
    // 따라서 PAT은 ApcH 저장소에 Contents RW + Issues RW가 있어야 한다(사용자 재발급).
    // optional 이유: 기능을 먼저 배포하고 값은 이후 사용자가 주입한다(백로그 명시).
    // 없으면 명령·전이 버튼이 실패 결과를 낸다. 누락이 빌드를 죽이면 안 되므로 optional.
// after — (3) 진행 신호 읽기 추가(새 권한 아님 — Issues RW에 코멘트 읽기 포함)
    // 파이프라인 대시보드의 GitHub 토큰. 세 곳에서 쓴다:
    //  (1) 이슈 #87 코멘트 게시(command-action.ts) — Issues RW,
    //  (2) dev 브랜치 PROJECT_BOARD.md status 줄 커밋(commit-transition.ts) — Contents RW,
    //  (3) 진행 신호로 이슈 #87 코멘트 읽기(progress-action.ts) — Issues 읽기(RW에 포함, 새 권한 아님).
    //      선택: 없으면 미인증(60/h)으로 시도하되 폴링(240/h)이 한도를 넘으면 pill이 unknown.
    // 따라서 PAT은 ApcH 저장소에 Contents RW + Issues RW가 있어야 한다(사용자 재발급).
    // optional 이유: 기능을 먼저 배포하고 값은 이후 사용자가 주입한다(백로그 명시).
    // 없으면 명령·전이 버튼이 실패 결과를 낸다. 누락이 빌드를 죽이면 안 되므로 optional.
```

`GITHUB_PIPELINE_TOKEN: z.string().optional()`(`:43`)과 `runtimeEnv`(`:60`)는 **그대로**. 스키마 변경 없음.

## 테스트

- **덮는 것 (순수 함수):**
  - `run-plan.test.mjs` (신규) — `describePipelineRun`: 빈 배열 → `{enabled:false, "진행할 작업 없음", "지금 파이프라인이 진행할 항목이 없습니다."}`; 완료·보류만 → 동일; 승인대기·검토대기만(actionable 0) → `{false, "진행할 작업 없음", "결재함 항목에 도장을 찍으면 실행할 작업이 생깁니다. 방금 찍었다면 보드 반영까지 최대 5분 걸립니다."}`; 계획지시 1건 → `{true, "FEAT-09 계획서 작성", "실행하면 FEAT-09 계획서 작성 작업을 진행합니다."}`; 구현승인 1건 → `{true, "FEAT-09 구현", …}`; 복수(계획지시+구현승인, 보드 순서) → `{true, "FEAT-06 계획서 작성 외 1건", "실행하면 FEAT-06 계획서 작성, FEAT-07 구현 작업을 진행합니다."}`; `status:null`·미지 status·`__proto__`/`toString` status는 무시(프로토타입 오염 방어). `gateNextActionHint`: `"계획지시"`→`"보드에 반영되면 파이프라인 실행을 눌러 계획서를 받으세요."`, `"구현승인"`→`"…구현을 받으세요."`, `"완료"`/`"arbitrary"`→`"…다음 단계를 진행하세요."` (BoardItem은 `{checked,id,title,agent,area,status,reason,result}` 최소 객체로 인라인 구성 — describePipelineRun은 `status`·`id`만 읽는다).
  - `progress.test.mjs` (신규) — `deriveProgress(comments, now)`: `[]`→`idle`; 답글만(`[claude]` 전부)→`idle`; 명령 뒤 답글→`responded`(sinceIso=명령 시각); **이중 명령+답글 1건→`awaiting`(sinceIso=뒤 명령)** — 답글 1건은 앞 명령만 갚으므로 뒤 명령은 미응답이다(2026-08-15 삼킴 사건의 형태. 여기서 `responded`가 나오면 삼킴이 성공으로 보인다); 명령 2건+답글 2건→`responded`(sinceIso=최신 명령); 창 밖 명령의 답글이 앞에 와도 뒤 명령을 갚지 않음→`silent`; 명령만·경과 1분(<3분)→`awaiting{minutes:1}`; 명령만·경과 5분(≥3분)→`silent{minutes:5}`; 명령1→답글1→명령2(무응답)→`silent`(명령2 기준); 경과 정확히 3분(180,000ms)→`silent`(경계 포함); `minutes` 계산(floor); `createdAt` 파싱 불가→`unknown`. `isReply`는 export 안 하므로 접두 판정은 body `" [claude] x"`(선행 공백)를 담은 코멘트로 responded 도출을 통해 간접 확인. `SILENCE_THRESHOLD_MS === 180000`.
  - `briefing.test.mjs` (수정) — 기존 BOARD 픽스처(FEAT-06 계획지시 + FEAT-07 구현승인 포함)에서 `briefing.plan.enabled === true`, `briefing.plan.label === "FEAT-06 계획서 작성 외 1건"` 단언 1개 추가. 기존 단언(inbox/feed/team/today/pendingCount)은 `plan` 필드 추가로 깨지지 않는다(전부 하위 필드 대상, `briefing` 전체 deepEqual 없음).
- **못 덮는 범위 (Node 러너·DOM/외부 I/O 없음 — 배포 후 데스크톱+폰 수동 확인):**
  - `progress-action.ts`의 이슈 코멘트 GET·`since` 창·`created_at` 창 필터·인증 분기·`requireAdmin()` 게이트·읽기 실패→`unknown`(실제 GitHub 왕복).
  - **`per_page=100` 상한**: 6시간 안에 코멘트가 100건을 넘으면 GitHub이 오래된 100건만 주므로(ID 오름차순) 최신 상태를 놓친다. 실측 밀도가 3일에 12건이라 현실 시나리오가 아니지만, 이 화면은 그 경우 조용히 낡은 값을 보인다 — 알려진 한계로 남긴다.
  - `PipelineRunControl`의 `useEffect` 폴링(15초 간격·마운트 1회·언마운트 정리)·`useTransition`·`postPipelineCommand`·`getPipelineProgress` 호출·토스트·disabled 상태.
  - `ProgressPill`의 시각(점 색 tone 매핑·awaiting 맥박·`motion-reduce`·색-낱말 이중 전달)·`text-xs` 실화면 대비.
  - 헤더 `flex-wrap` 반응형(폰 접힘)·설명 `max-w-64` 줄바꿈.
  - `pipeline-gate.tsx` 토스트 이음 문구의 실화면.
  - **CDN 잔상(설계상 한계, 결정 6)**: 투영은 raw CDN(캐시 수 분)이라 실행 후 보드 flip·동적 라벨 갱신이 지연될 수 있다. 진행 pill은 코멘트 API(수 초)라 이 지연을 타지 않으므로 관측 3은 해소되지만, "보드에 반영된 새 status"는 다음 로드에서 보인다. 후속 항목 후보(투영을 contents API로 이관 — FEAT-08 「대안」).
- **CLAUDE.md 테스트 표(읽기 전용 — 직접 수정 금지):** `run-plan.test.mjs`·`progress.test.mjs` 2행 추가 + 파일 수 8→10·테스트 수 갱신. B단계 `비고:`로 보고한다.

## 범위 밖 의존

**없음** — 전부 `apps/admin/src/**` 안이다. `@repo/db`·다른 워크스페이스·DB 스키마·`packages/db`를 건드리지 않는다. **DB 무접근 유지**(진행 신호는 GitHub 코멘트 읽기이지 DB가 아니다). **새 외부 쓰기 경로 없음** — 쓰기는 여전히 둘(이슈 코멘트 POST·보드 커밋 PUT)이고, 이번에 느는 것은 **읽기**(이슈 코멘트) 하나로 기존 raw CDN 보드 읽기와 같은 성격이다. 진행 read는 서버 액션 안(서버 측)이라 CSP `connect-src`(브라우저 호출만 대상, `CLAUDE.md:127`)와 무관하다.

**코드 밖 전제(막힘이 아니라 사용자 몫):** `GITHUB_PIPELINE_TOKEN`은 **이미 충분하다** — 진행 read는 Issues RW(FEAT-08에서 이미 재발급)에 포함된 코멘트 읽기라 **새 PAT 권한 재발급이 필요 없다**(FEAT-08의 Contents RW 추가와 다르다). 토큰 미설정이면 미인증(60/h)으로 시도하되 폴링이 한도를 넘으면 pill이 `unknown`을 보인다 — 스키마 변경 없음.

## 대안

- **진행 신호원 ⓑ(보드 status) 또는 ⓒ(dev 커밋).** ⓑ는 이미 투영 중이라 추가 비용이 없지만, pipeline-run은 게이트 status를 바꾸지 않아(사용자 전이) "돌고 있음"을 못 나타내고 CDN에 지연된다. ⓒ는 커밋≠명령 1:1이고 no-op 실행엔 커밋이 없다. 둘 다 **삼킨 명령(요구 4)을 못 잡는다.** **채택 안 함** — ⓐ만 명령/답글을 순서로 매핑하고 FIFO 짝짓기로 삼킴을 판별한다.
- **갱신을 수동 새로고침으로.** 폴링 없이 버튼 하나로 새로고침. **채택 안 함** — 관측 3의 핵심이 "언제 새로고침할지 모른다"라 수동은 문제를 그대로 둔다.
- **갱신을 서버 액션 응답 편승으로.** 코멘트 POST의 `ActionResult`에 진행을 실어 보낸다. **채택 안 함** — POST 응답은 "게시됨"만 알지 이후 1~2분 진행을 못 알린다(관측 3은 게시 이후의 창이다).
- **투영도 contents API로 바꿔 CDN 잔상 제거(결정 6).** 커밋·실행 직후 즉시 최신 반영. 하지만 투영이 지금은 토큰 없는 공개 raw로 도는데, 바꾸면 모든 페이지 로드가 인증·base64·rate limit(5000/h)에 묶인다(FEAT-08 「대안」 `docs/plans/FEAT-08.md:436`). **채택 안 함(이번 범위 밖)** — 무게중심(관측 3)은 코멘트 pill이 투영과 별개로 풀고, CDN 이관은 후속 항목으로 남긴다.
- **진행 임계를 데이터에 더 맞춰(예 5분·10분).** 실측 이상치가 23분이라 임계를 올리면 오경보가 준다. **채택 안 함(3분 유지)** — 정상 최대 2.6분 바로 위가 "확인하라"의 자연 경계이고, silent는 실패 단정이 아니라 점검 신호라 다소 이른 표시가 해롭지 않다. 임계는 `SILENCE_THRESHOLD_MS` 상수라 나중에 조정 쉽다.
- **실행 버튼을 `PipelineCommandButton` 확장으로.** 기존 컴포넌트에 `disabled`·설명·pill을 얹는다. **채택 안 함** — 그 컴포넌트는 사무실 책상 5개가 공유하는 단순 버튼이라, 헤더 전용 폴링·콘솔 로직을 넣으면 결합이 는다. 헤더용 `PipelineRunControl`로 분리하고 책상 버튼은 그대로 둔다.
- **도장 직후 자동으로 pipeline-run 게시(FEAT-08 「선택 확장」).** 결재 한 번으로 실행까지 잇는다. **채택 안 함** — FEAT-08 게이트②에서 기각된 접근이고, 결정 5는 "다음 손잡이를 가리킬 뿐 클릭은 사용자 몫"으로 결정과 실행의 분리를 유지한다.
- **진행 pill에 미응답 건수를 표시(예 "요청 2건 대기").** 연속 클릭 시 몇 건이 밀렸는지 숫자로 보여준다. **채택 안 함** — 짝짓기 모델이 이미 가장 오래된 미응답 명령의 경과를 말해 삼킴을 드러내므로(2026-08-15 재생에서 `silent(15분)`) 건수는 판단을 바꾸지 않는다. 상태 타입에 필드를 더하면 테스트·문구 표면만 넓어진다. 필요해지면 `ProgressState`에 `outstanding`을 더하는 작은 후속으로 충분하다.
