// 순수. board.ts/commands.ts와 같은 이유로 임포트 없음(progress.test.mjs로 덮인다).
// 이슈 #87 코멘트에서 "요청→응답"을 도출한다. 명령 코멘트와 [claude] 답글의 유일한
// 구분자는 본문 "[claude]" 접두다 — 둘 다 소유자 계정으로 게시되므로 작성자로는 못 가른다
// (2026-08-16 실측: 코멘트 12개 전부 Sangeok, 답글만 [claude] 접두). post-pipeline-command.ts의
// 계약(명령 본문은 [claude]로 시작하지 않는다)과 대칭이다.
export type CommentLite = { body: string; createdAt: string };

// sinceIso는 화면에 렌더하지 않는다 — pill은 kind와 minutes만 읽는다. 그래도 지우면 안 된다:
// "이 상태가 어느 명령을 가리키는가"를 테스트가 단언할 수 있는 유일한 관측점이고, 그게 없으면
// 아래 두 규칙을 고정할 수 없다 — awaiting/silent의 "가장 오래된 미응답 기준", responded의
// "최신 명령 기준". 둘 다 어긋난 구현이 나머지 명세를 전부 통과한다(돌연변이 검사 실측).
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
