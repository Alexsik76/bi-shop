/// <reference types="@cloudflare/workers-types" />
import { site } from '../src/config';
import {
  statusLabels,
  statusClasses,
  schemaAvailability,
  isVisible,
  escapeHtml,
  formatDescription,
  buildGalleryHtml,
  buildSpinHtml,
  buildCardHtml
} from './_helpers';

interface Env {
  TOYS_KV: KVNamespace;
  ASSETS: {
    fetch: typeof fetch;
  };
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
  const isDetailPage = !!detailMatch && detailMatch[1] !== '_toy';

  if (!isListingPage && !isDetailPage) {
    return context.next();
  }

  if (isDetailPage) {
    const toyId = detailMatch![1];
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

    const shellUrl = new URL('/igrashky/_toy/', request.url);
    const response = await context.env.ASSETS.fetch(shellUrl);
    
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
          const alt = element.getAttribute('data-alt') || '';
          const count = typeof currentToyData.galleryCount === 'number' ? currentToyData.galleryCount : 0;
          element.setInnerContent(buildGalleryHtml(toyId, count, alt), { html: true });
        }
      })
      .on('#dynamic-spin', {
        element(element) {
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
          element.setAttribute('content', `${escapeHtml(currentToyData.title)} —  Бабусині іграшки`);
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
    
    let keys: any[] = [];
    try {
      const list = await context.env.TOYS_KV.list({ prefix: "toy:" });
      keys = list.keys;
    } catch (e) {
      console.error("[Listing Middleware Error]: Failed to list KV keys", e);
    }

    const toys: { id: string; data: any }[] = [];
    for (const key of keys) {
      const toyId = key.name.replace(/^toy:/, '');
      try {
        const recordJson = await context.env.TOYS_KV.get(key.name);
        if (recordJson) {
          const data = JSON.parse(recordJson);
          if (isVisible(data)) {
            toys.push({ id: toyId, data });
          }
        }
      } catch (e) {
        console.error(`[Listing Middleware Error]: Failed to read KV record for ${key.name}`, e);
      }
    }

    const statusOrder: Record<string, number> = {
      'available': 0,
      'made-to-order': 1,
      'sold': 2,
    };
    toys.sort((a, b) => {
      const orderA = statusOrder[a.data.status] ?? 999;
      const orderB = statusOrder[b.data.status] ?? 999;
      return orderA - orderB;
    });

    const cardsHtml = toys.map((t) => buildCardHtml(t.id, t.data)).join('\n');

    const rewriter = new HTMLRewriter()
      .on('#catalog-grid', {
        element(element) {
          element.setInnerContent(cardsHtml, { html: true });
        }
      });

    return rewriter.transform(response);
  }

  return context.next();
};
