import { PrismaClient } from "@prisma/client";
import { PrismaNeonHTTP } from "@prisma/adapter-neon";

export function createCloudflarePrismaClient(connectionString: string) {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    adapter: new PrismaNeonHTTP(connectionString, {}),
  });
}

export * from "@prisma/client";
