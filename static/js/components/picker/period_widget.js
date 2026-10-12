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

  function toDateOnly(val) {
    if (!val) return "";
    const s = String(val).trim();
    const m = s.match(/^(\d{1,2}\.\d{1,2}\.\d{4})/);
    return m ? m[1] : s.split(" ")[0];
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
      return "(Весь период)";
    },

    /**
     * Vahid dövr seçici modalını (PeriodPicker) açır
     */
    open: function(options = {}) {
      if (typeof window.PeriodPicker !== "undefined" && typeof window.PeriodPicker.open === "function") {
        window.PeriodPicker.open({
          startDate: options.startDate || "",
          endDate: options.endDate || "",
          onSelect: (startStr, endStr) => {
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
        const text = C1PeriodWidget.formatLabel(start, end);
        labelEl.textContent = text;
        if (text === "(Весь период)") {
          labelEl.style.color = "#555555";
        } else {
          labelEl.style.color = "#002060";
        }
      };

      // İlkin vəziyyəti tənzimləyirik
      const initStart = typeof options.getStartDate === "function" ? options.getStartDate() : options.startDate;
      const initEnd = typeof options.getEndDate === "function" ? options.getEndDate() : options.endDate;
      if (initStart !== undefined || initEnd !== undefined) {
        updateLabel(initStart, initEnd);
      }

      btnElement.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        const currentStart = typeof options.getStartDate === "function" ? options.getStartDate() : (options.startDate || "");
        const currentEnd = typeof options.getEndDate === "function" ? options.getEndDate() : (options.endDate || "");

        C1PeriodWidget.open({
          startDate: currentStart,
          endDate: currentEnd,
          onSelect: (startStr, endStr) => {
            updateLabel(startStr, endStr);
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

      const instance = C1PeriodWidget.bind(btn, {
        labelElement: labelSpan,
        startDate: currentStart,
        endDate: currentEnd,
        getStartDate: () => currentStart,
        getEndDate: () => currentEnd,
        onSelect: (startStr, endStr) => {
          currentStart = startStr;
          currentEnd = endStr;
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
          instance.updateLabel(s, e);
        },
        getDates: () => ({ startDate: currentStart, endDate: currentEnd })
      };
    }
  };

  window.C1PeriodWidget = C1PeriodWidget;
  window.PeriodWidget = C1PeriodWidget;

})(window);
