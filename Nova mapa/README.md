# Šah Ura

Šahovska ura (PWA) za telefon in tablico. Privzeta ura je **POP – Primorski osnovnošolski pokal (10 min + 5 s, FIDE pospešeni)**.

## Objava na GitHub Pages (brezplačno, ~5 minut)

1. Prijavi se na <https://github.com> in ustvari nov javni repozitorij, npr. `sah-ura`.
2. V repozitoriju klikni **Add file → Upload files** in povleci vanj **vsebino** te mape (`index.html`, `sw.js`, `manifest.webmanifest`, mape `css`, `js`, `icons`). Klikni **Commit changes**.
3. **Settings → Pages → Branch: `main` / `(root)` → Save**.
4. Po minuti je aplikacija dostopna na `https://<uporabnik>.github.io/sah-ura/`.

## Namestitev na telefon

- **Android (Chrome):** odpri povezavo → meni ⋮ → **Namesti aplikacijo / Dodaj na začetni zaslon**.
- **iPhone (Safari):** odpri povezavo → **Deli** → **Dodaj na začetni zaslon**.

Po prvem odprtju aplikacija deluje tudi brez interneta.

## Posodobitev

Ko spremeniš datoteke, v `sw.js` povečaj različico (`sahura-v1.0.1` …), da telefoni naložijo novo verzijo.

## Podatki

Igralci, zgodovina, lastne ure in nastavitve so shranjeni na vsaki napravi posebej (localStorage).
Prenos med napravami: **Nastavitve → Izvozi kopijo** (.json) in na drugi napravi **Uvozi kopijo**.
Podatkovni sloj je v `js/store.js`, da se kasneje lahko poveže s skupno bazo (Supabase).

## Struktura

- `js/clock.js` – logika ure (Fischer, Bronstein, zakasnitev, večstopenjske kontrole, hendikep, razveljavitev)
- `js/store.js` – shranjevanje podatkov
- `js/app.js` – zasloni (Igra, Ure, Igralci, Zgodovina, Nastavitve) in prikaz ure
- `css/app.css` – videz in barvne sheme
