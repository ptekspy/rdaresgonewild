# Target File Tree

This is a target structure, not a strict requirement to create in one PR.

```txt
.
├── apps
│   ├── web                         # existing; optionally rename to rdaresgonewild later
│   ├── rdaresgonewild              # target name for existing site
│   └── adserver
│       ├── app
│       │   ├── api
│       │   │   └── v1
│       │   │       ├── ad
│       │   │       │   └── route.ts
│       │   │       ├── impression
│       │   │       │   └── route.ts
│       │   │       └── click
│       │   │           └── [token]
│       │   │               └── route.ts
│       │   └── admin
│       │       ├── page.tsx
│       │       ├── login
│       │       │   └── page.tsx
│       │       ├── sites
│       │       │   └── page.tsx
│       │       ├── placements
│       │       │   └── page.tsx
│       │       ├── advertisers
│       │       │   └── page.tsx
│       │       ├── campaigns
│       │       │   └── page.tsx
│       │       ├── creatives
│       │       │   └── page.tsx
│       │       ├── bookings
│       │       │   └── page.tsx
│       │       └── reports
│       │           └── page.tsx
│       ├── lib
│       │   ├── ads
│       │   │   ├── select-ad.ts
│       │   │   ├── tokens.ts
│       │   │   ├── tracking.ts
│       │   │   └── validation.ts
│       │   └── admin
│       │       └── auth.ts
│       ├── package.json
│       ├── next.config.ts
│       └── tsconfig.json
├── packages
│   ├── database
│   │   ├── prisma
│   │   │   ├── schema.prisma
│   │   │   └── seed.ts
│   │   └── src
│   ├── ads-sdk
│   │   ├── src
│   │   │   ├── react
│   │   │   │   ├── AdSlot.tsx
│   │   │   │   └── index.ts
│   │   │   ├── client.ts
│   │   │   ├── types.ts
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── shared
│   ├── ui
│   └── config
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```
