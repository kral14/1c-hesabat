/**
 * 1C:ENTERPRISE - PRICE DOCUMENT EDITOR CONTROLLER (Установка цен номенклатуры)
 * static/js/price_doc_editor.js
 */

const PriceDocEditor = {
  currentDocNumber: "",
  docData: null,
  priceTypes: [],
  allPriceTypes: [],
  items: [],
  filteredItems: [],
  selectedRowIdx: null,
  columnsConfig: [
    { id: "num", label: "№", visible: true, width: 35 },
    { id: "code", label: "Код", visible: true, width: 85 },
    { id: "artikul", label: "Артикул", visible: true, width: 85 },
    { id: "barcode", label: "Штрихкод", visible: false, width: 110 },
    { id: "name", label: "Номенклатура", visible: true, width: 300 },
    { id: "unit", label: "Единица", visible: true, width: 45 }
  ],
  currentSort: { colId: null, type: null, dir: "asc" },
  ptWidths: {},
  draggedCol: null,
  resizingCol: null,

  open: function(docNumber, docDate) {
    if (!docNumber) return;
    this.currentDocNumber = docNumber;

    try {
      const savedCols = localStorage.getItem("1c_price_doc_columns");
      if (savedCols) {
        const parsed = JSON.parse(savedCols);
        if (Array.isArray(parsed) && parsed.length) {
          this.columnsConfig = parsed;
        }
      }
      const savedPtWidths = localStorage.getItem("1c_price_doc_pt_widths");
      if (savedPtWidths) {
        this.ptWidths = JSON.parse(savedPtWidths) || {};
      }
    } catch(e) {}

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

    // 1. Check if document is already prefetched in background by UniversalJournal
    if (window.UniversalJournal && typeof UniversalJournal.getPrefetchedPriceDoc === "function") {
      const prefetched = UniversalJournal.getPrefetchedPriceDoc(docNumber);
      if (prefetched) {
        console.log(`[PRICE DOC] Opened INSTANTLY (0ms) from prefetch cache: №${docNumber}`);
        if (loading) loading.style.display = "none";
        this.populateDocumentData(prefetched, docNumber);
        return;
      }

      // 2. Check if prefetch request is currently in-flight
      const pendingPromise = UniversalJournal.getPendingPrefetchPromise(docNumber);
      if (pendingPromise) {
        console.log(`[PRICE DOC] In-flight prefetch detected for №${docNumber}, awaiting response...`);
        if (loading) loading.style.display = "flex";
        pendingPromise.then(data => {
          if (loading) loading.style.display = "none";
          if (data) {
            this.populateDocumentData(data, docNumber);
          } else {
            this.fetchDocumentDataDirectly(docNumber, docDate);
          }
        }).catch(() => {
          this.fetchDocumentDataDirectly(docNumber, docDate);
        });
        return;
      }
    }

    // 3. Fallback: Direct network fetch
    this.fetchDocumentDataDirectly(docNumber, docDate);
  },

  fetchDocumentDataDirectly: function(docNumber, docDate) {
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
      this.populateDocumentData(res.data, docNumber);
    })
    .catch(err => {
      if (loading) loading.style.display = "none";
      console.error("Error loading price document:", err);
      alert("Xəta: " + err.message);
    });
  },

  populateDocumentData: function(data, docNumber) {
    this.docData = data;
    this.priceTypes = data.price_types || [];
    this.allPriceTypes = data.all_price_types || data.price_types || [];
    this.items = (data.items || []).map((it, idx) => {
      if (it._origIdx === undefined) it._origIdx = idx;
      return it;
    });
    this.currentSort = { colId: null, type: null, dir: "asc" };

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
    if (dispPt) {
      if ("value" in dispPt) dispPt.value = this.priceTypes.join("; ");
      else dispPt.textContent = this.priceTypes.join("; ");
    }

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

    this.applySortAndFilter();
  },

  renderColGroup: function() {
    const colGroup = document.getElementById("pdeColGroup");
    if (!colGroup) return;

    let html = "";
    this.columnsConfig.forEach(col => {
      if (!col.visible) return;
      const w = col.width || 85;
      html += `<col id="pdeCol_standard_${col.id}" style="width: ${w}px;">`;
    });

    this.priceTypes.forEach(pt => {
      const w = (this.ptWidths && this.ptWidths[pt]) || 85;
      const cleanPtAttr = pt.replace(/[^a-zA-Z0-9_-]/g, '_');
      html += `<col id="pdeCol_pt_${cleanPtAttr}" style="width: ${w}px;">`;
    });

    colGroup.innerHTML = html;
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

      let rowCellsHtml = "";
      this.columnsConfig.forEach(col => {
        if (!col.visible) return;

        if (col.id === "num") {
          rowCellsHtml += `<td style="text-align: center; border: 1px solid #d4d0c8; padding: 2px; color: #555; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; box-sizing: border-box;">${i + 1}</td>`;
        } else if (col.id === "code") {
          rowCellsHtml += `
            <td style="padding: 1px 3px; border: 1px solid #d4d0c8; box-sizing: border-box; overflow: hidden;">
              <input type="text" value="${this.escapeHtml(itm.code || '')}"
                     onchange="PriceDocEditor.onCodeCellChange(${i}, this.value)"
                     onfocus="this.select()"
                     title="Код товара (введите для поиска)"
                     style="width: 100%; height: 19px; border: 1px solid transparent; background: transparent; font-family: Tahoma, sans-serif; font-size: 11px; outline: none; padding: 0 2px; box-sizing: border-box;"
                     onmouseover="this.style.border='1px solid #7f9db9'"
                     onmouseout="if(document.activeElement!==this) this.style.border='1px solid transparent'"
                     onfocusin="this.style.border='1px solid #0055ea'; this.style.background='#fff'; PriceDocEditor.selectedRowIdx=${i};"
                     onfocusout="this.style.border='1px solid transparent'; this.style.background='transparent';">
            </td>
          `;
        } else if (col.id === "artikul") {
          rowCellsHtml += `
            <td style="padding: 1px 3px; border: 1px solid #d4d0c8; box-sizing: border-box; overflow: hidden;">
              <input type="text" value="${this.escapeHtml(itm.artikul || '')}"
                     onchange="PriceDocEditor.onArtikulCellChange(${i}, this.value)"
                     onfocus="this.select()"
                     title="Артикул товара (введите для поиска)"
                     style="width: 100%; height: 19px; border: 1px solid transparent; background: transparent; font-family: Tahoma, sans-serif; font-size: 11px; outline: none; padding: 0 2px; box-sizing: border-box;"
                     onmouseover="this.style.border='1px solid #7f9db9'"
                     onmouseout="if(document.activeElement!==this) this.style.border='1px solid transparent'"
                     onfocusin="this.style.border='1px solid #0055ea'; this.style.background='#fff'; PriceDocEditor.selectedRowIdx=${i};"
                     onfocusout="this.style.border='1px solid transparent'; this.style.background='transparent';">
            </td>
          `;
        } else if (col.id === "barcode") {
          rowCellsHtml += `<td style="padding: 2px 4px; border: 1px solid #d4d0c8; text-align: center; font-family: Consolas, monospace; color: #555; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; box-sizing: border-box;">${this.escapeHtml(itm.barcode || '')}</td>`;
        } else if (col.id === "name") {
          rowCellsHtml += `
            <td style="padding: 1px 2px; border: 1px solid #d4d0c8; position: relative; box-sizing: border-box; overflow: hidden;">
              <div class="pde-nom-cell-wrapper" style="display: flex; align-items: stretch; width: 100%; height: 19px;">
                <input type="text" value="${this.escapeHtml(itm.name || '')}"
                       data-row="${i}"
                       id="pdeNomInput_${i}"
                       oninput="PriceDocEditor.onNomSearchInput(this, event, ${i})"
                       onkeydown="PriceDocEditor.onNomKeyDown(this, event, ${i})"
                       title="${this.escapeHtml(itm.name || '')}"
                       style="flex: 1; min-width: 0; width: 0; height: 100%; border: 1px solid transparent; background: transparent; font-family: Tahoma, sans-serif; font-size: 11px; padding: 0 4px; outline: none; text-overflow: ellipsis; overflow: hidden; box-sizing: border-box;"
                       onmouseover="this.style.border='1px solid #7f9db9'"
                       onmouseout="if(document.activeElement!==this) this.style.border='1px solid transparent'"
                       onfocusin="this.style.border='1px solid #0055ea'; this.style.background='#fff'; PriceDocEditor.selectedRowIdx=${i};"
                       onfocusout="this.style.border='1px solid transparent'; this.style.background='transparent';">
                <button type="button" onclick="PriceDocEditor.openNomPickerForRow(${i})" 
                        title="Подбор номенклатуры (F4)"
                        style="height: 100%; padding: 0 5px; border: 1px solid #7f9db9; border-left: none; background: #e0dfd5; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold; line-height: 1; user-select: none; flex-shrink: 0;">
                  ... 🔍
                </button>
              </div>
            </td>
          `;
        } else if (col.id === "unit") {
          rowCellsHtml += `<td style="text-align: center; border: 1px solid #d4d0c8; padding: 2px; color: #555; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; box-sizing: border-box;">${this.escapeHtml(itm.unit || 'шт')}</td>`;
        }
      });

      let priceCells = "";
      this.priceTypes.forEach(pt => {
        const val = itm.prices && itm.prices[pt] !== undefined ? Number(itm.prices[pt]) : 0;
        const formatted = val > 0 ? val.toFixed(3) : "";

        priceCells += `
          <td style="padding: 1px 3px; border: 1px solid #d4d0c8; text-align: right; box-sizing: border-box; overflow: hidden;">
            <input type="text" value="${formatted}" 
                   data-row="${i}" data-pt="${this.escapeHtml(pt)}"
                   onchange="PriceDocEditor.onPriceCellChange(this)"
                   onfocus="this.select()"
                   style="width: 100%; height: 19px; border: 1px solid transparent; background: transparent; text-align: right; font-family: Tahoma, sans-serif; font-size: 11px; outline: none; padding: 0 2px; box-sizing: border-box;"
                   onmouseover="this.style.border='1px solid #7f9db9'"
                   onmouseout="if(document.activeElement!==this) this.style.border='1px solid transparent'"
                   onfocusin="this.style.border='1px solid #0055ea'; this.style.background='#fff';"
                   onfocusout="this.style.border='1px solid transparent'; this.style.background='transparent';">
          </td>
        `;
      });

      html += `
        <tr style="background: ${rowBg}; height: 21px;" onclick="PriceDocEditor.selectRow(${i})">
          ${rowCellsHtml}
          ${priceCells}
        </tr>
      `;
    }

    tbody.innerHTML = html;
  },

  renderTableHead: function() {
    this.renderColGroup();
    const headRow = document.getElementById("pdeTableHeadRow");
    if (!headRow) return;

    let headersHtml = "";
    this.columnsConfig.forEach(col => {
      if (!col.visible) return;
      const colW = col.width || 85;
      const isSorted = (this.currentSort && this.currentSort.colId === col.id);
      const sortArrow = isSorted ? `<span class="pde-sort-indicator">${this.currentSort.dir === 'asc' ? '▲' : '▼'}</span>` : '';
      const align = (col.id === "num" || col.id === "barcode" || col.id === "unit") ? "center" : "left";

      headersHtml += `
        <th class="pde-th" id="pdeTh_standard_${col.id}"
            draggable="true"
            ondragstart="PriceDocEditor.onColDragStart(event, '${col.id}', 'standard')"
            ondragover="PriceDocEditor.onColDragOver(event, '${col.id}', 'standard')"
            ondragleave="PriceDocEditor.onColDragLeave(event)"
            ondrop="PriceDocEditor.onColDrop(event, '${col.id}', 'standard')"
            ondragend="PriceDocEditor.onColDragEnd(event)"
            onclick="PriceDocEditor.onColHeaderClick(event, '${col.id}', 'standard')"
            title="Klikləyin: Çeşidlə (A-Z / Z-A) | Sürükləyin: Yerini dəyişin | Sərhəddən tutun: Enini dəyişin"
            style="width: ${colW}px; min-width: ${colW}px; max-width: ${colW}px;">
          <div class="pde-col-header-inner" style="justify-content: ${align === 'center' ? 'center' : 'flex-start'};">
            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${this.escapeHtml(col.label)}</span>
            ${sortArrow}
          </div>
          <div class="pde-col-resizer" draggable="false" onmousedown="PriceDocEditor.onStartColResize(event, '${col.id}', 'standard')" onclick="event.stopPropagation()"></div>
        </th>
      `;
    });

    this.priceTypes.forEach(pt => {
      const ptWidth = (this.ptWidths && this.ptWidths[pt]) || 85;
      const isSorted = (this.currentSort && this.currentSort.colId === pt);
      const sortArrow = isSorted ? `<span class="pde-sort-indicator">${this.currentSort.dir === 'asc' ? '▲' : '▼'}</span>` : '';
      const safePt = this.escapeHtml(pt);
      const cleanPtAttr = pt.replace(/[^a-zA-Z0-9_-]/g, '_');

      headersHtml += `
        <th class="pde-th" id="pdeTh_pt_${cleanPtAttr}"
            draggable="true"
            ondragstart="PriceDocEditor.onColDragStart(event, '${safePt}', 'pt')"
            ondragover="PriceDocEditor.onColDragOver(event, '${safePt}', 'pt')"
            ondragleave="PriceDocEditor.onColDragLeave(event)"
            ondrop="PriceDocEditor.onColDrop(event, '${safePt}', 'pt')"
            ondragend="PriceDocEditor.onColDragEnd(event)"
            onclick="PriceDocEditor.onColHeaderClick(event, '${safePt}', 'pt')"
            title="Klikləyin: Qiymətə görə çeşidlə | Sürükləyin: Sütunun yerini dəyişin | Sərhəddən: Enini dəyişin | ✕: Qiymətləri təmizlə"
            style="width: ${ptWidth}px; min-width: ${ptWidth}px; max-width: ${ptWidth}px; text-align: right;">
          <div class="pde-col-header-inner" style="justify-content: flex-end; gap: 3px;">
            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px;">${safePt}</span>
            ${sortArrow}
            <button type="button" onclick="event.stopPropagation(); PriceDocEditor.promptClearPricesByPriceType('${safePt}')"
                    title="'${safePt}' sütunundakı qiymətləri təmizlə"
                    style="border: none; background: transparent; cursor: pointer; padding: 0 2px; font-size: 10px; color: #777; line-height: 1; border-radius: 2px;"
                    onmouseover="this.style.color='#d32f2f'; this.style.background='#fbe9e7'"
                    onmouseout="this.style.color='#777'; this.style.background='transparent'">
              ✕
            </button>
          </div>
          <div class="pde-col-resizer" draggable="false" onmousedown="PriceDocEditor.onStartColResize(event, '${safePt}', 'pt')" onclick="event.stopPropagation()"></div>
        </th>
      `;
    });

    headRow.innerHTML = headersHtml;
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
      return;
    }
    const itm = this.filteredItems[this.selectedRowIdx];
    this.items = this.items.filter(it => it !== itm);
    this.filterTableRows();
    if (this.selectedRowIdx >= this.filteredItems.length) {
      this.selectedRowIdx = this.filteredItems.length - 1;
    }
    if (this.selectedRowIdx < 0) {
      this.selectedRowIdx = null;
    }
    this.renderTable();
    this.updateRowCount();
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

    const idSel = document.getElementById("pdeExcelIdTypeSelect");
    if (idSel && !idSel.value) {
      idSel.value = "code";
    }

    const colTitle = document.getElementById("pdeExcelPreviewColTitle");
    if (colTitle) {
      const mode = idSel ? idSel.value : "code";
      if (mode === "artikul") colTitle.textContent = "Артикул";
      else if (mode === "barcode") colTitle.textContent = "Штрихкод";
      else colTitle.textContent = "Код номенклатуры";
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

  onExcelIdTypeChanged: function() {
    const sel = document.getElementById("pdeExcelIdTypeSelect");
    const mode = sel ? sel.value : "code";
    const colTitle = document.getElementById("pdeExcelPreviewColTitle");
    if (colTitle) {
      if (mode === "artikul") colTitle.textContent = "Артикул";
      else if (mode === "barcode") colTitle.textContent = "Штрихкод";
      else colTitle.textContent = "Код номенклатуры";
    }
    this.excelResolvedMap = {};
    this.onExcelInputChanged();
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
      if (viewFile) viewFile.style.display = "flex";
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

    const idType = document.getElementById("pdeExcelIdTypeSelect")?.value || "code";
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
          const existingItem = this.findItemByCodeOrArtikul(code, idType);
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
      this.resolveMissingNomenclature(Array.from(missingCodes), idType);
    }
  },

  findItemByCodeOrArtikul: function(identifier, idType) {
    if (!identifier) return null;
    const target = String(identifier).trim().toLowerCase();
    const mode = idType || (document.getElementById("pdeExcelIdTypeSelect")?.value || "code");

    if (mode === "artikul") {
      // 1. Primary: exact artikul
      const matchArt = this.items.find(it => String(it.artikul || "").trim().toLowerCase() === target);
      if (matchArt) return matchArt;
      // 2. Fallback: code or barcode
      return this.items.find(it => {
        const c = String(it.code || "").trim().toLowerCase();
        const b = String(it.barcode || "").trim().toLowerCase();
        return c === target || b === target;
      });
    } else if (mode === "barcode") {
      // 1. Primary: exact barcode
      const matchBc = this.items.find(it => String(it.barcode || "").trim().toLowerCase() === target);
      if (matchBc) return matchBc;
      // 2. Fallback: code or artikul
      return this.items.find(it => {
        const c = String(it.code || "").trim().toLowerCase();
        const a = String(it.artikul || "").trim().toLowerCase();
        return c === target || a === target;
      });
    } else {
      // Default: mode === "code"
      // 1. Primary: exact code
      const matchCode = this.items.find(it => String(it.code || "").trim().toLowerCase() === target);
      if (matchCode) return matchCode;
      // 2. Fallback: artikul or barcode
      return this.items.find(it => {
        const a = String(it.artikul || "").trim().toLowerCase();
        const b = String(it.barcode || "").trim().toLowerCase();
        return a === target || b === target;
      });
    }
  },

  resolveMissingNomenclature: function(codesList, idType) {
    const spinner = document.getElementById("pdeExcelResolvingSpinner");
    if (spinner) spinner.style.display = "flex";

    const currentIdType = idType || (document.getElementById("pdeExcelIdTypeSelect")?.value || "code");
    const creds = window.SessionManager ? SessionManager.getCredentials() : {};
    fetch("/api/documents/resolve_nomenclature", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...creds, codes: codesList, id_type: currentIdType })
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

    const idType = document.getElementById("pdeExcelIdTypeSelect")?.value || "code";
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
      
      let displayCode = row.rawCode;
      if (itemInfo) {
        if (idType === "artikul" && itemInfo.artikul) displayCode = itemInfo.artikul;
        else if (idType === "barcode" && itemInfo.barcode) displayCode = itemInfo.barcode;
        else if (itemInfo.code) displayCode = itemInfo.code;
      }

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

    const clearBeforeLoadChk = document.getElementById("pdeExcelClearBeforeLoadChk");
    const shouldClearBefore = clearBeforeLoadChk ? clearBeforeLoadChk.checked : false;

    let clearedOldCount = 0;
    if (shouldClearBefore) {
      this.items.forEach(itm => {
        if (itm.prices && itm.prices[targetPt] !== undefined) {
          if (itm.prices[targetPt] > 0) clearedOldCount++;
          delete itm.prices[targetPt];
        }
      });
    }

    const idType = document.getElementById("pdeExcelIdTypeSelect")?.value || "code";
    let existingUpdated = 0;
    let newAdded = 0;

    this.excelParsedRows.forEach(row => {
      let itm = this.findItemByCodeOrArtikul(row.rawCode, idType);

      if (itm) {
        if (!itm.prices) itm.prices = {};
        itm.prices[targetPt] = row.price;
        existingUpdated++;
      } else {
        const resolved = row.item || this.excelResolvedMap[row.rawCode] || {};
        const newItem = {
          code: resolved.code || (idType === "code" ? row.rawCode : ""),
          name: resolved.name || `Товар (${row.rawCode})`,
          artikul: resolved.artikul || (idType === "artikul" ? row.rawCode : ""),
          barcode: resolved.barcode || (idType === "barcode" ? row.rawCode : ""),
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

    const emptyCount = this.items.filter(itm => !itm.prices || !itm.prices[targetPt] || itm.prices[targetPt] <= 0).length;

    let msg = `✅ '${targetPt}' qiymət növü üzrə Excel yüklənməsi tamamlandı!\n\n` +
      `• Excel-dən qiyməti yazılan mallar: ${existingUpdated + newAdded}\n`;
    if (shouldClearBefore) {
      msg += `• Qiyməti təmizlənib boş qalan mallar: ${emptyCount}\n`;
    }
    msg += `• Cəmi sənəddə mövcud mallar: ${this.items.length}`;

    alert(msg);
  },

  openClearPriceTypeModal: function(defaultPt) {
    this.closeAllMenus();
    if (!this.priceTypes || !this.priceTypes.length) {
      alert("Sənəddə heç bir qiymət növü tapılmadı.");
      return;
    }

    const sel = document.getElementById("pdeClearPtSelect");
    if (sel) {
      sel.innerHTML = "";
      this.priceTypes.forEach(pt => {
        const opt = document.createElement("option");
        opt.value = pt;
        opt.textContent = `${pt} (Tip qiymət)`;
        sel.appendChild(opt);
      });
      if (defaultPt && this.priceTypes.includes(defaultPt)) {
        sel.value = defaultPt;
      } else {
        const excelPtSel = document.getElementById("pdeExcelPtSelect");
        if (excelPtSel && excelPtSel.value && this.priceTypes.includes(excelPtSel.value)) {
          sel.value = excelPtSel.value;
        } else {
          sel.value = this.priceTypes[0];
        }
      }
    }

    const note = document.getElementById("pdeClearPtItemCountNote");
    if (note) {
      note.textContent = `💡 Sənəddəki cəmi ${this.items.length} malın bu sütun üzrə qiyməti sıfırlanacaq.`;
    }

    const modal = document.getElementById("pdeClearPriceTypeModal");
    if (modal) modal.style.display = "flex";
  },

  closeClearPriceTypeModal: function() {
    const modal = document.getElementById("pdeClearPriceTypeModal");
    if (modal) modal.style.display = "none";
  },

  confirmClearPriceTypeModal: function() {
    const sel = document.getElementById("pdeClearPtSelect");
    const targetPt = sel ? sel.value : "";
    if (!targetPt) {
      alert("Zəhmət olmasa təmizlənəcək qiymət növünü seçin.");
      return;
    }

    this.closeClearPriceTypeModal();
    this.clearPricesByPriceType(targetPt);
  },

  promptClearPricesByPriceType: function(defaultPt) {
    this.openClearPriceTypeModal(defaultPt);
  },

  clearPricesByPriceType: function(targetPt) {
    if (!targetPt) return;

    let clearedCount = 0;
    this.items.forEach(itm => {
      if (itm.prices && itm.prices[targetPt] !== undefined) {
        if (itm.prices[targetPt] > 0 || itm.prices[targetPt] !== "") {
          clearedCount++;
        }
        delete itm.prices[targetPt];
      }
    });

    this.filteredItems = [...this.items];
    this.renderTable();
    this.updateRowCount();

    // If Excel import modal is open, re-evaluate preview
    const excelModal = document.getElementById("pdeExcelImportModal");
    if (excelModal && excelModal.style.display === "flex") {
      this.onExcelInputChanged();
    }

    alert(`🧹 '${targetPt}' qiymət növü üzrə bütün qiymətlər təmizləndi!\n\n• Sıfırlanan malların sayı: ${clearedCount}\n• Cədvəldə qalan mallar: ${this.items.length} (artıq bu sütun üzrə xanalar boşdur)`);
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
    this.applySortAndFilter();
  },

  applySortAndFilter: function() {
    const inp = document.getElementById("pdeTableSearchInp");
    const q = inp ? inp.value.trim().toLowerCase() : "";

    // 1. Filter
    let list = this.items;
    if (q) {
      list = this.items.filter(it => {
        return (it.name && it.name.toLowerCase().includes(q)) ||
               (it.code && it.code.toLowerCase().includes(q)) ||
               (it.artikul && it.artikul.toLowerCase().includes(q)) ||
               (it.barcode && it.barcode.toLowerCase().includes(q));
      });
    }

    // 2. Sort
    if (this.currentSort && this.currentSort.colId) {
      const { colId, type, dir } = this.currentSort;
      const isAsc = (dir === "asc");

      list = [...list].sort((a, b) => {
        if (colId === "num") {
          const valA = a._origIdx !== undefined ? a._origIdx : 0;
          const valB = b._origIdx !== undefined ? b._origIdx : 0;
          return isAsc ? (valA - valB) : (valB - valA);
        }

        if (type === "pt") {
          const rawA = a.prices && a.prices[colId] !== undefined ? a.prices[colId] : null;
          const rawB = b.prices && b.prices[colId] !== undefined ? b.prices[colId] : null;
          const numA = (rawA !== null && rawA !== "" && !isNaN(Number(rawA))) ? Number(rawA) : null;
          const numB = (rawB !== null && rawB !== "" && !isNaN(Number(rawB))) ? Number(rawB) : null;

          // Put empty / null prices at bottom in both asc and desc
          if (numA === null && numB === null) return (a._origIdx || 0) - (b._origIdx || 0);
          if (numA === null) return 1;
          if (numB === null) return -1;

          return isAsc ? (numA - numB) : (numB - numA);
        }

        // Standard column sorting
        const valA = a[colId] != null ? String(a[colId]).trim() : "";
        const valB = b[colId] != null ? String(b[colId]).trim() : "";

        if (!valA && !valB) return (a._origIdx || 0) - (b._origIdx || 0);
        if (!valA) return 1;
        if (!valB) return -1;

        const cmp = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: "base" });
        return isAsc ? cmp : -cmp;
      });
    } else {
      // Restore original document order
      list = [...list].sort((a, b) => (a._origIdx || 0) - (b._origIdx || 0));
    }

    this.filteredItems = list;
    this.renderTable();
    this.updateRowCount();
  },

  onColHeaderClick: function(event, colId, colType) {
    if (event.target.closest(".pde-col-resizer") || event.target.closest("button")) {
      return;
    }

    if (this.currentSort && this.currentSort.colId === colId) {
      if (this.currentSort.dir === "asc") {
        this.currentSort.dir = "desc";
      } else {
        // Reset sort to original document order
        this.currentSort = { colId: null, type: null, dir: "asc" };
      }
    } else {
      this.currentSort = { colId: colId, type: colType, dir: "asc" };
    }

    this.applySortAndFilter();
  },

  onStartColResize: function(event, colId, colType) {
    event.preventDefault();
    event.stopPropagation();

    // 1. Temporarily disable draggable so drag events never conflict
    document.querySelectorAll(".pde-th").forEach(th => th.removeAttribute("draggable"));
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    const startX = event.clientX;
    let startWidth = 85;

    if (colType === "standard") {
      const col = this.columnsConfig.find(c => c.id === colId);
      startWidth = col ? (col.width || 85) : 85;
    } else {
      startWidth = (this.ptWidths && this.ptWidths[colId]) || 85;
    }

    const thEl = event.target.closest("th");
    const cleanAttr = (colType === "standard") ? colId : colId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const colEl = document.getElementById(`pdeCol_${colType}_${cleanAttr}`);

    this.resizingCol = { colId, colType, startX, startWidth, thEl, colEl, currentWidth: startWidth };

    const resizerEl = event.target;
    if (resizerEl) resizerEl.classList.add("resizing");

    const onMouseMove = (e) => {
      if (!this.resizingCol) return;
      const delta = e.clientX - this.resizingCol.startX;
      const minW = (this.resizingCol.colId === "num") ? 25 : 45;
      const newWidth = Math.max(minW, Math.round(this.resizingCol.startWidth + delta));
      this.resizingCol.currentWidth = newWidth;

      if (this.resizingCol.colEl) {
        this.resizingCol.colEl.style.width = newWidth + "px";
      }
      if (this.resizingCol.thEl) {
        this.resizingCol.thEl.style.width = newWidth + "px";
        this.resizingCol.thEl.style.minWidth = newWidth + "px";
        this.resizingCol.thEl.style.maxWidth = newWidth + "px";
      }
    };

    const onMouseUp = () => {
      if (resizerEl) resizerEl.classList.remove("resizing");
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);

      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      document.querySelectorAll(".pde-th").forEach(th => th.setAttribute("draggable", "true"));

      if (this.resizingCol) {
        const finalWidth = this.resizingCol.currentWidth;
        if (this.resizingCol.colType === "standard") {
          const col = this.columnsConfig.find(c => c.id === this.resizingCol.colId);
          if (col) col.width = finalWidth;
          try {
            localStorage.setItem("1c_price_doc_columns", JSON.stringify(this.columnsConfig));
          } catch(e) {}
        } else {
          if (!this.ptWidths) this.ptWidths = {};
          this.ptWidths[this.resizingCol.colId] = finalWidth;
          try {
            localStorage.setItem("1c_price_doc_pt_widths", JSON.stringify(this.ptWidths));
          } catch(e) {}
        }

        this.resizingCol = null;
      }
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  },

  onColDragStart: function(event, colId, colType) {
    if (event.target.classList.contains("pde-col-resizer") || event.target.tagName === "BUTTON") {
      event.preventDefault();
      return;
    }
    this.draggedCol = { colId, colType };
    event.dataTransfer.setData("text/plain", JSON.stringify({ colId, colType }));
    event.dataTransfer.effectAllowed = "move";
    event.currentTarget.classList.add("pde-th-dragging");
  },

  onColDragOver: function(event, targetColId, targetColType) {
    if (!this.draggedCol) return;
    if (this.draggedCol.colType !== targetColType) return;
    if (this.draggedCol.colId === targetColId) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    event.currentTarget.classList.add("pde-th-drag-over");
  },

  onColDragLeave: function(event) {
    event.currentTarget.classList.remove("pde-th-drag-over");
  },

  onColDrop: function(event, targetColId, targetColType) {
    event.preventDefault();
    event.currentTarget.classList.remove("pde-th-drag-over");

    if (!this.draggedCol) return;
    if (this.draggedCol.colType !== targetColType) return;
    if (this.draggedCol.colId === targetColId) return;

    const sourceColId = this.draggedCol.colId;

    if (targetColType === "standard") {
      const fromIdx = this.columnsConfig.findIndex(c => c.id === sourceColId);
      const toIdx = this.columnsConfig.findIndex(c => c.id === targetColId);
      if (fromIdx !== -1 && toIdx !== -1) {
        const item = this.columnsConfig.splice(fromIdx, 1)[0];
        this.columnsConfig.splice(toIdx, 0, item);
        try {
          localStorage.setItem("1c_price_doc_columns", JSON.stringify(this.columnsConfig));
        } catch(e) {}
      }
    } else if (targetColType === "pt") {
      const fromIdx = this.priceTypes.indexOf(sourceColId);
      const toIdx = this.priceTypes.indexOf(targetColId);
      if (fromIdx !== -1 && toIdx !== -1) {
        const item = this.priceTypes.splice(fromIdx, 1)[0];
        this.priceTypes.splice(toIdx, 0, item);

        const disp = document.getElementById("pdePriceTypesDisplay");
        if (disp) {
          if ("value" in disp) disp.value = this.priceTypes.join("; ");
          else disp.textContent = this.priceTypes.join("; ");
        }
      }
    }

    this.draggedCol = null;
    this.renderTable();
  },

  onColDragEnd: function(event) {
    this.draggedCol = null;
    document.querySelectorAll(".pde-th").forEach(th => {
      th.classList.remove("pde-th-drag-over");
      th.classList.remove("pde-th-dragging");
    });
  },

  saveTo1C: function() {
    if (!this.currentDocNumber) {
      alert("Sənəd nömrəsi təyin edilməyib.");
      return;
    }

    const btn = document.getElementById("pdeBtnSave");
    const btnTop = document.getElementById("pdeBtnSaveTop");
    const commInp = document.getElementById("pdeDocComment");
    const dateInp = document.getElementById("pdeDocDate");
    const comment = commInp ? commInp.value.trim() : "";
    const docDate = (dateInp && dateInp.value.trim()) ? dateInp.value.trim() : ((this.docData && this.docData.date) ? this.docData.date : "");

    if (btn) btn.disabled = true;
    if (btnTop) btnTop.disabled = true;

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
      if (btnTop) btnTop.disabled = false;
      if (!res.success) {
        alert("1C Yazılma Xətası: " + (res.error || "Məlumat yadda saxlanıla bilmədi"));
        return;
      }

      alert(`✅ Sənəd №${this.currentDocNumber} 1C-yə uğurla QARALAMA (Təsdiqsiz) olaraq yazıldı!\n\nCəmi: ${res.data.total_items} mal (${res.data.total_rows} qiymət sətri).\n\nİndi 1C-də sənədi açıb öz adınızla 'Провести' edə bilərsiniz.`);

      if (window.UniversalJournal && typeof UniversalJournal.invalidatePrefetch === "function") {
        UniversalJournal.invalidatePrefetch(this.currentDocNumber);
      }

      if (commInp && res.data.comment) {
        commInp.value = res.data.comment;
      }
    })
    .catch(err => {
      if (btn) btn.disabled = false;
      if (btnTop) btnTop.disabled = false;
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
  },

  // ==========================================
  // Price Types Selector Modal (Screenshots 1 & 2)
  // ==========================================
  ptModalItems: [],
  ptSelectedIdx: 0,

  fetchAllPriceTypes: async function() {
    try {
      const resp = await fetch("/api/documents/price_types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const data = await resp.json();
      if (data.success && Array.isArray(data.price_types) && data.price_types.length > 0) {
        this.allPriceTypes = data.price_types.map(p => typeof p === 'object' ? p.name : p);
        return this.allPriceTypes;
      }
    } catch (e) {
      console.warn("Could not fetch price types from API:", e);
    }
    return [];
  },

  openPriceTypesModal: async function() {
    this.closeAllMenus();

    const modal = document.getElementById("pdePriceTypesModal");
    if (modal) modal.style.display = "flex";

    // If allPriceTypes is not loaded from database yet, fetch now
    if (!this.allPriceTypes || this.allPriceTypes.length <= 15) {
      const container = document.getElementById("pdePtChecklistContainer");
      if (container && (!this.ptModalItems || this.ptModalItems.length === 0)) {
        container.innerHTML = `<div style="padding: 15px; text-align: center; color: #666; font-size: 11px;">1C bazasından bütün qiymət növləri yüklənir...</div>`;
      }
      await this.fetchAllPriceTypes();
    }

    this.rebuildPtModalList();
    this.renderPtChecklist();
  },

  rebuildPtModalList: function() {
    // Collect all unique price types (from allPriceTypes and current priceTypes)
    const allSet = new Set(this.priceTypes || []);
    if (this.allPriceTypes && this.allPriceTypes.length) {
      this.allPriceTypes.forEach(pt => {
        const ptName = typeof pt === 'object' ? pt.name : pt;
        if (ptName) allSet.add(ptName);
      });
    }
    const allList = Array.from(allSet);

    // Order: currently checked ones first in order of this.priceTypes, then the rest
    const currentChecked = this.priceTypes || [];
    const ordered = [];
    currentChecked.forEach(pt => {
      if (allList.includes(pt)) {
        ordered.push({ name: pt, checked: true });
      }
    });
    allList.forEach(pt => {
      if (!currentChecked.includes(pt)) {
        ordered.push({ name: pt, checked: false });
      }
    });

    this.ptModalItems = ordered;
    this.ptSelectedIdx = 0;

    const chkTop = document.getElementById("pdeMoveCheckedTopChk");
    if (chkTop && chkTop.checked) {
      this.ptApplyMoveCheckedTop();
    }
  },

  closePriceTypesModal: function() {
    const modal = document.getElementById("pdePriceTypesModal");
    if (modal) modal.style.display = "none";
  },

  renderPtChecklist: function() {
    const container = document.getElementById("pdePtChecklistContainer");
    if (!container) return;

    let html = "";
    this.ptModalItems.forEach((item, idx) => {
      const isSel = (idx === this.ptSelectedIdx);
      const bg = isSel ? "#316ac5" : (idx % 2 === 1 ? "#faf9f5" : "#ffffff");
      const fg = isSel ? "#ffffff" : "#000000";

      html += `
        <div onclick="PriceDocEditor.ptSelectRow(${idx})" 
             style="display: flex; align-items: center; gap: 6px; padding: 2px 4px; cursor: pointer; user-select: none; background: ${bg}; color: ${fg}; border-bottom: 1px dotted #e0dfd5; height: 19px; box-sizing: border-box;">
          <input type="checkbox" ${item.checked ? 'checked' : ''} 
                 onchange="PriceDocEditor.ptToggleCheck(${idx}, this.checked)" 
                 onclick="event.stopPropagation()" 
                 style="cursor: pointer; margin: 0; padding: 0;">
          <span style="font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${this.escapeHtml(item.name)}</span>
        </div>
      `;
    });

    container.innerHTML = html;
  },

  ptSelectRow: function(idx) {
    this.ptSelectedIdx = idx;
    this.renderPtChecklist();
  },

  ptToggleCheck: function(idx, isChecked) {
    if (this.ptModalItems[idx]) {
      this.ptModalItems[idx].checked = isChecked;
    }
    const chkTop = document.getElementById("pdeMoveCheckedTopChk");
    if (chkTop && chkTop.checked) {
      this.ptApplyMoveCheckedTop();
    }
    this.renderPtChecklist();
  },

  ptMoveUp: function() {
    if (this.ptSelectedIdx > 0 && this.ptSelectedIdx < this.ptModalItems.length) {
      const tmp = this.ptModalItems[this.ptSelectedIdx];
      this.ptModalItems[this.ptSelectedIdx] = this.ptModalItems[this.ptSelectedIdx - 1];
      this.ptModalItems[this.ptSelectedIdx - 1] = tmp;
      this.ptSelectedIdx--;
      this.renderPtChecklist();
    }
  },

  ptMoveDown: function() {
    if (this.ptSelectedIdx >= 0 && this.ptSelectedIdx < this.ptModalItems.length - 1) {
      const tmp = this.ptModalItems[this.ptSelectedIdx];
      this.ptModalItems[this.ptSelectedIdx] = this.ptModalItems[this.ptSelectedIdx + 1];
      this.ptModalItems[this.ptSelectedIdx + 1] = tmp;
      this.ptSelectedIdx++;
      this.renderPtChecklist();
    }
  },

  ptSortAZ: function() {
    const selItem = this.ptModalItems[this.ptSelectedIdx];
    this.ptModalItems.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const chkTop = document.getElementById("pdeMoveCheckedTopChk");
    if (chkTop && chkTop.checked) {
      this.ptApplyMoveCheckedTop();
    }
    if (selItem) {
      this.ptSelectedIdx = this.ptModalItems.findIndex(x => x.name === selItem.name);
    }
    this.renderPtChecklist();
  },

  ptSortZA: function() {
    const selItem = this.ptModalItems[this.ptSelectedIdx];
    this.ptModalItems.sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));
    const chkTop = document.getElementById("pdeMoveCheckedTopChk");
    if (chkTop && chkTop.checked) {
      this.ptApplyMoveCheckedTop();
    }
    if (selItem) {
      this.ptSelectedIdx = this.ptModalItems.findIndex(x => x.name === selItem.name);
    }
    this.renderPtChecklist();
  },

  ptCheckAll: function(state) {
    this.ptModalItems.forEach(x => x.checked = state);
    const chkTop = document.getElementById("pdeMoveCheckedTopChk");
    if (chkTop && chkTop.checked) {
      this.ptApplyMoveCheckedTop();
    }
    this.renderPtChecklist();
  },

  ptToggleMoveCheckedTop: function() {
    const chkTop = document.getElementById("pdeMoveCheckedTopChk");
    if (chkTop && chkTop.checked) {
      this.ptApplyMoveCheckedTop();
    }
    this.renderPtChecklist();
  },

  ptApplyMoveCheckedTop: function() {
    const checked = this.ptModalItems.filter(x => x.checked);
    const unchecked = this.ptModalItems.filter(x => !x.checked);
    this.ptModalItems = [...checked, ...unchecked];
  },

  applySelectedPriceTypes: async function() {
    const selected = this.ptModalItems.filter(x => x.checked).map(x => x.name);
    if (!selected.length) {
      alert("Heç bir qiymət növü seçilməyib! Ən azı bir qiymət növü seçin.");
      return;
    }

    const oldPriceTypes = [...(this.priceTypes || [])];
    const newlyAdded = selected.filter(pt => !oldPriceTypes.includes(pt));

    this.priceTypes = selected;

    const disp = document.getElementById("pdePriceTypesDisplay");
    if (disp) {
      if ("value" in disp) disp.value = selected.join("; ");
      else disp.textContent = selected.join("; ");
    }

    // Re-render table with new price columns immediately
    this.renderTable();

    // Close modal
    this.closePriceTypesModal();

    // Automatically find all price types that need prices from 1C
    // (both newly added types and any selected types that have empty cells in the table)
    const ptsNeedingPrices = selected.filter(pt => {
      if (newlyAdded.includes(pt)) return true;
      return this.items.some(it => !it.prices || it.prices[pt] === undefined || it.prices[pt] === "" || it.prices[pt] === 0 || it.prices[pt] === null);
    });

    if (ptsNeedingPrices.length > 0 && this.items && this.items.length > 0) {
      await this.fetchAndFillPricesForTypes(ptsNeedingPrices, false);
    }
  },

  fetchAndFillPricesForTypes: async function(targetPriceTypes, overwriteExisting = false) {
    if (!targetPriceTypes || !targetPriceTypes.length) return 0;
    if (!this.items || !this.items.length) return 0;

    const docDate = document.getElementById("pdeDocDate")?.value?.trim() || "";
    const loading = document.getElementById("pdeLoadingState");
    if (loading) loading.style.display = "flex";

    let filledCount = 0;
    let batchSucceeded = false;

    // 1. Try batch endpoint first
    try {
      const creds = window.SessionManager ? SessionManager.getCredentials() : {};
      const codes = this.items.map(it => it.code).filter(Boolean);
      const names = this.items.map(it => it.name).filter(Boolean);

      const resp = await fetch("/api/documents/batch_item_prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...creds,
          codes: codes,
          names: names,
          price_types: targetPriceTypes,
          date: docDate
        })
      });

      if (resp.ok) {
        const res = await resp.json();
        if (res.success && (res.prices_by_code || res.prices_by_name)) {
          batchSucceeded = true;
          const pricesByCode = res.prices_by_code || {};
          const pricesByName = res.prices_by_name || {};

          this.items.forEach(itm => {
            if (!itm.prices) itm.prices = {};
            const codePrices = pricesByCode[itm.code] || {};
            const namePrices = pricesByName[itm.name] || {};

            targetPriceTypes.forEach(pt => {
              const hasExisting = itm.prices[pt] !== undefined && itm.prices[pt] !== "" && itm.prices[pt] !== 0 && itm.prices[pt] !== null;
              if (!hasExisting || overwriteExisting) {
                const p = (codePrices[pt] !== undefined) ? codePrices[pt] : namePrices[pt];
                if (p !== undefined && p > 0) {
                  itm.prices[pt] = p;
                  filledCount++;
                }
              }
            });
          });
        }
      }
    } catch (err) {
      console.warn("Batch prices endpoint not available, falling back to per-item fetch:", err);
    }

    // 2. Fallback: query via /api/documents/item_prices in parallel chunks of 15 items
    if (!batchSucceeded) {
      console.log(`[PRICE DOC] Auto-filling active 1C prices for ${this.items.length} items across [${targetPriceTypes.join(', ')}]...`);
      const chunkSize = 15;
      for (let i = 0; i < this.items.length; i += chunkSize) {
        const chunk = this.items.slice(i, i + chunkSize);
        await Promise.all(chunk.map(async itm => {
          if (!itm.prices) itm.prices = {};

          const needsFetch = targetPriceTypes.some(pt => {
            const has = itm.prices[pt] !== undefined && itm.prices[pt] !== "" && itm.prices[pt] !== 0 && itm.prices[pt] !== null;
            return !has || overwriteExisting;
          });

          if (!needsFetch) return;

          try {
            const resp = await fetch("/api/documents/item_prices", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                code: itm.code,
                name: itm.name,
                date: docDate,
                price_types: targetPriceTypes
              })
            });

            if (resp.ok) {
              const res = await resp.json();
              if (res.success && res.prices) {
                targetPriceTypes.forEach(pt => {
                  const has = itm.prices[pt] !== undefined && itm.prices[pt] !== "" && itm.prices[pt] !== 0 && itm.prices[pt] !== null;
                  if (!has || overwriteExisting) {
                    const p = res.prices[pt];
                    if (p !== undefined && p > 0) {
                      itm.prices[pt] = p;
                      filledCount++;
                    }
                  }
                });
              }
            }
          } catch(e) {
            console.warn(`Could not fetch price for item ${itm.code}:`, e);
          }
        }));
      }
    }

    this.filteredItems = [...this.items];
    this.renderTable();
    if (loading) loading.style.display = "none";

    return filledCount;
  },

  fillCurrentPrices: async function() {
    this.closeAllMenus();
    if (!this.items || !this.items.length) {
      alert("Cədvəldə heç bir mal yoxdur.");
      return;
    }
    if (!this.priceTypes || !this.priceTypes.length) {
      alert("Sənəddə heç bir qiymət növü seçilməyib.");
      return;
    }

    const count = await this.fetchAndFillPricesForTypes(this.priceTypes, true);
    alert(`✅ Sənəddəki ${this.items.length} mal üçün 1C-dən qüvvədə olan qiymətlər yeniləndi!\n\n• Doldurulan qiymətlərin sayı: ${count}`);
  },

  // ==========================================
  // Autocomplete & In-Cell Editing (Screenshots 2 & 3)
  // ==========================================
  nomSearchTimer: null,
  activeNomRowIdx: -1,
  activeAutocompleteIdx: -1,
  currentAutocompleteItems: [],

  onNomSearchInput: function(inp, event, rowIdx) {
    clearTimeout(this.nomSearchTimer);
    const q = inp.value.trim();
    if (q.length < 1) {
      this.hideNomAutocomplete();
      return;
    }

    this.activeNomRowIdx = rowIdx;
    this.nomSearchTimer = setTimeout(() => {
      fetch("/api/nomenclature/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q })
      })
      .then(r => r.json())
      .then(res => {
        if (res.success && res.items && res.items.length) {
          PriceDocEditor.showNomAutocomplete(inp, rowIdx, res.items);
        } else {
          PriceDocEditor.hideNomAutocomplete();
        }
      })
      .catch(() => PriceDocEditor.hideNomAutocomplete());
    }, 150);
  },

  showNomAutocomplete: function(inp, rowIdx, items) {
    const dropdown = document.getElementById("pdeNomAutocompleteDropdown");
    if (!dropdown) return;

    this.currentAutocompleteItems = items;
    this.activeAutocompleteIdx = -1;

    const rect = inp.getBoundingClientRect();
    dropdown.style.top = (rect.bottom + 1) + "px";
    dropdown.style.left = rect.left + "px";
    dropdown.style.width = Math.max(rect.width + 120, 360) + "px";
    dropdown.style.display = "block";

    let html = "";
    items.forEach((it, idx) => {
      html += `
        <div class="pde-autocomplete-item" id="pdeAutoItem_${idx}" onclick="PriceDocEditor.selectNomItem(${rowIdx}, ${idx})"
             style="padding: 4px 8px; cursor: pointer; border-bottom: 1px solid #f0eee3; font-size: 11px; display: flex; justify-content: space-between; align-items: center; background: #fff;"
             onmouseover="PriceDocEditor.highlightAutoItem(${idx})">
          <span style="font-weight: 500; color: #000; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${this.escapeHtml(it.name)}</span>
          <span style="color: #666; font-size: 10px; margin-left: 8px; white-space: nowrap;">[${this.escapeHtml(it.artikul || it.code)}]</span>
        </div>
      `;
    });

    dropdown.innerHTML = html;
  },

  highlightAutoItem: function(idx) {
    this.activeAutocompleteIdx = idx;
    const items = document.querySelectorAll(".pde-autocomplete-item");
    items.forEach((el, i) => {
      el.style.background = (i === idx) ? "#316ac5" : "#ffffff";
      el.style.color = (i === idx) ? "#ffffff" : "#000000";
    });
  },

  onNomKeyDown: function(inp, event, rowIdx) {
    const dropdown = document.getElementById("pdeNomAutocompleteDropdown");
    const isDropOpen = dropdown && dropdown.style.display !== "none";

    if (event.key === "F4") {
      event.preventDefault();
      this.hideNomAutocomplete();
      this.openNomPickerForRow(rowIdx);
      return;
    }

    if (!isDropOpen) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (this.currentAutocompleteItems.length) {
        this.activeAutocompleteIdx = (this.activeAutocompleteIdx + 1) % this.currentAutocompleteItems.length;
        this.highlightAutoItem(this.activeAutocompleteIdx);
      }
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (this.currentAutocompleteItems.length) {
        this.activeAutocompleteIdx = (this.activeAutocompleteIdx - 1 + this.currentAutocompleteItems.length) % this.currentAutocompleteItems.length;
        this.highlightAutoItem(this.activeAutocompleteIdx);
      }
    } else if (event.key === "Enter") {
      if (this.activeAutocompleteIdx >= 0 && this.activeAutocompleteIdx < this.currentAutocompleteItems.length) {
        event.preventDefault();
        this.selectNomItem(rowIdx, this.activeAutocompleteIdx);
      }
    } else if (event.key === "Escape") {
      this.hideNomAutocomplete();
    }
  },

  updateRowWithItem: async function(rowIdx, itemInfo) {
    let row = this.filteredItems[rowIdx];
    if (!row && rowIdx >= this.filteredItems.length) {
      row = {
        name: "",
        code: "",
        artikul: "",
        unit: "шт",
        barcode: "",
        prices: {}
      };
      this.items.push(row);
      this.filteredItems = [...this.items];
      rowIdx = this.filteredItems.length - 1;
    }
    if (!row) return;

    row.name = itemInfo.name || "";
    row.code = itemInfo.code || "";
    row.artikul = itemInfo.artikul || "";
    row.unit = itemInfo.unit || "шт";
    row.barcode = itemInfo.barcode || "";

    // Clear previous product's prices so old prices never remain
    row.prices = {};

    this.renderTable();
    this.updateRowCount();

    // Query 1C for active prices (СрезПоследних) for this product
    const docDate = document.getElementById("pdeDocDate")?.value?.trim() || "";
    try {
      const resp = await fetch("/api/documents/item_prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: row.code,
          name: row.name,
          date: docDate,
          price_types: this.priceTypes
        })
      });
      const data = await resp.json();
      if (data.success && data.prices) {
        row.prices = data.prices;
        this.renderTable();
      }
    } catch (err) {
      console.warn("Could not fetch item prices from 1C:", err);
    }
  },

  selectNomItem: function(rowIdx, itemIdx) {
    const itm = this.currentAutocompleteItems[itemIdx];
    if (!itm) return;

    this.hideNomAutocomplete();
    this.updateRowWithItem(rowIdx, itm);
  },

  hideNomAutocomplete: function() {
    const dropdown = document.getElementById("pdeNomAutocompleteDropdown");
    if (dropdown) dropdown.style.display = "none";
    this.currentAutocompleteItems = [];
    this.activeAutocompleteIdx = -1;
  },

  onCodeCellChange: function(rowIdx, val) {
    const cleanVal = String(val || "").trim();
    if (!cleanVal) return;
    fetch("/api/documents/resolve_nomenclature", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codes: [cleanVal] })
    })
    .then(r => r.json())
    .then(res => {
      if (res.success && res.found && res.found[cleanVal]) {
        const info = res.found[cleanVal];
        this.updateRowWithItem(rowIdx, info);
      }
    });
  },

  onArtikulCellChange: function(rowIdx, val) {
    this.onCodeCellChange(rowIdx, val);
  },

  // ==========================================
  // Dedicated Nomenclature Picker Modal (F4)
  // ==========================================
  pickerTargetRowIdx: -1,
  nomPickerItems: [],
  nomPickerSelectedIdx: -1,

  openNomPickerForRow: function(rowIdx) {
    this.pickerTargetRowIdx = (typeof rowIdx === "number") ? rowIdx : this.selectedRowIdx;
    const modal = document.getElementById("pdeNomPickerModal");
    if (modal) modal.style.display = "flex";

    const searchInp = document.getElementById("pdeNomPickerSearchInp");
    let initQ = "";
    if (this.pickerTargetRowIdx >= 0 && this.filteredItems[this.pickerTargetRowIdx]) {
      initQ = this.filteredItems[this.pickerTargetRowIdx].name || "";
      initQ = initQ.split(" ").slice(0, 2).join(" ");
    }
    if (searchInp) {
      searchInp.value = initQ;
      setTimeout(() => {
        searchInp.focus();
        searchInp.select();
      }, 100);
    }
    this.onNomPickerSearchInput();
  },

  closeNomPickerModal: function() {
    const modal = document.getElementById("pdeNomPickerModal");
    if (modal) modal.style.display = "none";
  },

  onNomPickerSearchInput: function() {
    const searchInp = document.getElementById("pdeNomPickerSearchInp");
    const q = searchInp ? searchInp.value.trim() : "";
    if (!q) {
      const tbody = document.getElementById("pdeNomPickerTableBody");
      if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="padding: 25px; text-align: center; color: #888;">Введите поисковый запрос выше...</td></tr>`;
      return;
    }

    fetch("/api/nomenclature/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q })
    })
    .then(r => r.json())
    .then(res => {
      const items = res.success ? (res.items || []) : [];
      PriceDocEditor.nomPickerItems = items;
      PriceDocEditor.nomPickerSelectedIdx = 0;
      PriceDocEditor.renderNomPickerTable();
    });
  },

  renderNomPickerTable: function() {
    const tbody = document.getElementById("pdeNomPickerTableBody");
    if (!tbody) return;

    if (!this.nomPickerItems.length) {
      tbody.innerHTML = `<tr><td colspan="5" style="padding: 25px; text-align: center; color: #c62828;">Товары не найдены</td></tr>`;
      return;
    }

    let html = "";
    this.nomPickerItems.forEach((itm, idx) => {
      const isSel = (idx === this.nomPickerSelectedIdx);
      const bg = isSel ? "#316ac5" : (idx % 2 === 1 ? "#faf9f5" : "#ffffff");
      const fg = isSel ? "#ffffff" : "#000000";

      html += `
        <tr onclick="PriceDocEditor.selectNomPickerRow(${idx})" 
            ondblclick="PriceDocEditor.confirmNomPickerSelection()"
            style="background: ${bg}; color: ${fg}; height: 21px; cursor: pointer; user-select: none;">
          <td style="padding: 2px 4px; border: 1px solid #d4d0c8;">${this.escapeHtml(itm.code)}</td>
          <td style="padding: 2px 4px; border: 1px solid #d4d0c8;">${this.escapeHtml(itm.artikul)}</td>
          <td style="padding: 2px 4px; border: 1px solid #d4d0c8; text-align: center; font-family: Consolas, monospace;">${this.escapeHtml(itm.barcode || '')}</td>
          <td style="padding: 2px 4px; border: 1px solid #d4d0c8; font-weight: 500;">${this.escapeHtml(itm.name)}</td>
          <td style="padding: 2px 4px; border: 1px solid #d4d0c8; text-align: center;">${this.escapeHtml(itm.unit || 'шт')}</td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  },

  selectNomPickerRow: function(idx) {
    this.nomPickerSelectedIdx = idx;
    this.renderNomPickerTable();
  },

  confirmNomPickerSelection: function() {
    if (this.nomPickerSelectedIdx < 0 || !this.nomPickerItems[this.nomPickerSelectedIdx]) return;
    const itm = this.nomPickerItems[this.nomPickerSelectedIdx];
    const targetIdx = (this.pickerTargetRowIdx >= 0 && this.pickerTargetRowIdx < this.filteredItems.length)
      ? this.pickerTargetRowIdx
      : this.filteredItems.length;

    this.closeNomPickerModal();
    this.updateRowWithItem(targetIdx, itm);
  },

  // ==========================================
  // Column Settings Modal (Screenshot 4)
  // ==========================================
  colModalItems: [],
  colSelectedIdx: 0,

  openColumnSettingsModal: function() {
    this.closeAllMenus();

    this.colModalItems = JSON.parse(JSON.stringify(this.columnsConfig));
    this.colSelectedIdx = 0;
    this.renderColChecklist();

    const modal = document.getElementById("pdeColumnSettingsModal");
    if (modal) modal.style.display = "flex";
  },

  closeColumnSettingsModal: function() {
    const modal = document.getElementById("pdeColumnSettingsModal");
    if (modal) modal.style.display = "none";
  },

  renderColChecklist: function() {
    const container = document.getElementById("pdeColChecklistContainer");
    if (!container) return;

    let html = "";
    this.colModalItems.forEach((col, idx) => {
      const isSel = (idx === this.colSelectedIdx);
      const bg = isSel ? "#316ac5" : (idx % 2 === 1 ? "#faf9f5" : "#ffffff");
      const fg = isSel ? "#ffffff" : "#000000";

      html += `
        <div onclick="PriceDocEditor.selectColRow(${idx})"
             style="display: flex; align-items: center; gap: 6px; padding: 2px 6px; cursor: pointer; user-select: none; background: ${bg}; color: ${fg}; border-bottom: 1px dotted #e0dfd5; height: 20px; box-sizing: border-box;">
          <input type="checkbox" ${col.visible ? 'checked' : ''}
                 onchange="PriceDocEditor.toggleColVisible(${idx}, this.checked)"
                 onclick="event.stopPropagation()"
                 style="cursor: pointer; margin: 0; padding: 0;">
          <span style="font-size: 11px;">${this.escapeHtml(col.label)}</span>
        </div>
      `;
    });

    container.innerHTML = html;
  },

  selectColRow: function(idx) {
    this.colSelectedIdx = idx;
    this.renderColChecklist();
  },

  toggleColVisible: function(idx, isChecked) {
    if (this.colModalItems[idx]) {
      this.colModalItems[idx].visible = isChecked;
    }
    this.renderColChecklist();
  },

  colMoveUp: function() {
    if (this.colSelectedIdx > 0 && this.colSelectedIdx < this.colModalItems.length) {
      const tmp = this.colModalItems[this.colSelectedIdx];
      this.colModalItems[this.colSelectedIdx] = this.colModalItems[this.colSelectedIdx - 1];
      this.colModalItems[this.colSelectedIdx - 1] = tmp;
      this.colSelectedIdx--;
      this.renderColChecklist();
    }
  },

  colMoveDown: function() {
    if (this.colSelectedIdx >= 0 && this.colSelectedIdx < this.colModalItems.length - 1) {
      const tmp = this.colModalItems[this.colSelectedIdx];
      this.colModalItems[this.colSelectedIdx] = this.colModalItems[this.colSelectedIdx + 1];
      this.colModalItems[this.colSelectedIdx + 1] = tmp;
      this.colSelectedIdx++;
      this.renderColChecklist();
    }
  },

  colResetDefault: function() {
    this.colModalItems = [
      { id: "num", label: "№", visible: true, width: 35, align: "center" },
      { id: "code", label: "Код", visible: true, width: 85, align: "left" },
      { id: "artikul", label: "Артикул", visible: true, width: 85, align: "left" },
      { id: "barcode", label: "Штрихкод", visible: false, width: 110, align: "center" },
      { id: "name", label: "Номенклатура", visible: true, width: 300, align: "left" },
      { id: "unit", label: "Единица", visible: true, width: 45, align: "center" }
    ];
    this.colSelectedIdx = 0;
    this.renderColChecklist();
  },

  applyColumnSettings: function(shouldClose) {
    this.columnsConfig = JSON.parse(JSON.stringify(this.colModalItems));
    try {
      localStorage.setItem("1c_price_doc_columns", JSON.stringify(this.columnsConfig));
    } catch(e) {}

    this.renderTable();

    if (shouldClose) {
      this.closeColumnSettingsModal();
    }
  }
};

