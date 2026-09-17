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
export const STACK = 40;
/** How high the page arches above the straight line from fold to fore-edge, and where that arch peaks. */
export const ARCH = 54;
const BOW = 0.7; // s^BOW inside the sine: < 1 moves the top of the arch towards the spine
/** The cover sticks out past the pages by this much. */
const LIP = 10;

const SEG_X = 56, SEG_Y = 10; // segments per page: across the curve, and along it

/** Height of the page surface above the table, at distance `s` (0 at the spine, 1 at the fore-edge). */
export const pageZ = (s: number, arch: number) =>
  COVER_T + STACK * s + arch * Math.sin(Math.PI * Math.pow(Math.max(0, Math.min(1, s)), BOW));

const VERT = `
attribute vec3 a_pos;      // x, y in spread coordinates; z in world px (already curved)
attribute vec2 a_uv;       // 0..1 over the spread
attribute float a_shade;   // 1 = full light, lower = in shadow
uniform vec2 u_view;       // where the spread's origin sits on screen
uniform float u_scale;     // world px -> screen px
uniform vec2 u_origin;     // the book's centre on screen: the tilt turns about it, as the CSS transform-origin did
uniform vec2 u_trig;       // cos, sin of the tilt
uniform float u_persp;     // perspective distance in screen px
uniform vec2 u_res;        // canvas size in px
uniform vec4 u_tex;        // the part of the spread the texture covers: x, y, w, h in spread coordinates
varying vec2 v_uv;
varying float v_shade;
void main() {
  vec2 flat_px = u_view + a_pos.xy * u_scale;
  float h = a_pos.z * u_scale;
  vec2 d = flat_px - u_origin;
  float ry = d.y * u_trig.x - h * u_trig.y;
  float rz = d.y * u_trig.y + h * u_trig.x;
  float k = u_persp / max(u_persp - rz, 1.0);
  vec2 sp = u_origin + vec2(d.x * k, ry * k);
  gl_Position = vec4((sp / u_res) * 2.0 - 1.0, 0.0, 1.0);
  gl_Position.y = -gl_Position.y;
  v_uv = (a_pos.xy - u_tex.xy) / u_tex.zw;
  v_shade = a_shade;
}`;

const FRAG = `
precision mediump float;
varying vec2 v_uv;
varying float v_shade;
uniform sampler2D u_img;
uniform vec4 u_flat;       // when a > 0: ignore the texture and use this colour (the page stack)
void main() {
  // zoomed in, the texture holds only the visible slice of the spread; the rest of the mesh is off screen anyway
  if (u_flat.a <= 0.0 && (v_uv.x < 0.0 || v_uv.x > 1.0 || v_uv.y < 0.0 || v_uv.y > 1.0)) discard;
  vec4 c = u_flat.a > 0.0 ? vec4(u_flat.rgb, 1.0) : texture2D(u_img, v_uv);
  if (c.a < 0.01) discard;
  gl_FragColor = vec4(c.rgb * v_shade, c.a);
}`;

type Mesh = { pos: Float32Array; shade: Float32Array; idx: Uint16Array; n: number };

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src); gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? "shader");
  return sh;
}

/**
 * Build the whole book for one arch height. Rebuilt whenever the arch changes, which is cheap: a few thousand
 * numbers, and only when the camera actually tips.
 */
function build(arch: number): Mesh {
  const pos: number[] = [], shade: number[] = [], idx: number[] = [];
  const push = (x: number, y: number, z: number, sh: number) => { pos.push(x, y, z); shade.push(sh); return pos.length / 3 - 1; };
  const quad = (a: number, b: number, c: number, d: number) => idx.push(a, b, c, a, c, d);

  // the cover board, a little larger than the pages, lying flat
  const c0 = push(-LIP, -LIP, COVER_T, 1);
  const c1 = push(BOOK_W + LIP, -LIP, COVER_T, 1);
  const c2 = push(BOOK_W + LIP, BOOK_H + LIP, COVER_T, 1);
  const c3 = push(-LIP, BOOK_H + LIP, COVER_T, 1);
  quad(c0, c1, c2, c3);

  const top = COVER, bot = COVER + PAGE_H, spine = BOOK_W / 2;
  // light: the window is behind the book, so the slope facing away from the viewer catches it and the fold is dark
  const lightAt = (s: number, dir: number) => {
    const slope = (pageZ(s + 0.01, arch) - pageZ(s - 0.01, arch)) / (0.02 * PAGE_W);
    const facing = -dir * slope;                     // > 0 when the surface tilts away from the viewer
    const fold = 1 - Math.min(1, s * 6);             // the last bit into the fold, where little light reaches
    return Math.max(0.52, Math.min(1.06, 1.0 + facing * 0.55 - fold * fold * 0.46));
  };

  for (const dir of [-1, 1]) {                        // left page, then right
    const grid: number[][] = [];
    for (let i = 0; i <= SEG_X; i++) {
      const s = i / SEG_X;
      const x = spine + dir * s * PAGE_W;
      const z = pageZ(s, arch);
      const sh = lightAt(s, dir);
      const col: number[] = [];
      for (let j = 0; j <= SEG_Y; j++) col.push(push(x, top + ((bot - top) * j) / SEG_Y, z, sh));
      grid.push(col);
    }
    for (let i = 0; i < SEG_X; i++)
      for (let j = 0; j < SEG_Y; j++)
        quad(grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]);
  }
  return { pos: new Float32Array(pos), shade: new Float32Array(shade), idx: new Uint16Array(idx), n: idx.length };
}

