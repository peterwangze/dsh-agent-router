# Code Review 报告 — FIX-022 R0

- **审查轮次**：R0（首轮）
- **审查对象**：Commit `740f95a`（FIX-022，+31/-7，两文件）——按 Coordinator 指令直接 Read 现盘文件对照审查
- **审查文件**：`lib/client.js`（L1757-1778 变更区 + 归一/渲染关联区）、`tests/client-render.mjs`（fixture L394-413 + 判别断言 L1581-1603 + EVO-013 场景组）
- **审查方式**：只读 Read/Grep/Glob（未运行命令、未修改代码、未创建子 agent）
- **结论**：**APPROVED_WITH_NOTES**
- **unresolved_blockers=0**
- **发现计数**：P0=0，P1=0，P2=2，P3=2（共 4 条，均非阻塞）

---

## 1. 变更内容确认（现盘对照）

### 1.1 lib/client.js L1757-1778（roster 调用域名修复）

```js
const presetApi = api.agentPresets ?? api.agentPreset
try {
  if (!presetApi || typeof presetApi.list !== 'function') {
    throw new Error('宿主连接未提供 agentPresets.list（复数/单数方法组均缺失——宿主版本过旧或连接面不完整）')
  }
  const presetResponse = await presetApi.list({})
  const presetValue = presetResponse && presetResponse.result && presetResponse.result.ok ? presetResponse.result.value : null
  if (presetValue !== null) {
    setPresetRoster({ status: 'ready', items: presetRosterItemsOf(presetValue), failure: '' })
  } else {
    setPresetRoster({ status: 'error', items: [], failure: presetResponse?.result?.error?.message ?? '' })
  }
} catch (error) {
  setPresetRoster({ status: 'error', items: [], failure: messageOf(error) })
}
```

与任务描述一致：`??` 回落 + 缺域 throw 中文诊断 + 走既有 catch 可观测降级。注释（L1757-1763）记录了根因（宿主命名不一致陷阱）、EV-123 真机形态与 P8/P9 原则映射——注释质量良好。

### 1.2 tests/client-render.mjs

- **fixture 复数方法组**（L400-413）：`apiMock.agentPresets = { list: ... }`，无单数域；响应值 `{ presets: [...4 条目], authorable: true, hasDocument: false }`；`'fail'` 模式返回 `result: { ok: false, error: { message } }`（网关失败形态）。
- **断言 1**（L1583，fixture 自证）：`typeof apiMock.agentPresets?.list === 'function' && !('agentPreset' in apiMock)` —— 静态锁定 fixture 形状，防止未来有人往 apiMock 补单数域导致判别断言永真（vacuous pass 防护）。设计优秀。
- **断言 2**（L1600-1603，判别）：仅复数域时 roster 正常加载、树文本不含 `zh.presetsRosterError`。
- 同 commit 附带 R0 F-1 相关内容（现盘已含）：`presetRosterItemsOf`（L1542-1556）broken 归一为字符串（string 直通 / boolean true → 'broken' / 其余 → ''）+ fixture 双形态 broken 条目 + 3 条 broken 判别断言（L1617/1618/1621）。一并纳入本次审查范围。

## 2. 宿主契约实证（独立 Read 宿主源码，非仅采信 RCA）

宿主文件：`C:\Users\peter\AppData\Local\npm-cache\_npx\1e7f6d9597241db0\node_modules\@deepseek-ai\dsh-client-connection\lib\client.js`

- **L6318-6325**：客户端 api 面方法组 = `agentPresets`（复数），内含 list/select/read/copy/openDocument/remove 六方法；wire 方法名单数（`"agentPreset.list"` 等）。RCA 事实 1 独立证实。
- **L5774-5778**：`agentPresetListValueSchema = { presets: array(entry), authorable: boolean(), hasDocument: boolean() }`。RCA 事实 2 证实。
- **L5764-5771**：`agentPresetEntrySchema = { id: string().min(1), trust: 'system'|'user', isDefault: boolean(), name?: string, description?: string, broken?: string().min(1) }`。RCA 事实 3 证实（broken 为非空字符串可选，非 boolean）。

Coordinator 提供的 RCA 基准与宿主源码独立复核**完全一致**，无出入。

## 3. 五维度审查结论

### 维度 1：正确性 ✅

| # | 检查项 | 结论 |
|---|--------|------|
| 1 | 逻辑正确 | `??` 回落方向正确：复数优先（宿主真实形态，实证 L6318），单数防御回落。域名修复直接消除 EV-123 根因。 |
| 2 | 边界条件 | **假值对象场景已覆盖**：宿主挂 `api.agentPresets = {}`（存在但无 list）时，`typeof presetApi.list !== 'function'` → throw 中文诊断 → catch 降级，**不会**裸 TypeError 击穿。`presetResponse` 空对象/`result` 缺失时 `presetValue=null` 分支安全（保持 idle，不崩溃）。RPC `ok:false` 走 L1774 错误消息提取（`?.` 链安全）。 |
| 3 | 并发安全 | 无共享状态新增；roster 失败独立面（catch 只 `setPresetRoster`，不动整页主 state）——罗盘不可达不阻塞整页，符合设计意图。 |
| 4 | 资源管理 | 单次 RPC，无资源泄漏面。 |

