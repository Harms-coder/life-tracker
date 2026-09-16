# Life Tracker App – projektplan

> Denne fil er den fælles hukommelse mellem planlægning (Claude/Cowork) og kodning (Claude Code).
> Opdater "Beslutninger" og "Åbne spørgsmål" når noget ændrer sig. Svar på dansk.

## Idéen
En digital udgave af Lukas' håndskrevne månedsbog (habit tracker). Appen skal ligne og føles som
en rigtig ternet notesbog i B5, der ligger åben på et bord, hvor man kan bladre. Én måned = ét opslag.
Motivation: papirversionen virker, men det er for besværligt at tegne et nyt skema i hånden hver måned.

## Platform
- **Primært iPhone.**
- Hele opslaget (begge sider) vises på skærmen; man **zoomer ind med to fingre** (pinch) og panorerer rundt.
- Forslag: webapp/PWA (kan lægges på hjemmeskærmen fra Safari). Data gemmes lokalt først (IndexedDB), sync senere.

## Bogen (visuelt)
- B5-format pr. side: 176 × 250 mm (forhold 1 : 1,42). Opslag = to sider side om side.
- Ternet papir (ca. 5 mm tern), let gullig/cremefarvet papirtone, svagt grønligt/gråt gitter.
- Sort hardcover, elastikbånd/pennelomme i højre side, sort læsebånd nederst – ligger på et bord.
- Realistisk sidevending (bøjning + skygge) når man bladrer mellem måneder.
- Siderne må ikke se perfekte ud: let papirtekstur, lille skygge ved ryggen.

## Håndskrift (vigtigt)
- Alt man indtaster vises som håndskrift – kuglepen eller blyant (valgfrit).
- Hvert tegn (bogstaver, tal 0–9, X, prik) har **mindst 5 varianter**, der vælges tilfældigt men stabilt
  (samme celle ser ens ud hver gang den åbnes – brug seed ud fra dato+kolonne).
- Ekstra naturlighed: lille tilfældig rotation, forskydning i cellen, størrelse og stregtykkelse.
- Når noget skrives, animeres stregen frem som om den bliver skrevet.
- Plan: Lukas skriver et skabelonark med sine egne tegn (5× hver), som bliver til SVG-glyffer.
  Indtil da bruges en midlertidig håndskriftsfont + jitter.
- Skabelon: `haandskrift/haandskrift-skabelon.pdf` (A4, 3 sider: tal/tegn, små, store bogstaver inkl. æøå).
  Sorte hjørnefirkanter bruges til at rette fotoet op; lyseblå bokse og stiplet grundlinje (30 % oppe) fjernes digitalt.
  Hver side: 3 tegn pr. række, 5 bokse pr. tegn, rækkefølge som i PDF'en. Fotos lægges i `haandskrift/fotos/`.
- Pipeline (Claude Code): ret foto op via hjørner → skær bokse ud → fjern baggrund/gitter → vektoriser (potrace) til SVG
  → gem som glyf-sæt (JSON: tegn → 5 SVG-varianter + grundlinje). Skrive-animation via maske der afsløres i skriveretning.

## Venstre side – månedens plan
- Øverst: **måned + år** (fx "September 2026").
- **Mål denne måned** (op til 5), hvert mål kan have **undermål**.
- Under målene: plads til at skrive **hvordan** man vil nå målene.
- Hele venstre side er altså planen for måneden. ("Daglige bemærkninger" fra papirbogen droppes.)

## Højre side – tracking af måneden
Rækker = dage 1–31 (antal efter måneden). Kolonner = brugerens egne trackere. Typer:
1. **Tal** – fx vægt (71,5).
2. **Afkrydsning** – X hvis gjort: løb, meditation, udstrækning, mindre brok, spist clean, dagbog …
3. **Rating** – tal fx 1–10: overskud, produktiv, glad; skærmtid (timer).
4. **Søvnscore som prikgraf** – 0–10-skala med én prik pr. dag, så prikkerne danner en kurve over måneden.
5. **Dagsscore** – rating af dagen i sidste kolonne.
- Kolonneoverskrifter står lodret/skråt øverst, som i papirbogen.
- Kolonneopsætning gemmes, så en ny måned automatisk får samme skema (kan justeres).

