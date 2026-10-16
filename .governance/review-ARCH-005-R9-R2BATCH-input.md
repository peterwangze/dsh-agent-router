# ARCH-005 / R2 批 代码审查报告（Code Reviewer，round 9 / unit R2-batch）

> 持久化说明（Coordinator）：本文件为 Code Reviewer sub-agent 返回报告的逐字入库副本；机器登记 = review-record --task ARCH-005 --round 9 --unit R2 --result APPROVED_WITH_NOTES。审查时间 2026-10-17；对象 = staged R2 域 7 文件（scoped diff）；P2 F-1 已退回原 Developer 闭合。

**Round**: R0（R2 域首审）
**结论**：**APPROVED_WITH_NOTES**（unresolved_blockers=0；P0=0，P1=0，P2×1，P3×6）
**审查对象**：staged 7 文件（git diff --cached scoped，+431/−19 numstat 独立复算一致）；工作树对 staged 态零二次修改。

---

## 一、独立复跑结果（零采信自报）

| 项 | 结果 | 对照 |
|---|---|---|
| `node tests/host-abi-health.mjs` | **214 断言 ALL PASSED**，R2 节 21 条全 ok | 一致 |
| `node tests/run-all.mjs` | **21/22 PASS；smoke 恰 2 条 sh 臂；#SKIP 0**；host-contract 单跑 128/128 零 SKIP | 逐字吻合 |
| 沙箱 `$TEMP/arch005-gate-8532-mvbeohoc/` | boot-green-stderr 0B ✓；result.json green:true/stderrBytes:0；dump-config 含 `# == dsh-agent-router` 段（装载门放行实证） | boot ✓；**matched 态 RPC JSON 缺席（F-1）** |
| 镜像 | `git show :lib/client.js` vs `:tests/served-client.js` cmp 字节恒等 | ✓ |
| 宿主 token 锚 | `var(--dsw-alias-state-business-primary)` 引见于多个 ui bundle，定义在 dsh-client-ui-theme | 实读锚成立 |

**smoke 归属裁定**：smoke/安装脚本均不在 staged 面；失败臂在 standalone 复跑中漂移（2→2→6）系本会话重复运行自污染 + 沙箱环境约束——与 tracker FIX-048 既有裁定先例同构（CI 为权威通道）。首跑即预期基线态。**非 R2/R3 回退**。

## 二、逐项裁定

**1. 三态判定序 ✓**（version.js:76-101）：面先于版本在码；边界矩阵抽核（degraded×∈档案→incompatible 不误 matched；degraded×∉→incompatible 且不记 unknown；绿×∈→matched；单键漂移→unknown 三键全等门；版本读降级→诚实黄；空面快照×∈→matched 诚实空态注释成文）。unknown 去重 Set 进程作用域（F-4 注记）；插件服务端单进程单模块实例天然单源；matched 版本源 = hostVersionsOf 插件自持静态 require（§2-B 允许向）。

**2. P5 单源 ✓**：R2-a 解析锁定实读裁定——`HOST_BASELINE_REGISTRY =` 全文件恰一处（indexOf 锚唯一）；区间提取安全（纯单引号标量无嵌套括号）；两侧 canonical JSON 比对。import 不可行论证成立。「F-J 同构」核实；R3 已把 host-contract 侧退役为文本提取——现存双表 = snapshot 权威 + lib 投影，R2-a 值级锁定 **fail-visible**（解析失败/漂移均红非绿）。R2-g 真实锚独立跑绿。

**3. RPC 兼容 ✓**：A2 strictCodec 单点遵循；旧服务端容忍机制级核验——宿主网关 `descriptor.result.decode !== void 0 ? decode : 直通`，插件无 decode → 直通；渲染层 null-guard 回落两态（R2-h 锁定）。措辞问题见 F-3。

**4. 渲染面 ✓**：三态类名/文案/展开体在位；徽章「类名↔文案绑定收集」防同簇遮蔽；黄 token 锚定宿主实读 + 字面回落；零探针判别（计数断言）成立。

**5. service.js 越界裁定：恰为最小必要无夹带**（1 行 import + 方法体 2 行 + 注释；P3-5 先例成立；判定单点在 version.js 零第二实现）。

**6. 事故披露裁定（EV-178 同族）**：README:261-270 规矩逐字覆盖本次命令形态——属**已知教训复发**非规则缺口。修复完整性独立复验（本仓三包 0.2.0-rc.2；声明面未被 frozen 重建触碰；R2-g matched 绿）。修复完整；建议 wrap-up 记一行 EV 复发注记（F-7）。

## 三、Findings

| # | 级别 | 位置 | 问题 | 建议 |
|---|---|---|---|---|
| F-1 | **P2** | $TEMP/arch005-gate-8532-mvbeohoc/ | **验收工件缺口**：自报「matched 态 RPC JSON（真环境）」在该目录缺席；设计 §6 R2「面板三态显示证据·发布前」同未见工件。matched 主张已被 R2-g 真实锚独立佐证（非功能缺陷），但证据集不完整 | 合并前补产 RPC JSON 工件入沙箱证据目录（或修订自报口径为 R2-g 机器证据）；渲染截图/录屏按设计双层口径补或在 R5 真机复验节显式承载 |
| F-2 | P3 | 自报文本 | §11 断言数自报 24 实跑 21（行数 +223/总数 214 准确） | 自报口径勘正 |
| F-3 | P3 | schemas.js:468-476、client.js:380-383 注释 | 「可选字段」措辞不准——wire codec 中 capabilityProfile 为必填；容忍实由「无 decode 网关直通」+「渲染 null-guard」承载，与 mainModelImage codec 级可选机制不同 | 注释改如实描述机制 |
| F-4 | P3 | version.js:49-51 | notedUnknownVersions Set 进程作用域——重启后同组合再记一条（注释未限定进程域） | 注释补限定语（行为无害：环形 64） |
| F-5 | P3 | host-abi-health R2-a vs host-contract R3 提取器 | 同一注册表文本两个独立解析器（跨批）；漂移均红无静默缝，但解析逻辑重复 | 与 R3 审查协同评估抽共享 helper |
| F-6 | P3 | R2-g | serviceR2.attach 冗余调用（hostFaceDiagnostics 不消费 config） | 测试洁癖台账 |
| F-7 | P3 | 事故披露 | EV-178 已成文规矩下的复发 | R2 收口记一行 EV 复发注记 |

登记讨论项（不要求修改）：渲染层以 faces 为权威（state=incompatible 不直接消费）——真实服务端两信号恒同帧等价，取向可辩护。

## 四、五维度 + AI 专项 + 硬门槛

正确性✓（依赖边有五域先例零环）；安全性✓（零凭据/CSS var 防御回落/无注入面）；可维护性✓（单源锁定+双 regime 注释；F-3 措辞）；性能✓（O(faces) 纯读零 timer）；测试覆盖✓（21 条判别全矩阵；红演示按判别力独立推理核验）。AI 五查全零命中。硬门槛 P0=0/5 维度 100%/findings 100% 标级/设计一致性（DEC-6 保守档遵守）/AI 五查 100%。P-violation：无 P0/P1 级。
