/* ========================================================
   1C:ENTERPRISE UNIVERSAL REPORT - SETTINGS MODAL CONTROLLER
   settings_modal.js (Screenshot 3 + Maximize/Minimize + Catalog Trigger)
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

const SettingsModal = {
  selectedRowGroupingIndex: 0,
  selectedColGroupingIndex: -1,
  selectedFilterRowIndex: 4,
  isMaximized: false,
  isMinimized: false,

  async init() {
    if (typeof syncDateInputsFromTop === "function") syncDateInputsFromTop();
    this.bindEvents();
    loadPriceTypesList().catch(e => console.warn("price types load:", e));
  },

  bindEvents() {
    document.addEventListener("click", (e) => {
      const container = document.getElementById("priceTypeDropdownContainer");
      const menu = document.getElementById("priceTypeDropdownMenu");
      if (container && menu && !container.contains(e.target)) {
        menu.style.display = "none";
      }
    });
  },

  getConfig() {
    const startDate = document.getElementById("topStartDateInput")?.value.trim() || "01.09.2026";
    const endDate = document.getElementById("topEndDateInput")?.value.trim() || "30.09.2026";

    // Parameters
    const negativeRed = document.getElementById("chkNegativeRed") ? document.getElementById("chkNegativeRed").checked : true;
    const showGrandTotals = document.getElementById("chkShowGrandTotals") ? document.getElementById("chkShowGrandTotals").checked : true;
    const showDetails = document.getElementById("chkShowDetails") ? document.getElementById("chkShowDetails").checked : false;
    const useProperties = document.getElementById("chkUseProperties") ? document.getElementById("chkUseProperties").checked : true;

    // Price Types (Типы цен - Multi-select)
    const priceTypes = getSelectedPriceTypes();
    const priceType = priceTypes[0] || "20";

    // Indicators
    const indBcUnit = document.getElementById("indBarcodeUnit")?.checked ?? true;
    const indBcBox = document.getElementById("indBarcodeBox")?.checked ?? true;
    const indBcBlock = document.getElementById("indBarcodeBlock")?.checked ?? false;
    const indBarcode = indBcUnit || indBcBox || indBcBlock;

    const indicators = {
      barcodeUnit: indBcUnit,
      barcodeBox: indBcBox,
      barcodeBlock: indBcBlock,
      barcode: indBarcode,
      showPrice: document.getElementById("indShowPrice")?.checked ?? true,
      showSum: document.getElementById("indShowSum")?.checked ?? true,
      qtyStart: document.getElementById("indQtyStart")?.checked ?? true,
      qtyIn: document.getElementById("indQtyIn")?.checked ?? true,
      qtyOut: document.getElementById("indQtyOut")?.checked ?? true,
      qtyEnd: document.getElementById("indQtyEnd")?.checked ?? true,
      qtyTurnover: document.getElementById("indQtyTurnover")?.checked ?? false,
      sumStart: document.getElementById("indSumStart")?.checked ?? false,
      sumIn: document.getElementById("indSumIn")?.checked ?? false,
      sumOut: document.getElementById("indSumOut")?.checked ?? false,
      sumEnd: document.getElementById("indSumEnd")?.checked ?? false
    };

    // Row Groupings
    const rowGroupings = [];
    const rows = document.querySelectorAll("#rowGroupingsBody tr");
    rows.forEach((tr) => {
      const field = tr.querySelector(".grouping-field-name")?.textContent.trim() || tr.cells[0]?.textContent.trim();
      const type = tr.querySelector(".grouping-type-sel")?.value || tr.cells[1]?.textContent.trim() || "Элементы";
      if (field) rowGroupings.push({ field, type });
    });

    // Column Groupings
    const colGroupings = [];
    const colRows = document.querySelectorAll("#colGroupingsBody tr");
    colRows.forEach((tr) => {
      const field = tr.querySelector(".grouping-field-name")?.textContent.trim() || tr.cells[0]?.textContent.trim();
      const type = tr.querySelector(".grouping-type-sel")?.value || tr.cells[1]?.textContent.trim() || "Элементы";
      if (field) colGroupings.push({ field, type });
    });

    // Filters (Отборы)
    const filters = [];
    const filterRows = document.querySelectorAll("#filtersTableBody tr");
    filterRows.forEach((tr) => {
      const isChecked = tr.querySelector(".filter-chk")?.checked ?? false;
      const field = tr.querySelector(".filter-field-sel")?.value || "";
      const comparison = tr.querySelector(".filter-comp-sel")?.value || "equal";
      const value = tr.querySelector(".filter-val-input")?.value?.trim() || "";
      filters.push({
        active: isChecked,
        field,
        comparison,
        value
      });
    });

    return {
      startDate,
      endDate,
      priceType,
      priceTypes,
      parameters: {
        negativeRed,
        showGrandTotals,
        showDetails,
        useProperties
      },
      indicators,
      rowGroupings,
      colGroupings,
      filters
    };
  }
};

// Maximize / Minimize / Restore for Settings Window (MDI Integration)
function toggleSettingsMaximize() {
  if (window.MdiManager) {
    MdiManager.toggleMaximize("settingsWindowModal");
  }
}

function toggleSettingsMinimize() {
  if (window.MdiManager) {
    MdiManager.minimizeWindow("settingsWindowModal");
  }
}

// Open / Close Settings Window (Full MDI Child Window - No blocking overlay!)
function openSettingsModal(e) {
  if (e && typeof e.stopPropagation === "function") {
    e.stopPropagation();
  }
  console.log("[SETTINGS OPEN] Opening Settings dialog window");
  const win = document.getElementById("settingsWindowModal");
  if (!win) {
    console.error("[SETTINGS OPEN] #settingsWindowModal element not found in DOM!");
    return;
  }

  try {
    // Center settings window nicely inside the workspace
    const ws = document.getElementById("mdiWorkspace");
    if (ws) {
      const wsW = ws.clientWidth || window.innerWidth;
      const wsH = ws.clientHeight || window.innerHeight;
      const targetW = Math.min(920, Math.max(500, wsW - 40));
      const targetH = Math.min(600, Math.max(380, wsH - 40));
      win.style.width = `${targetW}px`;
      win.style.height = `${targetH}px`;
      const left = Math.max(10, Math.floor((wsW - targetW) / 2));
      const top = Math.max(10, Math.floor((wsH - targetH) / 2));
      win.style.left = `${left}px`;
      win.style.top = `${top}px`;
    }

    if (window.MdiManager) {
      MdiManager.activateWindow("settingsWindowModal", {
        title: "Настройка: Товары на складах",
        icon: "⚙️"
      });
    } else {
      win.style.display = "flex";
      win.classList.remove("minimized");
      win.classList.add("active");
    }

    try { syncDateInputsFromTop(); } catch(e) { console.warn("syncDateInputsFromTop error:", e); }
    try { loadPriceTypesList(); } catch(e) { console.warn("loadPriceTypesList error:", e); }
  } catch (err) {
    console.error("[SETTINGS OPEN ERROR]", err);
  }
}

function closeSettingsModal(e) {
  if (e && typeof e.stopPropagation === "function") {
    e.stopPropagation();
  }
  console.log("[SETTINGS CLOSE] Closing Settings dialog window");
  if (window.MdiManager) {
    MdiManager.closeWindow("settingsWindowModal");
  } else {
    const win = document.getElementById("settingsWindowModal");
    if (win) {
      win.style.display = "none";
      win.classList.add("minimized");
      win.classList.remove("active");
    }
    const tab = document.getElementById("tab-settingsWindowModal");
    if (tab) {
      tab.remove();
    }
  }
}

/* ========================================================
   PRICE TYPES (ТИПЫ ЦЕН) MULTI-SELECT FUNCTIONS
   ======================================================== */
