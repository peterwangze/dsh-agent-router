# 审查报告 — FIX-055 R0（Code Reviewer）

> 机录副本：Reviewer 以消息体返回报告（按禁止事项不写文件），Coordinator 落盘后经 review-record CLI 写 canonical 记录。
> **结论：APPROVED_WITH_NOTES** ｜ `unresolved_blockers=0`（P0=0 / P1=0 / P2=2 / P3=4）
> 结构化事实：`{"task":"FIX-055","round":0,"verdict":"APPROVED_WITH_NOTES","unresolved_blockers":0,"p":{"P0":0,"P1":0,"P2":2,"P3":4},"commit":"ec45a15ed00500feb5ecbd36921d695b0a2adafa"}`
> 审查员工具边界：仅 Read/Grep/Glob；动态门控/断言数/红演示标注「未运行验证」，静态一手核验宿主源码/锚/单源/CI 配置。

## 摘要（完整报告见本文件全文，以下为 Coordinator 机录要点备份）

- **任务**：FIX-055——收口 REVIEW-FIX-054-R0 的 P2-1（宿主真实 v4 admission 合约）/ P3-2（插件名单源）/ P3-1（宿主锚守卫）。
- **被审对象**：HEAD `ec45a15`（`952b3cf` 的 amend；未 push）。变更 = `lib/prestep.js` 单行 export（行为零变化）+ `tests/host-contract.mjs` S8（:1185-1228 row admission 正/负）/S9a（:1233-1254 五面名单源）/S9b（:1256-1293 五锚行号窗口+内容模式）。
- **核验结论**：5/5 宿主锚实读命中；`assertV4RowAdmission` 为宿主真实导出（定义 :1107-1119 / 导出 :1552 / persistence worker 同构 :12464/:12487 调用）；负向错误串锚定宿主真实 throw（`SessionFormatError`）；单源五断言 import 实模块、无恒真；5 个 FIX-054 镜像套件未动；范围 = triage 子集非越界；reflog 证实 amend 形态；P10-④ 无幻觉 API。

## 发现列表（P0=0 / P1=0 / P2=2 / P3=4）

| ID | 级别 | 位置 | 事实依据 | 影响 | 建议修法 |
|---|---|---|---|---|---|
| P2-1 | P2 | `tests/host-contract.mjs:1209-1224`；宿主 `index.js:142-152/132-137/1027-1042/1552` | S8 调 `assertV4RowAdmission`；row admission 仅在 `kind==='plugin'` 时调 `source()`；正向 `plugin:dsh-agent-router` 不触发 `source()`，缺失/空/任意非 plugin 也能过；逻辑 `assertV4MessageSources`（经已导出的 `assertReleasedV4Relationships`）未调用 | FIX-054 R0 P2-1「未来宿主收紧白名单仍绿」风险未完全闭合；正向不证明宿主 `source()` 接受新 kind | 用 `assertReleasedV4Relationships` 构造最小 v4 artifact 执行逻辑 admission；加 `kind:''`/缺失负向控制；S8 保留 row admission 并改名/注释区分「row vs logical admission」 |
| P2-2 | P2 | `tests/host-contract.mjs:1194-1199/1267-1275`；`ci.yml:254-274`；`hostTarget` :634-687 | CI pinned 树 8 包无 v4/persistence → S8 与 4/5 S9b skip（仅 message-source 锚仍跑）；`existsSync` 缺失一律 skip，未区分 `hostTarget.origin`（pinned vs 本机完整树） | 真实 admission 守卫未进 CI 回归网；完整基线树包被删/改名只 skip 不红 | CI 矩阵补 pin v4/persistence 包；或按 origin 区分 skip/红；或显式记录「本机实跑、CI 仅静态锚」口径 |
| P3-1 | P3 | `tests/host-contract.mjs:1256-1264` 与 `lib/prestep.js:48-57`；header :68-75 | S9b 行号常量是注释副本未单源派生；窗口+模式只判「串在窗口」不判语义等价；header 仍写「FIX-043 批 A 已去行号」与本批矛盾 | 双源漂移/窗口内旧串掩盖语义变化 | 从注释解析行号或共享常量；补符号/表锚；修正 header 表述 |
| P3-2 | P3 | S9a :1250-1254；`install.ps1:14`；`install.sh:13` | 安装器 `$PluginName`/`PLUGIN` 也是插件名载体，S9a 未覆盖 | 安装器名漂移时 profile 行名与 `PLUGIN_NAME` 不一致且守卫绿 | 增两条静态读断言与 `PLUGIN_NAME` 相等 |
| P3-3 | P3 | S8 :1218/1222；S9a :1236-1248 | 负向只造 `{kind:'plugin'}` 未带原始 `plugin` 字段；正向标签「无 plugin 字段」但条件只判 accepted；`indexName` 只认单引号单行、`patchPluginNames` 只认 id-then-name 非引号布局 | 夹具保真度不足；格式化变更可致红/漏判 | 负向用旧完整形状 `{kind:'plugin',plugin:'dsh-agent-router'}`；正向补 `!Object.hasOwn`；解析器 stripComments + 单双引号 + 登记支持的 YAML 形态 |
| P3-4 | P3 | FIX-055 triage；reflog :568-569；EVD-12 | triage 曾列 host-abi-health + expected-new fix-055-guards.mjs，实际合并进 host-contract.mjs（子集非越界）；初提交 `--no-verify`、amend 后 hook 链不可复核 | 锁/triage 与最终文件集不一致需收口 | Coordinator 确认锁释放与 triage/交付记录；EVD-12 保留 amend 与 --no-verify 事实 |

**P4-violation 核查**：未发现违反 project-principles 1~10。

## 硬门槛

P0=0 ✅｜P1=0 ✅｜5 维度全覆盖 ✅｜每条发现含位置/证据/修法 ✅｜设计一致性 ✅（P10-④ 真实宿主面、P5 单源守卫）｜AI 专项 5 项 ✅（无 mock 残留/硬编码绕过/幻觉 API/TODO/过度实现）。

**结论：APPROVED_WITH_NOTES——`unresolved_blockers=0`，无未解决 BLOCKING。** 建议：机录本报告；决策 P2-1/P2-2 完整闭合或台账明示；核对锁/triage 记录；P3 并入下批卫生。

## 审查员建议的 Coordinator 后续

1. `review-record` 机录（本文件）。
2. 决策 P2-1/P2-2：完整闭合（`assertReleasedV4Relationships` 逻辑 admission 用例 + CI v4/persistence pin）或台账明示「row admission 覆盖写入面、逻辑面待补」。
3. 核对 triage/expected-new 与实际 2 文件范围、EVD-12 amend/hook 记录。
4. P3 项并入下批卫生。
