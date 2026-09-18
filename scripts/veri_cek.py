#!/usr/bin/env python3
"""sporekrani.com'un günlük yayın listesinden data/YYYY-AA-GG.js üretir.

Sadece Python standart kütüphanesi; API anahtarı yok.
Kullanım:
    python3 scripts/veri_cek.py                 # bugün (Türkiye saati)
    python3 scripts/veri_cek.py 2026-09-18      # belirli gün

Not: sporekrani sadece BUGÜNÜN listesini sayfanın içinde verir; /home/day/<tarih> adresi de
bugünü döndürür (diğer günler tarayıcıda sonradan yüklenir). Bu yüzden GitHub Actions scripti
gece yarısından sonra ve gün içinde birkaç kez çalıştırır.
    python3 scripts/veri_cek.py --html sayfa.html 2026-09-18   # indirmeden, kayıtlı sayfadan (test)

Güvenlik: sayfadan hiç maç çıkmazsa (site düzeni değişti, erişim engellendi) mevcut
dosyanın üzerine YAZMAZ ve hata koduyla çıkar; GitHub Actions bunu kırmızı gösterir.
"""
import datetime as dt
import html
import json
import re
import sys
import urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo

TZ = ZoneInfo('Europe/Istanbul')
KOK = Path(__file__).resolve().parent.parent
VERI = KOK / 'data'
KAYNAK = 'sporekrani.com'
URL = 'https://www.sporekrani.com/home/day/{}'
SAKLA_GUN = 14  # bundan eski günlük dosyalar silinir

# Alınmayanlar: stüdyo programları, at yarışı, Türkiye dışı kanallar.
ATLA_SPOR = {'binicilik', 'spor', 'programlar'}
ATLA_LIG = re.compile(r'program|özet|kura çekimi')
YABANCI_KANAL_ADLARI = ['CBC Sport', 'Idman TV', 'AzTV', 'İctimai TV', 'Space TV']

BUYUK_DORT = ('galatasaray', 'fenerbahçe', 'beşiktaş', 'trabzonspor')

# Lig adı → competitionId (öne çıkanlar puanı + favori ligler bununla çalışır).
# Sıra önemli: özel olan önce.
LIG_KURALLARI = [
    (r'euroleague süper kupa', 'euroleague-super-kupa'),
    (r'euroleague', 'euroleague'),
    (r'trendyol süper lig', 'super-lig'),
    (r'trendyol 1\. lig', '1-lig'),
    (r'türkiye kupası', 'turkiye-kupasi'),
    (r'şampiyonlar ligi', 'ucl'),
    (r'avrupa ligi', 'uel'),
    (r'konferans ligi', 'uecl'),
    (r'^ingiltere premier lig', 'premier-league'),
    (r'^ispanya la liga$', 'la-liga'),
    (r'^italya serie a$', 'serie-a'),
    (r'^almanya bundesliga$', 'bundesliga'),
    (r'^fransa ligue 1$', 'ligue-1'),
    (r'^nba\b', 'nba'),
    (r'basketbol süper ligi', 'bsl'),
    (r'formula 1', 'f1'),
    (r'motogp', 'motogp'),
    (r'\bufc\b', 'ufc'),
    (r'wimbledon|roland garros|us open|avustralya açık', 'grand-slam'),
    (r'^atp\b', 'atp'),
    (r'^wta\b', 'wta'),
]
TURK_LIG = re.compile(r'trendyol|türkiye|türk telekom|tff|sultanlar|efeler|basketbol süper ligi', re.I)


def kucuk(s):
    return s.replace('I', 'ı').replace('İ', 'i').lower()


YABANCI_KANAL = {kucuk(k) for k in YABANCI_KANAL_ADLARI}


def slug(s):
    tablo = str.maketrans('çğıöşüâîû', 'cgiosuaiu')
    return re.sub(r'[^a-z0-9]+', '-', kucuk(s).translate(tablo)).strip('-')


def lig_id(lig):
    k = kucuk(lig)
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


def indir(tarih):
    istek = urllib.request.Request(URL.format(tarih), headers={
        'User-Agent': 'Mozilla/5.0 (GununMaclari; kisisel TV rehberi)',
        'Accept-Language': 'tr-TR,tr;q=0.9',
    })
    with urllib.request.urlopen(istek, timeout=30) as r:
        return r.read().decode('utf-8', 'replace')


def metin(desen, parca):
    m = re.search(desen, parca, re.S)
    return html.unescape(re.sub(r'<[^>]+>', '', m.group(1))).strip() if m else ''


def sayfa_gunu(sayfa):
    """Sayfadaki maç bağlantılarında en çok geçen tarih = sayfanın gösterdiği gün."""
    gunler = re.findall(r'href="/home/match/\d+/(\d{4})/(\d{2})/(\d{2})/', sayfa)
    if not gunler:
        return None
    sayim = {}
    for g in gunler:
        sayim['-'.join(g)] = sayim.get('-'.join(g), 0) + 1
    return max(sayim, key=sayim.get)