let _priceTypesLoaded = false;

async function loadPriceTypesList() {
  if (_priceTypesLoaded) return;
  try {
    const res = await fetch("/api/price_types");
    const data = await res.json();
    if (data.success && Array.isArray(data.price_types) && data.price_types.length > 0) {
      _priceTypesLoaded = true;
      const container = document.getElementById("priceTypesListContainer");
      if (!container) return;

      const rawSelected = getSelectedPriceTypes();
      const currentSelected = rawSelected
        .map(v => (typeof v === "object" && v !== null) ? (v.name || v.code || "") : String(v))
        .filter(v => v && v !== "[object Object]");
      if (currentSelected.length === 0) currentSelected.push("20");

      container.innerHTML = "";
      data.price_types.forEach(pt => {
        const ptName = (typeof pt === "object" && pt !== null) ? (pt.name || pt.code || "") : String(pt);
        const ptDesc = (typeof pt === "object" && pt !== null) ? (pt.desc || pt.name || pt.code || "") : String(pt);
        if (!ptName) return;

        const isChecked = currentSelected.includes(ptName);
        const label = document.createElement("label");
        label.className = "price-type-option";
        label.style.cssText = "display: flex; align-items: center; gap: 6px; padding: 2px 4px; cursor: pointer; font-size: 11px; border-radius: 2px;";
        label.innerHTML = `
          <input type="checkbox" value="${escapeHtml(ptName)}" ${isChecked ? "checked" : ""} onchange="onPriceTypeSelectionChange()">
          <span>${escapeHtml(ptDesc)}</span>
        `;
        container.appendChild(label);
      });
      updatePriceTypeSummary();
    }
  } catch (err) {
    console.warn("Could not load price types from server:", err);
  }
}

