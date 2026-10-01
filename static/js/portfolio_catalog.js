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
      const targetW = Math.min(1150, Math.max(750, wsW - 40));
      const targetH = Math.min(680, Math.max(420, wsH - 40));
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
    const searchInp = document.getElementById("pcSearchInput");

    const creds = window.SessionManager ? SessionManager.getCredentials() : {};
    const payload = {
      ...creds,
      portfolio: portSel ? portSel.value : "",
      nom_group: grpSel ? grpSel.value : "",
      price_types: this.selectedPriceTypes,
      search: searchInp ? searchInp.value.trim() : ""
    };

    const ptsKey = (this.selectedPriceTypes || []).slice().sort().join(",");
    const cacheKey = `${creds.server || ""}_${creds.ref || ""}_${payload.portfolio}_${payload.nom_group}_${ptsKey}_${payload.search}`;

    // Close price type dropdown if open
    const menu = document.getElementById("pcPriceTypeMenu");
    if (menu) menu.style.display = "none";

    // Instant render from cache if available (0 ms)
    if (this.cache[cacheKey]) {
      console.log(`[PORTFOLIO CATALOG] Instant load from cache for '${cacheKey}'`);
      this.items = this.cache[cacheKey];
      this.activePriceTypes = [...this.selectedPriceTypes];
      this.filteredItems = [...this.items];
      const emptyEl = document.getElementById("pcEmptyState");
      const tableEl = document.getElementById("pcReportTable");
      if (emptyEl) emptyEl.style.display = "none";
      if (tableEl) tableEl.style.display = "table";
      this.renderTable();
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
      this.filteredItems = [...this.items];
      // Save to instant memory cache
      this.cache[cacheKey] = this.items;

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
        this.renderTable();
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

        priceHeadersHtml += `<th style="min-width: 85px; padding: 4px 6px; border: 1px solid #b0af9f; text-align: right; cursor: pointer; white-space: nowrap; ${thBg} ${thColor}" onclick="PortfolioCatalog.sortByPrice('${escapeHtml(pt)}')">Цена (${escapeHtml(pt)})${tag} ⬍</th>`;
      });
    }

    headRow.innerHTML = `
      <th style="width: 40px; padding: 4px 6px; border: 1px solid #b0af9f; text-align: center;">№</th>
      <th style="width: 85px; padding: 4px 6px; border: 1px solid #b0af9f; text-align: left; cursor: pointer;" onclick="PortfolioCatalog.sortBy('code')">Код ⬍</th>
      <th style="width: 95px; padding: 4px 6px; border: 1px solid #b0af9f; text-align: left; cursor: pointer;" onclick="PortfolioCatalog.sortBy('artikul')">Артикул ⬍</th>
      <th style="width: 85px; padding: 4px 6px; border: 1px solid #b0af9f; text-align: left; cursor: pointer;" onclick="PortfolioCatalog.sortBy('cv')">СВ код ⬍</th>
      <th style="width: 110px; padding: 4px 6px; border: 1px solid #b0af9f; text-align: left; cursor: pointer;" onclick="PortfolioCatalog.sortBy('barcode')">Штрихкод ⬍</th>
      <th style="min-width: 250px; padding: 4px 6px; border: 1px solid #b0af9f; text-align: left; cursor: pointer;" onclick="PortfolioCatalog.sortBy('name')">Наименование ⬍</th>
      <th style="width: 140px; padding: 4px 6px; border: 1px solid #b0af9f; text-align: left; cursor: pointer;" onclick="PortfolioCatalog.sortBy('folder')">Папка (Родитель) ⬍</th>
      <th style="width: 130px; padding: 4px 6px; border: 1px solid #b0af9f; text-align: left; cursor: pointer;" onclick="PortfolioCatalog.sortBy('group')">Ном. группа ⬍</th>
      <th style="width: 120px; padding: 4px 6px; border: 1px solid #b0af9f; text-align: left; cursor: pointer;" onclick="PortfolioCatalog.sortBy('portfolio')">Портфель ⬍</th>
      <th style="width: 65px; padding: 4px 6px; border: 1px solid #b0af9f; text-align: center;">Ед. изм.</th>
      ${priceHeadersHtml}
      <th style="width: 110px; padding: 4px 6px; border: 1px solid #b0af9f; text-align: left;">Вид</th>
      <th style="width: 130px; padding: 4px 6px; border: 1px solid #b0af9f; text-align: left;">Производитель</th>
    `;
  },

  renderTable: function() {
    this.renderTableHead();

    const tbody = document.getElementById("pcTableBody");
    if (!tbody) return;

    const list = this.filteredItems;
    this.updateCountBadge(list.length);

    const pts = this.activePriceTypes || this.selectedPriceTypes || [];
    const isAnalysis = Boolean(this.priceAnalysis.enabled);
    const basePt = this.priceAnalysis.basePriceType;

    let html = "";
    for (let i = 0; i < list.length; i++) {
      const itm = list[i];
      const bg = (i % 2 === 1) ? "#f7f6f0" : "#ffffff";

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

          const styleAttr = `padding: 3px 5px; border: ${cellBorder}; text-align: right; font-weight: bold; color: ${cellColor}; white-space: nowrap; ${cellBg ? `background: ${cellBg};` : ''}`;
          priceTds += `<td style="${styleAttr}" ${cellTitle ? `title="${escapeHtml(cellTitle)}"` : ''}>${priceStr}</td>`;
        });
      }

      html += `
        <tr style="background: ${bg}; border-bottom: 1px solid #e0dfd5;" onmouseover="this.style.background='#fffae8'" onmouseout="this.style.background='${bg}'">
          <td style="padding: 3px 5px; border: 1px solid #d4d0c8; text-align: center; color: #777;">${i + 1}</td>
          <td style="padding: 3px 5px; border: 1px solid #d4d0c8; text-align: center; font-family: Consolas, monospace; font-weight: bold; color: #003366;">${escapeHtml(itm.code)}</td>
          <td style="padding: 3px 5px; border: 1px solid #d4d0c8;">${escapeHtml(itm.artikul)}</td>
          <td style="padding: 3px 5px; border: 1px solid #d4d0c8; text-align: center; font-family: Consolas, monospace; color: #2e7d32; font-weight: bold;">${escapeHtml(itm.cv)}</td>
          <td style="padding: 3px 5px; border: 1px solid #d4d0c8; text-align: center; font-family: Consolas, monospace; color: #555;">${escapeHtml(itm.barcode)}</td>
          <td style="padding: 3px 6px; border: 1px solid #d4d0c8; font-weight: 500; color: #111;">${escapeHtml(itm.name)}</td>
          <td style="padding: 3px 5px; border: 1px solid #d4d0c8; color: #444;">${escapeHtml(itm.folder)}</td>
          <td style="padding: 3px 5px; border: 1px solid #d4d0c8; color: #004080; font-weight: 500;">${escapeHtml(itm.group)}</td>
          <td style="padding: 3px 5px; border: 1px solid #d4d0c8; color: #6a1b9a; font-weight: bold;">${escapeHtml(itm.portfolio)}</td>
          <td style="padding: 3px 5px; border: 1px solid #d4d0c8; text-align: center;">${escapeHtml(itm.unit)}</td>
          ${priceTds}
          <td style="padding: 3px 5px; border: 1px solid #d4d0c8; color: #555;">${escapeHtml(itm.type)}</td>
          <td style="padding: 3px 5px; border: 1px solid #d4d0c8; color: #333;">${escapeHtml(itm.manufacturer)}</td>
        </tr>
      `;
    }

    tbody.innerHTML = html;
  },

  onSearchInput: function() {
    const inp = document.getElementById("pcSearchInput");
    const clearBtn = document.getElementById("pcClearSearchBtn");
    const q = inp ? inp.value.trim().toLowerCase() : "";

    if (clearBtn) {
      clearBtn.style.display = q ? "block" : "none";
    }

    if (!q) {
      this.filteredItems = [...this.items];
    } else {
      this.filteredItems = this.items.filter(itm => {
        const src = `${itm.name} ${itm.code} ${itm.artikul} ${itm.cv} ${itm.barcode} ${itm.folder} ${itm.group} ${itm.portfolio} ${itm.manufacturer}`.toLowerCase();
        return src.includes(q);
      });
    }

    this.renderTable();
    this.updateStatus(`Найдено ${this.filteredItems.length} из ${this.items.length}`);
  },

  clearSearch: function() {
    const inp = document.getElementById("pcSearchInput");
    if (inp) {
      inp.value = "";
    }
    this.onSearchInput();
  },

  sortBy: function(field) {
    if (this.currentSortCol === field) {
      this.currentSortAsc = !this.currentSortAsc;
    } else {
      this.currentSortCol = field;
      this.currentSortAsc = true;
    }

    const asc = this.currentSortAsc ? 1 : -1;
    this.filteredItems.sort((a, b) => {
      let va = a[field] || "";
      let vb = b[field] || "";
      return va.toString().localeCompare(vb.toString(), "az") * asc;
    });

    this.renderTable();
  },

  sortByPrice: function(pt) {
    const colKey = `price_${pt}`;
    if (this.currentSortCol === colKey) {
      this.currentSortAsc = !this.currentSortAsc;
    } else {
      this.currentSortCol = colKey;
      this.currentSortAsc = true;
    }

    const asc = this.currentSortAsc ? 1 : -1;
    this.filteredItems.sort((a, b) => {
      const va = (a.prices && a.prices[pt] !== undefined) ? Number(a.prices[pt]) : Number(a.price || 0);
      const vb = (b.prices && b.prices[pt] !== undefined) ? Number(b.prices[pt]) : Number(b.price || 0);
      return (va - vb) * asc;
    });

    this.renderTable();
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
        price_analysis: this.priceAnalysis
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
