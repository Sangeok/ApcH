---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-08-18"
approved-by: "Sangeok"
approved-at: "2026-08-18"
approval-scope: "Core: 보드 감압(예산 150자) + docs/agents 행위자 보고서 규약 + 대시보드 항목ID·예산표시·폴더뷰. 소급 이전 제외"
completed-at: "2026-08-18"
verification-summary: "npm test 182 pass·0 fail(기준선 173) · npm run check exit 0 · verify:fsd:final exit 0(fetch owner 5) · build exit 0(/pipeline 4.62 kB). 실물 보드 파싱 섹션 6·항목 11 유지. 신규 실패 0건."
closed-at: null
closed-by: null
closed-reason: null
owners: ["Sangeok"]
related: ["PROJECT_BOARD.md", "CLAUDE.md", "docs/plans/README.md", ".claude/agents/feature-scout.md", ".claude/agents/doc-auditor.md", "apps/admin/src/fsd/pages/pipeline/model/briefing.ts", "docs/proposals/active/remote-agent-pipeline-generalization.md", "apps/admin/docs/proposals/active/admin-src-fsd-contract-hardening.md"]
---

# 보드 감압과 행위자 보고서 — 상태와 활동의 분리

## Summary

`PROJECT_BOARD.md` 한 문서가 **상태**(무엇이 어느 단계인가)와 **활동**(누가 뭘 했나) 두 질문에 동시에 답하려다, FEAT-10 한 행이 약 6,800자가 됐다. 그 결과 대시보드 투영에서 `결과:` 한 줄(약 790자)이 조용히 덮어써지고, 정정 단락 하나는 파서가 아예 못 본다. 이 제안은 보드의 `근거`·`결과`를 **길이 예산 안의 요약**으로 되돌리고 상세를 `docs/agents/<행위자>/` **append-only 보고서**로 옮긴다. 보드 안내 블록의 인수 조건은 원래부터 *"에이전트의 보고가 아니라 직접 본 것"*을 요구하므로 보고서 위치가 인수 무결성을 바꾸지 않으며, 이를 FEAT-10 소급 시험으로 확인했다.

## Goal

- 보드 행을 상태 기계 본연의 크기로 되돌린다 (한 행 약 6,800자 → 약 150자)
- 대시보드 투영의 데이터 손실 둘(덮어써지는 `결과:`, 파서 사각 단락)을 없앤다
- 저장소에 기록이 전혀 없는 행위자(`doc-auditor`·`feature-scout`)의 산출물을 남긴다
- `feature-scout`의 중복 제안 배제 기능을 복구한다 — 정의가 직전 보고서를 요구하는데 지금은 저장할 곳이 없다
- 작업 유형: 문서 구조 변경 + 규약 신설 + 대시보드 읽기 경로 추가

## Proposal Size

`proposal-size`: standard

선택 근거:

- **5개 이상 파일 변경** — 변경·신설 20개: 문서 10 + `apps/admin` 코드 10 (별도 keep 1 — Affected Files 표를 기계로 센 수)
- **롤백이 단순 revert 이상** — 보드 작성 규약이 바뀐 뒤에는 에이전트가 이미 새 형식으로 쓴 행들이 남는다
- **API 계약 경계 변경** — production fetch owner 4 → 5 (경계 검사 스크립트가 강제하는 계약)

## Current State

아래 수치는 전부 실측이다(2026-08-18, `dev` 기준).

**① 보고 줄이 어떤 항목인지 말하지 않는다 — 11/11**

실제 보드로 `buildBriefing()`을 돌려 「보고」 11줄을 찍은 결과, **자기 항목 ID를 포함한 줄이 하나도 없다.** FEAT-09 행은 화면에 `FEAT-08 도장 옆에 거절 세 갈래…`로 뜬다 — 보이는 유일한 ID가 다른 항목이다.

원인은 `apps/admin/src/fsd/pages/pipeline/model/briefing.ts:125-145`다. `계획지시`·`구현승인`은 `${item.id} …`로 ID를 박지만, `완료`·`보류`는 `firstSentence(결과)`를 쓴다. 결과 산문이 ID로 시작할 이유가 없다.

**② 한 행이 약 6,800자다 — 그중 둘은 화면에 도달하지 못한다**

FEAT-10 행 실측:

| 조각 | 크기 | 투영 |
| --- | --- | --- |
| `근거:` | 3,858자 | 한 줄로 잘림 |
| `결과:` ① 계획서 완료 | 약 790자 | **덮어써져 사라짐** |
| `**정정·재계획**` 단락 | 1,000자 이상 | **파서가 못 봄** |
| `결과:` ② 구현 완료 | 2,185자 | 한 줄로 잘림 |

- `apps/admin/src/fsd/entities/pipeline/model/board.ts:87`이 `결과:`를 만날 때마다 **덮어쓴다.** FEAT-10엔 `결과:`가 두 줄이라 앞의 것이 지워진다.
- 같은 파일의 `FIELD_RE`(`:22`)는 `agent|area|status|근거|결과` 다섯만 받는다. `**정정·재계획**`으로 시작하는 줄은 항목도 헤딩도 필드도 아니라 통째로 버려진다.

**③ 책상 5개 중 이력이 있는 건 2개다**

| 행위자 | 보드 `agent` 필드 | 저장소 산출물 |
| --- | --- | --- |
| `admin-dev` | 8행 | `docs/plans/` 8개 |
| `web-dev` | 3행 | `docs/plans/` 3개 |
| `pm` | 0행 | 없음 (근거 산문에만) |
| `doc-auditor` | 0행 | **없음** |
| `feature-scout` | 0행 | **없음** |

**④ `doc-auditor`는 3번 일했고 보드는 0글자를 적었다**

git 이력에 세 번의 감사가 남아 있다 — `4155dcf`(first audit), `cda07b8`, `52e3e1a`(FEAT-09 audit findings, 문서 3개 수정). 그런데 FEAT-09 보드 행에서 "감사"를 세면 **0회**다. 대시보드는 보드만 읽으므로 이 일은 화면에 존재하지 않는다.

**⑤ `feature-scout`는 0회 실행이고, 정의가 저장을 요구한다**

`.claude/agents/feature-scout.md:38`:

> 너는 쓰기 도구가 없어 지난 제안을 스스로 기록하지 못한다. 그래서 트리거 1의 "소진됐는가"를 판정하는 것도 사용자다 — 직전 정찰 결과를 함께 넘겨주면 그와 겹치는 제안을 빼고 내고, 없으면 첫 정찰로 본다.

직전 보고서가 있어야 중복 제안이 걸러진다. 저장할 곳이 없어 두 트리거가 "사용자가 부를 때" 하나로 붕괴해 있다. 출력 형식은 `:191-205`에 이미 완전히 규정돼 있어 새 형식을 만들 필요가 없다.

**⑥ 형식을 강제할 자리가 없다**

`.github/workflows`가 존재하지 않는다. CI 게이트를 걸 수 없다.

