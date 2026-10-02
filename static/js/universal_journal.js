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
    const wrapper = document.getElementById("ujTableWrapper");
    if (!wrapper || wrapper._hasPrefetchListener) return;
    wrapper._hasPrefetchListener = true;

    let scrollDebounce = null;
    wrapper.addEventListener("scroll", () => {
      if (scrollDebounce) clearTimeout(scrollDebounce);
      scrollDebounce = setTimeout(() => {
        this.queueVisibleDocumentsForPrefetch();
      }, 150);
    }, { passive: true });
  },

  queueVisibleDocumentsForPrefetch: function() {
    const wrapper = document.getElementById("ujTableWrapper");
    if (!wrapper || !this.filteredItems.length) return;

    // Viewport-based document index calculation
    const scrollTop = wrapper.scrollTop;
    const clientHeight = wrapper.clientHeight;
    const rowHeight = 22; // Height of each row in 1C journal
    const visibleStart = Math.max(0, Math.floor(scrollTop / rowHeight) - 1);
    const visibleEnd = Math.min(this.filteredItems.length - 1, Math.ceil((scrollTop + clientHeight) / rowHeight) + 4);

    // Prioritize visible items in front of queue
    for (let i = visibleEnd; i >= visibleStart; i--) {
      const item = this.filteredItems[i];
      if (!item || !item.number) continue;
      const key = `${this.activeDocType}_${item.number}`;
      if (!this.prefetchCache.has(key)) {
        const existingIdx = this.prefetchQueue.findIndex(q => q.key === key);
        if (existingIdx !== -1) {
          const [existing] = this.prefetchQueue.splice(existingIdx, 1);
          this.prefetchQueue.unshift(existing);
        } else {
          this.prefetchQueue.unshift({
            key: key,
            docType: this.activeDocType,
            number: item.number,
            date: item.date || ""
          });
        }
      }
    }

    this.processPrefetchQueue();
  },

  processPrefetchQueue: function() {
    if (this.activePrefetchCount >= this.maxConcurrentPrefetches || !this.prefetchQueue.length) {
      return;
    }

    const task = this.prefetchQueue.shift();
    if (!task || this.prefetchCache.has(task.key)) {
      this.processPrefetchQueue();
      return;
    }

    if (!this.prefetchAbortController) {
      this.prefetchAbortController = new AbortController();
    }
    const signal = this.prefetchAbortController.signal;

    this.activePrefetchCount++;
    const creds = window.SessionManager ? SessionManager.getCredentials() : {};

    let fetchPromise;
    if (task.docType === "УстановкаЦенНоменклатуры") {
      fetchPromise = fetch("/api/documents/price_doc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...creds, number: task.number, date: task.date || "" }),
        signal: signal
      })
      .then(r => r.json())
      .then(res => (res.success && res.data) ? res.data : null);
    } else {
      fetchPromise = fetch("/api/documents/details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...creds, doc_type: task.docType, number: task.number }),
        signal: signal
      })
      .then(r => r.json())
      .then(res => (res.success && res.data) ? res.data : null);
    }

    const cacheEntry = {
      status: "pending",
      promise: fetchPromise,
      data: null,
      timestamp: Date.now()
    };
    this.prefetchCache.set(task.key, cacheEntry);
    if (task.docType === "УстановкаЦенНоменклатуры") {
      this.prefetchCache.set(task.number, cacheEntry);
    }

    fetchPromise
      .then(data => {
        if (data) {
          cacheEntry.status = "ready";
          cacheEntry.data = data;
          console.log(`[PREFETCH READY] ${task.key} prefetched in background`);
        } else {
          this.prefetchCache.delete(task.key);
          this.prefetchCache.delete(task.number);
        }
      })
      .catch(err => {
        if (err.name !== "AbortError") {
          this.prefetchCache.delete(task.key);
          this.prefetchCache.delete(task.number);
        }
      })
      .finally(() => {
        this.activePrefetchCount--;
        setTimeout(() => {
          this.processPrefetchQueue();
        }, 80);
      });
  },

  init: function() {
    // Default period: Current month
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = String(now.getMonth() + 1).padStart(2, "0");
    const lastDay = new Date(curYear, now.getMonth() + 1, 0).getDate();
    this.startDateStr = `01.${curMonth}.${curYear}`;
    this.endDateStr = `${String(lastDay).padStart(2, "0")}.${curMonth}.${curYear}`;
    this.updatePeriodLabel();
  },

  open: function(defaultDocType) {
    if (!this.startDateStr) this.init();
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
      limit: 500
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
      this.columns = data.columns || [];
      this.items = data.items || [];
      this.filteredItems = [...this.items];

      // Update Window Header
      const titleEl = document.getElementById("ujWindowTitle");
      if (titleEl) titleEl.textContent = `Журнал документов: ${this.docTitle}`;

      if (this.currentSortCol) {
        this.applySort();
      }

      this.renderTable();
      this.updateStatus(`Загружено ${this.items.length} документов`);
      this.updateCountBadge(this.items.length);
    })
    .catch(err => {
      if (loadingEl) loadingEl.style.display = "none";
      console.error("Error loading documents:", err);
      this.updateStatus("Ошибка сети при загрузке документов");
    });
  },

  renderTable: function() {
    this.renderTableHead();
    const tbody = document.getElementById("ujTableBody");
    const emptyEl = document.getElementById("ujEmptyState");
    const tableEl = document.getElementById("ujTable");
    if (!tbody) return;

    if (this.filteredItems.length === 0) {
      tbody.innerHTML = "";
      if (emptyEl) emptyEl.style.display = "flex";
      return;
    }

    if (emptyEl) emptyEl.style.display = "none";

    let html = "";
    for (let i = 0; i < this.filteredItems.length; i++) {
      const row = this.filteredItems[i];
      const isSelected = this.selectedRow && this.selectedRow.number === row.number;
      const defaultBg = (i % 2 === 1) ? "#f7f6f0" : "#ffffff";
      const rowBg = isSelected ? "#316ac5" : defaultBg;
      const textColor = isSelected ? "#ffffff" : "#111111";

      // Status icon
      let statusIconHtml = "";
      if (row.deleted) {
        statusIconHtml = `<span title="Помечен на удаление" style="color:#d32f2f; font-weight:bold; font-size:12px;">✕</span>`;
      } else if (row.posted) {
        statusIconHtml = `<span title="Проведен" style="color:#2e7d32; font-weight:bold; font-size:13px;">✔</span>`;
      } else {
        statusIconHtml = `<span title="Не проведен (Черновик)" style="color:#666666; font-size:11px;">📄</span>`;
      }

      html += `<tr class="uj-row" data-row-idx="${i}" style="background: ${rowBg}; color: ${textColor}; height: 21px; cursor: pointer; user-select: none;" onclick="UniversalJournal.selectRow(${i})" ondblclick="UniversalJournal.editSelectedDocument()">`;

      for (let c = 0; c < this.columns.length; c++) {
        const col = this.columns[c];
        const key = col.key;
        let val = row[key];

        if (key === "status") {
          html += `<td style="padding: 2px; text-align: center; border: 1px solid #d4d0c8;">${statusIconHtml}</td>`;
          continue;
        }

        if (key === "amount" && typeof val === "number") {
          val = val.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }

        const align = col.align || "left";
        const cellText = (val !== undefined && val !== null) ? String(val) : "";
        html += `<td style="padding: 2px 6px; text-align: ${align}; border: 1px solid #d4d0c8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${this.escapeHtml(cellText)}</td>`;
      }

      html += `</tr>`;
    }

    tbody.innerHTML = html;
    this.attachScrollPrefetchListener();
    setTimeout(() => {
      this.queueVisibleDocumentsForPrefetch();
    }, 80);
  },

  renderTableHead: function() {
    const headRow = document.getElementById("ujTableHeadRow");
    if (!headRow) return;

    let html = "";
    for (let c = 0; c < this.columns.length; c++) {
      const col = this.columns[c];
      const w = col.width ? `width: ${col.width}px; min-width: ${col.width}px;` : "";
      const isSort = this.currentSortCol === col.key;
      const arrow = isSort ? (this.currentSortAsc ? " ▴" : " ▾") : "";
      const cursor = col.key === "status" ? "" : "cursor: pointer;";

      html += `<th style="${w} padding: 4px 6px; border: 1px solid #b0af9f; text-align: ${col.align || 'left'}; white-space: nowrap; ${cursor}" onclick="UniversalJournal.sortBy('${col.key}')">${this.escapeHtml(col.label)}${arrow}</th>`;
    }

    headRow.innerHTML = html;
  },

  selectRow: function(idx) {
    this.selectedRow = this.filteredItems[idx] || null;
    this.updateEditButtonState();

    // Re-render highlight
    const rows = document.querySelectorAll("#ujTableBody tr");
    rows.forEach((tr, i) => {
      const isSel = (i === idx);
      const defaultBg = (i % 2 === 1) ? "#f7f6f0" : "#ffffff";
      tr.style.background = isSel ? "#316ac5" : defaultBg;
      tr.style.color = isSel ? "#ffffff" : "#111111";
    });

    if (this.selectedRow) {
      this.updateStatus(`Выбран документ: № ${this.selectedRow.number} от ${this.selectedRow.date}`);
    }
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
    const inp = document.getElementById("ujSearchInput");
    const q = inp ? inp.value.trim().toLowerCase() : "";

    const btnClear = document.getElementById("ujBtnClearFind");
    if (btnClear) btnClear.style.opacity = q ? "1" : "0.6";

    if (!q) {
      this.filteredItems = [...this.items];
    } else {
      this.filteredItems = this.items.filter(row => {
        return Object.values(row).some(v => String(v).toLowerCase().includes(q));
      });
    }

    if (this.currentSortCol) this.applySort();
    this.renderTable();
    this.updateCountBadge(this.filteredItems.length);
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
    this.onSearchInput();
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
      badge.textContent = `Всего: ${count.toLocaleString("ru-RU")} документов`;
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
