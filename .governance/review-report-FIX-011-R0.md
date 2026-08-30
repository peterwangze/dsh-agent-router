# Review — FIX-011 R0（统计读侧 RPC 断裂修复：stats 描述符显式指向 statsSnapshot）

- **Round**: R0
- **Task**: FIX-011 — RouterService 实例字段 `this.stats`（StatsStore）遮蔽原型 RPC 方法 `stats()` → 设置页统计面板恒 0
- **Commit**: `52331a8`（lib/rpc.js + tests/rpc-shadow-guard.mjs）
- **审查者**: Code Reviewer（R0）
- **日期**: 2026-08-30
- **范围说明**: 审查者无命令面（Bash ❌），diff 以任务书指定变更点 + 当前文件状态重建；宿主侧事实全部直接读取源码核验。

## 审查证据链（全部可复查）

| 证据 | 路径 | 结论 |
|---|---|---|
| 网关解析契约 | `@deepseek-ai/dsh-api-gateway/lib/index.js:101-103`（npx 缓存 node_modules，直接读取） | `implementation = descriptor.implementation ?? descriptor.method`；`Reflect.get(receiver, implementation)`；`typeof !== "function"` → `method-unavailable` —— 与 RCA 逐行一致 ✓ |
| 遮蔽源 | `lib/service.js:673`（构造器 `this.stats = new StatsStore(...)`）+ `lib/service.js:3172-3175`（原型 `stats()` 委托 `statsSnapshot()`） | 字段与同名方法共存事实成立 ✓ |
| 修复点 | `lib/rpc.js:47-60`（stats 描述符 + `implementation: 'statsSnapshot'` + 注释） | 显式绕行锚点，method/namespace/id 未变（浏览器 stub 名 `stats` 不变）✓ |
| 内部字段使用不受影响 | `lib/service.js:2990/3000/3009/3017`（record/snapshot/reset/export）、`lib/index.js:181`（`service.stats.close()`） | 字段原样保留，零改动 ✓ |
| 消费面 | `lib/client.js:1476/1489`（`routerRemote.stats({})` 2s 轮询） | 经网关解析 → 修复后可达 ✓ |
| 直调面 | grep `lib/` `tests/`：`.stats()` 直接方法调用零命中 | 无第二消费路径遗漏 ✓ |

## 维度 1：正确性

- 修复方向正确：`Reflect.get(service, 'statsSnapshot')` 命中原型可调用方法（service.js:2999-3001 返回 `{ ok, enabled, ...snapshot }`），与 RPC result codec（`wireCodecs.statsResult`）消费形状一致（stats 面板消费 totals/recent/series/accountTotals/accountSeries，snapshot 提供面不变）。
- 描述符其余字段（id/service/namespace/method/invocation/parameters/result）未动——浏览器侧 `ROUTER_REMOTE` 以 `method: 'stats'` 生成 stub，`implementation` 为宿主侧概念，双侧共用描述符无副作用 ✓。
- 无并发/资源新增面（纯元数据变更）✓。

## 维度 2：安全性

- 无输入校验面变化（参数 codec 未动）；无注入/敏感数据/权限变化 ✓。

## 维度 3：可维护性

- 注释（rpc.js:52-55）完整记录 RCA（遮蔽机制 → 网关解析 → 面板恒 0 表现 → 绕行理由），与实测宿主代码逐字吻合 ✓；最小修改（单描述符 + 注释）✓。

## 维度 4：性能

- 零热路径影响（RPC 元数据，调用时解析）✓。

## 维度 5：测试覆盖

- `tests/rpc-shadow-guard.mjs` 21 断言 = 17 描述符全遍历（:43-47，用与网关完全相同的 `implementation ?? method` + `Reflect.get` 语义断言 callable）+ stats 描述符显式锚点（:51-52）+ statsSnapshot 形状（:56-59）✓。
- **泛化性（关注点）**：遍历全部描述符 → 未来任何新增 RPC 方法若被构造期实例字段遮蔽（或 implementation 拼写错误）必败——守卫随描述符列表自动扩展 ✓。
- **判别性**：旧代码（stats 描述符无 implementation）下 `Reflect.get(service, 'stats')` 命中 StatsStore 对象 → `typeof !== 'function'` → 该断言必败 ✓。
- 构造走生产路径（new RouterService + attach），persist=false 纯内存，不触碰用户环境 ✓。
- 全量门控采信 Coordinator 证据（15/15 套件 exit 0，含 stats 110 断言）。

## AI 代码专项 5 项

| 项 | 结论 |
|---|---|
| mock 残留 | 无（产品代码零 mock；测试构造为显式最小 service）✓ |
| 硬编码返回值 | 无（statsSnapshot 返回真实快照聚合）✓ |
| 幻觉 API | 无——`implementation ?? method` + `Reflect.get` 契约已在宿主源码 dsh-api-gateway lib/index.js:101-103 逐行核验 ✓ |
| 未实现 TODO | 无（lib 全树 grep TODO/FIXME/XXX/HACK 零命中）✓ |
| 过度实现 | 无（单描述符 + 注释，service.js 零改动）✓ |

## 发现清单

| 级别 | 位置 | 发现 | 影响 | 建议 |
|---|---|---|---|---|
| P3-1 | tests/rpc-shadow-guard.mjs:37-47 | 守卫只覆盖构造器时点字段遮蔽（`this.stats` 在构造器赋值）；若未来某字段在 attach/apply 等后置路径赋值并遮蔽方法，本守卫不捕获 | 当前全部 17 描述符已绿，无现役风险 | 可后续在守卫中增加"attach 后二次遍历"（P3 讨论，不要求） |
| P3-2 | tests/rpc-shadow-guard.mjs（整体） | 未端到端跑真实网关（网关在宿主侧，测试复制解析语义而非执行网关） | 契约语义已逐行比对一致，风险低 | 可选：宿主侧集成验证留待用户 GUI 验收（任务验收 = 面板恢复） |

## 结论

**APPROVED_WITH_NOTES**

unresolved_blockers=0

- P0=0 / P1=0 / P2=0 / P3=2（讨论级）
- 5 维度全覆盖；AI 专项 5 项逐项有结论；无 P4-violation（最小修改、无架构影响）。
- 遗留台账：P3-1/P3-2 均为讨论项，无关闭截止要求。
