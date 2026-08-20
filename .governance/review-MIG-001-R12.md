# MIG-001 R12 — Step 9 首轮审查报告（Code Reviewer，独立审查）

- **Round**: R12（Step 9 首审轮；审查链 R1-R11 已覆盖 Step 0-8 并全部通过含 Step 8 返工复审）
- **审查对象**: 未提交变更集（Step 9 三级展示升级 + readWorkspaceFile service，4 产品/测试文件 +387/-4）— `lib/service.js`（+102：readWorkspaceFile + detectAudioVideoMediaType + EXT_MEDIA_TYPES）、`lib/client.js`（+103：readWorkspaceFile 客户端 wire codec + descriptor、RouteFileRow L3 + blobUrlOf、RouteAgentToolCard gallery 升级 + argsRaw 提取、CSS + zh/en 文案）、`tests/smoke.mjs`（+85：service 断言 ×11 + wire codec 断言）、`tests/client-render.mjs`（+99：L3 渲染断言 ×10）
- **审查者**: software-project-governance-code-reviewer（只读审查；唯一写入为本报告）
- **审查日期**: 本会话
- **终态**: `NEEDS_CHANGE`（非终态——P0×1；Coordinator 须安排返工后发起 R13 复审）
- **独立结构字段**: `unresolved_blockers=1`

---

## 0. 审查范围与执行方式

- Step 9 首轮全量审查：五维度 + 审查重点（readWorkspaceFile 安全性/边界完备性、blobUrlOf、L3 来源限定、魔数检测、gallery 回归、R9-F-11 核验、测试判别力）。
- 实读：`docs/architecture-v3.md`（§4.3.5 L332-348、§5 输出段 L573-580、§8 Step 9 行 L780、§13 V-DSH-3 L859、§13 V-DSH-4 L860）；`lib/service.js`（L53-59 MODALITY_DEFAULT_MAP、L447-474 魔数、L1621-1682 runImage、L1960-1974 modalityOfAgent、L2110-2179 readWorkspaceFile）；`lib/client.js`（L181-218 wire codec/descriptor、L288-297 CSS、L574-577/L844-847 文案、L3445-3507 blobUrlOf/RouteFileRow、L3510-3571 RouteAgentToolCard/L3/gallery、L3673-3681 装配）；`lib/schemas.js`（L538-564 codecs）；`lib/rpc.js`（L156-172 descriptors）；`lib/attachments.js`（L51-53 错误码）；`tests/smoke.mjs`（L95-152 wire/descriptor、L938-1021 readWorkspaceFile 断言区、L240-254 fs mock）；`tests/client-render.mjs`（L174-279 夹具/remoteMock、L780-893 L3/gallery 断言区）；宿主源码：`@deepseek-ai/dsh-fs-local/lib/index.js`（resolve/realpath/readBytes/contains）、`@deepseek-ai/dsh-fs-sandbox/lib/index.js`（checkedTarget 仅写面）、`@deepseek-ai/dsh-client-ui-tool/lib/client.js`（L170/L1498 argsRaw 字段事实）。
- 未运行任何测试命令（协议硬约束）；测试运行事实由 Coordinator 提供（见 §1 F-T1）。
- 未修改任何产品代码；唯一写入为本报告。

## 1. 事实依据表（可复查事实）

