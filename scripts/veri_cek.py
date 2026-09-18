#!/usr/bin/env python3
"""Günlük maç dosyalarını (data/YYYY-AA-GG.js) üretir.

Ana liste : sporekrani.com (bütün Türk kanalları). Bugün + GUN_SAYISI gün.
            Bugünün listesi sayfanın içinde hazır gelir; diğer günler sitede sekmeye
            tıklanınca yüklenir, bu yüzden onlar için görünmez tarayıcı (Playwright) kullanılır.
            Playwright yoksa / açılamazsa sadece bugün çekilir.
Doğrulama : kanalların kendi yayın akışları.
            - ssport.tv: bugün + 2 gün, "Canlı Yayın" işaretli (S Sport, S Sport 2)
            - beinsports.com.tr: içinde bulunulan haftanın günleri (canlı/tekrar ayrımı yok,
              ama maçın canlı olduğunu zaten sporekrani söylüyor; burada sadece kanal teyit edilir)
            Aynı saatte (±15 dk) aynı takımlar kanalın kendi akışında varsa: verification = dogrulandi.

API anahtarı yok. Sitelerin kendi (gömülü) anahtarlarına da dokunulmaz; sadece sayfalar okunur.

Kullanım:
    python3 scripts/veri_cek.py                  # bugün + 7 gün
    python3 scripts/veri_cek.py --gun 3          # bugün + 3 gün
    python3 scripts/veri_cek.py --sadece-bugun   # tarayıcı kullanmadan
    python3 scripts/veri_cek.py --html sayfa.html 2026-09-18   # indirmeden, kayıtlı sayfadan (test)

Güvenlik: bir günden hiç maç çıkmazsa o günün mevcut dosyasına dokunulmaz.
"""
import base64
import datetime as dt
import html
import json
import re
import sys
import time
import urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo

TZ = ZoneInfo('Europe/Istanbul')
KOK = Path(__file__).resolve().parent.parent
VERI = KOK / 'data'
SE = 'https://www.sporekrani.com'
GUN_SAYISI = 7
SAKLA_GUN = 14  # bundan eski günlük dosyalar silinir
UA = ('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 '
      '(KHTML, like Gecko) Version/17.0 Safari/605.1.15')

# Alınmayanlar: stüdyo programları, at yarışı, Türkiye dışı kanallar.
ATLA_SPOR = {'binicilik', 'spor', 'programlar'}
ATLA_LIG = re.compile(r'program|özet|kura çekimi')
YABANCI_KANAL_ADLARI = ['CBC Sport', 'Idman TV', 'AzTV', 'İctimai TV', 'Space TV']
# Kadın futbolu ve kadın basketbolu alınmaz (Mustafa'nın kararı). Kadın voleybolu sadece
# Türkiye ile ilgiliyse alınır (Sultanlar Ligi, Türk kulüpleri, Filenin Sultanları).
KADIN = re.compile(r'kad[ıi]n|women|bayan|\bwnba\b')
# Program olarak listelenen ama canlı spor yayını olanlar.
CANLI_PROGRAM = re.compile(r'red ?zone', re.I)

BUYUK_DORT = ('galatasaray', 'fenerbahçe', 'beşiktaş', 'trabzonspor')

