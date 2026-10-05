/* ========================================================
   1C:ENTERPRISE NATIVE CALENDAR & SMART DATE PARSER
   calendar_picker.js
   ======================================================== */

// Global Smart Date Formatter
function smartParse1CDate(rawStr, currentVal = "") {
  if (!rawStr) return "";
  let s = String(rawStr).trim();
  if (!s) return "";

  const now = new Date();
  let defaultYear = now.getFullYear(); // 2026
  let defaultMonth = now.getMonth() + 1; // 9

  // If there's an existing valid date in the input, prefer its month & year
  if (currentVal && /^\d{2}\.\d{2}\.\d{4}$/.test(currentVal)) {
    const parts = currentVal.split(".");
    defaultMonth = parseInt(parts[1], 10);
    defaultYear = parseInt(parts[2], 10);
  }

  let day = null;
  let month = null;
  let year = null;

  // Clean trailing punctuation like "0105." or "01."
  // Check if separators like '.', '/', '-', ' ' are used
  const hasSeparators = /[./\-\s]/.test(s);
  const sepParts = s.split(/[./\-\s]+/).filter(Boolean);

  if (hasSeparators && sepParts.length > 0) {
    if (sepParts.length === 1) {
      // User typed "01." or "0105."
      const digitsOnly = sepParts[0].replace(/\D/g, "");
      if (digitsOnly.length <= 2) {
        day = parseInt(digitsOnly, 10);
      } else if (digitsOnly.length === 3) {
        day = parseInt(digitsOnly.substring(0, 1), 10);
        month = parseInt(digitsOnly.substring(1, 3), 10);
      } else if (digitsOnly.length === 4) {
        day = parseInt(digitsOnly.substring(0, 2), 10);
        month = parseInt(digitsOnly.substring(2, 4), 10);
      } else if (digitsOnly.length >= 8) {
        day = parseInt(digitsOnly.substring(0, 2), 10);
        month = parseInt(digitsOnly.substring(2, 4), 10);
        year = parseInt(digitsOnly.substring(4, 8), 10);
      }
    } else if (sepParts.length === 2) {
      // e.g. "01.08" or "1.8"
      day = parseInt(sepParts[0], 10);
      month = parseInt(sepParts[1], 10);
    } else if (sepParts.length >= 3) {
      // e.g. "01.08.2026" or "1.8.26"
      day = parseInt(sepParts[0], 10);
      month = parseInt(sepParts[1], 10);
      let y = parseInt(sepParts[2], 10);
      if (y < 100) y += 2000;
      year = y;
    }
  } else {
    // Pure digits without separators: "01", "1", "0108", "0105", "105", "010826", "01082026"
    const digits = s.replace(/\D/g, "");
    if (digits.length === 1 || digits.length === 2) {
      day = parseInt(digits, 10);
    } else if (digits.length === 3) {
      day = parseInt(digits.substring(0, 1), 10);
      month = parseInt(digits.substring(1, 3), 10);
    } else if (digits.length === 4) {
      day = parseInt(digits.substring(0, 2), 10);
      month = parseInt(digits.substring(2, 4), 10);
    } else if (digits.length === 6) {
      day = parseInt(digits.substring(0, 2), 10);
      month = parseInt(digits.substring(2, 4), 10);
      year = parseInt(digits.substring(4, 6), 10) + 2000;
    } else if (digits.length >= 8) {
      day = parseInt(digits.substring(0, 2), 10);
      month = parseInt(digits.substring(2, 4), 10);
      year = parseInt(digits.substring(4, 8), 10);
    }
  }

  if (!day || isNaN(day)) return rawStr;

  if (!month || isNaN(month)) {
    month = defaultMonth;
  }
  if (!year || isNaN(year)) {
    year = defaultYear;
  }

  // Bounds checking
  if (month < 1) month = 1;
  if (month > 12) month = 12;

  const maxDays = new Date(year, month, 0).getDate();
  if (day < 1) day = 1;
  if (day > maxDays) day = maxDays;

  const dd = String(day).padStart(2, "0");
  const mm = String(month).padStart(2, "0");
  const yyyy = String(year).padStart(4, "0");

  return `${dd}.${mm}.${yyyy}`;
}

