# FEAT-09: `/pipeline` 결재함에 반려 경로 — 게이트 거절을 대시보드에서

agent: admin-dev

## 현재 동작

FEAT-08이 결재함에 넣은 것은 **승인(도장) 한 방향뿐**이다.

- `src/pipeline/transitions.ts:3-6`의 `GATE_TRANSITIONS`는 `{ 승인대기: 계획지시, 검토대기: 구현승인 }` 두 쌍만 화이트리스트에 올린다. `resolveGateTransition`(11-16)이 이 화이트리스트 밖 status에는 전부 `null`을 돌려주고, `applyGateTransition`(31-69)은 status 줄 하나만 교체하는 최소 diff 편집이며 이 역시 같은 화이트리스트로 잠겨 있다.
- 결과를 기록하는 자리(`결과:` 필드)는 이미 있다 — `src/pipeline/board.ts:22`의 `FIELD_RE`가 `근거`·`결과` 둘 다 파싱한다. 하지만 `applyGateTransition`은 이 필드를 건드리지 않는다(승인은 사유가 필요 없다).
- `src/pipeline/commit-transition.ts:22-85`의 `commitGateTransition`은 GET(sha)→`applyGateTransition`→PUT(커밋) 왕복을 한다. 화이트리스트 밖 status는 `not-whitelisted`로 거부된다(15-20의 `REASON_MESSAGE`).
- `src/ui/pipeline-gate.tsx:19-53`의 `GateTransitionButton`이 유일한 게이트 UI다. 라벨은 곧 전이 목적지 status 문자열이고(`계획지시`/`구현승인`), 도장 임프린트 스타일(`STAMP_BUTTON_CLASS`, 13-17)로 승인만 표현한다.
- `src/ui/pipeline-page.tsx:90-130`의 `InboxCard`는 `gateTo = resolveGateTransition(item.status)`(92-93)가 `null`이 아닐 때만 `GateTransitionButton` 하나를 렌더한다(106-117). 반려 버튼·메뉴는 없다.
- `src/pipeline/briefing.ts:30`의 `GATE_STATUSES = new Set(["승인대기", "검토대기"])`가 결재함(inbox) 판정 기준이다. 같은 파일 112-117의 `FEED_TONE`은 `보류: "hold"`를 이미 매핑하고 있어(FEAT-09 착수 전부터), 항목이 `보류`로 내려가면 브리핑이 별도 코드 없이 hold 톤으로 렌더한다.
- `TASK_BACKLOG.md`는 대시보드에서 편집되는 경로가 없다(admin은 GitHub contents API로 `PROJECT_BOARD.md`만 커밋한다, `src/pipeline/github.ts:12-13`의 `BOARD_CONTENTS_URL`).

즉 계획이 틀렸거나, 지금 하지 않기로 하거나, 항목 자체가 필요 없어졌을 때 — 이 셋 다 대시보드 밖(세션 지시 또는 보드 파일 직접 수정)에서만 처리할 수 있다.

## 문제

`TASK_BACKLOG.md:66-79`(FEAT-09 항목)가 요구사항의 원천이다. 관측은 정확하다: "결재는 승인·반려가 쌍인데 승인만 만들었다"(`GATE_TRANSITIONS`가 편도), 그리고 FEAT-01을 보류로 내리는 데 실제로 수동 처리가 필요했다(2026-08-16, `PROJECT_BOARD.md` FEAT-01 행이 `계획지시`가 아니라 `보류`로 사람이 직접 편집한 결과다).

백로그는 거절을 하나로 뭉치지 않고 세 갈래로 구분해 판단하라고 명시한다.

