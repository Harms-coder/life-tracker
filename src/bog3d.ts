import { BOOK_H, BOOK_W, COVER, LIP, PAGE_H, PAGE_W, TABLE, TABLE_PAD } from "./layout";

/**
 * The open book as real geometry (WebGL, no library).
 *
 * The flat CSS-tilted plate could never bend, and every attempt to give it depth by making it thicker went
 * wrong. Depth in a real book comes from the pages themselves: they lift out of the fold in a curve, flatten
 * towards the fore-edge, and the page stack shows along the outer edges.
 *
 * What is drawn, back to front:
 *   cover   a flat board just under the pages, a little larger, seen as a thin dark rim
 *   pages   two curved sheets, z = COVER_T + STACK*s + ARCH*sin(pi*s^BOW) with s = distance from the spine
 *   edges   the page stack: a skirt from each sheet's outer rim down to the board
 *
 * The page content is the same 2D canvas `draw.ts` has always produced, handed over as a texture, so the grid,
 * the handwriting and the hit-testing in `layout.ts` are untouched.
 *
 * The camera repeats what `perspective(P) rotateX(θ)` did in CSS, to the pixel, so the book still lies exactly
 * where it lay on the photo of the table. The curve fades out with the tilt: looking straight down the page is
 * flat, which is what keeps writing in a cell easy and the flat hit-test correct.
 */

/** Thickness of the cover board and of the page stack under one open half, in world px (1 cell = 20 px = 5 mm). */
export const COVER_T = 12;
export const STACK = 42;
/** The page does not rise in one hump. In referencer/bog-maal.jpg it waves: up out of the fold, back down
 *  through the middle, on down, and lifting again at the fore-edge. That second movement is WAVE, a full period
 *  laid over the single arch; without it the page reads as one bland slope. */
export const ARCH = 22;
const WAVE = 0.55;
const BOW = 0.7;   // s^BOW inside the sines: < 1 moves the movement towards the spine
const BOW2 = 0.9;
/** How much of the lift into the fore-edge is taken back. 0 = the full swing up, DIP_MAX = none at all.
 *  ?dip=N overrides it while the shape is being tuned. */
const DIP_MAX = 9;
const DIP = Math.max(0, Math.min(DIP_MAX, Number(new URLSearchParams(location.search).get("dip") ?? 5)));
const DIP_FROM = 0.84;
/** How far the foot of the page stack stands out past the page above it, and in how many steps it rolls over.
 *  A real book's stack is not a vertical wall: it curves out of the page's rim and then down, so the top of it
 *  faces upwards and you see the sheet ends even along the sides, where a flat wall is edge on to the camera. */
const OVERHANG = 20;
const ROLL = 5;

/** The book's shadow on the table. The sun is low in the window behind and a little to the right, so every
 *  height casts a long shadow towards the viewer and a little left: LEN world px along DIR per world px of height.
 *  It is the book's own mesh laid down on the table along that direction, so it follows the curve and the page
 *  stack, and collapses to nothing as the book flattens when zoomed in. PASSES copies of growing length, each
 *  faint, make the penumbra: dark where they all overlap at the foot, fading out along the far edge.
 *  ?sh=N overrides LEN while it is being tuned. */
const SHADOW_DIR = [-0.3, 1] as const;
const SHADOW_LEN = Number(new URLSearchParams(location.search).get("sh") ?? 2.5);
const SHADOW_DARK = 0.55;
const SHADOW_PASSES = 5;
const SHADOW_ON = new URLSearchParams(location.search).get("skygge") !== "0";
/** Looking straight down the page is drawn perfectly flat (for the hit-test), but the book still has its
 *  thickness on the table: the shadow keeps at least this share of the full height, so a band stays under the
 *  book's near edge when zoomed in. */
const SHADOW_MIN = 0.4;

/** The room's light falls across the book as it falls across the table under it: the photo's own brightness
 *  over the book's footprint (blurred, so the wood grain stays out of it, and normalised to its mean) is laid
 *  over the page. This is what makes the window frame's long shadows run on across the paper instead of
 *  stopping at the cover. Fades out with the tilt, like the top-down table it then lies on has no such stripes. */
const LIGHT_STRENGTH = new URLSearchParams(location.search).get("lys") === "0" ? 0 : 1.0; // ?lys=0: off, to tell it apart from other trouble
/** The room's colour on the book. White things in the photo (the books on the left, the mug) are nowhere near
 *  white: the golden-hour light makes them warm grey-brown. The page canvas is drawn in plain paper colour and
 *  everything the book shows is multiplied by this - measured so the page in the sun and in the window frame's
 *  shadow land where the photo's own white objects do. ?tone=r,g,b overrides it while tuning. */
const TONE = ((new URLSearchParams(location.search).get("tone") ?? "0.97,0.86,0.74").split(",").map(Number)) as [number, number, number];
const LIGHT_MARGIN = 120;   // spread px around the book the light map covers (the shadow and edges reach out there)
const LIGHT_RES = Number(new URLSearchParams(location.search).get("lr") ?? 10); // texels across: coarse on purpose, that is the blur

/** The share of each side of public/baggrund/bord.webp that its alpha fades out over (see tools/bordplade.py):
 *  everything inside that is opaque and sharp, and that is all we ever sample. */
const TABLE_EDGE = 0.15;
const SEG_X = 56, SEG_Y = 10; // segments per page: across the curve, and along it
/** How dark the fold goes, and the thinnest a sheet is allowed to look (world px). A book of 150 leaves wants
 *  far finer lines than a handful of thick boards, so this is kept small and only opened up as far as the
 *  screen can still tell two of them apart. */
const FOLD_DARK = 0.3;
const SHEET_MIN = 0.85;
const SHEET_SCREEN = 2.7; // never let two lines come closer than this on screen

/** Height of the page surface above the table, at distance `s` (0 at the spine, 1 at the fore-edge). */
const smoothstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const pageZ = (s: number, arch: number) => {
  const t = Math.max(0.0005, Math.min(1, s));
  const wave = COVER_T + STACK * t + arch * (Math.sin(Math.PI * Math.pow(t, BOW)) + WAVE * Math.sin(2 * Math.PI * Math.pow(t, BOW2)));
  return wave - DIP * (arch / ARCH) * smoothstep(DIP_FROM, 1, t);
};

