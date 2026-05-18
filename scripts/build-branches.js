#!/usr/bin/env node
/**
 * Hydrate shared/templates/branch.html with config.json into a fully-inlined
 * standalone HTML file (default: index.html).
 *
 * Run:  node scripts/build-branches.js [--config <path>] [--out <path>] [--quiet]
 *
 * Inlines:
 *   {{INLINE_CSS}}         ← tokens.css + base.css + components.css + branch.css
 *   {{INLINE_LOGO_WHITE}}  ← shared/img/logos/str-hero.svg (STR brand mark)
 *   {{INLINE_BRANCH_JS}}   ← shared/js/site.js
 *   {{INLINE_SERVICE_ICON key}} ← per-service stroke icon (matched on service key)
 *
 * Renders a minimal Mustache/Handlebars subset:
 *   {{field}}, {{nested.field}}, {{this}}, {{../field}},
 *   {{#each list}}...{{/each}}, {{#if field}}...{{/if}}.
 *
 * Limitations:
 *   - #each blocks cannot be nested inside another #each (lazy regex).
 *     The current template doesn't nest, so this is fine.
 *   - No HTML/JSON escaping. Config values flow through as-is — keep copy
 *     free of un-escaped <, >, ", &.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const QUIET = args.includes("--quiet");
const outArgIdx = args.indexOf("--out");
const cfgArgIdx = args.indexOf("--config");
const tplArgIdx = args.indexOf("--template");
const cssArgIdx = args.indexOf("--css");
const OUT_PATH = path.join(root, outArgIdx >= 0 ? args[outArgIdx + 1] : "index.html");
const CFG_PATH = cfgArgIdx >= 0 ? args[cfgArgIdx + 1] : "config.json";
const TPL_PATH = tplArgIdx >= 0 ? args[tplArgIdx + 1] : "shared/templates/branch.html";
const CSS_FILES = cssArgIdx >= 0
  ? args[cssArgIdx + 1].split(",").map(s => s.trim())
  : ["tokens.css", "base.css", "components.css", "branch.css"];

const log = (...a) => { if (!QUIET) console.log(...a); };
const warn = (...a) => console.warn("  ! " + a.join(" "));

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function stripXmlDecl(svg) {
  return svg.replace(/<\?xml[\s\S]*?\?>\s*/, "").trim();
}

/* ============================================================
   Service icon library
   Mirrors the inline SVGs in the manually-built columbus.html
   reference (Website Redesign repo). Replace with file-based
   lookup once shared/img/icons/ is populated.
   ============================================================ */
const SERVICE_ICONS = {
  hvac:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/><circle cx="12" cy="12" r="4"/></svg>',
  controls:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>',
  planned:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v6h-6"/></svg>',
  emergency: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10"/></svg>',
  projects:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/></svg>',
};

/* ============================================================
   Load config + apply defaults
   ============================================================ */
const config = JSON.parse(read(CFG_PATH));

if (config.copyrightYear == null) config.copyrightYear = String(new Date().getFullYear());
if (!config.industriesLead) {
  config.industriesLead = `We serve the buildings that keep ${config.shortName || "our region"}'s businesses — and their customers — running.`;
}
if (!config.careersUrl) {
  const careers = (config.navLinks || []).find(n => /career/i.test(n.label || ""));
  config.careersUrl = careers ? careers.href : "#";
}

/* ============================================================
   Validate — warn on empty required fields
   ============================================================ */
const REQUIRED = ["name", "shortName", "phone", "phoneE164", "email", "heroHeading", "heroParagraph"];
const missing = REQUIRED.filter(k => !config[k]);
if (missing.length) warn("config missing:", missing.join(", "));
if (!config.address || !config.address.street) warn("config.address incomplete");
if (!config.mapCoords || config.mapCoords.lat == null || config.mapCoords.lng == null) {
  warn("config.mapCoords incomplete — JSON-LD geo block will be malformed");
}

/* ============================================================
   Pre-process template: special directives → handlebars tokens
   ============================================================ */
