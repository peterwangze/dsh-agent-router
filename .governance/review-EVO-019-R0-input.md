# REVIEW: EVO-019-R0 — B1 host-abi 骨架 + 诊断环形批代码审查（Round 0）

- **Reviewer**: Code Reviewer Agent（角色定义 agents/code-reviewer.md + skills/code-review/SKILL.md 全文加载）
- **审查对象**: `ff56096`（P1-1 锁文件刷新，pnpm-lock.yaml 单文件 +286/−222）+ `c57de5b`（B1 主体，15 文件 +1010/−3）
- **设计依据**: `.governance/arch-004-compatibility-design.md` §4.1-§4.3（L138-248）/ §5.2 / §6.1（L298-315）/ §10 B1（L388-391）——全文实读
- **工具边界**: 只读（read/grep/glob + 只读 git + Get-FileHash）；未执行任何测试/写操作（全量网 23/23 由 Coordinator 独立复跑背书）
- **宿主源实读**: dsh-api-remotes `lib/types/remote-events.js`（转发白名单单一声明源）、dsh-api-session-controller `lib/index.js:605`——均于 DSH 宿主 checkout 实读核锚

## 结论

**APPROVED_WITH_NOTES**（unresolved_blockers=0）

| 级别 | 计数 |
|---|---|
| P0（阻塞） | 0 |
| P1（关键） | 0 |
| P2（建议） | 2 |
| P3（讨论） | 5 |

一句话理由：B1 是忠实于设计 §10 冻结范围的纯增量批——七域骨架全部携带真实探测行为且守住「不预置 B2-B5 本体」纪律，probe 惰性三时机与镜像同步以判别测试锁定，宿主锚点经一手实读逐项命中；全部发现为 P2/P3 级批次条件与记录精度问题，无一构成阻塞。

---

## 一、五维度逐项结论

### 1. 正确性 — 通过
- **环形有界**（health.js:35-48）：splice(0, len-64) 保留最新——测试实证 80 写入后恰 64 条且 `entries[0] === ring-fill-16`（tests/host-abi-health.mjs:59-62）；快照返回拷贝，调用方突变不污染环形（:71）。
- **probe 运行器 fail-safe**（health.js:93-114）：单 probe 抛错 → degraded + 环形记录不外泄；非法 state 落 degraded；状态变化才入环形（首跑基线静默）——与 §6.1「含 face 探测结果变化」一致。
- **双形态解析**（client-remotes.js:43-44）：`ctx.get('remote.<name>')` 优先 + `ctx.remote[<name>]` 属性兜底，与 FIX-027 先例 client.js:4982-4985 逐字同构。
- **events 分发**（events.js:77-120）：同事件名多 consumer 共享单 listener、handler 抛错隔离不击穿兄弟消费者、gate 按 (kind,key) 抑制、disposeAll 卸载——测试 :174-193 全链断言。
- **RPC 绑定**（rpc.js:254-259）：原型挂载经 `Reflect.get(service, 'hostFaceDiagnostics')` 命中（实例 → 原型链），payload 过 strict codec（测试 :141-146 实证 parse 通过且 faces 恰为缓存快照）。
- **客户端一次性快照**（client.js:2142-2158）：alive 守卫 + 方法缺失静默跳过（presetDiagnostics :2109 先例同语义）+ 仅 `response.ok && response.value` 才入 state。
- 未发现逻辑错误、边界遗漏、并发或资源问题。

### 2. 安全性 — 通过
- **不扩大权限面**（§7.2）：域模块仅代理既有 ctx 面；version.js 只读包元数据；无新增 fs/网络/凭据通道。
- **RPC 暴露面**：hostFaceDiagnostics 仅参 emptyRequest（无输入面）；输出 = 版本串三键 + FaceHealth（name/state/detail 短码）+ 环形条目（字段白名单 at/kind/face/consumer/code/detail + 截断 64/64/64/48/160）——无 token 值、无路径、无环境细节（P7 纪律沿袭 presetDiag :127-141 同构裁剪）。
- 残余面（P3 量级，见 P3-4 备注）：probe-threw detail（≤120 字符）理论上可携带宿主异常文本——preset 先例接受同等风险，不构成新暴露。

