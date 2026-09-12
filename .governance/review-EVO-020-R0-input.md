# EVO-020-R0 代码审查报告（Round 0）——B2 client-remotes 域批

| 项 | 值 |
|---|---|
| Task ID | EVO-020-R0（P1） |
| Reviewer | Code Reviewer Agent（只读审查） |
| 审查对象 | commit `f8bd6d4`（6 files，+1052/−309） |
| 设计依据 | `.governance/arch-004-compatibility-design.md` §4.3 域 1（L188-214）/ 域 5（L237-240）/ §10 B2（L393-396）/ L372 镜像风险条；DEC-030 / DEC-031 |
| 审查边界 | read/grep/glob + 只读 git；未执行测试（运行证据采信 EV-177 供证，Coordinator 复跑裁终）；忽略主工作区 B3 在途 7 文件（与本批 6 文件零重叠，git status 实证） |
| 审查轮次 | R0（初审） |

## 审查结论（四选一）

**APPROVED_WITH_NOTES**

unresolved_blockers=0

- P0 = 0，P1 = 0，P2 = 0，P3 = 6（全部为非阻塞注记，可遗留）
- 一句话理由：ok 路径信封经父提交逐字对照实证零漂移，throw→降级语义翻转与设计 §4.3 三错误码逐项对齐且 guard 与降级信封通道隔离无遮蔽，镜像 parity/hash/P5 守卫齐备且经独立复算实证，6 条 P3 注记均不影响合并。

---

## 一、Developer 声称逐条核验

### 声称 1：createClientRemotes 权威单点 + ok 路径 envelope 逐字兼容 —— ✅ 成立

- **本体迁移保真（父提交对照实证）**：`git show f8bd6d4^:lib/client.js` 的 hostApiFace 本体（faceOf/directoryFace/okValue/failureOf/envelopeOf/joinProviderDirectoryHost 及 12 个 api 方法体）与 `lib/host-abi/client-remotes.js:101-283,296-337` 逐字对照：ok 路径全部语句（Promise.all 连接、`?? {}` 兜底、`Array.isArray` 归一、位置参数展开、envelopeOf 包装）文本一致，**ok 路径零行为差异**；唯一语义差异集中在被替换的降级路径（throw → 三错误码信封）。
- **唯一入口**：`lib/host-abi/client-remotes.js:101`（createClientRemotes）+ 桶导出 `lib/host-abi/index.js:11`；浏览器包调用点 `lib/client.js:5287-5288`（`const remotes = createClientRemotes(ctx); const api = remotes.api`）。
- **FIX-028 信封断言背书**：`tests/client-render.mjs:1987-2002` 八组信封断言原样保留且经 `settingsReg.inject().api`（即新镜像产物）驱动——断言在库实证；运行绿由供证（未独立复跑）。

### 声称 2：三错误码降级信封 + face-degraded 诊断 + 调用期 guard —— ✅ 成立

- **三错误码与设计 §4.3 L209-212 对齐**：
  - `host-face-missing`（命名空间未挂载）：`client-remotes.js:124`（`unavailable`），触发条件 = resolveFace 的 `!face` 分支（:128，双形态解析 `faceOf` :115-118 均落空）；
  - `host-face-shape`（面在方法形状不符）：`:125`（`misshapen`），触发 = :129-130 缺失方法 filter 命中，message 列缺失方法名；
  - `host-face-call`（调用被拒透传宿主错误）：`:137-144`（`guard`），message 含宿主 `error.message`（:142）。
- **诊断事件双环形**：实例环形 `:102-109`（上限 64，:57，与 health.js HOST_DIAG_LIMIT 同构）+ 全局上行 `noteHostDiag`（:108 → `health.js:35-48`，try/catch 全防护 + 字段白名单截断——`note()` 在 try 外调用 noteHostDiag 安全）。测试双断言 `tests/host-abi-health.mjs:260-261`。
- **guard 与降级信封无冲突/遮蔽（审查重点专项）**：missing/shape 信封经 **return 通道**产生（resolveFace 返回值，:127-132），guard 仅捕获 **throw 通道**（:137-140）——两通道互斥，guard 不可能拦截或改写降级信封；guard 兜住的是旧代码会击穿整页的宿主 throw/Promise reject（对照旧 load() `Promise.all` :2026-2035 catch → 整页 error 行）。判别测试 `tests/host-abi-health.mjs:254-256`（宿主 throw → host-face-call 信封透传消息）。
- **D-3（guard 实现补全）**：代码在位且判别锁定；「判别红演示实证独立价值」系过程证据，未独立复跑，采信 EV-177。

