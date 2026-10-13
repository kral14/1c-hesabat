/**
 * ======================================================================
 * 1C:ENTERPRISE - STANDARD TEXTBOX COMPONENT (C1TextBox)
 * static/js/components/c1_textbox.js
 *
 * Standart 1C mətn daxiletmə və seçim sahəsi (Поле ввода с кнопкой выбора).
 * Bütün mətn qutuları eyni 1C görünüşünə, eyni davranışa və F4 qısayoluna malikdir.
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

  const C1TextBox = {
    /**
     * Standart 1C TextBox HTML-i generasiya edir
     * @param {Object} cfg
     *   - id: Element ID
     *   - value: Başlanğıc dəyər
     *   - placeholder: Dəyər olmadıqda görünən mətn
     *   - readonly: true/false (sahə adları üçün readonly: true)
     *   - wrapClass: Div üçün əlavə sinif
     *   - inputClass: Input üçün əlavə siniflər
     *   - btnClass: Button üçün əlavə siniflər
     *   - btnTitle: 3 nöqtə düyməsinin tooltip-i (standart: "Выбрать (F4)")
     *   - onClickPick: 3 nöqtəyə basıldıqda çağırılacaq JS kodu (string)
     *   - extraAttrs: div wrapper-ə veriləcək əlavə atributlar
     *   - dataField: data-field atributu
     */
    render: function(cfg = {}) {
      const idAttr = cfg.id ? `id="${cfg.id}"` : '';
      const wrapClass = cfg.wrapClass ? `c1-textbox-wrap ${cfg.wrapClass}` : 'c1-textbox-wrap';
      const inputClass = cfg.inputClass ? `c1-textbox-input ${cfg.inputClass}` : 'c1-textbox-input';
      const btnClass = cfg.btnClass ? `c1-textbox-btn ${cfg.btnClass}` : 'c1-textbox-btn';
      const value = cfg.value !== undefined && cfg.value !== null ? String(cfg.value) : '';
      const placeholder = cfg.placeholder || '';
      const readonlyAttr = cfg.readonly ? 'readonly' : '';
      const btnTitle = cfg.btnTitle || 'Выбрать (F4)';
      const onClickPick = cfg.onClickPick ? `onclick="${cfg.onClickPick}"` : '';
      const extraAttrs = cfg.extraAttrs || '';
      const dataFieldAttr = cfg.dataField ? `data-field="${escapeHtml(cfg.dataField)}"` : '';

      return `
        <div class="${wrapClass}" data-component="c1-textbox" ${extraAttrs}>
          <input type="text" class="${inputClass}" ${idAttr} ${dataFieldAttr}
                 value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}"
                 ${readonlyAttr} autocomplete="off" spellcheck="false" title="${escapeHtml(value)}">
          <button type="button" class="${btnClass}" tabindex="-1" ${onClickPick} title="${escapeHtml(btnTitle)}">...</button>
        </div>
      `.trim();
    },

    /**
     * DOM obyekti yaradır
     */
    create: function(cfg = {}) {
      const temp = document.createElement('div');
      temp.innerHTML = this.render(cfg);
      const el = temp.firstElementChild;
      this.bind(el);
      return el;
    },

    /**
     * Konteyner daxilindəki C1TextBox elementlərinə F4 və hadisələri bağlayır
     */
    bind: function(container) {
      if (!container) return;

      const isWrap = container.classList && (
        container.classList.contains('c1-textbox-wrap') ||
        container.classList.contains('filter-field-cell-wrap') ||
        container.classList.contains('filter-value-cell-wrap')
      );

      const wraps = isWrap ? [container] : (container.querySelectorAll ? container.querySelectorAll('.c1-textbox-wrap, .filter-field-cell-wrap, .filter-value-cell-wrap') : []);

      wraps.forEach(wrap => {
        if (wrap._c1Bound) return;
        wrap._c1Bound = true;

        const input = wrap.querySelector('input[type="text"], .c1-textbox-input, .filter-field-name, .filter-val-input');
        const btn = wrap.querySelector('.c1-textbox-btn, .filter-field-btn-pick, .filter-btn-pick');

        if (input && btn) {
          // F4 hadisəsi birbaşa input üzərində
          input.addEventListener('keydown', function(e) {
            if (e.key === 'F4' || e.keyCode === 115) {
              e.preventDefault();
              e.stopPropagation();
              btn.click();
            }
          });

          // Readonly sahələrdə (məs. Поле) ikiqat klikləmə (double-click) də seçimi açır (1C davranışı)
          if (input.readOnly) {
            input.addEventListener('dblclick', function(e) {
              e.preventDefault();
              btn.click();
            });
          }

          // Klikləyəndə mətnin itməsinin qarşısını alırıq: rəngin dəqiq qara qalmasını təmin edirik
          input.addEventListener('focus', function() {
            input.style.setProperty('color', '#111111', 'important');
            input.style.setProperty('-webkit-text-fill-color', '#111111', 'important');
            input.style.setProperty('background-color', '#ffffff', 'important');
          });

          input.addEventListener('click', function(e) {
            e.stopPropagation(); // Valideyn sətir/xana seçimi mətnimizi pozmasın
          });
        }
      });
    },

    /**
     * Bütün səhifədəki mövcud textbox-ları tapıb bağlayır
     */
    initAll: function() {
      this.bind(document.body);
    }
  };

  // Qlobal F4 listener: İstənilən aktiv input və ya cədvəl sətrində F4 basıldıqda müvafiq 3 nöqtəni işə salır
  document.addEventListener('keydown', function(e) {
    if (e.key === 'F4' || e.keyCode === 115) {
      const activeEl = document.activeElement;
      if (!activeEl) return;

      // 1. Birbaşa c1-textbox-wrap və ya input daxilindədirsə
      const wrap = activeEl.closest('.c1-textbox-wrap, .filter-field-cell-wrap, .filter-value-cell-wrap');
      if (wrap) {
        const btn = wrap.querySelector('.c1-textbox-btn, .filter-field-btn-pick, .filter-btn-pick');
        if (btn) {
          e.preventDefault();
          e.stopPropagation();
          btn.click();
          return;
        }
      }

      // 2. Cədvəl sətrindədirsə (məsələn, .filters-table tr)
      const tr = activeEl.closest('tr');
      if (tr) {
        // Əgər dəyər xanasındadırsa, dəyər düyməsini; sahə xanasındadırsa, sahə düyməsini aç
        const td = activeEl.closest('td');
        if (td) {
          const btn = td.querySelector('.c1-textbox-btn, .filter-field-btn-pick, .filter-btn-pick');
          if (btn) {
            e.preventDefault();
            e.stopPropagation();
            btn.click();
            return;
          }
        }
        // Fallback: sətirdəki ilk seçici düyməsi
        const rowBtn = tr.querySelector('.c1-textbox-btn, .filter-field-btn-pick, .filter-btn-pick');
        if (rowBtn) {
          e.preventDefault();
          e.stopPropagation();
          rowBtn.click();
        }
      }
    }
  }, true);

  // Sənəd yükləndikdə avtomatik işə sal
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => C1TextBox.initAll());
  } else {
    setTimeout(() => C1TextBox.initAll(), 100);
  }

  window.C1TextBox = C1TextBox;

})(window);
