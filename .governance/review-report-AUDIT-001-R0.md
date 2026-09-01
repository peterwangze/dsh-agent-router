# Review — AUDIT-001 R0（并发审计 + P0×2 修复）

- **Round**: R0
- **Task**: AUDIT-001 — 用户指令「先排查并发问题」→ 全库审计。P0-A：宿主真 React 18.3.1 createElement 剥离 ref 保留 prop → RouteImage props.ref 恒 undefined → 直达路径从未生效（EVO-012/FIX-021 三连败真根因，必现非竞态——历史测试全绿因 mini shim 透传 props 的 parity 缺口）；P0-B：登出/登录绕过凭据文件锁与 ensureFresh 交错（登出复活/新登录被顶）
- **Commit**: `b0683a2`，base 5b24ca3
- **审查者**: Code Reviewer（R0）
- **日期**: 2026-08-31
- **范围说明**: 无命令面（41 条分级清单位于 commit message——不可读，抽样核代码注释事实性并如实标注）；门控采信 Coordinator（17/17 含新套件 audit-001-concurrency；bundle 已推 imageRef）。

## 快审要点核验

### ① imageRef 更名完备性（P0-A）
- RouteImage 解构 `{ t, router, imageRef, onOpen }`（lib/client.js:3776）+ 两调用点均传 imageRef（:4085-4087 折叠缩略图 / :4092-4094 展开 gallery）✓；内部消费（directAssetUrlOf :3778 / RPC payload :3786 / name :3803）一致；镜像 served-client.js 同号行同步（:3767-3778/:4082-4094）✓。
- **同类地雷检查**：全库 `ref` prop 传参盘点——`el('input', { ref: inputRef })`（:3720——**DOM 元素 ref 为 React 合法用法**，非自定义数据 prop）；wire codec 字段（:143/:228——RPC/对象字段非 React prop）；credentials RPC payload（:2090-2212/:4136——请求对象字段）——**无其它以 ref 为 prop 名传自定义数据的组件** ✓ 完备。
- 注释（:3767-3775）P0-A 实证链完整（真 React 18.3.1 + RESERVED_PROPS 剥离 + `site=collapsed ref=undefined` 直接印证 + 历史测试 parity 缺口说明）✓。

### ② CAS 守卫正确性（P0-B）
- **串行化收敛**：登录落盘（service.js:3987-3988 `store.withLock(REFRESH_TIMEOUT_MS+10_000, () => store.write(...))`）+ 登出删除（:4090-4091 `withLock(..., () => store.delete())`）——锁预算 = 刷新最坏时长 25s + 余量（等锁对象为有界刷新）✓。
- **ensureFresh 锁内 CAS 双保险**（oauth-credentials.js:611-629）：锁内重读盘上（:621）→ **deleted → 不写回**（:622，在途值用完即弃——文件不复活）→ **refresh 漂移 → 采盘上 latest**（:623——新登录文档不被旧链产物覆盖）→ 一致 → 原子写回（:625）✓。
- **竞态窗口分析**：
  - 登出 vs 在途刷新：登出等锁 → 刷新写回 → 登出删除 → 终态删除（用户意图胜出）；反转序 → 刷新锁内 CAS 读盘 undefined → 不写回（复活被挡）✓；
  - 新登录 vs 在途刷新：先登录 → 刷新锁内 base=disk 新文档（:602）→ 新鲜则零刷新（:603）/ 临期则按新链刷新（:607）→ CAS 一致写回 ✓；先刷新 → 写回 → 登录等锁覆盖 → 终态新登录 ✓；
  - **「:621 读 → :625 写」窗口**：delete 已收敛进同一把锁（:4091）——串行化关闭窗口（跨进程语义尽力而为——文件锁 wx，单机单插件足够，注释 :642 披露）✓。
- T1/T2 判别（tests/audit-001-concurrency.mjs:306-342：删除不复活 / 新登录文档存活）锁定 ✓。

### ③ 判别 harness 宿主语义保真度
- RESERVED_PROPS = { key, ref, __self, __source }（tests/audit-001-concurrency.mjs:43）+ createElement 复刻（:51 `hasOwnProperty(config, name) && !hasOwnProperty(RESERVED_PROPS, name)` 才进 props）——**与 React 18.3.1 源码（ReactElement.js 剥离 key/ref/__self/__source）逐字段一致** ✓ 复刻忠实。
- S1 判别含 harness 自证（:217-218 probe：props.ref undefined + imageRef 保留）+ 组件行为断言（:239 折叠直达 / :249 展开直达 / :251 零抛错）✓；14/14 采信。

### ④ 41 条清单抽样复核（受限，如实标注）
- 清单全文位于 commit message（无命令面不可读）——**抽样核 3 处 AUDIT-001 代码注释事实性**：P0-A（client.js:3767-3775 实证链——与 harness 复刻一致）/ P0-B（oauth-credentials.js:611-620 守卫语义——与实现 :621-629 逐字一致）/ 串行化（service.js:3981-3986/:4085-4089——与 :3988/:4091 实现一致）——**3/3 事实与行号对应**。P1/P2 全量分级不可核（清单不可读）——P3-1 如实标注。

### ⑤ P1/P2 分级合理性（抽样）
- P0 定级合理：P0-A（直达路径从未生效——功能完全失效，用户三连败根因）/ P0-B（合规删除 W-5 被击穿——原则 7 违反 + 凭据被旧链覆盖）——均 P0 ✓。P1/P2 全量分级不可核（清单不可读）——P3-1 同标注。

### 临时诊断全清
- lib 全树 grep `debugger|TEMP-DIAG|临时诊断|console.log` **零命中** ✓（插件日志统一走 ctx.logger——诊断残留已清，注释留现象引用）。

## AI 代码专项 5 项（变更面）

| 项 | 结论 |
|---|---|
| mock 残留 | 无（harness 复刻 createElement 为判别必需，非产品 mock）✓ |
| 硬编码 | 无（RESERVED_PROPS 复刻为契约常量）✓ |
| 幻觉 API | 无——RESERVED_PROPS 与 React 18.3.1 源码逐字段一致；withLock/CAS 为既有 seam 复用 ✓ |
| TODO | 无 ✓ |
| 过度实现 | 无（P0 修复最小化：prop 更名 + 锁收敛 + CAS 双保险注释）✓ |

## 发现清单

| 级别 | 位置 | 发现 | 影响 | 建议 |
|---|---|---|---|---|
| P3-1 | commit message（41 条清单） | 41 条分级清单全文位于 commit message，审查无命令面不可读——仅抽样核 3 处代码注释事实性（3/3 一致）与 P0 定级合理性 | 清单中 P1/P2 条目未被独立复核（其代码注释引用已抽样核验） | 讨论项：清单可另存 .governance/audit-001-findings.md 供后续跟踪 |

## 结论

**APPROVED_WITH_NOTES**

unresolved_blockers=0

- P0=0 / P1=0 / P2=0 / P3=1（清单抽样限制标注）
- P0-A 更名完备（全库无同类地雷）；P0-B 串行化 + CAS 双保险闭合竞态窗口（含「读→写」窗口经同锁关闭）；判别 harness 与 React 18.3.1 源码逐字段一致（parity 缺口被 S1 复刻闭合）；清单抽样 3/3 事实一致；P0 定级合理；临时诊断零残留；AI 专项 5 项逐项有结论；无 P4-violation。
- 遗留台账：P3-1（清单落盘建议）为讨论项，无关闭截止要求。
