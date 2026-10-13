/* ========================================================
   1C:ENTERPRISE UNIVERSAL REPORT - FIELD SELECTOR LOGIC
   field_selector.js (Screenshot 3 - Выбор поля)
   ======================================================== */

window.FieldSelector = {
  currentCallback: null,
  selectedFieldName: "",

  open(currentValue, callback) {
    if (typeof currentValue === "function") {
      this.currentCallback = currentValue;
      this.selectedFieldName = "";
    } else {
      this.currentCallback = callback;
      this.selectedFieldName = (typeof currentValue === "string") ? currentValue.trim() : "";
    }

    const overlay = document.getElementById("fieldSelectorModalOverlay");
    if (overlay) {
      overlay.style.display = "flex";
      overlay.classList.add("active");
      const topZ = Math.max(100500, (window.MdiManager?.topZIndex || 100) + 500);
      overlay.style.setProperty("z-index", String(topZ), "important");
      if (window.MdiManager && typeof MdiManager.bringModalToFront === "function") {
        MdiManager.bringModalToFront(overlay, {
          title: "Выбор поля",
          icon: "🏷️",
          closeFn: () => FieldSelector.close()
        });
      }
      overlay.style.setProperty("z-index", String(topZ), "important");
    }

    const tree = document.getElementById("fieldSelectorTree");
    if (tree) {
      tree.querySelectorAll(".fp-row").forEach(r => r.classList.remove("selected"));
      let targetRow = null;
      if (this.selectedFieldName) {
        const rows = tree.querySelectorAll(".fp-row");
        for (const r of rows) {
          const label = r.querySelector(".fp-label")?.textContent.trim();
          if (label === this.selectedFieldName) {
            targetRow = r;
            break;
          }
        }
      }
      if (!targetRow) {
        targetRow = tree.querySelector(".fp-row");
        if (targetRow) {
          const match = targetRow.getAttribute("onclick")?.match(/onFieldNodeClick\(this,\s*['"]([^'"]+)['"]\)/);
          this.selectedFieldName = match ? match[1] : (targetRow.querySelector(".fp-label")?.textContent.trim() || "Контрагент");
        }
      }
      if (targetRow) {
        targetRow.classList.add("selected");
        // Expand any collapsed parent nodes
        let p = targetRow.parentElement;
        while (p && p !== tree) {
          if (p.classList.contains("fp-children")) {
            p.style.display = "block";
            const prev = p.previousElementSibling;
            const exp = prev?.querySelector(".fp-expander");
            if (exp) exp.textContent = "-";
          }
          p = p.parentElement;
        }
        targetRow.scrollIntoView({ block: "nearest" });
      }
    }

    // Keyboard navigation (Enter / Escape)
    if (!this._keyHandler) {
      this._keyHandler = (e) => {
        const ov = document.getElementById("fieldSelectorModalOverlay");
        if (!ov || ov.style.display === "none") return;
        if (e.key === "Enter") {
          e.preventDefault();
          FieldSelector.confirm();
        } else if (e.key === "Escape") {
          e.preventDefault();
          FieldSelector.close();
        }
      };
      document.addEventListener("keydown", this._keyHandler);
    }
  },

  close() {
    const overlay = document.getElementById("fieldSelectorModalOverlay");
    if (overlay) {
      overlay.classList.remove("active");
      overlay.style.display = "none";
    }
    if (window.MdiManager && typeof MdiManager.removeModalTaskbarTab === "function") {
      MdiManager.removeModalTaskbarTab("fieldSelectorModalOverlay");
    }
    if (this._keyHandler) {
      document.removeEventListener("keydown", this._keyHandler);
      this._keyHandler = null;
    }
    this.currentCallback = null;
  },

  select(fieldName) {
    this.selectedFieldName = fieldName;
  },

  confirm() {
    if (!this.selectedFieldName) {
      alert("Zəhmət olmasa bir sahə seçin.");
      return;
    }
    if (typeof this.currentCallback === "function") {
      this.currentCallback(this.selectedFieldName);
    }
    this.close();
  }
};
var FieldSelector = window.FieldSelector;

function toggleFieldNode(e, expander) {
  e.stopPropagation();
  const parentNode = expander.closest(".fp-node");
  if (!parentNode) return;
  const children = parentNode.querySelector(".fp-children");
  if (!children) return;

  if (children.style.display === "none") {
    children.style.display = "block";
    expander.textContent = "-";
  } else {
    children.style.display = "none";
    expander.textContent = "+";
  }
}

function onFieldNodeClick(rowEl, fieldName) {
  const tree = document.getElementById("fieldSelectorTree");
  if (tree) {
    tree.querySelectorAll(".fp-row").forEach(r => r.classList.remove("selected"));
  }
  rowEl.classList.add("selected");
  FieldSelector.select(fieldName);
}

function confirmFieldSelection() {
  FieldSelector.confirm();
}

function closeFieldSelectorModal() {
  FieldSelector.close();
}

function toggleFieldSelectorMaximize() {
  const win = document.getElementById("fieldSelectorWindow");
  if (!win) return;
  const isMax = win.classList.toggle("maximized");
  const maxBtn = win.querySelector(".window-btn-sys");
  if (maxBtn) {
    maxBtn.textContent = isMax ? "❐" : "□";
    maxBtn.title = isMax ? "Bərpa et" : "Böyüt";
  }
}
