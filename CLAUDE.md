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
- DYBDELAG (2026-09-16 sent, opgaven i `TASK_scene_depth.md`, trin 1–3 færdige): fotoet er splittet i 7 lag med hver sin dybde
  (`src/scene.json`: 0 = uendeligt langt væk, 1 = bogens plan; koordinater i fotoets pixels, `pad` = spejlede marginer).
  Råfilerne (PNG fra Higgsfield-lagsplit + `composite.png` = originalen) ligger i `baggrund-kilder/lag/` (ikke i git);
  `npm run scene` (tools/scene-assets.py, python3 + cv2 + PIL) laver `public/baggrund/<id>.webp`: tager originalens pixels
  overalt hvor et lag er synligt (AI-pixels kun hvor parallaksen afslører dem), tilpasser bløde kanter, udfylder huller i
  bordet, spejler kanter, og folder bordpladen ud i bogens plan som to fliser (`flat`, near/far) = den inverse af CSS-vippet
  ved tiltFar. `src/camera.ts` = kameraet (én kilde: z, pan, t, tilt fra gestus-tilstanden; `perspective` i VERDENS-px, så
  projektionen er ens på alle skærme og bordpladen kunne foldes ud én gang). `src/Scene.tsx` = lagene som <img> i verdens-
  enheder; BookCanvas sætter deres transform pr. frame (skaleret om bogens centrum og panoreret med dybden). Lag EFTER
  bordplanet i scene.json (pynt, stol) tegnes efter vippet, så de overlapper bordkanten. Bordpladen ligger i `.worldflat`
  under skyggen og bogen og vipper MED bogen. Identitets-visningen (alle lag i skala 1 = fotoet) er MIN-zoom (start), ikke
  "bogen fylder skærmen" som opgaven skriver – ellers ville startbilledet ikke være Lukas' foto. `npm run scenecheck`
  (Chrome 390×844@3, `?nobook`) differ scenen mod fotoet og laver s0-side/s0-overlay + views s1–s5; `__zoomTo(z)` og
  `__cam()` i dev. Videoen og tidspunkt-skiftet (Backdrop.tsx) er FJERNET med lagene (Lukas' accept); jpg/mp4 pr. tidspunkt
  ligger stadig i public/baggrund til senere. Kendt: bordpladen over bogen er sløret, når den ligger fladt (fotoet har få
  pixels der). Lys/skygge/fokus (opgavens trin 4–5, `light`/`focus` i scene.json) er IKKE lavet endnu.
- SCENE = HIGGSFIELD-FOTO (2026-09-16 aften, erstatter det tegnede rum/bord/vindue; DELVIST FORÆLDET, se DYBDELAG ovenfor): rummet er et genereret billede +
  lydløs loop-video pr. tidspunkt, `public/baggrund/<tid>.jpg|mp4`, tid ∈ morgen (05–10), middag (10–17), aften (17–21),
  nat (21–05). `src/Backdrop.tsx` vælger efter telefonens klokkeslæt (PT. LÅST TIL AFTEN via `ONLY` øverst i filen, indtil aften sidder lige i skabet – sæt til null for at slå skiftet til) (tjekker hvert minut), crossfader 2,4 s ved skift,
  og falder tilbage til AFTEN, hvis en fil mangler (billede og video hver for sig: findes kun billedet, vises kun det).
  Video: muted + playsInline + autoplay + loop; billedet ligger under og ses, indtil videoen spiller / hvis den ikke kan.
  Forhåndsvis et tidspunkt med `?tid=nat` i adressen.
  RÅFILER fra Higgsfield ligger i `baggrund-kilder/` (IKKE i git, 11 MB PNG + 6 MB HEVC). `npm run baggrund` (tools/baggrund.sh,
  kræver ffmpeg: `brew install ffmpeg`) laver web-udgaverne: navnet skal blot indeholde morgen/middag/aften/nat →
  1080×1920 JPEG (~0,4 MB) og H.264-video (~0,35 MB) med sømløst loop (sidste sekund crossfades ind i det første, så
  klippet slutter, hvor det starter). Lægger Lukas nye råfiler ind: kør scriptet, commit `public/baggrund/`.
  Kvalitet: billederne er 1440×2560 JPEG (~0,7 MB), så de er skarpe på en 3×-telefon.
  ZOOMET IND er det stadig fotoets bord man ser (Lukas: "det skal være den bordplade, bogen ligger på"). En tegnet
  bordplade, der tonede frem, blev forkastet – "giver ingen mening". Konsekvens: fotoet er 8× forstørret og sløret
  zoomet ind, og bogens flade fodaftryk skal holde sig inden for fotoets bord (derfor ligger bogens centrum på 0,64 af
  højden, ikke lavere). Panorering zoomet ind: kun over bordet i fotoet (`TABLE` = 0,46–0,78 af BG's højde).
  Bogen i lyset: efter alt er tegnet lægges en varm, let mørkere-mod-betragteren tone over bogen (`tint()` i draw.ts,
  source-atop) – ellers ser det kridhvide papir forkert ud i aftenlyset. Papiret har svage bølger og buer kraftigt ned
  mod ryggen (gradienter i drawPage/drawSpine).
  BOGENS TYKKELSE (Lukas' reference: en rigtig bog, ikke to flade ark): COVER = 24 (sort cover-ramme om siderne, hvoraf 8
  er et bånd af sidekanter, `edge()` i drawCover), BOOK_T = 80 (2 cm som i referencen; 180 var "alt, alt for tyk").
  Opslaget løftes BOOK_T op (translateZ), og sideblokkens FORKANT er én CSS-flade (`.book-face`, rotateX(90) i `tilt2`),
  der står fra bordet op til coverets forkant: sort cover-bræt nederst, sidekanter, lys ovenfra. INGEN sideflader: fra
  hvor man sidder kan et bords/bogs sider ikke ses, og tegnede sideflader så ud som lyse "vinger" langs de skrå kanter.
  Blokken toner ud (opacity), når kameraet går overhead. Skyggen er to DOM-ellipser (`.shadow` i `.worldflat`, ligger på
  bordplanet under den løftede bog): lang og blød fremad + tæt under.
  Kamera: TILT_MAX = 58°, PERSPECTIVE = 700 px (mindre = mere sammenløb af bogens sider, som i referencen).
  Geometri: fotoet ligger i verdenskoordinater som `BG` i layout.ts (størrelse = hvor stor bogen er på bordet, offset = hvor
  den ligger; tunet efter øjemål, bogen vippes med TILT_MAX = 56° ≈ fotoets kameravinkel). VIGTIGT: bogen vipper om SIT EGET
  centrum (transform-origin på `.tilt`/`.tilt2` sættes pr. frame i `paint()` til bogens 2D-centrum). Så ligger bogens
  centrum samme sted på fotoet uanset zoom, og bogen "folder sig ud" om sit centrum, når vippet forsvinder. Vippede den om
  skærmens midte (som før fotoet), blev bogen skubbet ned ad skærmen under zoom, fordi den ikke ligger i skærmens midte. Baggrundslaget
  (`.scene2d`) panorerer/zoomer i 2D med verden men vipper ikke; kun bogen vipper og flader ud, når man zoomer ind.
  Min-zoom = fotoet dækker lige skærmen (cover, siderne beskæres på iPhone 19,5:9). Panorering: zoomet ud til fotoets kant,
  zoomet ind kun over bordet i fotoet (`TABLE`, brøkdele af BG – SKAL rumme hele bogen med margen); grænsen glider
  imellem de to med vippet, så intet hopper. Skyggen under bogen tegnes på den (ellers tomme) "shadow"-canvas i draw.ts: blød og lang
  fremad mod betragteren (lyset kommer fra vinduet) + en tæt mørk lige under.
  Bemærk: middag-fotoet har en lidt anden komposition end aften/nat; ligger bogen skævt på et nyt foto, justér BG/TABLE.
  FALDGRUBE: Playwright-WebKit tegner CSS-3D uden rigtig perspektivprojektion (bogen bliver flad og sidder for højt), så
  WebKit-skærmbilleder kan IKKE bruges til at bedømme geometri – brug Chrome (`deviceScaleFactor: 3`) og Lukas' telefon.
  `perspective()` ligger som funktion inde i `.tilt`-transformen (ikke som CSS-egenskab på forælderen) for at være entydig.
- 3D-dybde (2026-09-16): skygge og bog er TO canvas-bitmaps i hver sit `.gesture`-lag. Bogens canvas løftes med
  `translateZ(BOOK_T·s·tilt)` når scenen er vippet, og bordets tykkelse/bogens sideblok er en CSS-flade (`.book-face`) i `world3d`, skaleret med `scale3d(s, s, s·tilt)`. Løftet forsvinder, når kameraet er lige oppefra,
  så tryk (hit-test) er upåvirket. FALDGRUBE: fladerne SKAL ligge i deres eget 3D-lag (`tilt2`, søskende til `tilt`) –
  ligger de i samme preserve-3d-kontekst som canvas'et, sorterer Chrome planerne forkert og klipper bitmappet.
- Skarp under pinch (2026-09-16): midt i en pinch tegnes bogen om (`renderLive`), når bitmappet er strakt >15 % eller
  vippet er slået til/fra – med lavere budget (LIVE_BUDGET) og UDEN at omallokere canvas'et (omallokering kostede
  ~40 ms). Bordet tegnes ikke om undervejs (træ må gerne strækkes). Ved slip tegnes alt skarpt som før. Målt i
  WebKit-benchen: 1–2 frames à ~35–40 ms pr. pinch (mod 0 før). Ikke målt på telefonen – spørg Lukas, om det hakker.
- Første måling af skærmen sker i dev FØR CSS'en er slået til i WebKit (Vite indsætter CSS via JS), så `fit()` kører via
  en ResizeObserver på `.viewport` og retter sig selv, når den rigtige størrelse kommer.
- Læsebåndet er fjernet (Lukas' ønske).
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

## Status 2026-09-22 kl. 18.10 – SKARP MIDT I PINCHEN + INGEN SORT BOG VED START

Lukas: sløret mens fingrene er på skærmen; bogen sort et splitsekund ved load; "optimér en sidste gang".
- **Sort bog ved start** (rodårsag, ikke set i Chrome – for kort): en WebGL-tekstur uden indhold samples som
  UIGENNEMSIGTIG SORT, og `texRect` starter som hele bogen, så `img` var sort til den første tegning var oppe.
  `pageTexture()` i bog3d.ts lægger nu én gennemsigtig texel ind ved oprettelsen → shaderen falder igennem til
  papir. Gælder front/back/over/next. Lyskortet var allerede sikret (`u_lightAmt.x` = 0 til det er oppe).
- **Skarp under pinch**: tre knapper. LIVE_BUDGET 2e6 → 4e6, LIVE_RATIO 1,5 → 1,25, LIVE_GAP 260 → 140 ms.
  OG workeren må nu VOKSE canvas'et også ved live-tegninger (draw.worker.ts): grow-only betød, at live-tegningen
  blev skaleret ned til det gamle canvas – derfor blev den ved med at være blød, uanset hvor tit den tegnede.
  Vækst sker i workeren og kun op til budgettet, så spidsforbruget er som før (24 MB).
  Plus `STILL_MS` = 160: står fingrene stille midt i en pinch, tegnes der FULDT (render()) der hvor de står.
  Målt (tools/startcheck.mjs, kantskarphed i bogens område): mid-pinch 1,29 → 3,35 = det samme som efter slip.
- Bench (WebKit, ingen GPU): 2–3 frames > 33 ms pr. pinch – som før live-tegningerne kom til (17/9). zoomcheck OK.
- `node tools/startcheck.mjs screenshots/start` = 8 billeder lige efter load + pinch holdt ved 2,5× + efter slip.
- IKKE SET AF LUKAS PÅ TELEFONEN. Hvis det hakker: LIVE_GAP op (200), LIVE_BUDGET ned (3e6), STILL_MS op.

## Status 2026-09-22 kl. 17.45 – PRIKKER I SKRIVEFLADEN + PENNEN SKRIVER ALT

Lukas' to ønsker efter input-fladerne: (1) man skal kunne se prikkerne foran linjerne, når man skriver,
(2) når man trykker Skriv, skal det skrives ind i bogen, som om nogen sidder og skriver det – og det samme
alle andre steder (X'er, vægt, alle tal).
- **Linjer med prik** (`Lines` i App.tsx): tekstfeltet er væk; i stedet én `<input>` pr. punkt med bogens
  egen "•" foran. Skrevet linje = sort prik, den tomme nederst = svag prik (der skriver man det næste).
  Enter hopper til næste linje, backspace på en tom linje sletter den. Et skjult `name="v"` samler linjerne
  med \n, så `submitNote` er uændret. Mål-felterne (goalN) får INGEN prikker – bogen tegner dem uden.
- **Pennen** (`penWrite` i App.tsx, `penAt`/`penLines`/`reveal` i draw.ts): `scene.writing = {key, start, ms, lines?}`
  gælder nu ALT, ikke kun X'er. `text()` har fået `reveal` (klip der løber fra venstre langs linjen), `noteText`
  deler rejsen mellem de NYE linjer, prikgrafens prik toner frem.
  KUN DET NYE SKRIVES (Lukas 17.50): `saveNote` sammenligner med det, der stod før, og sender kun de linjer videre,
  der ikke var der (`lines` i writing; `isNew(i)` i noteText). Ellers blev hele kassen skrevet om hver gang.
  Tempo (Lukas: for hurtigt): ms = 260 + max(tegn, 5) × 110, max 6000 ≈ ni tegn i sekundet; et X eller et tal ~0,8 s.
  X'ET SOM TO STREGER (`drawInBox` i glyf.ts): glyfferne er sporede OMRIDS, ikke pennestreger, så hver streg afsløres
  gennem et smalt bånd lagt langs sin egen diagonal (hw = 0,17 × glyfhøjde); ↘ først (progress 0–0,5), så ↗.
  Båndet skal være smalt: 0,3 tog den anden streg med.
  `?pen=6` gør den langsom (til skærmbilleder/tuning).
  Træk i søvnkurven skriver UDEN pen (`write(key, v, false)`) – den følger jo allerede fingeren.
  Hver frame = én tur til workeren, så på telefonen bliver det få, grove trin. UBEKRÆFTET af Lukas.
- Test: `node tools/writecheck.mjs screenshots/write` (fem billeder lige efter Skriv, med `?pen=6`;
  målt i Chrome: "7" → "70," → "70,4"; note-testen tilføjer én linje til en liste med tre og måler, at kun
  dens pixels ændrer sig). `node tools/sheets.mjs screenshots/sheet` = én flade pr. type.

## Status 2026-09-22 kl. 17.25 – INPUT-FLADERNE

Lukas: "en utrolig grim hvid boks med standardtekst" når man trykker for at skrive. Alle fem flader
(tal, rating, tekst, kolonne, håndskrift) er nu ÉN komponent, `Sheet` i App.tsx: ternet papir i bogens
farver, overskrift + værdier i Caveat, ✕ til højre, glider op nedefra, baggrunden dæmpes og sløres let.
- Rating vælges med ti knapper (`.chips`) i stedet for tastaturet; det tal der står i forvejen er fremhævet
  (halve tal fra demo-data rundes, når der sammenlignes). Kolonnetypen er fire knapper i stedet for `<select>`.
- Tekstfeltet har ingen egne linjer – papirets tern ER linjerne (line-height 40 px = 2 tern).
- CSS'en ligger samlet under "input sheets" i index.css; farverne er bogens (--paper/--ink/grid).
- `window.__tap(wx, wy)` i dev (BookCanvas) åbner en flade direkte fra et testscript.
  `node tools/sheets.mjs screenshots/sheet` = ét billede pr. flade i Chrome 390×844@3.
- IKKE SET AF LUKAS PÅ TELEFONEN ENDNU. Galleri: https://claude.ai/artifact/S914mdZ2Tq4gAuqWUrxLYb

## Status 2026-09-22 kl. 17.15 – SESSIONEN LUKKET NED, ALT ER PUSHET

**Live:** https://harms-coder.github.io/life-tracker/ · **Galleri:** https://claude.ai/artifact/S914mdZ2Tq4gAuqWUrxLYb
Arbejdstræet er rent. Lukas' sidste ord: "det er godt arbejde". Bladringen er GODKENDT på telefonen: udseende,
lys der følger bladet, ingen hak, ingen blink, ingen streger. Detaljerne står i afsnittet lige under.

### Det blev lavet i dag (nyeste først)
1. Finger-bladring kun helt zoomet ud og kun fra sidens yderste halvdel; ellers panorerer man. Pile altid.
2. Alle teksturopslag i fragment-shaderen ubetinget (tynd streg på telefonen under vending).
3. Kanten: mørkt omslag under siderne, skørterne mødes i hjørnet, kanten bygget på omslagets egen kant.
4. Bladring: bladet tegnes fra p = 0 (blink ved tryk), oversigt 2048×1024 m. mipmaps, fade ved landing,
   ingen zoom-ud ved pil (kameraet står længere væk for bladet), lyset følger bladet, bagside rigtig begge veje.
5. Måneder gemt hver for sig i localStorage (`values-/notes-/photos-<år>-<måned>`), sidst åbne måned huskes.

### FØRSTE SKRIDT NÆSTE GANG
- Spørg, om finger-bladringen nu er for svær at ramme (GRAB_ZOOM 1,08 / GRAB_OUTER 0,5 i BookCanvas.tsx).
- Roadmap trin 2 rest: IndexedDB i stedet for localStorage (billederne fylder). Trin 5: finpudsning.
- Kendt: zoomet langt ind ses bladets skygge på siden under som 5 trin (SHADOW_PASSES).
- Ubesvaret fra 22/9 formiddag: billedpladsen b4 øverst til højre på højresiden – ligger den rigtigt?

### LÆRT I DAG
1. **Når Lukas siger PRÆCIS hvornår noget sker ("idet jeg trykker på pilen"), så er det svaret.** Jeg brugte to
   runder på landingen (fade, mipmaps), før jeg tog "idet jeg trykker" bogstaveligt og fandt den manglende
   frame (bladet ikke tegnet ved p = 0). Find den frame, gæt ikke.
2. **Telefon-only fejl (streger, blink) = GPU-forskelle.** Headless Chrome viser dem aldrig. Regel: ingen
   texture2D inde i per-fragment-grene; ingen mipmap-løse teksturer der formindskes.
3. **Skær tegnepas fra ét ad gangen (`?skip=`) og MÅL i pixels** i stedet for at ræsonnere om geometri i
   hovedet – ternstriben under stakken tog 40 min at forstå og 5 at rette.

## Status 2026-09-22 kl. 16.05 – BLADRING MELLEM MÅNEDER (roadmap trin 2, første udgave)

**Live:** https://harms-coder.github.io/life-tracker/ · **Galleri:** https://claude.ai/artifact/S914mdZ2Tq4gAuqWUrxLYb
Pushet (1670a14). IKKE SET AF LUKAS PÅ TELEFONEN ENDNU – første skridt: hans dom på bladringen (udseende, føling,
og om den hakker). Hans valg mellem finger og pile: begge er lavet, han kan skære den ene væk.

### Sådan virker det
- **Bladet er ægte geometri i `bog3d.ts`**: `slots.leaf` = højresidens mesh (24 rækker langs siden), spejlet i shaderen
  når det er venstresiden der vendes (`u_turn.x` = retning). Vinklen `u_turn.y` 0..π. Bladet er ikke en stiv plade:
  tangentvinklen vokser lineært fra hængslet ved ryggen til hængsel + `BEND` (0,65 rad, `?bend=`) ved forkanten, ganget
  med sin(vinkel), så det er fladt i begge ender. `twist` (u_turn.w) lader det hjørne fingeren holder føre an (pil = 0,6
  = nederste hjørne). Lukket form: r = (sin(θ+cu) − sin θ)/c, z = (cos θ − cos(θ+cu))/c.
- **For/bagside**: `gl_FrontFacing == (u_turn.x > 0)` = bagsiden (opslaget tegnes med uret på skærmen, så en side der
  ligger rigtigt er back-facing i GL; spejlet for den anden retning). Bagsiden samples `u_next` ved `v_buv` (spejlet om
  ryggen). Den side af opslaget bladet forlader viser allerede `u_next` (`u_turnSide`).
- **`u_next` (unit 4)** = oversigtstekstur af den anden måned, bestilt af workeren med `slot: "next"` når vendingen
  begynder (`beginTurn` → `renderOverview(otherScene(dir))`). Workeren holder billeder pr. sæt (`sets.current/next`).
  Ved landing: `commitTurn()` bytter over/next, smider detaljeteksturen (texRect langt væk) → den grove oversigt af den
  nye måned står i, til App's refresh har tegnet skarpt. `gen` i BookCanvas tæller op ved landing; svar fra workeren
  med gammelt `id` smides væk (ellers dukkede den gamle måned op et øjeblik).
- **Skygge**: bladets eget mesh lagt ned på siden under (samme SHADOW_DIR, `LEAF_SHADOW_LEN` 0,35 × SHADOW_LEN, mørke
  0,3; `?ls=` `?ld=`), tegnet efter siderne og før bladet.
- **Betjening** (BookCanvas): vippet (zoomet ud) tager en finger på bogen fat i et blad (`turnGrab`, via `unproject` =
  invers af shaderens projektion i højde 0). Første 10 px afgør: vandret = vend (venstre = frem), lodret = panorér.
  Forkanten følger fingerens vandrette bevægelse (acos). Slip: svirp > 0,3 px/ms afgør, ellers nærmeste side.
  `turn(dir)` (pilene, `.turn.prev/.next` i App) : er vippet væk (zoomet ind) animeres kameraet først til fit-visningen
  (420 ms), for et blad der rejser sig lige under kameraet ville gå igennem det (`u_persp*0.1`-clamp i shaderen som
  sikkerhedsnet). `busy()` = ingen fingre mens noget bevæger sig selv.
- **Måneder i App**: `Month {year, month}`, nøgler `values-/notes-/photos-<år>-<måned>` som før; kolonner er fælles.
  Startmåned = sidst åbne (`month` i localStorage) ellers dags dato. Demo-data sås KUN i 2026-9 (`DEMO_MONTH`).
  `otherScene(dir)` læser nabomåneden direkte fra localStorage; `onTurned(dir)` skifter alle fire states.
- Test: `node tools/turncheck.mjs screenshots/turn` (stillbilleder ved faste vinkler via `window.__turnTo(dir,p)` +
  rigtig vending via `__turn(dir)`), `node tools/dragturn.mjs` (simuleret finger: vend, lodret træk = pan, kort træk
  falder tilbage). Kun målt i headless Chrome – ydelsen på telefonen er ukendt (6 ekstra tegnepas pr. frame under
  vendingen, ellers intet).
- Lukas' dom (16.10): "lige som jeg gerne ville have det" – men bladet beholdt sin skygge og skiftede først ved landing.
  Årsag: rummets lys (v_luv, sprossernes skygger) blev slået op på bladets GAMLE plads (`op`). Nu følger det bladets
  faktiske fodaftryk (`xy`), så lyset glider over undervejs. Rettet og pushet – IKKE bekræftet af Lukas endnu.
- Lukas (16.15): pilen må IKKE zoome ud – man bliver hvor man er. Zoom-ud-animationen er slettet; i stedet får
  kameraet en større afstand pr. frame (`persp` i draw(): max(700·dpr, (1−a)·2,2·PAGE_W·s·dpr)) – fladt ligger hele
  bogen i højde 0, så afstanden ændrer intet andet end bladet, der så højst bliver 2× stort. Vippet er den som før.
- Lukas: hvidt glimt ned gennem ryggen ved højre pil, halvt zoomet ind. Årsag: siden under bladet viste `u_next`
  FØR den var nået frem → rent papir uden ryggens skygge. Nu: siden beholder sin tegning til u_next er oppe, og
  pilen venter på u_next (`awaitNext`, højst 600 ms) før bladet går. Bladets bagside er rent papir indtil da.
- Lukas (16.20): teksten "glimter og hopper" ved landing (overskrifterne nederst til højre, venstresiden). Årsag:
  efter landing står oversigten (1,3 px/verdens-px) i, til detaljen (skærmopløsning) er tegnet; de to er tegnet i
  forskellig opløsning, og skiftet på ét frame = hop. Nu: `u_mix` i shaderen – detaljen tones ind over oversigten
  på 220 ms (`detailMix`/`fadeFrom` i bog3d.ts, `pending()` holder paint-løkken kørende imens). UBEKRÆFTET.
- Lukas (16.30): blinkede STADIG – "al teksten på siden blinker væk og kommer tilbage på et splitsekund". Årsag:
  oversigten (1,3 px/verdens-px) vises på telefonen formindsket ~1,7× UDEN mipmaps (2×2-filter), så tynde
  blækstreger næsten forsvinder i de ~150 ms den står i. Nu tegnes oversigten i 2048×1024 (potens af to, `OVERVIEW_W/H`,
  `plane.ky` = lodret opløsning for sig) og `putWhole` laver mipmaps + LINEAR_MIPMAP_LINEAR. Hukommelse: 8 MB + 2,7
  pr. stk. (over + next) ≈ som før. UBEKRÆFTET af Lukas. Headless Chrome viste aldrig blinket – kun telefonen.
- Lukas (16.35): blinker STADIG, og "lige idet jeg trykker på pilen". DET var den: ved tryk hentes u_next; når den
  er oppe viser siden under bladet allerede næste måned, men bladet blev først tegnet ved p > 0 – så i frames mellem
  svar og første bevægelse så man den tomme side UDEN blad. Nu tegnes bladet fra p = 0 (`turn.p < 1`). Mipmaps og
  fade (ovenfor) er bevaret – de gør skiftet ved landing blødere – men var ikke årsagen.
- KANTEN (Lukas 16.40, to billeder): (1) en stribe PAPIR MED TERN under papirstakken langs bogens nederste kant.
  Det var omslagspladen: den bærer samme flade tegning som siderne, så den lille sliver af plade mellem stakkens
  fod og læderet viste sidens tern. Nu: `u_cover` i omslagspasset → under siderne er pladen mørk (læderfarve),
  så en sliver læses som skygge under sideblokken. (2) Zoomet halvt ind i nederste venstre hjørne: en hvid
  lodret "vinge" + en sort kile. Vingen = forkantens skørt rullede kun ud i x, bundskørtet kun i y → de mødtes ikke i
  hjørnet. Nu ruller forkantens ender også i y, og sidste stykke af de lange skørter i x (`buildEdges`). Kilen =
  `buildRim` var bygget på BOOK-hjørnerne (30 px inde i pladen), så dens sideflade stak op som en mørk kile i
  hjørnet; nu bygges den på LIP-kassen = pladens egen kant. `?skip=cover,rim,edges,pages` udelader tegnepas
  (fejlsøgning). `node tools/edgecheck.mjs <mappe>` = fit-visning + hjørne ved s=0,28/0,31. UBEKRÆFTET af Lukas.
- Lukas (17.00): en tynd lys lodret streg på omslagets kant over/under højresiden, KUN mens et blad vender,
  kun på telefonen (aldrig i Chrome). Diagnose: teksturopslag (texture2D) inde i per-fragment-grene → udefinerede
  afledte → Apple-GPU'en vælger forkert mipmap-niveau langs grenens kant → 1-px streg. Nu læses ALLE teksturer
  (u_img, u_over, u_next) ubetinget øverst i fragment-shaderen, og grenene vælger kun mellem resultaterne.
  REGEL: aldrig texture2D inde i en if der afhænger af fragmentet. UBEKRÆFTET af Lukas.
- Lukas (17.10): "man bladrer for nemt med fingeren" – halvt zoomet ind kunne bogen slet ikke panoreres. Nu
  tager fingeren kun et blad når s ≤ fit·GRAB_ZOOM (1,08 = hele opslaget synligt) OG fingeren lander på den
  yderste halvdel af en side (GRAB_OUTER 0,5 fra ryggen). Alt andet panorerer. Pilene virker altid.
- Kendt: zoomet langt ind ses bladets skygge som 5 trin (SHADOW_PASSES) på siden under.
- Åbent: stadig localStorage (IndexedDB er ikke lavet). Ingen stak af sider der bliver tyndere/tykkere med måneden.

## Status 2026-09-22 kl. 16.25 (tidligere samme dag) – SESSIONEN LUKKET NED, ALT ER PUSHET

**Live:** https://harms-coder.github.io/life-tracker/ · **Galleri:** https://claude.ai/artifact/S914mdZ2Tq4gAuqWUrxLYb
Arbejdstræet er rent, alt er på `main`. Lukas' sidste ord i dag: "okay, det ser godt ud."

### Det her blev lavet den 22/9 (nyeste først)
1. Ingen streg under "Sådan kommer jeg i mål" (den under "Mål denne måned" bliver).
2. Venstresidens store felt: de seks mål igen i stor udgave, tre i hver spalte, med planen under hvert.
   Billeder kan sættes ind fire steder (tre forneden på venstresiden, ét i hjørnet øverst til højre).
3. Søvnkurven: hele tal, og prikken kan trækkes (kun med fingeren PÅ prikken, langsomt og til siden).
4. To håndskrifter at vælge mellem: Lukas' og Louises. Blyantsknappen nederst til venstre.
5. Bogens kant zoomet ind: læder helt ud i kanten, hele hjørner, papirstakken folder sig væk når bogen er flad.
6. Bordet: den skarpe træflade spejles ud over hele planet, så der ikke er nogen sløret kant at se.

### FØRSTE SKRIDT NÆSTE GANG
- **Bed om Lukas' dom på telefonen** på venstresiden og billederne (han har kun set dem i galleriet).
- **Ubesvaret spørgsmål:** billedpladsen i hjørnet øverst til højre på HØJREsiden (b4) er et GÆT på, hvad han
  mente med "felterne oppe i højre hjørne". Spørg, om den ligger rigtigt.
- **Ubekræftet:** hakkeriet ved hurtig panorering. Min rettelse (prikken kan ikke længere hives i ved et uheld
  + oversigten tegnes med 250 ms forsinkelse) er IKKE bekræftet. Bed om `?maal`-tallene, hvis det stadig hakker.
- Derefter: roadmap trin 2 (flere måneder, sidevending, IndexedDB).

### TRE TING JEG LÆRTE I DAG – LÆS DEM FØR DU RETTER NOGET VISUELT
1. **"Det ligger på linjen" betyder LØFT eller FJERN, ikke FLYT.** Jeg flyttede kolonneoverskrifterne tre gange
   og ramte forkert hver gang. Til sidst hentede jeg koden fra git og satte den tilbage ord for ord.
2. **Når han siger "det var ikke det, jeg mente": rul HELT tilbage fra git, lad være med at finjustere videre.**
   At blive ved med at rette på noget forkert gør det bare mere forkert (hans egne ord).
3. **Lav varianter bag `?knap=N` og lad ham pege**, når det er et niveau eller en form. Det står i ARBEJDSFORM
   længere nede, og jeg sprang det over to gange og betalte for det begge gange.

## Status 2026-09-22 kl. 16.10 – VENSTRESIDENS STORE FELT + BILLEDER

- **Det store felt** (mellem overskriftslinjen og den aflange kasse forneden) har nu de seks mål igen, tre i
  hver spalte, med samme håndtegnede firkant om nummeret, bare større – og under hvert mål en kasse til HVORDAN
  man kommer i mål. Nye notatfelter `plan0..plan5`. Målets tekst deles med listen foroven (samme `goalN`), så
  den kun skrives ét sted. Geometri: `PLAN_Y`, `PLAN_ROW_H`, `planBoxes(i)` i layout.ts.
- Overskrift i den tomme kasse under måneden: `PLAN_LABEL` = "Sådan kommer jeg i mål".
- **BILLEDER** (nyt): `photoBoxes(days)` = tre langs bunden af venstresiden (b1–b3), `photoBoxRight(columns)` =
  ét i det tomme hjørne øverst til højre på højresiden (b4 – GÆT på hvad Lukas mente, spørg).
  Tom plads = svag håndtegnet ramme + "+"; tryk åbner telefonens billedvælger, tryk på et billede giver
  "Vælg et andet"/"Fjern". Billedet skaleres til 1000 px og gemmes som JPEG-data-URL i localStorage
  (`photos-<år>-<måned>`), ~56 kB pr. stk. Et telefonfoto på 4 MB ville sprænge kvoten.
  VIGTIGT: billederne sendes til workeren ÉN gang (`photos` i RenderRequest, kun på første tegning efter en
  ændring); workeren afkoder til ImageBitmap og beholder dem. Send dem ALDRIG med hver frame – det ville kopiere
  en halv megabyte pr. knib.
- Demo-planer flettes ind én gang (`demo-plans-seeded`) UDEN at røre noget, der allerede er skrevet.
- Kendt: `É` mangler i begge håndskrifter (blev til ingenting i demoteksten – rettet til `E`).

## Status 2026-09-22 kl. 15.45 – OVERSKRIFTERNE HELT TILBAGE; TRÆK KRÆVER MERE

- **RØR IKKE KOLONNEOVERSKRIFTERNES PLACERING.** Tre forsøg i træk var forkerte (midt i feltet, så løftet 10 px).
  Blokken i `drawRightPage` er nu ordret den fra 645e751 og skal blive der, medmindre Lukas selv beder om andet.
  Månedsoverskriften (31 px på linjen ved 3 tern) er IKKE rullet tilbage – den bad han selv om.
- **Træk i søvnkurven kræver nu tre ting**, fordi et almindeligt swipe hen over siden hev i prikkerne:
  1) cellen skal HAVE en prik, og fingeren skal lande inden for `DOT_REACH` = 12 verdens-px af den (App.tsx),
  2) fingeren skal flytte sig `SCRUB_SLOP` = 10 px, før det afgøres hvad den vil (bogen står stille indtil da),
  3) og den skal have været LANGSOM (< `SCRUB_SPEED` 0,35 px/ms i snit siden nedslaget) og mest vandret.
  Ellers går HELE bevægelsen til panorering, også de første 10 px. Målt i Chrome: langsomt til siden 8→5 med
  bogen i ro; hurtigt hen over 8→8 og bogen panorerede 105 px; langsomt op/ned 8→8 og bogen panorerede.
