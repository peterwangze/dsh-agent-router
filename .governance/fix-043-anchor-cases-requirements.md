# FIX-043 `ANCHOR_CASES` 接线需求清单（批 F 输入载体）

> **载体来源**：R3 审查（批 C）**P2-1** 判定——`ANCHOR_CASES` 需求清单原仅存于会话消息（commit message 指向的「交付报告」不在仓库内任何载体，`evidence-log.md` EV-197/EV-198 仅登记「清单存在」）⇒ 审查员**无法逐条核验**，且批 F 唯一输入将只存在于会话消息。本文件即 Coordinator 按该 finding 固化的**仓库侧载体**。
>
> **凭据**：批 C 交付（commit `2ea0bc9`，Developer 结构化返回）与批 D 交付（commit `ce8d908`，Developer 结构化返回）。
> **取数时点**：批 C 清单绑 `2ea0bc9` / 2026-09-13 11:08–11:16 +08:00；批 D 清单绑 `ce8d908` / 2026-09-13T11:07:55 +08:00。
> **状态**：条目值**尚未经独立审查核验**（R3 标「未验证」；R4 以自推导 16 对样本独立复核「stale 缺席 + fresh 在位」16/16 通过，但清单本体未逐对复核）。**批 F MUST 按其自身引用时点重跑数字并以本文件交叉核对。**
> **结构约定**：与既有 `ANCHOR_CASES` 同构 = `{ file, stale, fresh, notes }`；`stale` = 须零残留的旧锚串；`fresh` = 须在位的对象符号/代码串。

---

## 一、批 C（lib 面）A~J 条目

| # | 源文件 | 处置 | stale（须零残留；归属） | fresh（须在位） |
|---|---|---|---|---|
| A | `lib/client.js` | **扩充**既有条目（20/17 → 25/25） | `（同表 ` + `:21，凭据引用变化转发事件）`（宿主 dsh-api-remotes）· `ui-conversation ` + `:16041-16056`（宿主 dsh-client-ui-conversation）· `声明门控，` + `:313-314/:342`（宿主 dsh-cordis-client-runner）· `（generation 守卫，宿主 ` + `:47/:53）`、`订阅该 store（宿主 ` + `:292）`（宿主 dsh-client-ui-model-selection） | `同表 API_REMOTE_FORWARDED_EVENTS 条目内` · `ctx.uiSession.provide({ hooks: ['conversation','input'], props:` · `readService(prop, true) 面` · `generation === this.generation 守卫` · `宿主 directory.store.subscribe + ModelSelect 的 uSES 订阅`；**P2-2 追加**：`其对**同批三命名` · `createModelsOperations(ctx) 绑定的` · `（FIX-043 批 C 按 R1 P2-2 裁定取` |
| B | `lib/oauth-llm.js` | **扩充**既有条目 | `dsh-system-prompt lib/index.js:254-258` · `dsh-llm-pi-ai lib/index.js:1123-1128` · `lib/index.js:1645` · `lib/index.js:1996-1998` · `:1639 "must answer synchronously` · `（:1645 空体` · `Pricing schema :171-178`（宿主 dsh-system-prompt / dsh-llm-pi-ai / dsh-llm） | `result.schemas.map(({ name, description` · `toolsOf(options)` · `` `imageRequestPricing(_provider, _model)` 空体默认 `` · `LlmRuntime.imageRequestPricing 经` |
| C | `lib/index.js` | **新建条目** | `lib/index.js:128-135` · `lib/index.js:269-279`（宿主 dsh-host-webserver）· `lib/attachments.js:38`（**在仓**） | `route.kind === 'exact' ? this.exact : this.prefixes` · `` `match(pathname)` 对 exact 未命中作最长前缀优先 `` · `lib/attachments.js 的 ATTACHMENT_ID_RE` |
| D | `lib/prestep.js` | **新建条目** | `vision-router index.js:4803-4806` · `index.js:4832-4835`（本地参考实现 `.tmp-research/dsh-vision-router`） | `activateDeepTools()` · `adapterHandlesImages` |
| E | `lib/oauth-credentials.js` | **新建条目** | `openai-codex.js:30` · `openai-codex.js:31`（宿主 `@earendil-works/pi-ai`） | `` `openai-codex.js` 中 `DEVICE_REDIRECT_URI` `` · `` `openai-codex.js` 中 `DEVICE_CODE_TIMEOUT_SECONDS` `` |
| F | `lib/host-abi/client-remotes.js` | **新建条目** | `PROVIDER lib/client.js:36 镜像先例`（**在仓** `lib/client.js`）· `settings-models lib/client.js:889-911`（宿主） | `` `OAUTH_ROUTE_PROVIDER` 镜像先例 `` · `` `joinProviderDirectory(registered, directory)` 同构镜像 `` |
| G | `lib/host-route.js` | **扩充**既有条目 | `dsh-settings lib/index.js:430-436` · `write()（:439-470）`（宿主 dsh-settings） | `` `mutate(ns, ops, expectedRevision)` 契约 `` · `` `write(ns, input, mode, `` |
| H | `lib/host-abi/events.js` | **扩充**既有条目 | `remote-events.js:12-32` · `在表（:21）`（宿主 dsh-api-remotes） | `` `API_REMOTE_FORWARDED_EVENTS` 实读 19 项 `` · `在该表条目内` |
| I | `lib/wrapper.js` | **扩充**既有条目 | `lib/index.js:1645` · `:1639 "must answer synchronously without` · `（:1996-1998）` · `默认语义 :1645`（宿主 dsh-llm） | `` `imageRequestPricing(_provider, _model)` 空体默认 `` |
| J | `lib/service.js` | **扩充**既有条目；**无 stale 新增** | ——（两处刻意保留，见 §四） | `对象已消失、无实读对象`（登记句） |

