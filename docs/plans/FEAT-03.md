# FEAT-03: 파이프라인 대시보드 — 보드 카드 뷰 + 원격 명령 버튼

agent: admin-dev

## 현재 동작

admin은 읽기 전용 관측 대시보드다. 파이프라인 보드를 보여주는 라우트는 없다 — 현재 라우트는
`app/page.tsx:4`(`redirect("/analytics")`), `app/analytics/page.tsx`, `app/observability/page.tsx`,
`app/login/page.tsx`, `app/api/auth/[...nextauth]/route.ts`, 그리고 전 크롤러를 차단하는
`app/robots.ts`다(`app/layout.tsx`는 라우트가 아니라 공용 레이아웃 — `Toaster`가 여기 전역
마운트라 새 페이지에서 toast가 그냥 동작한다).

기존 페이지가 이미 확립한 패턴이 이 기능의 뼈대가 된다.

- **인가 3중 방어선.** (1) 로그인 거부 `auth/config.ts:19`의 `signIn` 콜백이 화이트리스트 밖 계정의
  세션 생성을 막는다. (2) 경로 보호 `auth/config.edge.ts:19`의 `authorized` 콜백 + `middleware.ts:15`의
  matcher(`/((?!api|_next/static|_next/image|favicon.ico|robots.txt).*)`)가
  `/login`을 뺀 전 경로를 보호한다. (3) 페이지 재검사 `auth/guard.ts:7`의 `requireAdmin()`이
  `ADMIN_EMAILS`를 다시 확인해 제거된 계정의 잔여 JWT를 막는다.
- **라우트 구성.** `app/analytics/page.tsx:50`·`app/observability/page.tsx:12-19`가
  `const admin = await requireAdmin()` → `<AdminHeader email={admin.email} />` + `<main>` 안에
  페이지 컴포넌트를 렌더하는 형태다.
- **서버 액션 패턴.** `observability/test-action.ts:25-27`이 `"use server"`에서 `requireAdmin()`을
  **try 밖에서** 부르고(주석: "레이아웃 가드에 기대지 않는다"), `~/lib/result.ts:5,12,25`의
  `ActionResult`/`success()`/`failure()`로 성공·실패를 표현한다.
- **클라이언트 버튼 패턴.** `ui/observability-panel.tsx:1-40`이 `"use client"`에서 `useTransition`으로
  서버 액션을 부르고 결과에 따라 `sonner`의 `toast.success`/`toast.error`를 낸다.
- **카드 마크업.** `ui/analytics-page.tsx:99-108`이 `~/ui/atoms/card.tsx`의 `Card`/`CardHeader`/
  `CardTitle`/`CardDescription`으로 카드를 그린다. 상태 뱃지는 `~/ui/atoms/badge.tsx`의
  `Badge`(variant: default·secondary·destructive·outline).
- **집계의 순수 함수 분리.** `analytics/queries.ts:1`은 `"server-only"`로 DB를 읽고,
  `analytics/reporting.ts`는 임포트가 하나도 없는 순수 함수라 `reporting.test.mjs`로 덮인다.
- **환경 변수.** `env.js:4`의 `createEnv`가 `@t3-oss/env-nextjs`로 검증한다. server 스키마는
  `env.js:5-37`, `client: {}`(노출 변수 없음)는 `env.js:40`.
  `SENTRY_DSN`/`SENTRY_AUTH_TOKEN`은 `optional`(`env.js:35-36`), `runtimeEnv`는 `env.js:42-53`.
- **타입 엄격도.** `tsconfig.json:11-12`가 `strict` + `noUncheckedIndexedAccess`다. 인덱스·캡처 그룹
  접근은 전부 `| undefined`가 붙는다 — 신규 코드가 이를 어기면 `npm run check`가 막는다.