## Interaktion (forslag)
- Tryk på en celle → hurtig input (X-toggle for afkrydsning, talvælger for tal/rating).
- Værdien "skrives" ind i håndskrift med animation.
- Venstre side: tryk på et felt → tekstinput → vises som håndskrift.

## Beslutninger
- Planlægning/design i Claude (Cowork), kode i Claude Code – samme mappe.
- Stak (valgt 2026-09-16): React + TypeScript + Vite, almindelig CSS (ingen Tailwind – bogen har sit eget look).
  Hosting: GitHub Pages fra repo `Harms-coder/life-tracker` (`base: /life-tracker/`), workflow bygger ved push til main.
  Live: https://harms-coder.github.io/life-tracker/
- ARKITEKTUR (2026-09-16, efter måling): hele bordet + bogen tegnes som ÉT canvas-billede (`src/draw.ts`), som
  telefonen kun flytter/skalerer/vipper med CSS-transform (`src/BookCanvas.tsx`). Først når fingrene slippes,
  tegnes det synlige udsnit igen, skarpt, én gang. Grund: DOM-udgaven fik Safari til at tegne hele bogen om
  (300–600 ms) ved hvert zoomtrin og hver ændring af 3D-vippet. Målt i WebKit (Playwright) med `bench.mjs`:
  0 frames over 33 ms efter ombygningen. Geometri + hit-test ligger i `src/layout.ts`; DOM'en har kun
  rummet (vindue), bordkanten (3D) og input-fladerne (sheets). Ingen aria/knapper i bogen længere.
- Pinch-zoom er lavet selv (pointer events) i stedet for browserens egen zoom, så opslaget starter tilpasset
  skærmen og kan zoomes op til 7× derfra. Et tryk tæller kun, hvis fingeren ikke har flyttet sig >8 px, og kun
  når vippet er væk (zoomet ind).
- Gitteret: 1 tern = 20 px ved zoom 1; side = 704 × 1000 px (B5-forhold). Alt på siden placeres i tern.
- Håndskrift indtil Lukas' egne glyffer: Google-fonten Caveat + lille seedet rotation/forskydning pr. tekst
  (`text()` i draw.ts). X'er tegnes som to let buede streger (`handX()`), seedet af dag+kolonne, og animeres frem
  med lineDash, når de sættes.