**批 C notes（交批 F）**
1. **⑥ 段落数字刷新（与 R2 P2-2 同批）**：`lib/client.js` ③ = **7 → 0**；② = 17 匹配 / 9 行（不变，行 `4979-4981` / `5011-5016`）；① = 0；①②③ 总行数 14 → **9**。原「③ 余 7 处…**宿主靶子不可稳定符号化**⇒ 无实证不引入新符号」的总括断言**必须删除**（R2 P2-2 / P3-2：与 `:5561`/`:5562` 实况相反，且与「登记为后续批逐处判定」自相矛盾），改逐处标注式。
2. **D 条目 notes**：`lib/prestep.js` 的 `types/agent.js:297-318` **本批刻意保留**（判据承载，见 §四）⇒ 收敛 MUST 三处同步且**先改判据**。
3. **J 条目 notes**：`dsh-host-apiproxy` 区间锚 + 裸 `:2582-2594` **保留**（对象已消失）；宿主升级后按 `tests/host-contract.mjs` 头部刷新程序重核。
4. **镜像侧不重复登记**（`tests/served-client.js` ↔ `lib/client.js` 字节恒等为更强保证）。
5. 数字 MUST 由批 F 按其**引用时点**重跑并标注修订。

---

## 二、批 D（tests 面）9 文件条目

格式：源文件 → (stale needle ⇒ fresh 须在位) ｜归属

