import { submitRegistration } from './api.js';
import { validateForm } from './validation.js';
import { setupSignature } from './signature.js';

const districtBlocks = {
  Keonjhar: ['Banspal', 'Harichandanpur'],
  Dhenkanal: ['Kankadahad'],
  Raygada: ['Muniguda'],
  Nuapada: ['Komna'],
  Gajapati: ['Guma'],
};

const form = document.querySelector('#registration-form');
const state = document.querySelector('#state');
const districtField = document.querySelector('#district-field');
const district = document.querySelector('#district');
const blockField = document.querySelector('#block-field');
const block = document.querySelector('#block');
const organisationType = document.querySelector('#organisationType');
const otherOrganisationField = document.querySelector('#other-organisation-field');
const otherOrganisationType = document.querySelector('#otherOrganisationType');
const statusMessage = document.querySelector('#status-message');
const submitButton = document.querySelector('#submit-button');
let pendingSubmission = null;
const signature = setupSignature(
  document.querySelector('#signature-canvas'),
  document.querySelector('#clear-signature'),
  document.querySelector('#signature-placeholder'),
);

function showErrors(errors) {
  document.querySelectorAll('.field-error').forEach((element) => { element.textContent = ''; });
  document.querySelectorAll('[aria-invalid="true"]').forEach((element) => element.removeAttribute('aria-invalid'));
  Object.entries(errors).forEach(([name, message]) => {
    const error = document.querySelector(`#${name}-error`);
    const input = document.querySelector(`[name="${name}"]`);
    if (error) error.textContent = message;
    if (input) input.setAttribute('aria-invalid', 'true');
  });
}

function syncOtherOrganisationField() {
  const isOther = organisationType.value === 'Other';
  otherOrganisationField.hidden = !isOther;
  otherOrganisationType.disabled = !isOther;
  if (!isOther) otherOrganisationType.value = '';
}

organisationType.addEventListener('change', syncOtherOrganisationField);
syncOtherOrganisationField();

function syncBlockOptions() {
  const options = districtBlocks[district.value] || [];
  block.innerHTML = '<option value="">Select block</option>';
  options.forEach((name) => block.add(new Option(name, name)));
  block.disabled = options.length === 0;
}

function syncStateFields() {
  const isOdisha = state.value === 'Odisha';
  districtField.hidden = !isOdisha;
  blockField.hidden = !isOdisha;
  district.disabled = !isOdisha;

  if (!isOdisha) {
    district.value = '';
    block.value = '';
    block.disabled = true;
    document.querySelector('#district-error').textContent = '';
    district.removeAttribute('aria-invalid');
  }

  syncBlockOptions();
}

state.addEventListener('change', syncStateFields);
district.addEventListener('change', syncBlockOptions);
syncStateFields();

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  statusMessage.className = 'status-message';
  statusMessage.textContent = '';
  const { values, errors } = validateForm(form);
  if (!signature.hasSignature()) errors.signature = 'A digital signature is required.';
  showErrors(errors);
  if (Object.keys(errors).length) {
    const firstError = document.querySelector('[aria-invalid="true"]') || document.querySelector('#signature-canvas');
    firstError.focus?.();
    return;
  }

  submitButton.disabled = true;
  submitButton.classList.add('is-loading');
  submitButton.querySelector('span').textContent = 'Submitting Registration...';
  const responseData = { ...values, digitalSignature: signature.dataUrl() };
  const responseFingerprint = JSON.stringify(responseData);

  // Reuse the same ID when retrying unchanged data. If the first request was
  // saved but its response was interrupted, the server can safely return the
  // existing registration instead of creating a duplicate row.
  if (!pendingSubmission || pendingSubmission.fingerprint !== responseFingerprint) {
    const fallbackId = `registration-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    pendingSubmission = {
      fingerprint: responseFingerprint,
      submissionId: globalThis.crypto?.randomUUID?.() || fallbackId,
      submittedAt: new Date().toISOString(),
    };
  }

  const payload = {
    ...responseData,
    submissionId: pendingSubmission.submissionId,
    submittedAt: pendingSubmission.submittedAt,
  };

  try {
    const result = await submitRegistration(payload);
    if (!result.connected) {
      statusMessage.className = 'status-message status-info';
      statusMessage.innerHTML = '<strong>Registration service is being connected.</strong><span>Your details have not been stored. Please contact the event team for submission support.</span>';
      return;
    }
    pendingSubmission = null;
    window.location.assign('registration-completed.html');
  } catch (error) {
    console.error(error);
    statusMessage.className = 'status-message status-error';
    statusMessage.textContent = error instanceof Error && error.message
      ? error.message
      : 'Unable to submit registration. Please try again.';
  } finally {
    submitButton.disabled = false;
    submitButton.classList.remove('is-loading');
    submitButton.querySelector('span').textContent = 'Submit Registration';
  }
});
