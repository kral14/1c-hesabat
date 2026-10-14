/**
 * ========================================================================
 * 1C:ENTERPRISE - REUSABLE UNIVERSAL TABLE COMPONENT
 * static/js/c1_table_component.js
 *
 * Universal, modular, and reusable 1C Table / Grid Component:
 * - Authentic 1C styling (headers, borders, alternating rows, selection)
 * - Interactive column resizing via mouse drag handles (col-resizer)
 * - Interactive column reordering via drag-and-drop
 * - Column sorting (ascending ▴, descending ▾, sort callbacks)
 * - Seamless integration with 1C Column Settings (OneCColumnSettings dialog)
 * - Persistent column customization in LocalStorage (widths, visibility, order, labels)
 * - Row selection, active cell selection, double-click handling
 * - Keyboard navigation (Up, Down, Enter, Escape, Ctrl+C)
 * - Context menu (Настройка списка, Сортировка, Копировать)
 * - Custom cell renderers, status badges, icons, and alignment
 * - Export to CSV/Excel functionality
 * ========================================================================
 */

(function(window) {
  'use strict';

  function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }

  const activeTableInstances = new Set();

  /**
   * C1TableComponent Class
   * @param {Object} options Configuration options
   */
  function C1TableComponent(options) {
    if (!options) throw new Error('[C1TableComponent] Options object required');

    activeTableInstances.add(this);

    this.options = Object.assign({
      container: null,            // DOM element or selector
      storageKey: null,           // Key for localStorage persistence
      title: 'Таблица',           // Form / window title for settings dialog
      defaultColumns: [],         // Baseline column definitions
      columns: null,              // Custom columns (if not provided, loaded from storageKey)
      items: [],                  // Row data items
      idField: 'id',              // Unique row ID property
      rowHeight: 22,              // Height in px
      selectable: true,           // Allow row selection
      showLineNumbers: false,     // Render auto # index column
      lineNumberOffset: 0,        // Starting index offset for paginated tables
      emptyText: 'Список пуст',   // Text when items is empty
      emptyIcon: '📭',            // Icon when empty
      currentSortCol: null,       // Currently sorted column key
      currentSortAsc: true,       // Sort direction
      onRowClick: null,           // (row, index, event) => {}
      onRowDblClick: null,        // (row, index, event) => {}
      onCellClick: null,          // (row, colKey, cellEl, event) => {}
      onSelectionChange: null,    // (selectedRow, selectedIndex) => {}
      onSortChange: null,         // (colKey, isAsc) => {}
      onColumnsChange: null       // (columns) => {}
    }, options);

    this.container = typeof this.options.container === 'string'
      ? document.querySelector(this.options.container)
      : this.options.container;

    if (!this.container) {
      console.warn('[C1TableComponent] Container element not found for selector:', options.container);
    }

    this.storageKey = this.options.storageKey;
    this.title = this.options.title;
    this.defaultColumns = JSON.parse(JSON.stringify(this.options.defaultColumns || []));

    // Load or initialize columns
    this.columns = this.loadColumns();

    this.items = Array.isArray(this.options.items) ? this.options.items : [];
    this.selectedIndex = -1;
    this.selectedRow = null;
    this.selectedColKey = null;
    this.currentSortCol = this.options.currentSortCol;
    this.currentSortAsc = this.options.currentSortAsc;

    // Resizing & Dragging state
    this._isResizing = false;
    this._draggedColKey = null;

    // DOM references
    this.tableEl = null;
    this.theadEl = null;
    this.tbodyEl = null;
    this.contextMenuEl = null;

    if (this.container) {
      this.init();
    }
  }

  C1TableComponent.prototype = {
    constructor: C1TableComponent,

    /**
     * Load column configuration from LocalStorage or defaultColumns.
     */
    loadColumns: function() {
      if (this.options.columns && Array.isArray(this.options.columns) && this.options.columns.length > 0) {
        return JSON.parse(JSON.stringify(this.options.columns));
      }
      if (window.OneCColumnSettings && typeof OneCColumnSettings.load === 'function' && this.storageKey) {
        return OneCColumnSettings.load(this.storageKey, this.defaultColumns);
      }
      if (this.storageKey) {
        try {
          const raw = localStorage.getItem(this.storageKey);
          if (raw) {
            const saved = JSON.parse(raw);
            if (Array.isArray(saved) && saved.length > 0) {
              const defMap = new Map();
              this.defaultColumns.forEach(c => defMap.set(c.key, c));
              const result = [];
              saved.forEach(sCol => {
                if (defMap.has(sCol.key)) {
                  result.push(Object.assign({}, defMap.get(sCol.key), sCol));
                  defMap.delete(sCol.key);
                }
              });
              defMap.forEach(nCol => result.push(JSON.parse(JSON.stringify(nCol))));
              return result;
            }
          }
        } catch (e) {
          console.warn('[C1TableComponent] Error loading columns from localStorage:', e);
        }
      }
      return JSON.parse(JSON.stringify(this.defaultColumns));
    },

    /**
     * Save column configuration to LocalStorage.
     */
    saveColumns: function() {
      if (!this.storageKey) return;
      if (window.OneCColumnSettings && typeof OneCColumnSettings.save === 'function') {
        OneCColumnSettings.save(this.storageKey, this.columns);
      } else {
        try {
          localStorage.setItem(this.storageKey, JSON.stringify(this.columns));
        } catch (e) {
          console.error('[C1TableComponent] Error saving columns to localStorage:', e);
        }
      }
      if (typeof this.options.onColumnsChange === 'function') {
        this.options.onColumnsChange(this.columns);
      }
    },

    /**
     * Get array of columns currently marked as visible.
     */
    getVisibleColumns: function() {
      return (this.columns || []).filter(c => c && c.visible !== false);
    },

    /**
     * Initialize DOM layout and attach global table listeners.
     */
    init: function() {
      if (!this.container) return;

      let wrapper = this.container.querySelector('.c1-table-wrapper');
      if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.className = 'c1-table-wrapper';
        wrapper.style.cssText = 'width: 100%; height: 100%; overflow: auto; background: #ffffff; position: relative; box-sizing: border-box;';
        wrapper.tabIndex = 0;
        wrapper.innerHTML = `
          <table class="c1-table" style="table-layout: fixed; width: max-content; min-width: 100%; border-collapse: collapse; font-family: Tahoma, 'MS Sans Serif', Arial, sans-serif; font-size: 11px; white-space: nowrap; user-select: text;">
            <thead>
              <tr class="c1-table-head-row" style="background: #ece9d8; border-bottom: 2px solid #5a5a5a; position: sticky; top: 0; z-index: 10; height: 23px;">
              </tr>
            </thead>
            <tbody class="c1-table-body">
            </tbody>
          </table>
          <div class="c1-table-empty" style="display: none; position: absolute; top: 40px; left: 0; right: 0; bottom: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #64748b; font-size: 11px; gap: 8px; pointer-events: none;">
            <span class="c1-empty-icon" style="font-size: 30px;">${this.options.emptyIcon}</span>
            <span class="c1-empty-text" style="font-weight: 500;">${escapeHtml(this.options.emptyText)}</span>
          </div>
        `;
        this.container.appendChild(wrapper);
      }

      this.wrapperEl = wrapper;
      this.tableEl = wrapper.querySelector('.c1-table');
      this.theadEl = wrapper.querySelector('.c1-table-head-row');
      this.tbodyEl = wrapper.querySelector('.c1-table-body');
      this.emptyEl = wrapper.querySelector('.c1-table-empty');

      // Bind keyboard navigation on wrapper
      this.wrapperEl.addEventListener('keydown', (e) => this.handleKeyDown(e));

      // Right-click context menu listener
      this.tableEl.addEventListener('contextmenu', (e) => this.handleContextMenu(e));

      // Render structure
      this.render();
    },

    /**
     * Re-renders entire table (header and body).
     */
    render: function() {
      this.renderHead();
      this.renderBody();
    },

    /**
     * Render Table Header with 1C styling, resizing handles, sorting, and drag-and-drop.
     */
    renderHead: function() {
      if (!this.theadEl) return;

      const visibleCols = this.getVisibleColumns();
      let html = '';

      // Optional Auto Line Number Column
      if (this.options.showLineNumbers) {
        html += `
          <th style="width: 34px; min-width: 34px; max-width: 34px; text-align: center; border: 1px solid #b0af9f; background: #ece9d8; color: #475569; font-weight: bold; padding: 2px 4px; user-select: none;">
            №
          </th>
        `;
      }

      visibleCols.forEach(col => {
        const isSort = (this.currentSortCol === col.key);
        const arrow = isSort ? (this.currentSortAsc ? ' ▴' : ' ▾') : '';
        const wVal = Number(col.width) || 100;
        const wStyle = col.autoWidth
          ? ''
          : `width: ${wVal}px; min-width: ${wVal}px; max-width: ${wVal}px;`;
        const align = col.align || 'left';
        const cursor = col.sortable !== false ? 'cursor: pointer;' : '';
        const colLabel = window.C1I18n ? window.C1I18n.translateColumn(col.key, col.label) : (col.label || col.key);

        html += `
          <th class="c1-th" data-col-key="${escapeHtml(col.key)}" draggable="true"
              style="${wStyle} position: relative; padding: 3px 6px; border: 1px solid #b0af9f; text-align: ${align}; white-space: nowrap; user-select: none; background: #ece9d8; color: #000; font-weight: normal; ${cursor}"
              title="${escapeHtml(colLabel)}">
            <span style="display: inline-block; overflow: hidden; text-overflow: ellipsis; max-width: calc(100% - 10px); vertical-align: middle;">
              ${escapeHtml(colLabel)}<strong style="color: #002060;">${arrow}</strong>
            </span>
            <div class="c1-col-resizer" title="Потяните для изменения ширины"
                 style="position: absolute; right: 0; top: 0; bottom: 0; width: 6px; cursor: col-resize; z-index: 5;"
                 data-resizer-key="${escapeHtml(col.key)}"></div>
          </th>
        `;
      });

      this.theadEl.innerHTML = html;

      // Attach header event listeners
      this.attachHeaderEvents();
    },

    /**
     * Attach click, drag-drop, and resize events to header cells.
     */
    attachHeaderEvents: function() {
      const ths = this.theadEl.querySelectorAll('th.c1-th');
      ths.forEach(th => {
        const colKey = th.getAttribute('data-col-key');
        if (!colKey) return;

        // Header click for sorting
        th.addEventListener('click', (e) => {
          if (e.target.classList.contains('c1-col-resizer')) return;
          this.handleHeaderClick(colKey);
        });

        // Drag and drop reordering
        th.addEventListener('dragstart', (e) => {
          this._draggedColKey = colKey;
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', colKey);
          th.style.opacity = '0.5';
        });

        th.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        });

        th.addEventListener('dragenter', () => {
          th.style.borderLeft = '3px solid #004080';
        });

        th.addEventListener('dragleave', () => {
          th.style.borderLeft = '1px solid #b0af9f';
        });

        th.addEventListener('drop', (e) => {
          e.preventDefault();
          ths.forEach(t => { t.style.opacity = ''; t.style.borderLeft = '1px solid #b0af9f'; });

          if (!this._draggedColKey || this._draggedColKey === colKey) return;

          const fromIdx = this.columns.findIndex(c => c.key === this._draggedColKey);
          const toIdx = this.columns.findIndex(c => c.key === colKey);

          if (fromIdx !== -1 && toIdx !== -1) {
            const [moved] = this.columns.splice(fromIdx, 1);
            this.columns.splice(toIdx, 0, moved);
            this.saveColumns();
            this.render();
          }
          this._draggedColKey = null;
        });

        th.addEventListener('dragend', () => {
          ths.forEach(t => { t.style.opacity = ''; t.style.borderLeft = '1px solid #b0af9f'; });
          this._draggedColKey = null;
        });

        // Column Resizing via handle
        const resizer = th.querySelector('.c1-col-resizer');
        if (resizer) {
          resizer.addEventListener('mousedown', (e) => this.startColumnResize(e, colKey, th));
          resizer.addEventListener('click', (e) => e.stopPropagation());
        }
      });
    },

    /**
     * Mouse drag column resizing handler.
     */
    startColumnResize: function(e, colKey, th) {
      e.preventDefault();
      e.stopPropagation();

      const col = this.columns.find(c => c.key === colKey);
      if (!col) return;

      this._isResizing = true;
      const startX = e.clientX;
      const startWidth = Number(col.width) || th.offsetWidth || 100;

      const onMouseMove = (moveEvt) => {
        moveEvt.preventDefault();
        const delta = moveEvt.clientX - startX;
        const newWidth = Math.max(col.minWidth || 30, Math.min(col.maxWidth || 800, startWidth + delta));

        col.width = newWidth;
        col.autoWidth = false;

        th.style.width = newWidth + 'px';
        th.style.minWidth = newWidth + 'px';
        th.style.maxWidth = newWidth + 'px';

        // Synchronize table body cells in current column in real-time
        if (this.tbodyEl) {
          const cells = this.tbodyEl.querySelectorAll(`td[data-col-key="${colKey}"]`);
          cells.forEach(td => {
            td.style.width = newWidth + 'px';
            td.style.minWidth = newWidth + 'px';
            td.style.maxWidth = newWidth + 'px';
          });
        }
      };

      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        this._isResizing = false;
        this.saveColumns();
      };

      document.body.style.cursor = 'col-resize';
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },

    /**
     * Header click handler for sorting.
     */
    handleHeaderClick: function(colKey) {
      const col = this.columns.find(c => c.key === colKey);
      if (!col || col.sortable === false) return;

      if (this.currentSortCol === colKey) {
        this.currentSortAsc = !this.currentSortAsc;
      } else {
        this.currentSortCol = colKey;
        this.currentSortAsc = true;
      }

      // If consumer provided onSortChange callback, notify
      if (typeof this.options.onSortChange === 'function') {
        this.options.onSortChange(this.currentSortCol, this.currentSortAsc);
      } else {
        // Internal default client sort
        this.sortItemsInternally(this.currentSortCol, this.currentSortAsc);
      }

      this.renderHead();
      this.renderBody();
    },

    /**
     * Internal sorting implementation for items.
     */
    sortItemsInternally: function(colKey, isAsc) {
      if (!colKey || !Array.isArray(this.items)) return;

      this.items.sort((a, b) => {
        let valA = a[colKey];
        let valB = b[colKey];

        if (valA === undefined || valA === null) valA = '';
        if (valB === undefined || valB === null) valB = '';

        // Number comparison
        if (typeof valA === 'number' && typeof valB === 'number') {
          return isAsc ? valA - valB : valB - valA;
        }

        // Date comparison (DD.MM.YYYY)
        if (typeof valA === 'string' && typeof valB === 'string') {
          const mDateA = valA.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
          const mDateB = valB.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
          if (mDateA && mDateB) {
            const dA = `${mDateA[3]}${mDateA[2]}${mDateA[1]}`;
            const dB = `${mDateB[3]}${mDateB[2]}${mDateB[1]}`;
            return isAsc ? dA.localeCompare(dB) : dB.localeCompare(dA);
          }
          return isAsc ? String(valA).localeCompare(String(valB)) : String(valB).localeCompare(String(valA));
        }

        return 0;
      });
    },

    /**
     * Render Table Body rows.
     */
    renderBody: function() {
      if (!this.tbodyEl) return;

      const items = this.items || [];
      const visibleCols = this.getVisibleColumns();

      if (items.length === 0) {
        this.tbodyEl.innerHTML = '';
        if (this.emptyEl) this.emptyEl.style.display = 'flex';
        this.selectedIndex = -1;
        this.selectedRow = null;
        return;
      }

      if (this.emptyEl) this.emptyEl.style.display = 'none';

      // Keep selection bounds
      if (this.selectedIndex >= items.length) {
        this.selectedIndex = items.length - 1;
      }
      if (this.selectedIndex < 0 && items.length > 0 && this.options.selectable) {
        this.selectedIndex = 0;
      }
      this.selectedRow = this.selectedIndex >= 0 ? items[this.selectedIndex] : null;

      let html = '';
      items.forEach((item, idx) => {
        const isSelected = (idx === this.selectedIndex);
        const rowBg = isSelected ? '#dceaf7' : (idx % 2 === 1 ? '#fbfbfa' : '#ffffff');
        const rowFg = isSelected ? '#000000' : '#111111';

        let cellsHtml = '';

        // Line number cell
        if (this.options.showLineNumbers) {
          const offset = Number(this.options.lineNumberOffset) || 0;
          cellsHtml += `
            <td style="width: 34px; min-width: 34px; max-width: 34px; text-align: center; border: 1px solid #d4d0c8; color: #64748b; font-size: 10px; padding: 2px 4px; user-select: none;">
              ${idx + 1 + offset}
            </td>
          `;
        }

        visibleCols.forEach(col => {
          const wVal = Number(col.width) || 100;
          const wStyle = col.autoWidth
            ? ''
            : `width: ${wVal}px; min-width: ${wVal}px; max-width: ${wVal}px;`;
          const align = col.align || 'left';
          const isCellActive = isSelected && (this.selectedColKey === col.key);

          // Value formatting
          const rawVal = item[col.key];
          let cellContent = '';

          if (typeof col.render === 'function') {
            cellContent = col.render(rawVal, item, idx);
          } else if (rawVal !== undefined && rawVal !== null) {
            cellContent = escapeHtml(rawVal);
          }

          const cellClass = isCellActive ? 'c1-cell-active' : '';
          const cellStyle = isCellActive
            ? 'background: #316ac5 !important; color: #ffffff !important;'
            : '';

          cellsHtml += `
            <td class="c1-td ${cellClass}" data-col-key="${escapeHtml(col.key)}"
                style="${wStyle} text-align: ${align}; border: 1px solid #d4d0c8; padding: 2px 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; ${cellStyle}"
                title="${typeof rawVal === 'string' ? escapeHtml(rawVal) : ''}">
              ${cellContent}
            </td>
          `;
        });

        html += `
          <tr class="c1-tr ${isSelected ? 'selected-row' : ''}" data-row-idx="${idx}"
              style="height: ${this.options.rowHeight}px; background: ${rowBg}; color: ${rowFg}; cursor: pointer; user-select: text;"
              onmouseover="if(!this.classList.contains('selected-row')) this.style.background='#f0f4fa'"
              onmouseout="if(!this.classList.contains('selected-row')) this.style.background='${idx % 2 === 1 ? '#fbfbfa' : '#ffffff'}'">
            ${cellsHtml}
          </tr>
        `;
      });

      this.tbodyEl.innerHTML = html;
      this.attachBodyEvents();
    },

    /**
     * Attach row/cell click and double click listeners.
     */
    attachBodyEvents: function() {
      const trs = this.tbodyEl.querySelectorAll('tr.c1-tr');
      trs.forEach(tr => {
        const idx = parseInt(tr.getAttribute('data-row-idx'), 10);
        const item = this.items[idx];

        tr.addEventListener('click', (e) => {
          const td = e.target.closest('td.c1-td');
          const colKey = td ? td.getAttribute('data-col-key') : null;
          this.selectRow(idx, colKey, e);
          if (typeof this.options.onRowClick === 'function') {
            this.options.onRowClick(item, idx, e);
          }
          if (td && typeof this.options.onCellClick === 'function') {
            this.options.onCellClick(item, colKey, td, e);
          }
        });

        tr.addEventListener('dblclick', (e) => {
          if (typeof this.options.onRowDblClick === 'function') {
            this.options.onRowDblClick(item, idx, e);
          }
        });
      });
    },

    /**
     * Select a specific row and active cell by index.
     */
    selectRow: function(idx, colKey, event) {
      if (!this.options.selectable || idx < 0 || idx >= this.items.length) return;

      this.selectedIndex = idx;
      this.selectedRow = this.items[idx];
      if (colKey) this.selectedColKey = colKey;

      const trs = this.tbodyEl.querySelectorAll('tr.c1-tr');
      trs.forEach((tr, i) => {
        const isSel = (i === idx);
        tr.classList.toggle('selected-row', isSel);
        tr.style.background = isSel ? '#dceaf7' : (i % 2 === 1 ? '#fbfbfa' : '#ffffff');

        // Cell active styling
        const tds = tr.querySelectorAll('td.c1-td');
        tds.forEach(td => {
          const cKey = td.getAttribute('data-col-key');
          const isCellAct = isSel && (cKey === this.selectedColKey);
          td.classList.toggle('c1-cell-active', isCellAct);
          if (isCellAct) {
            td.style.background = '#316ac5';
            td.style.color = '#ffffff';
          } else {
            td.style.background = '';
            td.style.color = '';
          }
        });
      });

      if (typeof this.options.onSelectionChange === 'function') {
        this.options.onSelectionChange(this.selectedRow, this.selectedIndex);
      }
    },

    /**
     * Keyboard navigation (Up/Down arrows, Enter, Ctrl+C).
     */
    handleKeyDown: function(e) {
      if (this.items.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (this.selectedIndex < this.items.length - 1) {
          this.selectRow(this.selectedIndex + 1, this.selectedColKey, e);
          this.ensureRowVisible(this.selectedIndex);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (this.selectedIndex > 0) {
          this.selectRow(this.selectedIndex - 1, this.selectedColKey, e);
          this.ensureRowVisible(this.selectedIndex);
        }
      } else if (e.key === 'Enter') {
        if (this.selectedRow && typeof this.options.onRowDblClick === 'function') {
          e.preventDefault();
          this.options.onRowDblClick(this.selectedRow, this.selectedIndex, e);
        }
      }
    },

    /**
     * Scroll wrapper to make sure selected row is within view.
     */
    ensureRowVisible: function(idx) {
      if (!this.tbodyEl || !this.wrapperEl) return;
      const tr = this.tbodyEl.querySelector(`tr[data-row-idx="${idx}"]`);
      if (tr) {
        tr.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    },

    /**
     * Open 1C Column Settings Modal.
     */
    openColumnSettings: function() {
      const options = {
        title: this.title || 'Настройка списка',
        columns: this.columns,
        defaultColumns: this.defaultColumns,
        storageKey: this.storageKey,
        onApply: (updatedCols) => {
          this.columns = updatedCols;
          this.saveColumns();
          this.render();
        },
        onReset: (defCols) => {
          this.columns = JSON.parse(JSON.stringify(defCols || this.defaultColumns));
          if (this.storageKey) {
            localStorage.removeItem(this.storageKey);
          }
          this.render();
        }
      };

      if (window.OneCColumnSettings && typeof OneCColumnSettings.open === 'function') {
        OneCColumnSettings.open(options);
      } else {
        alert('OneCColumnSettings component tapılmadı.');
      }
    },

    /**
     * Right-click Context Menu.
     */
    handleContextMenu: function(e) {
      e.preventDefault();

      const tr = e.target.closest('tr.c1-tr');
      const td = e.target.closest('td.c1-td');
      if (tr) {
        const idx = parseInt(tr.getAttribute('data-row-idx'), 10);
        const colKey = td ? td.getAttribute('data-col-key') : null;
        this.selectRow(idx, colKey, e);
      }

      this.showContextMenu(e.clientX, e.clientY, td ? td.getAttribute('data-col-key') : null);
    },

    /**
     * Display floating 1C context menu.
     */
    showContextMenu: function(x, y, colKey) {
      this.closeContextMenu();

      const menu = document.createElement('div');
      menu.className = 'c1-context-menu';
      menu.style.cssText = `
        position: fixed; left: ${x}px; top: ${y}px; z-index: 10001;
        background: #ffffff; border: 1px solid #7f9db9; box-shadow: 0 4px 12px rgba(0,0,0,0.25);
        font-family: Tahoma, 'MS Sans Serif', Arial, sans-serif; font-size: 11px;
        min-width: 190px; padding: 2px 0; border-radius: 2px;
      `;

      const _t = (k, d) => (window.C1I18n ? window.C1I18n.t(k, d) : d);
      let sortOptions = '';
      if (colKey) {
        const col = this.columns.find(c => c.key === colKey);
        const colLabel = col ? col.label : colKey;
        sortOptions = `
          <div class="c1-menu-item" data-action="sort_asc" style="padding: 4px 12px; cursor: pointer; display: flex; align-items: center; gap: 8px;">
            <span>▲</span> <span>${_t('table.menu_sort_asc', 'Сортировка по возрастанию')} [${escapeHtml(colLabel)}]</span>
          </div>
          <div class="c1-menu-item" data-action="sort_desc" style="padding: 4px 12px; cursor: pointer; display: flex; align-items: center; gap: 8px;">
            <span>▼</span> <span>${_t('table.menu_sort_desc', 'Сортировка по убыванию')} [${escapeHtml(colLabel)}]</span>
          </div>
          <div style="height: 1px; background: #e2e8f0; margin: 2px 0;"></div>
        `;
      }

      menu.innerHTML = `
        ${sortOptions}
        <div class="c1-menu-item" data-action="columns" style="padding: 4px 12px; cursor: pointer; display: flex; align-items: center; gap: 8px;">
          <span>⚙️</span> <span>${_t('table.menu_columns', 'Настройка списка (Колонки)...')}</span>
        </div>
        <div class="c1-menu-item" data-action="copy" style="padding: 4px 12px; cursor: pointer; display: flex; align-items: center; gap: 8px;">
          <span>📋</span> <span>${_t('table.menu_copy', 'Копировать значение (Ctrl+C)')}</span>
        </div>
        <div style="height: 1px; background: #e2e8f0; margin: 2px 0;"></div>
        <div class="c1-menu-item" data-action="export" style="padding: 4px 12px; cursor: pointer; display: flex; align-items: center; gap: 8px;">
          <span>📊</span> <span>${_t('table.menu_export', 'Экспорт в Excel / CSV')}</span>
        </div>
      `;

      // Hover effects
      menu.querySelectorAll('.c1-menu-item').forEach(item => {
        item.addEventListener('mouseover', () => { item.style.background = '#316ac5'; item.style.color = '#ffffff'; });
        item.addEventListener('mouseout', () => { item.style.background = ''; item.style.color = ''; });
        item.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const action = item.getAttribute('data-action');
          this.executeContextAction(action, colKey);
          this.closeContextMenu();
        });
      });

      document.body.appendChild(menu);
      this.contextMenuEl = menu;

      // Close on outside click
      const closeHandler = (ev) => {
        if (!menu.contains(ev.target)) {
          this.closeContextMenu();
          document.removeEventListener('click', closeHandler);
        }
      };
      setTimeout(() => document.addEventListener('click', closeHandler), 10);
    },

    /**
     * Execute context menu selection.
     */
    executeContextAction: function(action, colKey) {
      if (action === 'columns') {
        this.openColumnSettings();
      } else if (action === 'sort_asc' && colKey) {
        this.currentSortCol = colKey;
        this.currentSortAsc = true;
        this.handleHeaderClick(colKey);
      } else if (action === 'sort_desc' && colKey) {
        this.currentSortCol = colKey;
        this.currentSortAsc = false;
        this.handleHeaderClick(colKey);
      } else if (action === 'copy') {
        if (this.selectedRow && colKey && this.selectedRow[colKey] !== undefined) {
          navigator.clipboard.writeText(String(this.selectedRow[colKey]));
        }
      } else if (action === 'export') {
        this.exportToCsv();
      }
    },

    closeContextMenu: function() {
      if (this.contextMenuEl) {
        this.contextMenuEl.remove();
        this.contextMenuEl = null;
      }
    },

    /**
     * Export visible table columns and items to CSV.
     */
    exportToCsv: function(filename) {
      if (!this.items || this.items.length === 0) {
        alert('İxrac etmək üçün cədvəldə məlumat yoxdur');
        return;
      }

      const visibleCols = this.getVisibleColumns();
      let csv = '\uFEFF';
      csv += visibleCols.map(c => `"${(c.label || c.key).replace(/"/g, '""')}"`).join(';') + '\n';

      this.items.forEach(row => {
        const line = visibleCols.map(c => {
          let val = row[c.key];
          if (val === undefined || val === null) val = '';
          return `"${String(val).replace(/"/g, '""')}"`;
        }).join(';');
        csv += line + '\n';
      });

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename || `${this.title || 'Table'}_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },

    // ==========================================
    // Public Instance Methods
    // ==========================================

    /**
     * Update table dataset and refresh body rendering.
     * @param {Array} newItems
     * @param {number} [lineNumberOffset] Optional offset for row numbers
     */
    setItems: function(newItems, lineNumberOffset) {
      if (lineNumberOffset !== undefined) {
        this.options.lineNumberOffset = lineNumberOffset;
      }
      this.items = Array.isArray(newItems) ? newItems : [];
      this.renderBody();
    },

    /**
     * Set row number offset.
     */
    setLineNumberOffset: function(offset) {
      this.options.lineNumberOffset = offset || 0;
    },

    /**
     * Update table columns definition and refresh header & body.
     */
    setColumns: function(newCols) {
      this.columns = JSON.parse(JSON.stringify(newCols || []));
      this.saveColumns();
      this.render();
    },

    /**
     * Get current active selected row object.
     */
    getSelectedRow: function() {
      return this.selectedRow;
    },

    /**
     * Get index of currently selected row.
     */
    getSelectedIndex: function() {
      return this.selectedIndex;
    },

    /**
     * Get currently selected column key.
     */
    getSelectedColKey: function() {
      return this.selectedColKey;
    },

    /**
     * Set selected column key manually.
     */
    setSelectedColKey: function(colKey) {
      this.selectedColKey = colKey;
      if (this.selectedIndex >= 0) {
        this.selectRow(this.selectedIndex, colKey);
      }
    },

    /**
     * Cleanup event listeners and DOM elements.
     */
    destroy: function() {
      activeTableInstances.delete(this);
      this.closeContextMenu();
      if (this.container) {
        this.container.innerHTML = '';
      }
    }
  };

  /**
   * Static Factory Helper: C1TableComponent.create(options)
   */
  C1TableComponent.create = function(options) {
    return new C1TableComponent(options);
  };

  // Dinamik dil dəyişdikdə bütün cədvəllərin başlıqlarını dərhal yenilə
  window.addEventListener('c1-language-changed', function() {
    activeTableInstances.forEach(inst => {
      try {
        if (inst && typeof inst.renderHead === 'function') {
          inst.renderHead();
        }
      } catch (e) {
        console.error('[C1TableComponent] Error updating head on lang change:', e);
      }
    });
  });

  window.C1TableComponent = C1TableComponent;

})(window);
