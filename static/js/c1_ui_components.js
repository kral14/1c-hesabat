/**
 * ======================================================================
 * 1C:ENTERPRISE - UNIVERSAL UI COMPONENTS & PRIMITIVES
 * static/js/c1_ui_components.js
 * 
 * Vahid İkon Sistemi (OneCIcons)
 * Vahid Təqvim / Dövr Seçici Komponenti (OneCPeriodBar)
 * Vahid Filtr Zolağı və Elementləri (OneCFilterBar)
 * 
 * Hər hansı ikonu, təqvimi və ya filtr elementini 1 yerdə dəyişdikdə
 * bütün sistemdə avtomatik yenilənməsini təmin edir.
 * ======================================================================
 */

(function (window) {
  'use strict';

  // ====================================================================
  // 1. UNIVERSAL İKON SİSTEMİ (OneCIcons)
  // ====================================================================
  const OneCIcons = {
    /**
     * Sənədin vəziyyətinə uyğun 1C klassik sənəd ikonu:
     * - Təsdiqlənmiş (posted): Ağ sənəd vərəqi üzərində qabarıq yaşıl quş (true / checkmark)
     * - Qaralama (draft): Təmiz, boş sənəd vərəqi
     * - Silinmə nişanı (deleted): Sənəd vərəqi üzərində qırmızı çarpaz (✕)
     */
    docStatus: function (doc = {}, options = {}) {
      const isDeleted = Boolean(doc.deleted || doc.is_deleted || doc.marked_for_deletion);
      const isPosted = !isDeleted && Boolean(doc.posted || doc.is_posted);
      const sizeW = options.width || 14;
      const sizeH = options.height || 15;
      const extraClass = options.className || '';

      if (isDeleted) {
        return this.docDeleted(sizeW, sizeH, extraClass, options.title);
      }
      if (isPosted) {
        return this.docPosted(sizeW, sizeH, extraClass, options.title);
      }
      return this.docDraft(sizeW, sizeH, extraClass, options.title);
    },

    /** Təsdiqlənmiş sənəd ikonu (Sənəd vərəqi və yuxarı sağda optimal yaşıl quş) */
    docPosted: function (w = 16, h = 16, cls = '', title = 'Təsdiqlənib (Provodka edilib)') {
      return `
        <span class="c1-status-icon c1-status-posted ${cls}" title="${title}" style="display:inline-flex;align-items:center;justify-content:center;width:${w + 2}px;height:${h + 1}px;vertical-align:middle;user-select:none;">
          <svg width="${w}" height="${h}" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <!-- Sənəd vərəqi -->
            <path d="M1.5 1.5C1.5 1.22 1.72 1 2 1H8.5L12 4.5V14.5C12 14.78 11.78 15 11.5 15H2C1.72 15 1.5 14.78 1.5 14.5V1.5Z" fill="#FFFFFF" stroke="#7A8A9E" stroke-width="1"/>
            <path d="M8.5 1V4.5H12" fill="#E8EEF5" stroke="#7A8A9E" stroke-width="1"/>
            <!-- Sənəd daxili xətləri -->
            <line x1="3.5" y1="6.5" x2="6.5" y2="6.5" stroke="#B0C0D0" stroke-width="1"/>
            <line x1="3.5" y1="9.5" x2="8" y2="9.5" stroke="#B0C0D0" stroke-width="1"/>
            <line x1="3.5" y1="12" x2="9.5" y2="12" stroke="#B0C0D0" stroke-width="1"/>
            <!-- Yuxarı sağda aydın yaşıl TRUE (quş) işarəsi -->
            <path d="M6.5 6.2L9.2 9.5L15 1.5" stroke="#FFFFFF" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M6.5 6.2L9.2 9.5L15 1.5" stroke="#247828" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
      `.trim();
    },

    /** Təsdiqlənməmiş / Qaralama sənəd ikonu (Boş sənəd vərəqi) */
    docDraft: function (w = 16, h = 16, cls = '', title = 'Qaralama (Təsdiqlənməyib)') {
      return `
        <span class="c1-status-icon c1-status-draft ${cls}" title="${title}" style="display:inline-flex;align-items:center;justify-content:center;width:${w + 2}px;height:${h + 1}px;vertical-align:middle;user-select:none;">
          <svg width="${w}" height="${h}" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1.5 1.5C1.5 1.22 1.72 1 2 1H8.5L12 4.5V14.5C12 14.78 11.78 15 11.5 15H2C1.72 15 1.5 14.78 1.5 14.5V1.5Z" fill="#FFFFFF" stroke="#7A8A9E" stroke-width="1"/>
            <path d="M8.5 1V4.5H12" fill="#E8EEF5" stroke="#7A8A9E" stroke-width="1"/>
            <line x1="3.5" y1="6.5" x2="9.5" y2="6.5" stroke="#B0C0D0" stroke-width="1"/>
            <line x1="3.5" y1="9.5" x2="9.5" y2="9.5" stroke="#B0C0D0" stroke-width="1"/>
            <line x1="3.5" y1="12" x2="8" y2="12" stroke="#B0C0D0" stroke-width="1"/>
          </svg>
        </span>
      `.trim();
    },

    /** Silinməyə qeyd olunmuş sənəd ikonu (Vərəq üzərində qırmızı ✕) */
    docDeleted: function (w = 16, h = 16, cls = '', title = 'Pozulma nişanı qoyulub (Silinib)') {
      return `
        <span class="c1-status-icon c1-status-deleted ${cls}" title="${title}" style="display:inline-flex;align-items:center;justify-content:center;width:${w + 2}px;height:${h + 1}px;vertical-align:middle;user-select:none;">
          <svg width="${w}" height="${h}" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1.5 1.5C1.5 1.22 1.72 1 2 1H8.5L12 4.5V14.5C12 14.78 11.78 15 11.5 15H2C1.72 15 1.5 14.78 1.5 14.5V1.5Z" fill="#FFFFFF" stroke="#7A8A9E" stroke-width="1"/>
            <path d="M8.5 1V4.5H12" fill="#E8EEF5" stroke="#7A8A9E" stroke-width="1"/>
            <path d="M3.5 4.5L11 12M11 4.5L3.5 12" stroke="#D32F2F" stroke-width="2.2" stroke-linecap="round"/>
          </svg>
        </span>
      `.trim();
    },

    /** Təqvim ikonu */
    calendar: function () {
      return '📅';
    },

    /** Axtarış ikonu */
    search: function () {
      return '🔍';
    },

    /** Yenilə ikonu */
    refresh: function () {
      return '🔄';
    }
  };

  // ====================================================================
  // 2. UNIVERSAL TƏQVİM / DÖVR SEÇİCİ KOMPONENTİ (OneCPeriodBar)
  // ====================================================================
  const OneCPeriodBar = {
    /**
     * İstənilən pəncərədə və ya jurnalda vahid təqvim zolağını yaradır və idarə edir.
     * @param {Object} cfg
     *   - containerId: hədəf div-in ID-si və ya DOM elementi
     *   - storageKey: localStorage açarı (default: '1c_active_period')
     *   - defaultPeriod: 'month' | 'today' | 'week' | 'all' | 'last30' (default: 'month')
     *   - onPeriodChange: callback funksiyası (startDate, endDate, preset)
     */
    create: function (cfg = {}) {
      const storageKey = cfg.storageKey || '1c_global_period';
      let startDateStr = '';
      let endDateStr = '';

      // LocalStorage-dən son seçilmiş tarixi bərpa et
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && (parsed.startDate || parsed.endDate)) {
            startDateStr = parsed.startDate || '';
            endDateStr = parsed.endDate || '';
          }
        }
      } catch (e) {
        console.warn('[OneCPeriodBar] localStorage read error:', e);
      }

      // Əgər saxlanmış tarix yoxdursa, PeriodPicker qlobal yaddaşını yoxla
      if (!startDateStr && !endDateStr && window.PeriodPicker && typeof PeriodPicker.getRememberedPeriod === 'function') {
        const rem = PeriodPicker.getRememberedPeriod();
        if (rem && (rem.startDate || rem.endDate)) {
          startDateStr = (rem.startDate || '').split(' ')[0];
          endDateStr = (rem.endDate || '').split(' ')[0];
        }
      }

      // Əgər hələ də yoxdursa, cari ay və ya son 30 gün
      if (!startDateStr && !endDateStr) {
        const now = new Date();
        const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const pad = (n) => String(n).padStart(2, '0');
        startDateStr = `${pad(past.getDate())}.${pad(past.getMonth() + 1)}.${past.getFullYear()}`;
        endDateStr = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`;
      }

      const instance = {
        startDate: startDateStr,
        endDate: endDateStr,
        storageKey: storageKey,
        onPeriodChange: cfg.onPeriodChange || null,

        save: function () {
          try {
            localStorage.setItem(this.storageKey, JSON.stringify({
              startDate: this.startDate || '',
              endDate: this.endDate || ''
            }));
          } catch (e) {
            console.warn('[OneCPeriodBar] localStorage write error:', e);
          }
        },

        getLabelText: function () {
          if (!this.startDate && !this.endDate) return '(Bütün dövr)';
          if (this.startDate && this.endDate) return `${this.startDate} — ${this.endDate}`;
          return this.startDate || this.endDate;
        },

        updateUI: function (containerEl) {
          if (!containerEl) return;
          const labelEl = containerEl.querySelector('.c1-period-label');
          if (labelEl) {
            labelEl.textContent = this.getLabelText();
          }
        },

        setQuick: function (preset, containerEl) {
          const now = new Date();
          const pad = (n) => String(n).padStart(2, '0');
          const toStr = (d) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;

          if (preset === 'today') {
            this.startDate = toStr(now);
            this.endDate = toStr(now);
          } else if (preset === 'week') {
            const past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            this.startDate = toStr(past);
            this.endDate = toStr(now);
          } else if (preset === 'month') {
            const past = new Date(now.getFullYear(), now.getMonth(), 1);
            this.startDate = toStr(past);
            this.endDate = toStr(now);
          } else if (preset === 'all') {
            this.startDate = '';
            this.endDate = '';
          }

          this.save();
          this.updateUI(containerEl);
          if (typeof this.onPeriodChange === 'function') {
            this.onPeriodChange(this.startDate, this.endDate, preset);
          }
        },

        openPicker: function (containerEl) {
          if (window.PeriodPicker && typeof PeriodPicker.open === 'function') {
            PeriodPicker.open({
              startDate: this.startDate,
              endDate: this.endDate,
              onSelect: (sStr, eStr) => {
                const clean = (s) => (s || '').trim().split(' ')[0];
                this.startDate = clean(sStr);
                this.endDate = clean(eStr);
                this.save();
                this.updateUI(containerEl);
                if (typeof this.onPeriodChange === 'function') {
                  this.onPeriodChange(this.startDate, this.endDate, 'custom');
                }
              }
            });
          }
        },

        renderHtml: function () {
          return `
            <div class="c1-period-bar" style="display:inline-flex;align-items:center;gap:4px;">
              <button type="button" class="btn-1c c1-period-btn" title="Dövrü seçin" style="height:24px;padding:0 8px;display:inline-flex;align-items:center;gap:4px;border:1px solid #7f9db9;background:#ffffff;cursor:pointer;border-radius:2px;">
                <span>${OneCIcons.calendar()}</span>
                <span class="c1-period-label" style="font-weight:bold;color:#002060;">${this.getLabelText()}</span>
              </button>
              <button type="button" class="btn-1c c1-period-quick" data-preset="today" title="Bugünkü sənədlər" style="height:24px;padding:0 7px;border-radius:2px;">Bu gün</button>
              <button type="button" class="btn-1c c1-period-quick" data-preset="week" title="Son 7 gün" style="height:24px;padding:0 7px;border-radius:2px;">7 gün</button>
              <button type="button" class="btn-1c c1-period-quick" data-preset="month" title="Bu ay" style="height:24px;padding:0 7px;border-radius:2px;">Bu ay</button>
              <button type="button" class="btn-1c c1-period-quick" data-preset="all" title="Bütün dövr" style="height:24px;padding:0 7px;border-radius:2px;">Hamısı</button>
            </div>
          `.trim();
        },

        attachTo: function (target) {
          const el = (typeof target === 'string') ? document.getElementById(target) : target;
          if (!el) return this;
          el.innerHTML = this.renderHtml();

          const pickerBtn = el.querySelector('.c1-period-btn');
          if (pickerBtn) {
            pickerBtn.onclick = () => this.openPicker(el);
          }

          el.querySelectorAll('.c1-period-quick').forEach(btn => {
            btn.onclick = () => {
              const preset = btn.getAttribute('data-preset');
              this.setQuick(preset, el);
            };
          });

          return this;
        }
      };

      if (cfg.containerId) {
        instance.attachTo(cfg.containerId);
      }

      return instance;
    }
  };

  // ====================================================================
  // 3. UNIVERSAL FİLTR ZOLAĞI VƏ ELEMENTLƏRİ (OneCFilterBar)
  // ====================================================================
  const OneCFilterBar = {
    /**
     * Standart 1C Axtarış Xanası HTML-i
     */
    renderSearchInput: function (cfg = {}) {
      const id = cfg.id || 'c1SearchInput';
      const placeholder = cfg.placeholder || '№, müştəri, məsul şəxs...';
      const width = cfg.width || '170px';
      const onInput = cfg.onInput || '';

      return `
        <div class="c1-search-box" style="display:inline-flex;align-items:center;border:1px solid #7f9db9;background:#fff;border-radius:2px;height:24px;padding:0 6px;">
          <span style="color:#888;font-size:11px;margin-right:4px;">${OneCIcons.search()}</span>
          <input type="text" id="${id}" placeholder="${placeholder}" ${onInput ? `oninput="${onInput}"` : ''} style="border:none;outline:none;font-size:11px;width:${width};">
        </div>
      `.trim();
    },

    /**
     * Standart 1C Yenilə (Refresh) Düyməsi HTML-i
     */
    renderRefreshButton: function (cfg = {}) {
      const onClick = cfg.onClick || '';
      const title = cfg.title || 'Məlumatları yenilə (F5)';
      const text = cfg.text || 'Yenilə';

      return `
        <button type="button" class="btn-1c btn-1c-primary c1-refresh-btn" ${onClick ? `onclick="${onClick}"` : ''} title="${title}" style="height:24px;padding:0 10px;font-weight:600;display:inline-flex;align-items:center;gap:4px;">
          <span>${OneCIcons.refresh()}</span>
          <span>${text}</span>
        </button>
      `.trim();
    },

    /**
     * Standart 1C Status Filtr Açılan Siyahısı HTML-i
     */
    renderStatusFilter: function (cfg = {}) {
      const id = cfg.id || 'c1StatusFilter';
      const onChange = cfg.onChange || '';

      return `
        <div style="display:inline-flex;align-items:center;gap:4px;">
          <span style="color:#666;font-size:11px;">Filtr:</span>
          <select id="${id}" ${onChange ? `onchange="${onChange}"` : ''} style="height:24px;font-size:11px;background:#fff;border:1px solid #7f9db9;padding:0 6px;border-radius:2px;cursor:pointer;">
            <option value="all" selected>Bütün sənədlər</option>
            <option value="posted">Təsdiqlənmiş</option>
            <option value="unposted">Təsdiqlənməmiş (Qaralama)</option>
            <option value="deleted">Silinmiş sənədlər</option>
          </select>
        </div>
      `.trim();
    },

    /**
     * Şaquli ayırıcı xətt
     */
    renderSeparator: function () {
      return '<div style="width:1px;height:18px;background:#b0af9f;margin:0 2px;"></div>';
    },

    /**
     * Standart 1C Sənəd Növü Seçicisi
     */
    renderDocTypeFilter: function (cfg = {}) {
      const id = cfg.id || 'c1DocTypeSelect';
      const onChange = cfg.onChange || '';
      const selected = cfg.selected || 'РеализацияТоваровУслуг';

      return `
        <div style="display:inline-flex;align-items:center;gap:4px;">
          <span style="font-weight:600;color:#222;">Sənəd növü:</span>
          <select id="${id}" ${onChange ? `onchange="${onChange}"` : ''} style="height:24px;font-size:11px;font-weight:600;background:#fff;border:1px solid #7f9db9;padding:0 6px;border-radius:2px;cursor:pointer;">
            <option value="">Hamısı (Bütün sənəd növləri)</option>
            <option value="РеализацияТоваровУслуг" ${selected === 'РеализацияТоваровУслуг' ? 'selected' : ''}>Satış (Реализация товаров и услуг)</option>
            <option value="ВозвратТоваровОтПокупателя" ${selected === 'ВозвратТоваровОтПокупателя' ? 'selected' : ''}>Qaytarma (Возврат товаров от покупателя)</option>
            <option value="ПогрузкиМашин" ${selected === 'ПогрузкиМашин' ? 'selected' : ''}>Yükləmə (Погрузка машин)</option>
            <option value="УстановкаЦенНоменклатуры" ${selected === 'УстановкаЦенНоменклатуры' ? 'selected' : ''}>Qiymət təyini (Установка цен)</option>
          </select>
        </div>
      `.trim();
    }
  };

  // Qlobal register
  window.OneCIcons = OneCIcons;
  window.OneCPeriodBar = OneCPeriodBar;
  window.OneCFilterBar = OneCFilterBar;
  window.OneCUI = {
    Icons: OneCIcons,
    PeriodBar: OneCPeriodBar,
    FilterBar: OneCFilterBar
  };

})(window);