# Lig adı → competitionId (öne çıkanlar puanı + favori ligler bununla çalışır). Özel olan önce.
LIG_KURALLARI = [
    (r'euroleague süper kupa', 'euroleague-super-kupa'),
    (r'euroleague', 'euroleague'),
    (r'trendyol süper lig', 'super-lig'),
    (r'trendyol 1\. lig', '1-lig'),
    (r'türkiye kupası', 'turkiye-kupasi'),
    (r'^(uefa )?şampiyonlar ligi', 'ucl'),
    (r'^(uefa )?avrupa ligi', 'uel'),
    (r'^(uefa )?konferans ligi', 'uecl'),
    (r'^ingiltere premier lig', 'premier-league'),
    (r'^ispanya la liga$', 'la-liga'),
    (r'^italya serie a$', 'serie-a'),
    (r'^almanya bundesliga$', 'bundesliga'),
    (r'^fransa ligue 1$', 'ligue-1'),
    (r'^nba\b', 'nba'),
    (r'^nfl\b', 'nfl'),
    (r'basketbol süper ligi', 'bsl'),
    (r'sultanlar ligi', 'sultanlar-ligi'),
    (r'efeler ligi', 'efeler-ligi'),
    (r'formula 1', 'f1'),
    (r'motogp', 'motogp'),
    (r'\bufc\b', 'ufc'),
    (r'wimbledon|roland garros|us open|avustralya açık', 'grand-slam'),
    (r'^atp\b', 'atp'),
    (r'^wta\b', 'wta'),
]
TURK_LIG = re.compile(r'trendyol|türkiye|türk telekom|tff|sultanlar|efeler|basketbol süper ligi', re.I)
TR_TAKIM = ('galatasaray', 'fenerbahçe', 'beşiktaş', 'trabzonspor', 'başakşehir', 'anadolu efes',
            'türk telekom', 'bahçeşehir', 'tofaş', 'karşıyaka', 'vakıfbank', 'eczacıbaşı', 'türkiye')


def kucuk(s):
    return s.replace('I', 'ı').replace('İ', 'i').lower()


YABANCI_KANAL = {kucuk(k) for k in YABANCI_KANAL_ADLARI}
ASCII = str.maketrans('çğıöşüâîûé', 'cgiosuaiue')


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', kucuk(s).translate(ASCII)).strip('-')


def lig_id(lig):
    k = kucuk(lig)
    if re.search(r'kad[ıi]n|women', k):  # sporekrani bazen 'Kadinlar' (noktalı i) yazıyor
        return slug(lig)  # Kadınlar Şampiyonlar Ligi ≠ Şampiyonlar Ligi (ayrı lig, ayrı favori)
    for desen, cid in LIG_KURALLARI:
        if re.search(desen, k):
            return cid
    return slug(lig)


def kanal_adi(ad):
    """'Bein Sports 1' → 'beIN SPORTS 1' (yayıncı gruplaması bu adla çalışır)."""
    m = re.match(r'bein sports\s*(.*)$', ad, re.I)
    if m:
        rest = m.group(1).strip()
        if re.match(r'bein connect', rest, re.I):
            return 'beIN CONNECT'
        return ('beIN SPORTS ' + rest.upper()).strip()
    return ad.strip()


def indir(url):
    istek = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': 'tr-TR,tr;q=0.9'})
    with urllib.request.urlopen(istek, timeout=30) as r:
        return r.read().decode('utf-8', 'replace')


def metin(desen, parca):
    m = re.search(desen, parca, re.S)
    return html.unescape(re.sub(r'<[^>]+>', '', m.group(1))).strip() if m else ''


# ------------------------------------------------------------------ sporekrani

def sayfa_gunu(sayfa):
    """Sayfadaki maç bağlantılarında en çok geçen tarih = sayfanın gösterdiği gün."""
    sayim = {}
    for g in re.findall(r'href="/home/match/\d+/(\d{4})/(\d{2})/(\d{2})/', sayfa):
        sayim['-'.join(g)] = sayim.get('-'.join(g), 0) + 1
    return max(sayim, key=sayim.get) if sayim else None


def sporekrani_bugun():
    return indir(SE + '/')