function togglePriceTypeDropdown(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById("priceTypeDropdownMenu");
  if (!menu) return;
  const isShown = menu.style.display === "block";
  menu.style.display = isShown ? "none" : "block";
  if (!isShown) {
    const search = document.getElementById("priceTypeSearch");
    if (search) {
      search.value = "";
      filterPriceTypesList("");
      setTimeout(() => search.focus(), 50);
    }
  }
}

function filterPriceTypesList(query) {
  const q = (query || "").toLowerCase().trim();
  const container = document.getElementById("priceTypesListContainer");
  if (!container) return;
  const labels = container.querySelectorAll(".price-type-option");
  labels.forEach(lbl => {
    const txt = lbl.textContent.toLowerCase();
    lbl.style.display = (!q || txt.includes(q)) ? "flex" : "none";
  });
}

function selectAllPriceTypes(checked) {
  const container = document.getElementById("priceTypesListContainer");
  if (!container) return;
  const checkboxes = container.querySelectorAll("input[type='checkbox']");
  checkboxes.forEach(cb => {
    const parent = cb.closest(".price-type-option");
    if (!parent || parent.style.display !== "none") {
      cb.checked = checked;
    }
  });
  onPriceTypeSelectionChange();
}

function getSelectedPriceTypes() {
  const container = document.getElementById("priceTypesListContainer");
  if (!container) {
    const sel = document.getElementById("dlgPriceTypeSelect");
    return sel && sel.value ? [sel.value] : ["20"];
  }
  const checkedBoxes = container.querySelectorAll("input[type='checkbox']:checked");
  const selected = Array.from(checkedBoxes)
    .map(cb => cb.value)
    .filter(v => v && v !== "[object Object]");
  return selected.length > 0 ? selected : ["20"];
}

function setSelectedPriceTypes(typesArray) {
  if (!Array.isArray(typesArray)) {
    typesArray = typesArray ? [typesArray] : ["20"];
  }
  const cleanNames = typesArray
    .map(t => (typeof t === "object" && t !== null) ? (t.name || t.code || "") : String(t))
    .filter(v => v && v !== "[object Object]");

  const container = document.getElementById("priceTypesListContainer");
  if (container) {
    const checkboxes = container.querySelectorAll("input[type='checkbox']");
    const existingValues = new Set();
    checkboxes.forEach(cb => {
      existingValues.add(cb.value);
      cb.checked = cleanNames.includes(cb.value);
    });
    // Add any types that might not exist in the DOM list yet
    cleanNames.forEach(tName => {
      if (tName && !existingValues.has(tName)) {
        const label = document.createElement("label");
        label.className = "price-type-option";
        label.style.cssText = "display: flex; align-items: center; gap: 6px; padding: 2px 4px; cursor: pointer; font-size: 11px; border-radius: 2px;";
        label.innerHTML = `
          <input type="checkbox" value="${escapeHtml(tName)}" checked onchange="onPriceTypeSelectionChange()">
          <span>${escapeHtml(tName)}</span>
        `;
        container.appendChild(label);
      }
    });
  }
  updatePriceTypeSummary(cleanNames);
}

function onPriceTypeSelectionChange() {
  const selected = getSelectedPriceTypes();
  updatePriceTypeSummary(selected);
}

