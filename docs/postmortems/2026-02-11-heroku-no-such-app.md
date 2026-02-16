# Post-Mortem: "No such app" Errors on zen-journeys.com, grad-trip.com, broke-nomad.com

**Date:** 2026-02-11
**Affected Domains:** zen-journeys.com, grad-trip.com, broke-nomad.com (+ www variants)
**Impact:** All 6 domains returned Heroku "No such app" error pages despite completing the full provisioning pipeline
**Duration:** ~1 day (domains provisioned 2026-02-10, fixed 2026-02-11)

---

## Summary

Three newly provisioned domains returned Heroku's "No such app" error page. The root cause was **two separate bugs that compounded**:

1. **Wrong CNAME target:** DNS records pointed to the short Heroku hostname (`holibob-experiences-demand-gen.herokuapp.com`) which resolves to **US ingress**, but the app runs in **EU**. The Heroku US router has no knowledge of EU apps, so it returns "No such app."

2. **Missing SNI endpoint:** The Heroku API silently requires an `sni_endpoint` parameter when adding domains to an app that already has SNI endpoints. Without it, the API returned a 422 error that was being swallowed by error handling. This meant the domains were never actually registered on Heroku.

---

## Architecture Context

Understanding how traffic flows is critical for debugging this type of issue:

```
User Request
    |
    v
Cloudflare DNS (proxied: true)
    |
    v
Cloudflare Edge (SSL termination, presents Cloudflare cert to user)
    |
    v (HTTPS to origin, SSL mode "Full" = doesn't verify origin cert)
    |
Heroku Router (matches Host header to routing table)
    |
    v
App Dyno (website-platform)
```

### Key components:

- **Cloudflare Proxy (orange cloud):** When `proxied: true`, DNS resolves to Cloudflare edge IPs. Cloudflare terminates SSL using its own universal certificate and forwards requests to the origin (Heroku).

- **Cloudflare SSL Mode "Full":** Cloudflare connects to origin over HTTPS but does **not** verify the origin certificate. This means the cert on Heroku doesn't need to match the domain — any valid TLS cert works.

- **Heroku SNI Endpoints:** Each custom domain on Heroku needs an SNI endpoint (SSL certificate + routing entry). Heroku's ACM (Automated Certificate Management) normally creates these automatically, but **Heroku explicitly recommends against using ACM with Cloudflare** ([docs](https://devcenter.heroku.com/articles/automated-certificate-management#view-your-certificate-status)).

- **Heroku Hostnames:**
  - **Short:** `holibob-experiences-demand-gen.herokuapp.com` → resolves to **US ingress** IPs
  - **Full (with hash):** `holibob-experiences-demand-gen-c27f61accbd2.herokuapp.com` → resolves to the app's **actual region** (EU)
  - The full hostname is shown in `heroku apps:info` under "Web URL"

---

## Root Cause 1: Wrong CNAME Target

### What happened

The code that creates Cloudflare DNS records used:

```typescript
const herokuHostname = process.env['HEROKU_APP_NAME']
  ? `${process.env['HEROKU_APP_NAME']}.herokuapp.com` // SHORT hostname
  : 'experience-marketplace.herokuapp.com';
```

This constructed `holibob-experiences-demand-gen.herokuapp.com` — the **short** hostname that resolves to US-region Heroku ingress. Since the app runs in the EU region, requests arriving at US ingress can't find the app.

### Why did the 15 working domains work?

The working domains were set up by a **different code path** (admin UI "Sync from Cloudflare" → domains/route.ts) that happened to have the full hostname as a hardcoded fallback. The key line in the admin route was:

```typescript
const herokuHostname = process.env['HEROKU_APP_NAME']
  ? `${process.env['HEROKU_APP_NAME']}.herokuapp.com`
  : 'holibob-experiences-demand-gen-c27f61accbd2.herokuapp.com'; // Full hostname fallback
```

But when `HEROKU_APP_NAME` is set (which it is in production), this code **also** uses the short hostname. The 15 working domains were likely set up before the environment variable was configured, or their DNS records were manually corrected.

### How to verify

Compare DNS targets between working and broken domains in Cloudflare:

