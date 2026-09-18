# GÜNÜN MAÇLARI

Türkiye'de TV'de yayınlanan günün karşılaşmaları. Sade HTML + CSS + vanilla JS,
kurulum yok, sunucu gerekmez.

## Açmak

İnternette: **https://mustafa85yks-arch.github.io/gunun-maclari/**
Telefonda: linki aç, Safari'de Paylaş → "Ana Ekrana Ekle" (Android'de Chrome menüsü → "Ana ekrana ekle").
Bilgisayarda yerel: `index.html`'e çift tıkla. Adres sonuna `#2026-09-20` eklersen o güne gider
(sadece bugün + 7 gün; geçmiş bir tarih bugünü açar).

## Günlük veri nasıl geliyor

`.github/workflows/gunluk.yml` GitHub'ın sunucusunda her gün 00:10, 01:40, 07:00, 12:00 ve 17:00'de
(TSİ) `scripts/veri_cek.py`'yi çalıştırır. API anahtarı yok.

1. **Ana liste — sporekrani.com, bugün + 7 gün.** Bugünün listesi sayfanın içinde gelir; diğer
   günler sitede sekmeye tıklanınca yüklendiği için görünmez tarayıcı (Playwright + Chrome) sekmelere
   tıklar. Tarayıcı açılamazsa sadece bugün çekilir. Uzak günler seyrek olur (kanallar programı
   yaklaştıkça ekliyor); arayüz 3 günden ilerisi için "henüz kesinleşmedi" notu gösterir.
2. **Doğrulama — kanalların kendi akışları.** ssport.tv (bugün + 2 gün, "Canlı Yayın" işaretli) ve
   beinsports.com.tr (içinde bulunulan hafta). Aynı saatte aynı takımlar kanalın kendi akışında varsa
   kartta ✓ çıkar. beIN tekrarları canlıdan ayırmıyor; bu yüzden beIN sadece doğrulamada kullanılıyor.
3. `data/YYYY-AA-GG.js` yazılır, değişiklik varsa kaydedilir, site yeniden yayınlanır.
   14 günden eski dosyalar silinir.

- sporekrani'nin sitede gömülü duran kendi API anahtarı **kullanılmıyor** (başkasının anahtarı; depo da herkese açık).
- ssport.tv sertifika zincirini eksik gönderdiği için Python'la değil tarayıcıyla okunuyor.
- Bir günden hiç maç okunamazsa o günün dosyasına dokunulmaz; Actions sekmesinde sarı uyarı çıkar.
- Elle çalıştırmak: GitHub → Actions → "Gunluk veri ve yayin" → Run workflow.
- Yerelde deneme: `pip install playwright` sonra `python3 scripts/veri_cek.py --gun 3`
  (python.org Python'unda sertifika hatası çıkarsa başına `SSL_CERT_FILE=/etc/ssl/cert.pem`).
- GitHub, 60 gün hareketsiz depolarda zamanlı görevi durdurur; görevin kendi kayıtları hareket
  sayıldığı için normalde sorun olmaz. Durursa Actions sekmesinden yeniden etkinleştir.

## Dosyalar

| Dosya | Ne yapar |
|---|---|
| `index.html` | İskelet |
| `style.css` | Görünüm (açık tema, mobil uyumlu) |
| `data.js` | Sabitler: spor kategorileri, yayıncı adları, Türk takımları, favori ligleri/önerileri, "öne çıkanlar" puanları |
| `api.js` | Veri katmanı: sağlayıcı seçimi, İstanbul saat dilimi, veri kontrolleri |
| `app.js` | Arayüz: gün şeridi, filtreler, favoriler, kartlar, durum/geri sayım, takvime ekle (.ics) |
| `data/YYYY-AA-GG.js` | O günün maçları (her gün için ayrı bir dosya) |

## Günlük veri dosyası

```js
GM_REGISTER_DAY({
  date: '2026-09-18',
  generatedAt: '2026-09-18T10:30:00+03:00',
  sources: [{ name: 'sporekrani.com', url: 'https://…' }],
  events: [{
    id: 'sl-kas-kon',
    sport: 'futbol',                 // futbol | basketbol | tenis | f1 | motogp | ufc | boks | hentbol …
    competition: 'Trendyol Süper Lig',
    competitionId: 'super-lig',      // öne çıkanlar puanı için (data.js → COMPETITION_WEIGHT)
    home: 'Kasımpaşa', away: 'Konyaspor',   // takımsız etkinlikte bunların yerine title: 'Sıralama Turları'
    kickoff: '2026-09-18T20:00:00+03:00',   // saat dilimi (+03:00) mutlaka yazılmalı
    broadcasters: ['beIN SPORTS 1'],
    verification: 'dogrulandi',      // dogrulandi | tek_kaynak | yayin_yok
    turkish: true,                   // yazılmazsa takım adından tahmin edilir
    tags: ['derbi'],                 // final | yari-final | derbi
    sources: ['sporekrani.com', 'mynet.com'],
    status: { state: 'live', minute: 34 }   // isteğe bağlı: sadece CANLI veri varsa
  }]
});
```

## Güvenlik kuralları (api.js içinde)

- **Başka güne ait maç gösterilmez.** Başlama saati, İstanbul saatine göre o güne
  düşmeyen kayıt atılır, konsola uyarı yazılır, sayfanın altında kaç kayıt atıldığı gösterilir.
- **Dosyanın `date` alanı istenen günle aynı değilse** dosyanın tamamı reddedilir.
- **Yayıncıda tahmin yapılmaz.** Kanal yoksa veya `verification` alanı tanınmıyorsa
  kartta "Yayıncı doğrulanamadı" yazar.
- **Canlı durum.** Veride `status` alanı yoksa CANLI başlama saatinden tahmin edilir
  ve yanında `~` işareti görünür. Dakika ("CANLI 34'") sadece gerçek canlı veri gelirse gösterilir.
- Veri yüklenemezse: "Maç bilgileri şu anda güncellenemiyor."

## Başka veri kaynağına geçmek

`api.js` → `GM.CONFIG.provider`:

- `localFile` (varsayılan): `data/` klasöründeki günlük dosyaları okur.
- `remoteApi`: `GET {apiBase}/days/2026-09-18` çağırır, yukarıdaki biçimde JSON bekler.
  API anahtarı **tarayıcı koduna yazılmaz**; `apiBase` kendi backend'inizi gösterir,
  anahtar orada durur.

Başka bir kaynak için `api.js`'teki `providers` nesnesine bir `getDay(date)` eklemek yeterli.
Arayüz değişmez.
