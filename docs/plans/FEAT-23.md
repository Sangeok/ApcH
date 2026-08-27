# FEAT-23: 항목 카드에 파이프라인 여정 스테퍼 — 전체 단계·현재 위치·다음 단계 표시

agent: admin-dev

> template.md의 절 구조를 따르되, **admin-dev 역할 규칙(UI 작업이면 「디자인 방향」을 절로 남긴다)**에 따라
> 「현재 동작」과 「문제」 사이에 `## 디자인 방향` 절 하나를 추가했다(FEAT-04/07/13/24 계획과 동일 구조).
> 새 화면이 아니라 **기존 결재함 카드**(FEAT-04·13이 만든 말풍선 카드)에 여정 위치를 나르는 작은 레일을 얹는
> 변경이므로, 방향의 임무는 그 레일과 "누구를 기다리는지" 표식의 명세다.

## 현재 동작

- 결재함 카드는 `src/fsd/pages/pipeline/ui/index.tsx:165`의 `InboxCard`가 그린다. 카드는 위→아래로 발화 주체(`:173-181`) → 발화 한 줄(`:182` `<p className="text-lg text-stamp">{item.line}</p>`) → 메타·게이트 블록(`GateCardLock`으로 감싼 `:183-207`) → 문서 링크(`:208`) → 근거 details(`:209-218`) 순서다.
- 메타 행(`:184-191`)이 항목의 "지금 상태"를 나르는 유일한 곳이다: `{item.id} · {item.status}`(`:186`), 검토대기면 `ValidationMark`(`:187-189`), 예산 초과면 `BudgetFlag`(`:190`). `ValidationMark`(`:62-81`, FEAT-13)는 `검증:` 필드 유무로 **부서(countersign) 칩**(있으면 실선 active `검증 통과`, 없으면 점선 hold `검증 전`)만 보인다.
- **여정 전 과정에서의 위치를 나르는 요소는 없다.** 카드는 status 낱말 하나(`:186`)와 검증 이진 칩(`:187-189`)만 보인다 — 선정→게이트①→계획서→검증→게이트②→구현→인수 중 어디까지 왔고 다음이 무엇이며 지금 누구를 기다리는지는 화면에 없다. status 낱말(`승인대기`·`검토대기`)을 여정 위치로 옮기려면 보는 사람이 상태 기계를 외우고 있어야 한다.
- 스테퍼가 읽을 데이터는 이미 모든 결재함 `SpeechItem`에 있다. `SpeechItem`은 `status: string | null`(`src/fsd/pages/pipeline/model/briefing.ts:17`)과 `validation: string | null`(`briefing.ts:19`)을 나른다. `inboxSpeech`가 승인대기 분기에서 `validation: null`(`briefing.ts:110`)을, 검토대기 분기에서 `validation: item.validation`(`briefing.ts:125`)을 채운다. 결재함 필터는 `승인대기`·`검토대기`뿐이다(`briefing.ts:266-268`, `isGateTransitionSource`). 나머지 status(계획지시·구현승인·완료·보류·null)는 보고 피드로 간다(`briefing.ts:269-271`).
- `validation`의 원천은 보드 파서다. `parseBoard`가 `검증:` 줄을 `BoardItem.validation`(`src/fsd/entities/pipeline/model/board.ts:13`, FIELD_RE `:23`, 대입 `:96-98`)에 담고, 메인 루프는 **검증 클린 패스일 때만** 이 줄을 쓴다(보드 안내 규약 — `board.ts:13` 주석). 줄이 없으면 `validation === null`이다. 즉 "검증 판정 존재 = 검증 통과"다(FEAT-13이 세운 계약).
- 색 토큰은 이미 다 있다. `--stamp`(호박, `styles/globals.css:85`)·`--active`(남색, `:87`)·`--silence`(흑연, `:88`)·`--hold`(주홍, `:89`)와 `--muted-foreground`가 있고, `@theme inline`의 `--color-*` 매핑(`:36-41`)이 `text-stamp`·`bg-active`·`text-silence` 등 유틸을 방출한다. 팔레트는 의도적으로 절제돼 초록이 없다(`:84` 주석). FEAT-13의 `ValidationMark`가 이미 `text-active`·`border-active/60`·`bg-active/10`·`text-hold`·`border-hold/60`를 써서 이 토큰들이 방출됨을 실증했다(`:66-77`).
- FSD 배치: 페이지-사설 순수 모델은 `pages/pipeline/model/`, 페이지-사설 UI는 `ui/_component/`에 산다(`agent-avatar.tsx`·`owner-banner.tsx`·`pixel-office.tsx`가 그 자리). 페이지 public API(`pages/pipeline/index.ts`)는 `PipelineBriefing`과 briefing 모델만 재수출한다 — 새 모델·컴포넌트는 슬라이스 내부 상대 import로 쓰이므로 재수출이 필요 없다. 보드는 `entities/pipeline`이 이미 한 번 읽으므로 새 fetch owner가 없다.

## 디자인 방향

_(frontend-design 스킬 2-pass 결과. 새 화면이 아니라 기존 결재함 카드에 여정 레일 하나와 "누구를 기다리는지" 표식을 더하는 것이므로, 방향은 그 두 요소에 집중한다. 사용자가 게이트에서 생김새를 판단할 근거.)_

