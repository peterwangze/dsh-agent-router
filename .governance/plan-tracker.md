# dsh-agent-router — 治理计划跟踪（plan-tracker）

> Profile: **lightweight**（7 合并 Gate + 6 列精简跟踪）· 由 software-project-governance v0.74.0 于 2026-08-18 初始化（Scenario B 半途接入，existing）

## 项目配置

- **项目名称**: dsh-agent-router
- **项目目标**: 专业的事交给专业的 agent：为 DSH 主 agent 挂载可自定义的专业 agent 目录（视觉/图片生成/翻译/语音/cli 子代理），按能力标签自动路由，扩展主 agent 的多模态与多模型能力边界
- **Profile**: lightweight（7 合并 Gate + 6 列精简跟踪）
- **触发模式**: always-on
- **操作权限模式**: maximum-autonomy
- **工作流版本**: 0.78.0
- **当前阶段**: development（开发实现，6/11）
- **接入方式**: Scenario B 半途接入（existing）——前置 Gate 标记 passed-on-entry

## 项目总览

| 项目 | 当前阶段 | 总任务数 | 已完成 | 阻塞中 | 关键风险数 | 最近 Gate 结论 | 最近复盘日期 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| dsh-agent-router | development (6/11) | 37（37 终态——31 历史终态 + FIX-011/012/013、EVO-008 + REL-006/FIX-014 2026-08-30 全闭环） | 37 终态（36 已完成 + 1 关闭 DEV-001）——**v0.3.3 已发布（2026-08-30，tag v0.3.3 = e818183，GitHub Release 带 tgz）** | 0 | 1（RISK-001 活跃——主轨道 = CI 面缺） | G4 待评（v0.3.0~v0.3.3 已发布；CI 面仍缺——RISK-001） | — |

## 当前活跃事项

