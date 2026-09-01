# Review — EVO-012 批二 R1（输入回显消除 + url 推导自愈 + 会话产物集合视图）

- **Round**: R1
- **Task**: EVO-012 批二——用户复验批一不通过（imageData rejected 仍在）+ 输入图回显质疑，RCA 收敛同根因（chat 三通路结果回显的输入图无 url → 旧 RPC → rejected）；三修合一：B 输入回显消除 / A url 推导自愈 / C 会话产物集合视图
- **Commits**: `1f08e18` + `120c058`，base 53cbb80（批一 6d12289/9b751a1 已审）
- **前轮引用**: `.governance/review-report-EVO-012-R0.md`（R0：P2-1 url 白名单纵深建议 + P3-1~4）
- **审查者**: Code Reviewer（R1）
- **日期**: 2026-08-31
- **范围说明**: 纯只读 + 本报告文件；无命令面；门控采信 Coordinator（16/16 两轮复跑）。

## R0 findings 逐条比对

| R0 项 | 状态 | 证据 |
|---|---|---|
| **P2-1**（RouteImage directUrl 无客户端白名单二次校验） | **未修复（台账延续）** | `lib/client.js:3747-3751` directAssetUrlOf：url 分支（:3748）仍直接返回 `ref.url` **无校验**——R0 建议未落地；attachmentId 推导分支（:3749）有 encodeURIComponent + 服务端 isAttachmentId 白名单兜底（非 sha256 id → 推导 url → 404 → onError → RPC 回退——天然边界 ✓）。攻击面评估不变（sub-agent 伪造 marker 外链 url——增量泄露≈0，信任面重叠）——延续 R0 台账（建议级，不阻塞） |
| P3-1（404 显式 no-store） | 未修复（讨论项延续） | — |
| P3-2（ATTACHMENT_ID_RE /i 大小写） | 未修复（讨论项延续） | — |
| P3-3（断言计数口径） | 延续 | 本批同样存在：声称「6 RED 断言」vs 实测 smoke B 4 条 + client-render A ~4 条 + C 5 条 ≈ 13 条 check——口径未核准 |
| P3-4（无鉴权暴露留档） | 未修复（讨论项延续） | — |

## 新引入检查

1. **A 推导的 404 往返**：无 url 的旧产物（'att-not-hash' 类非内容寻址 id）→ directAssetUrlOf 推导 url → img 加载 404 → onError → RPC——「1 次本机 404 + 1 次 RPC」vs 批一「直接 1 次 RPC」——多一次本机 404 往返（毫秒级，可接受）——P3-1 讨论（可选：客户端内联 sha256 正则预检跳过推导；浏览器包无该正则，需内联复制）。
2. **encodeURIComponent 正确性**：`sha256:` 冒号 → `%3A`（判别 :1070 锁定 `/router-assets/sha256%3Atv` 形状）——服务端 decodeURIComponent 还原 + isAttachmentId 校验——往返一致 ✓；含 `/` 的 id 被编码为 %2F 单段（无穿越——解码后白名单拒绝 → 404 → RPC 回退）✓。
3. **C 内存**：SESSION_GALLERY_MAX=200/会话（:3833）+ attachmentId 去重（:3840）——单会话有界 ✓；**会话销毁无清理路径**（sessionGallery.map 无删除——DSH 单会话视图下活跃会话唯一，Map 增长极慢；多会话长程累积 = 每会话 ≤200 条小对象 ref（无字节）——数量级可接受）——P3-2 讨论。
4. **C 时序**：activeId render 期锚定（:3860「render 先于工具卡 effect 回写，无时序竞态」）——论证成立（工具卡 useEffect 回写 addSessionProduct 在 render 之后执行，读取时 activeId 已锚定当前会话）✓；多会话切换按 sessionId 键隔离不串 ✓。
5. **B 反转影响面**：
   - `result.images` 消费方：grep lib 全树**零消费**（:1068 prepareChatFiles JSDoc「返回 { images, sections }」为其自身返回形状——文件准备→请求注入用，非结果回显字段——**非残留**）✓；
   - GUI 气泡：用户消息原生通道（宿主渲染）——不受工具结果影响 ✓；
   - 跨轮指代：imageMemory/rememberDispatchedImages（M6 回写不变，注释 :1419）✓；
   - 旧断言更新语义：smoke B2（:2278「无 images 键——旧代码 images 存在必败」）——**判别方向随设计反转翻转**（非放宽——新断言在旧代码下必败，判别力等价）✓；
   - 客户端 RouteAgentToolCard 仍处理 image content 块（:3899-3901 兼容旧会话）+ 集合收集排除（:4000 注释「图片 content 块是输入回显遗留——不进集合」）——兼容面完整 ✓。

