// ===============================================================
// SnipBoard – CLEAN WORKING RENDERER
// ===============================================================

console.log("[SnipBoard] renderer.js loaded");

let lockedSections = new Set(["common-prompts"]);

const state = {
  sections: [],
  clips: [],
  currentSectionId: "all",
  tabs: [],
  activeTabId: "all",
  currentClipId: null,
  selectedClipIds: new Set(),
  searchText: "",
  tagFilter: "",
  editingSectionId: null,
  renameDraft: "",
  pendingColorSection: null,
  pendingIconSection: null,
  selectedIcon: "",
  selectedColor: "",
};

const IPC = {
  GET_DATA: "get-data",
  SAVE_CLIP: "save-clip",
  DELETE_CLIP: "delete-clip",
  DELETE_CLIPS: "delete-clips",
  CREATE_SECTION: "create-section",
  RENAME_SECTION: "rename-section",
  UPDATE_SECTION: "update-section",
  LOAD_TABS: "tabs:load",
  SAVE_TABS: "tabs:save",
  CHOOSE_EXPORT_FOLDER: "choose-export-folder",
  SAVE_SCREENSHOT: "save-screenshot",
  CAPTURE_SCREEN: "capture-screen",
  OPEN_URL: "open-url",
  SET_SECTION_EXPORT_PATH: "set-section-export-path",
  SET_SECTION_LOCKED: "set-section-locked",
  SAVE_SECTION_ORDER: "save-section-order"
};

const DEFAULT_SCHEMA = ["title", "text", "screenshots", "tags", "sourceUrl", "sourceTitle", "capturedAt", "notes"];
const FIELD_OPTIONS = DEFAULT_SCHEMA.slice();
const SNIPBOARD_COLORS = [
  "#FF3B30", "#FF9500", "#FFCC00",
  "#34C759", "#30D158", "#007AFF",
  "#0A84FF", "#5856D6", "#AF52DE",
  "#5AC8FA", "#64D2FF", "#FF2D55",
  "#FF375F", "#FFD60A", "#8E8E93",
  "#AEAEB2", "#1C1C1E", "#FFFFFF",
  "#000000", "#32ADE6"
];
let searchIndex = new Map();
let draggingClipId = null;
function noopInvoke(channel, args) {
  return window.api.invoke(channel, args);
}

// Future-use IPC wrappers (no-op behavior)
async function noopDeleteClip(id) { return noopInvoke(IPC.DELETE_CLIP, id); }
async function noopGetScreenshotUrl(name) { return noopInvoke("get-screenshot-url", name); }
async function noopListDisplays() { return noopInvoke("list-displays"); }
async function noopDebugListDisplays() { return noopInvoke("debug-list-displays"); }

let lastPollSignature = "";
let handlersBound = false;
let hiddenColorInput = null;
let draggingSectionId = null;
let dragHoverSectionId = null;
const protectedSections = new Set(["inbox", "common-prompts", "black-skies", "errors", "misc"]);
let saveTabsTimer = null;
let syncingTabs = false;
const iconChoices = [
  { key: "inbox", label: "Inbox", icon: "\u{1F4E5}" },
  { key: "folder", label: "Folder", icon: "\u{1F4C1}" },
  { key: "test", label: "Test", icon: "\u{1F9EA}" },
  { key: "errors", label: "Errors", icon: "\u26A0\uFE0F" },
  { key: "ideas", label: "Ideas", icon: "\u{1F4A1}" },
  { key: "star", label: "Star", icon: "\u2B50" },
];
const DEFAULT_TABS = [
  { id: "inbox", label: "Inbox", locked: false, exportFolder: "", color: "", icon: "", order: 0, schema: DEFAULT_SCHEMA.slice() },
  { id: "common-prompts", label: "Common Prompts", locked: false, exportFolder: "", color: "", icon: "", order: 1, schema: DEFAULT_SCHEMA.slice() },
  { id: "black-skies", label: "Black Skies", locked: false, exportFolder: "", color: "", icon: "", order: 2, schema: DEFAULT_SCHEMA.slice() },
  { id: "errors", label: "Errors", locked: false, exportFolder: "", color: "", icon: "", order: 3, schema: DEFAULT_SCHEMA.slice() },
  { id: "misc", label: "Misc", locked: false, exportFolder: "", color: "", icon: "", order: 4, schema: DEFAULT_SCHEMA.slice() },
];
// ===============================================================
// DOM ELEMENTS
// ===============================================================

const sectionTabs = document.getElementById("sectionTabs");
const clipList = document.getElementById("clipList");

const textInput = document.getElementById("textInput");
const titleInput = document.getElementById("titleInput");
const notesInput = document.getElementById("notesInput");
const tagsInput = document.getElementById("tagsInput");
const screenshotBox = document.getElementById("screenshotContainer");

const sectionSelect = document.getElementById("sectionSelect");
const sourceUrlInput = document.getElementById("sourceUrlInput");
const sourceTitleInput = document.getElementById("sourceTitleInput");
const capturedAtInput = document.getElementById("capturedAtInput");
const titleRow = document.querySelector(".title-row");
const textRow = textInput ? textInput.closest(".field-row") : null;
const screenshotsRow = screenshotBox ? screenshotBox.closest(".field-row") : null;
const tagsRow = document.querySelector(".tags-row");
const tagsCol = document.querySelector(".tags-col");
const capturedCol = document.querySelector(".captured-col");
const sourceRow = document.querySelector(".source-row");
const sourceUrlCol = document.querySelector(".source-url");
const sourceTitleCol = sourceTitleInput ? sourceTitleInput.parentElement : null;
const notesRow = notesInput ? notesInput.closest(".field-row") : null;
const screenshotEditModalId = "screenshot-edit-modal";

const newClipBtn = document.getElementById("newClipBtn");
const newSnipBtn = document.getElementById("newSnipBtn");
const saveClipBtn = document.getElementById("saveClipBtn");
const deleteClipBtn = document.getElementById("deleteClipBtn");
const addShotBtn = document.getElementById("addShotBtn");

const searchInput = document.getElementById("searchInput");
const tagFilterInput = document.getElementById("tagFilterInput");
const openSourceBtn = document.getElementById("openSourceBtn");
const listAddBtn = document.getElementById("listAddBtn");
const deleteSelectedBtn = document.getElementById("deleteSelectedBtn");
const listDeleteBtn = document.getElementById("listDeleteBtn");
const lockToggleBtn = document.getElementById("lockToggleBtn");
const setExportBtn = document.getElementById("setExportBtn");
const clearExportBtn = document.getElementById("clearExportBtn");
const exportPathDisplay = document.getElementById("exportPathDisplay");
const lockSectionCheckbox = null;
const tabContextMenu = document.getElementById("tabContextMenu");
const renameModal = document.getElementById("renameModal");
const renameInput = document.getElementById("renameInput");
const renameSaveBtn = document.getElementById("renameSaveBtn");
const renameCancelBtn = document.getElementById("renameCancelBtn");
const colorModal = document.getElementById("colorModal");
const colorSwatches = document.getElementById("colorSwatches");
const colorSaveBtn = document.getElementById("colorSaveBtn");
const colorCancelBtn = document.getElementById("colorCancelBtn");
const iconModal = document.getElementById("iconModal");
const iconChoicesContainer = document.getElementById("iconChoices");
const iconSaveBtn = document.getElementById("iconSaveBtn");
const iconCancelBtn = document.getElementById("iconCancelBtn");

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

function sectionLabel(id) {
  switch (id) {
    case "all": return "All";
    case "inbox": return "Inbox";
    case "common-prompts": return "Common Prompts";
    case "black-skies": return "Black Skies";
    case "errors": return "Errors";
    case "misc": return "Misc";
    default: return id || "";
  }
}

function computeSignature(arr) {
  try {
    return JSON.stringify(arr);
  } catch {
    return "";
  }
}

function getCurrentClip() {
  return state.clips.find(c => c.id === state.currentClipId) || null;
}