**대상 세계 (기존 세계의 연장).** FEAT-04가 이 화면을 **결재 서류를 든 팀원의 말풍선**으로, FEAT-13이 게이트 버튼 옆에 **부서(countersign) 칩**으로 확정했다. 이 항목이 더하는 것은 그 서류의 **결재 경로 도장란** — 서류가 어느 결재선(선정→게이트①→…→인수)의 어디에 와 있는지 보이는 진행 레일이다. 새 은유를 들이지 않는다. 게이트 버튼이 "당신의 도장"이고 부서 칩이 "리뷰어의 부서"라면, 이 레일은 그 서류가 지나온 도장란과 아직 빈 칸을 한눈에 보이는 **결재 경로**다.

**팔레트 (신규 토큰 없음).** 브리핑 tone 토큰을 그대로 잇는다(FEAT-13·24가 새 색 없이 재사용한 규율). 스테퍼의 유일한 발상은 **현재 노드의 색이 곧 "누구를 기다리는지"**라는 점이다 — 색이 의미를 나른다(색+낱말 이중 전달로 접근성 확보):
- **지나온 단계(done)** → `--silence`(흑연). "이미 도장 찍힘 · 침묵." 가라앉은 작은 채움 점.
- **현재 단계(current) · 사용자 게이트(게이트①/②)** → `--stamp`(호박). **당신의 도장을 기다리는 빈 인장** — 결재함 카드 바탕(stamp-soft)·게이트 버튼 잉크·FEAT-13 통과 칩과 같은 호박이라, 레일의 호박 노드가 "여기가 당신 차례"를 카드 전체의 결재 어휘로 말한다. 채움이 아니라 **빈 링**(아직 안 찍힌 인장).
- **현재 단계(current) · 검증/작업(검증·계획서·구현)** → `--active`(남색). "지금 팀이 돌고 있다" — FEAT-13 통과 칩·FEAT-10/24 진행색과 같은 남색. **채운 노드**(진행 중).
- **아직 오지 않은 단계(upcoming)** → `--muted-foreground`(옅게). 빈 헤어라인 링. "아직 도장란이 비었다."

즉 호박=당신, 남색=팀. 이 한 축이 "누구를 기다리는지"(백로그 요구·main-loop 판단 3)를 색으로 인코딩한다.

**타이포 역할 (신규 서체·급 없음).** 단계 라벨과 캡션은 메타 행의 유틸 등급(`text-[10px] leading-4`·`text-xs`)을 쓴다 — `ValidationMark`·`BudgetFlag`와 같은 계층이다. **디스플레이 세리프를 쓰지 않는다**(FEAT-13의 규율: "메타 행에 디스플레이 서체를 들이면 소음이다"). 목소리는 결재함 발화 한 줄(큰 세리프)이 가진다. 스테퍼는 조용한 지도다.

**레이아웃 개념 — 발화와 결정 사이의 지도.** 스테퍼는 발화 한 줄(`:182`) **바로 아래**, 메타·게이트 블록(`:183`) **위**에 온다. 읽기 순서: 누가(아바타) → 무엇을 말하나(발화) → **어디까지 왔나(레일)** → 무엇을 할까(게이트 버튼). 지도가 그것을 게이트해야 할 행동 바로 앞에 온다(FEAT-13 배치 논거의 연장). `GateCardLock` **밖**에 둔다 — 레일은 잠금 상태와 무관한 방위이지 액션이 아니다.

```
데스크톱(sm↑, max-w-2xl 카드 안)
  🛠 admin-dev · 어드민 개발
  "FEAT-04 계획서를 올렸습니다 — 2일째 검토 대기 중입니다."
  ●──●──●──◍··○··○··○         ← 7 노드 레일(현재=검증, 남색 채움)
  선정 게이트① 계획서 검증 게이트② 구현 인수   ← 단계 라벨(현재만 강조)
  지금 검증 · [검증 중] · 다음 게이트②          ← 캡션(낱말)
  FEAT-04 · 검토대기  [검증 전]        [ 구현승인 ]

폰(sm 미만)
  "FEAT-04 계획서를 올렸습니다 …"
  ●──●──●──◍··○··○··○         ← 레일만(라벨은 숨김)
  지금 검증 · [검증 중] · 다음 게이트②          ← 캡션이 낱말을 나른다
```

**시그니처 요소 — 결재 경로 레일 (색=대기 주체).** 이 항목이 기억될 한 요소. 7 노드 + 연결선이되, **현재 노드의 색·형태가 대기 주체를 말한다**: 호박 빈 링 = 당신의 도장 대기, 남색 채움 = 팀 진행 중. 지나온 단계는 흑연 채움(도장 찍힘), 앞 단계는 옅은 빈 링(빈 도장란). 일반 체크아웃 스테퍼(번호 01/02/03·체크 아이콘)가 아니라 이 파이프라인의 실제 결재선을 이름 있는 단계로 보인다 — 단계가 진짜 순서(파이프라인)라 연결 레일이 정직한 구조다(장식 아님). **번호·체크 아이콘을 넣지 않는다**(Chanel: 악세서리 하나 빼기) — 노드 색/형태와 라벨이 상태를 이미 나른다.

