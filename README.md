# nsqrai.com

Static marketing site for NSQR AI — AI infrastructure design and specification.

- `index.html` — the entire site. Self-contained: no external requests, no build step.
- `CNAME` — custom domain for GitHub Pages.
- `scripts/leads-apps-script.gs` — Google Apps Script lead-capture endpoint (deploy in Google Sheets).
- `scripts/check-creds.sh` — reports which credentials are configured, without printing values.

## Deploy

Any push to `main` publishes automatically via GitHub Pages.

## Contact form

Set `LEADS_ENDPOINT` near the bottom of `index.html` to the Apps Script `/exec` URL.
