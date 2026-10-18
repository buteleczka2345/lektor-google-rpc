# 🔊 Lektor Multilanguage — Polski Lektor do filmów (rozszerzenie Chrome MV3)

**Wersja:** 3.0.6 · **Typ:** rozszerzenie Chrome (Manifest V3) · **Język UI:** polski

> Rozszerzenie zamienia **obce napisy / mowę w filmie na polskiego lektora czytanego na żywo** — bezpośrednio na stronie (YouTube, Netflix, Prime Video, iQIYI, WeTV, Viki, Bilibili, Dailymotion, Rumble i inne). Tłumaczy lokalnie (Translator Chrome) albo przez silniki sieciowe (Google RPC, Bing, DeepL, AI), czyta wbudowanym głosem **Sherpa VITS pl_PL-meski_wg_glos-medium** albo zewnętrznymi serwerami TTS przez WebSocket. Ma też **Łowcę Napisów**, **OCR napisów wtopionych w obraz** (Tesseract + PP-OCRv6 ONNX), **cenzora przekleństw**, **Głos i Napisy** (dyktowanie + napisy z karty), pamięć napisów i tłumaczeń (IndexedDB, 90 dni) oraz stronę ustawień i benchmark OCR.

## 🛠️ Wolno modyfikować

**Tak — ten projekt jest otwarty do modyfikowania.** Możesz go forkować, poprawiać, tłumaczyć, dokładać silniki TTS / tłumaczy, zmieniać UI i używać fragmentów we własnych projektach. Jeśli opublikujesz zmodyfikowaną wersję, dopisz skąd pochodzi oryginał i nie usuwaj informacji o licencjach modeli z folderów `glos/dfn`, `ppocr`, `ocr`, `sherpa`.

## ✨ Co to robi (w 30 sekund)

1. Wykrywa napisy: z playera (YouTube timedtext, Netflix, Prime, iQIYI…), z sieci (fetch/XHR), z DOM/Shadow DOM, z pliku .srt, z baz napisów albo z obrazu (OCR).
2. Skleja urwane kwestie w CAŁE ZDANIA (domyślnie WŁ. — extTrJoinSentences), żeby tłumacz nie dostawał połówek zdań.
3. Tłumaczy na polski: najpierw słownik 571 fraz/idiomów (assets/phrase_dict.js), potem Translator Chrome (lokalnie) albo wybrany silnik sieciowy.
4. Czyta lektorem: wbudowany Sherpa VITS (WASM, pula 6 workerów) albo zdalny serwer (Matcha / XTTS / F5 / Pocket / OmniVoice / Audio8) przez ws://127.0.0.1:port.
5. Ścisza film pod lektorem (ducking), nadąża za tempem wideo (tryby A/B/C), buforuje do przodu (także w pauzie / w tle), cenzuruje przekleństwa, pokazuje pasek i arkusz ustawień na stronie.

Instalacja deweloperska: chrome://extensions → tryb dewelopera → Załaduj rozpakowane → ten folder (musi zawierać manifest.json).

## 🗂️ Mapa projektu — co gdzie jest

