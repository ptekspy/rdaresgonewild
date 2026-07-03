# Paid Politely Admin

Private local owner dashboard for content ingestion, source subreddit mapping, and ad management.

## Run locally

```bash
pnpm db:generate
pnpm dev:admin
```

The admin app runs at:

```text
http://localhost:6790
```

Public admin access should be served through Cloudflare Tunnel at:

```text
https://admin.paidpolitely.com
```

## Cloudflare Tunnel

Create a named tunnel and route `admin.paidpolitely.com` to the local admin app:

```bash
cloudflared tunnel create paidpolitely-admin
cloudflared tunnel route dns paidpolitely-admin admin.paidpolitely.com
cloudflared tunnel run --url http://localhost:6790 paidpolitely-admin
```

For a persistent config, use a `cloudflared` config like:

```yaml
tunnel: paidpolitely-admin
credentials-file: /path/to/paidpolitely-admin.json

ingress:
  - hostname: admin.paidpolitely.com
    service: http://localhost:6790
  - service: http_status:404
```

Then start:

```bash
pnpm tunnel:admin
```
