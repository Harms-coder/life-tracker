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

## Status 2026-09-17 kl. 19.40 (sådan fortsætter man)
- BOGEN MED RIGTIG DYBDE ligger på `?bog3d` (commit ea2687e). Opgaven var `TASK_bog_3d.md`. IKKE SET AF LUKAS ENDNU.
  FØRSTE SKRIDT: https://harms-coder.github.io/life-tracker/?bog3d på hans telefon. Spørg om tre ting: virker den
  overhovedet (WebGL på hans iPhone), hakker den, og ligner den `referencer/bog-maal.jpg`.
  Uden `?bog3d` er alt præcis som før – den gamle flade bog er urørt og skal blive det, til han har godkendt den nye.
- VALG: WebGL skrevet direkte, IKKE three.js som opgaven foreslog. Vi bruger ét mesh og én tekstur (~200 linjer);
  three.js ville lægge ~600 kB og en ny slags lag på en side hvor Safari er gået ned fem gange. Opgaven bad selv om
  at vælge det med mindst risiko på telefonen. Hvis WebGL viser sig at crashe på hans iPhone, er plan B at tegne
  buen stribe for stribe i 2D-canvas (samme teknik som `projectImage` brugte til bordpladen) – dårligere, men sikkert.
- SÅDAN VIRKER DEN (`src/bog3d.ts`): siderne er to underopdelte flader med
  z = COVER_T + STACK*s + ARCH*sin(pi*s^BOW), s = afstanden fra ryggen (0) til forkanten (1). Tallene der er tunet
  efter referencen: COVER_T 7, STACK 40, ARCH 54, BOW 0,7 (mindre end 1 flytter buens top mod ryggen).
  Sidestakken er et skørt fra hver sides kant ned til omslaget; omslaget er et tyndt bræt der ligger fladt og stikker
  LIP=10 ud. Lyset er en funktion af hældningen (`lightAt`), så folden er mørk.
  Kameraet gentager CSS' `perspective(700) rotateX(tilt)` om bogens 2D-centrum PIXEL FOR PIXEL – derfor ligger bogen
  stadig præcis samme sted på bordfotoet, og BG/TABLE skulle ikke røres.
  Buen skaleres med `tiltAmount`, samme tal som vippet: zoomet ind er siden helt flad, og den flade hit-test i
  `layout.ts` er dermed uændret. Rør ikke den kobling – det er den, der holder tryk korrekt.
- DOM (vigtigt for iPhone): WebGL-canvasset ligger i `.viewport` UDEN egen transform, EFTER `.tilt` (så det tegnes
  over skyggen) og uden for CSS-3D-kæden. FALDGRUBE der kostede en runde: lå det FØR `.tilt`, blev bogen tegnet
  under skyggens to mørke ellipser, og papiret så gråbrunt ud i stedet for cremet.
- Teksturen er det samme flade opslag `draw.ts` altid har tegnet, uploadet ved hver `render()`. Fragment-shaderen
  discarder uden for teksturens udsnit, så zoomet ind (hvor kun det synlige stykke tegnes) er resten bare væk.
  Mesh'et uploades kun når buen ændrer sig, og buen kvantiseres til hele verdens-px – ellers kostede det ~45 ms
  på hver niende frame. `renderLive` kører roligere i 3D (260 ms, 1,5x) fordi shaderen selv holder vip og bue
  korrekte hver frame; teksturen handler kun om skarphed.
- `tint()` i draw.ts er SVÆKKET (opgavens punkt 5): papiret var for mørkt mod referencen. Gælder BEGGE udgaver.
- Målt: pinch-in 4/129 frames >33 ms (som før), pinch-out 5/131 (1 før). tapcheck OK i begge udgaver.
- MANGLER mod `bog-maal.jpg` (opgavens trin 4–5): bogens skygge på bordet er stadig de to gamle DOM-ellipser og
  følger ikke buen, og omslaget kunne have en synlig kant ned til bordet.
- RUNDE 2 (d53d53b), efter Lukas' fem punkter på runde 1:
  1) Bogen ca. 6 % mindre: BG = {x:-648, y:-2069, w:2752, h:4892} (samme centrum 0,50/0,53 af fotoet).
  2) Folden lysere: FOLD_DARK 0,46 → 0,30.
  3+4) "Man kan se felterne og streger, der løber ned i tykkelsen": det var den GAMLE flade sidestak (`edge()` i
     drawCover), som stadig blev tegnet i teksturen og lå oven på den nye geometri. Den springes nu over når
     USE_3D. Sidestakken er ark med FAST tykkelse i verdens-px, båret i `a_meta.z` som afstand ned fra sidens kant.
     FALDGRUBE: som en 0..1-andel af skørtet gav det moiré, fordi skørtet bliver tyndere mod ryggen. Tykkelsen
     åbnes op ved udzoom (`3 / view.s`), så to linjer aldrig kommer tættere end ca. 3 skærm-px.
     Og tegnerækkefølgen SKAL være bræt → stak → sider: brættet er bredere end stakken og malede hen over den.
  5) "Bogen bliver helt lille" under pinch: midt i en pinch genbruger `fitCanvas` bufferen i en STØRRE størrelse
     end det tegnede udsnit, men `setTexture` fik kun udsnittets mål. Rektanglet dækker nu hele bufferen.
     Hakket: buen ligger nu i VERTEX-SHADEREN, så mesh'et bygges ÉN gang – før blev det bygget om ved hvert helt
     verdens-px af bue, altså ~54 gange pr. pinch. Og `renderLive` springer udzoom over i 3D (den gamle tekstur
     kan kun være for skarp); den ene undtagelse er flad → buet, hvor mesh'et skal bruge hele opslaget.
  Målt efter: pinch-ud 2/132 frames >33 ms (9 før), pinch-ind 4/129 = samme som den gamle bog. tapcheck OK i begge.
  IKKE SET AF LUKAS ENDNU.
