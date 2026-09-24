# CINI State Registration

Static, mobile-first registration website for the CINI consultation in association with NASCOM Foundation.

## Run locally

This is a plain static site. Open `index.html` directly, or run `npx serve .` from the project folder and open the URL shown in the terminal.

## Structure

- `index.html` - single-page accessible form and event content
- `src/` - validation, signature capture, API adapter, and styles
- `assets/` - local logo and interface icon assets
- `.github/workflows/deploy.yml` - automatic GitHub Pages deployment

## Save registrations in Google Sheets

The project includes a Google Apps Script receiver in `google-apps-script/Code.gs`. It validates every submission on the server, saves each response as one row, and embeds the signature PNG directly over the row's `Signature` cell. No separate Google Drive file is created. Every row starts with the fixed values `Project Name = E-Governance for PVTGs and Marginalized Communities` and `PMS id = CINIEGOVERN1`. Identical retry requests use the same submission ID, so an interrupted response does not create a duplicate row.

### One-time Google setup

1. Create or open the Google Sheet that should receive registrations.
2. In that Sheet, choose **Extensions > Apps Script**.
3. Replace the editor's `Code.gs` contents with everything from this repository's `google-apps-script/Code.gs`, then save.
4. Select the `setup` function in the Apps Script toolbar and click **Run**. Approve the Sheets permission. This creates and formats a `Registrations` tab.
5. Choose **Deploy > New deployment > Web app**.
6. Set **Execute as** to **Me** and **Who has access** to **Anyone**. Deploy and copy the Web app URL ending in `/exec` (do not use a `/dev` test URL).
7. Open `src/api.js` in this repository and paste that URL between the quotes in `GOOGLE_APPS_SCRIPT_URL`.
8. Publish the website, submit one test registration, and verify that exactly one new row with an embedded signature image appears.

If the Apps Script code is changed later, use **Deploy > Manage deployments**, edit the deployment, select **New version**, and redeploy. The existing `/exec` URL can remain in `src/api.js`.

Do not rename, remove, or reorder the columns in the `Registrations` header row. The receiver stops instead of writing data into the wrong columns. Keep the spreadsheet private because signatures and contact information are personal data.

If you previously used the Drive-file version, replace `Code.gs`, run `setup` again, and deploy a **New version**. Existing Drive links are preserved; new submissions use embedded images. The old signature folder is not deleted automatically.

## GitHub Pages

Create a public GitHub repository, push this project to its `main` branch, and enable **Settings > Pages > GitHub Actions**. The included workflow publishes the site at:

`https://USERNAME.github.io/REPOSITORY-NAME/`

Use the published HTTPS URL, not a local `file://` or `localhost` URL, to create the QR code. GitHub Pages hosts the static form only; it does not store registrations by itself.

The header keeps the CINI and NASCOM Foundation logos in one flex container. Both use proportional sizing at `64px` on desktop and `48px` on mobile, with responsive adjustments for narrow screens.

## Registration storage behavior

The browser sends JSON to the configured Apps Script deployment, then checks the saved submission ID through a read-only status callback before redirecting to `registration-completed.html`. This receipt check avoids showing success merely because a network request was sent. The form retries a temporary failed request once with the same submission ID. Browser validation is repeated by Apps Script, concurrent writes are serialized with a script lock, and spreadsheet-formula prefixes in user input are neutralized.

Until `GOOGLE_APPS_SCRIPT_URL` is configured, the page explicitly reports that details were not stored. Validation or service failures keep the participant on the form and show an error rather than displaying a false success.

No registration data is stored in localStorage, committed to the repository, or placed in URL parameters. Do not commit secrets or `.env` files.
