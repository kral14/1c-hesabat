/**
 * ======================================================================
 * 1C:ENTERPRISE - ARAYIŞ SEÇİCİ BÖLMƏSİNİN İDARƏÇİSİ
 * static/js/components/picker/catalog_picker_manager.js
 * 
 * Bütün arayış işçilərini (Kontragent, Nomenklatura, Anbar, Sürücü və s.)
 * koordinasiya edən baş idarəçi (Department Manager).
 * ======================================================================
 */

(function (window) {
  'use strict';

  const CatalogPickerManager = {
    /**
     * Tələb olunan arayışa uyğun xüsusi işçini tapır
     */
    getWorker: function (catalogName = '') {
      const cat = String(catalogName || '').toLowerCase().trim();

      if (cat.includes('контрагент') || cat.includes('клиент') || cat.includes('покупател')) {
        return window.PickerKontragent || window.PickerGeneric;
      }
      if (cat.includes('номенклатур') || cat.includes('товар') || cat.includes('услуг')) {
        return window.PickerNomenklatura || window.PickerGeneric;
      }
      if (cat.includes('склад')) {
        return window.PickerWarehouse || window.PickerGeneric;
      }
      if (cat.includes('водител')) {
        return window.PickerVoditel || window.PickerGeneric;
      }

      return window.PickerGeneric;
    },

    /**
     * Vahid HTML render metodu
     */
    render: function (cfg = {}) {
      const worker = this.getWorker(cfg.catalog);
      if (worker && typeof worker.renderHtml === 'function') {
        return worker.renderHtml(cfg);
      }
      return window.PickerGeneric ? window.PickerGeneric.renderHtml(cfg) : '';
    },

    /**
     * DOM elementinə hadisələri bağlamaq
     */
    attach: function (containerEl, cfg = {}) {
      const worker = this.getWorker(cfg.catalog || (containerEl ? containerEl.dataset.catalog : ''));
      if (worker && typeof worker.attach === 'function') {
        worker.attach(containerEl, cfg);
      } else if (window.PickerGeneric) {
        window.PickerGeneric.attach(containerEl, cfg);
      }
    },

    /**
     * Birbaşa modal seçim dialoqunu açmaq
     */
    open: function (catalogName, targetInput, cfg = {}) {
      const worker = this.getWorker(catalogName);
      if (worker && typeof worker.open === 'function') {
        worker.open(targetInput, cfg);
      } else if (window.PickerGeneric) {
        window.PickerGeneric.openCatalogSelector(catalogName, targetInput, cfg);
      }
    }
  };

  window.CatalogPickerManager = CatalogPickerManager;
  window.OneCCatalogPicker = CatalogPickerManager;
})(window);
