// DAWN CANYON RUN — entrypoint for the make.fun best-flight-game bounty.
//
// The game itself is the static site under game/ (open game/index.html in a
// desktop browser; it loads a vendored Three.js and makes no network calls).
// This program is the hand-in step: it audits the payload against the
// competition's own size gates, copies game/ and screenshots/ into the
// output directory, and writes dossier.json there with the vendored
// make.fun library so the judges can read the entry's summary.
//
// Run it the way the grader does, or locally with an output override:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const entryDir = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The gates this entry must fit, mirroring the scorer's caps: at most four
// screenshots of 256 KiB each, and a game folder of at most 993 files and
// 48 MiB in total. The audit below refuses to hand in an entry the scorer
// would refuse, so a bad build fails here instead of at judging time.
const SCREENSHOT_MAX_COUNT = 4;
const SCREENSHOT_MAX_BYTES = 262144;
const GAME_MAX_FILES = 993;
const GAME_MAX_BYTES = 50331648;

// Walk a folder recursively and report every file with its byte size, in a
// stable sorted order so the audit output is identical on every run.
function listFilesRecursively(folder) {
  const found = [];
  const pending = [folder];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const name of readdirSync(current).sort()) {
      const full = join(current, name);
      if (statSync(full).isDirectory()) pending.push(full);
      else found.push({ path: full, bytes: statSync(full).size });
    }
  }
  return found.sort((a, b) => (a.path < b.path ? -1 : 1));
}

function auditPayload() {
  const gameFiles = listFilesRecursively(join(entryDir, 'game'));
  const gameBytes = gameFiles.reduce((sum, file) => sum + file.bytes, 0);
  if (gameFiles.length > GAME_MAX_FILES) {
    throw new Error(`game/ holds ${gameFiles.length} files, over the ${GAME_MAX_FILES} cap`);
  }
  if (gameBytes > GAME_MAX_BYTES) {
    throw new Error(`game/ totals ${gameBytes} bytes, over the ${GAME_MAX_BYTES} cap`);
  }
  const shots = listFilesRecursively(join(entryDir, 'screenshots'));
  if (shots.length > SCREENSHOT_MAX_COUNT) {
    throw new Error(`${shots.length} screenshots, over the ${SCREENSHOT_MAX_COUNT} cap`);
  }
  for (const shot of shots) {
    if (shot.bytes > SCREENSHOT_MAX_BYTES) {
      throw new Error(`${shot.path} is ${shot.bytes} bytes, over the ${SCREENSHOT_MAX_BYTES} cap`);
    }
  }
  console.log(
    `audit ok: game/ ${gameFiles.length} files, ${gameBytes} bytes; ` +
      `screenshots/ ${shots.length} files (${shots.map((s) => s.bytes).join(', ')} bytes)`,
  );
}

auditPayload();

mkdirSync(outputDir, { recursive: true });
cpSync(join(entryDir, 'game'), join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(entryDir, 'screenshots'))) {
  cpSync(join(entryDir, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

// Only text_max_bytes shapes the dossier bytes; the remaining options restate
// the gates audited above so buildDossier refuses anything the scorer would.
writeFileSync(
  join(outputDir, 'dossier.json'),
  buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: SCREENSHOT_MAX_COUNT, max_bytes: SCREENSHOT_MAX_BYTES },
    game_max_files: GAME_MAX_FILES,
    game_max_bytes: GAME_MAX_BYTES,
    game_path_max_bytes: 1000,
  }),
);
console.log(`handed in: dossier.json written under ${outputDir}`);