### 3. 可维护性 — 通过（含 2 项 P2）
- 每域文件头 ≤3 句职责 + 归属批次声明（B2/B3/B4/B5 逐域明确）；桶 index.js 零逻辑纯 re-export（§4.1 合规）；域间互不 import 唯一例外 events→health（设计允许）。
- 全部 host-abi 八文件零 TODO/FIXME/存根（grep 实证）。
- P2-1：probe 方法集缺口（见发现明细）。
- P2-2：version.js → host-route.js 反向依赖（见发现明细）。
- P3-1：锚点漂移 wrapper.js:516 → :543。

### 4. 性能 — 通过
- **探针惰性三时机**（§7.1/BR-01 机制承载）：registerFaceProbes（注册零执行）/ runFaceProbes（唯一触发器）/ faceHealthSnapshot（纯缓存读，5 次重复读 0 probe 调用——测试 :84-85 实证）。
- **render 期零 probe**（源判别锁定，测试 §3）：调用点唯一且在 useEffect 内、effect 窗口无 setInterval（不进 2s 轮询——D1-10）、HostHealthCard 渲染体零 remote/RPC 调用。
- **零新增常驻 timer**；一次性快照 RPC 设置页打开期仅 1 次；透传零新增异步跳数（B1 无消费点切换，预算面不变）。

### 5. 测试覆盖 — 通过（含记录性边界）
- **50 断言精确计数**（逐 check 清点：§1×6 + §2×7 + §3×6 + §4×4 + §5×6 + §6×21 = 50）——声称与实际一致。
- 覆盖：核心路径（环形/惰性/RPC 全链/五域 probe）、边界（>64 溢出、恶意输入 null/函数/超长串、probe 抛错、gate 抑制、dispose）、错误路径（missing/degraded/three-state 映射）。
- **判别力真实**：R1 改 HOST_DIAG_LIMIT 64→128 → `entries.length === HOST_DIAG_LIMIT && HOST_DIAG_LIMIT === 64`（:61）联判必红；R2 注入第二调用点 → :106 调用点唯一 + :117 面板体零调用 + :119 镜像全等三断言红。自然红 ERR_MODULE_NOT_FOUND 由 import 结构保证。
- 记录性边界（非缺口）：R1/R2 红/绿演示为 Developer 记录性声称（本审查只读不可复跑，Coordinator 23/23 为绿态独立背书）；白名单镜像逐项静态比对由 B6 承载（设计 §10 B6 明示），当前仅 length===19 + 两成员断言——本审查已人工逐项核对宿主源闭合该窗口（见 §四）。

---

## 二、AI 生成代码专项（5 项全做）

| # | 专项 | 结论 | 事实 |
|---|---|---|---|
| 1 | 幻觉 API/锚点 | **1 处漂移，余全命中** | sessionController `selectModel` 宿主 lib/index.js:605 精确命中；remote-events 白名单 19 项名序逐字一致；CLIENT_REMOTE_FACES 八方法与 client.js:5006/5014/5022/5037/5049/5058/5066/5072/5080/5115 typeof 守卫逐一对应；HOST_ROUTE_* 四常量 host-route.js:53/55/57/65 命中；presetDiag 先例 :112-145 同构确认。漂移：wrapper.js:516（P3-1，FIX-033 +27 行所致，非幻觉而是时序性陈旧） |
| 2 | 心智模型伪造宿主面（P10-④） | **合规且自觉** | 方法契约逐项锚定现存消费者 typeof 守卫（6 处锚点实读核验）；未锚定方法集的服务（credentials/fs/attachments/subagents）明确空集 + 文件头声明「B4 按实测守卫补齐，禁凭心智模型预写」——反伪造纪律成文 |
| 3 | 静默吞错 | **合规** | 全路径 try/catch + noteHostDiag/降级可观测（P8）；唯一静默点 = 客户端 RPC 方法缺失跳过（旧服务端兼容，preset :2109 先例）——P3-4 记录可见性建议 |
| 4 | 测试自我印证 | **低风险** | 测试锚定事实源而非实现内部：FIBER_INJECT 自 client.js 源提取比对、镜像全等比对、wire codec/descriptor 反射绑定（网关契约同语义）、宿主白名单成员判别。源文本判别（调用点计数）为 fix-029 C4 承认先例 |
| 5 | 注释/声明与实现漂移 | **1 处（同 P3-1）** | 五域文件头批次声明与 §10 批次一一对应；client.js 注释「render 期零 probe 判别锚点」与测试 §3 互指成立；唯一漂移 = ctx-services.js:15 引用 wrapper.js:516 已陈旧 |