- manifest.json — MV3: uprawnienia, content_scripts, web_accessible_resources
- service-worker-loader.js — start SW: background.js + glos/glos_bg.js + diagnostyka błędów
- src/background/background.js — serce: kolejka TTS_PLAY do offscreen, blokady fraz, Audio Focus, pamięć
- src/background/ext_net.js — silniki sieciowe: Google RPC (batchexecute) / gtx, Bing, DeepL, AI, gtab, rotacja, cooldown, cache
- src/background/subs_cache.js — IndexedDB lektorPamiec: videos + texts (TTL 90 dni, sprzątanie co 12 h)
- src/background/subs_db.js — bazy napisów: OpenSubtitles.org (bez klucza), .com (klucz osApiKey), SubDL (klucz subdlApiKey)
- src/content/inject.js, netflix_seek_bridge.js — wstrzykiwanie MAIN + bezpieczne skoki Netflix (omija błąd M7375, nie rusza video.currentTime)
- src/offscreen/offscreen.html/js — silnik TTS + audio: pula Sherpa, zdalne WS, głośność do 400% (Gain+Compressor), tempo A/B/C, log
- src/offscreen/censor.js — cenzor PL/EN/DE/ES… (remove/beep/replace, granice słów Unicode)
- src/offscreen/ocr_engine.js — Tesseract.js (pol/eng/chi_sim/chi_tra z folderu ocr/, inne z sieci)
- src/offscreen/ppocr_engine.js + ppocr_core.js — PP-OCRv6 tiny/small ONNX (det DB + rec CTC, onnxruntime-web WASM)
- src/popup/ — panel: Lektor wł/wył, Łowca, Głos i Napisy, głos/silnik, plik napisów, bazy, dziennik
- src/options/ — strona ustawień (SCHEMA): tempo, karty/pauza, YouTube, tłumaczenie sieciowe, AI, klucze, domeny, Kreator, Łowca, AI Subtitle Translator
- src/bench/ — benchmark OCR (Tesseract vs PP-OCR na generowanych obrazkach PL/EN/ZH)
- assets/lektor_bar.js, lektor-controls.js, lektor-settings.js — pasek ◄ ►, prędkość, offset napisów ±60 s, blokady zdań
- assets/dom_content.js — Prime/iQIYI: napisy z DOM/Shadow DOM do harmonogramu TTS
- assets/youtube_content.js + yt_subs_bridge.js — YouTube: przechwyt /api/timedtext + tłumaczenie lokalne
- assets/content.js + sub_panel.js — Netflix: napisy + panel
- assets/auto_subs.js + auto_subs_hook.js — auto-pobieranie CAŁYCH napisów (iQIYI, WeTV, Viki, Bilibili/Bstation: polskie → angielskie → inne)
- assets/full_subs_ondemand.js — Pobierz całe napisy na żądanie (video.textTracks/<track>, WebVTT)
- assets/lowca_napisow.js v1.3.1 (window.__USH__) — Łowca Napisów: hooki fetch/XHR/WS/canvas, HLS/DASH, CEA-608/708, TextTracks, MutationObserver; wstrzykiwany dopiero przyciskiem, zapamiętuje domeny lowcaSites
- assets/ocr_tool.js — OCR wtopionych napisów (zrzut klatki co 0,5 s → offscreen → okienko + lektor; język ocrToolLang, ramka ocrToolRegions)
- assets/phrase_dict.js — 571 idiomów (DUO_PHRASE_MAP) — sprawdzany PRZED tłumaczem i PRZED cache
- glos/ — Głos i Napisy: glos_bg.js (Alt+Shift+1/2, okienka, badge REC/CC, dziennik gnDbg), glos.html/js (mikrofon→tekst w pole), karta.html/js (tabCapture cyfrowo→napisy), overlay.js, historia.html/js (napisy na bieżąco), common.js (DeepFilterNet, boost mowy 1–2,5 kHz), dfn/ (DeepFilterNet3 WASM, licencje MIT/Apache). Pełna instrukcja: glos/CZYTAJ MNIE.txt
- ocr/ — Tesseract: traineddata pol/eng/chi_sim/chi_tra + rdzenie WASM SIMD/LSTM
- ppocr/ — PP-OCRv6 tiny+small (det/rec .onnx), słowniki, ort-wasm-simd-threaded
- sherpa/ — głos wbudowany vits-piper-pl_PL-meski_wg_glos-medium (.onnx ~60 MB) + espeak-ng-data + silnik WASM sherpa-onnx-wasm-main-tts (~92 MB)
- AI Subtitle Translator.js — osobny userscript (nie część rozszerzenia)
- test_xtts_websocket.mjs.js — test serwera XTTS (JSON {text,voice} → WAV)

Rozmiar: ~448 plików, ~269 MB (głównie modele: Sherpa ~150 MB, PP-OCR ~35 MB, Tesseract ~9 MB, DeepFilterNet ~8 MB).

## 🧠 Jak to działa pod maską

