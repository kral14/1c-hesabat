/**
 * ======================================================================
 * 1C:ENTERPRISE - COUNTERPARTIES DIRECTORY & AUDIT JOURNAL
 * static/js/kontragenty_journal.js
 *
 * Kontragentlər siyahısı, rekvizitlərin tamlığının auditi və 1C Standart Filtr Sistemi:
 * - 1C Filter System: C1FilterComponent.open() (Настройка списка / Отбор)
 * - F7 / Быстрый отбор по значению в текущей колонке
 * - Shift+F7 / Снять отбор по текущей колонке
 * - Отключить все отборы & Aktiv filtrlər zolağı (Chips Bar)
 * - F2 / Lupa ilə kartı açma
 * ======================================================================
 */

(function(window) {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  const KontragentyJournal = {
    currentFilter: 'all',
    currentOffset: 0,
    pageSize: 100,
    totalCount: 0,
    selectedRow: null,
    selectedColKey: 'name',
    items: [],
    activeFilters: [],
    tableComponent: null,

    /**
     * Jurnal pəncərəsini açır
     */
    open: function(filterType = 'all') {
      const win = document.getElementById('kontragentyJournalWindow');
      if (!win) {
        console.warn('[KontragentyJournal] kontragentyJournalWindow tapılmadı');
        return;
      }

      win.style.display = 'flex';
      win.classList.add('active');
      win.classList.remove('minimized');

      if (window.MdiManager && typeof MdiManager.activateWindow === 'function') {
        MdiManager.activateWindow('kontragentyJournalWindow');
      }

      this.currentFilter = filterType;
      this.updateActiveChip();
      this.updateFilterButtonsState();
      this.renderActiveFilterChips();

      if (window.C1SearchBox) {
        C1SearchBox.attach('#kjSearchWrap', {
          onSearch: () => {
            this.currentOffset = 0;
            this.loadData();
          },
          onClear: () => {
            this.currentOffset = 0;
            this.loadData();
          }
        });
      }

      this.loadData();
    },

    /**
     * Pəncərəni bağlayır
     */
    close: function() {
      const win = document.getElementById('kontragentyJournalWindow');
      if (win) {
        win.style.display = 'none';
        win.classList.remove('active');
        win.classList.add('minimized');
      }
      if (window.MdiManager && typeof MdiManager.closeWindow === 'function') {
        try { MdiManager.closeWindow('kontragentyJournalWindow'); } catch (e) {}
      }
    },

    /**
     * Məlumatları yeniləyir
     */
    reload: function() {
      this.loadData();
    },

    /**
     * Audit filter chip seçimi
     */
    setFilter: function(filterType) {
      this.currentFilter = filterType;
      this.currentOffset = 0;
      this.updateActiveChip();
      this.loadData();
    },

    updateActiveChip: function() {
      document.querySelectorAll('.kj-chip').forEach(el => el.classList.remove('active'));
      const activeBtn = document.getElementById(`kjChip-${this.currentFilter}`);
      if (activeBtn) {
        activeBtn.classList.add('active');
      }
    },

    /**
     * Axtarış
     */
    search: function() {
      this.currentOffset = 0;
      this.loadData();
    },

    /**
     * Əvvəlki səhifə
     */
    prevPage: function() {
      if (this.currentOffset > 0) {
        this.currentOffset = Math.max(0, this.currentOffset - this.pageSize);
        this.loadData();
      }
    },

    /**
     * Növbəti səhifə
     */
    nextPage: function() {
      if (this.currentOffset + this.pageSize < this.totalCount) {
        this.currentOffset += this.pageSize;
        this.loadData();
      }
    },

    // ========================================================
    // 1C STANDART FİLTR SİSTEMİ (Bizim Filtr İnteqrasiyası)
    // ========================================================

    getFilterFields: function() {
      const _t = (k, fb) => (window.C1I18n ? window.C1I18n.t(k, fb) : fb);
      return [
        { key: 'name', label: _t('columns.name', 'Наименование'), type: 'text' },
        { key: 'code', label: _t('columns.code', 'Код'), type: 'text' },
        { key: 'inn', label: _t('columns.inn', 'ИНН / VÖEN'), type: 'text' },
        { 
          key: 'access_group', 
          label: _t('columns.access_group', 'Группа доступа к контрагенту'), 
          type: 'select',
          options: [
            { value: 'Bakı', label: 'Bakı' },
            { value: '01.Gence', label: '01.Gence' },
            { value: '02.Sheki', label: '02.Sheki' },
            { value: '03.Sabirabad', label: '03.Sabirabad' },
            { value: '04.Xachmaz', label: '04.Xachmaz' },
            { value: '05.Lenkaran', label: '05.Lenkaran' },
            { value: '06.Naxchivan', label: '06.Naxchivan' },
            { value: 'Fuzuli', label: 'Fuzuli' },
            { value: 'Tesischiler', label: 'Tesischiler' }
          ]
        },
        { 
          key: 'region', 
          label: _t('columns.region', 'Регион'), 
          type: 'select',
          options: [
            { value: 'Баку', label: 'Баку' },
            { value: 'Гянджа', label: 'Гянджа' },
            { value: 'Шеки', label: 'Шеки' },
            { value: 'Сабирабад', label: 'Сабирабад' },
            { value: 'Хачмаз', label: 'Хачмаз' },
            { value: 'Ленкорань', label: 'Ленкорань' },
            { value: 'Нахчыван', label: 'Нахчыван' },
            { value: 'Физули', label: 'Физули' }
          ]
        },
        { key: 'parent', label: _t('columns.parent', 'Группа контрагента (Папка)'), type: 'text' },
        { key: 'golovnoy', label: _t('columns.golovnoy', 'Головной контрагент'), type: 'text' },
        { key: 'address', label: _t('columns.address', 'Адрес доставки'), type: 'text' },
        { key: 'phone', label: _t('columns.phone', 'Телефон контрагента'), type: 'text' },
        { key: 'main_contract', label: _t('columns.main_contract', 'Основной договор'), type: 'text' },
        { key: 'is_holding', label: _t('kj.is_holding', 'Входит в холдинг'), type: 'boolean' },
        { key: 'has_inn', label: _t('kj.has_inn', 'Наличие ИНН (VÖEN)'), type: 'boolean' },
        { key: 'score', label: _t('columns.score', 'Полнота реквизитов (%)'), type: 'number' }
      ];
    },

    /**
     * Bizim C1FilterComponent modalını açır (Настройка списка / Отбор)
     */
    openFilterModal: function() {
      if (window.C1FilterComponent) {
        C1FilterComponent.open({
          contextKey: 'kontragenty_audit',
          docTitle: 'Контрагенты (Справочник и аудит)',
          availableFields: this.getFilterFields(),
          activeFilters: this.activeFilters || [],
          onApply: (filters) => {
            this.activeFilters = filters || [];
            this.currentOffset = 0;
            this.updateFilterButtonsState();
            this.renderActiveFilterChips();
            this.loadData();
          }
        });
      } else {
        alert('C1FilterComponent tapılmadı');
      }
    },

    /**
     * Sütun tənzimləmələri dialoqunu açır (OneCColumnSettings)
     */
    openColumnSettings: function() {
      this.initTableComponent();
      if (this.tableComponent) {
        this.tableComponent.openColumnSettings();
      }
    },

    /**
     * Cari seçilmiş xananın dəyərinə görə sürətli filtr qoyur (F7)
     */
    filterByCurrentValue: function() {
      const row = this.tableComponent ? this.tableComponent.getSelectedRow() : this.selectedRow;
      if (!row) {
        alert('Sürətli filtr tətbiq etmək üçün cədvəldən bir sətir seçin.');
        return;
      }

      const colKey = (this.tableComponent && this.tableComponent.getSelectedColKey()) || this.selectedColKey || 'name';
      let val = row[colKey];
      if (val === undefined || val === null || String(val).trim() === '') {
        // Fallback check if row has data attributes
        if (this.selectedRow && this.selectedRow.getAttribute) {
          if (colKey === 'code') val = this.selectedRow.getAttribute('data-code');
          else if (colKey === 'name') val = this.selectedRow.getAttribute('data-name');
          else if (colKey === 'inn') val = this.selectedRow.getAttribute('data-inn');
        }
      }

      if (val === undefined || val === null || String(val).trim() === '') {
        alert('Seçilmiş sahədə filtr üçün dəyər yoxdur.');
        return;
      }

      val = String(val).trim();
      const fieldDef = this.getFilterFields().find(f => f.key === colKey) || { label: colKey };

      // Əgər artıq bu sahə üzrə filtr varsa, yenilə, yoxdursa əlavə et
      const existingIdx = this.activeFilters.findIndex(f => (f.fieldKey || f.field) === colKey);
      const newRule = {
        fieldKey: colKey,
        fieldLabel: fieldDef.label,
        operator: 'Равно',
        value: val,
        enabled: true
      };

      if (existingIdx >= 0) {
        this.activeFilters[existingIdx] = newRule;
      } else {
        this.activeFilters.push(newRule);
      }

      this.currentOffset = 0;
      this.updateFilterButtonsState();
      this.renderActiveFilterChips();
      this.loadData();
    },

    /**
     * Cari sütunun filtrini çıxarır (Shift+F7)
     */
    removeFilterByCurrentColumn: function() {
      const colKey = (this.tableComponent && this.tableComponent.getSelectedColKey()) || this.selectedColKey || 'name';
      this.activeFilters = this.activeFilters.filter(f => (f.fieldKey || f.field) !== colKey);
      this.currentOffset = 0;
      this.updateFilterButtonsState();
      this.renderActiveFilterChips();
      this.loadData();
    },

    /**
     * Bütün filtrləri söndürür və təmizləyir
     */
    clearFilter: function() {
      this.activeFilters = [];
      this.currentOffset = 0;
      this.updateFilterButtonsState();
      this.renderActiveFilterChips();
      this.loadData();
    },

    /**
     * Sütun üzrə Ctrl+F axtarışını tətbiq edir
     */
    applyColumnFind: function(fieldKey, value, matchMode) {
      if (!value) {
        this.activeFilters = (this.activeFilters || []).filter(c => (c.fieldKey || c.field) !== fieldKey);
      } else {
        const operator = { exact: "Равно", starts: "Начинается с", contains: "Содержит" }[matchMode] || "Содержит";
        const def = (this.getFilterFields ? this.getFilterFields() : []).find(f => f.key === fieldKey);
        const criterion = {
          fieldKey: fieldKey,
          fieldLabel: def?.label || fieldKey,
          comparison: operator,
          operator: operator,
          value: value,
          enabled: true
        };
        if (!Array.isArray(this.activeFilters)) this.activeFilters = [];
        const idx = this.activeFilters.findIndex(c => (c.fieldKey || c.field) === fieldKey);
        if (idx >= 0) this.activeFilters[idx] = criterion;
        else this.activeFilters.push(criterion);
      }
      this.currentOffset = 0;
      this.updateFilterButtonsState();
      this.renderActiveFilterChips();
      this.loadData();
    },

    /**
     * Ctrl+F basıldıqda Universal C1FindModal-ı açır
     */
    openFindModal: function() {
      if (window.C1FindModal) {
        C1FindModal.openForActiveWindow();
      }
    },

    /**
     * Tək bir filtr meyarını silir (Çip üzərində ✕ basıldıqda)
     */
    removeFilterCriterion: function(idx) {
      if (idx >= 0 && idx < this.activeFilters.length) {
        this.activeFilters.splice(idx, 1);
        this.currentOffset = 0;
        this.updateFilterButtonsState();
        this.renderActiveFilterChips();
        this.loadData();
      }
    },

    /**
     * Filtr düymələrinin vəziyyətini yeniləyir (Say nişanı, disabled/enabled)
     */
    updateFilterButtonsState: function() {
      const activeCrits = (this.activeFilters || []).filter(c => c && c.enabled !== false);
      const hasFilter = activeCrits.length > 0;

      // 1. Say Badge-i
      const badge = document.getElementById('kjFilterCountBadge');
      if (badge) {
        if (hasFilter) {
          badge.textContent = String(activeCrits.length);
          badge.style.display = 'inline-block';
        } else {
          badge.style.display = 'none';
        }
      }

      // 2. Bütün filtrləri təmizlə düyməsi
      const btnClear = document.getElementById('kjBtnClearFilter');
      if (btnClear) {
        btnClear.disabled = !hasFilter;
        btnClear.style.opacity = hasFilter ? '1' : '0.4';
        btnClear.style.cursor = hasFilter ? 'pointer' : 'default';
        btnClear.title = hasFilter ? `Отключить все отборы (${activeCrits.length} активных условий)` : 'Отбор не установлен';
      }

      // 3. Sürətli filtr düyməsi
      const btnQuick = document.getElementById('kjBtnQuickFilter');
      const colKey = this.selectedColKey || 'name';
      const fieldDef = this.getFilterFields().find(f => f.key === colKey) || { label: colKey };
      if (btnQuick) {
        btnQuick.title = `Отбор по значению колонки [${fieldDef.label}] (F7)`;
      }

      // 4. Cari sütunun filtrini çıxar düyməsi
      const isColFiltered = activeCrits.some(c => (c.fieldKey || c.field) === colKey);
      const btnRemCol = document.getElementById('kjBtnRemoveColumnFilter');
      if (btnRemCol) {
        btnRemCol.disabled = !isColFiltered;
        btnRemCol.style.opacity = isColFiltered ? '1' : '0.4';
        btnRemCol.style.cursor = isColFiltered ? 'pointer' : 'default';
        btnRemCol.title = isColFiltered ? `Снять отбор по колонке [${fieldDef.label}] (Shift+F7)` : `Снять отбор по колонке [${fieldDef.label}] (отбор не установлен)`;
      }
    },

    /**
     * Aktiv filtrlər zolağını çəkir (Filter Chips Bar)
     */
    renderActiveFilterChips: function() {
      const bar = document.getElementById('kjActiveFiltersBar');
      const list = document.getElementById('kjActiveFilterChipsList');
      if (!bar || !list) return;

      const activeCrits = (this.activeFilters || []).filter(c => c && c.enabled !== false);
      if (activeCrits.length === 0) {
        bar.style.display = 'none';
        list.innerHTML = '';
        return;
      }

      bar.style.display = 'flex';
      let html = '';
      activeCrits.forEach((crit, idx) => {
        const fieldKey = crit.fieldKey || crit.field || '';
        const fieldDef = this.getFilterFields().find(f => f.key === fieldKey) || { label: crit.fieldLabel || fieldKey };
        const label = fieldDef.label;
        const op = crit.operator || 'Равно';
        const val = crit.value !== undefined ? String(crit.value) : '';

        html += `
          <div style="background: #ffffff; border: 1px solid #d4d0c8; border-radius: 2px; padding: 1px 6px; display: inline-flex; align-items: center; gap: 4px; font-size: 11px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
            <span style="font-weight: bold; color: #1e3a8a;">${escapeHtml(label)}</span>
            <span style="color: #64748b; font-size: 10px;">${escapeHtml(op)}</span>
            <span style="font-weight: 500; color: #0f172a; background: #f1f5f9; padding: 0 4px; border-radius: 2px;">"${escapeHtml(val)}"</span>
            <span onclick="KontragentyJournal.removeFilterCriterion(${idx})" title="Удалить условие" style="cursor: pointer; color: #dc2626; font-weight: bold; margin-left: 2px; padding: 0 2px;">✕</span>
          </div>
        `;
      });

      list.innerHTML = html;
    },

    // ========================================================
    // DATA FETCHING & RENDERING
    // ========================================================

    /**
     * Məlumatları API-dən oxuyur
     */
    loadData: function() {
      const overlay = document.getElementById('kjLoadingOverlay');
      if (overlay) overlay.style.display = 'flex';

      const searchInput = document.getElementById('kjSearchInput');
      const searchVal = searchInput ? searchInput.value.trim() : '';

      const payload = {
        filter_type: this.currentFilter,
        search: searchVal,
        limit: this.pageSize,
        offset: this.currentOffset,
        filters: this.activeFilters || []
      };

      fetch('/api/kontragenty/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      .then(res => res.json())
      .then(data => {
        if (overlay) overlay.style.display = 'none';
        if (data.success !== false) {
          this.items = data.items || [];
          this.totalCount = data.total_count || 0;
          this.renderStats(data.stats || {});
          this.renderTable(this.items);
          this.renderPagination();
          this.updateFilterButtonsState();
        } else {
          console.error('[KontragentyJournal] Server xətası:', data.error);
        }
      })
      .catch(err => {
        if (overlay) overlay.style.display = 'none';
        console.error('[KontragentyJournal] Şəbəkə xətası:', err);
      });
    },

    /**
     * Statistika chip-lərini yeniləyir
     */
    renderStats: function(stats) {
      const setCnt = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val !== undefined ? Number(val).toLocaleString() : '...';
      };

      setCnt('kjCnt-total', stats.all);
      setCnt('kjCnt-no_inn', stats.no_inn);
      setCnt('kjCnt-has_inn', stats.has_inn);
      setCnt('kjCnt-no_contract', stats.no_contract);
      setCnt('kjCnt-no_bank', stats.no_bank);

      const totalBadge = document.getElementById('kjTotalCountBadge');
      if (totalBadge) {
        const suffix = window.C1I18n ? window.C1I18n.t('kj.records_suffix', 'yazılar') : 'yazılar';
        totalBadge.textContent = `${Number(stats.all || 0).toLocaleString()} ${suffix}`;
      }
    },

    /**
     * Standart 1C sütun sxemini qaytarır
     */
    getDefaultColumns: function() {
      const _t = (k, fb) => (window.C1I18n ? window.C1I18n.t(k, fb) : fb);
      return [
        {
          key: 'score',
          label: _t('columns.score', 'Полнота'),
          width: 70,
          align: 'center',
          sortable: true,
          render: (val) => {
            const score = Number(val) || 50;
            const scoreColor = score >= 80 ? '#166534' : (score >= 50 ? '#b45309' : '#dc2626');
            const scoreBg = score >= 80 ? '#dcfce7' : (score >= 50 ? '#fef3c7' : '#fee2e2');
            return `<span style="display: inline-block; width: 44px; background: ${scoreBg}; color: ${scoreColor}; font-weight: bold; font-size: 10px; border-radius: 2px; text-align: center; border: 1px solid ${scoreColor}33;">${score}%</span>`;
          }
        },
        {
          key: 'code',
          label: _t('columns.code', 'Код'),
          width: 95,
          sortable: true,
          render: (val) => `<span style="font-family: monospace; font-weight: 500; color: #1e3a8a;">${escapeHtml(val || '')}</span>`
        },
        {
          key: 'name',
          label: _t('columns.name', 'Наименование'),
          width: 250,
          sortable: true,
          render: (val) => `<span title="${escapeHtml(val || '')}" style="font-weight: 500; color: #000;">${escapeHtml(val || '')}</span>`
        },
        {
          key: 'inn',
          label: _t('columns.inn', 'ИНН / VÖEN'),
          width: 110,
          sortable: true,
          render: (val) => {
            if (val) {
              return `<span style="font-family: monospace; font-weight: bold; color: #0f172a;">${escapeHtml(val)}</span>`;
            }
            const missingText = _t('columns.inn_missing', '⚠️ YOXDUR');
            return `<span style="background: #fee2e2; color: #991b1b; padding: 1px 4px; border-radius: 2px; font-weight: bold; font-size: 10px;">${missingText}</span>`;
          }
        },
        {
          key: 'access_group',
          label: _t('columns.access_group', 'Группа доступа'),
          width: 130,
          sortable: true,
          render: (val) => `<span style="display: inline-block; width: 10px; height: 9px; background: #3b82f6; border-radius: 1px; margin-right: 4px; vertical-align: middle;"></span><span style="color: #1e3a8a; font-weight: 500;">${escapeHtml(val || 'Bakı')}</span>`
        },
        {
          key: 'region',
          label: _t('columns.region', 'Регион'),
          width: 110,
          sortable: true,
          render: (val) => `<span style="color: #047857; font-weight: 500;">📍 ${escapeHtml(val || 'Баку')}</span>`
        },
        {
          key: 'main_contract',
          label: _t('columns.main_contract', 'Основной договор'),
          width: 160,
          sortable: true,
          render: (val) => val ? `<span style="color: #334155; font-size: 10.5px;">📄 ${escapeHtml(val)}</span>` : ''
        },
        {
          key: 'parent',
          label: _t('columns.parent', 'Группа/Папка'),
          width: 140,
          sortable: true,
          render: (val) => val ? `<span style="color: #64748b;">📁 ${escapeHtml(val)}</span>` : ''
        },
        {
          key: 'golovnoy',
          label: _t('columns.golovnoy', 'Головной контрагент'),
          width: 160,
          sortable: true,
          render: (val) => val ? `<span style="color: #64748b;">🏢 ${escapeHtml(val)}</span>` : ''
        },
        {
          key: 'address',
          label: _t('columns.address', 'Адрес доставки'),
          width: 200,
          sortable: true,
          render: (val) => val ? `<span title="${escapeHtml(val)}" style="color: #334155;">📍 ${escapeHtml(val)}</span>` : ''
        },
        {
          key: 'phone',
          label: _t('columns.phone', 'Телефон'),
          width: 130,
          sortable: true,
          render: (val) => val ? `<span title="${escapeHtml(val)}" style="color: #1e3a8a; font-family: monospace;">📞 ${escapeHtml(val)}</span>` : ''
        }
      ];
    },

    /**
     * Universal C1TableComponent-i inisializasiya edir
     */
    initTableComponent: function() {
      if (this.tableComponent) return;

      const container = document.getElementById('kjTableContainer');
      if (!container) return;

      const _t = (k, fb) => (window.C1I18n ? window.C1I18n.t(k, fb) : fb);

      this.tableComponent = new C1TableComponent({
        container: container,
        storageKey: 'kj_columns_config',
        title: _t('kj.title', 'Контрагенты (Справочник и аудит)'),
        defaultColumns: this.getDefaultColumns(),
        showLineNumbers: true,
        lineNumberOffset: this.currentOffset,
        emptyText: _t('kj.empty_search', 'Seçilmiş filtr və ya axtarış parametri üzrə kontragent tapılmadı'),
        emptyIcon: '🔍',
        onRowClick: (item, idx) => {
          this.selectedRow = item;
        },
        onCellClick: (item, colKey) => {
          this.selectedRow = item;
          if (colKey) {
            this.selectedColKey = colKey;
            this.updateFilterButtonsState();
          }
        },
        onRowDblClick: (item) => {
          this.openCurrentCard();
        },
        onSelectionChange: (item) => {
          this.selectedRow = item;
        }
      });
    },

    /**
     * Cədvəl məlumatlarını C1TableComponent vasitəsilə çəkir
     */
    renderTable: function(items) {
      this.initTableComponent();
      if (this.tableComponent) {
        this.tableComponent.setItems(items || [], this.currentOffset);
        this.selectedRow = this.tableComponent.getSelectedRow();
      }
    },

    /**
     * Səhifələmə indikatorunu yeniləyir
     */
    renderPagination: function() {
      const countShowing = document.getElementById('kjCountShowing');
      const countTotal = document.getElementById('kjCountTotal');
      const pageIndicator = document.getElementById('kjPageIndicator');

      const start = this.items.length > 0 ? this.currentOffset + 1 : 0;
      const end = this.currentOffset + this.items.length;

      if (countShowing) countShowing.textContent = `${start}-${end}`;
      if (countTotal) countTotal.textContent = Number(this.totalCount).toLocaleString();

      if (pageIndicator) {
        const curPage = Math.floor(this.currentOffset / this.pageSize) + 1;
        const totalPages = Math.ceil(this.totalCount / this.pageSize) || 1;
        const lang = window.C1I18n ? window.C1I18n.getLanguage() : 'ru';
        if (lang === 'az') {
          pageIndicator.textContent = `Səh. ${curPage} / ${totalPages}`;
        } else {
          pageIndicator.textContent = `Стр. ${curPage} из ${totalPages}`;
        }
      }
    },

    /**
     * Cari seçilmiş kontragentin kartını açır (F2 / Double click)
     */
    openCurrentCard: function() {
      const row = this.tableComponent ? this.tableComponent.getSelectedRow() : this.selectedRow;
      if (!row) return;

      const code = row.code || (row.getAttribute ? row.getAttribute('data-code') : '') || '';
      const name = row.name || (row.getAttribute ? row.getAttribute('data-name') : '') || '';
      const inn = row.inn || (row.getAttribute ? row.getAttribute('data-inn') : '') || '';

      if (window.KontragentCard && typeof KontragentCard.open === 'function') {
        KontragentCard.open(code, name, inn);
      }
    },

    /**
     * Excel-ə ixrac (C1TableComponent vasitəsilə)
     */
    exportExcel: function() {
      if (this.tableComponent) {
        this.tableComponent.exportToCsv(`Kontragenty_Audit_${new Date().toISOString().slice(0,10)}.csv`);
      } else {
        if (!this.items || this.items.length === 0) {
          alert('İxrac etmək üçün siyahıda məlumat yoxdur');
          return;
        }
        let csv = '\uFEFFКод;Наименование;ИНН_VÖEN;Основной_договор;Группа;Головной;Адрес_доставки;Телефон;Полнота\n';
        this.items.forEach(it => {
          csv += `"${it.code}";"${(it.name || '').replace(/"/g, '""')}";"${it.inn || ''}";"${it.main_contract || ''}";"${it.parent || ''}";"${it.golovnoy || ''}";"${it.address || ''}";"${it.phone || ''}";"${it.score}%"\n`;
        });
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `Kontragenty_Audit_${new Date().toISOString().slice(0,10)}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    }
  };

  // Keyboard shortcut listener for F2, F5, F7, Shift+F7 inside Kontragenty Journal
  document.addEventListener('keydown', function(e) {
    const journalWin = document.getElementById('kontragentyJournalWindow');
    if (!journalWin || journalWin.style.display === 'none') return;

    if (e.key === 'F2') {
      e.preventDefault();
      KontragentyJournal.openCurrentCard();
    } else if (e.key === 'F5') {
      e.preventDefault();
      KontragentyJournal.reload();
    } else if (e.key === 'F7' && !e.shiftKey) {
      e.preventDefault();
      KontragentyJournal.filterByCurrentValue();
    } else if (e.key === 'F7' && e.shiftKey) {
      e.preventDefault();
      KontragentyJournal.removeFilterByCurrentColumn();
    }
  });

  // Dinamik dil dəyişməsi hadisəsini dinlə
  window.addEventListener('c1-language-changed', function() {
    if (KontragentyJournal.tableComponent) {
      const updatedDefaults = KontragentyJournal.getDefaultColumns();
      KontragentyJournal.tableComponent.defaultColumns = updatedDefaults;
      if (Array.isArray(KontragentyJournal.tableComponent.columns)) {
        KontragentyJournal.tableComponent.columns.forEach(col => {
          const def = updatedDefaults.find(d => d.key === col.key);
          if (def) col.label = def.label;
        });
      }
      KontragentyJournal.tableComponent.render();
    }
    const totalBadge = document.getElementById('kjTotalCountBadge');
    if (totalBadge && KontragentyJournal.totalCount) {
      const suffix = window.C1I18n ? window.C1I18n.t('kj.records_suffix', 'yazılar') : 'yazılar';
      totalBadge.textContent = `${Number(KontragentyJournal.totalCount).toLocaleString()} ${suffix}`;
    }
    KontragentyJournal.renderPagination();
    const win = document.getElementById('kontragentyJournalWindow');
    if (win && window.C1I18n) {
      window.C1I18n.applyTranslations(win);
    }
  });

  window.KontragentyJournal = KontragentyJournal;

})(window);
