# 归档索引

> 自动生成，记录每个治理条目的归档位置。查询路径：条目 ID → 归档文件。
> 维护方式：归档脚本执行时自动更新。可通过 `build_index()` 重建。

---

## Task 索引

| Task ID | 状态 | 版本 | 归档文件 |
|---------|------|------|---------|
| EVO-007 | 已完成（全闭环）——R1 复审 APPROVED_WITH_NOTES/0 + 12 套件实测（smoke 963）+ **用户 GUI 验证 2/3 PASS**（布局 ✓ OAuth 区块消失 ✓；点③删除按钮空态无载体以 R1 断言证据闭环——vision 识别 sha256:bcff4e35）；EV-090 | 0.3.2 | archive/tasks/v0.1.7~v0.79.0.md |
| REL-005 | 已完成（终态）——M-4 用户 Go（2026-08-30）→ E-1~E-7 全链：d63b368 bump+CHANGELOG（三分账 5+9=14）+ E-2 十二套件全 exit0（smoke 963/0）+ E-3 隔离冷装通过（tgz 1,502,496B）+ tag v0.3.2@d63b368 + push main（4ee80e9..d63b368）+ tag + GitHub Release + **E-7 归档跳过（0<2 计数异常——13 tags 在而解析为 0，FIX-281 域新证据登记）**；审查链 R0（收尾）+R1（发布）双 APPROVED_WITH_NOTES/0；EV-091/092 | 0.3.2 | archive/tasks/v0.1.7~v0.79.0.md |
| REL-006 | **已完成（终态）**——E-1~E-6 全链：7fdab39 bump + e16d710 FIX-014 + 7119401 治理入仓 + e818183 F-1 修正 + 门控 15/15 + 冷装终版 IMPORT OK + R0 APPROVED_WITH_NOTES/0（机录）+ tag v0.3.3@e818183 + push main/tag + GitHub Release（tgz 1,544,611B）；归档跳过（0<2 计数异常 FIX-281 域延续）；EV-099~101 | 0.3.3 | archive/tasks/v0.1.7~v0.79.0.md |
| FIX-014 | **已完成（终态）**——e16d710（files 7→12 + CHANGELOG 勘误披露）+ RED→GREEN 判别 + E-3 终版独立复验 IMPORT OK + R0 审查缺口裁定可接受（静态交叉核验替代覆盖）；随 v0.3.3 发布；EV-100 | 0.3.3 | archive/tasks/v0.1.7~v0.79.0.md |
| EVO-009 | **开发+审查完成；真机验证受阻→FIX-015 承载修复**——RCA 实锤（catalog 探活 2026-08-31）：oauthAccounts.chatgpt models=[]（订阅登录卡模型输入框未保存）→ modelsOf=0 → 适配器静默不注册（与重启无关）；用户侧动作 = 订阅登录卡保存模型列表（settings/updated 热同步立即注册，无需重启）；EV-103 | 0.4.0 | archive/tasks/v0.1.7~v0.79.0.md |
| FIX-015 | **已完成（终态）**——5 commits（e170cf2 warn 去重/fef785b 幽灵卡+空提示+c9a8deb 实预填+防呆/86fb209 读写对称根因修/af6a1f8 防御盘点 6 路径+取证留档）；门控 16/16（smoke 8 条 FIX-015 断言）；R0 APPROVED_WITH_NOTES/0（机录；7 关注点全核验 + 独立 grep 复核盘点一致；P3×4 台账）；**用户元批评采纳留档：RCA 归因纪律——先证据后结论，用户操作假设必须显式标注（取证注释在 client-render FIX-015 块头）**；用户已重存三件套 + /model 验证两组出现（EVO-009 功能面最终确认） | 0.4.0 | archive/tasks/v0.1.7~v0.79.0.md |
| FIX-016 | **已完成（终态）**——a410a52（mapTools 顶层 Responses API 形状 + 真形状判别 F16-1~5，RED checkout 旧代码必败）；根因取证三方行号印证（dsh-tools defineTool / dsh-system-prompt :254-258 / dsh-llm-pi-ai toolsOf）；门控 16/16（oauth-main-model 40 断言）；R0 APPROVED_WITH_NOTES/0（机录；取证链实读印证 + 完整性抽查；P3×2 台账）；待用户重启复验（luna 发图） | 0.4.0 | archive/tasks/v0.1.7~v0.79.0.md |
| FIX-017 | **已完成（终态）**——6b2ada3（契约三方取证 + assistant flush 语义 + RESPONSES_CONTENT_TYPES 常量 + F17-1~7）；门控 16/16（47 断言）；R0 APPROVED_WITH_NOTES/0（机录；**P1-1 reasoning 回传缺口=发布门真机必验项**；P2×2=常量同源化/flush 边界断言入发布前小修批）；**用户真机复验「能跑通」2026-08-31** | 0.4.0 | archive/tasks/v0.1.7~v0.79.0.md |
| FIX-018 | **开发+审查终态（待用户重启复验）**——1d77817（catalog 下发 mainModelImage 复用 decideImagePrecheck 单点 + 客户端 image 来源接管能力门控，判别 RED 2 FAIL→28 绿）+ e70028c（缺陷 2 核查=证明 + adapter-parity test5 + routing G7）+ d52b716（R0 P2-2 镜像同步 hash 一致）；门控 16/16；R0 APPROVED_WITH_NOTES/0（机录；宿主取证四点独立抽验吻合；P2-1 负缓存边界 + P3×4 台账；声称偏差#2 已记录）；**hook 旁路 --no-verify 协调缺口已补正（EV-106）**；用户待复验 = 重启后 openai-codex/ChatGPT 订阅组贴图不跳组直传 | 0.4.0 | archive/tasks/v0.1.7~v0.79.0.md |
| EVO-010 | **开发+审查终态（R0 NEEDS_CHANGE→返工→R1 APPROVED_WITH_NOTES/0 T1 闭环）**——4 commits（30dd55e host-route 服务端/82ae39a 通路开关 UI/3ead43f 卫生/31ab145 返工：F-1 parity 回环双 gate【RED=旧代码 240s 挂死活体】+F-2 tick 入队+F-3 ref 清理+F-4 transport 过滤+F-7 mutate 可观测）；判别 ~56 断言 + 夹具补 R0 盲区（emitEvents）；门控 16/16 两轮；REVIEW-EVO-010-R0/R1 双机录；P3×4 台账（计数口径/F-6/F-8/F-9 随发布前小修批）；**用户待重启验收**（openai-codex 组自动出现+PoC 接管+通路开关+状态行） | 0.4.0 | archive/tasks/v0.1.7~v0.79.0.md |
| FIX-019 | **已完成（终态）**——6e456ce（chatgpt-oauth）+ 961aa13（openai-codex + 三判据单点 isPluginRouteProvider：oauth: 前缀/chatgpt-oauth/openai-codex，镜像常量注指权威单点）+ 4 消费点全覆盖；判别 6 断言 RED 两轮实测；门控 16/16；R0 APPROVED_WITH_NOTES/0（机录；twin 第四形态推演排除；P3×2 台账：twin 推演边界断言/镜像相等机械守卫） | 0.4.0 | archive/tasks/v0.1.7~v0.79.0.md |
| ARCH-003 | **已完成（PoC 绿）**——调研报告 .governance/arch-003-bridge-poc.md（判定黄→实测转绿）：凭据每请求重读（双证）/openai-codex 目录 provider 官方实现完整（含 gpt-5.6-luna/ChatGPT 头全套//codex/responses/自动刷新锁）/正确路径=目录路由不写 api+token 注入 ref；真机 PoC（settings+credentials 最小注入，token 零泄漏）：**用户验证文本+图片全正常、无中转（sha256:f24b647）**；三风险（双刷新者竞态/宿主无契约/originator 硬编码）；EVO-010 迁移待用户裁决 | 0.4.0 | archive/tasks/v0.1.7~v0.79.0.md |
| FIX-020 | **已关闭（并入 EVO-012——用户裁决 2026-08-31）**：imageData RPC 通道受宿主断言演进反复牵制（FIX-007 同域再现），改为插件同源 HTTP 图片路由釜底抽薪；RCA Developer 已停止（无产出损失） | 0.4.1 | archive/tasks/v0.1.7~v0.79.0.md |
| EVO-012 | **全链终态（待用户三场景复验）**——4 commits：批一 6d12289（/router-assets/ 前缀路由 + marker url——FIX-020 承载）+ 9b751a1（折叠 + url 直达）；批二 1f08e18（chat 三通路输入回显消除——EV-114 用户质疑反转）+ 120c058（directAssetUrlOf url 推导自愈 + 会话产物「🖼 N」网格集合视图）；判别 9+9+6 RED/GREEN 三轮；门控 16/16 四轮；R0+R1 双 APPROVED_WITH_NOTES/0 机录（路由安全逐攻击形态全绿；P2-1 url 分支白名单纵深延续台账 + P3×7 台账）。用户复验 = 重启后三场景：识别无回显 / 生成直达显示 / 旧产物自愈 + 产物网格 | 0.4.1 | archive/tasks/v0.1.7~v0.79.0.md |
| FIX-021 | **已完成（终态）**——2e945f6（三字段兜底序 url>attachmentId>id + encodeURIComponent 统一出口 + RCA 教训注记双落）；判别 RED 2 断言复现用户错误按钮代码路径；门控 16/16；宿主服务 bundle 已含修复（watch 热推送验证——用户刷新即生效无需重启）；R0 APPROVED（机录——零新增 findings；id 兜底误伤面零）；**RCA 教训入档（第二次同型归因错误）：前端取证必须以浏览器侧数据形状为准，jsonl 持久化形状会误导** | 0.4.1 | archive/tasks/v0.1.7~v0.79.0.md |
| REL-007 | **已发布（终态）**——E-1 5ddc849（bump+CHANGELOG+README 12 处）→ E-2 门控 17/17 → E-3 隔离冷装（import OK lib 14 模块）→ Release Reviewer R0 APPROVED_WITH_NOTES/0（机录；43 SHA 全验/no-overclaim 五点锚定；W-1 勘误 7df0810 PNG 665KB + W-2 回滚段进 notes）→ E-5 tag v0.4.1 + push + GitHub Release（2026-09-01T05:19:31Z）→ E-6 归档检查（无触发）+ EV-119~121；发布范围 e818183..v0.4.1（产品 30 + 治理 16） | 0.4.1 | archive/tasks/v0.1.7~v0.79.0.md |
| EVO-011 | **开发+审查终态（待用户重启复验）**——1dd124b（能力矩阵 chat+image + runCodexResponsesImage：preset 四元组/redirect manual/代理 chatgpt.com/H3-14 错误/gpt-image 策略不静默/b64 形状校验/三埋点）+ f3268af（UI 类型化 + 镜像）；判别 16 断言（RED 15 FAIL 复现用户报错）；门控 16/16；**真实端点实测 200 + PNG 908KB（插件同款头部+代理链+只读凭据零泄漏）**；R0 APPROVED_WITH_NOTES/0（机录；端点契约防御完备/P7 净/transport 正交；P3×3 台账：b64 上限/quality 校验/扩展尺寸）；用户复验 = 重启后 draw agent 生「鸣人决斗图」内联出图 | 0.4.1 | archive/tasks/v0.1.7~v0.79.0.md |
| FIX-022 | **已完成（终态）——用户复验通过（2026-09-01 第二轮截图 sha256:e2e50129/9fa5f934 实证：roster 正常加载 + governance 配置保存成功）**——RCA 实锤（宿主命名不一致陷阱：JS 组名复数 agentPresets / wire 方法名单数 agentPreset.list，dsh-client-connection L6318-6324）+ 740f95a（域名对齐 + P9 三层防御 + fixture 对齐宿主真实形状）；R0 APPROVED_WITH_NOTES/0（机录；P2×2/P3×2 台账）；apiMock 五域 parity 复核无其它不一致 | 0.4.2 | archive/tasks/v0.1.7~v0.79.0.md |
| DOC-001 | **已完成（终态）**——2e1cdf8（简介段/项目目标/特性列表三处定向编辑，三大功能置顶；多模态账号拆分零丢失；徽章保持 v0.4.1 归 E-1）；smoke 零回退（README 3 断言绿）；R0 APPROVED_WITH_NOTES/0（机录；忠实度 13 条逐一溯源/完整性/一致性全 PASS；P3×2 讨论级入 E-1 小修批：简介枚举自含性 + 通路切换重选组括注） | 0.4.2 | archive/tasks/v0.1.7~v0.79.0.md |
| REL-008 | **已发布（终态——待 E-7 用户重启验收）**——E-1 2d8b3b1（bump+CHANGELOG+README，EV-139）→ E-2 十八面套件全绿（EV-140）→ E-3 隔离冷装通过（tgz 1,601,746B/ver 0.4.2/lib 15 模块全 OK，EV-141）→ E-4 审查链 R2 NEEDS_CHANGE→返工 b1ed2b4→R3 **APPROVED_WITH_NOTES/0**（E-5 放行；勘正 canonical 18 含 install-entry）双机录 → E-5 tag **v0.4.2@e91f77d** + push main（de101c0..e91f77d）+ push tag + **GitHub Release**（asset dsh-agent-router-v0.4.2.tar.gz——README 链接命名一致）→ E-6 归档检查跳过（FIX-281 域延续）；发布范围 v0.4.1..v0.4.2 = 33 commits（产品 16 + 治理 17）；EV-142；E-7 = 用户重启验收五项 | 0.4.2 | archive/tasks/v0.1.7~v0.79.0.md |
| FIX-027 | **已完成（终态）——用户复验通过**（EV-136/137：新会话六连切遥测全绿 + fce/a222d922 两老会话直切显示同步跟随用户双确认）；8c4cfc5 + 6d5e357；fixture 门控保真度修正（旧实现 12 断言 RED = EV-134 根因复现）→GREEN 207/207；R0 APPROVED_WITH_NOTES/0（机录；P3×6 台账）；残余 GUI 不发请求场景 = 宿主层（DEFERRED-001 挂账，非插件域） | 0.4.2 | archive/tasks/v0.1.7~v0.79.0.md |
| FIX-026 | **开发+审查终态（真机显示仍断——FIX-027 承载收口）**——98299e5（客户端 +42 直驱主路径+保底+卸载；服务端 -43 emit 删除；client-render 11 断言 RED→GREEN + preset-defaults I 节判别反转防复活守卫 RED 留痕）；R0 APPROVED_WITH_NOTES/0（机录）；P2-1 served-client.js 镜像同步随轮完成；EV-134 真机反证：状态层对/部署对/显示断——客户端服务解析嫌疑转 FIX-027 | 0.4.2 | archive/tasks/v0.1.7~v0.79.0.md |
| FIX-024 | **开发+审查终态（显示层真机不达——FIX-026 承载客户端直驱修复）**——ba36836（notifyModelDirectoryRefresh helper + seed 成功路径唯一调用点 + I 节 5 断言）；R0 APPROVED/0（机录；源码级契约推演全过）；**EV-132 真机反证：状态层种子全生效（fce 四连切终态正确）而显示不跟随——emit 事件链在真机不可达，方法论教训：显示层结论不能只凭源码推演** | 0.4.2 | archive/tasks/v0.1.7~v0.79.0.md |
| FIX-025 | **开发+审查终态（待用户重启复验老会话切换）**——a80e935（sessionNeverProduced helper + 两消费点替换 + events 不可读回落 requestHeader 反演；fixture events 形态 + J1-J5 断言 + A6/C3 修订；J1/J2 判别 RED→GREEN 50/50 实测）；R0 **APPROVED/0**（机录；同构精确性逐行对照/消费点 grep 完整/宿主 session.events + requestHeader 三方契约实证；P3×3 台账：计数口径 51/覆盖观察/回落可选加固）；台账增补：README 已知行为段随判据外延更新（老无消息会话=空白可切）入 0.4.2 批 | 0.4.2 | archive/tasks/v0.1.7~v0.79.0.md |
| FIX-023 | **已完成（终态）——用户复验部分通过**：FIX-023 根修生效（EV-128 实测切换种子全对，含用户截图会话定向实证）；残余显示层缺口转 FIX-024 承载（切到=全局默认的预设时 GUI 目录不刷新）——afa6ddc；判别 RED 9 FAIL→GREEN 41/41；R0 APPROVED_WITH_NOTES/0（机录） | 0.4.2 | archive/tasks/v0.1.7~v0.79.0.md |
| EVO-014 | **开发+审查终态（待用户重启复验）**——3 commits：de72e0c（重构 32 断言 RED 20 FAIL→GREEN + 实现期三验证：selectModel envelope 精确形状/resume 也触发 agent/created/options 可变且空白会话现读）+ fe0a94e（Rework：F-1 播种 Promise 链串行化 E1/E2 判别 + F-2 effort 三断言 + F-3 README 披露）+ 4e1d9cc（MicroFix：NF-1 return await 消 unhandledRejection 外泄 G1 判别捕获×1→0）；审查链 R0 APPROVED_WITH_NOTES/0（F-1 P1 即修）→ R1 APPROVED_WITH_NOTES/0（NF-1 P2 即修）→ R2 **APPROVED/0**（NF-1 关闭零新发现）三机录；门控 preset-defaults 38/38 + smoke ALL PASSED 零回退；台账：NF-2 P3 观察项 + EVO-013 台账延续（F-4/F-6/F-7 同域）；用户复验 = **重启 DSH** → 新建 governance 会话 → 选择器立即显示 deepseek-official/deepseek-v4-flash-vision-exp（无需发消息） | 0.4.2 | archive/tasks/v0.1.7~v0.79.0.md |
| EVO-013 | **开发+审查终态（待用户重启复验）**——4 commits：2ab27d6（机制 + 判别 23 断言 RED→GREEN）+ 97b04ac（UI 卡片 + render 22 + smoke 7）+ 08e0461（README）+ 75434e7（Rework：F-1 broken 契约对齐 string 形状消测试假绿 + F-2 主权③ fail-closed P4b/P4c + F-3 注释更正）；R0 APPROVED_WITH_NOTES/0（F-1 P1 即修裁定）→ R1 复审 APPROVED_WITH_NOTES/0（7/7 比对：F-1/F-2/F-3 已修复，F-4~F-7 台账；新发现 N-1 P3 入台账）——双机录 REVIEW-EVO-013-R0/R1；门控 18/18 套件全绿（smoke 1068 ok/0）；用户复验 = 重启 DSH → 设置 → Agent 路由 → 「预设 Agent」卡片 + 配置一条预设 → 新会话默认模型生效 | 0.4.2 | archive/tasks/v0.1.7~v0.79.0.md |
| EVO-015 | **开发+审查终态（R0 APPROVED_WITH_NOTES/0 机录 REVIEW-EVO-015-R0）**——commit 7965c9d（四文件单 commit；TDD RED 10→GREEN；smoke 1087→1098 +11 零回退；18 套件全绿；隔离 E2E EV-143/144：add 双登记无 warning/update 保持/remove 双摘除/--dump-default-config 层加载 + 真实环境 hash 基线零变更）；事实勘误×2 随 EV-143（v0.4.2 资产名无 v 前缀旧链接 404 / 发行包根目录 package/）；台账：P2-1 断言子串→整行收紧 + P3×5（R0 清单）入 v0.4.4 候选 | 0.4.3 | archive/tasks/v0.1.7~v0.79.0.md |
| REL-009 | **已发布（终态——待 E-7 用户验收）**——E-4 R0 APPROVED_WITH_NOTES/0（W×4+S×2；W1/W2 已随 0acdfec 补正落实，W3 记录在案，W4 入表述规范）→ E-5a 治理入仓 5e86d23 + push main → E-5b 在线 git spec 隔离 E2E **通过**（add 双登记=激活正证 + 安装产物三件套全在 + remove 双摘除 + 真实环境零变更——发布约束解除）→ E-5c tag **v0.4.3** + GitHub Release（asset dsh-agent-router-0.4.3.tar.gz = README 链接逐字一致；**链接 HEAD 200 实证**，P3-5 404 窗口消除）→ E-6 归档跳过（FIX-281 域延续）；发布范围 v0.4.2..v0.4.3 = 5 commits（产品 3：7965c9d/c84ea4a/0acdfec + 治理 2）；EV-147；E-7 = 用户验收三项（方式一命令 / 迁移三步 / README 链接） | 0.4.3 | archive/tasks/v0.1.7~v0.79.0.md |
| FIX-029 | **已完成（终态）——用户复验通过（2026-09-05「这次好了」）**——修复 A（prestep pending 优先层，宿主 selectionFor 同序 + 旧宿主回落兼容）+ 修复 B（ModelTakeover useInput 面 + **装配点透传 eda320f**——真根因：装配层短路组件内修复，探针实测三联证据闭环）+ P8 遥测（afe0548）+ served-client 镜像同步；判别组 fix-029 19 断言（A/B 组件级 + C 装配点契约守卫——mock 保真度第六次同型堵口）；门控全绿；EV-150~155；复验链：问题②（图片保真，EV-152 日志层）+ 问题①（自动接管，EV-155 用户确认）双闭环；诊断插曲：probe-2/pkg-3 ctx.logger 崩溃事故（EV-154 教训入档）+ probe-1 安全探针实测定位（已停用） | 0.4.4 | archive/tasks/v0.1.7~v0.79.0.md |
| REL-010 | **已发布（终态）**——E-2 门控 20/20 exit 0 → E-3 隔离冷装通过（1,608,986B + 装配点修复在包内）→ E-4 R0 APPROVED_WITH_NOTES/0（P1×2 补正 246ced1）→ E-5 push main（5d3d333..246ced1）+ tag **v0.4.4** + GitHub Release（W1 同型复发一次经 delete-asset 重传消除——curl 终验 200/1608986B 与 README 逐字一致）→ E-6 归档跳过（FIX-281 域延续）；EV-156；发布范围 v0.4.3..v0.4.4 = 15 commits（产品 4 + 治理 11）；E-7 = 用户可选重启验收 | 0.4.4 | archive/tasks/v0.1.7~v0.79.0.md |
| REL-011 | **E-0 已启动**——待承载面 19 commits（v0.4.4..HEAD：FIX-030×2 + EVO-016 + EVO-017×6 + FIX-031×9 + 治理 3307d3f）+ 本会话治理记录（工作区未提交）；E-1 派发 Developer ｜ **已发布（终态）**——E-1 7607586（bump+CHANGELOG 40 行+README 6 处〔R0 核 9 处含新增行为句〕）→ E-2 门控 21/21 exit 0 → E-3 隔离冷装（1,636,560B / version 0.4.5 / lib IMPORT OK——宿主 peer 供给形态：dsh-llm@0.1.0-rc.8 列 dsh-timeout 等 5 包为 peerDeps，裸环境缺 peer 属预期；首跑脚本插值 bug 与产品无关）→ E-4 Release Reviewer R0 **APPROVED_WITH_NOTES/0** 机录（三分账逐枚核对 + PATCH 裁定成立 + no-overclaim 通过；**F-1 P1**：回滚数据兼容——v0.4.4 #shapeOf 无 scope 分支，v2 行旧版拒收且最坏不可逆清除 → 补正 9956205 CHANGELOG 降级披露 + F-5 宿主域延续 + F-6 破坏性变更节；F-2/F-3 EV 合账本行）→ E-5 治理入仓 79d67c7 + push main（3307d3f..79d67c7）+ tag **v0.4.5** + **GitHub Release**（asset dsh-agent-router-0.4.5.tar.gz——curl 200 + Content-Length 1636560 与 README 链接逐字一致；notes 含回滚数据安全步骤）→ E-6 归档跳过（0<2 计数异常 FIX-281 域延续）；EV-169；发布范围 v0.4.4..v0.4.5 = 22 commits（产品 15 + 治理 6 + E-1 1）；E-7 = 用户可选重启验收 | 0.4.5 | archive/tasks/v0.1.7~v0.79.0.md |

## Evidence 索引

| Evidence ID | Task ID | 归档文件 |
|-------------|--------|---------|

## Decision 索引

| Decision ID | 标题 | 归档文件 |
|-------------|------|---------|
| DEC-028 | 项目质量原则升级 P-v2→P-v3：新增 P10 用户报障受理与验证纪律 + P5 强化（单路径收敛） | archive/decisions/decisions-v0.1.7-0.79.0.md |

## Risk 索引

| Risk ID | 描述 | 归档文件 |
|---------|------|---------|

## 非结构化归档

> 以下文件是归档目录中不含可索引条目（task/evidence/decision/risk 行）的
> 自由叙述类文件，仅在此登记以满足归档完整性（每个归档 .md 须被索引引用）。

| 归档文件 | 类型 | 描述 |
|---------|------|------|