- **CSP.** `next.config.js:65`의 `connect-src`는 `'self' https://*.neon.tech`뿐이다. 이는 **브라우저**의
  아웃바운드를 제한한다 — 서버 컴포넌트/서버 액션의 `fetch`에는 적용되지 않는다.
- **보드 형식.** `PROJECT_BOARD.md`는 저장소 루트의 단일 파일이며, 각 항목이
  `- [ ] <ID>: <제목>` 다음에 2칸 들여쓴 `agent:`/`area:`/`status:`/`근거:`/`결과:` 줄을 갖는
  구조화 형식이다. 날짜 섹션은 `## <날짜>`, 상단 안내 블록은 `>` 인용문, 맨 끝 `## 파이프라인 구조`는
  항목이 없는 mermaid 다이어그램이다.

## 문제

`TASK_BACKLOG.md`의 FEAT-03 `source`가 요구하는 것: admin에 페이지 1개를 추가해 (a) 보드를 파싱해
항목·status를 카드로 렌더하고, (b) 명령 버튼 클릭 시 GitHub API로 이슈 #87에 코멘트를 게시(검증된
webhook `pipeline-command`를 원격에서 깨우는 "리모컨")하며, (c) admin 인증 뒤에서만 접근하게 한다.
제약: 대시보드는 **보드의 투영**이라 상태를 자체 저장하지 않고, 게이트 전이(계획지시·구현승인) 버튼은
두지 않으며(원격 게이트 잠김), 게시용 토큰은 서버 환경변수로 읽는다(값 세팅은 구현 후 사용자 몫).

