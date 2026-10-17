# DSH 宿主升级 SOP（五步）+ 基线登记 checklist + 重装后真机复验清单

> ARCH-005 R5 批固化（2026-10-17）。骨架 = `.governance/arch-005-decoupling-design.md`
> §2-B 四维-d（SOP 五步 + 接线点）/ §6 R5 行；本文件用本链（0.1.5-rc.2→0.2.0-rc.2，
> R0→R1→A1→A2→A3→A4→R2∥R3→R4→R5 十批）**实际走过的命令 / 程序 / 判据**填充为可重放
> 步骤——每步的机器入口全部锚定本仓现存实现（禁止虚构未实现入口），失败 / 降级形态
> 全部指向可观测面（P8）。本 SOP 已以本链十批做 retrospective walk-through 验证：按
> 步骤重放可得出与本链一致的动作序列（对表见 R5 批交付报告；事实基线对照设计 §0）。
>
> 相关程序 / 判据文档：`docs/cold-install-gate.md`（装载门取证程序——其 §4 已把本 SOP
> 各引用位点表）；ADR-ARCH-005-A（proposed——随 R5 报告由 Coordinator 写回 decision-log）。

## 0. 五步总览（每步的机器入口一览）

| 步 | 名称 | 机器入口（命令 / 脚本 / 套件） | 输出 / 判据 |
|---|---|---|---|
| ① | 检测 | `.github/workflows/host-radar.yml`（cron 周频，自动）；`node tests/host-contract.mjs` 靶子启动行（本地，跑测试即拦截）；宿主启动 stderr skip 警告形态（gate-block 用户侧线索） | 雷达 issue + probe 报告 artifact；靶子版本一致性告警；`dsh: skipping profile bundle "dsh-agent-router"` 文本 |
| ② | diff 定性 | `node scripts/host-radar-probe.mjs --host-source <dir> [--baseline <id>] [--out <file>]`（四类 diff 报告，探测不门控）；`DSH_HOST_SOURCE=<dir> node tests/host-contract.mjs`；`node tests/host-version-snapshot.mjs` | 四类 diff JSON（锚 miss / 白名单增删 / schema 字段 / 包表版本）+ 契约套件红绿 |
| ③ | 影响分级 | probe 报告 `summary` 计数 + 契约套件红绿 + Analyst 人工比对（模板先例 = `.governance/arch-005-host-diff-inventory.md`） | breaking / additive / neutral 分桶清单（+ 存续 / 待验证） |
| ④ | 适配批 | 断点 → 先例批索引（装载门 = R1+A1 / codec = A2 / settings = A3 / 图片通道 = A4 / 看护登记 = R0+R3 / 协商态 = R2）；每批判别红演示 + 全量网 | 各批验收门形态（§4 表）；`node tests/run-all.mjs` 零回退 |
| ⑤ | 发布 + 复验 | 版本 bump（独立裁决）+ **CHANGELOG 义务**（§5）+ `cmd /c "chcp 65001 >nul && node tests/run-all.mjs"` + `node scripts/cold-install-gate.mjs`（含 `--expect-skip` 判别演示）+ `node scripts/a3-apply-gate.mjs` + 审查 + Release + 重装后真机复验（§7 清单） | 门控全绿 + 冷装 / apply 门绿 + 发布审查通过 + §7 清单逐条勾选 |

---

## 1. 第①步 检测（雷达 / 靶子告警两通道 + gate-block 用户线索）

宿主升级（含 silent update）的发现通道共三层——**插件外两通道为主**（gate-block regime
下插件零运行机会，插件侧机制不可达）：

### 1a. 雷达通道（自动，周频——FIX-003 静默更新族的结构性对策）

- **载体**：`.github/workflows/host-radar.yml`——cron 周频（每周一 03:30 UTC，schedule
  仅默认分支生效）+ `workflow_dispatch` 应急（inputs：`dist_tags_stub` / `host_versions` /
  `force_issue`）。判定逻辑单点 = `scripts/host-radar-probe.mjs`（三模式 CLI），yaml 只编排。
- **已知边界（生效前提）**：R4 批已 commit 但**推送 + Actions 首跑复核**前该通道未在线
  生效（schedule 仅默认分支生效；gh / GITHUB_TOKEN 真机行为 = R4 登记的首跑复核义务
  在册，以首跑日志为准）——该窗口期内检测依赖 1b 靶子告警 / 1c 用户线索两通道。
