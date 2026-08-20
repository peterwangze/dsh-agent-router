# MIG-001 R13 — Step 9 返工复审报告（Code Reviewer，独立审查）

- **Round**: R13（Step 9 复审轮——R12 NEEDS_CHANGE 返工后的验证轮；审查链 R1-R11 覆盖 Step 0-8，R12 为 Step 9 首审）
- **前轮引用**: `.governance/review-MIG-001-R12.md`（R12 终态 NEEDS_CHANGE，unresolved_blockers=1，阻塞项 F-1 P0 符号链接/联接逃逸）
- **审查对象**: 工作区未提交变更集（Step 9 原始 + R12 返工累计：`lib/service.js` +144、`lib/client.js` +116、`tests/smoke.mjs` +190、`tests/client-render.mjs` +99；`docs/architecture-v3.md` 2 行为 Coordinator V-DSH-3 更新，非本审查对象）。返工增量 = service.js +42（二次校验块 + export + isPathContained）、client.js +13（F-2 effect + F-11 容器重构）、smoke.mjs +105（F-3 块 + F-1 夹具 + mock cwd 感知化）、client-render.mjs +0（返工未改渲染测试）
- **审查者**: software-project-governance-code-reviewer（只读审查；唯一写入为本报告）
- **审查日期**: 本会话
- **终态**: `APPROVED_WITH_NOTES`（R12 必修项 F-1/F-2/F-3/F-11 全部闭环；保留非阻塞 P3 记录项）
- **独立结构字段**: `unresolved_blockers=0`

---

## 0. 复审范围与执行方式

- 复审范围 = R12 findings 修复质量 + 修复引入的回归（重点 F-1 二次校验的正确性与完备性——安全修复逐行验证），不重开全量首轮。
- 实读：`lib/service.js`（L65 URL_FILE_MAX_BYTES、L32 path 别名 import、L447-485 EXT_MEDIA_TYPES/detectAudioVideoMediaType/isPathContained、L2121-2221 readWorkspaceFile 全函数）；`lib/client.js`（L3444-3520 blobUrlOf/RouteFileRow 全函数、L26 hooks import）；`tests/smoke.mjs`（L240-263 mock fs、L949-972 F-3 断言区、L981-1120 readWorkspaceFile 断言区含 F-1 夹具、L547-550 cli 联动断言、L5 import）；`tests/client-render.mjs`（L174-199 fakeWindow URL 桩、L811-893 L3 三态断言区）；宿主源码：`@deepseek-ai/dsh-fs-local/lib/index.js`（resolve L704-712 / contains L719-722 / stat L723-733 / readBytes L758-763 / resolveLocalTarget L153-194）、`@deepseek-ai/dsh-fs-sandbox/lib/index.js`（L107 SandboxedFileSystem extends LocalFileSystem，写面覆盖，读面继承）。
- 测试运行事实由 Coordinator 提供（协议硬约束，未亲自复跑）：`node tests/smoke.mjs` → exit 0，`ALL SMOKE TESTS PASSED`，534 ok / 0 FAIL（R12 基线 516 → +18 = F-1×3 + F-3×15）；四子套件全绿。
- 未修改任何产品代码；唯一写入为本报告。

## 1. 验证事实表（可复查事实）

