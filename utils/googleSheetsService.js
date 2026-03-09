const { google } = require('googleapis');
const path = require('path');
const Logger = require('./logger');

const serviceAccountPath = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_PATH;
const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
const sheetName = process.env.GOOGLE_SHEET_NAME || 'Activity Logs';

let sheets = null;

if (serviceAccountPath && spreadsheetId && spreadsheetId !== 'YOUR_SPREADSHEET_ID_HERE') {
    try {
        const auth = new google.auth.GoogleAuth({
            keyFile: serviceAccountPath,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        sheets = google.sheets({ version: 'v4', auth });
        console.log('✅ [GOOGLE_SHEETS] service initialized successfully');
    } catch (error) {
        console.error('❌ [GOOGLE_SHEETS] Initialization error:', error.message);
    }
}

/**
 * Append a row to the Google Sheet
 * @param {Array} values - Array of values to append as a row
 * @param {string} targetSheet - Optional specific sheet name
 */
const appendRow = async (values, targetSheet = null) => {
    if (!sheets) {
        return null;
    }

    try {
        const finalSheet = targetSheet || sheetName;
        const response = await sheets.spreadsheets.values.append({
            spreadsheetId: spreadsheetId,
            range: `${finalSheet}!A:Z`,
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            resource: {
                values: [values],
            },
        });
        return response.data;
    } catch (error) {
        console.error(`❌ [GOOGLE_SHEETS] Append error on ${targetSheet || sheetName}:`, error.message);
        return null;
    }
};

module.exports = {
    appendRow
};
