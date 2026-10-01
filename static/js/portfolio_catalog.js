/**
 * 1C:ENTERPRISE - PORTFOLIO CATALOG SYSTEM
 * static/js/portfolio_catalog.js
 */

const PortfolioCatalog = {
  items: [],
  filteredItems: [],
  filtersLoaded: false,
  currentSortCol: null,
  currentSortAsc: true,
  cache: {}, // Instant memory cache: key -> items array

  open: function() {
    console.log("[PORTFOLIO CATALOG] Opening window...");
    const win = document.getElementById("portfolioCatalogWindow");
    if (!win) return;

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

  loadFilters: function() {
    const creds = window.SessionManager ? SessionManager.getCredentials() : {};
    fetch("/api/portfolio_catalog/filters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(creds)
    })
    .then(res => res.json())
    .then(data => {
      if (!data.success) {
        console.error("Failed to load portfolio filters:", data.error);
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

      // 2. Populate Nom Groups Select
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

      // 3. Populate Price Types Select
      const ptSel = document.getElementById("pcPriceTypeSelect");
      if (ptSel) {
        ptSel.innerHTML = '<option value="20">20</option><option value="">(Без цен)</option>';
        (data.price_types || []).forEach(pt => {
          if (pt.name !== "20") {
            const opt = document.createElement("option");
            opt.value = pt.code || pt.name;
            opt.textContent = pt.name;
            ptSel.appendChild(opt);
          }
        });
      }

      this.updateStatus("Фильтры успешно загружены");

      // Auto-trigger load for first portfolio if available
      if (portSel && portSel.options.length > 1 && !this.items.length) {
        portSel.selectedIndex = 1;
        this.onPortfolioChange();
      }
    })
    .catch(err => {
      console.error("Error loading portfolio filters:", err);
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
    const ptSel = document.getElementById("pcPriceTypeSelect");
    const searchInp = document.getElementById("pcSearchInput");

    const creds = window.SessionManager ? SessionManager.getCredentials() : {};
    const payload = {
      ...creds,
      portfolio: portSel ? portSel.value : "",
      nom_group: grpSel ? grpSel.value : "",
      price_type: ptSel ? ptSel.value : "20",
      search: searchInp ? searchInp.value.trim() : ""
    };

    const cacheKey = `${creds.server || ""}_${creds.ref || ""}_${payload.portfolio}_${payload.nom_group}_${payload.price_type}_${payload.search}`;

    // Instant render from cache if available (0 ms)
    if (this.cache[cacheKey]) {
      console.log(`[PORTFOLIO CATALOG] Instant load from cache for '${cacheKey}'`);
      this.items = this.cache[cacheKey];
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

  renderTable: function() {
    const tbody = document.getElementById("pcTableBody");
    if (!tbody) return;

    const list = this.filteredItems;
    this.updateCountBadge(list.length);

    let html = "";
    for (let i = 0; i < list.length; i++) {
      const itm = list[i];
      const bg = (i % 2 === 1) ? "#f7f6f0" : "#ffffff";
      const priceStr = itm.price ? Number(itm.price).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-";

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
          <td style="padding: 3px 5px; border: 1px solid #d4d0c8; text-align: right; font-weight: bold; color: #000080;">${priceStr}</td>
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

      if (field === "price") {
        va = Number(va) || 0;
        vb = Number(vb) || 0;
        return (va - vb) * asc;
      }

      return va.toString().localeCompare(vb.toString(), "az") * asc;
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
    const ptSel = document.getElementById("pcPriceTypeSelect");

    const creds = window.SessionManager ? SessionManager.getCredentials() : {};
    const payload = {
      ...creds,
      items: this.filteredItems,
      filters: {
        portfolio: portSel ? portSel.value : "",
        nom_group: grpSel ? grpSel.value : "",
        price_type: ptSel ? ptSel.value : ""
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

// Global helper for opening
function openPortfolioReportWindow() {
  PortfolioCatalog.open();
}

window.PortfolioCatalog = PortfolioCatalog;
window.openPortfolioReportWindow = openPortfolioReportWindow;
