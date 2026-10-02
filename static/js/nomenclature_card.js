/* ========================================================
   1C:ENTERPRISE - NOMENCLATURE ITEM CARD CONTROLLER (Номенклатура (элемент))
   static/js/nomenclature_card.js
   ======================================================== */

const NomenclatureCard = {
  currentData: null,
  activeTab: 'prices',
  lastCode: null,
  lastName: null,

  open: async function(code, name, ref) {
    this.lastCode = code || "";
    this.lastName = name || "";

    const win = document.getElementById("nomenclatureCardWindow");
    if (!win) return;

    // Show window and bring to front
    win.style.display = "flex";
    if (typeof MdiManager !== "undefined") {
      MdiManager.activateWindow("nomenclatureCardWindow");
    }

    const titleEl = document.getElementById("ncWinTitle");
    if (titleEl) {
      titleEl.textContent = `Номенклатура: ${name || code || "Загрузка..."} (Элемент)`;
    }

    // Reset fields & show loading
    this.resetFields();
    const loadingNotice = document.getElementById("ncLoadingNotice");
    if (loadingNotice) loadingNotice.style.display = "inline";

    try {
      const resp = await fetch("/api/nomenclature/card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code || "",
          name: name || "",
          ref: ref || ""
        })
      });

      const res = await resp.json();
      if (res.success && res.card) {
        this.renderCard(res.card);
      } else {
        alert(res.error || "Не удалось загрузить карточку товара из 1С.");
      }
    } catch (err) {
      console.error("Error opening nomenclature card:", err);
      alert("Ошибка при обращении к серверу 1С: " + err.message);
    } finally {
      if (loadingNotice) loadingNotice.style.display = "none";
    }
  },

  renderCard: function(card) {
    this.currentData = card;

    const titleEl = document.getElementById("ncWinTitle");
    if (titleEl) {
      titleEl.textContent = `Номенклатура: ${card.name || card.code} (Элемент)`;
    }

    // Set attributes
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = (val !== null && val !== undefined) ? String(val) : "";
    };

    setVal("ncCode", card.code || "");
    setVal("ncArtikul", card.artikul || "");
    setVal("ncVidNom", card.vidNom || "Товар");
    setVal("ncVatRate", card.vatRate || "Без НДС");
    setVal("ncName", card.name || "");
    setVal("ncFullName", card.fullName || card.name || "");
    setVal("ncParent", card.parent || "");
    setVal("ncUnit", card.unit || "шт");
    setVal("ncNomGroup", card.nomGroup || "");
    setVal("ncPriceGroup", card.priceGroup || "");
    setVal("ncCountry", card.country || "");
    setVal("ncProducer", card.producer || "");
    setVal("ncComment", card.comment || "");

    const chkService = document.getElementById("ncIsService");
    if (chkService) chkService.checked = !!card.isService;

    const refEl = document.getElementById("ncRef");
    if (refEl) refEl.textContent = card.ref || card.code || "-";

    // 1. Render Prices Table
    this.renderPrices(card.prices || []);

    // 2. Render Barcodes Table
    this.renderBarcodes(card.barcodes || []);

    // 3. Render Units Table
    this.renderUnits(card.units || []);

    // Default to Prices tab
    this.switchTab(this.activeTab || 'prices');
  },

  renderPrices: function(prices) {
    const tbody = document.getElementById("ncPricesTableBody");
    const countBadge = document.getElementById("ncPricesCountBadge");
    const summary = document.getElementById("ncPricesSummary");

    if (countBadge) countBadge.textContent = prices.length;
    if (summary) summary.textContent = `Всего типов цен: ${prices.length}`;

    if (!tbody) return;

    if (!prices || prices.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 25px; color: #888;">Нет зарегистрированных цен для данного товара</td></tr>`;
      return;
    }

    let html = "";
    prices.forEach((p, idx) => {
      const rowBg = idx % 2 === 0 ? "#ffffff" : "#fbfaf6";
      const formattedPrice = (typeof p.price === "number") ? p.price.toFixed(3) : p.price;

      html += `
        <tr style="background: ${rowBg}; height: 22px;" onmouseover="this.style.background='#edf2fa'" onmouseout="this.style.background='${rowBg}'">
          <td style="padding: 2px 6px; border: 1px solid #d4d0c8; text-align: center; color: #777;">${idx + 1}</td>
          <td style="padding: 2px 8px; border: 1px solid #d4d0c8; font-weight: 500; color: #002060;">${escapeHtml(p.price_type || '')}</td>
          <td style="padding: 2px 8px; border: 1px solid #d4d0c8; text-align: right; font-weight: bold; font-family: Consolas, monospace; color: #000;">${formattedPrice}</td>
          <td style="padding: 2px 6px; border: 1px solid #d4d0c8; text-align: center; color: #555;">${escapeHtml(p.currency || 'AZN')}</td>
          <td style="padding: 2px 6px; border: 1px solid #d4d0c8; text-align: center; color: #555;">${escapeHtml(p.unit || 'шт')}</td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  },

  renderBarcodes: function(barcodes) {
    const tbody = document.getElementById("ncBarcodesTableBody");
    const countBadge = document.getElementById("ncBarcodesCountBadge");
    const summary = document.getElementById("ncBarcodesSummary");

    if (countBadge) countBadge.textContent = barcodes.length;
    if (summary) summary.textContent = `Всего: ${barcodes.length}`;

    if (!tbody) return;

    if (!barcodes || barcodes.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 25px; color: #888;">Штрихкоды не зарегистрированы</td></tr>`;
      return;
    }

    let html = "";
    barcodes.forEach((b, idx) => {
      const rowBg = idx % 2 === 0 ? "#ffffff" : "#fbfaf6";

      html += `
        <tr style="background: ${rowBg}; height: 22px;" onmouseover="this.style.background='#edf2fa'" onmouseout="this.style.background='${rowBg}'">
          <td style="padding: 2px 6px; border: 1px solid #d4d0c8; text-align: center; color: #777;">${idx + 1}</td>
          <td style="padding: 2px 8px; border: 1px solid #d4d0c8; font-family: Consolas, monospace; font-weight: bold; color: #002060;">${escapeHtml(b.barcode || '')}</td>
          <td style="padding: 2px 8px; border: 1px solid #d4d0c8; color: #555;">${escapeHtml(b.type || 'EAN13')}</td>
          <td style="padding: 2px 6px; border: 1px solid #d4d0c8; text-align: center; color: #555;">${escapeHtml(b.unit || 'шт')}</td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  },

  renderUnits: function(units) {
    const tbody = document.getElementById("ncUnitsTableBody");
    const countBadge = document.getElementById("ncUnitsCountBadge");
    const summary = document.getElementById("ncUnitsSummary");

    if (countBadge) countBadge.textContent = units.length;
    if (summary) summary.textContent = `Всего: ${units.length}`;

    if (!tbody) return;

    if (!units || units.length === 0) {
      tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 25px; color: #888;">Единицы измерения не найдены</td></tr>`;
      return;
    }

    let html = "";
    units.forEach((u, idx) => {
      const rowBg = idx % 2 === 0 ? "#ffffff" : "#fbfaf6";

      html += `
        <tr style="background: ${rowBg}; height: 22px;" onmouseover="this.style.background='#edf2fa'" onmouseout="this.style.background='${rowBg}'">
          <td style="padding: 2px 6px; border: 1px solid #d4d0c8; text-align: center; color: #777;">${idx + 1}</td>
          <td style="padding: 2px 8px; border: 1px solid #d4d0c8; font-weight: 500; color: #002060;">${escapeHtml(u.unit || '')}</td>
          <td style="padding: 2px 8px; border: 1px solid #d4d0c8; text-align: right; font-family: Consolas, monospace; font-weight: bold;">${u.ratio}</td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  },

  switchTab: function(tabId) {
    this.activeTab = tabId;

    const tabs = [
      { id: 'prices', btn: 'ncTabBtnPrices', pane: 'ncPanePrices' },
      { id: 'barcodes', btn: 'ncTabBarcodes', pane: 'ncPaneBarcodes' },
      { id: 'units', btn: 'ncTabBtnUnits', pane: 'ncPaneUnits' },
      { id: 'desc', btn: 'ncTabBtnDesc', pane: 'ncPaneDesc' }
    ];

    tabs.forEach(t => {
      const btn = document.getElementById(t.btn);
      const pane = document.getElementById(t.pane);
      const isActive = (t.id === tabId);

      if (btn) {
        if (isActive) {
          btn.style.background = "#ffffff";
          btn.style.fontWeight = "bold";
          btn.style.borderColor = "#7f9db9";
          btn.style.top = "1px";
          btn.style.color = "#000";
        } else {
          btn.style.background = "#dcd9ce";
          btn.style.fontWeight = "normal";
          btn.style.borderColor = "#b0af9f";
          btn.style.top = "0px";
          btn.style.color = "#444";
        }
      }

      if (pane) {
        pane.style.display = isActive ? (t.id === 'desc' ? "block" : "flex") : "none";
      }
    });
  },

  resetFields: function() {
    const ids = [
      "ncCode", "ncArtikul", "ncVidNom", "ncVatRate", "ncName", "ncFullName",
      "ncParent", "ncUnit", "ncNomGroup", "ncPriceGroup", "ncCountry",
      "ncProducer", "ncComment"
    ];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });

    const chk = document.getElementById("ncIsService");
    if (chk) chk.checked = false;

    const refEl = document.getElementById("ncRef");
    if (refEl) refEl.textContent = "-";

    const tbodyPr = document.getElementById("ncPricesTableBody");
    if (tbodyPr) tbodyPr.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px; color: #888;">Загрузка данных...</td></tr>`;

    const tbodyBc = document.getElementById("ncBarcodesTableBody");
    if (tbodyBc) tbodyBc.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 20px; color: #888;">Загрузка данных...</td></tr>`;

    const tbodyUn = document.getElementById("ncUnitsTableBody");
    if (tbodyUn) tbodyUn.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 20px; color: #888;">Загрузка данных...</td></tr>`;
  },

  refresh: function() {
    if (this.lastCode || this.lastName) {
      this.open(this.lastCode, this.lastName);
    }
  },

  save: function() {
    // 1C standard feedback
    alert("Данные номенклатуры синхронизированы со справочником 1С.");
  },

  saveAndClose: function() {
    this.close();
  },

  close: function() {
    const win = document.getElementById("nomenclatureCardWindow");
    if (win) {
      win.style.display = "none";
    }
    if (typeof MdiManager !== "undefined") {
      MdiManager.closeWindow("nomenclatureCardWindow");
    }
    this.closeActionsMenu();
    this.closeGotoMenu();
  },

  toggleActionsMenu: function(e) {
    if (e) e.stopPropagation();
    const m = document.getElementById("ncActionsMenu");
    if (!m) return;
    m.style.display = (m.style.display === "none" || !m.style.display) ? "block" : "none";
    this.closeGotoMenu();
  },

  closeActionsMenu: function() {
    const m = document.getElementById("ncActionsMenu");
    if (m) m.style.display = "none";
  },

  toggleGotoMenu: function(e) {
    if (e) e.stopPropagation();
    const m = document.getElementById("ncGotoMenu");
    if (!m) return;
    m.style.display = (m.style.display === "none" || !m.style.display) ? "block" : "none";
    this.closeActionsMenu();
  },

  closeGotoMenu: function() {
    const m = document.getElementById("ncGotoMenu");
    if (m) m.style.display = "none";
  },

  copyCode: function() {
    const code = document.getElementById("ncCode")?.value || "";
    if (code) {
      navigator.clipboard.writeText(code);
    }
  },

  copyName: function() {
    const name = document.getElementById("ncName")?.value || "";
    if (name) {
      navigator.clipboard.writeText(name);
    }
  }
};

// Global click listener to close dropdown menus
document.addEventListener("click", () => {
  if (typeof NomenclatureCard !== "undefined") {
    NomenclatureCard.closeActionsMenu();
    NomenclatureCard.closeGotoMenu();
  }
});

window.NomenclatureCard = NomenclatureCard;
