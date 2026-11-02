# 🔊 Multilektor — polski lektor do filmów (rozszerzenie Chrome MV3)

**Wersja:** 3.6.0 · **Typ:** rozszerzenie Chrome (Manifest V3) · **Język UI:** polski / English (automatycznie wg języka Chrome, przełącznik w popupie)

> Rozszerzenie zamienia **obce napisy / mowę w filmie na polskiego lektora czytanego na żywo** — bezpośrednio na stronie (YouTube, Netflix, Prime Video, iQIYI, WeTV, Viki, Bilibili, Dailymotion, Rumble i inne). Tłumaczy lokalnie (Translator Chrome) albo przez silniki sieciowe (Google, Bing, DeepL, AI), czyta głosem **Matcha-TTS-PL liczonym w przeglądarce** (domyślnie, bez serwera), Supertonic 3, głosem przeglądarki, pobranymi głosami Piper albo **własnym serwerem mowy** (WebSocket). Ma też **Łowcę Napisów**, **Kreatora napisów** (wskazywanie napisów myszką), **OCR napisów wtopionych w obraz** (Tesseract + PP-OCRv6 ONNX), **cenzora przekleństw**, **Głos i Napisy** (dyktowanie + napisy z karty), pamięć napisów i tłumaczeń (IndexedDB, 90 dni) oraz stronę ustawień i benchmark OCR.

> 💡 **Przerabiaj go po swojemu!** Ten program możesz dowolnie zmieniać pod własne potrzeby — i gorąco zachęcam, żeby go ulepszać. Szczegóły niżej w „🛠️ Wolno modyfikować”.

## ⬇️ Pobierz ZIP

Paczkę 3.6.0 budujesz jednym poleceniem w folderze repozytorium (Node 18+):

```bash
node narzedzia/pakuj.mjs
```