| # | 事实 | 来源 | 验证方式 |
| --- | --- | --- | --- |
| R13-T1 | 二次校验实现（service.js L2165-2191）：`fs.resolve(cwd)` 取工作区根 targetKey（L2174-2182，失败 → PATH_OUTSIDE_WORKSPACE，fail-closed）；目标 targetKey 取 `fs.resolve(raw,{cwd}).targetKey`（L2183-2185，后备 displayPath → normalized）；包含判定优先 `fs.contains(workspaceTarget, target)`（L2186-2187），后备 `isPathContained(workspaceKey, targetKey)`（L2188）；`!contained` → PATH_OUTSIDE_WORKSPACE（L2189-2191） | 实读 service.js | 逐行比对 R12 F-1 建议 ①②③ 落地情况 |
| R13-T2 | **宿主 fs.contains 语义与签名实读**（dsh-fs-local L719-722）：`relative(processPath(parent), processPath(child))`，processPath = `String(target.targetKey)`（L713-715）——接收两个 **target 对象**（与调用 `fs.contains(workspaceTarget, target)` 完全匹配）；判定表达式 `path === "" || path !== ".." && !path.startsWith(".." + sep) && !isAbsolute(path)` 与后备 `isPathContained`（service.js L482-485）**逐字同构**；contains 为**同步**函数，`Boolean(await ...)` 兼容 | 实读宿主 dsh-fs-local | 表达式逐字比对；参数形态比对 |
| R13-T3 | **生产 fs 对象暴露 contains**：`dsh-fs-sandbox` L107 `SandboxedFileSystem extends LocalFileSystem`，仅覆盖 writeText/editText（checkedTarget L157-170 写面包含校验）；resolve/stat/readBytes/contains 全部继承自 LocalFileSystem（dsh-fs-local）——读面 contains 恒可用 | 实读宿主两包 | 类继承 + 覆盖方法清单比对（R12 F-T3 再确认） |
| R13-T4 | 宿主 resolve 语义（dsh-fs-local L153-194, L704-712）：targetKey = `FsTargetKey(realpath(displayPath))`（存在时）或缺失祖先回退（L167-193，realpath 最近存在祖先 + 追加缺失后缀）；stat/readBytes 均经 target.targetKey 操作（L725/L761）——**读路径不重解析 raw**，resolve 后的 targetKey 即读面唯一输入 | 实读宿主源码 | 逐行核验（同 R12 F-T3/F-T4 更新形态） |
| R13-T5 | mock fs（smoke L240-263）cwd 感知化：`resolve(path, opts)` 相对路径按 `opts.cwd` 拼接 displayPath，默认 `targetKey = displayPath`（无链接）；无 contains——常规用例走 isPathContained 后备分支 | 实读 smoke | 与宿主 resolveLocalTarget 语义比对；确认既有断言判别力不因 mock 变更而削弱（见 §4 联动） |
| R13-T6 | F-1 三用例：① mock 注入逃逸（L1054-1063，`link.mp3` → targetKey='D:/outside/secret.txt'，词法在内/realpath 在外 → 拒）；② contains 征询（L1066-1070，contains=()=>false → 工作区内文件亦拒，证明宿主分支被征询）；③ 真实链接夹具（L1075-1105，win32 junction / POSIX symlink 指向 tmpDir 兄弟目录真实文件 + realpathSync 换挂 → 拒；创建失败 catch 跳过，注释声明判别力由 mock 注入用例保证） | 实读 smoke | 逐用例推演（见 §2）；与 Coordinator 计数 534=516+18 交叉验证——18 新断言 = F-1×3 + F-3×15，计数一致 → 真实夹具实际执行且通过（未跳过） |
| R13-T7 | F-3 修复：`export function detectAudioVideoMediaType`（service.js L461）；smoke L5 import + 15 断言（L955-971：6 正例 + 6 截断头 + 3 负例） | 实读两文件 | 判别力推演：旧代码无导出 → import 语句即抛 → 全套件失败（判别成立） |
| R13-T8 | F-2 修复（client.js L3490-3501）：`previewUrl` 派生自 state（L3494，仅 ready 且 string）；`useEffect(() => () => { if (previewUrl && !previewUrl.startsWith('data:')) { try { window.URL.revokeObjectURL(previewUrl) } catch {} } }, [previewUrl])`——卸载与 previewUrl 变更均 revoke，data: 回落守卫跳过，异常吞没 | 实读 client.js | 依赖数组语义推演（React cleanup 先于新 effect）；与 R12 F-2 建议逐条比对 |
| R13-T9 | F-11 修复（client.js L3503-3513）：ready 三态共用容器——`mediaType.startsWith('audio/')`→`<audio controls>` / `startsWith('video/')`→`<video controls>` / 其余→下载 `<a download>`；单容器 `el('div',{className:'dshrouter-toolfile'}, pathText, media)` | 实读 client.js | 与 R12 F-11 位置（原 L3491-3499 三态重复）比对；渲染断言等价性见 §4 |
| R13-T10 | 渲染 harness 可观测性（client-render L198）：`URL: { createObjectURL: () => 'blob:mock-preview', revokeObjectURL: () => {} }`——revoke 为 no-op 无计数器；`captured` 无 revoke 字段——**F-2 revoke 行为在 harness 不可直接观测**（Developer 声明属实） | 实读 client-render | 与 Developer 声明比对 |
| R13-T11 | R12 P3 项未被顺手改动：detectAudioVideoMediaType 魔数逻辑（L461-474）与 R12 F-T9 描述逐字节一致（仅加 export）；resolve 失败映射 PATH_OUTSIDE_WORKSPACE（L2160-2163，F-6 不变）；盘符大小写语义（F-7 不变）；lastWorkspace 工作区来源（L2148-2150，F-9 不变）；open() dataBase64 非空判定（client L3474，F-12 不变）；F-8 注释已随 F-1 同步更新（L2121-2140 现含 ③ realpath 二次校验说明） | 实读 + git diff | git diff 全文比对（service.js/client.js 增量仅限上述区域） |

