# 审查报告：EVO-015 R0 — dsh plugin 标准管理支持（commit 7965c9d）

> **round**: 0（首审） · **审查对象**: commit `7965c9d06b57db5ec89d962dc45693083ee3e9c9`（HEAD 实证，.git/logs/HEAD L340；未 push） · **日期**: 2026-09-04 · **审查方式**: 纯只读（read/grep/glob，零命令零写操作）

---

## 一、审查结论

## **APPROVED_WITH_NOTES** — `unresolved_blockers=0`

- P0 = 0，P1 = 0；P2×2（均不阻塞本轮合并：一项为测试判别力增强项，一项为治理文档同步义务，有主有期）
- 硬门槛：P0=0 ✓｜5 维度全覆盖 ✓｜8 必查项全覆盖 ✓｜每条发现带级别 ✓｜APPROVED_WITH_NOTES 含结构字段 ✓
- 附带验证义务（不阻塞本审查对象）：①在线 git spec E2E 由 REL-009 **E-5b** 承载（push 后 tag 前，EV-144 已如实记录）；②version-plan E-5c 资产名须在 E-4 前同步（见 P2-2）

---

## 二、8 个必查项逐项结论

### ① 宿主契约一致性（桩锚定维度）— **PASS**

| 核验点 | 事实锚点 | 结论 |
|---|---|---|
| patch 两条 insert 与 install.ps1 模板逐字一致 | `cordis.patch.yml` L7-11（`- insert:` / `    - id: router` / `      name: dsh-agent-router` / `    - id: tool-router` / `      name: dsh-agent-router/tool`）vs `install.ps1` L163-167（New-PatchTemplate）**及** L186-190（Add-PatchEntry newEntry）——逐字符比对含缩进完全一致 | ✓ 逐字一致（含 id/name/缩进） |
| `dsh.bundle.patch` 声明形状与先例一致 | `package.json` L16-19 vs 先例 `dsh-reasoning-level/package.json` L16-19：`"dsh": { "bundle": { "patch": "./cordis.patch.yml" } ... }` 形状逐字同构 | ✓ |
| client 字段四项 inject 原样 | `package.json` L20-28 vs 先例 L20-28：platform=web + inject 四项（runtime/ui-settings/locale/api-remotes）**同序逐字一致** | ✓ 原样 |
| 宿主判活锚点 | `plugin-9h8shc4d.js` L25-33 实读：`readProfileManifest(NAME, dir).dsh?.bundle?.patch !== void 0` ✓；L121：exit 0 才 `reconcilePlugins` ✓ | ✓ 与声称吻合 |
| bundle patch 层格式锚点 | `dsh-app-boot/lib/index.js` L284-297（顶层 YAML 数组 loader patch 条目 + 组合顺序 bundle 层→用户层→launcher 层）+ L539-566 loadProfile 逐 bundle 读 `dsh.bundle.patch` 并 `loadOverlayPatches`（L546-556 恰为任务指称区段）✓ | ✓ |
| 行为等价性 | 同一 `- insert:` 顶层条目形状经同一 `loadOverlayPatches` 解析（bundle 层 L555 / 用户层 L564），且 EV-144④ `--dump-default-config` 实测 32KB 配置含 dsh-agent-router（bundle patch 被宿主真实解析） | ✓ 两通道注册同一对服务 |

### ② README 命令保真度 — **PASS**

| 核验点 | 事实锚点 | 结论 |
|---|---|---|
| 在线 add git spec ×2 形态 | README L36-37 `dsh plugin --profile web add github:…` / `npx @deepseek-ai/dsh plugin … add github:…`；宿主 runPlugin 薄转发 pnpm（L101-112）；F-5 npm registry E404 佐证 git spec 必要性（version-plan L18） | ✓ 与宿主行为一致 |
| 离线 add file:./ ×2 形态 | README L48/L55；anchorPathSpec L90-94 实读：正则仅匹配 `.`/`..` 开头（含可选 file:/link: 前缀），`file:./` → 锚定调用方 cwd 绝对路径；裸名透传 → pnpm 当 registry 名（README L58 警示原文准确） | ✓ |
| update / remove | README L64-65；reconcilePlugins L46-78：update 后声明仍在 → 双登记保持；remove 后依赖摘除 → `wasDependency && !stillBundle` → 移出 bundles | ✓ 语义由源码支撑 |
| pnpm 前置 | README L30；宿主 L113-116：pnpm ENOENT → 明确报错 exit 127 | ✓ 如实 |
| 宿主版本要求 | README L30「DSH ≥ 0.1.1-rc.2（含 dsh plugin 命令）」；本机 `@deepseek-ai/dsh/package.json` L4 = `0.1.1-rc.2` 且含 plugin 命令 | ✓ |
| 迁移三步自洽 | README L103-121：先清手写行→删 junction→再 add；理由（手写行与 bundle 层重复注册）与组合顺序自洽——bundle 层（L295-297 先于用户层）与用户层手写行并存 = 同一对 insert 执行两次 = 双重注册 | ✓ |

