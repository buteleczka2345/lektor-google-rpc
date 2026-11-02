// [AGENT-EXP] 2026-10-17: 📊 PASEK LEKTORA — jak daleko do przodu lektor ma już NAGRANY DŹWIĘK.
// Cienki pasek na dole filmu, zgodny z osią czasu filmu (jak bufor w odtwarzaczu). Każda kwestia w swoim miejscu:
//   pomarańczowa = dźwięk nagrany (gotowy w pamięci lektora),  zielona = lektor już przeczytał,
//   jasnoszara = tekst gotowy, dźwięku jeszcze nie ma,  ciemna = czeka na tłumaczenie;  biała kreska = teraz.
// Po prawej: „🔊 nagrane do przodu 2:35 (41 kwestii) · przetłumaczone 340/812” (Netflix: „napisy gotowe” — noTranslate).
// Dźwięk: background (LEKTOR_AUDIO_KEYS) podaje klucze nagrań tej karty z pamięci lektora (offscreen),
// klucz kwestii = id + '|' + skrót tekstu (ten sam co ttsCacheId w background.js).
// Skrypty lektora (youtube_content, dom_content, content.js Netflix, full_subs_ondemand) podają swoje kwestie
// przez window.__lektorBarProviders[nazwa] = function () { return { video, list, ready(c, i), spoken(c, i), audioId(c, i) } | null }.
// Wspólny świat izolowany rozszerzenia w ramce, więc to zwykły obiekt globalny.
// Opcja „Pasek lektora” (lektorBar, domyślnie WŁ.). Nic nie łapie myszy (pointer-events: none).
(function () {
    'use strict';
    if (window.__lektorBarLoaded) return;
    window.__lektorBarLoaded = true;
    window.__lektorBarProviders = window.__lektorBarProviders || {};

    var on = true, box = null, cv = null, lbl = null, srcLbl = null, lastSig = '';
    var audio = new Set(), audioAt = 0, audioBusy = false;
    var stats = null, statsAt = 0, statsBusy = false;   // [FIX 2026-11-02] pominięte kwestie / opóźnienie (LEKTOR_STATS)
    try {
        chrome.storage.local.get('lektorBar', function (r) { if (r && r.lektorBar === false) on = false; });
        chrome.storage.onChanged.addListener(function (ch, area) { if (area === 'local' && ch.lektorBar) on = ch.lektorBar.newValue !== false; });
    } catch (e) {}

    function hash(t) {   // jak ttsCacheId w background.js
        t = String(t || '');
        var h = 5381;
        for (var i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
        return (h >>> 0).toString(36);
    }
    function refreshAudio() {
        if (audioBusy || Date.now() - audioAt < 1000) return;
        audioBusy = true; audioAt = Date.now();
        try {
            chrome.runtime.sendMessage({ action: 'LEKTOR_AUDIO_KEYS' }, function (r) {
                void chrome.runtime.lastError;
                audioBusy = false;
                if (r && Array.isArray(r.keys)) { audio = new Set(r.keys); lastSig = ''; }
            });
        } catch (e) { audioBusy = false; }
    }

    // [FIX 2026-11-02] liczniki lektora tej karty: ile kwestii pominął (ostatnie 10 min) i z jakim opóźnieniem zaczyna mówić
    function refreshStats() {
        if (statsBusy || Date.now() - statsAt < 3000) return;
        statsBusy = true; statsAt = Date.now();
        try {
            chrome.runtime.sendMessage({ action: 'LEKTOR_STATS' }, function (r) {
                void chrome.runtime.lastError;
                statsBusy = false;
                stats = r || null; lastSig = '';
            });
        } catch (e) { statsBusy = false; }
    }
    function sec(ms) { return (Math.round(ms / 100) / 10).toFixed(1).replace('.', ',') + ' s'; }

    // [FIX 2026-11-02] 💾 eksport przetłumaczonych napisów do .srt — polecenie z popupu (LEKTOR_EXPORT_SRT) trafia do
    // każdej ramki; odpowiada (i pobiera plik) tylko ta, która ma listę kwestii. Czasy bez przesunięcia lektora.
    function srtTime(ms) {
        ms = Math.max(0, Math.round(ms));
        var p = function (n, w) { return String(n).padStart(w || 2, '0'); };
        return p(Math.floor(ms / 3600000)) + ':' + p(Math.floor(ms / 60000) % 60) + ':' + p(Math.floor(ms / 1000) % 60) + ',' + p(ms % 1000, 3);
    }
    function exportSrt() {
        var d = pick();
        if (!d) return 0;
        var out = [], n = 0;
        d.list.forEach(function (c, i) {
            var ok = false;
            try { ok = !!d.ready(c, i); } catch (e) {}
            var t = String((c && c.text) || '').replace(/\s+/g, ' ').trim();
            if (!ok || !t || !(c.endMs > c.startMs)) return;
            out.push((++n) + '\n' + srtTime(c.startMs) + ' --> ' + srtTime(c.endMs) + '\n' + t + '\n');
        });
        if (!n) return 0;
        var name = String(document.title || 'napisy').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'napisy';
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob(['\ufeff' + out.join('\n')], { type: 'application/x-subrip;charset=utf-8' }));
        a.download = name + '.pl.srt';
        a.style.display = 'none';
        (document.body || document.documentElement).appendChild(a);
        a.click();
        setTimeout(function () { try { URL.revokeObjectURL(a.href); a.remove(); } catch (e) {} }, 3000);
        return n;
    }
    try {
        chrome.runtime.onMessage.addListener(function (msg, _s, sendResponse) {
            if (!msg || msg.action !== 'LEKTOR_EXPORT_SRT') return;
            var n = exportSrt();
            if (n) sendResponse({ ok: true, count: n });   // bez listy — milczy (odpowie inna ramka)
        });
    } catch (e) {}

    function build() {
        box = document.createElement('div');
        box.id = 'lektor-progress-bar';
        box.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;display:none;';
        cv = document.createElement('canvas');
        cv.style.cssText = 'position:absolute;left:0;bottom:0;width:100%;height:6px;border-radius:3px;';
        lbl = document.createElement('div');
        lbl.style.cssText = 'position:absolute;right:4px;bottom:9px;font:600 11px system-ui,sans-serif;color:#fff;'
            + 'background:rgba(0,0,0,.55);padding:1px 6px;border-radius:8px;white-space:nowrap;';
        srcLbl = document.createElement('div');   // [FIX 2026-11-02] „📍 skąd czyta lektor”
        srcLbl.style.cssText = 'position:absolute;left:4px;bottom:9px;max-width:45%;overflow:hidden;text-overflow:ellipsis;font:600 11px system-ui,sans-serif;color:#fff;'
            + 'background:rgba(0,0,0,.55);padding:1px 6px;border-radius:8px;white-space:nowrap;';
        box.appendChild(cv); box.appendChild(lbl); box.appendChild(srcLbl);
        try { if (self.MLi18n) { MLi18n.watch(box); } } catch (e) {}   // [AGENT-EXP] 2026-10-21: język interfejsu (PL / EN)
    }
    function hide() { if (box) box.style.display = 'none'; lastSig = ''; }

    function pick() {
        var ps = window.__lektorBarProviders, best = null;
        for (var k in ps) {
            var d = null;
            try { d = ps[k](); } catch (e) { d = null; }
            if (d && d.video && d.list && d.list.length && (!best || d.list.length > best.list.length)) best = d;
        }
        return best;
    }
    function mmss(ms) { var s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }

    function tick() {
        if (!on || document.visibilityState !== 'visible') { hide(); return; }
        var d = pick();
        var v = d && d.video;
        var dur = v ? v.duration : 0;
        if (!d || !v.isConnected || !isFinite(dur) || dur <= 0) { hide(); return; }
        var r = v.getBoundingClientRect();
        if (r.width < 120 || r.height < 60) { hide(); return; }
        refreshAudio();
        refreshStats();   // [FIX 2026-11-02]
        if (!box) build();
        var host = document.fullscreenElement && document.fullscreenElement.tagName !== 'VIDEO' ? document.fullscreenElement : document.documentElement;
        if (box.parentNode !== host) host.appendChild(box);
        box.style.left = Math.round(r.left) + 'px';
        box.style.width = Math.round(r.width) + 'px';
        box.style.top = Math.round(r.bottom - 30) + 'px';
        box.style.height = '28px';
        box.style.display = '';

        var W = Math.max(1, Math.round(r.width)), H = 6, durMs = dur * 1000, list = d.list;
        var now = v.currentTime * 1000;
        var ready = 0, rec = 0, i, c, st = new Array(list.length);
        for (i = 0; i < list.length; i++) {
            c = list[i];
            var isR = false, isS = false, isA = false;
            try {
                isR = !!d.ready(c, i);
                isS = isR && !!d.spoken(c, i);
                isA = isR && !isS && d.audioId && audio.has(d.audioId(c, i) + '|' + hash(c.text));
            } catch (e) {}
            st[i] = isS ? 3 : (isA ? 2 : (isR ? 1 : 0));
            if (isR) ready++;
            if (isA) rec++;
        }
        // nagrane do przodu: ciąg kwestii od bieżącego miejsca, które mają dźwięk (albo już przeczytane)
        var aheadEnd = now, aheadN = 0;
        for (i = 0; i < list.length; i++) {
            c = list[i];
            if (c.endMs <= now) continue;
            if (st[i] === 0) break;          // bez tekstu — dalej nic nie ma
            if (st[i] === 1) break;          // tekst jest, dźwięku nie ma — tu kończy się nagranie
            aheadEnd = c.endMs; aheadN++;
        }
        var sig = W + '|' + list.length + '|' + ready + '|' + rec + '|' + aheadN + '|' + Math.round(now / 250) + '|' + (stats ? stats.skipped10m + '/' + stats.lagAvgMs : '');
        if (sig === lastSig) return;
        lastSig = sig;
        if (cv.width !== W) cv.width = W;
        cv.height = H;
        var g = cv.getContext('2d');
        g.clearRect(0, 0, W, H);
        g.fillStyle = 'rgba(0,0,0,.45)';
        g.fillRect(0, 0, W, H);
        var COL = ['rgba(255,255,255,.12)', 'rgba(255,255,255,.38)', '#ff9f1a', '#2ecc71'];
        for (i = 0; i < list.length; i++) {
            c = list[i];
            if (!(c.endMs > 0)) continue;
            var x = (c.startMs / durMs) * W, w = Math.max(1, ((c.endMs - c.startMs) / durMs) * W);
            g.fillStyle = COL[st[i]];
            g.fillRect(x, 0, w, H);
        }
        g.fillStyle = '#fff';
        g.fillRect(Math.min(W - 2, Math.max(0, (now / durMs) * W - 1)), 0, 2, H);
        // [AGENT-EXP] 2026-10-20: dostawca bez tłumaczenia (Netflix — czyta napisy jak są) → „napisy gotowe”, nie „przetłumaczone”
        var extra = '';   // [FIX 2026-11-02] opóźnienie lektora i pominięte kwestie (wcześniej pomijanie było ciche)
        if (stats && stats.lagAvgMs != null) extra += ' · ⏱ opóźnienie ' + sec(stats.lagAvgMs);
        if (stats && stats.skipped10m) extra += ' · ⏭ pominięte: ' + stats.skipped10m;
        lbl.textContent = '🔊 nagrane do przodu ' + mmss(aheadEnd - now) + ' (' + aheadN + ' kwestii) · ' + (d.noTranslate ? 'napisy gotowe ' : 'przetłumaczone ') + ready + '/' + list.length + extra;
        var src = null;
        try { src = window.__LektorSched && window.__LektorSched.getSource(); } catch (e) {}
        srcLbl.textContent = src ? '📍 ' + src.name : '';
        srcLbl.style.display = src ? '' : 'none';
    }
    setInterval(tick, 500);
})();
