// Minimal static file server for local preview. No deps.
const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

const PORT = parseInt(process.env.PORT || "5173", 10);
const ROOT = path.resolve(__dirname, "..");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

http
  .createServer((req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(url.parse(req.url).pathname || "/");
    } catch (e) {
      res.writeHead(400);
      return res.end("bad url");
    }
    if (pathname === "/") pathname = "/index.html";

    // Resolve and ensure inside ROOT (prevent path traversal).
    let filePath = path.normalize(path.join(ROOT, pathname));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403);
      return res.end("forbidden");
    }

    // Directory index: if path ends in / or resolves to a directory, try /index.html inside it.
    // Extensionless: if path has no extension and file doesn't exist, try .html (matches Cloudflare Pages).
    const serve = (fp) => {
      const ext = path.extname(fp).toLowerCase();
      res.writeHead(200, {
        "content-type": MIME[ext] || "application/octet-stream",
        "cache-control": "no-store",
      });
      fs.createReadStream(fp).pipe(res);
    };

    const tryHtmlSibling = () => {
      // For extensionless paths, prefer <path>.html if it exists.
      // This handles the common case where /columbus.html is the page
      // and /columbus/ is a subdirectory of nested pages — Cloudflare
      // Pages serves /columbus from /columbus.html in that case.
      if (path.extname(filePath)) return false;
      const htmlPath = filePath + ".html";
      try {
        const st = fs.statSync(htmlPath);
        if (st.isFile()) { serve(htmlPath); return true; }
      } catch (_) {}
      return false;
    };

    fs.stat(filePath, (err, stat) => {
      if (!err && stat.isFile()) return serve(filePath);
      // For a directory: prefer <dir>.html if it exists (mirrors Cloudflare Pages),
      // otherwise fall back to <dir>/index.html.
      if (!err && stat.isDirectory()) {
        if (tryHtmlSibling()) return;
        const idx = path.join(filePath, "index.html");
        return fs.stat(idx, (e2, s2) => {
          if (!e2 && s2.isFile()) return serve(idx);
          res.writeHead(404, { "content-type": "text/plain" });
          return res.end("not found: " + pathname);
        });
      }
      // Path doesn't exist as file or dir — try <path>.html.
      if (tryHtmlSibling()) return;
      res.writeHead(404, { "content-type": "text/plain" });
      return res.end("not found: " + pathname);
    });
  })
  .listen(PORT, () => {
    console.log("static server on http://localhost:" + PORT);
  });