### ③ 发行包事实勘误落实 — **PASS**

- 方式一离线段：`dsh-agent-router-0.4.3.tar.gz`（**无 v 前缀**）链接文字/URL/tar 命令三处一致（README L41/L46/L53）；「解压出 `package/` 目录」（L39/L47/L54）= npm pack 形态 ✓
- 方式二保留段：v0.4.2 资产名同步为无 v 前缀（L86/L91/L98），链接 tag 与文件名一致 ✓
- Developer 实测依据：EV-143 附记勘误×2（tar -tzf v0.4.2 资产实采：无 v 前缀 + 根目录 `package/`），证据链完整

### ④ 判别断言质量 — **PASS（附 P2-1 增强）**

- 第 3 节实数 **11 断言**（install-entry.mjs L245/246/247/249/253/254/255/260/261/262/263），与 smoke 1087→1098（+11 精确吻合）自洽
- 删除/改写型回归必 RED：patch 声明移除（L245）、yml 删除（L249/253-255）、files 漏收录（L247，FIX-014 同型防御）、README 命令行删除（L260-263，断言子串与实文逐一比对命中 L36/37/48/55/64/65/58）✓
- 豁口：**子串 includes 允许后缀扩展型突变假绿**（`id: router`→`router2` 不触发）→ P2-1
- BOM/编码免疫：全部被断言子串位于 L36 起、均非首行——首字节 BOM 与否结构性不影响断言（read 呈现首行无 BOM 痕迹）✓
- 节编号 1-8 顺延（L211/224/238/266/296/308/333/426），前序节断言零丢失 ✓

### ⑤ 范围纯粹性 — **PASS**

- 全库 mtime 排序（glob 935 路径完整序）：`tests\install-entry.mjs` / `cordis.patch.yml` / `package.json` / `README.md` 为最新四条产品改动（spill L929-932）；`install.ps1`（L38）/`install.sh`（L37）/全部 `lib/*`（L111-908 区段）/其余 tests mtime 均早于本轮、早于 EVO-015 治理记录（L926-928）
- reflog：HEAD 前一条即 REL-008 v0.4.2 发布终态（L339），7965c9d 为其后唯一 commit（L340）
- 无过度实现：11 行声明式 yml / 4 行声明式 package.json / 文档改写 / +11 断言，无多余机制（diff 行数统计 +97-23 等未验证——无 git 命令权限，不影响结论）

### ⑥ AI 专项 5 项 — **全清**

| 项 | 结论 | 依据 |
|---|---|---|
| mock 残留 | 无 | 四文件零 mock；测试 fixture 为文档化设计（L16-17 沙箱兼容声明） |
| 硬编码返回值 | 无 | 变更均为声明/文档/断言，无运行时返回路径 |
| 幻觉 API | 无 | 唯一新 API 面 `dsh.bundle.patch` 宿主源码实锚（①项锚点）；README 命令逐条对宿主源码行为 |
| 未实现 TODO | 无 | 四文件零 TODO |
| 过度实现 | 无 | ⑤项已证 |

### ⑦ 安全 — **PASS**

- yml 注入面：宿主允许 patch 层 `!!js` 表达式（dsh-app-boot L336-337）——本文件**纯静态两行映射，零 `!!js`、零外部输入**，注入面为空 ✓
- 无敏感数据（四文件零 token/key/凭据）✓
- README 在线命令为既定 irm/iex 与 git spec 通道，无新增攻击面 ✓

### ⑧ 共存影响 — **PASS（声称成立）**

源码级推演（全部实锚）：loadProfile 仅映射 `dsh.profile.bundles`（dsh-app-boot L546-556）——脚本通道用户该列表不含本包（junction 是 `profiles/node_modules` 裸目录，非 profile package.json 依赖，reconcilePlugins 只遍历 dependencies，plugin-9h8shc4d.js L49-59）→ 其 `dsh.bundle` 声明永不读取；手写行经用户层照常生效（L558-564）；flat fallback 双锚解析保障 junction 可解析（L299-305）。EV-144 实测：真实 `~/.dsh` 操作前后 hash 逐字一致（A654DBDA…/FBAF9A21…）✓

---

## 三、5 维度结论