지금은 이런 페이지가 아예 없다(위 「현재 동작」의 라우트 목록에 없음). 백로그가 지목한 세 요구는
기존 인프라 위에 새 모듈로 얹으면 되며, 코드에서 확인한 것과 백로그가 어긋나는 지점은 없다.
`source`가 말한 webhook 루틴(`pipeline-command`)의 명령 계약은 저장소 밖 설정이지만 2026-08-14
실측으로 확정됐다 — 접두 토큰은 없고 루틴 지침이 이슈·작성자·`[claude]` 접두로 명령을 고른다.
그 계약과 남은 외부 의존(토큰 계정 일치)은 「범위 밖 의존」에 적는다.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `src/env.js` | `GITHUB_PIPELINE_TOKEN`(`z.string().optional()`)을 server 스키마와 `runtimeEnv`에 추가 |
| `src/pipeline/github.ts` `(신규)` | 저장소 좌표 상수(owner·repo·branch·issue#)와 파생 URL(보드 raw, 이슈 코멘트). 순수 상수, 임포트 없음 |
| `src/pipeline/board.ts` `(신규)` | `PROJECT_BOARD.md` 문자열 → `BoardSection[]` 순수 파서. **임포트 없음**(`reporting.ts`와 같은 이유) |
| `src/pipeline/board.test.mjs` `(신규)` | `parseBoard` 분기 테스트 |
| `src/pipeline/queries.ts` `(신규)` | `"server-only"`. 보드 raw URL을 `no-store` fetch 후 `parseBoard` |
| `src/pipeline/command-action.ts` `(신규)` | `"use server"`. `requireAdmin()` 후 이슈 #87에 코멘트 POST |
| `src/ui/pipeline-page.tsx` `(신규)` | 서버 컴포넌트. 섹션별 카드 렌더 + 명령 버튼 배치 |
| `src/ui/pipeline-command.tsx` `(신규)` | `"use client"`. 명령 버튼(`useTransition` + `toast`) |
| `src/app/pipeline/page.tsx` `(신규)` | 라우트. `requireAdmin()` → `getPipelineBoard()` → 렌더 |

여기 없는 파일(특히 `next.config.js`·`middleware.ts`·`auth/**`)은 고치지 않는다. GitHub 호출을 전부
서버 측에서 하므로 CSP(`next.config.js`) 변경이 불필요하고, 새 라우트는 기존 matcher가 이미 보호하며,
서버 액션이 자체 `requireAdmin()`을 하므로 인가 3중 방어선이 그대로 성립한다.

## 구현 스케치

### `src/pipeline/github.ts` (신규) — 저장소 좌표

```ts
// 순수 상수. 토큰만 비밀이고 좌표는 비밀이 아니다(저장소 public).
export const GITHUB_OWNER = "Sangeok";
export const GITHUB_REPO = "ApcH";
export const BOARD_BRANCH = "dev"; // 작업 상태의 진실은 dev 브랜치 보드다
export const PIPELINE_ISSUE_NUMBER = 87;

export const BOARD_RAW_URL = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${BOARD_BRANCH}/PROJECT_BOARD.md`;
export const ISSUE_COMMENTS_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues/${PIPELINE_ISSUE_NUMBER}/comments`;
```

### `src/pipeline/board.ts` (신규) — 순수 파서 (본문 전체 = 계약)

⚠️ **`tsconfig.json:12`이 `noUncheckedIndexedAccess: true`다.** 정규식 캡처 그룹 접근
(`m[1]`)은 타입상 `string | undefined`이므로 가드 없이 `.trim()`을 부르면 컴파일되지 않는다.
아래 스케치는 그 가드를 포함한 형태다 — 이 제약은 **이 계획의 모든 신규 `.ts`/`.tsx`에 적용된다**
(기존 코드도 `reporting.ts:96`·`:106`·`:108`에서 `?.`·`?? 0`로 같은 처리를 한다).
`.mjs` 테스트는 `tsconfig`의 `include` 밖이라 이 오류를 잡지 못한다 — 잡는 것은
`npm run check -w apps/admin`(`tsc --noEmit`)뿐이다.

```ts
// 순수 함수. 임포트가 하나도 없다 — analytics/reporting.ts와 같은 이유로
// DB·fetch를 여기에 들이지 않는다(그래야 board.test.mjs로 덮인다).

export type BoardItem = {
  checked: boolean;
  id: string;
  title: string;
  agent: string | null;
  area: string | null;
  status: string | null;
  reason: string | null; // 근거
  result: string | null; // 결과
};

export type BoardSection = {
  heading: string;
  items: BoardItem[];
};

const HEADING_RE = /^##\s+(.+)$/;
const ITEM_RE = /^- \[([ xX])\] ([A-Z]+-\d+): (.+)$/;
const FIELD_RE = /^\s+(agent|area|status|근거|결과):\s*(.+)$/;

export function parseBoard(markdown: string): BoardSection[] {
  const sections: BoardSection[] = [];
  let currentSection: BoardSection | null = null;
  let currentItem: BoardItem | null = null;

  for (const line of markdown.split(/\r?\n/)) {
    // 상단 안내 블록(인용문)은 항목이 아니다.
    if (line.startsWith(">")) continue;

    const heading = HEADING_RE.exec(line);
    if (heading) {
      // 캡처 그룹은 정규식상 필수지만 타입은 string | undefined다.
      const headingText = heading[1];
      if (headingText !== undefined) {
        currentSection = { heading: headingText.trim(), items: [] };
        sections.push(currentSection);
        currentItem = null;
      }
      continue;
    }

    const item = ITEM_RE.exec(line);
    if (item) {
      if (!currentSection) continue; // 헤딩 이전의 항목은 무시
      const mark = item[1];
      const id = item[2];
      const title = item[3];
      if (mark === undefined || id === undefined || title === undefined) {
        continue;
      }
      currentItem = {
        checked: mark.toLowerCase() === "x",
        id,
        title: title.trim(),
        agent: null,
        area: null,
        status: null,
        reason: null,
        result: null,
      };
      currentSection.items.push(currentItem);
      continue;
    }

    const field = FIELD_RE.exec(line);
    if (field && currentItem) {
      const rawValue = field[2];
      if (rawValue === undefined) continue;
      const value = rawValue.trim();
      switch (field[1]) {
        case "agent":
          currentItem.agent = value;
          break;
        case "area":
          currentItem.area = value;
          break;
        case "status":
          currentItem.status = value;
          break;
        case "근거":
          currentItem.reason = value;
          break;
        case "결과":
          currentItem.result = value;
          break;
      }
    }
  }

  // 항목이 없는 섹션(예: "## 파이프라인 구조")은 버린다.
  return sections.filter((section) => section.items.length > 0);
}
```

파서는 **필드당 한 줄**을 가정한다(현재 보드 형식이 그렇다 — `근거`/`결과`는 길어도 줄바꿈 없이 한 줄).
값 안의 콜론(예: `결과: ... 수정: apps/...`)은 `(.+)`가 통째로 잡으므로 문제없다.

### `src/pipeline/queries.ts` (신규)

```ts
import "server-only";

import { parseBoard, type BoardSection } from "./board";
import { BOARD_RAW_URL } from "./github";

export async function getPipelineBoard(): Promise<BoardSection[]> {
  // no-store: 투영은 매 요청 dev 브랜치 보드를 다시 읽는다(빌드 시점 고정 금지).
  const res = await fetch(BOARD_RAW_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch PROJECT_BOARD.md: ${res.status}`);
  }
  return parseBoard(await res.text());
}
```

### `src/pipeline/command-action.ts` (신규)

```ts
"use server";

