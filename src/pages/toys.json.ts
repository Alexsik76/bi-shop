import { getCollection } from 'astro:content';
import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
  const toys = await getCollection('igrashky');
  const data = toys.map((toy) => ({
    id: toy.id,
    hasCover: !!toy.data.cover,
    galleryCount: Array.isArray(toy.data.gallery) ? toy.data.gallery.length : 0,
    hasSpin: !!toy.data.spinDir,
  }));

  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
};
