---
name: vis-det
description: >-
  Tag det rigtige skærmbillede af Life Tracker-bogen efter en visuel
  ændring, mål på det rigtige, og læg det i galleriet, så Lukas kan se
  det på telefonen. Brug denne skill EFTER hver ændring der flytter,
  tegner, farver eller animerer noget i bogen — overskrifter, mål,
  kolonner, prikgraf, billedpladser, input-flader, skriveanimation,
  sidevending, bogens kant, papir, skygge, bordet, baggrunden — også når
  Lukas ikke beder om et billede, for han svarer hurtigt og præcist på et
  billede og vagt på en beskrivelse. Brug den OGSÅ når han spørger "hvordan
  ser det ud", "vis mig det", "tag et billede", eller siger at noget ligger
  forkert. Brug den IKKE ved rene kodeændringer uden synligt resultat
  (typer, oprydning, kommentarer), ved rettelser i tools/ eller CLAUDE.md,
  og ikke til at bedømme ydelse på telefonen — dertil duer et skærmbillede
  ikke.
---

# Vis det, før du lægger det ind

Lukas svarer hurtigt og meget præcist på et billede, og langsomt og vagt på en
beskrivelse. Hver runde, der begynder med "jeg har rettet X", koster et ekstra
led frem og tilbage. Hver runde, der begynder med et billede, gør ikke.

Projektet har 41 test-scripts i `tools/`. At vælge det forkerte, eller at måle
på den forkerte ting, har allerede kostet flere runder, end noget andet i denne
kodebase. Det er derfor, denne skill findes.

## Kernereglen

Rørte du ved noget, der tegnes, så tag billedet **før** du siger, at du er færdig.
Ét billede, der viser det rettede zoomet ind — ikke en beskrivelse af det.

## Trin 1 — Vælg scriptet ud fra HVAD du rørte

| Rørte du … | Kør |
|---|---|
| Kolonneoverskrifter, `drawRightPage` | `headcheck.mjs <ud>.png` — og `headmeasure.mjs` hvis det er placering |
| Venstresiden: mål, planer, månedsoverskrift | `planshot.mjs <ud>.png` |
| "Hvad gik godt"-kassen, `noteText`, linjeombrydning | `goodcheck.mjs <ud> <photos.json>` |
| Skrive- og viskeanimationen, `text()`, `reveal` | `pencheck.mjs <ud>` (tilføjer og fjerner et "?") eller `writecheck.mjs <ud>` |
| Input-flader (tal, rating, tekst, kolonne) | `sheets.mjs <ud>` — én flade pr. type |
| Hvor markøren lander i en skriveflade | `focuscheck.mjs` (skriver svaret ud, intet billede) |
| Billedpladser | `photocheck.mjs <photos.json> <ud>.png` |
| Emojis i skriften | `emojicheck.mjs <ud>.png` |
| Sidevending, bladet, ryggen | `turncheck.mjs <mappe>`, `turnframes.mjs` (fanger et enkelt frame), `spinecheck.mjs` |
| Bogens kant, hjørner, papirstakken | `kantcheck.mjs <mappe>` eller `edgecheck.mjs <mappe>` |
| Bordet, baggrunden, overgangen foto→bordplade | `tablecheck.mjs`, `steps.mjs <mappe>` (seks zoom-trin) |
| Zoom, panorering, at bogen bliver under fingrene | `zoomcheck.mjs <mappe>` |
| Om et tryk lander i den celle, man rammer | `tapnoej.mjs` |
| Ingenting af ovenstående / bare "hvordan ser det ud" | `fit.mjs <ud>.png` (startvisningen) eller `shots.mjs <mappe>` |

Alle køres som `node tools/<navn>` fra projektroden.

**Findes der ikke et script til det, du rettede, så skriv et nyt** og læg det i
`tools/`. Det er sådan, de 41 er opstået. Et script, der kan køres igen næste gang,
er mere værd end et engangsbillede.

## Trin 2 — Kør det rigtigt

- **Start ikke `npm run dev` først.** Hvert script starter selv dev-serveren via
  `withServer` og lukker den igen. Kører der allerede en på 5173, bruger det den.
- **Kør aldrig to scripts samtidig.** Porten er `--strictPort`, så det andet fejler.
  Og kør aldrig noget samtidig med `bench.mjs` — den måler frame-tider.
- `goodcheck` og `photocheck` kræver en `photos.json` med testbilleder som argument.
- Nogle scripts tager en query-streng med `Q=`, fx `Q="?bord=0" node tools/steps.mjs …`.