## 2. F-1（P0）修复实质验证——逐行 + 绕过推演

### 2.1 二次校验逻辑正确性

- **包含判定方向/边界**：`path.relative` 语义天然处理三种边界——相等（rel === ''，child==parent，工作区根自身）、越界（rel === '..' 或 startsWith('..'+sep)）、绝对（pathIsAbsolute）。`==` vs 前缀+分隔符的区分由 path.relative 自身完成（如 `C:\work` vs `C:\work2` → rel=`..\work2` → 拒，无前缀误判）。`C:\work..x` 形态 → rel=`..\work..x` → 拒。✅
- **方向正确性**：判定为 workspaceKey（realpath(cwd)）→ targetKey（realpath(raw)）的包含关系——工作区内链接指向工作区外 → 拒；链接指向工作区内 → 放行（语义正确：真实文件在工作区内）。✅
- **`fs.contains` 优先 + 后备一致性**：R13-T2 证实宿主 contains 与 isPathContained 表达式逐字同构，两条分支语义等价；参数形态（两个 target 对象）与宿主签名完全匹配。✅
- **resolve 失败/异常路径 fail-closed**：`fs.resolve(raw)` 失败 → PATH_OUTSIDE_WORKSPACE（L2162-2163）；`fs.resolve(cwd)` 失败 → PATH_OUTSIDE_WORKSPACE（L2177-2178）；contained=false → PATH_OUTSIDE_WORKSPACE（L2189-2191）。**唯一非捕获点**：`fs.contains` 本身抛错（L2187 无 try/catch）→ 异常向上传播为 RPC 层错误（fail-closed 方向，不读文件；生产 contains 为纯同步词法比较不抛错；见 N-1）。✅
- **读路径不重解析**（R13-T4）：stat/readBytes 消费已解析 targetKey，原始路径的链接交换（resolve 后）不重定向读——二次校验后的读面输入恒为被校验过的 targetKey。✅

### 2.2 绕过尝试推演（逐项）