function updateSearchIndex(clips) {
  searchIndex = new Map();
  (clips || []).forEach((clip) => {
    const tagsString = Array.isArray(clip.tags) ? clip.tags.join(" ") : "";
    const entry = `${clip.title || ""} ${clip.text || ""} ${tagsString}`.toLowerCase();
    searchIndex.set(clip.id, entry);
  });
}

function applySchemaVisibility(schema) {
  const schemaSet = new Set(Array.isArray(schema) && schema.length ? schema : DEFAULT_SCHEMA);
  if (!titleRow || !textRow || !screenshotsRow || !tagsRow || !sourceRow || !notesRow) return;
  titleRow.style.display = schemaSet.has("title") ? "" : "none";
  textRow.style.display = schemaSet.has("text") ? "" : "none";
  screenshotsRow.style.display = schemaSet.has("screenshots") ? "" : "none";
  if (tagsRow) {
    const showTags = schemaSet.has("tags");
    const showCaptured = schemaSet.has("capturedAt");
    tagsRow.style.display = showTags || showCaptured ? "" : "none";
    if (tagsCol) tagsCol.style.display = showTags ? "" : "none";
    if (capturedCol) capturedCol.style.display = showCaptured ? "" : "none";
  }
  const showUrl = schemaSet.has("sourceUrl");
  const showTitle = schemaSet.has("sourceTitle");
  sourceRow.style.display = showUrl || showTitle ? "" : "none";
  if (sourceUrlCol) sourceUrlCol.style.display = showUrl ? "" : "none";
  if (sourceTitleCol) sourceTitleCol.style.display = showTitle ? "" : "none";
  notesRow.style.display = schemaSet.has("notes") ? "" : "none";
}

function renderColorPalette(container, selectedColor, onSelect, includeNone = false) {
  if (!container) return;
  container.innerHTML = "";

  const createSwatch = (color, label) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "color-swatch";
    if (!color) btn.classList.add("color-swatch--none");
    if (color === selectedColor) btn.classList.add("selected");
    btn.style.backgroundColor = color || "transparent";
    if (!color) btn.textContent = label || "None";
    btn.onclick = () => {
      container.querySelectorAll(".color-swatch.selected").forEach((el) => el.classList.remove("selected"));
      btn.classList.add("selected");
      if (typeof onSelect === "function") onSelect(color || "");
    };
    container.appendChild(btn);
  };

  if (includeNone) createSwatch("", "None");
  SNIPBOARD_COLORS.forEach((clr) => createSwatch(clr));
}

function openScreenshotEditor(src, filename, clip) {
  const existing = document.getElementById(screenshotEditModalId);
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = screenshotEditModalId;
  overlay.className = "screenshot-editor-overlay";

  const modal = document.createElement("div");
  modal.className = "screenshot-editor-dialog";

  const toolbar = document.createElement("div");
  toolbar.className = "screenshot-editor-toolbar";

  const canvas = document.createElement("canvas");
  canvas.className = "screenshot-editor-canvas";
  const ctx = canvas.getContext("2d");

  let drawing = false;
  let erasing = false;
  let penColor = SNIPBOARD_COLORS[0];
  let lastX = 0;
  let lastY = 0;
  let imgLoaded = false;

  const teardown = () => {
    canvas.removeEventListener("mousedown", startDraw);
    canvas.removeEventListener("mousemove", moveDraw);
    canvas.removeEventListener("mouseup", endDraw);
    canvas.removeEventListener("mouseleave", endDraw);
    overlay.remove();
  };

  const penBtn = document.createElement("button");
  penBtn.textContent = "Pen";
  penBtn.className = "btn ghost";
  const eraserBtn = document.createElement("button");
  eraserBtn.textContent = "Eraser";
  eraserBtn.className = "btn ghost";

  const setMode = (erase) => {
    erasing = erase;
    penBtn.classList.toggle("active", !erase);
    eraserBtn.classList.toggle("active", erase);
  };
  penBtn.onclick = () => setMode(false);
  eraserBtn.onclick = () => setMode(true);
  setMode(false);

  const colorRow = document.createElement("div");
  colorRow.className = "color-swatch-row";
  renderColorPalette(colorRow, penColor, (color) => {
    penColor = color || SNIPBOARD_COLORS[0];
    setMode(false);
  });

  const spacer = document.createElement("div");
  spacer.style.flex = "1";

  const saveBtn = document.createElement("button");
  saveBtn.textContent = "Save";
  saveBtn.className = "btn primary";

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "Cancel";
  cancelBtn.className = "btn ghost";
  cancelBtn.onclick = () => teardown();

  toolbar.appendChild(penBtn);
  toolbar.appendChild(eraserBtn);
  toolbar.appendChild(colorRow);
  toolbar.appendChild(spacer);
  toolbar.appendChild(saveBtn);
  toolbar.appendChild(cancelBtn);

  modal.appendChild(toolbar);
  modal.appendChild(canvas);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const img = new Image();
  img.onload = () => {
    imgLoaded = true;
    const naturalW = img.naturalWidth || img.width;
    const naturalH = img.naturalHeight || img.height;
    canvas.width = naturalW;
    canvas.height = naturalH;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
  };
  img.onerror = (err) => {
    console.error("[SnipBoard] Failed to load screenshot for edit:", err);
    teardown();
  };
  img.src = src;

  const getPos = (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const draw = (x, y) => {
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.strokeStyle = erasing ? "rgba(0,0,0,1)" : penColor;
    ctx.lineWidth = erasing ? 16 : 4;
    ctx.globalCompositeOperation = erasing ? "destination-out" : "source-over";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    lastX = x;
    lastY = y;
  };

  function startDraw(e) {
    if (!imgLoaded) return;
    drawing = true;
    const pos = getPos(e);
    lastX = pos.x;
    lastY = pos.y;
  }
  function moveDraw(e) {
    if (!drawing || !imgLoaded) return;
    const pos = getPos(e);
    draw(pos.x, pos.y);
  }
  function endDraw() {
    drawing = false;
    ctx.globalCompositeOperation = "source-over";
  }

  canvas.addEventListener("mousedown", startDraw);
  canvas.addEventListener("mousemove", moveDraw);
  canvas.addEventListener("mouseup", endDraw);
  canvas.addEventListener("mouseleave", endDraw);

  saveBtn.onclick = async () => {
    if (!imgLoaded) return;
    const dataUrl = canvas.toDataURL("image/png");
    await window.api.invoke("save-screenshot", [{ dataUrl, filename }]);
    teardown();
    await refreshData(clip.id);
  };

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) teardown();
  });
}

function normalizeTabs(tabs) {
  if (!Array.isArray(tabs)) return DEFAULT_TABS.map((t, idx) => ({ ...t, order: idx }));
  const sanitizeSchema = (schema) => {
    if (!Array.isArray(schema) || !schema.length) return DEFAULT_SCHEMA.slice();
    const filtered = schema.filter((f) => FIELD_OPTIONS.includes(f));
    return filtered.length ? filtered : DEFAULT_SCHEMA.slice();
  };
  return tabs
    .map((t, idx) => ({
      id: t.id || `tab-${idx}`,
      label: t.label || t.name || `Tab ${idx + 1}`,
      locked: Boolean(t.locked),
      exportFolder: typeof t.exportFolder === "string" ? t.exportFolder : "",
      exportPath: typeof t.exportPath === "string" ? t.exportPath : (typeof t.exportFolder === "string" ? t.exportFolder : ""),
      color: typeof t.color === "string" ? t.color : "",
      icon: typeof t.icon === "string" ? t.icon : "",
      order: Number.isFinite(t.order) ? t.order : idx,
      schema: sanitizeSchema(t.schema),
    }))
    .sort((a, b) => a.order - b.order);
}

function tabsToSections(tabs) {
  return tabs.map((t) => ({
    id: t.id,
    name: t.label,
    locked: t.locked,
    exportPath: t.exportPath || t.exportFolder || "",
    exportFolder: t.exportFolder || t.exportPath || "",
    color: t.color || "",
    icon: t.icon || "",
    schema: Array.isArray(t.schema) ? t.schema : DEFAULT_SCHEMA.slice(),
  }));
}

