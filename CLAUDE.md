# nsqrai.com — NSQR AI

Marketing site for **NSQR AI** (Nicolas Quiroz) — **IT systems, networks and websites for
small business**.

## What the business does
⚠️ **REPOSITIONED 2026-08-24.** The site used to sell only AI/GPU physical-infrastructure
design to startups. It now sells the **full small-business IT stack**, and GPU work is one
specialist card at the bottom of the services section — not the premise. Do not "restore"
the old framing.

**Audience: small and mid-size businesses**, roughly 3–100 people, no IT department — an
office, clinic, shop, trades company or growing startup. The core pitch is *getting a small
business online and keeping it running*. Copy is plain-English and outcome-led; technical
specificity is the credibility layer underneath, never the lead.

Nine services, in the order they appear on the page:
1. Website & online presence (design/build/hosting, domain, DNS, TLS, business email, GBP/SEO)
2. Internet & connectivity (ISP selection & sizing, static IP, LTE/5G failover)
3. Networks & Wi-Fi (cabling, switching, survey/mesh, firewall, VLANs, VPN)
4. Servers & storage (spec/build/deploy, NAS, RAID, virtualization, racks, UPS)
5. Computers & devices (procurement, imaging, printers/POS, refresh planning)
6. Cloud, email & files (M365 / Google Workspace, mailbox+file migration, access control)
7. Backup & recovery (3-2-1, offsite, immutable snapshots, restore drills)
8. Security (MFA, patching, endpoint protection, phishing awareness)
9. Support & troubleshooting (remote & on-site, monitoring, root cause)

Plus two wide panels: **Ongoing cover** (flat monthly managed-IT plan, cancel anytime) and
**Specialist builds** (the surviving AI/GPU infrastructure work — H200/B200 class, 10–14 kW
per node).

Engagements start with a **free** discovery call. **No pricing numbers on the site** — but
the *pricing model* is stated (fixed price per project, or a flat monthly plan, quoted
before anything starts). Remote worldwide; on-site anywhere by arrangement.
A standing promise in the About copy: **every account, licence and domain is registered in
the client's name** — that is a deliberate anti-lock-in differentiator, keep it.

🛑 **Do NOT add a background/credibility section** (years of experience, certifications,
past employers, the upstation.io connection). The operator explicitly asked for it to be
left out. Credibility is carried by technical specificity in the copy instead.

## Stack — deliberately minimal
- **`index.html` is the entire site.** Single file, ~52 KB, **zero external requests**
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
a public page is an ACH-debit fraud target. They go out on an *invoice*, to a named client — see
the deposit-invoice flow below. The old `[ADD ACCOUNT NUMBER]` placeholders were removed, not
filled in.

## Deposit invoicing — direct bank transfer, zero fee (2026-08-16)
**The main path for anything sizeable. Stripe is the card/convenience option; this is the one that
costs nothing.** `pay.html` carries a deposit form (amount + name + email + company + note). It
POSTs `action=invoice` to the same Apps Script web app as the contact form, which issues
`NSQR-<year>-<seq>`, emails the client the invoice **as a PDF attachment** carrying our bank
details and that number as the payment reference, logs a row to a new **`Invoices`** tab, and
copies `billing@`. Client pays from their own bank. Set the row to **Paid** when it lands;
`Paid On` self-stamps.

🛑 **THE BANK BLOCK GOES ON THE ATTACHED PDF, NEVER IN THE MESSAGE BODY (2026-08-17).**
An account number + routing number + "TOTAL DUE" *in the body* of a mail from a domain with no
sending reputation is the exact fingerprint of a business email compromise attack, and the body is
what inbound filters read hardest. **`NSQR-2026-0003` proved it:** sent 01:12 ET, DKIM-signed
`d=nsqrai.com`, `bcc` leg to `billing@` delivered in **0 seconds** — and it never reached the
recipient's Gmail (checked `in:anywhere`, so Spam/Trash/Archive included) and **never bounced**.
Apps Script logged `doPost` … **Completed** in 1.835 s, so nothing on our side failed.
🪤 **`0001` and `0002` "worked" only because they went to `nicolasquirozr@nsqrai.com`** — internal
Workspace delivery, which never touches the public internet or spam filtering. **0003 was the first
external send this system ever made, and it is the only one that was a real deliverability test.**
∴ never read an internal-recipient test as proof that invoicing works.
- `invoiceHtml_` = the **full** invoice, bank block included → rendered to the PDF by
  `invoicePdfBlob_` via `Utilities.newBlob(html, MimeType.HTML).getAs(MimeType.PDF)` (needs **no
  new OAuth scope** — `Utilities` requires none, so this does not force a re-authorisation).
- `invoiceCoverHtml_` / `invoiceCoverText_` = the **email body**. Amount, due date, reference,
  "the invoice is attached". **Zero bank fields** — asserted by grepping `cfg.accountNumber` /
  `cfg.routingNumber` out of both.