const VERT = `
attribute vec3 a_pos;      // x, y in spread coordinates; z = s, the distance from the spine (0..1)
attribute vec2 a_off;      // how far this vertex stands out from the page rim (the page stack), at full tilt
attribute vec3 a_meta;     // x: 1 = at the page surface, 0 = down on the board, sliding between
                           // y: fixed shade, or 0 to work it out from the slope
                           // z: 0..1 across the page stack, for the sheet lines
uniform vec2 u_view;       // where the spread's origin sits on screen
uniform float u_scale;     // world px -> screen px
uniform vec2 u_origin;     // the book's centre on screen: the tilt turns about it, as the CSS transform-origin did
uniform vec2 u_trig;       // cos, sin of the tilt
uniform float u_persp;     // perspective distance in screen px
uniform vec2 u_res;        // canvas size in px
uniform float u_foldDark;  // how deep the shadow in the fold goes
uniform vec4 u_tex;        // the part of the spread the texture covers: x, y, w, h in spread coordinates
uniform vec4 u_book;       // coverT, stack, arch, pageW: the shape of the open page
uniform float u_spine;     // x of the fold, in spread coordinates
uniform vec3 u_bow;        // BOW, BOW2, WAVE: the shape of the page's wave
uniform vec2 u_dip;        // how far, and from where, the page tips back down at the fore-edge
uniform vec3 u_shadow;     // z > 0: draw the shadow instead - every point laid on the table, moved xy per unit of height
uniform vec4 u_lightRect;  // the part of the spread the light map covers: x, y, w, h
uniform float u_out;       // how much of a_off to apply: it collapses with the tilt, like every height does
uniform float u_table;     // > 0: the table pass - lies flat in the 2D world like the photo, never tilted
uniform vec4 u_tableRect;  // where the table picture lies, in world px
uniform float u_leaf;      // > 0: this pass draws the leaf being turned (see u_turn)
uniform vec4 u_turn;       // x: direction (+1 the right leaf goes over to the left, -1 the other way), y: angle 0..pi, z: bend, w: twist
varying vec2 v_uv;
varying vec2 v_ouv;
varying vec2 v_buv;        // the leaf's back: where it lands on the other spread
varying vec2 v_luv;
varying vec2 v_tuv;
varying float v_shade;
varying float v_layer;
varying float v_side;      // -1 left page, +1 right page

/** Height of the page above the board at distance s from the spine. u_book.y and .z both fade out with the
 *  tilt, so looking straight down the page is exactly flat - which is what lets the flat hit-test in layout.ts
 *  stay correct. Leave the stack in at that point and the page is still a ramp: every cell is nudged outwards
 *  by the perspective, and a tap lands in the neighbouring column. */
float pageZ(float s) {
  s = clamp(s, 0.0, 1.0);
  float a = pow(max(s, 0.0005), u_bow.x);
  float b = pow(max(s, 0.0005), u_bow.y);
  float wave = u_book.x + u_book.y * s + u_book.z * (sin(3.14159265 * a) + u_bow.z * sin(6.2831853 * b));
  return wave - u_dip.x * smoothstep(u_dip.y, 1.0, s);
}

/** The shade of the page surface at distance s from the spine, on the side "side" (-1 left, +1 right): the
 *  window is behind the book, so a slope facing away from the viewer catches the light, and the fold is dark. */
float pageShade(float s, float side) {
  float slope = (pageZ(s + 0.01) - pageZ(s - 0.01)) / (0.02 * u_book.w);
  float fold = 1.0 - min(1.0, s * 6.0);
  return clamp(1.0 + (-side * slope) * 0.55 - fold * fold * u_foldDark, 0.6, 1.06);
}

void main() {
  float s = a_pos.z;
  vec2 op = a_pos.xy;   // where this point lies on the flat spread (for the leaf: where it lay before it lifted)
  vec2 xy;
  float z;
  if (u_leaf > 0.0) {
    // The leaf being turned. The mesh is the right page; for the other direction it is mirrored about the spine.
    // It is not a stiff board swinging on a hinge: the free edge leads, so the sheet bows along its length. The
    // tangent angle grows linearly from the hinge angle at the spine (u_turn.y) to that plus the bend at the
    // fore-edge - most when the sheet stands upright, nothing when it lies flat on either side. The twist lets
    // one corner lead (where the finger holds it), so the fore-edge lifts on a slant.
    float dir = u_turn.x;
    op.x = u_spine + dir * (a_pos.x - u_spine);
    float u = s * u_book.w;                                    // distance along the sheet, world px
    float v = (a_pos.y - ${COVER}.0) / ${PAGE_H}.0;            // 0 at the top edge, 1 at the bottom
    float th = u_turn.y;
    float c = u_turn.z * sin(th) * (1.0 + u_turn.w * (v - 0.5)) / u_book.w; // curvature, rad per world px
    float r, cz;
    if (abs(c) < 1e-6) { r = u * cos(th); cz = u * sin(th); }
    else { r = (sin(th + c * u) - sin(th)) / c; cz = (cos(th) - cos(th + c * u)) / c; }
    float alpha = th + c * u;
    xy = vec2(u_spine + dir * r, a_pos.y);
    float footS = clamp(abs(xy.x - u_spine) / u_book.w, 0.0, 1.0);
    if (u_shadow.z > 0.0) { xy += u_shadow.xy * cz; footS = clamp(abs(xy.x - u_spine) / u_book.w, 0.0, 1.0); z = pageZ(footS); } // its shadow falls on the page under it
    else z = cz + pageZ(footS);
    // lit like the page under it (so nothing pops when it starts to lift), darker as it turns edge on
    v_shade = pageShade(footS, xy.x < u_spine ? -1.0 : 1.0) * (0.74 + 0.26 * abs(cos(alpha)));
    v_layer = 0.0;
  } else {
    z = a_meta.x < 0.0 ? 0.0 : mix(u_book.x, pageZ(s), a_meta.x);  // a_meta.x slides 1..0 as the stack rolls over to the board; < 0 = down on the table
    v_shade = a_meta.y > 0.0 ? a_meta.y : pageShade(s, a_pos.x < u_spine ? -1.0 : 1.0);
    // the sheets have a real thickness, so the lines must keep their spacing all the way along the skirt: carry
    // the distance DOWN from the page rim, in world px, not a 0..1 share of a skirt that thins out at the fold
    v_layer = a_meta.z * (pageZ(s) - u_book.x);
    // The stack only shows because the book is tipped back. Looking straight down you see the top sheet and
    // nothing else, so the skirt folds back under the page rim - otherwise it stays as a pale border round the
    // paper that nothing can remove (Lukas, zoomed in).
    xy = a_pos.xy + a_off * u_out;
    if (u_shadow.z > 0.0) { xy += u_shadow.xy * z; z = 0.0; }
  }
  v_side = op.x < u_spine ? -1.0 : 1.0;
  vec2 flat_px = u_view + xy * u_scale;
  float h = z * u_scale;
  vec2 d = flat_px - u_origin;
  float ry = d.y * u_trig.x - h * u_trig.y;
  float rz = d.y * u_trig.y + h * u_trig.x;
  float k = u_persp / max(u_persp - rz, u_persp * 0.1); // a leaf standing up can come close to the camera; never let it pass it
  vec2 sp = u_origin + vec2(d.x * k, ry * k);
  if (u_table > 0.0) sp = flat_px;
  v_tuv = (a_pos.xy - u_tableRect.xy) / u_tableRect.zw;
  gl_Position = vec4((sp / u_res) * 2.0 - 1.0, 0.0, 1.0);
  gl_Position.y = -gl_Position.y;
  v_uv = (op - u_tex.xy) / u_tex.zw;
  vec2 board = vec2(${BOOK_W + 2 * LIP}.0, ${BOOK_H + 2 * LIP}.0);
  v_ouv = (op + ${LIP}.0) / board;
  v_buv = (vec2(2.0 * u_spine - op.x, op.y) + ${LIP}.0) / board;
  v_luv = (op - u_lightRect.xy) / u_lightRect.zw;
}`;

