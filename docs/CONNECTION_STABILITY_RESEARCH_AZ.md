# 1C və Cloudflare WARP üçün bağlantı sabitliyi araşdırması

Tarix: 13.10.2026. Bu sənəd araşdırma və təklifdir; işləyən server və sessiyalar dəyişdirilməyib.

## Tövsiyə

İlk mərhələdə mövcud COM inteqrasiyasını saxlamaq, HTTP API ilə COM bağlantısını ayrı proseslərə bölmək məqsədəuyğundur. Bu, 1C konfiqurasiyasına dəyişiklik etmədən həyata keçirilə bilər. Məqsəd tam qopmazlıq vədi deyil: şəbəkə kəsilməsini tez aşkar etmək, işləyən sessiyanı qorumaq və nəticəni itirmədən davam etməkdir.

Ofis: Electron → sabit API → iş növbəsi → ayrıca COM prosesi → 1C.
Ev: Electron/lokal UI → WARP və Cloudflare Tunnel → ofisdə eyni sabit API → eyni COM prosesi → 1C.

WARP üzərindən COM sessiyası açılmamalıdır. Ev klienti HTTP sorğuları göndərir; 1C bağlantısı ofisdə qalır. Ev internetinin qopması həmin ofis bağlantısını bağlamamalıdır.

## Layihədə təsdiqlənən məhdudiyyətlər

- managed_runtime.py Python mənbəsi dəyişdikdə HTTP xidməti ilə birlikdə COM işçisini də yenidən başladır. Bu iki komponentin ömrü ayrılmalıdır.
- services/onec_service.py bir STA thread və bir ümumi növbə istifadə edir. Hissələrə bölünən ağır işlər növbəni uzun müddət tutmamalıdır.
- HTTP sorğusunun vaxtının bitməsi 1C daxilində gedən əməliyyatı avtomatik ləğv etmir.
- local_proxy.py POST, PUT, DELETE və PATCH daxil geniş avtomatik retry siyahısı istifadə edir. Yazma əməliyyatları təkrarlana bilər; retry əməliyyatın mənasına görə seçilməlidir.
- Müxtəlif istifadəçilər və bazalar üçün COM sessiyasını paylaşmaq səlahiyyətləri qarışdıra bilər. İşlər baza və autentifikasiya olunmuş istifadəçi üzrə ayrılmalıdır. Sessiya sayını artırmaqdan əvvəl lisenziya tutumu yoxlanmalıdır.

## Server quruluşu

1. API ayrıca prosesdə işləyir. Windows üçün Waitress uyğun namizəddir. Waitress təkbaşına COM ilişməsini həll etmir; COM prosesi ayrıca qalmalıdır.
2. COM prosesi bağlantını öz STA thread-ində yaradır və bütün COM obyektlərini həmin thread-də azad edir. İnterfeys yenilənməsi və API restartı sağlam COM prosesinə toxunmur.
3. İş serverə qəbul edilərkən job_id alır. Klient uzun HTTP cavabı gözləmir, vəziyyəti və nəticə hissələrini soruşur. İşin metadatası və hazır nəticə hissələri diskdə saxlanır.
4. WARP bərpa olunduqda klient həmin job_id və davam mövqeyi ilə qaldığı yerdən oxuyur. Eyni işin təkrar göndərilməsi ikinci iş yaratmır.
5. Qısa sorğular, giriş və vəziyyət yoxlamaları ağır hesabatlardan əvvəl xidmət alır. Ağır hesabat və audit hissələrlə icra olunur. Bir COM sessiyası eyni anda bir neçə müstəqil əməliyyat icra edən hovuz kimi qəbul edilmir.
6. API, iş növbəsi, COM/1C və WARP/ofis HTTP çıxışı ayrı ölçülür. Yüklü işçi "əlaqə qopub" kimi göstərilmir. Son uğurlu yoxlama və cari əməliyyatın müddəti görünür.
7. Sağlam bağlantı qorunur. Həqiqətən qırılmış bağlantı həmin işçi daxilində yenidən qurulur. Canlı, lakin ilişmiş COM prosesinin zorla dayandırılması istifadəçi təsdiqi tələb edir. Artıq çökmüş prosesin bərpası sağlam sessiyanı sonlandırmaqdan fərqlidir.

## Təkrar sorğular

