/* Sabit başvuru verileri: spor kategorileri, yayıncı grupları, Türk takımları,
   "öne çıkanlar" puanlaması. Günlük maç verisi burada DEĞİL, data/YYYY-AA-GG.js içinde. */
window.GM = window.GM || {};

GM.TZ = 'Europe/Istanbul';

// Ad karşılaştırması için: Türkçe küçük harf + ı/i farkı yok sayılır.
// ("Inter" Türkçe küçültülünce "ınter" olur; "inter" ile eşleşmesi için gerekli.)
GM.fold = function (s) {
  return String(s || '').toLocaleLowerCase('tr').replace(/ı/g, 'i').trim();
};

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
  var names = GM.fold([ev.home, ev.away, ev.title].filter(Boolean).join(' '));
  return GM.TURK_TAKIMLARI.some(function (t) { return names.indexOf(GM.fold(t)) !== -1; });
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
  { id: 'sultanlar-ligi', label: 'Sultanlar Ligi' },
  { id: 'efeler-ligi', label: 'Efeler Ligi' },
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
  'grand-slam': '#37b24d',      // çimen yeşili
  'sultanlar-ligi': '#f783ac',  // gül
  'efeler-ligi': '#63e6be'      // su yeşili
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

// ---------------------------------------------------------------- Önerilen maçlar
// Büyük kulüpler (spora göre) ve tarihi derbiler. Takım tercihi değil: köklü kulüpler ve
// bilinen rekabetler. Adlar sporekrani'deki yazılışa göre, küçük harf; ad içinde kelime
// olarak geçmesi yeter ("bayern" → "Bayern Münih"). Eklemek/çıkarmak serbest.
GM.BIG_CLUBS = {
  'futbol': [
    'galatasaray', 'fenerbahçe', 'beşiktaş', 'trabzonspor',
    'manchester city', 'manchester utd', 'manchester united', 'liverpool', 'arsenal', 'chelsea', 'tottenham',
    'real madrid', 'barcelona', 'atletico madrid', 'atlético madrid',
    'inter', 'milan', 'juventus', 'napoli', 'roma',
    'bayern', 'dortmund', 'leverkusen',
    'psg', 'paris saint germain', 'paris saint-germain', 'marseille', 'marsilya',
    'benfica', 'porto', 'sporting lisbon', 'sporting cp', 'ajax', 'psv', 'feyenoord', 'celtic', 'rangers',
    'boca juniors', 'river plate', 'flamengo', 'palmeiras',
    'arjantin', 'brezilya', 'fransa', 'almanya', 'ingiltere', 'ispanya', 'italya', 'portekiz', 'hollanda'
  ],
  'basketbol': [
    'fenerbahçe', 'anadolu efes', 'galatasaray', 'beşiktaş',
    'real madrid', 'barcelona', 'olympiakos', 'olympiacos', 'panathinaikos', 'partizan',
    'kızılyıldız', 'crvena zvezda', 'zalgiris', 'maccabi tel aviv', 'monaco', 'virtus bologna', 'olimpia milano',
    'lakers', 'celtics', 'warriors', 'knicks', 'bulls', 'heat', 'spurs'
  ],
  'amerikan futbolu': ['chiefs', 'cowboys', 'eagles', 'packers', '49ers', 'patriots', 'steelers', 'bills', 'ravens'],
  'voleybol': ['vakıfbank', 'eczacıbaşı', 'fenerbahçe', 'galatasaray', 'halkbank', 'ziraat bankası']
};
// Aynı adı taşıyan ama kastedilmeyen takımlar.
GM.NOT_BIG = ['inter miami', 'inter turku', 'queens park rangers', 'sporting kansas', 'sporting gijon',
  'sporting cristal', 'real madrid castilla', 'milan futuro', 'arsenal tula', 'new york rangers',
  'fenerbahçe koleji'];

