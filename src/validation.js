const mobilePattern = /^[5-9]\d{9}$/;

export function validateForm(form) {
  const values = Object.fromEntries(new FormData(form).entries());
  const errors = {};

  ['fullName', 'designation', 'organisation', 'organisationType', 'state', 'email', 'mobile'].forEach((name) => {
    if (!String(values[name] || '').trim()) errors[name] = 'This field is required.';
  });

  if (values.state === 'Odisha' && !String(values.district || '').trim()) {
    errors.district = 'This field is required.';
  }

  if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
    errors.email = 'Enter a valid email address.';
  }
  if (values.mobile && !mobilePattern.test(values.mobile)) {
    errors.mobile = 'Enter 10 digits starting with 5, 6, 7, 8 or 9.';
  }
  if (values.alternateContact && !mobilePattern.test(values.alternateContact)) {
    errors.alternateContact = 'Enter 10 digits starting with 5, 6, 7, 8 or 9.';
  }
  if (!values.documentationConsent) errors.documentationConsent = 'Please select one consent option.';
  if (values.organisationType === 'Other' && !String(values.otherOrganisationType || '').trim()) {
    errors.otherOrganisationType = 'Please describe the type of organisation.';
  }

  return { values, errors };
}