| # | 事实 | 来源 | 验证方式 |
| --- | --- | --- | --- |
| F-T1 | `node tests/smoke.mjs` → exit 0，`ALL SMOKE TESTS PASSED`，516 ok / 0 FAIL（495 既有零回退 + 21 新增）；四子套件全绿 | Coordinator 独立复跑 | **未亲自复跑**（依协议以 Coordinator 事实为准）；21 新增 = 11（readWorkspaceFile 断言区 L959-1009）+ 8（wire codec L103-126）+ 1（descriptor L147）+ 1（anchored L959 首条）——与实读逐条计数一致 |
| F-T2 | readWorkspaceFile 校验序列实读（service.js L2125-2179）：① path 非空 → INVALID_REQUEST（L2126-2127）→ ② 词法边界判定 `pathIsAbsolute(raw) ? pathResolve(raw) : pathResolve(cwd, raw)` + `pathRelative(cwd, normalized)` 拒绝 `..`/`..\` 前缀/绝对 rel（L2138-2141）→ ③ fs.resolve/stat（L2144-2156）→ ④ 目录拒绝（L2157）+ stat.size > 25MB 读前判定（L2159-2161）→ ⑤ fs.readBytes(target, undefined, 25MB)（L2164）+ FS_TOO_LARGE 兜底映射（L2167-2169）→ 返回 {ok, dataBase64, mediaType?, name}（L2173-2178） | 实读 service.js | 与 §4.3.5 契约逐条比对（§2 D-3） |
| F-T3 | **宿主 fs 读面无包含约束（F-1 判定依据）**：`dsh-fs-local` resolve → `targetKey = FsTargetKey(await realpath(displayPath))`（宿主 L155-160）——**realpath 跟随符号链接/联接**；stat/readBytes 全部经 targetKey 操作（宿主 L723-733 stat、L758-763 readBytes → readWholeBytes L370 stat + L373 `createReadStream(target.targetKey)`）；宿主类注释明示 cwd 是 "a resolution default, NOT a containment boundary"（宿主 L670-672）；`dsh-fs-sandbox` 仅包装 writeText/editText（checkedTarget L157-170 只对**写**做包含校验），readBytes/stat/resolve 继承自后端无读面拦截 | 实读宿主两包源码 | 逐行核验：realpath 调用点、readBytes 消费 targetKey 点、沙箱包装方法清单 |
| F-T4 | service 词法判定后**无 post-resolve 再校验**：fs.resolve 结果仅取 displayPath（L2149），resolved target 的 realpath/targetKey 从不与工作区 realpath 复核 | 实读 service.js L2143-2149 | 与 F-T3 组合推演逃逸链（§4 F-1） |
| F-T5 | wire 形状三方一致：client wReadWorkspaceFileRequest {path} / wReadWorkspaceFileResult {ok,dataBase64?,mediaType?,name?,message?,code?}（client.js L186-190）= schemas.js L553-564 = service 返回形状 L2173-2178；错误码 PATH_OUTSIDE_WORKSPACE（L2141）/ FILE_TOO_LARGE（L2160,2168）/ FILE_NOT_FOUND（L2154,2156,2157）/ INVALID_REQUEST（L2127）/ WORKSPACE_UNAVAILABLE（L2134）/ READ_FAILED（L2170）均在 ATTACHMENT_ERROR_CODES 内（attachments.js L51-53） | 实读三文件 | 形状逐字段比对 |
| F-T6 | L3 来源限定实读（client.js L3538-3550）：`JSON.parse(block.call && typeof block.call.argsRaw === 'string' ? block.call.argsRaw : '{}')`；pushFile 拒绝空串/`/^https?:\/\//i` URL/去重 seenFiles；取 args.filePath（string）与 args.files（array）非 URL 条目；catch 容错非法 argsRaw → 无 L3 | 实读 client.js | 与宿主字段事实比对（F-T9） |
| F-T7 | 宿主 toolview block 字段事实：`dsh-client-ui-tool` 自用 `block.call?.argsRaw`（宿主 client.js L170 `const argsRaw = (done ? block.call?.argsRaw : block.argsRaw) ?? ""`、L1498 `("kind" in block ? block.call?.argsRaw : block.argsRaw) ?? ""`）；argsRaw 为 JSON 字符串（parseArgs L79-85 JSON.parse）——插件 L3 提取字段与宿主一致 | 实读宿主 dsh-client-ui-tool | 字段名/形态比对 |
| F-T8 | blobUrlOf 实读（client.js L3445-3455）：atob 解码 → Uint8Array → Blob → `window.URL.createObjectURL`；不可用/异常 → data: URL 回落；**全链路无 revokeObjectURL**（F-2 依据） | 实读 client.js | 全文 grep revokeObjectURL = 0 命中 |
| F-T9 | 魔数检测实读（service.js L460-474）：WAV `RIFF....WAVE`（≥12）、MP3 仅 ID3 `ID3`（≥3）、FLAC `fLaC`（≥4）、Ogg `OggS`（≥4）、MP4 `....ftyp`（≥12，仅 offset 4-7）、WebM EBML `1A 45 DF A3`（≥4）；EXT_MEDIA_TYPES 兜底（L448-453）在魔数未命中时按扩展名（L2172 魔数优先） | 实读 service.js | 逐分支长度守卫核验（空数据/截断头不越界）；与裁量 4 声明比对（§2 D-8） |
| F-T10 | smoke 边界断言判别力：mock fs.resolve 恒返回 displayPath 前缀拼接（smoke L241 `resolve: async (path) => ({ displayPath: path.includes(':') || path.startsWith('/') ? path : 'D:/work/example/${path}' })`）——**从不拒绝任何路径** → 越界断言（L978/L980）的 PATH_OUTSIDE_WORKSPACE 完全由服务自身词法判定产生，断言真实覆盖服务守卫（无 mock 假阳性） | 实读 smoke L240-254 + L938-1021 | 逐条推演：escape/outsideAbs 在"守卫被移除"假设下会失败（判别成立）；mock 无 realpath/targetKey 语义 → **符号链接场景未被测试覆盖**（F-1 修复需补夹具） |
| F-T11 | client-render 条件门判别力：L836 `if (openButtons.length === 1)` / L848 / L862 深层断言前均有无条件断言守卫按钮存在（L835 / L851 / L861）——深层断言不会静默跳过 | 实读 client-render L828-874 | 逐条比对守卫/深层断言配对 |
| F-T12 | R9-F-11 复核事实：MODALITY_DEFAULT_MAP.image = `{ consume: [], produce: ['image'] }`（service.js L57）；modalityOfAgent（L1960-1974）capabilities 覆盖分支仅 `chat/agent → consume.add`、`cli → produce.add`——**image 类型 capabilities 不改变矩阵**；runImage（L1621-1682）body = {model, prompt, n, size, response_format}（L1642-1648）仅消费 prompt 文本，无图片输入通道 | 实读 service.js | 与 R9-F-11 结论逐点比对（§2 D-10） |

