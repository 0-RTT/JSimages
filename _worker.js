const CONTENT_TYPE_MAP = {
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'gif': 'image/gif',
  'webp': 'image/webp',
  'bmp': 'image/bmp',
  'svg': 'image/svg+xml',
  'mp4': 'video/mp4',
  'avi': 'video/x-msvideo',
  'mov': 'video/quicktime',
  'webm': 'video/webm'
};

const ALLOWED_EXTENSIONS = new Set(Object.keys(CONTENT_TYPE_MAP));

const CACHE_CONFIG = {
  HTML: 3600,
  IMAGE: 86400,
  API: 300
};

/* =========================================================
   CORS（用于跨域脚本上传）
   ========================================================= */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400'
};

function withCors(response) {
  const headers = new Headers(response.headers);
  for (const k in CORS_HEADERS) headers.set(k, CORS_HEADERS[k]);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function extractConfig(env) {
  return {
    domain: env.DOMAIN,
    database: env.DATABASE,
    username: env.USERNAME,
    password: env.PASSWORD,
    adminPath: env.ADMIN_PATH || 'admin',
    enableAuth: env.ENABLE_AUTH === 'true',
    r2Bucket: env.R2_BUCKET,
    maxSize: (env.MAX_SIZE_MB ? parseInt(env.MAX_SIZE_MB, 10) : 10) * 1024 * 1024
  };
}

function createCachedResponse(body, contentType, cacheMaxAge) {
  return new Response(body, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': `public, max-age=${cacheMaxAge}`,
      'CDN-Cache-Control': `public, max-age=${cacheMaxAge}`
    }
  });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
}

function unauthorizedResponse() {
  return new Response('Unauthorized', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Admin"' }
  });
}

function getFileExtension(url) {
  try {
    const pathname = new URL(url, 'https://x').pathname;
    const dot = pathname.lastIndexOf('.');
    return dot > 0 ? pathname.slice(dot + 1).toLowerCase() : '';
  } catch {
    return '';
  }
}

function getContentType(extension) {
  return CONTENT_TYPE_MAP[extension] || 'application/octet-stream';
}

function extractR2KeyFromPath(pathname) {
  const clean = pathname.replace(/^\/+/, '');
  const dot = clean.lastIndexOf('.');
  if (dot <= 0) return '';
  return clean.slice(0, dot);
}

function parseRangeHeader(rangeHeader) {
  if (!rangeHeader) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!m) return null;
  const [, s, e] = m;
  if (s === '' && e === '') return null;
  if (s === '') {
    const suffix = parseInt(e, 10);
    if (isNaN(suffix) || suffix <= 0) return null;
    return { suffix };
  }
  const offset = parseInt(s, 10);
  if (isNaN(offset)) return null;
  if (e === '') return { offset };
  const end = parseInt(e, 10);
  if (isNaN(end) || end < offset) return null;
  return { offset, length: end - offset + 1 };
}

function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

function authenticate(request, username, password) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Basic ')) return false;
  try {
    const credentials = atob(authHeader.slice(6)).split(':');
    return credentials[0] === username && credentials[1] === password;
  } catch {
    return false;
  }
}

export default {
  async fetch(request, env) {
    try {
      // ⭐️ CORS 预检
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }

      const urlObj = new URL(request.url);
      const pathname = urlObj.pathname.replace(/\/+$/, '') || '/';
      const config = extractConfig(env);

      let response;
      switch (pathname) {
        case '/':
          response = await handleRootRequest(request, config);
          break;
        case `/${config.adminPath}`:
          response = await handleAdminRequest(request, config);
          break;
        case '/upload':
          response = request.method === 'POST'
            ? await handleUploadRequest(request, config)
            : new Response('Method Not Allowed', { status: 405 });
          break;
        case '/bing-images':
          response = await handleBingImagesRequest();
          break;
        case '/delete-images':
          response = await handleDeleteImagesRequest(request, config);
          break;
        default:
          response = await handleImageRequest(request, config);
      }
      return withCors(response);
    } catch (err) {
      console.error('Unhandled error:', err && err.stack || err);
      return withCors(jsonResponse({ error: 'Internal Server Error' }, 500));
    }
  }
};

/* =========================================================
   首页 HTML
   ========================================================= */
