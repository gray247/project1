# SnipBoard

SnipBoard is a local Electron-based clipboard and snippet manager for ChatGPT and web content. It works with a browser extension that lets me select ChatGPT messages, tag them, and send them to the SnipBoard app, where I can organize text clips and screenshots by section, notes, and tags.

## Features
- Local Electron app with clip list + editor UI
- Sections: Inbox, Common Prompts, Black Skies, Errors, Misc
- Tagging, notes, and search over stored clips
- Screenshot capture and thumbnail display in the editor
- Browser extension that injects checkboxes into ChatGPT messages and sends selected messages to SnipBoard via HTTP POST to http://127.0.0.1:4050/add-clip

## Tech stack
- Electron, Node, JavaScript
- Browser extension (Manifest v3, content script, popup with form)

## Getting started
- Prereqs: Node + npm
- Commands:
  - npm install
  - npm start

## Development notes
- Data storage: data/clips.json, data/sections.json
- Screenshots storage: screenshots/
- SnipBoard is local-first and does not upload clips to any cloud service.

## License
MIT License (see LICENSE file)