function sectionsToTabs(sections) {
  if (!Array.isArray(sections)) return DEFAULT_TABS;
  return sections.map((s, idx) => ({
    id: s.id,
    label: s.name || s.id || `Tab ${idx + 1}`,
    locked: !!s.locked,
    exportFolder: s.exportFolder || s.exportPath || "",
    exportPath: s.exportPath || s.exportFolder || "",
    color: s.color || "",
    icon: s.icon || "",
    order: Number.isFinite(s.order) ? s.order : idx,
    schema: Array.isArray(s.schema) && s.schema.length ? s.schema : DEFAULT_SCHEMA.slice(),
  }));
}

function syncSectionsFromTabs() {
  state.sections = tabsToSections(state.tabs);
}

async function syncTabsToBackend() {
  if (syncingTabs) return;
  syncingTabs = true;
  try {
    for (const tab of state.tabs) {
      await window.api.invoke(IPC.SET_SECTION_EXPORT_PATH, { id: tab.id, exportPath: tab.exportFolder || "" });
      await window.api.invoke(IPC.SET_SECTION_LOCKED, { id: tab.id, locked: !!tab.locked });
    }
    await window.api.invoke(IPC.SAVE_SECTION_ORDER, state.tabs.map((t, idx) => ({ id: t.id, name: t.label, order: idx })));
  } catch (err) {
    console.error("[SnipBoard] syncTabsToBackend failed:", err);
  } finally {
    syncingTabs = false;
  }
}

function getActiveTab() {
  const tab = state.tabs.find((t) => t.id === state.activeTabId) || null;
  if (tab && (!Array.isArray(tab.schema) || !tab.schema.length)) {
    tab.schema = DEFAULT_SCHEMA.slice();
  }
  return tab;
}

function updateSidebarHeader() {
  const nameEl = document.getElementById("clipTabName");
  const pathEl = document.getElementById("clipTabPath");
  if (!nameEl || !pathEl) return;

  const activeTab = getActiveTab();
  nameEl.textContent = activeTab ? (activeTab.name || activeTab.label || sectionLabel(activeTab.id)) : "";
  const finalPath = activeTab ? (activeTab.exportPath || activeTab.exportFolder || "") : "";
  pathEl.textContent = finalPath;
}

function getSectionById(id) {
  return state.sections.find((s) => s.id === id) || null;
}