| 优先级 | ID | 事项 | 依赖 | 目标版本 | 状态 |
| --- | --- | --- | --- | --- | --- |
| P1 | FIX-004 | 模型能力判定缺陷根治：能力自证 + 预检可观测 + 热载替代评估 + 宿主缺陷申报 | — | v0.3.x | 已完成（6dd6e5b + R0 APPROVED_WITH_NOTES/0） |
| P1 | EVO-004 | C-3 统计 UI 面（出口②按天视图/⑤导出按钮）+ R1-F3/R2-F1/F2/F3/R8-F1/F2 遗留六修 | — | v0.3.1 | 已完成（7 commits + R0 APPROVED_WITH_NOTES/0 + 门控实测全绿） |
| P0 | FIX-006 | OAuth 代理路径修复：undici 依赖缺失 + dispatcher 版本兼容（出口①真机首联阻断） | — | v0.3.0 | 已完成（R0 APPROVED_WITH_NOTES/0——4 commits + 门控全绿 + 隔离冷装；真机 vision-2 端到端 = 出口①用户验证项） |
| — | OPS-001 | 当前目录插件安装到 DSH 宿主（离线 LocalPath：junction→开发树 + cordis.patch.yml 宿主行；用户指令 2026-08-23） | — | — | ✅ 已完成（EV-069；junction/patch/Node 解析三链验证；重启生效待用户） |
| P1 | REL-002 | v0.3.0 发布规划先行（ChatGPT 订阅接入 C-1 承载）——版本范围/门禁/里程碑/风险回滚 + 发布时点建议 | EVO-001✅ EVO-002✅ FIX-006✅ DEC-020✅ | v0.3.0 | 已完成（规划段 + M-0 闭环）——version-plan 双审 APPROVED_WITH_NOTES×2/0 + DEC-025 四项裁决入账；EV-075/076 |
| P1 | EVO-005 | 设备码授权流实现（device flow RPC）——v0.3.0 范围补齐（DEC-025 D-2a 兑现 v0.2.1 预告） | EVO-002（1455 惰性启动 + 降级链） | v0.3.0 | 已完成（R0 APPROVED_WITH_NOTES/0——协议事实 13 项对照一手源码全相符；**P1×2 绑定 M-1 MUST 闭合**：F-1 登出×兑换 TOCTOU + F-2 传输错误终态化；EV-077） |
| P1 | REL-003 | v0.3.0 M-1 候选打包（Developer 代码段）——EVO-005 P1×2 修复 + peerDeps rc.8 + version bump | EVO-005✅ DEC-025✅ | v0.3.0 | 已完成（M-1 全段：代码段 R0 APPROVED_WITH_NOTES/0 + 资产段 Release R1 APPROVED_WITH_NOTES/0 + Design R1 NEEDS_CHANGE→返工→R2 APPROVED_WITH_NOTES/0 T1 闭环；EV-078/079） |
| P0 | FIX-007 | 宿主 0.1.1-rc.2 演进回归：route_agent 图片附件链 rejected「图片加载失败」+ 整链变慢/卡住（M-2 出口①失败回路受理——GATE-1 验证即失败） | RISK-003（活性） | v0.3.0（或热修） | 已完成（b816601 RCA 先行修复 + R0 APPROVED_WITH_NOTES/0 + 08accbd F-1 P8 增补；附件链 7 格式回归看护成立；FIX-008 候选已登记——R5 目录空根因 + 附件 parity 守卫 + F-6/F-10 加固） |
| P1 | EVO-006 | GPT OAuth 实验通道转正式（DEC-026 用户裁决——仅 GPT 通道，其余方向待后续需求；v0.3.1 载体） | EVO-002✅ EVO-005✅ DEC-026✅ | v0.3.1 | 已完成（代码/审查闭环——3 commits（bf667b3 服务端语义 + 6ebe9ed 客户端 UI + a4d33cd 文档口径）+ R0 APPROVED_WITH_NOTES/0（C2 六点成立；P2×3/P3×3 台账 + M-3 无沙箱复跑绑定 v0.3.1 发布链）；门控 936/110/114/14/65/98/20/11 零回退；EV-085） |
| P1 | REL-004 | v0.3.1 发布链——EVO-006 转正承载 + R0 台账收尾（P2×3/P3×3）+ M-3 无沙箱复跑 + 版本规划/发布 | EVO-006✅ DEC-026✅ | v0.3.1 | 已完成（终态）——M-4 用户授权 Go（2026-08-30）→ E-1~E-7 全链：f7dbf5c bump+CHANGELOG（三分账 12=7+5）+ 十面复跑全绿 + 隔离冷装通过 + tag v0.3.1@5ca8b87 + push main/tag + GitHub Release + GATE-8 归档跳过（0<2）；审查链 Code R0 + Release R1 双 APPROVED_WITH_NOTES/0；EV-086/087；**发布后用户重启验证待做** |
| P0 | FIX-009 | 多模态视觉链路 P0：image-solo 经 vision agent（deepseek-official/deepseek-v4-flash-vision-exp）上游 400/1213「未接收到prompt」整轮失败 + 4xx 重试链疑（227s/0token）+ 并案「实验界面残留」（GUI 层旧 client 疑载 + settings 遗留键在案） | — | 未规划版本（热修候选） | 已完成（**全闭环含用户复验 2026-08-30**）——RCA 三案全破 + 修复 8877365 + R0 APPROVED_WITH_NOTES/0；**用户复验通过**（纯图占位接收成功）；EV-088 |
| P0 | FIX-010 | GUI 显示层 P0 回归：用户消息图片气泡不渲染——用户实证同主模型 glm-5.3 之前可显示（v0.3.0）→ v0.3.1+ 后图片消失仅剩文本标记 | — | 未规划版本 | 已完成（**全闭环含用户复验 2026-08-30**）——RCA 全实证（prestep options 快照误判，GUI 写回默认模型+重启引爆）+ 修复 020909b + R0 APPROVED_WITH_NOTES/0（P1-1 入 v0.3.2 台账）+ **DEC-027 立版**；**用户复验通过**（「气泡显示已经正常」）；EV-089 |
| P1 | EVO-007 | 账号面板 UX 调整（用户截图红字指认 sha256:75eea8e2）——A 移除「OAuth 账号（官方登录）」不可用入口区块 + B ChatGPT 订阅登录与子代理（无头 CLI）位置交换（正式通道上移醒目位） | — | 0.3.2 | 已完成（全闭环）——R1 复审 APPROVED_WITH_NOTES/0 + 12 套件实测（smoke 963）+ **用户 GUI 验证 2/3 PASS**（布局 ✓ OAuth 区块消失 ✓；点③删除按钮空态无载体以 R1 断言证据闭环——vision 识别 sha256:bcff4e35）；EV-090 |
| P1 | REL-005 | v0.3.2 发布链——FIX-009/010（多模态双修）+ EVO-007（账号面板 UX）承载 + P1-1 回落层对齐 + P2-2 测试 hygiene + README OAuth 口径收口 | FIX-009✅ FIX-010✅ EVO-007✅ | 0.3.2 | 已完成（终态）——M-4 用户 Go（2026-08-30）→ E-1~E-7 全链：d63b368 bump+CHANGELOG（三分账 5+9=14）+ E-2 十二套件全 exit0（smoke 963/0）+ E-3 隔离冷装通过（tgz 1,502,496B）+ tag v0.3.2@d63b368 + push main（4ee80e9..d63b368）+ tag + GitHub Release + **E-7 归档跳过（0<2 计数异常——13 tags 在而解析为 0，FIX-281 域新证据登记）**；审查链 R0（收尾）+R1（发布）双 APPROVED_WITH_NOTES/0；EV-091/092 |
| P0 | FIX-011 | 统计读侧 RPC 断裂修复：RouterService 实例字段 `stats`（StatsStore）遮蔽同名 RPC 方法 → typert 网关 method-unavailable → 设置页统计面板恒 0（记录/持久化正常） | — | 未规划版本（热修候选） | **已完成（终态）**——commit 52331a8 + 判别测试 21 断言（EV-094）+ Coordinator worktree 复验 + R0 APPROVED_WITH_NOTES/0（REVIEW-FIX-011-R0 机录；P3×2 台账）；用户真机验证 = 重启 DSH 后统计面板恢复 |
| P0 | FIX-012 | 文本模型发图自动多模态接管：ModelTakeover 图片条件化武装（用户裁决 2026-08-30：贴图即切、发送后保持） | — | 未规划版本（热修候选） | **已完成（终态）**——commits c3831b4 + 4f26846（镜像）+ 5f68c17（R0 P2-1 deps 修复，22 断言）+ R0/R1 双 APPROVED_WITH_NOTES/0（REVIEW-FIX-012-R0/R1 机录；P3×3 讨论级）；用户真机验证 = 重启 DSH 后文本模型贴图发送 |
| P1 | FIX-013 | 测试按钮 OAuth 400 修复：codex-responses 分支移除 max_output_tokens | — | 未规划版本（热修候选） | **已完成（终态）**——commit 5e15c43 + TDD 红→绿（EV-093）+ R0 APPROVED_WITH_NOTES/0（REVIEW-FIX-013-R0 机录；P3×1 台账）；用户真机验证 = 重启 DSH 后点「测试」 |
| P1 | EVO-008 | ChatGPT 预设默认模型 → gpt-5.6-sol/terra/luna（用户指令 2026-08-30） | FIX-012（同文件串行）✅ | 未规划版本 | **已完成（终态）**——commits 922c74f + 785dc1e（R0 P2-1 正向断言）+ R0/R1 双 APPROVED_WITH_NOTES/0（REVIEW-EVO-008-R0/R1 机录；P3×1 台账）；用户真机验证 = 重启 DSH 后新建账号默认填充 |
| P1 | REL-006 | v0.3.3 发布链——用户报障三连热修（FIX-011/012/013）+ EVO-008 默认模型承载 + FIX-014 发布 tarball 修复 | FIX-011✅ FIX-012✅ FIX-013✅ EVO-008✅ FIX-014✅ + 用户真机验证四项全过 + 发布授权 | 0.3.3 | **已完成（终态）**——E-1~E-6 全链：7fdab39 bump + e16d710 FIX-014 + 7119401 治理入仓 + e818183 F-1 修正 + 门控 15/15 + 冷装终版 IMPORT OK + R0 APPROVED_WITH_NOTES/0（机录）+ tag v0.3.3@e818183 + push main/tag + GitHub Release（tgz 1,544,611B）；归档跳过（0<2 计数异常 FIX-281 域延续）；EV-099~101 |
| P0 | FIX-014 | 发布 tarball 缺 5 个运行时必需模块：files 列表仅 7/12 lib 模块（缺 attachments/memory/prestep/stats/wrapper）→ tarball 安装后 import 必败——v0.3.0~v0.3.2 tarball 全部不可用（历史冷装只验版本未验 import；junction 安装不受影响） | REL-006（发布阻塞）✅ | 0.3.3 | **已完成（终态）**——e16d710（files 7→12 + CHANGELOG 勘误披露）+ RED→GREEN 判别 + E-3 终版独立复验 IMPORT OK + R0 审查缺口裁定可接受（静态交叉核验替代覆盖）；随 v0.3.3 发布；EV-100 |
| P1 | EVO-009 | ChatGPT OAuth 账号注册为宿主 llm 适配器——主 agent 模型选择器直接可选（用户指令 2026-08-30） | —（复用既有 OAuth 凭据链/codex-responses/代理 dispatcher + wrapper 适配器注册先例） | 0.4.0 | **开发+审查完成；真机验证受阻→FIX-015 承载修复**——RCA 实锤（catalog 探活 2026-08-31）：oauthAccounts.chatgpt models=[]（订阅登录卡模型输入框未保存）→ modelsOf=0 → 适配器静默不注册（与重启无关）；用户侧动作 = 订阅登录卡保存模型列表（settings/updated 热同步立即注册，无需重启）；EV-103 |
| P1 | FIX-015 | EVO-009 真机验证失败防御链：静默不注册可观测 + 幽灵卡过滤 + 实预填（placeholder 幻觉根治）+ 保存读写对称（数据丢失根因修）+ models 写路径防缩小全覆盖 | EVO-009（验证失败 RCA）✅ | 0.4.0 | **已完成（终态）**——5 commits（e170cf2 warn 去重/fef785b 幽灵卡+空提示+c9a8deb 实预填+防呆/86fb209 读写对称根因修/af6a1f8 防御盘点 6 路径+取证留档）；门控 16/16（smoke 8 条 FIX-015 断言）；R0 APPROVED_WITH_NOTES/0（机录；7 关注点全核验 + 独立 grep 复核盘点一致；P3×4 台账）；**用户元批评采纳留档：RCA 归因纪律——先证据后结论，用户操作假设必须显式标注（取证注释在 client-render FIX-015 块头）**；用户已重存三件套 + /model 验证两组出现（EVO-009 功能面最终确认） |
| P0 | FIX-016 | EVO-009 适配器 tools 映射缺陷：宿主真实 tool 形状转换丢 name → HTTP 400 Missing tools[0].name（真机首用即炸） | EVO-009（真机首用报障）✅ | 0.4.0 | **已完成（终态）**——a410a52（mapTools 顶层 Responses API 形状 + 真形状判别 F16-1~5，RED checkout 旧代码必败）；根因取证三方行号印证（dsh-tools defineTool / dsh-system-prompt :254-258 / dsh-llm-pi-ai toolsOf）；门控 16/16（oauth-main-model 40 断言）；R0 APPROVED_WITH_NOTES/0（机录；取证链实读印证 + 完整性抽查；P3×2 台账）；待用户重启复验（luna 发图） |
| P0 | FIX-017 | EVO-009 multi-turn 映射层级错误：function_call 嵌入 message content → HTTP 400 Invalid value 'function_call' | FIX-016（复验揭出下一层）✅ | 0.4.0 | **已完成（终态）**——6b2ada3（契约三方取证 + assistant flush 语义 + RESPONSES_CONTENT_TYPES 常量 + F17-1~7）；门控 16/16（47 断言）；R0 APPROVED_WITH_NOTES/0（机录；**P1-1 reasoning 回传缺口=发布门真机必验项**；P2×2=常量同源化/flush 边界断言入发布前小修批）；**用户真机复验「能跑通」2026-08-31** |
| P1 | FIX-018 | 多模态主模型贴图被多余切 twin 并走专业 agent 路由——ModelTakeover 武装条件缺当前模型能力判定 + wrapper 直传判定核查 | FIX-017（复验发现）✅ | 0.4.0 | **开发+审查终态（待用户重启复验）**——1d77817（catalog 下发 mainModelImage 复用 decideImagePrecheck 单点 + 客户端 image 来源接管能力门控，判别 RED 2 FAIL→28 绿）+ e70028c（缺陷 2 核查=证明 + adapter-parity test5 + routing G7）+ d52b716（R0 P2-2 镜像同步 hash 一致）；门控 16/16；R0 APPROVED_WITH_NOTES/0（机录；宿主取证四点独立抽验吻合；P2-1 负缓存边界 + P3×4 台账；声称偏差#2 已记录）；**hook 旁路 --no-verify 协调缺口已补正（EV-106）**；用户待复验 = 重启后 openai-codex/ChatGPT 订阅组贴图不跳组直传 |
| P1 | ARCH-003 | 宿主 responses 协议桥接调研 + 真机 PoC（用户质疑「为何不复用宿主官方实现」的回应） | — | 0.4.0（EVO-010 输入） | **已完成（PoC 绿）**——调研报告 .governance/arch-003-bridge-poc.md（判定黄→实测转绿）：凭据每请求重读（双证）/openai-codex 目录 provider 官方实现完整（含 gpt-5.6-luna/ChatGPT 头全套//codex/responses/自动刷新锁）/正确路径=目录路由不写 api+token 注入 ref；真机 PoC（settings+credentials 最小注入，token 零泄漏）：**用户验证文本+图片全正常、无中转（sha256:f24b647）**；三风险（双刷新者竞态/宿主无契约/originator 硬编码）；EVO-010 迁移待用户裁决 |
| P1 | EVO-010 | ChatGPT 主模型迁移宿主官方 openai-codex 路由——插件自动维护 provider 条目 + OAuth token 热注入（唯一刷新者）+ 手写协议层降级 fallback + P9 parity 守卫 | ARCH-003（PoC 绿）✅ + 用户裁决（2026-08-31） | 0.4.0 | **开发+审查终态（R0 NEEDS_CHANGE→返工→R1 APPROVED_WITH_NOTES/0 T1 闭环）**——4 commits（30dd55e host-route 服务端/82ae39a 通路开关 UI/3ead43f 卫生/31ab145 返工：F-1 parity 回环双 gate【RED=旧代码 240s 挂死活体】+F-2 tick 入队+F-3 ref 清理+F-4 transport 过滤+F-7 mutate 可观测）；判别 ~56 断言 + 夹具补 R0 盲区（emitEvents）；门控 16/16 两轮；REVIEW-EVO-010-R0/R1 双机录；P3×4 台账（计数口径/F-6/F-8/F-9 随发布前小修批）；**用户待重启验收**（openai-codex 组自动出现+PoC 接管+通路开关+状态行） |
| P2 | FIX-019 | 幽灵卡三形态：chatgpt-oauth 路由 id（无冒号统计键）+ openai-codex 宿主路由真条目（providers 目录来源）绕过 FIX-015 判据混入账号管理 | FIX-015（判据不覆盖新形态）✅ | 0.4.0 | **已完成（终态）**——6e456ce（chatgpt-oauth）+ 961aa13（openai-codex + 三判据单点 isPluginRouteProvider：oauth: 前缀/chatgpt-oauth/openai-codex，镜像常量注指权威单点）+ 4 消费点全覆盖；判别 6 断言 RED 两轮实测；门控 16/16；R0 APPROVED_WITH_NOTES/0（机录；twin 第四形态推演排除；P3×2 台账：twin 推演边界断言/镜像相等机械守卫） |
| — | 下一轮 | **暂停（用户裁决 2026-08-31）**——v0.4.0 全链就绪在 main（26 commits：EVO-009/010 + FIX-015~019，全部审查通过+用户验收核心面）待发布指令；发布时执行：小修批（FIX-017 P2×2/FIX-018 P2-1/EVO-010 P3×4/FIX-019 P3×2）→ bump/CHANGELOG/门控/冷装/发布审查 → tag/push/Release → reasoning 必验项；后续待用户需求（FIX-008 / C-4+C-5 / CI RISK-001 / 插件仓 FIX-281） | — | 0.4.0 | 暂停待指令 |
| P0 | FIX-020 | 生成图片内联展示失败——imageData RPC 被宿主网关 rejected（FIX-008 域升级） | EVO-011（复验最后一环） | 0.4.1 | **已关闭（并入 EVO-012——用户裁决 2026-08-31）**：imageData RPC 通道受宿主断言演进反复牵制（FIX-007 同域再现），改为插件同源 HTTP 图片路由釜底抽薪；RCA Developer 已停止（无产出损失） |
| P1 | EVO-012 | 视觉产物画布架构——插件同源 HTTP 图片路由 + route_agent 默认折叠 + 输入回显消除 + url 推导自愈 + 会话产物集合（用户提案驱动） | EVO-011✅ + 用户裁决全套（2026-08-31） | 0.4.1 | **全链终态（待用户三场景复验）**——4 commits：批一 6d12289（/router-assets/ 前缀路由 + marker url——FIX-020 承载）+ 9b751a1（折叠 + url 直达）；批二 1f08e18（chat 三通路输入回显消除——EV-114 用户质疑反转）+ 120c058（directAssetUrlOf url 推导自愈 + 会话产物「🖼 N」网格集合视图）；判别 9+9+6 RED/GREEN 三轮；门控 16/16 四轮；R0+R1 双 APPROVED_WITH_NOTES/0 机录（路由安全逐攻击形态全绿；P2-1 url 分支白名单纵深延续台账 + P3×7 台账）。用户复验 = 重启后三场景：识别无回显 / 生成直达显示 / 旧产物自愈 + 产物网格 |
| P0 | FIX-021 | directAssetUrlOf 缺宿主 attachment.id 兜底——浏览器侧 image content block 推导为空致 RPC 回退（EVO-012 复验失败真根因） | EVO-012（复验三连失败后反向穷举锁定）✅ | 0.4.1 | **已完成（终态）**——2e945f6（三字段兜底序 url>attachmentId>id + encodeURIComponent 统一出口 + RCA 教训注记双落）；判别 RED 2 断言复现用户错误按钮代码路径；门控 16/16；宿主服务 bundle 已含修复（watch 热推送验证——用户刷新即生效无需重启）；R0 APPROVED（机录——零新增 findings；id 兜底误伤面零）；**RCA 教训入档（第二次同型归因错误）：前端取证必须以浏览器侧数据形状为准，jsonl 持久化形状会误导** |
| — | v0.4.1 候选 | 路由体验优化 ×2（已记录）：①目录段同源去冗余②fetch failed 自动重试 | — | 0.4.1 | 已记录待排期 |
| P1 | EVO-011 | ChatGPT 订阅生图——codex images 专用端点直连（draw agent 绑 OAuth 生成图片，gpt-image-2） | RES-004（判定绿）✅ + 用户裁决立即实施（2026-08-31） | 0.4.1 | **开发+审查终态（待用户重启复验）**——1dd124b（能力矩阵 chat+image + runCodexResponsesImage：preset 四元组/redirect manual/代理 chatgpt.com/H3-14 错误/gpt-image 策略不静默/b64 形状校验/三埋点）+ f3268af（UI 类型化 + 镜像）；判别 16 断言（RED 15 FAIL 复现用户报错）；门控 16/16；**真实端点实测 200 + PNG 908KB（插件同款头部+代理链+只读凭据零泄漏）**；R0 APPROVED_WITH_NOTES/0（机录；端点契约防御完备/P7 净/transport 正交；P3×3 台账：b64 上限/quality 校验/扩展尺寸）；用户复验 = 重启后 draw agent 生「鸣人决斗图」内联出图 |

