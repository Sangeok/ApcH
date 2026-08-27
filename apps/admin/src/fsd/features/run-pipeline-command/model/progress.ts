// 순수. board.ts/commands.ts와 같은 이유로 임포트 없음(progress.test.mjs로 덮인다).
// 이슈 #87 코멘트에서 "요청 → (진행) → 응답"을 도출한다. 세 종류를 본문 접두로 가른다:
//  · 명령        : "[claude]"로 시작하지 않음(post-pipeline-command.ts 계약)
//  · 진행 코멘트 : "[claude][진행]"로 시작(루틴이 실행 중 남긴다 — [claude] 접두라 명령 필터를 통과하지 않는다)
//  · 종료 답글   : "[claude]"로 시작하되 "[claude][진행]"는 아님
// 셋 다 소유자 계정으로 게시되므로 작성자로는 못 가른다(2026-08-16 실측: 코멘트 전부 Sangeok).
export type CommentLite = { body: string; createdAt: string };

// sinceIso/lastEventIso는 화면에 렌더하지 않는다 — "이 상태가 어느 명령/어느 진행 이벤트를 가리키는가"를
// 테스트가 단언하는 관측점이다(둘이 어긋난 오구현이 나머지 명세를 통과하는 것을 돌연변이 검사가 잡는다).
// running.steps는 진행 코멘트에서 뽑은 단계 텍스트(오래된 순).
export type ProgressState =
  | { kind: "idle" }
  | { kind: "awaiting"; sinceIso: string; minutes: number }
  | {
      kind: "running";
      sinceIso: string;
      lastEventIso: string;
      minutes: number;
      steps: string[];
    }
  | { kind: "silent"; sinceIso: string; minutes: number }
  | { kind: "responded"; sinceIso: string }
  | { kind: "unknown" };

// 진행 코멘트가 0건인 명령의 무응답(삼킴) 임계 — 명령 시각 기준. 3분(실측 정상 0.3~2.6분 위, 기존값 유지).
export const SILENCE_THRESHOLD_MS = 180_000;
// 진행 코멘트가 있었으나 끊긴 세션의 무응답 임계 — 마지막 진행 코멘트 시각 기준. 10분.
// 실측 단계 간격 ≤4분 + 지침의 "커밋 직전 진행 코멘트" 규약이라 정상 실행은 닿지 않는다.
// 마지막 신호 후 10분 침묵 = 중단으로 보고 silent(점검·재전송 신호)로 넘긴다.
export const RUNNING_STALE_THRESHOLD_MS = 600_000;

const PROGRESS_PREFIX = "[claude][진행]";

function isProgress(body: string): boolean {
  return body.trimStart().startsWith(PROGRESS_PREFIX);
}
// 종료 답글: [claude] 접두이되 진행 코멘트는 아니다. 이 제외가 진행 코멘트를 상환에서 빼낸다 —
// 없으면(startsWith("[claude]") 하나면) 접수 코멘트가 곧바로 명령을 갚아 "응답 옴"이 뜬다.
function isReply(body: string): boolean {
  const t = body.trimStart();
  return t.startsWith("[claude]") && !t.startsWith(PROGRESS_PREFIX);
}
function progressText(body: string): string {
  return body.trimStart().slice(PROGRESS_PREFIX.length).trim();
}

export function deriveProgress(
  comments: CommentLite[],
  now: Date,
): ProgressState {
  // 짝짓기(FIFO) 모델은 그대로. 답글 1건이 가장 오래된 미응답 명령을 갚고(shift), 진행 코멘트는
  // 상환하지 않고 그 오래된 미응답 명령에 귀속한다. 답글이 명령을 갚으면 그 명령의 진행은 종결되고
  // 다음 오래된 명령은 빈 로그로 시작한다(귀속 리셋 — 두 명령이 밀려도 로그가 섞이지 않는다).
  const unanswered: string[] = []; // 미응답 명령의 createdAt(오래된 순)
  let lastCommandIso: string | null = null;
  let stepsForOldest: string[] = []; // 현재 가장 오래된 미응답 명령의 진행 단계
  let lastEventIso: string | null = null; // 그 명령의 마지막 진행 코멘트 시각
  for (const c of comments) {
    if (isProgress(c.body)) {
      // 귀속 대상(가장 오래된 미응답 명령)이 있을 때만 단계로 센다. 없으면 창 밖 명령의 진행 — 무시.
      if (unanswered.length > 0) {
        stepsForOldest.push(progressText(c.body));
        lastEventIso = c.createdAt;
      }
    } else if (isReply(c.body)) {
      unanswered.shift(); // 가장 오래된 미응답 명령을 갚는다(없으면 창 밖 명령의 답글 — 무시)
      stepsForOldest = []; // 갚힌 명령의 진행은 종결 — 다음 오래된 명령은 새로 시작
      lastEventIso = null;
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

  // 진행 코멘트가 있으면 마지막 진행 코멘트 기준으로 잰다(진행 중 vs 끊김).
  if (stepsForOldest.length > 0 && lastEventIso !== null) {
    const elapsed = now.getTime() - Date.parse(lastEventIso);
    if (Number.isNaN(elapsed)) return { kind: "unknown" };
    const minutes = Math.max(0, Math.floor(elapsed / 60_000));
    return elapsed >= RUNNING_STALE_THRESHOLD_MS
      ? { kind: "silent", sinceIso: oldest, minutes }
      : { kind: "running", sinceIso: oldest, lastEventIso, minutes, steps: stepsForOldest };
  }

  // 진행 코멘트가 0건이면 명령 시각 기준(기존 로직 — 삼킴 탐지 보존).
  const elapsed = now.getTime() - Date.parse(oldest);
  if (Number.isNaN(elapsed)) return { kind: "unknown" }; // created_at 파싱 불가
  const minutes = Math.max(0, Math.floor(elapsed / 60_000));
  return elapsed >= SILENCE_THRESHOLD_MS
    ? { kind: "silent", sinceIso: oldest, minutes }
    : { kind: "awaiting", sinceIso: oldest, minutes };
}

// 실행 버튼 잠금 판정(순수). 미응답 명령이 대기·진행 중이면(awaiting/running) 재클릭을 막는다 —
// 재클릭은 같은 명령 재게시 → 루틴 재발화 → 동시 실행 위험이다. silent(삼킴·끊김)는 잠그지 않는다:
// 2026-08-15 삼킴 사건 때 재전송이 필요했다(재전송 경로를 남긴다). responded/idle/unknown도 안 잠근다.
export function isRunLocked(state: ProgressState): boolean {
  return state.kind === "awaiting" || state.kind === "running";
}