function formatDateTime(ts) {
  if (!ts) return "";
  const d = new Date(Number(ts));
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function pruneSelected() {
  const existingIds = new Set(state.clips.map((c) => c.id));
  state.selectedClipIds.forEach((id) => {
    if (!existingIds.has(id)) state.selectedClipIds.delete(id);
  });
}

function normalizeSections(sections) {
  return (sections || []).map((s) => ({
    ...s,
    exportFolder: s.exportFolder ?? s.exportPath ?? "",
    exportPath: s.exportPath ?? s.exportFolder ?? "",
    color: s.color || "",
    icon: s.icon || "",
  }));
}

function updateExportPathDisplay() {
  const activeTab = getActiveTab();
  if (!activeTab || state.activeTabId === "all") {
    exportPathDisplay.textContent = "No section selected";
    if (setExportBtn) setExportBtn.disabled = true;
    if (clearExportBtn) clearExportBtn.disabled = true;
    return;
  }
  if (setExportBtn) setExportBtn.disabled = true;
  if (clearExportBtn) clearExportBtn.disabled = true;
  const path = activeTab.exportFolder;
  exportPathDisplay.textContent = path || "(not set)";
}

function isSectionLocked(sectionId) {
  if (!sectionId || sectionId === "all") return false;
  const tab = state.tabs.find((t) => t.id === sectionId);
  if (tab) return !!tab.locked;
  return lockedSections.has(sectionId);
}

function syncLockedSectionsFromState() {
  const persisted = state.sections.filter((s) => s.locked).map((s) => s.id);
  lockedSections = new Set([...lockedSections, ...persisted]);
}

function scheduleSaveTabsConfig() {
  if (saveTabsTimer) clearTimeout(saveTabsTimer);
  saveTabsTimer = setTimeout(async () => {
    const payload = {
      tabs: state.tabs.map((t, idx) => ({
        ...t,
        exportPath: t.exportPath || t.exportFolder || "",
        exportFolder: t.exportFolder || t.exportPath || "",
        order: Number.isFinite(t.order) ? t.order : idx,
      })),
      activeTabId: state.activeTabId || "all",
    };
    try {
      window.tabsState = payload;
      await window.api.invoke(IPC.SAVE_TABS, window.tabsState);
    } catch (err) {
      console.error("[SnipBoard] saveTabsConfig failed:", err);
    }
  }, 250);
}

async function updateSection(id, patch) {
  if (!id) return null;
  const current = state.sections.find((s) => s.id === id);
  if (current) {
    Object.assign(current, patch);
  }

  try {
    await window.api.invoke(IPC.UPDATE_SECTION, { id, patch });
    if (patch.locked !== undefined) {
      await window.api.invoke(IPC.SET_SECTION_LOCKED, { id, locked: patch.locked });
    }
    if (patch.exportFolder !== undefined || patch.exportPath !== undefined) {
      const pathVal = patch.exportFolder ?? patch.exportPath ?? "";
      await window.api.invoke(IPC.SET_SECTION_EXPORT_PATH, { id, exportPath: pathVal });
    }
    await window.api.invoke(IPC.SAVE_SECTION_ORDER, state.sections.map((s) => ({ id: s.id, name: s.name })));
  } catch (err) {
    console.error("[SnipBoard] updateSection failed:", err);
  }

  if (patch.locked !== undefined) {
    if (patch.locked) lockedSections.add(id);
    else lockedSections.delete(id);
  }

  return current;
}

function updateDeleteButtonsLockState() {
  const locked = isSectionLocked(state.currentSectionId);
  if (deleteClipBtn) deleteClipBtn.disabled = locked;
  if (deleteSelectedBtn) deleteSelectedBtn.disabled = locked;
  if (listDeleteBtn) listDeleteBtn.disabled = locked;
}

function openScreenshotModal(src) {
  const modal = document.getElementById("screenshotModal");
  const img = document.getElementById("shotModalImage");
  if (!modal || !img || !src) return;

  img.src = src;
  modal.classList.add("is-open");

  const escHandler = (evt) => {
    if (evt.key === "Escape") {
      closeScreenshotModal();
    }
  };

  modal._escHandler = escHandler;
  document.addEventListener("keydown", escHandler);
}

function closeScreenshotModal() {
  const modal = document.getElementById("screenshotModal");
  const img = document.getElementById("shotModalImage");
  if (!modal || !img) return;

  modal.classList.remove("is-open");
  img.src = "";

  if (modal._escHandler) {
    document.removeEventListener("keydown", modal._escHandler);
    modal._escHandler = null;
  }
}

const lockSectionCheckboxHandler = () => {
  const id = state.currentSectionId;
  if (!id || id === "all") {
    return;
  }
  const next = !lockedSections.has(id);
  if (next) lockedSections.add(id);
  else lockedSections.delete(id);
  const sec = state.sections.find((s) => s.id === id);
  if (sec) sec.locked = next;
  updateSection(id, { locked: next });
  renderSections();
  updateDeleteButtonsLockState();
  renderLockButtonState();
};

function setCurrentSection(sectionId) {
  if (!sectionId) sectionId = "all";
  state.currentSectionId = sectionId;
  state.activeTabId = sectionId;
  state.currentClipId = null;
  closeTabContextMenu();

  renderSections();
  renderClipList();
  renderEditor();
  updateExportPathDisplay();
  updateDeleteButtonsLockState();
  renderLockButtonState();
  updateSidebarHeader();
  scheduleSaveTabsConfig();
}

function renderLockButtonState() {
  if (!lockToggleBtn) return;
  const locked = isSectionLocked(state.currentSectionId);
  lockToggleBtn.textContent = locked ? "\ud83d\udd12" : "\ud83d\udd13";
  lockToggleBtn.title = "Lock this section";
}

if (lockToggleBtn) {
  lockToggleBtn.addEventListener("click", lockSectionCheckboxHandler);
}

async function renderScreenshots(clip) {
  screenshotBox.innerHTML = "";
  const shots = Array.isArray(clip.screenshots) ? clip.screenshots : [];
  const baseUrl = "http://127.0.0.1:4050/screenshots";
  for (const file of shots) {
    if (!file) continue;
    const img = document.createElement("img");
    img.className = "thumb screenshot-thumb";
    img.src = `${baseUrl}/${file}`;
    img.onerror = () => {
      img.remove();
      const missing = document.createElement("div");
      missing.className = "screenshot-missing";
      missing.textContent = "(screenshot missing)";
      screenshotBox.appendChild(missing);
    };
    img.addEventListener("dblclick", () => openScreenshotModal(img.src));
    img.addEventListener("click", () => openScreenshotModal(img.src));
    img.oncontextmenu = async (e) => {
      e.preventDefault();
      const ok = window.confirm("Delete this screenshot?");
      if (!ok) return;
      try {
        const res = await window.api.invoke("delete-screenshot", { clipId: clip.id, filename: file });
        if (res && res.success && res.clip) {
          const idx = state.clips.findIndex((c) => c.id === clip.id);
          if (idx >= 0) state.clips[idx] = res.clip;
          state.currentClipId = clip.id;
          await renderEditor();
          renderClipList();
        }
      } catch (err) {
        console.error("[SnipBoard] delete-screenshot failed:", err);
      }
    };
    screenshotBox.appendChild(img);

    const editBtn = document.createElement("button");
    editBtn.className = "screenshot-edit-btn";
    editBtn.textContent = "Edit";
    editBtn.onclick = () => openScreenshotEditor(`${baseUrl}/${file}`, file, clip);
    screenshotBox.appendChild(editBtn);
  }
}

// ===============================================================
// RENDERING
// ===============================================================

function renderSections() {
  syncSectionsFromTabs();
  renderSectionsBar();
}

function renderTabs() {
  renderSectionsBar();
  if (!sectionTabs) return;
  const tabsFromState = (window.tabsState && Array.isArray(window.tabsState.tabs)) ? window.tabsState.tabs : state.tabs;
  const tabMap = new Map((tabsFromState || []).map((t) => [t.id, t]));
  sectionTabs.querySelectorAll(".section-pill").forEach((pill) => {
    const tabId = pill.dataset.sectionId;
    if (!tabId) return;
    const tab = tabMap.get(tabId);
    if (!tab) return;
    if (tab.color) {
      pill.style.backgroundColor = tab.color;
      pill.style.borderColor = tab.color;
      pill.style.color = "#fff";
      pill.classList.add("section-pill--colored");
    }
    let iconSpan = pill.querySelector(".section-pill__icon");
    if (iconSpan) iconSpan.remove();
    if (tab.icon) {
      const content = pill.querySelector(".section-pill__content");
      if (content) {
        iconSpan = document.createElement("span");
        iconSpan.className = "section-pill__icon";
        iconSpan.textContent = tab.icon;
        content.insertBefore(iconSpan, content.firstChild);
      }
    }
  });
}

function renderSectionsBar() {
  if (!sectionTabs) return;
  if (!state.activeTabId) state.activeTabId = "all";
  const hasCurrentSection =
    state.activeTabId === "all" ||
    state.tabs.some((s) => s && s.id === state.activeTabId);
  if (!hasCurrentSection) {
    state.activeTabId = state.tabs[0]?.id || "all";
    state.currentSectionId = state.activeTabId;
  }

  sectionTabs.innerHTML = "";

  const allTab = document.createElement("div");
  allTab.className = "section-pill";
  allTab.textContent = "All";
  allTab.dataset.sectionId = "all";
  if (state.activeTabId === "all") allTab.classList.add("section-pill--active");
  allTab.onclick = () => setCurrentSection("all");
  allTab.oncontextmenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };
  sectionTabs.appendChild(allTab);

  state.tabs.forEach((section) => {
    if (!section || !section.id) return;
    const locked = !!section.locked;
    const tabEl = document.createElement("div");
    tabEl.dataset.sectionId = section.id;
    tabEl.className = "section-pill";
    if (section.id === state.activeTabId) tabEl.classList.add("section-pill--active");
    if (locked) tabEl.classList.add("section-pill--locked");
    if (dragHoverSectionId === section.id) tabEl.classList.add("section-pill--dragover");
    tabEl.title = section.exportFolder || section.exportPath || "";
    if (section.color) {
      tabEl.style.backgroundColor = section.color;
      tabEl.style.borderColor = section.color;
      tabEl.style.color = "#fff";
      tabEl.classList.add("section-pill--colored");
    }
    tabEl.setAttribute("draggable", "true");

    const pillContent = document.createElement("div");
    pillContent.className = "section-pill__content";

    if (state.editingSectionId === section.id) {
      const input = document.createElement("input");
      input.type = "text";
      input.value = state.renameDraft || section.label || sectionLabel(section.id);
      input.className = "section-pill__rename";
      input.onkeydown = async (e) => {
        if (e.key === "Enter") {
          await commitRename(section.id, input.value);
        } else if (e.key === "Escape") {
          cancelRename();
        }
      };
      input.onblur = async () => {
        if (state.editingSectionId === section.id) {
          await commitRename(section.id, input.value);
        }
      };
      setTimeout(() => input.focus(), 0);
      pillContent.appendChild(input);
    } else {
    if (section.icon) {
      const iconSpan = document.createElement("span");
      iconSpan.className = "section-pill__icon";
      iconSpan.textContent = section.icon;
      pillContent.appendChild(iconSpan);
    }

    const nameSpan = document.createElement("span");
    nameSpan.textContent = section.label || sectionLabel(section.id);
    pillContent.appendChild(nameSpan);

    }
    tabEl.appendChild(pillContent);

    const lockIcon = document.createElement("span");
    lockIcon.className = "section-pill__lock";
    lockIcon.textContent = locked ? "\uD83D\uDD12" : "\uD83D\uDD13";
    lockIcon.title = locked ? "Unlock section" : "Lock section";
    lockIcon.onclick = async (e) => {
      e.stopPropagation();
      const newState = !locked;
      await updateSection(section.id, { locked: newState });
      section.locked = newState;
      updateDeleteButtonsLockState();
      renderLockButtonState();
      window.tabsState = { tabs: state.tabs, activeTabId: state.activeTabId || "all" };
      await window.api.invoke(IPC.SAVE_TABS, window.tabsState);
      renderSectionsBar();
      scheduleSaveTabsConfig();
    };
    pillContent.appendChild(lockIcon);

    tabEl.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openTabContextMenu(section.id, e.pageX, e.pageY);
    });
    tabEl.onclick = () => setCurrentSection(section.id);
    tabEl.ondblclick = async () => {
      startInlineRename(section.id);
    };

    tabEl.addEventListener("dragstart", (e) => {
      startTabReorder(section.id);
      dragHoverSectionId = section.id;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", section.id);
    });
    tabEl.addEventListener("dragenter", (e) => {
      if (draggingClipId) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      dragHoverSectionId = section.id;
      tabEl.classList.add("section-pill--dragover");
    });
    tabEl.addEventListener("dragover", (e) => {
      if (draggingClipId) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });
    tabEl.addEventListener("dragleave", () => {
      tabEl.classList.remove("section-pill--dragover");
    });
    tabEl.addEventListener("drop", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      tabEl.classList.remove("section-pill--dragover");
      if (draggingClipId) {
        await moveClipToTab(draggingClipId, section.id);
        draggingClipId = null;
        return;
      }
      finishTabReorder(section.id);
    });
    tabEl.addEventListener("dragend", () => {
      dragHoverSectionId = null;
      renderSectionsBar();
    });

    sectionTabs.appendChild(tabEl);
  });

  const addTab = document.createElement("div");
  addTab.id = "addTabButton";
  addTab.className = "add-tab";
  addTab.textContent = "+ Add Tab";
  addTab.onclick = handleCreateTab;
  sectionTabs.appendChild(addTab);

  const activePill = sectionTabs.querySelector(".section-pill--active");
  if (activePill && typeof activePill.scrollIntoView === "function") {
    activePill.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }
  updateSidebarHeader();
}