import { env } from "~/env";
import { requireAdmin } from "~/auth/guard";
import { type ActionResult, failure, success } from "~/lib/result";
import { ISSUE_COMMENTS_URL } from "./github";

// #87 코멘트가 외부 webhook(pipeline-command)을 깨워 에이전트를 돌린다.
// 게이트 전이(계획지시·구현승인)는 사용자 몫이므로 이 명령은 status를 바꾸지 않고
// "현재 status대로 처리하라"는 실행 트리거만 보낸다.
// 명령 계약(2026-08-14 실측으로 확정 — 「범위 밖 의존」 1 참고): 접두 토큰은 없다.
// webhook은 이슈의 모든 새 코멘트에 발화하고, 루틴 지침이 (a) 이슈 #87 (b) 작성자가
// 저장소 소유자 (c) "[claude]"로 시작하지 않음 — 세 조건으로 명령을 고른다.
// 따라서 이 문자열은 "[claude]"로 시작하면 안 되고, 게시 계정이 소유자여야 한다.
const COMMAND_BODY =
  "파이프라인을 진행해 주세요. PROJECT_BOARD.md의 각 항목을 현재 status와 런북 규칙대로 처리하되, 게이트 전이(계획지시·구현승인)는 사용자 몫이므로 바꾸지 마세요.";

export async function postPipelineCommand(): Promise<ActionResult<void>> {
  // 목적지 인가. test-action.ts와 동일하게 try 밖에서 부른다
  // (안에 넣으면 catch가 NEXT_REDIRECT를 삼킨다).
  await requireAdmin();

  const token = env.GITHUB_PIPELINE_TOKEN;
  if (!token) {
    return failure("GitHub token is not configured");
  }

  try {
    const res = await fetch(ISSUE_COMMENTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body: COMMAND_BODY }),
    });

    if (!res.ok) {
      return failure(`GitHub API responded ${res.status}`);
    }

    return success();
  } catch (error) {
    console.error("Failed to post pipeline command", error);
    return failure("Failed to post command");
  }
}
```

### `src/env.js` — 토큰 추가 (바뀌는 줄만)

`env.js:34-36` 뒤(server 블록)에 추가:

```js
    // 관측 (web과 동일 값)
    SENTRY_DSN: z.string().optional(),
    SENTRY_AUTH_TOKEN: z.string().optional(),
    // 파이프라인 대시보드가 이슈 #87에 코멘트를 게시할 때 쓰는 GitHub 토큰.
    // optional 이유: 기능을 먼저 배포하고 값은 이후 사용자가 주입한다(백로그 명시).
    // 없으면 명령 버튼이 실패 결과("GitHub token is not configured")를 낸다.
    // ADMIN_EMAILS와 달리 optional인 이유가 이것 — 누락이 빌드를 죽이면 안 된다.
    GITHUB_PIPELINE_TOKEN: z.string().optional(),
