import { prisma } from "@rdgw/database";
import { BrowserRedditClient } from "../browser-reddit.js";
import { syncUser, type SyncMode } from "../user-syncer.js";
import { getCrawlerRpm, loadEnvFiles } from "./env.js";

loadEnvFiles();

function usage() {
  console.error("Usage: pnpm --filter @rdgw/crawler scan:user:browser -- <username> [full|incremental|auto]");
}

async function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  const username = args[0]?.replace(/^\/?u\//i, "").trim();
  const mode = (args[1] ?? "auto") as SyncMode;

  if (!username || !/^[A-Za-z0-9_-]{3,20}$/.test(username)) {
    usage();
    process.exitCode = 1;
    return;
  }

  if (!["full", "incremental", "auto"].includes(mode)) {
    usage();
    process.exitCode = 1;
    return;
  }

  const client = BrowserRedditClient.fromEnv(getCrawlerRpm());
  try {
    await syncUser(username, client, mode);
  } finally {
    await client.close();
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