- HØJRE SKYGGESTRIBE PÅ BORDET FJERNET (deb44fa). Lukas: den venstre er vinduets midterstolpe og skal blive,
  den højre havde intet til at kaste sig. Den lå i BÅDE aften.jpg og bord.webp. `tools/skyggevaek.py` løfter
  båndet tilbage til træets lysstyrke i stedet for at generere billederne igen (kompositionen er godkendt).
  En skygge er multiplikativ, så den divideres ud: pr. række aflæses lyset lige uden for båndet i begge sider,
  der interpoleres lige over, og pixlerne skaleres op. Båndets geometri står som JOBS øverst i filen – skal et
  andet bånd væk, måles det med ratio-metoden (L delt med en meget sløret L) og føjes til listen.
  FALDGRUBE: første forsøg satte båndet for bredt (0,115), så korrektionen blev tværet ud og skyggen blev kun
  svækket. Mål bredden, gæt den ikke. Målt i båndet: 0,74–0,83 før, 0,85–1,04 efter.
- TRYK RAMTE FELTET VED SIDEN AF (5cb91cf). Årsag: siden var ikke HELT flad zoomet ind. Buen (ARCH) døde ud med
  vippet, men sidestakken (STACK = 40 verdens-px fra ryggen ud til forkanten) og brættet blev stående, så siden
  var en rampe. Perspektivet skubber en hævet flade UDAD fra bogens centrum, og ude ved kanten var det mere end
  en hel kolonne. REGEL: alt i `pageZ` skal ganges med `flat` (= tiltAmount), så z er præcis 0 når
  `tiltFor(s) === 0`. Så er projektionen identisk med den flade transform, og hit-testen i layout.ts passer per
  konstruktion. Rører du højderne i bog3d.ts, så tjek den kobling først.
  Test: `Q="?bog3d" node tools/tapnoej.mjs screenshots` trykker seks steder og tegner en rød ring hvert sted.
- SKRIFTENS TYKKELSE: glyfferne er sporet fra et ark udfyldt med en fin pen, så de stod tyndere end X'erne (som
  tegnes store i en celle). `BOLD` i glyf.ts (0,009 af boksens højde) lægger en streg langs hver kontur. Skru på
  den, hvis Lukas vil have den tykkere eller tyndere – ikke på glyfferne.
- BUEN OG KANTERNE EFTER REFERENCEN (837b804). Lukas: buen for høj på toppen, yderkanten går bare lige ned, og
  papirenderne mangler i siderne. Tunede tal nu: ARCH 24, STACK 54, BOW 0,62, OVERHANG 20, ROLL 5, LIP 30.
  Buen topper LAVT og TIDLIGT, og yderkanten ligger HØJERE end midten (z(1) = 61 mod z(0,5) = 54), så siden går
  lidt op ude i siderne i stedet for at skråne tilbage ned.
  Sidestakken var en lodret væg: langs forkanten sås den, men langs venstre og højre kant stod den på kanten mod
  kameraet og forsvandt helt. Nu RULLER den over – forlader sidens kant vandret, lander lodret på brættet
  (kvartcirkel i ROLL trin) – så dens overside vender op mod kameraet hele vejen rundt. Derfor glider `a_meta.x`
  nu 1..0 gennem rullet, og shaderen bruger `mix(coverT, pageZ(s), a_meta.x)` i stedet for et valg mellem to.
  FALDGRUBE: LIP skal være STØRRE end OVERHANG, ellers ruller stakken hen over brættet og den mørke kant rundt
  om bogen forsvinder.
- Kør: `node tools/fit3d.mjs screenshots/b3d.png "?bog3d"` (ét startbillede), `Q="?bog3d" node tools/steps.mjs
  screenshots` (seks zoom-trin), `Q="?bog3d" npm run bench|tapcheck`. Uden Q tester de den gamle bog.

## Status 2026-09-17 kl. 18.10 (ældre)
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
2. Sidevending mellem måneder + datamodel (måneder, trackere, værdier) med lokal lagring.
3. Venstre side (mål/undermål/plan) med tekst i håndskrift.
4. Lukas' egen håndskrift som glyffer.
5. Finpudsning: papirtekstur, skygger, animation af skrift.
