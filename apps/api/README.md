# Paid Politely API

Local development API for Chrome extension ingestion and shared site feeds.

## Run locally

```bash
pnpm db:generate
pnpm db:push
pnpm dev:api
```

The API runs at:

```text
http://localhost:8787
```

## Main endpoints

```text
GET  /api/health
POST /api/v1/extension/sessions
POST /api/v1/extension/posts/batch
GET  /api/v1/sites/:siteKey/posts
```

Known site keys currently map as:

```text
rdaresgonewild -> r/daresgonewild
rflashingandflaunting -> r/FlashingAndFlaunting
rrealpublicnudity -> r/RealPublicNudity
rexhibitionistgirl -> r/ExhibitionistGirl
rchanginginpublic -> r/ChanginginPublic
rcmnf -> r/CMNF
ronlyonenaked -> r/onlyonenaked
routdoorgirls -> r/outdoorgirls
rpermanentnude -> r/Permanent_Nude
rbralessforever -> r/BralessForever
```

You can override or extend those defaults with rows in `SiteSubreddit`.

## Cloudflare Tunnel

Create a named tunnel and route `api.paidpolitely.com` to the local API:

```bash
cloudflared tunnel create paidpolitely-api
cloudflared tunnel route dns paidpolitely-api api.paidpolitely.com
cloudflared tunnel run --url http://localhost:8787 paidpolitely-api
```

For a persistent config, use a `cloudflared` config like:

```yaml
tunnel: paidpolitely-api
credentials-file: /path/to/paidpolitely-api.json

ingress:
  - hostname: api.paidpolitely.com
    service: http://localhost:8787
  - service: http_status:404
```

Then start:

```bash
cloudflared tunnel run paidpolitely-api
```
