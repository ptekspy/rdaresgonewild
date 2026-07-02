# Security, Privacy, and Adult-Site Rules

This project serves ads on NSFW/adult-adjacent sites. Be stricter than a normal hobby project.

## MVP privacy stance

Avoid building surveillance ad tech.

Do:

- count impressions
- count clicks
- aggregate by day/campaign/placement
- optionally hash user agent/IP with a private salt for rough dedupe

Do not:

- store raw IP addresses
- use third-party tracking pixels
- use advertiser JavaScript
- set cross-site tracking cookies
- fingerprint users
- create user profiles across sites

## IP/user-agent hashing

If implemented, use:

```txt
hash = sha256(ADS_HASH_SALT + rawValue)
```

Never expose `ADS_HASH_SALT` to the client.

For MVP, it is acceptable to skip IP hashing completely.

## Token signing

Use HMAC SHA-256 signed tokens for:

- impression tokens
- click tokens

Env:

```txt
ADS_TOKEN_SECRET=long-random-secret
```

Token payload should include:

```ts
type AdTokenPayload = {
  kind: "impression" | "click";
  requestId: string;
  bookingId: string;
  creativeId: string;
  placementId: string;
  siteId: string;
  issuedAt: number;
  expiresAt: number;
};
```

## Redirect safety

Only redirect to target URLs stored in the database.

Reject:

- `javascript:`
- `data:`
- `file:`
- `http:` for MVP
- malformed URLs

Allow:

- `https://...`

## Creative rules

Reject ads containing or promoting:

- underage-coded language or imagery
- non-consensual framing
- blackmail/coercion language
- illegal public sexual activity instructions
- malware/download tricks
- misleading “official Reddit” claims
- auto-playing explicit video
- raw advertiser JS
- hidden tracking pixels

## Sponsored labels

Every rendered ad must clearly show one of:

```txt
Sponsored
Ad
```

Use paid-link rel attributes:

```tsx
rel="sponsored nofollow noopener noreferrer"
```

## Admin auth

MVP:

- `ADMIN_SECRET`
- signed HTTP-only cookie
- short-ish session lifetime
- logout button

Later:

- proper auth provider
- roles
- audit log

## Audit log

Add after MVP if time allows.

Suggested model:

```prisma
model AdminAuditLog {
  id        String   @id @default(cuid())
  actor     String
  action    String
  entity    String
  entityId  String?
  before    Json?
  after     Json?
  createdAt DateTime @default(now())
}
```

## GDPR/PECR stance

Because the MVP avoids cookies, local storage, third-party pixels, and behavioural tracking, reporting can remain simple. If later adding cookies, local storage, retargeting, or advertiser tracking pixels, add a proper consent flow before enabling those features.
