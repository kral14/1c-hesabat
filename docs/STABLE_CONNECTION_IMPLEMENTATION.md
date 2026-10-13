# Sabit bağlantı serveri — hazırlanmış tətbiq

13.10.2026. Yeni kod `stability_staging` qovluğunda hazırlanıb. İşləyən əsas API və COM sessiyasına keçid hələ edilməyib.

## Davranış

- API və COM ayrı proseslərdədir. API reload/exit COM prosesini bağlamır.
- Ofisdə saxlanmış sessiya `run.py` və təkrar giriş tərəfindən istifadə edilir; sağlam sessiya yenidən yaradılmır.
- COM obyektləri və nəticələrin çevrilməsi yalnız sahib STA thread-də aparılır.
- API/UI yenilənməsi avtomatikdir; COM mühərrikinin öz kodu dəyişəndə onun yenilənməsi təsdiqli bərpa tələb edir. Sağlam sessiya gizli restart edilmir.
- Qısa idarəetmə sorğuları növbədə ağır işlərdən əvvəl xidmət alır. Cari COM əməliyyatı ortadan zorla kəsilmir.
- Audit ofisdə bir iş ID-si ilə aparılır. Versiyalar və günlük tarixçə hissələri diskdə saxlanır.
- Hesabatlar da diskdə saxlanan nəticə hissələri ilə alınır. HTTP cavabları ölçü baxımından məhdud hissələrə bölünür; ümumi nəticə sayı məhdudlaşdırılmır.
- Ev/WARP çıxışı qopanda ofisdə iş davam edir. Klient həmin iş ID-si və giriş tokeni ilə davam edir. İtmiş qəbul cavabı ikinci iş yaratmır.
- İş qəbul edilərkən baza və istifadəçi sabitlənir; sonrakı baza seçimi həmin işi başqa bazaya yönəltmir.
- Proxy POST/DELETE/PATCH/PUT sorğularını kor təkrarlamır. İş mexanizmi yalnız oxuma əməliyyatlarına açıqdır.
- İlişmiş əlaqənin zorla bərpası istifadəçinin açıq təsdiqini tələb edir.
- Seçilmiş dövrdə hadisə yoxdursa, dövrdən kənar versiyalardan süni hadisə yaradılmır.

## Əsas fayllar

- `services/onec_service.py`: API üçün facade; özündə COM sessiyası saxlamır.
- `services/onec_gateway.py`: yalnız loopback ünvanındakı proseslə əlaqə və tək nüsxə hazırlanması.
- `services/onec_worker_process.py`: sessiyanın sahibi, diskdəki işlər və idarəetmə interfeysi.
- `services/onec_worker.py`: əvvəlki əməliyyat mühərriki, ayrıca STA thread.
- `services/job_store.py`: SQLite iş vəziyyəti, hissələr və token hash-ləri. Şifrələr və açıq tokenlər burada saxlanmır.
- `services/onec_result_queue.py`: COM nəticələrinin sahib thread-də adi JSON məlumatına çevrilməsi.
- `services/action_queue.py`: sorğu prioritetləri.
- `routes/job_routes.py`: işi başlatmaq, hazır hissələri almaq və təsdiqli bərpa.
- `static/js/job_client.js`: təkrar qəbulun qarşısını almaq, əlaqəni gözləmək və davametmə.
- `managed_runtime.py`: Waitress HTTP xidməti; API yenilənməsi COM prosesindən ayrıdır.
- `run.py`, `local_proxy.py`, sessiya/Audit/hesabat kontrollerləri yeni mexanizmə uyğunlaşdırılıb.

## Yoxlamalar

- 48 Python testi keçdi; əlavə Node yoxlamalarında köhnə Audit, filtr, sessiya, F5 və yeni job davranışları yoxlanıldı.
- Brauzer: hissəli Audit, irəliləyiş, nəticə fraqmentləri, təkrar F5 və təsdiqsiz bərpanın edilməməsi.
- Canlı yoxlama yalnız Test1C / Aztrade_test3, ayrı staging API portu 5096 və COM proses portu 52060 ilə aparıldı.
- API PID-si 4260-dan 14656-ya dəyişdi; COM prosesinin PID-si 28016 və bağlantı generation-u 1 qaldı.
- Eyni sorğunun iki dəfə göndərilməsi ikinci iş yaratmadı.
- 8 günlük Audit işi 10 hazır hissə və 7 real hadisə ilə tamamlandı; sonrakı istifadəçi sorğusu da keçdi.
- Hesabat sətirləri hissələrdən bərpa olundu, əlavə COM sessiyası açılmadı.
- Waitress həm localhost, həm də ofis LAN ünvanı 172.16.1.63 üzərindən ayrıca sınaq portunda cavab verdi.
- WARP qopması klientdə şəbəkə xətası kimi simulyasiya edildi. Evdən real WARP və 8 saatlıq yük sınağı hələ aparılmayıb.

## Tətbiq

Hazır kodun diff-i: `stable-connection-server.patch`. Tam mənbələr staging qovluğundadır. Manifest əvvəlki və yeni fayl hash-lərini saxlayır; başqa dəyişiklik varsa keçid dayanmalıdır.

Yeni asılılıq Waitress 3.0.2-dir; yalnız layihənin `.runtime-deps` qovluğunda istifadə edilir. Python-un sistem paketləri dəyişdirilməyib. Sınaq üçün paket staging daxilində quraşdırılıb.

13.10.2026 tarixində istifadəçinin açıq icazəsi ilə keçid tətbiq edildi. Ehtiyat nüsxə `logs/connection-upgrade-backup-4b954d3940a9` qovluğundadır. Aktiv API `/api/runtime/status` vasitəsilə yoxlandı: `independent_worker=true`, API PID 24484, ayrıca worker PID 7580, `worker_alive=true`. Yoxlama zamanı COM sessiyası açılmamışdı (`session_count=0`); növbəti girişdə yaradılacaq. Əsas bazaya test sorğusu göndərilmədi.

Geri qayıtmaq üçün hazırkı baza commit-i `89a7618`, tag `checkpoint-before-stable-server-20261013`-dür. Yeni worker-i bağlamadan köhnə COM mexanizmini paralel başlatmaq olmaz. Bərpa yalnız bu proqrama aid prosesi və onun sessiyasını idarə etməlidir.