- **Fallback:** if the PDF cannot be built, it sends the old inline-details invoice
  (`invoiceFullText_` / `invoiceHtml_`) so the client can still pay, and mails `info@` a
  **"went out WITHOUT the PDF"** warning. Never a cover note pointing at a missing attachment.
- **`PREVIEW_invoicePdf`** builds a sample PDF from the live template + live bank details and mails
  it to `info@`. Issues no invoice number, writes no row. Run it after any template edit —
  the HTML-to-PDF renderer is basic and layout regressions are invisible until you look.

## 🛑 SOLVED 2026-08-17 — `MailApp` NEVER DELIVERED EXTERNALLY. USE `GmailApp`.
**Root cause: `MailApp` does not send through this mailbox.** It relays through Apps Script's own
mailer — the headers show `Message-ID: <autogen-java-…@google.com>`, not `@nsqrai.com` — and Google
**silently discards** flagged relay mail, with no bounce and no error. Every symptom followed from
that: accepted, `bcc` delivered in 0 s, nothing at the recipient, no NDR.
🪤 **Invoices 0001/0002 "worked" only because they went to `nicolasquirozr@nsqrai.com`** — internal
Workspace delivery, which never touches the public internet. **0003 and 0004 were the first two
external sends this script ever attempted, and both vanished.** Nothing regressed; external
sending was never demonstrated to work at all.

**How it was proven** (do not re-litigate — this was measured, not inferred):
- The same one-line text sent by hand from the **Gmail compose window** → **delivered**.
- A 5-variant `MailApp` bisect to the same address → **all 5 dropped**, including variant A: a bare
  `to`/`subject`/`body` with no display name, no reply-to, no bcc, no attachment. ⇒ it was never
  the content, the alias, the HTML or the PDF.
- The exact exception, once the probe surfaced it:
  `The script does not have permission to perform that action. Required permissions:
  (https://mail.google.com/ || …/auth/gmail.send || …)`.
- After granting the scope, `GmailApp` probes (bare / from-alias / with-PDF) → **all 3 delivered**,
  and the live-site invoice **`NSQR-2026-0006` landed in the Primary inbox with the PDF attached**.

🪤 **The manifest had NO `oauthScopes`, so Apps Script never prompted** — `GmailApp` just threw at
the call site and `doPost`'s catch turned it into "Something went wrong." The fix is
[`scripts/appsscript.json`](./scripts/appsscript.json), which now declares them explicitly:
`spreadsheets` · `script.send_mail` · **`gmail.send`** · **`gmail.settings.basic`**.
Turn the manifest on with Project Settings → *Show "appsscript.json" manifest file in editor*.
⚠️ **A scope change needs one operator click** (Run → Review permissions → Allow). Until it is
granted the web app cannot send, so **never deploy a scope change before authorising it**.
✅ `billing@nsqrai.com` **is** a verified send-as alias (`GmailApp.getAliases()` returns it), so the
invoice now genuinely sends **from** `billing@`, not just with a display name.

⚠️ **Ruled out by measurement, do not re-test:** a typo in the address · the recipient's
Spam/Trash/Archive (`in:anywhere`) · a Gmail **filter** (the account has zero) · a **blocked
sender** · DKIM/SPF (signed `d=nsqrai.com` throughout) · content/BEC filtering.
📌 The PDF split is still worth keeping — it is how an invoice should look — but it was **not** the
deliverability fix, and it was shipped on a theory that turned out to be wrong.
⚠️ **Open, unfixed:** the site says *"Invoice … is on its way to your inbox"* and the sheet logs
**Sent** on an *unverified* send. 0003 was a silent failure — no delivery, no bounce, no signal.

🛑 **THE BANK DETAILS LIVE IN SCRIPT PROPERTIES, NEVER IN THE REPO.**
`moving-karma/nsqrai-site` is **PUBLIC on GitHub** — anything hardcoded in
`scripts/leads-apps-script.gs` is published on push, and git history keeps it after deletion.
Keys (Apps Script → Project Settings → Script Properties):
`BANK_ACCOUNT_NAME` · `BANK_NAME` · `BANK_ACCOUNT_NUMBER` · `BANK_ROUTING_NUMBER`; optional
`BANK_ACCOUNT_TYPE` · `PAYMENT_TERMS_DAYS` (default 14) · `BUSINESS_ADDRESS`.
Run `CHECK_bankDetails` to confirm they took — it prints set/MISSING and the last 4 only.
**Fails safe:** with the keys unset the script refuses to send, emails `info@` an
"ACTION NEEDED" alert, and tells the client we'll follow up — it never mails a blank invoice.
`bankConfig_` validates **shape, not just presence** (account ≥ 4 digits, routing exactly 9,
non-digits stripped) — a leftover placeholder like `PASTE_ACCOUNT_NUMBER` is truthy and would
otherwise sail onto a client's invoice. 🪤 The Script Properties UI **rejects an empty value**
("Value is required"), so a key cannot be pre-created blank and filled in later — it blocks the
whole save.