### 最近完成

| 已完成任务 | 完成日期 | 摘要 |
| --- | --- | --- |
| REL-004 | 2026-08-30 | v0.3.1 发布全链终态（M-4 Go → E-1 bump/收口 f7dbf5c + 十面复跑全绿 + 隔离冷装通过 + tag v0.3.1@5ca8b87 + push + GitHub Release + 归档跳过；Code R0 + Release R1 双 APPROVED_WITH_NOTES/0；EV-086/087） |
| EVO-006 | 2026-08-29 | GPT OAuth 转正闭环（DEC-026 C2 全落地：开关废弃 + 门控链移除 + kill-switch ②层补全 + UI/i18n 转正 + 文档口径；3 commits + R0 APPROVED_WITH_NOTES/0；八套件零回退——smoke §6 沙箱待 M-3；EV-085） |
| FIX-007 | 2026-08-29 | 宿主 rc.2 附件链回归闭环（b816601 RCA 修复 + R0 APPROVED_WITH_NOTES/0 + 08accbd P8 增补；934 ok 零回退 + 真实 rc.2 隔离 7 格式全绿；R5 目录空/F-6/F-10 → FIX-008 候选；EV-080~083） |
| REL-003 | 2026-08-28 | v0.3.0 M-1 全段终态（代码 5 commits R0 通过 + 资产 6 文件三审链 R1×2+R2 T1 闭环 + GATE-4/5/7 实采全绿 + 81 commits 三分账；EV-078/079） |
| EVO-005 | 2026-08-27 | 设备码授权流终态（3 commits 协议原语/RPC 装配/客户端分支；R0 APPROVED_WITH_NOTES/0 协议 13/13 溯源相符；P1×2 绑 M-1 MUST；EV-077） |
| REL-002 | 2026-08-27 | v0.3.0 发布规划先行段（version-plan 八节 + 双审 APPROVED_WITH_NOTES×2/0 + M-0 四项裁决 DEC-025 入账；EV-075/076） |
| FIX-006 | 2026-08-27 | OAuth 代理路径修复终态（undici ^7.18.0 同 major 对齐 + major 判别 fail-loud + rc.8 漂移目击对齐 + parity F2；R0 APPROVED_WITH_NOTES/0；门控全绿 + 隔离冷装；EV-072/073） |
| GOV-004 | 2026-08-27 | 治理升级 0.76.0→0.78.0（/governance Scenario C：三处版本行 + 前序会话记录入仓 f8e9890 + FIX-006 过期锁清理 + 归档检测跳过；EV-071） |
| OPS-001 | 2026-08-23 | 当前目录插件安装到 DSH（install.ps1 -LocalPath . @ 8938a54=v0.2.1+62：junction ~/.dsh/profiles/node_modules/dsh-agent-router + cordis.patch.yml router/tool-router 行；EV-069；重启生效） |
| GOV-003 | 2026-08-23 | 治理版本同步 0.75.0→0.76.0（三处版本行 + 快照 28c 修复 + 归档检测跳过 + 锁检查；EV-070） |
| FIX-005 | 2026-08-23 | 条件化引导（a484469 + R1 APPROVED_WITH_NOTES/0；EV-064/065） |
| FIX-003C | 2026-08-23 | FIX-003 R1 遗留三修（0782516 + R1 APPROVED/0；EV-056/057） |
| FIX-003 | 2026-08-22 | 多模态路由失效热修全链闭环（b6581c5 + 用户真机验证；EV-053/054/062/063） |
| EVO-003 | 2026-08-23 | C-3 统计持久化 Phase 1+2（1199c0b/c2d01ea；EV-039/042/051/052） |
| EVO-002 | 2026-08-23 | C-1 OAuth 实施 Step 1-7（R1-R8；EV-048/050/058/059） |