async function handleRootRequest(request, config) {
  if (config.enableAuth && !authenticate(request, config.username, config.password)) {
    return unauthorizedResponse();
  }

  const cache = caches.default;
  const urlObj = new URL(request.url);
  const cacheKey = new Request(`${urlObj.origin}/`);

  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const response = createCachedResponse(`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="description" content="JSimages-基于CloudFlare的图床服务">
<meta name="keywords" content="JSimages,Workers图床,Pages图床,R2储存,Cloudflare,Workers,图床">
<title>JSimages-基于CloudFlare的图床服务</title>
<link rel="icon" href="https://p1.meituan.net/csc/c195ee91001e783f39f41ffffbbcbd484286.ico" type="image/x-icon">
<style>
* { box-sizing: border-box; }
html { height: 100%; }
body {
  margin: 0;
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  background: #0a1020;
  overflow-x: hidden;
}
[hidden] { display: none !important; }

.background {
  position: fixed;
  inset: 0;
  z-index: 0;
  background-size: cover;
  background-position: center;
  transform: scale(1.08);
  transition: opacity 1.2s ease-in-out;
  opacity: 1;
}
.background::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 50% 38%, rgba(6,12,28,0) 22%, rgba(6,12,28,0.52) 100%),
    linear-gradient(180deg, rgba(6,12,28,0.16), rgba(6,12,28,0.38));
}

.card {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 480px;
  padding: 34px 28px 26px;
  border-radius: 32px;
  text-align: center;
  isolation: isolate;
  background:
    linear-gradient(140deg,
      rgba(255,255,255,0.60) 0%,
      rgba(255,255,255,0.30) 45%,
      rgba(255,255,255,0.48) 100%);
  backdrop-filter: blur(30px) saturate(180%) brightness(1.07);
  -webkit-backdrop-filter: blur(30px) saturate(180%) brightness(1.07);
  box-shadow:
    0 30px 70px -24px rgba(4,10,30,0.58),
    0 10px 26px -14px rgba(4,10,30,0.36),
    inset 0 1px 0 rgba(255,255,255,0.94),
    inset 0 -1px 0 rgba(255,255,255,0.28),
    inset 0 0 0 1px rgba(255,255,255,0.42);
  animation: cardIn 0.8s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.card::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  background: radial-gradient(460px circle at var(--mx, 50%) var(--my, -10%),
      rgba(255,255,255,0.60),
      rgba(255,255,255,0.08) 46%,
      transparent 72%);
  opacity: 0;
  transition: opacity 0.5s ease;
  pointer-events: none;
}
.card:hover::before { opacity: 1; }
.card::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  padding: 1px;
  background: linear-gradient(155deg,
      rgba(255,255,255,0.98) 0%,
      rgba(255,255,255,0.16) 28%,
      rgba(255,255,255,0.05) 55%,
      rgba(255,255,255,0.62) 100%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
  pointer-events: none;
}
@keyframes cardIn {
  from { opacity: 0; transform: translateY(22px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0)    scale(1); }
}

.title {
  margin: 0 0 22px;
  font-size: 30px;
  font-weight: 800;
  letter-spacing: 0.8px;
  background: linear-gradient(130deg, #4f46e5 0%, #7c3aed 45%, #0ea5e9 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
}

.icon-btn {
  position: absolute;
  top: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: none;
  border-radius: 12px;
  color: #4338ca;
  cursor: pointer;
  background: linear-gradient(140deg, rgba(255,255,255,0.78), rgba(255,255,255,0.40));
  backdrop-filter: blur(12px) saturate(160%);
  -webkit-backdrop-filter: blur(12px) saturate(160%);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.95),
    inset 0 0 0 1px rgba(255,255,255,0.55),
    0 6px 16px -8px rgba(30,41,90,0.55);
  transition: transform 0.25s ease, box-shadow 0.25s ease, color 0.25s ease;
}
.icon-btn:hover { transform: translateY(-2px) scale(1.05); color: #6d28d9; }
.icon-btn:active { transform: translateY(0) scale(0.96); }
.icon-btn:focus-visible { outline: 2px solid #6366f1; outline-offset: 2px; }
.icon-btn svg { width: 20px; height: 20px; display: block; }
#viewCacheBtn { right: 16px; }
#compressionToggleBtn { right: 60px; }

.upload-area {
  position: relative;
  display: block;
  padding: 32px 20px;
  border-radius: 24px;
  cursor: pointer;
  text-align: center;
  border: 1.5px dashed rgba(99, 102, 241, 0.55);
  background: linear-gradient(145deg, rgba(255,255,255,0.46), rgba(255,255,255,0.18));
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.85),
    0 10px 26px -20px rgba(30,41,90,0.7);
  transition: transform 0.3s ease, box-shadow 0.3s ease, background 0.3s ease, border-color 0.3s ease;
}
.upload-area:hover {
  border-color: #7c3aed;
  background: linear-gradient(145deg, rgba(255,255,255,0.62), rgba(255,255,255,0.30));
  transform: translateY(-2px);
}
.upload-area.dragover {
  border-color: #6d28d9;
  background: linear-gradient(145deg, rgba(224,231,255,0.85), rgba(255,255,255,0.45));
  transform: scale(1.015);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.95),
    0 0 0 4px rgba(129,140,248,0.25),
    0 18px 40px -22px rgba(79,70,229,0.7);
}
.upload-area:focus-within { outline: 2px solid #6366f1; outline-offset: 3px; }
.upload-area svg.upload-icon { width: 42px; height: 42px; color: #4f46e5; margin-bottom: 10px; }
.upload-text { color: #312e81; font-size: 15px; font-weight: 600; }
.upload-sub { color: #64748b; font-size: 12px; margin-top: 6px; }

.upload-area input[type="file"] {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

.upload-hint {
  color: #475569;
  font-size: 13px;
  margin-top: 15px;
  line-height: 1.6;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.upload-hint svg { width: 16px; height: 16px; color: #4f46e5; flex-shrink: 0; }

.form-group { margin-top: 20px; }

.btn {
  display: inline-block;
  padding: 9px 18px;
  border: none;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  margin: 0 4px 6px;
  transition: transform 0.25s ease, box-shadow 0.25s ease, color 0.25s ease;
}
.btn:focus-visible { outline: 2px solid #6366f1; outline-offset: 2px; }
.btn-light {
  color: #3730a3;
  background: linear-gradient(140deg, rgba(255,255,255,0.82), rgba(255,255,255,0.48));
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.95),
    inset 0 0 0 1px rgba(255,255,255,0.62),
    0 8px 18px -12px rgba(30,41,90,0.8);
}
.btn-light:hover { transform: translateY(-2px); color: #6d28d9; }
.btn-light:active { transform: translateY(0) scale(0.97); }

.link-textarea {
  width: 100%;
  padding: 12px 14px;
  border-radius: 14px;
  font-size: 13px;
  font-family: inherit;
  resize: none;
  max-height: 200px;
  overflow-y: hidden;
  outline: none;
  color: #1e293b;
  border: 1px solid rgba(255,255,255,0.72);
  background: rgba(255,255,255,0.52);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow: inset 0 1px 4px rgba(30,41,90,0.08);
  transition: border-color 0.2s, box-shadow 0.2s;
}
.link-textarea:focus {
  border-color: #818cf8;
  box-shadow: inset 0 1px 4px rgba(30,41,90,0.08), 0 0 0 3px rgba(129,140,248,0.25);
}

.upload-progress { display: none; margin-top: 16px; text-align: center; }
.upload-progress.show { display: block; }
.progress-text { font-size: 14px; font-weight: 600; color: #3730a3; letter-spacing: 0.5px; }

.thumbnail-container {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 15px;
  justify-content: center;
}
.thumbnail-item {
  position: relative;
  width: 80px; height: 80px;
  border-radius: 16px;
  overflow: hidden;
  box-shadow:
    0 10px 22px -12px rgba(30,41,90,0.75),
    inset 0 0 0 1px rgba(255,255,255,0.6);
  transition: transform 0.25s ease;
}
.thumbnail-item:hover { transform: scale(1.06) rotate(-1deg); }
.thumbnail-item img,
.thumbnail-item video { width: 100%; height: 100%; object-fit: cover; display: block; }
.thumbnail-item .file-icon {
  width: 100%; height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(99,102,241,0.9), rgba(139,92,246,0.9));
  color: #fff;
  font-size: 12px;
  font-weight: 700;
}
.thumbnail-item .remove-btn {
  position: absolute;
  top: 3px; right: 3px;
  width: 20px; height: 20px;
  border-radius: 50%;
  background: rgba(15,23,42,0.6);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  color: #fff;
  border: none;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s ease;
  padding: 0;
}
.thumbnail-item:hover .remove-btn { opacity: 1; }

.cache-content {
  margin-top: 20px;
  max-height: 250px;
  overflow-y: auto;
  border-radius: 16px;
  padding: 2px;
}
.cache-item {
  display: block;
  cursor: pointer;
  border-radius: 14px;
  text-align: left;
  padding: 13px 16px;
  margin-bottom: 8px;
  font-size: 13px;
  color: #334155;
  word-break: break-all;
  background: linear-gradient(140deg, rgba(255,255,255,0.72), rgba(255,255,255,0.40));
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.92),
    inset 0 0 0 1px rgba(255,255,255,0.55),
    0 8px 18px -14px rgba(30,41,90,0.85);
  transition: transform 0.25s ease, box-shadow 0.25s ease;
}
.cache-item:hover {
  transform: translateX(5px);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.95),
    inset 0 0 0 1px rgba(129,140,248,0.5),
    0 12px 24px -14px rgba(79,70,229,0.7);
}
.cache-empty {
  text-align: center;
  color: #64748b;
  padding: 22px;
  font-size: 14px;
}

.project-link {
  font-size: 13px;
  text-align: center;
  margin: 18px 0 0;
  color: #475569;
  line-height: 1.6;
}
.project-link a { color: #4f46e5; text-decoration: none; font-weight: 600; }
.project-link a:hover { color: #7c3aed; text-decoration: underline; }

/* ===== 右上角玻璃 Toast ===== */
.toast-stack {
  position: fixed;
  top: 22px;
  right: 22px;
  z-index: 2147483000;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  pointer-events: none;
}
.glass-toast {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  border-radius: 16px;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.2px;
  color: #1e293b;
  max-width: min(80vw, 320px);
  opacity: 0;
  transform: translateY(-10px) scale(0.96);
  transition:
    opacity 0.34s ease,
    transform 0.42s cubic-bezier(0.22, 1, 0.36, 1);
  will-change: opacity, transform;
  background: linear-gradient(140deg, rgba(255,255,255,0.86), rgba(255,255,255,0.56));
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  box-shadow:
    0 18px 44px -22px rgba(15,23,42,0.60),
    inset 0 1px 0 rgba(255,255,255,0.96),
    inset 0 -1px 0 rgba(255,255,255,0.30),
    inset 0 0 0 1px rgba(255,255,255,0.60);
}
.glass-toast.is-in { opacity: 1; transform: translateY(0) scale(1); }
.glass-toast.is-out { opacity: 0; transform: translateY(-8px) scale(0.97); }
.glass-toast__dot {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #3b82f6;
  box-shadow: 0 0 9px 1px rgba(59,130,246,0.85);
}
.glass-toast--success { color: #065f46; }
.glass-toast--success .glass-toast__dot { background: #10b981; box-shadow: 0 0 9px 1px rgba(16,185,129,0.9); }
.glass-toast--error { color: #991b1b; }
.glass-toast--error .glass-toast__dot { background: #ef4444; box-shadow: 0 0 9px 1px rgba(239,68,68,0.9); }
.glass-toast--warning { color: #92400e; }
.glass-toast--warning .glass-toast__dot { background: #f59e0b; box-shadow: 0 0 9px 1px rgba(245,158,11,0.9); }

/* ===== 玻璃确认框 ===== */
.glass-overlay {
  position: fixed;
  inset: 0;
  z-index: 2147483200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(10,16,32,0.28);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  opacity: 0;
  transition: opacity 0.24s ease;
}
.glass-overlay.is-open { opacity: 1; }
.glass-dialog {
  width: 100%;
  max-width: 360px;
  padding: 26px 24px 20px;
  border-radius: 28px;
  text-align: center;
  background:
    linear-gradient(140deg, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0.42) 50%, rgba(255,255,255,0.62) 100%);
  backdrop-filter: blur(30px) saturate(180%);
  -webkit-backdrop-filter: blur(30px) saturate(180%);
  box-shadow:
    0 30px 70px -24px rgba(4,10,30,0.58),
    inset 0 1px 0 rgba(255,255,255,0.95),
    inset 0 0 0 1px rgba(255,255,255,0.55);
  transform: scale(0.92) translateY(12px);
  transition: transform 0.34s cubic-bezier(0.22, 1, 0.36, 1);
}
.glass-overlay.is-open .glass-dialog { transform: scale(1) translateY(0); }
.glass-dialog__title { margin: 0 0 10px; font-size: 18px; font-weight: 700; color: #1e1b4b; }
.glass-dialog__text { margin: 0 0 22px; font-size: 14px; line-height: 1.6; color: #475569; }
.glass-dialog__actions { display: flex; gap: 10px; }
.glass-btn {
  flex: 1;
  padding: 12px 18px;
  border: none;
  border-radius: 14px;
  font-size: 15px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.25s ease;
}
.glass-btn:active { transform: scale(0.97); }
.glass-btn--ghost {
  color: #334155;
  background: rgba(255,255,255,0.62);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.75), 0 4px 12px -8px rgba(15,30,60,0.6);
}
.glass-btn--primary {
  color: #fff;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  box-shadow: 0 12px 24px -12px rgba(99,102,241,0.95);
}
.glass-btn--danger {
  color: #fff;
  background: linear-gradient(135deg, #ef4444, #db2777);
  box-shadow: 0 12px 24px -12px rgba(239,68,68,0.95);
}

@media (max-width: 768px) {
  .card { padding: 26px 20px 20px; border-radius: 26px; }
  .title { font-size: 24px; }
  .icon-btn { width: 34px; height: 34px; }
  .icon-btn svg { width: 18px; height: 18px; }
  .toast-stack { top: 14px; right: 14px; left: 14px; align-items: stretch; }
  .glass-toast { max-width: none; }
}
</style>
</head>
<body>
  <div class="background" id="bg1"></div>
  <div class="background" id="bg2" style="opacity: 0;"></div>

  <div class="card">
    <div class="title">JSimages</div>

    <button type="button" class="icon-btn" id="viewCacheBtn" title="查看历史记录" aria-label="查看历史记录">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
    </button>

    <button type="button" class="icon-btn" id="compressionToggleBtn" aria-label="切换压缩">
      <svg id="compressIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>
      </svg>
    </button>

    <label class="upload-area" id="uploadArea">
      <svg class="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
      <div class="upload-text">点击选择文件 / 拖拽到此处</div>
      <div class="upload-sub">支持多文件 · Ctrl+V 粘贴</div>
      <input type="file" id="fileInput" multiple aria-label="选择要上传的文件">
    </label>

    <div class="upload-hint">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="16" x2="12" y2="12"/>
        <line x1="12" y1="8" x2="12.01" y2="8"/>
      </svg>
      <span>支持多文件上传 · Ctrl+V 粘贴上传</span>
    </div>

    <div class="form-group" id="formatButtons" hidden>
      <button type="button" class="btn btn-light" data-format="url">URL</button>
      <button type="button" class="btn btn-light" data-format="bbcode">BBCode</button>
      <button type="button" class="btn btn-light" data-format="markdown">Markdown</button>
    </div>

    <div class="form-group" id="linkGroup" hidden>
      <textarea class="link-textarea" id="fileLink" readonly placeholder="上传成功后的链接会显示在这里"></textarea>
    </div>

    <div class="upload-progress" id="uploadProgress">
      <div class="progress-text" id="progressText">上传中... 0%</div>
    </div>

    <div class="thumbnail-container" id="thumbnailContainer"></div>
    <div class="cache-content" id="cacheContent" hidden></div>

    <p class="project-link">
      项目开源于 GitHub -
      <a href="https://github.com/0-RTT/JSimages" target="_blank" rel="noopener noreferrer">0-RTT/JSimages</a>
    </p>
  </div>

  <script>
  /* ============ 右上角玻璃 Toast + 玻璃确认框 ============ */
  (function () {
    'use strict';
    if (window.__jsimagesNotify) return;
    window.__jsimagesNotify = true;

    var stack = null;

    function ensureStack() {
      if (stack && stack.isConnected) return stack;
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      stack.setAttribute('role', 'status');
      stack.setAttribute('aria-live', 'polite');
      document.body.appendChild(stack);
      return stack;
    }

    window.showToast = function (text, type, duration) {
      var t = ['success', 'error', 'warning', 'info'].indexOf(type) === -1 ? 'info' : type;
      var d = typeof duration === 'number' ? duration : 1800;

      var el = document.createElement('div');
      el.className = 'glass-toast glass-toast--' + t;

      var dot = document.createElement('i');
      dot.className = 'glass-toast__dot';

      var span = document.createElement('span');
      span.textContent = String(text == null ? '' : text);

      el.appendChild(dot);
      el.appendChild(span);
      ensureStack().appendChild(el);

      requestAnimationFrame(function () { el.classList.add('is-in'); });

      var closed = false;
      function close() {
        if (closed) return;
        closed = true;
        el.classList.remove('is-in');
        el.classList.add('is-out');
        setTimeout(function () { el.remove(); }, 380);
      }

      if (d > 0) setTimeout(close, d);
      return { close: close };
    };

    /* 兼容旧调用名 */
    window.danmaku = window.showToast;

    window.glassConfirm = function (message, opts) {
      opts = opts || {};
      return new Promise(function (resolve) {
        var overlay = document.createElement('div');
        overlay.className = 'glass-overlay';

        var box = document.createElement('div');
        box.className = 'glass-dialog';

        var title = document.createElement('h3');
        title.className = 'glass-dialog__title';
        title.textContent = opts.title || '请确认';

        var text = document.createElement('p');
        text.className = 'glass-dialog__text';
        text.textContent = message;

        var actions = document.createElement('div');
        actions.className = 'glass-dialog__actions';

        var cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'glass-btn glass-btn--ghost';
        cancel.textContent = opts.cancelText || '取消';

        var ok = document.createElement('button');
        ok.type = 'button';
        ok.className = 'glass-btn ' + (opts.danger === false ? 'glass-btn--primary' : 'glass-btn--danger');
        ok.textContent = opts.okText || '确定';

        actions.appendChild(cancel);
        actions.appendChild(ok);
        box.appendChild(title);
        box.appendChild(text);
        box.appendChild(actions);
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        requestAnimationFrame(function () { overlay.classList.add('is-open'); });

        var settled = false;
        function done(value) {
          if (settled) return;
          settled = true;
          document.removeEventListener('keydown', onKey);
          overlay.classList.remove('is-open');
          setTimeout(function () { overlay.remove(); }, 240);
          resolve(value);
        }
        function onKey(e) { if (e.key === 'Escape') done(false); }

        cancel.addEventListener('click', function () { done(false); });
        ok.addEventListener('click', function () { done(true); });
        overlay.addEventListener('click', function (e) { if (e.target === overlay) done(false); });
        document.addEventListener('keydown', onKey);
      });
    };
  })();

  /* ============ 页面业务逻辑 ============ */
  (function () {
    'use strict';

    var originalImageURLs = [];
    var thumbnailData = [];
    var isCacheVisible = false;
    var enableCompression = true;
    var uploadCache = JSON.parse(localStorage.getItem('uploadCache') || '[]');

    document.querySelectorAll('.card').forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        el.style.setProperty('--my', (e.clientY - r.top) + 'px');
      });
      el.addEventListener('pointerleave', function () {
        el.style.setProperty('--mx', '50%');
        el.style.setProperty('--my', '-10%');
      });
    });

    var COMPRESS_PATH = '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>';
    var EXPAND_PATH   = '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>';

    function refreshCompressionBtn() {
      var icon = document.getElementById('compressIcon');
      var btn = document.getElementById('compressionToggleBtn');
      if (enableCompression) {
        icon.innerHTML = COMPRESS_PATH;
        btn.title = '点击关闭压缩';
      } else {
        icon.innerHTML = EXPAND_PATH;
        btn.title = '点击开启压缩';
      }
    }

    document.getElementById('compressionToggleBtn').addEventListener('click', function () {
      enableCompression = !enableCompression;
      refreshCompressionBtn();
      window.showToast(enableCompression ? '已开启压缩' : '已关闭压缩', 'info');
    });

    async function fetchBingImages() {
      try {
        var res = await fetch('/bing-images');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var data = await res.json();
        return (data.data || []).map(function (i) { return i.url; });
      } catch (e) {
        console.error('获取Bing背景图片失败:', e);
        return [];
      }
    }

    async function setBackgroundImages() {
      var images = await fetchBingImages();
      if (images.length === 0) return;
      var bg1 = document.getElementById('bg1');
      var bg2 = document.getElementById('bg2');
      bg1.style.backgroundImage = 'url(' + images[0] + ')';
      bg1.style.opacity = 1;
      bg2.style.opacity = 0;
      var index = 0;
      var currentBg = bg1;
      var nextBg = bg2;
      setInterval(function () {
        index = (index + 1) % images.length;
        nextBg.style.backgroundImage = 'url(' + images[index] + ')';
        nextBg.style.opacity = 0;
        setTimeout(function () {
          nextBg.style.opacity = 1;
          currentBg.style.opacity = 0;
        }, 50);
        setTimeout(function () {
          var tmp = currentBg;
          currentBg = nextBg;
          nextBg = tmp;
        }, 1200);
      }, 8000);
    }

    async function calculateFileHash(file) {
      var chunkSize = 1024 * 1024;
      var chunk = file.size > chunkSize ? file.slice(0, chunkSize) : file;
      var arrayBuffer = await chunk.arrayBuffer();
      var hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
      var hashArray = Array.from(new Uint8Array(hashBuffer));
      var hash = hashArray.map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
      return hash + '-' + file.size + '-' + file.lastModified;
    }

    function getCachedData(hash) {
      for (var i = 0; i < uploadCache.length; i++) {
        if (uploadCache[i].hash === hash) return uploadCache[i];
      }
      return null;
    }

    function saveToLocalCache(url, fileName, fileHash) {
      var timestamp = new Date().toLocaleString('zh-CN', { hour12: false });
      uploadCache.push({ url: url, fileName: fileName, hash: fileHash, timestamp: timestamp });
      try {
        localStorage.setItem('uploadCache', JSON.stringify(uploadCache));
      } catch (e) {
        console.warn('本地缓存写入失败:', e);
      }
    }

    function addThumbnail(file, url) {
      var container = document.getElementById('thumbnailContainer');
      var index = thumbnailData.length;
      var previewUrl = URL.createObjectURL(file);
      thumbnailData.push({ previewUrl: previewUrl, url: url, file: file });

      var item = document.createElement('div');
      item.className = 'thumbnail-item';
      item.dataset.index = String(index);

      var media;
      if (file.type.indexOf('image/') === 0) {
        media = document.createElement('img');
        media.src = previewUrl;
        media.alt = 'thumbnail';
      } else if (file.type.indexOf('video/') === 0) {
        media = document.createElement('video');
        media.src = previewUrl;
        media.muted = true;
      } else {
        media = document.createElement('div');
        media.className = 'file-icon';
        media.textContent = (file.name.split('.').pop() || '').toUpperCase().slice(0, 5);
      }
      item.appendChild(media);

      var removeBtn = document.createElement('button');
      removeBtn.className = 'remove-btn';
      removeBtn.type = 'button';
      removeBtn.title = '移除';
      removeBtn.setAttribute('aria-label', '移除');
      removeBtn.innerHTML = '&times;';
      removeBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        removeThumbnail(index);
      });
      item.appendChild(removeBtn);

      container.appendChild(item);
    }

    function removeThumbnail(index) {
      var item = thumbnailData[index];
      if (item && item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      thumbnailData[index] = null;

      var urlToRemove = item ? item.url : null;
      if (urlToRemove) {
        originalImageURLs = originalImageURLs.filter(function (u) { return u !== urlToRemove; });
        if (originalImageURLs.length === 0) {
          hideButtonsAndTextarea();
          document.getElementById('fileLink').value = '';
        } else {
          updateFileLinkDisplay();
        }
      }
      var el = document.querySelector('.thumbnail-item[data-index="' + index + '"]');
      if (el) el.remove();
    }

    function updateFileLinkDisplay() {
      var ta = document.getElementById('fileLink');
      ta.value = originalImageURLs.join('\\n\\n');
      document.getElementById('formatButtons').hidden = false;
      document.getElementById('linkGroup').hidden = false;
      adjustTextareaHeight(ta);
    }

    function hideButtonsAndTextarea() {
      document.getElementById('formatButtons').hidden = true;
      document.getElementById('linkGroup').hidden = true;
    }

    function adjustTextareaHeight(textarea) {
      textarea.style.height = '1px';
      var h = Math.min(textarea.scrollHeight, 200);
      textarea.style.height = h + 'px';
      textarea.style.overflowY = textarea.scrollHeight > 200 ? 'auto' : 'hidden';
    }

    function fallbackCopy(text, successMessage) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.top = '0';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        window.showToast(successMessage || '复制成功', 'success');
      } catch (e) {
        window.showToast('复制失败', 'error');
      }
      document.body.removeChild(ta);
    }

    function copyToClipboard(text, successMessage) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          window.showToast(successMessage || '复制成功', 'success');
        }).catch(function () {
          fallbackCopy(text, successMessage);
        });
      } else {
        fallbackCopy(text, successMessage);
      }
    }

    function formatLinks(urls, format) {
      switch (format) {
        case 'url':      return urls.join('\\n\\n');
        case 'bbcode':   return urls.map(function (u) { return '[img]' + u + '[/img]'; }).join('\\n\\n');
        case 'markdown': return urls.map(function (u) { return '![image](' + u + ')'; }).join('\\n\\n');
        default:         return urls.join('\\n');
      }
    }

    function compressImage(file, quality) {
      quality = quality === undefined ? 0.75 : quality;
      return new Promise(function (resolve, reject) {
        var image = new Image();
        image.onload = function () {
          var canvas = document.createElement('canvas');
          var ctx = canvas.getContext('2d');
          canvas.width = image.width;
          canvas.height = image.height;
          ctx.drawImage(image, 0, 0, image.width, image.height);
          canvas.toBlob(function (blob) {
            if (!blob) return reject(new Error('压缩失败'));
            var baseName = file.name.replace(/\\.[^.]+$/, '') || 'image';
            resolve(new File([blob], baseName + '.jpg', { type: 'image/jpeg' }));
          }, 'image/jpeg', quality);
        };
        image.onerror = function () { reject(new Error('图片解码失败')); };
        var reader = new FileReader();
        reader.onload = function (e) { image.src = e.target.result; };
        reader.onerror = function () { reject(new Error('文件读取失败')); };
        reader.readAsDataURL(file);
      });
    }

    function uploadFile(file, fileHash) {
      return (async function () {
        var originalFile = file;
        try {
          if (enableCompression && file.type.indexOf('image/') === 0 && file.type !== 'image/gif') {
            try { file = await compressImage(file); }
            catch (e) { console.warn('压缩失败，使用原图:', e); }
          }

          var formData = new FormData();
          formData.append('file', file, file.name);

          var progress = document.getElementById('uploadProgress');
          var progressText = document.getElementById('progressText');
          progress.classList.add('show');
          progressText.textContent = '上传中... 0%';

          var responseData = await new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.upload.addEventListener('progress', function (e) {
              if (e.lengthComputable) {
                var p = Math.round((e.loaded / e.total) * 100);
                progressText.textContent = '上传中... ' + p + '%';
              }
            });
            xhr.onload = function () {
              if (xhr.status >= 200 && xhr.status < 300) {
                try { resolve(JSON.parse(xhr.responseText)); }
                catch (err) { reject(new Error('响应解析失败')); }
              } else {
                try {
                  var e = JSON.parse(xhr.responseText);
                  reject(new Error(e.error || '上传失败'));
                } catch (err) {
                  reject(new Error('上传失败: HTTP ' + xhr.status));
                }
              }
            };
            xhr.onerror = function () { reject(new Error('网络错误')); };
            xhr.ontimeout = function () { reject(new Error('上传超时')); };
            xhr.open('POST', '/upload');
            xhr.timeout = 120000;
            xhr.send(formData);
          });

          progress.classList.remove('show');

          if (responseData.error) {
            window.showToast('上传失败', 'error');
          } else {
            originalImageURLs.push(responseData.data);
            addThumbnail(originalFile, responseData.data);
            updateFileLinkDisplay();
            window.showToast('上传成功', 'success');
            saveToLocalCache(responseData.data, file.name, fileHash);
          }
        } catch (error) {
          console.error('处理文件时出现错误:', error);
          document.getElementById('uploadProgress').classList.remove('show');
          window.showToast('上传失败', 'error');
        }
      })();
    }

    async function handleFiles(files) {
      if (!files || files.length === 0) return;
      var queue = Array.from(files);
      var CONCURRENCY = 4;

      async function worker() {
        while (queue.length) {
          var file = queue.shift();
          var fileHash = await calculateFileHash(file);
          var cachedData = getCachedData(fileHash);
          if (cachedData) {
            if (originalImageURLs.indexOf(cachedData.url) === -1) {
              originalImageURLs.push(cachedData.url);
              updateFileLinkDisplay();
              window.showToast('命中缓存', 'info');
            }
          } else {
            await uploadFile(file, fileHash);
          }
        }
      }

      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker)
      );
    }

    var fileInput = document.getElementById('fileInput');
    fileInput.addEventListener('change', function () {
      var files = Array.from(fileInput.files || []);
      fileInput.value = '';
      if (files.length > 0) handleFiles(files);
    });

    var uploadArea = document.getElementById('uploadArea');
    var card = document.querySelector('.card');

    ['dragenter', 'dragover'].forEach(function (evt) {
      card.addEventListener(evt, function (e) {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(function (evt) {
      card.addEventListener(evt, function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (evt === 'dragleave' && e.relatedTarget && card.contains(e.relatedTarget)) return;
        uploadArea.classList.remove('dragover');
      });
    });

    card.addEventListener('drop', function (e) {
      var files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length > 0) handleFiles(Array.from(files));
    });

    document.addEventListener('paste', function (event) {
      var clipboardData = event.clipboardData;
      if (!clipboardData || !clipboardData.items) return;
      var files = [];
      for (var i = 0; i < clipboardData.items.length; i++) {
        var item = clipboardData.items[i];
        if (item.kind === 'file') {
          var f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length > 0) {
        event.preventDefault();
        handleFiles(files);
      }
    });

    document.querySelectorAll('#formatButtons .btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var format = btn.dataset.format;
        var urls = originalImageURLs.map(function (u) { return u.trim(); }).filter(function (u) { return u; });
        if (urls.length === 0) return;
        var formatted = formatLinks(urls, format);
        document.getElementById('fileLink').value = formatted;
        adjustTextareaHeight(document.getElementById('fileLink'));
        copyToClipboard(formatted, '复制成功');
      });
    });

    document.getElementById('viewCacheBtn').addEventListener('click', function () {
      var cacheContent = document.getElementById('cacheContent');
      if (isCacheVisible) {
        cacheContent.hidden = true;
        document.getElementById('fileLink').value = '';
        hideButtonsAndTextarea();
        isCacheVisible = false;
      } else {
        renderCacheContent();
        cacheContent.hidden = false;
        isCacheVisible = true;
      }
    });

    function renderCacheContent() {
      var cacheContent = document.getElementById('cacheContent');
      cacheContent.innerHTML = '';
      if (uploadCache.length === 0) {
        var empty = document.createElement('div');
        empty.className = 'cache-empty';
        empty.textContent = '还没有记录哦！';
        cacheContent.appendChild(empty);
        return;
      }
      var reversed = uploadCache.slice().reverse();
      reversed.forEach(function (item) {
        var div = document.createElement('div');
        div.className = 'cache-item';
        div.textContent = item.timestamp + ' - ' + item.fileName;
        div.addEventListener('click', function () {
          originalImageURLs = [item.url];
          document.getElementById('fileLink').value = item.url;
          document.getElementById('formatButtons').hidden = false;
          document.getElementById('linkGroup').hidden = false;
          adjustTextareaHeight(document.getElementById('fileLink'));
          window.showToast('已载入', 'info');
        });
        cacheContent.appendChild(div);
      });
    }

    refreshCompressionBtn();
    setBackgroundImages();
  })();
  </script>
</body>
</html>
  `, 'text/html;charset=UTF-8', CACHE_CONFIG.HTML);

  await cache.put(cacheKey, response.clone());
  return response;
}