throw→catch→渲染链完整核验：`messageOf`（L987-989）对 Error 实例提取 `.message` → `presetRoster.failure` → L3189 渲染 `「预设列表获取失败：宿主连接未提供 agentPresets.list（…）」`——用户看到的是明确中文诊断而非裸 TypeError，P8 可观测承诺兑现。

### 维度 2：安全性 ✅

无新增输入校验面；roster 响应消费侧经 `presetRosterItemsOf` 归一容错（条目必须 object + 非空 string id 才入列）；DOM 构造走 `el()`（createElement 文本节点，无 HTML 注入面）；无敏感数据、无权限变化。OWASP 关键项无触雷。

### 维度 3：可维护性 ✅

命名（`presetApi`）清晰；注释记录根因/真机形态/原则映射，可维护性好；无重复代码；`load()` 增量极小（微修复尺度恰当）。

### 维度 4：性能 ✅

无新增循环；单次 RPC；无 N+1 / O(n²)。

### 维度 5：测试覆盖 ✅（有 2 条非阻塞建议，见发现）

- 核心路径：场景 1（roster ok → 下拉列宿主预设 → 添加流程 → payload 断言）✅
- 边界：broken 双形态（string 宿主真实形状 + boolean 历史形态）、已配置排除、残留条目（场景 2）✅
- 错误路径：场景 3（RPC `ok:false` → 错误提示 + 空下拉、不阻塞整页）✅；**缺域 throw 路径无直接场景**（见 F-2）
- RED 判别：断言 2 在旧实现（误调 `api.agentPreset.list`）下推演必败——TypeError → catch → `presetsRosterError` 文案渲染 → `!includes` 为 false（正是 EV-123 真机形态的复现路径）；修复后 GREEN。守卫链完整。Developer 留痕 RED 期 6 FAIL 集中于域名缺陷 + Coordinator 复跑 smoke EXIT=0 ALL PASSED（内嵌 client-render 33 条 EVO-013 断言 ok）——采信（Reviewer 受只读约束未复跑，见 §7 证据声明）。

## 4. 契约一致性（审查重点 2 专项）

fixture 顶层三字段 `{presets, authorable, hasDocument}` ↔ 宿主 L5774-5778 **逐字段一致** ✅。

fixture entry ↔ 宿主 L5764-5771 六字段逐项对照：

| 字段 | 宿主 schema | fixture | 判定 |
|------|-------------|---------|------|
| id | string().min(1) 必填 | 4 条目全有 ✅ | 一致 |
| trust | 'system'\|'user' 必填 | 两值均覆盖 ✅ | 一致 |
| isDefault | boolean() **必填** | **全缺** | ⚠️ 见 F-1 |
| name | string() 可选 | 提供 ✅ | 一致 |
| description | string() 可选 | 未提供 | 合法（可选缺省） |
| broken | string().min(1) 可选 | string 形态 ✅ + boolean true 历史形态（有意防御，注释论证） | 一致 + 有意扩展 |

`legacy-broken` 的 `broken: true` 不符宿主现行 zod——但为**有意设计**：验证客户端归一真值判定对历史形态的兼容（防御哲学与 P9 宿主演进防御一致），注释充分论证，不判违规。

## 5. AI 代码专项 5 项检查

| # | 检查项 | 结论 |
|---|--------|------|
| 1 | mock 残留 | 产品代码（lib/client.js）无 mock；apiMock 仅存于测试文件（合法用途）✅ |
| 2 | 硬编码返回值 | 无。throw 中文诊断是错误消息非业务返回值 ✅ |
| 3 | 幻觉 API | `api.agentPresets` 宿主实证存在（L6318-6325）；`api.agentPreset` 为防御回落右侧表达式，非幻觉调用 ✅ |
| 4 | 未实现 TODO | 无 ✅ |
| 5 | 过度实现 | `?? api.agentPreset` 单数回落保护的形态宿主从未存在（见 F-4，P3 接受）✅ |

## 6. Parity 抽验（审查重点 4——Developer 结论独立复核）

grep 插件 `lib/` 全部 api 域调用点（22 处 + sessions 接入点），对照宿主 L6281-6355：

