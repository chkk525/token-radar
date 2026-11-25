// Token Launch Radar — entry point (Node 22, standard library only).
//
// Reads the sealed snapshot (--input <file|dir>, default /input), fits the
// model in lib/model.ts from the snapshot's own token-bearing peers, writes
// the ranked board to board.json and the dashboard's data.js in the output
// directory (--output, else $MAKEFUN_OUTPUT_DIR, else /output), copies this
// repository's dashboard/ and screenshots/ beside them when they are present,
// and writes dossier.json with the vendored buildDossier library, as the
// gate expects. Two runs on the same snapshot write the same bytes: the
// model is a pure function of the snapshot and nothing here reads a clock
// or a random source.
//
// Local run: mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analysisMarkdown, boardIssue, buildBoard, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The gate's dossier caps, as the scorer rebuilds it. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };

/** --name <value> or --name=<value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildBoard(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy one directory's regular files into `to`, skipping dotfiles; [] when absent. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

const pageFiles = copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));

// The written analysis rides inside the dashboard directory, so the dossier
// the gate rebuilds from this output carries the radar's reasoning (method,
// fitted ranges, watchlist deep-dives) in the same words the page shows. It
// is generated here, from the same data as the page, never committed stale.
if (pageFiles.length > 0) {
  writeFileSync(join(out, 'dashboard', 'analysis.md'), analysisMarkdown(radar));
  pageFiles.push('analysis.md');
}

// The dossier is written last, from the finished output, exactly as the
// scorer rebuilds it. buildDossier refuses an empty screenshots/ folder, so
// it is only written once the dashboard and its screenshots are in place.
let dossierNote = 'dossier skipped: dashboard/ and screenshots/ are not in this repository yet';
if (pageFiles.length > 0 && shots.length > 0) {
  writeFileSync(
    join(out, 'dossier.json'),
    buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }),
  );
  dossierNote = `wrote ${join(out, 'dossier.json')}`;
}

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored\n` +
    `token radar: wrote ${join(out, 'board.json')} and ${join(out, 'data.js')}; dashboard files copied: ${pageFiles.length}, screenshots copied: ${shots.length}; ${dossierNote}\n`,
);
