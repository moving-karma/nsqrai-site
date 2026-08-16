/**
 * nsqrai.com - lead capture + deposit invoicing.
 *
 * Two jobs, one web app:
 *   1. LEADS    - contact-form submissions -> "Leads" sheet + email to info@
 *   2. INVOICES - deposit requests from pay.html -> generates an invoice number,
 *                 emails the client a bank-transfer invoice with our details
 *                 filled in, logs it to the "Invoices" sheet, copies billing@.
 *
 * Runs entirely inside your own Google Workspace: no API keys, no OAuth, no
 * third-party service, no processing fee on the money.
 *
 * ============================================================================
 * SETUP
 * ============================================================================
 *   1. Open the "nsqrai leads" Sheet -> Extensions -> Apps Script.
 *   2. Replace the whole file with this one. Save.
 *   3. *** PUT THE BANK DETAILS IN SCRIPT PROPERTIES - NOT IN THIS FILE. ***
 *      Project Settings (gear, left rail) -> Script Properties -> Add:
 *
 *          BANK_ACCOUNT_NAME     NSQR-IA LLC
 *          BANK_NAME             Capital One Bank
 *          BANK_ACCOUNT_NUMBER   <the account number>
 *          BANK_ROUTING_NUMBER   <the routing number>
 *
 *      Optional, all have defaults:
 *          BANK_ACCOUNT_TYPE     Business Basic Checking
 *          PAYMENT_TERMS_DAYS    14
 *          BUSINESS_ADDRESS      155 Lakeview Avenue 2, Clifton, NJ 07011
 *
 *      WHY NOT IN THE CODE: this repo (moving-karma/nsqrai-site) is PUBLIC on
 *      GitHub. Anything hardcoded here gets published the moment it is pushed,
 *      and git history keeps it even after it is deleted. Script Properties
 *      live in your Google account and are never committed.
 *
 *   4. Run  > START_HERE_buildSheets  once. Approve the permission prompt.
 *   5. Deploy -> Manage deployments -> edit the live deployment -> Version:
 *      "New version" -> Deploy. (A NEW deployment would change the /exec URL
 *      and break the site. Always edit the existing one.)
 *
 * ============================================================================
 * HOW THE DEPOSIT FLOW WORKS
 * ============================================================================
 *   Client fills the deposit form on nsqrai.com/pay.html with an amount and
 *   their details -> this script issues NSQR-<year>-<seq>, emails them an
 *   invoice carrying our bank details and that number as the payment
 *   reference, and logs a row to "Invoices" with Status = Sent.
 *
 *   When the money lands in the bank, set Status to Paid on that row. "Paid On"
 *   stamps itself. That sheet is the ledger of what is owed and what has
 *   cleared - the bank statement reference will match the invoice number.
 *
 *   Nothing here moves money. It issues a request to pay and records it.
 */

// ---------------------------------------------------------------- run me first
/**
 * ENTRY POINT - run this once from the editor to build both sheets.
 * Defined first on purpose: the Run selector defaults to the first function,
 * so there is nothing to choose from a dropdown.
 */
function START_HERE_buildSheets() {
  setupSheet();
  setupInvoiceSheet();
}

/**
 * Prints whether the bank details are configured, WITHOUT printing them.
 * Run this after step 3 to confirm the properties took.
 */
function CHECK_bankDetails() {
  var cfg = bankConfig_();
  var mask = function (v) {
    if (!v) return 'MISSING';
    return v.length <= 4 ? 'set' : 'set (...' + v.slice(-4) + ')';
  };
  Logger.log([
    'BANK_ACCOUNT_NAME    ' + (cfg.accountName || 'MISSING'),
    'BANK_NAME            ' + (cfg.bankName || 'MISSING'),
    'BANK_ACCOUNT_NUMBER  ' + mask(cfg.accountNumber),
    'BANK_ROUTING_NUMBER  ' + mask(cfg.routingNumber),
    '',
    cfg.complete
      ? 'READY - deposit invoices will send.'
      : 'NOT READY - fill the MISSING keys in Project Settings > Script Properties.',
  ].join('\n'));
}

// ---------------------------------------------------------------- config
var NOTIFY_TO    = 'info@nsqrai.com';
var BILLING_FROM = 'billing@nsqrai.com';   // Gmail send-as alias
var SHEET_NAME   = 'Leads';
var INVOICE_SHEET_NAME = 'Invoices';
var HONEYPOT     = 'company_website';      // hidden in the form; bots fill it in
var STRIPE_LINK  = 'https://buy.stripe.com/bJe28s7ZPh075y9aZW0RG01';

