"use client";

const ANONYMOUS_ID_KEY = "apc_analytics_anonymous_id";
const SESSION_ID_KEY = "apc_analytics_session_id";

function createId(prefix: string) {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `${prefix}_${random}`;
}

function readOrCreateStorageValue(
  storage: Storage,
  key: string,
  prefix: string,
) {
  const existingValue = storage.getItem(key);

  if (existingValue) {
    return existingValue;
  }

  const nextValue = createId(prefix);
  storage.setItem(key, nextValue);
  return nextValue;
}

export function getAnalyticsIds() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return {
      anonymousId: readOrCreateStorageValue(
        window.localStorage,
        ANONYMOUS_ID_KEY,
        "anon",
      ),
      sessionId: readOrCreateStorageValue(
        window.sessionStorage,
        SESSION_ID_KEY,
        "session",
      ),
    };
  } catch {
    return null;
  }
}
