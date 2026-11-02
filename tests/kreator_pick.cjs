// Test „🧪 Kreator napisów → 🎯 Wskaż myszką” (assets/options_hooks.js) i czytania z własnego źródła (assets/dom_content.js).
// Część 1: same strony (Chromium) — co łapie ramka pod kursorem przy różnych układach napisów.
// Część 2: PRAWDZIWE rozszerzenie (nowy headless) — strona Ustawień → wskazywanie myszką na karcie z filmem (ramka,
// szerzej / węziej, klik, Esc), zapis i to, co lektor naprawdę wysyła do czytania (TTS_PLAY łapane w tle rozszerzenia).
// Film gra naprawdę (strumień z canvasa) — lektor czyta tylko przy grającym filmie. Uruchom: node tests/kreator_pick.cjs
const fs = require('fs'), path = require('path'), os = require('os');
const { chromium } = require('playwright');
const repo = path.resolve(__dirname, '..');
const domSrc = fs.readFileSync(path.join(repo, 'assets/domain_lists.js'), 'utf8');
const hooks = fs.readFileSync(path.join(repo, 'assets/options_hooks.js'), 'utf8');

let failed = 0;
const check = (name, ok, got) => { console.log((ok ? '  ✓ ' : '  ✗ ') + name + (ok ? '' : '  (jest: ' + JSON.stringify(got) + ')')); if (!ok) failed++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// odtwarzacz: film (strumień z canvasa), tytuł nad filmem, napis dwuliniowy, pasek sterowania, tekst nad i pod odtwarzaczem
// z tą samą klasą co linie napisu; pe = pointer-events warstwy napisów (none = jak w większości odtwarzaczy)
function playerPage(pe) {
    return '<!doctype html><html><head><meta charset="utf-8"><title>Film</title></head>'
        + '<body style="margin:0;background:#111;color:#eee;font:18px sans-serif">'
        + '<div class="page-header" style="padding:8px"><span class="sub-line">Polecane: inne filmy</span></div>'
        + '<div id="player" style="position:relative;width:960px;height:540px;background:#000;margin:10px 20px">'
        + '<video id="v" muted playsinline style="width:100%;height:100%"></video>'
        + '<div class="title-bar" style="position:absolute;top:10px;left:10px">Odcinek 12 — Tytuł odcinka</div>'
        + '<div class="subs-layer" style="position:absolute;left:0;right:0;bottom:60px;text-align:center;pointer-events:' + (pe || 'none') + '">'
        + '<div class="cue" style="display:inline-block;background:rgba(0,0,0,.6);padding:4px 10px">'
        + '<span class="sub-line">Pierwsza linia napisu jest tutaj.</span><br><span class="sub-line">Druga linia, też ważna dla widza.</span></div></div>'
        + '<div class="controls" style="position:absolute;bottom:0;left:0;right:0;height:40px;background:#222"><button>▶</button> <span class="time">01:23 / 45:00</span></div>'
        + '</div>'
        + '<div class="comments" style="padding:8px"><p class="comment">Świetny odcinek, polecam!</p></div>'
        + '<script>(function(){var c=document.createElement("canvas");c.width=64;c.height=36;var g=c.getContext("2d");var n=0;'
        + 'setInterval(function(){g.fillStyle="hsl("+(n++%360)+",50%,40%)";g.fillRect(0,0,64,36);},100);'
        + 'var v=document.getElementById("v");v.srcObject=c.captureStream(10);v.play().catch(function(){});})();'
        + 'window.__setCue=function(a,b){var s=document.querySelectorAll(".cue .sub-line");s[0].textContent=a;s[1].textContent=b;};</script>'
        + '</body></html>';
}
// napisy jak na YouTube: okno napisów → tekst → linie → segmenty, w odtwarzaczu z filmem i tytułem
const ytPage = '<!doctype html><html><body style="margin:0;font:18px sans-serif">'
    + '<div id="movie_player" class="html5-video-player" style="position:relative;width:960px;height:540px;background:#000">'
    + '<video style="width:100%;height:100%"></video><div class="ytp-title" style="position:absolute;top:8px;left:8px;color:#fff">Tytuł filmu na YouTube</div>'
    + '<div class="ytp-caption-window-container" style="position:absolute;left:0;right:0;bottom:50px;text-align:center">'
    + '<div class="caption-window" style="display:inline-block"><span class="captions-text">'
    + '<span class="caption-visual-line" style="display:block"><span class="ytp-caption-segment" style="background:#000;color:#fff">To jest pierwsza linia</span></span>'
    + '<span class="caption-visual-line" style="display:block"><span class="ytp-caption-segment" style="background:#000;color:#fff">a to druga linia napisu</span></span>'
    + '</span></div></div></div></body></html>';

(async () => {
    // ---------- część 1: co łapie ramka ----------
    console.log('1) Ramka pod kursorem (same strony):');
    const browser = await chromium.launch();
    const pg = await browser.newPage({ viewport: { width: 1100, height: 760 } });
    const prep = async (html) => {
        await pg.setContent(html);
        await pg.evaluate(() => { window.chrome = { storage: { local: { get: (k, cb) => cb({}) }, onChanged: { addListener() {} } }, runtime: { onMessage: { addListener() {} }, sendMessage() {} } }; });
        await pg.addScriptTag({ content: domSrc });
        await pg.addScriptTag({ content: hooks });
    };
    // co wybierze ramka w punkcie (x, y): element pod kursorem, domyślny poziom, selektor i liczba trafień
    const probe = (x, y, d) => pg.evaluate(([x, y, d]) => {
        const K = window.__LivedubOpts.kreator, hit = K.hitAt(x, y);
        if (!hit) return null;
        const chain = K.chainFor(hit), lvl = Math.max(0, Math.min(chain.length - 1, K.autoLevel(chain) + (d || 0))), el = chain[lvl];
        const sel = K.buildSelector(el), m = document.querySelectorAll(sel);
        return { hit: hit.className || hit.tagName, el: el.className || el.tagName, sel, n: m.length, text: (el.innerText || '').replace(/\s+/g, ' ').trim(),
            texts: Array.from(m).map((e) => (e.innerText || '').replace(/\s+/g, ' ').trim()) };
    }, [x, y, d]);
    const center = async (sel, i) => { const b = await pg.locator(sel).nth(i || 0).boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };

    await prep(playerPage('none'));
    let [x, y] = await center('.cue .sub-line', 0);
    let r = await probe(x, y);
    check('warstwa napisów BEZ kliknięć (pointer-events: none): ramka łapie napis, nie film', r && r.hit === 'sub-line', r);
    check('domyślnie cały napis (obie linie), selektor tylko na napis', r && r.el === 'cue' && r.n === 1 && /Pierwsza linia.*Druga linia/.test(r.text), r);
    r = await probe(x, y, -1);
    check('„węziej” (kółko w dół): jedna linia — selektor zawężony przodkiem, bez „Polecane…” nad filmem',
        r && r.el === 'sub-line' && r.n === 2 && r.texts.every((t) => !/Polecane/.test(t)), r);
    r = await probe(x, y, 1);
    check('„szerzej” (kółko w górę): warstwa napisów — dalej sam napis', r && r.el === 'subs-layer' && /Pierwsza linia.*Druga linia/.test(r.text) && !/Odcinek/.test(r.text), r);
    [x, y] = await center('.cue .sub-line', 1);
    r = await probe(x, y);
    check('najechanie na DRUGĄ linię też łapie cały napis', r && r.el === 'cue' && r.n === 1, r);
    [x, y] = await center('.title-bar', 0);
    r = await probe(x, y);
    check('tytuł odcinka to osobna ramka (nie miesza się z napisem)', r && r.el === 'title-bar' && !/Pierwsza/.test(r.text), r);

    await prep(ytPage);
    [x, y] = await center('.ytp-caption-segment', 0);
    r = await probe(x, y);
    check('napisy jak na YouTube: ramka łapie obie linie (captions-text), selektor bez tytułu filmu',
        r && /captions-text|caption-window/.test(r.el) && /pierwsza linia a to druga/.test(r.text) && r.n === 1, r);
    await browser.close();

    // ---------- część 2: prawdziwe rozszerzenie ----------
    console.log('2) Rozszerzenie: Ustawienia → 🎯 Wskaż myszką → zapis → lektor czyta:');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kreator-'));
    const ctx = await chromium.launchPersistentContext(dir, { channel: 'chromium', viewport: { width: 1100, height: 760 },
        args: ['--disable-extensions-except=' + repo, '--load-extension=' + repo, '--autoplay-policy=no-user-gesture-required'] });
    try {
        await ctx.route(/^https:\/\/(www\.dailymotion\.com|kino\.example\.org|player\.example-cdn\.net)\//, (route) => {
            const u = route.request().url();
            const body = u.startsWith('https://kino.example.org/')
                ? '<!doctype html><html><body style="margin:0;background:#222"><h1 style="color:#eee;font:20px sans-serif;margin:8px">Kino — film</h1>'
                    + '<iframe src="https://player.example-cdn.net/embed/7" style="width:1000px;height:600px;border:0"></iframe></body></html>'
                : playerPage('none');
            route.fulfill({ status: 200, contentType: 'text/html', body });
        });
        let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 30000 });
        await sw.evaluate(() => {
            chrome.storage.local.set({ uiLang: 'pl' });
            globalThis.__rec = [];
            chrome.runtime.onMessage.addListener((m) => { if (m && m.action === 'TTS_PLAY') globalThis.__rec.push(m.text); });
        });
        const rec = () => sw.evaluate(() => globalThis.__rec.slice());
        const clearRec = () => sw.evaluate(() => { globalThis.__rec.length = 0; });
        const storeGet = (k) => sw.evaluate((k) => chrome.storage.local.get(k), k);
        const until = async (fn, ms) => { const t0 = Date.now(); let v; while (Date.now() - t0 < (ms || 6000)) { v = await fn(); if (v) return v; await wait(200); } return v; };
        await wait(1000);

        const page = await ctx.newPage();
        await page.goto('https://www.dailymotion.com/video/x1');
        await page.waitForFunction(() => { const v = document.getElementById('v'); return v && !v.paused && v.currentTime > 0.2; });
        const opt = await ctx.newPage();
        await opt.goto('chrome-extension://' + new URL(sw.url()).host + '/src/options/options.html');
        await opt.waitForSelector('#kSel');
        const kResult = () => opt.$eval('#kResult', (e) => e.textContent);
        const label = () => page.evaluate(() => { const b = document.querySelector('[data-lektor-pick] b'); return b ? b.parentElement.innerText.replace(/\s+/g, ' ') : ''; });
        const boxShown = () => page.evaluate(() => Array.from(document.querySelectorAll('[data-lektor-pick]')).some((e) => e.style.display === 'block' && /solid/.test(e.style.border)));

        await opt.click('button:has-text("Wskaż myszką")');
        await page.bringToFront();
        await until(async () => (await page.evaluate(() => document.querySelectorAll('[data-lektor-pick]').length)) > 0, 4000);
        check('po „Wskaż myszką”: film stoi (napis nie znika)', await page.evaluate(() => document.getElementById('v').paused));
        const b1 = await page.locator('.cue .sub-line').first().boundingBox();
        await page.mouse.move(b1.x + 20, b1.y + b1.height / 2);
        await page.mouse.move(b1.x + b1.width / 2, b1.y + b1.height / 2, { steps: 4 });
        await until(async () => /Lektor złapie/.test(await label()), 4000);
        const l1 = await label();
        check('niebieska ramka + podgląd: „Lektor złapie: Pierwsza linia… Druga linia…”', (await boxShown()) && /Lektor złapie:.*Pierwsza linia.*Druga linia/.test(l1), l1);
        await page.mouse.wheel(0, 120);   // węziej
        await until(async () => /poziom 1 \//.test(await label()), 3000);
        const l2 = await label();
        check('kółko myszy w dół: węziej (jedna linia)', /Lektor złapie:.*„Pierwsza linia napisu jest tutaj\.”/.test(l2) && !/Druga linia/.test(l2.split('🎯')[0]), l2);
        await page.mouse.wheel(0, -120);  // z powrotem szerzej
        await until(async () => /Druga linia/.test(await label()), 3000);
        await page.mouse.click(b1.x + b1.width / 2, b1.y + b1.height / 2);
        await until(async () => /Wskazano/.test(await kResult()), 4000);
        const sel = await opt.$eval('#kSel', (e) => e.value);
        check('klik: Ustawienia dostają selektor całego napisu i domenę', sel === 'div.cue' && (await opt.$eval('#kHost', (e) => e.value)) === 'dailymotion.com', sel);
        check('po wyborze: ramki znikają, film gra dalej', (await page.evaluate(() => document.querySelectorAll('[data-lektor-pick]').length)) === 0 && !(await page.evaluate(() => document.getElementById('v').paused)));
        await opt.click('button:has-text("Testuj selektor")');
        await until(async () => /Znaleziono/.test(await kResult()), 4000);
        check('🧪 Testuj selektor: 1 miejsce, cały napis', /Znaleziono: 1\n• Pierwsza linia napisu jest tutaj\.\s*Druga linia/.test(await kResult()), await kResult());
        await opt.click('button:has-text("Dodaj")');
        await until(async () => { const c = (await storeGet('customSources')).customSources; return c && c['dailymotion.com']; }, 4000);
        await page.bringToFront();
        await clearRec();
        await page.evaluate(() => window.__setCue('Nowy napis, pierwsza linia.', 'I jego druga linia, też do przeczytania.'));
        const said1 = await until(async () => (await rec()).find((t) => /Nowy napis/.test(t)), 8000);
        check('lektor czyta CAŁY napis (obie linie) z wybranego miejsca', said1 === 'Nowy napis, pierwsza linia. I jego druga linia, też do przeczytania.', await rec());
        check('lektor nie czyta tekstów obok napisu (Polecane…, tytuł)', !(await rec()).some((t) => /Polecane|Odcinek 12/.test(t)), await rec());

        // linia po linii (selektor jednej linii) — dawniej lektor czytał tylko drugą linię
        await sw.evaluate(() => chrome.storage.local.set({ customSources: { 'dailymotion.com': ['div.cue span.sub-line'] } }));
        await wait(1200);
        await clearRec();
        await page.evaluate(() => window.__setCue('Trzeci napis, linia pierwsza.', 'Linia druga trzeciego napisu.'));
        const said2 = await until(async () => (await rec()).find((t) => /Trzeci napis|Linia druga trzeciego/.test(t)), 8000);
        check('selektor jednej linii (span ×2): lektor czyta obie linie razem, w kolejności', said2 === 'Trzeci napis, linia pierwsza. Linia druga trzeciego napisu.', await rec());

        // Esc anuluje, film wraca
        await opt.bringToFront();
        await opt.click('button:has-text("Wskaż myszką")');
        await page.bringToFront();
        await until(async () => (await page.evaluate(() => document.querySelectorAll('[data-lektor-pick]').length)) > 0, 4000);
        await page.keyboard.press('Escape');
        await until(async () => /anulowane/.test(await kResult()), 4000);
        check('Esc: wskazywanie anulowane, film gra dalej', /anulowane/.test(await kResult()) && !(await page.evaluate(() => document.getElementById('v').paused)), await kResult());

        // obca strona (bez lektora) z odtwarzaczem w ramce z innej domeny
        console.log('3) Strona bez wbudowanego lektora, odtwarzacz w ramce innej domeny:');
        await page.goto('https://kino.example.org/film/7');
        const fr = await until(async () => page.frames().find((f) => f.url().startsWith('https://player.example-cdn.net/')), 6000);
        await fr.waitForFunction(() => { const v = document.getElementById('v'); return v && !v.paused && v.currentTime > 0.2; });
        await opt.bringToFront();
        await opt.$eval('#kHost', (e) => { e.value = ''; });
        await opt.click('button:has-text("Wskaż myszką")');
        await until(async () => /Przełącz się/.test(await kResult()), 6000);
        check('Kreator działa też na stronie bez lektora (narzędzia dołożone na żądanie)', /Przełącz się na kartę z filmem/.test(await kResult()), await kResult());
        await page.bringToFront();
        const fb = await fr.locator('.cue .sub-line').first().boundingBox();
        await page.mouse.move(fb.x + 10, fb.y + fb.height / 2);
        await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2, { steps: 4 });
        await until(async () => /Lektor złapie/.test(await fr.evaluate(() => { const b = document.querySelector('[data-lektor-pick] b'); return b ? b.parentElement.innerText : ''; })), 4000);
        await page.mouse.click(fb.x + fb.width / 2, fb.y + fb.height / 2);
        await until(async () => /Wskazano/.test(await kResult()), 4000);
        check('ramka odtwarzacza: selektor dla domeny odtwarzacza', (await opt.$eval('#kHost', (e) => e.value)) === 'player.example-cdn.net' && (await opt.$eval('#kSel', (e) => e.value)) === 'div.cue', [await opt.$eval('#kHost', (e) => e.value), await opt.$eval('#kSel', (e) => e.value)]);
        check('wybór w ramce kończy wskazywanie także na stronie głównej', (await page.evaluate(() => document.querySelectorAll('[data-lektor-pick]').length)) === 0);
        await opt.click('button:has-text("Dodaj")');
        const site = await until(async () => { const r = await storeGet(['lowcaSites', 'domainWhitelist']); return r.lowcaSites && r.lowcaSites['kino.example.org'] && r; }, 6000);
        check('💾 Dodaj: strona zapamiętana (lektor startuje tam sam) i dopisana do białej listy',
            !!site && (site.lowcaSites['kino.example.org'].frames || []).includes('player.example-cdn.net') && /^kino\.example\.org$/m.test(site.domainWhitelist || ''), site);
        await page.bringToFront();
        await clearRec();
        await fr.evaluate(() => window.__setCue('Napis z ramki, pierwsza linia.', 'I druga linia z ramki.'));
        const said3 = await until(async () => (await rec()).find((t) => /Napis z ramki/.test(t)), 10000);
        check('lektor od razu (bez odświeżania) czyta napis z ramki odtwarzacza', said3 === 'Napis z ramki, pierwsza linia. I druga linia z ramki.', await rec());
    } finally {
        await ctx.close();
    }
    console.log(failed ? 'BŁĘDÓW: ' + failed : 'kreator_pick: OK');
    process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