### 声称 3：client.js 行为镜像 + parity 判别 + 测试钩子 —— ✅ 成立（含 P3-1/P3-2 精化注记）

- **镜像物理约束成立**：lib/client.js 为 `__ModuleLoader__` 自包含浏览器包（仅 require('react')），无法 import Node ESM——OAUTH_ROUTE_PROVIDER 镜像先例（lib/client.js:36）在案；设计 L372/L394 已预告 B2 镜像同步义务。
- **镜像主体逐字同构**：`lib/client.js:5081-5255` vs `client-remotes.js:101-283`——degradedEnvelope/faceOf/directoryFace/unavailable/misshapen/resolveFace/okValue/failureOf/guard/12 方法体全部文本一致（唯一结构差异 = 诊断环形归属，见 P3-1）。
- **parity 判别力（审查重点）**：`tests/host-abi-health.mjs`：
  - :271 降级信封 `JSON.stringify` 逐字相等（含 message 文本）；
  - :273 ok 信封 JSON 相等；
  - :274 health().faces JSON 相等；
  - :278 diag 轨迹相等——**实为 `kind:face:code` 序列级（diagTrailOf）而非全 JSON 级**（`at` 时间戳天然不可比；`detail` 字段漂移不可检出）→ P3-2。
- **测试钩子不污染生产面**：`exports.createClientRemotes`（`lib/client.js:5486-5489`）——先例 ModelTakeover（:5485）/FIX-031 三钩（:5492-5497）同模式；宿主运行时仅消费 apply/inject（:5480-5481）；导出为纯引用不改变运行时行为；served-client 字节镜像含同一钩子（hash 相等）。**判：无生产面污染**。

### 声称 4：域 5 noteInjectFaceGaps 单点 + apply 内联镜像自检 —— ✅ 成立

- Node 单点：`lib/host-abi/inject-manifest.js:76-82`（探测 :56-64 逐面 try/catch，不 throw）。
- 浏览器内联镜像：`lib/client.js:5296-5300`——语义同构（ctx.get try/catch → undefined → `noteHostFaceDiag({kind:'inject-face-missing', face, code:'missing'})`），apply 主体无任何条件中断路径（**inject 自检不阻断验证**：循环体仅诊断写入，noteHostFaceDiag 自身 try/catch 全防护 :5026-5031）。
- 测试双面锁定：Node `tests/host-abi-health.mjs:287-289` + 浏览器 `tests/client-render.mjs:2053-2056`（re-apply 不 throw + 环形可见）。

### 声称 5：UI 单面降级行 + HostHealthCard 本地面合并（D-1）—— ✅ 成立

- 降级行：`lib/client.js:3268`（faceFailures 过滤）→ :3286-3287（`face:code` 短码，格式如 `llm:host-face-missing`）；i18n zh/en :626/:955；faceFailures 采集链 :2043（llm/settings）/ :2064（session）/ :2084（agentPresets）/ :2111-2113（credentials）。
- HostHealthCard 合并：:3733-3770（faces/diag ∪ 合并 :3741-3748，降级计数 :3749，diag 前 8 条渲染 :3769）；数据源 effect :2166-2184——一次性（不进 2s 轮询，B1 D1-10 纪律延续），health() 仅 effect 内调用，render 期零 probe。
- **D-1 头注如实改写**：:3735-3739「remote.* 客户端 fiber 面 Node 侧不可见故本地并入；B1 的 RPC 面快照保留不变」——偏差事实与理由在代码留痕。

### 声称 6：P5 零残留 + 镜像 hash —— ✅ 成立（独立复算）