🪤 **The site's `fetch` cannot reliably read the reply** (Apps Script sends no CORS headers), so
`pay.html` retries fire-and-forget on a failed read. **That would have issued two invoice numbers
for one deposit.** Fixed with an idempotency key: the browser mints `request_id`, reuses it on the
retry, and the script returns the cached original number instead of issuing a second.
The POST is `text/plain` on purpose — a CORS *simple* request, so the browser skips the preflight
Apps Script can't answer, which is what lets the invoice number be read back at all.
`parseBody_` accepts urlencoded, JSON, and text/plain-JSON for that reason.

🪤 **`MailApp`, deliberately not `GmailApp`.** Sending *as* the `billing@` alias needs `GmailApp`
and a wider OAuth scope; a scope change forces re-authorisation, which would take the live contact
form down until it is clicked through. `name` + `replyTo` get the same result on the existing scope.

🪤 **Editing the script does NOT change what is deployed.** Saving updates HEAD; the web app keeps
serving the deployed version. Confirm which is live with `GET <exec-url>` — the new code's `doGet`
returns an extra `invoicing` field. To ship: **Deploy → Manage deployments → edit the EXISTING
deployment → Version: New version.** A *new* deployment mints a different `/exec` URL and breaks
the site. ⚠️ **Never push a `pay.html` deposit form ahead of the script** — the old code ignores
`action`, files the request as a lead, and the client is told an invoice is coming that never was.

🪤 Running any function from the editor after this rewrite prompts **"Authorization required"**.
That is a Google OAuth consent screen and only the operator can complete it. Until then
`START_HERE_buildSheets` cannot run — harmless, because `getOrCreateSheet_` builds the `Invoices`
tab on first use anyway; only the dropdown, colours and number formats wait on that one run.

## Squarespace
Domain registration only — **no website plan, and none needed**. Their 14-day trial site was
disconnected ("Park this domain") and the whole `Squarespace Defaults` DNS preset deleted,
including an `HTTPS` record whose `ipv4hint` would have kept sending browsers to Squarespace.

## Credentials
`~/.config/nsqrai/credentials.env` (mode 600, outside every repo — never commit it).
Check state with `bash scripts/check-creds.sh`, which prints status without values.
`SQUARESPACE_API_KEY` is permanently unavailable — it needs a paid Squarespace plan,
and even with one it only exposes commerce/forms data, never site content.

## Design language — retheme 2026-08-24
Near-black (`#04050c`) with a faint engineering grid, **futuristic / HUD**. The old
cyan→amber **cold-aisle/hot-aisle thermal metaphor is retired** with the GPU positioning.
The accent pair is now **cyan `#3ef0d8` = live signal / uptime / on-prem**, **violet
`#7c5cff` = cloud, identity and automation**; amber `#ffb545` is reserved for attention
states only. Monospace for anything that is a technical value; system sans for prose.
Respect `prefers-reduced-motion` — the whole scroll rig collapses to a plain stacked
document (verified: 6,983 px tall, no overflow, all nine stack layers visible).

Four sticky scroll scenes, in order:
1. **Approach** — portal + `Get online. / Stay online.` + a capability chip rail.
2. **Corridor** — 3D flythrough of two receding walls of network cabinets.
3. **Stack** — inline SVG that assembles **bottom-up, L1→L9**: internet circuit → firewall
   → switch → Wi-Fi → server/NAS → workstations → cloud & email → backup → website.
   Colour-coded cyan (network) / neutral (compute) / violet (cloud) / bright cyan (the
   public site). Counters animate `0/9 → 9/9` and `0 → 15 min`.
4. **Systems** — three pillars: **Presence** (browser mockup w/ scan line), **Connectivity**
   (node graph), **Continuity** (shield + verification rings).

🪤 **`.rk` transform ORDER is load-bearing (fixed 2026-08-24).** The corridor walls were
written `translateX() rotateY() translateZ()`, which applies `translateZ` in the
*already-rotated* frame — every cabinet slid ~sin(68°)·z sideways off-screen and the scene
rendered as an empty black tunnel at every viewport width. Correct order is **position
first, rotate in place last**: `translateX() translateZ() rotateY()`. Corridor half-width
is `--cw` on `.corridor` so it scales with the viewport.

🪤 The background canvas (`#stars`) is a **drifting network constellation**, not the old
starfield: nodes drift and draw links under ~150 px. One rAF loop over ≤90 nodes, and it
**stops on `visibilitychange`** so a backgrounded tab costs nothing.
