/**
 * static/js/components/picker/period_widget.js
 * ============================================
 * 1C:Enterprise Vahid Dövr Seçici Komponenti (Universal Period Picker Widget)
 * 
 * Bütün pəncərələrdə (Realizasiya jurnalı, Müştəri sifarişləri analizi, Əsas hesabat və s.)
 * vahid görünüş və funksionallıq təmin edir:
 * 📅 [ 01.09.2026 - 30.09.2026 ]
 */

(function(window) {
  "use strict";

  function toDateOnly(value) {
    return C1Dates.dateOnly(value);
  }

  const C1PeriodWidget = {
    /**
     * Dövr mətni formatlaşdırıcısı (Realizasiya jurnalı ilə eyni)
     * @param {string} startDate 
     * @param {string} endDate 
     * @returns {string} Məsələn: "[ 01.09.2026 - 30.09.2026 ]" və ya "(Весь период)"
     */
    formatLabel: function(startDate, endDate) {
      const s = toDateOnly(startDate);
      const e = toDateOnly(endDate);

      if (s && e) {
        return `[ ${s} - ${e} ]`;
      } else if (s && !e) {
        return `[ с ${s} ]`;
      } else if (!s && e) {
        return `[ по ${e} ]`;
      }
      return window.C1I18n ? C1I18n.t('uj.all_period', '(Весь период)') : '(Весь период)';
    },

    /**
     * Vahid dövr seçici modalını (PeriodPicker) açır
     */
    open: function(options = {}) {
      if (typeof window.PeriodPicker !== "undefined" && typeof window.PeriodPicker.open === "function") {
        window.PeriodPicker.open({
          contextKey: options.contextKey || "",
          startDate: options.startDate || "",
          endDate: options.endDate || "",
          onSelect: (startStr, endStr) => {
            if (options.contextKey) {
              C1PeriodWidget.setStoredPeriod(options.contextKey, startStr, endStr);
            }
            if (typeof options.onSelect === "function") {
              options.onSelect(startStr, endStr);
            }
          }
        });
      } else {
        console.warn("[C1PeriodWidget] PeriodPicker modalı tapılmadı.");
      }
    },

    /**
     * Kontekst üzrə (məs. uj_РеализацияТоваровУслуг, audit_journal və s.) son seçilmiş dövrü qaytarır
     */
    getStoredPeriod: function(contextKey) {
      if (!contextKey) return null;
      try {
        const raw = localStorage.getItem("1c_period_" + contextKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && (parsed.startDate || parsed.endDate)) return parsed;
        }
      } catch (e) {}
      return null;
    },

    /**
     * Kontekst üzrə son seçilmiş dövrü yadda saxlayır
     */
    setStoredPeriod: function(contextKey, startDate, endDate) {
      if (!contextKey) return;
      try {
        localStorage.setItem("1c_period_" + contextKey, JSON.stringify({
          startDate: startDate || "",
          endDate: endDate || ""
        }));
      } catch (e) {}
    },

    /**
     * Cari ay üzrə default başlanğıc və son tarixi qaytarır
     */
    getDefaultPeriod: function() {
      const now = new Date();
      const curYear = now.getFullYear();
      const curMonth = String(now.getMonth() + 1).padStart(2, "0");
      const lastDay = new Date(curYear, now.getMonth() + 1, 0).getDate();
      return {
        startDate: `01.${curMonth}.${curYear} 00:00:00`,
        endDate: `${String(lastDay).padStart(2, "0")}.${curMonth}.${curYear} 23:59:59`
      };
    },

    /**
     * Mövcud DOM düyməsini dövr seçiciyə bağlayır
     */
    bind: function(btnElement, options = {}) {
      if (!btnElement) return null;

      let labelEl = options.labelElement;
      if (!labelEl) {
        labelEl = btnElement.querySelector(".c1-period-label, .uj-period-label, span:last-child");
      }

      const updateLabel = (start, end) => {
        if (!labelEl) return;
        labelEl.removeAttribute('data-i18n');
        const text = C1PeriodWidget.formatLabel(start, end);
        labelEl.textContent = text;
        if (text === "(Весь период)") {
          labelEl.style.color = "#555555";
        } else {
          labelEl.style.color = "#002060";
        }
      };

      // İlkin vəziyyəti tənzimləyirik: əgər ötürülməyibsə və contextKey varsa, kontekst yaddaşına bax
      let initStart = typeof options.getStartDate === "function" ? options.getStartDate() : options.startDate;
      let initEnd = typeof options.getEndDate === "function" ? options.getEndDate() : options.endDate;
      if (options.contextKey && (initStart === undefined || initStart === "") && (initEnd === undefined || initEnd === "")) {
        const stored = C1PeriodWidget.getStoredPeriod(options.contextKey);
        if (stored) {
          initStart = stored.startDate;
          initEnd = stored.endDate;
        }
      }
      if (initStart !== undefined || initEnd !== undefined) {
        updateLabel(initStart, initEnd);
      }

      btnElement.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        const currentStart = typeof options.getStartDate === "function" ? options.getStartDate() : (options.startDate || "");
        const currentEnd = typeof options.getEndDate === "function" ? options.getEndDate() : (options.endDate || "");

        C1PeriodWidget.open({
          contextKey: options.contextKey || "",
          startDate: currentStart,
          endDate: currentEnd,
          onSelect: (startStr, endStr) => {
            updateLabel(startStr, endStr);
            if (options.contextKey) {
              C1PeriodWidget.setStoredPeriod(options.contextKey, startStr, endStr);
            }
            if (typeof options.onSelect === "function") {
              options.onSelect(startStr, endStr);
            }
            if (typeof options.onChange === "function") {
              options.onChange(startStr, endStr);
            }
          }
        });
      });

      return {
        buttonEl: btnElement,
        labelEl: labelEl,
        updateLabel: updateLabel
      };
    },

    /**
     * Yeni Vahid Dövr Düyməsi (HTML elementi) yaradır və göstərilən konteynerə yerləşdirir
     * @param {Object} config 
     * @returns {Object} { buttonEl, labelEl, setDates, getDates }
     */
    create: function(config = {}) {
      const container = typeof config.container === "string" 
        ? document.querySelector(config.container) 
        : config.container;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn-1c c1-period-btn " + (config.className || "");
      if (config.id) btn.id = config.id;
      btn.title = config.title || "Установить интервал дат (Выберите период)";
      btn.style.cssText = "height: 24px; display: inline-flex; align-items: center; gap: 5px; padding: 0 7px; cursor: pointer; background: #ffffff; border: 1px solid #7f9db9; border-radius: 2px; font-family: Tahoma, 'MS Sans Serif', Arial, sans-serif; font-size: 11px;" + (config.style || "");

      const iconSpan = document.createElement("span");
      iconSpan.style.fontSize = "12px";
      iconSpan.textContent = "📅";
      btn.appendChild(iconSpan);

      const labelSpan = document.createElement("span");
      labelSpan.className = "c1-period-label";
      if (config.labelId) labelSpan.id = config.labelId;
      labelSpan.style.cssText = "font-size: 11px; font-weight: 500; color: #002060; white-space: nowrap;";
      btn.appendChild(labelSpan);

      let currentStart = config.startDate || "";
      let currentEnd = config.endDate || "";

      if (config.contextKey && !currentStart && !currentEnd) {
        const stored = C1PeriodWidget.getStoredPeriod(config.contextKey);
        if (stored) {
          currentStart = stored.startDate || "";
          currentEnd = stored.endDate || "";
        }
      }

      const instance = C1PeriodWidget.bind(btn, {
        contextKey: config.contextKey || "",
        labelElement: labelSpan,
        startDate: currentStart,
        endDate: currentEnd,
        getStartDate: () => currentStart,
        getEndDate: () => currentEnd,
        onSelect: (startStr, endStr) => {
          currentStart = startStr;
          currentEnd = endStr;
          if (config.contextKey) {
            C1PeriodWidget.setStoredPeriod(config.contextKey, startStr, endStr);
          }
          if (typeof config.onChange === "function") {
            config.onChange(startStr, endStr);
          }
        }
      });

      if (container) {
        container.appendChild(btn);
      }

      return {
        buttonEl: btn,
        labelEl: labelSpan,
        setDates: (s, e) => {
          currentStart = s;
          currentEnd = e;
          if (config.contextKey) {
            C1PeriodWidget.setStoredPeriod(config.contextKey, s, e);
          }
          instance.updateLabel(s, e);
        },
        getDates: () => ({ startDate: currentStart, endDate: currentEnd })
      };
    }
  };

  window.C1PeriodWidget = C1PeriodWidget;
  window.PeriodWidget = C1PeriodWidget;

})(window);