- **dist-tags 全枚举**：`npm view @deepseek-ai/dsh dist-tags --json` →
  `node scripts/host-radar-probe.mjs --dist-tags-file dist-tags.json --seen "$(cat seen.json)"`
  ——latest + next/alpha 等预发布 tag **并集**比对（latest-only 对 0.2.1-alpha.x 流动
  失明，设计 F-5）；已告警版本 = 雷达 issue 标题前缀 `host-radar: <version> —` 本身
  （零第二份状态写入）。
- **T-6 形态（树静默重写——主包版本不变但嵌套树被整树重写，本链实证：schemastery
  3.18.4→3.18.5，npm 零留痕）**：probe job **每周期无条件**对主基线版本新装 fresh 树
  （`npm install --prefix <dir> @deepseek-ai/dsh@<target>`——npm 安装时点解析 range 内
  最新版）跑四类 diff 报告；包表版本类 diff（④）对基线档案记录值比对，主包不变 ≠ 树不变
  由此可检。纯 dist-tags 比对对该形态**永不触发**——不可退回 dist-tags-only。
- **心跳自警**：`node scripts/host-radar-probe.mjs --heartbeat --last-seen <iso|never>
  --interval-days 7 --misses 2`——连续 ≥2 周期未成功运行即开自警 issue（载体 = workflow
  运行历史 `gh run list` 最近 success 的 updatedAt + `host-radar heartbeat stale:` issue
  前缀幂等门）。
- **产出**：新版本 / 漂移 → issue（标题 `host-radar: <target> — totalDiffs N`，正文含
  baseline 四值 + summary 计数 + artifact 指针，处置入口指回本 SOP 第②步）+
  `host-radar-report-<target>` artifact。
- **失败可观测面（P8）**：雷达**自身**故障（npm 不可达 / 基线 marker 提取失败 / 参数
  非法 / 树不可达）= radar/probe job 红（`host-radar-probe: …` stderr + usage + exit 1）；
  **探测不门控**——probe 发现差异恒 exit 0（报告 = 决策输入，不是门控判据），永不把
  门控 CI 打红；雷达死亡 = 心跳 stale issue（自警只发生在下一次成功运行时——已知边界）。

### 1b. 靶子告警通道（本地，开发者跑测试即拦截）

- **入口**：`node tests/host-contract.mjs`——启动行打印实际靶子路径 / 来源 / 未选候选；
  版本一致性判据（FIX-037 ③）：选定靶子与全部候选的关键包版本逐条与
  `HOST_BASELINE_REGISTRY`（经 `tests/host-version-snapshot.mjs` 单源提取）比对——宿主
  已升级而基线未刷新时**显式告警 + 记可见 skip**（S3/S7 结论适用范围可判定）。
- `node tests/host-version-snapshot.mjs` 同跑：宿主升级后未完成声明面 / 档案 / README
  同步时**判红**（见 §6 checklist——这是「升级已发生」的第二本地信号）。
- **靶子候选链**（R0 修复后）：`DSH_HOST_SOURCE` > `DSH_HOST_PACKAGES` > **npm 全局树**
  （`%APPDATA%\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai`）> `_npx`
  缓存降序。probe 类工具（雷达 / 手动 diff）**必须显式瞄准**（`--host-source`），不自动
  发现——F-A 教训：自动发现会把探测指向过期副本。
- **失败可观测面**：靶子不可达 = 启动行 + `--  skipped`（可见，不静默全绿）；候选版本
  不一致 = 告警行 + skip；`DSH_BASELINE` 未知值 = 优雅判红收口（R3 fail-closed）。

### 1c. gate-block regime 的用户侧线索（minor 跳位——插件被拒载时唯一在场面）

- 宿主启动 stderr 含 `dsh: skipping profile bundle "dsh-agent-router"` +
  `is incompatible with dsh` / `Running it may cause crashes or data loss`
  （pluginCompatibilityWarning 文案形态；判据文本与锚定见 `docs/cold-install-gate.md` §1）。
- 该 regime 下插件侧三态徽章 / 诊断事件**不可达**（零运行机会）——用户报障时先看该
  stderr 形态定 regime，再进第②步。patch/rc 内跳位（gate-pass-unknown）则插件照常
  运行、健康面板黄态「未实测宿主版本」可见（R2 协商三态）。

