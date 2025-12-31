# project1 (SnipBoard)

Name change note: the repo is named `project1` to avoid collisions; the app UI still shows "SnipBoard".

## What it is
project1 is a local-first Windows desktop app that acts as a developer side companion. It captures selected web snippets (via the Chrome extension) and organizes them into tabs with notes, tags, and screenshots. Everything runs locally.

## What it is for
- Keeping prompts, notes, and screenshots close while you work.
- Pairing with Codex/ChatGPT during development.
- Local, offline capture and retrieval.

## What it is not
- No cloud sync, accounts, or multi-user collaboration.
- Not a general-purpose note system.
- Not cross-platform (Windows only).

## Build and run (development)
Requirements: Node.js 18+, npm.

```bash
npm install
npm start
```

Build the Windows installer:

```bash
npm run build
```

Output goes to `dist/`.

## Codex workflow
- Use `data/plans/Execution Plan.txt` to stage small, verifiable changes.
- Keep edits minimal and behavior-neutral unless a task says otherwise.
- Validate manually: start the app, create a clip, add a screenshot, and hit `/add-clip` on `http://127.0.0.1:4050`.

## Chrome extension (optional)
1. Open `chrome://extensions` and enable Developer mode.
2. Click "Load unpacked" and select `SnipBoardExtension/`.
3. Select messages on a page and send them to the app (clips appear in Inbox).

## Local data storage
Data is stored under `%APPDATA%\\SnipBoard\\SnipBoard` (clips, tabs, notes, screenshots). Uninstalling the app does not delete this data.
