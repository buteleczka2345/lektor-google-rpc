// Test kolejki lektora (src/offscreen/offscreen.js) w Chromium (Playwright), z atrapą silnika Matcha 🌐 o sterowanym
// czasie syntezy. Uruchom: node tests/offscreen_e2e.cjs   (wymaga: npm i playwright  albo Playwright w systemie)
// Składa w katalogu tymczasowym: offscreen.js + browser_tts.js + liczby_pl.js + assets/censor.js + atrapa matcha_web/engine.js
// + strona testowa z atrapą chrome.runtime. Sprawdza:
//   A) zdanie liczone w chwili pauzy nie gra po pauzie        B) jedna synteza, gdy czytanie trafi na nagrywanie do przodu
//   C) czyszczenie z innej karty nie ucina lektora             D) dziennik do storage najwyżej ~1×/s
//   E) „Czytaj zawsze do końca”: kolejność przyjścia            F) … i pauza filmu dokańcza bieżące zdanie
//   G) nadrabianie ≤ 1,8× i liczniki pominiętych / opóźnienia (TTS_STATS)
//   H) „Serwer lokalny — własny adres”: JSON do serwera WebSocket (czytanie pilne / nagrywanie do przodu) i odtworzenie WAV
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');

// Minimalny serwer WebSocket (RFC 6455, jedna ramka na wiadomość): zapisuje JSON-y i odsyła 0,3 s ciszy w WAV.
function fakeTtsServer() {
    const got = [];
    const wav = (() => { const sr = 8000, n = 2400, b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8);
        b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28);
        b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40); return b; })();
    const srv = http.createServer();
    srv.on('upgrade', (req, sock) => {
        const acc = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
        sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + acc + '\r\n\r\n');
        sock.on('data', (d) => {
            if ((d[0] & 0x0f) !== 1) return;   // tylko ramki tekstowe
            let len = d[1] & 0x7f, off = 2;
            if (len === 126) { len = d.readUInt16BE(2); off = 4; } else if (len === 127) { len = Number(d.readBigUInt64BE(2)); off = 10; }
            const mask = d.slice(off, off + 4), body = Buffer.from(d.slice(off + 4, off + 4 + len).map((x, i) => x ^ mask[i % 4]));
            try { got.push(JSON.parse(body.toString('utf8'))); } catch (e) { return; }
            const head = wav.length < 65536 ? Buffer.from([0x82, 126, wav.length >> 8, wav.length & 255]) : null;
            setTimeout(() => { try { sock.write(Buffer.concat([head, wav])); } catch (e) {} }, 50);
        });
        sock.on('error', () => {});
    });
    return { srv, got };
}
const { chromium } = require('playwright');