/**
 * The ONLY thing we ever bill on this route. Every invoice carries exactly this
 * one line, at the amount the client chose - nothing client-supplied is ever
 * priced or described. Keep this in step with the Stripe product name so a card
 * receipt and a bank invoice read identically on their books.
 */
var CREDIT_LABEL = 'Advisory credit';
var CREDIT_DESC  = 'Prepaid credit, applied against future NSQR AI invoices';
var CARD_LIMIT   = 10000;                  // Stripe per-transaction ceiling, USD
var MAX_INVOICE  = 1000000;                // sanity bound on the amount field

var STATUSES = ['New', 'Replied', 'Qualified', 'Proposal sent', 'Won', 'Lost', 'Spam'];
var HEADERS  = ['Received', 'Name', 'Email', 'Company', 'What they need',
                'Status', 'Replied On', 'Days Waiting', 'Reason / Notes',
                'Next Follow-up', 'Source'];

var INVOICE_STATUSES = ['Sent', 'Paid', 'Part paid', 'Overdue', 'Void'];
// Appended, never inserted: onEdit keys off Status = col 8 and Paid On = col 9,
// so inserting a column in the middle would silently retarget the paid-stamp.
var INVOICE_HEADERS  = ['Issued', 'Invoice No', 'Name', 'Email', 'Company',
                        'Amount (USD)', 'Due', 'Status', 'Paid On', 'Method',
                        'Notes', 'Source', 'Billing address'];

/** Bank details, read from Script Properties. Never hardcode them here. */
function bankConfig_() {
  var p = PropertiesService.getScriptProperties();
  var cfg = {
    accountName:   (p.getProperty('BANK_ACCOUNT_NAME')   || '').trim(),
    bankName:      (p.getProperty('BANK_NAME')           || '').trim(),
    accountNumber: (p.getProperty('BANK_ACCOUNT_NUMBER') || '').trim(),
    routingNumber: (p.getProperty('BANK_ROUTING_NUMBER') || '').trim(),
    accountType:   (p.getProperty('BANK_ACCOUNT_TYPE')   || 'Business Checking').trim(),
    address:       (p.getProperty('BUSINESS_ADDRESS')    || '').trim(),
    // NOT `|| 14`: PAYMENT_TERMS_DAYS=0 (due on receipt) is falsy and would
    // silently become Net 14. Only an absent/unparseable value defaults.
    termsDays:     (function (v) { return isNaN(v) ? 14 : v; })(
                     parseInt(p.getProperty('PAYMENT_TERMS_DAYS'), 10)),
    // No BANK_ADDRESS: a domestic ACH or wire to Capital One clears on account
    // holder + ABA + account number. The address that matters is OURS (the
    // beneficiary's), which is BUSINESS_ADDRESS above - matching invoice 009.
    swift:         (p.getProperty('BANK_SWIFT')          || '').trim(),
    phone:         (p.getProperty('BUSINESS_PHONE')      || '').trim(),
    ein:           (p.getProperty('BUSINESS_EIN')        || '').trim(),
  };
  // Validate shape, not just presence. A placeholder left in the property
  // ("PASTE_ACCOUNT_NUMBER") is truthy, and would sail through a presence check
  // straight onto a client's invoice. Digits only: US routing numbers are
  // exactly 9, account numbers at least 4.
  var acct = cfg.accountNumber.replace(/\D/g, '');
  var aba  = cfg.routingNumber.replace(/\D/g, '');
  cfg.complete = !!(cfg.accountName && acct.length >= 4 && aba.length === 9);
  return cfg;
}

// ---------------------------------------------------------------- web endpoint
function doPost(e) {
  try {
    var data = parseBody_(e);

    // Silently accept-and-drop spam so bots get no feedback signal.
    if (data[HONEYPOT]) return json_({ ok: true });

    if (!data.email || !isEmail_(data.email)) {
      return json_({ ok: false, error: 'A valid email address is required.' });
    }

    if (String(data.action || '').toLowerCase() === 'invoice') {
      return handleInvoiceRequest_(data);
    }
    return handleLead_(data);
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'Something went wrong. Please email us directly.' });
  }
}

/** Health check - opening the URL in a browser should show this. */
function doGet() {
  return json_({
    ok: true,
    service: 'nsqrai lead capture + deposit invoicing',
    invoicing: bankConfig_().complete ? 'ready' : 'not configured',
  });
}