**本链复盘**：本次 0.1.5→0.2.0 升级的第一发现人 = 用户（插件失效卸载止损后报障）——
R0 之前靶子对 0.2.0 全局树失明（跑在过期 `_npx` rc.3 副本上）。SOP 检测层即把该角色
机器化：雷达周频 + 靶子告警两通道（R4 / R0 批交付）。R4 验收实证：dry-run 双树
（0.2.0 = 0 diff / 0.1.5 树 17 diff 逐项吻合）+ 预发布 tag 实捕获（0.2.1-alpha.5）。

---

## 2. 第②步 diff 定性（四类机器报告 + 契约套件 + 人工比对）

### 2a. 机器入口（按序执行）

```bash
# 1) 四类 diff 报告（探测不门控——差异多少都 exit 0；报告 = 第③步分级输入）
node scripts/host-radar-probe.mjs --host-source <宿主scope目录> [--baseline <id|status>] [--out report.json]
#   ① 锚 miss：HOST_SHAPE_ANCHORS 包×文件/符号 + LlmAdapter 基线方法 + InputState 面针
#   ② 白名单增删：宿主 API_REMOTE_FORWARDED_EVENTS vs 镜像 FORWARDED_EVENT_ALLOWLIST 双向
#   ③ schema 字段：六 wire 面 *_result$schema 顶层字段 vs WIRE_SCHEMA_WHITELIST 双向
#   ④ 包表版本：HOST_KEY_PACKAGES + cordis/schemastery vs 基线档案项（match/mismatch/absent）
#   靶子必须显式瞄准（宿主树形态判据 = dsh-api-remotes/lib/client.js 在 scope 目录下）

# 2) 契约套件红/绿（靶子显式指向新宿主树；可选 DSH_BASELINE 切目标基线——R3 参数化）
DSH_HOST_SOURCE=<宿主scope目录> node tests/host-contract.mjs
DSH_HOST_SOURCE=<宿主scope目录> DSH_BASELINE=<id> node tests/host-contract.mjs
node tests/host-version-snapshot.mjs     # 声明面 × 档案 × README 三方一致（升级未适配时红）

# 3) dist-tags 全枚举（确认新版本全集——含预发布通道）
npm view @deepseek-ai/dsh dist-tags --json
```

### 2b. 人工面（机器报告不可替代的半边）

Analyst 依赖 / 契约全量 diff——**模板先例 = `.governance/arch-005-host-diff-inventory.md`**
（结构：取证树表 + 分级定义 + 逐域消费点锚点表 + 存续面核对表 + 待验证清单 + 机核证据）。
机器报告四类是「点名的差异」；人工比对补「语义变化定性」（改名 vs 新增、时序变化、
先例族对照——历史断裂五族 FIX-003/028/030/033/048）。

**待验证项挂接**（本链 T-1~T-6 先例）：定性存疑项逐条挂到适配批前置——如 T-1 用
`npm pack <pkg>@<ver>` + grep 定性「新断 vs 已然」（A4 先例：createDraftImages 在
0.1.5-rc.2 零命中 → HD-004 定性为「恢复」而非「回归」）；T-3/T-5 源级实证锚定可达性
与时序（A3 先例）；T-6 树静默重写形态由雷达 probe 吸收（R4）。

**失败可观测面（P8）**：`--host-source` 非宿主树 / marker 缺失 / 字面量不可解析 /
`--baseline` 未知值 → `host-radar-probe: …` 明确错误 + exit 1（拒绝无源比对，不静默
空判）；契约套件红 = 差异已进判据面（这正是要的输出，不是故障）。

**本链实证**：R4 dry-run 对 0.1.5 树 17 diff（锚 / 白名单 / schema / 包表四类逐项吻合
人工清单）；Analyst 清单 breaking 4 + additive 6 + neutral 2 + 存续约 45 + 待验证
5→6（返工新增 T-6 后权威值 = 6，见 `.governance/arch-005-host-diff-inventory.md` §7）。

---

## 3. 第③步 影响分级（breaking / additive / neutral）

**判据（容错边界总纲，设计 §1——分级不是口味，是可判定谓词）**：