function updatePriceTypeSummary(selected) {
  if (!selected) selected = getSelectedPriceTypes();
  const summaryEl = document.getElementById("priceTypeSummary");
  const hiddenInput = document.getElementById("dlgPriceTypeSelect");

  const cleanSelected = (selected || [])
    .map(s => (typeof s === "object" && s !== null) ? (s.name || s.code || "") : String(s))
    .filter(s => s && s !== "[object Object]");

  if (hiddenInput && cleanSelected.length > 0) {
    hiddenInput.value = cleanSelected[0];
  }

  if (summaryEl) {
    if (cleanSelected.length === 0) {
      summaryEl.textContent = "Qiymət tipi seçilməyib";
      summaryEl.style.color = "#888";
    } else if (cleanSelected.length === 1) {
      summaryEl.textContent = cleanSelected[0];
      summaryEl.style.color = "#111";
    } else if (cleanSelected.length <= 3) {
      summaryEl.textContent = cleanSelected.join(", ");
      summaryEl.style.color = "#111";
    } else {
      summaryEl.textContent = `${cleanSelected[0]}, ${cleanSelected[1]} (+${cleanSelected.length - 2} ədəd)`;
      summaryEl.style.color = "#111";
    }
  }
}

function applySettingsAndClose() {
  syncDateInputsFromDlg();
  closeSettingsModal();
  if (window.SettingsPresets && typeof SettingsPresets.autoSaveCurrentSession === "function") {
    SettingsPresets.autoSaveCurrentSession();
  }
}

function applySettingsAndGenerate() {
  syncDateInputsFromDlg();
  closeSettingsModal();
  if (window.SettingsPresets && typeof SettingsPresets.autoSaveCurrentSession === "function") {
    SettingsPresets.autoSaveCurrentSession();
  }
  onActionFormirovat();
}

// Date Synchronization between top toolbar and dialog
function syncDateInputsFromTop() {
  const topStart = document.getElementById("topStartDateInput")?.value;
  const topEnd = document.getElementById("topEndDateInput")?.value;
  const dlgStart = document.getElementById("dlgStartDateInput");
  const dlgEnd = document.getElementById("dlgEndDateInput");

  if (dlgStart && topStart) dlgStart.value = topStart;
  if (dlgEnd && topEnd) dlgEnd.value = topEnd;
}

function syncDateInputsFromDlg() {
  const dlgStart = document.getElementById("dlgStartDateInput")?.value;
  const dlgEnd = document.getElementById("dlgEndDateInput")?.value;
  const topStart = document.getElementById("topStartDateInput");
  const topEnd = document.getElementById("topEndDateInput");

  if (topStart && dlgStart) topStart.value = dlgStart;
  if (topEnd && dlgEnd) topEnd.value = dlgEnd;
}

function pickDate(inputId, btnEl = null) {
  const btn = btnEl || event?.currentTarget || (typeof inputId === "string" ? document.getElementById(inputId)?.nextElementSibling : null);
  if (typeof OneCCalendar !== "undefined") {
    OneCCalendar.open(inputId, btn);
  }
}

function openPeriodSelectDialog(btnEl = null) {
  const btn = btnEl || event?.currentTarget || document.querySelector(".period-more-btn");
  if (typeof OneCPeriodPicker !== "undefined") {
    OneCPeriodPicker.open(btn);
  }
}

function toggleTreeNode(headerEl) {
  const nextUl = headerEl.nextElementSibling;
  if (!nextUl) return;
  if (nextUl.style.display === "none") {
    nextUl.style.display = "block";
    headerEl.querySelector("span:first-child").textContent = "📂";
  } else {
    nextUl.style.display = "none";
    headerEl.querySelector("span:first-child").textContent = "📁";
  }
}

function checkAllIndicators(checked) {
  const tree = document.querySelector(".indicators-tree");
  if (!tree) return;
  const checkboxes = tree.querySelectorAll("input[type='checkbox']");
  checkboxes.forEach(cb => cb.checked = checked);
}

// Groupings Management
function selectGroupingRow(tr) {
  const tbody = tr.parentElement;
  tbody.querySelectorAll("tr").forEach(r => r.classList.remove("selected"));
  tr.classList.add("selected");
  const rows = Array.from(tbody.children);
  if (tbody.id === "rowGroupingsBody") {
    SettingsModal.selectedRowGroupingIndex = rows.indexOf(tr);
  } else {
    SettingsModal.selectedColGroupingIndex = rows.indexOf(tr);
  }
}

function openFieldSelectorForRowGrouping() {
  FieldSelector.open("Склад", (chosenField) => {
    const tbody = document.getElementById("rowGroupingsBody");
    const tr = createGroupingRowElement(chosenField, "Элементы", false);
    tbody.appendChild(tr);
    selectGroupingRow(tr);
  });
}

