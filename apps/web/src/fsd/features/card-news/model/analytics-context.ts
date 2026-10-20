export type CardNewsAnalyticsContext = {
  anonymousId: string;
  sessionId: string;
};

const idSuffix =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|\d{10,16}-[a-z0-9]+)$/i;

export function sanitizeCardNewsAnalyticsContext(
  value: unknown,
): CardNewsAnalyticsContext | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  if (keys.length !== 2 || !("anonymousId" in value) || !("sessionId" in value))
    return null;
  const readId = (key: "anonymousId" | "sessionId", prefix: string) => {
    const raw = value[key];
    if (typeof raw !== "string") return null;
    const id = raw.trim();
    return id.length >= 8 &&
      id.length <= 80 &&
      id.startsWith(prefix) &&
      idSuffix.test(id.slice(prefix.length))
      ? id
      : null;
  };
  const anonymousId = readId("anonymousId", "anon_");
  const sessionId = readId("sessionId", "session_");
  return anonymousId && sessionId ? { anonymousId, sessionId } : null;
}
