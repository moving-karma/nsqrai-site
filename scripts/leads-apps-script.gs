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
var CARD_LIMIT   = 10000;                  // Stripe per-transaction ceiling, USD
var MAX_INVOICE  = 1000000;                // sanity bound on the amount field

var STATUSES = ['New', 'Replied', 'Qualified', 'Proposal sent', 'Won', 'Lost', 'Spam'];
var HEADERS  = ['Received', 'Name', 'Email', 'Company', 'What they need',
                'Status', 'Replied On', 'Days Waiting', 'Reason / Notes',
                'Next Follow-up', 'Source'];

var INVOICE_STATUSES = ['Sent', 'Paid', 'Part paid', 'Overdue', 'Void'];
var INVOICE_HEADERS  = ['Issued', 'Invoice No', 'Name', 'Email', 'Company',
                        'Amount (USD)', 'Due', 'Status', 'Paid On', 'Method',
                        'Notes', 'Source'];

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
    termsDays:     parseInt(p.getProperty('PAYMENT_TERMS_DAYS'), 10) || 14,
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
    name: data.name || '',
    email: data.email,
    company: data.company || '',
    note: data.message || '',
    source: data.source || 'nsqrai.com',
  };

  emailInvoice_(record, cfg);

  var sheet = getInvoiceSheet_();
  sheet.appendRow([
    issued, invoiceNo, record.name, record.email, record.company,
    amount, due, 'Sent', '', 'Bank transfer', record.note, record.source,
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
    'NSQR AI - AI infrastructure design & specification',
    '',
    'Amount due:  ' + money_(r.amount),
    'Issued:      ' + fmtDate_(r.issued),
    'Due:         ' + fmtDate_(r.due),
    r.company ? 'Billed to:   ' + r.company : 'Billed to:   ' + r.name,
    '',
    'PAY BY BANK TRANSFER / ACH',
    '  Account name:    ' + cfg.accountName,
    '  Bank:            ' + cfg.bankName,
    '  Account number:  ' + cfg.accountNumber,
    '  Routing number:  ' + cfg.routingNumber,
    '  Account type:    ' + cfg.accountType,
    '  REFERENCE:       ' + r.invoiceNo + '   <- include this',
    '',
    'The reference is how the payment gets matched to you. Without it,',
    'reconciliation is manual and slower.',
    '',
    r.amount <= CARD_LIMIT
      ? 'Prefer to pay by card? ' + STRIPE_LINK + ' (a processing fee applies)'
      : 'This amount is above the card limit, so bank transfer is the way to pay it.',
    '',
    'This deposit is held as credit on your account and drawn down by the work',
    'invoiced against it. Unused credit is refundable.',
    '',
    r.note ? 'Your note: ' + r.note : '',
    '',
    'Questions: billing@nsqrai.com',
    cfg.address ? 'NSQR AI, ' + cfg.address : 'NSQR AI',
  ].filter(function (l) { return l !== ''; }).join('\n');

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

    '<div style="border-bottom:2px solid #0f172a;padding-bottom:16px;margin-bottom:26px">',
    '<div style="font-size:19px;font-weight:700;letter-spacing:-.02em">NSQR AI</div>',
    '<div style="font-size:12px;color:#64748b">AI infrastructure design &amp; specification</div>',
    '</div>',

    '<div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#0d9488;font-weight:700">Invoice</div>',
    '<div style="font-size:26px;font-weight:700;letter-spacing:-.02em;margin:2px 0 22px">', esc_(r.invoiceNo), '</div>',

    '<table style="border-collapse:collapse;margin-bottom:26px">',
    row('Amount due', money_(r.amount), true),
    row('Issued', fmtDate_(r.issued)),
    row('Due', fmtDate_(r.due)),
    row('Billed to', r.company || r.name || r.email),
    '</table>',

    '<div style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:10px;padding:20px 22px;margin-bottom:22px">',
    '<div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#0f766e;font-weight:700;margin-bottom:12px">',
    'Pay by bank transfer / ACH</div>',
    '<table style="border-collapse:collapse">',
    row('Account name', cfg.accountName),
    row('Bank', cfg.bankName),
    row('Account number', cfg.accountNumber, true),
    row('Routing number', cfg.routingNumber, true),
    row('Account type', cfg.accountType),
    row('Reference', r.invoiceNo, true),
    '</table>',
    '<div style="font-size:13px;color:#0f766e;margin-top:14px">',
    'Please put <strong>', esc_(r.invoiceNo), '</strong> in the payment reference — that is how it gets matched to you.',
    '</div>',
    '</div>',

    r.amount <= CARD_LIMIT
      ? '<div style="font-size:13px;color:#475569;margin-bottom:22px">Prefer to pay by card? ' +
        '<a href="' + STRIPE_LINK + '" style="color:#0d9488">Pay online instead</a>' +
        ' — a card processing fee applies, which is why bank transfer is preferred.</div>'
      : '<div style="font-size:13px;color:#475569;margin-bottom:22px">This amount is above the online card limit, ' +
        'so bank transfer is the way to settle it.</div>',

    r.note
      ? '<div style="border-left:3px solid #e2e8f0;padding:2px 0 2px 14px;margin-bottom:22px;font-size:13px;color:#475569">' +
        '<div style="color:#94a3b8;font-size:11px;letter-spacing:.1em;text-transform:uppercase;margin-bottom:4px">Your note</div>' +
        esc_(r.note) + '</div>'
      : '',

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
      'Note:    ' + (r.note || '(none)'),
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
