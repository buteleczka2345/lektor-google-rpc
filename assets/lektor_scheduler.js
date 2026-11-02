// lektor_scheduler.js — [FIX 2026-11-02] WSPÓLNY harmonogram kwestii lektora.
// Wcześniej każdy skrypt miał własną kopię pętli (YouTube: oś czasu + plik, Netflix, strony DOM / Łowca, „całe napisy”)
// i kopie rozjechały się: okno kwestii i prędkość filmu (auto-nadrabianie, tempo A/B) miał tylko YouTube, ponowne czytanie
// zdania przerwanego pauzą też, a Netflix i pliki na innych stronach potrafiły czytać przy zatrzymanym filmie.
// Teraz jedna implementacja; skrypty podają tylko listę kwestii, klucze / id i swoje haki (licznik, ściszanie, blokady).
// Świat izolowany rozszerzenia (content script) — wczytywany PRZED skryptami lektora (manifest / executeScript).
(function () {
    'use strict';
    if (window.__LektorSched) return;

    var CPS = 14;   // znaki na sekundę polskiej mowy przy tempie 1 (szacunek długości kwestii)
    function estSpeechMs(text) { return String(text || '').length / CPS * 1000; }

    // Okno kwestii (ms czasu rzeczywistego): do początku następnej, najwyżej 2 s po jej końcu (polski bywa dłuższy od
    // oryginału), nie krócej niż koniec samej kwestii; dzielone przez tempo filmu (1,5× = mniej czasu).
    function slotMs(list, i, nowMs, off, rate) {
        var c = list[i], endT = c.endMs + (off || 0), nx = list[i + 1];
        var slotEnd = nx ? Math.min(nx.startMs + (off || 0), endT + 2000) : endT + 2000;
        if (slotEnd < endT) slotEnd = endT;
        return Math.max(400, (slotEnd - nowMs) / (rate > 0 ? rate : 1));
    }

    // Ile nowych zleceń nagrywania do przodu na jeden przebieg: pauza bez „buforuj przy pauzie” → 0;
    // karta w tle → 50 (Chrome zwalnia tam timery do 1 s) albo 0 bez „buforuj w tle”; zwykle 4 (bez skoków obciążenia).
    function budgetFor(video) {
        var hidden = document.visibilityState !== 'visible';
        if (video && video.paused && window.__lektorBufPauza === false) return 0;
        if (hidden) return window.__lektorBufTlo === false ? 0 : 50;
        return 4;
    }
    // Czytamy tylko, gdy film gra na widocznej karcie (w tle i w pauzie — wyłącznie nagrywanie do przodu).
    function canPlay(video) { return !!video && !video.paused && document.visibilityState === 'visible'; }

    function send(cfg, msg) {
        try {
            if (cfg.send) cfg.send(msg);
            else chrome.runtime.sendMessage(msg, function () { void chrome.runtime.lastError; });
        } catch (e) {}
    }
    function withExtra(msg, extra) {
        if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) msg[k] = extra[k];
        return msg;
    }

    // Jeden przebieg. cfg:
    //   list (posortowane po startMs), nowMs, off (przesunięcie napisów), rate (tempo filmu), lookaheadMs,
    //   budget (budgetFor), canPlay (canPlay), preroll (ms wcześniej, np. głosy zdalne),
    //   preloaded / played: Set, keyOf(c, i) → klucz w zbiorach (domyślnie c.id), idOf(c, i) → id dla lektora (domyślnie c.id),
    //   ready(c, i) → czy kwestia ma tekst (domyślnie !!c.text), allowPreload(c, i, startT), onPreload(c, i, startT),
    //   onPlay(c, i) → false = nie czytaj (blokada; kwestia zostaje oznaczona jako przeczytana), afterPlay(c, i),
    //   extra (pola dopisywane do każdej wiadomości, np. platform), send(msg).
    // Zwraca, ile zostało z budżetu nagrywania.
    function tick(cfg) {
        var list = cfg.list || [], now = cfg.nowMs, off = cfg.off || 0, look = Math.max(0, cfg.lookaheadMs || 0);
        var budget = cfg.budget || 0, pre = cfg.preroll || 0, rate = cfg.rate > 0 ? cfg.rate : 1;
        for (var i = 0; i < list.length; i++) {
            var c = list[i];
            if (!c) continue;
            var st = c.startMs + off, en = c.endMs + off;
            if (now > en + 1000) continue;
            if (st - pre > now + look) break;
            if (!(cfg.ready ? cfg.ready(c, i) : !!c.text)) continue;
            var key = cfg.keyOf ? cfg.keyOf(c, i) : c.id;
            var id = cfg.idOf ? cfg.idOf(c, i) : c.id;
            if (budget > 0 && !cfg.preloaded.has(key) && st >= now && st <= now + look
                && (!cfg.allowPreload || cfg.allowPreload(c, i, st))) {
                budget--;
                cfg.preloaded.add(key);
                if (cfg.onPreload) cfg.onPreload(c, i, st);
                // slotMs: okno kwestii od jej początku — offscreen ocenia, czy zdanie się zmieści (✂ skracanie)
                send(cfg, withExtra({ action: 'TTS_PRELOAD', id: id, text: c.text, startMs: st, endMs: en, nowMs: now,
                    slotMs: slotMs(list, i, st, off, rate) }, cfg.extra));
            }
            if (cfg.canPlay && !cfg.played.has(key) && now >= st - pre && now < en) {
                cfg.played.add(key);
                if (cfg.onPlay && cfg.onPlay(c, i) === false) continue;
                send(cfg, withExtra({ action: 'TTS_PLAY', id: id, text: c.text, durationMs: c.endMs - c.startMs,
                    startMs: st, endMs: en, rate: rate, slotMs: slotMs(list, i, now, off, rate) }, cfg.extra));
                if (cfg.afterPlay) cfg.afterPlay(c, i);
            }
        }
        return budget;
    }

    // Kwestia przerwana pauzą (bez „Czytaj zawsze do końca”): po wznowieniu czytana od początku — jeśli lektor
    // (ok. 14 znaków/s) nie zdążył jej skończyć przed pauzą. atMs = miejsce pauzy, nowMs = miejsce wznowienia.
    // Zwraca liczbę kwestii przywróconych do czytania.
    function rearmAfterPause(list, played, keyOf, atMs, nowMs, off) {
        if (!(atMs >= 0) || Math.abs(nowMs - atMs) > 1500) return 0;   // przewinięte w czasie pauzy — tym zajmuje się 'seeked'
        var n = 0;
        off = off || 0;
        for (var i = 0; i < (list || []).length; i++) {
            var c = list[i];
            if (!c) continue;
            var st = c.startMs + off, en = c.endMs + off, key = keyOf ? keyOf(c, i) : c.id;
            if (atMs < st || atMs >= en || !played.has(key)) continue;
            if (atMs - st < estSpeechMs(c.text)) { played.delete(key); n++; }
        }
        return n;
    }
    function readToEndOn() {
        try { return !!(window.__LivedubOpts && window.__LivedubOpts.get('readToEnd')); } catch (e) { return false; }
    }

    // [FIX 2026-11-02] „Czytam z: …” — skąd lektor bierze tekst w tej ramce (pasek 📊, arkusz ⚙, popup).
    var source = { name: '', cues: 0, at: 0 };
    function setSource(name, cues) {
        source = { name: String(name || ''), cues: Number(cues) || 0, at: Date.now() };
    }
    function getSource() { return source.name ? source : null; }
    try {
        chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
            if (!msg || msg.action !== 'LEKTOR_SOURCE' || !source.name) return;   // ramka bez źródła milczy — odpowie inna
            sendResponse({ ok: true, source: source.name, cues: source.cues, top: window === window.top });
        });
    } catch (e) {}

    // [FIX 2026-11-02] 🔉 „Ściszaj film tylko, gdy lektor mówi” (popup → Ducking; duckWhileSpeaking, domyślnie wył.).
    // Dokument lektora wysyła TTS_SPEAK, gdy NAPRAWDĘ zaczyna mówić, a TTS_QUEUE_IDLE, gdy skończył — film ścisza się
    // na czas mowy i wraca po 0,4 s ciszy (bez skakania między zdaniami). Zmiany głośności płynne (~0,25 s).
    // Skrypty stron: duckAllowed() na początku swojego applyDuck, setVol() zamiast video.volume = …, onDuck(duck, restore).
    var duckWhile = false, speaking = false, holdT = 0, hooks = [];
    try {
        chrome.storage.local.get('duckWhileSpeaking', function (r) { duckWhile = !!(r && r.duckWhileSpeaking); });
        chrome.storage.onChanged.addListener(function (ch, a) {
            if (a !== 'local' || !ch.duckWhileSpeaking) return;
            duckWhile = !!ch.duckWhileSpeaking.newValue;
            hooks.forEach(function (h) { try { if (duckWhile && !speaking) h.restore(); else h.duck(); } catch (e) {} });
        });
        chrome.runtime.onMessage.addListener(function (msg) {
            if (!msg || !duckWhile) return;
            if (msg.action === 'TTS_SPEAK') {
                clearTimeout(holdT);
                if (!speaking) { speaking = true; hooks.forEach(function (h) { try { h.duck(); } catch (e) {} }); }
            } else if (msg.action === 'TTS_QUEUE_IDLE') {
                clearTimeout(holdT);
                holdT = setTimeout(function () { speaking = false; hooks.forEach(function (h) { try { h.restore(); } catch (e) {} }); }, 400);
            }
        });
    } catch (e) {}
    function duckAllowed() { return !duckWhile || speaking; }
    function onDuck(duck, restore) { hooks.push({ duck: duck, restore: restore }); }
    var fades = typeof WeakMap === 'function' ? new WeakMap() : null;
    function setVol(v, target) {
        if (!v) return;
        target = Math.max(0, Math.min(1, Number(target)));
        if (!isFinite(target)) return;
        var run = fades && fades.get(v);
        if (!duckWhile || !fades) { if (run) { clearInterval(run.t); fades.delete(v); } v.volume = target; return; }
        if (run && Math.abs(run.to - target) < 0.005) return;   // już płynie w tę stronę
        if (run) clearInterval(run.t);
        var from = v.volume, n = 0;
        if (Math.abs(from - target) < 0.01) { v.volume = target; if (fades) fades.delete(v); return; }
        var t = setInterval(function () {
            n++;
            try { v.volume = from + (target - from) * (n / 10); } catch (e) {}
            if (n >= 10) { clearInterval(t); fades.delete(v); }
        }, 25);
        fades.set(v, { t: t, to: target });
    }

    window.__LektorSched = {
        CPS: CPS, estSpeechMs: estSpeechMs, slotMs: slotMs, budgetFor: budgetFor, canPlay: canPlay, tick: tick,
        rearmAfterPause: rearmAfterPause, readToEndOn: readToEndOn, setSource: setSource, getSource: getSource,
        duckAllowed: duckAllowed, onDuck: onDuck, setVol: setVol, duckWhileOn: function () { return duckWhile; }
    };
})();
