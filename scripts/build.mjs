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

// Beschreibungen sind nur Beiwerk - lange Repo-Texte wuerden die Liste sprengen.
function kuerzen(text, grenze = 90) {
  if (text.length <= grenze) return text;
  const schnitt = text.slice(0, grenze);
  return schnitt.slice(0, schnitt.lastIndexOf(" ")) + " …";
}

function zeile(t) {
  return `          <li><a href="${maskieren(t.url)}">${maskieren(t.titel)}</a>${
    t.text ? ` <span>${maskieren(kuerzen(t.text))}</span>` : ""
  }</li>`;
}

function abschnitt(gruppe) {
  return `      <section data-gruppe>
        <h2>${maskieren(gruppe.name)}</h2>
        <ul>
${gruppe.tools.map(zeile).join("\n")}
        </ul>
      </section>`;
}

function seite(gruppen, stand) {
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tools</title>
<meta name="robots" content="noindex">
<meta name="color-scheme" content="light dark">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400&display=swap">
<style>
  :root {
    --grund: #ffffff;
    --rand: #e2e4e8;
    --schrift: #22262b;
    --gedaempft: #62666d;
    --akzent: #0b5d8f;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --grund: #15171b;
      --rand: #2c3038;
      --schrift: #e6e8eb;
      --gedaempft: #9ba1a9;
      --akzent: #79c1ef;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0 auto;
    padding: 2.5rem 1.25rem 4rem;
    max-width: 44rem;
    background: var(--grund);
    color: var(--schrift);
    font-family: "Source Sans 3", system-ui, -apple-system, sans-serif;
    font-size: 1rem;
    font-weight: 400;
    line-height: 1.55;
  }
  h1, h2 { font-weight: 400; }
  h1 {
    font-size: 1rem;
    color: var(--gedaempft);
    margin: 0 0 1.25rem;
  }
  h2 {
    font-size: .95rem;
    color: var(--gedaempft);
    margin: 2.25rem 0 .5rem;
    padding-bottom: .3rem;
    border-bottom: 1px solid var(--rand);
  }
  section:first-of-type h2 { margin-top: 1.5rem; }
  ul { list-style: none; margin: 0; padding: 0; }
  li { padding: .22rem 0; }
  li a {
    color: var(--akzent);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  li span {
    color: var(--gedaempft);
    font-size: .9rem;
  }
  .suche {
    width: 100%;
    max-width: 18rem;
    padding: .4rem .6rem;
    font: inherit;
    font-size: .95rem;
    color: inherit;
    background: transparent;
    border: 1px solid var(--rand);
    border-radius: .35rem;
  }
  .suche::placeholder { color: var(--gedaempft); }
  a:focus-visible, .suche:focus-visible {
    outline: 2px solid var(--akzent);
    outline-offset: 2px;
  }
  #leer { color: var(--gedaempft); margin: 1.5rem 0; }
  footer {
    margin-top: 3rem;
    padding-top: 1rem;
    border-top: 1px solid var(--rand);
    color: var(--gedaempft);
    font-size: .85rem;
  }
  footer a { color: var(--gedaempft); }
  [hidden] { display: none !important; }
</style>

<h1>Tools</h1>

<label for="suche" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Suchen</label>
<input id="suche" class="suche" type="search" placeholder="Suchen …" autocomplete="off">

<main>
${gruppen.map(abschnitt).join("\n")}
  <p id="leer" hidden>Nichts gefunden.</p>
</main>

<footer>
  <p>Stand: ${datum(stand)} · aktualisiert sich automatisch · <a href="https://github.com/${BENUTZER}?tab=repositories">Repos</a></p>
</footer>

<script>
  const feld = document.getElementById("suche");
  const eintraege = [...document.querySelectorAll("li")];
  const gruppen = [...document.querySelectorAll("[data-gruppe]")];
  const leer = document.getElementById("leer");

  feld.addEventListener("input", () => {
    const suche = feld.value.trim().toLowerCase();
    eintraege.forEach((e) => {
      e.hidden = suche !== "" && !e.textContent.toLowerCase().includes(suche);
    });
    gruppen.forEach((g) => {
      g.hidden = ![...g.querySelectorAll("li")].some((e) => !e.hidden);
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
  gruppen.push({ name: "Neu dazugekommen", tools: uebrig });
}

// Stand ist das neueste Push-Datum, nicht die Laufzeit - so bleibt die Ausgabe
// bei unveraenderten Projekten byte-identisch und die Action committet nichts.
const stand = tools.reduce((a, t) => (t.stand > a ? t.stand : a), tools[0].stand);

await writeFile(new URL("../index.html", import.meta.url), seite(gruppen, stand));

console.log(`${tools.length} Tools in ${gruppen.length} Kategorien geschrieben.`);
for (const g of gruppen) console.log(`  ${g.name}: ${g.tools.map((t) => t.name).join(", ")}`);
