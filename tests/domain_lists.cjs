// Test list domen lektora: assets/domain_lists.js (wspólne zasady) + assets/options_hooks.js (__LivedubOpts.asleep(),
// onSleep). Część 1 w Node (parsowanie, wypełnianie białej listy, wzorce), część 2 w Chromium na PRAWDZIWYCH nazwach domen
// (żądania przechwycone lokalnie, bez sieci): strona, subdomena, port, ramka odtwarzacza z innej domeny, przełącznik,
// zmiana listy na otwartej karcie. Uruchom: node tests/domain_lists.cjs
const fs = require('fs'), path = require('path'), vm = require('vm');
const { chromium } = require('playwright');
const repo = path.resolve(__dirname, '..');
const domSrc = fs.readFileSync(path.join(repo, 'assets/domain_lists.js'), 'utf8');
const hooks = fs.readFileSync(path.join(repo, 'assets/options_hooks.js'), 'utf8');

let failed = 0;
const check = (name, ok, got) => { console.log((ok ? '  ✓ ' : '  ✗ ') + name + (ok ? '' : '  (jest: ' + JSON.stringify(got) + ')')); if (!ok) failed++; };
const J = (x) => JSON.stringify(x);

// ---------- część 1: Node ----------
const box = { URL };
vm.createContext(box);
vm.runInContext(domSrc, box);
const D = box.__LektorDomains;
console.log('domain_lists.js (Node):');
const parsed = D.parse('YouTube.com\n# komentarz\n// też komentarz\nhttps://www.cda.pl/filmy?x=1\n*.vider.info, localhost:8080 ; 127.0.0.1\nnetflix.com  # dopisek po krzyżyku\nżółw.pl\n\n');
check('parsowanie: wielkie litery, adres, *., port, przecinki, komentarze, IDN',
    J(parsed) === J(['youtube.com', 'cda.pl', 'vider.info', 'localhost', '127.0.0.1', 'netflix.com', 'xn--w-uga1v8h.pl']), parsed);
check('subdomena pasuje, podobna nazwa nie', D.matches('m.youtube.com', ['youtube.com']) && !D.matches('notyoutube.com', ['youtube.com']));
const L = (w, b, on) => ({ domainWhitelist: w, domainBlacklist: b || '', domainListsOn: on });
check('stan: przełącznik wył. = zawsze działa', D.state('x.pl', '', L('youtube.com', '', false)).why === 'off');
check('stan: pusta biała = działa', D.state('x.pl', '', L('', '')).why === 'empty');
check('stan: strona spoza białej = śpi', D.state('x.pl', '', L('youtube.com')).why === 'notwhite');
check('stan: ramka obca na stronie z białej = działa', D.state('cda.pl', 'player.vimeo.com', L('cda.pl')).why === 'white');
check('stan: osadzony YouTube na obcej stronie = śpi', D.state('blog.example', 'youtube.com', L('youtube.com')).asleep === true);
check('stan: czarna lista domeny ramki = śpi', D.state('cda.pl', 'player.example.net', L('cda.pl', 'example.net')).why === 'black');
check('stan: czarna wygrywa z białą', D.state('netflix.com', '', L('netflix.com', 'netflix.com')).why === 'black');
const pats = D.patterns(['cda.pl', '127.0.0.1']);
check('wzorce rejestracji skryptów', J(pats) === J(['*://cda.pl/*', '*://*.cda.pl/*', '*://127.0.0.1/*']), pats);

