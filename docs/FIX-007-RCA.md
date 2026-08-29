# FIX-007 RCA 报告 — 宿主 0.1.1-rc.2 演进回归：附件链 rejected + 整链变慢

**任务**: FIX-007（P0——v0.3.0 发布门禁回归；M-2 出口①失败回路受理）
**日期**: 2026-08-29
**方法**: 宿主源码实读（npx cache `1e7f6d9597241db0`，只读侦察）+ 隔离环境 live 复现（DSH_HOME 重定向至临时目录）+ 失败会话日志结构化取证（只提取字段形状，未读取对话内容）

---

## 0. 结论摘要（TL;DR）

| # | 问题 | 根因 | 证据 | 定性 |
|---|------|------|------|------|
| R1 | `materialize`（CLI/agent 图片物化）对**所有格式**必败 `ATTACHMENT_UNKNOWN` | 已注册条目路径 `readImage({attachmentId})` 裸 id 调用在 rc.2 元数据严格校验下恒 throw（`readImageFile`: mediaType/bytes/width/height 全等校验） | 隔离复现：PNG/JPEG/GIF/WebP 5 用例全部 `附件读取失败：Stored attachment metadata does not match`（见 §3.1） | **P0 确定性回归**（rc.8 后期已埋雷，rc.2 恒触发） |
| R2 | WebP 附件 `byId`/`resolve`/`attachmentIds` 全链必败 `附件不可解析` | `probeImageDimensions` VP8（有损 WebP，最常见形态）分支字节偏移错误：把 chunk-size 区域当帧标签比对（`u8[14]===0x20` 实为 "8"=0x38；真帧标签在 offset 20） | 隔离复现：sharp 产物 VP8 WebP `probeImageDimensions→undefined`、sharp 自身 `640x480`（见 §3.2） | **P0 确定性缺陷**（FIX-003 只用 PNG 验证——P9 盲区实证） |
| R3 | 症状② `(client apc router/ImageData rejected "request")` | 浏览器侧网关 `dsh-api-gateway/lib/client.js:417-424 parse()`——插件客户端 codec `wImageDataRequest` 要求 `mediaType/bytes/width/height` 全必填；**插件自身 `resolveAttachmentIds` 构造的 ref 里 width/height/name 是条件展开（可缺失）**——经 `[router:image:…]` 标记 → RouteImage → `remote.imageData` 往返后缺失字段即被拒。R1/R2 使懒注册条目字段缺失概率大增（rc.8 之前 saveImage 原样存字节，rc.2 起归一化改写内容 → 旧 ref 形态与新对象字节脱钩） | 源码定位 + 客户端 wireCheck 逐字段核对（见 §3.3） | **P0**（与 R1/R2 耦合的客户端拒绝面） |
| R4 | 症状① 图片识别极慢（实测 **311.9s**） | 三因素叠加：(a) rc.2 `saveImage` 全量 sharp 解码 + 归一化（实测 232ms/4K 图，并发限 2）；(b) rc.2 新增 `readImageRequest` 模型请求投影——首调全解码 + 多格式编码尝试（PNG/WebP q85/q80）+ 校验解码 + 落盘缓存（每图每策略一次）；(c) pi-ai 适配器默认 5 次重试——端点拒绝/超时时整链 ×5 | GATE-1 复验会话 call→result 311.9s（日志时间戳）；归一化/投影耗时实测（见 §4） | **P1 性能回归**（正确性未破坏；首调成本 + 重试放大） |
| R5 | 部分会话 `未知 agent "vision"（可用：无）` | 目录空 = `scope.get().agents={}`。settings.yaml 现存 agents 且 schema 校验通过（实证）——该现象**跨宿主版本出现**（08/28 23:02 即有，早于 rc.2 刷新），非 rc.2 专属；与 rc.2 "registration-time 校验 fail-loud" 组合存在 `apply()` 内 `settings.register` 抛错 → `service.attach(scope)` 不执行 → 服务以 `scope=null` 存活（RouterService 构造即 provide，见 §5）的**结构脆弱性** | 4 个会话日志取证 + schema 实时校验通过（见 §5） | **P2 结构性隐患**（本任务内做防御性加固，根因另立任务） |

