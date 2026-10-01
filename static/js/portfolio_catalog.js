/**
 * 1C:ENTERPRISE - PORTFOLIO CATALOG SYSTEM
 * static/js/portfolio_catalog.js
 */

const PortfolioCatalog = {
  items: [],
  filteredItems: [],
  filtersLoaded: false,
  availablePriceTypes: [],
  selectedPriceTypes: ["20"],
  activePriceTypes: ["20"],
  priceAnalysis: {
    enabled: false,
    basePriceType: "20"
  },
  selectedCodes: new Set(),
  filterSelectedOnly: false,
  activeColumn: null,
  activeCell: null,
  currentSortCol: null,
  currentSortAsc: true,
  cache: {}, // Instant memory cache: key -> items array

  open: function() {
    console.log("[PORTFOLIO CATALOG] Opening window...");
    const win = document.getElementById("portfolioCatalogWindow");
    if (!win) return;

    this.loadAnalysisSettings();

    // Center nicely in workspace
    const ws = document.getElementById("mdiWorkspace");
    if (ws) {
      const wsW = ws.clientWidth || window.innerWidth;
      const wsH = ws.clientHeight || window.innerHeight;
      const targetW = Math.min(1180, Math.max(780, wsW - 40));
      const targetH = Math.min(700, Math.max(440, wsH - 40));
      win.style.width = `${targetW}px`;
      win.style.height = `${targetH}px`;
      const left = Math.max(10, Math.floor((wsW - targetW) / 2));
      const top = Math.max(10, Math.floor((wsH - targetH) / 2));
      win.style.left = `${left}px`;
      win.style.top = `${top}px`;
    }

    if (window.MdiManager) {
      MdiManager.activateWindow("portfolioCatalogWindow", {
        title: "Товары по портфелям",
        icon: "📋"
      });
    } else {
      win.style.display = "flex";
      win.classList.remove("minimized");
      win.classList.add("active");
    }

    if (!this.filtersLoaded) {
      this.loadFilters();
    }
  },

  close: function() {
    if (window.MdiManager) {
      MdiManager.closeWindow("portfolioCatalogWindow");
    } else {
      const win = document.getElementById("portfolioCatalogWindow");
      if (win) win.style.display = "none";
    }
  },

  loadAnalysisSettings: function() {
    try {
      const saved = localStorage.getItem("pc_price_analysis");
      if (saved) {
        this.priceAnalysis = Object.assign(this.priceAnalysis, JSON.parse(saved));
      }
    } catch (e) {}
    this.updateAnalysisButtonUI();
    this.updateSelectedButtonUI();
  },

  openPriceAnalysisModal: function() {
    const modal = document.getElementById("pcPriceAnalysisModal");
    if (!modal) return;

    const baseSel = document.getElementById("pcAnalysisBasePriceType");
    const enChk = document.getElementById("pcAnalysisEnabled");
    const summaryText = document.getElementById("pcAnalysisSummaryText");

    if (enChk) enChk.checked = Boolean(this.priceAnalysis.enabled);

    const pts = (this.activePriceTypes && this.activePriceTypes.length) 
      ? this.activePriceTypes 
      : (this.selectedPriceTypes.length ? this.selectedPriceTypes : ["20"]);

    if (baseSel) {
      baseSel.innerHTML = "";
      pts.forEach(pt => {
        const opt = document.createElement("option");
        opt.value = pt;
        opt.textContent = pt;
        baseSel.appendChild(opt);
      });

      if (this.priceAnalysis.basePriceType && pts.includes(this.priceAnalysis.basePriceType)) {
        baseSel.value = this.priceAnalysis.basePriceType;
      } else if (pts.includes("20")) {
        baseSel.value = "20";
      } else if (pts.length) {
        baseSel.value = pts[0];
      }
    }

    if (summaryText) {
      summaryText.textContent = `Доступно для сравнения: ${pts.length} колонок`;
    }

    modal.style.display = "flex";
  },

  closePriceAnalysisModal: function() {
    const modal = document.getElementById("pcPriceAnalysisModal");
    if (modal) modal.style.display = "none";
  },

  applyPriceAnalysis: function() {
    const enChk = document.getElementById("pcAnalysisEnabled");
    const baseSel = document.getElementById("pcAnalysisBasePriceType");

    this.priceAnalysis.enabled = enChk ? enChk.checked : false;
    this.priceAnalysis.basePriceType = baseSel ? baseSel.value : "20";

    try {
      localStorage.setItem("pc_price_analysis", JSON.stringify(this.priceAnalysis));
    } catch (e) {}

    this.updateAnalysisButtonUI();
    this.renderTable();
    this.closePriceAnalysisModal();

    if (this.priceAnalysis.enabled) {
      this.updateStatus(`Анализ цен включен (Базовый эталон: ${this.priceAnalysis.basePriceType})`);
    } else {
      this.updateStatus("Анализ цен выключен");
    }
  },

  updateAnalysisButtonUI: function() {
    const btn = document.getElementById("pcBtnPriceAnalysis");
    const dot = document.getElementById("pcAnalysisActiveDot");
    if (!btn) return;

    if (this.priceAnalysis.enabled) {
      btn.style.background = "#fff3cd";
      btn.style.borderColor = "#f0ad4e";
      btn.style.color = "#856404";
      btn.style.fontWeight = "bold";
      btn.title = `Анализ цен активен (Базовый тип: ${this.priceAnalysis.basePriceType}). Нажмите для настройки.`;
      if (dot) dot.style.display = "inline-block";
    } else {
      btn.style.background = "";
      btn.style.borderColor = "";
      btn.style.color = "";
      btn.style.fontWeight = "";
      btn.title = "Сравнение и анализ цен (выделение разницы)";
      if (dot) dot.style.display = "none";
    }
  },

  togglePriceTypeDropdown: function(e) {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    const menu = document.getElementById("pcPriceTypeMenu");
    if (!menu) return;
    const isShown = menu.style.display === "block";
    menu.style.display = isShown ? "none" : "block";
  },

  renderPriceTypeChecklist: function() {
    const listEl = document.getElementById("pcPriceTypeList");
    if (!listEl) return;
    listEl.innerHTML = "";

    const pts = this.availablePriceTypes.length ? this.availablePriceTypes : [{ code: "20", name: "20" }];
    pts.forEach(pt => {
      const ptCode = String(pt.code || pt.name || "").trim();
      const ptName = String(pt.name || pt.code || "").trim();
      if (!ptName) return;

      const isChecked = this.selectedPriceTypes.includes(ptName) || this.selectedPriceTypes.includes(ptCode);

      const label = document.createElement("label");
      label.style.display = "flex";
      label.style.alignItems = "center";
      label.style.gap = "6px";
      label.style.padding = "3px 5px";
      label.style.cursor = "pointer";
      label.style.borderRadius = "2px";
      label.style.fontSize = "11px";
      label.style.userSelect = "none";
      label.onmouseover = () => { label.style.background = "#eef4fa"; };
      label.onmouseout = () => { label.style.background = "transparent"; };

      const chk = document.createElement("input");
      chk.type = "checkbox";
      chk.value = ptName;
      chk.checked = isChecked;
      chk.style.cursor = "pointer";
      chk.onchange = (ev) => {
        this.onPriceTypeToggle(ptName, ev.target.checked);
      };

      const span = document.createElement("span");
      span.textContent = ptName;
      span.style.color = "#111";

      label.appendChild(chk);
      label.appendChild(span);
      listEl.appendChild(label);
    });

    this.updatePriceTypeButtonLabel();
  },

  onPriceTypeToggle: function(ptName, isChecked) {
    if (isChecked) {
      if (!this.selectedPriceTypes.includes(ptName)) {
        this.selectedPriceTypes.push(ptName);
      }
    } else {
      this.selectedPriceTypes = this.selectedPriceTypes.filter(p => p !== ptName);
    }
    this.updatePriceTypeButtonLabel();
  },

  selectAllPriceTypes: function(select) {
    if (select) {
      this.selectedPriceTypes = this.availablePriceTypes.map(pt => String(pt.name || pt.code).trim()).filter(Boolean);
      if (!this.selectedPriceTypes.length) this.selectedPriceTypes = ["20"];
    } else {
      this.selectedPriceTypes = [];
    }
    this.renderPriceTypeChecklist();
  },

  updatePriceTypeButtonLabel: function() {
    const lbl = document.getElementById("pcPriceTypeLabel");
    if (!lbl) return;
    if (this.selectedPriceTypes.length === 0) {
      lbl.textContent = "(Без цен)";
      lbl.style.color = "#888";
    } else if (this.selectedPriceTypes.length <= 2) {
      lbl.textContent = this.selectedPriceTypes.join(", ");
      lbl.style.color = "#000";
    } else {
      lbl.textContent = `${this.selectedPriceTypes.slice(0, 2).join(", ")} (+${this.selectedPriceTypes.length - 2})`;
      lbl.style.color = "#000";
    }
  },

  loadFilters: function() {
    const creds = window.SessionManager ? SessionManager.getCredentials() : {};
    this.updateStatus("Загрузка списков (портфели, группы, цены)...");

    fetch("/api/portfolio_catalog/filters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(creds)
    })
    .then(res => res.json())
    .then(data => {
      if (!data.success) {
        console.error("Failed to load portfolio filters:", data.error);
        this.updateStatus("Ошибка загрузки фильтров");
        return;
      }

      this.filtersLoaded = true;

      // 1. Populate Portfolios Select
      const portSel = document.getElementById("pcPortfolioSelect");
      if (portSel) {
        portSel.innerHTML = '<option value="">(Все портфели)</option>';
        (data.portfolios || []).forEach(p => {
          const opt = document.createElement("option");
          opt.value = p;
          opt.textContent = p;
          portSel.appendChild(opt);
        });
      }

      // 2. Populate Nom Groups Select (clean of vehicle fleet)
      const grpSel = document.getElementById("pcNomGroupSelect");
      if (grpSel) {
        grpSel.innerHTML = '<option value="">(Все группы)</option>';
        (data.nom_groups || []).forEach(g => {
          const opt = document.createElement("option");
          opt.value = g;
          opt.textContent = g;
          grpSel.appendChild(opt);
        });
      }

      // 3. Populate Multi-Select Price Types Checklist
      this.availablePriceTypes = data.price_types || [];
      if (!this.selectedPriceTypes.length) {
        this.selectedPriceTypes = ["20"];
      }
      this.renderPriceTypeChecklist();

      this.updateStatus("Фильтры успешно загружены");

      // Auto-trigger load for first portfolio if available
      if (portSel && portSel.options.length > 1 && !this.items.length) {
        portSel.selectedIndex = 1;
        this.onPortfolioChange();
      }
    })
    .catch(err => {
      console.error("Error loading portfolio filters:", err);
      this.updateStatus("Ошибка сети при загрузке фильтров");
    });
  },

  onPortfolioChange: function() {
    const portSel = document.getElementById("pcPortfolioSelect");
    const badge = document.getElementById("pcActiveFilterBadge");
    if (badge && portSel) {
      if (portSel.value) {
        badge.textContent = portSel.value;
        badge.style.display = "inline-block";
      } else {
        badge.style.display = "none";
      }
    }
    // Instant auto-generate when portfolio changes
    this.generate();
  },

  generate: function() {
    const portSel = document.getElementById("pcPortfolioSelect");
    const grpSel = document.getElementById("pcNomGroupSelect");

    const creds = window.SessionManager ? SessionManager.getCredentials() : {};
    const payload = {
      ...creds,
      portfolio: portSel ? portSel.value : "",
      nom_group: grpSel ? grpSel.value : "",
      price_types: this.selectedPriceTypes,
      search: ""
    };

    const ptsKey = (this.selectedPriceTypes || []).slice().sort().join(",");
    const cacheKey = `${creds.server || ""}_${creds.ref || ""}_${payload.portfolio}_${payload.nom_group}_${ptsKey}`;

    // Close price type dropdown if open
    const menu = document.getElementById("pcPriceTypeMenu");
    if (menu) menu.style.display = "none";

    // Reset row selections and filters on new generation
    this.selectedCodes.clear();
    this.updateSelectionBadges();

    // Instant render from cache if available (0 ms)
    if (this.cache[cacheKey]) {
      console.log(`[PORTFOLIO CATALOG] Instant load from cache for '${cacheKey}'`);
      this.items = this.cache[cacheKey];
      this.activePriceTypes = [...this.selectedPriceTypes];
      this.onFilterChange();
      this.updateStatus(`Мгновенно загружено ${this.items.length} товаров (кэш)`);
      return;
    }

    const loadingEl = document.getElementById("pcLoadingState");
    const emptyEl = document.getElementById("pcEmptyState");
    const tableEl = document.getElementById("pcReportTable");
    const btnGen = document.getElementById("pcBtnGenerate");

    if (loadingEl) loadingEl.style.display = "flex";
    if (btnGen) btnGen.disabled = true;
    this.updateStatus("Загрузка данных из 1C...");

    fetch("/api/portfolio_catalog/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
      if (loadingEl) loadingEl.style.display = "none";
      if (btnGen) btnGen.disabled = false;

      if (!data.success) {
        alert("1C Xətası: " + (data.error || "Məlumat yüklənə bilmədi"));
        this.updateStatus("Ошибка: " + (data.error || "Не удалось загрузить данные"));
        return;
      }

      this.items = data.items || [];
      this.activePriceTypes = data.price_types || this.selectedPriceTypes;
      // Save to instant memory cache
      this.cache[cacheKey] = this.items;

      this.onFilterChange();

      if (this.items.length === 0) {
        if (emptyEl) {
          emptyEl.style.display = "flex";
          emptyEl.innerHTML = `
            <span style="font-size: 32px;">🔍</span>
            <span style="font-weight: bold; font-size: 13px;">Ничего не найдено</span>
            <span>По выбранным фильтрам в 1C не найдено товаров.</span>
          `;
        }
        if (tableEl) tableEl.style.display = "none";
        this.updateCountBadge(0);
        this.updateStatus("Найдено 0 товаров");
      } else {
        if (emptyEl) emptyEl.style.display = "none";
        if (tableEl) tableEl.style.display = "table";
        this.updateStatus(`Загружено ${this.items.length} товаров`);
      }
    })
    .catch(err => {
      if (loadingEl) loadingEl.style.display = "none";
      if (btnGen) btnGen.disabled = false;
      console.error("Portfolio catalog generate error:", err);
      alert("Şəbəkə / Server xətası: " + err.message);
      this.updateStatus("Сетевая ошибка");
    });
  },

  onFilterChange: function() {
    const searchInp = document.getElementById("pcSearchInput");
    const clearBtn = document.getElementById("pcClearSearchBtn");
    const q = searchInp ? searchInp.value.trim().toLowerCase() : "";
    if (clearBtn) clearBtn.style.display = q ? "block" : "none";

    this.filteredItems = this.items.filter(itm => {
      // 1. Only selected items filter
      if (this.filterSelectedOnly && !this.selectedCodes.has(itm.code)) {
        return false;
      }

      // 2. General search query (code, artikul, cv, barcode, name, folder, group, portfolio, manufacturer, prices)
      if (q) {
        let priceText = "";
        if (itm.prices) {
          priceText = Object.values(itm.prices).map(v => Number(v || 0).toFixed(2)).join(" ");
        } else if (itm.price !== undefined) {
          priceText = Number(itm.price || 0).toFixed(2);
        }
        const src = `${itm.name} ${itm.code} ${itm.artikul} ${itm.cv} ${itm.barcode} ${itm.folder} ${itm.group} ${itm.portfolio} ${itm.manufacturer} ${priceText}`.toLowerCase();
        if (!src.includes(q)) return false;
      }

      return true;
    });

    // Reapply active sorting
    if (this.currentSortCol) {
      this.applyCurrentSort();
    }

    const emptyEl = document.getElementById("pcEmptyState");
    const tableEl = document.getElementById("pcReportTable");
    if (this.filteredItems.length === 0 && this.items.length > 0) {
      if (emptyEl) {
        emptyEl.style.display = "flex";
        emptyEl.innerHTML = `
          <span style="font-size: 32px;">🔍</span>
          <span style="font-weight: bold; font-size: 13px;">По фильтрам ничего не найдено</span>
          <span>Попробуйте изменить поисковый запрос или сбросить фильтр выбранных (Ctrl+Q).</span>
        `;
      }
      if (tableEl) tableEl.style.display = "none";
    } else if (this.items.length > 0) {
      if (emptyEl) emptyEl.style.display = "none";
      if (tableEl) tableEl.style.display = "table";
    }

    this.renderTable();
    this.updateCountBadge(this.filteredItems.length);
  },

  toggleSelectedOnly: function() {
    if (this.selectedCodes.size === 0 && !this.filterSelectedOnly) {
      alert("Əvvəlcə cədvəldən müqayisə etmək istədiyiniz məhsulları sol tərəfdəki kvadratlara (☑) klikləyərək seçin.");
      return;
    }

    this.filterSelectedOnly = !this.filterSelectedOnly;
    this.updateSelectedButtonUI();
    this.onFilterChange();
  },

  updateSelectedButtonUI: function() {
    const btn = document.getElementById("pcBtnFilterSelected");
    if (!btn) return;
    if (this.filterSelectedOnly) {
      btn.style.background = "#dbeafe";
      btn.style.borderColor = "#3b82f6";
      btn.style.color = "#1e40af";
      btn.style.fontWeight = "bold";
      btn.title = "Aktivdir: Yalnız qeyd olunmuş mallar göstərilir. Bütün siyahını görmək üçün klikləyin.";
    } else {
      btn.style.background = "";
      btn.style.borderColor = "";
      btn.style.color = "";
      btn.style.fontWeight = "";
      btn.title = "Yalnız qeyd olunmuş (seçilmiş) malları göstər";
    }
  },

  toggleItemSelection: function(code, isChecked) {
    if (!code) return;
    if (isChecked) {
      this.selectedCodes.add(code);
    } else {
      this.selectedCodes.delete(code);
      if (this.selectedCodes.size === 0 && this.filterSelectedOnly) {
        this.filterSelectedOnly = false;
        this.updateSelectedButtonUI();
      }
    }
    this.updateSelectionBadges();

    if (this.filterSelectedOnly) {
      this.onFilterChange();
    } else {
      // Fast in-place row background toggle
      const row = document.getElementById(`pcRow_${code}`);
      if (row) {
        row.style.background = isChecked ? "#edf5ff" : (row.dataset.origBg || "#ffffff");
      }
      this.updateMasterCheckboxState();
    }
  },

  toggleSelectAllVisible: function(isChecked) {
    if (isChecked) {
      this.filteredItems.forEach(itm => {
        if (itm.code) this.selectedCodes.add(itm.code);
      });
    } else {
      this.filteredItems.forEach(itm => {
        if (itm.code) this.selectedCodes.delete(itm.code);
      });
      if (this.selectedCodes.size === 0 && this.filterSelectedOnly) {
        this.filterSelectedOnly = false;
        this.updateSelectedButtonUI();
      }
    }
    this.updateSelectionBadges();
    this.renderTable();
  },

  clearSelection: function() {
    this.selectedCodes.clear();
    this.filterSelectedOnly = false;
    this.updateSelectedButtonUI();
    this.updateSelectionBadges();
    this.onFilterChange();
  },

  updateSelectionBadges: function() {
    const count = this.selectedCodes.size;
    const badge = document.getElementById("pcSelectedCountBadge");
    const clearBtn = document.getElementById("pcBtnClearSelection");
    if (badge) {
      badge.textContent = count;
      badge.style.display = count > 0 ? "inline-block" : "none";
    }
    if (clearBtn) {
      clearBtn.style.display = count > 0 ? "inline-block" : "none";
      clearBtn.textContent = `✕ Снять выбор (${count})`;
    }
    this.updateMasterCheckboxState();
  },

  updateMasterCheckboxState: function() {
    const masterChk = document.getElementById("pcMasterRowCheckbox");
    if (!masterChk) return;
    if (this.filteredItems.length === 0) {
      masterChk.checked = false;
      masterChk.indeterminate = false;
      return;
    }
    const selectedVisible = this.filteredItems.filter(itm => this.selectedCodes.has(itm.code)).length;
    if (selectedVisible === 0) {
      masterChk.checked = false;
      masterChk.indeterminate = false;
    } else if (selectedVisible === this.filteredItems.length) {
      masterChk.checked = true;
      masterChk.indeterminate = false;
    } else {
      masterChk.checked = false;
      masterChk.indeterminate = true;
    }
  },

  setActiveCell: function(colKey, cellValue, tdEl) {
    this.activeColumn = colKey;
    this.activeCell = { col: colKey, value: cellValue };

    const sel = window.getSelection();

    // 2nd click on the same cell: cancel/clear selection
    if (this.lastSelectedTd === tdEl && sel && sel.toString().trim().length > 0) {
      sel.removeAllRanges();
      this.lastSelectedTd = null;
      tdEl.classList.remove("pc-cell-active");
      tdEl.style.outline = "";
      return;
    }

    // Clear previous cell outlines
    document.querySelectorAll(".pc-cell-active").forEach(el => {
      el.classList.remove("pc-cell-active");
      el.style.outline = "";
      el.style.boxShadow = "";
    });

    if (tdEl) {
      tdEl.classList.add("pc-cell-active");
      tdEl.style.outline = "2px solid #0055ea";
      tdEl.style.outlineOffset = "-2px";

      // 1st click: automatically select all text inside this cell for easy copy (Ctrl+C)
      try {
        const range = document.createRange();
        range.selectNodeContents(tdEl);
        sel.removeAllRanges();
        sel.addRange(range);
        this.lastSelectedTd = tdEl;
      } catch (err) {
        console.warn("Could not select cell text:", err);
      }
    }
  },

  onHeaderClick: function(e, colField, colTitle) {
    this.activeColumn = colTitle || colField;
    this.sortBy(colField);
  },

  onSearchHotkey: function() {
    const inp = document.getElementById("pcSearchInput");
    if (!inp) return;

    // In 1C: If a cell was selected and search input is currently empty, prefill with cell's value
    if (this.activeCell && this.activeCell.value && !inp.value.trim()) {
      inp.value = String(this.activeCell.value).trim();
      this.onFilterChange();
    }

    inp.focus();
    inp.select();

    // Visual pulse effect on search box
    inp.style.transition = "box-shadow 0.2s, border-color 0.2s";
    inp.style.boxShadow = "0 0 8px rgba(0, 85, 234, 0.7)";
    inp.style.borderColor = "#0055ea";
    setTimeout(() => {
      inp.style.boxShadow = "";
      inp.style.borderColor = "";
    }, 1200);

    const colMsg = this.activeColumn ? ` (колонка: ${this.activeColumn})` : "";
    this.updateStatus(`Поиск (Ctrl+F)${colMsg}. Для сброса поиска нажмите Ctrl+Q`);
  },

  clearSearch: function() {
    const inp = document.getElementById("pcSearchInput");
    if (inp) {
      inp.value = "";
      inp.blur();
    }
    this.activeCell = null;
    document.querySelectorAll(".pc-cell-active").forEach(el => {
      el.classList.remove("pc-cell-active");
      el.style.outline = "";
      el.style.boxShadow = "";
    });
    this.onFilterChange();
    this.updateStatus("Поиск отменен (Ctrl+Q)");
  },

  renderTableHead: function() {
    const headRow = document.getElementById("pcTableHeadRow");
    if (!headRow) return;

    const pts = this.activePriceTypes || this.selectedPriceTypes || [];
    const isAnalysis = Boolean(this.priceAnalysis.enabled);
    const basePt = this.priceAnalysis.basePriceType;

    let priceHeadersHtml = "";
    if (pts.length > 0) {
      pts.forEach(pt => {
        let tag = "";
        let thBg = "";
        let thColor = "";

        if (isAnalysis && pt === basePt) {
          tag = " <span style='font-size:9px; background:#0055ea; color:#fff; padding:1px 4px; border-radius:2px; vertical-align:middle;'>База</span>";
          thBg = "background: #d8e6f3;";
          thColor = "color: #002060;";
        }

        priceHeadersHtml += `<th style="min-width: 85px; padding: 4px 6px; border: 1px solid #b0af9f; text-align: right; cursor: pointer; white-space: nowrap; ${thBg} ${thColor}" onclick="PortfolioCatalog.onHeaderClick(event, 'price_${escapeHtml(pt)}', 'Цена (${escapeHtml(pt)})')">Цена (${escapeHtml(pt)})${tag} ⬍</th>`;
      });
    }

    headRow.innerHTML = `
      <th style="width: 32px; padding: 4px 2px; border: 1px solid #b0af9f; text-align: center;">
        <input type="checkbox" id="pcMasterRowCheckbox" onchange="PortfolioCatalog.toggleSelectAllVisible(this.checked)" title="Выбрать все / Снять выбор" style="cursor: pointer;">
      </th>
      <th style="width: 35px; padding: 4px 6px; border: 1px solid #b0af9f; text-align: center;">№</th>
      <th style="width: 85px; padding: 4px 6px; border: 1px solid #b0af9f; text-align: left; cursor: pointer;" onclick="PortfolioCatalog.onHeaderClick(event, 'code', 'Код')">Код ⬍</th>
      <th style="width: 95px; padding: 4px 6px; border: 1px solid #b0af9f; text-align: left; cursor: pointer;" onclick="PortfolioCatalog.onHeaderClick(event, 'artikul', 'Артикул')">Артикул ⬍</th>
      <th style="width: 85px; padding: 4px 6px; border: 1px solid #b0af9f; text-align: left; cursor: pointer;" onclick="PortfolioCatalog.onHeaderClick(event, 'cv', 'СВ код')">СВ код ⬍</th>
      <th style="width: 110px; padding: 4px 6px; border: 1px solid #b0af9f; text-align: left; cursor: pointer;" onclick="PortfolioCatalog.onHeaderClick(event, 'barcode', 'Штрихкод')">Штрихкод ⬍</th>
      <th style="min-width: 250px; padding: 4px 6px; border: 1px solid #b0af9f; text-align: left; cursor: pointer;" onclick="PortfolioCatalog.onHeaderClick(event, 'name', 'Наименование')">Наименование ⬍</th>
      <th style="width: 140px; padding: 4px 6px; border: 1px solid #b0af9f; text-align: left; cursor: pointer;" onclick="PortfolioCatalog.onHeaderClick(event, 'folder', 'Папка (Родитель)')">Папка (Родитель) ⬍</th>
      <th style="width: 130px; padding: 4px 6px; border: 1px solid #b0af9f; text-align: left; cursor: pointer;" onclick="PortfolioCatalog.onHeaderClick(event, 'group', 'Ном. группа')">Ном. группа ⬍</th>
      <th style="width: 120px; padding: 4px 6px; border: 1px solid #b0af9f; text-align: left; cursor: pointer;" onclick="PortfolioCatalog.onHeaderClick(event, 'portfolio', 'Портфель')">Портфель ⬍</th>
      <th style="width: 65px; padding: 4px 6px; border: 1px solid #b0af9f; text-align: center;">Ед. изм.</th>
      ${priceHeadersHtml}
      <th style="width: 110px; padding: 4px 6px; border: 1px solid #b0af9f; text-align: left;" onclick="PortfolioCatalog.onHeaderClick(event, 'type', 'Вид')">Вид</th>
      <th style="width: 130px; padding: 4px 6px; border: 1px solid #b0af9f; text-align: left;" onclick="PortfolioCatalog.onHeaderClick(event, 'manufacturer', 'Производитель')">Производитель</th>
    `;

    this.updateMasterCheckboxState();
  },

  renderTable: function() {
    this.renderTableHead();

    const tbody = document.getElementById("pcTableBody");
    if (!tbody) return;

    const list = this.filteredItems;
    const pts = this.activePriceTypes || this.selectedPriceTypes || [];
    const isAnalysis = Boolean(this.priceAnalysis.enabled);
    const basePt = this.priceAnalysis.basePriceType;

    let html = "";
    for (let i = 0; i < list.length; i++) {
      const itm = list[i];
      const isSelected = itm.code && this.selectedCodes.has(itm.code);
      const defaultBg = (i % 2 === 1) ? "#f7f6f0" : "#ffffff";
      const rowBg = isSelected ? "#edf5ff" : defaultBg;

      // Base price value for benchmark comparison
      let baseVal = 0;
      if (isAnalysis && basePt) {
        if (itm.prices && itm.prices[basePt] !== undefined) {
          baseVal = Number(itm.prices[basePt]) || 0;
        } else if (basePt === pts[0] && itm.price !== undefined) {
          baseVal = Number(itm.price) || 0;
        }
      }

      // Render columns for each selected price type
      let priceTds = "";
      if (pts.length > 0) {
        pts.forEach(pt => {
          let val = 0;
          if (itm.prices && itm.prices[pt] !== undefined) {
            val = Number(itm.prices[pt]) || 0;
          } else if (pt === pts[0] && itm.price !== undefined) {
            val = Number(itm.price) || 0;
          }
          const priceStr = val > 0 ? val.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-";

          let cellBg = "";
          let cellBorder = "1px solid #d4d0c8";
          let cellColor = "#000080";
          let cellTitle = "";

          if (isAnalysis) {
            if (pt === basePt) {
              // Base benchmark column: subtle neutral light blue
              cellBg = "#eef4fa";
              cellColor = "#002060";
              cellTitle = `Базовая цена (${basePt}): ${priceStr}`;
            } else {
              const diff = val - baseVal;
              if (Math.abs(diff) > 0.0001) {
                // Different price than base -> HIGHLIGHT IN AUTHENTIC SOFT YELLOW!
                cellBg = "#fff3cd";
                cellBorder = "1px solid #ffeeba";
                cellColor = "#856404";
                const diffSign = diff > 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2);
                cellTitle = `Разница с базой (${basePt}): ${diffSign} AZN (База: ${baseVal.toFixed(2)}, Текущая: ${val.toFixed(2)})`;
              }
            }
          }

          const styleAttr = `padding: 3px 5px; border: ${cellBorder}; text-align: right; font-weight: bold; color: ${cellColor}; white-space: nowrap; cursor: pointer; ${cellBg ? `background: ${cellBg};` : ''}`;
          priceTds += `<td style="${styleAttr}" ${cellTitle ? `title="${escapeHtml(cellTitle)}"` : ''} onclick="PortfolioCatalog.setActiveCell('Цена (${escapeHtml(pt)})', '${priceStr}', this)">${priceStr}</td>`;
        });
      }

      html += `
        <tr id="pcRow_${escapeHtml(itm.code)}" data-orig-bg="${defaultBg}" style="background: ${rowBg}; border-bottom: 1px solid #e0dfd5;" onmouseover="if(!PortfolioCatalog.selectedCodes.has('${escapeHtml(itm.code)}')) this.style.background='#fffae8'" onmouseout="if(!PortfolioCatalog.selectedCodes.has('${escapeHtml(itm.code)}')) this.style.background='${defaultBg}'">
          <td style="padding: 2px 2px; border: 1px solid #d4d0c8; text-align: center;" onclick="event.stopPropagation()">
            <input type="checkbox" class="pc-row-chk" data-code="${escapeHtml(itm.code)}" ${isSelected ? 'checked' : ''} onchange="PortfolioCatalog.toggleItemSelection('${escapeHtml(itm.code)}', this.checked)">
          </td>
          <td style="padding: 3px 5px; border: 1px solid #d4d0c8; text-align: center; color: #777;">${i + 1}</td>
          <td style="padding: 3px 5px; border: 1px solid #d4d0c8; text-align: center; font-family: Consolas, monospace; font-weight: bold; color: #003366; cursor: pointer;" onclick="PortfolioCatalog.setActiveCell('Код', '${escapeHtml(itm.code)}', this)">${escapeHtml(itm.code)}</td>
          <td style="padding: 3px 5px; border: 1px solid #d4d0c8; cursor: pointer;" onclick="PortfolioCatalog.setActiveCell('Артикул', '${escapeHtml(itm.artikul)}', this)">${escapeHtml(itm.artikul)}</td>
          <td style="padding: 3px 5px; border: 1px solid #d4d0c8; text-align: center; font-family: Consolas, monospace; color: #2e7d32; font-weight: bold; cursor: pointer;" onclick="PortfolioCatalog.setActiveCell('СВ код', '${escapeHtml(itm.cv)}', this)">${escapeHtml(itm.cv)}</td>
          <td style="padding: 3px 5px; border: 1px solid #d4d0c8; text-align: center; font-family: Consolas, monospace; color: #555; cursor: pointer;" onclick="PortfolioCatalog.setActiveCell('Штрихкод', '${escapeHtml(itm.barcode)}', this)">${escapeHtml(itm.barcode)}</td>
          <td style="padding: 3px 6px; border: 1px solid #d4d0c8; font-weight: 500; color: #111; cursor: pointer;" onclick="PortfolioCatalog.setActiveCell('Наименование', '${escapeHtml(itm.name)}', this)">${escapeHtml(itm.name)}</td>
          <td style="padding: 3px 5px; border: 1px solid #d4d0c8; color: #444; cursor: pointer;" onclick="PortfolioCatalog.setActiveCell('Папка', '${escapeHtml(itm.folder)}', this)">${escapeHtml(itm.folder)}</td>
          <td style="padding: 3px 5px; border: 1px solid #d4d0c8; color: #004080; font-weight: 500; cursor: pointer;" onclick="PortfolioCatalog.setActiveCell('Ном. группа', '${escapeHtml(itm.group)}', this)">${escapeHtml(itm.group)}</td>
          <td style="padding: 3px 5px; border: 1px solid #d4d0c8; color: #6a1b9a; font-weight: bold; cursor: pointer;" onclick="PortfolioCatalog.setActiveCell('Портфель', '${escapeHtml(itm.portfolio)}', this)">${escapeHtml(itm.portfolio)}</td>
          <td style="padding: 3px 5px; border: 1px solid #d4d0c8; text-align: center; cursor: pointer;" onclick="PortfolioCatalog.setActiveCell('Ед. изм.', '${escapeHtml(itm.unit)}', this)">${escapeHtml(itm.unit)}</td>
          ${priceTds}
          <td style="padding: 3px 5px; border: 1px solid #d4d0c8; color: #555; cursor: pointer;" onclick="PortfolioCatalog.setActiveCell('Вид', '${escapeHtml(itm.type)}', this)">${escapeHtml(itm.type)}</td>
          <td style="padding: 3px 5px; border: 1px solid #d4d0c8; color: #333; cursor: pointer;" onclick="PortfolioCatalog.setActiveCell('Производитель', '${escapeHtml(itm.manufacturer)}', this)">${escapeHtml(itm.manufacturer)}</td>
        </tr>
      `;
    }

    tbody.innerHTML = html;
  },

  applyCurrentSort: function() {
    if (!this.currentSortCol) return;
    const field = this.currentSortCol;
    const asc = this.currentSortAsc ? 1 : -1;

    if (field.startsWith("price_")) {
      const pt = field.replace("price_", "");
      this.filteredItems.sort((a, b) => {
        const va = (a.prices && a.prices[pt] !== undefined) ? Number(a.prices[pt]) : Number(a.price || 0);
        const vb = (b.prices && b.prices[pt] !== undefined) ? Number(b.prices[pt]) : Number(b.price || 0);
        return (va - vb) * asc;
      });
    } else {
      this.filteredItems.sort((a, b) => {
        let va = a[field] || "";
        let vb = b[field] || "";
        return va.toString().localeCompare(vb.toString(), "az") * asc;
      });
    }
  },

  sortBy: function(field) {
    if (this.currentSortCol === field) {
      this.currentSortAsc = !this.currentSortAsc;
    } else {
      this.currentSortCol = field;
      this.currentSortAsc = true;
    }
    this.applyCurrentSort();
    this.renderTable();
  },

  sortByPrice: function(pt) {
    this.sortBy(`price_${pt}`);
  },

  exportExcel: function() {
    if (!this.filteredItems || this.filteredItems.length === 0) {
      alert("İxrac etmək üçün əvvəlcə hesabatı formalaşdırın (siyahı boşdur).");
      return;
    }

    const portSel = document.getElementById("pcPortfolioSelect");
    const grpSel = document.getElementById("pcNomGroupSelect");

    const creds = window.SessionManager ? SessionManager.getCredentials() : {};
    const payload = {
      ...creds,
      items: this.filteredItems,
      filters: {
        portfolio: portSel ? portSel.value : "",
        nom_group: grpSel ? grpSel.value : "",
        price_types: this.activePriceTypes || this.selectedPriceTypes,
        price_analysis: this.priceAnalysis,
        selected_only: this.filterSelectedOnly
      }
    };

    const btn = document.getElementById("pcBtnExport");
    if (btn) btn.disabled = true;
    this.updateStatus("Генерация Excel файла...");

    fetch("/api/portfolio_catalog/export_excel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
      if (btn) btn.disabled = false;
      if (data.success && data.download_url) {
        this.updateStatus("Excel файл успешно создан! Скачивание...");
        window.location.href = data.download_url;
      } else {
        alert("Excel xətası: " + (data.error || "Fayl yaradıla bilmədi"));
        this.updateStatus("Ошибка создания Excel");
      }
    })
    .catch(err => {
      if (btn) btn.disabled = false;
      console.error("Excel export error:", err);
      alert("Excel ixracında xəta: " + err.message);
      this.updateStatus("Ошибка экспорта");
    });
  },

  updateCountBadge: function(count) {
    const badge = document.getElementById("pcCountBadge");
    if (badge) {
      badge.textContent = `Всего: ${count.toLocaleString("ru-RU")} товаров`;
    }
  },

  updateStatus: function(text) {
    const el = document.getElementById("pcStatusLeft");
    if (el) el.textContent = text;
  }
};

// Global click handler to close dropdown menu when clicking outside
document.addEventListener("click", function(e) {
  const menu = document.getElementById("pcPriceTypeMenu");
  const btn = document.getElementById("pcPriceTypeDropdownBtn");
  if (menu && menu.style.display === "block") {
    if (!menu.contains(e.target) && (!btn || !btn.contains(e.target))) {
      menu.style.display = "none";
    }
  }
});

// Global helper for opening
function openPortfolioReportWindow() {
  PortfolioCatalog.open();
}

window.PortfolioCatalog = PortfolioCatalog;
window.openPortfolioReportWindow = openPortfolioReportWindow;
