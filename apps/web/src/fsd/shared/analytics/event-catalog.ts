export { ANALYTICS_EVENT_NAMES } from "@repo/db";
export type { AnalyticsEventName } from "@repo/db";

// 이 상수는 recordAnalyticsEvent만 쓰는 web 전용이라 @repo/db로 옮기지 않았다.
export { ANALYTICS_METADATA_KEYS_BY_EVENT } from "./lib/metadata";