- `refresh()` tegner nu kun det synlige straks; oversigten over hele opslaget venter 250 ms. Før tegnede hvert
  eneste træk-trin hele opslaget om. MULIG årsag til hakkeriet Lukas mærkede – UBEKRÆFTET, spørg ham.
- HAKKERI VED HURTIG PANORERING (åbent): min hypotese er, at det VAR de utilsigtede træk i prikkerne (hver af
  dem = setValues → refresh → hele opslaget tegnet om midt i en panorering). Kan ikke måles herfra: headless
  Chrome har intet grafikkort. Bed Lukas om `?maal`-tallene, hvis det stadig hakker.

## Status 2026-09-22 kl. 15.20 – OVERSKRIFTER TILBAGE + SØVNKURVEN

- **Overskrifterne blev sat tilbage.** At centrere dem i feltet var en FEJL: Lukas ville have dem præcis hvor
  de stod, bare løftet fri af linjen. `LIFT = 10` i drawRightPage er hele ændringen; `fit()`-nedskaleringen er
  også væk igen. LÆRE (anden gang i dag): "det skal ikke ligge på linjen" betyder LØFT, ikke FLYT.
- **Søvnkurven: hele tal.** `dotValue()` i App.tsx runder til 0..10 uden halve; bruges af både tryk og træk.
- **Prikken kan trækkes.** `BookCanvas` har fået `grab(wx, wy)`: ved fingerens nedslag (kun når vippet er væk)
  spørger den App, om noget på siden vil følge fingeren. Svarer App ja, går træk-bevægelsen til den handler i
  stedet for at panorere, dagen ligger fast fra nedslaget, og en anden finger (knib) slipper det. Der skrives
  kun når tallet faktisk skifter → én omtegning pr. trin, ikke pr. frame. Samme krog kan bruges til andet, der
  skal kunne trækkes senere.
  Målt i Chrome: 40 verdens-px træk flyttede dag 5 fra 3 til 7, og bogen stod stille (0, 0 px).

