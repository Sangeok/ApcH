import { Polar } from "@polar-sh/sdk";
import { env } from "~/env";

let polarInstance: Polar | null = null;

export function getPolarClient(): Polar {
  polarInstance ??= new Polar({
    accessToken: env.POLAR_ACCESS_TOKEN,
    server: "sandbox",
  });
  return polarInstance;
}
