const CONTENT_TYPE_MAP = {
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'gif': 'image/gif',
  'webp': 'image/webp',
  'bmp': 'image/bmp',
  'svg': 'image/svg+xml',
  'tiff': 'image/tiff',
  'mp4': 'video/mp4',
  'avi': 'video/x-msvideo',
  'mov': 'video/quicktime',
  'webm': 'video/webm',
  'wmv': 'video/x-ms-wmv',
  'flv': 'video/x-flv',
  'mkv': 'video/x-matroska',
  'mp3': 'audio/mpeg',
  'wav': 'audio/wav',
  'ogg': 'audio/ogg',
  'flac': 'audio/flac',
  'aac': 'audio/aac',
  'm4a': 'audio/mp4',
  'wma': 'audio/x-ms-wma',
  'opus': 'audio/opus'
};

const ALLOWED_EXTENSIONS = new Set(Object.keys(CONTENT_TYPE_MAP));

const CACHE_CONFIG = {
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
    enableAuth: env.ENABLE_AUTH === 'true',
    r2Bucket: env.SB,
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
    headers: { 'Content-Type': 'application/json' }
  });
}

function unauthorizedResponse() {
  return new Response('Unauthorized', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Admin"' }
  });
}

function getFileExtension(url) {
  return url.split('.').pop().toLowerCase();
}

function getContentType(extension) {
  return CONTENT_TYPE_MAP[extension] || 'application/octet-stream';
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const config = extractConfig(env);
    switch (pathname) {
      case '/':
        return await handleRootRequest(request, config);
      case `/${config.adminPath}`:
        return await handleAdminRequest(request, config);
      case '/upload':
        return request.method === 'POST'
          ? await handleUploadRequest(request, config)
          : new Response('Method Not Allowed', { status: 405 });
      case '/delete-images':
        return await handleDeleteImagesRequest(request, config);
      default:
        return await handleImageRequest(request, config);
    }
  }
};