/* =========================================================
   管理后台
   ========================================================= */
async function handleAdminRequest(request, config) {
  if (!authenticate(request, config.username, config.password)) {
    return unauthorizedResponse();
  }
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  return await generateAdminPage(config.database, page);
}

async function generateAdminPage(DATABASE, page = 1) {
  const pageSize = 50;
  const offset = (page - 1) * pageSize;
  const totalCount = await DATABASE.prepare('SELECT COUNT(*) as count FROM media').first();
  const totalPages = Math.ceil(totalCount.count / pageSize);
  const mediaData = await fetchMediaData(DATABASE, pageSize, offset);

  const mediaHtml = mediaData.map(({ url }) => {
    const fileExtension = getFileExtension(url);
    const fileName = url.split('/').pop();
    const dotIdx = fileName.lastIndexOf('.');
    const baseName = dotIdx > 0 ? fileName.slice(0, dotIdx) : fileName;
    const timestamp = parseInt(baseName, 10);
    const timeText = Number.isFinite(timestamp) && timestamp > 0
      ? new Date(timestamp).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
      : '未知';
    const mediaType = escapeHtml(fileExtension);
    const escapedUrl = escapeHtml(url);
    const supportedImageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff'];
    const supportedVideoExtensions = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'mkv', 'webm'];
    const isImage = supportedImageExtensions.includes(fileExtension);
    const isVideo = supportedVideoExtensions.includes(fileExtension);
    const isSupported = isImage || isVideo;
    const backgroundStyle = isSupported ? '' : `style="font-size: 50px; display: flex; justify-content: center; align-items: center;"`;
    const icon = isSupported ? '' : '📁';
    return `
    <div class="media-container" data-key="${escapedUrl}" onclick="toggleImageSelection(this)" ${backgroundStyle}>
      <div class="skeleton"></div>
      <div class="media-type">${mediaType}</div>
      ${isVideo ? `
        <video class="gallery-video" preload="none" controls>
          <source data-src="${escapedUrl}" type="video/${escapeHtml(fileExtension)}">
          您的浏览器不支持视频标签。
        </video>
      ` : `
        ${isImage ? `<img class="gallery-image lazy" data-src="${escapedUrl}" alt="Image">` : icon}
      `}
      <div class="upload-time">上传时间: ${escapeHtml(timeText)}</div>
    </div>
    `;
  }).join('');

  const html = `
  <!DOCTYPE html>
  <html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <title>图库管理</title>
    <link rel="icon" href="https://p1.meituan.net/csc/c195ee91001e783f39f41ffffbbcbd484286.ico" type="image/x-icon">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
      * { box-sizing: border-box; }
      html { height: 100%; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
        min-height: 100vh;
        margin: 0;
        padding: 24px;
        color: #1e293b;
        background:
          radial-gradient(circle at 15% 15%, rgba(99,102,241,0.24), transparent 50%),
          radial-gradient(circle at 85% 20%, rgba(14,165,233,0.22), transparent 50%),
          radial-gradient(circle at 50% 90%, rgba(139,92,246,0.24), transparent 55%),
          linear-gradient(160deg, #eef2ff 0%, #e0e7ff 40%, #f1f5f9 100%);
        background-attachment: fixed;
      }

      .glass {
        background:
          linear-gradient(140deg,
            rgba(255,255,255,0.62) 0%,
            rgba(255,255,255,0.34) 48%,
            rgba(255,255,255,0.52) 100%);
        backdrop-filter: blur(26px) saturate(180%);
        -webkit-backdrop-filter: blur(26px) saturate(180%);
        box-shadow:
          0 20px 50px -26px rgba(15,23,42,0.55),
          0 8px 20px -14px rgba(15,23,42,0.30),
          inset 0 1px 0 rgba(255,255,255,0.94),
          inset 0 -1px 0 rgba(255,255,255,0.28),
          inset 0 0 0 1px rgba(255,255,255,0.50);
      }

      .page-title {
        font-size: 34px;
        font-weight: 800;
        letter-spacing: 0.8px;
        text-align: center;
        margin: 0 0 22px;
        background: linear-gradient(130deg, #4f46e5 0%, #7c3aed 50%, #0ea5e9 100%);
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        color: transparent;
      }

      .header {
        position: sticky;
        top: 12px;
        z-index: 1000;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        padding: 14px 20px;
        margin-bottom: 22px;
        border-radius: 24px;
        flex-wrap: wrap;
      }
      .header-left {
        flex: 1 1 240px;
        display: flex;
        gap: 18px;
        align-items: center;
        color: #3730a3;
        font-weight: 600;
        font-size: 14px;
      }
      .header-left .stat-pill {
        padding: 6px 14px;
        border-radius: 999px;
        background: linear-gradient(140deg, rgba(255,255,255,0.80), rgba(255,255,255,0.46));
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.7), 0 6px 14px -10px rgba(30,41,90,0.7);
      }
      .header-right {
        display: flex;
        gap: 10px;
        justify-content: flex-end;
        flex: 1 1 auto;
        flex-wrap: wrap;
      }

      .gallery {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 18px;
      }

      .media-container {
        position: relative;
        overflow: hidden;
        border-radius: 22px;
        aspect-ratio: 1 / 1;
        cursor: pointer;
        background:
          linear-gradient(140deg,
            rgba(255,255,255,0.66) 0%,
            rgba(255,255,255,0.38) 48%,
            rgba(255,255,255,0.56) 100%);
        backdrop-filter: blur(20px) saturate(170%);
        -webkit-backdrop-filter: blur(20px) saturate(170%);
        box-shadow:
          0 18px 40px -24px rgba(15,23,42,0.55),
          inset 0 1px 0 rgba(255,255,255,0.92),
          inset 0 0 0 1px rgba(255,255,255,0.52);
        transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.3s ease;
      }
      .media-container:hover {
        transform: translateY(-5px);
        box-shadow:
          0 26px 55px -24px rgba(79,70,229,0.55),
          inset 0 1px 0 rgba(255,255,255,0.95),
          inset 0 0 0 1px rgba(129,140,248,0.60);
      }
      .media-container.selected {
        box-shadow:
          0 26px 55px -20px rgba(79,70,229,0.75),
          inset 0 1px 0 rgba(255,255,255,0.95),
          inset 0 0 0 2.5px #6366f1;
      }

      .media-type {
        position: absolute;
        top: 10px; left: 10px;
        padding: 4px 11px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.6px;
        color: #fff;
        background: linear-gradient(135deg, #6366f1, #8b5cf6);
        box-shadow: 0 6px 14px -6px rgba(99,102,241,0.9);
        z-index: 10;
      }

      .upload-time {
        position: absolute;
        left: 10px; right: 10px; bottom: 10px;
        display: none;
        padding: 8px 11px;
        border-radius: 12px;
        font-size: 12px;
        color: #1e293b;
        background: rgba(255,255,255,0.82);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.7);
        z-index: 10;
      }

      .gallery-image, .gallery-video {
        width: 100%; height: 100%;
        object-fit: contain;
        opacity: 0;
        transition: opacity 0.4s ease;
      }
      .gallery-image.loaded, .gallery-video.loaded { opacity: 1; }

      .skeleton {
        position: absolute;
        inset: 0;
        border-radius: 22px;
        background: linear-gradient(90deg, rgba(240,244,255,0.9) 25%, rgba(215,222,245,0.9) 50%, rgba(240,244,255,0.9) 75%);
        background-size: 200% 100%;
        animation: shimmer 1.5s infinite;
      }
      .skeleton.hidden { display: none; }
      @keyframes shimmer {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }

      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 10px 20px;
        border: none;
        border-radius: 14px;
        font-size: 14px;
        font-weight: 600;
        font-family: inherit;
        cursor: pointer;
        color: #3730a3;
        background: linear-gradient(140deg, rgba(255,255,255,0.85), rgba(255,255,255,0.50));
        backdrop-filter: blur(12px) saturate(160%);
        -webkit-backdrop-filter: blur(12px) saturate(160%);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.96),
          inset 0 0 0 1px rgba(255,255,255,0.64),
          0 10px 22px -14px rgba(30,41,90,0.85);
        transition: transform 0.22s ease, box-shadow 0.25s ease, color 0.22s ease;
        white-space: nowrap;
      }
      .btn:hover { transform: translateY(-2px); color: #6d28d9; }
      .btn:active { transform: translateY(0) scale(0.97); }

      .btn--primary {
        color: #fff;
        background: linear-gradient(135deg, #6366f1, #8b5cf6);
        box-shadow:
          0 14px 30px -14px rgba(99,102,241,0.95),
          inset 0 1px 0 rgba(255,255,255,0.45);
      }
      .btn--primary:hover { color: #fff; }

      .btn--danger {
        color: #fff;
        background: linear-gradient(135deg, #ef4444, #db2777);
        box-shadow:
          0 14px 30px -14px rgba(239,68,68,0.95),
          inset 0 1px 0 rgba(255,255,255,0.4);
      }
      .btn--danger:hover { color: #fff; }

      .btn:disabled {
        cursor: not-allowed;
        opacity: 0.55;
        color: #64748b;
        background: linear-gradient(140deg, rgba(226,232,240,0.85), rgba(203,213,225,0.6));
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.6);
        transform: none;
      }

      .hidden { display: none !important; }

      .dropdown { position: relative; display: inline-block; }
      .dropdown-content {
        display: none;
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        min-width: 160px;
        padding: 6px;
        border-radius: 16px;
        z-index: 1001;
        background:
          linear-gradient(140deg, rgba(255,255,255,0.78), rgba(255,255,255,0.50));
        backdrop-filter: blur(24px) saturate(180%);
        -webkit-backdrop-filter: blur(24px) saturate(180%);
        box-shadow:
          0 22px 45px -22px rgba(15,23,42,0.55),
          inset 0 1px 0 rgba(255,255,255,0.94),
          inset 0 0 0 1px rgba(255,255,255,0.55);
      }
      .dropdown:hover .dropdown-content,
      .dropdown:focus-within .dropdown-content { display: block; }
      .dropdown-content button {
        display: block;
        width: 100%;
        padding: 10px 14px;
        border: none;
        border-radius: 11px;
        text-align: left;
        font-size: 14px;
        font-weight: 500;
        font-family: inherit;
        color: #334155;
        background: none;
        cursor: pointer;
        transition: background 0.2s ease, color 0.2s ease;
      }
      .dropdown-content button:hover {
        color: #4338ca;
        background: linear-gradient(140deg, rgba(224,231,255,0.9), rgba(255,255,255,0.6));
      }

      .pagination {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 12px;
        margin: 26px 0;
        padding: 14px 18px;
        border-radius: 22px;
        flex-wrap: wrap;
      }
      .page-info { color: #3730a3; font-weight: 600; font-size: 14px; padding: 0 8px; }

      .empty-state {
        grid-column: 1 / -1;
        text-align: center;
        padding: 80px 24px;
        border-radius: 24px;
        color: #64748b;
        font-size: 17px;
      }
      .empty-state .emoji { font-size: 64px; display: block; margin-bottom: 16px; opacity: 0.6; }

      .footer {
        margin-top: 32px;
        padding: 18px;
        text-align: center;
        font-size: 14px;
        color: #64748b;
        border-radius: 18px;
      }

      /* ===== 右上角玻璃 Toast ===== */
      .toast-stack {
        position: fixed;
        top: 22px;
        right: 22px;
        z-index: 2147483000;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 10px;
        pointer-events: none;
      }
      .glass-toast {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 20px;
        border-radius: 16px;
        font-size: 14px;
        font-weight: 600;
        letter-spacing: 0.2px;
        color: #1e293b;
        max-width: min(80vw, 320px);
        opacity: 0;
        transform: translateY(-10px) scale(0.96);
        transition:
          opacity 0.34s ease,
          transform 0.42s cubic-bezier(0.22, 1, 0.36, 1);
        will-change: opacity, transform;
        background: linear-gradient(140deg, rgba(255,255,255,0.86), rgba(255,255,255,0.56));
        backdrop-filter: blur(24px) saturate(180%);
        -webkit-backdrop-filter: blur(24px) saturate(180%);
        box-shadow:
          0 18px 44px -22px rgba(15,23,42,0.60),
          inset 0 1px 0 rgba(255,255,255,0.96),
          inset 0 -1px 0 rgba(255,255,255,0.30),
          inset 0 0 0 1px rgba(255,255,255,0.60);
      }
      .glass-toast.is-in { opacity: 1; transform: translateY(0) scale(1); }
      .glass-toast.is-out { opacity: 0; transform: translateY(-8px) scale(0.97); }
      .glass-toast__dot {
        flex: 0 0 auto;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #3b82f6;
        box-shadow: 0 0 9px 1px rgba(59,130,246,0.85);
      }
      .glass-toast--success { color: #065f46; }
      .glass-toast--success .glass-toast__dot { background: #10b981; box-shadow: 0 0 9px 1px rgba(16,185,129,0.9); }
      .glass-toast--error { color: #991b1b; }
      .glass-toast--error .glass-toast__dot { background: #ef4444; box-shadow: 0 0 9px 1px rgba(239,68,68,0.9); }
      .glass-toast--warning { color: #92400e; }
      .glass-toast--warning .glass-toast__dot { background: #f59e0b; box-shadow: 0 0 9px 1px rgba(245,158,11,0.9); }

      .glass-overlay {
        position: fixed;
        inset: 0;
        z-index: 2147483200;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: rgba(15,23,42,0.24);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        opacity: 0;
        transition: opacity 0.24s ease;
      }
      .glass-overlay.is-open { opacity: 1; }
      .glass-dialog {
        width: 100%;
        max-width: 380px;
        padding: 28px 24px 22px;
        border-radius: 28px;
        text-align: center;
        background:
          linear-gradient(140deg, rgba(255,255,255,0.80) 0%, rgba(255,255,255,0.50) 50%, rgba(255,255,255,0.68) 100%);
        backdrop-filter: blur(30px) saturate(180%);
        -webkit-backdrop-filter: blur(30px) saturate(180%);
        box-shadow:
          0 30px 70px -24px rgba(4,10,30,0.58),
          inset 0 1px 0 rgba(255,255,255,0.95),
          inset 0 0 0 1px rgba(255,255,255,0.55);
        transform: scale(0.92) translateY(12px);
        transition: transform 0.34s cubic-bezier(0.22, 1, 0.36, 1);
      }
      .glass-overlay.is-open .glass-dialog { transform: scale(1) translateY(0); }
      .glass-dialog__title { margin: 0 0 10px; font-size: 19px; font-weight: 700; color: #1e1b4b; }
      .glass-dialog__text { margin: 0 0 22px; font-size: 14.5px; line-height: 1.6; color: #475569; }
      .glass-dialog__actions { display: flex; gap: 10px; }
      .glass-btn {
        flex: 1;
        padding: 12px 18px;
        border: none;
        border-radius: 14px;
        font-size: 15px;
        font-weight: 600;
        font-family: inherit;
        cursor: pointer;
        transition: transform 0.2s ease, box-shadow 0.25s ease;
      }
      .glass-btn:active { transform: scale(0.97); }
      .glass-btn--ghost {
        color: #334155;
        background: rgba(255,255,255,0.68);
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.78), 0 4px 12px -8px rgba(15,30,60,0.6);
      }
      .glass-btn--primary {
        color: #fff;
        background: linear-gradient(135deg, #6366f1, #8b5cf6);
        box-shadow: 0 14px 28px -14px rgba(99,102,241,0.95);
      }
      .glass-btn--danger {
        color: #fff;
        background: linear-gradient(135deg, #ef4444, #db2777);
        box-shadow: 0 14px 28px -14px rgba(239,68,68,0.95);
      }

      @media (max-width: 768px) {
        body { padding: 14px; }
        .page-title { font-size: 26px; margin-bottom: 16px; }
        .header { padding: 12px 14px; border-radius: 18px; top: 6px; }
        .header-left { font-size: 13px; gap: 10px; }
        .header-left .stat-pill { padding: 5px 10px; }
        .header-right { width: 100%; justify-content: flex-start; }
        .gallery { grid-template-columns: repeat(2, 1fr); gap: 12px; }
        .media-container { border-radius: 16px; }
        .btn { padding: 9px 15px; font-size: 13px; border-radius: 12px; }
        .pagination { padding: 10px; border-radius: 18px; }
        .toast-stack { top: 14px; right: 14px; left: 14px; align-items: stretch; }
        .glass-toast { max-width: none; }
      }
    </style>
  </head>
  <body>
    <h1 class="page-title">图库管理</h1>

    <div class="header glass">
      <div class="header-left">
        <span class="stat-pill">媒体文件 ${totalCount.count} 个</span>
        <span class="stat-pill">已选中: <span id="selected-count">0</span></span>
      </div>
      <div class="header-right hidden">
        <div class="dropdown">
          <button class="btn" type="button">复制链接</button>
          <div class="dropdown-content">
            <button type="button" onclick="copyFormattedLinks('url')">URL</button>
            <button type="button" onclick="copyFormattedLinks('bbcode')">BBCode</button>
            <button type="button" onclick="copyFormattedLinks('markdown')">Markdown</button>
          </div>
        </div>
        <button id="select-all-button" class="btn" type="button" onclick="selectAllImages()">全选</button>
        <button id="delete-button" class="btn btn--danger" type="button" onclick="deleteSelectedImages()">删除</button>
      </div>
    </div>

    <div class="gallery">
      ${mediaData.length === 0 ? '<div class="empty-state glass"><span class="emoji">📁</span>暂无媒体文件</div>' : mediaHtml}
    </div>

    ${mediaData.length > 0 ? `
    <div class="pagination glass">
      <button class="btn" type="button" onclick="goToPage(${page - 1})" ${page <= 1 ? 'disabled' : ''}>上一页</button>
      <span class="page-info">第 ${page} / ${totalPages} 页 (共 ${totalCount.count} 个)</span>
      <button class="btn" type="button" onclick="goToPage(${page + 1})" ${page >= totalPages ? 'disabled' : ''}>下一页</button>
    </div>
    ` : ''}

    <div class="footer glass">到底啦</div>

    <script>
    /* ============ 右上角玻璃 Toast + 玻璃弹窗 ============ */
    (function () {
      'use strict';
      if (window.__jsimagesNotify) return;
      window.__jsimagesNotify = true;

      var stack = null;

      function ensureStack() {
        if (stack && stack.isConnected) return stack;
        stack = document.createElement('div');
        stack.className = 'toast-stack';
        stack.setAttribute('role', 'status');
        stack.setAttribute('aria-live', 'polite');
        document.body.appendChild(stack);
        return stack;
      }

      window.showToast = function (text, type, duration) {
        var t = ['success', 'error', 'warning', 'info'].indexOf(type) === -1 ? 'info' : type;
        var d = typeof duration === 'number' ? duration : 1800;

        var el = document.createElement('div');
        el.className = 'glass-toast glass-toast--' + t;

        var dot = document.createElement('i');
        dot.className = 'glass-toast__dot';

        var span = document.createElement('span');
        span.textContent = String(text == null ? '' : text);

        el.appendChild(dot);
        el.appendChild(span);
        ensureStack().appendChild(el);

        requestAnimationFrame(function () { el.classList.add('is-in'); });

        var closed = false;
        function close() {
          if (closed) return;
          closed = true;
          el.classList.remove('is-in');
          el.classList.add('is-out');
          setTimeout(function () { el.remove(); }, 380);
        }
        if (d > 0) setTimeout(close, d);
        return { close: close };
      };

      window.danmaku = window.showToast;

      window.glassConfirm = function (message, opts) {
        opts = opts || {};
        return new Promise(function (resolve) {
          var overlay = document.createElement('div');
          overlay.className = 'glass-overlay';

          var box = document.createElement('div');
          box.className = 'glass-dialog';

          var title = document.createElement('h3');
          title.className = 'glass-dialog__title';
          title.textContent = opts.title || '请确认';

          var text = document.createElement('p');
          text.className = 'glass-dialog__text';
          text.textContent = message;

          var actions = document.createElement('div');
          actions.className = 'glass-dialog__actions';

          var cancel = document.createElement('button');
          cancel.type = 'button';
          cancel.className = 'glass-btn glass-btn--ghost';
          cancel.textContent = opts.cancelText || '取消';

          var ok = document.createElement('button');
          ok.type = 'button';
          ok.className = 'glass-btn ' + (opts.danger === false ? 'glass-btn--primary' : 'glass-btn--danger');
          ok.textContent = opts.okText || '确定';

          actions.appendChild(cancel);
          actions.appendChild(ok);
          box.appendChild(title);
          box.appendChild(text);
          box.appendChild(actions);
          overlay.appendChild(box);
          document.body.appendChild(overlay);

          requestAnimationFrame(function () { overlay.classList.add('is-open'); });

          var settled = false;
          function done(value) {
            if (settled) return;
            settled = true;
            document.removeEventListener('keydown', onKey);
            overlay.classList.remove('is-open');
            setTimeout(function () { overlay.remove(); }, 240);
            resolve(value);
          }
          function onKey(e) { if (e.key === 'Escape') done(false); }

          cancel.addEventListener('click', function () { done(false); });
          ok.addEventListener('click', function () { done(true); });
          overlay.addEventListener('click', function (e) { if (e.target === overlay) done(false); });
          document.addEventListener('keydown', onKey);
        });
      };
    })();

    /* ============ 图库逻辑 ============ */
    var selectedCount = 0;
    var selectedKeys = new Set();
    var isAllSelected = false;

    function toggleImageSelection(container) {
      var key = container.getAttribute('data-key');
      container.classList.toggle('selected');
      var uploadTime = container.querySelector('.upload-time');
      if (container.classList.contains('selected')) {
        selectedKeys.add(key);
        selectedCount++;
        uploadTime.style.display = 'block';
      } else {
        selectedKeys.delete(key);
        selectedCount--;
        uploadTime.style.display = 'none';
      }
      updateDeleteButton();
    }

    function updateDeleteButton() {
      document.getElementById('selected-count').textContent = selectedCount;
      var headerRight = document.querySelector('.header-right');
      headerRight.classList.toggle('hidden', selectedCount === 0);
    }

    async function deleteSelectedImages() {
      if (selectedKeys.size === 0) return;
      var ok = await window.glassConfirm(
        '你确定要删除选中的 ' + selectedKeys.size + ' 个媒体文件吗？此操作无法撤回。',
        { title: '删除确认', okText: '删除', danger: true }
      );
      if (!ok) return;

      var keysToDelete = Array.from(selectedKeys);
      try {
        var response = await fetch('/delete-images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(keysToDelete)
        });

        if (!response.ok) {
          window.showToast('删除失败', 'error');
          return;
        }

        var containers = document.querySelectorAll('.media-container');
        var containersToRemove = [];
        containers.forEach(function (container) {
          var key = container.getAttribute('data-key');
          if (selectedKeys.has(key)) {
            containersToRemove.push(container);
            container.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            container.style.opacity = '0';
            container.style.transform = 'scale(0.85)';
          }
        });

        window.showToast('删除成功', 'success');

        setTimeout(function () {
          containersToRemove.forEach(function (c) { c.remove(); });

          var totalPill = document.querySelector('.header-left .stat-pill');
          if (totalPill) {
            var m = totalPill.textContent.match(/\\d+/);
            var currentTotal = m ? parseInt(m[0], 10) : 0;
            var newTotal = Math.max(0, currentTotal - keysToDelete.length);
            totalPill.textContent = '媒体文件 ' + newTotal + ' 个';
          }

          var pageInfo = document.querySelector('.page-info');
          if (pageInfo) {
            var pm = pageInfo.textContent.match(/共 (\\d+) 个/);
            if (pm) {
              var newPageTotal = Math.max(0, parseInt(pm[1], 10) - keysToDelete.length);
              pageInfo.textContent = pageInfo.textContent.replace(/共 \\d+ 个/, '共 ' + newPageTotal + ' 个');
            }
          }

          selectedKeys.clear();
          selectedCount = 0;
          isAllSelected = false;
          updateDeleteButton();

          var remaining = document.querySelectorAll('.media-container').length;
          if (remaining === 0) {
            window.location.reload();
          }
        }, 320);
      } catch (err) {
        window.showToast('删除失败', 'error');
      }
    }

    function formatLinks(urls, format) {
      switch (format) {
        case 'url': return urls.join('\\n\\n');
        case 'bbcode': return urls.map(function (u) { return '[img]' + u + '[/img]'; }).join('\\n\\n');
        case 'markdown': return urls.map(function (u) { return '![image](' + u + ')'; }).join('\\n\\n');
        default: return urls.join('\\n');
      }
    }

    function copyFormattedLinks(format) {
      var urls = Array.from(selectedKeys).map(function (u) { return u.trim(); }).filter(function (u) { return u !== ''; });
      if (urls.length === 0) return;
      var formattedLinks = formatLinks(urls, format);

      function ok() { window.showToast('复制成功', 'success'); }
      function fail() { window.showToast('复制失败', 'error'); }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(formattedLinks).then(ok).catch(function () {
          var ta = document.createElement('textarea');
          ta.value = formattedLinks;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); ok(); } catch (e) { fail(); }
          document.body.removeChild(ta);
        });
      } else {
        var ta2 = document.createElement('textarea');
        ta2.value = formattedLinks;
        ta2.style.position = 'fixed';
        ta2.style.opacity = '0';
        document.body.appendChild(ta2);
        ta2.select();
        try { document.execCommand('copy'); ok(); } catch (e) { fail(); }
        document.body.removeChild(ta2);
      }
    }

    function selectAllImages() {
      var mediaContainers = Array.from(document.querySelectorAll('.media-container'));
      var batchSize = 20;
      var index = 0;

      function processBatch() {
        var end = Math.min(index + batchSize, mediaContainers.length);
        for (var i = index; i < end; i++) {
          var container = mediaContainers[i];
          if (isAllSelected) {
            container.classList.remove('selected');
            selectedKeys.delete(container.getAttribute('data-key'));
            var ut1 = container.querySelector('.upload-time');
            if (ut1) ut1.style.display = 'none';
          } else if (!container.classList.contains('selected')) {
            container.classList.add('selected');
            selectedKeys.add(container.getAttribute('data-key'));
            var ut2 = container.querySelector('.upload-time');
            if (ut2) ut2.style.display = 'block';
          }
        }
        index = end;
        if (index < mediaContainers.length) {
          requestAnimationFrame(processBatch);
        } else {
          selectedCount = isAllSelected ? 0 : selectedKeys.size;
          isAllSelected = !isAllSelected;
          updateDeleteButton();
        }
      }
      requestAnimationFrame(processBatch);
    }

    document.addEventListener('DOMContentLoaded', function () {
      var mediaContainers = document.querySelectorAll('.media-container[data-key]');
      var options = { root: null, rootMargin: '100px', threshold: 0.01 };

      var mediaObserver = new IntersectionObserver(function (entries, observer) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var container = entry.target;
          var skeleton = container.querySelector('.skeleton');
          var video = container.querySelector('video');
          if (video) {
            var source = video.querySelector('source');
            if (source && source.dataset.src) {
              video.src = source.dataset.src;
              video.load();
              video.onloadeddata = function () {
                video.classList.add('loaded');
                if (skeleton) skeleton.classList.add('hidden');
              };
            }
          } else {
            var img = container.querySelector('img');
            if (img && img.dataset.src && !img.src) {
              img.src = img.dataset.src;
              img.onload = function () {
                img.classList.add('loaded');
                if (skeleton) skeleton.classList.add('hidden');
              };
              img.onerror = function () { if (skeleton) skeleton.classList.add('hidden'); };
            } else if (!img) {
              if (skeleton) skeleton.classList.add('hidden');
            }
          }
          observer.unobserve(container);
        });
      }, options);

      mediaContainers.forEach(function (container) { mediaObserver.observe(container); });
    });

    function goToPage(pageNum) {
      var url = new URL(window.location.href);
      url.searchParams.set('page', pageNum);
      window.location.href = url.toString();
    }
    </script>
  </body>
  </html>
  `;
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