// Global click handler to close dropdown menus & autocomplete
document.addEventListener("click", function(e) {
  if (!e.target.closest("#priceDocEditorWindow button")) {
    PriceDocEditor.closeAllMenus();
  }
  if (!e.target.closest("#pdeNomAutocompleteDropdown") && !e.target.closest(".pde-nom-cell-wrapper")) {
    PriceDocEditor.hideNomAutocomplete();
  }
});

// Global shortcut handlers for 1C document editor (F4, Ctrl+S, Delete)
document.addEventListener("keydown", function(e) {
  const docWin = document.getElementById("priceDocEditorWindow");
  if (!docWin || docWin.style.display === "none") return;

  // F4: Open nomenclature picker
  if (e.key === "F4") {
    e.preventDefault();
    PriceDocEditor.openNomPickerForRow(PriceDocEditor.selectedRowIdx >= 0 ? PriceDocEditor.selectedRowIdx : 0);
  }

  // Ctrl+S: Save document to 1C
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    PriceDocEditor.saveTo1C();
  }

  // Delete key: Delete selected row without popup if not inside text input
  if (e.key === "Delete") {
    const tag = document.activeElement ? document.activeElement.tagName : "";
    if (tag !== "INPUT" && tag !== "TEXTAREA") {
      e.preventDefault();
      PriceDocEditor.deleteSelectedRow();
    }
  }
});

window.PriceDocEditor = PriceDocEditor;
