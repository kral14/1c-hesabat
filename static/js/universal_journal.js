/**
 * 1C:ENTERPRISE - UNIVERSAL DOCUMENT JOURNAL CONTROLLER
 * static/js/universal_journal.js
 */

const UniversalJournal = {
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
  },

  open: function(defaultDocType) {
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

    if (defaultDocType) {
      this.activeDocType = defaultDocType;
      const sel = document.getElementById("ujDocTypeSelect");
      if (sel) sel.value = defaultDocType;
    }

    const win = document.getElementById("universalJournalWindow");
    if (!win) return;

    if (window.MdiManager) {
      MdiManager.activateWindow("universalJournalWindow", {
        title: `Журнал документов: ${this.docTitle}`,
        icon: "🗂️",
        closeFn: () => {
          this.clearPrefetchCache();
        }
      });
    } else {
      win.style.display = "flex";
      win.classList.remove("minimized");
      win.classList.add("active");
    }

    this.loadDocuments();
  },

  close: function() {
    this.clearPrefetchCache();
    if (window.MdiManager) {
      MdiManager.closeWindow("universalJournalWindow");
    } else {
      const win = document.getElementById("universalJournalWindow");
      if (win) win.style.display = "none";
    }
  },

  onDocTypeChange: function() {
    this.clearPrefetchCache();
    const sel = document.getElementById("ujDocTypeSelect");
    if (!sel) return;
    this.activeDocType = sel.value;
    this.selectedRow = null;
    this.activeFilters = [];
    this.activePresetName = "";
    this.updateActiveFilterBadgeUI();
    this.updateEditButtonState();
    this.loadDocuments();
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
    const lbl = document.getElementById("ujPeriodLabel");
    if (!lbl) return;
    if (this.startDateStr && this.endDateStr) {
      lbl.textContent = `[ ${this.startDateStr} - ${this.endDateStr} ]`;
      lbl.style.color = "#002060";
    } else if (this.startDateStr && !this.endDateStr) {
      lbl.textContent = `[ с ${this.startDateStr} ]`;
      lbl.style.color = "#002060";
    } else if (!this.startDateStr && this.endDateStr) {
      lbl.textContent = `[ по ${this.endDateStr} ]`;
      lbl.style.color = "#002060";
    } else {
      lbl.textContent = "(Весь период)";
      lbl.style.color = "#555";
    }
  },

  formatDateForBackend: function(dStr) {
    if (!dStr || !/^\d{2}\.\d{2}\.\d{4}$/.test(dStr)) return "";
    const [d, m, y] = dStr.split(".");
    return `${y}-${m}-${d}`;
  },

  loadDocuments: function() {
    this.clearPrefetchCache();
    const loadingEl = document.getElementById("ujLoadingState");
    const emptyEl = document.getElementById("ujEmptyState");
    const tableEl = document.getElementById("ujTable");

    if (loadingEl) loadingEl.style.display = "flex";
    if (emptyEl) emptyEl.style.display = "none";
    this.updateStatus("Загрузка списка документов из 1C...");

    const creds = window.SessionManager ? SessionManager.getCredentials() : {};
    const payload = {
      ...creds,
      doc_type: this.activeDocType,
      date_from: this.formatDateForBackend(this.startDateStr),
      date_to: this.formatDateForBackend(this.endDateStr),
      search: "",
      limit: 0
    };

    fetch("/api/documents/list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
      if (loadingEl) loadingEl.style.display = "none";

      if (!data.success) {
        alert("1C Xətası: " + (data.error || "Sənədlər yüklənə bilmədi"));
        this.updateStatus("Ошибка: " + data.error);
        return;
      }

      this.docTitle = data.doc_title || this.activeDocType;
      this.loadColumnsConfig(data.columns || []);
      this.items = data.items || [];

      // Update Window Header
      const titleEl = document.getElementById("ujWindowTitle");
      if (titleEl) titleEl.textContent = `Журнал документов: ${this.docTitle}`;

      // Check and apply startup default filter or active session filter
      this.checkAndApplyStartupFilter();
    })
    .catch(err => {
      if (loadingEl) loadingEl.style.display = "none";
      console.error("Error loading documents:", err);
      this.updateStatus("Ошибка сети при загрузке документов");
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
          merged.push({
            ...def,
            ...sc,
            label: sc.label || def.label,
            visible: sc.visible !== false,
            width: Number(sc.width || def.width || 100),
            autoWidth: Boolean(sc.autoWidth)
          });
          defaultMap.delete(sc.key);
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
    const tbody = document.getElementById("ujTableBody");
    const emptyEl = document.getElementById("ujEmptyState");
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
    const wrapper = document.getElementById("ujTableWrapper");
    if (!wrapper || wrapper._hasVirtualScroll) return;
    wrapper._hasVirtualScroll = true;

    let ticking = false;
    wrapper.addEventListener("scroll", () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          this.updateVirtualRows();
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  },

  updateVirtualRows: function() {
    const wrapper = document.getElementById("ujTableWrapper");
    const tbody = document.getElementById("ujTableBody");
    if (!wrapper || !tbody) return;

    const totalCount = this.filteredItems.length;
    if (totalCount === 0) {
      tbody.innerHTML = "";
      return;
    }

    const scrollTop = wrapper.scrollTop;
    const clientHeight = wrapper.clientHeight || 500;
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
    const bottomSpacerHeight = (totalCount - endIdx) * this.rowHeight;

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
    const rowBg = isSelected ? "#316ac5" : defaultBg;
    const textColor = isSelected ? "#ffffff" : "#111111";

    let statusIconHtml = "";
    if (row.deleted) {
      statusIconHtml = `<span title="Помечен на удаление" style="color:#d32f2f; font-weight:bold; font-size:12px;">✕</span>`;
    } else if (row.posted) {
      statusIconHtml = `<span title="Проведен" style="color:#2e7d32; font-weight:bold; font-size:13px;">✔</span>`;
    } else {
      statusIconHtml = `<span title="Не проведен (Черновик)" style="color:#666666; font-size:11px;">📄</span>`;
    }

    const cells = [];
    for (let c = 0; c < visibleCols.length; c++) {
      const col = visibleCols[c];
      const key = col.key;
      let val = row[key];

      const wStyle = col.autoWidth ? "" : `width: ${col.width}px; min-width: ${col.width}px; max-width: ${col.width}px;`;

      if (key === "status") {
        cells.push(`<td data-col-key="status" style="width: 30px; min-width: 30px; max-width: 30px; padding: 2px; text-align: center; border: 1px solid #d4d0c8; user-select: text;" onclick="UniversalJournal.selectCell(${i}, 'status', this, event)">${statusIconHtml}</td>`);
        continue;
      }

      if (key === "amount" && typeof val === "number") {
        val = val.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }

      const align = col.align || "left";
      const cellText = (val !== undefined && val !== null) ? String(val) : "";
      cells.push(`<td data-col-key="${key}" style="${wStyle} padding: 2px 6px; text-align: ${align}; border: 1px solid #d4d0c8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; user-select: text;" onclick="UniversalJournal.selectCell(${i}, '${key}', this, event)">${this.escapeHtml(cellText)}</td>`);
    }

    return `<tr class="uj-row" data-row-idx="${i}" style="background: ${rowBg}; color: ${textColor}; height: 21px; cursor: pointer; user-select: text;" onclick="UniversalJournal.selectRow(${i})" ondblclick="UniversalJournal.editSelectedDocument()">${cells.join("")}</tr>`;
  },

  renderTableHead: function() {
    const headRow = document.getElementById("ujTableHeadRow");
    if (!headRow) return;

    const visibleCols = this.getVisibleColumns();
    let html = "";
    for (let c = 0; c < visibleCols.length; c++) {
      const col = visibleCols[c];
      const wStyle = col.autoWidth ? "" : `width: ${col.width}px; min-width: ${col.width}px; max-width: ${col.width}px;`;
      const isSort = this.currentSortCol === col.key;
      const arrow = isSort ? (this.currentSortAsc ? " ▴" : " ▾") : "";
      const cursor = col.key === "status" ? "" : "cursor: pointer;";

      html += `
        <th class="uj-th" data-col-key="${col.key}" draggable="true"
            style="${wStyle} position: relative; padding: 4px 6px; border: 1px solid #b0af9f; text-align: ${col.align || 'left'}; white-space: nowrap; user-select: none; ${cursor}"
            onclick="UniversalJournal.sortBy('${col.key}')"
            ondragstart="UniversalJournal.onColDragStart(event, '${col.key}')"
            ondragover="UniversalJournal.onColDragOver(event)"
            ondragenter="UniversalJournal.onColDragEnter(event, this)"
            ondragleave="UniversalJournal.onColDragLeave(event, this)"
            ondrop="UniversalJournal.onColDrop(event, '${col.key}')">
          <span style="display: inline-block; overflow: hidden; text-overflow: ellipsis; max-width: calc(100% - 10px); vertical-align: middle;">
            ${this.escapeHtml(col.label)}${arrow}
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

      const tbody = document.getElementById("ujTableBody");
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
    "В группе из списка",
    "Не в списке",
    "Содержит",
    "Не содержит",
    "Больше",
    "Меньше",
    "Больше или равно",
    "Меньше или равно",
    "Заполнено",
    "Не заполнено"
  ],

  getAvailableFields: function() {
    const isRealization = (this.activeDocType === "РеализацияТоваровУслуг");
    const fields = [
      { key: "deleted", label: "Пометка удаления", type: "boolean" },
      { key: "posted", label: "Проведен", type: "boolean" },
      { key: "date", label: "Дата", type: "text" },
      { key: "number", label: "Номер", type: "text" },
      { key: "kontragent", label: "Контрагент", type: "text" }
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
        title: `Настройка списка: ${this.docTitle || this.activeDocType}`,
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
        r.style.background = isSel ? "#dceaf7" : (rIdx % 2 === 1 ? "#f9f8f4" : "#ffffff");
      });
    }
  },

  toggleFilterCritEnabled: function(idx, checked) {
    if (this.tempFilterCriteria[idx]) {
      this.tempFilterCriteria[idx].enabled = checked;
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
      this.tempFilterCriteria[idx].operator = newOp;
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

      const opOptionsHtml = this.filterOperators.map(op => `
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
                  onchange="UniversalJournal.tempFilterCriteria[${idx}].value = this.value">
            <option value="Да" ${valStr === 'Да' ? 'selected' : ''} style="color: #111111 !important; background-color: #ffffff !important;">Да</option>
            <option value="Нет" ${valStr === 'Нет' ? 'selected' : ''} style="color: #111111 !important; background-color: #ffffff !important;">Нет</option>
          </select>
        `;
      } else {
        const placeholder = (crit.operator === "В группе из списка" || crit.operator === "В списке") 
          ? "Код или наименование через точку с запятой..." 
          : "Код или наименование...";
        const structAttr = crit.structuredFilter ? `data-structured-list="${this.escapeHtml(JSON.stringify(crit.structuredFilter))}"` : '';
        valueInputHtml = `
          <div style="display: flex; align-items: center; width: 100%; gap: 1px; position: relative;">
            <input type="text" id="ujFilterValInput_${idx}" class="input-1c" ${structAttr}
                   style="flex: 1; height: 21px; font-size: 11px; padding: 1px 4px; outline: none; background: #ffffff !important; color: #111111 !important; border: 1px solid #7f9db9;"
                   value="${this.escapeHtml(crit.value !== undefined ? String(crit.value) : '')}"
                   placeholder="${placeholder}"
                   onclick="event.stopPropagation()"
                   onfocus="UniversalJournal.selectFilterCritRow(${idx})"
                   oninput="UniversalJournal.onFilterValueInput(${idx}, this, event)"
                   onkeydown="UniversalJournal.onFilterInputKeydown(${idx}, this, event)">
            <button type="button" class="btn-1c filter-btn-pick" 
                    style="height: 21px; width: 22px; padding: 0 4px; font-size: 11px; font-weight: bold; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; background: #ece9d8; border: 1px solid #7f9db9; color: #111111;"
                    onclick="event.stopPropagation(); UniversalJournal.openFilterFieldPicker(${idx})"
                    title="Выбрать значение (...)">
              ...
            </button>
          </div>
        `;
      }

      rowsHtml += `
        <tr id="ujCritRow_${idx}" style="background: ${bg}; height: 25px;" onclick="UniversalJournal.selectFilterCritRow(${idx})">
          <td style="width: 28px; text-align: center; border: 1px solid #d4d0c8;">
            <input type="checkbox" ${isChecked ? 'checked' : ''}
                   onclick="event.stopPropagation(); UniversalJournal.toggleFilterCritEnabled(${idx}, this.checked)"
                   style="cursor: pointer; vertical-align: middle;">
          </td>
          <td style="padding: 1px 4px; border: 1px solid #d4d0c8; width: 170px;">
            <select class="select-1c" style="width: 100%; height: 21px; font-size: 11px; border: 1px solid #7f9db9; background: #ffffff !important; color: #111111 !important; font-weight: 500; cursor: pointer; padding: 0 2px;"
                    onclick="event.stopPropagation()"
                    onchange="UniversalJournal.onFilterCritFieldChange(${idx}, this.value)">
              ${fieldOptionsHtml}
            </select>
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
  },

  // 1C [...] Value List & Catalog Picker Engine (Screenshot 2 / 3 Tovarni Sklad)
  openFilterFieldPicker: function(idx) {
    const crit = this.tempFilterCriteria[idx];
    if (!crit) return;
    const inputEl = document.getElementById(`ujFilterValInput_${idx}`);
    if (!inputEl) return;

    this.selectFilterCritRow(idx);
    this.hideFilterAutocomplete();

    const op = crit.operator || "Равно";
    const isMulti = (op === "В группе из списка" || op === "В списке" || op === "Не в списке");

    let catalog = null;
    if (crit.fieldKey === "contract_price_type") {
      catalog = "ТипыЦенНоменклатуры";
    } else if (crit.fieldKey === "contract") {
      catalog = "ДоговорыКонтрагентов";
    } else if (crit.fieldKey === "kontragent" || crit.fieldKey === "kontragent_code") {
      catalog = "Контрагенты";
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
              crit.value = inputEl.value;
              crit.structuredFilter = data;
              inputEl.dataset.structuredList = JSON.stringify(data);
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
                inputEl.value = name;
                crit.value = name;
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
            crit.value = inputEl.value;
            crit.structuredFilter = data;
            inputEl.dataset.structuredList = JSON.stringify(data);
          }
        });
      } else {
        const statuses = ["Подтвержден WMS", "Выгружен", "Новый", "В обработке", "Готов к отгрузке", "Отменен"];
        const cur = inputEl.value || "";
        const nextIdx = (statuses.indexOf(cur) + 1) % statuses.length;
        inputEl.value = statuses[nextIdx];
        crit.value = statuses[nextIdx];
      }
      return;
    }

    if (isMulti && window.ValueListModal) {
      ValueListModal.open({
        targetInput: inputEl,
        catalog: crit.fieldLabel || crit.fieldKey,
        structuredFilter: crit.structuredFilter,
        onApply: (data) => {
          crit.value = inputEl.value;
          crit.structuredFilter = data;
          inputEl.dataset.structuredList = JSON.stringify(data);
        }
      });
    }
  },

  // Autocomplete Live Search Engine (Only triggered on user typing >= 1 char)
  onFilterValueInput: function(idx, inputEl, event) {
    if (this.tempFilterCriteria[idx]) {
      this.tempFilterCriteria[idx].value = inputEl.value;
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
    const popup = document.getElementById("ujFilterAutocompletePopup");
    if (!popup || popup.style.display !== "block") {
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
    this.activeFilters = JSON.parse(JSON.stringify(this.tempFilterCriteria));
    if (this.activeFilters.length > 0 && !this.activePresetName) {
      this.activePresetName = "Пользовательский";
    } else if (this.activeFilters.length === 0) {
      this.activePresetName = "";
    }
    this.closeFilterModal();
    this.applyFiltersAndSearch();
    this.updateStatus(this.activeFilters.length > 0 ? "Отбор применен" : "Отбор отключен");
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
    this.applyFiltersAndSearch();
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
    this.applyFiltersAndSearch();
    this.updateStatus("Отбор отключен");
  },

  clearFilterAndCloseModal: function() {
    this.clearFilter();
    this.closePresetRestoreModal();
  },

  updateActiveFilterBadgeUI: function() {
    const badgeEl = document.getElementById("ujActiveFilterBadge");
    const nameEl = document.getElementById("ujActiveFilterName");
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
  applyFiltersAndSearch: function() {
    const activeCrits = (this.activeFilters || []).filter(c => c.enabled !== false);
    const searchInp = document.getElementById("ujSearchInput");
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
      result = result.filter(row => {
        return Object.values(row).some(v => String(v).toLowerCase().includes(q));
      });
    }

    this.filteredItems = result;

    // 3. Evaluate sorting
    if (this.currentSortCol) {
      this.applySort();
    }

    // 4. Render virtualized rows
    this.renderTable();

    // 5. Update Status and Badges
    const isFiltered = (activeCrits.length > 0 || Boolean(q));
    if (isFiltered) {
      this.updateCountBadge(`Всего: ${this.items.length} (Отфильтровано: ${this.filteredItems.length})`);
    } else {
      this.updateCountBadge(this.items.length);
    }
    this.updateActiveFilterBadgeUI();
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
        const q = query.toLowerCase().trim();
        const qClean = q.replace(/^0+/, "");
        const segments = entry.toLowerCase().split("|").map(s => s.trim());

        if (comp === "equal") {
          // Exact match on Code, Clean Code, Artikul, or Full Name
          for (const seg of segments) {
            if (!seg) continue;
            const segClean = seg.replace(/^0+/, "");
            if (seg === q || (qClean && segClean === qClean)) return true;
          }
          return entry === q || (qClean && entry.replace(/^0+/, "") === qClean);
        } else {
          // Contains match: substring in code, artikul, or name
          for (const seg of segments) {
            if (!seg) continue;
            const segClean = seg.replace(/^0+/, "");
            if (seg.includes(q) || (qClean && segClean.includes(qClean))) return true;
          }
          return entry.includes(q) || (qClean && entry.includes(qClean));
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
    if (op === "В группе из списка") {
      if (!targetVal) return true;
      const parts = String(targetVal).split(";").map(s => s.trim().toLowerCase()).filter(Boolean);
      const strVal = String(itemVal).trim().toLowerCase();
      const isCodeField = (key === "number" || key === "deal" || key === "obrabotka_number" || key === "kontragent_code");
      const strClean = isCodeField ? strVal.replace(/^[a-zа-яё_]*0+/, "") : "";
      return parts.some(p => {
        const cleanP = p.replace(/^\[[^\]]+\]\s*/, "").trim();
        const pClean = isCodeField ? cleanP.replace(/^[a-zа-яё_]*0+/, "") : "";
        return strVal === p || strVal === cleanP || strVal.includes(cleanP) || (isCodeField && strClean && pClean && strClean === pClean);
      });
    }
    if (op === "В списке") {
      if (!targetVal) return true;
      const parts = String(targetVal).split(";").map(s => s.trim().toLowerCase()).filter(Boolean);
      const strVal = String(itemVal).trim().toLowerCase();
      const isCodeField = (key === "number" || key === "deal" || key === "obrabotka_number" || key === "kontragent_code");
      const strClean = isCodeField ? strVal.replace(/^[a-zа-яё_]*0+/, "") : "";
      return parts.some(p => {
        const cleanP = p.replace(/^\[[^\]]+\]\s*/, "").trim();
        const pClean = isCodeField ? cleanP.replace(/^[a-zа-яё_]*0+/, "") : "";
        return strVal === p || strVal === cleanP || (isCodeField && strClean && pClean && strClean === pClean);
      });
    }
    if (op === "Не в списке") {
      if (!targetVal) return true;
      const parts = String(targetVal).split(";").map(s => s.trim().toLowerCase()).filter(Boolean);
      const strVal = String(itemVal).trim().toLowerCase();
      return !parts.some(p => {
        const cleanP = p.replace(/^\[[^\]]+\]\s*/, "").trim();
        return strVal === p || strVal === cleanP;
      });
    }

    // 4. Date comparisons
    if (key === "date") {
      const parseDateVal = (dStr) => {
        if (!dStr) return null;
        const s = String(dStr).trim();
        const mDot = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
        if (mDot) return new Date(parseInt(mDot[3]), parseInt(mDot[2]) - 1, parseInt(mDot[1])).getTime();
        const mIso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (mIso) return new Date(parseInt(mIso[1]), parseInt(mIso[2]) - 1, parseInt(mIso[3])).getTime();
        const parsed = Date.parse(s);
        return isNaN(parsed) ? null : parsed;
      };

      const dtItem = parseDateVal(itemVal);
      const dtTarget = parseDateVal(targetVal);

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

    // 5. Numeric comparisons (Strictly for 'amount' or when BOTH itemVal and targetVal are strictly pure numbers)
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
    if (event) event.stopPropagation();
    this.selectRow(idx, colKey, targetTd);
  },

  selectRow: function(idx, colKey, targetTd) {
    this.selectedRow = this.filteredItems[idx] || null;
    if (colKey) this.selectedColKey = colKey;
    this.updateEditButtonState();

    const tbody = document.getElementById("ujTableBody");
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
    const btn = document.getElementById("ujBtnEdit");
    if (!btn) return;
    btn.disabled = !Boolean(this.selectedRow);
    btn.style.opacity = this.selectedRow ? "1" : "0.5";
  },

  editSelectedDocument: function() {
    if (!this.selectedRow) return;

    const docType = this.activeDocType;
    const docNum = this.selectedRow.number;
    const docDate = this.selectedRow.date || "";

    if (docType === "УстановкаЦенНоменклатуры" && window.PriceDocEditor) {
      PriceDocEditor.open(docNum, docDate);
      this.updateStatus(`Открыт документ установки цен № ${docNum}`);
      return;
    }

    if (docType === "РеализацияТоваровУслуг" && window.SalesDocEditor) {
      SalesDocEditor.open(docNum, docDate);
      this.updateStatus(`Открыт документ реализации № ${docNum}`);
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

  onSearchInput: function() {
    this.applyFiltersAndSearch();
  },

  updateSearchIcon: function(q) {
    const btn = document.getElementById("ujSearchActionBtn");
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
    const inp = document.getElementById("ujSearchInput");
    if (!inp) return;
    if (inp.value.trim()) {
      this.clearSearch();
      inp.focus();
    } else {
      inp.focus();
    }
  },

  openFindModal: function() {
    const inp = document.getElementById("ujSearchInput");
    if (inp) {
      inp.focus();
      inp.select();
    }
  },

  clearSearch: function() {
    const inp = document.getElementById("ujSearchInput");
    if (inp) inp.value = "";
    this.updateSearchIcon("");
    this.applyFiltersAndSearch();
  },

  autofitColumns: function() {
    this.renderTable();
    this.updateStatus("Автоподбор ширины колонок выполнен");
  },

  refresh: function() {
    this.loadDocuments();
  },

  sortBy: function(colKey) {
    if (colKey === "status") return;
    if (this.currentSortCol === colKey) {
      this.currentSortAsc = !this.currentSortAsc;
    } else {
      this.currentSortCol = colKey;
      this.currentSortAsc = true;
    }
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
    const badge = document.getElementById("ujStatusRight");
    if (badge) {
      if (typeof count === "number") {
        badge.textContent = `Всего: ${count.toLocaleString("ru-RU")} документов`;
      } else {
        badge.textContent = String(count);
      }
    }
  },

  updateStatus: function(text) {
    const el = document.getElementById("ujStatusLeft");
    if (el) el.textContent = text;
  },

  escapeHtml: function(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
};

window.UniversalJournal = UniversalJournal;
window.openUniversalJournalWindow = function(docType) {
  UniversalJournal.open(docType);
};
