/* ========================================================
   1C:ENTERPRISE UNIVERSAL REPORT SETTINGS COMPONENT
   universal_report_settings.js
   Təkrar istifadə oluna bilən vahid hesabat sazlama mühərriki.
   "Товары на складах", "Заказы покупателей (Анализ)" və s.
   ======================================================== */

(function() {
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

  const FIELD_CATALOG_MAP = {
    "Контрагент": "Контрагенты",
    "Номенклатура": "Номенклатура",
    "Склад": "Склады",
    "Портфель": "Портфели",
    "Агент": "Агенты",
    "Номенклатура.Номенклатурная группа": "НоменклатурныеГруппы",
    "Номенклатурная группа": "НоменклатурныеГруппы",
    "Договор": "ДоговорыКонтрагентов",
    "ДоговорКонтрагента": "ДоговорыКонтрагентов",
    "Пользователь": "Пользователи",
    "Регистратор.Ответственный": "Пользователи",
    "Ответственный": "Пользователи",
    "Водитель": "Водители"
  };

  const FIELD_PLACEHOLDER_MAP = {
    "Контрагент": "Müştəri seç...",
    "Номенклатура": "Məhsul seç...",
    "Склад": "Anbar seç...",
    "Портфель": "Portfel seç...",
    "Агент": "Agent seç...",
    "Номенклатура.Номенклатурная группа": "Qrup seç...",
    "Номенклатурная группа": "Qrup seç...",
    "Качество": "Keyfiyyət...",
    "Регистратор.Вид операции": "Əməliyyat növü...",
    "Вид операции": "Əməliyyat növü...",
    "Регистратор.Ответственный": "Məsul şəxs...",
    "Ответственный": "Məsul şəxs...",
    "Пользователь": "İstifadəçi seç...",
    "Количество": "Say...",
    "Сумма": "Məbləğ..."
  };

  class UniversalReportSettingsEngine {
    constructor(config = {}) {
      this.key = config.key || "universal_report";
      this.windowId = config.windowId || "reportSettingsModal";
      this.title = config.title || "Настройка отчета";
      this.storageKey = config.storageKey || `1c_settings_${this.key}_v1`;
      this.fieldCatalogMap = { ...FIELD_CATALOG_MAP, ...(config.fieldCatalogMap || {}) };
      this.fieldPlaceholderMap = { ...FIELD_PLACEHOLDER_MAP, ...(config.fieldPlaceholderMap || {}) };
      this.onGenerate = config.onGenerate || null;
      this.onApply = config.onApply || null;

      this.dateInputs = config.dateInputs || {
        dlgStart: "oaDlgStartDate",
        dlgEnd: "oaDlgEndDate",
        topStart: "oaStartDateInput",
        topEnd: "oaEndDateInput",
        labelId: "oaDlgPeriodLabel"
      };

      this.selectors = {
        tableRowGroupings: config.selectors?.tableRowGroupings || "#rowGroupingsBody",
        tableColGroupings: config.selectors?.tableColGroupings || "#colGroupingsBody",
        tableFilters: config.selectors?.tableFilters || "#filtersTableBody",
        indicatorsContainer: config.selectors?.indicatorsContainer || ".indicators-tree",
        advancedCheck: config.selectors?.advancedCheck || "#chkAdvancedSettings"
      };

      this.activeFilterRow = null;
      this.activeGroupingRow = null;
      this.autocompleteTimeout = null;
    }

    getContainer() {
      return document.getElementById(this.windowId);
    }

    open() {
      this.syncDatesFromTop();
      this.updatePeriodLabel();

      const win = this.getContainer();
      if (win) {
        const ws = document.getElementById("mdiWorkspace") || document.body;
        const wsW = ws.clientWidth || window.innerWidth;
        const wsH = ws.clientHeight || window.innerHeight;
        const targetW = Math.min(920, Math.max(540, wsW - 40));
        const targetH = Math.min(600, Math.max(400, wsH - 40));
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
        MdiManager.activateWindow(this.windowId, {
          title: this.title,
          icon: "⚙️"
        });
      }

      this.setupAutocomplete();
      this.bindKeyboardShortcuts();
      this.bindAllFilterRows();
    }

    bindKeyboardShortcuts() {
      const win = this.getContainer();
      if (!win || win._kbBound) return;
      win._kbBound = true;
      win.addEventListener("keydown", (e) => {
        if (e.ctrlKey && e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          this.applyAndGenerate();
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          this.close();
        }
      });
    }

    close() {
      if (window.MdiManager && typeof MdiManager.closeWindow === "function") {
        MdiManager.closeWindow(this.windowId);
      } else {
        const win = this.getContainer();
        if (win) {
          win.style.display = 'none';
          win.classList.add('minimized');
          win.classList.remove('active');
        }
      }
    }

    // -------------------------------------------------------------------------
    // Dates & Period
    // -------------------------------------------------------------------------
    syncDatesFromTop() {
      const topStart = document.getElementById(this.dateInputs.topStart) || document.getElementById("topStartDateInput");
      const topEnd = document.getElementById(this.dateInputs.topEnd) || document.getElementById("topEndDateInput");
      const dlgStart = document.getElementById(this.dateInputs.dlgStart);
      const dlgEnd = document.getElementById(this.dateInputs.dlgEnd);

      if (topStart && dlgStart && topStart.value) dlgStart.value = topStart.value;
      if (topEnd && dlgEnd && topEnd.value) dlgEnd.value = topEnd.value;
      this.updatePeriodLabel();
    }

    syncDatesToTop() {
      const dlgStart = document.getElementById(this.dateInputs.dlgStart);
      const dlgEnd = document.getElementById(this.dateInputs.dlgEnd);
      const topStart = document.getElementById(this.dateInputs.topStart) || document.getElementById("topStartDateInput");
      const topEnd = document.getElementById(this.dateInputs.topEnd) || document.getElementById("topEndDateInput");

      if (dlgStart && topStart && dlgStart.value) topStart.value = dlgStart.value;
      if (dlgEnd && topEnd && dlgEnd.value) topEnd.value = dlgEnd.value;
      this.updatePeriodLabel();

      // Report update if available
      if (window.OrderAnalysisReport && typeof OrderAnalysisReport.updatePeriodLabel === "function") {
        OrderAnalysisReport.updatePeriodLabel();
      }
    }

    updatePeriodLabel() {
      const sInput = document.getElementById(this.dateInputs.dlgStart);
      const eInput = document.getElementById(this.dateInputs.dlgEnd);
      const lbl = document.getElementById(this.dateInputs.labelId);
      if (!lbl) return;

      const s = sInput ? sInput.value.trim() : "";
      const e = eInput ? eInput.value.trim() : "";
      if (window.C1PeriodWidget) {
        lbl.textContent = C1PeriodWidget.formatLabel(s, e);
      } else {
        lbl.textContent = (s && e) ? `[ ${s} - ${e} ]` : "(Весь период)";
      }
      lbl.style.color = (lbl.textContent === "(Весь период)") ? "#555555" : "#002060";
    }

    openPeriodPicker(btn) {
      const sInput = document.getElementById(this.dateInputs.dlgStart);
      const eInput = document.getElementById(this.dateInputs.dlgEnd);
      const currStart = sInput?.value || "01.08.2026";
      const currEnd = eInput?.value || "30.09.2026";

      const handleSelect = (start, end) => {
        if (sInput) sInput.value = start;
        if (eInput) eInput.value = end;
        this.syncDatesToTop();
      };

      if (window.C1PeriodWidget) {
        C1PeriodWidget.open({
          startDate: currStart,
          endDate: currEnd,
          onSelect: handleSelect
        });
      } else if (window.PeriodPicker && typeof PeriodPicker.open === "function") {
        PeriodPicker.open({
          startDate: currStart,
          endDate: currEnd,
          onSelect: handleSelect
        });
      }
    }

    // -------------------------------------------------------------------------
    // Indicators Tree
    // -------------------------------------------------------------------------
    toggleTreeNode(headerEl) {
      const parent = headerEl.closest(".tree-node-group");
      if (!parent) return;
      const children = parent.querySelector(".tree-node-children");
      const icon = headerEl.querySelector(".tree-folder-icon, span:first-child");
      if (!children) return;

      if (children.style.display === "none") {
        children.style.display = "block";
        if (icon) icon.textContent = "📂";
      } else {
        children.style.display = "none";
        if (icon) icon.textContent = "📁";
      }
    }

    checkAllIndicators(checked = true) {
      const win = this.getContainer();
      if (!win) return;
      const cbs = win.querySelectorAll(`${this.selectors.indicatorsContainer} input[type="checkbox"]`);
      cbs.forEach(cb => {
        cb.checked = checked;
        cb.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }

    // -------------------------------------------------------------------------
    // Groupings (Rows & Columns)
    // -------------------------------------------------------------------------
    selectGroupingRow(tr) {
      const tbody = tr.closest("tbody");
      if (tbody) {
        tbody.querySelectorAll("tr").forEach(r => r.classList.remove("selected", "active-row"));
      }
      tr.classList.add("selected", "active-row");
      this.activeGroupingRow = tr;
    }

    addRowGrouping(defaultField = null, defaultType = "Элементы") {
      if (!defaultField) {
        const fs = window.FieldSelector || (typeof FieldSelector !== "undefined" ? FieldSelector : null);
        if (fs && typeof fs.open === "function") {
          fs.open((chosenField) => {
            if (chosenField && chosenField.trim()) {
              this.insertRowGroupingRow(chosenField.trim(), defaultType);
            }
          });
          return;
        }
      }
      this.insertRowGroupingRow(defaultField || "Контрагент", defaultType);
    }

    insertRowGroupingRow(fieldName, defaultType = "Элементы") {
      const tbody = this.getContainer()?.querySelector(this.selectors.tableRowGroupings);
      if (!tbody) return;

      const tr = document.createElement("tr");
      tr.onclick = () => this.selectGroupingRow(tr);
      tr.innerHTML = `
        <td>
          <div class="grouping-cell-wrap" style="display: flex; align-items: center; justify-content: space-between; padding: 1px 4px;">
            <span class="grouping-field-name">${escapeHtml(fieldName)}</span>
            <button class="grouping-btn-pick" onclick="UniversalReportSettings.editGroupingField(this)" title="Выбрать поле..." style="height: 18px; width: 22px; cursor: pointer; padding: 0;">...</button>
          </div>
        </td>
        <td>
          <select class="grouping-type-sel" style="width: 100%; height: 20px; font-size: 11px;">
            <option value="Элементы" ${defaultType === "Элементы" ? "selected" : ""}>Элементы</option>
            <option value="Иерархия" ${defaultType === "Иерархия" ? "selected" : ""}>Иерархия</option>
            <option value="Без групп" ${defaultType === "Без групп" ? "selected" : ""}>Без групп</option>
          </select>
        </td>
      `;
      tbody.appendChild(tr);
      this.selectGroupingRow(tr);
    }

    removeSelectedRowGrouping() {
      const tbody = this.getContainer()?.querySelector(this.selectors.tableRowGroupings);
      const selected = tbody?.querySelector("tr.selected") || tbody?.querySelector("tr.active-row");
      if (selected) {
        if (tbody.children.length <= 1) {
          alert("Ən azı bir sətir qruplaşması qalmalıdır!");
          return;
        }
        selected.remove();
        const first = tbody.querySelector("tr");
        if (first) this.selectGroupingRow(first);
      }
    }

    moveRowGroupingUp() {
      const tbody = this.getContainer()?.querySelector(this.selectors.tableRowGroupings);
      const selected = tbody?.querySelector("tr.selected") || tbody?.querySelector("tr.active-row");
      if (selected && selected.previousElementSibling) {
        selected.parentNode.insertBefore(selected, selected.previousElementSibling);
      }
    }

    moveRowGroupingDown() {
      const tbody = this.getContainer()?.querySelector(this.selectors.tableRowGroupings);
      const selected = tbody?.querySelector("tr.selected") || tbody?.querySelector("tr.active-row");
      if (selected && selected.nextElementSibling) {
        selected.parentNode.insertBefore(selected.nextElementSibling, selected);
      }
    }

    addColGrouping(defaultField = null, defaultType = "Элементы") {
      if (!defaultField) {
        const fs = window.FieldSelector || (typeof FieldSelector !== "undefined" ? FieldSelector : null);
        if (fs && typeof fs.open === "function") {
          fs.open((chosenField) => {
            if (chosenField && chosenField.trim()) {
              this.insertColGroupingRow(chosenField.trim(), defaultType);
            }
          });
          return;
        }
      }
      this.insertColGroupingRow(defaultField || "Период", defaultType);
    }

    insertColGroupingRow(fieldName, defaultType = "Элементы") {
      const tbody = this.getContainer()?.querySelector(this.selectors.tableColGroupings);
      if (!tbody) return;

      const tr = document.createElement("tr");
      tr.onclick = () => this.selectGroupingRow(tr);
      tr.innerHTML = `
        <td>
          <div class="grouping-cell-wrap" style="display: flex; align-items: center; justify-content: space-between; padding: 1px 4px;">
            <span class="grouping-field-name">${escapeHtml(fieldName)}</span>
            <button class="grouping-btn-pick" onclick="UniversalReportSettings.editGroupingField(this)" title="Выбрать поле..." style="height: 18px; width: 22px; cursor: pointer; padding: 0;">...</button>
          </div>
        </td>
        <td>
          <select class="grouping-type-sel" style="width: 100%; height: 20px; font-size: 11px;">
            <option value="Элементы" ${defaultType === "Элементы" ? "selected" : ""}>Элементы</option>
            <option value="Иерархия" ${defaultType === "Иерархия" ? "selected" : ""}>Иерархия</option>
            <option value="Без групп" ${defaultType === "Без групп" ? "selected" : ""}>Без групп</option>
          </select>
        </td>
      `;
      tbody.appendChild(tr);
      this.selectGroupingRow(tr);
    }

    removeSelectedColGrouping() {
      const tbody = this.getContainer()?.querySelector(this.selectors.tableColGroupings);
      const selected = tbody?.querySelector("tr.selected") || tbody?.querySelector("tr.active-row");
      if (selected) {
        selected.remove();
        const first = tbody.querySelector("tr");
        if (first) this.selectGroupingRow(first);
      }
    }

    moveColGroupingUp() {
      const tbody = this.getContainer()?.querySelector(this.selectors.tableColGroupings);
      const selected = tbody?.querySelector("tr.selected") || tbody?.querySelector("tr.active-row");
      if (selected && selected.previousElementSibling) {
        selected.parentNode.insertBefore(selected, selected.previousElementSibling);
      }
    }

    moveColGroupingDown() {
      const tbody = this.getContainer()?.querySelector(this.selectors.tableColGroupings);
      const selected = tbody?.querySelector("tr.selected") || tbody?.querySelector("tr.active-row");
      if (selected && selected.nextElementSibling) {
        selected.parentNode.insertBefore(selected.nextElementSibling, selected);
      }
    }

    moveGroupingToColumns() {
      const rowTbody = this.getContainer()?.querySelector(this.selectors.tableRowGroupings);
      const colTbody = this.getContainer()?.querySelector(this.selectors.tableColGroupings);
      const selected = rowTbody?.querySelector("tr.selected") || rowTbody?.querySelector("tr.active-row");
      if (selected && colTbody) {
        colTbody.appendChild(selected);
        this.selectGroupingRow(selected);
      }
    }

    moveGroupingToRows() {
      const rowTbody = this.getContainer()?.querySelector(this.selectors.tableRowGroupings);
      const colTbody = this.getContainer()?.querySelector(this.selectors.tableColGroupings);
      const selected = colTbody?.querySelector("tr.selected") || colTbody?.querySelector("tr.active-row");
      if (selected && rowTbody) {
        rowTbody.appendChild(selected);
        this.selectGroupingRow(selected);
      }
    }

    // -------------------------------------------------------------------------
    // Filters (Отборы)
    // -------------------------------------------------------------------------
    selectFilterRow(tr) {
      const tbody = tr.closest("tbody");
      if (tbody) {
        tbody.querySelectorAll("tr").forEach(r => r.classList.remove("selected", "active-row"));
      }
      tr.classList.add("selected", "active-row");
      this.activeFilterRow = tr;
    }

    onFilterFieldChange(selectEl) {
      const tr = selectEl.closest("tr");
      if (!tr) return;

      const field = selectEl.value;
      const input = tr.querySelector(".filter-val-input, .oa-filter-val");
      const placeholder = this.fieldPlaceholderMap[field] || "Dəyər daxil edin...";

      if (input) {
        input.value = "";
        input.placeholder = placeholder;
      }
    }

    bindAllFilterRows() {
      const tbody = this.getContainer()?.querySelector(this.selectors.tableFilters);
      if (!tbody) return;
      tbody.querySelectorAll("tr").forEach(tr => this.bindFilterRowEvents(tr));
    }

    bindFilterRowEvents(tr) {
      if (!tr || tr._filterEventsBound) return;
      tr._filterEventsBound = true;
      const inp = tr.querySelector(".filter-val-input, .oa-filter-val");
      if (inp) {
        inp.addEventListener("input", () => this.updateFilterRowCheckbox(tr));
        inp.addEventListener("change", () => this.updateFilterRowCheckbox(tr));
        inp.addEventListener("paste", () => setTimeout(() => this.updateFilterRowCheckbox(tr), 20));
      }
    }

    updateFilterRowCheckbox(tr) {
      if (!tr) return;
      const inp = tr.querySelector(".filter-val-input, .oa-filter-val");
      const chk = tr.querySelector(".filter-chk, .oa-filter-chk, input[type='checkbox']");
      if (inp && chk) {
        chk.checked = Boolean(inp.value && inp.value.trim().length > 0);
      }
    }

    addFilterRow(defaultField = "Контрагент", defaultComp = "in_list", defaultValue = "") {
      const tbody = this.getContainer()?.querySelector(this.selectors.tableFilters);
      if (!tbody) return;

      const tr = document.createElement("tr");
      tr.onclick = () => this.selectFilterRow(tr);

      const fieldOptions = Object.keys(this.fieldCatalogMap).map(f => {
        const sel = (f === defaultField) ? "selected" : "";
        return `<option value="${escapeHtml(f)}" ${sel}>${escapeHtml(f)}</option>`;
      }).join("");

      const placeholder = this.fieldPlaceholderMap[defaultField] || "Dəyər daxil edin...";
      const isChecked = Boolean(defaultValue && defaultValue.trim().length > 0);

      tr.innerHTML = `
        <td style="text-align: center;"><input type="checkbox" class="filter-chk oa-filter-chk" ${isChecked ? "checked" : ""}></td>
        <td>
          <select class="filter-field-sel oa-filter-field" onchange="UniversalReportSettings.onFilterFieldChange(this, '${this.key}')" style="width: 100%; height: 20px; font-size: 11px;">
            ${fieldOptions}
          </select>
        </td>
        <td>
          <select class="filter-comp-sel oa-filter-comp" style="width: 100%; height: 20px; font-size: 11px;">
            <option value="in_list" ${defaultComp === "in_list" ? "selected" : ""}>В группе из списка</option>
            <option value="equal" ${defaultComp === "equal" ? "selected" : ""}>Равно</option>
            <option value="not_equal" ${defaultComp === "not_equal" ? "selected" : ""}>Не равно</option>
            <option value="contains" ${defaultComp === "contains" ? "selected" : ""}>Содержит</option>
            <option value="less" ${defaultComp === "less" ? "selected" : ""}>Меньше</option>
            <option value="greater" ${defaultComp === "greater" ? "selected" : ""}>Больше</option>
          </select>
        </td>
        <td>
          <div class="filter-value-cell-wrap" style="display: flex; align-items: center; gap: 2px; position: relative;">
            <input type="text" class="filter-val-input oa-filter-val" value="${escapeHtml(defaultValue)}" placeholder="${placeholder}" style="flex: 1; height: 20px; font-size: 11px; padding: 1px 4px; border: 1px solid #7f9db9;">
            <button class="filter-btn-pick" onclick="UniversalReportSettings.openCatalogForFilterRow(this, '${this.key}')" title="Soraqçadan seç..." style="height: 20px; width: 22px; cursor: pointer; padding: 0;">...</button>
          </div>
        </td>
      `;

      tbody.appendChild(tr);
      this.selectFilterRow(tr);
      this.bindFilterRowEvents(tr);

      const inp = tr.querySelector(".filter-val-input, .oa-filter-val");
      if (inp) {
        this.bindAutocomplete(inp);
        inp.focus();
      }
    }

    removeSelectedFilterRow() {
      const tbody = this.getContainer()?.querySelector(this.selectors.tableFilters);
      const active = tbody?.querySelector("tr.selected") || tbody?.querySelector("tr.active-row");
      if (active) {
        active.remove();
        this.activeFilterRow = null;
      } else if (tbody?.children.length > 0) {
        tbody.children[tbody.children.length - 1].remove();
      }
    }

    clearAllFilters() {
      const tbody = this.getContainer()?.querySelector(this.selectors.tableFilters);
      if (!tbody) return;
      tbody.querySelectorAll("input[type='checkbox']").forEach(cb => cb.checked = false);
      tbody.querySelectorAll("input[type='text']").forEach(inp => inp.value = "");
    }

    // -------------------------------------------------------------------------
    // Catalog Selector Integration (Universal and Exact)
    // -------------------------------------------------------------------------
    openCatalogForFilterRow(btn) {
      const tr = btn.closest("tr");
      if (!tr) return;

      const fieldSel = tr.querySelector(".filter-field-sel, .oa-filter-field");
      const compSel = tr.querySelector(".filter-comp-sel, .oa-filter-comp");
      const valInput = tr.querySelector(".filter-val-input, .oa-filter-val");

      const field = fieldSel ? fieldSel.value.trim() : "Контрагент";
      const comp = compSel ? compSel.value.trim() : "in_list";
      const isMulti = (comp === "in_list" || comp === "in_group_list" || comp === "in_list_exact");

      console.log(`[UNIVERSAL SETTINGS PICK] report="${this.key}", field="${field}", comp="${comp}", isMulti=${isMulti}`);

      // 1. Operation Type (Вид операции)
      if (field.includes("Вид операции") || field.includes("ВидОперации")) {
        if (typeof OperationTypeSelector !== "undefined") {
          OperationTypeSelector.open({
            targetInput: valInput,
            multiSelect: isMulti,
            onSelect: () => this.updateFilterRowCheckbox(tr)
          });
        }
        return;
      }

      // 2. Quality (Качество)
      if (field === "Качество") {
        this.openQualitySelect(valInput, isMulti);
        return;
      }

      // 3. User / Responsible (Ответственный)
      if (field.includes("Ответственный") || field.includes("Пользователь")) {
        this.openUserSelect(valInput, isMulti);
        return;
      }

      // 4. Resolve exact catalog name
      let catalog = this.fieldCatalogMap[field] || "Номенклатура";
      if (field === "Склад") catalog = "Склады";
      else if (field === "Контрагент") catalog = "Контрагенты";
      else if (field === "Портфель") catalog = "Портфели";
      else if (field === "Агент") catalog = "Агенты";
      else if (field.includes("Номенклатурная группа")) catalog = "НоменклатурныеГруппы";
      else if (field.includes("Номенклатур")) catalog = "Номенклатура";

      // 5. Open Modal
      if (isMulti) {
        if (window.ValueListModal && typeof ValueListModal.open === "function") {
          ValueListModal.open({
            catalog: catalog,
            targetInput: valInput,
            onApply: (res) => {
              let strVal = "";
              if (typeof res === "string") {
                strVal = res;
              } else if (res && typeof res.displayStr === "string") {
                strVal = res.displayStr;
              } else if (res && Array.isArray(res.items)) {
                strVal = res.items.map(it => (it.value || it.name || "").trim()).filter(Boolean).join("; ");
              }
              if (valInput) {
                valInput.value = strVal || "";
                this.updateFilterRowCheckbox(tr);
              }
            }
          });
        }
      } else {
        if (window.CatalogSelector && typeof CatalogSelector.open === "function") {
          CatalogSelector.open({
            catalog: catalog,
            targetInput: valInput,
            multiSelect: false,
            onSelect: (selected) => {
              if (!selected) return;
              const name = (typeof selected === "string") ? selected : (selected.name || selected.Наименование || selected.code || "");
              if (valInput) {
                valInput.value = name || "";
                this.updateFilterRowCheckbox(tr);
              }
            }
          });
        }
      }
    }

    openQualitySelect(inputEl, isMulti = false) {
      if (!inputEl) return;
      const tr = inputEl.closest("tr");
      if (isMulti && window.ValueListModal) {
        ValueListModal.open({
          targetInput: inputEl,
          catalog: "Качество",
          onApply: () => this.updateFilterRowCheckbox(tr)
        });
      } else {
        const opts = ["Кондиция", "Некондиция", "Новый", "Брак"];
        const cur = inputEl.value || opts[0];
        const nextIdx = (opts.indexOf(cur) + 1) % opts.length;
        inputEl.value = opts[nextIdx];
        this.updateFilterRowCheckbox(tr);
      }
    }

    openUserSelect(inputEl, isMulti = false) {
      if (!inputEl) return;
      const tr = inputEl.closest("tr");
      if (isMulti && window.ValueListModal) {
        ValueListModal.open({
          targetInput: inputEl,
          catalog: "Пользователи",
          onApply: () => this.updateFilterRowCheckbox(tr)
        });
      } else if (window.CatalogSelector) {
        CatalogSelector.open({
          targetInput: inputEl,
          catalog: "Пользователи",
          multiSelect: false,
          onSelect: () => this.updateFilterRowCheckbox(tr)
        });
      }
    }

    // -------------------------------------------------------------------------
    // Autocomplete on Typing
    // -------------------------------------------------------------------------
    setupAutocomplete() {
      const win = this.getContainer();
      if (!win) return;
      win.querySelectorAll(".filter-val-input, .oa-filter-val").forEach(input => {
        this.bindAutocomplete(input);
      });
    }

    bindAutocomplete(input) {
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

      input.addEventListener("input", (e) => {
        if (!e.isTrusted) return;
        clearTimeout(this.autocompleteTimeout);

        const query = input.value.trim();
        if (!query || query.length < 1) {
          dropdown.classList.remove("show");
          dropdown.innerHTML = "";
          return;
        }

        const tr = input.closest("tr");
        const fieldSel = tr ? tr.querySelector(".filter-field-sel, .oa-filter-field") : null;
        const field = fieldSel ? fieldSel.value.trim() : "Контрагент";
        let catalog = this.fieldCatalogMap[field] || "Номенклатура";

        const parts = query.split(";");
        const lastWord = parts[parts.length - 1].trim();
        if (!lastWord) {
          dropdown.classList.remove("show");
          dropdown.innerHTML = "";
          return;
        }

        this.autocompleteTimeout = setTimeout(async () => {
          try {
            const creds = (typeof SessionManager !== "undefined") ? SessionManager.getCredentials() : {};
            const res = await fetch("/api/catalog_data", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...creds,
                catalog: catalog,
                search: lastWord
              })
            });
            const data = await res.json();
            if (data.success && (data.items?.length || data.folders?.length)) {
              this.renderAutocompleteItems(dropdown, input, data.folders || [], data.items || []);
            } else {
              dropdown.classList.remove("show");
              dropdown.innerHTML = "";
            }
          } catch (e) {
            dropdown.classList.remove("show");
            dropdown.innerHTML = "";
          }
        }, 180);
      });

      input.addEventListener("blur", () => {
        setTimeout(() => {
          dropdown.classList.remove("show");
          dropdown.innerHTML = "";
        }, 250);
      });
    }

    renderAutocompleteItems(dropdown, input, folders, items) {
      dropdown.innerHTML = "";
      const seen = new Set();
      const all = [];

      folders.slice(0, 8).forEach(f => {
        const key = (f.code || "") + ":" + (f.name || "");
        if (!seen.has(key)) { seen.add(key); all.push(f); }
      });

      items.slice(0, 20).forEach(it => {
        const key = (it.code || "") + ":" + (it.name || "");
        if (!seen.has(key)) { seen.add(key); all.push(it); }
      });

      if (all.length === 0) {
        dropdown.classList.remove("show");
        return;
      }

      all.forEach(item => {
        const div = document.createElement("div");
        div.className = "autocomplete-item";
        div.style.cssText = "padding: 3px 6px; cursor: pointer; display: flex; align-items: center; gap: 4px; font-size: 11px;";
        const icon = item.is_folder ? "📁" : "📄";
        div.innerHTML = `
          <span>${icon}</span>
          <span style="color: #666; font-size: 10px;">[${escapeHtml(item.code || "")}]</span>
          <span style="font-weight: ${item.is_folder ? 'bold' : 'normal'}; color: #111;">${escapeHtml(item.name)}</span>
        `;
        div.onclick = (e) => {
          e.stopPropagation();
          const current = input.value;
          const parts = current.split(";").map(p => p.trim()).filter(Boolean);
          if (parts.length > 1) {
            parts[parts.length - 1] = item.name;
            input.value = parts.join("; ");
          } else {
            input.value = item.name;
          }
          const tr = input.closest("tr");
          this.updateFilterRowCheckbox(tr);
          dropdown.classList.remove("show");
          dropdown.innerHTML = "";
          input.focus();
        };
        dropdown.appendChild(div);
      });

      dropdown.classList.add("show");
    }

    // -------------------------------------------------------------------------
    // Config Collection & Application
    // -------------------------------------------------------------------------
    collectSettings() {
      const win = this.getContainer();
      if (!win) return {};

      // Dates
      const startDate = document.getElementById(this.dateInputs.topStart)?.value?.trim() ||
                        document.getElementById(this.dateInputs.dlgStart)?.value?.trim() || "01.08.2026";
      const endDate = document.getElementById(this.dateInputs.topEnd)?.value?.trim() ||
                      document.getElementById(this.dateInputs.dlgEnd)?.value?.trim() || "30.09.2026";

      // Row Groupings
      const rowGroupings = [];
      const grpRows = win.querySelectorAll(`${this.selectors.tableRowGroupings} tr`);
      grpRows.forEach(tr => {
        const name = tr.querySelector(".grouping-field-name")?.textContent.trim() ||
                     tr.querySelector(".oa-grouping-select")?.value || "";
        const type = tr.querySelector(".grouping-type-sel")?.value || "Элементы";
        if (name) rowGroupings.push({ field: name, type });
      });

      // Col Groupings
      const colGroupings = [];
      const colRows = win.querySelectorAll(`${this.selectors.tableColGroupings} tr`);
      colRows.forEach(tr => {
        const name = tr.querySelector(".grouping-field-name")?.textContent.trim() || "";
        const type = tr.querySelector(".grouping-type-sel")?.value || "Элементы";
        if (name) colGroupings.push({ field: name, type });
      });

      // Filters
      const filters = [];
      const filterRows = win.querySelectorAll(`${this.selectors.tableFilters} tr`);
      filterRows.forEach(tr => {
        const chk = tr.querySelector(".filter-chk, .oa-filter-chk");
        const fSel = tr.querySelector(".filter-field-sel, .oa-filter-field");
        const cSel = tr.querySelector(".filter-comp-sel, .oa-filter-comp");
        const valInp = tr.querySelector(".filter-val-input, .oa-filter-val");

        if (chk && fSel && cSel && valInp) {
          filters.push({
            active: chk.checked,
            field: fSel.value.trim(),
            comp: cSel.value.trim(),
            value: valInp.value.trim()
          });
        }
      });

      return {
        startDate,
        endDate,
        rowGroupings,
        colGroupings,
        filters
      };
    }

    restoreSettings(saved) {
      if (!saved) return;
      const win = this.getContainer();
      if (!win) return;

      // Restore Row Groupings
      if (Array.isArray(saved.rowGroupings) && saved.rowGroupings.length > 0) {
        const tbody = win.querySelector(this.selectors.tableRowGroupings);
        if (tbody) {
          tbody.innerHTML = "";
          saved.rowGroupings.forEach(g => {
            if (g && g.field) {
              this.insertRowGroupingRow(g.field, g.type || "Элементы");
            }
          });
        }
      }

      // Restore Column Groupings
      if (Array.isArray(saved.colGroupings)) {
        const tbody = win.querySelector(this.selectors.tableColGroupings);
        if (tbody) {
          tbody.innerHTML = "";
          saved.colGroupings.forEach(g => {
            if (g && g.field) {
              this.insertColGroupingRow(g.field, g.type || "Элементы");
            }
          });
        }
      }

      // Restore Filters
      if (Array.isArray(saved.filters) && saved.filters.length > 0) {
        const tbody = win.querySelector(this.selectors.tableFilters);
        if (tbody) {
          tbody.innerHTML = "";
          saved.filters.forEach(f => {
            if (f && f.field) {
              this.addFilterRow(f.field, f.comp || "in_list", f.value || "");
              const lastTr = tbody.lastElementChild;
              if (lastTr) {
                const chk = lastTr.querySelector(".filter-chk, .oa-filter-chk, input[type='checkbox']");
                if (chk) chk.checked = !!f.active;
              }
            }
          });
        }
      }
    }

    applyAndGenerate() {
      this.syncDatesToTop();
      this.close();
      if (typeof this.onGenerate === "function") {
        this.onGenerate(this.collectSettings());
      }
    }

    applyAndClose() {
      this.applyAndGenerate();
    }
  }

  // Registry of report settings instances
  const registry = {};

  window.UniversalReportSettings = {
    register(config) {
      const engine = new UniversalReportSettingsEngine(config);
      registry[engine.key] = engine;
      return engine;
    },

    get(key) {
      return registry[key] || null;
    },

    open(key) {
      if (registry[key]) registry[key].open();
    },

    close(key) {
      if (registry[key]) registry[key].close();
    },

    restore(key, saved) {
      if (registry[key]) registry[key].restoreSettings(saved);
    },

    openCatalogForFilterRow(btn, key) {
      if (registry[key]) {
        registry[key].openCatalogForFilterRow(btn);
      } else {
        // Fallback global handler
        if (typeof openCatalogForFilterRow === "function") {
          openCatalogForFilterRow(btn);
        }
      }
    },

    onFilterFieldChange(selectEl, key) {
      if (registry[key]) {
        registry[key].onFilterFieldChange(selectEl);
      }
    },

    editGroupingField(btn) {
      const tr = btn.closest("tr");
      const span = tr ? tr.querySelector(".grouping-field-name") : null;
      if (!span) return;

      const curVal = span.textContent.trim();
      const fs = window.FieldSelector || (typeof FieldSelector !== "undefined" ? FieldSelector : null);
      if (fs && typeof fs.open === "function") {
        fs.open(curVal, (selectedField) => {
          if (selectedField && span) span.textContent = selectedField;
        });
      } else {
        // Birbaşa DOM üzərindən açırıq
        const overlay = document.getElementById("fieldSelectorModalOverlay");
        if (overlay) {
          overlay.style.display = "flex";
          overlay.classList.add("active");
          overlay.style.setProperty("z-index", "100500", "important");
        }
      }
    }
  };
})();
