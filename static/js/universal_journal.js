/**
 * 1C:ENTERPRISE - UNIVERSAL DOCUMENT JOURNAL CONTROLLER
 * static/js/universal_journal.js
 */


function JournalInstance(windowId, docType, options = {}) {
  this.windowId = windowId || "universalJournalWindow";
  this.windowElement = options.element || ((typeof document !== "undefined" && document.getElementById) ? document.getElementById(this.windowId) : null);
  this.activeDocType = docType || "РеализацияТоваровУслуг";
  const meta = this.getDocMeta ? this.getDocMeta(this.activeDocType) : { title: "Реализация товаров и услуг", icon: "🚚" };
  this.docTitle = options.title || meta.title;
  this.icon = options.icon || meta.icon;
  this.startDateStr = "";
  this.endDateStr = "";
  this.items = [];
  this.filteredItems = [];
  this.columns = [];
  this.selectedRow = null;
  this.selectedColKey = null;
  this.currentSortCol = "date";
  this.currentSortAsc = false;
  this.searchMatchMode = "contains";
  this._columnSelectedForFind = false;
  this.activeFilters = [];
  this.activePresetName = "";
  this.listCache = new Map();
  this._listAbortController = null;
  this._listReady = false;
  this._listKey = null;
  this._paused = false;
  this._lastScrollTop = 0;
  this._renderRaf = null;
  this._scrollScheduled = false;
  this._searchDebounceTimer = null;
  this._filterDebounceTimer = null;
  this.hasMoreDocs = true;
  this.lastRenderedStart = -1;
  this.lastRenderedEnd = -1;
  this.rowHeight = 21;
  this._virtualScroll = {
    rowHeight: 21,
    visibleCount: 40,
    bufferCount: 20,
    lastRenderedStart: 0
  };
}

