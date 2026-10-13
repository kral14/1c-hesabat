/**
 * 1C:ENTERPRISE - UNIVERSAL TABLE CELL & ROW SELECTION SYSTEM
 * static/js/c1_table_selection.js
 *
 * Implements authentic 1C table navigation:
 * - Selected row: Light blue (#dceaf7)
 * - Clicked cell: Solid 1C blue (#316ac5) with white text (#ffffff)
 * - Single click selects cell text for immediate Ctrl+C copying
 * - Universal: Works seamlessly across ALL tables in the application.
 */

(function() {
  window.lastActive1cCellText = "";

  function isInteractiveElement(target) {
    if (!target) return false;
    return Boolean(
      target.closest("button") ||
      target.closest(".btn-1c") ||
      target.closest("input") ||
      target.closest("select") ||
      target.closest("textarea") ||
      target.closest(".window-btn-close") ||
      target.closest(".mdi-dropdown-entry") ||
      target.closest("#ujFilterWindow") ||
      target.closest("#orderAnalysisSettingsModal") ||
      target.closest("#periodPickerModalOverlay") ||
      target.closest(".settings-window") ||
      target.closest(".modal-overlay-1c") ||
      target.closest(".filters-table") ||
      target.closest(".groupings-table") ||
      target.closest(".settings-filters-section") ||
      target.closest(".filters-table-container") ||
      target.closest(".c1-textbox-wrap") ||
      target.closest(".c1-textbox-input") ||
      target.closest(".filter-field-cell-wrap") ||
      target.closest(".filter-value-cell-wrap")
    );
  }

  function highlightAndSelectCell(td, event) {
    if (!td || isInteractiveElement(event ? event.target : null)) return;
    if (
      td.closest("#ujFilterWindow") ||
      td.closest("#orderAnalysisSettingsModal") ||
      td.closest("#periodPickerModalOverlay") ||
      td.closest(".settings-window") ||
      td.closest(".filters-table") ||
      td.closest(".groupings-table") ||
      td.closest(".settings-filters-section") ||
      td.closest(".filters-table-container") ||
      td.closest(".modal-overlay-1c") ||
      td.closest(".c1-textbox-wrap") ||
      td.querySelector(".c1-textbox-wrap, .c1-textbox-input, .filter-val-input, .oa-filter-val, .filter-field-name")
    ) return;

    const tr = td.closest("tr");
    if (!tr) return;
    const tbody = tr.closest("tbody") || tr.parentElement;
    if (!tbody) return;

    // 1. Remove previous highlights in this table/container
    const prevCells = tbody.querySelectorAll("td.c1-cell-active, td.uj-cell-active, td.sde-cell-active, td.pde-cell-active");
    prevCells.forEach(c => {
      c.classList.remove("c1-cell-active", "uj-cell-active", "sde-cell-active", "pde-cell-active");
      if (c.dataset.origBg !== undefined) {
        c.style.backgroundColor = c.dataset.origBg;
      } else {
        c.style.removeProperty("background-color");
        c.style.removeProperty("background");
      }
      if (c.dataset.origColor !== undefined) {
        c.style.color = c.dataset.origColor;
      } else {
        c.style.removeProperty("color");
      }
      const inp = c.querySelector("input:not([type='checkbox']):not([type='button']), textarea");
      if (inp) {
        inp.style.removeProperty("background-color");
        inp.style.removeProperty("background");
        inp.style.removeProperty("color");
      }
    });

    const prevRows = tbody.querySelectorAll("tr.c1-row-selected, tr.uj-row-selected, tr.sde-row-selected, tr.pde-row-selected");
    prevRows.forEach(r => {
      r.classList.remove("c1-row-selected", "uj-row-selected", "sde-row-selected", "pde-row-selected");
      if (r.dataset.origBg !== undefined) {
        r.style.backgroundColor = r.dataset.origBg;
      } else {
        r.style.removeProperty("background-color");
      }
      r.querySelectorAll("td").forEach(c => {
        if (c.dataset.origBg !== undefined) {
          c.style.backgroundColor = c.dataset.origBg;
        } else {
          c.style.removeProperty("background-color");
        }
        if (c.dataset.origColor !== undefined) {
          c.style.color = c.dataset.origColor;
        }
      });
    });

    // 2. Highlight Row in Light Blue (#dceaf7)
    // Sətir seçiləndə yalnız arxa fon dəyişir, xanaların xüsusi mətn rəngləri (Разница mavi/qırmızı) QORUNUR!
    if (tr.dataset.origBg === undefined) {
      tr.dataset.origBg = tr.style.backgroundColor || "";
    }
    tr.classList.add("c1-row-selected");
    tr.style.backgroundColor = "#dceaf7";
    tr.querySelectorAll("td").forEach(c => {
      if (c.dataset.origBg === undefined) {
        c.dataset.origBg = c.style.backgroundColor || "";
      }
      if (c.dataset.origColor === undefined) {
        c.dataset.origColor = c.style.color || "";
      }
      c.style.backgroundColor = "#dceaf7";
    });

    // 3. Highlight Clicked Cell in Solid 1C Blue (#316ac5) with White Text
    td.classList.add("c1-cell-active");
    if (td.dataset.origBg === undefined) {
      td.dataset.origBg = td.style.backgroundColor || "";
    }
    if (td.dataset.origColor === undefined) {
      td.dataset.origColor = td.style.color || "";
    }
    td.style.setProperty("background-color", "#316ac5", "important");
    td.style.setProperty("background", "#316ac5", "important");
    td.style.setProperty("color", "#ffffff", "important");

    // 4. Select text for immediate copy (Ctrl+C)
    const inp = td.querySelector("input:not([type='checkbox']):not([type='button']), textarea");
    let cellText = "";

    if (inp) {
      inp.style.setProperty("background-color", "#316ac5", "important");
      inp.style.setProperty("background", "#316ac5", "important");
      inp.style.setProperty("color", "#ffffff", "important");
      cellText = inp.value;
      setTimeout(() => {
        try {
          inp.focus();
          inp.select();
        } catch (e) {}
      }, 10);
    } else {
      const titleEl = td.querySelector(".oa-row-title, .c1-cell-text, .row-title");
      const targetEl = titleEl || td;
      cellText = (titleEl ? titleEl.textContent : td.innerText).trim();
      try {
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(targetEl);
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (e) {}
    }

    window.lastActive1cCellText = cellText;
  }

  // Global Click Event for any table cell in the app
  document.addEventListener("click", function(e) {
    const td = e.target.closest("table tbody td, .c1-table tbody td");
    if (!td) return;
    if (isInteractiveElement(e.target)) return;

    highlightAndSelectCell(td, e);
  }, true);

  // Global Ctrl+C / Clipboard listener to guarantee cell text copying
  document.addEventListener("copy", function(e) {
    const sel = window.getSelection();
    const selStr = sel ? sel.toString().trim() : "";
    if (selStr) return; // User has standard selection, let default browser copy handle it

    const activeCell = document.querySelector("td.c1-cell-active");
    if (activeCell) {
      const inp = activeCell.querySelector("input:not([type='checkbox']), textarea");
      const titleEl = activeCell.querySelector(".oa-row-title, .c1-cell-text, .row-title");
      const textToCopy = inp ? inp.value : (titleEl ? titleEl.textContent.trim() : (activeCell.innerText.trim() || window.lastActive1cCellText));
      if (textToCopy && e.clipboardData) {
        e.clipboardData.setData("text/plain", textToCopy);
        e.preventDefault();
        console.log("[1C CLIPBOARD] Copied active cell text:", textToCopy);
      }
    }
  });

  // Expose helper globally
  window.highlight1cCell = highlightAndSelectCell;
})();
