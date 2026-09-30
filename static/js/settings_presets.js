/* ========================================================
   1C:ENTERPRISE SETTINGS PRESETS CONTROLLER (SQLITE PERSISTENCE)
   settings_presets.js (Image 3, 4, 5: Сохранить и Восстановить настройку)
   ======================================================== */

const SettingsPresets = {
  presets: [],
  selectedRestoreIndex: 0,
  selectedSaveIndex: 0,
  activePresetName: "",

  async init() {
    await this.loadPresets();
    await this.restoreSessionOrStartup();
  },

  async loadPresets() {
    try {
      const res = await fetch("/api/presets");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          this.presets = data;
          return;
        }
      }
    } catch (e) {
      console.warn("Server presets fetch failed:", e);
    }
  },

  async restoreSessionOrStartup() {
    // 1. Check if an explicit startup preset is configured (open_on_startup == true)
    const startup = this.presets.find(p => p.open_on_startup);
    if (startup) {
      console.log("[SettingsPresets] Found startup preset:", startup.name);
      this.applyPreset(startup);
      return;
    }

    // 2. Check if a previous session was saved in SQLite
    try {
      const res = await fetch("/api/current_settings");
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data && json.data.config) {
          const cfg = json.data.config;
          const fakePreset = {
            name: json.data.active_preset_name || "",
            ...cfg
          };
          this.applyPreset(fakePreset);
          return;
        }
      }
    } catch (err) {
      console.warn("Could not load current session settings:", err);
    }

    // 3. Fallback to clean default
    this.resetToCleanDefault();
  },

  async autoSaveCurrentSession() {
    try {
      const config = SettingsModal.getConfig();
      await fetch("/api/current_settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: config,
          active_preset_name: this.activePresetName
        })
      });
    } catch (e) {
      console.warn("Auto-save session failed:", e);
    }
  },

  /* ----------------------------------------------------
     RESTORE MODAL (Восстановление настройки - Image 4)
     ---------------------------------------------------- */
  async openRestoreModal() {
    await this.loadPresets();
    this.renderRestoreTable();
    const overlay = document.getElementById("settingsRestoreModalOverlay");
    if (overlay) {
      overlay.style.display = "flex";
      if (window.MdiManager && typeof MdiManager.bringModalToFront === "function") {
        MdiManager.bringModalToFront(overlay, {
          title: "Восстановление настройки",
          icon: "📥",
          closeFn: () => this.closeRestoreModal()
        });
      }
    }
  },

  closeRestoreModal() {
    const overlay = document.getElementById("settingsRestoreModalOverlay");
    if (overlay) overlay.style.display = "none";
    if (window.MdiManager && typeof MdiManager.removeModalTaskbarTab === "function") {
      MdiManager.removeModalTaskbarTab("settingsRestoreModalOverlay");
    }
  },

  renderRestoreTable() {
    const tbody = document.getElementById("presetRestoreTableBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    this.presets.forEach((p, idx) => {
      const tr = document.createElement("tr");
      tr.setAttribute("data-index", idx);
      tr.setAttribute("data-name", p.name);

      const isSelected = (this.activePresetName && p.name === this.activePresetName) ||
                         (!this.activePresetName && idx === this.selectedRestoreIndex);
      if (isSelected) {
        tr.classList.add("selected");
        this.selectedRestoreIndex = idx;
      }

      tr.onclick = () => {
        tbody.querySelectorAll("tr").forEach(r => r.classList.remove("selected"));
        tr.classList.add("selected");
        this.selectedRestoreIndex = idx;
      };

      tr.ondblclick = () => {
        tbody.querySelectorAll("tr").forEach(r => r.classList.remove("selected"));
        tr.classList.add("selected");
        this.selectedRestoreIndex = idx;
        this.confirmApplyRestore();
      };

      const tdName = document.createElement("td");
      tdName.textContent = p.name;
      tr.appendChild(tdName);

      // Checkbox for Open on Startup (Открыв...)
      const tdOpen = document.createElement("td");
      tdOpen.className = "td-center";
      const chkOpen = document.createElement("input");
      chkOpen.type = "checkbox";
      chkOpen.checked = !!p.open_on_startup;
      chkOpen.title = "Açılışda avtomatik yüklə və icra et";
      chkOpen.onclick = async (e) => {
        e.stopPropagation();
        const isChecked = chkOpen.checked;
        await fetch("/api/presets/set_startup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: p.name, is_startup: isChecked })
        });
        await this.loadPresets();
        this.renderRestoreTable();
      };
      tdOpen.appendChild(chkOpen);
      tr.appendChild(tdOpen);

      // Checkbox for Save on Close (Сохран...)
      const tdSave = document.createElement("td");
      tdSave.className = "td-center";
      const chkSave = document.createElement("input");
      chkSave.type = "checkbox";
      chkSave.checked = !!p.save_on_close;
      chkSave.title = "Bağlanışda avtomatik yadda saxla";
      chkSave.onclick = async (e) => {
        e.stopPropagation();
        const isChecked = chkSave.checked;
        await fetch("/api/presets/set_save_on_close", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: p.name, is_save: isChecked })
        });
        await this.loadPresets();
        this.renderRestoreTable();
      };
      tdSave.appendChild(chkSave);
      tr.appendChild(tdSave);

      const tdUser = document.createElement("td");
      tdUser.textContent = p.user || "Administrator";
      tr.appendChild(tdUser);

      tbody.appendChild(tr);
    });
  },

  confirmApplyRestore() {
    const tbody = document.getElementById("presetRestoreTableBody");
    const selectedTr = tbody?.querySelector("tr.selected");
    const selectedName = selectedTr?.getAttribute("data-name");
    const preset = this.presets.find(p => p.name === selectedName) || this.presets[this.selectedRestoreIndex] || (this.presets.length > 0 ? this.presets[0] : null);
    if (preset) {
      this.applyPreset(preset);
      this.autoSaveCurrentSession();
    }
    this.closeRestoreModal();
    // Automatically execute report so user immediately sees results
    setTimeout(() => {
      if (typeof onActionFormirovat === "function") {
        onActionFormirovat();
      }
    }, 150);
  },

  /* ----------------------------------------------------
     SAVE MODAL (Сохранение настройки - Image 5)
     ---------------------------------------------------- */
  async openSaveModal() {
    await this.loadPresets();
    this.renderSaveTable();
    const nameInput = document.getElementById("savePresetNameInput");
    if (nameInput) {
      nameInput.value = this.activePresetName || "Mənim Nastroykam";
      setTimeout(() => nameInput.focus(), 100);
    }
    const overlay = document.getElementById("settingsSaveModalOverlay");
    if (overlay) {
      overlay.style.display = "flex";
      if (window.MdiManager && typeof MdiManager.bringModalToFront === "function") {
        MdiManager.bringModalToFront(overlay, {
          title: "Сохранение настройки",
          icon: "💾",
          closeFn: () => this.closeSaveModal()
        });
      }
    }
  },

  closeSaveModal() {
    const overlay = document.getElementById("settingsSaveModalOverlay");
    if (overlay) overlay.style.display = "none";
    if (window.MdiManager && typeof MdiManager.removeModalTaskbarTab === "function") {
      MdiManager.removeModalTaskbarTab("settingsSaveModalOverlay");
    }
  },

  renderSaveTable() {
    const tbody = document.getElementById("presetSaveTableBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    this.presets.forEach((p, idx) => {
      const tr = document.createElement("tr");
      if (idx === this.selectedSaveIndex) tr.classList.add("selected");

      tr.onclick = () => {
        tbody.querySelectorAll("tr").forEach(r => r.classList.remove("selected"));
        tr.classList.add("selected");
        this.selectedSaveIndex = idx;
        const nameInput = document.getElementById("savePresetNameInput");
        if (nameInput) nameInput.value = p.name;
      };

      const tdName = document.createElement("td");
      tdName.textContent = p.name;
      tr.appendChild(tdName);

      // Checkbox for Open on Startup (Открыв...)
      const tdOpen = document.createElement("td");
      tdOpen.className = "td-center";
      const chkOpen = document.createElement("input");
      chkOpen.type = "checkbox";
      chkOpen.checked = !!p.open_on_startup;
      chkOpen.onclick = async (e) => {
        e.stopPropagation();
        const isChecked = chkOpen.checked;
        await fetch("/api/presets/set_startup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: p.name, is_startup: isChecked })
        });
        await this.loadPresets();
        this.renderSaveTable();
      };
      tdOpen.appendChild(chkOpen);
      tr.appendChild(tdOpen);

      // Checkbox for Save on Close (Сохран...)
      const tdSave = document.createElement("td");
      tdSave.className = "td-center";
      const chkSave = document.createElement("input");
      chkSave.type = "checkbox";
      chkSave.checked = !!p.save_on_close;
      chkSave.onclick = async (e) => {
        e.stopPropagation();
        const isChecked = chkSave.checked;
        await fetch("/api/presets/set_save_on_close", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: p.name, is_save: isChecked })
        });
        await this.loadPresets();
        this.renderSaveTable();
      };
      tdSave.appendChild(chkSave);
      tr.appendChild(tdSave);

      const tdUser = document.createElement("td");
      tdUser.textContent = p.user || "Administrator";
      tr.appendChild(tdUser);

      tbody.appendChild(tr);
    });
  },

  async confirmSaveCurrent() {
    const nameInput = document.getElementById("savePresetNameInput");
    const name = nameInput?.value.trim() || "Настройка " + (this.presets.length + 1);

    // Collect current active configuration
    const currentConfig = SettingsModal.getConfig();

    const selectedPreset = this.presets[this.selectedSaveIndex];
    const openOnStartup = (selectedPreset && selectedPreset.name === name) ? (selectedPreset.open_on_startup ? 1 : 0) : 0;
    const saveOnClose = (selectedPreset && selectedPreset.name === name) ? (selectedPreset.save_on_close ? 1 : 0) : 0;

    const res = await fetch("/api/presets/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name,
        config: currentConfig,
        user: "Administrator",
        open_on_startup: openOnStartup,
        save_on_close: saveOnClose
      })
    });

    const data = await res.json();
    if (data.success) {
      this.activePresetName = name;
      await this.loadPresets();
      this.updateWindowTitle(name);
      await this.autoSaveCurrentSession();
      this.closeSaveModal();
    }
  },

  async addNewPreset() {
    const currentConfig = SettingsModal.getConfig();
    const newName = "Настройка " + (this.presets.length + 1);
    await fetch("/api/presets/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName,
        config: currentConfig,
        user: "Administrator",
        open_on_startup: 0,
        save_on_close: 0
      })
    });
    await this.loadPresets();
    this.selectedSaveIndex = this.presets.length - 1;
    this.renderSaveTable();
    const nameInput = document.getElementById("savePresetNameInput");
    if (nameInput) {
      nameInput.value = newName;
      nameInput.focus();
      nameInput.select();
    }
  },

  async duplicatePreset() {
    const current = this.presets[this.selectedSaveIndex];
    if (!current) return;
    const targetName = current.name + " (копия)";
    await fetch("/api/presets/duplicate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source_name: current.name, target_name: targetName })
    });
    await this.loadPresets();
    this.renderSaveTable();
  },

  async renamePreset() {
    const nameInput = document.getElementById("savePresetNameInput");
    if (nameInput) {
      nameInput.focus();
      nameInput.select();
    }
  },

  async deletePreset() {
    const current = this.presets[this.selectedSaveIndex];
    if (!current) return;
    // Direct delete without blocking browser popup
    await fetch("/api/presets/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: current.name })
    });
    await this.loadPresets();
    if (this.selectedSaveIndex >= this.presets.length) {
      this.selectedSaveIndex = Math.max(0, this.presets.length - 1);
    }
    this.renderSaveTable();
  },

  /* ----------------------------------------------------
     APPLY PRESET TO UI
     ---------------------------------------------------- */
  applyPreset(preset) {
    if (!preset) return;
    this.activePresetName = preset.name || "";

    // 1. Period Dates
    if (preset.startDate) {
      const topStart = document.getElementById("topStartDateInput");
      const dlgStart = document.getElementById("dlgStartDateInput");
      if (topStart) topStart.value = preset.startDate;
      if (dlgStart) dlgStart.value = preset.startDate;
    }
    if (preset.endDate) {
      const topEnd = document.getElementById("topEndDateInput");
      const dlgEnd = document.getElementById("dlgEndDateInput");
      if (topEnd) topEnd.value = preset.endDate;
      if (dlgEnd) dlgEnd.value = preset.endDate;
    }

    // 2. Price Type
    if (preset.priceTypes && Array.isArray(preset.priceTypes)) {
      if (typeof setSelectedPriceTypes === "function") {
        setSelectedPriceTypes(preset.priceTypes);
      }
    } else if (preset.priceType) {
      if (typeof setSelectedPriceTypes === "function") {
        setSelectedPriceTypes([preset.priceType]);
      } else {
        const sel = document.getElementById("dlgPriceTypeSelect");
        if (sel) sel.value = preset.priceType;
      }
    }

    // 3. Parameters Checkboxes
    if (preset.parameters) {
      if (document.getElementById("chkNegativeRed")) document.getElementById("chkNegativeRed").checked = !!preset.parameters.negativeRed;
      if (document.getElementById("chkShowGrandTotals")) document.getElementById("chkShowGrandTotals").checked = !!preset.parameters.showGrandTotals;
      if (document.getElementById("chkShowDetails")) document.getElementById("chkShowDetails").checked = !!preset.parameters.showDetails;
      if (document.getElementById("chkUseProperties")) document.getElementById("chkUseProperties").checked = !!preset.parameters.useProperties;
    }

    // 4. Indicators
    if (preset.indicators) {
      if (document.getElementById("indBarcodeUnit")) {
        document.getElementById("indBarcodeUnit").checked = preset.indicators.barcodeUnit !== undefined ? !!preset.indicators.barcodeUnit : (preset.indicators.barcode !== undefined ? !!preset.indicators.barcode : true);
      }
      if (document.getElementById("indBarcodeBox")) {
        document.getElementById("indBarcodeBox").checked = preset.indicators.barcodeBox !== undefined ? !!preset.indicators.barcodeBox : (preset.indicators.barcode !== undefined ? !!preset.indicators.barcode : true);
      }
      if (document.getElementById("indBarcodeBlock")) {
        document.getElementById("indBarcodeBlock").checked = preset.indicators.barcodeBlock !== undefined ? !!preset.indicators.barcodeBlock : false;
      }
      if (document.getElementById("indShowPrice")) document.getElementById("indShowPrice").checked = !!preset.indicators.showPrice;
      if (document.getElementById("indShowSum")) document.getElementById("indShowSum").checked = !!preset.indicators.showSum;
      if (document.getElementById("indQtyStart")) document.getElementById("indQtyStart").checked = !!preset.indicators.qtyStart;
      if (document.getElementById("indQtyIn")) document.getElementById("indQtyIn").checked = !!preset.indicators.qtyIn;
      if (document.getElementById("indQtyOut")) document.getElementById("indQtyOut").checked = !!preset.indicators.qtyOut;
      if (document.getElementById("indQtyEnd")) document.getElementById("indQtyEnd").checked = !!preset.indicators.qtyEnd;
      if (document.getElementById("indQtyTurnover")) document.getElementById("indQtyTurnover").checked = !!preset.indicators.qtyTurnover;
    }

    // 5. Row Groupings
    if (Array.isArray(preset.rowGroupings) && preset.rowGroupings.length > 0) {
      const tbody = document.getElementById("rowGroupingsBody");
      if (tbody) {
        tbody.innerHTML = "";
        preset.rowGroupings.forEach((rg, idx) => {
          const tr = document.createElement("tr");
          if (idx === 0) tr.classList.add("selected");
          tr.onclick = function() { selectGroupingRow(this); };
          tr.ondblclick = function() { editRowGroupingField(this.querySelector(".grouping-btn-pick")); };

          tr.innerHTML = `
            <td>
              <div class="grouping-cell-wrap">
                <span class="grouping-field-name">${rg.field}</span>
                <button class="grouping-btn-pick" onclick="editRowGroupingField(this)" title="Выбрать поле...">...</button>
              </div>
            </td>
            <td>
              <select class="grouping-type-sel">
                <option value="Элементы" ${rg.type === "Элементы" ? "selected" : ""}>Элементы</option>
                <option value="Иерархия" ${rg.type === "Иерархия" ? "selected" : ""}>Иерархия</option>
                <option value="Без групп" ${rg.type === "Без групп" ? "selected" : ""}>Без групп</option>
              </select>
            </td>
          `;
          tbody.appendChild(tr);
        });
      }
    }

    // 6. Filters
    const filterRows = document.querySelectorAll("#filtersTableBody tr");
    // Reset all filter rows to unchecked & empty first
    filterRows.forEach(tr => {
      const chk = tr.querySelector(".filter-chk");
      if (chk) chk.checked = false;
      const inp = tr.querySelector(".filter-val-input");
      if (inp) inp.value = "";
    });

    if (Array.isArray(preset.filters) && preset.filters.length > 0) {
      preset.filters.forEach(f => {
        let matched = false;
        filterRows.forEach(tr => {
          const fieldSel = tr.querySelector(".filter-field-sel");
          if (fieldSel && fieldSel.value === f.field) {
            const chk = tr.querySelector(".filter-chk");
            if (chk) chk.checked = !!f.active;
            const compSel = tr.querySelector(".filter-comp-sel");
            if (compSel && f.comparison) compSel.value = f.comparison;
            const inp = tr.querySelector(".filter-val-input");
            if (inp) inp.value = f.value || "";
            matched = true;
          }
        });

        // If not matched, dynamically create a filter row
        if (!matched && f.active) {
          const tbody = document.getElementById("filtersTableBody");
          if (tbody) {
            const tr = document.createElement("tr");
            tr.onclick = function() { highlightFilterRow(this); };
            tr.innerHTML = `
              <td style="text-align: center;"><input type="checkbox" class="filter-chk" checked></td>
              <td>
                <select class="filter-field-sel" onchange="onFilterFieldChange(this)">
                  <option value="${f.field}" selected>${f.field}</option>
                  <option value="Склад">Склад</option>
                  <option value="Номенклатура">Номенклатура</option>
                  <option value="Номенклатура.Номенклатурная группа">Номенклатура.Номенклатурная группа</option>
                  <option value="Качество">Качество</option>
                  <option value="КоличествоКонечныйОстаток">КоличествоКонечныйОстаток</option>
                </select>
              </td>
              <td>
                <select class="filter-comp-sel">
                  <option value="in_list" ${f.comparison === "in_list" ? "selected" : ""}>В группе из списка</option>
                  <option value="equal" ${f.comparison === "equal" ? "selected" : ""}>Равно</option>
                  <option value="not_equal" ${f.comparison === "not_equal" ? "selected" : ""}>Не равно</option>
                  <option value="contains" ${f.comparison === "contains" ? "selected" : ""}>Содержит</option>
                </select>
              </td>
              <td>
                <div class="filter-value-cell-wrap">
                  <input type="text" class="filter-val-input" value="${f.value || ''}">
                  <button class="filter-btn-pick" onclick="openCatalogForFilterRow(this)" title="Soraqçadan seç...">...</button>
                </div>
              </td>
            `;
            tbody.appendChild(tr);
          }
        }
      });
    }

    this.updateWindowTitle(preset.name);
  },

  /* ----------------------------------------------------
     RESET TO CLEAN DEFAULT (Default Nastroyka)
     ---------------------------------------------------- */
  resetToCleanDefault() {
    this.activePresetName = "";
    
    // Dates
    const topStart = document.getElementById("topStartDateInput");
    const dlgStart = document.getElementById("dlgStartDateInput");
    if (topStart) topStart.value = "01.09.2026";
    if (dlgStart) dlgStart.value = "01.09.2026";

    const topEnd = document.getElementById("topEndDateInput");
    const dlgEnd = document.getElementById("dlgEndDateInput");
    if (topEnd) topEnd.value = "30.09.2026";
    if (dlgEnd) dlgEnd.value = "30.09.2026";

    // Price type
    if (typeof setSelectedPriceTypes === "function") {
      setSelectedPriceTypes(["20"]);
    } else {
      const sel = document.getElementById("dlgPriceTypeSelect");
      if (sel) sel.value = "20";
    }

    // Parameters
    if (document.getElementById("chkNegativeRed")) document.getElementById("chkNegativeRed").checked = true;
    if (document.getElementById("chkShowGrandTotals")) document.getElementById("chkShowGrandTotals").checked = true;
    if (document.getElementById("chkShowDetails")) document.getElementById("chkShowDetails").checked = false;
    if (document.getElementById("chkUseProperties")) document.getElementById("chkUseProperties").checked = true;

    // Indicators
    if (document.getElementById("indBarcodeUnit")) document.getElementById("indBarcodeUnit").checked = true;
    if (document.getElementById("indBarcodeBox")) document.getElementById("indBarcodeBox").checked = true;
    if (document.getElementById("indBarcodeBlock")) document.getElementById("indBarcodeBlock").checked = false;
    if (document.getElementById("indShowPrice")) document.getElementById("indShowPrice").checked = true;
    if (document.getElementById("indShowSum")) document.getElementById("indShowSum").checked = true;
    if (document.getElementById("indQtyStart")) document.getElementById("indQtyStart").checked = true;
    if (document.getElementById("indQtyIn")) document.getElementById("indQtyIn").checked = true;
    if (document.getElementById("indQtyOut")) document.getElementById("indQtyOut").checked = true;
    if (document.getElementById("indQtyEnd")) document.getElementById("indQtyEnd").checked = true;
    if (document.getElementById("indQtyTurnover")) document.getElementById("indQtyTurnover").checked = false;

    // Reset Row Groupings to standard 2 rows: Склад & Номенклатура
    const tbodyGroupings = document.getElementById("rowGroupingsBody");
    if (tbodyGroupings) {
      tbodyGroupings.innerHTML = `
        <tr class="selected" onclick="selectGroupingRow(this)" ondblclick="editRowGroupingField(this.querySelector('.grouping-btn-pick'))">
          <td>
            <div class="grouping-cell-wrap">
              <span class="grouping-field-name">Склад</span>
              <button class="grouping-btn-pick" onclick="editRowGroupingField(this)" title="Выбрать поле...">...</button>
            </div>
          </td>
          <td>
            <select class="grouping-type-sel">
              <option value="Элементы" selected>Элементы</option>
              <option value="Иерархия">Иерархия</option>
              <option value="Без групп">Без групп</option>
            </select>
          </td>
        </tr>
        <tr onclick="selectGroupingRow(this)" ondblclick="editRowGroupingField(this.querySelector('.grouping-btn-pick'))">
          <td>
            <div class="grouping-cell-wrap">
              <span class="grouping-field-name">Номенклатура</span>
              <button class="grouping-btn-pick" onclick="editRowGroupingField(this)" title="Выбрать поле...">...</button>
            </div>
          </td>
          <td>
            <select class="grouping-type-sel">
              <option value="Элементы" selected>Элементы</option>
              <option value="Иерархия">Иерархия</option>
              <option value="Без групп">Без групп</option>
            </select>
          </td>
        </tr>
      `;
    }

    // Uncheck and empty all filters
    const filterRows = document.querySelectorAll("#filtersTableBody tr");
    filterRows.forEach(tr => {
      const chk = tr.querySelector(".filter-chk");
      if (chk) chk.checked = false;
      const inp = tr.querySelector(".filter-val-input");
      if (inp) inp.value = "";
    });

    this.updateWindowTitle("");
    this.autoSaveCurrentSession();
  },

  updateWindowTitle(presetName) {
    const titleEl = document.getElementById("reportWindowTitle");
    const dlgBadge = document.getElementById("settingsDialogActivePresetBadge");
    const dlgTitle = document.getElementById("settingsDialogTitle");
    const statusBadge = document.getElementById("statusBarPresetBadge");
    const tbBadge = document.getElementById("toolbarActivePresetBadge");

    const displayName = (presetName && presetName !== "Основная") ? `Товары на складах. Настройка: ${presetName}` : "Товары на складах";

    if (titleEl) titleEl.textContent = displayName;
    if (window.MdiManager && typeof MdiManager.setWindowTitle === "function") {
      MdiManager.setWindowTitle("mdiWindow-1", displayName);
    }

    if (statusBadge) {
      statusBadge.innerHTML = presetName ? `<span>🏷️ Настройка: ${escapeHtml(presetName)}</span>` : "<span>🏷️ Основная</span>";
    }
    if (tbBadge) {
      tbBadge.style.display = presetName ? "inline-flex" : "none";
      tbBadge.innerHTML = `<span>🏷️ Настройка: ${escapeHtml(presetName)}</span>`;
    }

    if (presetName && presetName !== "Основная") {
      if (dlgBadge) {
        dlgBadge.style.display = "inline-block";
        dlgBadge.textContent = `Настройка: ${presetName}`;
      }
      if (dlgTitle) dlgTitle.textContent = `Настройки: Товары на складах (${presetName})`;
      document.title = `1С:Предприятие 8.3 - [${displayName}]`;
    } else {
      if (dlgBadge) dlgBadge.style.display = "none";
      if (dlgTitle) dlgTitle.textContent = `Настройки: Товары на складах`;
      document.title = `1С:Предприятие 8.3 - [Товары на складах]`;
    }
  }
};

