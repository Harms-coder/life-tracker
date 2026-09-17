import { BOOK_H, BOOK_W, COVER, PAGE_H, PAGE_W } from "./layout";

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
export const COVER_T = 7;
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
const DIP = Math.max(0, Math.min(DIP_MAX, Number(new URLSearchParams(location.search).get("dip") ?? 3)));
const DIP_FROM = 0.84;
/** The cover sticks out past the pages by this much. It has to clear OVERHANG, or the page stack rolls out over
 *  the board and the thin dark rim around the book disappears. */
const LIP = 30;
/** How far the foot of the page stack stands out past the page above it, and in how many steps it rolls over.
 *  A real book's stack is not a vertical wall: it curves out of the page's rim and then down, so the top of it
 *  faces upwards and you see the sheet ends even along the sides, where a flat wall is edge on to the camera. */
const OVERHANG = 20;
const ROLL = 5;

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
varying vec2 v_uv;
varying float v_shade;
varying float v_layer;

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

void main() {
  float s = a_pos.z;
  float z = mix(u_book.x, pageZ(s), a_meta.x);  // a_meta.x slides 1..0 as the stack rolls over to the board
  if (a_meta.y > 0.0) {
    v_shade = a_meta.y;
  } else {
    // the window is behind the book, so a slope facing away from the viewer catches the light and the fold is dark
    float slope = (pageZ(s + 0.01) - pageZ(s - 0.01)) / (0.02 * u_book.w);
    float dir = a_pos.x < u_spine ? -1.0 : 1.0;
    float fold = 1.0 - min(1.0, s * 6.0);
    v_shade = clamp(1.0 + (-dir * slope) * 0.55 - fold * fold * u_foldDark, 0.6, 1.06);
  }
  // the sheets have a real thickness, so the lines must keep their spacing all the way along the skirt: carry
  // the distance DOWN from the page rim, in world px, not a 0..1 share of a skirt that thins out at the fold
  v_layer = a_meta.z * (pageZ(s) - u_book.x);
  vec2 flat_px = u_view + a_pos.xy * u_scale;
  float h = z * u_scale;
  vec2 d = flat_px - u_origin;
  float ry = d.y * u_trig.x - h * u_trig.y;
  float rz = d.y * u_trig.y + h * u_trig.x;
  float k = u_persp / max(u_persp - rz, 1.0);
  vec2 sp = u_origin + vec2(d.x * k, ry * k);
  gl_Position = vec4((sp / u_res) * 2.0 - 1.0, 0.0, 1.0);
  gl_Position.y = -gl_Position.y;
  v_uv = (a_pos.xy - u_tex.xy) / u_tex.zw;
}`;

const FRAG = `
precision mediump float;
varying vec2 v_uv;
varying float v_shade;
varying float v_layer;
uniform sampler2D u_img;
uniform vec4 u_flat;       // when a > 0: ignore the texture and use this colour (the page stack)
uniform float u_sheets;    // one sheet every this many world px, widened when zoomed out so the lines never alias
uniform float u_sheetAmp;  // fades the lines out when they get too close to resolve, leaving an even tone
void main() {
  // zoomed in, the texture holds only the visible slice of the spread; the rest of the mesh is off screen anyway
  if (u_flat.a <= 0.0 && (v_uv.x < 0.0 || v_uv.x > 1.0 || v_uv.y < 0.0 || v_uv.y > 1.0)) discard;
  if (u_flat.a > 0.0) {
    // the page stack seen edge on: sheet after sheet lying on each other, never the page's own grid
    float ph = fract(v_layer / u_sheets);
    float line = pow(0.5 + 0.5 * cos(ph * 6.2831853), 7.0);
    float sheet = 1.0 - 0.34 * u_sheetAmp * line;
    gl_FragColor = vec4(u_flat.rgb * v_shade * sheet, 1.0);
    return;
  }
  vec4 c = texture2D(u_img, v_uv);
  if (c.a < 0.01) discard;
  gl_FragColor = vec4(c.rgb * v_shade, c.a);
}`;

type Mesh = { pos: Float32Array; meta: Float32Array; idx: Uint16Array; n: number };

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
  return { pos: new Float32Array(pos), meta: new Float32Array(meta), idx: new Uint16Array(idx), n: 6 };
}

function buildPages(): Mesh {
  const pos: number[] = [], meta: number[] = [], idx: number[] = [];
  const push = (x: number, y: number, s: number, curve: number, shade: number) => {
    pos.push(x, y, s); meta.push(curve, shade, 0); return pos.length / 3 - 1;
  };
  const quad = (a: number, b: number, c: number, d: number) => idx.push(a, b, c, a, c, d);
  const top = COVER, bot = COVER + PAGE_H, spine = BOOK_W / 2;
  for (const dir of [-1, 1]) {
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
  return { pos: new Float32Array(pos), meta: new Float32Array(meta), idx: new Uint16Array(idx), n: idx.length };
}

/** The page stack: a skirt from each sheet's rim down to the board. `layer` runs 0..1 across it, which is what
 *  draws the individual sheets in the fragment shader. */
function buildEdges(): Mesh {
  const pos: number[] = [], meta: number[] = [], idx: number[] = [];
  const push = (x: number, y: number, s: number, curve: number, shade: number, layer: number) => {
    pos.push(x, y, s); meta.push(curve, shade, layer); return pos.length / 3 - 1;
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
      const xa = xo + dir * OVERHANG * out(t0), xb = xo + dir * OVERHANG * out(t1);
      quad(push(xa, top, 1, 1 - drop(t0), lit(t0), drop(t0)), push(xa, bot, 1, 1 - drop(t0), lit(t0) * 0.98, drop(t0)),
           push(xb, bot, 1, 1 - drop(t1), lit(t1) * 0.98, drop(t1)), push(xb, top, 1, 1 - drop(t1), lit(t1), drop(t1)));
    }
    // the long edges, top and bottom: they follow the curve along the page, and roll over the same way
    for (const [y, sh, sgn] of [[top, 0.9, -1], [bot, 1.06, 1]] as const) {
      for (let i = 0; i < SEG_X; i++) {
        const s0 = i / SEG_X, s1 = (i + 1) / SEG_X;
        const x0 = spine + dir * s0 * PAGE_W, x1 = spine + dir * s1 * PAGE_W;
        for (let k = 0; k < ROLL; k++) {
          const t0 = k / ROLL, t1 = (k + 1) / ROLL;
          // the roll grows with the stack, so the skirt closes to nothing at the fold instead of flaring there
          const ya = y + sgn * OVERHANG * out(t0), yb = y + sgn * OVERHANG * out(t1);
          quad(push(x0, y + (ya - y) * s0, s0, 1 - drop(t0), sh * lit(t0), drop(t0)),
               push(x1, y + (ya - y) * s1, s1, 1 - drop(t0), sh * lit(t0), drop(t0)),
               push(x1, y + (yb - y) * s1, s1, 1 - drop(t1), sh * lit(t1), drop(t1)),
               push(x0, y + (yb - y) * s0, s0, 1 - drop(t1), sh * lit(t1), drop(t1)));
        }
      }
    }
  }
  return { pos: new Float32Array(pos), meta: new Float32Array(meta), idx: new Uint16Array(idx), n: idx.length };
}

export type Book3D = {
  /** Upload the flat spread canvas as the page texture. `rect` is the part of the spread it covers. */
  setTexture(src: HTMLCanvasElement, rect: { x: number; y: number; w: number; h: number }): void;
  /** Draw one frame. `arch` 0 = flat. */
  draw(o: { w: number; h: number; view: { x: number; y: number; s: number }; origin: [number, number]; tilt: number; arch: number; flat: number }): void;
  dispose(): void;
};

export function createBook3D(canvas: HTMLCanvasElement, persp: number): Book3D | null {
  const gl = (canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: true }) ??
              canvas.getContext("experimental-webgl", { alpha: true, antialias: true })) as WebGLRenderingContext | null;
  if (!gl) return null;

  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  const loc = (n: string) => gl.getUniformLocation(prog, n);
  const U = {
    view: loc("u_view"), scale: loc("u_scale"), origin: loc("u_origin"), trig: loc("u_trig"),
    persp: loc("u_persp"), res: loc("u_res"), tex: loc("u_tex"), flat: loc("u_flat"), img: loc("u_img"),
    book: loc("u_book"), spine: loc("u_spine"), fold: loc("u_foldDark"), sheets: loc("u_sheets"),
    bow: loc("u_bow"), dip: loc("u_dip"), amp: loc("u_sheetAmp"),
  };
  const aPos = gl.getAttribLocation(prog, "a_pos"), aMeta = gl.getAttribLocation(prog, "a_meta");
  /** One set of buffers per mesh, so a frame that changes nothing only binds them. Re-uploading both meshes
   *  every frame cost ~45 ms on roughly every ninth frame of a pinch. */
  const slot = () => ({ pos: gl.createBuffer()!, meta: gl.createBuffer()!, idx: gl.createBuffer()!, n: 0 });
  const slots = { cover: slot(), pages: slot(), edges: slot() };
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE);
  for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.LINEAR);
  gl.uniform1i(U.img, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  let texRect = { x: 0, y: 0, w: BOOK_W, h: BOOK_H };


  const fill = (sl: typeof slots.pages, m: Mesh) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, sl.pos); gl.bufferData(gl.ARRAY_BUFFER, m.pos, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, sl.meta); gl.bufferData(gl.ARRAY_BUFFER, m.meta, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sl.idx); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.idx, gl.STATIC_DRAW);
    sl.n = m.n;
  };
  const bind = (sl: typeof slots.pages) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, sl.pos);
    gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, sl.meta);
    gl.enableVertexAttribArray(aMeta); gl.vertexAttribPointer(aMeta, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sl.idx);
  };

  // built once: the vertices carry the distance from the spine and the shader turns it into a height, so
  // changing the arch mid-pinch costs nothing at all
  fill(slots.cover, buildCover());
  fill(slots.pages, buildPages());
  fill(slots.edges, buildEdges());

  return {
    setTexture(src, rect) {
      texRect = rect;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    },
    draw({ w, h, view, origin, tilt, arch, flat }) {
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
      gl.uniform4f(U.book, COVER_T * flat, STACK * flat, arch, PAGE_W);
      gl.uniform1f(U.spine, BOOK_W / 2);
      gl.uniform3f(U.bow, BOW, BOW2, WAVE);
      gl.uniform2f(U.dip, DIP * (arch / ARCH), DIP_FROM);   // fades out with the curve, like everything else
      gl.uniform1f(U.fold, FOLD_DARK);
      // Two lines must stay SHEET_SCREEN px apart, or they turn into a moire pattern. The stack stands up from
      // the board, so the tilt foreshortens it: what matters is the spacing AFTER that.
      const fore = Math.max(Math.cos(tilt), 0.35);
      const sheet = Math.max(SHEET_MIN, SHEET_SCREEN / Math.max(view.s * fore, 0.001));
      gl.uniform1f(U.sheets, sheet);
      // and if even that is too tight to resolve, fade the lines into an even tone rather than let them alias
      gl.uniform1f(U.amp, Math.max(0, Math.min(1, (sheet * view.s * fore - 1.5) / 1.6)));
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      // board, then the page stack standing on it, then the pages on top: the board is wider than the stack,
      // so drawn later it would paint right over it
      gl.uniform4f(U.flat, 0, 0, 0, 0);
      bind(slots.cover); gl.drawElements(gl.TRIANGLES, slots.cover.n, gl.UNSIGNED_SHORT, 0);
      gl.uniform4f(U.flat, 0.95, 0.92, 0.83, 1);
      bind(slots.edges); gl.drawElements(gl.TRIANGLES, slots.edges.n, gl.UNSIGNED_SHORT, 0);
      gl.uniform4f(U.flat, 0, 0, 0, 0);
      bind(slots.pages); gl.drawElements(gl.TRIANGLES, slots.pages.n, gl.UNSIGNED_SHORT, 0);
    },
    dispose() {
      for (const sl of [slots.cover, slots.pages, slots.edges]) for (const b of [sl.pos, sl.meta, sl.idx]) gl.deleteBuffer(b);
      gl.deleteTexture(tex);
      gl.deleteProgram(prog);
    },
  };
}
