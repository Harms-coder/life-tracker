"""Builds screenshots/galleri.html with the given screenshots embedded, for publishing as an Artifact
(Lukas opens it on the phone). Usage:
  python3 tools/gallery.py '[["1-opslag.png","Titel","Undertekst"], ...]' "Indledning"
"""
import base64, sys, json
spec=json.loads(sys.argv[1]); lead=sys.argv[2] if len(sys.argv) > 2 else "Seneste skærmbilleder fra appen."
def uri(f): return "data:image/png;base64,"+base64.b64encode(open("screenshots/"+f,"rb").read()).decode()
cards="".join(f'<figure><figcaption><b>{t}</b><span>{d}</span></figcaption><img src="{uri(f)}" alt="{t}" loading="lazy"></figure>' for f,t,d in spec)
html=f'''<title>Månedsbog skærmbilleder</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Caveat:wght@500&display=swap">
<style>
:root {{ --paper:#efe9d4; --ink:#1e2233; --muted:#5a5d6b; --grid:rgba(120,150,130,.3); --card:#fffdf6; color-scheme: light; }}
body {{ margin:0; padding-block:24px; padding-inline:16px; background:var(--paper); color:var(--ink);
  font-family:-apple-system,system-ui,"Segoe UI",sans-serif; font-size:16px; line-height:1.45;
  background-image:linear-gradient(to right,var(--grid) 1px,transparent 1px),linear-gradient(to bottom,var(--grid) 1px,transparent 1px); background-size:20px 20px; }}
main {{ max-width:720px; margin:0 auto; display:grid; gap:28px; }}
h1 {{ font-family:Caveat,"Bradley Hand",cursive; font-weight:500; font-size:44px; margin:0; line-height:1; }}
p.lead {{ margin:6px 0 0; color:var(--muted); max-width:60ch; }}
figure {{ margin:0; background:var(--card); border:1px solid rgba(30,34,51,.15); padding:14px; display:grid; gap:10px; }}
figcaption {{ display:grid; gap:2px; }}
figcaption b {{ font-family:Caveat,cursive; font-weight:500; font-size:26px; line-height:1; }}
figcaption span {{ color:var(--muted); font-size:15px; }}
img {{ width:100%; height:auto; display:block; border:1px solid rgba(30,34,51,.1); }}
</style>
<main><header><h1>Månedsbog · 16. september</h1><p class="lead">{lead}</p></header>{cards}</main>'''
open("screenshots/galleri.html","w").write(html); print("screenshots/galleri.html")
