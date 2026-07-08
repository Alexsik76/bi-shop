import { site } from '../src/config';

interface Env {
  TOYS_KV: KVNamespace;
}

const statusLabels: Record<string, string> = {
  'available': 'В наявності',
  'made-to-order': 'Під замовлення',
  'sold': 'Продано',
};

const statusClasses: Record<string, string> = {
  'available': 'badge badge-available',
  'made-to-order': 'badge badge-made-to-order',
  'sold': 'badge badge-sold',
};

const schemaAvailability: Record<string, string> = {
  'available': 'https://schema.org/InStock',
  'made-to-order': 'https://schema.org/PreOrder',
  'sold': 'https://schema.org/SoldOut',
};

function isVisible(data: any): boolean {
  if (!data) return false;
  if (typeof data.title !== 'string' || data.title.trim() === '') return false;
  if (typeof data.price !== 'number' || isNaN(data.price) || data.price <= 0) return false;
  const validStatuses = ['available', 'made-to-order', 'sold'];
  if (!validStatuses.includes(data.status)) return false;
  return true;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDescription(desc: string | undefined | null): string {
  if (!desc) return '';
  const paragraphs = desc
    .split(/\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  return paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('');
}

function buildGalleryHtml(toyId: string, galleryCount: number, alt: string): string {
  if (galleryCount <= 0) return '';
  
  const r2Url = site.r2Url;
  const images = Array.from({ length: galleryCount }, (_, i) => {
    const n = i + 1;
    return {
      full: `${r2Url}/${toyId}/gallery-${n}.webp`,
      sm: `${r2Url}/${toyId}/gallery-${n}-sm.webp`,
    };
  });
  
  const mainImagesHtml = images.map((img, i) => `
    <img
      src="${img.full}"
      srcset="${img.sm} 640w, ${img.full} 1200w"
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
            src="${img.full}"
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

function buildSpinHtml(toyId: string, spinCount: number, alt: string): string {
  const r2Url = site.r2Url;
  
  if (spinCount <= 0) {
    const coverUrl = `${r2Url}/${toyId}/cover.webp`;
    const coverSmUrl = `${r2Url}/${toyId}/cover-sm.webp`;
    return `
      <img
        src="${coverUrl}"
        srcset="${coverSmUrl} 640w, ${coverUrl} 1200w"
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
  const posterUrl = `${r2Url}/${toyId}/cover.webp`;
  
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

export const onRequest: PagesFunction<Env> = async (context) => {
  const request = context.request;
  if (request.method !== 'GET') {
    return context.next();
  }

  const url = new URL(request.url);
  const pathname = url.pathname;

  const isListingPage = pathname === '/' || pathname === '/index.html';
  const detailMatch = pathname.match(/^\/igrashky\/([^\/]+)\/?(?:index\.html)?$/);

  if (!isListingPage && !detailMatch) {
    return context.next();
  }

  if (detailMatch) {
    const toyId = detailMatch[1];
    let recordJson: string | null = null;
    try {
      recordJson = await context.env.TOYS_KV.get(`toy:${toyId}`);
    } catch (e) {
      // KV read failed
    }

    let toyData: any = null;
    if (recordJson) {
      try {
        toyData = JSON.parse(recordJson);
      } catch (e) {}
    }

    if (!isVisible(toyData)) {
      // Serve the static 404 page
      const url404 = new URL('/404.html', request.url);
      const response404 = await context.env.ASSETS.fetch(url404);
      return new Response(response404.body, {
        status: 404,
        headers: {
          ...Object.fromEntries(response404.headers),
          'content-type': 'text/html; charset=utf-8'
        }
      });
    }

    const response = await context.next();
    
    // We prepare the dynamic description paragraphs
    const descHtml = formatDescription(toyData.description);
    const priceFormatted = new Intl.NumberFormat('uk-UA').format(toyData.price);
    const sizeText = toyData.size ? `, ${toyData.size}` : '';
    const materialsText = toyData.materials ? `. Матеріали: ${toyData.materials}` : '';
    const priceText = priceFormatted ? `. Ціна ${priceFormatted} грн.` : '';
    const metaDesc = `${toyData.title} — м’яка іграшка ручної роботи${sizeText}${materialsText}${priceText}`;

    let scriptContent = '';
    
    let currentToyData = toyData;

    const rewriter = new HTMLRewriter()
      .on('[data-kv="status"]', {
        element(element) {
          const status = currentToyData.status;
          element.setInnerContent(statusLabels[status] || '');
          element.setAttribute('class', statusClasses[status] || '');
        }
      })
      .on('[data-kv="title"]', {
        element(element) {
          element.setInnerContent(escapeHtml(currentToyData.title));
        }
      })
      .on('[data-kv="price"]', {
        element(element) {
          element.setInnerContent(priceFormatted);
        }
      })
      .on('[data-kv="size"]', {
        element(element) {
          element.setInnerContent(escapeHtml(currentToyData.size || ''));
        }
      })
      .on('[data-kv="materials"]', {
        element(element) {
          element.setInnerContent(escapeHtml(currentToyData.materials || ''));
        }
      })
      .on('[data-kv="galleryCount"]', {
        element(element) {
          const count = typeof currentToyData.galleryCount === 'number' ? currentToyData.galleryCount : 0;
          element.setInnerContent(String(count));
        }
      })
      .on('[data-kv="spinCount"]', {
        element(element) {
          const count = typeof currentToyData.spinCount === 'number' ? currentToyData.spinCount : 0;
          element.setInnerContent(String(count));
        }
      })
      .on('#dynamic-gallery', {
        element(element) {
          const toyId = element.getAttribute('data-toy-id') || '';
          const alt = element.getAttribute('data-alt') || '';
          const count = typeof currentToyData.galleryCount === 'number' ? currentToyData.galleryCount : 0;
          element.setInnerContent(buildGalleryHtml(toyId, count, alt), { html: true });
        }
      })
      .on('#dynamic-spin', {
        element(element) {
          const toyId = element.getAttribute('data-toy-id') || '';
          const alt = element.getAttribute('data-alt') || '';
          const count = typeof currentToyData.spinCount === 'number' ? currentToyData.spinCount : 0;
          element.setInnerContent(buildSpinHtml(toyId, count, alt), { html: true });
        }
      })
      .on('[data-kv="description"]', {
        element(element) {
          element.setInnerContent(descHtml, { html: true });
          if (currentToyData.status === 'sold') {
            element.after(`<p class="sold-note">${escapeHtml(site.statusNotes.sold)}</p>`, { html: true });
          } else if (currentToyData.status === 'made-to-order') {
            element.after(`<p class="sold-note">${escapeHtml(site.statusNotes.madeToOrder)}</p>`, { html: true });
          }
        }
      })
      .on('.sold-note', {
        element(element) {
          element.remove();
        }
      })
      .on('.product-info a.btn', {
        element(element) {
          const href = element.getAttribute("href");
          if (href) {
            const match = href.match(/https:\/\/t\.me\/([^?]+)/);
            if (match) {
              const telegramUsername = match[1];
              const message = site.orderMessage.replace('{title}', currentToyData.title);
              element.setAttribute("href", `https://t.me/${telegramUsername}?text=${encodeURIComponent(message)}`);
            }
          }
        }
      })
      .on('script[type="application/ld+json"]', {
        text(textChunk) {
          scriptContent += textChunk.text;
          if (textChunk.lastInTextNode) {
            try {
              if (!scriptContent.trim()) {
                return;
              }
              const schemas = JSON.parse(scriptContent);
              if (Array.isArray(schemas)) {
                const product = schemas.find((s: any) => s['@type'] === 'Product');
                const breadcrumbs = schemas.find((s: any) => s['@type'] === 'BreadcrumbList');

                if (product) {
                  product.name = currentToyData.title;
                  if (product.offers) {
                    product.offers.price = String(currentToyData.price);
                    product.offers.availability = schemaAvailability[currentToyData.status] || 'https://schema.org/InStock';
                  }
                }

                if (breadcrumbs && Array.isArray(breadcrumbs.itemListElement)) {
                  const list = breadcrumbs.itemListElement;
                  if (list.length > 0) {
                    const lastItem = list[list.length - 1];
                    if (lastItem) {
                      lastItem.name = currentToyData.title;
                    }
                  }
                }
              }
              const serialized = JSON.stringify(schemas);
              textChunk.replace(serialized);
            } catch (e) {
              console.error("[JSON-LD Middleware Error]:", e);
              console.error("[JSON-LD Middleware Content]:", scriptContent);
              textChunk.replace(scriptContent);
            }
          } else {
            textChunk.remove();
          }
        }
      })
      .on('title', {
        element(element) {
          element.setInnerContent(`${escapeHtml(currentToyData.title)} — Бабусині іграшки`);
        }
      })
      .on('meta[name="description"]', {
        element(element) {
          element.setAttribute('content', escapeHtml(metaDesc));
        }
      })
      .on('meta[property="og:title"]', {
        element(element) {
          element.setAttribute('content', `${escapeHtml(currentToyData.title)} — Бабусині іграшки`);
        }
      })
      .on('meta[name="twitter:title"]', {
        element(element) {
          element.setAttribute('content', `${escapeHtml(currentToyData.title)} — Бабусині іграшки`);
        }
      })
      .on('meta[property="og:description"]', {
        element(element) {
          element.setAttribute('content', escapeHtml(metaDesc));
        }
      })
      .on('meta[name="twitter:description"]', {
        element(element) {
          element.setAttribute('content', escapeHtml(metaDesc));
        }
      });

    return rewriter.transform(response);
  }

  if (isListingPage) {
    const response = await context.next();
    
    let currentToyData: any = null;
    let shouldRemoveCurrent = false;

    const rewriter = new HTMLRewriter()
      .on('[data-toy-id]', {
        async element(element) {
          const toyId = element.getAttribute('data-toy-id');
          if (!toyId) {
            shouldRemoveCurrent = true;
            element.remove();
            return;
          }

          try {
            const recordJson = await context.env.TOYS_KV.get(`toy:${toyId}`);
            let data: any = null;
            if (recordJson) {
              data = JSON.parse(recordJson);
            }

            if (isVisible(data)) {
              currentToyData = data;
              shouldRemoveCurrent = false;

              // Overwrite the card classes depending on status
              const isSold = data.status === 'sold';
              let classAttr = element.getAttribute("class") || "";
              const classes = classAttr.split(/\s+/).filter(c => c !== "is-sold");
              if (isSold) {
                classes.push("is-sold");
              }
              element.setAttribute("class", classes.join(" "));
            } else {
              shouldRemoveCurrent = true;
              element.remove();
            }
          } catch (e) {
            shouldRemoveCurrent = true;
            element.remove();
          }
        }
      })
      .on('.card-media', {
        element(element) {
          if (shouldRemoveCurrent || !currentToyData) return;
          if (currentToyData.status === 'sold') {
            element.append(`<span class="sold-overlay">${escapeHtml(site.statusNotes.soldOverlay)}</span>`, { html: true });
          }
        }
      })
      .on('.sold-overlay', {
        element(element) {
          if (shouldRemoveCurrent || !currentToyData || currentToyData.status !== 'sold') {
            element.remove();
          }
        }
      })
      .on('[data-kv="status"]', {
        element(element) {
          if (shouldRemoveCurrent || !currentToyData) return;
          const status = currentToyData.status;
          element.setInnerContent(statusLabels[status] || '');
          element.setAttribute('class', statusClasses[status] || '');
        }
      })
      .on('[data-kv="title"]', {
        element(element) {
          if (shouldRemoveCurrent || !currentToyData) return;
          element.setInnerContent(escapeHtml(currentToyData.title));
        }
      })
      .on('[data-kv="price"]', {
        element(element) {
          if (shouldRemoveCurrent || !currentToyData) return;
          const formatted = new Intl.NumberFormat('uk-UA').format(currentToyData.price);
          element.setInnerContent(formatted);
        }
      });

    return rewriter.transform(response);
  }

  return context.next();
};
