# 🧪 Test və Diaqnostika Skriptlərinin Arxitekturası

Bu qovluqda layihənin bütün avtomatlaşdırılmış testləri, diaqnostika alətləri, bençmarklar və yoxlama skriptləri funksionallıqlarına uyğun qruplaşdırılmışdır.

---

## 📁 Qovluqların Strukturu və İzahı

### 1. `tests/documents/` — Sənədlər və Jurnal Testləri
1C sənəd jurnalları, sənəd növləri, sətir sayları və qeydiyyatçılar üzrə yoxlamalar:
* **`test_multi_docs.py`** — Çoxsaylı sənəd növlərinin eyni vaxtda sorğulanması və filtrasiyası testi.
* **`test_universal_sales.py`** — Satış və realizasiya sənədlərinin strukturu və sorğu testi.
* **`test_april_test1c.py`** — Test1C bazası üzrə aprel ayı sənədlərinin yoxlanışı.
* **`test_clean_headers.py`** — Sənəd cədvəli başlıqlarının və sütunlarının düzgün formatlanması testi.
* **`test_search_locate.py`** — Sənəd və elementlərin axtarışla birbaşa tapılması və cədvəldə fokuslanması.
* **`test_records.py`** — Sənədlərin hərəkət qeydlərinin (регистры накопления) oxunması testi.
* **`test_row_count.py`** — Jurnalda pagination və sətir saylarının dəqiqliyinin yoxlanışı.
* **`test_search_column.py`** — Jurnal sütunları üzrə birbaşa axtarış və filtrasiya testi.
* **`inspect_sales_reg.py`** — Satış registrinin (РегистрНакопления.Продажи) daxili strukturunun analizi.
* **`inspect_full_tabdoc.py`** — 1C cədvəl sənədinin (ТабличныйДокумент) formatı və xanalarının analizi.
* **`inspect_recorders.py`** — Qeydiyyatçı sənədlərin (Регистратор) strukturu və əlaqələrinin analizi.
* **`inspect_test1c_document_period.py`** — Test1C bazasında sənəd tarixlərinin və dövrlərinin təyini.

---

### 2. `tests/warehouses/` — Anbarlar və Qalıqlar (SKD) Testləri
Anbar strukturu, çoxsaylı anbar seçimi və SKD qalıq hesabatı testləri:
* **`test_wh_folder.py`** — Anbar qovluqlarının (иерархия складов) düzgün açılması və iyerarxiya testi.
* **`test_wh_multi.py`** — Çoxsaylı anbarların (Multi-warehouse) siyahı üzrə seçilib hesabata ötürülməsi testi.
* **`test_multi_wh_run.py`** — Çoxsaylı anbarlar üzrə hesabatın generatsiya sürəti və nəticə testi.
* **`check_warehouse_reps.py`** — Anbar qalıq hesabatlarının çıxarış və dəqiqlik yoxlanışı.
* **`inspect_wh_epf.py`** — Anbar xarici emal (EPF) faylının inspeksiyası.
* **`wh_multi_test.json`** — Anbar testlərinin JSON çıxışı.
* **`wh_schema_investigation.json`** — 1C Anbar registr sxeminin tədqiqat nəticələri.
* **`temp_wh.epf`** — Anbar testi üçün köməkçi xarici emal faylı.

---

### 3. `tests/products_and_prices/` — Məhsullar, Qiymətlər və Barkod Testləri
Nomenklatura, qiymət növləri, barkod registrləri və qiymət sənədləri testləri:
* **`test_barcode_query.py`** — 1C Barkod registrindən (РегистрСведений.Штрихкоды) sürətli oxunma testi.
* **`test_inspect_barcode_price.py`** — Barkod və qiymət məlumatlarının tam analizi.
* **`test_multi_nom_run.py`** — Çoxsaylı məhsullar seçildikdə hesabatın formalaşdırılması testi.
* **`test_multi_price_query.py`** — Çoxsaylı qiymət növləri üzrə qiymət cədvəlinin sorğulanması.
* **`inspect_price.py`** — Qiymət strukturlarının və valyutaların yoxlanışı.
* **`check_dirol.py`** — "Dirol" brendi üzrə nomenklatura və qiymət testi.
* **`check_oba_sept.py`** — "OBA" şəbəkəsi üzrə sentyabr hərəkətlərinin yoxlanışı.
* **`check_portfolios.py`** — Portfel soraqçası və məhsul paylanmasının yoxlanışı.
* **`debug_gunay_numbers.py`** — Müştəri/Agent rəqəmlərinin və qalıqlarının debug testi.
* **`barcode_price_info.json`** — Nümunəvi barkod və qiymət test datası.

