import { PrismaClient } from "@/app/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";

// In development, Next.js hot-reloads modules on every file save.
// Without this pattern, each reload would create a new PrismaClient and
// a new database connection — eventually exhausting the connection pool.
//
// The fix: store the client on `globalThis`, which survives hot-reloads.
// In production there is no hot-reloading, so we just create it once normally.

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
