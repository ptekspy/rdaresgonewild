import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@rdgw/database";
import type { RedditPost } from "./reddit.js";
import { processPost } from "./detector.js";

export interface HtmlImportResult {
  postsParsed: number;
  postsProcessed: number;
  completionsFound: number;
}

type AttributeMap = Record<string, string>;

const POST_BLOCK_PATTERN = /<shreddit-post(?=[\s>])([^>]*)>([\s\S]*?)<\/shreddit-post>/g;
const FLAIR_BLOCK_PATTERN =
  /<shreddit-post-flair(?=[\s>])([^>]*)>([\s\S]*?)<\/shreddit-post-flair>/g;

export function parseDaresGoneWildHtml(html: string): RedditPost[] {
  const flairsByPostId = parseFlairs(html);
  const posts = new Map<string, RedditPost>();

  for (const match of html.matchAll(POST_BLOCK_PATTERN)) {
    const attrs = parseAttributes(match[1] ?? "");
    const innerHtml = match[2] ?? "";
    const post = postFromAttributes(attrs, innerHtml, flairsByPostId);

    if (post) {
      posts.set(post.name, post);
    }
  }

  return [...posts.values()];
}

export async function importHtmlFile(filePath: string): Promise<HtmlImportResult> {
  const html = await fs.readFile(filePath, "utf8");
  const posts = parseDaresGoneWildHtml(html);
  const target = path.basename(filePath);

  const crawlRun = await prisma.crawlRun.create({
    data: {
      type: "html_import",
      target,
      pagesScanned: 1,
      postsFound: posts.length,
    },
  });

  let postsProcessed = 0;
  let completionsFound = 0;

  try {
    for (const post of posts) {
      completionsFound += await processPost(post, prisma, crawlRun.id);
      postsProcessed++;
    }

    await prisma.crawlRun.update({
      where: { id: crawlRun.id },
      data: {
        status: "completed",
        completedAt: new Date(),
        postsFound: postsProcessed,
        completionsDetected: completionsFound,
      },
    });

    return {
      postsParsed: posts.length,
      postsProcessed,
      completionsFound,
    };
  } catch (err) {
    await prisma.crawlRun.update({
      where: { id: crawlRun.id },
      data: { status: "failed", completedAt: new Date(), error: String(err) },
    });
    throw err;
  }
}

function postFromAttributes(
  attrs: AttributeMap,
  innerHtml: string,
  flairsByPostId: Map<string, string>
): RedditPost | null {
  const name = attrs.id;
  const author = attrs.author;
  const title = attrs["post-title"];
  const permalink = attrs.permalink;

  if (!name?.startsWith("t3_") || !author || !title || !permalink) {
    return null;
  }

  const createdUtc = parseCreatedUtc(attrs["created-timestamp"]);
  if (!createdUtc) return null;

  return {
    id: name.slice(3),
    name,
    title,
    selftext: extractSelftext(innerHtml),
    author,
    link_flair_text: flairsByPostId.get(name) ?? null,
    score: parseInteger(attrs.score),
    upvote_ratio: parseFloatNumber(attrs["upvote-ratio"]),
    num_comments: parseInteger(attrs["comment-count"]),
    permalink: absolutizeRedditUrl(permalink),
    created_utc: createdUtc,
  };
}

function parseFlairs(html: string) {
  const flairs = new Map<string, string>();

  for (const match of html.matchAll(FLAIR_BLOCK_PATTERN)) {
    const attrs = parseAttributes(match[1] ?? "");
    const postId = attrs["post-id"];
    if (!postId) continue;

    const innerHtml = match[2] ?? "";
    const ariaLabel = innerHtml.match(/\baria-label\s*=\s*"Flair:\s*([^"]+)"/i)?.[1];
    const flair = normaliseWhitespace(decodeHtml(ariaLabel ?? textContent(innerHtml)));

    if (flair) {
      flairs.set(postId, flair);
    }
  }

  return flairs;
}

function parseAttributes(source: string): AttributeMap {
  const attrs: AttributeMap = {};
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

  for (const match of source.matchAll(pattern)) {
    const key = match[1];
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    attrs[key] = decodeHtml(value);
  }

  return attrs;
}

function extractSelftext(innerHtml: string) {
  const articleBody =
    innerHtml.match(/<div[^>]*\bproperty\s*=\s*"schema:articleBody"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ??
    "";

  return textContent(articleBody);
}

function textContent(html: string) {
  return normaliseWhitespace(
    decodeHtml(
      html
        .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
    )
  );
}

function decodeHtml(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16))
    )
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)));
}

function normaliseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseCreatedUtc(value?: string) {
  if (!value) return 0;

  const normalised = value
    .replace(/\.(\d{3})\d+/, ".$1")
    .replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const timestamp = Date.parse(normalised);

  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : 0;
}

function parseInteger(value?: string) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseFloatNumber(value?: string) {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function absolutizeRedditUrl(value: string) {
  return value.startsWith("http") ? value : `https://www.reddit.com${value}`;
}
