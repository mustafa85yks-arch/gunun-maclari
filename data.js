/* Sabit başvuru verileri: spor kategorileri, yayıncı grupları, Türk takımları,
   "öne çıkanlar" puanlaması. Günlük maç verisi burada DEĞİL, data/YYYY-AA-GG.js içinde. */
window.GM = window.GM || {};

GM.TZ = 'Europe/Istanbul';

// Üstteki filtre kategorileri. Buraya girmeyen her spor "diger" sayılır.
GM.CATEGORIES = [
  { id: 'tumu',      label: 'TÜMÜ' },
  { id: 'futbol',    label: 'FUTBOL' },
  { id: 'basketbol', label: 'BASKETBOL' },
  { id: 'tenis',     label: 'TENİS' },
  { id: 'diger',     label: 'DİĞER' }
];

GM.SPORT_NAMES = {
  futbol: 'Futbol', basketbol: 'Basketbol', tenis: 'Tenis', voleybol: 'Voleybol',
  hentbol: 'Hentbol', f1: 'Formula 1', motogp: 'MotoGP', ufc: 'UFC', boks: 'Boks',
  bisiklet: 'Bisiklet', golf: 'Golf', atletizm: 'Atletizm', motosiklet: 'Motosiklet'
};

GM.sportCategory = function (sport) {
  return ['futbol', 'basketbol', 'tenis'].includes(sport) ? sport : 'diger';
};

// Kanal adı → yayıncı grubu. Sıra önemli: ilk eşleşen kazanır, "diger" en sonda.
GM.BROADCASTERS = [
  { id: 'bein',       label: 'beIN SPORTS',  test: /^bein/i },
  { id: 'ssportplus', label: 'S Sport Plus', test: /^s sport plus$/i },
  { id: 'ssport',     label: 'S Sport',      test: /^s sport( \d)?$/i },
  { id: 'tivibu',     label: 'Tivibu Spor',  test: /^tivibu/i },
  { id: 'trt',        label: 'TRT',          test: /^trt/i },
  { id: 'tv85',       label: 'TV8,5',        test: /^tv ?8[,.]5$/i },
  { id: 'tv8',        label: 'TV8',          test: /^tv ?8$/i },
  { id: 'exxen',      label: 'Exxen',        test: /^exxen/i },
  { id: 'tod',        label: 'TOD',          test: /^tod\b/i },
  { id: 'diger',      label: 'Diğer',        test: /./ }
];

GM.broadcasterGroup = function (channel) {
  return GM.BROADCASTERS.find(function (b) { return b.test.test(channel); });
};

// Veride "turkish" alanı yoksa takım adından tahmin için. Küçük harf, Türkçe kurallarıyla.
GM.TURK_TAKIMLARI = [
  'galatasaray', 'fenerbahçe', 'beşiktaş', 'trabzonspor', 'başakşehir', 'kasımpaşa',
  'konyaspor', 'göztepe', 'samsunspor', 'kayserispor', 'alanyaspor', 'antalyaspor',
  'rizespor', 'sivasspor', 'eyüpspor', 'gaziantep', 'kocaelispor', 'gençlerbirliği',
  'karagümrük', 'kasımpaşa', 'bodrum', 'hatayspor', 'ankaragücü', 'bursaspor',
  'anadolu efes', 'türk telekom', 'tofaş', 'bahçeşehir', 'karşıyaka', 'pınar',
  'darüşşafaka', 'vakıfbank', 'eczacıbaşı', 'halkbank', 'ziraat bankası', 'türkiye'
];

GM.isTurkish = function (ev) {
  var names = [ev.home, ev.away, ev.title].filter(Boolean).join(' ').toLocaleLowerCase('tr');
  return GM.TURK_TAKIMLARI.some(function (t) { return names.indexOf(t) !== -1; });
};

// Favori seçim ekranındaki ligler. id = veride competitionId.
GM.LEAGUES = [
  { id: 'super-lig', label: 'Süper Lig' },
  { id: '1-lig', label: '1. Lig' },
  { id: 'turkiye-kupasi', label: 'Türkiye Kupası' },
  { id: 'milli', label: 'Milli Takım' },
  { id: 'ucl', label: 'Şampiyonlar Ligi' },
  { id: 'uel', label: 'Avrupa Ligi' },
  { id: 'uecl', label: 'Konferans Ligi' },
  { id: 'premier-league', label: 'Premier League' },
  { id: 'la-liga', label: 'La Liga' },
  { id: 'serie-a', label: 'Serie A' },
  { id: 'bundesliga', label: 'Bundesliga' },
  { id: 'ligue-1', label: 'Ligue 1' },
  { id: 'euroleague', label: 'EuroLeague' },
  { id: 'bsl', label: 'Basketbol Süper Ligi' },
  { id: 'nba', label: 'NBA' },
  { id: 'atp', label: 'ATP' },
  { id: 'wta', label: 'WTA' },
  { id: 'f1', label: 'Formula 1' },
  { id: 'motogp', label: 'MotoGP' },
  { id: 'ufc', label: 'UFC' }
];
// Alt organizasyon → favorilerde sayıldığı ana lig.
GM.LEAGUE_ALIAS = { 'euroleague-super-kupa': 'euroleague' };

// Favori takım kutusundaki öneriler (günün takımları da otomatik eklenir).
GM.POPULAR_TEAMS = [
  'Galatasaray', 'Fenerbahçe', 'Beşiktaş', 'Trabzonspor', 'Başakşehir', 'Göztepe',
  'Samsunspor', 'Kasımpaşa', 'Konyaspor', 'Anadolu Efes', 'Türk Telekom', 'Türkiye',
  'Real Madrid', 'Barcelona', 'Atlético Madrid', 'Manchester City', 'Liverpool', 'Arsenal',
  'Chelsea', 'Manchester United', 'Tottenham', 'Bayern Münih', 'Borussia Dortmund',
  'Inter', 'Milan', 'Juventus', 'Napoli', 'PSG', 'Olympiakos', 'Panathinaikos'
];

// "Öne çıkanlar" için nesnel ağırlıklar. Takım tercihi yok; sadece organizasyonun
// düzeyi + final/derbi/Türk takımı gibi olgular.
GM.COMPETITION_WEIGHT = {
  'ucl': 100, 'milli': 95, 'super-lig': 90, 'uel': 80, 'uecl': 70, 'turkiye-kupasi': 75,
  'premier-league': 85, 'la-liga': 80, 'bundesliga': 80, 'serie-a': 78, 'ligue-1': 72,
  'nba': 80, 'euroleague': 80, 'euroleague-super-kupa': 70, 'bsl': 65, 'f1': 85,
  'ufc': 70, 'boks': 60, 'grand-slam': 90, 'atp-masters': 60, 'wta-1000': 60,
  '1-lig': 50, 'motogp': 55
};
GM.DEFAULT_WEIGHT = 20;

GM.TAG_WEIGHT = { final: 30, derbi: 25, 'yari-final': 15, turkish: 25 };
GM.TAG_LABEL  = { final: 'Final', derbi: 'Derbi', 'yari-final': 'Yarı final', turkish: 'Türk takımı' };

// Maç süresi (dk). Canlı veri yoksa durum bu sürelere göre saatten tahmin edilir.
GM.DURATION_MIN = { futbol: 115, basketbol: 135, tenis: 150, hentbol: 90, voleybol: 120 };
GM.DEFAULT_DURATION_MIN = 120;