- **`tests/client-render.mjs`**（扩既有条目 `health:738`）：`service.js:193` ⇒ `dsh-client-ui-model-selection 的`｜`dsh-client-ui-model-selection lib/client.js:170` ⇒ `super(ctx, "modelDirectories")`｜`directoryFor :187` ⇒ `directoryFor(sessionId)`｜`宿主 lib/client.js:193` ⇒ `directoryFor「resolved no scope」`｜`首项，lib/index.js:19` ⇒ `首项 agent-preset/selected`｜`remote-events.js:21` ⇒ `白名单锚 API_REMOTE_FORWARDED_EVENTS`｜`directory.d.ts:52` ⇒ `ModelDirectory.load`｜`157-161 static inject` ⇒ `static inject / 模块级 inject + exports.inject`｜`按 fiber.inject 声明门控 L342` ⇒ `dynamicCordisContext`｜`waitingFor` 在位｜**宿主**
- **`tests/fix-029-host-contract.mjs`**（新建）：`index.js:605,2502` ⇒ `selectModel(request) 面 + Remote("selectModel") 注册`｜`dsh-llm lib/index.js:1698/1780/2177/2018` ⇒ `registerAdapter/registration/listModels 三方法齐备实证`｜**notes**：保留 `types/agent.js:297-318`（跨文件 extra 逐字断言，三处同步才可动）｜**宿主**
- **`tests/oauth-main-model.mjs`**（新建）：`dsh-system-prompt lib/index.js:254-258` ⇒ `assemble() 工具 schema 消费面`｜`dsh-llm-pi-ai lib/index.js:1123-1128` ⇒ `toolsOf(options) 映射面`｜**宿主**
- **`tests/fix-012-image-takeover.mjs`**（扩 `:924`）：`dsh-host-apiproxy lib/index.js:2749-2760` ⇒ `dsh-api-session-controller 的 prompt 侧准入`（归属勘正）｜`（:2596-2630）` ⇒ `selectModel(request) 面`｜`（:2749-2760）` ⇒ `MODEL_DOES_NOT_SUPPORT_IMAGES`｜`dsh-llm-pi-ai lib/index.js:1721` ⇒ `UNSUPPORTED_CONTENT 判定`｜**宿主**
- **`tests/adapter-parity.mjs`**（新建）：`lib/index.js:1681-1686` ⇒ `LlmAdapter 的 prepareCall`｜`adapterStream :2232` ⇒ `adapterStream 的 prepared 缺省分支`｜`（新增，:1645）` ⇒ `LlmAdapter 默认「declares none」`｜`（回归原型，:1681）` ⇒ `prepareCall（回归原型）`｜`lib/index.js:1996-1998` ⇒ `LlmRuntime.imageRequestPricing 消费点`｜`宿主 :1645`（3 处）⇒ `LlmAdapter.imageRequestPricing 默认语义`｜`宿主 :1996 消费面同构` ⇒ `LlmRuntime.imageRequestPricing 消费面同构`｜`lib/types/types.d.ts:171-178` ⇒ `LlmImageRequestPricing 方法式`｜`，:159-164）` ⇒ `LlmImageRequestPrice`｜`宿主注释 :1639` ⇒ `must answer`｜**宿主**
- **`tests/smoke.mjs`**（扩 `:752`）：`index.js:128-135 register / 269-279 match` ⇒ `register(route) 支持 kind` + `match(pathname)`｜`宿主 lib/index.js:2251` ⇒ `dsh-llm 的 adapterStream`｜`projectImagesForTextModel` / `textOnlyImageText` 在位（去 `:721-729` / `:541-543`）｜**宿主**
- **`tests/fix-010-gui-fidelity.mjs`**（新建）：`lib/index.js:554` ⇒ `session.append("user/message", message) 持久化点`｜**宿主**。**注意**：`lib/index.js:554` 短串在守卫内多处出现 ⇒ **禁作 needle**，须用整行/多行片段。
- **`tests/metrics.mjs`**（扩 `:748`；注意 9h-3 的「」扫描——新增文本不含「」）：`index.js:4832-4835` ⇒ `dsh-vision-router 同款：adapterHandlesImages 分支`｜**`.tmp-research` 参考副本**（在仓库路径内、`.gitignore:16` 忽略、版本控制外；`dsh-vision-router` 宿主装态不存在）⇒ **守卫不可机器核验该对象**。
- **`tests/run-all.mjs`**（新建）：`host-contract.mjs:96-99` ⇒ `` `stripComments` 同法 ``｜**在仓**（可选对象存活核验）。

**自碰撞提示（批 D 自报，R4 验证 3/3 成立）**：`lib/index.js:19` 已是既有元素（`health:806`）；`index.js:605,2502` ⊂ `lib/index.js:605,2502-2503`（`health:960`）；`lib/client.js:` 在守卫内出现 20 次 ⇒ **禁作 needle**，须用更长片段；条目注释须**分段式**表述（9h-4 纪律）。

---

## 三、批 F 硬要求（R3 / R4 审查裁定，MUST 逐条满足）