function startTabReorder(sectionId) {
  draggingSectionId = sectionId;
}

async function finishTabReorder(targetSectionId) {
  const sourceId = draggingSectionId;
  draggingSectionId = null;
  const fromIndex = state.sections.findIndex((s) => s.id === sourceId);
  if (!sourceId || fromIndex === -1 || sourceId === targetSectionId) {
    renderSectionsBar();
    return;
  }

  const toIndex = targetSectionId
    ? state.sections.findIndex((s) => s.id === targetSectionId)
    : state.sections.length - 1;

  const [moved] = state.sections.splice(fromIndex, 1);
  if (toIndex >= 0) {
    state.sections.splice(toIndex, 0, moved);
  } else {
    state.sections.push(moved);
  }
  const [movedTab] = state.tabs.splice(fromIndex, 1);
  if (toIndex >= 0) state.tabs.splice(toIndex, 0, movedTab);
  state.tabs.forEach((t, idx) => (t.order = idx));

  try {
    await window.api.invoke("save-section-order", state.sections.map((s) => ({ id: s.id, name: s.name })));
  } catch (err) {
    console.error("[SnipBoard] saveSectionOrder failed:", err);
  }

  renderSectionsBar();
  syncSectionsFromTabs();
  scheduleSaveTabsConfig();
}

function closeTabContextMenu() {
  if (!tabContextMenu) return;
  tabContextMenu.style.display = "none";
}

function openTabContextMenu(sectionId, x, y) {
  const menu = document.getElementById("tabContextMenu");
  if (!menu) return;
  menu.dataset.sectionId = sectionId;
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.style.display = "block";
}

function openSchemaConfigurator(sectionId) {
  const tab = state.tabs.find((t) => t.id === sectionId);
  if (!tab) return;
  const schemaSet = new Set(Array.isArray(tab.schema) && tab.schema.length ? tab.schema : DEFAULT_SCHEMA);
  const existing = document.getElementById("schemaConfigOverlay");
  if (existing) existing.remove();
  const overlay = document.createElement("div");
  overlay.id = "schemaConfigOverlay";
  overlay.style.position = "fixed";
  overlay.style.top = "0";
  overlay.style.left = "0";
  overlay.style.width = "100vw";
  overlay.style.height = "100vh";
  overlay.style.background = "rgba(0,0,0,0.35)";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.zIndex = "99999";

  const panel = document.createElement("div");
  panel.className = "configure-fields-modal";
  panel.style.background = "#fff";
  panel.style.padding = "16px";
  panel.style.borderRadius = "10px";
  panel.style.minWidth = "260px";
  panel.style.boxShadow = "0 8px 20px rgba(0,0,0,0.25)";

  const header = document.createElement("div");
  header.textContent = "Configure Fields";
  header.style.fontWeight = "700";
  header.style.marginBottom = "12px";
  panel.appendChild(header);

  const body = document.createElement("div");
  body.className = "configure-fields-body";

  FIELD_OPTIONS.forEach((field) => {
    const row = document.createElement("div");
    row.className = "configure-fields-row";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = schemaSet.has(field);
    cb.onchange = async () => {
      if (cb.checked) schemaSet.add(field);
      else schemaSet.delete(field);
      if (!schemaSet.size) {
        schemaSet.add(field);
        cb.checked = true;
      }
      tab.schema = Array.from(schemaSet);
      window.tabsState = { tabs: state.tabs, activeTabId: state.activeTabId || "all" };
      await window.api.invoke(IPC.SAVE_TABS, window.tabsState);
      applySchemaVisibility(tab.schema);
      renderEditor();
    };

    const text = document.createElement("span");
    text.textContent = field;
    row.appendChild(cb);
    row.appendChild(text);
    body.appendChild(row);
  });

  panel.appendChild(body);

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "Close";
  closeBtn.style.marginTop = "10px";
  closeBtn.onclick = () => overlay.remove();
  panel.appendChild(closeBtn);

  overlay.appendChild(panel);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.body.appendChild(overlay);
}

document.addEventListener("click", () => {
  const menu = document.getElementById("tabContextMenu");
  if (menu) menu.style.display = "none";
});
document.addEventListener("contextmenu", (e) => {
  if (!tabContextMenu) return;
  const within = e.target && tabContextMenu.contains(e.target);
  if (within) e.stopPropagation();
});

function startInlineRename(sectionId) {
  const sec = state.sections.find((s) => s.id === sectionId);
  if (!sec || sec.locked) return;
  state.editingSectionId = sectionId;
  state.renameDraft = sec.name || "";
  renderSectionsBar();
}

async function commitRename(sectionId, value) {
  const name = (value || "").trim();
  if (!name) {
    cancelRename();
    return;
  }
  await renameSection(sectionId, name);
  const tab = state.tabs.find((t) => t.id === sectionId);
  if (tab) tab.label = name;
  state.sections = tabsToSections(state.tabs);
  state.editingSectionId = null;
  state.renameDraft = "";
  renderSectionsBar();
  scheduleSaveTabsConfig();
}

function cancelRename() {
  state.editingSectionId = null;
  state.renameDraft = "";
  renderSectionsBar();
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (renameModal && renameModal.classList.contains("is-open")) renameModal.classList.remove("is-open");
    if (colorModal && colorModal.classList.contains("is-open")) colorModal.classList.remove("is-open");
    if (iconModal && iconModal.classList.contains("is-open")) iconModal.classList.remove("is-open");
    cancelRename();
  }
});

async function toggleLockSection(sectionId) {
  const sec = state.sections.find((s) => s.id === sectionId);
  if (!sec) return;
  const next = !sec.locked;
  await updateSection(sectionId, { locked: next });
  sec.locked = next;
  const tab = state.tabs.find((t) => t.id === sectionId);
  if (tab) tab.locked = next;
  renderSectionsBar();
  updateDeleteButtonsLockState();
  renderLockButtonState();
  scheduleSaveTabsConfig();
}

async function deleteSection(sectionId) {
  const sec = state.sections.find((s) => s.id === sectionId);
  if (protectedSections.has(sectionId) || (sec && sec.locked)) return;
  const confirmDelete = window.confirm("Delete this section and its clips?");
  if (!confirmDelete) return;
  await window.api.invoke("delete-section", sectionId);
  state.tabs = state.tabs.filter((t) => t.id !== sectionId);
  syncSectionsFromTabs();
  if (state.currentSectionId === sectionId) state.currentSectionId = "all";
  state.activeTabId = state.currentSectionId;
  renderSectionsBar();
  renderClipList();
  updateExportPathDisplay();
  scheduleSaveTabsConfig();
}

const tabContextMenuEl = document.getElementById("tabContextMenu");
if (tabContextMenuEl) {
  tabContextMenuEl.addEventListener("click", async (e) => {
    const action = e.target && e.target.dataset ? e.target.dataset.action : null;
    if (!action) return;
    const sectionId = tabContextMenuEl.dataset.sectionId;
    switch (action) {
      case "rename":
        startInlineRename(sectionId);
        break;
      case "color":
        await selectTabColor(sectionId);
        break;
      case "schema":
        openSchemaConfigurator(sectionId);
        break;
      case "icon":
        await selectTabIcon(sectionId);
        break;
      case "folder":
        await assignExportFolder(sectionId);
        break;
      case "lock":
        await toggleLockSection(sectionId);
        break;
      case "delete":
        await deleteSection(sectionId);
        break;
      default:
        break;
    }
    tabContextMenuEl.style.display = "none";
  });
}

