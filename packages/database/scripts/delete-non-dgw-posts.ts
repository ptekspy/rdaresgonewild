import { prisma } from "@rdgw/database";

const TARGET_SUBREDDIT = "daresgonewild";
const args = new Set(process.argv.slice(2));
const confirmed = args.has("--confirm");

async function main() {
  console.log(`Target subreddit to KEEP: r/${TARGET_SUBREDDIT}`);
  console.log(confirmed ? "Mode: DELETE" : "Mode: DRY RUN");

  const grouped = await prisma.dgwPost.groupBy({
    by: ["subreddit"],
    _count: {
      _all: true,
    },
    orderBy: {
      _count: {
        subreddit: "desc",
      },
    },
  });

  console.log("\nCurrent posts by subreddit:");
  for (const row of grouped) {
    console.log(`${row.subreddit || "(blank)"}: ${row._count._all}`);
  }

  const [{ count }] = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM "DgwPost"
  `;

  const deleteCount = Number(count);

  console.log(`\nPosts that would be deleted: ${deleteCount}`);

  if (!confirmed) {
    console.log("\nDry run only. To actually delete them, run again with --confirm.");
    return;
  }

  if (deleteCount === 0) {
    console.log("\nNothing to delete.");
    return;
  }

  console.log("\nDeleting non-r/daresgonewild posts...");

  const deleted = await prisma.$executeRaw`
    DELETE FROM "DgwPost"
  `;

  console.log(`Deleted posts: ${deleted}`);

  const remaining = await prisma.dgwPost.count();
  console.log(`Remaining posts: ${remaining}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });