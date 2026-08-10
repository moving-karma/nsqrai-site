/**
 * nsqrai.com — lead capture + lightweight CRM.
 *
 * Receives contact-form submissions, appends them to a Google Sheet set up as a
 * simple pipeline tracker, and emails info@nsqrai.com. Runs entirely inside your
 * own Google Workspace: no API keys, no OAuth, no third-party service.
 *
 * SETUP (about 4 minutes)
 *   1. sheets.new  →  name it "nsqrai leads"
 *   2. Extensions → Apps Script. Delete the stub, paste this whole file, Save.
 *   3. Run  ▶ setupSheet  once. Approve the permission prompt when asked.
 *      (That builds the headers, the Status dropdown and the colour rules.)
 *   4. Deploy → New deployment → type "Web app"
 *          Execute as:     Me
 *          Who has access: Anyone
 *      Anyone is required so the public form can POST. The URL only appends rows
 *      and emails you — it cannot read your Sheet, Gmail or Drive.
 *   5. Copy the /exec URL and send it to me. I'll wire the site to it.
 *
 * HOW TO WORK THE PIPELINE
 *   Change Status and everything else follows automatically:
 *     • set it to Replied  → "Replied On" stamps itself with today's date
 *     • set it to anything → "Days Waiting" stops counting
 *   Use "Reason / Notes" for why they got in touch and what you agreed.
 */

// ---------------------------------------------------------------- config
var NOTIFY_TO   = 'info@nsqrai.com';
var SHEET_NAME  = 'Leads';
var HONEYPOT    = 'company_website';   // hidden in the form; bots fill it in
var STATUSES    = ['New', 'Replied', 'Qualified', 'Proposal sent', 'Won', 'Lost', 'Spam'];
var HEADERS     = ['Received', 'Name', 'Email', 'Company', 'What they need',
                   'Status', 'Replied On', 'Days Waiting', 'Reason / Notes',
                   'Next Follow-up', 'Source'];

// ---------------------------------------------------------------- web endpoint
function doPost(e) {
  try {
    var data = parseBody_(e);

    // Silently accept-and-drop spam so bots get no feedback signal.
    if (data[HONEYPOT]) return json_({ ok: true });

    if (!data.email || !isEmail_(data.email)) {
      return json_({ ok: false, error: 'A valid email address is required.' });
    }

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
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'Something went wrong. Please email us directly.' });
  }
}

/** Health check — opening the URL in a browser should show this. */
function doGet() {
  return json_({ ok: true, service: 'nsqrai lead capture' });
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

  SpreadsheetApp.getActive().toast('Sheet ready. Now deploy as a Web app.', 'nsqrai', 8);
}

/** Stamps "Replied On" the moment Status becomes Replied. Installed automatically. */
function onEdit(e) {
  if (!e || !e.range) return;
  var sheet = e.range.getSheet();
  if (sheet.getName() !== SHEET_NAME) return;
  if (e.range.getColumn() !== 6 || e.range.getRow() < 2) return;

  var stamped = sheet.getRange(e.range.getRow(), 7);
  if (e.value === 'Replied' && !stamped.getValue()) {
    stamped.setValue(new Date());
  }
}

// ---------------------------------------------------------------- helpers
function parseBody_(e) {
  if (!e || !e.postData) return {};
  if ((e.postData.type || '').indexOf('application/json') === 0) {
    return JSON.parse(e.postData.contents || '{}');
  }
  return e.parameter || {};
}

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function notify_(data) {
  MailApp.sendEmail({
    to: NOTIFY_TO,
    subject: 'New nsqrai.com lead — ' + (data.name || data.email),
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
      'Logged to the nsqrai leads sheet — set Status there once you reply.',
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
