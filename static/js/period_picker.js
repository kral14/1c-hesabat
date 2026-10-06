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
    if (inpStart) {
      inpStart.value = this.startDateStr;
      this.attachSegmentSelection(inpStart);
    }
    if (inpEnd) {
      inpEnd.value = this.endDateStr;
      this.attachSegmentSelection(inpEnd);
    }

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

  parseDateObj: function(str, isEnd) {
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
  },

  validateAndSyncDates: function(which) {
    const inpStart = document.getElementById("ppStartDateInput");
    const inpEnd = document.getElementById("ppEndDateInput");
    const sStart = inpStart ? inpStart.value.trim() : this.startDateStr;
    const sEnd = inpEnd ? inpEnd.value.trim() : this.endDateStr;

    if (!sStart || !sEnd) return;

    const dtStart = this.parseDateObj(sStart, false);
    const dtEnd = this.parseDateObj(sEnd, true);

    if (dtStart && dtEnd && dtStart.getTime() > dtEnd.getTime()) {
      if (which === "start") {
        // Başlanğıc tarix son tarixdən yuxarı ola bilməz!
        // Başlanğıc tarix dəyişdikdə son tarix ən azı həmin günün sonuna (23:59:59) bərabərləşdirilir
        const d = String(dtStart.getDate()).padStart(2, "0");
        const m = String(dtStart.getMonth() + 1).padStart(2, "0");
        const y = dtStart.getFullYear();
        this.endDateStr = `${d}.${m}.${y} 23:59:59`;
        if (inpEnd) inpEnd.value = this.endDateStr;
      } else if (which === "end") {
        // Son tarix başlanğıc tarixdən əvvələ qoyularsa,
        // başlanğıc tarix son tarixin gününün əvvəlinə (00:00:00) çəkilir
        const d = String(dtEnd.getDate()).padStart(2, "0");
        const m = String(dtEnd.getMonth() + 1).padStart(2, "0");
        const y = dtEnd.getFullYear();
        this.startDateStr = `${d}.${m}.${y} 00:00:00`;
        if (inpStart) inpStart.value = this.startDateStr;
      } else {
        const d = String(dtStart.getDate()).padStart(2, "0");
        const m = String(dtStart.getMonth() + 1).padStart(2, "0");
        const y = dtStart.getFullYear();
        this.endDateStr = `${d}.${m}.${y} 23:59:59`;
        if (inpEnd) inpEnd.value = this.endDateStr;
      }
    }
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

    const dtStart = this.parseDateObj(this.startDateStr, false);
    const dtEnd = this.parseDateObj(this.endDateStr, true);

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
   * e.g. "04.10" -> "04.10.2026 00:00:00"
   * "01.03" + Enter -> "01.03.2026 00:00:00"
   * "1.3" -> "01.03.2026 00:00:00"
   * "0103" -> "01.03.2026 00:00:00"
   * "01.03.26" -> "01.03.2026 00:00:00"
   * "15" -> "15.<currentMonth>.<currentYear> 00:00:00"
   */
  autoCompleteDate: function(val, defaultTime = "00:00:00") {
    if (!val) return "";
    // Yad simvolları dərhal təmizlə
    val = String(val).replace(/[^0-9.:\s\/\-,]/g, "").trim();
    if (!val) return "";

    const now = new Date();
    const curYear = this.baseYear || now.getFullYear();
    const curMonth = now.getMonth() + 1;

    let timePart = "";
    const timeMatch = val.match(/\s+(\d{1,2}:\d{1,2}(?::\d{1,2})?)$/);
    if (timeMatch) {
      const tParts = timeMatch[1].split(":");
      const hh = Math.min(23, Math.max(0, parseInt(tParts[0], 10) || 0));
      const mm = Math.min(59, Math.max(0, parseInt(tParts[1], 10) || 0));
      const ss = Math.min(59, Math.max(0, parseInt(tParts[2], 10) || 0));
      timePart = ` ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
      val = val.replace(/\s+\d{1,2}:\d{1,2}(?::\d{1,2})?$/, "").trim();
    } else {
      timePart = defaultTime ? ` ${defaultTime}` : " 00:00:00";
    }

    val = val.replace(/[\/\-,]/g, ".");

    let day = 1;
    let month = curMonth;
    let year = curYear;

    if (val.includes(".")) {
      const parts = val.split(".").map(s => s.trim()).filter(s => s.length > 0);
      if (parts.length >= 1) {
        day = parseInt(parts[0], 10) || 1;
      }
      if (parts.length >= 2) {
        month = parseInt(parts[1], 10) || curMonth;
      }
      if (parts.length >= 3) {
        let yStr = parts[2];
        if (yStr.length === 2) yStr = "20" + yStr;
        year = parseInt(yStr, 10) || curYear;
      }
    } else {
      // Nöqtəsiz yalnız rəqəmlər daxil edilib
      const digits = val.replace(/\D/g, "");
      if (digits.length === 1 || digits.length === 2) {
        day = parseInt(digits, 10) || 1;
      } else if (digits.length === 3) {
        day = parseInt(digits.substring(0, 2), 10) || 1;
        month = parseInt(digits.substring(2), 10) || curMonth;
      } else if (digits.length === 4) {
        day = parseInt(digits.substring(0, 2), 10) || 1;
        month = parseInt(digits.substring(2, 4), 10) || curMonth;
      } else if (digits.length === 6) {
        day = parseInt(digits.substring(0, 2), 10) || 1;
        month = parseInt(digits.substring(2, 4), 10) || curMonth;
        year = 2000 + (parseInt(digits.substring(4, 6), 10) || 26);
      } else if (digits.length >= 8) {
        day = parseInt(digits.substring(0, 2), 10) || 1;
        month = parseInt(digits.substring(2, 4), 10) || curMonth;
        year = parseInt(digits.substring(4, 8), 10) || curYear;
      }
    }

    // Təqvim validasiyaları
    month = Math.min(12, Math.max(1, month));
    year = Math.max(1900, Math.min(2100, year));
    const maxDays = new Date(year, month, 0).getDate();
    day = Math.min(maxDays, Math.max(1, day));

    const sDay = String(day).padStart(2, "0");
    const sMonth = String(month).padStart(2, "0");
    const sYear = String(year).padStart(4, "0");

    // HƏMİŞƏ DƏQİQ 1C FORMATI: DD.MM.YYYY HH:MM:SS
    return `${sDay}.${sMonth}.${sYear}${timePart}`;
  },

  enforceDateInputRestrictions: function(input) {
    if (!input || input._c1DateRestricted) return;
    // Təhlükəsizlik: Yalnız və yalnız TARİX xanalarına tətbiq olunmalıdır!
    if (input.dataset && input.dataset.fieldKey && input.dataset.fieldKey !== "date") return;
    const isExplicitDate = input.classList.contains("uj-filter-from") || 
                           input.classList.contains("uj-filter-to") || 
                           input.classList.contains("uj-filter-date") || 
                           input.id === "ppStartDateInput" || 
                           input.id === "ppEndDateInput";
    if (!isExplicitDate) return;
    input._c1DateRestricted = true;

    input.addEventListener("keydown", (e) => {
      // Funksional və naviqasiya düymələrinə icazə ver
      if ([
        "Backspace", "Delete", "Tab", "Enter", "Escape", 
        "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", 
        "Home", "End", "F4"
      ].includes(e.key)) {
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        return;
      }
      if (e.key === "." || e.key === ":" || e.key === " ") {
        return;
      }
      // RƏQƏM OLMAYAN HƏR ŞEYİ (hərflər 'a', 's' və s.) KLAVİATURADA DƏRHAL BLOKLA!
      if (!/^\d$/.test(e.key)) {
        e.preventDefault();
        return;
      }
    });

    input.addEventListener("paste", (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData("text") || "";
      const clean = text.replace(/[^0-9.:\s\/\-,]/g, "");
      document.execCommand("insertText", false, clean);
    });

    input.addEventListener("input", () => {
      const clean = input.value.replace(/[^0-9.:\s\/\-,]/g, "");
      if (input.value !== clean) {
        input.value = clean;
      }
    });
  },

  /**
   * 1C Native Segment Selector:
   * When user clicks on Day (01), Month (04), Year (2026), Hour, Min, Sec:
   * precisely highlights that clicked segment instead of the entire date!
   */
  attachSegmentSelection: function(input) {
    if (!input || input._c1SegmentBound) return;
    if (input.dataset && input.dataset.fieldKey && input.dataset.fieldKey !== "date") return;
    const isExplicitDate = input.classList.contains("uj-filter-from") || 
                           input.classList.contains("uj-filter-to") || 
                           input.classList.contains("uj-filter-date") || 
                           input.id === "ppStartDateInput" || 
                           input.id === "ppEndDateInput";
    if (!isExplicitDate) return;
    input._c1SegmentBound = true;
    this.enforceDateInputRestrictions(input);

    const selectSegmentAtCursor = () => {
      const val = input.value;
      if (!val) return;

      const pos = input.selectionStart || 0;
      let s = 0, e = 2;

      if (pos <= 2) {
        // Day: 01.
        s = 0; e = 2;
      } else if (pos <= 5) {
        // Month: 04.
        s = 3; e = 5;
      } else if (pos <= 10) {
        // Year: 2026
        s = 6; e = 10;
      } else if (pos <= 13) {
        // Hour: 00:
        s = 11; e = 13;
      } else if (pos <= 16) {
        // Minute: 00:
        s = 14; e = 16;
      } else {
        // Second: 00
        s = 17; e = 19;
      }

      if (e > val.length) e = val.length;
      if (s < val.length) {
        try {
          input.setSelectionRange(s, e);
        } catch (err) {}
      }
    };

    input.addEventListener("mouseup", (e) => {
      // If user is just clicking, not drag-selecting text
      if (input.selectionStart === input.selectionEnd) {
        setTimeout(selectSegmentAtCursor, 15);
      }
    });

    input.addEventListener("dblclick", (e) => {
      e.preventDefault();
      selectSegmentAtCursor();
    });

    input.addEventListener("keydown", (e) => {
      const val = input.value;
      if (!val || !/^\d{2}\.\d{2}\.\d{4}/.test(val)) return;

      if (e.key === "ArrowRight") {
        const start = input.selectionStart;
        const end = input.selectionEnd;
        if (start === 0 && end === 2) {
          e.preventDefault();
          input.setSelectionRange(3, 5);
        } else if (start === 3 && end === 5) {
          e.preventDefault();
          input.setSelectionRange(6, 10);
        } else if (start === 6 && end === 10 && val.length > 10) {
          e.preventDefault();
          input.setSelectionRange(11, 13);
        } else if (start === 11 && end === 13 && val.length > 13) {
          e.preventDefault();
          input.setSelectionRange(14, 16);
        } else if (start === 14 && end === 16 && val.length > 16) {
          e.preventDefault();
          input.setSelectionRange(17, 19);
        }
      } else if (e.key === "ArrowLeft") {
        const start = input.selectionStart;
        const end = input.selectionEnd;
        if (start === 17 && end === 19) {
          e.preventDefault();
          input.setSelectionRange(14, 16);
        } else if (start === 14 && end === 16) {
          e.preventDefault();
          input.setSelectionRange(11, 13);
        } else if (start === 11 && end === 13) {
          e.preventDefault();
          input.setSelectionRange(6, 10);
        } else if (start === 6 && end === 10) {
          e.preventDefault();
          input.setSelectionRange(3, 5);
        } else if (start === 3 && end === 5) {
          e.preventDefault();
          input.setSelectionRange(0, 2);
        }
      }
    });

    input.addEventListener("input", () => {
      const clean = input.value.replace(/[^0-9.:\s\/\-,]/g, "");
      if (input.value !== clean) {
        input.value = clean;
      }
    });
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
        inp.value = this.autoCompleteDate(inp.value, which === "end" ? "23:59:59" : "00:00:00");
      }
      this.validateAndSyncDates(which);
      this.onManualInputChange(which);

      // If user pressed Enter in start input, focus the end input for smooth UX
      if (which === "start") {
        const inpEnd = document.getElementById("ppEndDateInput");
        if (inpEnd) {
          inpEnd.focus();
          if (inpEnd.setSelectionRange) inpEnd.setSelectionRange(0, 2);
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
      inp.value = this.autoCompleteDate(inp.value, which === "end" ? "23:59:59" : "00:00:00");
    }
    this.validateAndSyncDates(which);
    this.onManualInputChange(which);
  },

  onManualInputChange: function(which) {
    const inpStart = document.getElementById("ppStartDateInput");
    const inpEnd = document.getElementById("ppEndDateInput");
    this.startDateStr = inpStart ? inpStart.value.trim() : "";
    this.endDateStr = inpEnd ? inpEnd.value.trim() : "";

    // Tam tarix daxil edilibsə dərhal başlanğıc və son tarixin düzgünlüyünü yoxla
    if (this.startDateStr.length >= 10 && this.endDateStr.length >= 10) {
      this.validateAndSyncDates(which);
    }

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
    const inpStart = document.getElementById("ppStartDateInput");
    const inpEnd = document.getElementById("ppEndDateInput");
    if (inpStart && inpStart.value.trim()) {
      inpStart.value = this.autoCompleteDate(inpStart.value, "00:00:00");
      this.startDateStr = inpStart.value.trim();
    }
    if (inpEnd && inpEnd.value.trim()) {
      inpEnd.value = this.autoCompleteDate(inpEnd.value, "23:59:59");
      this.endDateStr = inpEnd.value.trim();
    }
    this.validateAndSyncDates("start");
    this.saveRememberedPeriod();
    this.close();
    if (typeof this.activeCallback === "function") {
      this.activeCallback(this.startDateStr, this.endDateStr);
    }
  }
};

window.PeriodPicker = PeriodPicker;
