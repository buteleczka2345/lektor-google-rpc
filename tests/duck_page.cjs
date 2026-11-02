// Test „Ściszaj film tylko, gdy lektor mówi” (assets/lektor_scheduler.js) w Chromium: prawdziwy <video>, atrapa chrome.*,
// sygnały TTS_SPEAK / TTS_QUEUE_IDLE. Uruchom: node tests/duck_page.cjs
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const repo = path.resolve(__dirname, '..');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    let failed = 0;
    const check = (name, ok, got) => { console.log((ok ? '  ✓ ' : '  ✗ ') + name + (ok ? '' : '  (jest: ' + JSON.stringify(got) + ')')); if (!ok) failed++; };
    page.on('pageerror', (e) => { console.log('  [błąd strony]', e.message); failed++; });
    await page.setContent('<html><body><video id="v"></video></body></html>');
    await page.evaluate(() => {
        window.__msgL = [];
        window.chrome = { storage: { local: { get: (k, cb) => cb({ duckWhileSpeaking: true }) }, onChanged: { addListener() {} } },
            runtime: { onMessage: { addListener: (f) => window.__msgL.push(f) }, sendMessage() {} } };
        window.__send = (m) => window.__msgL.forEach((f) => f(m, {}, () => {}));
    });
    await page.addScriptTag({ content: fs.readFileSync(path.join(repo, 'assets/lektor_scheduler.js'), 'utf8') });
    await page.evaluate(() => {
        const v = document.getElementById('v'), S = window.__LektorSched;
        v.volume = 1;
        S.onDuck(() => { if (S.duckAllowed()) S.setVol(v, 0.2); }, () => S.setVol(v, 1));
    });
    const vol = () => page.evaluate(() => Math.round(document.getElementById('v').volume * 100) / 100);

    check('przed mową: film głośno, ściszanie zablokowane', (await vol()) === 1 && !(await page.evaluate(() => window.__LektorSched.duckAllowed())), await vol());
    await page.evaluate(() => window.__send({ action: 'TTS_SPEAK' }));
    await page.waitForTimeout(110);
    const mid = await vol();
    check('ściszanie płynne (w trakcie przejścia)', mid < 1 && mid > 0.2, mid);
    await page.waitForTimeout(300);
    check('podczas mowy: film ściszony do 20%', (await vol()) === 0.2, await vol());
    await page.evaluate(() => window.__send({ action: 'TTS_QUEUE_IDLE' }));
    await page.waitForTimeout(200);
    await page.evaluate(() => window.__send({ action: 'TTS_SPEAK' }));   // następne zdanie w ciągu 0,4 s — bez podgłaśniania
    await page.waitForTimeout(400);
    check('krótka przerwa między zdaniami: bez skoku głośności', (await vol()) === 0.2, await vol());
    await page.evaluate(() => window.__send({ action: 'TTS_QUEUE_IDLE' }));
    await page.waitForTimeout(800);
    check('po mowie: głośność wraca do 100%', (await vol()) === 1, await vol());

    await browser.close();
    console.log(failed ? 'BŁĘDÓW: ' + failed : 'duck_page: OK');
    process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
