# Repository Guidelines

## Project Structure & Module Organization
- `main.js` is the Electron entry point: it sets up IPC, data persistence under `%APPDATA%\SnipBoard`, the screenshot folder, and the lightweight HTTP API on `127.0.0.1:4050`.
- `preload.js` bridges `ipcRenderer` safely into renderer code with `window.snipboard`/`SnipBoardAPI`.
- UI assets live in `renderer/`: `index.html` wires buttons and layout, `renderer.js` orchestrates sections, clips, and screenshots, and `styles.css` contains the shared BEM-ish utilities for lists, cards, and modals.
- Keep business logic in `main.js`/`renderer.js`, keep styles declarative, and avoid scattering logic across third-party directories (no extra folders yet).

## Build, Test, and Development Commands
- `npm install` – install `electron` and runtime dependencies (`electron-store`, `uuid`).
- `npm start` – runs `npx electron .`, which launches the desktop window, boots the HTTP API, and creates the AppData seed files if missing.
- Manual validation is the only test runway: start the app, create a clip, add a screenshot, and exercise the `/add-clip` endpoint (POST JSON to `http://127.0.0.1:4050/add-clip`) if you touch the API layer.

## Coding Style & Naming Conventions
- JavaScript files use two-space indentation, semicolons, and `camelCase` for helpers/functions; keep helper exports close to where they are used (see `renderSections`, `handleSaveClip`, etc.).
- Section identifiers are normalized to kebab-case (`inbox`, `common-prompts`, `black-skies`, etc.). Screenshot filenames follow `shot-<timestamp>.png`.
- CSS class names reuse hyphenated descriptors (e.g., `section-tab`, `clip-list-item`, `screenshot-card`) and modifiers (`--active`, `--empty`), so keep new rules scoped and minimal.
- Keep IPC channels descriptive (`get-data`, `save-clip`, `add-clip`) and match them exactly between `main.js`, `preload.js`, and `renderer.js`.

## Testing Guidelines
- There is no automated test suite; rely on the manual workflow: `npm start`, interact with the UI, and confirm clips persist across restarts.
- When you tweak clip/screenshot logic, also test the HTTP API (`/add-clip`) with a simple curl/PowerShell POST to guarantee section/tag parsing behaves as expected.
- Document any new manual tests in the PR description.

## Commit & Pull Request Guidelines
- Commit messages should be concise and imperative, e.g., `Add HTTP fallback for HDR captures` or `Clean up clipboard snip flow`.
- Pull requests must include a brief description of the change, the manual steps you performed (start app, create clip, hit API, etc.), and screenshots for UI work.
- Link related issues or use cases in the PR body so reviewers know why the change matters.

## Security & Configuration Tips
- All data lives under `%APPDATA%\SnipBoard`; avoid deleting that directory when testing because it holds the config and saved clips/screenshots.
- The HTTP API is bound to `127.0.0.1`; keep it that way and mention any port change in documentation so Chrome extension work remains compatible.