## 2. 设计一致性表（含五处裁量 + R9-F-11 核验）

| 设计依据 | 检查项 | 实读结论 | 判定 |
| --- | --- | --- | --- |
| §8 Step 9 行（L780） | RouteAgentToolCard → ImageGallery：L3556-3560 gallery 容器（`dshrouter-toolimages dshrouter-toolgallery`，多图并排）+ L289 CSS grid；L3 路径文本 + 打开文件经 `router/readWorkspaceFile`：L3463-3507 RouteFileRow + L3473 RPC；audio 播放器原生标签：L3494 `<audio controls>`（V-DSH-3 已证伪 → 原生标签即最终路径）；测试 = client-render L3 渲染断言：L811-893；回滚 = 卡片回退现状缩略图：gallery 类与 L3 行独立于既有渲染路径 | 全部落地 | ✅ |
| §5 输出段三级表（L573-580） | L1 原生 image 块（未动，F3 现状）；L2 缩略图卡片 → ImageGallery 多图（L3556-3560）；L3 路径文本 + 打开文件（L3490 pathText + L3505 打开按钮 + audio/video/download 三态 L3491-3499） | 分级形态与实现一一对应 | ✅ |
| §4.3.5 readWorkspaceFile wire 契约（L341-344） | request {path} / response {ok, dataBase64?, mediaType?, name?, message?, code?}；fs.resolve 限制会话工作区（PATH_OUTSIDE_WORKSPACE）→ readBytes ≤25MB | 形状三方一致（F-T5）；边界判定/大小上限/错误码序列与契约一致 | ✅（边界完备性缺陷见 F-1） |
| §13 V-DSH-3（L859，已证伪） | 原生标签兜底即最终路径 | `<audio>`/`<video>` 原生标签（L3494-3497）；宿主未来提供播放组件时可升级——注释 L3459-3461 如实 | ✅ |
| §13 V-DSH-4（L860） | audio/video 魔数判定可扩展 | detectAudioVideoMediaType 落地于 readWorkspaceFile（L460-474）——部分推进（agent 白名单判定未启用，与裁量 4 声明一致） | ✅ |
| 裁量 1：gallery 同构实现 | 不 import 宿主 UI 组件——client bundle factory 仅 require('react')（client-render L202-205 对非 react require throw） | CSS grid（L289）+ 既有 lightbox（L3564-3570）对齐宿主 ImageGallery/ImageLightbox 语义；无新增 import | ✅ 合理 |
| 裁量 2：客户端 wire codec 本步补齐 | 与 uploadFile Step 8 同款模式 | client L186-190 codec + L216 descriptor；宿主侧 schemas/rpc.js 为 Step 5c 既有（F-T5）；形状完全一致 | ✅ |
| 裁量 3：L3 来源限定 | 从 call.argsRaw 提取 filePath/files（非 URL），不含其它来源 | L3538-3550；URL 正则排除 + 去重 + 非法 argsRaw 容错；宿主同用 `block.call?.argsRaw`（F-T7） | ✅ |
| 裁量 4：mp3 仅认 ID3 头 | 放弃 MPEG 帧同步启发式（0xff 0xfe UTF-16 BOM 误判） | L464 仅 ID3；注释如实；V-DSH-4 部分推进声明一致（F-T9） | ✅ |
| 裁量 5：R4 F-1/F-2 未顺带 | 触发条件不满足（改动面无相邻关系） | 变更文件清单（client.js/service.js/tests×2）不含 wrapper.js/memory.js | ✅ |
| R9-F-11 核验 | MODALITY_DEFAULT_MAP.image consume:[] 如实反映 runImage 纯文生图；本步不触矩阵 | F-T12：image 类型 consume 恒 []；runImage 无图片输入通道；本变更集无矩阵相关修改 | ✅ 结论成立 |

