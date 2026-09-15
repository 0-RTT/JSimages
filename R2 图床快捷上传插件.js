// ==UserScript==
// @name         R2 图床快捷上传
// @namespace    https://github.com/0-RTT/JSimages
// @version      2.4.2
// @description  单击上传、长按设置、拖动换位（左右吸附 + 桌面端鼠标修复，无进度条）
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
  const POS_KEY = 'r2_fab_pos_v2';

  function hasGM() {
    return typeof GM_getValue === 'function' && typeof GM_setValue === 'function';
  }

  function readCfg() {
    try {
      if (hasGM()) return GM_getValue(STORE_KEY, null);
      return JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    } catch { return null; }
  }
  function writeCfg(cfg) {
    try {
      if (hasGM()) GM_setValue(STORE_KEY, cfg);
      else localStorage.setItem(STORE_KEY, JSON.stringify(cfg));
    } catch {}
  }
  function hasValidCfg() {
    const c = readCfg();
    return !!(c && c.apiUrl);
  }
  function readHistory() {
    try {
      if (hasGM()) return GM_getValue(HISTORY_KEY, []);
      return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    } catch { return []; }
  }
  function writeHistory(list) {
    try {
      if (hasGM()) GM_setValue(HISTORY_KEY, list);
      else localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
    } catch {}
  }
  function pushHistory(url) {
    const list = readHistory();
    const idx = list.indexOf(url);
    if (idx !== -1) list.splice(idx, 1);
    list.unshift(url);
    if (list.length > 12) list.length = 12;
    writeHistory(list);
  }
  function readPos() {
    try {
      if (hasGM()) return GM_getValue(POS_KEY, null);
      return JSON.parse(localStorage.getItem(POS_KEY) || 'null');
    } catch { return null; }
  }
  function writePos(pos) {
    try {
      if (hasGM()) GM_setValue(POS_KEY, pos);
      else localStorage.setItem(POS_KEY, JSON.stringify(pos));
    } catch {}
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

    const tag = el.tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT' || el.isContentEditable) {
      try {
        const ok = document.execCommand('insertText', false, text);
        if (ok) {
          el.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        }
      } catch {}
    }

    if (tag === 'TEXTAREA' || tag === 'INPUT') {
      const proto = tag === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
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
  .r2-fab-wrap, .r2-fab-wrap *, .r2-panel, .r2-panel *, .r2-toast, .r2-toast * {
    box-sizing:border-box;
  }

  .r2-fab-wrap{
    position:fixed;
    right:calc(20px + env(safe-area-inset-right, 0px));
    bottom:calc(90px + env(safe-area-inset-bottom, 0px));
    width:52px;height:52px;
    z-index:2147483000;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
    font-size:14px;-webkit-tap-highlight-color:transparent;
    touch-action:none;
    transition:left .28s cubic-bezier(.22,1,.36,1),top .28s cubic-bezier(.22,1,.36,1);
  }
  .r2-fab-wrap.r2-fab-wrap--dragging{
    transition:none !important;
  }
  .r2-fab-wrap.r2-fab-wrap--dragging .r2-fab{
    box-shadow:0 18px 42px -12px rgba(99,102,241,.8),
      inset 0 1px 0 rgba(255,255,255,.95),
      inset 0 0 0 2px rgba(129,140,248,.7);
  }

  .r2-fab{
    position:absolute;inset:0;
    width:100%;height:100%;border-radius:50%;border:none;cursor:pointer;
    display:flex;align-items:center;justify-content:center;color:#4338ca;
    padding:0;
    background:linear-gradient(140deg,rgba(255,255,255,.9),rgba(255,255,255,.55));
    backdrop-filter:blur(20px) saturate(180%);-webkit-backdrop-filter:blur(20px) saturate(180%);
    box-shadow:0 12px 30px -10px rgba(15,23,42,.45),inset 0 1px 0 rgba(255,255,255,.95),
      inset 0 0 0 1px rgba(255,255,255,.6);
    transition:box-shadow .25s ease;
    touch-action:manipulation;-webkit-user-select:none;user-select:none;
    -webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;
  }
  .r2-fab:hover{
    box-shadow:0 16px 38px -10px rgba(99,102,241,.7),
      inset 0 1px 0 rgba(255,255,255,.95),
      inset 0 0 0 1px rgba(255,255,255,.7);
  }
  .r2-fab svg{width:24px;height:24px;display:block;pointer-events:none;}
  .r2-fab.r2-fab--busy{pointer-events:none;color:#6366f1;}
  .r2-fab.r2-fab--busy svg{animation:r2Spin 1.2s linear infinite;}
  @keyframes r2Spin{from{transform:rotate(0);}to{transform:rotate(360deg);}}
  .r2-fab.r2-fab--attention{animation:r2Attention 2.4s ease-in-out infinite;}
  @keyframes r2Attention{
    0%,100%{box-shadow:0 12px 30px -10px rgba(15,23,42,.45),inset 0 1px 0 rgba(255,255,255,.95),
      inset 0 0 0 1px rgba(255,255,255,.6);}
    50%{box-shadow:0 14px 34px -8px rgba(99,102,241,.7),inset 0 1px 0 rgba(255,255,255,.95),
      inset 0 0 0 2px rgba(129,140,248,.7);}
  }
  .r2-fab-wrap.r2-fab-wrap--dragging .r2-fab:hover{
    box-shadow:0 18px 42px -12px rgba(99,102,241,.8),
      inset 0 1px 0 rgba(255,255,255,.95),
      inset 0 0 0 2px rgba(129,140,248,.7);
  }

  .r2-import-btn{
    position:absolute;
    top:50%;
    display:inline-flex;align-items:center;gap:7px;
    height:44px;padding:0 18px 0 16px;border-radius:22px;border:none;cursor:pointer;
    font-size:13.5px;font-weight:700;font-family:inherit;letter-spacing:.2px;color:#4338ca;
    white-space:nowrap;opacity:0;pointer-events:none;
    background:linear-gradient(140deg,rgba(255,255,255,.9),rgba(255,255,255,.55));
    backdrop-filter:blur(20px) saturate(180%);-webkit-backdrop-filter:blur(20px) saturate(180%);
    box-shadow:0 12px 30px -10px rgba(15,23,42,.45),inset 0 1px 0 rgba(255,255,255,.95),
      inset 0 0 0 1px rgba(255,255,255,.6);
    transition:opacity .32s ease,transform .42s cubic-bezier(.22,1,.36,1),box-shadow .25s ease;
    touch-action:manipulation;-webkit-tap-highlight-color:transparent;
    -webkit-user-select:none;user-select:none;
  }
  .r2-fab-wrap[data-side="right"] .r2-import-btn{
    right:calc(100% + 10px);
    transform:translateY(-50%) translateX(14px) scale(.9);
    transform-origin:right center;
  }
  .r2-fab-wrap[data-side="right"] .r2-import-btn.show{
    opacity:1;pointer-events:auto;
    transform:translateY(-50%) translateX(0) scale(1);
  }
  .r2-fab-wrap[data-side="left"] .r2-import-btn{
    left:calc(100% + 10px);
    transform:translateY(-50%) translateX(-14px) scale(.9);
    transform-origin:left center;
  }
  .r2-fab-wrap[data-side="left"] .r2-import-btn.show{
    opacity:1;pointer-events:auto;
    transform:translateY(-50%) translateX(0) scale(1);
  }
  .r2-import-btn__icon{width:16px;height:16px;display:block;flex:0 0 auto;color:#4f46e5;}

  .r2-hidden-input{
    position:absolute !important;
    left:-9999px !important;top:0 !important;
    width:1px !important;height:1px !important;
    opacity:0 !important;
    pointer-events:none !important;
  }
  .r2-panel{
    position:fixed;right:calc(20px + env(safe-area-inset-right, 0px));
    bottom:calc(160px + env(safe-area-inset-bottom, 0px));width:340px;
    max-width:calc(100vw - 28px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px));
    max-height:calc(100vh - 240px);overflow-y:auto;-webkit-overflow-scrolling:touch;
    overscroll-behavior:contain;border-radius:22px;padding:16px;color:#1e293b;
    background:linear-gradient(140deg,rgba(255,255,255,.92),rgba(255,255,255,.66));
    backdrop-filter:blur(28px) saturate(180%);-webkit-backdrop-filter:blur(28px) saturate(180%);
    box-shadow:0 24px 60px -20px rgba(15,23,42,.55),inset 0 1px 0 rgba(255,255,255,.95),
      inset 0 -1px 0 rgba(255,255,255,.3),inset 0 0 0 1px rgba(255,255,255,.5);
    opacity:0;transform:translateY(10px) scale(.96);transform-origin:bottom right;pointer-events:none;
    transition:opacity .28s ease,transform .34s cubic-bezier(.22,1,.36,1);
    box-sizing:border-box;z-index:2147483000;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
    font-size:14px;
  }
  .r2-panel.show{opacity:1;transform:translateY(0) scale(1);pointer-events:auto;}
  .r2-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;}
  .r2-title{font-weight:700;font-size:15px;color:#312e81;letter-spacing:.3px;}
  .r2-actions{display:flex;gap:6px;}
  .r2-mini{width:30px;height:30px;border-radius:10px;border:none;cursor:pointer;
    display:inline-flex;align-items:center;justify-content:center;color:#4338ca;padding:0;
    background:rgba(255,255,255,.72);
    box-shadow:inset 0 0 0 1px rgba(255,255,255,.7),0 4px 10px -6px rgba(15,23,42,.5);
    transition:transform .2s ease,background .2s ease;touch-action:manipulation;
    -webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;}
  .r2-mini:hover{transform:translateY(-1px);background:rgba(255,255,255,.92);}
  .r2-mini svg{width:16px;height:16px;display:block;pointer-events:none;}
  .r2-form{display:flex;flex-direction:column;gap:10px;}
  .r2-field{display:flex;flex-direction:column;gap:4px;}
  .r2-label{font-size:12px;color:#475569;font-weight:600;}
  .r2-input{width:100%;padding:10px 12px;border-radius:12px;
    border:1px solid rgba(255,255,255,.72);background:rgba(255,255,255,.7);
    font-size:14px;font-family:inherit;color:#1e293b;outline:none;
    transition:border-color .2s,box-shadow .2s;box-sizing:border-box;-webkit-appearance:none;}
  .r2-input:focus{border-color:#818cf8;box-shadow:0 0 0 3px rgba(129,140,248,.25);}
  .r2-actions-row{display:flex;gap:8px;margin-top:6px;}
  .r2-btn{display:inline-flex;align-items:center;justify-content:center;
    padding:10px 16px;border:none;border-radius:12px;font-size:13px;font-weight:600;
    cursor:pointer;font-family:inherit;color:#3730a3;
    background:linear-gradient(140deg,rgba(255,255,255,.85),rgba(255,255,255,.5));
    box-shadow:inset 0 0 0 1px rgba(255,255,255,.7),0 6px 14px -10px rgba(15,23,42,.6);
    transition:transform .2s ease,color .2s ease;touch-action:manipulation;
    -webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;}
  .r2-btn:hover{transform:translateY(-1px);color:#6d28d9;}
  .r2-btn:active{transform:translateY(0) scale(.97);}
  .r2-btn--primary{color:#fff;background:linear-gradient(135deg,#6366f1,#8b5cf6);
    box-shadow:0 10px 20px -10px rgba(99,102,241,.9);}
  .r2-btn--primary:hover{color:#fff;}

  .r2-toast-stack{position:fixed;top:calc(22px + env(safe-area-inset-top, 0px));
    right:calc(22px + env(safe-area-inset-right, 0px));z-index:2147483647;
    display:flex;flex-direction:column;align-items:flex-end;gap:10px;pointer-events:none;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;}
  .r2-toast{display:flex;align-items:center;gap:10px;padding:11px 18px;border-radius:14px;
    font-size:13.5px;font-weight:600;color:#1e293b;max-width:min(80vw,320px);
    opacity:0;transform:translateY(-10px) scale(.96);
    transition:opacity .34s ease,transform .42s cubic-bezier(.22,1,.36,1);
    background:linear-gradient(140deg,rgba(255,255,255,.92),rgba(255,255,255,.62));
    backdrop-filter:blur(24px) saturate(180%);-webkit-backdrop-filter:blur(24px) saturate(180%);
    box-shadow:0 18px 44px -22px rgba(15,23,42,.6),inset 0 1px 0 rgba(255,255,255,.96),
      inset 0 0 0 1px rgba(255,255,255,.6);}
  .r2-toast.is-in{opacity:1;transform:translateY(0) scale(1);}
  .r2-toast.is-out{opacity:0;transform:translateY(-8px) scale(.97);}
  .r2-toast__dot{width:8px;height:8px;border-radius:50%;background:#3b82f6;
    box-shadow:0 0 9px 1px rgba(59,130,246,.85);flex:0 0 auto;}
  .r2-toast--success{color:#065f46;} .r2-toast--success .r2-toast__dot{background:#10b981;box-shadow:0 0 9px 1px rgba(16,185,129,.9);}
  .r2-toast--error{color:#991b1b;} .r2-toast--error .r2-toast__dot{background:#ef4444;box-shadow:0 0 9px 1px rgba(239,68,68,.9);}
  .r2-toast--warning{color:#92400e;} .r2-toast--warning .r2-toast__dot{background:#f59e0b;box-shadow:0 0 9px 1px rgba(245,158,11,.9);}

  @media (max-width:560px){
    .r2-fab-wrap{right:calc(14px + env(safe-area-inset-right, 0px));
      bottom:calc(78px + env(safe-area-inset-bottom, 0px));
      width:50px;height:50px;}
    .r2-fab svg{width:22px;height:22px;}
    .r2-import-btn{height:42px;padding:0 15px 0 13px;font-size:13px;border-radius:21px;}
    .r2-import-btn__icon{width:15px;height:15px;}
    .r2-panel{right:calc(14px + env(safe-area-inset-right, 0px));
      bottom:calc(148px + env(safe-area-inset-bottom, 0px));
      width:calc(100vw - 28px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px));
      max-width:none;max-height:calc(100vh - 220px);padding:14px;border-radius:20px;}
    .r2-toast-stack{top:calc(14px + env(safe-area-inset-top, 0px));
      right:calc(14px + env(safe-area-inset-right, 0px));
      left:calc(14px + env(safe-area-inset-left, 0px));align-items:stretch;}
    .r2-toast{max-width:none;}
  }
  @supports (height: 100dvh){
    .r2-panel{max-height:calc(100dvh - 240px);}
    @media (max-width:560px){ .r2-panel{max-height:calc(100dvh - 220px);} }
  }`;

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
    el.appendChild(dot); el.appendChild(span);
    ensureToastStack().appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-in'));
    const close = () => {
      el.classList.remove('is-in'); el.classList.add('is-out');
      setTimeout(() => el.remove(), 380);
    };
    if (d > 0) setTimeout(close, d);
  }

  /* =========================================================
     上传（无进度回调）
     ========================================================= */
  const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'mp4', 'avi', 'mov', 'webm'];

  function joinUrl(base, path) { return String(base).replace(/\/+$/, '') + path; }

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
            method: 'POST', url: url, data: fd, responseType: 'text',
            onload: (res) => {
              const parsed = parseResponse(res.responseText, res.status);
              if (parsed.ok) resolve(parsed.url);
              else reject(new Error(parsed.msg));
            },
            onerror: () => { doXHR(); },
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
     短按 / 长按 / 拖动 + 左右吸附
     ========================================================= */
  const LONG_PRESS_MS = 600;
  const DRAG_THRESHOLD = 8;
  const SNAP_LEFT_RATIO = 0.35;
  const SNAP_RIGHT_RATIO = 0.65;

  function getMargin() {
    return window.innerWidth <= 560 ? 14 : 20;
  }

  function bindFabInteract(wrap, fab, { onShort, onLong, onSideChange }) {
    let timer = null;
    let longFired = false;
    let dragging = false;
    let activePointer = false;

    let startX = 0, startY = 0;
    let dragOriginX = 0, dragOriginY = 0;
    let wrapW = 0, wrapH = 0;

    function clearTimer() { if (timer) { clearTimeout(timer); timer = null; } }

    function onPointerDown(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      activePointer = true;
      longFired = false;
      dragging = false;
      startX = e.clientX;
      startY = e.clientY;

      const rect = wrap.getBoundingClientRect();
      dragOriginX = rect.left;
      dragOriginY = rect.top;
      wrapW = rect.width;
      wrapH = rect.height;

      clearTimer();
      timer = setTimeout(() => {
        timer = null;
        longFired = true;
        if (navigator.vibrate) { try { navigator.vibrate(30); } catch (_) {} }
        onLong && onLong(e);
      }, LONG_PRESS_MS);

      try { fab.setPointerCapture(e.pointerId); } catch {}
    }

    function onPointerMove(e) {
      if (!activePointer) return;
      if (e.pointerType === 'mouse' && (e.buttons & 1) === 0) {
        clearTimer();
        activePointer = false;
        dragging = false;
        wrap.classList.remove('r2-fab-wrap--dragging');
        return;
      }

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (!dragging && !longFired && dist > DRAG_THRESHOLD) {
        clearTimer();
        dragging = true;
        wrap.classList.add('r2-fab-wrap--dragging');
      }

      if (dragging) {
        const margin = getMargin();
        const minX = margin;
        const maxX = window.innerWidth - wrapW - margin;
        const minY = margin;
        const maxY = window.innerHeight - wrapH - margin;

        let newX = dragOriginX + dx;
        let newY = dragOriginY + dy;
        newX = Math.max(minX, Math.min(maxX, newX));
        newY = Math.max(minY, Math.min(maxY, newY));

        wrap.style.left = newX + 'px';
        wrap.style.top = newY + 'px';
      }
    }

    function onPointerUp(e) {
      if (!activePointer) return;
      activePointer = false;
      clearTimer();
      try { fab.releasePointerCapture(e.pointerId); } catch {}

      if (dragging) {
        dragging = false;
        wrap.classList.remove('r2-fab-wrap--dragging');

        const rect = wrap.getBoundingClientRect();
        const w = window.innerWidth;
        const margin = getMargin();
        const fabCenterX = rect.left + rect.width / 2;

        let finalX = rect.left;

        if (fabCenterX < w * SNAP_LEFT_RATIO) {
          finalX = margin;
        } else if (fabCenterX > w * SNAP_RIGHT_RATIO) {
          finalX = w - rect.width - margin;
        }

        if (finalX !== rect.left) {
          wrap.style.transition = 'left .28s cubic-bezier(.22,1,.36,1)';
          void wrap.offsetWidth;
          wrap.style.left = finalX + 'px';
          setTimeout(() => { wrap.style.transition = ''; }, 320);
        }

        writePos({ x: finalX, y: rect.top });

        if (onSideChange) onSideChange();
        return;
      }

      if (!longFired) onShort && onShort(e);
    }

    function onPointerCancel() {
      if (!activePointer) return;
      activePointer = false;
      clearTimer();
      if (dragging) {
        dragging = false;
        wrap.classList.remove('r2-fab-wrap--dragging');
      }
    }

    fab.addEventListener('pointerdown', onPointerDown);
    fab.addEventListener('pointermove', onPointerMove);
    fab.addEventListener('pointerup', onPointerUp);
    fab.addEventListener('pointercancel', onPointerCancel);
    fab.addEventListener('pointerleave', () => {
      if (!dragging && activePointer) {
        clearTimer();
        activePointer = false;
      }
    });
    fab.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /* =========================================================
     面板 HTML（懒注入）
     ========================================================= */
  const PANEL_HTML = `
    <div class="r2-head">
      <div class="r2-title">R2 图床设置</div>
      <div class="r2-actions">
        <div class="r2-mini" data-act="close" title="关闭" role="button" aria-label="关闭">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </div>
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
        <div class="r2-btn r2-btn--primary" data-act="save" role="button" style="flex:1">保存</div>
        <div class="r2-btn" data-act="clearHistory" role="button" style="flex:1">清空记录</div>
      </div>
      <div style="font-size:11.5px;color:#64748b;text-align:center;margin-top:6px;line-height:1.5">
        单击上传 · 长按设置 · 拖动换位（左右吸附）<br>
        凭据已本地缓存，下次上传自动使用
      </div>
    </div>
  `;

  /* =========================================================
     UI
     ========================================================= */
  function buildUI() {
    injectStyles();

    const panel = document.createElement('div');
    panel.className = 'r2-panel';
    document.body.appendChild(panel);

    const wrap = document.createElement('div');
    wrap.className = 'r2-fab-wrap';
    wrap.dataset.side = 'right';
    fabWrapRef = wrap;

    const importBtn = document.createElement('div');
    importBtn.className = 'r2-import-btn';
    importBtn.setAttribute('role', 'button');
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

    const fab = document.createElement('div');
    fab.className = 'r2-fab';
    fab.setAttribute('role', 'button');
    fab.title = '单击上传 · 长按设置 · 拖动换位';
    fab.setAttribute('aria-label', '单击上传文件，长按进入设置，拖动调整位置');
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

    function updateSide() {
      const rect = wrap.getBoundingClientRect();
      const center = rect.left + rect.width / 2;
      wrap.dataset.side = center < window.innerWidth / 2 ? 'left' : 'right';
    }

    function setFabPosition(x, y, animate) {
      if (!animate) {
        wrap.style.transition = 'none';
      }
      wrap.style.right = 'auto';
      wrap.style.bottom = 'auto';
      wrap.style.left = x + 'px';
      wrap.style.top = y + 'px';
      if (!animate) {
        void wrap.offsetWidth;
        wrap.style.transition = '';
      }
    }

    (function initPosition() {
      const saved = readPos();
      const margin = getMargin();
      const maxX = window.innerWidth - wrap.offsetWidth - margin;
      const maxY = window.innerHeight - wrap.offsetHeight - margin;

      let x, y;
      if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
        x = Math.max(margin, Math.min(maxX, saved.x));
        y = Math.max(margin, Math.min(maxY, saved.y));
      } else {
        const rect = wrap.getBoundingClientRect();
        x = rect.left;
        y = rect.top;
      }
      setFabPosition(x, y, false);
      updateSide();
    })();

    const $ = (sel, root) => (root || panel).querySelector(sel);
    const panelOpen = () => panel.classList.contains('show');
    const importLabel = importBtn.querySelector('[data-import-label]');

    const pendingUrls = [];
    let focusBackEl = null;
    let closeTimer = null;

    let hiddenInput = null;

    function onHiddenChange() {
      const files = Array.from((hiddenInput && hiddenInput.files) || []);
      const savedFocus = focusBackEl;
      destroyHiddenInput();
      if (savedFocus && savedFocus.isConnected && isVisible(savedFocus)) {
        try { savedFocus.focus({ preventScroll: true }); } catch {}
      }
      focusBackEl = null;
      if (files.length > 0) handleFiles(files);
    }
    function destroyHiddenInput() {
      if (hiddenInput && hiddenInput.parentNode) {
        try { hiddenInput.parentNode.removeChild(hiddenInput); } catch {}
      }
      hiddenInput = null;
    }
    function createHiddenInput() {
      destroyHiddenInput();
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.className = 'r2-hidden-input';
      input.setAttribute('aria-hidden', 'true');
      input.setAttribute('tabindex', '-1');
      input.setAttribute('autocomplete', 'off');
      input.addEventListener('change', onHiddenChange);
      document.body.appendChild(input);
      hiddenInput = input;
      return input;
    }

    function onPanelKeydown(e) { if (e.key === 'Escape') closePanel(); }

    function openPanel() {
      if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }

      const cfg = readCfg() || {};
      panel.innerHTML = PANEL_HTML;

      const apiEl = panel.querySelector('[data-cfg="apiUrl"]');
      const userEl = panel.querySelector('[data-cfg="username"]');
      const passEl = panel.querySelector('[data-cfg="password"]');
      if (apiEl) apiEl.value = cfg.apiUrl || '';
      if (userEl) userEl.value = cfg.username || '';
      if (passEl) passEl.value = cfg.password || '';

      panel.querySelectorAll('[data-act]').forEach((el) => {
        el.addEventListener('click', (e) => {
          e.preventDefault(); e.stopPropagation();
          const act = el.dataset.act;
          if (act === 'close') closePanel();
          else if (act === 'save') saveSettings();
          else if (act === 'clearHistory') {
            writeHistory([]);
            toast('已清空记录', 'success');
          }
        });
      });

      panel.classList.add('show');
      document.addEventListener('keydown', onPanelKeydown);
    }

    function closePanel() {
      if (!panelOpen()) return;
      const ae = document.activeElement;
      if (ae && panel.contains(ae)) { try { ae.blur(); } catch {} }
      panel.classList.remove('show');
      document.removeEventListener('keydown', onPanelKeydown);
      if (closeTimer) clearTimeout(closeTimer);
      closeTimer = setTimeout(() => {
        closeTimer = null;
        if (!panelOpen()) panel.innerHTML = '';
      }, 400);
    }

    function saveSettings() {
      const apiUrl = (($('[data-cfg="apiUrl"]') || {}).value || '').trim();
      const username = (($('[data-cfg="username"]') || {}).value || '').trim();
      const password = (($('[data-cfg="password"]') || {}).value || '');

      if (!apiUrl) { toast('请填写图床地址', 'warning'); return; }
      if (!/^https?:\/\//i.test(apiUrl)) { toast('地址需要 http(s):// 开头', 'warning'); return; }

      writeCfg({ apiUrl, username, password });
      fab.classList.remove('r2-fab--attention');
      toast('设置已保存', 'success');
      closePanel();
    }

    document.addEventListener('focusin', (e) => {
      const el = e.target;
      if (!el) return;
      if (fabWrapRef && fabWrapRef.contains(el)) return;
      if (panel.contains(el)) return;
      if (el === hiddenInput) return;
      if (isEditable(el)) lastFocusedEditable = el;
    });

    function triggerFilePicker() {
      pendingUrls.length = 0;
      focusBackEl = pickTarget();
      const input = createHiddenInput();
      try { input.value = ''; } catch {}
      try { input.click(); } catch {}

      const cleanupOnce = () => {
        window.removeEventListener('focus', cleanupOnce, true);
        setTimeout(() => {
          if (hiddenInput === input) {
            destroyHiddenInput();
            focusBackEl = null;
          }
        }, 400);
      };
      window.addEventListener('focus', cleanupOnce, true);
    }

    bindFabInteract(wrap, fab, {
      onShort() {
        if (panelOpen()) { closePanel(); return; }
        if (!hasValidCfg()) {
          openPanel();
          toast('请先配置图床信息', 'warning');
          return;
        }
        hideImportBtn();
        triggerFilePicker();
      },
      onLong() { openPanel(); },
      onSideChange() { updateSide(); }
    });

    window.addEventListener('click', (e) => {
      if (!panelOpen()) return;
      if (panel.contains(e.target)) return;
      if (wrap.contains(e.target)) return;
      closePanel();
    });

    window.addEventListener('resize', () => {
      const rect = wrap.getBoundingClientRect();
      const margin = getMargin();
      const maxX = window.innerWidth - rect.width - margin;
      const maxY = window.innerHeight - rect.height - margin;
      const x = Math.max(margin, Math.min(maxX, rect.left));
      const y = Math.max(margin, Math.min(maxY, rect.top));
      if (x !== rect.left || y !== rect.top) {
        setFabPosition(x, y, false);
        writePos({ x: x, y: y });
      }
      updateSide();
    });

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
      e.preventDefault(); e.stopPropagation();
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

    async function handleFiles(files) {
      if (!hasValidCfg()) {
        toast('请先配置图床信息', 'warning');
        openPanel();
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

      let processed = 0, failed = 0;
      const total = queue.length;

      fab.classList.add('r2-fab--busy');

      const CONCURRENCY = 2;
      const workers = Array.from({ length: Math.min(CONCURRENCY, total) }, async () => {
        while (queue.length) {
          const file = queue.shift();
          try {
            const url = await uploadFile(file);
            processed++;
            pendingUrls.push(url);
            pushHistory(url);
          } catch (err) {
            processed++; failed++;
            console.error('[R2] 上传失败:', file.name, err);
            toast('上传失败：' + ((err && err.message) || '未知错误'), 'error');
          }
        }
      });

      await Promise.all(workers);

      fab.classList.remove('r2-fab--busy');

      if (pendingUrls.length > 0) {
        const okCount = pendingUrls.length;
        toast(okCount > 1 ? ('上传成功 ' + okCount + ' 个') : '上传成功', 'success');
        showImportBtn();
      }
    }
  }

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