## Status 2026-09-22 kl. 15.00 – TO HÅNDSKRIFTER

Louises tre ark laa som PDF på Lukas' skrivebord ("Louise haandskrift 1/2/3.pdf"); konverteret med
`pdftoppm -jpeg -r 200` og lagt i `haandskrift/louise/` (i git). 86 tegn, 428 varianter – hun har også `&`.
- `tools/glyffer.py` tager nu `--fotos DIR --ud FIL --krads N`. **KRADS** = hvor fyldt en boks skal være, før
  den tæller som overstreget, og den AFHÆNGER AF PENNEN: tynd pen = rigtigt bogstav 0,37 / overstreget 0,54
  (Lukas), tyk pen = almindeligt "0" 0,59 / overstreget 0,66–0,68 (Louise). Med standardværdien 0,45 faldt
  Louises 0, 8, s, æ og B helt ud. Lukas' sæt bygger bit for bit ens med standardværdien (tjekket).
  Louise: `python3 tools/glyffer.py --fotos haandskrift/louise --ud src/glyffer-louise.json --krads 0.62`
- `glyf.ts` holder begge sæt (`HANDS`, `setHand`); valget ligger i `Scene.hand`, så WORKEREN følger med uden
  ekstra beskeder. App.tsx gemmer det i localStorage under `hand`.