---

## 三、设计一致性逐域比对（§4.1-§4.3 / §5.2 / §6.1 / §10-B1）——最重维度

| 设计条目 | 实现 | 判定 |
|---|---|---|
| §4.1 八文件结构 | index/health/version/inject-manifest/client-remotes/llm-selection/ctx-services/events 齐全 | ✓ |
| §4.2 依赖单向（消费者→桶→域→health，域间互不 import） | events→health ✓；**version→../host-route.js 反向边**（P2-2，B4 翻转条件）；桶零逻辑 ✓ | ✗ 1 处（P2） |
| §4.3 域 1 client-remotes | probeRemoteFace 双形态 + 五命名空间方法形状（与 hostApiFace 守卫逐方法一致）；createClientRemotes **未预置**（文件头声明 B2 + P5 理由——提前落 = 与 client.js 现存实现双份并存）| ✓ 骨架纪律守住 |
| §4.3 域 2 llm-selection | 双 probe 落地；**方法集缺 `registration`**（设计明示三方法并集——P2-1）；sessionSelectFaceOf 本体 B3 迁入（声明） | ✗ 1 处（P2） |
| §4.3 域 3 ctx-services | serviceFaceOf(ctx,name,methods)→{face,probe} 签名逐字实现；11 具名访问器与 §4.1 服务清单一一对应；空方法集纪律（P10-④）成文 | ✓ |
| §4.3 域 4 events | 共享单 listener + fail-safe 分发 + gate 位 + FORWARDED_EVENT_ALLOWLIST 19 项镜像；订阅时白名单拒绝 + 降级名单 = B5 范围（文件头 + §10 B5 双声明） | ✓（延期项设计内） |
| §4.3 域 5 inject-manifest | FIBER_INJECT 9 面 + CLIENT_PACKAGE_INJECT 3 包（D1-1 死行删后基线）+ probeFiberInjectFaces；镜像锁定测试在位 | ✓ |
| §4.3 域 6 version | hostVersionsOf 三键 + 'unknown' 降级 + HOST_ROUTE_* re-export（B4 迁入为权威源——声明） | ✓ |
| §4.3 域 7 health | 环形 64 + 白名单截断 + JSON 安全 + probe 运行器惰性；零 import 零宿主依赖 | ✓ |
| §5.2 启动自检 | **未接线（设计状态非缺口）**：注册表空（faces [] 诚实空态 + 面板空态文案），apply 时全域 probe 随 B2-B5 域注册落地；§10 B1 冻结范围与验收标准均不含启动自检 | ✓ 设计内 |
| §6.1 徽章+面板+RPC 链 | 三合一 RPC + 一次性快照 + 徽章（summary 常显）；「nav 行内」措辞 vs 设置页面板 summary 行——呈现偏差 P3-3（意图达成） | ✓（P3-3 备注） |
| §10 B1 范围保真 | 纯增量实证：lib/ 内仅 rpc.js/schemas.js/client.js 触碰且均为声明范围；host-abi 无任何消费者 import（grep 实证唯 rpc.js）；回滚 = 删文件成立 | ✓ |

**骨架纪律专项结论**：五域全部携带真实行为（探测返回 FaceHealth 三态/降级值/环形可观测），零 TODO 存根，域内无消费者均以文件头声明归属批次（B2/B3/B4/B5）——「骨架不预置 B2-B5 本体」纪律守住，未发现提前落 hostApiFace/liveDefaultSelection 本体的 P5 双实现并存违规。

