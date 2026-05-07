var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// index.js
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
var __defProp22 = Object.defineProperty;
var __name22 = /* @__PURE__ */ __name2((target, value) => __defProp22(target, "name", { value, configurable: true }), "__name");
var CONTENT_TYPE_MAP = {
  "jpg": "image/jpeg",
  "jpeg": "image/jpeg",
  "png": "image/png",
  "gif": "image/gif",
  "webp": "image/webp",
  "bmp": "image/bmp",
  "svg": "image/svg+xml",
  "ico": "image/x-icon",
  "heic": "image/heic",
  "tiff": "image/tiff",
  "mp4": "video/mp4",
  "avi": "video/x-msvideo",
  "mov": "video/quicktime",
  "webm": "video/webm",
  "wmv": "video/x-ms-wmv",
  "flv": "video/x-flv",
  "mkv": "video/x-matroska",
  "mp3": "audio/mpeg",
  "wav": "audio/wav",
  "ogg": "audio/ogg",
  "flac": "audio/flac",
  "aac": "audio/aac",
  "m4a": "audio/mp4",
  "wma": "audio/x-ms-wma",
  "opus": "audio/opus"
};
var ALLOWED_EXTENSIONS = new Set(Object.keys(CONTENT_TYPE_MAP));
var SUPPORTED_IMAGE_EXTS = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "tiff"];
var SUPPORTED_VIDEO_EXTS = ["mp4", "avi", "mov", "wmv", "flv", "mkv", "webm"];
var SUPPORTED_AUDIO_EXTS = ["mp3", "wav", "ogg", "flac", "aac", "m4a", "wma", "opus"];
var CACHE_CONFIG = {
  HTML: 3600,
  IMAGE: 86400,
  API: 300
};
function extractConfig(env) {
  return {
    domain: env.DOMAIN,
    database: env.DB,
    username: env.USERNAME,
    password: env.PASSWORD,
    adminPath: env.ADMIN_PATH,
    enableAuth: env.ENABLE_AUTH === "true",
    r2Bucket: env.SB,
    maxSize: (env.MAX_SIZE_MB ? parseInt(env.MAX_SIZE_MB, 10) : 10) * 1024 * 1024
  };
}
__name(extractConfig, "extractConfig");
__name2(extractConfig, "extractConfig");
__name22(extractConfig, "extractConfig");
function createCachedResponse(body, contentType, cacheMaxAge) {
  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": `public, max-age=${cacheMaxAge}`,
      "CDN-Cache-Control": `public, max-age=${cacheMaxAge}`
    }
  });
}
__name(createCachedResponse, "createCachedResponse");
__name2(createCachedResponse, "createCachedResponse");
__name22(createCachedResponse, "createCachedResponse");
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
__name(jsonResponse, "jsonResponse");
__name2(jsonResponse, "jsonResponse");
__name22(jsonResponse, "jsonResponse");
function unauthorizedResponse() {
  return new Response("Unauthorized", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Admin"' }
  });
}
__name(unauthorizedResponse, "unauthorizedResponse");
__name2(unauthorizedResponse, "unauthorizedResponse");
__name22(unauthorizedResponse, "unauthorizedResponse");
function getFileExtension(url) {
  return url.split(".").pop().toLowerCase();
}
__name(getFileExtension, "getFileExtension");
__name2(getFileExtension, "getFileExtension");
__name22(getFileExtension, "getFileExtension");
function getContentType(extension) {
  return CONTENT_TYPE_MAP[extension] || "application/octet-stream";
}
__name(getContentType, "getContentType");
__name2(getContentType, "getContentType");
__name22(getContentType, "getContentType");
function escapeHtml(text) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  };
  return String(text).replace(/[&<>"']/g, (m) => map[m]);
}
__name(escapeHtml, "escapeHtml");
__name2(escapeHtml, "escapeHtml");
__name22(escapeHtml, "escapeHtml");
function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return "\u2014";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return (i === 0 ? size : size.toFixed(1)) + " " + units[i];
}
__name(formatFileSize, "formatFileSize");
__name2(formatFileSize, "formatFileSize");
__name22(formatFileSize, "formatFileSize");
var index_default = {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const config = extractConfig(env);
    switch (pathname) {
      case "/":
        return await handleRootRequest(request, config);
      case "/api/stats":
        return await handleStatsRequest(config);
      case `/${config.adminPath}`:
        return await handleAdminRequest(request, config);
      case "/upload":
        return request.method === "POST" ? await handleUploadRequest(request, config) : new Response("Method Not Allowed", { status: 405 });
      case "/delete-images":
        return await handleDeleteImagesRequest(request, config);
      case "/admin-upload":
        return request.method === "POST" ? await handleAdminUploadRequest(request, config) : new Response("Method Not Allowed", { status: 405 });
      default:
        return await handleImageRequest(request, config);
    }
  }
};
function authenticate(request, username, password) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Basic ")) return false;
  try {
    const base64Credentials = authHeader.split(" ")[1];
    const credentials = atob(base64Credentials).split(":");
    return credentials[0] === username && credentials[1] === password;
  } catch {
    return false;
  }
}
__name(authenticate, "authenticate");
__name2(authenticate, "authenticate");
__name22(authenticate, "authenticate");
async function handleRootRequest(request, config) {
  const cache = caches.default;
  const cacheKey = new Request(request.url);
  if (config.enableAuth && !authenticate(request, config.username, config.password)) {
    return unauthorizedResponse();
  }
  const cachedResponse = await cache.match(cacheKey);
  if (cachedResponse) {
    return cachedResponse;
  }
  const response = createCachedResponse(`
  <!DOCTYPE html>
  <html lang="zh-CN">
  <head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Media - FishByte | \u57FA\u4E8ECloudFlare\u7684\u56FE\u5E8A\u670D\u52A1">
  <meta name="keywords" content="Media - FishByte,Workers,R2\u50A8\u5B58, Cloudflare,\u56FE\u5E8A">
  <title>Media - FishByte | \u57FA\u4E8ECloudFlare\u7684\u56FE\u5E8A\u670D\u52A1</title>
  <script>(function(){var t=localStorage.getItem('theme');if(t){document.documentElement.setAttribute('data-theme',t);return}if(window.matchMedia&&window.matchMedia('(prefers-color-scheme:dark)').matches){document.documentElement.setAttribute('data-theme','dark')}})();</script>
  <link rel="preconnect" href="https://cdnjs.cloudflare.com">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/twitter-bootstrap/4.6.1/css/bootstrap.min.css" integrity="sha512-T584yQ/tdRR5QwOpfvDfVQUidzfgc2339Lc8uBDtcp/wYu80d7jwBgAxbyMh0a9YM9F8N3tdErpFI8iaGx6x5g==" crossorigin="anonymous" referrerpolicy="no-referrer" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/bootstrap-fileinput/5.2.7/css/fileinput.min.css" integrity="sha512-qPjB0hQKYTx1Za9Xip5h0PXcxaR1cRbHuZHo9z+gb5IgM6ZOTtIH4QLITCxcCp/8RMXtw2Z85MIZLv6LfGTLiw==" crossorigin="anonymous" referrerpolicy="no-referrer" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/toastr.js/2.1.4/toastr.min.css" integrity="sha512-6S2HWzVFxruDlZxI3sXOZZ4/eJ8AcxkQH1+JjSe/ONCEqR9L4Ysq5JdT5ipqtzU7WHalNwzwBv+iE51gNHJNqQ==" crossorigin="anonymous" referrerpolicy="no-referrer" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css" integrity="sha512-1ycn6IcaQQ40/MKBW2W4Rhis/DbILU74C1vSrLJxCq57o941Ym01SwNsOMqvEBFlcgUa6xLiPY/NS5R+E6ztJQ==" crossorigin="anonymous" referrerpolicy="no-referrer" />
  <style>
t  /* Critical: prevents FOUC for Bootstrap-dependent elements */
t  .btn { display:inline-flex; align-items:center; justify-content:center; font-weight:500; border-radius:8px; padding:6px 16px; cursor:pointer; }
t  .btn-primary { background:linear-gradient(135deg,#667eea 0%,#764ba2 100%); color:#fff; }
t  .form-control { display:block; width:100%; padding:6px 12px; border-radius:8px; border:1px solid #ddd; }
t  .progress { display:flex; height:22px; border-radius:6px; background:#e9ecef; }
t  .progress-bar { display:flex; align-items:center; justify-content:center; color:#fff; }
t  .badge { display:inline-block; padding:2px 6px; font-size:0.75em; border-radius:10px; }
  :root {
      --bg-gradient: linear-gradient(-45deg, #667eea, #764ba2, #f093fb, #4facfe);
      --card-bg: rgba(255, 255, 255, 0.95);
      --card-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
      --title-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      --text-primary: #333;
      --text-secondary: #555;
      --text-muted: #999;
      --accent: #667eea;
      --accent-hover: #764ba2;
      --accent-light: rgba(102, 126, 234, 0.1);
      --accent-light-hover: rgba(102, 126, 234, 0.05);
      --border-light: rgba(255, 255, 255, 0.6);
      --cache-bg: white;
      --cache-border: rgba(102, 126, 234, 0.1);
      --danger: #e74c3c;
      --danger-light: rgba(231, 76, 60, 0.1);
      --scrollbar-track: transparent;
      --scrollbar-thumb: rgba(0,0,0,0.15);
      --overlay-bg: rgba(0, 0, 0, 0.35);
      --thumbnail-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      --skeleton-base: #e8e8e8;
      --skeleton-shine: #f5f5f5;
  }
  [data-theme="dark"] {
      --bg-gradient: linear-gradient(-45deg, #0f0c29, #302b63, #24243e, #1a1a3e);
      --card-bg: rgba(30, 30, 50, 0.95);
      --card-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      --title-gradient: linear-gradient(135deg, #a78bfa 0%, #c084fc 100%);
      --text-primary: #e0e0e0;
      --text-secondary: #b0b0b0;
      --text-muted: #888;
      --accent: #a78bfa;
      --accent-hover: #c084fc;
      --accent-light: rgba(167, 139, 250, 0.15);
      --accent-light-hover: rgba(167, 139, 250, 0.08);
      --border-light: rgba(255, 255, 255, 0.08);
      --cache-bg: #2a2a45;
      --cache-border: rgba(167, 139, 250, 0.15);
      --danger: #ef4444;
      --danger-light: rgba(239, 68, 68, 0.15);
      --scrollbar-track: transparent;
      --scrollbar-thumb: rgba(255,255,255,0.2);
      --overlay-bg: rgba(0, 0, 0, 0.55);
      --thumbnail-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      --skeleton-base: #2a2a3e;
      --skeleton-shine: #3a3a52;
      #fileLink.form-control {
          background-color: #2a2a45;
          color: #e0e0e0;
          border-color: rgba(167, 139, 250, 0.15);
      }
      #fileLink::-webkit-scrollbar {
          width: 6px;
      }
      #fileLink::-webkit-scrollbar-track {
          background: transparent;
      }
      #fileLink::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.2);
          border-radius: 3px;
      }
  }
      body {
          margin: 0;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          position: relative;
          background: var(--bg-gradient);
          background-size: 400% 400%;
          animation: gradientShift 60s ease infinite;
      }
      @keyframes gradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
      }
      .card {
          background: var(--card-bg);
          border: 1px solid var(--border-light);
          border-radius: 16px;
          box-shadow: var(--card-shadow);
          padding: 30px;
          width: 90%;
          max-width: 540px;
          margin: 0 auto;
          position: relative;
      }
      .title {
          font-size: 32px;
          font-weight: 700;
          background: var(--title-gradient);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin: 0;
          letter-spacing: 0.5px;
      }
      .card-header-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 20px;
      }
      .card-header-row .header-buttons {
          display: flex;
          gap: 16px;
          align-items: center;
          flex-shrink: 0;
      }
      #themeToggle {
          background: none;
          border: none;
          color: var(--accent);
          opacity: 0.5;
          cursor: pointer;
          font-size: 22px;
          transition: all 0.3s ease;
          padding: 0;
          line-height: 1;
          flex-shrink: 0;
      }
      #themeToggle:hover {
          opacity: 1;
          transform: scale(1.1);
      }
      #viewCacheBtn,
      #adminLink {
          background: none;
          border: none;
          color: var(--accent);
          opacity: 0.5;
          cursor: pointer;
          font-size: 22px;
          transition: all 0.3s ease;
          padding: 0;
          line-height: 1;
          flex-shrink: 0;
          text-decoration: none;
      }
      #viewCacheBtn:focus,
      #adminLink:focus,
      #themeToggle:focus {
          outline: 2px solid var(--accent);
          outline-offset: 3px;
          border-radius: 4px;
          box-shadow: none !important;
      }
      #viewCacheBtn:hover,
      #adminLink:hover {
          opacity: 1;
          transform: scale(1.1);
      }
      #cacheContent {
          margin-top: 20px;
          max-height: 250px;
          border-radius: 8px;
          overflow-y: auto;
      }
      #cacheContent::-webkit-scrollbar {
          width: 4px;
      }
      #cacheContent::-webkit-scrollbar-track {
          background: transparent;
      }
      #cacheContent::-webkit-scrollbar-thumb {
          background: var(--scrollbar-thumb);
          border-radius: 2px;
      }

      .cache-item {
          display: flex;
          align-items: center;
          cursor: pointer;
          border-radius: 8px;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
          transition: all 0.3s ease;
          text-align: left;
          padding: 10px 12px;
          margin-bottom: 8px;
          background: var(--cache-bg);
          border: 1px solid var(--cache-border);
          gap: 10px;
      }
      .cache-item:hover {
          background-color: var(--accent-light-hover);
          border-color: var(--accent);
          opacity: 0.9;
      }
      .cache-ext {
          flex-shrink: 0;
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          border-radius: 6px;
          font-size: 16px;
      }
      .cache-ext-video { background: linear-gradient(135deg, #F0E8FE 0%, #e0d0fc 100%); }
      .cache-ext-audio { background: linear-gradient(135deg, #E0F5E9 0%, #c8ecda 100%); }

      .cache-thumb {
          flex-shrink: 0;
          width: 40px;
          height: 40px;
          border-radius: 6px;
          object-fit: cover;
      }
      .cache-info {
          flex: 1;
          min-width: 0;
      }
      .cache-name {
          font-size: 13px;
          font-weight: 500;
          color: var(--text-primary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
      }
      .cache-url {
          font-size: 11px;
          color: var(--text-muted);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          margin-top: 2px;
      }
      .cache-copy {
          flex-shrink: 0;
          width: 32px;
          height: 32px;
          border: none;
          background: var(--accent-light);
          color: var(--accent);
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
      }
      .cache-copy:hover {
          background: var(--accent);
          color: white;
      }
      .cache-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          font-size: 14px;
          font-weight: 500;
          color: var(--text-secondary);
      }
      .cache-clear-all {
          background: none;
          border: none;
          color: var(--danger);
          cursor: pointer;
          font-size: 13px;
          padding: 4px 8px;
          border-radius: 4px;
          transition: all 0.2s ease;
      }
      .cache-clear-all:hover {
          background: var(--danger-light);
      }
      .upload-hint {
          color: #999;
          font-size: 14px;
          margin: 12px 0 16px 0;
          line-height: 1.6;
          text-align: center;
      }
      .upload-hint i {
          color: var(--accent);
          margin-right: 5px;
      }
      .project-link {
          font-size: 13px;
          text-align: center;
          margin-top: 12px;
          margin-bottom: 0;
          color: #999;
          line-height: 1.6;
      }
      .project-link a {
          color: #667eea;
          text-decoration: none;
          transition: color 0.3s ease;
      }
      .project-link a:hover {
          color: #764ba2;
          text-decoration: underline;
      }
      .stats-line {
          font-size: 13px;
          text-align: center;
          margin-top: 8px;
          margin-bottom: 0;
          color: #999;
      }
      .stats-line i {
          margin-right: 4px;
      }
      textarea.form-control {
          max-height: 200px;
          overflow-y: hidden;
          resize: none;
      }
      .file-input-container {
          margin-bottom: 20px !important;
      }
      #fileLink-group.form-group {
          margin: 20px 0 20px 0 !important;
      }

      .file-caption-name {
          padding-left: 10px !important;
      }
      .file-input .input-group {
          gap: 12px;
      }
      .fileinput-remove-button {
          margin-right: 12px !important;
      }
      .btn-file > input {
          position: absolute !important;
          top: -9999px !important;
          left: -9999px !important;
          width: 1px !important;
          height: 1px !important;
          opacity: 0 !important;
      }
      .btn-file {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s ease;
      }
      .btn-file:hover {
          transform: translateY(-2px) !important;
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4) !important;
      }
      .upload-progress {
          display: none;
          margin-top: 15px;
      }
      #uploadProgress .progress-bar {
          background: var(--title-gradient);
          font-size: 13px;
          font-weight: 500;
          letter-spacing: 0.5px;
      }
      .thumbnail-container {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 15px;
          justify-content: center;
      }
      .thumbnail-item {
          position: relative;
          width: 80px;
          height: 80px;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: var(--thumbnail-shadow);
          transition: transform 0.2s ease;
      }
      .thumbnail-item:hover {
          transform: scale(1.05);
      }
      .thumbnail-item img {
          width: 100%;
          height: 100%;
          object-fit: cover;
      }
      .thumbnail-item video {
          width: 100%;
          height: 100%;
          object-fit: cover;
      }
      .thumbnail-item .file-icon {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--title-gradient);
          color: white;
          font-size: 24px;
      }
      .btn-primary {
          background: var(--title-gradient) !important;
          border: none !important;
          color: white !important;
          border-radius: 8px !important;
          font-weight: 500 !important;
          transition: all 0.3s ease !important;
          box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3) !important;
      }
      .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4) !important;
      }
      .btn-primary:active, .btn-primary:focus {
          transform: translateY(0);
          box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3) !important;
      }
      .file-drop-zone {
          border: 2px dashed var(--accent) !important;
          border-radius: 12px !important;
          background: var(--accent-light) !important;
          transition: all 0.3s ease !important;
      }
      .file-drop-zone:hover {
          border-color: var(--accent-hover) !important;
          background: var(--accent-light-hover) !important;
      }
      .file-drop-zone-title {
          color: var(--accent) !important;
          font-weight: 500 !important;
      }
      .btn-danger, .fileinput-remove {
          border-radius: 8px !important;
          font-weight: 500 !important;
          transition: all 0.3s ease !important;
      }
      .btn-danger:hover, .fileinput-remove:hover {
          transform: translateY(-2px);
      }
      .btn-danger:active, .fileinput-remove:active {
          transform: translateY(0);
      }
      .btn-light {
          border-radius: 8px !important;
          font-weight: 500 !important;
          transition: all 0.3s ease !important;
      }
      .btn-light:hover {
          transform: translateY(-2px);
      }
      .btn-light:active {
          transform: translateY(0);
      }
      /* Skeleton screen */
      .skeleton-wrapper {
          padding: 0;
      }
      .skeleton-block {
          border-radius: 8px;
          background: linear-gradient(90deg, var(--skeleton-base) 25%, var(--skeleton-shine) 50%, var(--skeleton-base) 75%);
          background-size: 200% 100%;
          animation: skeletonShimmer 1.5s ease-in-out infinite;
      }
      .skeleton-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 20px;
      }
      .skeleton-buttons {
          display: flex;
          gap: 16px;
          align-items: center;
      }
      .skeleton-circle {
          border-radius: 50%;
      }
      @keyframes skeletonShimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
      }
      @media (max-width: 768px) {
          .card {
              width: 95%;
              max-width: 100%;
              padding: 20px;
              border-radius: 12px;
          }
          .title {
              font-size: 24px;
          }
          #themeToggle, #viewCacheBtn {
              font-size: 20px;
          }
          .btn-primary, .btn-danger, .btn-light {
              min-height: 44px;
              min-width: 44px;
          }
          .cache-item {
              padding: 15px;
          }
      }
      #dragOverlay {
          display: none;
          position: fixed;
          inset: 0;
          background: var(--overlay-bg);
          z-index: 9999;
          justify-content: center;
          align-items: center;
          backdrop-filter: blur(3px);
          -webkit-backdrop-filter: blur(3px);
      }
      #dragOverlay::before {
          content: '';
          position: absolute;
          inset: 50px;
          border: 3px dashed rgba(255,255,255,0.5);
          border-radius: 24px;
          pointer-events: none;
      }
      #dragOverlay.active {
          display: flex;
      }
      #dragOverlay .drag-hint {
          text-align: center;
          color: white;
          pointer-events: none;
      }
      #dragOverlay .drag-hint i {
          font-size: 56px;
          margin-bottom: 16px;
          opacity: 0.8;
      }
      #dragOverlay .drag-hint p {
          font-size: 22px;
          margin: 0;
          font-weight: 500;
          opacity: 0.8;
      }
  </style>
</head>
<body>
      <div id="dragOverlay"><div class="drag-hint"><i class="fas fa-cloud-upload-alt"></i><p>\u62D6\u62FD\u6587\u4EF6\u5230\u6B64\u5904\u4E0A\u4F20</p></div></div>
      <div class="card">
      <div id="skeletonWrapper" class="skeleton-wrapper">
        <div class="skeleton-header">
          <div class="skeleton-block" style="height:32px;width:200px"></div>
          <div class="skeleton-buttons">
            <div class="skeleton-block skeleton-circle" style="width:32px;height:32px"></div>
            <div class="skeleton-block skeleton-circle" style="width:32px;height:32px"></div>
            <div class="skeleton-block skeleton-circle" style="width:32px;height:32px"></div>
          </div>
        </div>
        <div class="skeleton-block" style="height:130px;margin-bottom:16px"></div>
        <div class="skeleton-block" style="height:20px;width:320px;margin:0 auto 16px"></div>
        <div class="skeleton-block" style="height:16px;width:180px;margin:0 auto"></div>
      </div>
      <div id="realContent" style="display:none">
      <div class="card-header-row">
        <h1 class="title" style="margin:0">Media - FishByte</h1>
        <div class="header-buttons">
          <a href="/admin" class="btn" id="adminLink" title="\u7BA1\u7406\u9875\u9762"><i class="fas fa-arrow-right"></i></a>
          <button type="button" class="btn" id="themeToggle" title="\u5207\u6362\u4E3B\u9898"><i class="fas fa-sun"></i></button>
          <button type="button" class="btn" id="viewCacheBtn" title="\u67E5\u770B\u6700\u8FD1\u4E0A\u4F20\u8BB0\u5F55"><i class="fas fa-clock"></i></button>
        </div>
      </div>
      <div class="card-body">
          <form id="uploadForm" action="/upload" method="post" enctype="multipart/form-data">
              <div class="file-input-container">
                  <input id="fileInput" name="file" type="file" class="form-control-file" data-browse-on-zone-click="true" multiple accept="image/*,video/*,audio/*">
              </div>
              <div class="upload-hint">
                  <i class="fas fa-info-circle"></i>\u652F\u6301\u6279\u91CF\u4E0A\u4F20\u3001\u62D6\u62FD\u4E0A\u4F20\u3001\u7C98\u8D34\u4E0A\u4F20
              </div>
              <div id="fileLink-group" class="form-group mb-3" style="display: none;">
                  <textarea class="form-control" id="fileLink" readonly></textarea>
              </div>
              <div class="upload-progress" id="uploadProgress">
                  <div style="font-size:13px;color:var(--text-secondary);margin-bottom:6px;text-align:center">\u4E0A\u4F20\u4E2D...</div>
                  <div class="progress" style="height:22px;border-radius:6px">
                      <div class="progress-bar progress-bar-striped" id="progressBar" role="progressbar" style="width:0%">0%</div>
                  </div>
              </div>
              <div class="thumbnail-container" id="thumbnailContainer"></div>
              <div id="cacheContent" style="display: none;"></div>
          </form>
      </div>
      <p class="project-link">\u9879\u76EE\u6838\u5FC3\u6765\u6E90 - <a href="https://github.com/0-RTT/JSimages" target="_blank" rel="noopener noreferrer">0-RTT/JSimages</a></p>
      <p class="stats-line" id="statsLine"><i class="fas fa-database"></i> \u52A0\u8F7D\u7EDF\u8BA1\u4E2D...</p>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js" integrity="sha512-894YE6QWD5I59HgZOGReFYm4dnWc1Qt5NtvYSaNcOP+u1T9qYdvdihz0PPSiiqn/+/3e7Jo4EaG7TubfWGUrMQ==" crossorigin="anonymous" referrerpolicy="no-referrer"><\/script>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/bootstrap-fileinput/5.2.7/js/fileinput.min.js" integrity="sha512-CCLv901EuJXf3k0OrE5qix8s2HaCDpjeBERR2wVHUwzEIc7jfiK9wqJFssyMOc1lJ/KvYKsDenzxbDTAQ4nh1w==" crossorigin="anonymous" referrerpolicy="no-referrer"><\/script>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/bootstrap-fileinput/5.2.7/js/locales/zh.min.js" integrity="sha512-IizKWmZY3aznnbFx/Gj8ybkRyKk7wm+d7MKmEgOMRQDN1D1wmnDRupfXn6X04pwIyKFWsmFVgrcl0j6W3Z5FDQ==" crossorigin="anonymous" referrerpolicy="no-referrer"><\/script>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/toastr.js/2.1.4/toastr.min.js" integrity="sha512-lbwH47l/tPXJYG9AcFNoJaTMhGvYWhVM9YI43CT+uteTRRaiLCui8snIgyAN8XWgNjNhCqlAUdzZptso6OCoFQ==" crossorigin="anonymous" referrerpolicy="no-referrer"><\/script>
      <script>
      const ALLOWED_EXTENSIONS = ['jpg','jpeg','png','gif','webp','bmp','svg','ico','heic','tiff','mp4','avi','mov','webm','wmv','flv','mkv','mp3','wav','ogg','flac','aac','m4a','wma','opus'];
      function isAllowedFile(file) {
        const ext = file.name.split('.').pop().toLowerCase();
        return ALLOWED_EXTENSIONS.includes(ext);
      }


    
      $(document).ready(function() {
        // Apply theme before skeleton transition (avoids light flash)
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) {
          document.documentElement.setAttribute('data-theme', savedTheme);
        } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
          document.documentElement.setAttribute('data-theme', 'dark');
        }
        // Skeleton screen transition
        $('#skeletonWrapper').fadeOut(300, function() {
          $('#realContent').fadeIn(300);
        });
        toastr.options.timeOut = 3000;
        toastr.options.progressBar = true;
        let originalImageURLs = [];
        let thumbnailData = [];
        let isCacheVisible = false;
        let activeXHRs = [];
        initFileInput();
        $('.btn-file').attr('title', '\u9009\u62E9\u6587\u4EF6');
        $(window).on('focus', function() {
            setTimeout(function() {
                $('.file-input').removeClass('file-thumb-loading');
                $('.file-caption-name').removeClass('file-processing');
            }, 100);
        });
        fetchStats();

        function initFileInput() {
          $("#fileInput").fileinput({
            theme: 'fa',
            language: 'zh',
            browseClass: "btn btn-primary",
            removeClass: "btn btn-danger",
            showUpload: false,
            showPreview: false,
            browseLabel: "\u9009\u62E9",
            msgPlaceholder: "\u70B9\u51FB\u53F3\u4FA7\u6309\u94AE\u4E0A\u4F20\u5A92\u4F53\u6587\u4EF6",
            msgSelected: "\u9009\u4E2D {n} \u4E2A\u6587\u4EF6"
          }).on('fileinitialized', function() {
            $(this).closest('.file-input').find('input[type="file"]').attr('accept', 'image/*,video/*,audio/*');
          }).on('filebatchselected', handleFileSelection)
            .on('fileclear', handleFileClear);
        }

        async function fetchStats() {
          try {
            const res = await fetch('/api/stats');
            const data = await res.json();
            if (data.total !== undefined) {
              $('#statsLine').html(
                '<i class="fas fa-image"></i> ' + data.images +
                ' &nbsp;<i class="fas fa-video"></i> ' + data.videos +
                ' &nbsp;<i class="fas fa-music"></i> ' + data.audio +
                ' &nbsp;<i class="fas fa-file"></i> ' + data.other +
                ' &nbsp;| \u5171 ' + data.total + ' \u4E2A\u6587\u4EF6'
              );
            }
          } catch(e) {
            $('#statsLine').html('\u7EDF\u8BA1\u4E0D\u53EF\u7528');
          }
        }

        // theme toggle
        function setTheme(theme) {
          document.documentElement.setAttribute('data-theme', theme);
          localStorage.setItem('theme', theme);
          $('#themeToggle i').attr('class', theme === 'dark' ? 'fas fa-moon' : 'fas fa-sun');
        }
        // already applied above for skeleton
        $('#themeToggle').on('click', function() {
          const current = document.documentElement.getAttribute('data-theme');
          setTheme(current === 'dark' ? 'light' : 'dark');
        });

        async function handleFileSelection() {
          if (isCacheVisible) {
            $('#cacheContent').hide();
            isCacheVisible = false;
          }
          const files = $('#fileInput')[0].files;
          const allowedFiles = [];
          const rejectedFiles = [];
          for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (isAllowedFile(file)) {
              allowedFiles.push(file);
            } else {
              rejectedFiles.push(file.name);
            }
          }
          if (rejectedFiles.length > 0) {
            toastr.warning('\u4E0D\u652F\u6301\u7684\u6587\u4EF6\u7C7B\u578B: ' + rejectedFiles.join(', '));
          }
          if (rejectedFiles.length > 0 && allowedFiles.length === 0) {
            setTimeout(() => {
              $('#fileInput').fileinput('clear');
            }, 0);
            return;
          }
          try {
            for (let i = 0; i < allowedFiles.length; i++) {
              const file = allowedFiles[i];
              const fileHash = await calculateFileHash(file);
              const cachedData = getCachedData(fileHash);
              if (cachedData) {
                  handleCachedFile(cachedData);
              } else {
                  await uploadFile(file, fileHash);
              }
            }
            if (originalImageURLs.length > 0) {
              copyToClipboardWithToastr(originalImageURLs.join('\\n'));
            }
          } catch (error) {
            console.error('\u5904\u7406\u6587\u4EF6\u65F6\u51FA\u73B0\u9519\u8BEF:', error);
            $('#uploadProgress').hide();
            toastr.error('\u6587\u4EF6\u5904\u7406\u5931\u8D25');
          }
        }

        function getCachedData(fileHash) {
            const cacheData = JSON.parse(localStorage.getItem('uploadCache')) || [];
            return cacheData.find(item => item.hash === fileHash);
        }

        function handleCachedFile(cachedData) {
            if (!originalImageURLs.includes(cachedData.url)) {
                originalImageURLs.push(cachedData.url);
                updateFileLinkDisplay();
                addThumbnailFromCache(cachedData.fileName, cachedData.url);
                toastr.info('\u5DF2\u4ECE\u7F13\u5B58\u4E2D\u8BFB\u53D6\u6570\u636E');
            }
        }

        function addThumbnailFromCache(fileName, url) {
            const container = $('#thumbnailContainer');
            const index = thumbnailData.length;
            const type = getCacheType(fileName);
            thumbnailData.push({ previewUrl: url, url, file: null });

            let thumbnailContent = '';
            if (type === 'image') {
                thumbnailContent = '<span style="display:block;width:100%;height:100%;background:#ffffff;position:relative;overflow:hidden">' +
                    '<i class="fas fa-image" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#5A5A5A;font-size:24px;z-index:0"></i>' +
                    '<img src="' + url + '" alt="thumbnail" loading="lazy" draggable="false" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:1" onload="this.parentNode.querySelector(\\'i\\').style.display=\\'none\\'" onerror="this.style.display=\\'none\\'">' +
                    '</span>';
            } else if (type === 'video') {
                thumbnailContent = '<span style="display:block;width:100%;height:100%;background:linear-gradient(135deg,#F0E8FE 0%,#e0d0fc 100%);position:relative;overflow:hidden">' +
                    '<i class="fas fa-play-circle" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#6B46A0;font-size:24px;z-index:0"></i>' +
                    '<video src="' + url + '" muted playsinline preload="metadata" draggable="false" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:1" onerror="this.style.display=\\'none\\'"></video>' +
                    '</span>';
            } else if (type === 'audio') {
                thumbnailContent = '<span style="display:block;width:100%;height:100%;background:linear-gradient(135deg,#E0F5E9 0%,#c8ecda 100%);position:relative;overflow:hidden">' +
                    '<i class="fas fa-music" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#2D6A4F;font-size:24px"></i>' +
                    '</span>';
            } else {
                const ext = fileName.split('.').pop().toUpperCase();
                thumbnailContent = '<span style="display:block;width:100%;height:100%;background:linear-gradient(135deg,#E8F0FE 0%,#d5e3fc 100%);position:relative;overflow:hidden">' +
                    '<span style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#4A6FA5;font-size:20px;font-weight:600">' + ext + '</span>' +
                    '</span>';
            }

            const thumbnailHtml = '<div class="thumbnail-item" data-index="' + index + '">' +
                thumbnailContent +
            '</div>';

            container.append(thumbnailHtml);
        }

        function updateFileLinkDisplay() {
            $('#fileLink').val(originalImageURLs.join('\\n'));
            $('.form-group').show();
            $('.upload-hint, .project-link, .stats-line').hide();
            adjustTextareaHeight($('#fileLink')[0]);
        }

        function addThumbnail(file, url) {
            const container = $('#thumbnailContainer');
            const index = thumbnailData.length;
            const previewUrl = URL.createObjectURL(file);
            thumbnailData.push({ previewUrl, url, file });

            let thumbnailContent = '';
            if (file.type.startsWith('image/')) {
                thumbnailContent = '<span style="display:block;width:100%;height:100%;background:#ffffff;position:relative;overflow:hidden">' +
                    '<i class="fas fa-image" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#5A5A5A;font-size:24px;z-index:0"></i>' +
                    '<img src="' + previewUrl + '" alt="thumbnail" draggable="false" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:1" onload="this.parentNode.querySelector(\\'i\\').style.display=\\'none\\'" onerror="this.style.display=\\'none\\'">' +
                    '</span>';
            } else if (file.type.startsWith('video/')) {
                thumbnailContent = '<span style="display:block;width:100%;height:100%;background:linear-gradient(135deg,#F0E8FE 0%,#e0d0fc 100%);position:relative;overflow:hidden">' +
                    '<i class="fas fa-play-circle" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#6B46A0;font-size:24px;z-index:0"></i>' +
                    '<video src="' + previewUrl + '" muted playsinline preload="metadata" draggable="false" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:1" onerror="this.style.display=\\'none\\'"></video>' +
                    '</span>';
            } else if (file.type.startsWith('audio/')) {
                thumbnailContent = '<span style="display:block;width:100%;height:100%;background:linear-gradient(135deg,#E0F5E9 0%,#c8ecda 100%);position:relative;overflow:hidden">' +
                    '<i class="fas fa-music" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#2D6A4F;font-size:24px"></i>' +
                    '</span>';
            } else {
                const ext = file.name.split('.').pop().toUpperCase();
                thumbnailContent = '<span style="display:block;width:100%;height:100%;background:linear-gradient(135deg,#E8F0FE 0%,#d5e3fc 100%);position:relative;overflow:hidden">' +
                    '<span style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#4A6FA5;font-size:20px;font-weight:600">' + ext + '</span>' +
                    '</span>';
            }

            const thumbnailHtml = '<div class="thumbnail-item" data-index="' + index + '">' +
                thumbnailContent +
            '</div>';

            container.append(thumbnailHtml);
        }

        function clearAllThumbnails() {
            thumbnailData.forEach(item => {
                if (item && item.previewUrl) {
                    URL.revokeObjectURL(item.previewUrl);
                }
            });
            thumbnailData = [];
            $('#thumbnailContainer').empty();
        }

        async function calculateFileHash(file) {
          const chunkSize = 1024 * 1024;
          const chunk = file.size > chunkSize ? file.slice(0, chunkSize) : file;
          const arrayBuffer = await chunk.arrayBuffer();
          const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const hash = hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');
          return hash + '-' + file.size + '-' + file.lastModified;
        }

        async function uploadFile(file, fileHash) {
          try {
            const formData = new FormData();
            formData.append('file', file, file.name);
            $('#uploadProgress').show();
            $('#progressBar').css('width', '0%').text('0%');
            const xhr = new XMLHttpRequest();
            xhr.upload.addEventListener('progress', (e) => {
              if (e.lengthComputable) {
                const percentComplete = Math.round((e.loaded / e.total) * 100);
                $('#progressBar').css('width', percentComplete + '%').text(percentComplete + '%');
              }
            });

            activeXHRs.push(xhr);

            const uploadPromise = new Promise((resolve, reject) => {
              function cleanup() {
                const idx = activeXHRs.indexOf(xhr);
                if (idx !== -1) activeXHRs.splice(idx, 1);
              }
              xhr.onload = () => {
                cleanup();
                if (xhr.status >= 200 && xhr.status < 300) {
                  try {
                    resolve(JSON.parse(xhr.responseText));
                  } catch (e) {
                    reject(new Error('\u54CD\u5E94\u89E3\u6790\u5931\u8D25'));
                  }
                } else {
                  try {
                    const errorData = JSON.parse(xhr.responseText);
                    reject(new Error(errorData.error || '\u4E0A\u4F20\u5931\u8D25'));
                  } catch (e) {
                    reject(new Error('\u4E0A\u4F20\u5931\u8D25: HTTP ' + xhr.status));
                  }
                }
              };
              xhr.onerror = () => { cleanup(); reject(new Error('\u7F51\u7EDC\u9519\u8BEF\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u8FDE\u63A5')); };
              xhr.ontimeout = () => { cleanup(); reject(new Error('\u4E0A\u4F20\u8D85\u65F6\uFF0C\u8BF7\u91CD\u8BD5')); };
              xhr.open('POST', '/upload');
              xhr.timeout = 120000;
              xhr.send(formData);
            });

            const responseData = await uploadPromise;
            $('#uploadProgress').hide();
            if (responseData.error) {
              toastr.error(responseData.error);
              if (originalImageURLs.length === 0) {
                $('#fileInput').fileinput('clear');
              }
            } else {
              originalImageURLs.push(responseData.data);
              addThumbnail(file, responseData.data);
              $('#fileLink').val(originalImageURLs.join('\\n'));
              $('.form-group').show();
              $('.upload-hint, .project-link, .stats-line').hide();
              adjustTextareaHeight($('#fileLink')[0]);
              saveToLocalCache(responseData.data, file.name, fileHash);
            }
          } catch (error) {
            console.error('\u5904\u7406\u6587\u4EF6\u65F6\u51FA\u73B0\u9519\u8BEF:', error);
            $('#uploadProgress').hide();
            if (originalImageURLs.length === 0) {
              $('#fileInput').fileinput('clear');
            }
            let errorMsg = '\u6587\u4EF6\u5904\u7406\u5931\u8D25';
            if (error.message.includes('\u7F51\u7EDC')) {
              errorMsg = '\u7F51\u7EDC\u9519\u8BEF\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u8FDE\u63A5';
            } else if (error.message.includes('\u8D85\u65F6')) {
              errorMsg = '\u4E0A\u4F20\u8D85\u65F6\uFF0C\u8BF7\u91CD\u8BD5';
            } else if (error.message) {
              errorMsg = error.message;
            }
            toastr.error(errorMsg);
          }
        }
    
        $(document).on('paste', async function(event) {
          const clipboardData = event.originalEvent.clipboardData;
          if (clipboardData && clipboardData.items) {
            for (let i = 0; i < clipboardData.items.length; i++) {
              const item = clipboardData.items[i];
              if (item.kind === 'file') {
                const pasteFile = item.getAsFile();
                if (!isAllowedFile(pasteFile)) {
                  toastr.warning('\u4E0D\u652F\u6301\u7684\u6587\u4EF6\u7C7B\u578B: ' + pasteFile.name);
                  continue;
                }
                const dataTransfer = new DataTransfer();
                const existingFiles = $('#fileInput')[0].files;
                for (let j = 0; j < existingFiles.length; j++) {
                  dataTransfer.items.add(existingFiles[j]);
                }
                dataTransfer.items.add(pasteFile);
                $('#fileInput')[0].files = dataTransfer.files;
                $('#fileInput').trigger('change');
                break;
              }
            }
          }
        });

        let dragCounter = 0;
        $(document).on('dragenter', function(e) {
          const dt = e.originalEvent.dataTransfer;
          if (dt.types && !dt.types.includes('Files')) return;
          e.preventDefault();
          dragCounter++;
          if (dragCounter === 1) {
            $('#dragOverlay').addClass('active');
          }
        });
        $(document).on('dragover', function(e) {
          const dt = e.originalEvent.dataTransfer;
          if (dt.types && !dt.types.includes('Files')) return;
          e.preventDefault();
        });
        $(document).on('dragleave', function(e) {
          const dt = e.originalEvent.dataTransfer;
          if (dt.types && !dt.types.includes('Files')) return;
          e.preventDefault();
          dragCounter--;
          if (dragCounter === 0) {
            $('#dragOverlay').removeClass('active');
          }
        });
        $(document).on('drop', function(e) {
          e.preventDefault();
          dragCounter = 0;
          $('#dragOverlay').removeClass('active');
          const files = e.originalEvent.dataTransfer.files;
          if (files.length > 0) {
            const dataTransfer = new DataTransfer();
            const rejected = [];
            for (let i = 0; i < files.length; i++) {
              if (isAllowedFile(files[i])) {
                dataTransfer.items.add(files[i]);
              } else {
                rejected.push(files[i].name);
              }
            }
            if (rejected.length > 0) {
              toastr.warning('\u4E0D\u652F\u6301\u7684\u6587\u4EF6\u7C7B\u578B: ' + rejected.join(', '));
            }
            if (dataTransfer.files.length > 0) {
              $('#fileInput')[0].files = dataTransfer.files;
              $('#fileInput').trigger('change');
            }
          }
        });
    
        $(document).on('click', '.btn-file', function(e) {
          if (!$(e.target).is('input')) {
            $('#fileInput').trigger('click');
          }
        });

        function handleFileClear(event) {

          if (isCacheVisible) {
            $('#cacheContent').hide();
            isCacheVisible = false;
          }
          activeXHRs.forEach(xhr => xhr.abort());
          activeXHRs = [];
          $('#uploadProgress').hide();
          $('#fileLink').val('');
          adjustTextareaHeight($('#fileLink')[0]);
          hideButtonsAndTextarea();
          originalImageURLs = [];
          clearAllThumbnails();
        }

        function adjustTextareaHeight(textarea) {
          textarea.style.height = '1px';
          textarea.style.height = (textarea.scrollHeight > 200 ? 200 : textarea.scrollHeight) + 'px';

          if (textarea.scrollHeight > 200) {
            textarea.style.overflowY = 'auto';
          } else {
            textarea.style.overflowY = 'hidden';
          }
        }

        function copyToClipboardWithToastr(text) {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
              toastr.success('\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F');
            }).catch(() => {
              toastr.error('\u590D\u5236\u5931\u8D25');
            });
          } else {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            try {
              document.execCommand('copy');
              toastr.success('\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F');
            } catch (err) {
              toastr.error('\u590D\u5236\u5931\u8D25');
            }
            document.body.removeChild(textarea);
          }
        }

        function hideButtonsAndTextarea() {
          $('#fileLink').parent('.form-group').hide();
          $('.upload-hint, .project-link, .stats-line').show();
        }

        function saveToLocalCache(url, fileName, fileHash) {
          const timestamp = new Date().toLocaleString('zh-CN', { hour12: false });
          const cacheData = JSON.parse(localStorage.getItem('uploadCache')) || [];
          cacheData.unshift({ url, fileName, hash: fileHash, timestamp });
          if (cacheData.length > 10) cacheData.length = 10;
          localStorage.setItem('uploadCache', JSON.stringify(cacheData));
        }

        function getCacheType(fileName) {
          const ext = fileName.split('.').pop().toLowerCase();
          if (['jpg','jpeg','png','gif','webp','bmp','svg','ico','heic'].includes(ext)) return 'image';
          if (['mp4','mov','avi','wmv','flv','mkv','webm'].includes(ext)) return 'video';
          if (['mp3','wav','ogg','aac','flac','m4a','wma'].includes(ext)) return 'audio';
          return 'other';
        }

        $('#viewCacheBtn').on('click', function() {
          const cacheData = JSON.parse(localStorage.getItem('uploadCache')) || [];
          const cacheContent = $('#cacheContent');
          cacheContent.empty();
          if (isCacheVisible) {
            cacheContent.hide();
            isCacheVisible = false;
            if (originalImageURLs.length === 0) {
              $('.upload-hint, .project-link, .stats-line').show();
            }
          } else {
            if (cacheData.length > 0) {
              let html = '<div class="cache-header"><span>\u6700\u8FD1\u4E0A\u4F20\u8BB0\u5F55 <small style="font-weight:400;color:#999;font-size:10px">\u663E\u793A10\u6761</small></span><button class="cache-clear-all" type="button">\u6E05\u9664\u5168\u90E8</button></div>';
              html += cacheData.map((item) => {
                const type = getCacheType(item.fileName);
                const truncatedUrl = item.url.length > 50 ? item.url.substring(0, 50) + '...' : item.url;
                let leftHtml;
                if (type === 'image') {
                  leftHtml = '<span class="cache-ext" style="background:#ffffff;position:relative;overflow:hidden">' +
                    '<i class="fas fa-image" style="color:#5A5A5A"></i>' +
                    '<img class="cache-thumb" src="' + item.url + '" alt="" loading="lazy" draggable="false" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:1" onload="this.parentNode.querySelector(\\'i\\').style.display=\\'none\\'" onerror="this.style.display=\\'none\\'">' +
                    '</span>';
                } else if (type === 'video') {
                  leftHtml = '<span class="cache-ext cache-ext-video" style="position:relative;overflow:hidden">' +
                    '<i class="fas fa-play-circle" style="color:#6B46A0"></i>' +
                    '<video class="cache-thumb" src="' + item.url + '" preload="metadata" muted draggable="false" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:1" onerror="this.style.display=\\'none\\'"></video>' +
                    '</span>';
                } else if (type === 'audio') {
                  leftHtml = '<span class="cache-ext cache-ext-audio"><i class="fas fa-music" style="color:#2D6A4F"></i></span>';
                } else {
                  leftHtml = '<span class="cache-ext" style="background:linear-gradient(135deg,#E8F0FE 0%,#d5e3fc 100%)"><i class="fas fa-file" style="color:#4A6FA5"></i></span>';
                }
                return '<div class="cache-item" data-url="' + item.url + '">' +
                  leftHtml +
                  '<div class="cache-info">' +
                    '<div class="cache-name">' + item.fileName + '</div>' +
                    '<div class="cache-url" title="' + item.url + '">' + truncatedUrl + '</div>' +
                  '</div>' +
                  '<button class="cache-copy" type="button" title="\u590D\u5236URL"><i class="fas fa-copy"></i></button>' +
                '</div>';
              }).join('');
              cacheContent.html(html).show();
            } else {
              cacheContent.html('<div style="text-align:center;color:#999;padding:20px;">\u8FD8\u6CA1\u6709\u8BB0\u5F55\u54E6\uFF01</div>').show();
            }
            isCacheVisible = true;
            $('.upload-hint, .project-link, .stats-line').hide();
          }
        });

        $(document).on('click', '.cache-copy', function(e) {
          e.preventDefault();
          e.stopPropagation();
          const url = $(this).closest('.cache-item').data('url');
          copyToClipboardWithToastr(url);
        });

        $(document).on('click', '.cache-clear-all', function(e) {
          e.preventDefault();
          if (!confirm('\u786E\u5B9A\u8981\u6E05\u9664\u5168\u90E8\u5386\u53F2\u8BB0\u5F55\u5417\uFF1F')) return;
          localStorage.removeItem('uploadCache');
          $('#cacheContent').hide();
          isCacheVisible = false;
        });
      });
    <\/script>
</div>
</body>
</html>
`, "text/html;charset=UTF-8", CACHE_CONFIG.HTML);
  await cache.put(cacheKey, response.clone());
  return response;
}
__name(handleRootRequest, "handleRootRequest");
__name2(handleRootRequest, "handleRootRequest");
__name22(handleRootRequest, "handleRootRequest");
async function handleStatsRequest(config) {
  try {
    const result = await config.database.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN type = 'image' THEN 1 ELSE 0 END) as images,
        SUM(CASE WHEN type = 'video' THEN 1 ELSE 0 END) as videos,
        SUM(CASE WHEN type = 'audio' THEN 1 ELSE 0 END) as audio
      FROM media
    `).first();
    return jsonResponse({
      total: result.total,
      images: result.images || 0,
      videos: result.videos || 0,
      audio: result.audio || 0,
      other: result.total - (result.images || 0) - (result.videos || 0) - (result.audio || 0)
    });
  } catch (error) {
    return jsonResponse({ total: 0, images: 0, videos: 0, audio: 0, other: 0 }, 500);
  }
}
__name(handleStatsRequest, "handleStatsRequest");
__name2(handleStatsRequest, "handleStatsRequest");
__name22(handleStatsRequest, "handleStatsRequest");
async function handleAdminRequest(request, config) {
  if (!authenticate(request, config.username, config.password)) {
    return unauthorizedResponse();
  }
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const type = url.searchParams.get("type") || "all";
  return await generateAdminPage(config.database, page, type);
}
__name(handleAdminRequest, "handleAdminRequest");
__name2(handleAdminRequest, "handleAdminRequest");
__name22(handleAdminRequest, "handleAdminRequest");
async function generateAdminPage(DATABASE, page = 1, type = "all") {
  const pageSize = 30;
  const offset = (page - 1) * pageSize;
  const typeFilter = buildTypeFilter(type);
  const [rAll, rImage, rVideo, rAudio, rOther] = await Promise.all([
    DATABASE.prepare("SELECT COUNT(*) as count FROM media").first(),
    DATABASE.prepare("SELECT COUNT(*) as count FROM media " + buildTypeFilter("image")).first(),
    DATABASE.prepare("SELECT COUNT(*) as count FROM media " + buildTypeFilter("video")).first(),
    DATABASE.prepare("SELECT COUNT(*) as count FROM media " + buildTypeFilter("audio")).first(),
    DATABASE.prepare("SELECT COUNT(*) as count FROM media " + buildTypeFilter("other")).first()
  ]);
  const countAll = rAll.count;
  const countImage = rImage.count;
  const countVideo = rVideo.count;
  const countAudio = rAudio.count;
  const countOther = rOther.count;
  const totalCount = await DATABASE.prepare("SELECT COUNT(*) as count FROM media " + typeFilter).first();
  const totalPages = Math.ceil(totalCount.count / pageSize);
  const mediaData = await fetchMediaData(DATABASE, pageSize, offset, typeFilter);
  const mediaHtml = mediaData.map(({ url, size, type, uploaded_at }) => {
    const fileExtension = url.split(".").pop().toLowerCase();
    const escapedUrl = escapeHtml(url);
    const typeLabel = escapeHtml(fileExtension);
    const fileSize = size > 0 ? formatFileSize(size) : "\u2014";
    let gradient, iconColor, iconClass, mediaTag;
    if (type === "image") {
      gradient = "#ffffff";
      iconColor = "#5A5A5A";
      iconClass = "fas fa-image";
      mediaTag = `<img class="media-img" data-src="${escapedUrl}" alt="" draggable="false" onload="this.parentNode.querySelector('i').style.display='none'" onerror="this.style.display='none'">`;
    } else if (type === "video") {
      gradient = "linear-gradient(135deg,#F0E8FE 0%,#e0d0fc 100%)";
      iconColor = "#6B46A0";
      iconClass = "fas fa-play-circle";
      mediaTag = `<video class="media-img" data-src="${escapedUrl}" muted playsinline preload="metadata" draggable="false" onloadeddata="this.parentNode.querySelector('i').style.display='none'" onerror="this.style.display='none'"></video>`;
    } else if (type === "audio") {
      gradient = "linear-gradient(135deg,#E0F5E9 0%,#c8ecda 100%)";
      iconColor = "#2D6A4F";
      iconClass = "fas fa-music";
      mediaTag = `<audio class="media-audio" data-src="${escapedUrl}" preload="none" controls onloadeddata="this.parentNode.querySelector('i').style.display='none'" onerror="this.style.display='none'"></audio>`;
    } else {
      gradient = "linear-gradient(135deg,#E8F0FE 0%,#d5e3fc 100%)";
      iconColor = "#4A6FA5";
      iconClass = "fas fa-file";
      mediaTag = "";
    }
    return `
    <div class="media-container" data-key="${escapedUrl}" onclick="toggleImageSelection(this)">
      <div class="media-checkmark"><i class="fas fa-check"></i></div>
      <div class="media-thumb" style="background:${gradient}">
        <i class="${iconClass}" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:${iconColor};font-size:44px"></i>
        ${mediaTag}
      </div>
      <div class="media-type">${typeLabel}</div>
      <div class="media-size">${fileSize}</div>
      <div class="upload-time">${uploaded_at ? escapeHtml(new Date(uploaded_at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })) : "\u2014"}</div>
    </div>
    `;
  }).join("");
  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <title>\u56FE\u5E8A\u7BA1\u7406 | \u57FA\u4E8ECloudFlare\u7684\u56FE\u5E8A\u670D\u52A1</title>
    <link rel="preconnect" href="https://cdnjs.cloudflare.com">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/twitter-bootstrap/4.6.1/css/bootstrap.min.css" integrity="sha512-T584yQ/tdRR5QwOpfvDfVQUidzfgc2339Lc8uBDtcp/wYu80d7jwBgAxbyMh0a9YM9F8N3tdErpFI8iaGx6x5g==" crossorigin="anonymous" referrerpolicy="no-referrer" />
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/toastr.js/2.1.4/toastr.min.css" integrity="sha512-6S2HWzVFxruDlZxI3sXOZZ4/eJ8AcxkQH1+JjSe/ONCEqR9L4Ysq5JdT5ipqtzU7WHalNwzwBv+iE51gNHJNqQ==" crossorigin="anonymous" referrerpolicy="no-referrer" />
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css" integrity="sha512-1ycn6IcaQQ40/MKBW2W4Rhis/DbILU74C1vSrLJxCq57o941Ym01SwNsOMqvEBFlcgUa6xLiPY/NS5R+E6ztJQ==" crossorigin="anonymous" referrerpolicy="no-referrer" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
      /* Critical: prevents FOUC */
      .btn { display:inline-flex; align-items:center; justify-content:center; font-weight:500; border-radius:10px; padding:6px 16px; cursor:pointer; }
      .btn-primary { background:var(--title-gradient); color:#fff; }
      .badge { display:inline-block; padding:2px 6px; font-size:0.75em; border-radius:10px; white-space:nowrap; }
      .nav-pills .nav-link { display:inline-flex; align-items:center; justify-content:center; padding:6px 16px; border-radius:20px; }
      .pagination { display:flex; list-style:none; justify-content:center; gap:8px; }
      .page-link { display:block; padding:8px 16px; border-radius:8px; cursor:pointer; }
      .form-control { display:block; width:100%; padding:6px 12px; border-radius:8px; }
      :root {
        --bg-gradient: linear-gradient(-45deg, #667eea, #764ba2, #f093fb, #4facfe);
        --card-bg: rgba(255, 255, 255, 0.95);
        --card-bg-solid: rgba(255, 255, 255, 0.95);
        --card-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
        --title-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        --text-primary: #333;
        --text-secondary: #555;
        --text-muted: #999;
        --accent: #667eea;
        --accent-hover: #764ba2;
        --accent-light: rgba(102, 126, 234, 0.1);
        --danger: #e74c3c;
        --danger-light: rgba(231, 76, 60, 0.1);
        --border-light: rgba(255, 255, 255, 0.6);
        --sticky-bg: rgba(255, 255, 255, 0.85);
        --hover-shadow: rgba(102, 126, 234, 0.2);
      }
      [data-theme="dark"] {
        --bg-gradient: linear-gradient(-45deg, #0f0c29, #302b63, #24243e, #1a1a3e);
        --card-bg: rgba(30, 30, 50, 0.95);
        --card-bg-solid: rgba(30, 30, 50, 0.95);
        --card-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        --title-gradient: linear-gradient(135deg, #a78bfa 0%, #c084fc 100%);
        --text-primary: #e0e0e0;
        --text-secondary: #b0b0b0;
        --text-muted: #888;
        --accent: #a78bfa;
        --accent-hover: #c084fc;
        --accent-light: rgba(167, 139, 250, 0.15);
        --danger: #ef4444;
        --danger-light: rgba(239, 68, 68, 0.15);
        --border-light: rgba(255, 255, 255, 0.08);
        --sticky-bg: rgba(30, 30, 50, 0.85);
        --hover-shadow: rgba(167, 139, 250, 0.2);
      }
      * {
        box-sizing: border-box;
      }
      body {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        background: var(--bg-gradient);
        background-size: 400% 400%;
        animation: gradientShift 60s ease infinite;
        min-height: 100vh;
        margin: 0;
        padding: 20px;
        display: flex;
        justify-content: center;
        align-items: flex-start;
      }
      .admin-card {
        width: 100%;
        max-width: 1400px;
        background: var(--card-bg);
        border-radius: 16px;
        box-shadow: var(--card-shadow);
        padding: 30px;
        border: 1px solid var(--border-light);
      }
      @keyframes gradientShift {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
      .page-title {
        font-size: 32px;
        font-weight: 700;
        background: var(--title-gradient);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        text-align: center;
        margin-bottom: 20px;
        letter-spacing: 0.5px;
      }
      .header {
        position: sticky;
        top: 10px;
        background: var(--sticky-bg);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        z-index: 1000;
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
        padding: 8px 16px;
        box-shadow: 0 2px 10px rgba(102, 126, 234, 0.08);
        border-radius: 10px;
        border: 1px solid var(--border-light);
        flex-wrap: wrap;
        min-height: 44px;
      }
      .filter-tabs {
        display: flex;
        gap: 12px;
        margin-bottom: 20px;
        flex-wrap: wrap;
      }
      .nav-pills .nav-link {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 6px 16px;
        border-radius: 20px !important;
        color: var(--text-secondary) !important;
        background: var(--accent-light) !important;
        transition: all 0.3s ease !important;
        position: relative;
      }
      .nav-pills .nav-link:hover {
        background: rgba(102, 126, 234, 0.2) !important;
        color: var(--accent) !important;
      }
      .nav-pills .nav-link.active {
        background: var(--title-gradient) !important;
        color: #fff !important;
      }
      .filter-tabs .nav-link .badge {
        position: absolute;
        top: -5px;
        right: -5px;
        font-size: 0.75em;
        padding: 2px 6px;
        border-radius: 10px !important;
        background: var(--accent) !important;
        color: #fff !important;
      }
      .filter-tabs .nav-link:not(.active) .badge {
        background: var(--card-bg) !important;
        color: var(--text-primary) !important;
      }

      .btn-primary {
        background: var(--title-gradient) !important;
        border: none !important;
        color: #fff !important;
        border-radius: 10px !important;
        font-weight: 500 !important;
        box-shadow: 0 4px 15px var(--hover-shadow) !important;
        transition: all 0.3s ease !important;
      }
      .btn-primary:hover, .btn-primary:focus {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px var(--hover-shadow) !important;
      }
      .btn-danger {
        background: linear-gradient(135deg, var(--danger) 0%, #c0392b 100%) !important;
        border: none !important;
        color: #fff !important;
        border-radius: 10px !important;
        font-weight: 500 !important;
        box-shadow: 0 4px 15px var(--hover-shadow) !important;
      }
      .btn-danger:hover, .btn-danger:focus {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px var(--hover-shadow) !important;
      }
      .btn-outline-primary {
        color: var(--accent) !important;
        border-color: var(--accent) !important;
        border-radius: 10px !important;
        font-weight: 500 !important;
      }
      .btn-outline-primary:hover, .btn-outline-primary:focus {
        background: var(--accent-light) !important;
        color: var(--accent-hover) !important;
        border-color: var(--accent-hover) !important;
        transform: translateY(-2px);
      }
      .page-link {
        background: var(--accent-light) !important;
        color: var(--accent) !important;
        border: none !important;
        border-radius: 8px !important;
        font-weight: 500 !important;
      }
      .page-link:hover, .page-link:focus {
        background: var(--accent) !important;
        color: #fff !important;
      }
      .page-item.disabled .page-link {
        background: var(--accent-light) !important;
        color: var(--accent) !important;
        opacity: 0.4;
      }
      #backToHome,
      #themeToggleAdmin,
      #adminUploadBtn {
        background: none;
        border: none;
        color: var(--accent);
        opacity: 0.5;
        cursor: pointer;
        font-size: 22px;
        transition: all 0.3s ease;
        padding: 0;
        line-height: 1;
        flex-shrink: 0;
        text-decoration: none;
      }
      #backToHome:focus,
      #themeToggleAdmin:focus,
      #adminUploadBtn:focus {
          outline: 2px solid var(--accent);
          outline-offset: 3px;
          border-radius: 4px;
          box-shadow: none !important;
      }
      #backToHome:hover,
      #themeToggleAdmin:hover,
      #adminUploadBtn:hover {
        opacity: 1;
        transform: scale(1.1);
      }
      #action-buttons {
        display: none;
        align-items: center;
        gap: 8px;
      }
      .gallery {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 16px;
      }
      .media-container {
        position: relative;
        overflow: hidden;
        border-radius: 16px;
        background: var(--card-bg);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        box-shadow: var(--card-shadow);
        border: 1px solid var(--border-light);
        transition: all 0.3s ease;
        cursor: pointer;
      }
      .media-container::before {
        content: '';
        display: block;
        padding-bottom: 100%;
      }
      .media-container:hover {
        transform: translateY(-4px);
        box-shadow: 0 8px 25px var(--hover-shadow);
        border-color: var(--accent);
        opacity: 0.85;
      }
      .media-thumb {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }
      .media-img {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        z-index: 1;
      }
      .media-audio {
        position: absolute;
        bottom: 10px;
        left: 10px;
        right: 10px;
        z-index: 1;
        width: calc(100% - 20px);
      }
      .media-type {
        position: absolute;
        top: 10px;
        left: 10px;
        background: var(--title-gradient);
        color: white;
        padding: 4px 10px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 500;
        z-index: 10;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .upload-time {
        position: absolute;
        bottom: 34px;
        left: 10px;
        background: var(--card-bg-solid);
        backdrop-filter: blur(4px);
        padding: 4px 8px;
        border-radius: 8px;
        color: var(--text-secondary);
        font-size: 11px;
        font-weight: 500;
        white-space: nowrap;
        z-index: 10;
        opacity: 0;
        transition: opacity 0.3s ease;
      }
      .media-container:hover .upload-time,
      .media-container.selected .upload-time {
        opacity: 1;
      }

      .media-checkmark {
        position: absolute;
        top: 8px;
        right: 8px;
        width: 26px;
        height: 26px;
        border-radius: 50%;
        background: var(--accent);
        color: white;
        display: none;
        align-items: center;
        justify-content: center;
        font-size: 13px;
        z-index: 20;
        box-shadow: 0 2px 8px rgba(0,0,0,0.35);
        pointer-events: none;
      }
      .media-container.selected .media-checkmark {
        display: flex;
      }
      .media-container.selected {
        border: 2px solid var(--accent);
        background: var(--accent-light);
        box-shadow: 0 0 20px var(--hover-shadow);
      }
      .media-size {
        position: absolute;
        bottom: 10px;
        left: 10px;
        background: rgba(0,0,0,0.55);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        color: white;
        padding: 2px 8px;
        border-radius: 8px;
        font-size: 11px;
        font-weight: 500;
        z-index: 10;
        pointer-events: none;
      }

      #preview-button {
        background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%) !important;
        border: none !important;
      }
      .page-item.disabled .page-link.page-info {
        background: transparent !important;
        border: none !important;
        color: var(--text-secondary) !important;
      }
      .page-item.active .page-link {
        background: var(--accent) !important;
        color: #fff !important;
      }
      .empty-state {
        text-align: center;
        padding: 20px;
        color: var(--text-muted);
        font-size: 18px;
        background: var(--card-bg);
        border-radius: 16px;
        backdrop-filter: blur(8px);
        border: 1px solid var(--border-light);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
        aspect-ratio: 1 / 1;
      }
      .empty-state i {
        font-size: 64px;
        opacity: 0.4;
      }
      @media (prefers-color-scheme: dark) {
        :root:not([data-theme="light"]) {
          --bg-gradient: linear-gradient(-45deg, #0f0c29, #302b63, #24243e, #1a1a3e);
          --card-bg: rgba(30, 30, 50, 0.95);
          --card-bg-solid: rgba(30, 30, 50, 0.95);
          --card-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
          --title-gradient: linear-gradient(135deg, #a78bfa 0%, #c084fc 100%);
          --text-primary: #e0e0e0;
          --text-secondary: #b0b0b0;
          --text-muted: #888;
          --accent: #a78bfa;
          --accent-hover: #c084fc;
          --accent-light: rgba(167, 139, 250, 0.15);
          --danger: #ef4444;
          --danger-light: rgba(239, 68, 68, 0.15);
          --border-light: rgba(255, 255, 255, 0.08);
          --sticky-bg: rgba(30, 30, 50, 0.85);
          --hover-shadow: rgba(167, 139, 250, 0.2);
        }
      }
      .preview-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.85);
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(4px);
      }
      .preview-content {
        position: relative;
        max-width: 90vw;
        max-height: 90vh;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .preview-content img,
      .preview-content video {
        max-width: 90vw;
        max-height: 90vh;
        object-fit: contain;
        border-radius: 8px;
        box-shadow: 0 8px 40px rgba(0,0,0,0.5);
      }
      .preview-close {
        position: fixed;
        top: 20px;
        right: 30px;
        font-size: 36px;
        color: white;
        cursor: pointer;
        opacity: 0.7;
        transition: opacity 0.3s;
        z-index: 10000;
        line-height: 1;
      }
      .preview-close:hover {
        opacity: 1;
      }
      @media (max-width: 768px) {
        body {
          padding: 12px;
        }
        .admin-card {
          padding: 16px;
          border-radius: 12px;
        }
        .page-title {
          font-size: 24px;
          margin-bottom: 15px;
        }
        .header {
          top: 5px;
          padding: 8px 12px;
          border-radius: 8px;
        }
        .gallery {
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }
        .media-container {
          border-radius: 12px;
        }
      }
    </style>
    <script>
    let selectedCount = 0;
    const selectedKeys = new Set();
    let isAllSelected = false;
  
    function toggleImageSelection(container) {
      const key = container.getAttribute('data-key');
      container.classList.toggle('selected');
      if (container.classList.contains('selected')) {
        selectedKeys.add(key);
        selectedCount++;
      } else {
        selectedKeys.delete(key);
        selectedCount--;
        if (isAllSelected) {
          isAllSelected = false;
          updateSelectAllButton();
        }
      }
      updateDeleteButton();
    }
  
    function updateDeleteButton() {
      const countDisplay = document.getElementById('selected-count');
      countDisplay.textContent = selectedCount;
      const actions = document.getElementById('action-buttons');
      const previewBtn = document.getElementById('preview-button');
      if (selectedCount > 0) {
        actions.style.display = 'flex';
        let showPreview = selectedCount === 1;
        if (showPreview) {
          if (window.location.search.includes('type=other')) {
            showPreview = false;
          } else {
            const url = Array.from(selectedKeys)[0];
            const ext = url.split('.').pop().toLowerCase();
            const PREVIEW_EXTS = ['jpg','jpeg','png','gif','webp','bmp','svg','ico','tiff','mp4','avi','mov','wmv','flv','mkv','webm','mp3','wav','ogg','flac','aac','m4a','wma','opus'];
            if (!PREVIEW_EXTS.includes(ext)) showPreview = false;
          }
        }
        previewBtn.style.display = showPreview ? '' : 'none';
      } else {
        actions.style.display = 'none';
      }
    }
  
    async function deleteSelectedImages() {
      if (selectedKeys.size === 0) return;
      const confirmation = confirm('\u4F60\u786E\u5B9A\u8981\u5220\u9664\u9009\u4E2D\u7684\u5A92\u4F53\u6587\u4EF6\u5417\uFF1F\u6B64\u64CD\u4F5C\u65E0\u6CD5\u64A4\u56DE\u3002');
      if (!confirmation) return;

      const keysToDelete = Array.from(selectedKeys);
      const response = await fetch('/delete-images', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(keysToDelete)
      });

      if (response.ok) {
        // \u5C40\u90E8\u66F4\u65B0 DOM\uFF0C\u6DFB\u52A0\u6DE1\u51FA\u52A8\u753B
        const containers = document.querySelectorAll('.media-container');
        const containersToRemove = [];

        containers.forEach(container => {
          const key = container.getAttribute('data-key');
          if (selectedKeys.has(key)) {
            containersToRemove.push(container);
            container.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            container.style.opacity = '0';
            container.style.transform = 'scale(0.8)';
          }
        });

        // \u7B49\u5F85\u52A8\u753B\u5B8C\u6210\u540E\u79FB\u9664\u5143\u7D20
        setTimeout(() => {
          containersToRemove.forEach(container => container.remove());

          // \u66F4\u65B0\u5A92\u4F53\u6587\u4EF6\u603B\u6570
          const headerLeft = document.querySelector('[data-total]');
          const newTotal = parseInt(headerLeft.dataset.total) - keysToDelete.length;
          headerLeft.dataset.total = newTotal;
          headerLeft.querySelector('span:first-child').textContent = '\u5171 ' + newTotal + ' \u4E2A\u6587\u4EF6';

          // \u66F4\u65B0\u5206\u9875\u4FE1\u606F
          const pageInfo = document.querySelector('.page-info');
          if (pageInfo) {
            pageInfo.dataset.total = newTotal;
            const parts = pageInfo.textContent.split('\uFF08\u5171');
            pageInfo.textContent = parts[0] + '\uFF08\u5171 ' + newTotal + ' \u4E2A\uFF09';
          }

          // \u66F4\u65B0\u7B5B\u9009\u6807\u7B7E\u6570\u91CF
          const IMAGE_EXTS = ['jpg','jpeg','png','gif','webp','bmp','svg','ico','heic','tiff'];
          const VIDEO_EXTS = ['mp4','avi','mov','wmv','flv','mkv','webm'];
          const AUDIO_EXTS = ['mp3','wav','ogg','flac','aac','m4a','wma','opus'];
          const typeDec = { image: 0, video: 0, audio: 0, other: 0 };
          keysToDelete.forEach(url => {
            const ext = url.split('.').pop().toLowerCase();
            if (IMAGE_EXTS.includes(ext)) typeDec.image++;
            else if (VIDEO_EXTS.includes(ext)) typeDec.video++;
            else if (AUDIO_EXTS.includes(ext)) typeDec.audio++;
            else typeDec.other++;
          });
          const tabs = document.querySelectorAll('.nav-pills .nav-link');
          const types = ['all', 'image', 'video', 'audio', 'other'];
          types.forEach((t, i) => {
            const dec = t === 'all' ? keysToDelete.length : typeDec[t];
            if (dec === 0) return;
            const cur = parseInt(tabs[i].dataset.count);
            if (isNaN(cur)) return;
            const newCount = cur - dec;
            tabs[i].dataset.count = newCount;
            const b = tabs[i].querySelector('.badge'); if (b) b.textContent = newCount;
          });

          // \u91CD\u7F6E\u9009\u62E9\u72B6\u6001
          selectedKeys.clear();
          selectedCount = 0;
          isAllSelected = false;
          updateSelectAllButton();
          updateDeleteButton();

          toastr.success('\u5220\u9664\u6210\u529F');
        }, 300);
      } else {
        toastr.error('\u5220\u9664\u5931\u8D25');
      }
    }
  
    function copySelectedUrls() {
      const urls = Array.from(selectedKeys).map(url => url.trim()).filter(url => url !== '');
      const text = urls.join('\\n');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          toastr.success('\u590D\u5236\u6210\u529F');
        }).catch(() => {
          toastr.error('\u590D\u5236\u5931\u8D25');
        });
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        try {
          document.execCommand('copy');
          toastr.success('\u590D\u5236\u6210\u529F');
        } catch (err) {
          toastr.error('\u590D\u5236\u5931\u8D25');
        }
        document.body.removeChild(textarea);
      }
    }

    function formatFileSize(bytes) {
      if (!bytes || bytes === 0) return '\u2014';
      const units = ['B', 'KB', 'MB', 'GB'];
      let i = 0;
      let size = bytes;
      while (size >= 1024 && i < units.length - 1) {
        size /= 1024;
        i++;
      }
      return (i === 0 ? size : size.toFixed(1)) + ' ' + units[i];
    }

    function selectAllImages() {
      const mediaContainers = Array.from(document.querySelectorAll('.media-container'));
      const batchSize = 20;
      let index = 0;
      const isSelectingAll = !isAllSelected;

      function processBatch() {
        const end = Math.min(index + batchSize, mediaContainers.length);

        for (let i = index; i < end; i++) {
          const container = mediaContainers[i];
          if (isSelectingAll) {
            if (!container.classList.contains('selected')) {
              container.classList.add('selected');
              const key = container.getAttribute('data-key');
              selectedKeys.add(key);
            }
          } else {
            container.classList.remove('selected');
            const key = container.getAttribute('data-key');
            selectedKeys.delete(key);
          }
        }

        index = end;

        if (index < mediaContainers.length) {
          requestAnimationFrame(processBatch);
        } else {
          if (isSelectingAll) {
            selectedCount = selectedKeys.size;
          } else {
            selectedCount = 0;
          }
          isAllSelected = isSelectingAll;
          updateSelectAllButton();
          updateDeleteButton();
        }
      }

      requestAnimationFrame(processBatch);
    }

    function updateSelectAllButton() {
      const btn = document.getElementById('select-all-button');
      btn.textContent = isAllSelected ? '\u53D6\u6D88\u5168\u9009' : '\u5168\u9009';
    }

    function previewMedia() {
      if (selectedKeys.size !== 1) return;
      const url = Array.from(selectedKeys)[0];
      const container = document.getElementById('preview-container');
      const ext = url.split('.').pop().toLowerCase();
      const IMG = ['jpg','jpeg','png','gif','webp','bmp','svg','ico','tiff'];
      const VID = ['mp4','avi','mov','wmv','flv','mkv','webm'];
      const AUD = ['mp3','wav','ogg','flac','aac','m4a','wma','opus'];
      let html;
      if (IMG.includes(ext)) {
        html = '<img src="' + url + '" alt="preview">';
      } else if (VID.includes(ext)) {
        html = '<video src="' + url + '" controls autoplay></video>';
      } else if (AUD.includes(ext)) {
        html = '<div style="text-align:center;padding:40px;color:white"><i class="fas fa-music" style="font-size:80px;opacity:0.5;margin-bottom:20px"></i><br><audio src="' + url + '" controls style="width:300px"></audio></div>';
      } else {
        html = '<div style="text-align:center;padding:40px;color:white"><i class="fas fa-file" style="font-size:80px;opacity:0.5;margin-bottom:20px"></i><br><a href="' + url + '" target="_blank" style="color:var(--accent);font-size:16px">\u6253\u5F00\u6587\u4EF6</a></div>';
      }
      container.innerHTML = html;
      document.getElementById('previewOverlay').style.display = 'flex';
    }

    function closePreview(e) {
      if (e && e.target !== e.currentTarget) return;
      document.getElementById('previewOverlay').style.display = 'none';
      document.getElementById('preview-container').innerHTML = '';
    }

    document.addEventListener('DOMContentLoaded', () => {
      const mediaContainers = document.querySelectorAll('.media-container[data-key]');
      const options = {
        root: null,
        rootMargin: '100px',
        threshold: 0.01
      };

      const mediaObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const container = entry.target;
            const img = container.querySelector('.media-img[data-src]');
            const video = container.querySelector('video[data-src]');
            const audio = container.querySelector('.media-audio[data-src]');
            if (video) {
              video.src = video.dataset.src;
              video.load();
            } else if (audio) {
              audio.src = audio.dataset.src;
              audio.load();
            } else if (img) {
              img.src = img.dataset.src;
            }
            observer.unobserve(container);
          }
        });
      }, options);

      mediaContainers.forEach(container => {
        mediaObserver.observe(container);
      });

      // theme toggle
      const adminSavedTheme = localStorage.getItem('theme');
      if (adminSavedTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.getElementById('themeToggleAdmin').innerHTML = '<i class="fas fa-moon"></i>';
      } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches && !adminSavedTheme) {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.getElementById('themeToggleAdmin').innerHTML = '<i class="fas fa-moon"></i>';
      }
      document.getElementById('themeToggleAdmin').addEventListener('click', function() {
        const current = document.documentElement.getAttribute('data-theme');
        if (current === 'dark') {
          document.documentElement.setAttribute('data-theme', 'light');
          this.innerHTML = '<i class="fas fa-sun"></i>';
          localStorage.setItem('theme', 'light');
        } else {
          document.documentElement.setAttribute('data-theme', 'dark');
          this.innerHTML = '<i class="fas fa-moon"></i>';
          localStorage.setItem('theme', 'dark');
        }
      });
      document.getElementById('adminUploadBtn').addEventListener('click', function() {
        document.getElementById('adminFileInput').click();
      });
      document.getElementById('adminFileInput').addEventListener('change', async function() {
        const file = this.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file, file.name);
        try {
          const res = await fetch('/admin-upload', { method: 'POST', body: formData });
          const data = await res.json();
          if (data.error) {
            toastr.error(data.error);
          } else {
            toastr.success('上传成功');
            setTimeout(() => location.reload(), 3000);
          }
        } catch(e) {
          toastr.error('上传失败');
        }
        this.value = '';
      });
    });
  <\/script>
  </head>
    <body>
    <div class="admin-card">
    <div style="display:flex;align-items:center;justify-content:center;margin-bottom:40px;position:relative;min-height:44px">
      <h1 class="page-title" style="margin:0">\u56FE\u5E8A\u7BA1\u7406</h1>
      <div style="position:absolute;right:0;display:flex;gap:16px;align-items:center">
        <a href="/" class="btn" id="backToHome" title="\u8FD4\u56DE\u9996\u9875"><i class="fas fa-arrow-left"></i></a>
        <input type="file" id="adminFileInput" style="display:none">
        <button type="button" class="btn" id="themeToggleAdmin" title="\u5207\u6362\u4E3B\u9898"><i class="fas fa-sun"></i></button>
        <button type="button" class="btn" id="adminUploadBtn" title="\u4E0A\u4F20\u6587\u4EF6"><i class="fas fa-upload"></i></button>
      </div>
    </div>
    <div class="nav nav-pills filter-tabs">
      <a href="/admin" class="nav-link${type === "all" ? " active" : ""}" data-count="${countAll}">\u5168\u90E8 <span class="badge badge-light badge-pill">${countAll}</span></a>
      <a href="/admin?type=image" class="nav-link${type === "image" ? " active" : ""}" data-count="${countImage}">\u56FE\u7247 <span class="badge badge-light badge-pill">${countImage}</span></a>
      <a href="/admin?type=video" class="nav-link${type === "video" ? " active" : ""}" data-count="${countVideo}">\u89C6\u9891 <span class="badge badge-light badge-pill">${countVideo}</span></a>
      <a href="/admin?type=audio" class="nav-link${type === "audio" ? " active" : ""}" data-count="${countAudio}">\u97F3\u9891 <span class="badge badge-light badge-pill">${countAudio}</span></a>
      <a href="/admin?type=other" class="nav-link${type === "other" ? " active" : ""}" data-count="${countOther}">\u5176\u4ED6 <span class="badge badge-light badge-pill">${countOther}</span></a>
    </div>
    <div class="header d-flex justify-content-between align-items-center flex-wrap">
      <div class="d-flex align-items-center flex-grow-1 font-weight-bold" style="color:var(--text-secondary);gap:15px" data-total="${totalCount.count}">
        <span>\u5171 ${totalCount.count} \u4E2A\u6587\u4EF6</span>
        <span class="text-muted" style="opacity:0.4">|</span>
        <span>\u5DF2\u9009\u4E2D <strong id="selected-count">0</strong> \u4E2A</span>
      </div>
      <div class="d-flex align-items-center flex-shrink-0" style="gap:8px">
        <div id="action-buttons">
          <button id="preview-button" class="btn btn-primary" onclick="previewMedia()" style="display:none">\u9884\u89C8</button>
          <button class="btn btn-primary" onclick="copySelectedUrls()">\u590D\u5236</button>
          <button id="delete-button" class="btn btn-danger" onclick="deleteSelectedImages()">\u5220\u9664</button>
        </div>
        <button id="select-all-button" class="btn btn-outline-primary" onclick="selectAllImages()">\u5168\u9009</button>
      </div>
    </div>
    <div class="gallery">
      ${mediaData.length === 0 ? '<div class="empty-state"><i class="fas fa-cloud-upload-alt"></i><div>\u6682\u65E0\u5A92\u4F53\u6587\u4EF6</div></div>' : mediaHtml}
    </div>
    ${mediaData.length > 0 && totalPages > 1 ? `
    <nav>
      <ul class="pagination justify-content-center" style="margin:8px 0 0 0;padding:16px 0 0 0;border-top:1px solid var(--border-light);gap:8px">
        <li class="page-item ${page <= 1 ? "disabled" : ""}">
          <button class="page-link" onclick="goToPage(${page - 1})" ${page <= 1 ? "disabled" : ""}>\u4E0A\u4E00\u9875</button>
        </li>
        ${(() => {
    const r = 2;
    const s = Math.max(2, page - r);
    const e = Math.min(totalPages - 1, page + r);
    const items = [];
    items.push('<li class="page-item ' + (page === 1 ? "active" : "") + '"><button class="page-link" onclick="goToPage(1)">1</button></li>');
    if (s > 2) items.push('<li class="page-item disabled"><span class="page-link">&hellip;</span></li>');
    for (let i = s; i <= e; i++) {
      items.push('<li class="page-item ' + (page === i ? "active" : "") + '"><button class="page-link" onclick="goToPage(' + i + ')">' + i + "</button></li>");
    }
    if (e < totalPages - 1) items.push('<li class="page-item disabled"><span class="page-link">&hellip;</span></li>');
    if (totalPages > 1) items.push('<li class="page-item ' + (page === totalPages ? "active" : "") + '"><button class="page-link" onclick="goToPage(' + totalPages + ')">' + totalPages + "</button></li>");
    return items.join("");
  })()}
        <li class="page-item ${page >= totalPages ? "disabled" : ""}">
          <button class="page-link" onclick="goToPage(${page + 1})" ${page >= totalPages ? "disabled" : ""}>\u4E0B\u4E00\u9875</button>
        </li>
      </ul>
    </nav>
    <div class="text-center page-info" style="color:var(--text-muted);font-size:13px;margin-top:8px">\u7B2C ${page} / ${totalPages} \u9875\uFF08\u5171 ${totalCount.count} \u4E2A\uFF09</div>
    ` : ""}
    <div id="previewOverlay" class="preview-overlay" style="display:none" onclick="closePreview(event)">
      <div class="preview-content">
        <span class="preview-close" onclick="closePreview()">&times;</span>
        <div id="preview-container"></div>
      </div>
    </div>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js" integrity="sha512-894YE6QWD5I59HgZOGReFYm4dnWc1Qt5NtvYSaNcOP+u1T9qYdvdihz0PPSiiqn/+/3e7Jo4EaG7TubfWGUrMQ==" crossorigin="anonymous" referrerpolicy="no-referrer"><\/script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/toastr.js/2.1.4/toastr.min.js" integrity="sha512-lbwH47l/tPXJYG9AcFNoJaTMhGvYWhVM9YI43CT+uteTRRaiLCui8snIgyAN8XWgNjNhCqlAUdzZptso6OCoFQ==" crossorigin="anonymous" referrerpolicy="no-referrer"><\/script>
    <script>
      toastr.options.timeOut = 3000;
      toastr.options.progressBar = true;
      function goToPage(pageNum) {
        const url = new URL(window.location.href);
        url.searchParams.set('page', pageNum);
        window.location.href = url.toString();
      }
    <\/script>
  </body>
  </html>
  `;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
