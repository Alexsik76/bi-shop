/// <reference types="@cloudflare/workers-types" />

import { verifyJwt } from '../auth';
import { site } from '../../../src/config';
import { escapeHtml, getUkrainianPlural } from '../../_helpers';

interface Env {
  TOYS_KV: KVNamespace;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  ADMIN_LOCAL_DEV?: string;
}

function formatDateUk(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  
  const monthsUk = [
    'січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
    'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'
  ];
  const day = date.getDate();
  const month = monthsUk[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  // 1. Authentication Check
  const localDev = env.ADMIN_LOCAL_DEV === '1';
  if (!localDev) {
    const jwt = request.headers.get('Cf-Access-Jwt-Assertion');
    if (!jwt) {
      return new Response('Forbidden: Missing Cf-Access-Jwt-Assertion header', { status: 403 });
    }

    const verified = await verifyJwt(jwt, env.CF_ACCESS_TEAM_DOMAIN, env.CF_ACCESS_AUD);
    if (!verified) {
      return new Response('Forbidden: Access JWT Verification Failed', { status: 403 });
    }
  }

  // 2. Extract and Validate ID
  const id = context.params.id as string;
  if (!id) {
    return new Response('Bad Request: Missing toy id', { status: 400 });
  }

  // 3. Fetch Toy from KV
  let recordJson: string | null = null;
  try {
    recordJson = await env.TOYS_KV.get(`toy:${id}`);
  } catch (err) {
    console.error(`Error reading KV for passport ${id}:`, err);
  }

  if (!recordJson) {
    return new Response('Not Found: Toy not found in KV', { status: 404 });
  }

  let data: any = {};
  try {
    data = JSON.parse(recordJson);
  } catch (err) {
    return new Response('Internal Error: Failed to parse KV record', { status: 500 });
  }

  const title = data.title || 'Без назви';
  const workNumber = data.workNumber || '';
  const finishedAt = data.finishedAt || '';
  const materials = data.materials || '';
  const size = data.size || '';
  const workHours = typeof data.workHours === 'number' ? data.workHours : null;

  const coverUrl = `${site.r2Url}/${id}/cover-480.webp`;

  const workHoursText = workHours 
    ? `${workHours} ${getUkrainianPlural(workHours, 'година', 'години', 'годин')}`
    : '';

  const html = `<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Паспорт іграшки — ${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-screen: #0f172a;
      --border-card: #e2e8f0;
      --text-main: #1e293b;
      --text-muted: #64748b;
      --text-dark: #0f172a;
      --accent: #4f46e5;
      --accent-hover: #6366f1;
      --font-title: 'Outfit', sans-serif;
      --font-body: 'Inter', sans-serif;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg-screen);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      font-family: var(--font-body);
      color: var(--text-main);
      padding: 40px 20px;
    }

    .no-print-toolbar {
      margin-bottom: 24px;
      display: flex;
      gap: 16px;
      align-items: center;
    }

    .btn-print {
      font-family: var(--font-title);
      font-weight: 600;
      font-size: 0.95rem;
      padding: 0.65rem 1.5rem;
      background-color: var(--accent);
      color: white;
      border: none;
      border-radius: 0.375rem;
      cursor: pointer;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      transition: background-color 0.2s ease, transform 0.1s ease;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    .btn-print:hover {
      background-color: var(--accent-hover);
    }

    .btn-print:active {
      transform: scale(0.98);
    }

    .btn-back {
      font-family: var(--font-title);
      font-weight: 500;
      font-size: 0.95rem;
      padding: 0.65rem 1.2rem;
      background-color: transparent;
      color: #94a3b8;
      border: 1px solid #334155;
      border-radius: 0.375rem;
      cursor: pointer;
      text-decoration: none;
      transition: color 0.2s ease, border-color 0.2s ease;
    }

    .btn-back:hover {
      color: white;
      border-color: #475569;
    }

    /* A6 Card Styles */
    .passport-card {
      width: 105mm;
      height: 148mm;
      background-color: #ffffff;
      border: 1px solid var(--border-card);
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.25), 0 10px 10px -5px rgba(0, 0, 0, 0.25);
      border-radius: 8px;
      padding: 8mm 8mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      position: relative;
      overflow: hidden;
    }

    /* Decorative Inner Frame */
    .passport-card::after {
      content: '';
      position: absolute;
      top: 3mm;
      left: 3mm;
      right: 3mm;
      bottom: 3mm;
      border: 1px solid #f1f5f9;
      pointer-events: none;
      border-radius: 6px;
    }

    .passport-card::before {
      content: '';
      position: absolute;
      top: 4.5mm;
      left: 4.5mm;
      right: 4.5mm;
      bottom: 4.5mm;
      border: 0.5px dashed #e2e8f0;
      pointer-events: none;
      border-radius: 4px;
    }

    .passport-header {
      text-align: center;
      margin-bottom: 2mm;
      z-index: 1;
    }

    .shop-title {
      font-family: var(--font-title);
      font-size: 8.5pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--accent);
    }

    .passport-image-container {
      width: 100%;
      height: 54mm;
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 3mm;
      border: 1px solid #f1f5f9;
      z-index: 1;
    }

    .passport-image {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .passport-title-section {
      text-align: center;
      margin-bottom: 3mm;
      z-index: 1;
    }

    .passport-title {
      font-family: var(--font-title);
      font-size: 14pt;
      font-weight: 700;
      color: var(--text-dark);
      line-height: 1.25;
    }

    .passport-work-number {
      font-size: 8.5pt;
      color: var(--text-muted);
      margin-top: 1mm;
      font-weight: 500;
    }

    .passport-details {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: auto;
      z-index: 1;
    }

    .passport-details tr {
      border-bottom: 1px solid #f8fafc;
    }

    .passport-details tr:last-child {
      border-bottom: none;
    }

    .passport-details th {
      text-align: left;
      font-size: 8pt;
      font-weight: 600;
      color: var(--text-muted);
      padding: 1.2mm 2mm 1.2mm 0;
      vertical-align: top;
      width: 32%;
    }

    .passport-details td {
      font-size: 8pt;
      color: var(--text-main);
      padding: 1.2mm 0;
      vertical-align: top;
      font-weight: 500;
    }

    .passport-footer {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-top: 1.5px dashed #cbd5e1;
      padding-top: 2.5mm;
      margin-top: 3mm;
      font-size: 7.5pt;
      font-weight: 500;
      color: var(--text-muted);
      z-index: 1;
    }

    .signature-line {
      font-weight: 600;
    }

    .site-domain {
      font-weight: 600;
      color: var(--accent);
    }

    /* Print Styles */
    @media print {
      body {
        background-color: #ffffff;
        padding: 0;
        margin: 0;
        display: block;
        min-height: auto;
      }

      .no-print {
        display: none !important;
      }

      .passport-card {
        border: none !important;
        box-shadow: none !important;
        margin: 0 !important;
        padding: 8mm 8mm !important;
        width: 105mm !important;
        height: 148mm !important;
        page-break-inside: avoid;
        border-radius: 0 !important;
      }

      @page {
        size: A6;
        margin: 0;
      }
    }
  </style>
</head>
<body>

  <div class="no-print-toolbar no-print">
    <a href="/admin#toy-card-${escapeHtml(id)}" class="btn-back">← До панелі</a>
    <button onclick="window.print()" class="btn-print">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
      Друкувати
    </button>
  </div>

  <div class="passport-card">
    <div class="passport-header">
      <div class="shop-title">Паспорт іграшки</div>
    </div>

    <div class="passport-image-container">
      <img src="${coverUrl}" class="passport-image" alt="${escapeHtml(title)}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'100%\\' height=\\'100%\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'%2394a3b8\\' stroke-width=\\'1\\'><rect x=\\'3\\' y=\\'3\\' width=\\'18\\' height=\\'18\\' rx=\\'2\\' ry=\\'2\\'/><circle cx=\\'8.5\\' cy=\\'8.5\\' r=\\'1.5\\'/><polyline points=\\'21 15 16 10 5 21\\'/></svg>';" />
    </div>

    <div class="passport-title-section">
      <h1 class="passport-title">${escapeHtml(title)}</h1>
      ${workNumber ? `<div class="passport-work-number">Робота № ${escapeHtml(workNumber)}</div>` : ''}
    </div>

    <table class="passport-details">
      ${materials ? `<tr><th>Матеріали:</th><td>${escapeHtml(materials)}</td></tr>` : ''}
      ${size ? `<tr><th>Розмір:</th><td>${escapeHtml(size)}</td></tr>` : ''}
      ${workHoursText ? `<tr><th>Ручна робота:</th><td>${escapeHtml(workHoursText)}</td></tr>` : ''}
      ${finishedAt ? `<tr><th>Завершено:</th><td>${escapeHtml(formatDateUk(finishedAt))}</td></tr>` : ''}
    </table>

    <div class="passport-footer">
      <div class="signature-line">Підпис майстрині: _________</div>
      <div class="site-domain">babusyni-igrashky.com.ua</div>
    </div>
  </div>

</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
};
