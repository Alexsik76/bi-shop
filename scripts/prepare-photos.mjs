#!/usr/bin/env node

import sharp from 'sharp';
import { readdir, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const MAX_SIDE = 2400;
const QUALITY = 90;
const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.avif', '.tiff', '.tif']);

function formatSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export async function preparePhotos(inputPath, toyDir) {
  const absoluteInputPath = path.resolve(inputPath);
  const absoluteToyDir = path.resolve(toyDir);

  const inputStats = await stat(absoluteInputPath);
  let filesToProcess = [];

  if (inputStats.isDirectory()) {
    const entries = await readdir(absoluteInputPath);
    const sortedImages = entries
      .filter((entry) => SUPPORTED_EXTENSIONS.has(path.extname(entry).toLowerCase()))
      .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

    if (sortedImages.length === 0) {
      throw new Error(`У теці «${inputPath}» не знайдено зображень підтримуваних форматів.`);
    }

    const coverIndex = sortedImages.findIndex((name) =>
      name.toLowerCase().includes('cover')
    );

    let coverFile;
    let galleryFiles = [];

    if (coverIndex !== -1) {
      coverFile = sortedImages[coverIndex];
      galleryFiles = sortedImages.filter((_, idx) => idx !== coverIndex);
    } else {
      coverFile = sortedImages[0];
      galleryFiles = sortedImages.slice(1);
    }

    filesToProcess.push({
      src: path.join(absoluteInputPath, coverFile),
      destName: 'cover.webp',
    });

    for (let i = 0; i < galleryFiles.length; i++) {
      filesToProcess.push({
        src: path.join(absoluteInputPath, galleryFiles[i]),
        destName: `gallery-${i + 1}.webp`,
      });
    }
  } else if (inputStats.isFile()) {
    if (!SUPPORTED_EXTENSIONS.has(path.extname(absoluteInputPath).toLowerCase())) {
      throw new Error(`Формат файлу «${inputPath}» не підтримується.`);
    }
    filesToProcess.push({
      src: absoluteInputPath,
      destName: 'cover.webp',
    });
  } else {
    throw new Error(`Шлях «${inputPath}» не є файлом або текою.`);
  }

  try {
    const existingEntries = await readdir(absoluteToyDir);
    for (const entry of existingEntries) {
      if (entry === 'cover.webp' || /^gallery-\d+\.webp$/.test(entry)) {
        await rm(path.join(absoluteToyDir, entry), { force: true });
      }
    }
  } catch {
    // Ignore error if toyDir does not exist yet
  }

  await mkdir(absoluteToyDir, { recursive: true });

  const summary = [];
  for (const item of filesToProcess) {
    const srcStats = await stat(item.src);
    const destPath = path.join(absoluteToyDir, item.destName);

    const image = sharp(item.src);
    const metadata = await image.metadata();

    const info = await image
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toFile(destPath);

    summary.push({
      name: item.destName,
      origWidth: metadata.width,
      origHeight: metadata.height,
      newWidth: info.width,
      newHeight: info.height,
      origSize: srcStats.size,
      newSize: info.size,
    });
  }

  console.log(`\n✓ Оброблено фото для «${path.basename(absoluteToyDir)}»:`);
  for (const item of summary) {
    console.log(
      `  - ${item.name}: ${item.newWidth}x${item.newHeight} (оригінал: ${item.origWidth}x${item.origHeight}) | ` +
      `${formatSize(item.origSize)} -> ${formatSize(item.newSize)}`
    );
  }

  const galleryNames = summary
    .filter((item) => item.name !== 'cover.webp')
    .map((item) => `./${item.name}`);

  return {
    cover: './cover.webp',
    gallery: galleryNames,
  };
}

async function runCli() {
  const [inputArg, outputArg] = process.argv.slice(2);

  if (!inputArg || !outputArg) {
    console.error('Помилка: вкажіть вхідний файл або теку та цільову теку іграшки.');
    console.error('Використання: node scripts/prepare-photos.mjs <input-file-or-dir> <toy-dir>');
    process.exit(1);
  }

  try {
    await preparePhotos(inputArg, outputArg);
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
