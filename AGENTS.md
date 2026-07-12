# AGENTS.md — Conventions for coding agents

Read this file before making any change. Follow it. If a task prompt contradicts this file, follow the prompt but flag the conflict in your report.

This is **Бабусині іграшки** — a static storefront for handmade knitted toys. Orders happen via messenger, not on the site. There is no cart, no checkout, no user accounts.

---

## Architecture (what this project is)

- **Astro 5, static output.** No SSR adapter. `astro build` → static HTML in `dist/`. Do **not** add `@astrojs/cloudflare` or any SSR adapter; the site is static by design.
- **Cloudflare Pages** hosts it. All dynamic behaviour lives at the edge in **Pages Functions** (`functions/`), not in the build.
- **Cloudflare KV** (`TOYS_KV`) is the single source of truth for every toy. An edge middleware reads KV at request time and renders toys into static shells.
- **Cloudflare R2** stores the images, served under `site.r2Url`. Image addresses are never stored — they are derived from the toy id plus image counts, using a fixed naming convention (see Data model).

Do not change the hosting or rendering model. If something seems to need SSR, stop and report instead of adding an adapter.

## Data model (single source of truth)

A toy's entire truth is its KV record. **There is no `index.md`, no `src/content` folder per toy, and no build-time toy discovery.** Toys are created by the external `bi-studio` backend (writes R2 + KV); their text fields are filled later in the admin panel.

- **Toy registry = KV keys.** The set of toys is the set of keys with prefix `toy:` in `TOYS_KV`, obtained via `env.TOYS_KV.list({ prefix: "toy:" })`. The toy id is the key with the `toy:` prefix stripped (key `toy:vedmedyk-tymko` -> id `vedmedyk-tymko`). The id is a transliterated slug of the toy's name; there is no `toy-NN` counter and no `slug` field.
- **KV record shape** (`toy:<id>`):
  `{ title, price (number), size, materials, status, description, galleryCount (int), spinCount (int), updatedAt, workNumber (string, optional), finishedAt (string, optional), workHours (number, optional) }`
  `workNumber` format is "YYYY-NN" (e.g. "2026-14"). `finishedAt` format is ISO date "YYYY-MM-DD". `workHours` is a positive integer.
  `status` in `available | made-to-order | sold`. `description` is flat text; a blank line or `\n` separates paragraphs. The admin panel and the middleware must use this **exact same** shape. If you change it, change both.
- **Images -> R2, addresses derived, never stored.** Given an id and the two counts, all addresses follow a fixed convention under `site.r2Url`:
  - cover (always exactly one): `<id>/cover-1600.webp`, `<id>/cover-960.webp`, `<id>/cover-480.webp`
  - gallery, for `n` in `1..galleryCount`: `<id>/gallery-<n>-1600.webp`, `<id>/gallery-<n>-960.webp`, `<id>/gallery-<n>-480.webp`
  - spin, for `n` in `1..spinCount` (zero-padded to 2 digits): `<id>/spin/frame-<NN>.webp`

  These three tiers (1600 / 960 / 480) exist for responsive `srcset`. Never invent other tier names or a `-sm` suffix.
- **Visibility.** A toy renders only if its KV record has non-empty `title`, `price > 0`, and a valid `status`. Missing record or any of these -> detail page 404, listing card omitted. The middleware enforces this; don't duplicate the check elsewhere. "How many toys to show" = "how many complete `toy:*` records exist", not how many files or shells.
- **Counts are read-only downstream.** `galleryCount` and `spinCount` are written by `bi-studio` to reflect what actually exists in R2. The admin panel and middleware **read** them; they must never let a human overwrite them, or the derived addresses will point at missing files.

## Where things live

- `functions/_middleware.ts` — edge middleware: enumerates `toy:*` keys for the listing, reads `toy:<id>` for detail pages, injects values into `data-kv` elements and the JSON-LD, derives image addresses, and hides incomplete toys.
- `functions/admin/` — admin panel. Lists toys by enumerating `toy:*` keys, edits the KV text fields. Auth is required (Cloudflare Access JWT); it must fail safe (403 by default) since Functions reach production once merged.
- `src/pages/igrashky/_toy/` — the single generic detail **shell** rendered by Astro at build time. The middleware fetches it via `ASSETS.fetch` and injects KV data for any valid id. There are no per-id detail pages.
- `src/pages/index.astro` — listing shell. Cards are injected/pruned at the edge from `toy:*` keys.
- `src/config.ts` — shared config: `name`, `telegram`, `orderMessage` template, `statusNotes`, `r2Url`. Put reusable strings here, not hardcoded in components or the middleware.
- `wrangler.toml` — Pages config: `pages_build_output_dir = "dist"`, `TOYS_KV` binding. Pages-format; do not add a Worker `main` entry-point or `[assets]`.

## Branches & deployment

- `main` = production (currently a coming-soon splash). Maps to the live domain.
- `dev` = ongoing work. Maps to a preview URL.
- Functions in `functions/` deploy to **both** preview and production. Anything you add there (e.g. `/admin`) becomes reachable on the live domain once merged — make sure it fails safe (auth required / 403 by default) before it can reach `main`.

---

## Hard conventions (these are the things that get violated)

1. **File size: keep source files small and modular.** Target under ~300 lines per file. If a file grows past that, split it into focused modules. Do not produce 500-800-line single files. Applies to `.ts`, `.mjs`, `.astro`, and Function code.
2. **Language:** all user-facing UI text in **Ukrainian**; all code comments in **English**.
3. **Toy id = transliterated slug of the name.** No `slug` field, no `toy-NN` counter anywhere.
4. **Image addresses are derived, never stored.** Build them from id + counts with the exact three-tier convention above. Never persist an image URL in KV.
5. **Price in JSON-LD is a bare number** (no thousands separators, no currency). Human-visible price may be formatted, but the `data-kv="price"` element must contain only the number and the `грн` label must stay outside it.
6. **Reusable copy goes in `src/config.ts`**, not hardcoded in components or the middleware.
7. **Do not touch the storefront shells or `_middleware.ts` unless the task asks for it.** If a task needs an incidental change there, make the minimum necessary and note it in the report.
8. **HTML-escape every value** rendered from KV or user input before putting it into a page.
9. **No secrets in code.** Namespace ids, team domains, audiences, tokens come from `wrangler.toml` bindings or environment variables.
10. **KV shape is one contract.** The admin panel writes it, the middleware reads it. A change to field names or types is a change to both, in the same task.

## Workflow

- **Do not push to git.** Make changes locally, then report.
- **Report back:** list files changed, any new dependency, how to run/verify, and any conflict with this file or with the task.
- **Edit only what the task asks.** Don't refactor unrelated code, rename things, or "improve" beyond scope.
- **Verify with automated means** — typecheck / `astro build`, not a browser and not ad-hoc `curl`. State exactly what you ran and what you observed.
- When unsure whether something needs SSR, a shape change, or a hosting change — **stop and ask in the report** rather than guessing.