## 3. 五维度结论

| 维度 | 检查项覆盖 | 结论 |
| --- | --- | --- |
| ① 正确性 | 逻辑实现符合设计意图；边界（空 path/目录/超限/越界/读失败/无工作区/相对路径）全处理；并发安全（无共享状态变更）；资源管理（见 F-2） | 主路径正确；F-4/F-5/F-7 展示级误分类（P3） |
| ② 安全性 | 输入校验（path 类型由 strict codec 保证）；注入防护（路径经词法边界判定）；敏感数据（无硬编码凭据）；权限检查（工作区边界为本服务自守） | **F-1 符号链接/联接逃逸（P0）**；F-2 blob URL 泄漏（P2）；F-6 错误码粗映射（P3） |
| ③ 可维护性 | 命名/注释质量高（注释引用设计章节并记录决策）；函数长度合规；重复代码 F-11（P2）；注释与实现一致（F-8 需随 F-1 修复同步） | 良好；P2×1 + P3×1 |
| ④ 性能 | 25MB 上限约束 base64/内存（读前 stat 判定 + 宿主 FS_TOO_LARGE 兜底）；无 O(n²)；blob URL 累积 F-2（P2）；data: URL 回落内存量级受上限约束（P3） | 合格（含 F-2） |
| ⑤ 测试覆盖 | 核心路径（成功读/魔数嗅探/扩展名兜底/越界拒绝/超限/读失败/目录/无工作区）全覆盖；边界测试（F-T10 判别力成立）；错误路径（READ_FAILED/FILE_TOO_LARGE）全覆盖 | 主路径覆盖充分；**F-3 魔数分支覆盖不全（P2）** |

## 4. 发现列表（P0~P3 + 文件:行号 + 事实依据 + 建议）

### F-1（P0，阻塞，安全性）readWorkspaceFile 符号链接/联接逃逸——词法边界判定不覆盖解析后真实路径

