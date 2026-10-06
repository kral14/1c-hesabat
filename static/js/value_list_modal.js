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
  matchAll: false,
  searchScope: "all",
  activeSuggestions: [],
  selectedSuggestionIdx: -1,
  typingTimer: null,
  onApplyCallback: null,

  onMatchAllChange(checked) {
    this.matchAll = Boolean(checked);
    console.log("[VALUE LIST] Match all (AND / И) set to:", this.matchAll);
  },

  onSearchScopeChange(val) {
    this.searchScope = val || "all";
    console.log("[VALUE LIST] Search scope set to:", this.searchScope);
    if (this.editingIndex >= 0) {
      const inp = document.getElementById(`valItemInput_${this.editingIndex}`);
      if (inp && inp.value.trim()) {
        this.fetchAndShowAutocomplete(this.editingIndex, inp.value.trim());
      }
    }
  },

  cleanNomText(val) {
    if (!val) return "";
    return String(val)
      .replace(/\s*\([əa]d\)/gi, "")
      .replace(/\s*_\s*оригинал/gi, "")
      .replace(/\s*\(\s*\d+\s*шт\.?\s*\)/gi, "")
      .replace(/\s+\d+\s*шт\.?\b/gi, "")
      .replace(/\s+\d+\/\d+(\/\d+)?\b/g, "")
      .replace(/\s+\d+([.,]\d+)?\s*(гр|г|kg|кг|ml|мл|l|л)\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim() || val;
  },

  open(options = {}) {
    this.targetInput = options.targetInput || null;
    this.catalog = options.catalog || "Номенклатура";
    this.onApplyCallback = options.onApply || null;
    this.items = [];
    this.editingIndex = -1;
    this.matchAll = false;
    this.searchScope = "all";
    this.activeSuggestions = [];
    this.selectedSuggestionIdx = -1;

    const catL = (this.catalog || "").toLowerCase();
    const isNom = catL.includes("номенклатур") || catL.includes("məhsul") || catL.includes("tovar");

    // Header Title
    let catalogDisplayName = this.catalog;
    if (catL.includes("тип") && catL.includes("цен")) catalogDisplayName = "Типы цен";
    else if (catL.includes("контрагент")) catalogDisplayName = "Контрагенты";
    else if (catL.includes("склад")) catalogDisplayName = "Склады";
    else if (catL.includes("договор")) catalogDisplayName = "Договоры контрагентов";
    else if (catL.includes("пользовател") || catL.includes("ответственн")) catalogDisplayName = "Пользователи";
    else if (catL.includes("вод")) catalogDisplayName = "Водители";
    else if (catL.includes("портфел")) catalogDisplayName = "Портфели";
    else if (isNom) catalogDisplayName = "Номенклатура";

    const winTitle = document.querySelector("#valueListWindowModal .settings-header-title span");
    if (winTitle) winTitle.textContent = "Редактирование списка значений: " + catalogDisplayName;

    // Toggle columns for Artikul and Barcode (only applicable to Nomenclature)
    const thArt = document.getElementById("vlThArtikul");
    const thBar = document.getElementById("vlThBarcode");
    if (thArt) thArt.style.display = isNom ? "" : "none";
    if (thBar) thBar.style.display = isNom ? "" : "none";

    // Toggle "Все одновременно (И)" (only meaningful for document line tabular data like nomenclature)
    const matchChk = document.getElementById("vlMatchAllChk");
    const matchLabel = matchChk ? matchChk.closest("label") : null;
    if (matchLabel) matchLabel.style.display = isNom ? "inline-flex" : "none";

    // Search scope options
    const scopeSel = document.getElementById("vlSearchFieldSelect");
    if (scopeSel) {
      if (isNom) {
        scopeSel.innerHTML = `
          <option value="all" selected>Все видимые поля</option>
          <option value="name">Наименование</option>
          <option value="artikul">Артикул</option>
          <option value="code">Код</option>
          <option value="barcode">Штрихкод</option>
        `;
      } else {
        scopeSel.innerHTML = `
          <option value="all" selected>Все поля</option>
          <option value="name">Наименование</option>
          <option value="code">Код</option>
        `;
      }
      scopeSel.value = "all";
    }

    // 1. Try parsing structured data from options or dataset if available
    let parsed = false;
    let structObj = options.structuredFilter || null;
    if (!structObj && this.targetInput && this.targetInput.dataset && this.targetInput.dataset.structuredList) {
      try {
        structObj = JSON.parse(this.targetInput.dataset.structuredList);
      } catch (e) {}
    }

    if (structObj && Array.isArray(structObj.items)) {
      this.matchAll = Boolean(structObj.matchAll);
      this.items = structObj.items.map(it => ({
        comp: it.comp === "contains" ? "contains" : "equal",
        value: String(it.value || "").trim(),
        code: String(it.code || "").trim(),
        artikul: String(it.artikul || "").trim(),
        barcode: String(it.barcode || "").trim()
      })).filter(it => it.value);
      parsed = true;
    }

    // 2. Parse from input string - ONLY split by semicolon (;), NEVER by comma (,)
    if (!parsed && this.targetInput && this.targetInput.value.trim()) {
      let raw = this.targetInput.value.trim();
      if (raw.startsWith("[И]")) {
        this.matchAll = true;
        raw = raw.replace(/^\[И\]\s*/, "");
      }
      const tokens = raw.split(";").map(s => s.trim()).filter(Boolean);
      this.items = tokens.map(tok => {
        if (/^содержит:\s*/i.test(tok)) {
          return { comp: "contains", value: tok.replace(/^содержит:\s*/i, "").trim(), code: "", artikul: "", barcode: "" };
        }
        return { comp: "equal", value: tok, code: "", artikul: "", barcode: "" };
      });
    }

    if (matchChk) matchChk.checked = isNom ? this.matchAll : false;

    this.selectedIndex = this.items.length > 0 ? 0 : -1;
    this.render();

    // Auto-resolve Code, Artikul, and Barcode for items that only have Name
    if (isNom) {
      this.resolveMissingMetadata();
    }

    console.log(`[VALUE LIST OPEN] catalog="${this.catalog}", items=${this.items.length}, matchAll=${this.matchAll}`);

    const mdi = window.MdiManager || (typeof MdiManager !== "undefined" ? MdiManager : null);
    if (mdi && typeof mdi.activateWindow === "function") {
      mdi.activateWindow("valueListModalOverlay", {
        title: "Список значений: " + catalogDisplayName,
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
    this.hideAutocomplete();
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

  changeRowComp(idx, comp) {
    if (idx < 0 || idx >= this.items.length) return;
    if (typeof this.items[idx] !== "object") this.items[idx] = { comp: "equal", value: "", code: "", artikul: "", barcode: "" };
    this.items[idx].comp = (comp === "contains") ? "contains" : "equal";
    this.render();
    if (this.items[idx].comp === "equal" && this.items[idx].value && !this.items[idx].code) {
      this.resolveSingleItemMetadata(idx);
    }
  },

  async resolveMissingMetadata() {
    if (this.catalog !== "Номенклатура") return;
    const indices = [];
    this.items.forEach((it, i) => {
      if (it && it.value && (!it.code && !it.artikul && !it.barcode) && it.comp === "equal") {
        indices.push(i);
      }
    });
    if (indices.length === 0) return;

    for (const idx of indices) {
      await this.resolveSingleItemMetadata(idx);
    }
  },

  async resolveSingleItemMetadata(idx) {
    const it = this.items[idx];
    if (!it || !it.value || this.catalog !== "Номенклатура") return;
    try {
      const creds = (typeof SessionManager !== "undefined") ? SessionManager.getCredentials() : {};
      const res = await fetch("/api/catalog_data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...creds,
          catalog: "Номенклатура",
          search: it.value,
          search_field: this.searchScope || "all"
        })
      });
      const data = await res.json();
      if (data.success && data.items && data.items.length) {
        const cleanVal = it.value.trim().toLowerCase();
        const match = data.items.find(el => {
          return el.name.trim().toLowerCase() === cleanVal ||
                 el.code.trim().toLowerCase() === cleanVal ||
                 (el.artikul && el.artikul.trim().toLowerCase() === cleanVal) ||
                 (el.barcode && el.barcode.trim().toLowerCase() === cleanVal);
        }) || data.items[0];

        if (match) {
          it.value = match.name;
          it.code = match.code || "";
          it.artikul = match.artikul || "";
          it.barcode = match.barcode || "";
          this.render();
        }
      }
    } catch (err) {
      console.warn("[VALUE LIST] Metadata resolve error:", err);
    }
  },

  render() {
    const tbody = document.getElementById("valueListTbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    const catL = (this.catalog || "").toLowerCase();
    const isNom = catL.includes("номенклатур") || catL.includes("məhsul") || catL.includes("tovar");
    const colSpanTotal = isNom ? 7 : 5;

    if (this.items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${colSpanTotal}" style="color: #888; font-style: italic; padding: 25px 15px; text-align: center; user-select: none;">Siyahı boşdur.<br><br>Sətir yazmaq üçün <strong>[+]</strong> düyməsini basın,<br>və ya soraqçadan çoxsaylı seçmək üçün <strong>[Подбор]</strong> düyməsini basın.</td></tr>`;
      return;
    }

    this.items.forEach((itemObj, idx) => {
      if (typeof itemObj !== "object" || !itemObj) {
        itemObj = { comp: "equal", value: String(itemObj || ""), code: "", artikul: "", barcode: "" };
        this.items[idx] = itemObj;
      }

      const tr = document.createElement("tr");
      tr.style.cursor = "pointer";
      if (idx === this.selectedIndex) tr.classList.add("selected");

      tr.onclick = (e) => {
        if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.classList.contains("filter-btn-pick")) return;
        this.selectedIndex = idx;
        this.renderSelectionOnly();
      };

      tr.ondblclick = (e) => {
        if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.classList.contains("filter-btn-pick")) return;
        this.startEdit(idx);
      };

      const isEditing = (this.editingIndex === idx);

      const placeholderText = itemObj.comp === 'contains' 
        ? 'Məsələn: axtarış sözü' 
        : (isNom ? 'Dəqiq məhsul adı və ya kodu' : 'Dəqiq ad və ya kod');

      const contentHtml = isEditing ? `
        <input type="text" id="valItemInput_${idx}" class="value-item-inline-input" value="${escapeHtml(itemObj.value)}" 
               placeholder="${placeholderText}"
               style="width: 100%; height: 20px; font-size: 11px; padding: 1px 4px; border: 1px solid #316ac5; outline: none; background: #ffffff !important; color: #111111 !important;"
               oninput="ValueListModal.handleInputTyping(event, ${idx})"
               onkeydown="ValueListModal.handleInputKeydown(event, ${idx})"
               onblur="ValueListModal.handleInputBlur(${idx})">
      ` : `
        <span class="value-item-text" title="${escapeHtml(itemObj.value || '')}" style="display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; ${!itemObj.value ? 'color: #999; font-style: italic;' : 'color: #111111;'}">
          ${itemObj.value ? escapeHtml(isNom ? (this.cleanNomText(itemObj.value) || itemObj.value) : itemObj.value) : (itemObj.comp === 'contains' ? '(tərkibində axtarılacaq sözü yazın)' : '(dəqiq ad daxil edin və ya [...] basın)')}
        </span>
      `;

      const artikulTd = isNom ? `
        <td style="width: 85px; text-align: center; font-family: monospace; font-size: 10px; color: #0044cc; font-weight: 600; border-bottom: 1px solid #e8e8e8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(itemObj.artikul || '')}">
          ${escapeHtml(itemObj.artikul || (itemObj.comp === 'contains' ? '—' : '...'))}
        </td>
      ` : '';

      const barcodeTd = isNom ? `
        <td style="width: 105px; text-align: center; font-family: monospace; font-size: 10px; color: #555; border-bottom: 1px solid #e8e8e8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(itemObj.barcode || '')}">
          ${escapeHtml(itemObj.barcode || (itemObj.comp === 'contains' ? '—' : '...'))}
        </td>
      ` : '';

      tr.innerHTML = `
        <td style="width: 28px; text-align: center; color: #666; font-size: 10px; border-bottom: 1px solid #e8e8e8; user-select: none;">
          ${idx + 1}.
        </td>
        <td style="width: 85px; padding: 1px 3px; border-bottom: 1px solid #e8e8e8;">
          <select class="val-item-comp-sel" onchange="ValueListModal.changeRowComp(${idx}, this.value)"
                  style="width: 100%; height: 20px; font-size: 11px; border: 1px solid #7f9db9; background: #ffffff !important; color: #111111 !important; padding: 0 2px;">
            <option value="equal" ${itemObj.comp === 'equal' ? 'selected' : ''}>Равно</option>
            <option value="contains" ${itemObj.comp === 'contains' ? 'selected' : ''}>Содержит</option>
          </select>
        </td>
        <td style="width: 75px; text-align: center; font-family: monospace; font-size: 10px; color: #333; border-bottom: 1px solid #e8e8e8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(itemObj.code || '')}">
          ${escapeHtml(itemObj.code || (itemObj.comp === 'contains' ? '—' : '...'))}
        </td>
        ${artikulTd}
        ${barcodeTd}
        <td style="padding: 1px 4px; border-bottom: 1px solid #e8e8e8;">
          ${contentHtml}
        </td>
        <td style="width: 28px; text-align: center; padding: 1px 2px; border-bottom: 1px solid #e8e8e8;">
          <button class="filter-btn-pick" style="padding: 0 4px; height: 20px; min-width: 22px; font-weight: bold; cursor: pointer; border: 1px solid #7f9db9; background: #ece9d8;" onclick="event.stopPropagation(); ValueListModal.openCatalogForRow(${idx})" title="Soraqçanı aç (...)">...</button>
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

  // [+] Add new row directly into the list
  addNewRow() {
    console.log("[VALUE LIST] Adding new blank row to the list");
    this.hideAutocomplete();
    this.items.push({ comp: "equal", value: "", code: "", artikul: "", barcode: "" });
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
    if (typeof this.items[idx] !== "object") this.items[idx] = { comp: "equal", value: "", code: "", artikul: "", barcode: "" };
    this.items[idx].value = clean;
    this.editingIndex = -1;
    this.hideAutocomplete();
    this.render();
    if (clean && this.catalog === "Номенклатура" && this.items[idx].comp === "equal") {
      this.resolveSingleItemMetadata(idx);
    }
  },

  cancelEdit(idx) {
    this.editingIndex = -1;
    this.hideAutocomplete();
    // If it was newly added and still empty, clean it up
    const cur = this.items[idx];
    if (cur && !cur.value && this.items.length > 1) {
      this.items.splice(idx, 1);
      this.selectedIndex = Math.max(0, this.items.length - 1);
    }
    this.render();
  },

  handleInputTyping(e, idx) {
    const query = e.target.value.trim();
    this.fetchAndShowAutocomplete(idx, query);
  },

  fetchAndShowAutocomplete(idx, query) {
    clearTimeout(this.typingTimer);
    if (!query || query.length < 1) {
      this.hideAutocomplete();
      return;
    }
    this.typingTimer = setTimeout(async () => {
      try {
        const creds = (typeof SessionManager !== "undefined") ? SessionManager.getCredentials() : {};
        const res = await fetch("/api/catalog_data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...creds,
            catalog: this.catalog,
            search: query,
            search_field: this.searchScope
          })
        });
        const data = await res.json();
        if (data.success && (data.items?.length || data.folders?.length)) {
          this.renderAutocompleteDropdown(idx, data.folders || [], data.items || [], query);
        } else {
          this.hideAutocomplete();
        }
      } catch (e) {
        this.hideAutocomplete();
      }
    }, 150);
  },

  renderAutocompleteDropdown(idx, folders, items, query) {
    const box = document.getElementById("vlAutocompleteBox");
    const container = document.getElementById("vlListContainer");
    const inputEl = document.getElementById(`valItemInput_${idx}`);
    if (!box || !container || !inputEl) return;

    const rawQuery = query.toLowerCase().trim();
    const cleanQ = rawQuery.replace(/^0+/, "");
    const scope = this.searchScope;

    // Filter items according to searchScope
    let filteredItems = items.filter(it => {
      const art = String(it.artikul || "").toLowerCase();
      const code = String(it.code || "").toLowerCase();
      const name = String(it.name || "").toLowerCase();

      if (scope === "artikul") {
        return art.includes(rawQuery) || (cleanQ && art.replace(/^0+/, "").includes(cleanQ));
      } else if (scope === "code") {
        return code.includes(rawQuery) || (cleanQ && code.replace(/^0+/, "").includes(cleanQ));
      } else if (scope === "name") {
        return name.includes(rawQuery);
      }
      return name.includes(rawQuery) || code.includes(rawQuery) || art.includes(rawQuery) || (cleanQ && art.replace(/^0+/, "").includes(cleanQ));
    });

    // Prioritize exact matches (Artikul, Code, Name)
    filteredItems.sort((a, b) => {
      const aArt = String(a.artikul || "").trim().toLowerCase();
      const bArt = String(b.artikul || "").trim().toLowerCase();
      const aCode = String(a.code || "").trim().toLowerCase();
      const bCode = String(b.code || "").trim().toLowerCase();
      const aName = String(a.name || "").trim().toLowerCase();
      const bName = String(b.name || "").trim().toLowerCase();

      if (scope === "artikul") {
        const aExact = (aArt === rawQuery || (cleanQ && aArt.replace(/^0+/, "") === cleanQ));
        const bExact = (bArt === rawQuery || (cleanQ && bArt.replace(/^0+/, "") === cleanQ));
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        return aArt.localeCompare(bArt);
      } else if (scope === "code") {
        const aExact = (aCode === rawQuery || (cleanQ && aCode.replace(/^0+/, "") === cleanQ));
        const bExact = (bCode === rawQuery || (cleanQ && bCode.replace(/^0+/, "") === cleanQ));
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        return aCode.localeCompare(bCode);
      } else if (scope === "name") {
        const aExact = aName.startsWith(rawQuery);
        const bExact = bName.startsWith(rawQuery);
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        return aName.localeCompare(bName, "ru");
      } else {
        const aExactArt = (aArt === rawQuery || (cleanQ && aArt.replace(/^0+/, "") === cleanQ));
        const bExactArt = (bArt === rawQuery || (cleanQ && bArt.replace(/^0+/, "") === cleanQ));
        if (aExactArt && !bExactArt) return -1;
        if (!aExactArt && bExactArt) return 1;

        const aExactCode = (aCode === rawQuery || (cleanQ && aCode.replace(/^0+/, "") === cleanQ));
        const bExactCode = (bCode === rawQuery || (cleanQ && bCode.replace(/^0+/, "") === cleanQ));
        if (aExactCode && !bExactCode) return -1;
        if (!aExactCode && bExactCode) return 1;

        const aStart = aArt.startsWith(rawQuery) || aCode.startsWith(rawQuery) || aName.startsWith(rawQuery);
        const bStart = bArt.startsWith(rawQuery) || bCode.startsWith(rawQuery) || bName.startsWith(rawQuery);
        if (aStart && !bStart) return -1;
        if (!aStart && bStart) return 1;

        return aName.localeCompare(bName, "ru");
      }
    });

    const allList = [];
    if (scope === "all" || scope === "name") {
      folders.slice(0, 5).forEach(f => allList.push(f));
    }
    filteredItems.slice(0, 30).forEach(it => allList.push(it));

    if (allList.length === 0) {
      this.hideAutocomplete();
      return;
    }

    this.activeSuggestions = allList;
    this.selectedSuggestionIdx = -1;

    let html = `<div style="padding: 2px 6px; background: #e5e2cf; border-bottom: 1px solid #b0af9f; font-size: 10px; color: #555; font-weight: bold; display: flex; justify-content: space-between;">
      <span>Найдено: ${allList.length}</span>
      <span style="font-weight: normal; color: #777;">Режим: ${scope === 'artikul' ? 'Артикул' : (scope === 'code' ? 'Код' : (scope === 'name' ? 'Наименование' : 'Все поля'))}</span>
    </div>`;

    allList.forEach((it, sIdx) => {
      const icon = it.is_folder ? "📁" : "📄";
      const artBadge = it.artikul ? `<span class="item-art" style="font-family: monospace; font-size: 10px; color: #0044cc; font-weight: 600; margin-right: 4px;">[Арт: ${escapeHtml(it.artikul)}]</span>` : "";
      const bcBadge = it.barcode ? `<span class="item-bc" style="font-family: monospace; font-size: 10px; color: #555; margin-right: 4px;">[Штр: ${escapeHtml(it.barcode)}]</span>` : "";
      html += `
        <div class="autocomplete-item" id="vlSugg_${sIdx}" data-idx="${sIdx}"
             style="display: flex; align-items: center; gap: 6px; padding: 4px 8px; cursor: pointer; border-bottom: 1px solid #f0f0f0; white-space: nowrap; background-color: #ffffff; color: #111111;"
             onmouseover="ValueListModal.highlightSuggestion(${sIdx})"
             onmousedown="event.preventDefault(); ValueListModal.selectSuggestion(${idx}, ${sIdx});">
          <span class="item-icon">${icon}</span>
          <span class="item-code" style="color: #666; font-size: 10px; margin-right: 4px;">[${escapeHtml(it.code || "")}]</span>
          ${artBadge}
          ${bcBadge}
          <span style="font-weight: ${it.is_folder ? 'bold' : 'normal'}; color: #111111;">${escapeHtml(it.name)}</span>
        </div>
      `;
    });

    box.innerHTML = html;

    const inputRect = inputEl.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    box.style.top = (inputRect.bottom - containerRect.top + container.scrollTop) + "px";
    box.style.left = (inputRect.left - containerRect.left + container.scrollLeft) + "px";
    box.style.width = Math.max(inputRect.width, 320) + "px";
    box.style.display = "block";
    box.classList.add("show");
  },

  highlightSuggestion(sIdx) {
    this.selectedSuggestionIdx = sIdx;
    const box = document.getElementById("vlAutocompleteBox");
    if (!box) return;
    box.querySelectorAll(".autocomplete-item").forEach((el, i) => {
      if (i === sIdx) {
        el.style.backgroundColor = "#316ac5";
        el.style.color = "#ffffff";
        el.querySelectorAll("span").forEach(sp => sp.style.color = "#ffffff");
      } else {
        el.style.backgroundColor = "#ffffff";
        el.style.color = "#111111";
        el.querySelectorAll("span").forEach(sp => {
          if (sp.classList.contains("item-code")) sp.style.color = "#666";
          else if (sp.classList.contains("item-art")) sp.style.color = "#0044cc";
          else sp.style.color = "#111111";
        });
      }
    });
  },

  selectSuggestion(rowIdx, suggIdx) {
    const item = this.activeSuggestions[suggIdx];
    if (!item) return;
    this.hideAutocomplete();
    if (typeof this.items[rowIdx] !== "object") this.items[rowIdx] = { comp: "equal", value: "", code: "", artikul: "", barcode: "" };
    this.items[rowIdx].value = item.name;
    this.items[rowIdx].code = item.code || "";
    this.items[rowIdx].artikul = item.artikul || "";
    this.items[rowIdx].barcode = item.barcode || "";
    this.editingIndex = -1;
    this.selectedIndex = rowIdx;
    this.render();
  },

  hideAutocomplete() {
    const box = document.getElementById("vlAutocompleteBox");
    if (box) {
      box.style.display = "none";
      box.classList.remove("show");
      box.innerHTML = "";
    }
    this.activeSuggestions = [];
    this.selectedSuggestionIdx = -1;
  },

  handleInputBlur(idx) {
    setTimeout(() => {
      const box = document.getElementById("vlAutocompleteBox");
      if (box && box.style.display !== "none") {
        this.hideAutocomplete();
      }
      const inp = document.getElementById(`valItemInput_${idx}`);
      if (inp && this.editingIndex === idx) {
        this.commitEdit(idx, inp.value);
      }
    }, 250);
  },

  handleInputKeydown(e, idx) {
    const box = document.getElementById("vlAutocompleteBox");
    const isAutoOpen = box && box.style.display !== "none" && this.activeSuggestions.length > 0;
    const curItem = this.items[idx];
    const isCompEqual = (!curItem || curItem.comp === "equal");

    if (e.key === "ArrowDown") {
      if (isAutoOpen) {
        e.preventDefault();
        e.stopPropagation();
        let nextIdx = this.selectedSuggestionIdx + 1;
        if (nextIdx >= this.activeSuggestions.length) nextIdx = 0;
        this.highlightSuggestion(nextIdx);
        const itemEl = document.getElementById(`vlSugg_${nextIdx}`);
        if (itemEl && itemEl.scrollIntoView) itemEl.scrollIntoView({ block: "nearest" });
        return;
      }
    } else if (e.key === "ArrowUp") {
      if (isAutoOpen) {
        e.preventDefault();
        e.stopPropagation();
        let prevIdx = this.selectedSuggestionIdx - 1;
        if (prevIdx < 0) prevIdx = this.activeSuggestions.length - 1;
        this.highlightSuggestion(prevIdx);
        const itemEl = document.getElementById(`vlSugg_${prevIdx}`);
        if (itemEl && itemEl.scrollIntoView) itemEl.scrollIntoView({ block: "nearest" });
        return;
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (isAutoOpen && this.selectedSuggestionIdx >= 0) {
        this.selectSuggestion(idx, this.selectedSuggestionIdx);
        return;
      }
      // If "Равно" and autocomplete has items, automatically select the top exact match!
      if (isCompEqual && isAutoOpen && this.activeSuggestions.length > 0) {
        this.selectSuggestion(idx, 0);
        return;
      }
      const val = e.target.value;
      this.commitEdit(idx, val);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (isAutoOpen) {
        this.hideAutocomplete();
      } else {
        this.cancelEdit(idx);
      }
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

  addItem(val, comp = "equal") {
    let itemObj;
    if (typeof val === "object" && val !== null) {
      itemObj = {
        comp: val.comp || comp || "equal",
        value: String(val.value || val.name || "").trim(),
        code: String(val.code || "").trim(),
        artikul: String(val.artikul || "").trim(),
        barcode: String(val.barcode || "").trim()
      };
    } else {
      const clean = String(val || "").trim();
      if (!clean) return;
      itemObj = { comp: comp, value: clean, code: "", artikul: "", barcode: "" };
    }
    if (!itemObj.value) return;

    const cur = this.items[this.selectedIndex];
    if (cur && (!cur.value || !cur.value.trim())) {
      Object.assign(cur, itemObj);
    } else {
      this.items.push(itemObj);
      this.selectedIndex = this.items.length - 1;
    }
    this.render();
    if (this.catalog === "Номенклатура" && itemObj.comp === "equal" && (!itemObj.code && !itemObj.artikul && !itemObj.barcode)) {
      this.resolveSingleItemMetadata(this.selectedIndex);
    }
  },

  setItem(idx, val, comp) {
    let itemObj;
    if (typeof val === "object" && val !== null) {
      itemObj = {
        comp: val.comp || comp || "equal",
        value: String(val.value || val.name || "").trim(),
        code: String(val.code || "").trim(),
        artikul: String(val.artikul || "").trim(),
        barcode: String(val.barcode || "").trim()
      };
    } else {
      const clean = String(val || "").trim();
      if (!clean) return;
      itemObj = { comp: comp || "equal", value: clean, code: "", artikul: "", barcode: "" };
    }
    if (!itemObj.value) return;

    if (idx >= 0 && idx < this.items.length) {
      Object.assign(this.items[idx], itemObj);
      this.selectedIndex = idx;
      this.render();
      if (this.catalog === "Номенклатура" && itemObj.comp === "equal" && (!itemObj.code && !itemObj.artikul && !itemObj.barcode)) {
        this.resolveSingleItemMetadata(idx);
      }
    } else {
      this.addItem(itemObj, comp);
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
        if (selectedItem && (selectedItem.name || selectedItem.code)) {
          this.setItem(idx, {
            value: selectedItem.name || "",
            code: selectedItem.code || "",
            artikul: selectedItem.artikul || "",
            barcode: selectedItem.barcode || ""
          });
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

  // "Подбор" Button
  openPodbor() {
    console.log(`[VALUE LIST -> CATALOG (ПОДБОР)] Opening catalog "${this.catalog}" in podbor mode directly`);
    this.editingIndex = -1;
    this.render();

    CatalogSelector.open({
      catalog: this.catalog,
      multiSelect: true,
      podborMode: true,
      onSelect: (selectedItem) => {
        if (selectedItem && (selectedItem.name || selectedItem.code)) {
          this.addItem({
            value: selectedItem.name || "",
            code: selectedItem.code || "",
            artikul: selectedItem.artikul || "",
            barcode: selectedItem.barcode || ""
          }, "equal");
        }
      }
    });
  },

  openPodbor() {
    console.log(`[VALUE LIST PODBOR] Opening CatalogSelector in Podbor mode for catalog="${this.catalog}"`);
    if (window.CatalogSelector && typeof CatalogSelector.open === "function") {
      CatalogSelector.open({
        catalog: this.catalog,
        podborMode: true,
        multiSelect: true,
        onSelect: (selectedItems) => {
          if (!selectedItems) return;
          const itemsArr = Array.isArray(selectedItems) ? selectedItems : [selectedItems];
          let addedCount = 0;
          itemsArr.forEach(it => {
            const name = String(it.name || it.Наименование || "").trim();
            const code = String(it.code || it.Код || "").trim();
            const artikul = String(it.artikul || it.Артикул || "").trim();
            const barcode = String(it.barcode || it.Штрихкод || "").trim();
            if (!name) return;
            const exists = this.items.some(x => x.value === name || (x.code && code && x.code === code));
            if (!exists) {
              this.items.push({
                comp: "equal",
                value: name,
                code: code,
                artikul: artikul,
                barcode: barcode
              });
              addedCount++;
            }
          });
          if (addedCount > 0) {
            this.selectedIndex = Math.max(0, this.items.length - 1);
            this.render();
          }
        }
      });
    }
  },

  openCatalogForRow(idx) {
    if (idx < 0 || idx >= this.items.length) return;
    console.log(`[VALUE LIST PICK] Opening CatalogSelector for row ${idx}, catalog="${this.catalog}"`);
    if (window.CatalogSelector && typeof CatalogSelector.open === "function") {
      CatalogSelector.open({
        catalog: this.catalog,
        podborMode: false,
        multiSelect: false,
        onSelect: (selectedItem) => {
          if (!selectedItem) return;
          const name = String(selectedItem.name || selectedItem.Наименование || "").trim();
          const code = String(selectedItem.code || selectedItem.Код || "").trim();
          const artikul = String(selectedItem.artikul || selectedItem.Артикул || "").trim();
          const barcode = String(selectedItem.barcode || selectedItem.Штрихкод || "").trim();
          if (name) {
            this.items[idx] = {
              comp: this.items[idx]?.comp || "equal",
              value: name,
              code: code,
              artikul: artikul,
              barcode: barcode
            };
            this.selectedIndex = idx;
            this.render();
          }
        }
      });
    }
  },

  duplicateSelected() {
    if (this.items.length === 0 || this.selectedIndex < 0) return;
    const cur = this.items[this.selectedIndex];
    if (cur !== undefined) {
      this.items.splice(this.selectedIndex + 1, 0, {
        comp: cur.comp || "equal",
        value: cur.value || "",
        code: cur.code || "",
        artikul: cur.artikul || "",
        barcode: cur.barcode || ""
      });
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
        if (typeof this.items[this.editingIndex] !== "object") this.items[this.editingIndex] = { comp: "equal", value: "" };
        this.items[this.editingIndex].value = inp.value.trim();
      }
    }
    // Filter out completely blank lines
    const validItems = this.items.filter(it => it.value && it.value.trim().length > 0);

    const isNom = (this.catalog === "Номенклатура");
    const parts = validItems.map(it => {
      let cleanVal = (isNom && it.value) ? this.cleanNomText(it.value) : it.value;
      const code = (it.code || "").trim();
      let itemDisplay = cleanVal || code || it.value;
      if (it.comp === "contains") {
        return `Содержит: ${itemDisplay}`;
      }
      return itemDisplay;
    });

    let displayStr = parts.join("; ");
    if (this.matchAll && displayStr) {
      displayStr = `[И] ${displayStr}`;
    }

    if (this.targetInput) {
      this.targetInput.value = displayStr;
      this.targetInput.dataset.structuredList = JSON.stringify({
        matchAll: this.matchAll,
        items: validItems
      });
      this.targetInput.dispatchEvent(new Event("change", { bubbles: true }));
      if (typeof hideAllAutocomplete === "function") hideAllAutocomplete();
    }

    if (typeof this.onApplyCallback === "function") {
      this.onApplyCallback({
        matchAll: this.matchAll,
        items: validItems,
        displayStr
      });
    }

    this.close();
  },

  close() {
    console.log("[VALUE LIST CLOSE] Closing value list modal");
    this.editingIndex = -1;
    this.hideAutocomplete();
    const overlay = document.getElementById("valueListModalOverlay");
    const win = document.getElementById("valueListWindowModal");
    if (win) {
      win.classList.remove("maximized");
      const maxBtn = win.querySelector(".window-btn-sys");
      if (maxBtn) {
        maxBtn.textContent = "□";
        maxBtn.title = "Böyüt";
      }
    }
    if (overlay) {
      overlay.classList.remove("active");
      overlay.classList.remove("has-maximized");
      overlay.style.display = "none";
    }
    const mdi = window.MdiManager || (typeof MdiManager !== "undefined" ? MdiManager : null);
    if (mdi && typeof mdi.closeWindow === "function") {
      mdi.closeWindow("valueListModalOverlay");
    }
  },

  toggleMaximize() {
    const win = document.getElementById("valueListWindowModal");
    if (!win) return;
    const overlay = document.getElementById("valueListModalOverlay");
    const isMax = win.classList.toggle("maximized");
    if (overlay) {
      overlay.classList.toggle("has-maximized", isMax);
    }
    const maxBtn = win.querySelector(".window-btn-sys");
    if (maxBtn) {
      maxBtn.textContent = isMax ? "❐" : "□";
      maxBtn.title = isMax ? "Bərpa et" : "Böyüt";
    }
  }
};

window.ValueListModal = ValueListModal;
