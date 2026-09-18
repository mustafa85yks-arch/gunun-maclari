/* Arayüz: durum, filtreler, favoriler, takvime ekleme, çizim.
   Veriyi sadece GM.api.getDay() üzerinden alır. */
(function () {
  'use strict';

  var T = GM.time;
  var REFRESH_MS = 10 * 60 * 1000;  // bugünü izlerken veriyi 10 dk'da bir yeniden oku
  var TICK_MS = 30 * 1000;          // durum/geri sayım 30 sn'de bir güncellenir
  var FAV_KEY = 'gm-favoriler';
  var SORT_KEY = 'gm-sirala';
  var DAYS_AHEAD = 7;               // bugün + 7 gün; geçmiş günler gösterilmez

  var state = {
    date: null,
    followToday: true,   // "bugün"deyken gün dönünce otomatik yeni güne geç
    sport: 'tumu',
    favOnly: false,
    sortBy: loadSort(),  // 'saat' | 'lig'
    search: null,        // takım/lig araması: aranan metin (null = normal gün görünümü)
    searchResults: null, // [{date, events}]
    open: {},            // ayrıntısı açık kartlar (id → true)
    data: null,
    error: null,
    loading: false,
    loadedAt: 0
  };

  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function lc(s) { return GM.fold(s); }  // arama/favori karşılaştırması: ı/i farkı yok
  function today() { return T.dateStr(new Date()); }
  function sportNameOf(ev) {
    return GM.SPORT_NAMES[ev.sport] || (ev.sport.charAt(0).toLocaleUpperCase('tr') + ev.sport.slice(1));
  }

  function loadSort() {
    try { return localStorage.getItem(SORT_KEY) === 'lig' ? 'lig' : 'saat'; } catch (e) { return 'saat'; }
  }
  function saveSort() {
    try { localStorage.setItem(SORT_KEY, state.sortBy); } catch (e) { /* önemli değil */ }
  }

  /* ---------- Favoriler (bu tarayıcıda saklanır) ---------- */

  var favs = loadFavs();

  function loadFavs() {
    try {
      var f = JSON.parse(localStorage.getItem(FAV_KEY));
      if (f && Array.isArray(f.teams) && Array.isArray(f.leagues)) return f;
    } catch (e) { /* gizli pencere vb. */ }
    return { teams: [], leagues: [] };
  }
  function saveFavs() {
    try { localStorage.setItem(FAV_KEY, JSON.stringify(favs)); } catch (e) { /* kaydedilemese de çalışır */ }
  }

  function leagueKey(ev) { return GM.LEAGUE_ALIAS[ev.competitionId] || ev.competitionId; }

  // "Fenerbahçe" favorisi "Fenerbahçe Beko"yu da kapsar (ad içinde geçmesi yeter).
  function teamIsFav(name) {
    var n = lc(name);
    return !!n && favs.teams.some(function (t) { return n.indexOf(lc(t)) !== -1; });
  }
  function leagueIsFav(id) { return favs.leagues.indexOf(id) !== -1; }
  function isFav(ev) { return teamIsFav(ev.home) || teamIsFav(ev.away) || leagueIsFav(leagueKey(ev)); }

  function toggleTeam(name) {
    if (teamIsFav(name)) {
      var n = lc(name);
      favs.teams = favs.teams.filter(function (t) { return n.indexOf(lc(t)) === -1; });
    } else {
      favs.teams.push(name.trim());
    }
    saveFavs();
  }
  function toggleLeague(id) {
    favs.leagues = leagueIsFav(id)
      ? favs.leagues.filter(function (x) { return x !== id; })
      : favs.leagues.concat(id);
    saveFavs();
  }

  /* ---------- Durum hesabı ---------- */

  // Veri canlı durum veriyorsa onu kullan; vermiyorsa saatten tahmin et (approx=true).
  function statusOf(ev, now) {
    if (ev.status) return { state: ev.status.state, minute: ev.status.minute, approx: false };
    var start = ev.kickoff.getTime();
    var end = start + ev.durationMin * 60000;
    var t = now.getTime();
    if (t < start) return { state: 'scheduled', approx: true };
    if (t < end) return { state: 'live', approx: true };
    return { state: 'finished', approx: true };
  }
  function isLive(ev, now) {
    var s = statusOf(ev, now).state;
    return s === 'live' || s === 'halftime';
  }

  // Biten maçlar hiç gösterilmez.
  function remaining(events, now) {
    return events.filter(function (ev) { return statusOf(ev, now).state !== 'finished'; });
  }

  function countdown(ev, now) {
    var mins = Math.round((ev.kickoff - now) / 60000);
    if (mins <= 0 || mins > 24 * 60) return '';
    var h = Math.floor(mins / 60), m = mins % 60;
    return (h ? h + ' sa ' : '') + (m || !h ? m + ' dk' : '');
  }

  function statusBadge(st) {
    var approx = st.approx ? '<span class="approx" title="Canlı veri değil, saate göre tahmin">~</span>' : '';
    switch (st.state) {
      case 'live': return '<span class="live">CANLI' + (st.minute ? ' ' + esc(st.minute) + '\'' : '') + approx + '</span>';
      case 'halftime': return '<span class="live">DEVRE</span>';
      case 'postponed': return '<span class="state">ERTELENDİ</span>';
      default: return '';
    }
  }

  /* ---------- Yayıncı ---------- */

  // Kanal adı kartın sağında kutucuk: "beIN SPORTS 1" doğrudan görünür.
  function tvBlock(ev) {
    if (ev.verification === 'yayin_yok') return '<div class="tv-muted">TV yayını yok</div>';
    if (ev.verification === 'dogrulanamadi') return '<div class="tv-muted">Yayıncı doğrulanamadı</div>';
    return ev.broadcasters.map(function (ch) { return '<span class="ch">' + esc(ch) + '</span>'; }).join('') +
      (ev.verification === 'dogrulandi'
        ? '<span class="ch-ok" title="Kanalın kendi yayın akışında da var">✓ akışta var</span>' : '');
  }

  function tvShort(ev) {
    if (!ev.broadcasters.length) return '';
    return ev.broadcasters.join(' / ');
  }

  var VERIFY_TEXT = {
    dogrulandi: 'Doğrulandı: kanalın kendi yayın akışında da var',
    tek_kaynak: 'Tek kaynak',
    yayin_yok: 'Kaynağa göre Türkiye\'de TV yayını yok',
    dogrulanamadi: 'Yayıncı doğrulanamadı'
  };

  /* ---------- Kart ---------- */

  function teamSpan(name) {
    return '<span class="team' + (teamIsFav(name) ? ' fav' : '') + '">' + esc(name) + '</span>';
  }

  function matchTitle(ev) {
    if (ev.home && ev.away) return '<div class="teams">' + teamSpan(ev.home) + teamSpan(ev.away) + '</div>';
    return '<div class="teams solo"><span class="team">' + esc(ev.title || ev.home || ev.competition) + '</span></div>';
  }

  function favButtons(ev) {
    var b = [];
    [ev.home, ev.away].forEach(function (name) {
      if (!name) return;
      var on = teamIsFav(name);
      b.push('<button class="fav-btn' + (on ? ' on' : '') + '" data-fav-team="' + esc(name) + '">' +
        (on ? '★ ' : '☆ ') + esc(name) + '</button>');
    });
    var key = leagueKey(ev);
    if (key) {
      var on = leagueIsFav(key);
      b.push('<button class="fav-btn' + (on ? ' on' : '') + '" data-fav-league="' + esc(key) + '">' +
        (on ? '★ ' : '☆ ') + esc(ev.competition) + '</button>');
    }
    return b.join('');
  }

  function card(ev, now) {
    var st = statusOf(ev, now);
    var cd = st.state === 'scheduled' && T.dateStr(ev.kickoff) === today() ? countdown(ev, now) : '';
    var sportName = sportNameOf(ev);
    var statusText = st.state === 'scheduled' ? 'Başlamadı' :
      st.state === 'live' ? 'Canlı' : st.state === 'halftime' ? 'Devre arası' :
      st.state === 'postponed' ? 'Ertelendi' : 'Tamamlandı';
    if (st.approx) statusText += ' (saate göre tahmin, canlı veri değil)';
    var compFav = leagueIsFav(leagueKey(ev));

    return '<article data-id="' + esc(ev.id) + '" style="--lc:' + leagueColor(ev) + '" class="card' +
        (state.open[ev.id] ? ' open' : '') + '">' +
      // Lig adı kartın en üstünde: maçın hangi lige ait olduğu ilk bakışta okunsun.
      '<div class="comp' + (compFav ? ' fav' : '') + '">' + esc(ev.competition) +
        (ev.home && ev.title ? ' · ' + esc(ev.title) : '') +
        (ev.category === 'diger' ? ' · ' + esc(sportName) : '') + '</div>' +
      '<div class="c-time"><span class="time">' + T.hm(ev.kickoff) + '</span>' + statusBadge(st) +
        (cd ? '<span class="countdown">' + cd + '</span>' : '') + '</div>' +
      '<div class="c-main">' + matchTitle(ev) +
        (ev.rivalry ? '<div class="derby">⚔ ' + esc(ev.rivalry) + '</div>' : '') +
      '</div>' +
      '<div class="c-tv">' + tvBlock(ev) + '</div>' +
      '<div class="c-detail"><dl>' +
        '<dt>Spor</dt><dd>' + esc(sportName) + '</dd>' +
        '<dt>Durum</dt><dd>' + statusText + '</dd>' +
        '<dt>Yayın</dt><dd>' + (ev.broadcasters.length ? esc(ev.broadcasters.join(', ')) : '—') + '</dd>' +
        '<dt>Doğrulama</dt><dd>' + VERIFY_TEXT[ev.verification] + '</dd>' +
        '<dt>Kaynak</dt><dd>' + (ev.sources.length ? esc(ev.sources.join(', ')) : '—') + '</dd>' +
        (ev.note ? '<dt>Not</dt><dd>' + esc(ev.note) + '</dd>' : '') +
      '</dl><div class="fav-row">' +
        (st.state === 'scheduled' ? '<button class="cal-btn" data-cal="' + esc(ev.id) + '">📅 Takvime ekle</button>' : '') +
        favButtons(ev) + '</div></div>' +
    '</article>';
  }

  // Her ligin rengi var: büyükler data.js'te elle seçili, geri kalanlar adından türetilir
  // (aynı lig her gün aynı renk). Gri, "renksiz" kart kalmasın diye.
  function leagueColor(ev) {
    var key = leagueKey(ev) || ev.competition;
    if (GM.LEAGUE_COLORS[key]) return GM.LEAGUE_COLORS[key];
    var h = 0;
    for (var i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 360;
    return 'hsl(' + h + ' 62% 58%)';
  }

  function cards(list, now) {
    return '<div class="cards">' + list.map(function (e) { return card(e, now); }).join('') + '</div>';
  }

  // Önerilen maçlar: yatay kayan küçük kartlar. Dokununca listedeki asıl karta gider.
  function hlCard(ev, now) {
    var st = statusOf(ev, now);
    return '<button class="hl" data-goto="' + esc(ev.id) + '" style="--lc:' + leagueColor(ev) + '">' +
      '<div class="comp">' + esc(ev.competition) + '</div>' +
      '<div class="hl-top"><span class="time">' + T.hm(ev.kickoff) + '</span>' + statusBadge(st) + '</div>' +
      '<div class="hl-teams"><span>' + esc(ev.home) + '</span><span>' + esc(ev.away) + '</span></div>' +
      (ev.rivalry ? '<span class="derby">⚔ ' + esc(ev.rivalry) + '</span>' : '') +
      '<div class="hl-tv">' + esc(tvShort(ev)) + '</div>' +
    '</button>';
  }

  /* ---------- Takvime ekle (.ics) ---------- */
  // Sunucu yok: dosya telefonda üretilir, hatırlatmayı telefonun takvimi yapar.

  var REMIND_MIN = 15;

  function findEvent(id) {
    var days = (state.data ? [state.data] : []).concat(state.searchResults || []);
    for (var i = 0; i < days.length; i++) {
      for (var j = 0; j < days[i].events.length; j++) if (days[i].events[j].id === id) return days[i].events[j];
    }
    return null;
  }

  function icsDate(d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
  function icsText(s) { return String(s).replace(/\\/g, '\\\\').replace(/[;,]/g, '\\$&').replace(/\n/g, '\\n'); }

  // RFC 5545: satır 75 baytı geçmesin (Türkçe harf 2 bayt, harf ortadan bölünmesin).
  function icsFold(line) {
    var out = '', bytes = 0, chars = Array.from(line);
    for (var i = 0; i < chars.length; i++) {
      var ch = chars[i], n = unescape(encodeURIComponent(ch)).length;
      if (bytes + n > 74) { out += '\r\n '; bytes = 1; }
      out += ch; bytes += n;
    }
    return out;
  }

  function makeIcs(ev) {
    var title = ev.home && ev.away ? ev.home + ' – ' + ev.away : (ev.title || ev.competition);
    var tv = ev.broadcasters.join(' / ');
    var end = new Date(ev.kickoff.getTime() + ev.durationMin * 60000);
    return [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Gunun Maclari//TR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:' + icsText(ev.id + '-' + T.dateStr(ev.kickoff)) + '@gunun-maclari',
      'DTSTAMP:' + icsDate(new Date()),
      'DTSTART:' + icsDate(ev.kickoff),
      'DTEND:' + icsDate(end),
      'SUMMARY:' + icsText(title + (tv ? ' (' + tv + ')' : '')),
      'LOCATION:' + icsText(tv || 'TV bilgisi yok'),
      'DESCRIPTION:' + icsText(ev.competition + (tv ? '\nYayın: ' + tv : '') + '\nGünün Maçları'),
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT' + REMIND_MIN + 'M',
      'DESCRIPTION:' + icsText(title + ' ' + REMIND_MIN + ' dk sonra' + (tv ? ' · ' + tv : '')),
      'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'
    ].map(icsFold).join('\r\n') + '\r\n';
  }

  function addToCalendar(id) {
    var ev = findEvent(id);
    if (!ev) return;
    var name = (ev.home && ev.away ? ev.home + '-' + ev.away : ev.title || ev.competition)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    var url = URL.createObjectURL(new Blob([makeIcs(ev)], { type: 'text/calendar;charset=utf-8' }));
    var a = document.createElement('a');
    a.href = url; a.download = name + '.ics';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
  }

  /* ---------- Filtre + seçim ---------- */

  function filtersActive() { return state.sport !== 'tumu' || state.favOnly; }

  function passes(ev) {
    if (state.sport !== 'tumu' && ev.category !== state.sport) return false;
    if (state.favOnly && !isFav(ev)) return false;
    return true;
  }

  // Önerilen maçlar puanı: takımlar ligden daha çok belirler (Chelsea maçı sıradan bir
  // Süper Lig maçının önüne geçer, Trabzonspor–Galatasaray hepsinin önüne).
  function score(ev) {
    var s = (GM.COMPETITION_WEIGHT[ev.competitionId] || GM.DEFAULT_WEIGHT) * 0.5;
    var bonus = ev.bigCount * 35;
    if (ev.rivalry || ev.tags.indexOf('derbi') !== -1) bonus += 40;
    if (ev.minor) bonus *= 0.4;  // kadınlar/altyapı derbisi etiketlenir ama öne geçmez
    s += bonus;
    if (ev.tags.indexOf('final') !== -1) s += 30;
    if (ev.tags.indexOf('yari-final') !== -1) s += 15;
    if (ev.turkish) s += 10;
    return s;
  }

  // En fazla 5; sadece TV'de olan maçlar. Favoriler burayı etkilemez (taraf tutmaz).
  function highlights(events) {
    return events
      .filter(function (ev) { return ev.home && ev.broadcasters.length; })
      .map(function (ev) { return { ev: ev, s: score(ev) }; })
      .sort(function (a, b) { return b.s - a.s || a.ev.kickoff - b.ev.kickoff; })
      .slice(0, 5)
      .map(function (x) { return x.ev; })
      .sort(function (a, b) { return a.kickoff - b.kickoff; });
  }

  /* ---------- Çizim ---------- */

  var wdShort = new Intl.DateTimeFormat('tr-TR', { timeZone: 'UTC', weekday: 'short' });
  function dayParts(str) {
    var a = str.split('-').map(Number);
    var d = new Date(Date.UTC(a[0], a[1] - 1, a[2], 12));
    return { wd: wdShort.format(d).replace('.', ''), day: a[2] };
  }

  function renderDays() {
    var t = today(), html = '';
    for (var i = 0; i <= DAYS_AHEAD; i++) {
      var d = T.addDays(t, i), p = dayParts(d);
      var top = i === 0 ? 'Bugün' : p.wd;
      var on = !state.search && state.date === d;
      html += '<button class="day' + (on ? ' on' : '') + '" data-day="' + d + '"' + (on ? ' aria-current="date"' : '') + '>' +
        '<b>' + top + '</b><small>' + p.day + ' ' + T.shortDate(d).split(' ')[1].slice(0, 3) + '</small></button>';
    }
    $('days').innerHTML = html;
    var cur = $('days').querySelector('.day.on');
    if (cur && !renderDays.done) { cur.scrollIntoView({ inline: 'center', block: 'nearest' }); renderDays.done = true; }
  }

  function renderHeader() {
    document.title = 'Günün Maçları · ' + T.longDate(state.date);
    var n = favs.teams.length + favs.leagues.length;
    $('favBtn').innerHTML = '★' + (n ? '<span class="n">' + n + '</span>' : '');
    $('searchBtn').classList.toggle('on', !$('searchForm').hidden);
    renderDays();
  }

  function chip(label, on, attrs, count) {
    return '<button class="chip' + (on ? ' on' : '') + '" ' + attrs + ' aria-pressed="' + on + '">' +
      esc(label) + (count != null ? '<span class="n">' + count + '</span>' : '') + '</button>';
  }

  function renderFilters(events) {
    var favN = events.filter(isFav).length;
    $('filters').innerHTML = GM.CATEGORIES.map(function (c) {
      var n = c.id === 'tumu' ? events.length : events.filter(function (e) { return e.category === c.id; }).length;
      if (c.id !== 'tumu' && !n && state.sport !== c.id) return '';
      return chip(c.label, state.sport === c.id, 'data-sport="' + c.id + '"', n);
    }).join('') +
      (favN || state.favOnly ? chip('★ FAVORİLERİM', state.favOnly, 'data-toggle="favOnly"', favN) : '');
  }

  function section(title, sub, html, right) {
    return '<section class="sec"><div class="sec-head"><h2>' + esc(title) + (sub ? ' <span>' + esc(sub) + '</span>' : '') +
      '</h2>' + (right || '') + '</div>' + html + '</section>';
  }

  function sumLine(all, events, now) {
    var onTv = events.filter(function (e) { return e.broadcasters.length; }).length;
    var live = events.filter(function (e) { return isLive(e, now); }).length;
    var kalan = events.length < all.length ? ' kalan' : '';
    return '<p class="sumline"><b>' + esc(T.longDate(state.date).replace(/ \d{4}/, '')) + '</b> · TV\'de' + kalan + ' ' +
      onTv + ' karşılaşma' + (live ? ' · <span class="livecount">' + live + ' canlı</span>' : '') + '</p>';
  }

  function renderContent(all, events, now) {
    var list = events.filter(passes);
    var html = sumLine(all, events, now);

    // Uzak günlerde kanallar programı henüz tamamlamamış olur; liste yaklaştıkça dolar.
    if (state.date > T.addDays(today(), 2)) {
      html += '<p class="notice">Bu günün programı henüz kesinleşmedi. Kanallar yayınları yaklaştıkça ekliyor; ' +
        'liste her gün birkaç kez güncellenir.</p>';
    }

    if (!filtersActive()) {
      var fav = events.filter(isFav);
      if (fav.length) html += section('★ Favorilerim', fav.length + '', cards(fav, now));

      var hl = highlights(events);
      if (hl.length) html += section('Bunları Kaçırma', 'derbiler ve büyük takımlar',
        '<div class="scroller hl-row">' + hl.map(function (e) { return hlCard(e, now); }).join('') + '</div>');
    }

    var empty = !events.length && all.length
      ? 'Bu günün karşılaşmaları tamamlandı.'
      : state.favOnly && !favs.teams.length && !favs.leagues.length
        ? 'Henüz favori seçmedin. Sağ üstteki ★ düğmesinden takım veya lig ekle.'
        : 'Bu filtreye uyan karşılaşma yok.';

    var sortCtl = list.length ? '<div class="sort" role="group" aria-label="Sıralama">' +
      chip('Saat', state.sortBy === 'saat', 'data-sort="saat"') +
      chip('Lig', state.sortBy === 'lig', 'data-sort="lig"') + '</div>' : '';
    var hlRow = document.querySelector('.hl-row'), hlScroll = hlRow ? hlRow.scrollLeft : 0;
    html += '<div id="allList"' + (state.sortBy === 'lig' ? ' class="by-league"' : '') + '>' + section(filtersActive() ? 'Filtrelenmiş' : 'Tüm Maçlar',
      list.length ? list.length + '' : '',
      list.length
        ? (state.sortBy === 'lig' ? byLeague(list, now) : byTime(list, now))
        : '<p class="empty">' + empty + '</p>', sortCtl) + '</div>';

    $('content').innerHTML = html;
    // 30 sn'lik yenilemede Önerilen şeridi başa sarmasın.
    if (hlScroll && (hlRow = document.querySelector('.hl-row'))) hlRow.scrollLeft = hlScroll;
  }

  // Saate göre: şu an oynananlar ayrı başlık altında, sonra sıradakiler.
  function byTime(list, now) {
    var live = list.filter(function (e) { return isLive(e, now); });
    var next = list.filter(function (e) { return !isLive(e, now); });
    if (!live.length) return cards(next, now);
    return '<div class="grp live-grp">Şu an yayında <span class="n">' + live.length + '</span></div>' + cards(live, now) +
      (next.length ? '<div class="grp">Sıradaki <span class="n">' + next.length + '</span></div>' + cards(next, now) : '');
  }

  // Lige göre: ligler önem sırasıyla (ağırlık), aynı ağırlıkta ada göre; lig içinde saat sırası.
  function byLeague(list, now) {
    var groups = {}, order = [];
    list.forEach(function (ev) {
      var key = ev.competition;  // turnuva adı: WTA São Paulo ile WTA Guadalajara ayrı başlık
      if (!groups[key]) { groups[key] = { label: ev.competition, id: leagueKey(ev), ev: ev, items: [] }; order.push(key); }
      groups[key].items.push(ev);
    });
    order.sort(function (a, b) {
      var wa = GM.COMPETITION_WEIGHT[groups[a].id] || GM.DEFAULT_WEIGHT;
      var wb = GM.COMPETITION_WEIGHT[groups[b].id] || GM.DEFAULT_WEIGHT;
      return wb - wa || groups[a].label.localeCompare(groups[b].label, 'tr');
    });
    return order.map(function (key) {
      var g = groups[key];
      return '<div class="grp lg" style="--lc:' + leagueColor(g.ev) + '">' + esc(g.label) +
        ' <span class="n">' + g.items.length + '</span></div>' + cards(g.items, now);
    }).join('');
  }

  function renderMeta(d) {
    var src = d.sources.map(function (s) {
      return s.url ? '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.name) + '</a>' : esc(s.name);
    }).join(', ');
    $('meta').innerHTML =
      '<p>Veri: ' + esc(d.providerLabel) +
      (d.generatedAt ? ' · Derlendi: ' + T.shortDate(T.dateStr(d.generatedAt)) + ' ' + T.hm(d.generatedAt) : '') +
      (src ? ' · Kaynaklar: ' + src : '') + '</p>' +
      '<p>Saatler Türkiye saatidir (TSİ). Biten karşılaşmalar gösterilmez. Karta dokununca ayrıntı ve favori düğmeleri açılır. ' +
      '“CANLI~”: canlı veri değil, başlama saatine göre tahmin. ' +
      '“✓ akışta var”: maç kanalın kendi yayın akışında da var.</p>' +
      (d.dropped ? '<p>' + d.dropped + ' kayıt başka güne ait olduğu için gösterilmedi.</p>' : '');
  }

  function renderError() {
    $('filters').innerHTML = '';
    var future = state.date > today();
    $('content').innerHTML =
      '<div class="error"><p class="error-title">' +
        (future ? 'Bu günün programı henüz yayınlanmadı.' : 'Maç bilgileri şu anda güncellenemiyor.') + '</p>' +
      '<p class="error-detail">' +
        (future ? 'Liste o gün gece yarısından sonra otomatik hazırlanır.' : esc(state.error)) + '</p>' +
      '<button class="pill-btn" id="retryBtn">Tekrar dene</button></div>';
    $('meta').innerHTML = '';
  }

  /* ---------- Takım / lig araması (bugün + 7 gün) ---------- */

  function matchesQuery(ev, q) {
    q = lc(q);
    return [ev.home, ev.away, ev.title, ev.competition].some(function (x) { return lc(x).indexOf(q) !== -1; });
  }

  function runSearch(q) {
    q = (q || '').trim();
    if (q.length < 2) return;
    state.search = q;
    state.searchResults = null;
    render();
    var dates = [];
    for (var i = 0; i <= DAYS_AHEAD; i++) dates.push(T.addDays(today(), i));
    Promise.all(dates.map(function (d) {
      return GM.api.getDay(d).then(function (x) { return x; }, function () { return null; });
    })).then(function (days) {
      if (state.search !== q) return;  // bu arada başka arama yapıldı
      state.searchResults = days.filter(Boolean);
      fillSuggest();
      render();
    });
  }

  function closeSearch() {
    state.search = null; state.searchResults = null;
    $('searchInput').value = '';
    $('searchForm').hidden = true;
    render();
  }

  function renderSearch(now) {
    var q = state.search;
    $('filters').innerHTML = '';
    $('meta').innerHTML = '';
    var teamFav = teamIsFav(q);
    var head = '<div class="search-head">' +
      '<button class="pill-btn" id="searchClose">← Günün listesine dön</button>' +
      '<button class="fav-btn' + (teamFav ? ' on' : '') + '" data-fav-team="' + esc(q) + '">' +
        (teamFav ? '★ ' : '☆ ') + esc(q) + (teamFav ? ' favorilerde' : ' favorilere ekle') + '</button></div>';

    if (!state.searchResults) {
      $('content').innerHTML = head + '<p class="sumline"><b>“' + esc(q) + '”</b> aranıyor…</p>';
      return;
    }
    var total = 0, html = '';
    state.searchResults.forEach(function (d) {
      var list = remaining(d.events, now).filter(function (ev) { return matchesQuery(ev, q); });
      if (!list.length) return;
      total += list.length;
      var label = d.date === today() ? 'Bugün' : d.date === T.addDays(today(), 1) ? 'Yarın' : '';
      html += section(T.longDate(d.date).replace(/ \d{4}/, ''), (label ? label + ' · ' : '') + list.length, cards(list, now));
    });
    var last = T.shortDate(T.addDays(today(), DAYS_AHEAD));
    $('content').innerHTML = head +
      '<p class="sumline"><b>“' + esc(q) + '”</b> · ' + total + ' karşılaşma · bugünden ' + last + '’e kadar</p>' +
      (html || '<p class="empty">Bu tarihler arasında “' + esc(q) + '” için TV’de karşılaşma bulunamadı. ' +
        'Takım adının bir kısmını yazmak yeterli (ör. “Fener”).</p>');
  }

  // Arama ve favori kutularındaki öneri listesi: popüler takımlar + yüklü günlerdeki takımlar.
  function fillSuggest() {
    var names = GM.POPULAR_TEAMS.slice();
    var days = (state.searchResults || []).concat(state.data ? [state.data] : []);
    days.forEach(function (d) {
      d.events.forEach(function (ev) {
        [ev.home, ev.away].forEach(function (n) { if (n && names.indexOf(n) === -1) names.push(n); });
      });
    });
    $('teamSuggest').innerHTML = names.sort(function (a, b) { return a.localeCompare(b, 'tr'); })
      .map(function (n) { return '<option value="' + esc(n) + '">'; }).join('');
  }

  function render() {
    renderHeader();
    if (state.search) return renderSearch(new Date());
    if (state.loading && !state.data) {
      $('content').innerHTML = '<p class="empty">Yükleniyor…</p>';
      return;
    }
    if (state.error) return renderError();
    var now = new Date();
    var all = state.data.events;
    var events = remaining(all, now);
    renderFilters(events);
    renderContent(all, events, now);
    renderMeta(state.data);
    if ($('favDialog').open) renderFavDialog();
  }

  /* ---------- Favori penceresi ---------- */

  function renderFavDialog() {
    $('favTeams').innerHTML = favs.teams.length
      ? favs.teams.map(function (t) {
          return '<button class="chip on" data-rm-team="' + esc(t) + '" title="Kaldır">' + esc(t) + ' <span class="n">×</span></button>';
        }).join('')
      : '<span class="fav-empty">Henüz takım yok.</span>';

    // Sabit ligler + bugünün verisinde olup listede olmayanlar.
    var leagues = GM.LEAGUES.slice();
    (state.data ? state.data.events : []).forEach(function (ev) {
      var key = leagueKey(ev);
      if (key && !leagues.some(function (l) { return l.id === key; })) leagues.push({ id: key, label: ev.competition });
    });
    favs.leagues.forEach(function (id) {
      if (!leagues.some(function (l) { return l.id === id; })) leagues.push({ id: id, label: id });
    });
    $('favLeagues').innerHTML = leagues.map(function (l) {
      return chip(l.label, leagueIsFav(l.id), 'data-fav-league="' + esc(l.id) + '"');
    }).join('');

    fillSuggest();
  }

  /* ---------- Yükleme + gezinme ---------- */

  function load() {
    var date = state.date;
    state.loading = true;
    render();
    GM.api.getDay(date).then(function (d) {
      if (date !== state.date) return;  // bu arada gün değiştirildiyse eski cevabı at
      state.data = d; state.error = null;
      fillSuggest();
    }, function (err) {
      if (date !== state.date) return;
      state.data = null; state.error = err.message || String(err);
    }).then(function () {
      if (date !== state.date) return;
      state.loading = false; state.loadedAt = Date.now();
      render();
    });
  }

  // Geçmiş günler yok: bugünden önceki ya da 7 günden sonraki tarih bugüne döner.
  function go(date) {
    var t = today();
    if (!T.isValidDateStr(date) || date < t || date > T.addDays(t, DAYS_AHEAD)) date = t;
    state.search = null; state.searchResults = null;
    $('searchForm').hidden = true;
    state.date = date;
    state.followToday = date === t;
    state.data = null; state.error = null; state.open = {};
    history.replaceState(null, '', state.followToday ? location.pathname : '#' + date);
    load();
  }

  // Önerilen'deki küçük karta dokununca listedeki asıl kart açılır ve oraya kayılır.
  function goto(id) {
    state.open[id] = true;
    render();
    var el = document.querySelector('#allList .card[data-id="' + CSS.escape(id) + '"]');
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.classList.add('flash');
  }

  document.addEventListener('click', function (e) {
    var dlg = $('favDialog');
    if (e.target === dlg) return dlg.close();  // pencere dışına tıklama
    var b = e.target.closest('button');
    if (!b) {
      // Karta dokunma: ayrıntıyı aç/kapat (ayrıntının içindeki metne dokunmak kapatmaz).
      var c = e.target.closest('.card');
      if (c && !e.target.closest('.c-detail')) {
        var id = c.dataset.id;
        if (state.open[id]) delete state.open[id]; else state.open[id] = true;
        document.querySelectorAll('.card[data-id="' + CSS.escape(id) + '"]').forEach(function (x) {
          x.classList.toggle('open', !!state.open[id]);
        });
      }
      return;
    }
    if (b.dataset.day) return go(b.dataset.day);
    if (b.dataset.goto) return goto(b.dataset.goto);
    if (b.id === 'retryBtn') return load();
    if (b.id === 'searchClose') return closeSearch();
    if (b.id === 'searchBtn') {
      if (state.search) return closeSearch();
      $('searchForm').hidden = !$('searchForm').hidden;
      if (!$('searchForm').hidden) $('searchInput').focus();
      return renderHeader();
    }
    if (b.id === 'favBtn') { renderFavDialog(); return dlg.showModal(); }
    if (b.id === 'favClose') return dlg.close();
    if (b.dataset.sport) { state.sport = b.dataset.sport; return render(); }
    if (b.dataset.toggle) { state[b.dataset.toggle] = !state[b.dataset.toggle]; return render(); }
    if (b.dataset.sort) { state.sortBy = b.dataset.sort; saveSort(); return render(); }
    if (b.dataset.cal) return addToCalendar(b.dataset.cal);
    if (b.dataset.favTeam) { toggleTeam(b.dataset.favTeam); return render(); }
    if (b.dataset.favLeague) { toggleLeague(b.dataset.favLeague); return render(); }
    if (b.dataset.rmTeam) {
      favs.teams = favs.teams.filter(function (t) { return t !== b.dataset.rmTeam; });
      saveFavs();
      return render();
    }
  });

  $('searchForm').addEventListener('submit', function (e) {
    e.preventDefault();
    $('searchInput').blur();  // telefonda klavye kapansın
    runSearch($('searchInput').value);
  });

  $('favTeamForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var input = $('favTeamInput');
    var name = input.value.trim();
    if (name && !favs.teams.some(function (t) { return lc(t) === lc(name); })) {
      favs.teams.push(name);
      saveFavs();
    }
    input.value = '';
    render();
  });

  // Şerit yapışınca altına ince çizgi.
  if ('IntersectionObserver' in window) {
    var sentinel = document.createElement('div');
    $('bar').before(sentinel);
    new IntersectionObserver(function (en) {
      $('bar').classList.toggle('stuck', !en[0].isIntersecting);
    }).observe(sentinel);
  }

  setInterval(function () {
    if (state.followToday && state.date !== today()) return go(today());  // gece yarısı: yeni gün
    if (state.followToday && Date.now() - state.loadedAt > REFRESH_MS) return load();
    if (state.data || state.searchResults) render();
  }, TICK_MS);

  go(location.hash.slice(1));
})();