Warstwy: Service Worker (kolejka TTS_PLAY → offscreen, reanimacja przez PING bez zabijania w trakcie INIT/PRELOAD/PLAY, filtr blokad, Audio Focus jedna karta, cache) → Offscreen (jedyne miejsce z audio i WASM) → Content scripts (izolowane + MAIN, pasek jako zwykły DOM — działa też w Kiwi na Androidzie) → Popup/Options (chrome.storage.local, opcje działają od razu).

Tłumaczenie: lokalnie Translator Chrome + słownik; angielski lokalnie, inne języki opcjonalnie Bingiem (extTrNonEnCloud). Sieciowo extTrEngine: lokalny | rotacja | google | gtab | bing | deepl | ai. Google: RPC batchexecute (limiter 4 żądania/1350 ms jak Immersive Translate) z fallbackiem do gtx, separator " /// ", round-robin, cooldown 20 s → 1 min → 5 min, cache SW + IndexedDB. Całe zdania: ZD_MAX_CHARS=220, ZD_MAX_MS=12000, ZD_GAP_MS=1500. AI: OpenAI-compatible (URL, klucz, model, edytowalny prompt) + AI Subtitle Translator (plik → Gemini Nano / Prompt API → .srt lub wprost do lektora).

Mowa: Sherpa WASM pula 6 workerów (~0,35–0,5 GB każdy, własny głos z IndexedDB lektorVoices) albo Matcha :9000 / XTTS :8000 / Marek F5 :9400 / Pocket :9200 / OmniVoice :9100 / Audio8 :9300 (preload do 1 h). Głośność do 400%, prędkość czytana w momencie odtwarzania, tempo A/B/C + auto-nadrabianie + anty-trzask.

Napisy: Łowca na żądanie, auto-napisy od bieżącego miejsca, timedtext, textTracks, bazy (mini-unzip, MicroDVD→SRT, cięcie reklam), wgrany plik (pierwszeństwo), OCR wtopionych.

Głos i Napisy (Alt+Shift+1 dyktowanie do pola; Alt+Shift+2 film→napisy cyfrowo tabCapture→DeepFilterNet→rozpoznawanie→tłumacz→żółte napisy+Sherpa). Napisy na bieżąco: góra = zdanie zatwierdzone (to samo co czyta lektor), dół = to co jeszcze słyszy Google. Opcje: piętro wyżej, tylko gotowe, odświeżanie 0/300/600/1000 ms, nowa linijka po kropce, czytanie po przecinku/kropce, oryginał pod spodem, dziennik co 30 s.

Cenzor: listy PL/EN/DE/ES (kolizje wycięte), tryby remove/beep/replace + własne słowa; BLOCKED_PHRASES w SW + userBlockedPhrases w storage — cięcie przed TTS_PLAY.

## 🚀 Użycie

1. Załaduj rozpakowane w chrome://extensions. 2. Otwórz film, włącz Lektor w popupie. 3. Dostosuj głos/silnik, prędkość, offset (⚙️ na stronie lub popup). 4. Napisy: automat, Łowca (Szukaj napisów), Pobierz całe napisy, plik albo bazy. 5. Wtopione: menu CC → OCR (język + ramka). 6. Alt+Shift+1 / Alt+Shift+2 (modele mowy pobierz raz przyciskiem w popupie). 7. Problemy: popup → Ustawienia i dziennik → Kopiuj dziennik (__svcError, gnDbg, Ostatnie kwestie).

Serwery zdalne TTS opcjonalne — bez nich działa wbudowana Sherpa offline.

## ⚠️ Uwagi do publikacji

Największy plik ~92 MB < limit 100 MB GitHub — push bez LFS, ale klonowanie potrwa. Przed szeroką publikacją uzupełnij licencję (Sherpa/Piper, espeak-ng-data, DeepFilterNet, Tesseract, PaddleOCR) i rozważ usunięcie test_*.mjs.js. Klucze API trzymane są w chrome.storage przeglądarki, nie w repo.

*Opis na podstawie analizy kodu (manifest 3.0.6, service-worker-loader.js, src/background, src/offscreen, src/popup, src/options, assets, glos/CZYTAJ MNIE.txt).*
