/* Veri katmanı. Arayüz sadece GM.api.getDay(tarih) çağırır; verinin nereden
   geldiği sağlayıcıya (provider) bağlıdır. Yeni kaynak = yeni provider, arayüz değişmez.
   API anahtarı buraya YAZILMAZ: remoteApi kendi backend'inize gider, anahtar orada durur. */
(function () {
  'use strict';

  GM.CONFIG = {
    provider: 'localFile',   // 'localFile' | 'remoteApi'
    dataDir: 'data',         // localFile: data/2026-09-18.js
    apiBase: '',             // remoteApi: ör. 'http://localhost:8787' → GET /days/2026-09-18
    timeoutMs: 8000
  };

  /* ---------- Tarih/saat: her şey Türkiye saatine göre ---------- */
  var dateFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: GM.TZ, year: 'numeric', month: '2-digit', day: '2-digit'
  });
  var hmFmt = new Intl.DateTimeFormat('tr-TR', {
    timeZone: GM.TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });

  GM.time = {
    // Date → '2026-09-18' (İstanbul takvim günü)
    dateStr: function (d) {
      var p = {};
      dateFmt.formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
      return p.year + '-' + p.month + '-' + p.day;
    },
    hm: function (d) { return hmFmt.format(d); },
    addDays: function (str, n) {
      var a = str.split('-').map(Number);
      return new Date(Date.UTC(a[0], a[1] - 1, a[2] + n, 12)).toISOString().slice(0, 10);
    },
    longDate: function (str) {
      var a = str.split('-').map(Number);
      return new Intl.DateTimeFormat('tr-TR', {
        timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric', weekday: 'long'
      }).format(new Date(Date.UTC(a[0], a[1] - 1, a[2], 12)));
    },
    shortDate: function (str) {
      var a = str.split('-').map(Number);
      return new Intl.DateTimeFormat('tr-TR', { timeZone: 'UTC', day: 'numeric', month: 'long' })
        .format(new Date(Date.UTC(a[0], a[1] - 1, a[2], 12)));
    },
    isValidDateStr: function (s) { return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)); }
  };

  /* ---------- Sağlayıcılar ---------- */

  // Günlük veri dosyası bir <script>: GM_REGISTER_DAY({...}) çağırır.
  // fetch yerine script kullanılıyor çünkü index.html çift tıkla (file://) açılınca fetch engellenir.
  var pending = {};
  window.GM_REGISTER_DAY = function (payload) {
    var date = payload && payload.date;
    if (date && pending[date]) pending[date](payload);
  };

  var inflight = {};  // aynı gün aynı anda iki kez istenirse (ana ekran + arama) tek yükleme yapılır

  var providers = {
    localFile: {
      label: 'yerel dosya',
      getDay: function (date) {
        if (inflight[date]) return inflight[date];
        var p = new Promise(function (resolve, reject) {
          var s = document.createElement('script');
          var bust = location.protocol === 'file:' ? '' : '?v=' + Date.now();
          s.src = GM.CONFIG.dataDir + '/' + date + '.js' + bust;
          var timer = setTimeout(function () { done(); reject(new Error('Zaman aşımı')); }, GM.CONFIG.timeoutMs);
          function done() { clearTimeout(timer); delete pending[date]; s.remove(); }
          pending[date] = function (payload) { done(); resolve(payload); };
          s.onerror = function () { done(); reject(new Error('Bu tarih için veri dosyası yok (data/' + date + '.js)')); };
          s.onload = function () {
            // Dosya yüklendi ama doğru tarihle kayıt olmadıysa geçersizdir.
            setTimeout(function () {
              if (pending[date]) { done(); reject(new Error('Veri dosyası geçersiz veya tarihi uyuşmuyor')); }
            }, 0);
          };
          document.head.appendChild(s);
        });
        inflight[date] = p;
        var clear = function () { delete inflight[date]; };
        p.then(clear, clear);
        return p;
      }
    },

    remoteApi: {
      label: 'API',
      getDay: function (date) {
        if (!GM.CONFIG.apiBase) return Promise.reject(new Error('apiBase tanımlı değil'));
        var ctrl = new AbortController();
        var timer = setTimeout(function () { ctrl.abort(); }, GM.CONFIG.timeoutMs);
        return fetch(GM.CONFIG.apiBase.replace(/\/$/, '') + '/days/' + date, { signal: ctrl.signal })
          .then(function (r) {
            if (!r.ok) throw new Error('API hatası: ' + r.status);
            return r.json();
          })
          .finally(function () { clearTimeout(timer); });
      }
    }
  };

  /* ---------- Normalleştirme + güvenlik kontrolleri ---------- */
  var VERIFICATIONS = ['dogrulandi', 'tek_kaynak', 'yayin_yok'];
  var STATES = ['scheduled', 'live', 'halftime', 'finished', 'postponed'];

  function normalize(payload, date) {
    if (!payload || payload.date !== date) throw new Error('Veri tarihi istenen günle uyuşmuyor');

    var events = [];
    var dropped = 0;
    (payload.events || []).forEach(function (raw) {
      var kickoff = new Date(raw.kickoff);
      // Başka güne ait (dün gece / yarın) maç bugün gösterilmez.
      if (isNaN(kickoff) || GM.time.dateStr(kickoff) !== date) { dropped++; return; }

      var broadcasters = (raw.broadcasters || []).filter(function (b) { return b && String(b).trim(); });
      var verification = raw.verification;
      // Kanal yoksa veya durum bilinmiyorsa tahmin yok: "doğrulanamadı".
      if (VERIFICATIONS.indexOf(verification) === -1 || (!broadcasters.length && verification !== 'yayin_yok')) {
        verification = 'dogrulanamadi';
      }
      var status = raw.status && STATES.indexOf(raw.status.state) !== -1 ? raw.status : null;

      events.push({
        id: raw.id || (date + '-' + events.length),
        sport: raw.sport || 'diger',
        category: GM.sportCategory(raw.sport),
        competition: raw.competition || '',
        competitionId: raw.competitionId || '',
        home: raw.home || '',
        away: raw.away || '',
        title: raw.title || '',
        kickoff: kickoff,
        durationMin: raw.durationMin || GM.DURATION_MIN[raw.sport] || GM.DEFAULT_DURATION_MIN,
        broadcasters: broadcasters,
        verification: verification,
        sources: raw.sources || [],
        tags: raw.tags || [],
        note: raw.note || '',
        turkish: typeof raw.turkish === 'boolean' ? raw.turkish : GM.isTurkish(raw),
        status: status
      });
      var ev = events[events.length - 1];
      ev.rivalry = GM.findRivalry(ev);  // tarihi derbi adı ya da ''
      ev.bigCount = GM.bigCount(ev);    // maçtaki büyük kulüp sayısı (0-2)
      ev.minor = GM.isMinor(ev);        // kadınlar / altyapı
    });

    events.sort(function (a, b) {
      return a.kickoff - b.kickoff || a.competition.localeCompare(b.competition, 'tr');
    });
    if (dropped) console.warn('[GÜNÜN MAÇLARI] ' + dropped + ' kayıt başka güne ait veya hatalı, gösterilmedi.');

    return {
      date: date,
      generatedAt: payload.generatedAt ? new Date(payload.generatedAt) : null,
      sources: payload.sources || [],
      events: events,
      dropped: dropped,
      providerLabel: providers[GM.CONFIG.provider].label
    };
  }

  GM.api = {
    getDay: function (date) {
      var p = providers[GM.CONFIG.provider];
      if (!p) return Promise.reject(new Error('Bilinmeyen sağlayıcı: ' + GM.CONFIG.provider));
      return p.getDay(date).then(function (payload) { return normalize(payload, date); });
    }
  };
})();
