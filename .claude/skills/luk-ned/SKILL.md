---
name: luk-ned
description: >-
  Afslut en arbejdssession på Life Tracker: skriv statusblokken i CLAUDE.md
  i husets format, kryds af i roadmap, commit og push, og giv Lukas
  galleri-linket. Brug denne skill når Lukas skriver "luk ned", "luk
  sessionen", "skriv status", "vi er færdige for i dag", eller beder om at
  få dagens arbejde skrevet ned. BRUG DEN OGSÅ PROAKTIVT — som et tilbud,
  ikke som en handling — når Lukas signalerer at dagen er slut uden at
  bede om noget: "nu stopper vi for i dag", "det var det", "jeg går i
  seng", "vi tager den i morgen", "godnat", "tak for i dag", eller når en
  lang arbejdstråd tydeligt er ved at ebbe ud efter en godkendelse. Brug
  IKKE ved "stop", "vent" eller "vi stopper med det her" midt i en opgave
  (det handler om opgaven, ikke om dagen), og ikke når Lukas kun beder om
  en commit eller et push af én rettelse.
---

# Luk ned

Lukas' hukommelse mellem sessioner ER `CLAUDE.md`. Bliver en session lukket uden
statusblok, forsvinder det, der kostede mest: hvilke rettelser han **ikke** har set
på telefonen endnu, og hvilke faldgruber der kostede runder. Næste session begynder
så med at gentage fejl, filen allerede kendte. Det er hele grunden til, at denne
skill findes.

## Kernereglen: sig det, gør det ikke

| Han siger | Du gør |
|---|---|
| "luk ned", "skriv status" | Kør hele arbejdsgangen |
| "nu stopper vi for i dag", "jeg går i seng" | **Spørg først:** én linje, "Skal jeg lukke ned? (status + commit + push, ca. 2 min)" |

Grunden til forskellen: han beslutter selv, hvornår noget er færdigt. Et uopfordret
push af en statusblok, mens han stadig tænker, er svært at rulle tilbage — og han
har flere gange skåret ting væk igen dagen efter. Spørg, og gør det så på ét ord.

Spørg **én gang**. Svarer han ikke på det, så lad det ligge; gentag det ikke senere
i samme session.

## Arbejdsgang

1. **Tjek træet:** `git status`. Er der ikke-committet arbejde, hører det med i
   statusblokken — ellers beskriver blokken noget, der ikke findes på main.
2. **Skriv statusblokken** i `CLAUDE.md`, indsat **lige før den første eksisterende
   `## Status`-linje** (altså under `## Reference`). Nyeste øverst; sådan læser han filen.
3. **Kryds af i roadmap** nederst i filen: overstreg punktet og sæt `✅ <dato>` på.
   Kun hvis Lukas har godkendt det — "lavet, ikke set af Lukas" er ikke færdigt.
4. **Generelle læresætninger hører ikke til her.** Er en lære uafhængig af Life
   Tracker (mobil/PWA, swipe, designsystem, hvordan jeg verificerer med billeder),
   skal den i `~/.claude/playbook/` i én fil pr. emne. Kun det projektspecifikke
   bliver i `CLAUDE.md`.
5. **Commit og push til main.** Commit-beskeder i dette repo er **dansk uden æøå**
   (`maal`, `loeftet`, `aendret`) — resten af historikken er ASCII, og en enkelt
   æøå-besked stikker ud i loggen. Afslut med den attributionslinje, sessionen
   foreskriver.
6. **Galleri, hvis der er nye billeder:** `python3 tools/gallery.py '[["fil.png","Titel","Tekst"]]' "Indledning"`
   og publicér som Artifact på den SAMME url hver gang
   (https://claude.ai/artifact/S914mdZ2Tq4gAuqWUrxLYb — `read` den først, derefter
   `publish` med `url`). En ny url betyder, at han skal lede efter linket på telefonen.
7. **Afslut i chatten** med to linjer: hvad der er pushet, og hvad han skal kigge på
   på telefonen.

## Formatet på statusblokken