**修复方案**（详见 §6）：R1/R2/R3 在插件侧修（兼容层 + 探测器修正 + 请求构造收紧），R4 读写面增加可观测计时埋点（不改变行为），R5 增加目录空时的 fail-loud 诊断（可观测，P8）。

---

## 1. 版本与接口差异面（rc.8 → 0.1.1-rc.2 实读对照）

宿主三包：`@deepseek-ai/dsh-agent`/`dsh-attachment`/`dsh-llm` = **0.1.1-rc.2**（npx cache package.json 实读）。插件 peerDeps 基线 `^0.1.0-rc.8`；插件仓 node_modules 内解析到的 dsh-llm/dsh-attachment/dsh-typert-protocol 分别为 **0.1.0-rc.8 / 0.1.0-rc.8 / 0.1.0-rc.6**（junction 安装指向本仓 → 进程内双版本共存）。

### 1.1 dsh-attachment（git diff rc.8 vs rc.2 实证）

| 接口 | rc.8 | rc.2 | 影响 |
|------|------|------|------|
| `saveImages(inputs)` | 内联校验 | 拆出 `validateImageBatch`（同步）+ 异步提交 | 插件未用批量面——无直接影响 |
| `readImageRequest(ref, policy, signal)` | —（不存在） | **新增**；基类默认 reject `ATTACHMENT_PROJECTION_UNSUPPORTED`，LocalAttachmentStore 实现模型请求投影（缓存于 `DSH_HOME/attachments/v1/request-images/`） | pi-ai 适配器每图每调用经此面；首调重量级（§4） |
| `saveImage` 行为 | 存字节 | **全量解码 + 确定性归一化**：EXIF 方向应用、>2048 长边缩放、>4MB 再编码、元数据剥离；`canPassThroughNormalization` 才原样透传 | **attachmentId 现为归一化字节的哈希**；ref 新增可选 `originalDimensions`；内容与上传字节可不同（实测 4K PNG 264218→44871 字节） |
| `readImage(ref)` 校验 | 元数据全等校验（FIX-003 已实证 21:28 演进） | 同左（保持） | 裸 id ref 恒 `ATTACHMENT_CORRUPT`——R1 根因 |
| `ImageAttachmentRef` 形状 | 全字段 | 相同 + 可选 `originalDimensions` | 插件 wireCheck 透传未知字段——兼容 |
| `imageLimits` | — | 新增 `maxImagePixels`/`maxImageDimension` | 插件只读 `maxImagesPerMessage`/`maxImageBytes`——仍存在，兼容 |

### 1.2 dsh-llm（git diff rc.8 vs rc.2 实证）

| 接口 | rc.8 | rc.2 | 影响 |
|------|------|------|------|
| `adapterStream` 未 prepared 路径 | 不调 `adapter.prepareCall`（FIX-006 实证已移除） | **恢复调用** `adapter.prepareCall(provider, model, signal)` | 插件 twin 保留 prepareCall（FIX-006 决策）**恰好重新变为必需**——零改动正确 ✓（parity 14 断言继续看护） |
| 文本模型图片投影 | 无（FIX-006 实证 rc.8 已消失） | **恢复**：`inputModalities` 存在且不含 image 且消息含图块 → `projectImagesForTextModel` 替换为 `[image omitted because this model accepts text only; …]` | 对 runChat 自定义 pi-ai provider（`defaultInput` 缺省 `["text"]`）是**潜在图片剥离点**：图块在进入适配器前被替换。当前用户 glm 配置实测未触发（视觉评审成功）；但配置漂移即触发——P9 盲区记录（§7-G3） |
| pi-ai 请求图片 | 直接内联归一化字节 | `prepareRequestImages` → `attachments.readImageRequest(ref, {maxPixels:4194304, maxBytes:1048576})`（缓存键含策略） | R4 性能因素 (b) |
| pi-ai 重试 | — | "shared bounded normal default of **five retries**"（profile 可覆写） | R4 性能因素 (c) |