// ---------------------------------------------------------------- leads
function handleLead_(data) {
  var sheet = getSheet_();
  var row = sheet.getLastRow() + 1;
  sheet.appendRow([
    new Date(),
    data.name || '',
    data.email,
    data.company || '',
    data.message || '',
    'New',
    '',                                        // Replied On
    '=IF($G' + row + '<>"",""  ,INT(TODAY()-INT($A' + row + ')))',
    '',                                        // Reason / Notes
    '',                                        // Next Follow-up
    data.source || 'nsqrai.com',
  ]);

  notify_(data);
  return json_({ ok: true });
}

// ---------------------------------------------------------------- invoicing
function handleInvoiceRequest_(data) {
  var cfg = bankConfig_();
  if (!cfg.complete) {
    // Do not email an invoice with blank bank details - it would be unpayable
    // and would look broken to the client. Tell the operator instead.
    MailApp.sendEmail({
      to: NOTIFY_TO,
      subject: 'ACTION NEEDED - deposit request received but bank details are not set',
      body: [
        (data.name || data.email) + ' asked for a deposit invoice of ' +
          money_(parseAmount_(data.amount)) + ' and it could NOT be sent.',
        '',
        'The bank details are missing from Script Properties. Add them in the',
        'Apps Script editor: Project Settings > Script Properties. Then run',
        'CHECK_bankDetails to confirm, and invoice this person by hand:',
        '',
        '  Name:    ' + (data.name || '(not given)'),
        '  Email:   ' + data.email,
        '  Company: ' + (data.company || '(not given)'),
        '  Amount:  ' + money_(parseAmount_(data.amount)),
        '  Note:    ' + (data.message || '(none)'),
      ].join('\n'),
    });
    return json_({ ok: false, error: 'Invoicing is not configured yet. We have been notified and will email you directly.' });
  }

  var amount = parseAmount_(data.amount);
  if (!(amount > 0)) {
    return json_({ ok: false, error: 'Enter the amount you want to deposit.' });
  }
  if (amount > MAX_INVOICE) {
    return json_({ ok: false, error: 'Please email billing@nsqrai.com for amounts over ' + money_(MAX_INVOICE) + '.' });
  }

  // Idempotency. The browser cannot always read our response (Apps Script sends
  // no CORS headers), so the site retries fire-and-forget on a failed read. That
  // retry carries the same request_id, and this returns the ORIGINAL invoice
  // number instead of issuing a second one for the same deposit.
  var reqId = String(data.request_id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  var cache = CacheService.getScriptCache();
  var invoiceNo;

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (reqId) {
      var prior = cache.get('inv_' + reqId);
      if (prior) return json_({ ok: true, invoice: prior, duplicate: true });
    }
    invoiceNo = claimInvoiceNumber_();
    if (reqId) cache.put('inv_' + reqId, invoiceNo, 21600);  // 6 h
  } finally {
    lock.releaseLock();
  }

  var issued = new Date();
  var due = new Date(issued.getTime() + cfg.termsDays * 86400000);

  var record = {
    invoiceNo: invoiceNo,
    issued: issued,
    due: due,
    amount: amount,
    // name/company DO appear on the invoice, so they are flattened to a single
    // line and capped - a client cannot smuggle extra "terms" in via newlines.
    // The form posts first_name/last_name; `name` is kept as a fallback so an
    // older cached copy of pay.html still submits successfully.
    name: clean_(
      [data.first_name, data.last_name].filter(String).join(' ') || data.name, 80),
    email: data.email,
    company: clean_(data.company, 80),
    // Assembled from discrete fields rather than one free-text blob, so it
    // renders as a real postal address and each part can be reused later.
    billingAddress: composeAddress_(data),
    // note NEVER reaches the client's invoice. Operator-side only: the sheet
    // and the notification email. See emailInvoice_.
    note: clean_(data.message, 500),
    source: clean_(data.source, 60) || 'nsqrai.com',
  };

  emailInvoice_(record, cfg);

  var sheet = getInvoiceSheet_();
  sheet.appendRow([
    issued, invoiceNo, record.name, record.email, record.company,
    amount, due, 'Sent', '', 'Bank transfer', record.note, record.source,
    record.billingAddress,
  ]);

  notifyInvoiceIssued_(record);
  return json_({ ok: true, invoice: invoiceNo });
}

/**
 * Sequential per calendar year: NSQR-2026-0001.
 * CALLER MUST HOLD THE SCRIPT LOCK. Apps Script locks are not reentrant, so
 * taking one here as well would deadlock against handleInvoiceRequest_.
 */
