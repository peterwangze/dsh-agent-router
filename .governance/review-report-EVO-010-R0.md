# EVO-010 R0 代码审查报告——ChatGPT 主模型迁移宿主官方 openai-codex 路由

> Reviewer：Code Reviewer Agent（独立实例，只读审查，未运行任何测试/构建命令，未修改任何产品代码）
> 审查日期：2026-08-31 · 审查规范：code-review SKILL + AI 专项 5 项 + P-v2 项目质量原则
> 范围：`git log 8120048..HEAD` = 3 commits（30dd55e 服务端 host-route 模块 / 82ae39a 客户端通路开关 / 3ead43f 收尾卫生），9 文件 +889/-23
> 实施依据：.governance/arch-003-bridge-poc.md（实施要点五条 + 待实测点）

---

## 结论

**NEEDS_CHANGE**（P0=0 / P1=1 / P2=3 / P3=5）

- P1-1（parity 持败 → settings/updated 自激热回环）触发前提恰是本模块 P9 守卫声称要防御的场景（宿主升级破坏目录路由），防御机制自身在该场景下失控（写→回滚→事件→再写无限循环 + 维护队列指数增长），必须返工后 R1 复审。修复面小（事件回环抑制/退避），不影响其余设计。
- 复审范围建议：F-1 修复 + 回归视野（不重开全量首轮审查，R0 已覆盖项不重复展开，除非修复触及）。

---

## 一、审查方法与证据基础

| 证据 | 来源 |
| --- | --- |
| 变更集全量 diff | `git diff 8120048..HEAD`（逐 commit `git show` 交叉） |
| 终态源码实读 | lib/host-route.js（400 行全文）、lib/service.js（606-645 / 2630-2819 / 3252-3280 / 3769-3876 段）、lib/oauth-llm.js（506 行全文）、lib/schemas.js / lib/index.js / lib/client.js / package.json（diff+实读） |
| 宿主 seam 一手取证（独立抽验，非转抄插件注释） | `~/.dsh/profiles/node_modules/@deepseek-ai/`：dsh-settings lib/index.js:430-436（mutate path-op）、:444（write 无属主限制仅 writable 门）、:544-547（**commit 事件 diff-gated**：`deepEqualJson(next, prev) return`）、:561-567（事件参数序 ns,next,prev,source）；dsh-credentials-local lib/index.js:471-487（**resolve 返回 `{value, source}`**，env 继承优先）、:511-517（set 空值拒绝/unset）；dsh-llm-pi-ai lib/index.js:800（无 api 字段 → reuseCatalogProvider）、:765-771（routeAuth 追加 harnessApiKeyAuth）、:777-778（**catalog 动态刷新被丢弃——单写者纪律的宿主侧实证**）、:933（apiKeyEnv = credential-ref role）、:976-997（assertServiceable 遍历整个 providers dict，任一条目非法即整体拒绝）、:1688（**resolveModelInfo 返回 `context: { contextWindow }`——parity 判别面成立**）、:2409-2414（ref 每请求活读，MISSING_CREDENTIAL 明确报错） |
| 编码完整性（GBK 事故终态抽查） | 8 个变更文件 `[regex] U+FFFD` 扫描全部 = 0、无 BOM；tests/oauth-main-model.mjs 显式 UTF-8 解码标签逐字正常；git diff 中文渲染正常。**注：审查过程中 pwsh `Get-Content` 无 -Encoding 参数的乱码显示为本机控制台 GBK 解码伪影，非文件缺陷（与事故同型机理，终态文件干净）** |
| 镜像一致性 | lib/client.js 与 tests/served-client.js SHA256 逐字节一致（CB30B27704097596…，git blob 同为 ac71315..15c2f73） |
| 门控「16/16 套件 ~1490 断言 exit 0」 | **Developer 申报，本审查未复跑（无执行权限）——采信并如实标注**；判别断言逐条静态核验非空洞（见 §四.5） |

---