// 1C Native Calendar Controller
const OneCCalendar = {
  popupEl: null,
  targetInput: null,
  viewYear: 2026,
  viewMonth: 8, // 0-indexed (8 = September)
  selectedDate: null,

  init() {
    if (this.popupEl) return;
    const div = document.createElement("div");
    div.id = "onecCalendarPopup";
    div.className = "onec-calendar-popup";
    document.body.appendChild(div);
    this.popupEl = div;

    // Close on outside click
    document.addEventListener("mousedown", (e) => {
      if (this.popupEl && this.popupEl.classList.contains("show")) {
        if (!this.popupEl.contains(e.target) && (!this.targetInput || !this.targetInput.contains(e.target))) {
          // If clicked a calendar trigger button, ignore here
          if (!e.target.closest(".period-cal-btn, .pp-cal-btn")) {
            this.close();
          }
        }
      }
    });

    this.attachInputs();
  },

  attachInputs() {
    const inputIds = ["topStartDateInput", "topEndDateInput", "dlgStartDateInput", "dlgEndDateInput"];
    inputIds.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el._onecCalAttached) return;
      el._onecCalAttached = true;

      // Smart parsing on Enter and blur
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.applySmartInput(el);
          el.blur();
        }
      });

      el.addEventListener("blur", () => {
        this.applySmartInput(el);
      });
    });
  },

  applySmartInput(input) {
    if (!input || !input.value) return;
    const formatted = smartParse1CDate(input.value, input._prevVal || input.value);
    if (formatted) {
      input.value = formatted;
      input._prevVal = formatted;
      if (input.id.startsWith("top")) {
        if (typeof syncDateInputsFromTop === "function") syncDateInputsFromTop();
      } else {
        if (typeof syncDateInputsFromDlg === "function") syncDateInputsFromDlg();
      }
    }
  },

  open(inputOrId, triggerEl = null) {
    this.init();
    let target = null;
    if (typeof inputOrId === "string") {
      target = document.getElementById(inputOrId);
    } else if (inputOrId && inputOrId.nodeType) {
      target = inputOrId;
    }
    if (!target) return;

    if (this.isOpen() && this.targetInput === target) {
      this.close();
      return;
    }

    this.targetInput = target;

    // Parse current date or default to now
    let curDate = new Date();
    const curVal = (target.value || "").trim();
    const mDot = curVal.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    const mIso = curVal.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);

    if (mDot) {
      const d = parseInt(mDot[1], 10);
      const m = parseInt(mDot[2], 10) - 1;
      const y = parseInt(mDot[3], 10);
      curDate = new Date(y, m, d);
      this.selectedDate = new Date(y, m, d);
    } else if (mIso) {
      const y = parseInt(mIso[1], 10);
      const m = parseInt(mIso[2], 10) - 1;
      const d = parseInt(mIso[3], 10);
      curDate = new Date(y, m, d);
      this.selectedDate = new Date(y, m, d);
    } else {
      this.selectedDate = new Date();
    }

    this.viewYear = curDate.getFullYear();
    this.viewMonth = curDate.getMonth();

    this.render();

    // Ensure calendar popup is always on top of modals and windows
    let topZ = 100050;
    if (window.MdiManager && typeof MdiManager.topZIndex === "number") {
      topZ = Math.max(topZ, MdiManager.topZIndex + 50);
    }
    this.popupEl.style.zIndex = String(topZ);

    // Position popup right below trigger element or target input
    const anchor = triggerEl || target.nextElementSibling || target;
    const rect = anchor.getBoundingClientRect();

    let left = rect.left;
    let top = rect.bottom + 2;

    // Viewport edge checking
    if (left + 230 > window.innerWidth) {
      left = Math.max(10, window.innerWidth - 240);
    }
    if (top + 240 > window.innerHeight) {
      top = Math.max(10, rect.top - 235);
    }

    this.popupEl.style.position = "fixed";
    this.popupEl.style.left = `${left}px`;
    this.popupEl.style.top = `${top}px`;
    this.popupEl.classList.add("show");
  },

  close() {
    if (this.popupEl) {
      this.popupEl.classList.remove("show");
    }
  },

  isOpen() {
    return this.popupEl && this.popupEl.classList.contains("show");
  },

  prevMonth() {
    this.viewMonth--;
    if (this.viewMonth < 0) {
      this.viewMonth = 11;
      this.viewYear--;
    }
    this.render();
  },

  nextMonth() {
    this.viewMonth++;
    if (this.viewMonth > 11) {
      this.viewMonth = 0;
      this.viewYear++;
    }
    this.render();
  },

  prevYear() {
    this.viewYear--;
    this.render();
  },

  nextYear() {
    this.viewYear++;
    this.render();
  },

  selectDate(year, month, day) {
    const dd = String(day).padStart(2, "0");
    const mm = String(month + 1).padStart(2, "0");
    const yyyy = String(year);
    
    let timeSuffix = "";
    if (this.targetInput && this.targetInput.value) {
      const timeMatch = this.targetInput.value.match(/(\d{1,2}:\d{1,2}(?::\d{1,2})?)/);
      if (timeMatch) {
        const tParts = timeMatch[1].split(":");
        const hh = tParts[0].padStart(2, "0");
        const mi = (tParts[1] || "00").padStart(2, "0");
        const ss = (tParts[2] || "00").padStart(2, "0");
        timeSuffix = ` ${hh}:${mi}:${ss}`;
      }
    }
    if (!timeSuffix && this.targetInput) {
      if (this.targetInput.id.toLowerCase().includes("start")) {
        timeSuffix = " 00:00:00";
      } else if (this.targetInput.id.toLowerCase().includes("end")) {
        timeSuffix = " 23:59:59";
      }
    }
    const dateStr = `${dd}.${mm}.${yyyy}${timeSuffix}`;

    if (this.targetInput) {
      this.targetInput.value = dateStr;
      this.targetInput._prevVal = dateStr;
      this.targetInput.dispatchEvent(new Event("input", { bubbles: true }));
      this.targetInput.dispatchEvent(new Event("change", { bubbles: true }));

      if (this.targetInput.id.startsWith("top")) {
        if (typeof syncDateInputsFromTop === "function") syncDateInputsFromTop();
      } else if (this.targetInput.id.startsWith("pp")) {
        if (window.PeriodPicker) {
          PeriodPicker.onManualInputChange(this.targetInput.id.includes("Start") ? "start" : "end");
        }
      } else {
        if (typeof syncDateInputsFromDlg === "function") syncDateInputsFromDlg();
      }
    }
    this.close();
  },

  selectToday() {
    const now = new Date();
    this.selectDate(now.getFullYear(), now.getMonth(), now.getDate());
  },

  clearDate() {
    if (this.targetInput) {
      this.targetInput.value = "";
      this.targetInput.dispatchEvent(new Event("input", { bubbles: true }));
      this.targetInput.dispatchEvent(new Event("change", { bubbles: true }));
      if (this.targetInput.id.startsWith("top")) {
        if (typeof syncDateInputsFromTop === "function") syncDateInputsFromTop();
      } else {
        if (typeof syncDateInputsFromDlg === "function") syncDateInputsFromDlg();
      }
    }
    this.close();
  },

  render() {
    const monthNames = [
      "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
      "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
    ];

    const year = this.viewYear;
    const month = this.viewMonth;

    const firstDay = new Date(year, month, 1);
    // 0 = Sunday, 1 = Monday, ..., 6 = Saturday -> convert to Monday=0, ..., Sunday=6
    let startDayOfWeek = firstDay.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const today = new Date();
    const isTodayMonth = today.getFullYear() === year && today.getMonth() === month;

    let html = `
      <div class="onec-cal-header">
        <button class="onec-cal-nav-btn" onclick="OneCCalendar.prevYear()" title="Предыдущий год">«</button>
        <button class="onec-cal-nav-btn" onclick="OneCCalendar.prevMonth()" title="Предыдущий месяц">‹</button>
        <span class="onec-cal-title">${monthNames[month]} ${year}</span>
        <button class="onec-cal-nav-btn" onclick="OneCCalendar.nextMonth()" title="Следующий месяц">›</button>
        <button class="onec-cal-nav-btn" onclick="OneCCalendar.nextYear()" title="Следующий год">»</button>
      </div>
      <table class="onec-cal-grid">
        <thead>
          <tr>
            <th>Пн</th>
            <th>Вт</th>
            <th>Ср</th>
            <th>Чт</th>
            <th>Пт</th>
            <th class="weekend">Сб</th>
            <th class="weekend">Вс</th>
          </tr>
        </thead>
        <tbody>
    `;

    let dayCounter = 1;
    let nextMonthDayCounter = 1;

    for (let row = 0; row < 6; row++) {
      html += `<tr>`;
      for (let col = 0; col < 7; col++) {
        const isWeekend = col >= 5;
        const cellIndex = row * 7 + col;

        if (cellIndex < startDayOfWeek) {
          // Prev month's day
          const d = daysInPrevMonth - (startDayOfWeek - cellIndex - 1);
          const prevMonthIdx = month === 0 ? 11 : month - 1;
          const prevYear = month === 0 ? year - 1 : year;
          const weekendClass = isWeekend ? "weekend" : "";
          html += `<td class="other-month ${weekendClass}" onclick="OneCCalendar.selectDate(${prevYear}, ${prevMonthIdx}, ${d})">${d}</td>`;
        } else if (dayCounter <= daysInMonth) {
          // Current month's day
          const isToday = isTodayMonth && today.getDate() === dayCounter;
          const isSelected = this.selectedDate && 
            this.selectedDate.getFullYear() === year && 
            this.selectedDate.getMonth() === month && 
            this.selectedDate.getDate() === dayCounter;

          let classes = [];
          if (isWeekend) classes.push("weekend");
          if (isToday) classes.push("today");
          if (isSelected) classes.push("selected");

          html += `<td class="${classes.join(" ")}" onclick="OneCCalendar.selectDate(${year}, ${month}, ${dayCounter})">${dayCounter}</td>`;
          dayCounter++;
        } else {
          // Next month's day
          const nextMonthIdx = month === 11 ? 0 : month + 1;
          const nYear = month === 11 ? year + 1 : year;
          const weekendClass = isWeekend ? "weekend" : "";
          html += `<td class="other-month ${weekendClass}" onclick="OneCCalendar.selectDate(${nYear}, ${nextMonthIdx}, ${nextMonthDayCounter})">${nextMonthDayCounter}</td>`;
          nextMonthDayCounter++;
        }
      }
      html += `</tr>`;
      if (dayCounter > daysInMonth && row >= 4) break;
    }

    html += `
        </tbody>
      </table>
      <div class="onec-cal-footer">
        <button class="onec-cal-footer-btn" onclick="OneCCalendar.selectToday()">Сегодня</button>
        <button class="onec-cal-footer-btn" onclick="OneCCalendar.clearDate()">Очистить</button>
        <button class="onec-cal-footer-btn" onclick="OneCCalendar.close()" style="margin-left: auto;">Закрыть</button>
      </div>
    `;

    this.popupEl.innerHTML = html;
  }
};

