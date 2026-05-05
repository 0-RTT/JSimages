### 核心功能
- 🔐 可选的访客验证功能（Basic Auth）
- 🗜️ 可选的图片压缩功能（默认开启，支持前端切换）
- 📦 可选的文件大小限制（默认 10MB，可通过环境变量配置）
- 📁 支持所有文件格式上传（图片、视频、文档等）
- 📤 支持多文件上传、拖拽上传和粘贴上传（Ctrl+V）

### 管理功能
- 📋 支持查看本地历史记录
- 🖼️ 图库管理界面，支持批量操作
- 🗑️ 支持批量删除文件（同步删除 R2 存储和数据库记录）
- ⏰ 显示文件上传时间

### 性能优化
- ⚡ Cloudflare Cache API 缓存支持
- 🎨 懒加载和骨架屏优化
- 📱 响应式设计，支持移动端

## 部署步骤
> ⚠️虽然项目的代码使用了Worker的缓存API，但还是建议配置好**边缘 TTL** 并开启**访客验证**，防止被刷导致扣费！

### 1. 变量说明
需要在 Cloudflare Workers 中配置以下变量:

| 变量名 | 说明 | 必填 | 示例 |
|--------|------|------|------|
| DOMAIN | 自定义域名 | 是 | example.workers.dev |
| USERNAME | 管理员用户名 | 是 | admin |
| PASSWORD | 管理员密码 | 是 | password123 |
| ADMIN_PATH | 管理后台路径 | 是 | admin |
| ENABLE_AUTH | 访客验证（设置为 true 开启，不设置或设置为 false 则关闭） | 否 | false |
| MAX_SIZE_MB | 单文件最大支持大小（单位：MB，默认值为 10） | 否 | 10 |
| DATABASE | D1 数据库绑定变量名称 | 是 | 默认DB（需要设置为此名称） |
| R2_BUCKET | R2 存储桶名称 | 是 | 默认（需要设置为此名称） |

### 2. 创建 R2 存储桶
1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 进入 `R2对象储存` → `创建存储桶`
3. 设置存储桶名称和区域
4. 保存存储桶的名称以便后续使用

### 3. 创建 D1 数据库
1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 进入 `Workers & Pages` → `D1 SQL 数据库`
3. 点击 `创建` 创建数据库
   - 数据库名称可自定义，例如 `images`
   - 建议选择数据库位置为 `亚太地区`，可以获得更好的访问速度
4. 线上执行所有数据库SQL
```bash
npx wrangler d1 migrations apply DB --remote
```

### 4. 创建 Worker
1. 进入 `Workers & Pages`
2. 点击 `创建`
3. 选择 `创建 Worker`
4. 为 Worker 设置一个名称
5. 点击 `部署` 创建 Worker
6. 点击继续处理项目

### 5. 绑定 D1 数据库和 R2 储存
1. 在 Worker 设置页面找到 `设置` → `绑定`
2. 点击 `添加` 添加以下变量
   - DATABASE
   - R2_BUCKET 
3. 点击 `部署`

### 6. 绑定域名
1. 在 Worker 的 `设置` → `域和路由`
2. 点击 `添加` → `自定义域`
3. 输入你在 Cloudflare 绑定的域名
4. 点击 `添加域`
5. 等待域名生效

### 7. 配置变量和机密
1. 在 Worker 的 `设置` → `变量和机密` 中
2. 点击 `添加` 添加以下变量
   - DOMAIN
   - USERNAME
   - PASSWORD
   - ADMIN_PATH
   - ENABLE_AUTH（可选）
   - MAX_SIZE_MB（可选）
3. 点击 `部署`

### 8. 部署代码
1. 进入 Worker 的编辑页面
2. 将 `index.js` 的完整代码复制粘贴到编辑器中
3. 点击 `部署`

### 9. 配置缓存
1. 进入 Cloudflare Dashboard
2. 进入 `网站` → `选择你的自定义域名` → `缓存` → `Cache Rules` → `创建缓存规则`
3. 选择 `缓存所有内容模板`
4. 设置 `边缘 TTL` → `忽略缓存控制标头，使用此 TTL` → `30天`（根据需要设置）
5. 点击 `部署`

## 开源协议

MIT License

## 鸣谢

- [0-RTT/JSimages](https://github.com/0-RTT/JSimages)