const FRAG = `
precision mediump float;
varying vec2 v_uv;
varying vec2 v_ouv;
varying vec2 v_buv;
varying vec2 v_luv;
varying vec2 v_tuv;
varying float v_shade;
varying float v_layer;
varying float v_side;
uniform sampler2D u_img;
uniform sampler2D u_over;     // the whole spread, coarser: stands in wherever u_img does not reach
uniform float u_hasOver;
uniform sampler2D u_next;     // the spread being turned to, coarse: the leaf's back, and the page it uncovers
uniform float u_hasNext;
uniform float u_turnSide;     // mid-turn: which page of the spread (-1 left, +1 right) already shows u_next
uniform highp float u_leaf;   // highp: shared with the vertex shader, or the program does not link
uniform highp vec4 u_turn;
uniform sampler2D u_tableTex; // the sharp top-down table
uniform highp float u_table;  // 1: the table's colour (u_flat) 2: its picture; both faded by u_fade (highp: shared with the vertex shader, or it does not link)
uniform float u_fade;
uniform sampler2D u_light;  // the room's light over the book's footprint, see LIGHT_STRENGTH
uniform vec4 u_lightAmt;    // x: how much of it to apply (0 = none), yzw: 1 / its mean, per channel
uniform vec3 u_tone;        // the room's colour, see TONE
uniform vec4 u_paper;       // a > 0: what a page shows where the texture does not reach (mid-pinch it holds a slice)
uniform vec4 u_flat;       // when a > 0: ignore the texture and use this colour (the page stack)
uniform float u_sheets;    // one sheet every this many world px, widened when zoomed out so the lines never alias
uniform float u_sheetAmp;  // fades the lines out when they get too close to resolve, leaving an even tone
uniform vec4 u_shadowC;    // when a > 0: paint this (premultiplied) and nothing else - the shadow pass
void main() {
  if (u_table > 1.5) {
    // The table picture has a soft alpha border (13 % of each side) so it can blend into the photo. Zoomed in
    // that border is all you can see at the edges of the screen: the sharp wood washes out into flat colour
    // (Lukas: "det slører i siderne, i toppen og i bunden"). So sample only the picture's sharp middle, and
    // mirror it out over the whole plane - mirroring joins seamlessly, so the wood simply runs on.
    vec2 m = abs(mod(v_tuv - 1.0, 2.0) - 1.0);
    vec4 t = texture2D(u_tableTex, ${TABLE_EDGE} + m * ${1 - 2 * TABLE_EDGE});
    gl_FragColor = vec4(t.rgb * u_fade, t.a * u_fade);
    return;
  }
  if (u_table > 0.5) { gl_FragColor = vec4(u_flat.rgb * u_fade, u_fade); return; }
  if (u_shadowC.a > 0.0) { gl_FragColor = u_shadowC; return; }
  vec3 light = u_tone;
  if (u_lightAmt.x > 0.0) light *= mix(vec3(1.0), texture2D(u_light, v_luv).rgb * u_lightAmt.yzw, u_lightAmt.x);
  if (u_flat.a > 0.0) {
    // the page stack seen edge on: sheet after sheet lying on each other, never the page's own grid
    float ph = fract(v_layer / u_sheets);
    float line = pow(0.5 + 0.5 * cos(ph * 6.2831853), 7.0);
    float sheet = 1.0 - 0.34 * u_sheetAmp * line;
    gl_FragColor = vec4(u_flat.rgb * v_shade * sheet * light, 1.0);
    return;
  }
  // zoomed in, the texture holds only the visible slice of the spread. A fast pan or zoom out runs off it before
  // the next drawing is back (~150 ms on the phone): there, and wherever that drawing did not reach, the coarser
  // whole-spread overview stands in, so the book never goes blank.
  vec4 c;
  // The flat spread is drawn clockwise on screen, so a page lying the right way up is back-facing to GL (mirrored
  // for the other direction, so front-facing); once the leaf has swung past upright its winding flips, and that
  // is its back: the other spread, mirrored about the spine.
  if (u_leaf > 0.0 && gl_FrontFacing == (u_turn.x > 0.0)) c = u_hasNext > 0.5 ? texture2D(u_next, v_buv) : vec4(0.0);
  else if (u_leaf < 0.5 && u_turnSide * v_side > 0.5) c = u_hasNext > 0.5 ? texture2D(u_next, v_ouv) : vec4(0.0);
  else {
    bool outside = v_uv.x < 0.0 || v_uv.x > 1.0 || v_uv.y < 0.0 || v_uv.y > 1.0;
    c = outside ? vec4(0.0) : texture2D(u_img, v_uv);
    if (c.a < 0.01 && u_hasOver > 0.5) c = texture2D(u_over, v_ouv);
  }
  if (c.a < 0.01) { // the board's rounded corners - or nothing drawn there yet: paper
    if (u_paper.a <= 0.0) discard;
    gl_FragColor = vec4(u_paper.rgb * v_shade * light, 1.0);
    return;
  }
  gl_FragColor = vec4(c.rgb * v_shade * light, c.a);
}`;

