/**
 * static/js/order_analysis_report.js
 * ===================================
 * 1C:Enterprise Müştəri Sifarişləri Analizi (Заказ покупателя анализ) hesabatının
 * tamamilə müstəqil müştəri tərəfi (frontend) idarəedicisi.
 */

window.OrderAnalysisReport = (function () {
  let currentReportData = null;
  let isGenerating = false;
  let abortController = null;

  function init() {
    console.log("🛒 [ORDER ANALYSIS] Report controller initialized.");

    // Restore remembered period if available
    if (window.PeriodPicker && typeof PeriodPicker.restoreSavedPeriod === "function") {
      PeriodPicker.restoreSavedPeriod();
    } else {
      updatePeriodLabel();
    }

    // Initialize dynamic level buttons based on current settings
    try {
      const initialGroupings = window.OrderAnalysisSettings
        ? OrderAnalysisSettings.getSettings().groupings
        : ["Контрагент", "Номенклатура"];
      updateLevelButtons(initialGroupings);
    } catch (e) {}

    // Bind Enter on date inputs
    const dStart = document.getElementById("oaStartDateInput");
    const dEnd = document.getElementById("oaEndDateInput");
    if (dStart) {
      dStart.addEventListener("keydown", (e) => {
        if (e.key === "Enter") generate();
      });
    }
    if (dEnd) {
      dEnd.addEventListener("keydown", (e) => {
        if (e.key === "Enter") generate();
      });
    }

    // Close actions menu when clicking outside
    document.addEventListener("click", (e) => {
      const drop = document.getElementById("oaActionsDropdown");
      const btn = document.getElementById("oaBtnActions");
      if (drop && drop.style.display === "block") {
        if (!drop.contains(e.target) && (!btn || !btn.contains(e.target))) {
          drop.style.display = "none";
        }
      }
    });
  }

  function openWindow() {
    const win = document.getElementById('orderAnalysisWindow');
    if (win) {
      win.style.display = 'flex';
      win.classList.remove('minimized');
      win.classList.add('active');
    }

    if (window.MdiManager && typeof MdiManager.activateWindow === "function") {
      MdiManager.activateWindow('orderAnalysisWindow', {
        title: "Заказы покупателей (Анализ)",
        icon: "🛒"
      });
    }

    // Sync switcher
    const s1 = document.getElementById("mainReportSwitcher");
    const s2 = document.getElementById("oaReportSwitcher");
    if (s1) s1.value = "ЗаказПокупателяАнализ";
    if (s2) s2.value = "ЗаказПокупателяАнализ";

    // Restore remembered period for order_analysis if available
    const rem = (window.C1PeriodWidget && typeof C1PeriodWidget.getStoredPeriod === "function")
      ? C1PeriodWidget.getStoredPeriod("order_analysis")
      : (window.PeriodPicker && typeof PeriodPicker.getRememberedPeriod === "function" ? PeriodPicker.getRememberedPeriod("order_analysis") : null);
    const oaStart = document.getElementById("oaStartDateInput");
    const oaEnd = document.getElementById("oaEndDateInput");

    if (rem && (rem.startDate || rem.endDate)) {
      if (oaStart && rem.startDate) oaStart.value = rem.startDate;
      if (oaEnd && rem.endDate) oaEnd.value = rem.endDate;
    } else {
      const def = (window.C1PeriodWidget && typeof C1PeriodWidget.getDefaultPeriod === "function")
        ? C1PeriodWidget.getDefaultPeriod()
        : null;
      if (def) {
        if (oaStart && !oaStart.value) oaStart.value = def.startDate;
        if (oaEnd && !oaEnd.value) oaEnd.value = def.endDate;
      }
    }
    updatePeriodLabel();
  }

  function updatePeriodLabel() {
    const sInput = document.getElementById("oaStartDateInput");
    const eInput = document.getElementById("oaEndDateInput");
    const lbl = document.getElementById("oaPeriodLabel") || document.getElementById("oaTopPeriodLabel");
    if (!lbl) return;
    const s = sInput ? sInput.value.trim() : "";
    const e = eInput ? eInput.value.trim() : "";
    if (window.C1PeriodWidget && typeof C1PeriodWidget.formatLabel === "function") {
      lbl.textContent = C1PeriodWidget.formatLabel(s, e);
    } else {
      lbl.textContent = (s && e) ? `[ ${s} - ${e} ]` : "(Весь период)";
    }
  }

  function closeWindow() {
    if (window.MdiManager) {
      MdiManager.closeWindow('orderAnalysisWindow');
    } else {
      const win = document.getElementById('orderAnalysisWindow');
      if (win) win.style.display = 'none';
    }
  }

  function toggleActionsMenu(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById("oaActionsDropdown");
    if (menu) {
      menu.style.display = menu.style.display === "block" ? "none" : "block";
    }
  }

  function formatNumber(val, decimals = 2) {
    if (val === null || val === undefined || isNaN(val)) return "0.00";
    const num = Number(val);
    const parts = num.toFixed(decimals).split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return parts.join(".");
  }

  async function generate() {
    if (isGenerating) return;

    let startDate = (document.getElementById("oaStartDateInput")?.value || "").trim();
    let endDate = (document.getElementById("oaEndDateInput")?.value || "").trim();

    if (!startDate) {
      startDate = (document.getElementById("topStartDateInput")?.value || "01.08.2026").trim();
    }
    if (!endDate) {
      endDate = (document.getElementById("topEndDateInput")?.value || "30.09.2026").trim();
    }

    // Always persist last generated period if remember period is active
    if ((startDate || endDate) && window.PeriodPicker && typeof PeriodPicker.saveExplicitPeriod === "function") {
      PeriodPicker.saveExplicitPeriod(startDate, endDate);
    }

    const settings = window.OrderAnalysisSettings ? OrderAnalysisSettings.getSettings() : {
      groupings: ["Контрагент", "Номенклатура"],
      indicators: {
        qty_order: true,
        sum_order: true,
        qty_real: true,
        sum_real: true,
        qty_diff: true,
        qty_ret: true,
        sum_ret: true,
        qty_net: true,
        sum_net: true,
        show_code: true,
        show_article: true,
        show_barcode: true
      },
      filters: [],
      posted_only: true
    };

    const payload = {
      start_date: startDate,
      end_date: endDate,
      groupings: settings.groupings,
      indicators: settings.indicators,
      filters: settings.filters,
      posted_only: settings.posted_only
    };

    isGenerating = true;
    abortController = new AbortController();

    const globalLoading = document.getElementById("loadingOverlay");
    const globalText = document.getElementById("loadingText");

    if (globalLoading) {
      globalLoading.style.setProperty("z-index", "999999", "important");
      globalLoading.style.display = "flex";
      globalLoading.classList.add("active");
      if (globalText) globalText.textContent = "1С: Формирование отчета по заказам...";
    }

    const statusText = document.getElementById("oaStatusText");
    if (statusText) statusText.textContent = "Запрос выполняется...";

    const tStart = performance.now();

    try {
      const resp = await (window.JobClient ? JobClient.fetch.bind(JobClient) : fetch)("/api/order_analysis/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: abortController.signal
      });

      if (!resp.ok) {
        throw new Error(`Server xətası: HTTP ${resp.status}`);
      }

      const res = await resp.json();
      if (!res.success) {
        throw new Error(res.error || "Hesabat formalaşdırılarkən xəta baş verdi.");
      }

      // Animasiyanın 1C standartında aydın görünməsi üçün qısa təbii fasilə
      const elapsedReq = performance.now() - tStart;
      if (elapsedReq < 350) {
        await new Promise(r => setTimeout(r, 350 - elapsedReq));
      }

      const elapsed = ((performance.now() - tStart) / 1000).toFixed(2);
      currentReportData = res;

      renderTable(res);

      if (statusText) {
        statusText.textContent = `Готов (${elapsed} сек.) | Записей: ${res.total_count || 0}`;
      }

      // Check if filter is active
      const filterBadge = document.getElementById("oaFilterBadge");
      if (filterBadge) {
        const hasActiveFilters = settings.filters && settings.filters.some(f => f.active && f.value);
        filterBadge.style.display = hasActiveFilters ? "flex" : "none";
      }

    } catch (err) {
      if (err.name === "AbortError") {
        if (statusText) statusText.textContent = "Операция прервана";
      } else {
        console.error("Order analysis error:", err);
        alert("1C Xətası: " + (err.message || err));
        if (statusText) statusText.textContent = "Ошибка при формировании";
      }
    } finally {
      isGenerating = false;
      if (globalLoading) {
        globalLoading.classList.remove("active");
        globalLoading.style.display = "none";
      }
    }
  }

  function cancelReport() {
    if (abortController) {
      abortController.abort();
    }
    const globalLoading = document.getElementById("loadingOverlay");
    if (globalLoading) {
      globalLoading.classList.remove("active");
      globalLoading.style.display = "none";
    }
    isGenerating = false;
  }

  function renderTable(data) {
    const emptyState = document.getElementById("oaEmptyState");
    const table = document.getElementById("oaReportTable");
    const tbody = document.getElementById("oaReportTableBody");
    const kpiStrip = document.getElementById("oaKpiStrip");

    if (!data || !data.rows || data.rows.length === 0) {
      if (emptyState) {
        emptyState.style.display = "flex";
        emptyState.innerHTML = `
          <div style="font-size: 40px; margin-bottom: 12px;">🔍</div>
          <div style="font-size: 14px; font-weight: bold; color: #222; margin-bottom: 6px;">Данных не обнаружено</div>
          <div style="font-size: 12px; color: #555; max-width: 480px; margin-bottom: 16px;">
            Указанный период (${data.period || ''}) не содержит заказов, реализаций или возвратов по заданным условиям.
          </div>
        `;
      }
      if (table) table.style.display = "none";
      if (kpiStrip) kpiStrip.style.display = "none";
      return;
    }

    if (emptyState) emptyState.style.display = "none";
    if (table) table.style.display = "table";
    if (kpiStrip) kpiStrip.style.display = "flex";

    const ind = data.indicators || {};
    const showCode = (ind.show_code !== false);
    const showArticle = (ind.show_article !== false);
    const showBarcode = (ind.show_barcode !== false);
    const showQtyOrder = (ind.qty_order !== false);
    const showSumOrder = (ind.sum_order !== false);
    const showQtyReal = (ind.qty_real !== false);
    const showSumReal = (ind.sum_real !== false);
    const showQtyDiff = (ind.qty_diff !== false);
    const showQtyRet = (ind.qty_ret !== false);
    const showSumRet = (ind.sum_ret !== false);
    const showQtyNet = (ind.qty_net !== false);
    const showSumNet = (ind.sum_net !== false);

    // Toggle Table Header & Grand Totals Column Visibility
    const toggleCol = (id, visible) => {
      const el = document.getElementById(id);
      if (el) el.style.display = visible ? "" : "none";
    };

    toggleCol("oaThCode", showCode);
    toggleCol("oaTotalCellCode", showCode);
    toggleCol("oaThArticle", showArticle);
    toggleCol("oaTotalCellArticle", showArticle);
    toggleCol("oaThBarcode", showBarcode);
    toggleCol("oaTotalCellBarcode", showBarcode);

    toggleCol("oaThQtyOrder", showQtyOrder);
    toggleCol("oaTotalCellQtyOrder", showQtyOrder);
    toggleCol("oaThSumOrder", showSumOrder);
    toggleCol("oaTotalCellSumOrder", showSumOrder);

    toggleCol("oaThQtyReal", showQtyReal);
    toggleCol("oaTotalCellQtyReal", showQtyReal);
    toggleCol("oaThSumReal", showSumReal);
    toggleCol("oaTotalCellSumReal", showSumReal);

    toggleCol("oaThQtyDiff", showQtyDiff);
    toggleCol("oaTotalCellQtyDiff", showQtyDiff);

    toggleCol("oaThQtyRet", showQtyRet);
    toggleCol("oaTotalCellQtyRet", showQtyRet);
    toggleCol("oaThSumRet", showSumRet);
    toggleCol("oaTotalCellSumRet", showSumRet);

    toggleCol("oaThQtyNet", showQtyNet);
    toggleCol("oaTotalCellQtyNet", showQtyNet);
    toggleCol("oaThSumNet", showSumNet);
    toggleCol("oaTotalCellSumNet", showSumNet);

    // Update KPIs
    const totals = data.totals || {};
    const storesCount = data.stores_count || totals.stores_count || 0;
    const itemsCount = data.items_count || totals.items_count || 0;
    const rowsCount = data.total_count || data.rows?.length || 0;

    const kpiStoresEl = document.getElementById("oaKpiStoresCount");
    const kpiItemsEl = document.getElementById("oaKpiItemsCount");
    const kpiRowsEl = document.getElementById("oaKpiRowsCount");
    if (kpiStoresEl) kpiStoresEl.textContent = storesCount;
    if (kpiItemsEl) kpiItemsEl.textContent = itemsCount;
    if (kpiRowsEl) kpiRowsEl.textContent = rowsCount;

    const kpiOrderEl = document.getElementById("oaKpiTotalOrder");
    const kpiRealEl = document.getElementById("oaKpiTotalReal");
    const kpiDiffEl = document.getElementById("oaKpiTotalDiff");
    const kpiRetEl = document.getElementById("oaKpiTotalRet");
    const kpiNetEl = document.getElementById("oaKpiTotalNet");

    if (kpiOrderEl) kpiOrderEl.textContent = `${formatNumber(totals.qty_order, 3)} / ${formatNumber(totals.sum_order, 2)} ₼`;
    if (kpiRealEl) kpiRealEl.textContent = `${formatNumber(totals.qty_real, 3)} / ${formatNumber(totals.sum_real, 2)} ₼`;
    if (kpiDiffEl) {
      kpiDiffEl.textContent = `${formatNumber(totals.qty_diff, 3)} / ${formatNumber(totals.sum_diff, 2)} ₼`;
      kpiDiffEl.style.color = (totals.qty_diff < 0) ? "#b71c1c" : ((totals.qty_diff > 0) ? "#002060" : "#333333");
    }
    if (kpiRetEl) kpiRetEl.textContent = `${formatNumber(totals.qty_ret, 3)} / ${formatNumber(totals.sum_ret, 2)} ₼`;
    if (kpiNetEl) kpiNetEl.textContent = `${formatNumber(totals.sum_net, 2)} ₼ (${formatNumber(totals.qty_net, 3)} əd)`;

    // Update Table Grand Totals Row
    const setTotalVal = (id, val, dec = 2) => {
      const el = document.getElementById(id);
      if (el) el.textContent = formatNumber(val, dec);
    };

    setTotalVal("oaTotalCellQtyOrder", totals.qty_order, 3);
    setTotalVal("oaTotalCellSumOrder", totals.sum_order, 2);
    setTotalVal("oaTotalCellQtyReal", totals.qty_real, 3);
    setTotalVal("oaTotalCellSumReal", totals.sum_real, 2);

    const totalDiffEl = document.getElementById("oaTotalCellQtyDiff");
    if (totalDiffEl) {
      totalDiffEl.textContent = formatNumber(totals.qty_diff, 3);
      totalDiffEl.style.color = (totals.qty_diff < 0) ? "#b71c1c" : ((totals.qty_diff > 0) ? "#002060" : "#333333");
      totalDiffEl.style.fontWeight = "bold";
    }

    setTotalVal("oaTotalCellQtyRet", totals.qty_ret, 3);
    setTotalVal("oaTotalCellSumRet", totals.sum_ret, 2);
    setTotalVal("oaTotalCellQtyNet", totals.qty_net, 3);
    setTotalVal("oaTotalCellSumNet", totals.sum_net, 2);

    // Update Dynamic Level Buttons in Toolbar (1, 2, ... N, Все) based on active groupings
    const activeGroupings = data.groupings || (window.OrderAnalysisSettings ? OrderAnalysisSettings.getSettings().groupings : ["Контрагент", "Номенклатура"]);
    updateLevelButtons(activeGroupings);

    // Build Table Body
    tbody.innerHTML = "";
    const rows = data.rows || [];
    const fragment = document.createDocumentFragment();

    rows.forEach((r, idx) => {
      const tr = document.createElement("tr");
      tr.id = `oa_row_${r.id}`;
      tr.className = `oa-table-row oa-level-${r.level}`;
      tr.dataset.id = r.id;
      tr.dataset.parentId = r.parent_id || "";
      tr.dataset.level = r.level;
      tr.dataset.hasChildren = r.has_children ? "1" : "0";
      tr.dataset.expanded = r.is_expanded ? "1" : "0";

      const isLevel1 = (r.level === 1);
      const isLevel2 = (r.level === 2);

      // Level styling
      if (isLevel1) {
        tr.style.backgroundColor = "#faf7eb";
        tr.style.fontWeight = "bold";
        tr.style.borderTop = "1px solid #d4c88a";
      } else if (r.has_children) {
        tr.style.backgroundColor = "#fdfcf5";
        tr.style.fontWeight = "bold";
      } else {
        tr.style.backgroundColor = (idx % 2 === 0) ? "#ffffff" : "#fbfbfb";
      }

      const extraIndent = r.has_children ? 0 : 19;
      const indentPx = (r.level - 1) * 18 + 6 + extraIndent;
      let expandToggleHtml = "";
      if (r.has_children) {
        expandToggleHtml = `<button type="button" class="oa-exp-btn" onclick="OrderAnalysisReport.toggleRow('${r.id}', event)" style="display: inline-flex; align-items: center; justify-content: center; width: 13px; height: 13px; line-height: 11px; text-align: center; border: 1px solid #777; background: #fff; color: #000; font-size: 10px; cursor: pointer; margin-right: 6px; padding: 0; user-select: none; -webkit-user-select: none; vertical-align: middle;">${r.is_expanded ? '-' : '+'}</button>`;
      }

      // Initial collapse/expand visibility based on level
      if (r.level <= 2) {
        tr.style.display = "";
      } else {
        tr.style.display = "none";
      }

      let diffColor = "#333333";
      if (r.qty_diff < 0) {
        diffColor = "#b71c1c"; // Mənfilər DAİMA QIRMIZI
      } else if (r.qty_diff > 0) {
        diffColor = "#002060"; // Digərləri (müsbətlər) DAİMA GÖY
      }

      let rowHtml = `<td style="padding: 3px 6px; padding-left: ${indentPx}px; border: 1px solid #e0dfd5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 440px;">${expandToggleHtml}<span class="oa-row-title" title="${escapeHtml(r.name)}" style="color: ${isLevel1 ? '#002060' : '#111'};">${escapeHtml(r.name)}</span></td>`;

      // Only items (Номенклатура) have article, barcode, and unit of measurement!
      const isItem = (r.group_type === "Номенклатура" || r.group_type === "Товар");
      const cleanCode = r.code || '';
      const cleanArticle = isItem ? (r.article || '') : '';
      const cleanBarcode = isItem ? (r.barcode || '') : '';
      const cleanUnit = isItem ? (r.unit || '') : '';

      if (showCode) {
        rowHtml += `<td style="text-align: center; padding: 3px 6px; border: 1px solid #e0dfd5; color: #555; font-size: 10px;">${escapeHtml(cleanCode)}</td>`;
      }
      if (showArticle) {
        rowHtml += `<td style="text-align: center; padding: 3px 6px; border: 1px solid #e0dfd5; color: #555; font-size: 10px;">${escapeHtml(cleanArticle)}</td>`;
      }
      if (showBarcode) {
        rowHtml += `<td style="text-align: center; padding: 3px 6px; border: 1px solid #e0dfd5; color: #555; font-size: 10px;">${escapeHtml(cleanBarcode)}</td>`;
      }

      rowHtml += `<td style="text-align: center; padding: 3px 6px; border: 1px solid #e0dfd5; color: #555; font-size: 10px;">${escapeHtml(cleanUnit)}</td>`;

      if (showQtyOrder) {
        rowHtml += `<td data-orig-color="#1b5e20" data-orig-bg="#fbfdf9" style="text-align: right; padding: 3px 6px; border: 1px solid #e0dfd5; color: #1b5e20; font-weight: ${isLevel1 ? 'bold' : 'normal'}; background: #fbfdf9;">${r.qty_order !== 0 ? formatNumber(r.qty_order, 3) : '-'}</td>`;
      }
      if (showSumOrder) {
        rowHtml += `<td data-orig-color="#1b5e20" data-orig-bg="#fbfdf9" style="text-align: right; padding: 3px 6px; border: 1px solid #e0dfd5; color: #1b5e20; font-weight: ${isLevel1 ? 'bold' : 'normal'}; background: #fbfdf9;">${r.sum_order !== 0 ? formatNumber(r.sum_order, 2) : '-'}</td>`;
      }

      if (showQtyReal) {
        rowHtml += `<td data-orig-color="#002060" data-orig-bg="#f7fafc" style="text-align: right; padding: 3px 6px; border: 1px solid #e0dfd5; color: #002060; font-weight: ${isLevel1 ? 'bold' : 'normal'}; background: #f7fafc;">${r.qty_real !== 0 ? formatNumber(r.qty_real, 3) : '-'}</td>`;
      }
      if (showSumReal) {
        rowHtml += `<td data-orig-color="#002060" data-orig-bg="#f7fafc" style="text-align: right; padding: 3px 6px; border: 1px solid #e0dfd5; color: #002060; font-weight: ${isLevel1 ? 'bold' : 'normal'}; background: #f7fafc;">${r.sum_real !== 0 ? formatNumber(r.sum_real, 2) : '-'}</td>`;
      }

      if (showQtyDiff) {
        rowHtml += `<td data-orig-color="${diffColor}" data-orig-bg="#fffcfc" style="text-align: right; padding: 3px 6px; border: 1px solid #e0dfd5; color: ${diffColor}; font-weight: bold; background: #fffcfc;">${r.qty_diff !== 0 ? formatNumber(r.qty_diff, 3) : '-'}</td>`;
      }

      if (showQtyRet) {
        rowHtml += `<td data-orig-color="#e65100" data-orig-bg="#fffdfa" style="text-align: right; padding: 3px 6px; border: 1px solid #e0dfd5; color: #e65100; font-weight: ${isLevel1 ? 'bold' : 'normal'}; background: #fffdfa;">${r.qty_ret !== 0 ? formatNumber(r.qty_ret, 3) : '-'}</td>`;
      }
      if (showSumRet) {
        rowHtml += `<td data-orig-color="#e65100" data-orig-bg="#fffdfa" style="text-align: right; padding: 3px 6px; border: 1px solid #e0dfd5; color: #e65100; font-weight: ${isLevel1 ? 'bold' : 'normal'}; background: #fffdfa;">${r.sum_ret !== 0 ? formatNumber(r.sum_ret, 2) : '-'}</td>`;
      }

      if (showQtyNet) {
        rowHtml += `<td data-orig-color="#2e7d32" data-orig-bg="#f9fcf9" style="text-align: right; padding: 3px 6px; border: 1px solid #e0dfd5; color: #2e7d32; font-weight: ${isLevel1 ? 'bold' : 'normal'}; background: #f9fcf9;">${r.qty_net !== 0 ? formatNumber(r.qty_net, 3) : '-'}</td>`;
      }
      if (showSumNet) {
        rowHtml += `<td data-orig-color="#2e7d32" data-orig-bg="#f9fcf9" style="text-align: right; padding: 3px 6px; border: 1px solid #e0dfd5; color: #2e7d32; font-weight: ${isLevel1 ? 'bold' : 'normal'}; background: #f9fcf9;">${r.sum_net !== 0 ? formatNumber(r.sum_net, 2) : '-'}</td>`;
      }

      tr.innerHTML = rowHtml;
      fragment.appendChild(tr);
    });

    tbody.appendChild(fragment);
  }

  function toggleRow(rowId, event) {
    if (event) event.stopPropagation();
    const tr = document.getElementById(`oa_row_${rowId}`);
    if (!tr) return;

    const isExpanded = (tr.dataset.expanded === "1");
    const nextState = !isExpanded;
    tr.dataset.expanded = nextState ? "1" : "0";

    const btn = tr.querySelector(".oa-exp-btn");
    if (btn) btn.textContent = nextState ? "-" : "+";

    setChildrenVisibility(rowId, nextState);
  }

  function setChildrenVisibility(parentId, visible) {
    const tbody = document.getElementById("oaReportTableBody");
    if (!tbody) return;

    const childRows = tbody.querySelectorAll(`tr[data-parent-id="${parentId}"]`);
    childRows.forEach(child => {
      child.style.display = visible ? "" : "none";
      if (!visible) {
        // If parent is collapsing, recursively hide all descendants
        const childId = child.dataset.id;
        setChildrenVisibility(childId, false);
      } else {
        // If expanding, only show direct children, and if child was expanded, show its children
        const isChildExpanded = (child.dataset.expanded === "1");
        if (isChildExpanded) {
          const childId = child.dataset.id;
          setChildrenVisibility(childId, true);
        }
      }
    });
  }

  function updateLevelButtons(groupings) {
    const container = document.getElementById("oaLevelButtonsContainer");
    if (!container) return;

    const list = Array.isArray(groupings) && groupings.length > 0 ? groupings : ["Контрагент", "Номенклатура"];
    const count = Math.max(1, list.length);

    let html = "";
    for (let i = 1; i <= count; i++) {
      const gName = list[i - 1] || `Уровень ${i}`;
      html += `<button type="button" class="tool-icon-btn" data-level="${i}" onclick="OrderAnalysisReport.setLevel(${i})" title="Уровень ${i} (${escapeHtml(gName)})" style="height: 24px; min-width: 24px; padding: 0 5px; cursor: pointer; font-size: 11px; font-weight: bold;"><span>${i}</span></button>`;
    }
    html += `<button type="button" class="tool-icon-btn" data-level="all" onclick="OrderAnalysisReport.expandAll()" title="Развернуть все уровни" style="height: 24px; min-width: 24px; padding: 0 5px; cursor: pointer; font-size: 11px; font-weight: bold;"><span>Все</span></button>`;

    container.innerHTML = html;
  }

  function setLevel(maxLevel) {
    const container = document.getElementById("oaLevelButtonsContainer");
    if (container) {
      container.querySelectorAll(".tool-icon-btn").forEach(btn => {
        btn.style.background = "";
        btn.style.borderColor = "";
      });
      const activeBtn = container.querySelector(`button[data-level="${maxLevel}"]`);
      if (activeBtn) {
        activeBtn.style.background = "#dbeafe";
        activeBtn.style.borderColor = "#2563eb";
      }
    }

    const tbody = document.getElementById("oaReportTableBody");
    if (!tbody) return;

    const rows = tbody.querySelectorAll("tr.oa-table-row");
    rows.forEach(r => {
      const lvl = parseInt(r.dataset.level || "1", 10);
      const btn = r.querySelector(".oa-exp-btn");

      if (lvl < maxLevel) {
        r.style.display = "";
        r.dataset.expanded = "1";
        if (btn) btn.textContent = "-";
      } else if (lvl === maxLevel) {
        r.style.display = "";
        r.dataset.expanded = "0";
        if (btn) btn.textContent = "+";
      } else {
        r.style.display = "none";
        r.dataset.expanded = "0";
        if (btn) btn.textContent = "+";
      }
    });
  }

  function expandAll() {
    const container = document.getElementById("oaLevelButtonsContainer");
    if (container) {
      container.querySelectorAll(".tool-icon-btn").forEach(btn => {
        btn.style.background = "";
        btn.style.borderColor = "";
      });
      const allBtn = container.querySelector(`button[data-level="all"]`);
      if (allBtn) {
        allBtn.style.background = "#dbeafe";
        allBtn.style.borderColor = "#2563eb";
      }
    }

    const tbody = document.getElementById("oaReportTableBody");
    if (!tbody) return;

    const rows = tbody.querySelectorAll("tr.oa-table-row");
    rows.forEach(r => {
      r.style.display = "";
      r.dataset.expanded = "1";
      const btn = r.querySelector(".oa-exp-btn");
      if (btn) btn.textContent = "-";
    });
  }

  async function exportExcel() {
    if (!currentReportData) {
      alert("Əvvəlcə hesabatı formalaşdırın.");
      return;
    }

    try {
      const resp = await fetch("/api/order_analysis/export_excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_data: currentReportData })
      });
      const res = await resp.json();
      if (res.success) {
        window.location.href = "/api/order_analysis/download_excel";
      } else {
        alert("Excel export xətası: " + (res.error || "Bilinməyən xəta"));
      }
    } catch (e) {
      console.error("Excel export error:", e);
      alert("Excel ixracında xəta baş verdi: " + e.message);
    }
  }

  function printReport() {
    window.print();
  }

  function updatePeriodLabel() {
    const sInput = document.getElementById("oaStartDateInput")?.value || "";
    const eInput = document.getElementById("oaEndDateInput")?.value || "";
    const lbl = document.getElementById("oaPeriodLabel");
    if (lbl) {
      if (window.C1PeriodWidget) {
        lbl.textContent = C1PeriodWidget.formatLabel(sInput, eInput);
      } else {
        lbl.textContent = (sInput && eInput) ? `[ ${sInput} - ${eInput} ]` : "(Весь период)";
      }
      lbl.style.color = (lbl.textContent === "(Весь период)") ? "#555555" : "#002060";
    }
  }

  function openPeriodPicker() {
    const sInput = document.getElementById("oaStartDateInput");
    const eInput = document.getElementById("oaEndDateInput");
    let currStart = sInput?.value || "";
    let currEnd = eInput?.value || "";

    if (!currStart && !currEnd && window.PeriodPicker && typeof PeriodPicker.getRememberedPeriod === "function") {
      const rem = PeriodPicker.getRememberedPeriod();
      if (rem) {
        currStart = rem.startDate || "";
        currEnd = rem.endDate || "";
      }
    }
    if (!currStart) currStart = "01.08.2026";
    if (!currEnd) currEnd = "30.09.2026";

    const toDateOnly = (val) => {
      if (!val) return "";
      const s = String(val).trim();
      const m = s.match(/^(\d{1,2}\.\d{1,2}\.\d{4})/);
      return m ? m[1] : s.split(" ")[0];
    };

    const handleSelect = (start, end) => {
      if (sInput) sInput.value = start;
      if (eInput) eInput.value = end;
      updatePeriodLabel();
      const topStart = document.getElementById("topStartDateInput");
      const topEnd = document.getElementById("topEndDateInput");
      const sOnly = toDateOnly(start);
      const eOnly = toDateOnly(end);
      if (topStart) topStart.value = sOnly || start;
      if (topEnd) topEnd.value = eOnly || end;
      const dlgStart = document.getElementById("oaDlgStartDate");
      const dlgEnd = document.getElementById("oaDlgEndDate");
      if (dlgStart) dlgStart.value = start;
      if (dlgEnd) dlgEnd.value = end;
      if (window.OrderAnalysisSettings && typeof OrderAnalysisSettings.updatePeriodLabel === "function") {
        OrderAnalysisSettings.updatePeriodLabel();
      }
      if (window.C1PeriodWidget && typeof C1PeriodWidget.setStoredPeriod === "function") {
        C1PeriodWidget.setStoredPeriod("order_analysis", start, end);
      }
    };

    if (window.C1PeriodWidget) {
      C1PeriodWidget.open({
        startDate: currStart,
        endDate: currEnd,
        contextKey: "order_analysis",
        onSelect: handleSelect
      });
    } else if (window.PeriodPicker && typeof PeriodPicker.open === "function") {
      PeriodPicker.open({
        startDate: currStart,
        endDate: currEnd,
        contextKey: "order_analysis",
        onSelect: handleSelect
      });
    }
  }

  function openPeriodDialog(btn) {
    openPeriodPicker();
  }

  function syncOaDates() {
    const sInput = document.getElementById("oaStartDateInput")?.value;
    const eInput = document.getElementById("oaEndDateInput")?.value;
    const dlgStart = document.getElementById("oaDlgStartDate");
    const dlgEnd = document.getElementById("oaDlgEndDate");
    const topStart = document.getElementById("topStartDateInput");
    const topEnd = document.getElementById("topEndDateInput");

    if (dlgStart && sInput) dlgStart.value = sInput;
    if (dlgEnd && eInput) dlgEnd.value = eInput;
    if (topStart && sInput) topStart.value = sInput;
    if (topEnd && eInput) topEnd.value = eInput;
    updatePeriodLabel();
    if (window.OrderAnalysisSettings && typeof OrderAnalysisSettings.updatePeriodLabel === "function") {
      OrderAnalysisSettings.updatePeriodLabel();
    }
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Document ready handler
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.syncOaDates = syncOaDates;

  return {
    init,
    openWindow,
    closeWindow,
    generate,
    cancelReport,
    exportExcel,
    printReport,
    setLevel,
    expandAll,
    updateLevelButtons,
    toggleRow,
    toggleActionsMenu,
    openPeriodDialog,
    openPeriodPicker,
    updatePeriodLabel,
    syncOaDates
  };
})();