```

`env.js:52`(`runtimeEnv`의 `SENTRY_AUTH_TOKEN` 줄) 뒤에 추가:

```js
    SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
    GITHUB_PIPELINE_TOKEN: process.env.GITHUB_PIPELINE_TOKEN,
```

### `src/ui/pipeline-command.tsx` (신규) — 클라이언트 버튼

`observability-panel.tsx:1-40`을 그대로 따르되 액션·문구만 바꾼다.

```tsx
"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { postPipelineCommand } from "~/pipeline/command-action";
import { Button } from "~/ui/atoms/button";

export function PipelineCommandButton() {
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      const result = await postPipelineCommand();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Command posted to issue #87");
    });
  };

  return (
    <Button type="button" disabled={isPending} onClick={handleClick}>
      {isPending ? "Posting..." : "Run pipeline"}
    </Button>
  );
}
```

### `src/ui/pipeline-page.tsx` (신규) — 서버 컴포넌트, 카드 뷰

카드 마크업은 `analytics-page.tsx:99-108`(Card/CardHeader/CardTitle/CardDescription)과
`badge.tsx`의 `Badge`를 따른다. 상태→뱃지 variant 리터럴 맵과 카드 내용만 새로 정한다.

```tsx
import type { BoardSection } from "~/pipeline/board";
import { Badge } from "~/ui/atoms/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/ui/atoms/card";
import { PipelineCommandButton } from "~/ui/pipeline-command";

// 없는 status는 "default". 완료=secondary(muted), 보류=destructive(red).
const STATUS_BADGE_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  완료: "secondary",
  보류: "destructive",
};

