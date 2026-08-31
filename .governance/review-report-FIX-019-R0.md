# Review — FIX-019 R0（三幽灵卡判据单点化）

- **Round**: R0
- **Task**: FIX-019 — 幽灵卡三形态回归修复（EVO-010 迁移后统计键换马甲 + 宿主路由真条目）：①oauth:chatgpt（FIX-015 已覆盖）②chatgpt-oauth（无冒号插件路由 id）③openai-codex（宿主路由真 provider——providers 目录来源）
- **Commits**: `6e456ce`（isPluginRouteProvider 判据 + 统计键面消费点）+ `961aa13`（openai-codex 目录面消费点 + 判别），base b12dc5f
- **审查者**: Code Reviewer（R0）
- **日期**: 2026-08-31
- **范围说明**: 无命令面；门控采信 Coordinator 证据（16/16 套件 exit 0；镜像 hash 一致）。

## 审查证据链（全部可复查）

| 关注点 | 证据 | 结论 |
|---|---|---|
| 判据单点 | `lib/client.js:51` `isPluginRouteProvider = (id) => typeof id === 'string' && (id.startsWith('oauth:') \|\| id === OAUTH_ROUTE_PROVIDER \|\| id === HOST_ROUTE_ID)`；镜像常量 `:35` OAUTH_ROUTE_PROVIDER='chatgpt-oauth'（注释指 lib/oauth-llm.js:43 OAUTH_PROVIDER 权威）+ `:42` HOST_ROUTE_ID='openai-codex'（注释指 lib/host-route.js:55 HOST_ROUTE_PROVIDER 权威） | 三判据单点 ✓ |
| 4 消费点全覆盖 | `:1941-1944` addedAccounts（providers 目录来源 filter）/ `:1945-1950` addedAccounts（统计键来源）/ `:2100-2105` statsAccountRows（providers 目录来源）/ `:2120-2124` statsAccountRows（统计键来源）——addedAccounts/statsAccountRows × 目录/统计键两来源 = 4 点同判据 | ✓ |
| 判别测试 | `tests/client-render.mjs:1305-1364` 6 断言：:1323（chatgpt-oauth 统计键不渲染账号卡——旧代码必败）/ :1324（oauth: 前缀不回归）/ :1331（统计卡不含 chatgpt-oauth 行——第二过滤点）/ :1357（openai-codex 不渲染账号卡——961aa13 前必败）/ :1358（三键并存零幽灵）/ :1364（统计卡不含 openai-codex 行——providers 来源第二过滤点）；fixture 三键并存（:307/:368-373） | ✓ RED 两轮实证与断言结构吻合 |

## 关注点 1：判据完备性（第四形态？openai-codex-router twin）

- **twin 生成面**：wrapper.js:46-50 wrappableProviders = `llm.listProviders()` 全部（排除已带 WRAP_SUFFIX）——openai-codex 在宿主注册列表内 → active 模态下 wrapper 会注册 `openai-codex-router` twin（wrapper.js:534-538）。
- **twin 是否进入幽灵卡渲染面（推演 + 形状实证）**：client 的 `providers` 数组来自宿主 `llm.models` RPC（client.js:1529），条目形状含 `settingsNs/settingsPath`（client-render fixture :368-370 实证 `{ provider, displayName, settingsNs:'llm-pi-ai', settingsPath:['providers','openai-codex'], active, declared }`）——**该列表源自 llm-pi-ai settings providers dict 描述**；wrapper twin 只经 `llm.registerAdapter` 注册（wrapper.js:537）、不写 llm-pi-ai settings dict → **openai-codex-router 不进 providers 数组 → 不进 addedAccounts/statsAccountRows 目录来源** ✓。
- **统计键面**：wrapper twin 的调用 record 在宿主 llm 统计侧（createWrapAdapter → llm.stream 委托），不进插件 `stats.accountTotals`（插件 stats 只记插件自身 record——oauth-llm/专业 agent 通路）→ twin 统计键不出现 ✓。
- **结论：无第四形态**（推演前提 = llm.models providers 数组源自 settings dict——经 fixture settingsPath 形状实证；twin 在模型选择器的组条目属正常可用面，非幽灵卡）。P3-1 标注推演边界。

## 关注点 2：镜像常量漂移风险

- 镜像常量（client.js:35/:42）为**跨环境复制**（浏览器 bundle 无法 import 服务端模块 lib/oauth-llm.js / lib/host-route.js——架构必要），注释已指权威单点 ✓。
- **同步守卫现状**：间接链存在——oauth-main-model.mjs ROUTE-0 断言权威常量值（`HOST_ROUTE_PROVIDER === 'openai-codex'` 等）；client-render fixture 键名跟随产品——若产品改 id，ROUTE-0 红 → fixture 与镜像常量被手改同步。但**无「镜像常量 = 权威单点」的直接断言**（fixture 注入的键名绕过镜像常量本身——镜像常量漂移而 fixture 跟随产品时，测试仍能抓到（新键名不被 isPluginRouteProvider 匹配 → 幽灵卡渲染 → 断言必败）——漂移可被间接捕获，但依赖 fixture 手工跟随）。**P3-2 建议**：client-render（Node 环境）可 import lib/oauth-llm.js 的 OAUTH_PROVIDER / lib/host-route.js 的 HOST_ROUTE_PROVIDER 并断言与镜像值相等——机械守卫。

## 关注点 3：providers 目录过滤误伤面