if (colorSaveBtn) {
  colorSaveBtn.onclick = async () => {
    const targetId = state.pendingColorSection;
    if (!targetId) {
      if (colorModal) colorModal.classList.remove("is-open");
      return;
    }
    const color = state.selectedColor || "";
    await updateSection(targetId, { color });
    const sec = state.sections.find((s) => s.id === targetId);
    if (sec) sec.color = color;
    const tab = state.tabs.find((t) => t.id === targetId);
    if (tab) tab.color = color;
    const targetTab = window.tabsState?.tabs?.find((t) => t.id === targetId);
    if (targetTab) targetTab.color = color;
    window.tabsState = { tabs: state.tabs, activeTabId: state.activeTabId || "all" };
    await window.api.invoke(IPC.SAVE_TABS, window.tabsState);
    renderTabs();
    if (colorModal) colorModal.classList.remove("is-open");
    state.pendingColorSection = null;
    renderSectionsBar();
    scheduleSaveTabsConfig();
  };
}
if (colorCancelBtn) {
  colorCancelBtn.onclick = () => {
    state.pendingColorSection = null;
    if (colorModal) colorModal.classList.remove("is-open");
  };
}

if (iconSaveBtn) {
  iconSaveBtn.onclick = async () => {
    const targetId = state.pendingIconSection;
    if (!targetId) {
      if (iconModal) iconModal.classList.remove("is-open");
      return;
    }
  await updateSection(targetId, { icon: state.selectedIcon || "" });
  const sec = state.sections.find((s) => s.id === targetId);
  if (sec) sec.icon = state.selectedIcon || "";
  const tab = state.tabs.find((t) => t.id === targetId);
  if (tab) tab.icon = state.selectedIcon || "";
  const targetTab = window.tabsState?.tabs?.find((t) => t.id === targetId);
  if (targetTab) targetTab.icon = state.selectedIcon || "";
  if (iconModal) iconModal.classList.remove("is-open");
  state.pendingIconSection = null;
  renderSectionsBar();
  window.tabsState = { tabs: state.tabs, activeTabId: state.activeTabId || "all" };
  await window.api.invoke(IPC.SAVE_TABS, window.tabsState);
  renderTabs();
  scheduleSaveTabsConfig();
};
}
if (iconCancelBtn) {
  iconCancelBtn.onclick = () => {
    state.pendingIconSection = null;
    if (iconModal) iconModal.classList.remove("is-open");
  };
}


function getSelectedClipIds() {
  const checkboxes = document.querySelectorAll(".clip-row input[type=checkbox]");
  const ids = [];
  checkboxes.forEach((cb) => {
    if (cb.checked && cb.dataset.clipId) ids.push(cb.dataset.clipId);
  });
  return ids;
}

async function unifiedDelete(ids) {
  const activeTab = window.tabsState?.tabs?.find(t => t.id === state.currentSectionId);
  if (activeTab?.locked) {
    console.warn("Tab is locked. Delete blocked.");
    return; 
  }
  const locked = isSectionLocked(state.currentSectionId);
  if (locked) {
    alert("This section is locked.");
    return;
  }

  const targets =
    Array.isArray(ids) && ids.length
      ? ids
      : state.currentClipId
      ? [state.currentClipId]
      : [];
  if (!targets.length) return;

  const confirmMsg =
    targets.length === 1 ? "Delete this clip?" : `Delete ${targets.length} selected clips?`;
  if (!window.confirm(confirmMsg)) return;

  const res = await window.api.invoke(IPC.DELETE_CLIPS, targets);

  if (res && (res.blocked === true || (Array.isArray(res.blocked) && res.blocked.length))) {
    alert("Unlock section first.");
    return;
  }

  const data = await window.api.invoke(IPC.GET_DATA);
  state.sections = normalizeSections(data.sections || []);
  state.clips = data.clips || [];
  updateSearchIndex(state.clips);
  if (targets.includes(state.currentClipId)) {
    state.currentClipId = null;
  }
  renderSections();
  renderClipList();
  await renderEditor();
  updateExportPathDisplay();
  updateDeleteButtonsLockState();
  renderLockButtonState();
}

function renderClipList() {
  const clipList = document.getElementById("clipList");
  if (!clipList) return;
  clipList.innerHTML = "";

  const searchTerm = (state.searchText || "").toLowerCase();
  const tagTerm = (state.tagFilter || "").toLowerCase();

  const filtered = state.clips.filter((clip) => {
    if (state.currentSectionId !== "all" && clip.sectionId !== state.currentSectionId) {
      return false;
    }
    if (searchTerm) {
      const idx = searchIndex.get(clip.id) || `${clip.title || ""} ${clip.text || ""} ${(clip.tags || []).join(" ")}`.toLowerCase();
      if (!idx.includes(searchTerm)) return false;
    }
    if (tagTerm) {
      const tags = tagTerm.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
      if (tags.length && !tags.every((t) => (clip.tags || []).some((ct) => (ct || "").toLowerCase().includes(t)))) {
        return false;
      }
    }
    return true;
  });

  filtered.forEach((clip) => {
    const row = document.createElement("div");
    row.className = "clip-row";
    if (clip.id === state.currentClipId) row.classList.add("clip-row--active");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.clipId = clip.id;
    checkbox.addEventListener("click", (ev) => ev.stopPropagation());

    const thumb = document.createElement("div");
    thumb.className = "clip-row__thumb";
    if (Array.isArray(clip.screenshots) && clip.screenshots.length) {
      const firstShot = clip.screenshots[0];
      window.api.invoke("check-screenshot-path", firstShot).then((res) => {
        if (!res || !res.ok || !res.exists) return;
        const img = document.createElement("img");
        img.src = "file:///" + res.fullPath.replace(/\\/g, "/");
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "cover";
        img.style.borderRadius = "8px";
        thumb.innerHTML = "";
        thumb.appendChild(img);
      }).catch(() => {});
    }

    const title = document.createElement("div");
    title.className = "clip-row__title";
    title.textContent = clip.title || "(untitled)";

    row.appendChild(checkbox);
    row.appendChild(thumb);
    row.appendChild(title);
    row.draggable = true;
    row.addEventListener("dragstart", (e) => {
      draggingClipId = clip.id;
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", clip.id);
      }
    });
    row.addEventListener("dragend", () => {
      draggingClipId = null;
    });

    row.addEventListener("click", () => {
      state.currentClipId = clip.id;
      renderClipList();
      renderEditor();
    });

    row.addEventListener("contextmenu", async (e) => {
      e.preventDefault();
      state.currentClipId = clip.id;
      renderClipList();
      renderEditor();
      const confirmDelete = window.confirm("Delete this clip?");
      if (confirmDelete) {
        await unifiedDelete([clip.id]);
      }
    });

    clipList.appendChild(row);
  });
}

async function moveClipToTab(clipId, targetTabId) {
  const clip = state.clips.find((c) => c.id === clipId);
  if (!clip) return;
  clip.sectionId = targetTabId;
  state.currentSectionId = targetTabId;
  state.activeTabId = targetTabId;
  const saved = await window.api.invoke(IPC.SAVE_CLIP, clip);
  await refreshData(saved?.id || clip.id);
  window.tabsState = { tabs: state.tabs, activeTabId: state.activeTabId || "all" };
  await window.api.invoke(IPC.SAVE_TABS, window.tabsState);
  renderSectionsBar();
}

async function renderEditor() {
  const clip = getCurrentClip();
  const activeTab = getActiveTab();
  const schema = activeTab && Array.isArray(activeTab.schema) && activeTab.schema.length ? activeTab.schema : DEFAULT_SCHEMA;
  applySchemaVisibility(schema);

  if (!clip) {
    textInput.value = "";
    titleInput.value = "";
    notesInput.value = "";
    tagsInput.value = "";
    screenshotBox.innerHTML = "";
    sectionSelect.innerHTML = "";
    sourceUrlInput.value = "";
    sourceTitleInput.value = "";
    capturedAtInput.value = "";
    openSourceBtn.disabled = true;
    return;
  }

  textInput.value = clip.text || "";
  titleInput.value = clip.title || "";
  notesInput.value = clip.notes || "";
  tagsInput.value = (clip.tags || []).join(", ");
  sourceUrlInput.value = clip.sourceUrl || "";
  sourceTitleInput.value = clip.sourceTitle || "";
  capturedAtInput.value = formatDateTime(clip.capturedAt);
  openSourceBtn.disabled = !clip.sourceUrl;

  await renderScreenshots(clip);

  sectionSelect.innerHTML = "";
  state.sections.forEach(sec => {
    const opt = document.createElement("option");
    opt.value = sec.id;
    opt.textContent = sec.name;
    if (sec.id === clip.sectionId) opt.selected = true;
    sectionSelect.appendChild(opt);
  });
  sectionSelect.disabled = false;
  textInput.disabled = false;
  titleInput.disabled = false;
  notesInput.disabled = false;
  tagsInput.disabled = false;
  sourceUrlInput.disabled = false;
  sourceTitleInput.disabled = false;
}

