/* ========================================================
   1C:ENTERPRISE UNIVERSAL CATALOG SELECTOR CONTROLLER
   catalog_selector.js (Screenshot 2 - Справочник)
   ======================================================== */

const CatalogSelector = {
  currentCatalog: "Номенклатура",
  currentFolder: "",
  targetInput: null,
  onSelectCallback: null,
  multiSelect: false,
  podborMode: false,
  podborCount: 0,
  selectedItem: null,
  isMaximized: false,
  isMinimized: false,

  open(options = {}) {
    this.currentCatalog = options.catalog || "Номенклатура";
    this.targetInput = options.targetInput || null;
    this.onSelectCallback = options.onSelect || null;
    this.multiSelect = options.multiSelect || false;
    this.podborMode = options.podborMode || false;
    this.podborCount = 0;
    this.currentFolder = "";
    this.selectedItem = null;

    const win = document.getElementById("catalogWindowModal");
    if (!win) return;

    const titleEl = document.getElementById("catalogWindowTitle");
    const iconEl = document.getElementById("catalogWindowIcon");
    const rootLabel = document.getElementById("catalogTreeRootLabel");
    const stockPane = document.getElementById("catalogStockPane");
    const colArtikul = document.getElementById("colArtikulHeader");
    const btnSelectFolder = document.getElementById("btnSelectCurrentFolder");
    const banner = document.getElementById("catalogPodborBanner");
    const podborCountEl = document.getElementById("catalogPodborCount");

    const isWarehouse = this.currentCatalog === "Склады" || this.currentCatalog === "Склад";
    const isPriceTypes = this.currentCatalog === "ТипыЦенНоменклатуры";
    const catIcon = isWarehouse ? "🏢" : (isPriceTypes ? "🏷️" : "📋");
    const catTitle = isWarehouse ? "Справочник: Склады" : (isPriceTypes ? "Справочник: Типы цен" : "Справочник: Номенклатура");
    const fullTitle = catTitle + (this.podborMode ? " (Подбор)" : "");

    if (titleEl) titleEl.textContent = fullTitle;
    if (iconEl) iconEl.textContent = catIcon;
    if (rootLabel) rootLabel.textContent = this.currentCatalog;
    if (btnSelectFolder) btnSelectFolder.style.display = "none";

    if (banner) {
      banner.style.display = this.podborMode ? "flex" : "none";
      if (podborCountEl) podborCountEl.textContent = "Seçilən: 0";
    }

    // Show stock pane only for Nomenklatura
    if (stockPane) {
      stockPane.style.display = this.currentCatalog === "Номенклатура" ? "flex" : "none";
    }

    if (colArtikul) {
      colArtikul.style.display = this.currentCatalog === "Номенклатура" ? "" : "none";
    }

    console.log(`[CATALOG OPEN] catalog="${this.currentCatalog}", podborMode=${this.podborMode}, multiSelect=${this.multiSelect}`);

    // MDI Window registration & activation
    const mdi = window.MdiManager || (typeof MdiManager !== "undefined" ? MdiManager : null);
    if (mdi && typeof mdi.activateWindow === "function") {
      let winObj = mdi.windows["catalogWindowModal"];
      if (!winObj) {
        mdi.registerWindow("catalogWindowModal", {
          title: fullTitle,
          icon: catIcon,
          element: win,
          isDefault: true,
          isDialog: true,
          closeFn: () => CatalogSelector.close()
        });
        winObj = mdi.windows["catalogWindowModal"];
      } else {
        winObj.title = fullTitle;
        winObj.icon = catIcon;
      }

      // Center nicely inside workspace if not positioned yet
      const ws = document.getElementById("mdiWorkspace");
      if (ws) {
        const wsW = ws.clientWidth || window.innerWidth;
        const wsH = ws.clientHeight || window.innerHeight;
        const targetW = Math.min(960, Math.max(500, wsW - 40));
        const targetH = Math.min(620, Math.max(380, wsH - 40));
        win.style.width = `${targetW}px`;
        win.style.height = `${targetH}px`;
        const left = Math.max(15, Math.floor((wsW - targetW) / 2) + 20);
        const top = Math.max(15, Math.floor((wsH - targetH) / 2) + 20);
        win.style.left = `${left}px`;
        win.style.top = `${top}px`;
      }

      mdi.activateWindow("catalogWindowModal", {
        title: fullTitle,
        icon: catIcon,
        closeFn: () => CatalogSelector.close()
      });
    } else {
      win.style.display = "flex";
      win.classList.remove("minimized");
      win.classList.add("active");
    }

    // Ensure catalogWindowModal is visually in front of any active overlay (e.g. valueListModalOverlay)
    const valOverlay = document.getElementById("valueListModalOverlay");
    if (valOverlay) {
      const overZ = parseInt(valOverlay.style.zIndex) || 100;
      const curZ = parseInt(win.style.zIndex) || 100;
      if (curZ <= overZ) {
        win.style.zIndex = overZ + 15;
        if (mdi && mdi.topZIndex <= overZ + 15) {
          mdi.topZIndex = overZ + 15;
        }
      }
    }

    // Load Folders & Items
    this.loadCatalogData();
  },

  close(e) {
    if (e && typeof e.stopPropagation === "function") {
      e.stopPropagation();
    }
    console.log(`[CATALOG CLOSE] Closing catalog "${this.currentCatalog}"`);
    this.podborMode = false;
    this.podborCount = 0;

    if (window.MdiManager) {
      MdiManager.closeWindow("catalogWindowModal");
    } else {
      const win = document.getElementById("catalogWindowModal");
      if (win) {
        win.style.display = "none";
        win.classList.add("minimized");
        win.classList.remove("active");
      }
      const tab = document.getElementById("tab-catalogWindowModal");
      if (tab) tab.remove();
    }
  },

  toggleMaximize() {
    if (window.MdiManager) {
      MdiManager.toggleMaximize("catalogWindowModal");
    }
  },

  toggleMinimize() {
    if (window.MdiManager) {
      MdiManager.minimizeWindow("catalogWindowModal");
    }
  },

  abortController: null,

  cancel() {
    if (this.abortController) {
      try { this.abortController.abort(); } catch (e) {}
      this.abortController = null;
    }
    const itemsBody = document.getElementById("catalogItemsBody");
    if (itemsBody) {
      itemsBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #b71c1c; padding: 20px;">⏹ Sorğu dayandırıldı (Pause).</td></tr>`;
    }
  },

  async loadCatalogData(searchQuery = "") {
    const treeList = document.getElementById("catalogTreeList");
    const itemsBody = document.getElementById("catalogItemsBody");

    if (itemsBody) {
      itemsBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #888; padding: 20px;">1C: Məlumatlar yüklənir...</td></tr>`;
    }

    if (this.abortController) {
      try { this.abortController.abort(); } catch (e) {}
    }
    this.abortController = new AbortController();

    try {
      const creds = SessionManager.getCredentials();
      const payload = {
        ...creds,
        catalog: this.currentCatalog,
        folder: this.currentFolder,
        search: searchQuery
      };

      const res = await fetch("/api/catalog_data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: this.abortController.signal
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Məlumat yüklənmədi");
      }

      this.renderFolders(data.folders || []);
      this.renderItems(data.items || []);

    } catch (err) {
      if (err.name === "AbortError") {
        console.log("[CATALOG ABORTED] Catalog data fetch aborted.");
        return;
      }
      if (itemsBody) {
        itemsBody.innerHTML = `<tr><td colspan="6" style="color: red; padding: 20px; text-align: center;">Xəta: ${err.message}</td></tr>`;
      }
    } finally {
      this.abortController = null;
    }
  },

  renderFolders(folders) {
    const treeList = document.getElementById("catalogTreeList");
    if (!treeList) return;

    // Preserve root
    const rootHtml = `
      <li class="catalog-tree-item ${!this.currentFolder ? 'selected' : ''}" onclick="CatalogSelector.selectFolder(this, '')">
        <span>📁</span>
        <span>${this.currentCatalog}</span>
      </li>
    `;

    const subHtml = folders.map(f => `
      <li class="catalog-tree-item ${this.currentFolder === f.name ? 'selected' : ''}" onclick="CatalogSelector.selectFolder(this, '${escapeHtml(f.name)}')">
        <span style="padding-left: 14px;">📁</span>
        <span>${escapeHtml(f.name)}</span>
      </li>
    `).join("");

    treeList.innerHTML = rootHtml + subHtml;
  },

  renderItems(items) {
    const tbody = document.getElementById("catalogItemsBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #888; padding: 20px;">Heç bir element tapılmadı.</td></tr>`;
      return;
    }

    const isNom = this.currentCatalog === "Номенклатура";

    items.forEach((item, idx) => {
      const tr = document.createElement("tr");
      tr.dataset.name = item.name;
      tr.dataset.code = item.code;
      tr.dataset.isFolder = item.is_folder ? "true" : "false";

      tr.onclick = () => this.highlightItem(tr, item);
      tr.ondblclick = () => {
        if (item.is_folder) {
          this.currentFolder = item.name;
          this.loadCatalogData();
          this.updateFolderButton();
        } else {
          this.confirmSelection();
        }
      };

      const icon = item.is_folder ? "📁" : "📄";
      const artikulCell = isNom ? `<td style="font-family: monospace;">${escapeHtml(item.artikul || "")}</td>` : "";

      const folderPickBtn = item.is_folder ? `
        <button class="btn-1c" style="margin-left: 6px; padding: 0 6px; font-size: 10px; height: 18px; border: 1px solid #316ac5; color: #004080; background: #eef6ff;" onclick="event.stopPropagation(); CatalogSelector.selectItemDirectly(${escapeAttrJson(item)})" title="Bu qovluğu süzgəcə seç">
          ✔ Seç
        </button>
      ` : "";

      tr.innerHTML = `
        <td style="text-align: center; width: 30px;">${icon}</td>
        <td style="font-family: monospace; width: 100px;">${escapeHtml(item.code || "")}</td>
        ${artikulCell}
        <td style="font-weight: ${item.is_folder ? 'bold' : 'normal'};">
          <span>${escapeHtml(item.name || "")}</span>
          ${folderPickBtn}
        </td>
        <td style="width: 100px; color: #555;">${escapeHtml(item.vid_nom || (item.is_folder ? 'Qrup' : 'Element'))}</td>
        <td style="width: 80px; color: #555;">${escapeHtml(item.unit || "əd")}</td>
      `;

      tbody.appendChild(tr);
    });
  },

  selectFolder(el, folderName) {
    const tree = document.getElementById("catalogTreeContainer");
    if (tree) {
      tree.querySelectorAll(".catalog-tree-item").forEach(i => i.classList.remove("selected"));
    }
    el.classList.add("selected");
    this.currentFolder = folderName;
    this.selectedItem = folderName ? { name: folderName, is_folder: true, code: "" } : null;
    this.updateFolderButton();
    this.loadCatalogData();
  },

  updateFolderButton() {
    const btnSelectFolder = document.getElementById("btnSelectCurrentFolder");
    const btnFolderText = document.getElementById("btnSelectCurrentFolderText");
    const label = document.getElementById("catalogSelectedLabel");

    if (this.currentFolder) {
      if (btnSelectFolder) btnSelectFolder.style.display = "inline-flex";
      if (btnFolderText) btnFolderText.textContent = `📁 Выбрать папку: ${this.currentFolder}`;
      if (label) label.textContent = `📁 [Qrup]: ${this.currentFolder}`;
    } else {
      if (btnSelectFolder) btnSelectFolder.style.display = "none";
      if (label) label.textContent = this.currentCatalog;
    }
  },

  confirmCurrentFolder() {
    if (!this.currentFolder) return;
    this.selectedItem = { name: this.currentFolder, is_folder: true, code: "" };
    this.confirmSelection();
  },

  selectItemDirectly(item) {
    this.selectedItem = item;
    this.confirmSelection();
  },

  highlightItem(tr, item) {
    const tbody = document.getElementById("catalogItemsBody");
    if (tbody) {
      tbody.querySelectorAll("tr").forEach(r => r.classList.remove("selected"));
    }
    tr.classList.add("selected");
    this.selectedItem = item;

    const label = document.getElementById("catalogSelectedLabel");
    const previewTitle = document.getElementById("catalogSelectedPreviewTitle");
    const btnText = document.getElementById("btnCatalogSelectText");

    const prefix = item.is_folder ? "📁 [Qrup] " : "";
    if (label) label.textContent = `${prefix}${item.code ? '[' + item.code + '] ' : ''}${item.name}`;
    if (previewTitle) previewTitle.textContent = `Seçilmiş: ${item.name}`;
    if (btnText) btnText.textContent = item.is_folder ? "Выбрать папку" : "Выбрать";

    // Update demo stock numbers
    const totStock = document.getElementById("previewStockTotal");
    const freeStock = document.getElementById("previewStockFree");
    const genceStock = document.getElementById("previewStockGence");
    const genceFree = document.getElementById("previewStockGenceFree");

    if (totStock) totStock.textContent = "120.00";
    if (freeStock) freeStock.textContent = "120.00";
    if (genceStock) genceStock.textContent = "45.00";
    if (genceFree) genceFree.textContent = "45.00";
  },

  confirmSelection(finishPodbor = false) {
    if (!this.selectedItem && !this.currentFolder && !finishPodbor) {
      alert("Zəhmət olmasa bir element və ya qrup seçin.");
      return;
    }

    if (this.selectedItem || this.currentFolder) {
      if (!this.selectedItem && this.currentFolder) {
        this.selectedItem = { name: this.currentFolder, is_folder: true, code: "" };
      }
      const chosenVal = this.selectedItem.name;

      if (this.targetInput) {
        if (this.multiSelect && this.targetInput.value.trim()) {
          const cur = this.targetInput.value.trim();
          const existing = cur.split(/[;,]/).map(s => s.trim());
          if (!existing.includes(chosenVal)) {
            this.targetInput.value = `${cur}; ${chosenVal}`;
          }
        } else {
          this.targetInput.value = chosenVal;
        }
        this.targetInput.dispatchEvent(new Event("input", { bubbles: true }));
        this.targetInput.dispatchEvent(new Event("change", { bubbles: true }));
        if (typeof hideAllAutocomplete === "function") hideAllAutocomplete();
      }

      if (typeof this.onSelectCallback === "function") {
        this.onSelectCallback(this.selectedItem);
      }
      if (typeof hideAllAutocomplete === "function") hideAllAutocomplete();

      // In Podbor mode, if not explicitly finishing, stay open and show feedback
      if (this.podborMode && !finishPodbor) {
        this.podborCount += 1;
        const podborCountEl = document.getElementById("catalogPodborCount");
        if (podborCountEl) podborCountEl.textContent = `Seçilən: ${this.podborCount} ədəd (Ən son: ${chosenVal})`;
        
        // Visual feedback toast
        const label = document.getElementById("catalogSelectedLabel");
        if (label) {
          const old = label.textContent;
          label.textContent = `✔ Əlavə edildi: ${chosenVal}`;
          label.style.color = "#2e7d32";
          setTimeout(() => {
            label.textContent = old;
            label.style.color = "";
          }, 1500);
        }
        return;
      }
    }

    this.close();
  },

  search() {
    const input = document.getElementById("catalogSearchInput");
    const query = input ? input.value.trim() : "";
    this.loadCatalogData(query);
  },

  clearSearch() {
    const input = document.getElementById("catalogSearchInput");
    if (input) input.value = "";
    this.loadCatalogData("");
  },

  reload() {
    this.loadCatalogData();
  }
};

window.CatalogSelector = CatalogSelector;

if (typeof escapeHtml !== "function") {
  window.escapeHtml = function(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };
}

function escapeAttrJson(obj) {
  return JSON.stringify(obj).replace(/"/g, "&quot;");
}