## 待办与决策项（非任务项——18c/18d/18e 不判定域）

- ~~**FIX-003 宿主验证**~~（✅ 已关闭 2026-08-23——EV-063 用户验证通过）
- ~~**出口①真机首联**~~（✅ 已关闭 2026-08-29——EV-081 用户真机 OAuth 登录+通用子 agent 调用成功）
- ~~**出口③设备码流排期**~~（✅ 已关闭——设备码实现随 EVO-005/v0.3.0 发布；**真机降级路径验证**为可选用户动作，随时可做，无排期依赖）（S-1 清账 2026-08-30）
- ~~**v0.3.0 发布时点**~~（✅ 已关闭 2026-08-29——v0.3.0 发布 EV-084；v0.3.1 亦已发布 2026-08-30 EV-087）
- ~~**EVO-003 UI 批次**~~（✅ 已关闭——EVO-004 承载完成随 v0.3.0 发布）
- **v0.3.1 发布后用户验证**（用户动作）：DSH 宿主重启后验证 GPT OAuth 正式通道 UI（无实验面）+ 版本号 0.3.1——用户已裁决发布完成后一次重启
- **插件仓缺陷申报**（✅ 已申报 2026-08-27）：FIX-281 批次入账（插件仓 TRIAGE-FIX-281 机器记录 + tracker 行——9 项：Check 30 历史格式迁移 / Check 1 轻量表解析 / 活跃任务节边界 / Gate 节名括号 / review_record 覆盖风险 / EV-EVD 前缀 / tpa 完成态过滤 / 30c 溯源分类 / change-triage 版本校验混用）；版本定位随 DEC-172 后续裁决（0.78.1 PATCH 修复面 / 0.79.0 MINOR 判定面）——修复在插件仓会话执行
- **M-1 打包 MUST 闭合清单**（✅ 全部闭合 2026-08-28——REL-003 终态）：①EVO-005 F-1/F-2（dcd44fa/6dbe57d，R0 验证闭合）②REL-002 ReleaseF-1/DesignF-1/2/3（资产段 R1 前修正）③DEC-025 落实面（peerDeps rc.8 d78dc00 + 披露面 CHANGELOG/README）④三件套 + CHANGELOG 双主题 + bump（850b30c）⑤tarball 隔离冷装（GATE-5 EV-078 通过）——遗留观察项：R2 N-1 version-plan 快照 M-4 刷新 + N-2 断言数 EV 留痕模板（本 EV-079 已补 918 权威值）

## Gate 状态跟踪

> lightweight profile：7 个合并 Gate（覆盖 11 阶段）

| Gate | 覆盖 | 状态 | 通过日期 | 关键证据 |
|---|---|---|---|---|
| G1 | 立项→调研 | passed-on-entry | 2026-08-18 | README 项目目标/安装文档成熟（EV-001） |
| G2 | 调研+选型→设计 | passed-on-entry | 2026-08-18 | docs/architecture.md + 五层架构设计定稿 commit 8bedfcc（EV-001） |
| G3 | 设计→开发 | passed-on-entry | 2026-08-18 | lib/ 7 模块落地、76 commits、8 个发布 tag（EV-001） |
| G4 | 开发+测试→CI | pending | — | — |
| G5 | CI→发布 | pending | — | — |
| G6 | 发布→运营 | pending | — | — |
| G7 | 运营→维护 | pending | — | — |

## 任务跟踪

> lightweight profile：6 列精简跟踪