---

## 四、宿主锚点一手实读清单（事实基础）

| 锚点 | 实读结果 |
|---|---|
| dsh-api-remotes `lib/types/remote-events.js`（宿主 checkout） | API_REMOTE_FORWARDED_EVENTS 恰 19 项；events.js:30-50 镜像**名序逐字一致**；credentials/reference-updated 在表、credentials/updated 不在表（D-2 锚成立） |
| dsh-api-session-controller `lib/index.js:605` | `async selectModel(request)` 精确命中 |
| lib/client.js hostApiFace typeof 守卫（:5006-:5115） | CLIENT_REMOTE_FACES 8 方法逐一对应（llm 3/settings 2/credentials 3/agentPresets 1/session 2） |
| lib/preset-defaults.js:112-145 | PRESET_DIAG_LIMIT=64 + 字段白名单 + 截断 + try/catch——noteHostDiag 同构泛化确认 |
| lib/host-route.js:53-65 | HOST_ROUTE_NS/PROVIDER/REF/TICK_MS 四常量——re-export 值级锚定成立（测试 :129 联判） |
| ctx-services 六锚点 | preset-defaults.js:162-164（composedPreset）/175-176（currentSelection）/413（saveSelection）/194-195（agents.get）/214-215（sessionController.selectModel）、prestep.js:193-194（stateOf）、oauth-llm.js:449-452、service.js:927-928、host-route.js:248-249（settings.mutate）全部命中；**wrapper.js:516 未命中（实际 :543-544）** |
| tests/served-client.js 镜像 | Get-FileHash SHA256 相等（字节级同步实证） |
| tests/rpc-shadow-guard.mjs:43-47 | 逐描述符 `Reflect.get(service, implementation ?? method)` 可调用断言——新 descriptor 自动纳入看护（声称④成立） |
| package.json:22-26 / :32 | dsh.client.inject 3 包 = CLIENT_PACKAGE_INJECT；files 白名单收录 lib/host-abi/（FIX-014 教训落实；npm pack 33 文件为记录性声称，静态面一致） |

---

## 五、发现明细（P0=0 / P1=0 / P2=2 / P3=5）

### P2-1 llm 适配器注册面 probe 方法集不完整（缺 `registration`）
- **位置**: lib/host-abi/llm-selection.js:34；lib/host-abi/ctx-services.js:27
- **依据**: 设计 §4.3 域 2 职责①明示「registerAdapter/**registration**/listModels 形状检查——收敛现状三处独立检查」（wrapper.js:543-544 查 registerAdapter+registration、oauth-llm.js:449-452 查 registerAdapter+registration、service.js:927-928 查 listModels，三处并集 = 三方法）。B1 的 `probeLlmAdapterFace` 与 `CTX_SERVICES.llm` 均只查 `['registerAdapter','listModels']`。
- **后果**: 宿主 llm 面缺 `registration` 时 probe 报 ok，而 wrapper/oauth-llm 安装期将拒绝——B3/B4 接线后健康徽章与实际能力面不一致，BR-02 第一层防线出现缺口。
- **建议**: B3 迁移 llmFaceOf 时对齐三方法集（两处同批改）；或 B1 补一行即闭合。

### P2-2 version.js 反向依赖消费者层，B4 翻转方向为 MUST 条件
- **位置**: lib/host-abi/version.js:16（`import ... from '../host-route.js'`）
- **依据**: §4.2「域模块互不 import；全部只依赖 health.js + 宿主本体」+ 桶头自述「消费者 → 桶 → 域 → health 严格单向」。当前无环（host-route.js 不导入 host-abi），但 B4 常量迁入时若 host-route.js 改从 version.js 导入而本 re-export 边未拆，即成 host-route → host-abi/version → host-route 循环——const re-export 在环中可能初始化期 undefined。
- **建议**: 文件头已声明 B4 迁入意图（好评）；将「B4 迁入同批必须翻转方向（host-route.js 改 re-export 或删旧常量），禁止双权威并存（P5）」固化为 B4 批验收条件。