function claimInvoiceNumber_() {
  var props = PropertiesService.getScriptProperties();
  var year = new Date().getFullYear();
  var key = 'INVOICE_SEQ_' + year;
  var seq = (parseInt(props.getProperty(key), 10) || 0) + 1;
  props.setProperty(key, String(seq));
  return 'NSQR-' + year + '-' + ('000' + seq).slice(-4);
}

function emailInvoice_(r, cfg) {
  var subject = 'Invoice ' + r.invoiceNo + ' from NSQR AI - ' + money_(r.amount);

  var plain = [
    'Invoice ' + r.invoiceNo,
    '',
    'NSQR AI - AI infrastructure design & specification',
    cfg.address || null,
    'billing@nsqrai.com' + (cfg.phone ? '  ' + cfg.phone : ''),
    cfg.ein ? 'EIN ' + cfg.ein : null,
    '',
    'Issued:      ' + fmtDate_(r.issued),
    'Due:         ' + dueLabel_(r, cfg),
    'Terms:       ' + termsLabel_(cfg),
    'Currency:    USD',
    '',
    'BILL TO',
    r.company || r.name,
    (r.company && r.name) ? r.name : null,
    r.billingAddress || null,
    r.email,
    '',
    pad_('DESCRIPTION', 46) + 'AMOUNT',
    pad_(CREDIT_LABEL, 46) + money_(r.amount),
    '  ' + CREDIT_DESC,
    '',
    pad_('TOTAL DUE', 46) + money_(r.amount),
    '',
    'WIRE / ACH INSTRUCTIONS',
    '  Account holder:  ' + cfg.accountName,
    cfg.address ? '  Address:         ' + cfg.address : null,
    '  Bank name:       ' + cfg.bankName,
    '  Account number:  ' + cfg.accountNumber,
    '  Routing number:  ' + cfg.routingNumber,
    '  Account type:    ' + cfg.accountType,
    '  Currency:        USD',
    '  REFERENCE:       ' + r.invoiceNo + '   <- include this',
    '',
    'The same routing number works for ACH and for a domestic wire. The',
    'reference is how the payment gets matched to you; without it,',
    'reconciliation is manual and slower.',
    '',
    cfg.swift ? 'INTERNATIONAL WIRE' : 'Paying from outside the US? Email billing@nsqrai.com for',
    cfg.swift ? '  SWIFT / BIC:     ' + cfg.swift : 'international wire instructions before sending.',
    cfg.swift ? '  Account holder:  ' + cfg.accountName : null,
    cfg.swift ? '  Account number:  ' + cfg.accountNumber : null,
    cfg.swift ? '  Send in USD and ask your bank to pay all correspondent' : null,
    cfg.swift ? '  charges (OUR) so the full invoiced amount arrives.' : null,
    '',
    r.amount <= CARD_LIMIT
      ? 'Prefer to pay by card? ' + STRIPE_LINK + ' (a processing fee applies)'
      : 'This amount is above the card limit, so bank transfer is the way to pay it.',
    '',
    'This deposit is held as credit on your account and drawn down by the work',
    'invoiced against it. Unused credit is refundable.',
    '',
    'Questions: billing@nsqrai.com',
    cfg.address ? 'NSQR AI, ' + cfg.address : 'NSQR AI',
  // null means "field not configured, drop the line"; '' means "paragraph
  // break, keep it". An earlier version filtered on '' and collapsed the whole
  // invoice into a single unreadable block.
  ].filter(function (l) { return l !== null; }).join('\n');

  var html = invoiceHtml_(r, cfg);

  // MailApp, deliberately not GmailApp. Sending *as* the billing@ alias needs
  // GmailApp, which pulls in a wider OAuth scope - and a scope change forces
  // re-authorisation that would take the live contact form down until it is
  // clicked through. Display name + reply-to get the same result for free.
  MailApp.sendEmail({
    to: r.email,
    subject: subject,
    body: plain,
    htmlBody: html,
    name: 'NSQR AI Billing',
    replyTo: BILLING_FROM,
    bcc: BILLING_FROM,
  });
}

