#!/usr/bin/env node

import process from 'node:process';
import { runHeadless } from './pipeline.mjs';
import { startServer } from './server.mjs';

async function main() {
  const args = process.argv.slice(2);
  const headlessIdx = args.indexOf('--headless');

  if (headlessIdx !== -1) {
    const headlessArgs = args.filter((_, idx) => idx !== headlessIdx);
    const id = headlessArgs[0];
    const sourceDir = headlessArgs[1];
    
    let frames = 36;
    const framesIdx = headlessArgs.indexOf('--frames');
    if (framesIdx !== -1 && headlessArgs[framesIdx + 1]) {
      frames = parseInt(headlessArgs[framesIdx + 1], 10) || 36;
    }

    await runHeadless(id, sourceDir, { frames });
  } else {
    await startServer();
  }
}

main().catch((err) => {
  console.error('Помилка виконання:', err.message);
  process.exit(1);
});
