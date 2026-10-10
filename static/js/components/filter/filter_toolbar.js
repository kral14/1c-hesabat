/**
 * ======================================================================
 * 1C:ENTERPRISE - FİLTR BÖLMƏSİ: ALƏTLƏR PANELİ İŞÇİSİ
 * static/js/components/filter/filter_toolbar.js
 * 
 * 1C Standart 4 Əsas Filtr Əməliyyatı və Alətlər Zolağı Düymələri:
 * 1. Настройка списка (Отбор и сортировка) + dinamik say nişanı (Badge)
 * 2. Отбор по значению в текущей колонке (F7)
 * 3. Снять отбор по текущей колонке
 * 4. Отключить все отборы
 * 5. Filtr şablonları (Yadda saxla / Bərpa et)
 * ======================================================================
 */

(function (window) {
  'use strict';

  const FilterToolbar = {
    /**
     * Bütün filtr panelini vahid HTML olaraq qaytarır
     */
    renderHtml: function (cfg = {}) {
      const prefix = cfg.prefix || 'c1Filter';

      return `
        <div class="c1-filter-toolbar" id="${prefix}_toolbar" style="display:inline-flex;align-items:center;gap:4px;">
          <!-- 1. Настройка списка (Отбор) -->
          <button type="button" class="btn-1c c1-filter-btn-main" id="${prefix}_btnMain" title="Настройка списка (Отбор и сортировка)..."
                  style="height:24px;padding:0 6px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;background:#ffffff;position:relative;">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="2" y="3" width="8" height="11" rx="1" fill="#f8fafc" stroke="#78909c" stroke-width="1"/>
              <line x1="4" y1="6" x2="8" y2="6" stroke="#90a4ae" stroke-width="0.8"/>
              <line x1="4" y1="8" x2="8" y2="8" stroke="#90a4ae" stroke-width="0.8"/>
              <line x1="4" y1="10" x2="7" y2="10" stroke="#90a4ae" stroke-width="0.8"/>
              <path d="M5.5 2.5 L14.5 2.5 L10.8 7.5 L10.8 13 L8.8 14 L8.8 7.5 Z" fill="#cfd8dc" stroke="#546e7a" stroke-width="1" stroke-linejoin="round"/>
              <path d="M13.5 10 L13.5 14 M11.5 12.5 L13.5 14.5 L15.5 12.5" stroke="#37474f" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span class="c1-filter-badge" id="${prefix}_badge"
                  style="display:none;position:absolute;top:-5px;right:-5px;background:#c62828;color:#ffffff;font-size:9px;font-weight:bold;border-radius:8px;padding:0 4px;min-width:13px;height:13px;line-height:13px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.35);border:1px solid #ffffff;z-index:2;">0</span>
          </button>

          <!-- 2. Отбор по значению в текущей колонке (F7) -->
          <button type="button" class="btn-1c c1-filter-btn-quick" id="${prefix}_btnQuick" title="Отбор по значению в текущей колонке (F7)"
                  style="height:24px;padding:0 6px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;background:#ffffff;">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2.5 2.5 L13.5 2.5 L9.5 7.5 L9.5 13 L7.5 14 L7.5 7.5 Z" fill="#cfd8dc" stroke="#546e7a" stroke-width="1" stroke-linejoin="round"/>
              <rect x="8.5" y="8.5" width="6.5" height="6.5" rx="1" fill="#e1f5fe" stroke="#0288d1" stroke-width="1"/>
              <path d="M9.8 11.8 L11.2 13.2 L14 10" stroke="#0277bd" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>

          <!-- 3. Снять отбор по текущей колонке -->
          <button type="button" class="btn-1c c1-filter-btn-remove-col" id="${prefix}_btnRemoveCol" title="Снять отбор по текущей колонке"
                  style="height:24px;padding:0 6px;display:inline-flex;align-items:center;justify-content:center;cursor:default;background:#ffffff;opacity:0.4;" disabled>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2.5 2.5 L13.5 2.5 L9.5 7.5 L9.5 13 L7.5 14 L7.5 7.5 Z" fill="#cfd8dc" stroke="#546e7a" stroke-width="1" stroke-linejoin="round"/>
              <rect x="8" y="9.5" width="7" height="4.5" rx="1" fill="#ffebee" stroke="#c62828" stroke-width="1"/>
              <line x1="9.5" y1="11.7" x2="13.5" y2="11.7" stroke="#c62828" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
          </button>

          <!-- 4. Отключить все отборы -->
          <button type="button" class="btn-1c c1-filter-btn-clear" id="${prefix}_btnClear" title="Отключить все отборы"
                  style="height:24px;padding:0 6px;display:inline-flex;align-items:center;justify-content:center;cursor:default;background:#ffffff;opacity:0.4;" disabled>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2.5 2.5 L13.5 2.5 L9.5 7.5 L9.5 13 L7.5 14 L7.5 7.5 Z" fill="#cfd8dc" stroke="#546e7a" stroke-width="1" stroke-linejoin="round"/>
              <line x1="9.5" y1="9.5" x2="14.5" y2="14.5" stroke="#d32f2f" stroke-width="2.2" stroke-linecap="round"/>
              <line x1="14.5" y1="9.5" x2="9.5" y2="14.5" stroke="#d32f2f" stroke-width="2.2" stroke-linecap="round"/>
            </svg>
          </button>

          <!-- 5. Filtr şablonu bərpa et -->
          <button type="button" class="btn-1c c1-filter-btn-restore" id="${prefix}_btnRestore" title="Выбрать настройку (Сохраненные фильтры)..."
                  style="height:24px;padding:0 6px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;background:#ffffff;">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1.5 3.5 C1.5 2.8 2 2.5 2.8 2.5 L6 2.5 L7.5 4 L13.5 4 C14.3 4 14.5 4.5 14.5 5.2 L14.5 12 C14.5 12.8 14 13.5 13 13.5 L2.5 13.5 C1.8 13.5 1.5 12.8 1.5 12 Z" fill="#fbc02d" stroke="#f57f17" stroke-width="1"/>
              <circle cx="11.5" cy="11.5" r="3.2" fill="#9e9e9e" stroke="#616161" stroke-width="0.8"/>
              <circle cx="11.5" cy="11.5" r="1.2" fill="#fff"/>
            </svg>
          </button>

          <!-- 6. Filtr şablonunu yadda saxla -->
          <button type="button" class="btn-1c c1-filter-btn-save" id="${prefix}_btnSave" title="Сохранить настройку (Сохранить текущий фильтр)..."
                  style="height:24px;padding:0 6px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;background:#ffffff;">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="2" y="2" width="12" height="12" rx="1.5" fill="#90caf9" stroke="#1565c0" stroke-width="1.1"/>
              <rect x="4.5" y="2" width="7" height="4.5" fill="#fff" stroke="#90caf9" stroke-width="0.8"/>
              <circle cx="11.5" cy="11.5" r="3.2" fill="#9e9e9e" stroke="#616161" stroke-width="0.8"/>
              <circle cx="11.5" cy="11.5" r="1.2" fill="#fff"/>
            </svg>
          </button>
        </div>
      `.trim();
    },

    /**
     * Düymələri və say nişanını cari vəziyyətə görə yeniləyir
     */
    updateState: function (toolbarEl, state = {}) {
      if (!toolbarEl) return;
      const count = Number(state.count || 0);
      const hasColumnFilter = Boolean(state.hasColumnFilter);

      const badge = toolbarEl.querySelector('.c1-filter-badge');
      if (badge) {
        badge.textContent = String(count);
        badge.style.display = count > 0 ? 'inline-block' : 'none';
      }

      const btnClear = toolbarEl.querySelector('.c1-filter-btn-clear');
      if (btnClear) {
        btnClear.disabled = count === 0;
        btnClear.style.opacity = count > 0 ? '1' : '0.4';
        btnClear.style.cursor = count > 0 ? 'pointer' : 'default';
      }

      const btnRemoveCol = toolbarEl.querySelector('.c1-filter-btn-remove-col');
      if (btnRemoveCol) {
        btnRemoveCol.disabled = !hasColumnFilter;
        btnRemoveCol.style.opacity = hasColumnFilter ? '1' : '0.4';
        btnRemoveCol.style.cursor = hasColumnFilter ? 'pointer' : 'default';
      }
    },

    /**
     * Hadisələri (callbacks) bağlayır
     */
    attach: function (toolbarEl, handlers = {}) {
      if (!toolbarEl) return;
      const btnMain = toolbarEl.querySelector('.c1-filter-btn-main');
      const btnQuick = toolbarEl.querySelector('.c1-filter-btn-quick');
      const btnRemoveCol = toolbarEl.querySelector('.c1-filter-btn-remove-col');
      const btnClear = toolbarEl.querySelector('.c1-filter-btn-clear');
      const btnRestore = toolbarEl.querySelector('.c1-filter-btn-restore');
      const btnSave = toolbarEl.querySelector('.c1-filter-btn-save');

      if (btnMain && handlers.onOpenModal) btnMain.onclick = handlers.onOpenModal;
      if (btnQuick && handlers.onQuickFilter) btnQuick.onclick = handlers.onQuickFilter;
      if (btnRemoveCol && handlers.onRemoveColumnFilter) btnRemoveCol.onclick = handlers.onRemoveColumnFilter;
      if (btnClear && handlers.onClearAll) btnClear.onclick = handlers.onClearAll;
      if (btnRestore && handlers.onRestorePreset) btnRestore.onclick = handlers.onRestorePreset;
      if (btnSave && handlers.onSavePreset) btnSave.onclick = handlers.onSavePreset;
    }
  };

  window.FilterToolbar = FilterToolbar;
})(window);