### 1.3 dsh-api-gateway（客户端 parse）

```js
// rc.2 lib/client.js:417-424（抛出点实读）
function parse(codec, value, endpoint, field) {
    if (codec.mode !== "strict") throw new Error(`client api: generated Remote ${endpoint} field …`);
    try { return codec.schema.parse(value); }
    catch (cause) { throw new Error(`client api: ${endpoint} rejected ${JSON.stringify(field)}`, { cause }); }
}
```

用户截图文本 `(client apc router/ImageData rejected "request")` 即 `client api: router/imageData rejected "request"` 的转写（"api:"→"apc"、方法名大小写转写；宿主全树 grep `apc` 仅命中语言语法文件，排除宿主自有该串）。**抛出层 = 浏览器侧**，在 RPC 发送之前；schema = 插件自己 $mount 的 `wImageDataRequest`。

---

## 2. 抛出点全链定位（症状②）

```
用户消息 image 块（宿主原生渲染——不经本链）
     │
route_agent 工具结果（tool.js render() 只写文本标记）
     │  [router:image:{…ref JSON…}]   ← imageMarkerOf = {...ref} 全量拷贝
     ▼
浏览器 RouteAgentToolCard.parseMarkersOf（client.js:3579）
     │  JSON.parse + 只校验 attachmentId 存在     ← 弱门槛：ref 可缺 width/height
     ▼
RouteImage.load → remote.imageData({ ref })（client.js:3823）
     ▼
dsh-api-gateway 客户端 invoke() → parse(request codec)        ★ 抛出点
     │  wireCheck 要求 attachmentId/mediaType/bytes/width/height 全必填
     ▼ （若通过才到达服务端）
/api/router/imageData → service.imageData(request) → attachments.readImage(ref)
     │  rc.2 readImageFile：digest + mediaType/bytes/width/height 全等校验
```

**判定**：拒绝发生在浏览器侧第 4 步。标记 ref 缺任一必填字段即触发。标记 ref 的上游有二：
1. `selectAttachments`（用户消息块 attachment，宿主产出，全字段）——完整，不触发；
2. **`resolveAttachmentIds`（service.js:2061-2070）——`width/height/name` 为条件展开（`...(typeof entry.width === 'number' ? {width} : {})`），`bytes` 缺省 0 兜底、`mediaType` 缺省 'image/png' 兜底**。条目经 M2 懒注册建立——**R1/R2 使懒注册失败或字段缺失后，这条通路产出的 ref 即"裸 id + 兜底值"形状**，进标记 → 客户端 parse 拒绝。

**变慢根因定性**（症状①，分别定性）：
- **宿主 per-call 慢路径（新）**：`readImageRequest` 首调 = readImage（digest+probe）→ 缓存 miss → `hasLowColourCount`（全解码采样）→ 编码尝试循环（PNG palette / WebP q85 / WebP q80，byteBudget 内逐级）→ `verifyRequestImage`（全解码复核）→ 落盘。全部经 `CompressionLimiter`（并发 2）。
- **宿主 saveImage 归一化（新）**：实测 1600×900 = 16ms；4000×3000 = 232ms（输出 2048×1536/44871B）。非分钟级。
- **模型端点响应时间（半定量）**：GATE-1 复验会话 route_agent call→result = **311.9s**（日志时间戳差）。宿主侧单图成本（归一化 + 投影 + 缓存读）实测毫秒~亚秒级，**无法解释 311.9s**；结合 pi-ai 默认 5 次重试 × 端点拒绝/超时（如 base64 体积、限流），主要时长在端点侧重试链。插件埋点（stats.record 的 ms 字段）已存在，后续会话可直接取数。

---

## 3. 隔离环境 live 复现（DSH_HOME → 临时目录，真实 rc.2 LocalAttachmentStore）

### 3.1 R1：materialize 全格式必败

