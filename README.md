# STR Mechanical

Standalone website for STR Mechanical (`strmechanical.com`), a FirstCall Group branch.

## Relationship to the FirstCall repo

This repo is **independent** of the main FirstCall website repo (sibling folder
`../firstcall_website/`, GitHub: `adamhostetter/firstcall-website`). The two
projects:

- Have separate git histories and separate GitHub repos.
- Started from the same `shared/` foundation (CSS tokens, components, base
  styles, vanilla JS, branch template, logos, map SVG).
- Are free to diverge — edits made here do **not** propagate back to FirstCall,
  and vice versa.

When the two should stay in sync (e.g., a brand token change that applies
everywhere), the change must be made in both repos. Run Claude Code from the
parent folder (`Strategic Projects/AI/website_code/`) to see both projects in
one session.

## Layout

```
STR Mechanical/
├── index.html                 ← starter landing page (replace as site develops)
├── config.json                ← STR-specific data (address, phone, services…)
├── _worker.js                 ← Cloudflare Worker (contact form handler, copied from FirstCall)
├── shared/
│   ├── css/                   ← tokens.css, base.css, components.css
│   ├── js/site.js
│   ├── img/{logos, icons, maps, photos/str, videos}
│   ├── partials/
│   └── templates/branch.html  ← canonical branch template (handlebars-style)
└── scripts/                   ← dev-server.js, wire-forms.js, build-directory.js
```

## Local development

```sh
node scripts/dev-server.js
```

Then open <http://localhost:8080>.

## Production inlining

Per the FirstCall pattern, production branch pages **inline** all CSS / JS /
logo SVGs so each page renders standalone with no sibling-file dependencies
(branch sites may live at different domains and shouldn't share runtime assets
cross-origin). The starter `index.html` here uses external `<link>` tags for
ease of editing — inline before publishing.

## TODOs

- [ ] Fill in `config.json` (phone, email, address, lat/lng, services copy)
- [ ] Source STR-specific photos → `shared/img/photos/str/`
- [ ] Decide direction: hydrate `shared/templates/branch.html` for fast launch,
      OR redesign `index.html` freehand for a custom look.
- [ ] Wire `_worker.js` to STR's Resend / contact email.
- [ ] Create GitHub repo and add as `origin`.

## Maintenance terminology

Hard rule inherited from FirstCall: **never** use "preventive" or
"preventative" with maintenance. Use **"planned maintenance"** only. Applies
to copy, headings, meta descriptions, alt text, schema, ARIA labels, file/URL
slugs, and link anchor text.