const _UniversalJournalTarget = {
  instances: {},
  _winCounter: 1,
  lastActiveInstanceId: "universalJournalWindow",

  getEl: function(id) {
    if (this.windowElement && this.windowElement.querySelector) {
      const scoped = this.windowElement.querySelector(`[data-uj="${id}"], #${id}_${this.windowId}, #${id}, .${id}`);
      if (scoped) return scoped;
    }
    const win = (this.windowId && typeof document !== "undefined" && document.getElementById) ? document.getElementById(this.windowId) : null;
    if (win && win.querySelector) {
      const scoped = win.querySelector(`[data-uj="${id}"], #${id}_${this.windowId}, #${id}, .${id}`);
      if (scoped) return scoped;
    }
    return (typeof document !== "undefined" && document.getElementById) ? document.getElementById(id) : null;
  },

  getActiveInstance: function(eventOrWinId) {
    if (typeof eventOrWinId === "string" && this.instances[eventOrWinId]) {
      this.lastActiveInstanceId = eventOrWinId;
      return this.instances[eventOrWinId];
    }
    let winId = null;
    if (eventOrWinId && eventOrWinId.target && eventOrWinId.target.closest) {
      const win = eventOrWinId.target.closest(".mdi-window");
      if (win && win.id) winId = win.id;
    }
    if (!winId && typeof MdiManager !== "undefined" && MdiManager.activeWindowId) {
      winId = MdiManager.activeWindowId;
    }
    if (winId && this.instances[winId]) {
      this.lastActiveInstanceId = winId;
      return this.instances[winId];
    }
    if (this.lastActiveInstanceId && this.instances[this.lastActiveInstanceId]) {
      return this.instances[this.lastActiveInstanceId];
    }
    const keys = Object.keys(this.instances);
    if (keys.length > 0) {
      return this.instances[keys[keys.length - 1]];
    }
    if (!this.instances["universalJournalWindow"]) {
      this.instances["universalJournalWindow"] = new JournalInstance("universalJournalWindow", "РеализацияТоваровУслуг");
    }
    return this.instances["universalJournalWindow"];
  },

  getInstance: function(winId) {
    return this.instances[winId] || this.getActiveInstance(winId);
  },

  open: function(defaultDocType) {
    return this.openDirect(defaultDocType);
  },

  openDirect: function(docType, options = {}) {
    const targetType = docType || "РеализацияТоваровУслуг";
    const meta = this.getDocMeta ? this.getDocMeta(targetType) : { title: targetType, icon: "🗂️" };
    const forceNew = !!options.forceNew;

    // 1. If not forcing new instance, activate already open window of this docType
    if (!forceNew) {
      for (const [id, inst] of Object.entries(this.instances)) {
        if (inst && inst.activeDocType === targetType) {
          const winEl = inst.windowElement || ((typeof document !== "undefined" && document.getElementById) ? document.getElementById(id) : null);
          if (winEl && winEl.style.display !== "none") {
            if (typeof MdiManager !== "undefined") {
              MdiManager.activateWindow(id);
            }
            this.lastActiveInstanceId = id;
            return id;
          }
        }
      }
    }

    // 2. Generate window ID
    let winId = options.windowId;
    if (!winId) {
      const safeType = targetType.replace(/[^a-zA-Z0-9_\u0400-\u04FF]/g, "_");
      if (!forceNew && !this.instances[`ujWin_${safeType}`]) {
        winId = `ujWin_${safeType}`;
      } else {
        this._winCounter = (this._winCounter || 1) + 1;
        winId = `ujWin_${safeType}_${this._winCounter}`;
      }
    }

    // 3. Obtain or clone DOM element
    let winEl = (typeof document !== "undefined" && document.getElementById) ? document.getElementById(winId) : null;
    let isCloned = false;

    if (!winEl && typeof document !== "undefined" && document.getElementById) {
      const baseWin = document.getElementById("universalJournalWindow");
      if (baseWin && winId !== "universalJournalWindow") {
        winEl = baseWin.cloneNode(true);
        winEl.id = winId;
        isCloned = true;

        // Scope internal element IDs and set data-uj
        winEl.querySelectorAll("[id]").forEach(el => {
          el.dataset.uj = el.id;
          el.id = `${el.id}_${winId}`;
        });

        // Calculate staggered offset
        const winCount = (typeof MdiManager !== "undefined" && MdiManager.windows) ? Object.keys(MdiManager.windows).length : 1;
        const offset = (winCount * 26) % 180;
        winEl.style.top = `${25 + offset}px`;
        winEl.style.left = `${30 + offset}px`;
        winEl.style.width = "calc(100% - 70px)";
        winEl.style.height = "calc(100% - 60px)";
        winEl.style.display = "flex";
        winEl.classList.remove("minimized");
        if (typeof MdiManager !== "undefined" && typeof MdiManager.shouldBeMaximized === "function" && MdiManager.shouldBeMaximized(winId)) {
          winEl.classList.add("maximized");
        }

        // Set header title and icon
        const countMatch = winId.match(/_(\d+)$/);
        const instanceNumber = countMatch ? ` (${countMatch[1]})` : "";
        const displayTitle = options.title || `${meta.title}${instanceNumber}`;
        const titleEl = winEl.querySelector(".mdi-win-title-text, [data-uj='ujWindowTitle']");
        if (titleEl) titleEl.textContent = displayTitle;
        const iconEl = winEl.querySelector(".mdi-win-icon, [data-uj='ujWindowIcon']");
        if (iconEl) iconEl.textContent = meta.icon;

        // Wire window header buttons
        const closeBtn = winEl.querySelector(".mdi-win-btn-close");
        if (closeBtn) {
          closeBtn.removeAttribute("onclick");
          closeBtn.onclick = (e) => {
            e.stopPropagation();
            UniversalJournal.close(winId);
          };
        }
        const maxBtn = winEl.querySelector(".mdi-win-btn-max");
        if (maxBtn) {
          maxBtn.removeAttribute("onclick");
          maxBtn.onclick = (e) => {
            e.stopPropagation();
            if (typeof MdiManager !== "undefined") MdiManager.toggleMaximize(winId);
          };
        }
        const minBtn = winEl.querySelector(".mdi-win-btn-min");
        if (minBtn) {
          minBtn.removeAttribute("onclick");
          minBtn.onclick = (e) => {
            e.stopPropagation();
            if (typeof MdiManager !== "undefined") MdiManager.minimizeWindow(winId);
          };
        }
        const newBtn = winEl.querySelector(".mdi-win-btn-new");
        if (newBtn) {
          newBtn.removeAttribute("onclick");
          newBtn.onclick = (e) => {
            e.stopPropagation();
            UniversalJournal.duplicateWindow(winId);
          };
        }
        const header = winEl.querySelector(".mdi-window-header");
        if (header) {
          header.removeAttribute("ondblclick");
          header.ondblclick = (e) => {
            if (e.target.closest(".mdi-win-btn, .window-btn-close")) return;
            if (typeof MdiManager !== "undefined") MdiManager.toggleMaximize(winId);
          };
        }

        winEl.setAttribute("onmousedown", `MdiManager.activateWindow('${winId}')`);

        const ws = document.getElementById("mdiWorkspace");
        if (ws) ws.appendChild(winEl);
      } else if (baseWin && winId === "universalJournalWindow") {
        winEl = baseWin;
        winEl.style.display = "flex";
        winEl.classList.remove("minimized");
      }
    } else if (winEl) {
      winEl.style.display = "flex";
      winEl.classList.remove("minimized");
    }

    const countMatch = winId.match(/_(\d+)$/);
    const instanceNumber = countMatch ? ` (${countMatch[1]})` : "";
    const displayTitle = options.title || `${meta.title}${instanceNumber}`;

    // 4. Register with MdiManager
    if (typeof MdiManager !== "undefined" && winEl) {
      MdiManager.registerWindow(winId, {
        title: displayTitle,
        icon: meta.icon,
        element: winEl,
        closeFn: () => {
          UniversalJournal.close(winId);
        }
      });
      MdiManager.activateWindow(winId);
    }

    // 5. Create or get instance
    let instance = this.instances[winId];
    if (!instance) {
      instance = new JournalInstance(winId, targetType, {
        element: winEl,
        title: displayTitle,
        icon: meta.icon,
        isCloned: isCloned
      });
      this.instances[winId] = instance;
    } else {
      instance.windowElement = winEl;
      instance.activeDocType = targetType;
      instance.docTitle = displayTitle;
      instance.icon = meta.icon;
    }

    this.lastActiveInstanceId = winId;

    // 6. Set docType select value
    const sel = instance.getEl("ujDocTypeSelect");
    if (sel) sel.value = targetType;

    // 7. Load documents
    instance.loadDocuments({ force: true });
    return winId;
  },

  duplicateWindow: function(sourceWinId) {
    const srcId = sourceWinId || this.lastActiveInstanceId || (typeof MdiManager !== "undefined" ? MdiManager.activeWindowId : null);
    const src = this.instances[srcId] || this.getActiveInstance();
    const docType = src ? src.activeDocType : "РеализацияТоваровУслуг";
    return this.openDirect(docType, { forceNew: true });
  },

  openNewWindow: function(docType) {
    if (docType) {
      return this.openDirect(docType, { forceNew: true });
    }
    return this.duplicateWindow(this.lastActiveInstanceId);
  },

  close: function(winId) {
    const targetId = winId || this.lastActiveInstanceId || (typeof MdiManager !== "undefined" ? MdiManager.activeWindowId : null) || "universalJournalWindow";
    const inst = this.instances[targetId];
    if (inst) {
      inst.clearRenderAndState();
      inst.pauseLoading();
      inst.updateBottomLoadingState(false);
      delete this.instances[targetId];
    }
    if (typeof MdiManager !== "undefined") {
      MdiManager.closeWindow(targetId);
    }
    const winEl = (typeof document !== "undefined" && document.getElementById) ? document.getElementById(targetId) : null;
    if (winEl) {
      if (targetId === "universalJournalWindow") {
        winEl.style.display = "none";
      } else {
        winEl.remove();
      }
    }
    if (this.lastActiveInstanceId === targetId) {
      const remaining = Object.keys(this.instances);
      this.lastActiveInstanceId = remaining.length ? remaining[remaining.length - 1] : null;
    }
  },

  onPeriodSelected: function(startDate, endDate) {
    const inst = this.getActiveInstance();
    if (inst) {
      inst.startDateStr = startDate;
      inst.endDateStr = endDate;
      inst.updatePeriodLabel();
      inst.loadDocuments({ force: true });
    }
  },

  openPeriodPicker: function(e) {
    const inst = this.getActiveInstance(e || (typeof window !== "undefined" ? window.event : null));
    if (!inst) return;
    this.lastActiveInstanceId = inst.windowId;
    if (typeof PeriodPicker !== "undefined" && typeof PeriodPicker.open === "function") {
      PeriodPicker.open({
        startDate: inst.startDateStr,
        endDate: inst.endDateStr,
        onSelect: (start, end) => {
          inst.startDateStr = start;
          inst.endDateStr = end;
          inst.updatePeriodLabel();
          inst.loadDocuments({ force: true });
        }
      });
    }
  },

  activeDocType: "РеализацияТоваровУслуг",
  docTitle: "Реализация товаров и услуг",
  startDateStr: "",
  endDateStr: "",
  items: [],
  filteredItems: [],
  columns: [],
  selectedRow: null,
  currentSortCol: "date",
  currentSortAsc: false, // Descending by default
  searchMatchMode: "contains",
  _columnSelectedForFind: false,

  // ==========================================
  // Smart Background Prefetch & Memory Cache Engine
  // ==========================================
  prefetchCache: new Map(),
  prefetchQueue: [],
  activePrefetchCount: 0,
  maxConcurrentPrefetches: 1, // STA COM safe concurrency
  prefetchAbortController: null,

  clearPrefetchCache: function() {
    if (this.prefetchAbortController) {
      try { this.prefetchAbortController.abort(); } catch (e) {}
    }
    this.prefetchAbortController = new AbortController();
    this.prefetchCache.clear();
    this.prefetchQueue = [];
    this.activePrefetchCount = 0;
    console.log("[PREFETCH] Cache cleared and memory released on journal close/reset.");
  },

  getPrefetchedPriceDoc: function(docNumber) {
    if (!docNumber) return null;
    const key = `УстановкаЦенНоменклатуры_${docNumber}`;
    const entry = this.prefetchCache.get(key) || this.prefetchCache.get(docNumber);
    if (entry && entry.status === "ready" && entry.data) {
      return entry.data;
    }
    return null;
  },

  getPendingPrefetchPromise: function(docNumber) {
    if (!docNumber) return null;
    const key = `УстановкаЦенНоменклатуры_${docNumber}`;
    const entry = this.prefetchCache.get(key) || this.prefetchCache.get(docNumber);
    if (entry && entry.status === "pending" && entry.promise) {
      return entry.promise;
    }
    return null;
  },

  invalidatePrefetch: function(docNumber) {
    if (!docNumber) return;
    const key = `УстановкаЦенНоменклатуры_${docNumber}`;
    this.prefetchCache.delete(key);
    this.prefetchCache.delete(docNumber);
  },

  attachScrollPrefetchListener: function() {
    // Disabled: prevents continuous /api/documents/details spam in background
  },

  queueVisibleDocumentsForPrefetch: function() {
    // Disabled: document details load on demand when user clicks/edits
  },

  processPrefetchQueue: function() {
    // Disabled
  },

  init: function() {
    // Check remembered period first (if "Запомнить выбранный период" was checked)
    const remembered = (window.PeriodPicker && typeof PeriodPicker.getRememberedPeriod === "function") 
      ? PeriodPicker.getRememberedPeriod() 
      : null;

    if (remembered && (remembered.startDate || remembered.endDate)) {
      this.startDateStr = remembered.startDate || "";
      this.endDateStr = remembered.endDate || "";
    } else {
      // Default period: Current month
      const now = new Date();
      const curYear = now.getFullYear();
      const curMonth = String(now.getMonth() + 1).padStart(2, "0");
      const lastDay = new Date(curYear, now.getMonth() + 1, 0).getDate();
      this.startDateStr = `01.${curMonth}.${curYear}`;
      this.endDateStr = `${String(lastDay).padStart(2, "0")}.${curMonth}.${curYear}`;
    }
    this.updatePeriodLabel();
    this.loadActiveFiltersFromStorage();
    this.updateActiveFilterBadgeUI();
  },

  getDocMeta: function(docType) {
    const metaMap = {
      "РеализацияТоваровУслуг": { title: "Реализация товаров и услуг", icon: "🚚" },
      "ВозвратТоваровОтПокупателя": { title: "Возврат товаров от покупателя", icon: "🔄" },
      "ПогрузкиМашин": { title: "Погрузка машин", icon: "🚛" },
      "ПогрузкаМашин": { title: "Погрузка машин", icon: "🚛" },
      "УстановкаЦенНоменклатуры": { title: "Установка цен номенклатуры", icon: "🏷️" },
      "ПоступлениеТоваровУслуг": { title: "Поступление товаров и услуг", icon: "📥" },
      "ЗаказПокупателя": { title: "Заказ покупателя", icon: "🛒" },
      "ИнвентаризацияТоваровНаСкладе": { title: "Инвентаризация товаров на складе", icon: "📦" },
      "СписаниеТоваров": { title: "Списание товаров", icon: "📉" },
      "ОприходованиеТоваров": { title: "Оприходование товаров", icon: "📈" }
    };
    return metaMap[docType] || { title: docType || "Журнал документов", icon: "🗂️" };
  },

  open: function(defaultDocType) {
    return this.openDirect(defaultDocType || this.activeDocType || "РеализацияТоваровУслуг");
  },

  clearRenderAndState: function() {
    this.pauseLoading();
    this.clearPrefetchCache();
    if (this._listAbortController) {
      try { this._listAbortController.abort(); } catch(e) {}
      this._listAbortController = null;
    }
    if (this.listCache) this.listCache.clear();
    this.items = [];
    this.filteredItems = [];
    this.selectedRow = null;
    this._listReady = false;
    this._listKey = null;
    this.columns = [];
    this.activeDocType = null;
    const tbody = this.getEl("ujTableBody");
    if (tbody) tbody.innerHTML = "";
    const searchInp = this.getEl("ujSearchInput");
    if (searchInp) searchInp.value = "";
    const countEl = this.getEl("ujTotalRowsCount");
    if (countEl) countEl.textContent = "0";
    const emptyEl = this.getEl("ujEmptyState");
    if (emptyEl) emptyEl.style.display = "none";
    const loadingEl = this.getEl("ujLoadingState");
    if (loadingEl) loadingEl.style.display = "none";
    this.updateEditButtonState();
  },

  _openDirectProto: function(docType) {
    const targetType = docType || this.activeDocType || "РеализацияТоваровУслуг";
    const meta = this.getDocMeta(targetType);

    // 1. Immediately wipe DOM table, clear cached items and cancel pending requests
    this.clearPrefetchCache();
    if (this._listAbortController) {
      try { this._listAbortController.abort(); } catch(e) {}
      this._listAbortController = null;
    }
    if (this.listCache) this.listCache.clear();
    this.items = [];
    this.filteredItems = [];
    this.selectedRow = null;
    this._listReady = false;
    this._listKey = null;
    this.columns = [];
    this.activeDocType = targetType;
    this.docTitle = meta.title;

    const tbody = this.getEl("ujTableBody");
    if (tbody) {
      tbody.innerHTML = "";
    }
    const loadingStateEl = this.getEl("ujLoadingState");
    const loadingText = (loadingStateEl && loadingStateEl.querySelector) ? loadingStateEl.querySelector("div:nth-child(2)") : null;
    if (loadingText) {
      loadingText.textContent = `1C: Загрузка документов [${meta.title}]...`;
    }

    const sel = this.getEl("ujDocTypeSelect");
    if (sel && sel.value !== targetType) {
      sel.value = targetType;
    }

    const remembered = (window.PeriodPicker && typeof PeriodPicker.getRememberedPeriod === "function") 
      ? PeriodPicker.getRememberedPeriod() 
      : null;

    if (remembered && (remembered.startDate || remembered.endDate)) {
      this.startDateStr = remembered.startDate || "";
      this.endDateStr = remembered.endDate || "";
      this.updatePeriodLabel();
    } else if (!this.startDateStr) {
      this.init();
    }

    const win = document.getElementById("universalJournalWindow");
    if (win) {
      const titleEl = win.querySelector(".mdi-win-title-text, #ujWindowTitle");
      if (titleEl) titleEl.textContent = meta.title;
      const iconEl = win.querySelector(".mdi-win-icon, #ujWindowIcon");
      if (iconEl) iconEl.textContent = meta.icon;
    }

    this._paused = false;

    if (window.MdiManager) {
      MdiManager.activateWindow("universalJournalWindow", {
        title: meta.title,
        icon: meta.icon,
        closeFn: () => {
          this.close();
        }
      });
      if (MdiManager.windows && MdiManager.windows["universalJournalWindow"]) {
        MdiManager.windows["universalJournalWindow"].title = meta.title;
        MdiManager.windows["universalJournalWindow"].icon = meta.icon;
        if (typeof MdiManager.renderTaskbar === "function") {
          MdiManager.renderTaskbar();
        }
      }
    } else if (win) {
      win.style.display = "flex";
      win.classList.remove("minimized");
      win.classList.add("active");
    }

    this.loadActiveFiltersFromStorage();
    this.activePresetName = "";
    this.updateActiveFilterBadgeUI();
    this.updateEditButtonState();

    // ALWAYS load fresh documents from backend for this doc type
    this.loadDocuments({ force: true });
  },

  _closeProto: function() {
    this.clearRenderAndState();
    if (this._bgTimer) {
      clearTimeout(this._bgTimer);
      this._bgTimer = null;
    }
    this.updateBottomLoadingState(false);
    if (window.MdiManager) {
      MdiManager.closeWindow("universalJournalWindow");
    } else {
      const win = document.getElementById("universalJournalWindow");
      if (win) win.style.display = "none";
    }
  },

  onDocTypeChange: function() {
    const sel = this.getEl("ujDocTypeSelect");
    if (!sel) return;
    this.openDirect(sel.value);
  },

  openPeriodPicker: function() {
    PeriodPicker.open({
      startDate: this.startDateStr,
      endDate: this.endDateStr,
      onSelect: (startStr, endStr) => {
        this.startDateStr = startStr;
        this.endDateStr = endStr;
        this.updatePeriodLabel();
        this.loadDocuments();
      }
    });
  },

  updatePeriodLabel: function() {
    const lbl = this.getEl("ujPeriodLabel");
    if (!lbl) return;

    const toDateOnly = (s) => {
      if (!s) return "";
      const m = String(s).trim().match(/^(\d{1,2}\.\d{1,2}\.\d{4})/);
      return m ? m[1] : s.split(" ")[0];
    };

    const sDate = toDateOnly(this.startDateStr);
    const eDate = toDateOnly(this.endDateStr);

    if (sDate && eDate) {
      lbl.textContent = `[ ${sDate} - ${eDate} ]`;
      lbl.style.color = "#002060";
    } else if (sDate && !eDate) {
      lbl.textContent = `[ с ${sDate} ]`;
      lbl.style.color = "#002060";
    } else if (!sDate && eDate) {
      lbl.textContent = `[ по ${eDate} ]`;
      lbl.style.color = "#002060";
    } else {
      lbl.textContent = "(Весь период)";
      lbl.style.color = "#555";
    }

    if (this.startDateStr || this.endDateStr) {
      lbl.title = `Интервал: ${this.startDateStr || '...'} — ${this.endDateStr || '...'}`;
    } else {
      lbl.title = "Период не установлен (Весь период)";
    }
  },

  formatDateForBackend: function(dStr, isEnd = false) {
    if (!dStr) return "";
    const s = String(dStr).trim();
    const mDot = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{1,2}):(\d{1,2}))?/);
    if (mDot) {
      const yyyy = mDot[3];
      const mm = mDot[2].padStart(2, "0");
      const dd = mDot[1].padStart(2, "0");
      const timePart = mDot[4] !== undefined
        ? `${mDot[4].padStart(2, "0")}:${mDot[5].padStart(2, "0")}:${mDot[6].padStart(2, "0")}`
        : (isEnd ? "23:59:59" : "00:00:00");
      return `${yyyy}-${mm}-${dd} ${timePart}`;
    }
    const mIso = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2}):(\d{1,2}))?/);
    if (mIso) {
      const yyyy = mIso[1];
      const mm = mIso[2].padStart(2, "0");
      const dd = mIso[3].padStart(2, "0");
      const timePart = mIso[4] !== undefined
        ? `${mIso[4].padStart(2, "0")}:${mIso[5].padStart(2, "0")}:${mIso[6].padStart(2, "0")}`
        : (isEnd ? "23:59:59" : "00:00:00");
      return `${yyyy}-${mm}-${dd} ${timePart}`;
    }
    return s;
  },

  formatDateTime: function(val) {
    if (!val) return "";
    const s = String(val).trim();
    const mIso = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2}):(\d{1,2}))?/);
    if (mIso) {
      const [_, y, m, d, hh, mm, ss] = mIso;
      return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y} ${hh || "00"}:${mm || "00"}:${ss || "00"}`;
    }
    const mDot = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{1,2}):(\d{1,2}))?/);
    if (mDot) {
      const [_, d, m, y, hh, mm, ss] = mDot;
      return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y} ${hh || "00"}:${mm || "00"}:${ss || "00"}`;
    }
    return s;
  },

  parseFullDateTimeMs: function(dStr, isEnd = false) {
    if (!dStr) return null;
    const s = String(dStr).trim();
    const mDot = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (mDot) {
      const hh = mDot[4] !== undefined ? parseInt(mDot[4], 10) : (isEnd ? 23 : 0);
      const mm = mDot[5] !== undefined ? parseInt(mDot[5], 10) : (isEnd ? 59 : 0);
      const ss = mDot[6] !== undefined ? parseInt(mDot[6], 10) : (isEnd ? 59 : 0);
      return new Date(parseInt(mDot[3], 10), parseInt(mDot[2], 10) - 1, parseInt(mDot[1], 10), hh, mm, ss).getTime();
    }
    const mIso = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (mIso) {
      const hh = mIso[4] !== undefined ? parseInt(mIso[4], 10) : (isEnd ? 23 : 0);
      const mm = mIso[5] !== undefined ? parseInt(mIso[5], 10) : (isEnd ? 59 : 0);
      const ss = mIso[6] !== undefined ? parseInt(mIso[6], 10) : (isEnd ? 59 : 0);
      return new Date(parseInt(mIso[1], 10), parseInt(mIso[2], 10) - 1, parseInt(mIso[3], 10), hh, mm, ss).getTime();
    }
    const parsed = Date.parse(s);
    return isNaN(parsed) ? null : parsed;
  },

  initialChunkLimit: 2000,
  backgroundChunkLimit: 2000,
  currentLoadSessionId: 0,
  isLoadingBackground: false,
  hasMoreDocs: false,
  lastDocDate: null,
  lastDocNumber: null,
  _bgTimer: null,
  _searchDebounceTimer: null,
  isServerFiltered: false,
  listCache: new Map(),
  _listKey: null,
  _listReady: false,
  _listAbortController: null,
  _paused: false,
  _loadAllRemaining: false,
  _nextChunkRequested: false,

  setFullLoadCursor: function(loading) {
    document.documentElement?.classList.toggle("uj-loading-all", loading);
  },

  requestMoreDocuments: function(loadAll = false) {
    if (!this.isJournalActive() || !this.hasMoreDocs) return;
    if (loadAll) {
      this.loadDocuments({ all: true, force: true });
      return;
    }
    this._paused = false;
    if (!this._listAbortController || this._listAbortController.signal.aborted) this._listAbortController = new AbortController();
    if (this.isLoadingBackground) return;
    this._nextChunkRequested = true;
    this.scheduleBackgroundChunk(this.currentLoadSessionId);
  },

  getListKey: function(search = "", filters = []) {
    const creds = window.SessionManager ? SessionManager.getCredentials() : {};
    return JSON.stringify([creds.server, creds.ref, creds.user, this.activeDocType,
      this.startDateStr, this.endDateStr, search, filters,
      search ? (this.activeSearchColKey || this.selectedColKey || "") : "",
      search ? this.searchMatchMode : ""]);
  },

  saveListCache: function() {
    if (!this._listKey || !this._listReady) return;
    this.listCache.delete(this._listKey);
    this.listCache.set(this._listKey, {
      items: this.items.slice(), columns: this.defaultColumns, title: this.docTitle,
      scrollTop: this.getEl("ujTableWrapper")?.scrollTop || 0,
      hasMore: this.hasMoreDocs, lastDate: this.lastDocDate, lastNumber: this.lastDocNumber,
      serverFiltered: this.isServerFiltered
    });
    // Bound memory use while keeping recently opened sections available.
    while (this.listCache.size > 12) this.listCache.delete(this.listCache.keys().next().value);
  },

  pauseLoading: function() {
    this._loadAllRemaining = this._nextChunkRequested = false;
    this.setFullLoadCursor(false);
    this.saveListCache();
    this.currentLoadSessionId++;
    if (this._listAbortController) this._listAbortController.abort();
    if (this._bgTimer) clearTimeout(this._bgTimer);
    if (this._searchDebounceTimer) clearTimeout(this._searchDebounceTimer);
    this._bgTimer = this._searchDebounceTimer = null;
    this.isLoadingBackground = false;
    this._paused = true;
    this.updateBottomLoadingState(false);
    const loading = this.getEl("ujLoadingState");
    if (loading) loading.style.display = "none";
  },

  isJournalActive: function() {
    if (typeof MdiManager !== "undefined" && MdiManager.activeWindowId) {
      const myId = this.windowId || "universalJournalWindow";
      if (MdiManager.activeWindowId !== myId) return false;
    }
    const win = this.windowElement || ((typeof document !== "undefined" && document.getElementById) ? document.getElementById(this.windowId || "universalJournalWindow") : null);
    return Boolean(win && win.style.display !== "none");
  },

  onWindowActivityChange: function(id) {
    // In MDI desktop, background loading must never be aborted when focusing other windows!
    if (id === "universalJournalWindow" && this._paused) {
      this._paused = false;
      const query = this._listQuery || { search: "", filters: [] };
      if (this._listReady && this._listKey === this.getListKey(query.search, query.filters)) {
        this._listAbortController = new AbortController();
        if (this.hasMoreDocs) this.scheduleBackgroundChunk(this.currentLoadSessionId);
      } else {
        this.executeSearchOrFilter();
      }
    }
  },

  updateBottomLoadingState: function(isLoading) {
    const indicator = this.getEl("ujBottomLoadingIndicator");
    if (indicator) {
      if (isLoading && this.hasMoreDocs) {
        indicator.style.display = "flex";
      } else {
        indicator.style.display = "none";
      }
    }
  },

  loadDocuments: function(options = {}) {
    this._loadAllRemaining = Boolean(options.all);
    this._nextChunkRequested = false;
    this.setFullLoadCursor(Boolean(options.all));
    this.loadSortPreference();
    this.saveListCache();
    if (!this.isJournalActive()) return;
    this._paused = false;
    if (this._listAbortController) this._listAbortController.abort();
    this._listAbortController = new AbortController();
    this.clearPrefetchCache();
    if (this._bgTimer) {
      clearTimeout(this._bgTimer);
      this._bgTimer = null;
    }
    this.currentLoadSessionId = (this.currentLoadSessionId || 0) + 1;
    const sessionId = this.currentLoadSessionId;
    this.isLoadingBackground = false;
    this.hasMoreDocs = false;
    this.lastDocDate = null;
    this.lastDocNumber = null;
    this.updateBottomLoadingState(false);

    const searchInp = this.getEl("ujSearchInput");
    const querySearch = (options.search !== undefined) ? options.search : "";
    const queryFilters = (options.filters !== undefined) ? options.filters : (this.activeFilters || []);
    const activeCrits = (queryFilters || []).filter(c => c && c.enabled !== false);

    const isFilteredQuery = Boolean(querySearch || activeCrits.length > 0);
    this._listQuery = { search: querySearch, filters: activeCrits,
      search_field: this.activeSearchColKey || this.selectedColKey || "",
      search_mode: this.searchMatchMode,
      include_nomenclatures: activeCrits.some(c => c.fieldKey === "nomenclature") || Boolean(options.include_nomenclatures) };
    this.isServerFiltered = isFilteredQuery;
    const nextKey = this.getListKey(querySearch, activeCrits);
    const keepTableVisible = options.force && this._listKey === nextKey && this.items.length > 0;
    this._listKey = nextKey;
    const requestKey = this._listKey;
    this._listReady = false;
    if (options.force) this.listCache.delete(this._listKey);
    const cachedList = this.listCache.get(this._listKey);
    if (cachedList && !(activeCrits.length > 0 && cachedList.hasMore)) {
      this.items = cachedList.items.slice();
      this.selectedRow = null;
      this.docTitle = cachedList.title;
      this.loadColumnsConfig(cachedList.columns);
      this.hasMoreDocs = cachedList.hasMore;
      this.lastDocDate = cachedList.lastDate;
      this.lastDocNumber = cachedList.lastNumber;
      this._listReady = true;
      const title = this.getEl("ujWindowTitle");
      if (title) title.textContent = `Журнал документов: ${this.docTitle}`;
      const loading = this.getEl("ujLoadingState");
      if (loading) loading.style.display = "none";
      const wrapper = this.getEl("ujTableWrapper");
      if (wrapper) wrapper.scrollTop = 0;
      this.applyFiltersAndSearch();
      if (wrapper && cachedList.scrollTop) {
        wrapper.scrollTop = cachedList.scrollTop;
        this.updateVirtualRows();
      }
      if (this.hasMoreDocs) this.scheduleBackgroundChunk(sessionId);
      return;
    }

    const loadingEl = this.getEl("ujLoadingState");
    const emptyEl = this.getEl("ujEmptyState");

    if (loadingEl) loadingEl.style.display = !options.all && (keepTableVisible || options.background) ? "none" : "flex";
    if (emptyEl) emptyEl.style.display = "none";

    const loadingStateEl = this.getEl("ujLoadingState");
    const loadingText = (loadingStateEl && loadingStateEl.querySelector) ? loadingStateEl.querySelector("div:nth-child(2)") : null;
    if (options.all) {
      this.updateStatus("Загрузка всех документов выбранного периода...");
      if (loadingText) loadingText.textContent = `1C: Загрузка всех документов [${this.docTitle || ''}]...`;
    } else if (isFilteredQuery) {
      const msg = querySearch ? `1C: Прямой поиск: "${querySearch}"...` : `1C: Прямой отбор (${activeCrits.length} условий)...`;
      this.updateStatus(msg);
      if (loadingText) loadingText.textContent = msg;
    } else {
      this.updateStatus("Загрузка списка документов из 1C...");
      if (loadingText) loadingText.textContent = `1C: Загрузка документов [${this.docTitle || ''}]...`;
    }

    const hasNomFilter = activeCrits.some(c => c && c.fieldKey === "nomenclature" && c.enabled !== false);
    const creds = window.SessionManager ? SessionManager.getCredentials() : {};
    const payload = {
      ...creds,
      doc_type: this.activeDocType,
      date_from: this.formatDateForBackend(this.startDateStr, false),
      date_to: this.formatDateForBackend(this.endDateStr, true),
      search: querySearch,
      search_field: this._listQuery.search_field,
      search_mode: this._listQuery.search_mode,
      filters: activeCrits,
      include_nomenclatures: hasNomFilter || Boolean(options.include_nomenclatures),
      limit: options.all ? 0 : this.initialChunkLimit,
      offset: 0
    };

    fetch("/api/documents/list", {
      method: "POST",
      signal: this._listAbortController.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(async data => {
      if (sessionId !== this.currentLoadSessionId || requestKey !== this.getListKey(querySearch, activeCrits)) return;
      // Filters must publish one complete result, never successive partial lists.
      if (activeCrits.length > 0 && data.success && data.has_more) {
        const collected = [...(data.items || [])];
        let page = data;
        while (page.has_more) {
          if (sessionId !== this.currentLoadSessionId || requestKey !== this.getListKey(querySearch, activeCrits)) return;
          const response = await fetch("/api/documents/list", {
            method: "POST", signal: this._listAbortController.signal,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...payload, limit: this.backgroundChunkLimit,
              offset: collected.length, last_date: "", last_number: "" })
          });
          page = await response.json();
          if (sessionId !== this.currentLoadSessionId) return;
          if (!page.success) throw new Error(page.error || "Не удалось загрузить полный отбор");
          if (page.has_more && !(page.items || []).length) throw new Error("Пустая страница при загрузке отбора");
          collected.push(...(page.items || []));
          this.updateStatus(`Подготовка полного отбора: ${collected.length} документов...`);
        }
        data = { ...data, items: collected, has_more: false,
          last_date: page.last_date, last_number: page.last_number };
      }
      if (sessionId !== this.currentLoadSessionId) return;
      if (requestKey !== this.getListKey(querySearch, activeCrits)) return;
      if (loadingEl) loadingEl.style.display = "none";
      if (options.all) {
        this._loadAllRemaining = false;
        this.setFullLoadCursor(false);
      }

      if (!data.success) {
        this.lastDiagnostics = {
          timestamp: new Date().toLocaleTimeString(),
          docType: this.activeDocType,
          docTitle: this.docTitle,
          period: {
            startDate: this.startDateStr || "(Весь период)",
            endDate: this.endDateStr || "(Весь период)"
          },
          search: querySearch,
          filters: JSON.parse(JSON.stringify(activeCrits || [])),
          responseSuccess: false,
          rawCount: 0,
          filteredCount: 0,
          serverDebug: null,
          error: data.error || "Sənədlər yüklənə bilmədi"
        };
        const badge = this.getEl("ujDebugBadge");
        if (badge) {
          badge.style.display = "inline";
          badge.textContent = "!";
          badge.style.background = "#d32f2f";
          badge.title = "Ошибка: " + data.error;
        }

        const errTbody = this.getEl("ujTableBody");
        if (errTbody) {
          errTbody.innerHTML = `<tr><td colspan="30" style="text-align: center; color: #d32f2f; padding: 40px; font-size: 13px;">⚠️ 1C Xətası: ${escapeHtml(data.error || "Sənədlər yüklənə bilmədi")}</td></tr>`;
        }

        alert("1C Xətası: " + (data.error || "Sənədlər yüklənə bilmədi"));
        this.updateStatus("Ошибка: " + data.error);
        this.updateBottomLoadingState(false);
        return;
      }

      this.docTitle = data.doc_title || this.activeDocType;
      this.loadColumnsConfig(data.columns || []);

      let rawItems = data.items || [];
      const startMs = this.parseFullDateTimeMs(this.startDateStr, false);
      const endMs = this.parseFullDateTimeMs(this.endDateStr, true);
      if (startMs !== null || endMs !== null) {
        rawItems = rawItems.filter(it => {
          const itMs = this.parseFullDateTimeMs(it.date);
          if (itMs === null) return true;
          if (startMs !== null && itMs < startMs) return false;
          if (endMs !== null && itMs > endMs) return false;
          return true;
        });
      }
      this.items = rawItems;
      this._listReady = true;
      this.filteredItems = rawItems;
      this.lastDocDate = data.last_date || null;
      this.lastDocNumber = data.last_number || null;

      // Update Window Header
      const titleEl = this.getEl("ujWindowTitle");
      if (titleEl) titleEl.textContent = `Журнал документов: ${this.docTitle}`;

      // Save diagnostic snapshot
      this.lastDiagnostics = {
        timestamp: new Date().toLocaleTimeString(),
        docType: this.activeDocType,
        docTitle: this.docTitle,
        period: {
          startDate: this.startDateStr || "(Весь период)",
          endDate: this.endDateStr || "(Весь период)"
        },
        search: querySearch,
        filters: JSON.parse(JSON.stringify(activeCrits || [])),
        responseSuccess: true,
        rawCount: rawItems.length,
        filteredCount: rawItems.length,
        serverDebug: data.debug_info || null,
        error: null
      };

      // When search or filter is active: verify with client-side filter and display full result
      if (isFilteredQuery) {
        this.hasMoreDocs = Boolean(data.has_more);
        this.saveListCache();
        this.updateBottomLoadingState(false);
        this.applyFiltersAndSearch();
        this.lastDiagnostics.filteredCount = this.filteredItems.length;

        const badge = this.getEl("ujDebugBadge");
        if (badge) {
          if (this.filteredItems.length === 0) {
            badge.style.display = "inline";
            badge.textContent = "0";
            badge.style.background = "#e65100";
            badge.title = "0 результатов по заданному отбору/поиску";
          } else {
            badge.style.display = "none";
          }
        }

        this.updateStatus(`Найдено: ${this.filteredItems.length} документов${this.hasMoreDocs ? " (загрузка остальных результатов...)" : ""}`);
        this.updateCountBadge(`${this.hasMoreDocs ? "Загружено" : "Всего"}: ${this.filteredItems.length}`);
        this.updateActiveFilterBadgeUI();
        this.updateFilterButtonsState();
        if (this.hasMoreDocs) this.scheduleBackgroundChunk(sessionId);
        if (options.all) {
          const wrapper = this.getEl("ujTableWrapper");
          if (wrapper) { wrapper.scrollTop = wrapper.scrollHeight; this.updateVirtualRows(); }
        }
        return;
      }

      const badge = this.getEl("ujDebugBadge");
      if (badge) badge.style.display = "none";

      this.hasMoreDocs = Boolean(data.has_more);
      this.saveListCache();

      // Check and apply startup default filter or active session filter
      this.checkAndApplyStartupFilter();

      // Schedule background chunk loading if more documents exist
      if (this.hasMoreDocs) {
        this.updateStatus(`Загружено ${this.items.length} документов. Продолжение при прокрутке.`);
        this.updateBottomLoadingState(false);
        this.scheduleBackgroundChunk(sessionId);
      } else {
        this.updateBottomLoadingState(false);
        this.updateStatus(`Загружено ${this.items.length} документов`);
      }
      if (options.all) {
        const wrapper = this.getEl("ujTableWrapper");
        if (wrapper) { wrapper.scrollTop = wrapper.scrollHeight; this.updateVirtualRows(); }
      }
    })
    .catch(err => {
      if (sessionId !== this.currentLoadSessionId) return;
      if (loadingEl) loadingEl.style.display = "none";
      this._loadAllRemaining = false;
      this.setFullLoadCursor(false);
      this.updateBottomLoadingState(false);
      console.error("Error loading documents:", err);
      this.updateStatus("Ошибка сети при загрузке документов");
      if (err.name !== "AbortError") {
        const errTbody = this.getEl("ujTableBody");
        if (errTbody) {
          errTbody.innerHTML = `<tr><td colspan="30" style="text-align: center; color: #d32f2f; padding: 40px; font-size: 13px;">⚠️ Şəbəkə / 1C Xətası: ${escapeHtml(err.message || String(err))}</td></tr>`;
        }
      }

      this.lastDiagnostics = {
        timestamp: new Date().toLocaleTimeString(),
        docType: this.activeDocType,
        docTitle: this.docTitle,
        period: {
          startDate: this.startDateStr || "(Весь период)",
          endDate: this.endDateStr || "(Весь период)"
        },
        search: querySearch,
        filters: JSON.parse(JSON.stringify(activeCrits || [])),
        responseSuccess: false,
        rawCount: 0,
        filteredCount: 0,
        serverDebug: null,
        error: err.message || String(err)
      };
      const badge = this.getEl("ujDebugBadge");
      if (badge) {
        badge.style.display = "inline";
        badge.textContent = "!";
        badge.style.background = "#d32f2f";
        badge.title = "Сетевая ошибка: " + (err.message || String(err));
      }
    });
  },

  scheduleBackgroundChunk: function(sessionId) {
    if (sessionId !== this.currentLoadSessionId) return;
    if (!this.isJournalActive()) return;
    if (!this.hasMoreDocs) return;
    if (!this._loadAllRemaining && !this._nextChunkRequested) return;

    if (this._bgTimer) clearTimeout(this._bgTimer);
    this._bgTimer = setTimeout(() => {
      this.fetchNextChunk(sessionId);
    }, 120);
  },

  fetchNextChunk: function(sessionId) {
    if (sessionId !== this.currentLoadSessionId) return;
    if (!this.isJournalActive()) return;
    if (!this.hasMoreDocs) {
      this.updateBottomLoadingState(false);
      return;
    }
    if (this.isLoadingBackground) return;
    this._nextChunkRequested = false;

    this.isLoadingBackground = true;
    this.updateBottomLoadingState(true);

    const creds = window.SessionManager ? SessionManager.getCredentials() : {};
    const payload = {
      ...creds,
      doc_type: this.activeDocType,
      date_from: this.formatDateForBackend(this.startDateStr, false),
      date_to: this.formatDateForBackend(this.endDateStr, true),
      last_date: this.isServerFiltered ? "" : (this.lastDocDate || ""),
      last_number: this.isServerFiltered ? "" : (this.lastDocNumber || ""),
      search: this._listQuery?.search || "",
      search_field: this._listQuery?.search_field || "",
      search_mode: this._listQuery?.search_mode || "contains",
      filters: this._listQuery?.filters || [],
      include_nomenclatures: Boolean(this._listQuery?.include_nomenclatures),
      limit: this.backgroundChunkLimit,
      offset: this.items.length
    };
    const requestKey = this.getListKey(payload.search, payload.filters);

    fetch("/api/documents/list", {
      method: "POST",
      signal: this._listAbortController.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
      if (sessionId !== this.currentLoadSessionId) return;
      if (requestKey !== this.getListKey(payload.search, payload.filters)) return;
      this.isLoadingBackground = false;

      if (!data.success) {
        this._loadAllRemaining = false;
        this.setFullLoadCursor(false);
        console.warn("[UNIVERSAL JOURNAL] Background chunk fetch error:", data.error);
        this.updateBottomLoadingState(false);
        return;
      }

      let newItems = data.items || [];
      const startMs = this.parseFullDateTimeMs(this.startDateStr, false);
      const endMs = this.parseFullDateTimeMs(this.endDateStr, true);
      if (startMs !== null || endMs !== null) {
        newItems = newItems.filter(it => {
          const itMs = this.parseFullDateTimeMs(it.date);
          if (itMs === null) return true;
          if (startMs !== null && itMs < startMs) return false;
          if (endMs !== null && itMs > endMs) return false;
          return true;
        });
      }
      if (newItems.length > 0) {
        const existingMap = new Map();
        for (let i = 0; i < this.items.length; i++) {
          const it = this.items[i];
          const k = it.id || it.number;
          if (k) existingMap.set(k, i);
        }

        let updatedCount = 0;
        let addedCount = 0;
        for (const newItem of newItems) {
          const k = newItem.id || newItem.number;
          if (k && existingMap.has(k)) {
            const idx = existingMap.get(k);
            const oldItem = this.items[idx];
            // If data_version changed in 1C, update row in-place
            if (newItem.data_version && oldItem.data_version && newItem.data_version !== oldItem.data_version) {
              this.items[idx] = newItem;
              updatedCount++;
            }
          } else {
            this.items.push(newItem);
            if (k) existingMap.set(k, this.items.length - 1);
            addedCount++;
          }
        }

        // Re-apply filters and search, preserving scroll position
        this.applyFiltersAndSearch(true);
      }

      this.hasMoreDocs = Boolean(data.has_more);
      this.lastDocDate = data.last_date || null;
      this.lastDocNumber = data.last_number || null;
      this.saveListCache();

      if (this.hasMoreDocs) {
        this.updateStatus(this._loadAllRemaining ? `Загрузка всех документов: ${this.items.length}...` : `Загружено ${this.items.length} документов. Продолжение при прокрутке.`);
        this.updateBottomLoadingState(this._loadAllRemaining);
        this.scheduleBackgroundChunk(sessionId);
      } else {
        this._loadAllRemaining = false;
        this.setFullLoadCursor(false);
        this.updateBottomLoadingState(false);
        this.updateStatus(`Все документы загружены (${this.items.length} документов)`);
      }
    })
    .catch(err => {
      if (sessionId !== this.currentLoadSessionId) return;
      this._loadAllRemaining = false;
      this.setFullLoadCursor(false);
      this.isLoadingBackground = false;
      this.updateBottomLoadingState(false);
      console.warn("[UNIVERSAL JOURNAL] Background chunk network error:", err);
    });
  },

  // ==========================================
  // Column Configuration & Persistence Engine
  // ==========================================
  defaultColumns: [],

  getStorageKey: function() {
    return "uj_columns_config_" + (this.activeDocType || "default");
  },

  loadColumnsConfig: function(rawColumns) {
    if (rawColumns && Array.isArray(rawColumns)) {
      this.defaultColumns = JSON.parse(JSON.stringify(rawColumns));
    }

    const savedJson = localStorage.getItem(this.getStorageKey());
    let saved = null;
    if (savedJson) {
      try { saved = JSON.parse(savedJson); } catch (e) {}
    }

    if (saved && Array.isArray(saved) && saved.length > 0) {
      const merged = [];
      const defaultMap = new Map((this.defaultColumns || []).map(c => [c.key, c]));

      // 1. Saved order and settings
      for (const sc of saved) {
        if (defaultMap.has(sc.key)) {
          const def = defaultMap.get(sc.key);
          let w = Number(sc.width || def.width || 100);
          if (sc.key === "date" && w < 140) w = 145;
          merged.push({
            ...def,
            ...sc,
            label: sc.label || def.label,
            visible: sc.visible !== false,
            width: w,
            autoWidth: Boolean(sc.autoWidth)
          });
          defaultMap.delete(sc.key);

          // If golovnoy_kontragent or agent were not in saved config, insert them near kontragent
          if (sc.key === "kontragent") {
            if (defaultMap.has("golovnoy_kontragent")) {
              const gkDef = defaultMap.get("golovnoy_kontragent");
              merged.push({ ...gkDef, visible: true, width: Number(gkDef.width || 180), autoWidth: false });
              defaultMap.delete("golovnoy_kontragent");
            }
            if (defaultMap.has("agent")) {
              const agDef = defaultMap.get("agent");
              merged.push({ ...agDef, visible: true, width: Number(agDef.width || 140), autoWidth: false });
              defaultMap.delete("agent");
            }
          }
        }
      }

      // 2. Append new columns not present in saved config
      for (const [_, def] of defaultMap.entries()) {
        merged.push({
          ...def,
          visible: true,
          width: Number(def.width || 100),
          autoWidth: false
        });
      }

      this.columns = merged;
    } else {
      this.columns = (this.defaultColumns || []).map(c => ({
        ...c,
        visible: true,
        width: Number(c.width || 100),
        autoWidth: false
      }));
    }
  },

  saveColumnsConfig: function() {
    const toSave = this.columns.map(c => ({
      key: c.key,
      label: c.label,
      visible: c.visible !== false,
      width: Number(c.width || 100),
      autoWidth: Boolean(c.autoWidth)
    }));
    localStorage.setItem(this.getStorageKey(), JSON.stringify(toSave));
  },

  getVisibleColumns: function() {
    return (this.columns || []).filter(c => c.visible !== false);
  },

  rowHeight: 22,
  lastRenderedStart: -1,
  lastRenderedEnd: -1,

  renderTable: function() {
    this.renderTableHead();
    const tbody = this.getEl("ujTableBody");
    const emptyEl = this.getEl("ujEmptyState");
    if (!tbody) return;

    if (this.filteredItems.length === 0) {
      tbody.innerHTML = "";
      if (emptyEl) emptyEl.style.display = "flex";
      return;
    }

    if (emptyEl) emptyEl.style.display = "none";

    this.lastRenderedStart = -1;
    this.lastRenderedEnd = -1;
    this.attachVirtualScrollListener();
    this.updateVirtualRows();
  },

  attachVirtualScrollListener: function() {
    const wrapper = this.getEl("ujTableWrapper");
    if (!wrapper || wrapper._hasVirtualScroll) return;
    wrapper._hasVirtualScroll = true;
    let draggingScrollbar = false;
    let scrollbarReleasedAt = 0;
    let lastScrollTop = wrapper.scrollTop;
    wrapper.addEventListener("pointerdown", event => {
      const rect = wrapper.getBoundingClientRect();
      const scrollbarWidth = Math.max(12, wrapper.offsetWidth - wrapper.clientWidth);
      draggingScrollbar = event.clientX >= rect.right - scrollbarWidth;
    });
    document.addEventListener("pointerup", () => {
      if (draggingScrollbar) scrollbarReleasedAt = performance.now();
      draggingScrollbar = false;
    });

    let ticking = false;
    wrapper.addEventListener("scroll", () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          this.updateVirtualRows();

          // Infinite scroll on scrollbar pull near bottom
          const scrollBottom = wrapper.scrollHeight - wrapper.scrollTop - wrapper.clientHeight;
          const movingDown = wrapper.scrollTop > lastScrollTop;
          lastScrollTop = wrapper.scrollTop;
          if (movingDown && scrollBottom < Math.max(600, wrapper.clientHeight * 2) && this.hasMoreDocs) {
            this.requestMoreDocuments((draggingScrollbar || performance.now() - scrollbarReleasedAt < 200) && scrollBottom <= 8);
          }

          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  },

  updateVirtualRows: function() {
    const wrapper = this.getEl("ujTableWrapper");
    const tbody = this.getEl("ujTableBody");
    if (!wrapper || !tbody) return;

    const totalCount = this.filteredItems.length;
    if (totalCount === 0) {
      tbody.innerHTML = "";
      return;
    }

    const clientHeight = wrapper.clientHeight || 500;
    const bottomClearance = 28; // Clearance so the last row is never covered by the horizontal scrollbar
    const maxScrollTop = Math.max(0, (totalCount * this.rowHeight + bottomClearance) - clientHeight);
    if (wrapper.scrollTop > maxScrollTop) wrapper.scrollTop = maxScrollTop;
    const scrollTop = wrapper.scrollTop;
    const buffer = 15;

    let startIdx = Math.max(0, Math.floor(scrollTop / this.rowHeight) - buffer);
    let endIdx = Math.min(totalCount, Math.ceil((scrollTop + clientHeight) / this.rowHeight) + buffer);

    if (startIdx === this.lastRenderedStart && endIdx === this.lastRenderedEnd) {
      return;
    }

    this.lastRenderedStart = startIdx;
    this.lastRenderedEnd = endIdx;

    const visibleCols = this.getVisibleColumns();
    const colCount = Math.max(1, visibleCols.length);

    const topSpacerHeight = startIdx * this.rowHeight;
    const bottomSpacerHeight = (totalCount - endIdx) * this.rowHeight + bottomClearance;

    const chunks = [];

    if (topSpacerHeight > 0) {
      chunks.push(`<tr style="height: ${topSpacerHeight}px; border: none;"><td colspan="${colCount}" style="padding: 0; border: none; height: ${topSpacerHeight}px; background: transparent;"></td></tr>`);
    }

    for (let i = startIdx; i < endIdx; i++) {
      chunks.push(this.renderRowHtml(this.filteredItems[i], i, visibleCols));
    }

    if (bottomSpacerHeight > 0) {
      chunks.push(`<tr style="height: ${bottomSpacerHeight}px; border: none;"><td colspan="${colCount}" style="padding: 0; border: none; height: ${bottomSpacerHeight}px; background: transparent;"></td></tr>`);
    }

    tbody.innerHTML = chunks.join("");
  },

  renderRowHtml: function(row, i, visibleCols) {
    if (!visibleCols) visibleCols = this.getVisibleColumns();
    const isSelected = this.selectedRow && this.selectedRow.number === row.number;
    const defaultBg = (i % 2 === 1) ? "#f7f6f0" : "#ffffff";
    const rowBg = isSelected ? "#dceaf7" : defaultBg;
    const textColor = "#111111";

    let statusIconHtml = "";
    if (row.deleted) {
      statusIconHtml = `<span title="Помечен на удаление" style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;">
        <svg width="14" height="15" viewBox="0 0 14 15" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M2 1.5C2 1.22386 2.22386 1 2.5 1H9L12 4V13.5C12 13.7761 11.7761 14 11.5 14H2.5C2.22386 14 2 13.7761 2 13.5V1.5Z" fill="#FFFFFF" stroke="#7A8A9E" stroke-width="1"/>
          <path d="M9 1V4H12" fill="#E8EEF5" stroke="#7A8A9E" stroke-width="1"/>
          <path d="M3.5 4.5L10.5 11.5M10.5 4.5L3.5 11.5" stroke="#D32F2F" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </span>`;
    } else if (row.posted) {
      statusIconHtml = `<span title="Проведен" style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;">
        <svg width="14" height="15" viewBox="0 0 14 15" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M2 1.5C2 1.22386 2.22386 1 2.5 1H9L12 4V13.5C12 13.7761 11.7761 14 11.5 14H2.5C2.22386 14 2 13.7761 2 13.5V1.5Z" fill="#FFFFFF" stroke="#7A8A9E" stroke-width="1"/>
          <path d="M9 1V4H12" fill="#E8EEF5" stroke="#7A8A9E" stroke-width="1"/>
          <line x1="4" y1="5.5" x2="7.5" y2="5.5" stroke="#C0D0E0" stroke-width="1"/>
          <path d="M1.5 9.5L4.5 12.5L12.5 3.5" stroke="#2E7D32" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>`;
    } else {
      statusIconHtml = `<span title="Не проведен (Черновик)" style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;">
        <svg width="14" height="15" viewBox="0 0 14 15" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M2 1.5C2 1.22386 2.22386 1 2.5 1H9L12 4V13.5C12 13.7761 11.7761 14 11.5 14H2.5C2.22386 14 2 13.7761 2 13.5V1.5Z" fill="#FFFFFF" stroke="#7A8A9E" stroke-width="1"/>
          <path d="M9 1V4H12" fill="#E8EEF5" stroke="#7A8A9E" stroke-width="1"/>
          <line x1="4" y1="6" x2="10" y2="6" stroke="#B0C0D0" stroke-width="1"/>
          <line x1="4" y1="8.5" x2="10" y2="8.5" stroke="#B0C0D0" stroke-width="1"/>
          <line x1="4" y1="11" x2="8" y2="11" stroke="#B0C0D0" stroke-width="1"/>
        </svg>
      </span>`;
    }

    const cells = [];
    for (let c = 0; c < visibleCols.length; c++) {
      const col = visibleCols[c];
      const key = col.key;
      const activeCell = isSelected && key === this.selectedColKey;
      const selectionStyle = activeCell ? "background:#316ac5;color:#ffffff;" : (isSelected ? "background:#dceaf7;color:#111111;" : "");
      let val = row[key];

      const wStyle = col.autoWidth ? "" : `width: ${col.width}px; min-width: ${col.width}px; max-width: ${col.width}px;`;

      if (key === "status") {
        cells.push(`<td class="${activeCell ? 'c1-cell-active' : ''}" data-col-key="status" style="${selectionStyle}width: 30px; min-width: 30px; max-width: 30px; padding: 2px; text-align: center; border: 1px solid #d4d0c8; user-select: text;" onclick="UniversalJournal.selectCell(${i}, 'status', this, event)">${statusIconHtml}</td>`);
        continue;
      }

      if (key === "amount" && typeof val === "number") {
        val = val.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }

      if (key === "date" && val) {
        val = this.formatDateTime(val);
      }

      const align = col.align || "left";
      const cellText = (val !== undefined && val !== null) ? String(val) : "";

      let cellCustomStyle = "";
      let cellInnerHtml = this.escapeHtml(cellText);

      // Duplicate Pogruzka Route Highlight (Qırmızı xəbərdarlıq)
      if (key === "pogruzka_marshrut" && row.pogruzka_duplicate) {
        if (!isSelected) cellCustomStyle = "background: #fee2e2; color: #b91c1c; font-weight: bold;";
        cellInnerHtml = `<span title="ВНИМАНИЕ: Накладная найдена в ${row.pogruzka_count || 2} документах погрузки (Дубликат!)" style="display: inline-flex; align-items: center; gap: 4px;"><span>🚨</span><span>${this.escapeHtml(cellText || 'Рейс')}</span><span style="background: #dc2626; color: #fff; border-radius: 8px; padding: 0 4px; font-size: 9px; font-weight: bold; line-height: 12px;">${row.pogruzka_count || 2}</span></span>`;
      }

      cells.push(`<td class="${activeCell ? 'c1-cell-active' : ''}" data-col-key="${key}" style="${wStyle} ${cellCustomStyle} ${selectionStyle} padding: 2px 6px; text-align: ${align}; border: 1px solid #d4d0c8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; user-select: text;" onclick="UniversalJournal.selectCell(${i}, '${key}', this, event)">${cellInnerHtml}</td>`);
    }

    return `<tr class="uj-row" data-row-idx="${i}" style="background: ${rowBg}; color: ${textColor}; height: 21px; cursor: pointer; user-select: text;" onclick="UniversalJournal.selectRow(${i})" ondblclick="UniversalJournal.editSelectedDocument(${i})">${cells.join("")}</tr>`;
  },

  renderTableHead: function() {
    const headRow = this.getEl("ujTableHeadRow");
    if (!headRow) return;

    const visibleCols = this.getVisibleColumns();
    let html = "";
    for (let c = 0; c < visibleCols.length; c++) {
      const col = visibleCols[c];
      const wStyle = col.autoWidth ? "" : `width: ${col.width}px; min-width: ${col.width}px; max-width: ${col.width}px;`;
      const isSort = this.currentSortCol === col.key;
      const arrow = isSort ? (this.currentSortAsc ? " ▴" : " ▾") : "";
      const cursor = col.key === "status" ? "" : "cursor: pointer;";
      const isSearchActive = (this.activeSearchColKey === col.key);
      const searchClass = isSearchActive ? "uj-th-search-active" : "";
      const searchBadge = isSearchActive ? `<span class="uj-th-search-icon" title="Поиск в этой колонке (Отмена: Ctrl+Q)" style="margin-left: 4px; font-size: 11px; vertical-align: middle; line-height: 1;">🔍</span>` : "";

      html += `
        <th class="uj-th ${searchClass}" data-col-key="${col.key}" draggable="true"
            style="${wStyle} position: relative; padding: 4px 6px; border: 1px solid #b0af9f; text-align: ${col.align || 'left'}; white-space: nowrap; user-select: none; ${cursor}"
            onclick="UniversalJournal.onHeaderClick('${col.key}')"
            ondragstart="UniversalJournal.onColDragStart(event, '${col.key}')"
            ondragover="UniversalJournal.onColDragOver(event)"
            ondragenter="UniversalJournal.onColDragEnter(event, this)"
            ondragleave="UniversalJournal.onColDragLeave(event, this)"
            ondrop="UniversalJournal.onColDrop(event, '${col.key}')">
          <span style="display: inline-block; overflow: hidden; text-overflow: ellipsis; max-width: calc(100% - 10px); vertical-align: middle;">
            ${this.escapeHtml(col.label)}${arrow}${searchBadge}
          </span>
          <div class="uj-col-resizer" title="Потяните для изменения ширины"
               style="position: absolute; right: 0; top: 0; bottom: 0; width: 6px; cursor: col-resize; z-index: 5;"
               onmousedown="UniversalJournal.startColResize(event, '${col.key}')"
               onclick="event.stopPropagation()"></div>
        </th>
      `;
    }

    headRow.innerHTML = html;
  },

  // ==========================================
  // Column Width Resizing (Mouse Drag)
  // ==========================================
  startColResize: function(e, colKey) {
    e.preventDefault();
    e.stopPropagation();

    const col = this.columns.find(c => c.key === colKey);
    if (!col) return;

    const startX = e.clientX;
    const startWidth = col.width || 100;
    const th = e.target.closest("th");

    const onMouseMove = (moveEvent) => {
      moveEvent.preventDefault();
      const deltaX = moveEvent.clientX - startX;
      const newWidth = Math.max(30, startWidth + deltaX);
      col.width = newWidth;
      col.autoWidth = false;

      if (th) {
        th.style.width = newWidth + "px";
        th.style.minWidth = newWidth + "px";
        th.style.maxWidth = newWidth + "px";
      }

      const tbody = this.getEl("ujTableBody");
      if (tbody) {
        const cells = tbody.querySelectorAll(`td[data-col-key="${colKey}"]`);
        cells.forEach(td => {
          td.style.width = newWidth + "px";
          td.style.minWidth = newWidth + "px";
          td.style.maxWidth = newWidth + "px";
        });
      }
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      this.saveColumnsConfig();
    };

    document.body.style.cursor = "col-resize";
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  },

  // ==========================================
  // Column Reordering (Drag and Drop)
  // ==========================================
  draggedColKey: null,

  onColDragStart: function(e, colKey) {
    this.draggedColKey = colKey;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", colKey);
    const th = e.target.closest("th");
    if (th) th.style.opacity = "0.5";
  },

  onColDragOver: function(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  },

  onColDragEnter: function(e, th) {
    if (th) th.style.borderLeft = "3px solid #004080";
  },

  onColDragLeave: function(e, th) {
    if (th) th.style.borderLeft = "1px solid #b0af9f";
  },

  onColDrop: function(e, targetColKey) {
    e.preventDefault();
    const allThs = document.querySelectorAll("#ujTableHeadRow th");
    allThs.forEach(t => { t.style.opacity = ""; t.style.borderLeft = "1px solid #b0af9f"; });

    if (!this.draggedColKey || this.draggedColKey === targetColKey) return;

    const fromIdx = this.columns.findIndex(c => c.key === this.draggedColKey);
    const toIdx = this.columns.findIndex(c => c.key === targetColKey);

    if (fromIdx !== -1 && toIdx !== -1) {
      const [moved] = this.columns.splice(fromIdx, 1);
      this.columns.splice(toIdx, 0, moved);
      this.saveColumnsConfig();
      this.renderTable();
    }
    this.draggedColKey = null;
  },

  // ==========================================
  // 1C "Настройка формы" (Form / List Settings) Modal
  // ==========================================
  tempSettingsColumns: [],
  formSettingsSelectedIdx: 0,

  openFormSettingsModal: function() {
    if (window.OneCColumnSettings) {
      OneCColumnSettings.open({
        title: this.docTitle || this.activeDocType || "Журнал документов",
        columns: this.columns,
        defaultColumns: typeof this.getDefaultColumns === "function" ? this.getDefaultColumns() : this.columns,
        storageKey: typeof this.getStorageKey === "function" ? this.getStorageKey() : "uj_columns_config",
        onApply: (newCols) => {
          this.columns = newCols;
          this.saveColumnsConfig();
          this.renderTable();
          this.updateStatus("Настройки колонок применены");
        },
        onReset: (defCols) => {
          if (typeof this.getStorageKey === "function") {
            localStorage.removeItem(this.getStorageKey());
          }
          this.loadColumnsConfig();
          this.renderTable();
          this.updateStatus("Настройки колонок сброшены к стандартным");
        }
      });
      return;
    }

    this.tempSettingsColumns = JSON.parse(JSON.stringify(this.columns));
    this.formSettingsSelectedIdx = 0;

    let modal = document.getElementById("ujFormSettingsModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "ujFormSettingsModal";
      modal.className = "modal-overlay-1c";
      modal.style.zIndex = "9999";
      document.body.appendChild(modal);
    }

    this.renderFormSettingsModalContent();
    modal.style.display = "flex";
  },

  closeFormSettingsModal: function() {
    const modal = document.getElementById("ujFormSettingsModal");
    if (modal) modal.style.display = "none";
  },

  renderFormSettingsModalContent: function() {
    const modal = document.getElementById("ujFormSettingsModal");
    if (!modal) return;

    const cols = this.tempSettingsColumns;
    const selIdx = Math.max(0, Math.min(this.formSettingsSelectedIdx, cols.length - 1));
    const selCol = cols[selIdx] || null;

    let rowsHtml = "";
    cols.forEach((col, idx) => {
      const isSelected = (idx === selIdx);
      const bg = isSelected ? "#316ac5" : (idx % 2 === 1 ? "#f9f8f4" : "#ffffff");
      const fg = isSelected ? "#ffffff" : "#111111";
      const isChecked = (col.visible !== false);

      rowsHtml += `
        <tr style="background: ${bg}; color: ${fg}; height: 22px; cursor: pointer; user-select: none;"
            onclick="UniversalJournal.selectFormSettingsRow(${idx})">
          <td style="width: 28px; text-align: center; border: 1px solid #d4d0c8;">
            <input type="checkbox" ${isChecked ? "checked" : ""}
                   onclick="event.stopPropagation(); UniversalJournal.toggleFormSettingsColVisibility(${idx}, this.checked)"
                   style="cursor: pointer; vertical-align: middle;">
          </td>
          <td style="width: 24px; text-align: center; border: 1px solid #d4d0c8; font-size: 11px;">
            📄
          </td>
          <td style="padding: 2px 6px; border: 1px solid #d4d0c8; font-size: 11px; font-weight: ${isSelected ? 'bold' : 'normal'};">
            ${this.escapeHtml(col.label || col.key)}
          </td>
        </tr>
      `;
    });

    const isAuto = selCol ? Boolean(selCol.autoWidth) : false;
    const widthVal = selCol ? (selCol.width || 100) : 100;
    const isVisible = selCol ? (selCol.visible !== false) : true;
    const labelVal = selCol ? (selCol.label || "") : "";

    modal.innerHTML = `
      <div class="modal-window-1c" style="width: 620px; max-height: 85vh; display: flex; flex-direction: column; background: #f0eee3; border: 1px solid #7f9db9; box-shadow: 0 6px 24px rgba(0,0,0,0.4); font-family: Tahoma, 'MS Sans Serif', Arial, sans-serif; font-size: 11px;">
        
        <!-- Header -->
        <div class="modal-header-1c" style="background: linear-gradient(to bottom, #fdfdfe, #d6d9e0); padding: 5px 8px; border-bottom: 1px solid #a0a0a0; display: flex; align-items: center; justify-content: space-between;">
          <div style="font-weight: bold; color: #000; font-size: 11px; display: flex; align-items: center; gap: 6px;">
            <span>📋</span>
            <span>Настройка формы: ${this.escapeHtml(this.docTitle || this.activeDocType)}</span>
          </div>
          <button type="button" class="window-btn-close" onclick="UniversalJournal.closeFormSettingsModal()" style="width: 17px; height: 17px; border: 1px solid #7f9db9; background: #e5e2cf; cursor: pointer;">✕</button>
        </div>

        <!-- Toolbar (⇧ Вверх, ⇩ Вниз, 🔄 Стандартные) -->
        <div style="padding: 4px 8px; background: #e5e2cf; border-bottom: 1px solid #b0af9f; display: flex; align-items: center; gap: 4px;">
          <button type="button" class="btn-1c" onclick="UniversalJournal.moveFormSettingsColUp()" title="Переместить вверх (⇧)" style="height: 23px; padding: 0 7px; display: inline-flex; align-items: center; gap: 4px; font-weight: bold; font-size: 12px; color: #004080; cursor: pointer;">
            <span>⇧</span>
            <span style="font-size: 11px; font-weight: normal;">Вверх</span>
          </button>
          <button type="button" class="btn-1c" onclick="UniversalJournal.moveFormSettingsColDown()" title="Переместить вниз (⇩)" style="height: 23px; padding: 0 7px; display: inline-flex; align-items: center; gap: 4px; font-weight: bold; font-size: 12px; color: #004080; cursor: pointer;">
            <span>⇩</span>
            <span style="font-size: 11px; font-weight: normal;">Вниз</span>
          </button>

          <div style="height: 18px; width: 1px; background: #b0af9f; margin: 0 4px;"></div>

          <button type="button" class="btn-1c" onclick="UniversalJournal.toggleAllFormSettings(true)" title="Показать все колонки" style="height: 23px; padding: 0 6px; font-size: 11px; cursor: pointer;">
            ☑️ Все
          </button>
          <button type="button" class="btn-1c" onclick="UniversalJournal.toggleAllFormSettings(false)" title="Снять все отметки" style="height: 23px; padding: 0 6px; font-size: 11px; cursor: pointer;">
            ◻️ Снять
          </button>

          <div style="height: 18px; width: 1px; background: #b0af9f; margin: 0 4px;"></div>

          <button type="button" class="btn-1c" onclick="UniversalJournal.resetFormSettingsToDefault()" title="Восстановить стандартные настройки" style="height: 23px; padding: 0 7px; display: inline-flex; align-items: center; gap: 4px; font-size: 11px; cursor: pointer;">
            <span>🔄</span>
            <span>Стандартные настройки</span>
          </button>
        </div>

        <!-- Body: Left list + Right properties -->
        <div style="display: flex; flex: 1; min-height: 280px; max-height: 400px; padding: 6px; gap: 8px; overflow: hidden; background: #f0eee3;">
          
          <!-- Left: Columns Table Tree -->
          <div style="flex: 1.2; display: flex; flex-direction: column; background: #fff; border: 1px solid #7f9db9;">
            <div style="background: #e3dec9; padding: 3px 6px; font-weight: bold; font-size: 11px; border-bottom: 1px solid #b0af9f; display: flex; align-items: center; gap: 4px;">
              <span>📁</span>
              <span>Элементы формы (Список колонок)</span>
            </div>
            <div style="flex: 1; overflow: auto;">
              <table style="width: 100%; border-collapse: collapse;">
                <tbody>
                  ${rowsHtml}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Right: Selected Column Properties (Свойства элемента) -->
          <div style="flex: 1; display: flex; flex-direction: column; background: #ffffff; border: 1px solid #7f9db9; padding: 8px;">
            <div style="font-weight: bold; color: #003366; font-size: 11px; border-bottom: 1px solid #d4d0c8; padding-bottom: 4px; margin-bottom: 8px;">
              Свойства элемента:
            </div>

            ${selCol ? `
              <!-- 1. Column Label -->
              <div style="margin-bottom: 10px;">
                <label style="display: block; margin-bottom: 2px; font-size: 11px; color: #333;">Заголовок колонки:</label>
                <input type="text" id="ujPropLabelInput" class="input-1c" value="${this.escapeHtml(labelVal)}"
                       oninput="UniversalJournal.updateFormSettingsSelectedProp('label', this.value)"
                       style="width: 100%; height: 22px; font-size: 11px; padding: 2px 6px;">
              </div>

              <!-- 2. Visibility Checkbox -->
              <div style="margin-bottom: 12px;">
                <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 11px; cursor: pointer;">
                  <input type="checkbox" id="ujPropVisibleInput" ${isVisible ? "checked" : ""}
                         onchange="UniversalJournal.updateFormSettingsSelectedProp('visible', this.checked)"
                         style="cursor: pointer;">
                  <span>Отображать в списке (Видимость)</span>
                </label>
              </div>

              <!-- 3. Width Box -->
              <div style="border: 1px solid #d4d0c8; background: #fdfdfd; padding: 8px; border-radius: 2px; margin-bottom: 10px;">
                <div style="font-weight: bold; font-size: 11px; color: #222; margin-bottom: 6px;">Ширина колонки:</div>
                
                <div style="margin-bottom: 6px;">
                  <label style="display: inline-flex; align-items: center; gap: 5px; font-size: 11px; cursor: pointer;">
                    <input type="radio" name="ujPropWidthRadio" value="auto" ${isAuto ? "checked" : ""}
                           onchange="UniversalJournal.updateFormSettingsSelectedProp('autoWidth', true)">
                    <span>Автоматическая ширина (Авто)</span>
                  </label>
                </div>

                <div>
                  <label style="display: inline-flex; align-items: center; gap: 5px; font-size: 11px; cursor: pointer;">
                    <input type="radio" name="ujPropWidthRadio" value="custom" ${!isAuto ? "checked" : ""}
                           onchange="UniversalJournal.updateFormSettingsSelectedProp('autoWidth', false)">
                    <span>Вручную (пикс.):</span>
                  </label>
                  <input type="number" id="ujPropWidthInput" class="input-1c" value="${widthVal}" min="30" max="800" step="5"
                         oninput="UniversalJournal.updateFormSettingsSelectedProp('width', parseInt(this.value) || 100)"
                         style="width: 70px; height: 22px; margin-left: 6px; font-size: 11px; text-align: right;" ${isAuto ? "disabled" : ""}>
                </div>
              </div>

              <!-- Order hint -->
              <div style="color: #666; font-size: 10px; line-height: 1.4; margin-top: auto; background: #f7f6f0; padding: 6px; border: 1px dashed #d4d0c8;">
                💡 <em>Используйте кнопки <strong>Вверх (⇧)</strong> и <strong>Вниз (⇩)</strong> для изменения порядка колонок.</em>
              </div>
            ` : `
              <div style="color: #777; font-size: 11px; padding: 15px; text-align: center;">
                Выберите колонку слева для настройки
              </div>
            `}

          </div>

        </div>

        <!-- Footer Buttons -->
        <div style="padding: 6px 10px; background: #e5e2cf; border-top: 1px solid #b0af9f; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <button type="button" class="btn-1c" onclick="UniversalJournal.resetFormSettingsToDefault()" style="height: 24px; padding: 0 10px; font-size: 11px;">
              Стандартные
            </button>
          </div>
          <div style="display: flex; gap: 6px;">
            <button type="button" class="btn-1c btn-1c-primary" onclick="UniversalJournal.saveFormSettings()" style="height: 24px; min-width: 65px; font-weight: bold;">
              ОК
            </button>
            <button type="button" class="btn-1c" onclick="UniversalJournal.applyFormSettings()" style="height: 24px; padding: 0 10px;">
              Применить
            </button>
            <button type="button" class="btn-1c" onclick="UniversalJournal.closeFormSettingsModal()" style="height: 24px; min-width: 65px;">
              Отмена
            </button>
          </div>
        </div>

      </div>
    `;
  },

  selectFormSettingsRow: function(idx) {
    this.formSettingsSelectedIdx = idx;
    this.renderFormSettingsModalContent();
  },

  toggleFormSettingsColVisibility: function(idx, checked) {
    if (this.tempSettingsColumns[idx]) {
      this.tempSettingsColumns[idx].visible = checked;
      this.renderFormSettingsModalContent();
    }
  },

  toggleAllFormSettings: function(checked) {
    this.tempSettingsColumns.forEach(c => {
      c.visible = checked;
    });
    this.renderFormSettingsModalContent();
  },

  updateFormSettingsSelectedProp: function(prop, val) {
    const col = this.tempSettingsColumns[this.formSettingsSelectedIdx];
    if (!col) return;
    col[prop] = val;
    if (prop === "autoWidth") {
      const inp = document.getElementById("ujPropWidthInput");
      if (inp) inp.disabled = val;
    }
  },

  moveFormSettingsColUp: function() {
    const idx = this.formSettingsSelectedIdx;
    if (idx > 0) {
      const [col] = this.tempSettingsColumns.splice(idx, 1);
      this.tempSettingsColumns.splice(idx - 1, 0, col);
      this.formSettingsSelectedIdx = idx - 1;
      this.renderFormSettingsModalContent();
    }
  },

  moveFormSettingsColDown: function() {
    const idx = this.formSettingsSelectedIdx;
    if (idx < this.tempSettingsColumns.length - 1) {
      const [col] = this.tempSettingsColumns.splice(idx, 1);
      this.tempSettingsColumns.splice(idx + 1, 0, col);
      this.formSettingsSelectedIdx = idx + 1;
      this.renderFormSettingsModalContent();
    }
  },

  resetFormSettingsToDefault: function() {
    if (!confirm("Восстановить стандартные настройки колонок (видимость, порядок и ширину)?")) return;
    localStorage.removeItem(this.getStorageKey());
    this.loadColumnsConfig();
    this.tempSettingsColumns = JSON.parse(JSON.stringify(this.columns));
    this.renderFormSettingsModalContent();
    this.renderTable();
    this.updateStatus("Настройки колонок сброшены к стандартным");
  },

  applyFormSettings: function() {
    this.columns = JSON.parse(JSON.stringify(this.tempSettingsColumns));
    this.saveColumnsConfig();
    this.renderTable();
    this.updateStatus("Настройки колонок применены");
  },

  saveFormSettings: function() {
    this.applyFormSettings();
    this.closeFormSettingsModal();
  },

  // ==========================================
  // 1C "ОТБОР" (Filter & Criteria Engine)
  // ==========================================
  activeFilters: [],
  activePresetName: "",
  tempFilterCriteria: [],
  filterSelectedCritIdx: 0,
  filterSelectedFieldKey: "vms_status",
  activeFilterTab: "otbor",

  filterOperators: [
    "Равно",
    "Не равно",
    "Меньше",
    "Меньше или равно",
    "Больше",
    "Больше или равно",
    "Интервал (>, <)",
    "Интервал (>=, <=)",
    "Интервал (>=, <)",
    "Интервал (>, <=)",
    "В списке",
    "Не в списке",
    "В группе из списка",
    "Содержит",
    "Начинается с",
    "Не содержит",
    "Заполнено",
    "Не заполнено"
  ],

  getAvailableFields: function() {
    const isRealization = (this.activeDocType === "РеализацияТоваровУслуг");
    const fields = [
      { key: "deleted", label: "Пометка удаления", type: "boolean" },
      { key: "posted", label: "Проведен", type: "boolean" },
      { key: "date", label: "Дата", type: "date" },
      { key: "number", label: "Номер", type: "text" },
      { key: "kontragent", label: "Контрагент", type: "text" },
      { key: "golovnoy_kontragent", label: "Головной контрагент", type: "text" },
      { key: "agent", label: "Агент", type: "text" }
    ];

    if (isRealization) {
      fields.push(
        { key: "kontragent_code", label: "Код контрагента", type: "text" },
        { key: "portfolio", label: "Портфель", type: "text" },
        { key: "deal", label: "Номер заказа", type: "text" },
        { key: "obrabotka_number", label: "Номер обработки", type: "text" },
        { key: "vms_status", label: "Статус ВМС", type: "select", options: ["Выгружен", "Подтвержден WMS", "Новый", "В обработке", "Отменен", "Готов к отгрузке"] },
        { key: "contract", label: "Договор контрагента", type: "text" },
        { key: "contract_price_type", label: "Тип цен", type: "text" },
        { key: "pogruzka_marshrut", label: "Пагрузка маршрут", type: "text" },
        { key: "pogruzka_voditel", label: "Пагрузка водитель", type: "text" }
      );
    }

    const isPogruzka = (this.activeDocType === "ПогрузкиМашин" || this.activeDocType === "ПогрузкаМашин");
    if (isPogruzka) {
      fields.push(
        { key: "marshrut", label: "Маршрут", type: "text" },
        { key: "voditel", label: "Водитель", type: "text" },
        { key: "realization_count", label: "Кол-во накладных", type: "number" }
      );
    }

    fields.push(
      { key: "amount", label: "Сумма", type: "number" },
      { key: "warehouse", label: "Склад", type: "text" },
      { key: "nomenclature", label: "Номенклатура", type: "text" },
      { key: "responsible", label: "Ответственный", type: "text" },
      { key: "comment", label: "Комментарий", type: "text" }
    );

    // Merge any other columns present in this.columns
    const existing = new Set(fields.map(f => f.key));
    (this.columns || []).forEach(col => {
      if (col.key && col.key !== "status" && !existing.has(col.key)) {
        fields.push({
          key: col.key,
          label: col.label || col.key,
          type: (col.key.includes("amount") || col.key.includes("sum")) ? "number" : "text"
        });
        existing.add(col.key);
      }
    });

    return fields;
  },

  activeAutocompleteIdx: -1,
  activeSuggestionIdx: -1,

  getDistinctFieldValues: function(fieldKey) {
    const set = new Set();

    if (fieldKey === "nomenclature") {
      (this.items || []).forEach(item => {
        if (Array.isArray(item.nomenclatures)) {
          item.nomenclatures.forEach(n => { if (n && String(n).trim()) set.add(String(n).trim()); });
        } else if (item.nomenclature) {
          (String(item.nomenclature).includes(";") ? String(item.nomenclature).split(";") : [String(item.nomenclature)]).forEach(n => { if (n && n.trim()) set.add(n.trim()); });
        }
      });
      return Array.from(set).sort((a, b) => a.localeCompare(b, "ru"));
    }

    (this.items || []).forEach(item => {
      const v = item[fieldKey];
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        set.add(String(v).trim());
      }
    });

    if (fieldKey === "vms_status") {
      ["Выгружен", "Подтвержден WMS", "Новый", "В обработке", "Готов к отгрузке", "Отменен"].forEach(s => set.add(s));
    }

    return Array.from(set).sort((a, b) => a.localeCompare(b, "ru"));
  },

  openFilterModal: function() {
    this.tempFilterCriteria = JSON.parse(JSON.stringify(this.activeFilters || []));
    this.tempFilterCriteria.forEach(c => {
      if (c.enabled === undefined) {
        c.enabled = Boolean(c.value || c.valueFrom || c.valueTo || c.structuredFilter);
      }
    });

    // Ensure standard 1C boolean criteria (Пометка удаления and Проведен) exist as default rows
    const hasDeleted = this.tempFilterCriteria.some(c => c.fieldKey === "deleted");
    if (!hasDeleted) {
      this.tempFilterCriteria.push({
        id: "crit_default_deleted",
        enabled: false,
        fieldKey: "deleted",
        fieldLabel: "Пометка удаления",
        operator: "Равно",
        value: "Нет"
      });
    }
    const hasPosted = this.tempFilterCriteria.some(c => c.fieldKey === "posted");
    if (!hasPosted) {
      this.tempFilterCriteria.push({
        id: "crit_default_posted",
        enabled: false,
        fieldKey: "posted",
        fieldLabel: "Проведен",
        operator: "Равно",
        value: "Да"
      });
    }

    this.filterSelectedCritIdx = 0;
    this.activeFilterTab = "otbor";

    const avail = this.getAvailableFields();
    if (!this.filterSelectedFieldKey && avail.length > 0) {
      this.filterSelectedFieldKey = avail[0].key;
    }

    const titleEl = document.getElementById("ujFilterWindowTitle");
    if (titleEl) {
      titleEl.textContent = `Настройка списка: ${this.docTitle || this.activeDocType}`;
    }

    this.switchFilterTab("otbor");
    this.renderFilterAvailableFields();
    this.renderFilterCriteriaRows();

    // Open as authentic MDI Window
    if (window.MdiManager) {
      MdiManager.activateWindow("ujFilterWindow", {
        title: "Настройка списка",
        icon: "📑",
        closeFn: () => {
          this.closeFilterModal();
        }
      });
    } else {
      const win = document.getElementById("ujFilterWindow");
      if (win) win.style.display = "flex";
    }
  },

  closeFilterModal: function() {
    this.hideFilterAutocomplete();
    if (window.MdiManager) {
      MdiManager.closeWindow("ujFilterWindow");
    } else {
      const win = document.getElementById("ujFilterWindow");
      if (win) win.style.display = "none";
    }
  },

  switchFilterTab: function(tabName) {
    this.activeFilterTab = tabName;
    const isOtbor = (tabName === "otbor");
    const otborBody = document.getElementById("ujFilterTabBodyOtbor");
    const otherBody = document.getElementById("ujFilterTabBodyOther");
    const otherLabel = document.getElementById("ujFilterTabOtherLabel");

    if (otborBody) otborBody.style.display = isOtbor ? "flex" : "none";
    if (otherBody) otherBody.style.display = isOtbor ? "none" : "flex";

    const tabs = ["osnovnye", "otbor", "sort", "style", "group"];
    tabs.forEach(t => {
      const btn = document.getElementById("ujTab" + t.charAt(0).toUpperCase() + t.slice(1));
      if (!btn) return;
      const isActive = (t === tabName);
      btn.style.background = isActive ? "#f0eee3" : "#dfdcce";
      btn.style.fontWeight = isActive ? "bold" : "normal";
      btn.style.borderTop = isActive ? "2px solid #e28700" : "1px solid #b0af9f";
      btn.style.borderBottom = isActive ? "none" : "1px solid #b0af9f";
    });

    if (otherLabel && !isOtbor) {
      const names = {
        osnovnye: "Основные",
        sort: "Сортировка",
        style: "Условное оформление",
        group: "Группировка"
      };
      otherLabel.textContent = `Вкладка "${names[tabName] || tabName}" доступна через основную таблицу журнала.`;
    }
  },

  renderFilterAvailableFields: function() {
    const listEl = document.getElementById("ujFilterAvailFieldsList");
    if (!listEl) return;

    const availFields = this.getAvailableFields();
    let html = "";
    availFields.forEach(f => {
      const isSelected = (f.key === this.filterSelectedFieldKey);
      const bg = isSelected ? "#316ac5" : "#ffffff";
      const fg = isSelected ? "#ffffff" : "#111111";
      html += `
        <div id="ujAvailField_${f.key}"
             style="padding: 3px 6px; font-size: 11px; background: ${bg}; color: ${fg}; cursor: pointer; user-select: none; display: flex; align-items: center; gap: 5px; border-bottom: 1px dotted #e0dec8;"
             onclick="UniversalJournal.selectAvailableField('${f.key}')"
             ondblclick="UniversalJournal.addFilterCriterion('${f.key}')">
          <span style="font-size: 10px; color: ${isSelected ? '#fff' : '#4a78c4'};">▬</span>
          <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${this.escapeHtml(f.label)}</span>
        </div>
      `;
    });
    listEl.innerHTML = html;
  },

  selectAvailableField: function(key) {
    this.filterSelectedFieldKey = key;
    const listEl = document.getElementById("ujFilterAvailFieldsList");
    if (listEl) {
      const items = listEl.querySelectorAll("[id^='ujAvailField_']");
      items.forEach(el => {
        const isSel = (el.id === `ujAvailField_${key}`);
        el.style.background = isSel ? "#316ac5" : "#ffffff";
        el.style.color = isSel ? "#ffffff" : "#111111";
        const icon = el.querySelector("span");
        if (icon) icon.style.color = isSel ? "#ffffff" : "#4a78c4";
      });
    }
  },

  addFilterCriterion: function(fieldKey) {
    const avail = this.getAvailableFields();
    const fKey = fieldKey || this.filterSelectedFieldKey || (avail.length > 0 ? avail[0].key : "kontragent");
    const fieldObj = avail.find(f => f.key === fKey) || { key: fKey, label: fKey, type: "text" };

    let defVal = "";
    if (fieldObj.type === "boolean") defVal = "Да";
    else if (fieldObj.key === "vms_status") defVal = "Подтвержден WMS";

    this.tempFilterCriteria.push({
      id: "crit_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4),
      enabled: true,
      fieldKey: fieldObj.key,
      fieldLabel: fieldObj.label,
      operator: "Равно",
      value: defVal
    });

    this.filterSelectedCritIdx = this.tempFilterCriteria.length - 1;
    this.renderFilterCriteriaRows();

    setTimeout(() => {
      const inp = document.getElementById(`ujFilterValInput_${this.filterSelectedCritIdx}`);
      if (inp) inp.focus();
    }, 50);
  },

  removeFilterCriterion: function(idx) {
    const targetIdx = (idx !== undefined) ? idx : this.filterSelectedCritIdx;
    if (targetIdx >= 0 && targetIdx < this.tempFilterCriteria.length) {
      this.tempFilterCriteria.splice(targetIdx, 1);
      this.filterSelectedCritIdx = Math.max(0, targetIdx - 1);
      this.hideFilterAutocomplete();
      this.renderFilterCriteriaRows();
    }
  },

  moveFilterCriterionUp: function() {
    const idx = this.filterSelectedCritIdx;
    if (idx > 0 && idx < this.tempFilterCriteria.length) {
      const [item] = this.tempFilterCriteria.splice(idx, 1);
      this.tempFilterCriteria.splice(idx - 1, 0, item);
      this.filterSelectedCritIdx = idx - 1;
      this.renderFilterCriteriaRows();
    }
  },

  moveFilterCriterionDown: function() {
    const idx = this.filterSelectedCritIdx;
    if (idx >= 0 && idx < this.tempFilterCriteria.length - 1) {
      const [item] = this.tempFilterCriteria.splice(idx, 1);
      this.tempFilterCriteria.splice(idx + 1, 0, item);
      this.filterSelectedCritIdx = idx + 1;
      this.renderFilterCriteriaRows();
    }
  },

  selectFilterCritRow: function(idx) {
    this.filterSelectedCritIdx = idx;
    const tbody = document.getElementById("ujFilterCriteriaTbody");
    if (tbody) {
      const rows = tbody.querySelectorAll("tr");
      rows.forEach((r, rIdx) => {
        const isSel = (rIdx === idx);
        r.style.background = isSel ? "#e2eefb" : (rIdx % 2 === 1 ? "#f9f8f4" : "#ffffff");
        r.querySelectorAll("input.input-1c").forEach(inp => {
          inp.style.setProperty("background", "#ffffff", "important");
          inp.style.setProperty("background-color", "#ffffff", "important");
          inp.style.setProperty("color", "#111111", "important");
        });
      });
    }
  },

  toggleFilterCritEnabled: function(idx, checked) {
    if (this.tempFilterCriteria[idx]) {
      this.tempFilterCriteria[idx].enabled = checked;
    }
    this.updateHeaderCheckAllState();
  },

  setCritEnabled: function(idx, enabled = true) {
    if (this.tempFilterCriteria[idx]) {
      this.tempFilterCriteria[idx].enabled = enabled;
      const chk = document.getElementById(`ujCritEnabled_${idx}`);
      if (chk) {
        chk.checked = enabled;
      }
      this.updateHeaderCheckAllState();
    }
  },

  updateHeaderCheckAllState: function() {
    const chkAll = document.querySelector("#ujFilterTableContainer thead input[type='checkbox']");
    if (chkAll && this.tempFilterCriteria && this.tempFilterCriteria.length > 0) {
      const allEnabled = this.tempFilterCriteria.every(c => c.enabled !== false);
      const someEnabled = this.tempFilterCriteria.some(c => c.enabled !== false);
      chkAll.checked = allEnabled;
      chkAll.indeterminate = (!allEnabled && someEnabled);
    }
  },

  onFilterCritFieldChange: function(idx, newKey) {
    const crit = this.tempFilterCriteria[idx];
    if (!crit) return;
    const avail = this.getAvailableFields();
    const fieldObj = avail.find(f => f.key === newKey) || { key: newKey, label: newKey, type: "text" };
    crit.fieldKey = fieldObj.key;
    crit.fieldLabel = fieldObj.label;
    if (fieldObj.type === "boolean") crit.value = "Да";
    else if (fieldObj.key === "vms_status") crit.value = "Подтвержден WMS";
    else crit.value = "";
    this.renderFilterCriteriaRows();
  },

  onFilterCritOpChange: function(idx, newOp) {
    if (this.tempFilterCriteria[idx]) {
      const crit = this.tempFilterCriteria[idx];
      crit.operator = newOp;
      if (newOp.startsWith("Интервал")) {
        if (!crit.valueFrom && !crit.valueTo && crit.value) {
          const parts = String(crit.value).split(/\s*(?:\.\.\.|—|-)\s*/);
          crit.valueFrom = parts[0] || "";
          crit.valueTo = parts[1] || "";
        }
      }
      if (newOp === "Заполнено" || newOp === "Не заполнено" || (crit.value && String(crit.value).trim().length > 0)) {
        crit.enabled = true;
      }
      this.renderFilterCriteriaRows();
    }
  },

  clearAllFilterCriteria: function() {
    this.tempFilterCriteria = [];
    this.filterSelectedCritIdx = 0;
    this.hideFilterAutocomplete();
    this.renderFilterCriteriaRows();
  },

  checkAllFilterCriteria: function(checked) {
    this.tempFilterCriteria.forEach(c => c.enabled = checked);
    const tbody = document.getElementById("ujFilterCriteriaTbody");
    if (tbody) {
      const checks = tbody.querySelectorAll("input[type='checkbox']");
      checks.forEach(chk => chk.checked = checked);
    }
    this.updateHeaderCheckAllState();
  },

  renderFilterCriteriaRows: function() {
    const tbody = document.getElementById("ujFilterCriteriaTbody");
    const countEl = document.getElementById("ujFilterCountSummary");
    if (!tbody) return;

    const crits = this.tempFilterCriteria;
    const availFields = this.getAvailableFields();
    const selCritIdx = Math.max(0, Math.min(this.filterSelectedCritIdx, crits.length - 1));

    if (countEl) {
      countEl.textContent = `${crits.length} элементов`;
    }

    if (crits.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; padding: 35px; color: #777; font-style: italic;">
            Условия отбора не заданы.<br>
            Выберите поле слева и дважды кликните или нажмите "Выбрать" / "➕ Добавить новый элемент".
          </td>
        </tr>
      `;
      return;
    }

    let rowsHtml = "";
    crits.forEach((crit, idx) => {
      const isSelected = (idx === selCritIdx);
      const bg = isSelected ? "#e2eefb" : (idx % 2 === 1 ? "#f9f8f4" : "#ffffff");
      const isChecked = (crit.enabled !== false);
      const fieldObj = availFields.find(f => f.key === crit.fieldKey) || { key: crit.fieldKey, label: crit.fieldLabel || crit.fieldKey, type: "text" };
      const isNoValueNeeded = (crit.operator === "Заполнено" || crit.operator === "Не заполнено");

      const fieldOptionsHtml = availFields.map(f => `
        <option value="${f.key}" ${f.key === crit.fieldKey ? 'selected' : ''} style="color: #111111 !important; background-color: #ffffff !important;">${this.escapeHtml(f.label)}</option>
      `).join("");

      const isBoolField = (fieldObj.type === "boolean");
      const boolOps = ["Равно", "Не равно", "Заполнено", "Не заполнено"];
      const opList = isBoolField ? boolOps : this.filterOperators;
      if (isBoolField && !boolOps.includes(crit.operator)) {
        crit.operator = "Равно";
      }

      const opOptionsHtml = opList.map(op => `
        <option value="${op}" ${op === crit.operator ? 'selected' : ''} style="color: #111111 !important; background-color: #ffffff !important;">${op}</option>
      `).join("");

      let valueInputHtml = "";
      if (isNoValueNeeded) {
        valueInputHtml = `<span style="color: #888; font-style: italic; font-size: 10px;">(не требуется)</span>`;
      } else if (fieldObj.type === "boolean") {
        const valStr = (crit.value === "Да" || crit.value === true || crit.value === "true") ? "Да" : "Нет";
        valueInputHtml = `
          <select class="select-1c" style="width: 100%; height: 21px; font-size: 11px; background: #ffffff !important; color: #111111 !important; border: 1px solid #7f9db9;"
                  onclick="event.stopPropagation()"
                  onchange="UniversalJournal.tempFilterCriteria[${idx}].value = this.value; UniversalJournal.setCritEnabled(${idx}, true);">
            <option value="Да" ${valStr === 'Да' ? 'selected' : ''} style="color: #111111 !important; background-color: #ffffff !important;">Да</option>
            <option value="Нет" ${valStr === 'Нет' ? 'selected' : ''} style="color: #111111 !important; background-color: #ffffff !important;">Нет</option>
          </select>
        `;
      } else {
        const isInterval = crit.operator && crit.operator.startsWith("Интервал");
        const structAttr = crit.structuredFilter ? `data-structured-list="${this.escapeHtml(JSON.stringify(crit.structuredFilter))}"` : '';

        if (isInterval) {
          let valFrom = (crit.valueFrom !== undefined) ? crit.valueFrom : "";
          let valTo = (crit.valueTo !== undefined) ? crit.valueTo : "";
          if (!valFrom && !valTo && crit.value) {
            const parts = String(crit.value).split(/\s*(?:\.\.\.|—|-)\s*/);
            valFrom = parts[0] || "";
            valTo = parts[1] || "";
          }

          valueInputHtml = `
            <div style="display: flex; align-items: center; width: 100%; gap: 4px; position: relative;">
              <span style="font-size: 11px; font-weight: bold; color: #222222; white-space: nowrap; user-select: none;">Начало:</span>
              <input type="text" id="ujFilterValInput_${idx}_from" class="input-1c uj-filter-from" ${structAttr}
                     style="flex: 1; min-width: 0; height: 21px; font-size: 11px; padding: 1px 4px; outline: none; background: #ffffff !important; color: #111111 !important; border: 1px solid #7f9db9;"
                     value="${this.escapeHtml(valFrom)}"
                     placeholder="Начало"
                     title="Начало периода"
                     onclick="event.stopPropagation()"
                     onfocus="UniversalJournal.selectFilterCritRow(${idx})"
                     oninput="UniversalJournal.onFilterIntervalInput(${idx}, 'from', this)"
                     onblur="UniversalJournal.onFilterIntervalBlur(${idx}, 'from', this)"
                     onkeydown="UniversalJournal.onFilterIntervalKeydown(${idx}, 'from', this, event)">
              <span style="font-size: 11px; font-weight: bold; color: #222222; white-space: nowrap; user-select: none; margin-left: 4px;">Конец:</span>
              <input type="text" id="ujFilterValInput_${idx}_to" class="input-1c uj-filter-to" ${structAttr}
                     style="flex: 1; min-width: 0; height: 21px; font-size: 11px; padding: 1px 4px; outline: none; background: #ffffff !important; color: #111111 !important; border: 1px solid #7f9db9;"
                     value="${this.escapeHtml(valTo)}"
                     placeholder="Конец"
                     title="Конец периода"
                     onclick="event.stopPropagation()"
                     onfocus="UniversalJournal.selectFilterCritRow(${idx})"
                     oninput="UniversalJournal.onFilterIntervalInput(${idx}, 'to', this)"
                     onblur="UniversalJournal.onFilterIntervalBlur(${idx}, 'to', this)"
                     onkeydown="UniversalJournal.onFilterIntervalKeydown(${idx}, 'to', this, event)">
            </div>
          `;
        } else {
          const isDateInput = (crit.fieldKey === "date");
          const dateClass = isDateInput ? "uj-filter-date" : "";
          const showPickBtn = !isDateInput;
          valueInputHtml = `
            <div style="display: flex; align-items: center; width: 100%; gap: 1px; position: relative;">
              <input type="text" id="ujFilterValInput_${idx}" class="input-1c uj-filter-single ${dateClass}" ${structAttr}
                     data-field-key="${crit.fieldKey || ''}"
                     style="flex: 1; height: 21px; font-size: 11px; padding: 1px 4px; outline: none; background: #ffffff !important; color: #111111 !important; border: 1px solid #7f9db9;"
                     value="${this.escapeHtml(crit.value !== undefined ? String(crit.value) : '')}"
                     placeholder=""
                     onclick="event.stopPropagation()"
                     onfocus="UniversalJournal.selectFilterCritRow(${idx})"
                     oninput="UniversalJournal.onFilterValueInput(${idx}, this, event)"
                     onblur="UniversalJournal.onFilterSingleBlur(${idx}, this)"
                     onkeydown="UniversalJournal.onFilterInputKeydown(${idx}, this, event)">
              ${showPickBtn ? `
                <button type="button" class="btn-1c filter-btn-pick" 
                        style="height: 21px; width: 22px; padding: 0 4px; font-size: 11px; font-weight: bold; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; background: #ece9d8; border: 1px solid #7f9db9; color: #111111;"
                        onclick="event.stopPropagation(); UniversalJournal.openFilterFieldPicker(${idx})"
                        title="Выбрать значение (...)">
                  ...
                </button>
              ` : ''}
            </div>
          `;
        }
      }

      rowsHtml += `
        <tr id="ujCritRow_${idx}" style="background: ${bg}; height: 25px;" onclick="UniversalJournal.selectFilterCritRow(${idx})">
          <td style="width: 28px; text-align: center; border: 1px solid #d4d0c8;">
            <input type="checkbox" id="ujCritEnabled_${idx}" ${isChecked ? 'checked' : ''}
                   onclick="event.stopPropagation(); UniversalJournal.toggleFilterCritEnabled(${idx}, this.checked)"
                   style="cursor: pointer; vertical-align: middle;">
          </td>
          <td style="padding: 1px 4px; border: 1px solid #d4d0c8; width: 170px;">
            <div style="display: flex; align-items: center; width: 100%; height: 21px; background: #ffffff; border: 1px solid #7f9db9; padding: 0 1px; box-sizing: border-box;">
              <span style="flex: 1; min-width: 0; padding: 0 4px; font-size: 11px; color: #111111; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; user-select: none; cursor: pointer;"
                    onclick="UniversalJournal.openFieldSelectModal(${idx})"
                    ondblclick="UniversalJournal.openFieldSelectModal(${idx})"
                    title="Нажмите для выбора поля (${this.escapeHtml(fieldObj.label)})">
                ${this.escapeHtml(fieldObj.label)}
              </span>
              <button type="button" class="btn-1c filter-field-btn-pick"
                      onclick="event.stopPropagation(); UniversalJournal.openFieldSelectModal(${idx})"
                      title="Выбрать поле (...)"
                      style="width: 20px; height: 19px; padding: 0; margin: 0; font-size: 11px; font-weight: bold; background: #ece9d8; border: 1px solid #7f9db9; border-radius: 1px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; color: #111111;">
                ...
              </button>
            </div>
          </td>
          <td style="padding: 1px 4px; border: 1px solid #d4d0c8; width: 140px;">
            <select class="select-1c" style="width: 100%; height: 21px; font-size: 11px; border: 1px solid #7f9db9; background: #ffffff !important; color: #111111 !important; cursor: pointer; padding: 0 2px;"
                    onclick="event.stopPropagation()"
                    onchange="UniversalJournal.onFilterCritOpChange(${idx}, this.value)">
              ${opOptionsHtml}
            </select>
          </td>
          <td style="padding: 1px 4px; border: 1px solid #d4d0c8;">
            ${valueInputHtml}
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = rowsHtml;
    this.updateHeaderCheckAllState();

    // 1C seqment seçimi: yalnız tarix xanaları üçün (məhsul və s. mətn xanalarına toxunulmur)
    setTimeout(() => {
      if (window.PeriodPicker && typeof PeriodPicker.attachSegmentSelection === "function") {
        tbody.querySelectorAll("input.uj-filter-from, input.uj-filter-to, input.uj-filter-date").forEach(inp => {
          PeriodPicker.attachSegmentSelection(inp);
        });
      }
    }, 15);
  },

  // ==========================================
  // 1C "Выбор поля" Modal Picker Engine (...)
  // ==========================================
  fieldSelectTargetIdx: null,
  fieldSelectCurrentKey: null,

  openFieldSelectModal: function(idx) {
    this.fieldSelectTargetIdx = idx;
    const crit = this.tempFilterCriteria[idx];
    this.fieldSelectCurrentKey = crit ? crit.fieldKey : "";
    this.renderFieldSelectModalList(this.fieldSelectCurrentKey, "");

    const modal = document.getElementById("ujFieldSelectModalOverlay");
    if (modal) {
      modal.style.display = "flex";
      modal.classList.add("active");
      const searchInp = document.getElementById("ujFieldSelectSearchInput");
      if (searchInp) {
        searchInp.value = "";
        setTimeout(() => searchInp.focus(), 50);
      }
    }
  },

  closeFieldSelectModal: function() {
    const modal = document.getElementById("ujFieldSelectModalOverlay");
    if (modal) {
      modal.classList.remove("active");
      modal.style.display = "none";
    }
  },

  renderFieldSelectModalList: function(selectedKey, query) {
    const listEl = document.getElementById("ujFieldSelectModalList");
    if (!listEl) return;

    let availFields = this.getAvailableFields();
    if (query && query.trim()) {
      const q = query.trim().toLowerCase();
      availFields = availFields.filter(f => f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q));
    }

    if (availFields.length === 0) {
      listEl.innerHTML = `<div style="padding: 20px; text-align: center; color: #888; font-style: italic;">Поле не найдено</div>`;
      return;
    }

    let html = "";
    availFields.forEach(f => {
      const isSel = (f.key === selectedKey);
      const bg = isSel ? "#316ac5" : "#ffffff";
      const fg = isSel ? "#ffffff" : "#111111";
      html += `
        <div id="ujFmItem_${f.key}" data-key="${f.key}"
             style="padding: 3px 8px; font-size: 11px; background: ${bg}; color: ${fg}; cursor: pointer; user-select: none; display: flex; align-items: center; gap: 6px; border-bottom: 1px dotted #e0dec8;"
             onclick="UniversalJournal.selectFieldModalItem('${f.key}')"
             ondblclick="UniversalJournal.confirmModalFieldSelection('${f.key}')">
          <span style="font-size: 10px; color: ${isSel ? '#ffffff' : '#4a78c4'};">▬</span>
          <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: ${isSel ? 'bold' : 'normal'};">${this.escapeHtml(f.label)}</span>
        </div>
      `;
    });
    listEl.innerHTML = html;

    const activeEl = listEl.querySelector(`[id='ujFmItem_${selectedKey}']`);
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest" });
    }
  },

  filterFieldSelectModalList: function(query) {
    this.renderFieldSelectModalList(this.fieldSelectCurrentKey, query);
  },

  selectFieldModalItem: function(key) {
    this.fieldSelectCurrentKey = key;
    const listEl = document.getElementById("ujFieldSelectModalList");
    if (!listEl) return;
    listEl.querySelectorAll("[id^='ujFmItem_']").forEach(el => {
      const isSel = (el.getAttribute("data-key") === key);
      el.style.background = isSel ? "#316ac5" : "#ffffff";
      el.style.color = isSel ? "#ffffff" : "#111111";
      const icon = el.querySelector("span:first-child");
      if (icon) icon.style.color = isSel ? "#ffffff" : "#4a78c4";
      const lbl = el.querySelector("span:last-child");
      if (lbl) lbl.style.fontWeight = isSel ? "bold" : "normal";
    });
  },

  confirmModalFieldSelection: function(explicitKey) {
    const key = explicitKey || this.fieldSelectCurrentKey;
    const idx = this.fieldSelectTargetIdx;
    if (idx !== undefined && idx !== null && key && this.tempFilterCriteria[idx]) {
      this.onFilterCritFieldChange(idx, key);
    }
    this.closeFieldSelectModal();
  },

  onFieldSelectModalKeydown: function(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      this.closeFieldSelectModal();
    } else if (e.key === "Enter") {
      e.preventDefault();
      this.confirmModalFieldSelection();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const listEl = document.getElementById("ujFieldSelectModalList");
      if (!listEl) return;
      const items = Array.from(listEl.querySelectorAll("[id^='ujFmItem_']"));
      if (items.length === 0) return;
      let curIdx = items.findIndex(el => el.getAttribute("data-key") === this.fieldSelectCurrentKey);
      if (e.key === "ArrowDown") {
        curIdx = (curIdx + 1) < items.length ? curIdx + 1 : 0;
      } else {
        curIdx = (curIdx - 1) >= 0 ? curIdx - 1 : items.length - 1;
      }
      const nextKey = items[curIdx].getAttribute("data-key");
      this.selectFieldModalItem(nextKey);
      items[curIdx].scrollIntoView({ block: "nearest" });
    }
  },

  // 1C [...] Value List & Catalog Picker Engine (Screenshot 2 / 3 Tovarni Sklad)
  openFilterFieldPicker: function(idx) {
    const crit = this.tempFilterCriteria[idx];
    if (!crit) return;
    const inputEl = document.getElementById(`ujFilterValInput_${idx}`) || document.getElementById(`ujFilterValInput_${idx}_from`);

    this.selectFilterCritRow(idx);
    this.hideFilterAutocomplete();

    const op = crit.operator || "Равно";
    const isInterval = op.startsWith("Интервал");

    // Tarix və ya interval üçün PeriodPicker modalını açırıq
    if (crit.fieldKey === "date" || isInterval) {
      if (window.PeriodPicker && typeof PeriodPicker.open === "function") {
        let sStart = crit.valueFrom || "";
        let sEnd = crit.valueTo || "";
        if (!sStart && !sEnd) {
          const curVal = (inputEl ? inputEl.value : (crit.value || "")) || "";
          if (curVal.includes("...") || curVal.includes("—") || curVal.includes("-")) {
            const parts = curVal.split(/\s*(?:\.\.\.|—|-)\s*/);
            sStart = parts[0] || "";
            sEnd = parts[1] || "";
          } else {
            sStart = curVal;
            sEnd = curVal;
          }
        }
        PeriodPicker.open({
          startDate: sStart,
          endDate: sEnd,
          onSelect: (st, en) => {
            if (isInterval) {
              crit.valueFrom = st;
              crit.valueTo = en;
              crit.value = (st && en) ? `${st} ... ${en}` : (st || en || "");
              const fromEl = document.getElementById(`ujFilterValInput_${idx}_from`);
              const toEl = document.getElementById(`ujFilterValInput_${idx}_to`);
              if (fromEl) fromEl.value = st;
              if (toEl) toEl.value = en;
            } else {
              const res = st || en || "";
              if (inputEl) inputEl.value = res;
              crit.value = res;
            }
            if (st || en || crit.value) {
              this.setCritEnabled(idx, true);
            }
          }
        });
        return;
      }
    }

    const isMulti = (op === "В группе из списка" || op === "В списке" || op === "Не в списке");

    let catalog = null;
    if (crit.fieldKey === "contract_price_type") {
      catalog = "ТипыЦенНоменклатуры";
    } else if (crit.fieldKey === "contract") {
      catalog = "ДоговорыКонтрагентов";
    } else if (crit.fieldKey === "kontragent" || crit.fieldKey === "kontragent_code" || crit.fieldKey === "golovnoy_kontragent" || crit.fieldKey === "golovnoy_kontragent_code") {
      catalog = "Контрагенты";
    } else if (crit.fieldKey === "agent") {
      catalog = "Агенты";
    } else if (crit.fieldKey === "warehouse") {
      catalog = "Склады";
    } else if (crit.fieldKey === "responsible") {
      catalog = "Пользователи";
    } else if (crit.fieldKey === "pogruzka_voditel") {
      catalog = "Водители";
    } else if (crit.fieldKey === "portfolio") {
      catalog = "Портфели";
    } else if (crit.fieldKey === "nomenclature") {
      catalog = "Номенклатура";
    }

    if (catalog) {
      if (isMulti) {
        if (window.ValueListModal && typeof ValueListModal.open === "function") {
          ValueListModal.open({
            targetInput: inputEl,
            catalog: catalog,
            structuredFilter: crit.structuredFilter,
            onApply: (data) => {
              crit.value = (data && data.displayStr) ? data.displayStr : (inputEl ? inputEl.value : "");
              crit.structuredFilter = data;
              if (inputEl) {
                inputEl.value = crit.value;
                inputEl.dataset.structuredList = JSON.stringify(data);
              }
              this.setCritEnabled(idx, true);
            }
          });
        }
      } else {
        if (window.CatalogSelector && typeof CatalogSelector.open === "function") {
          CatalogSelector.open({
            catalog: catalog,
            targetInput: inputEl,
            multiSelect: false,
            onSelect: (selectedItem) => {
              if (selectedItem) {
                const name = selectedItem.name || selectedItem.Наименование || "";
                if (inputEl) inputEl.value = name;
                crit.value = name;
                this.setCritEnabled(idx, true);
              }
            }
          });
        }
      }
      return;
    }

    if (crit.fieldKey === "vms_status") {
      if (isMulti && window.ValueListModal) {
        ValueListModal.open({
          targetInput: inputEl,
          catalog: "Статусы ВМС",
          structuredFilter: crit.structuredFilter,
          onApply: (data) => {
            crit.value = (data && data.displayStr) ? data.displayStr : (inputEl ? inputEl.value : "");
            crit.structuredFilter = data;
            if (inputEl) {
              inputEl.value = crit.value;
              inputEl.dataset.structuredList = JSON.stringify(data);
            }
            this.setCritEnabled(idx, true);
          }
        });
      } else {
        const statuses = ["Подтвержден WMS", "Выгружен", "Новый", "В обработке", "Готов к отгрузке", "Отменен"];
        const cur = inputEl.value || "";
        const nextIdx = (statuses.indexOf(cur) + 1) % statuses.length;
        inputEl.value = statuses[nextIdx];
        crit.value = statuses[nextIdx];
        this.setCritEnabled(idx, true);
      }
      return;
    }

    if (isMulti && window.ValueListModal) {
      ValueListModal.open({
        targetInput: inputEl,
        catalog: crit.fieldLabel || crit.fieldKey,
        structuredFilter: crit.structuredFilter,
        onApply: (data) => {
          crit.value = (data && data.displayStr) ? data.displayStr : (inputEl ? inputEl.value : "");
          crit.structuredFilter = data;
          if (inputEl) {
            inputEl.value = crit.value;
            inputEl.dataset.structuredList = JSON.stringify(data);
          }
          this.setCritEnabled(idx, true);
        }
      });
    }
  },

  onFilterIntervalInput: function(idx, which, inputEl) {
    const crit = this.tempFilterCriteria[idx];
    if (!crit) return;
    if (crit.fieldKey === "date") {
      inputEl.value = inputEl.value.replace(/[^0-9.:\s\/\-,]/g, "");
    }
    if (which === "from") crit.valueFrom = inputEl.value;
    else crit.valueTo = inputEl.value;
    const vFrom = crit.valueFrom || "";
    const vTo = crit.valueTo || "";
    crit.value = (vFrom || vTo) ? `${vFrom} ... ${vTo}` : "";
    if ((vFrom || vTo).trim().length > 0) {
      this.setCritEnabled(idx, true);
    }
  },

  onFilterIntervalBlur: function(idx, which, inputEl) {
    const crit = this.tempFilterCriteria[idx];
    if (!crit) return;
    const val = inputEl.value.trim();
    if (val && window.PeriodPicker && typeof PeriodPicker.autoCompleteDate === "function") {
      const defTime = (which === "to") ? "23:59:59" : "00:00:00";
      inputEl.value = PeriodPicker.autoCompleteDate(val, defTime);
      if (which === "from") crit.valueFrom = inputEl.value;
      else crit.valueTo = inputEl.value;
    }
    this.validateFilterInterval(idx, which);
    const vFrom = crit.valueFrom || "";
    const vTo = crit.valueTo || "";
    crit.value = (vFrom || vTo) ? `${vFrom} ... ${vTo}` : "";
    if ((vFrom || vTo).trim().length > 0) {
      this.setCritEnabled(idx, true);
    }
  },

  onFilterIntervalKeydown: function(idx, which, inputEl, event) {
    const crit = this.tempFilterCriteria[idx];
    const isDateField = crit && (crit.fieldKey === "date");

    if (isDateField) {
      if ([
        "Backspace", "Delete", "Tab", "Enter", "Escape", 
        "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", 
        "Home", "End", "F4"
      ].includes(event.key)) {
        // funksional düymələrə icazə ver
      } else if (event.ctrlKey || event.metaKey) {
        // Ctrl+C, Ctrl+V və s.
      } else if (event.key === "." || event.key === ":" || event.key === " ") {
        // ayrıcılar
      } else if (!/^\d$/.test(event.key)) {
        // HƏRF VƏ DİGƏR SİMOLLAR QƏTİ QADAĞANDIR!
        event.preventDefault();
        return;
      }
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const val = inputEl.value.trim();
      if (val && window.PeriodPicker && typeof PeriodPicker.autoCompleteDate === "function") {
        const defTime = (which === "to") ? "23:59:59" : "00:00:00";
        inputEl.value = PeriodPicker.autoCompleteDate(val, defTime);
        if (crit) {
          if (which === "from") crit.valueFrom = inputEl.value;
          else crit.valueTo = inputEl.value;
        }
      }
      this.validateFilterInterval(idx, which);
      if (crit) {
        const vFrom = crit.valueFrom || "";
        const vTo = crit.valueTo || "";
        crit.value = (vFrom || vTo) ? `${vFrom} ... ${vTo}` : "";
      }

      if (which === "from") {
        const toEl = document.getElementById(`ujFilterValInput_${idx}_to`);
        if (toEl) {
          toEl.focus();
          if (toEl.setSelectionRange) toEl.setSelectionRange(0, 2);
        }
      } else {
        inputEl.blur();
      }
    }
  },

  validateFilterInterval: function(idx, which) {
    const crit = this.tempFilterCriteria[idx];
    if (!crit) return;
    const fromEl = document.getElementById(`ujFilterValInput_${idx}_from`);
    const toEl = document.getElementById(`ujFilterValInput_${idx}_to`);
    const sFrom = fromEl ? fromEl.value.trim() : (crit.valueFrom || "");
    const sTo = toEl ? toEl.value.trim() : (crit.valueTo || "");
    if (!sFrom || !sTo) return;

    if (window.PeriodPicker && typeof PeriodPicker.parseDateObj === "function") {
      const dtFrom = PeriodPicker.parseDateObj(sFrom, false);
      const dtTo = PeriodPicker.parseDateObj(sTo, true);
      if (dtFrom && dtTo && dtFrom.getTime() > dtTo.getTime()) {
        if (which === "from") {
          const d = String(dtFrom.getDate()).padStart(2, "0");
          const m = String(dtFrom.getMonth() + 1).padStart(2, "0");
          const y = dtFrom.getFullYear();
          const syncedTo = `${d}.${m}.${y} 23:59:59`;
          crit.valueTo = syncedTo;
          if (toEl) toEl.value = syncedTo;
        } else if (which === "to") {
          const d = String(dtTo.getDate()).padStart(2, "0");
          const m = String(dtTo.getMonth() + 1).padStart(2, "0");
          const y = dtTo.getFullYear();
          const syncedFrom = `${d}.${m}.${y} 00:00:00`;
          crit.valueFrom = syncedFrom;
          if (fromEl) fromEl.value = syncedFrom;
        }
      }
    }
  },

  onFilterSingleBlur: function(idx, inputEl) {
    const crit = this.tempFilterCriteria[idx];
    if (!crit) return;
    const val = inputEl.value.trim();
    if (val) {
      this.setCritEnabled(idx, true);
    }
    if (crit.fieldKey === "date" && val && window.PeriodPicker && typeof PeriodPicker.autoCompleteDate === "function") {
      inputEl.value = PeriodPicker.autoCompleteDate(val, "00:00:00");
      crit.value = inputEl.value;
    }
  },

  // Autocomplete Live Search Engine (Only triggered on user typing >= 1 char)
  onFilterValueInput: function(idx, inputEl, event) {
    if (this.tempFilterCriteria[idx]) {
      const crit = this.tempFilterCriteria[idx];
      if (crit.fieldKey === "date" || inputEl.classList.contains("uj-filter-date")) {
        inputEl.value = inputEl.value.replace(/[^0-9.:\s\/\-,]/g, "");
      }
      crit.value = inputEl.value;
      if (inputEl.value.trim().length > 0) {
        this.setCritEnabled(idx, true);
      }
    }
    this.showFilterAutocomplete(idx, inputEl);
  },

  showFilterAutocomplete: function(idx, inputEl) {
    const crit = this.tempFilterCriteria[idx];
    if (!crit) return;
    if (crit.operator === "Заполнено" || crit.operator === "Не заполнено") {
      this.hideFilterAutocomplete();
      return;
    }

    const curVal = inputEl.value || "";
    let searchTerm = curVal.trim().toLowerCase();
    const isListOp = (crit.operator === "В группе из списка" || crit.operator === "В списке" || crit.operator === "Не в списке");
    if (isListOp && searchTerm.includes(";")) {
      const parts = searchTerm.split(";");
      searchTerm = parts[parts.length - 1].trim();
    }

    if (!searchTerm || searchTerm.length < 1) {
      this.hideFilterAutocomplete();
      return;
    }

    let catalog = null;
    if (crit.fieldKey === "contract_price_type") catalog = "ТипыЦенНоменклатуры";
    else if (crit.fieldKey === "contract") catalog = "ДоговорыКонтрагентов";
    else if (crit.fieldKey === "kontragent" || crit.fieldKey === "kontragent_code") catalog = "Контрагенты";
    else if (crit.fieldKey === "warehouse") catalog = "Склады";
    else if (crit.fieldKey === "responsible") catalog = "Пользователи";
    else if (crit.fieldKey === "pogruzka_voditel") catalog = "Водители";
    else if (crit.fieldKey === "portfolio") catalog = "Портфели";
    else if (crit.fieldKey === "nomenclature") catalog = "Номенклатура";

    const values = this.getDistinctFieldValues(crit.fieldKey);
    let filtered = [];

    if (crit.fieldKey === "nomenclature") {
      const foundMap = new Map();
      (this.items || []).forEach(it => {
        (it.nom_keys || []).forEach((k, i) => {
          const parts = String(k).split("|");
          const code = parts[0] || "";
          const cleanCode = parts[1] || code.replace(/^0+/, "");
          const art = parts[2] || "";
          const name = parts[3] || (it.nomenclatures || [])[i] || parts[0] || "";
          if (k.includes(searchTerm) || cleanCode.includes(searchTerm) || name.toLowerCase().includes(searchTerm) || art.toLowerCase().includes(searchTerm)) {
            const displayLabel = cleanCode ? `[${cleanCode}] ${name}` : name;
            foundMap.set(displayLabel, name);
          }
        });
      });
      if (foundMap.size > 0) {
        filtered = Array.from(foundMap.keys()).sort((a, b) => a.localeCompare(b, "ru"));
      } else {
        filtered = (values || []).filter(v => v.toLowerCase().includes(searchTerm));
      }
    } else if (crit.fieldKey === "vms_status") {
      const statuses = ["Подтвержден WMS", "Выгружен", "Новый", "В обработке", "Готов к отгрузке", "Отменен"];
      filtered = statuses.filter(s => s.toLowerCase().includes(searchTerm));
    } else {
      filtered = (values || []).filter(v => v.toLowerCase().includes(searchTerm));
    }

    if (filtered.length > 0) {
      this.renderFilterAutocompletePopup(idx, inputEl, filtered);
    }

    // Live catalog search if field maps to a 1C catalog and user typed >= 2 chars
    if (catalog && searchTerm.length >= 2) {
      clearTimeout(this._filterAutoLiveTimer);
      this._filterAutoLiveTimer = setTimeout(async () => {
        try {
          const creds = (typeof SessionManager !== "undefined") ? SessionManager.getCredentials() : {};
          const res = await fetch("/api/catalog_data", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...creds,
              catalog: catalog,
              search: searchTerm
            })
          });
          const data = await res.json();
          if (data.success && data.items && data.items.length) {
            const mergedMap = new Map();
            filtered.forEach(f => mergedMap.set(f, f));
            data.items.forEach(it => {
              const label = it.code ? `[${it.code}] ${it.name}` : it.name;
              mergedMap.set(label, it.name);
            });
            const mergedList = Array.from(mergedMap.keys());
            this.renderFilterAutocompletePopup(idx, inputEl, mergedList);
          }
        } catch (e) {}
      }, 160);
    } else if (filtered.length === 0) {
      this.hideFilterAutocomplete();
    }
  },

  renderFilterAutocompletePopup: function(idx, inputEl, filtered) {
    const popup = document.getElementById("ujFilterAutocompletePopup");
    const container = document.getElementById("ujFilterTableContainer");
    if (!popup || !container) return;

    let itemsHtml = `<div style="padding: 2px 6px; background: #e5e2cf; border-bottom: 1px solid #b0af9f; font-size: 10px; color: #555; font-weight: bold;">Найдено: ${filtered.length}</div>`;
    filtered.slice(0, 50).forEach((itemVal) => {
      itemsHtml += `
        <div class="uj-auto-item" data-val="${this.escapeHtml(itemVal)}"
             style="padding: 3px 8px; cursor: pointer; user-select: none; border-bottom: 1px dotted #eee; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #111111 !important; background: #ffffff !important;"
             onmouseover="this.style.background='#316ac5'; this.style.color='#ffffff';"
             onmouseout="this.style.background='#ffffff'; this.style.color='#111111';"
             onmousedown="event.preventDefault(); UniversalJournal.selectAutocompleteSuggestion(${idx}, '${this.escapeHtml(itemVal)}');">
          ${this.escapeHtml(itemVal)}
        </div>
      `;
    });
    popup.innerHTML = itemsHtml;

    const inputRect = inputEl.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    popup.style.top = (inputRect.bottom - containerRect.top + container.scrollTop) + "px";
    popup.style.left = (inputRect.left - containerRect.left + container.scrollLeft) + "px";
    popup.style.width = Math.max(inputRect.width, 260) + "px";
    popup.style.display = "block";
    this.activeAutocompleteIdx = idx;
    this.activeSuggestionIdx = -1;
  },

  selectAutocompleteSuggestion: function(idx, val) {
    const inputEl = document.getElementById(`ujFilterValInput_${idx}`);
    const crit = this.tempFilterCriteria[idx];
    if (!crit) return;

    // If suggestion has "[code] Name", strip bracket prefix for cleaner search or keep it
    const cleanVal = val.replace(/^\[[^\]]+\]\s*/, "");

    const isListOp = (crit.operator === "В группе из списка" || crit.operator === "В списке");
    if (isListOp && inputEl && inputEl.value.includes(";")) {
      const parts = inputEl.value.split(";").map(s => s.trim()).filter(Boolean);
      parts.pop();
      parts.push(cleanVal);
      const combined = parts.join("; ") + "; ";
      crit.value = combined;
      if (inputEl) inputEl.value = combined;
    } else {
      crit.value = cleanVal;
      if (inputEl) inputEl.value = cleanVal;
    }

    this.setCritEnabled(idx, true);
    this.hideFilterAutocomplete();
    if (inputEl) inputEl.focus();
  },

  hideFilterAutocomplete: function() {
    const popup = document.getElementById("ujFilterAutocompletePopup");
    if (popup) popup.style.display = "none";
    this.activeAutocompleteIdx = -1;
    this.activeSuggestionIdx = -1;
  },

  onFilterInputKeydown: function(idx, inputEl, event) {
    const crit = this.tempFilterCriteria[idx];
    const isDateField = crit && (crit.fieldKey === "date");

    if (isDateField) {
      if ([
        "Backspace", "Delete", "Tab", "Enter", "Escape", 
        "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", 
        "Home", "End", "F4"
      ].includes(event.key)) {
        // icazə ver
      } else if (event.ctrlKey || event.metaKey) {
        // icazə ver
      } else if (event.key === "." || event.key === ":" || event.key === " ") {
        // icazə ver
      } else if (!/^\d$/.test(event.key)) {
        // HƏRF VƏ YAD SİMVOL QADAĞANDIR!
        event.preventDefault();
        return;
      }
    }

    const popup = document.getElementById("ujFilterAutocompletePopup");
    if (!popup || popup.style.display !== "block") {
      if (event.key === "Enter") {
        event.preventDefault();
        const val = inputEl.value.trim();
        if (crit && crit.fieldKey === "date" && val && window.PeriodPicker && typeof PeriodPicker.autoCompleteDate === "function") {
          inputEl.value = PeriodPicker.autoCompleteDate(val, "00:00:00");
          crit.value = inputEl.value;
        }
        inputEl.blur();
        return;
      }
      if (event.key === "ArrowDown" || event.key === "F4") {
        event.preventDefault();
        this.showFilterAutocomplete(idx, inputEl);
      }
      return;
    }

    const items = popup.querySelectorAll(".uj-auto-item");
    if (items.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      this.activeSuggestionIdx = Math.min(this.activeSuggestionIdx + 1, items.length - 1);
      this.highlightActiveSuggestion(items);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      this.activeSuggestionIdx = Math.max(this.activeSuggestionIdx - 1, 0);
      this.highlightActiveSuggestion(items);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (this.activeSuggestionIdx >= 0 && items[this.activeSuggestionIdx]) {
        const val = items[this.activeSuggestionIdx].getAttribute("data-val");
        this.selectAutocompleteSuggestion(idx, val);
      } else {
        this.hideFilterAutocomplete();
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      this.hideFilterAutocomplete();
    }
  },

  highlightActiveSuggestion: function(items) {
    items.forEach((item, i) => {
      const isSel = (i === this.activeSuggestionIdx);
      item.style.background = isSel ? "#316ac5" : "#ffffff";
      item.style.color = isSel ? "#ffffff" : "#111111";
      if (isSel) {
        item.scrollIntoView({ block: "nearest" });
      }
    });
  },

  finishFilterEditing: function() {
    this.hideFilterAutocomplete();

    // Bütün cari inputların qiymətlərini topla, tamamla və dəqiqləşdir
    for (let idx = 0; idx < this.tempFilterCriteria.length; idx++) {
      const crit = this.tempFilterCriteria[idx];
      if (!crit) continue;
      const isInterval = crit.operator && crit.operator.startsWith("Интервал");

      if (isInterval) {
        const fromEl = document.getElementById(`ujFilterValInput_${idx}_from`);
        const toEl = document.getElementById(`ujFilterValInput_${idx}_to`);

        if (fromEl) {
          fromEl.style.border = "1px solid #7f9db9";
          if (fromEl.value.trim() && window.PeriodPicker && typeof PeriodPicker.autoCompleteDate === "function") {
            fromEl.value = PeriodPicker.autoCompleteDate(fromEl.value.trim(), "00:00:00");
          }
          crit.valueFrom = fromEl.value.trim();
        }
        if (toEl) {
          toEl.style.border = "1px solid #7f9db9";
          if (toEl.value.trim() && window.PeriodPicker && typeof PeriodPicker.autoCompleteDate === "function") {
            toEl.value = PeriodPicker.autoCompleteDate(toEl.value.trim(), "23:59:59");
          }
          crit.valueTo = toEl.value.trim();
        }

        // QƏTİ QADAĞA: НАЧАЛО HEÇ VAXT КОНЕЦ-DƏN BÖYÜK OLA BİLMƏZ!
        if (crit.valueFrom && crit.valueTo && window.PeriodPicker && typeof PeriodPicker.parseDateObj === "function") {
          const dtFrom = PeriodPicker.parseDateObj(crit.valueFrom, false);
          const dtTo = PeriodPicker.parseDateObj(crit.valueTo, true);
          if (dtFrom && dtTo && dtFrom.getTime() > dtTo.getTime()) {
            if (fromEl) {
              fromEl.style.border = "1px solid #cc0000";
              fromEl.focus();
            }
            if (toEl) {
              toEl.style.border = "1px solid #cc0000";
            }
            alert("Дата начала не может быть больше даты окончания!");
            return; // İcazə verilmir, pəncərə bağlanmır!
          }
        }

        crit.value = (crit.valueFrom || crit.valueTo) ? `${crit.valueFrom || ''} ... ${crit.valueTo || ''}` : '';
      } else {
        const singleEl = document.getElementById(`ujFilterValInput_${idx}`);
        if (singleEl) {
          if (crit.fieldKey === "date" && singleEl.value.trim() && window.PeriodPicker && typeof PeriodPicker.autoCompleteDate === "function") {
            singleEl.value = PeriodPicker.autoCompleteDate(singleEl.value.trim(), "00:00:00");
          }
          crit.value = singleEl.value.trim();
        }
      }
    }

    this.activeFilters = JSON.parse(JSON.stringify(this.tempFilterCriteria));
    if (this.activeFilters.length > 0 && !this.activePresetName) {
      this.activePresetName = "Пользовательский";
    } else if (this.activeFilters.length === 0) {
      this.activePresetName = "";
    }
    this.saveActiveFiltersToStorage();
    this.closeFilterModal();
    this.executeSearchOrFilter();
    this.updateStatus(this.activeFilters.length > 0 ? "Отбор применен" : "Отбор отключен");
  },

  // ==========================================
  // Active Filters Persistence (Refresh F5 üçün)
  // ==========================================
  getActiveFiltersStorageKey: function() {
    return "uj_active_filters_" + (this.activeDocType || "default");
  },

  loadActiveFiltersFromStorage: function() {
    try {
      const raw = localStorage.getItem(this.getActiveFiltersStorageKey());
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.activeFilters = parsed;
          return;
        }
      }
    } catch(e) {}
    this.activeFilters = [];
  },

  saveActiveFiltersToStorage: function() {
    try {
      if (this.activeFilters && this.activeFilters.length > 0) {
        localStorage.setItem(this.getActiveFiltersStorageKey(), JSON.stringify(this.activeFilters));
      } else {
        localStorage.removeItem(this.getActiveFiltersStorageKey());
      }
    } catch(e) {}
  },

  // ==========================================
  // Presets & Persistence Engine (💾⚙️ / 📁⚙️)
  // ==========================================
  getPresetsStorageKey: function() {
    return "uj_filter_presets_" + (this.activeDocType || "default");
  },

  getSavedPresets: function() {
    try {
      const raw = localStorage.getItem(this.getPresetsStorageKey());
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn("Failed to read filter presets:", e);
    }
    return [];
  },

  savePresetsToStorage: function(presets) {
    try {
      localStorage.setItem(this.getPresetsStorageKey(), JSON.stringify(presets));
    } catch (e) {
      console.error("Failed to save filter presets:", e);
    }
  },

  getDefaultPreset: function() {
    const list = this.getSavedPresets();
    return list.find(p => p.isDefault === true) || null;
  },

  checkAndApplyStartupFilter: function() {
    // 1. If session already has active filters, re-apply them
    if (this.activeFilters && this.activeFilters.length > 0) {
      this.applyFiltersAndSearch();
      return;
    }

    // 2. Otherwise check if there is a default preset marked for startup
    const defPreset = this.getDefaultPreset();
    if (defPreset && Array.isArray(defPreset.criteria) && defPreset.criteria.length > 0) {
      this.activeFilters = JSON.parse(JSON.stringify(defPreset.criteria));
      this.activePresetName = defPreset.name || "По умолчанию";
      this.applyFiltersAndSearch();
      this.updateStatus(`Применен фильтр по умолчанию: "${this.activePresetName}"`);
      return;
    }

    // 3. No filter active: standard view
    this.filteredItems = [...this.items];
    if (this.currentSortCol) this.applySort();
    this.renderTable();
    this.updateStatus(`Загружено ${this.items.length} документов`);
    this.updateCountBadge(this.items.length);
    this.updateActiveFilterBadgeUI();
  },

  // Modal: Save Preset (💾⚙️)
  openPresetSaveModal: function() {
    let modal = document.getElementById("ujPresetSaveModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "ujPresetSaveModal";
      modal.className = "modal-overlay-1c";
      modal.style.zIndex = "10000";
      document.body.appendChild(modal);
    }

    const currentName = this.activePresetName || (this.activeFilters.length > 0 ? "Отбор " + new Date().toLocaleDateString("ru-RU") : "");
    const defPreset = this.getDefaultPreset();
    const isCurrentlyDefault = (defPreset && defPreset.name === currentName);

    modal.innerHTML = `
      <div class="modal-window-1c" style="width: 440px; background: #f0eee3; border: 1px solid #7f9db9; box-shadow: 0 4px 20px rgba(0,0,0,0.4); font-family: Tahoma, 'MS Sans Serif', Arial, sans-serif; font-size: 11px;">
        
        <div class="modal-header-1c" style="background: linear-gradient(to bottom, #fdfdfe, #d6d9e0); padding: 5px 8px; border-bottom: 1px solid #a0a0a0; display: flex; align-items: center; justify-content: space-between;">
          <div style="font-weight: bold; color: #000; font-size: 11px; display: flex; align-items: center; gap: 6px;">
            <span>💾</span>
            <span>Сохранение настройки отбора</span>
          </div>
          <button type="button" class="window-btn-close" onclick="UniversalJournal.closePresetSaveModal()" style="width: 17px; height: 17px; border: 1px solid #7f9db9; background: #e5e2cf; cursor: pointer;">✕</button>
        </div>

        <div style="padding: 12px; display: flex; flex-direction: column; gap: 10px;">
          <div>
            <label style="display: block; font-weight: bold; margin-bottom: 4px;">Имя настройки:</label>
            <input type="text" id="ujPresetSaveNameInput" class="input-1c" style="width: 100%; height: 24px; padding: 2px 6px; font-size: 12px;"
                   value="${this.escapeHtml(currentName)}" placeholder="Например: Təsdiqlənmiş WMS və s.">
          </div>

          <div style="background: #fdfdf9; border: 1px solid #d4d0c8; padding: 8px; border-radius: 2px;">
            <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-weight: bold; color: #003366;">
              <input type="checkbox" id="ujPresetSaveIsDefaultCheck" ${isCurrentlyDefault ? 'checked' : ''} style="cursor: pointer;">
              <span>Использовать при открытии (Açılışda daimi açılsın)</span>
            </label>
            <div style="font-size: 10px; color: #666; margin-top: 4px; margin-left: 20px; line-height: 1.3;">
              Если флажок установлен, данный фильтр будет автоматически применяться при каждом запуске этого журнала документов.
            </div>
          </div>

          <div style="font-size: 11px; color: #555;">
            Текущих условий в фильтре: <strong>${this.activeFilters.length}</strong>
          </div>
        </div>

        <div style="padding: 6px 10px; background: #e5e2cf; border-top: 1px solid #b0af9f; display: flex; justify-content: flex-end; gap: 6px;">
          <button type="button" class="btn-1c btn-1c-primary" onclick="UniversalJournal.saveCurrentFilterPreset()" style="height: 24px; padding: 0 16px; font-weight: bold;">
            Сохранить
          </button>
          <button type="button" class="btn-1c" onclick="UniversalJournal.closePresetSaveModal()" style="height: 24px; padding: 0 12px;">
            Отмена
          </button>
        </div>

      </div>
    `;

    modal.style.display = "flex";
    setTimeout(() => {
      const inp = document.getElementById("ujPresetSaveNameInput");
      if (inp) { inp.focus(); inp.select(); }
    }, 50);
  },

  closePresetSaveModal: function() {
    const modal = document.getElementById("ujPresetSaveModal");
    if (modal) modal.style.display = "none";
  },

  saveCurrentFilterPreset: function() {
    const inp = document.getElementById("ujPresetSaveNameInput");
    const isDefCheck = document.getElementById("ujPresetSaveIsDefaultCheck");
    const name = inp ? inp.value.trim() : "";
    if (!name) {
      alert("Пожалуйста, введите имя настройки.");
      if (inp) inp.focus();
      return;
    }

    const isDefault = isDefCheck ? Boolean(isDefCheck.checked) : false;
    const presets = this.getSavedPresets();

    // Check if updating existing by name
    const existingIdx = presets.findIndex(p => p.name.toLowerCase() === name.toLowerCase());
    const presetObj = {
      id: existingIdx >= 0 ? presets[existingIdx].id : ("preset_" + Date.now()),
      name: name,
      isDefault: isDefault,
      criteria: JSON.parse(JSON.stringify(this.activeFilters))
    };

    if (isDefault) {
      presets.forEach(p => p.isDefault = false);
    }

    if (existingIdx >= 0) {
      presets[existingIdx] = presetObj;
    } else {
      presets.push(presetObj);
    }

    this.savePresetsToStorage(presets);
    this.activePresetName = name;
    this.closePresetSaveModal();
    this.updateActiveFilterBadgeUI();
    this.updateStatus(`Настройка "${name}" успешно сохранена`);
  },

  // Modal: Restore / Manage Presets (📁⚙️)
  openPresetRestoreModal: function() {
    let modal = document.getElementById("ujPresetRestoreModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "ujPresetRestoreModal";
      modal.className = "modal-overlay-1c";
      modal.style.zIndex = "10000";
      document.body.appendChild(modal);
    }

    this.renderPresetRestoreModalContent();
    modal.style.display = "flex";
  },

  closePresetRestoreModal: function() {
    const modal = document.getElementById("ujPresetRestoreModal");
    if (modal) modal.style.display = "none";
  },

  selectedPresetId: null,

  renderPresetRestoreModalContent: function() {
    const modal = document.getElementById("ujPresetRestoreModal");
    if (!modal) return;

    const presets = this.getSavedPresets();
    if (!this.selectedPresetId && presets.length > 0) {
      this.selectedPresetId = presets[0].id;
    }

    let rowsHtml = "";
    presets.forEach((p, idx) => {
      const isSelected = (p.id === this.selectedPresetId);
      const bg = isSelected ? "#316ac5" : (idx % 2 === 1 ? "#f9f8f4" : "#ffffff");
      const fg = isSelected ? "#ffffff" : "#111111";

      const summary = (p.criteria || []).map(c => {
        const valStr = (c.operator === "Заполнено" || c.operator === "Не заполнено") ? "" : ` = ${c.value}`;
        return `${c.fieldLabel || c.fieldKey}${valStr}`;
      }).join("; ");

      rowsHtml += `
        <tr style="background: ${bg}; color: ${fg}; height: 24px; cursor: pointer; user-select: none;"
            onclick="UniversalJournal.selectPresetRow('${p.id}')"
            ondblclick="UniversalJournal.applyPresetById('${p.id}')">
          <td style="width: 32px; text-align: center; border: 1px solid #d4d0c8; font-size: 13px;">
            ${p.isDefault ? '⭐' : ''}
          </td>
          <td style="padding: 2px 6px; border: 1px solid #d4d0c8; font-weight: ${p.isDefault ? 'bold' : 'normal'}; width: 180px;">
            ${this.escapeHtml(p.name)}
          </td>
          <td style="padding: 2px 6px; border: 1px solid #d4d0c8; font-size: 10px; color: ${isSelected ? '#e0f0ff' : '#555'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${this.escapeHtml(summary || "(без условий)")}
          </td>
          <td style="width: 140px; text-align: center; border: 1px solid #d4d0c8;">
            <button type="button" class="btn-1c" style="height: 19px; padding: 0 4px; font-size: 10px;"
                    onclick="event.stopPropagation(); UniversalJournal.togglePresetDefault('${p.id}')"
                    title="${p.isDefault ? 'Снять признак по умолчанию' : 'Сделать открываемым по умолчанию при старте'}">
              ${p.isDefault ? 'Снять ⭐' : '⭐ По умолчанию'}
            </button>
            <button type="button" class="btn-1c" style="height: 19px; padding: 0 4px; font-size: 10px; color: #a00; margin-left: 2px;"
                    onclick="event.stopPropagation(); UniversalJournal.deletePresetById('${p.id}')"
                    title="Удалить эту настройку">
              ✕
            </button>
          </td>
        </tr>
      `;
    });

    modal.innerHTML = `
      <div class="modal-window-1c" style="width: 650px; max-height: 80vh; display: flex; flex-direction: column; background: #f0eee3; border: 1px solid #7f9db9; box-shadow: 0 6px 25px rgba(0,0,0,0.4); font-family: Tahoma, 'MS Sans Serif', Arial, sans-serif; font-size: 11px;">
        
        <div class="modal-header-1c" style="background: linear-gradient(to bottom, #fdfdfe, #d6d9e0); padding: 5px 8px; border-bottom: 1px solid #a0a0a0; display: flex; align-items: center; justify-content: space-between;">
          <div style="font-weight: bold; color: #000; font-size: 11px; display: flex; align-items: center; gap: 6px;">
            <span>📁</span>
            <span>Выбор настройки списка: ${this.escapeHtml(this.docTitle || this.activeDocType)}</span>
          </div>
          <button type="button" class="window-btn-close" onclick="UniversalJournal.closePresetRestoreModal()" style="width: 17px; height: 17px; border: 1px solid #7f9db9; background: #e5e2cf; cursor: pointer;">✕</button>
        </div>

        <div style="padding: 4px 8px; background: #e5e2cf; border-bottom: 1px solid #b0af9f; display: flex; align-items: center; gap: 4px;">
          <button type="button" class="btn-1c btn-1c-primary" onclick="UniversalJournal.applySelectedPreset()" style="height: 23px; padding: 0 10px; font-weight: bold;">
            Выбрать (Применить)
          </button>
          <button type="button" class="btn-1c" onclick="UniversalJournal.clearFilterAndCloseModal()" style="height: 23px; padding: 0 8px; color: #a00;">
            Отключить отбор (Сбросить)
          </button>
        </div>

        <div style="flex: 1; overflow: auto; background: #ffffff; min-height: 200px; max-height: 380px;">
          <table style="width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 11px;">
            <thead>
              <tr style="background: #e3dec9; border-bottom: 1px solid #b0af9f; height: 21px;">
                <th style="width: 32px; text-align: center; border: 1px solid #d4d0c8;" title="По умолчанию на старте">⭐</th>
                <th style="width: 180px; text-align: left; padding: 2px 6px; border: 1px solid #d4d0c8;">Наименование</th>
                <th style="text-align: left; padding: 2px 6px; border: 1px solid #d4d0c8;">Условия</th>
                <th style="width: 140px; text-align: center; border: 1px solid #d4d0c8;">Действия</th>
              </tr>
            </thead>
            <tbody>
              ${presets.length === 0 ? `
                <tr>
                  <td colspan="4" style="text-align: center; padding: 30px; color: #777; font-style: italic;">
                    Нет сохраненных настроек отбора для этого журнала.<br>
                    Настройте отбор через [🔬] и нажмите [💾⚙️] для сохранения.
                  </td>
                </tr>
              ` : rowsHtml}
            </tbody>
          </table>
        </div>

        <div style="padding: 6px 10px; background: #e5e2cf; border-top: 1px solid #b0af9f; display: flex; justify-content: space-between; align-items: center;">
          <div style="font-size: 10px; color: #666;">
            ⭐ — Открывается по умолчанию при каждом открытии этого журнала
          </div>
          <div style="display: flex; gap: 6px;">
            <button type="button" class="btn-1c" onclick="UniversalJournal.closePresetRestoreModal()" style="height: 24px; padding: 0 14px;">
              Закрыть
            </button>
          </div>
        </div>

      </div>
    `;
  },

  selectPresetRow: function(id) {
    this.selectedPresetId = id;
    this.renderPresetRestoreModalContent();
  },

  applySelectedPreset: function() {
    if (this.selectedPresetId) {
      this.applyPresetById(this.selectedPresetId);
    }
  },

  applyPresetById: function(presetId) {
    const presets = this.getSavedPresets();
    const target = presets.find(p => p.id === presetId);
    if (!target) return;

    this.activeFilters = JSON.parse(JSON.stringify(target.criteria || []));
    this.activePresetName = target.name || "";
    this.closePresetRestoreModal();
    this.executeSearchOrFilter();
    this.updateStatus(`Применена настройка отбора: "${target.name}"`);
  },

  togglePresetDefault: function(presetId) {
    const presets = this.getSavedPresets();
    const target = presets.find(p => p.id === presetId);
    if (!target) return;

    const willBeDefault = !target.isDefault;
    if (willBeDefault) {
      presets.forEach(p => p.isDefault = false);
      target.isDefault = true;
    } else {
      target.isDefault = false;
    }

    this.savePresetsToStorage(presets);
    this.renderPresetRestoreModalContent();
    this.updateStatus(`Настройка "${target.name}" ${target.isDefault ? 'установлена по умолчанию' : 'снята с по умолчанию'}`);
  },

  deletePresetById: function(presetId) {
    const presets = this.getSavedPresets();
    const target = presets.find(p => p.id === presetId);
    if (!target) return;

    if (!confirm(`Удалить сохраненную настройку "${target.name}"?`)) return;

    const filtered = presets.filter(p => p.id !== presetId);
    this.savePresetsToStorage(filtered);
    if (this.activePresetName === target.name) {
      this.activePresetName = "";
      this.updateActiveFilterBadgeUI();
    }
    if (this.selectedPresetId === presetId) {
      this.selectedPresetId = filtered.length > 0 ? filtered[0].id : null;
    }
    this.renderPresetRestoreModalContent();
    this.updateStatus(`Настройка "${target.name}" удалена`);
  },

  clearFilter: function() {
    this.activeFilters = [];
    this.activePresetName = "";
    this.saveActiveFiltersToStorage();
    this.executeSearchOrFilter();
    this.updateFilterButtonsState();
    this.updateStatus("Отбор отключен");
  },

  clearFilterAndCloseModal: function() {
    this.clearFilter();
    this.closePresetRestoreModal();
  },

  filterByCurrentValue: function() {
    if (!this.selectedRow) {
      if (this.filteredItems && this.filteredItems.length > 0) {
        this.selectRow(0);
      } else {
        this.updateStatus("Выберите ячейку в списке для быстрого отбора");
        return;
      }
    }

    const colKey = this.selectedColKey || "kontragent";
    const availFields = this.getAvailableFields();
    let fieldDef = availFields.find(f => f.key === colKey) || { key: colKey, label: colKey, type: "text" };

    let targetVal = "";
    let op = "Равно";
    let fieldKey = fieldDef.key;
    let fieldLabel = fieldDef.label;

    if (colKey === "status") {
      if (this.selectedRow.deleted) {
        fieldKey = "deleted";
        fieldLabel = "Пометка удаления";
        targetVal = "Да";
      } else {
        fieldKey = "posted";
        fieldLabel = "Проведен";
        targetVal = this.selectedRow.posted ? "Да" : "Нет";
      }
    } else {
      const rawVal = this.selectedRow[colKey];
      if (rawVal === undefined || rawVal === null || String(rawVal).trim() === "") {
        targetVal = "";
        op = "Не заполнено";
      } else {
        targetVal = String(rawVal).trim();
        op = "Равно";
      }
    }

    const newCrit = {
      fieldKey: fieldKey,
      fieldLabel: fieldLabel,
      comparison: op,
      operator: op,
      value: targetVal,
      enabled: true
    };

    this.commitColumnFilter(newCrit);
    const activeCount = this.activeFilters.filter(c => c.enabled !== false).length;
    this.updateStatus(`Применен отбор: [${fieldLabel}] ${op === "Не заполнено" ? "(Не заполнено)" : '= "' + targetVal + '"'} (${activeCount} активных условий)`);
  },

  removeFilterByCurrentColumn: function() {
    if (!this.activeFilters || this.activeFilters.length === 0) {
      this.updateStatus("Отбор не установлен");
      return;
    }

    const colKey = this.selectedColKey || "kontragent";
    const availFields = this.getAvailableFields();
    let fieldDef = availFields.find(f => f.key === colKey) || { key: colKey, label: colKey, type: "text" };

    let targetKey = fieldDef.key;
    if (colKey === "status") {
      targetKey = (this.selectedRow && this.selectedRow.deleted) ? "deleted" : "posted";
    }

    // Find criterion matching targetKey or colKey
    let existingIdx = this.activeFilters.findIndex(c => c.fieldKey === targetKey || c.fieldKey === colKey);
    if (existingIdx < 0 && colKey === "status") {
      existingIdx = this.activeFilters.findIndex(c => c.fieldKey === "deleted" || c.fieldKey === "posted");
    }

    if (existingIdx < 0) {
      this.updateStatus(`В колонке [${fieldDef.label}] отбор не установлен`);
      return;
    }

    const removedCrit = this.activeFilters[existingIdx];
    this.activeFilters.splice(existingIdx, 1);
    this.activePresetName = "";
    this.saveActiveFiltersToStorage();
    this.executeSearchOrFilter();
    this.updateFilterButtonsState();

    const remCount = this.activeFilters.filter(c => c.enabled !== false).length;
    this.updateStatus(`Снят отбор по колонке: [${removedCrit.fieldLabel || fieldDef.label}] (Осталось условий: ${remCount})`);
  },

  updateFilterButtonsState: function() {
    const activeCrits = (this.activeFilters || []).filter(c => c.enabled !== false);
    const hasFilter = (activeCrits.length > 0);

    // 1. Number Badge on 1st Filter button (ujFilterCountBadge)
    const countBadge = this.getEl("ujFilterCountBadge");
    if (countBadge) {
      if (hasFilter) {
        countBadge.textContent = String(activeCrits.length);
        countBadge.style.display = "inline-block";
      } else {
        countBadge.style.display = "none";
      }
    }

    // 2. Clear All Filters button (ujBtnClearFilter)
    const btnClearFilter = this.getEl("ujBtnClearFilter");
    if (btnClearFilter) {
      btnClearFilter.disabled = !hasFilter;
      btnClearFilter.style.opacity = hasFilter ? "1" : "0.4";
      btnClearFilter.style.cursor = hasFilter ? "pointer" : "default";
      btnClearFilter.title = hasFilter ? `Отключить все отборы (${activeCrits.length} активных условий)` : "Отбор не установлен";
    }

    // 3. Quick Filter button (ujBtnQuickFilter)
    const btnQuick = this.getEl("ujBtnQuickFilter");
    const colKey = this.selectedColKey || "kontragent";
    const availFields = this.getAvailableFields();
    const fieldDef = availFields.find(f => f.key === colKey) || { label: colKey };

    if (btnQuick) {
      if (this.selectedRow && this.selectedColKey) {
        const val = this.selectedRow[colKey];
        const dispVal = (val !== undefined && val !== null && String(val).trim() !== "") ? String(val).trim() : "(пусто)";
        btnQuick.title = `Отбор по значению: [${fieldDef.label}] "${dispVal}" (F7)`;
        btnQuick.style.opacity = "1";
      } else {
        btnQuick.title = "Отбор по значению в текущей колонке (F7)";
        btnQuick.style.opacity = "0.7";
      }
    }

    // 4. Remove Column Filter button (ujBtnRemoveColumnFilter)
    const isColFiltered = activeCrits.some(c => c.fieldKey === colKey || c.fieldKey === fieldDef.key || (colKey === "status" && (c.fieldKey === "deleted" || c.fieldKey === "posted")));
    const btnRemCol = this.getEl("ujBtnRemoveColumnFilter");
    if (btnRemCol) {
      btnRemCol.disabled = !isColFiltered;
      btnRemCol.style.opacity = isColFiltered ? "1" : "0.4";
      btnRemCol.style.cursor = isColFiltered ? "pointer" : "default";
      btnRemCol.title = isColFiltered ? `Снять отбор по колонке [${fieldDef.label}] (Shift+F7)` : `Снять отбор по колонке [${fieldDef.label}] (отбор не установлен)`;
    }
  },

  updateActiveFilterBadgeUI: function() {
    const badgeEl = this.getEl("ujActiveFilterBadge");
    const nameEl = this.getEl("ujActiveFilterName");
    if (!badgeEl) return;

    const activeCrits = (this.activeFilters || []).filter(c => c.enabled !== false);
    if (activeCrits.length > 0) {
      const displayName = this.activePresetName || `${activeCrits.length} условий`;
      if (nameEl) nameEl.textContent = displayName;
      badgeEl.style.display = "inline-flex";
    } else {
      badgeEl.style.display = "none";
    }
  },

  // ==========================================
  // Unified Filter & Search Execution Pipeline
  // ==========================================
  applyFiltersAndSearch: function(preserveScroll = false) {
    const activeCrits = (this.activeFilters || []).filter(c => c.enabled !== false);
    const searchInp = this.getEl("ujSearchInput");
    const q = searchInp ? searchInp.value.trim().toLowerCase() : "";

    this.updateSearchIcon(q);

    // 1. Evaluate filter criteria
    let result = this.items.filter(item => {
      for (const crit of activeCrits) {
        if (!this.matchesCondition(item, crit)) {
          return false;
        }
      }
      return true;
    });

    // 2. Evaluate quick search string
    if (q) {
      const colKey = this.activeSearchColKey;
      if (colKey && colKey !== "status") {
        result = result.filter(row => {
          let val = row[colKey];
          if (val === undefined || val === null || String(val).trim() === "") {
            return false;
          }
          return this.matchesSearchText(val, q);
        });
      } else {
        result = result.filter(row => {
          const matchCol = this.getVisibleColumns().filter(c => c.key !== "status").some(c => {
            let value = row[c.key];
            if (c.key === "amount" && typeof value === "number") value = value.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            if (c.key === "date" && value) value = this.formatDateTime(value);
            return this.matchesSearchText(value, q);
          });
          if (matchCol) return true;
          if (row.nomenclature && this.matchesSearchText(row.nomenclature, q)) return true;
          if (Array.isArray(row.nomenclatures) && row.nomenclatures.some(n => this.matchesSearchText(n, q))) return true;
          if (Array.isArray(row.nom_keys) && row.nom_keys.some(k => this.matchesSearchText(k, q))) return true;
          return false;
        });
      }
    }

    this.filteredItems = result;

    // 3. Evaluate sorting
    if (this.currentSortCol) {
      this.applySort();
    }

    // 4. Render virtualized rows (preserving scroll position if requested)
    const wrapper = this.getEl("ujTableWrapper");
    const savedScrollTop = (preserveScroll && wrapper) ? wrapper.scrollTop : null;

    this.renderTable();

    if (savedScrollTop !== null && wrapper) {
      wrapper.scrollTop = savedScrollTop;
      this.updateVirtualRows();
    }

    // 5. Update Status and Badges
    const isFiltered = (activeCrits.length > 0 || Boolean(q));
    if (isFiltered) {
      let filterMsg = `Всего: ${this.items.length} (Отфильтровано: ${this.filteredItems.length})`;
      if (q && (this.activeSearchColKey || this.selectedColKey)) {
        const activeKey = this.activeSearchColKey || this.selectedColKey;
        const colDef = this.columns.find(c => c.key === activeKey);
        filterMsg += ` [Колонка: ${colDef ? colDef.label : activeKey}] (Ctrl+Q: отмена)`;
      }
      this.updateCountBadge(filterMsg);
    } else {
      this.updateCountBadge(this.items.length);
    }
    this.updateActiveFilterBadgeUI();
    this.updateFilterButtonsState();
  },

  matchesCondition: function(item, crit) {
    const key = crit.fieldKey;
    let itemVal = item[key];
    const targetVal = crit.value;
    const op = crit.operator || "Равно";

    if (itemVal === undefined || itemVal === null) itemVal = "";

    // 1. Boolean operations (posted, deleted)
    if (key === "posted" || key === "deleted") {
      const bVal = Boolean(itemVal);
      if (op === "Заполнено") return true;
      if (op === "Не заполнено") return false;
      const targetBool = (targetVal === "Да" || targetVal === "true" || targetVal === true);
      if (op === "Равно") return bVal === targetBool;
      if (op === "Не равно") return bVal !== targetBool;
    }

    // Special handling for Номенклатура (which can be a list of items for the document)
    if (key === "nomenclature") {
      let noms = [];
      if (Array.isArray(item.nom_keys) && item.nom_keys.length) {
        noms = item.nom_keys.map(n => String(n).toLowerCase());
      } else if (Array.isArray(item.nomenclatures) && item.nomenclatures.length) {
        noms = item.nomenclatures.map(n => String(n).trim().toLowerCase()).filter(Boolean);
      } else if (item.nomenclature) {
        noms = (String(item.nomenclature).includes(";") ? String(item.nomenclature).split(";") : [String(item.nomenclature)]).map(n => n.trim().toLowerCase()).filter(Boolean);
      }

      if (this.isServerFiltered && noms.length === 0) {
        // Query was executed and matched on the 1C database server
        return true;
      }

      if (op === "Заполнено") return noms.length > 0;
      if (op === "Не заполнено") return noms.length === 0;

      const targetRaw = String(targetVal !== undefined ? targetVal : "").trim();
      if (!targetRaw) return true;

      // Extract structured criteria and matchAll setting
      let matchAll = false;
      let criteriaList = [];

      if (crit.structuredFilter && Array.isArray(crit.structuredFilter.items) && crit.structuredFilter.items.length) {
        matchAll = Boolean(crit.structuredFilter.matchAll);
        criteriaList = crit.structuredFilter.items;
      } else {
        let raw = targetRaw;
        if (raw.startsWith("[И]")) {
          matchAll = true;
          raw = raw.replace(/^\[И\]\s*/, "");
        }
        const tokens = raw.split(";").map(s => s.trim()).filter(Boolean);
        criteriaList = tokens.map(tok => {
          if (/^содержит:\s*/i.test(tok)) {
            return { comp: "contains", value: tok.replace(/^содержит:\s*/i, "").trim() };
          }
          return { comp: "equal", value: tok };
        });
      }

      if (criteriaList.length === 0) return true;

      // Smart matcher for an individual nom entry
      const matchSingleNom = (entry, query, comp) => {
        if (!entry || !query) return false;
        const qRaw = query.toLowerCase().trim();
        const q = qRaw.replace(/^\[[^\]]+\]\s*/, "").trim();
        const qClean = q.replace(/^0+/, "");
        const segments = entry.toLowerCase().split("|").map(s => s.trim());

        if (comp === "equal") {
          // Exact match on Code, Clean Code, Artikul, or Full Name
          for (const seg of segments) {
            if (!seg) continue;
            const segClean = seg.replace(/^0+/, "");
            if (seg === q || (qClean && segClean === qClean) || seg === qRaw) return true;
            if (seg.length > 5 && q.length > 5 && (seg.includes(q) || q.includes(seg))) return true;
          }
          return entry === q || (qClean && entry.replace(/^0+/, "") === qClean) || (entry.length > 5 && q.length > 5 && entry.includes(q));
        } else {
          // Contains match: substring in code, artikul, or name
          for (const seg of segments) {
            if (!seg) continue;
            const segClean = seg.replace(/^0+/, "");
            if (seg.includes(q) || (qClean && segClean.includes(qClean)) || (qRaw && seg.includes(qRaw))) return true;
          }
          return entry.includes(q) || (qClean && entry.includes(qClean)) || (qRaw && entry.includes(qRaw));
        }
      };

      // Evaluates whether the document has at least one item matching this criterion
      const docHasCriterion = (c) => {
        const val = c.value || "";
        if (!val) return true;
        const comp = c.comp || (op === "Содержит" ? "contains" : "equal");
        const code = c.code ? c.code.toLowerCase().trim() : "";
        const art = c.artikul ? c.artikul.toLowerCase().trim() : "";
        const bc = c.barcode ? c.barcode.toLowerCase().trim() : "";
        return noms.some(n => {
          if (matchSingleNom(n, val, comp)) return true;
          if (code && matchSingleNom(n, code, "equal")) return true;
          if (art && matchSingleNom(n, art, "equal")) return true;
          if (bc && matchSingleNom(n, bc, "equal")) return true;
          return false;
        });
      };

      let satisfies = false;
      if (matchAll) {
        // Every single criterion must be present in the document simultaneously ("И")
        satisfies = criteriaList.every(c => docHasCriterion(c));
      } else {
        // At least one criterion present in the document ("ИЛИ")
        satisfies = criteriaList.some(c => docHasCriterion(c));
      }

      if (op === "Не равно" || op === "Не в списке" || op === "Не содержит") {
        return !satisfies;
      }
      return satisfies;
    }

    // 2. Filled / Not filled operators
    if (op === "Заполнено") {
      return String(itemVal).trim() !== "";
    }
    if (op === "Не заполнено") {
      return String(itemVal).trim() === "";
    }

    // 3. List operators: ONLY semicolon separated (items may contain commas like 13,6 гр)
    if (op === "В группе из списка" || op === "В списке") {
      if (!targetVal) return true;
      const parts = String(targetVal).split(";").map(s => s.trim().toLowerCase()).filter(Boolean);
      const strVal = String(itemVal).trim().toLowerCase();
      const codeVal = String(item[key + "_code"] || "").trim().toLowerCase();
      const isCodeField = (key === "number" || key === "deal" || key === "obrabotka_number" || key === "kontragent_code");
      const strClean = isCodeField ? strVal.replace(/^[a-zа-яё_]*0+/, "") : "";
      return parts.some(p => {
        let cleanP = p.replace(/^\[[^\]]+\]\s*/, "").trim();
        let namePart = cleanP;
        let codePart = "";
        if (cleanP.includes(" - ")) {
          const sub = cleanP.split(" - ");
          namePart = sub[0].trim();
          codePart = sub[sub.length - 1].trim();
        }
        const pClean = isCodeField ? cleanP.replace(/^[a-zа-яё_]*0+/, "") : "";
        if (strVal === cleanP || strVal.includes(cleanP) || cleanP.includes(strVal)) return true;
        if (namePart && (strVal === namePart || strVal.includes(namePart) || namePart.includes(strVal))) return true;
        if (codePart && (codeVal === codePart || strVal.includes(codePart) || codeVal.includes(codePart))) return true;
        if (isCodeField && strClean && pClean && strClean === pClean) return true;
        return false;
      });
    }
    if (op === "Не в списке") {
      if (!targetVal) return true;
      const parts = String(targetVal).split(";").map(s => s.trim().toLowerCase()).filter(Boolean);
      const strVal = String(itemVal).trim().toLowerCase();
      const codeVal = String(item[key + "_code"] || "").trim().toLowerCase();
      const anyMatch = parts.some(p => {
        let cleanP = p.replace(/^\[[^\]]+\]\s*/, "").trim();
        let namePart = cleanP;
        let codePart = "";
        if (cleanP.includes(" - ")) {
          const sub = cleanP.split(" - ");
          namePart = sub[0].trim();
          codePart = sub[sub.length - 1].trim();
        }
        if (strVal === cleanP || strVal.includes(cleanP) || cleanP.includes(strVal)) return true;
        if (namePart && (strVal === namePart || strVal.includes(namePart) || namePart.includes(strVal))) return true;
        if (codePart && (codeVal === codePart || strVal.includes(codePart) || codeVal.includes(codePart))) return true;
        return false;
      });
      return !anyMatch;
    }

    // 4. Date comparisons (exact precision down to HH:MM:SS)
    if (key === "date") {
      const dtItem = this.parseFullDateTimeMs(itemVal, false);

      if (op.startsWith("Интервал")) {
        const sFrom = (crit.valueFrom !== undefined && crit.valueFrom !== "") ? String(crit.valueFrom) : (String(targetVal || "").split(/\s*(?:\.\.\.|—|-)\s*/)[0] || "");
        const sTo = (crit.valueTo !== undefined && crit.valueTo !== "") ? String(crit.valueTo) : (String(targetVal || "").split(/\s*(?:\.\.\.|—|-)\s*/)[1] || sFrom);
        const dtStart = this.parseFullDateTimeMs(sFrom, false);
        const dtEnd = this.parseFullDateTimeMs(sTo, true);
        if (dtItem === null || dtStart === null || dtEnd === null) return true;

        if (op === "Интервал (>, <)") return dtItem > dtStart && dtItem < dtEnd;
        if (op === "Интервал (>=, <=)") return dtItem >= dtStart && dtItem <= dtEnd;
        if (op === "Интервал (>=, <)") return dtItem >= dtStart && dtItem < dtEnd;
        if (op === "Интервал (>, <=)") return dtItem > dtStart && dtItem <= dtEnd;
      }

      const isEndOp = (op === "Меньше или равно" || op === "Меньше");
      const dtTarget = this.parseFullDateTimeMs(targetVal, isEndOp);

      if (dtItem !== null && dtTarget !== null) {
        const sItemDate = String(itemVal).trim().toLowerCase();
        const sTargetDate = String(targetVal).trim().toLowerCase();
        if (op === "Равно") return sItemDate.startsWith(sTargetDate) || sItemDate.includes(sTargetDate) || (dtItem === dtTarget);
        if (op === "Не равно") return !sItemDate.startsWith(sTargetDate) && dtItem !== dtTarget;
        if (op === "Больше") return dtItem > dtTarget;
        if (op === "Меньше") return dtItem < dtTarget;
        if (op === "Больше или равно") return dtItem >= dtTarget;
        if (op === "Меньше или равно") return dtItem <= dtTarget;
      }
    }

    // 5. Interval comparisons for numbers or general text
    if (op.startsWith("Интервал")) {
      const sFrom = (crit.valueFrom !== undefined && crit.valueFrom !== "") ? String(crit.valueFrom) : (String(targetVal || "").split(/\s*(?:\.\.\.|—|-)\s*/)[0] || "");
      const sTo = (crit.valueTo !== undefined && crit.valueTo !== "") ? String(crit.valueTo) : (String(targetVal || "").split(/\s*(?:\.\.\.|—|-)\s*/)[1] !== undefined ? String(targetVal || "").split(/\s*(?:\.\.\.|—|-)\s*/)[1] : sFrom);

      const isStrictNumber = (str) => /^[-+]?\d+(\.\d+)?$/.test(str);
      const isNum = !isNaN(parseFloat(itemVal)) && isStrictNumber(sFrom);
      if (isNum) {
        const numItem = parseFloat(itemVal);
        const numStart = parseFloat(sFrom);
        const numEnd = parseFloat(sTo);
        if (op === "Интервал (>, <)") return numItem > numStart && numItem < numEnd;
        if (op === "Интервал (>=, <=)") return numItem >= numStart && numItem <= numEnd;
        if (op === "Интервал (>=, <)") return numItem >= numStart && numItem < numEnd;
        if (op === "Интервал (>, <=)") return numItem > numStart && numItem <= numEnd;
      } else {
        const sItem = String(itemVal).toLowerCase().trim();
        const sStart = sFrom.toLowerCase().trim();
        const sEnd = sTo.toLowerCase().trim();
        if (op === "Интервал (>, <)") return sItem > sStart && sItem < sEnd;
        if (op === "Интервал (>=, <=)") return sItem >= sStart && sItem <= sEnd;
        if (op === "Интервал (>=, <)") return sItem >= sStart && sItem < sEnd;
        if (op === "Интервал (>, <=)") return sItem > sStart && sItem <= sEnd;
      }
      return true;
    }

    // 6. Numeric comparisons (Strictly for 'amount' or when BOTH itemVal and targetVal are strictly pure numbers)
    const sItemRaw = String(itemVal !== undefined && itemVal !== null ? itemVal : "").trim();
    const sTargetRaw = String(targetVal !== undefined && targetVal !== null ? targetVal : "").trim();

    const isStrictNumber = (str) => /^[-+]?\d+(\.\d+)?$/.test(str);

    const isNumericComp = (key === "amount")
      ? (!isNaN(parseFloat(itemVal)) && isStrictNumber(sTargetRaw))
      : (isStrictNumber(sItemRaw) && isStrictNumber(sTargetRaw));

    if (isNumericComp) {
      const numItem = parseFloat(itemVal);
      const numTarget = parseFloat(targetVal);
      if (op === "Равно") return numItem === numTarget;
      if (op === "Не равно") return numItem !== numTarget;
      if (op === "Больше") return numItem > numTarget;
      if (op === "Меньше") return numItem < numTarget;
      if (op === "Больше или равно") return numItem >= numTarget;
      if (op === "Меньше или равно") return numItem <= numTarget;
    }

    // 6. String comparisons (Exact for "Равно", substring for "Содержит")
    const sItem = sItemRaw.toLowerCase();
    const sTarget = sTargetRaw.toLowerCase();

    switch (op) {
      case "Равно": {
        if (sItem === sTarget) return true;
        // Only strip leading zeroes for document numbers and codes (number, deal, obrabotka_number, kontragent_code)
        if (key === "number" || key === "deal" || key === "obrabotka_number" || key === "kontragent_code") {
          const sItemClean = sItem.replace(/^[a-zа-яё_]*0+/, "");
          const sTargetClean = sTarget.replace(/^[a-zа-яё_]*0+/, "");
          if (sItemClean && sTargetClean && sItemClean === sTargetClean) return true;
        }
        return false;
      }
      case "Не равно": {
        if (sItem === sTarget) return false;
        if (key === "number" || key === "deal" || key === "obrabotka_number" || key === "kontragent_code") {
          const sItemClean = sItem.replace(/^[a-zа-яё_]*0+/, "");
          const sTargetClean = sTarget.replace(/^[a-zа-яё_]*0+/, "");
          if (sItemClean && sTargetClean && sItemClean === sTargetClean) return false;
        }
        return true;
      }
      case "Содержит":
        return sItem.includes(sTarget);
      case "Начинается с":
        return sItem.startsWith(sTarget);
      case "Не содержит":
        return !sItem.includes(sTarget);
      case "Больше":
        return sItem > sTarget;
      case "Меньше":
        return sItem < sTarget;
      case "Больше или равно":
        return sItem >= sTarget;
      case "Меньше или равно":
        return sItem <= sTarget;
      default:
        return true;
    }
  },

  selectedColKey: "number",

  selectCell: function(idx, colKey, targetTd, event) {
    this._columnSelectedForFind = colKey !== "status";
    if (event) event.stopPropagation();
    this.selectRow(idx, colKey, targetTd);

    // Cell selection must not change the search column chosen in the Find dialog.
  },

  selectRow: function(idx, colKey, targetTd) {
    this.selectedRow = this.filteredItems[idx] || null;
    if (colKey) this.selectedColKey = colKey;
    this.updateEditButtonState();
    this.updateFilterButtonsState();

    const tbody = this.getEl("ujTableBody");
    if (!tbody) return;
    const rows = tbody.querySelectorAll("tr");
    rows.forEach((tr) => {
      const rowIdx = parseInt(tr.getAttribute("data-row-idx"));
      const isSel = (rowIdx === idx);
      const defaultBg = (rowIdx % 2 === 1) ? "#f7f6f0" : "#ffffff";
      tr.style.background = isSel ? "#dceaf7" : defaultBg;
      tr.style.color = "#111111";

      const cells = tr.querySelectorAll("td");
      cells.forEach(td => {
        const k = td.getAttribute("data-col-key");
        const isCellActive = isSel && (targetTd ? td === targetTd : k === this.selectedColKey);
        if (isCellActive) {
          td.style.background = "#316ac5";
          td.style.color = "#ffffff";
          td.classList.add("c1-cell-active");
          this.copyAndSelectCellText(td);
        } else {
          td.style.background = isSel ? "#dceaf7" : defaultBg;
          td.style.color = "#111111";
          td.classList.remove("c1-cell-active");
        }
      });
    });

    if (this.selectedRow) {
      this.updateStatus(`Выбран документ: № ${this.selectedRow.number} от ${this.selectedRow.date}`);
    }
  },

  copyAndSelectCellText: function(cellEl) {
    if (!cellEl) return;
    const text = cellEl.innerText.trim();
    window.lastActive1cCellText = text;
    try {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(cellEl);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch(e) {}
  },

  updateEditButtonState: function() {
    const btn = this.getEl("ujBtnEdit");
    if (!btn) return;
    btn.disabled = !Boolean(this.selectedRow);
    btn.style.opacity = this.selectedRow ? "1" : "0.5";
  },

  openAuditHistoryForSelected: function(e) {
    const evt = e || (typeof window !== "undefined" ? window.event : null);
    const inst = (this && this.getActiveInstance) ? this.getActiveInstance(evt) : this;

    let row = (inst && inst.selectedRow) || this.selectedRow;
    if (!row && inst && inst.getEl) {
      const tbody = inst.getEl("ujTableBody");
      const activeCell = tbody ? tbody.querySelector(".c1-cell-active") : null;
      if (activeCell) {
        const tr = activeCell.closest("tr");
        if (tr) {
          const rowIdx = parseInt(tr.getAttribute("data-row-idx"));
          if (!isNaN(rowIdx) && inst.filteredItems && inst.filteredItems[rowIdx]) {
            row = inst.filteredItems[rowIdx];
            inst.selectedRow = row;
          }
        }
      }
    }
    if (!row && inst && inst.filteredItems && inst.filteredItems.length > 0) {
      const activeTr = inst.getEl("ujTableBody")?.querySelector("tr.uj-row[style*='dceaf7']");
      if (activeTr) {
        const rowIdx = parseInt(activeTr.getAttribute("data-row-idx"));
        if (!isNaN(rowIdx) && inst.filteredItems[rowIdx]) {
          row = inst.filteredItems[rowIdx];
          inst.selectedRow = row;
        }
      }
      if (!row) {
        row = inst.filteredItems[0];
        inst.selectedRow = row;
      }
    }

    const docType = (inst && inst.activeDocType) || this.activeDocType || "РеализацияТоваровУслуг";

    if (!row) {
      if (window.AuditJournal) {
        AuditJournal.open(docType);
      }
      return;
    }

    const docNum = row.number;
    if (window.AuditJournal) {
      AuditJournal.openForDocument(docType, docNum, row);
    }
  },

  editSelectedDocument: function(rowIdx) {
    if (rowIdx !== undefined && this.filteredItems && this.filteredItems[rowIdx]) {
      this.selectedRow = this.filteredItems[rowIdx];
    }
    if (!this.selectedRow) {
      if (this.filteredItems && this.filteredItems.length > 0) {
        this.selectedRow = this.filteredItems[0];
      } else {
        return;
      }
    }

    const docType = this.activeDocType;
    const docNum = this.selectedRow.number;
    const docDate = this.selectedRow.date || "";

    if (docType === "УстановкаЦенНоменклатуры" && window.PriceDocEditor) {
      PriceDocEditor.open(docNum, docDate);
      this.updateStatus(`Открыт документ установки цен № ${docNum}`);
      return;
    }

    if (docType === "РеализацияТоваровУслуг" && window.SalesDocEditor) {
      SalesDocEditor.open(docNum, docDate, docType);
      this.updateStatus(`Открыт документ реализации № ${docNum}`);
      return;
    }

    if (docType === "ВозвратТоваровОтПокупателя" && window.SalesDocEditor) {
      SalesDocEditor.open(docNum, docDate, docType);
      this.updateStatus(`Открыт документ возврата товаров № ${docNum}`);
      return;
    }

    if (docType === "ЗаказПокупателя" && window.SalesDocEditor) {
      SalesDocEditor.open(docNum, docDate, docType);
      this.updateStatus(`Открыт заказ покупателя № ${docNum}`);
      return;
    }

    if (docType === "ПогрузкиМашин" && window.PogruzkaDocEditor) {
      PogruzkaDocEditor.open(docNum, docDate);
      this.updateStatus(`Открыт документ погрузки машины № ${docNum}`);
      return;
    }

    console.log(`[UNIVERSAL JOURNAL] Opening document ${docType} № ${docNum}...`);
    const key = `${docType}_${docNum}`;
    const cached = this.prefetchCache.get(key);

    if (cached && cached.status === "ready" && cached.data) {
      console.log(`[UNIVERSAL JOURNAL] Opened INSTANTLY from prefetch cache: ${key}`);
      this.showDocumentViewerModal(cached.data);
      this.updateStatus(`Открыт документ № ${docNum} (из кэша)`);
      return;
    }

    if (cached && cached.status === "pending" && cached.promise) {
      this.updateStatus(`Загрузка деталей документа № ${docNum}...`);
      cached.promise.then(data => {
        if (data) {
          this.showDocumentViewerModal(data);
          this.updateStatus(`Открыт документ № ${docNum}`);
        } else {
          this.fetchDocumentDetailsDirectly(docType, docNum);
        }
      }).catch(() => {
        this.fetchDocumentDetailsDirectly(docType, docNum);
      });
      return;
    }

    this.fetchDocumentDetailsDirectly(docType, docNum);
  },

  fetchDocumentDetailsDirectly: function(docType, docNum) {
    this.updateStatus(`Загрузка деталей документа № ${docNum}...`);
    const creds = window.SessionManager ? SessionManager.getCredentials() : {};
    fetch("/api/documents/details", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...creds, doc_type: docType, number: docNum })
    })
    .then(res => res.json())
    .then(data => {
      if (!data.success) {
        alert("1C Xətası: " + (data.error || "Sənədin detalları oxuna bilmədi"));
        this.updateStatus("Ошибка открытия документа");
        return;
      }
      this.showDocumentViewerModal(data);
    })
    .catch(err => {
      console.error("Error reading document details:", err);
      alert("Xəta: " + err.message);
    });
  },

  showDocumentViewerModal: function(docData) {
    const header = docData.header || {};
    const lines = docData.lines || [];
    const docType = docData.doc_type || this.activeDocType;

    let linesHtml = "";
    if (lines.length === 0) {
      linesHtml = `<tr><td colspan="7" style="text-align: center; color: #888; padding: 20px;">В табличной части документа нет строк (пустой документ)</td></tr>`;
    } else {
      lines.forEach(l => {
        linesHtml += `
          <tr style="height: 20px;">
            <td style="text-align: center; border: 1px solid #d4d0c8; padding: 2px 4px;">${l.line_num}</td>
            <td style="border: 1px solid #d4d0c8; padding: 2px 4px; font-weight: bold; color: #004080;">${this.escapeHtml(l.code)}</td>
            <td style="border: 1px solid #d4d0c8; padding: 2px 4px;">${this.escapeHtml(l.artikul || "-")}</td>
            <td style="border: 1px solid #d4d0c8; padding: 2px 4px;">${this.escapeHtml(l.name)}</td>
            <td style="text-align: right; border: 1px solid #d4d0c8; padding: 2px 6px; font-weight: bold; color: #000;">${Number(l.price || 0).toFixed(2)}</td>
            <td style="border: 1px solid #d4d0c8; padding: 2px 4px; color: #555;">${this.escapeHtml(l.price_type || "-")}</td>
            <td style="text-align: center; border: 1px solid #d4d0c8; padding: 2px 4px;">${this.escapeHtml(l.unit || "шт")}</td>
          </tr>
        `;
      });
    }

    const modalId = "ujDocDetailsModal";
    let modalEl = document.getElementById(modalId);
    if (!modalEl) {
      modalEl = document.createElement("div");
      modalEl.id = modalId;
      modalEl.className = "modal-overlay-1c";
      modalEl.style.zIndex = "9998";
      document.body.appendChild(modalEl);
    }

    const statusBadge = header.posted 
      ? `<span style="background: #2e7d32; color: #fff; padding: 2px 6px; border-radius: 2px; font-size: 10px; font-weight: bold;">✔ ПРОВЕДЕН</span>`
      : `<span style="background: #ed6c02; color: #fff; padding: 2px 6px; border-radius: 2px; font-size: 10px; font-weight: bold;">📄 НЕ ПРОВЕДЕН (ЧЕРНОВИК)</span>`;

    modalEl.innerHTML = `
      <div class="modal-window-1c" style="width: 780px; max-height: 85vh; display: flex; flex-direction: column; background: #f0eee3; border: 1px solid #7f9db9; box-shadow: 0 4px 20px rgba(0,0,0,0.4); font-family: Tahoma, Arial, sans-serif; font-size: 11px;">
        <div class="modal-header-1c" style="background: linear-gradient(to bottom, #fdfdfe, #d6d9e0); padding: 5px 8px; border-bottom: 1px solid #a0a0a0; display: flex; align-items: center; justify-content: space-between;">
          <div style="font-weight: bold; color: #000; font-size: 11px; display: flex; align-items: center; gap: 8px;">
            <span>📋</span>
            <span>${this.escapeHtml(docType)}: № ${this.escapeHtml(header.number)} от ${this.escapeHtml(header.date)}</span>
            ${statusBadge}
          </div>
          <button type="button" class="window-btn-close" onclick="document.getElementById('${modalId}').style.display='none'" style="width: 17px; height: 17px; border: 1px solid #7f9db9; background: #e5e2cf; cursor: pointer;">✕</button>
        </div>

        <div style="padding: 10px; background: #e5e2cf; border-bottom: 1px solid #b0af9f; display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <div><strong>Ответственный:</strong> ${this.escapeHtml(header.responsible || "-")}</div>
          <div><strong>Всего строк:</strong> ${lines.length}</div>
          <div style="grid-column: span 2;"><strong>Комментарий:</strong> ${this.escapeHtml(header.comment || "-")}</div>
        </div>

        <div style="flex: 1; overflow: auto; background: #ffffff; padding: 4px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
            <thead>
              <tr style="background: #e3dec9; border-bottom: 2px solid #5a5a5a; position: sticky; top: 0;">
                <th style="width: 35px; border: 1px solid #b0af9f; padding: 4px;">№</th>
                <th style="width: 80px; border: 1px solid #b0af9f; padding: 4px; text-align: left;">Код</th>
                <th style="width: 90px; border: 1px solid #b0af9f; padding: 4px; text-align: left;">Артикул</th>
                <th style="border: 1px solid #b0af9f; padding: 4px; text-align: left;">Номенклатура</th>
                <th style="width: 85px; border: 1px solid #b0af9f; padding: 4px; text-align: right;">Цена</th>
                <th style="width: 95px; border: 1px solid #b0af9f; padding: 4px; text-align: left;">Тип цен</th>
                <th style="width: 55px; border: 1px solid #b0af9f; padding: 4px; text-align: center;">Ед.</th>
              </tr>
            </thead>
            <tbody>
              ${linesHtml}
            </tbody>
          </table>
        </div>

        <div style="padding: 6px 10px; background: #f0eee3; border-top: 1px solid #b0af9f; display: flex; justify-content: flex-end; gap: 8px;">
          <button type="button" class="btn-1c btn-1c-primary" onclick="document.getElementById('${modalId}').style.display='none'" style="height: 24px; padding: 0 14px; font-weight: bold;">Закрыть</button>
        </div>
      </div>
    `;

    modalEl.style.display = "flex";
  },

  onHeaderClick: function(colKey) {
    if (colKey === "status") return;
    this._columnSelectedForFind = true;
    this.selectedColKey = colKey;
    this.sortBy(colKey);
  },

  updateHeaderSearchHighlights: function() {
    const thead = this.getEl("ujTableHeadRow");
    if (!thead) return;
    const ths = thead.querySelectorAll("th.uj-th");
    const activeKey = this.activeSearchColKey;

    ths.forEach(th => {
      const k = th.getAttribute("data-col-key");
      const iconSpan = th.querySelector(".uj-th-search-icon");
      if (activeKey && k === activeKey) {
        th.classList.add("uj-th-search-active");
        if (!iconSpan) {
          const spanWrapper = th.querySelector("span");
          if (spanWrapper) {
            const icon = document.createElement("span");
            icon.className = "uj-th-search-icon";
            icon.title = "Поиск в этой колонке (Отмена: Ctrl+Q)";
            icon.style.cssText = "margin-left: 4px; font-size: 11px; vertical-align: middle; line-height: 1;";
            icon.textContent = "🔍";
            spanWrapper.appendChild(icon);
          }
        }
      } else {
        th.classList.remove("uj-th-search-active");
        if (iconSpan) {
          iconSpan.remove();
        }
      }
    });

    const searchInp = this.getEl("ujSearchInput");
    if (searchInp) {
      if (activeKey) {
        const colDef = this.columns.find(c => c.key === activeKey);
        const colName = colDef ? colDef.label : activeKey;
        searchInp.placeholder = `Поиск в [${colName}]... (Ctrl+Q: отмена)`;
        searchInp.title = `Поиск по колонке "${colName}" (Ctrl+F). Для отмены поиска: Ctrl+Q`;
      } else {
        searchInp.placeholder = "Найти по всем колонкам...";
        searchInp.title = "Поиск по всем колонкам загруженного списка. Для отмены: Ctrl+Q";
      }
    }
  },

  onSearchInput: function() {
    const inp = this.getEl("ujSearchInput");
    const q = inp ? inp.value.trim() : "";
    this.activeSearchColKey = null;
    this.searchMatchMode = "contains";
    this.updateHeaderSearchHighlights();
    this.updateSearchIcon(q);

    if (this._listReady) this.applyFiltersAndSearch();
  },

  executeSearchOrFilter: function() {
    if (this._searchDebounceTimer) {
      clearTimeout(this._searchDebounceTimer);
      this._searchDebounceTimer = null;
    }
    const activeCrits = (this.activeFilters || []).filter(c => c && c.enabled !== false);

    this.saveListCache();
    const baseKey = this.getListKey();
    const base = this.listCache.get(baseKey);
    const needsDetails = activeCrits.some(c => c.fieldKey === "nomenclature");
    if (base && (activeCrits.length === 0 || (!base.hasMore && !needsDetails))) {
      this.loadDocuments({ search: "", filters: [] });
      return;
    }

    this.loadDocuments({ search: "", filters: activeCrits });
  },

  showLoadedSearchPreview: function() {
    if (!this.isJournalActive()) return false;
    const crits = (this.activeFilters || []).filter(c => c && c.enabled !== false);
    if (crits.some(c => c.fieldKey === "nomenclature")) return false;
    this.saveListCache();
    const key = this.getListKey();
    const base = this.listCache.get(key);
    if (!base) return false;
    if (crits.length > 0 && base.hasMore) return false;
    // Stop the previous query before showing a preview of the loaded base list.
    this.pauseLoading();
    this._paused = false;
    this._listKey = key;
    this._listReady = true;
    this.isServerFiltered = false;
    this.items = base.items.slice();
    this.hasMoreDocs = base.hasMore;
    this.lastDocDate = base.lastDate;
    this.lastDocNumber = base.lastNumber;
    this.applyFiltersAndSearch();
    if (base.hasMore) this.updateStatus(`Загруженная часть: ${this.filteredItems.length} совпадений. Поиск по всей базе...`);
    return true;
  },

  updateSearchIcon: function(q) {
    const btn = this.getEl("ujSearchActionBtn");
    if (!btn) return;
    if (q) {
      btn.title = "Очистить поиск (Esc / Ctrl+Q)";
      btn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="7" cy="7" r="5" stroke="#546e7a" stroke-width="1.5"/>
          <line x1="11" y1="11" x2="14.5" y2="14.5" stroke="#546e7a" stroke-width="2" stroke-linecap="round"/>
          <line x1="4.5" y1="4.5" x2="9.5" y2="9.5" stroke="#c62828" stroke-width="2" stroke-linecap="round"/>
          <line x1="9.5" y1="4.5" x2="4.5" y2="9.5" stroke="#c62828" stroke-width="2" stroke-linecap="round"/>
        </svg>
      `;
    } else {
      btn.title = "Быстрый поиск по списку (Ctrl+F)";
      btn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="6.5" cy="6.5" r="4.5" stroke="#004080" stroke-width="1.8"/>
          <line x1="10" y1="10" x2="14.5" y2="14.5" stroke="#004080" stroke-width="2" stroke-linecap="round"/>
        </svg>
      `;
    }
  },

  onSearchActionClick: function() {
    const inp = this.getEl("ujSearchInput");
    if (!inp) return;
    if (inp.value.trim() || this.activeSearchColKey) {
      this.clearSearch();
      inp.focus();
    } else {
      inp.focus();
    }
  },

  matchesSearchText: function(value, query) {
    const text = String(value ?? "").trim().toLowerCase();
    const term = String(query).trim().toLowerCase();
    if (this.searchMatchMode === "exact") return text === term;
    if (this.searchMatchMode === "starts") return text.startsWith(term);
    return text.includes(term);
  },

  openFindModal: function(initialText) {
    const modal = document.getElementById("ujFindModal");
    if (!modal) {
      console.warn("[UniversalJournal] #ujFindModal elementi DOM-da tapılmadı!");
      return;
    }
    const select = document.getElementById("ujFindColumn");
    if (select) {
      const avail = (typeof this.getAvailableFields === "function") ? this.getAvailableFields() : [];
      select.innerHTML = avail.map(c =>
        `<option value="${this.escapeHtml ? this.escapeHtml(c.key) : c.key}">${this.escapeHtml ? this.escapeHtml(c.label) : c.label}</option>`).join("");
      const field = this.selectedColKey === "status" ? (this.selectedRow?.deleted ? "deleted" : "posted") : (this.selectedColKey || "number");
      select.value = field;
    }
    const selectEl = document.getElementById("ujFindColumn");
    const currentField = selectEl ? selectEl.value : (this.selectedColKey || "number");
    const input = document.getElementById("ujFindText");
    const existing = (this.activeFilters || []).find(c => c.fieldKey === currentField);
    const cellValue = this.selectedRow?.[currentField];
    if (input) {
      input.value = initialText !== undefined ? initialText : (cellValue !== undefined && cellValue !== null ? String(cellValue) : (existing?.value || ""));
    }
    this._findItem = null;
    if (typeof this.updateFindReferenceButtons === "function") {
      this.updateFindReferenceButtons();
    }
    const mode = existing ? ({ "Равно": "exact", "Начинается с": "starts", "Содержит": "contains" }[existing.comparison] || "exact") : "exact";
    modal.querySelectorAll('input[name="ujFindMatch"]').forEach(r => { r.checked = r.value === mode; });
    modal.style.display = "flex";
    modal.style.zIndex = "2147483000";
    if (input) {
      setTimeout(() => {
        input.focus();
        if (initialText === undefined) input.select();
      }, 50);
    }
  },

  closeFindModal: function() {
    const modal = document.getElementById("ujFindModal");
    if (modal) modal.style.display = "none";
  },

  submitFindModal: function() {
    const field = document.getElementById("ujFindColumn")?.value || (this.selectedColKey || "number");
    const value = document.getElementById("ujFindText")?.value?.trim() || "";
    const mode = document.querySelector('input[name="ujFindMatch"]:checked')?.value || "exact";
    const avail = (typeof this.getAvailableFields === "function") ? this.getAvailableFields() : [];
    const definition = avail.find(f => f.key === field);
    const operator = definition?.type && definition.type !== "text" ? "Равно" : ({ exact: "Равно", starts: "Начинается с", contains: "Содержит" })[mode];
    const criterion = { fieldKey: field, fieldLabel: definition?.label || field,
      comparison: operator, operator, value, enabled: true };
    this.selectedColKey = field;
    this.closeFindModal();
    this.commitColumnFilter(criterion);
  },

  commitColumnFilter: function(criterion) {
    if (!Array.isArray(this.activeFilters)) this.activeFilters = [];
    const index = this.activeFilters.findIndex(c => c.fieldKey === criterion.fieldKey);
    if (index >= 0) this.activeFilters[index] = criterion;
    else this.activeFilters.push(criterion);
    this.activePresetName = "";
    this.saveActiveFiltersToStorage();
    this.updateActiveFilterBadgeUI();
    this.updateFilterButtonsState();
    this.executeSearchOrFilter();
  },

  findCatalogForColumn: function(key) {
    return {
      kontragent: "Контрагенты",
      kontragent_code: "Контрагенты",
      golovnoy_kontragent: "Контрагенты",
      golovnoy_kontragent_code: "Контрагенты",
      agent: "Агенты",
      warehouse: "Склады",
      contract: "ДоговорыКонтрагентов",
      contract_price_type: "ТипыЦенНоменклатуры",
      responsible: "Пользователи",
      portfolio: "Портфели",
      pogruzka_voditel: "Водители",
      nomenclature: "Номенклатура"
    }[key];
  },

  updateFindReferenceButtons: function() {
    const supported = Boolean(this.findCatalogForColumn(document.getElementById("ujFindColumn")?.value));
    for (const id of ["ujFindChoose", "ujFindInspect"]) {
      const button = document.getElementById(id);
      if (button) button.disabled = !supported;
    }
  },

  chooseFindValue: function() {
    const field = document.getElementById("ujFindColumn").value;
    const catalog = this.findCatalogForColumn(field);
    if (!catalog) { this.updateStatus("Для этой колонки справочник отсутствует"); return; }
    const text = document.getElementById("ujFindText").value;
    this.closeFindModal();
    CatalogSelector.open({ catalog, search: text, multiSelect: false, onSelect: item => {
      if (!item) return;
      const value = field.endsWith("_code") ? item.code : item.name;
      this.selectedColKey = field;
      this.openFindModal(value || "");
      this._findItem = { catalog, code: item.code, name: item.name, value };
    }});
  },

  showFindValueInfo: async function() {
    const field = document.getElementById("ujFindColumn").value;
    const catalog = this.findCatalogForColumn(field);
    const text = document.getElementById("ujFindText").value.trim();
    if (!catalog || !text) return;
    const selected = this._findItem;
    let code = selected && selected.catalog === catalog && selected.value === text ? selected.code : "";
    if (!code && field === "kontragent_code") code = text;
    if (!code && field === "kontragent" && this.selectedRow && String(this.selectedRow.kontragent).trim() === text) code = this.selectedRow.kontragent_code || "";
    let modal = document.getElementById("ujFindInfo");
    if (!modal) { modal = document.createElement("div"); modal.id = "ujFindInfo"; document.body.appendChild(modal); }
    modal.style.cssText = "position:fixed;inset:0;z-index:2147483001;background:#0002;display:flex;align-items:center;justify-content:center";
    modal.innerHTML = '<section style="background:#fffbef;padding:15px;width:600px;max-height:75vh;overflow:auto"><button style="float:right" onclick="document.getElementById(\'ujFindInfo\').style.display=\'none\'">✕</button><h3>Информация</h3><div id="ujFindInfoBody">Загрузка...</div></section>';
    try {
      const response = await fetch("/api/catalog_card", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...SessionManager.getCredentials(), catalog, code, name: text }) });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || "Не удалось прочитать информацию");
      document.getElementById("ujFindInfoBody").innerHTML = `<strong>${this.escapeHtml(data.item.name)}</strong><table>${data.item.fields.map(f => `<tr><td style="padding:4px">${this.escapeHtml(f.label)}</td><td style="padding:4px">${this.escapeHtml(f.value)}</td></tr>`).join("")}</table>`;
    } catch (error) { document.getElementById("ujFindInfoBody").textContent = error.message; }
  },

  loadSortPreference: function() {
    if (typeof localStorage === "undefined") return;
    try {
      const saved = JSON.parse(localStorage.getItem("uj_sort_" + this.activeDocType) || "null");
      this.currentSortCol = saved?.column || "date";
      this.currentSortAsc = saved ? saved.ascending === true : false;
    } catch (_) { this.currentSortCol = "date"; this.currentSortAsc = false; }
  },

  clearSearch: function() {
    const inp = this.getEl("ujSearchInput");
    if (inp) inp.value = "";
    this.activeSearchColKey = null;
    this.updateHeaderSearchHighlights();
    this.updateSearchIcon("");
    this.executeSearchOrFilter();
    this.updateStatus("Поиск отменен (Ctrl+Q)");
  },

  autofitColumns: function() {
    this.renderTable();
    this.updateStatus("Автоподбор ширины колонок выполнен");
  },

  refresh: function() {
    this.saveListCache();
    const scope = JSON.stringify(JSON.parse(this.getListKey()).slice(0, 6));
    for (const key of this.listCache.keys()) {
      if (JSON.stringify(JSON.parse(key).slice(0, 6)) === scope) this.listCache.delete(key);
    }
    this._listReady = false;
    this.loadDocuments({ force: true });
  },

  sortBy: function(colKey) {
    if (colKey === "status") return;
    if (this.currentSortCol === colKey) {
      this.currentSortAsc = !this.currentSortAsc;
    } else {
      this.currentSortCol = colKey;
      this.currentSortAsc = true;
    }
    try { localStorage.setItem("uj_sort_" + this.activeDocType, JSON.stringify({ column: this.currentSortCol, ascending: this.currentSortAsc })); } catch (_) {}
    this.applySort();
    this.renderTable();
  },

  applySort: function() {
    if (!this.currentSortCol) return;
    const col = this.currentSortCol;
    const asc = this.currentSortAsc ? 1 : -1;

    this.filteredItems.sort((a, b) => {
      let va = a[col];
      let vb = b[col];

      if (col === "date") {
        const parseD = (s) => {
          if (!s) return 0;
          const [dStr, tStr] = s.split(" ");
          const [d, m, y] = (dStr || "").split(".").map(Number);
          const [hh, mm, ss] = (tStr || "").split(":").map(Number);
          return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, ss || 0).getTime();
        };
        return (parseD(va) - parseD(vb)) * asc;
      }

      if (typeof va === "number" && typeof vb === "number") {
        return (va - vb) * asc;
      }

      va = (va !== undefined && va !== null) ? String(va) : "";
      vb = (vb !== undefined && vb !== null) ? String(vb) : "";
      return va.localeCompare(vb, "ru") * asc;
    });
  },

  updateCountBadge: function(count) {
    const badge = this.getEl("ujStatusRight");
    if (badge) {
      if (typeof count === "number") {
        badge.textContent = `Всего: ${count.toLocaleString("ru-RU")} документов`;
      } else {
        badge.textContent = String(count);
      }
    }
  },

  updateStatus: function(text) {
    const el = this.getEl("ujStatusLeft");
    if (!el) return;
    el.textContent = text;
  },

  escapeHtml: function(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  },

  // Eyni jurnaldan istənilən sayda yeni pəncərə açmaq
  _winCounter: 1,
  openNewWindow: function(docType) {
    const sel = this.getEl("ujDocTypeSelect");
    const targetDocType = docType || this.activeDocType || (sel ? sel.value : "РеализацияТоваровУслуг");
    this._winCounter = (this._winCounter || 1) + 1;
    const newId = `universalJournalWindow_${this._winCounter}`;

    const baseWin = document.getElementById("universalJournalWindow");
    if (!baseWin) return;

    const newWin = baseWin.cloneNode(true);
    newWin.id = newId;
    newWin.style.display = "flex";
    newWin.classList.remove("minimized");

    const offset = (this._winCounter * 24) % 180;
    newWin.style.top = `${25 + offset}px`;
    newWin.style.left = `${35 + offset}px`;
    newWin.setAttribute("onmousedown", `MdiManager.activateWindow('${newId}')`);

    const selText = (sel && sel.options && sel.selectedIndex >= 0) ? sel.options[sel.selectedIndex].text : (this.docTitle || "Журнал документов");
    const docName = selText || "Журнал документов";
    const titleEl = newWin.querySelector(".mdi-win-title-text");
    if (titleEl) {
      titleEl.textContent = `${docName} (${this._winCounter})`;
    }

    // Daxili düymələr
    const closeBtn = newWin.querySelector(".mdi-win-btn-close");
    if (closeBtn) {
      closeBtn.removeAttribute("onclick");
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        if (window.MdiManager) MdiManager.closeWindow(newId);
        newWin.remove();
      };
    }
    const maxBtn = newWin.querySelector(".mdi-win-btn-max");
    if (maxBtn) {
      maxBtn.removeAttribute("onclick");
      maxBtn.onclick = (e) => {
        e.stopPropagation();
        MdiManager.toggleMaximize(newId);
      };
    }
    const minBtn = newWin.querySelector(".mdi-win-btn-min");
    if (minBtn) {
      minBtn.removeAttribute("onclick");
      minBtn.onclick = (e) => {
        e.stopPropagation();
        MdiManager.minimizeWindow(newId);
      };
    }
    const header = newWin.querySelector(".mdi-window-header");
    if (header) {
      header.removeAttribute("ondblclick");
      header.ondblclick = (e) => {
        if (e.target.closest(".mdi-win-btn, .window-btn-close")) return;
        MdiManager.toggleMaximize(newId);
      };
    }

    const ws = document.getElementById("mdiWorkspace");
    if (ws) ws.appendChild(newWin);

    if (window.MdiManager) {
      MdiManager.registerWindow(newId, {
        title: `${docName} (${this._winCounter})`,
        icon: "🗂️",
        element: newWin,
        closeFn: () => {
          newWin.remove();
        }
      });
      MdiManager.activateWindow(newId);
    }
    this.updateStatus(`Открыто новое окно: ${docName} (${this._winCounter})`);
    return newId;
  },

  // ==========================================
  // Diagnostics & Debug Modal (🩺 Отладчик / Диагностика)
  // ==========================================
  lastDiagnostics: null,

  openDebugDiagnosticsModal: function() {
    const overlay = document.getElementById("ujDiagnosticsModalOverlay");
    if (!overlay) {
      console.warn("Diagnostics modal element not found in DOM");
      return;
    }
    overlay.style.display = "flex";
    this.renderDebugDiagnosticsContent();
  },

  closeDebugDiagnosticsModal: function() {
    const overlay = document.getElementById("ujDiagnosticsModalOverlay");
    if (overlay) overlay.style.display = "none";
  },

  renderDebugDiagnosticsContent: function() {
    const body = document.getElementById("ujDiagnosticsBody");
    const badge = document.getElementById("diagHeaderBadge");
    if (!body) return;

    const searchInp = this.getEl("ujSearchInput");
    const querySearch = searchInp ? searchInp.value.trim() : "";
    const activeCrits = (this.activeFilters || []).filter(c => c && c.enabled !== false);

    const diag = this.lastDiagnostics || {
      timestamp: new Date().toLocaleTimeString(),
      docType: this.activeDocType,
      docTitle: this.docTitle || this.activeDocType,
      period: {
        startDate: this.startDateStr || "(Весь период)",
        endDate: this.endDateStr || "(Весь период)"
      },
      search: querySearch,
      filters: JSON.parse(JSON.stringify(activeCrits || [])),
      responseSuccess: true,
      rawCount: (this.items || []).length,
      filteredCount: (this.filteredItems || []).length,
      serverDebug: null,
      error: null
    };

    const isError = Boolean(diag.error);
    const isEmpty = (diag.filteredCount === 0);

    // Update Header Badge
    if (badge) {
      if (isError) {
        badge.textContent = "❌ Ошибка 1С / Сервера";
        badge.style.background = "#ffebee";
        badge.style.color = "#c62828";
        badge.style.border = "1px solid #ef9a9a";
      } else if (isEmpty) {
        badge.textContent = "⚠️ 0 документов (Результат пустой)";
        badge.style.background = "#fff3e0";
        badge.style.color = "#e65100";
        badge.style.border = "1px solid #ffb74d";
      } else {
        badge.textContent = `✅ Найдено: ${diag.filteredCount} документов`;
        badge.style.background = "#e8f5e9";
        badge.style.color = "#2e7d32";
        badge.style.border = "1px solid #a5d6a7";
      }
    }

    let html = "";

    // 1. Alert Summary Box
    if (isError) {
      html += `
        <div style="background: #ffebee; border: 1px solid #ef5350; border-radius: 4px; padding: 10px; color: #b71c1c;">
          <div style="font-weight: bold; font-size: 12px; display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
            <span>❌</span><span>Произошла ошибка при выполнении запроса в 1C</span>
          </div>
          <div style="font-family: Consolas, monospace; font-size: 11px; background: #ffffff; padding: 6px; border: 1px solid #ffcdd2; border-radius: 3px; word-break: break-all;">
            ${this.escapeHtml(diag.error)}
          </div>
        </div>
      `;
    } else if (isEmpty) {
      html += `
        <div style="background: #fff8e1; border: 1px solid #ffd54f; border-radius: 4px; padding: 10px; color: #795548;">
          <div style="font-weight: bold; font-size: 12px; color: #b26a00; display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
            <span>⚠️</span><span>Поиск завершился без результатов (0 документов)</span>
          </div>
          <div style="font-size: 11px; line-height: 1.5; color: #333;">
            1C sorğunu uğurla emal etdi, lakin təyin edilmiş filtrlərə və ya perioda uyğun heç bir sənəd tapılmadı.
            Aşağıdakı <strong>Səbəb Analizi</strong> bölməsində nəticənin niyə boş gəldiyinə baxa bilərsiniz.
          </div>
        </div>
      `;
    } else {
      html += `
        <div style="background: #e8f5e9; border: 1px solid #81c784; border-radius: 4px; padding: 8px 10px; color: #1b5e20;">
          <div style="font-weight: bold; font-size: 11px; display: flex; align-items: center; gap: 6px;">
            <span>✅</span><span>Условия отбора успешно применены: найдено ${diag.filteredCount} документов.</span>
          </div>
        </div>
      `;
    }

    // 2. Concrete Empty-Result Diagnostic Analysis
    if (isEmpty && !isError) {
      let reasons = [];

      // Check Contractor Filter
      const kontrCrit = (diag.filters || []).find(f => f.fieldKey === "kontragent" || f.fieldKey === "kontragent_code");
      if (kontrCrit && kontrCrit.value) {
        const valStr = String(kontrCrit.value).trim();
        const toks = valStr.split(";").map(t => t.trim()).filter(Boolean);
        if (toks.length > 1) {
          reasons.push(`
            <li style="margin-bottom: 6px;">
              <strong>Отбор по нескольким контрагентам (${toks.length} шт.):</strong><br>
              Göstərilən mağazalar: <code style="background: #eef; padding: 1px 4px; border-radius: 2px;">${this.escapeHtml(valStr)}</code><br>
              <span style="color: #555;">Sistem hər bir mağazanı ayrı-ayrılıqda həm adı, həm də kodu ilə <strong>OR / ИЛИ</strong> məntiqi ilə axtarır. Nəticənin 0 olma ehtimalları:</span>
              <ul style="margin: 4px 0 4px 18px; color: #444;">
                <li>Seçilmiş periodda (<strong>${diag.period?.startDate} — ${diag.period?.endDate}</strong>) bu kontragentlərə aid heç bir sənəd yoxdur.</li>
                <li>Jurnalın başlığında periodu dəyişin (məsələn: daha geniş interval və ya bütün ili seçin).</li>
                <li>Kontragent kodunun 1C bazasındakı kodla (məsələn, <code>0550</code>, <code>C000021068</code>) uyğunluğunu yoxlayın.</li>
              </ul>
            </li>
          `);
        } else {
          reasons.push(`
            <li style="margin-bottom: 6px;">
              <strong>Отбор по контрагенту:</strong> <code>${this.escapeHtml(valStr)}</code>.<br>
              Cari periodda (<strong>${diag.period?.startDate} — ${diag.period?.endDate}</strong>) bu müştəriyə aid heç bir qaimə/sənəd yoxdur.
            </li>
          `);
        }
      }

      // Check Nomenclature Filter
      const nomCrit = (diag.filters || []).find(f => f.fieldKey === "nomenclature");
      if (nomCrit && nomCrit.value) {
        reasons.push(`
          <li style="margin-bottom: 6px;">
            <strong>Отбор по номенклатуре:</strong> <code>${this.escapeHtml(nomCrit.value)}</code>.<br>
            Cari sənədlərin tərkibində bu adda və ya kodda mal yoxdur.
          </li>
        `);
      }

      // Check Status / WMS Filter
      const statCrit = (diag.filters || []).find(f => f.fieldKey === "vms_status" || f.fieldKey === "status" || f.fieldKey === "posted");
      if (statCrit && statCrit.value) {
        reasons.push(`
          <li style="margin-bottom: 6px;">
            <strong>Məhdudiyyət:</strong> [${statCrit.fieldLabel || statCrit.fieldKey}] = <code>${this.escapeHtml(statCrit.value)}</code>.<br>
            Sənədlər ola bilər, lakin bu statusa uyğun gəlmir (məsələn, WMS təsdiqi yoxdur və ya keçirilməyib).
          </li>
        `);
      }

      // Check Quick Search
      if (diag.search) {
        reasons.push(`
          <li style="margin-bottom: 6px;">
            <strong>Быстрый поиск:</strong> «<code>${this.escapeHtml(diag.search)}</code>».<br>
            Heç bir sütunda bu mətn tapılmadı.
          </li>
        `);
      }

      if (reasons.length === 0) {
        reasons.push(`
          <li style="margin-bottom: 6px;">
            <strong>Период дат:</strong> с <strong>${diag.period?.startDate}</strong> по <strong>${diag.period?.endDate}</strong>.<br>
            Göstərilən periodda «${diag.docTitle}» sənədi mövcud deyil.
          </li>
        `);
      }

      html += `
        <div style="background: #fafafa; border: 1px solid #dcdcdc; border-radius: 4px; padding: 10px;">
          <div style="font-weight: bold; font-size: 11px; color: #b71c1c; margin-bottom: 6px; display: flex; align-items: center; gap: 4px;">
            <span>🔍</span><span>Niyə nəticə boşdur? (Səbəblərin analizi)</span>
          </div>
          <ol style="margin: 0; padding-left: 20px; font-size: 11px; line-height: 1.5;">
            ${reasons.join("")}
          </ol>
        </div>
      `;
    }

    // 3. Request Parameters Summary
    html += `
      <div style="background: #fdfdfd; border: 1px solid #dcdcdc; border-radius: 4px; padding: 8px 10px;">
        <div style="font-weight: bold; font-size: 11px; color: #003366; margin-bottom: 6px; border-bottom: 1px solid #eee; padding-bottom: 3px;">
          📊 Сводка текущего запроса
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <tr>
            <td style="padding: 2px 4px; color: #666; width: 160px;">Журнал / Документ:</td>
            <td style="padding: 2px 4px; font-weight: bold;">${this.escapeHtml(diag.docTitle)} <span style="color: #888; font-weight: normal;">(${this.escapeHtml(diag.docType)})</span></td>
          </tr>
          <tr>
            <td style="padding: 2px 4px; color: #666;">Период выборки:</td>
            <td style="padding: 2px 4px; font-weight: bold; color: #002060;">${this.escapeHtml(diag.period?.startDate || "—")} — ${this.escapeHtml(diag.period?.endDate || "—")}</td>
          </tr>
          <tr>
            <td style="padding: 2px 4px; color: #666;">Быстрый поиск (Шапка):</td>
            <td style="padding: 2px 4px;">${diag.search ? `<code style="background: #fffae6; padding: 1px 4px;">${this.escapeHtml(diag.search)}</code>` : '<span style="color: #999;">(не задан)</span>'}</td>
          </tr>
          <tr>
            <td style="padding: 2px 4px; color: #666;">Активных условий отбора:</td>
            <td style="padding: 2px 4px; font-weight: bold;">${diag.filters ? diag.filters.length : 0}</td>
          </tr>
          <tr>
            <td style="padding: 2px 4px; color: #666;">Получено строк из 1C:</td>
            <td style="padding: 2px 4px; font-weight: bold;">${diag.rawCount !== undefined ? diag.rawCount : '—'}</td>
          </tr>
          <tr>
            <td style="padding: 2px 4px; color: #666;">Отображается в таблице:</td>
            <td style="padding: 2px 4px; font-weight: bold; color: ${diag.filteredCount === 0 ? '#b71c1c' : '#2e7d32'};">${diag.filteredCount !== undefined ? diag.filteredCount : '—'}</td>
          </tr>
          <tr>
            <td style="padding: 2px 4px; color: #666;">Время фиксации:</td>
            <td style="padding: 2px 4px; color: #888;">${this.escapeHtml(diag.timestamp || "")}</td>
          </tr>
        </table>
      </div>
    `;

    // 4. Active Filter Conditions Table
    if (diag.filters && diag.filters.length > 0) {
      let critRows = "";
      diag.filters.forEach((f, idx) => {
        critRows += `
          <tr style="border-bottom: 1px solid #e8e8e8; height: 22px;">
            <td style="padding: 2px 6px; text-align: center; color: #888;">${idx + 1}</td>
            <td style="padding: 2px 6px; font-weight: bold; color: #003366;">${this.escapeHtml(f.fieldLabel || f.fieldKey)}</td>
            <td style="padding: 2px 6px; color: #555;">${this.escapeHtml(f.operator || "Равно")}</td>
            <td style="padding: 2px 6px;"><code style="background: #f0f0f0; padding: 1px 4px; border-radius: 2px;">${this.escapeHtml(f.value || "")}</code></td>
          </tr>
        `;
      });

      html += `
        <div style="background: #ffffff; border: 1px solid #dcdcdc; border-radius: 4px; padding: 8px 10px;">
          <div style="font-weight: bold; font-size: 11px; color: #003366; margin-bottom: 6px; border-bottom: 1px solid #eee; padding-bottom: 3px;">
            🎯 Активные условия отбора (${diag.filters.length})
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
            <thead>
              <tr style="background: #f2f0e6; border-bottom: 1px solid #ccc; text-align: left; height: 20px;">
                <th style="padding: 2px 6px; width: 30px; text-align: center;">№</th>
                <th style="padding: 2px 6px; width: 160px;">Поле отбора</th>
                <th style="padding: 2px 6px; width: 140px;">Вид сравнения</th>
                <th style="padding: 2px 6px;">Значение</th>
              </tr>
            </thead>
            <tbody>
              ${critRows}
            </tbody>
          </table>
        </div>
      `;
    }

    // 5. Technical 1C Query & Debug Info
    if (diag.serverDebug) {
      const sD = diag.serverDebug;
      let paramsRows = "";
      if (sD.parameters && typeof sD.parameters === "object") {
        for (const [k, v] of Object.entries(sD.parameters)) {
          paramsRows += `
            <tr style="border-bottom: 1px solid #e0e0e0; font-family: Consolas, monospace; font-size: 10px;">
              <td style="padding: 2px 6px; color: #0055ea; font-weight: bold;">&${this.escapeHtml(k)}</td>
              <td style="padding: 2px 6px; color: #222;">${this.escapeHtml(String(v))}</td>
            </tr>
          `;
        }
      }

      html += `
        <div style="background: #f7f9fa; border: 1px solid #cfd8dc; border-radius: 4px; padding: 8px 10px;">
          <div style="font-weight: bold; font-size: 11px; color: #37474f; margin-bottom: 6px; display: flex; align-items: center; justify-content: space-between;">
            <span>⚙️ Технические данные 1C: Запрос и параметры</span>
            <span style="font-size: 10px; color: #78909c;">(Исполнено в COM-сессии)</span>
          </div>

          <div style="margin-bottom: 6px;">
            <div style="font-size: 10px; font-weight: bold; color: #607d8b; margin-bottom: 2px;">Условие WHERE (ГДЕ):</div>
            <pre style="margin: 0; padding: 6px; background: #263238; color: #eceff1; border-radius: 3px; font-size: 10px; font-family: Consolas, monospace; max-height: 120px; overflow-y: auto; white-space: pre-wrap; word-break: break-all;">${this.escapeHtml(sD.where_sql || "(Без дополнительных условий ГДЕ)")}</pre>
          </div>

          ${paramsRows ? `
            <div>
              <div style="font-size: 10px; font-weight: bold; color: #607d8b; margin-bottom: 2px;">Переданные параметры:</div>
              <table style="width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #cfd8dc;">
                <tbody>
                  ${paramsRows}
                </tbody>
              </table>
            </div>
          ` : ''}
        </div>
      `;
    }

    body.innerHTML = html;
  },

  copyDiagnosticsToClipboard: function() {
    const diag = this.lastDiagnostics || {
      timestamp: new Date().toLocaleTimeString(),
      docType: this.activeDocType,
      docTitle: this.docTitle,
      period: { startDate: this.startDateStr, endDate: this.endDateStr },
      search: "",
      filters: (this.activeFilters || []).filter(c => c && c.enabled !== false),
      filteredCount: (this.filteredItems || []).length,
      rawCount: (this.items || []).length,
      serverDebug: null,
      error: null
    };

    const filtersText = (diag.filters && diag.filters.length > 0)
      ? diag.filters.map((f, i) => `  ${i + 1}. [${f.fieldLabel || f.fieldKey}] ${f.operator || "Равно"} = "${f.value || ""}"`).join("\n")
      : "  (Нет активных фильтров)";

    let sqlText = "(N/A)";
    let paramsText = "(N/A)";
    if (diag.serverDebug) {
      sqlText = diag.serverDebug.where_sql || "(нет)";
      paramsText = JSON.stringify(diag.serverDebug.parameters || {}, null, 2);
    }

    const report = [
      "==================================================",
      " 1С:ПРЕДПРИЯТИЕ — ОТЧЕТ ДИАГНОСТИКИ И ОТБОРА",
      "==================================================",
      `Время отчета:      ${diag.timestamp || new Date().toLocaleTimeString()}`,
      `Журнал / Документ: ${diag.docTitle || this.docTitle} (${diag.docType || this.activeDocType})`,
      `Интервал дат:      ${diag.period?.startDate || "—"} по ${diag.period?.endDate || "—"}`,
      `Быстрый поиск:     ${diag.search ? `"${diag.search}"` : "(пусто)"}`,
      `Строк найдено:     ${diag.filteredCount !== undefined ? diag.filteredCount : 0} (из 1C получено: ${diag.rawCount !== undefined ? diag.rawCount : 0})`,
      `Статус:            ${diag.error ? `ОШИБКА: ${diag.error}` : (diag.filteredCount === 0 ? "ПУСТОЙ РЕЗУЛЬТАТ (0 документов)" : "УСПЕШНО")}`,
      "",
      "--- УСЛОВИЯ ОТБОРА ---",
      filtersText,
      "",
      "--- ТЕХНИЧЕСКИЙ SQL 1C ---",
      `WHERE (ГДЕ):\n${sqlText}`,
      "",
      `Параметры запроса:\n${paramsText}`,
      "",
      "=================================================="
    ].join("\n");

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(report).then(() => {
        this.updateStatus("📋 Диагностический отчет скопирован в буфер обмена!");
        alert("📋 Диагностический отчет скопирован в буфер обмена!\nВы можете отправить его для быстрой проверки.");
      }).catch(() => {
        this.promptFallbackCopy(report);
      });
    } else {
      this.promptFallbackCopy(report);
    }
  },

  promptFallbackCopy: function(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      this.updateStatus("📋 Диагностический отчет скопирован!");
      alert("📋 Диагностический отчет скопирован в буфер обмена!");
    } catch (e) {
      prompt("Скопируйте текст отчета вручную (Ctrl+C):", text);
    }
    ta.remove();
  }

};

