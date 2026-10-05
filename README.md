# Klasyfikacja Zawodów Wędkarskich (system sektorowy)

Aplikacja dla sędziego: wgrywasz plik Excel (każda tura w osobnym arkuszu), dostajesz ranking tur i ranking końcowy z 2 najlepszych tur, z eksportem do PDF.
Wszystko liczy się w przeglądarce – bez serwera, bez logowania, bez zapisu danych.

## Reguły (wersja bieżąca)
- Sektor czytany z pliku, nigdy liczony ze stanowiska. Brak sztywnego limitu osób w sektorze.
- Miejsce w sektorze = punkty (mniej = lepiej). Remis wagi = średnia pozycji (4,5,6 → 5,0 pkt każdy).
- Zero ryb: zawodnik jest klasyfikowany. Dwie lub więcej osób bez ryby w sektorze (ex aequo) dzielą średnią ostatnich miejsc własnego sektora (reguła nadrzędna). Jedna osoba bez ryby w sektorze dostaje punkty ostatniego miejsca najliczniejszego sektora tury (np. sektory 12 i 10 osób, jedno zero w sektorze 10-osobowym → 12 pkt).
- Ranking tury: punkty rosnąco, remis rozstrzyga waga, pełny remis → to samo miejsce (1-2-2-4).
- Ranking końcowy: 2 tury z najmniejszą liczbą punktów, min. 2 tury; remis → większa łączna waga z tych 2 tur.
- Nieobecność = brak w arkuszu (brak punktów za turę). Grand Prix – poza zakresem MVP.

## Dokumentacja
- `docs/PRD_zawody_sektorowe_v3.2.docx` – aktualny PRD (v3.2).

## Dane testowe
`test/data/` – pliki Excel z zanonimizowanymi (losowymi) nazwiskami, zmienionymi datami i nazwami tur: `test_sektorowy_9_tur.xlsx` (sektory powyżej 10 osób, wagi w gramach, trzy zera w jednym sektorze), `test_sektorowy_4_tury.xlsx`, `test_punktowy_6_tur.xlsx` (klasyfikacja punktowa, inny produkt).

## Struktura
- `src/logic.js` – czysta logika (bez UI); `src/parse.js` – odczyt arkuszy; `src/app.js` – interfejs.
- `test/` – testy (`npm test`, Node 18+), dane testowe w `test/fixture-sektory.json`.
- `vendor/xlsx.full.min.js` – biblioteka do czytania Excela (SheetJS, wersja z repozytorium npm).

## Uruchomienie lokalnie
`python3 -m http.server 8000` w tym folderze, potem http://localhost:8000 (moduły ES nie działają z `file://`).

## Publikacja na GitHub Pages
1. Wgraj zawartość folderu do repozytorium. 2. Settings → Pages → Branch: `main`, folder `/ (root)`. 3. Strona pojawi się pod `https://<login>.github.io/<repo>/`.