## Scope

포함 범위:

- `PROJECT_BOARD.md` 안내 블록의 기록 규약과 인수 조건
- `docs/agents/` 규약 신설
- `CLAUDE.md` 문서 지도와 파이프라인 절차
- `.claude/agents/{pm,web-dev,admin-dev,doc-auditor}.md`의 기록 관련 지시
- `docs/plans/README.md`의 "기록은 한 곳" 원칙 위치 갱신
- `apps/admin`의 보고 줄 항목 ID 표시, 예산 초과 표시, 행위자 폴더 목록 뷰(`entities/agent-report/`), fetch owner 등록, `board.ts`의 중복 `결과:` 누적 처리
- `apps/admin/CLAUDE.md`의 소유권 목록과 테스트 인벤토리 동기화 (메인 루프 소관 — 이 문서는 `admin-dev`에게 읽기 전용)
- `remote-agent-pipeline-generalization.md` C절의 읽기 경로 열거 동기화 (「읽기 ③」 추가)

제외 범위:

- **기존 11행의 소급 이전.** 완료된 기록은 작성 시점 보존이 목적이다(`.claude/agents/doc-auditor.md:37`과 같은 논리). 새 항목부터 적용한다
- `docs/plans/` 계획서의 구조·수명 규칙 — 그대로 둔다
- 보드의 상태 전이·게이트·명령 화이트리스트 — 전부 그대로
- raw CDN 5분 잔상(FEAT-10이 남긴 후속 항목) — 이 제안이 추가하는 경로는 `max-age=60`이라 별개다
- `agent` 필드가 담당이지 실행자가 아닌 문제(FEAT-11 사례) — 별도 판단 대상

## Proposal

**A. 보드 감압 — 길이 예산**

`근거`·`결과`를 각 **150자 이내 요약**으로 제한한다. "한 문장"이 아니라 글자 수인 이유는 아래 D에 있다.

- `근거`는 **행을 만드는 주체가 쓰고, 작성 후 불변이다.** pm 선정이면 pm, 소유자 직접 발주면 메인 루프("소유자 발주로 기록"). 소유자를 pm 하나로 박으면 안 되는 이유는 실측이다 — 현재 11행 중 pm이 쓴 근거는 **3개뿐**이고 8개는 소유자 발주(7) 또는 사후 기록(1)이다
- `결과` 소유자는 담당 dev다
- **게이트 결정과 검증 라운드 기록은 보드에 쌓지 않고 `docs/agents/main-loop/<항목ID>.md`에 쓴다.** 게이트를 여는 것은 사용자지만 기록자는 메인 루프다(사용자는 행위자 폴더를 갖지 않는다). 이 목적지를 정하지 않으면 FEAT-09 게이트②의 "보류 사유 고정 문구·폐기는 보드 행만·잉크 색 승인" 같은 **제품 결정 기록**이 갈 곳 없이 증발한다

**두 필드 모두 행동 변화가 필요하다.** 필드 전체 길이 기준 실측:

| 필드 | 150자 초과 | 범위 |
| --- | --- | --- |
| `근거` | **6/11** | 90 ~ 3,858자 |
| `결과` | **11/11** | 227 ~ 2,185자 |

`결과`는 **어떤 예산에서도 전부 초과**한다(최솟값 227자). 예산 숫자가 실제로 가르는 것은 `근거`뿐이다.

주의 — `근거`의 **첫 문장**은 평균 약 40자로 짧다(`"사용자 직접 발주 — pm 경유 없음(소유자 발주로 기록)."` 33자가 6회 반복). 그래서 첫 문장만 보면 `근거`가 이미 규칙을 지키는 것처럼 보이지만, **예산은 필드 전체를 잰다.** 두 통계를 섞지 말 것.

**B. 행위자 보고서 — `docs/agents/<행위자>/`**

```
docs/agents/<행위자>/<항목ID>.md   항목에 묶이는 작업
docs/agents/<행위자>/<고정명>.md   항목에 묶이지 않는 작업
```

`<고정명>`은 자리표시자가 아니라 **README에 열거되는 닫힌 목록**이다 — 계산 원칙("에이전트가 경로를 계산할 수 있어야")의 입력값이므로 작성자가 발명하면 안 된다. 지금 필요한 것은 둘뿐이다:

| 행위자 | 고정명 | 담는 것 |
| --- | --- | --- |
| `doc-auditor` | `감사기록.md` | 감사 1회 = 절 1개 (소득 0건도 기록) |
| `feature-scout` | `정찰기록.md` | 정찰 1회 = 절 1개 — 직전 절이 다음 정찰의 중복 배제 입력 |

새 고정명은 항목에 묶이지 않는 작업 부류가 실제로 생길 때 README에 행을 더해 늘린다 — 미리 만들지 않는다(폴더 지연 생성과 같은 원칙).

- **전부 append-only.** 절대 덮어쓰지 않는다. `docs/plans/`가 재작성 시 덮어쓰는 것과 반대인 이유는 성격이 다르기 때문이다 — 계획서는 **현재 계약**(하나만 유효), 보고서는 **누적 기록**(전부 유효)
- **폴더를 미리 만들지 않는다.** git이 빈 디렉터리를 추적하지 못하므로 첫 보고서가 폴더를 만든다. 아직 돌지 않은 행위자의 폴더는 자연히 생기지 않는다
- 행위자는 **다섯**이다: `main-loop` · `admin-dev` · `web-dev` · `doc-auditor` · `feature-scout`

`pm` 폴더는 **만들 수 없다.** `.claude/agents/pm.md:22`가 *"위 두 파일 외의 새 파일을 만드는 것"*을 금지한다. 손해는 없다 — pm의 산출인 선정 근거는 실측상 이미 33자라 보드 한 줄로 충분하다.

`main-loop`은 서브에이전트가 아니라 디스패처라 `.claude/agents/*.md` 정의 파일이 없다. `pm.md:38`의 표 관리 규칙(*"정의 파일이 없는 에이전트는 적지 않는다"*)을 이 폴더에 적용해 지우는 일이 없도록, `docs/agents/README.md`에 예외임을 명시한다.

`doc-auditor`와 `feature-scout`는 쓰기 도구가 없다. **메인 루프가 그들의 출력을 저장한다** — 도구 구성을 바꾸지 않는다. `.claude/agents/doc-auditor.md:33`이 쓰기 도구 부여를 명시적으로 거부하고 있다.

**dev의 보고서 쓰기는 쓰기 범위의 명시적 확장이 필요하다.** 루트 `CLAUDE.md` 에이전트 표(`:20-21`)의 쓰기 범위 열은 "자기 워크스페이스 + 보드 자기 행"인데 `docs/agents/<자기이름>/`은 루트라 그 밖이다 — 열을 갱신하지 않으면 이 제안의 Execution Plan이 같은 표를 근거로 "dev는 루트 문서를 못 고친다"고 말하는 것과 **자기모순**이 된다. 참고로 이 열은 이미 현실을 덜 담고 있다(dev는 런북 3·6단계에 따라 루트 `docs/plans/<항목ID>.md` 작성과 백로그 항목 제거를 이미 한다) — 이번에 보고서 폴더까지 셋을 함께 명기해 열을 정직하게 만든다.

