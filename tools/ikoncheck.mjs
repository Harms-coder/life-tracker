// The home-screen icon and the manifest: are they actually served, and is the icon a full square (iOS rounds
// the corners itself, so drawn-in rounded corners would be rounded twice). node tools/ikoncheck.mjs
import { chromium } from "playwright";
import { withServer, URL } from "./server.mjs";

await withServer(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(URL);
  const out = await page.evaluate(async () => {
    const href = (sel) => document.querySelector(sel)?.getAttribute("href");
    const links = { apple: href('link[rel="apple-touch-icon"]'), manifest: href('link[rel="manifest"]'), theme: document.querySelector('meta[name="theme-color"]')?.content };
    const codes = {};
    for (const [k, u] of Object.entries({ apple: links.apple, manifest: links.manifest })) codes[k] = u ? (await fetch(u)).status : 0;
    const mf = await (await fetch(links.manifest)).json();
    const icons = {};
    for (const i of mf.icons) icons[i.src] = (await fetch(i.src)).status;
    // the icon's four corners must be the paper colour, not white or transparent
    const corners = await new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.width; c.height = img.height;
        const g = c.getContext("2d");
        g.drawImage(img, 0, 0);
        const at = (x, y) => [...g.getImageData(x, y, 1, 1).data];
        res({ size: [img.width, img.height], tl: at(1, 1), tr: at(img.width - 2, 1), bl: at(1, img.height - 2), br: at(img.width - 2, img.height - 2) });
      };
      img.src = links.apple;
    });
    return { links, codes, icons, corners, standalone: document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.content };
  });
  console.log(JSON.stringify(out, null, 2));
  const c = out.corners;
  const square = [c.tl, c.tr, c.bl, c.br].every((p) => p[3] === 255 && p[0] > 230 && p[0] - p[2] >= 8); // opaque, and the warm paper
  const ok = out.codes.apple === 200 && out.codes.manifest === 200 && Object.values(out.icons).every((s) => s === 200) && square && out.standalone === "yes";
  console.log(ok ? "\nOK: ikonet er en fuld firkant i papirfarven, alle filer svarer, og appen aabner i fuld skaerm" : "\nFEJL");
  await browser.close();
  if (!ok) process.exitCode = 1;
});