## 二、修复声称逐项核验（6/6 项方向成立，其中第 3/4 项带发现）

### 1. 路由维护 —— ✅ 成立
- 五态计划纯函数（host-route.js:97-136）：create/idle/update位形并入 idle/create 判定/migrate/unset/clear-poc/user-modified；幂等零写入（ROUTE-P2/ROUTE-2 判别）。
- 用户手改尊重（双向零覆盖）：额外字段或外来 ref → `user-modified` 恒零 ops（host-route.js:114-120）+ 事件 + warn（:269-277）；判别 ROUTE-P4/ROUTE-5。
- 无启用账号/总开关关 → unset（host-route.js:344-356，ROUTE-3/ROUTE-4）。
- **PoC 接管迁移（重点 2 核验结论）**：PoC ref 的 token **不迁移**——syncHostRoute 先行注入当前凭据文件的 access 至正式 ref（host-route.js:257-268「token 注入先行」），条目随后切指正式 ref（:299），PoC ref 凭据 `credentials.unset` 清理（:306-307，尽力而为不阻断）。接管失败路径 = token 注入失败先行返回（:278-284），PoC 条目原样保留、PoC ref 不清——fail-closed 无损，宿主路由继续用 PoC 旧 token 至自然过期，可接受。
- 写入格式错误不破坏宿主配置加载（重点 1 前半）：插件仅写 `providers['openai-codex']` 单键 path-op；宿主双重防御——settings 值校验（plain object，dsh-settings:147）+ llm-pi-ai ns `validate: assertServiceable`（dsh-llm-pi-ai:2473）在写入点拒绝，**非法值不可能落盘**。
- 宿主 GUI 并发竞态（重点 1 后半）：path-op 原子应用于 resolved 文档，last-writer-wins per path；用户 GUI 删除条目 → settings/updated 事件 → 插件重建（自愈语义，模块头披露）→ 用户再删的「删除战」存在但收敛于 transport=plugin 正道（文案已给），非数据损坏面。

### 2. token 注入 —— ✅ 成立
- diff-only 比对形状**正确**：`resolve(ref)` 返回 `{value, source}`（dsh-credentials-local:471-487），`current.value === access` 判等成立（host-route.js:170-183）；resolve 失败/undefined → catch/空判 → set 权威写入——「resolve 失败 vs 空值」两态均正确落入 set。
- 请求路径刷新钩子：resolvePresetCredential `fresh.access !== cred.access` → afterPresetCredentialRefresh（service.js:2659-2689），钩子自吞错不阻断请求（P8 观测面在）。
- 后台 tick 临期刷新：`cred.expires - Date.now() <= 60s` → resolvePresetCredential 走既有刷新链（文件锁串行），成功后钩子注入新值（host-route.js:260-265）。
- **grant-record 零接触实证**：插件全仓无 modifyRecord 调用；宿主侧 reuseCatalogProvider 明示「Catalog-owned dynamic refresh is dropped」（dsh-llm-pi-ai:777-778）——双写者竞态结构性排除，插件唯一刷新者成立。
- 启动时序 guard（重点 3）：settings 缺失 → 失败路径返回（host-route.js:210-217）；credentials 缺失 → injectHostRouteToken throw → 失败路径；llm 缺失 → probeHostRoute throw → 回滚路径。effect 装配于 oauth 适配器之后（index.js:173-176），与既有 effect 同态。

### 3. P9 parity —— ✅ 实现成立 / ⚠ 持败场景退化为 F-1
- 写→探→回滚：resolveModelInfo 需路由已注册无法先探后写（设计披露 host-route.js:47-53）；探活判别面实证——dsh-llm-pi-ai:1688 `context: { contextWindow: resolvedModel.contextWindow }` 为目录事实，插件手写适配器 resolveModel（oauth-llm.js:313-317）无 context 字段，机器可判别成立。
- 回滚恢复前值/unset（host-route.js:316-324）形状正确；前值捕获在写入前（:243/:287）。
- 30s tick 自愈存在（service.js:2723-2725）——**但事件回环使持败场景的「自愈节奏」失效（F-1）**。
- 探活窗口（重点 4）：写→探→回滚全程进程内零网络，亚秒级；期间 openai-codex 组在选择器闪现属实（条目 mutate → llm.registerAdapter → directoryEntries），模块头已披露「瞬时窗口亚秒级且条目回滚后不可达」——正常场景可接受；F-1 场景下闪现变为高频抖动（同源）。
- 日志噪音（重点 4 后半）：正常路径 idle 零输出；持败场景每 pass warn×1 + 事件×2（F-1 同源）。