def sporekrani_tarayici(tarihler):
    """Görünmez tarayıcıyla her güne tıklayıp sayfayı alır. {tarih: html}"""
    from playwright.sync_api import sync_playwright  # yoksa ImportError → çağıran yakalar

    sonuc = {}
    with sync_playwright() as p:
        try:
            tarayici = p.chromium.launch(channel='chrome', headless=True)
        except Exception:
            tarayici = p.chromium.launch(headless=True)
        sayfa = tarayici.new_page(locale='tr-TR', timezone_id='Europe/Istanbul', user_agent=UA)
        sayfa.goto(SE + '/', wait_until='domcontentloaded', timeout=60000)
        sayfa.wait_for_selector('a.event-list__row', timeout=30000)
        ilk = sayfa.content()
        if sayfa_gunu(ilk):
            sonuc[sayfa_gunu(ilk)] = ilk

        for tarih in tarihler:
            if tarih in sonuc:
                continue
            yol = '/' + tarih.replace('-', '/') + '/'
            tamam = False
            for _ in range(3):  # ilk tıklama bazen boşa gidiyor
                if not sayfa.query_selector(f'a[href="/home/day/{tarih}"]'):
                    break  # sekme yok: site bu kadar ileriyi göstermiyor
                sayfa.eval_on_selector(f'a[href="/home/day/{tarih}"]', 'e => e.click()')
                try:
                    sayfa.wait_for_function(
                        'yol => [...document.querySelectorAll("a.event-list__row")]'
                        '.some(a => (a.getAttribute("href") || "").includes(yol))', arg=yol, timeout=15000)
                    tamam = True
                    break
                except Exception:
                    continue
            if not tamam:
                print(f'{tarih}: sporekrani sekmesi yüklenmedi, atlandı.')
                continue
            sayfa.wait_for_timeout(1000)  # geç gelen satırlar için
            sonuc[tarih] = sayfa.content()

        # ssport.tv sertifika zincirini eksik gönderiyor: Python reddediyor, tarayıcı tamamlıyor.
        try:
            sayfa.goto('https://www.ssport.tv/yayin-akisi', wait_until='domcontentloaded', timeout=60000)
            sonuc['__ssport__'] = sayfa.content()
        except Exception as e:
            print(f'UYARI: S Sport sayfası tarayıcıyla açılamadı ({e}).')
        tarayici.close()
    return sonuc


