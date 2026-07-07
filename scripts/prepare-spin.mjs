#!/usr/bin/env node
/**
 * Підготовка кадрів обертання для компонента Spin360.
 *
 * Що робить:
 *   1. Читає всі зображення з теки оригіналів (у порядку імен файлів) або відеофайл.
 *   2. Зменшує кожне до 1200 px по довшій стороні (без збільшення менших).
 *   3. Конвертує у WebP якістю 80.
 *   4. Перейменовує послідовно: frame-01.webp, frame-02.webp, …
 *
 * Використання:
 *   node scripts/prepare-spin.mjs <оригінали-чи-відео> [тека-призначення] [--frames N]
 *
 * Приклад:
 *   node scripts/prepare-spin.mjs ~/foto/vedmedyk src/content/igrashky/vedmedyk-tymko/spin
 *
 * Якщо теку призначення не вказано, використовується
 *   src/content/igrashky/<назва-теки-оригіналів>/spin.
 */

import sharp from 'sharp';
import { readdir, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execPromise = promisify(exec);

const MAX_SIDE = 1200;
const QUALITY = 80;
const EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.avif']);

export async function prepareSpin(inputPath, outputDir, options = {}) {
  const { frames = 36 } = options;
  const absoluteInputPath = path.resolve(inputPath);
  const absoluteOutputDir = path.resolve(outputDir);

  const inputStats = await stat(absoluteInputPath);
  let framesDir = absoluteInputPath;
  let isTempDir = false;

  if (inputStats.isFile()) {
    const ext = path.extname(absoluteInputPath).toLowerCase();
    if (ext !== '.mp4' && ext !== '.mov') {
      throw new Error(`Непідтримуваний формат відео «${ext}». Підтримуються лише .mp4 та .mov.`);
    }

    let duration = 0;
    try {
      const { stdout } = await execPromise(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${absoluteInputPath}"`
      );
      duration = parseFloat(stdout.trim());
      if (isNaN(duration) || duration <= 0) {
        throw new Error('Невірна тривалість відео.');
      }
    } catch (err) {
      throw new Error(`Помилка отримання тривалості відео через ffprobe: ${err.message}`);
    }

    const fps = frames / duration;
    framesDir = path.join(path.dirname(absoluteOutputDir), `_temp_video_frames_${Date.now()}`);
    await rm(framesDir, { recursive: true, force: true });
    await mkdir(framesDir, { recursive: true });
    isTempDir = true;

    try {
      const ffmpegPattern = path.join(framesDir, 'frame-%03d.png').replace(/\\/g, '/');
      await execPromise(
        `ffmpeg -y -i "${absoluteInputPath}" -vf "fps=${fps}" "${ffmpegPattern}"`
      );
    } catch (err) {
      await rm(framesDir, { recursive: true, force: true });
      throw new Error(`Помилка екстракції кадрів через ffmpeg: ${err.message}`);
    }
  }

  let entries;
  try {
    entries = await readdir(framesDir);
  } catch (err) {
    if (isTempDir) {
      await rm(framesDir, { recursive: true, force: true });
    }
    throw new Error(`Не вдалося прочитати теку з кадрами «${framesDir}»: ${err.message}`);
  }

  const files = entries
    .filter((f) => EXT.has(path.extname(f).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

  if (files.length === 0) {
    if (isTempDir) {
      await rm(framesDir, { recursive: true, force: true });
    }
    throw new Error(`Не знайдено зображень у теці «${framesDir}».`);
  }

  await rm(absoluteOutputDir, { recursive: true, force: true });
  await mkdir(absoluteOutputDir, { recursive: true });

  const pad = String(files.length).length < 2 ? 2 : String(files.length).length;

  for (let i = 0; i < files.length; i++) {
    const src = path.join(framesDir, files[i]);
    const n = String(i + 1).padStart(pad, '0');
    const dest = path.join(absoluteOutputDir, `frame-${n}.webp`);

    await sharp(src)
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toFile(dest);
  }

  if (isTempDir) {
    await rm(framesDir, { recursive: true, force: true });
  }

  return files.length;
}

async function runCli() {
  const args = process.argv.slice(2);
  let inputPath = '';
  let outputArg = '';
  let frames = 36;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--frames') {
      const val = args[i + 1];
      if (val && !val.startsWith('--')) {
        frames = parseInt(val, 10) || 36;
        i++;
      }
    } else if (!inputPath && !arg.startsWith('-')) {
      inputPath = arg;
    } else if (!outputArg && !arg.startsWith('-')) {
      outputArg = arg;
    }
  }

  if (!inputPath) {
    console.error('Помилка: вкажіть теку з оригіналами або відео-файл.');
    console.error('Використання: node scripts/prepare-spin.mjs <оригінали-чи-відео> [тека-призначення] [--frames N]');
    process.exit(1);
  }

  const outputDir =
    outputArg || path.join('src', 'content', 'igrashky', path.basename(path.resolve(inputPath)), 'spin');

  try {
    const count = await prepareSpin(inputPath, outputDir, { frames });
    console.log(`\n✓ Готово: ${count} кадрів у «${outputDir}».`);
  } catch (err) {
    console.error('\nПомилка обробки:', err.message);
    process.exit(1);
  }
}

const currentFilePath = fileURLToPath(import.meta.url);
const executionPath = process.argv[1] ? path.resolve(process.argv[1]) : '';

if (executionPath === currentFilePath) {
  runCli();
}
