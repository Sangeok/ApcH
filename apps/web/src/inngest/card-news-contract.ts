export type CardNewsEventData = {
  jobId: string;
  executionEpoch: number;
  revision: number;
  matchKey: string;
};
export type CardNewsEvents = {
  "card-news/generate.requested": { data: CardNewsEventData };
  "card-news/render.requested": { data: CardNewsEventData };
  "card-news/completed": { data: CardNewsEventData };
};

export function cardNewsMatchKey(
  data: Pick<CardNewsEventData, "jobId" | "executionEpoch" | "revision">,
): string {
  return `${data.jobId}:${data.executionEpoch}:${data.revision}`;
}
