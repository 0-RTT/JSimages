// ==UserScript==
// @name         R2 图床快捷上传
// @namespace    https://github.com/0-RTT/JSimages
// @version      2.3.0
// @description  单击上传、长按设置、拖动吸附、图片压缩、本地缓存去重
// @author       You
// @match        https://www.nodeseek.com/*
// @match        https://nodeseek.com/*
// @match        https://www.yaohuo.me/*
// @match        https://yaohuo.me/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @connect      *
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  if (window.top !== window.self) return;

  /* =========================================================
     站点与格式
     ========================================================= */
  const HOST = location.hostname;
  const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];

  function fileExt(name) {
    const i = String(name || '').lastIndexOf('.');
    return i > 0 ? String(name).slice(i + 1).toLowerCase() : '';
  }

  function formatUrlForSite(url) {
    if (!url) return url;
    const isImage = IMAGE_EXT.includes(fileExt(url));
    if (!isImage) return url;
    if (HOST.indexOf('nodeseek') !== -1) return '![image](' + url + ')';
    if (HOST.indexOf('yaohuo') !== -1) return '[img]' + url + '[/img]';
    return url;
  }

  /* =========================================================
     存储
     ========================================================= */
  const STORE_KEY = 'r2_upload_cfg_v2';
  const HISTORY_KEY = 'r2_upload_history_v1';
  const POS_KEY = 'r2_upload_pos_v1';
  const CACHE_KEY = 'r2_upload_cache_v1';

  const CACHE_MAX = 100;                 // 缓存上限
  const HASH_CHUNK_SIZE = 1024 * 1024;   // 取文件前 1MB 做哈希（与首页一致）

  function hasGM() {
    return typeof GM_getValue === 'function' && typeof GM_setValue === 'function';
  }

  function storageGet(key, fallback) {
    try {
      if (hasGM()) return GM_getValue(key, fallback);
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  }

  function storageSet(key, value) {
    try {
      if (hasGM()) GM_setValue(key, value);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }

  function readCfg() { return storageGet(STORE_KEY, null); }
  function writeCfg(cfg) { storageSet(STORE_KEY, cfg); }
  function hasValidCfg() {
    const c = readCfg();
    return !!(c && c.apiUrl);
  }

  function readHistory() { return storageGet(HISTORY_KEY, []); }
  function writeHistory(list) { storageSet(HISTORY_KEY, list); }
  function pushHistory(url) {
    const list = readHistory();
    const idx = list.indexOf(url);
    if (idx !== -1) list.splice(idx, 1);
    list.unshift(url);
    if (list.length > 12) list.length = 12;
    writeHistory(list);
  }

  function readPos() { return storageGet(POS_KEY, null); }
  function writePos(pos) { storageSet(POS_KEY, pos); }

  /* ---------- 上传结果缓存 ---------- */
  // 存储格式：[{ h: hash, u: url, n: name, t: timestamp }, ...]
  function readCache() { return storageGet(CACHE_KEY, []); }
  function writeCache(list) { storageSet(CACHE_KEY, list); }

  function getCacheEntry(hash) {
    const list = readCache();
    for (let i = 0; i < list.length; i++) {
      if (list[i] && list[i].h === hash) return list[i];
    }
    return null;
  }

  function setCacheEntry(hash, url, name) {
    const list = readCache();
    // 去掉旧的同 hash
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i] && list[i].h === hash) list.splice(i, 1);
    }
    list.unshift({ h: hash, u: url, n: name || '', t: Date.now() });
    if (list.length > CACHE_MAX) list.length = CACHE_MAX;
    writeCache(list);
  }

  function cacheCount() { return readCache().length; }

  function clearCache() {
    writeCache([]);
  }

  /* =========================================================
     剪贴板
     ========================================================= */
  function copyText(text) {
    return new Promise((resolve, reject) => {
      if (typeof GM_setClipboard === 'function') {
        try { GM_setClipboard(text, 'text'); resolve(); return; } catch {}
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(resolve).catch(() => {
          fallbackCopy(text) ? resolve() : reject();
        });
        return;
      }
      fallbackCopy(text) ? resolve() : reject();
    });
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch {}
    document.body.removeChild(ta);
    return ok;
  }

  /* =========================================================
     可编辑元素追踪
     ========================================================= */
  let lastFocusedEditable = null;
  let fabWrapRef = null;

  function isEditable(el) {
    if (!el || !el.isConnected) return false;
    if (el.disabled || el.readOnly) return false;
    const tag = el.tagName;
    if (tag === 'INPUT') {
      const type = (el.type || 'text').toLowerCase();
      return ['text', 'search', 'url', 'tel', 'password', 'email', 'number'].indexOf(type) !== -1;
    }
    if (tag === 'TEXTAREA') return true;
    return el.isContentEditable;
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function pickTarget() {
    const active = document.activeElement;
    if (isEditable(active) && isVisible(active)) return active;
    if (isEditable(lastFocusedEditable) && isVisible(lastFocusedEditable)) return lastFocusedEditable;
    return null;
  }

  function insertIntoEditable(el, text) {
    if (!el || !el.isConnected) return false;
    try { el.focus({ preventScroll: false }); } catch { try { el.focus(); } catch {} }

    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
      const nativeSetter = descriptor && descriptor.set;

      const start = (typeof el.selectionStart === 'number') ? el.selectionStart : (el.value || '').length;
      const end = (typeof el.selectionEnd === 'number') ? el.selectionEnd : (el.value || '').length;
      const before = (el.value || '').slice(0, start);
      const after = (el.value || '').slice(end);
      const newValue = before + text + after;

      if (nativeSetter) nativeSetter.call(el, newValue);
      else el.value = newValue;

      const caret = start + text.length;
      try { el.selectionStart = el.selectionEnd = caret; } catch {}

      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }

    if (el.isContentEditable) {
      try { if (document.execCommand('insertText', false, text)) return true; } catch {}
      try {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          range.deleteContents();
          const node = document.createTextNode(text);
          range.insertNode(node);
          range.setStartAfter(node);
          range.setEndAfter(node);
          sel.removeAllRanges();
          sel.addRange(range);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        }
      } catch {}
      return false;
    }
    return false;
  }

  /* =========================================================
     样式
     ========================================================= */
  const STYLE_ID = 'r2-upload-styles';
  const CSS = `
  .r2-fab-wrap {
    position: fixed;
    right: calc(20px + env(safe-area-inset-right, 0px));
    bottom: calc(90px + env(safe-area-inset-bottom, 0px));
    width: 52px;
    height: 52px;
    z-index: 2147483000;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
    -webkit-tap-highlight-color: transparent;
    transition: left .4s cubic-bezier(.22, 1, .36, 1),
                top .4s cubic-bezier(.22, 1, .36, 1);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    font-size: 14px;
  }
  .r2-fab-wrap.r2-fab-wrap--dragging {
    transition: none;
    z-index: 2147483100;
  }

  .r2-fab {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    border: none;
    cursor: grab;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #4338ca;
    padding: 0;
    background: linear-gradient(140deg, rgba(255,255,255,.9), rgba(255,255,255,.55));
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    box-shadow: 0 12px 30px -10px rgba(15,23,42,.45),
      inset 0 1px 0 rgba(255,255,255,.95),
      inset 0 0 0 1px rgba(255,255,255,.6);
    transition: transform .25s ease, box-shadow .25s ease, color .25s ease;
    -webkit-tap-highlight-color: transparent;
  }
  .r2-fab-wrap.r2-fab-wrap--dragging .r2-fab {
    cursor: grabbing;
    transform: scale(1.1);
    color: #6d28d9;
    box-shadow: 0 24px 50px -14px rgba(15,23,42,.6),
      inset 0 1px 0 rgba(255,255,255,.95),
      inset 0 0 0 2px rgba(129,140,248,.75);
  }
  .r2-fab-wrap:not(.r2-fab-wrap--dragging) .r2-fab:hover {
    transform: translateY(-2px) scale(1.05);
  }
  .r2-fab:active { transform: scale(.94); }
  .r2-fab svg { width: 24px; height: 24px; display: block; pointer-events: none; }

  .r2-fab.r2-fab--busy { pointer-events: none; color: #6366f1; }
  .r2-fab.r2-fab--busy svg { animation: r2Spin 1.2s linear infinite; }
  @keyframes r2Spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }

  .r2-fab.r2-fab--attention { animation: r2Attention 2.4s ease-in-out infinite; }
  @keyframes r2Attention {
    0%, 100% {
      box-shadow: 0 12px 30px -10px rgba(15,23,42,.45),
        inset 0 1px 0 rgba(255,255,255,.95),
        inset 0 0 0 1px rgba(255,255,255,.6);
    }
    50% {
      box-shadow: 0 14px 34px -8px rgba(99,102,241,.7),
        inset 0 1px 0 rgba(255,255,255,.95),
        inset 0 0 0 2px rgba(129,140,248,.7);
    }
  }

  .r2-import-btn {
    position: absolute;
    top: 50%;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 44px;
    padding: 0 18px 0 16px;
    border-radius: 22px;
    border: none;
    cursor: pointer;
    font-size: 13.5px;
    font-weight: 700;
    font-family: inherit;
    letter-spacing: .2px;
    color: #4338ca;
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
    background: linear-gradient(140deg, rgba(255,255,255,.9), rgba(255,255,255,.55));
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    box-shadow: 0 12px 30px -10px rgba(15,23,42,.45),
      inset 0 1px 0 rgba(255,255,255,.95),
      inset 0 0 0 1px rgba(255,255,255,.6);
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    transform: translateY(-50%) scale(.9);
    transition: opacity .32s ease,
                transform .42s cubic-bezier(.22, 1, .36, 1),
                box-shadow .25s ease;
  }
  .r2-import-btn.show {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(-50%) scale(1);
  }
  .r2-import-btn:hover {
    box-shadow: 0 14px 34px -10px rgba(99,102,241,.55),
      inset 0 1px 0 rgba(255,255,255,.95),
      inset 0 0 0 1px rgba(255,255,255,.7);
  }
  .r2-import-btn:active { transform: translateY(-50%) scale(.96); }
  .r2-import-btn__icon {
    width: 16px; height: 16px;
    display: block; flex: 0 0 auto;
    color: #4f46e5;
  }

  .r2-fab-wrap--dock-left .r2-import-btn {
    left: calc(100% + 12px);
    right: auto;
  }
  .r2-fab-wrap--dock-right .r2-import-btn {
    right: calc(100% + 12px);
    left: auto;
  }

  .r2-panel {
    position: fixed;
    right: calc(20px + env(safe-area-inset-right, 0px));
    bottom: calc(160px + env(safe-area-inset-bottom, 0px));
    width: 340px;
    max-width: calc(100vw - 28px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px));
    max-height: calc(100vh - 240px);
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    border-radius: 22px;
    padding: 16px;
    color: #1e293b;
    background: linear-gradient(140deg, rgba(255,255,255,.92), rgba(255,255,255,.66));
    backdrop-filter: blur(28px) saturate(180%);
    -webkit-backdrop-filter: blur(28px) saturate(180%);
    box-shadow: 0 24px 60px -20px rgba(15,23,42,.55),
      inset 0 1px 0 rgba(255,255,255,.95),
      inset 0 -1px 0 rgba(255,255,255,.3),
      inset 0 0 0 1px rgba(255,255,255,.5);
    opacity: 0;
    transform: translateY(10px) scale(.96);
    transform-origin: bottom right;
    pointer-events: none;
    transition: opacity .28s ease, transform .34s cubic-bezier(.22, 1, .36, 1);
    box-sizing: border-box;
    z-index: 2147483000;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    font-size: 14px;
  }
  .r2-panel.show {
    opacity: 1;
    transform: translateY(0) scale(1);
    pointer-events: auto;
  }

  .r2-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .r2-title { font-weight: 700; font-size: 15px; color: #312e81; letter-spacing: .3px; }
  .r2-actions { display: flex; gap: 6px; }
  .r2-mini {
    width: 30px; height: 30px; border-radius: 10px; border: none; cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center;
    color: #4338ca; padding: 0;
    background: rgba(255,255,255,.72);
    box-shadow: inset 0 0 0 1px rgba(255,255,255,.7), 0 4px 10px -6px rgba(15,23,42,.5);
    transition: transform .2s ease, background .2s ease;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }
  .r2-mini:hover { transform: translateY(-1px); background: rgba(255,255,255,.92); }
  .r2-mini svg { width: 16px; height: 16px; display: block; pointer-events: none; }

  .r2-form { display: flex; flex-direction: column; gap: 10px; }
  .r2-field { display: flex; flex-direction: column; gap: 4px; }
  .r2-label { font-size: 12px; color: #475569; font-weight: 600; }
  .r2-input {
    width: 100%;
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,.72);
    background: rgba(255,255,255,.7);
    font-size: 14px;
    font-family: inherit;
    color: #1e293b;
    outline: none;
    transition: border-color .2s, box-shadow .2s;
    box-sizing: border-box;
    -webkit-appearance: none;
  }
  .r2-input:focus { border-color: #818cf8; box-shadow: 0 0 0 3px rgba(129,140,248,.25); }

  .r2-actions-row { display: flex; gap: 8px; margin-top: 6px; }
  .r2-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 10px 16px;
    border: none;
    border-radius: 12px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    color: #3730a3;
    background: linear-gradient(140deg, rgba(255,255,255,.85), rgba(255,255,255,.5));
    box-shadow: inset 0 0 0 1px rgba(255,255,255,.7), 0 6px 14px -10px rgba(15,23,42,.6);
    transition: transform .2s ease, color .2s ease;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }
  .r2-btn:hover { transform: translateY(-1px); color: #6d28d9; }
  .r2-btn:active { transform: translateY(0) scale(.97); }
  .r2-btn--primary {
    color: #fff;
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    box-shadow: 0 10px 20px -10px rgba(99,102,241,.9);
  }
  .r2-btn--primary:hover { color: #fff; }

  .r2-cache-info {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11.5px;
    color: #64748b;
    padding: 8px 10px;
    border-radius: 10px;
    background: linear-gradient(140deg, rgba(255,255,255,.6), rgba(255,255,255,.3));
    box-shadow: inset 0 0 0 1px rgba(255,255,255,.6);
    margin-top: 4px;
  }
  .r2-cache-info strong { color: #4338ca; font-weight: 700; }

  .r2-toast-stack {
    position: fixed;
    top: calc(22px + env(safe-area-inset-top, 0px));
    right: calc(22px + env(safe-area-inset-right, 0px));
    z-index: 2147483647;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 10px;
    pointer-events: none;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  }
  .r2-toast {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 11px 18px;
    border-radius: 14px;
    font-size: 13.5px;
    font-weight: 600;
    color: #1e293b;
    max-width: min(80vw, 320px);
    opacity: 0;
    transform: translateY(-10px) scale(.96);
    transition: opacity .34s ease, transform .42s cubic-bezier(.22, 1, .36, 1);
    background: linear-gradient(140deg, rgba(255,255,255,.92), rgba(255,255,255,.62));
    backdrop-filter: blur(24px) saturate(180%);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    box-shadow: 0 18px 44px -22px rgba(15,23,42,.6),
      inset 0 1px 0 rgba(255,255,255,.96),
      inset 0 0 0 1px rgba(255,255,255,.6);
  }
  .r2-toast.is-in { opacity: 1; transform: translateY(0) scale(1); }
  .r2-toast.is-out { opacity: 0; transform: translateY(-8px) scale(.97); }
  .r2-toast__dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: #3b82f6;
    box-shadow: 0 0 9px 1px rgba(59,130,246,.85);
    flex: 0 0 auto;
  }
  .r2-toast--success { color: #065f46; }
  .r2-toast--success .r2-toast__dot { background: #10b981; box-shadow: 0 0 9px 1px rgba(16,185,129,.9); }
  .r2-toast--error { color: #991b1b; }
  .r2-toast--error .r2-toast__dot { background: #ef4444; box-shadow: 0 0 9px 1px rgba(239,68,68,.9); }
  .r2-toast--warning { color: #92400e; }
  .r2-toast--warning .r2-toast__dot { background: #f59e0b; box-shadow: 0 0 9px 1px rgba(245,158,11,.9); }

  @media (max-width: 560px) {
    .r2-fab { width: 50px; height: 50px; }
    .r2-fab svg { width: 22px; height: 22px; }
    .r2-fab-wrap { width: 50px; height: 50px; }
    .r2-import-btn {
      height: 42px;
      padding: 0 15px 0 13px;
      font-size: 13px;
      border-radius: 21px;
    }
    .r2-import-btn__icon { width: 15px; height: 15px; }
    .r2-panel {
      right: calc(14px + env(safe-area-inset-right, 0px));
      bottom: calc(148px + env(safe-area-inset-bottom, 0px));
      width: calc(100vw - 28px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px));
      max-width: none;
      max-height: calc(100vh - 220px);
      padding: 14px;
      border-radius: 20px;
    }
    .r2-toast-stack {
      top: calc(14px + env(safe-area-inset-top, 0px));
      right: calc(14px + env(safe-area-inset-right, 0px));
      left: calc(14px + env(safe-area-inset-left, 0px));
      align-items: stretch;
    }
    .r2-toast { max-width: none; }
  }

  @supports (height: 100dvh) {
    .r2-panel { max-height: calc(100dvh - 240px); }
    @media (max-width: 560px) {
      .r2-panel { max-height: calc(100dvh - 220px); }
    }
  }
  `;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  /* =========================================================
     Toast
     ========================================================= */
  let toastStack = null;
  function ensureToastStack() {
    if (toastStack && toastStack.isConnected) return toastStack;
    toastStack = document.createElement('div');
    toastStack.className = 'r2-toast-stack';
    toastStack.setAttribute('role', 'status');
    toastStack.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastStack);
    return toastStack;
  }

  function toast(text, type, duration) {
    const t = ['success', 'error', 'warning', 'info'].indexOf(type) === -1 ? 'info' : type;
    const d = typeof duration === 'number' ? duration : 1800;
    const el = document.createElement('div');
    el.className = 'r2-toast r2-toast--' + t;
    const dot = document.createElement('i'); dot.className = 'r2-toast__dot';
    const span = document.createElement('span');
    span.textContent = String(text == null ? '' : text);
    el.appendChild(dot);
    el.appendChild(span);
    ensureToastStack().appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-in'));
    const close = () => {
      el.classList.remove('is-in');
      el.classList.add('is-out');
      setTimeout(() => el.remove(), 380);
    };
    if (d > 0) setTimeout(close, d);
  }

  /* =========================================================
     文件哈希（与首页规则一致）
     - 取文件前 1MB（小文件取全部）计算 SHA-256
     - 拼接 file.size 和 file.lastModified，保证同内容不同文件不会误判
     ========================================================= */
  async function calculateFileHash(file) {
    const chunk = file.size > HASH_CHUNK_SIZE ? file.slice(0, HASH_CHUNK_SIZE) : file;
    const buf = await chunk.arrayBuffer();
    const hashBuf = await crypto.subtle.digest('SHA-256', buf);
    const arr = Array.from(new Uint8Array(hashBuf));
    const hex = arr.map(b => b.toString(16).padStart(2, '0')).join('');
    return hex + '-' + file.size + '-' + file.lastModified;
  }

  /* =========================================================
     图片压缩（与首页一致）
     ========================================================= */
  const COMPRESS_QUALITY = 0.75;
  const COMPRESSIBLE_MIME_PREFIX = 'image/';
  const COMPRESS_SKIP_MIME = 'image/gif';

  function shouldCompress(file) {
    if (!file || !file.type) return false;
    if (file.type.indexOf(COMPRESSIBLE_MIME_PREFIX) !== 0) return false;
    if (file.type === COMPRESS_SKIP_MIME) return false;
    return true;
  }

  function compressImage(file, quality) {
    quality = quality === undefined ? COMPRESS_QUALITY : quality;
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
          var baseName = (file.name || 'image').replace(/\.[^.]+$/, '') || 'image';
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

  /* =========================================================
     上传
     ========================================================= */
  const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'mp4', 'avi', 'mov', 'webm'];

  function joinUrl(base, path) {
    return String(base).replace(/\/+$/, '') + path;
  }

  function buildFormData(file, cfg) {
    const fd = new FormData();
    fd.append('file', file, file.name || 'file');
    fd.append('_u', cfg.username || '');
    fd.append('_p', cfg.password || '');
    return fd;
  }

  function parseResponse(resText, status) {
    let data = null;
    try { data = JSON.parse(resText); } catch {}
    if (status >= 200 && status < 300) {
      if (data && data.data) return { ok: true, url: data.data };
      return { ok: false, msg: (data && data.error) || '响应异常' };
    }
    return { ok: false, msg: (data && (data.error || data.message)) || ('HTTP ' + status) };
  }

  function uploadFile(file) {
    return new Promise((resolve, reject) => {
      const cfg = readCfg();
      if (!cfg || !cfg.apiUrl) return reject(new Error('请先配置图床信息'));

      const url = joinUrl(cfg.apiUrl, '/upload');
      const fd = buildFormData(file, cfg);

      if (typeof GM_xmlhttpRequest === 'function') {
        try {
          GM_xmlhttpRequest({
            method: 'POST',
            url: url,
            data: fd,
            responseType: 'text',
            onload: (res) => {
              const parsed = parseResponse(res.responseText, res.status);
              if (parsed.ok) resolve(parsed.url);
              else reject(new Error(parsed.msg));
            },
            onerror: () => doXHR(),
            ontimeout: () => reject(new Error('上传超时'))
          });
          return;
        } catch (e) {}
      }

      doXHR();

      function doXHR() {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url);
        xhr.onload = () => {
          const parsed = parseResponse(xhr.responseText, xhr.status);
          if (parsed.ok) resolve(parsed.url);
          else reject(new Error(parsed.msg));
        };
        xhr.onerror = () => reject(new Error('网络错误'));
        xhr.ontimeout = () => reject(new Error('上传超时'));
        try { xhr.timeout = 120000; } catch {}
        xhr.send(fd);
      }
    });
  }

  /* =========================================================
     位置管理
     ========================================================= */
  const DEFAULT_TOP_MARGIN = 80;
  const DEFAULT_BOTTOM_MARGIN = 90;
  const SNAP_MARGIN = 16;

  function clampTop(top, height) {
    const viewH = window.innerHeight;
    const min = DEFAULT_TOP_MARGIN;
    const max = viewH - height - DEFAULT_BOTTOM_MARGIN;
    if (max < min) return min;
    return Math.max(min, Math.min(max, top));
  }

  function applyDock(wrap, dock) {
    if (dock === 'left') {
      wrap.classList.add('r2-fab-wrap--dock-left');
      wrap.classList.remove('r2-fab-wrap--dock-right');
    } else {
      wrap.classList.add('r2-fab-wrap--dock-right');
      wrap.classList.remove('r2-fab-wrap--dock-left');
    }
  }

  function setPos(wrap, left, top) {
    wrap.style.left = left + 'px';
    wrap.style.top = top + 'px';
    wrap.style.right = 'auto';
    wrap.style.bottom = 'auto';
  }

  function initPosition(wrap) {
    const saved = readPos();
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;
    const w = wrap.offsetWidth || 52;
    const h = wrap.offsetHeight || 52;

    let dock = 'right';
    let top = viewH - h - DEFAULT_BOTTOM_MARGIN;

    if (saved) {
      dock = saved.dock === 'left' ? 'left' : 'right';
      if (typeof saved.top === 'number') top = saved.top;
    }

    top = clampTop(top, h);
    applyDock(wrap, dock);

    let left;
    if (dock === 'left') left = SNAP_MARGIN;
    else left = viewW - w - SNAP_MARGIN;

    const prevTransition = wrap.style.transition;
    wrap.style.transition = 'none';
    setPos(wrap, left, top);
    requestAnimationFrame(() => {
      wrap.style.transition = prevTransition || '';
    });
  }

  function snapToEdge(wrap) {
    const rect = wrap.getBoundingClientRect();
    const viewW = window.innerWidth;
    const w = rect.width;
    const h = rect.height;

    const centerX = rect.left + w / 2;
    const dock = centerX < viewW / 2 ? 'left' : 'right';

    let left;
    if (dock === 'left') left = SNAP_MARGIN;
    else left = viewW - w - SNAP_MARGIN;

    const top = clampTop(rect.top, h);

    applyDock(wrap, dock);
    setPos(wrap, left, top);
    writePos({ dock: dock, top: top });
  }

  /* =========================================================
     拖动 + 单击 + 长按
     ========================================================= */
  function bindDragAndPress(wrap, fab, opts) {
    const {
      onShort, onLong, onDragEnd,
      longDelay = 600,
      dragThreshold = 8
    } = opts;

    let longTimer = null;
    let longFired = false;
    let dragging = false;
    let pointerId = null;
    let startX = 0, startY = 0;
    let startLeft = 0, startTop = 0;
    let wrapW = 52, wrapH = 52;

    function clearLong() {
      if (longTimer) { clearTimeout(longTimer); longTimer = null; }
    }

    function onPointerDown(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (pointerId !== null) return;

      pointerId = e.pointerId;
      longFired = false;
      dragging = false;

      startX = e.clientX;
      startY = e.clientY;

      const rect = wrap.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      wrapW = rect.width;
      wrapH = rect.height;

      try { fab.setPointerCapture(e.pointerId); } catch {}

      clearLong();
      longTimer = setTimeout(() => {
        longTimer = null;
        longFired = true;
        if (navigator.vibrate) { try { navigator.vibrate(30); } catch (_) {} }
        if (onLong) onLong(e);
      }, longDelay);
    }

    function onPointerMove(e) {
      if (pointerId !== e.pointerId) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (!dragging && !longFired) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > dragThreshold) {
          dragging = true;
          clearLong();
          wrap.classList.add('r2-fab-wrap--dragging');
        }
      }

      if (dragging) {
        if (e.cancelable) e.preventDefault();
        const viewW = window.innerWidth;
        const viewH = window.innerHeight;
        let newLeft = startLeft + dx;
        let newTop = startTop + dy;
        newLeft = Math.max(4, Math.min(viewW - wrapW - 4, newLeft));
        newTop = Math.max(4, Math.min(viewH - wrapH - 4, newTop));
        wrap.style.left = newLeft + 'px';
        wrap.style.top = newTop + 'px';
        wrap.style.right = 'auto';
        wrap.style.bottom = 'auto';
      }
    }

    function finishPointer(e) {
      if (pointerId !== e.pointerId) return;
      const wasDragging = dragging;
      const wasLong = longFired;
      pointerId = null;
      clearLong();
      try { fab.releasePointerCapture(e.pointerId); } catch {}

      if (wasDragging) {
        dragging = false;
        wrap.classList.remove('r2-fab-wrap--dragging');
        requestAnimationFrame(() => {
          if (onDragEnd) onDragEnd();
        });
        return;
      }

      if (!wasLong) {
        if (onShort) onShort(e);
      }
    }

    function onPointerCancel(e) {
      if (pointerId !== e.pointerId) return;
      pointerId = null;
      dragging = false;
      clearLong();
      wrap.classList.remove('r2-fab-wrap--dragging');
      try { fab.releasePointerCapture(e.pointerId); } catch {}
    }

    fab.addEventListener('pointerdown', onPointerDown);
    fab.addEventListener('pointermove', onPointerMove);
    fab.addEventListener('pointerup', finishPointer);
    fab.addEventListener('pointercancel', onPointerCancel);
    fab.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /* =========================================================
     UI 构建
     ========================================================= */
  function buildUI() {
    injectStyles();

    const hiddenInput = document.createElement('input');
    hiddenInput.type = 'file';
    hiddenInput.multiple = true;
    hiddenInput.className = 'r2-hidden-input';
    hiddenInput.style.cssText = 'position:fixed !important;left:-9999px !important;top:0 !important;width:1px !important;height:1px !important;opacity:0 !important;pointer-events:none !important;';
    hiddenInput.setAttribute('aria-hidden', 'true');
    hiddenInput.setAttribute('tabindex', '-1');
    document.body.appendChild(hiddenInput);

    const panel = document.createElement('div');
    panel.className = 'r2-panel';
    panel.innerHTML = `
      <div class="r2-head">
        <div class="r2-title">R2 图床设置</div>
        <div class="r2-actions">
          <button type="button" class="r2-mini" data-act="close" title="关闭" aria-label="关闭">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="r2-form">
        <div class="r2-field">
          <label class="r2-label">图床地址</label>
          <input type="url" class="r2-input" data-cfg="apiUrl"
                 placeholder="https://img.example.com"
                 autocomplete="off" autocapitalize="off" spellcheck="false">
        </div>
        <div class="r2-field">
          <label class="r2-label">用户名</label>
          <input type="text" class="r2-input" data-cfg="username"
                 placeholder="admin" autocomplete="off" autocapitalize="off" spellcheck="false">
        </div>
        <div class="r2-field">
          <label class="r2-label">密码</label>
          <input type="password" class="r2-input" data-cfg="password"
                 placeholder="password" autocomplete="off">
        </div>
        <div class="r2-actions-row">
          <button type="button" class="r2-btn r2-btn--primary" data-act="save" style="flex:1">保存</button>
          <button type="button" class="r2-btn" data-act="clearHistory" style="flex:1">清空记录</button>
        </div>

        <div class="r2-cache-info">
          <span>已缓存 <strong data-cache-count>0</strong> 个文件</span>
          <button type="button" class="r2-btn" data-act="clearCache"
                  style="padding:5px 10px;font-size:11.5px;border-radius:9px;">清空缓存</button>
        </div>

        <div style="font-size:11.5px;color:#64748b;text-align:center;margin-top:6px;line-height:1.5">
          单击上传 · 长按设置 · 拖动按钮可吸附到边缘<br>
          图片默认压缩为 JPEG（GIF 除外）· 相同文件自动命中缓存
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    const wrap = document.createElement('div');
    wrap.className = 'r2-fab-wrap';
    fabWrapRef = wrap;

    const importBtn = document.createElement('button');
    importBtn.type = 'button';
    importBtn.className = 'r2-import-btn';
    importBtn.title = '把链接导入到输入框';
    importBtn.setAttribute('aria-label', '把链接导入到输入框');
    importBtn.innerHTML = `
      <svg class="r2-import-btn__icon" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2.2"
           stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/>
        <polyline points="16 8 12 4 8 8"/>
        <line x1="12" y1="4" x2="12" y2="16"/>
      </svg>
      <span data-import-label>导入</span>
    `;

    const fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'r2-fab';
    fab.title = '点击上传 · 长按设置 · 拖动吸附';
    fab.setAttribute('aria-label', '上传文件，长按进入设置，可拖动到屏幕边缘');
    fab.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="3" ry="3"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>`;
    if (!hasValidCfg()) fab.classList.add('r2-fab--attention');

    wrap.appendChild(importBtn);
    wrap.appendChild(fab);
    document.body.appendChild(wrap);

    initPosition(wrap);

    let resizeTimer = null;
    window.addEventListener('resize', () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const rect = wrap.getBoundingClientRect();
        const viewW = window.innerWidth;
        const w = rect.width, h = rect.height;
        const centerX = rect.left + w / 2;
        const dock = centerX < viewW / 2 ? 'left' : 'right';
        let left = dock === 'left' ? SNAP_MARGIN : viewW - w - SNAP_MARGIN;
        let top = clampTop(rect.top, h);
        applyDock(wrap, dock);
        setPos(wrap, left, top);
        writePos({ dock: dock, top: top });
      }, 150);
    });

    const $ = (sel, root) => (root || panel).querySelector(sel);
    const panelOpen = () => panel.classList.contains('show');
    const importLabel = importBtn.querySelector('[data-import-label]');
    const cacheCountEl = panel.querySelector('[data-cache-count]');

    function refreshCacheCount() {
      if (cacheCountEl) cacheCountEl.textContent = String(cacheCount());
    }

    function showSettings() {
      const cfg = readCfg() || {};
      const setVal = (k, v) => {
        const el = $('[data-cfg="' + k + '"]');
        if (el) el.value = v || '';
      };
      setVal('apiUrl', cfg.apiUrl);
      setVal('username', cfg.username);
      setVal('password', cfg.password);
      refreshCacheCount();
      if (!panelOpen()) panel.classList.add('show');
    }

    function closePanel() {
      panel.classList.remove('show');
    }

    document.addEventListener('focusin', (e) => {
      const el = e.target;
      if (!el) return;
      if (fabWrapRef && fabWrapRef.contains(el)) return;
      if (panel.contains(el)) return;
      if (isEditable(el)) lastFocusedEditable = el;
    }, true);

    function triggerFilePicker() {
      pendingUrls.length = 0;
      try { hiddenInput.value = ''; } catch {}
      try { hiddenInput.click(); } catch {}
    }

    bindDragAndPress(wrap, fab, {
      longDelay: 600,
      dragThreshold: 8,
      onShort() {
        if (panelOpen()) { closePanel(); return; }
        if (!hasValidCfg()) {
          showSettings();
          toast('请先配置图床信息', 'warning');
          return;
        }
        hideImportBtn();
        triggerFilePicker();
      },
      onLong() {
        showSettings();
      },
      onDragEnd() {
        snapToEdge(wrap);
      }
    });

    document.addEventListener('click', (e) => {
      if (!panelOpen()) return;
      if (panel.contains(e.target)) return;
      if (wrap.contains(e.target)) return;
      closePanel();
    }, true);
    panel.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && panelOpen()) closePanel();
    });

    panel.querySelectorAll('[data-act]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const act = btn.dataset.act;
        if (act === 'close') closePanel();
        else if (act === 'save') saveSettings();
        else if (act === 'clearHistory') {
          writeHistory([]);
          toast('已清空记录', 'success');
        } else if (act === 'clearCache') {
          clearCache();
          refreshCacheCount();
          toast('已清空缓存', 'success');
        }
      });
    });

    function saveSettings() {
      const apiUrl = ($('[data-cfg="apiUrl"]').value || '').trim();
      const username = ($('[data-cfg="username"]').value || '').trim();
      const password = ($('[data-cfg="password"]').value || '');

      if (!apiUrl) { toast('请填写图床地址', 'warning'); return; }
      if (!/^https?:\/\//i.test(apiUrl)) { toast('地址需要 http(s):// 开头', 'warning'); return; }

      writeCfg({ apiUrl, username, password });
      fab.classList.remove('r2-fab--attention');
      toast('设置已保存', 'success');
      closePanel();
    }

    hiddenInput.addEventListener('change', () => {
      const files = Array.from(hiddenInput.files || []);
      hiddenInput.value = '';
      if (files.length > 0) handleFiles(files);
    });

    const pendingUrls = [];

    function showImportBtn() {
      const n = pendingUrls.length;
      importLabel.textContent = n > 1 ? ('导入 ' + n + ' 条') : '导入';
      importBtn.classList.add('show');
    }
    function hideImportBtn() {
      importBtn.classList.remove('show');
      pendingUrls.length = 0;
    }

    importBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (pendingUrls.length === 0) { toast('没有可导入的内容', 'warning'); return; }

      const target = pickTarget();
      if (!target) { toast('请先点击要插入的输入框', 'warning'); return; }

      const payload = pendingUrls.map((u) => formatUrlForSite(u)).join('\n\n');
      const ok = insertIntoEditable(target, payload);

      if (ok) {
        toast('已导入 ' + pendingUrls.length + ' 条', 'success');
        hideImportBtn();
      } else {
        toast('导入失败，请重试', 'error');
      }
    });

    /* ---------- 处理文件（含缓存 + 压缩）---------- */
    async function handleFiles(files) {
      if (!hasValidCfg()) {
        toast('请先配置图床信息', 'warning');
        showSettings();
        return;
      }

      const queue = files.filter((f) => {
        const ext = fileExt(f.name);
        if (ext && ALLOWED_EXT.indexOf(ext) === -1) {
          toast('不支持：' + ext, 'error');
          return false;
        }
        return true;
      });
      if (queue.length === 0) return;

      let processed = 0;
      let succeeded = 0;
      let fromCache = 0;
      let failed = 0;
      const total = queue.length;

      // 按钮进入转圈
      fab.classList.add('r2-fab--busy');

      const CONCURRENCY = 2;
      const workers = Array.from({ length: Math.min(CONCURRENCY, total) }, async () => {
        while (queue.length) {
          const originalFile = queue.shift();
          try {
            // 1) 计算原始文件的哈希
            const hash = await calculateFileHash(originalFile);

            // 2) 查缓存
            const cached = getCacheEntry(hash);
            if (cached && cached.u) {
              processed++;
              fromCache++;
              succeeded++;
              pendingUrls.push(cached.u);
              pushHistory(cached.u);
              continue;
            }

            // 3) 未命中：压缩（如果需要）
            let toUpload = originalFile;
            if (shouldCompress(originalFile)) {
              try {
                toUpload = await compressImage(originalFile);
              } catch (e) {
                console.warn('[R2] 压缩失败，使用原图:', e);
                toUpload = originalFile;
              }
            }

            // 4) 上传
            const url = await uploadFile(toUpload);

            // 5) 写入缓存 + 历史 + 待导入列表
            setCacheEntry(hash, url, originalFile.name);
            processed++;
            succeeded++;
            pendingUrls.push(url);
            pushHistory(url);
          } catch (err) {
            processed++;
            failed++;
            console.error('[R2] 上传失败:', originalFile.name, err);
            toast('上传失败：' + ((err && err.message) || '未知错误'), 'error');
          }
        }
      });

      await Promise.all(workers);

      fab.classList.remove('r2-fab--busy');

      // 汇总提示
      if (succeeded > 0) {
        let msg;
        if (fromCache === succeeded && succeeded > 0) {
          msg = fromCache > 1 ? ('命中缓存 ' + fromCache + ' 个') : '命中缓存';
        } else if (fromCache > 0) {
          msg = '成功 ' + succeeded + ' 个（缓存 ' + fromCache + ' 个）';
        } else {
          msg = succeeded > 1 ? ('上传成功 ' + succeeded + ' 个') : '上传成功';
        }
        toast(msg, 'success');
        showImportBtn();
      }
      if (failed > 0 && succeeded === 0) {
        // 全失败时已逐条弹出错误，这里不重复提示
      }
    }
  }

  /* =========================================================
     启动
     ========================================================= */
  function start() {
    if (document.getElementById(STYLE_ID)) return;
    buildUI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