| 维度 | 结论 | 要点 |
|---|---|---|
| 正确性 | ✓ | 四文件逐行读毕；插入行逐字一致；两通道行为等价性由宿主同源解析函数支撑 |
| 安全性 | ✓ | 无注入面/无敏感数据/无动态表达式 |
| 可维护性 | ✓ | yml 头注释成文双通道一致性约束（L1-6）；测试注释锚定回归目标；台账 P2-1/P3-1/P3-3 |
| 性能 | ✓ | 零运行时路径变化（lib/* 未动）；patch 层一次性加载 11 行，无可测开销 |
| 测试覆盖 | ✓ | +11 断言精确入网（smoke 1098）；隔离 E2E add/update/remove/dump 实测；缺口=在线 git spec E2E（有主 E-5b，见遗留项） |

---

## 四、发现清单（含 P2/P3 台账）

| # | 级别 | 位置 | 描述 | 建议 |
|---|---|---|---|---|
| P2-1 | P2 建议 | tests/install-entry.mjs L250-255 | 断言用子串 `includes` 非整行相等：后缀扩展型突变（`id: router`→`router2`、`name: dsh-agent-router`→`…-x`）不触发 RED；`'- insert:'`（L253）任意缩进均通过。本节是该通道唯一自动化守卫（E2E 为手动），判别力应从紧 | 改整行相等：`patchLines.some(l => l === '    - id: router')` 等；顶层锚定用首个非注释行 `=== '- insert:'` |
| P2-2 | P2 建议 | .governance/version-plan-v0.4.3.md L44/L53 | E-5c 资产名写作 `dsh-agent-router-v0.4.3.tar.gz`（**带 v**），与 EV-143① 实测勘误（无 v 前缀）及 README L41（无 v）矛盾；L53 回滚假设「离线段仍指 v0.4.2」亦与现状不符。REL-009 E-5c 若按 plan 原文发布资产 → README 坏链复现 | E-4 发布审查前同步 plan 文档资产名为无 v 前缀；E-5c 门禁加「资产名 = README 链接逐字一致」断言 |
| P3-1 | P3 | tests/install-entry.mjs L246 | client 保留断言仅验 `inject.length > 0`，四项逐条未锁定（当前态与先例逐字一致，无回归） | 锁定四项数组逐字相等 |
| P3-2 | P3 | README.md L116-118 | 迁移第 2 步 junction 删除命令对 robocopy 拷贝回退用户（install.ps1 L97-98/L130 存在该路径）会抛错中止；失败形态安全（无数据风险）但文案未覆盖该 cohort | 补一句「若目录非链接（拷贝回退形态）请直接删除目录」 |
| P3-3 | P3 | tests/install-entry.mjs L238-243/L266-267 | 节 3 块与节 4 体缩进不一致（2 空格块 vs 4 空格体）——纯外观 | 顺手统一 |
| P3-4 | P3 | README.md L44-56 | 离线示例 Windows 块用 `dsh`、POSIX 块用 npx 形态，各只示一形；npx 形态的 Windows 用户需自行替换（在线表已双形） | 可选：注释一句替换规则 |
| P3-5 | P3 | README.md L41 | 方式一预写 v0.4.3 资产——v0.4.3 发布前链接 404；已由 version-plan E-1 校对/E-5c 发布闭环覆盖（L38/L44），推送与发布同窗执行即消除 | 确保 E-5a push 与 E-5c 发布同会话完成 |

---

## 五、遗留项 / 未验证项（事实红线披露）

1. **在线 git spec add 真实 E2E**：未验证（EV-144 如实记录 npx 网络超时 fallback）；机制面已由宿主源码 + 离线 file: E2E + F-5 E404 佐证；**绑定 REL-009 E-5b（push 后 tag 前）执行，不得跳过**。
2. **smoke 1098 / 18 套件全绿**：Developer 证据引用（EV-143/EV-140 基线），本轮只读审查未复跑——由 REL-009 E-2 十八面复跑门禁兜底。
3. **diff 行数统计**（+97-23 等）：未验证（无 git 命令权限），以 mtime 全库排序 + reflog 单 commit 佐证范围，不影响结论。

---

## 六、硬门槛裁决

| 门槛 | 结果 |
|---|---|
| P0 = 0 | ✓（0/0/2/5） |
| 5 维度全覆盖 | ✓ |
| 8 必查项全覆盖 | ✓（①-⑧ 全 PASS，各附锚点） |
| 每条发现带级别 | ✓（P2×2、P3×5） |
| `unresolved_blockers=0` | ✓ |

**复审协议提示**：本结论为通过终态（APPROVED_WITH_NOTES / 0），复审链可闭合；P2-2 与遗留项 1 为 REL-009 发布链义务，非本任务阻塞。

— Code Reviewer Agent（只读审查完成，未执行命令、未写文件、未创建子 agent）