```
store = LocalAttachmentStore(dshHome=<tmp>)   # 真实 rc.2 实现
registry = AttachmentRegistry(ctx{attachments: store})

plainPng  byId=ok(800x600)  materialize=FAIL 附件读取失败：Stored attachment metadata does not match
exifJpeg  byId=ok(600x900) materialize=FAIL 同上
largePng  byId=ok(2048x1365, orig 3000x2000) materialize=FAIL 同上
webp      byId=undefined   materialize=FAIL 附件不可解析
gif       byId=ok(320x240) materialize=FAIL 同上
```

代码路径（attachments.js materialize）：`peek(id)` 命中（selectAttachments 预注册过/byId 先行）→ `bytes=null`（lazy 复用只在未注册分支）→ `attachments.readImage({ attachmentId: id })` **裸 id** → rc.2 `readImageFile` `metadata.mediaType !== ref.mediaType`（undefined ≠ 实值）→ `ATTACHMENT_CORRUPT` → 包装 `ATTACHMENT_UNKNOWN`。FIX-003 的 `lazyImageFromObjectFile` 自取证只修了 `lazyRegisterById`/`byId` 通路，**materialize 的内联读取没有走完整 ref 重试**——修复缺口。

### 3.2 R2：WebP VP8 探测器偏移错误

```
sharp 产物 VP8（有损）WebP 头部：
offset: 0  52 "R" … 8 "W" 9 "E" 10 "B" 11 "P" 12 "V" 13 "P" 14 "8" 15 " "(0x20) 16-19 chunkSize 20-22 frameTag
probeImageDimensions → undefined     ← 插件探测器
sharp(data).metadata() → 640x480 webp ← 宿主事实
```

attachments.js:152 分支条件 `(u8[14]===0x20 && u8[15]===0x00 && u8[16]===0x00 && u8[17]===0x00)`：u8[14] 是 "8"=0x38（永非 0x20）；即便 FourCC 对上（u8[15]=0x20 是空格），后续比对的是 chunk size 而非 offset 20 的帧标签。VP8L 分支（u8[14]=0x38,u8[15]=0x4c）与 VP8X 分支（12-15 "VP8X"）正确；**VP8（最常见有损形态）分支自 FIX-003 起即坏**。后果链：`lazyImageFromObjectFile` → `probeImageDimensions` undefined → 兜底 undefined → `byId` undefined → `attachmentIds`/`resolve`/`materialize` 全链 `附件不可解析`。

### 3.3 R3：客户端拒绝面（构造性证明）

`wImageDataRequest`（schemas.js:614 / client.js:180 同构）字段表：

| 字段 | 服务端 codec | 客户端 codec | resolveAttachmentIds 产出 |
|------|------------|-------------|--------------------------|
| attachmentId | 必填 string | 必填 string | 恒有 |
| mediaType | 必填 string | 必填 string | 兜底 'image/png'（**可失真**） |
| bytes | 必填 number | 必填 number | 兜底 0（**可失真**） |
| width | 必填 number | 必填 number | **条件展开（可缺失）** |
| height | 必填 number | 必填 number | **条件展开（可缺失）** |
| name | 可选 string | 可选 string | 条件展开 |

任一缺失 → `client api: router/imageData rejected "request"`（症状②精确复现的签名）。R1/R2 造成的懒注册失败/降级条目把这条"可缺失"路径的触发概率从边缘变成主路径。**服务端 `imageData()` 自身只校验 attachmentId（宽松）**——不对称：客户端比服务端严。

---

## 4. 变慢定量（隔离实测）

| 操作 | 耗时 | 说明 |
|------|------|------|
| saveImage 1600×900 PNG | 16ms | 归一化 pass-through 或轻量重编码 |
| saveImage 4000×3000 PNG | 232ms | 缩放至 2048×1536 + 重编码（264218→44871B） |
| readImage（缓存命中路径） | 1ms | digest + header probe |
| readImageRequest 首调 | 2ms（小图）/ 更大图按像素规模 | 低色彩 PNG 走 pass-through；真实截图含噪声时走编码尝试循环 |
| readImageRequest 二调 | 1ms | request-images 缓存命中 |
| **GATE-1 复验会话 route_agent** | **311.9s** | 日志时间戳；宿主侧成本不足以解释——端点重试链为主（pi-ai 默认 5 重试） |

---

