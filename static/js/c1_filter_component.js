/**
 * 1C:Enterprise Web Platform
 * static/js/c1_filter_component.js
 * 
 * Vahid, Müstəqil Filtr Komponenti (Universal Filter Component Engine)
 * Bütün Sənəd Jurnalları, Hesabatlar və Soraqçalar üçün ümumi təmiz memarlıq modulu.
 */

const C1FilterComponent = {
  // ==========================================
  // State
  // ==========================================
  contextKey: "default",
  docTitle: "Документы",
  availableFields: [],
  activeFilters: [],
  tempFilterCriteria: [],
  activePresetName: "",
  filterSelectedCritIdx: 0,
  filterSelectedFieldKey: "",
  activeFilterTab: "otbor",
  onApplyCallback: null,
  isServerFiltered: false,

  filterOperators: [
    "Равно",
    "Не равно",
    "Меньше",
    "Меньше или равно",
    "Больше",
    "Больше или равно",
    "Интервал (>, <)",
    "Интервал (>=, <=)",
    "Интервал (>=, <)",
    "Интервал (>, <=)",
    "В списке",
    "Не в списке",
    "В группе из списка",
    "Содержит",
    "Начинается с",
    "Не содержит",
    "Заполнено",
    "Не заполнено"
  ],

  // ==========================================
  // Public API: Open / Close Filter Modal
  // ==========================================
  open: function(options = {}) {
    this.contextKey = options.docType || options.contextKey || "default";
    this.docTitle = options.docTitle || options.docType || "Настройка списка";
    this.availableFields = Array.isArray(options.availableFields) ? options.availableFields : [];
    this.onApplyCallback = typeof options.onApply === "function" ? options.onApply : null;
    this.isServerFiltered = Boolean(options.isServerFiltered);
    this.items = Array.isArray(options.items) ? options.items : [];

    // Öncə aktiv filtrləri bərpa edirik
    if (Array.isArray(options.activeFilters) && options.activeFilters.length > 0) {
      this.activeFilters = JSON.parse(JSON.stringify(options.activeFilters));
      this.activePresetName = options.activePresetName || "";
    } else {
      this.loadActiveFiltersFromStorage();
    }

    this.tempFilterCriteria = JSON.parse(JSON.stringify(this.activeFilters || []));
    this.tempFilterCriteria.forEach(c => {
      if (c.enabled === undefined) {
        c.enabled = Boolean(c.value || c.valueFrom || c.valueTo || c.structuredFilter);
      }
    });

    // 1C standart boolean şərtlərini (Пометка удаления və Проведен) ehtiyat olaraq əlavə edirik (default olaraq sönülü)
    const hasDeleted = this.tempFilterCriteria.some(c => c.fieldKey === "deleted");
    if (!hasDeleted) {
      this.tempFilterCriteria.push({
        id: "crit_default_deleted",
        enabled: false,
        fieldKey: "deleted",
        fieldLabel: "Пометка удаления",
        operator: "Равно",
        value: "Да"
      });
    }
    const hasPosted = this.tempFilterCriteria.some(c => c.fieldKey === "posted");
    if (!hasPosted) {
      this.tempFilterCriteria.push({
        id: "crit_default_posted",
        enabled: false,
        fieldKey: "posted",
        fieldLabel: "Проведен",
        operator: "Равно",
        value: "Да"
      });
    }

    this.filterSelectedCritIdx = 0;
    this.activeFilterTab = "otbor";

    if (!this.filterSelectedFieldKey && this.availableFields.length > 0) {
      this.filterSelectedFieldKey = this.availableFields[0].key;
    }

    const titleEl = document.getElementById("ujFilterWindowTitle");
    if (titleEl) {
      titleEl.textContent = `Настройка списка: ${this.docTitle}`;
    }

    this.switchFilterTab("otbor");
    this.renderFilterAvailableFields();
    this.renderFilterCriteriaRows();

    if (window.MdiManager) {
      MdiManager.activateWindow("ujFilterWindow", {
        title: "Настройка списка",
        icon: "📑",
        isDialog: false,
        closeFn: () => {
          this.close();
        }
      });
    } else {
      const win = document.getElementById("ujFilterWindow");
      if (win) win.style.display = "flex";
    }
  },

  close: function() {
    this.closeOpDropdown();
    this.hideFilterAutocomplete();

    // Pəncərə bağlananda cari qoyulmuş filtrlər sessiya yaddaşında saxlanılır və tətbiq olunur
    if (this.tempFilterCriteria && this.tempFilterCriteria.length > 0) {
      this.syncTempFiltersToStorage();
      this.activeFilters = JSON.parse(JSON.stringify(this.tempFilterCriteria));
      if (this.onApplyCallback) {
        this.onApplyCallback(this.activeFilters, this.activePresetName);
      }
    }

    if (window.MdiManager) {
      MdiManager.closeWindow("ujFilterWindow");
    } else {
      const win = document.getElementById("ujFilterWindow");
      if (win) win.style.display = "none";
    }
  },

  switchFilterTab: function(tabName) {
    this.activeFilterTab = tabName;
    const isOtbor = (tabName === "otbor");
    const otborBody = document.getElementById("ujFilterTabBodyOtbor");
    const otherBody = document.getElementById("ujFilterTabBodyOther");
    const otherLabel = document.getElementById("ujFilterTabOtherLabel");

    if (otborBody) otborBody.style.display = isOtbor ? "flex" : "none";
    if (otherBody) otherBody.style.display = isOtbor ? "none" : "flex";

    const tabs = ["osnovnye", "otbor", "sort", "style", "group"];
    tabs.forEach(t => {
      const btn = document.getElementById("ujTab" + t.charAt(0).toUpperCase() + t.slice(1));
      if (!btn) return;
      const isActive = (t === tabName);
      btn.style.background = isActive ? "#f0eee3" : "#dfdcce";
      btn.style.fontWeight = isActive ? "bold" : "normal";
      btn.style.borderTop = isActive ? "2px solid #e28700" : "1px solid #b0af9f";
      btn.style.borderBottom = isActive ? "none" : "1px solid #b0af9f";
    });

    if (otherLabel && !isOtbor) {
      const names = {
        osnovnye: "Основные",
        sort: "Сортировка",
        style: "Условное оформление",
        group: "Группировка"
      };
      otherLabel.textContent = `Вкладка "${names[tabName] || tabName}" доступна через основную таблицу.`;
    }
  },

  // ==========================================
  // Left Side: Available Fields List
  // ==========================================
  renderFilterAvailableFields: function() {
    const listEl = document.getElementById("ujFilterAvailFieldsList");
    if (!listEl) return;

    let html = "";
    this.availableFields.forEach(f => {
      const isSelected = (f.key === this.filterSelectedFieldKey);
      const bg = isSelected ? "#316ac5" : "#ffffff";
      const fg = isSelected ? "#ffffff" : "#111111";
      html += `
        <div id="ujAvailField_${f.key}"
             style="padding: 3px 6px; font-size: 11px; background: ${bg}; color: ${fg}; cursor: pointer; user-select: none; display: flex; align-items: center; gap: 5px; border-bottom: 1px dotted #e0dec8;"
             onclick="C1FilterComponent.selectAvailableField('${f.key}')"
             ondblclick="C1FilterComponent.addFilterCriterion('${f.key}')">
          <span style="font-size: 10px; color: ${isSelected ? '#fff' : '#4a78c4'};">▬</span>
          <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${this.escapeHtml(f.label)}</span>
        </div>
      `;
    });
    listEl.innerHTML = html;
  },

  selectAvailableField: function(key) {
    this.filterSelectedFieldKey = key;
    const listEl = document.getElementById("ujFilterAvailFieldsList");
    if (listEl) {
      const items = listEl.querySelectorAll("[id^='ujAvailField_']");
      items.forEach(el => {
        const isSel = (el.id === `ujAvailField_${key}`);
        el.style.background = isSel ? "#316ac5" : "#ffffff";
        el.style.color = isSel ? "#ffffff" : "#111111";
        const icon = el.querySelector("span");
        if (icon) icon.style.color = isSel ? "#ffffff" : "#4a78c4";
      });
    }
  },

  // ==========================================
  // Criteria Operations: Add / Remove / Order
  // ==========================================
  addFilterCriterion: function(fieldKey) {
    const avail = this.availableFields;
    const fKey = fieldKey || this.filterSelectedFieldKey || (avail.length > 0 ? avail[0].key : "kontragent");
    const fieldObj = avail.find(f => f.key === fKey) || { key: fKey, label: fKey, type: "text" };

    let defVal = "";
    if (fieldObj.type === "boolean") defVal = "Да";
    else if (fieldObj.key === "vms_status") defVal = "Подтвержден WMS";

    this.tempFilterCriteria.push({
      id: "crit_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4),
      enabled: false, // QAYDA: Soldan əlavə ediləndə ilkin olaraq quş qoyulmur, yalnız dəyişiklik ediləndə seçilir
      fieldKey: fieldObj.key,
      fieldLabel: fieldObj.label,
      operator: "Равно",
      value: defVal
    });

    if (this.activePresetName) {
      this.activePresetName = "";
    }

    this.filterSelectedCritIdx = this.tempFilterCriteria.length - 1;
    this.renderFilterCriteriaRows();
    this.syncTempFiltersToStorage();

    setTimeout(() => {
      const inp = document.getElementById(`ujFilterValInput_${this.filterSelectedCritIdx}`);
      if (inp) inp.focus();
    }, 50);
  },

  removeFilterCriterion: function(idx) {
    const targetIdx = (idx !== undefined) ? idx : this.filterSelectedCritIdx;
    if (targetIdx >= 0 && targetIdx < this.tempFilterCriteria.length) {
      this.tempFilterCriteria.splice(targetIdx, 1);
      this.filterSelectedCritIdx = Math.max(0, targetIdx - 1);
      this.hideFilterAutocomplete();
      this.renderFilterCriteriaRows();
      this.syncTempFiltersToStorage();
    }
  },

  moveFilterCriterionUp: function() {
    const idx = this.filterSelectedCritIdx;
    if (idx > 0 && idx < this.tempFilterCriteria.length) {
      const [item] = this.tempFilterCriteria.splice(idx, 1);
      this.tempFilterCriteria.splice(idx - 1, 0, item);
      this.filterSelectedCritIdx = idx - 1;
      this.renderFilterCriteriaRows();
      this.syncTempFiltersToStorage();
    }
  },

  moveFilterCriterionDown: function() {
    const idx = this.filterSelectedCritIdx;
    if (idx >= 0 && idx < this.tempFilterCriteria.length - 1) {
      const [item] = this.tempFilterCriteria.splice(idx, 1);
      this.tempFilterCriteria.splice(idx + 1, 0, item);
      this.filterSelectedCritIdx = idx + 1;
      this.renderFilterCriteriaRows();
      this.syncTempFiltersToStorage();
    }
  },

  selectFilterCritRow: function(idx) {
    this.filterSelectedCritIdx = idx;
    const tbody = document.getElementById("ujFilterCriteriaTbody");
    if (tbody) {
      const rows = tbody.querySelectorAll("tr");
      rows.forEach((r, rIdx) => {
        const isSel = (rIdx === idx);
        r.style.background = isSel ? "#e2eefb" : (rIdx % 2 === 1 ? "#f9f8f4" : "#ffffff");
        r.querySelectorAll("input.input-1c").forEach(inp => {
          inp.style.setProperty("background", "#ffffff", "important");
          inp.style.setProperty("background-color", "#ffffff", "important");
          inp.style.setProperty("color", "#111111", "important");
        });
      });
    }
  },

  toggleFilterCritEnabled: function(idx, checked) {
    if (this.tempFilterCriteria[idx]) {
      this.tempFilterCriteria[idx].enabled = checked;
      this.syncTempFiltersToStorage();
    }
    this.updateHeaderCheckAllState();
  },

  setCritEnabled: function(idx, enabled = true) {
    if (this.tempFilterCriteria[idx]) {
      this.tempFilterCriteria[idx].enabled = enabled;
      const chk = document.getElementById(`ujCritEnabled_${idx}`);
      if (chk) {
        chk.checked = enabled;
      }
      this.syncTempFiltersToStorage();
      this.updateHeaderCheckAllState();
    }
  },

  updateHeaderCheckAllState: function() {
    const chkAll = document.querySelector("#ujFilterTableContainer thead input[type='checkbox']");
    if (chkAll && this.tempFilterCriteria && this.tempFilterCriteria.length > 0) {
      const allEnabled = this.tempFilterCriteria.every(c => c.enabled !== false);
      const someEnabled = this.tempFilterCriteria.some(c => c.enabled !== false);
      chkAll.checked = allEnabled;
      chkAll.indeterminate = (!allEnabled && someEnabled);
    }
  },

  checkAllFilterCriteria: function(checked) {
    this.tempFilterCriteria.forEach(c => c.enabled = checked);
    const tbody = document.getElementById("ujFilterCriteriaTbody");
    if (tbody) {
      const checks = tbody.querySelectorAll("input[type='checkbox']");
      checks.forEach(chk => chk.checked = checked);
    }
    this.updateHeaderCheckAllState();
    this.syncTempFiltersToStorage();
  },

  clearAllFilterCriteria: function() {
    this.tempFilterCriteria = [];
    this.filterSelectedCritIdx = 0;
    this.hideFilterAutocomplete();
    this.renderFilterCriteriaRows();
    this.syncTempFiltersToStorage();
  },

  // ==========================================
  // Render Filter Table Rows (Middle Panel)
  // ==========================================
  renderFilterCriteriaRows: function() {
    const tbody = document.getElementById("ujFilterCriteriaTbody");
    const countEl = document.getElementById("ujFilterCountSummary");
    if (!tbody) return;

    const crits = this.tempFilterCriteria;
    const availFields = this.availableFields;
    const selCritIdx = Math.max(0, Math.min(this.filterSelectedCritIdx, crits.length - 1));

    if (countEl) {
      countEl.textContent = `${crits.length} элементов`;
    }

    if (crits.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; padding: 35px; color: #777; font-style: italic;">
            Условия отбора не заданы.<br>
            Выберите поле слева и дважды кликните или нажмите "Выбрать" / "➕ Добавить новый элемент".
          </td>
        </tr>
      `;
      return;
    }

    let rowsHtml = "";
    crits.forEach((crit, idx) => {
      const isSelected = (idx === selCritIdx);
      const bg = isSelected ? "#e2eefb" : (idx % 2 === 1 ? "#f9f8f4" : "#ffffff");
      const isChecked = (crit.enabled !== false);
      const fieldObj = availFields.find(f => f.key === crit.fieldKey) || { key: crit.fieldKey, label: crit.fieldLabel || crit.fieldKey, type: "text" };
      const isNoValueNeeded = (crit.operator === "Заполнено" || crit.operator === "Не заполнено");

      let valueInputHtml = "";
      if (isNoValueNeeded) {
        valueInputHtml = `<span style="color: #888; font-style: italic; font-size: 10px;">(не требуется)</span>`;
      } else if (fieldObj.type === "boolean") {
        const valStr = (crit.value === "Да" || crit.value === true || crit.value === "true") ? "Да" : "Нет";
        valueInputHtml = `
          <select id="ujFilterValInput_${idx}" class="select-1c" style="width: 100%; height: 21px; font-size: 11px; background: #ffffff !important; color: #111111 !important; border: 1px solid #7f9db9;"
                  onclick="event.stopPropagation()"
                  onchange="C1FilterComponent.tempFilterCriteria[${idx}].value = this.value; C1FilterComponent.setCritEnabled(${idx}, true); C1FilterComponent.syncTempFiltersToStorage();">
            <option value="Да" ${valStr === 'Да' ? 'selected' : ''} style="color: #111111 !important; background-color: #ffffff !important;">Да</option>
            <option value="Нет" ${valStr === 'Нет' ? 'selected' : ''} style="color: #111111 !important; background-color: #ffffff !important;">Нет</option>
          </select>
        `;
      } else {
        const isInterval = crit.operator && crit.operator.startsWith("Интервал");
        const structAttr = crit.structuredFilter ? `data-structured-list="${this.escapeHtml(JSON.stringify(crit.structuredFilter))}"` : '';

        if (isInterval) {
          let valFrom = (crit.valueFrom !== undefined) ? crit.valueFrom : "";
          let valTo = (crit.valueTo !== undefined) ? crit.valueTo : "";
          if (!valFrom && !valTo && crit.value) {
            const parts = String(crit.value).split(/\s*(?:\.\.\.|—|-)\s*/);
            valFrom = parts[0] || "";
            valTo = parts[1] || "";
          }

          valueInputHtml = `
            <div style="display: flex; align-items: center; width: 100%; gap: 4px; position: relative;">
              <span style="font-size: 11px; font-weight: bold; color: #222222; white-space: nowrap; user-select: none;">Начало:</span>
              <input type="text" id="ujFilterValInput_${idx}_from" class="input-1c uj-filter-from" ${structAttr}
                     style="flex: 1; min-width: 0; height: 21px; font-size: 11px; padding: 1px 4px; outline: none; background: #ffffff !important; color: #111111 !important; border: 1px solid #7f9db9;"
                     value="${this.escapeHtml(valFrom)}"
                     placeholder="Начало"
                     title="Начало периода"
                     onclick="event.stopPropagation()"
                     onfocus="C1FilterComponent.selectFilterCritRow(${idx})"
                     oninput="C1FilterComponent.onFilterIntervalInput(${idx}, 'from', this)"
                     onblur="C1FilterComponent.onFilterIntervalBlur(${idx}, 'from', this)"
                     onkeydown="C1FilterComponent.onFilterIntervalKeydown(${idx}, 'from', this, event)">
              <span style="font-size: 11px; font-weight: bold; color: #222222; white-space: nowrap; user-select: none; margin-left: 4px;">Конец:</span>
              <input type="text" id="ujFilterValInput_${idx}_to" class="input-1c uj-filter-to" ${structAttr}
                     style="flex: 1; min-width: 0; height: 21px; font-size: 11px; padding: 1px 4px; outline: none; background: #ffffff !important; color: #111111 !important; border: 1px solid #7f9db9;"
                     value="${this.escapeHtml(valTo)}"
                     placeholder="Конец"
                     title="Конец периода"
                     onclick="event.stopPropagation()"
                     onfocus="C1FilterComponent.selectFilterCritRow(${idx})"
                     oninput="C1FilterComponent.onFilterIntervalInput(${idx}, 'to', this)"
                     onblur="C1FilterComponent.onFilterIntervalBlur(${idx}, 'to', this)"
                     onkeydown="C1FilterComponent.onFilterIntervalKeydown(${idx}, 'to', this, event)">
              <button type="button" class="btn-1c filter-btn-pick"
                      style="height: 21px; width: 22px; padding: 0 4px; font-size: 11px; font-weight: bold; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; background: #ece9d8; border: 1px solid #7f9db9; color: #111111;"
                      onclick="event.stopPropagation(); C1FilterComponent.openFilterFieldPicker(${idx})"
                      title="Выбрать период (...)">
                ...
              </button>
            </div>
          `;
        } else {
          const isDate = (crit.fieldKey === "date");
          const showPickBtn = isDate || (crit.fieldKey !== "number");
          const placeholder = isDate ? "ДД.ММ.ГГГГ ЧЧ:ММ:СС" : "Значение отбора";

          valueInputHtml = `
            <div style="display: flex; align-items: center; width: 100%; position: relative;">
              <input type="text" id="ujFilterValInput_${idx}" class="input-1c ${isDate ? 'uj-filter-date' : ''}" ${structAttr}
                     style="flex: 1; min-width: 0; height: 21px; font-size: 11px; padding: 1px 4px; outline: none; background: #ffffff !important; color: #111111 !important; border: 1px solid #7f9db9;"
                     value="${this.escapeHtml(crit.value !== undefined ? crit.value : '')}"
                     placeholder="${placeholder}"
                     autocomplete="off"
                     onclick="event.stopPropagation()"
                     onfocus="C1FilterComponent.selectFilterCritRow(${idx})"
                     oninput="C1FilterComponent.onFilterValueInput(${idx}, this, event)"
                     onblur="C1FilterComponent.onFilterSingleBlur(${idx}, this)"
                     onkeydown="C1FilterComponent.onFilterInputKeydown(${idx}, this, event)">
              ${showPickBtn ? `
                <button type="button" class="btn-1c filter-btn-pick" 
                        style="height: 21px; width: 22px; padding: 0 4px; font-size: 11px; font-weight: bold; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; background: #ece9d8; border: 1px solid #7f9db9; color: #111111;"
                        onclick="event.stopPropagation(); C1FilterComponent.openFilterFieldPicker(${idx})"
                        title="Выбрать значение (...)">
                  ...
                </button>
              ` : ''}
            </div>
          `;
        }
      }

      rowsHtml += `
        <tr id="ujCritRow_${idx}" style="background: ${bg}; height: 25px;" onclick="C1FilterComponent.selectFilterCritRow(${idx})">
          <td style="width: 28px; text-align: center; border: 1px solid #d4d0c8;">
            <input type="checkbox" id="ujCritEnabled_${idx}" ${isChecked ? 'checked' : ''}
                   onclick="event.stopPropagation(); C1FilterComponent.toggleFilterCritEnabled(${idx}, this.checked)"
                   style="cursor: pointer; vertical-align: middle;">
          </td>
          <td style="padding: 1px 4px; border: 1px solid #d4d0c8; width: 170px;">
            <div style="display: flex; align-items: center; width: 100%; height: 21px; background: #ffffff; border: 1px solid #7f9db9; padding: 0 1px; box-sizing: border-box;">
              <span style="flex: 1; min-width: 0; padding: 0 4px; font-size: 11px; color: #111111; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; user-select: none; cursor: pointer;"
                    onclick="C1FilterComponent.openFieldSelectModal(${idx})"
                    ondblclick="C1FilterComponent.openFieldSelectModal(${idx})"
                    title="Нажмите для выбора поля (${this.escapeHtml(fieldObj.label)})">
                ${this.escapeHtml(fieldObj.label)}
              </span>
              <button type="button" class="btn-1c filter-field-btn-pick"
                      onclick="event.stopPropagation(); C1FilterComponent.openFieldSelectModal(${idx})"
                      title="Выбрать поле (...)"
                      style="width: 20px; height: 19px; padding: 0; margin: 0; font-size: 11px; font-weight: bold; background: #ece9d8; border: 1px solid #7f9db9; border-radius: 1px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; color: #111111;">
                ...
              </button>
            </div>
          </td>
          <td style="padding: 1px 4px; border: 1px solid #d4d0c8; width: 140px;">
            <div id="ujCritOpBtn_${idx}" class="btn-1c uj-crit-op-btn"
                 onclick="event.stopPropagation(); C1FilterComponent.toggleOpDropdown(${idx}, this)"
                 style="width: 100%; height: 21px; background: #ffffff !important; border: 1px solid #7f9db9; padding: 0 4px; display: flex; align-items: center; justify-content: space-between; font-size: 11px; color: #111111 !important; cursor: pointer; box-sizing: border-box; user-select: none;"
                 title="Вид сравнения: ${this.escapeHtml(crit.operator || 'Равно')}">
              <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; text-align: left;">${this.escapeHtml(crit.operator || "Равно")}</span>
              <span style="font-size: 8px; color: #555; margin-left: 3px; flex-shrink: 0;">▼</span>
            </div>
          </td>
          <td style="padding: 1px 4px; border: 1px solid #d4d0c8;">
            ${valueInputHtml}
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = rowsHtml;
    this.updateHeaderCheckAllState();

    setTimeout(() => {
      if (window.PeriodPicker && typeof PeriodPicker.attachSegmentSelection === "function") {
        tbody.querySelectorAll("input.uj-filter-from, input.uj-filter-to, input.uj-filter-date").forEach(inp => {
          PeriodPicker.attachSegmentSelection(inp);
        });
      }
    }, 15);
  },

  // ========================================================
  // 1C Kompakt və Sürüşən (Scrollable) "Вид сравнения" Dropdown
  // ========================================================
  _activeOpDropdownIdx: null,
  _opDropdownDocClickBound: false,

  toggleOpDropdown: function(idx, triggerEl) {
    if (this._activeOpDropdownIdx === idx) {
      this.closeOpDropdown();
      return;
    }
    this.openOpDropdown(idx, triggerEl);
  },

  openOpDropdown: function(idx, triggerEl) {
    this.closeOpDropdown();
    const crit = this.tempFilterCriteria[idx];
    if (!crit) return;

    const avail = this.availableFields;
    const fieldObj = avail.find(f => f.key === crit.fieldKey) || { type: "text" };
    const isBoolField = (fieldObj.type === "boolean");
    const boolOps = ["Равно", "Не равно", "Заполнено", "Не заполнено"];
    const opList = isBoolField ? boolOps : this.filterOperators;

    let popup = document.getElementById("ujOpDropdownPopup");
    if (!popup) {
      popup = document.createElement("div");
      popup.id = "ujOpDropdownPopup";
      popup.style.position = "fixed";
      popup.style.zIndex = "10005";
      popup.style.background = "#ffffff";
      popup.style.border = "1px solid #7f9db9";
      popup.style.boxShadow = "0 4px 12px rgba(0,0,0,0.28)";
      popup.style.fontFamily = "Tahoma, 'MS Sans Serif', Arial, sans-serif";
      popup.style.fontSize = "11px";
      popup.style.maxHeight = "155px"; // 6-7 element görünür, qalanları aşağı sürüşür (scroll)
      popup.style.overflowY = "auto";
      popup.style.overflowX = "hidden";
      popup.style.boxSizing = "border-box";
      document.body.appendChild(popup);
    }

    const rect = triggerEl.getBoundingClientRect();
    const popWidth = Math.max(rect.width, 160);
    popup.style.width = popWidth + "px";
    popup.style.left = rect.left + "px";

    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < 165 && rect.top > 165) {
      popup.style.top = "";
      popup.style.bottom = (window.innerHeight - rect.top) + "px";
    } else {
      popup.style.bottom = "";
      popup.style.top = (rect.bottom + 1) + "px";
    }

    let itemsHtml = opList.map(op => {
      const isCur = (op === crit.operator);
      const bg = isCur ? "#d9e8fb" : "#ffffff";
      const fg = isCur ? "#002060" : "#111111";
      const fw = isCur ? "bold" : "normal";
      return `
        <div class="uj-op-item" data-op="${this.escapeHtml(op)}"
             style="height: 22px; padding: 2px 8px; display: flex; align-items: center; justify-content: space-between; cursor: pointer; user-select: none; background: ${bg}; color: ${fg}; font-weight: ${fw}; border-bottom: 1px solid #f0eee3; font-size: 11px; box-sizing: border-box;"
             onmouseover="this.style.background='#316ac5'; this.style.color='#ffffff';"
             onmouseout="this.style.background='${bg}'; this.style.color='${fg}';"
             onclick="event.stopPropagation(); C1FilterComponent.selectOpDropdownItem(${idx}, '${this.escapeHtml(op)}')">
          <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${this.escapeHtml(op)}</span>
          ${isCur ? '<span style="font-size: 10px; margin-left: 4px; color: #002060; font-weight: bold;">✓</span>' : ''}
        </div>
      `;
    }).join("");

    popup.innerHTML = itemsHtml;
    popup.style.display = "block";
    this._activeOpDropdownIdx = idx;

    setTimeout(() => {
      const curItem = popup.querySelector(`[data-op='${crit.operator}']`);
      if (curItem) curItem.scrollIntoView({ block: "nearest" });
    }, 10);

    if (!this._opDropdownDocClickBound) {
      this._opDropdownDocClickBound = true;
      document.addEventListener("click", (e) => {
        if (!e.target.closest("#ujOpDropdownPopup") && !e.target.closest(".uj-crit-op-btn")) {
          this.closeOpDropdown();
        }
      });
      window.addEventListener("keydown", (e) => {
        if (e.key === "Escape") this.closeOpDropdown();
      });
    }
  },

  selectOpDropdownItem: function(idx, op) {
    this.closeOpDropdown();
    this.onFilterCritOpChange(idx, op);
  },

  closeOpDropdown: function() {
    const popup = document.getElementById("ujOpDropdownPopup");
    if (popup) popup.style.display = "none";
    this._activeOpDropdownIdx = null;
  },

  onFilterCritOpChange: function(idx, newOp) {
    if (this.tempFilterCriteria[idx]) {
      const crit = this.tempFilterCriteria[idx];
      crit.operator = newOp;
      if (newOp.startsWith("Интервал")) {
        if (!crit.valueFrom && !crit.valueTo && crit.value) {
          const parts = String(crit.value).split(/\s*(?:\.\.\.|—|-)\s*/);
          crit.valueFrom = parts[0] || "";
          crit.valueTo = parts[1] || "";
        }
      }
      if (newOp === "Заполнено" || newOp === "Не заполнено" || (crit.value && String(crit.value).trim().length > 0)) {
        crit.enabled = true;
      }
      this.renderFilterCriteriaRows();
      this.syncTempFiltersToStorage();
    }
  },

  // ==========================================
  // Inputs & Autocomplete Handlers
  // ==========================================
  onFilterValueInput: function(idx, inputEl, event) {
    if (this.tempFilterCriteria[idx]) {
      const crit = this.tempFilterCriteria[idx];
      if (crit.fieldKey === "date" || inputEl.classList.contains("uj-filter-date")) {
        inputEl.value = inputEl.value.replace(/[^0-9.:\s\/\-,]/g, "");
      }
      crit.value = inputEl.value;
      if (inputEl.value.trim().length > 0) {
        this.setCritEnabled(idx, true);
      }
      this.syncTempFiltersToStorage();
    }
    this.showFilterAutocomplete(idx, inputEl);
  },

  onFilterSingleBlur: function(idx, inputEl) {
    const crit = this.tempFilterCriteria[idx];
    if (!crit) return;
    const val = inputEl.value.trim();
    if (val) {
      this.setCritEnabled(idx, true);
    }
    if (crit.fieldKey === "date" && val && window.PeriodPicker && typeof PeriodPicker.autoCompleteDate === "function") {
      inputEl.value = PeriodPicker.autoCompleteDate(val, "00:00:00");
      crit.value = inputEl.value;
    }
    this.syncTempFiltersToStorage();
  },

  onFilterIntervalInput: function(idx, which, inputEl) {
    const crit = this.tempFilterCriteria[idx];
    if (!crit) return;
    if (crit.fieldKey === "date") {
      inputEl.value = inputEl.value.replace(/[^0-9.:\s\/\-,]/g, "");
    }
    if (which === "from") crit.valueFrom = inputEl.value;
    else crit.valueTo = inputEl.value;
    const vFrom = crit.valueFrom || "";
    const vTo = crit.valueTo || "";
    crit.value = (vFrom || vTo) ? `${vFrom} ... ${vTo}` : "";
    if ((vFrom || vTo).trim().length > 0) {
      this.setCritEnabled(idx, true);
    }
    this.syncTempFiltersToStorage();
  },

  onFilterIntervalBlur: function(idx, which, inputEl) {
    const crit = this.tempFilterCriteria[idx];
    if (!crit) return;
    const val = inputEl.value.trim();
    if (val && window.PeriodPicker && typeof PeriodPicker.autoCompleteDate === "function") {
      const defTime = (which === "to") ? "23:59:59" : "00:00:00";
      inputEl.value = PeriodPicker.autoCompleteDate(val, defTime);
      if (which === "from") crit.valueFrom = inputEl.value;
      else crit.valueTo = inputEl.value;
    }
    this.validateFilterInterval(idx, which);
    const vFrom = crit.valueFrom || "";
    const vTo = crit.valueTo || "";
    crit.value = (vFrom || vTo) ? `${vFrom} ... ${vTo}` : "";
    if ((vFrom || vTo).trim().length > 0) {
      this.setCritEnabled(idx, true);
    }
    this.syncTempFiltersToStorage();
  },

  onFilterIntervalKeydown: function(idx, which, inputEl, event) {
    const crit = this.tempFilterCriteria[idx];
    const isDateField = crit && (crit.fieldKey === "date");

    if (isDateField) {
      if ([
        "Backspace", "Delete", "Tab", "Enter", "Escape", 
        "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", 
        "Home", "End", "F4"
      ].includes(event.key)) {
        // icazə ver
      } else if (event.ctrlKey || event.metaKey) {
        // icazə ver
      } else if (event.key === "." || event.key === ":" || event.key === " ") {
        // icazə ver
      } else if (!/^\d$/.test(event.key)) {
        event.preventDefault();
        return;
      }
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const val = inputEl.value.trim();
      if (val && window.PeriodPicker && typeof PeriodPicker.autoCompleteDate === "function") {
        const defTime = (which === "to") ? "23:59:59" : "00:00:00";
        inputEl.value = PeriodPicker.autoCompleteDate(val, defTime);
        if (crit) {
          if (which === "from") crit.valueFrom = inputEl.value;
          else crit.valueTo = inputEl.value;
        }
      }
      this.validateFilterInterval(idx, which);
      if (crit) {
        const vFrom = crit.valueFrom || "";
        const vTo = crit.valueTo || "";
        crit.value = (vFrom || vTo) ? `${vFrom} ... ${vTo}` : "";
      }

      if (which === "from") {
        const toEl = document.getElementById(`ujFilterValInput_${idx}_to`);
        if (toEl) {
          toEl.focus();
          if (toEl.setSelectionRange) toEl.setSelectionRange(0, 2);
        }
      } else {
        inputEl.blur();
      }
    }
  },

  validateFilterInterval: function(idx, which) {
    const crit = this.tempFilterCriteria[idx];
    if (!crit) return;
    const fromEl = document.getElementById(`ujFilterValInput_${idx}_from`);
    const toEl = document.getElementById(`ujFilterValInput_${idx}_to`);
    const sFrom = fromEl ? fromEl.value.trim() : (crit.valueFrom || "");
    const sTo = toEl ? toEl.value.trim() : (crit.valueTo || "");
    if (!sFrom || !sTo) return;

    if (window.PeriodPicker && typeof PeriodPicker.parseDateObj === "function") {
      const dtFrom = PeriodPicker.parseDateObj(sFrom, false);
      const dtTo = PeriodPicker.parseDateObj(sTo, true);
      if (dtFrom && dtTo && dtFrom.getTime() > dtTo.getTime()) {
        if (which === "from") {
          const d = String(dtFrom.getDate()).padStart(2, "0");
          const m = String(dtFrom.getMonth() + 1).padStart(2, "0");
          const y = dtFrom.getFullYear();
          const syncedTo = `${d}.${m}.${y} 23:59:59`;
          crit.valueTo = syncedTo;
          if (toEl) toEl.value = syncedTo;
        } else if (which === "to") {
          const d = String(dtTo.getDate()).padStart(2, "0");
          const m = String(dtTo.getMonth() + 1).padStart(2, "0");
          const y = dtTo.getFullYear();
          const syncedFrom = `${d}.${m}.${y} 00:00:00`;
          crit.valueFrom = syncedFrom;
          if (fromEl) fromEl.value = syncedFrom;
        }
      }
    }
  },

  onFilterInputKeydown: function(idx, inputEl, event) {
    const crit = this.tempFilterCriteria[idx];
    const isDateField = crit && (crit.fieldKey === "date");

    if (isDateField) {
      if ([
        "Backspace", "Delete", "Tab", "Enter", "Escape", 
        "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", 
        "Home", "End", "F4"
      ].includes(event.key)) {
        // icazə ver
      } else if (event.ctrlKey || event.metaKey) {
        // icazə ver
      } else if (event.key === "." || event.key === ":" || event.key === " ") {
        // icazə ver
      } else if (!/^\d$/.test(event.key)) {
        event.preventDefault();
        return;
      }
    }

    const popup = document.getElementById("ujFilterAutocompletePopup");
    if (!popup || popup.style.display !== "block") {
      if (event.key === "Enter") {
        event.preventDefault();
        const val = inputEl.value.trim();
        if (crit && crit.fieldKey === "date" && val && window.PeriodPicker && typeof PeriodPicker.autoCompleteDate === "function") {
          inputEl.value = PeriodPicker.autoCompleteDate(val, "00:00:00");
          crit.value = inputEl.value;
        }
        inputEl.blur();
        return;
      }
      if (event.key === "ArrowDown" || event.key === "F4") {
        event.preventDefault();
        this.showFilterAutocomplete(idx, inputEl);
      }
      return;
    }

    const items = popup.querySelectorAll(".uj-auto-item");
    if (items.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      this.activeSuggestionIdx = Math.min(this.activeSuggestionIdx + 1, items.length - 1);
      this.highlightActiveSuggestion(items);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      this.activeSuggestionIdx = Math.max(this.activeSuggestionIdx - 1, 0);
      this.highlightActiveSuggestion(items);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (this.activeSuggestionIdx >= 0 && items[this.activeSuggestionIdx]) {
        const val = items[this.activeSuggestionIdx].getAttribute("data-val");
        this.selectAutocompleteSuggestion(idx, val);
      } else {
        this.hideFilterAutocomplete();
      }
    } else if (event.key === "Escape") {
      this.hideFilterAutocomplete();
    }
  },

  activeAutocompleteIdx: -1,
  activeSuggestionIdx: -1,

  showFilterAutocomplete: function(idx, inputEl) {
    const crit = this.tempFilterCriteria[idx];
    if (!crit) return;
    if (crit.operator === "Заполнено" || crit.operator === "Не заполнено") {
      this.hideFilterAutocomplete();
      return;
    }

    const curVal = inputEl.value || "";
    let searchTerm = curVal.trim().toLowerCase();
    const isListOp = (crit.operator === "В группе из списка" || crit.operator === "В списке" || crit.operator === "Не в списке");
    if (isListOp && searchTerm.includes(";")) {
      const parts = searchTerm.split(";");
      searchTerm = parts[parts.length - 1].trim();
    }

    if (!searchTerm || searchTerm.length < 1) {
      this.hideFilterAutocomplete();
      return;
    }

    let catalog = null;
    if (crit.fieldKey === "contract_price_type") catalog = "ТипыЦенНоменклатуры";
    else if (crit.fieldKey === "contract") catalog = "ДоговорыКонтрагентов";
    else if (crit.fieldKey === "kontragent" || crit.fieldKey === "kontragent_code") catalog = "Контрагенты";
    else if (crit.fieldKey === "warehouse") catalog = "Склады";
    else if (crit.fieldKey === "responsible") catalog = "Пользователи";
    else if (crit.fieldKey === "pogruzka_voditel") catalog = "Водители";
    else if (crit.fieldKey === "portfolio") catalog = "Портфели";
    else if (crit.fieldKey === "nomenclature") catalog = "Номенклатура";

    const itemsList = (Array.isArray(this.items) && this.items.length > 0)
      ? this.items
      : ((typeof UniversalJournal !== "undefined" && Array.isArray(UniversalJournal.items)) ? UniversalJournal.items : []);

    let filtered = [];

    if (crit.fieldKey === "nomenclature") {
      const foundMap = new Map();
      itemsList.forEach(it => {
        (it.nom_keys || []).forEach((k, i) => {
          const parts = String(k).split("|");
          const code = parts[0] || "";
          const cleanCode = parts[1] || code.replace(/^0+/, "");
          const art = parts[2] || "";
          const name = parts[3] || (it.nomenclatures || [])[i] || parts[0] || "";
          if (String(k).toLowerCase().includes(searchTerm) || 
              code.toLowerCase().includes(searchTerm) || 
              cleanCode.toLowerCase().includes(searchTerm) || 
              name.toLowerCase().includes(searchTerm) || 
              art.toLowerCase().includes(searchTerm)) {
            const displayLabel = cleanCode ? `[${cleanCode}] ${name}` : name;
            foundMap.set(displayLabel, name);
          }
        });
      });
      if (foundMap.size > 0) {
        filtered = Array.from(foundMap.keys()).sort((a, b) => a.localeCompare(b, "ru"));
      } else {
        const values = this.getDistinctFieldValues(crit.fieldKey);
        filtered = (values || []).filter(v => v.toLowerCase().includes(searchTerm));
      }
    } else if (crit.fieldKey === "vms_status") {
      const statuses = ["Подтвержден WMS", "Выгружен", "Новый", "В обработке", "Готов к отгрузке", "Отменен"];
      filtered = statuses.filter(s => s.toLowerCase().includes(searchTerm));
    } else {
      const values = this.getDistinctFieldValues(crit.fieldKey);
      filtered = (values || []).filter(v => v.toLowerCase().includes(searchTerm));
    }

    if (filtered.length > 0) {
      this.renderFilterAutocompletePopup(idx, inputEl, filtered);
    }

    // Canlı 1C kataloq sorğusu (istifadəçi >= 2 simvol yazdıqda)
    if (catalog && searchTerm.length >= 2) {
      clearTimeout(this._filterAutoLiveTimer);
      this._filterAutoLiveTimer = setTimeout(async () => {
        try {
          const creds = (typeof SessionManager !== "undefined") ? SessionManager.getCredentials() : {};
          const res = await fetch("/api/catalog_data", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...creds,
              catalog: catalog,
              search: searchTerm
            })
          });
          const data = await res.json();
          if (data && data.success && Array.isArray(data.items) && data.items.length > 0) {
            const mergedMap = new Map();
            filtered.forEach(f => mergedMap.set(f, f));
            data.items.forEach(it => {
              const label = it.code ? `[${it.code}] ${it.name}` : it.name;
              mergedMap.set(label, it.name);
            });
            const mergedList = Array.from(mergedMap.keys());
            this.renderFilterAutocompletePopup(idx, inputEl, mergedList);
          }
        } catch (e) {
          console.warn("Live autocomplete error:", e);
        }
      }, 160);
    } else if (filtered.length === 0) {
      this.hideFilterAutocomplete();
    }
  },

  getDistinctFieldValues: function(fieldKey) {
    const set = new Set();
    (this.items || []).forEach(item => {
      const v = item[fieldKey];
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        set.add(String(v).trim());
      }
    });
    if (fieldKey === "vms_status") {
      ["Выгружен", "Подтвержден WMS", "Новый", "В обработке", "Готов к отгрузке", "Отменен"].forEach(s => set.add(s));
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ru"));
  },

  renderFilterAutocompletePopup: function(idx, inputEl, filtered) {
    const popup = document.getElementById("ujFilterAutocompletePopup");
    const container = document.getElementById("ujFilterTableContainer");
    if (!popup || !inputEl) return;

    let itemsHtml = `<div style="padding: 2px 6px; background: #e5e2cf; border-bottom: 1px solid #b0af9f; font-size: 10px; color: #555; font-weight: bold;">Найдено: ${filtered.length}</div>`;
    filtered.slice(0, 50).forEach((itemVal) => {
      const escaped = this.escapeHtml(itemVal);
      itemsHtml += `
        <div class="uj-auto-item" data-val="${escaped}"
             style="padding: 3px 8px; cursor: pointer; user-select: none; border-bottom: 1px dotted #eee; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #111111 !important; background: #ffffff !important;"
             onmouseover="this.style.background='#316ac5'; this.style.color='#ffffff';"
             onmouseout="this.style.background='#ffffff'; this.style.color='#111111';"
             onmousedown="event.preventDefault(); (window.C1FilterComponent || UniversalJournal).selectAutocompleteSuggestion(${idx}, '${escaped}');">
          ${escaped}
        </div>
      `;
    });
    popup.innerHTML = itemsHtml;

    const inputRect = inputEl.getBoundingClientRect();
    const parentRect = popup.offsetParent ? popup.offsetParent.getBoundingClientRect() : (container ? container.getBoundingClientRect() : document.body.getBoundingClientRect());
    popup.style.top = (inputRect.bottom - parentRect.top) + "px";
    popup.style.left = (inputRect.left - parentRect.left) + "px";
    popup.style.width = Math.max(inputRect.width, 280) + "px";
    popup.style.display = "block";
    this.activeAutocompleteIdx = idx;
    this.activeSuggestionIdx = -1;
  },

  selectAutocompleteSuggestion: function(idx, val) {
    const inputEl = document.getElementById(`ujFilterValInput_${idx}`);
    const crit = this.tempFilterCriteria[idx];
    if (!crit) return;

    const cleanVal = val.replace(/^\[[^\]]+\]\s*/, "");
    const isListOp = (crit.operator === "В группе из списка" || crit.operator === "В списке");
    if (isListOp && inputEl && inputEl.value.includes(";")) {
      const parts = inputEl.value.split(";").map(s => s.trim()).filter(Boolean);
      parts.pop();
      parts.push(cleanVal);
      const combined = parts.join("; ") + "; ";
      crit.value = combined;
      if (inputEl) inputEl.value = combined;
    } else {
      crit.value = cleanVal;
      if (inputEl) inputEl.value = cleanVal;
    }

    this.setCritEnabled(idx, true);
    this.hideFilterAutocomplete();
    if (inputEl) inputEl.focus();
  },

  hideFilterAutocomplete: function() {
    const popup = document.getElementById("ujFilterAutocompletePopup");
    if (popup) popup.style.display = "none";
    this.activeAutocompleteIdx = -1;
    this.activeSuggestionIdx = -1;
  },

  highlightActiveSuggestion: function(items) {
    items.forEach((item, i) => {
      const isSel = (i === this.activeSuggestionIdx);
      item.style.background = isSel ? "#316ac5" : "#ffffff";
      item.style.color = isSel ? "#ffffff" : "#111111";
      if (isSel) {
        item.scrollIntoView({ block: "nearest" });
      }
    });
  },

  // ==========================================
  // Catalog & Modal Pickers Engine (...)
  // ==========================================
  openFilterFieldPicker: function(idx) {
    const crit = this.tempFilterCriteria[idx];
    if (!crit) return;
    const inputEl = document.getElementById(`ujFilterValInput_${idx}`) || document.getElementById(`ujFilterValInput_${idx}_from`);

    this.selectFilterCritRow(idx);
    this.hideFilterAutocomplete();

    const op = crit.operator || "Равно";
    const isInterval = op.startsWith("Интервал");

    if (crit.fieldKey === "date" || isInterval) {
      if (window.PeriodPicker && typeof PeriodPicker.open === "function") {
        let sStart = crit.valueFrom || "";
        let sEnd = crit.valueTo || "";
        if (!sStart && !sEnd) {
          const curVal = (inputEl ? inputEl.value : (crit.value || "")) || "";
          if (curVal.includes("...") || curVal.includes("—") || curVal.includes("-")) {
            const parts = curVal.split(/\s*(?:\.\.\.|—|-)\s*/);
            sStart = parts[0] || "";
            sEnd = parts[1] || "";
          } else {
            sStart = curVal;
            sEnd = curVal;
          }
        }
        PeriodPicker.open({
          startDate: sStart,
          endDate: sEnd,
          onSelect: (st, en) => {
            if (isInterval) {
              crit.valueFrom = st;
              crit.valueTo = en;
              crit.value = (st && en) ? `${st} ... ${en}` : (st || en || "");
              const fromEl = document.getElementById(`ujFilterValInput_${idx}_from`);
              const toEl = document.getElementById(`ujFilterValInput_${idx}_to`);
              if (fromEl) fromEl.value = st;
              if (toEl) toEl.value = en;
            } else {
              const res = st || en || "";
              if (inputEl) inputEl.value = res;
              crit.value = res;
            }
            if (st || en || crit.value) {
              this.setCritEnabled(idx, true);
            }
          }
        });
        return;
      }
    }

    const isMulti = (op === "В группе из списка" || op === "В списке" || op === "Не в списке");
    let catalog = null;
    if (crit.fieldKey === "contract_price_type") catalog = "ТипыЦенНоменклатуры";
    else if (crit.fieldKey === "contract") catalog = "ДоговорыКонтрагентов";
    else if (crit.fieldKey === "kontragent" || crit.fieldKey === "kontragent_code" || crit.fieldKey === "golovnoy_kontragent" || crit.fieldKey === "golovnoy_kontragent_code") catalog = "Контрагенты";
    else if (crit.fieldKey === "agent") catalog = "Агенты";
    else if (crit.fieldKey === "warehouse") catalog = "Склады";
    else if (crit.fieldKey === "responsible") catalog = "Пользователи";
    else if (crit.fieldKey === "pogruzka_voditel") catalog = "Водители";
    else if (crit.fieldKey === "portfolio") catalog = "Портфели";
    else if (crit.fieldKey === "nomenclature") catalog = "Номенклатура";

    if (catalog) {
      if (isMulti) {
        if (window.ValueListModal && typeof ValueListModal.open === "function") {
          ValueListModal.open({
            targetInput: inputEl,
            catalog: catalog,
            structuredFilter: crit.structuredFilter,
            onApply: (data) => {
              crit.value = (data && data.displayStr) ? data.displayStr : (inputEl ? inputEl.value : "");
              crit.structuredFilter = data;
              if (inputEl) {
                inputEl.value = crit.value;
                inputEl.dataset.structuredList = JSON.stringify(data);
              }
              this.setCritEnabled(idx, true);
            }
          });
        }
      } else {
        if (window.OneCCatalogPicker && typeof OneCCatalogPicker.open === "function") {
          OneCCatalogPicker.open(catalog, inputEl, {
            onSelect: (selectedItem, valStr) => {
              if (selectedItem) {
                const name = valStr || selectedItem.name || selectedItem.Наименование || "";
                if (inputEl) inputEl.value = name;
                crit.value = name;
                this.setCritEnabled(idx, true);
              }
            }
          });
        } else if (window.CatalogSelector && typeof CatalogSelector.open === "function") {
          CatalogSelector.open({
            catalog: catalog,
            targetInput: inputEl,
            multiSelect: false,
            onSelect: (selectedItem) => {
              if (selectedItem) {
                const name = selectedItem.name || selectedItem.Наименование || "";
                if (inputEl) inputEl.value = name;
                crit.value = name;
                this.setCritEnabled(idx, true);
              }
            }
          });
        }
      }
      return;
    }

    if (crit.fieldKey === "vms_status") {
      if (isMulti && window.ValueListModal) {
        ValueListModal.open({
          targetInput: inputEl,
          catalog: "Статусы ВМС",
          structuredFilter: crit.structuredFilter,
          onApply: (data) => {
            crit.value = (data && data.displayStr) ? data.displayStr : (inputEl ? inputEl.value : "");
            crit.structuredFilter = data;
            if (inputEl) {
              inputEl.value = crit.value;
              inputEl.dataset.structuredList = JSON.stringify(data);
            }
            this.setCritEnabled(idx, true);
          }
        });
      } else {
        const statuses = ["Подтвержден WMS", "Выгружен", "Новый", "В обработке", "Готов к отгрузке", "Отменен"];
        const cur = inputEl.value || "";
        const nextIdx = (statuses.indexOf(cur) + 1) % statuses.length;
        inputEl.value = statuses[nextIdx];
        crit.value = statuses[nextIdx];
        this.setCritEnabled(idx, true);
      }
      return;
    }

    if (isMulti && window.ValueListModal) {
      ValueListModal.open({
        targetInput: inputEl,
        catalog: crit.fieldLabel || crit.fieldKey,
        structuredFilter: crit.structuredFilter,
        onApply: (data) => {
          crit.value = (data && data.displayStr) ? data.displayStr : (inputEl ? inputEl.value : "");
          crit.structuredFilter = data;
          if (inputEl) {
            inputEl.value = crit.value;
            inputEl.dataset.structuredList = JSON.stringify(data);
          }
          this.setCritEnabled(idx, true);
        }
      });
    }
  },

  // Field Select Modal Picker
  fieldSelectTargetIdx: null,
  fieldSelectCurrentKey: null,

  openFieldSelectModal: function(idx) {
    this.fieldSelectTargetIdx = idx;
    const crit = this.tempFilterCriteria[idx];
    this.fieldSelectCurrentKey = crit ? crit.fieldKey : "";
    this.renderFieldSelectModalList(this.fieldSelectCurrentKey, "");

    const modal = document.getElementById("ujFieldSelectModalOverlay");
    if (modal) {
      modal.style.display = "flex";
      modal.classList.add("active");
      const searchInp = document.getElementById("ujFieldSelectSearchInput");
      if (searchInp) {
        searchInp.value = "";
        setTimeout(() => searchInp.focus(), 50);
      }
    }
  },

  closeFieldSelectModal: function() {
    const modal = document.getElementById("ujFieldSelectModalOverlay");
    if (modal) {
      modal.classList.remove("active");
      modal.style.display = "none";
    }
  },

  renderFieldSelectModalList: function(selectedKey, query) {
    const listEl = document.getElementById("ujFieldSelectModalList");
    if (!listEl) return;

    let availFields = this.availableFields;
    if (query && query.trim()) {
      const q = query.trim().toLowerCase();
      availFields = availFields.filter(f => f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q));
    }

    if (availFields.length === 0) {
      listEl.innerHTML = `<div style="padding: 20px; text-align: center; color: #888; font-style: italic;">Поле не найдено</div>`;
      return;
    }

    let html = "";
    availFields.forEach(f => {
      const isSel = (f.key === selectedKey);
      const bg = isSel ? "#316ac5" : "#ffffff";
      const fg = isSel ? "#ffffff" : "#111111";
      html += `
        <div id="ujFmItem_${f.key}" data-key="${f.key}"
             style="padding: 3px 8px; font-size: 11px; background: ${bg}; color: ${fg}; cursor: pointer; user-select: none; display: flex; align-items: center; gap: 6px; border-bottom: 1px dotted #e0dec8;"
             onclick="C1FilterComponent.selectFieldModalItem('${f.key}')"
             ondblclick="C1FilterComponent.confirmModalFieldSelection('${f.key}')">
          <span style="font-size: 10px; color: ${isSel ? '#ffffff' : '#4a78c4'};">▬</span>
          <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: ${isSel ? 'bold' : 'normal'};">${this.escapeHtml(f.label)}</span>
        </div>
      `;
    });
    listEl.innerHTML = html;

    const activeEl = listEl.querySelector(`[id='ujFmItem_${selectedKey}']`);
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest" });
    }
  },

  filterFieldSelectModalList: function(query) {
    this.renderFieldSelectModalList(this.fieldSelectCurrentKey, query);
  },

  selectFieldModalItem: function(key) {
    this.fieldSelectCurrentKey = key;
    const listEl = document.getElementById("ujFieldSelectModalList");
    if (listEl) {
      listEl.querySelectorAll("[id^='ujFmItem_']").forEach(el => {
        const isSel = (el.getAttribute("data-key") === key);
        el.style.background = isSel ? "#316ac5" : "#ffffff";
        el.style.color = isSel ? "#ffffff" : "#111111";
        const icon = el.querySelector("span");
        if (icon) icon.style.color = isSel ? "#ffffff" : "#4a78c4";
        const txt = el.querySelector("span:last-child");
        if (txt) txt.style.fontWeight = isSel ? "bold" : "normal";
      });
    }
  },

  confirmModalFieldSelection: function(keyParam) {
    const key = keyParam || this.fieldSelectCurrentKey;
    if (!key || this.fieldSelectTargetIdx === null) return;
    this.onFilterCritFieldChange(this.fieldSelectTargetIdx, key);
    this.closeFieldSelectModal();
  },

  onFilterCritFieldChange: function(idx, newKey) {
    const crit = this.tempFilterCriteria[idx];
    if (!crit) return;
    const avail = this.availableFields;
    const fieldObj = avail.find(f => f.key === newKey) || { key: newKey, label: newKey, type: "text" };
    crit.fieldKey = fieldObj.key;
    crit.fieldLabel = fieldObj.label;
    if (fieldObj.type === "boolean") crit.value = "Да";
    else if (fieldObj.key === "vms_status") crit.value = "Подтвержден WMS";
    else crit.value = "";
    this.renderFilterCriteriaRows();
    this.syncTempFiltersToStorage();
  },

  onFieldSelectSearchKeydown: function(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      this.confirmModalFieldSelection();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const listEl = document.getElementById("ujFieldSelectModalList");
      if (!listEl) return;
      const items = Array.from(listEl.querySelectorAll("[id^='ujFmItem_']"));
      if (items.length === 0) return;
      let curIdx = items.findIndex(el => el.getAttribute("data-key") === this.fieldSelectCurrentKey);
      if (e.key === "ArrowDown") {
        curIdx = (curIdx + 1) < items.length ? curIdx + 1 : 0;
      } else {
        curIdx = (curIdx - 1) >= 0 ? curIdx - 1 : items.length - 1;
      }
      const nextKey = items[curIdx].getAttribute("data-key");
      this.selectFieldModalItem(nextKey);
      items[curIdx].scrollIntoView({ block: "nearest" });
    }
  },

  // ==========================================
  // Finish & Apply Filter Editing
  // ==========================================
  finishFilterEditing: function() {
    this.hideFilterAutocomplete();

    for (let idx = 0; idx < this.tempFilterCriteria.length; idx++) {
      const crit = this.tempFilterCriteria[idx];
      if (!crit) continue;
      const isInterval = crit.operator && crit.operator.startsWith("Интервал");

      if (isInterval) {
        const fromEl = document.getElementById(`ujFilterValInput_${idx}_from`);
        const toEl = document.getElementById(`ujFilterValInput_${idx}_to`);

        if (fromEl) {
          fromEl.style.border = "1px solid #7f9db9";
          if (fromEl.value.trim() && window.PeriodPicker && typeof PeriodPicker.autoCompleteDate === "function") {
            fromEl.value = PeriodPicker.autoCompleteDate(fromEl.value.trim(), "00:00:00");
          }
          crit.valueFrom = fromEl.value.trim();
        }
        if (toEl) {
          toEl.style.border = "1px solid #7f9db9";
          if (toEl.value.trim() && window.PeriodPicker && typeof PeriodPicker.autoCompleteDate === "function") {
            toEl.value = PeriodPicker.autoCompleteDate(toEl.value.trim(), "23:59:59");
          }
          crit.valueTo = toEl.value.trim();
        }

        if (crit.valueFrom && crit.valueTo && window.PeriodPicker && typeof PeriodPicker.parseDateObj === "function") {
          const dtFrom = PeriodPicker.parseDateObj(crit.valueFrom, false);
          const dtTo = PeriodPicker.parseDateObj(crit.valueTo, true);
          if (dtFrom && dtTo && dtFrom.getTime() > dtTo.getTime()) {
            if (fromEl) {
              fromEl.style.border = "1px solid #cc0000";
              fromEl.focus();
            }
            if (toEl) {
              toEl.style.border = "1px solid #cc0000";
            }
            alert("Дата начала не может быть больше даты окончания!");
            return;
          }
        }

        crit.value = (crit.valueFrom || crit.valueTo) ? `${crit.valueFrom || ''} ... ${crit.valueTo || ''}` : '';
      } else {
        const singleEl = document.getElementById(`ujFilterValInput_${idx}`);
        if (singleEl) {
          if (crit.fieldKey === "date" && singleEl.value.trim() && window.PeriodPicker && typeof PeriodPicker.autoCompleteDate === "function") {
            singleEl.value = PeriodPicker.autoCompleteDate(singleEl.value.trim(), "00:00:00");
          }
          crit.value = singleEl.value.trim();
        }
      }
    }

    this.activeFilters = JSON.parse(JSON.stringify(this.tempFilterCriteria));
    if (this.activeFilters.length > 0 && !this.activePresetName) {
      this.activePresetName = "Пользовательский";
    } else if (this.activeFilters.length === 0) {
      this.activePresetName = "";
    }
    this.saveActiveFiltersToStorage();
    this.close();

    if (this.onApplyCallback) {
      this.onApplyCallback(this.activeFilters, this.activePresetName);
    }
  },

  // ==========================================
  // Persistence Engine (LocalStorage)
  // ==========================================
  getActiveFiltersStorageKey: function() {
    return "uj_active_filters_" + (this.contextKey || "default");
  },

  loadActiveFiltersFromStorage: function() {
    try {
      const raw = localStorage.getItem(this.getActiveFiltersStorageKey());
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.activeFilters = parsed;
          this.activePresetName = localStorage.getItem(this.getActiveFiltersStorageKey() + "_name") || "";
          return;
        }
      }
    } catch(e) {}

    const defPreset = this.getDefaultPreset();
    if (defPreset && Array.isArray(defPreset.criteria) && defPreset.criteria.length > 0) {
      this.activeFilters = JSON.parse(JSON.stringify(defPreset.criteria));
      this.activePresetName = defPreset.name || "";
      return;
    }

    this.activeFilters = [];
    this.activePresetName = "";
  },

  saveActiveFiltersToStorage: function() {
    try {
      if (this.activeFilters && this.activeFilters.length > 0) {
        localStorage.setItem(this.getActiveFiltersStorageKey(), JSON.stringify(this.activeFilters));
        if (this.activePresetName) {
          localStorage.setItem(this.getActiveFiltersStorageKey() + "_name", this.activePresetName);
        } else {
          localStorage.removeItem(this.getActiveFiltersStorageKey() + "_name");
        }
      } else {
        localStorage.removeItem(this.getActiveFiltersStorageKey());
        localStorage.removeItem(this.getActiveFiltersStorageKey() + "_name");
      }
    } catch(e) {}
  },

  syncTempFiltersToStorage: function() {
    try {
      if (this.tempFilterCriteria && this.tempFilterCriteria.length > 0) {
        localStorage.setItem(this.getActiveFiltersStorageKey(), JSON.stringify(this.tempFilterCriteria));
      } else {
        localStorage.removeItem(this.getActiveFiltersStorageKey());
      }
    } catch(e) {}
  },

  // ==========================================
  // Presets & Templates Management (💾⚙️ / 📁⚙️)
  // ==========================================
  getPresetsStorageKey: function() {
    return "uj_filter_presets_" + (this.contextKey || "default");
  },

  getSavedPresets: function() {
    try {
      const raw = localStorage.getItem(this.getPresetsStorageKey());
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  },

  savePresetsToStorage: function(presets) {
    try {
      localStorage.setItem(this.getPresetsStorageKey(), JSON.stringify(presets));
    } catch (e) {}
  },

  getDefaultPreset: function() {
    const list = this.getSavedPresets();
    return list.find(p => p.isDefault === true) || null;
  },

  openPresetSaveModal: function() {
    let modal = document.getElementById("ujPresetSaveModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "ujPresetSaveModal";
      modal.className = "modal-overlay-1c";
      modal.style.zIndex = "10000";
      document.body.appendChild(modal);
    }

    const presets = this.getSavedPresets();
    const currentName = this.activePresetName || (this.activeFilters.length > 0 ? "Отбор " + new Date().toLocaleDateString("ru-RU") : "Пользовательский");
    const defPreset = this.getDefaultPreset();
    const isCurrentlyDefault = (defPreset && defPreset.name === currentName);

    let tableRowsHtml = "";
    if (presets.length === 0) {
      tableRowsHtml = `
        <tr>
          <td colspan="4" style="text-align: center; color: #777; padding: 12px; font-style: italic; background: #fff;">
            Yadda saxlanılmış tənzimləmə yoxdur. Aşağıda ad daxil edib yadda saxlayın.
          </td>
        </tr>
      `;
    } else {
      tableRowsHtml = presets.map((p, idx) => {
        const isCur = (p.name.toLowerCase() === currentName.toLowerCase());
        const bg = isCur ? '#d9e8fb' : (idx % 2 === 1 ? '#fafafa' : '#ffffff');
        const critSummary = (p.criteria || []).map(c => c.fieldLabel || c.fieldKey).join(", ") || "(без условий)";
        return `
          <tr id="ujPresetSaveRow_${p.id}" class="uj-preset-save-row"
              style="cursor: pointer; height: 25px; border-bottom: 1px solid #e0dfdb; background: ${bg}; user-select: none;"
              onclick="C1FilterComponent.selectPresetForUpdate('${p.id}')"
              title="Bu tənzimləməni seçib üzərinə yazmaq üçün klikləyin">
            <td style="width: 26px; text-align: center; border-right: 1px solid #e0dfdb; font-size: 12px;" title="${p.isDefault ? 'По умолчанию' : ''}">
              ${p.isDefault ? '⭐' : ''}
            </td>
            <td style="padding: 3px 8px; font-weight: bold; color: #002060; width: 150px;">
              ${this.escapeHtml(p.name)}
            </td>
            <td style="padding: 3px 8px; color: #666; font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 170px;" title="${this.escapeHtml(critSummary)}">
              ${this.escapeHtml(critSummary)}
            </td>
            <td style="width: 95px; text-align: center; border-left: 1px solid #e0dfdb; padding: 2px 4px;">
              <button type="button" class="btn-1c" style="font-size: 10px; height: 20px; padding: 0 6px; cursor: pointer; color: #004085; font-weight: bold;"
                      onclick="event.stopPropagation(); C1FilterComponent.selectPresetForUpdate('${p.id}')">
                ➔ Seç (Yenilə)
              </button>
            </td>
          </tr>
        `;
      }).join("");
    }

    modal.innerHTML = `
      <div class="modal-window-1c" style="width: 520px; background: #f0eee3; border: 1px solid #7f9db9; box-shadow: 0 4px 20px rgba(0,0,0,0.4); font-family: Tahoma, 'MS Sans Serif', Arial, sans-serif; font-size: 11px;">
        <div class="modal-header-1c" style="background: linear-gradient(to bottom, #fdfdfe, #d6d9e0); padding: 5px 8px; border-bottom: 1px solid #a0a0a0; display: flex; align-items: center; justify-content: space-between;">
          <div style="font-weight: bold; color: #000; font-size: 11px; display: flex; align-items: center; gap: 6px;">
            <span>💾</span>
            <span>Сохранение настройки отбора</span>
          </div>
          <button type="button" class="window-btn-close" onclick="C1FilterComponent.closePresetSaveModal()" style="width: 17px; height: 17px; border: 1px solid #7f9db9; background: #e5e2cf; cursor: pointer;">✕</button>
        </div>

        <div style="padding: 12px; display: flex; flex-direction: column; gap: 10px;">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <label style="font-weight: bold; color: #003366;">
                Сохраненные настройки (${presets.length}):
              </label>
              <span style="font-size: 10px; color: #666;">(Mövcud tənzimləməni seçib üzərinə yaza bilərsiniz)</span>
            </div>
            <div style="border: 1px solid #7f9db9; background: #ffffff; max-height: 125px; overflow-y: auto;">
              <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                <thead style="background: #e8e6dc; border-bottom: 1px solid #b8b6ac; position: sticky; top: 0; z-index: 1;">
                  <tr style="height: 20px; text-align: left; font-size: 10px; color: #333;">
                    <th style="width: 26px; text-align: center; border-right: 1px solid #d0cfc7;" title="По умолчанию">⭐</th>
                    <th style="padding: 2px 8px; border-right: 1px solid #d0cfc7;">Имя настройки</th>
                    <th style="padding: 2px 8px;">Условия</th>
                    <th style="width: 95px; text-align: center; border-left: 1px solid #d0cfc7;">Действие</th>
                  </tr>
                </thead>
                <tbody>
                  ${tableRowsHtml}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <label style="display: block; font-weight: bold; margin-bottom: 4px;">Имя настройки:</label>
            <input type="text" id="ujPresetSaveNameInput" class="input-1c" list="ujPresetSaveDatalist"
                   style="width: 100%; height: 24px; padding: 2px 6px; font-size: 12px;"
                   value="${this.escapeHtml(currentName)}"
                   placeholder="Məsələn: Пользовательский, 1, Təsdiqlənmiş və s."
                   oninput="C1FilterComponent.onPresetNameInputChanged(this.value)">
            <datalist id="ujPresetSaveDatalist">
              ${presets.map(p => `<option value="${this.escapeHtml(p.name)}">`).join("")}
            </datalist>
          </div>

          <div id="ujPresetSaveOverwriteNotice" style="display: none; background: #fffbe6; border: 1px solid #ffe58f; padding: 6px 10px; font-size: 11px; color: #874d00; border-radius: 2px;">
            ⚠️ Mövcud «<strong id="ujPresetSaveNoticeName"></strong>» tənzimləməsinin üzərinə yazılacaq (Update).
          </div>

          <div style="background: #fdfdf9; border: 1px solid #d4d0c8; padding: 8px; border-radius: 2px;">
            <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-weight: bold; color: #003366;">
              <input type="checkbox" id="ujPresetSaveIsDefaultCheck" ${isCurrentlyDefault ? 'checked' : ''} style="cursor: pointer;">
              <span>Использовать при открытии (Açılışda daimi açılsın)</span>
            </label>
            <div style="font-size: 10px; color: #666; margin-top: 4px; margin-left: 20px; line-height: 1.3;">
              Если флажок установлен, данный фильтр будет автоматически применяться при каждом запуске этого журнала документов.
            </div>
          </div>

          <div style="font-size: 11px; color: #555;">
            Текущих условий в фильтре: <strong>${this.activeFilters.length}</strong>
          </div>
        </div>

        <div style="padding: 6px 10px; background: #e5e2cf; border-top: 1px solid #b0af9f; display: flex; justify-content: flex-end; gap: 6px;">
          <button type="button" id="ujPresetSaveSubmitBtn" class="btn-1c btn-1c-primary" onclick="C1FilterComponent.saveCurrentFilterPreset()" style="height: 24px; padding: 0 16px; font-weight: bold;">
            Сохранить
          </button>
          <button type="button" class="btn-1c" onclick="C1FilterComponent.closePresetSaveModal()" style="height: 24px; padding: 0 12px;">
            Отмена
          </button>
        </div>
      </div>
    `;

    modal.style.display = "flex";
    setTimeout(() => {
      const inp = document.getElementById("ujPresetSaveNameInput");
      if (inp) {
        inp.focus();
        inp.select();
        this.onPresetNameInputChanged(inp.value);
      }
    }, 50);
  },

  onPresetNameInputChanged: function(val) {
    const trimmed = (val || "").trim().toLowerCase();
    const presets = this.getSavedPresets();
    const match = presets.find(p => p.name.trim().toLowerCase() === trimmed);

    const btn = document.getElementById("ujPresetSaveSubmitBtn");
    const notice = document.getElementById("ujPresetSaveOverwriteNotice");
    const noticeName = document.getElementById("ujPresetSaveNoticeName");

    const modal = document.getElementById("ujPresetSaveModal");
    if (modal) {
      modal.querySelectorAll(".uj-preset-save-row").forEach(r => r.style.background = "");
    }

    if (match) {
      if (btn) btn.textContent = `Обновить «${match.name}»`;
      if (notice) {
        notice.style.display = "block";
        if (noticeName) noticeName.textContent = match.name;
      }
      const selRow = document.getElementById(`ujPresetSaveRow_${match.id}`);
      if (selRow) selRow.style.background = "#d9e8fb";
    } else {
      if (btn) btn.textContent = "Сохранить";
      if (notice) notice.style.display = "none";
    }
  },

  selectPresetForUpdate: function(presetId) {
    const presets = this.getSavedPresets();
    const target = presets.find(p => p.id === presetId);
    if (!target) return;

    const inp = document.getElementById("ujPresetSaveNameInput");
    if (inp) {
      inp.value = target.name;
      inp.focus();
      inp.select();
    }
    const isDefCheck = document.getElementById("ujPresetSaveIsDefaultCheck");
    if (isDefCheck) {
      isDefCheck.checked = Boolean(target.isDefault);
    }
    this.onPresetNameInputChanged(target.name);
  },

  closePresetSaveModal: function() {
    const modal = document.getElementById("ujPresetSaveModal");
    if (modal) modal.style.display = "none";
  },

  saveCurrentFilterPreset: function() {
    const inp = document.getElementById("ujPresetSaveNameInput");
    const isDefCheck = document.getElementById("ujPresetSaveIsDefaultCheck");
    const name = inp ? inp.value.trim() : "";
    if (!name) {
      alert("Пожалуйста, введите имя настройки.");
      if (inp) inp.focus();
      return;
    }

    const isDefault = isDefCheck ? Boolean(isDefCheck.checked) : false;
    const presets = this.getSavedPresets();

    const existingIdx = presets.findIndex(p => p.name.trim().toLowerCase() === name.toLowerCase());
    const isUpdate = (existingIdx >= 0);
    const presetObj = {
      id: isUpdate ? presets[existingIdx].id : ("preset_" + Date.now()),
      name: name,
      isDefault: isDefault,
      criteria: JSON.parse(JSON.stringify(this.activeFilters))
    };

    if (isDefault) {
      presets.forEach(p => p.isDefault = false);
    }

    if (isUpdate) {
      presets[existingIdx] = presetObj;
    } else {
      presets.push(presetObj);
    }

    this.savePresetsToStorage(presets);
    this.activePresetName = name;

    if (isDefault) {
      this.saveActiveFiltersToStorage();
    }

    this.closePresetSaveModal();

    if (this.onApplyCallback) {
      this.onApplyCallback(this.activeFilters, this.activePresetName);
    }
  },

  // Modal: Restore / Manage Presets (📁⚙️)
  openPresetRestoreModal: function() {
    let modal = document.getElementById("ujPresetRestoreModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "ujPresetRestoreModal";
      modal.className = "modal-overlay-1c";
      modal.style.zIndex = "10000";
      document.body.appendChild(modal);
    }

    this.renderPresetRestoreModalContent();
    modal.style.display = "flex";
  },

  closePresetRestoreModal: function() {
    const modal = document.getElementById("ujPresetRestoreModal");
    if (modal) modal.style.display = "none";
  },

  selectedPresetId: null,

  renderPresetRestoreModalContent: function() {
    const modal = document.getElementById("ujPresetRestoreModal");
    if (!modal) return;

    const presets = this.getSavedPresets();
    if (!this.selectedPresetId && presets.length > 0) {
      this.selectedPresetId = presets[0].id;
    }

    let rowsHtml = "";
    presets.forEach((p, idx) => {
      const isSelected = (p.id === this.selectedPresetId);
      const bg = isSelected ? "#316ac5" : (idx % 2 === 1 ? "#f9f8f4" : "#ffffff");
      const fg = isSelected ? "#ffffff" : "#111111";

      const summary = (p.criteria || []).map(c => {
        const valStr = (c.operator === "Заполнено" || c.operator === "Не заполнено") ? "" : ` = ${c.value}`;
        return `${c.fieldLabel || c.fieldKey}${valStr}`;
      }).join("; ");

      rowsHtml += `
        <tr style="background: ${bg}; color: ${fg}; height: 24px; cursor: pointer; user-select: none;"
            onclick="C1FilterComponent.selectPresetRow('${p.id}')"
            ondblclick="C1FilterComponent.applyPresetById('${p.id}')">
          <td style="width: 32px; text-align: center; border: 1px solid #d4d0c8; font-size: 13px;">
            ${p.isDefault ? '⭐' : ''}
          </td>
          <td style="padding: 2px 6px; border: 1px solid #d4d0c8; font-weight: ${p.isDefault ? 'bold' : 'normal'}; width: 180px;">
            ${this.escapeHtml(p.name)}
          </td>
          <td style="padding: 2px 6px; border: 1px solid #d4d0c8; font-size: 10px; color: ${isSelected ? '#e0f0ff' : '#555'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${this.escapeHtml(summary || "(без условий)")}
          </td>
          <td style="width: 140px; text-align: center; border: 1px solid #d4d0c8;">
            <button type="button" class="btn-1c" style="height: 19px; padding: 0 4px; font-size: 10px;"
                    onclick="event.stopPropagation(); C1FilterComponent.togglePresetDefault('${p.id}')"
                    title="${p.isDefault ? 'Снять признак по умолчанию' : 'Сделать открываемым по умолчанию при старте'}">
              ${p.isDefault ? 'Снять ⭐' : '⭐ По умолчанию'}
            </button>
            <button type="button" class="btn-1c" style="height: 19px; padding: 0 4px; font-size: 10px; color: #a00; margin-left: 2px;"
                    onclick="event.stopPropagation(); C1FilterComponent.deletePresetById('${p.id}')"
                    title="Удалить эту настройку">
              ✕
            </button>
          </td>
        </tr>
      `;
    });

    modal.innerHTML = `
      <div class="modal-window-1c" style="width: 580px; background: #f0eee3; border: 1px solid #7f9db9; box-shadow: 0 4px 20px rgba(0,0,0,0.4); font-family: Tahoma, 'MS Sans Serif', Arial, sans-serif; font-size: 11px;">
        <div class="modal-header-1c" style="background: linear-gradient(to bottom, #fdfdfe, #d6d9e0); padding: 5px 8px; border-bottom: 1px solid #a0a0a0; display: flex; align-items: center; justify-content: space-between;">
          <div style="font-weight: bold; color: #000; font-size: 11px; display: flex; align-items: center; gap: 6px;">
            <span>📁⚙️</span>
            <span>Восстановление / Управление сохраненными настройками</span>
          </div>
          <button type="button" class="window-btn-close" onclick="C1FilterComponent.closePresetRestoreModal()" style="width: 17px; height: 17px; border: 1px solid #7f9db9; background: #e5e2cf; cursor: pointer;">✕</button>
        </div>

        <div style="padding: 6px 10px; background: #ece9d8; border-bottom: 1px solid #d4d0c8; display: flex; gap: 6px; align-items: center;">
          <button type="button" class="btn-1c btn-1c-primary" onclick="C1FilterComponent.applySelectedPreset()" style="height: 22px; padding: 0 10px; font-weight: bold;">
            Выбрать (Применить)
          </button>
          <button type="button" class="btn-1c" onclick="C1FilterComponent.clearFilterAndCloseModal()" style="height: 22px; padding: 0 8px;">
            Сбросить все отборы
          </button>
        </div>

        <div style="padding: 10px; max-height: 260px; overflow-y: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 11px; background: #ffffff; border: 1px solid #7f9db9;">
            <thead>
              <tr style="background: #e3dec9; border-bottom: 1px solid #b0af9f; height: 21px;">
                <th style="width: 32px; text-align: center; border: 1px solid #d4d0c8;" title="По умолчанию на старте">⭐</th>
                <th style="width: 180px; text-align: left; padding: 2px 6px; border: 1px solid #d4d0c8;">Наименование</th>
                <th style="text-align: left; padding: 2px 6px; border: 1px solid #d4d0c8;">Условия</th>
                <th style="width: 140px; text-align: center; border: 1px solid #d4d0c8;">Действия</th>
              </tr>
            </thead>
            <tbody>
              ${presets.length === 0 ? `
                <tr>
                  <td colspan="4" style="text-align: center; padding: 30px; color: #777; font-style: italic;">
                    Нет сохраненных настроек отбора.<br>
                    Настройте отбор и нажмите [💾⚙️] для сохранения.
                  </td>
                </tr>
              ` : rowsHtml}
            </tbody>
          </table>
        </div>

        <div style="padding: 6px 10px; background: #e5e2cf; border-top: 1px solid #b0af9f; display: flex; justify-content: space-between; align-items: center;">
          <div style="font-size: 10px; color: #666;">
            ⭐ — Открывается по умолчанию при каждом открытии
          </div>
          <div style="display: flex; gap: 6px;">
            <button type="button" class="btn-1c" onclick="C1FilterComponent.closePresetRestoreModal()" style="height: 24px; padding: 0 14px;">
              Закрыть
            </button>
          </div>
        </div>
      </div>
    `;
  },

  selectPresetRow: function(id) {
    this.selectedPresetId = id;
    this.renderPresetRestoreModalContent();
  },

  selectPresetRestoreItem: function(id) {
    this.selectPresetRow(id);
  },

  selectPresetSaveListItem: function(idxOrId) {
    if (typeof idxOrId === "number") {
      const presets = this.getSavedPresets();
      if (presets[idxOrId]) this.selectPresetForUpdate(presets[idxOrId].id);
    } else {
      this.selectPresetForUpdate(idxOrId);
    }
  },

  applyFilterCriteriaModal: function() {
    this.finishFilterEditing();
  },

  applySelectedPreset: function() {
    if (this.selectedPresetId) {
      this.applyPresetById(this.selectedPresetId);
    }
  },

  applyPresetById: function(presetId) {
    const presets = this.getSavedPresets();
    const target = presets.find(p => p.id === presetId);
    if (!target) return;

    this.activeFilters = JSON.parse(JSON.stringify(target.criteria || []));
    this.activePresetName = target.name || "";
    this.saveActiveFiltersToStorage();
    this.closePresetRestoreModal();

    if (this.onApplyCallback) {
      this.onApplyCallback(this.activeFilters, this.activePresetName);
    }
  },

  togglePresetDefault: function(presetId) {
    const presets = this.getSavedPresets();
    const target = presets.find(p => p.id === presetId);
    if (!target) return;

    const willBeDefault = !target.isDefault;
    if (willBeDefault) {
      presets.forEach(p => p.isDefault = false);
      target.isDefault = true;
      this.activeFilters = JSON.parse(JSON.stringify(target.criteria || []));
      this.activePresetName = target.name || "";
      this.saveActiveFiltersToStorage();
    } else {
      target.isDefault = false;
    }

    this.savePresetsToStorage(presets);
    this.renderPresetRestoreModalContent();
  },

  deletePresetById: function(presetId) {
    const presets = this.getSavedPresets();
    const target = presets.find(p => p.id === presetId);
    if (!target) return;

    if (!confirm(`Удалить сохраненную настройку "${target.name}"?`)) return;

    const filtered = presets.filter(p => p.id !== presetId);
    this.savePresetsToStorage(filtered);
    if (this.activePresetName === target.name) {
      this.activePresetName = "";
    }
    if (this.selectedPresetId === presetId) {
      this.selectedPresetId = filtered.length > 0 ? filtered[0].id : null;
    }
    this.renderPresetRestoreModalContent();
  },

  clearFilterAndCloseModal: function() {
    this.activeFilters = [];
    this.activePresetName = "";
    this.saveActiveFiltersToStorage();
    this.closePresetRestoreModal();
    if (this.onApplyCallback) {
      this.onApplyCallback([], "");
    }
  },

  // ==========================================
  // Condition Matching Engine
  // ==========================================
  filterItems: function(items, criteria) {
    if (!Array.isArray(items)) return [];
    const activeCrits = (criteria || []).filter(c => c.enabled !== false);
    if (activeCrits.length === 0) return [...items];

    return items.filter(item => {
      for (const crit of activeCrits) {
        if (!this.matchesCondition(item, crit)) {
          return false;
        }
      }
      return true;
    });
  },

  matchesCondition: function(item, crit) {
    const key = crit.fieldKey;
    let itemVal = item[key];
    const targetVal = crit.value;
    const op = crit.operator || "Равно";

    if (itemVal === undefined || itemVal === null) itemVal = "";

    // 1. Boolean operations (posted, deleted)
    if (key === "posted" || key === "deleted") {
      const bVal = Boolean(itemVal);
      if (op === "Заполнено") return true;
      if (op === "Не заполнено") return false;
      const targetBool = (targetVal === "Да" || targetVal === "true" || targetVal === true);
      if (op === "Равно") return bVal === targetBool;
      if (op === "Не равно") return bVal !== targetBool;
    }

    // Special handling for Номенклатура
    if (key === "nomenclature") {
      let noms = [];
      if (Array.isArray(item.nom_keys) && item.nom_keys.length) {
        noms = item.nom_keys.map(n => String(n).toLowerCase());
      } else if (Array.isArray(item.nomenclatures) && item.nomenclatures.length) {
        noms = item.nomenclatures.map(n => String(n).trim().toLowerCase()).filter(Boolean);
      } else if (item.nomenclature) {
        noms = (String(item.nomenclature).includes(";") ? String(item.nomenclature).split(";") : [String(item.nomenclature)]).map(n => n.trim().toLowerCase()).filter(Boolean);
      }

      if (this.isServerFiltered && noms.length === 0) {
        return true;
      }

      if (op === "Заполнено") return noms.length > 0;
      if (op === "Не заполнено") return noms.length === 0;

      const targetRaw = String(targetVal !== undefined ? targetVal : "").trim();
      if (!targetRaw) return true;

      let matchAll = false;
      let criteriaList = [];

      if (crit.structuredFilter && Array.isArray(crit.structuredFilter.items) && crit.structuredFilter.items.length) {
        matchAll = Boolean(crit.structuredFilter.matchAll);
        criteriaList = crit.structuredFilter.items;
      } else {
        let raw = targetRaw;
        if (raw.startsWith("[И]")) {
          matchAll = true;
          raw = raw.replace(/^\[И\]\s*/, "");
        }
        const tokens = raw.split(";").map(s => s.trim()).filter(Boolean);
        criteriaList = tokens.map(tok => {
          if (/^содержит:\s*/i.test(tok)) {
            return { comp: "contains", value: tok.replace(/^содержит:\s*/i, "").trim() };
          }
          return { comp: "equal", value: tok };
        });
      }

      if (criteriaList.length === 0) return true;

      const matchSingleNom = (entry, query, comp) => {
        if (!entry || !query) return false;
        const qRaw = query.toLowerCase().trim();
        const q = qRaw.replace(/^\[[^\]]+\]\s*/, "").trim();
        const qClean = q.replace(/^0+/, "");
        const segments = entry.toLowerCase().split("|").map(s => s.trim());

        if (comp === "equal") {
          for (const seg of segments) {
            if (!seg) continue;
            const segClean = seg.replace(/^0+/, "");
            if (seg === q || (qClean && segClean === qClean) || seg === qRaw) return true;
            if (seg.length > 5 && q.length > 5 && (seg.includes(q) || q.includes(seg))) return true;
          }
          return entry === q || (qClean && entry.replace(/^0+/, "") === qClean) || (entry.length > 5 && q.length > 5 && entry.includes(q));
        } else {
          for (const seg of segments) {
            if (!seg) continue;
            const segClean = seg.replace(/^0+/, "");
            if (seg.includes(q) || (qClean && segClean.includes(qClean)) || (qRaw && seg.includes(qRaw))) return true;
          }
          return entry.includes(q) || (qClean && entry.includes(qClean)) || (qRaw && entry.includes(qRaw));
        }
      };

      const docHasCriterion = (c) => {
        const val = c.value || "";
        if (!val) return true;
        const comp = c.comp || (op === "Содержит" ? "contains" : "equal");
        const code = c.code ? c.code.toLowerCase().trim() : "";
        const art = c.artikul ? c.artikul.toLowerCase().trim() : "";
        const bc = c.barcode ? c.barcode.toLowerCase().trim() : "";
        return noms.some(n => {
          if (matchSingleNom(n, val, comp)) return true;
          if (code && matchSingleNom(n, code, "equal")) return true;
          if (art && matchSingleNom(n, art, "equal")) return true;
          if (bc && matchSingleNom(n, bc, "equal")) return true;
          return false;
        });
      };

      let satisfies = false;
      if (matchAll) {
        satisfies = criteriaList.every(c => docHasCriterion(c));
      } else {
        satisfies = criteriaList.some(c => docHasCriterion(c));
      }

      if (op === "Не равно" || op === "Не в списке" || op === "Не содержит") {
        return !satisfies;
      }
      return satisfies;
    }

    // 2. Filled / Not filled operators
    if (op === "Заполнено") {
      return String(itemVal).trim() !== "";
    }
    if (op === "Не заполнено") {
      return String(itemVal).trim() === "";
    }

    // 3. List operators: ONLY semicolon separated
    if (op === "В группе из списка" || op === "В списке") {
      if (!targetVal) return true;
      const parts = String(targetVal).split(";").map(s => s.trim().toLowerCase()).filter(Boolean);
      const strVal = String(itemVal).trim().toLowerCase();
      const codeVal = String(item[key + "_code"] || "").trim().toLowerCase();
      const isCodeField = (key === "number" || key === "deal" || key === "obrabotka_number" || key === "kontragent_code");
      const strClean = isCodeField ? strVal.replace(/^[a-zа-яё_]*0+/, "") : "";
      return parts.some(p => {
        let cleanP = p.replace(/^\[[^\]]+\]\s*/, "").trim();
        let namePart = cleanP;
        let codePart = "";
        if (cleanP.includes(" - ")) {
          const sub = cleanP.split(" - ");
          namePart = sub[0].trim();
          codePart = sub[sub.length - 1].trim();
        }
        const pClean = isCodeField ? cleanP.replace(/^[a-zа-яё_]*0+/, "") : "";
        if (strVal === cleanP || strVal.includes(cleanP) || cleanP.includes(strVal)) return true;
        if (namePart && (strVal === namePart || strVal.includes(namePart) || namePart.includes(strVal))) return true;
        if (codePart && (codeVal === codePart || strVal.includes(codePart) || codeVal.includes(codePart))) return true;
        if (isCodeField && strClean && pClean && strClean === pClean) return true;
        return false;
      });
    }
    if (op === "Не в списке") {
      if (!targetVal) return true;
      const parts = String(targetVal).split(";").map(s => s.trim().toLowerCase()).filter(Boolean);
      const strVal = String(itemVal).trim().toLowerCase();
      const codeVal = String(item[key + "_code"] || "").trim().toLowerCase();
      const anyMatch = parts.some(p => {
        let cleanP = p.replace(/^\[[^\]]+\]\s*/, "").trim();
        let namePart = cleanP;
        let codePart = "";
        if (cleanP.includes(" - ")) {
          const sub = cleanP.split(" - ");
          namePart = sub[0].trim();
          codePart = sub[sub.length - 1].trim();
        }
        if (strVal === cleanP || strVal.includes(cleanP) || cleanP.includes(strVal)) return true;
        if (namePart && (strVal === namePart || strVal.includes(namePart) || namePart.includes(strVal))) return true;
        if (codePart && (codeVal === codePart || strVal.includes(codePart) || codeVal.includes(codePart))) return true;
        return false;
      });
      return !anyMatch;
    }

    // 4. Date comparisons
    if (key === "date") {
      const dtItem = this.parseFullDateTimeMs(itemVal, false);

      if (op.startsWith("Интервал")) {
        const sFrom = (crit.valueFrom !== undefined && crit.valueFrom !== "") ? String(crit.valueFrom) : (String(targetVal || "").split(/\s*(?:\.\.\.|—|-)\s*/)[0] || "");
        const sTo = (crit.valueTo !== undefined && crit.valueTo !== "") ? String(crit.valueTo) : (String(targetVal || "").split(/\s*(?:\.\.\.|—|-)\s*/)[1] || sFrom);
        const dtStart = this.parseFullDateTimeMs(sFrom, false);
        const dtEnd = this.parseFullDateTimeMs(sTo, true);
        if (dtItem === null || dtStart === null || dtEnd === null) return true;

        if (op === "Интервал (>, <)") return dtItem > dtStart && dtItem < dtEnd;
        if (op === "Интервал (>=, <=)") return dtItem >= dtStart && dtItem <= dtEnd;
        if (op === "Интервал (>=, <)") return dtItem >= dtStart && dtItem < dtEnd;
        if (op === "Интервал (>, <=)") return dtItem > dtStart && dtItem <= dtEnd;
      }

      const isEndOp = (op === "Меньше или равно" || op === "Меньше");
      const dtTarget = this.parseFullDateTimeMs(targetVal, isEndOp);

      if (dtItem !== null && dtTarget !== null) {
        const sItemDate = String(itemVal).trim().toLowerCase();
        const sTargetDate = String(targetVal).trim().toLowerCase();
        if (op === "Равно") return sItemDate.startsWith(sTargetDate) || sItemDate.includes(sTargetDate) || (dtItem === dtTarget);
        if (op === "Не равно") return !sItemDate.startsWith(sTargetDate) && dtItem !== dtTarget;
        if (op === "Больше") return dtItem > dtTarget;
        if (op === "Меньше") return dtItem < dtTarget;
        if (op === "Больше или равно") return dtItem >= dtTarget;
        if (op === "Меньше или равно") return dtItem <= dtTarget;
      }
    }

    // 5. Interval comparisons for numbers or general text
    if (op.startsWith("Интервал")) {
      const sFrom = (crit.valueFrom !== undefined && crit.valueFrom !== "") ? String(crit.valueFrom) : (String(targetVal || "").split(/\s*(?:\.\.\.|—|-)\s*/)[0] || "");
      const sTo = (crit.valueTo !== undefined && crit.valueTo !== "") ? String(crit.valueTo) : (String(targetVal || "").split(/\s*(?:\.\.\.|—|-)\s*/)[1] !== undefined ? String(targetVal || "").split(/\s*(?:\.\.\.|—|-)\s*/)[1] : sFrom);

      const isStrictNumber = (str) => /^[-+]?\d+(\.\d+)?$/.test(str);
      const isNum = !isNaN(parseFloat(itemVal)) && isStrictNumber(sFrom);
      if (isNum) {
        const numItem = parseFloat(itemVal);
        const numStart = parseFloat(sFrom);
        const numEnd = parseFloat(sTo);
        if (op === "Интервал (>, <)") return numItem > numStart && numItem < numEnd;
        if (op === "Интервал (>=, <=)") return numItem >= numStart && numItem <= numEnd;
        if (op === "Интервал (>=, <)") return numItem >= numStart && numItem < numEnd;
        if (op === "Интервал (>, <=)") return numItem > numStart && numItem <= numEnd;
      } else {
        const sItem = String(itemVal).toLowerCase().trim();
        const sStart = sFrom.toLowerCase().trim();
        const sEnd = sTo.toLowerCase().trim();
        if (op === "Интервал (>, <)") return sItem > sStart && sItem < sEnd;
        if (op === "Интервал (>=, <=)") return sItem >= sStart && sItem <= sEnd;
        if (op === "Интервал (>=, <)") return sItem >= sStart && sItem < sEnd;
        if (op === "Интервал (>, <=)") return sItem > sStart && sItem <= sEnd;
      }
      return true;
    }

    // 6. Numeric comparisons
    const sItemRaw = String(itemVal !== undefined && itemVal !== null ? itemVal : "").trim();
    const sTargetRaw = String(targetVal !== undefined && targetVal !== null ? targetVal : "").trim();
    const isStrictNumber = (str) => /^[-+]?\d+(\.\d+)?$/.test(str);

    const isNumericComp = (key === "amount")
      ? (!isNaN(parseFloat(itemVal)) && isStrictNumber(sTargetRaw))
      : (isStrictNumber(sItemRaw) && isStrictNumber(sTargetRaw));

    if (isNumericComp) {
      const numItem = parseFloat(itemVal);
      const numTarget = parseFloat(targetVal);
      if (op === "Равно") return numItem === numTarget;
      if (op === "Не равно") return numItem !== numTarget;
      if (op === "Больше") return numItem > numTarget;
      if (op === "Меньше") return numItem < numTarget;
      if (op === "Больше или равно") return numItem >= numTarget;
      if (op === "Меньше или равно") return numItem <= numTarget;
    }

    // 7. General String operations
    const sItem = String(itemVal).toLowerCase().trim();
    const sTarget = String(targetVal !== undefined && targetVal !== null ? targetVal : "").toLowerCase().trim();

    if (op === "Равно") return sItem === sTarget;
    if (op === "Не равно") return sItem !== sTarget;
    if (op === "Содержит") return sItem.includes(sTarget);
    if (op === "Не содержит") return !sItem.includes(sTarget);
    if (op === "Начинается с") return sItem.startsWith(sTarget);
    if (op === "Больше") return sItem > sTarget;
    if (op === "Меньше") return sItem < sTarget;
    if (op === "Больше или равно") return sItem >= sTarget;
    if (op === "Меньше или равно") return sItem <= sTarget;

    return true;
  },

  parseFullDateTimeMs: function(val, isEndDate = false) {
    if (val === undefined || val === null || val === "") return null;
    if (window.PeriodPicker && typeof PeriodPicker.parseDateObj === "function") {
      const dt = PeriodPicker.parseDateObj(String(val), isEndDate);
      if (dt) return dt.getTime();
    }
    const str = String(val).trim();
    const parts = str.split(/[ T]/);
    const datePart = parts[0] || "";
    const timePart = parts[1] || (isEndDate ? "23:59:59" : "00:00:00");
    const dParts = datePart.split(".");
    if (dParts.length === 3) {
      const day = parseInt(dParts[0], 10);
      const month = parseInt(dParts[1], 10) - 1;
      const year = parseInt(dParts[2], 10);
      const tParts = timePart.split(":");
      const hh = parseInt(tParts[0] || "0", 10);
      const mm = parseInt(tParts[1] || "0", 10);
      const ss = parseInt(tParts[2] || "0", 10);
      return new Date(year, month, day, hh, mm, ss).getTime();
    }
    const parsed = Date.parse(str);
    return isNaN(parsed) ? null : parsed;
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

window.C1FilterComponent = C1FilterComponent;
