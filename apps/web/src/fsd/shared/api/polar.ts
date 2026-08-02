import { Polar } from "@polar-sh/sdk";
import { env } from "~/env";

let polarInstance: Polar | null = null;

const polarServer = env.POLAR_SERVER ?? "sandbox";

export function getPolarClient(): Polar {
  polarInstance ??= new Polar({
    accessToken: env.POLAR_ACCESS_TOKEN,
    server: polarServer,
  });
  return polarInstance;
}