function authenticate(request, username, password) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Basic ')) return false;
  try {
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = atob(base64Credentials).split(':');
    return credentials[0] === username && credentials[1] === password;
  } catch {
    return false;
  }
}

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
  <meta name="description" content="Media-FishByte | 基于CloudFlare的图床服务">
  <meta name="keywords" content="Media-FishByte,Workers,R2储存, Cloudflare,图床">
  <title>Media-FishByte | 基于CloudFlare的图床服务</title>
  <link rel="icon" href="https://p1.meituan.net/csc/c195ee91001e783f39f41ffffbbcbd484286.ico" type="image/x-icon">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/twitter-bootstrap/4.6.1/css/bootstrap.min.css" integrity="sha512-T584yQ/tdRR5QwOpfvDfVQUidzfgc2339Lc8uBDtcp/wYu80d7jwBgAxbyMh0a9YM9F8N3tdErpFI8iaGx6x5g==" crossorigin="anonymous" referrerpolicy="no-referrer" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/bootstrap-fileinput/5.2.7/css/fileinput.min.css" integrity="sha512-qPjB0hQKYTx1Za9Xip5h0PXcxaR1cRbHuZHo9z+gb5IgM6ZOTtIH4QLITCxcCp/8RMXtw2Z85MIZLv6LfGTLiw==" crossorigin="anonymous" referrerpolicy="no-referrer" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/toastr.js/2.1.4/toastr.min.css" integrity="sha512-6S2HWzVFxruDlZxI3sXOZZ4/eJ8AcxkQH1+JjSe/ONCEqR9L4Ysq5JdT5ipqtzU7WHalNwzwBv+iE51gNHJNqQ==" crossorigin="anonymous" referrerpolicy="no-referrer" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css" integrity="sha512-1ycn6IcaQQ40/MKBW2W4Rhis/DbILU74C1vSrLJxCq57o941Ym01SwNsOMqvEBFlcgUa6xLiPY/NS5R+E6ztJQ==" crossorigin="anonymous" referrerpolicy="no-referrer" />
  <style>
      body {
          margin: 0;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          position: relative;
      }
      .card {
          background-color: rgba(255, 255, 255, 0.9);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border: none;
          border-radius: 16px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
          padding: 30px;
          width: 90%;
          max-width: 480px;
          text-align: center;
          margin: 0 auto;
          position: relative;
      }
      .title {
          font-size: 28px;
          font-weight: 700;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin-bottom: 20px;
          letter-spacing: 0.5px;
      }
      .uniform-height {
          margin-top: 20px;
      }
      .btn-group-spacing {
          margin-bottom: 30px;
      }
      #viewCacheBtn {
          position: absolute;
          top: 15px;
          right: 15px;
          background: none;
          border: none;
          color: rgba(102, 126, 234, 0.5);
          cursor: pointer;
          font-size: 22px;
          transition: all 0.3s ease;
      }
      #viewCacheBtn:hover {
          color: #667eea;
          transform: scale(1.1);
      }
      #cacheContent {
          margin-top: 20px;
          max-height: 250px;
          border-radius: 8px;
          overflow-y: auto;
      }
      .cache-title {
          text-align: left;
          margin-bottom: 10px;
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
          background: white;
          border: 1px solid rgba(102, 126, 234, 0.1);
          gap: 10px;
      }
      .cache-item:hover {
          background-color: rgba(102, 126, 234, 0.05);
          border-color: rgba(102, 126, 234, 0.3);
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
      .cache-ext-video { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); }
      .cache-ext-audio { background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); }
      .cache-ext-other { background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%); color: #666; }
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
          color: #333;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
      }
      .cache-url {
          font-size: 11px;
          color: #999;
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
          background: rgba(102, 126, 234, 0.1);
          color: #667eea;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
      }
      .cache-copy:hover {
          background: #667eea;
          color: white;
      }
      .cache-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          font-size: 14px;
          font-weight: 500;
          color: #555;
      }
      .cache-clear-all {
          background: none;
          border: none;
          color: #e74c3c;
          cursor: pointer;
          font-size: 13px;
          padding: 4px 8px;
          border-radius: 4px;
          transition: all 0.2s ease;
      }
      .cache-clear-all:hover {
          background: rgba(231, 76, 60, 0.1);
      }
      .upload-hint {
          color: #999;
          font-size: 14px;
          margin: 15px 0 20px 0;
          line-height: 1.6;
      }
      .upload-hint i {
          color: #667eea;
          margin-right: 5px;
      }
      .project-link {
          font-size: 14px;
          text-align: center;
          margin-top: 15px;
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
      textarea.form-control {
          max-height: 200px;
          overflow-y: hidden;
          resize: none;
      }
      .file-input-container {
          margin-bottom: 30px !important;
      }
      #fileLink-group.form-group {
          margin: 30px 0 25px 0 !important;
      }
      .input-group-append {
          margin-left: 12px !important;
      }
      .file-caption-name {
          padding-left: 10px !important;
      }
      .fileinput-remove-button {
          margin-right: 12px !important;
      }
      .upload-progress {
          display: none;
          margin-top: 15px;
          text-align: center;
      }
      .progress-text {
          font-size: 14px;
          font-weight: 500;
          color: #667eea;
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
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
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
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          font-size: 24px;
      }
      .btn-primary {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
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
          border: 2px dashed #667eea !important;
          border-radius: 12px !important;
          background: rgba(102, 126, 234, 0.05) !important;
          transition: all 0.3s ease !important;
      }
      .file-drop-zone:hover {
          border-color: #764ba2 !important;
          background: rgba(102, 126, 234, 0.1) !important;
      }
      .file-drop-zone-title {
          color: #667eea !important;
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
          #viewCacheBtn {
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
  </style>
</head>
<body>
      <div class="card">
      <div class="title">Media-FishByte</div>
      <button type="button" class="btn" id="viewCacheBtn" title="查看历史记录"><i class="fas fa-clock"></i></button>
      <div class="card-body">
          <form id="uploadForm" action="/upload" method="post" enctype="multipart/form-data">
              <div class="file-input-container">
                  <input id="fileInput" name="file" type="file" class="form-control-file" data-browse-on-zone-click="true" multiple accept="image/*,video/*,audio/*">
              </div>
              <div class="upload-hint">
                  <i class="fas fa-info-circle"></i>支持批量上传、拖拽上传、粘贴上传
              </div>
              <div id="fileLink-group" class="form-group mb-3 uniform-height" style="display: none;">
                  <textarea class="form-control" id="fileLink" readonly></textarea>
              </div>
              <div class="form-group mb-3 uniform-height btn-group-spacing" style="display: none;">
                  <button type="button" class="btn btn-light" id="urlBtn">复制链接</button>
              </div>
              <div class="upload-progress" id="uploadProgress">
                  <div class="progress-text" id="progressText">上传中... 0%</div>
              </div>
              <div class="thumbnail-container" id="thumbnailContainer"></div>
              <div id="cacheContent" style="display: none;"></div>
          </form>
      </div>
      <p class="project-link">项目参考来源 - <a href="https://github.com/0-RTT/JSimages" target="_blank" rel="noopener noreferrer">0-RTT/JSimages</a></p>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js" integrity="sha512-894YE6QWD5I59HgZOGReFYm4dnWc1Qt5NtvYSaNcOP+u1T9qYdvdihz0PPSiiqn/+/3e7Jo4EaG7TubfWGUrMQ==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/bootstrap-fileinput/5.2.7/js/fileinput.min.js" integrity="sha512-CCLv901EuJXf3k0OrE5qix8s2HaCDpjeBERR2wVHUwzEIc7jfiK9wqJFssyMOc1lJ/KvYKsDenzxbDTAQ4nh1w==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/bootstrap-fileinput/5.2.7/js/locales/zh.min.js" integrity="sha512-IizKWmZY3aznnbFx/Gj8ybkRyKk7wm+d7MKmEgOMRQDN1D1wmnDRupfXn6X04pwIyKFWsmFVgrcl0j6W3Z5FDQ==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/toastr.js/2.1.4/toastr.min.js" integrity="sha512-lbwH47l/tPXJYG9AcFNoJaTMhGvYWhVM9YI43CT+uteTRRaiLCui8snIgyAN8XWgNjNhCqlAUdzZptso6OCoFQ==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
      <script>
      function formatLinks(urls, format) {
        switch (format) {
          case 'url':
            return urls.join('\\n\\n');
          case 'markdown':
            return urls.map(url => '![image](' + url + ')').join('\\n\\n');
          default:
            return urls.join('\\n');
        }
      }
      const ALLOWED_EXTENSIONS = ['jpg','jpeg','png','gif','webp','bmp','svg','tiff','mp4','avi','mov','webm','wmv','flv','mkv','mp3','wav','ogg','flac','aac','m4a','wma','opus'];
      function isAllowedFile(file) {
        const ext = file.name.split('.').pop().toLowerCase();
        return ALLOWED_EXTENSIONS.includes(ext);
      }


    
      $(document).ready(function() {
        toastr.options.timeOut = 3000;
        toastr.options.progressBar = true;
        let originalImageURLs = [];
        let thumbnailData = [];
        let isCacheVisible = false;
        let resettingUnsupported = false;
        initFileInput();

        function initFileInput() {
          $("#fileInput").fileinput({
            theme: 'fa',
            language: 'zh',
            browseClass: "btn btn-primary",
            removeClass: "btn btn-danger",
            showUpload: false,
            showPreview: false,
            browseLabel: "选择",
            msgPlaceholder: "点击右侧按钮上传媒体文件",
            msgSelected: "选中 {n} 个文件"
          }).on('fileinitialized', function() {
            $(this).closest('.file-input').find('input[type="file"]').attr('accept', 'image/*,video/*,audio/*');
          }).on('filebatchselected', handleFileSelection)
            .on('fileclear', handleFileClear);
        }

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
            toastr.warning('不支持的文件类型: ' + rejectedFiles.join(', '));
          }
          if (rejectedFiles.length > 0 && allowedFiles.length === 0) {
            setTimeout(() => {
              resettingUnsupported = true;
              $('#fileInput').fileinput('clear');
            }, 0);
            return;
          }
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
                toastr.info('已从缓存中读取数据');
            }
        }

        function addThumbnailFromCache(fileName, url) {
            const container = $('#thumbnailContainer');
            const index = thumbnailData.length;
            const type = getCacheType(fileName);
            thumbnailData.push({ previewUrl: url, url, file: null });

            let thumbnailContent = '';
            if (type === 'image') {
                thumbnailContent = '<span style="display:block;width:100%;height:100%;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);position:relative;overflow:hidden">' +
                    '<i class="fas fa-image" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:rgba(255,255,255,0.4);font-size:24px"></i>' +
                    '<img src="' + url + '" alt="thumbnail" loading="lazy" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:1" onerror="this.style.display=\\'none\\'">' +
                    '</span>';
            } else if (type === 'video') {
                thumbnailContent = '<span style="display:block;width:100%;height:100%;background:linear-gradient(135deg,#f093fb 0%,#f5576c 100%);position:relative;overflow:hidden">' +
                    '<i class="fas fa-play-circle" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:rgba(255,255,255,0.4);font-size:24px"></i>' +
                    '<video src="' + url + '" muted playsinline preload="metadata" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:1" onerror="this.style.display=\\'none\\'"></video>' +
                    '</span>';
            } else if (type === 'audio') {
                thumbnailContent = '<div class="file-icon"><i class="fas fa-music"></i></div>';
            } else {
                const ext = fileName.split('.').pop().toUpperCase();
                thumbnailContent = '<div class="file-icon">' + ext + '</div>';
            }

            const thumbnailHtml = '<div class="thumbnail-item" data-index="' + index + '">' +
                thumbnailContent +
            '</div>';

            container.append(thumbnailHtml);
        }

        function updateFileLinkDisplay() {
            $('#fileLink').val(originalImageURLs.join('\\n'));
            $('.form-group').show();
            adjustTextareaHeight($('#fileLink')[0]);
        }

        function addThumbnail(file, url) {
            const container = $('#thumbnailContainer');
            const index = thumbnailData.length;
            const previewUrl = URL.createObjectURL(file);
            thumbnailData.push({ previewUrl, url, file });

            let thumbnailContent = '';
            if (file.type.startsWith('image/')) {
                thumbnailContent = '<span style="display:block;width:100%;height:100%;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);position:relative;overflow:hidden">' +
                    '<i class="fas fa-image" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:rgba(255,255,255,0.4);font-size:24px"></i>' +
                    '<img src="' + previewUrl + '" alt="thumbnail" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:1" onerror="this.style.display=\\'none\\'">' +
                    '</span>';
            } else if (file.type.startsWith('video/')) {
                thumbnailContent = '<span style="display:block;width:100%;height:100%;background:linear-gradient(135deg,#f093fb 0%,#f5576c 100%);position:relative;overflow:hidden">' +
                    '<i class="fas fa-play-circle" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:rgba(255,255,255,0.4);font-size:24px"></i>' +
                    '<video src="' + previewUrl + '" muted playsinline preload="metadata" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:1" onerror="this.style.display=\\'none\\'"></video>' +
                    '</span>';
            } else if (file.type.startsWith('audio/')) {
                thumbnailContent = '<div class="file-icon"><i class="fas fa-music"></i></div>';
            } else {
                const ext = file.name.split('.').pop().toUpperCase();
                thumbnailContent = '<div class="file-icon">' + ext + '</div>';
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

        function isFileInCache(fileHash) {
          const cacheData = JSON.parse(localStorage.getItem('uploadCache')) || [];
          return cacheData.some(item => item.hash === fileHash);
        }
    
        async function uploadFile(file, fileHash) {
          try {
            const formData = new FormData();
            formData.append('file', file, file.name);
            $('#uploadProgress').show();
            $('#progressText').text('上传中... 0%');
            const xhr = new XMLHttpRequest();
            xhr.upload.addEventListener('progress', (e) => {
              if (e.lengthComputable) {
                const percentComplete = Math.round((e.loaded / e.total) * 100);
                $('#progressText').text('上传中... ' + percentComplete + '%');
              }
            });

            const uploadPromise = new Promise((resolve, reject) => {
              xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                  try {
                    resolve(JSON.parse(xhr.responseText));
                  } catch (e) {
                    reject(new Error('响应解析失败'));
                  }
                } else {
                  try {
                    const errorData = JSON.parse(xhr.responseText);
                    reject(new Error(errorData.error || '上传失败'));
                  } catch (e) {
                    reject(new Error('上传失败: HTTP ' + xhr.status));
                  }
                }
              };
              xhr.onerror = () => reject(new Error('网络错误，请检查网络连接'));
              xhr.ontimeout = () => reject(new Error('上传超时，请重试'));
              xhr.open('POST', '/upload');
              xhr.timeout = 120000;
              xhr.send(formData);
            });

            const responseData = await uploadPromise;
            $('#uploadProgress').hide();
            if (responseData.error) {
              toastr.error(responseData.error);
            } else {
              originalImageURLs.push(responseData.data);
              addThumbnail(file, responseData.data);
              $('#fileLink').val(originalImageURLs.join('\\n'));
              $('.form-group').show();
              adjustTextareaHeight($('#fileLink')[0]);
              toastr.success('上传成功！请自行复制链接');
              saveToLocalCache(responseData.data, file.name, fileHash);
            }
          } catch (error) {
            console.error('处理文件时出现错误:', error);
            $('#uploadProgress').hide();
            let errorMsg = '文件处理失败';
            if (error.message.includes('网络')) {
              errorMsg = '网络错误，请检查网络连接';
            } else if (error.message.includes('超时')) {
              errorMsg = '上传超时，请重试';
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
                  toastr.warning('不支持的文件类型: ' + pasteFile.name);
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

        const $card = $('.card');
        $card.on('dragover', function(e) {
          e.preventDefault();
          e.stopPropagation();
          $(this).css('background-color', 'rgba(255, 255, 255, 0.95)');
        });

        $card.on('dragleave', function(e) {
          e.preventDefault();
          e.stopPropagation();
          $(this).css('background-color', 'rgba(255, 255, 255, 0.9)');
        });

        $card.on('drop', function(e) {
          e.preventDefault();
          e.stopPropagation();
          $(this).css('background-color', 'rgba(255, 255, 255, 0.9)');
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
              toastr.warning('不支持的文件类型: ' + rejected.join(', '));
            }
            if (dataTransfer.files.length > 0) {
              $('#fileInput')[0].files = dataTransfer.files;
              $('#fileInput').trigger('change');
            }
          }
        });
    
        $('#urlBtn').on('click', function() {
          const fileLinks = originalImageURLs.map(url => url.trim()).filter(url => url !== '');
          if (fileLinks.length > 0) {
            const formattedLinks = fileLinks.join('\\n');
            $('#fileLink').val(formattedLinks);
            adjustTextareaHeight($('#fileLink')[0]);
            copyToClipboardWithToastr(formattedLinks);
          }
        });
    
        function handleFileClear(event) {
          if (resettingUnsupported) {
            resettingUnsupported = false;
            return;
          }
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
              toastr.success('已复制到剪贴板');
            }).catch(() => {
              toastr.error('复制失败');
            });
          } else {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            try {
              document.execCommand('copy');
              toastr.success('已复制到剪贴板');
            } catch (err) {
              toastr.error('复制失败');
            }
            document.body.removeChild(textarea);
          }
        }

        function hideButtonsAndTextarea() {
          $('#urlBtn, #fileLink').parent('.form-group').hide();
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
          if (['jpg','jpeg','png','gif','webp','bmp','svg','ico'].includes(ext)) return 'image';
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
            $('#fileLink').val('');
            $('#fileLink').parent('.form-group').hide();
            isCacheVisible = false;
          } else {
            if (cacheData.length > 0) {
              let html = '<div class="cache-header"><span>最近上传记录 <small style="font-weight:400;color:#999;font-size:10px">显示10条</small></span><button class="cache-clear-all" type="button">清除全部</button></div>';
              html += cacheData.map((item) => {
                const type = getCacheType(item.fileName);
                const truncatedUrl = item.url.length > 50 ? item.url.substring(0, 50) + '...' : item.url;
                let leftHtml;
                if (type === 'image') {
                  leftHtml = '<span class="cache-ext" style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);position:relative;overflow:hidden">' +
                    '<i class="fas fa-image"></i>' +
                    '<img class="cache-thumb" src="' + item.url + '" alt="" loading="lazy" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:1" onerror="this.style.display=\\'none\\'">' +
                    '</span>';
                } else if (type === 'video') {
                  leftHtml = '<span class="cache-ext cache-ext-video" style="position:relative;overflow:hidden">' +
                    '<i class="fas fa-play-circle"></i>' +
                    '<video class="cache-thumb" src="' + item.url + '" preload="metadata" muted style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:1" onerror="this.style.display=\\'none\\'"></video>' +
                    '</span>';
                } else if (type === 'audio') {
                  leftHtml = '<span class="cache-ext cache-ext-audio"><i class="fas fa-music"></i></span>';
                } else {
                  leftHtml = '<span class="cache-ext" style="background:linear-gradient(135deg,#a8a8a8 0%,#c9c9c9 100%)"><i class="fas fa-file"></i></span>';
                }
                return '<div class="cache-item" data-url="' + item.url + '">' +
                  leftHtml +
                  '<div class="cache-info">' +
                    '<div class="cache-name">' + item.fileName + '</div>' +
                    '<div class="cache-url" title="' + item.url + '">' + truncatedUrl + '</div>' +
                  '</div>' +
                  '<button class="cache-copy" type="button" title="复制URL"><i class="fas fa-copy"></i></button>' +
                '</div>';
              }).join('');
              cacheContent.html(html).show();
            } else {
              cacheContent.html('<div style="text-align:center;color:#999;padding:20px;">还没有记录哦！</div>').show();
            }
            isCacheVisible = true;
          }
        });

        $(document).on('click', '.cache-item', function(e) {
          if ($(e.target).closest('.cache-copy').length) return;
        });

        $(document).on('click', '.cache-copy', function(e) {
          e.preventDefault();
          e.stopPropagation();
          const url = $(this).closest('.cache-item').data('url');
          copyToClipboardWithToastr(url);
        });

        $(document).on('click', '.cache-clear-all', function(e) {
          e.preventDefault();
          if (!confirm('确定要清除全部历史记录吗？')) return;
          localStorage.removeItem('uploadCache');
          $('#cacheContent').hide();
          isCacheVisible = false;
        });
      });
    </script>
