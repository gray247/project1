(function (global) {
  /**
   * Simple Tabs UI module honoring the new API contract.
   */
  function initTabs({ state = {}, dom = {}, ipc = {} } = {}) {
    const app = state;
    const doc = global.document;
    const sectionTabs = dom.sectionTabs || (doc ? doc.getElementById('sectionTabs') : null);
    const tabChangeListeners = [];
    let editorApi = null;
    let modalsApi = null;

    const getActiveTabId = () => app.activeTabId || 'all';
    const getActiveTab = () => (app.tabs || []).find((tab) => tab.id === getActiveTabId()) || null;
    const getActiveTabSchema = () => {
      const tab = getActiveTab();
      return tab && Array.isArray(tab.schema) && tab.schema.length ? tab.schema : [];
    };

    const setEditorApi = (api) => {
      editorApi = api;
    };

    const setModalsApi = (api) => {
      modalsApi = api;
    };

    const onTabChange = (callback) => {
      if (typeof callback === 'function') tabChangeListeners.push(callback);
    };

    const notifyTabChange = () => {
      const active = getActiveTab();
      tabChangeListeners.forEach((cb) => {
        try {
          cb(active);
        } catch (err) {
          console.warn('[SnipTabs] onTabChange handler failed', err);
        }
      });
    };

    const setActiveTab = (tabId) => {
      const targetId = tabId || 'all';
      if (app.activeTabId === targetId) return;
      app.activeTabId = targetId;
      app.currentSectionId = targetId;
      renderTabs();
      notifyTabChange();
    };

    const renderTabs = () => {
      if (!sectionTabs) return;
      sectionTabs.innerHTML = '';

      const renderButton = (tab, isAll = false) => {
        const el = doc ? doc.createElement('button') : null;
        if (!el) return null;
        el.type = 'button';
        el.className = 'section-pill';
        if ((isAll && getActiveTabId() === 'all') || (!isAll && tab && tab.id === getActiveTabId())) {
          el.classList.add('section-pill--active');
        }
        el.textContent = isAll ? 'All' : tab.label || tab.name || tab.id || 'Tab';
        el.dataset.sectionId = isAll ? 'all' : tab.id;
        el.onclick = () => setActiveTab(el.dataset.sectionId);
        return el;
      };

      const allButton = renderButton(null, true);
      if (allButton) sectionTabs.appendChild(allButton);

      (app.tabs || []).forEach((tab) => {
        const tabEl = renderButton(tab);
        if (tabEl) sectionTabs.appendChild(tabEl);
      });
    };

    return {
      getActiveTab,
      getActiveTabSchema,
      getActiveTabId,
      onTabChange,
      setEditorApi,
      setModalsApi,
      renderTabs,
    };
  }

  global.SnipTabs = { initTabs };
})(window);
