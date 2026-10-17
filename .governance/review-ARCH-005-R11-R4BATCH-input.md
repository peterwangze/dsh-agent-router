# ARCH-005 / R4 批 代码审查报告（Code Reviewer，round 11 / unit R4-batch）

> 持久化说明（Coordinator）：本文件为 Code Reviewer sub-agent 返回报告的逐字入库副本；机器登记 = review-record --task ARCH-005 --round 11 --unit R4 --result APPROVED_WITH_NOTES。审查时间 2026-10-17；对象 = staged 3 新文件（先审后提交）；P2 F-1 已退回原 Developer commit 内修复。

## 一、最终结论

## **APPROVED_WITH_NOTES**（unresolved_blockers = 0）

- P0=0，P1=0，P2=1（F1），P3=3（F2~F4）。可合并；P2 为遗留项（已退回修复）。
- Developer 自报全部关键主张经零采信独立核验**成立**，其中两项（T-6 判别、registry range 论证）以 Developer 未用过的取证法（252MB 真实树完整复制复演 / npm view 本机实跑）独立复现。

## 二、Findings

**F1【P2｜可维护性】probe 与测试套件文件头注释仍写「repo variable」载体——与 yaml 修正后事实矛盾**
- 位置：`scripts/host-radar-probe.mjs:23-25`；`tests/host-radar.mjs:16-18`。
- 事实：`host-radar.yml:21-36` 选型注记已改判「repo variable 不可执行（GITHUB_TOKEN 403）」、载体 = workflow 运行历史 + issue 标题；且 `tests/host-radar.mjs:374-376` 编排守卫明确断言「零 repo variable 残留」——**测试文件内部自相矛盾**。功能零影响（45/45 绿），误导后续维护者；测试守卫只扫 yaml 文本故不会自红。
- 建议：两处注释同步为「workflow 运行历史（gh run list 最近 success updatedAt）+ issue 标题前缀载体」。

**F2【P3】心跳自警 issue 无幂等门——与 probe issue 幂等门不对称**（`host-radar.yml:148-155` vs `:239-242`）：probe job 持续红 ≥2 周且 radar job 每周成功的形态下每次 radar 成功运行都开心跳 issue → 每周重复。低概率纯噪声。建议随 F1 顺手补同型幂等门（查 open 的 `host-radar heartbeat stale:` 前缀）。

**F3【P3】CLI 模式互斥不校验**（`host-radar-probe.mjs:89-92`）：多模式参数同给时静默按优先取一。CLI 是 workflow 唯一消费面（每步单模式），实际影响极小。

**F4【P3】InputState 正向锚与契约套件判据细微不同构**（probe:310 全文 includes vs contract:1124-1126 块内 includes）：宿主未来挪串场景 probe 漏报此 diff（contract 会红）。probe 属探测非门控，影响限于灵敏度。

## 三、yaml 状态载体修正裁定（核心——主张可接受）

**裁定：平台行为主张接受；替代设计正确性独立成立（不悬空于该主张）；CI 首跑复核义务登记。**

1. **主张依据强度（双源吻合）**：官方 workflow syntax 文档 permissions scope 列表**无 `variables` scope**——结构性无法向 GITHUB_TOKEN 授予 Variables 权限（官方文档可直接推出）；GitHub community discussion #146874（编号精确真实）确认即使 actions:write 仍 403。本机无法实证平台行为——官方文档结构性推导 + 社区实证双源，强度足够。
2. **替代设计推演（全过）**：心跳 = gh run list 最近 success 的 updatedAt（失败运行不刷新 ✓）；已告警 = issue 标题前缀提取（无关标题不污染 ✓）；「开 issue 即状态推进」消除 matrix 并行竞争 ✓；幂等门 ✓。**关键性质：即便平台主张未来失效，该设计仍正确可执行——选型保守方向，正确性不悬空。**
3. **死配置检查**：全仓 grep 零残留（HOST_RADAR_LAST_SEEN/SEEN_VERSIONS/actions/variables 零命中，编排守卫机器锁定防回归）。
4. **issue-body 修正实证**：内嵌脚本实跑从 `report.summary.packageAbsent` 读取 ✓（前任错引消除，tests:395-396 字段面锁防复发）。
5. **登记（CI 首跑复核义务，非阻塞）**：schedule 触发/gh 真机行为/actions:read 充分性/em-dash 编码——首跑后回填。

