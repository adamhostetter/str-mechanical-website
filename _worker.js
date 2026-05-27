/**
 * Cloudflare Pages Function — STR Mechanical (strmechanical.com)
 *
 * Handles POST /api/contact for the contact form on every STR branch page.
 * Looks up recipients by the `_form` hidden field, runs the 5-layer
 * anti-spam pipeline, and forwards the message via the Resend API. Any other
 * request falls through to the static-asset handler.
 *
 * Anti-spam (five layers, cheapest first; any match → silent ok so bots
 * can't tell the submission was rejected):
 *   1. Origin allowlist  — reject POSTs not coming from a known STR host
 *   2. Honeypot          — hidden _honeypot input filled = bot
 *   3. Min-submit-time   — JS writes _ts on page load; reject if elapsed < 3s
 *   4. Cloudflare Turnstile — siteverify the cf-turnstile-response token
 *                            (conditional: skipped when TURNSTILE_SECRET_KEY
 *                            is not set on the Pages project, so the worker
 *                            keeps working before the secret is wired up)
 *   5. Non-Latin script  — reject submissions whose user-supplied text
 *                          contains Cyrillic/CJK/Arabic/etc. STR operates in
 *                          the US in English + Spanish only. Latin-script
 *                          accented characters (ñ, á, é) pass through.
 *
 * Secrets — set in Cloudflare Pages → Settings → Variables and Secrets:
 *   RESEND_API_KEY         (re-use the same key as the FCG/FCM Pages project)
 *   TURNSTILE_SECRET_KEY   (per-site widget secret from dash.cloudflare.com/turnstile;
 *                          site key for the widget itself is 0x4AAAAAADTTEXP88lgQc1tE)
 *                          When unset, the Turnstile layer is skipped.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/contact" && request.method === "POST") {
      return handleContactForm(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};

// =============================================================================
// Form-submission handler
// =============================================================================

// One row per form. Each value is the recipient list for that form.
// Adding a new branch: add a row here AND set <input name="_form" value="..."> in the page.
const FORM_ROUTING = {
  "str-landing-contact":        ["ts@strmechanical.com", "Adam.Hostetter@firstcallgroup.com"],
  "str-charlotte-contact":      ["ts@strmechanical.com", "Adam.Hostetter@firstcallgroup.com"],
  "str-raleigh-durham-contact": ["ts@strmechanical.com", "Adam.Hostetter@firstcallgroup.com"],
  "str-virginia-beach-contact": ["ts@strmechanical.com", "Adam.Hostetter@firstcallgroup.com"],
  "str-greenville-contact":     ["scadmin@strmechanical.com", "Adam.Hostetter@firstcallgroup.com"],
};

const FORM_LABELS = {
  "str-landing-contact":        "STR Mechanical contact form (landing)",
  "str-charlotte-contact":      "STR Mechanical — Charlotte contact form",
  "str-raleigh-durham-contact": "STR Mechanical — Raleigh-Durham contact form",
  "str-virginia-beach-contact": "STR Mechanical — Virginia Beach contact form",
  "str-greenville-contact":     "STR Mechanical — Greenville contact form",
};

// The "from" address must be on a domain you've verified in Resend.
// firstcallgroup.com is already verified for the FCG/FCM project — reusing
// it here keeps STR's form working without a separate verification step.
// Switch to noreply@strmechanical.com once that domain is verified in Resend.
const FROM_EMAIL = "STR Mechanical <noreply@firstcallgroup.com>";

// Hostnames a contact-form POST is allowed to come from. Add the Pages preview
// hostname here if you want to test forms on Cloudflare preview deploys.
const ALLOWED_ORIGINS = new Set([
  "https://strmechanical.com",
  "https://www.strmechanical.com",
  "https://str-website.pages.dev",
]);

// Minimum time (ms) between page-load timestamp (_ts) and submission.
const MIN_SUBMIT_MS = 3000;

async function handleContactForm(request, env) {
  try {
    // Layer 1 — Origin allowlist. Direct API hammering won't carry the right header.
    const origin = request.headers.get("origin") || "";
    if (!ALLOWED_ORIGINS.has(origin)) {
      console.warn("Origin rejected:", origin);
      return silentOk();
    }

    const ct = request.headers.get("content-type") || "";
    const data = ct.includes("application/json")
      ? await request.json()
      : Object.fromEntries((await request.formData()).entries());

    // Layer 2 — Honeypot. Hidden field; humans never see it, bots fill everything.
    if (data._honeypot) {
      console.warn("Honeypot triggered");
      return silentOk();
    }

    // Layer 3 — Min-submit-time. _ts is set by site.js on DOMContentLoaded.
    const ts = parseInt(data._ts, 10);
    if (!Number.isFinite(ts) || Date.now() - ts < MIN_SUBMIT_MS) {
      console.warn("Time check failed: _ts=", data._ts, "elapsed=", Date.now() - ts);
      return silentOk();
    }

    // Layer 4 — Cloudflare Turnstile (conditional). If TURNSTILE_SECRET_KEY isn't
    // set on the Pages project yet, skip — the other 4 layers still protect the
    // form. When the secret IS set, the token becomes required.
    if (env.TURNSTILE_SECRET_KEY) {
      const turnstileToken = data["cf-turnstile-response"] || "";
      const turnstileOk = await verifyTurnstile(turnstileToken, request, env);
      if (!turnstileOk) {
        console.warn("Turnstile verify failed");
        return silentOk();
      }
    }

    // Layer 5 — Non-Latin script reject. English + Spanish only.
    const userText = [data.name, data.company, data.address, data.message]
      .filter(s => typeof s === "string")
      .join(" ");
    if (isLikelyForeignScript(userText)) {
      console.warn("Non-Latin script rejected");
      return silentOk();
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

async function verifyTurnstile(token, request, env) {
  if (!token || !env.TURNSTILE_SECRET_KEY) return false;
  const body = new URLSearchParams();
  body.append("secret", env.TURNSTILE_SECRET_KEY);
  body.append("response", token);
  const ip = request.headers.get("cf-connecting-ip");
  if (ip) body.append("remoteip", ip);
  try {
    const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
    });
    const json = await resp.json();
    return !!json.success;
  } catch (e) {
    console.error("Turnstile siteverify error:", e);
    return false;
  }
}

function silentOk() {
  return jsonResp({ ok: true });
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
    .filter(([k]) => !k.startsWith("_") && k !== "cf-turnstile-response")
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
    if (k.startsWith("_") || k === "cf-turnstile-response") continue;
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

// True if `text` contains more than a few characters from non-Latin scripts
// commonly used by foreign-language spam (Cyrillic, Arabic, Hebrew,
// Devanagari, Thai, CJK, Hangul). Allows Latin Extended (accents, ñ, á, é,
// ü, etc.) so English and Spanish pass through cleanly. Threshold > 3 chars
// to tolerate the occasional pasted symbol from a copy/paste.
function isLikelyForeignScript(text) {
  if (!text || typeof text !== "string") return false;
  const nonLatin = text.match(
    /[Ѐ-ӿԀ-ԯ֐-׿؀-ۿ܀-ݏऀ-ॿ฀-๿　-鿿가-힯]/g
  );
  return !!nonLatin && nonLatin.length > 3;
}