- `hostApiFace` 在 `lib/client.js` = **0 处**（grep 实证；lib/ 下仅 `client-remotes.js` 注释中 6 处历史性引用，非实现）；守卫测试 :281。
- `function createClientRemotes(` 在 `lib/client.js` 恰 **1 处**（:5081）；守卫测试 :283。
- 镜像 SHA256 独立复算：`lib/client.js` = `tests/served-client.js` = `278679B23198752016B9D185537B13E3E94B5E0DF5E6930E75DBBE847B825928`（384531 字节）；在库守卫 `tests/host-abi-health.mjs:123-124`（`mirror === source` 字节相等）。

### 声称 7：证据链（RED→GREEN→判别红→复原绿 + 23/23）—— ⚠️ 静态部分实证 / 运行部分采信

- **静态独立实证**：断言计数 `check(` 50（`f8bd6d4^`）→ 72（当前）——与「50→72」声称一致；判别断言全部在库（见上）；主工作区脏文件（llm-selection.js/oauth-llm.js/preset-defaults.js/prestep.js/wrapper.js/fix-029/preset-defaults 测试/evidence-log）与本批 6 文件零重叠——「2 红归因 B3」的地基事实成立。
- **运行时证据（未独立复跑）**：自然 RED/判别红/复原绿与隔离 worktree 23/23 采信 EV-177（`.governance/evidence-log.md` 工作区条目，含完整供证描述）；按任务边界由 **Coordinator 复跑裁终**。

### 声称 8：D-2「其余面正常」补面策略 —— ✅ 成立（论证核实）

- 渲染级锚点 agentPresets：`tests/client-render.mjs:2028-2040`（roster 下拉含「Governance 预设」——agentPresets.list 与 llm 面零耦合）。
- **数据耦合论证经代码核实**：`api.llm.providers` → `state.providers`（lib/client.js:2038）→ 账号/Agent 卡数据面 :2491/:3610/:3638/:3653；模型分组下拉 :2564/:1847 消费 `state.models`。llm 面缺失时这些分区渲染内容必然空化——「其余面正常」在渲染级不可去混淆，适配器级断言（:2045-2049，**同一注入路径 ctx** 下 settings/session/credentials ok 而 llm 降级）为合理完备补面。偏差留痕 EV-177。

---

## 二、五维审查结论（5/5 = 100%）

| 维度 | 结论 | 关键依据 |
|---|---|---|
| 1 正确性 | ✅ 通过 | ok 路径信封父提交逐字对照零漂移（声称 1）；三错误码触发条件与设计 L209-212 逐项一致；guard（throw 通道）与降级信封（return 通道）互斥无遮蔽（声称 2）；面调用时延迟解析无陈旧引用（faceOf 每次重取，:115-118）；payload 非对象/裸响应边界处理逐字承接 FIX-028（:175/:204/:214 等） |
| 2 安全性 | ✅ 通过 | 降级 message = 静态前缀 + 宿主 error.message——FIX-028 起即页面可见错误文本，**无新增敏感暴露面**（对照旧 failureOf 路径）；诊断字段白名单 + 长度截断（health.js:37-44）；环形有界（64）；无硬编码密钥；React 文本节点渲染无注入新面 |
| 3 可维护性 | ✅ 通过（带注记） | P5 零并存（grep + 测试双锁）；镜像纪律头注完整（client-remotes.js:12-17 / client.js:5066-5070）；双实现维护成本由 parity 四锁 + hash 守卫补偿（设计 L372 预告该成本）；注记 P3-1（diag 环形结构分歧）、P3-6（faces 合并去重） |
| 4 性能 | ✅ 通过 | 调用时延迟解析与旧实现一致（无新增缓存/无陈旧引用风险）；probe 仅健康面板打开 effect 一次性触发（:2166-2184，非轮询）；诊断环形 O(1) 截断（splice 保尾 64）；无新增循环/批量 I/O |
| 5 测试覆盖 | ✅ 通过 | 72 断言（+22，独立计数实证）；判别矩阵完整：整页零失败行/短码入页/徽章 ⚠/兄弟面隔离/apply 不阻断/三错误码/双环形/parity 四锁/P5 三锁/hash 守卫/FIBER_INJECT 静态比对（:201-205）；**运行结果未独立复跑**（采信供证 + Coordinator 复跑裁终） |