| 插件调用 | 宿主方法组 | 判定 |
|----------|-----------|------|
| api.llm.providers / models / discoverModels | llm 组 L6346-6350（同名三方法） | ✅ 一致 |
| api.settings.describe / mutate | settings 组 L6334-6340 | ✅ 一致 |
| api.credentials.describe / set / unset | credentials 组 L6341-6345（恰同三方法） | ✅ 一致 |
| sessions.models / selectModel（L3816-3869，model-takeover 组件） | sessions 组 L6281-6294 | ✅ 一致 |
| api.agentPresets.list（本次修复点） | agentPresets 组 L6318-6319 | ✅ 一致 |

**结论：插件调用的全部域名/方法名与宿主 L6281-6355 无其它不一致——Developer 的 apiMock parity 核查结论经独立抽验成立。**

## 7. 发现列表（全级别标注）

| ID | 级别 | 位置 | 问题 | 建议 |
|----|------|------|------|------|
| F-1 | **P2 建议** | tests/client-render.mjs L407-412 | fixture entry 全缺宿主**必填**字段 `isDefault`（可选 `description` 亦未提供）——形状与宿主 schema 非完全同构；当前客户端归一不消费该字段故无功能影响，但注释声称"宿主真实形状"在 entry 层不完全成立，且未来消费 isDefault（如默认预设标记）时无契约守卫 | 建议某条目补 `isDefault: true/false`（+ 可选 description），使 fixture 与宿主 schema 完全同构；可遗留 |
| F-2 | **P2 建议** | lib/client.js L1766-1768 | 缺域中文诊断 throw 路径（两方法组均缺失/不可用 → '宿主连接未提供 agentPresets.list…'）无直接测试场景——场景 3 只覆盖 RPC `ok:false` 形态；该分支是 P8 可观测承诺的一部分，现仅由断言 2 的 RED 判别间接压住 TypeError 形态 | 建议补 `presetApiMissingMode`（apiMock 去掉 agentPresets）场景，断言渲染含 `presetsRosterError` 与中文诊断文案；可遗留 |
| F-3 | **P3 讨论** | lib/client.js L1767 | throw 文案"复数/单数方法组均缺失"在"方法组存在但 list 非函数"（假值对象）形态下措辞不精确（实为"存在但不可用"）——不误导用户行动（两种形态的指引相同：检查宿主版本），仅诊断分类微瑕 | 可改为"未提供可用的 agentPresets.list"；不要求修改 |
| F-4 | **P3 讨论** | lib/client.js L1764 | `?? api.agentPreset` 单数回落保护的形态在宿主从未存在（实证 L6281-6355 无 agentPreset 组）——推测性防御；但成本一行、无副作用、注释论证（P9），与 broken 双形态容忍同一防御哲学 | 接受现状；提请知悉此为有意识的宿主演进防御 |

**原则违反标注**：无。全量测试网（P4）——smoke ALL PASSED（Coordinator 复跑佐证）；降级可观测（P8）——catch + 中文诊断 + L3189 渲染面核验通过；宿主演进防御（P9）——typeof 能力自证 + fixture 判别双守卫。修改纯粹性（编程要求 10）——增量聚焦缺陷本身，无冗余修改。

## 8. 硬门槛裁决

| 门槛 | 阈值 | 实测 | 判定 |
|------|------|------|------|
| P0 阻塞数 | = 0 | 0 | ✅ |
| 5 维度全覆盖 | 100% | 5/5（§3 逐项有结论） | ✅ |
| 每条发现标注级别 | 100% | 4/4（P2×2 + P3×2） | ✅ |
| 设计一致性检查 | 已完成 | 宿主 wire 契约逐字段对照（§2/§4）+ P8/P9 原则比对 | ✅ |
| AI 专项 5 项 | 全部完成 | 5/5（§5） | ✅ |

## 9. 结论

**APPROVED_WITH_NOTES**（unresolved_blockers=0）

- P0=0、P1=0：硬门槛全部通过，可合并。
- 2 条 P2 为非阻塞遗留建议（fixture isDefault 同构、缺域 throw 路径直测），建议记入跟踪表按需处理；2 条 P3 仅为讨论记录。
- 域名缺陷修复正确且经宿主源码独立实证；判别断言具备真实 RED 守卫力；parity 抽验确认无其它域名不一致。

## 10. 证据与未验证声明（事实依据红线）

- 已验证（Reviewer 独立 Read）：插件两文件现盘、宿主 dsh-client-connection/lib/client.js L5750-5889 与 L6260-6379、插件全部 api.* 调用点 grep、`messageOf`/`presetRosterItemsOf`/L3189 渲染链。
- 采信未复跑（只读约束，来源可信）：Commit `740f95a` 的 diff 统计（+31/-7）与 RED 期 6 FAIL 留痕（Developer）；smoke EXIT=0 ALL PASSED（Coordinator 复跑）。RED 判别力经 Reviewer 静态推演独立确认成立（§3 维度 5）。
- 本报告未运行任何命令、未修改任何代码。
