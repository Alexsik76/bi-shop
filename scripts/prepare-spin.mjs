#!/usr/bin/env node
/**
 * Підготовка кадрів обертання для компонента Spin360.
 *
 * Що робить:
 *   1. Читає всі зображення з теки оригіналів (у порядку імен файлів).
 *   2. Зменшує кожне до 1200 px по довшій стороні (без збільшення менших).
 *   3. Конвертує у WebP якістю 80.
 *   4. Перейменовує послідовно: frame-01.webp, frame-02.webp, …
 *
 * Використання:
 *   node scripts/prepare-spin.mjs <тека-оригіналів> [тека-призначення]
 *
 * Приклад:
 *   node scripts/prepare-spin.mjs ~/foto/vedmedyk public/spin/vedmedyk-tymko
 *
 * Якщо теку призначення не вказано, використовується
 *   public/spin/<назва-теки-оригіналів>.
 */
import sharp from 'sharp';
import { readdir, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const MAX_SIDE = 1200;
const QUALITY = 80;
const EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.avif']);

async function main() {
  const [inputDir, outputArg] = process.argv.slice(2);

  if (!inputDir) {
    console.error('Помилка: вкажіть теку з оригіналами кадрів.');
    console.error('Використання: node scripts/prepare-spin.mjs <тека-оригіналів> [тека-призначення]');
    process.exit(1);
  }

  const outputDir =
    outputArg ?? path.join('public', 'spin', path.basename(path.resolve(inputDir)));

  let entries;
  try {
    entries = await readdir(inputDir);
  } catch {
    console.error(`Помилка: не вдалося прочитати теку «${inputDir}».`);
    process.exit(1);
  }

  const files = entries
    .filter((f) => EXT.has(path.extname(f).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

  if (files.length === 0) {
    console.error(`Помилка: у теці «${inputDir}» немає зображень.`);
    process.exit(1);
  }

  // Очищаємо теку призначення від попередніх кадрів.
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  const pad = String(files.length).length < 2 ? 2 : String(files.length).length;

  for (let i = 0; i < files.length; i++) {
    const src = path.join(inputDir, files[i]);
    const n = String(i + 1).padStart(pad, '0');
    const dest = path.join(outputDir, `frame-${n}.webp`);

    await sharp(src)
      .rotate() // враховує EXIF-орієнтацію
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toFile(dest);

    process.stdout.write(`\r  оброблено ${i + 1}/${files.length}`);
  }

  console.log(`\n✓ Готово: ${files.length} кадрів у «${outputDir}».`);
  console.log(`  У frontmatter іграшки вкажіть: spinFrames: ${files.length}`);
}

main().catch((err) => {
  console.error('\nПомилка обробки:', err.message);
  process.exit(1);
});