| # | 绕过尝试 | 推演结果 | 判定 |
| --- | --- | --- | --- |
| B-1 | 简单链接：`cwd\link.mp3` → 工作区外文件 | targetKey = realpath = 外部 → contains 拒 | ✅ 拒（mock 注入用例 L1061-1063 实证 + 真实夹具 L1094-1096 实证） |
| B-2 | 嵌套链接：link → link → 外部 | realpath 全链解析 → targetKey 为最终外部路径 → 拒 | ✅ 拒（机制推演；realpath 递归跟随） |
| B-3 | 工作区根本身是链接/junction | 两侧均 realpath：workspaceKey=realpath(cwd)，targetKey=realpath(cwd 下文件)——共享真实祖先 → 一致包含判定，合法文件放行 | ✅ 正确（不误拒，也不逃逸） |
| B-4 | 链接循环（A→B→A） | realpath 抛 ELOOP → fs.resolve 抛 → PATH_OUTSIDE_WORKSPACE | ✅ fail-closed |
| B-5 | targetKey 相对形态（非宿主 fs 实现） | 生产 fs 恒绝对（realpath）；后备降级链 targetKey→displayPath→normalized——仅当 fs 无 contains 且无 targetKey 时才降级为词法复核（等价旧守卫）；文档化（L2171-2172） | ✅ 降级安全（生产不触发） |
| B-6 | `..` 在 realpath 后存留 | realpath 归一化 `..` → targetKey 无 `..`；词法层也已拦截 raw 内 `..` | ✅ 不构成 |
| B-7 | Windows 大小写变体 | 盘符：win32 relative 根部不敏感比较 → 不误拒；目录段：大小写敏感 → 潜在误拒（fail-closed 方向安全，F-7 P3 既有，非本修复引入） | ✅ 无逃逸（仅误拒） |
| B-8 | 缺失 cwd（工作区被删） | `fs.resolve(cwd)` 祖先回退 → workspaceKey=词法 cwd；目标 targetKey 也在缺失祖先之上 → 包含拒；或 workspace resolve 抛错 → PATH_OUTSIDE_WORKSPACE | ✅ fail-closed（错误码由 FILE_NOT_FOUND 变为 PATH_OUTSIDE_WORKSPACE，见 N-4） |
| B-9 | 目录级 TOCTOU（resolve 与 readBytes 间交换目录为链接） | stat/readBytes 经 targetKey（realpath 字符串）打开，OS 在 open 时重解析路径段——理论上可被同用户本地写权限者重定向；但攻击者需对工作区文件系统有写权限（此时已可直接读外部文件），超出"浏览器侧构造 path"威胁模型；与宿主 path-based 设计同级残余 | ⚠ 记录为残余（N-5，P3） |
| B-10 | 链接指向外部目录、再经相对段回到内部 | realpath 全链归一化 → 最终真实路径在工作区内 → 放行（正确：真实文件确实在工作区内） | ✅ 语义正确 |

### 2.3 夹具真实性

- **mock 同构度**：cwd 感知 resolve（R13-T5）对齐宿主 resolveLocalTarget 的 opts.cwd 语义；默认 targetKey=displayPath（无链接）——既有断言判别力不依赖 mock 拒绝（R12 F-T10 结论保持成立）。✅
- **真实夹具平台兼容**：win32 用 junction（目录重解析点，无需管理员/开发者模式），POSIX 用 file symlink；清理分支区分 rmdirSync（junction）/unlinkSync（symlink）/rmSync 兜底（L1099-1104）；创建失败 catch 跳过，且注释明确"判别力已由 mock 注入用例保证"（L1074）——跳过时不产生假阴性。Coordinator 计数 534=516+18 与"18 新断言全部执行"一致 → **本环境真实夹具实际执行并通过**（未走跳过分支）。✅

## 3. R12 findings 逐条闭环表

