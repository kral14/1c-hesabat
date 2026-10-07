/**
 * 1C:ENTERPRISE - DOCUMENT AUDIT & CHANGE HISTORY CONTROLLER
 * static/js/audit_journal.js
 */

const AuditJournal = {
  items: [],
  filteredItems: [],
  selectedIndex: -1,
  sortKey: "last_date",
  sortAsc: false,
  activeDocType: "РеализацияТоваровУслуг",
  startDateStr: "",
  endDateStr: "",
  currentDiffData: null,
  selectedVersionIdx: 0,
  activeDiffTab: "diff",

  init: function() {
    if (window.MdiManager) {
      MdiManager.registerWindow("auditJournalWindow", {
        title: "Журнал изменений (Аудит)",
        icon: "🕒",
        closeFn: () => this.close()
      });

      MdiManager.registerWindow("docVersionDiffWindow", {
        title: "История изменений документа",
        icon: "🔎",
        closeFn: () => this.closeDiff()
      });
    }

    // Keyboard navigation
    const win = document.getElementById("auditJournalWindow");
    if (win && !win._hasAuditKeyNav) {
      win._hasAuditKeyNav = true;
      win.addEventListener("keydown", (e) => {
        if (!this.isOpen()) return;
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") {
          if (e.key === "Escape") e.target.blur();
          return;
        }

        if (e.key === "ArrowDown") {
          e.preventDefault();
          this.selectRow(Math.min(this.selectedIndex + 1, this.filteredItems.length - 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          this.selectRow(Math.max(this.selectedIndex - 1, 0));
        } else if (e.key === "Enter") {
          e.preventDefault();
          this.openSelectedDiff();
        } else if (e.key === "F5") {
          e.preventDefault();
          this.loadDocuments();
        }
      });
    }
  },

  isOpen: function() {
    const win = document.getElementById("auditJournalWindow");
    return win && win.style.display !== "none";
  },

  open: function(defaultDocType) {
    if (defaultDocType) {
      this.activeDocType = defaultDocType;
      const sel = document.getElementById("ajDocTypeSelect");
      if (sel) sel.value = defaultDocType;
    }

    const win = document.getElementById("auditJournalWindow");
    if (!win) return;

    win.style.display = "flex";
    if (window.MdiManager) {
      MdiManager.activateWindow("auditJournalWindow");
    }

    // Default to last 30 days if not set
    if (!this.startDateStr && !this.endDateStr) {
      const now = new Date();
      const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      this.startDateStr = `${String(past.getDate()).padStart(2, '0')}.${String(past.getMonth() + 1).padStart(2, '0')}.${past.getFullYear()}`;
      this.endDateStr = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
      this.updatePeriodLabel();
    }

    this.loadDocuments();
  },

  openForDocument: function(docType, docNumber) {
    this.open(docType);
    if (docNumber) {
      setTimeout(() => {
        this.openDiff(docType, docNumber);
      }, 150);
    }
  },

  close: function() {
    const win = document.getElementById("auditJournalWindow");
    if (win) win.style.display = "none";
    if (window.MdiManager) {
      MdiManager.closeWindow("auditJournalWindow");
    }
  },

  setQuickPeriod: function(preset) {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const toStr = (d) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;

    if (preset === "today") {
      this.startDateStr = toStr(now);
      this.endDateStr = toStr(now);
    } else if (preset === "week") {
      const past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      this.startDateStr = toStr(past);
      this.endDateStr = toStr(now);
    } else if (preset === "month") {
      const past = new Date(now.getFullYear(), now.getMonth(), 1);
      this.startDateStr = toStr(past);
      this.endDateStr = toStr(now);
    }
    this.updatePeriodLabel();
    this.loadDocuments();
  },

  openPeriodPicker: function() {
    if (window.PeriodPicker) {
      PeriodPicker.open({
        startDate: this.startDateStr,
        endDate: this.endDateStr,
        onSelect: (sStr, eStr) => {
          this.startDateStr = sStr;
          this.endDateStr = eStr;
          this.updatePeriodLabel();
          this.loadDocuments();
        }
      });
    }
  },

  updatePeriodLabel: function() {
    const lbl = document.getElementById("ajPeriodLabel");
    if (!lbl) return;
    if (this.startDateStr && this.endDateStr) {
      lbl.textContent = `[ ${this.startDateStr} - ${this.endDateStr} ]`;
    } else if (this.startDateStr) {
      lbl.textContent = `[ с ${this.startDateStr} ]`;
    } else if (this.endDateStr) {
      lbl.textContent = `[ по ${this.endDateStr} ]`;
    } else {
      lbl.textContent = "(Весь период)";
    }
  },

  onDocTypeChange: function() {
    const sel = document.getElementById("ajDocTypeSelect");
    if (sel) {
      this.activeDocType = sel.value;
    }
    this.loadDocuments();
  },

  loadDocuments: function() {
    this.setLoading(true);
    const creds = window.SessionManager ? SessionManager.getCredentials() : {};

    const formatDateForBackend = (dStr, isEnd) => {
      if (!dStr) return "";
      const m = dStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
      if (m) {
        return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')} ${isEnd ? '23:59:59' : '00:00:00'}`;
      }
      return dStr;
    };

    const payload = {
      ...creds,
      doc_type: this.activeDocType,
      date_from: formatDateForBackend(this.startDateStr, false),
      date_to: formatDateForBackend(this.endDateStr, true),
      limit: 300
    };

    fetch("/api/audit/list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
    .then(r => r.json())
    .then(data => {
      this.setLoading(false);
      if (!data.success) {
        alert("1C Аудит xətası: " + (data.error || "Məlumat çəkilə bilmədi"));
        return;
      }

      this.items = Array.isArray(data.items) ? data.items : [];
      this.applyFilterAndSort();
    })
    .catch(err => {
      this.setLoading(false);
      console.error("Audit load error:", err);
      alert("Xəta: " + err.message);
    });
  },

  setLoading: function(show) {
    const el = document.getElementById("ajLoadingState");
    if (el) el.style.display = show ? "flex" : "none";
    const status = document.getElementById("ajStatusText");
    if (status) status.textContent = show ? "Загрузка данных из 1С..." : "Готово";
  },

  onSearchInput: function(q) {
    this.applyFilterAndSort();
  },

  applyFilterAndSort: function() {
    const searchInp = document.getElementById("ajSearchInput");
    const q = searchInp ? searchInp.value.trim().toLowerCase() : "";

    let list = this.items.slice();
    if (q) {
      list = list.filter(it => {
        return (
          String(it.number || "").toLowerCase().includes(q) ||
          String(it.kontragent || "").toLowerCase().includes(q) ||
          String(it.last_author || "").toLowerCase().includes(q) ||
          String(it.doc_type_title || "").toLowerCase().includes(q)
        );
      });
    }

    // Sort
    list.sort((a, b) => {
      let valA = a[this.sortKey];
      let valB = b[this.sortKey];
      if (valA === undefined || valA === null) valA = "";
      if (valB === undefined || valB === null) valB = "";

      if (typeof valA === "number" && typeof valB === "number") {
        return this.sortAsc ? (valA - valB) : (valB - valA);
      }
      valA = String(valA).toLowerCase();
      valB = String(valB).toLowerCase();
      if (valA < valB) return this.sortAsc ? -1 : 1;
      if (valA > valB) return this.sortAsc ? 1 : -1;
      return 0;
    });

    this.filteredItems = list;
    this.selectedIndex = this.filteredItems.length > 0 ? 0 : -1;
    this.render();
  },

  sortBy: function(key) {
    if (this.sortKey === key) {
      this.sortAsc = !this.sortAsc;
    } else {
      this.sortKey = key;
      this.sortAsc = false;
    }
    this.applyFilterAndSort();
  },

  render: function() {
    const tbody = document.getElementById("ajTableBody");
    const emptyState = document.getElementById("ajEmptyState");
    const countBadge = document.getElementById("ajCountBadge");

    if (countBadge) {
      countBadge.textContent = `Всего документов: ${this.filteredItems.length}`;
    }

    if (!tbody) return;

    if (this.filteredItems.length === 0) {
      tbody.innerHTML = "";
      if (emptyState) emptyState.style.display = "block";
      return;
    }

    if (emptyState) emptyState.style.display = "none";

    let html = "";
    this.filteredItems.forEach((item, i) => {
      const isSelected = (i === this.selectedIndex);
      const rowBg = isSelected ? "#316ac5" : (i % 2 === 1 ? "#f9f8f4" : "#ffffff");
      const textColor = isSelected ? "#ffffff" : "#111111";

      let statusIcon = "";
      if (item.deleted) {
        statusIcon = `<span title="Помечен на удаление" style="color:#d32f2f; font-weight:bold;">✕</span>`;
      } else if (item.posted) {
        statusIcon = `<span title="Проведен" style="color:#2e7d32; font-weight:bold;">✔</span>`;
      } else {
        statusIcon = `<span title="Не проведен (Черновик)" style="color:#888;">📄</span>`;
      }

      const amtFormatted = Number(item.amount || 0).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const versionBadge = `<span style="background:${isSelected ? '#204d88' : '#e0dfd5'}; color:${isSelected ? '#fff' : '#002060'}; font-weight:bold; padding:1px 5px; border-radius:3px; font-size:10px;">v${item.last_version}</span>`;

      html += `
        <tr class="aj-row" data-idx="${i}"
            style="background: ${rowBg}; color: ${textColor}; height: 21px; cursor: pointer; user-select: text;"
            onclick="AuditJournal.selectRow(${i})"
            ondblclick="AuditJournal.openSelectedDiff()">
          <td style="text-align: center; border: 1px solid #d4d0c8; padding: 2px 4px;">${i + 1}</td>
          <td style="text-align: center; border: 1px solid #d4d0c8; padding: 2px 2px;">${statusIcon}</td>
          <td style="border: 1px solid #d4d0c8; padding: 2px 6px; font-weight: bold; white-space: nowrap;">${this.escapeHtml(item.last_date)}</td>
          <td style="border: 1px solid #d4d0c8; padding: 2px 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${this.escapeHtml(item.doc_type_title)}</td>
          <td style="border: 1px solid #d4d0c8; padding: 2px 6px; font-weight: bold; ${isSelected ? '' : 'color: #002060;'}; white-space: nowrap;">${this.escapeHtml(item.number)}</td>
          <td style="border: 1px solid #d4d0c8; padding: 2px 6px; white-space: nowrap;">${this.escapeHtml(item.date)}</td>
          <td style="border: 1px solid #d4d0c8; padding: 2px 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${this.escapeHtml(item.kontragent)}">${this.escapeHtml(item.kontragent || "-")}</td>
          <td style="border: 1px solid #d4d0c8; padding: 2px 6px; text-align: right; font-weight: bold; white-space: nowrap;">${amtFormatted}</td>
          <td style="border: 1px solid #d4d0c8; padding: 2px 6px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">👤 ${this.escapeHtml(item.last_author)}</td>
          <td style="border: 1px solid #d4d0c8; padding: 2px 6px; text-align: center; white-space: nowrap;">${this.escapeHtml(item.last_operation)}</td>
          <td style="border: 1px solid #d4d0c8; padding: 2px 6px; text-align: center; white-space: nowrap;">${versionBadge}</td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  },

  selectRow: function(idx) {
    if (idx < 0 || idx >= this.filteredItems.length) return;
    this.selectedIndex = idx;

    const rows = document.querySelectorAll("#ajTableBody tr");
    rows.forEach((r, i) => {
      const isSel = (i === idx);
      r.style.background = isSel ? "#316ac5" : (i % 2 === 1 ? "#f9f8f4" : "#ffffff");
      r.style.color = isSel ? "#ffffff" : "#111111";
      const numCell = r.children[4];
      if (numCell) numCell.style.color = isSel ? "#ffffff" : "#002060";
    });
  },

  openSelectedDiff: function() {
    if (this.selectedIndex < 0 || this.selectedIndex >= this.filteredItems.length) {
      alert("Выберите документ из списка для просмотра истории!");
      return;
    }
    const item = this.filteredItems[this.selectedIndex];
    this.openDiff(item.doc_type, item.number);
  },

  openSelectedDoc: function() {
    if (this.selectedIndex < 0 || this.selectedIndex >= this.filteredItems.length) {
      alert("Выберите документ для открытия!");
      return;
    }
    const item = this.filteredItems[this.selectedIndex];
    this.openRealDoc(item.doc_type, item.number, item.date);
  },

  openRealDoc: function(docType, docNumber, docDate) {
    if (docType === "ПогрузкиМашин" && window.PogruzkaDocEditor) {
      PogruzkaDocEditor.open(docNumber, docDate);
    } else if (window.SalesDocEditor) {
      SalesDocEditor.open(docNumber);
    }
  },

  openDiff: function(docType, docNumber) {
    if (!docNumber) return;
    const win = document.getElementById("docVersionDiffWindow");
    if (!win) return;

    win.style.display = "flex";
    if (window.MdiManager) {
      MdiManager.activateWindow("docVersionDiffWindow");
    }

    const heading = document.getElementById("dvdDocHeading");
    if (heading) heading.textContent = `Загрузка версий: № ${docNumber}...`;

    const creds = window.SessionManager ? SessionManager.getCredentials() : {};
    fetch("/api/audit/details", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...creds,
        doc_type: docType,
        number: docNumber
      })
    })
    .then(r => r.json())
    .then(data => {
      if (!data.success) {
        alert("1C Аудит xətası: " + (data.error || "Versiyalar tapılmadı"));
        return;
      }
      this.populateDiffWindow(data);
    })
    .catch(err => {
      console.error("Diff details error:", err);
      alert("Xəta: " + err.message);
    });
  },

  closeDiff: function() {
    const win = document.getElementById("docVersionDiffWindow");
    if (win) win.style.display = "none";
    if (window.MdiManager) {
      MdiManager.closeWindow("docVersionDiffWindow");
    }
  },

  openDocFromDiff: function() {
    if (!this.currentDiffData) return;
    this.openRealDoc(this.currentDiffData.doc_type, this.currentDiffData.number, this.currentDiffData.date);
  },

  populateDiffWindow: function(data) {
    this.currentDiffData = data;
    this.selectedVersionIdx = (data.versions && data.versions.length > 0) ? (data.versions.length - 1) : 0;

    // Heading
    const heading = document.getElementById("dvdDocHeading");
    if (heading) heading.textContent = `${data.doc_type} № ${data.number}`;
    const subheading = document.getElementById("dvdDocSubheading");
    if (subheading) subheading.textContent = `от ${data.date} (Всего версий в 1С: ${data.total_versions})`;

    // Title
    const title = document.getElementById("dvdWindowTitle");
    if (title) title.textContent = `История: ${data.doc_type} № ${data.number}`;
    if (window.MdiManager) {
      MdiManager.setWindowTitle("docVersionDiffWindow", `История: № ${data.number}`);
    }

    // Status badge of latest version
    const badge = document.getElementById("dvdStatusBadge");
    const latestV = (data.versions && data.versions.length > 0) ? data.versions[data.versions.length - 1] : null;
    if (badge && latestV) {
      if (latestV.deleted) {
        badge.textContent = "✕ ПОМЕЧЕН НА УДАЛЕНИЕ";
        badge.style.background = "#d32f2f";
      } else if (latestV.posted) {
        badge.textContent = "✔ ПРОВЕДЕН";
        badge.style.background = "#2e7d32";
      } else {
        badge.textContent = "📄 НЕ ПРОВЕДЕН (ЧЕРНОВИК)";
        badge.style.background = "#ed6c02";
      }
    }

    // Version Count badge
    const vBadge = document.getElementById("dvdVersionCountBadge");
    if (vBadge) vBadge.textContent = String(data.total_versions);

    // Render Version Tree (Left Panel)
    this.renderVersionTree();

    // Render Event Log List (Left Bottom)
    this.renderEventLogList();

    // Render Diff of Selected Version (Right Panel)
    this.renderSelectedVersionDiff();
  },

  renderVersionTree: function() {
    const listEl = document.getElementById("dvdVersionList");
    if (!listEl || !this.currentDiffData) return;

    const vers = this.currentDiffData.versions || [];
    let html = "";
    vers.forEach((v, idx) => {
      const isSel = (idx === this.selectedVersionIdx);
      const isInitial = (idx === 0);
      const isLatest = (idx === vers.length - 1);

      let tagLabel = "";
      if (isLatest) tagLabel = `<span style="background:#2e7d32; color:#fff; font-size:9px; padding:1px 4px; border-radius:2px; margin-left:4px;">Текущая</span>`;
      else if (isInitial) tagLabel = `<span style="background:#002060; color:#fff; font-size:9px; padding:1px 4px; border-radius:2px; margin-left:4px;">Изначальная</span>`;

      html += `
        <div onclick="AuditJournal.selectVersion(${idx})" style="padding: 6px 8px; margin-bottom: 3px; border-radius: 3px; cursor: pointer; border: 1px solid ${isSel ? '#316ac5' : '#dcd9cc'}; background: ${isSel ? '#eef3fb' : '#ffffff'}; transition: all 0.15s;">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <span style="font-weight: bold; color: ${isSel ? '#002060' : '#111'}; font-size: 11px;">Версия ${v.version}</span>
            <div>${tagLabel}</div>
          </div>
          <div style="color: #666; font-size: 10px; margin-top: 2px;">🕒 ${this.escapeHtml(v.date)}</div>
          <div style="font-size: 10px; color: #222; margin-top: 2px; font-weight: 500;">👤 Автор: <span style="color:#004080;">${this.escapeHtml(v.author)}</span></div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 3px; font-size: 10px;">
            <span style="color: ${v.posted ? '#2e7d32' : '#ed6c02'}; font-weight: bold;">${v.posted ? '✔ Проведен' : '📄 Черновик'}</span>
            <span style="font-weight: bold; color: #111;">${Number(v.amount || 0).toFixed(2)} AZN</span>
          </div>
        </div>
      `;
    });

    listEl.innerHTML = html;
  },

  renderEventLogList: function() {
    const el = document.getElementById("dvdEventLogList");
    if (!el || !this.currentDiffData) return;

    const events = this.currentDiffData.event_timeline || [];
    if (events.length === 0) {
      el.innerHTML = `<div style="color:#999; text-align:center; padding:15px;">События проведения не зафиксированы</div>`;
      return;
    }

    let html = "";
    events.forEach(ev => {
      html += `
        <div style="padding: 3px 4px; border-bottom: 1px dotted #ccc; margin-bottom: 2px;">
          <div style="font-weight: bold; color: #002060;">${this.escapeHtml(ev.title)}</div>
          <div style="display: flex; justify-content: space-between; color: #666;">
            <span>👤 ${this.escapeHtml(ev.user)}</span>
            <span>${this.escapeHtml(ev.date)}</span>
          </div>
        </div>
      `;
    });
    el.innerHTML = html;
  },

  selectVersion: function(idx) {
    this.selectedVersionIdx = idx;
    this.renderVersionTree();
    this.renderSelectedVersionDiff();
  },

  switchDiffTab: function(tabName) {
    this.activeDiffTab = tabName;
    const tDiff = document.getElementById("dvdTabDiff");
    const tItems = document.getElementById("dvdTabItems");
    const tRaw = document.getElementById("dvdTabRaw");
    const bDiff = document.getElementById("dvdTabDiffBtn");
    const bItems = document.getElementById("dvdTabItemsBtn");
    const bRaw = document.getElementById("dvdTabRawBtn");

    if (tDiff) tDiff.style.display = (tabName === "diff") ? "flex" : "none";
    if (tItems) tItems.style.display = (tabName === "items") ? "flex" : "none";
    if (tRaw) tRaw.style.display = (tabName === "raw") ? "block" : "none";

    const setBtnActive = (btn, act) => {
      if (!btn) return;
      btn.style.background = act ? "#ffffff" : "#dcd9cc";
      btn.style.fontWeight = act ? "bold" : "normal";
      btn.style.borderBottom = act ? "none" : "1px solid #7f9db9";
    };

    setBtnActive(bDiff, tabName === "diff");
    setBtnActive(bItems, tabName === "items");
    setBtnActive(bRaw, tabName === "raw");
  },

  renderSelectedVersionDiff: function() {
    if (!this.currentDiffData) return;
    const vers = this.currentDiffData.versions || [];
    const v = vers[this.selectedVersionIdx];
    if (!v) return;

    // Header card info
    const titleEl = document.getElementById("dvdSelectedVersionTitle");
    if (titleEl) titleEl.textContent = `Версия № ${v.version} — ${v.operation || 'Изменение'}`;
    const dateEl = document.getElementById("dvdSelectedVersionDate");
    if (dateEl) dateEl.textContent = `(Сохранено: ${v.date})`;
    const authorEl = document.getElementById("dvdSelectedVersionAuthor");
    if (authorEl) authorEl.textContent = v.author;

    // Badges
    const fDiffBadge = document.getElementById("dvdFieldDiffBadge");
    if (fDiffBadge) fDiffBadge.textContent = String((v.field_diffs || []).length);

    const totalItemChanges = (v.item_diffs?.added?.length || 0) + (v.item_diffs?.removed?.length || 0) + (v.item_diffs?.modified?.length || 0);
    const iDiffBadge = document.getElementById("dvdItemsDiffBadge");
    if (iDiffBadge) iDiffBadge.textContent = String(totalItemChanges);

    // 1. Tab 1: Field Diffs Table
    const fTbody = document.getElementById("dvdFieldDiffTableBody");
    const fNotice = document.getElementById("dvdNoFieldDiffNotice");
    if (fTbody) {
      if (!v.field_diffs || v.field_diffs.length === 0) {
        fTbody.innerHTML = "";
        if (fNotice) fNotice.style.display = "block";
      } else {
        if (fNotice) fNotice.style.display = "none";
        let fHtml = "";
        v.field_diffs.forEach(fd => {
          let diffColor = "#111";
          let diffSign = "";
          if (fd.diff !== undefined) {
            diffColor = fd.diff > 0 ? "#2e7d32" : "#d32f2f";
            diffSign = fd.diff > 0 ? `+${fd.diff.toFixed(2)} AZN` : `${fd.diff.toFixed(2)} AZN`;
          }

          fHtml += `
            <tr style="height: 22px; border-bottom: 1px solid #e0dfd5;">
              <td style="border: 1px solid #d4d0c8; padding: 3px 8px; font-weight: bold; color: #002060;">${this.escapeHtml(fd.label || fd.field)}</td>
              <td style="border: 1px solid #d4d0c8; padding: 3px 8px; color: #666; background: #fafafa;">${this.escapeHtml(fd.old_val)}</td>
              <td style="border: 1px solid #d4d0c8; padding: 3px 8px; font-weight: bold; color: #111; background: #fffbe6;">${this.escapeHtml(fd.new_val)}</td>
              <td style="border: 1px solid #d4d0c8; padding: 3px 8px; text-align: right; font-weight: bold; color: ${diffColor};">${diffSign || '—'}</td>
            </tr>
          `;
        });
        fTbody.innerHTML = fHtml;
      }
    }

    // 2. Tab 2: Items Diff Table
    const iTbody = document.getElementById("dvdItemsDiffTableBody");
    const iNotice = document.getElementById("dvdNoItemsDiffNotice");
    const addCount = document.getElementById("dvdAddedItemsCount");
    const remCount = document.getElementById("dvdRemovedItemsCount");
    const modCount = document.getElementById("dvdModifiedItemsCount");

    const diffs = v.item_diffs || { added: [], removed: [], modified: [] };
    if (addCount) addCount.textContent = `+${diffs.added.length} добавлено`;
    if (remCount) remCount.textContent = `-${diffs.removed.length} удалено`;
    if (modCount) modCount.textContent = `~${diffs.modified.length} изменено`;

    if (iTbody) {
      if (totalItemChanges === 0) {
        iTbody.innerHTML = "";
        if (iNotice) iNotice.style.display = "block";
      } else {
        if (iNotice) iNotice.style.display = "none";
        let iHtml = "";

        // Added items (Green)
        diffs.added.forEach(it => {
          iHtml += `
            <tr style="background: #e8f5e9; height: 21px; border-bottom: 1px solid #c8e6c9;">
              <td style="text-align: center; border: 1px solid #c8e6c9; color: #2e7d32; font-weight: bold;">+</td>
              <td style="border: 1px solid #c8e6c9; padding: 2px 6px;">${this.escapeHtml(it.code || it.article || '-')}</td>
              <td style="border: 1px solid #c8e6c9; padding: 2px 6px; font-weight: bold; color: #1b5e20;">${this.escapeHtml(it.name)}</td>
              <td style="border: 1px solid #c8e6c9; padding: 2px 6px; text-align: right; font-weight: bold;">+${it.qty}</td>
              <td style="border: 1px solid #c8e6c9; padding: 2px 6px; text-align: right;">${Number(it.price || 0).toFixed(2)}</td>
              <td style="border: 1px solid #c8e6c9; padding: 2px 6px; text-align: right; font-weight: bold; color: #1b5e20;">+${Number(it.total || 0).toFixed(2)}</td>
            </tr>
          `;
        });

        // Removed items (Red)
        diffs.removed.forEach(it => {
          iHtml += `
            <tr style="background: #ffebee; height: 21px; border-bottom: 1px solid #ffcdd2;">
              <td style="text-align: center; border: 1px solid #ffcdd2; color: #c62828; font-weight: bold;">-</td>
              <td style="border: 1px solid #ffcdd2; padding: 2px 6px; text-decoration: line-through;">${this.escapeHtml(it.code || it.article || '-')}</td>
              <td style="border: 1px solid #ffcdd2; padding: 2px 6px; text-decoration: line-through; color: #b71c1c;">${this.escapeHtml(it.name)}</td>
              <td style="border: 1px solid #ffcdd2; padding: 2px 6px; text-align: right; color: #b71c1c;">-${it.qty}</td>
              <td style="border: 1px solid #ffcdd2; padding: 2px 6px; text-align: right;">${Number(it.price || 0).toFixed(2)}</td>
              <td style="border: 1px solid #ffcdd2; padding: 2px 6px; text-align: right; color: #b71c1c;">-${Number(it.total || 0).toFixed(2)}</td>
            </tr>
          `;
        });

        // Modified items (Yellow / Orange)
        diffs.modified.forEach(it => {
          const qtyChange = `${it.old_qty} ➔ ${it.new_qty}`;
          const sumDiff = it.new_total - it.old_total;
          const sumDiffStr = sumDiff > 0 ? `(+${sumDiff.toFixed(2)})` : `(${sumDiff.toFixed(2)})`;

          iHtml += `
            <tr style="background: #fffde7; height: 21px; border-bottom: 1px solid #fff59d;">
              <td style="text-align: center; border: 1px solid #fff59d; color: #f57f17; font-weight: bold;">~</td>
              <td style="border: 1px solid #fff59d; padding: 2px 6px;">${this.escapeHtml(it.code || '-')}</td>
              <td style="border: 1px solid #fff59d; padding: 2px 6px; font-weight: bold;">${this.escapeHtml(it.name)}</td>
              <td style="border: 1px solid #fff59d; padding: 2px 6px; text-align: right; font-weight: bold; color: #002060;">${qtyChange}</td>
              <td style="border: 1px solid #fff59d; padding: 2px 6px; text-align: right;">${Number(it.new_price || 0).toFixed(2)}</td>
              <td style="border: 1px solid #fff59d; padding: 2px 6px; text-align: right; font-weight: bold;">${Number(it.new_total || 0).toFixed(2)} <span style="font-size:10px; color:${sumDiff >= 0 ? '#2e7d32' : '#c62828'};">${sumDiffStr}</span></td>
            </tr>
          `;
        });

        iTbody.innerHTML = iHtml;
      }
    }

    // 3. Tab 3: Raw Snapshot of this version
    const rawTbody = document.getElementById("dvdRawTableBody");
    const rawVersions = this.currentDiffData.raw_versions || [];
    const curRaw = rawVersions[this.selectedVersionIdx];
    if (rawTbody && curRaw) {
      let rHtml = "";
      const rItems = curRaw.items || [];
      rItems.forEach((it, idx) => {
        rHtml += `
          <tr style="height: 20px; border-bottom: 1px solid #e0dfd5; ${idx % 2 === 1 ? 'background:#fbfbfb;' : ''}">
            <td style="text-align: center; border: 1px solid #d4d0c8; padding: 2px 4px;">${idx + 1}</td>
            <td style="border: 1px solid #d4d0c8; padding: 2px 6px;">${this.escapeHtml(it.code || it.article || '-')}</td>
            <td style="border: 1px solid #d4d0c8; padding: 2px 6px;">${this.escapeHtml(it.name)}</td>
            <td style="border: 1px solid #d4d0c8; padding: 2px 6px; text-align: right; font-weight: bold;">${it.qty}</td>
            <td style="border: 1px solid #d4d0c8; padding: 2px 6px; text-align: right;">${Number(it.price || 0).toFixed(2)}</td>
            <td style="border: 1px solid #d4d0c8; padding: 2px 6px; text-align: right; font-weight: bold;">${Number(it.total || 0).toFixed(2)}</td>
          </tr>
        `;
      });
      rawTbody.innerHTML = rHtml;
    }
  },

  printDiffHistory: function() {
    if (!this.currentDiffData) return;
    const d = this.currentDiffData;
    const vers = d.versions || [];

    const printWin = window.open("", "_blank");
    if (!printWin) {
      alert("Разрешите всплывающие окна для печати!");
      return;
    }

    let versionsHtml = "";
    vers.forEach(v => {
      let fList = "";
      (v.field_diffs || []).forEach(f => {
        fList += `<li><strong>${f.label}:</strong> ${f.old_val} ➔ <span style="color:#004080;">${f.new_val}</span></li>`;
      });

      versionsHtml += `
        <div style="border-bottom: 1px solid #ccc; padding: 10px 0; margin-bottom: 10px;">
          <h3 style="margin: 0 0 5px 0;">Версия ${v.version} — ${v.operation}</h3>
          <div><strong>Дата:</strong> ${v.date} | <strong>Автор:</strong> ${v.author} | <strong>Сумма:</strong> ${v.amount.toFixed(2)} AZN</div>
          ${fList ? `<ul style="margin: 6px 0 0 20px;">${fList}</ul>` : '<div style="font-style:italic; color:#777; margin-top:4px;">Реквизиты не менялись</div>'}
        </div>
      `;
    });

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>История изменений: ${d.doc_type} № ${d.number}</title>
        <style>
          body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; color: #000; }
          h2 { margin: 0 0 10px 0; }
        </style>
      </head>
      <body>
        <button onclick="window.print()" style="margin-bottom: 15px; padding: 6px 15px; font-weight: bold; background: #004080; color: #fff; border: none; cursor: pointer;">Печать</button>
        <h2>Отчет об истории изменений документа</h2>
        <div><strong>Вид документа:</strong> ${d.doc_type} | <strong>Номер:</strong> ${d.number} | <strong>Дата:</strong> ${d.date}</div>
        <hr style="margin: 15px 0;" />
        ${versionsHtml}
      </body>
      </html>
    `);
    printWin.document.close();
  },

  escapeHtml: function(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
};

window.AuditJournal = AuditJournal;