function invoiceHtml_(r, cfg) {
  var row = function (k, v, strong) {
    return '<tr>' +
      '<td style="padding:7px 18px 7px 0;color:#64748b;font-size:13px;white-space:nowrap">' + esc_(k) + '</td>' +
      '<td style="padding:7px 0;color:#0f172a;font-size:14px;' +
        (strong ? 'font-weight:700;' : '') +
        'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace">' + esc_(v) + '</td>' +
      '</tr>';
  };

  return [
    '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;',
    'max-width:600px;margin:0 auto;padding:34px 28px;color:#0f172a;line-height:1.6">',

    // FROM / remit-to. A bare business name is not enough on a document that
    // carries payment instructions - the payer's finance team needs a postal
    // address to file it, and a wire needs the beneficiary address anyway.
    '<table style="width:100%;border-collapse:collapse;border-bottom:2px solid #0f172a;padding-bottom:16px;margin-bottom:26px">',
    '<tr><td style="padding-bottom:16px;vertical-align:top">',
    '<div style="font-size:19px;font-weight:700;letter-spacing:-.02em">NSQR AI</div>',
    '<div style="font-size:12px;color:#64748b">AI infrastructure design &amp; specification</div>',
    cfg.address ? '<div style="font-size:12px;color:#64748b;margin-top:6px">' + esc_(cfg.address) + '</div>' : '',
    '<div style="font-size:12px;color:#64748b">billing@nsqrai.com',
    cfg.phone ? ' &middot; ' + esc_(cfg.phone) : '', '</div>',
    cfg.ein ? '<div style="font-size:12px;color:#64748b">EIN ' + esc_(cfg.ein) + '</div>' : '',
    '</td></tr></table>',

    '<div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#0d9488;font-weight:700">Invoice</div>',
    '<div style="font-size:26px;font-weight:700;letter-spacing:-.02em;margin:2px 0 22px">', esc_(r.invoiceNo), '</div>',

    '<table style="border-collapse:collapse;margin-bottom:10px">',
    row('Issued', fmtDate_(r.issued)),
    row('Due', dueLabel_(r, cfg), cfg.termsDays === 0),
    row('Terms', termsLabel_(cfg)),
    row('Currency', 'USD'),
    '</table>',

    '<div style="margin-bottom:26px">',
    '<div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#64748b;font-weight:700;margin-bottom:6px">Bill to</div>',
    '<div style="font-size:14px;color:#0f172a;font-weight:600">', esc_(r.company || r.name || r.email), '</div>',
    r.company && r.name ? '<div style="font-size:13px;color:#475569">' + esc_(r.name) + '</div>' : '',
    r.billingAddress
      ? '<div style="font-size:13px;color:#475569;white-space:pre-line">' + esc_(r.billingAddress) + '</div>'
      : '',
    '<div style="font-size:13px;color:#475569">', esc_(r.email), '</div>',
    '</div>',

    // The single billable line. Nothing the client typed is priced or
    // described here - only the amount they chose.
    '<table style="width:100%;border-collapse:collapse;margin-bottom:26px">',
    '<tr>',
    '<th style="text-align:left;padding:0 0 8px;border-bottom:1px solid #cbd5e1;',
    'font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#64748b;font-weight:700">Description</th>',
    '<th style="text-align:right;padding:0 0 8px;border-bottom:1px solid #cbd5e1;',
    'font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#64748b;font-weight:700">Amount</th>',
    '</tr>',
    '<tr>',
    '<td style="padding:16px 16px 16px 0;border-bottom:1px solid #e2e8f0;vertical-align:top">',
    '<div style="font-size:15px;font-weight:600;color:#0f172a">', esc_(CREDIT_LABEL), '</div>',
    '<div style="font-size:13px;color:#64748b;margin-top:3px">', esc_(CREDIT_DESC), '</div>',
    '</td>',
    '<td style="padding:16px 0;border-bottom:1px solid #e2e8f0;text-align:right;vertical-align:top;',
    'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:15px;color:#0f172a">',
    esc_(money_(r.amount)), '</td>',
    '</tr>',
    '<tr>',
    '<td style="padding:14px 16px 0 0;text-align:right;font-size:13px;letter-spacing:.1em;',
    'text-transform:uppercase;color:#64748b;font-weight:700">Total due</td>',
    '<td style="padding:14px 0 0;text-align:right;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;',
    'font-size:22px;font-weight:700;color:#0f172a">', esc_(money_(r.amount)), '</td>',
    '</tr>',
    '</table>',

    '<div style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:10px;padding:20px 22px;margin-bottom:22px">',
    '<div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#0f766e;font-weight:700;margin-bottom:12px">',
    'Wire / ACH instructions</div>',
    '<table style="border-collapse:collapse">',
    row('Account holder', cfg.accountName),
    cfg.address ? row('Address', cfg.address) : '',
    row('Bank name', cfg.bankName),
    row('Account number', cfg.accountNumber, true),
    row('Routing number', cfg.routingNumber, true),
    row('Account type', cfg.accountType),
    row('Currency', 'USD'),
    row('Reference', r.invoiceNo, true),
    '</table>',
    '<div style="font-size:13px;color:#0f766e;margin-top:14px">',
    'Put <strong>', esc_(r.invoiceNo), '</strong> in the payment reference — that is how it gets matched to you. ',
    'The same routing number works for ACH and for a domestic wire.',
    '</div>',
    '</div>',

    // International is shown ONLY when a SWIFT/BIC is configured. Advertising
    // it without one sends the payer to a bank that will reject the wire.
    cfg.swift
      ? '<div style="border:1px solid #e2e8f0;border-radius:10px;padding:18px 22px;margin-bottom:22px">' +
        '<div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#64748b;font-weight:700;margin-bottom:10px">' +
        'International wire</div>' +
        '<table style="border-collapse:collapse">' +
        row('SWIFT / BIC', cfg.swift, true) +
        row('Account holder', cfg.accountName) +
        (cfg.address ? row('Address', cfg.address) : '') +
        row('Account number', cfg.accountNumber, true) +
        '</table>' +
        '<div style="font-size:13px;color:#64748b;margin-top:12px">' +
        'Send in USD. Ask your bank to pay all correspondent charges (OUR) so the full ' +
        'invoiced amount arrives.</div></div>'
      : '<div style="font-size:13px;color:#475569;margin-bottom:22px">Paying from outside the US? ' +
        'Email <a href="mailto:billing@nsqrai.com" style="color:#0d9488">billing@nsqrai.com</a> ' +
        'for international wire instructions before sending.</div>',

    r.amount <= CARD_LIMIT
      ? '<div style="font-size:13px;color:#475569;margin-bottom:22px">Prefer to pay by card? ' +
        '<a href="' + STRIPE_LINK + '" style="color:#0d9488">Pay online instead</a>' +
        ' — a card processing fee applies, which is why bank transfer is preferred.</div>'
      : '<div style="font-size:13px;color:#475569;margin-bottom:22px">This amount is above the online card limit, ' +
        'so bank transfer is the way to settle it.</div>',

    // r.note is DELIBERATELY absent. It is free text from a public form, and
    // this is a branded invoice - echoing it back would let anyone mint an
    // NSQR AI document saying whatever they typed. It goes to the operator
    // only, via notifyInvoiceIssued_ and the Invoices sheet.

    '<div style="font-size:13px;color:#475569;border-top:1px solid #e2e8f0;padding-top:18px">',
    'This deposit is held as <strong>credit on your account</strong> and drawn down by the work invoiced ',
    'against it. Every invoice shows the credit applied and what is left. Unused credit is refundable.',
    '</div>',

    '<div style="font-size:12px;color:#94a3b8;margin-top:24px">',
    'Questions about this invoice: <a href="mailto:billing@nsqrai.com" style="color:#0d9488">billing@nsqrai.com</a><br>',
    cfg.address ? esc_('NSQR AI · ' + cfg.address) : 'NSQR AI',
    '</div>',

    '</div>',
  ].join('');
}

