# GÜNÜN MAÇLARI — Proje Devir Notu

Son güncelleme: 18 Eylül 2026, iş bilgisayarında (`grafik`).
Bu dosya başka bir makinede (ev: `mustafayuksel`) kaldığı yerden devam etmek için yazıldı.
Claude: işe başlamadan önce bu dosyayı baştan sona oku. Kullanıcı Mustafa, dil Türkçe.

---

## 1. Ne bu proje

Türkiye'de TV'de yayınlanan günün maçlarını gösteren kişisel bir web uygulaması.
Mustafa arkadaşlarıyla paylaşıyor, telefonda ana ekrana eklenmiş uygulama gibi kullanılıyor.

- **Site:** https://mustafa85yks-arch.github.io/gunun-maclari/
- **Depo:** https://github.com/mustafa85yks-arch/gunun-maclari (herkese açık / public)
- Sade HTML + CSS + vanilla JS. Sunucu, framework, API anahtarı yok.

## 2. Asıl kopya GitHub'dakidir

- İki bilgisayar birbirini görmez. **Güncel hali her zaman GitHub'dakidir.**
- `data/` klasörünü GitHub'daki görev (bot) her gün kendisi yazar; hiçbir bilgisayardaki
  `data/` güncel değildir, **asla `data/` yükleme.**
- Bir makinede çalışmaya başlamadan önce depodan son hali indir:
  GitHub → yeşil **Code** düğmesi → **Download ZIP** (veya `git clone`).
- Değişikliği bitirince sadece değişen dosyaları geri yükle (bkz. §8).

## 3. Dosyalar

