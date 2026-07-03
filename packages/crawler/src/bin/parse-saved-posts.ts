import { prisma } from "@rdgw/database";
import { parseSavedPosts } from "../saved-post-parser.js";
import { loadEnvFiles } from "./env.js";

loadEnvFiles();

function getLimit() {
  const value = Number.parseInt(process.env.PARSER_POST_LIMIT ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

async function main() {
  const subreddit = process.env.PARSER_SUBREDDIT ?? "daresgonewild";
  const source = process.env.PARSER_SOURCE || undefined;
  const limit = getLimit();

  const result = await parseSavedPosts({ subreddit, source, limit });
  console.log(
    `[parser] checked ${result.postsChecked} saved posts; found ${result.completionsFound} dares ` +
      `(${result.playbookCompletionsFound} playbook, ${result.communityCompletionsFound} community); ` +
      `created ${result.completionsCreated} new ` +
      `(${result.playbookCompletionsCreated} playbook, ${result.communityCompletionsCreated} community)`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
