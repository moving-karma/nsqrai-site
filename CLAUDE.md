# nsqrai.com — NSQR AI

Marketing site for **NSQR AI** (Nicolas Quiroz) — AI/GPU **physical infrastructure design
and specification** for startups.

## What the business does
Consulting on the physical layer of GPU deployments: capacity planning, rack elevations,
power and electrical (PDU/UPS, 3-phase, N+1 / 2N), thermal and airflow (containment,
rear-door, DLC), network fabric (InfiniBand/RoCE, optics, per-cable lengths), and the
bill of materials. Client hardware is **H200 / B200 class** (~10–14 kW per 8-GPU node).
Engagements start with a discovery call. **No pricing on the site** — scoped per project.
Remote worldwide; on-site travel possible, agreed per engagement.

🛑 **Do NOT add a background/credibility section** (years of experience, certifications,
past employers, the upstation.io connection). The operator explicitly asked for it to be
left out. Credibility is carried by technical specificity in the copy instead.

## Stack — deliberately minimal
- **`index.html` is the entire site.** Single file, ~28 KB, **zero external requests**
  (no fonts, CDNs, images, or analytics). No build step, no framework, no dependencies.
- Hosting: **GitHub Pages** from `main` at repo root — `moving-karma/nsqrai-site` (public).
  Any push to `main` republishes. Build takes ~40 s.
- Domain + DNS stay at **Squarespace**; email is **Google Workspace**.

## Hard constraints
- 🛑 **Never touch MX, SPF, DKIM or DMARC records** — that is live business email.
  Only the apex `A` records and the `www` CNAME belong to the website.
- Apex A records must be GitHub's: `185.199.108.153` … `185.199.111.153`.
  `www` CNAME → `moving-karma.github.io`. `CNAME` file in the repo root must stay `nsqrai.com`.
- Keep the site **self-contained** — an external request breaks the "works as a Squarespace
  code block" fallback and slows first paint. Inline everything.
- Squarespace has **no content API** and Developer Mode is 7.0-only, so nothing can be
  pushed to Squarespace programmatically. Its website plan was declined ($23/mo) — the
  trial site was private-only and lapses ~Aug 14 2026.

## Contact form
Posts to a **Google Apps Script** web app (`scripts/leads-apps-script.gs`) that appends to
a Sheet and emails `nicolas@nsqrai.com`. Set `LEADS_ENDPOINT` near the bottom of
`index.html` to the deployed `/exec` URL. Uses `mode: 'no-cors'` — Apps Script returns no
CORS headers, so the response is opaque and success cannot be read from the fetch.
A honeypot field (`company_website`) is silently dropped server-side.

## Credentials
`~/.config/nsqrai/credentials.env` (mode 600, outside every repo — never commit it).
Check state with `bash scripts/check-creds.sh`, which prints status without values.
`SQUARESPACE_API_KEY` is permanently unavailable — it needs a paid Squarespace plan,
and even with one it only exposes commerce/forms data, never site content.

## Design language
Near-black (`#05070a`) with a faint engineering grid. Cyan `#3ef0d8` → amber `#ffb545`
as a **cold-aisle/hot-aisle thermal metaphor**, not decoration. Monospace for anything
that is a technical value; system sans for prose. The hero is a to-scale 42U rack
elevation in inline SVG with animated airflow — it establishes competence before any
copy is read. Respect `prefers-reduced-motion`.
