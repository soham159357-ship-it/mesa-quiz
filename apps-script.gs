// Paste this into Extensions > Apps Script in your Google Sheet, then Deploy > Web app.
const SECRET = 'change-this-secret';   // must match SHEET_SECRET on Render

function sheet_(name, header) {
  const ss = SpreadsheetApp.getActive();
  let s = ss.getSheetByName(name);
  if (!s) { s = ss.insertSheet(name); s.appendRow(header); }
  return s;
}
const RES_HEADER = ['Time', 'Team', 'Round', 'Question', 'Selected', 'Correct', 'Points', 'TeamIdx', 'Choice'];

function doPost(e) {
  const d = JSON.parse(e.postData.contents);
  if (d.secret !== SECRET) return out_({ error: 'auth' });
  if (d.action === 'result') sheet_('Results', RES_HEADER).appendRow(d.row);
  if (d.action === 'config') sheet_('Config', ['json']).getRange('A2').setValue(d.json);
  if (d.action === 'reset') { const s = sheet_('Results', RES_HEADER); if (s.getLastRow() > 1) s.deleteRows(2, s.getLastRow() - 1); }
  return out_({ ok: true });
}

function doGet(e) {
  if (e.parameter.secret !== SECRET) return out_({ error: 'auth' });
  const cfg = sheet_('Config', ['json']).getRange('A2').getValue();
  const r = sheet_('Results', RES_HEADER);
  const rows = r.getLastRow() > 1 ? r.getRange(2, 1, r.getLastRow() - 1, 9).getValues() : [];
  return out_({ config: cfg || null, results: rows.map(x => [x[0] instanceof Date ? x[0].toISOString() : x[0], ...x.slice(1)]) });
}
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
