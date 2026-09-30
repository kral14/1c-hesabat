/* ========================================================
   1C:ENTERPRISE OPERATION TYPE SELECTOR CONTROLLER
   operation_type_modal.js
   ======================================================== */

const ONE_C_OPERATION_TYPES = [
  { name: "Покупка, комиссия", doc: "Поступление товаров и услуг", type: "Приход" },
  { name: "В переработку", doc: "Поступление товаров и услуг", type: "Приход" },
  { name: "Из переработки", doc: "Поступление товаров и услуг", type: "Приход" },
  { name: "Оборудование (поступление)", doc: "Поступление товаров и услуг", type: "Приход" },
  { name: "Объекты строительства", doc: "Поступление товаров и услуг", type: "Приход" },
  { name: "Оприходование товаров", doc: "Оприходование товаров", type: "Приход" },
  { name: "Возврат товаров от покупателя", doc: "Возврат товаров от покупателя", type: "Приход" },
  { name: "Продажа, комиссия", doc: "Реализация товаров и услуг", type: "Расход" },
  { name: "Отгрузка без перехода права собственности", doc: "Реализация товаров и услуг", type: "Расход" },
  { name: "Брак", doc: "Реализация / Списание", type: "Расход" },
  { name: "Оборудование (реализация)", doc: "Реализация товаров и услуг", type: "Расход" },
  { name: "Списание товаров", doc: "Списание товаров", type: "Расход" },
  { name: "Возврат товаров поставщику", doc: "Возврат товаров поставщику", type: "Расход" },
  { name: "Перемещение товаров", doc: "Перемещение товаров", type: "Склад" },
  { name: "Комплектация номенклатуры", doc: "Комплектация номенклатуры", type: "Склад" },
  { name: "Разукомплектация", doc: "Комплектация номенклатуры", type: "Склад" },
  { name: "Требование-накладная", doc: "Требование-накладная", type: "Расход" },
  { name: "Авансовый отчет", doc: "Авансовый отчет", type: "Приход" },
  { name: "Корректировка записей регистров", doc: "Корректировка записей регистров", type: "Ручная" }
];