```bash
# Check a working domain's DNS target
curl -s -H "Authorization: Bearer $CF_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  | jq '.result[] | {name, content}'

# Working: content = "holibob-experiences-demand-gen-c27f61accbd2.herokuapp.com"
# Broken:  content = "holibob-experiences-demand-gen.herokuapp.com"
```

You can also verify which hostname resolves to which region:

```bash
dig +short holibob-experiences-demand-gen.herokuapp.com
# Returns US IPs (54.x, 52.x, etc.)

dig +short holibob-experiences-demand-gen-c27f61accbd2.herokuapp.com
# Returns EU IPs or Global Accelerator IPs (99.83.x, 3.33.x)
```

### Fix

Added `HEROKU_HOSTNAME` environment variable set to the full hostname:

```bash
heroku config:set HEROKU_HOSTNAME=holibob-experiences-demand-gen-c27f61accbd2.herokuapp.com
```

Updated all code paths to prefer `HEROKU_HOSTNAME`:

```typescript
const herokuHostname =
  process.env['HEROKU_HOSTNAME'] ||
  (process.env['HEROKU_APP_NAME']
    ? `${process.env['HEROKU_APP_NAME']}.herokuapp.com`
    : 'experience-marketplace.herokuapp.com');
```

---

## Root Cause 2: Missing SNI Endpoint

### What happened

When adding a domain to Heroku via the Platform API, the request body needs to include an `sni_endpoint` parameter if the app already has any SNI endpoints. Without it, the API returns a 422 error:

```json
{ "id": "invalid_params", "message": "Require params: sni_endpoint" }
```

The original code sent just `{ hostname }` without `sni_endpoint`:

```typescript
body: JSON.stringify({ hostname });
```

When the first domains were added, the app had no SNI endpoints, so this worked. As domains accumulated and ACM issued certificates (creating SNI endpoints), Heroku started requiring the parameter. New domain additions silently failed with 422, which was caught by error handling that treated all 422s as "domain already exists" (a valid 422 message).

### The red herring: `sni_endpoint: null`

During initial debugging, we changed the code to `{ hostname, sni_endpoint: null }`. This was accepted by Heroku (201 Created), but `null` means "no endpoint" — the domain is registered in the routing table but has no SSL endpoint. This creates domains that:

- Have `sni_endpoint: null` in the API response
- Have `acm_status: failing` because ACM can't complete HTTP-01 challenges through Cloudflare proxy
- Return "No such app" because the Heroku router can't serve them without an endpoint

### The actual fix

Since we use Cloudflare for SSL (not Heroku ACM), domains can **share any existing SNI endpoint**. The cert doesn't need to match because Cloudflare SSL mode "Full" doesn't verify origin certs. The fix is to look up an existing endpoint and use its ID:

```typescript
// Find an existing SNI endpoint from another domain
const sniEndpointId = await this.getExistingSniEndpoint();

const body: Record<string, unknown> = { hostname };
if (sniEndpointId) {
  body['sni_endpoint'] = sniEndpointId;
}
```

### Why was Heroku ACM a dead end?

We spent significant time trying to get ACM to work. This was a red herring because:

1. **Heroku explicitly recommends against ACM with Cloudflare** — the HTTP-01 challenge can't complete through Cloudflare's proxy.
2. **ACM is unnecessary** — Cloudflare provides its own SSL certificates. The origin cert doesn't matter with SSL mode "Full".
3. **Disabling Cloudflare proxy** didn't help because the CNAME target was wrong (Root Cause 1), so even direct traffic went to the wrong Heroku region.

---

## Why This Was Hard to Debug

1. **Two independent bugs:** The CNAME target issue and the SNI endpoint issue both independently cause "No such app." Fixing one without the other still results in the same error, making it seem like neither fix works.

2. **Heroku's "No such app" is a catch-all error.** It's returned for:
   - Domain not registered
   - Domain registered but no SNI endpoint
   - Domain registered but request arrived at wrong region's ingress
   - ACM hasn't issued a cert yet

3. **The 15 working domains created a false sense of security.** The same code worked for them, so the code seemed correct. The failures were caused by:
   - Heroku API behavior changing after accumulating endpoints (422 on missing `sni_endpoint`)
   - The short hostname working sometimes (when requests happened to route correctly)