| ID | 阶段 | 任务项 | 目标/预期结果 | 状态 | 优先级 |
|---|---|---|---|---|---|
| FIX-004 | development（架构缺陷根治——用户 2026-08-23 指出） | 模型能力判定缺陷根治：能力自证 + 判定缺失可观测 | **问题定性（用户质疑成立）**：①宿主 pi-ai 自定义 provider 模型能力缺省 `DEFAULT_INPUT=["text"]`——视觉能力不自动探测纯靠声明（settings 需手写 `input: [text, image]`），宿主无 settings 热载（adapters 构建时快照，lib/index.js:1527 registration() 无 watch/reload——**配置改后必须重启**）；②插件预检 service.js:1172 纯信宿主 `resolveModelInfo`，宿主判定缺失时无自证路径（插件自己知道 qwen3.7-plus 可看图——README L125 实测 + D9 测试）、无观测、静默拒绝（R2-F3 吞错零观测同型）。**目标**：①插件能力自证——宿主判定缺失/不确定时走自证路径（运行时探测/已验证能力表——P5 泛化禁白名单硬编码）②预检失败可观测（诊断事件而非静默）③评估宿主重启需求的可替代手段（如插件侧 refresh 入口/缓存失效，若宿主 API 不可达则明示重启必要——如实边界）④decision-log 记录宿主层缺陷申报（不可根治面） | **已完成（终态）**——6dd6e5b（+174/-9 仅 2 文件：service.js decideImagePrecheck/recordCapabilityEvent + routing-paths [X] 节）+ R0 APPROVED_WITH_NOTES/0（review-FIX-004-R0；114/114 + smoke 857/0 零回退）；P1-1 台账（宿主 resolveModelInfo 抛错+自证不可用窄边界→误诊纯文本拒图——合规但建议后续区分 undetermined）/P2-1（P9 残留单信面 host-declared，非本轮引入）/P2-2（测试桩复位 try/finally 防御）/P3×3；热载面评估结论=无需修改（sourceAcceptsModality 60s TTL 缓存失效等价 refresh）；DEC-024 宿主申报入册 | P1 |
| FIX-005 | development（用户 2026-08-23 提案——条件化引导） | route_agent 引导/注入按主模型能力条件化（原生多模态不注入引导） | **问题定性（用户洞察 + 源码确认）**：prestep reminder（prestep.js L195-196/L225）**无条件注入**"请调用 route_agent…"——即使主模型原生多模态（逃生组改写 L214-216 已按能力分级保真直传，但 reminder 漏分级）→ 主 agent 被引导自主调用 route_agent（截图 429 误调实锤；本轮系统提示引导我 route_agent 亦为活例）。**用户裁决（2026-08-23 三选一）**：**条件化引导**——①prestep reminder 按能力分级（accepts=true → 不注入；纯文本 → 现状强制引导——C-3 图丢失防护）；②tool.js route_agent 描述中性化（注明"主模型已原生看图；仅专业深析/跨轮旧图/用户显式要求时用"）；③service.js 系统提示目录段同步中性说明；跨轮指代/专业深析能力**保留**；判定复用 sourceAcceptsModality 单点（P5 泛化禁复制）；P8 变更可观测 | **已完成（终态）**——a484469 + R1 APPROVED_WITH_NOTES/0（EV-064/065：108/108 + 856/0；P3 纯文本零变化/P5 单点复用/P8 无新增沉默面验证通过）；P2×2 台账（F-1 prestep 63 行/F-2 探测失败回落判别用例）+ P3×4；用户实测：原生多模态零引导（read_image 全程未触发 route_agent） | P1 |
| FIX-003C | development（收尾批次） | FIX-003 R1 遗留三修（F-1/F-2/F-3） | F-1 dshHomeAttachmentsRoot env 缺省回退补 .dsh（1 行，与注释及宿主默认一致）；F-3 哈希兜底分支与环境 fallback 补 B13c/d/e/f 四断言；F-2 probeImageDimensions VP8X off-by-N（24→30）修正 | **已完成（终态）**——0782516 + R1 APPROVED/0（EV-056/057，F-1/F-2/F-3 全闭，G-1~G-3 P3）；routing-paths 102/102 + smoke 849/0；FIX-003 遗留清单 F-1~F-3 清零（F-4~F-8 P3 保留）；N-extra P3 台账（B6 未知 id 路径真实目录只读探测——测试隔离可选加固，非阻塞） | P1 |
| FIX-003 | development（P0 热修） | 多模态路由失效 + 附件链 + 气泡图片消失（宿主 21:28 静默重装同型事件） | 用户 2026-08-22 21:35 报：①route_agent 视觉调用收不到图（includeImages 未达/attachmentIds "未注册且宿主无法读取"/files 被"模型不支持图片输入"拒绝）②界面气泡总图片消失。**RCA 事实链（Coordinator 侦察）**：附件对象落盘完好（56.7KB PNG 21:34:47，`~/.dsh/attachments/v1/objects/f3/...`，魔数 PNG）；插件前置预检 lib/service.js:1174 因宿主 `resolveModelInfo().inputModalities` 不含 image 拒绝（settings 配置未变：vision=opencode-go-new/qwen3.7-plus，qwen3.7-plus 曾实测可看图——README L125）；**宿主 dsh-llm 0.1.1-rc.2 npx cache 目录修改时间 21:28:23**（FIX-001 06:05 静默刷新同型，RISK-003 域）→ 能力探测与附件注册接口行为回归。修复方向由 Developer RCA 定（能力判定降级/目录重探测/附件注册兼容），验收 = vision 带图调用恢复 + 气泡图片恢复 + routing-paths 95/95 零回退 | **已完成（全链闭环）**——RCA 三环 + b6581c5 + settings 声明修复（EV-053）+ R1 APPROVED_WITH_NOTES/0（EV-054）+ 遗留三修清零（FIX-003C EV-056/057）+ **GUI 模型配置陷阱修复（EV-062：settings models 覆盖内置声明 + ?? [text] 兜底判 text-only）+ 用户真机验证通过（EV-063："已经解决"）**；宿主缺陷申报（GUI 写回丢能力声明）→ FIX-004 输入 | P0 |
| RES-001 | research（并行活跃） | 多模态路由机制重新调研 | 定位两个问题并产出修正方案（问题①三机制复合体；问题②四丢失点 LP-1~LP-4）+ 3 方案候选 C1/C2/C3 | 已完成——审查 APPROVED_WITH_NOTES（review-RES-001.md，0 BLOCKING） | P0 |
| RES-002 | research（并行活跃） | 通用附件路由框架调研（DEC-005） | ① dsh-vision-router 原生展示与"图片轮=工具调用轮"机制解剖；② DSH 宿主附件能力盘点（image/audio/video/text）；③ 与本项目现状差距分析 + 通用化架构输入（模态无关路由） | 已完成——审查 APPROVED_WITH_NOTES（review-RES-002.md，0 BLOCKING/4 WARNING 引用精度级） | P0 |
| ARCH-001 | architecture（并行活跃） | 通用附件路由框架架构 v3 设计稿（DEC-007） | 基于 v2 架构 + 两份调研产出 v3 设计：不变量重写、preserveImageInput、三通道感知、imageMemory、三级展示、附件统一编址、F11 输入入口、移除清单、模态矩阵、迁移路径、成功标准候选（D-1 定稿用） | 已完成——R1 NEEDS_CHANGE（B-1+W-1~4）→ 返工 → R2 APPROVED_WITH_NOTES（unresolved_blockers=0；review-ARCH-001-R2.md） | P0 |
| MIG-001 | development | v3 迁移实施 Step 0-10（DEC-012） | 按架构 v3 §8 迁移路径逐步实施：Step 0 基线测试 → Step 1 移除整轮路由 → … → Step 10；每步独立提交+测试全绿；验收门 = D-1 五条指标（DEC-012） | **已完成**——Step 0-10 全 13 单元闭环（7cb2024/b7261d5/a23b338/374edfa/f89b8bd/f294c3c/98f04a3/2c4b194/1f17ea8/12a8c71/e88dfb2/0554c5d + Step 10 本提交）；R1-R14 审查链全通过（含两次 NEEDS_CHANGE→返工→复审闭环）；EV-011~023；V-DSH-1/2/3/7 闭环（1/2/7 验证成立/可用，3 证伪走原生兜底）；**D-1 门判定：满足×2（恒主模型/编址往返 100% 自动化）+ 部分满足×2（图片到达/跨轮指代——机制面 100% 端到端待实测）+ 待实测×1（触发率——U-3 真实统计）**；观测脚本 tests/metrics.mjs（31 项）；遗留转后续域：R14-F-01 测试卫生（DEV-002）+ P3 记录项 + D-1 待实测项（真实使用后评估）+ R4 F-1/F-2 | P0 |
| DEV-001 | development | v0.1.8 行为基线回归验证 | 跑通 tests/smoke.mjs + client-render.mjs，记录 whole-turn 图片路由默认化（c2648d2/963b4f5）后的基线输出 | **已关闭（DEC-017，2026-08-20）**——基线对象（整轮路由行为）已随 v3 Step 1 移除；534 smoke 断言 + 31 项 D-1 观测构成现行基线；"基线观测常态化"并入 DEV-002 范围 | P2 |
| DEV-002 | development | 核心通路自动化测试补强 | routing/takeover 关键路径具备可重复测试（当前仅 4 个冒烟测试文件） | **已完成（终态）**——tests/routing-paths.mjs 95 断言（3e0e2b5，EV-047）+ Test Reviewer R1 APPROVED_WITH_NOTES/0（EV-049；16 条抽查/突变矩阵 4 项精确吻合/边界 5 类）；P3 台账 T1-T6；RISK-001 主轨道关闭条件①达成 | P1 |
| DEV-003 | release | v0.2.0 发布收尾（DEC-015 升级） | 版本 bump 0.2.0 + CHANGELOG（v3 迁移全量记录）+ README 徽章/安装命令同步 + tarball 离线安装验证 + tag v0.2.0 + 归档触发检测 | **已完成（本提交=v0.2.0 发布提交）**——Release agent 三件套 + Developer bump/README + Release Reviewer APPROVED（W-1 有条件发布裁决入 risk-log，48h 观察期义务 DEV-001/002 关闭决策；W-3 回滚范围表述已修正）；tarball/tag 随本提交执行 | P1 |
| GOV-001 | development（治理快速通道） | 项目质量原则固化与持续改进机制建立 | 7 条原则 + 4 条编程要求立版（project-principles.md P-v1，含执行锚点映射）+ AGENTS.md 会话投影 + 持续演进协议（decision-log 入账制 + P-vN 版本化，质量基线只升不降） | **已完成**——DEC-016 决策入账 + EV-025 证据入账；check-governance 28 issues 经事实核查均为 pre-existing（插件仓自审计误期望 + 历史复审命名约定），无 GOV-001 引入项；原则文本与用户 2026-08-20 会话指令逐字一致 | P1 |
| GOV-002 | development（治理快速通道） | 治理工作流升级 0.74.0→0.75.0（/governance Scenario C） | bootstrap 段版本行更新 + plan-tracker 版本行 + 归档触发检测 + 过时锁释放 + tracker 去重卫生（FIX-001 重复行/FIX-002 陈旧行） | **已完成**——AGENTS.md @bootstrap-version 0.75.0（轻量模板 diff 仅版本行）；归档检测：跳过（已发布版本 0<2）；EV-038 | P1 |
| GOV-003 | development（治理快速通道） | 治理工作流升级 0.75.0→0.76.0（用户选定 2026-08-23） | bootstrap 段版本行更新 + plan-tracker/快照版本行 + 归档触发检测 + 过时锁检查 + 快照 28c 事实源修复（**工作流版本** 中文键对齐 FIX-105 正则） | **已完成**——三处版本行 0.76.0 一致（AGENTS.md @bootstrap-version + plan-tracker **工作流版本** + 快照 **工作流版本**）；轻量模板 diff 仅版本行（项目质量原则 P-v2 投影段为本项目自有，保留）；归档检测：跳过（已发布版本 0<2，与 GOV-002 先例一致）；锁检查：仅 FIX-006 在途锁（TTL 过期，保留至重派刷新，无终态残留锁）；EV-070 | P1 |
| GOV-004 | development（治理快速通道） | 治理工作流升级 0.76.0→0.78.0（/governance Scenario C） | bootstrap 段版本行 + plan-tracker/快照版本行三处同步 + 归档触发检测 + 过期锁清理 | **已完成**——三处版本行 0.78.0 一致（AGENTS.md @bootstrap-version + plan-tracker **工作流版本** + 快照 **工作流版本**）；轻量模板 L195-255 diff 仅版本行（GOV-003 先例延续）；归档检测：跳过（已发布版本 0<2）；锁清理：FIX-006 三锁 TTL 过期（elapsed 381520s）释放——Check 26 3 blocking 消除，重派时重取；前序会话治理记录入仓（f8e9890）；EV-071 | P1 |
| REL-002 | release（v0.3.0 规划先行——用户裁决 2026-08-27） | v0.3.0 发布规划：版本范围（C-1 全量 + W-5/S-3 绑定）/ 发布门禁（出口①用户端到端 MUST + 全量测试网基线 + tarball 离线验证）/ 里程碑 M-0~M-8（DEC-143 授权点）/ 风险与回滚（kill-switch 三层 + RISK-001 CI 面披露）/ No-overclaim 边界 | **规划段完成（待 M-0）**——TRIAGE-REL-002 机器入账（注：--version 实际目标 v0.3.0，版本校验混用 = FIX-281⑨ 活体第三现）；Release Agent 产出 version-plan-v0.3.0.md（零真实环境操作——R1 以零操作事实满足）→ Release Reviewer R0 APPROVED_WITH_NOTES/0（F-1 P2 三件套先例归属失准→M-1 必改 + F-2/F-3 P3 + F-4 机制观察：execution-packets REL-002 占位 = FIX-281⑨ 同源）+ Design Reviewer R0 APPROVED_WITH_NOTES/0（F-1 GATE-5 挂点断链/F-2 出口①失败回路/F-3 pnpm-lock 安装面时变 P2×3→随 M-1 闭环 + P3×5；蓝军 6 条；零编造抽查 13/17 全相符含 D-2 源码核验）；REVIEW-REL-002-R0 ×2 机器行（CLI 单文件碰撞限制——canonical wrapper 为 Release 侧，两份完整报告持久化 .governance/review-REL-002-{DESIGN,RELEASE}-R0.md，同 task/round 双审覆盖 = review_record.py:327/335 设计限制，FIX-281⑤ 同源观察）；M-0 裁决 D-1~D-4 呈报用户后进 M-1；**M-0 已裁决（DEC-025，2026-08-27）：D-1a 并入 / D-2a 设备码补实现（EVO-005 入账）/ D-3a 带披露发布 / D-4b peerDeps rc.8**——EV-076 | P1 |
| EVO-005 | development（v0.3.0 范围补齐——DEC-025 D-2a） | 设备码授权流实现（device flow RPC）——兑现 v0.2.1 CHANGELOG:29 公开预告 | ①设备码流端到端：1455 被占时用户走设备码 URL 授权 → 轮询/兑换 token 落盘（owner-only）→ 账号卡可见；②判别测试（1455 空闲优先/被占降级设备码双路径断言）；③smoke 全量零回退；④Code Reviewer 独立审查；⑤CHANGELOG 兑现预告表述。现状事实（双审源码核验）：全 lib 仅 oauth-credentials.js:54-58 三处 deviceUrls 常量，零 oauthDevice* RPC；工作量未量化（Design F-5——Developer RCA 时补估算：reference dsh-codex-connect 设备码端点形状 + 1455 冲突探测分支） | **已完成（终态）**——3 commits（6355eb7 协议原语 H3-11 一手落地 + 单测 17 / 65e7e34 RPC 装配：降级触发 + pollDeviceLoop 状态机 + exchangeDeviceCode 兑换 + persistPresetLogin 提取（逐字等价核验成立）+ C-9 埋点 + W-5 登出联动 + smoke 集成块 / d49ed4c 客户端 device 分支）+ Code Reviewer R0 APPROVED_WITH_NOTES/0（REVIEW-EVO-005-R0 机器行；协议事实 13/13 相符 + kill-switch 门控纯粹性成立 + 4b 断言改写 = 授权语义落地 + 越域 3 处裁量正当（已补录 triage files）；P4 账目 908=873+19+16 静态核验吻合）；**M-1 MUST 闭合清单：F-1（P1 登出 TOCTOU——persist 前 cancelled 复查一行修）+ F-2（P1 传输错误退避重试 + reason 区分）+ F-1 竞态判别测试**；F-3（P2 设备码失败客户端可见性）→ catalog 状态面演进域；F-4~F8 P3 台账；EV-077 | P1 |
| EVO-001 | development（v0.3.0 前置） | H2 运行时 PoC（C-1 实施第一步门禁，DEC-020） | 独立测试 profile 安装 yoke233/dsh-openai-codex-auth → 用户在场登录 ChatGPT → P1-P6 六步验证（凭据落盘 owner-only/用量面板/带图对话/token 过期自动刷新/失败形态样本/登出清理）；附加 V-EVO-2b（stream:false 直测）+ V-EVO-2c（originator 观测） | **已完成——PoC 六步全过**（EV-028）：P1 登录端到端（Plus 识别）/P2 用量 21%/P3 SSE 12 事件 POC-OK/P4 rotating+软轮换宽限窗/P5 失败样本×4/P6 全清+Codex CLI 隔离。**H2=可行，C-1 解锁（复杂度 L 确认）**。附加：V-EVO-2b 证伪（走 SSE 聚合）/V-EVO-2c 通过（自标识被接受）/代理发现（chatgpt.com 需代理 7890，auth 直连）/gpt-5.4 系支持 image 输入 | P0 |
| EVO-002 | development（v0.3.0） | C-1 ChatGPT 订阅 OAuth 实施（ADR-005） | 按 evolution-roadmap-v1 §3 实施：schemas preset/credentialFile/oauthExperimental → lib/oauth-credentials.js → 1455 loopback → oauthBegin/Exchange preset 分支 → runOauthChat codex-responses 分支 → 账号卡 UI + ToS 确认 + 登出删除（含 W-5 删账号联动凭据清理）→ C-9 埋点；每步独立提交 + Code Reviewer 审查 + 534+ 断言零回退；~18 改造点/~1140 行 | **已完成（全任务终态）**——Step 1-7 全闭环（R1-R8 审查链；Step 6/7: R7/R8 APPROVED_WITH_NOTES/0，EV-048/050/058/059）；R7 遗留全清（F1-F5 + R6-F1）；W-5 三层防线；**DEC-022-D 用户裁决废弃（2026-08-23）**；遗留转 UI 批次：R8-F1 判据统一 + R8-F2 注释修正 + P3×6（R7-F9 枚举延续等）；**开放决策项：出口①真机首联（用户在场——1455+代理 7890+V-EVO-3+R6-F2/F5+dispatcher×原生 fetch 兼容 + R8-F6 可选 UX 观察）与出口③设备码流排期 = 用户决策项** | P0 |
| FIX-011 | development（P0 热修——用户报障 2026-08-30①） | 统计面板恒 0（读侧 RPC 断裂） | **RCA（Coordinator 实证 2026-08-30）**：v0.3.0 EVO-003 统计迁移引入实例字段 `this.stats = new StatsStore`（service.js:673）遮蔽原型 RPC 方法 `stats()`（service.js:3172）；typert 网关 `Reflect.get(receiver, method)`（dsh-api-gateway lib/index.js:101-103）拿到 StatsStore 对象（非函数）→ `active Service "router" has no callable method "stats"`（直接调 /api/router/stats 复现；catalog/config/reset 正常）→ 设置页 2s 轮询静默失败 → 面板恒 0；记录/持久化链完好（磁盘 JSONL + index.json 实证：2026-08-30 9 calls/2 errors）。**目标**：①rpc.js ROUTER_DESCRIPTORS stats 条目加 `implementation: 'statsSnapshot'`；②判别测试遍历全部描述符断言 `implementation ?? method` 在 RouterService 实例可调用（旧代码必败）；③全量测试网零回退。验收 = 用户 GUI 统计面板恢复 | 进行中（Developer A） | P0 |
| FIX-012 | development（P0 热修——用户报障 2026-08-30②） | 文本模型发图被宿主准入拦截，不自动切多模态 | **RCA（实证）**：宿主 apiproxy prompt 准入按会话当前模型 inputModalities 拒带图消息（MODEL_DOES_NOT_SUPPORT_IMAGES → GUI Toast「当前模型不支持图片」）；插件自动接管 ModelTakeover（client.js:3230-3281）在 FIX-002 后需 `takeoverDefaultModel===true` 才武装（默认 false）→ 不再自动切 twin（`<provider>-router` 声明 image 能力→准入放行→wrapper 改写图片块为路由提示）。**用户裁决（2026-08-30 本轮 ask）**：贴图即切、发送后保持 twin（文本轮零开销委托原生）。**目标**：武装条件改为「存在启用多模态 agent 且（takeoverDefaultModel===true 或 imageCount>0）」；移除未发送时还原（takeoverMemory 命中）；发送后不还原（需区分「移除图片」与「发送清空」两种 imageCount 归零路径或引入在途轮保护——宿主「会话已含图拒绝切回纯文本」可作天然防线但需测试证明）；FIX-002 主权不回退（无图不切/手动选择尊重）。判别测试覆盖四象限 + 还原/保持路径；client-render/served-client 零回退。验收 = 用户真机：文本模型贴图发送不再被拦、模型指示切「xxx + 多模态」 | 进行中（Developer C） | P0 |
| FIX-013 | development（P1——用户报障 2026-08-30③） | 绑定 ChatGPT agent 点「测试」报 HTTP 400 Unsupported parameter max_output_tokens | **RCA（实证）**：router/test 路径强制 `maxTokens:16`（service.js:3812）→ codex-responses 分支作为 `max_output_tokens` 发送（:2881）→ ChatGPT backend-api 拒绝该参数（HTTP 400 {"detail":"Unsupported parameter max output tokens"}，用户截图实证）；实际使用 maxTokens=0→undefined→不发送→成功。**目标**：codex-responses 分支移除 max_output_tokens 条件展开（openai max_tokens :2749/:2782 / gemini maxOutputTokens :2770 不变；test 路径 :3812 强制保留——其它协议仍消费）；smoke.mjs L720 断言改为字段不存在；判别测试旧代码必败。验收 = 用户真机点「测试」返回连通正常 | 进行中（Developer B） | P1 |
| EVO-008 | development（P1——用户指令 2026-08-30④） | ChatGPT 预设默认模型列表更新 | `['gpt-5.4-mini','gpt-5.4']` → `['gpt-5.6-sol','gpt-5.6-terra','gpt-5.6-luna']`（client.js:2071）+ presetModelsHint 中英（:415/:672）+ placeholder（:1194）+ 预置注释（:2063）+ served-client.js 断言同步；已配置账号 models 不迁移不改写；CLI knownModels（service.js:127 codex 发现回退）不在范围。与 FIX-012 同文件 → 同 Developer 串行（M7.6a）。验收 = 用户真机新建 ChatGPT 账号默认填充三模型 | 进行中（Developer C，串行于 FIX-012 后） | P1 |
| EVO-003 | development（v0.3.1） | C-3 统计持久化实施（ADR-006，可与 EVO-002 并行开发） | lib/stats.js 分离（service.js 2965 基线净减 ~220）+ DSH_HOME 按天 JSONL + 异步批量 flush + 数据安全四件套单测 + 成本单价表 + CSV 导出 + W-4 persist 开关往返语义；~14 改造点/~1000 行 | **已完成（终态）**——Phase 1（1199c0b，R1 APPROVED_WITH_NOTES/0，EV-039/042，8 裁量点全 adopt）+ Phase 2（c2d01ea，R2 APPROVED_WITH_NOTES/0，EV-051/052，前置项 F1/F2/F4 闭合，4 裁量点全 adopt）；smoke 849/0 + stats 99/0 + routing-paths 95/95；遗留台账（转 UI 批次）：R2-F1/F2/F3 P2×3 + carried R1-F3 CSV 注入 + 出口②按天视图/⑤导出按钮 UI 面 + P3×4 | P1 |
| EVO-004 | development（v0.3.1 收尾批次——快照候选"EVO-003 UI 批次"入账） | C-3 统计 UI 面 + P2 遗留五修 | 范围（每项独立 commit）：①出口②按天视图 UI 面（lib/client.js——statsResult.days 按天聚合渲染 + i18n 中英字典）；②出口⑤导出按钮 UI 面（statsExport RPC 面已上线——client 按钮 + range/level 选择 + CSV 下载）；③R1-F3 CSV 公式注入防护（P2，stats.js csvEscape 补 =+-@ 前缀防护——review-EVO-003-R2:51）；④R2-F1 setPersist 并发翻转竞态（P2，stats.js L569-598——transition promise 串行化/最后写入者胜出——review-EVO-003-R2:73）；⑤R2-F2 false 期 flush 契约洞（P2，#drain 起点 `if (!this.persist) return`——:74）；⑥R2-F3 record 吞错零观测（P2，selfReport 计数——P8 同型——:75）；⑦R8-F1 删除入口判据不对称（P2，client.js 判据统一——review-EVO-002-R8:36）；⑧R8-F2 ProxyAgent 缓存生命周期无界+注释错误（P2，service.js :632/:3364-3371——:39）；验收：新增判别测试覆盖每项 + client-render/smoke/stats 全绿零回退 | **已完成（终态）**——7 commits（31a8c74③/4d08990④/a9f98b2⑤/9fd6110⑥/dd5d310⑧/d8ee97c⑦/8938a54①②）+ R0 APPROVED_WITH_NOTES/0（review-EVO-004-R0；smoke 877/0 + stats 110/0 + parity 14 + routing 114/114）；P1×1 遗留（R8-F2 close 在途中断——可重试无损坏）+ P2×3（csvEscape 未覆盖 \t/\r + record 首层 catch 不计数 + client wStats 未声明 days/selfReport）+ P3×6；范围纪律 6 文件；①②合并单 commit（交织无法拆分，Reviewer 认可） | P1 |
| FIX-001 | development（P0 热修） | twin adapter 补 prepareCall——宿主 dsh-llm prepared-dispatch 接口演进兼容 | RCA：宿主 adapterStream 每次分发先调 adapter.prepareCall，twin 手工对象字面量缺该方法 → 接管路由全量 TypeError。修复：twin 显式 prepareCall + 接口奇偶回归测试 | **已完成**——f1c4c91（EV-034）+ R6 审查 APPROVED_WITH_NOTES（EV-036）+ FIX-001b 返工 cba0d98（R6-F1 空转通过修复/F2 动态枚举/F3 增强 + 2 测试 bug；parity 首次真实运行 14 断言全绿）——终态闭环 | P0 |
| RES-003 | research | 战略对齐与演进调研（DEC-017 方向授权） | ① 目的对齐审查：当前实现 vs 插件本源目的（扩展主 agent 能力边界 / 主 agent 专注主路径 / 任意多模态 agent 扩展 / 多模态账号配置 / 无头模式调用）② 易用性+用户吸引力+粘性评估（安装/配置/统计体验现状）③ 三方向差距分析：A 账号配置易用性（api key 配置 / cli 无头模式 / oauth 一键登录——参考 opencodex / 账号池管理）；B 专业 Agent 调用成功率与交互效果（实际产出+交互界面）；C 统计专业性与持久化+安装配置体验 ④ 演进候选方向与优先级输入（供 ARCH-002） | **已完成——审查 APPROVED_WITH_NOTES**（review-RES-003.md：unresolved_blockers=0；0 BLOCKING/2 WARNING/3 SUGGESTION；40 处抽查 0 不符；W 级经 DEC-018 落实）。核心结论：未偏离目的；OAuth 从未被 DEC 否定（被否定的是 gcloud 公开 Client 路线）；Top3 = ChatGPT 订阅 OAuth（Q1 前置）→ 统计持久化（Q3 已裁 DSH_HOME+90d）→ 成功率闭环；Q4 已裁不引入免费链 | P0 |
| FIX-002 | development（P0 热修） | 默认模型接管行为修正（双层）——覆盖用户手动选择 + 中间层故障放大 | 用户报障 ×2（①切 session/起子代理时模型被强制切 twin ②文本强制走 twin 失败）。RCA：两个独立接管面均无开关——服务端 wrapper syncDefaultModel 三触发点无条件接管 + 客户端 ModelTakeover 会话级接管（effect 依赖 sessionId，起子代理即触发）。修复（用户裁决方案 A）：takeoverDefaultModel 开关默认 false 统一约束两层（服务端一次性接管+来源记忆；客户端 catalog 镜像开关+armed 条件） | **已完成（终态）**——双层实现（d264f03+5c8f2dc）→ R7 NEEDS_CHANGE（P0×1 用户主权反转缺陷）→ 批次 1（72b2670：F1 takeoverMemory 三态/F2 闭包标记/F3 判别断言）+ 批次 2（0b3c15d：F4 不变量③④断言+掏空修复）→ **R8 复审 APPROVED_WITH_NOTES/0 blocker**（EV-040/044/045；F1-F4 全修复，N1-N3 P3 遗留，F8 转发布说明）；返工载体待下版本承载（发布决策属用户）；DEC-022-D 版本指纹转 EVO-002 Step 6/7 | P0 |
| FIX-006 | development（出口①真机首联阻断——v0.3.0 发布阻塞） | OAuth 代理路径修复：undici 依赖缺失 + dispatcher 版本兼容 | **问题定性（真机实证，2026-08-23）**：①package.json dependencies 无 undici 声明——运行时代理 dispatcher（service.js:3434 `import('undici')` fail-loud 设计）在发布环境必失败（Cannot find package）——v0.3.0 发布即运行失败（P0 发布阻塞）；②本机装 undici@8.10 后 ProxyAgent dispatcher 报 `invalid onRequestStart method`——Node 24 内置 undici 7.18.2 与新装 v8 接口不匹配——代理路径完全不可用（R6-F2/F5 "dispatcher×原生 fetch 兼容"真实暴露）；实验：原生 fetch 无 dispatcher 直连 chatgpt.com → 401（网络可达）；带 ProxyAgent dispatcher → invalid onRequestStart method（版本接口不匹配）；③npm 依赖树损坏（npm install/ci 冷装均报 children null——npm 缓存已 verify/GC、pnpm 恢复中）。**目标**：①package.json 声明 undici（版本对齐策略——Node 内置 7.18.x 匹配或兼容层）②dispatcher 兼容实现（或修复装配——经代理 fetch 真实可用）③判别测试（旧代码必败：undefined undici 明确报错/版本不匹配必败——测试桩注入）④锁文件策略（package-lock/pnpm-lock 引入与发布 tarball 依赖完整性） | **已完成（终态）**——4 commits（bef08eb undici ^7.18.0 声明 + pnpm-lock 入仓 + 判别断言四件含 CONNECT 隧道实证 / 6a7ba76 loadOauthProxyDispatcher major 判别 fail-loud / 669679e admission 负向目击对齐宿主 rc.8 / 69ccf94 parity F2 契约对齐）+ Code Reviewer R0 APPROVED_WITH_NOTES/0（REVIEW-FIX-006-R0 机器行；F-1 P2/F-2 P2 已补录/F-3 P3）；门控全绿（smoke 873 ok+1 skip/0 + stats 110 + routing 114 + client-render + parity 14）+ 隔离冷装通过（TEMP + --legacy-peer-deps，tarball 含 undici）；现象③=宿主 rc.6→rc.8 滚动漂移实证（非产品缺陷）、现象④=npm 11.8.0 arborist peer 环境缺陷（正交）；EV-072/073 | P0 |
| REL-001 | release（v0.2.1） | v0.2.1 热修版本发布（承载 FIX-001/001b/002/002b） | 用户指令"发布版本承载修改"：P0 修复不等 v0.3.0。范围 = v0.2.0 以来 main 全部；含 metrics 夹具 prepareCall 补齐（发布门禁发现，D-1-2 恢复 100%）；CHANGELOG/bump/README/tag/tarball 离线验证/归档检测 | **已完成（全链）**——EV-037；tag v0.2.1（a1ab717）；tarball 离线验证 OK；**push 完成（c006639..067dde3，20 commits）+ GitHub Release 已发布**（assets 含 tarball，非 draft；用户 gh 重新授权后 Coordinator 执行）；治理记录随 067dde3 入仓 | P0 |
| ARCH-002 | architecture | 演进路径与方案设计（依赖 RES-003 结论） | 基于 RES-003 产出：演进路线图（阶段划分+版本规划建议）+ 分方向方案设计（含 oauth/账号池可行性边界）+ 风险与回滚分析；供 D-6 演进定稿决策用 | **已完成——审查 APPROVED_WITH_NOTES**（review-ARCH-002.md：unresolved_blockers=0；0 BLOCKING/5 WARNING/3 SUGGESTION；28 处抽查；独立蓝军 5 条）。产出：evolution-roadmap-v1.md（662 行）——v0.3.0~v0.3.3 四版本分期 + H3 源码级验证 16 项（Codex OAuth 全协议事实固化）+ ADR-005/006/007 + S-2 量化 + proposed DEC-020。W 级 5 处已修/3 处绑定实施任务书（W-4→v0.3.1/W-5+S-3→v0.3.0）。待 D-6 用户定稿 | P0 |

