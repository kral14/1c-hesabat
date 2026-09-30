/* ========================================================
   1C:ENTERPRISE UNIVERSAL REPORT - REPORT ENGINE
   report_engine.js
   ======================================================== */

if (typeof escapeHtml !== "function") {
  window.escapeHtml = function(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };
}

const ReportEngine = {
  currentData: null,
  isExecuting: false,

  formatNumber(val) {
    if (val === null || val === undefined || isNaN(val)) return "0.00";
    const num = Number(val);
    const parts = num.toFixed(2).split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return parts.join(".");
  },

  getMonthRussianName(dateStr) {
    // Expected format: DD.MM.YYYY
    if (!dateStr || dateStr.length < 10) return "Сентябрь 2026 г.";
    const parts = dateStr.split(".");
    if (parts.length < 3) return dateStr;
    const m = parseInt(parts[1], 10);
    const y = parts[2];
    const months = [
      "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
      "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
    ];
    return `${months[m - 1] || ""} ${y} г.`;
  },

  async runReport() {
    if (this.isExecuting) return;
    this.isExecuting = true;

    const loadingOverlay = document.getElementById("loadingOverlay");
    const loadingText = document.getElementById("loadingText");
    if (loadingOverlay) loadingOverlay.style.display = "flex";
    if (loadingText) loadingText.textContent = "1C: Məlumatlar sorğulanır və cədvəl qurulur...";

    try {
      const config = SettingsModal.getConfig();
      const creds = SessionManager.getCredentials();

      const payload = {
        ...creds,
        start_date: config.startDate,
        end_date: config.endDate,
        price_type: config.priceType || "20",
        price_types: (config.priceTypes && config.priceTypes.length > 0) ? config.priceTypes : [config.priceType || "20"],
        parameters: config.parameters,
        indicators: config.indicators,
        row_groupings: config.rowGroupings,
        col_groupings: config.colGroupings,
        filters: config.filters
      };

      const res = await fetch("/api/universal_report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Hesabat yaradılarkən xəta baş verdi.");
      }

      this.currentData = data;
      this.currentConfig = config;
      this.renderReport(data, config);

    } catch (err) {
      console.error("1C Hesabat Xətası:", err);
      const emptyText = document.getElementById("sheetEmptyText");
      if (emptyText) {
        emptyText.innerHTML = `<span style="color: #c00000; font-weight: bold;">Xəta: ${escapeHtml(err.message)}</span><br><br>Yenidən yoxlamaq üçün [Сформировать] basın.`;
      }
    } finally {
      if (loadingOverlay) loadingOverlay.style.display = "none";
      this.isExecuting = false;
    }
  },

  renderReport(data, config) {
    const emptyState = document.getElementById("sheetEmptyState");
    const contentContainer = document.getElementById("sheetContentContainer");
    if (emptyState) emptyState.style.display = "none";
    if (contentContainer) contentContainer.style.display = "block";

    // 1. Render Metadata Summary Header (Screenshot 1)
    this.renderMetadataHeader(data, config);

    // Show cache warning if loaded from fallback cache
    if (data.is_cached && data.warning_message) {
      const metaTitle = document.getElementById("sheetMetaTitle");
      if (metaTitle && !document.getElementById("sheetCachedBadge")) {
        const badge = document.createElement("span");
        badge.id = "sheetCachedBadge";
        badge.style.cssText = "margin-left: 12px; font-size: 11px; padding: 2px 6px; background: #fff3cd; color: #856404; border: 1px solid #ffeeba; border-radius: 3px; font-weight: normal;";
        badge.textContent = "⚡ Keşdən yükləndi (1C lisenziya məşğuldur)";
        badge.title = data.warning_message;
        metaTitle.appendChild(badge);
      }
    }

    // 2. Render Spreadsheet Table Grid (Screenshot 1)
    this.renderTable(data, config);
  },

  renderMetadataHeader(data, config) {
    const metaTitle = document.getElementById("sheetMetaTitle");
    const metaPeriod = document.getElementById("sheetMetaPeriod");
    const metaIndicators = document.getElementById("sheetMetaIndicatorsText");
    const metaGroupings = document.getElementById("sheetMetaGroupingsText");
    const metaFiltersBlock = document.getElementById("sheetMetaFilters");
    const metaFiltersText = document.getElementById("sheetMetaFiltersText");

    if (metaTitle) metaTitle.textContent = data.report_title || "Товары на складах";
    
    // Period text
    const periodStr = this.getMonthRussianName(config.startDate);
    if (metaPeriod) {
      metaPeriod.textContent = `Период: ${periodStr} (${config.startDate} - ${config.endDate})`;
    }

    // Active indicators
    const indParts = [];
    const rawPTs = (data.price_types && data.price_types.length > 0)
      ? data.price_types
      : (config.priceTypes && config.priceTypes.length > 0 ? config.priceTypes : [config.priceType || "20"]);
    const activePTs = rawPTs
      .map(p => (typeof p === "object" && p !== null) ? (p.name || p.code || "") : String(p))
      .filter(p => p && p !== "[object Object]");
    if (config.indicators.showPrice) indParts.push(`Цена [${activePTs.join(", ")}]`);
    if (config.indicators.barcodeUnit) indParts.push("Штрихкод (шт)");
    if (config.indicators.barcodeBox) indParts.push("Штрихкод (кор)");
    if (config.indicators.barcodeBlock) indParts.push("Штрихкод (упак)");
    if (config.indicators.qtyStart) indParts.push("Начальный остаток");
    if (config.indicators.qtyIn) indParts.push("Приход");
    if (config.indicators.qtyOut) indParts.push("Расход");
    if (config.indicators.qtyEnd) indParts.push("Конечный остаток");
    if (config.indicators.qtyTurnover) indParts.push("Оборот");
    if (config.indicators.showSum) indParts.push("Сумма");
    if (metaIndicators) {
      metaIndicators.textContent = `Показатели(${indParts.join(", ")});`;
    }

    // Active groupings
    const grpList = config.rowGroupings.map(g => `${g.field} (${g.type || "Элементы"})`);
    if (metaGroupings) {
      metaGroupings.textContent = grpList.join("; ") + ";";
    }

    // Active filters
    const activeFilters = config.filters.filter(f => f.active);
    if (metaFiltersBlock && metaFiltersText) {
      if (activeFilters.length > 0) {
        metaFiltersBlock.style.display = "block";
        const fText = activeFilters.map(f => {
          let op = "Равно";
          if (f.comparison === "less") op = "Меньше";
          else if (f.comparison === "greater") op = "Больше";
          else if (f.comparison === "not_equal") op = "Не равно";
          else if (f.comparison === "in_list") op = "В группе из списка";
          else if (f.comparison === "contains") op = "Содержит";
          return `${f.field} ${op} ${f.value};`;
        }).join("<br>");
        metaFiltersText.innerHTML = fText;
      } else {
        metaFiltersBlock.style.display = "none";
      }
    }
  },

  renderTable(data, config) {
    const thead = document.getElementById("sheetTableHead");
    const tbody = document.getElementById("sheetTableBody");
    const tfoot = document.getElementById("sheetTableFoot");

    thead.innerHTML = "";
    tbody.innerHTML = "";
    tfoot.innerHTML = "";

    const activeQtyCols = [];
    if (config.indicators.qtyStart) activeQtyCols.push({ id: "start_bal", title: "Начальный остаток" });
    if (config.indicators.qtyIn) activeQtyCols.push({ id: "in_qty", title: "Приход" });
    if (config.indicators.qtyOut) activeQtyCols.push({ id: "out_qty", title: "Расход" });
    if (config.indicators.qtyEnd) activeQtyCols.push({ id: "end_bal", title: "Конечный остаток" });
    if (config.indicators.qtyTurnover) activeQtyCols.push({ id: "turnover", title: "Оборот" });

    const showPrice = config.indicators?.showPrice ?? true;
    const showSum = config.indicators?.showSum ?? true;

    // Barcode columns setup
    const activeBc = data.active_barcode_cols || {
      unit: config.indicators?.barcodeUnit ?? true,
      box: config.indicators?.barcodeBox ?? true,
      block: config.indicators?.barcodeBlock ?? false
    };
    const showBcUnit = !!activeBc.unit;
    const showBcBox = !!activeBc.box;
    const showBcBlock = !!activeBc.block;
    const bcColCount = (showBcUnit ? 1 : 0) + (showBcBox ? 1 : 0) + (showBcBlock ? 1 : 0);

    // Price types list
    const rawPriceTypes = (data.price_types && data.price_types.length > 0)
      ? data.price_types
      : (config.priceTypes && config.priceTypes.length > 0 ? config.priceTypes : [config.priceType || "20"]);
    const priceTypes = rawPriceTypes
      .map(p => (typeof p === "object" && p !== null) ? (p.name || p.code || "") : String(p))
      .filter(p => p && p !== "[object Object]");

    // Table Headers (Two Rows)
    const tr1 = document.createElement("tr");
    const groupingTitle = (config.rowGroupings && config.rowGroupings.length > 0)
      ? config.rowGroupings.map(g => g.field).join("<br>")
      : "Склад<br>Номенклатура";

    let barcodeHeaders = "";
    if (showBcUnit) barcodeHeaders += '<th rowspan="2" style="width: 110px;">Штрихкод<br>(шт)</th>';
    if (showBcBox) barcodeHeaders += '<th rowspan="2" style="width: 110px;">Штрихкод<br>(кор)</th>';
    if (showBcBlock) barcodeHeaders += '<th rowspan="2" style="width: 110px;">Штрихкод<br>(упак)</th>';

    let priceHeaders = "";
    if (showPrice) {
      priceTypes.forEach(pt => {
        priceHeaders += `<th rowspan="2" style="width: 100px; background: #eef2f8;">Цена<br>(${escapeHtml(pt)})</th>`;
      });
    }

    let sumHeaders = "";
    if (showSum) {
      priceTypes.forEach(pt => {
        sumHeaders += `<th rowspan="2" style="width: 125px; background: #fdf6e7;">Сумма<br>(${escapeHtml(pt)})</th>`;
      });
    }

    tr1.innerHTML = `
      <th rowspan="2" style="width: 80px;">Код</th>
      <th rowspan="2" style="width: 100px;">Артикул</th>
      ${barcodeHeaders}
      <th rowspan="2" style="min-width: 320px; text-align: left;">${groupingTitle}</th>
      <th rowspan="2" style="width: 70px;">С вход</th>
      <th rowspan="2" style="width: 90px;">Номер</th>
      ${priceHeaders}
      <th colspan="${activeQtyCols.length}" class="header-group">Количество</th>
      ${sumHeaders}
    `;
    thead.appendChild(tr1);

    const tr2 = document.createElement("tr");
    activeQtyCols.forEach(col => {
      const th = document.createElement("th");
      th.style.width = "110px";
      th.textContent = col.title;
      tr2.appendChild(th);
    });
    thead.appendChild(tr2);

    // Populate Data Rows
    const items = data.items || [];
    const negRed = config.parameters.negativeRed;

    const totalCols = 5 + bcColCount + (showPrice ? priceTypes.length : 0) + activeQtyCols.length + (showSum ? priceTypes.length : 0);

    if (items.length === 0) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="${totalCols}" style="text-align: center; padding: 40px 10px; color: #7f8c8d; font-size: 13px;">
        <div style="font-size: 15px; font-weight: bold; margin-bottom: 6px; color: #444;">⚠️ Seçilmiş parametrlərə və süzgəclərə uyğun heç bir məlumat tapılmadı.</div>
        <div style="font-size: 12px; color: #888;">Zəhmət olmasa "Настройка..." düyməsinə klikləyib dövrü və ya aktiv süzgəcləri yoxlayın.</div>
      </td>`;
      tbody.appendChild(tr);
      return;
    }

    items.forEach((item, index) => {
      const tr = document.createElement("tr");
      const level = item.level !== undefined ? item.level : 0;
      const isDoc = item.is_doc === true;
      tr.className = `row-group-${level}${isDoc ? " row-doc-movement" : ""}`;
      tr.dataset.rowId = `row_${index}`;
      tr.dataset.parentId = item.parent_id !== undefined ? `row_${item.parent_id}` : "";
      tr.dataset.level = level;

      // Toggle button for nodes with children
      let toggleHtml = "";
      if (item.has_children) {
        toggleHtml = `<span class="tree-toggle-btn" onclick="toggleReportRow(this, 'row_${index}')">-</span>`;
      } else if (level > 0) {
        toggleHtml = `<span style="display: inline-block; width: 17px;"></span>`;
      }

      const indentClass = level > 0 ? (level === 1 ? "tree-indent-1" : (level === 2 ? "tree-indent-2" : "tree-indent-3")) : "";
      const isLeaf = !item.has_children;

      // Document icon for movement rows
      const docIcon = isDoc ? `<span style="color: #7a4100; font-size: 10px; margin-right: 3px;" title="Движение документа">📄</span>` : "";
      // Show date in doc row title
      const docDateHtml = (isDoc && item.doc_date) ? `<span style="color: #888; font-size: 10px; margin-left: 6px;">${item.doc_date}</span>` : "";

      // Barcode cells
      let barcodeCellsHtml = "";
      if (showBcUnit) {
        barcodeCellsHtml += `<td class="cell-code" style="font-size: 11px; font-family: monospace;">${escapeHtml(item.barcode_unit || "")}</td>`;
      }
      if (showBcBox) {
        barcodeCellsHtml += `<td class="cell-code" style="font-size: 11px; font-family: monospace;">${escapeHtml(item.barcode_box || "")}</td>`;
      }
      if (showBcBlock) {
        barcodeCellsHtml += `<td class="cell-code" style="font-size: 11px; font-family: monospace;">${escapeHtml(item.barcode_block || "")}</td>`;
      }

      // Price cells (one for each active price type)
      let priceCellsHtml = "";
      if (showPrice) {
        priceTypes.forEach(pt => {
          let pVal = 0;
          if (item.prices && item.prices[pt] !== undefined) {
            pVal = item.prices[pt];
          } else if (pt === priceTypes[0] && item.unit_price) {
            pVal = item.unit_price;
          }

          if (isLeaf && !isDoc) {
            priceCellsHtml += `<td class="cell-num" style="font-weight: 500; color: #003366; background: #fafcfe;">${pVal > 0 ? ReportEngine.formatNumber(pVal) : "-"}</td>`;
          } else if (isDoc && pVal > 0) {
            priceCellsHtml += `<td class="cell-num" style="color: #6b4c00; font-style: italic;">${ReportEngine.formatNumber(pVal)}</td>`;
          } else {
            priceCellsHtml += `<td class="cell-num" style="color: #bbb;"></td>`;
          }
        });
      }

      // Quantity cells
      let qtyCellsHtml = "";
      activeQtyCols.forEach(col => {
        const val = item[col.id] || 0;
        const formatted = ReportEngine.formatNumber(val);
        const isNeg = val < 0 && negRed;
        const docStyle = isDoc ? " font-style: italic; color: #6b4c00;" : "";
        qtyCellsHtml += `<td class="cell-num ${isNeg ? 'negative-red' : ''}" style="${docStyle}">${formatted}</td>`;
      });

      // Sum cells (one for each active price type)
      let sumCellsHtml = "";
      if (showSum) {
        priceTypes.forEach(pt => {
          let sVal = 0;
          if (item.sums && item.sums[pt] !== undefined) {
            sVal = item.sums[pt];
          } else if (pt === priceTypes[0] && item.end_sum) {
            sVal = item.end_sum;
          }

          let sumStyle;
          if (isDoc) {
            sumStyle = "font-style: italic; color: #6b4c00;";
          } else if (level === 0) {
            sumStyle = "font-weight: bold; background: #fbf5e6; color: #7a4100;";
          } else if (level === 1 && !isLeaf) {
            sumStyle = "font-weight: bold; background: #f4f8fe; color: #003366;";
          } else if (isLeaf) {
            sumStyle = "font-weight: 500; color: #222;";
          } else {
            sumStyle = "color: #999;";
          }
          sumCellsHtml += `<td class="cell-num" style="${sumStyle}">${sVal > 0 ? ReportEngine.formatNumber(sVal) : (sVal < 0 ? `<span class="${negRed ? 'negative-red' : ''}">${ReportEngine.formatNumber(sVal)}</span>` : "-")}</td>`;
        });
      }

      tr.innerHTML = `
        <td class="cell-code">${item.code || ""}</td>
        <td class="cell-code">${item.artikul || ""}</td>
        ${barcodeCellsHtml}
        <td class="cell-text ${indentClass}">
          ${toggleHtml}${docIcon}<span>${item.title || item.name || ""}</span>${docDateHtml}
        </td>
        <td class="cell-code">${item.custom_field || ""}</td>
        <td class="cell-code" style="${isDoc ? 'color: #888; font-size: 10px;' : ''}">${item.doc_number || ""}</td>
        ${priceCellsHtml}
        ${qtyCellsHtml}
        ${sumCellsHtml}
      `;

      tbody.appendChild(tr);
    });

    // Grand Totals Row
    if (config.parameters.showGrandTotals && data.totals) {
      const tot = data.totals;
      const trTot = document.createElement("tr");
      trTot.className = "row-total";

      let emptyBarcodeCols = "";
      for (let i = 0; i < bcColCount; i++) {
        emptyBarcodeCols += '<td class="cell-code"></td>';
      }

      let emptyPriceCols = "";
      if (showPrice) {
        priceTypes.forEach(() => {
          emptyPriceCols += '<td class="cell-code"></td>';
        });
      }

      let totQtyHtml = "";
      activeQtyCols.forEach(col => {
        const val = tot[col.id] || 0;
        const formatted = ReportEngine.formatNumber(val);
        const isNeg = val < 0 && negRed;
        totQtyHtml += `<td class="cell-num ${isNeg ? 'negative-red' : ''}">${formatted}</td>`;
      });

      let totSumCellsHtml = "";
      if (showSum) {
        priceTypes.forEach(pt => {
          let sTot = 0;
          if (tot.total_sums && tot.total_sums[pt] !== undefined) {
            sTot = tot.total_sums[pt];
          } else if (pt === priceTypes[0] && tot.total_sum) {
            sTot = tot.total_sum;
          }
          totSumCellsHtml += `<td class="cell-num" style="font-weight: bold; background: #faecc7; color: #5a2e00;">${ReportEngine.formatNumber(sTot)}</td>`;
        });
      }

      trTot.innerHTML = `
        <td class="cell-code"></td>
        <td class="cell-code"></td>
        ${emptyBarcodeCols}
        <td class="cell-text" style="font-weight: bold;">Итого (${items.length} sətir)</td>
        <td class="cell-code"></td>
        <td class="cell-code"></td>
        ${emptyPriceCols}
        ${totQtyHtml}
        ${totSumCellsHtml}
      `;
      tfoot.appendChild(trTot);
    }

    // Setup Left Gutter Outline & Grouping Levels
    this.updateGutterLevels(data, config);
  },

  updateGutterLevels(data, config) {
    const items = data.items || [];
    const maxLvl = items.reduce((max, i) => Math.max(max, i.level || 0), 0);
    const hasLvl2 = maxLvl >= 2;
    const lvl3Btn = document.getElementById("btnGutterLvl3");
    const cmLvl3Item = document.getElementById("cmLvl3Item");

    if (lvl3Btn) lvl3Btn.style.display = hasLvl2 ? "inline-flex" : "none";
    if (cmLvl3Item) cmLvl3Item.style.display = hasLvl2 ? "flex" : "none";

    // Default to show products
    this.setGroupLevel(hasLvl2 ? 3 : 2);
  },

  setGroupLevel(targetLevel) {
    const tbody = document.getElementById("sheetTableBody");
    if (!tbody) return;

    // Gutter buttons active styles
    const btn1 = document.getElementById("btnGutterLvl1");
    const btn2 = document.getElementById("btnGutterLvl2");
    const btn3 = document.getElementById("btnGutterLvl3");

    if (btn1) btn1.classList.toggle("active", targetLevel >= 1);
    if (btn2) btn2.classList.toggle("active", targetLevel >= 2);
    if (btn3) btn3.classList.toggle("active", targetLevel >= 3);

    const allRows = tbody.querySelectorAll("tr");
    const itemsWithLvl2 = tbody.querySelector("tr[data-level='2']") !== null;

    allRows.forEach(tr => {
      const lvl = parseInt(tr.dataset.level || "0", 10);
      const btn = tr.querySelector(".tree-toggle-btn");

      if (targetLevel === 1) {
        // Level 1: Only root group visible (Level 0)
        if (lvl === 0) {
          tr.style.display = "";
          if (btn) btn.textContent = "+";
        } else {
          tr.style.display = "none";
          if (btn) btn.textContent = "+";
        }
      } else if (targetLevel === 2) {
        if (itemsWithLvl2) {
          // Level 2: Level 0 open (-), Level 1 visible, Level 2 folded (+)
          if (lvl === 0) {
            tr.style.display = "";
            if (btn) btn.textContent = "-";
          } else if (lvl === 1) {
            tr.style.display = "";
            if (btn) btn.textContent = "+";
          } else {
            tr.style.display = "none";
            if (btn) btn.textContent = "+";
          }
        } else {
          // 2 levels total: Level 0 and Level 1 visible
          tr.style.display = "";
          if (lvl === 0 && btn) btn.textContent = "-";
        }
      } else if (targetLevel >= 3) {
        // Level 3: Everything open
        tr.style.display = "";
        if (btn) btn.textContent = "-";
      }
    });

    this.renderGutterTreeBrackets();
    closeReportContextMenu();
  },

  renderGutterTreeBrackets() {
    const track = document.getElementById("gutterTreeTrack");
    const tbody = document.getElementById("sheetTableBody");
    if (!track || !tbody) return;

    track.innerHTML = "";
    const groupRows = Array.from(tbody.querySelectorAll("tr[data-level='0']"));
    if (groupRows.length === 0) return;

    const trackRect = track.getBoundingClientRect();

    groupRows.forEach(row => {
      if (row.style.display === "none") return;
      const rowRect = row.getBoundingClientRect();
      const topOffset = rowRect.top - trackRect.top;
      const rowId = row.dataset.rowId;
      const btn = row.querySelector(".tree-toggle-btn");
      const isExpanded = btn ? btn.textContent === "-" : true;

      // Find last visible descendant
      let lastDescendant = row;
      if (isExpanded) {
        const descendants = Array.from(tbody.querySelectorAll(`tr[data-parent-id='${rowId}']`));
        for (const d of descendants) {
          if (d.style.display !== "none") {
            lastDescendant = d;
          }
        }
      }

      const lastRect = lastDescendant.getBoundingClientRect();
      const bottomOffset = lastRect.bottom - trackRect.top;

      // Create tree button box [-] / [+]
      const node = document.createElement("div");
      node.className = "gutter-tree-node";
      node.style.top = `${Math.round(topOffset + 4)}px`;

      const box = document.createElement("div");
      box.className = "gutter-tree-box";
      box.textContent = isExpanded ? "-" : "+";
      box.title = isExpanded ? "Свернуть группу" : "Развернуть группу";
      box.onclick = (e) => {
        e.stopPropagation();
        if (btn) {
          toggleReportRow(btn, rowId);
        }
      };
      node.appendChild(box);
      track.appendChild(node);

      // If expanded, draw vertical line connecting down the products
      if (isExpanded && lastDescendant !== row) {
        const line = document.createElement("div");
        line.className = "gutter-tree-line";
        line.style.top = `${Math.round(topOffset + 16)}px`;
        const lineH = Math.max(0, bottomOffset - topOffset - 22);
        line.style.height = `${Math.round(lineH)}px`;
        track.appendChild(line);
      }
    });
  },

  copyTableSelection() {
    closeReportContextMenu();
    const sel = window.getSelection().toString();
    if (sel) {
      navigator.clipboard.writeText(sel);
    } else {
      alert("Zəhmət olmasa cədvəldən köçürmək istədiyiniz mətni seçin.");
    }
  },

  selectAllTable() {
    closeReportContextMenu();
    const table = document.getElementById("sheetReportTable");
    if (!table) return;
    const range = document.createRange();
    range.selectNodeContents(table);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
};

// Global Row Toggle (Expand / Collapse)
function toggleReportRow(btn, rowId) {
  const isExpanded = btn.textContent === "-";
  btn.textContent = isExpanded ? "+" : "-";

  const tbody = document.getElementById("sheetTableBody");
  if (!tbody) return;

  function hideDescendants(parentId) {
    const children = tbody.querySelectorAll(`tr[data-parent-id="${parentId}"]`);
    children.forEach(child => {
      child.style.display = "none";
      const childBtn = child.querySelector(".tree-toggle-btn");
      if (childBtn) childBtn.textContent = "+";
      const cId = child.dataset.rowId;
      if (cId) hideDescendants(cId);
    });
  }

  if (isExpanded) {
    hideDescendants(rowId);
  } else {
    const directChildren = tbody.querySelectorAll(`tr[data-parent-id="${rowId}"]`);
    directChildren.forEach(child => {
      child.style.display = "";
    });
  }

  ReportEngine.renderGutterTreeBrackets();
}

// Right-click Context Menu Handlers (Screenshot 4)
function openReportContextMenu(e) {
  e.preventDefault();
  const cm = document.getElementById("reportContextMenu");
  if (!cm) return;
  cm.style.left = `${Math.min(e.clientX, window.innerWidth - 220)}px`;
  cm.style.top = `${Math.min(e.clientY, window.innerHeight - 340)}px`;
  cm.classList.add("show");
}

function closeReportContextMenu() {
  const cm = document.getElementById("reportContextMenu");
  if (cm) cm.classList.remove("show");
}

document.addEventListener("click", (e) => {
  if (!e.target.closest("#reportContextMenu")) {
    closeReportContextMenu();
  }
});

// Global Toolbar Handlers
function onActionFormirovat() {
  ReportEngine.runReport();
}

async function exportReportToExcel() {
  try {
    if (ReportEngine.currentData && ReportEngine.currentData.items && ReportEngine.currentData.items.length > 0) {
      const config = (ReportEngine.currentConfig && Object.keys(ReportEngine.currentConfig).length > 0)
        ? ReportEngine.currentConfig
        : SettingsModal.getConfig();
      if (!config.price_types) {
        config.price_types = (config.priceTypes && config.priceTypes.length > 0) ? config.priceTypes : [config.priceType || "20"];
      }
      await fetch("/api/export_universal_report_excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report_data: ReportEngine.currentData,
          config: config
        })
      });
    }
  } catch (e) {
    console.warn("Excel export sync note:", e);
  }
  
  const a = document.createElement("a");
  a.href = "/api/download_universal_report_excel";
  a.download = `Tovari_na_skladakh_${Date.now()}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function printReportSheet() {
  window.print();
}

function show1CHelp() {
  alert("1C Universal Hesabat Məlumatı:\n\n- 'Сформировать' düyməsi ilə anbar qalıqları və daxili hərəkətlər formalaşdırılır.\n- 'Настройка...' düyməsi ilə göstəricilər (Показатели), qruplaşmalar və süzgəclər dəyişdirilir.\n- Qruplaşmaları açmaq/bağlamaq üçün sətirlərdəki [+] və [-] düymələrindən və ya sol paneldəki [1] və [2] düymələrindən istifadə edin.\n- Cədvələ sağ klikləyərək kontekst menyunu ('Уровни группировок') aça bilərsiniz.");
}

function toggleQuickFilters() {
  openSettingsModal();
}

function resetToDefaultSettings() {
  if (window.SettingsPresets && typeof SettingsPresets.resetToCleanDefault === "function") {
    SettingsPresets.resetToCleanDefault();
  } else {
    const s = document.getElementById("topStartDateInput");
    const e = document.getElementById("topEndDateInput");
    if (s) s.value = "01.09.2026";
    if (e) e.value = "30.09.2026";
  }
}

function saveSettingsPreset() {
  if (typeof openSaveSettingsModal === "function") {
    openSaveSettingsModal();
  }
}

window.addEventListener("resize", () => {
  if (typeof ReportEngine !== "undefined" && ReportEngine.renderGutterTreeBrackets) {
    ReportEngine.renderGutterTreeBrackets();
  }
});