1. **R2 P2-1（MUST-FIX）**：`tests/host-contract.mjs:623` 的 `expectSymbolHost` 省略时**裸抛 TypeError**（与「不裸抛」声明不符；判据 fail-closed 保持但截断诊断）⇒ 补防御 + 构造性实证。
2. **R2 P2-2 收口**：删除 `tests/host-abi-health.mjs:878` 的「宿主靶子不可稳定符号化」总括断言（与实况相反），改**逐处标注式**；并刷 ⑥ 段落数字。
3. **保护窗口（R4 P3-5 + R3 §二）**：现存 4 个既有条目的 `stale` **不含**本批清除锚、5 文件**无条目** ⇒ 批 F 落地前本批收敛锚**可被无声重引入而不判红**。**批 F MUST 为 §一 + §二 全部文件建/扩 `stale`**（含 `lib/**` 面 9 文件 + `tests/**` 面 9 文件）。
4. **R3 六项条目录入要求**：①**裸锚 needle MUST 带同句上下文**（既有先例 `'（:1397-1403）'` / `'presetDiagnostics :2109'` / `'OAUTH_ROUTE_PROVIDER :36'`；本批清除的 `:21` / `:47/:53` / `:292` / `:429` / `:803` / `:1568` 裸登记必歧义）；②**两处保留锚（⑩ / ⑭）MUST NOT 入 `stale`**（入表即红）；③**镜像侧不重复登记**（与 `:774-777` 既有政策一致）；④ R2 P2-2 一并收口 + ⑥ 段落数字刷新；⑤ `staleUnitCount === ANCHOR_CASES.length` 随条目数变化 ⇒ **数字按引用时点重跑**；⑥ 跨文件同步 `tests/fix-029-host-contract.mjs:18` 的同锚旧形态。
5. **宽口径他文件裸锚收敛（Coordinator 裁定，归批 C/D → 本批执行）**：守卫文本内他文件裸锚（`:461` / `:750` / `:762` / `:769` / `:770` / `:896` / `:898` 等 = R2 层 B 实测 28 行 / 43 处中未处置者）逐处语义判定收敛（禁 grep 批量改写）。
6. **未闭合 2 项在仓登记（R3 P3-2 / R4 P3-2）**：`tests/fix-029` 的 `dsh-client-ui-conversation :16041-16056`（**PropsHooks 该包内 0 命中，实为 InputBar 渲染段**）与 `client-render` 的 `L####` wire-schema 块（实测部分漂移）⇒ 二者当前**仅存于 commit message**，批 F MUST 写入在仓 `notes`。
7. **`:270` 保留项**（`tests/host-contract.mjs`）逐处判定收敛或维持保留并登记理由。
8. **R4 P2-1 方法学**：证据形态 MUST 含**骨架逐字节判据**（注释/字符串内容置空 + 正则逐字保留），census 仅作辅助——census 计数不足以支撑「零判据谓词变更」。

---

## 四、MUST NOT 入 `stale` 的保留锚（入表即红）

| 锚 | 源文件 | 保留理由 | 机器绑定 |
|---|---|---|---|
| `types/agent.js:297-318` | `lib/prestep.js`（锚现 `:152`）+ `tests/fix-029-host-contract.mjs:7` | 受 `tests/host-contract.mjs:335` 的 `extra.signatures` + `:638-641` **原样逐字在位断言**约束；谓词内存复算：现文 `[true,true]` / 去行号 `[false,true]` | **2 处机器锁**（tests 文件 + 守卫 needle）+ **1 处 P5 纪律锁**——`lib/prestep.js:152` **无任何守卫绑定**（实测 0 命中） |
| `dsh-host-apiproxy lib/index.js:1010-1054` + 裸 `:2582-2594` | `lib/service.js:1325/:1327` | 该包在本机 DSH 0.1.5-rc.2 装态**不存在**（`Test-Path=False`）⇒ 无实读对象，**禁止静默改指**（P10-④） | 无（登记句） |

---

## 五、未验证与限制（不得作为通过依据）

1. 本文件条目值**未经逐对独立审查**（R3 标「未验证」；R4 以自推导 16 对样本复核 16/16 通过，但清单本体未逐对核验）。
2. `tests/metrics.mjs` 条目对象位于 `.tmp-research` 参考副本（版本控制外、宿主装态不存在）⇒ **守卫不可机器核验**；「仓库外参考副本」措辞不精确（在仓库路径内）。
3. 批 D 的「口径外同对象收敛 14 处」计数单位不自明（R4 P3-3：站点 14 / 引用 22 / token 25〔21 行〕）。
4. `lib/index.js:554` 短串、`lib/client.js:`、`index.js:605,2502` 等为既有元素子串 ⇒ 见 §二 自碰撞提示（禁作 needle）。