</body>
</html>  
`, 'text/html;charset=UTF-8', CACHE_CONFIG.HTML);
  await cache.put(cacheKey, response.clone());
  return response;
}

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
    const fileExtension = url.split('.').pop().toLowerCase();
    const timestamp = url.split('/').pop().split('.')[0];
    const mediaType = escapeHtml(fileExtension);
    const escapedUrl = escapeHtml(url);
    const supportedImageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'svg'];
    const supportedVideoExtensions = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'mkv', 'webm'];
    const supportedAudioExtensions = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus'];
    const isSupported = [...supportedImageExtensions, ...supportedVideoExtensions, ...supportedAudioExtensions].includes(fileExtension);
    const backgroundStyle = isSupported ? '' : `style="font-size: 50px; display: flex; justify-content: center; align-items: center;"`;
    const icon = isSupported ? '' : '📁';
    return `
    <div class="media-container" data-key="${escapedUrl}" onclick="toggleImageSelection(this)" ${backgroundStyle}>
      <div class="skeleton"></div>
      <div class="media-type">${mediaType}</div>
      ${supportedVideoExtensions.includes(fileExtension) ? `
        <video class="gallery-video" preload="none" controls>
          <source data-src="${escapedUrl}" type="video/${escapeHtml(fileExtension)}">
          您的浏览器不支持视频标签。
        </video>
      ` : supportedAudioExtensions.includes(fileExtension) ? `
        <audio class="gallery-audio" preload="none" controls>
          <source data-src="${escapedUrl}" type="audio/${escapeHtml(fileExtension)}">
          您的浏览器不支持音频标签。
        </audio>
      ` : `
        ${isSupported ? `<img class="gallery-image lazy" data-src="${escapedUrl}" alt="Image">` : icon}
      `}
      <div class="upload-time">上传时间: ${escapeHtml(new Date(parseInt(timestamp)).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }))}</div>
    </div>
    `;
  }).join('');
  
  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <title>图库</title>
    <link rel="icon" href="https://p1.meituan.net/csc/c195ee91001e783f39f41ffffbbcbd484286.ico" type="image/x-icon">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
      * {
        box-sizing: border-box;
      }
      body {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        background: linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 100%);
        min-height: 100vh;
        margin: 0;
        padding: 20px;
      }
      .page-title {
        font-size: 32px;
        font-weight: 700;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
        background: rgba(255, 255, 255, 0.85);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        z-index: 1000;
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
        padding: 15px 20px;
        box-shadow: 0 4px 20px rgba(102, 126, 234, 0.15);
        border-radius: 16px;
        border: 1px solid rgba(255, 255, 255, 0.6);
        flex-wrap: wrap;
      }
      .header-left {
        flex: 1;
        display: flex;
        gap: 15px;
        align-items: center;
        color: #555;
        font-weight: 500;
      }
      .header-right {
        display: flex;
        gap: 10px;
        justify-content: flex-end;
        flex: 1;
        flex-wrap: wrap;
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
        background: rgba(255, 255, 255, 0.9);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.6);
        aspect-ratio: 1 / 1;
        transition: all 0.3s ease;
        cursor: pointer;
      }
      .media-container:hover {
        transform: translateY(-4px);
        box-shadow: 0 8px 25px rgba(102, 126, 234, 0.2);
        border-color: rgba(102, 126, 234, 0.3);
      }
      .media-container.selected {
        border: 2px solid #667eea;
        background: rgba(102, 126, 234, 0.1);
        box-shadow: 0 0 20px rgba(102, 126, 234, 0.3);
      }
      .media-type {
        position: absolute;
        top: 10px;
        left: 10px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
        bottom: 10px;
        left: 10px;
        right: 10px;
        background: rgba(255, 255, 255, 0.9);
        backdrop-filter: blur(4px);
        padding: 8px 10px;
        border-radius: 8px;
        color: #555;
        font-size: 12px;
        z-index: 10;
        display: none;
      }
      .gallery-image, .gallery-video {
        width: 100%;
        height: 100%;
        object-fit: contain;
        transition: opacity 0.4s ease;
        opacity: 0;
      }
      .gallery-image.loaded, .gallery-video.loaded {
        opacity: 1;
      }
      .skeleton {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
        background-size: 200% 100%;
        animation: shimmer 1.5s infinite;
        border-radius: 16px;
      }
      @keyframes shimmer {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }
      .skeleton.hidden {
        display: none;
      }
      .footer {
        margin-top: 30px;
        text-align: center;
        font-size: 16px;
        color: #999;
        padding: 20px;
        background: rgba(255, 255, 255, 0.6);
        border-radius: 12px;
        backdrop-filter: blur(8px);
      }
      .delete-button, .copy-button {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        border-radius: 10px;
        padding: 10px 20px;
        cursor: pointer;
        transition: all 0.3s ease;
        width: auto;
        font-weight: 500;
        box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
      }
      .delete-button:hover, .copy-button:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
      }
      .delete-button:active, .copy-button:active {
        transform: translateY(0);
      }
      .hidden {
        display: none;
      }
      .dropdown {
        position: relative;
        display: inline-block;
      }
      .dropdown-content {
        display: none;
        position: absolute;
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(12px);
        min-width: 140px;
        box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
        z-index: 1001;
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.6);
        overflow: hidden;
        right: 0;
      }
      .dropdown-content button {
        color: #333;
        padding: 12px 16px;
        text-decoration: none;
        display: block;
        background: none;
        border: none;
        width: 100%;
        text-align: left;
        font-size: 14px;
        transition: all 0.2s ease;
        cursor: pointer;
      }
      .dropdown-content button:hover {
        background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%);
        color: #667eea;
      }
      .dropdown:hover .dropdown-content {
        display: block;
      }
      .pagination {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 12px;
        margin: 25px 0;
        flex-wrap: wrap;
        padding: 15px;
        background: rgba(255, 255, 255, 0.6);
        border-radius: 16px;
        backdrop-filter: blur(8px);
      }
      .pagination button {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        border-radius: 10px;
        padding: 10px 24px;
        cursor: pointer;
        transition: all 0.3s ease;
        font-weight: 500;
        box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
      }
      .pagination button:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
      }
      .pagination button:disabled {
        background: linear-gradient(135deg, #ccc 0%, #aaa 100%);
        cursor: not-allowed;
        box-shadow: none;
      }
      .pagination .page-info {
        color: #555;
        font-weight: 500;
        padding: 0 15px;
      }
      .empty-state {
        text-align: center;
        padding: 80px 20px;
        color: #999;
        font-size: 18px;
        background: rgba(255, 255, 255, 0.6);
        border-radius: 16px;
        backdrop-filter: blur(8px);
      }
      .empty-state i {
        font-size: 72px;
        margin-bottom: 20px;
        display: block;
        opacity: 0.4;
      }
      @media (max-width: 768px) {
        body {
          padding: 15px;
        }
        .page-title {
          font-size: 24px;
          margin-bottom: 15px;
        }
        .header {
          top: 5px;
          padding: 12px 15px;
          border-radius: 12px;
        }
        .header-left, .header-right {
          flex: 1 1 100%;
          justify-content: flex-start;
        }
        .header-left {
          font-size: 14px;
        }
        .header-right {
          margin-top: 10px;
        }
        .gallery {
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }
        .media-container {
          border-radius: 12px;
        }
        .delete-button, .copy-button {
          padding: 8px 16px;
          font-size: 14px;
          min-height: 44px;
          border-radius: 8px;
        }
        .pagination {
          padding: 12px;
          border-radius: 12px;
        }
        .pagination button {
          padding: 8px 16px;
          font-size: 14px;
        }
        .pagination .page-info {
          font-size: 14px;
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
      const uploadTime = container.querySelector('.upload-time');
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
      const deleteButton = document.getElementById('delete-button');
      const countDisplay = document.getElementById('selected-count');
      countDisplay.textContent = selectedCount;
      const headerRight = document.querySelector('.header-right');
      if (selectedCount > 0) {
        headerRight.classList.remove('hidden');
      } else {
        headerRight.classList.add('hidden');
      }
    }
  
    async function deleteSelectedImages() {
      if (selectedKeys.size === 0) return;
      const confirmation = confirm('你确定要删除选中的媒体文件吗？此操作无法撤回。');
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
        // 局部更新 DOM，添加淡出动画
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

        // 等待动画完成后移除元素
        setTimeout(() => {
          containersToRemove.forEach(container => container.remove());

          // 更新媒体文件总数
          const totalCountElement = document.querySelector('.header-left span:first-child');
          const currentTotal = parseInt(totalCountElement.textContent.match(/\d+/)[0]);
          const newTotal = currentTotal - keysToDelete.length;
          totalCountElement.textContent = '媒体文件 ' + newTotal + ' 个';

          // 更新分页信息
          const pageInfo = document.querySelector('.page-info');
          if (pageInfo) {
            const match = pageInfo.textContent.match(/共 (\d+) 个/);
            if (match) {
              pageInfo.textContent = pageInfo.textContent.replace(/共 \d+ 个/, '共 ' + newTotal + ' 个');
            }
          }

          // 重置选择状态
          selectedKeys.clear();
          selectedCount = 0;
          isAllSelected = false;
          updateDeleteButton();

          alert('选中的媒体已删除');
        }, 300);
      } else {
        alert('删除失败');
      }
    }
  
    function copyFormattedLinks(format) {
      const urls = Array.from(selectedKeys).map(url => url.trim()).filter(url => url !== '');
      const formattedLinks = formatLinks(urls, format);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(formattedLinks).then(() => {
          alert('复制成功');
        }).catch(() => {
          alert('复制失败');
        });
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = formattedLinks;
        document.body.appendChild(textarea);
        textarea.select();
        try {
          document.execCommand('copy');
          alert('复制成功');
        } catch (err) {
          alert('复制失败');
        }
        document.body.removeChild(textarea);
      }
    }

    function formatLinks(urls, format) {
      switch (format) {
        case 'url':
          return urls.join('\\n\\n');
        case 'markdown':
          return urls.map(url => '![image](' + url + ')').join('\\n\\n');
        default:
          return urls.join('\\n');
      }
    }

    function selectAllImages() {
      const mediaContainers = Array.from(document.querySelectorAll('.media-container'));
      const batchSize = 20;
      let index = 0;

      function processBatch() {
        const end = Math.min(index + batchSize, mediaContainers.length);

        for (let i = index; i < end; i++) {
          const container = mediaContainers[i];
          if (isAllSelected) {
            container.classList.remove('selected');
            const key = container.getAttribute('data-key');
            selectedKeys.delete(key);
            container.querySelector('.upload-time').style.display = 'none';
          } else {
            if (!container.classList.contains('selected')) {
              container.classList.add('selected');
              const key = container.getAttribute('data-key');
              selectedKeys.add(key);
              container.querySelector('.upload-time').style.display = 'block';
            }
          }
        }

        index = end;

        if (index < mediaContainers.length) {
          requestAnimationFrame(processBatch);
        } else {
          if (isAllSelected) {
            selectedCount = 0;
          } else {
            selectedCount = selectedKeys.size;
          }
          isAllSelected = !isAllSelected;
          updateDeleteButton();
        }
      }

      requestAnimationFrame(processBatch);
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
            const skeleton = container.querySelector('.skeleton');
            const video = container.querySelector('video');
            const audio = container.querySelector('audio');
            if (video) {
              const source = video.querySelector('source');
              if (source && source.dataset.src) {
                video.src = source.dataset.src;
                video.load();
                video.onloadeddata = () => {
                  video.classList.add('loaded');
                  if (skeleton) skeleton.classList.add('hidden');
                };
              }
            } else if (audio) {
              const source = audio.querySelector('source');
              if (source && source.dataset.src) {
                audio.src = source.dataset.src;
                audio.load();
                audio.onloadeddata = () => {
                  audio.classList.add('loaded');
                  if (skeleton) skeleton.classList.add('hidden');
                };
              }
            } else {
              const img = container.querySelector('img');
              if (img && img.dataset.src && !img.src) {
                img.src = img.dataset.src;
                img.onload = () => {
                  img.classList.add('loaded');
                  if (skeleton) skeleton.classList.add('hidden');
                };
                img.onerror = () => {
                  if (skeleton) skeleton.classList.add('hidden');
                };
              } else if (!img) {
                if (skeleton) skeleton.classList.add('hidden');
              }
            }
            observer.unobserve(container);
          }
        });
      }, options);

      mediaContainers.forEach(container => {
        mediaObserver.observe(container);
      });
    });
  </script>
  </head>
  <body>
    <h1 class="page-title">图库管理</h1>
    <div class="header">
      <div class="header-left">
        <span>媒体文件 ${totalCount.count} 个</span>
        <span>已选中: <span id="selected-count">0</span>个</span>
      </div>
      <div class="header-right hidden">
        <div class="dropdown">
          <button class="copy-button">复制</button>
          <div class="dropdown-content">
            <button onclick="copyFormattedLinks('url')">URL</button>
            <button onclick="copyFormattedLinks('markdown')">Markdown</button>
          </div>
        </div>
        <button id="select-all-button" class="delete-button" onclick="selectAllImages()">全选</button>
        <button id="delete-button" class="delete-button" onclick="deleteSelectedImages()">删除</button>
      </div>
    </div>
    <div class="gallery">
      ${mediaData.length === 0 ? '<div class="empty-state"><i>📁</i><div>暂无媒体文件</div></div>' : mediaHtml}
    </div>
    ${mediaData.length > 0 ? `
    <div class="pagination">
      <button onclick="goToPage(${page - 1})" ${page <= 1 ? 'disabled' : ''}>上一页</button>
      <span class="page-info">第 ${page} / ${totalPages} 页 (共 ${totalCount.count} 个)</span>
      <button onclick="goToPage(${page + 1})" ${page >= totalPages ? 'disabled' : ''}>下一页</button>
    </div>
    ` : ''}
    <div class="footer">
      到底啦
    </div>
    <script>
      function goToPage(pageNum) {
        const url = new URL(window.location.href);
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
  if (limit !== null) {
    query += ` LIMIT ${limit} OFFSET ${offset}`;
  }
  const result = await DATABASE.prepare(query).all();
  return result.results.map(row => ({ url: row.url }));
}

async function handleUploadRequest(request, config) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file) throw new Error('缺少文件');
    const fileExtension = getFileExtension(file.name);
    if (!ALLOWED_EXTENSIONS.has(fileExtension)) {
      return jsonResponse({ error: `不支持的文件类型: .${fileExtension}` }, 400);
    }
    if (file.size > config.maxSize) {
      return jsonResponse({ error: `文件大小超过${config.maxSize / (1024 * 1024)}MB限制` }, 413);
    }
    if (config.enableAuth && !authenticate(request, config.username, config.password)) {
      return unauthorizedResponse();
    }
    const contentType = getContentType(fileExtension);
    const typePrefix = contentType.startsWith('image/') ? 'image' : contentType.startsWith('video/') ? 'video' : contentType.startsWith('audio/') ? 'audio' : 'other';
    const r2Key = `${typePrefix}_${Date.now()}`;
    await config.r2Bucket.put(r2Key, file.stream(), {
      httpMetadata: { contentType: file.type }
    });
    const imageURL = `https://${config.domain}/${r2Key}.${fileExtension}`;
    await config.database.prepare('INSERT INTO media (url) VALUES (?) ON CONFLICT(url) DO NOTHING').bind(imageURL).run();
    return jsonResponse({ data: imageURL });
  } catch (error) {
    console.error('R2 上传错误:', error);
    return jsonResponse({ error: error.message }, 500);
  }
}

