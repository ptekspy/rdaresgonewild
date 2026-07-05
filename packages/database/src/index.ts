import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

function loadPackageEnv() {
  if (process.env.DATABASE_URL) return;

  try {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const envFile = path.resolve(__dirname, "../.env");
    if (!fs.existsSync(envFile)) return;

    for (const rawLine of fs.readFileSync(envFile, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      const equalsIndex = line.indexOf("=");
      if (equalsIndex === -1) continue;

      const key = line.slice(0, equalsIndex).trim();
      if (process.env[key]) continue;

      process.env[key] = line
        .slice(equalsIndex + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "");
    }
  } catch {
    // Cloudflare provides env vars at runtime and does not need package .env loading.
  }
}

loadPackageEnv();

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function prismaOptions() {
  const options: ConstructorParameters<typeof PrismaClient>[0] = {
    log: process.env.PRISMA_LOG_QUERIES === "true" ? ["query", "error", "warn"] : ["error", "warn"],
  };

  if (process.env.DATABASE_DRIVER === "neon") {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is required when DATABASE_DRIVER=neon");
    }
    return {
      ...options,
      adapter: new PrismaNeon({ connectionString }),
    };
  }

  return options;
}

export function createNeonPrismaClient(connectionString: string) {
  return new PrismaClient({
    log: process.env.PRISMA_LOG_QUERIES === "true" ? ["query", "error", "warn"] : ["error", "warn"],
    adapter: new PrismaNeon({ connectionString }),
  });
}

export function createPrismaClient() {
  return new PrismaClient(prismaOptions());
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export * from "@prisma/client";