## 四、T-6 判别实证核验（独立复现成立）

1. **registry range 论证**（本机实跑）：`npm view @deepseek-ai/dsh@0.2.0-rc.2 dependencies` 返回 range（~3.18.4/~4.0.4）非解析版本 ⇒ T-6 形态在 registry 侧恒零 diff ⇒ (b) 不可选、选型 (a) 成立。
2. **真实树双树复演**（reviewer 独立，252MB 完整复制）：treeA totalDiffs=0；treeB（仅 schemastery 3.18.5→3.18.6）`totalDiffs=1, schemastery={mismatch, '3.18.6'≠'3.18.5'}`，其余三类零——恰 1 diff 精确点名。（附带实证：scope-only 形态 dsh 主包正确走 absent 判据。）
3. **dist-tags 双向**：主包未变 → newVersions=[]（T-6 形态纯 dist-tags 永不触发——失明论证成立）；live 捕获三 tag → 0.2.1-alpha.5 判新 ✓。

## 五、独立复跑结果汇总

| 项 | 结果 | 判定 |
|---|---|---|
| `node tests/host-radar.mjs` | **45/45 PASSED exit 0**（含 6 P8 负控/机器锁 6/编排守卫 7） | ✓ |
| run-all（chcp 65001） | **23 套件 22 PASS + smoke 恰 2 sh 臂 + #SKIP 0**；host-radar 自动枚举接入 PASS | ✓ 新基线精确吻合（不带 chcp 会 6 FAIL——验收命令必须带） |
| probe 0.2.0 全局树 | totalDiffs=0（四类全零） | ✓ |
| probe frozen r3 树 | totalDiffs=17 = 8 白名单差（与 HD-005 逐名一致）+ agentPresets authorable 差 + 8 mismatch + 2 absent | ✓ 独立复算逐项吻合 |
| yaml 结构 + 5 内嵌脚本 | python 校验通过；seen/LAST_SEEN/targets/IS_NEW/TOTAL/issue-body 全实跑 | ✓ |

## 六、其余维度

- **正确性**：基线单源 = 提取非复制（marker 四方一致：snapshot:75 权威/host-contract:221/ci.yml:182/probe:172；四契约常量与 host-contract 逐字一致）；四类 diff 判据同构抽核（事件正则/7c 方法正则/schemaBlockOf/7d 四针——唯一不同构 = F4 正向锚）；探测不门控（无路径把 diff 变非零——全突变树测试+三次真实树 exit 0 实证）；DSH_HOST_SOURCE/DSH_BASELINE 语义与 R3 fail-closed 一致；无死配置无断链。
- **安全性**：权限最小化（contents:read+actions:read+issues:write）；零硬编码凭据；issue body 走 --body-file 防注入。
- **可维护性**：判定单点（yaml 零判定零版本字面量）；编排守卫真防回归（F1 注释矛盾是唯一漏网面）。
- **性能**：一次性进程/hostRead 缓存/零 npm 依赖（动态 import 链已核）。
- **测试覆盖**：判别力抽核通过（恰 1 diff 精确计数/双向点名/absent≠mismatch/绿树机器锁；38+7 计数独立复核=45）。
- **AI 五查**：全零命中（绿树夹具常量受机器锁强制同步权威源）。
- **P-violation**：无新增（P5/P8/探测不门控均满足）。零行号锚核实。
- **设计一致性**：§6 R4 行/§2-B 四维-c/DEC-3/NEW-1-T-6 吸收全部逐项落实。

**遗留项**：F1（已退回修复）；F2~F4（P3）；CI 首跑复核义务（首跑后回填）。