**반응형 — 폰에서 라벨을 스케일에 얹지 않는다(BUG-07 교훈).** 7개 단계 라벨을 폰 카드 폭(~300px)에 가로로 밀어넣지 않는다 — BUG-07이 텍스트를 축소 좌표계에 얹어 판독 불가가 된 그 실패다. 대신:
- **노드 레일(점+연결선)은 항상** 보인다 — flex·gap이라 폭에 맞게 균등 축소돼도 점은 판독된다(위치·진척 = 시각).
- **단계 라벨(7개)은 `sm↑`에서만** 노드 아래로 편다(`hidden sm:block`) — 672px 카드에서 7 라벨은 여유롭게 든다.
- **캡션 한 줄(현재·대기 주체·다음, 낱말)은 항상** 보인다 — 폰에서 "전체 단계 이름"은 못 펴지만 **현재/다음 단계 이름과 누구를 기다리는지**는 낱말로 늘 전한다. 요구(전체 단계·현재 위치·다음 단계)는 데스크톱에서 라벨로, 폰에서 노드(전체 위치)+캡션(현재·다음·주체)으로 충족된다.

**모션 — 없음.** 현재 노드는 크기(size-2.5 vs 1.5)와 색/형태로 강조하고 **맥박을 넣지 않는다.** 결재함 카드는 이미 호박 바탕으로 "결정 대기"를 말하고, 레일의 임무는 경보가 아니라 방위다. 신규 keyframe 없음(FEAT-13처럼 정적). 자기 비평에서 "현재 노드 pulse"를 검토했으나 버렸다 — 카드가 이미 시급성을 말하고, 정지 인장이 "찍히길 기다리는 도장"의 은유에 맞다(도장은 깜빡이지 않는다).

**접근성 바닥.** 노드·연결선은 `aria-hidden`(장식). 레일 `<ol>`에 `aria-label="파이프라인 여정"`, 상태는 **캡션 낱말**로 전한다(색 단독 아님). 캡션은 항상 렌더돼 폰(라벨 숨김)에서도 스크린리더가 현재·다음·주체를 읽는다. 키보드 상호작용 없음(순수 표시, 클릭 없음).

**자기 비평(2-pass).** 초안은 "가로 진행바 + 퍼센트"였다 — 버렸다. 여정은 이산 단계라 퍼센트가 의미 없고, 진행바는 이 파이프라인의 단계 어휘(선정·게이트·검증·인수)를 잃는다. 대신 (1) 이름 있는 노드 레일로 실제 결재선을 보이고, (2) 현재 노드 색을 대기 주체에 매핑해 "누구를 기다리는지"를 이미 있는 tone 토큰 안에서 인코딩했다(새 색 0). 또 폰에서 7 라벨을 접어 BUG-07을 피하고, 번호·체크·맥박을 빼 결재 어휘의 절제를 지켰다. AI 기본값(번호 스테퍼·퍼센트 바)이 아닌, 이 브리프의 결재 세계 고유의 지도다.

## 문제

백로그 `source`(요구 원천, `TASK_BACKLOG.md:26-28`)가 지목한 것: 대시보드가 항목의 "지금 상태"(status 낱말 `index.tsx:186` · 검증 칩 `:187-189` · 문서 링크 · 책상 말풍선)는 보여주지만, **파이프라인 전 과정(선정→게이트①→계획서→검증→게이트②→구현→인수)에서 어디까지 왔고 다음이 무엇이며 지금 누구를 기다리는지는 보여주지 않는다** — status 낱말을 여정 위치로 해석하려면 상태 기계를 외우고 있어야 한다.

백로그 진단(코드 확정)과 코드가 일치한다: 필요한 데이터는 보드 파서가 이미 다 뽑고(`board.ts`의 status + `검증:` 줄) 결재함 `SpeechItem`이 이미 나른다(`briefing.ts:17`·`:19`). 부족한 것은 **status(+검증 판정)를 여정 단계 인덱스로 옮기는 결정적 순수 매핑**과 그것을 그리는 **스테퍼 UI**뿐이다 — 새 데이터원·fetch·DB 접근이 필요 없다.

설계 시 판단 둘(백로그·main-loop 기록):
1. **게이트①②는 사용자 단계**임을 구분 표시하면 "지금 누구를 기다리는지"가 전달된다 → 현재 노드 색을 대기 주체(호박=당신/남색=팀)에 매핑한다.
2. **`검증:` 줄 유무**로 검토대기를 "검증 중"과 "검증 통과·게이트② 대기" 둘로 쪼갠다(FEAT-13 칩과 같은 신호원) → 매핑이 `validation`을 읽어 현재 단계를 검증(3) vs 게이트②(4)로 가른다.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `src/fsd/pages/pipeline/model/journey.ts` `(신규, 순수)` | status(+검증 판정)→여정 위치 결정적 매핑. `deriveJourney(status, validation): JourneyView \| null` + 7단계 카탈로그 + 대기 주체 라벨. 임포트 없음(board.ts처럼 순수) |
| `src/fsd/pages/pipeline/model/journey.test.mjs` `(신규)` | 전 status × 검증 판정의 결정적 매핑 단언(돌연변이 사멸용 전 경우) |
| `src/fsd/pages/pipeline/ui/_component/journey-stepper.tsx` `(신규, 서버 컴포넌트)` | `JourneyView`를 받아 노드 레일 + 단계 라벨(sm↑) + 캡션을 렌더. `"use client"` 없음(순수 표시) |
| `src/fsd/pages/pipeline/ui/index.tsx` `(수정)` | `InboxCard`가 `deriveJourney`로 여정을 구해 발화 아래·`GateCardLock` 위에 `<JourneyStepper>`를 렌더 |