// ===============================================================
// EVENT HANDLERS
// ===============================================================

async function handleCreateTab() {
  const baseName = "New Tab";
  const newSection = await window.api.invoke(IPC.CREATE_SECTION, baseName);
  const normalized = {
    id: newSection.id,
    name: newSection.name || baseName,
    locked: !!newSection.locked,
    exportFolder: newSection.exportFolder || "",
    exportPath: newSection.exportPath || "",
    color: newSection.color || "",
    icon: newSection.icon || "",
    order: (state.tabs[state.tabs.length - 1]?.order || state.tabs.length) + 1,
    schema: DEFAULT_SCHEMA.slice(),
  };
  state.tabs.push(normalized);
  window.tabsState = { tabs: state.tabs, activeTabId: state.activeTabId || "all" };
  await window.api.invoke(IPC.SAVE_TABS, window.tabsState);
  syncSectionsFromTabs();
  state.currentSectionId = normalized.id;
  state.activeTabId = normalized.id;
  renderSectionsBar();
  renderClipList();
  updateExportPathDisplay();
  updateDeleteButtonsLockState();
  renderLockButtonState();
  scheduleSaveTabsConfig();
  await syncTabsToBackend();
}

async function assignExportFolder(sectionId) {
  const result = await window.api.invoke(IPC.CHOOSE_EXPORT_FOLDER);
  const folder = result && result.ok === false ? null : (result && result.path) || result;
  if (!folder) return;
  await updateSection(sectionId, { exportFolder: folder, exportPath: folder });
  const sec = state.sections.find((s) => s.id === sectionId);
  if (sec) {
    sec.exportFolder = folder;
    sec.exportPath = folder;
  }
  const stateTab = state.tabs.find((t) => t.id === sectionId);
  if (stateTab) stateTab.exportFolder = folder;
  const tabId = sectionId;
  const selectedPath = folder;
  const targetTab = (window.tabsState && window.tabsState.tabs) ? window.tabsState.tabs.find(t => t.id === tabId) : null;
  if (targetTab) {
    targetTab.exportPath = selectedPath;
  }
  window.tabsState = { tabs: state.tabs, activeTabId: state.activeTabId || "all" };
  await window.api.invoke(IPC.SAVE_TABS, window.tabsState);
  renderSectionsBar();
  updateExportPathDisplay();
  scheduleSaveTabsConfig();
}

async function selectTabColor(sectionId) {
  const sec = state.sections.find((s) => s.id === sectionId);
  if (!sec || !colorModal || !colorSwatches) return;
  state.pendingColorSection = sectionId;
  const startColor = sec.color && SNIPBOARD_COLORS.includes(sec.color) ? sec.color : (sec.color ? SNIPBOARD_COLORS[0] : "");
  state.selectedColor = startColor || "";
  renderColorPalette(colorSwatches, state.selectedColor, (color) => {
    state.selectedColor = color || "";
  }, true);
  colorModal.classList.add("is-open");
}

async function selectTabIcon(sectionId) {
  const sec = state.sections.find((s) => s.id === sectionId);
  if (!sec || !iconModal || !iconChoicesContainer) return;
  state.pendingIconSection = sectionId;
  state.selectedIcon = sec.icon || "";
  iconChoicesContainer.innerHTML = "";
  iconChoices.forEach((choice) => {
    const item = document.createElement("div");
    item.className = "icon-choice" + (state.selectedIcon === choice.icon ? " selected" : "");
    item.dataset.icon = choice.icon;
    item.textContent = `${choice.icon} ${choice.label}`;
    item.onclick = () => {
      state.selectedIcon = choice.icon;
      iconChoicesContainer.querySelectorAll(".icon-choice").forEach((c) => c.classList.remove("selected"));
      item.classList.add("selected");
    };
    iconChoicesContainer.appendChild(item);
  });
  iconModal.classList.add("is-open");
}

async function refreshData(selectId = null) {
  const data = await window.api.invoke(IPC.GET_DATA);
  state.clips = data.clips || [];
  updateSearchIndex(state.clips);
  syncLockedSectionsFromState();
  if (selectId) {
    state.currentClipId = selectId;
    state.selectedClipIds = new Set([selectId]);
  }
  pruneSelected();
  renderSections();
  renderClipList();
  await renderEditor();
  updateExportPathDisplay();
  updateDeleteButtonsLockState();
}

function currentSectionIdOrInbox() {
  if (state.currentSectionId && state.currentSectionId !== "all") return state.currentSectionId;
  return "inbox";
}

function bindHandlersOnce() {
  if (handlersBound) return;
  handlersBound = true;
  if (setExportBtn) setExportBtn.style.display = "none";
  if (clearExportBtn) clearExportBtn.style.display = "none";
  const exportActions = document.querySelector(".export-actions");
  if (exportActions) exportActions.style.display = "none";

  if (saveClipBtn) {
    saveClipBtn.onclick = async () => {
      const clip = getCurrentClip();
      if (!clip) return;

      clip.text = textInput.value;
      clip.title = titleInput.value;
      clip.notes = notesInput.value;
      clip.tags = tagsInput.value.split(",").map(s => s.trim()).filter(Boolean);
      clip.sectionId = sectionSelect.value || null;
      clip.sourceUrl = sourceUrlInput.value;
      clip.sourceTitle = sourceTitleInput.value;

      state.currentSectionId = clip.sectionId || "all";
      const saved = await window.api.invoke(IPC.SAVE_CLIP, clip);
      await refreshData(saved.id);
    };
  }

  if (newClipBtn) newClipBtn.onclick = createClipboardClip;
  if (newSnipBtn) newSnipBtn.onclick = createScreenSnip;
  if (addShotBtn) addShotBtn.onclick = addScreenshotToCurrent;
  if (deleteClipBtn) deleteClipBtn.onclick = async () => { await unifiedDelete(getSelectedClipIds()); };
  if (deleteSelectedBtn) deleteSelectedBtn.onclick = async () => { await unifiedDelete(getSelectedClipIds()); };
  if (listDeleteBtn) listDeleteBtn.onclick = async () => { await unifiedDelete(getSelectedClipIds()); };
  if (listAddBtn) listAddBtn.onclick = createClipboardClip;

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      state.searchText = searchInput.value || "";
      renderClipList();
    });
  }
  if (tagFilterInput) {
    tagFilterInput.addEventListener("input", () => {
      state.tagFilter = tagFilterInput.value || "";
      renderClipList();
    });
  }

  if (openSourceBtn) {
    openSourceBtn.onclick = () => {
      const clip = getCurrentClip();
      if (!clip || !clip.sourceUrl) return;
      window.api.invoke(IPC.OPEN_URL, clip.sourceUrl);
    };
  }

  if (setExportBtn) setExportBtn.onclick = null;
  if (clearExportBtn) clearExportBtn.onclick = null;
}
async function createClipboardClip() {
  const text = await window.api.invoke("get-clipboard-text");
  const fallbackTitle = "Clipboard Snip";
  const clip = {
    id: null,
    title: (text || "").split("\n")[0].slice(0, 80) || fallbackTitle,
    text: text || "",
    notes: "",
    tags: [],
    screenshots: [],
    sectionId: currentSectionIdOrInbox(),
    capturedAt: Date.now(),
  };
  state.currentSectionId = clip.sectionId;
  const saved = await window.api.invoke(IPC.SAVE_CLIP, clip);
  await refreshData(saved.id);
}