const repo = path.resolve(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lektor-e2e-'));
const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
for (const f of ['offscreen.js', 'browser_tts.js', 'liczby_pl.js']) put('src/offscreen/' + f, fs.readFileSync(path.join(repo, 'src/offscreen', f)));
put('assets/censor.js', fs.readFileSync(path.join(repo, 'assets/censor.js')));
put('matcha_web/engine.js', `
let log = () => {};
export function setLogger(f) { log = f; }
const S = (globalThis.__fakeMatcha = globalThis.__fakeMatcha || { calls: [], promoted: 0 });
function wav(sec) {
    const sr = 8000, n = Math.round(sr * sec), buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    w(36, 'data'); v.setUint32(40, n * 2, true);
    return new Blob([buf], { type: 'audio/wav' });
}
export function synthesizeWav(text, opts = {}) {   // „~600ms” w tekście = czas syntezy, „~1.5s” = długość mowy
    S.calls.push({ text: String(text), pilne: !!opts.pilne });
    const md = /~(\\d+)ms/.exec(String(text)), ms = /~([\\d.]+)s\\b/.exec(String(text));
    const d = md ? +md[1] : (globalThis.__fakeDelay || 300);
    return new Promise((r) => setTimeout(() => { const b = wav(ms ? +ms[1] : (globalThis.__fakeSec || 0.5)); b.__text = String(text); r(b); }, d));
}
export function promote() { S.promoted++; return 1; }
export function cancelQueued() {}
export function reset() {}
export function warmUp() {}
export function isBusy() { return false; }
`);
put('src/offscreen/test.html', `<!DOCTYPE html><html><head><meta charset="utf-8">
<script>
window.__sent = []; window.__listeners = []; window.__plays = []; window.__urlText = {};
window.chrome = { runtime: {
  getURL: (p) => location.origin + '/' + p,
  sendMessage: (msg) => { window.__sent.push(JSON.parse(JSON.stringify(msg || {})));
    if (msg && msg.action === 'GET_TTS_SETTINGS') return Promise.resolve({ settings: { ttsEngine: 'matcha', matchaVoice: 'web:male_voxcpm_2:elegancki', ttsVolume: 100, piperSpeed: 1, tempoMode: 'A', autoCatchup: true, readToEnd: false, censorEnabled: true, censorMode: 'remove' } });
    return Promise.resolve(null); },
  onMessage: { addListener: (fn) => window.__listeners.push(fn) } } };
window.__send = (msg) => new Promise((resolve) => {
  let done = false; const sr = (r) => { if (!done) { done = true; resolve(r); } };
  let asyncResp = false;
  for (const fn of window.__listeners) { try { if (fn(Object.assign({ target: 'offscreen' }, msg), {}, sr) === true) asyncResp = true; } catch (e) { console.error(e); } }
  if (!asyncResp) setTimeout(() => sr(undefined), 0);
});
const oc = URL.createObjectURL; URL.createObjectURL = function (b) { const u = oc.call(URL, b); if (b && b.__text) window.__urlText[u] = b.__text; return u; };
const origPlay = HTMLMediaElement.prototype.play;
HTMLMediaElement.prototype.play = function () { if (this.id === 'tts-player') window.__plays.push({ src: this.src, t: performance.now() }); return origPlay.apply(this, arguments); };
</script>
<script src="../../assets/censor.js"></script>
<script type="module" src="offscreen.js"></script>
</head><body><audio id="keepAlive" loop></audio><audio id="tts-player" autoplay></audio></body></html>`);

const srv = http.createServer((req, res) => {
    const p = path.join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!p.startsWith(dir) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : 'text/javascript' });
    fs.createReadStream(p).pipe(res);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = { ttsEngine: 'matcha', matchaVoice: 'web:male_voxcpm_2:elegancki', piperSpeed: 1 };
let failed = 0;
const check = (name, ok, got) => { console.log((ok ? '  ✓ ' : '  ✗ ') + name + (ok ? '' : '  (jest: ' + JSON.stringify(got) + ')')); if (!ok) failed++; };

(async () => {
    await new Promise((r) => srv.listen(0, r));
    const url = 'http://127.0.0.1:' + srv.address().port + '/src/offscreen/test.html';
    const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
    const fresh = async (settings) => {
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        page.on('pageerror', (e) => { console.log('  [błąd strony]', e.message); failed++; });
        await page.goto(url);
        await page.waitForFunction(() => window.__listeners && window.__listeners.length >= 4, null, { timeout: 10000 });
        await page.waitForTimeout(150);
        if (settings) await page.evaluate((s) => window.__send({ action: 'SETTINGS_PATCH', settings: s }), settings);
        return { ctx, page };
    };
    const played = (page) => page.evaluate(() => window.__plays.filter((p) => p.src.startsWith('blob:')).map((p) => (window.__urlText[p.src] || '?').split(' ')[0]));

    { const { ctx, page } = await fresh();   // A
        await page.evaluate((b) => { window.__send(Object.assign({ action: 'TTS_PLAY', id: '5|a|x', text: 'A1 zdanie ~400ms' }, b)); }, BASE);
        await sleep(60);
        await page.evaluate(() => window.__send({ action: 'TTS_PAUSE', tab: '5' }));
        await sleep(1200);
        const p = await played(page);
        check('A: zdanie liczone w chwili pauzy nie gra po pauzie', p.length === 0, p);
        await ctx.close(); }
    { const { ctx, page } = await fresh();   // B
        const txt = 'B1 nagrywane do przodu i zaraz czytane ~500ms';
        await page.evaluate(([b, t]) => window.__send(Object.assign({ action: 'TTS_PRELOAD', id: '5|b|x', text: t, startMs: 1000, endMs: 4000, nowMs: 0, lookaheadMin: 3 }, b)), [BASE, txt]);
        await sleep(120);
        await page.evaluate(([b, t]) => window.__send(Object.assign({ action: 'TTS_PLAY', id: '5|b|x', text: t, startMs: 1000, endMs: 4000, slotMs: 3000 }, b)), [BASE, txt]);
        await sleep(1500);
        const n = await page.evaluate((t) => window.__fakeMatcha.calls.filter((c) => c.text === t).length, txt);
        check('B: jedna synteza (czytanie czeka na nagrywanie do przodu)', n === 1, n);
        check('B: kwestia zagrała', (await played(page)).join() === 'B1', await played(page));
        await ctx.close(); }
    { const { ctx, page } = await fresh();   // C
        await page.evaluate((b) => window.__send(Object.assign({ action: 'TTS_PLAY', id: '5|c|x', text: 'C1 zdanie ~50ms ~2s' }, b)), BASE);
        await sleep(400);
        await page.evaluate(() => window.__send({ action: 'TTS_CLEAR_BUFFER', tab: '7' }));
        await sleep(150);
        const playing = await page.evaluate(() => !document.getElementById('tts-player').paused);
        check('C: czyszczenie z innej karty nie ucina lektora', playing, playing);
        await page.evaluate(() => window.__send({ action: 'TTS_CLEAR_BUFFER', tab: '5' }));
        await sleep(300);
        const stopped = await page.evaluate(() => document.getElementById('tts-player').paused);
        check('C: czyszczenie z tej karty zatrzymuje', stopped, stopped);
        const err = await page.evaluate(() => window.__sent.some((m) => m.action === 'OFFSCREEN_DIAG' && (m.entries || []).some((e) => e.tag === 'audio-error')));
        check('C: bez fałszywego „audio-error”', !err, err);
        await ctx.close(); }
    { const { ctx, page } = await fresh();   // D
        await page.evaluate((b) => { window.__sent.length = 0; for (let i = 0; i < 20; i++) window.__send(Object.assign({ action: 'TTS_PLAY', id: '5|d' + i + '|x', text: 'D' + i + ' ~20ms ~0.05s' }, b)); }, BASE);
        await sleep(1000);
        const n = await page.evaluate(() => window.__sent.filter((m) => m.action === 'OFFSCREEN_DIAG' && m.kind === 'log').length);
        check('D: dziennik najwyżej ~1 zapis na sekundę', n <= 2, n);
        await ctx.close(); }
    { const { ctx, page } = await fresh({ readToEnd: true });   // E
        await page.evaluate((b) => {
            window.__send(Object.assign({ action: 'TTS_PLAY', id: '5|e1|x', text: 'E1 ~600ms ~0.3s' }, b));
            window.__send(Object.assign({ action: 'TTS_PLAY', id: '5|e2|x', text: 'E2 ~50ms ~0.3s' }, b));
            window.__send(Object.assign({ action: 'TTS_PLAY', id: '5|e3|x', text: 'E3 ~50ms ~0.3s' }, b));
        }, BASE);
        await sleep(2500);
        const p = (await played(page)).join(',');
        check('E: „Czytaj do końca” — kolejność przyjścia', p === 'E1,E2,E3', p);
        await ctx.close(); }
    { const { ctx, page } = await fresh({ readToEnd: true });   // F
        await page.evaluate((b) => {
            window.__send(Object.assign({ action: 'TTS_PLAY', id: '5|f1|x', text: 'F1 ~50ms ~1.2s' }, b));
            window.__send(Object.assign({ action: 'TTS_PLAY', id: '5|f2|x', text: 'F2 ~50ms ~0.3s' }, b));
        }, BASE);
        await sleep(400);
        const st = await page.evaluate(() => window.__send({ action: 'TTS_PAUSE', reason: 'pause', tab: '5' }).then((r) => r && r.status));
        await sleep(1700);
        const p = (await played(page)).join(',');
        check('F: pauza przy „do końca” dokańcza zdanie, następne przepada', st === 'finishing' && p === 'F1', [st, p]);
        await ctx.close(); }
    { const { ctx, page } = await fresh();   // G
        await page.evaluate((b) => window.__send(Object.assign({ action: 'TTS_PLAY', id: '5|g1|x', text: 'G1 ~50ms ~2.5s', slotMs: 900 }, b)), BASE);
        await sleep(400);
        const rate = await page.evaluate(() => document.getElementById('tts-player').playbackRate);
        check('G: nadrabianie najwyżej 1,8× (kwestia 2,5 s w oknie 0,9 s)', Math.abs(rate - 1.8) < 0.01, rate);
        await page.evaluate((b) => { for (let i = 0; i < 7; i++) window.__send(Object.assign({ action: 'TTS_PLAY', id: '5|g' + (i + 2) + '|x', text: 'G' + (i + 2) + ' ~20ms ~0.4s' }, b)); }, BASE);
        await sleep(300);
        const s = await page.evaluate(() => new Promise((r) => window.__send({ action: 'TTS_STATS', tab: '5' }).then(r)));
        check('G: licznik pominiętych (nadmiar w kolejce)', s && s.skipped10m >= 1, s);
        check('G: opóźnienie lektora zmierzone', s && s.lagAvgMs != null && s.lagAvgMs >= 0, s);
        await ctx.close(); }

    { const fake = fakeTtsServer();   // H
        await new Promise((r) => fake.srv.listen(0, '127.0.0.1', r));
        const S = { ttsEngine: 'server', serverUrl: 'ws://127.0.0.1:' + fake.srv.address().port, serverVoice: 'moj_glos' };
        const { ctx, page } = await fresh(S);
        await page.evaluate((b) => window.__send(Object.assign({ action: 'TTS_PRELOAD', id: '5|h1|x', text: 'Nagrywane do przodu przez serwer.', startMs: 5000, endMs: 7000, nowMs: 0, lookaheadMin: 3 }, b)), S);
        await page.evaluate((b) => window.__send(Object.assign({ action: 'TTS_PLAY', id: '5|h2|x', text: 'Czytane teraz przez serwer.' }, b)), S);
        await sleep(1500);
        const pre = fake.got.find((m) => /do przodu/.test(m.text)), live = fake.got.find((m) => /teraz/.test(m.text));
        check('H: serwer dostał nagrywanie do przodu (pilne: false, głos, speed 1)', !!pre && pre.pilne === false && pre.voice === 'moj_glos' && pre.speed === 1, pre);
        check('H: serwer dostał kwestię czytaną teraz (pilne: true)', !!live && live.pilne === true, live);
        const n = await page.evaluate(() => window.__plays.filter((p) => p.src.startsWith('blob:')).length);
        check('H: odpowiedź serwera (WAV) zagrała', n === 1, n);
        await ctx.close();
        fake.srv.close(); }

    await browser.close();
    srv.close();
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(failed ? 'BŁĘDÓW: ' + failed : 'offscreen_e2e: OK');
    process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