여기 없는 파일은 고치지 않는다. 특히 **`board.ts`·`briefing.ts`는 안 고친다** — `status`·`validation`이 이미 파싱돼 `SpeechItem`에 실려 있어 매핑이 그것을 읽으면 된다(새 필드 불필요). **`pages/pipeline/index.ts`(public API)도 안 고친다** — `journey.ts`·`JourneyStepper`는 슬라이스 내부에서만 쓰이므로(모델은 UI가 상대 import, `_component`는 페이지-사설) 재수출이 없다. **`scripts/verify-fsd-boundaries.mjs`도 안 고친다** — 새 fetch/DB/Sentry owner가 없고 public boundary도 안 바뀐다. `FEED`/feed 렌더도 안 건드린다(스테퍼는 결재함 카드에만 — 「대안」 참조).

## 구현 스케치

### 1) `src/fsd/pages/pipeline/model/journey.ts` (신규) — status→여정 위치 매핑

핵심이자 판정 로직 전부다. 순수 함수라 `journey.test.mjs`가 본문 전체를 덮으므로 **전체 새 본문**을 싣는다. 진행 중 넷(승인대기·계획지시·검토대기·구현승인)만 여정 위치가 있고, 나머지(완료=종결·보류=중단·null)는 `null`을 낸다(스테퍼 없음). 검토대기 이분은 `validation` 유무로 가른다.

```ts
// 순수 함수. board.ts/reporting.ts와 같은 이유로 임포트가 없다(journey.test.mjs로 덮인다).
// 보드 status(+검증 판정)로 "파이프라인 여정 7단계 중 지금 어디인지"를 결정적으로 매핑한다.
// 진행 중(승인대기·계획지시·검토대기·구현승인)만 여정 위치가 있다 — 완료(종결)·보류(중단)·null은
// 여정 밖이라 매핑이 없다(null 반환). 보드 데이터만으로는 완료의 "인수됨"(메인 루프 몫)도, 보류의
// "어느 단계에서 멈췄나"도 결정할 수 없어(결과 줄은 산문이라 구조가 아니다) 여정 밖으로 뺀다.
export type StageState = "done" | "current" | "upcoming";
export type JourneyActor = "pm" | "user" | "agent" | "verifier" | "loop";

export type JourneyStage = {
  key: string;
  label: string;
  actor: JourneyActor;
  state: StageState;
};

export type JourneyView = {
  currentIndex: number; // 0..6, 현재(진행 중) 단계의 인덱스
  currentLabel: string; // stages[currentIndex].label
  waitingActor: JourneyActor; // 현재 단계를 미는 주체 = 지금 기다리는 대상
  waitingLabel: string; // "당신 차례" | "검증 중" | "작업 중" …(화면 낱말)
  nextLabel: string | null; // 다음 단계 라벨(마지막이면 null)
  stages: JourneyStage[]; // 7단계 전부, 각 state 부여
};

// 여정 7단계(고정 순서). actor = 그 단계를 미는 주체(누구를 기다리는지의 원천).
const JOURNEY_STAGES: readonly {
  key: string;
  label: string;
  actor: JourneyActor;
}[] = [
  { key: "select", label: "선정", actor: "pm" },
  { key: "gate1", label: "게이트①", actor: "user" },
  { key: "plan", label: "계획서", actor: "agent" },
  { key: "verify", label: "검증", actor: "verifier" },
  { key: "gate2", label: "게이트②", actor: "user" },
  { key: "build", label: "구현", actor: "agent" },
  { key: "accept", label: "인수", actor: "loop" },
];

// 현재 단계 주체 → "지금 누구를 기다리는지" 낱말. user 게이트는 "당신 차례".
const WAITING_LABEL: Record<JourneyActor, string> = {
  pm: "선정 중",
  user: "당신 차례",
  agent: "작업 중",
  verifier: "검증 중",
  loop: "인수 중",
};

// status(+검증 판정) → 현재 단계 인덱스. 진행 중 넷만 매핑되고 나머지는 null.
// 검토대기 이분: 검증 판정(검증: 줄)이 있으면 검증 통과 → 게이트②(당신 대기), 없으면 검증 중.
function currentIndexFor(
  status: string | null,
  validation: string | null,
): number | null {
  switch (status) {
    case "승인대기":
      return 1; // 게이트① — 사용자 대기
    case "계획지시":
      return 2; // 계획서 — 담당 dev 작업
    case "검토대기":
      return validation !== null ? 4 : 3; // 검증 통과→게이트② : 검증 중
    case "구현승인":
      return 5; // 구현 — 담당 dev 작업
    default:
      return null; // 완료·보류·null·기타 → 여정 밖(스테퍼 없음)
  }
}

export function deriveJourney(
  status: string | null,
  validation: string | null,
): JourneyView | null {
  const idx = currentIndexFor(status, validation);
  if (idx === null) return null;

  const stages: JourneyStage[] = JOURNEY_STAGES.map((s, i) => ({
    key: s.key,
    label: s.label,
    actor: s.actor,
    state: i < idx ? "done" : i === idx ? "current" : "upcoming",
  }));

  const current = stages[idx]; // idx는 1..5이라 항상 존재하지만 noUncheckedIndexedAccess 보정
  if (current === undefined) return null;
  const next = stages[idx + 1]; // JourneyStage | undefined(마지막이면 없음)

  return {
    currentIndex: idx,
    currentLabel: current.label,
    waitingActor: current.actor,
    waitingLabel: WAITING_LABEL[current.actor],
    nextLabel: next === undefined ? null : next.label,
    stages,
  };
}
```

