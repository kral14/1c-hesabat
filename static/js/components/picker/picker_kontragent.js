/**
 * ======================================================================
 * 1C:ENTERPRISE - ARAYIŞ SEÇİCİ BÖLMƏSİ: KONTRAGENT İŞÇİSİ
 * static/js/components/picker/picker_kontragent.js
 * 
 * Kontragentlər (Müştərilər / Təchizatçılar) üçün ixtisaslaşmış seçim işçisi.
 * Kod, VÖEN, müqavilə və ad axtarışını, avtotamamlanmanı idarə edir.
 * ======================================================================
 */

(function (window) {
  'use strict';

  const PickerKontragent = {
    catalogName: 'Контрагенты',

    renderHtml: function (cfg = {}) {
      return window.PickerGeneric ? window.PickerGeneric.renderHtml({
        ...cfg,
        catalog: this.catalogName,
        placeholder: cfg.placeholder || 'Kontragenti seçin (Ad, kod və ya VÖEN)...'
      }) : '';
    },

    attach: function (containerEl, cfg = {}) {
      if (!window.PickerGeneric) return;
      window.PickerGeneric.attach(containerEl, {
        ...cfg,
        catalog: this.catalogName,
        onSelect: (item, valStr) => {
          if (typeof cfg.onSelect === 'function') {
            cfg.onSelect(item, valStr);
          }
        }
      });

      // Kontragent üçün cəld axtarış / avtotamamlanma bağlayırıq
      const inputEl = containerEl.querySelector('.c1-picker-input');
      if (inputEl) {
        inputEl.addEventListener('keydown', (e) => {
          if (e.key === 'F4') {
            e.preventDefault();
            this.open(inputEl, cfg);
          }
        });
      }
    },

    open: function (targetInput, cfg = {}) {
      if (window.CatalogSelector) {
        CatalogSelector.open({
          catalog: this.catalogName,
          targetInput: targetInput,
          search: targetInput ? targetInput.value : '',
          onSelect: (selected) => {
            const name = (typeof selected === 'string') ? selected : (selected ? (selected.name || selected.code || '') : '');
            if (targetInput) {
              targetInput.value = name;
              const clearBtn = targetInput.parentNode ? targetInput.parentNode.querySelector('.c1-picker-clear-btn') : null;
              if (clearBtn) clearBtn.style.display = name ? 'inline-block' : 'none';
            }
            if (typeof cfg.onSelect === 'function') cfg.onSelect(selected, name);
          }
        });
      }
    }
  };

  window.PickerKontragent = PickerKontragent;
})(window);
