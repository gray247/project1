(function () {
  const {
    AppState,
    DEFAULT_SCHEMA,
    normalizeClip,
    updateSearchIndex,
  } = window.SnipState || {};

  const {
    CHANNELS,
    invoke: rawInvoke,
    safeInvoke,
  } = window.SnipIPC || {};

  const { initTabs } = window.SnipTabs || {};
  const { initClips } = window.SnipClips || {};
  const { initEditor } = window.SnipEditor || {};
  const { initModals } = window.SnipModals || {};

  const invoke = rawInvoke || (async () => {});
  const safeChannel = safeInvoke || invoke;

  const state = AppState || {
    tabs: [],
    sections: [],
    clips: [],
    activeTabId: 'all',
    currentClipId: null,
    searchQuery: '',
    tagFilter: '',
  };

  const sectionTabs = document.getElementById('sectionTabs');
  const clipList = document.getElementById('clipList');

  const titleInput = document.getElementById('titleInput');
  const textInput = document.getElementById('textInput');
  const notesInput = document.getElementById('notesInput');
  const tagsInput = document.getElementById('tagsInput');
  const capturedAtInput = document.getElementById('capturedAtInput');
  const sourceUrlInput = document.getElementById('sourceUrlInput');
  const sourceTitleInput = document.getElementById('sourceTitleInput');
  const screenshotBox = document.getElementById('screenshotContainer');

  const saveClipBtn = document.getElementById('saveClipBtn');
  const deleteClipBtn = document.getElementById('deleteClipBtn');
  const addShotBtn = document.getElementById('addShotBtn');

  const searchInput = document.getElementById('searchInput');
  const tagFilterInput = document.getElementById('tagFilterInput');
  const sortMenu = document.getElementById('sortMenu');

  const modalsApi = initModals
    ? initModals({
        state,
        ipc: { CHANNELS, invoke, safeInvoke },
        dom: {},
      })
    : null;

  const tabsApi = initTabs
    ? initTabs({
        state,
        ipc: { CHANNELS, invoke, safeInvoke },
        dom: { sectionTabs },
      })
    : null;

  const clipsApi = initClips
    ? initClips({
        state,
        ipc: { CHANNELS, invoke, safeInvoke },
        dom: { clipListContainer: clipList },
      })
    : null;

  const editorApi = initEditor
    ? initEditor({
        state,
        ipc: { CHANNELS, invoke, safeInvoke },
        dom: {
          titleInput,
          textInput,
          notesInput,
          tagsInput,
          capturedAtInput,
          sourceUrlInput,
          sourceTitleInput,
          screenshotBox,
        },
        helpers: {
          normalizeClip,
          DEFAULT_SCHEMA,
        },
      })
    : null;

  if (tabsApi?.setEditorApi) tabsApi.setEditorApi(editorApi);
  if (clipsApi?.setEditorApi) clipsApi.setEditorApi(editorApi);
  if (tabsApi?.setModalsApi) tabsApi.setModalsApi(modalsApi);
  if (clipsApi?.setModalsApi) clipsApi.setModalsApi(modalsApi);

  tabsApi?.onTabChange?.(() => {
    const schema = tabsApi.getActiveTabSchema?.() || DEFAULT_SCHEMA;
    editorApi?.applySchemaVisibility?.(schema);
    clipsApi?.renderClipList?.();
  });

  clipsApi?.onClipSelected?.((clip) => {
    state.currentClipId = clip?.id || null;
    const schema =
      tabsApi?.getActiveTabSchema?.() || clip?.schema || DEFAULT_SCHEMA;
    editorApi?.applySchemaVisibility?.(schema);
    editorApi?.loadClipIntoEditor?.(clip);
  });

  const computeSignature = (clips = []) =>
    clips
      .map((clip) => `${clip.id}:${clip.updatedAt || clip.capturedAt || ''}`)
      .join('|');

  let lastSignature = '';

  const hydrateState = (payload = {}) => {
    state.clips = (payload.clips || state.clips || []).map(normalizeClip);
    state.tabs = payload.tabs || state.tabs;
    state.activeTabId =
      payload.activeTabId || state.activeTabId || state.tabs[0]?.id || 'all';
    state.currentSectionId = state.activeTabId;
    state.searchIndex = updateSearchIndex(state.clips);
    lastSignature = computeSignature(state.clips);
    state.currentClipId = state.currentClipId || state.clips[0]?.id || null;
  };

  const renderAll = () => {
    tabsApi?.renderTabs?.();
    clipsApi?.renderClipList?.();
    const activeClip =
      state.clips.find((clip) => clip.id === state.currentClipId) ||
      state.clips[0] ||
      null;
    state.currentClipId = activeClip?.id || null;
    editorApi?.loadClipIntoEditor?.(activeClip);
    const schema =
      tabsApi?.getActiveTabSchema?.() || activeClip?.schema || DEFAULT_SCHEMA;
    editorApi?.applySchemaVisibility?.(schema);
  };

  const refreshData = async () => {
    const data = await safeChannel(CHANNELS.GET_DATA);
    const tabsConfig = await safeChannel(CHANNELS.LOAD_TABS);
    hydrateState({
      clips: data?.clips,
      tabs: tabsConfig?.tabs,
      activeTabId: tabsConfig?.activeTabId,
    });
    renderAll();
  };

  const pollBackend = () => {
    setInterval(async () => {
      try {
        const payload = await safeChannel(CHANNELS.GET_DATA);
        const signature = computeSignature(payload?.clips || []);
        if (signature !== lastSignature) {
          hydrateState({ clips: payload?.clips });
          renderAll();
        }
      } catch (err) {
        console.warn('[SnipBoard] poll failed', err);
      }
    }, 3000);
  };

  const bindToolbar = () => {
    if (saveClipBtn) {
      saveClipBtn.addEventListener('click', () => editorApi?.saveClip?.());
    }
    if (deleteClipBtn) {
      deleteClipBtn.addEventListener('click', () => editorApi?.deleteClip?.());
    }
    if (addShotBtn) {
      addShotBtn.addEventListener('click', async () => {
        await invoke(CHANNELS.CAPTURE_SCREEN);
        await refreshData();
      });
    }
  };

  const bindFilters = () => {
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        state.searchQuery = searchInput.value.trim();
        clipsApi?.renderClipList?.();
      });
    }
    if (tagFilterInput) {
      tagFilterInput.addEventListener('input', () => {
        state.tagFilter = tagFilterInput.value.trim();
        clipsApi?.renderClipList?.();
      });
    }
    if (sortMenu) {
      sortMenu.addEventListener('change', () => {
        state.sortMode = sortMenu.value || 'default';
        clipsApi?.renderClipList?.();
      });
    }
  };

  const init = async () => {
    await refreshData();
    renderAll();
    bindToolbar();
    bindFilters();
    editorApi?.bindEditorEvents?.();
    pollBackend();
  };

  document.addEventListener('DOMContentLoaded', init);
  if (document.readyState !== 'loading') {
    init();
  }
})();