HTTP connection pool saxlanılır. Təkrar cəhdlər aralıqlarını artıraraq və təsadüfi kiçik gecikmə ilə edilir. Oxuma işləri sabit job_id ilə təkrar tələb oluna bilər. Sənəd yazma, silmə və şifrə dəyişmə üçün kor avtomatik retry edilməməlidir. Nəticəsi bilinməyən yazma əməliyyatı ayrıca yoxlanmadan təkrarlanmamalıdır.

## WARP və tunnel

Cloudflare private network route ofis API ünvanına yönəlməlidir. Split tunnel qaydaları həmin ünvanı istisna etməməlidir. DNS, firewall, connector loqları və ofis xidmətinə lokal çıxış ayrı yoxlanmalıdır. Tunnelin Healthy olması tətbiqin və COM-un da hazır olduğunu sübut etmir.

Cloudflare Tunnel artıq bir neçə bağlantı ilə ehtiyatlı işləyir. Əlavə connector başqa cihazda yerləşdirilə bilər; bunun faydası origin API-nin həmin cihazdan da əlçatan olmasından asılıdır. İkinci connector tək API kompüterinin sıradan çıxmasını özü həll etmir. Replicas işlək HTTP sorğusunun nəticəsini avtomatik bərpa edən job mexanizmini əvəz etmir.

## Sonrakı alternativ

1C HTTP xidmətləri və sessiyaların təkrar istifadəsi COM-dan asılılığı azalda bilər. Bunun üçün 1C-də xidmət/extension, yayınlama, uyğun platforma, hüquqlar və lisenziya yoxlanmalıdır. HTTP-yə keçmək uzun sorğunu və səhv retry siyasətini avtomatik həll etmir. Mövcud 8.3.17 platformasında konkret imkanlar test bazasında təsdiqlənmədən əsas bazaya tətbiq edilməməlidir.

## Test bazasında qəbul yoxlamaları

- Eyni iş sessiyası ilə 8 saatlıq sınaq: sessiya sayı özbaşına artmamalıdır.
- 100 dəfə Ctrl+R və API restartı: sağlam COM sessiyası saxlanmalıdır.
- WARP/ev çıxışının 30 saniyə və 2 dəqiqə kəsilməsi: ofis işi qalmalı, nəticələr job_id ilə davam etməlidir.
- Uzun audit zamanı qısa sorğular və idarəetmə API-si cavab verməlidir; növbə gözləməsi ayrıca ölçülməlidir.
- Süni qırılmış COM sessiyası bərpa olunmalı; sağlam sessiya dəyişdirilməməlidir.
- Canlı ilişmiş işçini təsdiqsiz sonlandırmaq olmaz.
- Cavabı itən yazma əməliyyatı iki dəfə icra edilməməlidir.
- 5 illik tarixçə seçilmiş sənəd və dövr üzrə hissələrlə, ümumi hadisə limiti olmadan gəlməlidir.

Bunlar təklif edilən sınaqlardır; bu araşdırma zamanı həyata keçirilməyib. Canlı sınaqlar yalnız Test1C / Aztrade_test3 üzərində aparılmalıdır.

## Rəsmi mənbələr

- 1C klientinin bərpa mexanizmləri: https://kb.1ci.com/1C_Enterprise_Platform/Guides/Administrator_Guides/1C_Enterprise_8.3.23_Administrator_Guide._Client_Server_Mode/2._Client_server_mode/2.2._Server_cluster_structure/2.2.5._Failover_cluster/
- 1C xidmət sessiyalarının təkrar istifadəsi: https://kb.1ci.com/1C_Enterprise_Platform/Guides/Developer_Guides/1C_Enterprise_8.3.23_Developer_Guide/Chapter_17._Integration_with_external_systems/17.5._Reusing_Internet_service_sessions/17.5.2._Types_of_session_reuse/
- Windows üçün Waitress: https://flask.palletsprojects.com/en/stable/deploying/waitress/
- Cloudflare private network diaqnostikası: https://developers.cloudflare.com/learning-paths/replace-vpn/troubleshooting/troubleshoot-private-networks/
- Cloudflare tunnel bağlantı problemləri: https://developers.cloudflare.com/tunnel/troubleshooting/
- Tunnel ehtiyat bağlantıları: https://developers.cloudflare.com/tunnel/configuration/
- Retry qaydaları: https://urllib3.readthedocs.io/en/stable/reference/urllib3.util.html
