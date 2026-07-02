import { prisma } from "@rdgw/database";
import path from "node:path";
import { importHtmlFile } from "../html-importer.js";
import { loadEnvFiles } from "./env.js";

loadEnvFiles();

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    throw new Error("Usage: pnpm --filter @rdgw/crawler scan:html <path-to-html>");
  }

  const resolvedPath = path.resolve(process.env.INIT_CWD ?? process.cwd(), filePath);
  const result = await importHtmlFile(resolvedPath);
  console.log(
    `[html-import] parsed ${result.postsParsed} posts, processed ${result.postsProcessed}, found ${result.completionsFound} completions`
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