/** The page stack: a skirt from each sheet's rim down to the board, in its own colour (no page content on it). */
function buildEdges(arch: number): Mesh {
  const pos: number[] = [], shade: number[] = [], idx: number[] = [];
  const push = (x: number, y: number, z: number, sh: number) => { pos.push(x, y, z); shade.push(sh); return pos.length / 3 - 1; };
  const quad = (a: number, b: number, c: number, d: number) => idx.push(a, b, c, a, c, d);
  const top = COVER, bot = COVER + PAGE_H, spine = BOOK_W / 2;

  for (const dir of [-1, 1]) {
    const xo = spine + dir * PAGE_W;                  // the fore-edge
    const zo = pageZ(1, arch);
    // fore-edge: straight down to the board
    const a = push(xo, top, zo, 1.0), b = push(xo, bot, zo, 0.98);
    const c = push(xo, bot, COVER_T, 0.72), d = push(xo, top, COVER_T, 0.76);
    quad(a, b, c, d);
    // the long edges, top and bottom: they follow the curve, so one quad per segment
    for (const [y, sh] of [[top, 0.7], [bot, 1.0]] as const) {
      for (let i = 0; i < SEG_X; i++) {
        const s0 = i / SEG_X, s1 = (i + 1) / SEG_X;
        const x0 = spine + dir * s0 * PAGE_W, x1 = spine + dir * s1 * PAGE_W;
        const p0 = push(x0, y, pageZ(s0, arch), sh), p1 = push(x1, y, pageZ(s1, arch), sh);
        const p2 = push(x1, y, COVER_T, sh * 0.78), p3 = push(x0, y, COVER_T, sh * 0.78);
        quad(p0, p1, p2, p3);
      }
    }
  }
  return { pos: new Float32Array(pos), shade: new Float32Array(shade), idx: new Uint16Array(idx), n: idx.length };
}

export type Book3D = {
  /** Upload the flat spread canvas as the page texture. `rect` is the part of the spread it covers. */
  setTexture(src: HTMLCanvasElement, rect: { x: number; y: number; w: number; h: number }): void;
  /** Draw one frame. `arch` 0 = flat. */
  draw(o: { w: number; h: number; view: { x: number; y: number; s: number }; origin: [number, number]; tilt: number; arch: number }): void;
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
  };
  const aPos = gl.getAttribLocation(prog, "a_pos"), aShade = gl.getAttribLocation(prog, "a_shade");
  /** One set of buffers per mesh, so a frame that changes nothing only binds them. Re-uploading both meshes
   *  every frame cost ~45 ms on roughly every ninth frame of a pinch. */
  const slot = () => ({ pos: gl.createBuffer()!, shade: gl.createBuffer()!, idx: gl.createBuffer()!, n: 0 });
  const slots = { pages: slot(), edges: slot() };
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE);
  for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.LINEAR);
  gl.uniform1i(U.img, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  let texRect = { x: 0, y: 0, w: BOOK_W, h: BOOK_H };
  let builtFor = -1;

  const fill = (sl: typeof slots.pages, m: Mesh) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, sl.pos); gl.bufferData(gl.ARRAY_BUFFER, m.pos, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, sl.shade); gl.bufferData(gl.ARRAY_BUFFER, m.shade, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sl.idx); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.idx, gl.DYNAMIC_DRAW);
    sl.n = m.n;
  };
  const bind = (sl: typeof slots.pages) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, sl.pos);
    gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, sl.shade);
    gl.enableVertexAttribArray(aShade); gl.vertexAttribPointer(aShade, 1, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sl.idx);
  };

  return {
    setTexture(src, rect) {
      texRect = rect;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    },
    draw({ w, h, view, origin, tilt, arch }) {
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (arch !== builtFor) { fill(slots.pages, build(arch)); fill(slots.edges, buildEdges(arch)); builtFor = arch; }
      gl.useProgram(prog);
      gl.uniform2f(U.view, view.x, view.y);
      gl.uniform1f(U.scale, view.s);
      gl.uniform2f(U.origin, origin[0], origin[1]);
      gl.uniform2f(U.trig, Math.cos(tilt), Math.sin(tilt));
      gl.uniform1f(U.persp, persp);
      gl.uniform2f(U.res, w, h);
      gl.uniform4f(U.tex, texRect.x, texRect.y, texRect.w, texRect.h);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      // the stack first: the pages sit on top of it
      gl.uniform4f(U.flat, 0.93, 0.90, 0.80, 1);
      bind(slots.edges); gl.drawElements(gl.TRIANGLES, slots.edges.n, gl.UNSIGNED_SHORT, 0);
      gl.uniform4f(U.flat, 0, 0, 0, 0);
      bind(slots.pages); gl.drawElements(gl.TRIANGLES, slots.pages.n, gl.UNSIGNED_SHORT, 0);
    },
    dispose() {
      for (const sl of [slots.pages, slots.edges]) for (const b of [sl.pos, sl.shade, sl.idx]) gl.deleteBuffer(b);
      gl.deleteTexture(tex);
      gl.deleteProgram(prog);
    },
  };
}
