# 图标缓存功能测试指南

## 测试环境准备

1. 在 Chrome 浏览器中加载扩展
2. 打开开发者工具（F12），切换到 Console 标签
3. 清空所有现有数据（可选，用于全新测试）

## 测试场景

### 场景1: 首次加载（无缓存）

**操作步骤**：
1. 打开新标签页
2. 观察快捷方式图标加载过程

**预期结果**：
- 控制台输出：`图标缓存清理完成`
- 所有图标按顺序尝试加载源
- 成功加载的图标正常显示
- 失败的图标显示首字母降级图标

**验证点**：
```javascript
// 在控制台执行，查看缓存状态
chrome.storage.local.get('iconPreferredSources', (result) => {
  console.log('图标源缓存:', result.iconPreferredSources);
});
```

### 场景2: 再次加载（有缓存）

**操作步骤**：
1. 关闭当前标签页
2. 重新打开新标签页
3. 观察图标加载速度

**预期结果**：
- 图标加载速度明显加快
- 直接使用缓存的成功源
- 控制台输出较少的失败日志

**验证点**：
```javascript
// 检查缓存是否生效
chrome.storage.local.get('iconPreferredSources', (result) => {
  console.log('缓存命中:', result.iconPreferredSources);
  // 应该看到多个域名的缓存记录
});
```

### 场景3: 多源降级测试

**模拟网络问题**：
1. 在 Chrome DevTools > Network 中设置网络限制
2. 或使用 Request Blocking 功能阻止特定域名

**操作步骤**：
1. 阻止 `www.google.com`
2. 打开新标签页
3. 观察图标加载降级过程

**预期结果**：
- 控制台输出：`图标加载失败 - 域名: xxx, 源索引: 0`
- 自动尝试下一个源（DuckDuckGo）
- 如果成功，控制台输出：`图标加载成功 - 域名: xxx, 源索引: 1`
- 缓存记录源索引为 1

### 场景4: 用户自定义图标

**操作步骤**：
1. 点击快捷方式的删除按钮旁边的编辑图标（如果有）
2. 或添加新的快捷方式
3. 上传自定义图片

**预期结果**：
- 自定义图标立即显示
- 不经过多源加载流程
- 图标以 data URL 格式存储

### 场景5: 缓存过期清理

**操作步骤**：
1. 手动修改缓存中的时间戳（模拟过期）
```javascript
chrome.storage.local.get('iconPreferredSources', (result) => {
  const cache = result.iconPreferredSources || {};
  // 修改所有时间戳为8天前
  for (const key in cache) {
    cache[key].lastSuccess = Date.now() - (8 * 24 * 60 * 60 * 1000);
  }
  chrome.storage.local.set({ iconPreferredSources: cache }, () => {
    console.log('缓存已设置为过期');
  });
});
```

2. 重新打开新标签页

**预期结果**：
- 控制台输出：`图标缓存清理完成`
- 过期的缓存记录被删除
- 重新从源 0 开始加载图标

### 场景6: 不同域名混合测试

**操作步骤**：
1. 添加多个不同的快捷方式：
   - Google (google.com)
   - GitHub (github.com)
   - Wikipedia (wikipedia.org)
   - 某个国内网站 (如 baidu.com)
   - 某个可能失败的网站

2. 观察不同域名的加载情况

**预期结果**：
- 每个域名独立缓存
- 不同域名可能使用不同的成功源
- 混合显示：部分使用源 0，部分使用源 1

## 控制台命令

### 查看缓存
```javascript
chrome.storage.local.get('iconPreferredSources', (result) => {
  console.table(result.iconPreferredSources);
});
```

### 清空缓存
```javascript
chrome.storage.local.remove('iconPreferredSources', () => {
  console.log('图标缓存已清空');
});
```

### 手动触发清理
```javascript
// 需要在页面上下文中执行
API.iconCache.cleanup().then(() => {
  console.log('清理完成');
});
```

### 查看所有存储
```javascript
chrome.storage.local.get(null, (items) => {
  console.log('所有存储数据:', items);
});
```

## 性能测试

### 测试加载时间

在控制台执行：
```javascript
// 记录开始时间
const start = performance.now();

// 等待所有图标加载完成
setTimeout(() => {
  const imgs = document.querySelectorAll('.shortcut-icon-img');
  const loaded = Array.from(imgs).filter(img => img.complete && img.naturalHeight !== 0);
  const failed = imgs.length - loaded.length;
  const time = performance.now() - start;
  
  console.log(`图标加载统计:
    总数: ${imgs.length}
    成功: ${loaded.length}
    失败: ${failed}
    耗时: ${time.toFixed(2)}ms
  `);
}, 5000);
```

## 问题排查

### 图标不显示
1. 检查控制台是否有错误
2. 检查网络请求是否被阻止（CSP、CORS）
3. 验证 URL 是否正确生成

### 缓存不生效
1. 检查缓存数据是否存储成功
2. 验证域名提取是否正确
3. 确认 `API.iconCache` 模块已加载

### 降级失败
1. 检查首字母图标的 CSS 样式
2. 验证 DOM 结构是否正确
3. 确认降级逻辑执行

## 预期日志输出

正常情况下，控制台应该输出类似：

```
App initializing...
开始迁移快捷方式数据，当前数量: 6
快捷方式数据无需迁移
壁纸库初始化: bing=80, unsplash=80, picsum=80
图标缓存清理完成
App initialized successfully
图标加载成功 - 域名: google.com, 源索引: 0
图标加载成功 - 域名: youtube.com, 源索引: 0
图标加载失败 - 域名: example.com, 源索引: 0, URL: https://www.google.com/s2/favicons?...
图标加载失败 - 域名: example.com, 源索引: 1, URL: https://icons.duckduckgo.com/...
图标加载成功 - 域名: example.com, 源索引: 2
```

## 成功标准

✅ 所有图标正常显示或降级显示  
✅ 缓存正确记录成功的源  
✅ 再次加载时使用缓存的源  
✅ 过期缓存自动清理  
✅ 用户自定义图标优先级最高  
✅ 无 CSP 违规错误  
✅ 无 JavaScript 错误  
