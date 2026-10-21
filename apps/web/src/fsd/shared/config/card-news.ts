export const CARD_NEWS_CONFIG = {
  schemaVersion: 1,
  price: 1,
  defaultCardCount: 5,
  minCards: 3,
  maxCards: 7,
  templateVersion: "card-news-v1",
  fontVersion: "noto-sans-kr-2.004",
  promptVersion: "card-news-grounded-v1",
  modelVersion: "gemini-2.5-flash",
  dispatchIntervalMs: 60_000,
  dispatchDeadlineMs: 300_000,
  cpuTimeoutMs: 600_000,
  jobTimeoutMs: 900_000,
  modelTimeoutMs: 120_000,
  retentionDelayMs: 86_400_000,
  pollIntervalMs: 5_000,
} as const;

type AdmissionSettings = {
  enabled: boolean;
  allowedUserIds: string;
  endpoint?: string;
  endpointAuth?: string;
  webhookSecret?: string;
  siteUrl?: string;
};

export function isCardNewsEnabledForUser(
  settings: Pick<AdmissionSettings, "enabled" | "allowedUserIds">,
  userId: string,
): boolean {
  return (
    settings.enabled ||
    settings.allowedUserIds.split(",").some((id) => id.trim() === userId)
  );
}

function isHttpsUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function canAcceptCardNews(
  settings: AdmissionSettings,
  userId: string,
): boolean {
  return (
    isCardNewsEnabledForUser(settings, userId) &&
    isHttpsUrl(settings.endpoint) &&
    isHttpsUrl(settings.siteUrl) &&
    Boolean(settings.endpointAuth?.trim()) &&
    Boolean(settings.webhookSecret?.trim())
  );
}
