// Test wyrównania tłumaczeń paczkami (src/background/ext_net.js) z atrapami chrome.storage i fetch, która gubi
// separator „ /// ” (Google), znacznik <bN> (Bing) i zwraca tablicę (DeepL). Uruchom: node tests/test_ext_net.mjs
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const repo = process.argv[2] || fileURLToPath(new URL('..', import.meta.url));
let opts = {};
const store = () => ({
    get(keys, cb) {
        const out = {};
        const ks = Array.isArray(keys) ? keys : (typeof keys === 'string' ? [keys] : Object.keys(keys || {}));
        for (const k of ks) if (k in opts) out[k] = opts[k];
        if (typeof cb === 'function') { cb(out); return undefined; }
        return Promise.resolve(out);
    },
    set() { return Promise.resolve(); }
});
globalThis.chrome = { storage: { local: store(), session: store() }, runtime: { sendMessage: () => Promise.resolve(null) } };
globalThis.window = globalThis;
const warn = console.warn, err = console.error;
console.warn = (...a) => { if (!/indexedDB|dzielę paczkę/.test(String(a[0]) + String(a[1] || ''))) warn(...a); };
console.error = (...a) => { if (!/indexedDB|Pamięć napisów/.test(String(a[0]) + String(a[1] || ''))) err(...a); };

let calls = [];
globalThis.fetch = async (url, init) => {
    url = String(url);
    calls.push(url);
    const ok = (body) => ({ ok: true, status: 200, text: async () => body });
    if (url.includes('translate_a/single')) {   // Google gtx
        const q = new URL(url).searchParams.get('q');
        const segs = q.split(' /// ');
        let flat = '';
        segs.forEach((s, i) => {
            // atrapa gubi separator PRZED segmentem zawierającym "BREAK" (gdy nie jest pierwszy)
            if (i > 0) flat += /BREAK/.test(s) ? ' ' : ' /// ';
            flat += 'PL(' + s + ')';
        });
        return ok(JSON.stringify([[[flat, q]]]));
    }
    if (url.includes('translate/auth')) return ok('tok');
    if (url.includes('edge.microsoft.com/translate/translatetext')) {   // Bing
        const body = JSON.parse(init.body);
        const html = String(body[0]);
        if (!/<b\d+>/.test(html)) {   // tryb batch (tablica) — nieużywany w teście
            return ok(JSON.stringify(body.map((t) => ({ translations: [{ text: 'PL(' + t + ')' }] }))));
        }
        // znaczniki <bN>…</bN>; segment z "DROP" traci znaczniki
        const out = html.replace(/<b(\d+)>([\s\S]*?)<\/b\1>/g, (m, id, t) => /DROP/.test(t) ? 'PL(' + t + ')' : '<b' + id + '>PL(' + t + ')</b' + id + '>');
        return ok(JSON.stringify([{ translations: [{ text: out }] }]));
    }
    if (url.includes('deepl.com')) {
        const body = JSON.parse(init.body);
        return ok(JSON.stringify({ translations: body.text.map((t) => ({ text: 'PL(' + t + ')' })) }));
    }
    throw new Error('nieoczekiwany adres ' + url);
};

const mod = await import(pathToFileURL(path.join(repo, 'src/background/ext_net.js')).href);

// 1) Google: zgubiony separator → paczka dzielona, każda kwestia dostaje SWOJE tłumaczenie
opts = { extTrOn: true, extTrEngine: 'google', extTrContext: false };
const g = ['alpha one', 'beta two', 'gamma BREAK three', 'delta four', 'epsilon five'];
const gOut = await mod.extTrTranslateList('de', g);
assert.deepEqual(gOut, g.map((t) => 'PL(' + t + ')'), 'Google: wyrównanie po zgubionym separatorze');
console.log('Google OK — zapytań gtx:', calls.filter((u) => u.includes('translate_a')).length);

// 2) Bing (znaczniki): zgubiony znacznik nie przesuwa dalszych kwestii
calls = [];
opts = { extTrOn: true, extTrEngine: 'bing', extTrMicrosoftBatch: false, extTrContext: false };
const b = ['uno A', 'dos DROP B', 'tres C', 'cuatro D'];
const bOut = await mod.extTrTranslateList('es', b);
assert.equal(bOut[0], 'PL(uno A)');
assert.equal(bOut[2], 'PL(tres C)', 'Bing: kwestia po zgubionym znaczniku nie przesunięta');
assert.equal(bOut[3], 'PL(cuatro D)');
assert.equal(bOut[1], '', 'Bing: zgubiona kwestia pusta (nie cudza)');
console.log('Bing OK —', JSON.stringify(bOut));

// 3) DeepL: tablica tłumaczeń 1:1
calls = [];
opts = { extTrOn: true, extTrEngine: 'deepl', extTrContext: false };
const d = ['one longer sentence here', 'two', 'three words here'];
const dOut = await mod.extTrTranslateList('en', d);
assert.deepEqual(dOut, d.map((t) => 'PL(' + t + ')'), 'DeepL 1:1');
console.log('DeepL OK');
console.log('ext_net: OK');
