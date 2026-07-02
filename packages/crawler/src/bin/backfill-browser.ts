import { prisma } from "@rdgw/database";
import { BrowserRedditClient } from "../browser-reddit.js";
import { backfillSubredditNew } from "../scanner.js";
import { getCrawlerRpm, loadEnvFiles } from "./env.js";

loadEnvFiles();

async function main() {
  const client = BrowserRedditClient.fromEnv(getCrawlerRpm());
  try {
    await backfillSubredditNew(client);
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