**C. 경로는 계산 규약 — 파서를 건드리지 않는다**

`docs/plans/README.md:10`이 이미 원칙을 세웠다: *"에이전트가 보드를 읽고 경로를 계산할 수 있어야 하므로 날짜나 제목을 붙이지 않는다."* 같은 규칙을 쓴다. 보드에 `기록:` 필드를 만들지 않으므로 **파서에 새 필드를 추가하지 않는다**(`board.ts`의 `FIELD_RE`는 그대로 다섯 개다). `board.ts`를 건드리는 것은 E-4의 중복 `결과:` 처리 하나뿐이다.

**읽기 경로를 `entities/agent-report/`에 두는 근거.** FSD 규약 `apps/web/docs/conventions/fsd-architecture-guidelines.md:88`의 「서버 데이터 접근 배치 규칙」 1이 *"단일 도메인 엔티티 조회는 `entities/<domain>/api/`"*라고 한다. 폴더 목록 조회는 이 조건을 만족한다 — 응답을 목록으로 파싱할 뿐 feature의 로직을 필요로 하지 않으므로 상향 임포트가 없다.

이 판단은 FEAT-10의 결함 ⑲와 **결론이 반대**이며 그 이유가 다르다는 점을 남긴다. 진행 조회는 코멘트를 같은 feature의 `deriveProgress`로 넘겨야 해서 entities에 두면 `[R1] entities cannot import upward from features`로 막혔다(`docs/plans/FEAT-10.md:319` 실측). 폴더 목록에는 그 의존이 없다. 기존 슬라이스 명명(`analytics-event`, `pipeline`)과 같은 도메인 명사 규칙을 따른다.

**D. 강제 장치는 화면에 둔다**

CI가 없으므로(Current State ⑥) 남는 자리는 셋이고, 셋 중 하나만 실효가 있다.

| 방법 | 시점 | 강제력 |
| --- | --- | --- |
| 에이전트 정의에 규칙만 | — | 없음 — 지금 방식이고 그 결과가 6,800자다 |
| `doc-auditor` 감사 | 사후·부정기(2주 3회) | 약함 |
| **대시보드가 예산 초과를 표시** | **매 조회** | **강함** |

`briefing.ts`에 `overBudget: text.length > 150` 순수 함수를 두고 화면이 표시한다. 이 프로젝트가 가장 신뢰하는 층(순수 함수 + Node 러너)이고, 소유자가 매일 보는 화면이다.

**켜는 즉시 현재 17/22 필드가 초과로 뜬다**(실측). 이 함수는 **필드 전체**를 재지 첫 문장을 재지 않는다 — 첫 문장 기준 6/22와 혼동하지 말 것.

**"한 문장"이 아니라 글자 수인 이유**: `apps/admin/src/fsd/features/transition-pipeline-gate/model/transitions.ts:256`의 `holdResultLine`이 **기계가 쓰는 3문장짜리 `결과:` 줄**이다(실측 98자). 문장 수 규칙이면 코드가 첫날부터 규칙을 위반한다. 글자 수 예산이면 통과한다 — 98자는 100자 예산도 넘지 않는다.

**150이라는 숫자 자체는 실측에서 도출되지 않는다.** 코퍼스는 예산 선택에 거의 무관심하다(100자 21/22 · 150자 17/22 · 200자 16/22 — `결과` 11개가 어느 쪽이든 전부 초과하므로). 즉 **150은 판단이지 측정 결과가 아니며**, 그래서 Approval의 결정 (a)로 남겨 둔다. 실측이 뒷받침하는 것은 "문장 수가 아니라 글자 수여야 한다"는 형식뿐이다.

**E. 딸린 수정 넷**

1. 보드 안내 블록의 `완료` 기록 규칙을 갱신한다. **인수 조건 넷의 비교 대상은 건드리지 않는다** — 원문(`PROJECT_BOARD.md:18-19`)의 네 대상은 계획서 「고칠 파일」·「구현 스케치」·검증 명령·백로그이며 **보드 필드를 참조하지 않으므로** 그대로 유효하다. 바꾸는 것은 둘이다: (a) `완료` 기록 지시에 "`결과`는 150자 요약, 상세는 행위자 보고서" 규칙을 넣는다 (b) 인수 확인에 **다섯째 항목 — 보고서 존재 확인**을 더한다
2. `.claude/agents/doc-auditor.md`의 검사 제외 목록에 **`docs/agents/**`**를 추가한다. 보고서는 작성 시점 상태를 담아 `파일:줄` 인용이 시간이 지나면 낡는다 — 제외하지 않으면 감사자가 자기 옛 보고서를 전부 「어긋남」으로 잡는다
3. 보고 줄에 항목 ID를 표시한다 (Current State ①)
4. `결과:` 중복 필드의 덮어쓰기를 **파서에서** 처리한다 (Current State ②).
   **규약만으로는 못 고친다** — 이 제안은 소급 이전을 하지 않으므로(Scope 제외) FEAT-10 행의 `결과:` 두 줄은 영원히 남는다. "앞으로 `결과:`를 두 번 쓰지 않는다"는 규칙은 이미 기록된 약 790자를 되살리지 못한다. 측정된 결함을 실제로 없애는 경로는 파서뿐이다.

   **타입은 바꾸지 않는다.** `BoardItem.result`는 `string | null`(`board.ts:12`)로 두고, `:87`에서 덮어쓰는 대신 **이어 붙인다**(`result === null ? value : result + " " + value`). `string[]`로 바꾸면 소비자 전부가 흔들리지만, 이어 붙이면 소비자가 그대로다.

   **영향 면 전수**: `board.ts:87`(수정), `board.test.mjs`(중복 `결과:` 케이스 단언 추가 — 기존 테스트에는 중복 필드 케이스가 없다, 실측). `briefing.ts`의 `summarize`(`:85-88`)는 시그니처가 그대로라 수정 불필요 — 다만 FEAT-10 행의 `firstSentence` 결과가 두 번째 `결과:`에서 **첫 번째 것으로 바뀐다**(시간순이라 개선). `transitions.ts`의 `applyHoldTransition`·`applyGateTransition`은 파서가 아니라 **원본 마크다운 문자열을 직접 편집**하므로 영향이 없다.

   **`근거`는 고치지 않는다.** 같은 덮어쓰기 동작이 `근거:`(`board.ts:84-85`)를 포함한 다섯 필드 전부에 있으나, 실측된 데이터 손실은 `결과` 중복 하나뿐이다(보드 전체에서 중복 필드는 FEAT-10의 `결과:` 두 줄이 유일). 측정된 결함만 고친다 — `근거`까지 넓히는 것은 이 제안의 범위 밖이며, 중복 `근거`가 실제로 기록되면 그때 같은 3줄 수정을 적용하면 된다.

