import { prisma } from "@rdgw/database";

if (process.env.PURGE_PAIDPOLITELY_DB !== "YES") {
  throw new Error("Refusing to purge. Set PURGE_PAIDPOLITELY_DB=YES to continue.");
}

async function main() {
  console.log("Purging PaidPolitely posts, completions, subreddit records, crawl cursors/runs, and extension jobs...");

  const result = await prisma.$transaction(async (tx) => {
    const community = await tx.communityCompletion.deleteMany({});
    const playbook = await tx.playbookCompletion.deleteMany({});
    const posts = await tx.dgwPost.deleteMany({});
    const siteSubreddits = await tx.siteSubreddit.deleteMany({});
    const browserJobs = await tx.browserCrawlJob.deleteMany({ where: { type: { startsWith: "extension_" } } });
    const crawlRuns = await tx.crawlRun.deleteMany({ where: { type: { startsWith: "extension_" } } });
    const cursors = await tx.crawlCursor.deleteMany({});
    const users = await tx.dgwUser.updateMany({ data: { postCount: 0, syncStatus: "never", lastSyncedAt: null, lastSyncCursor: null } });

    return { community, playbook, posts, siteSubreddits, browserJobs, crawlRuns, cursors, users };
  });

  console.log(JSON.stringify({
    communityCompletionsDeleted: result.community.count,
    playbookCompletionsDeleted: result.playbook.count,
    postsDeleted: result.posts.count,
    siteSubredditsDeleted: result.siteSubreddits.count,
    extensionJobsDeleted: result.browserJobs.count,
    extensionCrawlRunsDeleted: result.crawlRuns.count,
    crawlCursorsDeleted: result.cursors.count,
    usersReset: result.users.count,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
