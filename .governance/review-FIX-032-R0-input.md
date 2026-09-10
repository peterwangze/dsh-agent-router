# FIX-032 R0 独立代码审查报告（Code Reviewer → Coordinator）

- **审查轮次**: R0（首次审查，无前轮）
- **审查对象**: commit `640e2e4`（基线 969531b，未 push），3 files +134/−13
- **审查方式**: 只读取证——`git show` diff / 仓库文件 read / grep 消费点扫描 / 宿主源码实读。未执行任何写操作、未运行测试（Reviewer 只读约束；GREEN 侧采信 Coordinator 独立机验并明确标注，RED 侧以静态推演独立核验——旧实现代码行已原句取回，推演确定性成立）

## 审查结论：**APPROVED_WITH_NOTES**
## `unresolved_blockers`: **0**

（P0=0、P1=0、P2=0；3 条 P3 讨论级备注，不阻塞、不要求修改）

---

## 一、findings 列表

### F-1（P3，建议）subagent 留空零动作路径无诊断记录
- **位置**: `lib/preset-defaults.js:487-488`（`const target = … : null` → `if (!target) return`，早退先于任何 `diag(...)` 调用）
- **事实依据**: 主会话播种路径对未配置形态有 skip 诊断（L550-551 `skip: 'not-configured' / 'main-unset'`）；subagent 路径「未配置=零动作」在 presetDiagnostics 无痕。FIX-032 将静默集从「全未配置」扩大到「main-only」形态（旧实现该形态有 `applied:true` 诊断）。
- **定性**: 非违反 P8——「未配置→零动作」是正常行为而非失败/降级，P8 不强制；但本次报障恰属此类形态，若日后现场排查，`{applied:false, skip:'subagent-unset'}` 一行诊断可显著缩短定位链。
- **修复建议**: 后续迭代在 L488 早退前补一条 skip 诊断（本轮不必）。

### F-2（P3，记录性）宿主源码引用行号轻微不精确（**既有注释，非本 diff 引入**）
- **位置**: `lib/preset-defaults.js:491`（FIX-030-B 遗留注释，本 diff 未触碰该行）
- **事实依据**: 注释引 `"The latest request header owns provider, model…"` 标注 L603-612；实读宿主源码该引文位于 JSDoc L596-599，实现体位于 L603-613（`parentAgentOptionsForDelegation`）。本 diff 新增注释（L472、commit message）用 L603-613，准确。
- **修复建议**: 无需本轮处理；后续触碰该文件时可顺手校正。

### F-3（P3，信息通报）任务 prompt 所给宿主只读路径不存在，已定位实际权威副本
- **事实依据**: `C:\Users\peter\.dsh\profiles\web\node_modules\@deepseek-ai\dsh-subagent\lib\index.js` 不存在（profiles/web/node_modules 仅含插件包：@peterwangze/@zcode/dsh-agent-router 等 + .pnpm）。实际核验副本 = DSH harness 检出 `C:\Users\peter\AppData\Local\npm-cache\_npx\1e7f6d9597241db0\node_modules\@deepseek-ai\dsh-subagent\lib\index.js`，package.json 实读 = `@deepseek-ai/dsh-subagent@0.1.2-rc.1`（与代码注释「宿主 0.1.2-rc.1 起」一致）。
- **影响**: 无——锚点内容已在该副本实证；仅提请 Coordinator 机录时采用实际路径。

---

## 二、五维度结论（100% 覆盖）