Na Windows wystarczy dwuklik `narzedzia\pakuj.bat`. Wynik: `dist/Multilektor-3.6.0.zip` (~123 MB, ~490 plików, bez testów, narzędzi i tekstów do Sklepu). Starsze gotowe paczki: [wszystkie wydania](https://github.com/buteleczka2345/lektor-google-rpc/releases/latest).

Instalacja: rozpakuj ZIP do folderu → otwórz `chrome://extensions` → włącz **Tryb dewelopera** → **Załaduj rozpakowane** → wskaż rozpakowany folder (ten z `manifest.json`).

## 🆕 Co nowego w 3.6.0

**Lektor płynniej i bez gubienia tekstu**
- **Wspólny harmonogram kwestii** (`assets/lektor_scheduler.js`) dla YouTube, Netflixa, stron DOM / Łowcy i „całych napisów” — wszędzie to samo okno kwestii, tempo filmu i czytanie tylko przy grającym filmie na widocznej karcie.
- Kwestia przerwana pauzą jest po wznowieniu czytana od początku (gdy lektor jej nie skończył); po pauzie nie wskakuje już stara kwestia; każde zdanie jest syntezowane raz; inna karta nie czyści kolejki lektora.
- **Nadrabianie od zaległości** (najwyżej **1,8×**), liczniki ⏱ opóźnienia i ⏭ pominiętych kwestii na pasku lektora, limit pamięci nagrań dobrany do RAM komputera (150 / 300 / 600 MB).
- Tłumaczenie paczkami nie miesza linii: Google dzieli paczkę, gdy rozjedzie się separator; Bing dopasowuje po id; DeepL 1:1.
- Blokady fraz działają na **całe słowa** („tak” nie wycisza już „także”).

**Nowe funkcje**
- **📋 Tylko domeny z listy** (domyślnie WŁ., przełącznik w popupie i w Ustawieniach): lektor uruchamia się sam tylko na domenach z białej listy, na innych stronach nie działa i nie zużywa procesora. Lista została wypełniona domenami lektora (serwisy z manifestu, strony Łowcy, Kreator, napisy z pliku / baz, OCR); popup pokazuje stan strony i ma „➕ Dodaj tę stronę”. Lista zmieniona na otwartej karcie działa od razu, bez odświeżania (także w ramkach odtwarzaczy).
- **🎯 Kreator napisów od nowa:** niebieska ramka pod kursorem pokazuje, co lektor złapie (z podglądem tekstu); kółko myszy albo ↑ ↓ poszerza / zawęża ramkę, klik wybiera. Działa przez warstwy napisów, które nie przyjmują kliknięć, w ramkach odtwarzaczy i na każdej stronie; lektor czyta wszystkie linie napisu.
- **✂ Skracanie za długich kwestii** przez AI wbudowane w Chrome (Gemini Nano, Prompt API) zamiast przyspieszania mowy; **🗣 słownik wymowy** (np. `Netflix => Netfliks`).
- **🔉 Ściszaj film tylko, gdy lektor mówi** (płynne przejścia, jak w telewizji); **💾 eksport napisów PL do .srt**; **📍 „Czytam z: …”** — skąd lektor bierze napisy (popup, pasek, arkusz ⚙).
- **Serwer lokalny — własny adres:** jeden silnik WebSocket z polem na adres zamiast 7 osobnych kopii kodu serwerów.

**Porządki**
- **Jeden cenzor** (`assets/censor.js`) dla mowy lektora i dźwięku filmu, z jedną listą słów („-słowo” = wyjątek).
- Usunięta niedziałająca „Google RPC” i dublujące się ustawienia (popup ↔ Ustawienia).
- Mniejsza paczka: bez martwego pliku Sherpa `.data` (93 MB) i bez modeli Matcha FP32 (pobierane na żądanie) — 209 MB, ZIP ~123 MB.
- Mniej ruchu w tle: telemetria i dziennik w `storage.session`, komunikaty tylko do karty lektora.
- Narzędzia spoza rozszerzenia w `narzedzia/`, testy w `tests/`.

<details><summary>Wcześniej (3.1 → 3.5)</summary>

- **Nowa nazwa: Multilektor** (wcześniej „Lektor Multilanguage”). Nazwa i opis w dwóch językach przez `_locales/pl` i `_locales/en`.
- **🌐 Interfejs po polsku i angielsku** — popup, Ustawienia, panele na stronach z filmem, Łowca napisów, OCR, okienka „Głos”.
  Domyślnie wg języka Chrome, przełącznik „Auto / PL / EN” w popupie i Ustawieniach (zmiana od razu, bez przeładowania).
- **🇵🇱 YouTube: polskie napisy z tłumaczenia YouTube** (opcja `ytTlangPl`, domyślnie wł.) — lektor najpierw prosi YouTube
  o „Automatyczne tłumaczenie → polski” (`tlang=pl`), bez limitu i bez kluczy; gdy się nie da — tłumaczy sam.
- **🗣 Głos przeglądarki** — silnik mowy przez Web Speech API (`src/offscreen/browser_tts.js`).
- **Supertonic 3** — lektor w przeglądarce z VoxNemesis (`supertonic/`): 4 głosy liczone lokalnie na CPU / GPU (WebGPU).
- **Matcha-TTS-PL w przeglądarce** (`matcha_web/`) — domyślny głos, bez serwera.
- **Gotowe do Chrome Web Store:** kod OCR tylko z paczki, przepisane od nowa przechwytywanie napisów Netflixa,
  dokument offscreen i router mowy; teksty do panelu Sklepu i polityka prywatności w `sklep/`.
</details>

## 📜 Pochodzenie

Projekt wyrósł z rozszerzenia „Live Dubbing” (Chrome Web Store) i od tamtej pory został wielokrotnie przebudowany.
Fragmenty przejęte stamtąd dosłownie (przechwytywanie napisów Netflixa, dokument offscreen, router mowy) zostały w wersji 3.2.0
napisane od nowa.

Lektor liczony w przeglądarce **Supertonic 3** (folder `supertonic/` — silnik, workery CPU / WebGPU, 4 głosy) pochodzi
z lektora **VoxNemesis** i został tu przeniesiony; z VoxNemesis jest też wygląd popupu (zakładki, karty, kolory).
Sam model głosu to Supertone Supertonic 3 (ONNX), pobierany z Hugging Face przy pierwszym użyciu.

## 🛠️ Wolno modyfikować

**Tak — ten projekt jest otwarty do modyfikowania, a nawet do tego zachęcam.** Przerób go pod swoje potrzeby: inny język lektora, inne strony z filmami, własny głos, własny tłumacz, inny wygląd — co tylko Ci się przyda. Możesz go forkować, poprawiać, tłumaczyć, dokładać silniki TTS / tłumaczy, zmieniać UI i używać fragmentów we własnych projektach. Jeśli opublikujesz zmodyfikowaną wersję, dopisz skąd pochodzi oryginał i nie usuwaj informacji o licencjach modeli z folderów `glos/dfn`, `ppocr`, `ocr`, `sherpa`.

Masz poprawkę albo pomysł, z którego skorzystają też inni? Śmiało — otwórz *Issue* albo wyślij *Pull Request*. Każde ulepszenie jest mile widziane: od literówki w opisie po nowy silnik mowy.

## ✨ Co to robi (w 30 sekund)

1. Wykrywa napisy: z playera (YouTube timedtext, Netflix, Prime, iQIYI…), z sieci (fetch/XHR), z DOM/Shadow DOM, z miejsca wskazanego w Kreatorze, z pliku .srt, z baz napisów albo z obrazu (OCR).
2. Skleja urwane kwestie w CAŁE ZDANIA (domyślnie WŁ. — extTrJoinSentences), żeby tłumacz nie dostawał połówek zdań.
3. Tłumaczy na polski: najpierw słownik 571 fraz/idiomów (assets/phrase_dict.js), potem Translator Chrome (lokalnie) albo wybrany silnik sieciowy.
4. Czyta lektorem: Matcha-TTS-PL w przeglądarce (domyślnie), Supertonic 3, głos przeglądarki, pobrane głosy Piper (Sherpa WASM) albo serwer lokalny przez ws://adres.
5. Ścisza film pod lektorem (ducking — stale albo tylko na czas mowy), nadąża za tempem wideo (tryby A/B/C, nadrabianie do 1,8×), buforuje do przodu (także w pauzie / w tle), cenzuruje przekleństwa, pokazuje pasek i arkusz ustawień na stronie.

Instalacja deweloperska: chrome://extensions → tryb dewelopera → Załaduj rozpakowane → ten folder (musi zawierać manifest.json).

## 🗂️ Mapa projektu — co gdzie jest

- manifest.json — MV3: uprawnienia, content_scripts, web_accessible_resources
- service-worker-loader.js — start SW: background.js + glos/glos_bg.js + diagnostyka błędów
- src/background/background.js — serce: kolejka TTS_PLAY do offscreen, blokady fraz, Audio Focus, pamięć, Łowca (rejestracja stron), listy domen (wypełnienie, przycisk CC), Kreator (KREATOR_SITE)
- src/background/ext_net.js — silniki sieciowe: Google gtx (limiter, dzielenie paczki przy rozjechanym separatorze), Bing (po id), DeepL, AI, gtab, rotacja, cooldown, cache
- src/background/subs_cache.js — IndexedDB lektorPamiec: videos + texts (TTL 90 dni, sprzątanie co 12 h)
- src/background/subs_db.js — bazy napisów: OpenSubtitles.org (bez klucza), .com (klucz osApiKey), SubDL (klucz subdlApiKey)
- src/content/inject.js, netflix_seek_bridge.js — wstrzykiwanie MAIN + bezpieczne skoki Netflix (omija błąd M7375, nie rusza video.currentTime)
- src/offscreen/offscreen.html/js — silnik TTS + audio: kolejka (nadrabianie, liczniki, limit RAM), Matcha / Sherpa / Supertonic / serwer lokalny, skracanie AI, słownik wymowy, głośność do 400% (Gain+Compressor), tempo A/B/C, log
- src/offscreen/browser_tts.js — 🗣 głos przeglądarki (Web Speech API, klasa BrowserTTSManager)
- src/offscreen/ocr_engine.js — Tesseract.js (pol/eng/chi_sim/chi_tra z folderu ocr/, inne z sieci)
- src/offscreen/ppocr_engine.js + ppocr_core.js — PP-OCRv6 tiny/small ONNX (det DB + rec CTC, onnxruntime-web WASM)
- src/popup/ — panel: Lektor wł/wył + „Czytam z”, 📋 Tylko domeny z listy, Łowca, Głos i Napisy, głos/silnik, plik napisów, bazy, dziennik; layout_shared.js — moduły popupu
- src/options/ — strona ustawień (SCHEMA): tekst lektora (skracanie, słownik wymowy), tempo, karty/pauza, YouTube, tłumaczenie sieciowe, listy domen, Kreator, Łowca, AI Subtitle Translator
- src/bench/ — benchmark OCR (Tesseract vs PP-OCR na generowanych obrazkach PL/EN/ZH)
- assets/lektor_scheduler.js — wspólny harmonogram kwestii (okno, tempo, ponowne czytanie po pauzie), „Czytam z”, ściszanie tylko na czas mowy
- assets/domain_lists.js — 📋 listy domen: jedne zasady dla stron, tła, popupu i Ustawień
- assets/options_hooks.js — opcje z Ustawień dla skryptów stron, stan list domen (usypianie / budzenie), Kreator: 🎯 wskazywanie myszką (ramka, szerzej / węziej)
- assets/censor.js — jeden cenzor przekleństw (PL/EN/DE/ES…, remove/beep/replace, wyjątki „-słowo”) dla mowy lektora i dźwięku filmu
- assets/cenzor_main.js + cenzor_bridge.js — ściszanie dźwięku filmu na przekleństwa (z napisów)
- assets/lektor_bar.js, lektor-controls.js, lektor-settings.js — pasek ◄ ► (⏱ ⏭, 📍, eksport .srt), prędkość, offset napisów ±60 s, blokady zdań
- assets/dom_content.js — Prime/iQIYI/Dailymotion/Rumble/Viki/WeTV/Bilibili i strony Łowcy: napisy z DOM/Shadow DOM i z Kreatora do harmonogramu TTS
- assets/youtube_content.js + yt_subs_bridge.js — YouTube: przechwyt /api/timedtext + tłumaczenie lokalne
- assets/content.js + sub_panel.js — Netflix: napisy + panel
- assets/auto_subs.js + auto_subs_hook.js — auto-pobieranie CAŁYCH napisów (iQIYI, WeTV, Viki, Bilibili/Bstation: polskie → angielskie → inne)
- assets/full_subs_ondemand.js — Pobierz całe napisy na żądanie (video.textTracks/<track>, WebVTT)
- assets/lowca_napisow.js v1.3.1 (window.__USH__) — Łowca Napisów: hooki fetch/XHR/WS/canvas, HLS/DASH, CEA-608/708, TextTracks, MutationObserver; wstrzykiwany dopiero przyciskiem, zapamiętuje domeny lowcaSites
- assets/ocr_tool.js — OCR wtopionych napisów (zrzut klatki co 0,5 s → offscreen → okienko + lektor; język ocrToolLang, ramka ocrToolRegions)
- assets/i18n.js + i18n_en.js — 🌐 język interfejsu PL / EN (MLi18n: page, watch, t; słownik pl → en, ~1450 tekstów)
- assets/phrase_dict.js — 571 idiomów (DUO_PHRASE_MAP) — sprawdzany PRZED tłumaczem i PRZED cache
- _locales/pl, _locales/en — nazwa i opis rozszerzenia w dwóch językach
- matcha_web/ — Matcha-TTS-PL w przeglądarce (ONNX INT8, 2 workery, kolejka pilne / zwykłe); modele w matcha_web/models
- supertonic/ — silnik Supertonic 3 przeniesiony z lektora VoxNemesis (CPU / WebGPU), model pobierany z Hugging Face przy pierwszym użyciu
- sherpa/ — silnik WASM sherpa-onnx + espeak-ng-data dla pobranych głosów Piper („🌐 Języki świata”, własny głos z plików); wbudowanego głosu Sherpa już nie ma
- glos/ — Głos i Napisy: glos_bg.js (Alt+Shift+1/2, okienka, badge REC/CC, dziennik gnDbg), glos.html/js (mikrofon→tekst w pole), karta.html/js (tabCapture cyfrowo→napisy), overlay.js, historia.html/js (napisy na bieżąco), common.js (DeepFilterNet, boost mowy 1–2,5 kHz), dfn/ (DeepFilterNet3 WASM, licencje MIT/Apache). Pełna instrukcja: glos/CZYTAJ MNIE.txt
- ocr/ — Tesseract: traineddata pol/eng/chi_sim/chi_tra + rdzenie WASM SIMD/LSTM
- ppocr/ — PP-OCRv6 tiny+small (det/rec .onnx), słowniki, ort-wasm-simd-threaded
- sklep/ — teksty do Chrome Web Store (opis, uprawnienia, prywatność) i polityka prywatności (HTML)
- narzedzia/ — poza rozszerzeniem: pakuj.mjs / pakuj.bat (ZIP do Sklepu), AI Subtitle Translator.user.js (osobny userscript), test_xtts_websocket.mjs (test serwera XTTS: JSON {text,voice} → WAV)
- tests/ — testy (niżej „🧪 Testy”)

Rozmiar paczki: ~490 plików, ~209 MB (ZIP ~123 MB) — głównie modele: Matcha ~58 MB, PP-OCR ~47 MB, Supertonic ~36 MB, Sherpa ~31 MB, Głos i Napisy ~24 MB, Tesseract ~17 MB.

## 🧠 Jak to działa pod maską

Warstwy: Service Worker (kolejka TTS_PLAY → offscreen, reanimacja przez PING bez zabijania w trakcie INIT/PRELOAD/PLAY, filtr blokad, Audio Focus jedna karta, cache, rejestracja skryptów Łowcy i przycisku CC tylko na domenach z listy) → Offscreen (jedyne miejsce z audio i WASM) → Content scripts (izolowane + MAIN, pasek jako zwykły DOM — działa też w Kiwi na Androidzie) → Popup/Options (chrome.storage.local, opcje działają od razu).

Listy domen (`assets/domain_lists.js`): liczy się strona z paska adresu — odtwarzacz w ramce z innej domeny działa razem z nią; czarna lista obejmuje też domenę ramki i wygrywa z białą; port, adres i „www.” są obcinane. Uśpiony skrypt nie obserwuje strony i nie pobiera ani nie tłumaczy napisów; zmiana listy budzi go bez odświeżania.

Tłumaczenie: lokalnie Translator Chrome + słownik; angielski lokalnie, inne języki opcjonalnie Bingiem (extTrNonEnCloud). Sieciowo extTrEngine: lokalny | rotacja | google | gtab | bing | deepl | ai. Google: gtx z limiterem, separator " /// " (gdy się rozjedzie — paczka dzielona na mniejsze), round-robin, cooldown 20 s → 1 min → 5 min, cache SW + IndexedDB. Całe zdania: ZD_MAX_CHARS=220, ZD_MAX_MS=12000, ZD_GAP_MS=1500. AI: OpenAI-compatible (URL, klucz, model, edytowalny prompt) + AI Subtitle Translator (plik → Gemini Nano / Prompt API → .srt lub wprost do lektora).

Mowa: Matcha w przeglądarce (2 workery, pilne kwestie przed nagrywaniem do przodu), Supertonic, głos przeglądarki, Sherpa WASM (pobrane głosy Piper), serwer lokalny ws:// (własny adres albo gotowe pozycje: Matcha :9000, XTTS :8000, Pocket :9200, OmniVoice :9100, Kokoro :9500). Przed syntezą: cenzor, słownik wymowy i (opcjonalnie) skracanie za długich kwestii. Głośność do 400%, prędkość czytana w momencie odtwarzania, tempo A/B/C + nadrabianie od zaległości (najwyżej 1,8×) + anty-trzask.

Napisy: Łowca na żądanie, auto-napisy od bieżącego miejsca, timedtext, textTracks, Kreator (własne miejsce na stronie), bazy (mini-unzip, MicroDVD→SRT, cięcie reklam), wgrany plik (pierwszeństwo), OCR wtopionych.

Głos i Napisy (Alt+Shift+1 dyktowanie do pola; Alt+Shift+2 film→napisy cyfrowo tabCapture→DeepFilterNet→rozpoznawanie→tłumacz→żółte napisy+lektor). Napisy na bieżąco: góra = zdanie zatwierdzone (to samo co czyta lektor), dół = to co jeszcze słyszy Google. Opcje: piętro wyżej, tylko gotowe, odświeżanie 0/300/600/1000 ms, nowa linijka po kropce, czytanie po przecinku/kropce, oryginał pod spodem, dziennik co 30 s.

Cenzor: jeden silnik (`assets/censor.js`) — listy PL/EN/DE/ES (kolizje wycięte), tryby remove/beep/replace, własne słowa i wyjątki („-słowo”); ten sam dla mowy lektora i ściszania dźwięku filmu. BLOCKED_PHRASES w SW + userBlockedPhrases w storage — cięcie przed TTS_PLAY, na całe słowa.

## 🚀 Użycie

1. Załaduj rozpakowane w chrome://extensions. 2. Otwórz film, włącz Lektor w popupie. 3. Dostosuj głos/silnik, prędkość, offset (⚙️ na stronie lub popup). 4. Napisy: automat, Łowca (Szukaj napisów), Pobierz całe napisy, plik albo bazy. 5. Lektor nie widzi napisów na stronie? Ustawienia → 🧪 Kreator napisów → 🎯 Wskaż myszką. 6. Wtopione: menu CC → OCR (język + ramka). 7. Alt+Shift+1 / Alt+Shift+2 (modele mowy pobierz raz przyciskiem w popupie). 8. Problemy: popup → Ustawienia i dziennik → Kopiuj dziennik (__svcError, gnDbg, Ostatnie kwestie).

Strona spoza białej listy domen: popup → „📋 Tylko domeny z listy” → „➕ Dodaj tę stronę” (albo odznacz przełącznik — lektor wszędzie).

Serwery zdalne TTS opcjonalne — bez nich działa Matcha w przeglądarce (offline).

## 🧪 Testy

Node 18+ i Playwright z przeglądarką Chromium (`npm i -D playwright` → `npx playwright install chromium`). W folderze repozytorium:

```bash
node tests/test_scheduler.mjs
```

```bash
node tests/test_ext_net.mjs
```

```bash
node tests/offscreen_e2e.cjs
```

```bash
node tests/duck_page.cjs
```

```bash
node tests/domain_lists.cjs
```

```bash
node tests/extension_domains.cjs
```

```bash
node tests/kreator_pick.cjs
```

Co sprawdzają: harmonogram kwestii; dopasowanie tłumaczeń paczkami (Google / Bing / DeepL); kolejkę lektora w dokumencie offscreen (stare kwestie po pauzie, jedna synteza, inna karta, kolejność przy „czytaj do końca”, 1,8×, serwer lokalny, skracanie i słownik wymowy); ściszanie tylko na czas mowy; listy domen; na prawdziwym rozszerzeniu: wypełnienie białej listy, usypianie i budzenie lektora, Łowcę i przycisk CC, popup i Ustawienia; Kreatora (ramka, szerzej / węziej, czytanie wszystkich linii, ramka odtwarzacza na obcej stronie).

## ⚠️ Uwagi do publikacji

Największy plik ma ~23 MB — push bez LFS. Przed wysłaniem do Sklepu podnieś wersję w `manifest.json` (musi być wyższa niż opublikowana) i zbuduj paczkę `node narzedzia/pakuj.mjs`. Przed szeroką publikacją uzupełnij licencję (Matcha, Sherpa/Piper, espeak-ng-data, DeepFilterNet, Tesseract, PaddleOCR). Klucze API trzymane są w chrome.storage przeglądarki, nie w repo.

*Opis na podstawie analizy kodu (manifest 3.6.0, service-worker-loader.js, src/background, src/offscreen, src/popup, src/options, assets, glos/CZYTAJ MNIE.txt).*
