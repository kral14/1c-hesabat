/**
 * ======================================================================
 * 1C:ENTERPRISE - FİLTR BÖLMƏSİNİN İDARƏÇİSİ
 * static/js/components/filter/filter_manager.js
 * 
 * Bütün filtr işçilərini (Toolbar, SearchBox, Chips, CriteriaModal)
 * koordinasiya edən baş idarəçi (Department Manager).
 * 
 * İstənilən jurnala / cədvələ sadəcə 1 sətirlə qoşulur:
 * FilterManager.create({ ... })
 * ======================================================================
 */

(function (window) {
  'use strict';

  const FilterManager = {
    /**
     * Vahid Filtr Zolağını yaradır və idarə edir
     * @param {Object} cfg
     *   - containerId: hədəf toolbar DOM elementi və ya ID-si
     *   - chipsContainerId: aktiv filtrlər zolağının konteyneri
     *   - getAvailableFields: () => [{ key, label, catalog }, ...]
     *   - onFilterChange: (criteriaList, searchTerm) => void
     *   - onQuickFilter: (colKey, cellValue) => void
     */
    create: function (cfg = {}) {
      const instance = {
        criteria: [],
        searchTerm: '',
        cfg: cfg,

        // İşçilərə istinadlar
        toolbar: window.FilterToolbar,
        searchBox: window.FilterSearchBox,
        chipsBar: window.FilterChipsBar,
        modal: window.FilterCriteriaModal,

        /**
         * Filtr toolbarını hədəf konteynerə render edir
         */
        attach: function (toolbarEl, chipsEl) {
          this.toolbarEl = (typeof toolbarEl === 'string') ? document.getElementById(toolbarEl) : toolbarEl;
          this.chipsEl = (typeof chipsEl === 'string') ? document.getElementById(chipsEl) : chipsEl;

          // 1. Toolbar düymələri hadisələri
          if (this.toolbarEl && this.toolbar) {
            this.toolbar.attach(this.toolbarEl, {
              onOpenModal: () => this.openCriteriaModal(),
              onQuickFilter: () => {
                if (typeof this.cfg.onQuickFilter === 'function') this.cfg.onQuickFilter();
              },
              onRemoveColumnFilter: () => {
                if (typeof this.cfg.onRemoveColumnFilter === 'function') this.cfg.onRemoveColumnFilter();
              },
              onClearAll: () => this.clearAll(),
              onRestorePreset: () => {
                if (typeof this.cfg.onRestorePreset === 'function') this.cfg.onRestorePreset();
              },
              onSavePreset: () => {
                if (typeof this.cfg.onSavePreset === 'function') this.cfg.onSavePreset();
              }
            });
          }

          // 2. Axtarış xanası hadisələri
          if (this.toolbarEl && this.searchBox) {
            this.searchBox.attach(this.toolbarEl, {
              onInput: (val) => {
                this.searchTerm = val;
                if (typeof this.cfg.onSearchInput === 'function') this.cfg.onSearchInput(val);
              },
              onSearch: (val) => {
                this.searchTerm = val;
                this.notifyChange();
              },
              onClear: () => {
                this.searchTerm = '';
                this.notifyChange();
              }
            });
          }

          this.updateUI();
          return this;
        },

        /**
         * Meyarlar modalını açır
         */
        openCriteriaModal: function () {
          if (!this.modal) return;
          const fields = (typeof this.cfg.getAvailableFields === 'function') ? this.cfg.getAvailableFields() : [];
          this.modal.open({
            fields: fields,
            criteria: this.criteria,
            onApply: (newCriteria) => {
              this.criteria = newCriteria;
              this.updateUI();
              this.notifyChange();
            }
          });
        },

        /**
         * Birbaşa cəld filtr əlavə edir (Məsələn, F7 düyməsi basıldıqda)
         */
        addQuickFilter: function (fieldKey, fieldLabel, value, comparison = 'Равно') {
          if (!fieldKey || value === undefined) return;
          // Eyni sahə varsa yenilə, yoxsa əlavə et
          const existing = this.criteria.find(c => c.fieldKey === fieldKey);
          if (existing) {
            existing.value = value;
            existing.enabled = true;
          } else {
            this.criteria.push({
              enabled: true,
              fieldKey: fieldKey,
              fieldLabel: fieldLabel || fieldKey,
              comparison: comparison,
              value: value
            });
          }
          this.updateUI();
          this.notifyChange();
        },

        /**
         * Tək bir sütun üzrə filtri silir
         */
        removeColumnFilter: function (colKey) {
          this.criteria = this.criteria.filter(c => c.fieldKey !== colKey);
          this.updateUI();
          this.notifyChange();
        },

        /**
         * Bütün filtrləri tam təmizləyir
         */
        clearAll: function () {
          this.criteria = [];
          this.searchTerm = '';
          if (this.toolbarEl) {
            const searchInput = this.toolbarEl.querySelector('.c1-search-input');
            if (searchInput) searchInput.value = '';
          }
          this.updateUI();
          this.notifyChange();
        },

        /**
         * UI elementlərini (Say nişanı, Chips zolağı, düymələr) yeniləyir
         */
        updateUI: function () {
          const activeCriteria = this.criteria.filter(c => c.enabled !== false && c.value !== '');
          const count = activeCriteria.length;

          // 1. Toolbar say nişanı və düymələri
          if (this.toolbar && this.toolbarEl) {
            this.toolbar.updateState(this.toolbarEl, {
              count: count,
              hasColumnFilter: count > 0
            });
          }

          // 2. Chips zolağı
          if (this.chipsBar && this.chipsEl) {
            this.chipsBar.update(
              this.chipsEl,
              activeCriteria,
              (idx, item) => {
                // Tək bir çipi sil
                this.criteria = this.criteria.filter(c => c !== item);
                this.updateUI();
                this.notifyChange();
              },
              () => {
                // Bütün çipləri sil
                this.clearAll();
              }
            );
          }
        },

        notifyChange: function () {
          if (typeof this.cfg.onFilterChange === 'function') {
            this.cfg.onFilterChange(this.criteria, this.searchTerm);
          }
        }
      };

      return instance;
    }
  };

  window.FilterManager = FilterManager;
  window.OneCFilterBar = FilterManager;
})(window);
