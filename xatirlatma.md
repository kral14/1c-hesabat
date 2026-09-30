Listed directory 1c-hesabat
Viewed package.json:1-10
Viewed run.py:1-29
Listed directory templates
Listed directory components
Listed directory static
Listed directory js
Listed directory css
Ran command: `git status -s; git log -n 5 --oneline`
Ran command: `python -m py_compile app.py database.py excel_generator.py run.py`
Viewed database.py:1-267
Viewed app.py:1-150
Viewed app.py:151-300
Searched for "action =="
Searched for "action\s*=="
Searched for "@app.route"
Searched for "@app.route"
Viewed main_electron.js:1-100
Viewed index.html:1-150
Viewed index.html:151-308
Viewed excel_generator.py:1-150
Viewed app.js:1-116
Viewed report_engine.js:1-120
Viewed app.py:2025-2080
Searched for "universal_report"
Viewed app.py:560-750
Viewed app.py:750-950
Viewed app.py:950-1200
Viewed app.py:1201-1300
Viewed check_1c_settings.py:1-19
Viewed test_api_filters.py:1-62
Viewed settings_modal.js:1-150
Viewed test_no_auto.py:1-41
Viewed test_records.py:1-30
Searched for "split(".")"
Viewed app.py:300-450
Viewed skd_query_text.txt:1-100
Viewed extract_skd_query.py:1-20

Layihəni ətraflı incələdim. Bu tətbiq **1C:Enterprise (8.3)** sistemindəki *"Товары на складах (Ведомость)"* hesabatını **Python (Flask) + Electron + HTML/JS (MDI interfeys)** ilə yenidən canlandıran masaüstü proqramdır.

Aparılan audit nəticəsində sistemdə həm **riyazi/məntiqi**, həm **1C sorğu arxitekturası**, həm də **frontend performansında** bir sıra ciddi və kritik problemlər aşkar edildi.

---

### 1. Ən Kritik Problemlər (Riyazi və 1C Sorğu Xətaları)