| 级 | 判据 | 处置 |
|---|---|---|
| **breaking** | 插件消费基线面 ⊄ 宿主实读面——**已消费面的收缩 / 改名 / 签名变化 / 装载门不过** | 进适配批（第④步，改域文件 + 判别测试；fail-loud，禁猜测性别名映射 / 跨类型转换 / catch 静默沿用） |
| **additive** | 宿主实读面 ⊇ 插件消费基线面——新增方法 / 导出 / 白名单事件 / schema 字段 / 包 / exports 子路径 | 自动吸收 + **留痕登记**（刷基线档案 / 镜像 `since` / 锚 `since`——§6 checklist；能力档案记录 delta） |
| **neutral** | 无影响或仅维护性漂移（如包内布局重构但导出面同构——本链 F-G 实证：dsh-llm「漂移」实为同构双编译面） | 注记，不入适配批 |

- **装载门半边专项**：声明范围是否过宿主门控
  （`semver.satisfies(runtimeVersion, range, { includePrerelease: true })`，逐项遍历全部
  `@deepseek-ai/dsh*` peerDeps）决定 HD-001 类 breaking 是否成立——判别演示由
  `node scripts/cold-install-gate.mjs --expect-skip` 程序化承载（回退单项 → 宿主 stderr
  逐字警告 → 恢复 → 复跑绿；见 §5 义务）。`peerDependenciesMeta.optional` **不解除门控**
  （仅安装器行为）——分级时不得据此降级。
- **分桶模板**：沿用 Analyst 清单五桶（breaking / additive / neutral / 存续 / 待验证）+
  每条带锚点（包×文件×符号）与机核证据。本链 breaking 4 = HD-001 装载门 / HD-002
  settings 声明制 / HD-003 strict codec / HD-004 图片接管降级——即第④步先例索引的四行。
- **失败可观测面**：分级输入自身故障已在第②步 P8 出口覆盖；**禁止形态**（猜测性别名
  映射等）违反即设计违约——审查门拦截（本链各批审查均含此检查项）。

---

## 4. 第④步 适配批（每类断点的既有先例索引——直接复用，不重发明）

**批序依赖（本链定版，DEC-5）**：R0 → R1 → A1 → A2 → A3 → A4 →（R2 ∥ R3）→ R4 → R5。
新升级按分级结果**只取所需行**，但行内验收门形态不变。

| 断点 / 需求 | 先例批（commit） | 文件面 | 验收门（判别红/绿形态） | 复用程序 / 套件 |
|---|---|---|---|---|
| **靶子失明 / 新基线看护登记** | R0（`bd17cac`）+ R3（`dffb553`） | tests/host-contract.mjs、tests/host-version-snapshot.mjs、lib/host-abi/events.js（镜像）、`.github/workflows/ci.yml`（matrix） | 靶子可达指向新树 + S7 全绿 + 独立红演示（删消费事件 → 红）；DSH_BASELINE 分代 skip 计数与预期吻合 | `node tests/host-contract.mjs`；`DSH_BASELINE=<id> …`；§6 checklist |
| **装载门拒载（HD-001 类）** | R1（`367b65f`）+ A1（`678ff97`） | package.json（11 项声明 + `peerDependenciesMeta` optional×8）、pnpm-lock、README 矩阵、scripts/cold-install-gate.mjs、docs/cold-install-gate.md | 隔离冷装装载门判据（stderr 无 skip 警告 + dump-config 含 `# == dsh-agent-router` 段）绿；`--expect-skip` 红演示；三方一致（snapshot 既有断言凭据） | `node scripts/cold-install-gate.mjs`（绿）/ `--expect-skip`（判别） |
| **codec 断点（HD-003 类——apply 期 `strict codec has no create() factory` throw）** | A2（`43e8267`） | lib/rpc.js（strictCodec 单点——38 codec 位全经 parameter/result 两 helper）、lib/index.js（typert.register 路径）、lib/client.js（镜像恒等）、tests/rpc-shadow-guard.mjs | 真树双通道 19/19 过 validateCodec + 旧形态负控 throw 逐字复演 + 客户端镜像字节恒等 | `node tests/rpc-shadow-guard.mjs`（§6 真树实跑） |
| **settings 断点（HD-002 类——apply 期 `settings.register is not a function` throw）** | A3（`b6aeac4`） | lib/schemas.js（routerConfig `.volatile()` + Config 导出）、lib/index.js / service.js / wrapper.js / oauth-llm.js（四订阅点 `settings/updated`→`settings/document-updated`）、lib/host-route.js（describe 读 + 事件驱动缓存）、lib/host-abi/events.js | 隔离冷装真 boot「服务端 apply 全程无 throw」+ 正向探针（8085 loopback TCP 可达 / occupied warn 行）+ 46 断言判别套件 + 五场景（老配置可读可写 / stats 跨重启 / 热同步 / 快速连续操作 / 目标值=默认值） | `node scripts/a3-apply-gate.mjs`；`node tests/settings-config-migration.mjs` |
| **图片通道断点（HD-004 类——attachUnavailable 降级）** | A4（`66878ea`） | lib/client.js（宿主原生三步链 createDrafts→addAttachments→拒绝 release + 四项缺面守卫） | stub 面在场 → 选图→上传→addAttachments 绿；stub 缺面 → 降级不崩（负向判别）；判别群 9/9 + 红演示 6 红；T-1 定性结论入档 | A4 判别测试（随批入库）；`npm pack` 定性先例 |
| **版本协商态 / 徽章扩展** | R2（`6d9fead`） | lib/host-abi/version.js（hostCapabilityProfile + 档案投影）、lib/rpc.js + schemas.js（capabilityProfile 字段）、lib/client.js（徽章三态）、tests/host-abi-health.mjs | 三态判别矩阵（matched / compatible-unknown〔一次性 host-version-unknown 事件〕/ incompatible〔面先于版本〕）+ 渲染期零探针 + 基线单源值级锁定 | `node tests/host-abi-health.mjs` |
| **升级雷达维护** | R4（`e01213e`） | `.github/workflows/host-radar.yml`、scripts/host-radar-probe.mjs、tests/host-radar.mjs | 46 断言判别套件（四类 diff 判别力 + 探测不门控 + P8 负控 + 心跳幂等门）+ dry-run 双树吻合 | `node tests/host-radar.mjs` |