## 三、AI 代码专项 5 项（5/5 完成）

| # | 检查项 | 结论 | 依据 |
|---|---|---|---|
| 1 | mock 残留 | ✅ 无 | lib/ 零 mock/stub（grep "placeholder" 24 处全部为 HTML input 占位符属性）；测试 fixtures 限于 tests/ 且为判别设计（okLlm/okSession/mixedCtx 等命名明示意图） |
| 2 | 硬编码返回值 | ✅ 无伪造数据 | 降级 message/错误码为设计常量；HostHealthCard 版本 '?' 兜底为 B1 既有诚实未知（:3750-3752）；无假装成功的返回值 |
| 3 | 幻觉 API 调用 | ✅ 无 | CLIENT_REMOTE_FACES（client-remotes.js:41-47）逐方法承接 FIX-028 宿主源码锚点注释（:285-294 映射表 + 宿主行号锚保留）；本批未新增任何宿主调用面（全部为既有 FIX-028 消费面迁移） |
| 4 | 未实现 TODO | ✅ 无 | 6 文件 grep TODO/FIXME/XXX/HACK = 0（lib/host-abi 全域 0；lib/client.js 0） |
| 5 | 过度实现 | ✅ 无 | guard 有独立判别价值（D-3，宿主 throw 场景旧代码整页崩——判别测试 :254-256 锁定）；health().diag 为设计接口 faces 之外的加法，P8 可观测依据 + 头注声明；hostFaceCodeOf（:5259）单一用途纯函数 |

## 四、设计一致性检查

- **§4.3 域 1**：唯一入口/能力探测（双形态 + typeof 形状校验）/多版本适配（envelopeOf + modelDirectories 直驱保留）/降级行为（三错误码 + face-degraded + noteHostDiag）/接口签名（`{api, health()}`）——**逐项落地**。「唯一入口」的实现形态为「权威单点 + 浏览器行为镜像 + parity 判别」——物理约束（浏览器包无法 import Node ESM）+ 设计 L372/L394 镜像同步义务在案，判设计一致性成立。
- **§4.3 域 5**：FIBER_INJECT 事实源 + apply 自检 + inject-face-missing 可视化——落地（含静态比对 :201-205 与 D1-1 死行守卫 :206）。
- **§10 B2 验收**：①面缺失注入测试→卡片降级+徽章+其余面正常（F28-F 块 :2025-2049）②镜像 hash 守卫（:123-124 + 独立复算）③lib/client.js 无 hostApiFace 本体（grep=0）④全量网绿（Coordinator 复跑裁终）——四项中三项静态实证，一项采信供证。
- **决策锚**：DEC-030（host-abi 分域适配层）——B2 为首个迁域批，域 1+域 5 接线符合分级混合方案；DEC-031（删 apiProxy 旧面）系 B3 范围，本批未越界。
- **批次纯粹性（编程要求 4）**：6 文件全部服务 B2 目标，无搭车修改 ✓。

## 五、偏差评估

| 偏差 | 裁定 | 理由 |
|---|---|---|
| D-1 页面本地探测并入 HostHealthCard | ✅ 合理 | remote.* 为客户端 fiber 面，Node 侧注册表物理不可见；B1 RPC 快照保留 + 本地面并入是唯一可行数据源组合；头注 :3735-3739 如实改写（对比 B1「读一次性快照」原预期）；render 期零 probe 纪律未破（effect 一次性） |
| D-2 「其余面正常」锚点分层（渲染级 agentPresets + 适配器级 settings/session/credentials） | ✅ 可接受 | 数据耦合论证经代码核实成立（声称 8）；适配器级断言走同一注入路径 ctx，面级隔离语义等价；渲染级补面受 fixture 表达力限制，留待后续批次可选增强 |
| D-3 guard 实现补全 | ✅ 合理 | 设计接口三错误码含 host-face-call，guard 是其唯一产生路径；判别测试锁定；非过度实现 |

