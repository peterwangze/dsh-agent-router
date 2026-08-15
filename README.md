# dsh-agent-router

> 专业的事情，交给专业的 agent。
>
> DeepSeek Harness（DSH）多模型路由插件：为任意 DSH 主 agent 挂载专业 agent 目录，按任务自动路由到带独立模型的视觉、翻译、语音、子代理等专业 agent，扩展主 agent 的能力边界。

[![version](https://img.shields.io/badge/version-v0.1.0-blue)](https://github.com/peterwangze/dsh-agent-router/releases)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

## 项目目标

专业的事情交给专业的 agent：支持**自定义任意类型 agent**并配置对应的文本模型/多模态模型，扩展任意 DSH 主 agent 的能力边界——图片识别与生成、语音识别与转写、视频脚本与字幕、翻译、复杂子任务委派等任意专业能力，一套工具完成多模型协同。

## 特性

- 🧭 **自定义专业 Agent（核心）**：四种执行通路（chat 远端模型 / agent 完整子代理 / image 图片生成 / speech 语音转写）+ 自定义能力标签，主 agent 按标签自动路由；每个 agent 独立服务商与模型，未配置自动复用主 agent 模型
- 🖼 **多模态任务路由**：图片识别（OCR、截图、图表）、图片生成、语音转写；`files` 参数按能力分发——图片内联注入、文本内联、任意文件交给 agent 类型子代理读取
- 🔑 **多模态账号**：ChatGPT/Claude/Grok/Gemini 官方 API Key 一键登录；OAuth 官方授权（Gemini 内置公开 Client 零配置一键授权）；账号池按健康/用量/轮询策略自动选号与失败切换
- 📊 **实时用量统计**：Agent 级与账号级两级明细（调用/失败/tokens/耗时）、分钟级 tokens 分布、最近调用记录
- 🔌 **零配置接入**：宿主平面注册 `route_agent` 工具与路由提示段，内置与自定义的任意 agent 预设自动获得路由能力

## 安装

### 在线安装（一条命令）

| 平台 | 命令 |
| --- | --- |
| Windows（PowerShell） | `powershell -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/peterwangze/dsh-agent-router/main/install.ps1 \| iex"` |
| macOS / Linux | `curl -fsSL https://raw.githubusercontent.com/peterwangze/dsh-agent-router/main/install.sh \| sh` |

安装脚本自动完成：克隆源码 → 链接到 `~/.dsh/profiles/node_modules/` → 在 `profiles/web/cordis.patch.yml` 写入宿主行（幂等，可重复执行）。完成后**重启 DSH** 即可。

固定版本：把命令中的 `main` 换成版本号，如 `v0.1.0`。

### 离线安装

1. 下载发行包：[dsh-agent-router-v0.1.0.tar.gz](https://github.com/peterwangze/dsh-agent-router/releases/download/v0.1.0/dsh-agent-router-v0.1.0.tar.gz)
2. 解压并进入包目录：

```powershell
# Windows
tar -xzf dsh-agent-router-v0.1.0.tar.gz
cd dsh-agent-router-v0.1.0
powershell -ExecutionPolicy Bypass -File .\install.ps1 -LocalPath .
```

```sh
# macOS / Linux
tar -xzf dsh-agent-router-v0.1.0.tar.gz
cd dsh-agent-router-v0.1.0
./install.sh --local .
```

### 让 AI 帮你装（对话安装）

把下面这段提示词发给 DSH 主 agent 或 ChatGPT / Claude / Gemini 等任意主流 agent，它会自动检测平台并完成安装：

```text
请帮我在 DeepSeek Harness 上安装「dsh-agent-router」多模型路由插件：

1. 检测当前系统平台，在终端执行对应安装命令：
   - Windows（PowerShell）：
     powershell -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/peterwangze/dsh-agent-router/main/install.ps1 | iex"
   - macOS / Linux：
     curl -fsSL https://raw.githubusercontent.com/peterwangze/dsh-agent-router/main/install.sh | sh
2. 等待命令执行完成，确认输出包含「安装完成」。
3. 提醒用户重启 DeepSeek Harness。
4. 重启后打开「设置 → Agent 路由」，用预设模板添加专业 Agent（如视觉识别）。
```

## 使用指南

安装并重启后，在 DSH 的「设置 → Agent 路由」打开配置页。

### 1. 总览

![插件总览界面](docs/images/overview.png)

- 顶部**总开关**：启用多模型路由（关闭后 route_agent 拒绝调用、统计暂停）
- 三个**分级分类卡片**，点击标题展开/收起：
  - **专业 Agent**（核心区，默认展开）：维护自定义专业 agent
  - **多模态账号**（默认折叠）：API Key / OAuth 账号与账号池
  - **统计信息**（默认折叠）：实时用量明细
- 分类头实时显示摘要（agent 数量、账号数量、调用统计），无需展开即可掌握概况

### 2. 专业 Agent 配置

![专业 Agent 配置](docs/images/agent-config.png)

每个 agent 卡片默认折叠为一行摘要（名称 / 类型 / 生效模型 / 简要用量），点击展开配置：

- **名称、类型**：类型只是执行方式（chat 调远端模型 / agent 委派 DSH 子代理 / image 图片生成 / speech 语音转写），不限制能力；**能力标签**才是自定义的调度契约（路由与 files 图片分发都按它判定）
- **服务商 / 模型**：留空自动复用主 agent 模型；「发现模型」按钮可拉取服务商模型列表一键选用
- **能力说明**：主 agent 据此判断何时调用该 agent
- 高级设置：推理强度、温度、最大输出、轮数、System prompt、工具白名单（agent 类型）
- 操作：启用开关、保存、测试、删除；底部显示该 agent 的实时用量与 tokens 分布
- 列表末尾「+」用预设模板快速添加：视觉识别 / 图片生成 / 翻译 / 语音识别 / 视频生成 / 通用子 Agent

### 3. 多模态账号配置

![多模态账号配置](docs/images/accounts.png)

- **API Key 账号**：ChatGPT/Claude/Grok/Gemini 预设一键登录（官方 API Key，可配 Base URL 覆盖代理端点）
- **OAuth 账号**（插件独立管理）：官方授权码登录（OAuth2 + PKCE，Gemini 内置公开 Client 零配置一键授权）或粘贴 access token；模型列表插件内单独维护
- **账号池**：多个已授权账号组成池，按健康优先 / 用量最低 / 轮询自动选号，单账号失败自动切换；agent 的「OAuth 账号」字段可指向池

### 4. 统计信息

![统计信息](docs/images/stats.png)

- 全局汇总：调用数 / 失败数 / 入出 tokens，一键清空（每 2 秒自动刷新）
- **Agent 级明细**：每个 agent 的调用、失败、平均耗时与分钟级 tokens 柱状图
- **账号级明细**：按服务商聚合，展开查看模型细分表与 tokens 分布
- 最近调用记录：时间、agent、服务商/模型、状态、耗时

## 常见问题

- **视觉 agent 用什么模型？** 需要支持图片输入的模型（如 `gpt-4o` 等 OpenAI 兼容多模态模型；实测 `opencode-go/qwen3.7-plus` 亦可）。模型不支持图片输入时插件会在调用前给出明确报错。
- **ChatGPT / Claude 能 OAuth 登录吗？** 官方 API 不提供 OAuth：请用官方 API Key；消费级 Web token 面向官方站后端，仅适用于兼容网关，可用「粘贴 token」方式保存。
- **主 agent 怎么知道该调谁？** 安装后所有 agent 预设自动获得 `route_agent` 工具与路由提示段，按能力标签路由：带图片的任务路由给声明 `image` 能力的 agent，语音转写路由给 `audio` 能力 agent。
- **统计会丢吗？** 统计保存在内存中，DSH 重启后清零。
- **升级 / 重复安装？** 直接重跑安装命令即可（脚本幂等；在线模式自动 `git pull` 更新源码）。

## License

[MIT](LICENSE)
