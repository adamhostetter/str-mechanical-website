/**
 * Cloudflare Pages multi-domain router + form-submission handler.
 *
 * Routing — same Pages project serves two custom domains:
 *   firstcallgroup.com        → FCG content (repo root files)
 *   firstcallmechanical.com   → FCM content (from /mechanical/* + the
 *                                /columbus, /dfw, /central-texas branch
 *                                files at root)
 *
 * Forms — POST /api/contact accepts form submissions from any of the 9
 * forms across both sites, looks up recipients by the `_form` hidden
 * field, and forwards the message via the Resend API. Recipients live in
 * FORM_ROUTING below; the Resend API key lives in env.RESEND_API_KEY
 * (set as a Cloudflare Pages secret, NEVER in the repo).
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // =========================================================================
    // Form submissions — same endpoint on both hosts
    // =========================================================================
    if (url.pathname === "/api/contact" && request.method === "POST") {
      return handleContactForm(request, env);
    }

    const host = url.hostname.replace(/^www\./, "");
    const path = url.pathname;

    // =========================================================================
    // firstcallmechanical.com
    // =========================================================================
    if (host === "firstcallmechanical.com") {
      const rewrites = {
        "/":           "/mechanical/index.html",
        "/locations":  "/mechanical/locations.html",
        "/careers":    "/mechanical/careers.html",
        "/contact":    "/mechanical/contact.html",
      };
      const stripped = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
      const target = rewrites[stripped];
      if (target) {
        const rewritten = new URL(target, url.origin);
        return env.ASSETS.fetch(new Request(rewritten, request));
      }

      if (path === "/index.html") {
        return Response.redirect("https://firstcallmechanical.com/" + url.search, 301);
      }

      if (/^\/(team|news|acquisitions)(\/.*)?$/.test(path)) {
        return Response.redirect(`https://firstcallgroup.com${path}${url.search}`, 301);
      }

      return env.ASSETS.fetch(request);
    }

    // =========================================================================
    // firstcallgroup.com
    // =========================================================================
    if (host === "firstcallgroup.com") {
      if (/^\/(columbus|dfw|central-texas)(\/.*)?$/.test(path)) {
        return Response.redirect(`https://firstcallmechanical.com${path}${url.search}`, 301);
      }

      if (path === "/mechanical" || path === "/mechanical/") {
        return Response.redirect("https://firstcallmechanical.com/" + url.search, 301);
      }
      if (path.startsWith("/mechanical/")) {
        const newPath = path.substring("/mechanical".length);
        return Response.redirect(`https://firstcallmechanical.com${newPath}${url.search}`, 301);
      }

      return env.ASSETS.fetch(request);
    }

    // Any other host (pages.dev preview, localhost, etc.) — serve as-is.
    return env.ASSETS.fetch(request);
  },
};

// =============================================================================
// Form-submission handler
// =============================================================================

// One row per form. Each value is the recipient list for that form.
// Adding a new form: add a row here AND set <input name="_form" value="..."> in the page.
const FORM_ROUTING = {
  "fcg-contact":          ["chris@firstcallgroup.com",          "Adam.Hostetter@firstcallgroup.com"],
  "fcg-acquisitions":     ["chris@firstcallgroup.com",          "Adam.Hostetter@firstcallgroup.com"],
  "fcm-contact":          ["info@firstcallgroup.com",           "Adam.Hostetter@firstcallgroup.com"],
  "fcm-columbus-service": ["serviceoh@firstcallmechanical.com", "Adam.Hostetter@firstcallgroup.com", "spriest@firstcallmechanical.com"],
  "fcm-dfw-service":      ["dispatch@firstcallmechanical.com",  "Adam.Hostetter@firstcallgroup.com", "scott.smith@firstcallmechanical.com"],
  "fcm-atx-service":      ["dispatch@firstcallmechanical.com",  "Adam.Hostetter@firstcallgroup.com", "scott.smith@firstcallmechanical.com"],
  "fcm-columbus-contact": ["serviceoh@firstcallmechanical.com", "Adam.Hostetter@firstcallgroup.com", "spriest@firstcallmechanical.com"],
  "fcm-dfw-contact":      ["dispatch@firstcallmechanical.com",  "Adam.Hostetter@firstcallgroup.com", "scott.smith@firstcallmechanical.com"],
  "fcm-atx-contact":      ["dispatch@firstcallmechanical.com",  "Adam.Hostetter@firstcallgroup.com", "scott.smith@firstcallmechanical.com"],
};

const FORM_LABELS = {
  "fcg-contact":          "FirstCall Group contact form",
  "fcg-acquisitions":     "FirstCall Group acquisitions inquiry",
  "fcm-contact":          "FirstCall Mechanical contact form",
  "fcm-columbus-service": "Columbus service request",
  "fcm-dfw-service":      "DFW service request",
  "fcm-atx-service":      "Austin service request",
  "fcm-columbus-contact": "Columbus contact form",
  "fcm-dfw-contact":      "DFW contact form",
  "fcm-atx-contact":      "Austin contact form",
};

// The "from" address must be on a domain you've verified in Resend.
// firstcallgroup.com should be verified (DNS records added to the Cloudflare
// zone for firstcallgroup.com).
const FROM_EMAIL = "FirstCall <noreply@firstcallgroup.com>";

async function handleContactForm(request, env) {
  try {
    // Parse body — accept JSON or form-encoded.
    const ct = request.headers.get("content-type") || "";
    const data = ct.includes("application/json")
      ? await request.json()
      : Object.fromEntries((await request.formData()).entries());

    // Honeypot: bots fill hidden fields. Pretend success, don't email.
    if (data._honeypot) {
      return jsonResp({ ok: true });
    }

    const formId = String(data._form || "").trim();
    const to = FORM_ROUTING[formId];
    if (!to) {
      return jsonResp({ error: `Unknown form id: ${formId}` }, 400);
    }

    const subject = buildSubject(formId, data);
    const html = renderEmailHTML(formId, data);
    const text = renderEmailText(formId, data);
    const replyTo =
      typeof data.email === "string" && /@/.test(data.email) ? data.email : undefined;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to,
        reply_to: replyTo,
        subject,
        html,
        text,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("Resend failure:", resp.status, errText);
      return jsonResp({ error: "Email delivery failed. Please try again or contact us directly." }, 502);
    }

    return jsonResp({ ok: true });
  } catch (e) {
    console.error("Form handler error:", e && e.stack || e);
    return jsonResp({ error: "Server error. Please try again." }, 500);
  }
}

function jsonResp(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function buildSubject(formId, data) {
  const label = FORM_LABELS[formId] || formId;
  const name = typeof data.name === "string" && data.name.trim() ? ` — ${data.name.trim()}` : "";
  return `[Web] ${label}${name}`;
}

function renderEmailHTML(formId, data) {
  const rows = Object.entries(data)
    .filter(([k]) => !k.startsWith("_"))
    .map(([k, v]) => `
      <tr>
        <td style="padding:6px 16px 6px 0; vertical-align:top; color:#5a6371; font-weight:600; white-space:nowrap">${esc(prettyLabel(k))}</td>
        <td style="padding:6px 0; vertical-align:top; white-space:pre-wrap; word-break:break-word">${esc(String(v ?? ""))}</td>
      </tr>`).join("");
  const label = FORM_LABELS[formId] || formId;
  return `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a2331;max-width:640px;margin:0 auto;padding:24px;background:#fcfbf7">
<div style="background:#fff;border:1px solid #e5e1d2;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(15,42,31,0.06)">
<h2 style="margin:0 0 4px 0;font-weight:700">New form submission</h2>
<p style="color:#5a6371;margin:0 0 16px 0;font-size:13px">${esc(label)} &mdash; <code style="background:#f4f2ea;padding:2px 6px;border-radius:4px">${esc(formId)}</code></p>
<table style="border-collapse:collapse;border-top:1px solid #e5e1d2;padding-top:12px;width:100%;font-size:14px">${rows}</table>
</div>
</body></html>`;
}

function renderEmailText(formId, data) {
  const label = FORM_LABELS[formId] || formId;
  const lines = [`New form submission`, label, `(${formId})`, ""];
  for (const [k, v] of Object.entries(data)) {
    if (k.startsWith("_")) continue;
    lines.push(`${prettyLabel(k)}: ${v}`);
  }
  return lines.join("\n");
}

function prettyLabel(k) {
  return k.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}
