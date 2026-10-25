/**
 * ARCH-004 域 8b（宿主 import 面）：**本插件对宿主包的唯一静态 import 出口**。
 *
 * 纪律（P5 单点化）：`lib/**` 中除本文件外**不得**出现 `from '@deepseek-ai/…'`
 * 字面量——`tests/host-contract.mjs` S9 以静态扫描机器看护（新增裸 import 即红）。
 * 收益：宿主 API 漂移、包改名、代际切换的改动面收敛到本文件一处；同时该文件
 * 是唯一「插件必须由宿主供给哪些包」的可执行证据，与
 * `host-packages.js` 的 {@link HOST_PACKAGE_REGISTRY}（usage='import' 项）双向
 * 锁定（表说哪几个、本文件就必须 import 哪几个，反之亦然）。
 *
 * 为什么这些包必须是 `peerDependencies` 而不是 `dependencies`：见
 * `host-packages.js` 文件头（桌面端启动故障一手机制）。本文件的存在使「宿主包
 * 依赖」在依赖清单里**可以被完整审计**：任何新增行都必须同时出现在声明表与
 * 本文件，二者一致才可能过守卫。
 *
 * 零逻辑纪律：本文件只有 re-export，不含任何计算/常量/副作用——职责单一
 * （宿主符号出口），不承担解析、探测或降级判定（那些属 host-packages 域）。
 * @module dsh-agent-router/host-abi/host-imports
 */

// 工具定义面（tool 域：route_agent 工具注册）。
export { defineTool } from '@deepseek-ai/dsh-tools'

// LLM 消息/块装配面（service / prestep 域：模型消息构造、流式块装配）。
export { BlockAssembler } from '@deepseek-ai/dsh-llm'
export { createUserMessage, createAssistantMessage } from '@deepseek-ai/dsh-llm/message'

// Typert Remote 面（service 域：/api/router/* 契约基类）。
export { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

// Schema 面（schemas 域：settings 声明与配置校验的单一 schema 库）。
// 默认导出按具名 `z` 出口——消费点语义与 `import z from '…'` 等价。
export { default as z } from '@deepseek-ai/schemastery'