## 5. R5：「可用：无」取证

- 出现会话：08/28 23:02（android-tv 工作区）、08/29 00:51、08/29 17:38 ×2（GATE-1）、（08/29 20:49 为另一 OAuth 能力错误）。
- settings.yaml 现存 `router.agents = {vision, assistant}`（enabled: true），`routerSchema(section)` 实时校验 **通过**、agents 解析成功——当前时刻配置无恙。
- 结构脆弱性（源码实证）：`RouterService extends TypertRemoteService extends cordis Service`——**构造函数即 `ctx.reflect.provide('router')`**；index.js `apply()` 内 `new RouterService(ctx)` 先于 `ctx.settings.register(...)`。若注册在 rc.2 "registration-time fail-loud" 下抛错（如彼时文档瞬时不可解析/并发窗口），`service.attach(scope)` 不执行，但服务已 provide → `getState()` 落 `this.base`（agents 默认 {}）→「可用：无」且工具可达。跨宿主版本出现 → 非 rc.2 专属；本任务仅加**可观测加固**（P8：目录空时记录诊断事件），根因追踪另立任务（建议 FIX-008）。

---

## 6. 修复设计（P5 泛化——按既有 sourceAcceptsModality/parity 单点模式）

**原则**：不逐版本硬编码（禁 `if (version === '0.1.1-rc.2')`）；全部按"能力/形状探测 + 单点兼容层"泛化，与 FIX-006 prepareCall 保留策略同型。

### F-1（R1）materialize 读取走"完整 ref 自取证"单点

`attachments.js`：抽出 `readStoredImage(id)`——构造完整 ref 的读取单点：先取注册条目（或自取证探测：对象字节 → 魔数 + 尺寸探测），以**完整 ref**调 `attachments.readImage`；裸 id 抛 ATTACHMENT_CORRUPT 时回落 `lazyImageFromObjectFile`（既有自取证），成功后回填注册表。`materialize`/`read`/`imageData` 的读取全部经此单点。判别测试：rc.2 形状（裸 id 恒拒的 readImage 桩）下旧代码必败、新代码物化成功。

### F-2（R2）probeImageDimensions VP8 偏移修正

按 RIFF/WEBP 规范重写 VP8 分支：FourCC 校验 `u8[12..15] === "VP8 "`（0x56 0x50 0x38 0x20），chunk size 在 16-19（小端），帧标签在 20-22——关键帧判定 `u8[20] & 0x01 === 0`（bit0 = 帧类型，0 = 关键帧；RFC 6386），宽高取 `u16le(26) & 0x3FFF` / `u16le(28) & 0x3FFF`——14 位字段**直存实际值、无 -1 编码**（与 VP8X/VP8L 的 "-1 编码"不同；实测 sharp 640x480 产物 offset26-27 = 0x0280 = 640）。判别测试：sharp 产物 VP8 WebP（真实字节）旧代码 undefined、新代码返回正确尺寸；VP8L/VP8X 既有断言零回退。

### F-3（R3）resolveAttachmentIds ref 构造收紧 + imageData 客户端/服务端对称

- `resolveAttachmentIds`：解析成功后**经 F-1 单点读取**取回宿主权威 ref（readImage 返回的 `stored.ref`），以其字段构造派发 ref——width/height/mediaType/bytes 不再条件展开/兜底；条目缺元数据时先经读取单点 + 字节魔数/尺寸探测补全（尽力而为，宽松宿主兼容）；**双重失败（字节也不可得）时保留兜底 ref 并记 `attachment_ref_degraded` 降级诊断事件——降级永不静默（P8，R0 F-1 收紧后的实际实现语义）**。
- `service.imageData`：同样经 F-1 单点（完整 ref 读取），服务端保持权威校验。
- （可选不动面）客户端 `wImageDataRequest` 保持严格——它是防畸形 ref 的最后防线；修的是上游产出而非放宽下游。

### F-4（R4）附件读写耗时埋点（可观测，不改行为）

