# Opgave: Få bogen til at ligge *i* scenen (dybdelag, fælles bordplan, lys)

## Problem
Baggrunden er nu et fladt foto. Kun bogen får kamera-transformationen ved pinch-zoom,
så det føles som om bogen løftes op mod brugeren i stedet for at kameraet bevæger sig
hen over bordet og ned mod bogen (som i den tidligere, procedurelt tegnede scene).
Derudover matcher bogens lys/skygge ikke scenen (varm solnedgang, lange skygger).

## Mål
1. Zoom skal føles som en kamerabevægelse gennem en scene med dybde.
2. Bogen skal ligge på bordet – samme perspektivplan, bevæger sig 1:1 med bordet.
3. Bogens lys og skygge skal følge baggrundens lys, styret af en config pr. baggrund.
4. Ved zoom = 1 skal scenen være pixel-identisk med det flade foto (lagene må ikke "skride").
5. 60 fps på iPhone: kun transform/opacity/filter – ingen layout-ændringer under gestus.

## Assets (leveres af Lukas i `assets/scenes/<scene-navn>/`)
Alle lag har samme opløsning og udsnit som originalfotoet.
| Fil | Indhold | Transparens |
|---|---|---|
| `far.png` | Væg, vindue, landskab – *uden* plante, bøger, kop, bord (clean plate) | nej |
| `mid.png` | Plante, bøger på karmen, evt. gardin | ja |
| `table.png` | Kun bordpladen | ja |
| `near.png` (valgfri) | Objekter foran bogen (kop, underlag) | ja |
| `scene.json` | Config, se nedenfor | – |

## Config: `scene.json`
```json
{
  "name": "sunset",
  "layers": [
    { "file": "far.png",   "depth": 0.15 },
    { "file": "mid.png",   "depth": 0.40 },
    { "file": "table.png", "depth": 0.90, "isTablePlane": true },
    { "file": "near.png",  "depth": 1.15 }
  ],
  "book": {
    "depth": 1.0,
    "anchor": { "x": 0.50, "y": 0.62 },
    "widthFraction": 0.78
  },
  "camera": {
    "zoomMax": 3.0,
    "tiltFar": 58,
    "tiltNear": 38,
    "perspective": 1200
  },
  "light": {
    "azimuthDeg": 200,
    "elevationDeg": 18,
    "tint": "#ff8a3d",
    "tintStrength": 0.12,
    "shadowLength": 0.35,
    "shadowSoftness": 22,
    "shadowOpacity": 0.45,
    "rimStrength": 0.25
  },
  "focus": { "maxBlurPx": 6, "maxDarken": 0.12 }
}
```
- `depth`: 0 = uendeligt langt væk, 1 = bogens plan. Bogen er referencen.
- `anchor`: bogens centrum i normaliserede foto-koordinater. Zoom konvergerer her.
- `azimuthDeg`: hvor lyset kommer fra (0 = top af billedet, med uret). 200 ≈ fra vinduet bag/til højre, skygger falder ned mod beskueren, let til venstre.

## Kamera-model (én sandhedskilde)
```
state = { zoom z ∈ [1, zoomMax], pan (px, py) i skærm-px }
t = (z − 1) / (zoomMax − 1)            // 0 = fuldt opslag, 1 = maks zoom
```
Pinch ændrer `z` med fokuspunkt under fingrene; pan ændrer `(px, py)`.
Pan clampes så bogen aldrig forlader skærmen.

### Transform pr. lag
Alle lag har `transform-origin` = bogens anchor (i pixels).
```
scale_L     = 1 + (z − 1) · depth_L
translate_L = (px · depth_L, py · depth_L)
```
Bogen: `depth = 1` → scale = z, translate = pan. Far-laget bevæger sig næsten ikke.

### Fælles bordplan (kamera-tilt)
Bord-laget og bogen lever i **samme** perspektiv-container:
```
perspective(camera.perspective)
tilt = lerp(tiltFar, tiltNear, easeOutCubic(t))
container: rotateX(tilt − tiltFar)      // 0° ved z=1 → pixel-identisk med fotoet
```
Bogen er *barn* af bord-containeren og placeres kun med x/y i planet. Bogens egen
rotateX fra før fjernes – den arver bordets. Når tilt falder under zoom, "kigger
kameraet mere ned" på bordet, og bog + bord roterer sammen.
Far/mid-lagene får en lille vertikal offset `−t · 4 %` af højden, så horisonten
glider op, når kameraet dykker.

## Lys og skygge på bogen
1. **Kontaktskygge**: blød ellipse under bogen, `blur = shadowSoftness · 0.5`,
   opacity `shadowOpacity`, 4 % bredere end bogen. Følger bogens transform.
2. **Retningsskygge**: kopi af bogens silhuet, skævet i `azimuthDeg`-retningen,
   længde `shadowLength · bogHøjde`, `blur = shadowSoftness`, opacity
   `shadowOpacity · 0.7`, tegnes *mellem* bord og bog. Skaleres med zoom ligesom bogen.
3. **Farvetone**: overlay på siderne med `tint` i `multiply`, styrke `tintStrength`,
   som lineær gradient: fuld styrke på den kant der vender mod lyset, halv på den modsatte.
4. **Rim-lys**: tynd lys gradient (hvid→transparent, styrke `rimStrength`) langs
   bogens kant mod lyset – både papir og omslag.
5. **Fokus**: `blur(far, mid) = t · maxBlurPx`, `brightness(far, mid) = 1 − t · maxDarken`.
   Bord og bog forbliver skarpe.

Alle værdier læses fra `scene.json`; ingen hårdkodede tal i komponenten.

## Implementering – trin
1. ✅ Lav en `Scene`-komponent der læser `scene.json` og stakker lagene i rækkefølge
   (far → mid → table[+shadow+book] → near).
2. ✅ Flyt eksisterende pinch/pan-logik ind i en `CameraController` der kun udstiller
   `{ z, px, py, t }`. Alle lag afleder deres transform herfra.
3. ✅ Implementér lag-transform og bordplan-container. Verificér mål 4 (z=1 → identisk).
4. Tilføj skygger og lys-overlays.
5. Tilføj fokus-effekten.
6. Profilér på iPhone: `will-change: transform` (web) / `drawingGroup()` (SwiftUI)
   på lagene; ingen re-layout under gestus.

## Acceptance-kriterier
- [x] z=1: scenen matcher originalfotoet pixel for pixel (overlay-test med 50 % opacity). ✅ 2026-09-16: `npm run scenecheck` – middelforskel 2,9/255, 0,2 % af pixels >30 (kun lagkanter).
- [ ] Zoom mod bogen: horisonten glider op, planten glider mere end vinduet, bordet
      og bogen roterer sammen. Det føles som at læne sig ind over bordet.
- [ ] Bogen kaster skygge i samme retning og blødhed som plante/bøger i fotoet.
- [ ] Papiret har samme varme som scenen; ingen "udklippet" kant.
- [ ] Skift `scene.json` (fx en morgen-scene med andet azimuth/tint) → alt følger med
      uden kodeændringer.
- [ ] Stabil 60 fps ved pinch på iPhone 12 eller nyere.

## Bemærkninger
- Hvis stacken er SwiftUI: `ZStack` + `.scaleEffect(anchor:)`, `.offset`,
  `.rotation3DEffect(axis: (1,0,0), perspective:)`, `.blur`, `.blendMode(.multiply)`.
- Hvis web: CSS `transform`, `perspective`, `filter`, `mix-blend-mode: multiply`.
- Behold den tidligere, procedurelle scene som fallback-scene (`scenes/procedural/`)
  så den kan sammenlignes.
