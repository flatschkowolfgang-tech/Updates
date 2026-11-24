// +-------------------+
// |   M   &   N       |
// +-------------------+
//
// VIP Updates – eine neue App-Version in dieses Repo hochladen (fuer ALLE Apps, die in den VIP Hub kommen)
//
//   node publish.mjs --app rewind --name "VIP Rewind" --version 0.6.14 --dir <Ordner mit den Dateien>
//                    --setup VIP-Rewind-Setup-0.6.14.exe --notes "Was ist neu" [--desc "Kurzbeschreibung"]
//
// Ablauf:
//   1. Release mit festem Namen = App-Kennung (z. B. "rewind") anlegen, falls es fehlt
//   2. Setup + .blockmap + .sig hochladen, latest.yml ZULETZT (damit niemand eine halbe Version sieht)
//   3. Alte Setup-Dateien aufraeumen (die letzten KEEP Versionen bleiben fuer laufende Downloads)
//   4. apps.json (App-Liste fuer den Hub) aktualisieren, committen, pushen
// Braucht: GitHub CLI (gh), angemeldet mit `gh auth login`.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "flatschkowolfgang-tech/Updates";
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const KEEP = 2;

const die = (msg) => { console.error("\n✗ " + msg); process.exit(1); };
const step = (msg) => console.log("\n▸ " + msg);

// ---------- Argumente ----------
const a = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) a[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
for (const k of ["app", "name", "version", "dir", "setup"]) if (!a[k]) die(`--${k} fehlt`);
if (!/^[a-z0-9-]+$/.test(a.app)) die("--app nur Kleinbuchstaben, Zahlen, Bindestrich");

// ---------- gh finden ----------
const GH = [process.env.GH_PATH, "gh", "C:\\Program Files\\GitHub CLI\\gh.exe"].find((p) => {
  if (!p) return false;
  try { execFileSync(p, ["--version"], { stdio: "ignore" }); return true; } catch { return false; }
});
if (!GH) die("GitHub CLI (gh) fehlt. Einmal: winget install --id GitHub.cli  und danach  gh auth login");
const gh = (args, opts = {}) => spawnSync(GH, args, { encoding: "utf8", ...opts });
if (gh(["auth", "status"]).status !== 0) die("GitHub CLI ist nicht angemeldet. Einmal: gh auth login");

const dir = path.resolve(a.dir);
const setup = a.setup;
const files = [setup, `${setup}.blockmap`, `${setup}.sig`, "latest.yml"].filter((f) => fs.existsSync(path.join(dir, f)));
for (const f of [setup, "latest.yml"]) if (!files.includes(f)) die(`Datei fehlt: ${path.join(dir, f)}`);

// ---------- 1. Release anlegen ----------
const tag = a.app;
if (gh(["release", "view", tag, "-R", REPO]).status !== 0) {
  step(`Lege Bereich „${tag}“ an …`);
  const r = gh(["release", "create", tag, "-R", REPO, "--title", a.name, "--notes", `Downloads und Updates für ${a.name}. Neueste Version: siehe apps.json.`, "--latest=false"], { stdio: "inherit" });
  if (r.status !== 0) die("Release konnte nicht angelegt werden");
}

// ---------- 2. Hochladen ----------
const upload = (f) => {
  for (let i = 1; i <= 3; i++) {
    const r = gh(["release", "upload", tag, path.join(dir, f), "--clobber", "-R", REPO], { stdio: "inherit" });
    if (r.status === 0) return;
    console.log(`  … Upload von ${f} fehlgeschlagen (Versuch ${i}/3)`);
  }
  die(`Upload fehlgeschlagen: ${f}`);
};
step(`Lade ${a.name} ${a.version} hoch …`);
for (const f of files.filter((f) => f !== "latest.yml")) upload(f);
upload("latest.yml");

const base = `https://github.com/${REPO}/releases/download/${tag}/`;
const live = await fetch(base + "latest.yml", { cache: "no-store" }).then((r) => r.text()).catch(() => "");
if (!live.includes(`version: ${a.version}`)) die("latest.yml im Repo zeigt nicht die neue Version.");
console.log("  ✓ online: " + base + "latest.yml");

// ---------- 3. Alte Versionen aufraeumen ----------
const list = JSON.parse(gh(["release", "view", tag, "-R", REPO, "--json", "assets"]).stdout || "{}").assets || [];
const ver = (n) => (n.match(/-(\d+\.\d+\.\d+)\.exe/) || [])[1];
const cmp = (x, y) => x.split(".").map(Number).reduce((r, v, i) => r || v - Number(y.split(".")[i]), 0);
const versions = [...new Set(list.map((x) => ver(x.name)).filter(Boolean))].sort(cmp);
for (const v of versions.slice(0, Math.max(0, versions.length - KEEP))) {
  for (const x of list.filter((x) => ver(x.name) === v)) {
    step(`Entferne alte Datei ${x.name} …`);
    gh(["release", "delete-asset", tag, x.name, "-y", "-R", REPO], { stdio: "inherit" });
  }
}

// ---------- 4. App-Liste fuer den Hub ----------
step("Aktualisiere apps.json …");
const appsFile = path.join(ROOT, "apps.json");
const data = fs.existsSync(appsFile) ? JSON.parse(fs.readFileSync(appsFile, "utf8")) : { apps: [] };
const entry = data.apps.find((x) => x.id === a.app) || (data.apps.push({ id: a.app }), data.apps[data.apps.length - 1]);
Object.assign(entry, {
  name: a.name,
  version: a.version,
  notes: a.notes && a.notes !== true ? a.notes : entry.notes || "",
  ...(a.desc && a.desc !== true ? { desc: a.desc } : {}),
  download: base + encodeURIComponent(setup),
  feed: base,
  released: new Date().toISOString(),
});
fs.writeFileSync(appsFile, JSON.stringify(data, null, 2) + "\n");
const git = (args) => spawnSync("git", args, { cwd: ROOT, stdio: "inherit" });
git(["add", "-A"]);
git(["commit", "-q", "-m", `${a.name} ${a.version}${a.notes && a.notes !== true ? `: ${a.notes}` : ""}\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`]);
if (git(["push", "-q", "-u", "origin", "main"]).status !== 0) die("Push von apps.json fehlgeschlagen");
console.log(`\n✓ ${a.name} ${a.version} liegt im Updates-Repo.`);
