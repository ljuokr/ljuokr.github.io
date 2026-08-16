// Baut die index.html aus allen oeffentlichen Repos mit aktiven GitHub Pages.
// Ohne Abhaengigkeiten, laeuft in der Action und lokal via `node scripts/build.mjs`.

import { readFile, writeFile } from "node:fs/promises";

const BENUTZER = "ljuokr";
const KONFIG = JSON.parse(await readFile(new URL("../kategorien.json", import.meta.url), "utf8"));

const kopf = {
  "user-agent": "tools-uebersicht-generator",
  accept: "application/vnd.github+json",
  ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
};

// --- Repos einsammeln ---------------------------------------------------

async function repos() {
  const alle = [];
  for (let seite = 1; seite <= 10; seite++) {
    const antwort = await fetch(
      `https://api.github.com/users/${BENUTZER}/repos?per_page=100&page=${seite}&sort=pushed`,
      { headers: kopf },
    );
    if (!antwort.ok) throw new Error(`GitHub-API antwortete mit ${antwort.status}`);
    const teil = await antwort.json();
    alle.push(...teil);
    if (teil.length < 100) break;
  }
  return alle.filter(
    (r) =>
      r.has_pages &&
      !r.fork &&
      !r.private &&
      !r.archived &&
      !KONFIG.ausgeschlossen.includes(r.name),
  );
}

// --- Titel und Beschreibung von der Live-Seite holen ---------------------

async function seiteLesen(url) {
  try {
    const steuerung = AbortSignal.timeout(20000);
    const antwort = await fetch(url, { signal: steuerung, redirect: "follow" });
    if (!antwort.ok) return {};
    const html = (await antwort.text()).slice(0, 200000);
    const titel = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    const text = html.match(
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
    )?.[1];
    return { titel: titel && entschluesseln(titel), text: text && entschluesseln(text) };
  } catch {
    return {};
  }
}