export function PipelineBoard({ sections }: { sections: BoardSection[] }) {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Pipeline</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            PROJECT_BOARD.md (dev) 투영 — 상태를 저장하지 않습니다.
          </p>
        </div>
        <PipelineCommandButton />
      </div>

      {sections.map((section) => (
        <section key={section.heading} className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            {section.heading}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {section.items.map((item) => (
              <Card key={`${section.heading}:${item.id}`}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">{item.id}</CardTitle>
                    {item.status && (
                      <Badge
                        variant={STATUS_BADGE_VARIANT[item.status] ?? "default"}
                      >
                        {item.status}
                      </Badge>
                    )}
                  </div>
                  <CardDescription>{item.title}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-1 text-sm text-muted-foreground">
                  {item.agent && <p>agent: {item.agent}</p>}
                  {item.area && <p>area: {item.area}</p>}
                  {item.result ? (
                    <p className="text-foreground">결과: {item.result}</p>
                  ) : (
                    item.reason && <p>근거: {item.reason}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
```

### `src/app/pipeline/page.tsx` (신규) — 라우트

`app/observability/page.tsx:12-19` 구조를 따른다.

```tsx
import type { Metadata } from "next";

import { requireAdmin } from "~/auth/guard";
import { getPipelineBoard } from "~/pipeline/queries";
import { AdminHeader } from "~/ui/admin-header";
import { PipelineBoard } from "~/ui/pipeline-page";

export const metadata: Metadata = {
  title: "Admin Pipeline",
  robots: { index: false, follow: false },
};

// 매 요청 dev 브랜치 보드를 다시 읽는 투영이므로 정적화하지 않는다.
export const dynamic = "force-dynamic";

export default async function AdminPipelineRoute() {
  const admin = await requireAdmin();
  const sections = await getPipelineBoard();

  return (
    <>
      <AdminHeader email={admin.email} />
      <main>
        <PipelineBoard sections={sections} />
      </main>
    </>
  );
}
```

## 테스트

- **덮는 것** — `src/pipeline/board.test.mjs` (`reporting.test.mjs`와 동일 형식: `node:test` +
  `node:assert/strict`, `import { parseBoard } from "./board.ts"`). 대표 보드 문자열 하나로:
  - 두 날짜 섹션이 각각 `heading`과 `items`로 잡히고, 항목의 `checked`/`id`/`title`/`agent`/`area`/`status`가 정확히 추출된다
  - `결과:`가 있는 항목은 `result`가 채워지고, 없는 항목은 `result === null`이며 `reason`이 채워진다
  - `- [x]` → `checked: true`, `- [ ]` → `checked: false`
  - 항목이 없는 `## 파이프라인 구조`(mermaid) 섹션은 결과에서 빠진다
  - 상단 `>` 안내 블록은 항목을 만들지 않는다
  - 제목에 `—`·`+`·`:`가 섞여도(`FEAT-03: ... — 보드 카드 뷰 + 원격 명령 버튼`) 온전히 잡힌다
- **타입 검증** — `npm run check -w apps/admin`(`next lint && tsc --noEmit`)이 신규 `.ts`/`.tsx`
  전부를 타입체크한다. `.mjs`는 `tsconfig`의 `include` 밖이라 **테스트가 통과해도 `check`가 막을 수
  있다** — 두 명령을 모두 돌려야 한다(에이전트 정의 B-5도 둘 다 요구한다).
- **못 덮는 범위** — `npm test`는 Node 내장 러너(DOM·React 도구 없음)라 다음은 못 덮는다:
  `queries.ts`의 보드 raw fetch(외부 I/O), `command-action.ts`의 이슈 코멘트 POST(외부 I/O),
  `requireAdmin()` 게이트(NextAuth 세션), 카드/뱃지의 React 렌더, 클라이언트 버튼의 `useTransition`·
  `toast`. 이들은 배포 후 수동 확인 대상이다.

## 범위 밖 의존

저장소 안에서는 **막히는 지점이 없다** — 전부 `apps/admin/src/**`와 `src/env.js`로 구현된다.
`packages/db`는 쓰지 않는다(보드는 GitHub raw에서 읽고 DB를 건드리지 않는다). `next.config.js`의 CSP도
안 고친다(GitHub 호출이 전부 서버 측이라 브라우저 `connect-src`에 걸리지 않는다) — 애초에
`next.config.js`는 편집 범위 밖(`src/` 아님)인데, 이 설계가 그것을 건드릴 필요를 없앤다.

다만 **런타임 전제** 둘은 저장소 밖이라 구현으로 완결되지 않는다(구현을 막지는 않는다):

1. **webhook 루틴 `pipeline-command`의 명령 계약은 확정됐다(2026-08-14 실측).** webhook은 이슈 코멘트
   생성 **전건**에 발화하며, 명령 선별은 루틴 지침이 한다: 이슈 #87 + 작성자가 저장소 소유자 +
   `[claude]` 접두가 아닌 것. 접두 토큰(`@claude` 류)은 존재하지 않는다 — 무접두 명령("백로그 요약해")이
   게시 51초 만에 `[claude]` 답글로 완주한 것이 확인 근거다. 남는 외부 의존은 하나: 루틴 지침은
   저장소 밖(claude.ai 설정)이라 doc-auditor의 감사가 닿지 않으므로, **루틴 지침을 바꿀 때
   `COMMAND_BODY`와의 정합은 사람이 지켜야 한다.**
2. **`GITHUB_PIPELINE_TOKEN` 값 주입은 사용자 몫(백로그 명시).** 그래서 `optional`로 둔다. 값이 없으면
   버튼은 `"GitHub token is not configured"` 실패 토스트를 낸다 — 조용히 실패하지 않는다.
   **토큰은 반드시 저장소 소유자(Sangeok) 계정의 것이어야 한다**(fine-grained PAT, `ApcH` 저장소,
   Issues Read and write). 루틴이 코멘트 **작성자**로 명령을 거르므로, 다른 계정·앱의 토큰이면 POST는
   성공하고 성공 토스트까지 뜨는데 루틴은 그 코멘트를 무시한다 — 이 기능에서 끝까지 조용한 실패가
   되는 유일한 구멍이 이 지점이다.

또한 이 기능은 admin에 **첫 외부 쓰기 경로**(GitHub 코멘트 POST)를 들인다. 이는 **DB 쓰기가 아니며**
(파이프라인 기능은 DB를 아예 안 건드린다), 백로그가 직접 요구한 소유자 발주 항목이다. 다만 "읽기 전용
관측"이라는 이 앱의 성격이 "GitHub에 코멘트를 쓸 수 있음"으로 넓어지는 변화이므로 승인 판단에 참고한다.

## 비고

- **문서 반영(구현 단계, 메인 루프 수행)** — `apps/admin/CLAUDE.md`는 이 계획의 담당 에이전트가 수정할
  수 없는 파일이라 필요한 3행 추가를 여기 남긴다: (a) Project Overview 라우트 표에
  `| /pipeline | 파이프라인 보드 투영 + 원격 명령 |` (b) Architecture 디렉터리 표에
  `| pipeline/ | 보드 파싱·조회·명령 — board.ts(순수) + queries.ts(fetch) + command-action.ts(쓰기) |`
  (c) 테스트 표에 `| pipeline/board.test.mjs | PROJECT_BOARD.md 파싱 — 섹션·항목·status·checked 추출, mermaid·안내 블록 제외 |`
  (+ 파일 수 카운트 2→3, 테스트 수 갱신).
- **비차단 위험** — (1) `raw.githubusercontent.com`은 CDN 캐시(약 5분)가 있어 `no-store`로도 보드 반영이
  수 분 늦을 수 있다. 내부 도구라 수용하고, 더 낮춰야 하면 `api.github.com` contents API(토큰 인증)로
  교체한다. (2) 보드 fetch 실패 시 페이지는 Next 기본 에러 화면이 된다 — 새로고침이 복구 경로다.
  (3) 버튼 이중 클릭은 `isPending`이 막지만 연속 클릭으로 코멘트 2건이 게시될 수 있다 — 루틴이 각각
  발화해도 "미답변 최신 1건 처리" 규칙이라 최악이 중복 답글이고, 이슈 페이지에서 관측된다.

## 대안

- **보드를 로컬 번들 파일로 읽기** (raw fetch 대신 빌드 시 포함된 `PROJECT_BOARD.md`를 `fs`로 읽기) —
  기각. admin은 web과 **별도 Vercel 프로젝트**라 번들 사본은 배포 시점에 고정된다. `source`가 "작업
  상태의 진실은 dev 브랜치 보드"라고 못박았으니 투영은 매 요청 live로 읽어야 한다. raw fetch(no-store)가 이를 만족한다.
- **Octokit 도입** — 기각. `npm install`이 금지고, 좌표 상수 + 헤더 몇 개면 native `fetch`로 충분하다.
- **명령 버튼을 카드마다 두기**(항목별 명령) — 기각. 게이트 전이는 사용자만(원격 게이트 잠김)이라
  항목별로 유의미한 비(非)게이트 명령이 없다. 전역 "Run pipeline" 하나가 현재 status대로 처리를 깨우는
  가장 단순·안전한 형태다. 추후 필요하면 명령 종류를 늘린다.
- **AdminHeader에 `/pipeline` 내비 링크 추가** — 이번 범위에서 제외. 공유 컴포넌트(analytics·
  observability도 씀)를 건드리지 않고 페이지를 `/pipeline` URL로 도달 가능하게만 둔다. 발견성 향상은
  후속 작업으로 남긴다(「비고」 성격).