def ayikla(sayfa, tarih):
    satirlar = re.split(r'(?=<a href="/home/match/)', sayfa)[1:]
    olaylar, atlanan = [], 0
    for s in satirlar:
        s = s[:s.find('</a>')]
        mid = re.match(r'<a href="/home/match/(\d+)/(\d{4})/(\d{2})/(\d{2})/', s)
        m_spor = re.search(r'alt="([^"]+)"[^>]*class="[^"]*event-list__sport-icon', s)
        spor = html.unescape(m_spor.group(1)) if m_spor else ''
        saat = metin(r'class="event-list__time[^"]*"[^>]*>(.*?)</span>', s)
        ad = metin(r'class="event-list__name[^"]*"[^>]*>(.*?)</p>', s)
        lig = metin(r'class="event-list__league[^"]*"[^>]*>(.*?)</p>', s)
        masaustu = s.split('event-list__channels flex')[-1]
        kanallar = []
        for k in re.findall(r'alt="([^"]+)"', masaustu):
            k = html.unescape(k)
            if k not in kanallar:
                kanallar.append(k)

        if not (mid and saat and ad):
            atlanan += 1
            continue
        if f'{mid.group(2)}-{mid.group(3)}-{mid.group(4)}' != tarih:
            continue  # başka güne ait satır
        if kucuk(spor) in ATLA_SPOR or ATLA_LIG.search(kucuk(lig)):
            continue

        yayin_yok = any(kucuk(k) == 'yayın yok' for k in kanallar)
        kanallar = [kanal_adi(k) for k in kanallar if kucuk(k) != 'yayın yok']
        tr_kanallar = [k for k in kanallar if kucuk(k) not in YABANCI_KANAL]
        if kanallar and not tr_kanallar:
            continue  # sadece Azerbaycan vb. kanallarda

        ev, dep = (ad.split(' - ', 1) + [''])[:2] if ' - ' in ad else ('', '')
        cid = lig_id(lig)
        olay = {
            'id': 'se-' + mid.group(1),
            'sport': kucuk(spor) or 'diger',
            'competition': lig,
            'competitionId': cid,
            'kickoff': f'{tarih}T{saat}:00+03:00',
            'broadcasters': tr_kanallar,
            'verification': 'yayin_yok' if (yayin_yok and not tr_kanallar) else 'tek_kaynak',
            'sources': [KAYNAK],
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

        # Yayını olmayan maçı sadece Türk takımı varsa göster (frontend adla da kontrol eder).
        if olay['verification'] == 'yayin_yok' and not olay.get('turkish') and not tr_takimi_var(olay):
            continue
        olaylar.append(olay)
    return olaylar, atlanan


TR_TAKIM = ('galatasaray', 'fenerbahçe', 'beşiktaş', 'trabzonspor', 'başakşehir', 'anadolu efes',
            'türk telekom', 'bahçeşehir', 'tofaş', 'karşıyaka', 'vakıfbank', 'eczacıbaşı', 'türkiye')


def tr_takimi_var(olay):
    ad = kucuk(olay.get('home', '') + ' ' + olay.get('away', ''))
    return any(t in ad for t in TR_TAKIM)


def yaz(tarih, olaylar):
    simdi = dt.datetime.now(TZ).isoformat(timespec='seconds')
    veri = {
        'date': tarih,
        'generatedAt': simdi,
        'sources': [{'name': KAYNAK, 'url': URL.format(tarih)}],
        'events': olaylar,
    }
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
    html_dosya = None
    if '--html' in argv:
        i = argv.index('--html')
        html_dosya = argv[i + 1]
        argv = argv[:i] + argv[i + 2:]
    bugun = dt.datetime.now(TZ).date()
    tarihler = argv or [bugun.isoformat()]

    hata = False
    for tarih in tarihler:
        try:
            sayfa = Path(html_dosya).read_text(encoding='utf-8') if html_dosya else indir(tarih)
            gun = sayfa_gunu(sayfa)
            if gun and gun != tarih:
                # Site henüz yeni güne geçmemiş (ya da o günü sunucuda vermiyor): hata değil, sonraki tur.
                print(f'{tarih}: sayfa şu an {gun} gününü gösteriyor, atlandı. Mevcut dosyaya dokunulmadı.')
                continue
            olaylar, atlanan = ayikla(sayfa, tarih)
        except Exception as e:  # ağ hatası vb.
            print(f'HATA {tarih}: {e}')
            hata = True
            continue
        if not olaylar:
            print(f'HATA {tarih}: sayfadan hiç maç çıkmadı (site düzeni değişmiş olabilir). Dosyaya dokunulmadı.')
            hata = True
            continue
        yol = yaz(tarih, olaylar)
        print(f'{tarih}: {len(olaylar)} karşılaşma → {yol.relative_to(KOK)}' +
              (f' ({atlanan} satır okunamadı)' if atlanan else ''))
    if not html_dosya:
        eskileri_sil(bugun)
    return 1 if hata else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
