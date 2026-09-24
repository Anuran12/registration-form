const SETTINGS = Object.freeze({
  sheetName: 'Registrations',
  projectName: 'E-Governance for PVTGs and Marginalized Communities',
  pmsId: 'CINIEGOVERN1',
  spreadsheetProperty: 'REGISTRATION_SPREADSHEET_ID',
  submissionIdColumn: 3,
  referenceIdColumn: 4,
  signatureColumn: 19,
  signatureWidth: 180,
  signatureHeight: 45,
});

const HEADERS = Object.freeze([
  'Project Name',
  'PMS id',
  'Submission ID',
  'Reference ID',
  'Received At',
  'Submitted At',
  'Full Name',
  'Designation',
  'Organisation/Department',
  'Organisation Type',
  'Other Organisation Type',
  'State',
  'District',
  'Block',
  'Email',
  'Mobile',
  'Alternate Contact',
  'Documentation Consent',
  'Signature',
]);

const ORGANISATION_TYPES = Object.freeze([
  'Government Department',
  'District Administration',
  'PRI / Local Government',
  'NGO / CSO',
  'Community-Based Organisation',
  'Academic / Research Institution',
  'Corporate / Private Sector',
  'Development Partner / Foundation',
  'Media',
  'Other',
]);

const STATES = Object.freeze([
  'Odisha',
  'Jharkhand',
  'Delhi',
  'West Bengal',
  'Asham',
]);

const DISTRICT_BLOCKS = Object.freeze({
  Keonjhar: ['Banspal', 'Harichandanpur'],
  Dhenkanal: ['Kankadahad'],
  Raygada: ['Muniguda'],
  Nuapada: ['Komna'],
  Gajapati: ['Guma'],
});

const CONSENT_OPTIONS = Object.freeze([
  'I consent to photographs/videos/audio recordings of me being taken during the event for documentation, reporting and communication related to the programme.',
  'I do not wish to be photographed/video recorded.',
]);

/**
 * Run this once from a script bound to the destination Google Sheet.
 * It creates the response tab and remembers its spreadsheet ID so doPost can
 * find it when running as a web app.
 */
function setup() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error('Open the Apps Script project from the destination Google Sheet, then run setup again.');
  }

  PropertiesService.getScriptProperties().setProperty(
    SETTINGS.spreadsheetProperty,
    spreadsheet.getId(),
  );

  const sheet = getOrCreateSheet_(spreadsheet);
  migrateLegacySheet_(sheet);
  prepareSheet_(sheet);
  SpreadsheetApp.getUi().alert(
    'Setup complete',
    `Responses and signature images will be written directly to "${SETTINGS.sheetName}".`,
    SpreadsheetApp.getUi().ButtonSet.OK,
  );
}

function doGet(event) {
  if (!event || !event.parameter || event.parameter.action !== 'status') {
    return json_({ ok: true, service: 'CINI registration receiver' });
  }

  const callback = String(event.parameter.callback || '');
  const submissionId = String(event.parameter.submissionId || '');
  if (!/^[A-Za-z_$][0-9A-Za-z_$]{0,100}$/.test(callback)) {
    return json_({ ok: false, message: 'Invalid callback.' });
  }

  let result;
  let statusLock = null;
  try {
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(submissionId)) {
      throw new Error('The submission ID is invalid.');
    }
    statusLock = LockService.getScriptLock();
    statusLock.waitLock(10000);
    const spreadsheetId = PropertiesService.getScriptProperties().getProperty(SETTINGS.spreadsheetProperty);
    if (!spreadsheetId) throw new Error('The registration service has not been set up yet.');

    const sheet = getOrCreateSheet_(SpreadsheetApp.openById(spreadsheetId));
    verifyHeaders_(sheet);
    const row = findSubmission_(sheet, submissionId);
    result = row
      ? { ok: true, found: true, referenceId: String(sheet.getRange(row, SETTINGS.referenceIdColumn).getDisplayValue()) }
      : { ok: true, found: false };
  } catch (error) {
    console.error(error);
    result = { ok: false, found: false, message: error.message || 'Unable to check the registration.' };
  } finally {
    if (statusLock && statusLock.hasLock()) statusLock.releaseLock();
  }

  return javascript_(callback, result);
}

function doPost(event) {
  try {
    const payload = parsePayload_(event);
    const registration = validatePayload_(payload);
    return json_(saveRegistration_(registration));
  } catch (error) {
    console.error(error);
    return json_({
      ok: false,
      message: error && error.message ? error.message : 'Registration could not be saved.',
    });
  }
}

function parsePayload_(event) {
  const body = event && event.postData && event.postData.contents;
  if (!body) throw new Error('The request body is empty.');
  if (body.length > 3000000) throw new Error('The submitted signature is too large. Please clear it and sign again.');

  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error('The request body is not valid JSON.');
  }
}