### 4. transport —— ✅ 与修复声称字面一致 / ⚠ 语义落差 F-4
- schema 'host'|'plugin' 默认 host（schemas.js OAUTH_TRANSPORT_VALUES + normalizeTransport 未知值归 host，TRA-1）；plugin 唯一账号 → unset 条目（TRA-2b）；OAUTH_PROVIDER 注册恒不变（TRA-2a/2c 实证 installOauthLlmAdapters 无 transport 过滤）；连续 3 失败 → host_route_degraded 事件 + 设置页提示，**零 oauthAccounts mutate（TRA-3b 判别——不静默改配置，FIX-002 主权成立）**。
- ⚠ 与 ARCH-003 Q4 设计「transport 字段决定模型 id 指向宿主路由还是插件路由」存在落差：实现中 transport **不构成任何请求路由决策**（详见 F-4）。与任务修复声称 #4 字面一致（「plugin=排除维护」），判定为「设计部分降格 + UI 语义超载」，P2 披露级。

### 5. 判别测试 —— ✅ 质量合格（计数口径差 F-5）
- **RED 构造成立**：tests/oauth-main-model.mjs:36-44 import `../lib/host-route.js`——base 8120048 无此模块，旧代码 import 即败，RED 无需运行即结构性成立。
- 断言矩阵覆盖任务声称五面（ROUTE 五态/INJ fail-closed diff-only/TRA 降级不改配置/PAR 回滚/STA 状态面）；夹具为真 RouterService + LlmRuntime 真身 + 三 seam mock（cordis reflect.provide），非纯 mock 空转；INJ-1/TRA-5 用真 OauthCredentialStore + 注入 fetchImpl 走真刷新链。
- **判别盲区（支撑 F-1 定级）**：夹具 mock settings.mutate 无事件发射语义 → settings/updated 自激回环在现有判别面中结构性不可暴露；tick 与事件并发（F-2）同样无测试。

### 6. 镜像与打包 —— ✅ 成立
- 镜像 SHA256 一致（见 §一）；package.json files 含 lib/host-route.js，files 列表 14 个 lib 模块静态核验齐全（FIX-014 教训落实；「npm pack 实证」为 Developer 申报，静态面吻合）。
- 3ead43f 收尾卫生核验：PRESET_VALUE/PRESET_PROTOCOL 删除后 oauth-llm.js 零残留引用（host-route.js:75-94 单源迁移）；hostRouteSettled 删除后全仓零消费方——修改纯粹性成立。

---

## 三、七大审查重点结论摘要

| # | 重点 | 结论 |
| --- | --- | --- |
| 1 | 跨 ns settings 写入安全面 | 写入点 schema+assertServiceable 双重拒绝，非法值不可落盘；单键 path-op 爆炸半径最小；GUI 并发 last-writer-wins 可收敛。**residual = F-1 回环** |
| 2 | PoC 接管边界 | 重新注入当前 token（非迁移 PoC ref 值）+ PoC ref 清理；失败路径 fail-closed 无损（§二.1） |
| 3 | token 注入时序 | 注入先行 PoC 教训落实（ROUTE-1b）；启动 guard 三处齐备；diff-only 比对形状正确。**residual = F-6 env 继承边角** |
| 4 | parity 探活副作用 | 正常态亚秒闪现已披露可接受；**持败态 = F-1 高频抖动**；tick 噪音有界（正常态零输出） |
| 5 | transport UI 开关 | 切换即时生效链成立（mutate → settings/updated → queueHostRouteSync 热增删，零重启）；**「插件内置」下双组共存混淆面 = F-4**（且切换不迁移既有 openai-codex 会话绑定） |
| 6 | GBK 事故终态 | 8 文件 0 替换字符、无 BOM、EVO-010 块边界完整（fix-017 块结尾 `h.cleanup()}` 完好）、UTF-8 标签解码逐字正常——**终态文件干净** |
| 7 | AI 专项 + 门控采信 | AI 5/5 全过（§五）；门控 16/16 ~1490 断言为 Developer 申报采信（未复跑，如实标注） |