async function fetchMediaData(DATABASE, limit = null, offset = 0) {
  let query = 'SELECT url FROM media ORDER BY url DESC';
  if (limit !== null) query += ` LIMIT ${limit} OFFSET ${offset}`;
  const result = await DATABASE.prepare(query).all();
  return result.results.map(row => ({ url: row.url }));
}

/* =========================================================
   上传接口 —— ⭐️ 支持两种认证方式：Header 或 Form
   ========================================================= */
async function handleUploadRequest(request, config) {
  // ⭐️ 1) 先读 formData
  let formData;
  try {
    formData = await request.formData();
  } catch (e) {
    return jsonResponse({ error: '无效的上传请求' }, 400);
  }

  // ⭐️ 2) 认证：请求头 或 form 字段（_u / _p），任一通过即放行
  if (config.enableAuth) {
    const headerOK = authenticate(request, config.username, config.password);
    const formOK =
      formData.get('_u') === config.username &&
      formData.get('_p') === config.password;
    if (!headerOK && !formOK) {
      return unauthorizedResponse();
    }
  }

  try {
    const file = formData.get('file');
    if (!file || typeof file === 'string') throw new Error('缺少文件');

    if (file.size > config.maxSize) {
      return jsonResponse({ error: `文件大小超过${config.maxSize / (1024 * 1024)}MB限制` }, 413);
    }

    const originalName = file.name || '';
    const dotIndex = originalName.lastIndexOf('.');
    const ext = dotIndex > 0 ? originalName.slice(dotIndex + 1).toLowerCase() : '';
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return jsonResponse({ error: '不支持的文件类型: ' + (ext || '未知') }, 415);
    }

    const r2Key = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

    await config.r2Bucket.put(r2Key, file.stream(), {
      httpMetadata: { contentType: getContentType(ext) }
    });

    const imageURL = `https://${config.domain}/${r2Key}.${ext}`;
    await config.database
      .prepare('INSERT INTO media (url) VALUES (?) ON CONFLICT(url) DO NOTHING')
      .bind(imageURL)
      .run();

    return jsonResponse({ data: imageURL });
  } catch (error) {
    console.error('R2 上传错误:', error);
    return jsonResponse({ error: error.message }, 500);
  }
}