function editRowGroupingField(btn) {
  const tr = btn.closest("tr");
  if (!tr) return;
  selectGroupingRow(tr);
  const nameSpan = tr.querySelector(".grouping-field-name");
  const currentVal = nameSpan ? nameSpan.textContent.trim() : "";
  FieldSelector.open(currentVal, (chosenField) => {
    if (nameSpan) nameSpan.textContent = chosenField;
  });
}

function openFieldSelectorForColGrouping() {
  FieldSelector.open("Период", (chosenField) => {
    const tbody = document.getElementById("colGroupingsBody");
    const tr = createGroupingRowElement(chosenField, "Элементы", true);
    tbody.appendChild(tr);
    selectGroupingRow(tr);
  });
}

function editColGroupingField(btn) {
  const tr = btn.closest("tr");
  if (!tr) return;
  selectGroupingRow(tr);
  const nameSpan = tr.querySelector(".grouping-field-name");
  const currentVal = nameSpan ? nameSpan.textContent.trim() : "";
  FieldSelector.open(currentVal, (chosenField) => {
    if (nameSpan) nameSpan.textContent = chosenField;
  });
}

function createGroupingRowElement(fieldName, typeVal = "Элементы", isCol = false) {
  const tr = document.createElement("tr");
  tr.onclick = function() { selectGroupingRow(this); };
  const editFn = isCol ? "editColGroupingField(this)" : "editRowGroupingField(this)";
  tr.ondblclick = function() {
    const btn = this.querySelector(".grouping-btn-pick");
    if (btn) btn.click();
  };
  tr.innerHTML = `
    <td>
      <div class="grouping-cell-wrap">
        <span class="grouping-field-name">${fieldName}</span>
        <button class="grouping-btn-pick" onclick="${editFn}" title="Выбрать поле...">...</button>
      </div>
    </td>
    <td>
      <select class="grouping-type-sel">
        <option value="Элементы" ${typeVal === "Элементы" ? "selected" : ""}>Элементы</option>
        <option value="Иерархия" ${typeVal === "Иерархия" ? "selected" : ""}>Иерархия</option>
        <option value="Без групп" ${typeVal === "Без групп" ? "selected" : ""}>Без групп</option>
      </select>
    </td>
  `;
  return tr;
}

function addRowGroupingPrompt() {
  openFieldSelectorForRowGrouping();
}

function removeSelectedRowGrouping() {
  const tbody = document.getElementById("rowGroupingsBody");
  const selected = tbody.querySelector("tr.selected");
  if (selected && tbody.children.length > 1) {
    selected.remove();
    if (tbody.children[0]) selectGroupingRow(tbody.children[0]);
  } else if (selected) {
    alert("Ən azı 1 qruplaşma sətiri qalmalıdır!");
  }
}

function moveRowGroupingUp() {
  const tbody = document.getElementById("rowGroupingsBody");
  const selected = tbody.querySelector("tr.selected");
  if (!selected || !selected.previousElementSibling) return;
  tbody.insertBefore(selected, selected.previousElementSibling);
}

function moveRowGroupingDown() {
  const tbody = document.getElementById("rowGroupingsBody");
  const selected = tbody.querySelector("tr.selected");
  if (!selected || !selected.nextElementSibling) return;
  tbody.insertBefore(selected.nextElementSibling, selected);
}

function addColumnGroupingPrompt() {
  const field = prompt("Sütun qruplaşması sahəsi daxil edin:\n(Məsələn: Период, Месяц, Склад)", "Период");
  if (!field) return;
  const tbody = document.getElementById("colGroupingsBody");
  const tr = document.createElement("tr");
  tr.onclick = function() { selectGroupingRow(this); };
  tr.innerHTML = `<td>${field}</td><td>Элементы</td>`;
  tbody.appendChild(tr);
  selectGroupingRow(tr);
}

function removeSelectedColGrouping() {
  const tbody = document.getElementById("colGroupingsBody");
  const selected = tbody.querySelector("tr.selected");
  if (selected) selected.remove();
}

function moveColGroupingUp() {
  const tbody = document.getElementById("colGroupingsBody");
  const selected = tbody.querySelector("tr.selected");
  if (!selected || !selected.previousElementSibling) return;
  tbody.insertBefore(selected, selected.previousElementSibling);
}