- Valgknappen: en lille blyant nederst til VENSTRE (uden for bogen, modsat build-mærket). Lukas har ikke sagt
  hvor han vil have den – gæt, to linjer at flytte.

## Status 2026-09-22 kl. 14.45 – RUNDE 3: TILBAGERULNING + TEKST

- **Runde 2 var ikke det, Lukas mente.** Sidestakkens farve (STACK_LIT) og den mørke fold (FOLD_DARK/FOLD_FLAT,
  v_shade-bunden) er RULLET HELT TILBAGE. Den spejlede skarpe bordplade BLIVER – den var den eneste af de tre,
  han ville beholde. LÆRE: da han sagde "underlig hvid kant" og "man kan se igennem folden", var min diagnose
  rigtig nok teknisk, men rettelsen ramte forkert. SPØRG næste gang, eller lav varianter bag `?knap=N` og lad
  ham pege – det står allerede i ARBEJDSFORM længere nede, og jeg sprang det over.
- Kolonneoverskrifterne stod i bunden af overskriftsfeltet ("skrevet på linjen"); nu midt i feltet
  (`mid = CELL + HEADER_H/2` i drawRightPage). Prikgrafens 0–10-skala bliver nede ved sin egen linje.
  For lange navne skaleres ned med `fit()`, så de bliver i feltet.