**每批纪律（不变式）**：① 一个 commit 承载一个问题（编程要求 4）；② 全量网
`node tests/run-all.mjs` 零回退（P4——Windows 本地口径见 §5）；③ 判别红演示——判据
非恒绿自证（恒绿判据无看护价值）；④ 先审后提交（staged 不自行 commit）；⑤ 每批独立
revert（回滚粒度 = 批）。
**失败可观测面**：各程序自带 P8 出口——cold-install-gate 六类失败出口 exit 1、
a3-apply-gate abort 形态（dsh-unusable / cold-install-failed / 探针超时）、套件失败清单
+ 输出尾部、run-all 失败套件清单与 `#SKIP` 回显。

---

## 5. 第⑤步 发布 + 复验（bump / 门控 / 冷装 / 审查 / Release / 真机复验）

1. **版本 bump**：版本位独立裁决（发布链，不属本 SOP 内定；本仓先例口径见 CHANGELOG
   「版本说明」节——MINOR/MAJOR 依能力面与支持面收窄裁决）。
2. **CHANGELOG 义务（F-8——发布前 MUST）**：**发布前登记本批变更至 repo 根
   `CHANGELOG.md`**（Keep a Changelog 格式；节结构先例 = v0.4.5 / v0.5.0：摘要 / 新增 /
   修复 / 变更 / 破坏性变更（含支持面收窄披露）/ 已知行为披露 / 版本说明〔发布范围
   三分账 + 验证基线〕）。宿主升级适配批（R/A 批）的每批变更随批留痕、随发布登记——
   不登记不得收口发布链。
3. **门控（P4 零回退）**：`node tests/run-all.mjs` 全绿（Windows 本地真实基线口径 =
   `cmd /c "chcp 65001 >nul && node tests/run-all.mjs"`——A3 批定谳的 chcp 包裹形态；
   对照当前基线：23 独立套件 + runner 模块，`#SKIP 0`，smoke 恰 2 条 sh 臂）。
4. **隔离冷装复验（发布前隔离臂，双层口径之本机臂）**：
   - `node scripts/cold-install-gate.mjs`——装载门放行判据绿；
   - `node scripts/cold-install-gate.mjs --expect-skip`——**判别演示义务**：装载门判据
     相关变更（声明面跳跃 / 豁免通道行为 / 宿主装载门实现变更）后 MUST 至少跑一次
     （`docs/cold-install-gate.md` §6）；
   - `node scripts/a3-apply-gate.mjs`——真 boot「服务端 apply 全程无 throw」+ Config
     声明面发现 + 正向探针三判据全绿。
5. **审查**：Code Review（先审后提交；每批已随批审查者复核——发布审查独立于批审查）。
6. **Release**：tag 发布（发布三件套：version bump + CHANGELOG 节 + README 版本引用）。
7. **重装后真机复验（后置，双层口径之真机臂——P10-③ 真机层）**：发布并重装到真实
   用户环境后执行 §7 清单，逐条勾选留证（真机显示证据——截图 / 录屏 / 日志行；API
   状态层验证不得替代 GUI 验收）。