## Affected Files

| 경로 또는 영역 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| `docs/agents/README.md` | create | 경로 규약·append-only·`main-loop` 예외의 단일 출처 | none |
| `PROJECT_BOARD.md` | update | 안내 블록에 150자 예산 규칙 + 인수 다섯째 항목(보고서 존재 확인). 기존 비교 대상 넷은 불변(E-1) | medium — 규약 변경이라 이후 행 작성에 영향 |
| `CLAUDE.md` | update | 문서 지도에 `docs/agents/` 추가, 파이프라인 4·6·7·8단계에 기록 삽입, **에이전트 표 쓰기 범위 열 갱신**(dev 행에 `docs/plans/<항목ID>.md`·백로그 제거·`docs/agents/<자기이름>/` 명기 — 앞 둘은 기존 관행의 명문화) | low |
| `.claude/agents/pm.md` | update | `근거` 150자 규칙. 폴더는 만들지 않음을 명시 | low |
| `.claude/agents/admin-dev.md` · `web-dev.md` | update | `결과` 150자 규칙 + 보고서 작성 지시 | low |
| `.claude/agents/doc-auditor.md` | update | 검사 제외에 `docs/agents/**` 추가 | low — 빠뜨리면 거짓 「어긋남」 대량 발생 |
| `docs/plans/README.md` | update | "기록이 두 곳에 필요하지 않다" 원칙의 위치 갱신(복사가 아니라 이전) | none |
| `apps/admin/.../pipeline/model/briefing.ts` | update | 보고 줄 항목 ID + `overBudget` 순수 함수 | low — 순수 계층, 테스트로 덮인다 |
| `apps/admin/.../pipeline/model/briefing.test.mjs` | update | 위 둘의 단언 추가 | none |
| `apps/admin/.../pipeline/ui/index.tsx` | update | 항목 ID·예산 초과 표시, 책상에서 폴더 목록 진입 | low |
| `apps/admin/src/fsd/entities/agent-report/{api/queries.ts, model/report-index.ts, index.ts}` | create | 폴더 목록 fetch(api) + 순수 파서(model). 보드의 `queries.ts`+`board.ts` 2층 패턴. 배치 근거는 아래 | low |
| `apps/admin/scripts/verify-fsd-boundaries.mjs` (`:32-37`) · `.test.mjs` | update | `FSD_EFFECT_OWNERS.fetch` Set에 `src/fsd/entities/agent-report/api/queries.ts` **한 경로 추가**. `:665-673`은 개수가 아니라 **정렬된 경로 목록 전체를 문자열 비교**하므로 경로가 정확해야 한다 | low — FEAT-10이 3→4 전례 |
| `apps/admin/CLAUDE.md` | update | 「데이터와 외부 효과 소유권」에 다섯 번째 owner 한 줄, 「테스트 인벤토리」 수치 갱신. **FEAT-10 결함 ⑳이 정확히 이 누락이었다** — owner를 올리면서 같은 사실을 열거하는 이 문서를 handoff에 안 넣어 지시 문서가 코드보다 낡았다 | medium — 빠뜨리면 같은 결함 재발 |
| `apps/admin/src/fsd/entities/pipeline/model/board.ts` (`:87`) | update | `결과:` 중복 덮어쓰기 처리(제안 E-4). 경로는 계산 규약이라 새 **필드**는 추가하지 않는다 | low — 순수 파서, 테스트로 덮인다 |
| `apps/admin/src/fsd/entities/pipeline/model/board.test.mjs` | update | 중복 `결과:` 이어붙임 단언 추가 | none |
| `apps/admin/src/fsd/features/transition-pipeline-gate/model/transitions.ts` | keep | 원본 마크다운을 직접 편집하므로 파서 변경의 영향을 받지 않는다 — "정리"하려는 사람을 막기 위해 명시 | none |
| `docs/proposals/active/remote-agent-pipeline-generalization.md` | update | C절이 대시보드 읽기 경로를 ①②로 전수 열거 — 이 제안이 셋째 경로를 추가하므로 「읽기 ③」을 더해야 한다. 이 문서는 대시보드 표면이 바뀔 때마다 동기화돼 온 전례가 있다(`5261af4`·`9839698`·`52e3e1a`) | low — 빠뜨리면 참조 명세가 낡는다(결함 ⑳과 같은 부류) |

## Safety Analysis

**인수 무결성이 바뀌지 않는다.** `PROJECT_BOARD.md` 안내 블록이 이미 이렇게 못 박고 있다:

> `완료` 기록은 재현 검증 후에 받아들인다: 변경 파일 목록 ↔ 계획서 「고칠 파일」, diff ↔ 「구현 스케치」, 검증 명령 직접 재실행, 백로그 제거 확인 — **넷 다 에이전트의 보고가 아니라 직접 본 것이어야 한다.**

메인 루프는 원래부터 `결과` 필드를 **믿지 않고** 독립 재현한다. 따라서 그 보고가 보드에 있든 파일에 있든 인수의 무결성은 변하지 않는다. FEAT-10 소급 시험에서 인수 조건 넷이 전부 재현 가능함을 확인했다(Verification Results 참조).

**대시보드 읽기 경로가 추가되지만 기존 경로를 건드리지 않는다.** 폴더 목록은 raw CDN으로 불가능해(404 실측) `api.github.com/contents`를 쓴다. 보드 읽기(`BOARD_RAW_URL`)는 그대로 둔다. 새 경로는 `max-age=60`으로 보드의 `max-age=300`보다 신선하다.

**새 토큰 권한이 필요 없다.** `GITHUB_PIPELINE_TOKEN`은 FEAT-08에서 게이트 커밋용으로 Contents RW를 이미 갖고 있다. 미인증 한도 60/h는 부족하므로(실측) 이 토큰을 쓴다.

**DB 무접근과 외부 쓰기 두 경로가 유지된다.** 추가되는 것은 읽기뿐이다.

확인한 항목:

- [x] 앱 진입점과 라우팅 경계 — 새 라우트 없음. `/pipeline` 안에서만 확장
- [x] 정적 `import` / `export from` — 신규 slice는 root public API 규칙을 따른다
- [x] barrel export(`index.ts`) 경유 참조 — **기존 규칙이 이미 정한다.** `apps/admin/CLAUDE.md`의 「구조」가 *"feature Server Action과 entity server query, Edge auth config는 public root에서 재수출하지 않는다"*고 하므로 `getAgentReportIndex()`는 `entities/agent-report/index.ts`에 넣지 않는다. 소비자는 형제 선례와 같이 `api` 하위 경로로 임포트한다(`app/(protected)/pipeline/page.tsx:3`의 `~/fsd/entities/pipeline/api`). 순수 모델 타입만 slice root로 내보낸다
- [x] 테스트와 스크립트 참조 — `verify-fsd-boundaries.mjs`의 `FSD_EFFECT_OWNERS.fetch` **Set에 정확한 경로 한 줄**을 추가해야 한다(개수 상수가 아니다)
- [x] 타입 선언, 전역 선언, ambient module 영향 — 순수 모델 타입 추가뿐
- [x] 런타임 side effect 또는 초기화 코드 — 없음. 서버 컴포넌트 fetch
- [x] API, 외부 SDK 영향 — GitHub contents API 읽기 owner 하나 추가