- "September 2026": 38 px med grundlinje 56 lagde tallenes top hen over gitterlinjen ved 40. Nu 31 px på linjen
  ved 3 tern.
- **VENTER PÅ LUKAS: nye håndskriftsark.** Han har udfyldt ét sæt mere og vil kunne VÆLGE mellem to alfabeter.
  Fotos skal i `haandskrift/fotos/` (samme skabelon, samme 3 sider). Pipeline i dag: `python3 tools/glyffer.py`
  → `src/glyffer.json` (ét sæt). Til to sæt: glyffer.py skal kunne skrive til et andet navn, glyf.ts holde to
  sæt, og der skal være et sted at vælge i appen.

## Status 2026-09-22 kl. 14.30 – KANT, FOLD OG BORD (runde 2 samme dag)

Lukas' næste tre ting. Rettet, pushet, IKKE set af ham på telefonen endnu. Knapper: `?kant=N` `?fold=N`.
- **Den hvide kant om siderne** (zoomet ud, ude i hver side): papirstakkens snitflade blev tegnet i fuld
  papirfarve x 1,04 – altså LYSERE end siden. I `referencer/bog-maal.jpg` er den en varm gråbrun, tydeligt
  MØRKERE. `STACK_LIT` = 0,78 ganges på `u_flat` i edges-passet.
- **Folden var "gennemsigtig"**: nær ryggen rejser siden sig stejlt, og sidens gitter + sorte kolonnelinjer løb
  helt ned til omslaget, hvor øjet venter en mørk dal. `FOLD_DARK` 0,3 → 0,85 og v_shade-bunden 0,6 → 0,08.
  VIGTIGT: den stærke udgave gælder kun vippet (`FOLD_FLAT` = 0,3 fladt) – fladt er der ingen dal, og en sort
  stribe ned gennem opslaget ville være forkert.
- **Sløringen i kanterne zoomet ind**: `bord.webp` har en blød alfa-kant på 13 % af hver side (tools/bordplade.py),
  og zoomet ind var netop den kant alt, man så i skærmens rand – skarpt træ der toner ud i flad brun. Nu tegnes
  billedet på HELE den polstrede flade (TABLE ± TABLE_PAD), og kun dets skarpe midte samples, spejlet ud over
  planet (`TABLE_EDGE` = 0,15, spejling i fragmentshaderen). Spejling samler sig sømløst, så træet bare
  fortsætter uendeligt og skarpt. Panoreringsgrænsen er IKKE ændret – der er bare ikke noget grimt at se mere.
- Målt: før/efter zoom-trin er ellers identiske (jeg tjekkede, at de to første ting IKKE kom af formiddagens
  kant-rettelse – de har været der hele tiden).

## Status 2026-09-22 kl. 14.00 – BOGENS KANT ZOOMET IND

Lukas zoomede ind og så tre ting: striber i den sorte kant, hjørner der ikke var dækket (bordet skinnede
igennem i en trappe), og en lys/hvid kant om siderne, der ikke kunne fjernes. Alle tre lå i den 30 px brede
kant (`LIP`, nu i `layout.ts`), hvor omslaget står ud forbi bogen:
- Kanten blev ALDRIG tegnet – `draw.ts` stoppede ved BOOK_W x BOOK_H – så shaderen faldt tilbage på
  oversigtsteksturen, hvis yderste pixelrække CLAMP_TO_EDGE smurte ud over de 30 px (striberne), og i hjørnet
  var den smurte pixel gennemsigtig (hullet). REGEL: alt der tegner eller måler opslaget arbejder i
  LIP-kassen (`COVER_BOX` i draw.ts), ikke i BOOK_W x BOOK_H – det gælder baggrunds-cachen, detaljeudsnittet
  (`render()` i BookCanvas) og oversigten (`renderOverview`, som `v_ouv` mapper på).
- Den hvide kant var papirstakkens skørt (`buildEdges`), som stod OVERHANG = 20 px ud fra sidens kant OGSÅ når
  bogen lå helt fladt. Stakken kan kun ses, fordi bogen er vippet, så den foldes nu væk med vippet: positionen
  er sidens egen kant, udrulningen ligger i et nyt attribut `a_off` og ganges med `u_out` (= samme faktor `f`
  som alle højder bruger, sat i `shape()`).
- `node tools/kantcheck.mjs <mappe>` zoomer helt ind og fotograferer de fire hjørner + kanterne. Galleri med
  før/efter: https://claude.ai/artifact/S914mdZ2Tq4gAuqWUrxLYb
- IKKE SET AF LUKAS PÅ TELEFONEN ENDNU. Tilbage af hans klage: bordpladen er stadig sløret zoomet helt ind
  (kendt grænse, bord.webp er 4k over 1900 verdens-px ≈ 1,6 px pr. verdens-px; max zoom 7x ville kræve ~13000 px).
  Knap: MAX_OVER_FIT (nu 7) ned, eller en skarpere/større bordplade.

## Status 2026-09-18 kl. 00.05 – ROADMAP 1b FÆRDIG OG GODKENDT

**Live:** https://harms-coder.github.io/life-tracker/ — alt pushet. Lukas' dom: "det fungerer godt, 1b er færdigt, godt arbejde".
Zoom og panorering er glatte på hans iPhone (frame 1–2 ms på hovedtråden, rundtur ~150 ms i workeren), bogen holder sig
hel ved hurtig panorering og hurtigt zoom ud, Safari går ikke ned.

**NÆSTE SESSION: roadmap trin 2** – flere måneder, sidevending mellem dem, rigtig datamodel (IndexedDB). Buefunktionen i
`bog3d.ts` er bygget, så en sidevending kan genbruge den. Bisect-/måleknapperne (`?maal ?strip ?aa ?bord ?skygge ?lys`)
står stadig i koden; de kan blive.

### Sådan hænger tegningen sammen nu (efter 1b)
1. `src/draw.worker.ts` (Web Worker) tegner opslaget med `drawScene` (draw.ts) i et OffscreenCanvas og sender rå RGBA
   tilbage. To slags jobs: detalje (det synlige udsnit + 20 % margen, PIXEL_BUDGET 6e6, grow-only canvas) og oversigt
   (hele opslaget, 2,5e6, eget canvas, uden halvskrevet X).
2. `BookCanvas.tsx`: ét detaljejob ad gangen (`inflight`/`queued`); bestilles ved slip, midt i pinch (ratio > 1,5 eller
   < 1/1,5 eller vippet), og under panorering/glid når man er kørt ud over det tegnede (`renderIfOff`). Oversigten
   bestilles ved start og ved `refresh()` (App: når data ændrer sig). `committed`/`plane` flyttes først når teksturen er
   OPPE (done-callback). `?maal` viser "frame X ms (N skiver) · rundtur Y ms · værst" – X er det, der skal være lille.
3. `bog3d.ts`: `setTexture` lægger pixels op i skiver à STRIP_BYTES (4 MB, `?strip=MB`), én pr. `draw()`, i en bagtekstur
   og bytter front/back når alt er oppe. `setOverview` lægger oversigten op i ét hug (unit 3). Shaderen: uden for u_tex
   eller hvor detaljen er gennemsigtig → oversigten → ellers papir (sider) / discard (omslag).
4. Caveat-fonten er helt ude af tegningen (kun CSS til bundfladerne). Ukendte tegn (fx `&`) bliver mellemrum.
- Hukommelse på iPhone nu: worker-canvas ~25 MB + oversigts-canvas 10 MB + 2 sideteksturer à 25 MB + oversigt 10 MB
  + bord.webp 51 MB + aften.jpg 15 MB. Holder (Lukas 17/9–18/9).
- MÅLING: rigtig Chrome via chrome-devtools-MCP, fanen i FORGRUNDEN (i baggrunden drosles rAF → rundtur ser ud som 1 s).
  Headless Playwright har ingen GPU: rundtur ~1 s der er normalt og siger intet. `node tools/pinchout.mjs screenshots`
  = zoom ind → pinch ud → billeder mid/slip.

## Status 2026-09-17 kl. 23.15 – ROADMAP 1b LAVET (historik, detaljer fra dagens runder)

**Tegningen af opslaget kører nu i en Web Worker** (`src/draw.worker.ts`): BookCanvas sender view/plane/scene til
workeren, som tegner med `drawScene` (draw.ts) i sit eget OffscreenCanvas og sender en ImageBitmap tilbage; den går
direkte i WebGL-teksturen (`setTexture(ImageBitmap)`). Hovedtråden gør kun gestus + 3D-passet. Ét job ad gangen: bedes
der om en omtegning, mens én er ude, tegnes den én gang mere når svaret kommer (`queued`). `committed`/`plane` flyttes
først NÅR svaret kommer, så meshet aldrig viser en gammel tekstur i en ny rect.
- Caveat-fonten er HELT ude af tegningen (den blev kun brugt til ét `measureText` til understregningen; nu måles med
  glyf-bredden `widthOfText`, samme seed = samme bredde). Tegn, der mangler i glyfferne (fx `&`), bliver et mellemrum –
  det gjorde de også før (drawText springer ukendte tegn over; "Caveat-fallback" i ældre noter var forkert).
- Papir/læder-teksturerne hentes af workeren selv (fetch → ImageBitmap); den venter på dem før første tegning, så
  baggrunds-cachen bygges én gang.
- `?maal` viser nu: `tråd` = ms på hovedtråden pr. omtegning (upload + paint), `rundtur` = fra bestilling til svar.
  Chrome på Mac: tråd 0 ms, rundtur 5–12 ms. Bed Lukas læse "værst a/b" op: a = tråd (skal være lille), b = rundtur.
