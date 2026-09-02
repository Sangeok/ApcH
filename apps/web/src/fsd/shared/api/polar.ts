import { Polar } from "@polar-sh/sdk";
import { env } from "~/env";

let polarInstance: Polar | null = null;

/**
 * Polar 환경의 단일 결정 지점. 체크아웃·고객 포털·SDK 클라이언트가 모두 이 값을 쓴다.
 * (features/billing/config는 클라이언트 번들에 실리므로 이 모듈 대신 ~/env를 직접 읽는다.)
 */
export const POLAR_SERVER = env.POLAR_SERVER ?? "sandbox";

export function getPolarClient(): Polar {
  polarInstance ??= new Polar({
    accessToken: env.POLAR_ACCESS_TOKEN,
    server: POLAR_SERVER,
  });
  return polarInstance;
}