- **位置**: `lib/service.js` L2138-2148（词法判定后无 post-resolve 再校验）
- **事实依据**: F-T3 + F-T4。① 服务仅对**词法路径**做 `pathResolve/pathRelative` 判定（L2138-2141），`..`/绝对路径逃逸被拒（测试证实，F-T10）；② 但随后 `fs.resolve(raw, {cwd})` 的 targetKey = `realpath(displayPath)`（宿主 dsh-fs-local L155-160）——**跟随符号链接与 NTFS 联接**；`fs.stat`（宿主 L723-733）与 `fs.readBytes`（宿主 L758-763 → L370 stat + L373 `createReadStream(target.targetKey)`）全部经 targetKey 操作；③ 宿主 `dsh-fs-sandbox` 仅对写面做包含校验（宿主 L157-170 只包装 writeText/editText），读面无任何拦截；④ 宿主类注释明示 cwd "NOT a containment boundary"（宿主 L670-672）——读面边界 100% 依赖本服务的词法判定，而词法判定不覆盖符号链接解析后的真实路径。
- **逃逸链推演**: 工作区内存在符号链接/联接（如 pnpm 工作区 node_modules 联接、克隆仓库的符号链接、用户自建 junction）`cwd\link.mp3` → `C:\Users\me\secrets\secret.txt`（≤25MB 文件）→ 请求 path=`link.mp3` → 词法判定通过（rel=`link.mp3`）→ fs.resolve realpath 指向外部 → stat 跟随（file，size ≤25MB 通过）→ readBytes 读取**工作区外文件**字节 → base64 返回浏览器。**边界逃逸成立**，违反审查任务"边界逃逸必须杜绝"硬性要求与 §4.3.5 契约语义。
- **影响**: 工作区外任意 ≤25MB 文件字节经 RPC 泄露到会话 UI；典型场景（pnpm node_modules 联接）下无需恶意构造即可触达工作区外文件。
- **建议**: ① resolve 后对 resolved target 做**二次包含校验**——`fs.resolve(cwd)` 取工作区 realpath targetKey，与 `target.targetKey` 用宿主 `fs.contains(parent, child)`（dsh-fs-local L719-722 提供）或 pathRelative 比较，rel 越界 → PATH_OUTSIDE_WORKSPACE（对齐沙箱 `isPathUnder` 模式，宿主 L164）；② 补符号链接夹具测试：tmpDir 内建指向工作区外文件的真实 symlink/junction，断言 PATH_OUTSIDE_WORKSPACE（现 smoke fs mock 无 realpath 语义，无法覆盖此场景，F-T10）；③ 同步修正注释（L2114-2116 声称"resolve+relative 判定"完备，未提符号链接面）。
- **级别依据**: 审查任务书将符号链接列为边界完备性检查项并声明"边界逃逸必须杜绝"；机制经宿主源码逐行验证成立、无宿主兜底（读面无沙箱）；属安全漏洞类阻塞项。

### F-2（P2，建议，安全性/性能）blob URL 生命周期无 revoke

- **位置**: `lib/client.js` L3451（createObjectURL）+ L3463-3507（RouteFileRow 使用）
- **事实依据**: F-T8——全文件 grep `revokeObjectURL` 零命中；RouteFileRow 每次成功打开创建一个 blob URL 存于 state，组件卸载/previewUrl 变更时从不 revoke。
- **影响**: 长会话多次打开文件 → blob URL 与底层 Blob（每份上限 25MB）持续累积，页面卸载前不释放；属内存泄漏级问题（非功能破坏）。
- **建议**: useEffect 清理（组件卸载或 previewUrl 变化时 revoke 旧 URL）；或打开新 URL 前 revoke 上一份。
- **级别依据**: P2（可遗留，不阻塞；资源泄漏有界）。

### F-3（P2，建议，测试覆盖）detectAudioVideoMediaType 六魔数分支仅 WAV 被覆盖

- **位置**: `lib/service.js` L460-474；`tests/smoke.mjs` L938-1021
- **事实依据**: F-T9——6 个魔数分支（WAV/MP3-ID3/FLAC/Ogg/MP4-ftyp/WebM-EBML）中仅 WAV（RIFF/WAVE）经真实字节路径覆盖（smoke L972），扩展名兜底经 L975 覆盖；mp3/flac/ogg/mp4/webm 五分支**零直接测试**（函数未导出无法单测；smoke 未构造对应字节夹具）。
- **影响**: 五个魔数分支存在回归无保护；V-DSH-4 声称"魔数表调研 + 单测"未完全兑现（§13 L860）。
- **建议**: 导出 detectAudioVideoMediaType（或经 readWorkspaceFile 注入五组魔数字节夹具）补断言，含截断头边界（长度不足分支）。
- **级别依据**: P2（核心路径已测，分支覆盖缺口可遗留并排期）。

