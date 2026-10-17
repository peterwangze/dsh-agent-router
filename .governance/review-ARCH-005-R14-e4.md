# RELEASE REVIEW REPORT — ARCH-005-E4（v0.6.0 发布门独立审查）

> 机录副本：Reviewer 以消息体返回报告（按禁止事项不写文件），Coordinator 落盘后经 review-record CLI 写 canonical 记录。
> 审查对象：dsh-agent-router v0.6.0（HEAD `74ad536`）| 只读：未修改任何文件、未执行 tag/Release/push
> 结论：**APPROVED_WITH_NOTES** | **unresolved_blockers = 0**
> Reviewer agent: agent_5dffcc00（独立取证——npm pack --dry-run shasum 复核 / gh run view / git rev-list 机器分类自建复核，非采信叙述）

## 检查清单逐项裁决（11 项全 PASS / 1 项 N/A）

### 1. 版本一致性 — PASS（零漂移）
- package.json `"version": "0.6.0"`（第 4 行）↔ CHANGELOG `## v0.6.0 — 2026-10-17`（第 6 行，日期=今日与「E-1 定版时点」口径一致）↔ README badge/下载 URL×2/tar 名×4/固定版本示例全量 grep 均 0.6.0（唯一 "0.5.0" 残留为第 161 行功能历史描述，非版本面）。
- E-3 沙箱实测 ↔ 当前 HEAD：`npm pack --dry-run` 独立执行——filename `dsh-agent-router-0.6.0.tgz`、**shasum `579cb708837f8a84...` 与 E-3 记录前缀逐字吻合**、33 files、1.7MB 吻合——当前 HEAD 打包产物 = E-3 沙箱实测对象，链式闭合。

### 2. CHANGELOG 发布门质量 — PASS
- 七段结构全覆盖（摘要/新增×5/修复×7/变更×3/破坏性变更〔结论行+5 分项+是否算 breaking 明确结论〕/已知口径×5/版本说明）。
- T-1 措辞：HD-004 明文「恢复而非 0.2.0 回归修复」+ npm pack 实证依据；摘要同步。
- 破坏性变更结论行 ↔ DEC-33 记录 DEC-1 口径逐字一致。
- 三分账算术独立复核：`git rev-list --count v0.5.0..d71dee2` = **117**（E-1 时点实采）；`v0.5.0..74ad536` = **118**；机器分类（diff-tree 全父形态取文件并集，仅 .governance/ 计治理）= **69 PROD + 48 GOV = 117**——结论行逐数吻合，叙述自洽非数字错位。

### 3. 回滚方案 MUST 存在 — PASS（三层在案）
① 数据降级路径（v2 统计行边界 + `DSH_HOME/dsh-agent-router/stats/` 备份指引，CHANGELOG 第 53 行）；② git revert 路径（DEC-33「各批独立 revert 可回滚」+ SOP 第 177 行批粒度回滚 + 十批 SHA 底账）；③ 装载门兜底（低于基线整层拒载）。

### 4. CI 绿 — PASS（独立 gh 复核）
run 38991525002：headSha = `74ad536`（发布候选本体）、completed/success；4 job（基线档案 id 解析/全量门控/矩阵 0.2.0/矩阵 0.1.5）全部 conclusion=success——矩阵双基线由红转绿实证成立。

### 5. 门控全量实测入账 — PASS
23 套件 22 PASS + smoke 恰 2 条 sh 臂环境性 FAIL（明示 CI 为权威）+ #SKIP 0；本地 sh 臂失败在「已知行为」段常态披露——无未观测吞错。

### 6. 冷装装载门判据全绿 — PASS
E-3 记录 + shasum 独立复核逐字吻合 + R4F 批 cold-install-gate GREEN 含 --expect-skip 判别臂自证。

### 7. 审查链完备 — PASS
REVIEW-ARCH-005-R3~R13 共 11 条逐条核验，全部 APPROVED_WITH_NOTES | unresolved_blockers=0，每条含报告工件 + report_sha256 + commit 锚。

### 8. 锁与治理义务 — PASS
R4F CI 首跑复核义务由 38991525002 闭合；雷达首跑复核义务开放（发布后动作）且 CHANGELOG 第 52 行如实披露「不声称雷达已在线生效」。

### 9. 用户视角三问 — PASS
获得（README URL v0.6.0 ×2 + E-6 资产）/ 知道（CHANGELOG + Release notes）/ 体验（四断点+图片直传恢复+三态徽章+四件真机修复）。

### 10. 遗留义务披露完整性 — PASS
SOP §7 真机复验清单恰 12 条（A/B/C/D/E/F 分节，每条 P10-③ 证据形态）+ FIX-052/049 顺延在案 + 「不预填」口径如实。

### 11. Feature Flag — N/A（本版无新 flag 面）

## 分级发现（无 BLOCKING）
- **N1（NOTE）** run 38991525002「基线档案 id 解析」job API 回报 status=in_progress 与 conclusion=success 并存——GitHub API 字段回报异常；权威判定 = run 总体 completed+success + 4/4 job conclusion=success。非发布风险。
- **N2（NOTE）** CHANGELOG 正文审查号止于 R12，R4F 批 R13 经 commit message + evidence-log 第 798 行 + 机录工件三重可溯——用户面文档不逐审查号罗列可接受。
- **N3（NOTE）** README 下载 URL 在 E-6 执行前 404 属预期时序；**E-6 资产名 MUST 逐字 `dsh-agent-router-0.6.0.tar.gz` 并做 curl 200 + 字节数终验**（v0.4.6 W-1 先例口径；CHANGELOG 行 60 已录 1,702,929B 为终验记录值）。
- **N4（NOTE）** E-3 精确字节数终验属 E-6 面（本审查 dry-run 复核为 shasum 前缀+文件数+体量三重吻合）。
- **N5（NOTE）** CI annotations 平台警告（Node 20 deprecation / ubuntu-latest 2026-10-19 迁移）——后续 CI 维护卫生项。
- **S1（SUGGESTION）** E-6 Release notes 建议复用 CHANGELOG v0.6.0 摘要段，双载体口径对称。

## 版本位独立建议（E-4 裁决权行使）
**维持 MINOR（0.6.0），不升不降。** 不降 PATCH：实打实新增能力面（三态徽章/雷达/矩阵/冷装程序/SOP）+ 仓内先例「新能力面→中位抬升」；不升 MAJOR：0.x 阶段 npm caret 对 ^0.5.0 本不匹配 0.6.0（0.x 锁 minor）——minor 跳位天然强制依赖方显式升级，破坏性信号由版本位机制 + CHANGELOG 显式披露双重传递；未做 1.0 稳定性承诺，升 1.0.0 缺依据且与先例相悖。

## 发布就绪总判定
11/11 检查项 PASS + 1 项 N/A；0 BLOCKING / 0 P0 / 0 P1；三分账、CI、shasum、审查链四项关键事实均经独立命令复核。**v0.6.0 发布候选就绪，可提交用户 go/no-go（E-5）**；E-6 须遵守 N3 资产名逐字 + curl 终验口径。go/no-go 决策权归用户，本审查不代行。