- **(a) 되돌리기**: 계획서가 틀렸다 → `검토대기` → `계획지시`. 계획서 파일 자체를 갱신할지 새로 쓸지는 **이미 admin-dev 자신의 절차(`.claude/agents/admin-dev.md`의 A-3: "같은 이름의 파일이 이미 있으면 읽지 말고 덮어쓴다")가 결정한다** — 코드가 개입할 자리가 아니다. `승인대기`는 아직 계획서가 없으므로 되돌릴 대상이 없다: 되돌리기는 `검토대기`에서만 연다.
- **(b) 보류**: `승인대기`·`검토대기` → `보류`. 폐기가 아니라 대기이며, 사유가 보드의 `결과:` 필드에 남아야 한다(FEAT-01 보류 기록이 선례). **사유 입력을 UI에서 자유 텍스트로 받는다** — 고정 문구는 FEAT-01처럼 다음 사람이 왜 멈췄는지 판단할 근거를 남기지 못한다.
- **(c) 폐기**: 보드 행 제거. 되돌릴 수 없는 유일한 갈래라 안전 등급이 다르다 — 항목 ID를 타이핑해 확인하는 게이트를 둔다(보류·되돌리기의 2단계 확인보다 한 단계 더 무겁게).

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `src/pipeline/transitions.ts` | 반려 화이트리스트·순수 편집 함수 3종(되돌리기·보류·폐기) + 커밋 문구 3종 추가 |
| `src/pipeline/transitions.test.mjs` | 위 함수들의 화이트리스트·최소 diff·다중 등장·거부 사유·주입 방어 테스트 추가 |
| `src/pipeline/reject-transition.ts` `(신규)` | 서버 액션 3종 — `commit-transition.ts`와 같은 GET(sha)→순수 편집→PUT(커밋) 왕복을 공유 헬퍼로 묶어 반려 세 경로가 재사용 |
| `src/ui/pipeline-gate.tsx` | `RejectMenu` 컴포넌트 추가(도장 옆 반려 트리거 + 되돌리기/보류/폐기 3단 확인 패널) |
| `src/ui/pipeline-page.tsx` | `InboxCard`가 `GateTransitionButton` 옆에 `RejectMenu`를 렌더하도록 수정 |

여기 적히지 않은 파일(`briefing.ts`, `board.ts`, `commit-transition.ts`, `TASK_BACKLOG.md` 등)은 구현 단계에서 고치지 않는다. `board.ts`는 `결과:` 필드를 이미 파싱하므로 변경이 필요 없고, `briefing.ts`는 `보류` 톤을 이미 처리하므로(GATE_STATUSES·FEED_TONE) 변경이 필요 없다.

## 구현 스케치

### 디자인 방향 (frontend-design 2-pass 결과)

이 화면의 시그니처는 이미 FEAT-08이 확정한 "도장 임프린트"다 — 반려가 새 모티프를 발명하면 결재함 하나에 두 개의 시각 언어가 생긴다. 그래서 이번 항목의 유일한 디자인 결정은 **같은 은유 안에서 색만으로 승인/반려를 가르는 것**이다. 그것이 이 항목의 시그니처다.

- **색**: 반려 트리거는 도장과 같은 임프린트 문법(테두리 2px·hard 오프셋 그림자·hover 들림/active 눌림)을 그대로 쓰되 잉크를 `--stamp`(오커)에서 `--hold`(oklch(0.5 0.13 42), 이미 브리핑 피드에서 "보류" 톤으로 쓰이는 갈색-주황 잉크, `briefing.ts:117`)로 바꾼다. 메뉴를 펼치면 각 선택지가 자기 목적지 색을 미리 보여준다 — 되돌리기=`--active`(전이 목적지 `계획지시`가 이미 active 톤이므로, `briefing.ts:113`), 보류=`--hold`, 폐기=`--destructive`(이 팔레트에서 지금까지 클립 검토 화면에만 쓰인 진짜 위험색을 처음 재사용 — "되돌릴 수 없음"이 이 대시보드에 처음 등장하는 진짜 위험이기 때문이다).
- **타입**: `font-briefing-display`(세리프, 도장 정체성)는 반려 트리거 라벨에만 남긴다. 펼쳐진 메뉴 안은 본문 산세리프(`text-xs`) — 선택지는 "결정을 선언"하는 게 아니라 "무엇이 일어나는지 설명"하는 자리라 세리프의 무게를 빼서 구분한다.
- **레이아웃**: 카드 안에 인라인으로 펼치지 않는다. 결재함 카드는 이미 캐릭터·발화·근거 상세로 밀도가 높아서(`pipeline-page.tsx:94-129`), 확인 UI까지 인라인으로 밀어 넣으면 카드가 출렁인다. 트리거 아래 고정폭(`w-72`) 팝오버로 앵커링한다(`absolute right-0 top-full`) — 카드 흐름은 그대로 두고 패널만 위에 뜬다.
- **마찰의 형태**: 세 갈래는 되돌릴 수 있는 정도가 다르므로 확인 절차의 무게도 다르다. 되돌리기·보류는 "펼치기 → 해당 선택 → 확정 버튼"의 2단계, 폐기는 여기에 **항목 ID를 정확히 타이핑해야 확정 버튼이 풀리는** 3단계를 더한다(GitHub의 "저장소 이름을 입력하세요" 패턴과 같은 논리 — 유일하게 되돌릴 수 없는 조작이니 유일하게 다른 마찰을 준다).