def ayikla(sayfa, tarih):
    # Sunucu HTML'inde <a href=...>, tarayıcının oluşturduğunda <a data-v-.. href=...> gelir.
    satirlar = re.split(r'(?=<a [^>]*href="/home/match/)', sayfa)[1:]
    olaylar, atlanan, gorulen = [], 0, set()
    for s in satirlar:
        s = s[:s.find('</a>')]
        if 'event-list__row' not in s[:600]:
            continue  # üstteki "öne çıkanlar" vitrini, liste satırı değil
        mid = re.match(r'<a [^>]*href="/home/match/(\d+)/(\d{4})/(\d{2})/(\d{2})/', s)
        m_spor = re.search(r'alt="([^"]+)"[^>]*class="[^"]*event-list__sport-icon', s)
        spor = html.unescape(m_spor.group(1)) if m_spor else ''
        saat = metin(r'<span[^>]*class="event-list__time(?:\s[^"]*)?"[^>]*>(.*?)</span>', s)
        ad = metin(r'class="event-list__name(?:\s[^"]*)?"[^>]*>(.*?)</p>', s)
        lig = metin(r'class="event-list__league(?:\s[^"]*)?"[^>]*>(.*?)</p>', s)
        masaustu = s.split('event-list__channels flex')[-1]
        kanallar = list(dict.fromkeys(html.unescape(k) for k in re.findall(r'alt="([^"]+)"', masaustu)))

        if not (mid and re.fullmatch(r'\d\d:\d\d', saat) and ad):
            atlanan += 1
            continue
        if f'{mid.group(2)}-{mid.group(3)}-{mid.group(4)}' != tarih or mid.group(1) in gorulen:
            continue  # başka güne ait ya da tekrar eden satır
        gorulen.add(mid.group(1))

        if CANLI_PROGRAM.search(ad):  # NFL Red Zone gibi canlı yayınlar
            spor, lig = 'Amerikan Futbolu', 'NFL'
        elif kucuk(spor) in ATLA_SPOR or ATLA_LIG.search(kucuk(lig)):
            continue

        yayin_yok = any(kucuk(k) == 'yayın yok' for k in kanallar)
        kanallar = [kanal_adi(k) for k in kanallar if kucuk(k) != 'yayın yok']
        tr_kanallar = [k for k in kanallar if kucuk(k) not in YABANCI_KANAL]
        if kanallar and not tr_kanallar:
            continue  # sadece Azerbaycan vb. kanallarda

        ev, dep = ad.split(' - ', 1) if ' - ' in ad else ('', '')
        olay = {
            'id': 'se-' + mid.group(1),
            'sport': kucuk(spor) or 'diger',
            'competition': lig,
            'competitionId': lig_id(lig),
            'kickoff': f'{tarih}T{saat}:00+03:00',
            'broadcasters': tr_kanallar,
            'verification': 'yayin_yok' if (yayin_yok and not tr_kanallar) else 'tek_kaynak',
            'sources': ['sporekrani.com'],
        }
        if ev:
            olay['home'], olay['away'] = ev.strip(), dep.strip()
        else:
            olay['title'] = ad
        if TURK_LIG.search(lig):
            olay['turkish'] = True
        if ev and sum(any(b in kucuk(t) for b in BUYUK_DORT) for t in (ev, dep)) == 2:
            olay['tags'] = ['derbi']
        if re.search(r'yarı final$', kucuk(lig)):
            olay.setdefault('tags', []).append('yari-final')
        elif re.search(r'(?<!çeyrek )(?<!yarı )\bfinal$', kucuk(lig)):
            olay.setdefault('tags', []).append('final')

        kadin = KADIN.search(kucuk(lig + ' ' + ad))
        if kadin and olay['sport'] in ('futbol', 'basketbol'):
            continue
        if kadin and olay['sport'] == 'voleybol' and not (olay.get('turkish') or tr_takimi_var(olay)):
            continue

        # Yayını olmayan maçı sadece Türk takımı varsa göster.
        if olay['verification'] == 'yayin_yok' and not olay.get('turkish') and not tr_takimi_var(olay):
            continue
        olaylar.append(olay)
    return olaylar, atlanan


def tr_takimi_var(olay):
    ad = kucuk(olay.get('home', '') + ' ' + olay.get('away', ''))
    return any(t in ad for t in TR_TAKIM)


# ------------------------------------------------------------------ kanal akışları (doğrulama)

def ssport_akisi(sayfa=None):
    """ssport.tv 'Takvime Ekle' kayıtları: [(datetime, başlık)] — sadece Canlı Yayın."""
    sayfa = sayfa or indir('https://www.ssport.tv/yayin-akisi')
    kayit = []
    for b in re.findall(r'data:text/calendar;charset=utf8;base64,([A-Za-z0-9+/=]+)', sayfa):
        t = base64.b64decode(b).decode('utf-8', 'replace')
        bas = re.search(r'DTSTART[^:\n]*:(\d{8}T\d{4})', t)
        ozet = re.search(r'SUMMARY:(.*)', t)
        acik = re.search(r'DESCRIPTION:(.*)', t)
        if not (bas and ozet and acik and 'Canlı' in acik.group(1)):
            continue
        zaman = dt.datetime.strptime(bas.group(1), '%Y%m%dT%H%M').replace(tzinfo=TZ)
        baslik = re.sub(r'-S Sport\s*\d*\s*$', '', ozet.group(1).strip())
        kayit.append((zaman, baslik))
    return kayit


BEIN_SLUG = {  # kanal adı (kanal_adi() çıktısı) → beinsports.com.tr adresi
    'beIN SPORTS 1': 'beinsports', 'beIN SPORTS 2': 'beinsports-2', 'beIN SPORTS 3': 'beinsports-3',
    'beIN SPORTS 4': 'beinsports-4', 'beIN SPORTS 5': 'beinsports-5',
    'beIN SPORTS MAX 1': 'beinsports-max-1', 'beIN SPORTS MAX 2': 'beinsports-max-2',
    'beIN SPORTS HABER': 'bein-sports-haber',
}
GUN_ADI = ['pazartesi', 'sali', 'carsamba', 'persembe', 'cuma', 'cumartesi', 'pazar']


