#!/usr/bin/env node

import { mkdir, writeFile, access, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { preparePhotos } from './prepare-photos.mjs';

const rl = readline.createInterface({ input, output });

async function ask(question, validator = null, defaultValue = '') {
  let answer = '';
  while (true) {
    answer = await rl.question(question);
    answer = answer.trim() || defaultValue;
    if (!validator) {
      break;
    }
    const errorMsg = await validator(answer);
    if (!errorMsg) {
      break;
    }
    console.log(`  Помилка: ${errorMsg}`);
  }
  return answer;
}

async function validateSlug(val) {
  if (!val) {
    return 'Slug не може бути порожнім.';
  }
  if (!/^[a-z0-9-]+$/.test(val)) {
    return 'Slug повинен містити лише малі латинські літери, цифри та дефіс (наприклад, "vedmedyk-tymko").';
  }
  const toyDir = path.join('src', 'content', 'igrashky', val);
  try {
    await access(toyDir);
    return `Тека для іграшки «${val}» вже існує.`;
  } catch {
    return null;
  }
}

function validateRequired(fieldName) {
  return (val) => {
    if (!val) {
      return `${fieldName} не може бути порожнім/порожньою.`;
    }
    return null;
  };
}

function validatePrice(val) {
  if (!val) {
    return 'Ціна не може бути порожньою.';
  }
  const num = Number(val);
  if (isNaN(num) || num <= 0) {
    return 'Ціна повинна бути додатним числом.';
  }
  return null;
}

function validateStatus(val) {
  if (!val) {
    return null;
  }
  const clean = val.toLowerCase();
  if (['1', 'available', '2', 'made-to-order', '3', 'sold'].includes(clean)) {
    return null;
  }
  return 'Недопустиме значення статусу (дозволено: available, made-to-order, sold).';
}

async function validatePhotos(val) {
  if (!val) {
    return null;
  }
  try {
    await stat(val);
    return null;
  } catch {
    return `Шлях «${val}» не існує.`;
  }
}

async function main() {
  const args = process.argv.slice(2);
  let cliSlug = null;
  const cliFlags = {};
  const hasCliArgs = args.length > 0;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const val = args[i + 1];
      if (val && !val.startsWith('--')) {
        cliFlags[key] = val;
        i++;
      } else {
        cliFlags[key] = true;
      }
    } else if (!cliSlug && !arg.startsWith('-')) {
      cliSlug = arg;
    }
  }

  let slug = '';
  if (cliSlug) {
    const err = await validateSlug(cliSlug);
    if (!err) {
      slug = cliSlug;
    } else {
      console.log(`Клієнтський slug «${cliSlug}» недійсний: ${err}`);
      slug = await ask('Введіть slug іграшки (малі латинські літери, цифри, дефіс): ', validateSlug);
    }
  } else {
    slug = await ask('Введіть slug іграшки (малі латинські літери, цифри, дефіс): ', validateSlug);
  }

  let title = '';
  if (cliFlags.title) {
    const err = validateRequired('Назва')(cliFlags.title);
    if (!err) {
      title = cliFlags.title;
    } else {
      console.log(`Клієнтська назва недійсна: ${err}`);
      title = await ask('Введіть назву іграшки: ', validateRequired('Назва'));
    }
  } else {
    title = await ask('Введіть назву іграшки: ', validateRequired('Назва'));
  }

  let priceStr = '';
  if (cliFlags.price) {
    const err = validatePrice(cliFlags.price);
    if (!err) {
      priceStr = cliFlags.price;
    } else {
      console.log(`Клієнтська ціна недійсна: ${err}`);
      priceStr = await ask('Введіть ціну іграшки (у гривнях, число): ', validatePrice);
    }
  } else {
    priceStr = await ask('Введіть ціну іграшки (у гривнях, число): ', validatePrice);
  }
  const price = Number(priceStr);

  let size = '';
  if (cliFlags.size) {
    const err = validateRequired('Розмір')(cliFlags.size);
    if (!err) {
      size = cliFlags.size;
    } else {
      console.log(`Клієнтський розмір недійсний: ${err}`);
      size = await ask('Введіть розмір іграшки (наприклад, "26 см"): ', validateRequired('Розмір'));
    }
  } else {
    size = await ask('Введіть розмір іграшки (наприклад, "26 см"): ', validateRequired('Розмір'));
  }

  let materials = '';
  if (cliFlags.materials) {
    const err = validateRequired('Матеріали')(cliFlags.materials);
    if (!err) {
      materials = cliFlags.materials;
    } else {
      console.log(`Клієнтські матеріали недійсні: ${err}`);
      materials = await ask('Введіть матеріали (наприклад, "плюшева пряжа, холлофайбер"): ', validateRequired('Матеріали'));
    }
  } else {
    materials = await ask('Введіть матеріали (наприклад, "плюшева пряжа, холлофайбер"): ', validateRequired('Матеріали'));
  }

  let status = 'available';
  if (cliFlags.status) {
    const err = validateStatus(cliFlags.status);
    if (!err) {
      status = cliFlags.status;
    } else {
      console.log(`Клієнтський статус недійсний: ${err}`);
      const statusInput = await ask(
        'Оберіть статус (1. available [в наявності - за замовчуванням], 2. made-to-order [під замовлення], 3. sold [продано]): ',
        validateStatus,
        'available'
      );
      status = statusInput;
    }
  } else if (!hasCliArgs) {
    const statusInput = await ask(
      'Оберіть статус (1. available [в наявності - за замовчуванням], 2. made-to-order [під замовлення], 3. sold [продано]): ',
      validateStatus,
      'available'
    );
    status = statusInput;
  }
  if (status === '1') {
    status = 'available';
  } else if (status === '2') {
    status = 'made-to-order';
  } else if (status === '3') {
    status = 'sold';
  }

  let photosPath = '';
  if (cliFlags.photos) {
    const err = await validatePhotos(cliFlags.photos);
    if (!err) {
      photosPath = cliFlags.photos;
    } else {
      console.log(`Клієнтський шлях до фотографій недійсний: ${err}`);
      photosPath = await ask('Вкажіть шлях до теки з фотографіями (необов\'язково, Enter щоб пропустити): ', validatePhotos);
    }
  } else if (!hasCliArgs) {
    photosPath = await ask('Вкажіть шлях до теки з фотографіями (необов\'язково, Enter щоб пропустити): ', validatePhotos);
  }

  rl.close();

  const toyDir = path.join('src', 'content', 'igrashky', slug);
  await mkdir(toyDir, { recursive: true });

  let photoData = null;
  if (photosPath) {
    photoData = await preparePhotos(photosPath, toyDir);
  }

  const markdownLines = [
    '---',
    `title: ${title}`,
    `price: ${price}`,
    `size: ${size}`,
    `materials: ${materials}`,
    `status: ${status}`,
  ];

  if (photoData) {
    markdownLines.push(`cover: ${photoData.cover}`);
    if (photoData.gallery && photoData.gallery.length > 0) {
      markdownLines.push('gallery:');
      for (const item of photoData.gallery) {
        markdownLines.push(`  - ${item}`);
      }
    } else {
      markdownLines.push('gallery: []');
    }
  } else {
    markdownLines.push('# cover: ./cover.webp');
    markdownLines.push('# gallery: []');
  }

  markdownLines.push('---');
  markdownLines.push('');
  markdownLines.push('<!-- TODO: додайте опис іграшки тут -->');
  markdownLines.push('');

  const indexPath = path.join(toyDir, 'index.md');
  await writeFile(indexPath, markdownLines.join('\n'), 'utf8');

  console.log(`\n✓ Успішно створено нову іграшку в «${toyDir}»!`);
  console.log('Створені файли:');
  console.log(`  - ${path.join(toyDir, 'index.md')}`);
  if (photoData) {
    console.log(`  - ${path.join(toyDir, 'cover.webp')}`);
    for (let i = 0; i < photoData.gallery.length; i++) {
      console.log(`  - ${path.join(toyDir, `gallery-${i + 1}.webp`)}`);
    }
  }

  console.log('\nНаступні кроки:');
  console.log(`  1. Додайте опис іграшки в файл ${indexPath}`);
  console.log('  2. Підготуйте кадри обертання (за наявності) за допомогою:');
  console.log(`     node scripts/prepare-spin.mjs <тека-з-кадрами> ${path.join(toyDir, 'spin')}`);
  console.log('  3. Перевірте збірку сайту:');
  console.log('     npm run build');
  console.log('  4. Зробіть коміт зі змінами (без пушу!).');
}

main().catch((err) => {
  console.error('\nПомилка створення іграшки:', err.message);
  rl.close();
  process.exit(1);
});