type Mesh = { pos: Float32Array; off: Float32Array; meta: Float32Array; idx: Uint16Array; n: number };

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src); gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? "shader");
  return sh;
}

/**
 * The cover board and the two pages. Built once: the vertices carry `s`, the distance from the spine, and the
 * shader turns that into a height, so changing the arch costs nothing.
 *   a_pos  = x, y, s        a_meta = onCurve, fixedShade (0 = from the slope), layer
 */
function buildCover(): Mesh {
  const pos = [-LIP, -LIP, 0, BOOK_W + LIP, -LIP, 0, BOOK_W + LIP, BOOK_H + LIP, 0, -LIP, BOOK_H + LIP, 0];
  const meta = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
  const idx = [0, 1, 2, 0, 2, 3];
  return { pos: new Float32Array(pos), off: new Float32Array(8), meta: new Float32Array(meta), idx: new Uint16Array(idx), n: 6 };
}

/** The board's edge: a skirt from the cover's rim down to the table, so the book has a visible thickness at its
 *  front instead of ending in a line. The window is behind the book, so the front face gets only the room's
 *  light and the sides less still. */
function buildRim(): Mesh {
  const pos: number[] = [], meta: number[] = [], idx: number[] = [];
  const push = (x: number, y: number, top: boolean, shade: number) => { pos.push(x, y, 0); meta.push(top ? 0 : -1, shade, 0); return pos.length / 3 - 1; };
  const quad = (a: number, b: number, c: number, d: number) => idx.push(a, b, c, a, c, d);
  const corners = [[0, 0], [BOOK_W, 0], [BOOK_W, BOOK_H], [0, BOOK_H]], shade = [0.5, 0.7, 1, 0.7];
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = corners[i], [bx, by] = corners[(i + 1) % 4];
    quad(push(ax, ay, true, shade[i]), push(bx, by, true, shade[i]), push(bx, by, false, shade[i]), push(ax, ay, false, shade[i]));
  }
  return { pos: new Float32Array(pos), off: new Float32Array((pos.length / 3) * 2), meta: new Float32Array(meta), idx: new Uint16Array(idx), n: idx.length };
}

/** A flat quad in world px, for the table under the book. */
function buildQuad(x: number, y: number, w: number, h: number): Mesh {
  const pos = [x, y, 0, x + w, y, 0, x + w, y + h, 0, x, y + h, 0];
  return { pos: new Float32Array(pos), off: new Float32Array(8), meta: new Float32Array([-1, 1, 0, -1, 1, 0, -1, 1, 0, -1, 1, 0]), idx: new Uint16Array([0, 1, 2, 0, 2, 3]), n: 6 };
}

/** `sides`: both pages, or only the right one - that is the leaf being turned (the shader mirrors it for the
 *  other direction), and it is drawn finer along the page, since it bends and twists in both directions. */
function buildPages(sides: number[] = [-1, 1], segY = SEG_Y): Mesh {
  const pos: number[] = [], meta: number[] = [], idx: number[] = [];
  const push = (x: number, y: number, s: number, curve: number, shade: number) => {
    pos.push(x, y, s); meta.push(curve, shade, 0); return pos.length / 3 - 1;
  };
  const quad = (a: number, b: number, c: number, d: number) => idx.push(a, b, c, a, c, d);
  const top = COVER, bot = COVER + PAGE_H, spine = BOOK_W / 2, SEG_Y = segY;
  for (const dir of sides) {
    const grid: number[][] = [];
    for (let i = 0; i <= SEG_X; i++) {
      const s = i / SEG_X, x = spine + dir * s * PAGE_W, col: number[] = [];
      for (let j = 0; j <= SEG_Y; j++) col.push(push(x, top + ((bot - top) * j) / SEG_Y, s, 1, 0));
      grid.push(col);
    }
    for (let i = 0; i < SEG_X; i++)
      for (let j = 0; j < SEG_Y; j++)
        quad(grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]);
  }
  return { pos: new Float32Array(pos), off: new Float32Array((pos.length / 3) * 2), meta: new Float32Array(meta), idx: new Uint16Array(idx), n: idx.length };
}

/** The page stack: a skirt from each sheet's rim down to the board. `layer` runs 0..1 across it, which is what
 *  draws the individual sheets in the fragment shader. */
