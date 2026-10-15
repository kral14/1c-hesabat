/**
 * ========================================================================
 * 1C:ENTERPRISE - INTERNATIONALIZATION (i18n) MODULE
 * static/js/c1_i18n.js
 *
 * Azerbaijani (AZ) and Russian (RU) multi-language management:
 * - Persistent language storage in LocalStorage ('c1_app_lang')
 * - Automatic DOM traversal with data-i18n, data-i18n-title, data-i18n-placeholder
 * - Intelligent phrase-based text-node translation for unannotated 1C controls
 * - Event-driven updates ('c1-language-changed') for dynamic JS components
 * - Section-by-section dictionaries: Menus, Toolbars, Dashboard, Journals,
 *   Tables, Column Settings, Filter Dialogs, Common Actions
 * ========================================================================
 */

(function(window) {
  'use strict';

  const STORAGE_KEY = 'c1_app_lang';
  const DEFAULT_LANG = 'az';

  const translations = {
    az: {
      // Menyu barı
      "menu.file": "Fayl",
      "menu.file.new_report": "Yeni hesabat",
      "menu.file.formirovat": "Formalaşdır",
      "menu.file.export_excel": "Excel-ə ixrac (.xlsx)...",
      "menu.file.print": "Çap et...",
      "menu.file.exit": "Çıxış",
      
      "menu.docs": "Sənədlər",
      "menu.docs.realizasiya": "Malların və xidmətlərin satışı",
      "menu.docs.vozvrat": "Alıcıdan malların qaytarılması",
      "menu.docs.pogruzka": "Maşınların yüklənməsi",
      "menu.docs.prices": "Nomenklatura qiymətlərinin təyini",
      "menu.docs.orders": "Alıcı sifarişi",
      "menu.docs.postuplenie": "Malların və xidmətlərin daxil olması",
      "menu.docs.inventory": "Anbarda malların inventarizasiyası",
      "menu.docs.spisanie": "Malların silinməsi",
      "menu.docs.oprixodovanie": "Malların mədaxili",
      "menu.docs.all_journal": "Sənədlər jurnalı (Hamısı)...",

      "menu.ops": "Əməliyyatlar",
      "menu.ops.journal": "Sənədlər jurnalı",
      "menu.ops.audit": "Dəyişikliklər jurnalı (Audit)",
      "menu.ops.catalog_nom": "Soraqça.Nomenklatura",
      "menu.ops.catalog_warehouses": "Soraqça.Anbarlar",
      "menu.ops.catalog_kontragenty": "Soraqça.Kontragentlər",
      "menu.ops.catalog_agents": "Soraqça.Agentlər",
      "menu.ops.catalog_prices": "Soraqça.Qiymət növləri",

      "menu.reports": "Hesabatlar",
      "menu.reports.stock": "Anbarlardakı mallar (Cədvəl)",
      "menu.reports.orders_analysis": "Alıcı sifarişləri (Analiz)",
      "menu.reports.portfolio": "Portfellər üzrə mallar (Reyestr)",
      "menu.reports.settings": "Hesabat tənzimləmələri...",

      "menu.service": "Xidmət",
      "menu.service.restore": "Tənzimləməni bərpa et...",
      "menu.service.save": "Tənzimləməni saxla...",
      "menu.service.defaults": "Standart tənzimləmələr",
      "menu.service.change_user": "Məlumat bazasını / istifadəçini dəyiş...",
      "menu.service.diagnostics": "Seçim diaqnostikası (niyə boşdur?)",

      "menu.windows": "Pəncərələr",
      "menu.help": "Kömək",
      "menu.help.f1": "Kömək (F1)",
      "menu.help.about": "Proqram haqqında",

      "top.diagnostics": "Diaqnostika",
      "top.diagnostics_title": "Seçim və jurnal diaqnostikası (axtarış niyə boşdur?)",
      
      // Əsas alətlər paneli (Toolbar)
      "toolbar.realizasiya": "Satış",
      "toolbar.vozvrat": "Qaytarma",
      "toolbar.pogruzka": "Yükləmə",
      "toolbar.prices": "Qiymətlər",
      "toolbar.orders": "Sifarişlər",
      "toolbar.postuplenie": "Daxilolma",
      "toolbar.audit": "Audit",
      "toolbar.stock": "Qalıqlar",
      "toolbar.bulk_title": "End/Home zamanı bir sorğuda alınan sənəd sayı",
      "toolbar.bulk_settings_title": "End/Home parametrləri",
      "toolbar.active_db": "Aktiv 1C Bazası",
      "toolbar.active_user": "Aktiv İstifadəçi",

      // İş Masası (Dashboard)
      "dash.title": "1С:Müəssisə 8.3 — Aztrade",
      "dash.subtitle": "İdarəetmə Paneli (İş masası)",
      "dash.docs_title": "1C SƏNƏDLƏRİ (JURNALLAR)",
      "dash.docs_badge": "9 SƏNƏD NÖVÜ",
      "dash.sub_realizasiya": "Satış, xərc qaimələri",
      "dash.sub_vozvrat": "Geri qaytarma qaimələri, üzləşmə",
      "dash.sub_pogruzka": "Reyslər, ekspedisiya və çatdırılma",
      "dash.sub_prices": "Qiymət cədvəlləri, yenidən qiymətləndirmə",
      "dash.sub_orders": "Müştəri sifarişləri, rezervasiya",
      "dash.sub_postuplenie": "Təchizatçılardan mədaxil",
      "dash.sub_inventory": "Sayım və qalıqların tutuşdurulması",
      "dash.sub_spisanie": "Çatışmazlıq, xarab olma, silinmə",
      "dash.sub_oprixodovanie": "Artıq mallar, ilkin qalıqların daxili",
      "dash.all_journal": "Bütün sənədlərin vahid jurnalı",
      "dash.sub_all_journal": "Bütün sənədlər bir pəncərədə",
      "dash.audit_title": "DƏYİŞİKLİKLƏRƏ NƏZARƏT",
      "dash.audit_badge": "AUDİT",
      "dash.audit_card": "Sənəd Dəyişiklikləri və Versiya Tarixçəsi Jurnalı",
      "dash.audit_desc": "Sənədi kim dəyişib, məbləğ və sətirlərin müqayisəsi, keçirilmə tarixi",
      "dash.reports_title": "Hesabatlar (Cədvəllər)",
      "dash.report_stock": "Anbarlardakı mallar",
      "dash.report_stock_sub": "Qalıqlar, mədaxil, məxaric, dövriyyə",
      "dash.report_orders": "Alıcı sifarişləri (Analiz)",
      "dash.report_orders_sub": "Sifarişlər, göndərişlər, qalıq borclar",
      "dash.report_portfolio": "Portfellər üzrə mallar",
      "dash.report_portfolio_sub": "Brendlər, seqmentlər və qruplar üzrə bölgü",
      "dash.catalogs_title": "1C Soraqçaları",
      "dash.cat_nom": "Nomenklatura",
      "dash.cat_warehouses": "Anbarlar",
      "dash.cat_kontragenty": "Kontragentlər (Audit)",
      "dash.cat_kontragenty_sub": "Kontragentlər və rekvizitlərin doluluq auditi",
      "dash.cat_kontragent_card": "Kontragent kartı",
      "dash.cat_agents": "Agentlər (Ticarət nümayəndələri)",
      "dash.cat_prices": "Qiymət növləri",
      "dash.cat_users": "1C İstifadəçiləri",
      "dash.status_ready": "Hazırdır",
      "dash.desktop": "İş masası",

      // Ümumi düymələr və əməliyyatlar
      "common.close": "Bağla",
      "common.cancel": "İmtina",
      "common.select": "Seç",
      "common.clear": "Təmizlə",
      "common.delete": "Sil",
      "common.add": "Əlavə et",
      "common.edit": "Dəyiş",
      "common.refresh": "Yenilə",
      "common.save": "Yadda saxla",
      "common.save_and_close": "Yadda saxla və bağla",
      "common.post": "Keçir",
      "common.post_and_close": "Keçir və bağla",
      "common.copy": "Kopyala",
      "common.formirovat": "Formalaşdır",
      "common.settings": "Tənzimləmə...",
      "common.apply": "Tətbiq et",
      "common.ok": "OK",
      "common.help": "Kömək",
      "common.move_up": "Yuxarı daşı",
      "common.move_down": "Aşağı daşı",
      "common.print": "Çap et...",
      "common.export_excel": "Excel-ə ixrac (.xlsx)",
      "common.actions": "Əməliyyatlar",
      "common.history": "Tarixçə",
      "common.search": "Axtarış:",
      "common.ready": "Hazırdır",
      "common.all": "Hamısı",
      "common.none": "Qeyd olunmayıb",
      "common.items_count": "element",

      // Universal Sənəd Jurnalı (UJ)
      "uj.doc_label": "Sənəd:",
      "uj.doc_journal": "Sənədlər jurnalı",
      "uj.all_period": "(Bütün dövr)",
      "uj.period_title": "Tarix aralığını seçin",
      "uj.edit_title": "Sənədi dəyiş / redaktə et (İkiqat klik / Enter)",
      "uj.refresh_title": "Siyahını yenilə (F5)",
      "uj.new_window_title": "Eyni jurnaldan yenisini aç (➕)",
      "uj.filter_title": "Siyahının tənzimlənməsi (Süzgəc və çeşidləmə)...",
      "uj.quick_filter_title": "Cari sütundakı dəyərə görə süzgəc (F7)",
      "uj.remove_col_filter_title": "Cari sütun üzrə süzgəci çıxar",
      "uj.clear_all_filters_title": "Bütün süzgəcləri söndür",
      "uj.restore_preset_title": "Tənzimləməni seç (Yadda saxlanmış süzgəclər)...",
      "uj.save_preset_title": "Tənzimləməni saxla (Cari süzgəci saxla)...",
      "uj.btn_columns": "Sütunlar...",
      "uj.btn_history": "Tarixçə",
      "uj.search_placeholder": "Bütün sütunlar üzrə axtar...",
      "uj.empty_title": "Sənədlər tapılmadı",
      "uj.empty_desc": "Tarix aralığını dəyişin və ya digər sənəd növünü seçin.",
      "uj.loading": "1C: Məlumatlar sorğulanır...",
      "uj.stop_loading": "⏹ Dayandır (Pause)",
      "uj.status_ready": "Hazırdır",
      "uj.status_total": "Cəmi: {count} sənəd",
      "uj.order_edit": "Sifarişi dəyiş",

      // Ctrl+F Sütun üzrə axtarış modalı
      "find.title": "Sütun üzrə axtarış (Ctrl+F)",
      "find.where": "Harada axtarmalı:",
      "find.what": "Nə axtarmalı:",
      "find.how": "Necə axtarmalı:",
      "find.starts": "Sətrin əvvəlinə görə",
      "find.contains": "Sətrin hissəsinə görə",
      "find.exact": "Dəqiq uyğunluğa görə",
      "find.apply": "Süzgəci tətbiq et",
      "find.choose_cat": "Soraqçadan seç",
      "find.item_info": "Seçilmiş element haqqında məlumat",
      "find.clear_filter": "Süzgəci çıxar (Ctrl+Q)",

      // Universal Süzgəc Pəncərəsi (Filter Window)
      "filter.window_title": "Siyahının tənzimlənməsi",
      "filter.tab_main": "Əsaslar",
      "filter.tab_filter": "Süzgəc",
      "filter.tab_sort": "Çeşidləmə",
      "filter.tab_style": "Şərti tərtibat",
      "filter.tab_group": "Qruplaşdırma",
      "filter.available_fields": "Mövcud sahələr",
      "filter.available_fields_colon": "Mövcud sahələr:",
      "filter.select_field_title": "Seçilmiş sahəni süzgəcə əlavə et",
      "filter.add_condition": "Yeni element əlavə et",
      "filter.add_condition_title": "Yeni element əlavə et",
      "filter.group_conditions": "Şərtləri qruplaşdır",
      "filter.root_otbor": "Təqdimat: Süzgəc",
      "filter.clear_all_title": "Bütün şərtləri təmizlə",
      "filter.col_field": "Sahə",
      "filter.col_comparison": "Müqayisə növü",
      "filter.col_value": "Dəyər",
      "filter.tab_other_hint": "Bu bölmə əsas jurnal cədvəli vasitəsilə əlçatandır.",
      "filter.return_to_otbor": "Süzgəcə qayıt",
      "filter.save_settings": "Tənzimləməni saxla...",
      "filter.finish_edit": "Redaktəni tamamla",
      "filter.add_available_field_title": "Mövcud sahələr siyahısına sahə əlavə et",
      "filter.remove_available_field_title": "Seçilmiş sahəni mövcud sahələrdən sil",
      "filter.add_field_dialog_title": "Süzgəc üçün sahə seçimi",
      "filter.field_search_placeholder": "Sahə axtarışı...",
      "filter.available_catalog_fields": "Bütün mövcud 1C sahələri:",
      "filter.reset_default_fields": "Standart sahələri bərpa et",
      "filter.custom_field_btn": "Fərdi sahə...",
      "filter.already_added": "Artıq siyahıdadır",

      // Sahə Seçimi Modalı (Field Selector / 3-dots)
      "field_select.title": "Sahə seçimi",
      "field_select.search_placeholder": "Sahə axtarışı...",

      // Hesabat Tənzimləmələri Modalı (Settings Dialog)
      "rep_set.title": "Tənzimləmə: Anbarlardakı mallar",
      "rep_set.period_from": "Dövr:",
      "rep_set.period_to": "—",
      "rep_set.parameters": "Parametrlər",
      "rep_set.negative_red": "Mənfilər qırmızı ilə",
      "rep_set.show_grand_totals": "Ümumi yekunları çıxar",
      "rep_set.show_details": "Ətraflı qeydləri çıxar",
      "rep_set.use_properties": "Xüsusiyyət və kateqoriyalardan istifadə et",
      "rep_set.price_types": "Qiymət növləri:",
      "rep_set.tab_indicators": "Göstəricilər",
      "rep_set.tab_row_groups": "Sətir qruplaşdırmaları",
      "rep_set.tab_col_groups": "Sütun qruplaşdırmaları",
      "rep_set.tab_filter": "Süzgəclər",
      "rep_set.groupings_row": "Sətir qruplaşdırmaları",
      "rep_set.groupings_col": "Sütun qruplaşdırmaları",
      "rep_set.type": "Növ",
      "rep_set.ind_representation": "Təqdimat",
      "rep_set.barcode_unit": "Ştrixkod (ədəd)",
      "rep_set.barcode_box": "Ştrixkod (qutu)",
      "rep_set.barcode_block": "Ştrixkod (blok)",
      "rep_set.base_qty_group": "Miqdar (əsas vahidlərdə)",
      "rep_set.start_qty": "İlkin qalıq",
      "rep_set.in_qty": "Mədaxil",
      "rep_set.out_qty": "Məxaric",
      "rep_set.end_qty": "Son qalıq",
      "rep_set.qty_group": "Miqdar",
      "rep_set.turnover": "Dövriyyə",
      "rep_set.price_cost_group": "Qiymət və Dəyər",
      "rep_set.price_ind": "Qiymət (1 ədədin qiyməti)",
      "rep_set.sum_ind": "Məbləğ (Son qalıq)",
      "rep_set.advanced": "Genişlənmiş tənzimləmə",

      // Hesabat Cədvəli (Report Sheet)
      "sheet.empty_title": "Hesabat formalaşdırılmayıb",
      "sheet.empty_hint": "Yuxarı alətlər panelində <b>▶ Formalaşdır</b> düyməsinə basın və ya fərdi süzgəcləri və göstəriciləri tənzimləmək üçün <b>Tənzimləmə...</b> pəncərəsini açın.",
      "sheet.meta_indicators": "Göstəricilər:",
      "sheet.meta_groupings": "Sətir qruplaşdırmaları:",
      "sheet.meta_filters": "Süzgəclər:",
      "sheet.meta_extra": "Əlavə sahələr:",
      "sheet.meta_sort": "Çeşidləmə:",

      // Kontekst menyu (Context Menu)
      "cm.cut": "Kəs",
      "cm.copy": "Kopyala",
      "cm.paste": "Yapışdır",
      "cm.special_paste": "Xüsusi yapışdırma...",
      "cm.select_all": "Hamısını seç",
      "cm.merge": "Birləşdir",
      "cm.split_cell": "Xananı böl",
      "cm.delete": "Sil",
      "cm.clear": "Təmizlə",
      "cm.insert_comment": "Qeyd əlavə et",
      "cm.group_levels": "Qruplaşdırma səviyyələri",
      "cm.level_1": "Səviyyə 1",
      "cm.level_2": "Səviyyə 2",
      "cm.level_3": "Səviyyə 3",
      "cm.properties": "Xüsusiyyətlər",

      // Dəyərlər siyahısı modalı (Value List Modal)
      "vl.title": "Dəyərlər siyahısının redaktəsi",
      "vl.list_title": "Dəyərlər siyahısı",
      "vl.match_all": "Hamısı eyni vaxtda (VƏ)",
      "vl.scope_all": "Bütün görünən sahələr",
      "vl.scope_name": "Adı",
      "vl.scope_artikul": "Artikul",
      "vl.scope_code": "Kod",
      "vl.scope_barcode": "Ştrixkod",
      "vl.podbor": "Seçim (Podbor)",
      "vl.col_comparison": "Müqayisə növü",
      "vl.col_code": "Kod",
      "vl.col_artikul": "Artikul",
      "vl.col_barcode": "Ştrixkod",
      "vl.col_value": "Dəyər (Adı)",

      // Tarix seçimi modalı (Period Picker)
      "pp.title": "Dövrü seçin",
      "pp.clear_link": "Dövrü təmizlə",
      "pp.month": "Ay",
      "pp.quarter": "Rüb",
      "pp.year": "İl",
      "pp.presets": "Standart dövrlər",
      "pp.preset_today": "Bu gün",
      "pp.preset_yesterday": "Dünən",
      "pp.preset_this_week": "Cari həftə",
      "pp.preset_this_month": "Cari ay",
      "pp.preset_last_month": "Ötən ay",
      "pp.preset_this_quarter": "Cari rüb",
      "pp.preset_this_year": "Cari il",
      "pp.preset_last_year": "Ötən il",

      // Operatorlar
      "op.equal": "Bərabərdir",
      "op.not_equal": "Bərabər deyil",
      "op.in_list": "Siyahıdan qrupda",
      "op.not_in_list": "Siyahıdakı qrupda deyil",
      "op.contains": "Tərkibində var",
      "op.not_contains": "Tərkibində yoxdur",
      "op.starts_with": "İlə başlayır",
      "op.ends_with": "İlə bitir",
      "op.less": "Kiçikdir",
      "op.greater": "Böyükdür",
      "op.less_or_equal": "Kiçik və ya bərabər",
      "op.greater_or_equal": "Böyük və ya bərabər",
      "op.interval": "İnterval",
      "op.filled": "Doldurulub",
      "op.not_filled": "Doldurulmayıb",

      // Cədvəl Sütun Başlıqları
      "col.date": "Tarix",
      "col.number": "Nömrə",
      "col.doc_no": "Sənəd №",
      "col.kontragent": "Kontragent",
      "col.client": "Müştəri",
      "col.parent_kontragent": "Baş kontragent",
      "col.agent": "Agent",
      "col.kontragent_code": "Kontragent kodu",
      "col.portfolio": "Portfel",
      "col.sum": "Məbləğ",
      "col.sum_azn": "Məbləğ (AZN)",
      "col.warehouse": "Anbar",
      "col.order_no": "Sifariş nömrəsi",
      "col.processing_no": "Emal nömrəsi",
      "col.vms_status": "VMS statusu",
      "col.contract": "Müqavilə",
      "col.price_type": "Qiymət növü",
      "col.route": "Yükləmə marşrutu",
      "col.driver": "Sürücü",
      "col.responsible": "Məsul şəxs",
      "col.comment": "Qeyd",
      "col.author": "Müəllif",
      "col.editor": "Kim dəyişib",
      "col.last_op": "Son Əməliyyat",
      "col.versions": "Versiyalar",
      "col.open_audit": "Audit Aç",
      "col.code": "Kod",
      "col.artikul": "Artikul",
      "col.barcode": "Ştrixkod",
      "col.name": "Adı",
      "col.unit": "Ölçü vahidi",
      "col.qty": "Miqdar",
      "col.price": "Qiymət",
      "col.start_balance": "İlkin qalıq",
      "col.in_qty": "Mədaxil",
      "col.out_qty": "Məxaric",
      "col.end_balance": "Son qalıq",
      "col.turnover": "Dövriyyə",
      "col.total": "Cəmi",
      "col.grand_total": "Yekun",
      "col.line_no": "№",
      "col.status": "Vəziyyət",
      "col.doc_number": "Sənəd №",
      "col.last_author": "Kim dəyişib",
      "col.amount": "Məbləğ (AZN)",
      "col.audit_open": "Audit Aç",
      "col.nom_type": "Nom. növü",
      "table.menu_export": "İxrac",
      "common.all_doc_types": "Hamısı (Bütün sənəd növləri)",

      // Kataloq seçicisi (Catalog Selector)
      "cat.select_folder": "📁 Qovluğu seç",
      "cat.hierarchical_view": "İyerarxik baxış (Qovluq ağacı)",
      "cat.search_placeholder": "Bütün sütunlar üzrə axtar (Ctrl+Q)...",
      "cat.stock_title": "Anbarlarda malların qalıqları",
      "cat.price_types": "Qiymət növləri:",
      "cat.col_wh_char": "Xüsusiyyət / Anbar",
      "cat.col_total_stock": "Ümumi qalıq",
      "cat.col_free_stock": "Sərbəst qalıq",
      "cat.col_reserve": "Rezervdə",
      "cat.active_element_prefix": "Aktiv Element:",
      "cat.podbor_banner": "📌 <b>Seçim rejimi (Podbor):</b> Element və ya qovluqlara iki dəfə klikləyin (və ya [Seç] basın). Siyahıya əlavə olunacaq.",

      // Kontragentlər jurnalı (Kontragenty Journal)
      "kj.title": "Kontragentlər (Soraqça və rekvizitlərin doluluq auditi)",
      "kj.btn_filter_title": "Siyahının tənzimlənməsi (Süzgəc və çeşidləmə)...",
      "kj.btn_quick_filter_title": "Cari sütundakı dəyərə görə süzgəc (F7)",
      "kj.btn_remove_col_filter_title": "Cari sütun üzrə süzgəci çıxar (Shift+F7)",
      "kj.btn_clear_filter_title": "Bütün süzgəcləri söndür",
      "kj.btn_columns_title": "Siyahının tənzimlənməsi (sütunlar, görünüş, sıra, en)...",
      "kj.btn_columns": "Sütunlar...",
      "kj.search_placeholder": "Ad, kod, VÖEN üzrə axtar...",
      "kj.active_filters": "Aktiv süzgəclər:",
      "kj.chip_all": "🔘 Bütün kontragentlər",
      "kj.chip_no_inn": "⚠️ VÖEN yoxdur",
      "kj.chip_has_inn": "✔ VÖEN var",
      "kj.chip_no_contract": "⚠️ Müqaviləsiz",
      "kj.chip_no_bank": "⚠️ Bank hesabı yoxdur",
      "kj.loading": "Kontragent məlumatları yüklənir...",
      "kj.footer_showing": "Göstərilir:",
      "kj.footer_from": "—",
      "kj.footer_hint": "İkiqat klik və ya F2 kontragent kartını açır",
      "kj.prev": "◀ Geri",
      "kj.next": "İrəli ▶",

      // Audit Jurnalı (Audit Journal)
      "aj.title": "Sənəd Dəyişiklikləri və Audit Jurnalı (Tarixçə, İstifadəçilər və Fərqlər)",
      "aj.doc_type": "Sənəd növü:",
      "aj.change_date": "Dəyişiklik tarixi",
      "aj.7_days": "7 gün",
      "aj.filter": "Filtr:",
      "aj.all_docs": "Bütün sənədlər",
      "aj.modified_only": "Yalnız dəyişdirilənlər (>1 versiya)",
      "aj.posted_only": "Yalnız təsdiqlənənlər (✔ Provodka)",
      "aj.draft_only": "Yalnız qaralamalar (📄)",
      "aj.search_placeholder": "№, müştəri, məsul şəxs (Ctrl+Q)...",

      // Dövrlər (Period Picker aliases)
      "pp.clear_period": "Dövrü təmizlə",
      "pp.remember": "Seçilmiş dövrü yadda saxla",
      "pp.show_presets": "Standart dövrləri göstər",
      "pp.today": "Bu gün",
      "pp.yesterday": "Dünən",
      "pp.this_week": "Cari həftə",
      "pp.this_month": "Cari ay",
      "pp.this_quarter": "Cari rüb",
      "pp.this_year": "İlin əvvəlindən",
      "pp.all_time": "Bütün dövr (Təmizlə)",
      "pp.btn_select": "Seç",
      "pp.btn_cancel": "İmtina",

      // Əməliyyat növü seçimi modalı (Operation Type Modal)
      "op_type.title": "Əməliyyat növünün seçimi (Qeydiyyatçı)",
      "op_type.search_placeholder": "Əməliyyat növünü axtar...",
      "op_type.col_type": "Əməliyyat növü",
      "op_type.col_doc": "Hərəkət sənədi",
      "op_type.empty": "Heç bir əməliyyat tapılmadı.",
      "op_type.selected_count": "Seçilmiş: {count} əməliyyat növü",

      // Tənzimləmə şablonları (Presets Save/Restore)
      "preset.save_title": "Tənzimləmənin yadda saxlanması",
      "preset.restore_title": "Tənzimləmənin bərpası",
      "preset.all_users": "Bütün istifadəçilərin tənzimləmələri",
      "preset.clean_default": "↺ Standart tənzimləmə (Təmiz)",
      "preset.name_label": "Tənzimləmənin adı:",
      "preset.name_placeholder": "Məsələn: Anbar Qalığı, Loreal Stok və s.",
      "preset.col_open": "Açılışda...",
      "preset.col_save": "Bağlanışda...",

      // Diaqnostika (Diagnostics)
      "diag.title": "Sənəd jurnalı və süzgəc diaqnostikası (Sazlayıcı)",
      "diag.copy": "Hesabatı kopyala",
      "diag.refresh": "Məlumatları yenilə",
      "diag.note": "ℹ️ Bu hesabat axtarışın niyə boş olduğunu və ya xətanın səbəbini ətraflı göstərir.",

      // Giriş və Baza Modalı (Login & Session)
      "login.title": "1C:Enterprise - Giriş və Baza Seçimi",
      "login.base_label": "1C İnformasiya Bazası:",
      "login.delete_base": "🗑️ Sil",
      "login.custom_title": "⚙️ Baza Parametrləri (Manual Daxiletmə):",
      "login.desc_label": "Baza Adı / Təsvir (Seçim siyahısında görünən ad):",
      "login.server_label": "Server (Srvr):",
      "login.ref_label": "Baza (Ref):",
      "login.add_base": "💾 Bazanı Əlavə Et / Yadda Saxla",
      "login.reload_users": "🔄 İstifadəçiləri Yenilə",
      "login.user_label": "İstifadəçi:",
      "login.password_label": "Şifrə:",
      "login.submit": "Giriş et"
    },

    ru: {
      // Menyu barı
      "menu.file": "Файл",
      "menu.file.new_report": "Новый отчет",
      "menu.file.formirovat": "Сформировать",
      "menu.file.export_excel": "Экспорт в Excel (.xlsx)...",
      "menu.file.print": "Печать...",
      "menu.file.exit": "Выход",
      
      "menu.docs": "Документы",
      "menu.docs.realizasiya": "Реализация товаров и услуг",
      "menu.docs.vozvrat": "Возврат товаров от покупателя",
      "menu.docs.pogruzka": "Погрузка машин",
      "menu.docs.prices": "Установка цен номенклатуры",
      "menu.docs.orders": "Заказ покупателя",
      "menu.docs.postuplenie": "Поступление товаров и услуг",
      "menu.docs.inventory": "Инвентаризация товаров на складе",
      "menu.docs.spisanie": "Списание товаров",
      "menu.docs.oprixodovanie": "Оприходование товаров",
      "menu.docs.all_journal": "Журнал документов (Все)...",

      "menu.ops": "Операции",
      "menu.ops.journal": "Журнал документов",
      "menu.ops.audit": "Журнал изменений (Аудит)",
      "menu.ops.catalog_nom": "Справочник.Номенклатура",
      "menu.ops.catalog_warehouses": "Справочник.Склады",
      "menu.ops.catalog_kontragenty": "Справочник.Контрагенты",
      "menu.ops.catalog_agents": "Справочник.Агенты",
      "menu.ops.catalog_prices": "Справочник.Типы цен",

      "menu.reports": "Отчеты",
      "menu.reports.stock": "Товары на складах (Ведомость)",
      "menu.reports.orders_analysis": "Заказы покупателей (Анализ)",
      "menu.reports.portfolio": "Товары по портфелям (Реестр)",
      "menu.reports.settings": "Настройка отчета...",

      "menu.service": "Сервис",
      "menu.service.restore": "Восстановить настройку...",
      "menu.service.save": "Сохранить настройку...",
      "menu.service.defaults": "Стандартные настройки",
      "menu.service.change_user": "Сменить базу / пользователя...",
      "menu.service.diagnostics": "Диагностика отбора (почему пусто?)",

      "menu.windows": "Окна",
      "menu.help": "Справка",
      "menu.help.f1": "Справка (F1)",
      "menu.help.about": "О программе",

      "top.diagnostics": "Диагностика",
      "top.diagnostics_title": "Диагностика отбора и журнала (почему поиск пустой?)",
      
      // Əsas alətlər paneli (Toolbar)
      "toolbar.realizasiya": "Реализация",
      "toolbar.vozvrat": "Возврат",
      "toolbar.pogruzka": "Погрузка",
      "toolbar.prices": "Цены",
      "toolbar.orders": "Заказы",
      "toolbar.postuplenie": "Поступление",
      "toolbar.audit": "Аудит",
      "toolbar.stock": "Остатки",
      "toolbar.bulk_title": "Количество документов за один запрос при End/Home",
      "toolbar.bulk_settings_title": "Настройки End/Home",
      "toolbar.active_db": "Активная база 1С",
      "toolbar.active_user": "Активный пользователь",

      // İş Masası (Dashboard)
      "dash.title": "1С:Предприятие 8.3 — Aztrade",
      "dash.subtitle": "Панель управления (Рабочий стол)",
      "dash.docs_title": "ДОКУМЕНТЫ 1С (ЖУРНАЛЫ)",
      "dash.docs_badge": "9 ВИДОВ ДОКУМЕНТОВ",
      "dash.sub_realizasiya": "Продажи, расходные накладные",
      "dash.sub_vozvrat": "Возвратные накладные, сверка",
      "dash.sub_pogruzka": "Рейсы, экспедиция и доставка",
      "dash.sub_prices": "Прайс-листы, переоценка",
      "dash.sub_orders": "Заказы клиентов, резервирование",
      "dash.sub_postuplenie": "Приход от поставщиков",
      "dash.sub_inventory": "Пересчет и сверка остатков",
      "dash.sub_spisanie": "Недостачи, порча, списание",
      "dash.sub_oprixodovanie": "Излишки, ввод начальных остатков",
      "dash.all_journal": "Единый журнал всех документов",
      "dash.sub_all_journal": "Все документы в одном окне",
      "dash.audit_title": "КОНТРОЛЬ ИЗМЕНЕНИЙ",
      "dash.audit_badge": "АУДИТ",
      "dash.audit_card": "Журнал изменений и версий документов (Аудит)",
      "dash.audit_desc": "Кто изменил документ, сравнение сумм и строк, история проведения",
      "dash.reports_title": "Отчеты (Ведомости)",
      "dash.report_stock": "Товары на складах",
      "dash.report_stock_sub": "Остатки, приход, расход, обороты",
      "dash.report_orders": "Заказы покупателей (Анализ)",
      "dash.report_orders_sub": "Заказы, отгрузка, остаток долга",
      "dash.report_portfolio": "Товары по портфелям",
      "dash.report_portfolio_sub": "Разделение по брендам, сегментам и группам",
      "dash.catalogs_title": "Справочники 1С",
      "dash.cat_nom": "Номенклатура",
      "dash.cat_warehouses": "Склады",
      "dash.cat_kontragenty": "Контрагенты (Аудит)",
      "dash.cat_kontragenty_sub": "Справочник контрагентов и аудит полноты реквизитов",
      "dash.cat_kontragent_card": "Карточка контрагента",
      "dash.cat_agents": "Агенты (Торговые представители)",
      "dash.cat_prices": "Типы цен",
      "dash.cat_users": "Пользователи 1С",
      "dash.status_ready": "Готово",
      "dash.desktop": "Рабочий стол",

      // Общие кнопки и действия
      "common.close": "Закрыть",
      "common.cancel": "Отмена",
      "common.select": "Выбрать",
      "common.clear": "Очистить",
      "common.delete": "Удалить",
      "common.add": "Добавить",
      "common.edit": "Изменить",
      "common.refresh": "Обновить",
      "common.save": "Записать",
      "common.save_and_close": "Записать и закрыть",
      "common.post": "Провести",
      "common.post_and_close": "Провести и закрыть",
      "common.copy": "Скопировать",
      "common.formirovat": "Сформировать",
      "common.settings": "Настройка...",
      "common.apply": "Применить",
      "common.ok": "ОК",
      "common.help": "Справка",
      "common.move_up": "Переместить вверх",
      "common.move_down": "Переместить вниз",
      "common.print": "Печать...",
      "common.export_excel": "Экспорт в Excel (.xlsx)",
      "common.actions": "Действия",
      "common.history": "История",
      "common.search": "Поиск:",
      "common.ready": "Готово",
      "common.all": "Все",
      "common.none": "Не выбрано",
      "common.items_count": "элементов",

      // Universal Sənəd Jurnalı (UJ)
      "uj.doc_label": "Документ:",
      "uj.doc_journal": "Журнал документов",
      "uj.all_period": "(Весь период)",
      "uj.period_title": "Установить интервал дат (Выберите период)",
      "uj.edit_title": "Изменить / Редактировать документ (Двойной клик / Enter)",
      "uj.refresh_title": "Обновить список (F5)",
      "uj.new_window_title": "Открыть еще одно такое окно (➕)",
      "uj.filter_title": "Настройка списка (Отбор и сортировка)...",
      "uj.quick_filter_title": "Отбор по значению в текущей колонке (F7)",
      "uj.remove_col_filter_title": "Снять отбор по текущей колонке",
      "uj.clear_all_filters_title": "Отключить все отборы",
      "uj.restore_preset_title": "Выбрать настройку (Сохраненные фильтры)...",
      "uj.save_preset_title": "Сохранить настройку (Сохранить текущий фильтр)...",
      "uj.btn_columns": "Колонки...",
      "uj.btn_history": "История",
      "uj.search_placeholder": "Найти по всем колонкам...",
      "uj.empty_title": "Документы не найдены",
      "uj.empty_desc": "Измените интервал дат или выберите другой вид документа.",
      "uj.loading": "1C: Запрос данных...",
      "uj.stop_loading": "⏹ Остановить (Pause)",
      "uj.status_ready": "Готово",
      "uj.status_total": "Всего: {count} документов",
      "uj.order_edit": "Заказ изменить",

      // Ctrl+F Поиск по колонке
      "find.title": "Отбор по колонке (Ctrl+F)",
      "find.where": "Где искать:",
      "find.what": "Что искать:",
      "find.how": "Как искать:",
      "find.starts": "По началу строки",
      "find.contains": "По части строки",
      "find.exact": "По точному совпадению",
      "find.apply": "Применить отбор",
      "find.choose_cat": "Выбрать из справочника",
      "find.item_info": "Информация о выбранном элементе",
      "find.clear_filter": "Снять отбор (Ctrl+Q)",

      // Universal Filter Window
      "filter.window_title": "Настройка списка",
      "filter.tab_main": "Основные",
      "filter.tab_filter": "Отбор",
      "filter.tab_sort": "Сортировка",
      "filter.tab_style": "Условное оформление",
      "filter.tab_group": "Группировка",
      "filter.available_fields": "Доступные поля",
      "filter.available_fields_colon": "Доступные поля:",
      "filter.select_field_title": "Добавить выбранное поле в отбор",
      "filter.add_condition": "Добавить новый элемент",
      "filter.add_condition_title": "Добавить новый элемент",
      "filter.group_conditions": "Сгруппировать условия",
      "filter.root_otbor": "Представление: Отбор",
      "filter.clear_all_title": "Очистить все условия",
      "filter.col_field": "Поле",
      "filter.col_comparison": "Вид сравнения",
      "filter.col_value": "Значение",
      "filter.tab_other_hint": "Вкладка доступна через основную таблицу журнала.",
      "filter.return_to_otbor": "Вернуться к отбору",
      "filter.save_settings": "Сохранить настройку...",
      "filter.finish_edit": "Завершить редактирование",
      "filter.add_available_field_title": "Добавить поле в список доступных полей",
      "filter.remove_available_field_title": "Удалить выбранное поле из доступных",
      "filter.add_field_dialog_title": "Выбор поля для отбора",
      "filter.field_search_placeholder": "Быстрый поиск поля...",
      "filter.available_catalog_fields": "Все доступные поля 1С:",
      "filter.reset_default_fields": "Сбросить к стандартным",
      "filter.custom_field_btn": "Произвольное поле...",
      "filter.already_added": "Уже в списке",

      // Выбор поля
      "field_select.title": "Выбор поля",
      "field_select.search_placeholder": "Поиск поля...",

      // Настройка отчета
      "rep_set.title": "Настройка: Товары на складах",
      "rep_set.period_from": "Период с:",
      "rep_set.period_to": "по:",
      "rep_set.parameters": "Параметры",
      "rep_set.negative_red": "Отрицательное красным",
      "rep_set.show_grand_totals": "Выводить общие итоги",
      "rep_set.show_details": "Выводить детальные записи",
      "rep_set.use_properties": "Использовать свойства и категории",
      "rep_set.price_types": "Типы цен:",
      "rep_set.tab_indicators": "Показатели",
      "rep_set.tab_row_groups": "Группировки строк",
      "rep_set.tab_col_groups": "Группировки колонок",
      "rep_set.tab_filter": "Отборы",
      "rep_set.groupings_row": "Группировки строк",
      "rep_set.groupings_col": "Группировки колонок",
      "rep_set.type": "Тип",
      "rep_set.ind_representation": "Представление",
      "rep_set.barcode_unit": "Штрихкод (шт)",
      "rep_set.barcode_box": "Штрихкод (кор)",
      "rep_set.barcode_block": "Штрихкод (упак)",
      "rep_set.base_qty_group": "Количество (в базовых единицах)",
      "rep_set.start_qty": "Начальный остаток",
      "rep_set.in_qty": "Приход",
      "rep_set.out_qty": "Расход",
      "rep_set.end_qty": "Конечный остаток",
      "rep_set.qty_group": "Количество",
      "rep_set.turnover": "Оборот",
      "rep_set.price_cost_group": "Цена и Стоимость",
      "rep_set.price_ind": "Цена (цена за 1 шт)",
      "rep_set.sum_ind": "Сумма (Конечный остаток)",
      "rep_set.advanced": "Расширенная настройка",

      // Табличный документ отчета
      "sheet.empty_title": "Отчет не сформирован",
      "sheet.empty_hint": "Нажмите <b>▶ Сформировать</b> на панели инструментов или откройте окно <b>Настройка...</b> для изменения параметров.",
      "sheet.meta_indicators": "Показатели:",
      "sheet.meta_groupings": "Группировки строк:",
      "sheet.meta_filters": "Отборы:",
      "sheet.meta_extra": "Дополнительные поля:",
      "sheet.meta_sort": "Сортировка:",

      // Контекстное меню
      "cm.cut": "Вырезать",
      "cm.copy": "Копировать",
      "cm.paste": "Вставить",
      "cm.special_paste": "Специальная вставка...",
      "cm.select_all": "Выделить все",
      "cm.merge": "Объединить",
      "cm.split_cell": "Разбить ячейку",
      "cm.delete": "Удалить",
      "cm.clear": "Очистить",
      "cm.insert_comment": "Вставить примечание",
      "cm.group_levels": "Уровни группировок",
      "cm.level_1": "Уровень 1",
      "cm.level_2": "Уровень 2",
      "cm.level_3": "Уровень 3",
      "cm.properties": "Свойства",

      // Список значений
      "vl.title": "Редактирование списка значений",
      "vl.list_title": "Список значений",
      "vl.match_all": "Все одновременно (И)",
      "vl.scope_all": "Все видимые поля",
      "vl.scope_name": "Наименование",
      "vl.scope_artikul": "Артикул",
      "vl.scope_code": "Код",
      "vl.scope_barcode": "Штрихкод",
      "vl.podbor": "Подбор",
      "vl.col_comparison": "Вид сравнения",
      "vl.col_code": "Код",
      "vl.col_artikul": "Артикул",
      "vl.col_barcode": "Штрихкод",
      "vl.col_value": "Значение (Наименование)",

      // Выбор периода
      "pp.title": "Выберите период",
      "pp.clear_link": "Очистить период",
      "pp.month": "Месяц",
      "pp.quarter": "Квартал",
      "pp.year": "Год",
      "pp.presets": "Стандартные периоды",
      "pp.preset_today": "Сегодня",
      "pp.preset_yesterday": "Вчера",
      "pp.preset_this_week": "Текущая неделя",
      "pp.preset_this_month": "Текущий месяц",
      "pp.preset_last_month": "Прошлый месяц",
      "pp.preset_this_quarter": "Текущий квартал",
      "pp.preset_this_year": "Текущий год",
      "pp.preset_last_year": "Прошлый год",

      // Операторы сравнения
      "op.equal": "Равно",
      "op.not_equal": "Не равно",
      "op.in_list": "В группе из списка",
      "op.not_in_list": "Не в группе из списка",
      "op.contains": "Содержит",
      "op.not_contains": "Не содержит",
      "op.starts_with": "Начинается с",
      "op.ends_with": "Заканчивается на",
      "op.less": "Меньше",
      "op.greater": "Больше",
      "op.less_or_equal": "Меньше или равно",
      "op.greater_or_equal": "Больше или равно",
      "op.interval": "Интервал",
      "op.filled": "Заполнено",
      "op.not_filled": "Не заполнено",

      // Заголовки колонок
      "col.date": "Дата",
      "col.number": "Номер",
      "col.doc_no": "Документ №",
      "col.kontragent": "Контрагент",
      "col.client": "Клиент",
      "col.parent_kontragent": "Головной контрагент",
      "col.agent": "Агент",
      "col.kontragent_code": "Код контрагента",
      "col.portfolio": "Портфель",
      "col.sum": "Сумма",
      "col.sum_azn": "Сумма (AZN)",
      "col.warehouse": "Склад",
      "col.order_no": "Номер заказа",
      "col.processing_no": "Номер обработки",
      "col.vms_status": "Статус ВМС",
      "col.contract": "Договор",
      "col.price_type": "Тип цен",
      "col.route": "Маршрут погрузки",
      "col.driver": "Водитель погрузки",
      "col.responsible": "Ответственный",
      "col.comment": "Комментарий",
      "col.author": "Автор",
      "col.editor": "Кто изменил",
      "col.last_op": "Последняя операция",
      "col.versions": "Версии",
      "col.open_audit": "Открыть аудит",
      "col.code": "Код",
      "col.artikul": "Артикул",
      "col.barcode": "Штрихкод",
      "col.name": "Наименование",
      "col.unit": "Ед. изм.",
      "col.qty": "Количество",
      "col.price": "Цена",
      "col.start_balance": "Начальный остаток",
      "col.in_qty": "Приход",
      "col.out_qty": "Расход",
      "col.end_balance": "Конечный остаток",
      "col.turnover": "Оборот",
      "col.total": "Всего",
      "col.grand_total": "Итого",
      "col.line_no": "№",
      "col.status": "Статус",
      "col.doc_number": "Документ №",
      "col.last_author": "Кто изменил",
      "col.amount": "Сумма (AZN)",
      "col.audit_open": "Открыть аудит",
      "col.nom_type": "Вид ном.",
      "table.menu_export": "Экспорт",
      "common.all_doc_types": "Все (Все виды документов)",

      // Каталог товаров / справочник
      "cat.select_folder": "📁 Выбрать папку",
      "cat.hierarchical_view": "Иерархический просмотр (Дерево папок)",
      "cat.search_placeholder": "Найти по всем колонкам (Ctrl+Q)...",
      "cat.stock_title": "Остатки товаров на складах",
      "cat.price_types": "Типы цен:",
      "cat.col_wh_char": "Характеристика / Склад",
      "cat.col_total_stock": "Общий остаток",
      "cat.col_free_stock": "Свободный",
      "cat.col_reserve": "В резерве",
      "cat.active_element_prefix": "Активный элемент:",
      "cat.podbor_banner": "📌 <b>Режим подбора:</b> Дважды щелкните по элементу или папке (или нажмите [Выбрать]). Он добавится в список.",

      // Журнал контрагентов
      "kj.title": "Контрагенты (Справочник и аудит полноты реквизитов)",
      "kj.btn_filter_title": "Настройка списка (Отбор и сортировка)...",
      "kj.btn_quick_filter_title": "Отбор по значению в текущей колонке (F7)",
      "kj.btn_remove_col_filter_title": "Снять отбор по текущей колонке (Shift+F7)",
      "kj.btn_clear_filter_title": "Отключить все отборы",
      "kj.btn_columns_title": "Настройка списка (колонки, видимость, порядок, ширина)...",
      "kj.btn_columns": "Колонки...",
      "kj.search_placeholder": "Поиск по названию, коду, VÖEN...",
      "kj.active_filters": "Активные отборы:",
      "kj.chip_all": "🔘 Все контрагенты",
      "kj.chip_no_inn": "⚠️ Без ИНН",
      "kj.chip_has_inn": "✔ С ИНН",
      "kj.chip_no_contract": "⚠️ Без договора",
      "kj.chip_no_bank": "⚠️ Без банк. счета",
      "kj.loading": "Загрузка данных контрагентов...",
      "kj.footer_showing": "Отображено:",
      "kj.footer_from": "из",
      "kj.footer_hint": "Двойной клик или F2 открывает карточку контрагента",
      "kj.prev": "◀ Назад",
      "kj.next": "Вперед ▶",

      // Журнал аудита
      "aj.title": "Журнал изменений документов и аудит (История, пользователи и различия)",
      "aj.doc_type": "Вид документа:",
      "aj.change_date": "Дата изменения",
      "aj.7_days": "7 дней",
      "aj.filter": "Фильтр:",
      "aj.all_docs": "Все документы",
      "aj.modified_only": "Только измененные (>1 версии)",
      "aj.posted_only": "Только проведенные (✔ Проводка)",
      "aj.draft_only": "Только черновики (📄)",
      "aj.search_placeholder": "№, клиент, ответственный (Ctrl+Q)...",

      // Период
      "pp.clear_period": "Очистить период",
      "pp.remember": "Запомнить выбранный период",
      "pp.show_presets": "Показать стандартные периоды",
      "pp.today": "Сегодня",
      "pp.yesterday": "Вчера",
      "pp.this_week": "Текущая неделя",
      "pp.this_month": "Текущий месяц",
      "pp.this_quarter": "Текущий квартал",
      "pp.this_year": "С начала года",
      "pp.all_time": "Весь период (Очистить)",
      "pp.btn_select": "Выбрать",
      "pp.btn_cancel": "Отмена",

      // Модальное окно выбора вида операции (Operation Type Modal)
      "op_type.title": "Выбор вида операции (Регистратор)",
      "op_type.search_placeholder": "Поиск вида операции...",
      "op_type.col_type": "Вид операции",
      "op_type.col_doc": "Документ движения",
      "op_type.empty": "Ничего не найдено.",
      "op_type.selected_count": "Выбрано: {count} видов операций",

      // Шаблоны настроек (Presets Save/Restore)
      "preset.save_title": "Сохранение настройки",
      "preset.restore_title": "Восстановление настройки",
      "preset.all_users": "Настройки всех пользователей",
      "preset.clean_default": "↺ Стандартная настройка (Чистая)",
      "preset.name_label": "Имя настройки:",
      "preset.name_placeholder": "Например: Остатки склада, Лореаль и т.д.",
      "preset.col_open": "Открыв...",
      "preset.col_save": "Сохран...",

      // Диагностика (Diagnostics)
      "diag.title": "Диагностика отбора и журнала документов (Отладчик)",
      "diag.copy": "Скопировать отчет",
      "diag.refresh": "Обновить данные",
      "diag.note": "ℹ️ Этот отчет детально показывает, почему поиск пустой или возникла ошибка.",

      // Модальное окно входа и выбора базы (Login & Session)
      "login.title": "1C:Предприятие - Вход и выбор базы",
      "login.base_label": "Информационная база 1С:",
      "login.delete_base": "🗑️ Удалить",
      "login.custom_title": "⚙️ Параметры базы (ручной ввод):",
      "login.desc_label": "Наименование базы / описание:",
      "login.server_label": "Сервер (Srvr):",
      "login.ref_label": "База (Ref):",
      "login.add_base": "💾 Добавить / сохранить базу",
      "login.reload_users": "🔄 Обновить пользователей",
      "login.user_label": "Пользователь:",
      "login.password_label": "Пароль:",
      "login.submit": "Войти"
    }
  };

  /**
   * Master phrase dictionary for automatic bidirectional translation
   * of DOM text nodes, button captions, table headers, titles, and placeholders.
   */
  const phraseMap = {
    // Standard 1C Buttons & Actions
    "закрыть": { az: "Bağla", ru: "Закрыть" },
    "bağla": { az: "Bağla", ru: "Закрыть" },
    "отмена": { az: "İmtina", ru: "Отмена" },
    "imtina": { az: "İmtina", ru: "Отмена" },
    "выбрать": { az: "Seç", ru: "Выбрать" },
    "seç": { az: "Seç", ru: "Выбрать" },
    "выбрать (f4)": { az: "Seç (F4)", ru: "Выбрать (F4)" },
    "очистить": { az: "Təmizlə", ru: "Очистить" },
    "təmizlə": { az: "Təmizlə", ru: "Очистить" },
    "удалить": { az: "Sil", ru: "Удалить" },
    "sil": { az: "Sil", ru: "Удалить" },
    "добавить": { az: "Əlavə et", ru: "Добавить" },
    "əlavə et": { az: "Əlavə et", ru: "Добавить" },
    "изменить": { az: "Dəyiş", ru: "Изменить" },
    "dəyiş": { az: "Dəyiş", ru: "Изменить" },
    "обновить": { az: "Yenilə", ru: "Обновить" },
    "yenilə": { az: "Yenilə", ru: "Обновить" },
    "обновить (f5)": { az: "Yenilə (F5)", ru: "Обновить (F5)" },
    "обновить список (f5)": { az: "Siyahını yenilə (F5)", ru: "Обновить список (F5)" },
    "записать": { az: "Yadda saxla", ru: "Записать" },
    "записать (ctrl+s)": { az: "Yadda saxla (Ctrl+S)", ru: "Записать (Ctrl+S)" },
    "записать и закрыть": { az: "Yadda saxla və bağla", ru: "Записать и закрыть" },
    "провести": { az: "Keçir", ru: "Провести" },
    "провести и закрыть": { az: "Keçir və bağla", ru: "Провести и закрыть" },
    "скопировать": { az: "Kopyala", ru: "Скопировать" },
    "скопировать (f9)": { az: "Kopyala (F9)", ru: "Скопировать (F9)" },
    "сформировать": { az: "Formalaşdır", ru: "Сформировать" },
    "formalaşdır": { az: "Formalaşdır", ru: "Сформировать" },
    "сформировать отчет (ctrl+enter)": { az: "Hesabatı formalaşdır (Ctrl+Enter)", ru: "Сформировать отчет (Ctrl+Enter)" },
    "настройка...": { az: "Tənzimləmə...", ru: "Настройка..." },
    "tənzimləmə...": { az: "Tənzimləmə...", ru: "Настройка..." },
    "применить": { az: "Tətbiq et", ru: "Применить" },
    "tətbiq et": { az: "Tətbiq et", ru: "Применить" },
    "ок": { az: "OK", ru: "ОК" },
    "ok": { az: "OK", ru: "ОК" },
    "справка": { az: "Kömək", ru: "Справка" },
    "справка (f1)": { az: "Kömək (F1)", ru: "Справка (F1)" },
    "kömək": { az: "Kömək", ru: "Справка" },
    "переместить вверх": { az: "Yuxarı daşı", ru: "Переместить вверх" },
    "переместить вниз": { az: "Aşağı daşı", ru: "Переместить вниз" },
    "yuxarı daşı": { az: "Yuxarı daşı", ru: "Переместить вверх" },
    "aşağı daşı": { az: "Aşağı daşı", ru: "Переместить вниз" },
    "печать...": { az: "Çap et...", ru: "Печать..." },
    "çap et...": { az: "Çap et...", ru: "Печать..." },
    "действия": { az: "Əməliyyatlar", ru: "Действия" },
    "действия ▾": { az: "Əməliyyatlar ▾", ru: "Действия ▾" },
    "əməliyyatlar": { az: "Əməliyyatlar", ru: "Действия" },
    "əməliyyatlar ▾": { az: "Əməliyyatlar ▾", ru: "Действия ▾" },
    "история": { az: "Tarixçə", ru: "История" },
    "tarixçə": { az: "Tarixçə", ru: "История" },
    "подбор": { az: "Seçim (Podbor)", ru: "Подбор" },
    "seçim (podbor)": { az: "Seçim (Podbor)", ru: "Подбор" },
    "готово": { az: "Hazırdır", ru: "Готово" },
    "hazırdır": { az: "Hazırdır", ru: "Готово" },
    "рабочий стол": { az: "İş masası", ru: "Рабочий стол" },
    "iş masası": { az: "İş masası", ru: "Рабочий стол" },
    "открыть журнал": { az: "Jurnalı aç", ru: "Открыть журнал" },
    "открыть отчет": { az: "Hesabatı aç", ru: "Открыть отчет" },
    "сохранить настройку...": { az: "Tənzimləməni saxla...", ru: "Сохранить настройку..." },
    "восстановить настройку...": { az: "Tənzimləməni bərpa et...", ru: "Восстановить настройку..." },
    "восстановление настройки...": { az: "Tənzimləməni bərpa et...", ru: "Восстановление настройки..." },
    "восстановить стандартные настройки": { az: "Standart tənzimləmələri bərpa et", ru: "Восстановить стандартные настройки" },

    // Comparison Operators
    "равно": { az: "Bərabərdir", ru: "Равно" },
    "bərabərdir": { az: "Bərabərdir", ru: "Равно" },
    "не равно": { az: "Bərabər deyil", ru: "Не равно" },
    "bərabər deyil": { az: "Bərabər deyil", ru: "Не равно" },
    "в группе из списка": { az: "Siyahıdan qrupda", ru: "В группе из списка" },
    "siyahıdan qrupda": { az: "Siyahıdan qrupda", ru: "В группе из списка" },
    "не в группе из списка": { az: "Siyahıdakı qrupda deyil", ru: "Не в группе из списка" },
    "содержит": { az: "Tərkibində var", ru: "Содержит" },
    "tərkibində var": { az: "Tərkibində var", ru: "Содержит" },
    "не содержит": { az: "Tərkibində yoxdur", ru: "Не содержит" },
    "меньше": { az: "Kiçikdir", ru: "Меньше" },
    "kiçikdir": { az: "Kiçikdir", ru: "Меньше" },
    "больше": { az: "Böyükdür", ru: "Больше" },
    "böyükdür": { az: "Böyükdür", ru: "Больше" },
    "меньше или равно": { az: "Kiçik və ya bərabər", ru: "Меньше или равно" },
    "больше или равно": { az: "Böyük və ya bərabər", ru: "Больше или равно" },
    "заполнено": { az: "Doldurulub", ru: "Заполнено" },
    "не заполнено": { az: "Doldurulmayıb", ru: "Не заполнено" },
    "вид сравнения": { az: "Müqayisə növü", ru: "Вид сравнения" },
    "müqayisə növü": { az: "Müqayisə növü", ru: "Вид сравнения" },

    // Core Fields & Columns
    "дата": { az: "Tarix", ru: "Дата" },
    "tarix": { az: "Tarix", ru: "Дата" },
    "дата документа": { az: "Sənəd Tarixi", ru: "Дата документа" },
    "sənəd tarixi": { az: "Sənəd Tarixi", ru: "Дата документа" },
    "номер": { az: "Nömrə", ru: "Номер" },
    "nömrə": { az: "Nömrə", ru: "Номер" },
    "номер:": { az: "Nömrə:", ru: "Номер:" },
    "nömrə:": { az: "Nömrə:", ru: "Номер:" },
    "sənəd №": { az: "Sənəd №", ru: "Документ №" },
    "sənəd № ▾": { az: "Sənəd № ▾", ru: "Документ № ▾" },
    "документ №": { az: "Sənəd №", ru: "Документ №" },
    "контрагент": { az: "Kontragent", ru: "Контрагент" },
    "kontragent": { az: "Kontragent", ru: "Контрагент" },
    "клиент": { az: "Müştəri", ru: "Клиент" },
    "müştəri": { az: "Müştəri", ru: "Клиент" },
    "клиент / контрагент": { az: "Müştəri / Tərəf-müqabili", ru: "Клиент / Контрагент" },
    "müştəri / tərəf-müqabili": { az: "Müştəri / Tərəf-müqabili", ru: "Клиент / Контрагент" },
    "головной контрагент": { az: "Baş kontragent", ru: "Головной контрагент" },
    "baş kontragent": { az: "Baş kontragent", ru: "Головной контрагент" },
    "код контрагента": { az: "Kontragent kodu", ru: "Код контрагента" },
    "договор": { az: "Müqavilə", ru: "Договор" },
    "müqavilə": { az: "Müqavilə", ru: "Договор" },
    "договор контрагента": { az: "Müqavilə", ru: "Договор контрагента" },
    "основной договор": { az: "Əsas müqavilə", ru: "Основной договор" },
    "əsas müqavilə": { az: "Əsas müqavilə", ru: "Основной договор" },
    "склад": { az: "Anbar", ru: "Склад" },
    "anbar": { az: "Anbar", ru: "Склад" },
    "склады": { az: "Anbarlar", ru: "Склады" },
    "номенклатура": { az: "Nomenklatura", ru: "Номенклатура" },
    "nomenklatura": { az: "Nomenklatura", ru: "Номенклатура" },
    "код": { az: "Kod", ru: "Код" },
    "kod": { az: "Kod", ru: "Код" },
    "код:": { az: "Kod:", ru: "Код:" },
    "наименование": { az: "Adı", ru: "Наименование" },
    "наименование:": { az: "Adı:", ru: "Наименование:" },
    "adı": { az: "Adı", ru: "Наименование" },
    "артикул": { az: "Artikul", ru: "Артикул" },
    "artikul": { az: "Artikul", ru: "Артикул" },
    "штрихкод": { az: "Ştrixkod", ru: "Штрихкод" },
    "ştrixkod": { az: "Ştrixkod", ru: "Штрихкод" },
    "штрихкод (шт)": { az: "Ştrixkod (əd)", ru: "Штрихкод (шт)" },
    "штрихкод (кор)": { az: "Ştrixkod (qutu)", ru: "Штрихкод (кор)" },
    "штрихкод (упак)": { az: "Ştrixkod (blok)", ru: "Штрихкод (упак)" },
    "штрихкод (ədəd / шт)": { az: "Ştrixkod (ədəd)", ru: "Штрихкод (шт)" },
    "штрихкод (qutu / кор)": { az: "Ştrixkod (qutu)", ru: "Штрихкод (кор)" },
    "штрихкод (blok / упак)": { az: "Ştrixkod (blok)", ru: "Штрихкод (упак)" },
    "сумма": { az: "Məbləğ", ru: "Сумма" },
    "məbləğ": { az: "Məbləğ", ru: "Сумма" },
    "сумма (azn)": { az: "Məbləğ (AZN)", ru: "Сумма (AZN)" },
    "məbləğ (azn)": { az: "Məbləğ (AZN)", ru: "Сумма (AZN)" },
    "цена": { az: "Qiymət", ru: "Цена" },
    "qiymət": { az: "Qiymət", ru: "Цена" },
    "количество": { az: "Miqdar", ru: "Количество" },
    "miqdar": { az: "Miqdar", ru: "Количество" },
    "ед.": { az: "Öl. vah.", ru: "Ед." },
    "ед. изм.": { az: "Öl. vah.", ru: "Ед. изм." },
    "единица измерения": { az: "Ölçü vahidi", ru: "Единица измерения" },
    "начальный остаток": { az: "İlkin qalıq", ru: "Начальный остаток" },
    "ilkin qalıq": { az: "İlkin qalıq", ru: "Начальный остаток" },
    "приход": { az: "Mədaxil", ru: "Приход" },
    "mədaxil": { az: "Mədaxil", ru: "Приход" },
    "расход": { az: "Məxaric", ru: "Расход" },
    "məxaric": { az: "Məxaric", ru: "Расход" },
    "конечный остаток": { az: "Son qalıq", ru: "Конечный остаток" },
    "son qalıq": { az: "Son qalıq", ru: "Конечный остаток" },
    "оборот": { az: "Dövriyyə", ru: "Оборот" },
    "dövriyyə": { az: "Dövriyyə", ru: "Оборот" },
    "итого": { az: "Yekun", ru: "Итого" },
    "всего": { az: "Cəmi", ru: "Всего" },
    "cəmi": { az: "Cəmi", ru: "Всего" },
    "агент": { az: "Agent", ru: "Агент" },
    "портфель": { az: "Portfel", ru: "Портфель" },
    "ответственный": { az: "Məsul şəxs", ru: "Ответственный" },
    "комментарий": { az: "Qeyd", ru: "Комментарий" },
    "комментарий:": { az: "Qeyd:", ru: "Комментарий:" },
    "автор": { az: "Müəllif", ru: "Автор" },
    "кто изменил": { az: "Kim dəyişib", ru: "Кто изменил" },
    "последняя операция": { az: "Son Əməliyyat", ru: "Последняя операция" },
    "версии": { az: "Versiyalar", ru: "Версии" },
    "тип цен": { az: "Qiymət növü", ru: "Тип цен" },
    "тип цен:": { az: "Qiymət növü:", ru: "Тип цен:" },
    "типы цен:": { az: "Qiymət növləri:", ru: "Типы цен:" },
    "пагрузка маршрут": { az: "Yükləmə marşrutu", ru: "Маршрут погрузки" },
    "погрузка маршрут": { az: "Yükləmə marşrutu", ru: "Маршрут погрузки" },
    "пагрузка водитель": { az: "Sürücü", ru: "Водитель погрузки" },
    "погрузка водитель": { az: "Sürücü", ru: "Водитель погрузки" },
    "номер заказа": { az: "Sifariş nömrəsi", ru: "Номер заказа" },
    "номер обработки": { az: "Emal nömrəsi", ru: "Номер обработки" },
    "статус вмс": { az: "VMS statusu", ru: "Статус ВМС" },
    "инн": { az: "VÖEN", ru: "ИНН" },
    "vöen": { az: "VÖEN", ru: "ИНН" },
    "инн / vöen": { az: "VÖEN / İNN", ru: "ИНН / VÖEN" },
    "полнота": { az: "Doluluq", ru: "Полнота" },
    "группа доступа": { az: "Giriş qrupu", ru: "Группа доступа" },
    "регион": { az: "Region", ru: "Регион" },
    "группа/папка": { az: "Qovluq / Qrup", ru: "Группа / Папка" },
    "адрес доставки": { az: "Çatdırılma ünvanı", ru: "Адрес доставки" },
    "телефон": { az: "Telefon", ru: "Телефон" },
    "качество": { az: "Keyfiyyət", ru: "Качество" },
    "вид операции": { az: "Əməliyyat növü", ru: "Вид операции" },
    "документ движения (регистратор)": { az: "Hərəkət sənədi (qeydiyyatçı)", ru: "Документ движения (регистратор)" },

    // Dialog & Modal Settings
    "период с:": { az: "Dövr:", ru: "Период с:" },
    "по:": { az: "—", ru: "по:" },
    "параметры": { az: "Parametrlər", ru: "Параметры" },
    "отрицательное красным": { az: "Mənfilər qırmızı ilə", ru: "Отрицательное красным" },
    "выводить общие итоги": { az: "Ümumi yekunları çıxar", ru: "Выводить общие итоги" },
    "выводить детальные записи": { az: "Ətraflı qeydləri çıxar", ru: "Выводить детальные записи" },
    "использовать свойства и категории": { az: "Xüsusiyyət və kateqoriyalardan istifadə et", ru: "Использовать свойства и категории" },
    "показатели": { az: "Göstəricilər", ru: "Показатели" },
    "группировки строк": { az: "Sətir qruplaşdırmaları", ru: "Группировки строк" },
    "группировки колонок": { az: "Sütun qruplaşdırmaları", ru: "Группировки колонок" },
    "отборы": { az: "Süzgəclər", ru: "Отборы" },
    "отбор": { az: "Süzgəc", ru: "Отбор" },
    "сортировка": { az: "Çeşidləmə", ru: "Сортировка" },
    "дополнительные поля": { az: "Əlavə sahələr", ru: "Дополнительные поля" },
    "условное оформление": { az: "Şərti tərtibat", ru: "Условное оформление" },
    "группировка": { az: "Qruplaşdırma", ru: "Группировка" },
    "основные": { az: "Əsaslar", ru: "Основные" },
    "доступные поля": { az: "Mövcud sahələr", ru: "Доступные поля" },
    "доступные поля:": { az: "Mövcud sahələr:", ru: "Доступные поля:" },
    "представление": { az: "Təqdimat", ru: "Представление" },
    "поле": { az: "Sahə", ru: "Поле" },
    "значение": { az: "Dəyər", ru: "Значение" },
    "тип": { az: "Növ", ru: "Тип" },
    "элементы": { az: "Elementlər", ru: "Элементы" },
    "иерархия": { az: "İerarxiya", ru: "Иерархия" },
    "без групп": { az: "Qrupsuz", ru: "Без групп" },
    "выбор поля": { az: "Sahə seçimi", ru: "Выбор поля" },
    "список значений": { az: "Dəyərlər siyahısı", ru: "Список значений" },
    "редактирование списка значений": { az: "Dəyərlər siyahısının redaktəsi", ru: "Редактирование списка значений" },
    "все одновременно (и)": { az: "Hamısı eyni vaxtda (VƏ)", ru: "Все одновременно (И)" },
    "все видимые поля": { az: "Bütün görünən sahələr", ru: "Все видимые поля" },
    "колонки...": { az: "Sütunlar...", ru: "Колонки..." },
    "настройка формы": { az: "Formanın tənzimlənməsi", ru: "Настройка формы" },
    "настройка списка": { az: "Siyahının tənzimlənməsi", ru: "Настройка списка" },
    "завершить редактирование": { az: "Redaktəni tamamla", ru: "Завершить редактирование" },
    "вернуться к отбору": { az: "Süzgəcə qayıt", ru: "Вернуться к отбору" },
    "добавить новый элемент": { az: "Yeni element əlavə et", ru: "Добавить новый элемент" },
    "сгруппировать условия": { az: "Şərtləri qruplaşdır", ru: "Сгруппировать условия" },
    "выбрать поле...": { az: "Sahə seç...", ru: "Выбрать поле..." },
    "добавить группировку": { az: "Qruplaşdırma əlavə et", ru: "Добавить группировку" },
    "в группировки строк": { az: "Sətir qruplaşdırmalarına", ru: "В группировки строк" },
    "в группировки колонок": { az: "Sütun qruplaşdırmalarına", ru: "В группировки колонок" },
    "расширенная настройка": { az: "Genişlənmiş tənzimləmə", ru: "Расширенная настройка" },
    "уровни группировок": { az: "Qruplaşdırma səviyyələri", ru: "Уровни группировок" },
    "уровень 1": { az: "Səviyyə 1", ru: "Уровень 1" },
    "уровень 2": { az: "Səviyyə 2", ru: "Уровень 2" },
    "уровень 3": { az: "Səviyyə 3", ru: "Уровень 3" },
    "свойства": { az: "Xüsusiyyətlər", ru: "Свойства" },
    "вырезать": { az: "Kəs", ru: "Вырезать" },
    "вставить": { az: "Yapışdır", ru: "Вставить" },
    "специальная вставка...": { az: "Xüsusi yapışdırma...", ru: "Специальная вставка..." },
    "выделить все": { az: "Hamısını seç", ru: "Выделить все" },
    "объединить": { az: "Birləşdir", ru: "Объединить" },
    "разбить ячейку": { az: "Xananı böl", ru: "Разбить ячейку" },
    "вставить примечание": { az: "Qeyd əlavə et", ru: "Вставить примечание" },

    // 1C Document Types
    "реализация товаров и услуг": { az: "Malların və xidmətlərin satışı", ru: "Реализация товаров и услуг" },
    "возврат товаров от покупателя": { az: "Alıcıdan malların qaytarılması", ru: "Возврат товаров от покупателя" },
    "погрузка машин": { az: "Maşınların yüklənməsi", ru: "Погрузка машин" },
    "погрузки машин": { az: "Maşınların yüklənməsi", ru: "Погрузка машин" },
    "установка цен номенклатуры": { az: "Nomenklatura qiymətlərinin təyini", ru: "Установка цен номенклатуры" },
    "поступление товаров и услуг": { az: "Malların və xidmətlərin daxil olması", ru: "Поступление товаров и услуг" },
    "заказ покупателя": { az: "Alıcı sifarişi", ru: "Заказ покупателя" },
    "заказы покупателей (анализ)": { az: "Alıcı sifarişləri (Analiz)", ru: "Заказы покупателей (Анализ)" },
    "инвентаризация товаров на складе": { az: "Anbarda malların inventarizasiyası", ru: "Инвентаризация товаров на складе" },
    "списание товаров": { az: "Malların silinməsi", ru: "Списание товаров" },
    "оприходование товаров": { az: "Malların mədaxili", ru: "Оприходование товаров" },
    "товары на складах": { az: "Anbarlardakı mallar", ru: "Товары на складах" },
    "товары на складах (ведомость)": { az: "Anbarlardakı mallar (Cədvəl)", ru: "Товары на складах (Ведомость)" },
    "товары по портфелям": { az: "Portfellər üzrə mallar", ru: "Товары по портфелям" },
    "журнал изменений (аудит)": { az: "Dəyişikliklər jurnalı (Audit)", ru: "Журнал изменений (Аудит)" },
    "справочник: номенклатура": { az: "Soraqça: Nomenklatura", ru: "Справочник: Номенклатура" },
    "справочник: контрагенты": { az: "Soraqça: Kontragentlər", ru: "Справочник: Контрагенты" },
    "справочник: склады": { az: "Soraqça: Anbarlar", ru: "Справочник: Склады" },
    "справочник: типы цен номенклатуры": { az: "Soraqça: Nomenklatura qiymət növləri", ru: "Справочник: Типы цен номенклатуры" },
    "справочник: договоры контрагентов": { az: "Soraqça: Kontragent müqavilələri", ru: "Справочник: Договоры контрагентов" },
    "справочник: пользователи": { az: "Soraqça: İstifadəçilər", ru: "Справочник: Пользователи" },
    "справочник: водители": { az: "Soraqça: Sürücülər", ru: "Справочник: Водители" },
    "справочник: портфели": { az: "Soraqça: Portfellər", ru: "Справочник: Портфели" },
    "справочник: агенты": { az: "Soraqça: Agentlər", ru: "Справочник: Агенты" },
    "номенклатурная группа": { az: "Nomenklatura qrupu", ru: "Номенклатурная группа" },
    "портфель (номенклатурная группа)": { az: "Portfel (Nomenklatura qrupu)", ru: "Портфель (Номенклатурная группа)" },
    "вид ном.": { az: "Nom. növü", ru: "Вид ном." },
    "вид номенклатуры": { az: "Nomenklatura növü", ru: "Вид номенклатуры" },
    "договор контрагента": { az: "Kontragent müqaviləsi", ru: "Договор контрагента" },
    "заказ покупателя": { az: "Alıcı sifarişi", ru: "Заказ покупателя" },
    "характеристика / склад": { az: "Xüsusiyyət / Anbar", ru: "Характеристика / Склад" },
    "общий остаток": { az: "Ümumi qalıq", ru: "Общий остаток" },
    "свободный": { az: "Sərbəst qalıq", ru: "Свободный" },
    "в резерве": { az: "Rezervdə", ru: "В резерве" },
    "остатки товаров на складах": { az: "Anbarlarda malların qalıqları", ru: "Остатки товаров на складах" },
    "выбрать папку": { az: "Qovluğu seç", ru: "Выбрать папку" },
    "📁 выбрать папку": { az: "📁 Qovluğu seç", ru: "📁 Выбрать папку" },
    "иерархический просмотр (дерево папок)": { az: "İyerarxik baxış (Qovluq ağacı)", ru: "Иерархический просмотр (Дерево папок)" },
    "🔑 изменить пароль": { az: "🔑 Şifrəni dəyiş", ru: "🔑 Изменить пароль" },
    "seçilmiş mal: -": { az: "Seçilmiş mal: -", ru: "Выбранный товар: -" },
    "aktiv element:": { az: "Aktiv Element:", ru: "Активный элемент:" },
    "активный элемент:": { az: "Aktiv Element:", ru: "Активный элемент:" },
    "mal seçildikdə qiymətlər əks olunacaq": { az: "Mal seçildikdə qiymətlər əks olunacaq", ru: "При выборе товара отобразятся цены" },
    "qalıqları görmək üçün siyahıdan bir mal seçin": { az: "Qalıqları görmək üçün siyahıdan bir mal seçin", ru: "Для просмотра остатков выберите товар из списка" },
    "məlumatlar yüklənir...": { az: "Məlumatlar yüklənir...", ru: "Загрузка данных..." },
    "sənədlər siyahısı": { az: "Sənədlər Siyahısı", ru: "Список документов" },
    "список документов": { az: "Sənədlər Siyahısı", ru: "Список документов" },
    "sənəd dəyişiklikləri və audit jurnalı": { az: "Sənəd Dəyişiklikləri və Audit Jurnalı", ru: "Журнал изменений документов и аудит" },
    "şərtləri seçin və сформировать basın": { az: "Şərtləri seçin və Formalaşdır basın", ru: "Выберите условия и нажмите Сформировать" },
    "элементы формы (список колонок)": { az: "Forma elementləri (Sütunlar siyahısı)", ru: "Элементы формы (Список колонок)" },
    "свойства элемента:": { az: "Elementin xüsusiyyətləri:", ru: "Свойства элемента:" },
    "положение": { az: "Mövqe", ru: "Положение" },
    "видимость": { az: "Görünüş", ru: "Видимость" },
    "ширина": { az: "En", ru: "Ширина" },
    "авто": { az: "Avto", ru: "Авто" },
    "вверх": { az: "Yuxarı", ru: "Вверх" },
    "вниз": { az: "Aşağı", ru: "Вниз" },
    "стандартные": { az: "Standart", ru: "Стандартные" },
    "снять": { az: "Çıxar", ru: "Снять" },
    "показать все колонки": { az: "Bütün sütunları göstər", ru: "Показать все колонки" },
    "снять все отметки": { az: "Bütün işarələri çıxar", ru: "Снять все отметки" },
    "переместить вверх (⇧)": { az: "Yuxarı daşı (⇧)", ru: "Переместить вверх (⇧)" },
    "переместить вниз (⇩)": { az: "Aşağı daşı (⇩)", ru: "Переместить вниз (⇩)" }
  };

  function normStr(s) {
    return String(s || '')
      .replace(/İ/g, 'i')
      .replace(/I/g, 'i')
      .replace(/ı/g, 'i')
      .toLowerCase()
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const C1I18n = {
    currentLang: DEFAULT_LANG,

    init: function() {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved && (saved === 'az' || saved === 'ru')) {
          this.currentLang = saved;
        } else {
          this.currentLang = DEFAULT_LANG;
        }
      } catch (e) {
        this.currentLang = DEFAULT_LANG;
      }

      this.updateHtmlLangAttr();
      this.updateSwitcherUI();
      
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.applyTranslations());
      } else {
        this.applyTranslations();
      }
    },

    getLanguage: function() {
      return this.currentLang;
    },

    setLanguage: function(lang) {
      if (lang !== 'az' && lang !== 'ru') return;
      this.currentLang = lang;
      try {
        localStorage.setItem(STORAGE_KEY, lang);
      } catch (e) {
        console.warn('[C1I18n] Failed to save language preference:', e);
      }

      this.updateHtmlLangAttr();
      this.updateSwitcherUI();
      this.applyTranslations();

      // Broadcast change event for reactive components (tables, journals, modals, window titles)
      window.dispatchEvent(new CustomEvent('c1-language-changed', {
        detail: { lang: this.currentLang }
      }));
    },

    toggleLanguage: function() {
      this.setLanguage(this.currentLang === 'az' ? 'ru' : 'az');
    },

    t: function(key, fallback) {
      if (!key) return fallback || '';
      const langDict = translations[this.currentLang] || translations[DEFAULT_LANG];
      if (langDict && langDict[key] !== undefined) {
        return langDict[key];
      }
      if (translations.ru && translations.ru[key] !== undefined) {
        return translations.ru[key];
      }
      return fallback !== undefined ? fallback : key;
    },

    translateDocType: function(docType) {
      if (!docType) return '';
      const dtMap = {
        'РеализацияТоваровУслуг': 'menu.docs.realizasiya',
        'ВозвратТоваровОтПокупателя': 'menu.docs.vozvrat',
        'ПогрузкиМашин': 'menu.docs.pogruzka',
        'ПогрузкаМашин': 'menu.docs.pogruzka',
        'УстановкаЦенНоменклатуры': 'menu.docs.prices',
        'ПоступлениеТоваровУслуг': 'menu.docs.postuplenie',
        'ЗаказПокупателя': 'menu.docs.orders',
        'ИнвентаризацияТоваровНаСкладе': 'menu.docs.inventory',
        'СписаниеТоваров': 'menu.docs.spisanie',
        'ОприходованиеТоваров': 'menu.docs.oprixodovanie'
      };
      if (dtMap[docType]) {
        return this.t(dtMap[docType]);
      }
      return this.translatePhrase(docType);
    },

    translateOperator: function(op) {
      if (!op) return '';
      const opMap = {
        'Равно': 'op.equal',
        'Не равно': 'op.not_equal',
        'В группе из списка': 'op.in_list',
        'Не в группе из списка': 'op.not_in_list',
        'Содержит': 'op.contains',
        'Не содержит': 'op.not_contains',
        'Начинается с': 'op.starts_with',
        'Заканчивается на': 'op.ends_with',
        'Меньше': 'op.less',
        'Больше': 'op.greater',
        'Меньше или равно': 'op.less_or_equal',
        'Больше или равно': 'op.greater_or_equal',
        'Интервал': 'op.interval',
        'Заполнено': 'op.filled',
        'Не заполнено': 'op.not_filled'
      };
      if (opMap[op]) return this.t(opMap[op]);
      return this.translatePhrase(op);
    },

    translateColumn: function(colKey, fallbackLabel) {
      if (!colKey && !fallbackLabel) return '';
      const lang = this.currentLang || DEFAULT_LANG;
      const dict = translations[lang] || translations[DEFAULT_LANG];
      
      const k = colKey ? String(colKey).toLowerCase().trim() : '';
      if (k) {
        if (dict['col.' + k]) return dict['col.' + k];
        if (dict['columns.' + k]) return dict['columns.' + k];
      }

      return this.translatePhrase(fallbackLabel || colKey);
    },

    translatePhrase: function(text) {
      if (!text) return '';
      const lang = this.currentLang || DEFAULT_LANG;
      const norm = normStr(text);

      if (phraseMap[norm]) {
        return phraseMap[norm][lang] || text;
      }
      for (const [pk, pv] of Object.entries(phraseMap)) {
        if (normStr(pk) === norm) {
          return pv[lang] || text;
        }
      }
      return text;
    },

    updateHtmlLangAttr: function() {
      if (document.documentElement) {
        document.documentElement.setAttribute('lang', this.currentLang);
      }
    },

    updateSwitcherUI: function() {
      document.querySelectorAll('.c1-lang-btn').forEach(btn => {
        const btnLang = btn.getAttribute('data-lang');
        const isActive = (btnLang === this.currentLang);
        btn.classList.toggle('active', isActive);
        if (isActive) {
          btn.style.background = '#004080';
          btn.style.color = '#ffffff';
          btn.style.fontWeight = 'bold';
        } else {
          btn.style.background = 'transparent';
          btn.style.color = '#1e293b';
          btn.style.fontWeight = 'normal';
        }
      });
    },

    /**
     * Translates DOM elements inside root container:
     * 1. Direct annotations: [data-i18n], [data-i18n-html], [data-i18n-title], [data-i18n-placeholder], [data-i18n-aria]
     * 2. Automatic phrase matching for button, span, label, th, td, option text nodes and tooltips.
     */
    applyTranslations: function(root) {
      const scope = root || document;
      const lang = this.currentLang || DEFAULT_LANG;

      // 1. data-i18n
      scope.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (key) {
          el.textContent = this.t(key, el.textContent);
        }
      });

      // 2. data-i18n-html
      scope.querySelectorAll('[data-i18n-html]').forEach(el => {
        const key = el.getAttribute('data-i18n-html');
        if (key) {
          el.innerHTML = this.t(key, el.innerHTML);
        }
      });

      // 3. data-i18n-title
      scope.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        if (key) {
          el.setAttribute('title', this.t(key, el.getAttribute('title')));
        }
      });

      // 4. data-i18n-placeholder
      scope.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (key) {
          el.setAttribute('placeholder', this.t(key, el.getAttribute('placeholder')));
        }
      });

      // 5. data-i18n-aria
      scope.querySelectorAll('[data-i18n-aria]').forEach(el => {
        const key = el.getAttribute('data-i18n-aria');
        if (key) {
          el.setAttribute('aria-label', this.t(key, el.getAttribute('aria-label')));
        }
      });

      // 6. Intelligent auto-translation for unannotated 1C controls:
      // Buttons, spans, labels, headers, and options whose text matches phraseMap
      const autoSelectors = 'button:not([data-i18n]), span:not([data-i18n]), label:not([data-i18n]), th:not([data-i18n]), option:not([data-i18n]), .mdi-win-title-text:not([data-i18n]), .sheet-meta-label:not([data-i18n]), .settings-box-title:not([data-i18n]), .settings-params-title:not([data-i18n])';
      scope.querySelectorAll(autoSelectors).forEach(el => {
        // If element has nested elements, don't clobber its children unless it's only text
        if (el.children.length === 0) {
          const txt = el.textContent ? el.textContent.trim() : '';
          if (txt && (txt.length < 50 || /^[a-zA-Z0-9\sа-яА-ЯёЁəöğşçıüİƏÖĞŞÇIÜ:().,–—\/-]+$/.test(txt))) {
            const tr = this.translatePhrase(txt);
            if (tr && tr !== txt) {
              el.textContent = tr;
            }
          }
        }
        // Also auto-translate title attribute if present and matched
        const titleAttr = el.getAttribute('title');
        if (titleAttr && !el.hasAttribute('data-i18n-title')) {
          const titleTr = this.translatePhrase(titleAttr.trim());
          if (titleTr && titleTr !== titleAttr) {
            el.setAttribute('title', titleTr);
          }
        }
      });
    }
  };

  // Immediate initialize on script load
  C1I18n.init();

  window.C1I18n = C1I18n;

})(window);