- Krav: OffscreenCanvas 2D i worker = iOS ≥ 16.4. Ingen fallback til hovedtråden (bevidst; laves kun hvis telefonen
  fejler). `.book-source`-canvasset er væk fra DOM'en.
- Hukommelse: `transferToImageBitmap` giver workeren et frisk buffer pr. omtegning (24 MB zoomet ind) + bitmap i
  transit (lukkes med `close()` straks efter upload). Går iPhone ned igen: PIXEL_BUDGET ned (6e6 → 4e6).
- LUKAS' FØRSTE MÅLING (iPhone Pro Max, 23.09): "fuld tråd 47 ms · rundtur 109 ms · værst 53/120 ms · 1925×3295". Dvs.
  tegningen i workeren tager ~60 ms, men UPLOADEN af bitmappet til WebGL koster stadig 47 ms på hovedtråden. Det er
  nu den post, der skal ned. Knapper: `?pm=0` (upload uden premultiply-konvertering – mål), PIXEL_BUDGET 6e6 → 4e6
  (33 % færre pixels), eller uploade i striber over flere frames til en bagtekstur (ping-pong, +24 MB) – bygges kun
  hvis de billige knapper ikke rækker.
- FEJL RETTET (dbf62dc): efter zoom ind og pinch UD dækkede teksturen kun det gamle udsnit; shaderen kasserer pages
  uden for u_tex, så bordet sås gennem venstresiden (Lukas' skærmbillede). Nu tegnes der også om midt i pinchen,
  når ratio < 1/LIVE_RATIO. Worker-fejl svares tilbage som `{error}` (ellers låste `inflight` al omtegning).
- `?pm=0` HJALP IKKE (Lukas). Og: zoomet ind hakker det meget ved HURTIG panorering, ikke ved langsom – det er glidets
  omtegninger (hver 47 ms upload) når fingeren løber ud over det tegnede.
- UPLOAD I SKIVER (næste commit): workeren sender rå RGBA (`getImageData`, transferable) i stedet for ImageBitmap;
  `setTexture` i bog3d.ts lægger dem op i skiver à `STRIP_BYTES` (4 MB, `?strip=MB`) – én skive pr. `draw()` – i en
  BAGTEKSTUR (front/back, +25 MB) og bytter først, når alt er oppe; `done`-callback flytter committed/plane og
  frigiver `inflight`. BookCanvas holder rAF kørende, mens `pending()` er sand. `?maal` viser nu "frame X ms (N skiver)"
  = dyreste frame under uploaden – det er DET tal, der skal være lille (< 16). Chrome/Mac: 1 ms. OBS: i en
  baggrundsfane drosles rAF, så rundturen ser ud som 1000 ms – mål altid med fanen i forgrunden.
- LUKAS' MÅLING efter skiverne (23.39): "fuld frame 1 ms (7 skiver) · rundtur 150 ms · værst 2/216 ms · 1998×3295",
  Safari går ikke ned. Hovedtråden er altså fri. Men bogen "forsvandt" stadig ved hurtig panorering: med fingeren
  nede blev der ALDRIG tegnet om (kun i glidet og ved slip), så man kørte ud over det tegnede (skærm + 20 % margen),
  og shaderen kasserede siden. Rettet: `renderIfOff()` kaldes også i onPointerMove (én ad gangen, køen tager resten),
  og uden for teksturen viser en side nu blankt papir (u_paper) i stedet for at blive kasseret – kun omslaget kasseres.
- LUKAS (23.50): "føles rigtig godt nu, glat, bogen holder sig hel". Tilbage: ved HURTIGT zoom ud var siden blank
  (papir-fallbacken) i de ~150 ms, til tegningen var tilbage.
- OVERSIGTSTEKSTUR (næste commit): workeren tegner hele opslaget groft (OVERVIEW_BUDGET 2,5e6 ≈ 1,3 px/verdens-px,
  10 MB, eget canvas, `overview: true`, uden halvskrevet X) ved start og ved `refresh()` (App: når values/columns/
  notes ændrer sig – ikke pr. animationsframe). `setOverview` lægger den op i ét hug på unit 3. Shaderen: uden for
  u_tex, eller hvor detaljeteksturen er gennemsigtig, samples `u_over` (v_ouv = pos / bogens størrelse) – papir kun
  hvis heller ikke den har noget. Så er bogen aldrig blank, kun grov et øjeblik. Omslaget uden for u_tex vises nu også.
- FØRSTE SKRIDT NÆSTE GANG: Lukas' dom på hurtigt zoom ud. Hvis alt er godt: roadmap trin 2 (måneder, sidevending,
  datamodel). Overvej at fjerne ?maal/?strip/?aa/?bord/?skygge/?lys-knapperne eller lade dem stå.

## Status 2026-09-17 kl. 23.00 – HER ER VI

**Live:** https://harms-coder.github.io/life-tracker/ — alt pushet (c1f3ac1). Galleri: https://claude.ai/artifact/S914mdZ2Tq4gAuqWUrxLYb.
Lukas' dom på det hele, sidst på aftenen: **"det virker helt perfekt nu"** – farver, skygge, lys, omslagskant er godkendt,
nedbruddet på iPhone er væk (bordpladen i WebGL var løsningen), og glatheden er "bedre, ikke perfekt" (værst ~93 ms ved slip
zoomet ind).