async function createScreenSnip() {
  try {
    const capture = await window.api.invoke(IPC.CAPTURE_SCREEN);
    if (!capture || !capture.success) {
      console.warn("[SnipBoard] captureScreen failed or returned empty payload", capture);
      return;
    }
    const filenames = Array.isArray(capture.screenshots)
      ? capture.screenshots.map((s) => s.filename)
      : [];
    if (Array.isArray(capture.screenshots)) {
      capture.screenshots.forEach((shot) => {
        // Optionally display previews using shot.dataUrl
        // e.g., add to UI if needed
      });
    }
    const clip = {
      id: null,
      title: "Screen Snip",
      text: "",
      notes: "",
      tags: [],
      screenshots: filenames,
      sectionId: currentSectionIdOrInbox(),
      capturedAt: Date.now(),
    };
  state.currentSectionId = clip.sectionId;
  const saved = await window.api.invoke(IPC.SAVE_CLIP, clip);
  await refreshData(saved.id);
  } catch (err) {
    console.error("[SnipBoard] createScreenSnip failed:", err);
  }
}

async function addScreenshotToCurrent() {
  const clip = getCurrentClip();
  if (!clip) return;
  try {
    const capture = await window.api.invoke(IPC.CAPTURE_SCREEN);
    if (!capture || !capture.success) {
      console.warn("[SnipBoard] captureScreen failed or returned empty payload", capture);
      return;
    }
    const filenames = Array.isArray(capture.screenshots)
      ? capture.screenshots.map((s) => s.filename)
      : [];
    if (Array.isArray(capture.screenshots)) {
      capture.screenshots.forEach((shot) => {
        // Optionally display previews using shot.dataUrl
      });
    }
    clip.screenshots = [...(clip.screenshots || []), ...filenames];
    const saved = await window.api.invoke(IPC.SAVE_CLIP, clip);
    await refreshData(saved.id);
  } catch (err) {
    console.error("[SnipBoard] addScreenshotToCurrent failed:", err);
  }
}

// ===============================================================
// INITIAL LOAD
// ===============================================================

async function init() {
  try {
    const data = await window.api.invoke(IPC.GET_DATA);
    const tabsConfig = await window.api.invoke(IPC.LOAD_TABS);
    const tabsFromConfig = normalizeTabs(tabsConfig?.tabs);
    const fallbackTabs = normalizeTabs(sectionsToTabs(data.sections || []));
    state.tabs = tabsFromConfig.length ? tabsFromConfig : fallbackTabs;
    state.sections = tabsToSections(state.tabs);
    state.activeTabId = tabsConfig?.activeTabId || state.tabs[0]?.id || "all";
    state.currentSectionId = state.activeTabId;
    state.clips = data.clips || [];
    updateSearchIndex(state.clips);
    syncLockedSectionsFromState();
    lastPollSignature = computeSignature(state.clips);
    state.searchText = searchInput ? searchInput.value || "" : "";
    state.tagFilter = tagFilterInput ? tagFilterInput.value || "" : "";

    renderSectionsBar();
    window.tabsState = {
      tabs: state.tabs,
      activeTabId: state.activeTabId || "all",
    };
    renderTabs();
    renderClipList();
    await renderEditor();
    updateExportPathDisplay();
    updateDeleteButtonsLockState();
    renderLockButtonState();
    updateSidebarHeader();
    bindHandlersOnce();
    await syncTabsToBackend();
  } catch (err) {
    console.error("[SnipBoard] init failed:", err);
  }

  setInterval(async () => {
    try {
      const data = await window.api.invoke(IPC.GET_DATA);
      const sig = computeSignature(data.clips || []);

      if (sig !== lastPollSignature) {
        state.clips = data.clips || [];
        updateSearchIndex(state.clips);
        syncLockedSectionsFromState();
        lastPollSignature = sig;
        pruneSelected();
        renderSectionsBar();
        renderClipList();
        await renderEditor();
        updateExportPathDisplay();
        updateDeleteButtonsLockState();
        renderLockButtonState();
      }
    } catch (err) {
      console.warn("Backend poll failed:", err);
    }
  }, 3000);
}

document.addEventListener("DOMContentLoaded", init);
if (document.readyState !== "loading") {
  init();
}
document.addEventListener("DOMContentLoaded", () => {
  const shotModal = document.getElementById("screenshotModal");
  if (shotModal) {
    shotModal.addEventListener("click", (evt) => {
      if (evt.target === shotModal || evt.target.classList.contains("shot-modal-backdrop")) {
        closeScreenshotModal();
      }
    });
  }

  const tabsWrapper = sectionTabs && sectionTabs.parentElement;
  if (tabsWrapper && sectionTabs && !document.getElementById("tabScrollLeft") && !document.getElementById("tabScrollRight")) {
    tabsWrapper.style.position = "relative";
    sectionTabs.style.overflowX = "auto";
    sectionTabs.style.whiteSpace = "nowrap";

    const scrollButton = (dir) => {
      const btn = document.createElement("button");
      btn.className = "tab-scroll-btn";
      btn.id = dir === "left" ? "tabScrollLeft" : "tabScrollRight";
      btn.textContent = dir === "left" ? "<" : ">";
      btn.style.position = "absolute";
      btn.style.top = "50%";
      btn.style.transform = "translateY(-50%)";
      btn.style[dir === "left" ? "left" : "right"] = "4px";
      btn.onclick = () => {
        sectionTabs.scrollBy({ left: dir === "left" ? -150 : 150, behavior: "smooth" });
      };
      tabsWrapper.appendChild(btn);
    };
    scrollButton("left");
    scrollButton("right");
  }
});








async function newSectionCreated(name) {
  const base = (name || "").trim();
  if (!base) return;
  try {
    const created = await window.api.invoke(IPC.CREATE_SECTION, base);
    if (created && created.id) {
      state.sections.push({
        id: created.id,
        name: created.name || base,
        locked: !!created.locked,
        exportPath: created.exportPath || "",
        exportFolder: created.exportFolder || created.exportPath || "",
        color: created.color || "",
        icon: created.icon || "",
      });
      state.currentSectionId = created.id;
    } else {
      const id = base.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\-]/g, "");
      state.sections.push({ id: id || base, name: base, locked: false, exportPath: "", exportFolder: "", color: "", icon: "" });
      state.currentSectionId = id || base;
    }
    renderSections();
    renderClipList();
  } catch (err) {
    console.error("[SnipBoard] newSectionCreated failed:", err);
  }
}

async function renameSection(id, newName) {
  const name = (newName || "").trim();
  if (!id || !name) return;
  try {
    const updated = await window.api.invoke(IPC.RENAME_SECTION, { id, name });
    if (updated && updated.section) {
      const idx = state.sections.findIndex((s) => s.id === id);
      if (idx >= 0) state.sections[idx] = updated.section;
    } else {
      const target = state.sections.find((s) => s.id === id);
      if (target) target.name = name;
    }
    const tab = state.tabs.find((t) => t.id === id);
    if (tab) tab.label = name;
    state.sections = tabsToSections(state.tabs);
    scheduleSaveTabsConfig();
    renderSections();
    window.tabsState = { tabs: state.tabs, activeTabId: state.activeTabId || "all" };
    await window.api.invoke(IPC.SAVE_TABS, window.tabsState);
  } catch (err) {
    console.error("[SnipBoard] renameSection failed:", err);
  }
}





function saveTabsState() {
  window.tabsState = {
    tabs: state.tabs.map((t, idx) => ({
      ...t,
      exportPath: t.exportPath || t.exportFolder || "",
      exportFolder: t.exportFolder || t.exportPath || "",
      order: Number.isFinite(t.order) ? t.order : idx,
    })),
    activeTabId: state.activeTabId || "all",
  };
  window.api.invoke(IPC.SAVE_TABS, window.tabsState);
}