`dynamic import()`와 정적 자산 URL 항목은 이 작업과 무관하여 제거했다.

## Approval

승인 메모:

- 승인됨(2026-08-18). 결정 (a) 예산 **150자** — 제안서 기본값 채택. 결정 (b) 소급 이전 **하지 않음** — 제안서 기본값 채택.
- 승인 시 결정이 필요한 것 둘.

  **(a) 예산 150자가 맞는가.** 필드 전체 기준 실측 — 100자면 **21/22**, 150자면 **17/22**, 200자면 **16/22**가 초과한다. 예산을 어떻게 잡아도 `결과` 11개는 전부 초과하므로(최솟값 227자), 숫자가 실제로 가르는 것은 `근거`뿐이다(100자 10개 / 150자 6개 / 200자 5개 초과).
  (참고: 이전 판이 적었던 10·6·3은 **첫 문장** 통계이며 예산 판정과 무관하다.)

  **(b) 소급 이전을 정말 하지 않는가** — 제안은 하지 않는 쪽이다.

## Execution Plan

쓰기 범위 때문에 실행이 **셋으로** 갈린다. dev는 규약·지시 문서(안내 블록·런북·에이전트 정의·README)를 고칠 수 없고 — 1단계에서 확장된 뒤에도 dev의 루트 쓰기는 계획서·백로그·자기 보고서 폴더 셋뿐이다(제안 B) — `apps/admin/CLAUDE.md`는 `admin-dev`에게도 읽기 전용이다.

**1단계 — 메인 루프 직접 작업 (루트 문서)**

1. `docs/agents/README.md` 작성 — 경로 규약, append-only, `main-loop` 예외, 근거 작성 주체 규칙(pm 선정/소유자 발주), 게이트 결정의 기록 목적지(`main-loop/<항목ID>.md`), **고정명 닫힌 목록**(`감사기록.md`·`정찰기록.md`)
2. `PROJECT_BOARD.md` 안내 블록에 150자 예산 규칙과 인수 조건 수정 반영
3. `CLAUDE.md` 문서 지도·파이프라인 절차·에이전트 표 쓰기 범위 열 갱신
4. `.claude/agents/{pm,admin-dev,web-dev,doc-auditor}.md` 갱신
5. `docs/plans/README.md` 원칙 위치 갱신

**2단계 — 보드 항목으로 `admin-dev`에 발주 (`apps/admin`)**

6. 보고 줄 항목 ID 표시 + `overBudget` 순수 함수와 표시
7. `entities/agent-report/` 신설(api+model), `FSD_EFFECT_OWNERS.fetch`에 경로 추가 — **같은 커밋에서 원자적으로**(등록을 빼면 `[R13] network call is outside the approved fetch owners`로 종료코드 1)
8. `board.ts:87` 중복 `결과:` 누적 처리
9. 책상에서 폴더 목록 진입

**3단계 — 메인 루프가 워크스페이스 지시 문서를 동기화**

10. `apps/admin/CLAUDE.md`의 「데이터와 외부 효과 소유권」에 다섯 번째 owner 한 줄, 「테스트 인벤토리」 수치 갱신
11. `remote-agent-pipeline-generalization.md` C절에 「읽기 ③ 행위자 보고서」 추가 — contents API·`max-age=60`·404=아직 기록 없음·기존 토큰 재사용을 명세 형식으로

이 단계를 2단계에 합치지 않는 이유는 **`apps/admin/CLAUDE.md`가 `admin-dev`에게 읽기 전용**이기 때문이다(FEAT-08·FEAT-10 모두 "메인 루프가 처리한다"로 남겼다). 그리고 이 동기화를 handoff에서 빠뜨리는 것이 **FEAT-10 결함 ⑳ 그 자체**였다 — 반드시 별도 단계로 남긴다.

순서: 1단계가 먼저다. 규약이 없는 상태에서 화면이 예산 초과를 표시하면 근거 문서가 없다. 3단계는 2단계 직후에 붙인다 — 미루면 지시 문서가 코드보다 낡는다.

## Verification Plan

**1단계(루트 문서) 검증 — 2단계에 의존하지 않는다.**

문서만 바뀌는 단계에도 기계 검증이 필요하다. 보드 안내 블록을 고치면 파서가 읽는 본문이 함께 흔들릴 수 있기 때문이다.

> **`npm test`는 이 일을 하지 못한다.** `board.test.mjs`와 `briefing.test.mjs`는 **자체 픽스처 문자열**을 파싱하며 실제 `PROJECT_BOARD.md`를 읽지 않는다(실측). 보드를 어떻게 망가뜨려도 통과한다. 실제 보드를 검증하려면 아래처럼 **파서를 실물에 직접 돌려야 한다.**

```bash
# 저장소 루트에서 (실측 검증된 형태)
node --import tsx -e "
import('./apps/admin/src/fsd/entities/pipeline/model/board.ts').then(async (m) => {
  const { readFileSync } = await import('node:fs');
  const items = m.parseBoard(readFileSync('PROJECT_BOARD.md','utf8')).flatMap((s) => s.items);
  console.log('항목', items.length);
});
"
```

- 기준: 편집 **전후로 항목 수가 같아야 한다.** 현재 기준선은 **섹션 6 / 항목 11**(상태 `완료` 10 · `보류` 1, 2026-08-18 실측)
- 근거: 안내 블록은 `>` 인용이라 파서가 건너뛴다(`board.ts:31`). 그러므로 안내 블록을 늘려도 항목 수는 변하면 안 된다 — 변했다면 편집이 인용 밖으로 샌 것이다
- PowerShell에서는 위 인용부호 중첩이 까다로우므로 같은 내용을 임시 스크립트 파일로 저장해 실행한다
- 추가로 `doc-auditor`를 디스패치해 새 문서 집합(`docs/agents/README.md` 포함)의 상호 주장이 코드와 어긋나지 않는지 확인한다

**2단계(`apps/admin` 코드) 검증.**

```powershell
npm run check -w apps/admin
npm test -w apps/admin
npm run verify:fsd:final -w apps/admin
$env:SENTRY_DISABLE_AUTO_UPLOAD = "true"; npm run build -w apps/admin
```

> 빌드 명령은 **PowerShell 문법이어야 한다.** `apps/admin/CLAUDE.md`가 *"shell 명령에는 현재 PowerShell 문법을 사용한다"*고 지시하며, `SENTRY_DISABLE_AUTO_UPLOAD=true npm run build` 형태는 PowerShell에서 파싱은 되지만 **실행 시 실패한다**(실측 — 인라인 env-var 접두를 명령 이름으로 해석). Bash 세션에서는 `SENTRY_DISABLE_AUTO_UPLOAD=true npm run build -w apps/admin`을 쓴다.

