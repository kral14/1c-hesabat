/**
 * 1C:ENTERPRISE - SALES DOCUMENT EDITOR CONTROLLER (Реализация товаров и услуг)
 * static/js/sales_doc_editor.js
 */

const SalesDocEditor = {
  currentDocNumber: null,
  currentDocDate: null,
  header: {},
  items: [],
  filteredItems: [],
  selectedRowIdx: null,
  activeTab: "tovary",

  getActiveWin: function() {
    if (window.MdiManager && window.MdiManager.activeWindowId) {
      const activeEl = document.getElementById(window.MdiManager.activeWindowId);
      if (activeEl && (activeEl.id.startsWith("docEditorWindow_") || activeEl.id === "salesDocEditorWindow")) {
        return activeEl;
      }
    }
    const openWins = Array.from(document.querySelectorAll(".mdi-window[id^='docEditorWindow_'], #salesDocEditorWindow"))
      .filter(w => w.style.display !== "none");
    if (openWins.length > 0) {
      openWins.sort((a, b) => (parseInt(b.style.zIndex || 0) - parseInt(a.style.zIndex || 0)));
      return openWins[0];
    }
    return document.getElementById("salesDocEditorWindow");
  },

  open: function(docNumber, docDate, docType) {
    if (!docNumber) return;
    this.currentDocNumber = docNumber;
    this.currentDocDate = docDate || "";
    this.currentDocType = docType || "РеализацияТоваровУслуг";

    let typeKey = "sales";
    if (this.currentDocType === "ВозвратТоваровОтПокупателя") typeKey = "vozvrat";
    else if (this.currentDocType === "ЗаказПокупателя") typeKey = "zakaz";
    else if (this.currentDocType === "РеализацияТоваровУслуг") typeKey = "realiz";
    else typeKey = String(this.currentDocType).replace(/[^a-zA-Z0-9_-]/g, "");

    const cleanNum = String(docNumber).replace("С", "C").replace("с", "c").trim();
    const safeNum = cleanNum.replace(/[^a-zA-Z0-9_-]/g, "_");
    const winId = `docEditorWindow_${typeKey}_${safeNum}`;
    let win = document.getElementById(winId);

    if (!win) {
      const baseWin = document.getElementById("salesDocEditorWindow");
      if (!baseWin) {
        console.error("[SalesDocEditor] Base salesDocEditorWindow template not found!");
        return;
      }

      // Hər yeni sənəd üçün unikal müstəqil pəncərə klonlayırıq
      win = baseWin.cloneNode(true);
      win.id = winId;
      win.dataset.docType = this.currentDocType;
      win.dataset.docNumber = docNumber;
      win.style.display = "flex";
      
      // Pilləli offset (cascade) veririk ki, pəncərələr bir-birinin üstünü tam örtməsin
      const existingDocs = document.querySelectorAll(".mdi-window[id^='docEditorWindow_']").length;
      const offset = (existingDocs * 24) % 150;
      win.style.top = `${25 + offset}px`;
      win.style.left = `${35 + offset}px`;
      const curTopZ = (window.MdiManager ? window.MdiManager.topZIndex + 10 : 200);
      win.style.zIndex = curTopZ;
      document.getElementById("mdiWorkspace").appendChild(win);

      win.setAttribute("onmousedown", `MdiManager.activateWindow('${winId}')`);

      // Başlıq və daxili idarəetmə düymələrini bu pəncərəyə bağlayırıq
      const header = win.querySelector(".mdi-window-header");
      if (header) {
        header.removeAttribute("ondblclick");
        header.ondblclick = (e) => {
          if (e.target.closest(".mdi-win-btn, .window-btn-close")) return;
          MdiManager.toggleMaximize(winId);
        };
      }

      // Daxili bağlama düymələri (həm başlıq X, həm də alt 'Закрыть' düyməsi)
      const closeBtns = win.querySelectorAll(".mdi-win-btn-close, button[onclick*='SalesDocEditor.close']");
      closeBtns.forEach(b => {
        b.removeAttribute("onclick");
        b.onclick = (e) => {
          e.stopPropagation();
          SalesDocEditor.closeInstance(winId);
        };
      });
      const maxBtns = win.querySelectorAll(".mdi-win-btn-max");
      maxBtns.forEach(b => {
        b.removeAttribute("onclick");
        b.onclick = (e) => {
          e.stopPropagation();
          MdiManager.toggleMaximize(winId);
        };
      });
      const minBtns = win.querySelectorAll(".mdi-win-btn-min");
      minBtns.forEach(b => {
        b.removeAttribute("onclick");
        b.onclick = (e) => {
          e.stopPropagation();
          MdiManager.minimizeWindow(winId);
        };
      });
    } else {
      win.style.display = "flex";
      win.classList.remove("minimized");
      win.classList.add("active");
    }

    let mdiPrefix = "Реализация";
    let docIcon = "📋";

    if (this.currentDocType === "ВозвратТоваровОтПокупателя") {
      mdiPrefix = "Возврат";
      docIcon = "↩️";
    } else if (this.currentDocType === "ЗаказПокупателя") {
      mdiPrefix = "Заказ";
      docIcon = "🛒";
    }

    // MDI Manager-də aktivləşdiririk
    if (window.MdiManager) {
      MdiManager.activateWindow(winId, {
        title: `${mdiPrefix}: № ${docNumber}`,
        icon: docIcon,
        closeFn: () => SalesDocEditor.closeInstance(winId)
      });
    } else {
      win.style.display = "flex";
      win.classList.remove("minimized");
      win.classList.add("active");
    }

    // Əgər aktivləşdirildikdən sonra da z-index jurnaldan aşağı qalıbsa, ən önə çəkirik
    if (window.MdiManager && win) {
      win.style.zIndex = Math.max(parseInt(win.style.zIndex || 0), window.MdiManager.topZIndex);
    }

    this.showLoadingInWin(win, true);
    this.fetchDocumentDataForWin(win, docNumber, this.currentDocType);
  },

  closeInstance: function(winId) {
    if (window.MdiManager) {
      MdiManager.closeWindow(winId);
      if (window.MdiManager.windows && window.MdiManager.windows[winId]) {
        delete window.MdiManager.windows[winId];
      }
    }
    const win = document.getElementById(winId);
    if (win) {
      win.style.display = "none";
      // Klonlanmış pəncərədirsə DOM-dan tam silirik
      if (winId !== "salesDocEditorWindow") {
        win.remove();
      }
    }
  },

  close: function() {
    const win = this.getActiveWin();
    if (win && win.id && win.id !== "salesDocEditorWindow") {
      this.closeInstance(win.id);
      return;
    }
    let typeKey = "sales";
    if (this.currentDocType === "ВозвратТоваровОтПокупателя") typeKey = "vozvrat";
    else if (this.currentDocType === "ЗаказПокупателя") typeKey = "zakaz";
    else if (this.currentDocType === "РеализацияТоваровУслуг") typeKey = "realiz";
    const cleanNum = String(this.currentDocNumber || "").replace("С", "C").replace("с", "c").trim();
    const safeNum = cleanNum.replace(/[^a-zA-Z0-9_-]/g, "_");
    this.closeInstance(`docEditorWindow_${typeKey}_${safeNum}`);
  },

  showLoadingInWin: function(win, show) {
    const el = win ? win.querySelector("#sdeLoadingState, [id^='sdeLoadingState']") : document.getElementById("sdeLoadingState");
    if (el) el.style.display = show ? "flex" : "none";
  },

  fetchDocumentData: function(docNumber) {
    this.fetchDocumentDataForWin(document.getElementById("salesDocEditorWindow"), docNumber, this.currentDocType);
  },

  fetchDocumentDataForWin: function(win, docNumber, docType) {
    const dType = docType || (win ? win.dataset.docType : null) || this.currentDocType || "РеализацияТоваровУслуг";
    const creds = window.SessionManager ? SessionManager.getCredentials() : {};
    fetch("/api/documents/details", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...creds,
        doc_type: dType,
        number: docNumber
      })
    })
    .then(r => r.json())
    .then(res => {
      this.showLoadingInWin(win, false);
      if (!res.success) {
        alert("1C Xətası: " + (res.error || "Sənədi yükləmək mümkün olmadı"));
        return;
      }

      this.header = res.header || {};
      const rawLines = res.lines || [];

      this.items = rawLines.map((it, idx) => {
        const qty = Number(it.quantity != null ? it.quantity : 1);
        const pr = Number(it.price || 0);
        const sm = Number(it.sum != null ? it.sum : (qty * pr));
        const vatSm = Number(it.vat_sum != null ? it.vat_sum : (sm * 0.18));
        const tot = Number(it.total != null ? it.total : (sm + vatSm));

        return {
          line_num: idx + 1,
          code: String(it.code || "").trim(),
          artikul: String(it.artikul || "").trim(),
          name: String(it.name || "").trim(),
          quantity: qty,
          unit: String(it.unit || "əd").trim(),
          coefficient: Number(it.coefficient || 1.0),
          price: pr,
          discount_auto: Number(it.discount_auto != null ? it.discount_auto : 0),
          discount_manual: Number(it.discount_manual != null ? it.discount_manual : (it.discount_percent || 0)),
          sum: sm,
          vat_rate: String(it.vat_rate || (vatSm > 0 ? "18%" : "Без НДС")).trim(),
          vat_sum: vatSm,
          total: tot,
          account_bu: String(it.account_bu || "—").trim(),
          income_account_bu: String(it.income_account_bu || "—").trim(),
          price_type: String(it.price_type || "").trim()
        };
      });

      this.filteredItems = [...this.items];
      this.selectedRowIdx = this.filteredItems.length > 0 ? 0 : null;

      this.renderHeaderInWin(win, this.header, docNumber, dType);
      this.renderTableInWin(win, this.filteredItems);
      this.recalculateTotalsInWin(win, this.filteredItems);

      // Pogruzka tab is only relevant for Realizatsiya
      const pogruzkaBtn = win.querySelector("#sdeTabBtnPogruzka, [id^='sdeTabBtnPogruzka']");
      if (pogruzkaBtn) {
        pogruzkaBtn.style.display = (dType === "РеализацияТоваровУслуг") ? "inline-flex" : "none";
      }

      this.pogruzki = res.pogruzki || [];
      if (dType === "РеализацияТоваровУслуг") {
        this.renderPogruzkaTabInWin(win, this.pogruzki);
      }
      this.switchTab("tovary");
    })
    .catch(err => {
      this.showLoadingInWin(win, false);
      console.error("Sales doc load error:", err);
      alert("Xəta: " + err.message);
    });
  },

  renderHeaderInWin: function(win, header, docNumber, docType) {
    if (!win) return;
    const h = header || this.header;
    const docNum = h.number || docNumber || this.currentDocNumber || "";
    const docDt = h.date || this.currentDocDate || "";
    const dType = docType || (win ? win.dataset.docType : null) || this.currentDocType || "РеализацияТоваровУслуг";

    let titlePrefix = "Реализация товаров и услуг";
    let docIcon = "📋";
    if (dType === "ВозвратТоваровОтПокупателя") {
      titlePrefix = "Возврат товаров от покупателя";
      docIcon = "↩️";
    } else if (dType === "ЗаказПокупателя") {
      titlePrefix = "Заказ покупателя";
      docIcon = "🛒";
    }

    const titleEl = win.querySelector("#sdeWindowTitle, .mdi-win-title-text");
    if (titleEl) {
      titleEl.textContent = `${titlePrefix}: № ${docNum} от ${docDt}`;
    }
    const iconEl = win.querySelector(".mdi-win-icon");
    if (iconEl) {
      iconEl.textContent = docIcon;
    }

    const badgeEl = win.querySelector("#sdeStatusBadge, [id^='sdeStatusBadge']");
    if (badgeEl) {
      if (h.posted) {
        badgeEl.textContent = "✔ ПРОВЕДЕН";
        badgeEl.style.background = "#2e7d32";
      } else {
        badgeEl.textContent = "📄 НЕ ПРОВЕДЕН";
        badgeEl.style.background = "#ed6c02";
      }
    }

    const setVal = (id, val) => {
      const el = win.querySelector(`#${id}, [id^='${id}']`);
      if (el) el.value = val || "";
    };

    setVal("sdeDocNumber", docNum);
    setVal("sdeDocDate", docDt);
    setVal("sdeDocOrg", h.organization || "Aztrade MMC");
    setVal("sdeDocKontragent", h.kontragent || "");
    setVal("sdeDocContract", h.contract || "");
    setVal("sdeDocWarehouse", h.warehouse || "");
    setVal("sdeDocPriceType", h.price_type || "");
    setVal("sdeDocCurrency", h.currency || "AZN");
    setVal("sdeDocComment", h.comment || "");

    const respEl = win.querySelector("#sdeDocResponsible, [id^='sdeDocResponsible']");
    if (respEl) respEl.textContent = h.responsible || "-";
  },

  renderTableInWin: function(win, items) {
    if (!win) win = this.getActiveWin() || document.getElementById("salesDocEditorWindow");
    if (!win) return;
    const tbody = win.querySelector("#sdeTableBody, [id^='sdeTableBody']");
    if (!tbody) return;

    const list = items || this.filteredItems || [];
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="16" style="padding: 30px; text-align: center; color: #888; font-style: italic;">Накладная не содержит строк товаров</td></tr>`;
      this.recalculateTotalsInWin(win, list);
      return;
    }

    let html = "";
    list.forEach((it, idx) => {
      const isSel = (this.selectedRowIdx === idx);
      const bg = isSel ? "#dceaf7" : (idx % 2 === 1 ? "#f9f8f2" : "#ffffff");

      html += `
        <tr style="background: ${bg}; height: 22px; cursor: pointer; user-select: text;" data-row-idx="${idx}">
          <td style="text-align: center; border: 1px solid #d4d0c8; padding: 2px; color: #555;">${it.line_num || (idx + 1)}</td>
          <td style="border: 1px solid #d4d0c8; padding: 1px 4px; font-weight: bold; color: #004080; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${this.escapeHtml(it.code)}</td>
          <td style="border: 1px solid #d4d0c8; padding: 1px 4px; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${this.escapeHtml(it.artikul || "-")}</td>
          <td style="border: 1px solid #d4d0c8; padding: 1px 4px; color: #111; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${this.escapeHtml(it.name)}</td>
          <td style="text-align: right; border: 1px solid #d4d0c8; padding: 1px 4px; font-weight: bold;">${it.quantity}</td>
          <td style="text-align: center; border: 1px solid #d4d0c8; padding: 1px 4px;">${this.escapeHtml(it.unit)}</td>
          <td style="text-align: right; border: 1px solid #d4d0c8; padding: 1px 4px;">${Number(it.coefficient || 1).toFixed(2)}</td>
          <td style="text-align: right; border: 1px solid #d4d0c8; padding: 1px 4px;">${Number(it.price || 0).toFixed(2)}</td>
          <td style="text-align: right; border: 1px solid #d4d0c8; padding: 1px 4px; color: ${Number(it.discount_auto || 0) > 0 ? '#002060; font-weight: bold;' : '#777;'}">${Number(it.discount_auto || 0).toFixed(2)}%</td>
          <td style="text-align: right; border: 1px solid #d4d0c8; padding: 1px 4px; color: ${Number(it.discount_manual || 0) > 0 ? '#002060; font-weight: bold;' : '#777;'}">${Number(it.discount_manual || 0).toFixed(2)}%</td>
          <td style="text-align: right; border: 1px solid #d4d0c8; padding: 1px 4px; font-weight: bold;">${Number(it.sum || 0).toFixed(2)}</td>
          <td style="text-align: center; border: 1px solid #d4d0c8; padding: 1px 4px;">${this.escapeHtml(it.vat_rate)}</td>
          <td style="text-align: right; border: 1px solid #d4d0c8; padding: 1px 4px;">${Number(it.vat_sum || 0).toFixed(2)}</td>
          <td style="text-align: right; border: 1px solid #d4d0c8; padding: 1px 4px; font-weight: bold; color: #002060;">${Number(it.total || 0).toFixed(2)}</td>
          <td style="text-align: center; border: 1px solid #d4d0c8; padding: 1px 4px; font-weight: 500; color: #002060;">${this.escapeHtml(it.account_bu || '—')}</td>
          <td style="text-align: center; border: 1px solid #d4d0c8; padding: 1px 4px; font-weight: 500; color: #002060;">${this.escapeHtml(it.income_account_bu || '—')}</td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
    this.recalculateTotalsInWin(win, list);
  },

  recalculateTotalsInWin: function(win, items) {
    if (!win) win = this.getActiveWin() || document.getElementById("salesDocEditorWindow");
    if (!win) return;
    const list = items || this.filteredItems || this.items || [];

    let totQty = 0;
    let totBase = 0;       // İlkin məbləğ (Endirimsiz: qiymət * say)
    let totDiscount = 0;   // Endirim məbləği
    let totNet = 0;        // Məbləğ (Сумма без НДС / sətir məbləği)
    let totVat = 0;        // ƏDV məbləği
    let totGrand = 0;      // Yekun / Son Məbləğ (Всего)

    list.forEach(it => {
      const q = Number(it.quantity || 0);
      const p = Number(it.price || 0);
      const lineBase = Number((q * p).toFixed(2));
      const lineSum = Number((it.sum != null ? it.sum : lineBase).toFixed(2));

      const dAuto = Number(it.discount_auto || 0);
      const dMan = Number(it.discount_manual || 0);
      const dPercent = dAuto + dMan;

      let lineDisc = 0;
      if (lineBase > lineSum) {
        lineDisc = Number((lineBase - lineSum).toFixed(2));
      } else if (dPercent > 0) {
        lineDisc = Number((lineBase * (dPercent / 100)).toFixed(2));
      }

      const vatSm = Number((it.vat_sum != null ? it.vat_sum : 0).toFixed(2));
      const totSm = Number((it.total != null ? it.total : lineSum).toFixed(2));

      totQty += q;
      totBase += (lineBase > lineSum ? lineBase : (lineSum + lineDisc));
      totDiscount += lineDisc;
      totNet += lineSum;
      totVat += vatSm;
      totGrand += totSm;
    });

    const setTxt = (id, val) => {
      const el = win ? win.querySelector(`#${id}, [id^='${id}']`) : document.getElementById(id);
      if (el) el.textContent = val;
      const globalEl = document.getElementById(id);
      if (globalEl && globalEl !== el) globalEl.textContent = val;
    };

    // 1C standard: Əgər sənəddə ƏDV daxildirsə (Всего == Сумма), "Сумма без НДС" = Всего - НДС
    const netWithoutVat = (Math.abs(totGrand - totNet) < 0.05 && totVat > 0)
      ? Math.max(0, totGrand - totVat)
      : totNet;

    const baseStr = `${totBase.toFixed(2)} AZN`;
    const discStr = `${totDiscount > 0 ? '-' : ''}${totDiscount.toFixed(2)} AZN`;
    const netStr = `${netWithoutVat.toFixed(2)} AZN`;
    const vatStr = `${totVat.toFixed(2)} AZN`;
    const grandStr = `${totGrand.toFixed(2)} AZN`;
    const rowsBadgeStr = `Строк: ${list.length}`;

    // Update the 1C Summary Panel in Footer
    setTxt("sdeTotalSumBase", baseStr);
    setTxt("sdeTotalDiscount", discStr);
    setTxt("sdeTotalSumNet", netStr);
    setTxt("sdeTotalSumVat", vatStr);
    setTxt("sdeTotalSumGross", grandStr);

    // Update row count badges and fallbacks
    setTxt("sdeRowCountBadge", rowsBadgeStr);
    setTxt("sdeStatusRowCount", `${list.length} строк`);
    setTxt("sdeFooterQty", totQty.toLocaleString("ru-RU"));
    setTxt("sdeFooterSum", netStr);
    setTxt("sdeFooterVat", vatStr);
    setTxt("sdeFooterTotal", grandStr);
  },

  renderHeader: function() {
    const h = this.header;
    const docNum = h.number || this.currentDocNumber || "";
    const docDt = h.date || this.currentDocDate || "";

    const titleEl = document.getElementById("sdeWindowTitle");
    if (titleEl) {
      titleEl.textContent = `Реализация товаров и услуг: № ${docNum} от ${docDt}`;
    }

    const badgeEl = document.getElementById("sdeStatusBadge");
    if (badgeEl) {
      if (h.posted) {
        badgeEl.textContent = "✔ ПРОВЕДЕН";
        badgeEl.style.background = "#2e7d32";
      } else {
        badgeEl.textContent = "📄 НЕ ПРОВЕДЕН";
        badgeEl.style.background = "#ed6c02";
      }
    }

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val || "";
    };

    setVal("sdeDocNumber", docNum);
    setVal("sdeDocDate", docDt);
    setVal("sdeDocOrg", h.organization || "Aztrade MMC");
    setVal("sdeDocKontragent", h.kontragent || "TEST 12B");
    setVal("sdeDocContract", h.contract || "Договор поставки");
    setVal("sdeDocWarehouse", h.warehouse || "Основной склад");
    setVal("sdeDocPriceType", h.price_type || "Оптовая");
    setVal("sdeDocCurrency", h.currency || "AZN");
    setVal("sdeDocComment", h.comment || "");

    const respEl = document.getElementById("sdeDocResponsible");
    if (respEl) respEl.textContent = h.responsible || "Emin";
  },

  renderTable: function() {
    const win = this.getActiveWin() || document.getElementById("salesDocEditorWindow");
    if (!win) return;
    const tbody = win.querySelector("#sdeTableBody, [id^='sdeTableBody']");
    if (!tbody) return;

    if (!this.filteredItems.length) {
      tbody.innerHTML = `<tr><td colspan="12" style="padding: 30px; text-align: center; color: #888; font-style: italic;">Накладная не содержит строк товаров</td></tr>`;
      this.updateRowCount();
      return;
    }

    let html = "";
    this.filteredItems.forEach((it, idx) => {
      const isSel = (this.selectedRowIdx === idx);
      const bg = isSel ? "#dceaf7" : (idx % 2 === 1 ? "#f9f8f2" : "#ffffff");

      html += `
        <tr style="background: ${bg}; height: 22px; cursor: pointer; user-select: text;" data-row-idx="${idx}" class="${isSel ? 'sde-row-selected' : ''}" onclick="SalesDocEditor.selectRow(${idx})">
          <!-- № -->
          <td data-col="num" style="text-align: center; border: 1px solid #d4d0c8; padding: 2px; color: #555; user-select: text;" onclick="SalesDocEditor.selectCell(${idx}, 'num', this, event)">${it.line_num || (idx + 1)}</td>

          <!-- Код -->
          <td data-col="code" style="border: 1px solid #d4d0c8; padding: 1px 4px; font-weight: bold; color: #004080; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; user-select: text;" onclick="SalesDocEditor.selectCell(${idx}, 'code', this, event)">
            ${this.escapeHtml(it.code)}
          </td>

          <!-- Артикул -->
          <td data-col="artikul" style="border: 1px solid #d4d0c8; padding: 1px 4px; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; user-select: text;" onclick="SalesDocEditor.selectCell(${idx}, 'artikul', this, event)">
            ${this.escapeHtml(it.artikul || "-")}
          </td>

          <!-- Номенклатура (с кнопками ... и 🔍) -->
          <td data-col="name" class="sde-nom-cell" style="border: 1px solid #d4d0c8; padding: 1px 2px; position: relative; user-select: text;" onclick="SalesDocEditor.selectCell(${idx}, 'name', this, event)">
            <div class="sde-nom-cell-wrapper" style="display: flex; align-items: stretch; width: 100%; height: 19px;">
              <input type="text" value="${this.escapeHtml(it.name)}" 
                     title="${this.escapeHtml(it.name)} (F4 və ya ... ilə kataloqda aç)"
                     onchange="SalesDocEditor.onNameChange(${idx}, this.value)"
                     onkeydown="if(event.key === 'F4'){ event.preventDefault(); SalesDocEditor.openNomPicker(${idx}); }"
                     style="flex: 1; min-width: 0; height: 100%; border: 1px solid transparent; background: transparent; font-family: Tahoma, sans-serif; font-size: 11px; padding: 0 4px; outline: none; text-overflow: ellipsis; overflow: hidden; box-sizing: border-box;"
                     onfocus="this.select(); SalesDocEditor.selectCell(${idx}, 'name', this.closest('td'));">
              <div class="sde-nom-btns-group">
                <button type="button" onclick="event.stopPropagation(); SalesDocEditor.openNomPicker(${idx})" 
                        title="Справочник: Номенклатура (Выбрать товар из списка...) [F4]"
                        class="sde-cell-btn btn-1c-dots">
                  ...
                </button>
                <button type="button" onclick="event.stopPropagation(); SalesDocEditor.openItemCard(${idx})" 
                        title="Открыть карточку номенклатуры (Lupa)"
                        class="sde-cell-btn btn-1c-lupa">
                  🔍
                </button>
              </div>
            </div>
          </td>

          <!-- Количество -->
          <td data-col="quantity" style="border: 1px solid #d4d0c8; padding: 1px 3px; text-align: right; user-select: text;" onclick="SalesDocEditor.selectCell(${idx}, 'quantity', this, event)">
            <input type="text" value="${Number(it.quantity).toFixed(2)}"
                   onchange="SalesDocEditor.onQtyChange(${idx}, this.value)"
                   onfocus="this.select(); SalesDocEditor.selectCell(${idx}, 'quantity', this.closest('td'));"
                   style="width: 100%; height: 19px; text-align: right; border: 1px solid transparent; background: transparent; font-family: Tahoma, sans-serif; font-size: 11px; font-weight: bold; outline: none; padding: 0 2px; box-sizing: border-box;">
          </td>

          <!-- Единица -->
          <td data-col="unit" style="text-align: center; border: 1px solid #d4d0c8; padding: 2px; color: #444; user-select: text;" onclick="SalesDocEditor.selectCell(${idx}, 'unit', this, event)">${this.escapeHtml(it.unit || "əd")}</td>

          <!-- Коэффициент -->
          <td data-col="coefficient" style="text-align: center; border: 1px solid #d4d0c8; padding: 2px; color: #666; user-select: text;" onclick="SalesDocEditor.selectCell(${idx}, 'coefficient', this, event)">${Number(it.coefficient || 1).toFixed(0)}</td>

          <!-- Цена -->
          <td data-col="price" style="border: 1px solid #d4d0c8; padding: 1px 3px; text-align: right; user-select: text;" onclick="SalesDocEditor.selectCell(${idx}, 'price', this, event)">
            <input type="text" value="${Number(it.price).toFixed(2)}"
                   onchange="SalesDocEditor.onPriceChange(${idx}, this.value)"
                   onfocus="this.select(); SalesDocEditor.selectCell(${idx}, 'price', this.closest('td'));"
                   style="width: 100%; height: 19px; text-align: right; border: 1px solid transparent; background: transparent; font-family: Tahoma, sans-serif; font-size: 11px; font-weight: bold; outline: none; padding: 0 2px; box-sizing: border-box;">
          </td>

          <!-- % Скидки (Авто) -->
          <td data-col="discount_auto" style="text-align: right; border: 1px solid #d4d0c8; padding: 2px 4px; color: ${Number(it.discount_auto || 0) > 0 ? '#002060; font-weight: bold;' : '#777;'}; user-select: text;" onclick="SalesDocEditor.selectCell(${idx}, 'discount_auto', this, event)">
            ${Number(it.discount_auto || 0).toFixed(2)}%
          </td>

          <!-- % Скидки (Ручн) -->
          <td data-col="discount_manual" style="text-align: right; border: 1px solid #d4d0c8; padding: 2px 4px; color: ${Number(it.discount_manual || 0) > 0 ? '#002060; font-weight: bold;' : '#777;'}; user-select: text;" onclick="SalesDocEditor.selectCell(${idx}, 'discount_manual', this, event)">
            ${Number(it.discount_manual || 0).toFixed(2)}%
          </td>

          <!-- Сумма -->
          <td data-col="sum" style="text-align: right; border: 1px solid #d4d0c8; padding: 2px 6px; font-weight: bold; color: #111; user-select: text;" onclick="SalesDocEditor.selectCell(${idx}, 'sum', this, event)">
            ${Number(it.sum).toFixed(2)}
          </td>

          <!-- % НДС -->
          <td data-col="vat_rate" style="text-align: center; border: 1px solid #d4d0c8; padding: 2px; color: #555; user-select: text;" onclick="SalesDocEditor.selectCell(${idx}, 'vat_rate', this, event)">${this.escapeHtml(it.vat_rate || "18%")}</td>

          <!-- Сумма НДС -->
          <td data-col="vat_sum" style="text-align: right; border: 1px solid #d4d0c8; padding: 2px 5px; color: #444; user-select: text;" onclick="SalesDocEditor.selectCell(${idx}, 'vat_sum', this, event)">
            ${Number(it.vat_sum).toFixed(2)}
          </td>

          <!-- Всего -->
          <td data-col="total" style="text-align: right; border: 1px solid #d4d0c8; padding: 2px 6px; font-weight: bold; color: #002060; user-select: text;" onclick="SalesDocEditor.selectCell(${idx}, 'total', this, event)">
            ${Number(it.total).toFixed(2)}
          </td>

          <!-- Счет БУ -->
          <td data-col="account_bu" style="text-align: center; border: 1px solid #d4d0c8; padding: 2px 4px; font-weight: 500; color: #002060; user-select: text;" onclick="SalesDocEditor.selectCell(${idx}, 'account_bu', this, event)">
            ${this.escapeHtml(it.account_bu || '—')}
          </td>

          <!-- Счет доходов -->
          <td data-col="income_account_bu" style="text-align: center; border: 1px solid #d4d0c8; padding: 2px 4px; font-weight: 500; color: #002060; user-select: text;" onclick="SalesDocEditor.selectCell(${idx}, 'income_account_bu', this, event)">
            ${this.escapeHtml(it.income_account_bu || '—')}
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
    this.updateRowCount();
    this.recalculateTotals();
  },

  selectedColKey: "name",

  selectCell: function(rowIdx, colKey, targetTd, event) {
    if (event) event.stopPropagation();
    this.selectedRowIdx = rowIdx;
    if (colKey) this.selectedColKey = colKey;

    const win = this.getActiveWin() || document.getElementById("salesDocEditorWindow");
    const tbody = win ? win.querySelector("#sdeTableBody, [id^='sdeTableBody']") : document.getElementById("sdeTableBody");
    if (!tbody) return;
    const rows = tbody.querySelectorAll("tr");
    rows.forEach((r, i) => {
      const isSel = (i === rowIdx);
      const defaultBg = (i % 2 === 1 ? "#f9f8f2" : "#ffffff");
      r.style.background = isSel ? "#dceaf7" : defaultBg;
      r.style.color = "#111111";
      if (isSel) r.classList.add("sde-row-selected");
      else r.classList.remove("sde-row-selected");

      const cells = r.querySelectorAll("td");
      cells.forEach(td => {
        const k = td.getAttribute("data-col");
        const isCellActive = isSel && (targetTd ? td === targetTd : k === this.selectedColKey);
        const inp = td.querySelector("input:not([type='checkbox']):not([type='button']), textarea");

        if (isCellActive) {
          td.style.setProperty("background", "#316ac5", "important");
          td.style.setProperty("color", "#ffffff", "important");
          td.classList.add("c1-cell-active");
          td.classList.add("sde-cell-active");

          if (inp) {
            inp.style.setProperty("background", "#316ac5", "important");
            inp.style.setProperty("color", "#ffffff", "important");
            inp.focus();
            inp.select();
            window.lastActive1cCellText = inp.value;
          } else {
            this.copyAndSelectCellText(td);
          }
        } else {
          td.style.setProperty("background", isSel ? "#dceaf7" : defaultBg);
          td.style.setProperty("color", "#111111");
          td.classList.remove("c1-cell-active");
          td.classList.remove("sde-cell-active");

          if (inp) {
            inp.style.setProperty("background", "transparent");
            inp.style.setProperty("color", (k === "code") ? "#004080" : "#111111");
          }
        }
      });
    });
  },

  selectRow: function(idx) {
    this.selectCell(idx, this.selectedColKey || "name");
  },

  copyAndSelectCellText: function(cellEl) {
    if (!cellEl) return;
    const text = cellEl.innerText.trim();
    window.lastActive1cCellText = text;
    try {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(cellEl);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch(e) {}
  },

  onQtyChange: function(idx, rawVal) {
    const it = this.filteredItems[idx];
    if (!it) return;
    const val = parseFloat(String(rawVal).replace(",", ".")) || 0;
    it.quantity = val;
    const base = Number((it.quantity * it.price).toFixed(2));
    const discPct = Number(it.discount_auto || 0) + Number(it.discount_manual || 0);
    const discAmount = discPct > 0 ? Number((base * (discPct / 100)).toFixed(2)) : 0;
    it.sum = Number((base - discAmount).toFixed(2));
    it.vat_sum = (it.vat_rate === "Без НДС") ? 0.0 : Number((it.sum * 0.18).toFixed(2));
    it.total = Number((it.sum + it.vat_sum).toFixed(2));

    const win = this.getActiveWin();
    this.renderTableInWin(win, this.filteredItems);
  },

  onPriceChange: function(idx, rawVal) {
    const it = this.filteredItems[idx];
    if (!it) return;
    const val = parseFloat(String(rawVal).replace(",", ".")) || 0;
    it.price = val;
    const base = Number((it.quantity * it.price).toFixed(2));
    const discPct = Number(it.discount_auto || 0) + Number(it.discount_manual || 0);
    const discAmount = discPct > 0 ? Number((base * (discPct / 100)).toFixed(2)) : 0;
    it.sum = Number((base - discAmount).toFixed(2));
    it.vat_sum = (it.vat_rate === "Без НДС") ? 0.0 : Number((it.sum * 0.18).toFixed(2));
    it.total = Number((it.sum + it.vat_sum).toFixed(2));

    const win = this.getActiveWin();
    this.renderTableInWin(win, this.filteredItems);
  },

  onNameChange: function(idx, val) {
    const it = this.filteredItems[idx];
    if (it) it.name = String(val || "").trim();
  },

  recalculateTotals: function() {
    const win = this.getActiveWin() || document.getElementById("salesDocEditorWindow");
    this.recalculateTotalsInWin(win, this.filteredItems || this.items);
  },

  updateRowCount: function() {
    const win = this.getActiveWin() || document.getElementById("salesDocEditorWindow");
    const badge = win ? win.querySelector("#sdeRowCountBadge, [id^='sdeRowCountBadge']") : document.getElementById("sdeRowCountBadge");
    if (badge) {
      badge.textContent = `Строк: ${this.filteredItems.length}`;
    }
  },

  addRow: function() {
    const win = this.getActiveWin();
    const searchInp = win ? win.querySelector("#sdeTableSearchInp, [id^='sdeTableSearchInp']") : document.getElementById("sdeTableSearchInp");
    if (searchInp && searchInp.value.trim()) {
      searchInp.value = "";
    }

    const newItm = {
      line_num: this.items.length + 1,
      code: "",
      artikul: "",
      name: "",
      quantity: 1.0,
      unit: "əd",
      coefficient: 1.0,
      price: 0.0,
      discount_auto: 0.0,
      discount_manual: 0.0,
      sum: 0.0,
      vat_rate: "18%",
      vat_sum: 0.0,
      total: 0.0,
      account_bu: "41.01",
      income_account_bu: "46.01",
      price_type: ""
    };

    this.items.push(newItm);
    this.filteredItems = [...this.items];
    this.selectedRowIdx = this.filteredItems.length - 1;

    this.renderTableInWin(win, this.filteredItems);

    // Scroll to bottom
    setTimeout(() => {
      const wrapper = win ? win.querySelector("#sdeTableWrapper, [id^='sdeTableWrapper']") : document.getElementById("sdeTableWrapper");
      if (wrapper) wrapper.scrollTop = wrapper.scrollHeight;
    }, 50);
  },

  deleteSelectedRow: function() {
    if (this.selectedRowIdx === null || this.selectedRowIdx < 0 || this.selectedRowIdx >= this.filteredItems.length) {
      return;
    }
    const itm = this.filteredItems[this.selectedRowIdx];
    this.items = this.items.filter(x => x !== itm);
    this.items.forEach((x, i) => x.line_num = i + 1);

    const win = this.getActiveWin();
    const inp = win ? win.querySelector("#sdeTableSearchInp, [id^='sdeTableSearchInp']") : document.getElementById("sdeTableSearchInp");
    const q = inp ? inp.value.trim().toLowerCase() : "";
    if (!q) {
      this.filteredItems = [...this.items];
    } else {
      this.filteredItems = this.items.filter(it => {
        return (it.name && it.name.toLowerCase().includes(q)) ||
               (it.code && it.code.toLowerCase().includes(q)) ||
               (it.artikul && it.artikul.toLowerCase().includes(q));
      });
    }

    if (this.selectedRowIdx >= this.filteredItems.length) {
      this.selectedRowIdx = this.filteredItems.length - 1;
    }
    this.renderTableInWin(win, this.filteredItems);
  },

  filterTableRows: function() {
    const win = this.getActiveWin() || document.getElementById("salesDocEditorWindow");
    const inp = win ? win.querySelector("#sdeTableSearchInp, [id^='sdeTableSearchInp']") : document.getElementById("sdeTableSearchInp");
    const q = inp ? inp.value.trim().toLowerCase() : "";

    if (!q) {
      this.filteredItems = [...this.items];
    } else {
      this.filteredItems = this.items.filter(it => {
        return (it.name && it.name.toLowerCase().includes(q)) ||
               (it.code && it.code.toLowerCase().includes(q)) ||
               (it.artikul && it.artikul.toLowerCase().includes(q));
      });
    }
    this.renderTableInWin(win, this.filteredItems);
  },

  // Lupa (🔍): Opens the INSIDE of that specific nomenclature item (Карточка номенклатуры / Элемент)
  openItemCard: function(idx) {
    const it = this.filteredItems[idx];
    if (!it) return;
    if (typeof NomenclatureCard !== "undefined" && NomenclatureCard.open) {
      NomenclatureCard.open(it.code, it.name);
    } else {
      alert(`Карточка номенклатуры:\nКод: ${it.code}\nТовар: ${it.name}`);
    }
  },

  // 3 Dots (...): Opens the Nomenclature Catalog list (Справочник: Номенклатура) to browse/select items
  openNomPicker: function(idx) {
    const it = this.filteredItems[idx];
    if (typeof CatalogSelector !== "undefined" && CatalogSelector.open) {
      CatalogSelector.open({
        catalog: "Номенклатура",
        locate_code: it ? it.code : "",
        locate_name: it ? it.name : "",
        locate_item: it ? (it.code || it.name) : "",
        search: it ? (it.name || it.code || "") : "",
        onSelect: (selected) => {
          if (selected && it) {
            it.code = selected.code || it.code;
            it.name = selected.name || it.name;
            it.artikul = selected.artikul || it.artikul;
            if (selected.unit) it.unit = selected.unit;
            this.renderTable();
            this.recalculateTotals();
          }
        }
      });
    } else if (typeof openCatalogDirect === "function") {
      openCatalogDirect("Номенклатура");
    } else {
      alert(`Справочник: Номенклатура`);
    }
  },

  openItemPicker: function() {
    if (typeof CatalogSelector !== "undefined" && CatalogSelector.open) {
      CatalogSelector.open({
        catalog: "Номенклатура",
        podborMode: true
      });
    } else if (window.openPortfolioReportWindow) {
      openPortfolioReportWindow();
    }
  },

  switchTab: function(tabName) {
    this.activeTab = tabName;
    const btnTovary = document.getElementById("sdeTabBtnTovary");
    const btnUslugi = document.getElementById("sdeTabBtnUslugi");
    const btnDop = document.getElementById("sdeTabBtnDop");

    const setActive = (btn, active) => {
      if (!btn) return;
      if (active) {
        btn.style.background = "#f0eee3";
        btn.style.color = "#002060";
        btn.style.fontWeight = "bold";
      } else {
        btn.style.background = "#dedbc7";
        btn.style.color = "#555";
        btn.style.fontWeight = "normal";
      }
    };

    setActive(btnTovary, tabName === "tovary");
    setActive(btnUslugi, tabName === "uslugi");
    setActive(btnDop, tabName === "dop");
  },

  // ==========================================
  // Printing & Document Actions
  // ==========================================
  openPrintMenu: function(event) {
    event.stopPropagation();
    const dropdown = document.getElementById("sdePrintDropdown");
    if (!dropdown) return;
    const isShown = (dropdown.style.display === "block");
    dropdown.style.display = isShown ? "none" : "block";

    const closeHandler = () => {
      dropdown.style.display = "none";
      document.removeEventListener("click", closeHandler);
    };
    if (!isShown) {
      setTimeout(() => document.addEventListener("click", closeHandler), 10);
    }
  },

  printInvoice: function(printType) {
    const dropdown = document.getElementById("sdePrintDropdown");
    if (dropdown) dropdown.style.display = "none";

    const modal = document.getElementById("sdePrintModal");
    const container = document.getElementById("sdePrintContentArea");
    if (!modal || !container) return;

    const h = this.header;
    const docNum = h.number || this.currentDocNumber || "";
    const docDt = h.date || this.currentDocDate || "";
    const org = h.organization || "Aztrade MMC";
    const kontr = h.kontragent || "TEST 12B";
    const dog = h.contract || "Договор поставки";
    const sklad = h.warehouse || "Основной склад";

    let rowsHtml = "";
    let totalQty = 0;
    let totalSum = 0;
    let totalVat = 0;
    let totalGross = 0;

    this.items.forEach((it, idx) => {
      totalQty += it.quantity;
      totalSum += it.sum;
      totalVat += it.vat_sum;
      totalGross += it.total;

      rowsHtml += `
        <tr style="height: 22px;">
          <td style="text-align: center; border: 1px solid #333; padding: 2px 4px;">${idx + 1}</td>
          <td style="border: 1px solid #333; padding: 2px 6px; font-weight: bold;">${this.escapeHtml(it.code)}</td>
          <td style="border: 1px solid #333; padding: 2px 6px;">${this.escapeHtml(it.artikul || "-")}</td>
          <td style="border: 1px solid #333; padding: 2px 6px;">${this.escapeHtml(it.name)}</td>
          <td style="text-align: right; border: 1px solid #333; padding: 2px 6px; font-weight: bold;">${it.quantity.toFixed(2)}</td>
          <td style="text-align: center; border: 1px solid #333; padding: 2px 4px;">${this.escapeHtml(it.unit || "əd")}</td>
          <td style="text-align: right; border: 1px solid #333; padding: 2px 6px;">${it.price.toFixed(2)}</td>
          <td style="text-align: right; border: 1px solid #333; padding: 2px 6px; font-weight: bold;">${it.sum.toFixed(2)}</td>
          <td style="text-align: right; border: 1px solid #333; padding: 2px 6px;">${it.vat_sum.toFixed(2)}</td>
          <td style="text-align: right; border: 1px solid #333; padding: 2px 6px; font-weight: bold;">${it.total.toFixed(2)}</td>
        </tr>
      `;
    });

    const typeTitle = (printType === "torg12") 
      ? "ТОРГ-12 (Товарная накладная)" 
      : (printType === "factura" ? "Счет-фактура" : "Расходная накладная");

    document.getElementById("sdePrintTitle").textContent = `1C:Печать - ${typeTitle} № ${docNum}`;

    container.innerHTML = `
      <div style="font-family: Arial, sans-serif; font-size: 11px; line-height: 1.4; color: #000;">
        <div style="text-align: right; font-size: 9px; color: #555; margin-bottom: 8px;">
          Унифицированная форма № ТОРГ-12 / 1С:Предприятие 8.3
        </div>

        <h2 style="margin: 0 0 12px 0; font-size: 16px; border-bottom: 2px solid #000; padding-bottom: 4px;">
          ${typeTitle} № ${docNum} от ${docDt}
        </h2>

        <div style="display: grid; grid-template-columns: 120px 1fr; gap: 4px; margin-bottom: 12px; font-size: 11px;">
          <div style="font-weight: bold;">Поставщик:</div>
          <div>${this.escapeHtml(org)}, ВАК/ИНН: 9900012345, Адрес: г. Баку, Азербайджан</div>

          <div style="font-weight: bold;">Покупатель:</div>
          <div><strong>${this.escapeHtml(kontr)}</strong></div>

          <div style="font-weight: bold;">Основание:</div>
          <div>${this.escapeHtml(dog)}</div>

          <div style="font-weight: bold;">Склад:</div>
          <div>${this.escapeHtml(sklad)}</div>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 10.5px;">
          <thead>
            <tr style="background: #f0f0f0; text-align: center; font-weight: bold;">
              <th style="border: 1px solid #333; padding: 4px; width: 30px;">№</th>
              <th style="border: 1px solid #333; padding: 4px; width: 85px;">Код</th>
              <th style="border: 1px solid #333; padding: 4px; width: 75px;">Артикул</th>
              <th style="border: 1px solid #333; padding: 4px; text-align: left;">Товар (Номенклатура)</th>
              <th style="border: 1px solid #333; padding: 4px; width: 70px;">Кол-во</th>
              <th style="border: 1px solid #333; padding: 4px; width: 40px;">Ед.</th>
              <th style="border: 1px solid #333; padding: 4px; width: 75px;">Цена</th>
              <th style="border: 1px solid #333; padding: 4px; width: 85px;">Сумма</th>
              <th style="border: 1px solid #333; padding: 4px; width: 75px;">НДС</th>
              <th style="border: 1px solid #333; padding: 4px; width: 95px;">Всего с НДС</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
          <tfoot>
            <tr style="font-weight: bold; background: #fafafa;">
              <td colspan="4" style="border: 1px solid #333; padding: 4px 6px; text-align: right;">ИТОГО:</td>
              <td style="border: 1px solid #333; padding: 4px 6px; text-align: right;">${totalQty.toFixed(2)}</td>
              <td style="border: 1px solid #333; padding: 4px;"></td>
              <td style="border: 1px solid #333; padding: 4px;"></td>
              <td style="border: 1px solid #333; padding: 4px 6px; text-align: right;">${totalSum.toFixed(2)}</td>
              <td style="border: 1px solid #333; padding: 4px 6px; text-align: right;">${totalVat.toFixed(2)}</td>
              <td style="border: 1px solid #333; padding: 4px 6px; text-align: right; font-size: 11.5px; color: #002060;">${totalGross.toFixed(2)} AZN</td>
            </tr>
          </tfoot>
        </table>

        <div style="margin-bottom: 20px; font-size: 11px;">
          <div>Всего наименований <strong>${this.items.length}</strong>, на сумму <strong>${totalGross.toFixed(2)} AZN</strong></div>
        </div>

        <div style="display: flex; justify-content: space-between; margin-top: 35px; padding-top: 15px; border-top: 1px solid #ccc;">
          <div style="text-align: left; width: 45%;">
            <div>Отпустил (Поставщик): _______________________ / ${this.escapeHtml(h.responsible || "Emin")} /</div>
            <div style="font-size: 9px; color: #666; margin-top: 2px;">подпись / расшифровка подписи</div>
            <div style="margin-top: 15px; font-size: 10px; color: #777;">М.П.</div>
          </div>
          <div style="text-align: left; width: 45%;">
            <div>Получил (Покупатель): _______________________ / ________________ /</div>
            <div style="font-size: 9px; color: #666; margin-top: 2px;">подпись / расшифровка подписи</div>
            <div style="margin-top: 15px; font-size: 10px; color: #777;">М.П.</div>
          </div>
        </div>
      </div>
    `;

    modal.style.display = "flex";
  },

  closePrintModal: function() {
    const modal = document.getElementById("sdePrintModal");
    if (modal) modal.style.display = "none";
  },

  triggerBrowserPrint: function() {
    window.print();
  },

  exportToExcel: function() {
    if (!this.items.length) {
      alert("Eksport üçün cədvəldə sətir yoxdur.");
      return;
    }

    let csvContent = "\uFEFF";
    csvContent += `Реализация товаров и услуг № ${this.currentDocNumber} от ${this.currentDocDate}\n`;
    csvContent += `Контрагент: ${this.header.kontragent || ''}; Склад: ${this.header.warehouse || ''}; Организация: ${this.header.organization || ''}\n\n`;
    csvContent += "№;Код;Артикул;Номенклатура;Количество;Единица;Цена;Сумма;Ставка НДС;Сумма НДС;Всего\n";

    this.items.forEach(it => {
      const line = [
        it.line_num,
        `"${it.code}"`,
        `"${it.artikul}"`,
        `"${it.name.replace(/"/g, '""')}"`,
        it.quantity,
        `"${it.unit}"`,
        it.price,
        it.sum,
        `"${it.vat_rate}"`,
        it.vat_sum,
        it.total
      ].join(";");
      csvContent += line + "\n";
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Реализация_${this.currentDocNumber}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  saveDocument: function() {
    alert(`💾 Sənəd №${this.currentDocNumber} saxlanıldı!`);
  },

  saveAndPost: function() {
    this.header.posted = true;
    this.renderHeader();
    alert(`✔ Sənəd №${this.currentDocNumber} uğurla keçirildi (Проведен)!`);
    this.close();
  },

  postDocument: function() {
    this.header.posted = true;
    this.renderHeader();
    alert(`✔ Sənəd №${this.currentDocNumber} uğurla keçirildi (Проведен)!`);
  },

  escapeHtml: function(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  },

  // ==========================================
  // Pogruzka Mashiny Tab & Duplicate Detection Engine
  // ==========================================
  activeTab: "tovary",
  pogruzki: [],

  getActiveWin: function() {
    if (window.MdiManager && MdiManager.activeWindowId) {
      const activeEl = document.getElementById(MdiManager.activeWindowId);
      if (activeEl && (activeEl.id.startsWith("docEditorWindow_") || activeEl.id.startsWith("salesDocEditorWindow_"))) {
        return activeEl;
      }
    }
    if (this.currentDocNumber) {
      let typeKey = "sales";
      if (this.currentDocType === "ВозвратТоваровОтПокупателя") typeKey = "vozvrat";
      else if (this.currentDocType === "ЗаказПокупателя") typeKey = "zakaz";
      else if (this.currentDocType === "РеализацияТоваровУслуг") typeKey = "realiz";
      const cleanNum = String(this.currentDocNumber).replace("С", "C").replace("с", "c").trim();
      const safeNum = cleanNum.replace(/[^a-zA-Z0-9_-]/g, "_");
      const safeDocType = String(this.currentDocType || "sales").replace(/[^a-zA-Z0-9_-]/g, "_");
      const rawSafeNum = String(this.currentDocNumber).replace(/[^a-zA-Z0-9_-]/g, "_");
      const win = document.getElementById(`docEditorWindow_${typeKey}_${safeNum}`)
               || document.getElementById(`docEditorWindow_${safeDocType}_${rawSafeNum}`)
               || document.getElementById(`salesDocEditorWindow_${safeNum}`);
      if (win) return win;
    }
    return document.getElementById("salesDocEditorWindow");
  },

  switchTab: function(tabName) {
    this.activeTab = tabName;
    const win = this.getActiveWin();
    if (!win) return;

    const tabBtns = {
      tovary: win.querySelector("#sdeTabBtnTovary"),
      uslugi: win.querySelector("#sdeTabBtnUslugi"),
      dop: win.querySelector("#sdeTabBtnDop"),
      pogruzka: win.querySelector("#sdeTabBtnPogruzka")
    };

    Object.keys(tabBtns).forEach(k => {
      const btn = tabBtns[k];
      if (!btn) return;
      if (k === tabName) {
        btn.classList.add("active");
        btn.style.background = "#f0eee3";
        btn.style.borderBottom = "1px solid #f0eee3";
        btn.style.color = "#002060";
        btn.style.fontWeight = "bold";
      } else {
        btn.classList.remove("active");
        btn.style.background = "#dedbc7";
        btn.style.borderBottom = "1px solid #b0af9f";
        btn.style.color = "#555";
        btn.style.fontWeight = "normal";
      }
    });

    const goodsWrap = win.querySelector("#sdeTableWrapper");
    const pogruzkaWrap = win.querySelector("#sdePogruzkaWrapper");
    const goodsToolbar = win.querySelector("#sdeTableWrapper")?.previousElementSibling;

    if (tabName === "pogruzka") {
      if (goodsWrap) goodsWrap.style.display = "none";
      if (goodsToolbar) goodsToolbar.style.display = "none";
      if (pogruzkaWrap) pogruzkaWrap.style.display = "block";
      this.renderPogruzkaTabInWin(win, this.pogruzki || []);
    } else {
      if (goodsWrap) goodsWrap.style.display = "block";
      if (goodsToolbar) goodsToolbar.style.display = "flex";
      if (pogruzkaWrap) pogruzkaWrap.style.display = "none";
    }
  },

  renderPogruzkaTabInWin: function(win, pogruzki) {
    if (!win) win = this.getActiveWin();
    if (!win) return;

    const list = pogruzki || this.pogruzki || [];
    const count = list.length;
    const isDuplicate = (count > 1);

    // 1. Badge on Tab
    const badge = win.querySelector("#sdePogruzkaBadge");
    if (badge) {
      badge.textContent = String(count);
      badge.style.display = count > 0 ? "inline-block" : "none";
      if (isDuplicate) {
        badge.style.background = "#dc2626";
        badge.title = `ВНИМАНИЕ: Найдено ${count} погрузок (Дубликат!)`;
      } else {
        badge.style.background = "#2563eb";
        badge.title = "Погрузка машины: 1 документ";
      }
    }

    // 2. Alert boxes
    const dupAlert = win.querySelector("#sdePogruzkaDuplicateAlert");
    const normInfo = win.querySelector("#sdePogruzkaNormalInfo");
    const emptyInfo = win.querySelector("#sdePogruzkaEmptyInfo");
    const summaryCount = win.querySelector("#sdePogruzkaSummaryCount");

    if (summaryCount) {
      summaryCount.textContent = `Всего документов погрузки: ${count}` + (isDuplicate ? ` ⚠️ (ДУБЛИКАТ: ${count} рейса!)` : "");
      summaryCount.style.color = isDuplicate ? "#b91c1c" : "#002060";
    }

    if (dupAlert) dupAlert.style.display = isDuplicate ? "block" : "none";
    if (normInfo) normInfo.style.display = (count === 1) ? "flex" : "none";
    if (emptyInfo) emptyInfo.style.display = (count === 0) ? "block" : "none";

    // 3. Render Table
    const tbody = win.querySelector("#sdePogruzkaTableBody");
    if (!tbody) return;

    if (count === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="padding: 30px; text-align: center; color: #888; font-style: italic;">Данная реализация еще не включена ни в один документ «Погрузка машины».</td></tr>`;
      return;
    }

    let html = "";
    list.forEach((p, idx) => {
      const marshrutVal = p.marshrut || "(без маршрута)";
      // If duplicate (count > 1): RED cell highlighting!
      const marshrutStyle = isDuplicate
        ? "background: #fee2e2; color: #b91c1c; font-weight: bold; border: 2px solid #ef4444; padding: 2px 8px;"
        : "padding: 2px 8px; color: #002060; font-weight: 500;";

      const bg = isDuplicate ? "#fff5f5" : (idx % 2 === 1 ? "#f9f8f2" : "#ffffff");
      const statLabel = p.deleted ? "❌ Помечен на удаление" : (p.posted ? "✔ Проведен" : "📄 Не проведен");
      const statColor = p.deleted ? "#dc2626" : (p.posted ? "#15803d" : "#c2410c");

      html += `
        <tr style="background: ${bg}; height: 26px; border-bottom: 1px solid #d4d0c8;">
          <td style="text-align: center; border: 1px solid #d4d0c8; color: #555;">${idx + 1}</td>
          <td style="padding: 2px 6px; border: 1px solid #d4d0c8; font-weight: bold; color: #004080; cursor: pointer; text-decoration: underline;" title="Открыть документ погрузки..." onclick="if(window.PogruzkaDocEditor) PogruzkaDocEditor.open('${this.escapeHtml(p.number || '')}', '${this.escapeHtml(p.date || '')}')">
            🚚 Погрузка № ${this.escapeHtml(p.number || "—")}
          </td>
          <td style="padding: 2px 6px; border: 1px solid #d4d0c8; color: #333;">
            ${this.escapeHtml(p.date || "—")}
          </td>
          <td style="border: 1px solid #d4d0c8; ${marshrutStyle}">
            ${isDuplicate ? `<span style="margin-right: 4px;">🚨</span>` : ''}${this.escapeHtml(marshrutVal)}
          </td>
          <td style="padding: 2px 6px; border: 1px solid #d4d0c8; color: #111;">
            ${this.escapeHtml(p.voditel || "—")}
          </td>
          <td style="padding: 2px 6px; border: 1px solid #d4d0c8; color: #333;">
            ${this.escapeHtml(p.car || "—")}
          </td>
          <td style="text-align: center; border: 1px solid #d4d0c8; font-weight: bold; color: ${statColor}; font-size: 10px;">
            ${statLabel}
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  },

  reloadPogruzkaData: function() {
    const win = this.getActiveWin();
    const docNum = this.currentDocNumber;
    if (!docNum) return;

    this.showLoadingInWin(win, true);
    const creds = window.SessionManager ? SessionManager.getCredentials() : {};
    fetch("/api/documents/details", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...creds,
        doc_type: "РеализацияТоваровУслуг",
        number: docNum
      })
    })
    .then(r => r.json())
    .then(res => {
      this.showLoadingInWin(win, false);
      if (res.success) {
        this.pogruzki = res.pogruzki || [];
        this.renderPogruzkaTabInWin(win, this.pogruzki);
      }
    })
    .catch(e => {
      this.showLoadingInWin(win, false);
      console.error(e);
    });
  }
};

window.SalesDocEditor = SalesDocEditor;

document.addEventListener("keydown", function(e) {
  const sdeWin = document.getElementById("salesDocEditorWindow");
  if (!sdeWin || sdeWin.style.display === "none") return;

  // F4 opens nomenclature catalog picker for selected row
  if (e.key === "F4" && !e.ctrlKey && !e.altKey) {
    if (typeof SalesDocEditor !== "undefined" && SalesDocEditor.selectedRowIdx >= 0) {
      e.preventDefault();
      SalesDocEditor.openNomPicker(SalesDocEditor.selectedRowIdx);
    }
  }
});
