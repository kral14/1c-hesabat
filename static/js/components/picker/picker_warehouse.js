/**
 * ======================================================================
 * 1C:ENTERPRISE - ARAYIŞ SEÇİCİ BÖLMƏSİ: ANBAR (SKLAD) İŞÇİSİ
 * static/js/components/picker/picker_warehouse.js
 * 
 * Skladlar və anbar növləri üzrə seçim işçisi.
 * ======================================================================
 */

(function (window) {
  'use strict';

  const PickerWarehouse = {
    catalogName: 'Склады',

    renderHtml: function (cfg = {}) {
      return window.PickerGeneric ? window.PickerGeneric.renderHtml({
        ...cfg,
        catalog: this.catalogName,
        placeholder: cfg.placeholder || 'Anbarı seçin...'
      }) : '';
    },

    attach: function (containerEl, cfg = {}) {
      if (!window.PickerGeneric) return;
      window.PickerGeneric.attach(containerEl, {
        ...cfg,
        catalog: this.catalogName
      });
    },

    open: function (targetInput, cfg = {}) {
      if (window.CatalogSelector) {
        CatalogSelector.open({
          catalog: this.catalogName,
          targetInput: targetInput,
          search: targetInput ? targetInput.value : '',
          onSelect: (selected) => {
            const name = (typeof selected === 'string') ? selected : (selected ? (selected.name || '') : '');
            if (targetInput) targetInput.value = name;
            if (typeof cfg.onSelect === 'function') cfg.onSelect(selected, name);
          }
        });
      }
    }
  };

  window.PickerWarehouse = PickerWarehouse;
})(window);
