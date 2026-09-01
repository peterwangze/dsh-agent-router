# Review — EVO-012 批一 R0（图片 HTTP 路由 + route_agent 卡片折叠，FIX-020 并入）

- **Round**: R0
- **Task**: EVO-012 批一（FIX-020 承载）——生图产物改走插件同源 HTTP 路由（/router-assets/ + 内容寻址 id，绕开宿主 imageData RPC）+ route_agent 卡默认折叠
- **Commits**: `6d12289` + `9b751a1`，base d1c5c1e
- **审查者**: Code Reviewer（R0）
- **日期**: 2026-08-31
- **范围说明**: 无命令面；宿主 webServer 契约直接读源码核验（dsh-host-webserver lib/index.js）；门控采信 Coordinator（16/16；smoke 3 轮稳定）。

## 修复声称逐项核验（5/5）

| # | 声称 | 证据 | 结论 |
|---|---|---|---|
| 1 | 宿主前缀路由 | `@deepseek-ai/dsh-host-webserver/lib/index.js:128-135`（`kind === 'exact' ? exact : prefixes` 注册表）+ `:269-279`（exact 未命中 → 前缀表最长优先，匹配条件 `pathname !== prefix && !startsWith(prefix+'/')` continue——**pathname===prefix 也命中**）；插件注释引用行号精确；`lib/index.js:274` 装配 `kind:'prefix'` 单路由 | ✓ |
| 2 | handler 全链 | `lib/index.js:90-126`（详见安全面核验） | ✓ |
| 3 | marker url 扩展 | `lib/service.js:2293-2306`（imageMarkerOf 附 url + imageAssetUrl 白名单单点）+ `lib/tool.js:53-60`（回退同构——**双白名单**：isAttachmentId 才产 url）；attachmentId 保留跨轮指代不变 | ✓ |
| 4 | 客户端折叠 + 缩略图 | `lib/client.js:3885-3968`（默认折叠 + 摘要行状态/耗时/错误 + 箭头）/ `:3736-3790`（RouteImage：url 直达 → onError 回落 RPC → 无 url 直接 RPC——旧产物兼容）/ `:3931-3950`（折叠态缩略图仅 url 产物零 RPC） | ✓ |
| 5 | 判别测试 | smoke 服务端（:2199/:2213/:2215/:2217/:2219/:2221/:2227/:2230）+ client-render 客户端（:1063/:1064/:1065/:1078/:1103/:1104/:1107/:1131）——RED 成立（旧代码无注册/无折叠） | ✓（计数口径见 P3-3） |

## 安全面核验（重点 1：路由安全）

- **路径解析链**：`new URL(req.url).pathname`（:93）→ `decodeURIComponent(slice)` 单次解码（:104）→ `isAttachmentId` 白名单（:108）。逐攻击形态：
  - `%2e%2e%2f` 编码穿越：解码后 `../` → 非 sha256:64hex → 404 ✓
  - `%252e` 双重编码：单次解码后 `%2e` → 非白名单 → 404 ✓
  - `..` 裸穿越：URL pathname 规范化后仍含 `..` → 非白名单 → 404 ✓（判别 :2217/:2219）
  - 双斜杠/内嵌斜杠：`/router-assets//x`、`aaa/bbb` → id 含非白名单字符 → 404 ✓
  - 大写 hex：ATTACHMENT_ID_RE（lib/attachments.js:38）`/^sha256:[0-9a-f]{64}$/i` **大小写不敏感**——大写 id 通过校验 → 读同一资产（宿主附件服务按哈希查）——无穿越/注入风险，仅「同一资产两个 URL 表示」（缓存键重复）——P3-2。
- **id 白名单字符集**：`sha256:` + 64 位 [0-9a-f]——固定前缀 + 严格字符集——**无路径穿越/注入空间** ✓。
- **响应头**：content-type 来自 `asset.mediaType`（:120）——来源 = `stored.ref.mediaType`（宿主权威 ref，lib/attachments.js:436-454 由 saveImage 时 sniff 写入或宿主返回）——**内部可信来源，非请求可控制**——无伪造空间 ✓。
- **缓存头**：200 → `public, max-age=31536000, immutable`（:123）——内容寻址（id 即内容哈希，字节不可变）强缓存安全 ✓；404 → 无 cache-control——Node http 无 Last-Modified → 浏览器启发式缓存不适用 → 404 实际不被缓存 ✓（P3-1：可显式 no-store 严谨化，低价值）。

## 安全面核验（重点 2：信息暴露）

- 路由无鉴权——本机端口任何进程/页面可拉图。**暴露度评估**：id 即密钥（sha256:64hex = 256-bit 内容哈希——不可枚举不可猜测——不知道 id 无法拉取）；id 存在于 marker 文本（会话日志——本机文件——同机进程本就能读）；内容为插件生成的图片（非敏感用户文件）——与宿主既有 `/router-oauth/callback` 无鉴权先例同面且暴露度更低（callback 承载敏感参数）——**接受**（P3-4 披露评估）。跨会话/跨 workspace：附件服务全局（与 imageData RPC 同权）✓。