def bein_akisi(tarih, kanallar):
    """beIN'in o güne ait akışı (sadece içinde bulunulan hafta). [(datetime, başlık)]"""
    bugun = dt.datetime.now(TZ).date()
    gun = dt.date.fromisoformat(tarih)
    if gun.isocalendar()[:2] != bugun.isocalendar()[:2]:
        return []  # beIN sayfası sadece bu haftanın günlerini veriyor
    kayit = []
    for kanal in kanallar:
        sl = BEIN_SLUG.get(kanal)
        if not sl:
            continue
        try:
            sayfa = indir(f'https://www.beinsports.com.tr/yayin-akisi/{sl}/{GUN_ADI[gun.weekday()]}')
        except Exception as e:
            print(f'  beIN {sl}: {e}')
            continue
        if tarih not in sayfa:  # sayfada o günün tarihi yoksa yanlış güne bakıyoruz
            continue
        for saat, ad in re.findall(r'streaming-content_time[^"]*">(\d\d:\d\d)</span>'
                                   r'<span class="streaming-content_program[^"]*">(.*?)</span>', sayfa):
            s, d = map(int, saat.split(':'))
            kayit.append((dt.datetime(gun.year, gun.month, gun.day, s, d, tzinfo=TZ), html.unescape(ad)))
        time.sleep(0.5)
    return kayit


GENEL = {'fc', 'fk', 'sk', 'cf', 'ac', 'as', 'bk', 'basket', 'club', 'the', 'united', 'city', 'real',
         'sporting', 'spor', 'athletic', 'atletico', 'sc', 'afc'}


def kelimeler(s):
    return {k[:5] for k in re.findall(r'[a-z0-9]+', kucuk(s).translate(ASCII)) if len(k) >= 4 and k not in GENEL}


def eslesir(olay, zaman, baslik):
    bas = dt.datetime.fromisoformat(olay['kickoff'])
    if abs((bas - zaman).total_seconds()) > 15 * 60:
        return False
    if olay.get('home'):
        b = kelimeler(baslik)
        return bool(kelimeler(olay['home']) & b) or bool(kelimeler(olay['away']) & b)
    # Takımsız etkinlik (MotoGP antrenmanı vb.): başlık organizasyon adında geçiyor mu
    sik = lambda x: re.sub(r'[^a-z0-9]', '', kucuk(x).translate(ASCII))
    return len(sik(baslik)) >= 5 and sik(baslik) in sik(olay['competition'] + olay.get('title', ''))


def dogrula(olaylar, tarih, ssport):
    bein_kanallari = sorted({k for o in olaylar for k in o['broadcasters'] if k in BEIN_SLUG})
    bein = bein_akisi(tarih, bein_kanallari) if bein_kanallari else []
    sayac = 0
    for o in olaylar:
        if o['verification'] != 'tek_kaynak':
            continue
        kaynaklar = []
        if any(re.match(r's sport( \d)?$', k, re.I) for k in o['broadcasters']) and \
                any(eslesir(o, z, b) for z, b in ssport):
            kaynaklar.append('ssport.tv')
        if any(k in BEIN_SLUG for k in o['broadcasters']) and any(eslesir(o, z, b) for z, b in bein):
            kaynaklar.append('beinsports.com.tr')
        if kaynaklar:
            o['verification'] = 'dogrulandi'
            o['sources'] += kaynaklar
            sayac += 1
    return sayac


# ------------------------------------------------------------------ yazma

