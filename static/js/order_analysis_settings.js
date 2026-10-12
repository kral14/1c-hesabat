/**
 * static/js/order_analysis_settings.js
 * ====================================
 * Müştəri Sifarişləri Analizi (Заказ покупателя анализ) hesabatının
 * tənzimləmə (Настройка) pəncərəsinin müstəqil idarəedicisi.
 */

window.OrderAnalysisSettings = (function() {
  const STORAGE_KEY = "1c_order_analysis_settings_v2";

  const DEFAULT_SETTINGS = {
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
    posted_only: true,
    show_totals: true,
    negative_red: true,
    filters: []
  };

  let activeFilterRowEl = null;
  let activeGroupingRowEl = null;

  function init() {
    loadSavedSettings();
  }

  function open() {
    // Sync dates from report window or top toolbar
    const oaStart = document.getElementById("oaStartDateInput") || document.getElementById("topStartDateInput");
    const oaEnd = document.getElementById("oaEndDateInput") || document.getElementById("topEndDateInput");
    const dlgStart = document.getElementById("oaDlgStartDate");
    const dlgEnd = document.getElementById("oaDlgEndDate");

    if (oaStart && dlgStart && oaStart.value) dlgStart.value = oaStart.value;
    if (oaEnd && dlgEnd && oaEnd.value) dlgEnd.value = oaEnd.value;

    const win = document.getElementById('orderAnalysisSettingsModal');
    if (win) {
      // Center nicely in workspace
      const ws = document.getElementById("mdiWorkspace") || document.body;
      const wsW = ws.clientWidth || window.innerWidth;
      const wsH = ws.clientHeight || window.innerHeight;
      const targetW = Math.min(900, Math.max(500, wsW - 40));
      const targetH = Math.min(580, Math.max(380, wsH - 40));
      win.style.width = `${targetW}px`;
      win.style.height = `${targetH}px`;
      const left = Math.max(10, Math.floor((wsW - targetW) / 2));
      const top = Math.max(10, Math.floor((wsH - targetH) / 2));
      win.style.left = `${left}px`;
      win.style.top = `${top}px`;
      win.style.display = 'flex';
      win.classList.remove('minimized');
      win.classList.add('active');
    }

    if (window.MdiManager && typeof MdiManager.activateWindow === "function") {
      MdiManager.activateWindow('orderAnalysisSettingsModal', {
        title: "Настройка: Заказы покупателей (Анализ)",
        icon: "⚙️"
      });
    }
  }

  function close() {
    if (window.MdiManager && typeof MdiManager.closeWindow === "function") {
      MdiManager.closeWindow('orderAnalysisSettingsModal');
    } else {
      const win = document.getElementById('orderAnalysisSettingsModal');
      if (win) {
        win.style.display = 'none';
        win.classList.add('minimized');
        win.classList.remove('active');
      }
    }
  }

  function getSettings() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  }

  function saveSettings(settings) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {}
  }

  function collectFromUI() {
    // Indicators
    const indicators = {
      qty_order: document.getElementById("oaIndQtyOrder")?.checked ?? true,
      sum_order: document.getElementById("oaIndSumOrder")?.checked ?? true,
      qty_real: document.getElementById("oaIndQtyReal")?.checked ?? true,
      sum_real: document.getElementById("oaIndSumReal")?.checked ?? true,
      qty_diff: document.getElementById("oaIndQtyDiff")?.checked ?? true,
      qty_ret: document.getElementById("oaIndQtyRet")?.checked ?? true,
      sum_ret: document.getElementById("oaIndSumRet")?.checked ?? true,
      qty_net: document.getElementById("oaIndQtyNet")?.checked ?? true,
      sum_net: document.getElementById("oaIndSumNet")?.checked ?? true,
      show_code: document.getElementById("oaIndShowCode")?.checked ?? true,
      show_article: document.getElementById("oaIndShowArticle")?.checked ?? true,
      show_barcode: document.getElementById("oaIndShowBarcode")?.checked ?? true
    };

    // Groupings
    const groupings = [];
    const grpRows = document.querySelectorAll("#oaGroupingsBody tr");
    grpRows.forEach(tr => {
      const sel = tr.querySelector(".oa-grouping-select");
      if (sel && sel.value) groupings.push(sel.value);
    });

    // Parameters
    const postedOnly = document.getElementById("oaChkPostedOnly")?.checked ?? true;
    const showTotals = document.getElementById("oaChkShowTotals")?.checked ?? true;
    const negativeRed = document.getElementById("oaChkNegativeRed")?.checked ?? true;

    // Filters
    const filters = [];
    const filterRows = document.querySelectorAll("#oaFiltersBody tr");
    filterRows.forEach(tr => {
      const chk = tr.querySelector(".oa-filter-chk");
      const fieldSel = tr.querySelector(".oa-filter-field");
      const compSel = tr.querySelector(".oa-filter-comp");
      const valInput = tr.querySelector(".oa-filter-val");

      if (chk && fieldSel && compSel && valInput) {
        filters.push({
          active: chk.checked,
          field: fieldSel.value,
          comp: compSel.value,
          value: valInput.value.trim()
        });
      }
    });

    return {
      groupings: groupings.length > 0 ? groupings : ["Контрагент", "Номенклатура"],
      indicators,
      posted_only: postedOnly,
      show_totals: showTotals,
      negative_red: negativeRed,
      filters
    };
  }

  function applySettingsToUI(st) {
    if (!st) return;

    // Indicators
    const ind = st.indicators || {};
    const setChk = (id, val, def = true) => {
      const el = document.getElementById(id);
      if (el) el.checked = (val !== undefined) ? Boolean(val) : def;
    };
    setChk("oaIndQtyOrder", ind.qty_order);
    setChk("oaIndSumOrder", ind.sum_order);
    setChk("oaIndQtyReal", ind.qty_real);
    setChk("oaIndSumReal", ind.sum_real);
    setChk("oaIndQtyDiff", ind.qty_diff);
    setChk("oaIndQtyRet", ind.qty_ret);
    setChk("oaIndSumRet", ind.sum_ret);
    setChk("oaIndQtyNet", ind.qty_net);
    setChk("oaIndSumNet", ind.sum_net);
    setChk("oaIndShowCode", ind.show_code);
    setChk("oaIndShowArticle", ind.show_article);
    setChk("oaIndShowBarcode", ind.show_barcode);

    // Params
    if (document.getElementById("oaChkPostedOnly")) document.getElementById("oaChkPostedOnly").checked = Boolean(st.posted_only);
    if (document.getElementById("oaChkShowTotals")) document.getElementById("oaChkShowTotals").checked = Boolean(st.show_totals);
    if (document.getElementById("oaChkNegativeRed")) document.getElementById("oaChkNegativeRed").checked = Boolean(st.negative_red);

    // Groupings
    const tbody = document.getElementById("oaGroupingsBody");
    if (tbody && st.groupings && st.groupings.length > 0) {
      tbody.innerHTML = "";
      st.groupings.forEach((g, idx) => {
        const tr = document.createElement("tr");
        if (idx === 0) tr.className = "selected";
        tr.onclick = function() { selectGroupingRow(this); };
        tr.innerHTML = `
          <td style="padding: 3px 6px; border-bottom: 1px solid #eee;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span class="oa-grouping-name" style="font-weight: bold; color: #002060;">${escapeHtml(g)}</span>
              <select class="oa-grouping-select" onchange="OrderAnalysisSettings.onGroupingFieldChange(this)" style="font-size: 11px; height: 20px;">
                <option value="День" ${g === 'День' ? 'selected' : ''}>День (Дата)</option>
                <option value="Неделя" ${g === 'Неделя' ? 'selected' : ''}>Неделя</option>
                <option value="Месяц" ${g === 'Месяц' ? 'selected' : ''}>Месяц</option>
                <option value="Год" ${g === 'Год' ? 'selected' : ''}>Год</option>
                <option value="Заказ" ${g === 'Заказ' || g === 'Документ' ? 'selected' : ''}>Заказ (Документ)</option>
                <option value="Контрагент" ${g === 'Контрагент' ? 'selected' : ''}>Контрагент (Магазин)</option>
                <option value="Номенклатура" ${g === 'Номенклатура' ? 'selected' : ''}>Номенклатура (Товар)</option>
                <option value="Портфель" ${g === 'Портфель' ? 'selected' : ''}>Портфель</option>
                <option value="Склад" ${g === 'Склад' ? 'selected' : ''}>Склад</option>
                <option value="Агент" ${g === 'Агент' ? 'selected' : ''}>Агент</option>
              </select>
            </div>
          </td>
          <td style="padding: 3px 6px; border-bottom: 1px solid #eee;">
            <span style="color: #666;">${idx === 0 ? 'Элементы' : 'Без групп'}</span>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }

    // Filters
    if (st.filters && st.filters.length > 0) {
      const filterRows = document.querySelectorAll("#oaFiltersBody tr");
      st.filters.forEach((f, idx) => {
        if (idx < filterRows.length) {
          const tr = filterRows[idx];
          const chk = tr.querySelector(".oa-filter-chk");
          const fieldSel = tr.querySelector(".oa-filter-field");
          const compSel = tr.querySelector(".oa-filter-comp");
          const valInput = tr.querySelector(".oa-filter-val");

          if (chk) chk.checked = Boolean(f.active);
          if (fieldSel) fieldSel.value = f.field || "Контрагент";
          if (compSel) compSel.value = f.comp || "in_list";
          if (valInput) valInput.value = f.value || "";
        }
      });
    }
  }

  function loadSavedSettings() {
    const st = getSettings();
    applySettingsToUI(st);
  }

  function applyAndGenerate() {
    const st = collectFromUI();
    saveSettings(st);

    // Sync dates to report window
    const dlgStart = document.getElementById("oaDlgStartDate")?.value;
    const dlgEnd = document.getElementById("oaDlgEndDate")?.value;
    const oaStart = document.getElementById("oaStartDateInput");
    const oaEnd = document.getElementById("oaEndDateInput");

    if (dlgStart && oaStart) oaStart.value = dlgStart;
    if (dlgEnd && oaEnd) oaEnd.value = dlgEnd;

    close();
    if (window.OrderAnalysisReport) {
      OrderAnalysisReport.generate();
    }
  }

  function applyAndClose() {
    const st = collectFromUI();
    saveSettings(st);
    close();
  }

  function resetToDefaults() {
    if (confirm("Восстановить стандартные настройки отчета?")) {
      saveSettings(DEFAULT_SETTINGS);
      applySettingsToUI(DEFAULT_SETTINGS);
    }
  }

  function checkAllIndicators(check) {
    [
      "oaIndQtyOrder", "oaIndSumOrder", "oaIndQtyReal", "oaIndSumReal",
      "oaIndQtyDiff", "oaIndQtyRet", "oaIndSumRet", "oaIndQtyNet", "oaIndSumNet",
      "oaIndShowCode", "oaIndShowArticle", "oaIndShowBarcode"
    ].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.checked = check;
    });
  }

  function selectGroupingRow(row) {
    document.querySelectorAll("#oaGroupingsBody tr").forEach(r => r.classList.remove("selected"));
    row.classList.add("selected");
    activeGroupingRowEl = row;
  }

  function onGroupingFieldChange(selectEl) {
    const tr = selectEl.closest("tr");
    if (tr) {
      const nameEl = tr.querySelector(".oa-grouping-name");
      if (nameEl) nameEl.textContent = selectEl.value;
    }
  }

  function addGroupingRow() {
    const tbody = document.getElementById("oaGroupingsBody");
    if (!tbody) return;

    const tr = document.createElement("tr");
    tr.onclick = function() { selectGroupingRow(this); };
    tr.innerHTML = `
      <td style="padding: 3px 6px; border-bottom: 1px solid #eee;">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <span class="oa-grouping-name" style="font-weight: bold; color: #002060;">Склад</span>
          <select class="oa-grouping-select" onchange="OrderAnalysisSettings.onGroupingFieldChange(this)" style="font-size: 11px; height: 20px;">
            <option value="День">День (Дата)</option>
            <option value="Неделя">Неделя</option>
            <option value="Месяц">Месяц</option>
            <option value="Год">Год</option>
            <option value="Заказ">Заказ (Документ)</option>
            <option value="Контрагент">Контрагент (Магазин)</option>
            <option value="Номенклатура">Номенклатура (Товар)</option>
            <option value="Портфель">Портфель</option>
            <option value="Склад" selected>Склад</option>
            <option value="Агент">Агент</option>
          </select>
        </div>
      </td>
      <td style="padding: 3px 6px; border-bottom: 1px solid #eee;">
        <span style="color: #666;">Элементы</span>
      </td>
    `;
    tbody.appendChild(tr);
    selectGroupingRow(tr);
  }

  function removeSelectedGrouping() {
    const selected = document.querySelector("#oaGroupingsBody tr.selected");
    if (selected) {
      const tbody = document.getElementById("oaGroupingsBody");
      if (tbody.children.length <= 1) {
        alert("Должна остаться хотя бы одна группировка!");
        return;
      }
      selected.remove();
      const first = tbody.querySelector("tr");
      if (first) selectGroupingRow(first);
    }
  }

  function moveGroupingUp() {
    const selected = document.querySelector("#oaGroupingsBody tr.selected");
    if (selected && selected.previousElementSibling) {
      selected.parentNode.insertBefore(selected, selected.previousElementSibling);
    }
  }

  function moveGroupingDown() {
    const selected = document.querySelector("#oaGroupingsBody tr.selected");
    if (selected && selected.nextElementSibling) {
      selected.parentNode.insertBefore(selected.nextElementSibling, selected);
    }
  }

  function selectFilterRow(row) {
    document.querySelectorAll("#oaFiltersBody tr").forEach(r => r.style.backgroundColor = "");
    row.style.backgroundColor = "#e8f0fe";
    activeFilterRowEl = row;
  }

  function addFilterRow() {
    const tbody = document.getElementById("oaFiltersBody");
    if (!tbody) return;

    const tr = document.createElement("tr");
    tr.onclick = function() { selectFilterRow(this); };
    tr.innerHTML = `
      <td style="text-align: center; border-bottom: 1px solid #eee;"><input type="checkbox" class="oa-filter-chk" checked></td>
      <td style="padding: 2px 6px; border-bottom: 1px solid #eee;">
        <select class="oa-filter-field" style="width: 100%; height: 20px; font-size: 11px;">
          <option value="Контрагент">Контрагент</option>
          <option value="Номенклатура">Номенклатура</option>
          <option value="Склад">Склад</option>
          <option value="Агент">Агент</option>
          <option value="Портфель">Портфель</option>
        </select>
      </td>
      <td style="padding: 2px 6px; border-bottom: 1px solid #eee;">
        <select class="oa-filter-comp" style="width: 100%; height: 20px; font-size: 11px;">
          <option value="in_list" selected>В группе из списка</option>
          <option value="equal">Равно</option>
          <option value="not_equal">Не равно</option>
          <option value="contains">Содержит</option>
        </select>
      </td>
      <td style="padding: 2px 6px; border-bottom: 1px solid #eee;">
        <div style="display: flex; align-items: center; gap: 2px;">
          <input type="text" class="oa-filter-val" placeholder="Значение..." style="flex: 1; height: 20px; font-size: 11px; padding: 1px 4px; border: 1px solid #ccc;">
          <button type="button" onclick="OrderAnalysisSettings.pickCatalog(this, 'Контрагенты')" title="Выбрать..." style="height: 20px; width: 22px; cursor: pointer;">...</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
    selectFilterRow(tr);
  }

  function removeFilterRow() {
    if (activeFilterRowEl) {
      activeFilterRowEl.remove();
      activeFilterRowEl = null;
    }
  }

  function clearAllFilters() {
    const filterRows = document.querySelectorAll("#oaFiltersBody tr");
    filterRows.forEach(tr => {
      const chk = tr.querySelector(".oa-filter-chk");
      const valInput = tr.querySelector(".oa-filter-val");
      if (chk) chk.checked = false;
      if (valInput) valInput.value = "";
    });
  }

  function pickCatalog(btn, defaultCatalogType) {
    const row = btn.closest("tr");
    if (!row) return;

    const fieldSel = row.querySelector(".oa-filter-field");
    const valInput = row.querySelector(".oa-filter-val");
    const chk = row.querySelector(".oa-filter-chk");

    let catType = defaultCatalogType || "Контрагенты";
    if (fieldSel) {
      const f = fieldSel.value;
      if (f === "Контрагент") catType = "Контрагенты";
      else if (f === "Номенклатура") catType = "Номенклатура";
      else if (f === "Склад") catType = "Склады";
      else if (f === "Агент") catType = "Агенты";
    }

    if (window.CatalogSelectorModal) {
      CatalogSelectorModal.open(catType, (selected) => {
        if (!selected) return;
        const name = selected.name || selected.Наименование || selected.code || "";
        if (valInput) valInput.value = name;
        if (chk) chk.checked = true;
      });
    } else if (window.openCatalogDirect) {
      window.openCatalogDirect(catType);
    }
  }

  function openPeriodPicker(btn) {
    const sInput = document.getElementById("oaDlgStartDate");
    const eInput = document.getElementById("oaDlgEndDate");
    const currStart = sInput?.value || "01.08.2026";
    const currEnd = eInput?.value || "30.09.2026";

    if (window.PeriodPicker && typeof PeriodPicker.open === "function") {
      PeriodPicker.open({
        startDate: currStart,
        endDate: currEnd,
        onSelect: (start, end) => {
          if (sInput) sInput.value = start;
          if (eInput) eInput.value = end;
          const oaStart = document.getElementById("oaStartDateInput");
          const oaEnd = document.getElementById("oaEndDateInput");
          if (oaStart) oaStart.value = start;
          if (oaEnd) oaEnd.value = end;
        }
      });
    } else if (typeof openPeriodSelectDialog === "function") {
      openPeriodSelectDialog(btn);
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

  // Auto-init
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  return {
    init,
    open,
    close,
    getSettings,
    applyAndGenerate,
    applyAndClose,
    resetToDefaults,
    checkAllIndicators,
    selectGroupingRow,
    onGroupingFieldChange,
    addGroupingRow,
    removeSelectedGrouping,
    moveGroupingUp,
    moveGroupingDown,
    selectFilterRow,
    addFilterRow,
    removeFilterRow,
    clearAllFilters,
    pickCatalog,
    openPeriodPicker
  };
})();