function notifyInvoiceIssued_(r) {
  MailApp.sendEmail({
    to: NOTIFY_TO,
    subject: 'Invoice ' + r.invoiceNo + ' issued - ' + money_(r.amount) + ' - ' + (r.company || r.name),
    replyTo: r.email,
    body: [
      r.invoiceNo + ' has been emailed to the client.',
      '',
      'Amount:  ' + money_(r.amount),
      'Name:    ' + (r.name || '(not given)'),
      'Email:   ' + r.email,
      'Company: ' + (r.company || '(not given)'),
      'Due:     ' + fmtDate_(r.due),
      '',
      '--- PO / note (client typed this; it is NOT on their invoice) ---',
      r.note || '(none)',
      '----------------------------------------------------------------',
      '',
      'Logged to the Invoices sheet as Sent.',
      'When the money lands in the bank, set that row to Paid - the reference on',
      'the statement will read ' + r.invoiceNo + '.',
    ].join('\n'),
  });
}

// ---------------------------------------------------------------- sheet setup
/** Run this ONCE by hand from the Apps Script editor. */
function setupSheet() {
  var sheet = getSheet_();

  sheet.getRange(1, 1, 1, HEADERS.length)
       .setValues([HEADERS])
       .setFontWeight('bold')
       .setBackground('#04283c')
       .setFontColor('#ffffff');
  sheet.setFrozenRows(1);

  // Status dropdown
  var statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(STATUSES, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, 6, sheet.getMaxRows() - 1, 1).setDataValidation(statusRule);

  // Colour by status
  var col = function (v, bg, fg) {
    return SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(v).setBackground(bg).setFontColor(fg)
      .setRanges([sheet.getRange(2, 6, sheet.getMaxRows() - 1, 1)]).build();
  };
  sheet.setConditionalFormatRules([
    col('New',           '#fff2cc', '#7f6000'),
    col('Replied',       '#d9ead3', '#274e13'),
    col('Qualified',     '#cfe2f3', '#0b5394'),
    col('Proposal sent', '#d9d2e9', '#351c75'),
    col('Won',           '#b6d7a8', '#274e13'),
    col('Lost',          '#f4cccc', '#990000'),
    col('Spam',          '#efefef', '#666666'),
  ]);

  sheet.setColumnWidth(1, 150);  // Received
  sheet.setColumnWidth(5, 340);  // What they need
  sheet.setColumnWidth(9, 300);  // Reason / Notes
  sheet.getRange(2, 1, sheet.getMaxRows() - 1, 1).setNumberFormat('yyyy-mm-dd hh:mm');
  sheet.getRange(2, 7, sheet.getMaxRows() - 1, 1).setNumberFormat('yyyy-mm-dd');
  sheet.getRange(2, 10, sheet.getMaxRows() - 1, 1).setNumberFormat('yyyy-mm-dd');

  SpreadsheetApp.getActive().toast('Leads sheet ready.', 'nsqrai', 5);
}

