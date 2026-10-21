# 国内天气/图标加载修复说明

## 问题现象
- 中国网络环境下天气小组件一直显示「加载失败」或不显示。
- 页面图标（Font Awesome）全部不显示。

## 原因
1. 天气数据依赖 `api.open-meteo.com`，国内访问不稳定。
2. 定位依赖 `ipapi.co` / `ip-api.com`，国内基本不可直连，定位超时。
3. 图标字体从 `cdnjs.cloudflare.com` 加载，该域名被墙。

## 修复内容

### 1. 图标字体本地化
- 将 Font Awesome 6.4.0 的 CSS 与全部 webfonts 下载到 `css/fontawesome/`。
- `index.html` 改为引用本地 `css/fontawesome/css/all.min.css`，不再依赖任何境外 CDN。
- 新增天气图标：`fa-cloud-sun-rain`、`fa-cloud-bolt`、`fa-cloud-showers-water`、`fa-wind`，并在 `css/style.css` 中补充配色。

### 2. 定位改为国内源优先
`API.getLocation()` 的请求顺序调整为：
1. `https://ipservice.ws.126.net/locate/api/getLocByIp`（网易，国内直连，返回省/市/经纬度）
2. `http://ip-api.com/json/`（海外兜底）
3. `https://ipapi.co/json/`（海外兜底）
4. 全部失败时回退到北京。

定位结果新增 `province` 字段并缓存 12 小时。

### 3. 天气改为 Bing 天气优先
`API.getWeather(location, forceNew)` 的取数顺序：
1. **Bing 天气**（`https://api.msn.com/weather/overview`，与 Bing/Windows 天气同一接口）：
   按经纬度获取实时天气与未来 3 天预报，返回中文天气现象（如「以晴为主」「局部多云」）。
   使用 MSN 客户端的公共 apikey，内置两个 Key 轮换；接口为微软未公开 API，失效时自动降级。
2. **腾讯天气** `https://wis.qq.com/weather/common`：国内直连、无需 Key，Bing 失败时兜底。
3. **Open-Meteo**：海外最终兜底。

夜间晴/多云会显示月亮图标（`fa-moon` / `fa-cloud-moon`），其余天气按中文描述映射到对应 Font Awesome 图标。

`js/widgets.js` 同步适配：
- 传入完整的定位对象（含城市/省份）。
- 风速展示兼容「风向+风力」格式（如 `南风4-5级`）和 `km/h`。
- 天气预报项通过 `title` 展示天气现象。
- 重试按钮会强制刷新定位与天气。

### 4. 权限声明
`manifest.json` 增加：
- `https://api.msn.com/*`
- `https://wis.qq.com/*`
- `https://ipservice.ws.126.net/*`

## 验证方式
1. 在扩展管理页重新加载插件，打开新标签页。
2. 天气组件应显示当前城市、温度、天气现象、湿度、风力和未来 3 天预报。
3. 所有 Font Awesome 图标（设置、刷新、待办等）应正常显示，且断网时仍能渲染。
4. 点击天气组件右上角刷新按钮，可强制更新天气。