**失败可观测面**：门控失败 = run-all 失败套件清单；冷装失败 = 六类出口 + 沙箱证据文件
（`result.json` / `bootN-stderr.txt` 等，路径随结论行打印）；复验清单条目未勾 = 发布链
不收口（清单即门禁）。

---

## 6. 基线登记 checklist 模板（新基线加入 HOST_BASELINE_REGISTRY）

> 触发：新宿主版本完成分级 + 适配（或判定纯 additive 直接登记）。**权威源 =
> `tests/host-version-snapshot.mjs` 的 `HOST_BASELINE_REGISTRY`**（marker 文本
> `const HOST_BASELINE_REGISTRY = Object.freeze(`——四处消费面按同一 marker 文本提取，
> 无第二份可漏改的版本常量；提取失败即红 / exit 1）。

新基线登记时逐项勾选（复制本节为工作副本）：

- [ ] **1. 实读新宿主树定值**（禁照抄文档值——T-6 纪律：树可被静默重写，实施时单点
      重读 `<pkg>/package.json` 定谳；cordis / schemastery 单独核对；dsh 主包与 dsh-*
      全系分别记录）
- [ ] **2. snapshot 权威面**：`tests/host-version-snapshot.mjs` `HOST_BASELINE_REGISTRY`
      新增档案项（`id` / `status` / `dsh` / `dshPackages` / `cordis` / `schemastery`）；
      旧主基线项降 `frozen`，新项 `status: 'primary'`——「恰一 primary」恒等断言在位
- [ ] **3. host-contract 提取面**：`tests/host-contract.mjs` 经 marker 文本提取自动跟随
      （登记确认无手改版本副本残留——R3 起副本已删，`new Function` 权威提取 fail-closed）；
      锚 / S5 条目 `since` 字段按「当前形态定型于哪代基线」更新
- [ ] **4. ci.yml marker 面**：`.github/workflows/ci.yml` `resolve-baselines` /
      `guard-matrix` 按 marker 提取自动跟随（新基线自动进 matrix job——确认两基线 job
      全绿、`#SKIP` 计数与分代预期吻合；yaml 零版本字面量）
- [ ] **5. probe marker 面**：`scripts/host-radar-probe.mjs` 按 marker 提取自动跟随
      （dist-tags 比对的 known 集 = 档案在册 dsh 值 ∪ 已告警 issue——新版本登记后雷达
      不再重复告警该版本）
- [ ] **6. 运行面投影（R2 增设的第五同步面）**：`lib/host-abi/version.js` 的
      `HOST_BASELINE_REGISTRY` 同形双表——两侧值级相等由 `tests/host-abi-health.mjs`
      §R2-a 解析锁定断言机器看护（单侧漂移即红，禁静默分叉）
- [ ] **7. since 注记义务**：新增锚 / 白名单镜像事件（`lib/host-abi/events.js` 行内
      `// since <档案id>`）/ wire schema 条目 `since` = 新档案 id；分代判据生效
      （`DSH_BASELINE` 低于条目 since 时宿主侧判据记可见 skip，不误红）
- [ ] **8. README 矩阵**：「宿主兼容性（实测基线）」支持基线集表加行（基线 / 状态 /
      dsh CLI / dsh-* / cordis / schemastery / 实测时点）——snapshot §5 断言机器核验四值在场
- [ ] **9. package.json 跳跃**：8 peerDeps + 3 dsh deps = `^<新主基线 dshPackages>`
      （F-1 收紧：声明面恒判 primary——分裂 / 回退 frozen / 假版本即红）；pnpm-lock
      同步刷新（CI frozen-lockfile 口径）
- [ ] **10. 验证命令序列**（全绿才算登记完成）：
        `node tests/host-version-snapshot.mjs` → `node tests/run-all.mjs`（零回退）→
        `node scripts/cold-install-gate.mjs` 绿（装载门判据相关变更另跑 `--expect-skip`
        判别演示——§5 义务）
- [ ] **11. CHANGELOG 义务**：随第⑤步发布链登记（本批「支持基线集」变化 = 用户可见
      变更，入 CHANGELOG「变更 / 破坏性变更」节如实披露支持面收窄）

---