**결정적 매핑 표 (여정 7단계 × status 전 값).** main-loop 판단 1의 전 경우다. `현재`는 `state:"current"` 단계, 그 왼쪽은 `done`, 오른쪽은 `upcoming`이다.

| 보드 status | 검증 판정 | 현재 단계(idx) | 완료(done) | 대기 주체 | 대기 낱말 | 다음 | 렌더 여부 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 승인대기 | — | 게이트①(1) | 선정 | user | 당신 차례 | 계획서 | ✅ 결재함 |
| 계획지시 | — | 계획서(2) | 선정·게이트① | agent | 작업 중 | 검증 | 매핑만(피드—미렌더) |
| 검토대기 | 없음(null) | 검증(3) | 선정·게이트①·계획서 | verifier | 검증 중 | 게이트② | ✅ 결재함 |
| 검토대기 | 있음 | 게이트②(4) | 선정·게이트①·계획서·검증 | user | 당신 차례 | 구현 | ✅ 결재함 |
| 구현승인 | — | 구현(5) | 선정·게이트①·계획서·검증·게이트② | agent | 작업 중 | 인수 | 매핑만(피드—미렌더) |
| 완료 | — | (없음 → null) | — | — | — | — | ❌ 미렌더(종결) |
| 보류 | — | (없음 → null) | — | — | — | — | ❌ 미렌더(중단·여정 밖) |
| null / 기타 | — | (없음 → null) | — | — | — | — | ❌ 미렌더(불명) |

- **보류 결정**: 여정 밖으로 뺀다(중단 위치 표시 안 함). 보드 데이터만으로는 보류가 어느 단계에서 멈췄는지 결정할 수 없다 — 전이는 계획지시·구현승인·검토대기·승인대기 어디서든 올 수 있고, 보드에는 현재 status(`보류`)만 남지 이전 단계가 구조로 남지 않는다(`결과:` 산문에 있을 뿐). 추측 매핑 대신 매핑 없음(null)이 정직하다.
- **완료 결정**: 여정 밖으로 뺀다. `완료`는 dev가 쓰고 인수(7)는 메인 루프 몫인데, 보드에는 "인수됨"을 나르는 필드가 없다 — 스테퍼로 인수 칸을 채울지/비울지 결정할 근거가 보드에 없다. 종결 카드(피드)에 7 노드 레일은 정보보다 소음이다(아래 「대안」).
- **모델은 진행 중 넷 전부를 매핑하되(전 경우 결정성·미래 대비), UI는 결재함 카드에만 렌더한다**(계획지시·구현승인은 피드라 `deriveJourney`를 호출하지 않는다 — 「대안」의 결재함-only 결정). 매핑 표의 "매핑만" 행은 모델의 총체성을 문서화한 것이지 현재 화면에 뜨는 것이 아니다.

### 2) `src/fsd/pages/pipeline/ui/_component/journey-stepper.tsx` (신규) — 결재 경로 레일

서버 컴포넌트(`"use client"` 없음). `JourneyView`를 받아 노드 레일 + 단계 라벨(sm↑) + 캡션을 렌더한다. 색은 「디자인 방향」의 tone 매핑을 그대로 리터럴로 굳힌다 — **어느 state/actor가 어느 토큰인지가 이 컴포넌트의 계약**이라 그 매핑 함수(`dotClass`)와 캡션 구조를 코드로 싣는다. 나머지 flex 마크업은 기존 메타 행 패턴을 따른다.

