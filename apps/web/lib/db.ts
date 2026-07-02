import { cache } from "react";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { PrismaNeonHTTP } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";

function getDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  try {
    const { env } = getCloudflareContext();
    const cloudflareEnv = env as Record<string, unknown>;
    return typeof cloudflareEnv.DATABASE_URL === "string" ? cloudflareEnv.DATABASE_URL : undefined;
  } catch {
    return undefined;
  }
}

export const getDb = cache(() => {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for the web app");
  }

  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    adapter: new PrismaNeonHTTP(databaseUrl, {}),
  });
});