검증 기준:

- 네 명령 모두 exit 0
- `verify:fsd:final`이 fetch owner 목록을 정확히 대조 — `:665-673`은 개수가 아니라 **정렬된 경로 목록 문자열 비교**라 새 경로 철자가 정확해야 한다
- `briefing.test.mjs`의 기존 단언이 깨지지 않고, 항목 ID 표시와 `overBudget` 단언이 추가되어 통과
- 기존 실패와 신규 실패 구분: **변경 전 기준선을 실측했다 — 173 test / 39 suite / 0 fail**(2026-08-18 `npm test -w apps/admin`). 이 수가 줄면 신규 실패다
- 2단계 완료 후 실제 보드를 대시보드로 렌더해 예산 초과 표시가 **17개 필드**에 뜨는지 육안 확인(필드 전체 기준 실측치)

**3단계(워크스페이스 지시 문서) 검증.**

- `apps/admin/CLAUDE.md`의 owner 목록이 `FSD_EFFECT_OWNERS.fetch`의 다섯 경로와 **일대일로 일치**하는지 대조한다
- 「테스트 인벤토리」의 파일·suite·test 수가 `npm test -w apps/admin` 실제 출력과 일치하는지 대조한다
- 이 단계에 검증을 붙이는 이유는 FEAT-10 결함 ⑳이 정확히 "동기화를 안 해서 지시 문서가 코드보다 낡은" 사례였기 때문이다. 동기화만 하고 대조하지 않으면 같은 결함을 다른 값으로 재생산한다

## Verification Results

이 제안은 작성 전후로 **설계 타당성 시험 25건**을 거쳤다(작성 전 9건 + 대조 검증 1회차 4건 + 2회차 3건 + 3회차 2건 + 4회차 2건 + 5회차 2건 + 6회차 1건 + 7회차 1건 + 8회차 1건 — 아래 표의 설계 타당성 행 수와 일치). 아래가 그 결과이며, 위 Verification Plan의 **구현 검증**은 아직 실행 전이다.

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| FEAT-10 소급 시험 (인수 조건 넷 재현) | **통과** | 인수가 참조하는 증거는 전부 `결과②`에 있고 `근거` 3,858자는 인수에 쓰이지 않는다. 인수 조건 넷의 비교 대상은 보드 필드가 아니라 계획서·diff·명령·백로그이므로 감압 후에도 그대로 유효하다(제안 E-1) |
| `gh api repos/Sangeok/ApcH/contents/docs/plans?ref=dev` | **통과** | 파일 12개, 응답 9,140B. 상위 `docs/`에서 하위 폴더 열거도 확인 |
| `curl raw.githubusercontent.com/.../docs/plans/` | **404** | raw CDN은 디렉터리 목록 불가 → 새 fetch owner 필요(owner 4→5) |
| contents API 캐시·한도 헤더 | `max-age=60`, 미인증 `X-RateLimit-Limit: 60` | 보드 raw(`max-age=300`)보다 5배 신선. 미인증 한도는 부족하므로 기존 토큰 사용 |
| 없는 폴더 요청 | **404** | 폴더 지연 생성 정책상 정상 경로 — 화면이 "아직 기록 없음"으로 처리해야 한다 |
| 예산 전수 측정 — **첫 문장** 기준 (22개 필드) | 최소 33 / 중앙 53 / 최대 298자 | 100자 → 10/22, 150자 → 6/22, 200자 → 3/22. **이 통계는 예산 판정과 무관하다**(아래 행이 판정 기준) |
| 예산 전수 측정 — **필드 전체** 기준 (22개 필드) | **150자 초과 17/22** | 100자 → 21/22, 150자 → 17/22, 200자 → 16/22. `결과`는 최솟값 227자라 **어떤 예산에서도 11/11 초과**. 예산이 가르는 것은 `근거`뿐 |
| `overBudget` 대상 검증 | **수정 발생** | 문서가 "6개 초과"라 적었으나 `text.length > 150`은 필드 전체를 재므로 **17개**. 첫 문장 통계를 필드 기준으로 오용한 것 — A·D·Approval 세 곳 정정 |
| 1단계 검증 명령 실효성 | **수정 발생** | `board.test.mjs`·`briefing.test.mjs`가 **자체 픽스처**를 파싱하며 실제 `PROJECT_BOARD.md`를 읽지 않음 → `npm test`로는 편집된 보드를 검증할 수 없다. 실물 파서 실행 명령으로 교체(실측 검증: 섹션 6 / 항목 11) |
| 작성자 능력 검사 | **수정 발생** | `pm.md:22`가 파일 생성을 금지 → `docs/agents/pm/`은 존재할 수 없다. 행위자 6 → 5 |
| 기계 작성 `결과:` 줄 검사 | **수정 발생** | `holdResultLine`이 3문장·**실측 98자** → "한 문장" 규칙이면 코드가 규칙 위반. 글자 수 예산으로 변경 |
| `ls .github/workflows` | **없음** | CI 게이트 불가 → 강제 장치를 대시보드에 둔다 |
| PowerShell에서 `VAR=true npm run build` 실행 | **실패** | 파싱은 되나 실행 시 인라인 env-var 접두를 명령 이름으로 해석. 검증 명령을 `$env:VAR = "true"; …`로 교체 |
| `FSD_EFFECT_OWNERS` 구조 확인 (`:30-43`, `:665-673`) | **확인** | fetch owner는 개수가 아니라 **정확한 경로 Set**이고 `--final`이 정렬 목록을 문자열 비교한다. "4→5"는 축약 표기이며 실제 변경은 경로 한 줄 추가 |
| FSD 배치 규약 대조 | **확인** | `apps/web/docs/conventions/fsd-architecture-guidelines.md:88` 규칙 1에 따라 `entities/agent-report/`가 맞다. FEAT-10 ⑲의 `[R1]` 제약은 상향 임포트가 없어 적용되지 않는다 |
| `npm test -w apps/admin` (변경 전 기준선) | **173 test / 39 suite / 0 fail** | 2026-08-18 실측. 신규 실패 판정의 기준선 |
| **E-4 스크래치 적용 시험** — 이어붙임 패치를 실제 `board.ts`에 적용 후 전 배터리 | **173/173 통과** | "기존 테스트 무영향" 주장 실증. 기존 테스트에 중복 필드 케이스 없음도 확인. 시험 후 원복 |
| 패치 상태에서 실제 보드 파싱 | FEAT-10 `result` **2,974자로 복원** | 788+공백+2,185 — 사라지던 `결과①`이 돌아온다. `firstSentence`가 `결과①`("계획서 작성 완료…")로 바뀜(제안의 예측대로). 중복 없는 FEAT-09는 1,677자 불변 |
| 교차 문서 전파 대조 — 일반화 명세 | **수정 발생** | C절이 대시보드 읽기 경로를 ①②로 전수 열거하는데 이 제안이 셋째를 추가 — 동기화 전례(`5261af4` 등 3회)가 있는 문서가 Affected Files에 없었다(결함 ⑳과 같은 부류를 자기가 저지름). 3단계 11번으로 추가 |
| 교차 제안 충돌 점검 — `admin-src-fsd-contract-hardening.md` | **규약 충돌 없음, 표면 겹침 있음** | 포함 범위가 auth·analytics·디코드·Sentry라 `docs/agents/` 규약과 무관. 단 "pipeline board diagnostics와 warning banner"가 briefing·UI 표면과 겹침 → 순차 실행 위험으로 기록 |
| `근거` 작성 주체 전수 대조 (11행) | **수정 발생** | "근거 소유자는 pm" 규칙이 실측과 모순 — pm 작성은 **3/11뿐**, 소유자 발주 7 + 사후 기록 1. 규칙을 "행을 만드는 주체가 쓴다"로 정정 |
| 게이트 결정 기록의 목적지 감사 | **수정 발생** | "보드에 쌓지 않는다"만 있고 목적지가 없었다 — FEAT-09 게이트②류의 제품 결정 기록이 증발하는 불완전 전이. `main-loop/<항목ID>.md`로 확정 |
| 제안 내부 규칙 충돌 검사 — dev 쓰기 범위 | **수정 발생** | Execution Plan이 인용하는 표(`CLAUDE.md:20-21` "자기 워크스페이스 + 보드 자기 행")대로면 dev는 제안 B가 요구하는 루트 `docs/agents/<자기이름>/` 보고서를 **쓸 수 없다** — 자기모순. 표의 쓰기 범위 열 갱신을 Affected Files·1단계 3번에 추가(계획서·백로그 관행 명문화 포함) |
| 1단계 구현 예행 — README를 제안만으로 쓸 수 있나 | **수정 발생** | `<고정명>`이 자리표시자로만 있고 실제 이름이 미정의 — 계산 원칙의 입력값을 작성자가 발명하게 됨. 닫힌 목록(`감사기록.md`·`정찰기록.md`)으로 확정, 증설 규칙 명시. 그 외 항목(경로·append-only·예외·주체·목적지·예산·404)은 전부 제안에 있어 발명 없이 작성 가능 |
| Affected Files 집계 기계 재계산 | **수정 발생** | "문서 10 + 코드 11"이 표 실측과 불일치(코드 10 + keep 1) — 4회차에 일반화 명세를 문서로 더할 때 `apps/admin/CLAUDE.md`가 이중 계상됨. 변경·신설 20으로 정정 |
| `npm run check -w apps/admin` | Not run yet | 구현 후 exit 0 |
| `npm test -w apps/admin` | Not run yet | 기준선 173 test 유지 + 신규 단언 |
| `npm run verify:fsd:final -w apps/admin` | Not run yet | fetch owner 정확히 5 |
| `npm run build -w apps/admin` | Not run yet | exit 0 |

