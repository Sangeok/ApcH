# BUG-07: 폰 뷰포트에서 `/pipeline` "당신의 책상" 배너 라벨이 판독 불가 수준으로 작게 렌더됨

agent: admin-dev

## 현재 동작

`OwnerBanner`(`apps/admin/src/fsd/pages/pipeline/ui/_component/owner-banner.tsx:3-88`)는
배너 전체를 **단일 SVG**로 그린다. `viewBox="0 0 660 96"`(`owner-banner.tsx:25`)이고
루트 `<svg>`는 `className="w-full"`(`owner-banner.tsx:29`)만 있고 `width`/`height` 속성이
없다 — 브라우저는 컨테이너 실폭에 맞춰 SVG를 등비 축소하며, 이때 **유저 좌표계(텍스트
`fontSize` 포함)도 같은 비율로 축소된다.**

제목("당신의 책상")은 `fontSize={15}` `fontWeight={700}` `fill="#2b2420"`
(`owner-banner.tsx:67-76`), 부제(`subtitle`)는 `fontSize={12}` `fill="#976014"`
(`owner-banner.tsx:77-85`)로 SVG `<text>`에 박혀 있다. 두 텍스트 모두 x=200(뷰포트 좌표)에서
시작한다.

호출부 `InboxZone`(`apps/admin/src/fsd/pages/pipeline/ui/index.tsx:143`)은
`<OwnerBanner pendingCount={pendingCount} />`를 그대로 렌더하고, 그 조상 컨테이너는
`<div className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-8">`
(`apps/admin/src/fsd/pages/pipeline/ui/index.tsx:37`)다. `max-w-2xl`(672px)에 `px-4`
(양쪽 16px)가 있어 **콘텐츠 실폭은 `min(뷰포트폭 − 32px, 640px)`**다.

- 데스크톱(콘텐츠 640px): 스케일 = 640/660 ≈ 0.97 → 제목 ≈14.5px, 부제 ≈11.6px. 정상 판독.
- 폰 375px(콘텐츠 343px): 스케일 = 343/660 ≈ 0.52 → 제목 ≈7.8px, 부제 ≈6.2px. 판독 불가.
- 폰 320px(콘텐츠 288px): 스케일 ≈ 0.436 → 제목 ≈6.5px, 부제 ≈5.2px. 더 나쁨.

배경 그림(책상 판자·서류·도장, `owner-banner.tsx:31-66`)은 픽셀아트라 축소돼도 형태가
유지되지만, 텍스트는 SVG 유저 단위 폰트 크기가 그대로 스케일을 따라가 축소된다.

## 문제