function buildEdges(): Mesh {
  const pos: number[] = [], off: number[] = [], meta: number[] = [], idx: number[] = [];
  // the position is the page's own rim; how far the vertex rolls out from it is kept apart, so the shader can
  // fold the whole stack back under the page as the book flattens
  const push = (x: number, y: number, ox: number, oy: number, s: number, curve: number, shade: number, layer: number) => {
    pos.push(x, y, s); off.push(ox, oy); meta.push(curve, shade, layer); return pos.length / 3 - 1;
  };
  const quad = (a: number, b: number, c: number, d: number) => idx.push(a, b, c, a, c, d);
  const top = COVER, bot = COVER + PAGE_H, spine = BOOK_W / 2;

  for (const dir of [-1, 1]) {
    const xo = spine + dir * PAGE_W;                  // the fore-edge
    // How far out and how far down the stack has rolled after `t` of its turn: it leaves the page rim going
    // sideways and arrives at the board going straight down, so its upper part faces the camera.
    const out = (t: number) => Math.sin((t * Math.PI) / 2);
    const drop = (t: number) => 1 - Math.cos((t * Math.PI) / 2);
    const lit = (t: number) => 1.04 - 0.34 * t;            // the top of the roll catches the light, the foot is in shade

    // the fore-edge
    for (let k = 0; k < ROLL; k++) {
      const t0 = k / ROLL, t1 = (k + 1) / ROLL;
      const oa = dir * OVERHANG * out(t0), ob = dir * OVERHANG * out(t1);
      quad(push(xo, top, oa, 0, 1, 1 - drop(t0), lit(t0), drop(t0)), push(xo, bot, oa, 0, 1, 1 - drop(t0), lit(t0) * 0.98, drop(t0)),
           push(xo, bot, ob, 0, 1, 1 - drop(t1), lit(t1) * 0.98, drop(t1)), push(xo, top, ob, 0, 1, 1 - drop(t1), lit(t1), drop(t1)));
    }
    // the long edges, top and bottom: they follow the curve along the page, and roll over the same way
    for (const [y, sh, sgn] of [[top, 1.1, -1], [bot, 0.9, 1]] as const) {
      for (let i = 0; i < SEG_X; i++) {
        const s0 = i / SEG_X, s1 = (i + 1) / SEG_X;
        const x0 = spine + dir * s0 * PAGE_W, x1 = spine + dir * s1 * PAGE_W;
        for (let k = 0; k < ROLL; k++) {
          const t0 = k / ROLL, t1 = (k + 1) / ROLL;
          // the roll grows with the stack, so the skirt closes to nothing at the fold instead of flaring there
          const oa = sgn * OVERHANG * out(t0), ob = sgn * OVERHANG * out(t1);
          quad(push(x0, y, 0, oa * s0, s0, 1 - drop(t0), sh * lit(t0), drop(t0)),
               push(x1, y, 0, oa * s1, s1, 1 - drop(t0), sh * lit(t0), drop(t0)),
               push(x1, y, 0, ob * s1, s1, 1 - drop(t1), sh * lit(t1), drop(t1)),
               push(x0, y, 0, ob * s0, s0, 1 - drop(t1), sh * lit(t1), drop(t1)));
        }
      }
    }
  }
  return { pos: new Float32Array(pos), off: new Float32Array(off), meta: new Float32Array(meta), idx: new Uint16Array(idx), n: idx.length };
}

export type Book3D = {
  /** Queue the flat spread (raw RGBA from draw.worker.ts) as the next page texture; `rect` is the part of the spread
   *  it covers. It goes up in slices, one per draw(), into a second texture; when the last slice is in, the two
   *  swap and `done` runs. Until then the old texture stays, whole. */
  setTexture(pixels: Uint8Array, w: number, h: number, rect: { x: number; y: number; w: number; h: number }, done: () => void): void;
  /** True while a texture is on its way up: keep drawing frames, each one carries a slice. */
  pending(): boolean;
  /** The whole spread at a coarse resolution (raw RGBA): shown wherever the page texture does not reach. Uploaded
   *  in one go - it only changes at start-up and when something is written, never mid-gesture. */
  setOverview(pixels: Uint8Array, w: number, h: number): void;
  /** The spread on the other side of the leaf about to be turned, coarse like the overview: its back, and the
   *  page it uncovers. */
  setNext(pixels: Uint8Array, w: number, h: number): void;
  /** The leaf has landed: that spread is the one shown now. Its coarse picture stands in for the whole book until
   *  the sharp drawing of it arrives (the old sharp one is dropped, it shows the month just left). */
  commitTurn(): void;
  /** The room photo and where it lies in spread coordinates: the light over the book is taken from it.
   *  False when nothing usable came of it (the light then stays off; try again later). */
  setLight(img: HTMLImageElement, bg: { x: number; y: number; w: number; h: number }): boolean;
  /** The sharp top-down picture of the table (lies in TABLE, world px). */
  setTable(img: HTMLImageElement): void;
  /** Draw one frame. `arch` 0 = flat. `fade` 0..1: how far the top-down table is in over the photo. */
  draw(o: { w: number; h: number; view: { x: number; y: number; s: number }; origin: [number, number]; tilt: number; arch: number; flat: number; fade: number; turn?: Turn | null }): void;
  dispose(): void;
};
/** A leaf mid-turn: `dir` +1 = the right leaf swings over to the left (the next month), -1 the other way;
 *  `p` 0 = lying where it was, 1 = landed; `twist` -1..1 = which corner leads (top .. bottom), 0 = the whole edge. */
export type Turn = { dir: 1 | -1; p: number; twist: number };
/** How much the sheet bows while it turns (rad at the fore-edge when upright), and its shadow on the page under
 *  it: shorter and lighter than the book's own on the table (the sheet is thin and close). ?bend= ?ls= ?ld= tune. */
const BEND = Number(new URLSearchParams(location.search).get("bend") ?? 0.65);
const LEAF_SHADOW_LEN = Number(new URLSearchParams(location.search).get("ls") ?? 0.35);
const LEAF_SHADOW_DARK = Number(new URLSearchParams(location.search).get("ld") ?? 0.3);

/** The page texture goes up in slices of at most this many bytes per frame (`?strip=MB`). One upload of the whole
 *  25 MB bitmap cost 47 ms on the iPhone - the one hitch left once the drawing had moved off the main thread. */
const STRIP_BYTES = Number(new URLSearchParams(location.search).get("strip") ?? 4) * 1e6;

