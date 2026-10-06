/**
 * ========================================================================
 * 1C:ENTERPRISE - REUSABLE COLUMN SETTINGS COMPONENT
 * static/js/c1_column_settings.js
 *
 * Universal, reusable 1C dialog for managing table columns across any window:
 * - Column visibility toggle (checkbox)
 * - Order rearrangement (⇧ Вверх / ⇩ Вниз)
 * - Custom header labels (Заголовок колонки)
 * - Width control (Автоматическая / Вручную в пикселях)
 * - Select All / Deselect All
 * - Reset to defaults (Стандартные настройки)
 * - LocalStorage persistence and graceful schema merge
 * ========================================================================
 */

const OneCColumnSettings = {
  currentOptions: null,
  tempColumns: [],
  selectedIdx: 0,
  modalEl: null,

  /**
   * Escape HTML special characters for safe rendering.
   */
  escapeHtml: function(text) {
    if (text === null || text === undefined) return "";
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  },

  /**
   * Load saved columns from LocalStorage or return defaults.
   * Merges user customizations with defaultCols so any newly added columns
   * are preserved and appended automatically.
   */
  load: function(storageKey, defaultCols) {
    if (!storageKey || !defaultCols) {
      return JSON.parse(JSON.stringify(defaultCols || []));
    }
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        return JSON.parse(JSON.stringify(defaultCols));
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return JSON.parse(JSON.stringify(defaultCols));
      }

      const result = [];
      const defaultMap = new Map();
      defaultCols.forEach(col => defaultMap.set(col.key, col));

      // 1. Maintain saved order and overridden properties for recognized columns
      parsed.forEach(savedCol => {
        if (defaultMap.has(savedCol.key)) {
          const def = defaultMap.get(savedCol.key);
          result.push(Object.assign({}, def, savedCol));
          defaultMap.delete(savedCol.key);
        }
      });

      // 2. Append any brand new columns defined in defaultCols that weren't in storage
      defaultMap.forEach(newCol => {
        result.push(JSON.parse(JSON.stringify(newCol)));
      });

      return result;
    } catch (e) {
      console.warn("[OneCColumnSettings] Could not load from localStorage:", e);
      return JSON.parse(JSON.stringify(defaultCols));
    }
  },

  /**
   * Save columns config to LocalStorage.
   */
  save: function(storageKey, columns) {
    if (!storageKey || !columns) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(columns));
    } catch (e) {
      console.error("[OneCColumnSettings] Could not save to localStorage:", e);
    }
  },

  /**
   * Open the column settings dialog modal.
   * @param {Object} options
   *   - title: string (window/table title)
   *   - columns: array of column configs
   *   - defaultColumns: array of baseline column configs
   *   - storageKey: string for localStorage
   *   - onApply: function(updatedColumns)
   *   - onReset: function(defaultColumns) (optional)
   */
  open: function(options) {
    if (!options || !Array.isArray(options.columns)) {
      console.error("[OneCColumnSettings] Invalid options provided to open()");
      return;
    }

    this.currentOptions = options;
    this.tempColumns = JSON.parse(JSON.stringify(options.columns));
    this.selectedIdx = 0;

    let modal = document.getElementById("oneCColumnSettingsModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "oneCColumnSettingsModal";
      modal.className = "modal-overlay-1c";
      modal.style.cssText = "display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.35); z-index: 10000; align-items: center; justify-content: center;";
      document.body.appendChild(modal);

      // Close modal on Escape
      window.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && modal.style.display === "flex") {
          e.preventDefault();
          OneCColumnSettings.close();
        }
      });
    }
    this.modalEl = modal;

    this.renderModalContent();
    modal.style.display = "flex";
  },

  /**
   * Close the modal without applying unsaved changes.
   */
  close: function() {
    if (this.modalEl) {
      this.modalEl.style.display = "none";
    }
  },

  /**
   * Render or re-render dialog layout and column tree.
   */
  renderModalContent: function() {
    if (!this.modalEl) return;

    const cols = this.tempColumns;
    if (this.selectedIdx >= cols.length) this.selectedIdx = Math.max(0, cols.length - 1);
    const selIdx = this.selectedIdx;
    const selCol = cols[selIdx] || null;

    let rowsHtml = "";
    cols.forEach((col, idx) => {
      const isSelected = (idx === selIdx);
      const bg = isSelected ? "#316ac5" : (idx % 2 === 1 ? "#f9f8f4" : "#ffffff");
      const fg = isSelected ? "#ffffff" : "#111111";
      const isChecked = (col.visible !== false);

      rowsHtml += `
        <tr style="background: ${bg}; color: ${fg}; height: 23px; cursor: pointer; user-select: none;"
            onclick="OneCColumnSettings.selectRow(${idx})">
          <td style="width: 28px; text-align: center; border: 1px solid #d4d0c8;">
            <input type="checkbox" ${isChecked ? "checked" : ""}
                   onclick="event.stopPropagation(); OneCColumnSettings.toggleColVisibility(${idx}, this.checked)"
                   style="cursor: pointer; vertical-align: middle;">
          </td>
          <td style="width: 24px; text-align: center; border: 1px solid #d4d0c8; font-size: 11px;">
            📄
          </td>
          <td style="padding: 2px 6px; border: 1px solid #d4d0c8; font-size: 11px; font-weight: ${isSelected ? 'bold' : 'normal'}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${this.escapeHtml(col.label || col.key)}
          </td>
        </tr>
      `;
    });

    const isAuto = selCol ? Boolean(selCol.autoWidth) : false;
    const widthVal = selCol ? (selCol.width || 100) : 100;
    const isVisible = selCol ? (selCol.visible !== false) : true;
    const labelVal = selCol ? (selCol.label || "") : "";
    const title = (this.currentOptions && this.currentOptions.title) || "Таблица";

    this.modalEl.innerHTML = `
      <div class="modal-window-1c" style="width: 630px; max-height: 85vh; display: flex; flex-direction: column; background: #f0eee3; border: 1px solid #7f9db9; box-shadow: 0 6px 24px rgba(0,0,0,0.4); font-family: Tahoma, 'MS Sans Serif', Arial, sans-serif; font-size: 11px; border-radius: 2px; overflow: hidden;">
        
        <!-- Header -->
        <div class="modal-header-1c" style="background: linear-gradient(to bottom, #fdfdfe, #d6d9e0); padding: 5px 8px; border-bottom: 1px solid #a0a0a0; display: flex; align-items: center; justify-content: space-between; user-select: none;">
          <div style="font-weight: bold; color: #000; font-size: 11px; display: flex; align-items: center; gap: 6px;">
            <span>📋</span>
            <span>Настройка формы: ${this.escapeHtml(title)}</span>
          </div>
          <button type="button" class="window-btn-close" onclick="OneCColumnSettings.close()" style="width: 17px; height: 17px; border: 1px solid #7f9db9; background: #e5e2cf; cursor: pointer; font-size: 10px; line-height: 14px; padding: 0;">✕</button>
        </div>

        <!-- Toolbar (⇧ Вверх, ⇩ Вниз, ☑️ Все, ◻️ Снять, 🔄 Стандартные) -->
        <div style="padding: 4px 8px; background: #e5e2cf; border-bottom: 1px solid #b0af9f; display: flex; align-items: center; gap: 4px;">
          <button type="button" class="btn-1c" onclick="OneCColumnSettings.moveColUp()" title="Переместить вверх (⇧)" style="height: 23px; padding: 0 7px; display: inline-flex; align-items: center; gap: 4px; font-weight: bold; font-size: 12px; color: #004080; cursor: pointer;">
            <span>⇧</span>
            <span style="font-size: 11px; font-weight: normal;">Вверх</span>
          </button>
          <button type="button" class="btn-1c" onclick="OneCColumnSettings.moveColDown()" title="Переместить вниз (⇩)" style="height: 23px; padding: 0 7px; display: inline-flex; align-items: center; gap: 4px; font-weight: bold; font-size: 12px; color: #004080; cursor: pointer;">
            <span>⇩</span>
            <span style="font-size: 11px; font-weight: normal;">Вниз</span>
          </button>

          <div style="height: 18px; width: 1px; background: #b0af9f; margin: 0 4px;"></div>

          <button type="button" class="btn-1c" onclick="OneCColumnSettings.toggleAll(true)" title="Показать все колонки" style="height: 23px; padding: 0 6px; font-size: 11px; cursor: pointer;">
            ☑️ Все
          </button>
          <button type="button" class="btn-1c" onclick="OneCColumnSettings.toggleAll(false)" title="Снять все отметки" style="height: 23px; padding: 0 6px; font-size: 11px; cursor: pointer;">
            ◻️ Снять
          </button>

          <div style="height: 18px; width: 1px; background: #b0af9f; margin: 0 4px;"></div>

          <button type="button" class="btn-1c" onclick="OneCColumnSettings.resetToDefault()" title="Восстановить стандартные настройки" style="height: 23px; padding: 0 7px; display: inline-flex; align-items: center; gap: 4px; font-size: 11px; cursor: pointer;">
            <span>🔄</span>
            <span>Стандартные настройки</span>
          </button>
        </div>

        <!-- Body: Left list + Right properties -->
        <div style="display: flex; flex: 1; min-height: 280px; max-height: 420px; padding: 6px; gap: 8px; overflow: hidden; background: #f0eee3;">
          
          <!-- Left: Columns Table Tree -->
          <div style="flex: 1.25; display: flex; flex-direction: column; background: #fff; border: 1px solid #7f9db9;">
            <div style="background: #e3dec9; padding: 3px 6px; font-weight: bold; font-size: 11px; border-bottom: 1px solid #b0af9f; display: flex; align-items: center; gap: 4px;">
              <span>📁</span>
              <span>Элементы формы (Список колонок)</span>
            </div>
            <div style="flex: 1; overflow-y: auto;">
              <table style="width: 100%; border-collapse: collapse;">
                <tbody>
                  ${rowsHtml}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Right: Selected Column Properties (Свойства элемента) -->
          <div style="flex: 1; display: flex; flex-direction: column; background: #ffffff; border: 1px solid #7f9db9; padding: 8px;">
            <div style="font-weight: bold; color: #003366; font-size: 11px; border-bottom: 1px solid #d4d0c8; padding-bottom: 4px; margin-bottom: 8px;">
              Свойства элемента:
            </div>

            ${selCol ? `
              <!-- 1. Column Label -->
              <div style="margin-bottom: 10px;">
                <label style="display: block; margin-bottom: 2px; font-size: 11px; color: #333;">Заголовок колонки:</label>
                <input type="text" id="csPropLabelInput" class="input-1c" value="${this.escapeHtml(labelVal)}"
                       oninput="OneCColumnSettings.updateSelectedProp('label', this.value)"
                       style="width: 100%; height: 22px; font-size: 11px; padding: 2px 6px; border: 1px solid #7f9db9;">
              </div>

              <!-- 2. Visibility Checkbox -->
              <div style="margin-bottom: 12px;">
                <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 11px; cursor: pointer; user-select: none;">
                  <input type="checkbox" id="csPropVisibleInput" ${isVisible ? "checked" : ""}
                         onchange="OneCColumnSettings.updateSelectedProp('visible', this.checked)"
                         style="cursor: pointer;">
                  <span>Отображать в списке (Видимость)</span>
                </label>
              </div>

              <!-- 3. Width Box -->
              <div style="border: 1px solid #d4d0c8; background: #fdfdfd; padding: 8px; border-radius: 2px; margin-bottom: 10px;">
                <div style="font-weight: bold; font-size: 11px; color: #222; margin-bottom: 6px;">Ширина колонки:</div>
                
                <div style="margin-bottom: 6px;">
                  <label style="display: inline-flex; align-items: center; gap: 5px; font-size: 11px; cursor: pointer; user-select: none;">
                    <input type="radio" name="csPropWidthRadio" value="auto" ${isAuto ? "checked" : ""}
                           onchange="OneCColumnSettings.updateSelectedProp('autoWidth', true)">
                    <span>Автоматическая ширина (Авто)</span>
                  </label>
                </div>

                <div>
                  <label style="display: inline-flex; align-items: center; gap: 5px; font-size: 11px; cursor: pointer; user-select: none;">
                    <input type="radio" name="csPropWidthRadio" value="custom" ${!isAuto ? "checked" : ""}
                           onchange="OneCColumnSettings.updateSelectedProp('autoWidth', false)">
                    <span>Вручную (пикс.):</span>
                  </label>
                  <input type="number" id="csPropWidthInput" class="input-1c" value="${widthVal}" min="30" max="800" step="5"
                         oninput="OneCColumnSettings.updateSelectedProp('width', parseInt(this.value) || 100)"
                         style="width: 70px; height: 22px; margin-left: 6px; font-size: 11px; text-align: right; border: 1px solid #7f9db9;" ${isAuto ? "disabled" : ""}>
                </div>
              </div>

              <!-- Order hint -->
              <div style="color: #666; font-size: 10px; line-height: 1.4; margin-top: auto; background: #f7f6f0; padding: 6px; border: 1px dashed #d4d0c8;">
                💡 <em>Используйте кнопки <strong>Вверх (⇧)</strong> и <strong>Вниз (⇩)</strong> для изменения порядка колонок.</em>
              </div>
            ` : `
              <div style="color: #777; font-size: 11px; padding: 20px; text-align: center;">
                Выберите колонку слева для настройки
              </div>
            `}

          </div>

        </div>

        <!-- Footer Buttons -->
        <div style="padding: 6px 10px; background: #e5e2cf; border-top: 1px solid #b0af9f; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <button type="button" class="btn-1c" onclick="OneCColumnSettings.resetToDefault()" style="height: 24px; padding: 0 10px; font-size: 11px; cursor: pointer;">
              Стандартные
            </button>
          </div>
          <div style="display: flex; gap: 6px;">
            <button type="button" class="btn-1c btn-1c-primary" onclick="OneCColumnSettings.saveAndClose()" style="height: 24px; min-width: 65px; font-weight: bold; cursor: pointer;">
              ОК
            </button>
            <button type="button" class="btn-1c" onclick="OneCColumnSettings.applyChanges()" style="height: 24px; padding: 0 10px; cursor: pointer;">
              Применить
            </button>
            <button type="button" class="btn-1c" onclick="OneCColumnSettings.close()" style="height: 24px; min-width: 65px; cursor: pointer;">
              Отмена
            </button>
          </div>
        </div>

      </div>
    `;
  },

  selectRow: function(idx) {
    this.selectedIdx = idx;
    this.renderModalContent();
  },

  toggleColVisibility: function(idx, checked) {
    if (this.tempColumns[idx]) {
      this.tempColumns[idx].visible = checked;
      this.renderModalContent();
    }
  },

  toggleAll: function(checked) {
    this.tempColumns.forEach(c => {
      c.visible = checked;
    });
    this.renderModalContent();
  },

  updateSelectedProp: function(prop, val) {
    const col = this.tempColumns[this.selectedIdx];
    if (!col) return;
    col[prop] = val;
    if (prop === "autoWidth") {
      const inp = document.getElementById("csPropWidthInput");
      if (inp) inp.disabled = val;
    }
  },

  moveColUp: function() {
    const idx = this.selectedIdx;
    if (idx > 0) {
      const [col] = this.tempColumns.splice(idx, 1);
      this.tempColumns.splice(idx - 1, 0, col);
      this.selectedIdx = idx - 1;
      this.renderModalContent();
    }
  },

  moveColDown: function() {
    const idx = this.selectedIdx;
    if (idx < this.tempColumns.length - 1) {
      const [col] = this.tempColumns.splice(idx, 1);
      this.tempColumns.splice(idx + 1, 0, col);
      this.selectedIdx = idx + 1;
      this.renderModalContent();
    }
  },

  resetToDefault: function() {
    if (!confirm("Восстановить стандартные настройки колонок (видимость, порядок и ширину)?")) return;

    if (this.currentOptions && this.currentOptions.storageKey) {
      localStorage.removeItem(this.currentOptions.storageKey);
    }

    const defaultCols = (this.currentOptions && this.currentOptions.defaultColumns) || [];
    this.tempColumns = JSON.parse(JSON.stringify(defaultCols));
    this.selectedIdx = 0;
    this.renderModalContent();

    if (this.currentOptions && typeof this.currentOptions.onReset === "function") {
      this.currentOptions.onReset(defaultCols);
    } else if (this.currentOptions && typeof this.currentOptions.onApply === "function") {
      this.currentOptions.onApply(this.tempColumns);
    }
  },

  applyChanges: function() {
    const cols = JSON.parse(JSON.stringify(this.tempColumns));
    if (this.currentOptions && this.currentOptions.storageKey) {
      this.save(this.currentOptions.storageKey, cols);
    }
    if (this.currentOptions && typeof this.currentOptions.onApply === "function") {
      this.currentOptions.onApply(cols);
    }
  },

  saveAndClose: function() {
    this.applyChanges();
    this.close();
  }
};

window.OneCColumnSettings = OneCColumnSettings;
