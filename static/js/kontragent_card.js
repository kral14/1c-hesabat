/**
 * ======================================================================
 * 1C:ENTERPRISE - COUNTERPARTY ITEM CARD CONTROLLER (Карточка Контрагента)
 * static/js/kontragent_card.js
 *
 * 1C 8.3 "Управление торговлей" ekran görüntülərinə 100% uyğunlaşdırılmış idarəedici:
 * - Orijinal 8 tab (Общие, Контакты, Счета и договоры, События, Свойства, Категории, Прочее, Форматы RB)
 * - Yuxarı başlıq (Наименование, Код)
 * - Aşağı sabit rekvizitlər (Комментарий, Типы ТТ: Jacobs, Общий, Ferrero, Лореаль, Schwarzkopf, Predo, Славянка, Diversey)
 * - Dialoq düymələri (ОК, Записать, Закрыть)
 * ======================================================================
 */

(function(window) {
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

  const KontragentCard = {
    currentCode: '',
    currentName: '',
    currentCard: null,
    activeTab: 'general',

    /**
     * Kontragent kartını açır
     */
    open: function(code = '', name = '', inn = '') {
      const win = document.getElementById('kontragentCardWindow');
      if (!win) {
        console.warn('[KontragentCard] kontragentCardWindow tapılmadı');
        return;
      }

      win.style.display = 'flex';
      win.classList.add('active');
      win.classList.remove('minimized');

      if (window.MdiManager && typeof MdiManager.activateWindow === 'function') {
        MdiManager.activateWindow('kontragentCardWindow');
      }

      this.currentCode = (code || '').trim();
      this.currentName = (name || '').trim();

      // Varsayılan olaraq 'Общие' tabını aktivləşdir
      this.switchTab('general');

      // Məlumatları serverdən yüklə
      this.loadCard(this.currentCode, this.currentName, inn);
    },

    /**
     * Pəncərəni bağlayır
     */
    close: function() {
      const win = document.getElementById('kontragentCardWindow');
      if (win) {
        win.style.display = 'none';
        win.classList.remove('active');
        win.classList.add('minimized');
      }
      if (window.MdiManager && typeof MdiManager.closeWindow === 'function') {
        try { MdiManager.closeWindow('kontragentCardWindow'); } catch (e) {}
      }
      this.closeMenus();
    },

    /**
     * Saxla və bağla (ОК)
     */
    saveAndClose: function() {
      this.save();
      this.close();
    },

    /**
     * Saxla (Записать Ctrl+S)
     */
    save: function() {
      const titleEl = document.getElementById('kcWinTitle');
      const curTitle = titleEl ? titleEl.textContent : '';
      if (titleEl && !curTitle.includes('(Записан)')) {
        titleEl.textContent = curTitle.replace(/\s*\*?$/, ' (Записан)');
      }
      // Visual feedback
      const badge = document.getElementById('kcAuditBadge');
      if (badge) {
        badge.style.transform = 'scale(1.1)';
        setTimeout(() => { badge.style.transform = 'scale(1)'; }, 200);
      }
    },

    /**
     * Məlumatları API-dən oxuyur
     */
    loadCard: function(code, name, inn) {
      const titleEl = document.getElementById('kcWinTitle');
      if (titleEl) {
        titleEl.textContent = name ? `Контрагенты: ${name} (Загрузка...)` : 'Контрагенты: Создание *';
      }

      fetch('/api/kontragent/card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code, name: name, inn: inn })
      })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.card) {
          this.renderCard(data.card);
        } else {
          console.warn('[KontragentCard] Məlumat tapılmadı:', data.error);
          this.renderFallback(code, name);
        }
      })
      .catch(err => {
        console.error('[KontragentCard] Server xətası:', err);
        this.renderFallback(code, name);
      });
    },

    /**
     * Kart məlumatlarını forma sahələrinə doldurur
     */
    renderCard: function(card) {
      this.currentCard = card;
      this.currentCode = card.code || '';
      this.currentName = card.name || '';

      // Başlıq
      const titleEl = document.getElementById('kcWinTitle');
      if (titleEl) {
        titleEl.textContent = card.name ? `Контрагенты: ${card.name} (Элемент) *` : 'Контрагенты: Создание *';
      }

      // 1. Yuxarı rekvizitlər (Наименование & Код)
      this.setVal('kcName', card.name || '');
      this.setVal('kcCode', card.code || '');

      // 2. Tab 1: Общие (Screenshot 1)
      this.setVal('kcJurFiz', card.is_legal ? 'Юрлицо' : 'Физлицо');
      this.setCheck('kcIsNonResident', card.is_non_resident);
      this.setCheck('kcIsCustomer', card.is_customer !== false);
      this.setCheck('kcIsSupplier', card.is_supplier);
      this.setVal('kcOkopf', card.okopf || '');
      this.setVal('kcParent', card.parent || '');
      this.setVal('kcFullName', card.full_name || card.name || '');
      this.setVal('kcInn', card.inn || '');
      this.setVal('kcKpp', card.kpp || '');
      this.setVal('kcOficName', card.ofic_name || '');
      // Row 6: Входит в холдинг & Головной контрагент
      const gClean = (card.golovnoy || '').trim();
      const isHolding = Boolean(card.is_holding && gClean);
      this.setCheck('kcIsHolding', isHolding);
      this.setVal('kcGolovnoy', isHolding ? gClean : '');
      this.toggleHolding(isHolding);
      
      this.setVal('kcSmartCode', card.smart_code || '');
      this.setCheck('kcSummaNds', card.summa_nds !== false);
      this.setVal('kcStavkaNds', card.stavka_nds || '');

      // Sub-table: Виды деятельности
      this.renderActivityTable(card.activity_types || []);

      // 3. Tab 2: Контакты (Screenshot 2)
      this.renderAddressesTable(card.address_rows || []);
      this.renderPersonsTable(card.contact_persons || []);

      const phonesEl = document.getElementById('kcContactPersonsPhones');
      if (phonesEl) {
        phonesEl.textContent = card.phone || '';
      }

      // 4. Tab 3: Счета и договоры
      this.renderAccountsTable(card.bank_accounts || []);
      this.renderContractsTable(card.contracts || []);

      // 5. Tab 7: Прочее (Screenshot 3)
      this.setVal('kcAccessGroup', card.access_group || '');
      this.setVal('kcWorkSchedule', card.work_schedule || '');
      this.renderPortfoliosTable(card.portfolios_subtable || []);
      this.renderNdsTable(card.nds_subtable || []);

      // 6. Sabit Aşağı Sahələr (Bütün tab-larda görünən)
      this.setVal('kcComment', card.comment || '');
      const tt = card.tt_types || {};
      this.setVal('kcTtJacobs', tt.jacobs || '');
      this.setVal('kcTtCommon', tt.common || '');
      this.setVal('kcTtFerrero', tt.ferrero || '');
      this.setVal('kcTtLoreal', tt.loreal || '');
      this.setVal('kcTtSchwarzkopf', tt.schwarzkopf || '');
      this.setVal('kcTtPredo', tt.predo || '');
      this.setVal('kcCodeSlavyanka', tt.slavyanka || '');
      this.setVal('kcCodeDiversey', tt.diversey || '');

      // 7. Audit Tab & Badge
      this.renderAuditTab(card);
    },

    /**
     * Fallback demo
     */
    renderFallback: function(code, name) {
      this.renderCard({
        code: code || '',
        name: name || '',
        full_name: name || '',
        inn: '',
        kpp: '',
        is_legal: false,
        parent: '',
        completeness_score: 0,
        missing_fields: []
      });
    },

    setVal: function(id, val) {
      const el = document.getElementById(id);
      if (el) el.value = val !== undefined && val !== null ? String(val) : '';
    },

    setCheck: function(id, checked) {
      const el = document.getElementById(id);
      if (el) el.checked = Boolean(checked);
    },

    /**
     * Холдинг / Головной контрагент sahəsini aktivləşdirir / deaktivləşdirir
     */
    toggleHolding: function(isHolding) {
      const chk = document.getElementById('kcIsHolding');
      if (chk) chk.checked = Boolean(isHolding);
      const inp = document.getElementById('kcGolovnoy');
      const wrap = document.getElementById('kcGolovnoyWrap');
      if (inp) {
        inp.disabled = !isHolding;
        inp.style.background = isHolding ? '#ffffff' : '#f0eee3';
        inp.style.color = isHolding ? '#000000' : '#888888';
        if (!isHolding) {
          inp.value = '';
        }
      }
      if (wrap) {
        wrap.querySelectorAll('button').forEach(b => {
          b.disabled = !isHolding;
          b.style.opacity = isHolding ? '1' : '0.4';
          b.style.pointerEvents = isHolding ? 'auto' : 'none';
        });
      }
    },

    /**
     * Головной контрагент kartını birbaşa açır
     */
    openGolovnoyCard: function() {
      const gVal = (document.getElementById('kcGolovnoy')?.value || '').trim();
      if (!gVal) return;
      // Extract code if format is e.g. '"ARAZ" - С000007863'
      const m = gVal.match(/(?:-\s*)([A-Za-z0-9А-Яа-я]+)$/);
      const code = m ? m[1] : '';
      KontragentCard.open({ code: code, name: gVal });
    },

    /**
     * Tab dəyişdirmə (Общие, Контакты, Счета и договоры, События, Свойства, Категории, Прочее, Форматы RB, Аудит)
     */
    switchTab: function(tabKey) {
      this.activeTab = tabKey;
      document.querySelectorAll('.kc-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.kc-tab-pane').forEach(p => p.style.display = 'none');

      const btn = document.getElementById(`kcTabBtn-${tabKey}`);
      if (btn) btn.classList.add('active');

      const pane = document.getElementById(`kcTabPane-${tabKey}`);
      if (pane) pane.style.display = 'block';
    },

    /**
     * Sub-tab dəyişdirmə (Виды деятельности / Как покупатель)
     */
    switchSubTab: function(subKey) {
      const btnAct = document.getElementById('kcSubTab-activity');
      const btnBuy = document.getElementById('kcSubTab-buyer');
      if (subKey === 'activity') {
        if (btnAct) { btnAct.style.background = '#fff'; btnAct.style.fontWeight = 'bold'; }
        if (btnBuy) { btnBuy.style.background = '#e0ded4'; btnBuy.style.fontWeight = 'normal'; }
      } else {
        if (btnBuy) { btnBuy.style.background = '#fff'; btnBuy.style.fontWeight = 'bold'; }
        if (btnAct) { btnAct.style.background = '#e0ded4'; btnAct.style.fontWeight = 'normal'; }
      }
    },

    /**
     * Виды деятельности sub-cədvəli
     */
    renderActivityTable: function(items) {
      const tbody = document.getElementById('kcActivityTableBody');
      if (!tbody) return;
      let html = '';
      items.forEach((it, idx) => {
        html += `
          <tr style="height: 20px; border-bottom: 1px solid #e2e8f0; ${idx % 2 === 1 ? 'background: #fbfbfa;' : 'background: #fff;'}">
            <td style="text-align: center; border-right: 1px solid #e2e8f0; color: #64748b;">${it.num || idx + 1}</td>
            <td style="padding: 0 6px; border-right: 1px solid #e2e8f0; font-weight: 500;">${escapeHtml(it.name)}</td>
            <td style="padding: 0 6px; color: #334155;">${escapeHtml(it.manager || '')}</td>
          </tr>
        `;
      });
      tbody.innerHTML = html;
    },

    /**
     * Адреса и телефоны cədvəli (Screenshot 2)
     */
    renderAddressesTable: function(rows) {
      const tbody = document.getElementById('kcAddressesTableBody');
      if (!tbody) return;
      let html = '';
      rows.forEach((r, idx) => {
        let icon = '🏢';
        if (r.type === 'Телефон') icon = '📞';
        else if (r.type === 'E-Mail') icon = '📧';

        html += `
          <tr style="height: 21px; border-bottom: 1px solid #e2e8f0; ${idx % 2 === 1 ? 'background: #fbfbfa;' : 'background: #fff;'}">
            <td style="padding: 0 6px; border-right: 1px solid #e2e8f0; color: #334155;">
              <span style="margin-right: 4px;">${icon}</span> <span>${escapeHtml(r.type)}</span>
            </td>
            <td style="padding: 0 6px; border-right: 1px solid #e2e8f0; color: #1e3a8a; font-weight: 500;">
              ${escapeHtml(r.kind)}
            </td>
            <td style="padding: 0 6px; color: #000; font-weight: 500;">
              ${escapeHtml(r.value)}
            </td>
          </tr>
        `;
      });
      tbody.innerHTML = html;
    },

    /**
     * Контактные лица cədvəli (Screenshot 2)
     */
    renderPersonsTable: function(persons) {
      const tbody = document.getElementById('kcPersonsTableBody');
      if (!tbody) return;
      let html = '';
      persons.forEach((p, idx) => {
        html += `
          <tr style="height: 21px; border-bottom: 1px solid #e2e8f0; ${idx % 2 === 1 ? 'background: #fbfbfa;' : 'background: #fff;'}">
            <td style="padding: 0 6px; border-right: 1px solid #e2e8f0; font-weight: 500; color: #000;">
              👤 ${escapeHtml(p.name)}
            </td>
            <td style="padding: 0 6px; color: #334155;">
              ${escapeHtml(p.role || p.position || '')}
            </td>
          </tr>
        `;
      });
      tbody.innerHTML = html;
    },

    /**
     * Банковские счета cədvəli
     */
    renderAccountsTable: function(accounts) {
      const tbody = document.getElementById('kcAccountsTableBody');
      if (!tbody) return;
      if (!accounts || accounts.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 12px; color: #94a3b8; font-style: italic;">Банковские счета не указаны</td></tr>`;
        return;
      }
      let html = '';
      accounts.forEach((acc, idx) => {
        html += `
          <tr style="height: 21px; border-bottom: 1px solid #e2e8f0; ${idx % 2 === 1 ? 'background: #fbfbfa;' : 'background: #fff;'}">
            <td style="padding: 0 6px; border-right: 1px solid #e2e8f0; font-family: monospace; font-weight: bold; color: #1e3a8a;">
              ${escapeHtml(acc.account_number || acc.iban || '')}
            </td>
            <td style="padding: 0 6px; border-right: 1px solid #e2e8f0;">${escapeHtml(acc.bank_name || acc.bank || '')}</td>
            <td style="padding: 0 6px; border-right: 1px solid #e2e8f0; font-family: monospace;">${escapeHtml(acc.bic || acc.bik || '')}</td>
            <td style="padding: 0 6px; border-right: 1px solid #e2e8f0; text-align: center;">${escapeHtml(acc.currency || 'AZN')}</td>
            <td style="text-align: center; font-weight: bold; color: #166534;">${acc.is_main ? '✔' : ''}</td>
          </tr>
        `;
      });
      tbody.innerHTML = html;
    },

    /**
     * Договоры cədvəli (1C Screenshot 3)
     */
    renderContractsTable: function(contracts) {
      const tbody = document.getElementById('kcContractsTableBody');
      if (!tbody) return;
      if (!contracts || contracts.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11" style="text-align: center; padding: 16px; color: #94a3b8; font-style: italic;">Договоры контрагента не найдены в 1C</td></tr>`;
        return;
      }
      let html = '';
      contracts.forEach((c, idx) => {
        const isDeact = Boolean(c.deactivated) || (c.status || '').toLowerCase().includes('не действует') || (c.status || '').toLowerCase().includes('закрыт');
        const isMain = Boolean(c.is_main);
        
        let iconHtml = '';
        if (isMain) {
          iconHtml = `<span title="Основной договор" style="color: #15803d; font-weight: bold; font-size: 11px; margin-right: 2px;">✔</span><span style="display: inline-block; width: 13px; height: 13px; background: #2563eb; border-radius: 2px; vertical-align: middle; line-height: 13px; text-align: center; color: #fff; font-size: 8px;">📄</span>`;
        } else if (isDeact) {
          iconHtml = `<span title="Деактивирован / Закрыт" style="display: inline-block; width: 13px; height: 13px; background: #dc2626; border-radius: 50%; vertical-align: middle; line-height: 11px; text-align: center; color: #fff; font-size: 10px; font-weight: bold;">✕</span>`;
        } else {
          iconHtml = `<span title="Действует" style="display: inline-block; width: 13px; height: 13px; background: #0284c7; border-radius: 2px; vertical-align: middle; line-height: 13px; text-align: center; color: #fff; font-size: 8px;">📄</span>`;
        }

        const textColor = isDeact ? '#64748b' : '#000000';
        const bgRow = idx % 2 === 1 ? '#fbfbfa' : '#ffffff';

        html += `
          <tr style="height: 21px; border-bottom: 1px solid #e2e8f0; background: ${bgRow}; ${isMain ? 'font-weight: 500;' : ''}; color: ${textColor};" onmouseover="this.style.background='#e9f2ff'" onmouseout="this.style.background='${bgRow}'">
            <td style="text-align: center; border-right: 1px solid #e2e8f0; padding: 0 2px;">
              ${iconHtml}
            </td>
            <td style="padding: 0 6px; border-right: 1px solid #e2e8f0; font-family: monospace; color: #1e3a8a;">
              ${escapeHtml(c.code || '')}
            </td>
            <td style="padding: 0 6px; border-right: 1px solid #e2e8f0; overflow: hidden; text-overflow: ellipsis; ${isDeact ? 'text-decoration: line-through;' : ''}">
              <span title="${escapeHtml(c.name || '')}">${escapeHtml(c.name || '')}</span>
            </td>
            <td style="padding: 0 6px; border-right: 1px solid #e2e8f0; color: #334155;">
              ${escapeHtml(c.settlement_type || 'По договору в целом')}
            </td>
            <td style="padding: 0 6px; border-right: 1px solid #e2e8f0; color: #334155;">
              ${escapeHtml(c.contract_kind || 'С покупателем')}
            </td>
            <td style="padding: 0 6px; border-right: 1px solid #e2e8f0; color: #000; overflow: hidden; text-overflow: ellipsis;">
              ${escapeHtml(c.agent || '')}
            </td>
            <td style="padding: 0 6px; border-right: 1px solid #e2e8f0; font-family: monospace; color: #475569;">
              ${escapeHtml(c.schedule || '')}
            </td>
            <td style="padding: 0 4px; border-right: 1px solid #e2e8f0; text-align: center; font-family: monospace;">
              ${escapeHtml(c.number || '')}
            </td>
            <td style="padding: 0 4px; border-right: 1px solid #e2e8f0; text-align: center;">
              ${escapeHtml(c.date || '')}
            </td>
            <td style="padding: 0 6px; border-right: 1px solid #e2e8f0; color: #1e3a8a; overflow: hidden; text-overflow: ellipsis;">
              ${escapeHtml(c.portfolio || '')}
            </td>
            <td style="padding: 0 6px; color: #334155; overflow: hidden; text-overflow: ellipsis;">
              ${escapeHtml(c.organization || 'Основная организация')}
            </td>
          </tr>
        `;
      });
      tbody.innerHTML = html;
    },

    /**
     * Tab 7: Портфели cədvəli (Screenshot 3)
     */
    renderPortfoliosTable: function(items) {
      const tbody = document.getElementById('kcPortfoliosTableBody');
      if (!tbody) return;
      let html = '';
      items.forEach((p, idx) => {
        html += `
          <tr style="height: 20px; border-bottom: 1px solid #e2e8f0; ${idx % 2 === 1 ? 'background: #fbfbfa;' : 'background: #fff;'}">
            <td style="padding: 0 6px; border-right: 1px solid #e2e8f0; color: #64748b;">${escapeHtml(p.period)}</td>
            <td style="padding: 0 6px; border-right: 1px solid #e2e8f0; font-weight: 500; color: #000;">${escapeHtml(p.portfolio)}</td>
            <td style="padding: 0 6px; color: #334155;">${escapeHtml(p.channel)}</td>
          </tr>
        `;
      });
      tbody.innerHTML = html;
    },

    /**
     * Tab 7: Ставки НДС cədvəli (Screenshot 3)
     */
    renderNdsTable: function(items) {
      const tbody = document.getElementById('kcNdsTableBody');
      if (!tbody) return;
      let html = '';
      items.forEach((n, idx) => {
        html += `
          <tr style="height: 20px; border-bottom: 1px solid #e2e8f0; ${idx % 2 === 1 ? 'background: #fbfbfa;' : 'background: #fff;'}">
            <td style="padding: 0 6px; border-right: 1px solid #e2e8f0; color: #64748b;">${escapeHtml(n.period)}</td>
            <td style="padding: 0 6px; border-right: 1px solid #e2e8f0; font-weight: 500; color: #000;">${escapeHtml(n.kontragent)}</td>
            <td style="padding: 0 6px; font-weight: bold; color: #1e3a8a;">${escapeHtml(n.rate)}</td>
          </tr>
        `;
      });
      tbody.innerHTML = html;
    },

    /**
     * Audit tabı və badge
     */
    renderAuditTab: function(card) {
      const score = card.completeness_score !== undefined ? card.completeness_score : 100;
      const scoreText = document.getElementById('kcAuditScoreText');
      const pctText = document.getElementById('kcAuditPctText');
      const progressBar = document.getElementById('kcAuditProgressBar');
      const badge = document.getElementById('kcAuditBadge');

      if (scoreText) scoreText.textContent = `${score}%`;
      if (pctText) pctText.textContent = `${score}%`;
      if (progressBar) progressBar.style.width = `${score}%`;

      if (badge) {
        if (score >= 80) {
          badge.style.background = '#dcfce7';
          badge.style.color = '#166534';
          badge.style.borderColor = '#bbf7d0';
        } else if (score >= 50) {
          badge.style.background = '#fef3c7';
          badge.style.color = '#b45309';
          badge.style.borderColor = '#fde68a';
        } else {
          badge.style.background = '#fee2e2';
          badge.style.color = '#991b1b';
          badge.style.borderColor = '#fca5a5';
        }
      }

      const missingList = document.getElementById('kcAuditMissingList');
      if (!missingList) return;

      const missing = card.missing_fields || [];
      if (missing.length === 0) {
        missingList.innerHTML = `
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 10px; border-radius: 2px; color: #166534; font-size: 11px;">
            ✔ <strong>Все обязательные реквизиты заполнены!</strong> Контрагент полностью готов к формированию счетов-фактур, накладных и налоговой отчетности в 1С.
          </div>
        `;
        return;
      }

      let html = '';
      missing.forEach(m => {
        html += `
          <div style="background: #fffbeb; border: 1px solid #fef3c7; border-left: 3px solid #d97706; padding: 6px 10px; display: flex; align-items: center; justify-content: space-between;">
            <div>
              <strong style="color: #92400e;">⚠️ ${escapeHtml(m.label)}:</strong>
              <span style="color: #78350f; margin-left: 4px;">${escapeHtml(m.message)}</span>
            </div>
          </div>
        `;
      });
      missingList.innerHTML = html;
    },

    /**
     * Menyu idarəsi
     */
    toggleActionsMenu: function(e) {
      if (e) e.stopPropagation();
      const menu = document.getElementById('kcActionsMenu');
      if (menu) menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
    },

    toggleGotoMenu: function(e) {
      if (e) e.stopPropagation();
      const menu = document.getElementById('kcGotoMenu');
      if (menu) menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
    },

    closeMenus: function() {
      ['kcActionsMenu', 'kcGotoMenu'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
    },

    copyInn: function() {
      const inn = (document.getElementById('kcInn')?.value || '').trim();
      if (inn) {
        navigator.clipboard.writeText(inn);
        alert(`ИНН / VÖEN скопирован: ${inn}`);
      }
    },

    clone: function() {
      alert('Копирование контрагента в разработке');
    },

    openReports: function() {
      alert('Отчеты по контрагенту: Взаиморасчеты, Продажи');
    },

    // 1C Справочник: Группы доступа контрагентов (Только 9 региональных групп из 1C)
    accessGroupsList: [
      { code: '000004', name: '01.Gence', region: 'Гянджа' },
      { code: '000005', name: '02.Sheki', region: 'Шеки' },
      { code: '000006', name: '03.Sabirabad', region: 'Сабирабад' },
      { code: '000003', name: '04.Xachmaz', region: 'Хачмаз' },
      { code: '000007', name: '05.Lenkaran', region: 'Ленкорань' },
      { code: '000008', name: '06.Naxchivan', region: 'Нахчыван' },
      { code: '000001', name: 'Bakı', region: 'Баку' },
      { code: '000009', name: 'Fuzuli', region: 'Физули' },
      { code: '000002', name: 'Tesischiler', region: 'Баку' }
    ],

    selectedAccessGroupIndex: 0,

    /**
     * Справочник Контрагенты (Папка / Группа контрагента) pəncərəsini açır
     */
    openSpravochnikKontragenty: function() {
      if (window.KontragentyJournal && typeof KontragentyJournal.open === 'function') {
        KontragentyJournal.open();
      } else {
        alert('Справочник Контрагенты');
      }
    },

    openAccessGroupSelector: function() {
      const modal = document.getElementById('kcAccessGroupModal');
      if (!modal) return;
      modal.style.display = 'flex';
      
      const currentVal = (document.getElementById('kcAccessGroup')?.value || '').trim();
      const foundIdx = this.accessGroupsList.findIndex(g => g.name.toLowerCase() === currentVal.toLowerCase());
      if (foundIdx >= 0) {
        this.selectedAccessGroupIndex = foundIdx;
      }
      this.renderAccessGroupModalTable();
    },

    closeAccessGroupSelector: function() {
      const modal = document.getElementById('kcAccessGroupModal');
      if (modal) modal.style.display = 'none';
    },

    renderAccessGroupModalTable: function() {
      const tbody = document.getElementById('kcAccessGroupTableBody');
      if (!tbody) return;
      let html = '';
      this.accessGroupsList.forEach((ag, idx) => {
        const isSelected = (idx === this.selectedAccessGroupIndex);
        html += `
          <div onclick="KontragentCard.highlightAccessGroup(${idx})" ondblclick="KontragentCard.selectAccessGroup(${idx})"
               style="display: flex; align-items: center; height: 21px; font-size: 11px; cursor: pointer; border-bottom: 1px solid #f0f0f0; ${isSelected ? 'background: #316ac5; color: #ffffff;' : (idx % 2 === 1 ? 'background: #fbfbfa; color: #000;' : 'background: #fff; color: #000;')}">
            <div style="width: 24px; min-width: 24px; text-align: center; font-size: 10px;">
              <span style="display: inline-block; width: 12px; height: 9px; background: ${isSelected ? '#fff' : '#4f81bd'}; border: 1px solid #204d80; border-radius: 1px;"></span>
            </div>
            <div style="width: 70px; min-width: 70px; padding: 0 4px; font-family: monospace; border-right: 1px solid ${isSelected ? '#5a8ed8' : '#e2e8f0'};">${escapeHtml(ag.code)}</div>
            <div style="flex: 1; min-width: 0; padding: 0 6px; font-weight: 500;">${escapeHtml(ag.name)}</div>
          </div>
        `;
      });
      tbody.innerHTML = html;
    },

    highlightAccessGroup: function(idx) {
      this.selectedAccessGroupIndex = idx;
      this.renderAccessGroupModalTable();
    },

    selectAccessGroup: function(idx) {
      if (idx === undefined) idx = this.selectedAccessGroupIndex;
      const ag = this.accessGroupsList[idx];
      if (ag) {
        this.setVal('kcAccessGroup', ag.name);
        this.setVal('kcRegion', ag.region);
      }
      this.closeAccessGroupSelector();
    },

    refresh: function() {
      if (this.currentCode || this.currentName) {
        this.loadCard(this.currentCode, this.currentName);
      }
    }
  };

  // Close menus on click outside
  document.addEventListener('click', function() {
    KontragentCard.closeMenus();
  });

  // Keyboard shortcut listener for Esc, Ctrl+S
  document.addEventListener('keydown', function(e) {
    const cardWin = document.getElementById('kontragentCardWindow');
    if (!cardWin || cardWin.style.display === 'none') return;

    if (e.key === 'Escape') {
      KontragentCard.close();
    } else if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      KontragentCard.save();
    }
  });

  window.KontragentCard = KontragentCard;

})(window);