`imageData`/`materialize`/`resolveAttachmentIds` 关键宿主调用处记录 `recordCapabilityEvent` 型诊断事件（`attachment_read_ms` 等）——复用既有 stats.record ms 主埋点之外的 P8 事件面。慢链路可归因（宿主归一化 vs 端点重试）。

### F-5（R5）目录空 fail-loud 诊断

`resolveAgent` 未知 id 且 `listEnabledAgents()` 为空时，记录一次诊断事件（`catalog_empty`，含 enabled 状态与 scope 是否 attached）——把"静默空目录"变成可观测信号（P8）。

### 明确不做（越域控制）

- 不改 peerDependencies 版本声明（DEC-025 D-4b rc.8 对齐是 REL-003 决策；rc.2 对齐属新决策，交 Coordinator）。
- 不动 `~/.dsh` 配置、不启停宿主进程（红线）。
- R5 根因（settings 注册竞态假设）未实证——只加观测，不修不猜。

---

## 7. P9 看护链实证：为何没拦住（守卫盲区记录）

| 守卫 | 覆盖面 | 盲区 |
|------|--------|------|
| adapter-parity 14 断言（FIX-006） | twin 六方法 + 行为八件 | 只看 **dsh-llm adapter 面**；附件面（readImage 裸 id 严格性/saveImage 归一化）**无 parity 守卫** |
| 能力自证（FIX-004 sourceAcceptsModality） | 模型模态判定 | 不覆盖附件存储行为 |
| FIX-003 自取证（lazyImageFromObjectFile） | byId 懒注册 | (a) **materialize 内联读取未走自取证**（R1）；(b) 探测器只用 **PNG** 验证——VP8 WebP 分支从未被真实字节测试（R2）；(c) 测试 readImage 桩模拟"裸 id 拒绝"但 `materialize` 路径无桩覆盖 |
| 自取证哈希门（B13d） | 冒充/半写对象 | 正确——非本次失效点 |
| 判别测试基线 | mock 形状 = rc.8 对齐面 | mock readImage 桩的"元数据校验失败"消息与 rc.2 一致（幸运对齐），但**没有断言 materialize 全链**——桩只注入 byId 通路 |

**结论**：守卫链对"宿主 adapter 接口"有防护，对"宿主附件存储语义"（裸 id 拒绝 × 归一化改写 × 探测器覆盖格式）存在系统性盲区。本次修复将新增：真实 rc.2 形状的 readImage 桩（恒拒裸 id）注入 **materialize/resolve/imageData 三通路** 的判别测试 + 真实字节 VP8/VP8L/VP8X 探测器测试（守卫补盲）。

---

## 8. 证据索引

- 隔离复现脚本：`.tmp-research/fix007-probe.mjs`（rc.2 saveImage/readImageRequest 行为+耗时）、`fix007-registry2.mjs`（R1/R2 复现）、`fix007-webp2.mjs` + `fix007-webp.mjs`（R2 字节级取证）
- 会话取证脚本：`fix007-log-shape.mjs`、`fix007-routeagent2.mjs`、`fix007-results.mjs`、`fix007-latency.mjs`（311.9s）、`fix007-scan.mjs`
- 宿主源码锚点：`dsh-api-gateway/lib/client.js:417-424`（parse 抛出点）、`dsh-attachment-local/lib/index.js:493-508`（readImageFile 校验）、`:340-362`（prepareImageFile 归一化）、`dsh-llm/lib/index.js:1559-1592`（adapterStream 投影/prepareCall）、`dsh-llm-pi-ai/lib/index.js:1114-1122`（readImageRequest 每图每调）
- 插件源码锚点：`lib/attachments.js:489-499`（materialize 裸 id 读取）、`:152-155`（VP8 偏移）、`lib/service.js:2061-2070`（条件展开 ref）、`lib/client.js:180-189` + `lib/schemas.js:614-623`（对称 codec）
- 失败会话（用户真实环境，只读取证）：`8454c456`（17:38 GATE-1，可用：无 ×2 + 58 image 块全字段）、`79d149ce`（20:39 复验，vision 成功 311.9s + 5 标记全字段）、`e21f2756`（08/28 23:02 可用：无——rc.2 前即有）