## 版本规划

### 版本路线图

| 版本 | 状态 | 预计日期 | 核心范围 | 包含任务 | 关键交付物 |
|---|---|---|---|---|---|
| v0.1.7 | 已发布 | 2026-08-17 | 多模态账号 / 用量统计 / 五种执行通路 | — | tag v0.1.7 + tarball |
| v0.1.8 | **已取消（被 v0.2.0 取代，DEC-015）** | — | whole-turn 图片消息路由默认化、附件按钮泛化、image-to-image | — | 范围被 v3 迁移架构级超越 |
| v0.2.0 | **已发布（2026-08-20）** | 2026-08-20 | v3 附件路由架构全量（MIG-001）/ D-1 验收门 | MIG-001, DEV-003 | tag v0.2.0 + tarball + CHANGELOG |
| **v0.2.1** | **已发布（2026-08-22，REL-001）** | 2026-08-22 | P0 热修承载：FIX-001/001b（宿主 prepared-dispatch 兼容 + parity 看护网）+ FIX-002/002b（双层接管用户主权，takeoverDefaultModel 默认 false）+ EVO-002 Step 1-4b OAuth 地基（kill-switch 零可见）+ metrics 夹具修复 | FIX-001, FIX-002, REL-001（EVO-002 Step 1-4b 顺带承载） | tag v0.2.1（a1ab717）+ tarball 1460KB 离线验证 + CHANGELOG；验证基线 smoke 656/parity 14/metrics 31 全绿 |
| **v0.3.0** | **已发布（2026-08-29，tag v0.3.0 = bb81abf）** | 2026-08-29 | ChatGPT 订阅接入（C-1）：preset 账号 + 独立凭据文件 + 1455 回调 + 设备码流 + codex-responses 协议分支 + Q2 per-protocol 能力接口 + 合规三层 kill-switch + C-9 埋点；**DEC-025 M-0 裁决追加**：C-3 统计（EVO-003/004）并入双主题 + peerDeps ^0.1.0-rc.8 + RISK-001 带披露；FIX-006/007 发布阻塞清除 | EVO-001✅ EVO-002✅ EVO-003✅ EVO-004✅ FIX-006✅ EVO-005✅ REL-002✅ REL-003✅ FIX-007✅ | GitHub Release 带 tarball 1,507,506B；发布决策=用户 2026-08-29（M-4）；残留披露：对话内图片附件显示层（FIX-008 候选，已知问题入 CHANGELOG）；GATE-8 归档检测跳过（已发布版本 <2） |
| **v0.3.1** | **已发布（2026-08-30，tag v0.3.1 = 5ca8b87，REL-004）** | 2026-08-30 | GPT OAuth 实验通道转正式（EVO-006，DEC-026 C2）+ R0 台账收尾（P2×3/P3×3）+ 停用拒绝遥测 | EVO-006✅ REL-004✅ | GitHub Release 带 tarball 1,507,454B；三分账 12（7 产品/5 治理）；发布后用户重启验证待做 |
| **v0.3.2** | 规划中 | 待定 | 成功率闭环（C-4+C-5）：五分类 + 预算制重试 + 诊断卡 + doctor 预检 + C-9 报告 | 待拆分（EVO-004 域） | 失败分类覆盖 + 重试预算 + C-9 实测报告 |
| **v0.3.3** | 规划中 | 待定 | 二梯队收敛：C-6 池泛化 + C-7 onboarding 向导（+C-8 官方安装通道可选） | 待拆分（EVO-005 域） | 池泛化 + 首次成功 3 分钟向导 |