async function handleImageRequest(request, config) {
  const requestedUrl = request.url;
  const cache = caches.default;
  const cacheKey = new Request(requestedUrl);
  const cachedResponse = await cache.match(cacheKey);
  if (cachedResponse) return cachedResponse;
  const result = await config.database.prepare('SELECT url FROM media WHERE url = ?').bind(requestedUrl).first();
  if (!result) {
    const notFoundResponse = new Response('资源不存在', { status: 404 });
    await cache.put(cacheKey, notFoundResponse.clone());
    return notFoundResponse;
  }
  const urlParts = requestedUrl.split('/');
  const fileName = urlParts[urlParts.length - 1];
  const [r2Key, fileExtension] = fileName.split('.');
  const object = await config.r2Bucket.get(r2Key);
  if (!object) {
    return new Response('获取文件内容失败', { status: 404 });
  }
  const contentType = getContentType(fileExtension);
  const headers = new Headers();
  headers.set('Content-Type', contentType);
  headers.set('Content-Disposition', 'inline');
  headers.set('Cache-Control', `public, max-age=${CACHE_CONFIG.IMAGE}`);
  headers.set('CDN-Cache-Control', `public, max-age=${CACHE_CONFIG.IMAGE}`);
  const responseToCache = new Response(object.body, { status: 200, headers });
  await cache.put(cacheKey, responseToCache.clone());
  return responseToCache;
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
    const placeholders = keysToDelete.map(() => '?').join(',');
    const cache = caches.default;

    const [dbResult] = await Promise.all([
      config.database.prepare(
        `DELETE FROM media WHERE url IN (${placeholders})`
      ).bind(...keysToDelete).run(),
      Promise.all(keysToDelete.map(async (url) => {
        const cacheKey = new Request(url);
        await cache.delete(cacheKey);
        const urlParts = url.split('/');
        const fileName = urlParts[urlParts.length - 1];
        const r2Key = fileName.split('.')[0];
        await config.r2Bucket.delete(r2Key);
      }))
    ]);

    if (dbResult.changes === 0) {
      return jsonResponse({ message: '未找到要删除的项' }, 404);
    }

    return jsonResponse({ message: '删除成功' });
  } catch (error) {
    return jsonResponse({ error: '删除失败', details: error.message }, 500);
  }
}
