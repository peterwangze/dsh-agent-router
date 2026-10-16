# 隔离冷装装载门取证程序（cold-install gate）

> ARCH-005 A1 批固化（2026-10-17）。程序本体 = `scripts/cold-install-gate.mjs`。
> R1 批手工验证的「隔离冷装装载门判据」自本批起以**同一可复用程序**承载——
> R2（面板取证）/ A3（端到端）/ R5（复验清单）引用同一实现路径（P5：同一动作
> 多触发来源汇入同一实现路径，禁止手工重演另立路径）。

## 1. 判据（什么算绿 / 什么算红）

在 $TEMP 沙箱（DSH_HOME 重定向）内对仓库做**冷装**（`dsh plugin --profile <name> add <repo>`，
link: 形态——manifest 实时读自仓库树），再以 headless `--dump-config` 启动**同一宿主运行时**
（npm 全局树 dsh，本机 0.2.0-rc.2），断言宿主 app-boot 装载门对 `dsh-agent-router` 放行。

| 面 | 绿（放行） | 红（拒载） |
|---|---|---|
| 启动 stderr | 无任何装载门标记 | 含 `dsh: skipping profile bundle "dsh-agent-router"`（reportSkippedBundles 前缀，dsh-app-boot `lib/index.js:516` 形态）+ `is incompatible with dsh` / `Running it may cause crashes or data loss`（pluginCompatibilityWarning 模板，`:320-322`；catch 进 skippedBundles 形态 = `:940-945`） |
| dump-config stdout | `# == dsh-agent-router` 段在场（bundle 被组合进 profile 树） | 该段消失（bundle 整层拒载，R1 沙箱证据实证：绿 3 次在场 / 红 0 次） |

**判据边界（如实声明）**：本判据只覆盖**装载门放行**（`evaluatePluginCompatibility`
不再拒载）。apply 期断点（HD-002 settings 声明制 / HD-003 codec create()——服务端
register 路径）不在断言面，其收口分别由 A2/A3 批验收门承载；A3 的「服务端 apply 全程
无 throw」是更靠后的完整判据点。

## 2. 用法

```bash
node scripts/cold-install-gate.mjs                # 绿判据：冷装 + 启动 + 断言放行（= R1-③ 判据的程序化复跑）
node scripts/cold-install-gate.mjs --expect-skip  # 红演示（判别力自证）：
                                                  #   boot1 绿 → 临时回退一项 peerDep → boot2 红 + 摘录警告
                                                  #   → 字节精确恢复 → boot3 复跑绿
```

可选参数：`--repo <path>`（默认本仓库）/ `--profile <name>`（默认 `sandbox`，R1 证据同名）/
`--revert-pkg <pkg>`（默认 `@deepseek-ai/dsh-settings`）/ `--revert-range <range>`
（默认 `^0.1.5-rc.2`）/ `--dsh <command>`（默认走 PATH）。

前置：PATH 上有 `dsh`（0.2.0 系宿主运行时）与 pnpm（宿主 plugin-manager 拉起安装用）。
缺 dsh / 冷装失败 / profile 未生成 / 启动超时 → 明确错误 + exit 1（P8 可观测，不静默）。

**输出与留证**：结构化结论（`COLD-INSTALL-GATE-RESULT {…}` JSON 行 + exit
0/1）+ 逐条命令上报表（R4 纪律：命令、退出码、影响路径）+ 沙箱证据文件
（`install-log.txt` / `bootN-stdout.txt` / `bootN-stderr.txt` / `repo-pkg-bak.json` /
`commands.jsonl` / `result.json`），目录路径随结论行打印，供报告引用。沙箱保留不删
（取证件；$TEMP 由系统清理策略回收）。

## 3. 隔离与真实环境防护（破坏性红线配套）

- **DSH_HOME 重定向至 $TEMP 唯一沙箱目录**（每次运行新建）——dsh 的 profile / 状态
  写入只落沙箱；对用户 HOME 下配置目录零删除 / 零清空 / 零重建 / 零移动。实证：
  A1 固化首跑期间 `~/.dsh` mtime 保持 2026-10-16 23:12:11 不变（R1 批同一时点值）。
- **仓库写操作仅存在于 `--expect-skip` 红演示**：package.json 临时回退 → 恢复。
  恢复 = 内存原文写回 + 复读字节核对 + 沙箱内 `repo-pkg-bak.json` 磁盘双保险；
  核对失败即 FATAL 报错并给出恢复命令（cp 备份 / `git checkout -- package.json`），
  绝不静默。
- pnpm 由宿主 plugin-manager 拉起，其用户级 content-addressable store 为**追加式缓存**
  写入（非配置目录写入），如实登记。
