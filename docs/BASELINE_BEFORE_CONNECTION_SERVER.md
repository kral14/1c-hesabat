# Sabit bağlantı serverindən əvvəlki başlanğıc nöqtəsi

Tarix: 13.10.2026 (Asia/Baku).

Bu checkpoint hazırkı işlək kodu saxlayır. Sonrakı mərhələ HTTP API ilə uzunömürlü COM prosesinin ayrılması, iş ID-si ilə nəticələrin izlənməsi və WARP qopmasından sonra davam etmə mexanizmidir. Yeni proses arxitekturası bu checkpoint-də hələ tətbiq edilməyib.

Hazırkı imkanlar:
- Audit yalnız açıq formalaşdırma əmri ilə yüklənir; universal filtr və Ctrl+Enter ortaq davranır.
- Hadisələr seçilmiş sənəd və tarix aralığı üzrə günlük hissələrlə, ümumi hadisə limiti olmadan oxunur.
- Təkrar F5 davam edən Audit detal sorğusunu təkrarlamır.
- Silinmiş mal sonrakı versiyalarda təkrar silinmiş göstərilmir; son hal ayrıca göstərilir.
- Yaradılma hadisəsi ilə ilk saxlanmış snapshot ayırd edilir; saxlanmamış ilkin dəyər uydurulmur.
- Açılış bağlantı yoxlaması, dövri vəziyyət nəzarəti və sessiya idarəetmə GUI-si mövcuddur.
- Sağlam COM bağlantısı təkrar girişdə qorunur; qırılmış bağlantı STA işçisində yenilənir.

Qalan arxitektura məhdudiyyəti: HTTP xidməti və COM işçisi hələ eyni prosesdədir. Python xidməti restart olduqda COM bağlantısı da yenilənə bilər.

Araşdırma və qəbul meyarları: CONNECTION_STABILITY_RESEARCH_AZ.md.
Canlı analiz və testlər yalnız Test1C / Aztrade_test3 üzərində aparılmalıdır. Əsas baza aktiv olduqda əvvəl istifadəçiyə xəbər verilməlidir. İşlək sessiyanı qıra bilən restart və əl ilə sonlandırma üçün istifadəçi icazəsi tələb olunur.

Lokal iş ayarları, loqlar və real baza diaqnostika çıxarışları checkpoint-in göndərilən məzmununa daxil edilmir.