### `src/pipeline/transitions.ts` — 파일 끝에 추가

```ts
// 반려(거절) — 되돌리기·보류·폐기. 대상 status는 도장 승인과 같은 결재함
// 상태(승인대기·검토대기)뿐이다. GATE_TRANSITIONS의 키에서 그대로 뽑아,
// 화이트리스트가 둘로 갈라져 서로 어긋나는 일을 구조적으로 막는다.
const REJECTABLE_STATUSES = new Set(Object.keys(GATE_TRANSITIONS));
export function canReject(fromStatus: string): boolean {
  return REJECTABLE_STATUSES.has(fromStatus);
}

// 되돌리기: 계획이 틀렸다 → 검토대기만 계획지시로 되돌린다. 승인대기는
// 되돌릴 계획서 자체가 없으므로 대상이 아니다.
export const REVERT_TRANSITIONS = { 검토대기: "계획지시" } as const;
type RevertFromStatus = keyof typeof REVERT_TRANSITIONS;

export function resolveRevertTransition(fromStatus: string): "계획지시" | null {
  return Object.hasOwn(REVERT_TRANSITIONS, fromStatus)
    ? REVERT_TRANSITIONS[fromStatus as RevertFromStatus]
    : null;
}

// applyGateTransition과 같은 헤더/블록 탐색을 쓰지만 화이트리스트가 달라
// 별도 함수로 둔다(기존에 테스트로 굳어진 applyGateTransition은 건드리지 않는다).
export function applyRevertTransition(
  markdown: string,
  id: string,
  expectedStatus: string,
): GateTransitionResult {
  const to = resolveRevertTransition(expectedStatus);
  if (to === null) return { ok: false, reason: "not-whitelisted" };

  const headerRe = new RegExp(`^- \\[[ xX]\\] ${escapeRegExp(id)}: .+$`, "m");
  const header = headerRe.exec(markdown);
  if (header === null) return { ok: false, reason: "not-found" };
  const headerLine = header[0];
  if (headerLine === undefined) return { ok: false, reason: "not-found" };

  const afterHeader = header.index + headerLine.length;
  const rest = markdown.slice(afterHeader);
  const endMatch = BLOCK_END_RE.exec(rest);
  const blockEnd =
    endMatch === null ? markdown.length : afterHeader + endMatch.index;

  const block = markdown.slice(afterHeader, blockEnd);
  const status = STATUS_LINE_RE.exec(block);
  if (status === null) return { ok: false, reason: "format" };
  const prefix = status[1];
  const value = status[2];
  if (prefix === undefined || value === undefined) {
    return { ok: false, reason: "format" };
  }
  if (value.trim() !== expectedStatus) return { ok: false, reason: "stale" };

  const newBlock = block.replace(STATUS_LINE_RE, `${prefix}${to}`);
  const newMarkdown =
    markdown.slice(0, afterHeader) + newBlock + markdown.slice(blockEnd);
  return { ok: true, markdown: newMarkdown, to };
}

// 보류 — status 교체 + 결과 필드 기록. reason은 사람이 타이핑한 자유
// 텍스트라 개행을 지운다: FIELD_RE는 한 줄 형식이고, 개행을 허용하면
// "- [ ] FAKE-99: ..." 같은 줄을 주입해 가짜 보드 항목을 만들 수 있다.
export type RejectTransitionResult =
  | { ok: true; markdown: string; to: "보류" }
  | {
      ok: false;
      reason:
        | "not-whitelisted"
        | "not-found"
        | "format"
        | "stale"
        | "empty-reason";
    };

function sanitizeReason(reason: string): string {
  return reason.replace(/[\r\n]+/g, " ").trim();
}

const RESULT_LINE_RE = /^([ \t]+결과:[ \t]*)(.*)$/m;

export function applyHoldTransition(
  markdown: string,
  id: string,
  expectedStatus: string,
  reason: string,
): RejectTransitionResult {
  if (!canReject(expectedStatus)) return { ok: false, reason: "not-whitelisted" };
  const clean = sanitizeReason(reason);
  if (clean === "") return { ok: false, reason: "empty-reason" };

  const headerRe = new RegExp(`^- \\[[ xX]\\] ${escapeRegExp(id)}: .+$`, "m");
  const header = headerRe.exec(markdown);
  if (header === null) return { ok: false, reason: "not-found" };
  const headerLine = header[0];
  if (headerLine === undefined) return { ok: false, reason: "not-found" };

  const afterHeader = header.index + headerLine.length;
  const rest = markdown.slice(afterHeader);
  const endMatch = BLOCK_END_RE.exec(rest);
  const blockEnd =
    endMatch === null ? markdown.length : afterHeader + endMatch.index;

  const block = markdown.slice(afterHeader, blockEnd);
  const status = STATUS_LINE_RE.exec(block);
  if (status === null) return { ok: false, reason: "format" };
  const prefix = status[1];
  const value = status[2];
  if (prefix === undefined || value === undefined) {
    return { ok: false, reason: "format" };
  }
  if (value.trim() !== expectedStatus) return { ok: false, reason: "stale" };

  const indent = /^[ \t]+/.exec(prefix)?.[0] ?? "  ";
  const resultLine = `${indent}결과: ${clean}`;
  const statusReplaced = block.replace(STATUS_LINE_RE, `${prefix}보류`);
  // 결과 줄 삽입은 함수 콜백으로 치환한다 — clean(자유 텍스트)에 "$&" 같은
  // 패턴 치환 특수열이 들어 있으면 문자열 치환은 엉뚱한 값을 끼워 넣는다.
  const newBlock = RESULT_LINE_RE.test(statusReplaced)
    ? statusReplaced.replace(RESULT_LINE_RE, () => resultLine)
    : `${statusReplaced}\n${resultLine}`;

  const newMarkdown =
    markdown.slice(0, afterHeader) + newBlock + markdown.slice(blockEnd);
  return { ok: true, markdown: newMarkdown, to: "보류" };
}

// 폐기 — 항목 블록(헤더+필드)을 통째로 지운다. TASK_BACKLOG.md는 건드리지
// 않는다(백로그 편집 UI는 TASK_BACKLOG.md 원문 out of scope 항목).
export type DiscardTransitionResult =
  | { ok: true; markdown: string }
  | {
      ok: false;
      reason: "not-whitelisted" | "not-found" | "format" | "stale";
    };

export function applyDiscardTransition(
  markdown: string,
  id: string,
  expectedStatus: string,
): DiscardTransitionResult {
  if (!canReject(expectedStatus)) return { ok: false, reason: "not-whitelisted" };

  const headerRe = new RegExp(`^- \\[[ xX]\\] ${escapeRegExp(id)}: .+$`, "m");
  const header = headerRe.exec(markdown);
  if (header === null) return { ok: false, reason: "not-found" };
  const headerLine = header[0];
  if (headerLine === undefined) return { ok: false, reason: "not-found" };

  const afterHeader = header.index + headerLine.length;
  const rest = markdown.slice(afterHeader);
  const endMatch = BLOCK_END_RE.exec(rest);
  const blockEnd =
    endMatch === null ? markdown.length : afterHeader + endMatch.index;

  const block = markdown.slice(afterHeader, blockEnd);
  const status = STATUS_LINE_RE.exec(block);
  if (status === null) return { ok: false, reason: "format" };
  const value = status[2];
  if (value === undefined) return { ok: false, reason: "format" };
  if (value.trim() !== expectedStatus) return { ok: false, reason: "stale" };

  // blockEnd는 다음 블록 앞 구분 개행의 위치다. 헤더부터 그 개행까지
  // 함께 지워야 빈 줄이 남지 않는다.
  const newMarkdown =
    markdown.slice(0, header.index) + markdown.slice(blockEnd + 1);
  return { ok: true, markdown: newMarkdown };
}

export function revertCommitMessage(id: string): string {
  return `docs(board): reject ${id} back to planning via dashboard reject`;
}
export function holdCommitMessage(id: string): string {
  return `docs(board): hold ${id} via dashboard reject`;
}
export function discardCommitMessage(id: string): string {
  return `docs(board): discard ${id} via dashboard reject`;
}
```

