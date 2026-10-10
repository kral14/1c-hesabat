/**
 * ======================================================================
 * 1C:ENTERPRISE - FİLTR BÖLMƏSİ: FİLTR ŞƏRTLƏRİ MODALI İŞÇİSİ
 * static/js/components/filter/filter_criteria_modal.js
 * 
 * 1C Standart «Настройка списка (Отбор и сортировка)» pəncərəsi.
 * Sütun, müqayisə növü və dəyər seçimi.
 * Dəyər sahəsində birbaşa CatalogPickerManager işçilərindən istifadə edir.
 * ======================================================================
 */

(function (window) {
  'use strict';

  const FilterCriteriaModal = {
    modalId: 'c1FilterCriteriaModal',
    isOpen: false,
    criteria: [],
    availableFields: [],
    onApplyCallback: null,

    /**
     * Modalı açır
     * @param {Object} options
     *   - fields: [{ key: 'kontragent', label: 'Контрагент', catalog: 'Контрагенты' }, ...]
     *   - criteria: [{ fieldKey, comparison, value, enabled }]
     *   - onApply: callback funksiyası
     */
    open: function (options = {}) {
      this.availableFields = options.fields || [];
      this.criteria = JSON.parse(JSON.stringify(options.criteria || []));
      this.onApplyCallback = options.onApply || null;

      let modalEl = document.getElementById(this.modalId);
      if (!modalEl) {
        modalEl = this.createModalElement();
        document.body.appendChild(modalEl);
      }

      this.renderTableBody();
      modalEl.style.display = 'flex';
      this.isOpen = true;
    },

    close: function () {
      const modalEl = document.getElementById(this.modalId);
      if (modalEl) modalEl.style.display = 'none';
      this.isOpen = false;
    },

    createModalElement: function () {
      const div = document.createElement('div');
      div.id = this.modalId;
      div.className = 'c1-modal-overlay';
      div.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.4);display:none;align-items:center;justify-content:center;z-index:9999;';

      div.innerHTML = `
        <div class="c1-modal-box" style="background:#f0eee3;border:2px solid #002060;box-shadow:0 8px 24px rgba(0,0,0,0.3);width:640px;max-width:95vw;height:420px;display:flex;flex-direction:column;border-radius:2px;">
          <!-- Header -->
          <div style="background:#002060;color:#fff;padding:6px 10px;font-weight:bold;font-size:12px;display:flex;align-items:center;justify-content:space-between;user-select:none;">
            <span>Настройка списка (Отбор)</span>
            <button type="button" class="c1-modal-close-btn" style="border:none;background:transparent;color:#fff;font-weight:bold;cursor:pointer;font-size:13px;">✕</button>
          </div>

          <!-- Toolbar -->
          <div style="background:#e5e2cf;border-bottom:1px solid #b0af9f;padding:4px 8px;display:flex;align-items:center;gap:6px;">
            <button type="button" class="btn-1c c1-add-crit-btn" style="height:23px;padding:0 8px;font-weight:bold;color:#166534;cursor:pointer;">➕ Əlavə et</button>
            <button type="button" class="btn-1c c1-del-crit-btn" style="height:23px;padding:0 8px;font-weight:bold;color:#991b1b;cursor:pointer;">✕ Sil</button>
            <div style="width:1px;height:16px;background:#b0af9f;margin:0 2px;"></div>
            <button type="button" class="btn-1c c1-clear-all-crit-btn" style="height:23px;padding:0 8px;cursor:pointer;">Hamısını təmizlə</button>
          </div>

          <!-- Body Table -->
          <div style="flex:1;overflow:auto;background:#fff;padding:4px;">
            <table style="width:100%;border-collapse:collapse;font-size:11px;">
              <thead>
                <tr style="background:#e0dfd5;height:22px;border-bottom:1px solid #7f9db9;">
                  <th style="width:30px;border:1px solid #b0af9f;text-align:center;">✔</th>
                  <th style="width:170px;border:1px solid #b0af9f;padding:2px 6px;text-align:left;">Поле (Sütun)</th>
                  <th style="width:130px;border:1px solid #b0af9f;padding:2px 6px;text-align:left;">Вид сравнения</th>
                  <th style="border:1px solid #b0af9f;padding:2px 6px;text-align:left;">Значение (Dəyər)</th>
                </tr>
              </thead>
              <tbody class="c1-criteria-tbody"></tbody>
            </table>
          </div>

          <!-- Footer Buttons -->
          <div style="background:#e5e2cf;border-top:1px solid #b0af9f;padding:6px 10px;display:flex;align-items:center;justify-content:flex-end;gap:8px;">
            <button type="button" class="btn-1c btn-1c-primary c1-apply-btn" style="height:24px;padding:0 14px;font-weight:bold;cursor:pointer;">OK (Tətbiq et)</button>
            <button type="button" class="btn-1c c1-cancel-btn" style="height:24px;padding:0 12px;cursor:pointer;">İmtina</button>
          </div>
        </div>
      `;

      // Eventlər
      div.querySelector('.c1-modal-close-btn').onclick = () => this.close();
      div.querySelector('.c1-cancel-btn').onclick = () => this.close();
      div.querySelector('.c1-add-crit-btn').onclick = () => this.addNewRow();
      div.querySelector('.c1-clear-all-crit-btn').onclick = () => {
        this.criteria = [];
        this.renderTableBody();
      };
      div.querySelector('.c1-apply-btn').onclick = () => {
        this.apply();
      };

      return div;
    },

    addNewRow: function () {
      const firstField = this.availableFields[0] || { key: '', label: '' };
      this.criteria.push({
        enabled: true,
        fieldKey: firstField.key,
        fieldLabel: firstField.label,
        comparison: 'Равно',
        value: ''
      });
      this.renderTableBody();
    },

    renderTableBody: function () {
      const modalEl = document.getElementById(this.modalId);
      if (!modalEl) return;
      const tbody = modalEl.querySelector('.c1-criteria-tbody');
      if (!tbody) return;

      tbody.innerHTML = '';
      if (this.criteria.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:#888;font-style:italic;">Filtr meyarları təyin edilməyib. «Əlavə et» düyməsini sıxın.</td></tr>';
        return;
      }

      this.criteria.forEach((crit, idx) => {
        const tr = document.createElement('tr');
        tr.style.height = '26px';
        tr.style.borderBottom = '1px solid #e0dfd5';

        // 1. Checkbox (aktiv / passiv)
        const tdCheck = document.createElement('td');
        tdCheck.style.cssText = 'text-align:center;border:1px solid #d4d0c8;';
        tdCheck.innerHTML = `<input type="checkbox" ${crit.enabled !== false ? 'checked' : ''} style="cursor:pointer;">`;
        tdCheck.querySelector('input').onchange = (e) => { crit.enabled = e.target.checked; };
        tr.appendChild(tdCheck);

        // 2. Sahə (Sütun seçimi)
        const tdField = document.createElement('td');
        tdField.style.cssText = 'padding:2px 4px;border:1px solid #d4d0c8;';
        const fieldSelect = document.createElement('select');
        fieldSelect.style.cssText = 'width:100%;height:22px;font-size:11px;border:1px solid #7f9db9;background:#fff;';
        this.availableFields.forEach(f => {
          const opt = document.createElement('option');
          opt.value = f.key;
          opt.textContent = f.label || f.key;
          if (f.key === crit.fieldKey) opt.selected = true;
          fieldSelect.appendChild(opt);
        });
        fieldSelect.onchange = (e) => {
          crit.fieldKey = e.target.value;
          const found = this.availableFields.find(f => f.key === crit.fieldKey);
          crit.fieldLabel = found ? found.label : crit.fieldKey;
          this.renderTableBody();
        };
        tdField.appendChild(fieldSelect);
        tr.appendChild(tdField);

        // 3. Müqayisə növü
        const tdComp = document.createElement('td');
        tdComp.style.cssText = 'padding:2px 4px;border:1px solid #d4d0c8;';
        const compSelect = document.createElement('select');
        compSelect.style.cssText = 'width:100%;height:22px;font-size:11px;border:1px solid #7f9db9;background:#fff;';
        ['Равно', 'Не равно', 'Содержит', 'Не содержит', 'Начинается с', 'Заполнено', 'Не заполнено'].forEach(c => {
          const opt = document.createElement('option');
          opt.value = c;
          opt.textContent = c;
          if (c === crit.comparison) opt.selected = true;
          compSelect.appendChild(opt);
        });
        compSelect.onchange = (e) => { crit.comparison = e.target.value; };
        tdComp.appendChild(compSelect);
        tr.appendChild(tdComp);

        // 4. Dəyər sahəsi (CatalogPickerManager ilə inteqrasiya!)
        const tdVal = document.createElement('td');
        tdVal.style.cssText = 'padding:2px 4px;border:1px solid #d4d0c8;';
        const currentFieldDef = this.availableFields.find(f => f.key === crit.fieldKey) || {};
        const catalogName = currentFieldDef.catalog || '';

        if (catalogName && window.CatalogPickerManager) {
          tdVal.innerHTML = window.CatalogPickerManager.render({
            catalog: catalogName,
            value: crit.value || '',
            width: '100%'
          });
          window.CatalogPickerManager.attach(tdVal.firstElementChild, {
            catalog: catalogName,
            onSelect: (item, valStr) => { crit.value = valStr; },
            onChange: (valStr) => { crit.value = valStr; }
          });
        } else {
          // Sadə mətn inputu
          const txtInput = document.createElement('input');
          txtInput.type = 'text';
          txtInput.value = crit.value || '';
          txtInput.style.cssText = 'width:100%;height:22px;font-size:11px;border:1px solid #7f9db9;padding:0 5px;box-sizing:border-box;';
          txtInput.oninput = (e) => { crit.value = e.target.value; };
          tdVal.appendChild(txtInput);
        }
        tr.appendChild(tdVal);

        tbody.appendChild(tr);
      });
    },

    apply: function () {
      this.close();
      if (typeof this.onApplyCallback === 'function') {
        this.onApplyCallback(this.criteria);
      }
    }
  };

  window.FilterCriteriaModal = FilterCriteriaModal;
})(window);
