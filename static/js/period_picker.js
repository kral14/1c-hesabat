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

  open: function(options = {}) {
    this.activeCallback = options.onSelect || null;
    this.startDateStr = options.startDate || "";
    this.endDateStr = options.endDate || "";

    // Set baseYear around current date or startDate
    const now = new Date();
    if (this.startDateStr && /^\d{2}\.\d{2}\.\d{4}$/.test(this.startDateStr)) {
      this.baseYear = parseInt(this.startDateStr.split(".")[2], 10);
    } else {
      this.baseYear = now.getFullYear();
    }

    const modal = document.getElementById("periodPickerModalOverlay");
    if (!modal) return;

    const inpStart = document.getElementById("ppStartDateInput");
    const inpEnd = document.getElementById("ppEndDateInput");
    if (inpStart) inpStart.value = this.startDateStr;
    if (inpEnd) inpEnd.value = this.endDateStr;

    // Center nicely
    const win = document.getElementById("periodPickerModal");
    if (win) {
      win.style.position = "relative";
      win.style.margin = "10vh auto";
    }

    modal.style.display = "flex";
    this.renderGrid();
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
      if (!str || !/^\d{2}\.\d{2}\.\d{4}$/.test(str)) return null;
      const [d, m, y] = str.split(".").map(Number);
      return new Date(y, m - 1, d, isEnd ? 23 : 0, isEnd ? 59 : 0, isEnd ? 59 : 0);
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

        col.appendChild(btn);
      }

      container.appendChild(col);
    });
  },

  onMonthClick: function(year, month) {
    const lastDay = new Date(year, month + 1, 0).getDate();
    const mm = String(month + 1).padStart(2, "0");
    const sStr = `01.${mm}.${year}`;
    const eStr = `${String(lastDay).padStart(2, "0")}.${mm}.${year}`;

    // If user clicks a month:
    // If start is empty, or both are filled, start fresh with this month
    if (!this.startDateStr || (this.startDateStr && this.endDateStr)) {
      this.startDateStr = sStr;
      this.endDateStr = eStr;
    } else {
      // One is set, expand range
      const [d1, m1, y1] = this.startDateStr.split(".").map(Number);
      const clickedStart = new Date(year, month, 1);
      const prevStart = new Date(y1, m1 - 1, 1);

      if (clickedStart >= prevStart) {
        this.endDateStr = eStr;
      } else {
        this.endDateStr = this.startDateStr;
        this.startDateStr = sStr;
      }
    }

    const inpStart = document.getElementById("ppStartDateInput");
    const inpEnd = document.getElementById("ppEndDateInput");
    if (inpStart) inpStart.value = this.startDateStr;
    if (inpEnd) inpEnd.value = this.endDateStr;

    this.renderGrid();
  },

  onManualInputChange: function() {
    const inpStart = document.getElementById("ppStartDateInput");
    const inpEnd = document.getElementById("ppEndDateInput");
    this.startDateStr = inpStart ? inpStart.value.trim() : "";
    this.endDateStr = inpEnd ? inpEnd.value.trim() : "";
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

    if (window.OneCCalendar && targetInput) {
      OneCCalendar.open(targetInput, btnEl);
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

    const fmt = (d) => {
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = d.getFullYear();
      return `${dd}.${mm}.${yyyy}`;
    };

    if (presetKey === "today") {
      this.startDateStr = fmt(now);
      this.endDateStr = fmt(now);
    } else if (presetKey === "yesterday") {
      const yest = new Date(curYear, curMonth, curDay - 1);
      this.startDateStr = fmt(yest);
      this.endDateStr = fmt(yest);
    } else if (presetKey === "this_week") {
      let dayOfWeek = now.getDay() - 1;
      if (dayOfWeek === -1) dayOfWeek = 6;
      const monday = new Date(curYear, curMonth, curDay - dayOfWeek);
      const sunday = new Date(curYear, curMonth, curDay - dayOfWeek + 6);
      this.startDateStr = fmt(monday);
      this.endDateStr = fmt(sunday);
    } else if (presetKey === "this_month") {
      const first = new Date(curYear, curMonth, 1);
      const last = new Date(curYear, curMonth + 1, 0);
      this.startDateStr = fmt(first);
      this.endDateStr = fmt(last);
    } else if (presetKey === "this_quarter") {
      const qMonth = Math.floor(curMonth / 3) * 3;
      const first = new Date(curYear, qMonth, 1);
      const last = new Date(curYear, qMonth + 3, 0);
      this.startDateStr = fmt(first);
      this.endDateStr = fmt(last);
    } else if (presetKey === "this_year") {
      this.startDateStr = `01.01.${curYear}`;
      this.endDateStr = `31.12.${curYear}`;
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

  confirm: function() {
    this.close();
    if (typeof this.activeCallback === "function") {
      this.activeCallback(this.startDateStr, this.endDateStr);
    }
  }
};

window.PeriodPicker = PeriodPicker;