// Tarihi derbiler / rekabetler: [spor, A takımı adları, B takımı adları, derbinin adı]
GM.RIVALRIES = [
  ['futbol', ['galatasaray'], ['fenerbahçe'], 'Kıtalararası Derbi'],
  ['futbol', ['galatasaray'], ['beşiktaş'], 'Derbi'],
  ['futbol', ['fenerbahçe'], ['beşiktaş'], 'Derbi'],
  ['futbol', ['trabzonspor'], ['galatasaray', 'fenerbahçe', 'beşiktaş'], 'Derbi'],
  ['futbol', ['göztepe'], ['karşıyaka'], 'İzmir Derbisi'],
  ['futbol', ['real madrid'], ['barcelona'], 'El Clásico'],
  ['futbol', ['real madrid'], ['atletico madrid', 'atlético madrid'], 'Madrid Derbisi'],
  ['futbol', ['barcelona'], ['espanyol'], 'Katalonya Derbisi'],
  ['futbol', ['sevilla'], ['real betis', 'betis'], 'Sevilla Derbisi'],
  ['futbol', ['athletic bilbao', 'athletic club'], ['real sociedad'], 'Bask Derbisi'],
  ['futbol', ['manchester utd', 'manchester united'], ['manchester city'], 'Manchester Derbisi'],
  ['futbol', ['liverpool'], ['everton'], 'Merseyside Derbisi'],
  ['futbol', ['liverpool'], ['manchester utd', 'manchester united'], 'Kuzeybatı Derbisi'],
  ['futbol', ['arsenal'], ['tottenham'], 'Kuzey Londra Derbisi'],
  ['futbol', ['chelsea'], ['arsenal', 'tottenham'], 'Londra Derbisi'],
  ['futbol', ['inter'], ['milan'], 'Milano Derbisi'],
  ['futbol', ['juventus'], ['inter'], "Derby d'Italia"],
  ['futbol', ['juventus'], ['torino'], 'Torino Derbisi'],
  ['futbol', ['roma'], ['lazio'], 'Roma Derbisi'],
  ['futbol', ['napoli'], ['roma', 'juventus'], 'Klasik'],
  ['futbol', ['bayern'], ['dortmund'], 'Der Klassiker'],
  ['futbol', ['dortmund'], ['schalke'], 'Revierderby'],
  ['futbol', ['psg', 'paris saint germain', 'paris saint-germain'], ['marseille', 'marsilya'], 'Le Classique'],
  ['futbol', ['benfica'], ['porto'], 'O Clássico'],
  ['futbol', ['benfica'], ['sporting lisbon', 'sporting cp'], 'Lizbon Derbisi'],
  ['futbol', ['porto'], ['sporting lisbon', 'sporting cp'], 'Klasik'],
  ['futbol', ['ajax'], ['feyenoord'], 'De Klassieker'],
  ['futbol', ['ajax'], ['psv'], 'Klasik'],
  ['futbol', ['celtic'], ['rangers'], 'Old Firm'],
  ['futbol', ['olympiakos', 'olympiacos'], ['panathinaikos'], 'Ezeli Rakipler Derbisi'],
  ['futbol', ['boca juniors'], ['river plate'], 'Superclásico'],
  ['futbol', ['arjantin'], ['brezilya'], 'Güney Amerika Klasiği'],
  ['futbol', ['ingiltere'], ['almanya'], 'Klasik'],
  ['basketbol', ['fenerbahçe'], ['anadolu efes', 'galatasaray', 'beşiktaş'], 'Derbi'],
  ['basketbol', ['anadolu efes'], ['galatasaray'], 'Derbi'],
  ['basketbol', ['olympiakos', 'olympiacos'], ['panathinaikos'], 'Ezeli Rakipler Derbisi'],
  ['basketbol', ['real madrid'], ['barcelona'], 'El Clásico'],
  ['basketbol', ['partizan'], ['kızılyıldız', 'crvena zvezda'], 'Belgrad Derbisi'],
  ['basketbol', ['maccabi tel aviv'], ['hapoel tel aviv'], 'Tel Aviv Derbisi'],
  ['basketbol', ['celtics'], ['lakers'], 'NBA Klasiği'],
  ['amerikan futbolu', ['bears'], ['packers'], 'NFL Klasiği'],
  ['amerikan futbolu', ['cowboys'], ['eagles', 'commanders', 'giants'], 'NFC Doğu Rekabeti'],
  ['amerikan futbolu', ['steelers'], ['ravens'], 'AFC Kuzey Rekabeti'],
  ['amerikan futbolu', ['chiefs'], ['raiders'], 'AFC Batı Rekabeti'],
  ['amerikan futbolu', ['patriots'], ['jets'], 'AFC Doğu Rekabeti'],
  ['voleybol', ['vakıfbank'], ['eczacıbaşı'], 'Derbi'],
  ['voleybol', ['fenerbahçe'], ['galatasaray', 'vakıfbank', 'eczacıbaşı'], 'Derbi']
];

