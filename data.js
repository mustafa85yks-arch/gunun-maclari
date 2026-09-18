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
  { id: 'amerikan',  label: 'AMERİKAN FUTBOLU' },
  { id: 'diger',     label: 'DİĞER' }
];

GM.SPORT_NAMES = {
  futbol: 'Futbol', basketbol: 'Basketbol', tenis: 'Tenis', voleybol: 'Voleybol',
  hentbol: 'Hentbol', f1: 'Formula 1', motogp: 'MotoGP', ufc: 'UFC', boks: 'Boks',
  bisiklet: 'Bisiklet', golf: 'Golf', atletizm: 'Atletizm', motosiklet: 'Motosiklet',
  'amerikan futbolu': 'Amerikan Futbolu'
};

GM.sportCategory = function (sport) {
  if (sport === 'amerikan futbolu') return 'amerikan';
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
  { id: 'nfl', label: 'NFL' },
  { id: 'atp', label: 'ATP' },
  { id: 'wta', label: 'WTA' },
  { id: 'f1', label: 'Formula 1' },
  { id: 'motogp', label: 'MotoGP' },
  { id: 'ufc', label: 'UFC' }
];
// Lig renkleri: kartın zemini bu rengin açık tonu, lig adının yanındaki nokta tam tonu.
// Her lig ayrı renk. Aynı gün yan yana gelenler özellikle uzak tonlarda:
//   hafta sonu: Süper Lig / 1. Lig / Premier / La Liga / Serie A / Bundesliga / Ligue 1
//   hafta içi : Şampiyonlar / Avrupa / Konferans Ligi / EuroLeague / Türkiye Kupası
GM.LEAGUE_COLORS = {
  'super-lig': '#fcc419',       // sarı
  '1-lig': '#a9e34b',           // açık yeşil
  'turkiye-kupasi': '#d9480f',  // kiremit
  'milli': '#c92a2a',           // koyu kırmızı
  'ucl': '#364fc7',             // lacivert
  'uel': '#ff8787',             // mercan
  'uecl': '#2b8a3e',            // koyu yeşil
  'premier-league': '#4dabf7',  // gök mavisi
  'la-liga': '#ff922b',         // turuncu
  'serie-a': '#12b886',         // deniz yeşili
  'bundesliga': '#f06595',      // pembe
  'ligue-1': '#3bc9db',         // camgöbeği
  'euroleague': '#be4bdb',      // mor
  'bsl': '#94d82d',             // fıstık yeşili
  'nba': '#1c7ed6',             // mavi
  'nfl': '#5c7cfa',             // çivit
  'f1': '#fa5252',              // kırmızı
  'motogp': '#495057',          // koyu gri
  'ufc': '#868e96',             // gri
  'atp': '#1098ad',             // petrol
  'wta': '#e599f7',             // lila
  'grand-slam': '#37b24d'       // çimen yeşili
};
GM.DEFAULT_LEAGUE_COLOR = '#dee2e6';

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
  '1-lig': 50, 'motogp': 55, 'nfl': 75
};
GM.DEFAULT_WEIGHT = 20;

GM.TAG_WEIGHT = { final: 30, derbi: 25, 'yari-final': 15, turkish: 25 };
GM.TAG_LABEL  = { final: 'Final', derbi: 'Derbi', 'yari-final': 'Yarı final', turkish: 'Türk takımı' };

// Maç süresi (dk). Canlı veri yoksa durum bu sürelere göre saatten tahmin edilir.
GM.DURATION_MIN = { futbol: 115, basketbol: 135, tenis: 150, hentbol: 90, voleybol: 120, 'amerikan futbolu': 200 };
GM.DEFAULT_DURATION_MIN = 120;
