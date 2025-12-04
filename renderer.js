// ===============================================================
// SnipBoard – CLEAN WORKING RENDERER
// ===============================================================

console.log("[SnipBoard] renderer.js loaded");

let lockedSections = new Set(["common-prompts"]);

const state = {
  sections: [],
  clips: [],
  currentSectionId: "all",
  currentClipId: null,
  selectedClipIds: new Set(),
  searchText: "",
  tagFilter: "",
};

let lastPollSignature = "";

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
const lockSectionCheckbox = document.getElementById("lockSectionCheckbox");

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

function updateExportPathDisplay() {
  const currentSec = state.sections.find((s) => s.id === state.currentSectionId);
  if (!currentSec || state.currentSectionId === "all") {
    exportPathDisplay.textContent = "No section selected";
    setExportBtn.disabled = true;
    clearExportBtn.disabled = true;
    return;
  }
  setExportBtn.disabled = false;
  clearExportBtn.disabled = false;
  exportPathDisplay.textContent = currentSec.exportPath || "(not set)";
}

function isSectionLocked(sectionId) {
  if (!sectionId || sectionId === "all") return false;
  return lockedSections.has(sectionId);
}

function syncLockedSectionsFromState() {
  const persisted = state.sections.filter((s) => s.locked).map((s) => s.id);
  lockedSections = new Set([...lockedSections, ...persisted]);
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
  if (api.setSectionLocked) api.setSectionLocked(id, next);
  renderSections();
  updateDeleteButtonsLockState();
  renderLockButtonState();
};

function setCurrentSection(sectionId) {
  if (!sectionId) sectionId = "all";
  state.currentSectionId = sectionId;
  state.currentClipId = null;

  renderSections();
  renderClipList();
  renderEditor();
  updateExportPathDisplay();
  updateDeleteButtonsLockState();
  renderLockButtonState();
}

function renderLockButtonState() {
  if (!lockToggleBtn) return;
  const locked = isSectionLocked(state.currentSectionId);
  lockToggleBtn.textContent = locked ? "🔒" : "🔓";
  lockToggleBtn.title = "Lock this section";
}

if (lockToggleBtn) {
  lockToggleBtn.addEventListener("click", lockSectionCheckboxHandler);
}

async function renderScreenshots(clip) {
  screenshotBox.innerHTML = "";
  const shots = Array.isArray(clip.screenshots) ? clip.screenshots : [];
  for (const file of shots) {
    const check = await api.checkScreenshotExists(file);
    if (!check || !check.ok || !check.exists) {
      const missing = document.createElement("div");
      missing.className = "screenshot-missing";
      missing.textContent = "(screenshot missing)";
      screenshotBox.appendChild(missing);
      continue;
    }
    const img = document.createElement("img");
    img.className = "thumb screenshot-thumb";
    img.src = "file://" + check.fullPath.replace(/\\/g, "/");
    img.onerror = () => {
      console.warn("[SnipBoard] missing screenshot file:", img.src);
      img.remove();
      const missing = document.createElement("div");
      missing.className = "screenshot-missing";
      missing.textContent = "(screenshot missing)";
      screenshotBox.appendChild(missing);
    };
    img.addEventListener("dblclick", () => openScreenshotModal(img.src));
    img.addEventListener("click", () => openScreenshotModal(img.src));
    screenshotBox.appendChild(img);
  }
}

// ===============================================================
// RENDERING
// ===============================================================

function renderSections() {
  const sectionTabs = document.getElementById("sectionTabs");
  if (!sectionTabs) return;
  sectionTabs.innerHTML = "";

  const baseOrder = ["all", "inbox", "common-prompts", "black-skies", "errors", "misc"];
  const extras = state.sections.map((s) => s.id).filter((id) => !baseOrder.includes(id));
  const order = [...baseOrder, ...extras];

  order.forEach((id) => {
    const sec = state.sections.find((s) => s.id === id);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "section-pill";

    if (state.currentSectionId === id) btn.classList.add("section-pill--active");
    if (id !== "all" && lockedSections.has(id)) btn.classList.add("section-pill--locked");

    const labelSpan = document.createElement("span");
    labelSpan.textContent = sec?.name || sectionLabel(id);
    btn.appendChild(labelSpan);

    if (id !== "all") {
      const lockSpan = document.createElement("span");
      lockSpan.className = "section-pill__lock";
      lockSpan.textContent = lockedSections.has(id) ? "" : "";
      lockSpan.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (lockedSections.has(id)) lockedSections.delete(id);
        else lockedSections.add(id);

        if (lockSectionCheckbox && state.currentSectionId === id) {
          lockSectionCheckbox.checked = lockedSections.has(id);
        }
        if (api.setSectionLocked) api.setSectionLocked(id, lockedSections.has(id));
        renderSections();
      });
      btn.appendChild(lockSpan);
    }

    btn.addEventListener("click", () => {
      setCurrentSection(id);
    });

    sectionTabs.appendChild(btn);
  });

  // add-tab after built-ins
  const addTab = document.createElement("button");
  addTab.id = "addTabBtn";
  addTab.className = "section-pill add-tab";
  addTab.title = "Add Tab";
  addTab.textContent = "+ Add Tab";
  addTab.addEventListener("click", async () => {
    const name = window.prompt("New section name?");
    if (!name) return;
    const created = await api.createSection(name);
    if (created && created.id) {
      state.currentSectionId = created.id;
    }
    await refreshData();
    renderLockButtonState();
  });
  sectionTabs.appendChild(addTab);

  updateDeleteButtonsLockState();
  renderLockButtonState();
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

  let res;
  if (api.deleteClips) {
    res = await api.deleteClips(targets);
  } else {
    res = { blocked: [] };
    for (const id of targets) {
      const single = await api.deleteClip(id);
      if (single && single.blocked) {
        res.blocked.push(id);
      }
    }
  }

  if (res && (res.blocked === true || (Array.isArray(res.blocked) && res.blocked.length))) {
    alert("Unlock section first.");
    return;
  }

  const data = await api.getData();
  state.sections = data.sections || [];
  state.clips = data.clips || [];
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
      const titleMatch = (clip.title || "").toLowerCase().includes(searchTerm);
      const textMatch = (clip.text || "").toLowerCase().includes(searchTerm);
      if (!titleMatch && !textMatch) return false;
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

    const title = document.createElement("div");
    title.className = "clip-row__title";
    title.textContent = clip.title || "(untitled)";

    row.appendChild(checkbox);
    row.appendChild(thumb);
    row.appendChild(title);

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