## 7. 重装后真机复验清单（F-7——发布 → 重装真实环境后逐条勾选）

> 双层口径的真机臂（发布前隔离臂由 §5 第 4 项程序承载）。每条勾选 MUST 附证据形态
> （截图 / 录屏 / 日志行——P10-③：真机显示证据，API 状态层验证不得替代 GUI 验收）。
> 本清单由本次 0.1.5→0.2.0 升级链（R1~R4 各批验收门 + FIX-052/FIX-049 顺延口径）
> 派生；新升级按断点面增补条目，既有条目不得删除（回归面只增不减）。

### A. 装载门真机复验

- [ ] A1 重装后宿主启动 stderr **无** `dsh: skipping profile bundle "dsh-agent-router"`
      / **无** `is incompatible with dsh` / **无** `Running it may cause crashes or data
      loss`（判据文本 = `docs/cold-install-gate.md` §1；隔离臂机器凭据 = 该程序产物）
- [ ] A2 设置页「Agent 路由」整页可开（装载 + apply 双过——对应 a3-apply-gate 判据③
      的真机面）

### B. 用户视角五场景（F-6 四场景 + N-1 默认值场景——A3 验收门真机面）

- [ ] B1 老配置可读可写：0.1.5 时代配置跨宿主升级沿用——设置页打开无异常、任意配置项
      改值保存成功、重开读取一致
- [ ] B2 stats 持久化跨重启：产生若干调用后重启宿主，「统计信息」四卡数据在、无清零
- [ ] B3 热同步不依赖重启：设置页改值 → 即时生效（`settings/document-updated` 四消费者
      到达——预设跟随 / 账号 / host-route 缓存刷新各观察一处）
- [ ] B4 快速连续操作：连续快速保存多个配置项（连发 mutate）——不丢更新、不乱序、
      面板最终态与逐项意图一致
- [ ] B5 显式写回默认值：把某配置项显式改回默认值并保存——保存成功且读取一致
      （目标值 = 默认值场景，N-1）

### C. 版本协商三态徽章真机显示（R2——P10-③ 真机层）

- [ ] C1 matched：实测基线组合上健康面板徽章绿态（`router/hostFaceDiagnostics` 的
      `capabilityProfile.state` = matched，面板显示无「未实测宿主版本」提示）
- [ ] C2 unknown 真机形态（如环境可造——宿主走预发布通道 patch/rc 内跳位）：黄态
      「未实测宿主版本」徽章 + 一次性 `host-version-unknown` 诊断事件可见
      （gate-pass-unknown regime；gate-block（minor 跳位）下本项不可达——如实边界，
      该 regime 由 A1 的 stderr 判据承载）

### D. 图片直传真机（A4）

- [ ] D1 选图 → 直传不降级：对话输入框「添加图片」→ 选中图片进入原生附件栏随消息
      原生发送（无 `attachUnavailable` / 图片直传不可用降级提示）；图片在会话日志原生
      显示，`image` 能力标签视觉 agent 的 `includeImages` 转发链路可用

### E. FIX-052 顺延复验项（预设统计归属——随「发布→重装」顺延）

- [ ] E1 预设统计归属：多预设使用下统计四卡归属不错乱（会话预设身份不变量——切换
      预设 / 快速连续建会话等扰动下用量仍归对预设）

### F. FIX-049 顺延复验项（原生多模态贴图接管——随「发布→重装」顺延）

- [ ] F1 原生多模态贴图：宿主原生多模态模型会话中贴图走原生通道（不误切插件 twin /
      订阅模型），接管门控按贴图时点能力刷新；FIX-051 候选现象（如再现）随证登记

---

## 8. 溯源与维护

- **来源**：ARCH-005 R5 批（设计 §2-B 四维-d 五步骨架 + §6 R5 行验收门）；本链十批
  retrospective walk-through 验证（对表见 R5 批交付报告）。
- **ADR**：ADR-ARCH-005-A（proposed）——基线档案单一事实源 / 协商三态 / 漂移雷达；
  DEC-1~DEC-7 裁决记录见 decision-log（Coordinator 写回）。
- **维护义务**：SOP 引用的程序 / 套件 / 判据文案变更时同步本文件（行号式宿主锚一律
  引用 `docs/cold-install-gate.md` 等判据文档承载，不在本文件复制行号——降低锚漂移面）；
  新升级走完一遍 SOP 后，按实际偏差增补本文件（SOP 自身也是 retrospective 产物）。
