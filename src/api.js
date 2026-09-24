// Paste the /exec URL from the Google Apps Script deployment here after
// following the setup steps in README.md. This URL is an endpoint, not a
// password, and is expected to be visible in the browser.
const GOOGLE_APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbzFB8Q1JgFlZOeIeylTUI8pbDZabzVujKHFrSasO7WlFFz-6Dl0RytpK4FyFa716hQD/exec";

const REQUEST_TIMEOUT_MS = 45000;
const MAX_ATTEMPTS = 2;
const STATUS_CHECKS_PER_ATTEMPT = 3;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function send(payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    // text/plain is intentional: it keeps this a CORS-simple request while the
    // Apps Script handler still receives a JSON body in e.postData.contents.
    await fetch(GOOGLE_APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify(payload),
      redirect: "follow",
      mode: "no-cors",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function checkReceipt(submissionId) {
  return new Promise((resolve, reject) => {
    const callbackName = `__registrationStatus_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const url = new URL(GOOGLE_APPS_SCRIPT_URL);
    url.searchParams.set("action", "status");
    url.searchParams.set("submissionId", submissionId);
    url.searchParams.set("callback", callbackName);
    url.searchParams.set("_", Date.now().toString());

    let finished = false;
    const cleanup = () => {
      delete globalThis[callbackName];
      script.remove();
    };
    const finish = (handler, value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      cleanup();
      handler(value);
    };
    const timeout = setTimeout(
      () =>
        finish(
          reject,
          new Error(
            "The registration service did not confirm the save in time.",
          ),
        ),
      20000,
    );

    globalThis[callbackName] = (data) => finish(resolve, data);
    script.onerror = () =>
      finish(
        reject,
        new Error("The registration service could not be reached."),
      );
    script.src = url.toString();
    document.head.append(script);
  });
}

export async function submitRegistration(payload) {
  if (!GOOGLE_APPS_SCRIPT_URL.trim()) {
    return { connected: false };
  }

  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await send(payload);
    } catch (error) {
      lastError = error;
    }

    for (
      let statusAttempt = 1;
      statusAttempt <= STATUS_CHECKS_PER_ATTEMPT;
      statusAttempt += 1
    ) {
      await delay(500 * statusAttempt);
      try {
        const data = await checkReceipt(payload.submissionId);
        if (!data.ok)
          throw new Error(data.message || "Registration could not be saved.");
        if (data.found) return { connected: true, data };
      } catch (error) {
        lastError = error;
      }
    }

    if (attempt < MAX_ATTEMPTS) await delay(1000 * attempt);
  }

  throw (
    lastError ||
    new Error(
      "Unable to confirm that the registration was saved. Please try again.",
    )
  );
}
