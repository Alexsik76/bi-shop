/// <reference types="@cloudflare/workers-types" />
import { site } from '../src/config';

export const statusLabels: Record<string, string> = {
  'available': 'В наявності',
  'made-to-order': 'Під замовлення',
  'sold': 'Продано',
};

export const statusClasses: Record<string, string> = {
  'available': 'badge badge-available',
  'made-to-order': 'badge badge-made-to-order',
  'sold': 'badge badge-sold',
};

export const schemaAvailability: Record<string, string> = {
  'available': 'https://schema.org/InStock',
  'made-to-order': 'https://schema.org/PreOrder',
  'sold': 'https://schema.org/SoldOut',
};

export function isVisible(data: any): boolean {
  if (!data) return false;
  if (typeof data.title !== 'string' || data.title.trim() === '') return false;
  if (typeof data.price !== 'number' || isNaN(data.price) || data.price <= 0) return false;
  const validStatuses = ['available', 'made-to-order', 'sold'];
  if (!validStatuses.includes(data.status)) return false;
  return true;
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function formatDescription(desc: string | undefined | null): string {
  if (!desc) return '';
  const paragraphs = desc
    .split(/\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  return paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('');
}

export function buildGalleryHtml(toyId: string, galleryCount: number, alt: string): string {
  if (galleryCount <= 0) return '';
  
  const r2Url = site.r2Url;
  const images = Array.from({ length: galleryCount }, (_, i) => {
    const n = i + 1;
    return {
      t480: `${r2Url}/${toyId}/gallery-${n}-480.webp`,
      t960: `${r2Url}/${toyId}/gallery-${n}-960.webp`,
      t1600: `${r2Url}/${toyId}/gallery-${n}-1600.webp`,
    };
  });
  
  const mainImagesHtml = images.map((img, i) => `
    <img
      src="${img.t960}"
      srcset="${img.t480} 480w, ${img.t960} 960w, ${img.t1600} 1600w"
      sizes="(min-width: 1024px) 500px, 90vw"
      width="900"
      height="900"
      alt="${escapeHtml(alt)} — фото ${i + 1}"
      class="${i === 0 ? 'is-active' : ''}"
      data-main-img="${i}"
      loading="lazy"
      decoding="async"
    />
  `).join('');

  let thumbsHtml = '';
  if (images.length > 1) {
    const thumbItems = images.map((img, i) => `
      <li>
        <button
          type="button"
          class="thumb ${i === 0 ? 'is-active' : ''}"
          data-thumb="${i}"
          aria-label="Показати фото ${i + 1}"
        >
          <img
            src="${img.t480}"
            alt=""
            width="140"
            height="140"
            loading="lazy"
            decoding="async"
          />
        </button>
      </li>
    `).join('');
    
    thumbsHtml = `
      <ul class="gallery-thumbs">
        ${thumbItems}
      </ul>
    `;
  }

  return `
    <div class="gallery" data-gallery>
      <div class="gallery-main">
        ${mainImagesHtml}
      </div>
      ${thumbsHtml}
    </div>
  `;
}

export function buildSpinHtml(toyId: string, spinCount: number, alt: string): string {
  const r2Url = site.r2Url;
  
  if (spinCount <= 0) {
    const cover480 = `${r2Url}/${toyId}/cover-480.webp`;
    const cover960 = `${r2Url}/${toyId}/cover-960.webp`;
    const cover1600 = `${r2Url}/${toyId}/cover-1600.webp`;
    return `
      <img
        src="${cover960}"
        srcset="${cover480} 480w, ${cover960} 960w, ${cover1600} 1600w"
        sizes="(min-width: 1024px) 500px, 90vw"
        width="800"
        height="800"
        alt="${escapeHtml(alt)}"
      />
    `;
  }
  
  const frameUrls = Array.from({ length: spinCount }, (_, i) => {
    const n = String(i + 1).padStart(2, '0');
    return `${r2Url}/${toyId}/spin/frame-${n}.webp`;
  });
  const posterUrl = `${r2Url}/${toyId}/cover-960.webp`;
  
  return `
    <div class="spin" data-spin data-urls="${escapeHtml(JSON.stringify(frameUrls))}">
      <div
        class="spin-stage"
        tabindex="0"
        role="region"
        aria-label="Обертання іграшки: ${escapeHtml(alt)}. Використовуйте стрілки вліво та вправо"
      >
        <img
          class="spin-img"
          src="${posterUrl}"
          width="800"
          height="800"
          alt="${escapeHtml(alt)}"
          draggable="false"
        />
        <div class="spin-loader" data-loader>
          <span class="spin-spinner" aria-hidden="true"></span>
          <span>Завантаження…</span>
        </div>
        <div class="spin-hint" data-hint>
          <span aria-hidden="true">↔</span> Покрутіть мене
        </div>
      </div>
    </div>
  `;
}

export function buildCardHtml(toyId: string, data: any): string {
  const r2Url = site.r2Url;
  const isSold = data.status === 'sold';
  const priceFormatted = new Intl.NumberFormat('uk-UA').format(data.price);
  
  const cover480 = `${r2Url}/${toyId}/cover-480.webp`;
  const cover960 = `${r2Url}/${toyId}/cover-960.webp`;
  const cover1600 = `${r2Url}/${toyId}/cover-1600.webp`;
  
  const titleEscaped = escapeHtml(data.title);
  const sizeEscaped = data.size ? escapeHtml(data.size) : '';
  const statusLabel = statusLabels[data.status] || '';
  const statusClass = statusClasses[data.status] || '';
  
  const soldOverlayHtml = isSold 
    ? `<span class="sold-overlay">${escapeHtml(site.statusNotes.soldOverlay)}</span>` 
    : '';
    
  const sizeHtml = sizeEscaped 
    ? `<p class="card-size">${sizeEscaped}</p>` 
    : '';

  return `
<article class="card ${isSold ? 'is-sold' : ''}" data-toy-id="${escapeHtml(toyId)}">
  <a href="/igrashky/${escapeHtml(toyId)}/" class="card-link">
    <div class="card-media">
      <img
        src="${cover960}"
        srcset="${cover480} 480w, ${cover960} 960w, ${cover1600} 1600w"
        sizes="(min-width: 1024px) 360px, (min-width: 640px) 45vw, 90vw"
        width="600"
        height="800"
        alt="Іграшка «${titleEscaped}»"
        decoding="async"
      />
      <span class="${statusClass}" data-kv="status">${statusLabel}</span>
      ${soldOverlayHtml}
    </div>
    <div class="card-body">
      <h3 class="card-title" data-kv="title">${titleEscaped}</h3>
      ${sizeHtml}
      <p class="card-price"><span data-kv="price">${priceFormatted}</span> грн</p>
    </div>
  </a>
</article>
  `.trim();
}
