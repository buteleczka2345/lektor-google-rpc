// Testy wspólnego harmonogramu lektora (assets/lektor_scheduler.js). Uruchom: node tests/test_scheduler.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
function load() {
    const ctx = { document: { visibilityState: 'visible' }, chrome: { runtime: { onMessage: { addListener() {} }, sendMessage() {} } } };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(root + 'assets/lektor_scheduler.js', 'utf8'), ctx);
    return ctx;
}
const plain = (x) => JSON.parse(JSON.stringify(x));
const cues = [
    { id: 'a', text: 'Pierwsza kwestia.', startMs: 1000, endMs: 3000 },
    { id: 'b', text: 'Druga kwestia, trochę dłuższa.', startMs: 3500, endMs: 6000 },
    { id: 'c', text: '', startMs: 6500, endMs: 7000 },               // jeszcze bez tłumaczenia
    { id: 'd', text: 'Czwarta.', startMs: 200000, endMs: 201000 }    // daleko za zapasem
];
function run(S, over) {
    const sent = [];
    const cfg = Object.assign({ list: cues, nowMs: 1200, off: 0, rate: 1, lookaheadMs: 180000, budget: 4, canPlay: true,
        preloaded: new Set(), played: new Set(), send: (m) => sent.push(plain(m)) }, over || {});
    S.tick(cfg);
    return { sent, cfg };
}

{ // zwykły przebieg: czyta bieżącą, nagrywa następną, pomija pustą i tę za zapasem
    const S = load().__LektorSched;
    const { sent } = run(S);
    const play = sent.filter((m) => m.action === 'TTS_PLAY');
    const pre = sent.filter((m) => m.action === 'TTS_PRELOAD');
    assert.deepEqual(play.map((m) => m.id), ['a']);
    assert.deepEqual(pre.map((m) => m.id), ['b']);
    assert.equal(play[0].rate, 1);
    assert.equal(Math.round(play[0].slotMs), 3500 - 1200, 'okno do początku następnej (≤ koniec + 2 s)');
}
{ // pauza / karta w tle: tylko nagrywanie
    const S = load().__LektorSched;
    const { sent } = run(S, { canPlay: false });
    assert.equal(sent.filter((m) => m.action === 'TTS_PLAY').length, 0);
}
{ // tempo filmu 1,5× skraca okno, przesunięcie napisów działa, blokada nie wysyła, ale zalicza kwestię
    const S = load().__LektorSched;
    const { sent, cfg } = run(S, { rate: 1.5, off: 500, nowMs: 1600, onPlay: (c) => c.id !== 'a' });
    assert.equal(sent.filter((m) => m.action === 'TTS_PLAY').length, 0, 'blokada');
    assert.ok(cfg.played.has('a'));
    const r2 = run(S, { rate: 1.5, nowMs: 1200 });
    const p = r2.sent.find((m) => m.action === 'TTS_PLAY');
    assert.equal(Math.round(p.slotMs), Math.round((3500 - 1200) / 1.5));
}
{ // budżet nagrywania i dodatkowe pola
    const S = load().__LektorSched;
    const { sent } = run(S, { budget: 0, extra: { platform: 'netflix' } });
    assert.equal(sent.filter((m) => m.action === 'TTS_PRELOAD').length, 0);
    assert.equal(sent.find((m) => m.action === 'TTS_PLAY').platform, 'netflix');
}
{ // ponowne czytanie po pauzie: tylko gdy lektor nie zdążył; nie po przewinięciu
    const S = load().__LektorSched;
    const played = new Set(['a', 'b']);
    assert.equal(S.rearmAfterPause(cues, played, null, 1300, 1300, 0), 1);       // 0,1 s po starcie „a” — przerwana
    assert.ok(!played.has('a') && played.has('b'));
    const p2 = new Set(['b']);
    assert.equal(S.rearmAfterPause(cues, p2, null, 5900, 5900, 0), 0);          // 2,4 s po starcie „b” — już przeczytana
    assert.equal(S.rearmAfterPause(cues, new Set(['a']), null, 1300, 9000, 0), 0); // przewinięte w pauzie
}
{ // budżet zależny od pauzy i karty w tle
    const ctx = load(), S = ctx.__LektorSched;
    assert.equal(S.budgetFor({ paused: false }), 4);
    ctx.__lektorBufPauza = false;
    assert.equal(S.budgetFor({ paused: true }), 0);
    ctx.document.visibilityState = 'hidden';
    assert.equal(S.budgetFor({ paused: false }), 50);
    assert.equal(S.canPlay({ paused: false }), false);
}
console.log('lektor_scheduler: OK');
