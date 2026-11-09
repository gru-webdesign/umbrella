# Umbrella Free Fall

One-tap pixel art igrica za telefon. Lik pada sa kišobranom kroz uličicu između dve zgrade, a **tap menja smer vetra**, pa ga kišobran nosi levo ili desno. Satelitske antene i balkoni sa golubovima vire sa fasada, a baloni i ptice lete kroz sredinu. Nema nivoa, igra se na rekord.

## Kako se komplikuje

| Poeni | Šta se dodaje |
| --- | --- |
| 0 | Antene i balkoni sa jedne strane |
| 5 | Baloni |
| 10 | Ptice (patroliraju jednu polovinu uličice) i "kapije" sa obe strane |
| 15 | Ograde od balona sa jednom rupom, u nizovima od 3–6 (kao cevi u Flappy Bird) |
| 20 | Uži prolazi: zid + balon uz suprotni zid, parovi balona |
| 25 | Ptica uz balkon na istoj strani |
| 30 | Udari vetra koji guraju lika u stranu (najavljeni sa "GUST") |
| 45 | Najgušći raspored |

Brzina padanja raste sa svakim poenom do 64. poena, a rupa u ogradama se sužava.

**Uvek postoji prolaz.** Pre nego što se red prepreka pojavi, igra proverava da u njemu postoji slobodan prolaz od najmanje 48 px (lik je širok 37). Razmak između redova se računa u vremenu: uvek ima dovoljno vremena da se pređe cela uličica, čak i kad vetar duva u suprotnom smeru. Unutar niza ograda, sledeća rupa je uvek na dohvat.

## Igranje u browseru

Bez build koraka:

```
python3 -m http.server 8000
```

pa otvori `http://localhost:8000`. Kontrole: tap ili klik, na računaru Space ili strelice. Ikonica gore desno (u meniju i na kraju) gasi zvuk i muziku.

## Android

**APK:** svaki push na `main` pokreće GitHub Actions (`.github/workflows/android.yml`), koji pravi APK preko Capacitor-a i stavlja ga u release `latest`:

`https://github.com/gru-webdesign/umbrella/releases/latest/download/umbrella-free-fall.apk`

Otvori link na telefonu, preuzmi i instaliraj. Android će jednom tražiti dozvolu da browser instalira aplikacije. Svi build-ovi su potpisani istim ključem (`tools/android/debug.keystore`), pa nova verzija može da se instalira preko stare bez gubljenja rekorda.

Za Google Play treba poseban, tajni ključ i AAB umesto APK-a. Ovaj ključ je javan i služi samo za lično instaliranje.

**Kao web aplikacija (PWA):** `.github/workflows/pages.yml` objavljuje igru na GitHub Pages. U Chrome-u na Androidu: meni → *Install app*. Radi i bez interneta. Ako se Pages ne uključi sam, u repou otvori Settings → Pages i za Source izaberi *GitHub Actions*.

## Struktura

| Putanja | Sadržaj |
| --- | --- |
| `index.html` | Stranica, canvas, PWA i service worker |
| `src/game.js` | Igra: petlja, prepreke i faze, pixel-perfect sudari, zvučni efekti, UI |
| `src/music.js` | Originalna 8-bit muzika, sintetizovana uživo (bez audio fajlova) |
| `assets/` | Obrađeni sprajtovi i pozadine |
| `art/source/` | Originalne generisane slike (magenta pozadina) |
| `icons/`, `resources/` | Ikonice za PWA i Android, splash ekran |
| `tools/process_assets.py` | `art/source/` → `assets/` |
| `tools/make_icons.py` | Pravi ikonice i splash iz sprajtova |
| `tools/build-web.mjs` | Kopira igru u `www/` za Capacitor i Pages |

## Nova grafika

1. Ubaci sliku u `art/source/` (magenta pozadina #ff00ff, frejmovi u jednom redu).
2. Dodaj red u `main()` u `tools/process_assets.py`, npr. `sheet("coin.jpg", 4, 8, "coin")`.
3. Pokreni `python3 tools/process_assets.py` (treba `pillow`, `numpy`, `scipy`).
4. Dodaj ime u `SPRITES` u `src/game.js` i u listu u `sw.js`.

## Podešavanje težine

U `src/game.js`: `STAGES` (kad se šta najavljuje), `buildRow()` (koje prepreke od kog skora), `spawn()` (ograde i razmaci), `GUST` (jačina vetra), a brzine se menjaju gde se dodaje poen (`st.speed`, `st.hspeed`).
