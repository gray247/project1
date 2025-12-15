# project1

> **Name change note**  
> This repository is named **project1** to avoid naming collisions.  
> The application itself may still display the name “SnipBoard” internally.

---

## Overview

**project1** is a local-first Windows desktop application with a companion Chrome extension.

It allows you to capture selected ChatGPT messages (or other web content), send them to a desktop app, and organize them into tabs with notes, tags, and screenshots.

Everything runs locally on your machine.

- No accounts
- No cloud services
- No telemetry
- No external servers

---

## Intended use

This project is for **personal use**.

You are not required to publish, distribute, or release it publicly in order to use it.  
The Windows installer exists so the app can be used normally outside of development mode.

---

## System requirements (end users)

### Required
- Windows 10 or Windows 11
- Google Chrome

### Not required
You do **not** need:
- Node.js
- npm
- Git
- Developer tools

Those are only needed if you plan to modify the code.

---

## Using the application (EXE)

### Step 1 — Obtain the installer
Use a locally built installer or download it from GitHub Releases (if you created one).

The file name will look like: project1-<version>-x64.exe

### Step 2 — Install
1. Double-click the `.exe`
2. Accept the default options
3. Complete the installation

This creates:
- A desktop shortcut
- A Start Menu entry

### Step 3 — First launch
Launch the app using the desktop shortcut.

On first run you should see:
- An **Inbox** tab
- An **All** tab
- No errors

All data is stored locally.

## Chrome extension setup
Step 1 — Open Chrome extensions
1. Open Chrome
2. Go to: chrome://extensions
3. Enable **Developer mode** (top-right)

Step 2 — Load the extension
1. Click **Load unpacked**
2. Select the folder:
SnipBoardExtension/
3. Confirm the extension is enabled

Step 3 — Using the extension
1. Open ChatGPT in Chrome
2. Click the extension icon
3. Click one or more chat messages
4. Selected messages will highlight
5. Confirm to send them to the desktop app
New clips appear in the **Inbox** tab.

## Local data storage
All data is stored locally using Electron’s user data directory.
Typical location:
C:\Users<YourName>\AppData\Roaming\snipboard\SnipBoard\
This includes:
- Clips
- Tabs
- Notes
- Screenshots
Uninstalling the app does not automatically delete this data.
## Development mode (optional)
Only required if you want to modify the application.

## Requirements
- Node.js 18+
- npm

### Run in development mode
```bash
npm install
npm start

Building the Windows installer (developers)
npm run build


The installer will be generated in: 
dist/


Build artifacts should not be committed to Git.

Scope and limitations

Windows only

Local machine only

No cloud sync

No multi-device support