async function handleImageRequest(request, config) {
  const url = new URL(request.url);
  const r2Key = extractR2KeyFromPath(url.pathname);
  if (!r2Key) {
    return new Response('Not Found', { status: 404 });
  }
  const ext = getFileExtension(url.pathname);

  const cache = caches.default;
  const cacheKey = new Request(`${url.origin}${url.pathname}`);

  const rangeHeader = request.headers.get('Range');
  const rangeOpts = parseRangeHeader(rangeHeader);

  if (!rangeOpts) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
  }

  const object = rangeOpts
    ? await config.r2Bucket.get(r2Key, { range: rangeOpts })
    : await config.r2Bucket.get(r2Key);

  if (!object) {
    return new Response('资源不存在', { status: 404 });
  }

  const headers = new Headers();
  headers.set('Content-Type', getContentType(ext));
  headers.set('Accept-Ranges', 'bytes');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Cache-Control', `public, max-age=${CACHE_CONFIG.IMAGE}, immutable`);
  headers.set('CDN-Cache-Control', `public, max-age=${CACHE_CONFIG.IMAGE}`);

  if (ext === 'svg') {
    headers.set('Content-Disposition', 'attachment');
    headers.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:");
  } else {
    headers.set('Content-Disposition', 'inline');
  }

  if (rangeOpts) {
    let offset, length;
    if ('suffix' in rangeOpts) {
      length = Math.min(rangeOpts.suffix, object.size);
      offset = object.size - length;
    } else if ('length' in rangeOpts) {
      offset = rangeOpts.offset;
      length = Math.min(rangeOpts.length, object.size - offset);
    } else {
      offset = rangeOpts.offset;
      length = object.size - offset;
    }
    if (offset >= object.size) {
      return new Response('Range Not Satisfiable', {
        status: 416,
        headers: { 'Content-Range': `bytes */${object.size}` }
      });
    }
    headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set('Content-Length', String(length));
    return new Response(object.body, { status: 206, headers });
  }

  const responseToCache = new Response(object.body, { status: 200, headers });
  await cache.put(cacheKey, responseToCache.clone());
  return responseToCache;
}

