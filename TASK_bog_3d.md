# Opgave: bogen skal ligne en rigtig, åben bog (3D med buede sider)

> Til Claude Code. Læs `CLAUDE.md` først – især iPhone-læren og "arbejdsform, der virkede". Svar Lukas på dansk.

## Mål

Bogen skal ligne **`referencer/bog-maal.jpg`**. Sådan ser den ud nu: **`referencer/bog-nu.jpg`**.

Lukas: *"Det er som om den ikke rigtig kan fange dybden i bogen. Man laver kun en helt flad bog der ligger på bordet,
og det skal den ikke. Den skal ligne en ægte bog."*

## Hvorfor det ikke kan lade sig gøre nu

Bogen tegnes som ÉT fladt canvas (`src/draw.ts`), der vippes med CSS (`BookCanvas.tsx`, `.tilt`). Et fladt plan kan
vippes, men aldrig **bøje**. Hver gang der er bedt om "mere dybde", er resultatet blevet en tykkere klods (BOOK_T 180 →
"alt, alt for tyk"). Dybden i referencen kommer IKKE fra tykkelse, men fra buede sider og synlig sidestak.

## Forskellen, punkt for punkt (i prioriteret rækkefølge)

1. **Siderne er en buet flade.** Hver side løfter sig fra ryggen i en blød bue og bliver fladere ud mod yderkanten.
   I midten dykker papiret ned i en fold (ryggen), som man ikke kan se helt ned i.
2. **Sidernes top- og bundkant buer med** (følger buen) – de er ikke lige linjer. Bundkanten ved ryggen ligger lavere.
3. **Sidestakken ses i yderkanterne** (venstre og højre): tynde, lyse papirlag, der buer med siderne. Ingen tyk, flad
   forkant ud mod betragteren som nu (`.book-face`).
4. **Omslaget er tyndt** (et par mm), mørkt og ligger **fladt på bordet**, lidt større end siderne – det ses som en smal
   mørk kant rundt om. Bogen er ikke en kasse.
5. **Lyset følger buen:** mørkere i folden ved ryggen, lysere på toppen af buerne, blød skygge fra bogen på bordet.
   Papiret er lysere/hvidere end nu (den varme `tint()` er for kraftig i forhold til referencen).

**Bogen må IKKE blive tykkere for at give dybde.** Dybden skal komme fra punkt 1–3.

## Foreslået løsning: three.js

- Siderne som et underopdelt plan (fx 64 × 8 segmenter pr. side), hvor hvert punkts højde (z) følger en buefunktion af
  afstanden til ryggen. Det eksisterende side-canvas fra `draw.ts` bruges som `CanvasTexture` – så håndskrift, gitter og
  alt indhold virker uændret, og glyfferne (trin 4) byttes stadig kun ind i `text()`/`handX()`.
- Sidestak = tynde buede bånd langs yderkanterne (egen lille tekstur med papirlag).
- Omslag = tynd mørk boks under siderne.
- Kamera: samme vinkel som fotoet ved start (≈ TILT_MAX 58°), går mod lige oppefra ved zoom – som i dag.
- **Buen bliver mindre, når man zoomer ind** (samme `tiltAmount` som vippet), så det er let at skrive tæt på.
  Helt zoomet ind er siden næsten flad.
- **Tryk:** raycast mod sidefladen → UV → sidekoordinat → den eksisterende hit-test i `layout.ts`. Tap-tærsklen
  (8 px, kun når vippet er væk) bevares.
- Bordfoto/bordplade (`scene2d`, `bord.webp`) kan blive liggende som i dag bag et gennemsigtigt WebGL-canvas, eller
  flyttes ind som baggrund i scenen – vælg det, der giver mindst risiko på iPhone, og skriv valget i `CLAUDE.md`.
- Senere (roadmap trin 2): sidevending bliver en bøjning af samme mesh – byg buefunktionen, så den kan genbruges.

## Arbejdsform

1. **Byg ved siden af, ikke ovenpå.** Prototypen ligger på `?bog3d`; den nuværende version skal virke uændret uden
   parameteren, indtil Lukas har godkendt den nye.
2. **Test på iPhone tidligt.** Safari på iPhone er gået ned 5 gange med nye lag (se iPHONE-LÆRE i `CLAUDE.md`), og
   Playwright-WebKit viser IKKE de nedbrud. Første push = en minimal three.js-scene med ét buet ark på bordfotoet, så
   Lukas kan bekræfte, at telefonen klarer WebGL, FØR resten bygges.
3. **Runder:** Chrome-skærmbillede (390×844, `deviceScaleFactor: 3`) af startvisningen, lagt **ved siden af
   `referencer/bog-maal.jpg`** → gennemgå punkt 1–5 og skriv, hvad der mangler → ret → nyt billede. Vis billederne
   til Lukas via galleriet (`tools/gallery.py`, se `CLAUDE.md`).
4. Stop og få Lukas' dom på telefonen efter punkt 1–3, før lys/finish (punkt 4–5).
5. Mål frame-tider (pinch) som før – målet er ikke dårligere end nu (4/132 frames > 33 ms).
6. Ret efter referencebilledet, ikke efter tal i Lukas' ord.

## Færdig når

- Startvisningen ligner `bog-maal.jpg` på de fem punkter (Lukas' dom på telefonen).
- Pinch-zoom, panorering og tryk i celler virker som i dag, og siden bliver flad nok til at skrive zoomet ind.
- Ingen nedbrud på iPhone.
- `CLAUDE.md` er opdateret: ny arkitektur under "Beslutninger", den gamle CSS-vip-bog markeret som historik.