| Dosya | Ne yapar |
|---|---|
| `index.html` | İskelet: başlık, gün düğmeleri, favoriler, arama kutusu, favori penceresi |
| `style.css` | Görünüm. Açık tema, mobil uyumlu. Kart zemini lig renginin açık tonu (`color-mix`) |
| `data.js` | Sabitler: kategoriler, yayıncılar, Türk takımları, ligler, **lig renkleri**, **büyük kulüpler**, **derbiler**, öne çıkarma puanları, `GM.fold` |
| `api.js` | Veri katmanı: günlük dosyayı `<script>` ile yükler (file:// için), İstanbul saati, kontroller |
| `app.js` | Arayüz: filtreler, favoriler, arama, önerilen maçlar, lige göre sıralama, kartlar |
| `data/YYYY-AA-GG.js` | Günlük veri — **bot yazar**, elle dokunma |
| `scripts/veri_cek.py` | Günlük veriyi üreten script (GitHub'da çalışır) |
| `.github/workflows/gunluk.yml` | Zamanlı görev: veri çek → kaydet → siteyi yayınla |
| `manifest.webmanifest`, `icons/` | Telefona "Ana Ekrana Ekle" için |
| `README.md` | Kullanıcıya yönelik açıklama |

## 4. Veri nasıl geliyor

`gunluk.yml` her gün **00:10, 01:40, 07:00, 12:00, 17:00 (TSİ)** ve her yüklemede (push) çalışır.

1. **Ana liste — sporekrani.com, bugün + 7 gün.**
   - Bugünün listesi sayfanın HTML'inde hazır gelir.
   - Diğer günler sitede sekmeye **tıklayınca** yüklenir → görünmez tarayıcı (Playwright + Chrome)
     sekmelere tıklar. `/home/day/<tarih>` adresi doğrudan açılınca **bugüne** yönlendirir.
   - sporekrani o günleri kendi gizli API'sinden, sitede gömülü `app_id/api_key` ile çeker.
     **O anahtarı kullanmıyoruz** (başkasının anahtarı + depo herkese açık). Değiştirme.
   - Tarayıcı açılamazsa script sadece bugünü düz HTML'den çeker.
2. **Doğrulama (✓) — kanalların kendi yayın akışları:**
   - `ssport.tv/yayin-akisi`: "Takvime Ekle" bağlantılarındaki base64 takvim kaydı
     (tarih, saat, kanal, "Canlı Yayın"). Bugün + 2 gün.
   - `beinsports.com.tr/yayin-akisi/<kanal>/<gün>`: sadece **içinde bulunulan hafta**
     (pazartesi = bu haftanın pazartesisi). Canlı/tekrar ayrımı YOK → sadece doğrulamada kullanılır.
   - Aynı saatte (±15 dk) aynı takımlar kanalın akışında varsa `verification: dogrulandi`.
3. Günden hiç maç çıkmazsa o günün dosyasına dokunulmaz; Actions'ta sarı uyarı.

Denenip elenen kaynaklar: **Maçkolik** (script bağlantısını TLS'te kesiyor), **Fotomaç**
(liste JS ile geliyor), **TRT Spor / Tivibu / Exxen / TOD** (akış sayfası yok ya da JS).
Gemini vb. yapay zekâ API'si gerekmedi.

## 5. Mustafa'nın kararları (değiştirmeden önce sor)

- Biten maçlar **hiç gösterilmez** (eski "bitenleri gizle" düğmesi kaldırıldı).
- **Yayıncı filtresi yok** (kanal kartta yazıyor).
- **Kadın futbolu ve kadın basketbolu (WNBA dahil) alınmaz.** Kadın voleybolu **sadece Türkiye
  ile ilgiliyse** alınır (Sultanlar Ligi, Türk kulüpleri, Filenin Sultanları).
  Kadın hentbolu şu an listede — Mustafa'ya sorulmadı.
- **Lig renkleri kartın tüm zemini** (pastel ton), ince şerit değil. Her lig ayrı renk.
- **Önerilen Maçlar**: büyük kulüpler + tarihi derbiler öne çıkar, taraf tutmaz, favoriden etkilenmez.
  Derbilerde **sadece adı** yazar ("⚔ Madrid Derbisi"); açıklama/istatistik istemiyor.
- **Logo yok (şimdilik).** Mustafa grafiker; takım logolarını ileride kendisi verebilir.
  Not: armalar kulüplerin tescilli işareti, depo herkese açık — o zaman gizli depo seçeneği konuşulmalı.
- Haftalık "önerilen maçlar" görünümü önerildi, istenmedi.

## 6. Özellikler (şu an sitede)

- Gün gezinme (Önceki / BUGÜN / Sonraki), 7 gün ileri. 3 günden uzak günlerde "henüz kesinleşmedi" notu.
- Spor filtresi: Futbol, Basketbol, Tenis, **Amerikan Futbolu** (NFL + NCAA + canlı NFL Red Zone), Diğer.
- Türk takımları filtresi ve bölümü.
- **Favoriler** (takım + lig, tarayıcıda `localStorage` `gm-favoriler`), karttan ☆ ile ekleme.
- **Arama**: takım veya lig adı, bugün + 7 gün taranır, gün gün listelenir.
- **Önerilen Maçlar** (günde en fazla 5) + kartlarda derbi etiketi.
- **Sırala: Saat | Lig** (`gm-sirala`).
- Canlı durum saatten tahmin (`~` işareti); gerçek canlı skor yok.

## 7. Tuzaklar (hepsi yaşandı)

- **`toLocaleLowerCase('tr')`**: "Inter" → "ınter" olur. Ad karşılaştırmalarında `GM.fold` (ı→i) kullan.
- sporekrani **"Kadinlar"** (noktalı i) yazabiliyor → regex `kad[ıi]n`.
- "Şampiyonlar Ligi" sadece başta geçiyorsa UEFA (`^(uefa )?şampiyonlar ligi`); yoksa hentbol/FIBA'yı yakalar.
- Script'te `kucuk('Idman TV')` → `ıdman tv`; karşılaştırılan listeler de aynı fonksiyondan geçmeli.
- "Çeyrek Final" final sayılmamalı; "Azerbaycan Premier Ligi" ≠ Premier League; "Marsilya" = Marseille.
- **ssport.tv sertifika zincirini eksik gönderiyor** → Python `urllib` reddeder; tarayıcıyla okunuyor.
- CSS `text-transform: uppercase` Türkçe sayfada yabancı adı "OLD FİRM" yapar → derbi etiketinde yok.
- Tarayıcının oluşturduğu HTML'de `<a data-v-.. href=...>` — satır regex'i `<a [^>]*href=` olmalı.
- Sayfanın üstündeki "öne çıkan maç" vitrini de `/home/match/` bağlantısı taşır → `event-list__row` kontrolü.
- **pbcopy** locale verilmeden Türkçe harfleri bozar → `LC_CTYPE=UTF-8 pbcopy`. (`gunluk.yml` artık ASCII.)
- python.org Python'u (Mac) HTTPS'te sertifika hatası verebilir → `SSL_CERT_FILE=/etc/ssl/cert.pem`.
- Tarayıcı JS/CSS'i önbellekte tutar; yerel denemede `fetch(u,{cache:'reload'})` ile zorla yenile.

## 8. GitHub'a yükleme (Mustafa web arayüzünü kullanıyor, terminal değil)

1. Değişen dosyaları masaüstünde bir klasöre koy (ör. `GUNUN_YUKLE`), **sadece yüklenecekler**.
2. GitHub'da depo **ana sayfasına** git — adres `.../gunun-maclari` olmalı, `/tree/...` değil.
   ⚠️ "Upload files" **o an açık olan klasöre** yükler; bir kez yanlışlıkla `.github/workflows`
   içine gitti.
3. **+** → **Upload files** → sürükle-bırak → **Commit changes**.
4. `gunluk.yml` değişecekse: dosyayı aç → kalem (Edit) → ⌘A → ⌘V → Commit.
5. Yükleme görevi tetikler; 2-3 dk sonra site güncellenir. Durum: Actions sekmesi, ya da
   `https://api.github.com/repos/mustafa85yks-arch/gunun-maclari/actions/runs?per_page=1`.

## 9. Yerelde deneme

- `index.html`'e çift tık yeterli (veri `data/` klasöründen; güncel veri için siteye bak).
- Veri scripti: `pip install playwright` → `python3 scripts/veri_cek.py --gun 3`
  (`--sadece-bugun` tarayıcısız). Çıktı `data/`'ya yazar — **o `data/`'yı GitHub'a yükleme.**
- Önizleme sunucusu: klasörde `python3 -m http.server 8791` → http://localhost:8791

## 10. Açık işler

- [ ] `.github/workflows/` içinde yanlışlıkla yüklenmiş kopyalar duruyor
      (`scripts/`, `README.md`, `api.js`, `data.js`, `style.css`). Zararsız; GitHub'da ⋯ → Delete ile silinebilir.
      `gunluk.yml`'ye dokunma.
- [ ] Kadın hentbolu kalsın mı? (sorulmadı)
- [ ] Takım logoları — Mustafa verince (bkz. §5 not).
- [ ] Sultanlar Ligi başlayınca kadın voleybolunun geldiğini kontrol et.
- [ ] Büyük kulüp / derbi listesine ekleme-çıkarma isteği gelirse: `data.js` → `BIG_CLUBS`, `RIVALRIES`.
