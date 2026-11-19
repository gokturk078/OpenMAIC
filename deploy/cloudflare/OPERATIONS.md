# OpenMAIC üretim işletimi

Canlı uygulama [OpenMAIC](https://openmaic.g-kahriman078.workers.dev). Ürün dalı [product/cloudflare](https://github.com/gokturk078/OpenMAIC/tree/product/cloudflare), kaynak sürümü [v1.4.2](https://github.com/THU-MAIC/OpenMAIC/tree/eb7c1bcccc3d083684c26ae1d5d187d41122cb10). Orijinal lisans ve paket lisansları depoda tutulur.

## Mimari ve sınırlar

Worker, Supabase Auth oturumunu doğrular. Hesap başına bir Durable Object, OpenMAIC sunucusunun çalıştığı Container'a yönlendirir. PostgreSQL oturum havuzu TLS sertifikasını doğrular. Her hesabın ayrı veritabanı rolü ve şeması vardır. Kontrol tablolarının sahibi uygulama rolünden ayrıdır. Kota ve hesap hazırlama RPC'lerini yalnızca Worker çağırabilir. OpenMAIC ders işlerini kendi PostgreSQL iş kaydı, kilidi ve kontrol noktaları üzerinden yürütür. Durable Object alarmı etkin ders varken sunucuyu uyandırır.

R2 bucket adı `openmaic-private-assets`. Worker'a bağlı `FILES` üzerinden erişilir. Kaynak dosya ve içerik özetine göre saklanan medya, kullanıcıya özel anahtar öneki kullanır. Depolama bağdaştırıcıları mevcut OpenMAIC silme ve referans sayımı akışlarına bağlıdır. Kaynak yükleme üst sınırı 32 MiB, varlık havuzu kotası 256 MiB. Uygulama hesap başına bir eşzamanlı ders üretir. Altı etkin standard-2 Container kapasitesi vardır. Son kullanımdan 20 dakika sonra Container uyuyabilir. Kapasiteyi değiştirmek için Wrangler yapılandırmasını ve Supabase bağlantı havuzu kapasitesini birlikte değerlendirin.

## Kimlik, model ve gizli değerler

| Ad | Nerede ve ne için |
| --- | --- |
| SUPABASE_PROJECT_REF, SUPABASE_DB_PASSWORD | Yerel yönetim ve migrasyon için çalışma alanının .env.local dosyası |
| OPENROUTER_API_KEY | Worker secret. Model ağ geçidi kullanır |
| SUPABASE_ANON | Worker secret. Supabase'in ilgili projeye ait anon API anahtarı |
| SUPABASE_SERVICE | Worker secret. Yalnızca sunucuda kullanılan Supabase service_role API anahtarı |
| MAIC_MASTER | İlk kurulumda üretilen yüksek entropili Worker secret. Hesap başına DB parolalarını ve servis kimliklerini türetir. Güvenli yedeği gereklidir. Rotasyon, mevcut DB rollerinin parolalarını da değiştirmeyi gerektirir |
| PRODUCT_NAME, PUBLIC_ORIGIN, SUPABASE_URL, POOL_URL | wrangler.jsonc içindeki marka, kalıcı adres ve bağlantı hedefleri. POOL_URL kullanıcı adı ve parola içermez |
| COMPUTE_POOL | Hesap verisinden ayrı, kalıcı işlemci grubu adı. Aynı değeri normal dağıtımlarda koruyun. Değiştirilmesi kullanıcıları yeni işlemcilere taşır |
| DAILY_CALLS, GLOBAL_DAILY_CALLS | UTC günü için hesap başına ve toplam ücretli model çağrısı kotası. İlk değerler 100 ve 600 |
| DATABASE_URL, MAIC_OWNER, MAIC_ORIGIN_TICKET, MAIC_ASSET_TICKET, MAIC_AI_TICKET, OPENMAIC_SECRET_KEY | Worker her hesaba özel olarak Container'a sağlar |

Üretim sırları bu makinede deploy/cloudflare/.secrets.json içinde, yalnızca işletim sistemi kullanıcısına açık olarak saklanır. Erişim bilgilerini build argümanlarına koymayın. `deploy/product-models.yml` görev ve model eşlemesini, `bridge.js` sunucu tarafındaki izin listesini içerir. Yeni bir model için ikisini birlikte güncelleyin. Sohbet ve dersler Claude Sonnet 5.5, LLM yedeği Sonnet 4.6, ses ElevenLabs Multilingual v2, transkripsiyon GPT-4o Transcribe, görsel Gemini Nano Banana 2.1 kullanır. Kullanıcı sağlayıcı anahtarı yükleme kapalıdır. Video üretim modeli ve üçüncü taraf kod çalıştırma sağlayıcısı yapılandırılmamıştır.

Özel SMTP ertelendi. E-posta onayı açık kalır. Operatör Supabase Auth üzerinden doğrulanmış kullanıcı oluşturabilir. SMTP bağlandığında mevcut kullanıcı sistemi ve callback kullanılmaya devam eder. Supabase Auth URL Configuration içindeki Site URL canlı origin, izinli dönüş adresi ise bu origin altında /account/callback olmalıdır. [Supabase SMTP belgesi](https://supabase.com/docs/guides/auth/auth-smtp)

## Güncelleme ve geri alma

Node 22.23+, pnpm (package.json packageManager alanındaki sürüm), Docker, GitHub CLI, Supabase CLI ve giriş yapılmış Wrangler gereklidir. Komutların başlangıç dizini fork köküdür.

```sh
pnpm install --frozen-lockfile
npm ci --prefix deploy/cloudflare
pnpm exec next typegen
pnpm exec tsc --noEmit
LOG_FORMAT=text pnpm exec vitest run
supabase migration list --linked
```

Yeni bir kurulumu önce doğru Supabase projesine `supabase link --project-ref "$SUPABASE_PROJECT_REF"` ile bağlayın. Migrasyon farklarını inceledikten sonra `supabase db push --linked` uygulayın. Bu dağıtımın 202611190001 migrasyonu uzakta kayıtlıdır.

Uygulama değişiklikleri product/cloudflare dalına gönderildiğinde Product container iş akışı GitHub Container Registry'ye Linux amd64 imajını yükler. İş akışı başarılı olduktan sonra tam uygulama commit'i ile çalıştırın.

```sh
node deploy/cloudflare/release.mjs FULL_APPLICATION_COMMIT
```

Komut imajı Cloudflare kayıt deposuna aktarır, Wrangler imaj referansını günceller, dry-run yapar ve mevcut üretim Worker/Container uygulamasını günceller. Ardından değişen wrangler.jsonc dosyasını dala kaydedin. Yalnız Worker değişikliği için deploy/cloudflare içinde `npm run check` ve `npm run deploy` çalıştırın. İlk Worker secret kurulumu için aynı dizinde `npx wrangler deploy --secrets-file .secrets.json` kullanın. Mevcut üretim sırlarını normal güncellemede yeniden oluşturmayın. Geri alma için doğrulanmış önceki imaj ve Worker kaynak sürümünü birlikte seçip tekrar dağıtın. Veri migrasyonlarının bu sürümle uyumunu önceden kontrol edin.

## Gözlem ve maliyet

Cloudflare Workers Observability istek, hata ve Container kullanımını, OpenRouter Activity gerçek model harcamasını, Supabase proje paneli bağlantı ve depolama kullanımını gösterir. PostgreSQL'deki maic_control.usage tablosu UTC günü, hesap, görev ve model başına kabul edilen çağrıları sayar. Başarısız sağlayıcı çağrıları da bu sayıya girer. Çağrı kotasının dolar karşılığı ders uzunluğuna ve modele göre değişir.

Dahil kullanım aşıldığında standard-2 için bir çalışan Container-saat yaklaşık 0,057 USD bellek ve disk, tam CPU kullanımıyla yaklaşık 0,129 USD toplam hesaplama tutar. Workers Paid taban bedeli 5 USD/aydır. Workers, Durable Objects, ağ, R2 ve Supabase kullanımı ayrıca hesaba girer. R2 Standard ilk 10 GB-aydan sonra 0,015 USD/GB-ay ve işlem ücretleri uygular. [Container fiyatları](https://developers.cloudflare.com/containers/platform/pricing/) · [R2 fiyatları](https://developers.cloudflare.com/r2/pricing/)
