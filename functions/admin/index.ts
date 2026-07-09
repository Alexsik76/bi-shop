/// <reference types="@cloudflare/workers-types" />

import { verifyJwt } from './auth';
import { renderAdminHtml } from './template';

interface Env {
  TOYS_KV: KVNamespace;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  ADMIN_LOCAL_DEV?: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);

  // 1. Authentication Check
  const localDev = env.ADMIN_LOCAL_DEV === '1';
  if (!localDev) {
    const jwt = request.headers.get('Cf-Access-Jwt-Assertion');
    if (!jwt) {
      return new Response('Forbidden: Missing Cf-Access-Jwt-Assertion header', { status: 403 });
    }

    // ДЕБАГ: Перевіряємо, чи взагалі існують змінні
    if (!env.CF_ACCESS_TEAM_DOMAIN || !env.CF_ACCESS_AUD) {
      return new Response(`Debug: Missing Env Vars! TEAM: ${!!env.CF_ACCESS_TEAM_DOMAIN}, AUD: ${!!env.CF_ACCESS_AUD}`, { status: 403 });
    }

    const cleanTeam = env.CF_ACCESS_TEAM_DOMAIN.trim();
    const cleanAud = env.CF_ACCESS_AUD.trim();

    // ДЕБАГ: Перевіряємо аудиторію "вручну" перед верифікацією
    try {
      const payloadPart = jwt.split('.')[1];
      const payload = JSON.parse(atob(payloadPart.replace(/-/g, '+').replace(/_/g, '/')));
      const audArray = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
      
      if (!audArray.includes(cleanAud)) {
        return new Response(`Debug: Audience mismatch!\nОчікували (Env): ${cleanAud}\nОтримали (JWT): ${JSON.stringify(payload.aud)}`, { status: 403 });
      }
    } catch (e: any) {
      return new Response(`Debug: Failed to parse JWT payload: ${e.message}`, { status: 403 });
    }

    const verified = await verifyJwt(jwt, cleanTeam, cleanAud);
    if (!verified) {
      return new Response('Debug: Signature verification or Fetching JWKS failed (Check Team Domain formatting)', { status: 403 });
    }
  }

  // 2. Fetch all toy:* keys and read their records from KV
  const toys: any[] = [];
  try {
    const list = await env.TOYS_KV.list({ prefix: "toy:" });
    for (const key of list.keys) {
      const id = key.name.replace(/^toy:/, '');
      let data: any = {};
      try {
        const record = await env.TOYS_KV.get(key.name);
        if (record) {
          data = JSON.parse(record);
        }
      } catch (err) {
        console.error(`Error reading KV record for ${key.name}`, err);
      }
      toys.push({
        id,
        title: data.title || '',
        price: data.price !== undefined ? data.price : '',
        size: data.size || '',
        materials: data.materials || '',
        status: data.status || '',
        description: data.description || '',
        galleryCount: data.galleryCount !== undefined ? data.galleryCount : 0,
        spinCount: data.spinCount !== undefined ? data.spinCount : 0,
        updatedAt: data.updatedAt || ''
      });
    }
  } catch (err) {
    console.error('Error listing KV keys:', err);
  }
  
  // Sort the list by ID ascending
  toys.sort((a, b) => a.id.localeCompare(b.id));

  // 3. Branch by Method
  if (request.method === 'POST') {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (err) {
      return new Response('Bad Request: Invalid Form Data', { status: 400 });
    }

    const action = formData.get('action') as string;
    const id = formData.get('id') as string;

    const toyExists = toys.some(t => t.id === id);
    if (!toyExists) {
      return new Response('Bad Request: Toy not found in KV', { status: 400 });
    }

    if (action === 'delete') {
      try {
        await env.TOYS_KV.delete(`toy:${id}`);
      } catch (err) {
        console.error(`Error deleting KV toy:${id}`, err);
        return new Response('Internal Server Error: Failed to delete key', { status: 500 });
      }
      return Response.redirect(new URL(`/admin?success=delete&toyId=${encodeURIComponent(id)}`, request.url), 303);
    }

    if (action === 'save') {
      const title = (formData.get('title') as string || '').trim();
      const priceRaw = (formData.get('price') as string || '').trim();
      const size = (formData.get('size') as string || '').trim();
      const materials = (formData.get('materials') as string || '').trim();
      const status = (formData.get('status') as string || '').trim();
      const description = (formData.get('description') as string || '');

      const errors: string[] = [];
      if (!title) {
        errors.push('Назва не повинна бути порожньою.');
      } else if (title.length > 200) {
        errors.push('Назва не повинна перевищувати 200 символів.');
      }

      const price = parseFloat(priceRaw);
      if (priceRaw === '' || isNaN(price) || !isFinite(price) || price < 0) {
        errors.push('Ціна повинна бути числом більшим або рівним 0.');
      }

      const validStatuses = ['available', 'made-to-order', 'sold'];
      if (!validStatuses.includes(status)) {
        errors.push('Виберіть дійсний статус зі списку.');
      }

      if (size.length > 200) {
        errors.push('Розмір не повинен перевищувати 200 символів.');
      }

      if (materials.length > 200) {
        errors.push('Матеріали не повинні перевищувати 200 символів.');
      }

      if (description.length > 4000) {
        errors.push('Опис не повинен перевищувати 4000 символів.');
      }

      // Load existing record to preserve galleryCount and spinCount
      let existingGalleryCount = 0;
      let existingSpinCount = 0;
      try {
        const existingRecord = await env.TOYS_KV.get(`toy:${id}`);
        if (existingRecord) {
          const parsed = JSON.parse(existingRecord);
          existingGalleryCount = typeof parsed.galleryCount === 'number' ? parsed.galleryCount : 0;
          existingSpinCount = typeof parsed.spinCount === 'number' ? parsed.spinCount : 0;
        }
      } catch (err) {
        console.error(`Error loading existing record to preserve counts for ${id}:`, err);
      }

      if (errors.length > 0) {
        const html = renderAdminHtml(toys, {
          errors,
          toyId: id,
          submittedValues: {
            title,
            price: isNaN(price) ? priceRaw : price,
            size,
            materials,
            status,
            description,
            galleryCount: existingGalleryCount,
            spinCount: existingSpinCount
          }
        });
        return new Response(html, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }

      const toyRecord = {
        title,
        price,
        size,
        materials,
        status,
        description,
        galleryCount: existingGalleryCount,
        spinCount: existingSpinCount,
        updatedAt: new Date().toISOString()
      };

      try {
        await env.TOYS_KV.put(`toy:${id}`, JSON.stringify(toyRecord));
      } catch (err) {
        console.error(`Error putting KV for toy:${id}`, err);
        return new Response('Internal Server Error: Failed to write to KV', { status: 500 });
      }

      return Response.redirect(new URL(`/admin?success=save&toyId=${encodeURIComponent(id)}`, request.url), 303);
    }

    return new Response('Bad Request: Unknown action', { status: 400 });
  }

  const successParam = url.searchParams.get('success');
  const toyIdParam = url.searchParams.get('toyId');
  let feedback = undefined;
  if (successParam && toyIdParam) {
    feedback = {
      success: successParam,
      toyId: toyIdParam
    };
  }

  const html = renderAdminHtml(toys, feedback);
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
};