---

## 四、五维度评审

1. **正确性**：核心链路（五态计划/注入先行/回滚/接管迁移/单写者）逻辑正确且判别覆盖；两处边界缺陷——F-1（事件回环，P1）、F-2（tick 旁路串行队列，P2）。
2. **安全性**：P7 全过——状态面/事件/日志逐点核验零 token 值（hostRouteStatusOf 只出 ref 名/accountId/计数；recordHostRouteEvent detail 白名单字段）；无注入面（transport select 白名单两值，client savePresetTransport 归一后写入）；F-3 滞留凭据副本 P2。
3. **可维护性**：模块单一职责边界清晰；ESM 环消除正当（host-route 不反向 import service）；注释 seam 行号抽验全部吻合（宿主 7 处实测无一幻觉）；3ead43f 死代码清理彻底。
4. **性能**：探活进程内零网络成立；正常路径 tick 每 30s 一次幂等零写；**F-1 为性能/稳定性缺陷主项**（持败热循环 + 队列指数增长）。
5. **测试覆盖**：判别面质量高（RED 结构性成立、真身夹具、矩阵齐）；缺口与 F-1/F-2 同源——并发/事件回环无测试；门控数字申报采信未复跑。

---

## 五、AI 专项 5 项

| # | 项 | 结论 |
| --- | --- | --- |
| 1 | mock 残留 | ✅ 无——产品代码零 mock；测试夹具 mock 为判别必需且作用于 seam 边界 |
| 2 | 硬编码 | ✅ 无——ns/provider/ref/PoC ref/margin/阈值全部具名常量导出（host-route.js:24-39）；UI 文案入 i18n 中英双字典各 9 键 |
| 3 | 幻觉 API | ✅ 无——宿主 API 逐一实读核验：settings.mutate(ns, ops)（dsh-settings:430-436）/ credentials resolve 返回 `{value,source}`（dsh-credentials-local:471-487）/ llm.listModels/resolveModelInfo（dsh-llm-pi-ai:1688）/ routeAuth/reuseCatalogProvider（:765-800）/ apiKeyEnv credential-ref（:933）；插件内 API（isEnabled/getState/presetLoggedInOf :3876/credentialStoreFor/oauthCredentialStores :639/this.ctx 经 super 装配——:731 等既有生产用法实证）全部在位 |
| 4 | TODO/占位 | ✅ 无 |
| 5 | 过度实现 | ✅ 无显著项——tokenInjected 三态/notice/hostRouteTickMs 注入缝均有消费方或先例同构；3ead43f 已清唯一死代码 |

---

## 六、发现清单

### P0（0）
无。