// 1C Native Period Selector ("...") Controller
const OneCPeriodPicker = {
  popupEl: null,

  init() {
    if (this.popupEl) return;
    const div = document.createElement("div");
    div.id = "onecPeriodPopup";
    div.className = "onec-period-popup";
    document.body.appendChild(div);
    this.popupEl = div;

    document.addEventListener("mousedown", (e) => {
      if (this.popupEl && this.popupEl.classList.contains("show")) {
        if (!this.popupEl.contains(e.target) && !e.target.closest(".period-more-btn")) {
          this.close();
        }
      }
    });
  },

  open(triggerBtn) {
    this.init();
    const anchor = triggerBtn || event?.currentTarget || document.querySelector(".period-more-btn");
    if (!anchor) return;

    this.render();

    const rect = anchor.getBoundingClientRect();
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

    let left = rect.left + scrollLeft - 180;
    let top = rect.bottom + scrollTop + 2;

    if (left < 10) left = 10;
    if (left + 240 > window.innerWidth) {
      left = Math.max(10, window.innerWidth - 250 + scrollLeft);
    }

    this.popupEl.style.left = `${left}px`;
    this.popupEl.style.top = `${top}px`;
    this.popupEl.classList.add("show");
  },

  close() {
    if (this.popupEl) {
      this.popupEl.classList.remove("show");
    }
  },

  isOpen() {
    return this.popupEl && this.popupEl.classList.contains("show");
  },

  setPeriod(startDate, endDate) {
    const topStart = document.getElementById("topStartDateInput");
    const topEnd = document.getElementById("topEndDateInput");
    const dlgStart = document.getElementById("dlgStartDateInput");
    const dlgEnd = document.getElementById("dlgEndDateInput");

    if (topStart) { topStart.value = startDate; topStart._prevVal = startDate; }
    if (topEnd) { topEnd.value = endDate; topEnd._prevVal = endDate; }
    if (dlgStart) { dlgStart.value = startDate; dlgStart._prevVal = startDate; }
    if (dlgEnd) { dlgEnd.value = endDate; dlgEnd._prevVal = endDate; }

    if (typeof syncDateInputsFromTop === "function") syncDateInputsFromTop();
    this.close();
  },

  render() {
    const now = new Date();
    const y = now.getFullYear(); // 2026
    const m = now.getMonth(); // 8 (September)

    const todayStr = `${String(now.getDate()).padStart(2, '0')}.${String(m + 1).padStart(2, '0')}.${y}`;

    // Helper for last day of month
    const formatMonthPeriod = (year, monthIdx) => {
      const lastDay = new Date(year, monthIdx + 1, 0).getDate();
      const s = `01.${String(monthIdx + 1).padStart(2, '0')}.${year}`;
      const e = `${String(lastDay).padStart(2, '0')}.${String(monthIdx + 1).padStart(2, '0')}.${year}`;
      return { s, e };
    };

    const curMonth = formatMonthPeriod(y, m);
    const prevMonthIdx = m === 0 ? 11 : m - 1;
    const prevMonthYear = m === 0 ? y - 1 : y;
    const prevMonth = formatMonthPeriod(prevMonthYear, prevMonthIdx);

    const q1 = { s: `01.01.${y}`, e: `31.03.${y}` };
    const q2 = { s: `01.04.${y}`, e: `30.06.${y}` };
    const q3 = { s: `01.07.${y}`, e: `30.09.${y}` };
    const q4 = { s: `01.10.${y}`, e: `31.12.${y}` };

    const yearFull = { s: `01.01.${y}`, e: `31.12.${y}` };
    const yearToDate = { s: `01.01.${y}`, e: todayStr };
    const prevYearFull = { s: `01.01.${y - 1}`, e: `31.12.${y - 1}` };

    const items = [
      { label: "Сегодня", s: todayStr, e: todayStr },
      { label: "Текущий месяц", s: curMonth.s, e: curMonth.e },
      { label: "Прошлый месяц", s: prevMonth.s, e: prevMonth.e },
      { divider: true },
      { label: "1 Квартал", s: q1.s, e: q1.e },
      { label: "2 Квартал", s: q2.s, e: q2.e },
      { label: "3 Квартал", s: q3.s, e: q3.e },
      { label: "4 Квартал", s: q4.s, e: q4.e },
      { divider: true },
      { label: "С начала года", s: yearToDate.s, e: yearToDate.e },
      { label: `Весь ${y} год`, s: yearFull.s, e: yearFull.e },
      { label: `Весь ${y - 1} год`, s: prevYearFull.s, e: prevYearFull.e }
    ];

    let listHtml = items.map(it => {
      if (it.divider) return `<div class="onec-period-divider"></div>`;
      return `
        <li class="onec-period-item" onclick="OneCPeriodPicker.setPeriod('${it.s}', '${it.e}')">
          <span>${it.label}</span>
          <span class="period-dates">${it.s === it.e ? it.s : it.s.substring(0, 5) + ' - ' + it.e.substring(0, 5)}</span>
        </li>
      `;
    }).join("");

    this.popupEl.innerHTML = `
      <div class="onec-period-header">
        <span>Выбор периода</span>
        <span style="cursor: pointer;" onclick="OneCPeriodPicker.close()">✕</span>
      </div>
      <ul class="onec-period-list">
        ${listHtml}
      </ul>
    `;
  }
};