__name(generateAdminPage, "generateAdminPage");
__name2(generateAdminPage, "generateAdminPage");
__name22(generateAdminPage, "generateAdminPage");
function buildTypeFilter(type) {
  if (type === "all" || !type) return "";
  if (type === "other") return "WHERE type NOT IN ('image', 'video', 'audio')";
  const VALID_TYPES = ["image", "video", "audio"];
  if (VALID_TYPES.includes(type)) return "WHERE type = '" + type + "'";
  return "";
}
__name(buildTypeFilter, "buildTypeFilter");
__name2(buildTypeFilter, "buildTypeFilter");
__name22(buildTypeFilter, "buildTypeFilter");
async function fetchMediaData(DATABASE, limit = null, offset = 0, whereClause = "") {
  let query = "SELECT url, COALESCE(size, 0) as size, type, uploaded_at FROM media " + whereClause + " ORDER BY uploaded_at DESC";
  if (limit !== null) {
    query += ` LIMIT ${limit} OFFSET ${offset}`;
  }
  const result = await DATABASE.prepare(query).all();
  return result.results.map((row) => ({ url: row.url, size: row.size, type: row.type, uploaded_at: row.uploaded_at }));
}
__name(fetchMediaData, "fetchMediaData");
__name2(fetchMediaData, "fetchMediaData");
__name22(fetchMediaData, "fetchMediaData");
async function handleUploadRequest(request, config) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file) throw new Error("\u7F3A\u5C11\u6587\u4EF6");
    if (config.enableAuth && !authenticate(request, config.username, config.password)) {
      return unauthorizedResponse();
    }
    const fileExtension = getFileExtension(file.name);
    if (!ALLOWED_EXTENSIONS.has(fileExtension)) {
      return jsonResponse({ error: `\u4E0D\u652F\u6301\u7684\u6587\u4EF6\u7C7B\u578B: .${fileExtension}` }, 400);
    }
    if (file.size > config.maxSize) {
      return jsonResponse({ error: `\u6587\u4EF6\u5927\u5C0F\u8D85\u8FC7${config.maxSize / (1024 * 1024)}MB\u9650\u5236` }, 413);
    }
    const contentType = getContentType(fileExtension);
    const typePrefix = contentType.startsWith("image/") ? "image" : contentType.startsWith("video/") ? "video" : contentType.startsWith("audio/") ? "audio" : "other";
    const r2Key = `${typePrefix}_${Date.now()}`;
    await config.r2Bucket.put(r2Key, file.stream(), {
      httpMetadata: { contentType: file.type }
    });
    const imageURL = `https://${config.domain}/${r2Key}.${fileExtension}`;
    const now = new Date().toISOString();
    await config.database.prepare("INSERT INTO media (url, size, type, uploaded_at) VALUES (?, ?, ?, ?) ON CONFLICT(url) DO NOTHING").bind(imageURL, file.size, typePrefix, now).run();
    return jsonResponse({ data: imageURL });
  } catch (error) {
    console.error("R2 \u4E0A\u4F20\u9519\u8BEF:", error);
    return jsonResponse({ error: error.message }, 500);
  }
}
__name(handleUploadRequest, "handleUploadRequest");
__name2(handleUploadRequest, "handleUploadRequest");
__name22(handleUploadRequest, "handleUploadRequest");
async function handleAdminUploadRequest(request, config) {
  if (!authenticate(request, config.username, config.password)) {
    return unauthorizedResponse();
  }
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file) throw new Error("缺少文件");
    if (file.size > config.maxSize) {
      return jsonResponse({ error: `文件大小超过${config.maxSize / (1024 * 1024)}MB限制` }, 413);
    }
    const fileExtension = getFileExtension(file.name);
    const contentType = file.type || getContentType(fileExtension);
    let typePrefix = "other";
    if (contentType.startsWith("image/")) typePrefix = "image";
    else if (contentType.startsWith("video/")) typePrefix = "video";
    else if (contentType.startsWith("audio/")) typePrefix = "audio";
    const r2Key = `${typePrefix}_${Date.now()}`;
    await config.r2Bucket.put(r2Key, file.stream(), {
      httpMetadata: { contentType }
    });
    const imageURL = `https://${config.domain}/${r2Key}.${fileExtension}`;
    const now = new Date().toISOString();
    await config.database.prepare("INSERT INTO media (url, size, type, uploaded_at) VALUES (?, ?, ?, ?) ON CONFLICT(url) DO NOTHING").bind(imageURL, file.size, typePrefix, now).run();
    return jsonResponse({ data: imageURL });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
}
__name(handleAdminUploadRequest, "handleAdminUploadRequest");
__name2(handleAdminUploadRequest, "handleAdminUploadRequest");
__name22(handleAdminUploadRequest, "handleAdminUploadRequest");
async function handleImageRequest(request, config) {
  const requestedUrl = request.url;
  const cache = caches.default;
  const cacheKey = new Request(requestedUrl);
  const cachedResponse = await cache.match(cacheKey);
  if (cachedResponse) return cachedResponse;
  const result = await config.database.prepare("SELECT url FROM media WHERE url = ?").bind(requestedUrl).first();
  if (!result) {
    const notFoundResponse = new Response("\u8D44\u6E90\u4E0D\u5B58\u5728", { status: 404 });
    await cache.put(cacheKey, notFoundResponse.clone());
    return notFoundResponse;
  }
  const urlParts = requestedUrl.split("/");
  const fileName = urlParts[urlParts.length - 1];
  const [r2Key, fileExtension] = fileName.split(".");
  const object = await config.r2Bucket.get(r2Key);
  if (!object) {
    return new Response("\u83B7\u53D6\u6587\u4EF6\u5185\u5BB9\u5931\u8D25", { status: 404 });
  }
  const contentType = getContentType(fileExtension);
  const headers = new Headers();
  headers.set("Content-Type", contentType);
  headers.set("Content-Disposition", "inline");
  headers.set("Cache-Control", `public, max-age=${CACHE_CONFIG.IMAGE}`);
  headers.set("CDN-Cache-Control", `public, max-age=${CACHE_CONFIG.IMAGE}`);
  const responseToCache = new Response(object.body, { status: 200, headers });
  await cache.put(cacheKey, responseToCache.clone());
  return responseToCache;
}
__name(handleImageRequest, "handleImageRequest");
__name2(handleImageRequest, "handleImageRequest");
__name22(handleImageRequest, "handleImageRequest");
async function handleDeleteImagesRequest(request, config) {
  if (!authenticate(request, config.username, config.password)) {
    return unauthorizedResponse();
  }
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  try {
    const keysToDelete = await request.json();
    if (!Array.isArray(keysToDelete) || keysToDelete.length === 0) {
      return jsonResponse({ message: "\u6CA1\u6709\u8981\u5220\u9664\u7684\u9879" }, 400);
    }
    const placeholders = keysToDelete.map(() => "?").join(",");
    const cache = caches.default;
    const [dbResult] = await Promise.all([
      config.database.prepare(
        `DELETE FROM media WHERE url IN (${placeholders})`
      ).bind(...keysToDelete).run(),
      Promise.all(keysToDelete.map(async (url) => {
        const cacheKey = new Request(url);
        await cache.delete(cacheKey);
        const urlParts = url.split("/");
        const fileName = urlParts[urlParts.length - 1];
        const r2Key = fileName.split(".")[0];
        await config.r2Bucket.delete(r2Key);
      }))
    ]);
    if (dbResult.changes === 0) {
      return jsonResponse({ message: "\u672A\u627E\u5230\u8981\u5220\u9664\u7684\u9879" }, 404);
    }
    return jsonResponse({ message: "\u5220\u9664\u6210\u529F" });
  } catch (error) {
    return jsonResponse({ error: "\u5220\u9664\u5931\u8D25", details: error.message }, 500);
  }
}
__name(handleDeleteImagesRequest, "handleDeleteImagesRequest");
__name2(handleDeleteImagesRequest, "handleDeleteImagesRequest");
__name22(handleDeleteImagesRequest, "handleDeleteImagesRequest");
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
