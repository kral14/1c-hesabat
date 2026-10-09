/**
 * 1C:ENTERPRISE - ADVANCED DOCUMENT AUDIT & CHANGE HISTORY CONTROLLER
 * static/js/audit_journal.js
 * Full-Width Document Journal with Modal Protocol Windows
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
  activeTab: "diff",
  _currentAbortCtrl: null,

  init: function() {
    ["auditJournalWindow", "docVersionDiffWindow"].forEach(id => {
      const win = document.getElementById(id);
      if (win) {
        win.style.display = "none";
        win.classList.add("minimized");
        win.classList.remove("active");
      }
    });

    if (window.MdiManager) {
      MdiManager.registerWindow("auditJournalWindow", {
        title: "Audit Jurnalı (Dəyişikliklər)",
        icon: "🕒",
        isDefault: true,
        startHidden: true,
        closeFn: () => this.close()
      });

      // Backward compatibility stub for old diff window
      MdiManager.registerWindow("docVersionDiffWindow", {
        title: "Sənədin Dəyişiklik Tarixçəsi",
        icon: "🔎",
        isDefault: true,
        startHidden: true,
        closeFn: () => this.closeDiff()
      });
    }

    // Keyboard navigation: Up / Down arrow keys navigate documents
    const win = document.getElementById("auditJournalWindow");
    if (win && !win._hasAuditKeyNav) {
      win._hasAuditKeyNav = true;
      win.addEventListener("keydown", (e) => {
        if (!this.isOpen()) return;
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();

          if (typeof this.hideDiffPopover === "function") {
            this.hideDiffPopover();
          }

          // 1. Level 2 modal (Document Version Snapshot Modal)
          const docModal = document.getElementById("docViewModalBackdrop");
          if (docModal && (docModal.style.display === "flex" || docModal.style.display === "block" || (docModal.offsetWidth > 0 && docModal.style.display !== "none"))) {
            this.closeDocViewModal();
            return;
          }

          // 2. Level 1 modal (Audit Protocol Modal)
          const auditModal = document.getElementById("auditModalBackdrop");
          if (auditModal && (auditModal.style.display === "flex" || auditModal.style.display === "block" || (auditModal.offsetWidth > 0 && auditModal.style.display !== "none"))) {
            this.closeAuditModal();
            return;
          }

          // 3. Only if no sub-modals are open, close the main audit journal window
          this.close();
          return;
        }

        if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA")) {
          return;
        }

        if (e.key === "ArrowDown") {
          e.preventDefault();
          if (this.selectedIndex < this.filteredItems.length - 1) {
            this.selectRow(this.selectedIndex + 1);
            this.scrollSelectedIntoView();
          }
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          if (this.selectedIndex > 0) {
            this.selectRow(this.selectedIndex - 1);
            this.scrollSelectedIntoView();
          }
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (this.selectedIndex >= 0) {
            this.openAuditForIndex(this.selectedIndex);
          }
        } else if (e.key === "F5") {
          e.preventDefault();
          e.stopPropagation();
          const docModal = document.getElementById("docViewModalBackdrop");
          const auditModal = document.getElementById("auditModalBackdrop");
          if ((docModal && docModal.style.display !== "none" && !docModal.classList.contains("minimized")) ||
              (auditModal && auditModal.style.display !== "none" && !auditModal.classList.contains("minimized"))) {
            if (this.selectedIndex >= 0 && this.filteredItems[this.selectedIndex]) {
              const doc = this.filteredItems[this.selectedIndex];
              this.loadDiff(doc.doc_type, doc.number);
              return;
            }
          }
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
    if (defaultDocType !== undefined) {
      this.activeDocType = defaultDocType;
      const sel = document.getElementById("ajDocTypeSelect");
      if (sel) sel.value = defaultDocType;
    }

    const win = document.getElementById("auditJournalWindow");
    if (!win) return;

    win.style.display = "flex";
    win.classList.remove("minimized");
    if (window.MdiManager) {
      MdiManager.activateWindow("auditJournalWindow");
    }

    // Default to last 30 days if not set
    if (!this.startDateStr && !this.endDateStr) {
      const now = new Date();
      const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const pad = (n) => String(n).padStart(2, '0');
      this.startDateStr = `${pad(past.getDate())}.${pad(past.getMonth() + 1)}.${past.getFullYear()}`;
      this.endDateStr = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`;
      this.updatePeriodLabel();
    }

    this.loadDocuments();
  },

  isOpenAuditModal: function() {
    const modal = document.getElementById("auditModalBackdrop");
    return modal && modal.style.display !== "none";
  },

  openForDocument: function(docType, docNumber, docObj) {
    this.open(docType);

    let doc = docObj;
    if (!doc && this.filteredItems && this.filteredItems.length > 0) {
      doc = this.filteredItems.find(it => String(it.number || "").trim() === String(docNumber).trim());
    }
    if (!doc) {
      doc = {
        number: docNumber,
        doc_type: docType,
        date: '—',
        kontragent: '—',
        warehouse: '—',
        amount: 0
      };
    }

    // Immediately open the Audit Modal window for this document!
    this.openAuditModalForDoc(doc);

    // In background, if document is already in the list, select and scroll to it
    if (this.filteredItems && this.filteredItems.length > 0) {
      const idx = this.filteredItems.findIndex(it => String(it.number || "").trim() === String(docNumber).trim());
      if (idx !== -1) {
        this.selectRow(idx);
        this.scrollSelectedIntoView();
      }
    } else {
      this._pendingSelectDocNumber = docNumber;
    }
  },

  // Backward compatibility alias for openForDocument / openSelectedDiff
  openDiff: function(docType, docNumber) {
    this.openForDocument(docType, docNumber);
  },

  closeDiff: function() {
    const diffWin = document.getElementById("docVersionDiffWindow");
    if (diffWin) diffWin.style.display = "none";
  },

  close: function() {
    this.hideDiffPopover();
    const docModal = document.getElementById("docViewModalBackdrop");
    if (docModal && docModal.style.display !== "none") {
      this.closeDocViewModal();
      return;
    }
    const auditModal = document.getElementById("auditModalBackdrop");
    if (auditModal && auditModal.style.display !== "none") {
      this.closeAuditModal();
      return;
    }
    const win = document.getElementById("auditJournalWindow");
    if (win) win.style.display = "none";
    if (window.MdiManager) {
      MdiManager.closeWindow("auditJournalWindow");
    }
  },

  onDocTypeChange: function() {
    const sel = document.getElementById("ajDocTypeSelect");
    this.activeDocType = sel ? sel.value : "";
    this.loadDocuments();
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
    } else if (preset === "all") {
      this.startDateStr = "";
      this.endDateStr = "";
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
    const el = document.getElementById("ajPeriodLabel");
    if (!el) return;
    if (!this.startDateStr && !this.endDateStr) {
      el.textContent = "(Bütün dövr)";
    } else if (this.startDateStr && this.endDateStr) {
      el.textContent = `${this.startDateStr} — ${this.endDateStr}`;
    } else {
      el.textContent = this.startDateStr || this.endDateStr;
    }
  },

  loadDocuments: function() {
    this.setLoading(true);

    const creds = window.SessionManager ? SessionManager.getCredentials() : {};
    const formatDateForBackend = (dStr, isEnd) => {
      if (!dStr) return "";
      const m = dStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
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
        console.warn("Audit list response warning:", data.error);
      }

      this.items = Array.isArray(data.items) ? data.items : [];
      this.applyFilterAndSort();

      // Automatically select item if pending or first available
      if (this._pendingSelectDocNumber) {
        const pIdx = this.filteredItems.findIndex(it => String(it.number || "").trim() === String(this._pendingSelectDocNumber).trim());
        if (pIdx !== -1) {
          this.selectRow(pIdx);
          this.scrollSelectedIntoView();
        }
        this._pendingSelectDocNumber = null;
      } else if (this.filteredItems.length > 0 && !this.isOpenAuditModal() && this.selectedIndex < 0) {
        this.selectRow(0);
      }
    })
    .catch(err => {
      this.setLoading(false);
      console.error("Audit load error:", err);
      this.items = [];
      this.applyFilterAndSort();
    });
  },

  setLoading: function(show) {
    const el = document.getElementById("ajLoadingState");
    if (el) el.style.display = show ? "flex" : "none";
    const status = document.getElementById("ajListStatusText");
    if (status) status.textContent = show ? "1C məlumatları yüklənir..." : "Hazırdır";
  },

  onSearchInput: function(q) {
    const clearBtn = document.getElementById("ajClearSearchBtn");
    if (clearBtn) clearBtn.style.display = q ? "inline" : "none";
    this.applyFilterAndSort();
  },

  clearSearch: function() {
    const inp = document.getElementById("ajSearchInput");
    if (inp) inp.value = "";
    this.onSearchInput("");
  },

  applyFilterAndSort: function() {
    const searchInp = document.getElementById("ajSearchInput");
    const q = searchInp ? searchInp.value.trim().toLowerCase() : "";
    const filterSelect = document.getElementById("ajFilterModeSelect");
    const filterMode = filterSelect ? filterSelect.value : "all";

    let list = this.items.slice();

    // Mode filter
    if (filterMode === "modified_only") {
      list = list.filter(it => (it.version_count || 1) > 1);
    } else if (filterMode === "posted_only") {
      list = list.filter(it => it.posted);
    } else if (filterMode === "draft_only") {
      list = list.filter(it => !it.posted && !it.deleted);
    }

    // Text search filter
    if (q) {
      list = list.filter(it => {
        return (
          String(it.number || "").toLowerCase().includes(q) ||
          String(it.kontragent || "").toLowerCase().includes(q) ||
          String(it.last_author || "").toLowerCase().includes(q) ||
          String(it.doc_type_title || "").toLowerCase().includes(q) ||
          String(it.comment || "").toLowerCase().includes(q)
        );
      });
    }

    // Sorting
    list.sort((a, b) => {
      let valA = a[this.sortKey];
      let valB = b[this.sortKey];
      if (valA === undefined || valA === null) valA = "";
      if (valB === undefined || valB === null) valB = "";

      if (typeof valA === "number" && typeof valB === "number") {
        return this.sortAsc ? valA - valB : valB - valA;
      }

      // Date sorting
      if (this.sortKey === "last_date" || this.sortKey === "date") {
        const parseD = (s) => {
          const m = String(s).match(/(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/);
          if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]||'00'}:${m[5]||'00'}:${m[6]||'00'}`).getTime();
          return 0;
        };
        const dtA = parseD(valA);
        const dtB = parseD(valB);
        return this.sortAsc ? dtA - dtB : dtB - dtA;
      }

      valA = String(valA).toLowerCase();
      valB = String(valB).toLowerCase();
      if (valA < valB) return this.sortAsc ? -1 : 1;
      if (valA > valB) return this.sortAsc ? 1 : -1;
      return 0;
    });

    this.filteredItems = list;
    this.renderList();
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

  renderList: function() {
    const tbody = document.getElementById("ajTableBody");
    const emptyEl = document.getElementById("ajEmptyState");
    const badge = document.getElementById("ajListCountBadge");
    const totalCountBadge = document.getElementById("ajCountBadge");

    if (badge) badge.textContent = String(this.filteredItems.length);
    if (totalCountBadge) totalCountBadge.textContent = `Ümumi sənədlər: ${this.filteredItems.length}`;

    if (!tbody) return;

    if (this.filteredItems.length === 0) {
      tbody.innerHTML = "";
      if (emptyEl) emptyEl.style.display = "block";
      this.selectedIndex = -1;
      return;
    }

    if (emptyEl) emptyEl.style.display = "none";

    let html = "";
    this.filteredItems.forEach((doc, idx) => {
      const isSelected = (idx === this.selectedIndex);
      const bg = isSelected ? "#316ac5" : (idx % 2 === 1 ? "#f9f8f4" : "#ffffff");
      const fg = isSelected ? "#ffffff" : "#111111";

      // Status icon
      let statusIcon = "📄";
      let statusTitle = "Qaralama (Təsdiqlənməyib)";
      if (doc.deleted) {
        statusIcon = "❌";
        statusTitle = "Pozulma nişanı qoyulub (Silinib)";
      } else if (doc.posted) {
        statusIcon = "✔";
        statusTitle = "Təsdiqlənib (Provodka edilib)";
      }

      // Operation Badge
      const isMultiVersion = (doc.version_count || 1) > 1;
      let opBadge = "";
      if (isMultiVersion) {
        opBadge = `<span style="background: ${isSelected ? 'rgba(255,255,255,0.3)' : '#fff3e0'}; color: ${isSelected ? '#fff' : '#e65100'}; border: 1px solid ${isSelected ? '#fff' : '#ffb74d'}; font-size: 9px; padding: 1px 4px; border-radius: 2px; font-weight: bold;">✏️ Redaktə</span>`;
      } else if (doc.posted) {
        opBadge = `<span style="background: ${isSelected ? 'rgba(255,255,255,0.3)' : '#e8f5e9'}; color: ${isSelected ? '#fff' : '#2e7d32'}; border: 1px solid ${isSelected ? '#fff' : '#81c784'}; font-size: 9px; padding: 1px 4px; border-radius: 2px;">✔ Provodka</span>`;
      } else {
        opBadge = `<span style="background: ${isSelected ? 'rgba(255,255,255,0.3)' : '#f5f5f5'}; color: ${isSelected ? '#fff' : '#666'}; border: 1px solid ${isSelected ? '#fff' : '#ccc'}; font-size: 9px; padding: 1px 4px; border-radius: 2px;">Yaradılma</span>`;
      }

      // Version badge
      const verBadge = isMultiVersion
        ? `<strong style="color: ${isSelected ? '#ffeb3b' : '#002060'}; font-weight: bold;">${doc.version_count} versiya</strong>`
        : `<span style="color: ${isSelected ? '#eee' : '#888'};">1</span>`;

      const docIcon = doc.icon || (doc.doc_type === "ВозвратТоваровОтПокупателя" ? "↩️" : (doc.doc_type === "ПогрузкиМашин" ? "📦" : "🚚"));

      html += `
        <tr id="ajRow_${idx}"
            style="height: 25px; cursor: pointer; background: ${bg}; color: ${fg}; border-bottom: 1px solid ${isSelected ? '#316ac5' : '#e0dfd5'}; user-select: none;"
            onclick="AuditJournal.selectRow(${idx})"
            ondblclick="AuditJournal.openAuditForIndex(${idx})">
          <td style="border: 1px solid #d4d0c8; text-align: center; color: ${isSelected ? '#fff' : '#777'}; font-size: 10px;">${idx + 1}</td>
          <td style="border: 1px solid #d4d0c8; text-align: center; font-size: 11px;" title="${statusTitle}">${statusIcon}</td>
          <td style="border: 1px solid #d4d0c8; padding: 0 8px; font-weight: 600; white-space: nowrap;">
            <span style="margin-right: 4px;">${docIcon}</span>
            <span>${this.escapeHtml(doc.number)}</span>
          </td>
          <td style="border: 1px solid #d4d0c8; padding: 0 8px; white-space: nowrap; font-size: 11px;">${this.escapeHtml(doc.date)}</td>
          <td style="border: 1px solid #d4d0c8; padding: 0 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 155px;" title="${this.escapeHtml(doc.last_author)}">
            <span style="font-weight: 500;">👤 ${this.escapeHtml(doc.last_author)}</span>
          </td>
          <td style="border: 1px solid #d4d0c8; padding: 0 8px; overflow: hidden; text-overflow: ellipsis;" title="${this.escapeHtml(doc.kontragent)}">
            ${this.escapeHtml(doc.kontragent)}
          </td>
          <td style="border: 1px solid #d4d0c8; padding: 0 8px; text-align: right; font-weight: bold; white-space: nowrap;">
            ${Number(doc.amount || 0).toFixed(2)}
          </td>
          <td style="border: 1px solid #d4d0c8; text-align: center; padding: 0 4px;">${opBadge}</td>
          <td style="border: 1px solid #d4d0c8; text-align: center; padding: 0 4px; font-size: 11px;">${verBadge}</td>
          <td style="border: 1px solid #d4d0c8; text-align: center; padding: 0 4px;" onclick="event.stopPropagation();">
            <button class="btn-1c btn-1c-primary" style="height: 21px; font-size: 10px; padding: 0 8px; font-weight: 600; cursor: pointer;" onclick="AuditJournal.openAuditForIndex(${idx})">
              Audit Aç
            </button>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  },

  selectRow: function(idx) {
    if (idx < 0 || idx >= this.filteredItems.length) return;
    this.selectedIndex = idx;

    // Update row highlights
    const tbody = document.getElementById("ajTableBody");
    if (tbody) {
      const rows = tbody.querySelectorAll("tr");
      rows.forEach((r, rIdx) => {
        const isSel = (rIdx === idx);
        r.style.background = isSel ? "#316ac5" : (rIdx % 2 === 1 ? "#f9f8f4" : "#ffffff");
        r.style.color = isSel ? "#ffffff" : "#111111";
      });
    }
  },

  scrollSelectedIntoView: function() {
    const rowEl = document.getElementById(`ajRow_${this.selectedIndex}`);
    if (rowEl) {
      rowEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  },

  openAuditModalForDoc: function(doc) {
    if (!doc) return;

    this.currentDoc = doc;
    this.currentDocType = doc.doc_type || this.activeDocType;
    this.currentDocNumber = doc.number;

    // Populate Modal Header Info
    const mWinTitle = document.getElementById("mWinTitle");
    if (mWinTitle) mWinTitle.textContent = `Sənəd Audit Protokolu: № ${doc.number || '—'}`;

    const mDocHeading = document.getElementById("mDocHeading");
    if (mDocHeading) mDocHeading.textContent = `${doc.doc_type_title || doc.doc_type || this.currentDocType} № ${doc.number || '—'}`;

    const mDocDate = document.getElementById("mDocDate");
    if (mDocDate) mDocDate.textContent = doc.date || '—';

    const mDocKontr = document.getElementById("mDocKontr");
    if (mDocKontr) mDocKontr.textContent = doc.kontragent || '—';

    const mDocWh = document.getElementById("mDocWh");
    if (mDocWh) mDocWh.textContent = doc.warehouse || '—';

    const mDocContract = document.getElementById("mDocContract");
    if (mDocContract) mDocContract.textContent = doc.contract || '—';

    const mDocAmount = document.getElementById("mDocAmount");
    if (mDocAmount) mDocAmount.textContent = `${Number(doc.amount || 0).toFixed(2)} AZN`;

    const mDocStatusBadge = document.getElementById("mDocStatusBadge");
    if (mDocStatusBadge) {
      if (doc.deleted) {
        mDocStatusBadge.textContent = "SİLİNİB";
        mDocStatusBadge.className = "badge badge-red";
      } else if (doc.posted) {
        mDocStatusBadge.textContent = "TƏSDİQLƏNİB";
        mDocStatusBadge.className = "badge badge-green";
      } else {
        mDocStatusBadge.textContent = "QARALAMA";
        mDocStatusBadge.className = "badge badge-orange";
      }
    }

    // Set loading placeholder in versions table
    const tbody = document.getElementById("ajVersionsTableBody");
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 25px; color: #555; font-size: 12px;"><span style="font-size: 16px;">⏳</span> Sənədin versiyaları və dəyişiklik tarixi oxunur...</td></tr>`;
    }

    // Open Modal Window & reset maximize/minimize states
    const modal = document.getElementById("auditModalBackdrop");
    const card = modal ? modal.querySelector(".audit-modal") : null;
    const maxBtn = document.getElementById("ajModalMaxBtn");
    if (modal && card) {
      modal.classList.remove("minimized", "maximized");
      card.classList.remove("minimized", "maximized");
      if (maxBtn) {
        maxBtn.textContent = "□";
        maxBtn.title = "Böyüt / Bərpa et";
      }
      modal.style.display = "flex";
    }

    // Load and render diff details for this doc
    this.loadDiff(this.currentDocType, doc.number);
  },

  openAuditForIndex: function(idx) {
    this.selectRow(idx);
    const doc = this.filteredItems[idx];
    if (!doc) return;
    this.openAuditModalForDoc(doc);
  },

  closeAuditModal: function() {
    this.hideDiffPopover();
    const docModal = document.getElementById("docViewModalBackdrop");
    if (docModal && docModal.style.display !== "none") {
      this.closeDocViewModal();
    }
    const modal = document.getElementById("auditModalBackdrop");
    const card = modal ? modal.querySelector(".audit-modal") : null;
    if (modal) {
      modal.style.display = "none";
      modal.classList.remove("minimized", "maximized");
    }
    if (card) {
      card.classList.remove("minimized", "maximized");
    }
  },

  toggleMaximizeAuditModal: function() {
    const backdrop = document.getElementById("auditModalBackdrop");
    const modal = backdrop ? backdrop.querySelector(".audit-modal") : null;
    const maxBtn = document.getElementById("ajModalMaxBtn");
    if (!backdrop || !modal) return;

    if (modal.classList.contains("minimized")) {
      modal.classList.remove("minimized");
      backdrop.classList.remove("minimized");
    }

    const isMax = modal.classList.toggle("maximized");
    backdrop.classList.toggle("maximized", isMax);

    if (maxBtn) {
      maxBtn.textContent = isMax ? "❐" : "□";
      maxBtn.title = isMax ? "Əvvəlki ölçüyə qaytar" : "Tam ekrana böyüt";
    }
  },

  toggleMinimizeAuditModal: function() {
    const backdrop = document.getElementById("auditModalBackdrop");
    const modal = backdrop ? backdrop.querySelector(".audit-modal") : null;
    const maxBtn = document.getElementById("ajModalMaxBtn");
    if (!backdrop || !modal) return;

    const isMin = modal.classList.toggle("minimized");
    backdrop.classList.toggle("minimized", isMin);

    if (isMin) {
      modal.classList.remove("maximized");
      backdrop.classList.remove("maximized");
      if (maxBtn) {
        maxBtn.textContent = "□";
        maxBtn.title = "Tam ekrana böyüt";
      }
    }
  },

  onModalHeaderClick: function(e, modalType) {
    if (e.target.closest(".mdi-win-btn")) return;
    const modal = (modalType === "audit") ? document.querySelector(".audit-modal") : document.querySelector(".doc-view-modal");
    if (modal && modal.classList.contains("minimized")) {
      if (modalType === "audit") {
        this.toggleMinimizeAuditModal();
      } else {
        this.toggleMinimizeDocViewModal();
      }
    }
  },

  loadDiff: function(docType, docNumber) {
    if (docType) this.currentDocType = docType;
    if (docNumber) this.currentDocNumber = docNumber;

    if (this._currentAbortCtrl) {
      this._currentAbortCtrl.abort();
    }
    this._currentAbortCtrl = new AbortController();

    const creds = window.SessionManager ? SessionManager.getCredentials() : {};
    fetch("/api/audit/details", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...creds,
        doc_type: docType,
        number: docNumber
      }),
      signal: this._currentAbortCtrl.signal
    })
    .then(r => r.json())
    .then(data => {
      if (!data.success) {
        console.warn("Audit details warning:", data.error);
      }
      this.populateDiffData(data);
    })
    .catch(err => {
      if (err.name === "AbortError") return;
      console.error("Diff fetch error:", err);
    });
  },

  populateDiffData: function(data) {
    if (data && data.warehouse) {
      const mDocWh = document.getElementById("mDocWh");
      if (mDocWh) mDocWh.textContent = data.warehouse;
    }
    if (data && data.kontragent) {
      const mDocKontr = document.getElementById("mDocKontr");
      if (mDocKontr) mDocKontr.textContent = data.kontragent;
    }
    if (data && data.date) {
      const mDocDate = document.getElementById("mDocDate");
      if (mDocDate && (mDocDate.textContent === "—" || !mDocDate.textContent)) {
        mDocDate.textContent = data.date;
      }
    }
    if (data && data.contract) {
      const mDocContract = document.getElementById("mDocContract");
      if (mDocContract) mDocContract.textContent = data.contract;
    }
    if (data && data.amount !== undefined) {
      const mDocAmount = document.getElementById("mDocAmount");
      if (mDocAmount) mDocAmount.textContent = `${Number(data.amount || 0).toFixed(2)} AZN`;
    }
    if (data && (data.posted !== undefined || data.deleted !== undefined)) {
      const mDocStatusBadge = document.getElementById("mDocStatusBadge");
      if (mDocStatusBadge) {
        if (data.deleted) {
          mDocStatusBadge.textContent = "SİLİNİB";
          mDocStatusBadge.className = "badge badge-red";
        } else if (data.posted) {
          mDocStatusBadge.textContent = "TƏSDİQLƏNİB";
          mDocStatusBadge.className = "badge badge-green";
        } else {
          mDocStatusBadge.textContent = "QARALAMA";
          mDocStatusBadge.className = "badge badge-orange";
        }
      }
    }
    this.normalizeAuditData(data);
    this.renderActiveTab();
    const docModal = document.getElementById("docViewModalBackdrop");
    if (docModal && docModal.style.display !== "none" && !docModal.classList.contains("minimized")) {
      this.renderDocVersionWindow();
    }
  },

  normalizeAuditData: function(data) {
    this.currentDiffData = data || {};
    const rawVers = (data && data.raw_versions && data.raw_versions.length > 0)
      ? data.raw_versions
      : ((data && data.versions) ? data.versions : []);

    const normalizedVersions = [];
    const curDoc = (this.filteredItems && this.selectedIndex >= 0 && this.filteredItems[this.selectedIndex]) || this.currentDoc || {};
    const masterDocDate = (data && data.date) || curDoc.date || "";

    rawVers.forEach((rawV, idx) => {
      const verNum = rawV.version || (idx + 1);
      const isBase = (idx === 0);
      const prevV = idx > 0 ? normalizedVersions[idx - 1] : null;

      // Extract real operational Document Date vs modification/change timestamp
      let curDocDate = rawV.doc_date || rawV.docDate || "";
      let curChangeDate = rawV.change_date || rawV.changeDate || rawV.action_date || "";

      if (!curDocDate) {
        if (curChangeDate && curChangeDate !== rawV.date) {
          curDocDate = rawV.date || masterDocDate;
        } else if (masterDocDate) {
          curDocDate = masterDocDate;
          if (!curChangeDate) curChangeDate = rawV.date || masterDocDate;
        } else {
          curDocDate = rawV.date || "";
          curChangeDate = rawV.date || "";
        }
      }
      if (!curChangeDate) {
        curChangeDate = rawV.action_date || rawV.date || curDocDate;
      }

      const headerChanges = [];

      if (!isBase && prevV) {
        // Document Operational Date difference (ONLY if document's own date was actually edited!)
        const prevDocDate = prevV.docDate || prevV.doc_date || "";
        if (curDocDate && prevDocDate && String(curDocDate).trim() !== String(prevDocDate).trim()) {
          headerChanges.push({
            field: "date",
            label: "Sənəd Tarixi",
            oldVal: prevDocDate,
            newVal: curDocDate,
            note: `Sənəd tarixi ${prevDocDate} tarixindən ${curDocDate} tarixinə dəyişdirildi`
          });
        }
        // Kontragent difference
        if (rawV.kontragent && prevV.kontragent && String(rawV.kontragent).trim() !== String(prevV.kontragent).trim()) {
          headerChanges.push({
            field: "kontragent",
            label: "Müştəri / Kontragent",
            oldVal: prevV.kontragent,
            newVal: rawV.kontragent,
            note: `Kontragent dəyişdirildi: ${prevV.kontragent} ➔ ${rawV.kontragent}`
          });
        }
        // Comment difference
        if (String(rawV.comment || "").trim() !== String(prevV.comment || "").trim()) {
          headerChanges.push({
            field: "comment",
            label: "Şərh (Komment)",
            oldVal: prevV.comment || "(Boş idi)",
            newVal: rawV.comment || "(Silindi)",
            note: "Şərh mətni yeniləndi"
          });
        }
        // Warehouse difference
        if (rawV.warehouse && prevV.warehouse && String(rawV.warehouse).trim() !== String(prevV.warehouse).trim()) {
          headerChanges.push({
            field: "warehouse",
            label: "Anbar",
            oldVal: prevV.warehouse,
            newVal: rawV.warehouse,
            note: `Anbar dəyişdirildi`
          });
        }
        // Contract difference
        if (rawV.contract && prevV.contract && String(rawV.contract).trim() !== String(prevV.contract).trim()) {
          headerChanges.push({
            field: "contract",
            label: "Müqavilə",
            oldVal: prevV.contract,
            newVal: rawV.contract,
            note: `Müqavilə dəyişdirildi`
          });
        }

        // Header Accounting Flags difference
        if (rawV.bu_record !== undefined && prevV && prevV.buRecord !== undefined && Boolean(rawV.bu_record) !== Boolean(prevV.buRecord)) {
        headerChanges.push({
          field: "bu_record",
          label: "Mühasibat Uçotu (БУ)",
          oldVal: prevV.buRecord ? "Bəli" : "Xeyr",
          newVal: rawV.bu_record ? "Bəli" : "Xeyr",
          note: `Mühasibat uçotu (БУ) qeydiyyatı dəyişdirildi`
        });
      }
      if (rawV.nu_record !== undefined && prevV && prevV.nuRecord !== undefined && Boolean(rawV.nu_record) !== Boolean(prevV.nuRecord)) {
        headerChanges.push({
          field: "nu_record",
          label: "Vergi Uçotu (НУ)",
          oldVal: prevV.nuRecord ? "Bəli" : "Xeyr",
          newVal: rawV.nu_record ? "Bəli" : "Xeyr",
          note: `Vergi uçotu (НУ) qeydiyyatı dəyişdirildi`
        });
      }
      if (rawV.account_settlement && prevV && prevV.accountSettlement && String(rawV.account_settlement).trim() !== String(prevV.accountSettlement).trim()) {
        headerChanges.push({
          field: "account_settlement",
          label: "Müştəri Hesabı",
          oldVal: prevV.accountSettlement,
          newVal: rawV.account_settlement,
          note: `Müştəri hesabı dəyişdirildi: ${prevV.accountSettlement} ➔ ${rawV.account_settlement}`
        });
      }
    }

    // Process Line Items with Deep Historical Diffing
      const prevItems = (!isBase && prevV && prevV.items) ? prevV.items : [];
      const curRawList = rawV.items || [];
      const curItems = [];
      let addedCount = 0;
      let removedCount = 0;
      let replacedCount = 0;
      let modifiedCount = 0;

      if (isBase || prevItems.length === 0) {
        // Base Version (v1)
        curRawList.forEach((it, lIdx) => {
          const itemLineNo = it.line_no || (lIdx + 1);
          const itemCode = String(it.code || `KOD-${itemLineNo}`).trim();
          const itemArtikul = String(it.article || it.artikul || "—").trim();
          const itemName = String(it.name || "Mal").trim();
          const itemUnit = String(it.unit || "əd").trim();
          const itemQty = Number(it.qty || it.quantity || 0);
          const itemPrice = Number(it.price || 0);
          const itemSum = Number(it.total || it.amount || (itemQty * itemPrice) || 0);
          const itemDiscAuto = Number(it.discount_auto != null ? it.discount_auto : (it.discountAuto || 0));
          const itemDiscManual = Number(it.discount_manual != null ? it.discount_manual : (it.discountManual || 0));
          const itemVatRate = String(it.vat_rate || it.vatRate || "—").trim();
          const itemVatSum = Number(it.vat_amount != null ? it.vat_amount : (it.vatSum || 0));
          const itemAccountBu = String(it.account_bu || it.accountBu || "—").trim();
          const itemIncomeAccountBu = String(it.income_account_bu || it.incomeAccountBu || "—").trim();
          const itemSeries = String(it.series || "—").trim();

          curItems.push({
            lineNo: itemLineNo,
            code: itemCode,
            artikul: itemArtikul,
            name: itemName,
            unit: itemUnit,
            qty: itemQty,
            price: itemPrice,
            sum: itemSum,
            discountAuto: itemDiscAuto,
            discountManual: itemDiscManual,
            vatRate: itemVatRate,
            vatSum: itemVatSum,
            accountBu: itemAccountBu,
            incomeAccountBu: itemIncomeAccountBu,
            series: itemSeries,
            statusType: "base",
            statusLabel: "Baza sənədi",
            changedFields: []
          });
        });
      } else {
        const matchedPrevIndices = new Set();
        const matchedCurIndices = new Set();
        const curItemDrafts = [];

        // Pre-parse current raw items
        curRawList.forEach((it, lIdx) => {
          const itemLineNo = it.line_no || (lIdx + 1);
          const itemCode = String(it.code || `KOD-${itemLineNo}`).trim();
          const itemArtikul = String(it.article || it.artikul || "—").trim();
          const itemName = String(it.name || "Mal").trim();
          const itemUnit = String(it.unit || "əd").trim();
          const itemQty = Number(it.qty || it.quantity || 0);
          const itemPrice = Number(it.price || 0);
          const itemSum = Number(it.total || it.amount || (itemQty * itemPrice) || 0);
          const itemDiscAuto = Number(it.discount_auto != null ? it.discount_auto : (it.discountAuto || 0));
          const itemDiscManual = Number(it.discount_manual != null ? it.discount_manual : (it.discountManual || 0));
          const itemVatRate = String(it.vat_rate || it.vatRate || "—").trim();
          const itemVatSum = Number(it.vat_amount != null ? it.vat_amount : (it.vatSum || 0));
          const itemAccountBu = String(it.account_bu || it.accountBu || "—").trim();
          const itemIncomeAccountBu = String(it.income_account_bu || it.incomeAccountBu || "—").trim();
          const itemSeries = String(it.series || "—").trim();

          curItemDrafts.push({
            lineNo: itemLineNo,
            code: itemCode,
            artikul: itemArtikul,
            name: itemName,
            unit: itemUnit,
            qty: itemQty,
            price: itemPrice,
            sum: itemSum,
            discountAuto: itemDiscAuto,
            discountManual: itemDiscManual,
            vatRate: itemVatRate,
            vatSum: itemVatSum,
            accountBu: itemAccountBu,
            incomeAccountBu: itemIncomeAccountBu,
            series: itemSeries,
            statusType: "unchanged",
            statusLabel: "Dəyişməyib",
            changedFields: [],
            oldName: "",
            oldCode: ""
          });
        });

        // Pass 1: Match by exact product code (or name if code is absent)
        curItemDrafts.forEach((cItem, cIdx) => {
          const pIdx = prevItems.findIndex((pItem, idx) => {
            if (matchedPrevIndices.has(idx)) return false;
            if (cItem.code && pItem.code && cItem.code === pItem.code) return true;
            if (cItem.name && pItem.name && cItem.name === pItem.name) return true;
            return false;
          });

          if (pIdx !== -1) {
            matchedPrevIndices.add(pIdx);
            matchedCurIndices.add(cIdx);
            const prevItem = prevItems[pIdx];

            if (prevItem.name !== cItem.name) {
              cItem.changedFields.push({
                field: "name",
                label: "Malın Adı",
                oldVal: prevItem.name,
                newVal: cItem.name,
                note: "Malın adı dəqiqləşdirildi"
              });
            }
            if (Math.abs(prevItem.qty - cItem.qty) > 0.0001) {
              const diff = cItem.qty - prevItem.qty;
              cItem.changedFields.push({
                field: "qty",
                label: "Miqdar (Say)",
                oldVal: `${prevItem.qty} ${cItem.unit}`,
                newVal: `${cItem.qty} ${cItem.unit}`,
                note: `${diff > 0 ? '+' : ''}${diff} ${cItem.unit} fərq`
              });
            }
            if (Math.abs(prevItem.price - cItem.price) > 0.001) {
              const diff = cItem.price - prevItem.price;
              cItem.changedFields.push({
                field: "price",
                label: "Qiymət",
                oldVal: `${prevItem.price.toFixed(2)} AZN`,
                newVal: `${cItem.price.toFixed(2)} AZN`,
                note: `${diff > 0 ? '+' : ''}${diff.toFixed(2)} AZN dəyişdi`
              });
            }
            if (Math.abs(prevItem.sum - cItem.sum) > 0.01) {
              const diff = cItem.sum - prevItem.sum;
              cItem.changedFields.push({
                field: "sum",
                label: "Məbləğ",
                oldVal: `${prevItem.sum.toFixed(2)} AZN`,
                newVal: `${cItem.sum.toFixed(2)} AZN`,
                note: `${diff > 0 ? '+' : ''}${diff.toFixed(2)} AZN yekun fərq`
              });
            }
            // Avto Faiz % fərqi
            if (Math.abs((prevItem.discountAuto || 0) - (cItem.discountAuto || 0)) > 0.01) {
              const pVal = Number(prevItem.discountAuto || 0).toFixed(2);
              const cVal = Number(cItem.discountAuto || 0).toFixed(2);
              cItem.changedFields.push({
                field: "discount_auto",
                label: "Avto Faiz %",
                oldVal: `${pVal}%`,
                newVal: `${cVal}%`,
                note: `Avtomatik endirim faizi: ${pVal}% ➔ ${cVal}%`
              });
            }
            // Əl ilə Faiz % fərqi
            if (Math.abs((prevItem.discountManual || 0) - (cItem.discountManual || 0)) > 0.01) {
              const pVal = Number(prevItem.discountManual || 0).toFixed(2);
              const cVal = Number(cItem.discountManual || 0).toFixed(2);
              cItem.changedFields.push({
                field: "discount_manual",
                label: "Əl ilə Faiz %",
                oldVal: `${pVal}%`,
                newVal: `${cVal}%`,
                note: `Əl ilə endirim faizi: ${pVal}% ➔ ${cVal}%`
              });
            }
            // Uçot Hesabı (БУ) fərqi
            if (prevItem.accountBu && cItem.accountBu && prevItem.accountBu !== "—" && cItem.accountBu !== "—" && prevItem.accountBu !== cItem.accountBu) {
              cItem.changedFields.push({
                field: "account_bu",
                label: "Uçot Hesabı (БУ)",
                oldVal: prevItem.accountBu,
                newVal: cItem.accountBu,
                note: `Mühasibat uçotu hesabı: ${prevItem.accountBu} ➔ ${cItem.accountBu}`
              });
            }
            // Gəlir Hesabı (БУ) fərqi
            if (prevItem.incomeAccountBu && cItem.incomeAccountBu && prevItem.incomeAccountBu !== "—" && cItem.incomeAccountBu !== "—" && prevItem.incomeAccountBu !== cItem.incomeAccountBu) {
              cItem.changedFields.push({
                field: "income_account_bu",
                label: "Gəlir Hesabı (БУ)",
                oldVal: prevItem.incomeAccountBu,
                newVal: cItem.incomeAccountBu,
                note: `Gəlir hesabı: ${prevItem.incomeAccountBu} ➔ ${cItem.incomeAccountBu}`
              });
            }
            // ƏDV Dərəcəsi fərqi
            if (prevItem.vatRate && cItem.vatRate && prevItem.vatRate !== "—" && cItem.vatRate !== "—" && prevItem.vatRate !== cItem.vatRate) {
              cItem.changedFields.push({
                field: "vat_rate",
                label: "ƏDV Dərəcəsi",
                oldVal: prevItem.vatRate,
                newVal: cItem.vatRate,
                note: `ƏDV: ${prevItem.vatRate} ➔ ${cItem.vatRate}`
              });
            }

            if (cItem.changedFields.length > 0) {
              cItem.statusType = "modified";
              cItem.statusLabel = "Dəyişdirilib";
              modifiedCount++;
            } else {
              cItem.statusType = "unchanged";
              cItem.statusLabel = "Dəyişməyib";
            }
          }
        });

        // Pass 2: Line Replacement (user changed Product A to Product B on that line)
        curItemDrafts.forEach((cItem, cIdx) => {
          if (matchedCurIndices.has(cIdx)) return;

          let pIdx = prevItems.findIndex((pItem, idx) => {
            if (matchedPrevIndices.has(idx)) return false;
            return (pItem.lineNo || (idx + 1)) === cItem.lineNo;
          });

          if (pIdx === -1 && !matchedPrevIndices.has(cIdx) && cIdx < prevItems.length) {
            if (curItemDrafts.length === prevItems.length) {
              pIdx = cIdx;
            }
          }

          if (pIdx !== -1) {
            matchedPrevIndices.add(pIdx);
            matchedCurIndices.add(cIdx);
            const prevItem = prevItems[pIdx];

            cItem.statusType = "replaced";
            cItem.statusLabel = "Mal Əvəzlənib";
            cItem.oldName = prevItem.name;
            cItem.oldCode = prevItem.code;
            replacedCount++;

            cItem.changedFields.push({
              field: "name",
              label: "Mal Əvəzlənməsi",
              oldVal: `${prevItem.name} (${prevItem.code})`,
              newVal: `${cItem.name} (${cItem.code})`,
              note: `Mal dəyişdirildi: ${prevItem.name} ➔ ${cItem.name}`
            });

            if (Math.abs(prevItem.qty - cItem.qty) > 0.0001) {
              cItem.changedFields.push({
                field: "qty",
                label: "Miqdar",
                oldVal: `${prevItem.qty} ${cItem.unit}`,
                newVal: `${cItem.qty} ${cItem.unit}`,
                note: `Miqdar: ${prevItem.qty} ➔ ${cItem.qty}`
              });
            }
            if (Math.abs(prevItem.price - cItem.price) > 0.001) {
              cItem.changedFields.push({
                field: "price",
                label: "Qiymət",
                oldVal: `${prevItem.price.toFixed(2)} AZN`,
                newVal: `${cItem.price.toFixed(2)} AZN`,
                note: `Qiymət: ${prevItem.price.toFixed(2)} ➔ ${cItem.price.toFixed(2)}`
              });
            }
            if (Math.abs(prevItem.sum - cItem.sum) > 0.01) {
              cItem.changedFields.push({
                field: "sum",
                label: "Məbləğ",
                oldVal: `${prevItem.sum.toFixed(2)} AZN`,
                newVal: `${cItem.sum.toFixed(2)} AZN`,
                note: `Məbləğ: ${prevItem.sum.toFixed(2)} ➔ ${cItem.sum.toFixed(2)}`
              });
            }
            if (Math.abs((prevItem.discountAuto || 0) - (cItem.discountAuto || 0)) > 0.01) {
              cItem.changedFields.push({
                field: "discount_auto",
                label: "Avto Faiz %",
                oldVal: `${Number(prevItem.discountAuto || 0).toFixed(2)}%`,
                newVal: `${Number(cItem.discountAuto || 0).toFixed(2)}%`,
                note: `Endirim: ${Number(prevItem.discountAuto || 0).toFixed(2)}% ➔ ${Number(cItem.discountAuto || 0).toFixed(2)}%`
              });
            }
            if (Math.abs((prevItem.discountManual || 0) - (cItem.discountManual || 0)) > 0.01) {
              cItem.changedFields.push({
                field: "discount_manual",
                label: "Əl ilə Faiz %",
                oldVal: `${Number(prevItem.discountManual || 0).toFixed(2)}%`,
                newVal: `${Number(cItem.discountManual || 0).toFixed(2)}%`,
                note: `Endirim: ${Number(prevItem.discountManual || 0).toFixed(2)}% ➔ ${Number(cItem.discountManual || 0).toFixed(2)}%`
              });
            }
            if (prevItem.accountBu && cItem.accountBu && prevItem.accountBu !== "—" && cItem.accountBu !== "—" && prevItem.accountBu !== cItem.accountBu) {
              cItem.changedFields.push({
                field: "account_bu",
                label: "Uçot Hesabı (БУ)",
                oldVal: prevItem.accountBu,
                newVal: cItem.accountBu,
                note: `Uçot hesabı: ${prevItem.accountBu} ➔ ${cItem.accountBu}`
              });
            }
          }
        });

        // Pass 3: Newly Added Items
        curItemDrafts.forEach((cItem, cIdx) => {
          if (matchedCurIndices.has(cIdx)) return;

          cItem.statusType = "added";
          cItem.statusLabel = "+ Yeni Əlavə";
          addedCount++;

          cItem.changedFields.push({
            field: "new_item",
            label: "Yeni Əlavə",
            oldVal: "— (Sənəddə yox idi)",
            newVal: `${cItem.name} (${cItem.qty} ${cItem.unit})`,
            note: "Bu mal sənədə yeni əlavə olunub"
          });
        });

        curItems.push(...curItemDrafts);

        // Pass 4: Removed / Deleted Items from Document
        prevItems.forEach((pItem, pIdx) => {
          if (matchedPrevIndices.has(pIdx)) return;

          removedCount++;
          curItems.push({
            lineNo: pItem.lineNo || (curItems.length + 1),
            code: pItem.code,
            artikul: pItem.artikul,
            name: pItem.name,
            unit: pItem.unit,
            qty: pItem.qty,
            price: pItem.price,
            sum: pItem.sum,
            discountAuto: pItem.discountAuto || 0,
            discountManual: pItem.discountManual || 0,
            vatRate: pItem.vatRate || "—",
            vatSum: pItem.vatSum || 0,
            accountBu: pItem.accountBu || "—",
            incomeAccountBu: pItem.incomeAccountBu || "—",
            series: pItem.series || "—",
            statusType: "removed",
            statusLabel: "✕ Silinib",
            isDeleted: true,
            changedFields: [{
              field: "removed_item",
              label: "Sənəddən Silinib",
              oldVal: `${pItem.name} (${pItem.qty} ${pItem.unit})`,
              newVal: "— (Silindi)",
              note: "Bu mal sənədin bu versiyasında çıxarılıb / silinib"
            }]
          });
        });
      }

      const stText = rawV.deleted ? "Silinib" : (rawV.posted ? "Təsdiqlənib" : "Qaralama");
      const verLabel = isBase ? "v1 (İlkin Halı)" : `v${verNum} (Dəyişiklik)`;

      const curDoc = this.filteredItems[this.selectedIndex] || {};
      const fallbackWh = (data && data.warehouse) || curDoc.warehouse || "";
      const fallbackContract = (data && data.contract) || curDoc.contract || "";
      const fallbackKontr = (data && data.kontragent) || curDoc.kontragent || "";

      normalizedVersions.push({
        verNum: verNum,
        verLabel: verLabel,
        docDate: curDocDate,
        changeDate: curChangeDate,
        date: curDocDate,
        author: rawV.author || curDoc.last_author || "Keleshov Nasib",
        kontragent: rawV.kontragent || fallbackKontr || "—",
        warehouse: rawV.warehouse || fallbackWh || "—",
        contract: rawV.contract || fallbackContract || "—",
        comment: rawV.comment || "",
        amount: Number(rawV.amount !== undefined ? rawV.amount : (curDoc.amount || 0)),
        statusText: stText,
        posted: Boolean(rawV.posted),
        deleted: Boolean(rawV.deleted),
        buRecord: Boolean(rawV.bu_record),
        nuRecord: Boolean(rawV.nu_record),
        accountSettlement: rawV.account_settlement || "",
        accountAdvance: rawV.account_advance || "",
        headerChanges: headerChanges,
        addedCount: addedCount,
        removedCount: removedCount,
        replacedCount: replacedCount,
        modifiedCount: modifiedCount,
        items: curItems
      });
    });

    if (normalizedVersions.length === 0) {
      const curDoc = this.filteredItems[this.selectedIndex] || {};
      const fallbackWh = (data && data.warehouse) || curDoc.warehouse || "";
      const fallbackContract = (data && data.contract) || curDoc.contract || "";
      const fallbackKontr = (data && data.kontragent) || curDoc.kontragent || "";

      normalizedVersions.push({
        verNum: 1,
        verLabel: "v1 (İlkin Halı)",
        date: curDoc.date || "—",
        author: curDoc.last_author || "Keleshov Nasib",
        kontragent: fallbackKontr || "—",
        warehouse: fallbackWh || "—",
        contract: fallbackContract || "—",
        comment: "",
        amount: Number(curDoc.amount || 0),
        statusText: curDoc.posted ? "Təsdiqlənib" : "Qaralama",
        posted: Boolean(curDoc.posted),
        deleted: Boolean(curDoc.deleted),
        headerChanges: [],
        items: []
      });
    }

    this.currentDiffData.normalizedVersions = normalizedVersions;
    this.selectedVersionIdx = normalizedVersions.length - 1;

    // Normalize Chronological Timeline
    let timeline = data.event_timeline || [];
    if (!timeline || timeline.length === 0) {
      // Synthesize timeline from normalized versions
      timeline = [];
      normalizedVersions.forEach((v, idx) => {
        if (idx === 0) {
          timeline.push({
            order: 1,
            datetime: v.date,
            user: v.author,
            action: "Yaradıldı",
            action_type: "Yaradılma",
            badge_class: "blue",
            doc_status: v.posted ? "Təsdiqləndi" : "Qaralama",
            result: "Sənəd açıldı və sistemdə qeydiyyata alındı."
          });
          if (v.posted) {
            timeline.push({
              order: 2,
              datetime: v.date,
              user: v.author,
              action: "Təsdiqləndi",
              action_type: "Təsdiq",
              badge_class: "green",
              doc_status: "Təsdiqləndi",
              result: "Sənəd 1C-də təsdiqləndi (Provodka edildi)."
            });
          }
        } else {
          timeline.push({
            order: timeline.length + 1,
            datetime: v.date,
            user: v.author,
            action: v.deleted ? "Silindi" : "Dəyişdirildi",
            action_type: v.deleted ? "Silinmə" : "Redaktə",
            badge_class: v.deleted ? "red" : "orange",
            doc_status: v.statusText,
            result: v.comment || `v${v.verNum} redaktəsi qeydə alındı.`
          });
        }
      });
    } else {
      // Clean existing timeline entries: remove emojis, format text badges
      timeline = timeline.map((ev, idx) => {
        let act = ev.action || ev.title || "Əməliyyat";
        let bClass = ev.badge_class || "blue";
        let actLow = (act + " " + (ev.event || "") + " " + (ev.title || "")).toLowerCase();

        // Strict User Rule: no emojis, exact word "Silindi" (not "Silinmə nişanı qoyuldu")
        if (actLow.includes("sil") || actLow.includes("delete") || actLow.includes("пометк")) {
          act = "Silindi";
          bClass = "red";
        } else if (actLow.includes("təsdiq ləğv") || actLow.includes("unpost") || actLow.includes("отмена")) {
          act = "Təsdiq ləğv edildi";
          bClass = "orange";
        } else if (actLow.includes("təsdiq") || actLow.includes("провед") || actLow.includes(".post")) {
          act = "Təsdiqləndi";
          bClass = "green";
        } else if (actLow.includes("bərpa") || actLow.includes("восстанов")) {
          act = "Bərpa edildi";
          bClass = "green";
        } else if (actLow.includes("dəyiş") || actLow.includes("redaktə") || actLow.includes("измен") || actLow.includes("update")) {
          act = "Dəyişdirildi";
          bClass = "orange";
        } else if (actLow.includes("yarad") || actLow.includes("создан") || actLow.includes(".new")) {
          act = "Yaradıldı";
          bClass = "blue";
        }

        let resText = ev.result || ev.comment || "";
        if (!resText || resText.length < 2) {
          if (act === "Silindi") resText = "Sənəd 1C-dən silindi.";
          else if (act === "Təsdiqləndi") resText = "Sənəd 1C-də təsdiqləndi (Provodka edildi).";
          else if (act === "Təsdiq ləğv edildi") resText = "Təsdiq ləğv edildi, sənəd qaralamaya qaytarıldı.";
          else if (act === "Yaradıldı") resText = "Sənədin ilkin qeydiyyatı və yaradılması.";
          else if (act === "Dəyişdirildi") resText = "Sənəddə dəyişiklik edildi.";
          else resText = "1C sistemində qeydə alınıb.";
        }

        return {
          order: ev.order || (idx + 1),
          datetime: ev.datetime || ev.date || "—",
          user: ev.user || "İstifadəçi",
          action: act,
          action_type: ev.action_type || act,
          badge_class: bClass,
          doc_status: ev.doc_status || (act === "Silindi" ? "Silindi" : (act === "Təsdiqləndi" ? "Təsdiqləndi" : "Qaralama")),
          result: resText
        };
      });
    }

    this.currentDiffData.normalizedTimeline = timeline;

    // Update Counts in UI
    const tBadge = document.getElementById("ajTimelineBadgeCount");
    if (tBadge) tBadge.textContent = String(timeline.length);
    const tBanner = document.getElementById("ajTimelineBannerCount");
    if (tBanner) tBanner.textContent = `${timeline.length} Hadisə Siyahıdadır`;

    const vBadge = document.getElementById("ajVersionsBadgeCount");
    if (vBadge) vBadge.textContent = String(normalizedVersions.length);
    const vBanner = document.getElementById("ajVersionsBannerCount");
    if (vBanner) vBanner.textContent = `${normalizedVersions.length} Versiya Siyahıdadır`;
  },

  switchTab: function(tab) {
    this.hideDiffPopover();
    this.activeTab = tab;

    const tBtn = document.getElementById("ajTabTimelineBtn");
    const vBtn = document.getElementById("ajTabVersionsBtn");
    const tCont = document.getElementById("ajTabContentTimeline");
    const vCont = document.getElementById("ajTabContentVersions");

    if (tBtn) tBtn.classList.toggle("active", tab === "timeline");
    if (vBtn) vBtn.classList.toggle("active", tab === "versions");

    if (tCont) tCont.style.display = (tab === "timeline") ? "flex" : "none";
    if (vCont) vCont.style.display = (tab === "versions") ? "flex" : "none";

    this.renderActiveTab();
  },

  renderActiveTab: function() {
    if (!this.currentDiffData) return;
    if (this.activeTab === "timeline") {
      this.renderTimeline();
    } else {
      this.renderVersionsTable();
    }
  },

  // TAB 1: Render Chronological Event Stream Table
  renderTimeline: function() {
    const tbody = document.getElementById("ajTimelineTableBody");
    if (!tbody || !this.currentDiffData) return;

    const timeline = this.currentDiffData.normalizedTimeline || [];
    if (timeline.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 25px; color: #888;">Hadisə qeydə alınmayıb.</td></tr>`;
      return;
    }

    let html = "";
    timeline.forEach(item => {
      let badgeBg = "#e3f2fd";
      let badgeFg = "#002060";
      if (item.badge_class === "green") { badgeBg = "#e8f5e9"; badgeFg = "#2e7d32"; }
      else if (item.badge_class === "orange") { badgeBg = "#fff3e0"; badgeFg = "#e65100"; }
      else if (item.badge_class === "red") { badgeBg = "#ffebee"; badgeFg = "#c62828"; }

      html += `
        <tr style="height: 28px; border-bottom: 1px solid #e0dfd5; background: ${item.order % 2 === 1 ? '#faf9f6' : '#ffffff'};">
          <td style="text-align: center; color: #777; border: 1px solid #e5e2d3;">${item.order}</td>
          <td style="padding: 0 8px; font-weight: 600; color: #002060; white-space: nowrap; border: 1px solid #e5e2d3;">
            ${this.escapeHtml(item.datetime)}
          </td>
          <td style="padding: 0 8px; white-space: nowrap; border: 1px solid #e5e2d3;">
            <strong style="color: #0a3d91;">${this.escapeHtml(item.user)}</strong>
          </td>
          <td style="padding: 0 8px; white-space: nowrap; border: 1px solid #e5e2d3;">
            <span style="background: ${badgeBg}; color: ${badgeFg}; border: 1px solid ${badgeFg}; padding: 2px 7px; border-radius: 3px; font-weight: 600; font-size: 11px; display: inline-block;">
              ${this.escapeHtml(item.action)}
            </span>
          </td>
          <td style="padding: 0 8px; font-weight: 500; white-space: nowrap; border: 1px solid #e5e2d3;">
            ${this.escapeHtml(item.doc_status)}
          </td>
          <td style="padding: 0 8px; color: #444; font-size: 11px; border: 1px solid #e5e2d3;">
            ${this.escapeHtml(item.result)}
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  },

  // TAB 2: Render Version Rows Table
  renderVersionsTable: function() {
    const tbody = document.getElementById("ajVersionsTableBody");
    if (!tbody || !this.currentDiffData) return;

    const vers = this.currentDiffData.normalizedVersions || [];
    if (vers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 25px; color: #888;">Versiya tapılmadı.</td></tr>`;
      return;
    }

    let html = "";
    vers.forEach((v, idx) => {
      const isModified = v.verNum > 1;
      const hChg = v.headerChanges || [];

      let changesSummary = "— (İlkin sənəd)";
      if (isModified) {
        let chgList = [];
        if (v.addedCount > 0) chgList.push(`+${v.addedCount} yeni mal`);
        if (v.removedCount > 0) chgList.push(`-${v.removedCount} mal silinib`);
        if (v.replacedCount > 0) chgList.push(`${v.replacedCount} mal əvəzlənib`);
        if (v.modifiedCount > 0) chgList.push(`${v.modifiedCount} mal redaktə edilib (say/qiymət/faiz/uçot)`);
        hChg.forEach(c => {
          if (!chgList.includes(c.label)) chgList.push(c.label);
        });
        changesSummary = chgList.join(", ") || "Dəyişikliklər mövcuddur";
      }

      html += `
        <tr style="height: 36px; border-bottom: 1px solid #e0dfd5; background: ${idx % 2 === 1 ? '#faf9f6' : '#ffffff'}; cursor: pointer;"
            onclick="AuditJournal.openDocVersionModal(${idx})" title="Sənəd pəncərəsini açmaq üçün klik edin">
          <td style="text-align: center; border: 1px solid #e5e2d3;">
            <span class="badge ${isModified ? 'badge-red' : 'badge-blue'}" style="font-size: 11px;">
              v${v.verNum}
            </span>
          </td>
          <td style="padding: 0 8px; font-weight: 600; color: #002060; white-space: nowrap; border: 1px solid #e5e2d3;">
            ${this.escapeHtml(v.changeDate || v.date)}
          </td>
          <td style="padding: 0 8px; white-space: nowrap; border: 1px solid #e5e2d3;">
            <strong style="color: #0a3d91;">${this.escapeHtml(v.author)}</strong>
          </td>
          <td style="padding: 0 8px; white-space: nowrap; border: 1px solid #e5e2d3;">
            <span class="badge ${isModified ? 'badge-orange' : 'badge-green'}">
              ${isModified ? 'Redaktə (Dəyişiklik)' : 'Yaradılma (İlkin Halı)'}
            </span>
          </td>
          <td style="padding: 0 8px; font-size: 11px; color: ${isModified ? '#b71c1c' : '#555'}; font-weight: ${isModified ? '600' : 'normal'}; border: 1px solid #e5e2d3;">
            ${this.escapeHtml(changesSummary)}
          </td>
          <td style="padding: 0 8px; text-align: right; font-weight: bold; color: ${isModified ? '#b71c1c' : '#002060'}; border: 1px solid #e5e2d3;">
            ${Number(v.amount || 0).toFixed(2)}
          </td>
          <td style="padding: 0 8px; text-align: center; border: 1px solid #e5e2d3;">
            <span class="badge ${v.statusText === 'Təsdiqlənib' ? 'badge-green' : (v.statusText === 'Silinib' ? 'badge-red' : 'badge-orange')}">
              ${this.escapeHtml(v.statusText)}
            </span>
          </td>
          <td style="padding: 0 8px; text-align: center; border: 1px solid #e5e2d3;" onclick="event.stopPropagation();">
            <button class="btn-1c ${isModified ? 'btn-1c-primary' : ''}" style="height: 24px; padding: 0 10px; font-weight: 600; cursor: pointer;" onclick="AuditJournal.openDocVersionModal(${idx})">
              Sənədi Aç
            </button>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  },

  // ========================================================
  // DOCUMENT VERSION SNAPSHOT WINDOW (MODAL DIALOG)
  // ========================================================
  openDocVersionModal: function(vIdx) {
    if (!this.currentDiffData || !this.currentDiffData.normalizedVersions) return;
    this.selectedVersionIdx = vIdx;
    this.renderDocVersionWindow();

    const backdrop = document.getElementById("docViewModalBackdrop");
    const card = backdrop ? backdrop.querySelector(".doc-view-modal") : null;
    const maxBtn = document.getElementById("docViewMaxBtn");
    if (backdrop && card) {
      backdrop.classList.remove("minimized", "maximized");
      card.classList.remove("minimized", "maximized");
      if (maxBtn) {
        maxBtn.textContent = "□";
        maxBtn.title = "Böyüt / Bərpa et";
      }
      backdrop.style.display = "flex";
    }
  },

  closeDocViewModal: function() {
    this.hideDiffPopover();
    const backdrop = document.getElementById("docViewModalBackdrop");
    const card = backdrop ? backdrop.querySelector(".doc-view-modal") : null;
    if (backdrop) {
      backdrop.style.display = "none";
      backdrop.classList.remove("minimized", "maximized");
    }
    if (card) {
      card.classList.remove("minimized", "maximized");
    }
  },

  toggleMaximizeDocViewModal: function() {
    const backdrop = document.getElementById("docViewModalBackdrop");
    const modal = backdrop ? backdrop.querySelector(".doc-view-modal") : null;
    const maxBtn = document.getElementById("docViewMaxBtn");
    if (!backdrop || !modal) return;

    if (modal.classList.contains("minimized")) {
      modal.classList.remove("minimized");
      backdrop.classList.remove("minimized");
    }

    const isMax = modal.classList.toggle("maximized");
    backdrop.classList.toggle("maximized", isMax);

    if (maxBtn) {
      maxBtn.textContent = isMax ? "❐" : "□";
      maxBtn.title = isMax ? "Əvvəlki ölçüyə qaytar" : "Tam ekrana böyüt";
    }
  },

  toggleMinimizeDocViewModal: function() {
    const backdrop = document.getElementById("docViewModalBackdrop");
    const modal = backdrop ? backdrop.querySelector(".doc-view-modal") : null;
    const maxBtn = document.getElementById("docViewMaxBtn");
    if (!backdrop || !modal) return;

    const isMin = modal.classList.toggle("minimized");
    backdrop.classList.toggle("minimized", isMin);

    if (isMin) {
      modal.classList.remove("maximized");
      backdrop.classList.remove("maximized");
      if (maxBtn) {
        maxBtn.textContent = "□";
        maxBtn.title = "Tam ekrana böyüt";
      }
    }
  },

  selectDocWinVersion: function(vIdx) {
    this.hideDiffPopover();
    this.selectedVersionIdx = vIdx;
    this.renderDocVersionWindow();
  },

  renderDocVersionWindow: function() {
    const doc = this.currentDoc || (this.filteredItems && this.filteredItems[this.selectedIndex]) || {};
    const vers = (this.currentDiffData && this.currentDiffData.normalizedVersions) ? this.currentDiffData.normalizedVersions : [];
    if (vers.length === 0) return;

    const curVer = vers[this.selectedVersionIdx] || vers[0];
    const isModifiedVer = curVer.verNum > 1;

    // Window Title
    const titleEl = document.getElementById("docWinHeaderTitle");
    if (titleEl) {
      titleEl.textContent = `${doc.doc_type_title || doc.doc_type || this.currentDocType || 'Sənəd'} № ${doc.number || this.currentDocNumber || '—'} — ${curVer.verLabel}`;
    }

    // Version switcher buttons in modal toolbar
    let vButtonsHtml = `<span style="font-weight: bold; color: #002060;">Versiyalar:</span>`;
    vers.forEach((v, idx) => {
      const isAct = (idx === this.selectedVersionIdx);
      vButtonsHtml += `
        <button type="button" class="v-btn ${isAct ? 'active' : ''}" onclick="AuditJournal.selectDocWinVersion(${idx})">
          <span>${v.verLabel}</span>
        </button>
      `;
    });
    const vBtnsContainer = document.getElementById("docWinVersionButtons");
    if (vBtnsContainer) vBtnsContainer.innerHTML = vButtonsHtml;

    const vMetaContainer = document.getElementById("docWinVersionMeta");
    if (vMetaContainer) {
      vMetaContainer.innerHTML = `Müəllif: <strong style="color: #002060;">${this.escapeHtml(curVer.author)}</strong> | Dəyişilmə Tarixi: <strong style="color: #002060;">${this.escapeHtml(curVer.changeDate || curVer.date)}</strong>`;
    }

    // Header changes for this version
    const headerChanges = curVer.headerChanges || [];
    const dateChg = headerChanges.find(c => c.field === "date");
    const kontrChg = headerChanges.find(c => c.field === "kontragent");
    const commChg = headerChanges.find(c => c.field === "comment");
    const whChg = headerChanges.find(c => c.field === "warehouse");
    const contractChg = headerChanges.find(c => c.field === "contract");
    const buChg = headerChanges.find(c => c.field === "bu_record");
    const nuChg = headerChanges.find(c => c.field === "nu_record");
    const acctSettlementChg = headerChanges.find(c => c.field === "account_settlement");

    // Status card
    let badgesSummaryHtml = "";
    if (isModifiedVer) {
      if (curVer.addedCount > 0) {
        badgesSummaryHtml += `<span class="badge badge-green" style="background: #e8f5e9; color: #1b5e20; border: 1px solid #81c784; font-weight: bold;">+${curVer.addedCount} Yeni Mal</span>`;
      }
      if (curVer.replacedCount > 0) {
        badgesSummaryHtml += `<span class="badge badge-orange" style="background: #fff3e0; color: #e65100; border: 1px solid #ffb74d; font-weight: bold;">${curVer.replacedCount} Mal Əvəzlənib</span>`;
      }
      if (curVer.removedCount > 0) {
        badgesSummaryHtml += `<span class="badge badge-red" style="background: #ffebee; color: #c62828; border: 1px solid #ef5350; font-weight: bold;">-${curVer.removedCount} Mal Silinib</span>`;
      }
      if (curVer.modifiedCount > 0) {
        badgesSummaryHtml += `<span class="badge badge-orange" style="background: #fff8e1; color: #f57f17; border: 1px solid #ffe082; font-weight: bold;">${curVer.modifiedCount} Mal Redaktə Edilib</span>`;
      }
      if (headerChanges.length > 0) {
        badgesSummaryHtml += `<span class="badge badge-blue">${headerChanges.length} Rekvizit Dəyişib</span>`;
      }
      if (!badgesSummaryHtml) {
        badgesSummaryHtml = `<span class="badge badge-red">Redaktə Edilib</span>`;
      }
    } else {
      badgesSummaryHtml = `<span class="badge badge-green">İlkin Vəziyyət (Baza)</span>`;
    }

    let statusCardHtml = `
      <div style="background: ${isModifiedVer ? '#fff8f8' : '#f8fbfd'}; border: 1px solid ${isModifiedVer ? '#ffcdd2' : '#b6d4fe'}; padding: 8px 12px; border-radius: 4px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
        <div>
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <strong style="color: #002060; font-size: 13px;">${curVer.verLabel}</strong>
            ${badgesSummaryHtml}
            ${isModifiedVer ? '<span style="font-size: 11px; color: #777;">(Əvvəlki dəyəri görmək üçün narıncı/qırmızı xanaların üzərinə siçanı gətirin)</span>' : ''}
          </div>
        </div>
        <div style="text-align: right;">
          <span style="font-size: 11px; color: #666;">Yekun Məbləğ:</span>
          <strong style="font-size: 16px; color: ${isModifiedVer ? '#b71c1c' : '#002060'}; margin-left: 6px;">${Number(curVer.amount || 0).toFixed(2)} AZN</strong>
        </div>
      </div>
    `;

    // Sənədin Başlıq Sahələri (Rekvizitlər)
    let docHeaderHtml = `
      <div class="doc-full-form">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #dcd7c4; padding-bottom: 4px;">
          <strong style="color: #002060; font-size: 11px;">Sənədin Başlıq Sahələri (Rekvizitlər):</strong>
          <span style="font-size: 10px; color: #666;">${isModifiedVer ? 'Rəngli sahələrin üzərinə gəldikdə əvvəlki versiyanın dəyəri açılır' : 'İlkin sənəd məlumatları'}</span>
        </div>

        <div class="doc-form-grid">
          <!-- SƏNƏD № -->
          <div class="form-field">
            <span class="form-field-label">Sənəd Nömrəsi:</span>
            <div class="form-field-input" style="font-weight: bold; color: #002060;">
              <span>${this.escapeHtml(doc.number || '—')}</span>
            </div>
          </div>

          <!-- SƏNƏD TARİXİ -->
          <div class="form-field">
            <span class="form-field-label">Sənəd Tarixi:</span>
            ${dateChg 
              ? `<div class="form-field-input changed-cell" 
                      onmouseenter="AuditJournal.showDiffPopover(event, 'Sənəd Tarixi Dəyişdirilib', '${this.escapeHtml(dateChg.oldVal)}', '${this.escapeHtml(dateChg.newVal)}', '${this.escapeHtml(dateChg.note)}')" 
                      onmousemove="AuditJournal.moveDiffPopover(event)" 
                      onmouseleave="AuditJournal.hideDiffPopover()">
                   <strong>${this.escapeHtml(curVer.docDate || curVer.date)}</strong>
                   <span class="changed-badge">Əvvəl: ${this.escapeHtml(dateChg.oldVal)}</span>
                 </div>`
              : `<div class="form-field-input"><span>${this.escapeHtml(curVer.docDate || curVer.date)}</span></div>`
            }
          </div>

          <!-- DƏYİŞİLMƏ TARİXİ -->
          <div class="form-field">
            <span class="form-field-label">Dəyişilmə Tarixi:</span>
            <div class="form-field-input" style="color: #002060; font-weight: 600;">
              <span>${this.escapeHtml(curVer.changeDate || curVer.date || '—')}</span>
            </div>
          </div>

          <!-- SƏNƏD VƏZİYYƏTİ -->
          <div class="form-field">
            <span class="form-field-label">Sənəd Vəziyyəti:</span>
            <div class="form-field-input">
              <span class="badge ${curVer.statusText === 'Təsdiqlənib' ? 'badge-green' : (curVer.statusText === 'Silinib' ? 'badge-red' : 'badge-orange')}">${this.escapeHtml(curVer.statusText)}</span>
            </div>
          </div>

          <!-- MÜŞTƏRİ / KONTRAGENT -->
          <div class="form-field" style="grid-column: span 2;">
            <span class="form-field-label">Müştəri / Kontragent:</span>
            ${kontrChg 
              ? `<div class="form-field-input changed-cell" 
                      onmouseenter="AuditJournal.showDiffPopover(event, 'Müştəri / Kontragent Dəyişdirilib', '${this.escapeHtml(kontrChg.oldVal)}', '${this.escapeHtml(kontrChg.newVal)}', '${this.escapeHtml(kontrChg.note)}')" 
                      onmousemove="AuditJournal.moveDiffPopover(event)" 
                      onmouseleave="AuditJournal.hideDiffPopover()">
                   <strong>${this.escapeHtml(curVer.kontragent)}</strong>
                   <span class="changed-badge">Əvvəl: ${this.escapeHtml(kontrChg.oldVal)}</span>
                 </div>`
              : `<div class="form-field-input"><span>${this.escapeHtml(curVer.kontragent)}</span></div>`
            }
          </div>

          <!-- ANBAR -->
          <div class="form-field">
            <span class="form-field-label">Anbar:</span>
            ${whChg 
              ? `<div class="form-field-input changed-cell" 
                      onmouseenter="AuditJournal.showDiffPopover(event, 'Anbar Dəyişdirilib', '${this.escapeHtml(whChg.oldVal)}', '${this.escapeHtml(whChg.newVal)}', '${this.escapeHtml(whChg.note)}')" 
                      onmousemove="AuditJournal.moveDiffPopover(event)" 
                      onmouseleave="AuditJournal.hideDiffPopover()">
                   <strong>${this.escapeHtml(curVer.warehouse || '—')}</strong>
                   <span class="changed-badge">Əvvəl: ${this.escapeHtml(whChg.oldVal)}</span>
                 </div>`
              : `<div class="form-field-input"><span>${this.escapeHtml(curVer.warehouse || '—')}</span></div>`
            }
          </div>

          <!-- MÜQAVİLƏ -->
          <div class="form-field">
            <span class="form-field-label">Müqavilə:</span>
            ${contractChg 
              ? `<div class="form-field-input changed-cell" 
                      onmouseenter="AuditJournal.showDiffPopover(event, 'Müqavilə Dəyişdirilib', '${this.escapeHtml(contractChg.oldVal)}', '${this.escapeHtml(contractChg.newVal)}', '${this.escapeHtml(contractChg.note)}')" 
                      onmousemove="AuditJournal.moveDiffPopover(event)" 
                      onmouseleave="AuditJournal.hideDiffPopover()">
                   <strong>${this.escapeHtml(curVer.contract || '—')}</strong>
                   <span class="changed-badge">Əvvəl: ${this.escapeHtml(contractChg.oldVal)}</span>
                 </div>`
              : `<div class="form-field-input"><span>${this.escapeHtml(curVer.contract || '—')}</span></div>`
            }
          </div>

          <!-- MÜHASİBAT UÇOTU (БУ) -->
          <div class="form-field">
            <span class="form-field-label">Mühasibat Uçotu (БУ):</span>
            ${buChg 
              ? `<div class="form-field-input changed-cell" 
                      onmouseenter="AuditJournal.showDiffPopover(event, 'Mühasibat Uçotu (БУ) Dəyişdirilib', '${this.escapeHtml(buChg.oldVal)}', '${this.escapeHtml(buChg.newVal)}', '${this.escapeHtml(buChg.note)}')" 
                      onmousemove="AuditJournal.moveDiffPopover(event)" 
                      onmouseleave="AuditJournal.hideDiffPopover()">
                   <span class="badge ${curVer.buRecord ? 'badge-green' : 'badge-gray'}">${curVer.buRecord ? 'Bəli (Qeydə alınıb)' : 'Xeyr'}</span>
                   <span class="changed-badge">Əvvəl: ${this.escapeHtml(buChg.oldVal)}</span>
                 </div>`
              : `<div class="form-field-input"><span class="badge ${curVer.buRecord ? 'badge-green' : 'badge-gray'}">${curVer.buRecord ? 'Bəli (Qeydə alınıb)' : 'Xeyr'}</span></div>`
            }
          </div>

          <!-- VERGİ UÇOTU (НУ) -->
          <div class="form-field">
            <span class="form-field-label">Vergi Uçotu (НУ):</span>
            ${nuChg 
              ? `<div class="form-field-input changed-cell" 
                      onmouseenter="AuditJournal.showDiffPopover(event, 'Vergi Uçotu (НУ) Dəyişdirilib', '${this.escapeHtml(nuChg.oldVal)}', '${this.escapeHtml(nuChg.newVal)}', '${this.escapeHtml(nuChg.note)}')" 
                      onmousemove="AuditJournal.moveDiffPopover(event)" 
                      onmouseleave="AuditJournal.hideDiffPopover()">
                   <span class="badge ${curVer.nuRecord ? 'badge-green' : 'badge-gray'}">${curVer.nuRecord ? 'Bəli' : 'Xeyr'}</span>
                   <span class="changed-badge">Əvvəl: ${this.escapeHtml(nuChg.oldVal)}</span>
                 </div>`
              : `<div class="form-field-input"><span class="badge ${curVer.nuRecord ? 'badge-green' : 'badge-gray'}">${curVer.nuRecord ? 'Bəli' : 'Xeyr'}</span></div>`
            }
          </div>

          <!-- ŞƏRH (KOMMENT) -->
          <div class="form-field" style="grid-column: span 2;">
            <span class="form-field-label">Şərh (Komment):</span>
            ${commChg 
              ? `<div class="form-field-input changed-cell" 
                      onmouseenter="AuditJournal.showDiffPopover(event, 'Şərh (Komment) Dəyişdirilib', '${this.escapeHtml(commChg.oldVal)}', '${this.escapeHtml(commChg.newVal)}', '${this.escapeHtml(commChg.note)}')" 
                      onmousemove="AuditJournal.moveDiffPopover(event)" 
                      onmouseleave="AuditJournal.hideDiffPopover()">
                   <strong>${this.escapeHtml(curVer.comment)}</strong>
                   <span class="changed-badge">Əvvəl: ${this.escapeHtml(commChg.oldVal)}</span>
                 </div>`
              : `<div class="form-field-input"><span>${this.escapeHtml(curVer.comment || '(Şərh yazılmayıb)')}</span></div>`
            }
          </div>
        </div>
      </div>
    `;

    // Mallar Cədvəli
    let itemsRowsHtml = "";
    if (curVer.items && curVer.items.length > 0) {
      curVer.items.forEach(it => {
        const isAdded = (it.statusType === "added");
        const isRemoved = (it.statusType === "removed");
        const isReplaced = (it.statusType === "replaced");
        const isModified = (it.statusType === "modified");
        const isChanged = isAdded || isRemoved || isReplaced || isModified;

        const nameChg = it.changedFields ? it.changedFields.find(c => c.field === "name" || c.field === "new_item" || c.field === "removed_item") : null;
        const qtyChg = it.changedFields ? it.changedFields.find(c => c.field === "qty") : null;
        const priceChg = it.changedFields ? it.changedFields.find(c => c.field === "price") : null;
        const sumChg = it.changedFields ? it.changedFields.find(c => c.field === "sum") : null;
        const discAutoChg = it.changedFields ? it.changedFields.find(c => c.field === "discount_auto") : null;
        const discManualChg = it.changedFields ? it.changedFields.find(c => c.field === "discount_manual") : null;
        const vatChg = it.changedFields ? it.changedFields.find(c => c.field === "vat_rate") : null;
        const accBuChg = it.changedFields ? it.changedFields.find(c => c.field === "account_bu") : null;
        const accIncChg = it.changedFields ? it.changedFields.find(c => c.field === "income_account_bu") : null;

        // Row background & styling
        let rowBg = "#ffffff";
        let rowClass = "";
        if (isAdded) {
          rowBg = "#f1f8e9";
          rowClass = "row-added";
        } else if (isRemoved) {
          rowBg = "#fff5f5";
          rowClass = "row-removed";
        } else if (isReplaced) {
          rowBg = "#fffdf0";
          rowClass = "row-replaced";
        } else if (isModified) {
          rowBg = "#fff8f8";
          rowClass = "changed-row";
        }

        // Status Badge
        let statusBadgeHtml = '<span class="badge badge-gray">Dəyişməyib</span>';
        if (it.statusType === "base") {
          statusBadgeHtml = '<span class="badge badge-blue">İlkin Mal</span>';
        } else if (isAdded) {
          statusBadgeHtml = '<span class="badge badge-green" style="font-weight:bold; background:#e8f5e9; color:#1b5e20; border:1px solid #81c784;">+ Yeni Əlavə</span>';
        } else if (isRemoved) {
          statusBadgeHtml = '<span class="badge badge-red" style="font-weight:bold; background:#ffebee; color:#c62828; border:1px solid #ef5350;">✕ Silinib</span>';
        } else if (isReplaced) {
          statusBadgeHtml = '<span class="badge badge-orange" style="font-weight:bold; background:#fff3e0; color:#e65100; border:1px solid #ffb74d;">Mal Əvəzlənib</span>';
        } else if (isModified) {
          statusBadgeHtml = '<span class="badge badge-orange" style="background:#fff3e0; color:#d84315; border:1px solid #ffb74d;">Dəyişdirilib</span>';
        }

        // Malın Adı Xanasi
        let nameCellHtml = "";
        if (isAdded) {
          nameCellHtml = `
            <td style="padding: 0 8px; font-weight: 600; border: 1px solid #c8e6c9; background: #e8f5e9;" class="changed-cell"
                onmouseenter="AuditJournal.showDiffPopover(event, 'Yeni Mal Əlavə Edilib', '— (Əvvəlki sənəddə bu mal yox idi)', '${this.escapeHtml(it.name)} (${it.qty} ${this.escapeHtml(it.unit)})', 'Bu mal cari versiyada sənədə yeni əlavə edilib')"
                onmousemove="AuditJournal.moveDiffPopover(event)"
                onmouseleave="AuditJournal.hideDiffPopover()">
              <div style="display:flex; align-items:center; justify-content:space-between;">
                <span style="color: #1b5e20;">+ ${this.escapeHtml(it.name)}</span>
                <span class="changed-badge" style="background: #2e7d32; color: #fff;">Yeni Mal</span>
              </div>
            </td>
          `;
        } else if (isRemoved) {
          nameCellHtml = `
            <td style="padding: 0 8px; border: 1px solid #ffcdd2; background: #ffebee;" class="changed-cell"
                onmouseenter="AuditJournal.showDiffPopover(event, 'Mal Sənəddən Silinib', '${this.escapeHtml(it.name)} (${it.qty} ${this.escapeHtml(it.unit)})', '— (Silinib)', 'Bu mal cari versiyada sənəddən çıxarılıb / silinib')"
                onmousemove="AuditJournal.moveDiffPopover(event)"
                onmouseleave="AuditJournal.hideDiffPopover()">
              <div style="display:flex; align-items:center; justify-content:space-between;">
                <span style="color: #c62828; text-decoration: line-through; font-weight: 500;">${this.escapeHtml(it.name)}</span>
                <span class="changed-badge" style="background: #c62828; color: #fff;">Silinib</span>
              </div>
            </td>
          `;
        } else if (isReplaced) {
          nameCellHtml = `
            <td style="padding: 0 8px; border: 1px solid #ffe082; background: #fff8e1;" class="changed-cell"
                onmouseenter="AuditJournal.showDiffPopover(event, 'Mal Əvəzlənib (Dəyişdirilib)', '${this.escapeHtml(it.oldName || '')} (${this.escapeHtml(it.oldCode || '')})', '${this.escapeHtml(it.name)} (${this.escapeHtml(it.code)})', 'Əvvəlki mal bu sətirdən silinib başqa mal ilə əvəzlənib')"
                onmousemove="AuditJournal.moveDiffPopover(event)"
                onmouseleave="AuditJournal.hideDiffPopover()">
              <div style="display:flex; align-items:center; justify-content:space-between;">
                <div style="display:flex; flex-direction:column;">
                  <span style="font-size: 10px; color: #c62828; text-decoration: line-through;">Əvvəl: ${this.escapeHtml(it.oldName || '')}</span>
                  <span style="color: #002060; font-weight: bold;">İndi: ${this.escapeHtml(it.name)}</span>
                </div>
                <span class="changed-badge" style="background: #e65100; color: #fff;">Əvəzləndi</span>
              </div>
            </td>
          `;
        } else if (nameChg) {
          nameCellHtml = `
            <td style="padding: 0 8px; font-weight: 500; border: 1px solid #e5e2d3;" class="changed-cell"
                onmouseenter="AuditJournal.showDiffPopover(event, 'Malın Adı Dəyişdirilib', '${this.escapeHtml(nameChg.oldVal)}', '${this.escapeHtml(nameChg.newVal)}', '${this.escapeHtml(nameChg.note)}')"
                onmousemove="AuditJournal.moveDiffPopover(event)"
                onmouseleave="AuditJournal.hideDiffPopover()">
              <span>${this.escapeHtml(it.name)}</span>
              <span class="changed-badge">Əvvəl: ${this.escapeHtml(nameChg.oldVal)}</span>
            </td>
          `;
        } else {
          nameCellHtml = `
            <td style="padding: 0 8px; font-weight: 500; border: 1px solid #e5e2d3;">
              <span>${this.escapeHtml(it.name)}</span>
            </td>
          `;
        }

        // Mal Kodu xanası
        let codeCellHtml = "";
        if (isReplaced && it.oldCode && it.oldCode !== it.code) {
          codeCellHtml = `
            <td style="padding: 0 8px; border: 1px solid #ffe082;">
              <div style="display:flex; flex-direction:column;">
                <span style="font-size: 9px; color: #c62828; text-decoration: line-through;">${this.escapeHtml(it.oldCode)}</span>
                <span style="font-weight: 600; color: #002060;">${this.escapeHtml(it.code)}</span>
              </div>
            </td>
          `;
        } else if (isRemoved) {
          codeCellHtml = `<td style="padding: 0 8px; color: #c62828; text-decoration: line-through; border: 1px solid #e5e2d3;">${this.escapeHtml(it.code)}</td>`;
        } else if (isAdded) {
          codeCellHtml = `<td style="padding: 0 8px; font-weight: 600; color: #1b5e20; border: 1px solid #e5e2d3;">${this.escapeHtml(it.code)}</td>`;
        } else {
          codeCellHtml = `<td style="padding: 0 8px; font-weight: 600; color: #002060; border: 1px solid #e5e2d3;">${this.escapeHtml(it.code)}</td>`;
        }

        // Artikul xanası
        const artikulCellHtml = isRemoved 
          ? `<td style="padding: 0 8px; color: #c62828; text-decoration: line-through; border: 1px solid #e5e2d3;">${this.escapeHtml(it.artikul)}</td>`
          : `<td style="padding: 0 8px; color: #555; border: 1px solid #e5e2d3;">${this.escapeHtml(it.artikul)}</td>`;

        // Vahid xanası
        const unitCellHtml = isRemoved
          ? `<td style="padding: 0 8px; text-align: center; color: #c62828; text-decoration: line-through; border: 1px solid #e5e2d3;">${this.escapeHtml(it.unit)}</td>`
          : `<td style="padding: 0 8px; text-align: center; border: 1px solid #e5e2d3;">${this.escapeHtml(it.unit)}</td>`;

        // Miqdar (Say) xanası
        let qtyCellHtml = "";
        if (isRemoved) {
          qtyCellHtml = `<td style="padding: 0 8px; text-align: right; color: #c62828; text-decoration: line-through; border: 1px solid #e5e2d3;">${it.qty}</td>`;
        } else if (qtyChg) {
          qtyCellHtml = `
            <td style="padding: 0 8px; text-align: right; border: 1px solid #e5e2d3;" class="changed-cell"
                onmouseenter="AuditJournal.showDiffPopover(event, 'Miqdar (Say) Dəyişdirilib', '${this.escapeHtml(qtyChg.oldVal)}', '${this.escapeHtml(qtyChg.newVal)}', '${this.escapeHtml(qtyChg.note)}')"
                onmousemove="AuditJournal.moveDiffPopover(event)"
                onmouseleave="AuditJournal.hideDiffPopover()">
              <div style="display:flex; flex-direction:column; align-items:flex-end;">
                <span style="font-size:10px; color:#777; text-decoration:line-through;">${this.escapeHtml(qtyChg.oldVal)}</span>
                <span style="font-size:12px; font-weight:bold; color:#b71c1c;">${this.escapeHtml(qtyChg.newVal)}</span>
              </div>
            </td>
          `;
        } else if (isAdded) {
          qtyCellHtml = `<td style="padding: 0 8px; text-align: right; font-weight: bold; color: #1b5e20; border: 1px solid #e5e2d3;">${it.qty}</td>`;
        } else {
          qtyCellHtml = `<td style="padding: 0 8px; text-align: right; border: 1px solid #e5e2d3;"><strong>${it.qty}</strong></td>`;
        }

        // Qiymət xanası
        let priceCellHtml = "";
        if (isRemoved) {
          priceCellHtml = `<td style="padding: 0 8px; text-align: right; color: #c62828; text-decoration: line-through; border: 1px solid #e5e2d3;">${Number(it.price || 0).toFixed(2)}</td>`;
        } else if (priceChg) {
          priceCellHtml = `
            <td style="padding: 0 8px; text-align: right; border: 1px solid #e5e2d3;" class="changed-cell"
                onmouseenter="AuditJournal.showDiffPopover(event, 'Qiymət Dəyişdirilib', '${this.escapeHtml(priceChg.oldVal)}', '${this.escapeHtml(priceChg.newVal)}', '${this.escapeHtml(priceChg.note)}')"
                onmousemove="AuditJournal.moveDiffPopover(event)"
                onmouseleave="AuditJournal.hideDiffPopover()">
              <div style="display:flex; flex-direction:column; align-items:flex-end;">
                <span style="font-size:10px; color:#777; text-decoration:line-through;">${this.escapeHtml(priceChg.oldVal)}</span>
                <span style="font-size:12px; font-weight:bold; color:#b71c1c;">${this.escapeHtml(priceChg.newVal)}</span>
              </div>
            </td>
          `;
        } else {
          priceCellHtml = `<td style="padding: 0 8px; text-align: right; border: 1px solid #e5e2d3;"><span>${Number(it.price || 0).toFixed(2)}</span></td>`;
        }

        // Avto Faiz % xanası
        let discAutoCellHtml = "";
        const curDiscAutoStr = Number(it.discountAuto || 0).toFixed(2);
        if (isRemoved) {
          discAutoCellHtml = `<td style="padding: 0 8px; text-align: right; color: #c62828; text-decoration: line-through; border: 1px solid #e5e2d3;">${curDiscAutoStr}%</td>`;
        } else if (discAutoChg) {
          discAutoCellHtml = `
            <td style="padding: 0 8px; text-align: right; border: 1px solid #e5e2d3;" class="changed-cell"
                onmouseenter="AuditJournal.showDiffPopover(event, 'Avtomatik Faiz % Dəyişdirilib', '${this.escapeHtml(discAutoChg.oldVal)}', '${this.escapeHtml(discAutoChg.newVal)}', '${this.escapeHtml(discAutoChg.note)}')"
                onmousemove="AuditJournal.moveDiffPopover(event)"
                onmouseleave="AuditJournal.hideDiffPopover()">
              <div style="display:flex; flex-direction:column; align-items:flex-end;">
                <span style="font-size:10px; color:#777; text-decoration:line-through;">${this.escapeHtml(discAutoChg.oldVal)}</span>
                <span style="font-size:12px; font-weight:bold; color:#b71c1c;">${this.escapeHtml(discAutoChg.newVal)}</span>
              </div>
            </td>
          `;
        } else {
          discAutoCellHtml = `<td style="padding: 0 8px; text-align: right; border: 1px solid #e5e2d3; color: ${Number(it.discountAuto || 0) > 0 ? '#002060; font-weight:600;' : '#777;'}">${curDiscAutoStr}%</td>`;
        }

        // Əl ilə Faiz % xanası
        let discManualCellHtml = "";
        const curDiscManualStr = Number(it.discountManual || 0).toFixed(2);
        if (isRemoved) {
          discManualCellHtml = `<td style="padding: 0 8px; text-align: right; color: #c62828; text-decoration: line-through; border: 1px solid #e5e2d3;">${curDiscManualStr}%</td>`;
        } else if (discManualChg) {
          discManualCellHtml = `
            <td style="padding: 0 8px; text-align: right; border: 1px solid #e5e2d3;" class="changed-cell"
                onmouseenter="AuditJournal.showDiffPopover(event, 'Əl ilə Faiz % Dəyişdirilib', '${this.escapeHtml(discManualChg.oldVal)}', '${this.escapeHtml(discManualChg.newVal)}', '${this.escapeHtml(discManualChg.note)}')"
                onmousemove="AuditJournal.moveDiffPopover(event)"
                onmouseleave="AuditJournal.hideDiffPopover()">
              <div style="display:flex; flex-direction:column; align-items:flex-end;">
                <span style="font-size:10px; color:#777; text-decoration:line-through;">${this.escapeHtml(discManualChg.oldVal)}</span>
                <span style="font-size:12px; font-weight:bold; color:#b71c1c;">${this.escapeHtml(discManualChg.newVal)}</span>
              </div>
            </td>
          `;
        } else {
          discManualCellHtml = `<td style="padding: 0 8px; text-align: right; border: 1px solid #e5e2d3; color: ${Number(it.discountManual || 0) > 0 ? '#002060; font-weight:600;' : '#777;'}">${curDiscManualStr}%</td>`;
        }

        // ƏDV xanası
        let vatCellHtml = "";
        const vatDisplay = it.vatRate || "—";
        if (isRemoved) {
          vatCellHtml = `<td style="padding: 0 8px; text-align: center; color: #c62828; text-decoration: line-through; border: 1px solid #e5e2d3;">${this.escapeHtml(vatDisplay)}</td>`;
        } else if (vatChg) {
          vatCellHtml = `
            <td style="padding: 0 8px; text-align: center; border: 1px solid #e5e2d3;" class="changed-cell"
                onmouseenter="AuditJournal.showDiffPopover(event, 'ƏDV Dərəcəsi Dəyişdirilib', '${this.escapeHtml(vatChg.oldVal)}', '${this.escapeHtml(vatChg.newVal)}', '${this.escapeHtml(vatChg.note)}')"
                onmousemove="AuditJournal.moveDiffPopover(event)"
                onmouseleave="AuditJournal.hideDiffPopover()">
              <div style="display:flex; flex-direction:column; align-items:center;">
                <span style="font-size:10px; color:#777; text-decoration:line-through;">${this.escapeHtml(vatChg.oldVal)}</span>
                <span style="font-size:11px; font-weight:bold; color:#b71c1c;">${this.escapeHtml(vatChg.newVal)}</span>
              </div>
            </td>
          `;
        } else {
          vatCellHtml = `<td style="padding: 0 8px; text-align: center; border: 1px solid #e5e2d3; color: #555;">${this.escapeHtml(vatDisplay)}</td>`;
        }

        // Məbləğ xanası
        let sumCellHtml = "";
        if (isRemoved) {
          sumCellHtml = `<td style="padding: 0 8px; text-align: right; color: #c62828; text-decoration: line-through; border: 1px solid #e5e2d3;">${Number(it.sum || 0).toFixed(2)}</td>`;
        } else if (sumChg) {
          sumCellHtml = `
            <td style="padding: 0 8px; text-align: right; border: 1px solid #e5e2d3;" class="changed-cell"
                onmouseenter="AuditJournal.showDiffPopover(event, 'Məbləğ Dəyişdirilib', '${this.escapeHtml(sumChg.oldVal)}', '${this.escapeHtml(sumChg.newVal)}', '${this.escapeHtml(sumChg.note)}')"
                onmousemove="AuditJournal.moveDiffPopover(event)"
                onmouseleave="AuditJournal.hideDiffPopover()">
              <div style="display:flex; flex-direction:column; align-items:flex-end;">
                <span style="font-size:10px; color:#777; text-decoration:line-through;">${this.escapeHtml(sumChg.oldVal)}</span>
                <span style="font-size:13px; font-weight:bold; color:#b71c1c;">${this.escapeHtml(sumChg.newVal)}</span>
              </div>
            </td>
          `;
        } else if (isAdded) {
          sumCellHtml = `<td style="padding: 0 8px; text-align: right; font-weight: bold; color: #1b5e20; border: 1px solid #e5e2d3;">${Number(it.sum || 0).toFixed(2)}</td>`;
        } else {
          sumCellHtml = `<td style="padding: 0 8px; text-align: right; border: 1px solid #e5e2d3;"><strong>${Number(it.sum || 0).toFixed(2)}</strong></td>`;
        }

        // Uçot Hesabı (БУ) xanası
        let accBuCellHtml = "";
        const accBuDisplay = it.accountBu || "—";
        if (isRemoved) {
          accBuCellHtml = `<td style="padding: 0 8px; text-align: center; color: #c62828; text-decoration: line-through; border: 1px solid #e5e2d3;">${this.escapeHtml(accBuDisplay)}</td>`;
        } else if (accBuChg) {
          accBuCellHtml = `
            <td style="padding: 0 8px; text-align: center; border: 1px solid #e5e2d3;" class="changed-cell"
                onmouseenter="AuditJournal.showDiffPopover(event, 'Uçot Hesabı (БУ) Dəyişdirilib', '${this.escapeHtml(accBuChg.oldVal)}', '${this.escapeHtml(accBuChg.newVal)}', '${this.escapeHtml(accBuChg.note)}')"
                onmousemove="AuditJournal.moveDiffPopover(event)"
                onmouseleave="AuditJournal.hideDiffPopover()">
              <div style="display:flex; flex-direction:column; align-items:center;">
                <span style="font-size:10px; color:#777; text-decoration:line-through;">${this.escapeHtml(accBuChg.oldVal)}</span>
                <span style="font-size:11px; font-weight:bold; color:#b71c1c;">${this.escapeHtml(accBuChg.newVal)}</span>
              </div>
            </td>
          `;
        } else {
          accBuCellHtml = `<td style="padding: 0 8px; text-align: center; font-weight: 600; color: #002060; border: 1px solid #e5e2d3;">${this.escapeHtml(accBuDisplay)}</td>`;
        }

        // Gəlir Hesabı (БУ) xanası
        let accIncCellHtml = "";
        const accIncDisplay = it.incomeAccountBu || "—";
        if (isRemoved) {
          accIncCellHtml = `<td style="padding: 0 8px; text-align: center; color: #c62828; text-decoration: line-through; border: 1px solid #e5e2d3;">${this.escapeHtml(accIncDisplay)}</td>`;
        } else if (accIncChg) {
          accIncCellHtml = `
            <td style="padding: 0 8px; text-align: center; border: 1px solid #e5e2d3;" class="changed-cell"
                onmouseenter="AuditJournal.showDiffPopover(event, 'Gəlir Hesabı (БУ) Dəyişdirilib', '${this.escapeHtml(accIncChg.oldVal)}', '${this.escapeHtml(accIncChg.newVal)}', '${this.escapeHtml(accIncChg.note)}')"
                onmousemove="AuditJournal.moveDiffPopover(event)"
                onmouseleave="AuditJournal.hideDiffPopover()">
              <div style="display:flex; flex-direction:column; align-items:center;">
                <span style="font-size:10px; color:#777; text-decoration:line-through;">${this.escapeHtml(accIncChg.oldVal)}</span>
                <span style="font-size:11px; font-weight:bold; color:#b71c1c;">${this.escapeHtml(accIncChg.newVal)}</span>
              </div>
            </td>
          `;
        } else {
          accIncCellHtml = `<td style="padding: 0 8px; text-align: center; font-weight: 600; color: #002060; border: 1px solid #e5e2d3;">${this.escapeHtml(accIncDisplay)}</td>`;
        }

        itemsRowsHtml += `
          <tr class="${rowClass}" style="height: 32px; border-bottom: 1px solid #e0dfd5; background: ${rowBg};">
            <td style="text-align: center; color: ${isRemoved ? '#c62828; text-decoration: line-through;' : '#555;'}; border: 1px solid #e5e2d3;">${it.lineNo}</td>
            ${codeCellHtml}
            ${artikulCellHtml}
            ${nameCellHtml}
            ${unitCellHtml}
            ${qtyCellHtml}
            ${priceCellHtml}
            ${discAutoCellHtml}
            ${discManualCellHtml}
            ${vatCellHtml}
            ${sumCellHtml}
            ${accBuCellHtml}
            ${accIncCellHtml}
            <td style="padding: 0 8px; text-align: center; border: 1px solid #e5e2d3;">
              ${statusBadgeHtml}
            </td>
          </tr>
        `;
      });
    } else {
      itemsRowsHtml = `<tr><td colspan="14" style="text-align: center; padding: 25px; color: #888;">Mallar cədvəli boşdur.</td></tr>`;
    }

    const bodyContent = document.getElementById("docWinBodyContent");
    if (bodyContent) {
      bodyContent.innerHTML = `
        ${statusCardHtml}
        ${docHeaderHtml}

        <div style="border: 1px solid #b0af9f; border-radius: 3px; overflow: hidden; margin-top: 4px;">
          <div style="background: #e3dec9; padding: 5px 10px; border-bottom: 1px solid #b0af9f; font-weight: bold; color: #002060; font-size: 11px;">
            Sənədin Mallar Cədvəli:
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 11px; background: #fff;">
            <thead>
              <tr style="height: 28px; background: #f0ede1;">
                <th style="width: 32px; text-align: center; border: 1px solid #b0af9f;">№</th>
                <th style="width: 90px; text-align: left; padding: 0 6px; border: 1px solid #b0af9f;">Mal Kodu</th>
                <th style="width: 80px; text-align: left; padding: 0 6px; border: 1px solid #b0af9f;">Artikul</th>
                <th style="text-align: left; padding: 0 6px; border: 1px solid #b0af9f;">Malın Tam Adı</th>
                <th style="width: 45px; text-align: center; border: 1px solid #b0af9f;">Vahid</th>
                <th style="width: 85px; text-align: right; padding: 0 6px; border: 1px solid #b0af9f;">Miqdar</th>
                <th style="width: 90px; text-align: right; padding: 0 6px; border: 1px solid #b0af9f;">Qiymət</th>
                <th style="width: 85px; text-align: right; padding: 0 6px; border: 1px solid #b0af9f;" title="Avtomatik Endirim Faizi">Avto Faiz %</th>
                <th style="width: 85px; text-align: right; padding: 0 6px; border: 1px solid #b0af9f;" title="Əl ilə Endirim Faizi">Əl ilə Faiz %</th>
                <th style="width: 70px; text-align: center; padding: 0 6px; border: 1px solid #b0af9f;">ƏDV</th>
                <th style="width: 105px; text-align: right; padding: 0 6px; border: 1px solid #b0af9f;">Yekun Məbləğ</th>
                <th style="width: 75px; text-align: center; padding: 0 6px; border: 1px solid #b0af9f;" title="Mühasibat Uçotu Hesabı (БУ)">Uçot (БУ)</th>
                <th style="width: 75px; text-align: center; padding: 0 6px; border: 1px solid #b0af9f;" title="Gəlir Hesabı (БУ)">Gəlir (БУ)</th>
                <th style="width: 100px; text-align: center; padding: 0 6px; border: 1px solid #b0af9f;">Versiya Qeydi</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRowsHtml}
            </tbody>
          </table>
        </div>
      `;
    }
  },

  // ========================================================
  // FLOATING DIFF POPOVER ON HOVER
  // ========================================================
  showDiffPopover: function(e, title, oldVal, newVal, note) {
    const pop = document.getElementById("diffPopover");
    if (!pop) return;

    const titleEl = document.getElementById("diffPopTitle");
    if (titleEl) titleEl.textContent = title || "Dəyişiklik Fərqi";

    const oldEl = document.getElementById("diffPopOld");
    if (oldEl) oldEl.textContent = oldVal || "(Boş idi)";

    const newEl = document.getElementById("diffPopNew");
    if (newEl) newEl.textContent = newVal || "";

    const noteEl = document.getElementById("diffPopNote");
    if (noteEl) {
      if (note) {
        noteEl.textContent = note;
        noteEl.style.display = "block";
      } else {
        noteEl.style.display = "none";
      }
    }

    pop.style.display = "block";
    this.positionPopover(e);
  },

  moveDiffPopover: function(e) {
    this.positionPopover(e);
  },

  hideDiffPopover: function() {
    const pop = document.getElementById("diffPopover");
    if (pop) pop.style.display = "none";
  },

  positionPopover: function(e) {
    const pop = document.getElementById("diffPopover");
    if (!pop || pop.style.display === "none") return;

    const pad = 12;
    let x = e.clientX + pad;
    let y = e.clientY + pad;

    const w = pop.offsetWidth || 280;
    const h = pop.offsetHeight || 130;

    if (x + w > window.innerWidth - 10) {
      x = e.clientX - w - pad;
    }
    if (y + h > window.innerHeight - 10) {
      y = e.clientY - h - pad;
    }

    pop.style.left = `${Math.max(10, x)}px`;
    pop.style.top = `${Math.max(10, y)}px`;
  },

  openSelectedDocEditor: function() {
    const doc = this.filteredItems[this.selectedIndex];
    if (!doc) {
      alert("Zəhmət olmasa sənəd seçin.");
      return;
    }

    const docType = doc.doc_type;
    const docNum = doc.number;

    if (docType === "ПогрузкиМашин") {
      if (window.PogruzkaDocEditor) {
        PogruzkaDocEditor.open(docNum);
      }
    } else if (docType === "УстановкаЦенНоменклатуры") {
      if (window.PriceDocEditor) {
        PriceDocEditor.open(docNum);
      }
    } else if (docType === "ВозвратТоваровОтПокупателя") {
      if (window.UniversalJournal) {
        UniversalJournal.openDirect("ВозвратТоваровОтПокупателя", { search: docNum });
      }
    } else {
      if (window.SalesDocEditor) {
        SalesDocEditor.open(docNum);
      } else if (window.UniversalJournal) {
        UniversalJournal.openDirect(docType, { search: docNum });
      }
    }
  },

  printCurrentAudit: function() {
    const doc = this.filteredItems[this.selectedIndex];
    if (!doc || !this.currentDiffData) {
      alert("Çap etmək üçün sənəd seçilməyib.");
      return;
    }

    const vers = (this.currentDiffData && this.currentDiffData.normalizedVersions) ? this.currentDiffData.normalizedVersions : [];
    const curV = vers[this.selectedVersionIdx] || {};

    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Audit Tarixçəsi: ${doc.doc_type_title || doc.doc_type} № ${doc.number}</title>
        <style>
          body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; color: #222; }
          h2 { margin: 0 0 5px 0; color: #002060; }
          .sub { color: #666; margin-bottom: 15px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
          th, td { border: 1px solid #999; padding: 4px 8px; }
          th { background: #eee; }
        </style>
      </head>
      <body>
        <h2>1C:MÜƏSSİSƏ AUDİT VƏ DƏYİŞİKLİK PROTOKOLU</h2>
        <div class="sub">Sənəd: <strong>${doc.doc_type_title || doc.doc_type} № ${doc.number}</strong> | Tarix: <strong>${doc.date}</strong> | Müştəri: <strong>${doc.kontragent}</strong> | Məsul şəxs: <strong>${doc.last_author}</strong></div>
        <h3>Dəyişikliklər Xronologiyası:</h3>
        <table>
          <thead><tr><th>№</th><th>Tarix və Saat</th><th>İstifadəçi</th><th>Əməliyyat</th><th>Nəticə</th></tr></thead>
          <tbody>
    `;

    const timeline = (this.currentDiffData && this.currentDiffData.normalizedTimeline) ? this.currentDiffData.normalizedTimeline : [];
    timeline.forEach(ev => {
      html += `<tr><td>${ev.order}</td><td>${ev.datetime}</td><td>${ev.user}</td><td><strong>${ev.action}</strong></td><td>${ev.result}</td></tr>`;
    });

    html += `
          </tbody>
        </table>
        <h3>Malların Cari Versiya Tərkibi (${curV.verLabel || 'Cari'}):</h3>
        <table>
          <thead><tr><th>№</th><th>Kod</th><th>Malın Adı</th><th>Say</th><th>Qiymət</th><th>Məbləğ</th></tr></thead>
          <tbody>
    `;

    (curV.items || []).forEach((it, i) => {
      html += `<tr><td>${i+1}</td><td>${it.code}</td><td>${it.name}</td><td style="text-align:right;">${it.qty}</td><td style="text-align:right;">${Number(it.price||0).toFixed(2)}</td><td style="text-align:right;">${Number(it.sum||it.total||0).toFixed(2)}</td></tr>`;
    });

    html += `
          </tbody>
        </table>
        <script>window.onload = function() { window.print(); };</script>
      </body>
      </html>
    `;

    const printWin = window.open("", "_blank", "width=850,height=600");
    if (printWin) {
      printWin.document.write(html);
      printWin.document.close();
    }
  },

  escapeHtml: function(text) {
    if (text === null || text === undefined) return "";
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
};

window.AuditJournal = AuditJournal;

document.addEventListener("DOMContentLoaded", () => {
  AuditJournal.init();
});