async function handleBingImagesRequest() {
  const cache = caches.default;
  const cacheKey = new Request('https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=5');
  const cachedResponse = await cache.match(cacheKey);
  if (cachedResponse) return cachedResponse;

  const res = await fetch(cacheKey);
  if (!res.ok) {
    return new Response('请求 Bing API 失败', { status: res.status });
  }
  const bingData = await res.json();
  const images = bingData.images.map(image => ({ url: `https://cn.bing.com${image.url}` }));
  const response = createCachedResponse(
    JSON.stringify({ status: true, message: '操作成功', data: images }),
    'application/json',
    CACHE_CONFIG.API
  );
  await cache.put(cacheKey, response.clone());
  return response;
}

async function handleDeleteImagesRequest(request, config) {
  if (!authenticate(request, config.username, config.password)) {
    return unauthorizedResponse();
  }
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const keysToDelete = await request.json();
    if (!Array.isArray(keysToDelete) || keysToDelete.length === 0) {
      return jsonResponse({ message: '没有要删除的项' }, 400);
    }

    const expectedPrefix = `https://${config.domain}/`;
    const invalid = keysToDelete.find(u => typeof u !== 'string' || !u.startsWith(expectedPrefix));
    if (invalid) {
      return jsonResponse({ error: '非法的 URL: ' + invalid }, 400);
    }

    const placeholders = keysToDelete.map(() => '?').join(',');
    const cache = caches.default;

    const [dbResult] = await Promise.all([
      config.database
        .prepare(`DELETE FROM media WHERE url IN (${placeholders})`)
        .bind(...keysToDelete)
        .run(),
      Promise.all(keysToDelete.map(async (url) => {
        const pathname = new URL(url).pathname;
        const r2Key = extractR2KeyFromPath(pathname);

        await cache.delete(new Request(url));

        if (r2Key) await config.r2Bucket.delete(r2Key);
      }))
    ]);

    if (dbResult.changes === 0) {
      return jsonResponse({ message: '未找到要删除的项' }, 404);
    }

    return jsonResponse({ message: '删除成功' });
  } catch (error) {
    console.error('删除失败:', error);
    return jsonResponse({ error: '删除失败', details: error.message }, 500);
  }
}
