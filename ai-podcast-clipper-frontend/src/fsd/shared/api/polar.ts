import { Polar } from "@polar-sh/sdk";
import { env } from "~/env";

let polarInstance: Polar | null = null;

function getPolarServer(): "sandbox" | "production" {
  if (env.POLAR_SERVER) return env.POLAR_SERVER;
  return env.NODE_ENV === "production" ? "production" : "sandbox";
}

export function getPolarClient(): Polar {
  polarInstance ??= new Polar({
    accessToken: env.POLAR_ACCESS_TOKEN,
    server: getPolarServer(),
  });
  return polarInstance;
}