| 维度 | 结论 | 事实锚 |
|---|---|---|
| ① 正确性 | **通过** | 功能改动唯一一行（preset-defaults.js L487）：`modelSet(cfg.subagent) ? cfg.subagent : null`。留空 → L488 早退零动作 → 宿主继承基线自然生效（dsh-subagent@0.1.2-rc.1 L604 `requestHeader()?.config` / L605 回落 `{...parent.options}`——实读核验）。显式覆盖保护（L498-507）与冻结防御（L511-518）路径不变、可达性由修订后 B5/B6 承载。旧 cfg.main 固化回落（969531b 原句 `: (modelSet(cfg.main) ? cfg.main : null)` 已取回比对）确已退役。 |
| ② 安全性 | **通过** | 无新输入面；写入 agent.options 的值仍仅来自插件自有配置存储（同信任域，与改前一致）；无注入/敏感数据/权限面变化（diff 全文核）。 |
| ③ 可维护性 | **通过** | 新增 doc 注释与宿主源码实读一致（L603-613 行号准确）；被退役的旧边缘理由已从注释中清除并留有历史锚（报障日期）；无死代码残留（grep 全仓 `.main` 15 处逐一分类：播种 L550/L554/L585 仅主会话——L534 `origin==='subagent'` 早退保证子代理不可达；余为注释/统计/UI）。 |
| ④ 性能 | **通过** | 分支减少（目标链一层判空替代两层）；纯同步 options 操作不进队列（L450 既有设计不变）；无循环/数据结构变化。 |
| ⑤ 测试覆盖 | **通过** | 新增 M1-M5 判别节 + B2/B5/B6 语义修订（tests/preset-defaults.mjs L416-466、L1047-1143）。四态各有 ≥1 断言且带交叉守卫（见下「设计一致性」表）。RED 判别力静态核验：旧实现下恰 M1+B2 两断言必败（逐条推演：M1 target=cfg.main 且 child=基线→fixup 改写为 MAIN≠SWITCHED 断言败；B2 target=MAIN 且 child=基线→改写败；M2/M3/M4/M5/B1/B3-B6/K* 旧实现同绿）。 |

## 三、AI 代码专项五查（逐项结论）

1. **mock 残留**: 无——夹具（makeCtx/makeApiProxy/makeDefaults/makeSessionController）为测试本地 stub 属设计内；产品代码 diff 无 mock/测试标记。✅
2. **硬编码返回值**: 无——功能改动无字面量返回；测试常量（NATIVE/MAIN_MODEL/SUB_MODEL/SWITCHED）为合法测试数据。✅
3. **幻觉 API 调用**: 无——全部宿主面引用实读核对：`parent.session.requestHeader()?.config`（宿主 L604 原句）、`{...parent.options}` 回落（L605）、函数名 `parentAgentOptionsForDelegation`（L603）、版本 0.1.2-rc.1（package.json 实读）。✅
4. **未实现 TODO**: 无——diff 新增行无 TODO/FIXME/占位。✅
5. **过度实现**: 无——最小变更（1 功能行 + 注释 + 测试 + README 4 行），无越界功能。✅（符合编程要求 4「修改纯粹性」）

## 四、设计一致性比对（三方）

| 契约 | 比对结论 | 证据 |
|---|---|---|
| EVO-014 三层选择权主权保护 | **一致（本修复正是恢复主权）** | picked/header 优先、默认层才换入：留空=不触碰宿主已交付的父当前路由（含用户手动切换），仅显式 cfg.subagent（默认层显式配置）换入。旧 cfg.main 回落 = 默认层静态值覆盖 header 层 = 主权击穿，已移除。 |
| FIX-030-B `inheritedRouteOf` 同构基线 | **一致（未动判定只收窄触发）** | `inheritedRouteOf`（L249-263）与显式覆盖判别（L498-507）零改动；K3/K4 复验绿（Coordinator 机跑含 K 节）。变化仅在「何时 fixup」，不在「如何判显式」。 |
| README 承诺（L16/L158/L165） | **一致、无 overclaim** | L16 现文「跟随主 Agent 当前模型（含会话内手动切换，不固化为预设配置值）」= M1+M2 断言面；L165「未设置时跟随…当前实际模型…显式指定不受影响」= M1/M2 + M5/K4 断言面，措辞未超出断言覆盖；L158 未改的「留空 = 继承主 Agent 模型」在新语义下由 L165 精确定义，不矛盾。UI 标签 `presetsInheritMain: '继承主 Agent 模型'`（client.js L633/L952）措辞仍准确（主 Agent ≠ 主预设值）。 |