## 六、发现列表（P0~P3，全部非阻塞）

| # | 级别 | 位置 | 发现 | 依据 | 建议 |
|---|---|---|---|---|---|
| F-1 | P3 | `lib/client.js:5024-5031,5252` vs `lib/host-abi/client-remotes.js:102-109,280` | diag 环形结构分歧：权威单点为**实例级**环形（createClientRemotes 闭包内），浏览器镜像为**模块级共享**环形（hostFaceDiagEntries）——多次 apply/HMR 场景下镜像 diag 跨实例累积而权威不累积；parity 测试因新载 bundle + 单实例对照无法检出该结构差异 | 两文件对照实读；生产单次 apply 下行为等价（bounded 64） | 镜像侧改闭包内实例环形与权威同构，或在 :5020 头注显式声明该结构差异及等价条件 |
| F-2 | P3 | `tests/host-abi-health.mjs:275-278` | diag parity 锁为 `kind:face:code` 轨迹级而非声称的「JSON 级」——`detail` 字段漂移（如 misshapen 的缺失方法列表）不会红 | diagTrailOf 实现只映射三字段 | 修正声称措辞，或将 detail 纳入轨迹比对（at 时间戳天然不可比，维持排除） |
| F-3 | P3 | `lib/host-abi/client-remotes.js:250-255`（镜像 `lib/client.js:5222-5241` 同） | sessions.models 的 modelDirectories 缺面路径保持 FIX-028 failureOf（无 error.code、无 face-degraded 诊断事件）——与三错误码降级体系不一致；P8 由明确 message 满足但无环形事件 | 与 :124-125 降级信封对照 | B4 ctx-services 批收敛 modelDirectories 服务面时补齐 code + 诊断事件 |
| F-4 | P3 | `lib/host-abi/client-remotes.js:74 vs 128-130` | 真值非对象面（病态输入，如 face 为字符串）的 state 映射不一致：probeRemoteFace 判 missing、resolveFace 判 shape | 两处条件实读 | 统一为 shape（面存在但形状不符语义更准）或维持现状并在头注声明 |
| F-5 | P3 | `lib/client.js:626,955` | faceDegraded 文案「对应分区只读」略超实际——llm 缺失时 providers=[] 分区数据不可用（非仅只读） | load() :2038 providers 空化链 | 后续微调文案为「数据不可用/降级」类措辞 |
| F-6 | P3 | `lib/client.js:3741-3744` | HostHealthCard faces 合并无按名去重——B4+ Node 注册表若登记与本地同名的面会出现重复行 | ∪ 合并实现实读；当前 Node 注册表不含五 remote 面故无实际重复 | 届时按 name 去重或加命名空间前缀 |

**未验证事项（事实依据红线声明）**：全量测试网 23/23、RED/判别红/复原绿演示、真机页面表现——Reviewer 只读边界未复跑；静态可核部分（断言计数、hash、grep、断言在库、断言判别力）全部独立实证。运行证据由 Coordinator 复跑裁终。

## 七、硬门槛裁决

| 门槛 | 结果 |
|---|---|
| P0 阻塞 = 0 | ✅ |
| 5 维度 100% 覆盖 | ✅（二节） |
| 每条发现标注级别 | ✅（P3×6） |
| 设计一致性检查完成 | ✅（四节） |
| AI 专项 5 项完成 | ✅（三节） |

## 审查结论

**APPROVED_WITH_NOTES**

unresolved_blockers=0

- P0=0 / P1=0 / P2=0 / P3=6（F-1~F-6，均可遗留，建议 F-1/F-3 分别在镜像纪律与 B4 批次吸收）
- 理由：症状①直接防御（单面降级 + 永不整页崩）经代码与判别测试双实证；envelope ok 路径父提交逐字对照零漂移；镜像 parity/hash/P5 守卫齐备且经独立复算；偏差 D-1~D-3 合理留痕；无阻塞项。
