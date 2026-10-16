# ARCH-005 / A1 批 代码审查报告（Code Reviewer，round 5 / unit A1-batch）

> 持久化说明（Coordinator）：本文件为 Code Reviewer sub-agent 返回报告的逐字入库副本（sha256 锚定用）；机器登记 = review-record --task ARCH-005 --round 5 --unit A1 --result APPROVED_WITH_NOTES。审查时间 2026-10-17；对象 = staged diff（先审后提交）；P1 F-1 已由 Coordinator 退回原 Developer commit 内修复（删 :277 未声明变量行）。

**结论：`APPROVED_WITH_NOTES`（unresolved_blockers = 0）** — P0=0，P1=1（建议本 commit 内一行修复），P2=1，P3=3。零采信自报。

---

## 一、独立复跑结果（验收门 ①②③④）

| 门 | 独立结果 | 与自报对照 |
|---|---|---|
| ① `node scripts/cold-install-gate.mjs`（绿） | **exit 0，GREEN**——stderr clean (0 bytes) + dump-config 组合树含 `# == dsh-agent-router` 段；沙箱 `arch005-gate-36524-mvb9razi`（独立产生，新沙箱路径证明程序可重复） | 一致 |
| ② 全量网 | **20/21**；smoke 恰 2 条 sh 臂；**#SKIP 0**（口径实读核实：run-all.mjs :164-176 仅统计 PASS 套件 skip 行；smoke 内 `(1 skipped)` 为预存 Windows-only POSIX 权限可见 skip :1264-1266，不在本批 diff 面） | 一致 |
| ③ snapshot | **29/29 绿**；文档 §5 引用的 16 条断言名与实际输出逐字一致 | 一致 |
| ④ 红演示 | 未重放（依任务边界）；沙箱证据核查（见二）——判别力、逐字性、恢复完整性均独立证实 | 证据级证实 |

零产品行为变更核验：`git diff --cached --stat -- lib/` 为空；host-abi-health.mjs 变更全部为注释行（数据结构未动）；190/190 绿。

## 二、沙箱证据核查（红演示 arch005-gate-24780-mvb9l763 + 绿 arch005-gate-8012-mvb9l8k2）

- **三标记 + 逐字性**：boot2-reverted-stderr.txt（555 字节）单行警告与宿主 `dsh-app-boot/lib/index.js:322` 模板**逐字全等**；警告 peerDependencies 对象仅含被回退单项——红绿判别真实且与 R1 证据同形态。
- **判别形态**：组合树 `# == dsh-agent-router` 计数 boot1=1 / boot2=0 / boot3=1（绿沙箱=1）；boot1/boot3/绿 stderr 全 0 字节。
- **恢复完整性**：repo-pkg-bak.json 与当前 package.json cmp 逐字节一致；`git diff -- package.json` = 0 行（staged/unstaged 双零）——git 层独立证实。
- **隔离**：`~/.dsh` mtime 在 Developer 两跑 + 审查复跑后仍为 2026-10-16 23:12:11.710346700 不变——隔离声明行为级证实。

## 三、宿主锚点独立实读（文档判据抽核）

`dsh-app-boot/lib/index.js`：**:516** reportSkippedBundles stderr 短语（与脚本常量逐字同构）；**:320-322** pluginCompatibilityWarning 模板；**:940-945** catch→skippedBundles 形态。**三锚点全部准确**。文档 §5 诚实边界（README 侧文件级包含 vs 声明侧逐项严格相等）与实现完全一致，未造第二套核对。

## 四、五维度结论 + AI 专项五查

正确性✓（带 F-1/F-2）；安全性✓（FIX-337 合规——grep 零 HOME/USERPROFILE 赋值形态，唯一 env 覆写为 DSH_HOME 重定向；仓库写仅红演示且备份先行+复读核对+FATAL 出口）；可维护性✓；性能✓（三级超时 30s/300s/180s）；测试覆盖✓（六类失败出口逐行读核均非零退出+明确错误）。

AI 五查：mock 残留=0；硬编码=0（常量为宿主行为锚）；幻觉 API=0；TODO=0；过度实现=0。

设计一致性：三交付与 §6 A1 行全落位；SOP 位置表与 A1/A3/R2/R5 验收门措辞逐行对应；三方一致核对未造轮子（P5 合规）。

## 五、Findings

| # | 级别 | 锚点 | 问题 | 建议 |
|---|---|---|---|---|
| F-1 | **P1** | `scripts/cold-install-gate.mjs:277` | `restored = true` 未声明变量——ESM 严格模式必抛 ReferenceError；恢复实际已成功但每次 --expect-skip 成功路径产生假失败告警 + 自相矛盾 R4 记录（指纹在 Developer 自身证据 result.json：restore-declaration:exit1 与 restoredGreen:true 并存）。违反 P8 精神 | **本 commit 内删除 :277**（一行修复零风险）+ 修复后复跑留新证据 |
| F-2 | P2 | `scripts/cold-install-gate.mjs:123-124` | 引号保护只作用于上报表不作用于执行（quoted 仅存 row.command；spawnSync 原始数组 + shell:true 在 Windows 不自动加引号）——注释与实际保护面不符 | 二选一：整串命令执行，或改写注释如实声明「仅上报表加引号，执行侧要求路径无空格」 |
| F-3 | P3 | `:259` 与 `:268` | redSeen 同一表达式计算两次——死重复 | 删除或复用 |
| F-4 | P3 | `:96-104` | 绿模式被 revert 目标前置检查硬门控——无该 peer 的 manifest 上绿模式报语义不相关错误 | revert 专项检查移入 --expect-skip 分支 |
| F-5 | P3 | `:258` | 红演示窗口 repo manifest 处于回退态最长 180s；SIGINT/强杀中断即留回退态（缓解在场：沙箱备份 + FATAL 提示含 git checkout，但该场景无提示打印） | 登记已知边界；可选 SIGINT handler |

## 六、硬门槛裁决

P0=0；5 维度全覆盖；findings 标注 5/5；设计一致性完成；AI 专项 5/5。**四态结论：APPROVED_WITH_NOTES（unresolved_blockers=0）**——F-1 由 Developer 本 commit 内一行修复；F-2 随本 commit 或 R5 收口；F-3/F-4/F-5 登记遗留。R4 承接的 F-3（host-abi-health 注释清扫）**已闭合**。
