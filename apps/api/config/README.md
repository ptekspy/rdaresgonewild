# Extension crawl targets

Edit `extension-crawl-targets.json` to change the Chrome extension crawl plan.

- `coreSubreddits` is the main editable list of 10 subreddits.
- `coreSorts` should usually stay as `["best", "new"]`.
- `homeSorts` controls Reddit home `/best/` and `/new/` tasks.
- `includeDbSubreddits` lets the scheduler add lower-priority `SiteSubreddit` rows already stored in the database.
- `intervalMinutes` controls when a completed task becomes due again.
- `maxPages` controls how many JSON listing pages the extension fetches per task.