const store = {
    domainWhitelist: '', domainBlacklist: 'rumble.com',
    lowcaSites: { 'cda.pl': { frames: ['ebd.cda.pl', 'player.vimeo.com'] }, 'www.filman.cc': { frames: [] } },
    customSources: { 'vider.info': ['.subs'], 'pusty.pl': [] },
    fileSubs: { page: 'https://www.ogladaj.to/film/1' },
    fileSubsMem: { 'https://kino.example.org/v?id=3': { page: 'https://kino.example.org/v?id=3' } },
    ocrToolRegions: { 'www.anime.example': { x: 1 } },
    popupLayout: { sites: { prime: 'primevideo.com, tvp.pl' } }
};
const f1 = D.fill('', store);
const list1 = D.parse(f1.text);
check('wypełnienie pustej listy: serwisy z manifestu', ['youtube.com', 'netflix.com', 'primevideo.com', 'iq.com', 'viki.com', 'bilibili.tv', 'max.com'].every((d) => list1.includes(d)), list1);
check('wypełnienie: Łowca (strony + odtwarzacze), Kreator, plik, baza, OCR, układ popupu',
    ['cda.pl', 'player.vimeo.com', 'filman.cc', 'vider.info', 'ogladaj.to', 'kino.example.org', 'anime.example', 'tvp.pl'].every((d) => list1.includes(d)), list1);
check('wypełnienie: bez domen z czarnej listy, bez subdomen już objętych, bez pustych wpisów Kreatora',
    !list1.includes('rumble.com') && !list1.includes('ebd.cda.pl') && !list1.includes('pusty.pl'), list1);
