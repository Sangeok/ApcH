import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../generated/prisma";

// env 검증 책임은 앱에 있다(설계 문서 결정 8). 여기서 다시 검증하면
// 스키마가 세 곳으로 갈라지고, 각 앱 next.config.js가 트리거하는
// 빌드 타임 검증이 이미 누락을 잡는다.
const createPrismaClient = () => {
  const adapter = new PrismaNeon({
    connectionString: process.env.DATABASE_URL!,
  });
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
};

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