function moveColGroupingDown() {
  const tbody = document.getElementById("colGroupingsBody");
  const selected = tbody.querySelector("tr.selected");
  if (!selected || !selected.nextElementSibling) return;
  tbody.insertBefore(selected.nextElementSibling, selected);
}

function moveGroupingToColumns() {
  const rowBody = document.getElementById("rowGroupingsBody");
  const colBody = document.getElementById("colGroupingsBody");
  const selected = rowBody.querySelector("tr.selected");
  if (!selected) return;
  const field = selected.querySelector(".grouping-field-name")?.textContent.trim() || selected.cells[0].textContent.trim();
  const type = selected.querySelector(".grouping-type-sel")?.value || "Элементы";
  selected.remove();

  const tr = createGroupingRowElement(field, type, true);
  colBody.appendChild(tr);
  selectGroupingRow(tr);
  if (rowBody.children[0]) selectGroupingRow(rowBody.children[0]);
}

function moveGroupingToRows() {
  const rowBody = document.getElementById("rowGroupingsBody");
  const colBody = document.getElementById("colGroupingsBody");
  const selected = colBody.querySelector("tr.selected");
  if (!selected) return;
  const field = selected.querySelector(".grouping-field-name")?.textContent.trim() || selected.cells[0].textContent.trim();
  const type = selected.querySelector(".grouping-type-sel")?.value || "Элементы";
  selected.remove();

  const tr = createGroupingRowElement(field, type, false);
  rowBody.appendChild(tr);
  selectGroupingRow(tr);
  if (colBody.children[0]) selectGroupingRow(colBody.children[0]);
}

// -------------------------------------------------------------
// Filters Table Management (Отборы) & Catalog Selection Trigger
// -------------------------------------------------------------
function highlightFilterRow(tr) {
  const tbody = tr.parentElement;
  tbody.querySelectorAll("tr").forEach(r => r.classList.remove("active-row"));
  tr.classList.add("active-row");
}

function addFilterRow() {
  const tbody = document.getElementById("filtersTableBody");
  const tr = document.createElement("tr");
  tr.onclick = function() { highlightFilterRow(this); };
  tr.innerHTML = `
    <td style="text-align: center;"><input type="checkbox" class="filter-chk" checked></td>
    <td>
      <select class="filter-field-sel" onchange="onFilterFieldChange(this)">
        <option value="Склад">Склад</option>
        <option value="Номенклатура" selected>Номенклатура</option>
        <option value="Номенклатура.Номенклатурная группа">Номенклатура.Номенклатурная группа</option>
        <option value="Номенклатура.Код">Номенклатура.Код</option>
        <option value="Номенклатура.Артикул">Номенклатура.Артикул</option>
        <option value="Качество">Качество</option>
        <option value="ХарактеристикаНоменклатуры">Характеристика номенклатуры</option>
        <option value="СерияНоменклатуры">Серия номенклатуры</option>
        <option value="КоличествоКонечныйОстаток">КоличествоКонечныйОстаток</option>
        <option value="КоличествоНачальныйОстаток">КоличествоНачальныйОстаток</option>
        <option value="КоличествоПриход">КоличествоПриход</option>
        <option value="КоличествоРасход">КоличествоРасход</option>
        <option value="КоличествоОборот">КоличествоОборот</option>
        <option value="Контрагент">Контрагент (Alıcı/Müştəri)</option>
        <option value="Портфель">Портфель (Brend)</option>
        <option value="Регистратор.Вид операции">Регистратор.Вид операции</option>
        <option value="Регистратор.Ответственный">Регистратор.Ответственный</option>
      </select>
    </td>
    <td>
      <select class="filter-comp-sel">
        <option value="in_list">В группе из списка</option>
        <option value="equal">Равно</option>
        <option value="not_equal">Не равно</option>
        <option value="contains" selected>Содержит</option>
        <option value="less">Меньше</option>
        <option value="greater">Больше</option>
      </select>
    </td>
    <td>
      <div class="filter-value-cell-wrap">
        <input type="text" class="filter-val-input" value="" placeholder="Dəyər daxil edin və ya [...] basın...">
        <button class="filter-btn-pick" onclick="openCatalogForFilterRow(this)" title="Soraqçanı aç...">...</button>
      </div>
    </td>
  `;
  tbody.appendChild(tr);
  highlightFilterRow(tr);
  const inp = tr.querySelector(".filter-val-input");
  if (inp) {
    bindAutocomplete(inp);
    inp.focus();
  }
}

