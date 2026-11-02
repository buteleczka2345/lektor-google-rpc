// Test „📋 Tylko domeny z listy” na PRAWDZIWYM rozszerzeniu w Chromium (nowy tryb headless, świeży profil).
// Strony z prawdziwymi nazwami domen są podstawione lokalnie (ctx.route) — Chrome wstrzykuje do nich skrypty lektora
// jak na prawdziwym serwisie; stan skryptów sprawdzamy w ich świecie izolowanym (chrome.scripting z tła rozszerzenia).
// Sprawdza: jednorazowe wypełnienie białej listy, usypianie / budzenie skryptów na otwartej karcie, przełącznik,
// czarną listę, ramki odtwarzaczy, rejestrację Łowcy i przycisku CC tylko na domenach z listy, popup i stronę ustawień.
// Uruchom: node tests/extension_domains.cjs
const fs = require('fs'), path = require('path'), os = require('os');
const { chromium } = require('playwright');
const repo = path.resolve(__dirname, '..');

let failed = 0;
const check = (name, ok, got) => { console.log((ok ? '  ✓ ' : '  ✗ ') + name + (ok ? '' : '  (jest: ' + JSON.stringify(got) + ')')); if (!ok) failed++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lektor-ext-'));
    const ctx = await chromium.launchPersistentContext(dir, {
        channel: 'chromium',
        args: ['--disable-extensions-except=' + repo, '--load-extension=' + repo]
    });
    try {
        // strony serwisów: pusty dokument (opcjonalnie z ramką odtwarzacza)
        const frames = {};   // adres strony → adres ramki
        await ctx.route(/^https?:\/\/[^/]*(netflix|rumble|cda|vimeo|youtube|example)\.[^/]+\//, (route) => {
            const u = route.request().url();
            const fr = Object.keys(frames).find((k) => u.startsWith(k));
            route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><head><title>t</title></head><body><p>film</p>'
                + (fr ? '<iframe src="' + frames[fr] + '"></iframe>' : '') + '</body></html>' });
        });
        let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 30000 });
        const SW = async (fn, arg) => {
            for (let i = 0; i < 3; i++) {
                try { return await sw.evaluate(fn, arg); } catch (e) {
                    sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 30000 });
                }
            }
            return sw.evaluate(fn, arg);
        };
        const store = (patch) => SW((p) => chrome.storage.local.set(p), patch);
        const get = (keys) => SW((k) => chrome.storage.local.get(k), keys);
        // stan list w każdej ramce karty — w świecie izolowanym skryptów lektora
        const states = (urlPart) => SW(async (part) => {
            const tabs = await chrome.tabs.query({});
            const tab = tabs.find((t) => (t.url || '').includes(part));
            if (!tab) return null;
            const res = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: () => {
                const O = window.__LivedubOpts;
                return { url: location.href, has: !!O, top: O ? O.topHost() : '', st: O ? O.domainState() : null };
            } });
            return res.map((r) => r.result);
        }, urlPart);
        const until = async (fn, ms) => { const t0 = Date.now(); let v; while (Date.now() - t0 < (ms || 5000)) { v = await fn(); if (v) return v; await wait(150); } return v; };

        await store({ uiLang: 'pl' });   // testowy Chromium ma język angielski — interfejs po polsku, jak u użytkownika
        console.log('1) Pierwsze uruchomienie — biała lista wypełniona domenami lektora:');
        let st = await until(async () => { const r = await get(['domainWhitelist', 'domainWhitelistFillV1']); return r.domainWhitelistFillV1 && r; });
        const D = await SW(() => globalThis.__LektorDomains.parse.toString().length > 0);
        check('tło rozszerzenia działa (wspólny moduł list wczytany)', D === true, D);
        const wl0 = String((st && st.domainWhitelist) || '');
        check('domainWhitelistFillV1 + serwisy z manifestu na liście', ['youtube.com', 'netflix.com', 'primevideo.com', 'rumble.com', 'viki.com', 'bilibili.tv', 'max.com'].every((d) => new RegExp('^' + d.replace('.', '\\.') + '$', 'm').test(wl0)), wl0);
        check('przełącznik „Tylko domeny z listy” domyślnie WŁ. (brak zapisu = WŁ.)', (await get('domainListsOn')).domainListsOn === undefined);

        console.log('2) Netflix — strona z listy, potem usunięta z listy na otwartej karcie:');
        const page = await ctx.newPage();
        await page.goto('https://www.netflix.com/watch/1');
        let s1 = await until(async () => { const r = await states('netflix.com/watch'); return r && r[0] && r[0].has && r; });
        check('skrypty lektora wstrzyknięte, strona na liście → działa', s1 && s1[0].st && s1[0].st.asleep === false && s1[0].st.why === 'white', s1);
        await store({ domainWhitelist: wl0.replace(/^netflix\.com\n/m, '') });
        s1 = await until(async () => { const r = await states('netflix.com/watch'); return r && r[0].st && r[0].st.asleep && r; });
        check('netflix.com usunięty z listy → lektor na otwartej karcie śpi (bez odświeżania)', s1 && s1[0].st.why === 'notwhite', s1);
        await store({ domainListsOn: false });
        s1 = await until(async () => { const r = await states('netflix.com/watch'); return r && r[0].st && !r[0].st.asleep && r; });
        check('przełącznik wył. → lektor znów działa', s1 && s1[0].st.why === 'off', s1);
        await store({ domainListsOn: true, domainWhitelist: wl0 });
        s1 = await until(async () => { const r = await states('netflix.com/watch'); return r && r[0].st && r[0].st.why === 'white' && r; });
        check('przełącznik wł. + domena z powrotem na liście → działa', !!s1, s1);

        console.log('3) Czarna lista i osadzony YouTube na obcej stronie:');
        await store({ domainBlacklist: 'rumble.com' });
        await page.goto('https://rumble.com/v1-film.html');
        let s2 = await until(async () => { const r = await states('rumble.com/v1'); return r && r[0] && r[0].has && r; });
        check('rumble.com na czarnej liście → śpi', s2 && s2[0].st.asleep === true && s2[0].st.why === 'black', s2);
        frames['https://blog.example.org/'] = 'https://www.youtube.com/embed/abc';
        await page.goto('https://blog.example.org/wpis');
        let s3 = await until(async () => { const r = await states('blog.example.org'); const f = r && r.find((x) => x && x.url.includes('youtube.com/embed')); return f && f.has && f; });
        check('YouTube w ramce na stronie spoza listy → ramka śpi (liczy się strona z paska adresu)', s3 && s3.top === 'blog.example.org' && s3.st.asleep === true, s3);

        console.log('4) Łowca: zapamiętana strona startuje sama tylko, gdy jest na liście:');
        await store({ lowcaSites: { 'cda.pl': { frames: ['player.vimeo.com'], ts: Date.now(), hits: 1 } } });
        await wait(800);
        let reg = await SW(() => chrome.scripting.getRegisteredContentScripts());
        check('cda.pl spoza białej listy → skrypty Łowcy NIE zarejestrowane', !reg.some((r) => r.id.indexOf('lowca-auto') === 0), reg.map((r) => r.id));
        await store({ domainWhitelist: wl0 + 'cda.pl\n' });
        reg = await until(async () => { const r = await SW(() => chrome.scripting.getRegisteredContentScripts()); return r.some((x) => x.id === 'lowca-auto-lektor') && r; });
        const lek = reg && reg.find((x) => x.id === 'lowca-auto-lektor');
        check('cda.pl dopisany → Łowca + lektor zarejestrowane (strona i ramka odtwarzacza)', !!lek && lek.matches.includes('*://*.cda.pl/*') && lek.matches.includes('*://player.vimeo.com/*'), lek && lek.matches);
        frames['https://www.cda.pl/'] = 'https://player.vimeo.com/video/1';
        await page.goto('https://www.cda.pl/video/1');
        let s4 = await until(async () => { const r = await states('cda.pl/video'); const f = r && r.find((x) => x && x.url.includes('player.vimeo.com')); return f && f.has && r; });
        const fr4 = s4 && s4.find((x) => x.url.includes('player.vimeo.com'));
        check('ramka player.vimeo.com na cda.pl → lektor w ramce działa', fr4 && fr4.st.asleep === false && fr4.top === 'cda.pl', s4);

        console.log('5) Przycisk CC Łowcy (GUI) — tylko na domenach z listy:');
        await store({ lowcaGui: true });
        let cc = await until(async () => { const r = await SW(() => chrome.scripting.getRegisteredContentScripts({ ids: ['lektor-cc-stub'] })); return r[0]; });
        check('lista WŁ. → przycisk tylko na domenach z białej listy, bez czarnej', cc && cc.matches.includes('*://*.youtube.com/*') && !cc.matches.includes('https://*/*') && (cc.excludeMatches || []).includes('*://*.rumble.com/*'), cc);
        await store({ domainListsOn: false });
        cc = await until(async () => { const r = await SW(() => chrome.scripting.getRegisteredContentScripts({ ids: ['lektor-cc-stub'] })); return r[0] && r[0].matches.includes('https://*/*') && r[0]; });
        check('lista WYŁ. → przycisk na każdej stronie (jak dawniej)', !!cc, cc);
        await store({ domainListsOn: true, lowcaGui: false });

        console.log('6) Popup — karta „📋 Tylko domeny z listy”:');
        const extId = new URL(sw.url()).host;
        const pop = await ctx.newPage();
        await pop.addInitScript(() => {   // aktywna karta = strona spoza listy
            const fake = [{ id: 999999, url: 'https://www.example.org/film/2', active: true }];
            const q = chrome.tabs.query.bind(chrome.tabs);
            chrome.tabs.query = (info, cb) => { if (info && info.active) { if (cb) { cb(fake); return; } return Promise.resolve(fake); } return q(info, cb); };
        });
        await pop.goto('chrome-extension://' + extId + '/src/popup/popup.html');
        const line = () => pop.$eval('#domainStateLine', (e) => e.textContent);
        await until(async () => /example\.org/.test(await line()), 5000);
        check('strona spoza listy: „💤 … śpi” + przycisk „➕ Dodaj tę stronę”', /^💤 example\.org/.test(await line()) && await pop.isVisible('#domainAddBtn'), await line());
        await pop.click('#domainAddBtn');
        await until(async () => /^✅/.test(await line()), 5000);
        const wl1 = (await get('domainWhitelist')).domainWhitelist;
        check('„➕ Dodaj tę stronę” dopisuje example.org do białej listy', /^example\.org$/m.test(wl1) && /^✅ example\.org/.test(await line()), await line());
        await pop.click('#domainListsCheck');
        await until(async () => /^🌍/.test(await line()), 5000);
        check('odznaczenie przełącznika w popupie → domainListsOn = false', (await get('domainListsOn')).domainListsOn === false && /^🌍 Wyłączone/.test(await line()), await line());
        await pop.click('#domainListsCheck');
        await pop.close();

        console.log('7) Ustawienia — „📥 Wpisz domeny lektora”:');
        await store({ domainWhitelist: 'moja.strona.pl\n', customSources: { 'vider.info': ['.napisy'] } });
        const opt = await ctx.newPage();
        await opt.goto('chrome-extension://' + extId + '/src/options/options.html#domeny');
        await opt.waitForSelector('#domeny');
        await opt.click('#domeny button:has-text("Wpisz domeny lektora")');
        const wl2 = await until(async () => { const r = (await get('domainWhitelist')).domainWhitelist; return /vider\.info/.test(r) && r; });
        check('dopisuje brakujące (serwisy, Łowca, Kreator), zostawia wpisane ręcznie', !!wl2 && wl2.indexOf('moja.strona.pl') === 0 && /^youtube\.com$/m.test(wl2) && /^cda\.pl$/m.test(wl2) && /^vider\.info$/m.test(wl2), wl2);
        const chk = await opt.$eval('#domeny input[type=checkbox]', (e) => e.checked);
        check('przełącznik w ustawieniach pokazuje stan (WŁ.)', chk === true, chk);
        await opt.close();
    } finally {
        await ctx.close();
    }
    console.log(failed ? 'BŁĘDÓW: ' + failed : 'extension_domains: OK');
    process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
