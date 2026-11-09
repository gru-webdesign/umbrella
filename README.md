# Kišobran

One-tap pixel art igrica za telefon. Lik pada sa kišobranom, a **tap menja smer vetra**, pa ga kišobran nosi levo ili desno. Prepreke (satelitske antene, krovovi sa golubovima, baloni, ptice) dolaze odozdo. Nema nivoa: igra se na rekord, a brzina raste sa svakim poenom.

## Pokretanje

Bez build koraka. Pokreni bilo koji statički server u korenu repoa:

```
python3 -m http.server 8000
```

pa otvori `http://localhost:8000`. Igra radi i kao GitHub Pages sajt (Settings → Pages → branch `main`).

Kontrole: tap ili klik, na računaru i Space / strelice. Ikonica gore desno (u meniju i na kraju) gasi zvuk.

## Struktura

| Putanja | Sadržaj |
| --- | --- |
| `index.html` | Stranica i canvas |
| `src/game.js` | Cela igra: petlja, fizika, prepreke, pixel-perfect sudari, zvuk (WebAudio), UI |
| `assets/` | Obrađeni PNG sprajtovi i pozadine (pravi piksel, providna pozadina) |
| `art/source/` | Originalne generisane slike (magenta pozadina) |
| `tools/process_assets.py` | Pretvara `art/source/` u `assets/` |

## Nova grafika

1. Ubaci sliku u `art/source/` (magenta pozadina #ff00ff, frejmovi u jednom redu).
2. Dodaj red u `main()` u `tools/process_assets.py`, npr. `sheet("coin.jpg", 4, 8, "coin")` (broj frejmova, ciljna visina u pikselima, ime).
3. Pokreni `python3 tools/process_assets.py` (treba `pillow`, `numpy`, `scipy`).
4. Dodaj ime u `SPRITES` u `src/game.js`.

## Podešavanje težine

U `src/game.js`:

- `st.speed` — brzina padanja (počinje 55, raste 1,5 po poenu, max 150)
- `st.hspeed` — brzina levo-desno (70 → 108)
- `spawn()` — koje prepreke se otključavaju na kom skoru i razmak između njih