async function renderEditor() {
  const clip = getCurrentClip();

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

  // section dropdown
  sectionSelect.innerHTML = "";
  state.sections.forEach(sec => {
    const opt = document.createElement("option");
    opt.value = sec.id;
    opt.textContent = sec.name;
    if (sec.id === clip.sectionId) opt.selected = true;
    sectionSelect.appendChild(opt);
  });
  const locked = isSectionLocked(state.currentSectionId);
  sectionSelect.disabled = locked;
  textInput.disabled = locked;
  titleInput.disabled = locked;
  notesInput.disabled = locked;
  tagsInput.disabled = locked;
  sourceUrlInput.disabled = locked;
  sourceTitleInput.disabled = locked;
}

// ===============================================================
// EVENT HANDLERS
// ===============================================================

async function refreshData(selectId = null) {
  const data = await api.getData();
  state.sections = data.sections || [];
  state.clips = data.clips || [];
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
  const saved = await api.saveClip(clip);
  await refreshData(saved.id);
};

async function createClipboardClip() {
  const text = await api.getClipboardText();
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
  const saved = await api.saveClip(clip);
  await refreshData(saved.id);
}

async function createScreenSnip() {
  try {
    const capture = await api.captureScreen();
    if (!capture || !capture.dataUrl) {
      console.warn("[SnipBoard] captureScreen returned empty payload");
      return;
    }
    const files = await api.saveScreenshot([{ dataUrl: capture.dataUrl }]);
    const filenames = (files || []).map((f) => f.filename);
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
  const saved = await api.saveClip(clip);
  await refreshData(saved.id);
  } catch (err) {
    console.error("[SnipBoard] createScreenSnip failed:", err);
  }
}

async function addScreenshotToCurrent() {
  const clip = getCurrentClip();
  if (!clip) return;
  try {
    const capture = await api.captureScreen();
    if (!capture || !capture.dataUrl) return;
    const files = await api.saveScreenshot([{ dataUrl: capture.dataUrl }]);
    const filenames = (files || []).map((f) => f.filename);
    clip.screenshots = [...(clip.screenshots || []), ...filenames];
    const saved = await api.saveClip(clip);
    await refreshData(saved.id);
  } catch (err) {
    console.error("[SnipBoard] addScreenshotToCurrent failed:", err);
  }
}

newClipBtn.onclick = createClipboardClip;
newSnipBtn.onclick = createScreenSnip;
addShotBtn.onclick = addScreenshotToCurrent;
deleteClipBtn.onclick = async () => {
  await unifiedDelete(getSelectedClipIds());
};
listAddBtn.onclick = createClipboardClip;

searchInput.addEventListener("input", () => {
  state.searchText = searchInput.value || "";
  renderClipList();
});
tagFilterInput.addEventListener("input", () => {
  state.tagFilter = tagFilterInput.value || "";
  renderClipList();
});

openSourceBtn.onclick = () => {
  const clip = getCurrentClip();
  if (!clip || !clip.sourceUrl) return;
  api.openUrl(clip.sourceUrl);
};

setExportBtn.onclick = async () => {
  if (!state.currentSectionId || state.currentSectionId === "all") return;
  const result = await api.chooseExportFolder();
  if (!result || !result.ok || !result.path) return;
  await api.setSectionExportPath(state.currentSectionId, result.path);
  await refreshData(state.currentClipId);
};

clearExportBtn.onclick = async () => {
  if (!state.currentSectionId || state.currentSectionId === "all") return;
  await api.setSectionExportPath(state.currentSectionId, "");
  await refreshData(state.currentClipId);
};

// ===============================================================
// INITIAL LOAD
// ===============================================================

async function init() {
  try {
    const data = await api.getData();
    state.sections = data.sections || [];
    state.clips = data.clips || [];
    syncLockedSectionsFromState();
    lastPollSignature = computeSignature(state.clips);
    state.searchText = searchInput.value || "";
    state.tagFilter = tagFilterInput.value || "";

    renderSections();
    renderClipList();
    await renderEditor();
    updateExportPathDisplay();
    updateDeleteButtonsLockState();
    renderLockButtonState();
  } catch (err) {
    console.error("[SnipBoard] init failed:", err);
  }

  // Poll backend for changes
  setInterval(async () => {
    try {
      const data = await api.getData();
      const sig = computeSignature(data.clips || []);

      if (sig !== lastPollSignature) {
        state.sections = data.sections || [];
        state.clips = data.clips || [];
        syncLockedSectionsFromState();
        lastPollSignature = sig;
        pruneSelected();
        renderSections();
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
document.addEventListener("DOMContentLoaded", () => {
  const shotModal = document.getElementById("screenshotModal");
  if (shotModal) {
    shotModal.addEventListener("click", (evt) => {
      if (evt.target === shotModal || evt.target.classList.contains("shot-modal-backdrop")) {
        closeScreenshotModal();
      }
    });
  }
});