### P1（1）
- **F-1｜lib/service.js:2720-2721 + lib/host-route.js:44（设计声称）:299:316-324（失败路径）**：**parity 持败 → settings/updated 自激热回环，无退避无节流**。事实链：①插件监听 `settings/updated` 且 ns==='llm-pi-ai' 即 queueHostRouteSync（service.js:2721——「条目被外部改动自愈重建」设计）；②parity 失败 pass 恰好产生两次**值变化**的 mutate——写条目（host-route.js:299）+ 回滚（:321）；③宿主 commit 仅在值变化时发射事件（dsh-settings lib/index.js:547 `deepEqualJson(next, prev) return`）→ 每 pass 恒产生 2 个事件 → 每 pass 入队 2 个新 pass → hostRouteQueue（promise 链）**指数增长**；④每 pass warn×1（recordHostRouteFailure 无条件 warn）+ 宿主侧 llm.registerAdapter 重建抖动 ×2；⑤模块头「失败计数由周期 tick（默认 30s）自愈」（host-route.js:44）被事件回环绕过——tick 节奏形同虚设。触发条件 = host 账号启用+已登录 且 parity 持续失败（宿主升级破坏目录/llm 异常）——**恰为 P9 守卫的防御场景，防御机制自身在该场景失控**，插件从「可观测降级」劣化为宿主稳定性负载。测试盲区佐证：夹具 mock settings 无事件发射，现有判别面结构性不可暴露本缺陷。建议（三选一或组合）：a) sync pass 对自身引发的 llm-pi-ai 事件抑制再入队（在途标志/事件 source 比对）；b) 失败退避——连续失败时事件触发的 sync 跳过写入仅刷状态，写入收敛到 tick 节奏；c) degraded 状态下暂停自动维护写入（只剩观察+提示，与「告警建议手切」产品语义一致）。补判别测试：mock settings.mutate 带事件发射语义 + 断言有限时间内 mutate 次数有界。

### P2（3）
- **F-2｜lib/service.js:2724 vs :2698-2710（注释）**：**tick 旁路串行队列，注释不变量与实现不符**。`setInterval(() => { void runHostRouteTick(...) })` 直调 syncHostRoute，未经 hostRouteQueue；而 queueHostRouteSync 注释声称「settings/updated 与 tick 并发到达时按序执行」。tick pass 与事件 pass 的 await 间隙可交错：最坏序 = 事件 pass（登出→maintain=false）unset 条目后，tick pass（旧状态 maintain=true）写回条目并注入已登出账号 token → 死 token 条目存活 ≤30s 至下轮 tick 清理。幂等性兜底使损害有限且自愈，但不变量破防应修：tick 回调改走 queueHostRouteSync（一行），或修正注释为如实描述。
- **F-3｜lib/host-route.js:335-356（maintain=false 分支）**：**HOST_ROUTE_REF 凭据值无任何清理路径——access token 副本滞留宿主凭据文件**。停用方向只 unset 条目（:344）+ unset PoC ref（:351-352）；正式 ref 的值（OAuth access JWT 副本）在登出/切 plugin/删账号后永久滞留 `~/.dsh/.credentials.yaml`（dsh-credentials store），无消费方、无过期清理、下次 host 登录才被覆盖。插件自身凭据文件已删而宿主侧副本仍在——敏感数据最小保留不满足（P7 精神的保留面延伸）。建议：maintain=false 迁移成功后 `credentials.unset(HOST_ROUTE_REF)`（与 PoC ref 清理同型，尽力而为）。
- **F-4｜lib/client.js:2326-2331（savePresetTransport）+ lib/oauth-llm.js:50-71（modelsOf/accountForModel 无 transport 过滤）**：**「调用通路」开关不构成请求路由决策——UI 语义超载**。全链路无任何请求路径消费 transport 决定走向；实际路径由模型选择器选组决定（chatgpt-oauth=插件手写 vs openai-codex=宿主官方）。后果：①transport=host 时双组并列且模型重名（gpt-5.6-luna 两组同现、背后两条协议栈），用户无从辨识差异；②切「插件内置」后 openai-codex 条目 unset，**已绑定 openai-codex 组的既有会话模型失效（调用报错）而开关不迁移会话**——用户感知为「切了个开关把模型搞坏了」。与 ARCH-003 Q4「transport 字段决定模型 id 指向」未对齐（降格为维护开关）。建议：最低限度在 transport 开关处补一行说明文案（「实际调用走向以模型选择器所选分组为准」）；或产品裁决补齐 steering 语义。

