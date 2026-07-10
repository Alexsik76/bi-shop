/// <reference types="@cloudflare/workers-types" />

import { site } from '../../src/config';

export function escapeHtml(str: string | undefined | null): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function isComplete(data: any): boolean {
  if (!data) return false;
  if (typeof data.title !== 'string' || data.title.trim() === '') return false;
  if (typeof data.price !== 'number' || isNaN(data.price) || data.price <= 0) return false;
  const validStatuses = ['available', 'made-to-order', 'sold'];
  if (!validStatuses.includes(data.status)) return false;
  return true;
}

export function renderAdminHtml(
  toys: any[],
  feedback?: { success?: string; errors?: string[]; toyId?: string; submittedValues?: any }
): string {
  const toysHtml = toys.map((toy) => {
    const id = toy.id;
    const isEditingThis = feedback && feedback.toyId === id && feedback.errors;
    const currentData = isEditingThis ? feedback.submittedValues : toy;
    
    const complete = isComplete(toy);
    const statusLabel = complete ? 'Опубліковано' : 'Приховано';
    const statusClass = complete ? 'status-published' : 'status-hidden';

    const title = currentData.title || '';
    const price = currentData.price !== undefined ? currentData.price : '';
    const size = currentData.size || '';
    const materials = currentData.materials || '';
    const status = currentData.status || '';
    const description = currentData.description || '';
    const galleryCount = currentData.galleryCount !== undefined ? currentData.galleryCount : 0;
    const spinCount = currentData.spinCount !== undefined ? currentData.spinCount : 0;
    const workNumber = currentData.workNumber || '';
    const workHours = currentData.workHours !== undefined ? currentData.workHours : '';
    let finishedAt = currentData.finishedAt || '';
    if (!finishedAt && !isEditingThis) {
      finishedAt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(new Date());
    }

    const errorListHtml = isEditingThis && feedback.errors && feedback.errors.length > 0
      ? `<div class="error-banner">
          <strong>Помилка збереження:</strong>
          <ul>
            ${feedback.errors.map(err => `<li>${escapeHtml(err)}</li>`).join('')}
          </ul>
         </div>`
      : '';

    const isSuccessThis = feedback && feedback.toyId === id && feedback.success;
    let successMessageHtml = '';
    if (isSuccessThis) {
      if (feedback.success === 'save') {
        successMessageHtml = `<div class="success-banner">Зміни успішно збережено!</div>`;
      } else if (feedback.success === 'delete') {
        successMessageHtml = `<div class="success-banner warning-banner">Запис видалено з KV. Іграшка прихована з сайту.</div>`;
      }
    }

    return `
      <div class="toy-card" id="toy-card-${escapeHtml(id)}">
        <div class="toy-card-header">
          <div class="toy-header-main">
            <img class="toy-thumbnail" src="${site.r2Url}/${id}/cover-480.webp" alt="${escapeHtml(title)}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'64\' height=\'64\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23475569\' stroke-width=\'2\'><rect x=\'3\' y=\'3\' width=\'18\' height=\'18\' rx=\'2\' ry=\'2\'/><circle cx=\'8.5\' cy=\'8.5\' r=\'1.5\'/><polyline points=\'21 15 16 10 5 21\'/></svg>';" />
            <div class="toy-info">
              <h2 class="toy-id">${escapeHtml(id)}</h2>
              <div class="toy-meta">
                <span class="meta-tag">Зображення: ✅ обкладинка</span>
                <span class="meta-tag">Галерея: ${galleryCount} шт</span>
                <span class="meta-tag">3D спін: ${spinCount > 0 ? '✅ є' : '❌ немає'}</span>
              </div>
            </div>
          </div>
          <span class="status-badge ${statusClass}">${statusLabel}</span>
        </div>

        ${errorListHtml}
        ${successMessageHtml}

        <form method="POST" action="/admin" class="toy-form">
          <input type="hidden" name="action" value="save">
          <input type="hidden" name="id" value="${escapeHtml(id)}">

          <div class="form-grid">
            <div class="form-group col-2">
              <label for="title-${escapeHtml(id)}">Назва іграшки <span class="required">*</span></label>
              <input type="text" id="title-${escapeHtml(id)}" name="title" value="${escapeHtml(title)}" max="200" required placeholder="Введіть назву іграшки">
            </div>

            <div class="form-group">
              <label for="price-${escapeHtml(id)}">Ціна (грн) <span class="required">*</span></label>
              <input type="number" id="price-${escapeHtml(id)}" name="price" value="${escapeHtml(String(price))}" min="0" step="any" required placeholder="1250">
            </div>

            <div class="form-group">
              <label for="status-${escapeHtml(id)}">Статус <span class="required">*</span></label>
              <select id="status-${escapeHtml(id)}" name="status" required>
                <option value="" disabled ${!status ? 'selected' : ''}>Оберіть статус</option>
                <option value="available" ${status === 'available' ? 'selected' : ''}>В наявності</option>
                <option value="made-to-order" ${status === 'made-to-order' ? 'selected' : ''}>Під замовлення</option>
                <option value="sold" ${status === 'sold' ? 'selected' : ''}>Продано</option>
              </select>
            </div>

            <div class="form-group">
              <label for="size-${escapeHtml(id)}">Розмір</label>
              <input type="text" id="size-${escapeHtml(id)}" name="size" value="${escapeHtml(size)}" placeholder="наприклад, 25 см">
            </div>

            <div class="form-group col-2">
              <label for="materials-${escapeHtml(id)}">Матеріали</label>
              <input type="text" id="materials-${escapeHtml(id)}" name="materials" value="${escapeHtml(materials)}" placeholder="наприклад, напіввовна, холлофайбер">
            </div>

            <div class="form-group">
              <label for="workNumber-${escapeHtml(id)}">Номер роботи</label>
              <input type="text" id="workNumber-${escapeHtml(id)}" name="workNumber" value="${escapeHtml(workNumber)}" placeholder="2026-14">
            </div>

            <div class="form-group">
              <label for="finishedAt-${escapeHtml(id)}">Дата завершення</label>
              <input type="date" id="finishedAt-${escapeHtml(id)}" name="finishedAt" value="${escapeHtml(finishedAt)}" lang="uk">
            </div>

            <div class="form-group">
              <label for="workHours-${escapeHtml(id)}">Годин роботи</label>
              <input type="number" id="workHours-${escapeHtml(id)}" name="workHours" value="${escapeHtml(String(workHours))}" min="1" step="1" placeholder="годин роботи">
            </div>

            <div class="form-group col-3">
              <label for="description-${escapeHtml(id)}">Опис іграшки (абзаци розділяються порожнім рядком або \\n)</label>
              <textarea id="description-${escapeHtml(id)}" name="description" rows="5" placeholder="Опис іграшки...">${escapeHtml(description)}</textarea>
            </div>

            <div class="form-group">
              <label for="galleryCount-${escapeHtml(id)}">Кількість фото галереї (тільки для читання)</label>
              <input type="number" id="galleryCount-${escapeHtml(id)}" value="${escapeHtml(String(galleryCount))}" disabled>
            </div>

            <div class="form-group">
              <label for="spinCount-${escapeHtml(id)}">Кількість кадрів обертання (тільки для читання)</label>
              <input type="number" id="spinCount-${escapeHtml(id)}" value="${escapeHtml(String(spinCount))}" disabled>
            </div>
          </div>

          <div class="form-actions">
            <a href="/admin/passport/${escapeHtml(id)}" target="_blank" class="btn btn-passport">Паспорт</a>
            <button type="submit" class="btn btn-save">Зберегти</button>
          </div>
        </form>

        <form method="POST" action="/admin" class="toy-delete-form" onsubmit="return confirm('Ви впевнені, що хочете видалити цей запис із KV? Іграшку буде приховано.');">
          <input type="hidden" name="action" value="delete">
          <input type="hidden" name="id" value="${escapeHtml(id)}">
          <button type="submit" class="btn btn-delete">Видалити з KV</button>
        </form>
      </div>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Панель керування — ${escapeHtml(site.name)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-primary: #0f172a;
      --bg-secondary: #1e293b;
      --bg-input: #0f172a;
      --text-primary: #f8fafc;
      --text-secondary: #94a3b8;
      --accent: #4f46e5;
      --accent-hover: #6366f1;
      --success: #10b981;
      --success-bg: rgba(16, 185, 129, 0.1);
      --warning: #f59e0b;
      --warning-bg: rgba(245, 158, 11, 0.1);
      --danger: #ef4444;
      --danger-bg: rgba(239, 68, 68, 0.1);
      --border: #334155;
      --border-focus: #6366f1;
      --font-title: 'Outfit', sans-serif;
      --font-body: 'Inter', sans-serif;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background-color: var(--bg-primary);
      color: var(--text-primary);
      font-family: var(--font-body);
      line-height: 1.5;
      padding: 2rem 1rem;
    }

    .container { max-width: 1000px; margin: 0 auto; }

    header {
      margin-bottom: 2.5rem;
      border-bottom: 1px solid var(--border);
      padding-bottom: 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
    }

    h1 {
      font-family: var(--font-title);
      font-size: 2.25rem;
      font-weight: 700;
      background: linear-gradient(135deg, #a5b4fc, #6366f1);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .header-subtitle { color: var(--text-secondary); font-size: 0.95rem; margin-top: 0.25rem; }

    .global-info {
      background-color: var(--bg-secondary);
      border: 1px solid var(--border);
      padding: 1rem;
      border-radius: 0.75rem;
      margin-bottom: 2rem;
      font-size: 0.9rem;
      color: var(--text-secondary);
    }

    .toy-card {
      background-color: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 1rem;
      padding: 2rem;
      margin-bottom: 2rem;
      position: relative;
      transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }

    .toy-card:hover {
      border-color: var(--border-focus);
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
    }

    .toy-card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1.5rem;
      border-bottom: 1px solid var(--border);
      padding-bottom: 1rem;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .toy-header-main {
      display: flex;
      align-items: center;
      gap: 1.25rem;
    }

    .toy-thumbnail {
      width: 64px;
      height: 64px;
      object-fit: cover;
      border-radius: 0.5rem;
      border: 1px solid var(--border);
      background-color: var(--bg-primary);
    }

    .toy-id { font-family: var(--font-title); font-size: 1.5rem; font-weight: 600; margin-bottom: 0.5rem; }

    .toy-meta { display: flex; gap: 0.75rem; flex-wrap: wrap; }

    .meta-tag {
      background-color: var(--bg-primary);
      border: 1px solid var(--border);
      border-radius: 9999px;
      padding: 0.25rem 0.75rem;
      font-size: 0.8rem;
      color: var(--text-secondary);
    }

    .status-badge {
      font-family: var(--font-title);
      font-weight: 500;
      font-size: 0.85rem;
      padding: 0.375rem 0.875rem;
      border-radius: 0.5rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .status-published {
      background-color: var(--success-bg);
      color: var(--success);
      border: 1px solid rgba(16, 185, 129, 0.3);
    }

    .status-hidden {
      background-color: var(--warning-bg);
      color: var(--warning);
      border: 1px solid rgba(245, 158, 11, 0.3);
    }

    .error-banner {
      background-color: var(--danger-bg);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #fca5a5;
      padding: 1rem;
      border-radius: 0.75rem;
      margin-bottom: 1.5rem;
      font-size: 0.9rem;
    }

    .error-banner ul { margin-left: 1.25rem; margin-top: 0.5rem; }

    .success-banner {
      background-color: var(--success-bg);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: #a7f3d0;
      padding: 1rem;
      border-radius: 0.75rem;
      margin-bottom: 1.5rem;
      font-size: 0.95rem;
      font-weight: 500;
    }

    .warning-banner {
      background-color: var(--danger-bg);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #fca5a5;
    }

    .form-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1.25rem;
      margin-bottom: 1.5rem;
    }

    .form-group { display: flex; flex-direction: column; gap: 0.5rem; }

    .col-2 { grid-column: span 2; }

    .col-3 { grid-column: span 3; }

    @media (max-width: 768px) {
      .form-grid { grid-template-columns: 1fr; }
      .col-2, .col-3 { grid-column: span 1; }
      .toy-card-header { flex-direction: column; align-items: flex-start; }
      .status-badge { align-self: flex-start; }
    }

    label { font-size: 0.875rem; font-weight: 500; color: var(--text-secondary); }

    .required { color: var(--danger); }

    input[type="text"], input[type="number"], select, textarea {
      background-color: var(--bg-input);
      color: var(--text-primary);
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      padding: 0.75rem;
      font-family: var(--font-body);
      font-size: 0.95rem;
      width: 100%;
      transition: border-color 0.2s ease;
    }

    input[type="text"]:focus, input[type="number"]:focus, select:focus, textarea:focus {
      outline: none;
      border-color: var(--border-focus);
    }

    select {
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2394a3b8'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 0.75rem center;
      background-size: 1.25rem;
      padding-right: 2.5rem;
    }

    textarea { resize: vertical; }

    .btn {
      font-family: var(--font-title);
      font-weight: 500;
      font-size: 0.95rem;
      padding: 0.75rem 1.5rem;
      border: none;
      border-radius: 0.5rem;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: background-color 0.2s ease, transform 0.1s ease;
    }

    .btn:active { transform: scale(0.98); }

    .btn-save { background-color: var(--accent); color: white; }

    .btn-save:hover { background-color: var(--accent-hover); }

    .btn-passport {
      background-color: transparent;
      border: 1px solid var(--accent);
      color: var(--accent);
      margin-right: 0.75rem;
      text-decoration: none;
    }

    .btn-passport:hover {
      background-color: rgba(79, 70, 229, 0.1);
    }

    .form-actions {
      display: flex;
      justify-content: flex-end;
      border-top: 1px solid var(--border);
      padding-top: 1.25rem;
    }

    .toy-delete-form { position: absolute; bottom: 2rem; left: 2rem; }

    .btn-delete {
      background-color: transparent;
      border: 1px solid var(--danger);
      color: var(--danger);
      font-size: 0.85rem;
      padding: 0.5rem 1rem;
    }

    .btn-delete:hover { background-color: var(--danger-bg); }

    @media (max-width: 768px) {
      .toy-card { padding-bottom: 4.5rem; }
      .toy-delete-form { bottom: 1.5rem; left: 1.5rem; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>Панель керування</h1>
        <p class="header-subtitle">${escapeHtml(site.name)} — редагування KV записів</p>
      </div>
    </header>
    <div class="global-info">
      <span>ℹ️ Панель призначена для редагування динамічних властивостей іграшок. Список іграшок формується на основі бази даних KV.</span>
    </div>
    <main>
      ${toysHtml}
    </main>
  </div>
</body>
</html>
`;
}
