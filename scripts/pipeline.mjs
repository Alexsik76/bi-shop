import path from 'node:path';
import { rm, mkdir, rename, writeFile, readdir, copyFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { preparePhotos } from './prepare-photos.mjs';
import { prepareSpin } from './prepare-spin.mjs';

const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.avif', '.tiff', '.tif']);

export async function runPipeline({
  id,
  spinType,
  spinFramesCount,
  tempUploadDir,
  galleryFiles,
  videoFile,
  spinFiles,
  writeLog,
}) {
  if (!id || !/^[a-z0-9-]+$/.test(id)) {
    throw new Error('Недійсний ID іграшки.');
  }

  const toyDir = path.join('src', 'content', 'igrashky', id);
  writeLog(`📂 Тека іграшки: ${toyDir}`);

  const exists = existsSync(toyDir);
  if (exists) {
    writeLog('⚠️ Тека вже існує. Запуск у режимі оновлення (update-mode).');
  } else {
    await mkdir(toyDir, { recursive: true });
    writeLog('✓ Створено нову теку іграшки.');
  }

  writeLog('📷 Підготовка фотографій галереї...');
  galleryFiles.sort((a, b) => a.idx - b.idx);
  for (let i = 0; i < galleryFiles.length; i++) {
    const file = galleryFiles[i];
    const prefix = i === 0 ? '00_cover_' : `01_gallery_${i}_`;
    const newName = `${prefix}${path.basename(file.tempPath)}`;
    const newPath = path.join(tempUploadDir, newName);
    await rename(file.tempPath, newPath);
    file.tempPath = newPath;
  }

  const originalLog = console.log;
  console.log = (msg, ...args) => {
    let formatted = msg;
    if (args.length > 0) {
      formatted += ' ' + args.join(' ');
    }
    writeLog(formatted);
  };

  let photoData;
  try {
    photoData = await preparePhotos(tempUploadDir, toyDir);
  } finally {
    console.log = originalLog;
  }

  let spinProduced = false;
  if (spinType === 'video' && videoFile) {
    writeLog('🎥 Обробка відео обертання...');
    console.log = (msg, ...args) => {
      let formatted = msg;
      if (args.length > 0) {
        formatted += ' ' + args.join(' ');
      }
      writeLog(formatted);
    };
    try {
      await prepareSpin(videoFile, path.join(toyDir, 'spin'), { frames: spinFramesCount });
      spinProduced = true;
    } finally {
      console.log = originalLog;
    }
  } else if (spinType === 'frames' && spinFiles.length > 0) {
    writeLog('🌀 Обробка кадрів обертання...');
    const spinDir = path.join(tempUploadDir, 'spin');
    await mkdir(spinDir, { recursive: true });
    spinFiles.sort((a, b) => a.filename.localeCompare(b.filename, 'en', { numeric: true }));
    for (const file of spinFiles) {
      const dest = path.join(spinDir, file.filename);
      await rename(file.tempPath, dest);
    }

    console.log = (msg, ...args) => {
      let formatted = msg;
      if (args.length > 0) {
        formatted += ' ' + args.join(' ');
      }
      writeLog(formatted);
    };
    try {
      await prepareSpin(spinDir, path.join(toyDir, 'spin'));
      spinProduced = true;
    } finally {
      console.log = originalLog;
    }
  }

  writeLog('🧹 Очищення тимчасових файлів завантаження...');
  await rm(tempUploadDir, { recursive: true, force: true });

  writeLog('📝 Запис маніфесту index.md...');
  const lines = [
    '---',
    `cover: ${photoData.cover}`,
  ];
  if (photoData.gallery && photoData.gallery.length > 0) {
    lines.push('gallery:');
    for (const item of photoData.gallery) {
      lines.push(`  - ${item}`);
    }
  } else {
    lines.push('gallery: []');
  }

  if (spinProduced) {
    lines.push('spinDir: ./spin');
  }
  lines.push('---');
  lines.push('');

  const manifest = lines.join('\n');
  await writeFile(path.join(toyDir, 'index.md'), manifest, 'utf8');

  writeLog('🎉 Успішно завершено!');
  return manifest;
}

export async function runHeadless(id, sourceDir, options = {}) {
  const { frames = 36 } = options;

  if (!id || !sourceDir) {
    console.error('Помилка: вкажіть ID іграшки та джерельну тему фотографій.');
    console.error('Використання: node scripts/new-toy.mjs --headless <id> <source-dir> [--frames N]');
    process.exit(1);
  }

  if (!/^[a-z0-9-]+$/.test(id)) {
    console.error('Помилка: ID має містити лише малі латинські літери, цифри та дефіси.');
    process.exit(1);
  }

  const absoluteSourceDir = path.resolve(sourceDir);
  console.log(`🔎 Сканування теки: ${absoluteSourceDir}`);
  let entries;
  try {
    entries = await readdir(absoluteSourceDir);
  } catch (err) {
    console.error(`Помилка: не вдалося прочитати теку «${sourceDir}»: ${err.message}`);
    process.exit(1);
  }

  const imageFiles = entries
    .filter((f) => SUPPORTED_EXTENSIONS.has(path.extname(f).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

  if (imageFiles.length === 0) {
    console.error(`Помилка: в теці «${sourceDir}» не знайдено зображень.`);
    process.exit(1);
  }

  const coverIdx = imageFiles.findIndex((name) => name.toLowerCase().includes('cover'));
  let coverFile;
  let galleryFilesList = [];

  if (coverIdx !== -1) {
    coverFile = imageFiles[coverIdx];
    galleryFilesList = imageFiles.filter((_, idx) => idx !== coverIdx);
  } else {
    coverFile = imageFiles[0];
    galleryFilesList = imageFiles.slice(1);
  }

  const tempUploadDir = path.join('src', 'content', 'igrashky', `.temp-headless-${id}`);
  await rm(tempUploadDir, { recursive: true, force: true });
  await mkdir(tempUploadDir, { recursive: true });

  const galleryFiles = [];
  const coverTempPath = path.join(tempUploadDir, 'temp-cover' + path.extname(coverFile));
  await copyFile(path.join(absoluteSourceDir, coverFile), coverTempPath);
  galleryFiles.push({ tempPath: coverTempPath, idx: 0, filename: coverFile });

  for (let i = 0; i < galleryFilesList.length; i++) {
    const file = galleryFilesList[i];
    const tempPath = path.join(tempUploadDir, `temp-gallery-${i}${path.extname(file)}`);
    await copyFile(path.join(absoluteSourceDir, file), tempPath);
    galleryFiles.push({ tempPath, idx: i + 1, filename: file });
  }

  let spinVideo = null;
  const videoExtensions = new Set(['.mp4', '.mov']);
  for (const entry of entries) {
    const fullPath = path.join(absoluteSourceDir, entry);
    const fileStats = await stat(fullPath);
    if (fileStats.isFile()) {
      const ext = path.extname(entry).toLowerCase();
      if (videoExtensions.has(ext) && entry.toLowerCase().includes('spin')) {
        spinVideo = fullPath;
        break;
      }
    }
  }

  let spinFolder = null;
  const potentialSpinFolder = path.join(absoluteSourceDir, 'spin');
  if (existsSync(potentialSpinFolder)) {
    const folderStats = await stat(potentialSpinFolder);
    if (folderStats.isDirectory()) {
      spinFolder = potentialSpinFolder;
    }
  }

  let spinType = 'none';
  let videoFile = null;
  const spinFiles = [];

  if (spinVideo) {
    console.log('🎥 Виявлено відео обертання.');
    spinType = 'video';
    videoFile = spinVideo;
  } else if (spinFolder) {
    console.log('🌀 Виявлено теку кадрів обертання.');
    spinType = 'frames';
    const folderEntries = await readdir(spinFolder);
    const supportedSpinExt = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.avif']);
    const spinImages = folderEntries.filter((f) => supportedSpinExt.has(path.extname(f).toLowerCase()));
    
    for (let i = 0; i < spinImages.length; i++) {
      const file = spinImages[i];
      const tempPath = path.join(tempUploadDir, `spin-temp-${i}${path.extname(file)}`);
      await copyFile(path.join(spinFolder, file), tempPath);
      spinFiles.push({ tempPath, idx: i, filename: file });
    }
  }

  const writeLog = (msg) => process.stdout.write(msg + '\n');
  const toyDir = path.join('src', 'content', 'igrashky', id);

  try {
    const manifest = await runPipeline({
      id,
      spinType,
      spinFramesCount: frames,
      tempUploadDir,
      galleryFiles,
      videoFile,
      spinFiles,
      writeLog,
    });

    console.log(`\n✓ Успішно створено іграшку «${id}»!`);
    console.log('Створені файли:');
    console.log(`  - ${path.join(toyDir, 'index.md')}`);
    console.log(`  - ${path.join(toyDir, 'cover.webp')}`);
    const galleryCount = galleryFilesList.length;
    for (let i = 0; i < galleryCount; i++) {
      console.log(`  - ${path.join(toyDir, `gallery-${i + 1}.webp`)}`);
    }
    if (spinType !== 'none') {
      console.log(`  - ${path.join(toyDir, 'spin/')}`);
    }
  } catch (err) {
    console.error(`Помилка під час обробки пайплайну: ${err.message}`);
    try {
      await rm(tempUploadDir, { recursive: true, force: true });
    } catch {}
    process.exit(1);
  }
}