### `src/pipeline/reject-transition.ts` (신규) — 전체

```ts
"use server";

import { env } from "~/env";
import { requireAdmin } from "~/auth/guard";
import { type ActionResult, failure, success } from "~/lib/result";
import { BOARD_BRANCH, BOARD_CONTENTS_URL } from "./github";
import {
  applyDiscardTransition,
  applyHoldTransition,
  applyRevertTransition,
  discardCommitMessage,
  holdCommitMessage,
  revertCommitMessage,
} from "./transitions";

const GITHUB_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

const REASON_MESSAGE: Record<string, string> = {
  "not-whitelisted": "허용되지 않은 반려입니다",
  "not-found": "보드에서 항목을 찾지 못했습니다",
  format: "보드 형식을 해석하지 못했습니다",
  stale: "보드가 이미 바뀌었습니다. 새로고침 후 다시 시도하세요",
  "empty-reason": "보류 사유를 입력하세요",
};

type BoardEdit = { ok: true; markdown: string } | { ok: false; reason: string };

// commit-transition.ts와 같은 GET(sha)→순수 편집→PUT(커밋) 왕복을 반려
// 세 경로가 공유한다. 인가는 그대로 try 밖 최상단
// (NEXT_REDIRECT를 catch가 삼키지 않게, commit-transition.ts와 동일).
async function commitBoardEdit(
  edit: (markdown: string) => BoardEdit,
  message: string,
): Promise<ActionResult<void>> {
  await requireAdmin();

  const token = env.GITHUB_PIPELINE_TOKEN;
  if (!token) {
    return failure("GitHub 토큰이 설정되지 않았습니다");
  }
  const auth = { ...GITHUB_HEADERS, Authorization: `Bearer ${token}` };

  let getRes: Response;
  try {
    getRes = await fetch(`${BOARD_CONTENTS_URL}?ref=${BOARD_BRANCH}`, {
      headers: auth,
      cache: "no-store",
    });
  } catch (error) {
    console.error("Failed to load board", error);
    return failure("보드를 불러오지 못했습니다");
  }
  if (!getRes.ok) {
    return failure(`GitHub API가 ${getRes.status} 오류로 응답했습니다`);
  }
  const meta = (await getRes.json()) as { content?: string; sha?: string };
  if (typeof meta.content !== "string" || typeof meta.sha !== "string") {
    return failure("보드 콘텐츠를 읽지 못했습니다");
  }
  const markdown = Buffer.from(meta.content, "base64").toString("utf-8");

  const result = edit(markdown);
  if (!result.ok) {
    return failure(REASON_MESSAGE[result.reason] ?? "반려를 적용하지 못했습니다");
  }

  let putRes: Response;
  try {
    putRes = await fetch(BOARD_CONTENTS_URL, {
      method: "PUT",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        content: Buffer.from(result.markdown, "utf-8").toString("base64"),
        sha: meta.sha,
        branch: BOARD_BRANCH,
      }),
    });
  } catch (error) {
    console.error("Failed to commit board reject", error);
    return failure("보드 커밋에 실패했습니다");
  }
  if (putRes.status === 409) {
    return failure("보드가 방금 바뀌었습니다. 새로고침 후 다시 시도하세요");
  }
  if (!putRes.ok) {
    return failure(`GitHub API가 ${putRes.status} 오류로 응답했습니다`);
  }
  return success();
}

export async function commitRevertTransition(
  id: string,
  expectedStatus: string,
): Promise<ActionResult<void>> {
  return commitBoardEdit(
    (markdown) => applyRevertTransition(markdown, id, expectedStatus),
    revertCommitMessage(id),
  );
}

export async function commitHoldTransition(
  id: string,
  expectedStatus: string,
  reason: string,
): Promise<ActionResult<void>> {
  return commitBoardEdit(
    (markdown) => applyHoldTransition(markdown, id, expectedStatus, reason),
    holdCommitMessage(id),
  );
}

export async function commitDiscardTransition(
  id: string,
  expectedStatus: string,
): Promise<ActionResult<void>> {
  return commitBoardEdit(
    (markdown) => applyDiscardTransition(markdown, id, expectedStatus),
    discardCommitMessage(id),
  );
}
```