---

### 4. `tests/api_and_filters/` — API və Filtr Testləri
Flask serverinin API endpointləri və filtr mexanizmləri testləri:
* **`test_api_filters.py`** — `/api/documents/list` və `/api/catalog_data` filtrlərinin HTTP sorğu testi.
* **`test_agents_query.py`** — Satış agentləri üzrə filtrasiya və sorğuların testi.
* **`test_smart_filter.py`** — Smart filtr alqoritminin yoxlanışı.
* **`test_param_universal.py`** — Universal parametr və dövr ötürmələri testi.
* **`test_skd_user_settings.py`** — SKD istifadəçi sazlamaları və süzgəclərinin testi.
* **`check_unmodified_setting.py`** — Dəyişdirilməmiş standart sazlamaların saxlanma testi.
* **`test_no_auto.py`** — Avtomatik icranın qarşısının alınması və icazəsiz formalaşdırmanın yoxlanışı.

---

### 5. `tests/performance/` — Sürət və Bençmark Testləri
Jurnalın və hesabat motorunun performans testləri:
* **`benchmark.py`**, **`benchmark_test1c.py`** — 1C COM bağlantısının və sorğularının millisekund bençmarkı.
* **`test_direct_calc.py`** — Birbaşa hesablama və aqreqasiya sürəti testi.
* **`test_long_period.py`** — Geniş tarix diapazonunda (uzun dövrlər) sorğu sürəti testi.
* **`test_query_speed.py`** — Fərqli 1C sorğu strukturlarının sürət müqayisəsi.
* **`test_worker_speed.py`** — Çoxaxınlı worker proseslərinin icra sürəti testi.
* **`check_turbo.py`** — Turbo rejimin və keşləmənin performans yoxlanışı.
* **`benchmark_journal_local.cjs`** — Jurnalın lokal performansı və render sürəti testi (Node.js).
* **`journal_cache.test.cjs`** — Jurnal keş mexanizminin (Map cache) testi.
* **`journal_benchmark_*.json`** — Bençmark nəticələrinin ölçmə jurnalları.
* **`journal_*_results.json`** — Virtual scroll və filtrasiya sürət nəticələri.

---

### 6. `tests/diagnostics/` — Sistem, Sxem və SKD Diaqnostikası
1C metadata, COM sessiyaları və SKD sxemlərinin analizi:
* **`check_1c_settings.py`** — Aktiv baza parametrlərinin və qoşulma sazlamalarının diaqnostikası.
* **`check_test1c_dates.py`** — Test1C bazasında mövcud sənəd tarixlərinin skanı.
* **`check_test_base.py`** — Test bazasının bağlantı və konfiqurasiya testi.
* **`check_ib_users.py`** — 1C İnformasiya Bazasının istifadəçilərinin siyahısı.
* **`check_actual_sept_test1c.py`** — Sentyabr ayı üzrə faktiki hərəkətlərin təyini.
* **`test_test1c_conns.py`** — Test1C çoxsaylı COM bağlantı limiti testi.
* **`test_v83_app.py`** — V83.COMConnector tətbiq qoşulma testi.
* **`inspect_procs.py`** — Arxa plan proseslərinin inspeksiyası.
* **`inspect_1c_schema.py`** — 1C konfiqurasiya sxeminin çıxarılması.
* **`inspect_test1c_sessions.py`** — 1C aktiv COM sessiyalarının monitorinqi.
* **`scratch_inspect_meta.py`** — Metadata obyektlərinin təhlili.
* **`get_skd_details.py`** — SKD detalları və kompozisiya strukturu.
* **`extract_skd_logic.py`**, **`export_skd.py`**, **`extract_skd_query.py`**, **`export_skd_xml.py`** — SKD sorğularının və XML sxeminin ixracı.
* **`meta_output.txt`**, **`skd_query_text.txt`**, **`skd_tovary_na_skladakh.xml`**, **`extracted_query.txt`**, **`skd_schema.xml`** — Sxem və sorğu çıxış faylları.

---

### 7. `tests/artifacts/` — Test Çıxışları, Loglar və Skrinşotlar
Avtomatlaşdırılmış testlər zamanı yaranan loglar və ekran görüntüləri:
* **`*.log`** — Server və headless browser log faylları.
* **`*.jpg`** — Test zamanı çəkilmiş UI təsdiq skrinşotları.
