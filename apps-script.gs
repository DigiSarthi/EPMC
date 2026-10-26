// Paste this in Google Sheet > Extensions > Apps Script, then Deploy > New deployment > Web app
// Execute as: Me | Who has access: Anyone
function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["Time","Name","Gender","Phone","Email","District","Qualification",
                     "Experience","Odia","English","Hindi","Has smartphone+internet","Joining date"]);
  }
  var p = e.parameter;
  sheet.appendRow([new Date(), p.name, p.gender, p.phone, p.email, p.city, p.qualification,
                   p.experience, p.odia, p.english, p.hindi, p.device, p.joining]);
  return ContentService.createTextOutput("ok");
}
