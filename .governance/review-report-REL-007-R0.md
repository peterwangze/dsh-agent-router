# REL-007 — v0.4.1 发布段审查报告（R0）

- **审查对象**：v0.4.1 发布段——`git show 5ddc849`（E-1 bump/CHANGELOG/README）+ `git show 6625739 --stat`（E-4 治理入仓），HEAD = 6625739
- **审查者**：Release Reviewer（只读审查——未修改产品代码、未运行测试/构建/安装命令、未触碰真实环境；仅只读 git 检视与文件实读）
- **审查规范**：release-review SKILL + release-checklist SKILL
- **结论**：**APPROVED_WITH_NOTES**
- **unresolved_blockers=0**
- **审查日期**：2026-09-01

---

## 结论摘要

发布段（E-1~E-4）就绪面成立：版本/文档同步精确、CHANGELOG 七节完备且抽验命中、43 个底账 SHA 全量实存、破坏性「无」四证经机械比对成立、机录审查链与证据链（EV-103~119）完整、回滚能力面（tag v0.3.3 + 纯代码回退）在位。未发现 BLOCKING 项。保留 **2 项 W 级（非阻塞、须跟踪）** 与 4 项 N 级注记，其中 W-2（回滚口径披露）为 **E-5 GitHub Release notes 的强制携带项**（E-5 未执行，可在该步闭合）。

---

## 审查清单逐项

### 1. 版本号 + README 同步 — **PASS**

| 核验点 | 事实锚点 | 结果 |
|---|---|---|
| package.json version | HEAD `package.json:4` = `"0.4.1"`；E-1 diff `0.3.3 → 0.4.1` 单行 | ✅ |
| README 版本面 | grep `0\.3\.3\|0\.4\.1` 恰 **12 处命中**（L7 徽章 / L17 / L18 / L21 / L36 / L40 / L45 / L46 / L52 / L53 / L130 / L132），全部为 v0.4.1 现行版本引用 | ✅ 与「12 处核验声明」精确一致 |
| 陈旧版本残留 | 零残留——L132「v0.3.3 起为图片条件化自动接管」与 L130 的 0.3.x 系历史沿革表述均为合法历史注记，非版本载体 | ✅ |

### 2. CHANGELOG 完整性 — **PASS**（附 N-4 枚举注记）

| 核验点 | 事实锚点 | 结果 |
|---|---|---|
| 新增×3 | EVO-011 订阅生图 / EVO-012 画布架构 / EVO-010 官方路由，三bullet 在案（CHANGELOG.md L9~16） | ✅ |
| 修复×5 | AUDIT-001 P0-A / P0-B / 41 条台账 / FIX-019 / FIX-015，五bullet 在案 | ✅ |
| 变更 | 订阅组默认不注册（双通路开关保留）+ 生成物按钮纯图标 | ✅ |
| 破坏性四证 | 「**无**」+ 四证结构在案；抽验① deps/peerDeps 与 v0.3.3 **机械比对逐项一致（True/True）**；抽验② `lib/schemas.js:209` = `transport: z.string().default('host')` **行号与实文精确命中**（新增字段带默认值论证成立） | ✅ |
| 已知问题 | 6 条：CI 缺（延续）/ 显示层根治收口 / deepseek-official 挂起（EV-088 延续）/ picked 层盲区（延续）/ 41 条台账（新增）/ reasoning 回传缺口（FIX-017 延续，缓解+残余如实） | ✅ |
| 版本说明 | 0.4.0 跳版原因在案（候选内容 2026-08-31 完成开发审查、发布链用户裁决暂停未及发布、合并发布、0.4.0 号段不占用）；44 commits 三分账底账在案 | ✅ |
| SHA 底账抽验 | **43 个具名 hash 全量实存**（超出抽验 2-3 要求），subject 与底账描述逐条吻合（含 `01729a2`/`bc500f7`/`31ab145`/`321a5ef`/`1832db0`/`2aa9316` 等）；底账口径注记（`4fecc06` v0.3.3 尾账归属）与 git log 一致 | ✅ |

### 3. no-overclaim 重点核验 — **PASS**（W-1 + N-1/N-2 注记）

**① 「附件显示层已根治」措辞**：措辞在披露自洽边界内，不构成实质过度声称。事实面：双线根因真实成立——P0-A `ref` 保留 prop 剥离已修（client.js:3771-3776 实文：`prop 更名 imageRef`，调用点 :4087-4096 全量改用 `imageRef`）+ 同源路由成为主通路（client.js:3755 `directAssetUrlOf` 单点）。imageData RPC 回退**确实仍在**（client.js:3764「imageData RPC 降为 onError 最后回退」、:3809 `onError: () => load()`）——但 CHANGELOG 破坏性论证④已显式披露「imageData RPC 保留为旧产物回退」，与「根治」句同文并存，读者可获得完整图景。→ **N-1**：建议已知问题「根治」句补半句自闭环（「imageData RPC 保留为旧产物回退通路」），使已知问题段独立自洽。