JournalInstance.prototype = _UniversalJournalTarget;
JournalInstance.prototype.constructor = JournalInstance;

// Setup default instance
_UniversalJournalTarget.instances["universalJournalWindow"] = new JournalInstance("universalJournalWindow", "РеализацияТоваровУслуг");

// Wrap methods on _UniversalJournalTarget so when called directly on UniversalJournal, 'this' is bound to the active instance
for (const [key, val] of Object.entries(_UniversalJournalTarget)) {
  if (typeof val === "function" && !["getActiveInstance", "getInstance", "duplicateWindow", "openNewWindow", "openDirect", "close", "onPeriodSelected", "openPeriodPicker"].includes(key)) {
    const origFn = val;
    _UniversalJournalTarget[key] = function(...args) {
      const ctx = (this === _UniversalJournalTarget || this === UniversalJournal) ? _UniversalJournalTarget.getActiveInstance() : this;
      return origFn.apply(ctx, args);
    };
  }
}

const UniversalJournal = new Proxy(_UniversalJournalTarget, {
  get(target, prop, receiver) {
    if (["instances", "_winCounter", "lastActiveInstanceId", "getActiveInstance", "getInstance", "duplicateWindow", "openNewWindow", "openDirect", "close", "onPeriodSelected", "openPeriodPicker", "prefetchCache", "prefetchQueue", "activePrefetchCount", "maxConcurrentPrefetches", "prefetchAbortController", "clearPrefetchCache", "getPrefetchedPriceDoc", "getPendingPrefetchPromise", "invalidatePrefetch"].includes(prop)) {
      return target[prop];
    }
    const inst = target.getActiveInstance();
    if (inst && typeof target[prop] !== "function") {
      return inst[prop];
    }
    if (prop in target) {
      return target[prop];
    }
    return inst ? inst[prop] : undefined;
  },
  set(target, prop, value, receiver) {
    if (["instances", "_winCounter", "lastActiveInstanceId", "prefetchCache", "prefetchQueue", "activePrefetchCount", "maxConcurrentPrefetches", "prefetchAbortController"].includes(prop)) {
      target[prop] = value;
      return true;
    }
    if (typeof value === "function") {
      target[prop] = function(...args) {
        const ctx = (this === _UniversalJournalTarget || this === UniversalJournal) ? _UniversalJournalTarget.getActiveInstance() : this;
        return value.apply(ctx, args);
      };
      JournalInstance.prototype[prop] = target[prop];
      return true;
    }
    const inst = target.getActiveInstance();
    if (inst) {
      inst[prop] = value;
      return true;
    }
    target[prop] = value;
    return true;
  }
});