### P3（5）
- **F-5｜commit 30dd55e 申报 vs tests/oauth-main-model.mjs 实测**：申报「evo-010 块 31 断言」，实测 **27 个 check()**（顶层 && 叶子条件约 76——口径未注明）。建议核准口径并在申报处标注（先例：EVO-007 R0 计数偏差 P3-1）。
- **F-6｜lib/host-route.js:170-183 + dsh-credentials-local:471-476**：resolve 先查继承 env——若宿主环境已设 `DSH_ROUTER_OPENAI_CODEX`，resolve 恒返回 env 值（source:'env'）→ diff-only 永不收敛（每 pass 重复 set）且宿主路由实际用 env 值，注入静默无效。建议 injectHostRouteToken 检查 `current.source === 'env'`（或 describe writable:false）时 fail-loud 报诊断。低概率防御性改进。
- **F-7｜lib/host-route.js:299（mutate 无内层 try）**：settings.mutate 被 assertServiceable 拒绝时（含**同 ns 其它 provider 条目非法**的连带拒绝——resolveProfiles 遍历整个 dict，dsh-llm-pi-ai:976-997）异常外溢：queueHostRouteSync 路径仅 warn（无事件/无失败计数/无 notice）；tick 路径经 runHostRouteTick catch 计数但绕过 recordHostRouteFailure（无阈值联动）。P8 口径与其余失败面不一致。建议 mutate 包内层 try 走 recordHostRouteFailure 统一链路。
- **F-8｜lib/service.js:2681-2688（afterPresetCredentialRefresh catch）**：刷新钩子失败 `failures += 1` 不经 recordHostRouteFailure——达到阈值不发 degraded 事件/notice（联动只在 syncHostRoute 路径），且下一次 sync 成功即清零。失败计数语义双源不一致，建议收敛单点。
- **F-9｜lib/client.js:1232-1239（presetRouteLine）**：用户手改条目时 maintained=false → 状态行落「未维护（无启用账号/未登录/已切插件内置/宿主路由异常）」——四因清单不含实际原因「已被手动修改」（事件环有 host_route_user_modified 但 notice 不承载到状态行）。排查指引不精确，建议补第五因或复用 notice 字段。

### P4-violation 检查
无。修改纯粹性成立（3 commits 各承载单一关注点）；失败/降级可观测主体成立（P8 residual = F-7/F-8 口径问题，非吞错）；宿主演进防御（P-v2 原则 9）即本任务主体且 parity 判别面经宿主源码实证。

---

## 七、遗留项与建议关闭计划

| 项 | 级别 | 关闭计划建议 |
| --- | --- | --- |
| F-1 | P1 | **本轮必修**（返工载体 = R1 复审范围）+ 回环判别测试 |
| F-2 | P2 | R1 同批（一行 tick 入队或注释修正） |
| F-3 | P2 | R1 同批（unset 一行 + 判别断言）或记录台账绑定 v0.4.0 发布前小修批 |
| F-4 | P2 | 文案最低限度修正入 R1；steering 语义补齐走产品裁决（用户决策项，不阻塞） |
| F-5~F-9 | P3 | 台账，随发布前小修批（FIX-017 P2×2 / FIX-018 P2-1 同批） |

---

## 八、硬门槛自检

- P0=0 ✓；5 维度全覆盖 ✓；每条发现 P0-P3 + 文件:行 + 事实依据 + 建议 ✓；AI 专项 5 项逐项有结论 ✓；设计一致性（ARCH-003 实施要点五条逐条对照）✓（要点 4「自动切回」被「告警建议手切」替代——FIX-002 主权裁量，任务声称已如实披露，判定正当偏差）；不可核验项（门控实跑/真机行为）均标「申报采信/待验证」未写成已通过 ✓；只读约束遵守（未修改产品代码、未运行测试；本报告为唯一写入文件）✓。

> 审查结论行：**NEEDS_CHANGE | P0=0 P1=1 P2=3 P3=5 | reviewer=Code-Reviewer-Agent | round=R0 | date=2026-08-31**