### P3-1 锚点漂移：wrapper.js:516 已陈旧
- **位置**: lib/host-abi/ctx-services.js:15（及设计 §4.3 域 2 原文）
- **依据**: FIX-033（c89d635）为 wrapper.js +27 行，llm 守卫实际位于 :543-544。时序上设计写作先于 FIX-033 落盘，非幻觉。
- **建议**: B4 迁移消费者时以现势行号重锚（或引用导出名/函数名替代裸行号，抗漂移）。

### P3-2 偏差记录③「与本批零文件冲突」表述不准确
- **位置**: c57de5b commit message（偏差记录段）
- **依据**: `git show c89d635 --stat`：FIX-033 触碰 lib/wrapper.js + tests/adapter-parity.mjs + **tests/smoke.mjs**；B1 亦触碰 tests/smoke.mjs——文件级重叠 1 个（不同 hunk：负向见证区 vs 描述符计数区 :223/:224/:2215）。实际为零文本/合并冲突（顺序落盘 ff56096 → c89d635 → c57de5b），终态 23/23 由 Coordinator 独立复跑背书。
- **建议**: 记录性措辞更正为「零合并冲突（smoke.mjs 不同 hunk 重叠 1 文件）」——偏差记录必须可与 git 事实逐字对账。

### P3-3 徽章呈现场所与 §6.1 草图措辞偏差
- **位置**: lib/client.js:3691-3726（HostHealthCard）
- **依据**: §6.1 草图「健康徽章（nav 行内）」；实现为设置页面板区 details/summary 行内。设计意图（不展开即可见 ✓/⚠ 信号、不依赖 F12）经由 summary 常显达成。
- **建议**: 记录即可；若后续真机验收（P10-③ 截图）发现可见性不足再调整。

### P3-4 RPC 方法缺失时面板整体静默不显示
- **位置**: lib/client.js:2145-2152（一次性 effect 的 typeof 守卫 + hostHealth 恒 null → HostHealthCard 返回 null）
- **依据**: 旧服务端未重启场景走 presetDiagnostics :2109 同款静默跳过（兼容降级设计，正确不崩）；但 §6.3「降级不静默」严格读法下用户无任何可见信号区分「健康全绿」与「诊断面不可用」。
- **建议**: B2+ 接线真机徽章时评估渲染一行「宿主面诊断不可用（服务端旧版本？）」；低优先。

### P3-5 原型挂载的 B2+ 平移须同批删除，否则静默覆盖类方法
- **位置**: lib/rpc.js:254-259（`RouterService.prototype.hostFaceDiagnostics = ...` 模块求值期执行）
- **依据**: 若 B2+ 在 service.js 增加同名类方法而未同批删除 rpc.js 挂载，模块求值顺序将决定哪一侧生效（rpc.js 后求值则覆盖类方法），且 rpc-shadow-guard 仅断言「可调用」不区分来源，无法拦截此类漂移。偏差①本身评估合理（见 §六）。
- **建议**: 在 rpc.js:242 注释追加「B2+ 平移为类方法时 MUST 同批删除本挂载（P5：禁止并存）」明示删除义务。

---

## 六、Developer 声称逐条核验表

