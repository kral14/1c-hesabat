# Vahid təqvim tarixi komponenti

1C sənəd və hesabat tarixləri saat qurşağı olmayan təqvim qiymətləridir.
Ekran və filtr tarixləri ISO UTC timestamp-ə çevrilmir, üzərinə sabit saat əlavə edilmir.

## Ortaq girişlər

- `services/onec_dates.py`: `parse_calendar_date`, `calendar_period`, `format_calendar_date`, `as_1c_date`.
- `static/js/c1_dates.js`: `C1Dates.parse`, `toBackend`, `display`, `dateOnly`, `milliseconds`.
- `CalendarConnection` / `CalendarQuery`: bütün canlı worker sorğularında yeni və unudulmuş tarix parametrlərini də COM sərhədində normallaşdırır.

Girişlər `DD.MM.YYYY`, `YYYY-MM-DD`, uyğun slash formatları və istəyə görə `HH:mm[:ss]` qəbul edir.
Başlanğıc vaxt verilmədikdə `00:00:00`, son tarix `23:59:59` olur. Dəqiq vaxt verilibsə saxlanır.
Səhv tarix və tərs dövr səssizcə başqa dövrlə əvəz edilmir. Açıq dövrlər jurnal parserində boş sərhədlə saxlanır.

## COM qaydası

pywin32 tarixi ötürərkən UTC-yə çevirir. Buna görə `as_1c_date` təqvim sahələrini dəyişmədən UTC etiketi əlavə edir.
Bu, biznes tarixinin UTC olması demək deyil; yalnız COM nəqliyyat qaydasıdır.
Gələn 1C tarixinin göstərilməsində əlavə saat sürüşməsi tətbiq olunmur.
Audit filtr strukturları və SKD parametr qiymətləri query sərhədindən keçmədiyinə görə açıq `as_1c_date` çağırır.

## Keçirilmiş sahələr

| Sahə | Ortaq komponent |
|---|---|
| Bütün sənəd jurnalları, tarix filtrləri, növbəti səhifə kursoru | Backend parser + COM çevrilməsi; frontend C1Dates |
| Anbar qalıqları/dövriyyəsi, satış və birbaşa hesablama | calendar_period + COM çevrilməsi |
| SKD hesabat tarixləri | calendar_period + parametr qiymətində COM çevrilməsi |
| Sifariş analizi | Ortaq parser + COM çevrilməsi |
| Audit dövrü, tarix filtrləri və qeydiyyat jurnalı | Ortaq parser + COM çevrilməsi |
| Tarixə görə qiymət və cari qiymət kataloqu | COM çevrilməsi |
| Dövr seçicisi və dövr widget-i | C1Dates |

Qəsdən saxlanan fərq: real hadisənin texniki timestamp-i (məsələn, HTTP loqu və `savedAt`) təqvim filtri deyil.
Onları bu qayda ilə UTC etiketləmək olmaz.

## Yoxlama və tətbiq

Test1C-də köhnə parametr `12.10.2026 00:00` → `11.10.2026 20:00`, UTC etiketli parametr → `12.10.2026 00:00` olaraq yoxlanıldı.
Unit yoxlamaları gecə sərhədi, ilin dəyişməsi, səhv tarix, Audit səhifələri, sorğu qoruması və fərqli timezone-ları əhatə edir.
Frontend testləri UTC, Asia/Baku və America/New_York mühitlərində eyni backend mətnini tələb edir.

Canlı COM prosesi köhnə modulları yadda saxlayır. Bu keçid üçün həmin prosesin bir dəfə istifadəçi təsdiqi ilə yenidən açılması lazımdır.
Təkcə Ctrl+R COM prosesindəki Python modullarını yeniləmir. İcazəsiz sessiya bağlanmır.