const OperationTypeSelector = {
  targetInput: null,
  multiSelect: false,
  selectedNames: new Set(),
  currentFilter: "",

  open(options = {}) {
    this.targetInput = options.targetInput || null;
    this.multiSelect = options.multiSelect !== false;
    this.selectedNames.clear();

    if (this.targetInput && this.targetInput.value.trim()) {
      const parts = this.targetInput.value.split(/[;,]/).map(s => s.trim()).filter(Boolean);
      parts.forEach(p => this.selectedNames.add(p));
    }

    const searchInp = document.getElementById("opTypeSearchInput");
    if (searchInp) searchInp.value = "";
    this.currentFilter = "";

    const chkCol = document.getElementById("opTypeColChk");
    if (chkCol) chkCol.style.display = this.multiSelect ? "" : "none";

    this.render();

    const overlay = document.getElementById("operationTypeModalOverlay");
    if (overlay) {
      overlay.style.display = "flex";
      overlay.classList.add("active");
      if (window.MdiManager && typeof MdiManager.bringModalToFront === "function") {
        MdiManager.bringModalToFront(overlay, {
          title: "Вид операции",
          icon: "📑",
          closeFn: () => OperationTypeSelector.close()
        });
      }
    }

    if (searchInp) setTimeout(() => searchInp.focus(), 50);
  },

  close() {
    const overlay = document.getElementById("operationTypeModalOverlay");
    if (overlay) {
      overlay.classList.remove("active");
      overlay.style.display = "none";
    }
    if (window.MdiManager && typeof MdiManager.removeModalTaskbarTab === "function") {
      MdiManager.removeModalTaskbarTab("operationTypeModalOverlay");
    }
  },

  render() {
    const tbody = document.getElementById("operationTypeTbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    const q = this.currentFilter.toLowerCase();
    const filtered = ONE_C_OPERATION_TYPES.filter(it => {
      return !q || it.name.toLowerCase().includes(q) || it.doc.toLowerCase().includes(q) || it.type.toLowerCase().includes(q);
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: #888; padding: 20px; font-style: italic;">Heç bir əməliyyat tapılmadı.</td></tr>`;
      this.updateCount();
      return;
    }

    filtered.forEach((it, idx) => {
      const isSelected = this.selectedNames.has(it.name);
      const tr = document.createElement("tr");
      tr.style.cursor = "pointer";
      tr.style.borderBottom = "1px solid #f0eee2";
      if (isSelected) tr.style.background = "#fff8e6";

      tr.onclick = (e) => {
        if (e.target.tagName === "INPUT") return;
        if (this.multiSelect) {
          if (this.selectedNames.has(it.name)) this.selectedNames.delete(it.name);
          else this.selectedNames.add(it.name);
          this.render();
        } else {
          this.selectedNames.clear();
          this.selectedNames.add(it.name);
          this.confirm();
        }
      };

      tr.ondblclick = () => {
        this.selectedNames.clear();
        this.selectedNames.add(it.name);
        this.confirm();
      };

      const chkHtml = this.multiSelect
        ? `<td style="text-align: center; padding: 3px;"><input type="checkbox" ${isSelected ? "checked" : ""} onchange="OperationTypeSelector.toggleItem('${it.name}', this.checked)"></td>`
        : `<td style="display: none;"></td>`;

      const typeBadge = it.type === "Приход" ? `<span style="color: #2e7d32; font-weight: bold;">[+]</span>` :
                        it.type === "Расход" ? `<span style="color: #c62828; font-weight: bold;">[-]</span>` :
                        `<span style="color: #0277bd; font-weight: bold;">[⇄]</span>`;

      tr.innerHTML = `
        ${chkHtml}
        <td style="padding: 4px 6px; font-weight: ${isSelected ? 'bold' : 'normal'}; color: #222;">
          ${typeBadge} ${it.name}
        </td>
        <td style="padding: 4px 6px; color: #555; border-left: 1px solid #f0eee2;">
          📄 ${it.doc}
        </td>
      `;
      tbody.appendChild(tr);
    });

    this.updateCount();
  },

  toggleItem(name, checked) {
    if (checked) this.selectedNames.add(name);
    else this.selectedNames.delete(name);
    this.updateCount();
  },

  checkAll(checked) {
    ONE_C_OPERATION_TYPES.forEach(it => {
      if (checked) this.selectedNames.add(it.name);
      else this.selectedNames.delete(it.name);
    });
    this.render();
  },

  updateCount() {
    const el = document.getElementById("opTypeSelectedCount");
    if (el) {
      el.textContent = `Seçilmiş: ${this.selectedNames.size} əməliyyat növü`;
    }
  },

  filter(val) {
    this.currentFilter = (val || "").trim();
    this.render();
  },

  clearSearch() {
    const searchInp = document.getElementById("opTypeSearchInput");
    if (searchInp) searchInp.value = "";
    this.currentFilter = "";
    this.render();
  },

  confirm() {
    if (this.targetInput) {
      const arr = Array.from(this.selectedNames);
      this.targetInput.value = arr.join("; ");
      this.targetInput.dispatchEvent(new Event("input", { bubbles: true }));
      this.targetInput.dispatchEvent(new Event("change", { bubbles: true }));
    }
    this.close();
  },

  toggleMaximize() {
    const win = document.getElementById("operationTypeWindow");
    if (!win) return;
    const isMax = win.classList.toggle("maximized");
    const maxBtn = win.querySelector(".window-btn-sys");
    if (maxBtn) {
      maxBtn.textContent = isMax ? "❐" : "□";
      maxBtn.title = isMax ? "Bərpa et" : "Böyüt";
    }
  }
};