- 判据精确匹配 'chatgpt-oauth'/'openai-codex' + 'oauth:' 前缀——无通配；用户手动配置的任意其它 provider（含 'openai-codex-router' 类衍生名）不受影响；'oauth:' 前缀为服务端统计键保留形态（service.js `oauth:${accountId}`/`oauth:pool:${poolId}` 实证，FIX-015 R0 已核）——用户自定义 provider 以 oauth: 开头仅理论可能（llm-pi-ai provider 命名空间无该保留字声明），且该场景显示层隐藏的代价可接受。**无误伤** ✓。

## 关注点 4：AI 专项快查

| 项 | 结论 |
|---|---|
| mock 残留 | 无（fixture 注入显式）✓ |
| 硬编码 | 无（镜像常量跨环境复制为架构必要，注释指权威单点；非散落硬编码）✓ |
| 幻觉 API | 无（判据纯字符串比较；消费点全为既有渲染循环）✓ |
| TODO | 无 ✓ |
| 过度实现 | 无（单判据函数 + 4 消费点最小改动）✓ |

## 发现清单

| 级别 | 位置 | 发现 | 影响 | 建议 |
|---|---|---|---|---|
| P3-1 | lib/client.js:51（判据） | openai-codex-router twin 形态经推演排除（wrapper twin 不进 llm-pi-ai settings 描述面、不进插件 stats），但推演前提（llm.models providers 数组源自 settings dict）无宿主源码直证（fixture settingsPath 形状为间接证据） | twin 若未来经 settings 面暴露（wrapper 行为变化）→ 判据需补 'openai-codex-router' 或后缀通配 | 讨论项：可在宿主 llm.models 实现确认 providers 构造源后闭环 |
| P3-2 | lib/client.js:35/:42（镜像常量） | 镜像常量与权威单点（oauth-llm.js:43 / host-route.js:55）无直接相等断言——漂移可被间接捕获（fixture 跟随 + ROUTE-0）但机械性弱 | 未来改 id 需三处手改同步（权威/镜像/fixture），漏改会被测试抓到但依赖同步纪律 | 建议：client-render 从 lib import 权威值断言镜像相等（Node 环境可 import） |

## 结论

**APPROVED_WITH_NOTES**

unresolved_blockers=0

- P0=0 / P1=0 / P2=0 / P3=2（讨论级）
- 判据单点 + 4 消费点全覆盖核验通过；6 判别断言与 RED 两轮实证吻合；第四形态（twin）推演排除（含形状实证）；误伤面精确匹配零误伤；AI 专项 5 项逐项有结论；无 P4-violation。
- 遗留台账：P3-1/P3-2 为讨论/建议项，无关闭截止要求。

## 321a5ef 增量审查（判据语义拆分，纯重构）

- **Commit**: `321a5ef`（lib/client.js + tests/served-client.js 镜像，+78/-54）
- **声称**: 纯语义拆分——isPluginRouteProvider（oauth 面）/ isHostManagedRoute（宿主路由面）/ isPluginSelfRegisteredProvider（组合单点）三函数，4 过滤点全部改引组合单点；行为与 961aa13 等价
- **日期**: 2026-08-31

### 等价性判定：**成立（判据集合逐项不变）**

| 比对项 | 961aa13（拆分前） | 321a5ef（拆分后） | 结论 |
|---|---|---|---|
| 判据集合 | `oauth: 前缀 \|\| chatgpt-oauth \|\| openai-codex`（单一 isPluginRouteProvider） | `isPluginRouteProvider(id) \|\| isHostManagedRoute(id)` = `(oauth: 前缀 \|\| chatgpt-oauth) \|\| openai-codex`（client.js:58-60） | 布尔并集重组，真值表逐项相同 ✓ |
| 4 消费点 | 全引单一判据（:1944/:1950/:2105/:2124 旧版） | 全引 isPluginSelfRegisteredProvider（:1954 addedAccounts 目录 / :1961 addedAccounts 统计 / :2117 statsAccountRows 目录 / :2136 statsAccountRows 统计） | 位置与语义一一对应 ✓ |
| 镜像常量 | OAUTH_ROUTE_PROVIDER='chatgpt-oauth'（:35）/ HOST_ROUTE_ID='openai-codex'（:43） | 未动（值同） | ✓ |
| 注释权威引用 | :36-37 指 lib/host-route.js:55 | 未动；host-route.js:55 `HOST_ROUTE_PROVIDER = 'openai-codex'`（R0 已核）+ oauth-llm.js:43 `OAUTH_PROVIDER = 'chatgpt-oauth'`（本次实测）——**两处行号均精确** | ✓ |

### 拆分语义质量

- 两语义面各自独立演进（oauth 面未来加形态只改 isPluginRouteProvider；host 面只改 isHostManagedRoute）——组合单点免于过滤点重复展开（P5 单点化声明 :53-57 与实现一致）✓。
- 三函数纯谓词（无副作用/无新状态）；消费点仅换函数名；注释语义准确（oauth 面 = 统计键 + 插件路由 id；host 面 = 真 provider 目录条目须显式排除）✓。

### 无新引入

- 无新状态/新依赖/新 I/O；镜像 hash 一致（Coordinator 采信）；门控 16/16 采信 ✓。

### 增量结论

**APPROVED**（无新增 findings；等价性成立，重构纯化语义面，注释行号引用实测精确）
- P0=0 / P1=0 / P2=0 / P3=0（新增）
- R0 既有 P3-1/P3-2 台账维持不变。
