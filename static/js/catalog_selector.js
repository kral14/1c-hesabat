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
    this.currentFolder = options.folder || "";
    this.parentFolder = "";
    this.selectedItem = null;

    // Item locate support
    this.locateCode = String(options.locate_code || options.code || "").trim();
    this.locateName = String(options.locate_name || options.name || "").trim();
    this.locateItem = String(options.locate_item || options.locate_val || "").trim();

    if (!this.locateCode && !this.locateName && !this.locateItem && this.targetInput && this.targetInput.value) {
      const rawVal = this.targetInput.value.trim();
      const val = rawVal.includes(";") ? rawVal.split(";").pop().trim() : rawVal;
      if (val) {
        this.locateItem = val;
      }
    }

    // The search box should contain the product's name/code as requested by the user
    this.initialSearch = String(options.search || this.locateName || this.locateItem || (this.targetInput ? this.targetInput.value : "") || "").trim();
    this.preserveTargetCode = this.locateCode || this.locateItem || "";

    // Multi-instance catalog windows support (Номенклатура, Склады və s. hər biri ayrı pəncərə və ayrı tabda açılır)
    const catSafe = String(this.currentCatalog).replace(/[^a-zA-Z0-9_\u0400-\u04FF]/g, "_");
    const winId = `catalogWin_${catSafe}`;
    let win = document.getElementById(winId);

    const baseWin = document.getElementById("catalogWindowModal");
    if (!win) {
      if (!baseWin) return;
      win = baseWin.cloneNode(true);
      win.id = winId;
      win.dataset.catalog = this.currentCatalog;
      win.dataset.folder = "";
      
      const existingWins = document.querySelectorAll(".mdi-window:not([style*='display: none'])").length;
      const offset = (existingWins * 25) % 180;
      win.style.top = `${30 + offset}px`;
      win.style.left = `${40 + offset}px`;
      win.style.display = "flex";
      document.getElementById("mdiWorkspace").appendChild(win);

      win.setAttribute("onmousedown", `MdiManager.activateWindow('${winId}')`);

      // Daxili düymələri unikal edirik
      const minBtn = win.querySelector(".mdi-win-btn-min");
      if (minBtn) {
        minBtn.removeAttribute("onclick");
        minBtn.onclick = (e) => { e.stopPropagation(); MdiManager.minimizeWindow(winId); };
      }
      const maxBtn = win.querySelector(".mdi-win-btn-max");
      if (maxBtn) {
        maxBtn.removeAttribute("onclick");
        maxBtn.onclick = (e) => { e.stopPropagation(); MdiManager.toggleMaximize(winId); };
      }
      const closeBtn = win.querySelector(".mdi-win-btn-close");
      if (closeBtn) {
        closeBtn.removeAttribute("onclick");
        closeBtn.onclick = (e) => {
          e.stopPropagation();
          MdiManager.closeWindow(winId);
          win.remove();
        };
      }
      const header = win.querySelector(".mdi-window-header");
      if (header) {
        header.removeAttribute("ondblclick");
        header.ondblclick = (e) => {
          if (e.target.closest(".mdi-win-btn, .window-btn-close")) return;
          MdiManager.toggleMaximize(winId);
        };
      }
    } else {
      win.dataset.catalog = this.currentCatalog;
    }

    const titleEl = win.querySelector(".mdi-win-title-text, #catalogWindowTitle");
    const iconEl = win.querySelector(".mdi-win-icon, #catalogWindowIcon");
    const rootLabel = win.querySelector("#catalogTreeRootLabel, .catalog-tree-root span:last-child");
    const stockPane = win.querySelector("#catalogStockPane, .catalog-bottom-pane");
    const colArtikul = win.querySelector("#colArtikulHeader");
    const btnSelectFolder = win.querySelector("#btnSelectCurrentFolder");
    const banner = win.querySelector("#catalogPodborBanner");
    const podborCountEl = win.querySelector("#catalogPodborCount");

    const catL = (this.currentCatalog || "").toLowerCase();
    let catTitle = "Справочник: " + this.currentCatalog;
    let catIcon = "📋";
    const isNomenclature = catL.includes("номенклатур") || catL.includes("məhsul") || catL.includes("tovar");

    if (catL.includes("тип") && catL.includes("цен")) {
      catTitle = "Справочник: Типы цен номенклатуры";
      catIcon = "🏷️";
    } else if (catL.includes("контрагент")) {
      catTitle = "Справочник: Контрагенты";
      catIcon = "👥";
    } else if (catL.includes("склад")) {
      catTitle = "Справочник: Склады";
      catIcon = "🏢";
    } else if (catL.includes("договор")) {
      catTitle = "Справочник: Договоры контрагентов";
      catIcon = "📄";
    } else if (catL.includes("пользовател") || catL.includes("ответственн")) {
      catTitle = "Справочник: Пользователи";
      catIcon = "👤";
    } else if (catL.includes("водит")) {
      catTitle = "Справочник: Водители";
      catIcon = "🚚";
    } else if (catL.includes("портфел")) {
      catTitle = "Справочник: Портфели";
      catIcon = "💼";
    } else if (isNomenclature) {
      catTitle = "Справочник: Номенклатура";
      catIcon = "📦";
    }
    const fullTitle = catTitle + (this.podborMode ? " (Подбор)" : "");

    if (titleEl) titleEl.textContent = fullTitle;
    if (iconEl) iconEl.textContent = catIcon;
    if (rootLabel) rootLabel.textContent = this.currentCatalog;
    if (btnSelectFolder) btnSelectFolder.style.display = "none";

    if (banner) {
      banner.style.display = this.podborMode ? "flex" : "none";
      if (podborCountEl) podborCountEl.textContent = "Seçilən: 0";
    }

    if (stockPane) {
      stockPane.style.display = isNomenclature ? "flex" : "none";
    }
    if (colArtikul) {
      colArtikul.style.display = isNomenclature ? "" : "none";
    }

    this.resetStockPane(win);

    console.log(`[CATALOG OPEN] catalog="${this.currentCatalog}", winId="${winId}"`);

    // MDI Window registration & activation
    const mdi = window.MdiManager || (typeof MdiManager !== "undefined" ? MdiManager : null);
    if (mdi && typeof mdi.activateWindow === "function") {
      mdi.activateWindow(winId, {
        title: fullTitle,
        icon: catIcon,
        closeFn: () => {
          win.remove();
        }
      });
    } else {
      win.style.display = "flex";
      win.classList.remove("minimized");
      win.classList.add("active");
    }

    // Ensure catalogWindowModal is visually in front of any active overlay
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
    const searchInput = document.getElementById("catalogSearchInput");
    if (searchInput) searchInput.value = this.initialSearch || "";
    this.loadCatalogData(this.initialSearch || "");
  },

  close(e) {
    if (e && typeof e.stopPropagation === "function") {
      e.stopPropagation();
    }
    const catSafe = String(this.currentCatalog).replace(/[^a-zA-Z0-9_\u0400-\u04FF]/g, "_");
    const winId = `catalogWin_${catSafe}`;
    console.log(`[CATALOG CLOSE] Closing catalog "${this.currentCatalog}" (#${winId})`);
    this.podborMode = false;
    this.podborCount = 0;
    this.locateCode = "";
    this.locateName = "";
    this.locateItem = "";

    if (window.MdiManager) {
      MdiManager.closeWindow(winId);
      MdiManager.closeWindow("catalogWindowModal");
    }
    const win = document.getElementById(winId);
    if (win) {
      win.style.display = "none";
      win.remove();
    }
    const baseWin = document.getElementById("catalogWindowModal");
    if (baseWin) {
      baseWin.style.display = "none";
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

  getActiveWindow() {
    const catSafe = String(this.currentCatalog).replace(/[^a-zA-Z0-9_\u0400-\u04FF]/g, "_");
    return document.getElementById(`catalogWin_${catSafe}`) || document.getElementById("catalogWindowModal");
  },

  abortController: null,

  cancel() {
    if (this.abortController) {
      try { this.abortController.abort(); } catch (e) {}
      this.abortController = null;
    }
    const win = this.getActiveWindow();
    const itemsBody = win ? win.querySelector("#catalogItemsBody") : document.getElementById("catalogItemsBody");
    if (itemsBody) {
      itemsBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #b71c1c; padding: 20px;">⏹ Sorğu dayandırıldı (Pause).</td></tr>`;
    }
  },

  async loadCatalogData(searchQuery = "") {
    const win = this.getActiveWindow();
    const treeList = win ? win.querySelector("#catalogTreeList") : document.getElementById("catalogTreeList");
    const itemsBody = win ? win.querySelector("#catalogItemsBody") : document.getElementById("catalogItemsBody");

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
        search: searchQuery,
        locate_code: this.locateCode || "",
        locate_name: this.locateName || "",
        locate_item: this.locateItem || ""
      };

      // Reset one-time locate request
      this.locateCode = "";
      this.locateName = "";
      this.locateItem = "";

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

      if (data.target_folder) {
        this.currentFolder = data.target_folder;
        this.parentFolder = data.parent_folder || "";
        this.updateFolderButton();
      }
      if (data.target_code) {
        this.preserveTargetCode = data.target_code;
      }
      this.renderFolders(data.folders || []);
      this.renderItems(data.items || []);

      const targetToHighlight = data.target_code || this.preserveTargetCode;
      if (targetToHighlight) {
        const tbody = document.getElementById("catalogItemsBody");
        if (tbody) {
          const foundTr = Array.from(tbody.querySelectorAll("tr")).find(
            r => r.dataset.code === targetToHighlight || r.dataset.name === targetToHighlight
          );
          if (foundTr) {
            const itemObj = (data.items || []).find(
              it => it.code === targetToHighlight || it.name === targetToHighlight
            );
            if (itemObj) {
              this.highlightItem(foundTr, itemObj);
            } else {
              tbody.querySelectorAll("tr").forEach(r => r.classList.remove("selected"));
              foundTr.classList.add("selected");
            }
            setTimeout(() => {
              foundTr.scrollIntoView({ block: "center", behavior: "smooth" });
            }, 60);
          }
        }
      }

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

  navigateUpFolder() {
    this.currentFolder = this.parentFolder || "";
    this.parentFolder = "";
    this.updateFolderButton();
    const searchInput = document.getElementById("catalogSearchInput");
    if (searchInput) searchInput.value = "";
    this.loadCatalogData("");
  },

  renderFolders(folders) {
    const win = this.getActiveWindow();
    const treeList = win ? win.querySelector("#catalogTreeList") : document.getElementById("catalogTreeList");
    if (!treeList) return;

    // Root folder
    const rootHtml = `
      <li class="catalog-tree-item ${!this.currentFolder ? 'selected' : ''}" onclick="CatalogSelector.selectFolder(this, '')">
        <span>📁</span>
        <span>${escapeHtml(this.currentCatalog)}</span>
      </li>
    `;

    // Parent folder if exists in hierarchy
    let parentFolderHtml = "";
    if (this.parentFolder && this.parentFolder !== this.currentFolder) {
      parentFolderHtml = `
        <li class="catalog-tree-item" onclick="CatalogSelector.selectFolder(this, '${escapeHtml(this.parentFolder)}')">
          <span style="padding-left: 10px;">📁</span>
          <span>${escapeHtml(this.parentFolder)}</span>
        </li>
      `;
    }

    // Active current folder in tree if selected
    let currentFolderHtml = "";
    if (this.currentFolder) {
      currentFolderHtml = `
        <li class="catalog-tree-item selected" onclick="CatalogSelector.selectFolder(this, '${escapeHtml(this.currentFolder)}')">
          <span style="padding-left: ${this.parentFolder ? '20px' : '12px'};">📂</span>
          <span style="font-weight: bold; color: #002060;">${escapeHtml(this.currentFolder)}</span>
        </li>
      `;
    }

    // Subfolders list
    const subHtml = (folders || []).filter(f => f.name !== this.currentFolder && f.name !== this.parentFolder).map(f => `
      <li class="catalog-tree-item" onclick="CatalogSelector.selectFolder(this, '${escapeHtml(f.name)}')">
        <span style="padding-left: ${this.currentFolder ? '28px' : '14px'};">📁</span>
        <span>${escapeHtml(f.name)}</span>
      </li>
    `).join("");

    treeList.innerHTML = rootHtml + parentFolderHtml + currentFolderHtml + subHtml;
  },

  renderItems(items) {
    const win = this.getActiveWindow();
    const tbody = win ? win.querySelector("#catalogItemsBody") : document.getElementById("catalogItemsBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    const isNom = this.currentCatalog === "Номенклатура";

    // 1C standard ".." up-folder navigation row
    if (this.currentFolder) {
      const upTr = document.createElement("tr");
      upTr.style.background = "#faf9f5";
      upTr.style.cursor = "pointer";
      upTr.title = "Yuxarı qovluğa keçmək üçün klikləyin";
      upTr.onclick = () => this.navigateUpFolder();
      const artikulUp = isNom ? `<td></td>` : "";
      upTr.innerHTML = `
        <td style="text-align: center; width: 30px;">📁</td>
        <td style="font-family: monospace; font-weight: bold; color: #004080; width: 100px;">..</td>
        ${artikulUp}
        <td colspan="3" style="color: #666; font-style: italic;">
          [.. Yuxarı qovluq${this.parentFolder ? ': ' + escapeHtml(this.parentFolder) : ''}]
        </td>
      `;
      tbody.appendChild(upTr);
    }

    if (items.length === 0) {
      const emptyTr = document.createElement("tr");
      emptyTr.innerHTML = `<td colspan="6" style="text-align: center; color: #888; padding: 20px;">Heç bir element tapılmadı.</td>`;
      tbody.appendChild(emptyTr);
      return;
    }

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
    const win = el.closest(".mdi-window") || this.getActiveWindow();
    if (win) {
      win.querySelectorAll(".catalog-tree-item").forEach(i => i.classList.remove("selected"));
    }
    el.classList.add("selected");
    this.currentFolder = folderName;
    this.selectedItem = folderName ? { name: folderName, is_folder: true, code: "" } : null;
    this.updateFolderButton();
    this.loadCatalogData();
  },

  updateFolderButton() {
    const win = this.getActiveWindow();
    const btnSelectFolder = win ? win.querySelector("#btnSelectCurrentFolder") : document.getElementById("btnSelectCurrentFolder");
    const btnFolderText = win ? win.querySelector("#btnSelectCurrentFolderText") : document.getElementById("btnSelectCurrentFolderText");
    const label = win ? win.querySelector("#catalogSelectedLabel") : document.getElementById("catalogSelectedLabel");

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
    const win = tr.closest(".mdi-window") || this.getActiveWindow();
    const tbody = win ? win.querySelector("#catalogItemsBody") : document.getElementById("catalogItemsBody");
    if (tbody) {
      tbody.querySelectorAll("tr").forEach(r => r.classList.remove("selected"));
    }
    tr.classList.add("selected");
    this.selectedItem = item;

    const label = win ? win.querySelector("#catalogSelectedLabel") : document.getElementById("catalogSelectedLabel");
    const previewTitle = win ? win.querySelector("#catalogSelectedPreviewTitle") : document.getElementById("catalogSelectedPreviewTitle");
    const btnText = win ? win.querySelector("#btnCatalogSelectText") : document.getElementById("btnCatalogSelectText");

    const prefix = item.is_folder ? "📁 [Qrup] " : "";
    if (label) label.textContent = `${prefix}${item.code ? '[' + item.code + '] ' : ''}${item.name}`;
    if (previewTitle) {
      previewTitle.textContent = item.is_folder ? `Qrup: ${item.name}` : `Seçilmiş mal: ${item.name}`;
    }
    if (btnText) btnText.textContent = item.is_folder ? "Выбрать папку" : "Выбрать";

    const catL = (this.currentCatalog || "").toLowerCase();
    const isNom = catL.includes("номенклатур") || catL.includes("məhsul") || catL.includes("tovar");

    if (isNom && !item.is_folder) {
      this.loadStockData(item.code, item.name);
    } else {
      this.resetStockPane(win);
    }
  },

  stockAbortController: null,

  async loadStockData(code, name) {
    const stockBody = document.getElementById("catalogStockBody");
    const pricesList = document.getElementById("catalogPricesList");
    const previewTitle = document.getElementById("catalogSelectedPreviewTitle");

    if (previewTitle) {
      previewTitle.textContent = `Seçilmiş mal: ${code ? '[' + code + '] ' : ''}${name}`;
    }

    if (this.stockAbortController) {
      try { this.stockAbortController.abort(); } catch (e) {}
    }
    this.stockAbortController = new AbortController();

    if (stockBody) {
      stockBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #004080; padding: 12px; font-weight: 500;">⏳ 1C: Anbar qalıqları və qiymətlər yüklənir...</td></tr>`;
    }
    if (pricesList) {
      pricesList.innerHTML = `<span style="color: #666; font-size: 11px;">Qiymətlər oxunur...</span>`;
    }

    try {
      const creds = SessionManager.getCredentials();
      const res = await fetch("/api/nomenclature/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...creds, code: code || "", name: name || "" }),
        signal: this.stockAbortController.signal
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Qalıqlar alına bilmədi");
      }

      this.currentPrices = data.prices || [];
      this.currentWarehouses = data.warehouses || [];

      // Default: Find price type "20" (standard 20 always selected)
      let defaultIdx = this.currentPrices.findIndex(p => {
        const pt = String(p.price_type || "").trim();
        return pt === "20";
      });
      if (defaultIdx < 0) {
        defaultIdx = this.currentPrices.findIndex(p => {
          const pt = String(p.price_type || "").trim().toLowerCase();
          return pt.startsWith("20") && !pt.includes("возвр");
        });
      }
      if (defaultIdx < 0 && this.currentPrices.length > 0) {
        defaultIdx = 0;
      }
      this.selectedPriceTypeIndex = (defaultIdx >= 0) ? defaultIdx : 0;

      this.renderPricesList();
      this.renderStockTable(this.currentWarehouses);

    } catch (err) {
      if (err.name === "AbortError") return;
      if (stockBody) {
        stockBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #b71c1c; padding: 10px;">Xəta: ${escapeHtml(err.message)}</td></tr>`;
      }
      if (pricesList) {
        pricesList.innerHTML = `<span style="color: #b71c1c; font-size: 11px;">Qiymət xətası</span>`;
      }
    } finally {
      this.stockAbortController = null;
    }
  },

  currentWarehouses: [],
  currentPrices: [],
  selectedPriceTypeIndex: 0,
  selectedWarehouseIndices: new Set(),

  renderStockTable(warehouses) {
    this.currentWarehouses = warehouses || [];
    this.selectedWarehouseIndices = new Set(); // Normalda heç bir seçim olmur
    this.updateStockTableRows();
  },

  getSelectedPrice() {
    if (!this.currentPrices || this.currentPrices.length === 0) return null;
    const idx = (typeof this.selectedPriceTypeIndex === "number" && this.selectedPriceTypeIndex >= 0 && this.selectedPriceTypeIndex < this.currentPrices.length)
      ? this.selectedPriceTypeIndex
      : 0;
    return this.currentPrices[idx];
  },

  selectPriceType(idx) {
    if (this.selectedPriceTypeIndex === idx) return;
    this.selectedPriceTypeIndex = idx;
    this.renderPricesList();
    this.updateStockTableRows();
  },

  updateStockTableRows() {
    const stockBody = document.getElementById("catalogStockBody");
    if (!stockBody) return;

    const warehouses = this.currentWarehouses || [];
    if (warehouses.length === 0) {
      stockBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #666; padding: 14px; font-style: italic;">Heç bir anbarda qalıq yoxdur (Qalıq: 0)</td></tr>`;
      const selectAllCb = document.getElementById("catalogWhSelectAll");
      if (selectAllCb) {
        selectAllCb.checked = false;
        selectAllCb.indeterminate = false;
      }
      return;
    }

    const selPriceObj = this.getSelectedPrice();
    const unitPrice = selPriceObj ? Number(selPriceObj.price || 0) : 0;

    let totStockSum = 0;
    let totStockAmountSum = 0;
    let freeStockSum = 0;
    let resStockSum = 0;

    let selTotSum = 0;
    let selTotAmountSum = 0;
    let selFreeSum = 0;
    let selResSum = 0;
    let selCount = 0;

    const rowsHtml = warehouses.map((w, idx) => {
      const tot = Number(w.total_stock || 0);
      const free = Number(w.free_stock || 0);
      const res = Number(w.reserve_stock || 0);
      const rowAmount = (tot > 0 && unitPrice > 0) ? (tot * unitPrice) : 0;

      totStockSum += tot;
      totStockAmountSum += rowAmount;
      freeStockSum += free;
      resStockSum += res;

      const isChecked = this.selectedWarehouseIndices.has(idx);
      if (isChecked) {
        selTotSum += tot;
        selTotAmountSum += rowAmount;
        selFreeSum += free;
        selResSum += res;
        selCount += 1;
      }

      const charStr = w.characteristic ? ` <span style="color: #777;">(${escapeHtml(w.characteristic)})</span>` : "";
      const totStyle = tot > 0 ? "font-weight: bold; color: #002060;" : "color: #888;";
      const amountStyle = rowAmount > 0 ? "font-weight: bold; color: #004080;" : "color: #888;";
      const freeStyle = free > 0 ? "font-weight: bold; color: #2e7d32;" : "color: #888;";
      const resStyle = res > 0 ? "font-weight: bold; color: #d32f2f;" : "color: #888;";

      const rowBg = isChecked ? "background: #e3f2fd;" : "";
      const amountStr = rowAmount > 0 ? rowAmount.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-";

      return `
        <tr style="${rowBg} cursor: pointer; user-select: none;" onclick="CatalogSelector.toggleWarehouseRow(${idx})" title="Bu anbarı seçmək üçün klikləyin">
          <td style="text-align: center; width: 28px; padding: 2px;">
            <input type="checkbox" class="wh-stock-checkbox" ${isChecked ? 'checked' : ''} 
                   onclick="event.stopPropagation(); CatalogSelector.toggleWarehouseRow(${idx})" style="cursor: pointer; margin: 0;">
          </td>
          <td style="text-align: left; font-weight: 500; color: #222;">${escapeHtml(w.warehouse)}${charStr}</td>
          <td style="text-align: right; ${totStyle}">${tot > 0 ? tot.toFixed(2) : "-"}</td>
          <td style="text-align: right; ${amountStyle}">${amountStr}</td>
          <td style="text-align: right; ${freeStyle}">${free > 0 ? free.toFixed(2) : "-"}</td>
          <td style="text-align: right; ${resStyle}">${res > 0 ? res.toFixed(2) : "0.00"}</td>
        </tr>
      `;
    }).join("");

    let summaryHtml = "";

    // Əgər istifadəçi 1 və ya daha çox anbar seçibsə, seçilənlərin cəmi parlaq şəkildə çıxır
    if (selCount > 0) {
      const selAmountFormatted = selTotAmountSum > 0 ? selTotAmountSum.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-";
      summaryHtml += `
        <tr style="background: #e8f5e9; font-weight: bold; border-top: 2px solid #2e7d32; border-bottom: 1px solid #a5d6a7;">
          <td style="text-align: center; color: #2e7d32; font-size: 13px;">☑</td>
          <td style="color: #1b5e20; text-align: left;">
            <span style="background: #2e7d32; color: #fff; padding: 1px 6px; border-radius: 10px; font-size: 10px; margin-right: 5px;">${selCount} anbar seçilib</span>
            SEÇİLƏNLƏRİN CƏMİ:
          </td>
          <td style="text-align: right; color: #1b5e20; font-size: 12px;">${selTotSum.toFixed(2)}</td>
          <td style="text-align: right; color: #004080; font-size: 12px; font-weight: bold;">${selAmountFormatted}</td>
          <td style="text-align: right; color: #2e7d32; font-size: 12px;">${selFreeSum.toFixed(2)}</td>
          <td style="text-align: right; color: #d32f2f; font-size: 12px;">${selResSum.toFixed(2)}</td>
        </tr>
      `;
    }

    // Bütün anbarlar üzrə ümumi cəm
    if (warehouses.length > 1) {
      const totAmountFormatted = totStockAmountSum > 0 ? totStockAmountSum.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-";
      summaryHtml += `
        <tr style="background: #eef3f8; font-weight: bold; border-top: ${selCount > 0 ? '1px dashed #b0c4de' : '2px solid #b0c4de'};">
          <td></td>
          <td style="color: #002060; text-align: left;">ИТОГО (Bütün anbarlar):</td>
          <td style="text-align: right; color: #002060;">${totStockSum.toFixed(2)}</td>
          <td style="text-align: right; color: #004080; font-weight: bold;">${totAmountFormatted}</td>
          <td style="text-align: right; color: #2e7d32;">${freeStockSum.toFixed(2)}</td>
          <td style="text-align: right; color: #d32f2f;">${resStockSum.toFixed(2)}</td>
        </tr>
      `;
    }

    stockBody.innerHTML = rowsHtml + summaryHtml;

    // Header checkbox status
    const selectAllCb = document.getElementById("catalogWhSelectAll");
    if (selectAllCb) {
      selectAllCb.checked = (warehouses.length > 0 && selCount === warehouses.length);
      selectAllCb.indeterminate = (selCount > 0 && selCount < warehouses.length);
    }
  },

  toggleWarehouseRow(idx) {
    if (!this.currentWarehouses || !this.currentWarehouses[idx]) return;
    if (this.selectedWarehouseIndices.has(idx)) {
      this.selectedWarehouseIndices.delete(idx);
    } else {
      this.selectedWarehouseIndices.add(idx);
    }
    this.updateStockTableRows();
  },

  toggleSelectAllWarehouses(checked) {
    if (!this.currentWarehouses) return;
    this.selectedWarehouseIndices.clear();
    if (checked) {
      this.currentWarehouses.forEach((_, i) => this.selectedWarehouseIndices.add(i));
    }
    this.updateStockTableRows();
  },

  renderPricesList() {
    const pricesList = document.getElementById("catalogPricesList");
    if (!pricesList) return;

    const prices = this.currentPrices || [];
    if (prices.length === 0) {
      pricesList.innerHTML = `<span style="color: #888; font-size: 11px;">Təyin edilmiş qiymət yoxdur</span>`;
      return;
    }

    pricesList.innerHTML = prices.map((p, i) => {
      const isSelected = (this.selectedPriceTypeIndex === i);
      const prVal = Number(p.price || 0);
      const prText = prVal > 0 ? `${prVal.toFixed(2)} ${escapeHtml(p.currency || 'AZN')}` : "-";
      const rowBg = isSelected ? "background: #e3f2fd; border: 1px solid #90caf9;" : "background: transparent; border: 1px solid transparent;";
      const radioChecked = isSelected ? "checked" : "";

      return `
        <label class="radio-1c-label" onclick="CatalogSelector.selectPriceType(${i})" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px; font-size: 11px; padding: 2px 5px; border-radius: 3px; cursor: pointer; ${rowBg}" onmouseover="if (!${isSelected}) this.style.background='#f0f4f8'" onmouseout="if (!${isSelected}) this.style.background='transparent'">
          <span style="display: flex; align-items: center; gap: 5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 170px;" title="${escapeHtml(p.price_type)}">
            <input type="radio" name="catalogPriceTypeSelection" ${radioChecked} onclick="event.stopPropagation(); CatalogSelector.selectPriceType(${i})" style="margin: 0; cursor: pointer;">
            <span style="color: ${isSelected ? '#002060; font-weight: bold;' : '#222;'}">${escapeHtml(p.price_type)}</span>
          </span>
          <b style="color: ${isSelected ? '#004080' : '#444'}; margin-left: 6px; white-space: nowrap;">${prText}</b>
        </label>
      `;
    }).join("");
  },

  resetStockPane(item) {
    this.currentWarehouses = [];
    this.currentPrices = [];
    this.selectedPriceTypeIndex = 0;
    this.selectedWarehouseIndices = new Set();

    const stockBody = document.getElementById("catalogStockBody");
    const pricesList = document.getElementById("catalogPricesList");
    const previewTitle = document.getElementById("catalogSelectedPreviewTitle");
    const selectAllCb = document.getElementById("catalogWhSelectAll");

    if (selectAllCb) {
      selectAllCb.checked = false;
      selectAllCb.indeterminate = false;
    }

    if (previewTitle) {
      previewTitle.textContent = item ? (item.is_folder ? `Qrup: ${item.name}` : `Seçilmiş mal: ${item.name}`) : "Seçilmiş mal: -";
    }
    if (stockBody) {
      stockBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #888; padding: 16px; font-style: italic;">Qalıqları görmək üçün siyahıdan bir mal seçin</td></tr>`;
    }
    if (pricesList) {
      pricesList.innerHTML = `<span style="color: #888; font-size: 11px; font-style: italic;">Mal seçildikdə qiymətlər əks olunacaq</span>`;
    }
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
          const existing = cur.split(";").map(s => s.trim());
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