**② 「真实端点实测」声明与证据一致**：一致 ✅。EV-112 权威记录：POST `chatgpt.com/backend-api/codex/images/generations`（Bearer+account-id+originator+代理）→ **200 + b64 907,928 字符 → PNG 680,946 字节魔数验证**；凭据只读零泄漏、临时文件已删。官方路由侧 EV-107 PoC 实证（文本+图片全通、零中转）。→ **W-1**：CHANGELOG 验证基线「PNG 908KB」系 **b64 字符长度误标为 PNG 体积**（680,946B ≈ 665KB；b64 907,928 字符 ≈ 908K chars）。实测实质（200+有效 PNG）不受影响，属转录级数值失准——建议 E-5 前收口勘误为「PNG 665KB（b64 907,928 字符）」，plan-tracker EVO-011 行同源同步。

**③ 「用户真机验证」范围与实际验证点一致**：一致 ✅。三点逐一可溯：生图直达显示（REL-007 tracker 依赖行 + P0-A/FIX-021 修复后，EV-116 宿主 bundle 热推送实证）／生成物纯图标按钮（EV-118 用户反馈驱动修复 1832db0 + tracker 记录用户验证）／官方路由多模态识图（EV-107 ARCH-003 PoC——用户 GUI 验证 sha256:f24b647：openai-codex 组文本+图片全正常、模型直接识图、零中转 + 日常使用）。声明未超出实际验证点：EVO-010 通路开关 UI 状态行、EVO-012 三场景残余（识别无回显/旧产物自愈/产物网格）未声称已验，与 tracker「待复验」状态一致。

**④ 41 条台账披露充分性**：充分 ✅。P1×3 三项**逐项具名**（CLI 中止漏检/附件同名覆盖/产物归属竞态）、批次目标（v0.4.2）明确、EV-117 入档（41 条清单落盘）可溯；修复段与已知问题段双处披露。→ **N-2**：数值口径小瑕——「41 条待消化」实为 **39 条待消化**（41 = 本版已消化 P0×2 + P1×3 + P2×13 + P3×23）；建议收口时改「台账 41 条（本版已消化 P0×2，余 39 条随 v0.4.2）」。

**⑤ React ref 根因表述准确性**：准确 ✅。React 18 `createElement` RESERVED_PROPS 剥离 `ref` → `props.ref` 恒 undefined → 直达路径从未生效（必现非竞态）；宿主 React 18.3.1（EV-117 dsh-web-frontend seed 实证）；「历史测试全绿 = mini shim 透传 props 的 parity 缺口」与代码注释（client.js:3771-3773/4084-4087）及 EV-117 逐点一致；「prop 更名 imageRef + 惰性 getter 单次访问快照」与实文一致。

### 4. 回滚方案 — **PASS（能力面）+ W-2（披露面，E-5 强制项）**

| 核验点 | 事实锚点 | 结果 |
|---|---|---|
| 回滚目标在位 | `git tag` 实采含 **v0.3.3**（= e818183）；v0.3.3 GitHub Release 带 tgz 1,544,611B（EV-101/tracker 记录） | ✅ |
| 纯代码回退成立 | 破坏③数据面零变更（统计 JSONL/凭据文件/oauthAccounts 结构不变——AUDIT-001 修复仅收窄写窗口）+ 破坏①依赖零变更（机械比对 True）+ 安装幂等（README）→ 重装 v0.3.3 即回退，无数据迁移、无双写风险 | ✅ |
| 回滚触发诚实度 | 已知问题明示「deepseek-official 挂起……不构成本版回滚触发条件」——回滚触发面不夸大 | ✅ |
| 回滚口径披露 | **全仓 grep（回滚到 v0.3.3/失去官方路由/回滚口径/纯代码回退）零命中**；无 `docs/release/rollback-plan-v0.4.1.md`（v0.2.0~v0.3.2 有、v0.3.3 起省略——先例延续） | ⚠️ **W-2** |

**W-2（非阻塞，E-5 强制携带）**：「回滚到 v0.3.3 = 失去订阅生图/主模型官方路由/画布直达与产物集合/输入回显消除/并发审计修复面」口径目前无任何书面载体。E-5 GitHub Release notes MUST 携带回滚段：步骤（重装 v0.3.3 tgz 或 junction 安装）+ 能力失去清单 + 数据兼容说明（无迁移）。E-5 尚未执行，可在该步闭合。

### 5. 发布范围一致性 — **PASS**（附 N-3 口径注记）

- 实采锚点：`git rev-list --count e818183..2544e66` = **43** ✅ 与底账「实采 = 43，加本提交」精确一致；`e818183..5ddc849` = 44 ✅。
- 三分账：产品 29 个具名 SHA + E-1 本提交 = **30** ✅；治理 **14** 个具名（`4fecc06`/`c477930` + 机录 ×12）✅；30 + 14 = 44 自洽 ✅。
- 逐族 membership 抽验：EVO-009×2 / FIX-015×5 / FIX-016×1 / FIX-017×1 / FIX-018×3 / EVO-010×4 / FIX-019×3 / EVO-011×2 / EVO-012×4 / FIX-021×1 / AUDIT-001×3，与 commit subject 逐条吻合 ✅。
- **N-3**：E-4（6625739）落盘于 E-1 之后 → `e818183..HEAD` 实采已为 **45**，tag 时必 >44。与 v0.3.3 先例同型（7119401 治理入仓 + e818183 F-1 修正同样未入 v0.3.3 底账「10 个」，tag 照落）——尾账口径延续成立，非本版新增缺陷。建议 E-5 release notes 注明 tag range 终值或延续口径注记（post-bump 发布链 commit 随下一版治理面计）。

