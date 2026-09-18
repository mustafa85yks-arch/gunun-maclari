/* Arayüz: durum, filtreler, favoriler, çizim. Veriyi sadece GM.api.getDay() üzerinden alır. */
(function () {
  'use strict';

  var T = GM.time;
  var REFRESH_MS = 10 * 60 * 1000;  // bugünü izlerken veriyi 10 dk'da bir yeniden oku
  var TICK_MS = 30 * 1000;          // durum/geri sayım 30 sn'de bir güncellenir
  var FAV_KEY = 'gm-favoriler';

  var state = {
    date: null,
    followToday: true,   // "bugün"deyken gün dönünce otomatik yeni güne geç
    sport: 'tumu',
    turkOnly: false,
    favOnly: false,
    search: null,        // takım/lig araması: aranan metin (null = normal gün görünümü)
    searchResults: null, // [{date, events}]
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
  function lc(s) { return String(s || '').toLocaleLowerCase('tr').trim(); }
  function today() { return T.dateStr(new Date()); }
  function sportNameOf(ev) {
    return GM.SPORT_NAMES[ev.sport] || (ev.sport.charAt(0).toLocaleUpperCase('tr') + ev.sport.slice(1));
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

  // Biten maçlar hiç gösterilmez.
  function remaining(events, now) {
    return events.filter(function (ev) { return statusOf(ev, now).state !== 'finished'; });
  }

  function countdown(ev, now) {
    var mins = Math.round((ev.kickoff - now) / 60000);
    if (mins <= 0 || mins > 24 * 60) return '';
    var h = Math.floor(mins / 60), m = mins % 60;
    return (h ? h + ' sa ' : '') + (m || !h ? m + ' dk' : '') + ' kaldı';
  }

  function statusBadge(st) {
    var approx = st.approx ? '<span class="approx" title="Canlı veri değil, saate göre tahmin">~</span>' : '';
    switch (st.state) {
      case 'live': return '<span class="badge live">CANLI' + (st.minute ? ' ' + esc(st.minute) + '\'' : '') + approx + '</span>';
      case 'halftime': return '<span class="badge half">DEVRE</span>';
      case 'postponed': return '<span class="badge done">ERTELENDİ</span>';
      default: return '';
    }
  }

  /* ---------- Yayıncı ---------- */

  function tvBlock(ev) {
    if (ev.verification === 'yayin_yok') return '<div class="tv muted">TV yayını bulunamadı</div>';
    if (ev.verification === 'dogrulanamadi') return '<div class="tv muted">Yayıncı doğrulanamadı</div>';
    var brands = [];
    ev.broadcasters.forEach(function (ch) {
      var g = GM.broadcasterGroup(ch);
      var label = g.id === 'diger' ? ch : g.label;
      if (brands.indexOf(label) === -1) brands.push(label);
    });
    var brandStr = brands.join(' / ');
    var chanStr = ev.broadcasters.join(' / ');
    var mark = ev.verification === 'dogrulandi'
      ? '<span class="verify ok" title="Kanalın kendi yayın akışında da var">✓</span>' : '';
    return '<div class="tv">' +
      '<span class="brand">' + esc(brandStr) + mark + '</span>' +
      (chanStr !== brandStr ? '<span class="channel">' + esc(chanStr) + '</span>' : '') +
      '</div>';
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
    if (ev.home && ev.away) return teamSpan(ev.home) + '<span class="vs">–</span>' + teamSpan(ev.away);
    return '<span class="team">' + esc(ev.title || ev.home || ev.competition) + '</span>';
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

  function card(ev, now, extra) {
    var st = statusOf(ev, now);
    var cd = st.state === 'scheduled' && T.dateStr(ev.kickoff) === today() ? countdown(ev, now) : '';
    var sportName = sportNameOf(ev);
    var statusText = st.state === 'scheduled' ? 'Başlamadı' :
      st.state === 'live' ? 'Canlı' : st.state === 'halftime' ? 'Devre arası' :
      st.state === 'postponed' ? 'Ertelendi' : 'Tamamlandı';
    if (st.approx) statusText += ' (saate göre tahmin, canlı veri değil)';
    var compFav = leagueIsFav(leagueKey(ev));

    return '<article data-id="' + esc(ev.id) + '" style="--lc:' + leagueColor(ev) + '" class="card' +
        (st.state === 'live' || st.state === 'halftime' ? ' is-live' : '') + '">' +
      '<div class="c-time"><span class="time">' + T.hm(ev.kickoff) + '</span>' + statusBadge(st) +
        (cd ? '<span class="countdown">' + cd + '</span>' : '') + '</div>' +
      '<div class="c-main">' +
        '<div class="teams">' + matchTitle(ev) + '</div>' +
        '<div class="comp' + (compFav ? ' fav' : '') + '"><span class="ldot" aria-hidden="true"></span>' + esc(ev.competition) +
          (ev.home && ev.title ? ' · ' + esc(ev.title) : '') +
          (ev.category === 'diger' ? ' · ' + esc(sportName) : '') + '</div>' +
      '</div>' +
      '<div class="c-tv">' + tvBlock(ev) + '</div>' +
      '<details class="c-detail"><summary>Maç Detayı</summary><dl>' +
        '<dt>Spor</dt><dd>' + esc(sportName) + '</dd>' +
        '<dt>Organizasyon</dt><dd>' + esc(ev.competition) + '</dd>' +
        '<dt>Başlama</dt><dd>' + T.hm(ev.kickoff) + ' (TSİ)</dd>' +
        '<dt>Durum</dt><dd>' + statusText + '</dd>' +
        '<dt>Yayın</dt><dd>' + (ev.broadcasters.length ? esc(ev.broadcasters.join(', ')) : '—') + '</dd>' +
        '<dt>Yayıncı doğrulama</dt><dd>' + VERIFY_TEXT[ev.verification] + '</dd>' +
        '<dt>Veri kaynağı</dt><dd>' + (ev.sources.length ? esc(ev.sources.join(', ')) : '—') + '</dd>' +
        (ev.note ? '<dt>Not</dt><dd>' + esc(ev.note) + '</dd>' : '') +
        '<dt>Favori</dt><dd class="fav-row">' + favButtons(ev) + '</dd>' +
      '</dl></details>' +
      (extra || '') +
    '</article>';
  }

  function leagueColor(ev) {
    return GM.LEAGUE_COLORS[leagueKey(ev)] || GM.DEFAULT_LEAGUE_COLOR;
  }

  function cards(list, now, extraFn) {
    return '<div class="cards">' + list.map(function (e) {
      return card(e, now, extraFn ? extraFn(e) : '');
    }).join('') + '</div>';
  }

  /* ---------- Filtre + seçim ---------- */

  function filtersActive() { return state.sport !== 'tumu' || state.turkOnly || state.favOnly; }

  function passes(ev) {
    if (state.sport !== 'tumu' && ev.category !== state.sport) return false;
    if (state.turkOnly && !ev.turkish) return false;
    if (state.favOnly && !isFav(ev)) return false;
    return true;
  }

  function score(ev) {
    var s = GM.COMPETITION_WEIGHT[ev.competitionId] || GM.DEFAULT_WEIGHT;
    ev.tags.forEach(function (t) { s += GM.TAG_WEIGHT[t] || 0; });
    if (ev.turkish) s += GM.TAG_WEIGHT.turkish;
    return s;
  }

  // En fazla 5; sadece TV'de olan maçlar. Favoriler burayı etkilemez (nesnel kalır).
  function highlights(events) {
    return events
      .filter(function (ev) { return ev.home && ev.broadcasters.length; })
      .map(function (ev) { return { ev: ev, s: score(ev) }; })
      .sort(function (a, b) { return b.s - a.s || a.ev.kickoff - b.ev.kickoff; })
      .slice(0, 5)
      .map(function (x) { return x.ev; })
      .sort(function (a, b) { return a.kickoff - b.kickoff; });
  }

  function reasons(ev) {
    var r = [];
    if (GM.COMPETITION_WEIGHT[ev.competitionId] >= 70) r.push('Üst düzey organizasyon');
    ev.tags.forEach(function (t) { if (GM.TAG_LABEL[t]) r.push(GM.TAG_LABEL[t]); });
    if (ev.turkish) r.push(GM.TAG_LABEL.turkish);
    return '<div class="why">' + r.map(esc).join(' · ') + '</div>';
  }

  /* ---------- Çizim ---------- */

  function dayLabel() {
    var t = today();
    if (state.date === t) return 'BUGÜN';
    if (state.date === T.addDays(t, 1)) return 'YARIN';
    if (state.date === T.addDays(t, -1)) return 'DÜN';
    return T.shortDate(state.date).toLocaleUpperCase('tr') + ' GÜNÜ';
  }

  function renderHeader() {
    $('dateTitle').textContent = T.longDate(state.date);
    $('todayBtn').classList.toggle('on', state.date === today());
    var n = favs.teams.length + favs.leagues.length;
    $('favBtn').innerHTML = '★ Favoriler' + (n ? ' <span class="n">' + n + '</span>' : '');
  }

  function renderSummary(all, events) {
    var onTv = events.filter(function (e) { return e.broadcasters.length; });
    var counts = {};
    onTv.forEach(function (e) { counts[e.category] = (counts[e.category] || 0) + 1; });
    var parts = GM.CATEGORIES.slice(1)
      .filter(function (c) { return counts[c.id]; })
      .map(function (c) { return c.label.charAt(0) + c.label.slice(1).toLocaleLowerCase('tr') + ' ' + counts[c.id]; });
    var kalan = events.length < all.length ? 'KALAN ' : '';
    $('summary').innerHTML =
      '<div class="sum-main">' + dayLabel() + ' TV\'DE ' + kalan + '<strong>' + onTv.length + '</strong> KARŞILAŞMA</div>' +
      (parts.length ? '<div class="sum-sub">' + parts.join(' · ') + '</div>' : '');
  }

  function chip(label, on, attrs, count) {
    return '<button class="chip' + (on ? ' on' : '') + '" ' + attrs + ' aria-pressed="' + on + '">' +
      esc(label) + (count != null ? '<span class="n">' + count + '</span>' : '') + '</button>';
  }

  function renderFilters(events) {
    $('sportFilters').innerHTML = GM.CATEGORIES.map(function (c) {
      var n = c.id === 'tumu' ? events.length : events.filter(function (e) { return e.category === c.id; }).length;
      if (c.id !== 'tumu' && !n && state.sport !== c.id) return '';
      return chip(c.label, state.sport === c.id, 'data-sport="' + c.id + '"', n);
    }).join('');

    var favN = events.filter(isFav).length;
    var turkN = events.filter(function (e) { return e.turkish; }).length;
    $('extraFilters').innerHTML =
      (favN || state.favOnly ? chip('★ FAVORİLERİM', state.favOnly, 'data-toggle="favOnly"', favN) : '') +
      (turkN || state.turkOnly ? chip('TÜRK TAKIMLARI', state.turkOnly, 'data-toggle="turkOnly"', turkN) : '');
  }

  function section(title, sub, html) {
    return '<section class="sec"><h2>' + esc(title) + (sub ? ' <span>' + esc(sub) + '</span>' : '') + '</h2>' + html + '</section>';
  }

  function renderContent(all, events, now) {
    var list = events.filter(passes);
    var html = '';

    if (!filtersActive()) {
      var fav = events.filter(isFav);
      if (fav.length) html += section('★ Favorilerim', fav.length + ' karşılaşma', cards(fav, now));

      var hl = highlights(events);
      if (hl.length) html += section('Bugünün Öne Çıkanları', 'en fazla 5 · nesnel ölçüt', cards(hl, now, reasons));

      var tr = events.filter(function (e) { return e.turkish; });
      if (tr.length) html += section('Türk Takımları', tr.length + ' karşılaşma', cards(tr, now));
    }

    // Uzak günlerde kanallar programı henüz tamamlamamış olur; liste yaklaştıkça dolar.
    if (state.date > T.addDays(today(), 2)) {
      html = '<p class="notice">Bu günün programı henüz kesinleşmedi. Kanallar yayınları yaklaştıkça ekliyor; ' +
        'liste her gün birkaç kez güncellenir.</p>' + html;
    }

    var empty = !events.length && all.length
      ? 'Bu günün karşılaşmaları tamamlandı.'
      : state.favOnly && !favs.teams.length && !favs.leagues.length
        ? 'Henüz favori seçmedin. Yukarıdaki ★ Favoriler düğmesinden takım veya lig ekle.'
        : 'Bu filtreye uyan karşılaşma yok.';

    html += section(filtersActive() ? 'Filtrelenmiş Liste' : 'Tüm Karşılaşmalar',
      list.length ? list.length + ' karşılaşma · saat sırasıyla' : '',
      list.length ? cards(list, now) : '<p class="empty">' + empty + '</p>');

    $('content').innerHTML = html;
  }

  function renderMeta(d) {
    var src = d.sources.map(function (s) {
      return s.url ? '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.name) + '</a>' : esc(s.name);
    }).join(', ');
    $('meta').innerHTML =
      '<p>Veri: ' + esc(d.providerLabel) +
      (d.generatedAt ? ' · Derlendi: ' + T.shortDate(T.dateStr(d.generatedAt)) + ' ' + T.hm(d.generatedAt) : '') +
      (src ? ' · Kaynaklar: ' + src : '') + '</p>' +
      '<p>Saatler Türkiye saatidir (TSİ). Biten karşılaşmalar gösterilmez. ' +
      '<span class="approx">~</span> işaretli CANLI durumu canlı veri değil, başlama saatine göre tahmindir. ' +
      '<span class="verify ok">✓</span> = maç kanalın kendi yayın akışında da var.</p>' +
      (d.dropped ? '<p>' + d.dropped + ' kayıt başka güne ait olduğu için gösterilmedi.</p>' : '');
  }

  function renderError() {
    $('summary').innerHTML = '';
    $('sportFilters').innerHTML = $('extraFilters').innerHTML = '';
    var future = state.date > today();
    $('content').innerHTML =
      '<div class="error"><p class="error-title">' +
        (future ? 'Bu günün programı henüz yayınlanmadı.' : 'Maç bilgileri şu anda güncellenemiyor.') + '</p>' +
      '<p class="error-detail">' +
        (future ? 'Liste o gün gece yarısından sonra otomatik hazırlanır.' : esc(state.error)) + '</p>' +
      '<button class="nav-btn" id="retryBtn">Tekrar dene</button></div>';
    $('meta').innerHTML = '';
  }

  /* ---------- Takım / lig araması (bugün + 7 gün) ---------- */

  var SEARCH_DAYS = 8;

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
    for (var i = 0; i < SEARCH_DAYS; i++) dates.push(T.addDays(today(), i));
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
    render();
  }

  function renderSearch(now) {
    var q = state.search;
    $('sportFilters').innerHTML = $('extraFilters').innerHTML = '';
    $('meta').innerHTML = '';
    var teamFav = teamIsFav(q);
    var head = '<div class="search-head">' +
      '<button class="nav-btn" id="searchClose">← Günün listesine dön</button>' +
      '<button class="fav-btn' + (teamFav ? ' on' : '') + '" data-fav-team="' + esc(q) + '">' +
        (teamFav ? '★ ' : '☆ ') + esc(q) + (teamFav ? ' favorilerde' : ' favorilere ekle') + '</button></div>';

    if (!state.searchResults) {
      $('summary').innerHTML = '<div class="sum-main">“' + esc(q) + '” ARANIYOR…</div>';
      $('content').innerHTML = head + '<p class="empty">Günler taranıyor…</p>';
      return;
    }
    var total = 0, html = '';
    state.searchResults.forEach(function (d) {
      var list = remaining(d.events, now).filter(function (ev) { return matchesQuery(ev, q); });
      if (!list.length) return;
      total += list.length;
      var label = d.date === today() ? 'Bugün' : d.date === T.addDays(today(), 1) ? 'Yarın' : '';
      html += section(T.longDate(d.date), (label ? label + ' · ' : '') + list.length + ' karşılaşma', cards(list, now));
    });
    var last = T.shortDate(T.addDays(today(), SEARCH_DAYS - 1));
    $('summary').innerHTML =
      '<div class="sum-main">“' + esc(q) + '” · <strong>' + total + '</strong> KARŞILAŞMA</div>' +
      '<div class="sum-sub">Bugünden ' + last + '’e kadar TV’de. Uzak günlerin programı henüz eksik olabilir.</div>';
    $('content').innerHTML = head + (html ||
      '<p class="empty">Bu tarihler arasında “' + esc(q) + '” için TV’de karşılaşma bulunamadı. ' +
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

  function draw() {
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
    renderSummary(all, events);
    renderFilters(events);
    renderContent(all, events, now);
    renderMeta(state.data);
  }

  // Yeniden çizimde açık "Maç Detayı" kutuları kapanmasın.
  function render() {
    var open = Array.prototype.map.call(document.querySelectorAll('.card details[open]'), function (d) {
      return d.closest('.card').dataset.id;
    });
    draw();
    if (open.length) document.querySelectorAll('.card').forEach(function (c) {
      if (open.indexOf(c.dataset.id) !== -1) c.querySelector('details').open = true;
    });
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

  function go(date) {
    state.search = null; state.searchResults = null;
    state.date = date;
    state.followToday = date === today();
    state.data = null; state.error = null;
    history.replaceState(null, '', state.followToday ? location.pathname : '#' + date);
    load();
  }

  document.addEventListener('click', function (e) {
    var dlg = $('favDialog');
    if (e.target === dlg) return dlg.close();  // pencere dışına tıklama
    var b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'prevDay') return go(T.addDays(state.date, -1));
    if (b.id === 'nextDay') return go(T.addDays(state.date, 1));
    if (b.id === 'todayBtn') return go(today());
    if (b.id === 'retryBtn') return load();
    if (b.id === 'searchClose') return closeSearch();
    if (b.id === 'favBtn') { renderFavDialog(); return dlg.showModal(); }
    if (b.id === 'favClose') return dlg.close();
    if (b.dataset.sport) { state.sport = b.dataset.sport; return render(); }
    if (b.dataset.toggle) { state[b.dataset.toggle] = !state[b.dataset.toggle]; return render(); }
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

  setInterval(function () {
    if (state.followToday && state.date !== today()) return go(today());  // gece yarısı: yeni gün
    if (state.followToday && Date.now() - state.loadedAt > REFRESH_MS) return load();
    if (state.data || state.searchResults) render();
  }, TICK_MS);

  var h = location.hash.slice(1);
  go(T.isValidDateStr(h) ? h : today());
})();
