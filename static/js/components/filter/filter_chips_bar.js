/**
 * ======================================================================
 * 1C:ENTERPRISE - FİLTR BÖLMƏSİ: AKTİV FİLTR ETİKETLƏRİ İŞÇİSİ
 * static/js/components/filter/filter_chips_bar.js
 * 
 * Cədvəlin yuxarısında hazırda tətbiq olunmuş filtrləri göstərən
 * və tək kliklə silməyə imkan verən etiketlər (Chips / Badges) zolağı.
 * ======================================================================
 */

(function (window) {
  'use strict';

  const FilterChipsBar = {
    /**
     * Aktiv filtrlər zolağı konteynerini yaradır
     */
    renderContainer: function (id = 'c1ActiveFiltersBar') {
      return `
        <div id="${id}" class="c1-active-filters-bar"
             style="display:none;background:#fbfaf3;border-bottom:1px solid #d4d0c8;padding:3px 8px;gap:6px;align-items:center;flex-wrap:wrap;font-size:11px;">
          <span style="color:#666;font-weight:600;display:inline-flex;align-items:center;gap:3px;">
            <span>🏷️</span>
            <span>Aktiv filtrlər:</span>
          </span>
          <div class="c1-chips-list" style="display:inline-flex;gap:4px;flex-wrap:wrap;align-items:center;"></div>
          <button type="button" class="btn-1c c1-clear-all-chips" title="Bütün filtrləri çıxar"
                  style="height:19px;padding:0 6px;font-size:10px;margin-left:auto;color:#b91c1c;border:1px solid #fca5a5;background:#fff;border-radius:2px;cursor:pointer;">
            Hamısını sil ✕
          </button>
        </div>
      `.trim();
    },

    /**
     * Verilmiş meyarlar siyahısına görə etiketləri çəkir
     * @param {HTMLElement} barEl
     * @param {Array} criteriaList [{ fieldKey, fieldLabel, comparison, value, enabled }]
     * @param {Function} onRemoveSingle (index)
     * @param {Function} onClearAll ()
     */
    update: function (barEl, criteriaList = [], onRemoveSingle, onClearAll) {
      if (!barEl) return;
      const chipsList = barEl.querySelector('.c1-chips-list');
      const clearAllBtn = barEl.querySelector('.c1-clear-all-chips');
      if (!chipsList) return;

      const activeList = criteriaList.filter(c => c && c.enabled !== false && c.value !== undefined && c.value !== '');

      if (activeList.length === 0) {
        barEl.style.display = 'none';
        chipsList.innerHTML = '';
        return;
      }

      barEl.style.display = 'flex';
      let html = '';

      activeList.forEach((crit, idx) => {
        const label = crit.fieldLabel || crit.fieldKey || 'Sahə';
        const valStr = String(crit.value || '');
        const compLabel = crit.comparisonLabel || crit.comparison || '=';

        html += `
          <span class="c1-filter-chip" data-idx="${idx}"
                style="display:inline-flex;align-items:center;gap:4px;background:#e8edf5;border:1px solid #7f9db9;border-radius:3px;padding:1px 6px;color:#002060;font-size:11px;">
            <span style="font-weight:600;">${this.escapeHtml(label)}:</span>
            <span style="color:#555;font-size:10px;">${this.escapeHtml(compLabel)}</span>
            <span style="font-weight:bold;color:#111;">«${this.escapeHtml(valStr)}»</span>
            <button type="button" class="c1-chip-remove" data-idx="${idx}" title="Bu filtri sil"
                    style="border:none;background:transparent;cursor:pointer;padding:0 2px;color:#dc2626;font-weight:bold;font-size:11px;outline:none;">✕</button>
          </span>
        `;
      });

      chipsList.innerHTML = html;

      // Eventlər
      chipsList.querySelectorAll('.c1-chip-remove').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const targetIdx = Number(btn.dataset.idx);
          if (typeof onRemoveSingle === 'function') {
            onRemoveSingle(targetIdx, activeList[targetIdx]);
          }
        };
      });

      if (clearAllBtn) {
        clearAllBtn.onclick = (e) => {
          e.stopPropagation();
          if (typeof onClearAll === 'function') {
            onClearAll();
          }
        };
      }
    },

    escapeHtml: function (str) {
      if (!str) return '';
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
  };

  window.FilterChipsBar = FilterChipsBar;
})(window);
