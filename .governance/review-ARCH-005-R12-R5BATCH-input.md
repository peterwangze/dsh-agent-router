# ARCH-005 / R5 批 代码审查报告（Code Reviewer，round 12 / unit R5-batch）

> 持久化说明（Coordinator）：本文件为 Code Reviewer sub-agent 返回报告的逐字入库副本；机器登记 = review-record --task ARCH-005 --round 12 --unit R5 --result APPROVED_WITH_NOTES。审查时间 2026-10-17；对象 = staged 2 文件（先审后提交）；P2 F-1/F-2 两处一行文本修正已退回原 Developer 随批吸收。

- **审查对象**：staged diff = `docs/host-upgrade-sop.md`（新增 317 行）+ `README.md`（+2 行指针）；对照设计 §2-B 四维-d / §6 R5 行 + R2 复审 F-6/F-7/F-8/N-1 处置
- **结论**：**APPROVED_WITH_NOTES**
- **unresolved_blockers = 0**（P0=0 / P1=0 / P2×2 / P3=0——两条 P2 均为文本级一行修正，随批吸收）
- **只读合规**：未修改任何文件、未 commit、未动 .governance/（收尾 git status 复核与开工一致）

## 一、findings

**F-1【P2】SOP §2b「待验证 5」与 Analyst 清单现行值 6 不符（计数陈旧）**
- 锚点：`docs/host-upgrade-sop.md` §2b 末行 vs `.governance/arch-005-host-diff-inventory.md:237`「待验证 = 6（§6 T-1~T-6；T-6 为 2026-10-17 返工新增）」
- 说明：5 是入库时点（fba63ea）数字；实质面无缺失（SOP 同段及 §1a 已逐条覆盖 T-1/T-3/T-5/T-6），仅数字未随返工刷新。修正 = 一字改 6。非虚构非误导故 P2 非 P1。

**F-2【P2】§1a 雷达通道以「自动，周频」现行口径呈现，未披露「workflow 未推送 + Actions 首跑复核义务在册」的生效前提**
- 锚点：SOP §1a「雷达通道（自动，周频……）」；R4 批（e01213e，host-radar.yml 所在）commit 自报尾段「CI 首跑复核义务登记」；SOP 全文 grep「首跑/未推送/push」零命中
- 说明：雷达实现非虚构（yaml/probe/套件全实存，R4 审查已过），但推送 + Actions 首跑验证前该检测通道尚未在线生效。SOP 对 C2 等已知边界有一行式如实披露惯例，检测主通道同型边界缺席。修正 = §1a 补一行（「首跑复核义务在册——推送前该通道未生效」）。鉴于推送随本批 commit 即发生、义务已在链记录登记，定 P2 非阻塞。

**核实为非问题的三项（留档）**：本批未动 CHANGELOG ≠ 违反 F-8（git 历史实证 CHANGELOG 仅 REL-* 发布链触碰；「发布前 MUST」口径一致）；ci.yml「零版本字面量」成立（注释叙述除外，全 job 派生经 marker）；「3 dsh deps」口径准确（8 peers + 3 dsh 系 deps；cordis/schemastery 独立 range）。

## 二、入口真实性核验清单（防虚构——逐项实存）

24 类入口全部命中：host-radar.yml（cron 30 3 * * 1 + dispatch 三 inputs + probe job 无条件 fresh 树 :53/:56-64/:211-213）；雷达 issue 形态（标题/正文/心跳幂等门/artifact/已告警集=issue 前缀零第二份状态 :118/:153-160/:226-264）；host-radar-probe 三模式 CLI + 恒 exit 0 + 错误前缀 + marker 失败 exit 1（:58-96/:374-411/:175/:222）；cold-install-gate 绿+--expect-skip+六类失败出口+沙箱凭据；a3-apply-gate 真 boot+8085 探针+abort 形态；host-contract 候选链/启动行/可见 skip/DSH_BASELINE fail-closed/恰一 primary/marker 提取（:221-246/:576-663）；HOST_BASELINE_REGISTRY marker **五面**（snapshot :75 权威 + host-contract :221 + ci.yml :182/:237 + probe :175 + lib/version.js :50 投影〔§R2-a 值级锁定 host-abi-health:1855〕）；FORWARDED_EVENT_ALLOWLIST since 注记/三态/RPC 字段；六套件 node --check 10/10；docs/cold-install-gate.md 三段判据文本/SOP 位点表/--expect-skip 义务；CHANGELOG 根在册节结构与 SOP §5-2 一致；chcp 门控口径独立复跑成立。**虚构入口 = 0。**

## 三、walk-through 对表（抽 3 步）

1. **④ 适配批先例索引 × git log**：9/9 commit 号全解析且批次映射精确（R0 bd17cac→…→R2 6d9fead∥R3 dffb553 同分钟并行与 DEC-5 一致→R4 e01213e）；各行文件面/验收门/复用套件与各批 commit message 逐项吻合。①步偏差如实（「第一发现人=用户、R0 前靶子跑过期 rc.3 副本」与设计 F-A 一致）。唯一陈旧 = F-1。
2. **② diff 步 × Analyst 清单**：五桶口径逐项吻合（breaking 4/additive 6/neutral 2 含 HD-012 拆分/存续约 45）；R4 dry-run 双树数字吻合；T-1 定性与 A4 commit 实证吻合。
3. **⑤ 发布步 × F-8 + A1/A3 沙箱凭据**：CHANGELOG 义务行加粗 MUST 口径与仓库 REL-* 惯例一致；三判据与判据文档及脚本实现吻合。

## 四、checklist 完备性 + 独立复跑

- `grep -c "^- \[ \]"` = **23**（§6 基线登记 11 + §7 真机复验 12）。
- 基线登记 11 条 vs 五消费面：**零缺漏**（第五面 lib 投影如实含 item 6）。
- 真机复验 12 条 vs 指定面：**零缺漏**（A 装载门 2 + B 五场景含 N-1〔B5 兑现〕+ C 三态徽章 2〔C2 gate-block 不可达如实披露〕+ D 图片 1 + E FIX-052 1 + F FIX-049 1；「回归面只增不减」条款在位）。
- **全量网独立复跑**（chcp 65001）：**23 套件 22 PASS + smoke 恰 2 条 sh 臂 + #SKIP 0**——零回退。

## 五、P8/P10-③ + README 指针

每步 P8 段全部对得上实现；§7 前言 P10-③ 证据形态义务（截图/录屏/日志行——API 状态层不得替代 GUI 验收）在位。README +2 行零越界零删改零行号锚；SOP 全文零行号式宿主锚（唯一疑似 `:30` 为 cron 时间非锚）——无 ANCHOR_CASES 入册义务。

## 六、AI 专项五查

1 mock 残留无；2 硬编码 N/A；3 **幻觉 API/虚构入口 = 零**（24 类逐项实存）；4 未实现 TODO 无（ADR 如实标 proposed、DEC-33 实存引用成立；残余 = F-1/F-2 已列）；5 过度实现无（README 最小面）。

## 七、五维度 + 硬门槛

正确性（五步 × 十批对表吻合 + 2 处 P2）/安全性（零凭据；gate 沙箱；--expect-skip 红演示唯一仓库写且如实披露）/可维护性（单源纪律 marker 五面 + 行号锚外置）/性能 N/A/测试覆盖（验收复跑全吻合 + grep 23）。硬门槛：P0=0 ✓ / 5 维度 100% ✓ / 标级 100% ✓ / 设计一致性（F-6/F-7/F-8/N-1 全兑现）✓ / AI 五查 ✓。

**结论：R5 收官批可收口（F-1/F-2 随批吸收后）。**
