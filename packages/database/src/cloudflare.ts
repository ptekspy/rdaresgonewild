import { PrismaNeonHTTP } from "@prisma/adapter-neon";
import { PrismaClient } from "./generated/cloudflare/client";

export function createCloudflarePrismaClient(connectionString: string) {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    adapter: new PrismaNeonHTTP(connectionString, {}),
  });
}

export * from "./generated/cloudflare/client";