function removeSelectedFilterRow() {
  const tbody = document.getElementById("filtersTableBody");
  const active = tbody.querySelector("tr.active-row");
  if (active) {
    active.remove();
  } else if (tbody.children.length > 0) {
    tbody.children[tbody.children.length - 1].remove();
  }
}

function clearAllFilters() {
  const tbody = document.getElementById("filtersTableBody");
  const checkboxes = tbody.querySelectorAll(".filter-chk");
  checkboxes.forEach(cb => cb.checked = false);
}

function saveFiltersPreset() {
  alert("Süzgəclər cari sessiyada saxlanıldı.");
}

function onFilterFieldChange(selectEl) {
  const tr = selectEl.closest("tr");
  if (!tr) return;
  const input = tr.querySelector(".filter-val-input");
  if (input) input.value = "";
}

// Trigger Catalog or Value List Modal based on comparison type
function openCatalogForFilterRow(btn) {
  const tr = btn.closest("tr");
  if (!tr) return;
  const fieldSel = tr.querySelector(".filter-field-sel");
  const compSel = tr.querySelector(".filter-comp-sel");
  const valInput = tr.querySelector(".filter-val-input");
  const chk = tr.querySelector(".filter-chk");

  const field = fieldSel ? fieldSel.value : "Номенклатура";
  const comp = compSel ? compSel.value : "equal";
  const isMulti = comp === "in_list" || comp === "in_group_list" || comp === "in_list_exact";

  console.log(`[SETTINGS FILTER PICK] field="${field}", comp="${comp}", isMulti=${isMulti}`);

  if (chk) chk.checked = true;

  // 1. Operation Type (Вид операции)
  if (field.includes("Вид операции") || field.includes("вид операции") || field.includes("ВидОперации")) {
    if (typeof OperationTypeSelector !== "undefined") {
      OperationTypeSelector.open({
        targetInput: valInput,
        multiSelect: isMulti
      });
    }
    return;
  }

  // 2. Quality
  if (field === "Качество") {
    openQualitySelect(btn, isMulti);
    return;
  }

  // 3. User / Responsible
  if (field.includes("Ответственный")) {
    openUserSelect(btn, isMulti);
    return;
  }

  let catalog = "Номенклатура";
  if (field === "Склад") catalog = "Склады";
  else if (field === "Контрагент") catalog = "Контрагенты";
  else if (field === "Портфель") catalog = "Портфели";

  // If "В группе из списка" -> open "Редактирование списка значений" (Screenshot 2)
  if (isMulti) {
    ValueListModal.open({
      targetInput: valInput,
      catalog: catalog
    });
  } else {
    // Single item picker
    CatalogSelector.open({
      catalog: catalog,
      targetInput: valInput,
      multiSelect: false
    });
  }
}