## Trin 3 — Bedøm det i Chrome, ikke i WebKit

**Playwright-WebKit tegner CSS-3D uden rigtig perspektivprojektion.** Bogen bliver
flad og sidder for højt. WebKit-billeder kan derfor IKKE bruges til at bedømme
geometri — kun `bench.mjs`, `tapcheck.mjs` og `webkit-shots.mjs` er WebKit, og de er
til frame-tider og fallback, ikke til udseende.

Geometri bedømmes i **Chrome, 390×844, deviceScaleFactor 3** — det gør scriptene
ovenfor allerede.

## Trin 4 — Mål på det rigtige, hvis det handler om placering

Tre fælder, der hver har kostet runder her:

1. **Håndtegnede streger bølger ±1,4 px.** Måler du "yderste mørke pixel i kolonnen",
   måler du stregen, ikke blækket — det gav 1,6–1,7 px "luft" i ALLE kolonner uanset
   indhold. Mål **tyngdepunkt** med ~10 px margen ind fra linjerne.
2. **X'erne i første række stikker ~4 px op over den vandrette linje.** En lodret
   måling skal stoppe et stykke over den, ellers måler du et X.
3. **Er teksten drejet, er dens grundlinje LODRET.** Spørg hvilken linje, Lukas mener,
   før du flytter noget roteret. Det kostede tre forkastede varianter sidst.

## Trin 5 — Vis ham det

```bash
python3 tools/gallery.py '[["fil.png","Titel","Kort tekst"]]' "Indledning"
```

Det bygger `screenshots/galleri.html`. Publicér den som Artifact på **den samme url
hver gang** (https://claude.ai/artifact/S914mdZ2Tq4gAuqWUrxLYb): `read` den først,
derefter `publish` med `url`. En ny url betyder, at han skal lede efter linket.

Skriv derefter to linjer: hvad billedet viser, og hvad du gerne vil have hans dom på.

## Skal du lave varianter?

**Er det et niveau, en form eller en placering, du gætter på: lav 3–4 varianter bag en
knap og lad ham pege.** Det tager én runde i stedet for tre. Det er prøvet og virker
(`?dip=N`, `?ov=N`, `?kant=N`).

**FÆLDE:** `draw.ts` kører i en Web Worker og kan **ikke** læse `?knap=` fra adressen.
En ny knap skal lægges på scene-objektet (sådan som `hand` og `headPos` er), ellers gør
den ingenting — og man tror, man ser en forskel, der ikke er der.

## Kalibrering

**For lidt** er værre end for meget. Et unødvendigt billede koster 30 sekunder. En
beskrivelse i stedet for et billede koster en hel runde frem og tilbage — og hvis
beskrivelsen var forkert, koster den to.

**For meget** ser sådan ud: et billede efter hver linje kode i en opgave, der består
af fem rettelser. Saml dem: ret alle fem, tag så billederne.

## Den ærlige grænse

**Chrome er ikke en iPhone.** Over halvdelen af fejlene i dette projekt har kun kunnet
ses på Lukas' telefon: bogen sort ved start, hvid streg under en sidevending, blink ved
landing, hakkende panorering. De kom alle af GPU-forskelle, som headless Chrome aldrig
viser.

Så: et billede beviser, at **geometrien** er rigtig. Det beviser ikke, at det **ser
rigtigt ud** eller **føles rigtigt** på telefonen. Skriv altid "IKKE SET AF LUKAS PÅ
TELEFONEN", når det er tilfældet, og bed om hans dom. Lad være med at skrive, at noget
virker, fordi et skærmbillede så fint ud.

## Eksempel

**Opgaven:** Lukas sender et foto og siger, at kolonneoverskrifterne "ligger på linjen".

**Forkert:** ret `HEADER_LIFT`, push, skriv "nu er de løftet fri". (Det skete. Tre gange.
Hver gang var det den forkerte linje.)

**Rigtigt:**
1. Spørg hvilken linje — en roteret overskrift har sin grundlinje lodret.
2. Ret det.
3. `node tools/headcheck.mjs screenshots/head.png` + `node tools/headmeasure.mjs` for at
   måle tyngdepunktet pr. kolonne med margen ind fra linjerne.
4. Galleri, samme url.
5. "Overskrifterne står nu midt mellem kolonnens to lodrette streger — målt tyngdepunkt
   gik fra +4,3 px til −0,3 px. Kig på det på telefonen: sidder de rigtigt nu?"
