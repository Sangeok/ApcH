export const cardNewsKeys = {
  all: ["card-news"] as const,
  user: (userId: string) => ["card-news", userId] as const,
  list: (userId: string, filter = "all") =>
    ["card-news", userId, "list", filter] as const,
  detail: (userId: string, setId: string) =>
    ["card-news", userId, "detail", setId] as const,
};