function validatePayload_(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('The registration data is invalid.');
  }
  if (string_(payload.website, 200)) {
    throw new Error('The registration could not be accepted.');
  }

  const registration = {
    submissionId: requiredString_(payload.submissionId, 'Submission ID', 100),
    submittedAt: requiredString_(payload.submittedAt, 'Submission time', 40),
    fullName: requiredString_(payload.fullName, 'Full name', 120),
    designation: requiredString_(payload.designation, 'Designation', 120),
    organisation: requiredString_(payload.organisation, 'Organisation', 200),
    organisationType: requiredString_(payload.organisationType, 'Organisation type', 100),
    otherOrganisationType: string_(payload.otherOrganisationType, 120),
    state: requiredString_(payload.state, 'State', 50),
    district: string_(payload.district, 50),
    block: string_(payload.block, 80),
    email: requiredString_(payload.email, 'Email', 254).toLowerCase(),
    mobile: requiredString_(payload.mobile, 'Mobile number', 10),
    alternateContact: string_(payload.alternateContact, 10),
    documentationConsent: requiredString_(payload.documentationConsent, 'Documentation consent', 300),
    digitalSignature: requiredString_(payload.digitalSignature, 'Digital signature', 2800000),
  };

  if (!/^[A-Za-z0-9_-]{20,100}$/.test(registration.submissionId)) {
    throw new Error('The submission ID is invalid. Please reload the form and try again.');
  }
  if (isNaN(new Date(registration.submittedAt).getTime())) {
    throw new Error('The submission time is invalid.');
  }
  if (ORGANISATION_TYPES.indexOf(registration.organisationType) === -1) {
    throw new Error('Select a valid organisation type.');
  }
  if (registration.organisationType === 'Other' && !registration.otherOrganisationType) {
    throw new Error('Please describe the type of organisation.');
  }
  if (STATES.indexOf(registration.state) === -1) {
    throw new Error('Select a valid state.');
  }
  if (registration.state === 'Odisha') {
    if (!Object.prototype.hasOwnProperty.call(DISTRICT_BLOCKS, registration.district)) {
      throw new Error('Select a valid district.');
    }
    if (registration.block && DISTRICT_BLOCKS[registration.district].indexOf(registration.block) === -1) {
      throw new Error('Select a valid block for the district.');
    }
  } else {
    registration.district = '';
    registration.block = '';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(registration.email)) {
    throw new Error('Enter a valid email address.');
  }
  if (!/^[5-9]\d{9}$/.test(registration.mobile)) {
    throw new Error('Enter a valid 10-digit mobile number.');
  }
  if (registration.alternateContact && !/^[5-9]\d{9}$/.test(registration.alternateContact)) {
    throw new Error('Enter a valid alternate contact number.');
  }
  if (CONSENT_OPTIONS.indexOf(registration.documentationConsent) === -1) {
    throw new Error('Select a valid documentation consent option.');
  }
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=\r\n]+$/.test(registration.digitalSignature)) {
    throw new Error('The digital signature is invalid. Please clear it and sign again.');
  }

  return registration;
}