## 安全面核验（重点 4：url 直达注入面）

- **插件自身生成面安全**：url 字段双白名单（service.imageMarkerOf :2296-2297 + tool.js markerOf :58——isAttachmentId 才产 url）——插件产物不可能带外链 url ✓。
- **客户端 RouteImage directUrl 无二次校验**（:3739 `ref?.url` 直接用为 img src :3767）——**攻击面**：sub-agent（用户配置的专业 agent/中转）输出伪造 marker `[router:image:{"url":"https://evil.example/t"}]` → parseMarkersOf（:3904）解析 → directRefs → 外链 img 请求。**影响评估**：img 跨域默认不带凭证；增量泄露 = 目标服务器看到用户 IP/UA——而 sub-agent 端点（用户配置的中转/模型服务）本就知道用户 IP 且已能读用户完整对话——**实际泄露面增量≈0**；无探测回传通道（onError 只回落 RPC 不外报）。信任面重叠，但**防御纵深缺口**：一行守卫（url 仅放行 `/router-assets/` + 白名单 id）成本极低——**P2-1（建议）**，不阻塞。

## 折叠交互核验（重点 3）

- 默认折叠（useState(false) :3888）+ 摘要行（标题/状态/耗时/错误消息/箭头 :3933-3945）——参考宿主 Think 条目交互 ✓；会话内展开态保持、刷新回折叠（默认折叠语义）✓。
- **错误可见性 P8**：折叠摘要行直接承载错误消息（:3942-3944）+ 展开态错误行（:3952）——错误态折叠可见 ✓（判别 :1078）。
- 折叠态缩略图仅 url 产物（:3932/:3946——零 RPC 零等待）✓；展开态全 refs（含旧无 url——RPC 回退 :3953-3957）✓。

## 与 EVO-011 marker 链路兼容（重点 5）

- 旧会话/新会话混合：旧无 url 标记（attachmentId 保留）→ 展开后 imageData RPC 回退（:3762/:3770）——零行为变化 ✓（判别 :1107：url 产物零 RPC + 旧产物 RPC 回落并存）；tool.js markerOf 同构回退（服务未挂载时工具行语义一致）✓；附件 id 跨轮指代不变（:2227 断言 attachmentId 保留）✓。

## AI 代码专项 5 项

| 项 | 结论 |
|---|---|
| mock 残留 | 无（smoke 附件后端桩为判别夹具）✓ |
| 硬编码 | 无（ASSETS_ROUTE_PREFIX 具名常量 + ATTACHMENT_ID_RE 既有单点）✓ |
| 幻觉 API | 无——宿主 webServer register/match 契约源码实测（:128-135/:269-279 逐行一致）；readStoredImage 为既有 FIX-007 单点 ✓ |
| TODO | 无 ✓ |
| 过度实现 | 无（单 prefix 路由 + handler + marker 扩展 + 折叠——各承载单一关注点）✓ |

## 发现清单

| 级别 | 位置 | 发现 | 影响 | 建议 |
|---|---|---|---|---|
| P2-1 | lib/client.js:3739/:3767 | RouteImage 的 directUrl 无客户端白名单二次校验——sub-agent 伪造 marker 可带外链 url 进 img src | 插件生成面双白名单安全；外链 img 增量泄露面≈0（sub-agent 端点已知用户 IP）；防御纵深缺口 | 建议：url 仅放行 `/router-assets/` 前缀 + isAttachmentId 白名单（一行守卫）；可遗留 |
| P3-1 | lib/index.js:98/:110/:116 | 404 响应无显式 no-store | Node http 无 Last-Modified → 启发式缓存不适用 → 实际不缓存 | 讨论项：显式 no-store 严谨化 |
| P3-2 | lib/attachments.js:38 | ATTACHMENT_ID_RE /i 允许大写 hex——同一资产双 URL 表示 | 缓存键重复、无安全影响 | 讨论项 |
| P3-3 | smoke/client-render | 声称「服务端 9 + 客户端 9 断言」vs 实测 8+8（grep check 计数） | 口径偏差（F-5 先例） | 讨论项：核准口径 |
| P3-4 | lib/index.js:90-126 | 无鉴权路由暴露评估：id 即密钥（256-bit 不可枚举）+ 内容为插件生成图片 + callback 先例同面 | 接受；跨会话同权（附件服务全局） | 讨论项：披露评估留档 |

## 结论

**APPROVED_WITH_NOTES**

unresolved_blockers=0

- P0=0 / P1=0 / P2=1（建议，可遗留）/ P3=4（讨论级）
- 5 项修复声称逐项核验通过；路由安全逐攻击形态核验（编码/双重编码穿越、双斜杠、内嵌斜杠、非白名单 id 全部 404）；响应头无伪造空间；缓存头内容寻址安全；暴露度评估接受；折叠交互与错误可见性（P8）达标；旧产物兼容与 EVO-011 链路兼容确认；AI 专项 5 项逐项有结论；无 P4-violation。
- 遗留台账：P2-1（url 白名单纵深守卫）列入建议，不阻塞；P3 讨论项无关闭截止要求。
