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

## Contact form — LIVE
Posts to a **Google Apps Script** web app (`scripts/leads-apps-script.gs`) that appends to
the **"nsqrai leads"** Sheet (tab `Leads`) and emails `info@nsqrai.com`. Deployed as a Web
app, *Execute as Me / Access Anyone*; `LEADS_ENDPOINT` in `index.html` holds the `/exec`
URL (also in `~/.config/nsqrai/credentials.env`).
🪤 **The Sheet and script MUST live under `nicolasquirozr@nsqrai.com`, not the personal
Gmail.** `sheets.new` opens under whichever account is `/u/0` — that was the Gmail. Use
`https://docs.google.com/spreadsheets/u/1/create` and check the Apps Script editor's
"signed in as" banner before doing anything.
🪤 **The Run function selector is unreliable under automation** — it silently reverts to the
previous function, and pressing Escape cancels the selection. `START_HERE_buildSheet` is
defined **first on purpose**: Apps Script defaults the Run selector to the first function
after a page reload, which sidesteps the dropdown entirely.
🪤 **Testing with curl:** a POST returns **302** to `script.googleusercontent.com/macros/echo`
— that means `doPost` ALREADY RAN. Following it with `-L` re-POSTs and yields a misleading
**405**. Capture `%{redirect_url}` and GET it separately to read the JSON.
Uses `mode: 'no-cors'` in the browser — Apps Script sends no CORS headers, so the response
is opaque and success cannot be read from the fetch. A honeypot field (`company_website`)
is silently dropped server-side; invalid emails are rejected.

## Email — aliases live
Primary user `nicolasquirozr@nsqrai.com`, with aliases **`nicolas@`**, **`billing@`** and
**`info@`**. `billing@` is also a Gmail *send-as* identity named "NSQR AI Billing" (no
verification email needed — Workspace aliases on a verified domain are trusted).
⚠️ Gmail is still set to **"Always reply from default address"**, so replies to `billing@`
or `info@` go out as `nicolasquirozr@`. Switch to "Reply from the same address" if wanted.
💡 Role addresses must be **aliases or Groups, never extra users** — a user seat is
$19.80/mo, an alias is free (30 per user).

## Payments — Stripe, LIVE (2026-08-16)
**Business model: prepaid account credit in DOLLARS.** $1 paid = $1 of credit — no points, no
units, no expiry. A client pays any amount, it is held as credit on their Stripe **Customer**,
and every invoice raised against them draws it down automatically; only the shortfall is due.
Unused credit is refundable — it is money on deposit, not a voucher.

🛑 **THE ONE MANUAL STEP.** Stripe does *not* convert a payment into customer credit by itself.
After each deposit lands: Customers → the customer → **Credit balance → Adjust balance** →
enter the amount as credit. Everything downstream (applying it to invoices, showing the running
balance on each invoice) is automatic. There is no no-code way to automate that hop; automating
it needs a webhook + a server, which this site deliberately does not have.
⏳ **Wait for ACH to clear before crediting** — ACH is a *delayed notification* method, 3–5
business days. Crediting on `checkout.session.completed` would credit an unsettled payment.

**The live account is `acct_1U2ipzL9gSnQ6vg1`** (name `nsqr-ai`, `nicolasquirozr@nsqrai.com`).
Activated, `charges_enabled` + `payouts_enabled`, **no open tasks**. Payouts land at
**Capital One ••••8891**, automatic, **daily**.
🪤 **`acct_1U2iq6LKpY7xQxAY` is the SANDBOX, a different account id.** Stripe's new sandboxes get
their own `acct_`, so a mismatch is not a bug — but the `sk_test_`/`pk_test_` keys in
`credentials.env` belong to the sandbox and can never touch live money. **There is no live key
stored anywhere, and none is needed** — the payment link was built in the Dashboard.

`pay.html` → **`https://buy.stripe.com/bJe28s7ZPh075y9aZW0RG01`** (`plink_1U5AkHL9gSnQ6vg1Rx3m1Rrx`,
type *customer chooses what to pay*): preset **$2,500**, min **$1**, max **$10,000**, collects
full name (required) + business name (optional) + a **"Invoice number (if any)"** optional text
field, redirects to `https://nsqrai.com/thanks.html`. Not listed on the public Stripe profile.
Deliberately OFF: *Managed Payments* (adds 3.5%/txn), *Collect tax automatically* (Stripe Tax
isn't configured; tax belongs on the real invoice, not on a deposit), *post-payment invoice PDF*
(0.4%, max $2 — Stripe already emails a receipt).

🛑 **TWO HARD CEILINGS on a young account, both real:**
- **$10,000 per transaction.** Stripe rejects a higher `maximum` outright: *"Your account cannot
  process values larger than $10,000.00."* Contact Stripe support to raise it once there's
  processing history. Until then a $20k invoice must be split or wired.
- **$20,000/week for ACH**, rising with volume. Above it, transactions are **blocked**.

💰 Why ACH matters: on a $20k invoice card costs ~$580, ACH is capped at **$5**. ACH Direct Debit
was **enabled 2026-08-16** — before that the checkout offered card/wallets only while `pay.html`
advertised ACH. Live method list: Card · US bank account · Cash App Pay · Klarna · Amazon Pay
(+ Link, + Apple Pay).

🔒 **Do NOT publish the bank account/routing numbers on `pay.html`.** An account + routing pair on
a public page is an ACH-debit fraud target, and it buys nothing: Stripe checkout already does ACH
at the same $5 cap with no exposure. The transfer block says "details on your invoice" on purpose
— the old `[ADD ACCOUNT NUMBER]` placeholders were removed, not filled in.

## Squarespace
Domain registration only — **no website plan, and none needed**. Their 14-day trial site was
disconnected ("Park this domain") and the whole `Squarespace Defaults` DNS preset deleted,
including an `HTTPS` record whose `ipv4hint` would have kept sending browsers to Squarespace.

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