### 6. 门禁证据链完整性 — **PASS**

| 核验点 | 事实锚点 | 结果 |
|---|---|---|
| EV 链 | EV-103~119 **无断号**（EV-110 已核实 = v0.4.2 候选需求记录）+ TRIAGE-REL-007 机录（change-triage/REL-007.json 在盘，含 task-priority-analysis 快照） | ✅ |
| 机录审查链 | 15 条 REVIEW-\* 机录行全在（evidence-log L288~368）：EVO-009 R0/R1、FIX-015/016/017/018 R0、**EVO-010 R0 NEEDS_CHANGE → R1 APPROVED_WITH_NOTES/0（唯一一次 NEEDS_CHANGE→R1 闭环，与门禁证据声明一致）**、FIX-019 R0/R1、EVO-011 R0、EVO-012 R0/R1、FIX-021 R0（APPROVED）、AUDIT-001 R0 | ✅ |
| 报告文件在盘 | 14 份 `review-report-\*.md` glob 实存；FIX-019 R1 按其声明增量模式并入 R0 报告追加节 + `review-FIX-019-R1.md` 信封（EV-109 描述一致）——非缺口 | ✅ |
| E-2 门控 17/17 | EV-117「门控 17/17（Coordinator 复跑含新套件）+ smoke 1037/0 + 镜像一致」+ EV-119「E-2 门控 17/17（含审计判别）」在案；named 套件文件在盘（`tests/audit-001-concurrency.mjs`/`rpc-shadow-guard.mjs`/`fix-012-image-takeover.mjs`/`client-render.mjs`）；tests/ 18 文件 − metrics.mjs 观测脚本 = 17，与口径自洽。**本审查只读未复跑，按任务边界采信 Coordinator 复跑记录** | ✅（采信+锚点） |
| E-3 隔离冷装 | EV-119：tgz 1,583,544B → DSH_HOME/npm_config_cache 重定向临时目录 → 安装 exit0 → 完整 ESM import OK（keys=5, lib 14 模块）→ 版本 0.4.1。与 package.json 机械交叉验证：exports keys = 5 ✅、files lib 恰 14 模块 ✅、version 0.4.1 ✅ | ✅ |
| 真实环境防护措辞 | CHANGELOG「tarball 隔离环境安装冒烟（环境变量重定向至临时目录）」——限定语合规 ✅；EV-112 实测「凭据只读零泄漏、临时文件已删」✅ | ✅ |

---

## 发现台账

| 级别 | ID | 发现 | 建议处置 | 阻塞性 |
|---|---|---|---|---|
| WARNING | W-1 | 「PNG 908KB」为 b64 字符长度（907,928）误标；EV-112 权威值 = PNG 680,946 字节 ≈ 665KB | E-5 前收口一行勘误（CHANGELOG 验证基线 + plan-tracker EVO-011 行） | 否 |
| WARNING | W-2 | 回滚口径（失去官方路由/订阅生图/画布等）全仓零披露；无 rollback-plan-v0.4.1 | **MUST 随 E-5 GitHub Release notes 携带回滚段**（步骤 + 能力失去清单 + 数据兼容说明） | 否（E-5 强制项） |
| NOTE | N-1 | 「已根治/彻底绕开」建议在已知问题段补自闭环半句：imageData RPC 保留为旧产物 onError 回退（client.js:3764/3809；破坏④已披露） | 收口时补半句 | 否 |
| NOTE | N-2 | 「41 条待消化」实为 39 待消化（41 = P0×2 已修 + 39） | 收口时数值对齐 | 否 |
| NOTE | N-3 | 底账 44 为 E-1 时点口径；E-4 后 range=45，tag 时更大（v0.3.3 同型先例，尾账口径可接受） | E-5 注明终值或延续口径注记 | 否 |
| NOTE | N-4 | 破坏①files 枚举不全：v0.3.3→HEAD files 新增实为 **2 个**（`lib/host-route.js` + `lib/oauth-llm.js`，后者 = bc500f7），论证①仅列 host-route；「只增不减、依赖零变更」实质成立（Compare-Object 实证） | 收口时枚举补全 | 否 |

---

## 审查环境与边界声明

- 本审查为只读审查：仅使用只读 git 检视（show/log/rev-list/tag）与文件实读（read/grep/glob）；**未运行任何测试、构建、安装命令，未触碰用户真实环境**。
- E-2 门控 17/17 与 E-3 隔离冷装结论按任务边界采信 Coordinator 复跑记录（EV-117/EV-119），本审查核验的是证据链存在性与内部一致性（数值交叉验证通过），非复跑复验。
- GitHub Release（E-5）与 tag 尚未执行——本报告结论针对发布段就绪状态；E-5 携带 W-2 强制项后发布链方可闭环。
