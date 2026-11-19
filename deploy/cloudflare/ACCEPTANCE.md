# OpenMAIC üretim kabul raporu

19 Kasım 2026. Hedef [kalıcı Cloudflare uygulaması](https://openmaic.g-kahriman078.workers.dev). Başlangıç [OpenMAIC v1.4.2](https://github.com/THU-MAIC/OpenMAIC/commit/eb7c1bcccc3d083684c26ae1d5d187d41122cb10). Denemelerde iki ayrı, yönetici yetkisi olmayan, Supabase üzerinde doğrulanmış test hesabı kullanıldı. Son uygulama imajı 1cf2b534fdbefe82818c74380fafff3d4ad70e3c, Worker sürümü a21ea755-30a8-436c-8682-fdcca896ea29. Özel giriş bilgileri yalnızca yerel makinededir.

## Üretimde yapılan kontroller

| Sonuç | İşlem | Gözlenen sonuç |
| --- | --- | --- |
| PASS | HTTPS ve erişim | Kalıcı workers.dev üzerinden Türkçe ve İngilizce giriş. Özel ders API'si oturumsuz isteğe 401 verdi. |
| PASS | Gerçek parola girişi ve çıkış | Chrome'da mobil ve masaüstü oturum açıldı. Çıkış sonrası aynı tarayıcıda özel uç 401 döndürdü. İptal edilmiş oturum çerezleri süreleri dolmadan yeniden sunulduğunda da 401 alındı. |
| PASS | Profil ve oturum yenileme | Profil adı Supabase üzerinden kaydedildi. Erişim çerezi kaldırıldığında refresh çerezi ile iki yeni oturum çerezi alındı. |
| BLOCKED | Herkese açık e-posta aktivasyonu ve unutulan parolayı e-postayla geri alma | Supabase site ve callback URL'leri canlı adrese ayarlandı. Özel SMTP olmadığı için herkese e-posta teslimi doğrulanamadı. Kurucu bu işi erteledi. Yönetici tarafından doğrulanan hesaplarla parola girişi doğrulandı. |
| PASS | Supabase PostgreSQL | Mevcut projede 202611190001 hem yerel hem uzak migrasyon listesinde. Ayrı PostgreSQL rolü kendi şemasına yazdı. BYPASSRLS kapalıydı. İkinci şemadan doğrudan okuma izin hatası verdi. |
| PASS | Belge ve iş sahipliği | Birinci hesap kendi ders manifestosu, sahne ve üretim işini okudu. Aynı kimlikleri kullanan ikinci hesap üç işlemde de 404 aldı. Geçersiz oturumla ders listesi 401 döndü. |
| PASS | Dosya ve R2 | Gerçek PDF hem kütüphane hem ders ekinde yüklendi ve bayt bayt karşılaştırıldı. Diğer hesap özgün dosyada 404 aldı. Son imajda içeriği metin olan PDF reddedildi (415). Deneme eki silindi ve sahibi de artık indiremedi (404). |
| PASS | Matematik | Türkçe üç sahneli ders. 50° ve 60° ile verilen üçgenin son açısı 70° bulundu. İki slayt ve bir quiz kütüphanedeydi. |
| PASS | Tarih | İngilizce üç sahne. Doğu Asya'daki örnekler, Gutenberg ve kitap dolaşımının hızlanması ayrı slaytlarda işlendi. |
| PASS | Dil öğrenme | Dört sahne. Türkçe açıklamalar başlangıç zamanı için “since”, süre için “for” ayrımını ve bir İngilizce diyaloğu içerdi. |
| PASS | Belgeden öğrenme | Yüklenen PDF'den Güneş etkinliğinin yaklaşık 11 yıllık döngüsü, güneş lekesi maksimumu ve minimumu ile süreyi yoklayan kısa quiz üretildi. |
| PASS | Öğretmen ve değerlendirme | Canlı öğretmen akışı üçgen sorusuna 70 yanıtını verdi. Öğrenci tarayıcıda iki çoktan seçmeli yanıtı gönderdi ve 25/25 puan aldı. Açık uçlu quiz puanlayıcı 180 derece yanıtına 5/5 verdi ve açıklama döndürdü. |
| PASS | Anlatım ve transkripsiyon | OpenRouter'da Türkçe 55.213 bayt ses 1.029 ms, İngilizce 65.662 bayt ses 504 ms. İki kaydın transkripsiyonu anlamı korudu. Dağıtılmış sınıf üzerinden de Türkçe ses üretiminden transkripsiyona tam tur geçti. |
| BLOCKED | Öznel ses kalitesi | Telaffuzun doğallığı için insan dinleme değerlendirmesi yapılmadı. |
| PASS | Görsel üretimi | Canlı ders görseli API'si üçgen çizimini OpenRouter üzerinden üretti ve görsel verisi döndürdü. |
| PASS | Ders oynatıcısı, tahta ve tekrar açma | Masaüstü Chrome'da ders, sunum, beyaz tahta ve quiz sahnesi açıldı. Mobil Chrome bağlamında ayrı bir parola oturumu aynı derste kayıtlı quiz sahnesini açtı. İki cihazın sunucudan aldığı sceneId eşleşti. |
| PASS | Agent workbench | Yeni sohbet ekranı, dersler ve bilgi bankası açıldı. Gerçek bir ajan işi queued durumundan succeeded durumuna geçti. Diğer hesabın iş okuması 404 döndürdü. |
| PASS | Kota ve model bilgilerinin gizliliği | Normal Supabase anahtarı kota RPC'sine erişemedi. Servis rolüyle sıfır kalan bütçenin kabulü false oldu. Model ayarları yanıtında operatör anahtarları veya hesaba özgü servis sırları görülmedi. |
| PASS | Uzun iş ve işlemci değişimi | İstemci bağlantısı kesikken işler ilerledi. İşlemci değişimi başladığında teknik dersin ikinci sahnesi üretim aşamasındaydı. Yeni işlemcide aynı iş ve ders kimlikleriyle sonraki sahneye ilerlediği görüldü. Dakika-saniye örneği aynı iş kimliğiyle iki sahnede tamamlandı. Yeni işlemcide önceden kaydedilmiş dersler ve dosyalar açıldı. |
| PASS | Etkileşimli ikili arama | Üretilen sahnede eksik JavaScript kapanışı ve eksik bir durum güncelleme işlevi bulundu. Oynatıcı kapanış sorununa karşı düzeltildi. Mevcut sahnenin bağımsız alıştırma kopyasına erişilebilir durum bildirimi eklendi. Canlı tarayıcıda 20 hedefi seçilip ilk adım tıklandığında orta değer 8 bulundu, sağ yarı seçildi ve sayfa hatası oluşmadı. Ücretli yeniden üretim çalıştırılmadı. |
| BLOCKED | Teknik dersin üç sahnesinin tamamı | İkili arama simülasyonu üretildi. Son sahnenin üretimi test bütçesini korumak için operatör tarafından duraklatıldı. İki test hesabının çalışan üretim işi sayısı sıfır olarak kontrol edildi. |
| BLOCKED | Canlı sağlayıcı kesintisi ve yük testi | Gerçek sağlayıcıya ek ücretli hata enjeksiyonu veya çok kullanıcılı kapasite testi uygulanmadı. Her olası kesinti ve eşzamanlılık durumunun kapsandığı iddia edilmiyor. |

## Yerel doğrulama

| Sonuç | İşlem | Kanıt |
| --- | --- | --- |
| PASS | Lint | Uygulama ve Worker üzerinde ESLint sıfır hata bildirdi. Üç mevcut React hook uyarısı kaldı. |
| PASS | TypeScript | Next route tipleri oluşturuldu. tsc --noEmit temiz geçti. |
| PASS | Vitest | 1.168 dosyada 15.117 test geçti, 815 test atlandı. Tam koşu için dört test işçisi ve 30 saniye zaman aşımı kullanıldı. |
| PASS | İmaj ve dağıtım | GitHub Actions, Next.js üretim derlemesini ve Linux amd64 imajını tamamladı. İmaj Cloudflare Registry'ye aktarıldı, Wrangler yapılandırması doğrulandı ve aynı üretim uygulaması güncellendi. [İlk üretim derlemesi](https://github.com/gokturk078/OpenMAIC/actions/runs/44568865158) · [Simülasyon düzeltmesiyle son imaj](https://github.com/gokturk078/OpenMAIC/actions/runs/44573784431) |
| PASS | Mobil ve masaüstü | Chrome'da 390 ve 1.400 piksel genişliklerinde TR/EN giriş, ana sayfa ve çıkış. Son kontrolde taşma veya sayfa JavaScript hatası görülmedi. Gerçek telefon donanımı ve Safari bu kapsamda değildi. |

## Harcama ve tekrar çalıştırma

OpenRouter anahtarı hem kabul testlerine hem ürün trafiğine hizmet verdi. Test bütçesi talimatının zamanı 16:58:58 UTC idi. Bundan sonra iki QA hesabındaki hosted_usage kayıtlarında Sonnet 5.5 için iki yanıt (toplam 20.650 girdi, 16.384 çıktı tokenı), Sonnet 4.6 için iki yanıt (14.488 girdi, 16.384 çıktı tokenı) yer aldı. Standart liste fiyatlarıyla 0,20514 + 0,289224 = **0,494364 USD** tahmini test maliyeti. İki QA hesabının ses ve görsel çağrı sayaçlarında bu aralıkta artış gözlenmedi. Test işleri durduruldu. Aynı aralıkta hesap genelindeki bakiye 3,8830 USD'den 1,9720 USD'ye düştü. Başka bir ürün hesabı da aynı anahtarı kullanıyordu. Sağlayıcı, aynı anahtarın kesin faturasını kullanıcı başına ayırmıyor. Test için projeye ek dolar kotası uygulanmıyor. [Sonnet 5.5 fiyatı](https://openrouter.ai/anthropic/claude-sonnet-5.5) · [Sonnet 4.6 fiyatı](https://openrouter.ai/anthropic/claude-sonnet-4.6)

Özel .secrets.qa.json ile üretilen kimlikleri ekrana yazdırmadan preflight.mjs iki hesap ve SQL izolasyonunu kontrol eder. Bu dosya yalnızca testi yürüten makinede bulunur. acceptance.mjs varsayılan modda oturum ve kütüphaneyi kontrol eder. verify-private.mjs sahipliği, check-material.mjs geçici bir PDF'nin yükleme ve silme akışını, check-learning.mjs ders/tahta/cihaz akışını doğrular. **Ücretli** check-models.mjs, check-classroom.mjs ve acceptance.mjs start yalnızca ayrılan test bütçesiyle çalıştırılmalıdır. [İşletim ve maliyet hesabı](OPERATIONS.md)