### `src/ui/pipeline-gate.tsx` — import 교체 + 컴포넌트 추가

before(1-8):
```tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { commitGateTransition } from "~/pipeline/commit-transition";
import { Button } from "~/ui/atoms/button";
```

after:
```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { ActionResult } from "~/lib/result";
import { cn } from "~/lib/utils";
import { commitGateTransition } from "~/pipeline/commit-transition";
import {
  commitDiscardTransition,
  commitHoldTransition,
  commitRevertTransition,
} from "~/pipeline/reject-transition";
import { resolveRevertTransition } from "~/pipeline/transitions";
import { Button } from "~/ui/atoms/button";
```

`GateTransitionButton`(기존 19-53)은 그대로 둔다. 파일 끝에 추가:

```tsx
type RejectStage = "closed" | "menu" | "revert-confirm" | "hold" | "discard";

// 도장과 같은 임프린트 문법(테두리·hard 그림자·press)이되 잉크만 --hold로
// 바꿔 "승인이 아니다"를 형태가 아니라 색으로 가른다.
const REJECT_TRIGGER_CLASS =
  "h-auto rounded-sm border-2 border-hold bg-transparent px-2.5 py-1 " +
  "font-briefing-display text-xs font-medium tracking-wide text-hold " +
  "shadow-[1px_1px_0_0_var(--hold)] transition-transform " +
  "hover:-translate-y-px active:translate-y-0 active:shadow-none disabled:opacity-60";

const REJECT_OPTION_CLASS =
  "w-full rounded-sm border px-2 py-1.5 text-left text-xs leading-snug " +
  "transition-colors disabled:opacity-50";

const REJECT_CONFIRM_CLASS =
  "rounded-sm border px-2.5 py-1 text-xs font-medium disabled:opacity-50";

function useRejectRunner(onClose: () => void) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const run = (action: () => Promise<ActionResult<void>>, doneLabel: string) => {
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(doneLabel);
      onClose();
      router.refresh();
    });
  };

  return { run, isPending };
}

export function RejectMenu({ id, status }: { id: string; status: string }) {
  const [stage, setStage] = useState<RejectStage>("closed");
  const [reason, setReason] = useState("");
  const [confirmId, setConfirmId] = useState("");

  const close = () => {
    setStage("closed");
    setReason("");
    setConfirmId("");
  };

  const { run, isPending } = useRejectRunner(close);
  const canRevert = resolveRevertTransition(status) !== null;

  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        className={REJECT_TRIGGER_CLASS}
        onClick={() => setStage(stage === "closed" ? "menu" : "closed")}
      >
        반려
      </Button>
      {stage !== "closed" && (
        <div className="absolute right-0 top-full z-10 mt-2 w-72 rounded-lg border border-hold/40 bg-card p-3 shadow-md">
          {stage === "menu" && (
            <div className="flex flex-col gap-1.5">
              {canRevert && (
                <button
                  type="button"
                  className={cn(REJECT_OPTION_CLASS, "border-active/30 text-active")}
                  onClick={() => setStage("revert-confirm")}
                >
                  되돌리기 — 계획서를 다시 씁니다
                </button>
              )}
              <button
                type="button"
                className={cn(REJECT_OPTION_CLASS, "border-hold/30 text-hold")}
                onClick={() => setStage("hold")}
              >
                보류 — 지금은 하지 않습니다
              </button>
              <button
                type="button"
                className={cn(REJECT_OPTION_CLASS, "border-destructive/30 text-destructive")}
                onClick={() => setStage("discard")}
              >
                폐기 — 되돌릴 수 없습니다
              </button>
              <button
                type="button"
                className="mt-1 self-start text-xs text-muted-foreground hover:underline"
                onClick={close}
              >
                취소
              </button>
            </div>
          )}

          {stage === "revert-confirm" && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-active">계획서를 다시 쓰도록 되돌릴까요?</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={isPending}
                  className={cn(REJECT_CONFIRM_CLASS, "border-active bg-active/10 text-active")}
                  onClick={() =>
                    run(() => commitRevertTransition(id, status), "계획지시로 되돌렸습니다")
                  }
                >
                  {isPending ? "되돌리는 중..." : "되돌리기 확정"}
                </button>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:underline"
                  onClick={close}
                >
                  취소
                </button>
              </div>
            </div>
          )}

          {stage === "hold" && (
            <div className="flex flex-col gap-2">
              <label className="text-xs text-hold" htmlFor={`hold-reason-${id}`}>
                보류 사유
              </label>
              <textarea
                id={`hold-reason-${id}`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="왜 지금 하지 않는지 남깁니다"
                className="rounded-sm border border-hold/40 bg-background p-2 text-xs text-foreground"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={isPending || reason.trim() === ""}
                  className={cn(REJECT_CONFIRM_CLASS, "border-hold bg-hold/10 text-hold")}
                  onClick={() =>
                    run(() => commitHoldTransition(id, status, reason), "보류로 내렸습니다")
                  }
                >
                  {isPending ? "내리는 중..." : "보류 확정"}
                </button>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:underline"
                  onClick={close}
                >
                  취소
                </button>
              </div>
            </div>
          )}

          {stage === "discard" && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-destructive">
                되돌릴 수 없습니다. 보드에서만 지워지며 TASK_BACKLOG.md 항목은
                남습니다. 확인을 위해 {id}를 입력하세요.
              </p>
              <input
                value={confirmId}
                onChange={(e) => setConfirmId(e.target.value)}
                placeholder={id}
                className="rounded-sm border border-destructive/40 bg-background p-2 text-xs text-foreground"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={isPending || confirmId.trim() !== id}
                  className={cn(
                    REJECT_CONFIRM_CLASS,
                    "border-destructive bg-destructive/10 text-destructive",
                  )}
                  onClick={() =>
                    run(() => commitDiscardTransition(id, status), "폐기했습니다")
                  }
                >
                  {isPending ? "폐기하는 중..." : "폐기 확정"}
                </button>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:underline"
                  onClick={close}
                >
                  취소
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

### `src/ui/pipeline-page.tsx` — import 한 줄 + `InboxCard` 버튼 행

before(7):
```tsx
import { GateTransitionButton } from "~/ui/pipeline-command";
```
(주: 실제로는 `~/ui/pipeline-gate`에서 옴 — 현재 코드 정확 인용)
```tsx
import { GateTransitionButton } from "~/ui/pipeline-gate";
```
after:
```tsx
import { GateTransitionButton, RejectMenu } from "~/ui/pipeline-gate";
```

before(106-117, `InboxCard` 버튼 행):
```tsx
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {item.id} · {item.status}
        </p>
        {gateTo !== null && (
          <GateTransitionButton
            id={item.id}
            status={item.status ?? ""}
            label={gateTo}
          />
        )}
      </div>
