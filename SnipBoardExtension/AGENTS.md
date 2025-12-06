# Repository Guidelines

## Project Structure & Module Organization
- `manifest.json` declares the Chrome extension metadata, permissions, and content script wiring.
- `content.js` injects into ChatGPT pages and exposes the selected messages API consumed by the popup.
- `popup.html` + `popup.js` implement the UI that polls for the current selection, assembles clip data, and posts to the local SnipBoard service.
- Keep future assets, styles, or helper scripts in the root and import them from `popup.html`/`content.js` so the manifest stays consistent.

## Build, Test, and Development Commands
- **Load extension**: go to `chrome://extensions`, enable Developer mode, hit *Load unpacked*, and select this directory.
- **Iterate popup**: edit `popup.js`/`popup.html`, refresh the extension, and click the toolbar action to see the updated UI.
- **Verify backend**: run the SnipBoard server locally (default `http://127.0.0.1:4050`). Ensure it accepts the `/add-clip` payload structure the popup sends.
- There is no automated build; all files are plain JS/HTML and deploy as-is.

## Coding Style & Naming Conventions
- Use 2-space indentation, consistent semicolons, and short descriptive names (`getSelectedMessages`, `sectionSelect`).
- Keep DOM IDs and CSS hooks lowercase with camelCase (`titleInput`, `saveBtn`).
- Favor `const`/`let` over `var` and prefer async/await over chained callbacks for readability.
- Log actionable warnings (`console.warn("[SnipBoard] ...")`) when handling runtime errors.

## Testing Guidelines
- Regression testing is manual: select messages on `https://chat.openai.com`, hit the extension button, and confirm clips appear in SnipBoard.
- Watch `popup.js` console for fetch errors or validation messages.
- If adding logic, include a short manual checklist in a PR to cover key user flows (selection, title generation, POST payload).

## Commit & Pull Request Guidelines
- Commits should be concise, imperative, and scoped to one behavior (`Add fetch retry for selection`, `Document popup fields`).
- PRs should explain what changed, why, and how to test (loading the extension, local SnipBoard endpoint, sample messages). Provide screenshots when UI wording or flow adjusts.

## Security & Configuration Tips
- The extension talks to `localhost:4050`; keep that service behind the user’s firewall and do not expose it publicly.
- Host permissions in `manifest.json` are limited to ChatGPT domains plus the local endpoint; expand them only when necessary and record the reason.
