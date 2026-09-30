/* ========================================================
   1C:ENTERPRISE UNIVERSAL REPORT - FIELD SELECTOR LOGIC
   field_selector.js (Screenshot 3 - Выбор поля)
   ======================================================== */

const FieldSelector = {
  currentCallback: null,
  selectedFieldName: "",

  open(currentValue, callback) {
    this.currentCallback = callback;
    this.selectedFieldName = currentValue || "";

    const overlay = document.getElementById("fieldSelectorModalOverlay");
    if (overlay) {
      overlay.style.display = "flex";
      overlay.classList.add("active");
      if (window.MdiManager && typeof MdiManager.bringModalToFront === "function") {
        MdiManager.bringModalToFront(overlay, {
          title: "Выбор поля",
          icon: "🏷️",
          closeFn: () => FieldSelector.close()
        });
      }
    }

    const tree = document.getElementById("fieldSelectorTree");
    if (tree) {
      tree.querySelectorAll(".fp-row").forEach(r => r.classList.remove("selected"));
      if (this.selectedFieldName) {
        const rows = tree.querySelectorAll(".fp-row");
        for (const r of rows) {
          const label = r.querySelector(".fp-label")?.textContent.trim();
          if (label === this.selectedFieldName) {
            r.classList.add("selected");
            // Expand any collapsed parent nodes
            let p = r.parentElement;
            while (p && p !== tree) {
              if (p.classList.contains("fp-children")) {
                p.style.display = "block";
                const prev = p.previousElementSibling;
                const exp = prev?.querySelector(".fp-expander");
                if (exp) exp.textContent = "-";
              }
              p = p.parentElement;
            }
            r.scrollIntoView({ block: "nearest" });
            break;
          }
        }
      }
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