- 回退目标串（`"<pkg>": "<range>"`）在 package.json 中命中数必须恰为 1，否则拒绝
  盲替换（P8）。

## 4. 在升级 SOP 中的位置（谁引用本程序）

| SOP 步骤 / 批 | 引用方式 |
|---|---|
| **R1-③ 判据的复验**（本批 A1 验收门 ①） | 绿路径 = 同一判据的程序化复跑，禁止手工重演 |
| **A3 端到端验收**（HD-002 收口后） | 「服务端 apply 全程无 throw」的**前置半边**：装载门判据同 A1 口径以本程序复验（A3 验收门 ① 明文「装载门判据同 A1 口径复验」） |
| **R2 面板取证**（协商三态徽章） | 发布前面板取证的双层口径之**本机隔离冷装臂**：沙箱冷装环境内启动真实宿主渲染面板取证（截图/录屏），装载门放行由本程序同一冷装口径保证 |
| **R5 复验清单**（「重装后真机复验」节） | 发布前隔离臂的机器凭据由本程序产出；真机复验（后置）按同一判据面人工核对（stderr 无 skip 警告 + 功能在位），判据文本以本文件 §1 为准 |

新宿主基线登记（SOP 第 4 步）后，本程序无需改动——判据锚定的是宿主装载门的
**行为形态**（警告文案标记 + dump-config 组合结果），不锚定具体版本号。

## 5. HD-001 声明面收口：三方一致核对凭据（既有断言引用）

HD-001 收口要求 package.json（11 项声明）× `HOST_BASELINE` 注册表 primary 项 ×
README 基线集表**三方版本逐项一致**。经评估，该口径**已由
`tests/host-version-snapshot.mjs` 既有断言机器覆盖**（不重复造轮子）；核对凭据 =
以下断言名（跑 `node tests/host-version-snapshot.mjs`，绿 = 一致）：

| 三方边 | 断言（`ok` 行文本） | 数量 |
|---|---|---|
| package.json → 注册表 primary | `declared dsh range ^0.2.0-rc.2 maps to the PRIMARY registry entry (frozen/absent no longer accepted — F-1 tightening)`（11 项声明收敛到同一范围且恰为主基线口径） | 1 |
| package.json → 注册表 primary（逐项） | `peerDep @deepseek-ai/<pkg> records the PRIMARY baseline range (^0.2.0-rc.2)` | 8 |
| package.json → 注册表 primary（逐项） | `dep @deepseek-ai/<pkg> records the PRIMARY baseline range (^0.2.0-rc.2)` | 3 |
| 注册表 primary → README | `README records host CLI baseline dsh 0.2.0-rc.2` / `README records dsh-* baseline 0.2.0-rc.2` / `README records cordis baseline 4.0.5` / `README records schemastery baseline 3.18.5` | 4 |

三方由传递性闭合（pkg ↔ 注册表逐项相等；注册表 ↔ README 四值在场）。A1 批核对
证据：2026-10-17 跑 `node tests/host-version-snapshot.mjs` = **29/29 绿，exit 0**。

**覆盖面如实声明（边界）**：README 侧断言为**文件级包含判定**（主基线四值在
README 全文在场），未解析基线集表行结构——即「值写错位置但别处出现」不会被该
断言抓出。11 项声明侧为**逐项严格相等**（分裂 / 回退 frozen / 假版本即红，R1 批
F-1 收紧）。若后续需要表行级锁定，属 R3（看护矩阵批）判据增强面，不在本批造
第二套核对。

## 6. 判别红演示（判据非恒绿的自证）

`--expect-skip` 即判别力自证程序：临时回退任一 peerDep 至旧范围（默认
`@deepseek-ai/dsh-settings` → `^0.1.5-rc.2`）→ 冷装环境启动即现
`dsh: skipping profile bundle "dsh-agent-router"` 警告（红，摘录留证）→ 恢复 →
复跑绿。A1 批固化首跑证据（2026-10-17）：

- 红演示沙箱：`%TEMP%\arch005-gate-32660-mvba0zo8\`（boot2 摘录警告与宿主
  `:320-322` 模板逐字一致，且警告只点名被回退的单项——与 R1 批证据同形态；
  R5 审查 F-1 修复后复跑，7 条命令行全 exit=0）；
- 绿路径沙箱：`%TEMP%\arch005-gate-1436-mvba14d5\`（stderr 0 字节 + bundle 段在场）；
- 红演示后仓库 `git diff` 干净（字节精确恢复经 git 层独立证实）。

SOP 义务：装载门判据相关变更（声明面跳跃 / 豁免通道行为 / 宿主装载门实现变更）
后，`--expect-skip` 判别演示 MUST 至少跑一次——恒绿判据无看护价值。