| R12 # | 级别 | 判定 | 事实依据 |
| --- | --- | --- | --- |
| **F-1** 符号链接/联接逃逸 | P0 | **已修复** | R13-T1~T4 + §2 全节：二次校验逻辑正确、方向/边界完备、fail-closed、绕过推演 10 项无逃逸路径、三用例（mock 注入/contains 征询/真实夹具）全绿 |
| **F-2** blob URL 无 revoke | P2 | **已修复** | R13-T8：useEffect 清理（卸载 + previewUrl 变更双触发）、data: 守卫、异常吞没；语义逐条比对 R12 建议① |
| **F-3** 魔数分支覆盖不全 | P2 | **已修复** | R13-T7：export + 15 断言（6 正例/6 截断头/3 负例），判别力成立（无导出即 import 失败） |
| **F-11** ready 三态重复 | P2 | **已修复** | R13-T9：共用容器；渲染三态断言（client-render L841/L866/L872）守卫下全绿（等价性实证） |
| F-4 MP4 弱判定/m4a 误分类 | P3 | 未改动（记录项） | R13-T11：魔数逻辑与 R12 一致 |
| F-5 WebM/Matroska 误判 | P3 | 未改动（记录项） | R13-T11 |
| F-6 resolve 失败粗映射 | P3 | 未改动（记录项） | R13-T11：L2160-2163 与 R12 一致 |
| F-7 盘符大小写误拒 | P3 | 未改动（记录项） | R13-T11；二次校验亦依赖 win32 relative，误拒方向 fail-closed |
| F-8 注释需随 F-1 同步 | P3 | **已修复（联动）** | L2121-2140 现含 ③ realpath 二次校验完整说明（R12 建议③） |
| F-9 工作区来源多会话串扰 | P3 | 未改动（记录项） | L2148-2150 与 R12 一致 |
| F-10 测试判别力核验 | P3 | 保持（正向） | mock cwd 感知化不削弱判别力（§4 联动分析）；新夹具判别力见 §2.3 |
| F-12 open() dataBase64 判定 | P3 | 未改动（记录项） | client L3474 与 R12 一致 |

## 4. 返工回归检查与联动裁量

- **service.js 校验顺序**：词法 → resolve(raw) → resolve(cwd) → contains → stat → size → readBytes。新增 `fs.resolve(cwd)` 为每请求一次 realpath，性能可忽略。既有 smoke 断言（成功读/相对路径/越界/超限/目录/读失败/notFound）在新序列下逐一推演均保持原语义（含 contains 通过路径）。✅
- **client.js effect**：F-2 effect 不破坏渲染（client-render 三态断言全绿）；下载锚点在组件保持挂载期间不 revoke（仅卸载/变更时），常规下载路径不受影响（极端竞态见 N-6）。✅
- **联动 1 处裁量（smoke L550 `cli files paths injected`）**：mock resolve cwd 感知化后，runCli 注入的文件路径按实际 cwd（tmpDir）解析，断言期望值同步改为 `text.includes(tmpDir)`（L548-550 注释如实）。此为 F-1 测试基础设施改动的必然联动——若 mock 仍返回固定前缀 'D:/work/example/...'，新二次校验会拒绝所有相对路径合法夹具（旧代码无 post-resolve 校验故无此约束）；新断言判别力不降（路径解析错误仍会失败）。**裁量：合理联动，非范围扩张**。✅
- **client-render.mjs 返工零改动**：F-11 等价性由既有三态断言守卫（L836-842/L862-874，前置无条件计数 L835/L861）实证，无需新增。✅

## 5. 新发现列表（R13 引入观察——全部 P3，无阻塞）

