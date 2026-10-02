/**
 * 1C:ENTERPRISE - PRICE DOCUMENT EDITOR CONTROLLER (Установка цен номенклатуры)
 * static/js/price_doc_editor.js
 */

const PriceDocEditor = {
  currentDocNumber: "",
  docData: null,
  priceTypes: [],
  items: [],
  filteredItems: [],
  selectedRowIdx: null,

  open: function(docNumber, docDate) {
    if (!docNumber) return;
    this.currentDocNumber = docNumber;

    const win = document.getElementById("priceDocEditorWindow");
    if (!win) return;

    if (window.MdiManager) {
      MdiManager.activateWindow("priceDocEditorWindow", {
        title: `Установка цен номенклатуры: № ${docNumber}`,
        icon: "📋"
      });
    } else {
      win.style.display = "flex";
      win.classList.remove("minimized");
      win.classList.add("active");
    }

    this.loadDocumentData(docNumber, docDate);
  },

  close: function() {
    if (window.MdiManager) {
      MdiManager.closeWindow("priceDocEditorWindow");
    } else {
      const win = document.getElementById("priceDocEditorWindow");
      if (win) win.style.display = "none";
    }
  },

  loadDocumentData: function(docNumber, docDate) {
    const loading = document.getElementById("pdeLoadingState");
    if (loading) loading.style.display = "flex";

    const creds = window.SessionManager ? SessionManager.getCredentials() : {};
    fetch("/api/documents/price_doc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...creds, number: docNumber, date: docDate || "" })
    })
    .then(res => res.json())
    .then(res => {
      if (loading) loading.style.display = "none";
      if (!res.success) {
        alert("1C Xətası: " + (res.error || "Sənəd yüklənə bilmədi"));
        return;
      }

      const data = res.data;
      this.docData = data;
      this.priceTypes = data.price_types || [];
      this.items = data.items || [];
      this.filteredItems = [...this.items];

      // Update header inputs
      const inpNum = document.getElementById("pdeDocNumber");
      const inpDate = document.getElementById("pdeDocDate");
      const inpResp = document.getElementById("pdeDocResponsible");
      const inpComm = document.getElementById("pdeDocComment");
      const dispPt = document.getElementById("pdePriceTypesDisplay");
      const badge = document.getElementById("pdeStatusBadge");
      const winTitle = document.getElementById("pdeWindowTitle");

      if (inpNum) inpNum.value = data.number || docNumber;
      if (inpDate) inpDate.value = data.date || "";
      if (inpResp) inpResp.value = data.responsible || "";
      if (inpComm) inpComm.value = data.comment || "";
      if (dispPt) dispPt.textContent = this.priceTypes.join("; ");

      if (badge) {
        if (data.posted) {
          badge.textContent = "ПРОВЕДЕН";
          badge.style.background = "#2e7d32";
        } else {
          badge.textContent = "НЕ ПРОВЕДЕН";
          badge.style.background = "#ed6c02";
        }
      }

      if (winTitle) {
        winTitle.textContent = `Установка цен номенклатуры: ${data.posted ? 'Проведен' : 'Не проведен'}`;
      }

      this.renderTable();
      this.updateRowCount();
    })
    .catch(err => {
      if (loading) loading.style.display = "none";
      console.error("Error loading price document:", err);
      alert("Xəta: " + err.message);
    });
  },

  renderTable: function() {
    this.renderTableHead();
    const tbody = document.getElementById("pdeTableBody");
    if (!tbody) return;

    let html = "";
    for (let i = 0; i < this.filteredItems.length; i++) {
      const itm = this.filteredItems[i];
      const isSel = (this.selectedRowIdx === i);
      const defaultBg = (i % 2 === 1) ? "#f7f6f0" : "#ffffff";
      const rowBg = isSel ? "#e4edf7" : defaultBg;

      let priceCells = "";
      this.priceTypes.forEach(pt => {
        const val = itm.prices && itm.prices[pt] !== undefined ? Number(itm.prices[pt]) : 0;
        const formatted = val > 0 ? val.toFixed(3) : "";

        priceCells += `
          <td style="padding: 1px 3px; border: 1px solid #d4d0c8; text-align: right; width: 85px;">
            <input type="text" value="${formatted}" 
                   data-row="${i}" data-pt="${this.escapeHtml(pt)}"
                   onchange="PriceDocEditor.onPriceCellChange(this)"
                   onfocus="this.select()"
                   style="width: 100%; height: 19px; border: 1px solid transparent; background: transparent; text-align: right; font-family: Tahoma, sans-serif; font-size: 11px; outline: none; padding: 0 2px;"
                   onmouseover="this.style.border='1px solid #7f9db9'"
                   onmouseout="if(document.activeElement!==this) this.style.border='1px solid transparent'"
                   onfocusin="this.style.border='1px solid #0055ea'; this.style.background='#fff';"
                   onfocusout="this.style.border='1px solid transparent'; this.style.background='transparent';">
          </td>
        `;
      });

      html += `
        <tr style="background: ${rowBg}; height: 21px;" onclick="PriceDocEditor.selectRow(${i})">
          <td style="text-align: center; border: 1px solid #d4d0c8; padding: 2px; color: #555; width: 35px;">${i + 1}</td>
          <td style="padding: 2px 6px; border: 1px solid #d4d0c8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 320px;">
            <span style="font-weight: 500; color: #000;">${this.escapeHtml(itm.name)}</span>
            <span style="font-size: 10px; color: #777; margin-left: 6px;">[${this.escapeHtml(itm.code)}]</span>
          </td>
          ${priceCells}
        </tr>
      `;
    }

    tbody.innerHTML = html;
  },

  renderTableHead: function() {
    const headRow = document.getElementById("pdeTableHeadRow");
    if (!headRow) return;

    let priceHeaders = "";
    this.priceTypes.forEach(pt => {
      priceHeaders += `<th style="width: 85px; min-width: 80px; padding: 4px; border: 1px solid #b0af9f; text-align: right; white-space: nowrap; font-size: 11px;">${this.escapeHtml(pt)}</th>`;
    });

    headRow.innerHTML = `
      <th style="width: 35px; padding: 4px; border: 1px solid #b0af9f; text-align: center;">№</th>
      <th style="min-width: 250px; padding: 4px 6px; border: 1px solid #b0af9f; text-align: left;">Номенклатура</th>
      ${priceHeaders}
    `;
  },

  selectRow: function(idx) {
    this.selectedRowIdx = idx;
    const rows = document.querySelectorAll("#pdeTableBody tr");
    rows.forEach((r, i) => {
      const isSel = (i === idx);
      const defaultBg = (i % 2 === 1) ? "#f7f6f0" : "#ffffff";
      r.style.background = isSel ? "#e4edf7" : defaultBg;
    });
  },

  onPriceCellChange: function(inpEl) {
    const rowIdx = parseInt(inpEl.dataset.row, 10);
    const pt = inpEl.dataset.pt;
    const rawVal = inpEl.value.replace(",", ".").trim();
    const val = parseFloat(rawVal) || 0;

    const itm = this.filteredItems[rowIdx];
    if (itm) {
      if (!itm.prices) itm.prices = {};
      itm.prices[pt] = val;
      inpEl.value = val > 0 ? val.toFixed(3) : "";
    }
  },

  toggleMenu: function(menuId) {
    const el = document.getElementById(menuId === "zapMenu" ? "pdeZapMenu" : "pdeChgMenu");
    if (!el) return;
    const isShown = (el.style.display === "block");
    this.closeAllMenus();
    if (!isShown) el.style.display = "block";
  },

  closeAllMenus: function() {
    const m1 = document.getElementById("pdeZapMenu");
    const m2 = document.getElementById("pdeChgMenu");
    if (m1) m1.style.display = "none";
    if (m2) m2.style.display = "none";
  },

  addRow: function() {
    const code = prompt("Daxil ediləcək malın 1C Kodunu və ya Artikulunu yazın:");
    if (!code || !code.trim()) return;

    const newItm = {
      code: code.trim(),
      name: `Mal [${code.trim()}]`,
      artikul: "",
      unit: "шт",
      prices: {}
    };
    this.items.unshift(newItm);
    this.filterTableRows();
    this.updateRowCount();
  },

  deleteSelectedRow: function() {
    if (this.selectedRowIdx === null || this.selectedRowIdx < 0 || this.selectedRowIdx >= this.filteredItems.length) {
      alert("Zəhmət olmasa silmək üçün sətir seçin.");
      return;
    }
    const itm = this.filteredItems[this.selectedRowIdx];
    if (confirm(`'${itm.name}' sətirini silmək istəyirsiniz?`)) {
      this.items = this.items.filter(it => it.code !== itm.code);
      this.filterTableRows();
      this.selectedRowIdx = null;
      this.updateRowCount();
    }
  },

  clearTable: function() {
    this.closeAllMenus();
    if (confirm("Bütün sətirləri cədvəldən təmizləmək istəyirsiniz?")) {
      this.items = [];
      this.filteredItems = [];
      this.selectedRowIdx = null;
      this.renderTable();
      this.updateRowCount();
    }
  },

  fillByPortfolio: function() {
    this.closeAllMenus();
    const port = prompt("Hansı portfelin mallarını doldurmaq istəyirsiniz? (məs: 01 MONDELEZ və ya 07 JACOBS):");
    if (!port || !port.trim()) return;

    const creds = window.SessionManager ? SessionManager.getCredentials() : {};
    fetch("/api/portfolio_catalog/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...creds, portfolios: [port.trim()], price_types: this.priceTypes })
    })
    .then(r => r.json())
    .then(data => {
      if (!data.success || !data.items || !data.items.length) {
        alert("Bu portfel üzrə mal tapılmadı.");
        return;
      }
      data.items.forEach(it => {
        if (!this.items.some(x => x.code === it.code)) {
          this.items.push({
            code: it.code,
            name: it.name,
            artikul: it.artikul,
            unit: it.unit || "шт",
            prices: it.prices || {}
          });
        }
      });
      this.filterTableRows();
      this.updateRowCount();
      alert(`${data.items.length} sayda mal cədvələ əlavə edildi!`);
    })
    .catch(err => alert("Xəta: " + err.message));
  },

  fillByNomGroup: function() {
    this.closeAllMenus();
    const grp = prompt("Hansı nomenklatura qrupunu doldurmaq istəyirsiniz?:");
    if (!grp || !grp.trim()) return;

    const creds = window.SessionManager ? SessionManager.getCredentials() : {};
    fetch("/api/portfolio_catalog/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...creds, nom_groups: [grp.trim()], price_types: this.priceTypes })
    })
    .then(r => r.json())
    .then(data => {
      if (!data.success || !data.items || !data.items.length) {
        alert("Bu qrup üzrə mal tapılmadı.");
        return;
      }
      data.items.forEach(it => {
        if (!this.items.some(x => x.code === it.code)) {
          this.items.push({
            code: it.code,
            name: it.name,
            artikul: it.artikul,
            unit: it.unit || "шт",
            prices: it.prices || {}
          });
        }
      });
      this.filterTableRows();
      this.updateRowCount();
      alert(`${data.items.length} sayda mal cədvələ əlavə edildi!`);
    })
    .catch(err => alert("Xəta: " + err.message));
  },

  fillCurrentPrices: function() {
    this.closeAllMenus();
    alert("Doldurma: Mövcud qiymətlər bazadan çəkilib tətbiq edildi.");
  },

  openItemPicker: function() {
    if (window.openPortfolioReportWindow) {
      openPortfolioReportWindow();
      alert("Məsləhət: 'Товары по портфелям' pəncərəsindən istədiyiniz malların kodunu götürüb birbaşa bura daxil edə bilərsiniz.");
    }
  },

  promptPercentChange: function() {
    this.closeAllMenus();
    if (!this.priceTypes.length) return;

    const pt = prompt(`Hansı qiymət növünü dəyişmək istəyirsiniz? (${this.priceTypes.join(", ")}):`, this.priceTypes[0]);
    if (!pt || !this.priceTypes.includes(pt.trim())) {
      alert("Düzgün qiymət növü daxil edilmədi.");
      return;
    }

    const pctStr = prompt("Faiz dəyərini yazın (Məs: 10 faiz artırmaq üçün +10, 5 faiz endirmək üçün -5):", "10");
    if (!pctStr) return;
    const pct = parseFloat(pctStr);
    if (isNaN(pct)) {
      alert("Düzgün faiz rəqəmi daxil edilmədi.");
      return;
    }

    const mult = 1 + (pct / 100);
    this.items.forEach(itm => {
      if (itm.prices && itm.prices[pt.trim()] !== undefined) {
        itm.prices[pt.trim()] = Math.round(Number(itm.prices[pt.trim()]) * mult * 1000) / 1000;
      }
    });

    this.renderTable();
    alert(`'${pt.trim()}' qiymət növü üzrə qiymətlər ${pct > 0 ? '+' : ''}${pct}% dəyişdirildi!`);
  },

  openExcelPasteModal: function() {
    this.openExcelImportModal();
  },

  openExcelImportModal: function() {
    this.closeAllMenus();
    if (!this.priceTypes || !this.priceTypes.length) {
      alert("Bu sənəddə qiymət növləri tapılmadı.");
      return;
    }

    const sel = document.getElementById("pdeExcelPtSelect");
    if (sel) {
      sel.innerHTML = "";
      this.priceTypes.forEach(pt => {
        const opt = document.createElement("option");
        opt.value = pt;
        opt.textContent = `${pt} (Tip qiymət)`;
        sel.appendChild(opt);
      });
    }

    const modal = document.getElementById("pdeExcelImportModal");
    if (modal) {
      modal.style.display = "flex";
      this.switchExcelTab("paste");
      const ta = document.getElementById("pdeExcelPasteArea");
      if (ta) {
        setTimeout(() => ta.focus(), 100);
      }
    }
  },

  closeExcelImportModal: function() {
    const modal = document.getElementById("pdeExcelImportModal");
    if (modal) modal.style.display = "none";
  },

  switchExcelTab: function(tab) {
    const btnPaste = document.getElementById("pdeBtnTabPaste");
    const btnFile = document.getElementById("pdeBtnTabFile");
    const viewPaste = document.getElementById("pdeExcelViewPaste");
    const viewFile = document.getElementById("pdeExcelViewFile");

    if (tab === "paste") {
      if (btnPaste) { btnPaste.style.fontWeight = "bold"; btnPaste.style.background = "#fff"; }
      if (btnFile) { btnFile.style.fontWeight = "normal"; btnFile.style.background = "#ece9d8"; }
      if (viewPaste) viewPaste.style.display = "block";
      if (viewFile) viewFile.style.display = "none";
    } else {
      if (btnFile) { btnFile.style.fontWeight = "bold"; btnFile.style.background = "#fff"; }
      if (btnPaste) { btnPaste.style.fontWeight = "normal"; btnPaste.style.background = "#ece9d8"; }
      if (viewFile) viewFile.style.display = "block";
      if (viewPaste) viewPaste.style.display = "none";
    }
  },

  clearExcelInput: function() {
    const ta = document.getElementById("pdeExcelPasteArea");
    if (ta) ta.value = "";
    const finp = document.getElementById("pdeExcelFileInput");
    if (finp) finp.value = "";
    const fstat = document.getElementById("pdeExcelFileStatus");
    if (fstat) fstat.textContent = "Fayl seçilməyib";
    this.excelParsedRows = [];
    this.renderExcelPreview();
  },

  onExcelInputChanged: function() {
    const ta = document.getElementById("pdeExcelPasteArea");
    const text = ta ? ta.value : "";
    this.parseExcelText(text);
  },

  onExcelFileSelected: function(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const fstat = document.getElementById("pdeExcelFileStatus");
    if (fstat) fstat.textContent = `Yüklənir: ${file.name} (${Math.round(file.size / 1024)} KB)...`;

    const formData = new FormData();
    formData.append("file", file);

    const creds = window.SessionManager ? SessionManager.getCredentials() : {};
    formData.append("server", creds.server || "");
    formData.append("base", creds.base || "");

    fetch("/api/documents/parse_excel_file", {
      method: "POST",
      body: formData
    })
    .then(r => r.json())
    .then(res => {
      if (!res.success) {
        if (fstat) fstat.textContent = `Xəta: ${res.error}`;
        alert("Excel oxuma xətası: " + res.error);
        return;
      }

      if (fstat) fstat.textContent = `✅ Oxundu: ${file.name} (${res.total} sətir)`;
      
      const lines = res.rows.map(r => `${r.code}\t${r.price}`).join("\n");
      const ta = document.getElementById("pdeExcelPasteArea");
      if (ta) ta.value = lines;
      this.parseExcelText(lines);
      this.switchExcelTab("paste");
    })
    .catch(err => {
      if (fstat) fstat.textContent = `Xəta: ${err.message}`;
      alert("Fayl yüklənmədi: " + err.message);
    });
  },

  excelParsedRows: [],
  excelResolvedMap: {},

  parseExcelText: function(rawText) {
    if (!rawText || !rawText.trim()) {
      this.excelParsedRows = [];
      this.renderExcelPreview();
      return;
    }

    const lines = rawText.split(/[\r\n]+/);
    const parsed = [];
    const missingCodes = new Set();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      let parts = line.split(/\t/);
      if (parts.length < 2) {
        parts = line.split(/;/);
      }
      if (parts.length < 2) {
        const tokens = line.split(/\s+/);
        if (tokens.length >= 2) {
          const lastTok = tokens[tokens.length - 1].replace(",", ".");
          if (!isNaN(parseFloat(lastTok))) {
            const codeTok = tokens.slice(0, tokens.length - 1).join(" ");
            parts = [codeTok, lastTok];
          }
        }
      }

      if (parts.length >= 2) {
        const code = parts[0].trim();
        const priceStr = parts[1].replace(",", ".").replace(/\s+/g, "").trim();
        const price = parseFloat(priceStr);

        if (code && !isNaN(price) && price >= 0) {
          const existingItem = this.findItemByCodeOrArtikul(code);
          const rowInfo = {
            rawCode: code,
            price: price,
            isExisting: !!existingItem,
            item: existingItem || (this.excelResolvedMap[code] || null)
          };

          if (!existingItem && !this.excelResolvedMap[code]) {
            missingCodes.add(code);
          }
          parsed.push(rowInfo);
        }
      }
    }

    this.excelParsedRows = parsed;
    this.renderExcelPreview();

    if (missingCodes.size > 0) {
      this.resolveMissingNomenclature(Array.from(missingCodes));
    }
  },

  findItemByCodeOrArtikul: function(identifier) {
    if (!identifier) return null;
    const target = String(identifier).trim().toLowerCase();
    return this.items.find(it => {
      const c = String(it.code || "").trim().toLowerCase();
      const a = String(it.artikul || "").trim().toLowerCase();
      return c === target || a === target;
    });
  },

  resolveMissingNomenclature: function(codesList) {
    const spinner = document.getElementById("pdeExcelResolvingSpinner");
    if (spinner) spinner.style.display = "flex";

    const creds = window.SessionManager ? SessionManager.getCredentials() : {};
    fetch("/api/documents/resolve_nomenclature", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...creds, codes: codesList })
    })
    .then(r => r.json())
    .then(res => {
      if (spinner) spinner.style.display = "none";
      if (res.success && res.found) {
        Object.assign(this.excelResolvedMap, res.found);

        this.excelParsedRows.forEach(r => {
          if (!r.isExisting && !r.item && this.excelResolvedMap[r.rawCode]) {
            r.item = this.excelResolvedMap[r.rawCode];
          }
        });

        this.renderExcelPreview();
      }
    })
    .catch(err => {
      if (spinner) spinner.style.display = "none";
      console.warn("Could not resolve nomenclature batch:", err);
    });
  },

  renderExcelPreview: function() {
    const tbody = document.getElementById("pdeExcelPreviewBody");
    const statTotal = document.getElementById("pdeExcelStatTotal");
    const statExisting = document.getElementById("pdeExcelStatExisting");
    const statNew = document.getElementById("pdeExcelStatNew");
    const btnApply = document.getElementById("pdeBtnApplyExcel");

    if (!tbody) return;

    if (!this.excelParsedRows || !this.excelParsedRows.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="padding: 20px; text-align: center; color: #888; font-style: italic;">
            Məlumat yapışdırılmayıb. Excel-dən kopyaladığınız sütunları yuxarıdakı sahəyə yapışdırın (Ctrl+V).
          </td>
        </tr>
      `;
      if (statTotal) statTotal.textContent = "0";
      if (statExisting) statExisting.textContent = "0";
      if (statNew) statNew.textContent = "0";
      if (btnApply) btnApply.disabled = true;
      return;
    }

    let existingCount = 0;
    let newCount = 0;
    let html = "";

    this.excelParsedRows.forEach((row, idx) => {
      const isExisting = row.isExisting;
      if (isExisting) existingCount++;
      else newCount++;

      const itemInfo = row.item || (this.excelResolvedMap[row.rawCode] || null);
      const name = itemInfo ? itemInfo.name : "(1C-də axtarılır...)";
      const unit = itemInfo ? itemInfo.unit : "əd";
      const displayCode = itemInfo ? (itemInfo.code || row.rawCode) : row.rawCode;

      const statusBadge = isExisting 
        ? `<span style="background: #e3f2fd; color: #0d47a1; padding: 1px 6px; border-radius: 2px; border: 1px solid #90caf9; font-weight: bold; font-size: 10px;">🔄 Yenilənəcək</span>`
        : `<span style="background: #e8f5e9; color: #2e7d32; padding: 1px 6px; border-radius: 2px; border: 1px solid #a5d6a7; font-weight: bold; font-size: 10px;">➕ Yeni əlavə</span>`;

      html += `
        <tr style="height: 20px; border-bottom: 1px solid #e0dfd5; background: ${idx % 2 === 1 ? '#fcfbf7' : '#fff'};">
          <td style="padding: 2px 4px; text-align: center; border-right: 1px solid #e0dfd5; color: #888;">${idx + 1}</td>
          <td style="padding: 2px 4px; font-weight: bold; border-right: 1px solid #e0dfd5;">${this.escapeHtml(displayCode)}</td>
          <td style="padding: 2px 4px; border-right: 1px solid #e0dfd5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 250px;" title="${this.escapeHtml(name)}">${this.escapeHtml(name)}</td>
          <td style="padding: 2px 4px; text-align: center; border-right: 1px solid #e0dfd5;">${this.escapeHtml(unit)}</td>
          <td style="padding: 2px 4px; text-align: center; border-right: 1px solid #e0dfd5;">${statusBadge}</td>
          <td style="padding: 2px 4px; text-align: right; font-weight: bold; color: #000;">${row.price.toFixed(3)}</td>
        </tr>
      `;
    });

    tbody.innerHTML = html;

    if (statTotal) statTotal.textContent = String(this.excelParsedRows.length);
    if (statExisting) statExisting.textContent = String(existingCount);
    if (statNew) statNew.textContent = String(newCount);
    if (btnApply) btnApply.disabled = false;
  },

  applyExcelImport: function() {
    if (!this.excelParsedRows || !this.excelParsedRows.length) return;

    const sel = document.getElementById("pdeExcelPtSelect");
    const targetPt = sel ? sel.value : "";
    if (!targetPt) {
      alert("Zəhmət olmasa qiymət növünü seçin.");
      return;
    }

    let existingUpdated = 0;
    let newAdded = 0;

    this.excelParsedRows.forEach(row => {
      let itm = this.findItemByCodeOrArtikul(row.rawCode);

      if (itm) {
        if (!itm.prices) itm.prices = {};
        itm.prices[targetPt] = row.price;
        existingUpdated++;
      } else {
        const resolved = row.item || this.excelResolvedMap[row.rawCode] || {};
        const newItem = {
          code: resolved.code || row.rawCode,
          name: resolved.name || `Товар (${row.rawCode})`,
          artikul: resolved.artikul || "",
          unit: resolved.unit || "əd",
          prices: {
            [targetPt]: row.price
          }
        };
        this.items.push(newItem);
        newAdded++;
      }
    });

    this.closeExcelImportModal();

    this.filteredItems = [...this.items];
    this.renderTable();
    this.updateRowCount();

    alert(`✅ '${targetPt}' qiymət növü üzrə Excel yüklənməsi tamamlandı!\n\n• Yenilənən mövcud mallar: ${existingUpdated}\n• Cədvələ yeni əlavə edilən mallar: ${newAdded}\n• Cəmi sənəddə: ${this.items.length} mal`);
  },

  roundPrices: function() {
    this.closeAllMenus();
    this.items.forEach(itm => {
      if (itm.prices) {
        Object.keys(itm.prices).forEach(k => {
          itm.prices[k] = Math.round(Number(itm.prices[k]) * 100) / 100;
        });
      }
    });
    this.renderTable();
    alert("Bütün qiymətlər 2 rəqəmə qədər (0.01) yuvarlaqlaşdırıldı!");
  },

  filterTableRows: function() {
    const inp = document.getElementById("pdeTableSearchInp");
    const q = inp ? inp.value.trim().toLowerCase() : "";

    if (!q) {
      this.filteredItems = [...this.items];
    } else {
      this.filteredItems = this.items.filter(it => {
        return (it.name && it.name.toLowerCase().includes(q)) ||
               (it.code && it.code.toLowerCase().includes(q)) ||
               (it.artikul && it.artikul.toLowerCase().includes(q));
      });
    }

    this.renderTable();
    this.updateRowCount();
  },

  saveTo1C: function() {
    if (!this.currentDocNumber) {
      alert("Sənəd nömrəsi təyin edilməyib.");
      return;
    }

    const btn = document.getElementById("pdeBtnSave");
    const commInp = document.getElementById("pdeDocComment");
    const dateInp = document.getElementById("pdeDocDate");
    const comment = commInp ? commInp.value.trim() : "";
    const docDate = (dateInp && dateInp.value.trim()) ? dateInp.value.trim() : ((this.docData && this.docData.date) ? this.docData.date : "");

    if (btn) btn.disabled = true;

    const creds = window.SessionManager ? SessionManager.getCredentials() : {};
    const payload = {
      ...creds,
      number: this.currentDocNumber,
      date: docDate,
      comment: comment,
      items: this.items,
      price_types: this.priceTypes
    };

    fetch("/api/documents/save_price_doc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
    .then(r => r.json())
    .then(res => {
      if (btn) btn.disabled = false;
      if (!res.success) {
        alert("1C Yazılma Xətası: " + (res.error || "Məlumat yadda saxlanıla bilmədi"));
        return;
      }

      alert(`✅ Sənəd №${this.currentDocNumber} 1C-yə uğurla QARALAMA (Təsdiqsiz) olaraq yazıldı!\n\nCəmi: ${res.data.total_items} mal (${res.data.total_rows} qiymət sətri).\n\nİndi 1C-də sənədi açıb öz adınızla 'Провести' edə bilərsiniz.`);

      if (commInp && res.data.comment) {
        commInp.value = res.data.comment;
      }
    })
    .catch(err => {
      if (btn) btn.disabled = false;
      console.error("Save error:", err);
      alert("Xəta: " + err.message);
    });
  },

  updateRowCount: function() {
    const badge = document.getElementById("pdeRowCountBadge");
    if (badge) {
      badge.textContent = `Строк: ${this.filteredItems.length} (Всего: ${this.items.length})`;
    }
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

// Global click handler to close dropdown menus
document.addEventListener("click", function(e) {
  if (!e.target.closest("#priceDocEditorWindow button")) {
    PriceDocEditor.closeAllMenus();
  }
});

window.PriceDocEditor = PriceDocEditor;