### F-4（P3，讨论，正确性）MP4 魔数弱判定 + m4a 音频误分类 video/mp4

- **位置**: `lib/service.js` L470
- **事实依据**: 仅校验 offset 4-7 的 `ftyp`（长度 ≥12 但品牌字节 8-11 未校验）；.m4a/.m4v 音频文件同样含 ftyp → 魔数优先（L2172）判为 video/mp4（扩展名兜底本可给 audio/mp4），客户端以 `<video>` 渲染纯音频。
- **影响**: 展示级误分类（播放器形态差异），不影响字节完整性。
- **建议**: 可选——校验 ftyp 品牌字节区分 `M4A `（audio）与 `isom/mp42`（video）；或对 audio 扩展名优先。
- **级别依据**: P3（展示语义，不阻塞）。

### F-5（P3，讨论，正确性）WebM/Matroska 同以 EBML 头判定 → .mkv 误判 video/webm

- **位置**: `lib/service.js` L472
- **事实依据**: EBML 头 `1A 45 DF A3` 同时匹配 WebM 与 Matroska；.mkv 文件（EXT_MEDIA_TYPES 映射 video/x-matroska，L452）被魔数优先判为 video/webm → `<video>` 播放兼容性差异。
- **影响**: 展示级；浏览器对 video/webm MIME 的 mkv 容器支持因浏览器而异。
- **建议**: 可选——扩展名含 .mkv/.m4v 时优先扩展名映射，或按 DocType 字节进一步区分。
- **级别依据**: P3。

### F-6（P3，讨论，安全性/可用性）fs.resolve 失败一律映射 PATH_OUTSIDE_WORKSPACE

- **位置**: `lib/service.js` L2145-2148
- **事实依据**: resolve 抛错（工作区内格式异常路径、宿主 FS_NOT_FOUND 变体）统一映射 PATH_OUTSIDE_WORKSPACE——与 attachments.js L177 既有行为一致（保持一致性的取舍），但错误码语义略粗。
- **影响**: 诊断误导（工作区内坏路径被报为越界）；fail-closed 方向安全。
- **建议**: 可选——区分"解析失败（FILE_NOT_FOUND）"与"越界"；保持与 attachments.js 一致亦可接受。
- **级别依据**: P3。

### F-7（P3，讨论，正确性）Windows 盘符大小写变体——fail-closed 误拒

- **位置**: `lib/service.js` L2138-2141
- **事实依据**: Node win32 path.relative 逐段 `===` 比较（盘符大小写敏感）——`C:\work` vs `c:\work\a.wav` 判为越界拒绝。
- **影响**: 无逃逸风险（fail-closed 方向安全）；仅当请求路径盘符大小写与 cwd 不一致时误拒合法请求（请求路径由模型/上传流程产生，实际概率低）。
- **建议**: 可选——盘符大小写归一化后再比较；不做亦可（误拒可诊断、方向安全）。
- **级别依据**: P3。

### F-8（P3，讨论，可维护性）注释与 F-1 修复需同步

- **位置**: `lib/service.js` L2110-2124（readWorkspaceFile 文档串）
- **事实依据**: 注释声称校验序列 ③ "fs.resolve/stat 校验" 与实现一致，但未提及符号链接面与"词法判定不覆盖 realpath"的已知边界；F-1 修复后注释须同步更新（含"resolve+relative 判定"表述）。
- **级别依据**: P3（随 F-1 修复联动）。

### F-9（P3，记录项，设计已知限制）工作区来源取 lastWorkspace——多会话串扰

- **位置**: `lib/service.js` L2132-2134
- **事实依据**: 与 uploadFile（Step 8）同源同限制（rememberWorkspace 最近一次 run()）；会话 A 的 L3 行打开时若会话 B 最近执行 → 读会话 B 工作区（错误文件或 FILE_NOT_FOUND）。
- **影响**: 声明推导（§4.4.2 ②），Step 8 已审查接受；本步沿用一致，记录不改。
- **级别依据**: P3（继承设计决策，非本步新引入）。

