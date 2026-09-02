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

/**
 * 인자 없는 `get*`이었을 때는 이름과 달리 localStorage에 영구 추적 식별자를
 * **생성·저장**했다. 프라이버시 관련 쓰기는 이름에 드러나야 한다.
 * 순수 읽기가 필요해지면 쓰지 않고 null을 돌려주는 peek*를 따로 만든다.
 */
export function getOrCreateAnalyticsIds() {
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
