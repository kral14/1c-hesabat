# İş mühitində performans ölçməsi — 2026-10-12

Yalnız Test1C / Aztrade_test3 bazası oxundu. Realizasiya dövrü: 01.04.2026–31.10.2026. Ev bağlantısı ölçülməyib.

## HTTP nəticələri

| Sorğu | İlk sorğu | Təkrar sorğu |
|---|---:|---:|
| 200 sətir | 17,86 s | 0,94 s |
| 2 000 sətir | 5,39 s | 2,23 s |
| Bütün dövr: 24 860 sətir | 44,16 s | 9,46 s |

İlk sorğular bağlantı hazırlığını və növbədə gözləməni də əhatə edir. Bütün dövrün təkrar sorğusunda əsas 1C sorğusu 4,42 s, COM üzərindən sətirlərin oxunması 2,87 s, əlaqəli məlumatların alınması 1,18 s çəkdi. JSON hazırlanması 137 ms, gzip sıxılması 707 ms çəkdi. Cavab 18,73 MB-dan 1,60 MB-a sıxıldı.

## Brauzerdə cədvəlin görünməsi

| Sınaq | Görünmə vaxtı | Sinxron render | API sorğusu |
|---|---:|---:|---:|
| 200 sətir | 1,42 s | 11,9 ms | 1 |
| 2 000 sətir | 2,15 s | 15,9 ms | 1 |
| Yaddaşdan 2 000 sətrin açılması | 63,4 ms | 14,1 ms | 0 |

Görünmə vaxtı iki requestAnimationFrame ilə ölçülüb; fiziki monitor və Electron ayrıca ölçülməyib. Virtual cədvəldə 37 DOM sətri göstərilib.

## Tapılan və düzəldilən problemlər

- 1C qruplaşdırma sözündə Latın P hərfi sorğunu pozurdu; Kiril yazılışı bərpa edildi.
- Limitsiz sorğuda müvəqqəti cədvələ TOP olmadan ORDER BY verilirdi; ilkin seçimdə çıxarıldı, yekun sıralama saxlandı.
- Sorğu, COM oxuma, əlaqəli məlumat, JSON və gzip mərhələləri üçün opt-in ölçmə əlavə edildi.
- 7 hədəfli test keçdi. server.py SHA256 əvvəlki ilə eynidir.

## Növbəti sürətləndirmə prioritetləri

Əsas vaxt 1C sorğusu və COM üzərindən məlumat oxumağa gedir. İlk növbədə həmin mərhələlər və artıq lazım olmayan sorğuların növbəsi optimallaşdırılmalıdır. Cədvəlin renderi hazırda əsas gecikmə mənbəyi deyil.

Tam cavab üçün gzip səviyyə 6 ayrıca müqayisədə 230 ms və 1,75 MB, hazırkı səviyyə 9 isə 710 ms və 1,60 MB verdi. Bu müqayisə lokal sıxılma ölçməsidir; evə ötürmə sürəti barədə nəticə deyil. Sıxılma səviyyəsi dəyişdirilməyib.

Tam dövr sınağı birbaşa API limit=0 sorğusudur. Bu, End düyməsinin cari UI davranışının təsdiqi və ya bütün bazanın ixracı deyil.

Ətraflı ölçmələr: office_pipeline_results.json, office_pipeline_full_results.json, office_ui_pipeline_results.json.