### F-10（P3，讨论项，正向）测试判别力核验合格

- **位置**: `tests/smoke.mjs` L938-1021；`tests/client-render.mjs` L811-893
- **事实依据**: F-T10/F-T11——越界断言真实覆盖服务自身守卫（mock fs 从不拒绝）；client-render 条件门均有前置无条件断言守卫；成功读路径换挂真实 readBytes 读盘 + RIFF/WAVE 魔数（smoke L965-972）。
- **级别依据**: P3（正向确认，无操作项；唯一缺口见 F-3/F-1 建议②）。

### F-11（P2，建议，可维护性）RouteFileRow ready 分支三处重复

- **位置**: `lib/client.js` L3491-3499
- **事实依据**: audio/video/download 三态重复 `el('div', { className: 'dshrouter-toolfile' }, pathText, ...)` 结构。
- **影响**: 可读性/维护性（后续新增媒体类型易漏改）。
- **建议**: 提取子渲染函数或映射表。
- **级别依据**: P2。

### F-12（P3，讨论，正确性）open() 成功判定依赖 dataBase64 非空

- **位置**: `lib/client.js` L3474
- **事实依据**: `response.value.dataBase64` 非空才走 ready 分支；服务恒返回 base64（service L2175），空串理论不可达——防御性判定正确无副作用。
- **级别依据**: P3（无操作项）。

## 5. AI 专项 5 项检查

| # | 检查项 | 结果 | 事实依据 |
| --- | --- | --- | --- |
| 1 | mock 残留 | ✅ 无 | lib/ 全文无 mock；测试夹具 mock 仅存于 tests/ |
| 2 | 硬编码返回值 | ✅ 无 | mediaType 全部派生（魔数/扩展名/客户端参数）；无写死响应 |
| 3 | 幻觉 API 调用 | ✅ 无 | remote.readWorkspaceFile 三侧注册一致（client L216 / rpc.js L164-172 / schemas.js L552-564）；blobUrlOf 用真实浏览器 API（atob/Blob/window.URL）；host 字段事实核验（F-T7） |
| 4 | 未实现 TODO | ✅ 无 | lib/ grep TODO/FIXME/XXX/HACK/console.log 零命中 |
| 5 | 过度实现 | ✅ 无 | gallery 同构为文档化裁量（§2 裁量 1）；未发现无依据的额外实现 |

## 6. 硬门槛裁决

| 门槛项 | 阈值 | 结果 |
| --- | --- | --- |
| P0 阻塞问题数 | = 0（任一 P0 即阻断） | **✗ 1（F-1）——未通过** |
| 5 维度全覆盖 | 100% | ✅（§3 全维度覆盖） |
| 每条发现标注级别 | 100% | ✅（F-1~F-12 均含 P0~P3 + 位置 + 事实依据 + 建议） |
| 设计一致性检查 | 已完成 | ✅（§2 全表含五处裁量 + R9-F-11 核验） |
| AI 专项 5 项检查 | 全部完成 | ✅（§5） |
| 事实红线 | 未验证标"未验证" | ✅（测试运行事实 F-T1 标 Coordinator 提供；宿主事实 F-T3/F-T7 为源码实读） |

## 7. 终态

**`NEEDS_CHANGE`**（非终态）

- **阻塞项**: F-1（P0）——readWorkspaceFile 符号链接/联接逃逸：词法边界判定不覆盖 fs.resolve realpath 解析后的真实路径，工作区内符号链接/联接可指向并读取工作区外 ≤25MB 文件（宿主 fs 读面无沙箱兜底，机制经宿主源码逐行验证）。
- **返工范围**: F-1（P0 必改）+ F-2/F-3/F-11（P1/P2 原则本轮或申请遗留并记录计划）。
- **复审触发**: Coordinator 安排 Developer 返工后发起 R13 复审（逐条比对 F-1~F-12）。
- **其余确认项**: 设计一致性全部达成（含五处裁量 + R9-F-11 核验通过）；wire 契约三方一致；21 新断言判别力合格；测试全绿（Coordinator 提供）；AI 专项 5 项无发现。
