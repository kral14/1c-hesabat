/**
 * ======================================================================
 * 1C:ENTERPRISE - UNIVERSAL "NAYTİ" (AXTARIŞ) KOMPONENTİ
 * static/js/components/c1_search_box.js
 *
 * Bütün cədvəllər, jurnallar, arayışlar və sənəd siyahıları üçün
 * vahid 1C "Найти" (Axtarış) aləti.
 *
 * Xüsusiyyətlər:
 * - Vahid 1C vizual görünüşü (hündürlük 23px, #7f9db9 haşiyə, daxili lupa/✕)
 * - Mətn yazıldıqda avtomatik Lupa (🔍) -> Təmizlə (✕) keçidi
 * - Canlı axtarış (Debounced live search)
 * - Enter ilə dərhal axtarış
 * - Escape və Ctrl+Q ilə dərhal təmizləmə və sıfırlama
 * - Dinamik AZ / RU dil dəyişməsinə (i18n) dərhal reaksiya
 * ======================================================================
 */

(function (window) {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const C1SearchBox = {
    instances: new Map(),

    /**
     * Vahid axtarış qutusunun HTML stringini generasiya edir
     */
    renderHtml: function (cfg = {}) {
      const id = cfg.id || 'c1SearchInput_' + Math.random().toString(36).substr(2, 6);
      const i18nKey = cfg.i18nKey || cfg.i18nPlaceholder || 'common.search_placeholder';
      let placeholder = cfg.placeholder;
      if (!placeholder && window.C1I18n) {
        placeholder = C1I18n.t(i18nKey) || 'Найти по всем колонкам (Ctrl+Q)...';
      } else if (!placeholder) {
        placeholder = 'Найти по всем колонкам (Ctrl+Q)...';
      }

      const width = cfg.width || '280px';
      const value = cfg.value || '';
      const hasValue = Boolean(value.trim());

      return `
        <div class="c1-search-box-wrap" id="${id}_wrap" style="position:relative;display:inline-flex;align-items:center;min-width:160px;max-width:${width};width:100%;box-sizing:border-box;">
          <input type="text" id="${id}" class="input-1c c1-search-input" value="${escapeHtml(value)}"
                 placeholder="${escapeHtml(placeholder)}"
                 data-i18n-placeholder="${escapeHtml(i18nKey)}"
                 style="width:100%;height:23px;padding:2px 26px 2px 8px;font-size:11px;border:1px solid #7f9db9;border-radius:2px;background:#ffffff;box-sizing:border-box;outline:none;"
                 autocomplete="off" spellcheck="false">
          <button type="button" class="c1-search-action-btn" id="${id}_actionBtn" 
                  title="${window.C1I18n ? C1I18n.t('cat.search_placeholder') : 'Найти (Enter) / Очистить (Ctrl+Q)'}"
                  style="position:absolute;right:3px;top:50%;transform:translateY(-50%);width:20px;height:19px;border:none;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;outline:none;border-radius:2px;">
            <!-- Lupa İkonu -->
            <svg class="c1-icon-search" width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:${hasValue ? 'none' : 'block'};">
              <circle cx="6.5" cy="6.5" r="4.5" stroke="#004080" stroke-width="1.8"/>
              <line x1="10" y1="10" x2="14.5" y2="14.5" stroke="#004080" stroke-width="2" stroke-linecap="round"/>
            </svg>
            <!-- X Təmizlə İkonu -->
            <span class="c1-icon-clear" style="display:${hasValue ? 'block' : 'none'};color:#c62828;font-weight:bold;font-size:13px;line-height:13px;">✕</span>
          </button>
        </div>
      `.trim();
    },

    /**
     * Mövcud DOM elementini aktivləşdirir və hadisələri bağlayır
     */
    attach: function (containerEl, cfg = {}) {
      if (typeof containerEl === 'string') {
        containerEl = document.querySelector(containerEl);
      }
      if (!containerEl) return null;

      const inputEl = containerEl.querySelector('.c1-search-input, .uj-search-input') || containerEl.querySelector('input');
      const actionBtn = containerEl.querySelector('.c1-search-action-btn, #ujSearchActionBtn') || containerEl.querySelector('button');
      let searchIcon = containerEl.querySelector('.c1-icon-search') || (actionBtn ? actionBtn.querySelector('svg') : null);
      let clearIcon = containerEl.querySelector('.c1-icon-clear') || (actionBtn ? actionBtn.querySelector('span') : null);

      // Əgər actionBtn daxilində X ikonu yoxdursa, əlavə edək
      if (actionBtn && !clearIcon) {
        clearIcon = document.createElement('span');
        clearIcon.className = 'c1-icon-clear';
        clearIcon.textContent = '✕';
        clearIcon.style.cssText = 'display:none;color:#c62828;font-weight:bold;font-size:13px;line-height:13px;';
        actionBtn.appendChild(clearIcon);
      }

      const debounceDelay = (typeof cfg.debounceMs === 'number') ? cfg.debounceMs : 250;
      let debounceTimer = null;

      const updateIcons = () => {
        const hasVal = Boolean(inputEl && inputEl.value.trim());
        if (searchIcon) searchIcon.style.display = hasVal ? 'none' : 'block';
        if (clearIcon) clearIcon.style.display = hasVal ? 'block' : 'none';
        if (actionBtn) {
          actionBtn.title = hasVal 
            ? (window.C1I18n?.getLanguage() === 'az' ? 'Axtarışı təmizlə (Ctrl+Q / Esc)' : 'Очистить поиск (Ctrl+Q / Esc)')
            : (window.C1I18n?.getLanguage() === 'az' ? 'Axtar (Enter)' : 'Найти (Enter)');
        }
      };

      if (inputEl) {
        updateIcons();

        inputEl.addEventListener('input', () => {
          updateIcons();
          const q = inputEl.value;

          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            if (typeof cfg.onInput === 'function') cfg.onInput(q);
          }, debounceDelay);
        });

        inputEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (debounceTimer) clearTimeout(debounceTimer);
            if (typeof cfg.onSearch === 'function') {
              cfg.onSearch(inputEl.value);
            }
          } else if (e.key === 'Escape' || ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'q' || e.code === 'KeyQ'))) {
            e.preventDefault();
            if (debounceTimer) clearTimeout(debounceTimer);
            inputEl.value = '';
            updateIcons();
            if (typeof cfg.onClear === 'function') {
              cfg.onClear();
            }
            inputEl.blur();
          }
        });
      }

      if (actionBtn) {
        actionBtn.onclick = (e) => {
          e.stopPropagation();
          if (inputEl && inputEl.value.trim()) {
            // Dəyər varsa, ✕ klikləndikdə təmizləyir
            if (debounceTimer) clearTimeout(debounceTimer);
            inputEl.value = '';
            updateIcons();
            if (typeof cfg.onClear === 'function') cfg.onClear();
            inputEl.focus();
          } else if (inputEl) {
            // Boşdursa, Enter kimi axtarışı icra edir
            if (typeof cfg.onSearch === 'function') cfg.onSearch(inputEl.value);
            inputEl.focus();
          }
        };
      }

      const instance = {
        container: containerEl,
        input: inputEl,
        actionBtn: actionBtn,
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
          if (inputEl) {
            inputEl.focus();
            inputEl.select();
          }
        }
      };

      if (inputEl && inputEl.id) {
        C1SearchBox.instances.set(inputEl.id, instance);
      }

      return instance;
    },

    /**
     * Konteynerə HTML-i render edib avtomatik bağlayır
     */
    mount: function (targetContainer, cfg = {}) {
      if (typeof targetContainer === 'string') {
        targetContainer = document.querySelector(targetContainer);
      }
      if (!targetContainer) return null;

      targetContainer.innerHTML = this.renderHtml(cfg);
      return this.attach(targetContainer, cfg);
    }
  };

  // Dil dəyişdikdə bütün mövcud C1SearchBox-ların placeholder və başlıqlarını yeniləyir
  window.addEventListener('c1-language-changed', () => {
    document.querySelectorAll('.c1-search-box-wrap, .uj-search-wrap').forEach(wrap => {
      const inp = wrap.querySelector('input');
      const btn = wrap.querySelector('button');
      if (inp && inp.getAttribute('data-i18n-placeholder') && window.C1I18n) {
        const key = inp.getAttribute('data-i18n-placeholder');
        const translated = C1I18n.t(key);
        if (translated) inp.placeholder = translated;
      }
      if (btn && inp) {
        const hasVal = Boolean(inp.value.trim());
        btn.title = hasVal 
          ? (window.C1I18n?.getLanguage() === 'az' ? 'Axtarışı təmizlə (Ctrl+Q / Esc)' : 'Очистить поиск (Ctrl+Q / Esc)')
          : (window.C1I18n?.getLanguage() === 'az' ? 'Axtar (Enter)' : 'Найти (Enter)');
      }
    });
  });

  // Qlobal qeydiyyat
  window.C1SearchBox = C1SearchBox;
  window.FilterSearchBox = C1SearchBox;
  window.OneCSearchBox = C1SearchBox;
  window.OneCFindBar = C1SearchBox;
})(window);