/* Global window functions called from buttons & menus */
function openRestoreSettingsModal() {
  SettingsPresets.openRestoreModal();
}

function closeRestoreSettingsModal() {
  SettingsPresets.closeRestoreModal();
}

function confirmApplySelectedPreset() {
  SettingsPresets.confirmApplyRestore();
}

function toggleAllUsersPresets() {
  // Silent toggle
}

function openSaveSettingsModal() {
  SettingsPresets.openSaveModal();
}

function closeSaveSettingsModal() {
  SettingsPresets.closeSaveModal();
}

function confirmSaveCurrentPreset() {
  SettingsPresets.confirmSaveCurrent();
}

function addNewPresetPrompt() {
  SettingsPresets.addNewPreset();
}

function duplicateSelectedPreset() {
  SettingsPresets.duplicatePreset();
}

function renameSelectedPresetPrompt() {
  SettingsPresets.renamePreset();
}

function deleteSelectedPresetPrompt() {
  SettingsPresets.deletePreset();
}

function resetToDefaultSettings() {
  SettingsPresets.resetToCleanDefault();
}

function togglePresetWindowMaximize(el) {
  let win = el;
  while (win && !win.classList.contains("preset-window-modal")) {
    win = win.parentElement;
  }
  if (!win) {
    win = document.getElementById("settingsSaveModalWindow") || document.getElementById("settingsRestoreModalWindow");
  }
  if (!win) return;
  const isMax = win.classList.toggle("maximized");
  const maxBtns = win.querySelectorAll(".preset-btn-max");
  maxBtns.forEach(btn => {
    btn.textContent = isMax ? "❐" : "□";
    btn.title = isMax ? "Bərpa et" : "Böyüt";
  });
}