function saveRegistration_(registration) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  let sheet = null;
  let signatureImage = null;
  let targetRow = 0;
  let rowWritten = false;

  try {
    const properties = PropertiesService.getScriptProperties();
    const spreadsheetId = properties.getProperty(SETTINGS.spreadsheetProperty);
    if (!spreadsheetId) {
      throw new Error('The registration service has not been set up yet.');
    }

    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    sheet = getOrCreateSheet_(spreadsheet);
    verifyHeaders_(sheet);

    const duplicateRow = findSubmission_(sheet, registration.submissionId);
    if (duplicateRow) {
      return {
        ok: true,
        duplicate: true,
        referenceId: String(sheet.getRange(duplicateRow, SETTINGS.referenceIdColumn).getDisplayValue()),
      };
    }

    const receivedAt = new Date();
    const referenceId = createReferenceId_(receivedAt, registration.submissionId);
    targetRow = sheet.getLastRow() + 1;
    const signatureBlob = signatureBlob_(registration);
    const row = [
      SETTINGS.projectName,
      SETTINGS.pmsId,
      registration.submissionId,
      referenceId,
      receivedAt,
      new Date(registration.submittedAt),
      registration.fullName,
      registration.designation,
      registration.organisation,
      registration.organisationType,
      registration.organisationType === 'Other' ? registration.otherOrganisationType : '',
      registration.state,
      registration.district,
      registration.block,
      registration.email,
      registration.mobile,
      registration.alternateContact,
      registration.documentationConsent,
      '',
    ].map(safeCell_);

    // Insert the image before exposing the submission ID in the row. If image
    // insertion fails, the receipt endpoint can never report a partial save.
    signatureImage = sheet
      .insertImage(signatureBlob, SETTINGS.signatureColumn, targetRow, 5, 5)
      .setWidth(SETTINGS.signatureWidth)
      .setHeight(SETTINGS.signatureHeight)
      .setAltTextTitle(`Signature - ${referenceId}`)
      .setAltTextDescription(`Digital signature for registration ${referenceId}`);
    sheet.setRowHeight(targetRow, SETTINGS.signatureHeight + 10);
    sheet.getRange(targetRow, 1, 1, row.length).setValues([row]);
    rowWritten = true;
    SpreadsheetApp.flush();
    return { ok: true, duplicate: false, referenceId };
  } catch (error) {
    if (signatureImage) {
      try {
        signatureImage.remove();
      } catch (cleanupError) {
        console.error(cleanupError);
      }
    }
    if (rowWritten && targetRow && sheet) {
      try {
        sheet.getRange(targetRow, 1, 1, HEADERS.length).clearContent();
      } catch (cleanupError) {
        console.error(cleanupError);
      }
    }
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function signatureBlob_(registration) {
  const encoded = registration.digitalSignature.replace(/^data:image\/png;base64,/, '');
  let bytes;
  try {
    bytes = Utilities.base64Decode(encoded);
  } catch (error) {
    throw new Error('The digital signature could not be decoded. Please clear it and sign again.');
  }
  if (!bytes.length) throw new Error('The digital signature is empty.');
  if (bytes.length > 2 * 1024 * 1024) {
    throw new Error('The digital signature is too large. Please clear it and sign again.');
  }

  const name = `signature-${registration.submissionId}.png`;
  return Utilities.newBlob(bytes, 'image/png', name);
}

function getOrCreateSheet_(spreadsheet) {
  return spreadsheet.getSheetByName(SETTINGS.sheetName) || spreadsheet.insertSheet(SETTINGS.sheetName);
}

function prepareSheet_(sheet) {
  if (sheet.getLastRow() > 0 && sheet.getLastColumn() > 0) verifyHeaders_(sheet);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#6a3029').setFontColor('#ffffff');
  sheet.getRange('E:F').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  sheet.autoResizeColumns(1, HEADERS.length);
  sheet.setColumnWidth(SETTINGS.signatureColumn, SETTINGS.signatureWidth + 10);
}

function migrateLegacySheet_(sheet) {
  if (sheet.getLastRow() === 0) return;

  // Older versions began with Submission ID. Insert the two fixed project
  // columns so existing rows, formulas and over-grid signatures shift safely.
  if (sheet.getRange(1, 1).getDisplayValue() === 'Submission ID') {
    sheet.insertColumnsBefore(1, 2);
    sheet.getRange(1, 1, 1, 2).setValues([HEADERS.slice(0, 2)]);
  }

  const signatureHeader = sheet.getRange(1, SETTINGS.signatureColumn).getDisplayValue();
  if (signatureHeader === 'Signature File') {
    sheet.getRange(1, SETTINGS.signatureColumn).setValue('Signature');
  }

  const responseCount = sheet.getLastRow() - 1;
  if (responseCount > 0) {
    const projectValues = Array.from(
      { length: responseCount },
      () => [SETTINGS.projectName, SETTINGS.pmsId],
    );
    sheet.getRange(2, 1, responseCount, 2).setValues(projectValues);
  }
}

function verifyHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    prepareSheet_(sheet);
    return;
  }
  const actual = sheet.getRange(1, 1, 1, HEADERS.length).getDisplayValues()[0];
  if (actual.join('\u001f') !== HEADERS.join('\u001f')) {
    throw new Error(`The "${SETTINGS.sheetName}" header row was changed. Restore it or run setup with a new response sheet.`);
  }
}

function findSubmission_(sheet, submissionId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const match = sheet
    .getRange(2, SETTINGS.submissionIdColumn, lastRow - 1, 1)
    .createTextFinder(submissionId)
    .matchEntireCell(true)
    .findNext();
  return match ? match.getRow() : 0;
}

function createReferenceId_(date, submissionId) {
  const day = Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyyMMdd');
  const suffix = submissionId.replace(/[^A-Za-z0-9]/g, '').slice(-8).toUpperCase();
  return `CINI-${day}-${suffix}`;
}

function requiredString_(value, label, maxLength) {
  const result = string_(value, maxLength);
  if (!result) throw new Error(`${label} is required.`);
  return result;
}

function string_(value, maxLength) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new Error('A submitted field has an invalid value.');
  const result = value.trim();
  if (result.length > maxLength) throw new Error('A submitted field is too long.');
  return result;
}

function safeCell_(value) {
  if (value instanceof Date) return value;
  const text = String(value === undefined || value === null ? '' : value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function json_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function javascript_(callback, value) {
  return ContentService
    .createTextOutput(`${callback}(${JSON.stringify(value)});`)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
