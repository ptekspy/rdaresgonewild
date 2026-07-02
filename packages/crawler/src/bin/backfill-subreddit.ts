import { prisma } from "@rdgw/database";
import { RedditClient } from "../reddit.js";
import { backfillSubredditNew } from "../scanner.js";
import { getCrawlerRpm, loadEnvFiles } from "./env.js";

loadEnvFiles();

async function main() {
  const client = RedditClient.fromEnv(getCrawlerRpm());
  await backfillSubredditNew(client);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