// Global replacement wrappers for HTML calls
function pickDate(inputId, btnEl = null) {
  const btn = btnEl || event?.currentTarget || (typeof inputId === "string" ? document.getElementById(inputId)?.nextElementSibling : null);
  OneCCalendar.open(inputId, btn);
}

function openPeriodSelectDialog(btnEl = null) {
  const btn = btnEl || event?.currentTarget || document.querySelector(".period-more-btn");
  OneCPeriodPicker.open(btn);
}

// Master Keyboard Shortcuts Handler:
// - Esc: Closes popups & active modals
// - Ctrl+T: Opens Settings ("Настройка...")
// - Ctrl+Enter: Triggers "OK" (if modal active) or "Сформировать"
document.addEventListener("keydown", (e) => {
  // 1. ESC key: Handled comprehensively by MdiManager.handleEscape
  if (e.key === "Escape" || e.code === "Escape") {
    if (window.MdiManager && typeof MdiManager.handleEscape === "function") {
      const handled = MdiManager.handleEscape();
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }
  }

  // 2. Ctrl+T: Open Settings ("Настройка...")
  if ((e.ctrlKey || e.metaKey) && (e.key === "t" || e.key === "T" || e.code === "KeyT")) {
    e.preventDefault();
    e.stopPropagation();
    if (typeof openSettingsModal === "function") {
      openSettingsModal();
    }
    return;
  }

  // 3. Ctrl+Enter: Primary action (OK if modal open, else Сформировать)
  if ((e.ctrlKey || e.metaKey) && (e.key === "Enter" || e.code === "Enter")) {
    if (window.MdiManager && typeof MdiManager.handleConfirm === "function") {
      const handled = MdiManager.handleConfirm();
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }
    // Fallback: Formirovat (generate report)
    if (typeof onActionFormirovat === "function") {
      e.preventDefault();
      e.stopPropagation();
      onActionFormirovat();
    }
  }

  // 4. F4 key: 1C standard shortcut to trigger selection (...) on focused input / selected filter row
  if (e.key === "F4" || e.code === "F4") {
    e.preventDefault();
    e.stopPropagation();

    // A. Check active element or parent wrapper
    const active = document.activeElement;
    if (active) {
      const wrap = active.closest(".filter-value-cell-wrap, .period-input-wrapper, td, .settings-period-row, .period-control-group");
      const pickBtn = wrap?.querySelector(".filter-btn-pick, .period-more-btn, .period-cal-btn, .btn-browse-1c");
      if (pickBtn) {
        pickBtn.click();
        return;
      }
    }

    // B. Check selected filter row in settings modal
    const highlightedRow = document.querySelector("#filtersTableBody tr.selected, #filtersTableBody tr.active-row");
    if (highlightedRow) {
      const btn = highlightedRow.querySelector(".filter-btn-pick");
      if (btn) {
        btn.click();
        return;
      }
    }

    // C. Check selected grouping row in settings modal
    const highlightedGrouping = document.querySelector("#rowGroupingsBody tr.selected");
    if (highlightedGrouping) {
      const btn = document.getElementById("btnAddRowGrouping");
      if (btn) {
        btn.click();
        return;
      }
    }
  }
});

// Auto initialize on DOM ready
document.addEventListener("DOMContentLoaded", () => {
  OneCCalendar.init();
  OneCPeriodPicker.init();
});

// Explicit Global Window Exports
window.OneCCalendar = OneCCalendar;
window.OneCPeriodPicker = OneCPeriodPicker;
window.pickDate = pickDate;
window.openPeriodSelectDialog = openPeriodSelectDialog;
window.smartParse1CDate = smartParse1CDate;

