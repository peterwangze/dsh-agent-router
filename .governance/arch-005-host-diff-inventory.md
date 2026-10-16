# ARCH-005 — DSH 宿主 0.1.5-rc.2 → 0.2.0-rc.2 依赖/契约全量 diff 清单

> - **生成时间**: 2026-10-16，Analyst Agent（ARCH-005）
> - **被分析变更**: DSH 宿主升级（外部变更）——旧宿主 **dsh-* 全系 0.1.5-rc.2 + cordis 4.0.1 + schemastery 3.18.1** → 新宿主 **@deepseek-ai/dsh 0.2.0-rc.2（全系 dsh-* 统一 0.2.0-rc.2）+ cordis 4.0.5 + schemastery 3.18.4**。本清单为后续适配实施批的事实基线。
> - **基线框架**: `.governance/arch-004-dependency-inventory.md`（A~G 七类 63 条）——本文按其框架逐类复核并更新到当前树（插件 v0.5.0，含 lib/host-abi/ 八域重构后的消费点锚点）。
>
> ## 取证树（全部实读，零记忆填空）
>
> | 树 | 路径 | 版本 | 角色 |
> |----|------|------|------|
> | **旧树（权威）** | `D:\AI\agent\deepseek\plugins\router\node_modules\@deepseek-ai\` | 13 包：cordis 4.0.1 / schemastery 3.18.1 / dsh-agent·dsh-agent-default-model·dsh-attachment·dsh-credentials·dsh-llm·dsh-session·dsh-settings·dsh-subagent·dsh-system-prompt·dsh-tools·dsh-typert-protocol 全部 0.1.5-rc.2 | 插件自身依赖树 = 旧宿主面（仅插件直接依赖的 13 包） |
> | **新树（权威）** | `C:\Users\peter\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\` | dsh 0.2.0-rc.2 主包 + 约 220 个 dsh-*/支持包全部 0.2.0-rc.2（抽查 36 包全中）+ cordis 4.0.5 + schemastery 3.18.4 | 新宿主面 |
> | **旧侧旁证（辅助，版本差已标注）** | `C:\Users\peter\AppData\Local\npm-cache\_npx\1e7f6d9597241db0\node_modules\@deepseek-ai\` | **0.1.5-rc.3**（ARCH-004 所用 checkout 已漂移 rc.2→rc.3） | 仅用于旧树缺失包（api-remotes/typert-registry/attachment-local/client-ui-* 等）的旧侧形状旁证；凡引用处标注「rc.3 旁证」 |
>
> - **旧树覆盖缺口（诚实声明）**: 旧树仅 13 包——插件经宿主运行时间接消费的包（dsh-api-remotes/dsh-api-gateway/dsh-typert-registry/dsh-agent-presets/dsh-agent-loop/dsh-attachment-local/dsh-credentials-local/dsh-fs-local/dsh-api-session-controller/dsh-host-webserver/dsh-client-*/dsh-app-boot/dsh-home-paths 等）不在其中。这些面的旧侧锚点 = ARCH-004 实录（当时 0.1.5-rc.2 实读）+ rc.3 旁证树实读，两者一致性已抽查核对；新侧锚点全部来自新树本次实读。
> - **分级定义**: **breaking**（插件当前实现会坏） / **additive**（新增能力，可选适配） / **neutral**（无影响或仅维护性漂移）。
> - **机核证据**: semver 判定与 schemastery volatile 探针均为本机 node 实跑输出（见 HD-001/HD-010）。

---

## §0 执行摘要（先读）

**插件 v0.5.0 在 0.2.0-rc.2 宿主上无法工作，但断裂点集中且可修复。** 三道加载链门 + 一处功能降级：

1. **HD-001（安装链）**: 0.2.0 新增 peerDependencies 兼容性硬门控，插件 `^0.1.5-rc.2` 对 `0.2.0-rc.2` semver 不满足 → bundle 整层被 skip，插件完全不加载（0.1.5 时代「静默满足」通道被宿主自己关闭——RISK-003 的宿主侧解药）。
2. **HD-002（settings 架构换代）**: `ctx.settings.register(ns, schema, {applies:'live'})` 与 `settings/updated` 事件双双消失——settings 从「运行时注册制」改为「插件 Config 导出声明制 + volatile 字段写入门」。插件 `lib/index.js:237` 在 apply 期同步 throw → 服务端插件加载失败。
3. **HD-003（RPC codec 契约）**: strict codec 从 `{schema: <schemastery>}` 改为 `{create: () => schema}` 惰性工厂，typert-registry 对无 `create()` 的 strict codec 直接 throw——插件 19 条描述子的**双注册路径（服务端 typert.register + 客户端 $mount）全数被拒**。
4. **HD-004（图片直传）**: `conversation.createDraftImages` + `inputActions.addImages` 面消失（新 InputActions = `addAttachments`）——插件有守卫，降级为「图片直传不可用」提示，非崩溃。

**存续面占绝对多数**：llm 适配器契约（含 FIX-033 的 imageRequestPricing）、FIX-029/030 的 sessionController/sessionProjections 链、FIX-003 的附件链、FIX-048 的 InputState attachmentIds 主面、五客户端 remote 命名空间 wire schema、全部槽位/事件名/路径约定——逐项双树实读一致（§4 存续面核对表）。历史断裂五族中四族不复发，FIX-048 半面复发（HD-004）。

---

## §1 插件宿主面复核（ARCH-004 框架 → 当前 v0.5.0 树）

插件自 ARCH-004 后新增 `lib/host-abi/` 八文件域层（health/version/client-remotes/llm-selection/ctx-services/events/inject-manifest + index 桶），把宿主面收敛为探测+降级信封体系。当前树宿主面消费点（全部本次实读）：

| # | 域/模块 | 宿主面 | 当前树锚点（复核过） |
|---|---------|--------|----------------------|
| 1 | host-abi/ctx-services.js | 11 ctx 服务方法契约（CTX_SERVICES）+ 严格面三服务 | lib/host-abi/ctx-services.js:50-73 |
| 2 | host-abi/client-remotes.js | 客户端 remote.* 五命名空间方法面 + modelDirectories 等价读 + joinProviderDirectoryHost | lib/host-abi/client-remotes.js:41-47/:101-291/:304-326 |
| 3 | host-abi/llm-selection.js | llm 三方法/registerAdapter 面、sessionController 单形态、inheritedRouteOf、liveDefaultSelection、sessionNeverProduced | lib/host-abi/llm-selection.js:45-195 |
| 4 | host-abi/events.js | MANAGED_EVENTS 五事件 + FORWARDED_EVENT_ALLOWLIST 19 项镜像 + subscribeEvents | lib/host-abi/events.js:35-70/:161-236 |
| 5 | host-abi/inject-manifest.js | FIBER_INJECT 九面 + CLIENT_PACKAGE_INJECT 三包 | lib/host-abi/inject-manifest.js:27-48 |
| 6 | host-abi/version.js | dsh-llm/dsh-tools/dsh-typert-protocol package.json 版本读 | lib/host-abi/version.js:36-55 |
| 7 | lib/index.js | settings.register / typert.register / webServer.register×2 / settings/updated 订阅 | lib/index.js:237/:270/:305/:308/:318 |
| 8 | lib/rpc.js + lib/client.js 镜像 | 19 条 strict 描述子（id/service/namespace/method/invocation/parameters/result）+ $mount | lib/rpc.js:22-42/:222-257；lib/client.js:356-405/:5783/:5808 |
| 9 | lib/client.js 输入态 | useInput 快照 / attachmentIds+imageIds 双形态计数 / resolveDraftAttachments / createDraftImages+addImages / setDraft | lib/client.js:4520-4533/:4585-4608/:4857-4863/:4793-4805 |
| 10 | lib/service.js | settings.describe/mutate/writable、attachments、fs、subagents、agentDefaultModel、llm stream/listModels/resolveModelInfo、host-route 维护链 | lib/service.js:2879-2880/:3673/:3679/:3691-3692 |
| 11 | lib/host-route.js | settings.get/mutate('llm-pi-ai')、credentials resolve/set/unset、llm.listModels/resolveModelInfo | lib/host-route.js:209/:324/:363/:387/:430 |
| 12 | lib/wrapper.js + lib/oauth-llm.js | llm.registerAdapter twin/oauth 适配器（providerRetryPolicy/imageRequestPricing/prepareCall/stream）、llm/adapters-updated + settings/updated 热同步 | lib/wrapper.js:329-361/:654-657；lib/oauth-llm.js:315-359/:549-552 |
| 13 | lib/prestep.js + lib/preset-defaults.js | agent/pre-step、createUserMessage、sessionProjections.stateOf、agentDefaultModel、agents.get、agentPresets.composedPreset、agent/created、agent-preset/selected、sessionController.selectModel | lib/prestep.js:35/:146-161；lib/preset-defaults.js:139-273 |
| 14 | lib/tool.js | defineTool、tools.register、systemPrompt.section、ctx.get('router') | lib/tool.js:24/:30/:61/:221 |
| 15 | tests/host-version-snapshot.mjs | HOST_BASELINE 常量（dsh 0.1.5-rc.1 / dsh-* 0.1.5-rc.2 / cordis 4.0.2 / schemastery 3.18.2） | tests/host-version-snapshot.mjs:46-51 |
| 16 | package.json | dsh.bundle.patch / dsh.client.inject 三包 / 8 peerDeps ^0.1.5-rc.2 / 3 dsh deps ^0.1.5-rc.2 | package.json:20-31/:56-73 |

---

## §2 Breaking findings（插件当前实现会坏）

### HD-001 【安装链｜breaking】0.2.0 新增 peerDependencies 兼容性硬门控——`^0.1.5-rc.2` 不满足 `0.2.0-rc.2`，插件 bundle 整层被 skip

| 字段 | 内容 |
|------|------|
| 双树锚点 | 旧：0.1.5 无此机制（ARCH-004 E-8 实录：peerDeps semver 静默满足 + 宿主 runner 零 enforcement——RISK-003「无预警通道」）→ 新：`<new>dsh-app-boot/lib/index.js:286`（`evaluatePluginCompatibility`——对 manifest 中全部 `@deepseek-ai/dsh`/`dsh-*` peerDeps 逐项 `semver.satisfies(runtimeVersion, range, {includePrerelease:true})`）；`:930-931`（`loadProfileDirectory` 组合点：`issue !== void 0 && !issue.exempted` → throw → catch 进 `skippedBundles`）；豁免通道 = `dsh plugin allow-version` / plugin manager（`:325-430` compatibility.json 体系） |
| 插件消费点 | package.json:64-73（8 peerDeps 全部 `^0.1.5-rc.2`）；宿主版本守卫 tests/host-version-snapshot.mjs:46-51（HOST_BASELINE 待刷新——见 §7） |
| 机核证据 | 本机 node + 新树 semver 实跑：`semver.satisfies('0.2.0-rc.2','^0.1.5-rc.2',{includePrerelease:true})` = **false**（8 项 peerDeps 全不过；对照 cordis `4.0.5`/^4.0.1 = true、schemastery `3.18.4`/^3.18.1 = true——dependencies 不在此门控范围，仅 peerDeps） |
| 用户可见症状 | 插件**完全不加载**：启动 stderr 打印 `skipping profile bundle "dsh-agent-router"` + `pluginCompatibilityWarning`（提示 crash/data-loss 风险 + `dsh plugin allow-version` 豁免法）——§1 全部功能域（设置页/路由/图片接管/统计/预设/OAuth）整体消失 |
| 域归类 | 安装链（波及全部功能域） |
| 适配方向 | 插件 peerDeps/dependencies 版本范围升至 `^0.2.0-rc.2` + HOST_BASELINE/README/host-contract 四处同步刷新（host-version-snapshot.mjs 文件头既定流程） |

### HD-002 【设置页+路由+统计+预设｜breaking】settings 架构换代：`settings.register(ns, schema)` 与 `settings/updated` 双消失（运行时注册制 → Config 导出声明制 + volatile 写入门）

| 字段 | 内容 |
|------|------|
| 双树锚点 | 旧：`<old>dsh-settings/lib/index.js:281`（`register(ns, schema, options)`）、`:288`（`applies: options?.applies ?? "live"` 默认 live）、`:566`（`settings/updated` 提交事件 emit）、`:593`（listener 失败 warn 容错）→ 新：`<new>dsh-settings/lib/index.js:322-544`（`SettingsForms` 方法面 = `configure:370` / `invalidate:382` / `prepareDocument:406` / `describe:413` / `update:470` / `replace:479` / `mutate:488` / `write:501` / `schema:538`——**无 `register`、无 `get(ns)`**）；唯一事件 = `settings/document-updated`（`:435`/`:461`，`write()` 尾部 `:537` 自调 `describe()` 的变更检测触发）；ns schema 来源 = `entry.fiber.runtime.Config`（`:539-541`——插件条目导出的 Config，经 app-boot 投影：`<new>dsh-app-boot/lib/index.js:2160`「plugin Config export」）；写入门 = `isVolatilePath`（`:153-157`——非 volatile 字段写 throw `Config field ... is not volatile`，`:506-508`）；写路径 ns 解析 = `configEditor.entries().find(row => row.options.id === ns)`（`:502-504`，找不到 throw `No configurable plugin entry`）。**全树 grep `settings/updated` 0 命中**（仅 `settings/document-updated`，`<new>dsh-settings/lib/types/types.d.ts:73`） |
| 迁移先例（新宿主自证） | `<new>dsh-llm-pi-ai/lib/index.js:1051`：`providers: z.dict(profile).default({}).volatile()`——pi-ai 以 Config 导出 + volatile 字段获得可写 settings 面 |
| 插件消费点 | ① `lib/index.js:237`（`ctx.settings.register(ROUTER_NS, routerSchema, {applies:'live'})`——**apply 期同步 throw → 服务端插件加载失败**，第一断点）；② `lib/host-route.js:209`/`:430`（`settings.get(HOST_ROUTE_NS)`——方法消失；:430 有 typeof 守卫降级，:209 读路径断）；③ `settings/updated` 四订阅点全死订阅（`lib/index.js:270` stats 持久化 / `lib/service.js:2880` host-route 维护热同步 / `lib/wrapper.js:657` twin 热同步 / `lib/oauth-llm.js:552` OAuth provider 热同步——订阅不 throw（cordis 任意事件名可订），事件永不触发）；④ `lib/host-abi/events.js:36`（MANAGED_EVENTS 含 `settings/updated`） |
| 用户可见症状 | 修复 HD-001 后立即暴露：插件 apply 在 settings.register 处 throw → 服务端整体加载失败（症状同 HD-001，但根因在本行）。即便绕过：host-route 维护失去事件触发（仅剩 boot 首跑 + 30s tick）；twin/OAuth 热同步失活（改设置需重启）；stats 持久化不随配置变化触发 |
| 域归类 | 设置页（ns 声明）/ 路由（host-route 读写 llm-pi-ai）/ 统计（持久化触发）/ 预设（经插件加载链） |
| 适配方向 | ① 插件条目改为导出 `Config`（schemas.js 的 routerSchema 加 `.volatile()` 标注 + 导出形态对齐 cordis 插件 Config——先例 pi-ai :1051）；② `settings.get(ns)` 读替代 = `describe().find(row => row.ns === ns).value`；③ `settings/updated` 订阅迁移至 `settings/document-updated`（ns 过滤语义保留，参数序 (ns, revision) 兼容单参消费）；④ 注意触发时机差异：新事件在 write() 尾部 describe() 变更检测后发（见 §6 T-5） |
| 附带核对 | `settings.mutate(ns, ops, expectedRevision)`（新 :488）/ `describe({redactSecrets:true})`（新 :413）/ `writable` getter（新 :396）**均存续**——service.js:3673/:3679/:3691 的消费面兼容（前提 = ns 成为可配置条目） |

### HD-003 【RPC 面（全域）｜breaking】strict codec 契约 `schema` → `create()` 惰性工厂——插件 19 条描述子双注册路径全数被拒

| 字段 | 内容 |
|------|------|
| 双树锚点 | 旧：rc.3 旁证 `<aux>dsh-typert-registry/lib/index.js:547-551`（`validateCodec`：`typeof codec.schema.parse !== "function"` → throw `strict codec has no parse() method`——0.1.5 codec 形态 = `{mode:'strict', typeSymbol, schema: <schemastery schema>}`，与插件描述子逐字吻合）→ 新：`<new>dsh-typert-registry/lib/index.js:555-566`（`validateCodec`：`typeof codec.create !== "function"` → throw `typert: ${subject} strict codec has no create() factory`）。宿主自身描述子新形态实证：`<new>dsh-api-remotes/lib/client.js:11666-11680`（`codec: {mode:"strict", typeSymbol, create: <lazy $schema 工厂>}`） |
| 校验路径（双通道实读） | 服务端：`ctx.typert.register` → `<new>dsh-typert-registry/lib/index.js:398`（`TypertRegistry.register`）→ `localStore.validate` → `validateInvocation:522-552` → `validateCodec:563`（对 result + 每参数 + context codec 逐一强制 create）。客户端：`ctx.remote.$mount` → `<new>dsh-api-gateway/lib/client.js:1637`（$mount 仍存续）→ `:1662-1663` `mountContribution` → `callerCtx.typert.remotes.register(contribution)` → `<new>dsh-typert-registry/lib/index.js:141-160`（`RemoteStore.register`）→ `descriptors.validate:69-81` → 同一 `validateInvocation`。注意网关自身 `requireStrictCodec`（`<new>dsh-api-gateway/lib/client.js:2067-2075`）仍只查 `mode==='strict'`——但 typert 侧 create() 校验在其后拦截 |
| 插件消费点 | `lib/rpc.js:22-42`（`parameter(name, codec)` / `result(name, codec)` 产出 `{mode:'strict', typeSymbol, schema: codec}`）+ `:222-232`（`createHostContribution()`——服务端 host face）+ `:248-257`（`ROUTER_REMOTE`）；浏览器镜像 `lib/client.js:402-405`（`parameter`/`resultOf` 同形）+ `:5783`（`const inject` 九面）+ `:5808`（`ctx.remote.$mount(ROUTER_REMOTE).catch(...)`——有 catch，客户端降级不崩）；服务端 `lib/index.js:305`（`ctx.typert.register(createHostContribution())`——**apply 期 throw，第二断点**，位于 HD-002 断点之后） |
| 用户可见症状 | 服务端：typert.register throw → 插件 apply 失败（与 HD-002 叠加）。客户端：$mount 被 catch → `remote.router` 19 方法全缺 → 设置页/健康面板/catalog/stats/OAuth 面全部落入 B2 降级信封（`host-face-shape` / 方法缺失形态——不整页崩，但功能面全灰） |
| 域归类 | RPC 面（波及设置页/统计/图片接管/OAuth/上传全部 RPC 消费） |
| 适配方向 | 描述子 codec 机械迁移：`{mode:'strict', typeSymbol, schema}` → `{mode:'strict', typeSymbol, create: () => schema}`（schemastery schema 对象不变，仅包装为惰性工厂）；同步点 = lib/rpc.js + lib/client.js 镜像 + tests/rpc-shadow-guard.mjs 判据 |

### HD-004 【图片接管｜breaking（守卫降级型）】`conversation.createDraftImages` + `inputActions.addImages` 面消失——新 InputActions = `addAttachments`

| 字段 | 内容|
|------|------|
| 双树锚点 | 新：`<new>dsh-client-ui-conversation/lib/client.js:13471-13495`（`SessionInputShell.actions` = `captureInsertion` / `insertText` / `setDraft` / **`addAttachments(ids)`** / `removeAttachment` / `pruneAttachments` / `submit`——**无 `addImages`**）；`createDraftImages` 在新树 conversation + file-upload 包 **0 命中**。旧：插件旧树无 dsh-client-ui-conversation 包；rc.3 旁证 `<aux>dsh-client-ui-conversation/lib/client.js:12631`（`addAttachments` 已是 0.1.5-rc.3 形态）、`:16776`（`shell.addAttachments(...)` / `conversation.releaseDraftAttachments(drafts)`）——**0.1.5-rc.2 原始形状无法直接取证**（两棵可用树均无 `createDraftImages`/`addImages`，见 §6 T-1） |
| 插件消费点 | `lib/client.js:4857-4863`（AttachButton 图片直传：`conversationSvc.createDraftImages(images)` + `inputActions.addImages(ids)` + `conversationSvc.releaseDraftImages(created)`——**入口有完整守卫**：缺任一面 → `setError(t('attachUnavailable'))` 返回，不崩） |
| 用户可见症状 | AttachButton 选择图片文件 → 显示「不可用」错误提示（降级）；非图片文件上传路径（uploadFile RPC + `inputActions.setDraft`——setDraft 新树存活 `:13551`）不受影响；FIX-048 的 InputState 计数面（attachmentIds）不受影响（见 §5） |
| 域归类 | 图片接管（attach 直传子面） |
| 适配方向 | 图片直传迁移至新通道：宿主原生形态 = 上传得到 attachment id 后 `inputActions.addAttachments(ids)`（rc.3 旁证 :16776 先例：drafts → `addAttachments(drafts.map(d => d.id))` 失败则 `releaseDraftAttachments`）；与插件自有 uploadFile RPC 组合或复用宿主 file-upload 通道（`<new>dsh-client-file-upload/lib/client.js:179` `upload(sessionId, data, name, signal, onProgress)`） |

---

## §3 Additive findings（新增能力，可选适配）

| ID | 面 | 双树锚点 | 说明 / 插件机会 |
|----|----|---------|----------------|
| HD-006 | llm 服务新方法 `registerConfigurableProviders` / `registerModelDiscovery` | 新 `<new>dsh-llm-pi-ai/lib/index.js:2624`（`ctx.llm.registerConfigurableProviders(entries)` + `directory.replace`）/:2608（`ctx.llm.registerModelDiscovery(settingsNs, handler)`）——0.1.5 rc.3 旁证已有同面（`<aux>:2624/:2639`） | 目录/探测注册的新官方通道；插件 probe/discover 路可选迁移（非必需） |
| HD-007 | `credentials/record-updated` 事件（凭据记录级扇出） | 新 `<new>dsh-credentials/lib/index.js:127-132`（`fanOut("credentials/record-updated", key)`）——旧仅 reference-updated（`:113-124` 双树同形存续） | additive；账号池管理可选订阅 |
| HD-008 | session RPC 命名空间扩容（attachment/cancel/canOpenWorkspacePath/updateQueue/list 等） | 新 `<new>dsh-api-remotes/lib/client.js:11256-11523`（session 命名空间描述子群） | additive；插件消费的 `modelCatalog`/`selectModel` 原样存续（§4） |
| HD-009 | settings RPC 命名空间新描述子（describe/mutate 之外） | 新 `<new>dsh-api-remotes/lib/client.js:6023`/`:6042`/`:6092` | additive（字段级形状未逐项比对——§6 T-2） |
| HD-010 | schemastery `.volatile()` meta（3.18.4 新增） | 机核实跑：新 schemastery 3.18.4 `z.string().volatile()` → meta `{volatile:true}` ✓；旧 schemastery 3.18.1 同表达式 **TypeError: volatile is not a function**；rc.3 旁证 pi-ai `volatile` 计数 0 vs 新 :1051 在用 | additive；是 HD-002 适配的依赖面（插件 dependencies 的 ^3.18.1 在旧树不破坏，新树自然可用） |
| HD-011 | 插件管理器族 + 版本豁免机制（dsh-plugin-manager / dsh-client-ui-plugin-manager / dsh-host-plugin-inventory / compatibility.json / `dsh plugin allow-version`） | 新 `<new>dsh-app-boot/lib/index.js:325-430` + `<new>dsh-plugin-manager/lib/index.js:226-254` | additive；HD-001 的宿主侧解药面（用户显式豁免可强制装载不兼容插件——适配批不应依赖它，应正升版本） |
| HD-012 | `dsh-agent-presets`（复数）包拆分为 `dsh-agent-preset` + `dsh-agent-preset-registry` | 新树包清单（无复数包）；服务面完整存续：`<new>dsh-agent-preset-registry/lib/index.js:481`（`super(ctx, "agentPresets")`）、`:723`（`composedPreset(ctx)`）、`:489`（`ctx.emit("agent-preset/selected", session.id, event.data.agentPreset)` 双参形态不变）vs rc.3 旁证 `<aux>dsh-agent-presets/lib/index.js:1327` 同形态 | neutral（对插件零影响——服务名/方法/事件/载荷全同；包内部重组） |

---

## §4 存续面核对表（neutral——双树实读一致，防确认偏差专区）

> 以下为插件全部关键依赖面在 0.2.0-rc.2 的逐项实读结果。**每行 = 插件消费点期望 vs 新树实际形状一致**。

### 4.1 服务端 ctx 服务（A 类映射）

| ARCH-004 条 | 面 | 旧树/旁证锚点 | 新树锚点 | 判定 |
|------------|----|--------------|---------|------|
| A-2 | typert 服务名 + register 面 | ARCH-004 :398 | `<new>dsh-typert-registry/lib/index.js:359`（`super(ctx,"typert")`）+ `:135` view register | ✅（校验面变化见 HD-003） |
| A-4 | llm.registerAdapter(providers, adapter) | `<old>dsh-llm/lib/index.js:1780` | `<new>dsh-llm/lib/index.js:1833` | ✅ |
| A-4 | LlmAdapter 基类 prepareCall(provider, model, signal) | `<old>:1681` | `<new>:1734`；分发位 `:2292`（adapterStream 先 `adapter.prepareCall(options.provider, options.model, options.signal)`）+ llm 级 `:2203-2205` | ✅ FIX-001 断裂位协议不变 |
| A-4 | imageRequestPricing 适配器直调（FIX-033 契约） | `<old>:1645`（基类空体默认） | `<new>:1697`（基类空体默认）+ `:2050-2051`（`adapters.get(provider)?.adapter.imageRequestPricing(provider, model)` 直调） | ✅ 不复发 |
| A-4 | llm/adapters-updated | `<old>:1753` | `<new>:1806` | ✅ |
| A-4 | resolveModelInfo 返回 context.contextWindow + inputModalities | ARCH-004 T-9 | `<new>dsh-llm/lib/index.js:2098-2103` + `:2116-2126`（normalizeModelInfo：`context:{contextWindow}` + `inputModalities` 双字段在返回形状）；pi-ai 目录链 `<new>dsh-llm-pi-ai/lib/index.js:675-689`（contextWindow 正整数校验）/`:1005` | ✅ host-route probe 判据 + service.js:1302 modality 消费均兼容 |
| A-4/E-2/E-3 | BlockAssembler / createUserMessage / `./message` 子路径 | `<old>dsh-llm/lib/index.js:899`；`<old>dsh-llm/lib/types/message.js:45` | `<new>dsh-llm/lib/index.js:59` + `:2390` 导出表（BlockAssembler/createUserMessage/createAssistantMessage 全在）+ exports["./message"] | ✅ createUserMessage(input) 契约逐字同形（新旧对照实读） |
| A-5 | agentDefaultModel.currentSelection/saveSelection | ARCH-004 :57/:66 | `<new>dsh-agent-default-model/lib/index.js:38`/`:53` | ✅ |
| A-6 | agents 注册表 + get | ARCH-004 :299 | `<new>dsh-agent/lib/index.js:332`（`super(ctx,"agents")`）+ `:594-595`（`get(id)`） | ✅ |
| A-7 | subagents.start + 'spawn' + agentOptions/toolFilter/persona | ARCH-004 :3145/:13/:17-28 | `<new>dsh-subagent/lib/index.js:2834` + `:3115`（`async start(name, request)`）；`<new>dsh-subagent-spawn-in-process/lib/index.js:13`（默认 providerName **"spawn"**）+ `:24-28`（三 capabilities 显式声明） | ✅ |
| A-8 | credentials.resolve/set/unset + reference-updated | ARCH-004 :473/:513/:517/:113-124 | `<new>dsh-credentials-local/lib/index.js:473`/`:513`/`:517`；`<new>dsh-credentials/lib/index.js:124`（`fanOut("credentials/reference-updated", ref)`） | ✅ D-2 修复面（插件已用新名）继续有效 |
| A-9 | attachments.saveImage/readImage + v1 布局（FIX-003 面） | ARCH-004 :1020/:1024/:284（rc.3 旁证同） | `<new>dsh-attachment/lib/index.js:207`（`super(ctx,"attachments")`）；`<new>dsh-attachment-local/lib/index.js:1031`（`saveImage(input)`）/`:1035`（`readImage(ref, signal)`）/`:292`（root = `DSH_HOME/attachments/v1`） | ✅ 不复发 |
| A-10 | fs.readBytes(target, signal, maxBytes) | ARCH-004 :794 | `<new>dsh-fs/lib/index.js:60`（`super(ctx,"fs")`）；`<new>dsh-fs-local/lib/index.js:837`（三参签名逐字同） | ✅ |
| A-11 | sessionController 服务 + selectModel（FIX-030 面） | ARCH-004 :2726/:605 | `<new>dsh-api-session-controller/lib/index.js:382`（`super(ctx,"sessionController",{namespace:"session"})`）+ `:720`（`async selectModel(request)`） | ✅ 不复发；apiProxy 新树全树 grep **0 注册**（回落分支死码状态与 0.1.5 一致） |
| A-12 | sessionProjections.stateOf + {lastUsed, pending}（FIX-029 面） | ARCH-004 :2044-2046/:2075 | `<new>dsh-api-session-controller/lib/index.js:284`（同款消费 `stateOf(agent.session,"modelSelection")`）+ `:2058-2061`（schema：`lastUsed`/`pending` 双字段 nullable） | ✅ |
| A-13 | agentPresets.composedPreset | ARCH-004 :1550 | `<new>dsh-agent-preset-registry/lib/index.js:723` | ✅（包拆分 HD-012） |
| A-14 | defineTool / ToolRuntime.register / systemPrompt.section | ARCH-004 :837/:2773/:238 | `<new>dsh-tools/lib/index.js:838`/`:2878`；`<new>dsh-system-prompt/lib/index.js:240`（`section(section)`）+ `:213`（`super(ctx,"systemPrompt")`） | ✅ |
| A-3 | webServer.register exact/prefix + 最长前缀优先 | ARCH-004 :176/:321-328 | `<new>dsh-host-webserver/lib/index.js:177-178`（按 kind 分流两表）/`:148-149`/`:322-328`（exact 未命中 → `pathname === prefix || startsWith(prefix + '/')`） | ✅ |
| E-1 | TypertRemoteService 基类 | ARCH-004 :75/:184 | `<new>dsh-typert-protocol/lib/index.js:159-171`（`constructor(ctx, serviceKey, options)` 同形）+ `:278` 导出 | ✅；网关宿主分发 `implementation ?? method` 语义同（`<new>dsh-api-gateway/lib/index.js:986-988`） |

### 4.2 事件（D 类映射）

| 条 | 事件 | 新树锚点 | 判定 |
|----|------|---------|------|
| D-1 | ~~settings/updated~~ | **消失**（HD-002）；替代 `settings/document-updated(ns, revision)`（`<new>dsh-settings/lib/index.js:435/:461`） | 🔴→HD-002 |
| D-2/D-3 | credentials/reference-updated、settings/document-updated（客户端转发） | `<new>dsh-api-remotes/lib/index.js:17-118` 白名单双双在列（credentials/reference-updated = `{event, mode:"emit"}` 第 12 条；settings/document-updated = 第 25 条） | ✅ |
| D-4 | llm/adapters-updated（客户端 + 服务端） | 白名单在列 + `<new>dsh-llm/lib/index.js:1806` | ✅ |
| D-5 | agent-preset/selected 双参 (sessionId, agentPreset) | 白名单首项 + `<new>dsh-agent-preset-registry/lib/index.js:489` 双参 emit | ✅ |
| D-6 | agent/created | `<new>dsh-agent/lib/index.js:579`（`ctx.serial(entry.carrier, "agent/created", {...})`——串行分发；listener 失败包容文档 `:472`） | ✅（emit→serial 内部化，事件名/载荷/容错语义兼容） |
| D-7 | agent/pre-step waterfall | `<new>dsh-agent-loop/lib/index.js:911-918`（payload `{messages: claimed, ...position(turn/step), signal}` + agentEvents 融合注入 agent） | ✅ |
| D-8 | agent/request waterfall | `<new>dsh-agent-loop/lib/index.js:1179-1185`（`{turn, step, signal}` + agent 注入；无 provider/model 时 waterfall 可补——与插件遥测只读旁路兼容） | ✅ |
| C-6 | $on 死键行为（subscribe 无白名单校验不 throw） | `<new>dsh-api-gateway/lib/client.js:765-770`（`privateEvents(callerCtx).on(eventKey, listener)`） | ✅ 插件 events 域白名单防线的运行时前提不变 |

### 4.3 客户端面（B/C/F 类映射）

| 条 | 面 | 新树锚点 | 判定 |
|----|----|---------|------|
| B-1 | llm.listConfigurableProviders 结果条目 {provider, displayName, settingsNs, settingsPath, declared?} | `<new>dsh-api-remotes/lib/client.js:7295-7301`（schema 逐字段同 0.1.5） | ✅ |
| B-2 | session.modelCatalog groups schema | `<new>dsh-api-remotes/lib/client.js:10836+`（`{default, routableProviders, groups:[{id,name,models:[{id,name,description?,reasoning?}]}], ...}`） | ✅ groups 字段族存续 |
| B-3 | llm.discoverModels(settingsNs, request) 双参 | `<new>dsh-api-remotes/lib/client.js:7314-7350`（参数序 settingsNs → request） | ✅ |
| B-4/B-5 | settings.describe() 零参 / mutate(ns, ops, expectedRevision?) | `<new>dsh-api-remotes/lib/client.js:5957-6000` | ✅ |
| B-6/B-7/B-8 | credentials.describe(refs)/set(ref,value)/unset(ref) | `<new>dsh-api-remotes/lib/client.js:5865-5928` | ✅ |
| B-9 | agentPresets 命名空间 + list + 结果 {presets:[{id,name?,...}]} | `<new>dsh-api-remotes/lib/client.js:4603-4604`/`:4631-4632` | ✅ |
| B-11 | session/selectModel 参数 SessionSelectModelRequest {sessionId, provider, model, reasoningEffort?} | `<new>dsh-api-remotes/lib/client.js:11159-11164`（schema 实读）+ 描述子 `:11660-11690` | ✅ **ARCH-004 长尾 T-4 就此闭合：字段级兼容** |
| B-12 | $mount / validateContribution / installNamespace | `<new>dsh-api-gateway/lib/client.js:1637`/`:1662-1681`/`:1684-1719`/`:1721+`（重复方法/命名空间冲突校验同型；requireStrictCodec 仍仅查 mode） | ✅ 通道存续（codec 断裂另见 HD-003） |
| C-1 | settings.section 槽位 + renderSlot({close}, {only}) | `<new>dsh-client-ui-settings-general/lib/client.js:337` | ✅ |
| C-2 | conversation.input.right {kind:list, scope:session} + standardProps（hooks ["conversation","input"] → useInput；props ["inputActions"]） | `<new>dsh-client-ui-conversation/lib/client.js:18317`（槽位声明）+ `:18126-18140`（`ctx.uiSession.provide({hooks:["conversation","input"], props:["inputActions"], ...})` 逐形同 0.1.5）+ `:17532`（renderSlot("conversation.input.right")） | ✅ FIX-029/FIX-043 面不变 |
| FIX-048 | InputState.attachmentIds 主面 + resolveDraftAttachments | `<new>dsh-client-ui-conversation/lib/client.js:13495+`（`attachmentIds = []` 状态字段 + add/prune/commitSend 族）+ `:3601`（`resolveDraftAttachments(ids)`，conversation 服务 `:3362` `super(ctx,"conversation")`） | ✅ 计数双形态（attachmentIds 优先 + imageIds 回落）继续兼容；imageIds 旧形态新树无（恒走 attachmentIds 分支） |
| C-3 | tool.call.toolview keyed（keyed 命中替换通用行） | `<new>dsh-client-ui-tool/lib/client.js:78`（keyed 语义文档）+ `:2344`（官方注册）+ `:1863`（renderSlot） | ✅ |
| C-4 | modelDirectories 服务 + directoryFor(sessionId).load() | `<new>dsh-client-ui-model-selection/lib/client.js:365`（`super(ctx,"modelDirectories")`）+ `:391`（`directoryFor`）+ `:1229`（官方 load 消费） | ✅ |
| C-5 | locale.register(ns, dicts)/bind(ns) | `<new>dsh-client-locale/lib/client.js:1387`/`:1414` | ✅ |
| C-7/F-9 | window.__ModuleLoader__ queue facade + require('react') seed | `<new>dsh-client-modules/lib/index.js:443-481`（queue 脚本 facade：mode:"queue"、load({id,factory})、create()）；平台 seed 实读 web 内核 `<new>dsh-web-frontend/dist/assets/index-5SrrfWpU.js` 的 `rM()` = **react / react/jsx-runtime / react-dom / react-dom/client / @deepseek-ai/cordis / dsh-client-store / dsh-client-ui-slots / dsh-client-ui-primitives / dsh-client-ui-dockkit**——与 0.1.5 清单逐项一致；runner 自证 `require("react")`（`<new>dsh-cordis-client-runner/lib/client.js:29`） | ✅ 插件 bundle 形态兼容（注意：**动态闭包通道**（runner `evaluateClientHalf`）禁 require——插件不走该通道，不受影响） |
| C-8/G-2/G-3 | dsh.bundle.patch 通道 + dsh.client 声明 | `<new>dsh-plugin-manager/lib/index.js:226-227`（`bundleManifest` 读 `manifest.dsh?.bundle?.patch`）+ `:249-255`（装载 + bundlePatchPaths）；profile 组合文档 `<new>dsh-app-boot/lib/index.js:463-487` | ✅ 通道存续（装载被 HD-001 门控拦截是版本问题非机制问题） |
| G-1 | cordis.patch.yml 顶层 no-id insert | `<new>dsh-app-boot/lib/index.js:82-84`（`insert` 无 id → `data.push(...insert)` 根表追加）；插件 cordis.patch.yml 两行（router/tool-router）为顶层 no-id insert | ✅ 宿主行合法（注意：带 id 的 insert 现要求目标是 group——`:78-82`，插件未用） |
| F-1 | DSH_HOME → ~/.dsh 优先序 | `<new>dsh-home-paths/lib/index.js:65-67`（explicit > `$DSH_HOME` > `~/.dsh`） | ✅ |
| F-3/F-4 | childSessionMeta（origin subagent/delegationDepth/cwd）+ parentAgentOptionsForDelegation（requestHeader 优先） | `<new>dsh-subagent/lib/index.js:470-479` + `:414-415`（`parent.session.requestHeader()?.config` 优先） | ✅ FIX-030-B 同构基线不变 |
| F-10 | exec.agent（ToolExecutionInput.agent 注入） | `<new>dsh-agent-loop/lib/index.js:497` | ✅ |
| E-7/E-8 | cordis 4.0.1→4.0.5 / schemastery 3.18.1→3.18.4 | semver 实跑均满足插件 `^4.0.1`/`^3.18.1`；cordis Service/Context 导出面双树同在（node require 实测）；schemastery 默认导出 = function z 双树同 | ✅ |
| pi-ai 坑 | 配置段字段名 `input`（vs llm-deepseek 段 `inputModalities`） | 新 `<new>dsh-llm-pi-ai/lib/index.js:1007`（`input: z.array(z.union(MODALITIES))`）vs rc.3 旁证 `:973` 同名；wire 面 `inputModalities` 由宿主内部转换（`:1806`/`:1825`） | ✅ 历史坑未复发（插件 schemas.js 不直接消费此字段——间接经 resolveModelInfo.inputModalities，§4.1 已核） |
| host-route 常量 | HOST_ROUTE_NS 'llm-pi-ai' / provider 'openai-codex' | `<new>dsh-llm-pi-ai/lib/index.js:2490-2492`（`const name = "llm-pi-ai"` / `const NS`）；openai-codex 在场（`:435` openai-codex-responses 兼容门 + `:851` openai-codex OAuth-only 语义） | ✅ 事实不变；**锚行号漂移**：插件 version.js 注释「dsh-llm-pi-ai:2344」已过期（新 :2490）——维护项 |

### 4.4 neutral 漂移项（无功能影响，维护清单）

| ID | 项 | 说明 |
|----|----|------|
| HD-005 | FORWARDED_EVENT_ALLOWLIST 镜像漂移（19 → 27 + 形状 string→{event,mode} + 声明文件迁移） | 插件镜像 `lib/host-abi/events.js:50-70`（19 字符串，注释锚定 `lib/types/remote-events.js`）+ 浏览器镜像 `lib/client.js:5413-5430`。新树真实表 = `<new>dsh-api-remotes/lib/index.js:17-118`（27 项 `{event, mode}` 对象；`lib/types/remote-events.js` 同内容双编译面；转发注册改经 `ctx.typertGateway.registerRemoteEvents`）。**插件订阅的 4 事件全部存活**（agent-preset/selected、credentials/reference-updated、llm/adapters-updated、settings/document-updated——逐项在列）→ 功能不坏；但镜像过期 = ①插件自建防线会对新增 8 事件误拒（deepseek-account/session-expired、deepseek-account/model-sign-in-required、credentials/record-updated、permission-presets/catalog-changed、plugin-manager/changed、plugin-manager/install-log、plugin-manager/install-state、schedule/changed）②B6 静态比对测试的宿主侧锚点失效。**分级 neutral（当前零断裂）**，适配批应同步镜像 + 锚点注释 |
| HD-012 | agent-presets 包拆分 | 见 §3（服务面零变化，包名重组） |

---

## §5 历史断裂五族复发核查（任务验收标准 5）

| 族 | 断裂史 | 0.2.0-rc.2 核查结论 | 证据 |
|----|--------|--------------------|------|
| **FIX-003**（附件注册接口行为回归） | saveImage 行为回归 | **不复发** | saveImage(input)/readImage(ref,signal) 签名与 v1 布局逐字同（§4.1 A-9 行）；attachments 服务名/注册面在 |
| **FIX-028**（connection.api 移除 → dsh-api-remotes） | 客户端 API 通道换代 | **不复发（通道继续存续）** | api-remotes 五命名空间 wire schema 逐项在（§4.3 B-1~B-11）；$mount/validate/installNamespace 通道在（B-12）；插件 B2 降级信封继续兜住面缺失形态。**同型新断裂在 codec 面**（HD-003）——形态类比 FIX-028「面在、形状漂移」，但这次是注册期 throw 而非消费期 undefined |
| **FIX-030**（apiProxy 服务移除 → sessionController） | 服务面消失 | **不复发** | apiProxy 新树全树 0 注册（与 0.1.5 同——插件 D1-2 单形态化正确）；sessionController 服务名/namespace/selectModel 全在（§4.1 A-11）；sessionProjections {lastUsed,pending} 在（A-12） |
| **FIX-033**（LlmAdapter imageRequestPricing 契约漂移） | 计量契约漂移 | **不复发** | 基类空体默认（新 :1697 vs 旧 :1645）+ runtime 逐路由直调 `adapters.get(provider)?.adapter.imageRequestPricing(provider, model)`（新 :2050-2051）——插件 twin/oauth 镜像实现（wrapper.js:357-361/oauth-llm.js:325-337）继续匹配 |
| **FIX-048**（InputState attachmentIds/imageIds + InputActions addAttachments + createDrafts） | 输入态形态换代 | **主面不复发 / 子面复发（HD-004）** | InputState 主形态 = attachmentIds（新 :13495+）✓；resolveDraftAttachments ✓（:3601）；InputActions = addAttachments（:13476，**与 FIX-048 后插件预期一致的名称**）——但插件 AttachButton 直传路径仍锚 0.1.2 时代的 createDraftImages/addImages（client.js:4857-4863，守卫降级）→ HD-004。插件计数逻辑（attachmentIds 优先 + imageIds 回落）与 imageIds 恒缺席的新现实兼容（回落分支成死码） |

---

## §6 待验证清单（禁止当作事实引用；每项附验证路径）

| # | 项 | 现状与缺口 | 验证路径 | 影响面 |
|---|----|-----------|---------|--------|
| T-1 | 0.1.5-rc.2 原树 conversation InputActions/createDraftImages 形状 | 插件旧树无此包；rc.3 旁证已无 createDraftImages/addImages（只有 addAttachments）——HD-004 是「0.2.0 新断」还是「0.1.5 已然降级」无法定谳 | 取 0.1.5-rc.2 精确版本包（npm cache / `npm pack @deepseek-ai/dsh-client-ui-conversation@0.1.5-rc.2`）grep createDraftImages | HD-004 定性（回归 vs 既有降级）与修复优先级 |
| T-2 | settings RPC 新描述子字段级比对（api-remotes :6023/:6042/:6092） | describe/mutate 已核兼容；新增方法未逐字段 | 读三个描述子 schema | additive 机会面 |
| T-3 | llm-pi-ai 条目在 default profile 的 entry id = 'llm-pi-ai'（host-route 写入前提） | 新 settings 写路径按 `configEditor.entries().find(row => row.options.id === ns)` 解析——pi-ai 的 `settingsNs = ctx.fiber.entry?.options.id ?? NS`（新 :2538）暗示 shipped 条目 id 即 ns，但未读 profile 模板实证 | 读 `<new>dsh-base`/profile 模板的 patch 行（或真机 `settings.describe()` 看 ns 列表） | HD-002 适配后 host-route 写 llm-pi-ai ns 可达性 |
| T-4 | 客户端 remote.* 九 inject 面挂载时序 | 命名空间/描述子/服务面全在（§4.3）；fiber inject 门控时序（waitingFor 行为）未读装配源 | 读 `<new>dsh-web-app`/web-frontend 装配序 + 真机 | 设置页激活时序（低风险——0.1.5 同构机制） |
| T-5 | settings/document-updated 触发时机语义 | 新事件由 `write()` 尾部 `this.describe()` 变更检测触发（`<new>dsh-settings/lib/index.js:537` + :413-461）——与 0.1.5「resolved 提交后即发」的时序差异（依赖读路径检测）未真机观测 | 真机：settings.mutate 后监听者到达时序探针 | HD-002 适配后 4 个热同步消费者的及时性 |

---

## §7 汇总统计与适配批输入

### 计数

- **breaking = 4**：HD-001（安装链）/ HD-002（settings 架构）/ HD-003（RPC codec）/ HD-004（图片直传，守卫降级型）
- **additive = 6**：HD-006 ~ HD-011
- **neutral = 2 + 存续面 ≈45 项**：HD-005（镜像漂移）/ HD-012（包拆分）；§4 双树实读一致的存续面（A 类 17 行 + D 类 9 行 + 客户端/wire 22 行）
- **待验证 = 5**（§6 T-1~T-5）；**历史断裂五族**：4 不复发 + 1 半面复发（FIX-048 → HD-004）
- **ARCH-004 长尾闭合**：T-4（SessionSelectModelRequest 字段级）——本次实读闭合为兼容（§4.3 B-11 行）

### breaking 按插件功能域分布

| 功能域 | 命中 |
|--------|------|
| 安装链（全局） | HD-001（拦截一切）→ HD-002/HD-003（apply 期 throw，按序暴露） |
| 设置页 | HD-002（ns 声明制）+ HD-003（remote.router 19 方法缺 → B2 降级卡） |
| 路由（host-route） | HD-002（settings.get/mutate 通道 + settings/updated 触发） |
| 图片接管 | HD-004（attach 直传）+ HD-003（imageData/uploadFile RPC） |
| 统计 | HD-003（stats/statsExport RPC）+ HD-002（stats 持久化事件触发） |
| 预设 | HD-003（catalog/presetDiagnostics RPC）+ HD-002（插件加载链） |
| OAuth/账号 | HD-003（oauth* RPC）+ HD-002（oauth-llm 热同步死订阅） |

### 建议修复顺序（供实施批排序，非决策）

1. **HD-001**（peerDeps/deps/HOST_BASELINE/README/host-contract 四处版本刷新——机械、解锁后续一切验证）
2. **HD-003**（codec create() 迁移——机械、双端单点：rpc.js + client.js 镜像 + rpc-shadow-guard 判据）
3. **HD-002**（settings Config 导出 + volatile + document-updated 迁移——最重设计项，含 host-route 读写通道改造）
4. **HD-004**（attach 直传迁移 addAttachments——独立小项，可并行）
5. HD-005 镜像同步（随手项，与 1 同批）

### 实施批必须刷新的插件侧锚点（本次发现的过期锚，非断裂）

- `lib/host-abi/events.js:44-48` 注释锚「dsh-api-remotes/lib/types/remote-events.js 实读 19 项」→ 27 项 {event,mode}（HD-005）
- `lib/host-abi/version.js:19` 注释锚「dsh-llm-pi-ai:2344」→ 新 :2490
- `tests/host-version-snapshot.mjs:46-51` HOST_BASELINE → `{dsh:'0.2.0-rc.2', dshPackages:'0.2.0-rc.2', cordis:'4.0.5', schemastery:'3.18.4'}`（注意旧基线 dsh 主包 0.1.5-rc.1 与 dsh-* 0.1.5-rc.2 的错位在新树已统一）
- `tests/host-contract.mjs` 的 HOST_VERSION_BASELINE 副本（host-version-snapshot 文件头第 2 步既定流程）

---

## 附：验证边界声明

1. 本清单全部宿主侧断言锚定双树实读（旧树 13 包 + 新树 ~220 包 + rc.3 旁证树——旁证引用处均已标注版本差）；semver/volatile 判定为本机 node 实跑输出。未运行宿主、未真机取证——HD-001~004 的「用户可见症状」为源码级推演（skip/throw 路径实读），最终表现需适配批在真机验证。
2. 旧树为插件自身依赖树（13 包），非完整宿主 checkout——完整 0.1.5-rc.2 宿主树本次不可得（ARCH-004 的 npx checkout 已漂移至 0.1.5-rc.3）；受影响面的旧侧证据 = ARCH-004 实录 + rc.3 旁证，两源一致性已抽查（无矛盾）。
3. 新树为全局安装的 dsh 0.2.0-rc.2 运行树——若用户 profile 叠加额外 bundle，其组合效应（skippedBundles 联动等）不在本清单范围。