def yaz(tarih, olaylar, kaynaklar):
    simdi = dt.datetime.now(TZ).isoformat(timespec='seconds')
    veri = {'date': tarih, 'generatedAt': simdi, 'sources': kaynaklar, 'events': olaylar}
    govde = json.dumps(veri, ensure_ascii=False, indent=1)
    VERI.mkdir(exist_ok=True)
    yol = VERI / f'{tarih}.js'
    yol.write_text(f'/* Otomatik üretildi: scripts/veri_cek.py ({simdi}) */\nGM_REGISTER_DAY({govde});\n',
                   encoding='utf-8')
    return yol


def eskileri_sil(bugun):
    sinir = bugun - dt.timedelta(days=SAKLA_GUN)
    for f in VERI.glob('????-??-??.js'):
        try:
            if dt.date.fromisoformat(f.stem) < sinir:
                f.unlink()
        except ValueError:
            pass


def main(argv):
    html_dosya, gun_sayisi, tarayicisiz = None, GUN_SAYISI, False
    if '--html' in argv:
        i = argv.index('--html'); html_dosya = argv[i + 1]; argv = argv[:i] + argv[i + 2:]
    if '--gun' in argv:
        i = argv.index('--gun'); gun_sayisi = int(argv[i + 1]); argv = argv[:i] + argv[i + 2:]
    if '--sadece-bugun' in argv:
        argv.remove('--sadece-bugun'); tarayicisiz = True

    bugun = dt.datetime.now(TZ).date()
    tarihler = argv or [(bugun + dt.timedelta(days=n)).isoformat() for n in range(gun_sayisi + 1)]

    # 1) sporekrani sayfaları
    sayfalar = {}
    if html_dosya:
        sayfalar = {tarihler[0]: Path(html_dosya).read_text(encoding='utf-8')}
    else:
        if not tarayicisiz and len(tarihler) > 1:
            try:
                sayfalar = sporekrani_tarayici(tarihler)
            except Exception as e:
                print(f'UYARI: görünmez tarayıcı çalışmadı ({type(e).__name__}: {e}). Sadece bugün çekilecek.')
        if bugun.isoformat() in tarihler and bugun.isoformat() not in sayfalar:
            try:
                s = sporekrani_bugun()
                if sayfa_gunu(s):
                    sayfalar[sayfa_gunu(s)] = s
            except Exception as e:
                print(f'HATA bugün: {e}')

    # 2) doğrulama kaynağı (bir kez)
    ssport = []
    if not html_dosya:
        try:
            ssport = ssport_akisi(sayfalar.pop('__ssport__', None))
        except Exception as e:
            print(f'UYARI: S Sport akışı okunamadı ({e}); doğrulamasız devam.')

    # 3) günleri yaz
    hata = False
    for tarih in tarihler:
        sayfa = sayfalar.get(tarih)
        if not sayfa:
            if tarih == bugun.isoformat():
                print(f'HATA {tarih}: sayfa alınamadı. Mevcut dosyaya dokunulmadı.')
                hata = True
            continue
        olaylar, atlanan = ayikla(sayfa, tarih)
        if not olaylar:
            print(f'HATA {tarih}: sayfadan hiç maç çıkmadı (site düzeni değişmiş olabilir). Dosyaya dokunulmadı.')
            hata = hata or tarih == bugun.isoformat()
            continue
        dogrulanan = 0 if html_dosya else dogrula(olaylar, tarih, ssport)
        kaynaklar = [{'name': 'sporekrani.com', 'url': f'{SE}/home/day/{tarih}'}]
        if dogrulanan:
            kaynaklar += [{'name': 'ssport.tv', 'url': 'https://www.ssport.tv/yayin-akisi'},
                          {'name': 'beinsports.com.tr', 'url': 'https://www.beinsports.com.tr/yayin-akisi'}]
        yol = yaz(tarih, olaylar, kaynaklar)
        print(f'{tarih}: {len(olaylar)} karşılaşma, {dogrulanan} doğrulandı → {yol.relative_to(KOK)}' +
              (f' ({atlanan} satır okunamadı)' if atlanan else ''))
    if not html_dosya:
        eskileri_sil(bugun)
    return 1 if hata else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