function entschluesseln(roh) {
  return roh
    .replace(/\s+/g, " ")
    .trim()
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

// Seitentitel enthalten oft einen angehaengten Seitennamen - der vordere Teil genuegt.
function titelKuerzen(titel) {
  return titel.split(/\s+[|–—]\s+/)[0].trim();
}

function ausNamen(name) {
  return name
    .split("-")
    .map((teil) => teil.charAt(0).toUpperCase() + teil.slice(1))
    .join(" ");
}

// --- HTML ---------------------------------------------------------------

function maskieren(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function datum(iso) {
  return new Date(iso).toLocaleDateString("de-CH", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function karte(t) {
  return `        <li class="karte">
          <a class="karte-link" href="${maskieren(t.url)}">
            <h3>${maskieren(t.titel)}</h3>
            ${t.text ? `<p>${maskieren(t.text)}</p>` : ""}
          </a>
          <p class="meta">
            <span>Aktualisiert ${datum(t.stand)}</span>
            <a href="https://github.com/${BENUTZER}/${maskieren(t.name)}">Quellcode</a>
          </p>
        </li>`;
}

function abschnitt(gruppe) {
  const id = gruppe.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `      <section class="gruppe" id="${id}" data-gruppe>
        <h2>${maskieren(gruppe.name)}</h2>
        ${gruppe.text ? `<p class="gruppe-text">${maskieren(gruppe.text)}</p>` : ""}
        <ul class="raster">
${gruppe.tools.map(karte).join("\n")}
        </ul>
      </section>`;
}

function seite(gruppen, anzahl, stand) {
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tools von Lukas Jordi</title>
<meta name="description" content="Gesammelte Browser-Werkzeuge, Karten und Unterrichtsmaterialien - alle ohne Installation direkt im Browser nutzbar.">
<meta name="color-scheme" content="light dark">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Sans+3:ital,wght@0,400;0,600;0,700;1,400&display=swap">
<style>
  :root {
    --grund: #ffffff;
    --flaeche: #f4f5f7;
    --rand: #d8dbe0;
    --schrift: #1a1d21;
    --gedaempft: #55595f;
    --akzent: #0b5d8f;
    --akzent-flaeche: #e7f0f7;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --grund: #14161a;
      --flaeche: #1d2026;
      --rand: #333841;
      --schrift: #eceef1;
      --gedaempft: #a7adb6;
      --akzent: #7cc4f0;
      --akzent-flaeche: #1b2b38;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 0 1.25rem 5rem;
    background: var(--grund);
    color: var(--schrift);
    font-family: "Source Sans 3", system-ui, -apple-system, sans-serif;
    font-size: 1.0625rem;
    line-height: 1.6;
  }
  .huelle { max-width: 60rem; margin: 0 auto; }
  header { padding: 3.5rem 0 1.5rem; }
  h1 { font-size: clamp(1.9rem, 5vw, 2.6rem); line-height: 1.15; margin: 0 0 .6rem; }
  .anriss { font-size: 1.15rem; color: var(--gedaempft); margin: 0 0 1.75rem; max-width: 44rem; }
  .suche {
    width: 100%;
    max-width: 26rem;
    padding: .65rem .9rem;
    font: inherit;
    color: inherit;
    background: var(--flaeche);
    border: 1px solid var(--rand);
    border-radius: .5rem;
  }
  .suche::placeholder { color: var(--gedaempft); }
  .gruppe { margin: 3rem 0 0; }
  .gruppe h2 { font-size: 1.4rem; margin: 0 0 .25rem; }
  .gruppe-text { color: var(--gedaempft); margin: 0 0 1.25rem; }
  .raster {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
  }
  .karte {
    display: flex;
    flex-direction: column;
    background: var(--flaeche);
    border: 1px solid var(--rand);
    border-radius: .75rem;
    overflow: hidden;
  }
  .karte-link {
    display: block;
    flex: 1;
    padding: 1.1rem 1.2rem .4rem;
    color: inherit;
    text-decoration: none;
  }
  .karte-link:hover, .karte-link:focus-visible { background: var(--akzent-flaeche); }
  .karte-link h3 {
    margin: 0 0 .35rem;
    font-size: 1.12rem;
    color: var(--akzent);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .karte-link p { margin: 0; color: var(--gedaempft); font-size: .97rem; line-height: 1.5; }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: .75rem;
    justify-content: space-between;
    margin: 0;
    padding: .6rem 1.2rem 1rem;
    font-size: .85rem;
    color: var(--gedaempft);
  }
  .meta a { color: var(--gedaempft); }
  a:focus-visible, .suche:focus-visible {
    outline: 3px solid var(--akzent);
    outline-offset: 2px;
  }
  .leer { color: var(--gedaempft); margin: 2rem 0; }
  footer {
    margin-top: 4rem;
    padding-top: 1.5rem;
    border-top: 1px solid var(--rand);
    color: var(--gedaempft);
    font-size: .92rem;
  }
  [hidden] { display: none !important; }
</style>

<div class="huelle">
  <header>
    <h1>Tools von Lukas Jordi</h1>
    <p class="anriss">Kleine Werkzeuge, Karten und Unterrichtsmaterialien - alle laufen direkt im Browser, ohne Installation und ohne Konto. Die Liste erzeugt sich selbst aus meinen ${anzahl} veröffentlichten Projekten.</p>
    <label for="suche" class="visuell-versteckt" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Tools durchsuchen</label>
    <input id="suche" class="suche" type="search" placeholder="Tools durchsuchen …" autocomplete="off">
  </header>

  <main>
${gruppen.map(abschnitt).join("\n")}
    <p class="leer" id="leer" hidden>Kein Tool passt zu dieser Suche.</p>
  </main>

  <footer>
    <p>Stand: ${datum(stand)} · Quellcode aller Projekte auf <a href="https://github.com/${BENUTZER}?tab=repositories">GitHub</a>. Die Übersicht aktualisiert sich automatisch, sobald ein Projekt dazukommt oder sich ändert.</p>
  </footer>
</div>

<script>
  const feld = document.getElementById("suche");
  const karten = [...document.querySelectorAll(".karte")];
  const gruppen = [...document.querySelectorAll("[data-gruppe]")];
  const leer = document.getElementById("leer");

  feld.addEventListener("input", () => {
    const suche = feld.value.trim().toLowerCase();
    karten.forEach((k) => {
      k.hidden = suche !== "" && !k.textContent.toLowerCase().includes(suche);
    });
    gruppen.forEach((g) => {
      g.hidden = ![...g.querySelectorAll(".karte")].some((k) => !k.hidden);
    });
    leer.hidden = gruppen.some((g) => !g.hidden);
  });
</script>
`;
}

// --- Ablauf -------------------------------------------------------------

const gefunden = await repos();

const tools = await Promise.all(
  gefunden.map(async (r) => {
    const url = /^https?:\/\//.test(r.homepage ?? "")
      ? r.homepage
      : `https://${BENUTZER}.github.io/${r.name}/`;
    const live = await seiteLesen(url);
    return {
      name: r.name,
      url,
      stand: r.pushed_at,
      titel:
        KONFIG.titel[r.name] ??
        (live.titel ? titelKuerzen(live.titel) : null) ??
        ausNamen(r.name),
      text: KONFIG.text[r.name] ?? r.description ?? live.text ?? "",
    };
  }),
);

const nachName = new Map(tools.map((t) => [t.name, t]));
const vergeben = new Set();

const gruppen = KONFIG.kategorien
  .map((k) => ({
    name: k.name,
    text: k.text,
    tools: k.repos
      .filter((n) => nachName.has(n))
      .map((n) => {
        vergeben.add(n);
        return nachName.get(n);
      }),
  }))
  .filter((g) => g.tools.length > 0);

const uebrig = tools
  .filter((t) => !vergeben.has(t.name))
  .sort((a, b) => b.stand.localeCompare(a.stand));

if (uebrig.length > 0) {
  gruppen.push({
    name: "Neu dazugekommen",
    text: "Noch keiner Kategorie zugeordnet - Zuordnung in kategorien.json ergänzen.",
    tools: uebrig,
  });
}

// Stand ist das neueste Push-Datum, nicht die Laufzeit - so bleibt die Ausgabe
// bei unveraenderten Projekten byte-identisch und die Action committet nichts.
const stand = tools.reduce((a, t) => (t.stand > a ? t.stand : a), tools[0].stand);

await writeFile(new URL("../index.html", import.meta.url), seite(gruppen, tools.length, stand));

console.log(`${tools.length} Tools in ${gruppen.length} Kategorien geschrieben.`);
for (const g of gruppen) console.log(`  ${g.name}: ${g.tools.map((t) => t.name).join(", ")}`);