**NÆSTE SESSION STARTER MED ROADMAP 1b** (Lukas' beslutning): fuldstændig glat zoom – flyt 2D-tegningen (draw.ts) til en
Worker med OffscreenCanvas, så hovedtråden kun gør gestus + WebGL. Detaljer under "PLAN" nedenfor. Mål først på telefonen
med `?maal` før og efter. Test på iPhone tidligt (OffscreenCanvas 2D kræver iOS ≥ 16.4; Caveat-fallback via FontFace i
workeren skal verificeres).

### Lavet 17/9 aften (alt i `src/bog3d.ts`, knapperne står øverst i filen)
- **Skyggen** tegnes af bogen selv: samme mesh lagt ned på bordet langs `SHADOW_DIR` (-0,3, 1 = solen bagfra, lidt til
  højre, målt på sprossernes skygger i fotoet), 5 stencil-pas af voksende længde = blød kant. `SHADOW_LEN` 2,5 (Lukas'
  valg), `?sh=N` til at prøve andre. Beholder `SHADOW_MIN` = 40 % højde zoomet ind, så der er en stribe under nederste
  kant. DOM-ellipserne og `.tilt`-laget er slettet. FALDGRUBE: omslagspladen (`buildCover`, LIP=30 bredere end bogen)
  må IKKE med i skyggepasset – malet mørk blev den en ramme rundt om hele den flade bog.
- **Omslagskant** (`buildRim`): sort skørt fra omslaget ned til bordet, COVER_T = 12 (3 mm).
- **Rummets lys over bogen** (`setLight`): fotoets (aften.jpg) pixels over bogens fodaftryk, krympet i halveringstrin
  til `LIGHT_RES` = 10 texels bredt (= udjævning; finere → træårer på papiret), normeret pr. kanal, ganget på i shaderen.
  Sprossernes skygger fortsætter hen over papiret. Toner ud med vippet (den flade bordplade har ingen striber).
- **Farver** (`TONE` = 0,97/0,86/0,74, `?tone=r,g,b`): målt efter fotoets hvide bøger (130,105,85 i skygge) og koppen.
  Papir i skygge ≈ (181,147,115), i sol ≈ (239,221,178). `tint()` i draw.ts er slettet – al tone ligger i shaderen.
- Papirstakkens kant: mod vinduet lys (1,1), mod betragteren i skygge (0,9).

### Ydelse (17/9 sent) – SÅDAN MÅLES DET
- Playwright-Chromium (headless) og WebKit har INTET grafikkort: deres tal for canvas-tegning/upload lyver. Mål i rigtig
  Chrome via chrome-devtools-MCP'en (emulate 390x844x3, rullehjul på .viewport, TIMING-log i render) – samme
  Apple-GPU-arkitektur som iPhonen. `tools/timing.mjs` er headless-udgaven (kun til relative sammenligninger).
- Fundet: "upload"-tiden i texImage2D var i virkeligheden 2D-canvassets udsatte rasterisering af papir/omslag
  (mønster + 5 gradienter pr. side = 50–120 ms pr. omtegning). Løst med `drawBackground` i draw.ts: alt dødt tegnes én
  gang i en cache (CACHE_K 1,5) og blittes; gitter (multiply, så foldens skygge stadig virker) og blæk tegnes live.
  Fuld omtegning zoomet ind: 123 → 6 ms. Cachen bygges to gange (før/efter teksturerne er hentet), ~100 ms hver.
- `?maal` bag adressen viser tegnetider i hjørnet på telefonen – bed Lukas læse "værst"-tallet op.
- Sort bog på iPhone (løst): lyskortet blev tomt, fordi telefonen tegnede intet af det store foto lige efter onload →
  `decode()` først, tomt kort = lys fra + nyt forsøg. `?lys=0` slår lyset fra til fejlsøgning.

- HUKOMMELSE (17/9 sent): Lukas fik "Der var gentagne problemer" (Safari lukker siden) ved hurtig zoom helt ind/ud.
  Rettet: PIXEL_BUDGET 9e6 → 6e6, MARGIN 0,35 → 0,2, kilde-canvasset må kun VOKSE (fitCanvas), GL-teksturen
  opdateres med texSubImage2D når størrelsen er den samme, CACHE_K 1,25. Gennemsigtige texels på en side = papir
  (u_paper), da canvasset nu er større end det tegnede. Største tilbageværende post: bord.webp 3089×4096 = 51 MB
  dekodet (+ aften.jpg 15 MB, WebGL-buffer m. MSAA+stencil ~60–70 MB). Næste knapper hvis det stadig går ned:
  antialias: false i getContext (sparer ~36 MB), bord.webp ned til 2048 bred (sparer ~30 MB, koster skarphed zoomet ind).
  `?maal`: "værst" tæller først efter 3 s (baggrunds-cachen bygges ~100 ms ved start – det var Lukas' 97 ms).

- NEDBRUD FORTSAT efter 6e6/grow-only (Lukas: "går stadig ned", værst 93 ms). OBS: `stencil: true` blev ALDRIG sat (den
  replace fejlede stille), så stencil-bufferen var ikke synderen; skyggen bruger nu EXT_blend_minmax (MAX) i stedet for
  stencil – ingen stencil-kode tilbage. `.book-source` er display:none (ingen ekstra kompositlag). Bisect-kontakter til
  Lukas' telefon: `?aa=0` (ingen MSAA, ~36–48 MB), `?bord=0` (ingen bord.webp, 51 MB), `?skygge=0` (ingen skyggepas),
  `?lys=0` (intet lyskort). Nyt siden den godkendte bog 16/9 aften: 6 tegnepas/frame, lyskort + ekstra dekodet aften.jpg
  (15 MB), baggrunds-cache (10 MB), grow-only canvas (24 MB permanent + 24 MB tekstur i stedet for at skrumpe zoomet ud).

- NEDBRUDDETS MØNSTER (Lukas, 17/9 sent): hurtig zoom er OK; det går ned ved LANGSOMT zoom, lige når bogen begynder at
  rejse sig – dvs. i det bånd hvor `.table-top` toner (opacity 0..1). Årsag (hypotese, rettet i f5066d3+1): opacity
  på en GRUPPE (div m. farveflade + img) tvinger Safari til et midlertidigt gruppe-billede i lagets skærmstørrelse
  (op mod 80 MB) – og igen for hvert frame zoomet flytter sig. Nu tones `.table-fill` og <img> hver for sig (ingen
  gruppe). Regel: SÆT ALDRIG opacity/filter på en container med flere børn i scenen – kun på blad-elementer.
  Bisect-kontakterne (`?aa=0` `?bord=0` `?skygge=0` `?lys=0`) er stadig i koden.

- BORDPLADEN I WEBGL (17/9 sent, efter at hverken lys=0 / aa=0 / element-vis opacity hjalp): den skarpe top-down-plade
  er IKKE længere et <img> i DOM'en. bord.webp lægges som GL-tekstur (unit 2, `setTable`) og tegnes som to flade,
  UVIPPEDE quads (`u_table` 1 = træfarve ud til TABLE_PAD, 2 = billedet) i starten af hver frame med `u_fade`
  (= min(1, (1-a)·1,6), sat i paint). Grund: et 51 MB billede under en skala, der ændrer sig hvert frame, fik Safari
  til at gentegne det igen og igen ved langsomt zoom. Skyggen er tilbage til additive pas (MAX-blanding ville
  forsvinde over bordet). `.table-top`/`.table-fill`-CSS er væk. FALDGRUBE: uniforms delt mellem vertex og fragment
  skal have SAMME præcision (fragment er mediump) – ellers linker programmet ikke, og bogen forsvinder tavst
  ("WebGL kunne ikke startes"). `tools/tablecheck.mjs`, `Q="?bord=0" node tools/steps.mjs screenshots/nobord`.

  BEKRÆFTET af Lukas (23.00): nedbruddet er væk med bordpladen i WebGL. REGEL for iPhone: ingen store billeder/lag i
  DOM'en under en skala, der ændrer sig pr. frame – tegn dem i WebGL. Fotolaget (.bg-layer) er det eneste tilbage i DOM.

### Åbent
- Roadmap 1b (glat zoom, Worker) – NÆSTE SESSION. Bisect-kontakterne `?aa=0 ?bord=0 ?skygge=0 ?lys=0 ?maal` kan blive. Hvis ja: Lukas' bisect-svar (hvilket link
  klarede sig bedst – han sagde noget der lød som "nummer to" = bord=0).
- PLAN (Lukas: "noget vi skal have klaret, bare ikke lige nu"): "fuldstændig glat" zoom. Værst 93 ms på telefonen =
  den fulde omtegning ved slip zoomet ind (2D-tegning + 24 MB upload på hovedtråden). Rigtig løsning: flyt draw.ts
  til en Worker med OffscreenCanvas (iOS ≥ 16.4), send ImageBitmap tilbage, texImage2D fra den. Kræver: glyf-paths
  og cache i workeren, Caveat-fallback via FontFace i workeren (tjek iOS), assets som ImageBitmap. Anslået 1–2 timer.
  Billigere delskridt: LIVE_RATIO 1,5 → 2,2 (færre omtegninger midt i pinch), PIXEL_BUDGET 6e6 → 4e6 (blødere skrift).
- Lukas' dom på runde 2+3: er skyggestriben på papiret for mørk? Passer farverne? (Han sagde før runde 3: "passer
  ikke i farverne til resten".)
- Ryggen: Lukas sagde ja til "lys/skygge i folden set fladt oppefra" – den gradient findes allerede (drawSpine +
  drawPage i draw.ts); intet ændret. Spørg hvad der konkret ser forkert ud.
- `&` mangler i LUKAS' håndskrift (Louises har det). Roadmap trin 2 (flere måneder, sidevending, IndexedDB). Andre tidspunkter er låst til
  aften (`ONLY` i Backdrop.tsx) – lyskortet er også hårdkodet til aften.jpg i BookCanvas.

## Status 2026-09-17 kl. 21.30 (historik)

**Live:** https://harms-coder.github.io/life-tracker/ — den nye bog med rigtig dybde er nu DEN ENESTE.
Lukas godkendte den, `?bog3d`-flaget og hele den gamle flade CSS-vip-vej er fjernet.
Alt er committet og pushet. Galleriet til Lukas: https://claude.ai/artifact/S914mdZ2Tq4gAuqWUrxLYb

### Hvad vi lavede i dag (17/9)
1. **Dybdelagene fra 16/9 er SLETTET.** Lukas: "ser ikke godt ud – hakker, planten er gennemsigtig". Vi er tilbage
   ved ét fladt foto i `scene2d` + bogen ovenpå. Byg dem IKKE igen; afsnittet under Beslutninger er historik.
2. **Nyt aftenfoto og skarpt bord**, begge lavet herfra med Higgsfield-connectoren.
3. **Lukas' egen håndskrift** i bogen: 424 glyffer skåret ud af hans tre fotograferede ark.
4. **Bogen har rigtig dybde**: buede, bølgende sider, fold og papirstak i WebGL uden three.js. Godkendt og låst.
5. **Den højre skyggestribe** på bordet er fjernet (der var intet til at kaste den).

### Åbent, i den rækkefølge det gav mening sidst
- **Bogens skygge på bordet** er stadig to DOM-ellipser i `.tilt`. Den vipper nu med bordet, men følger ikke buen
  og er ikke tunet efter den nye bog. Det er det mest iøjnefaldende, der mangler.
- **Omslaget** kunne have en synlig kant ned til bordet.
- `&` mangler i håndskriften (Lukas udfyldte den ikke). Falder tilbage til Caveat.
- Roadmap trin 2: flere måneder, sidevending, rigtig datamodel (IndexedDB). Buefunktionen i `bog3d.ts` er bygget,
  så en sidevending kan genbruge den.
- De andre tidspunkter (morgen/middag/nat) er stadig låst til aften via `ONLY` i Backdrop.tsx. Nye fotos skal
  matche det nye lys, og bordpladen (bord.webp) er lavet ud fra aftenfotoet.

### ARBEJDSFORM – læs den, det kostede runder at lære
- **Ret efter referencebilledet, ikke efter tal i Lukas' ord.** Mål i billedet.
- **Skal en form eller et niveau rammes: RENDER FLERE VARIANTER og lad ham pege.** Da jeg havde gættet forkert to
  gange i træk på buens ende, lavede jeg fire og lagde dem bag `?dip=N`. Det tog én runde i stedet for tre.
  Lukas sagde direkte: "du er nødt til at lytte noget mere... stil mig nogle spørgsmål, hvis det er uklart."
- **Overkorrigér ikke.** "Lidt mindre" betyder lidt mindre, ikke væk.
- Én runde = rettelse → Chrome-billede (390×844, dsf 3) → push → galleri → hans dom på telefonen.

## Status 2026-09-17 kl. 18.10 (historik – tallene nedenfor er overhalet, se øverst)
- DYBDELAGENE ER SLETTET (commit ea5402d). Lukas' dom: "ser ikke godt ud – hakker, planten er gennemsigtig". Vi er tilbage
  ved runde 5-arkitekturen: ét fladt foto i scene2d + bogen som ét canvas i vippet. DYBDELAG-afsnittet under Beslutninger
  er historik; byg det IKKE igen.
- NYT AFTENFOTO (2cd021d): lavet herfra med Higgsfield-connectoren. Opskrift: `media_import_url` på den LIVE jpg-adresse
  (widget-upload virker ikke i Claude Code) -> `generate_image_batch` med gpt_image_2_5, rolle `image_references`
  ("same scene, empty table, soft golden-hour light") -> `upscale_image` 4k -> baggrund-kilder/aften.png ->
  `npm run baggrund`. Fravalgte varianter: screenshots/bord-v2..4.jpg. Aften-VIDEOEN er taget af (orange lys).
- BOGENS STØRRELSE/PLACERING (d8c9f22): BG = {x:-570, y:-1922, w:2596, h:4615}; bogen fylder 68 % af skærmbredden.
  Lukas ved 81 %: "for stor i forhold til planten og kaffen". Knappen er BG.w/BG.h (større foto = mindre bog);
  BG.x/BG.y holder bogens centrum på 0,50/0,53 af fotoet.
- BORD SET LIGE OPPEFRA (d8c9f22) – løser to klager på én gang:
  Lukas: "når man zoomer ind bliver bogen løftet op og kommer op over toppen af bordet" (fotoets bord er set skråt og har
  en bagkant; når vippet forsvinder folder bogen sig ud og vokser op over den, så vinduet dukkede op bag bogen) og
  "bordpladen er sløret zoomet helt ind".
  Løsning: `public/baggrund/bord.webp` = SAMME bord genereret top-down i Higgsfield (reference = aftenfotoet), opskaleret
  til 4k, farvekorrigeret mod fotoets bord og med blød alpha-kant hele vejen rundt (`tools/bordplade.py`, kør den efter
  en ny plade i baggrund-kilder/bordplade.png). Ligger som <img> i `.table-top` i scene2d – FØR vippet, altså den
  elementtype der er sikker på iPhone. opacity = min(1, (1-tiltAmount)*1.6), sat i paint(). Bag billedet en flade i
  bordets farve (#b47f51, TABLE_PAD = 700), så en høj skærm aldrig ser forbi træet.
  TABLE (= billedets rektangel, også panoreringsgrænsen zoomet ind) = {x:-222, y:-742, w:1900, h:2533}, 3:4, centreret
  om bogen og høj nok til at dække skærmen når bogen ligger fladt.
  GRÆNSE, sagt ærligt til Lukas: 4k over 1900 verdens-px = ca. 1,6 px pr. verdens-px. Fuld skarphed ved max zoom (7x)
  ville kræve ~13000 px. Det er ~3x skarpere end før, ikke perfekt. Knap hvis det ikke rækker: MAX_OVER_FIT (nu 7).
  Billedet dekodes ved mount (ref med .decode()); uden det kostede første pinch ~200 ms.
- Målt efter ændringen: bench pinch 4/132 frames >33 ms (før 2), max 68 ms. tapcheck OK. Prisen for det ekstra store lag.
- IKKE SET AF LUKAS ENDNU (18.10). Første skridt: hans dom på telefonen + skærmbillede.
- `node tools/fit.mjs screenshots/fit.png` = ét Chrome-billede af startvisningen. `node tools/steps.mjs screenshots`
  = seks zoom-trin (bruges til at bedømme overgangen mellem foto og bordplade).
- Higgsfield: CLI installeret og logget ind, 8 skills i ~/.claude/skills, connectoren virker herfra.

## Status 2026-09-16 kl. 23.00 (FORÆLDET – dybdelagene er slettet 17/9)
- Dybdelag + fælles bordplan (TASK_scene_depth.md trin 1–3) VIRKER på Lukas' iPhone (bekræftet 22.50 med build 22.47).
  Han så to fejl i det build: tynde vandrette streger over bordet (Safaris sømme mellem striberne) og bordets forkant
  tegnet to gange (telefonen havde GAMLE bordplade-filer i cachen – samme filnavne, nyt indhold). Begge rettet i build
  22.54 (stribe-overlap + `?v=<build>` på lag-adresserne) – IKKE bekræftet af Lukas endnu. FØRSTE SKRIDT: bed om hans dom
  (start, pinch, panorering) på https://harms-coder.github.io/life-tracker/ – og et skærmbillede.
- iPHONE-LÆRE (kostede 5 runder): Safari på iPhone gik ned ("Der var gentagne problemer") med ALT andet end disse to
  elementtyper: kompositlag (canvas m. will-change) FØR `.tilt`, og bogens ene canvas INDE i `.gesture` (preserve-3d-kæden).
  Canvas/img/div-med-baggrund inde i `.worldflat` eller efter `.tilt` = nedbrud, uanset størrelse. Derfor tegnes bordplade,
  skygge, ben, pynt og stol nu ind i ÉT rum-canvas før vippet (`projectImage` i BookCanvas: stribe for stribe med samme
  projektion som CSS-vippet, `projector()` i camera.ts). Bordpladen kan ikke ligge i bogens canvas: den løftes BOOK_T (tykkelse).
  Playwright-WebKit på Mac viser IKKE disse nedbrud. Test kun på telefonen; ændr ikke DOM-strukturen uden at teste der.
- Kendt/åbent: mid-pinch følger rum-canvasset bogen (dybde 1) indtil næste omtegning (renderLive 120 ms) – stolen (1,35)
  hakker lidt. Bordpladen over bogen er sløret fladt (fotoet har få pixels der). Derefter: trin 4–5 (lys, skygge, fokus fra
  `light`/`focus` i scene.json), galleri-billeder er fra før ombygningen (kør scenecheck/zoomcheck + tools/gallery.py).
- Kør: `npm run scene` efter ændringer i lag/pad/anchor/kamera/nearEdge; `npm run scenecheck` + `npm run zoomcheck` før push.

## Status 2026-09-16 kl. 20.30 (ældre)
- Live: https://harms-coder.github.io/life-tracker/ · repo `Harms-coder/life-tracker` · alt er committet og pushet (d6bb0b7).
- Kør lokalt: `npm install` (én gang), `npm run dev` → http://localhost:5173/life-tracker/ (også fra telefonen på LAN-ip).
- Test (scripts starter selv dev-serveren; kør dem IKKE samtidig med bench): `npm run zoomcheck` (VIGTIGST: seks trin
  pinch på bogen fra start til max + panorering til bogens bund; bogen skal blive under fingrene og hele bogen kunne nås),
  `npm run views`, `npm run shots`, `npm run tapcheck` (tryk virker), `npm run bench` (frame-tider i WebKit),
  `npm run webkit` (KUN til video/fallback – Playwright-WebKit tegner CSS-3D fladt og kan ikke bruges til geometri).
  Geometri bedømmes i Chrome med `deviceScaleFactor: 3` (390×844) og på Lukas' telefon. Playwright-browsere: `npx playwright install`.
- Vis billeder til Lukas: `python3 tools/gallery.py '[["fil.png","Titel","Tekst"]]' "Indledning"` → `screenshots/galleri.html`,
  publiceres som Artifact på SAMME url hver gang: https://claude.ai/artifact/S914mdZ2Tq4gAuqWUrxLYb (Artifact-værktøjet:
  `read` den først i en ny session, derefter `publish` med `url`).
- FÆRDIGT I DAG (aften-scenen, 5 runder med Lukas' feedback):
  Rummet er Lukas' Higgsfield-foto + loop-video (aften), låst til aften (`ONLY` i Backdrop.tsx). Bogen ligger på fotoets
  bord, vipper om sit eget centrum (58°, perspective 700), løftet 2 cm med sideblok-forkant, sort cover-ramme, varm tone,
  buede sider, skygge fremad. Zoom virker "som før baggrunden": bogen bliver under fingrene, zoomet ind er det fotoets
  (slørede) bord, panorering kun over bordet i fotoet. Lukas godkendte placeringen ("ligger rigtigt nu") og zoomen
  ("fungerer lige som det skal") i runde 3; runde 4 gik for langt (4,5 cm tyk bog + tegnet bordplade) og blev rullet
  tilbage i runde 5. Runde 5 er IKKE set af Lukas endnu – første skridt i næste session: bed om hans dom på telefonen.
- ÅBENT / NÆSTE (i Lukas' rækkefølge):
  1) Lukas' feedback på runde 5 (tykkelse 2 cm, bogens centrum 0,64 af højden, cover-ramme). Mulige knapper: BOOK_T,
     BG.y (placering), BG.w (størrelse), TILT_MAX/PERSPECTIVE (vinkel), COVER, skyggen (`.shadow` i BookCanvas.tsx).
  2) De andre tidspunkter: sæt `ONLY = null` i Backdrop.tsx, når aften sidder. Nat har billede+video, middag kun
     billede (anden komposition – tjek at bogen ligger rigtigt, ellers pr.-tidspunkt BG), morgen mangler (→ aften).
     Nye råfiler i `baggrund-kilder/` → `npm run baggrund` (ffmpeg via Homebrew) → commit `public/baggrund/`.
  3) Higgsfield-connectoren er logget ind; værktøjerne dukker først op i en NY session (`claude mcp list` → Connected).
     Kan bruges til fx en bordplade set lige oppefra (skarpt bord zoomet ind) – men Lukas vil have FOTOETS bord, så spørg først.
  4) Trin 2: flere måneder + sidevending + rigtig datamodel (IndexedDB). 5) PWA-ikon. 6) Lukas' håndskrift som glyffer
     (byttes ind i `text()`/`handX()` i draw.ts).