export function createBook3D(canvas: HTMLCanvasElement, persp: number): Book3D | null {
  // ?aa=0: no multisampling (a 3 MP buffer at 4 samples is ~50 MB on the phone - a suspect when Safari gives up on the page)
  const antialias = new URLSearchParams(location.search).get("aa") !== "0";
  const gl = (canvas.getContext("webgl", { alpha: true, antialias, premultipliedAlpha: true }) ??
              canvas.getContext("experimental-webgl", { alpha: true, antialias })) as WebGLRenderingContext | null;
  if (!gl) return null;

  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.error("WebGL link:", gl.getProgramInfoLog(prog)); return null; }
  gl.useProgram(prog);

  const loc = (n: string) => gl.getUniformLocation(prog, n);
  const U = {
    view: loc("u_view"), scale: loc("u_scale"), origin: loc("u_origin"), trig: loc("u_trig"),
    persp: loc("u_persp"), res: loc("u_res"), tex: loc("u_tex"), flat: loc("u_flat"), img: loc("u_img"),
    book: loc("u_book"), spine: loc("u_spine"), fold: loc("u_foldDark"), sheets: loc("u_sheets"),
    bow: loc("u_bow"), dip: loc("u_dip"), amp: loc("u_sheetAmp"), out: loc("u_out"), shadow: loc("u_shadow"), shadowC: loc("u_shadowC"),
    light: loc("u_light"), lightAmt: loc("u_lightAmt"), over: loc("u_over"), hasOver: loc("u_hasOver"), lightRect: loc("u_lightRect"), tone: loc("u_tone"), paper: loc("u_paper"),
    table: loc("u_table"), tableTex: loc("u_tableTex"), tableRect: loc("u_tableRect"), fade: loc("u_fade"),
    next: loc("u_next"), hasNext: loc("u_hasNext"), turnSide: loc("u_turnSide"), leaf: loc("u_leaf"), turn: loc("u_turn"),
  };
  const aPos = gl.getAttribLocation(prog, "a_pos"), aOff = gl.getAttribLocation(prog, "a_off"), aMeta = gl.getAttribLocation(prog, "a_meta");
  /** One set of buffers per mesh, so a frame that changes nothing only binds them. Re-uploading both meshes
   *  every frame cost ~45 ms on roughly every ninth frame of a pinch. */
  const slot = () => ({ pos: gl.createBuffer()!, off: gl.createBuffer()!, meta: gl.createBuffer()!, idx: gl.createBuffer()!, n: 0 });
  const slots = { cover: slot(), rim: slot(), pages: slot(), edges: slot(), tableFill: slot(), tableImg: slot(), leaf: slot() };
  const pageTexture = () => {
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE);
    for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.LINEAR);
    return { t, w: 0, h: 0 };
  };
  // front = what is drawn, back = what is being uploaded; they swap when the upload is complete
  let front = pageTexture(), back = pageTexture();
  let upload: { pixels: Uint8Array; w: number; h: number; rect: { x: number; y: number; w: number; h: number }; row: number; done: () => void } | null = null;
  gl.uniform1i(U.img, 0);
  const lightTex = gl.createTexture()!;
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, lightTex);
  for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE);
  for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.LINEAR);
  const tableTex = gl.createTexture()!;
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, tableTex);
  for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE);
  for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.LINEAR);
  let hasTable = false;
  gl.activeTexture(gl.TEXTURE0);
  gl.uniform1i(U.light, 1);
  gl.uniform1i(U.tableTex, 2);
  let over = pageTexture(); // its unit is 3; pageTexture binds on whichever unit is active, setOverview rebinds it there
  gl.uniform1i(U.over, 3);
  gl.uniform1f(U.hasOver, 0);
  let next = pageTexture(); // unit 4: the spread on the other side of a leaf being turned
  gl.uniform1i(U.next, 4);
  gl.uniform1f(U.hasNext, 0);
  gl.uniform1f(U.turnSide, 0);
  gl.uniform1f(U.leaf, 0);
  /** A coarse whole-spread picture, in one go (they only change when something is written, never mid-gesture). */
  const putWhole = (unit: number, tex: { t: WebGLTexture; w: number; h: number }, pixels: Uint8Array, w: number, h: number) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex.t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    if (tex.w === w && tex.h === h) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    else { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels); tex.w = w; tex.h = h; }
    gl.activeTexture(gl.TEXTURE0);
  };
  gl.uniform4f(U.tableRect, TABLE.x, TABLE.y, TABLE.w, TABLE.h);
  gl.uniform1f(U.table, 0);
  let lightK: [number, number, number] | null = null; // 1 / mean of the light map, per channel; null until one is set
  const lightRect = { x: -LIGHT_MARGIN, y: -LIGHT_MARGIN, w: BOOK_W + 2 * LIGHT_MARGIN, h: BOOK_H + 2 * LIGHT_MARGIN };
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);


  let texRect = { x: 0, y: 0, w: BOOK_W, h: BOOK_H };


  const fill = (sl: typeof slots.pages, m: Mesh) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, sl.pos); gl.bufferData(gl.ARRAY_BUFFER, m.pos, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, sl.off); gl.bufferData(gl.ARRAY_BUFFER, m.off, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, sl.meta); gl.bufferData(gl.ARRAY_BUFFER, m.meta, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sl.idx); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.idx, gl.STATIC_DRAW);
    sl.n = m.n;
  };
  const bind = (sl: typeof slots.pages) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, sl.pos);
    gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, sl.off);
    gl.enableVertexAttribArray(aOff); gl.vertexAttribPointer(aOff, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, sl.meta);
    gl.enableVertexAttribArray(aMeta); gl.vertexAttribPointer(aMeta, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sl.idx);
  };

  // built once: the vertices carry the distance from the spine and the shader turns it into a height, so
  // changing the arch mid-pinch costs nothing at all
  fill(slots.cover, buildCover());
  fill(slots.rim, buildRim());
  fill(slots.pages, buildPages());
  fill(slots.edges, buildEdges());
  fill(slots.leaf, buildPages([1], 24));
  fill(slots.tableFill, buildQuad(TABLE.x - TABLE_PAD, TABLE.y - TABLE_PAD, TABLE.w + 2 * TABLE_PAD, TABLE.h + 2 * TABLE_PAD));
  fill(slots.tableImg, buildQuad(TABLE.x - TABLE_PAD, TABLE.y - TABLE_PAD, TABLE.w + 2 * TABLE_PAD, TABLE.h + 2 * TABLE_PAD)); // mirrored out past the picture, so there is no edge to see

  return {
    setTexture(pixels, w, h, rect, done) { upload = { pixels, w, h, rect, row: 0, done }; },
    setOverview(pixels, w, h) { putWhole(3, over, pixels, w, h); gl.uniform1f(U.hasOver, 1); },
    setNext(pixels, w, h) { putWhole(4, next, pixels, w, h); gl.uniform1f(U.hasNext, 1); },
    commitTurn() {
      [over, next] = [next, over];
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, over.t);
      gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, next.t);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1f(U.hasOver, over.w ? 1 : 0); // what was "next" is the spread now - if it ever arrived
      gl.uniform1f(U.hasNext, 0);
      texRect = { x: -1e6, y: -1e6, w: 1, h: 1 }; // the sharp drawing shows the month just left: nothing samples it until a new one is up
    },
    pending() { return !!upload; },
    setTable(img) {
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, tableTex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      hasTable = gl.getError() === gl.NO_ERROR;
      gl.activeTexture(gl.TEXTURE0);
    },
    setLight(img, bg) {
      // the footprint (and a margin) of the photo, shrunk in two steps to a handful of texels: an average, not a sample
      const sx = img.naturalWidth / bg.w, sy = img.naturalHeight / bg.h;
      const px = (lightRect.x - bg.x) * sx, py = (lightRect.y - bg.y) * sy, pw = lightRect.w * sx, ph = lightRect.h * sy;
      const res = LIGHT_RES, resY = Math.round((res * lightRect.h) / lightRect.w);
      let cur: CanvasImageSource = img, cw = res * 16, ch = resY * 16;
      let mid = document.createElement("canvas"); mid.width = cw; mid.height = ch;
      mid.getContext("2d")!.drawImage(img, px, py, pw, ph, 0, 0, cw, ch);
      cur = mid;
      while (cw > res) { // halve step by step: one big jump would sample a few pixels, not average them all
        cw /= 2; ch /= 2;
        const next = document.createElement("canvas"); next.width = cw; next.height = ch;
        next.getContext("2d")!.drawImage(cur, 0, 0, cw, ch);
        cur = next;
      }
      const small = cur as HTMLCanvasElement;
      const c = small.getContext("2d")!;
      const d = c.getImageData(0, 0, res, resY).data;
      const sum = [0, 0, 0];
      for (let i = 0; i < d.length; i += 4) { sum[0] += d[i]; sum[1] += d[i + 1]; sum[2] += d[i + 2]; }
      // raw bytes, not the canvas itself: the plainest upload there is. And the light is only switched on once
      // the upload went through - a texture that failed to land samples as black, and that turned the whole
      // book black on the phone as soon as it tipped
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, lightTex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, res, resY, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(d.buffer));
      // An EMPTY map is the other way to a black book: the phone drew nothing of the photo (it does that with a
      // big image it has not unpacked yet), every texel is 0, and the page is multiplied by it.
      const ok = gl.getError() === gl.NO_ERROR && sum[0] + sum[1] + sum[2] > d.length;
      gl.activeTexture(gl.TEXTURE0);
      lightK = ok ? (sum.map((v) => (255 * d.length) / (4 * v)) as [number, number, number]) : null;
      if (!ok) console.error("lyskortet kunne ikke lægges ind – lyset er slået fra");
      return ok;
    },
    draw({ w, h, view, origin, tilt, arch, flat, fade, turn }) {
      if (upload) { // one slice of the next page texture, into the back texture
        const u = upload;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, back.t);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0); // getImageData is straight RGBA; converting it would cost the time we are saving
        // same size as last time: write into the texture that is there instead of making a new one (a fresh
        // 20-30 MB texture on every zoom was part of what ran the iPhone out of memory)
        if (u.row === 0 && (back.w !== u.w || back.h !== u.h)) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, u.w, u.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); back.w = u.w; back.h = u.h; }
        const rows = Math.min(u.h - u.row, Math.max(1, Math.floor(STRIP_BYTES / (u.w * 4))));
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, u.row, u.w, rows, gl.RGBA, gl.UNSIGNED_BYTE, u.pixels.subarray(u.row * u.w * 4, (u.row + rows) * u.w * 4));
        u.row += rows;
        if (u.row >= u.h) { [front, back] = [back, front]; texRect = u.rect; upload = null; u.done(); }
      }
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(prog);
      gl.uniform2f(U.view, view.x, view.y);
      gl.uniform1f(U.scale, view.s);
      gl.uniform2f(U.origin, origin[0], origin[1]);
      gl.uniform2f(U.trig, Math.cos(tilt), Math.sin(tilt));
      gl.uniform1f(U.persp, persp);
      gl.uniform2f(U.res, w, h);
      gl.uniform4f(U.tex, texRect.x, texRect.y, texRect.w, texRect.h);
      // every part of the height fades out with the tilt. At flat = 0 the page sits exactly on the plane the
      // hit-test assumes, so a tap lands in the cell it touched; leave any height in and the perspective nudges
      // the far side of the page outwards by more than a column.
      const shape = (f: number, a: number) => {
        gl.uniform4f(U.book, COVER_T * f, STACK * f, a, PAGE_W);
        gl.uniform1f(U.out, f); // the page stack folds back under the rim as the book flattens
        gl.uniform2f(U.dip, DIP * (a / ARCH), DIP_FROM);   // fades out with the curve, like everything else
      };
      gl.uniform1f(U.spine, BOOK_W / 2);
      gl.uniform3f(U.bow, BOW, BOW2, WAVE);
      gl.uniform1f(U.fold, FOLD_DARK);
      gl.uniform4f(U.lightRect, lightRect.x, lightRect.y, lightRect.w, lightRect.h);
      gl.uniform4f(U.lightAmt, lightK ? LIGHT_STRENGTH * flat : 0, ...(lightK ?? [1, 1, 1]));
      gl.uniform3f(U.tone, ...TONE);
      // Two lines must stay SHEET_SCREEN px apart, or they turn into a moire pattern. The stack stands up from
      // the board, so the tilt foreshortens it: what matters is the spacing AFTER that.
      const fore = Math.max(Math.cos(tilt), 0.35);
      const sheet = Math.max(SHEET_MIN, SHEET_SCREEN / Math.max(view.s * fore, 0.001));
      gl.uniform1f(U.sheets, sheet);
      // and if even that is too tight to resolve, fade the lines into an even tone rather than let them alias
      gl.uniform1f(U.amp, Math.max(0, Math.min(1, (sheet * view.s * fore - 1.5) / 1.6)));
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, front.t);
      const drawAll = (shadow: boolean) => {
        // board, then the page stack standing on it, then the pages on top: the board is wider than the stack,
        // so drawn later it would paint right over it. The board mesh is LIP wider than the book (its texture
        // ends there anyway), so it stays out of the shadow: painted dark it was a frame all round the flat book.
        gl.uniform4f(U.flat, 0, 0, 0, 0);
        gl.uniform4f(U.paper, 0, 0, 0, 0);
        if (!shadow) { bind(slots.cover); gl.drawElements(gl.TRIANGLES, slots.cover.n, gl.UNSIGNED_SHORT, 0); }
        gl.uniform4f(U.flat, 0.13, 0.12, 0.11, 1);
        bind(slots.rim); gl.drawElements(gl.TRIANGLES, slots.rim.n, gl.UNSIGNED_SHORT, 0);
        gl.uniform4f(U.flat, 0.95, 0.92, 0.83, 1);
        bind(slots.edges); gl.drawElements(gl.TRIANGLES, slots.edges.n, gl.UNSIGNED_SHORT, 0);
        gl.uniform4f(U.flat, 0, 0, 0, 0);
        gl.uniform4f(U.paper, 0.94, 0.91, 0.83, 1); // draw.ts' PAPER
        bind(slots.pages); gl.drawElements(gl.TRIANGLES, slots.pages.n, gl.UNSIGNED_SHORT, 0);
      };
      // the table under everything: its colour out to the padding, then the picture, both faded in as the camera
      // goes overhead. Drawn here rather than as an <img> in the page: a picture this size under a scale that
      // changes every frame had Safari on the iPhone re-rasterising it over and over, until it gave the page up.
      if (fade > 0) {
        gl.uniform1f(U.fade, fade);
        gl.uniform1f(U.table, 1); gl.uniform4f(U.flat, 0.706, 0.498, 0.318, 1); // #b47f51, the wood's own colour
        bind(slots.tableFill); gl.drawElements(gl.TRIANGLES, slots.tableFill.n, gl.UNSIGNED_SHORT, 0);
        if (hasTable) { gl.uniform1f(U.table, 2); bind(slots.tableImg); gl.drawElements(gl.TRIANGLES, slots.tableImg.n, gl.UNSIGNED_SHORT, 0); }
        gl.uniform1f(U.table, 0);
      }
      // the shadow, under the book: passes of growing length add up to a penumbra - dark at the foot, fading out.
      // Where the laid-down mesh overlaps itself a pixel darkens twice; that strip lies along the book's edge and
      // is what Lukas approved. ?skygge=0 skips it.
      const sf = Math.max(flat, SHADOW_MIN);
      shape(sf, ARCH * sf);
      const a = 1 - Math.pow(1 - SHADOW_DARK, 1 / SHADOW_PASSES);
      gl.uniform4f(U.shadowC, 0.08 * a, 0.04 * a, 0.02 * a, a);
      for (let k = 0; k < SHADOW_PASSES && SHADOW_ON; k++) {
        const len = SHADOW_LEN * (0.7 + (0.6 * k) / (SHADOW_PASSES - 1));
        gl.uniform3f(U.shadow, SHADOW_DIR[0] * len, SHADOW_DIR[1] * len, 1);
        drawAll(true);
      }
      gl.uniform4f(U.shadowC, 0, 0, 0, 0);
      gl.uniform3f(U.shadow, 0, 0, 0);
      shape(flat, arch);
      // mid-turn the page the leaf is leaving behind already shows the spread it is turning to
      gl.uniform1f(U.turnSide, turn ? turn.dir : 0);
      drawAll(false);
      if (turn && turn.p > 0 && turn.p < 1) {
        // the leaf: its shadow on the page under it first, then the sheet itself, over everything
        gl.uniform1f(U.leaf, 1);
        gl.uniform4f(U.turn, turn.dir, turn.p * Math.PI, BEND, turn.twist);
        const la = 1 - Math.pow(1 - LEAF_SHADOW_DARK, 1 / SHADOW_PASSES);
        gl.uniform4f(U.shadowC, 0.08 * la, 0.04 * la, 0.02 * la, la);
        bind(slots.leaf);
        for (let k = 0; k < SHADOW_PASSES && SHADOW_ON; k++) {
          const len = SHADOW_LEN * LEAF_SHADOW_LEN * (0.7 + (0.6 * k) / (SHADOW_PASSES - 1));
          gl.uniform3f(U.shadow, SHADOW_DIR[0] * len, SHADOW_DIR[1] * len, 1);
          gl.drawElements(gl.TRIANGLES, slots.leaf.n, gl.UNSIGNED_SHORT, 0);
        }
        gl.uniform4f(U.shadowC, 0, 0, 0, 0);
        gl.uniform3f(U.shadow, 0, 0, 0);
        gl.uniform4f(U.paper, 0.94, 0.91, 0.83, 1);
        gl.drawElements(gl.TRIANGLES, slots.leaf.n, gl.UNSIGNED_SHORT, 0);
        gl.uniform1f(U.leaf, 0);
      }
      gl.uniform1f(U.turnSide, 0);
    },
    dispose() {
      for (const sl of Object.values(slots)) for (const b of [sl.pos, sl.off, sl.meta, sl.idx]) gl.deleteBuffer(b);
      gl.deleteTexture(front.t);
      gl.deleteTexture(back.t);
      gl.deleteTexture(over.t);
      gl.deleteTexture(next.t);
      gl.deleteTexture(lightTex);
      gl.deleteTexture(tableTex);
      gl.deleteProgram(prog);
    },
  };
}
