import { prisma } from "@rdgw/database";
import { queueSubredditHistoryBackfill, type SubredditTopTimeWindow } from "../browser-crawl-jobs.js";
import { loadEnvFiles } from "./env.js";

loadEnvFiles();

type BackfillSort = "new" | "best" | "hot" | `top_${SubredditTopTimeWindow}`;

const VALID_SORTS = new Set<BackfillSort>([
  "new",
  "best",
  "hot",
  "top_day",
  "top_week",
  "top_month",
  "top_year",
  "top_all",
]);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const queued = await queueSubredditHistoryBackfill(args);

  console.log(
    `[crawler-backfill] queued ${queued.length} historical subreddit jobs` +
      (args.subreddits?.length ? ` for ${args.subreddits.join(",")}` : ""),
  );

  for (const job of queued) {
    console.log(`[crawler-backfill] ${job.type}:${job.target} -> ${job.url}`);
  }
}

function parseArgs(args: string[]) {
  const subreddits = readListArg(args, "--subreddits");
  const sorts = readListArg(args, "--sorts")
    ?.map((sort) => normaliseSort(sort))
    .filter((sort): sort is BackfillSort => Boolean(sort));

  return {
    subreddits,
    sorts,
  };
}

function readListArg(args: string[], name: string) {
  const prefix = `${name}=`;
  const value = args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (!value) return undefined;

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normaliseSort(sort: string) {
  const normalised = sort.trim().toLowerCase().replace(/^top:/, "top_");
  if (VALID_SORTS.has(normalised as BackfillSort)) return normalised as BackfillSort;

  console.warn(`[crawler-backfill] ignoring unsupported sort "${sort}"`);
  return null;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