```
after:
```tsx
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {item.id} · {item.status}
        </p>
        <div className="flex items-center gap-2">
          {gateTo !== null && (
            <GateTransitionButton
              id={item.id}
              status={item.status ?? ""}
              label={gateTo}
            />
          )}
          {gateTo !== null && (
            <RejectMenu id={item.id} status={item.status ?? ""} />
          )}
        </div>
      </div>
```

## 테스트

**덮는 것** (`transitions.test.mjs`에 추가):

- `canReject` — 승인대기·검토대기는 `true`, 완료·보류·계획지시·구현승인·임의값·빈 문자열은 `false`(`resolveGateTransition`이 `null`을 주는 것과 정확히 같은 집합인지 교차 검증).
- `resolveRevertTransition` — 검토대기만 `계획지시`, 승인대기를 포함한 나머지 전부(`__proto__` 등 프로토타입 오염 키 포함) `null`.
- `applyRevertTransition` — (1) 검토대기 항목이 계획지시로만 바뀌고 나머지 필드·다른 항목은 그대로(최소 diff, 한 줄만 변경), (2) 승인대기 대상은 `not-whitelisted`(되돌릴 계획이 없다는 화이트리스트 그대로 반영), (3) stale·not-found·format 거부.
- `applyHoldTransition` — (1) 승인대기·검토대기 각각에서 보류로 바뀌고 결과 줄이 새로 삽입됨(들여쓰기가 근거 줄과 동일), (2) 이미 결과 줄이 있는 항목(과거 보류 이력 재사용 등 에지 케이스)에서는 삽입이 아니라 교체되어 결과 줄이 하나만 남음, (3) reason에 개행 + `- [ ] FAKE-99: 가짜` 같은 주입 문자열을 넣어도 결과가 한 줄로 합쳐지고, 편집된 markdown을 `parseBoard`로 재파싱했을 때 FAKE-99가 새 항목으로 나타나지 않음(주입 방어), (4) reason이 공백뿐이면 `empty-reason`, (5) 완료·보류 상태 대상은 `not-whitelisted`, (6) stale·not-found·format 거부.
- `applyDiscardTransition` — (1) 항목 블록이 통째로 사라지고 `parseBoard` 결과에서 그 ID가 없어지며 다른 항목·섹션은 그대로(빈 줄이 남지 않는지 줄 수로 확인), (2) 같은 ID가 두 섹션에 있을 때(FEAT-08 다중 등장 픽스처 재사용) 최신(위) 행만 지워지고 이력 행은 그대로, (3) not-whitelisted·stale·not-found·format 거부.
- `revertCommitMessage`·`holdCommitMessage`·`discardCommitMessage` — 정확한 문자열.

**못 덮는 범위** (Node 러너·DOM/외부 I/O 없음):

- `reject-transition.ts`의 `commitBoardEdit` — GET/PUT 왕복, sha 409 분기, `requireAdmin()` 게이트, 토큰 미설정 분기.
- `RejectMenu`의 렌더·상태 전이(스테이지 4종)·`useTransition`·`toast`·`router.refresh()`.
- 팝오버 위치(`absolute right-0 top-full`)가 카드 경계 안에서 실제로 안 잘리는지, 반려 트리거의 도장 임프린트 대비(`--hold` 잉크 vs `bg-transparent` 배경)의 실측 명도 대비, 폰 너비에서 `w-72` 패널이 카드 폭을 넘지 않는지 — 배포 후 데스크톱+폰 수동 확인 대상.
- 폐기 확정 입력(`confirmId.trim() !== id`)의 IME 조합 문자 입력 등 실제 타이핑 경험.

## 범위 밖 의존

없음. 모든 변경이 `apps/admin/src/**` 안에서 끝난다. `TASK_BACKLOG.md` 편집(폐기 시 백로그 항목 제거)은 백로그 자체가 "out of scope: 백로그를 대시보드에서 편집하는 것 — 별개 항목"이라고 명시하므로 이 계획에 포함하지 않았다. 폐기는 보드 행만 지우고, UI 문구로 "백로그 항목은 남습니다"를 미리 알린다.

## 대안

- **하나의 "반려" 버튼이 바로 폐기하고, 되돌리기/보류는 별도 버튼으로 둔다** — 기각. 셋을 나란히 놓으면 실수로 폐기를 누르기 더 쉽고, 백로그가 요구한 "실수 클릭 방지"(폐기가 특히 무겁다)를 만족하려면 오히려 폐기를 한 단계 더 깊이 넣는 지금 구조(메뉴 → 폐기 선택 → ID 타이핑)가 맞다.
- **`applyGateTransition`을 일반화해 되돌리기와 공유 헬퍼로 묶는다** — 기각. `applyGateTransition`은 이미 `transitions.test.mjs` 12개 테스트로 굳어진 보안 경계 함수다(대시보드가 임의 status를 커밋할 수 있는지가 걸린 파일이라고 `apps/admin/CLAUDE.md`가 명시). 되돌리기용으로 리팩터링해 그 함수의 동작이 조금이라도 흔들리면 승인 경로까지 같이 흔들린다. 코드 중복(헤더/블록 탐색 로직)이 늘지만, 안전 경계가 걸린 파일에서는 "각 전이가 자기 화이트리스트를 들고 있는 독립 함수"라는 기존 스타일을 그대로 따르는 편이 낫다.
- **폐기 확정에 GitHub 이슈 코멘트(#87)로 통지를 남긴다** — 기각. 백로그가 "이슈 #87 채널의 게이트 거절은 그대로 유지(대시보드 전용)"라고 못박았다. 폐기가 코멘트를 만들면 외부 webhook 루틴이 그 텍스트를 명령으로 오인할 위험이 생긴다(`command-action.ts`의 화이트리스트 밖 경로를 새로 여는 셈).
- **보류 사유를 고정 문구 목록(드롭다운)으로 받는다** — 기각. FEAT-01의 보류 기록처럼 다음 사람이 왜 멈췄는지 판단하려면 자유 텍스트가 필요하다. 서버 쪽에서 빈 문자열만 막고(`empty-reason`) 그 외에는 사람이 쓴 그대로 남긴다.
