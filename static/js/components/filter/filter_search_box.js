/**
 * ======================================================================
 * 1C:ENTERPRISE - FİLTR BÖLMƏSİ: UNIVERSAL AXTARIŞ («НАЙТИ») İŞÇİSİ
 * static/js/components/filter/filter_search_box.js
 * 
 * Bütün jurnallar, arayışlar (kataloqlar) və sənədlər üçün
 * Realizasiya standartında vahid axtarış ("Найти") komponenti.
 * 
 * Özəllikləri:
 * - Daxili avtomatik dəyişən Lupa (🔍) / Təmizlə (✕) ikonu
 * - Yazdıqca anlıq axtarış (Debounced live search: 250ms)
 * - Enter ilə dərhal icra
 * - Escape və Ctrl+Q ilə dərhal təmizləmə
 * - İstənilən konteynerə renderHtml və ya attach ilə qoşulma
 * ======================================================================
 */

(function (window) {
  'use strict';

  const FilterSearchBox = {
    /**
     * Vahid axtarış inputu HTML-i yaradır
     */
    renderHtml: function (cfg = {}) {
      const id = cfg.id || 'c1SearchInput_' + Math.random().toString(36).substr(2, 6);
      const placeholder = cfg.placeholder || 'Найти по всем колонкам (Ctrl+Q для отмены)...';
      const width = cfg.width || '280px';
      const value = cfg.value || '';

      return `
        <div class="c1-search-box-wrap" id="${id}_wrap" style="position:relative;display:inline-flex;align-items:center;min-width:160px;max-width:${width};width:100%;box-sizing:border-box;">
          <input type="text" id="${id}" class="input-1c c1-search-input" value="${this.escapeHtml(value)}" placeholder="${placeholder}"
                 style="width:100%;height:23px;padding:2px 26px 2px 8px;font-size:11px;border:1px solid #7f9db9;border-radius:2px;background:#ffffff;box-sizing:border-box;outline:none;"
                 autocomplete="off">
          <button type="button" class="c1-search-action-btn" id="${id}_actionBtn" title="Найти (Enter) / Очистить (Ctrl+Q)"
                  style="position:absolute;right:3px;top:50%;transform:translateY(-50%);width:20px;height:19px;border:none;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;outline:none;">
            <!-- Lupa İkonu -->
            <svg class="c1-icon-search" width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:${value ? 'none' : 'block'};">
              <circle cx="6.5" cy="6.5" r="4.5" stroke="#004080" stroke-width="1.8"/>
              <line x1="10" y1="10" x2="14.5" y2="14.5" stroke="#004080" stroke-width="2" stroke-linecap="round"/>
            </svg>
            <!-- X Təmizlə İkonu -->
            <span class="c1-icon-clear" style="display:${value ? 'block' : 'none'};color:#c62828;font-weight:bold;font-size:13px;line-height:13px;">✕</span>
          </button>
        </div>
      `.trim();
    },

    /**
     * DOM elementinə hadisələri bağlayır və idarə edir
     */
    attach: function (containerEl, cfg = {}) {
      if (!containerEl) return;
      const inputEl = containerEl.querySelector('.c1-search-input') || containerEl.querySelector('input');
      const actionBtn = containerEl.querySelector('.c1-search-action-btn') || containerEl.querySelector('button');
      const searchIcon = containerEl.querySelector('.c1-icon-search');
      const clearIcon = containerEl.querySelector('.c1-icon-clear');

      const debounceDelay = (typeof cfg.debounceMs === 'number') ? cfg.debounceMs : 250;
      let debounceTimer = null;

      const updateIcons = () => {
        const hasVal = Boolean(inputEl && inputEl.value.trim());
        if (searchIcon) searchIcon.style.display = hasVal ? 'none' : 'block';
        if (clearIcon) clearIcon.style.display = hasVal ? 'block' : 'none';
      };

      if (inputEl) {
        updateIcons();

        inputEl.oninput = () => {
          updateIcons();
          const q = inputEl.value;

          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            if (typeof cfg.onInput === 'function') cfg.onInput(q);
          }, debounceDelay);
        };

        inputEl.onkeydown = (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (debounceTimer) clearTimeout(debounceTimer);
            if (typeof cfg.onSearch === 'function') cfg.onSearch(inputEl.value);
          } else if (e.key === 'Escape' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'q')) {
            e.preventDefault();
            if (debounceTimer) clearTimeout(debounceTimer);
            inputEl.value = '';
            updateIcons();
            if (typeof cfg.onClear === 'function') cfg.onClear();
            inputEl.blur();
          }
        };
      }

      if (actionBtn) {
        actionBtn.onclick = (e) => {
          e.stopPropagation();
          if (inputEl && inputEl.value.trim()) {
            // Əgər dəyər varsa, X klikləndikdə təmizləyir
            if (debounceTimer) clearTimeout(debounceTimer);
            inputEl.value = '';
            updateIcons();
            if (typeof cfg.onClear === 'function') cfg.onClear();
            inputEl.focus();
          } else if (inputEl) {
            // Dəyər boşdursa, axtarışı çağırır
            if (typeof cfg.onSearch === 'function') cfg.onSearch(inputEl.value);
            inputEl.focus();
          }
        };
      }

      return {
        setValue: (val) => {
          if (inputEl) {
            inputEl.value = val || '';
            updateIcons();
          }
        },
        getValue: () => inputEl ? inputEl.value : '',
        clear: () => {
          if (inputEl) {
            inputEl.value = '';
            updateIcons();
            if (typeof cfg.onClear === 'function') cfg.onClear();
          }
        },
        focus: () => {
          if (inputEl) inputEl.focus();
        }
      };
    },

    escapeHtml: function (str) {
      if (!str) return '';
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
  };

  // Qlobal qeydiyyat
  window.FilterSearchBox = FilterSearchBox;
  window.OneCSearchBox = FilterSearchBox;
  window.OneCFindBar = FilterSearchBox;
})(window);