function openQualitySelect(btn, isMulti = false) {
  const tr = btn.closest("tr");
  const input = tr ? tr.querySelector(".filter-val-input") : null;
  if (!input) return;
  
  if (isMulti) {
    ValueListModal.open({
      targetInput: input,
      catalog: "Качество"
    });
  } else {
    const opts = ["Кондиция", "Некондиция", "Новый", "Брак"];
    const cur = input.value || opts[0];
    const nextIdx = (opts.indexOf(cur) + 1) % opts.length;
    input.value = opts[nextIdx];
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function openUserSelect(btn, isMulti = false) {
  const tr = btn.closest("tr");
  const input = tr ? tr.querySelector(".filter-val-input") : null;
  if (!input) return;

  if (isMulti) {
    ValueListModal.open({
      targetInput: input,
      catalog: "Пользователи"
    });
  } else {
    CatalogSelector.open({
      catalog: "Пользователи",
      targetInput: input,
      multiSelect: false
    });
  }
}

// -------------------------------------------------------------
// Live Autocomplete for Filter Values (e.g. typing warehouse/item)
// -------------------------------------------------------------
let autocompleteTimeout = null;

function setupAutocomplete() {
  document.querySelectorAll(".filter-val-input").forEach(input => {
    bindAutocomplete(input);
  });
}

function hideAllAutocomplete() {
  document.querySelectorAll(".autocomplete-suggestions-box").forEach(el => {
    el.classList.remove("show");
    el.innerHTML = "";
  });
}

// Global click to close autocomplete
document.addEventListener("click", (e) => {
  if (!e.target.closest(".filter-value-cell-wrap")) {
    hideAllAutocomplete();
  }
});

function bindAutocomplete(input) {
  if (input._acBound) return;
  input._acBound = true;

  const wrapper = input.closest(".filter-value-cell-wrap");
  if (!wrapper) return;

  let dropdown = wrapper.querySelector(".autocomplete-suggestions-box");
  if (!dropdown) {
    dropdown = document.createElement("div");
    dropdown.className = "autocomplete-suggestions-box";
    wrapper.style.position = "relative";
    wrapper.appendChild(dropdown);
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape" || e.key === "Enter") {
      dropdown.classList.remove("show");
      dropdown.innerHTML = "";
    }
  });

  input.addEventListener("input", (e) => {
    // Ignore programmatic updates (e.g. when selected from modal)
    if (!e.isTrusted) {
      dropdown.classList.remove("show");
      dropdown.innerHTML = "";
      return;
    }

    clearTimeout(autocompleteTimeout);
    const query = input.value.trim();
    if (!query || query.length < 1) {
      dropdown.classList.remove("show");
      dropdown.innerHTML = "";
      return;
    }

    const tr = input.closest("tr");
    const fieldSel = tr ? tr.querySelector(".filter-field-sel") : null;
    const field = fieldSel ? fieldSel.value : "Номенклатура";

    let catalog = "Номенклатура";
    if (field === "Склад") catalog = "Склады";
    else if (field === "Контрагент") catalog = "Контрагенты";
    else if (field === "Портфель") catalog = "Портфели";

    // Extract last typed word if semicolon- or comma-separated
    const parts = query.split(/[;,]/);
    const lastWord = parts[parts.length - 1].trim();

    if (!lastWord) {
      dropdown.classList.remove("show");
      dropdown.innerHTML = "";
      return;
    }

    autocompleteTimeout = setTimeout(async () => {
      try {
        const creds = SessionManager.getCredentials();
        const res = await fetch("/api/catalog_data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...creds,
            catalog,
            search: lastWord
          })
        });
        const data = await res.json();
        if (data.success && (data.items?.length || data.folders?.length)) {
          renderAutocompleteItems(dropdown, input, data.folders || [], data.items || []);
        } else {
          dropdown.classList.remove("show");
          dropdown.innerHTML = "";
        }
      } catch (e) {
        dropdown.classList.remove("show");
        dropdown.innerHTML = "";
      }
    }, 200);
  });

  input.addEventListener("blur", () => {
    setTimeout(() => {
      dropdown.classList.remove("show");
      dropdown.innerHTML = "";
    }, 250);
  });
}

function renderAutocompleteItems(dropdown, input, folders, items) {
  dropdown.innerHTML = "";
  const seen = new Set();
  const all = [];

  folders.slice(0, 10).forEach(f => {
    const key = (f.code || "") + ":" + (f.name || "");
    if (!seen.has(key)) {
      seen.add(key);
      all.push(f);
    }
  });

  items.slice(0, 15).forEach(it => {
    const key = (it.code || "") + ":" + (it.name || "");
    if (!seen.has(key)) {
      seen.add(key);
      all.push(it);
    }
  });

  if (all.length === 0) {
    dropdown.classList.remove("show");
    dropdown.innerHTML = "";
    return;
  }

  all.forEach(item => {
    const div = document.createElement("div");
    div.className = "autocomplete-item";
    const icon = item.is_folder ? "📁" : "📄";
    div.innerHTML = `
      <span class="item-icon">${icon}</span>
      <span class="item-code">[${escapeHtml(item.code || "")}]</span>
      <span style="font-weight: ${item.is_folder ? 'bold' : 'normal'};">${escapeHtml(item.name)}</span>
    `;

    div.onclick = (e) => {
      e.stopPropagation();
      const current = input.value;
      const parts = current.split(/[;,]/).map(p => p.trim()).filter(Boolean);
      if (parts.length > 1) {
        parts[parts.length - 1] = item.name;
        input.value = parts.join("; ");
      } else {
        input.value = item.name;
      }
      dropdown.classList.remove("show");
      dropdown.innerHTML = "";
      input.focus();
    };

    dropdown.appendChild(div);
  });

  dropdown.classList.add("show");
}

// Bind autocomplete on page load
document.addEventListener("DOMContentLoaded", () => {
  setupAutocomplete();
});