- Kendt: skriften er en anelse blød UNDER en pinch (grov omtegning), skarp ved slip. Første pinch efter load kan hakke
  én gang (WebKit skalerer det store fotolag). Fotoet er sløret zoomet helt ind (8×) – accepteret af Lukas.
- Arbejdsform, der virkede: én runde = rettelse → Chrome-billede (3×, crop af bogen) → push → Lukas kigger på telefonen
  og svarer med skærmbilleder. Ret EFTER HANS REFERENCEBILLEDE, ikke efter tal i hans ord ("3–4× tykkere" betød "som på
  billedet"), og erstat ikke noget han har bedt om (fotoets bord) med en efterligning uden at spørge.

## Roadmap
1. ~~Prototype af ét opslag: bog på bord, ternede sider, pinch-zoom, afkrydsning med håndskrevne X-varianter.~~ ✅ 2026-09-16
~~1b. Fuldstændig glat zoom på iPhone: 2D-tegningen i en Worker, upload i skiver, oversigtstekstur.~~ ✅ 2026-09-18 (godkendt af Lukas)
2. Sidevending mellem måneder + datamodel (måneder, trackere, værdier) med lokal lagring. – bladring + måneder i localStorage lavet 2026-09-22 (ikke set af Lukas); IndexedDB mangler.
3. Venstre side (mål/undermål/plan) med tekst i håndskrift.
4. Lukas' egen håndskrift som glyffer.
5. Finpudsning: papirtekstur, skygger, animation af skrift.