```tsx
import { cn } from "~/fsd/shared/lib/utils";
import type { JourneyStage, JourneyView } from "../../model/journey";

// 노드 색/형태 = 상태·대기 주체. done=흑연 채움, current·user=호박 빈 링(당신의 도장 대기),
// current·팀(agent/verifier/…)=남색 채움(진행 중), upcoming=옅은 빈 링. 신규 토큰 없음.
function dotClass(stage: JourneyStage): string {
  if (stage.state === "done") return "size-1.5 rounded-full bg-silence";
  if (stage.state === "current") {
    return stage.actor === "user"
      ? "size-2.5 rounded-full border-2 border-stamp" // 아직 안 찍힌 인장
      : "size-2.5 rounded-full bg-active"; // 팀 진행 중
  }
  return "size-1.5 rounded-full border border-muted-foreground/40"; // upcoming
}

export function JourneyStepper({ journey }: { journey: JourneyView }) {
  // 대기 주체 색: 당신(호박) vs 팀(남색). 캡션·현재 라벨·대기 낱말이 이 색을 공유한다.
  const whoText = journey.waitingActor === "user" ? "text-stamp" : "text-active";
  const whoBorder =
    journey.waitingActor === "user" ? "border-stamp/50" : "border-active/50";
  const lastIndex = journey.stages.length - 1;
  return (
    <div className="mt-3">
      {/* 레일: 노드 + 연결선. 단계 라벨은 노드 아래(sm↑에서만). */}
      <ol className="flex items-start" aria-label="파이프라인 여정">
        {journey.stages.map((stage, i) => (
          <li
            key={stage.key}
            className={cn(
              "flex flex-col gap-1",
              i < lastIndex ? "flex-1" : "shrink-0",
            )}
          >
            <div className="flex items-center gap-1">
              <span
                aria-hidden="true"
                className={cn("inline-block shrink-0", dotClass(stage))}
              />
              {i < lastIndex && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-px flex-1",
                    stage.state === "done"
                      ? "bg-silence/50"
                      : "bg-muted-foreground/25",
                  )}
                />
              )}
            </div>
            <span
              className={cn(
                "hidden text-[10px] leading-4 sm:block",
                stage.state === "current"
                  ? cn("font-medium", whoText)
                  : stage.state === "done"
                    ? "text-silence"
                    : "text-muted-foreground/60",
              )}
            >
              {stage.label}
            </span>
          </li>
        ))}
      </ol>
      {/* 캡션(항상): 지금 <현재> · [대기 낱말] · 다음 <다음>. 폰에서 라벨을 대신해 낱말을 나른다. */}
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span>
          지금 <span className={cn("font-medium", whoText)}>{journey.currentLabel}</span>
        </span>
        <span
          className={cn(
            "shrink-0 rounded-full border px-1.5 text-[10px] leading-4",
            whoText,
            whoBorder,
          )}
        >
          {journey.waitingLabel}
        </span>
        {journey.nextLabel !== null && (
          <span className="text-muted-foreground/80">· 다음 {journey.nextLabel}</span>
        )}
      </p>
    </div>
  );
}
```

### 3) `src/fsd/pages/pipeline/ui/index.tsx` (수정) — InboxCard에 스테퍼 삽입

임포트 둘을 더하고, `InboxCard`가 발화 아래·`GateCardLock` 위에 스테퍼를 렌더한다. 여정이 없으면(이론상 결재함은 항상 승인대기·검토대기라 있음) 아무것도 안 그린다 — `gateTo`/`rejectActions`와 같은 조건부 렌더 패턴(`:167-170`)을 따른다.

```tsx
// before (:15-19) 임포트
import { cn } from "~/fsd/shared/lib/utils";
import type { Briefing, SpeechItem, Tone } from "../model/briefing";
import { AgentAvatar } from "./_component/agent-avatar";
import { OwnerBanner } from "./_component/owner-banner";
import { PixelOffice } from "./_component/pixel-office";
// after — journey 모델과 스테퍼 컴포넌트 추가(같은 슬라이스 상대 import)
import { cn } from "~/fsd/shared/lib/utils";
import { deriveJourney } from "../model/journey";
import type { Briefing, SpeechItem, Tone } from "../model/briefing";
import { AgentAvatar } from "./_component/agent-avatar";
import { JourneyStepper } from "./_component/journey-stepper";
import { OwnerBanner } from "./_component/owner-banner";
import { PixelOffice } from "./_component/pixel-office";
```

```tsx
// before (:165-170) InboxCard 상단 — gateTo/rejectActions 계산부
function InboxCard({ item }: { item: SpeechItem }) {
  // 라벨=찍힐 status. item.status는 string | null → null이면 버튼 없음.
  const gateTo =
    item.status === null ? null : resolveGateTransition(item.status);
  const rejectActions =
    item.status === null ? [] : rejectActionsFor(item.status);
// after — 여정도 함께 도출(status+validation은 SpeechItem에 이미 있다)
function InboxCard({ item }: { item: SpeechItem }) {
  // 라벨=찍힐 status. item.status는 string | null → null이면 버튼 없음.
  const gateTo =
    item.status === null ? null : resolveGateTransition(item.status);
  const rejectActions =
    item.status === null ? [] : rejectActionsFor(item.status);
  const journey = deriveJourney(item.status, item.validation);
```

```tsx
// before (:182-183) 발화 한 줄 다음 바로 GateCardLock
      <p className="mt-3 text-lg text-stamp">{item.line}</p>
      <GateCardLock>
// after — 발화와 액션 사이에 여정 레일(GateCardLock 밖 — 잠금과 무관한 방위)
      <p className="mt-3 text-lg text-stamp">{item.line}</p>
      {journey !== null && <JourneyStepper journey={journey} />}
      <GateCardLock>
```

`InboxCard`의 나머지(메타 행·ValidationMark·게이트 버튼·DocLinks·details)는 불변이다. `ValidationMark`(검증 이진 칩)와 스테퍼(검증 단계 위치)는 같은 `validation`을 읽어 **일관**하며(줄 있으면 칩=통과·레일=게이트② 현재, 없으면 칩=검증 전·레일=검증 현재) 서로를 보강한다 — 칩은 부서 여부, 레일은 여정 위치.

## 테스트

구현 후 자동 검증은 아래 순서로 실행한다(FEAT-10/24와 동일). build는 source-map upload를 막은 환경에서 실행하고 live GitHub/Sentry 호출은 하지 않는다.