| # | 级别 | 位置 | 事实依据 | 说明 |
| --- | --- | --- | --- | --- |
| N-1 | P3 | service.js L2187 | `Boolean(await fs.contains(...))` 无 try/catch | 生产 contains 为纯同步词法比较不抛错；若未来宿主实现变化或第三方 fs 的 contains 抛错 → 异常以 RPC 错误形状传播（fail-closed 方向，不读文件）。可选：包一层捕获映射 PATH_OUTSIDE_WORKSPACE |
| N-2 | P3 | tests/smoke.mjs L1066-1070 | contains 分支仅覆盖 deny 路径（=()=>false），accept 路径无直接用例 | mock 无 contains → 常规用例全走后备分支；contains=true 放行依赖与 isPathContained 的表达式同构（R13-T2 实证等价）。可选：注入 contains=()=>true 正例 |
| N-3 | P3 | tests/client-render.mjs L198 | fakeWindow.URL.revokeObjectURL 为 no-op 无计数 | F-2 revoke 行为在渲染 harness 不可直接观测（Developer 声明属实）；正确性依赖代码语义推演 + 渲染不破坏断言。可选：加 revoke 计数桩 |
| N-4 | P3 | service.js L2177-2178 | 缺失 cwd 时错误码由（旧路径）FILE_NOT_FOUND 变为 PATH_OUTSIDE_WORKSPACE | 工作区被删的边界场景；fail-closed 方向安全，错误码语义略粗（与 F-6 已接受的粗映射一致）。记录不改 |
| N-5 | P3 | service.js L2186-2191 | 目录级 TOCTOU 残余（B-9） | 需同用户本地 FS 写权限，超出"浏览器侧构造 path"威胁模型；与宿主 path-based 设计同级。记录不改 |
| N-6 | P3 | client.js L3495-3501 | 极端竞态：打开文件 A 后立即再打开文件 B，若 A 的下载/播放 in-flight → 旧 URL 被 revoke | 用户自触发、窗口极窄、影响有限（下载中断可重试）。记录不改 |

## 6. AI 专项检查（复审维度内）

| # | 检查项 | 结果 | 事实依据 |
| --- | --- | --- | --- |
| 1 | 修复不引入 mock 残留 | ✅ | 新增夹具仅存于 tests/；lib/ 无 mock 泄漏 |
| 2 | 修复不引入硬编码 | ✅ | targetKey 全部派生（resolve/realpath），无写死外部路径 |
| 3 | 幻觉 API | ✅ | fs.contains/resolve 签名与宿主源码逐行核验（R13-T2/T3/T4）；revokeObjectURL 为真实浏览器 API |
| 4 | 未实现 TODO | ✅ | lib/ grep TODO/FIXME/XXX 零命中（R12 结论保持） |
| 5 | 过度实现 | ✅ | 二次校验为 R12 建议①②③ 的精确落地；无额外机制 |

## 7. 硬门槛裁决

| 门槛项 | 阈值 | 结果 |
| --- | --- | --- |
| R12 必修项闭环（F-1/F-2/F-3/F-11） | 全部闭环 | ✅ 全部已修复（§3） |
| 新引入 BLOCKING | = 0 | ✅ 无（§5 全部 P3 记录项） |
| 每条发现标注级别 | 100% | ✅ |
| 绕过推演 | 完成 | ✅（§2.2 十项） |
| 事实红线 | 未验证标"未验证" | ✅（测试运行事实按协议标 Coordinator 提供；宿主事实为源码实读 R13-T2/T3/T4） |
| 复审链熔断（round=3） | 不触发 | ✅ 本报告为终态，不产生 NEEDS_CHANGE |

## 8. 终态

**`APPROVED_WITH_NOTES`**（`unresolved_blockers=0`）

- **R12 findings 闭环**: F-1（P0，安全核心）逐行验证通过——二次包含校验（workspace targetKey vs file targetKey）逻辑正确、方向/边界完备、fail-closed 全覆盖；绕过推演 10 项无逃逸路径；mock 注入 + contains 征询 + 真实 junction/symlink 三用例实证（534=516+18 计数一致，真实夹具实际执行）。F-2（P2）effect 清理语义正确（卸载/变更双触发 + data: 守卫）。F-3（P2）导出 + 15 断言判别力成立。F-11（P2）三态共用容器行为等价（渲染断言全绿）。F-8（P3）注释随 F-1 联动修复。
- **新引入**: 6 项 P3 记录项（N-1~N-6，含 contains 异常传播、TOCTOU 残余、revoke 不可观测、错误码粗映射、下载竞态），均不阻塞、方向 fail-closed。
- **联动裁量**: smoke L550 断言期望值随 mock cwd 感知化同步——合理联动，非范围扩张（§4）。
- **复审链**: R12(NEEDS_CHANGE) → 返工 → R13(APPROVED_WITH_NOTES) 终结；熔断未触发。