/** Builds the Invoices ledger. Safe to re-run. */
function setupInvoiceSheet() {
  var sheet = getInvoiceSheet_();

  sheet.getRange(1, 1, 1, INVOICE_HEADERS.length)
       .setValues([INVOICE_HEADERS])
       .setFontWeight('bold')
       .setBackground('#04283c')
       .setFontColor('#ffffff');
  sheet.setFrozenRows(1);

  var last = sheet.getMaxRows() - 1;

  var statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(INVOICE_STATUSES, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, 8, last, 1).setDataValidation(statusRule);

  var col = function (v, bg, fg) {
    return SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(v).setBackground(bg).setFontColor(fg)
      .setRanges([sheet.getRange(2, 8, last, 1)]).build();
  };
  sheet.setConditionalFormatRules([
    col('Sent',      '#fff2cc', '#7f6000'),
    col('Paid',      '#b6d7a8', '#274e13'),
    col('Part paid', '#cfe2f3', '#0b5394'),
    col('Overdue',   '#f4cccc', '#990000'),
    col('Void',      '#efefef', '#666666'),
  ]);

  sheet.getRange(2, 1, last, 1).setNumberFormat('yyyy-mm-dd hh:mm');  // Issued
  sheet.getRange(2, 6, last, 1).setNumberFormat('$#,##0.00');         // Amount
  sheet.getRange(2, 7, last, 1).setNumberFormat('yyyy-mm-dd');        // Due
  sheet.getRange(2, 9, last, 1).setNumberFormat('yyyy-mm-dd');        // Paid On
  sheet.setColumnWidth(2, 130);   // Invoice No
  sheet.setColumnWidth(11, 300);  // Notes

  SpreadsheetApp.getActive().toast('Invoices sheet ready.', 'nsqrai', 5);
}

/**
 * Leads: stamps "Replied On" when Status becomes Replied.
 * Invoices: stamps "Paid On" when Status becomes Paid.
 */
function onEdit(e) {
  if (!e || !e.range) return;
  var sheet = e.range.getSheet();
  var name = sheet.getName();
  var row = e.range.getRow();
  if (row < 2) return;

  if (name === SHEET_NAME && e.range.getColumn() === 6) {
    var replied = sheet.getRange(row, 7);
    if (e.value === 'Replied' && !replied.getValue()) replied.setValue(new Date());
    return;
  }

  if (name === INVOICE_SHEET_NAME && e.range.getColumn() === 8) {
    var paid = sheet.getRange(row, 9);
    if (e.value === 'Paid' && !paid.getValue()) paid.setValue(new Date());
  }
}

// ---------------------------------------------------------------- helpers
/**
 * Accepts form-urlencoded, application/json, AND text/plain carrying JSON.
 * text/plain matters: it is a CORS "simple request", so the browser skips the
 * preflight that Apps Script cannot answer - which lets the site read the
 * response and show the invoice number instead of guessing.
 */
