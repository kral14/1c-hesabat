/* ========================================================
   1C:ENTERPRISE VALUE LIST CONTROLLER (СписокЗначений)
   value_list_modal.js (Screenshot 2 - Редактирование списка значений)
   ======================================================== */

const ValueListModal = {
  targetInput: null,
  catalog: "Номенклатура",
  items: [],
  selectedIndex: 0,

  open(options = {}) {
    this.targetInput = options.targetInput || null;
    this.catalog = options.catalog || "Номенклатура";
    this.items = [];

    // Parse existing comma- or semicolon-separated string from input
    if (this.targetInput && this.targetInput.value.trim()) {
      const raw = this.targetInput.value.trim();
      this.items = raw.split(/[;,]/).map(s => s.trim()).filter(Boolean);
    }

    this.selectedIndex = 0;
    this.render();

    console.log(`[VALUE LIST OPEN] catalog="${this.catalog}", items=${this.items.length}`);

    if (window.MdiManager) {
      MdiManager.activateWindow("valueListModalOverlay", {
        title: "Список значений: " + this.catalog,
        icon: "📋",
        closeFn: () => ValueListModal.close()
      });
    } else {
      const overlay = document.getElementById("valueListModalOverlay");
      if (overlay) {
        overlay.style.display = "flex";
        overlay.classList.add("active");
      }
    }
  },

  close() {
    console.log("[VALUE LIST CLOSE] Closing value list modal");
    const overlay = document.getElementById("valueListModalOverlay");
    if (overlay) {
      overlay.classList.remove("active");
      overlay.style.display = "none";
    }
    if (window.MdiManager) {
      MdiManager.closeWindow("valueListModalOverlay");
    }
  },

  render() {
    const tbody = document.getElementById("valueListTbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (this.items.length === 0) {
      tbody.innerHTML = `<tr><td style="color: #888; font-style: italic; padding: 20px; text-align: center;">Siyahı boşdur.<br>[Подбор] və ya [+] düyməsi ilə soraqçadan əlavə edin.</td></tr>`;
      return;
    }

    this.items.forEach((item, idx) => {
      const tr = document.createElement("tr");
      tr.style.cursor = "pointer";
      if (idx === this.selectedIndex) tr.classList.add("selected");

      tr.onclick = () => {
        this.selectedIndex = idx;
        this.renderSelectionOnly();
      };

      tr.ondblclick = () => {
        this.openCatalogForRow(idx);
      };

      tr.innerHTML = `
        <td style="padding: 2px 6px; display: flex; align-items: center; justify-content: space-between; gap: 6px; user-select: none;">
          <div style="display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0;">
            <span style="color: #666; font-size: 10px; width: 18px; text-align: right;">${idx + 1}.</span>
            <span class="value-item-text" style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px;">${escapeHtml(item)}</span>
          </div>
          <button class="filter-btn-pick" style="padding: 0 6px; height: 19px; min-width: 24px; font-weight: bold; cursor: pointer; border: 1px solid #7f9db9; background: #ece9d8;" onclick="event.stopPropagation(); ValueListModal.openCatalogForRow(${idx})" title="Soraqçanı aç (...)">...</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  },

  renderSelectionOnly() {
    const tbody = document.getElementById("valueListTbody");
    if (!tbody) return;
    Array.from(tbody.children).forEach((tr, i) => {
      if (i === this.selectedIndex) tr.classList.add("selected");
      else tr.classList.remove("selected");
    });
  },

  addItem(val) {
    const clean = String(val || "").trim();
    if (!clean) return;
    if (!this.items.includes(clean)) {
      this.items.push(clean);
      this.selectedIndex = this.items.length - 1;
      this.render();
    }
  },

  setItem(idx, val) {
    const clean = String(val || "").trim();
    if (!clean) return;
    if (idx >= 0 && idx < this.items.length) {
      this.items[idx] = clean;
      this.selectedIndex = idx;
      this.render();
    } else {
      this.addItem(clean);
    }
  },

  // Open CatalogSelector for adding a new item/folder [+]
  openCatalogForNew() {
    console.log(`[VALUE LIST -> CATALOG (+)] Opening catalog "${this.catalog}" to add new item`);
    CatalogSelector.open({
      catalog: this.catalog,
      multiSelect: false,
      podborMode: false,
      onSelect: (selectedItem) => {
        if (selectedItem && selectedItem.name) {
          this.addItem(selectedItem.name);
        }
      }
    });
  },

  // Open CatalogSelector for a specific row [...] or double-click
  openCatalogForRow(idx) {
    this.selectedIndex = idx;
    this.renderSelectionOnly();
    console.log(`[VALUE LIST -> CATALOG (...)] Opening catalog "${this.catalog}" for row ${idx}`);
    CatalogSelector.open({
      catalog: this.catalog,
      multiSelect: false,
      podborMode: false,
      onSelect: (selectedItem) => {
        if (selectedItem && selectedItem.name) {
          this.setItem(idx, selectedItem.name);
        }
      }
    });
  },

  // Edit selected row (opens CatalogSelector)
  editSelected() {
    if (this.items.length === 0) {
      this.openCatalogForNew();
      return;
    }
    this.openCatalogForRow(this.selectedIndex);
  },

  // "Подбор" Button (Screenshot 2) - opens catalog in multi-pick mode
  openPodbor() {
    console.log(`[VALUE LIST -> CATALOG (ПОДБОР)] Opening catalog "${this.catalog}" in podbor mode`);
    CatalogSelector.open({
      catalog: this.catalog,
      multiSelect: true,
      podborMode: true,
      onSelect: (selectedItem) => {
        if (selectedItem && selectedItem.name) {
          this.addItem(selectedItem.name);
        }
      }
    });
  },

  duplicateSelected() {
    if (this.items.length === 0) return;
    const cur = this.items[this.selectedIndex];
    if (cur) {
      this.items.splice(this.selectedIndex + 1, 0, cur);
      this.selectedIndex += 1;
      this.render();
    }
  },

  removeSelected() {
    if (this.items.length === 0) return;
    this.items.splice(this.selectedIndex, 1);
    if (this.selectedIndex >= this.items.length) {
      this.selectedIndex = Math.max(0, this.items.length - 1);
    }
    this.render();
  },

  clearAll() {
    if (confirm("Bütün siyahını təmizləmək istəyirsiniz?")) {
      this.items = [];
      this.selectedIndex = 0;
      this.render();
    }
  },

  applyAndClose() {
    const joined = this.items.join("; ");
    if (this.targetInput) {
      this.targetInput.value = joined;
      this.targetInput.dispatchEvent(new Event("input", { bubbles: true }));
      this.targetInput.dispatchEvent(new Event("change", { bubbles: true }));
      if (typeof hideAllAutocomplete === "function") hideAllAutocomplete();
    }
    this.close();
  },

  toggleMaximize() {
    const win = document.getElementById("valueListWindowModal");
    if (!win) return;
    const isMax = win.classList.toggle("maximized");
    const maxBtn = win.querySelector(".window-btn-sys");
    if (maxBtn) {
      maxBtn.textContent = isMax ? "❐" : "□";
      maxBtn.title = isMax ? "Bərpa et" : "Böyüt";
    }
  }
};