## 三修核验（B/A/C）

| 修 | 证据 | 结论 |
|---|---|---|
| B 输入回显消除 | service.js 三处（:1417-1419/:3014/:3176 注释——转发图不回显、请求仍转发、跨轮记忆承担）；smoke B1-B4 判别（text 保持/无 images 键/请求体仍转发/无 product key） | ✓ |
| A url 推导自愈 | directAssetUrlOf 单点（:3747-3751）——RouteImage（:3759）与 SessionGallery（:3884/:3893）共用（P5 单点）；url 优先 → attachmentId 推导（encodeURIComponent）→ RPC 仅 onError 回退（:3770）；判别 :1070/:1071/:1106/:1110 | ✓ |
| C 会话产物集合 | sessionGallery（:3828-3845 模块级 Map + 去重 + 200 上限 + listeners）；SessionGallery（:3857-3897 按钮 → 网格 → lightbox）；slot 注册 + 判别 :1117/:1124/:1130/:1132/:1137/:1144 | ✓ |

## 维度核验（变更面）

- 正确性 ✓（三修联动：B 消除 rejected 根因——无 url 回显图不再产生；A 推导自愈覆盖旧产物；C 集合与产物路由同源）；安全性 ✓（推导分支 encodeURIComponent + 服务端白名单兜底；url 分支延续 R0 P2-1 台账）；可维护性 ✓（directAssetUrlOf P5 单点、三处注释含 EV-114 取证）；性能 ✓（url 直达零 RPC；旧产物多一次本机 404——P3-1）；测试覆盖 ✓（B 判别方向翻转 + A 推导形状 + C 五面，RED 成立——门控 16/16 两轮采信）。

## AI 代码专项 5 项（变更面）

| 项 | 结论 |
|---|---|
| mock 残留 | 无（fetch stub 显式夹具）✓ |
| 硬编码 | 无（SESSION_GALLERY_MAX 具名常量）✓ |
| 幻觉 API | 无（直接组件内实现；attachmentId/encodeURIComponent 语义核验）✓ |
| TODO | 无 ✓ |
| 过度实现 | 无（三修各承载单一关注点）✓ |

## 发现清单

| 级别 | 位置 | 发现 | 影响 | 建议 |
|---|---|---|---|---|
| P2-1（延续） | lib/client.js:3748 | directAssetUrlOf url 分支无白名单校验（R0 建议未落地） | 增量泄露≈0（信任面重叠）；防御纵深缺口 | 延续台账：url 仅放行 /router-assets/ + id 白名单（可随发布前小修批） |
| P3-1 | lib/client.js:3749 | 无 url 旧产物（非内容寻址 id）推导 url → 404 → RPC——多一次本机 404 往返 | 毫秒级本机响应，可接受 | 讨论项：客户端内联 sha256 正则预检（浏览器包限制） |
| P3-2 | lib/client.js:3828-3845 | 会话产物 Map 无销毁清理路径 | 单会话视图下增长极慢（每会话 ≤200 条小对象） | 讨论项：监听会话关闭清理（未来多会话演进时） |
| P3-3 | 计数口径 | 声称「6 RED 断言」vs 实测 ~13 条 check（B 4 + A 4 + C 5） | 口径偏差（F-5/R0 P3-3 先例延续） | 讨论项：核准口径 |

## 结论

**APPROVED_WITH_NOTES**

unresolved_blockers=0

- P0=0 / P1=0 / P2=1（延续台账：url 白名单纵深建议）/ P3=3（新引入 2 + 口径 1；R0 P3-1/P3-2/P3-4 延续）
- R0 findings 逐条比对完成（P2-1 未覆盖延续台账；P3 延续）；三修（B/A/C）全部核验通过——B 反转影响面完整（零消费方/原生通道/跨轮记忆不变/判别方向翻转非放宽）；A 推导安全（encodeURIComponent + 服务端白名单兜底天然边界）；C 内存有界（200/会话 + 去重）；判别质量与 RED 成立；AI 专项 5 项逐项有结论；无 P4-violation。
- 遗留台账：P2-1 延续至发布前小修批；P3 讨论项无关闭截止要求。