## Risks and Rollback

잔여 리스크:

- **규약 재팽창.** 150자 예산이 지켜지지 않으면 보드가 다시 부푼다. CI가 없어 기계적 차단이 불가능하고, 방어는 대시보드 표시(즉시)와 `doc-auditor` 감사(사후) 둘뿐이다. 지금 6,800자가 된 것도 아무도 막지 않았기 때문이다
- **화면 깊이의 일시적 후퇴.** 폴더 목록 뷰(Execution Plan 7·9)가 빠진 채 감압만 하면, 펼침에서 2,185자를 보던 것이 150자로 줄고 나머지는 GitHub으로 나간다. 1단계와 2단계를 같이 내야 한다
- **보고서 누락.** 메인 루프가 기록을 빠뜨리면 상세가 아예 사라진다 — 지금은 최소한 보드에 남는다. 인수 조건에 보고서 존재 확인을 넣는 것이 유일한 방어다
- **설계의 실측 이력이 짧다.** 위 시험 25건 중 구현 검증에 해당하는 것은 E-4 스크래치 적용 하나뿐이고 나머지는 설계 타당성이다. 이 프로젝트의 기준(FEAT-10 계획서는 18라운드 검증)으로는 아직 얕다
- **에이전트 준수는 사전에 잴 수 없다.** 시간이 지나도 규칙이 지켜지는지는 관측으로만 알 수 있다
- **동시 제안 표면 겹침.** `admin-src-fsd-contract-hardening.md`(awaiting-approval)의 포함 범위에 "pipeline board diagnostics와 warning banner"가 있어, 승인 시 이 제안의 2단계와 **같은 파일 표면**(briefing·pipeline UI)을 만질 수 있다. 규약 충돌은 없으나(그쪽은 auth·analytics·디코드·Sentry 중심) 동시 실행은 피한다 — 같은 저장소에 두 실행자가 동시에 쓰는 문제는 FEAT-11 근거가 기록한 실제 전례(충돌 2회)다. 둘 다 승인되면 순차 실행하고 뒤쪽이 먼저 것 위에 재계획한다

롤백 방법:

- **1단계(문서)**: 문서 변경 커밋을 revert하면 규약이 원상복귀한다. 다만 그 사이 새 형식으로 작성된 보드 행과 `docs/agents/` 아래 보고서는 남는다 — 보고서는 삭제하지 않고 두어도 무해하다(참조하는 코드는 2단계에만 있다)
- **2단계(코드)**: 구현 커밋 revert + `verify-fsd-boundaries.mjs`의 `FSD_EFFECT_OWNERS.fetch`에서 추가한 경로를 제거한다. 이 둘은 같은 커밋에서 원자적으로 처리한다(FEAT-10의 3→4 전례와 동일)
- **3단계(참조 문서)**: `apps/admin/CLAUDE.md`의 owner 줄·테스트 수치와 `remote-agent-pipeline-generalization.md`의 「읽기 ③」을 2단계 revert와 **같이** 되돌린다. 한쪽만 되돌리면 참조 문서가 코드와 어긋나며, 그것이 애초에 FEAT-10 결함 ⑳이 만든 상태다
- 소급 이전을 하지 않으므로 기존 11행은 어느 경우에도 손상되지 않는다

## Completion or Closure Notes

완료 또는 닫힘 처리 후 `completed/`로 이동할 때 작성한다.

**구현 기록(2026-08-18, 메인 루프 직접 실행).** 소유자 지시로 `completed/`로 이동했다.

검증(직접 실행, 넷 다 exit 0): `npm test` **182 pass·0 fail**(기준선 173 → +9) · `npm run check` exit 0(경계 12/12·ESLint 0·tsc 0) · `verify:fsd:final` exit 0(fetch owner 정확히 5) · `build` exit 0(`/pipeline` 4.62 kB). 1단계 검증으로 편집된 보드가 섹션 6·항목 11을 유지함을 실물 파서로 확인.