### 版本里程碑

| 里程碑 | 目标版本 | 状态 |
|---|---|---|
| 多模态路由闭环 | v0.1.x | 已达成（v0.1.7） |
| 质量基线（测试回归保护） | ≥v0.2.0 | 规划中 |

### 版本 Gate 检查项

- 发布前：版本号已 bump、tarball 可离线安装、README 徽章与安装命令版本同步
- 发布后：tag 已打、治理记录已更新、归档触发检测已运行

### 版本规划纪律

- 版本范围变更走变更控制流程；临时任务先判定优先级再纳入版本
- 发布收尾必须运行归档触发检测（`python <plugin_home>/infra/archive.py migrate --auto --dry-run`，`<plugin_home>` 来自 resolve_entry.py）
- 发布复盘时 MUST 检查 `.governance/project-principles.md` 是否需要演进（P-vN，DEC-016 持续改进协议）

## 需求跟踪矩阵

| 需求 ID | 描述 | 来源 | 优先级 | 关联任务 | 当前状态 | 验证方式 |
|---|---|---|---|---|---|---|
| REQ-001 | 多模态任务按能力标签自动路由（image/speech/文本/子代理） | README 项目目标 | P0 | MIG-001（已交付 v0.2.0） | 已实现（D-1 机制面 100%，端到端待真实使用验证） | tests/smoke + tests/metrics + 真实使用样本 |
| REQ-002 | 核心通路回归保护 | 治理接入评估（EV-001） | P1 | DEV-002 | 待开始 | 自动化测试通过率 |
| REQ-003 | 战略演进三主线：账号配置易用性（api key/cli 无头/oauth/账号池）/ 调用成功率与交互效果 / 统计专业性与持久化+安装配置体验 | 用户战略指令（2026-08-20，DEC-017） | P0 | RES-003, ARCH-002 | 调研中 | RES-003 报告 + ARCH-002 方案审查 |

## 变更控制流程

临时任务纳入机制（新任务先入账再动手）：

1. **优先级判定**（P0/P1/P2）
2. **版本适配**（归入当前版本或下一版本）
3. **冲突检查**（与活跃任务文件/范围冲突 → 串行化）
4. **版本范围更新**（本文件路线图行同步）

**快速通道**：仅限治理记录类修改（`.governance/**`），可跳过 Agent Team spawn，由 Coordinator 直接执行（M1.2）。