let template = read(TPL_PATH);

// {{INLINE_SERVICE_ICON key}} carries a per-iteration field reference (key).
// Convert to a sentinel that lets the field renderer carry "key" through the
// services #each loop, then swap sentinels for SVGs in a final pass.
template = template.replace(
  /<!--\s*\{\{INLINE_SERVICE_ICON\s+(\w+)\}\}[^>]*-->/g,
  (_m, fieldName) => `__SVCICON_START__{{${fieldName}}}__SVCICON_END__`
);

/* ============================================================
   Renderer
   ============================================================ */
function getPath(dotted, ctx, parentStack) {
  if (dotted === "this") {
    return ctx && ctx.__primitive !== undefined ? ctx.__primitive : ctx;
  }
  if (dotted.startsWith("../")) {
    if (parentStack.length === 0) return undefined;
    const parent = parentStack[parentStack.length - 1];
    return getPath(dotted.slice(3), parent, parentStack.slice(0, -1));
  }
  let v = ctx;
  for (const part of dotted.split(".")) {
    if (v == null) return undefined;
    v = v[part];
  }
  return v;
}

function render(tpl, ctx, parentStack) {
  // 1. {{#each list}}...{{/each}}
  tpl = tpl.replace(
    /\{\{#each\s+([\w.]+)\}\}([\s\S]*?)\{\{\/each\}\}/g,
    (_m, key, body) => {
      const list = getPath(key, ctx, parentStack);
      if (!Array.isArray(list)) return "";
      return list.map(item => {
        const itemCtx = (item !== null && typeof item === "object")
          ? item
          : { __primitive: item };
        return render(body, itemCtx, parentStack.concat([ctx]));
      }).join("");
    }
  );

  // 2. {{#if cond}}...{{/if}}
  tpl = tpl.replace(
    /\{\{#if\s+([\w.]+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_m, key, body) => getPath(key, ctx, parentStack) ? render(body, ctx, parentStack) : ""
  );

  // 3. {{field}} / {{nested.field}} / {{this}} / {{../field}}
  //    Skip {{INLINE_*}} directives — they're handled below.
  tpl = tpl.replace(
    /\{\{\s*(?!INLINE_)((?:\.\.\/)?[\w./]+|this)\s*\}\}/g,
    (_m, key) => {
      const v = getPath(key, ctx, parentStack);
      return v == null ? "" : String(v);
    }
  );

  return tpl;
}

let out = render(template, config, []);

/* ============================================================
   Inline build directives
   ============================================================ */
const cssBundle = CSS_FILES
  .map(f => `/* ===== ${f} ===== */\n${read("shared/css/" + f)}`)
  .join("\n\n");

out = out.replace(/\/\*\s*\{\{INLINE_CSS\}\}\s*\*\//, () => cssBundle);

const logoWhite = stripXmlDecl(read("shared/img/logos/str-hero.svg"));
out = out.replace(/<!--\s*\{\{INLINE_LOGO_WHITE\}\}[^>]*-->/g, () => logoWhite);

const branchJs = read("shared/js/site.js");
out = out.replace(/\/\*\s*\{\{INLINE_BRANCH_JS\}\}[^*]*\*\//, () => branchJs);

// Service icons — resolve __SVCICON_START__<key>__SVCICON_END__ sentinels
out = out.replace(
  /__SVCICON_START__(\w+)__SVCICON_END__/g,
  (_m, key) => SERVICE_ICONS[key] || `<!-- unknown service icon: ${key} -->`
);

/* ============================================================
   Sanity check — flag any leftover handlebars markers
   ============================================================ */
const leftover = out.match(/\{\{[^}]+\}\}/g);
if (leftover) warn("unresolved markers:", [...new Set(leftover)].join(", "));

/* ============================================================
   Write
   ============================================================ */
fs.writeFileSync(OUT_PATH, out);
log(`✓ wrote ${path.relative(root, OUT_PATH)} (${(out.length / 1024).toFixed(1)} KB)`);
