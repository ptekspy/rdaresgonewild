import { prisma } from "@rdgw/database";
import { RedditClient } from "../reddit.js";
import { scanSubreddit } from "../scanner.js";
import { getCrawlerRpm, loadEnvFiles } from "./env.js";

loadEnvFiles();

async function main() {
  const client = new RedditClient(process.env.REDDIT_COOKIE ?? "", getCrawlerRpm());
  await scanSubreddit(client);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
