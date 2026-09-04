# v0.4.3 版本计划——dsh plugin 标准插件管理支持

> 任务：EVO-015（产品实现）+ REL-009（发布链）· 2026-09-04 立案
> 用户裁决（2026-09-04，ask_user_question 四项）：①补支持+文档+实测 ②v0.4.3 立即发布 ③暂不发 npm（在线用 git spec）④本机迁移用户自理（按 README 步骤）

## 1. 版本目标

让 `dsh plugin --profile web add/remove/update` 标准管理命令对 dsh-agent-router 真实可用（现状：装而不激活），README 安装文档随之双通道化（标准命令 + 脚本安装），每条写入 README 的命令经隔离环境实测。

## 2. 事实依据（已锚定，无需重新考证）

| # | 事实 | 锚定 |
|---|---|---|
| F-1 | 宿主 `dsh plugin` = pnpm 薄转发器；判活 = 包 package.json `dsh.bundle.patch !== undefined`；无声明 → warning「not a profile layer」不激活 | plugin-9h8shc4d.js L25-33/L57 |
| F-2 | bundle patch 层 = 顶层 YAML 数组 loader patch 条目（与 profile patch 同构）；loadProfile 逐 bundle 解析，缺声明 fail-loud | dsh-app-boot/lib/index.js L291-297/L546-556 |
| F-3 | 本插件需要的两条宿主行：`router`（name: dsh-agent-router）+ `tool-router`（name: dsh-agent-router/tool）——与 install.ps1 L158-170 写入宿主 profile 的行一致 | install.ps1 |
| F-4 | 同机先例：dsh-reasoning-level（file: 安装）/ dsh-mcp-bridge（registry）均声明 dsh.bundle 且正常工作——形状对齐源 | 两包 package.json 实采 |
| F-5 | npm registry 未发布 dsh-agent-router（E404）→ 在线 add 必须用 git spec `github:peterwangze/dsh-agent-router` | npm view 实测 |
| F-6 | 宿主 anchorPathSpec：相对 `./`/`../`（含 file:/link: 前缀）锚定调用方 cwd；裸名不锚定当 registry 解析 | plugin-9h8shc4d.js L90-94 |
| F-7 | pnpm `file:` = 真实安装依赖齐备；`link:` = 符号链接依赖不装（用户裁决离线必须 file: 的根因） | pnpm 语义 + 用户指令 |
| F-8 | 共存安全：junction 安装不受影响（dsh.profile.bundles 不含本包，loadProfile 不读其 dsh.bundle 字段） | 推演 + E2E 验证 |
| F-9 | 宿主 0.1.1-rc.2 支持 dsh plugin；pnpm 在 PATH | 实机实采 |

## 3. 变更范围（EVO-015，产品四文件单 commit）

1. `cordis.patch.yml`（新建）：两条 insert（F-3）
2. `package.json`：dsh.bundle.patch 声明 + files 收录
3. `README.md`：安装章节双通道（方式一标准管理命令矩阵 npm/npx × 在线 git spec/离线 file: + 迁移段；方式二脚本保留；AI 安装段更新；FAQ 补 update）
4. `tests/install-entry.mjs`：判别断言（bundle 声明/patch 文件形状/files 收录/client 保留）RED→GREEN

不改动：install.ps1/install.sh（保留为无 pnpm 替代通道）、lib/*（运行时零变化）、CHANGELOG（E-1 承载）。

## 4. 执行链 E-1 ~ E-7

| 步骤 | 内容 | 门禁/证据 |
|---|---|---|
| E-0 | EVO-015 开发+审查闭环（Developer → Code Reviewer R0 → T1/T2 状态机） | 判别 RED→GREEN + 隔离 E2E + 18 套件全绿 + review 机录 |
| E-1 | bump 0.4.3 + CHANGELOG 段 + README 版本号/链接 v0.4.3 校对 | 三分账对齐（产品/治理/文档） |
| E-2 | 门控十八面复跑（canonical 18 套件含 install-entry，metrics.mjs 除外） | 全 exit 0 + 断言计数 vs v0.4.2 基线零回退 |
| E-3 | 隔离冷装：npm pack → TEMP 解包 → DSH_HOME 重定向安装 → **断言 tarball 含 cordis.patch.yml + package.json 含 dsh.bundle** + lib 16 文件（15 模块 + patch yml）+ import OK | 措辞纪律：「隔离环境安装冒烟（环境变量重定向至临时目录）通过」 |
| E-4 | 发布审查（Release Reviewer R0） | review-record 机录 |
| E-5a | push main | hooks M7.5（EVO-015/REL-009 tracker 行在） |
| E-5b | **在线 git spec 隔离 E2E**（新步骤，v0.4.3 特有）：DSH_HOME 重定向 → `npx -y @deepseek-ai/dsh@0.1.1-rc.2 plugin --profile web add github:peterwangze/dsh-agent-router` → 断言双登记 + 无 warning → remove 清理 | README 在线命令真实性证明（push 后 tag 前时序） |
| E-5c | tag v0.4.3 + push tag + GitHub Release（asset `dsh-agent-router-0.4.3.tar.gz`——**无 v 前缀**，对齐 v0.4.2 实测资产形态；npm pack 产物改名，根目录 package/） | README 链接与 asset 名一致（R0 P2-2 勘正：v0.4.2 实测 GitHub API 资产名无 v 前缀） |
| E-6 | 归档检查（archive migrate --auto --dry-run；FIX-281 域 arch 计数异常预期延续，如实记录） | verify_workflow |
| E-7 | 用户验收：①方式一命令可用（或按迁移段完成本机迁移）②重启后插件正常 ③README v0.4.3 链接可下载 | 用户确认 |

## 5. 回滚方案

| 场景 | 动作 | 成本 |
|---|---|---|
| E-0~E-2 任一失败 | 本地 revert；未 push 零影响 | 分钟级 |
| E-5b 在线 E2E 失败 | 不打 tag；main 上 hotfix 后重走 E-5b（main 已含功能但未发版；README 方式一 v0.4.3 链接在 E-5c 前为 404——R0 P3-5 已披露，push 与发布同窗执行即消除；拖延超窗则在 Release notes 披露） | <1h |
| 发版后发现缺陷 | v0.4.4 热修（同链）；标准管理形态下用户 `update` 即收（无 junction 迁移负担） | 常规 |

## 6. 风险

| 风险 | 概率 | 缓解 |
|---|---|---|
| R-a pnpm 对 file: 目录含本地 node_modules 的打包行为差异（dev 树含 junction 形 node_modules） | 低 | E2E 直接用 dev 树实测；发行走 npm pack 产物（E-3 复验） |
| R-b 在线 git spec 在部分网络环境不可达（GitHub 依赖） | 中 | README 同时保留脚本安装通道（方式二）与离线 file: 通道；不删旧路 |
| R-c 老用户手写行 + bundle 层并存导致重复注册 | 中 | README 迁移段明确「先清后装」顺序；迁移三步逐步可验证 |
| R-d npx -y @deepseek-ai/dsh 版本漂移（未来 registry 新版本行为变化） | 低 | E2E/E-5b 钉 @0.1.1-rc.2；README 不钉版本（用户取最新） |

## 7. 三分账口径

- 产品 commits：EVO-015（四文件）+ E-1（bump/CHANGELOG/README 校对）
- 治理 commits：triage/tracker/evidence/version-plan/review 记录
- 发布范围：v0.4.2..v0.4.3（发布时 git log 实采填入 CHANGELOG）