window.UniversalJournal = UniversalJournal;
window.openJournalDirect = function(docType) {
  if (window.UniversalJournal && typeof UniversalJournal.openDirect === "function") {
    UniversalJournal.openDirect(docType);
  }
};
window.openUniversalJournalWindow = window.openJournalDirect;

// Hotkeys for Universal Journal: F7, Shift+F7, Ctrl+F, Ctrl+Q, Ctrl+Shift+F
document.addEventListener("keydown", function(e) {
  const activeInst = (typeof UniversalJournal !== "undefined" && UniversalJournal.getActiveInstance) 
    ? UniversalJournal.getActiveInstance() 
    : null;
  const ujWin = activeInst ? (activeInst.windowElement || document.getElementById(activeInst.windowId)) : document.getElementById("universalJournalWindow");
  if (!ujWin || ujWin.style.display === "none") return;
  if (typeof MdiManager !== "undefined" && MdiManager.activeWindowId && activeInst && MdiManager.activeWindowId !== activeInst.windowId) return;

  const findModal = document.getElementById("ujFindModal");
  const findInfo = document.getElementById("ujFindInfo");
  if (findInfo && findInfo.style.display !== "none") {
    if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); findInfo.style.display = "none"; }
    return;
  }
  if (findModal && findModal.style.display !== "none") {
    if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); UniversalJournal.closeFindModal(); }
    return;
  }
  if (!activeInst || !activeInst.isJournalActive()) return;
  const isEditing = e.target.closest && e.target.closest('input,textarea,select,[contenteditable="true"]');
  if (!isEditing && e.key === "End") {
    e.preventDefault();
    e.stopPropagation();
    activeInst.requestMoreDocuments(true);
    const wrapper = activeInst.getEl("ujTableWrapper");
    if (wrapper) wrapper.scrollTop = wrapper.scrollHeight;
    return;
  }
  if (!isEditing && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1 && !e.isComposing && (activeInst.selectedRow || activeInst._columnSelectedForFind)) {
    e.preventDefault();
    activeInst.openFindModal(e.key);
    return;
  }

  // Ctrl + Q: Cancel / Clear search and reset column search highlight
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "q") {
    e.preventDefault();
    if (activeInst && activeInst.clearSearch) {
      activeInst.clearSearch();
    }
  }
  // Ctrl + Shift + F: Clear all filters
  else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key.toLowerCase() === "f" || e.code === "KeyF")) {
    e.preventDefault();
    if (activeInst && activeInst.clearFilter) {
      activeInst.clearFilter();
    }
  }
  // Ctrl + F: Quick Find in current/selected column
  else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key.toLowerCase() === "f" || e.code === "KeyF")) {
    e.preventDefault();
    if (activeInst && activeInst.openFindModal) {
      activeInst.openFindModal();
    }
  }
  // Shift + F7: Remove filter for current column
  else if (e.key === "F7" && e.shiftKey) {
    e.preventDefault();
    if (activeInst && activeInst.removeFilterByCurrentColumn) {
      activeInst.removeFilterByCurrentColumn();
    }
  }
  // F7: Quick Filter by selected column value
  else if (e.key === "F7") {
    e.preventDefault();
    if (activeInst && activeInst.filterByCurrentValue) {
      activeInst.filterByCurrentValue();
    }
  }
}, true);

document.addEventListener("copy", function(e) {
  if (!UniversalJournal.isJournalActive() || !UniversalJournal.selectedRow) return;
  if (["ujFindModal", "ujFindInfo"].some(id => { const modal = document.getElementById(id); return modal && modal.style.display !== "none"; })) return;
  if (e.target.closest && e.target.closest('input,textarea,[contenteditable="true"]')) return;
  if (window.getSelection()?.toString()) return;
  const cell = document.querySelector('#ujTableBody .c1-cell-active');
  if (cell && e.clipboardData) { e.clipboardData.setData("text/plain", cell.innerText.trim()); e.preventDefault(); }
});

// DOM yükləndikdə ilkin inisializasiya və mövcud sahələrin render edilməsi
document.addEventListener("DOMContentLoaded", function() {
  if (typeof UniversalJournal !== "undefined") {
    UniversalJournal.init();
    if (typeof UniversalJournal.renderFilterAvailableFields === "function") {
      UniversalJournal.renderFilterAvailableFields();
    }
  }
});