```powershell
npm.cmd run check -w apps/admin
npm.cmd run test -w apps/admin
npm.cmd run verify:fsd:final -w apps/admin
$env:SENTRY_DISABLE_AUTO_UPLOAD='true'
npm.cmd run build -w apps/admin
```

성공 기준은 runtime test·boundary fixture/final tree·lint·production typecheck·Next production build가 모두 0 exit인 것이다. `verify:fsd:final`은 **owner를 늘리지 않으므로**(새 fetch/DB/Sentry owner 없음) 현재 owner 집합을 그대로 통과해야 한다. `journey.ts`는 임포트가 없어(board.ts와 동종) `journey.test.mjs`가 `mock.module` 없이 직접 import한다.

- **덮는 것 (순수 함수 — `journey.test.mjs`):** `deriveJourney`의 전 경우 결정성. 돌연변이 검사(verification-paths 5)를 겨냥해 아래를 명세로 담는다.
  - **전 status 매핑(위 표 전 행):**
    - `deriveJourney("승인대기", null)` → `currentIndex 1`·`currentLabel "게이트①"`·`waitingActor "user"`·`waitingLabel "당신 차례"`·`nextLabel "계획서"`. `stages[0].state "done"`, `stages[1].state "current"`, `stages[2..6].state "upcoming"`.
    - `deriveJourney("계획지시", null)` → `2`·`"계획서"`·`"agent"`·`"작업 중"`·next `"검증"`; done=[0,1].
    - `deriveJourney("검토대기", null)` → `3`·`"검증"`·`"verifier"`·`"검증 중"`·next `"게이트②"`; done=[0,1,2].
    - `deriveJourney("구현승인", null)` → `5`·`"구현"`·`"agent"`·`"작업 중"`·next `"인수"`; done=[0..4].
    - `deriveJourney("완료", null)` / `("보류", null)` / `(null, null)` / `("검증완료", null)`(미지 status) → **모두 `null`**(여정 밖·미렌더 고정 — 완료를 build(5)로, 보류를 어느 단계로 매핑하는 오구현을 잡는다).
  - **검토대기 이분(핵심 판정 — 검증 판정으로 갈린다):**
    - `deriveJourney("검토대기", null)` → currentIndex **3**(검증), `deriveJourney("검토대기", "클린 패스 (2026-08-27, 무편집 1라운드)")` → currentIndex **4**(게이트②). 두 단언이 함께 있어야 "검토대기는 항상 3" / "항상 4" 오구현이 둘 다 사멸한다.
    - **판정은 내용이 아니라 존재다:** 다른 비-null 문자열(예 `"x"`)도 → currentIndex 4. 검증 값 내용을 파싱하는 오구현을 잡는다(FEAT-13 계약 계승 — "존재=통과").
  - **state 부여 불변식(off-by-one 방어):** 임의 진행 status에서 `stages.length === 7`, `state:"current"`인 원소가 **정확히 1개**, 그 인덱스 앞은 전부 `done`·뒤는 전부 `upcoming`, `waitingActor === stages[currentIndex].actor`. `currentIndex±1` 오구현·상태 뒤집힘을 잡는다.
  - **단계 카탈로그 고정:** 전 stages의 `label` 시퀀스가 `["선정","게이트①","계획서","검증","게이트②","구현","인수"]`, `actor` 시퀀스가 `["pm","user","agent","verifier","user","agent","loop"]`. 단계 순서·주체를 바꾸는 오구현(예 게이트②를 agent로)을 잡는다 — 이는 "게이트=사용자" 색 매핑의 근원이라 고정한다.
  - **다음 라벨:** `nextLabel = stages[currentIndex+1].label`(위 각 경우로 확인). 모델 총체성상 마지막 단계(인수)가 현재가 되는 status는 없지만, 매핑이 그 경우 `nextLabel: null`을 내는 계약임을 주석으로 남긴다(진행 중 넷은 next가 항상 존재).
  - **대기 낱말 매핑:** `WAITING_LABEL`이 `user→"당신 차례"`, `verifier→"검증 중"`, `agent→"작업 중"`을 냄(승인대기·검토대기(검증)·계획지시로 각각 확인). "누구를 기다리는지"의 화면 문구를 고정한다.
- **못 덮는 범위 (DOM/실제 외부 I/O 없음 — 배포 후 데스크톱+폰 수동 확인):**
  - `JourneyStepper` 실물 렌더: 노드 색/형태(done 흑연 채움·user 호박 빈 링·팀 남색 채움·upcoming 옅은 빈 링), 연결선 색, 현재 노드 크기 강조(size-2.5 vs 1.5), 단계 라벨의 `sm↑` 노출/폰 숨김(`hidden sm:block`), 캡션의 호박/남색 색·`text-xs`·`flex-wrap`, 레일/라벨 정렬 — Node 러너에 DOM 없음. Tailwind 방출(신규 사용: `bg-silence`·`bg-active`·`border-stamp`·`border-2`·`border-active/50`·`border-stamp/50` — 기존 방출 토큰의 새 유틸 조합)도 실빌드 후 육안 확인.
  - `InboxCard` 통합 렌더(발화↔레일↔게이트 순서, `GateCardLock` 밖 배치, `ValidationMark`와의 시각 일관) — 실화면. `renderToStaticMarkup` 정적 렌더는 도구를 새로 깔지 않고는 현재 러너 밖이라 수동 smoke로 남긴다.
  - **CLAUDE.md handoff(읽기 전용 → 메인 루프 동기화):** 「테스트 인벤토리」(`apps/admin/CLAUDE.md:35-37`)의 총계(현재 **27파일·60suite·281test**)에 신규 `journey.test.mjs` 1파일을 더한다 — 행 문구 예: `src/fsd/pages/pipeline/model/journey.test.mjs | status→여정 단계 결정적 매핑(검토대기 이분·완료·보류 여정 밖·단계 카탈로그 고정)`. 최종 runner의 suite/test 증가 수는 구현 결과에 실측으로 보고한다.