| # | 声称 | 核验 | 事实锚点 |
|---|---|---|---|
| 1 | health.js 完整（环形 64 有界/白名单截断/JSON 安全/FaceHealth/probe 惰性三时机） | ✅ | health.js:20/35-48/69-77/83-85/93-114 + 测试 §1×6/§2×7 断言 |
| 2 | version.js 完整（createRequire 三包 + 'unknown' 降级 + HOST_ROUTE_* 值级锚定） | ✅ | version.js:22/29-36/42-48 + 测试 :125-129（降级 + dev 图真值 + 四常量联判） |
| 3 | 五域骨架 = §4.3 接口 + 真实 probe + 骨架纪律（零 TODO/文件头批次声明/不预置本体） | ✅（P2-1 方法集缺口除外） | §三逐域表；grep 零 TODO；无消费者 import 实证；createClientRemotes/liveDefaultSelection 确未预置 |
| 4 | RPC 三合一 + rpc-shadow-guard 自动看护 | ✅ | rpc.js:85-91 descriptor + :254 挂载；shadow-guard:43-47 逐描述符循环自动纳入 |
| 5 | 徽章+面板（一次性快照/不进 2s 轮询/render 零 probe/镜像字节级同步） | ✅（P3-3/P3-4 备注） | client.js:2142-2158 effect（无 setInterval）；HostHealthCard 纯快照渲染；Get-FileHash 镜像相等 |
| 6 | package.json files 收录（npm pack 实证 33 文件） | ✅ 静态 / 记录性声称 | package.json:32 `lib/host-abi/`；33 文件打包演示为 Developer 记录（本审查不执行命令，静态面一致） |
| 7 | 测试 50 断言 + 三重判别 | ✅ | 逐 check 清点恰 50；R1/R2 判别器真实（:61 联判 / :106+:117+:119 三断言）；红演示为记录性声称 |
| 8 | 全量网 23/23 | ✅（Coordinator 背书） | 本审查禁止执行测试；Coordinator 已独立复跑 23/23 @ c57de5b |
| 9 | 三项记录性偏差 | ①合理（P3-5 平移条件）②完备（:223/:224/:2215 三处全改 + :220-222 注释声明同步义务；无遗漏 18 计数）③终态成立但措辞不准（P3-2） | 见 §五 + §七 |

## 七、三项偏差逐项评估

1. **rpc.js 原型挂载（service.js 锁外）**——**合理**。绑定语义与网关契约（dsh-api-gateway `Reflect.get(service, implementation ?? method)`）精确对齐；rpc-shadow-guard 的逐描述符反射断言恰好持续看护此绑定（未来实例字段遮蔽即红——FIX-011 stats 遮蔽教训的守卫复用）；插件自有类原型无跨插件污染；wire 形状与绑定位置解耦。残余风险 = B2+ 平移时的双绑定覆盖窗口 → P3-5 删除义务明示。
2. **smoke.mjs 计数 18→19（锁外机械伴生）**——**完备**。三处计数（:223/:224/:2215）全部更新，grep 全文件无第四处描述符计数残留（:415 为 catalog.agents 无关项）；:220-222 注释明示「新增 RPC 面时同步更新本计数三处」的后续义务；不更新则 smoke 已知红扩大违反零回退门——两难取舍下选机械更新正确。
3. **FIX-033 并行时序**——**终态成立、表述瑕疵**。顺序落盘（ff56096 → c89d635 → c57de5b）零合并冲突，23/23 以 HEAD 实测为准且经 Coordinator 独立复跑；但「零文件冲突」与 git 事实不符（smoke.mjs 双触碰，P3-2）——记录性偏差的措辞精度须修正，非代码问题。

---

## 八、遗留观察（非发现——设计内延期，供批次跟踪）

- §5.2 启动自检未接线：注册表空为 B1 设计状态（faces [] 诚实空态 + 面板空态文案），apply 时全域 probe 随 B2-B5 域注册落地。
- events 运行时白名单拒绝 + 订阅失败降级名单：B5 范围（文件头 + §10 B5 双声明一致）。
- 白名单镜像逐项静态比对测试：B6 范围；当前窗口以本审查人工逐项核对（19/19 名序一致）+ length/member 断言兜底。
- §10 B1 验收项「真机截图证据（P10-③）」属任务验收面（非代码审查面），请 Coordinator 于门控时跟踪。

---

*审查方法：两 commit 全 diff 实读 + 设计文档 §4-§10 全文实读 + host-abi 八文件逐行 + 宿主源两文件实读 + 六锚点现场核验 + 镜像 hash 实证 + 测试 50 断言逐条清点。每条结论指向可复查事实（文件:行号）；不可复跑项（红/绿演示、打包实证、23/23）均标注记录性/背书来源。*