TASK_BACKLOG.md의 BUG-07 항목(관측: "375px 스크린샷에서 배너 전체가 축소돼 라벨이 깨알
크기 — 데스크톱은 정상". 진단(추정): "배너 SVG가 고정 viewBox의 비율 축소라 텍스트도 함께
줄어듦")은 위 계산으로 확인된다 — **관측·진단 모두 코드와 일치한다.** 어긋남 없음.

원인은 텍스트가 배경 그림과 **같은 좌표계에 있어 폰트 크기를 독립적으로 고정할 수 없다**는
것이다. 백로그가 제시한 두 대안(라벨 분리 / 최소 크기) 중 이 계획은 **라벨 분리**를
채택한다 — 이유는 「대안」 절 참조.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `apps/admin/src/fsd/pages/pipeline/ui/_component/owner-banner.tsx` | 제목·부제 `<text>`를 SVG에서 제거하고 SVG를 순수 배경 장식(`aria-hidden`)으로 낮춘 뒤, 같은 위치에 겹치는 일반 HTML 텍스트 오버레이로 라벨을 렌더 — 컨테이너 스케일과 무관하게 고정 px 크기 유지 |

다른 파일은 고치지 않는다. `sprites.ts`의 `gridToRects`나 `index.tsx`의 호출부는 변경이 필요 없다.

## 구현 스케치

**before** (`owner-banner.tsx:23-30`, 루트 반환값 시작)

```tsx
  return (
    <svg
      viewBox="0 0 660 96"
      role="img"
      aria-label={`당신의 책상 — ${subtitle}`}
      shapeRendering="crispEdges"
      className="w-full"
    >
```

**after**

```tsx
  return (
    <div className="relative">
      <svg
        viewBox="0 0 660 96"
        aria-hidden="true"
        shapeRendering="crispEdges"
        className="w-full"
      >
```

**before** (`owner-banner.tsx:67-88`, 제목·부제 `<text>`와 닫는 태그)

```tsx
      <text
        x={200}
        y={38}
        fontFamily="ui-monospace, monospace"
        fontSize={15}
        fontWeight={700}
        fill="#2b2420"
      >
        당신의 책상
      </text>
      <text
        x={200}
        y={54}
        fontFamily="ui-sans-serif, system-ui"
        fontSize={12}
        fill="#976014"
      >
        {subtitle}
      </text>
    </svg>
  );
}
```

**after**

```tsx
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-center gap-1 pl-[30.3%] pr-3">
        <p
          className="text-sm leading-tight font-bold"
          style={{ fontFamily: "ui-monospace, monospace", color: "#2b2420" }}
        >
          당신의 책상
        </p>
        <p
          className="text-xs leading-snug"
          style={{ fontFamily: "ui-sans-serif, system-ui", color: "#976014" }}
        >
          {subtitle}
        </p>
      </div>
    </div>
  );
}
```

**왜 이렇게 되는지**

- `pl-[30.3%]`는 원래 `x=200`을 뷰포트 폭 660으로 나눈 값(200/660=0.303)이다. 오버레이가
  `absolute inset-0`으로 SVG와 같은 크기(= 같은 스케일)를 가지므로, **퍼센트 padding은
  SVG 좌표와 같은 비율로 스케일된다** — 어느 컨테이너 폭에서도 텍스트 시작 x가 배경
  그림(책상 프레임 `x=57~117`, `owner-banner.tsx:48-56`)과 겹치지 않고 원래와 같은 상대
  위치를 유지한다.
- `text-sm`(14px)·`text-xs`(12px)는 **일반 HTML 텍스트라 조상 요소의 폭에 스케일되지
  않는다** — 데스크톱 원래 렌더값(≈14.5px·≈11.6px)과 거의 같은 크기를 모든 뷰포트에서
  동일하게 유지한다. 별도 `sm:` 반응형 분기가 필요 없다(문제의 원인이 "SVG 스케일에
  얹힌 폰트 크기"였으므로, 텍스트를 스케일 밖으로 빼내는 것 자체가 해결책이다).
- `fontFamily`·색상 hex는 원래 값을 그대로 유지한다(픽셀아트 세계는 디자인 토큰을
  재사용하지 않는다 — `apps/admin/src/fsd/pages/pipeline/model/sprites.ts:3`의 팔레트
  주석과 같은 원칙).
- `aria-hidden="true"`로 낮춘 SVG는 순수 장식이 되고, 이제 보이는 HTML 텍스트(`<p>` 둘)가
  스크린 리더에 그대로 읽혀 이전 `aria-label` 조합 문자열보다 더 정확한 접근성을 제공한다.
- 세로 위치는 `inset-0 flex flex-col justify-center`로 오버레이 박스 전체(96 유저단위 높이에
  대응하는 렌더 높이)의 수직 중앙에 두 줄을 놓는다. 원래 텍스트 중심(제목·부제 박스 y
  23~59, 중심 41/96≈42.7%)과 50% 사이 차이는 스케일된 렌더 높이 기준 몇 픽셀 수준이라
  육안 차이가 없다.

## 테스트

- **덮는 것**: 없음. `subtitle` 삼항식(`owner-banner.tsx:4-7`)은 이미 자명한 리터럴
  분기라 새 순수 함수로 뽑지 않는다(뽑아도 `pendingCount > 0` 분기 하나뿐이라 테스트가
  분기 존재를 반복 진술하는 것 이상의 의미가 없다).
- **못 덮는 범위**: Node 내장 러너는 DOM이 없어 렌더 결과의 실제 픽셀 크기·오버레이가
  배경과 정렬되는지·`pl-[30.3%]`가 실제 브라우저에서 텍스트를 프레임(책상 서류함) 밖에
  놓는지는 확인할 수 없다. 배포 후 폰 375px·320px·데스크톱 세 폭에서 스크린샷으로
  라벨 판독성과 정렬을 확인해야 한다(`docs/release-checks.md`에 등재 대상).

## 범위 밖 의존

없음. 단일 파일(`owner-banner.tsx`) 안에서 끝나며 다른 워크스페이스나 `packages/db`에
닿지 않는다.

## 대안

1. **미디어 쿼리로 SVG 유저 좌표계 `fontSize`를 반응형으로 키운다** — CSS
   `@media (max-width: …)`는 실제 뷰포트 폭 기준으로 발동하지만, 필요한 보정값은
   *그 순간의 스케일 비율*(콘텐츠 실폭/660)에 따라 연속적으로 달라진다. 320px과 375px만
   해도 필요한 보정 배수가 다르고, 폭 구간마다 다른 임계값을 계속 추가해야 해 확장성이
   없다. 기각.
2. **SVG에 `min-width`를 줘 가로 스크롤을 허용한다** — 텍스트 크기는 보존되지만 핵심
   정보(라벨)가 초기 화면 밖으로 밀려나 사용자가 스크롤해야 읽힌다. "배너"라는 용도(첫
   화면에서 바로 읽혀야 함)에 맞지 않는다. 기각.
3. **`viewBox`를 줄여 텍스트가 차지하는 상대 비중을 키운다** — 배경 그림(책상·서류·도장)의
   상대 크기와 구도까지 함께 바뀌어 버려 그림을 다시 그려야 한다. 기각.
4. **채택안(라벨 분리)** — 텍스트를 SVG 스케일 좌표계에서 완전히 빼내 일반 HTML 텍스트로
   만들면 그림과 텍스트의 크기를 독립적으로 유지할 수 있다. 위치 정렬은 퍼센트 padding으로
   같은 스케일을 따라가게 하면서 크기만 고정한다 — 두 요구(정렬 유지 + 크기 보존)를 동시에
   만족하는 유일한 방법이다.

## 비고

- **`frontend-design` 스킬 미탑재**: `.claude/agents/admin-dev.md`는 "생김새를 바꾸는"
  항목이면 계획 전에 `frontend-design` 스킬을 로드하라고 지시하지만, 이 세션에 설치된
  스킬 목록에 해당 이름이 없다(FEAT-09 계획서 검증 때 `reconciling-proposals-with-codebase`가
  없었던 것과 같은 종류의 공백). 대신 이 파일 안에서 기존 타이포그래피 패턴(`index.tsx`의
  `text-sm`·`text-xs` 사용례)과 픽셀아트 팔레트 분리 원칙(`sprites.ts:3` 주석)을 직접
  대조해 색상·글꼴 계열을 그대로 보존하는 최소 변경으로 방향을 잡았다 — 새 시각 언어를
  만들지 않고 기존 것을 스케일 문제에서만 분리했다.
