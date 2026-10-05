/**
 * 1C:ENTERPRISE - PERIOD PICKER CONTROLLER (Выберите период)
 * static/js/period_picker.js
 */

const PeriodPicker = {
  activeCallback: null,
  baseYear: 2026,
  startDateStr: "",
  endDateStr: "",
  monthNames: ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"],
  rangeAnchor: null,
  isSelectingRange: false,

  open: function(options = {}) {
    this.activeCallback = options.onSelect || null;
    this.startDateStr = options.startDate || "";
    this.endDateStr = options.endDate || "";
    this.rangeAnchor = null;
    this.isSelectingRange = false;

    // Check remembered period if inputs are empty or if remember period is active
    const chk = document.getElementById("ppRememberPeriod");
    const isRememberActive = (localStorage.getItem("1c_remember_period_active") !== "false");
    if (chk) {
      chk.checked = isRememberActive;
      if (!chk._boundChange) {
        chk._boundChange = true;
        chk.addEventListener("change", () => {
          localStorage.setItem("1c_remember_period_active", chk.checked ? "true" : "false");
          if (!chk.checked) {
            localStorage.removeItem("1c_remembered_period");
          } else {
            PeriodPicker.saveRememberedPeriod();
          }
        });
      }
    }

    if (!this.startDateStr && !this.endDateStr && isRememberActive) {
      const rem = this.getRememberedPeriod();
      if (rem) {
        this.startDateStr = rem.startDate || "";
        this.endDateStr = rem.endDate || "";
      }
    }

    // Normalize legacy date-only values to full DD.MM.YYYY HH:MM:SS
    const addTime = (s, t) => {
      if (!s) return "";
      s = String(s).trim();
      return /^\d{1,2}\.\d{1,2}\.\d{4}$/.test(s) ? `${s} ${t}` : s;
    };
    this.startDateStr = addTime(this.startDateStr, "00:00:00");
    this.endDateStr = addTime(this.endDateStr, "23:59:59");

    // Set baseYear around current date or startDate
    const now = new Date();
    const mYear = (this.startDateStr || "").match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (mYear) {
      this.baseYear = parseInt(mYear[3], 10);
    } else {
      this.baseYear = now.getFullYear();
    }

    const modal = document.getElementById("periodPickerModalOverlay");
    if (!modal) return;

    const inpStart = document.getElementById("ppStartDateInput");
    const inpEnd = document.getElementById("ppEndDateInput");
    if (inpStart) inpStart.value = this.startDateStr;
    if (inpEnd) inpEnd.value = this.endDateStr;

    // Ensure overlay covers correctly without unexpected offsets
    modal.style.position = "absolute";
    modal.style.top = "0px";
    modal.style.left = "0px";
    modal.style.width = "100%";
    modal.style.height = "100%";
    modal.style.pointerEvents = "none";
    modal.style.display = "block";
    this.bringToFront();

    // Center nicely in the workspace / viewport
    const win = document.getElementById("periodPickerModal");
    if (win) {
      win.style.position = "absolute";
      win.style.pointerEvents = "auto";
      win.style.margin = "0px";

      const ws = document.getElementById("mdiWorkspace") || document.body;
      const wsRect = ws.getBoundingClientRect();
      const winW = win.offsetWidth || 530;
      const winH = win.offsetHeight || 440;

      const left = Math.max(10, Math.round((wsRect.width - winW) / 2));
      const top = Math.max(10, Math.round((wsRect.height - winH) / 2));

      win.style.left = `${left}px`;
      win.style.top = `${top}px`;
    }

    this.initDragging();
    this.renderGrid();
  },

  bringToFront: function() {
    const modal = document.getElementById("periodPickerModalOverlay");
    if (modal) {
      if (window.MdiManager && typeof MdiManager.topZIndex === "number") {
        MdiManager.topZIndex += 10;
        modal.style.zIndex = MdiManager.topZIndex;
      } else {
        modal.style.zIndex = 10000;
      }
    }
  },

  initDragging: function() {
    const header = document.getElementById("periodPickerHeader");
    const win = document.getElementById("periodPickerModal");
    if (!header || !win || header._dragBound) return;
    header._dragBound = true;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    header.addEventListener("mousedown", (e) => {
      // Don't drag if clicking buttons, inputs, etc.
      if (e.target.closest("button, a, input")) return;
      e.preventDefault();

      PeriodPicker.bringToFront();

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const ws = document.getElementById("mdiWorkspace") || document.body;
      const wsRect = ws.getBoundingClientRect();
      const winRect = win.getBoundingClientRect();

      initialLeft = winRect.left - wsRect.left;
      initialTop = winRect.top - wsRect.top;

      document.body.style.userSelect = "none";

      const onMouseMove = (moveEvent) => {
        if (!isDragging) return;
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;

        let newLeft = initialLeft + dx;
        let newTop = initialTop + dy;

        const maxLeft = Math.max(0, wsRect.width - win.offsetWidth);
        const maxTop = Math.max(0, wsRect.height - 40);

        newLeft = Math.max(0, Math.min(maxLeft, newLeft));
        newTop = Math.max(0, Math.min(maxTop, newTop));

        win.style.left = `${newLeft}px`;
        win.style.top = `${newTop}px`;
      };

      const onMouseUp = () => {
        isDragging = false;
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });
  },

  close: function() {
    const modal = document.getElementById("periodPickerModalOverlay");
    if (modal) modal.style.display = "none";
    const presets = document.getElementById("ppPresetsMenu");
    if (presets) presets.style.display = "none";
  },

  prevYears: function() {
    this.baseYear -= 3;
    this.renderGrid();
  },

  nextYears: function() {
    this.baseYear += 3;
    this.renderGrid();
  },

  renderGrid: function() {
    const year0 = this.baseYear - 1;
    const year1 = this.baseYear;
    const year2 = this.baseYear + 1;

    const lbl0 = document.getElementById("ppYearLabel0");
    const lbl1 = document.getElementById("ppYearLabel1");
    const lbl2 = document.getElementById("ppYearLabel2");
    if (lbl0) lbl0.textContent = year0;
    if (lbl1) lbl1.textContent = year1;
    if (lbl2) lbl2.textContent = year2;

    const container = document.getElementById("ppYearsGrid");
    if (!container) return;
    container.innerHTML = "";

    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth(); // 0-indexed

    const parseDateObj = (str, isEnd) => {
      if (!str) return null;
      const m = String(str).trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{1,2}):(\d{1,2}))?/);
      if (!m) return null;
      const d = parseInt(m[1], 10);
      const mo = parseInt(m[2], 10) - 1;
      const y = parseInt(m[3], 10);
      const hh = m[4] !== undefined ? parseInt(m[4], 10) : (isEnd ? 23 : 0);
      const mm = m[5] !== undefined ? parseInt(m[5], 10) : (isEnd ? 59 : 0);
      const ss = m[6] !== undefined ? parseInt(m[6], 10) : (isEnd ? 59 : 0);
      return new Date(y, mo, d, hh, mm, ss);
    };

    const dtStart = parseDateObj(this.startDateStr, false);
    const dtEnd = parseDateObj(this.endDateStr, true);

    const years = [year0, year1, year2];
    years.forEach(yr => {
      const col = document.createElement("div");
      col.style.display = "grid";
      col.style.gridTemplateColumns = "repeat(3, 1fr)";
      col.style.gap = "3px";

      for (let m = 0; m < 12; m++) {
        const mStart = new Date(yr, m, 1, 0, 0, 0);
        const mEnd = new Date(yr, m + 1, 0, 23, 59, 59);

        // Check if this month is within the selected range
        let isSelected = false;
        if (dtStart && dtEnd) {
          isSelected = (mEnd >= dtStart && mStart <= dtEnd);
        } else if (dtStart && !dtEnd) {
          isSelected = (mEnd >= dtStart);
        } else if (!dtStart && dtEnd) {
          isSelected = (mStart <= dtEnd);
        }

        const isCurrentMonth = (yr === curYear && m === curMonth);

        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = this.monthNames[m];
        btn.style.height = "24px";
        btn.style.fontSize = "11px";
        btn.style.fontFamily = "Tahoma, sans-serif";
        btn.style.cursor = "pointer";
        btn.style.border = "1px solid #7f9db9";
        btn.style.borderRadius = "2px";
        btn.style.textAlign = "center";
        btn.style.padding = "0";

        if (isSelected) {
          btn.style.background = "#4365b6";
          btn.style.color = "#ffffff";
          btn.style.fontWeight = "bold";
        } else {
          btn.style.background = "#ffffff";
          btn.style.color = "#111111";
        }

        if (isCurrentMonth) {
          btn.style.outline = "2px solid #00aa00";
          btn.style.outlineOffset = "-2px";
        }

        btn.onclick = () => {
          this.onMonthClick(yr, m);
        };

        btn.ondblclick = (e) => {
          e.preventDefault();
          this.onMonthDblClick(yr, m);
        };

        col.appendChild(btn);
      }

      container.appendChild(col);
    });
  },

  /**
   * Click month: Range selection
   * 1st click sets start month (e.g. August)
   * 2nd click sets end month (e.g. October) -> selects August, September, October!
   */
  onMonthClick: function(year, month) {
    if (!this.isSelectingRange) {
      // 1st click: start new range
      this.rangeAnchor = { year, month };
      this.isSelectingRange = true;

      const lastDay = new Date(year, month + 1, 0).getDate();
      const mm = String(month + 1).padStart(2, "0");
      this.startDateStr = `01.${mm}.${year} 00:00:00`;
      this.endDateStr = `${String(lastDay).padStart(2, "0")}.${mm}.${year} 23:59:59`;
    } else {
      // 2nd click: finish range between anchor and clicked month
      this.isSelectingRange = false;
      const y1 = this.rangeAnchor.year;
      const m1 = this.rangeAnchor.month;
      const y2 = year;
      const m2 = month;

      let startY, startM, endY, endM;
      if (y2 > y1 || (y2 === y1 && m2 >= m1)) {
        startY = y1;
        startM = m1;
        endY = y2;
        endM = m2;
      } else {
        startY = y2;
        startM = m2;
        endY = y1;
        endM = m1;
      }

      const lastDay = new Date(endY, endM + 1, 0).getDate();
      this.startDateStr = `01.${String(startM + 1).padStart(2, "0")}.${startY} 00:00:00`;
      this.endDateStr = `${String(lastDay).padStart(2, "0")}.${String(endM + 1).padStart(2, "0")}.${endY} 23:59:59`;
      this.rangeAnchor = null;
    }

    const inpStart = document.getElementById("ppStartDateInput");
    const inpEnd = document.getElementById("ppEndDateInput");
    if (inpStart) inpStart.value = this.startDateStr;
    if (inpEnd) inpEnd.value = this.endDateStr;

    this.renderGrid();
  },

  /**
   * Double-click month: selects only that month and immediately confirms
   */
  onMonthDblClick: function(year, month) {
    this.isSelectingRange = false;
    this.rangeAnchor = null;

    const lastDay = new Date(year, month + 1, 0).getDate();
    const mm = String(month + 1).padStart(2, "0");
    this.startDateStr = `01.${mm}.${year} 00:00:00`;
    this.endDateStr = `${String(lastDay).padStart(2, "0")}.${mm}.${year} 23:59:59`;

    const inpStart = document.getElementById("ppStartDateInput");
    const inpEnd = document.getElementById("ppEndDateInput");
    if (inpStart) inpStart.value = this.startDateStr;
    if (inpEnd) inpEnd.value = this.endDateStr;

    this.renderGrid();
    this.confirm();
  },

  /**
   * Smart date completion:
   * e.g. "01.03" + Enter -> "01.03.2026"
   * "1.3" -> "01.03.2026"
   * "0103" -> "01.03.2026"
   * "01.03.26" -> "01.03.2026"
   * "15" -> "15.<currentMonth>.<currentYear>"
   */
  autoCompleteDate: function(val) {
    if (!val) return "";
    val = val.trim();
    let timePart = "";
    const timeMatch = val.match(/\s+(\d{1,2}:\d{1,2}(?::\d{1,2})?)$/);
    if (timeMatch) {
      const tParts = timeMatch[1].split(":");
      const hh = tParts[0].padStart(2, "0");
      const mm = (tParts[1] || "00").padStart(2, "0");
      const ss = (tParts[2] || "00").padStart(2, "0");
      timePart = ` ${hh}:${mm}:${ss}`;
      val = val.replace(/\s+\d{1,2}:\d{1,2}(?::\d{1,2})?$/, "").trim();
    }
    val = val.replace(/[\/\-,]/g, ".");
    const now = new Date();
    const curYear = this.baseYear || now.getFullYear();
    const curMonth = String(now.getMonth() + 1).padStart(2, "0");

    let datePart = val;
    // Pattern 1: dd.mm.yyyy (already full)
    if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(val)) {
      const parts = val.split(".");
      const dd = String(parseInt(parts[0], 10)).padStart(2, "0");
      const mm = String(parseInt(parts[1], 10)).padStart(2, "0");
      const yyyy = parts[2];
      datePart = `${dd}.${mm}.${yyyy}`;
    } else if (/^\d{1,2}\.\d{1,2}\.\d{2}$/.test(val)) {
      const parts = val.split(".");
      const dd = String(parseInt(parts[0], 10)).padStart(2, "0");
      const mm = String(parseInt(parts[1], 10)).padStart(2, "0");
      const yyyy = "20" + parts[2];
      datePart = `${dd}.${mm}.${yyyy}`;
    } else if (/^\d{1,2}\.\d{1,2}$/.test(val)) {
      const parts = val.split(".");
      const dd = String(parseInt(parts[0], 10)).padStart(2, "0");
      const mm = String(parseInt(parts[1], 10)).padStart(2, "0");
      datePart = `${dd}.${mm}.${curYear}`;
    } else if (/^\d{4}$/.test(val)) {
      const dd = val.substring(0, 2);
      const mm = val.substring(2, 4);
      datePart = `${dd}.${mm}.${curYear}`;
    } else if (/^\d{6}$/.test(val)) {
      const dd = val.substring(0, 2);
      const mm = val.substring(2, 4);
      const yyyy = "20" + val.substring(4, 6);
      datePart = `${dd}.${mm}.${yyyy}`;
    } else if (/^\d{8}$/.test(val)) {
      const dd = val.substring(0, 2);
      const mm = val.substring(2, 4);
      const yyyy = val.substring(4, 8);
      datePart = `${dd}.${mm}.${yyyy}`;
    } else if (/^\d{1,2}$/.test(val)) {
      const dd = String(parseInt(val, 10)).padStart(2, "0");
      datePart = `${dd}.${curMonth}.${curYear}`;
    }

    return `${datePart}${timePart}`;
  },

  onInputKeyDown: function(e, which) {
    if (e.key === "F4") {
      e.preventDefault();
      const btn = (which === "start")
        ? document.querySelector("#ppStartDateInput ~ .pp-cal-btn")
        : document.querySelector("#ppEndDateInput ~ .pp-cal-btn");
      this.openMiniCal(which, btn);
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      const inp = (which === "start") 
        ? document.getElementById("ppStartDateInput") 
        : document.getElementById("ppEndDateInput");

      if (inp) {
        inp.value = this.autoCompleteDate(inp.value);
      }
      this.onManualInputChange(which);

      // If user pressed Enter in start input, focus the end input for smooth UX
      if (which === "start") {
        const inpEnd = document.getElementById("ppEndDateInput");
        if (inpEnd) {
          inpEnd.focus();
          inpEnd.select();
        }
      } else {
        if (inp) inp.blur();
      }
    }
  },

  onInputBlur: function(which) {
    const inp = (which === "start") 
      ? document.getElementById("ppStartDateInput") 
      : document.getElementById("ppEndDateInput");

    if (inp && inp.value.trim()) {
      inp.value = this.autoCompleteDate(inp.value);
    }
    this.onManualInputChange(which);
  },

  onManualInputChange: function(which) {
    const inpStart = document.getElementById("ppStartDateInput");
    const inpEnd = document.getElementById("ppEndDateInput");
    this.startDateStr = inpStart ? inpStart.value.trim() : "";
    this.endDateStr = inpEnd ? inpEnd.value.trim() : "";

    this.rangeAnchor = null;
    this.isSelectingRange = false;

    // If a year is entered, adjust baseYear if needed
    const mY = (this.startDateStr || "").match(/^\d{1,2}\.\d{1,2}\.(\d{4})/);
    if (mY) {
      const y = parseInt(mY[1], 10);
      if (Math.abs(y - this.baseYear) > 1) {
        this.baseYear = y;
      }
    }

    this.renderGrid();
  },

  clearInput: function(which) {
    if (which === "start") {
      this.startDateStr = "";
      const inp = document.getElementById("ppStartDateInput");
      if (inp) inp.value = "";
    } else {
      this.endDateStr = "";
      const inp = document.getElementById("ppEndDateInput");
      if (inp) inp.value = "";
    }
    this.renderGrid();
  },

  clearPeriod: function() {
    this.startDateStr = "";
    this.endDateStr = "";
    const inpStart = document.getElementById("ppStartDateInput");
    const inpEnd = document.getElementById("ppEndDateInput");
    if (inpStart) inpStart.value = "";
    if (inpEnd) inpEnd.value = "";
    this.renderGrid();
  },

  openMiniCal: function(which, btnEl) {
    const targetInput = (which === "start") 
      ? document.getElementById("ppStartDateInput") 
      : document.getElementById("ppEndDateInput");

    const cal = (typeof OneCCalendar !== "undefined") ? OneCCalendar : window.OneCCalendar;
    if (cal && targetInput) {
      cal.open(targetInput, btnEl);
    }
  },

  togglePresets: function() {
    const menu = document.getElementById("ppPresetsMenu");
    if (!menu) return;
    menu.style.display = (menu.style.display === "none" || !menu.style.display) ? "block" : "none";
  },

  applyPreset: function(presetKey) {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();
    const curDay = now.getDate();

    const fmt = (d, isEnd) => {
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = d.getFullYear();
      const time = isEnd ? "23:59:59" : "00:00:00";
      return `${dd}.${mm}.${yyyy} ${time}`;
    };

    if (presetKey === "today") {
      this.startDateStr = fmt(now, false);
      this.endDateStr = fmt(now, true);
    } else if (presetKey === "yesterday") {
      const yest = new Date(curYear, curMonth, curDay - 1);
      this.startDateStr = fmt(yest, false);
      this.endDateStr = fmt(yest, true);
    } else if (presetKey === "this_week") {
      let dayOfWeek = now.getDay() - 1;
      if (dayOfWeek === -1) dayOfWeek = 6;
      const monday = new Date(curYear, curMonth, curDay - dayOfWeek);
      const sunday = new Date(curYear, curMonth, curDay - dayOfWeek + 6);
      this.startDateStr = fmt(monday, false);
      this.endDateStr = fmt(sunday, true);
    } else if (presetKey === "this_month") {
      const first = new Date(curYear, curMonth, 1);
      const last = new Date(curYear, curMonth + 1, 0);
      this.startDateStr = fmt(first, false);
      this.endDateStr = fmt(last, true);
    } else if (presetKey === "this_quarter") {
      const qMonth = Math.floor(curMonth / 3) * 3;
      const first = new Date(curYear, qMonth, 1);
      const last = new Date(curYear, qMonth + 3, 0);
      this.startDateStr = fmt(first, false);
      this.endDateStr = fmt(last, true);
    } else if (presetKey === "this_year") {
      this.startDateStr = `01.01.${curYear} 00:00:00`;
      this.endDateStr = `31.12.${curYear} 23:59:59`;
    } else if (presetKey === "all") {
      this.startDateStr = "";
      this.endDateStr = "";
    }

    const inpStart = document.getElementById("ppStartDateInput");
    const inpEnd = document.getElementById("ppEndDateInput");
    if (inpStart) inpStart.value = this.startDateStr;
    if (inpEnd) inpEnd.value = this.endDateStr;

    const menu = document.getElementById("ppPresetsMenu");
    if (menu) menu.style.display = "none";

    this.renderGrid();
  },

  saveRememberedPeriod: function() {
    try {
      const chk = document.getElementById("ppRememberPeriod");
      const isChecked = chk ? chk.checked : (localStorage.getItem("1c_remember_period_active") !== "false");
      if (isChecked) {
        localStorage.setItem("1c_remember_period_active", "true");
        localStorage.setItem("1c_remembered_period", JSON.stringify({
          startDate: this.startDateStr,
          endDate: this.endDateStr
        }));
      } else {
        localStorage.setItem("1c_remember_period_active", "false");
        localStorage.removeItem("1c_remembered_period");
      }
    } catch (e) {
      console.warn("Could not save remembered period to localStorage:", e);
    }
  },

  getRememberedPeriod: function() {
    try {
      const isActive = localStorage.getItem("1c_remember_period_active");
      if (isActive === "false") return null;
      const saved = localStorage.getItem("1c_remembered_period");
      if (saved) {
        const obj = JSON.parse(saved);
        if (obj && (obj.startDate || obj.endDate)) {
          return obj;
        }
      }
    } catch (e) {}
    return null;
  },

  confirm: function() {
    this.saveRememberedPeriod();
    this.close();
    if (typeof this.activeCallback === "function") {
      this.activeCallback(this.startDateStr, this.endDateStr);
    }
  }
};

window.PeriodPicker = PeriodPicker;