Brug denne struktur ordret:

```markdown
## Status <ÅÅÅÅ-MM-DD> kl. <TT.MM> – SESSIONEN LUKKET NED, ALT ER PUSHET

**Live:** https://harms-coder.github.io/life-tracker/ · **Galleri:** <galleri-url>
Arbejdstræet er rent. Alt nedenfor er pushet til main.

### Det blev lavet i aften (nyeste først)
1. <kort linje pr. ting – hvad det betyder, ikke hvordan det er bygget>
2. ...

### FØRSTE SKRIDT NÆSTE GANG
- **Bed om Lukas' dom på telefonen** på: <det han ikke har set endnu>
- <åbne spørgsmål, knapper at prøve hvis noget stadig driller>
- Åbent fra roadmap: <trin>

### LÆRT I AFTEN – LÆS DET FØR DU RETTER NOGET VISUELT
1. **<læren i fed>** <hvad der skete, og hvad man gør i stedet>
```

Regler for indholdet:

- **"FØRSTE SKRIDT NÆSTE GANG" er den vigtigste sektion.** Den skal navngive alt,
  Lukas endnu ikke har set på sin telefon, med ordet **UBEKRÆFTET** eller **IKKE SET
  AF LUKAS**. Chrome er ikke en iPhone, og over halvdelen af fejlene i dette projekt
  har kun kunnet ses på telefonen.
- **"LÆRT I AFTEN" skrives kun, når der faktisk blev lært noget,** typisk når en
  rettelse tog mere end én runde. En sektion med selvfølgeligheder gør filen længere
  uden at gøre den klogere. Ingen læresætninger = udelad sektionen.
- **Skriv, hvad ting betyder for Lukas,** ikke hvordan de er bygget. Han er ikke
  professionel udvikler. "Pennen skriver kun det, du har ændret" – ikke "diffLines
  parrer afsnit og beregner prefixLen".
- **Skriv forkastede forsøg ned.** Blev noget prøvet og fjernet igen, skal det stå
  med et "BYG DET IKKE IGEN uden at han beder om det". Det er allerede sket to gange.

## Kalibrering

**For sjældent** er værre end for tit. Bliver sessionen lukket uden status, går en
hel aftens viden tabt, og næste session starter forfra. Et tilbud, der bliver sagt
nej til, koster én linje.

**For tit** ser sådan ud: du tilbyder at lukke ned, hver gang han siger "godt" eller
"fint", eller midt i en runde, hvor han stadig venter på et billede. Tilbyd, når
retningen er slut — ikke når en enkelt rettelse er.

**Aldrig uopfordret push.** Spørg, vent, gør.

## Spørgsmålet om en generel udgave

Lukas har bedt om at blive mindet om, om denne skill skal laves i en generel udgave
til hans andre projekter (Vigorra/træningsappen). Rejs det **højst én gang pr.
session**, og kun når nedlukningen er gået glat — ikke når der er noget, der driller.

Min vurdering, som den er nu: **vent.** Formatet her er formet af et projekt, hvor
alt bedømmes visuelt på en telefon. Vigorra er en anden slags app, og en generel
udgave, der er gættet ud fra ét projekt, bliver enten så tom, at den intet siger,
eller så specifik, at den passer forkert. Er der to projekter, der lukker ned på
samme måde, kan man se hvad der faktisk er fælles. Sig det sådan — og sig det kort.

## Eksempel

**Lukas skriver:** "okay det ser godt ud på telefonen nu, den der bladring. jeg tror
jeg stopper for i dag, er træt"

**Du svarer (ikke mere end det):**

> Skal jeg lukke ned? Status i CLAUDE.md + commit + push, ca. 2 min.

**Han svarer "ja":** kør arbejdsgangen. Statusblokken skal fange, at bladringen er
GODKENDT på telefonen (det er en dom, næste session ellers ikke kender), at input-fladerne
stadig er UBEKRÆFTET, og — hvis det tog flere runder at finde blinket — hvad der var
den egentlige årsag, så det ikke skal findes igen.