## 범위 밖 의존

**없음.** 전 변경이 `apps/admin/src/fsd/pages/pipeline/**` 안이다. `board.ts`·`briefing.ts`·`entities/pipeline`·인증·`env.js`·`schema.prisma`는 손대지 않고, `@repo/db`도 analytics 계약도 건드리지 않으며, DB 읽기/쓰기 경로를 추가하지 않는다(외부 쓰기 둘·DB 무접근 그대로). 새 fetch owner가 없어 `scripts/verify-fsd-boundaries.mjs`도 안 건드린다. public API 재수출도 없다(슬라이스 내부 상대 import). status·validation은 이미 파싱돼 `SpeechItem`에 실려 있어 파서·데이터 경로 변경이 없다.

## 대안

- **어느 카드에 — 결재함(inbox)만 (채택) vs 피드도.** 스테퍼를 **결재함 카드에만** 렌더한다. 근거: (a) 결재함이 정확히 "당신을 기다리는(게이트) / 검증 중" 항목이라 "어디까지·다음·누구"가 가장 행동가능하고, (b) 검토대기 이분(검증 중/게이트② 대기)은 본질적으로 게이트② 버튼이 있는 결재함의 관심사이며, (c) 결재함 카드는 line-clamp 없이 넉넉해 레일이 든다. **피드 종결 항목(완료·보류·null)에는 안 넣는다** — 종결 카드에 7 노드 레일은 정보보다 소음이고(status 낱말이 이미 종결을 말한다), 완료의 "인수됨"·보류의 "중단 단계"는 보드 데이터로 결정 불가라 레일이 거짓 위치를 보일 위험이 있다. **피드 진행 중 항목(계획지시·구현승인)에도 안 넣는다** — 이들은 잠깐 지나가는 상태(미결 2건 제한상 보통 0~1건)이고, 피드는 line-clamp-1 collapsed의 조밀·이차 표면이라 레일을 넣으면 그 밀도 설계(BUG-07 폰 교훈)와 싸운다. 모델(`deriveJourney`)은 이 넷을 전부 매핑하되(전 경우 결정성·미래 피드 확장 대비) UI 렌더만 결재함으로 좁힌다.
- **보류를 중단 단계에 표시.** 보류 카드에 "계획서 단계에서 멈춤" 식으로 레일 위치를 보인다. **채택 안 함** — 보드에는 현재 status(`보류`)만 남지 이전 단계가 구조로 남지 않아(전이 원점이 계획지시·구현승인·검토대기·승인대기 중 무엇인지 데이터로 알 수 없다) 추측 위치가 된다. 위치를 정직하게 못 매기면 안 보이는 것이 낫다(여정 밖 = 매핑 없음).
- **완료를 인수까지 채워 전 7단계 done 표시.** 완료 카드에 7 노드 전부 흑연 채움으로 "끝난 여정"을 보인다. **채택 안 함** — 보드 `완료`는 dev 기록이고 인수(7)는 메인 루프 몫이라 보드 데이터로 "인수됨"을 알 수 없다. 7번째를 채우면 미인수 항목에 거짓 "인수 완료"가 뜨고, 안 채우면 종결 카드에 영구 "인수 대기"가 붙어 소음이다. 종결 카드는 status 낱말로 충분하다(위 결재함-only 결정과 같은 귀결).
- **가로 진행바 + 퍼센트.** **채택 안 함** — 여정은 이산 단계라 퍼센트가 의미 없고(디자인 자기 비평), 진행바는 이 파이프라인의 단계 어휘(게이트·검증·인수)를 잃는다. 이름 있는 노드 레일이 실제 결재선을 보인다.
- **새 status나 보드 필드로 여정 위치를 저장.** **채택 안 함** — 위치는 status(+검증 판정)에서 결정적으로 파생되므로 상태를 늘릴 이유가 없다(FEAT-13이 "판정은 상태 성격이라 상태 기계에 둔다"고 정한 것과 반대 방향으로 갈 필요 없음). 순수 매핑 하나로 충분하고 fetch·필드 증가가 0이다.
- **폰에서도 7 단계 라벨 전부 노출.** **채택 안 함** — BUG-07이 텍스트를 좁은/축소 폭에 얹어 판독 불가가 된 실패다. 폰은 노드(전체 위치)+캡션(현재·다음·주체 낱말)으로, 데스크톱(sm↑)은 라벨까지로 요구를 충족한다. 폰에서 전체 단계 이름을 원하면 그때 별도 축약(아코디언 등)을 검토한다.