(function () {
  var HARF = 'a-z0-9çğöşüâîûéáó';
  function has(name, alias) {  // alias ad içinde ayrı kelime(ler) olarak geçiyor mu
    var n = GM.fold(name);
    alias = GM.fold(alias);
    if (GM.NOT_BIG.some(function (x) { return n.indexOf(GM.fold(x)) !== -1; })) return false;
    var i = n.indexOf(alias);
    while (i !== -1) {
      var once = i === 0 || !new RegExp('[' + HARF + ']').test(n.charAt(i - 1));
      var sonra = i + alias.length >= n.length || !new RegExp('[' + HARF + ']').test(n.charAt(i + alias.length));
      if (once && sonra) return true;
      i = n.indexOf(alias, i + 1);
    }
    return false;
  }
  function any(name, list) { return list.some(function (a) { return has(name, a); }); }

  GM.bigCount = function (ev) {
    var list = GM.BIG_CLUBS[ev.sport];
    if (!list || !ev.home) return 0;
    return (any(ev.home, list) ? 1 : 0) + (any(ev.away, list) ? 1 : 0);
  };
  GM.findRivalry = function (ev) {
    if (!ev.home) return '';
    for (var i = 0; i < GM.RIVALRIES.length; i++) {
      var r = GM.RIVALRIES[i];
      if (r[0] !== ev.sport) continue;
      if ((any(ev.home, r[1]) && any(ev.away, r[2])) || (any(ev.home, r[2]) && any(ev.away, r[1]))) return r[3];
    }
    return '';
  };
  // Kadınlar / altyapı maçı: derbi etiketi kalır ama öneri puanı düşük tutulur.
  GM.isMinor = function (ev) {
    var t = [ev.competition, ev.home, ev.away].join(' ');
    if (/u1\d|u2[0-3]|gençlik|genclik|youth|rezerv|akademi/i.test(t)) return true;
    return ev.sport !== 'voleybol' && /kad[ıi]n|women/i.test(t);  // voleybolda kadınlar ana etkinlik
  };
})();

// "Öne çıkanlar" için nesnel ağırlıklar. Takım tercihi yok; sadece organizasyonun
// düzeyi + final/derbi/Türk takımı gibi olgular.
GM.COMPETITION_WEIGHT = {
  'ucl': 100, 'milli': 95, 'super-lig': 90, 'uel': 80, 'uecl': 70, 'turkiye-kupasi': 75,
  'premier-league': 85, 'la-liga': 80, 'bundesliga': 80, 'serie-a': 78, 'ligue-1': 72,
  'nba': 80, 'euroleague': 80, 'euroleague-super-kupa': 70, 'bsl': 65, 'f1': 85,
  'ufc': 70, 'boks': 60, 'grand-slam': 90, 'atp-masters': 60, 'wta-1000': 60,
  '1-lig': 50, 'motogp': 55, 'nfl': 75, 'sultanlar-ligi': 70, 'efeler-ligi': 50
};
GM.DEFAULT_WEIGHT = 20;

GM.TAG_WEIGHT = { final: 30, derbi: 25, 'yari-final': 15, turkish: 25 };
GM.TAG_LABEL  = { final: 'Final', derbi: 'Derbi', 'yari-final': 'Yarı final', turkish: 'Türk takımı' };

// Maç süresi (dk). Canlı veri yoksa durum bu sürelere göre saatten tahmin edilir.
GM.DURATION_MIN = { futbol: 115, basketbol: 135, tenis: 150, hentbol: 90, voleybol: 120, 'amerikan futbolu': 200 };
GM.DEFAULT_DURATION_MIN = 120;