화면 실측: 보고 줄 **11/11이 자기 항목 ID로 시작**(감압 전 0/11), FEAT-10 줄이 사라졌던 `결과①`("계획서 작성 완료…")로 복원, 옛 11행 전부가 150자 초과로 표시.

**구현 중 잡힌 결함 둘(제안서에 없던 것)**: (1) 새 slice가 `entities/pipeline` 좌표를 임포트해 `[R2] peer slice import is forbidden`으로 종료코드 1 — 제안서는 entities 배치 가능성만 확인했고 peer 제약은 다루지 않았다. 좌표 자체 보유로 해결. (2) `parseReportIndex`가 `localeCompare`를 써 한글 파일명 순서가 로캘마다 달랐다 — "결정적 정렬"을 명세한 테스트가 잡았고 코드포인트 비교로 교체.

**스케치 대비 차이**: 폴더 목록을 "클릭 시 온디맨드"가 아니라 **서버 렌더 네이티브 `<details>`**로 구현했다. 이 화면의 기존 성질(FeedZone도 네이티브 `<details>`, 클라이언트 JS 0)과 맞추는 쪽을 택했고 요청 수는 부모 1회 + 실재 폴더 수다.

**절차 부채(기록)**: 메인 루프가 구현 중 보드에 `FEAT-12` 행을 임의로 신설했다 — 백로그에 없는 ID를 발명하고 게이트①②를 건너뛰고 로스터에 없는 `agent: main-loop`을 썼다. 소유자 지적으로 행을 제거하고 보드를 원상복귀했다(섹션 6·항목 11). FEAT-11이 같은 부류의 부채를 기록한 지 하루 만의 재발이다. **결말(2026-08-18)**: 소유자가 사후 기록 형태를 지시해 `FEAT-12` 행을 정상 절차로 다시 넣었다(`31f9464`) — `agent: admin-dev`(로스터 소속), `근거`에 게이트 미경유를 명시, `결과`가 이 문서를 상세로 가리킨다. 같은 커밋에서 인수 조건 다섯째를 「`결과`가 가리키는 상세 기록의 실재 확인」으로 넓혔다 — 이 작업의 상세가 `docs/agents/`가 아니라 이 제안서에 있어서 첫 적용 사례부터 원래 문구를 위반했기 때문이다.

**못 덮음(Node 러너·DOM/외부 I/O 없음)**: `getAgentReports`·`getAgentReportIndex`의 실제 fetch, 404→빈 목록 분기, 토큰 유무 분기, `DeskReports` 렌더·`<details>` 펼침, `BudgetFlag` 시각 — 배포 후 수동 확인 대상.

완료 기록(`status: "completed"`일 때 작성):

- completed-at: 2026-08-18
- verification-summary: `npm test` 182 pass·0 fail(기준선 173 → +9) · `npm run check` exit 0(경계 12/12·ESLint 0·tsc 0) · `npm run verify:fsd:final` exit 0(fetch owner 정확히 5) · `npm run build` exit 0(`/pipeline` 4.62 kB). 1단계 검증으로 편집된 실물 보드가 섹션 6·항목 11을 유지함을 파서로 확인. 신규 실패 0건.
- implementation PR/commit: PR [#96](https://github.com/Sangeok/ApcH/pull/96) — `328fd0c`(제안서+규약 9파일) · `e85ae29`(코드 14파일) · `e8a59e8`(참조 문서 2파일) · `61b6e32`(제안서 completed/ 이동) · `31f9464`(보드 `FEAT-12` 행 + 인수 조건, 2파일)
- changed files summary: 25파일 +866 −31. 신설 8(`docs/agents/README.md`, `entities/agent-report/` 6, `report-index.test.mjs`), 수정 17(보드 안내 블록·런북·에이전트 정의 4종·`docs/plans/README.md`·`briefing.ts`·`board.ts`·UI 3·경계 스크립트·`apps/admin/CLAUDE.md`·일반화 명세).
- remaining follow-up: **(1)** 행위자 폴더가 0개라 책상 목록이 아직 비어 있다 — 첫 보고서가 쓰여야 실물로 동작한다(지연 생성 설계대로). **(2)** 배포 후 수동 확인: 실제 fetch·404→빈 목록·토큰 유무 분기·`<details>` 펼침·`BudgetFlag` 시각. **(3)** ~~보드 기록 형태 미정~~ → 해소. `FEAT-12` 행을 `31f9464`로 기록했고 인수 조건 다섯째를 함께 넓혔다(아래 절차 부채의 「결말」 참조). **(4)** 자매 제안 `admin-src-fsd-contract-hardening.md`와 briefing·UI 표면이 겹치므로 순차 실행할 것.

닫힘 기록(`status: "closed"`일 때 작성):

- closed-at: TBD
- closed-by: TBD
- closed-reason: TBD
- close summary: TBD
- remaining follow-up: TBD

## Review Checklist

- [x] 모든 `{placeholder}`를 처리했고, pending 문서의 완료/닫힘 전용 `TBD` 외에는 현재 상태에 맞게 갱신했다.
- [x] `status`는 `pending`, `completed`, `closed`만 사용했다.
- [x] 문서 위치와 `status`가 일치한다. `active/`는 `pending`, `completed/`는 `completed` 또는 `closed`다. — `completed/`로 이동함
- [x] `stage`는 pending 문서에서만 사용했고, `completed` 또는 `closed` 문서에서는 `stage: null`로 갱신했다. — 완료 이동 시 `null`로 갱신함
- [x] `stage: "approved"`라면 `approved-by`, `approved-at`, `approval-scope`가 모두 채워져 있다. — 승인 시 셋 다 채웠고, 완료 이동으로 `stage: null`이 됨
- [x] `proposal-size`는 `small` 또는 `standard`만 사용했고, standard 강제 조건에 해당하는 작업을 small로 낮추지 않았다.
- [x] 승인 기록은 front matter를 단일 기준으로 사용하고, 본문 `Approval` 섹션에는 승인 조건과 참고 메모만 적었다.
- [x] 변경 범위와 제외 범위가 명확하다.
- [x] 영향 파일별 작업과 판단 근거가 적혀 있다.
- [x] 안전성 분석에서 라우팅, import, 자산, 타입, 런타임 side effect를 필요한 만큼 확인했다.
- [x] 검증 명령과 성공 기준이 적혀 있다.
- [x] 검증 실패가 있다면 기존 실패와 신규 실패를 구분했다.
- [x] 잔여 리스크를 명시했다. 없으면 "없음"이라고 적었다.
- [x] 완료 문서라면 `completed-at`, `verification-summary`, Completion or Closure Notes가 실제 수행 결과로 갱신되어 있다.
- [x] 닫힌 문서라면 `closed-at`, `closed-by`, `closed-reason`, Completion or Closure Notes가 닫힘 결정과 일치한다. — 해당 없음(`closed`가 아니라 `completed`)
