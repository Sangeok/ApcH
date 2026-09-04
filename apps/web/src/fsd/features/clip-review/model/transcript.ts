export interface TranscriptWord {
  start: number;
  end: number;
  word: string;
}

// 백엔드 transcribe_video가 저장한 단어 단위 JSON을 검증·필터한다. 배열이 아니면
// 던진다(빈 배열로 접으면 실패가 "단어 스냅이 조용히 꺼진 화면"으로만 나타난다).
export function parseTranscriptWords(payload: unknown): TranscriptWord[] {
  if (!Array.isArray(payload)) {
    throw new Error("Transcript payload was not an array");
  }
  return payload.filter(
    (word): word is TranscriptWord =>
      typeof word === "object" &&
      word !== null &&
      typeof (word as TranscriptWord).start === "number" &&
      typeof (word as TranscriptWord).end === "number" &&
      typeof (word as TranscriptWord).word === "string",
  );
}
