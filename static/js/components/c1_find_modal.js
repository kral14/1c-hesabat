/**
 * ======================================================================
 * 1C:ENTERPRISE - UNIVERSAL FIND & COLUMN FILTER MODAL (Ctrl+F)
 * static/js/components/c1_find_modal.js
 *
 * Realizasiyadakı Ctrl+F süzgəc / axtarış pəncərəsinin
 * bütün cədvəllər və jurnallar üçün vahid komponentləşdirilmiş icrası.
 *
 * Xüsusiyyətlər:
 * - İstənilən aktiv pəncərəni və cədvəli avtomatik aşkarlayır (Auto-detect)
 * - Sütunları, cari seçilmiş xana dəyərini avtomatik doldurur
 * - Soraqça sahələri üçün "..." (CatalogSelector) və "🔍" kart açma
 * - Kontragent və digər soraqçalar üçün anlıq avtokompleyt təklifləri
 * - 3 axtarış rejimi: Sətrin əvvəli, daxili (hissəsi), dəqiq bərabərlik
 * - Enter: Tətbiq et, Esc: Bağla, Ctrl+Q: Süzgəci çıxar
 * ======================================================================
 */

(function (window) {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  const C1FindModal = {
    currentContext: null,
    _findItem: null,
    _suggestions: [],
    _suggestionIndex: 0,
    _suggestionTimer: null,
    _suggestionRequestVer: 0,

    /**
     * Sütun üçün uyğun 1C Soraqçasını qaytarır
     */
    findCatalogForColumn: function (colKey) {
      if (!colKey) return null;
      const key = String(colKey).toLowerCase();
      const map = {
        kontragent: "Контрагенты",
        kontragent_code: "Контрагенты",
        golovnoy_kontragent: "Контрагенты",
        golovnoy_kontragent_code: "Контрагенты",
        client: "Контрагенты",
        customer: "Контрагенты",
        buyer: "Контрагенты",
        agent: "Агенты",
        warehouse: "Склады",
        sklad: "Склады",
        contract: "ДоговорыКонтрагентов",
        contract_price_type: "ТипыЦенНоменклатуры",
        responsible: "Пользователи",
        user: "Пользователи",
        author: "Пользователи",
        editor: "Пользователи",
        last_author: "Пользователи",
        portfolio: "Портфели",
        pogruzka_voditel: "Водители",
        driver: "Водители",
        nomenclature: "Номенклатура",
        product: "Номенклатура"
      };
      return map[key] || null;
    },

    /**
     * Pəncərəni istənilən cədvəl üçün konfiqurasiya ilə açır
     */
    open: function (options = {}) {
      this.currentContext = options;
      this._findItem = null;
      this.hideSuggestions();

      const modal = document.getElementById("c1FindModal");
      if (!modal) {
        console.warn("[C1FindModal] #c1FindModal elementi DOM-da tapılmadı!");
        return;
      }

      // 1. Pəncərə başlığını təyin et
      const titleEl = document.getElementById("c1FindTitle");
      if (titleEl) {
        if (options.title) {
          titleEl.textContent = options.title;
        } else if (window.C1I18n) {
          titleEl.textContent = C1I18n.t("find.title") || "Отбор по колонке (Ctrl+F)";
        }
      }

      // 2. Sütunlar dropdown-ını doldur
      const select = document.getElementById("c1FindColumn");
      const columns = Array.isArray(options.columns) ? options.columns : [];
      if (select) {
        select.innerHTML = columns.map(c => {
          const val = escapeHtml(c.key || c.id || c.name);
          const lbl = escapeHtml(c.label || c.title || c.name || c.key);
          return `<option value="${val}">${lbl}</option>`;
        }).join("");

        // Cari sütunu seç
        const initialCol = options.currentColumn || (columns[0] ? (columns[0].key || columns[0].id) : "");
        if (initialCol) {
          select.value = initialCol;
        }
      }

      // 3. Axtarış mətni inputunu doldur
      const input = document.getElementById("c1FindText");
      if (input) {
        const textVal = options.currentValue !== undefined && options.currentValue !== null ? String(options.currentValue) : "";
        input.value = textVal;
      }

      // 4. Axtarış rejimi (starts, contains, exact)
      const mode = options.currentMatch || "contains";
      modal.querySelectorAll('input[name="c1FindMatch"]').forEach(r => {
        r.checked = r.value === mode;
      });

      // 5. "Süzgəci çıxar" düyməsinin görünməsi
      const btnClear = document.getElementById("c1FindBtnClear");
      if (btnClear) {
        btnClear.style.display = options.hasActiveFilter !== false ? "inline-flex" : "none";
      }

      // 6. Soraqça düymələrini yenilə (...) və (🔍)
      this.updateReferenceButtons();

      // 7. Modalı ekranda göstər
      modal.style.display = "flex";
      modal.style.zIndex = "2147483000";

      // 8. Tərcümələri tətbiq et
      if (window.C1I18n) {
        C1I18n.applyTranslations(modal);
      }

      // 9. Inputa fokuslan və mətni seç
      if (input) {
        setTimeout(() => {
          input.focus();
          input.select();
        }, 50);
      }
    },

    /**
     * Modalı bağlayır
     */
    close: function () {
      this.hideSuggestions();
      const modal = document.getElementById("c1FindModal");
      if (modal) {
        modal.style.display = "none";
      }
      this.currentContext = null;
    },

    /**
     * Sütun dəyişdikdə soraqça düymələrini və təklifləri yeniləyir
     */
    onColumnChange: function () {
      this.hideSuggestions();
      this._findItem = null;
      this.updateReferenceButtons();
      const input = document.getElementById("c1FindText");
      if (input) {
        input.focus();
        input.select();
        if (input.value.trim().length >= 1) {
          this.onTextInput();
        }
      }
    },

    /**
     * Soraqça düymələrinin aktivliyini yoxlayır
     */
    updateReferenceButtons: function () {
      const col = document.getElementById("c1FindColumn")?.value;
      const catalog = this.findCatalogForColumn(col);
      const btnChoose = document.getElementById("c1FindBtnChoose");
      const btnInspect = document.getElementById("c1FindBtnInspect");
      if (btnChoose) btnChoose.disabled = !catalog;
      if (btnInspect) btnInspect.disabled = !catalog;
    },

    /**
     * Enter və ya "Применить отбор" basıldıqda
     */
    submit: function () {
      const colSelect = document.getElementById("c1FindColumn");
      const fieldKey = colSelect?.value || "";
      const fieldLabel = colSelect?.options[colSelect.selectedIndex]?.text || fieldKey;
      const value = document.getElementById("c1FindText")?.value?.trim() || "";
      const matchMode = document.querySelector('input[name="c1FindMatch"]:checked')?.value || "contains";

      const comparisonOperator = {
        exact: "Равно",
        starts: "Начинается с",
        contains: "Содержит"
      }[matchMode] || "Содержит";

      const result = {
        fieldKey: fieldKey,
        fieldLabel: fieldLabel,
        value: value,
        matchMode: matchMode,
        comparison: comparisonOperator,
        operator: comparisonOperator,
        catalogItem: this._findItem
      };

      const ctx = this.currentContext;
      this.close();

      if (ctx && typeof ctx.onApply === "function") {
        ctx.onApply(result);
      }
    },

    /**
     * Süzgəci çıxar düyməsi (Ctrl+Q)
     */
    clearFilter: function () {
      const col = document.getElementById("c1FindColumn")?.value || "";
      const ctx = this.currentContext;
      this.close();

      if (ctx && typeof ctx.onClear === "function") {
        ctx.onClear(col);
      }
    },

    /**
     * Soraqçadan seçim (...) - CatalogSelector-u açır
     */
    chooseFromCatalog: function () {
      const col = document.getElementById("c1FindColumn")?.value;
      const catalog = this.findCatalogForColumn(col);
      if (!catalog) return;

      const text = document.getElementById("c1FindText")?.value || "";
      const savedCtx = this.currentContext;

      if (window.CatalogSelector && typeof CatalogSelector.open === "function") {
        this.close();
        CatalogSelector.open({
          catalog: catalog,
          search: text,
          multiSelect: false,
          onSelect: item => {
            if (!item) return;
            const chosenValue = (col && col.endsWith("_code")) ? item.code : item.name;
            if (savedCtx) {
              savedCtx.currentColumn = col;
              savedCtx.currentValue = chosenValue;
              this.open(savedCtx);
              this._findItem = { catalog, code: item.code, name: item.name, value: chosenValue };
              const exactRadio = document.querySelector('input[name="c1FindMatch"][value="exact"]');
              if (exactRadio) exactRadio.checked = true;
            }
          }
        });
      }
    },

    /**
     * Kart məlumatı (🔍)
     */
    showItemInfo: async function () {
      const col = document.getElementById("c1FindColumn")?.value;
      const catalog = this.findCatalogForColumn(col);
      const text = document.getElementById("c1FindText")?.value?.trim();
      if (!catalog || !text) return;

      if (catalog === "Контрагенты" && window.KontragentCard) {
        KontragentCard.open({ query: text, name: text });
      } else if (catalog === "Номенклатура" && window.NomenclatureCard) {
        NomenclatureCard.open({ query: text, name: text });
      }
    },

    /**
     * Avtokompleyt təkliflərinin idarəsi
     */
    hideSuggestions: function () {
      clearTimeout(this._suggestionTimer);
      this._suggestionRequestVer = (this._suggestionRequestVer || 0) + 1;
      document.getElementById("c1FindSuggestions")?.remove();
      this._suggestions = [];
    },

    onTextInput: function () {
      this._findItem = null;
      this.hideSuggestions();
      const col = (document.getElementById("c1FindColumn")?.value || "").trim();
      if (!col) return;
      const colLower = col.toLowerCase();

      const input = document.getElementById("c1FindText");
      if (!input) return;
      const raw = input.value.trim();
      if (!raw) return;

      const rawLower = raw.toLowerCase();

      // 1. Yerli cədvəldən / jurnaldan yalnız cari sütunun unikal dəyərləri
      let localMatches = [];
      if (this.currentContext && typeof this.currentContext.getDistinctValues === "function") {
        try {
          const distinctVals = this.currentContext.getDistinctValues(col) || [];
          localMatches = distinctVals
            .filter(v => v !== undefined && v !== null && String(v).trim() !== "" && String(v).toLowerCase().includes(rawLower))
            .slice(0, 30)
            .map(v => ({ name: String(v), code: "", isLocal: true, column: col }));
        } catch (e) {
          console.warn("[C1FindModal] local getDistinctValues error:", e);
        }
      }

      // Sütunun aid olduğu xüsusi soraqça növü
      const isHeadCustomer = ["golovnoy_kontragent", "golovnoy_kontragent_code"].includes(colLower);
      const isCustomer = ["kontragent", "kontragent_code", "client", "customer", "buyer"].includes(colLower);
      const isNomenclature = ["nomenclature", "product", "nomenclatures"].includes(colLower);

      // Əgər server soraqçası axtarışı olmayan sütundursa (məsələn: vms_status, agent, warehouse, responsible və s.)
      // YALNIZ yerli sütun dəyərlərini göstəririk, başqa heç bir yerin məlumatını qatmırıq!
      if (!isHeadCustomer && !isCustomer && !isNomenclature) {
        if (localMatches.length > 0) {
          this._suggestions = localMatches;
          this._suggestionIndex = 0;
          this.renderSuggestions();
        }
        return;
      }

      // Əgər yerli uyğunluqlar varsa, server sorğusunu gözləmədən dərhal ilkin göstər
      if (localMatches.length > 0) {
        this._suggestions = localMatches;
        this._suggestionIndex = 0;
        this.renderSuggestions();
      }

      if (raw.length < 2) return;

      const ver = this._suggestionRequestVer;
      this._suggestionTimer = setTimeout(async () => {
        try {
          const creds = window.SessionManager ? SessionManager.getCredentials() : {};
          let url = '/api/search_kontragents';
          let bodyPayload = { ...creds, query: raw };

          if (isHeadCustomer) {
            bodyPayload.is_head = true;
          } else if (isCustomer) {
            bodyPayload.is_head = false;
          } else if (isNomenclature) {
            url = '/api/search_nomenklatura';
          }

          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyPayload)
          });
          const data = await res.json();
          if (ver !== this._suggestionRequestVer || input.value.trim() !== raw) return;

          const remoteItems = data.success ? (data.items || []) : [];

          // Yerli və server nəticələrini birləşdir, təkrarları təmizlə
          const seen = new Set();
          const combined = [];

          localMatches.forEach(item => {
            const k = (item.name || '').trim().toLowerCase();
            if (k && !seen.has(k)) {
              seen.add(k);
              combined.push(item);
            }
          });

          remoteItems.forEach(item => {
            const k = (item.name || '').trim().toLowerCase();
            if (k && !seen.has(k)) {
              seen.add(k);
              combined.push({
                ...item,
                isLocal: false,
                is_head: isHeadCustomer,
                catalog: isHeadCustomer ? "ГоловныеКонтрагенты" : (isCustomer ? "Контрагенты" : "Номенклатура")
              });
            }
          });

          this._suggestions = combined.slice(0, 35);
          this._suggestionIndex = 0;
          this.renderSuggestions();
        } catch (e) {
          console.warn("[C1FindModal] Suggestion search failed:", e);
        }
      }, 180);
    },

    renderSuggestions: function () {
      let popup = document.getElementById("c1FindSuggestions");
      if (!popup) {
        popup = document.createElement("div");
        popup.id = "c1FindSuggestions";
        popup.setAttribute("role", "listbox");
        document.body.appendChild(popup);
      }
      const input = document.getElementById("c1FindText");
      if (!input) return;
      const rect = input.getBoundingClientRect();
      popup.style.cssText = `position:fixed;z-index:2147483002;left:${rect.left}px;top:${rect.bottom}px;width:${rect.width}px;max-height:220px;overflow:auto;background:white;border:1px solid #7f9db9;box-shadow:0 3px 8px rgba(0,0,0,0.2);font:11px Tahoma;`;
      
      if (!this._suggestions.length) {
        popup.innerHTML = `<div style="padding:6px;color:#888;">${window.C1I18n ? C1I18n.t('common.empty') || 'Uyğun element tapılmadı' : 'Uyğun element tapılmadı'}</div>`;
        return;
      }

      popup.innerHTML = this._suggestions.map((item, i) => {
        let label = item.name || '';
        if (item.code && !String(item.name || '').includes(item.code)) {
          label = `${item.name} (${item.code})`;
        }
        return `<button type="button" role="option" aria-selected="${i === this._suggestionIndex}" 
                        style="display:block;width:100%;text-align:left;padding:4px 6px;border:0;background:${i === this._suggestionIndex ? '#dceaf7' : 'white'};cursor:pointer;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" 
                        onmousedown="event.preventDefault()" 
                        onclick="C1FindModal.chooseSuggestion(${i})">${escapeHtml(label)}</button>`;
      }).join("");
    },

    chooseSuggestion: function (index) {
      const item = this._suggestions?.[index];
      if (!item) return;
      const col = document.getElementById("c1FindColumn")?.value || "";
      const val = col.endsWith("_code") ? (item.code || item.name) : (item.name || item.code);
      const input = document.getElementById("c1FindText");
      if (input) input.value = val;

      const colLower = col.toLowerCase();
      let cat = "Контрагенты";
      if (colLower.includes("golovnoy")) cat = "ГоловныеКонтрагенты";
      else if (colLower.includes("nomenclat") || colLower.includes("product")) cat = "Номенклатура";
      else if (this.findCatalogForColumn(col)) cat = this.findCatalogForColumn(col);

      this._findItem = {
        catalog: cat,
        code: item.code || "",
        name: item.name || val,
        value: val,
        is_head: colLower.includes("golovnoy")
      };
      this.hideSuggestions();
      const exactRadio = document.querySelector('input[name="c1FindMatch"][value="exact"]');
      if (exactRadio) exactRadio.checked = true;
    },

    onInputKeydown: function (event) {
      if (this._suggestions?.length) {
        if (['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) {
          event.preventDefault();
          event.stopPropagation();
          if (event.key === 'Enter') {
            this.chooseSuggestion(this._suggestionIndex);
          } else {
            this._suggestionIndex = (this._suggestionIndex + (event.key === 'ArrowDown' ? 1 : -1) + this._suggestions.length) % this._suggestions.length;
            this.renderSuggestions();
          }
          return;
        }
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        this.close();
      } else if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === 'q' || event.code === 'KeyQ')) {
        event.preventDefault();
        this.clearFilter();
      }
    },

    /**
     * ====================================================================
     * QLOBAL CTRL+F ÇAĞIRIŞI: AKTİV CƏDVƏLİ TAPIR VƏ MODALI AÇIR
     * ====================================================================
     */
    openForActiveWindow: function () {
      if (!window.MdiManager) return false;
      const topWin = MdiManager.getTopmostVisibleWindow();
      if (!topWin) return false;

      console.log(`[C1FindModal] openForActiveWindow #${topWin.id} ("${topWin.title}")`);

      // 1. Universal Journal (Realizasiya, Sifarişlər, Qaimələr və s.)
      const isUj = (topWin.id === "universalJournalWindow") ||
                   topWin.id.startsWith("ujWin_") ||
                   (window.UniversalJournal && UniversalJournal.instances && UniversalJournal.instances[topWin.id]) ||
                   (topWin.element && topWin.element.querySelector(".uj-table-wrapper, #ujTableWrapper, [data-uj='ujTableWrapper']"));

      if (isUj && window.UniversalJournal) {
        const inst = (typeof UniversalJournal.getActiveInstance === "function") 
          ? UniversalJournal.getActiveInstance(topWin.id) 
          : (UniversalJournal.instances?.[topWin.id] || UniversalJournal);

        if (inst && typeof inst.getAvailableFields === "function") {
          const avail = inst.getAvailableFields();
          const currentField = inst.selectedColKey === "status" 
            ? (inst.selectedRow?.deleted ? "deleted" : "posted") 
            : (inst.selectedColKey || (avail[0] ? avail[0].key : "number"));

          const existingFilter = (inst.activeFilters || []).find(c => c.fieldKey === currentField);
          const cellValue = inst.selectedRow?.[currentField];
          const initialText = cellValue !== undefined && cellValue !== null ? String(cellValue) : (existingFilter?.value || "");

          const matchMode = existingFilter 
            ? ({ "Равно": "exact", "Начинается с": "starts", "Содержит": "contains" }[existingFilter.comparison] || "contains") 
            : "contains";

          this.open({
            title: window.C1I18n ? C1I18n.t("find.title") : "Отбор по колонке (Ctrl+F)",
            columns: avail.map(f => ({ key: f.key, label: f.label, type: f.type })),
            currentColumn: currentField,
            currentValue: initialText,
            currentMatch: matchMode,
            hasActiveFilter: Boolean(existingFilter),
            getDistinctValues: (colKey) => (typeof inst.getDistinctFieldValues === "function" ? inst.getDistinctFieldValues(colKey) : []),
            onApply: (res) => {
              const def = avail.find(f => f.key === res.fieldKey);
              const op = (def?.type && def.type !== "text") ? "Равно" : res.comparison;
              const criterion = {
                fieldKey: res.fieldKey,
                fieldLabel: def?.label || res.fieldLabel || res.fieldKey,
                comparison: op,
                operator: op,
                value: res.value,
                enabled: true
              };
              if (res.matchMode === "exact" && res.catalogItem?.value === res.value && ["kontragent", "golovnoy_kontragent"].includes(res.fieldKey)) {
                criterion.referenceCode = res.catalogItem.code;
                criterion.referenceName = res.value;
              }
              inst.selectedColKey = res.fieldKey;
              inst.commitColumnFilter(criterion);
            },
            onClear: (colKey) => {
              if (Array.isArray(inst.activeFilters)) {
                inst.activeFilters = inst.activeFilters.filter(c => c.fieldKey !== colKey);
                inst.saveActiveFiltersToStorage();
                inst.updateActiveFilterBadgeUI();
                inst.updateFilterButtonsState();
                inst.executeSearchOrFilter();
              }
            }
          });
          return true;
        }
      }

      // 2. Kontragentlər Jurnalı (KontragentyJournal)
      if (topWin.id === "kontragentyJournalWindow" && window.KontragentyJournal) {
        const columns = [
          { key: "name", label: window.C1I18n ? C1I18n.t("col.name") || "Наименование" : "Наименование" },
          { key: "code", label: window.C1I18n ? C1I18n.t("col.code") || "Код" : "Код" },
          { key: "inn", label: "VÖEN / ИНН" },
          { key: "phone", label: "Telefon / Телефон" },
          { key: "address", label: "Ünvan / Адрес" },
          { key: "manager", label: "Menecer / Менеджер" },
          { key: "parent", label: "Qrup / Группа" }
        ];
        const currentCol = KontragentyJournal.selectedColKey || "name";
        const cellVal = KontragentyJournal.selectedRow?.[currentCol] || "";

        this.open({
          title: (window.C1I18n ? C1I18n.t("kj.title") : "Контрагенты") + " — (Ctrl+F)",
          columns: columns,
          currentColumn: currentCol,
          currentValue: cellVal,
          currentMatch: "contains",
          hasActiveFilter: Boolean(KontragentyJournal.customFilterQuery),
          getDistinctValues: (colKey) => (Array.isArray(KontragentyJournal.items) ? [...new Set(KontragentyJournal.items.map(r => r[colKey]).filter(v => v !== undefined && v !== null && String(v).trim() !== ""))] : []),
          onApply: (res) => {
            if (typeof KontragentyJournal.applyColumnFind === "function") {
              KontragentyJournal.applyColumnFind(res.fieldKey, res.value, res.matchMode);
            } else {
              // Standart axtarış inputuna ötür və icra et
              const inp = document.getElementById("kjSearchInput");
              if (inp) {
                inp.value = res.value;
                KontragentyJournal.search();
              }
            }
          },
          onClear: () => {
            KontragentyJournal.clearFilter();
          }
        });
        return true;
      }

      // 3. Audit Jurnalı (AuditJournal)
      if (topWin.id === "auditJournalWindow" && window.AuditJournal) {
        const columns = [
          { key: "doc_number", label: window.C1I18n ? C1I18n.t("col.doc_number") || "Номер документа" : "Номер документа" },
          { key: "client", label: window.C1I18n ? C1I18n.t("col.kontragent") || "Клиент / Контрагент" : "Клиент / Контрагент" },
          { key: "last_author", label: window.C1I18n ? C1I18n.t("col.last_author") || "Кто изменил" : "Кто изменил" },
          { key: "author", label: window.C1I18n ? C1I18n.t("col.author") || "Автор" : "Автор" },
          { key: "doc_type", label: window.C1I18n ? C1I18n.t("aj.doc_type") || "Вид документа" : "Вид документа" },
          { key: "comment", label: window.C1I18n ? C1I18n.t("col.comment") || "Комментарий" : "Комментарий" }
        ];

        this.open({
          title: (window.C1I18n ? C1I18n.t("aj.title") : "Журнал аудита") + " — (Ctrl+F)",
          columns: columns,
          currentColumn: "client",
          currentValue: "",
          currentMatch: "contains",
          hasActiveFilter: false,
          getDistinctValues: (colKey) => (Array.isArray(AuditJournal.items) ? [...new Set(AuditJournal.items.map(r => r[colKey]).filter(v => v !== undefined && v !== null && String(v).trim() !== ""))] : []),
          onApply: (res) => {
            const inp = document.getElementById("ajSearchInput");
            if (inp) {
              inp.value = res.value;
              if (typeof AuditJournal.onSearchInput === "function") {
                AuditJournal.onSearchInput(res.value);
              } else if (typeof AuditJournal.loadList === "function") {
                AuditJournal.loadList();
              }
            }
          },
          onClear: () => {
            const inp = document.getElementById("ajSearchInput");
            if (inp) {
              inp.value = "";
              if (typeof AuditJournal.onSearchInput === "function") AuditJournal.onSearchInput("");
            }
          }
        });
        return true;
      }

      // 4. Portfel Kataloqu (PortfolioCatalog)
      if (topWin.id === "portfolioCatalogWindow" && window.PortfolioCatalog) {
        const columns = [
          { key: "all", label: "(Bütün sütunlar)" },
          { key: "name", label: "Məhsulun adı" },
          { key: "comment", label: "Qeyd" },
          { key: "artikul", label: "Artikul" },
          { key: "code", label: "Kod" },
          { key: "barcode", label: "Ştrixkod" },
          { key: "portfolio", label: "Portfel" }
        ];

        this.open({
          title: "Portfel Kataloqu — (Ctrl+F)",
          columns: columns,
          currentColumn: "name",
          currentValue: "",
          currentMatch: "contains",
          hasActiveFilter: false,
          getDistinctValues: (colKey) => (Array.isArray(PortfolioCatalog.items) ? [...new Set(PortfolioCatalog.items.map(r => r[colKey]).filter(v => v !== undefined && v !== null && String(v).trim() !== ""))] : []),
          onApply: (res) => {
            const pcInp = document.getElementById("pcSearchInput");
            if (pcInp) {
              pcInp.value = res.value;
              PortfolioCatalog.onFilterChange();
            }
          },
          onClear: () => {
            PortfolioCatalog.clearSearch();
          }
        });
        return true;
      }

      // 5. Ümumi C1TableComponent aşkarlanması
      const tableWrapper = topWin.element?.querySelector(".c1-table-wrapper, .c1-table-container, table");
      if (tableWrapper) {
        // C1TableComponent instansiyasını axtar
        let foundTable = null;
        if (window.C1TableComponent && window.C1TableComponent.activeInstances) {
          for (let tbl of C1TableComponent.activeInstances) {
            if (topWin.element.contains(tbl.container || tbl.tableEl)) {
              foundTable = tbl;
              break;
            }
          }
        }

        if (foundTable && Array.isArray(foundTable.columns) && foundTable.columns.length > 0) {
          const availCols = foundTable.columns.filter(c => c.visible !== false).map(c => ({
            key: c.key,
            label: c.label || c.title || c.key
          }));

          const selCol = foundTable.selectedColKey || (availCols[0] ? availCols[0].key : "");
          const selVal = foundTable.selectedRow?.[selCol] || "";

          this.open({
            title: (topWin.title || "Таблица") + " — (Ctrl+F)",
            columns: availCols,
            currentColumn: selCol,
            currentValue: selVal,
            currentMatch: "contains",
            hasActiveFilter: Boolean(foundTable._columnFilters && foundTable._columnFilters[selCol]),
            getDistinctValues: (colKey) => (Array.isArray(foundTable.data) ? [...new Set(foundTable.data.map(r => r[colKey]).filter(v => v !== undefined && v !== null && String(v).trim() !== ""))] : []),
            onApply: (res) => {
              if (typeof foundTable.setColumnFilter === "function") {
                foundTable.setColumnFilter(res.fieldKey, res.value, res.matchMode);
              }
            },
            onClear: (colKey) => {
              if (typeof foundTable.clearColumnFilter === "function") {
                foundTable.clearColumnFilter(colKey);
              }
            }
          });
          return true;
        }
      }

      return false;
    }
  };

  // Dil dəyişdikdə pəncərə mətnlərini yeniləyir
  window.addEventListener('c1-language-changed', () => {
    const modal = document.getElementById("c1FindModal");
    if (modal && window.C1I18n) {
      C1I18n.applyTranslations(modal);
    }
  });

  // Qlobal qeydiyyat
  window.C1FindModal = C1FindModal;
})(window);
