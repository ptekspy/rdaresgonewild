import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const schedulerPath = path.join(repoRoot, 'apps/api/lib/extension-scheduler.ts');

let source = fs.readFileSync(schedulerPath, 'utf8');

function replaceOnce(label, find, replacement) {
  if (!source.includes(find)) {
    throw new Error(`Could not find ${label}`);
  }
  source = source.replace(find, replacement);
}

function replaceRegex(label, regex, replacement) {
  if (!regex.test(source)) {
    throw new Error(`Could not find ${label}`);
  }
  source = source.replace(regex, replacement);
}

if (!source.includes('forceBatchId?: string;')) {
  replaceOnce(
    'ExtensionJobState force fields',
    '  reachedKnown?: boolean;\n}',
    '  reachedKnown?: boolean;\n  forceBatchId?: string;\n  forceOrder?: number;\n  forceLabel?: string;\n}',
  );
}

if (!source.includes('forceBatchId: typeof value.forceBatchId === "string" ? value.forceBatchId : undefined')) {
  replaceOnce(
    'getExtensionState force fields',
    '      reachedKnown: Boolean(value.reachedKnown),\n    };',
    '      reachedKnown: Boolean(value.reachedKnown),\n      forceBatchId: typeof value.forceBatchId === "string" ? value.forceBatchId : undefined,\n      forceOrder: asNonNegativeInteger(value.forceOrder, -1) >= 0 ? asNonNegativeInteger(value.forceOrder, 0) : undefined,\n      forceLabel: typeof value.forceLabel === "string" ? value.forceLabel : undefined,\n    };',
  );
}

if (!source.includes('forceBatchId: state.forceBatchId,')) {
  replaceOnce(
    'resetRunState force fields',
    '    stopAtKnown: state.stopAtKnown,\n  };',
    '    stopAtKnown: state.stopAtKnown,\n    forceBatchId: state.forceBatchId,\n    forceOrder: state.forceOrder,\n    forceLabel: state.forceLabel,\n  };',
  );
}

replaceRegex(
  'queueCoreBootstrapJobs',
  /async function queueCoreBootstrapJobs\(\) \{[\s\S]*?\n\}\n\nasync function forceQueueExtensionJob/m,
  `async function queueCoreBootstrapJobs() {
  const config = loadExtensionTargetsConfig();
  const now = new Date();
  const forceBatchId = \`core-bootstrap:\${now.toISOString()}\`;
  const definitions = buildCoreBootstrapDefinitions(config);

  for (const [index, definition] of definitions.entries()) {
    await forceQueueExtensionJob(definition, now, forceBatchId, index);
  }
}

function buildCoreBootstrapDefinitions(config: ExtensionTargetsConfig) {
  const definitions: ExtensionJobDefinition[] = [];
  const forcedSorts: ExtensionSort[] = ["best", "new"];
  const enabledHomeSorts = new Set(config.homeSorts);
  const enabledCoreSorts = new Set(config.coreSorts);

  // Exact forced order: home best, home new, then each configured core subreddit best/new.
  for (const sort of forcedSorts) {
    if (enabledHomeSorts.has(sort)) definitions.push(buildHomeJob(sort, config));
  }

  for (const subreddit of uniqueSubreddits(config.coreSubreddits)) {
    for (const sort of forcedSorts) {
      if (enabledCoreSorts.has(sort)) definitions.push(buildSubredditJob(subreddit, sort, true, config));
    }
  }

  return definitions;
}

async function forceQueueExtensionJob`,
);

replaceRegex(
  'forceQueueExtensionJob',
  /async function forceQueueExtensionJob\([\s\S]*?\n\}\nasync function recoverExpiredExtensionJobs/m,
  `async function forceQueueExtensionJob(definition: ExtensionJobDefinition, batchStart: Date, forceBatchId: string, forceOrder: number) {
  const scheduledFor = new Date(batchStart.getTime() + forceOrder * 1000);
  const forcedPriority = 100_000 - forceOrder;
  const state: ExtensionJobState = {
    ...definition.state,
    forceBatchId,
    forceOrder,
    forceLabel: "home-best-home-new-core-subreddits",
  };

  await prisma.browserCrawlJob.upsert({
    where: { dedupeKey: definition.dedupeKey },
    create: {
      dedupeKey: definition.dedupeKey,
      type: definition.type,
      target: definition.target,
      url: definition.url,
      status: "queued",
      priority: forcedPriority,
      scheduledFor,
      startedAt: null,
      completedAt: null,
      leaseUntil: null,
      lastError: null,
      state,
    },
    update: {
      type: definition.type,
      target: definition.target,
      url: definition.url,
      status: "queued",
      priority: forcedPriority,
      scheduledFor,
      startedAt: null,
      completedAt: null,
      leaseUntil: null,
      lastError: null,
      state,
    },
  });
}

async function recoverExpiredExtensionJobs`,
);

replaceRegex(
  'ensureRecurringExtensionJob',
  /async function ensureRecurringExtensionJob\(definition: ExtensionJobDefinition\) \{[\s\S]*?\n\}\n\nasync function queueFallbackUserJobs/m,
  `async function ensureRecurringExtensionJob(definition: ExtensionJobDefinition) {
  const now = new Date();
  const existing = await prisma.browserCrawlJob.findUnique({ where: { dedupeKey: definition.dedupeKey } });

  if (!existing) {
    await prisma.browserCrawlJob.create({
      data: {
        dedupeKey: definition.dedupeKey,
        type: definition.type,
        target: definition.target,
        url: definition.url,
        status: "queued",
        priority: definition.priority,
        scheduledFor: definition.scheduledFor ?? now,
        state: definition.state,
      },
    });
    return;
  }

  const existingState = getExtensionState(existing);
  const hasActiveForcedBatch = Boolean(
    existingState.forceBatchId &&
      ["queued", "running"].includes(existing.status) &&
      existing.priority >= 90_000,
  );

  if (hasActiveForcedBatch) {
    await prisma.browserCrawlJob.update({
      where: { id: existing.id },
      data: {
        type: definition.type,
        target: definition.target,
        url: definition.url,
        state: {
          ...definition.state,
          forceBatchId: existingState.forceBatchId,
          forceOrder: existingState.forceOrder,
          forceLabel: existingState.forceLabel,
        },
      },
    });
    return;
  }

  const shouldRequeue = ["completed", "failed"].includes(existing.status) && existing.scheduledFor <= now;

  await prisma.browserCrawlJob.update({
    where: { id: existing.id },
    data: {
      type: definition.type,
      target: definition.target,
      url: definition.url,
      priority: definition.priority,
      ...(shouldRequeue
        ? {
            status: "queued",
            scheduledFor: definition.scheduledFor ?? now,
            startedAt: null,
            completedAt: null,
            leaseUntil: null,
            lastError: null,
            state: definition.state,
          }
        : { state: mergeStableState(getExtensionState(existing), definition.state) }),
    },
  });
}

async function queueFallbackUserJobs`,
);

fs.writeFileSync(schedulerPath, source);
console.log('Patched apps/api/lib/extension-scheduler.ts for forced main queue ordering.');