check('wypełnienie: nagłówki grup to komentarze (# …)', /^# Serwisy z wbudowanym lektorem$/m.test(f1.text) && /^# Łowca napisów/m.test(f1.text));
const own = 'moja.strona.pl\n# moje\n';
const f2 = D.fill(own, store);
check('lista wpisana ręcznie zostaje, brakujące dopisane na końcu', f2.text.indexOf(own.trim()) === 0 && D.parse(f2.text).includes('youtube.com'), f2.text.slice(0, 80));
check('drugie wypełnienie niczego nie dubluje', D.fill(f1.text, store).added.length === 0);
check('➕ Dodaj tę stronę: dopisuje raz', D.addHost('youtube.com\n', 'www.cda.pl') === 'youtube.com\ncda.pl\n' && D.addHost('cda.pl', 'm.cda.pl') === null);

// ---------- część 2: Chromium ----------
// strona z atrapą chrome.storage (listy domen) i — na życzenie — ramką odtwarzacza z innej domeny;
// window.__fire(zmiany) udaje chrome.storage.onChanged (zmiana listy na otwartej karcie)
const stub = (lists) => '<script>window.__chg = []; window.chrome = { storage: { local: { get: (k, cb) => cb(' + JSON.stringify(lists) + ') },'
    + ' onChanged: { addListener: (f) => window.__chg.push(f) } }, runtime: { onMessage: { addListener() {} } } };'
    + ' window.__fire = (ch) => window.__chg.forEach((f) => f(ch, "local"));</script>';

(async () => {
    const browser = await chromium.launch();
    async function open(url, lists, frameUrl) {
        const ctx = await browser.newContext();
        await ctx.route('**/*', (route) => {
            const u = route.request().url();
            const isFrame = frameUrl && u.startsWith(frameUrl);
            const html = '<html><body>' + stub(lists) + (!isFrame && frameUrl ? '<iframe src="' + frameUrl + '"></iframe>' : '') + '</body></html>';
            route.fulfill({ status: 200, contentType: 'text/html', body: html });
        });
        const page = await ctx.newPage();
        await page.goto(url);
        let target = page.mainFrame();
        if (frameUrl) {
            for (let i = 0; i < 50 && !(target = page.frames().find((f) => f.url().startsWith(frameUrl))); i++) await page.waitForTimeout(50);
            if (!target) throw new Error('brak ramki ' + frameUrl);
        }
        await target.addScriptTag({ content: domSrc });
        await target.addScriptTag({ content: hooks });
        return { ctx, target };
    }
    async function asleepAt(url, lists, frameUrl) {
        const { ctx, target } = await open(url, lists, frameUrl);
        const r = await target.evaluate(() => window.__LivedubOpts.asleep());
        await ctx.close();
        return r;
    }
    const WL = { domainWhitelist: 'youtube.com\n# komentarz\n// też komentarz\nhttps://www.cda.pl/filmy\n', domainBlacklist: '' };
    const BL = { domainWhitelist: '', domainBlacklist: 'netflix.com' };
    console.log('options_hooks.js w Chromium:');
    let r;
    check('pusta lista: lektor działa wszędzie', (r = await asleepAt('https://www.example.com/', { domainWhitelist: '', domainBlacklist: '' })) === false, r);
    check('biała lista: youtube.com działa', (r = await asleepAt('https://www.youtube.com/watch?v=1', WL)) === false, r);
    check('biała lista: m.youtube.com (subdomena) działa', (r = await asleepAt('https://m.youtube.com/watch?v=1', WL)) === false, r);
    check('biała lista: wpis z adresem (https://www.cda.pl/filmy) działa dla cda.pl', (r = await asleepAt('https://www.cda.pl/video/1', WL)) === false, r);
    check('biała lista: netflix.com spoza listy — uśpiony', (r = await asleepAt('https://www.netflix.com/watch/1', WL)) === true, r);
    check('biała lista: notyoutube.com nie udaje youtube.com — uśpiony', (r = await asleepAt('https://notyoutube.com/', WL)) === true, r);
    check('czarna lista: netflix.com — uśpiony', (r = await asleepAt('https://www.netflix.com/watch/1', BL)) === true, r);
    check('czarna lista: youtube.com — działa', (r = await asleepAt('https://www.youtube.com/watch?v=1', BL)) === false, r);
    check('biała lista z portem (localhost:8080) działa na localhost:8080',
        (r = await asleepAt('http://localhost:8080/film', { domainWhitelist: 'localhost:8080', domainBlacklist: '' })) === false, r);
    check('przełącznik „Tylko domeny z listy” wył.: netflix.com spoza białej listy działa',
        (r = await asleepAt('https://www.netflix.com/watch/1', Object.assign({ domainListsOn: false }, WL))) === false, r);
    // ramka odtwarzacza z innej domeny — liczy się strona z paska adresu
    check('biała lista: ramka odtwarzacza (player.vimeo.com) na cda.pl — działa',
        (r = await asleepAt('https://www.cda.pl/video/1', WL, 'https://player.vimeo.com/video/1')) === false, r);
    check('biała lista: osadzony YouTube na stronie spoza listy — uśpiony',
        (r = await asleepAt('https://blog.example.org/wpis', WL, 'https://www.youtube.com/embed/1')) === true, r);
    check('czarna lista: ramka odtwarzacza na netflix.com — uśpiona',
        (r = await asleepAt('https://www.netflix.com/watch/1', BL, 'https://player.example.net/x')) === true, r);
    check('czarna lista z domeną ramki (player.example.net) — ramka uśpiona także na cda.pl',
        (r = await asleepAt('https://www.cda.pl/video/1', { domainWhitelist: 'cda.pl', domainBlacklist: 'example.net' }, 'https://player.example.net/x')) === true, r);

    // zmiana listy na otwartej karcie → onSleep(true / false), bez odświeżania
    {
        const { ctx, target } = await open('https://www.cda.pl/video/1', { domainWhitelist: 'cda.pl', domainBlacklist: '' });
        const seq = await target.evaluate(() => {
            const out = [];
            window.__LivedubOpts.onSleep((a) => out.push(a));
            window.__fire({ domainWhitelist: { newValue: 'youtube.com' } });   // strona wypada z listy
            window.__fire({ domainWhitelist: { newValue: 'youtube.com\ncda.pl' } });   // ➕ Dodaj tę stronę
            window.__fire({ domainListsOn: { newValue: false } });   // przełącznik wył. — dalej działa, bez powiadomienia
            window.__fire({ domainWhitelist: { newValue: 'youtube.com' } });
            window.__fire({ domainListsOn: { newValue: true } });   // przełącznik wł. — strona poza listą: śpi
            return out;
        });
        check('zmiana listy na otwartej karcie: uśpij → obudź → (wył.) → uśpij', J(seq) === J([true, false, true]), seq);
        await ctx.close();
    }

    await browser.close();
    console.log(failed ? 'BŁĘDÓW: ' + failed : 'domain_lists: OK');
    process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
