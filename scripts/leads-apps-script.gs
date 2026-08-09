/**
 * nsqrai.com — lead capture endpoint.
 *
 * Receives contact-form submissions, appends each one as a row in this
 * spreadsheet, and emails you a notification. No API keys, no OAuth, no
 * third-party service. Runs entirely inside your own Google Workspace.
 *
 * SETUP (about 3 minutes):
 *   1. Go to sheets.new and name the sheet "nsqrai leads".
 *   2. Extensions -> Apps Script. Delete the stub code, paste this file.
 *   3. Edit NOTIFY_TO below to the address that should get the alerts.
 *   4. Deploy -> New deployment -> type "Web app".
 *        Execute as:       Me
 *        Who has access:   Anyone
 *      (That combination is required so the public form can POST to it.
 *       The URL is an endpoint, not a credential — it can only append rows
 *       and send you mail. It cannot read your Sheet, Gmail, or Drive.)
 *   5. Authorize when prompted, then copy the /exec Web app URL and send it
 *      to me. I'll wire the site's form to it.
 */

var NOTIFY_TO = 'REPLACE_WITH_YOUR@nsqrai.com';
var SHEET_NAME = 'Leads';
var HONEYPOT_FIELD = 'company_website'; // hidden in the form; bots fill it in

function doPost(e) {
  try {
    var data = parseBody_(e);

    // Silently accept-and-drop spam so bots get no feedback signal.
    if (data[HONEYPOT_FIELD]) {
      return json_({ ok: true });
    }

    if (!data.email || !isEmail_(data.email)) {
      return json_({ ok: false, error: 'A valid email address is required.' });
    }

    var sheet = getSheet_();
    sheet.appendRow([
      new Date(),
      data.name || '',
      data.email,
      data.company || '',
      data.message || '',
      data.source || 'nsqrai.com',
    ]);

    notify_(data);
    return json_({ ok: true });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'Something went wrong. Please email us directly.' });
  }
}

/** Health check — visiting the URL in a browser should show this. */
function doGet() {
  return json_({ ok: true, service: 'nsqrai lead capture' });
}

function parseBody_(e) {
  if (!e || !e.postData) return {};
  var raw = e.postData.contents || '';
  if ((e.postData.type || '').indexOf('application/json') === 0) {
    return JSON.parse(raw);
  }
  return (e.parameter || {}); // form-encoded
}

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['Received', 'Name', 'Email', 'Company', 'Message', 'Source']);
    sheet.getRange('A1:F1').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function notify_(data) {
  if (!NOTIFY_TO || NOTIFY_TO.indexOf('REPLACE_WITH') === 0) return;
  MailApp.sendEmail({
    to: NOTIFY_TO,
    subject: 'New nsqrai.com lead — ' + (data.name || data.email),
    replyTo: data.email,
    body: [
      'Name:    ' + (data.name || '(not given)'),
      'Email:   ' + data.email,
      'Company: ' + (data.company || '(not given)'),
      '',
      'Message:',
      data.message || '(none)',
      '',
      '— logged to the nsqrai leads sheet',
    ].join('\n'),
  });
}

function isEmail_(v) {
  return /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(String(v).trim());
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
