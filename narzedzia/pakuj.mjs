// pakuj.mjs — paczka ZIP Multilektora do Chrome Web Store / do pobrania, BEZ plików deweloperskich.
// Uruchom w folderze repozytorium:  node narzedzia/pakuj.mjs      (Windows: narzedzia\pakuj.bat)
// Wynik: dist/Multilektor-<wersja z manifest.json>.zip  — w środku manifest.json w katalogu głównym (jak wymaga sklep).
// Pomija: .git, narzedzia/, tests/, sklep/ (teksty do panelu sklepu i polityka prywatności — ta jest na GitHub Pages),
// src/bench/ (benchmarki), dist/, README.md, pliki *.bak* i ukryte (.gitignore, .nojekyll…). Bez zewnętrznych bibliotek.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['.git', '.github', '.claude', 'narzedzia', 'tests', 'sklep', 'dist', 'node_modules', path.join('src', 'bench')]);
const SKIP_FILES = new Set(['README.md']);
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const out = path.join(root, 'dist', 'Multilektor-' + manifest.version + '.zip');

function walk(dir, rel, list) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const r = rel ? path.join(rel, ent.name) : ent.name;
        if (ent.name.startsWith('.') || /\.bak/i.test(ent.name)) continue;
        if (ent.isDirectory()) { if (!SKIP_DIRS.has(r)) walk(path.join(dir, ent.name), r, list); continue; }
        if (ent.isFile() && !(rel === '' && SKIP_FILES.has(ent.name))) list.push(r);
    }
    return list;
}

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

const files = walk(root, '', []);
if (!files.includes('manifest.json')) throw new Error('brak manifest.json w ' + root);
fs.mkdirSync(path.dirname(out), { recursive: true });
const fd = fs.openSync(out, 'w');
const central = [];
let offset = 0, rawTotal = 0;
const d = new Date(), dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
for (const rel of files) {
    const data = fs.readFileSync(path.join(root, rel));
    const name = Buffer.from(rel.split(path.sep).join('/'), 'utf8');
    const crc = crc32(data);
    let body = zlib.deflateRawSync(data, { level: 9 }), method = 8;
    if (body.length >= data.length) { body = data; method = 0; }   // już skompresowane (np. .gz, .png) — zapis bez kompresji
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(dosTime, 10); lh.writeUInt16LE(dosDate, 12); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    fs.writeSync(fd, lh); fs.writeSync(fd, name); fs.writeSync(fd, body);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(method, 10);
    ch.writeUInt16LE(dosTime, 12); ch.writeUInt16LE(dosDate, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(body.length, 20);
    ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42);
    central.push(ch, name);
    offset += 30 + name.length + body.length;
    rawTotal += data.length;
}
const cdir = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(cdir.length, 12); end.writeUInt32LE(offset, 16);
fs.writeSync(fd, cdir); fs.writeSync(fd, end);
fs.closeSync(fd);
const mb = (n) => (n / 1048576).toFixed(1) + ' MB';
console.log('✓ ' + path.relative(root, out) + ' — ' + files.length + ' plików, ' + mb(rawTotal) + ' → ' + mb(fs.statSync(out).size));
