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
      target.closest("input[type='checkbox']") ||
      target.closest("input[type='radio']") ||
      target.closest(".window-btn-close") ||
      target.closest(".mdi-dropdown-entry")
    );
  }

  function highlightAndSelectCell(td, event) {
    if (!td || isInteractiveElement(event ? event.target : null)) return;

    const tr = td.closest("tr");
    if (!tr) return;
    const tbody = tr.closest("tbody") || tr.parentElement;
    if (!tbody) return;

    // 1. Remove previous highlights in this table/container
    const prevCells = tbody.querySelectorAll("td.c1-cell-active, td.uj-cell-active, td.sde-cell-active, td.pde-cell-active");
    prevCells.forEach(c => {
      c.classList.remove("c1-cell-active", "uj-cell-active", "sde-cell-active", "pde-cell-active");
      c.style.removeProperty("background-color");
      c.style.removeProperty("background");
      c.style.removeProperty("color");
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
      r.style.removeProperty("background-color");
      r.style.removeProperty("background");
      r.style.removeProperty("color");
      r.querySelectorAll("td").forEach(c => {
        c.style.removeProperty("background-color");
        c.style.removeProperty("background");
        c.style.removeProperty("color");
      });
    });

    // 2. Highlight Row in Light Blue (#dceaf7)
    tr.classList.add("c1-row-selected");
    tr.style.backgroundColor = "#dceaf7";
    tr.style.color = "#111111";
    tr.querySelectorAll("td").forEach(c => {
      c.style.backgroundColor = "#dceaf7";
      c.style.color = "#111111";
    });

    // 3. Highlight Clicked Cell in Solid 1C Blue (#316ac5) with White Text
    td.classList.add("c1-cell-active");
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
      cellText = td.innerText.trim();
      try {
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(td);
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
      const textToCopy = inp ? inp.value : (activeCell.innerText.trim() || window.lastActive1cCellText);
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
