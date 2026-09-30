/* ========================================================
   1C:ENTERPRISE VALUE LIST CONTROLLER (СписокЗначений)
   value_list_modal.js (Screenshot 2 - Редактирование списка значений)
   ======================================================== */

const ValueListModal = {
  targetInput: null,
  catalog: "Номенклатура",
  items: [],
  selectedIndex: -1,
  editingIndex: -1,

  open(options = {}) {
    this.targetInput = options.targetInput || null;
    this.catalog = options.catalog || "Номенклатура";
    this.items = [];
    this.editingIndex = -1;

    // Parse existing comma- or semicolon-separated string from input
    if (this.targetInput && this.targetInput.value.trim()) {
      const raw = this.targetInput.value.trim();
      this.items = raw.split(/[;,]/).map(s => s.trim()).filter(Boolean);
    }

    this.selectedIndex = this.items.length > 0 ? 0 : -1;
    this.render();

    console.log(`[VALUE LIST OPEN] catalog="${this.catalog}", items=${this.items.length}`);

    const mdi = window.MdiManager || (typeof MdiManager !== "undefined" ? MdiManager : null);
    if (mdi && typeof mdi.activateWindow === "function") {
      mdi.activateWindow("valueListModalOverlay", {
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
    this.editingIndex = -1;
    const overlay = document.getElementById("valueListModalOverlay");
    if (overlay) {
      overlay.classList.remove("active");
      overlay.style.display = "none";
    }
    const mdi = window.MdiManager || (typeof MdiManager !== "undefined" ? MdiManager : null);
    if (mdi && typeof mdi.closeWindow === "function") {
      mdi.closeWindow("valueListModalOverlay");
    }
  },

  render() {
    const tbody = document.getElementById("valueListTbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (this.items.length === 0) {
      tbody.innerHTML = `<tr><td style="color: #888; font-style: italic; padding: 25px 15px; text-align: center; user-select: none;">Siyahı boşdur.<br><br>Sətir yazmaq üçün <strong>[+]</strong> düyməsini basın,<br>və ya soraqçadan çoxsaylı seçmək üçün <strong>[Подбор]</strong> düyməsini basın.</td></tr>`;
      return;
    }

    this.items.forEach((item, idx) => {
      const tr = document.createElement("tr");
      tr.style.cursor = "pointer";
      if (idx === this.selectedIndex) tr.classList.add("selected");

      tr.onclick = (e) => {
        if (e.target.tagName === "INPUT" || e.target.classList.contains("filter-btn-pick")) return;
        this.selectedIndex = idx;
        this.renderSelectionOnly();
      };

      tr.ondblclick = (e) => {
        if (e.target.tagName === "INPUT" || e.target.classList.contains("filter-btn-pick")) return;
        this.startEdit(idx);
      };

      const isEditing = (this.editingIndex === idx);

      const contentHtml = isEditing ? `
        <input type="text" id="valItemInput_${idx}" class="value-item-inline-input" value="${escapeHtml(item)}" 
               style="flex: 1; height: 20px; font-size: 11px; padding: 1px 4px; border: 1px solid #316ac5; outline: none; background: #ffffff;"
               onkeydown="ValueListModal.handleInputKeydown(event, ${idx})"
               onblur="ValueListModal.commitEdit(${idx}, this.value)">
      ` : `
        <span class="value-item-text" style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; ${!item ? 'color: #999; font-style: italic;' : ''}">
          ${item ? escapeHtml(item) : '(dəyər daxil edin və ya [...] basın)'}
        </span>
      `;

      tr.innerHTML = `
        <td style="padding: 2px 6px; display: flex; align-items: center; justify-content: space-between; gap: 6px; min-height: 24px;">
          <div style="display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0;">
            <span style="color: #666; font-size: 10px; width: 20px; text-align: right; flex-shrink: 0;">${idx + 1}.</span>
            ${contentHtml}
          </div>
          <button class="filter-btn-pick" style="padding: 0 6px; height: 20px; min-width: 24px; font-weight: bold; cursor: pointer; border: 1px solid #7f9db9; background: #ece9d8; flex-shrink: 0;" onclick="event.stopPropagation(); ValueListModal.openCatalogForRow(${idx})" title="Soraqçanı aç (...)">...</button>
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

  // [+] Add new row directly into the list (Tələb 1: "burda pulus edende setir elave etmelidir")
  addNewRow() {
    console.log("[VALUE LIST] Adding new blank row to the list");
    this.items.push("");
    this.selectedIndex = this.items.length - 1;
    this.editingIndex = this.selectedIndex;
    this.render();

    setTimeout(() => {
      const inp = document.getElementById(`valItemInput_${this.selectedIndex}`);
      if (inp) {
        inp.focus();
        inp.select();
      }
    }, 40);
  },

  startEdit(idx) {
    if (idx < 0 || idx >= this.items.length) return;
    this.selectedIndex = idx;
    this.editingIndex = idx;
    this.render();

    setTimeout(() => {
      const inp = document.getElementById(`valItemInput_${idx}`);
      if (inp) {
        inp.focus();
        inp.select();
      }
    }, 40);
  },

  commitEdit(idx, val) {
    if (idx < 0 || idx >= this.items.length) return;
    const clean = String(val || "").trim();
    this.items[idx] = clean;
    this.editingIndex = -1;
    this.render();
  },

  cancelEdit(idx) {
    this.editingIndex = -1;
    // If it was newly added and still empty, clean it up
    if (this.items[idx] === "" && this.items.length > 1) {
      this.items.splice(idx, 1);
      this.selectedIndex = Math.max(0, this.items.length - 1);
    }
    this.render();
  },

  handleInputKeydown(e, idx) {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      const val = e.target.value;
      this.commitEdit(idx, val);
      // Automatically add next row for rapid data entry (1C standard behavior)
      this.addNewRow();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      this.cancelEdit(idx);
    }
  },

  handleKeydown(e) {
    if (this.editingIndex !== -1) return; // Typing in input

    if (e.key === "Insert") {
      e.preventDefault();
      this.addNewRow();
    } else if (e.key === "Delete") {
      e.preventDefault();
      this.removeSelected();
    } else if (e.key === "F2") {
      e.preventDefault();
      if (this.selectedIndex >= 0) this.startEdit(this.selectedIndex);
    } else if (e.key === "ArrowDown") {
      if (this.selectedIndex < this.items.length - 1) {
        e.preventDefault();
        this.selectedIndex++;
        this.renderSelectionOnly();
      }
    } else if (e.key === "ArrowUp") {
      if (this.selectedIndex > 0) {
        e.preventDefault();
        this.selectedIndex--;
        this.renderSelectionOnly();
      }
    }
  },

  addItem(val) {
    const clean = String(val || "").trim();
    if (!clean) return;
    // If the currently selected item is blank, replace it
    if (this.selectedIndex >= 0 && this.selectedIndex < this.items.length && this.items[this.selectedIndex] === "") {
      this.items[this.selectedIndex] = clean;
    } else if (!this.items.includes(clean)) {
      this.items.push(clean);
      this.selectedIndex = this.items.length - 1;
    }
    this.render();
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

  // Open CatalogSelector for a specific row [...] or double-click
  openCatalogForRow(idx) {
    this.selectedIndex = idx;
    this.editingIndex = -1;
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

  // Edit selected row
  editSelected() {
    if (this.items.length === 0) {
      this.addNewRow();
      return;
    }
    if (this.selectedIndex >= 0) {
      this.startEdit(this.selectedIndex);
    }
  },

  // "Подбор" Button (Tələb 2: "padbor ise birbasa hemin pencereni acmalidir")
  openPodbor() {
    console.log(`[VALUE LIST -> CATALOG (ПОДБОР)] Opening catalog "${this.catalog}" in podbor mode directly`);
    this.editingIndex = -1;
    this.render();

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
    if (this.items.length === 0 || this.selectedIndex < 0) return;
    const cur = this.items[this.selectedIndex];
    if (cur !== undefined) {
      this.items.splice(this.selectedIndex + 1, 0, cur);
      this.selectedIndex += 1;
      this.render();
    }
  },

  removeSelected() {
    if (this.items.length === 0 || this.selectedIndex < 0) return;
    this.items.splice(this.selectedIndex, 1);
    if (this.selectedIndex >= this.items.length) {
      this.selectedIndex = Math.max(0, this.items.length - 1);
    }
    this.editingIndex = -1;
    this.render();
  },

  clearAll() {
    if (this.items.length === 0) return;
    if (confirm("Bütün siyahını təmizləmək istəyirsiniz?")) {
      this.items = [];
      this.selectedIndex = -1;
      this.editingIndex = -1;
      this.render();
    }
  },

  applyAndClose() {
    // If currently editing, commit it first
    if (this.editingIndex >= 0) {
      const inp = document.getElementById(`valItemInput_${this.editingIndex}`);
      if (inp) {
        this.items[this.editingIndex] = inp.value.trim();
      }
    }
    // Filter out completely blank lines
    const validItems = this.items.filter(s => s.trim().length > 0);
    const joined = validItems.join("; ");
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

window.ValueListModal = ValueListModal;