function parseBody_(e) {
  if (!e) return {};
  if (e.parameter && Object.keys(e.parameter).length) return e.parameter;
  if (!e.postData) return {};

  var raw = e.postData.contents || '';
  var type = e.postData.type || '';
  if (type.indexOf('json') !== -1 || /^\s*\{/.test(raw)) {
    try { return JSON.parse(raw); } catch (err) { console.warn('body not JSON: ' + err); }
  }
  return e.parameter || {};
}

function getSheet_() {
  return getOrCreateSheet_(SHEET_NAME, HEADERS);
}

function getInvoiceSheet_() {
  return getOrCreateSheet_(INVOICE_SHEET_NAME, INVOICE_HEADERS);
}

function getOrCreateSheet_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function notify_(data) {
  MailApp.sendEmail({
    to: NOTIFY_TO,
    subject: 'New nsqrai.com lead - ' + (data.name || data.email),
    replyTo: data.email,
    body: [
      'Name:    ' + (data.name || '(not given)'),
      'Email:   ' + data.email,
      'Company: ' + (data.company || '(not given)'),
      '',
      'What they need:',
      data.message || '(none)',
      '',
      'Reply directly to this email to answer them.',
      'Logged to the nsqrai leads sheet - set Status there once you reply.',
    ].join('\n'),
  });
}

/**
 * Flatten and cap a client-supplied string. Newlines and control characters
 * are collapsed to spaces so a value that lands on the invoice (name, company)
 * cannot be used to fake extra lines of "terms" under the billed-to field.
 */
function clean_(v, max) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/[\x00-\x1F\x7F]+/g, ' ')   // control chars incl. CR/LF/TAB
    .replace(/\s+/g, ' ')                  // collapse whitespace runs
    .trim()
    .slice(0, max || 200);
}

/**
 * Like clean_ but KEEPS newlines - for a postal address, which is meaningfully
 * multi-line. Strips every other control character, caps blank runs at one, and
 * trims each line so a client cannot indent junk into the Bill To block.
 */
function cleanMultiline_(v, max) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/\r\n?/g, '\n')
    .replace(/[\x00-\x09\x0B-\x1F\x7F]+/g, ' ')  // controls except \n
    .split('\n')
    .map(function (line) { return line.replace(/\s+/g, ' ').trim(); })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max || 300);
}

/** Net 0 is "due on receipt", not "Net 0 days" - and not a date either. */
function termsLabel_(cfg) {
  return cfg.termsDays === 0 ? 'Due on receipt' : 'Net ' + cfg.termsDays + ' days';
}
function dueLabel_(r, cfg) {
  return cfg.termsDays === 0 ? 'On receipt' : fmtDate_(r.due);
}

/**
 * Build a postal address block from the form's discrete fields.
 * "City, ST 07026" on one line is the US convention; the country line is
 * dropped when it is the US so domestic invoices do not carry a redundant line.
 */
function composeAddress_(data) {
  var l1      = clean_(data.address_line1, 100);
  var l2      = clean_(data.address_line2, 100);
  var city    = clean_(data.city, 60);
  var state   = clean_(data.state, 40);
  var zip     = clean_(data.postal_code, 20);
  var country = clean_(data.country, 60);

  var cityLine = [city, [state, zip].filter(String).join(' ')]
    .filter(String).join(', ');

  var isUS = /^(us|usa|united states.*)$/i.test(country);

  return [l1, l2, cityLine, isUS ? '' : country]
    .filter(String)
    .join('\n')
    // A pre-structured-fields client may still post the old single textarea.
    || cleanMultiline_(data.billing_address, 300);
}

/** Right-pad for the plain-text invoice columns, so they survive a label change. */
function pad_(s, width) {
  s = String(s);
  while (s.length < width) s += ' ';
  return s;
}

/** "$2,500" / "2500.00" / " 2,500 " -> 2500. Returns NaN on junk. */
function parseAmount_(v) {
  if (v === null || v === undefined) return NaN;
  var n = parseFloat(String(v).replace(/[^0-9.]/g, ''));
  return isNaN(n) ? NaN : Math.round(n * 100) / 100;
}

function money_(n) {
  if (isNaN(n)) return '$0.00';
  return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function fmtDate_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'd MMMM yyyy');
}

function esc_(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isEmail_(v) {
  return /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(String(v).trim());
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