## 五、Developer 声称 1-5 逐项核验

| # | 声称 | 结论 | 证据 |
|---|---|---|---|
| 1 | M1+B2 对 HEAD 必败、双实证恰 2 断言 FAIL | **属实（判别力经静态推演独立成立）**；「stash 突变复跑」细节 = Developer 声称未独立复跑（Reviewer 只读约束，如实标注） | 旧 target 链原句已从 969531b 取回；确定性推演恰 M1/B2 败（见维度⑤）。GREEN 侧 Coordinator 已机跑复核。 |
| 2 | 语义四态（留空跟随当前/显式优先/未配置零变化/显式指定子代理不受影响） | **属实** | ①M1(L1096-1103 区域)+M2 ②M3+B1(L405-415)+K3(L969-981) ③M4+B3(L428-434)+A4(L321-322) ④M5+K4(L985-998)；Coordinator 机跑全绿。 |
| 3 | 门控 21/21 exit 0 零回退 | **部分独立验证（可信）** | 21 个 *.mjs 文件已清点实证；preset-defaults.mjs 由 Coordinator 机跑 ok；其余 20 套 = Developer 声称 + 静态旁证：改动仅触 preset-defaults.js/测试/README，全 tests 目录仅 fix-031-attribution.mjs 另读该文件源码（其 D16b/G6/H7 三个 regex 所匹配文本均不在本 diff 触碰范围，逐一比对通过），其余套件不消费变更面。 |
| 4 | 「parent 未播种→fixup 到 P.main」边缘退役理由成立 | **属实（含一处精化）** | 宿主基线 L604-605 交付父实际当前路由（未播种父实际跑全局默认=其当前模型，子跟随=与主会话一致）；旧「fixup 到 P.main」反而使子偏离父实际，与承诺矛盾。**精化**：未播种形态的断言覆盖由 **B2**（parent options=NATIVE≠cfg.main → child 保持 NATIVE）承载，M2 覆盖的是已播种未切换形态——两者合计完整，M2 单独不覆盖未播种形态。 |
| 5 | cfg.subagent 运行时路由消费点全仓唯一 | **属实** | grep 全仓 lib：路由消费仅 preset-defaults.js L487；stats.js L578 为遥测折叠（按已发生请求的 origin 归类计数，非路由决策）；client.js L1374/1382/1860-1862/3121/3139 为 UI 文案与配置编辑器往返。P5 专项：cfg.main 回落仅此一处、已删净，无第二回落点/死代码（15 处 `.main` 逐一分类完毕）。 |

## 六、本变更专项必查结论

- **P5（单点路径/旧路径删除）**: 通过——见声称 5 与维度③；旧回落整行替换无残留。
- **正确性边缘（B5/B6 承载 + 未播种退役）**: 通过——B5（L446-452，subagent 显式配置 + 父不在注册表 → fixup 仍生效）与 B6（L456-466，冻结 options + subagent 显式配置 → warn 不炸）在新语义下保留等价看护；main-only 形态的降级/冻结场景按设计在 L488 判空早退（无可达写目标，无需看护）。未播种退役见声称 4。
- **README 忠实度**: 通过——见设计一致性表三；no-overclaim 成立。
- **宿主锚定**: 通过——独立实读 dsh-subagent@0.1.2-rc.1 L603-613（实际路径见 F-3），与 commit/注释/断言三方一致。
- **测试夹具宿主面锚定（P10-④）**: 通过——M 节 `makeParentM` 以 `session.requestHeader: () => ({ config: … })` 精确复刻宿主 L604 消费面，无 header 形态对应宿主 L605 回落（M2 注释明示）；未按心智模型伪造（K 节同形先例延续）。

## 七、结论重申

- **APPROVED_WITH_NOTES**，`unresolved_blockers=0`
- P0=0 / P1=0 / P2=0 / P3=3（F-1 诊断可观测性建议、F-2 既有注释行号微偏、F-3 宿主路径通报——均不要求本轮修改）
- 关闭条件对照：P0=0 且 P1=0 → 可合并