- Trin 1 gemmer alle værdier i localStorage (én nøgle pr. måned). Erstattes af rigtig datamodel i trin 2.
- Højresiden (2026-09-16, efter Lukas' feedback): håndtegnede sorte streger om alle kolonner og under
  overskrifterne (`TableLines` i App.tsx, let vaklende SVG-linjer). Dagskolonnen er 2 tern: ugedagsbogstav
  (M T O T F L S) + dato. Kolonnetyper i `COLUMNS`: tal (vægt), afkrydsning, rating, prikgraf (søvn, 6 tern
  bred, skala 0–10, tryk hvor prikken skal sidde) og dagsscore. Tal/rating indtastes via en lille bundflade.
- Kolonner kan rettes/slettes/tilføjes af Lukas selv (tryk på overskrift, "+" efter sidste kolonne). Gemmes i
  localStorage under `columns`; hver kolonne har et `id`, og værdier er nøglet på `dag:id`, så omdøbning bevarer data.
  Overskrifter læses oppefra og ned (bogstavernes bund mod højre). Tal-kolonner (2 tern) har vandret overskrift.
- Papiret er let uperfekt: ujævne yderkanter (clip-path) og et par svage folder (gradienter i `.page::after`).
- Lukas' egen håndskrift (trin 4): han udfylder fysiske ark med alle bogstaver og tal. Al tekst tegnes via
  `text()` og X'er via `handX()` i `src/draw.ts` – glyfferne byttes ind DER, intet andet sted skal røres.
- Scene (2026-09-16): bogen ligger på et træbord foran et vindue. Himlen i vinduet følger klokkeslættet
  (solopgang 5–9, dag 9–17, solnedgang 17–21, nat). Zoomet helt ud ses bordet skråt fra en stol (rotateX op til 48°);
  zoomer man ind, retter kameraet sig op til lige oppefra (`Zoom.tsx`, TILT_*). Bordet ligger i "verden" inde i
  zoom-laget, så det følger med. Rummet (`Room` i App.tsx) er en CSS-udgave; kan byttes til et genereret billede
  (Higgsfield) når Lukas har forbundet det.
- Zoom: man kan panorere 60 % af skærmen ud over bogen (OVERPAN), og den glider videre med inerti, når man slipper.
- Bogen ligger på et træbord. Farven er ÉN variabel: `--table` i src/index.css. Læsebåndet er fjernet (Lukas' ønske).
- iPhone først, hele opslaget synligt + pinch-zoom.
- Venstre side = månedens mål, undermål og plan. Højre side = daglig tracking.

## Åbne spørgsmål
- Skal der være plads til "taknemlighed" eller noter et sted (fx en ekstra kolonne eller senere side)?
- Kuglepen vs. blyant – valgfrit pr. bog eller pr. indtastning?
- Statistik/oversigt over flere måneder?
- Tech-stack endeligt valg (PWA vs. native iOS).

## Reference
- `referencer/` – billeder af papirbogen (august 2025-opslaget og tomt opslag).
- `screenshots/` – seneste skærmbilleder fra den automatiske test (ikke i git).
- Test-scripts ligger i sessionens scratchpad (`pw/shots.mjs` skærmbilleder, `pw/bench.mjs` frame-tider i WebKit,
  `pw/tapcheck.mjs` tryk). Dev-server: `npm run dev`. I dev sætter BookCanvas `window.__view` (x, y, s) til scripts.

## Status 2026-09-16 (sådan fortsætter man)
- Live: https://harms-coder.github.io/life-tracker/ · repo `Harms-coder/life-tracker` · alt er committet og pushet.
- Kør lokalt: `npm install` (én gang), `npm run dev` → http://localhost:5173/life-tracker/ (også fra telefonen på LAN-ip).
- Test: `npm run shots` (skærmbilleder i `screenshots/`), `npm run bench` (frame-tider i WebKit, kræver 0 frames > 33 ms),
  `npm run tapcheck` (tryk virker). Scripts starter selv dev-serveren. Playwright-browsere: `npx playwright install` hvis de mangler.
- Vis billeder til Lukas: `python3 tools/gallery.py '[["1-opslag.png","Titel","Tekst"]]'` → `screenshots/galleri.html`,
  publiceres som Artifact (samme URL hver gang: https://claude.ai/artifact/S914mdZ2Tq4gAuqWUrxLYb).
- Færdigt: hele opslaget (venstre: titel i kasse, seks mål; højre: skema med alle kolonnetyper, søvnkurve,
  gennemsnit/antal, fire fritekstfelter), kolonner kan rettes, eksempeldata, scenen (bord, vindue, vip),
  glidende zoom (canvas). Data ligger i localStorage (values-/notes-/columns-nøgler) – kun én måned.
- Næste skridt (Lukas' ønsker i rækkefølge): 1) Higgsfield-billede af bord + vindue, når han har forbundet
  connectoren. 2) Trin 2: flere måneder + sidevending + rigtig datamodel (IndexedDB). 3) PWA-ikon og
  "læg på hjemmeskærm". 4) Trin 4: hans egen håndskrift som glyffer (byttes ind i `text()`/`handX()` i draw.ts).
- Kendt: skriften er en anelse blød UNDER en pinch, skarp ved slip (bevidst, jf. arkitektur ovenfor).

## Roadmap
1. ~~Prototype af ét opslag: bog på bord, ternede sider, pinch-zoom, afkrydsning med håndskrevne X-varianter.~~ ✅ 2026-09-16
2. Sidevending mellem måneder + datamodel (måneder, trackere, værdier) med lokal lagring.
3. Venstre side (mål/undermål/plan) med tekst i håndskrift.
4. Lukas' egen håndskrift som glyffer.
5. Finpudsning: papirtekstur, skygger, animation af skrift.
