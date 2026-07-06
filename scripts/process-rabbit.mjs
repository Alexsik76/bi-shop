import sharp from 'sharp';

async function run() {
  console.log('Starting asset processing...');

  // 1. Обрізаємо Ico_new.png (кролик для Hero та 404)
  try {
    const croppedRabbit = sharp('temp/Ico_new.png')
      .trim({ background: '#faf5f0', threshold: 12 });

    const buffer = await croppedRabbit.png().toBuffer();
    const meta = await sharp(buffer).metadata();
    console.log(`Cropped rabbit dimensions: ${meta.width}x${meta.height}`);

    // Додаємо відступ 20px з прозорим фоном
    await sharp(buffer)
      .extend({
        top: 20,
        bottom: 20,
        left: 20,
        right: 20,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toFile('src/assets/hero-rabbit.png');

    console.log('Saved src/assets/hero-rabbit.png');
  } catch (e) {
    console.error('Error processing Ico_new.png:', e);
  }

  // 2. Збираємо og-default.png (1200x630): кролик зліва, текст справа
  try {
    const rabbitResized = await sharp('src/assets/hero-rabbit.png')
      .resize({ height: 520, fit: 'inside' })
      .toBuffer();
    const rabbitMeta = await sharp(rabbitResized).metadata();

    const textResized = await sharp('temp/og-text.png')
      .resize({ width: 480, fit: 'inside' })
      .toBuffer();
    const textMeta = await sharp(textResized).metadata();

    // Розраховуємо центри для лівої (600px) та правої (600px) половин
    const rabbitX = Math.round(300 - (rabbitMeta.width / 2));
    const rabbitY = Math.round(315 - (rabbitMeta.height / 2));

    const textX = Math.round(900 - (textMeta.width / 2));
    const textY = Math.round(315 - (textMeta.height / 2));

    await sharp({
      create: {
        width: 1200,
        height: 630,
        channels: 4,
        background: '#faf6f0'
      }
    })
    .composite([
      { input: rabbitResized, left: rabbitX, top: rabbitY },
      { input: textResized, left: textX, top: textY }
    ])
    .png()
    .toFile('public/og-default.png');

    console.log('Successfully generated public/og-default.png combining new rabbit and clean text');
  } catch (e) {
    console.error('Error generating OG image:', e);
  }
}

run();
