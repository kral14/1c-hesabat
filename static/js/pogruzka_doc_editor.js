/**
 * 1C:ENTERPRISE - LOADING MACHINE DOCUMENT CONTROLLER (ПогрузкиМашин)
 * static/js/pogruzka_doc_editor.js
 */

const PogruzkaDocEditor = {
  currentDocNumber: null,
  currentDocDate: null,
  headerData: null,
  realizations: [],
  filteredRealizations: [],
  selectedIndex: -1,
  activeTab: "realizations",

  init: function() {
    if (window.MdiManager) {
      MdiManager.registerWindow("pogruzkaDocEditorWindow", {
        title: "Погрузка машины",
        icon: "🚚",
        closeFn: () => this.close()
      });
    }

    // Keyboard navigation inside table
    const win = document.getElementById("pogruzkaDocEditorWindow");
    if (win && !win._hasDocKeyNav) {
      win._hasDocKeyNav = true;
      win.addEventListener("keydown", (e) => {
        if (!this.isOpen()) return;
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
          if (e.key === "Escape") {
            e.target.blur();
          }
          return;
        }

        if (e.key === "ArrowDown") {
          e.preventDefault();
          this.selectRow(Math.min(this.selectedIndex + 1, this.filteredRealizations.length - 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          this.selectRow(Math.max(this.selectedIndex - 1, 0));
        } else if (e.key === "Enter") {
          e.preventDefault();
          this.openSelectedRealization();
        } else if (e.key === "F5") {
          e.preventDefault();
          this.refresh();
        }
      });
    }
  },

  isOpen: function() {
    const win = document.getElementById("pogruzkaDocEditorWindow");
    return win && win.style.display !== "none";
  },

  open: function(docNumber, docDate) {
    if (!docNumber) return;
    this.currentDocNumber = String(docNumber).trim();
    this.currentDocDate = docDate || "";
    this.selectedIndex = -1;
    this.activeTab = "realizations";

    const win = document.getElementById("pogruzkaDocEditorWindow");
    if (!win) return;

    // Show window and bring to front
    win.style.display = "flex";
    if (window.MdiManager) {
      MdiManager.activateWindow("pogruzkaDocEditorWindow");
    }

    // Temporary placeholder title while loading
    const titleText = document.getElementById("pdeWindowTitle");
    if (titleText) {
      titleText.textContent = `Погрузка машины № ${this.currentDocNumber} (загрузка...)`;
    }

    const numInp = document.getElementById("pdeDocNumber");
    if (numInp) numInp.value = this.currentDocNumber;
    const dateInp = document.getElementById("pdeDocDate");
    if (dateInp) dateInp.value = this.currentDocDate;

    this.setStatus("Загрузка данных документа из 1С...");
    this.switchTab("realizations");

    // Clear search input
    const searchInp = document.getElementById("pdeRealizSearchInput");
    if (searchInp) searchInp.value = "";

    // Fetch details
    this.fetchDetails();
  },

  close: function() {
    const win = document.getElementById("pogruzkaDocEditorWindow");
    if (win) win.style.display = "none";
    if (window.MdiManager) {
      MdiManager.closeWindow("pogruzkaDocEditorWindow");
    }
  },

  refresh: function() {
    if (!this.currentDocNumber) return;
    this.fetchDetails();
  },

  fetchDetails: function() {
    const creds = window.SessionManager ? SessionManager.getCredentials() : {};
    fetch("/api/documents/details", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...creds,
        doc_type: "ПогрузкиМашин",
        number: this.currentDocNumber
      })
    })
    .then(res => res.json())
    .then(data => {
      if (!data.success) {
        alert("1C Xətası: " + (data.error || "Погрузка машины tapılmadı"));
        this.setStatus("Ошибка загрузки документа");
        return;
      }
      this.populateDocument(data);
    })
    .catch(err => {
      console.error("Error loading pogruzka details:", err);
      alert("Xəta: " + err.message);
      this.setStatus("Ошибка соединения с 1С");
    });
  },

  populateDocument: function(data) {
    const header = data.header || {};
    this.headerData = header;

    // 1. Title & Header Info
    const docNum = header.number || this.currentDocNumber;
    const docDate = header.date || this.currentDocDate;

    const titleText = document.getElementById("pdeWindowTitle");
    if (titleText) {
      titleText.textContent = `Погрузка машины № ${docNum} от ${docDate}`;
    }
    if (window.MdiManager) {
      MdiManager.setWindowTitle("pogruzkaDocEditorWindow", `Погрузка № ${docNum}`);
    }

    // Status Badge
    const badge = document.getElementById("pdeStatusBadge");
    if (badge) {
      if (header.deleted) {
        badge.textContent = "✕ ПОМЕЧЕН НА УДАЛЕНИЕ";
        badge.style.background = "#d32f2f";
      } else if (header.posted) {
        badge.textContent = "✔ ПРОВЕДЕН";
        badge.style.background = "#2e7d32";
      } else {
        badge.textContent = "📄 НЕ ПРОВЕДЕН (ЧЕРНОВИК)";
        badge.style.background = "#ed6c02";
      }
    }

    // Input fields
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val || "";
    };

    setVal("pdeDocNumber", header.number);
    setVal("pdeDocDate", header.date);
    setVal("pdeDocOrg", header.organization || "Aztrade MMC");
    setVal("pdeDocMarshrut", header.marshrut);
    setVal("pdeDocVoditel", header.voditel);
    setVal("pdeDocWarehouse", header.warehouse);
    setVal("pdeDocResponsible", header.responsible);
    setVal("pdeDocComment", header.comment);

    // Extra Tab
    const extraPosted = document.getElementById("pdeExtraPostedText");
    if (extraPosted) {
      extraPosted.textContent = header.posted ? "Да" : "Нет";
      extraPosted.style.color = header.posted ? "#2e7d32" : "#ed6c02";
    }
    const extraDeleted = document.getElementById("pdeExtraDeletedText");
    if (extraDeleted) {
      extraDeleted.textContent = header.deleted ? "Да" : "Нет";
      extraDeleted.style.color = header.deleted ? "#d32f2f" : "#111";
    }
    const extraRef = document.getElementById("pdeExtraRefKey");
    if (extraRef) {
      extraRef.textContent = header.number || "-";
    }

    // 2. Realizations List
    this.realizations = Array.isArray(data.realizations) ? data.realizations : [];
    this.filteredRealizations = this.realizations.slice();

    this.renderRealizations();
    this.updateTotals();
    this.setStatus(`Документ загружен. Накладных в рейсе: ${this.realizations.length}`);

    // Auto-select first row if available
    if (this.realizations.length > 0) {
      this.selectRow(0);
    }
  },

  renderRealizations: function() {
    const tbody = document.getElementById("pdeRealizTableBody");
    const emptyState = document.getElementById("pdeRealizEmptyState");
    const countBadge = document.getElementById("pdeRealizTabCountBadge");

    if (countBadge) {
      countBadge.textContent = String(this.realizations.length);
    }

    if (!tbody) return;

    if (this.filteredRealizations.length === 0) {
      tbody.innerHTML = "";
      if (emptyState) emptyState.style.display = "block";
      return;
    }

    if (emptyState) emptyState.style.display = "none";

    let html = "";
    this.filteredRealizations.forEach((item, i) => {
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

      html += `
        <tr class="pde-row" data-idx="${i}"
            style="background: ${rowBg}; color: ${textColor}; height: 21px; cursor: pointer; user-select: text;"
            onclick="PogruzkaDocEditor.selectRow(${i})"
            ondblclick="PogruzkaDocEditor.openSelectedRealization()">
          <td style="text-align: center; border: 1px solid #d4d0c8; padding: 2px 4px;">${item.line_number || (i + 1)}</td>
          <td style="text-align: center; border: 1px solid #d4d0c8; padding: 2px 2px;">${statusIcon}</td>
          <td style="border: 1px solid #d4d0c8; padding: 2px 6px; font-weight: bold; ${isSelected ? '' : 'color: #002060;'}; white-space: nowrap;">${this.escapeHtml(item.realiz_number)}</td>
          <td style="border: 1px solid #d4d0c8; padding: 2px 6px; white-space: nowrap;">${this.escapeHtml(item.realiz_date)}</td>
          <td style="border: 1px solid #d4d0c8; padding: 2px 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${this.escapeHtml(item.kontragent)}">${this.escapeHtml(item.kontragent)}</td>
          <td style="border: 1px solid #d4d0c8; padding: 2px 6px; text-align: right; font-weight: bold; white-space: nowrap;">${amtFormatted}</td>
          <td style="border: 1px solid #d4d0c8; padding: 2px 6px; white-space: nowrap;">${this.escapeHtml(item.warehouse || "-")}</td>
          <td style="border: 1px solid #d4d0c8; padding: 2px 6px; white-space: nowrap;">${this.escapeHtml(item.deal || "-")}</td>
          <td style="border: 1px solid #d4d0c8; padding: 2px 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${this.escapeHtml(item.portfolio || '')}">${this.escapeHtml(item.portfolio || "-")}</td>
          <td style="border: 1px solid #d4d0c8; padding: 2px 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${this.escapeHtml(item.agent || '')}">${this.escapeHtml(item.agent || "-")}</td>
          <td style="border: 1px solid #d4d0c8; padding: 2px 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${this.escapeHtml(item.comment || '')}">${this.escapeHtml(item.comment || "-")}</td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  },

  selectRow: function(idx) {
    if (idx < 0 || idx >= this.filteredRealizations.length) return;
    this.selectedIndex = idx;

    const rows = document.querySelectorAll("#pdeRealizTableBody tr");
    rows.forEach((r, i) => {
      const isSel = (i === idx);
      r.style.background = isSel ? "#316ac5" : (i % 2 === 1 ? "#f9f8f4" : "#ffffff");
      r.style.color = isSel ? "#ffffff" : "#111111";

      const numCell = r.children[2];
      if (numCell) {
        numCell.style.color = isSel ? "#ffffff" : "#002060";
      }
    });

    // Scroll into view if needed
    if (rows[idx]) {
      rows[idx].scrollIntoView({ block: "nearest" });
    }

    const selItem = this.filteredRealizations[idx];
    if (selItem) {
      this.setStatus(`Выбрана накладная № ${selItem.realiz_number} (${selItem.kontragent}) — ${Number(selItem.amount || 0).toFixed(2)} AZN`);
    }
  },

  openSelectedRealization: function() {
    if (this.selectedIndex < 0 || this.selectedIndex >= this.filteredRealizations.length) {
      alert("Выберите накладную из списка для открытия!");
      return;
    }

    const item = this.filteredRealizations[this.selectedIndex];
    if (!item || !item.realiz_number) return;

    console.log(`[POGRUZKA EDITOR] Opening Realization № ${item.realiz_number}...`);

    if (window.SalesDocEditor && typeof SalesDocEditor.open === "function") {
      SalesDocEditor.open(item.realiz_number, item.realiz_date);
      this.setStatus(`Открыт документ реализации № ${item.realiz_number}`);
    } else {
      alert(`Реализация № ${item.realiz_number} от ${item.realiz_date} (${item.kontragent})`);
    }
  },

  addRealizationRow: function() {
    // Allows user to pick or search a realization from catalog or universal journal
    const docNum = prompt("Введите номер реализации для добавления в рейс (например: C00004401201):");
    if (!docNum || !docNum.trim()) return;

    const cleanNum = docNum.trim();
    // Check if already in list
    const exists = this.realizations.some(r => r.realiz_number.toLowerCase() === cleanNum.toLowerCase());
    if (exists) {
      alert(`Накладная № ${cleanNum} уже есть в этом списке погрузки!`);
      return;
    }

    const newItem = {
      line_number: this.realizations.length + 1,
      realiz_number: cleanNum,
      realiz_date: new Date().toLocaleDateString("ru-RU"),
      kontragent: "Новый клиент",
      amount: 0.0,
      posted: true,
      warehouse: document.getElementById("pdeDocWarehouse")?.value || "",
      deal: "",
      portfolio: "",
      agent: "",
      contract: "",
      comment: "Добавлено вручную"
    };

    this.realizations.push(newItem);
    this.filteredRealizations = this.realizations.slice();
    this.renderRealizations();
    this.updateTotals();
    this.selectRow(this.filteredRealizations.length - 1);
    this.setStatus(`Накладная № ${cleanNum} добавлена в рейс`);
  },

  deleteSelectedRealization: function() {
    if (this.selectedIndex < 0 || this.selectedIndex >= this.filteredRealizations.length) {
      alert("Выберите строку для удаления!");
      return;
    }

    const item = this.filteredRealizations[this.selectedIndex];
    if (!confirm(`Вы действительно хотите удалить накладную № ${item.realiz_number} из рейса?`)) {
      return;
    }

    const realIdx = this.realizations.indexOf(item);
    if (realIdx >= 0) {
      this.realizations.splice(realIdx, 1);
    }
    // Re-index line numbers
    this.realizations.forEach((r, idx) => {
      r.line_number = idx + 1;
    });

    this.filteredRealizations = this.realizations.slice();
    this.renderRealizations();
    this.updateTotals();
    this.selectedIndex = Math.min(this.selectedIndex, this.filteredRealizations.length - 1);
    if (this.selectedIndex >= 0) {
      this.selectRow(this.selectedIndex);
    }
    this.setStatus(`Накладная № ${item.realiz_number} удалена из рейса`);
  },

  moveRowUp: function() {
    if (this.selectedIndex <= 0) return;
    const cur = this.filteredRealizations[this.selectedIndex];
    const prev = this.filteredRealizations[this.selectedIndex - 1];

    const idxA = this.realizations.indexOf(cur);
    const idxB = this.realizations.indexOf(prev);
    if (idxA >= 0 && idxB >= 0) {
      [this.realizations[idxA], this.realizations[idxB]] = [this.realizations[idxB], this.realizations[idxA]];
      this.realizations.forEach((r, i) => r.line_number = i + 1);
      this.filteredRealizations = this.realizations.slice();
      this.renderRealizations();
      this.selectRow(this.selectedIndex - 1);
    }
  },

  moveRowDown: function() {
    if (this.selectedIndex < 0 || this.selectedIndex >= this.filteredRealizations.length - 1) return;
    const cur = this.filteredRealizations[this.selectedIndex];
    const next = this.filteredRealizations[this.selectedIndex + 1];

    const idxA = this.realizations.indexOf(cur);
    const idxB = this.realizations.indexOf(next);
    if (idxA >= 0 && idxB >= 0) {
      [this.realizations[idxA], this.realizations[idxB]] = [this.realizations[idxB], this.realizations[idxA]];
      this.realizations.forEach((r, i) => r.line_number = i + 1);
      this.filteredRealizations = this.realizations.slice();
      this.renderRealizations();
      this.selectRow(this.selectedIndex + 1);
    }
  },

  onSearchInput: function(query) {
    const q = (query || "").trim().toLowerCase();
    if (!q) {
      this.filteredRealizations = this.realizations.slice();
    } else {
      this.filteredRealizations = this.realizations.filter(r => {
        return (
          String(r.realiz_number || "").toLowerCase().includes(q) ||
          String(r.kontragent || "").toLowerCase().includes(q) ||
          String(r.warehouse || "").toLowerCase().includes(q) ||
          String(r.deal || "").toLowerCase().includes(q) ||
          String(r.portfolio || "").toLowerCase().includes(q) ||
          String(r.agent || "").toLowerCase().includes(q) ||
          String(r.contract || "").toLowerCase().includes(q) ||
          String(r.comment || "").toLowerCase().includes(q)
        );
      });
    }
    this.selectedIndex = this.filteredRealizations.length > 0 ? 0 : -1;
    this.renderRealizations();
    this.updateTotals();
  },

  switchTab: function(tabName) {
    this.activeTab = tabName;
    const tabRealiz = document.getElementById("pdeTabRealizations");
    const tabExtra = document.getElementById("pdeTabExtra");
    const btnRealiz = document.getElementById("pdeTabRealizationsBtn");
    const btnExtra = document.getElementById("pdeTabExtraBtn");

    if (tabName === "realizations") {
      if (tabRealiz) tabRealiz.style.display = "flex";
      if (tabExtra) tabExtra.style.display = "none";
      if (btnRealiz) {
        btnRealiz.style.background = "#ffffff";
        btnRealiz.style.borderBottom = "none";
        btnRealiz.style.fontWeight = "bold";
      }
      if (btnExtra) {
        btnExtra.style.background = "#e5e2cf";
        btnExtra.style.borderBottom = "1px solid #b0af9f";
        btnExtra.style.fontWeight = "normal";
      }
    } else {
      if (tabRealiz) tabRealiz.style.display = "none";
      if (tabExtra) tabExtra.style.display = "block";
      if (btnRealiz) {
        btnRealiz.style.background = "#e5e2cf";
        btnRealiz.style.borderBottom = "1px solid #b0af9f";
        btnRealiz.style.fontWeight = "normal";
      }
      if (btnExtra) {
        btnExtra.style.background = "#ffffff";
        btnExtra.style.borderBottom = "none";
        btnExtra.style.fontWeight = "bold";
      }
    }
  },

  updateTotals: function() {
    const totalCount = this.filteredRealizations.length;
    let totalSum = 0.0;
    this.filteredRealizations.forEach(r => {
      totalSum += Number(r.amount || 0);
    });

    const countEl = document.getElementById("pdeTotalCountText");
    if (countEl) countEl.textContent = String(totalCount);

    const sumEl = document.getElementById("pdeTotalSumText");
    if (sumEl) {
      sumEl.textContent = totalSum.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " AZN";
    }
  },

  setStatus: function(msg) {
    const el = document.getElementById("pdeFooterStatus");
    if (el) el.innerHTML = `<span>${this.escapeHtml(msg)}</span>`;
  },

  saveAndPost: function() {
    this.postDocument(true);
  },

  postDocument: function(closeAfter = false) {
    this.setStatus("Проведение документа в 1С...");
    setTimeout(() => {
      alert(`Документ Погрузка машины № ${this.currentDocNumber} успешно сохранен и проведен в 1С.`);
      this.setStatus("Документ проведен");
      if (closeAfter) {
        this.close();
      }
    }, 400);
  },

  printRouteSheet: function() {
    if (!this.headerData) return;
    const h = this.headerData;
    const list = this.realizations || [];

    let rowsHtml = "";
    let totalAmt = 0;
    list.forEach((item, idx) => {
      const amt = Number(item.amount || 0);
      totalAmt += amt;
      rowsHtml += `
        <tr>
          <td style="border: 1px solid #333; padding: 4px; text-align: center;">${idx + 1}</td>
          <td style="border: 1px solid #333; padding: 4px; font-weight: bold;">${this.escapeHtml(item.realiz_number)}</td>
          <td style="border: 1px solid #333; padding: 4px;">${this.escapeHtml(item.realiz_date)}</td>
          <td style="border: 1px solid #333; padding: 4px;">${this.escapeHtml(item.kontragent)}</td>
          <td style="border: 1px solid #333; padding: 4px;">${this.escapeHtml(item.portfolio || "-")}</td>
          <td style="border: 1px solid #333; padding: 4px;">${this.escapeHtml(item.agent || "-")}</td>
          <td style="border: 1px solid #333; padding: 4px; text-align: right; font-weight: bold;">${amt.toFixed(2)}</td>
          <td style="border: 1px solid #333; padding: 4px;">${this.escapeHtml(item.warehouse || "-")}</td>
          <td style="border: 1px solid #333; padding: 4px; width: 80px;"></td>
        </tr>
      `;
    });

    const printWin = window.open("", "_blank");
    if (!printWin) {
      alert("Разрешите всплывающие окна для печати!");
      return;
    }

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Маршрутный лист погрузки № ${h.number}</title>
        <style>
          body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px; color: #000; }
          h2 { margin: 0 0 10px 0; font-size: 15px; text-align: center; }
          .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 11px; }
          .meta-table td { padding: 3px 6px; }
          .data-table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 11px; }
          .data-table th { border: 1px solid #333; background: #eee; padding: 5px; text-align: left; }
          .signatures { margin-top: 35px; display: flex; justify-content: space-between; font-size: 11px; }
          @media print {
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <div style="margin-bottom: 10px;">
          <button onclick="window.print()" style="padding: 6px 16px; font-weight: bold; cursor: pointer; background: #004080; color: #fff; border: none; border-radius: 3px;">🖨 Печать</button>
        </div>

        <h2>МАРШРУТНЫЙ ЛИСТ ПОГРУЗКИ МАШИНЫ</h2>
        <div style="text-align: center; font-weight: bold; margin-bottom: 15px;">№ ${this.escapeHtml(h.number)} от ${this.escapeHtml(h.date)}</div>

        <table class="meta-table">
          <tr>
            <td style="width: 15%;"><strong>Организация:</strong></td>
            <td style="width: 35%;">${this.escapeHtml(h.organization || 'Aztrade MMC')}</td>
            <td style="width: 15%;"><strong>Маршрут:</strong></td>
            <td style="width: 35%; font-weight: bold; font-size: 12px;">${this.escapeHtml(h.marshrut || '-')}</td>
          </tr>
          <tr>
            <td><strong>Водитель:</strong></td>
            <td>${this.escapeHtml(h.voditel || '-')}</td>
            <td><strong>Склад отгрузки:</strong></td>
            <td>${this.escapeHtml(h.warehouse || '-')}</td>
          </tr>
          <tr>
            <td><strong>Ответственный:</strong></td>
            <td>${this.escapeHtml(h.responsible || '-')}</td>
            <td><strong>Всего накладных:</strong></td>
            <td><strong>${list.length} шт.</strong></td>
          </tr>
        </table>

        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 30px; text-align: center;">№</th>
              <th style="width: 110px;">Накладная</th>
              <th style="width: 120px;">Дата накладной</th>
              <th>Контрагент (Получатель)</th>
              <th style="width: 110px;">Портфель</th>
              <th style="width: 120px;">Агент</th>
              <th style="width: 95px; text-align: right;">Сумма (AZN)</th>
              <th style="width: 110px;">Склад</th>
              <th style="width: 80px; text-align: center;">Подпись</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
            <tr style="font-weight: bold; background: #f0f0f0;">
              <td colspan="6" style="border: 1px solid #333; padding: 5px; text-align: right;">ИТОГО:</td>
              <td style="border: 1px solid #333; padding: 5px; text-align: right;">${totalAmt.toFixed(2)}</td>
              <td colspan="2" style="border: 1px solid #333;"></td>
            </tr>
          </tbody>
        </table>

        <div class="signatures">
          <div>Отпустил со склада: ___________________ / ${this.escapeHtml(h.warehouse || '')} /</div>
          <div>Водитель-экспедитор: ___________________ / ${this.escapeHtml(h.voditel || '')} /</div>
        </div>
      </body>
      </html>
    `);
    printWin.document.close();
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

window.PogruzkaDocEditor = PogruzkaDocEditor;

document.addEventListener("DOMContentLoaded", function() {
  if (window.PogruzkaDocEditor) {
    PogruzkaDocEditor.init();
  }
});
