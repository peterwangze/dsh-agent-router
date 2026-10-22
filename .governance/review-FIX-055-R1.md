# 审查报告 — FIX-055 R1（Code Reviewer · delta 复审）

> 机录副本：Reviewer 以消息体返回报告（按禁止事项不写文件），Coordinator 落盘后经 review-record CLI 写 canonical 记录。
> **结论：APPROVED_WITH_NOTES** ｜ `unresolved_blockers=0`（P0=0 / P1=0 / P2=0 / P3=4）
> 结构化事实：`{"task":"FIX-055","round":1,"verdict":"APPROVED_WITH_NOTES","unresolved_blockers":0,"p":{"P0":0,"P1":0,"P2":0,"P3":4},"commit":"3bebefca9d9966b6e1f262ae0039a86c5f51afe7","prev":"REVIEW-FIX-055-R0"}`
> 审查员工具边界：仅 Read/Grep/Glob；npm registry 缺版事实未一手核验（web_fetch 被拒）；动态门控/断言数/红演示标注未运行验证，静态一手核验宿主源码/origin 判据/解析器。

## R0 findings 逐条比对（摘要）

| R0 ID | R1 状态 | 一手核验 |
|---|---|---|
| P2-1 row→logical | ✅ 已修复 | S8b（:1270-1300）真实调用宿主导出 `assertReleasedV4Relationships`（定义 :1027-1042 / 导出 :1552）；经 `assertV4MessageSources`（:132-137）→ `source()`（:124-127）逐消息执行；正向 artifact 通过、负向 3 形态（source 缺失/kind 空串/`kind:'plugin'` 带旧 `{kind,plugin}`）全拒且错误名/串精确——「未来宿主收紧 source() 白名单」已被真实逻辑入口捕获 |
| P2-2 完整树缺包/CI | ✅ 已修复（回退方案） | `hostTreeIsComplete`（:736，origin `npm-global(` 前缀）——完整树缺 v4 = 红（:1231-1233/:1364-1367）；显式/部分树 = 可见 skip；基线 <0.2.1 先 skip；ci.yml 未改；头部 :67-73 登记 CI 覆盖缺口与扩展路径；完整树缺包=红分支静态成立 |
| P3-2 安装器第四源 | ✅ 已修复 | install.ps1 `$script:PluginName`（:1340/:1343）+ install.sh `PLUGIN`（:1341/:1344）实读断言，漂移必红 |
| P3-3 夹具/解析保真 | ✅ 已修复 | S8 正向补 `!Object.hasOwn`（:1261）；`stripYamlComments`/`yamlScalar`/`indexName` 单双引号；S8b 负向旧完整 `{kind,plugin}` 形状（:1291） |
| P3-1 锚单源/措辞 | ⚠️ 部分（按指令未重构） | header 措辞已如实（:64/:89/:94）；行号常量与 prestep 注释仍双源 |
| P3-4 范围/钩子 | ⚠️ 登记 | 2 文件子集非越界；reflog 两 amend 形态在；hook 执行不可复核 |

## 新引入问题核验（摘要）

- **S8b artifact 无幻觉**：`surfaceOp:'append'` 为宿主 `foldSurface`（:597-604）必需、`SURFACE_TYPES` 含 `user/message`（:8-13）；`knownEventTypes=Set(['user/message'])` 走 user/message 分支——P10-④ 达成。
- **0.2.0 分代 6 skip 语义完整**：`hostV4Contract`（:1219-1249）单点解析，skip note 三分支均点名「S8/S8b 两组」（:1223/:1227/:1235）+ S9b 五条 = 6；S9a 7 条恒跑。
- **S9a 放宽后无恒真**：所有比较仍绑定 import 实模块；解析失配 → 红（fail-closed，:1307-1310）。

## 新发现（P0=0 / P1=0 / P2=0 / P3=4）

| ID | 位置 | 事实依据 | 建议 |
|---|---|---|---|
| P3-1 | host-contract :1256-1264 / prestep :48-57 | S9b 行号常量仍是注释副本（双源）；窗口+模式 ≠ 语义等价 | 单源派生或共享常量；补符号/表锚；header 1b 写明刷新义务 |
| P3-2 | S8b :1273-1300；宿主 :1027-1042、worker :12417 | artifact header 仅 `{id}`，未走完整 restore；worker inline 拷贝仅静态锚 | 可选补 `restoreReleasedV4Artifact`/worker 单点集成；或注释明示目标边界 |
| P3-3 | S8b :1286-1291；S8 :1265 | 「kind 缺失」负向实为整个 source 缺失，非 `{source:{}}`；S8 row 负向仅简化形态 | 补 `{source:{}}` 用例或精确改标签 |
| P3-4 | host-contract :67-73；ci.yml :254-274；triage/reflog | registry 缺版未一手核验；CI 0.2.1 job 仍不执行 S8/S8b；triage expected-new 与实际不一致；hook 链不可复核 | 补 registry 查询证据；下批注册表驱动 CI pin 或接受口径；确认 expected-new 去留 |

**P4-violation**：无。**AI 专项**：无 mock/硬编码/幻觉/TODO/过度实现。

## 硬门槛

P0=0 ✅｜P1=0 ✅｜5 维度 ✅｜发现分级 ✅｜设计一致性 ✅｜AI 5 项 ✅。

**结论：APPROVED_WITH_NOTES——`unresolved_blockers=0`，无未解决 BLOCKING；无发布阻塞项。P3×4 建议随下批卫生/发布批承载（S9b 单源派生 / 可选完整 restore 与 worker 集成 / `{source:{}}` 夹具 / registry 证据与 CI pin 扩展路径 + expected-new 收口）。**
