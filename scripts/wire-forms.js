/**
 * Wire each FCG/FCM form to the /api/contact endpoint.
 *
 * For each (file, formId) pair:
 *   1. Change <form action="#" method="post" novalidate>
 *      to    <form action="/api/contact" method="POST" data-form-handler novalidate>
 *   2. Inject hidden _form input + honeypot input as the first form children
 *   3. Inject a [data-form-error] slot before the submit button
 *   4. Ensure <script src="/assets/js/form-handler.js" defer></script> is present
 *
 * mechanical/contact.html is auto-built from contact.html — its form id
 * (fcm-contact) is set by build-mechanical-sisters.js, not here.
 *
 * Run: node scripts/wire-forms.js
 */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");

const FORMS = [
  { file: "contact.html",               formId: "fcg-contact",          formClass: "contact-form" },
  { file: "acquisitions.html",          formId: "fcg-acquisitions",     formClass: "contact-form" },
  { file: "columbus.html",              formId: "fcm-columbus-service", formClass: "service-form" },
  { file: "dfw.html",                   formId: "fcm-dfw-service",      formClass: "service-form" },
  { file: "central-texas.html",         formId: "fcm-atx-service",      formClass: "service-form" },
  { file: "columbus/contact.html",      formId: "fcm-columbus-contact", formClass: "contact-form" },
  { file: "dfw/contact.html",           formId: "fcm-dfw-contact",      formClass: "contact-form" },
  { file: "central-texas/contact.html", formId: "fcm-atx-contact",      formClass: "contact-form" },
];

const HONEYPOT_HTML =
  '<input type="text" name="_honeypot" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none" />';

const ERROR_SLOT_HTML =
  '<div data-form-error role="alert" hidden style="margin-top:var(--space-4);padding:var(--space-3) var(--space-4);background:#FEF2F2;border:1px solid #FCA5A5;color:#7F1D1D;border-radius:8px;font-size:0.875rem"></div>';

const SCRIPT_TAG = '  <script src="/assets/js/form-handler.js" defer></script>\n';

function wireOne({ file, formId, formClass }) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) {
    console.warn(`  · missing: ${file}`);
    return;
  }
  let html = fs.readFileSync(full, "utf8");
  const before = html;

  // 1. Update the opening <form> tag.
  //    Match: <form class="<formClass>" action="#" method="post" novalidate>
  //    Or:    <form class="<formClass>" action="/api/contact" method="POST" data-form-handler novalidate>  (idempotent)
  const openTagRe = new RegExp(
    `<form\\s+class="${formClass}"[^>]*>`,
    "i"
  );
  const newOpenTag = `<form class="${formClass}" action="/api/contact" method="POST" data-form-handler novalidate>`;
  if (!openTagRe.test(html)) {
    console.warn(`  · no matching <form class="${formClass}"> in ${file}`);
    return;
  }
  html = html.replace(openTagRe, newOpenTag);

  // 2. Inject hidden inputs immediately after the opening <form> tag, but
  //    only if not already there. (Idempotent.)
  if (!html.includes(`name="_form" value="${formId}"`)) {
    const hidden =
      `\n            <input type="hidden" name="_form" value="${formId}" />` +
      `\n            ${HONEYPOT_HTML}`;
    html = html.replace(newOpenTag, newOpenTag + hidden);
  }

  // 3. Add an error slot just before the submit button if not present yet.
  //    The submit button uses .btn--primary and is the last button in the form;
  //    we anchor on the FIRST <button type="submit" ...> inside the form.
  if (!html.includes('data-form-error')) {
    // Find the closing </form> for this form and insert the error slot above
    // the submit button by anchoring on the submit button line.
    const submitRe = /(<button\s+[^>]*type="submit"[^>]*>)/i;
    html = html.replace(submitRe, `${ERROR_SLOT_HTML}\n            $1`);
  }

  // 4. Include the form-handler script once. Insert right before </body>.
  if (!html.includes("/assets/js/form-handler.js")) {
    html = html.replace(/<\/body>/i, SCRIPT_TAG + "</body>");
  }

  if (html !== before) {
    fs.writeFileSync(full, html, "utf8");
    console.log(`  ${file.padEnd(40)} wired (${formId})`);
  } else {
    console.log(`  ${file.padEnd(40)} already up to date`);
  }
}

console.log("Wiring forms to /api/contact:");
for (const f of FORMS) wireOne(f);
console.log("Done.");