4. **ACM status was a convincing red herring.** The `acm_status: failing` with reason "CDN not returning HTTP challenge" perfectly explained the symptom. It led to extensive work on disabling Cloudflare proxy, setting SSL mode to "off", and waiting for ACM — none of which addressed the real issues.

5. **Multiple code paths.** Domain setup can happen through:
   - `domain.ts` (worker, Phase 3 DOMAIN_VERIFY)
   - `domains/route.ts` (admin API, Sync from Cloudflare)
   - `site.ts` (site deploy worker)

   Each had its own implementation with slightly different bugs.

---

## Debugging Checklist for Future Engineers

If a custom domain returns "No such app," check these in order:

### 1. Is the domain registered on Heroku?

```bash
heroku domains --app holibob-experiences-demand-gen | grep example.com
# Or via API:
curl -s -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.heroku+json; version=3" \
  "https://api.heroku.com/apps/holibob-experiences-demand-gen/domains/example.com"
```

If not registered, add it with an existing SNI endpoint:

```bash
# First, find an existing SNI endpoint ID from working domains
curl -s -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.heroku+json; version=3" \
  "https://api.heroku.com/apps/holibob-experiences-demand-gen/domains" \
  | jq '[.[] | select(.sni_endpoint != null) | .sni_endpoint] | first'

# Then add the domain with that endpoint
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.heroku+json; version=3" \
  -H "Content-Type: application/json" \
  "https://api.heroku.com/apps/holibob-experiences-demand-gen/domains" \
  -d '{"hostname": "example.com", "sni_endpoint": "<endpoint-id>"}'
```

### 2. Does the domain have an SNI endpoint?

```bash
curl -s ... | jq '.sni_endpoint'
# Should NOT be null. If null, delete and re-add with an existing endpoint ID.
```

### 3. Is the Cloudflare DNS pointing to the correct hostname?

```bash
# Check the DNS record target
curl -s -H "Authorization: Bearer $CF_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  | jq '.result[] | select(.name == "example.com") | .content'

# CORRECT: holibob-experiences-demand-gen-c27f61accbd2.herokuapp.com
# WRONG:   holibob-experiences-demand-gen.herokuapp.com
```

### 4. Is Cloudflare proxy enabled?

```bash
# Check proxied status
curl -s ... | jq '.result[] | {name, proxied}'
# Should be proxied: true for all records
```

### 5. Is SSL mode set to "full"?

```bash
curl -s -H "Authorization: Bearer $CF_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/settings/ssl" \
  | jq '.result.value'
# Should be "full"
```

---

## Files Changed

| File                                           | Change                                                                                                           |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `packages/jobs/src/services/heroku-domains.ts` | Added `getExistingSniEndpoint()` to find and cache an existing endpoint; `addDomain()` now uses it automatically |
| `packages/jobs/src/workers/domain.ts`          | Uses `HEROKU_HOSTNAME` env var for DNS target; removed ACM polling code                                          |
| `packages/jobs/src/workers/site.ts`            | Fixed inline `addDomainToHeroku` to include SNI endpoint; uses `HEROKU_HOSTNAME` for DNS target                  |
| `apps/admin/src/app/api/domains/route.ts`      | Fixed `addDomainToHeroku` to find and use existing SNI endpoint; uses `HEROKU_HOSTNAME`                          |
| `packages/jobs/src/services/cloudflare-dns.ts` | Added optional `proxied` parameter to `setupStandardRecords()` (defaults to `true`)                              |

## Environment Changes

| Variable          | Value                                                       | Purpose                                         |
| ----------------- | ----------------------------------------------------------- | ----------------------------------------------- |
| `HEROKU_HOSTNAME` | `holibob-experiences-demand-gen-c27f61accbd2.herokuapp.com` | Full Heroku hostname for correct region routing |

---

## Prevention

1. **Always use `HEROKU_HOSTNAME`** for DNS CNAME targets, never construct from `HEROKU_APP_NAME`.
2. **Always include `sni_endpoint`** when adding domains to Heroku. Use `getExistingSniEndpoint()` to find one.
3. **Don't rely on Heroku ACM** with Cloudflare. Cloudflare provides SSL; Heroku just needs routing.
4. **Test new domains end-to-end** — curl the HTTPS URL after provisioning to confirm it returns 200, not just that the API calls succeeded.
