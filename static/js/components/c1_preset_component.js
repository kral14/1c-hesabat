/**
 * ============================================================================
 * 1C:ENTERPRISE UNIVERSAL PRESET COMPONENT (C1PresetComponent)
 * ============================================================================
 * Standalone, reusable 1C component for Saving and Restoring form / filter / 
 * report / document presets with full 1C 8.3 aesthetics and persistence.
 *
 * Provides:
 *  1. Iconic 1C Toolbar Buttons:
 *     - Restore Settings (Yellow folder with gray gear: 📁⚙️)
 *     - Save Settings (Blue floppy disk with gray gear: 💾⚙️)
 *  2. "Восстановление / Управление сохраненными настройками" Modal
 *  3. "Сохранение настройки" Modal
 *  4. Default preset startup support (⭐)
 *  5. LocalStorage & Multi-context isolation (journal, report, doc editor, etc.)
 * ============================================================================
 */

(function (window) {
  "use strict";

  // Reusable SVG Icons matching 1C:Enterprise (Screenshot 2)
  const ICONS = {
    folderGear: `
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: block;">
        <path d="M1.5 3.5 C1.5 2.8 2 2.5 2.8 2.5 L6 2.5 L7.5 4 L13.5 4 C14.3 4 14.5 4.5 14.5 5.2 L14.5 12 C14.5 12.8 14 13.5 13 13.5 L2.5 13.5 C1.8 13.5 1.5 12.8 1.5 12 Z" fill="#fbc02d" stroke="#f57f17" stroke-width="1"/>
        <circle cx="11.5" cy="11.5" r="3.2" fill="#9e9e9e" stroke="#616161" stroke-width="0.8"/>
        <circle cx="11.5" cy="11.5" r="1.2" fill="#ffffff"/>
      </svg>
    `,
    floppyGear: `
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: block;">
        <rect x="2" y="2" width="12" height="12" rx="1.5" fill="#90caf9" stroke="#1565c0" stroke-width="1.1"/>
        <rect x="4.5" y="2" width="7" height="4.5" fill="#ffffff" stroke="#90caf9" stroke-width="0.8"/>
        <circle cx="11.5" cy="11.5" r="3.2" fill="#9e9e9e" stroke="#616161" stroke-width="0.8"/>
        <circle cx="11.5" cy="11.5" r="1.2" fill="#ffffff"/>
      </svg>
    `
  };

  const C1PresetComponent = {
    activeContexts: {}, // stores registered context callbacks { contextKey: { onApply, getSettings, onReset, formatSummary } }
    currentRestoreOptions: null,
    currentSaveOptions: null,
    selectedPresetId: null,

    /* ------------------------------------------------------------------------
       STORAGE & PRESETS MANAGEMENT
       ------------------------------------------------------------------------ */
    getStorageKey(context) {
      return `c1_presets_${context || "default"}`;
    },

    getPresets(context) {
      try {
        const key = this.getStorageKey(context);
        let raw = localStorage.getItem(key);
        if (!raw) {
          // Compatibility with legacy C1FilterComponent keys
          const legacyKey = `uj_filter_presets_${context || "common"}`;
          raw = localStorage.getItem(legacyKey);
          if (raw) {
            const legacyList = JSON.parse(raw);
            if (Array.isArray(legacyList)) {
              return legacyList.map(p => ({
                id: p.id || ("preset_" + Math.random()),
                name: p.name,
                isDefault: Boolean(p.isDefault),
                data: p.data || p.criteria || null,
                updatedAt: p.updatedAt || ""
              }));
            }
          }
          return [];
        }
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch (err) {
        console.warn("[C1PresetComponent] Error reading presets for", context, err);
        return [];
      }
    },

    savePresets(context, presets) {
      try {
        const key = this.getStorageKey(context);
        localStorage.setItem(key, JSON.stringify(presets || []));
      } catch (err) {
        console.error("[C1PresetComponent] Error saving presets for", context, err);
      }
    },

    getDefaultPreset(context) {
      const presets = this.getPresets(context);
      return presets.find(p => p.isDefault === true) || null;
    },

    applyDefaultIfAny(options) {
      const context = typeof options === "string" ? options : (options && options.context);
      const onApply = (typeof options === "object" && options.onApply) || (this.activeContexts[context] && this.activeContexts[context].onApply);
      if (!context || typeof onApply !== "function") return false;

      const def = this.getDefaultPreset(context);
      if (def && def.data) {
        try {
          onApply(def.data, def.name);
          return true;
        } catch (err) {
          console.warn("[C1PresetComponent] Error applying default preset:", err);
        }
      }
      return false;
    },

    /* ------------------------------------------------------------------------
       REGISTER CONTEXT
       ------------------------------------------------------------------------ */
    register(context, handlers) {
      if (!context) return;
      this.activeContexts[context] = {
        onApply: handlers.onApply || null,
        getSettings: handlers.getSettings || null,
        onReset: handlers.onReset || null,
        formatSummary: handlers.formatSummary || null
      };
    },

    /* ------------------------------------------------------------------------
       TOOLBAR BUTTONS GENERATION
       ------------------------------------------------------------------------ */
    getButtonsHtml(context, customOptions = {}) {
      const safeCtx = this.escapeAttr(context || "default");
      const restoreTitle = this.escapeAttr(customOptions.restoreTitle || "Восстановить настройки...");
      const saveTitle = this.escapeAttr(customOptions.saveTitle || "Сохранить настройку...");

      return `
        <button type="button" class="btn-1c c1-preset-btn-restore"
                onclick="C1PresetComponent.openRestore({ context: '${safeCtx}' })"
                title="${restoreTitle}"
                style="height: 24px; padding: 0 6px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; background: #ffffff;">
          ${ICONS.folderGear}
        </button>
        <button type="button" class="btn-1c c1-preset-btn-save"
                onclick="C1PresetComponent.openSave({ context: '${safeCtx}' })"
                title="${saveTitle}"
                style="height: 24px; padding: 0 6px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; background: #ffffff;">
          ${ICONS.floppyGear}
        </button>
      `;
    },

    renderButtons(containerEl, options = {}) {
      if (!containerEl) return;
      const context = options.context || "default";
      if (options.onApply || options.getSettings || options.onReset) {
        this.register(context, options);
      }
      containerEl.innerHTML = this.getButtonsHtml(context, options);
    },

    /* ------------------------------------------------------------------------
       SUMMARY FORMATTER (Helper for "Условия" Column)
       ------------------------------------------------------------------------ */
    formatConditions(data, customFormatter) {
      if (typeof customFormatter === "function") {
        try {
          return customFormatter(data);
        } catch (e) {}
      }

      if (!data) return "(без условий)";

      // Case 1: Array of filter criteria [{ fieldLabel, operator, value }, ...]
      if (Array.isArray(data)) {
        if (!data.length) return "(без условий)";
        return data.map(c => {
          const lbl = c.fieldLabel || c.fieldKey || c.field || "Поле";
          const op = c.operator || "=";
          if (op === "Заполнено" || op === "Не заполнено") return `${lbl} (${op})`;
          const val = c.value !== undefined && c.value !== null ? c.value : "";
          return `${lbl} ${op} ${val}`;
        }).join(" ; ");
      }

      // Case 2: Object with key-values (e.g. { nom: '...', price_types: [...] })
      if (typeof data === "object") {
        const parts = [];
        for (const [k, v] of Object.entries(data)) {
          if (v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length)) continue;
          let valStr = Array.isArray(v) ? v.join(", ") : String(v);
          if (valStr.length > 50) valStr = valStr.substring(0, 47) + "...";
          parts.push(`${k} = ${valStr}`);
        }
        return parts.length ? parts.join(" ; ") : "(без условий)";
      }

      return String(data);
    },

    /* ------------------------------------------------------------------------
       MODAL 1: RESTORE / MANAGE PRESETS (Screenshot 1)
       ------------------------------------------------------------------------ */
    openRestore(options = {}) {
      const context = options.context || "default";
      const reg = this.activeContexts[context] || {};

      this.currentRestoreOptions = {
        context: context,
        title: options.title || "Восстановление / Управление сохраненными настройками",
        onApply: options.onApply || reg.onApply,
        onReset: options.onReset || reg.onReset,
        formatSummary: options.formatSummary || reg.formatSummary
      };

      let modal = document.getElementById("c1UniversalPresetRestoreModal");
      if (!modal) {
        modal = document.createElement("div");
        modal.id = "c1UniversalPresetRestoreModal";
        modal.className = "modal-overlay-1c";
        modal.style.position = "fixed";
        modal.style.top = "0";
        modal.style.left = "0";
        modal.style.right = "0";
        modal.style.bottom = "0";
        modal.style.background = "rgba(0,0,0,0.45)";
        modal.style.zIndex = "10500";
        modal.style.display = "none";
        modal.style.alignItems = "center";
        modal.style.justifyContent = "center";
        modal.style.backdropFilter = "blur(1px)";
        document.body.appendChild(modal);
      }

      const presets = this.getPresets(context);
      this.selectedPresetId = presets.length > 0 ? presets[0].id : null;

      this.renderRestoreModalContent();
      modal.style.display = "flex";
    },

    closeRestore() {
      const modal = document.getElementById("c1UniversalPresetRestoreModal");
      if (modal) modal.style.display = "none";
      this.currentRestoreOptions = null;
    },

    selectRestoreRow(id) {
      this.selectedPresetId = id;
      this.renderRestoreModalContent();
    },

    renderRestoreModalContent() {
      const modal = document.getElementById("c1UniversalPresetRestoreModal");
      if (!modal || !this.currentRestoreOptions) return;

      const context = this.currentRestoreOptions.context;
      const presets = this.getPresets(context);

      let rowsHtml = "";
      if (presets.length === 0) {
        rowsHtml = `
          <tr>
            <td colspan="4" style="text-align: center; padding: 30px; color: #777; font-style: italic;">
              Нет сохраненных настроек.<br>
              Настройте условия и сохраните их с помощью кнопки [💾⚙️].
            </td>
          </tr>
        `;
      } else {
        presets.forEach((p, idx) => {
          const isSelected = (p.id === this.selectedPresetId);
          const bg = isSelected ? "#316ac5" : (idx % 2 === 1 ? "#f9f8f4" : "#ffffff");
          const fg = isSelected ? "#ffffff" : "#111111";
          const condFg = isSelected ? "#e0f0ff" : "#555555";
          const summary = this.formatConditions(p.data, this.currentRestoreOptions.formatSummary);

          rowsHtml += `
            <tr style="background: ${bg}; color: ${fg}; height: 25px; cursor: pointer; user-select: none;"
                onclick="C1PresetComponent.selectRestoreRow('${p.id}')"
                ondblclick="C1PresetComponent.applySelectedRestore()">
              <td style="width: 32px; text-align: center; border: 1px solid #d4d0c8; font-size: 13px;" title="${p.isDefault ? 'По умолчанию' : ''}">
                ${p.isDefault ? '⭐' : ''}
              </td>
              <td style="padding: 2px 6px; border: 1px solid #d4d0c8; font-weight: ${p.isDefault ? 'bold' : 'normal'}; width: 170px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${this.escapeHtml(p.name)}
              </td>
              <td style="padding: 2px 6px; border: 1px solid #d4d0c8; font-size: 10px; color: ${condFg}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${this.escapeHtml(summary)}">
                ${this.escapeHtml(summary)}
              </td>
              <td style="width: 140px; text-align: center; border: 1px solid #d4d0c8; padding: 2px;">
                <button type="button" class="btn-1c" style="height: 19px; padding: 0 4px; font-size: 10px;"
                        onclick="event.stopPropagation(); C1PresetComponent.toggleDefaultPreset('${p.id}')"
                        title="${p.isDefault ? 'Снять признак по умолчанию' : 'Сделать открываемым по умолчанию при старте'}">
                  ${p.isDefault ? 'Снять ⭐' : '⭐ По умолчанию'}
                </button>
                <button type="button" class="btn-1c" style="height: 19px; padding: 0 4px; font-size: 10px; color: #a00; margin-left: 2px;"
                        onclick="event.stopPropagation(); C1PresetComponent.deletePreset('${p.id}')"
                        title="Удалить эту настройку">
                  ✕
                </button>
              </td>
            </tr>
          `;
        });
      }

      modal.innerHTML = `
        <div class="modal-window-1c" style="width: 620px; max-width: 95vw; background: #f0eee3; border: 1px solid #7f9db9; box-shadow: 0 4px 25px rgba(0,0,0,0.45); font-family: Tahoma, 'MS Sans Serif', Arial, sans-serif; font-size: 11px; display: flex; flex-direction: column;">
          
          <!-- Header (Matching Screenshot 1) -->
          <div class="modal-header-1c" style="background: linear-gradient(to bottom, #fdfdfe, #d6d9e0); padding: 5px 8px; border-bottom: 1px solid #a0a0a0; display: flex; align-items: center; justify-content: space-between;">
            <div style="font-weight: bold; color: #000; font-size: 11px; display: flex; align-items: center; gap: 6px;">
              <span>📁⚙️</span>
              <span>${this.escapeHtml(this.currentRestoreOptions.title)}</span>
            </div>
            <button type="button" class="window-btn-close" onclick="C1PresetComponent.closeRestore()" style="width: 17px; height: 17px; border: 1px solid #7f9db9; background: #e5e2cf; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 11px;">✕</button>
          </div>

          <!-- Action Toolbar (Matching Screenshot 1) -->
          <div style="padding: 6px 10px; background: #ece9d8; border-bottom: 1px solid #d4d0c8; display: flex; gap: 6px; align-items: center;">
            <button type="button" class="btn-1c btn-1c-primary" onclick="C1PresetComponent.applySelectedRestore()" style="height: 23px; padding: 0 10px; font-weight: bold; background: linear-gradient(to bottom, #ffea88, #d8a020); border: 1px solid #7c6817; color: #000; cursor: pointer;">
              Выбрать (Применить)
            </button>
            <button type="button" class="btn-1c" onclick="C1PresetComponent.resetAllFiltersAndClose()" style="height: 23px; padding: 0 8px; border: 1px solid #7f9db9; cursor: pointer;">
              Сбросить все отборы
            </button>
          </div>

          <!-- Table (Matching Screenshot 1) -->
          <div style="padding: 10px; max-height: 270px; min-height: 140px; overflow-y: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 11px; background: #ffffff; border: 1px solid #7f9db9;">
              <thead style="background: #e3dec9; border-bottom: 1px solid #b0af9f; position: sticky; top: 0; z-index: 2;">
                <tr style="height: 22px;">
                  <th style="width: 32px; text-align: center; border: 1px solid #d4d0c8;" title="По умолчанию на старте">⭐</th>
                  <th style="width: 170px; text-align: left; padding: 2px 6px; border: 1px solid #d4d0c8;">Наименование</th>
                  <th style="text-align: left; padding: 2px 6px; border: 1px solid #d4d0c8;">Условия</th>
                  <th style="width: 140px; text-align: center; border: 1px solid #d4d0c8;">Действия</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>

          <!-- Footer (Matching Screenshot 1) -->
          <div style="padding: 8px 12px; background: #e5e2cf; border-top: 1px solid #b0af9f; display: flex; justify-content: space-between; align-items: center;">
            <div style="font-size: 10px; color: #555; display: flex; align-items: center; gap: 4px;">
              <span>⭐</span>
              <span>— Открывается по умолчанию при каждом открытии</span>
            </div>
            <div>
              <button type="button" class="btn-1c" onclick="C1PresetComponent.closeRestore()" style="height: 23px; padding: 0 16px; border: 1px solid #7f9db9; background: #e0dfd5; cursor: pointer;">
                Закрыть
              </button>
            </div>
          </div>

        </div>
      `;
    },

    applySelectedRestore() {
      if (!this.currentRestoreOptions || !this.selectedPresetId) {
        this.closeRestore();
        return;
      }

      const presets = this.getPresets(this.currentRestoreOptions.context);
      const preset = presets.find(p => p.id === this.selectedPresetId);
      if (preset && typeof this.currentRestoreOptions.onApply === "function") {
        try {
          this.currentRestoreOptions.onApply(preset.data, preset.name);
        } catch (e) {
          console.error("[C1PresetComponent] Error in onApply callback:", e);
        }
      }
      this.closeRestore();
    },

    resetAllFiltersAndClose() {
      if (this.currentRestoreOptions && typeof this.currentRestoreOptions.onReset === "function") {
        try {
          this.currentRestoreOptions.onReset();
        } catch (e) {
          console.error("[C1PresetComponent] Error in onReset callback:", e);
        }
      }
      this.closeRestore();
    },

    toggleDefaultPreset(presetId) {
      if (!this.currentRestoreOptions) return;
      const context = this.currentRestoreOptions.context;
      const presets = this.getPresets(context);

      presets.forEach(p => {
        if (p.id === presetId) {
          p.isDefault = !p.isDefault;
        } else {
          p.isDefault = false; // Only one default preset per context
        }
      });

      this.savePresets(context, presets);
      this.renderRestoreModalContent();
    },

    deletePreset(presetId) {
      if (!this.currentRestoreOptions) return;
      const context = this.currentRestoreOptions.context;
      let presets = this.getPresets(context);
      const item = presets.find(p => p.id === presetId);
      const name = item ? item.name : "";

      if (!confirm(`Вы действительно хотите удалить настройку "${name}"?`)) return;

      presets = presets.filter(p => p.id !== presetId);
      this.savePresets(context, presets);

      if (this.selectedPresetId === presetId) {
        this.selectedPresetId = presets.length > 0 ? presets[0].id : null;
      }
      this.renderRestoreModalContent();
    },

    /* ------------------------------------------------------------------------
       MODAL 2: SAVE PRESET MODAL (Floppy with gear)
       ------------------------------------------------------------------------ */
    openSave(options = {}) {
      const context = options.context || "default";
      const reg = this.activeContexts[context] || {};

      this.currentSaveOptions = {
        context: context,
        title: options.title || "Сохранение настройки",
        getSettings: options.getSettings || reg.getSettings,
        onSaved: options.onSaved || null,
        formatSummary: options.formatSummary || reg.formatSummary
      };

      if (typeof this.currentSaveOptions.getSettings !== "function") {
        console.warn("[C1PresetComponent] openSave requires getSettings callback!");
      }

      let modal = document.getElementById("c1UniversalPresetSaveModal");
      if (!modal) {
        modal = document.createElement("div");
        modal.id = "c1UniversalPresetSaveModal";
        modal.className = "modal-overlay-1c";
        modal.style.position = "fixed";
        modal.style.top = "0";
        modal.style.left = "0";
        modal.style.right = "0";
        modal.style.bottom = "0";
        modal.style.background = "rgba(0,0,0,0.45)";
        modal.style.zIndex = "10500";
        modal.style.display = "none";
        modal.style.alignItems = "center";
        modal.style.justifyContent = "center";
        modal.style.backdropFilter = "blur(1px)";
        document.body.appendChild(modal);
      }

      this.renderSaveModalContent();
      modal.style.display = "flex";

      setTimeout(() => {
        const inp = document.getElementById("c1PresetSaveNameInput");
        if (inp) {
          inp.focus();
          inp.select();
        }
      }, 50);
    },

    closeSave() {
      const modal = document.getElementById("c1UniversalPresetSaveModal");
      if (modal) modal.style.display = "none";
      this.currentSaveOptions = null;
    },

    renderSaveModalContent() {
      const modal = document.getElementById("c1UniversalPresetSaveModal");
      if (!modal || !this.currentSaveOptions) return;

      const context = this.currentSaveOptions.context;
      const presets = this.getPresets(context);
      const defaultName = presets.length > 0 ? "Пользовательский " + (presets.length + 1) : "Пользовательский";

      let tableRowsHtml = "";
      if (presets.length === 0) {
        tableRowsHtml = `
          <tr>
            <td colspan="3" style="text-align: center; color: #777; padding: 12px; font-style: italic;">
              Нет сохраненных настроек. Введите имя ниже и нажмите [Сохранить].
            </td>
          </tr>
        `;
      } else {
        tableRowsHtml = presets.map((p, idx) => {
          const bg = idx % 2 === 1 ? '#fafafa' : '#ffffff';
          const summary = this.formatConditions(p.data, this.currentSaveOptions.formatSummary);
          return `
            <tr style="cursor: pointer; height: 24px; border-bottom: 1px solid #e0dfdb; background: ${bg}; user-select: none;"
                onclick="C1PresetComponent.pickSaveName('${this.escapeAttr(p.name)}')">
              <td style="width: 26px; text-align: center; border-right: 1px solid #e0dfdb;" title="${p.isDefault ? 'По умолчанию' : ''}">
                ${p.isDefault ? '⭐' : ''}
              </td>
              <td style="padding: 2px 8px; font-weight: bold; color: #002060; width: 160px; border-right: 1px solid #e0dfdb;">
                ${this.escapeHtml(p.name)}
              </td>
              <td style="padding: 2px 8px; color: #555; font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${this.escapeHtml(summary)}">
                ${this.escapeHtml(summary)}
              </td>
            </tr>
          `;
        }).join("");
      }

      modal.innerHTML = `
        <div class="modal-window-1c" style="width: 530px; max-width: 95vw; background: #f0eee3; border: 1px solid #7f9db9; box-shadow: 0 4px 25px rgba(0,0,0,0.45); font-family: Tahoma, 'MS Sans Serif', Arial, sans-serif; font-size: 11px; display: flex; flex-direction: column;">
          
          <!-- Header -->
          <div class="modal-header-1c" style="background: linear-gradient(to bottom, #fdfdfe, #d6d9e0); padding: 5px 8px; border-bottom: 1px solid #a0a0a0; display: flex; align-items: center; justify-content: space-between;">
            <div style="font-weight: bold; color: #000; font-size: 11px; display: flex; align-items: center; gap: 6px;">
              <span>💾⚙️</span>
              <span>${this.escapeHtml(this.currentSaveOptions.title)}</span>
            </div>
            <button type="button" class="window-btn-close" onclick="C1PresetComponent.closeSave()" style="width: 17px; height: 17px; border: 1px solid #7f9db9; background: #e5e2cf; cursor: pointer; display: flex; align-items: center; justify-content: center;">✕</button>
          </div>

          <!-- Body -->
          <div style="padding: 12px; display: flex; flex-direction: column; gap: 10px;">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <label style="font-weight: bold; color: #002060;">
                  Сохраненные настройки (${presets.length}):
                </label>
                <span style="font-size: 10px; color: #666;">(кликните по строке, чтобы перезаписать)</span>
              </div>
              <div style="border: 1px solid #7f9db9; background: #ffffff; max-height: 130px; overflow-y: auto;">
                <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                  <thead style="background: #e3dec9; border-bottom: 1px solid #b0af9f; position: sticky; top: 0; z-index: 1;">
                    <tr style="height: 20px; text-align: left; font-size: 10px; color: #333;">
                      <th style="width: 26px; text-align: center; border-right: 1px solid #d0cfc7;">⭐</th>
                      <th style="padding: 2px 8px; border-right: 1px solid #d0cfc7; width: 160px;">Имя настройки</th>
                      <th style="padding: 2px 8px;">Условия</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${tableRowsHtml}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <label style="display: block; font-weight: bold; margin-bottom: 4px; color: #222;">
                Имя настройки:
              </label>
              <input type="text" id="c1PresetSaveNameInput"
                     style="width: 100%; height: 24px; padding: 2px 6px; font-size: 11px; border: 1px solid #7f9db9; background: #fffde7; font-weight: bold; color: #002060; outline: none; box-sizing: border-box;"
                     value="${this.escapeHtml(defaultName)}"
                     onkeydown="if(event.key==='Enter') C1PresetComponent.confirmSave()">
            </div>

            <div style="margin-top: 2px;">
              <label style="display: inline-flex; align-items: center; gap: 6px; cursor: pointer; user-select: none;">
                <input type="checkbox" id="c1PresetSaveIsDefaultCheck" style="cursor: pointer; width: 14px; height: 14px;">
                <span style="font-size: 11px; color: #222;">Открывать по умолчанию при каждом открытии (⭐)</span>
              </label>
            </div>
          </div>

          <!-- Footer -->
          <div style="padding: 8px 12px; background: #e5e2cf; border-top: 1px solid #b0af9f; display: flex; justify-content: flex-end; align-items: center; gap: 8px;">
            <button type="button" class="btn-1c btn-1c-primary" onclick="C1PresetComponent.confirmSave()" style="height: 24px; min-width: 90px; font-weight: bold; background: linear-gradient(to bottom, #ffea88, #d8a020); border: 1px solid #7c6817; color: #000; cursor: pointer;">
              Сохранить
            </button>
            <button type="button" class="btn-1c" onclick="C1PresetComponent.closeSave()" style="height: 24px; min-width: 75px; border: 1px solid #7f9db9; background: #e0dfd5; cursor: pointer;">
              Закрыть
            </button>
          </div>

        </div>
      `;
    },

    pickSaveName(name) {
      const inp = document.getElementById("c1PresetSaveNameInput");
      if (inp) {
        inp.value = name;
        inp.focus();
        inp.select();
      }
    },

    confirmSave() {
      if (!this.currentSaveOptions) return;
      const inp = document.getElementById("c1PresetSaveNameInput");
      const name = inp ? inp.value.trim() : "";
      if (!name) {
        alert("Пожалуйста, введите имя настройки.");
        if (inp) inp.focus();
        return;
      }

      const isDefCheck = document.getElementById("c1PresetSaveIsDefaultCheck");
      const isDefault = isDefCheck ? Boolean(isDefCheck.checked) : false;

      let settingsData = null;
      if (typeof this.currentSaveOptions.getSettings === "function") {
        try {
          settingsData = this.currentSaveOptions.getSettings();
        } catch (e) {
          console.error("[C1PresetComponent] Error calling getSettings:", e);
        }
      }

      const context = this.currentSaveOptions.context;
      const presets = this.getPresets(context);

      const existingIdx = presets.findIndex(p => p.name.trim().toLowerCase() === name.toLowerCase());
      const isUpdate = (existingIdx >= 0);

      const presetObj = {
        id: isUpdate ? presets[existingIdx].id : ("preset_" + Date.now()),
        name: name,
        isDefault: isDefault,
        data: settingsData ? JSON.parse(JSON.stringify(settingsData)) : null,
        updatedAt: new Date().toISOString()
      };

      if (isDefault) {
        presets.forEach(p => p.isDefault = false);
      }

      if (isUpdate) {
        presets[existingIdx] = presetObj;
      } else {
        presets.push(presetObj);
      }

      this.savePresets(context, presets);

      if (typeof this.currentSaveOptions.onSaved === "function") {
        try {
          this.currentSaveOptions.onSaved(presetObj);
        } catch (e) {}
      }

      this.closeSave();
    },

    /* ------------------------------------------------------------------------
       HELPERS
       ------------------------------------------------------------------------ */
    escapeHtml(str) {
      if (!str) return "";
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    },

    escapeAttr(str) {
      if (!str) return "";
      return String(str)
        .replace(/"/g, "&quot;")
        .replace(/'/g, "\\'");
    }
  };

  // Expose to window
  window.C1PresetComponent = C1PresetComponent;

})(window);
