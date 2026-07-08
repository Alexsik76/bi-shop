# AGENTS.md — Conventions for coding agents

Read this file before making any change. Follow it. If a task prompt contradicts this file, follow the prompt but flag the conflict in your report.

This is **Бабусині іграшки** — a static storefront for handmade knitted toys. Orders happen via messenger, not on the site. There is no cart, no checkout, no user accounts.

---

## Architecture (what this project is)

- **Astro 5, static output.** No SSR adapter. `astro build` → static HTML in `dist/`. Do **not** add `@astrojs/cloudflare` or any SSR adapter; the site is static by design.
- **Cloudflare Pages** hosts it. Dynamic behaviour lives at the edge in **Pages Functions** (`functions/`), not in the build.
- **Cloudflare KV** (`TOYS_KV`) holds the mutable per-toy data. An edge middleware injects it into the static pages at request time.

Do not change the hosting or rendering model. If something seems to need SSR, stop and report instead of adding an adapter.

## Where things live

- `src/content/igrashky/<id>/` — one folder per toy. `<id>` is the folder name and is the canonical toy id. **There is no `slug` field.**
- `index.md` in each toy folder holds **only the image manifest**: `cover`, `gallery`, optional `spinDir`. No title/price/size/materials/status, no body text — those are in KV.
- `functions/_middleware.ts` — edge middleware: reads `toy:<id>` from KV, injects values into `data-kv` elements and the JSON-LD, and hides incomplete toys.
- `functions/admin/` — admin panel (edits KV records).
- `src/config.ts` — shared config: Telegram username, order-message template, status-note texts. Put reusable strings here, not hardcoded in components or the middleware.
- `src/pages/toys.json.ts` — build-time manifest of toy ids.
- `scripts/` — photo pipeline (`new-toy.mjs` orchestrator, `prepare-photos.mjs`, `prepare-spin.mjs`).
- `wrangler.toml` — Pages config: `pages_build_output_dir = "dist"`, `TOYS_KV` binding. It is Pages-format; do not add a Worker `main` entry-point or `[assets]`.

## Data model (single source of truth per field)

- **Mutable fields → KV only.** `toy:<id>` = JSON `{ title, price (number), size, materials, status, description, updatedAt }`. `status` ∈ `available | made-to-order | sold`. `description` is flat text; blank line / `\n` separates paragraphs.
- **Images → `index.md` only.** Never move image references into KV.
- A toy is visible only if its KV record has non-empty `title`, `price > 0`, and a valid `status`. The middleware enforces this; don't duplicate the check elsewhere.
- The admin panel and the middleware must use the **exact same** KV JSON shape. If you change the shape, change both.

## Branches & deployment

- `main` = production (currently a coming-soon splash). Maps to the live domain.
- `dev` = ongoing work. Maps to a preview URL.
- Functions in `functions/` deploy to **both** preview and production. Anything you add there (e.g. `/admin`) becomes reachable on the live domain once merged — make sure it fails safe (auth required / 403 by default) before it can reach `main`.

---

## Hard conventions (these are the things that get violated)

1. **File size: keep source files small and modular.** Target under ~300 lines per file. If a file grows past that, split it into focused modules. Do not produce 500–800-line single files. This applies to `.ts`, `.mjs`, `.astro`, and Function code.
2. **Language:** all user-facing UI text in **Ukrainian**; all code comments in **English**.
3. **Toy id = folder name.** No `slug` field anywhere.
4. **Price in JSON-LD is a bare number** (no thousands separators, no currency). Human-visible price may be formatted, but the `data-kv="price"` element must contain only the number and the `грн` label must stay outside it.
5. **Reusable copy goes in `src/config.ts`**, not hardcoded in components or the middleware (e.g. order message, status notes).
6. **Do not touch the content schema, storefront templates, the photo pipeline, or `_middleware.ts` unless the task asks for it.** If a task needs an incidental change there, make the minimum necessary and note it in the report.
7. **HTML-escape every value** rendered from KV or user input before putting it into a page.
8. **No secrets in code.** Namespace ids, team domains, audiences, tokens come from `wrangler.toml` bindings or environment variables.

## Workflow

- **Do not push to git.** Make changes locally, then report.
- **Report back:** list files changed, any new dependency, how to run/verify, and any conflict with this file or with the task.
- **Edit only what the task asks.** Don't refactor unrelated code, rename things, or "improve" beyond scope.
- **Verify before reporting.** State exactly what you ran and what you observed (`npm run build`, `wrangler pages dev`, etc.).
- When unsure whether something needs SSR, a schema change, or a hosting change — **stop and ask in the report** rather than guessing.