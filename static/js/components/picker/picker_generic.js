/**
 * ======================================================================
 * 1C:ENTERPRISE - ARAYIŞ SEÇİCİ BÖLMƏSİ: STANDART İŞÇİ
 * static/js/components/picker/picker_generic.js
 * 
 * Standart 1C arayışları üçün seçim xanası və modal açıcı.
 * ======================================================================
 */

(function (window) {
  'use strict';

  const PickerGeneric = {
    /**
     * Standart 1C arayış sahəsi HTML-i yaradır: [ Dəyər xanası ] [...] [✕]
     */
    renderHtml: function (cfg = {}) {
      const id = cfg.id || 'c1PickerGeneric_' + Math.random().toString(36).substr(2, 6);
      const catalog = cfg.catalog || 'Справочник';
      const value = cfg.value || '';
      const placeholder = cfg.placeholder || `Seçin: ${catalog}...`;
      const width = cfg.width || '100%';

      return `
        <div class="c1-catalog-picker-wrap" id="${id}_wrap" data-catalog="${catalog}" style="display:inline-flex;align-items:center;border:1px solid #7f9db9;background:#fff;border-radius:2px;height:24px;width:${width};box-sizing:border-box;">
          <input type="text" id="${id}" class="c1-picker-input" value="${this.escapeHtml(value)}" placeholder="${placeholder}" autocomplete="off"
                 style="flex:1;border:none;outline:none;font-size:11px;padding:0 6px;background:transparent;min-width:40px;">
          <button type="button" class="btn-1c c1-picker-clear-btn" title="Təmizlə"
                  style="border:none;background:transparent;cursor:pointer;padding:0 3px;font-size:11px;color:#888;display:${value ? 'inline-block' : 'none'};">✕</button>
          <button type="button" class="btn-1c c1-picker-select-btn" title="Siyahıdan seçin (...)"
                  style="border:none;border-left:1px solid #b0af9f;background:#e0dfd5;cursor:pointer;height:100%;padding:0 5px;font-weight:bold;font-size:11px;color:#000;">...</button>
        </div>
      `.trim();
    },

    /**
     * DOM elementinə hadisələri (event listeners) bağlayır
     */
    attach: function (containerEl, cfg = {}) {
      if (!containerEl) return;
      const inputEl = containerEl.querySelector('.c1-picker-input');
      const clearBtn = containerEl.querySelector('.c1-picker-clear-btn');
      const selectBtn = containerEl.querySelector('.c1-picker-select-btn');
      const catalog = cfg.catalog || containerEl.dataset.catalog || 'Справочник';

      if (inputEl) {
        inputEl.oninput = () => {
          if (clearBtn) clearBtn.style.display = inputEl.value ? 'inline-block' : 'none';
          if (typeof cfg.onChange === 'function') cfg.onChange(inputEl.value);
        };
      }

      if (clearBtn) {
        clearBtn.onclick = (e) => {
          e.stopPropagation();
          if (inputEl) {
            inputEl.value = '';
            clearBtn.style.display = 'none';
            inputEl.focus();
            if (typeof cfg.onSelect === 'function') cfg.onSelect(null, '');
            if (typeof cfg.onChange === 'function') cfg.onChange('');
          }
        };
      }

      if (selectBtn) {
        selectBtn.onclick = (e) => {
          e.stopPropagation();
          this.openCatalogSelector(catalog, inputEl, cfg);
        };
      }
    },

    /**
     * 1C Universal CatalogSelector pəncərəsini açır
     */
    openCatalogSelector: function (catalog, targetInput, cfg = {}) {
      if (window.CatalogSelector && typeof CatalogSelector.open === 'function') {
        CatalogSelector.open({
          catalog: catalog,
          targetInput: targetInput,
          search: targetInput ? targetInput.value : '',
          onSelect: (selectedItem) => {
            let valStr = '';
            if (typeof selectedItem === 'string') valStr = selectedItem;
            else if (selectedItem && selectedItem.name) valStr = selectedItem.name;
            else if (selectedItem && selectedItem.code) valStr = selectedItem.code;

            if (targetInput) {
              targetInput.value = valStr;
              const clearBtn = targetInput.parentNode ? targetInput.parentNode.querySelector('.c1-picker-clear-btn') : null;
              if (clearBtn) clearBtn.style.display = valStr ? 'inline-block' : 'none';
            }

            if (typeof cfg.onSelect === 'function') {
              cfg.onSelect(selectedItem, valStr);
            }
          }
        });
      } else {
        console.warn(`[PickerGeneric] CatalogSelector tapılmadı: ${catalog}`);
      }
    },

    escapeHtml: function (str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }
  };

  window.PickerGeneric = PickerGeneric;
})(window);
