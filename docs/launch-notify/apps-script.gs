// Google Apps Script for the order-launch sign-up sheet (no database: rows land in the owner's Google Sheet).
// Setup: open the sheet → Extensions → Apps Script → paste this → Deploy → New deployment → Web app
// (Execute as: Me, Who has access: Anyone) → copy the /exec URL into VITE_NOTIFY_URL (Vercel + .env.local).
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function doPost(e) {
  let d = {}
  try {
    d = JSON.parse((e.postData && e.postData.contents) || '{}')
  } catch (err) {
    return ContentService.createTextOutput('bad')
  }
  const email = String(d.email || '').trim().slice(0, 200)
  if (!EMAIL.test(email)) return ContentService.createTextOutput('bad')
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0]
  if (sheet.getLastRow() === 0) sheet.appendRow(['signed up (KST)', 'email', 'what', 'page'])
  sheet.appendRow([new Date(), email, String(d.what || '').slice(0, 60), String(d.page || '').slice(0, 200)])
  return ContentService.createTextOutput('ok')
}
