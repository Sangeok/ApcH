import { readFile } from "node:fs/promises";

const args = process.argv.slice(2);
const index = args.indexOf("--receipt-path");
if (
  index < 0 ||
  !args[index + 1] ||
  args.some(
    (arg, position) =>
      arg !== "--apply" && position !== index && position !== index + 1,
  )
)
  throw new Error(
    "Usage: --receipt-path <independently-verified.json> [--apply]",
  );
if (!process.env.DATABASE_URL)
  throw new Error(
    "Set deployment DATABASE_URL in this process; this command never loads .env files",
  );
const raw = await readFile(args[index + 1]!, "utf8");
const { recordLegacyProducerDrain } = await import(
  "../src/fsd/features/upload/server"
);
const { db } = await import("@repo/db");
try {
  console.log(
    JSON.stringify(
      await recordLegacyProducerDrain(raw, { apply: args.includes("--apply") }),
    ),
  );
} finally {
  await db.$disconnect();
}
