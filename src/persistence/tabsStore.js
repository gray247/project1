const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'SnipBoardData');
const TABS_FILE = path.join(DATA_DIR, 'tabs.json');

function ensureStorage() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
  if (!fs.existsSync(TABS_FILE)) {
    fs.writeFileSync(TABS_FILE, JSON.stringify({ tabs: [] }, null, 2));
  }
}

function loadTabs() {
  ensureStorage();
  return JSON.parse(fs.readFileSync(TABS_FILE, 'utf8'));
}

function saveTabs(data) {
  ensureStorage();
  fs.writeFileSync(TABS_FILE, JSON.stringify(data, null, 2));
}

module.exports = { loadTabs, saveTabs };