1. **Qalıqların Şişməsi və Dublyajı (Double-Counting Bug — Ən Kritik Riyazi Xəta):**
   - **Mənbə:** [`app.py`](file:///d:/1c-hesabat/app.py#L1071-L1080)
   - **Səbəb:** Əgər hesabatda qeydiyyatçı sənədlər aktiv edilərsə (`has_registrar = True`), 1C-də virtual cədvəl `ОстаткиИОбороты(&Начало, &Son, Авто)` rejimində çağırılır. Bu rejimdə eyni məhsul üçün dövr ərzində 5 sənəd varsa, 5 ayrı sətir qayıdır. Kodda isə `node["start_bal"] += s_bal` və `node["end_bal"] += e_bal` yazılıb!
   - **Fəsad:** Məhsulun faktiki son qalığı 10 ədəddirsə, 5 sənəd hərəkəti olduqda hesabat son qalığı **50 ədəd** göstərir! Qalıqlar toplanmamalı, sənədlər üzrə xronoloji götürülməli, məhsul səviyyəsində isə dövrün son faktiki qalığı yazılmalıdır.

2. **Tarix Formatının Parçalanması və Fallback Xətası:**
   - **Mənbə:** [`app.py`](file:///d:/1c-hesabat/app.py#L578-L585)
   - **Səbəb:** Kod yalnız `DD.MM.YYYY` formatında `split(".")` gözləyir. Frontend və ya API-dən tarix standart ISO formatında (`YYYY-MM-DD`, məsələn `2026-09-01`) gəldikdə, kod `ValueError` atır və heç bir xəbərdarlıq etmədən susqunluqla fallback-a düşərək **sabit 01.09.2026 - 30.09.2026** tarixlərini təyin edir! Nəticədə istifadəçi başqa ay seçsə belə, fərqli formatda həmişə sentyabr ayı açılır.

3. **Qiymət Növlərinin (Price Types) İtirlməsi:**
   - **Mənbə:** [`app.py`](file:///d:/1c-hesabat/app.py#L901-L904)
   - **Səbəb:** Qiymət cədvəli ilə birləşmədə (LEFT JOIN) `Наименование = &PriceType_{p_i}` axtarılır. Lakin sistemdə qiymət növləri bəzən kodla ("20") və ya adla ("20 %", "Pərakəndə") saxlanılır. Əgər filtrdən kod göndərilirsə, amma 1C-də ad fərqlidirsə, qiymətlər 0 çıxır və yekun məbləğlər (Сумма) 0.00 qalır.

4. **Barkodların Adla Uyğunlaşdırılması (Barcode Mismatch):**
   - **Mənbə:** [`app.py`](file:///d:/1c-hesabat/app.py#L112-L138)
   - **Səbəb:** `b_map` lüğətində açar kimi `Т.Владелец.Наименование` istifadə olunur. Əgər bazada eyni adlı, lakin fərqli artikul və ya koda malik iki fərqli məhsul varsa, onların barkodları bir-birinə qarışır. Açar kimi unikal `Код` və ya `Ссылка` istifadə olunmalıdır. Həmçinin hər dəfə bütün bazanın barkodlarını RAM-a yükləmək yaddaşı şişirdir.

5. **Portfel və Süzgəclərin (Filters) Ziddiyyəti:**
   - **Mənbə:** [`app.py`](file:///d:/1c-hesabat/app.py#L724-L756)
   - **Səbəb:** Filtrlərdə "Портфель" seçiləndə `Справочник.Номенклатура`-nın qrupları (qovluqları) və `НоменклатурнаяГруппа` axtarılır. Halbuki 1C bazasında ayrıca `Справочник.Портфели` mövcuddur və sənədlərdə `ДоговорКонтрагента.Портфель` kimi işlənir.

---

### 2. Frontend və UI/UX Problemləri

1. **Virtual Scrolling Yoxluğu və DOM Donması (Freeze):**
   - **Mənbə:** [`static/js/report_engine.js`](file:///d:/1c-hesabat/static/js/report_engine.js)
   - **Səbəb:** Böyük anbarlarda 2,000 – 10,000 sətir məlumat olanda birbaşa nəhəng HTML cədvəl qurulur və `innerHTML` vasitəsilə DOM-a atılır. Bu, Electron-un və Chromium mühərrikinin tamamilə donmasına və pəncərənin ağarmasına səbəb olur.

2. **Hər Sorğuda Ağır və Bloklayıcı Excel Yaradılması:**
   - **Mənbə:** [`app.py`](file:///d:/1c-hesabat/app.py#L1215-L1233)
   - **Səbəb:** İstifadəçi sadəcə ekranda hesabatı görmək üçün `Сформировать` basdıqda belə, arxa planda `openpyxl` işə düşür və bütün cədvəli stil və qruplaşmalarla Excel faylına yazır. Bu, hesabatın çıxma sürətini 3–5 dəfə ləngidir. Excel generasiyası yalnız istifadəçi "Экспорт в Excel" düyməsini basanda işləməlidir.

3. **Təhlükəsizlik və Kod Təmizliyi:**
   - Bütün 1C giriş parametrləri (server adı, baza adı, istifadəçi adı və şifrə `15963`) kodun daxilində açıq (hardcoded) saxlanılıb.
   - `app.py` faylı 2234 sətirlik nəhəng monolitdir; COM axını, API marşrutları və biznes məntiqi bir-birinə qarışıb.

---

### Təklif olunan Həll Planı

1. **1-ci Addım (Riyazi Dəqiqlik):** `universal_report` sorğusunda və `data_tree` aqreqasiyasında sənəd hərəkətləri olan zaman qalıqların toplanması xətasını aradan qaldırmaq (xronoloji qalıq və yekun qalıq fərqləndirilməsi).
2. **2-ci Addım (Tarix və Format Sabitliyi):** Həm `DD.MM.YYYY`, həm də `YYYY-MM-DD` formatlarını problemsiz tanıyan universal tarix çeviricisi əlavə etmək.
3. **3-cü Addım (Sürət və Performans):** Hər sorğuda məcburi Excel generasiyasını ləğv edib, yalnız istifadəçi tələb etdikdə (on-demand) işlətmək.
4. **4-cü Addım (Qiymət və Barkod Doğruluğu):** Qiymət növlərini həm `Наименование`, həm də `Код` üzrə birləşdirmək, barkodları isə məhsulun unikal `Код`-una bağlamaq.
5. **5-ci Addım (Frontend Sabitliyi):** Böyük hesabatlar üçün optimallaşdırma və pəncərə idarəetməsini səliqəyə salmaq.

Hansı problemdən başlayaq? Təsdiqinizlə dərhal düzəlişlərə başlaya bilərəm.