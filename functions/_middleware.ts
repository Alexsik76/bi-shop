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
