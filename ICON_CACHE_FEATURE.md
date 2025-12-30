# 快捷方式图标加载优化 - 多源备选与本地缓存

## 功能概述

为了解决快捷方式图标加载需要代理的问题，实现了本地缓存机制和多源备选加载方案。

## 核心特性

### 1. 多源备选加载

当加载快捷方式图标时，系统会按优先级尝试以下多个图标源：

1. **Google Favicon API** (第一优先级)
   - URL: `https://www.google.com/s2/favicons?sz=64&domain={hostname}`
   - 最可靠的图标服务

2. **DuckDuckGo Favicon** (第二优先级)
   - URL: `https://icons.duckduckgo.com/ip3/{hostname}.ico`
   - 国内可访问，无需代理

3. **Favicon Kit** (第三优先级)
   - URL: `https://api.faviconkit.com/{hostname}/64`
   - 备选服务

4. **网站自身 Favicon** (第四优先级)
   - URL: `https://{hostname}/favicon.ico`
   - 直接从网站获取

5. **首字母降级图标** (最终降级)
   - 所有源都失败时，显示美观的首字母图标

### 2. 智能本地缓存

- **首选源记录**：系统会记录每个域名最后一次成功加载的图标源
- **下次优先使用**：再次访问时，优先使用上次成功的源，减少失败重试
- **自动过期**：缓存记录7天后自动过期，确保可以尝试更好的源
- **自动清理**：每次应用启动时自动清理过期的缓存记录

### 3. 用户自定义图标支持

- **完全本地化**：用户上传的图标以 data URL 格式存储，完全本地化
- **无需网络**：自定义图标不依赖任何外部服务
- **即时显示**：上传后立即可用，无需等待

## 技术实现

### 数据结构

#### 图标源缓存
```javascript
{
  "iconPreferredSources": {
    "google.com": {
      "index": 0,           // 成功的源索引
      "lastSuccess": 1234567890  // 最后成功时间戳
    },
    "github.com": {
      "index": 1,
      "lastSuccess": 1234567890
    }
  }
}
```

### 核心模块

#### 1. API.iconCache (api.js)

```javascript
API.iconCache = {
  // 获取域名的首选图标源
  async getPreferredSource(hostname)
  
  // 保存成功的图标源
  async savePreferredSource(hostname, sourceIndex)
  
  // 清理7天前的记录
  async cleanup()
}
```

#### 2. API.getFaviconUrls (api.js)

```javascript
// 返回多个备选源URL数组
API.getFaviconUrls(pageUrl, { size: 64 })
```

#### 3. App.initMultiSourceIcons (app.js)

```javascript
// 初始化所有快捷方式图标的多源加载
// 从缓存的首选源开始尝试
async initMultiSourceIcons()
```

#### 4. App.loadIconWithFallback (app.js)

```javascript
// 递归加载图标，失败时自动尝试下一个源
loadIconWithFallback(img, sources, currentIndex, hostname)
```

## 工作流程

### 首次加载（无缓存）

```
1. 渲染快捷方式 HTML
   ├─ 生成多源 URL 数组
   └─ 存储在 img 的 data-sources 属性中

2. 初始化多源加载
   ├─ 检查是否有缓存的首选源 (无)
   ├─ 从索引 0 开始加载 (Google)
   └─ 设置 onload 和 onerror 回调

3. 尝试加载
   ├─ 源 0: Google Favicon
   │  ├─ 成功 → 显示图标，完成
   │  └─ 失败 → 继续
   ├─ 源 1: DuckDuckGo Favicon
   │  ├─ 成功 → 显示图标，保存索引 1 到缓存
   │  └─ 失败 → 继续
   ├─ 源 2: Favicon Kit
   │  └─ ...
   └─ 所有失败 → 显示首字母降级图标
```

### 再次加载（有缓存）

```
1. 渲染快捷方式 HTML
   └─ 同上

2. 初始化多源加载
   ├─ 检查缓存：发现上次成功的是源 1
   └─ 从索引 1 开始加载 (DuckDuckGo)

3. 直接加载成功的源
   ├─ 源 1: DuckDuckGo Favicon
   │  └─ 成功 → 显示图标，完成（跳过其他源）
   └─ 失败 → 尝试源 2, 3...
```

## 用户体验改进

### 对普通用户（无代理）
- ✅ 多个图标源自动切换，总有一个能访问
- ✅ DuckDuckGo 等备选源国内可用
- ✅ 智能缓存减少重试次数
- ✅ 失败时优雅降级到首字母图标

### 对所有用户
- ✅ 首次加载后，下次使用缓存的成功源
- ✅ 加载速度更快
- ✅ 减少网络请求
- ✅ 降低服务器压力

## 性能优化

1. **首选源优先**：记录成功的源，下次直接使用
2. **并发加载**：所有快捷方式图标并发加载
3. **失败快速降级**：图片加载失败时立即尝试下一个源
4. **定期清理**：自动清理过期缓存，避免存储膨胀

## 配置说明

### 缓存有效期
- **默认值**：7天
- **位置**：`API.iconCache.CACHE_TTL`
- **可调整**：修改该常量即可

### 图标源列表
- **位置**：`API.getFaviconUrls()` 函数
- **可扩展**：添加更多备选源到返回的数组中

### 图标尺寸
- **默认值**：64px
- **可调整**：在调用 `getFaviconUrls()` 时传入 `{ size: 新尺寸 }`

## 日志输出

系统会在控制台输出详细的加载日志：

```
图标缓存清理完成
图标加载失败 - 域名: example.com, 源索引: 0, URL: https://www.google.com/s2/favicons?...
图标加载成功 - 域名: example.com, 源索引: 1
```

## 维护建议

1. **监控日志**：定期查看哪些源经常失败，考虑调整优先级
2. **添加新源**：如发现更好的图标服务，可添加到源列表中
3. **清理缓存**：如需重置所有缓存，删除 `iconPreferredSources` 键即可

## 兼容性

- ✅ 完全向后兼容
- ✅ 不影响现有的自定义图标功能
- ✅ 不影响首字母降级图标
- ✅ 支持 Chrome Storage API 和 localStorage
