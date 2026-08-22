/**
 * dsh-agent-router 浏览器侧包（`./client`，dual-face 下发）。
 *
 * 单页签「Agent 路由」（settings.section list slot）。分级卡片布局：
 * - 总开关（唯一不折叠，置顶）；
 * - 三个顶层分类卡片（头部整行点击展开/收起，内部再嵌各自子卡片）：
 *   · 专业 Agent（核心区，前置且默认展开）：每卡默认折叠摘要（名称/
 *     类型/生效模型/简要用量），点击展开配置与明细统计；末尾「+」添加
 *     （图片识别/图片生成/翻译/语音识别/视频生成/通用子 Agent 预设）；
 *   · 多模态账号（默认折叠）：API Key 登录 + OAuth 官方登录 + 账号池
 *     三个子区（展开显示模型列表 / Base URL / 一键授权与健康度）；
 *   · 统计信息（默认折叠）：Agent 级与账号级（服务商）两级明细卡片
 *     （平均耗时、模型细分、分钟级 tokens 分布）+ 最近调用记录。
 *
 * wire 面：固定 apiproxy（llm/credentials/白名单 settings）+ 本包 $mount
 * 的 `remote.router` namespace（catalog/stats/test/reset/config/save）。
 */
window.__ModuleLoader__.load({
  id: 'dsh-agent-router',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    let react = require('react')

    const el = react.createElement
    const { useState, useEffect, useCallback, useRef } = react

    // ── wire codecs（与宿主 lib/schemas.js 同形状的轻量校验器）──────────────
    function wireCheck(spec, value, path) {
      if (value === undefined || value === null) {
        if (spec.optional === true) return value
        throw new Error(`dsh-agent-router wire: ${path} is required`)
      }
      if (spec.kind === 'string') {
        if (typeof value !== 'string') throw new Error(`dsh-agent-router wire: ${path} must be a string`)
        return value
      }
      if (spec.kind === 'boolean') {
        if (typeof value !== 'boolean') throw new Error(`dsh-agent-router wire: ${path} must be a boolean`)
        return value
      }
      if (spec.kind === 'number') {
        if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`dsh-agent-router wire: ${path} must be a finite number`)
        return value
      }
      if (spec.kind === 'array') {
        if (!Array.isArray(value)) throw new Error(`dsh-agent-router wire: ${path} must be an array`)
        if (spec.items) for (let index = 0; index < value.length; index++) {
          const next = wireCheck(spec.items, value[index], `${path}[${index}]`)
          if (next !== undefined) value[index] = next
        }
        return value
      }
      if (spec.kind === 'object') {
        if (typeof value !== 'object' || Array.isArray(value)) throw new Error(`dsh-agent-router wire: ${path} must be an object`)
        if (spec.properties) for (const [key, child] of Object.entries(spec.properties)) {
          const childSpec = child && child.spec ? child.spec : child
          const next = wireCheck(childSpec, value[key], path === '' ? key : `${path}.${key}`)
          if (next !== undefined) value[key] = next
        }
        return value
      }
      return value
    }
    function wireNode(spec) {
      return { parse: (value) => wireCheck(spec, value, ''), spec }
    }
    const wv = {
      object: (properties, optional) => wireNode({ kind: 'object', properties, optional: optional === true }),
      array: (items, optional) => wireNode({ kind: 'array', items: items && items.spec ? items.spec : items, optional: optional === true }),
      string: (optional) => wireNode({ kind: 'string', optional: optional === true }),
      boolean: (optional) => wireNode({ kind: 'boolean', optional: optional === true }),
      number: (optional) => wireNode({ kind: 'number', optional: optional === true }),
    }
    const wEmpty = wv.object({})
    const wAgentId = wv.object({ agentId: wv.string() })
    const wCatalog = wv.object({
      ok: wv.boolean(), enabled: wv.boolean(),
      defaults: wv.object({ provider: wv.string(), model: wv.string(), reasoningEffort: wv.string(true) }),
      agents: wv.array(wv.object({
        id: wv.string(), name: wv.string(), type: wv.string(), enabled: wv.boolean(),
        description: wv.string(), capabilities: wv.array(wv.string()),
        provider: wv.string(), model: wv.string(), account: wv.string(), cliAgent: wv.string(true),
        effectiveProvider: wv.string(), effectiveModel: wv.string(), source: wv.string(),
        error: wv.string(true),
      })),
      oauthAccounts: wv.array(wv.object({
        id: wv.string(), name: wv.string(), enabled: wv.boolean(),
        protocol: wv.string(), baseURL: wv.string(), tokenRef: wv.string(),
        clientId: wv.string(), authUrl: wv.string(), tokenUrl: wv.string(), scope: wv.string(),
        models: wv.array(wv.string()),
        publicClient: wv.boolean(true),
      })),
      pools: wv.array(wv.object({
        id: wv.string(), name: wv.string(), enabled: wv.boolean(), strategy: wv.string(),
        accounts: wv.array(wv.string()),
        accountHealth: wv.array(wv.object({
          accountId: wv.string(), calls: wv.number(), errors: wv.number(), lastAt: wv.number(true),
        })),
      }), true),
      cliAgents: wv.array(wv.object({
        id: wv.string(), name: wv.string(), enabled: wv.boolean(),
        command: wv.string(), args: wv.string(),
        timeoutMs: wv.number(), maxConcurrent: wv.number(),
      }), true),
    })
    const wBucket = wv.object({
      minute: wv.string(), calls: wv.number(), errors: wv.number(),
      inputTokens: wv.number(), outputTokens: wv.number(),
    })
    const wStats = wv.object({
      ok: wv.boolean(), enabled: wv.boolean(),
      totals: wv.array(wv.object({
        agentId: wv.string(), name: wv.string(), provider: wv.string(), model: wv.string(),
        calls: wv.number(), errors: wv.number(), inputTokens: wv.number(), outputTokens: wv.number(),
        totalMs: wv.number(), lastAt: wv.number(true),
      })),
      recent: wv.array(wv.object({
        at: wv.number(), agentId: wv.string(), provider: wv.string(), model: wv.string(),
        ok: wv.boolean(), ms: wv.number(), inputTokens: wv.number(true), outputTokens: wv.number(true),
        error: wv.string(true),
      })),
      series: wv.array(wv.object({ agentId: wv.string(), buckets: wv.array(wBucket) })),
      accountTotals: wv.array(wv.object({
        provider: wv.string(),
        calls: wv.number(), errors: wv.number(), inputTokens: wv.number(), outputTokens: wv.number(),
        totalMs: wv.number(), lastAt: wv.number(true),
        models: wv.array(wv.object({
          model: wv.string(),
          calls: wv.number(), errors: wv.number(), inputTokens: wv.number(), outputTokens: wv.number(),
          totalMs: wv.number(), lastAt: wv.number(true),
        })),
      })),
      accountSeries: wv.array(wv.object({ provider: wv.string(), buckets: wv.array(wBucket) })),
    })
    const wTest = wv.object({
      ok: wv.boolean(), message: wv.string(), latencyMs: wv.number(true),
      usage: wv.object({
        inputTokens: wv.number(true), outputTokens: wv.number(true),
        cacheReadTokens: wv.number(true), cacheWriteTokens: wv.number(true), reasoningTokens: wv.number(true),
      }, true),
    })
    const wReset = wv.object({ ok: wv.boolean() })
    const wConfig = wv.object({
      ok: wv.boolean(), enabled: wv.boolean(), revision: wv.number(), writable: wv.boolean(),
      value: wv.object({}), user: wireNode({ kind: 'json', optional: true }),
    })
    const wSaveRequest = wv.object({
      ops: wv.array(wv.object({
        op: wv.string(), path: wv.array(wv.string()),
        value: wireNode({ kind: 'json', optional: true }),
      })),
      expectedRevision: wv.number(true),
    })
    const wSaveResult = wv.object({
      ok: wv.boolean(), revision: wv.number(),
      user: wireNode({ kind: 'json', optional: true }),
    })
    const wOauthBeginRequest = wv.object({ accountId: wv.string(), redirectUri: wv.string() })
    const wOauthBeginResult = wv.object({ ok: wv.boolean(), message: wv.string(), authUrl: wv.string(true), state: wv.string(true) })
    const wOauthExchangeRequest = wv.object({
      code: wv.string(), state: wv.string(true),
      accountId: wv.string(true), codeVerifier: wv.string(true), redirectUri: wv.string(true),
    })
    const wOauthExchangeResult = wv.object({ ok: wv.boolean(), message: wv.string(), expiresIn: wv.number(true) })
    const wOauthDiscoverRequest = wv.object({ accountId: wv.string() })
    const wOauthDiscoverResult = wv.object({ ok: wv.boolean(), message: wv.string(), models: wv.array(wv.string()) })
    const wCliStatusResult = wv.object({ ok: wv.boolean(), message: wv.string(), loggedIn: wv.boolean(true) })
    const wCliLoginResult = wv.object({ ok: wv.boolean(), message: wv.string() })
    const wCliModelsResult = wv.object({ ok: wv.boolean(), message: wv.string(), models: wv.array(wv.string()), source: wv.string(true) })
    const wImageDataRequest = wv.object({
      ref: wv.object({
        attachmentId: wv.string(), mediaType: wv.string(), bytes: wv.number(),
        width: wv.number(), height: wv.number(), name: wv.string(true),
      }),
    })
    const wImageDataResult = wv.object({
      ok: wv.boolean(), message: wv.string(), code: wv.string(true),
      mediaType: wv.string(true), data: wv.string(true), width: wv.number(true), height: wv.number(true), name: wv.string(true),
    })
    const wUploadFileRequest = wv.object({ name: wv.string(), mediaType: wv.string(), dataBase64: wv.string() })
    const wUploadFileResult = wv.object({
      ok: wv.boolean(), path: wv.string(true), attachmentId: wv.string(true),
      name: wv.string(true), message: wv.string(true), code: wv.string(true),
    })
    const wReadWorkspaceFileRequest = wv.object({ path: wv.string() })
    const wReadWorkspaceFileResult = wv.object({
      ok: wv.boolean(), dataBase64: wv.string(true), mediaType: wv.string(true),
      name: wv.string(true), message: wv.string(true), code: wv.string(true),
    })

    // ── Remote 契约（与宿主 lib/rpc.js 一致）────────────────────────────────
    function parameter(name, schema) {
      return { name, wire: name, source: 'json', codec: { mode: 'strict', typeSymbol: `dsh-agent-router/types#${name}`, schema } }
    }
    function resultOf(name, schema) {
      return { mode: 'strict', typeSymbol: `dsh-agent-router/types#${name}`, schema }
    }
    const ROUTER_REMOTE = {
      package: 'dsh-agent-router',
      descriptors: [
        { id: 'dsh-agent-router#router/catalog', service: 'router', namespace: 'router', method: 'catalog', invocation: { kind: 'direct' }, parameters: [parameter('request', wEmpty)], result: resultOf('CatalogResult', wCatalog) },
        { id: 'dsh-agent-router#router/stats', service: 'router', namespace: 'router', method: 'stats', invocation: { kind: 'direct' }, parameters: [parameter('request', wEmpty)], result: resultOf('StatsResult', wStats) },
        { id: 'dsh-agent-router#router/test', service: 'router', namespace: 'router', method: 'test', invocation: { kind: 'direct' }, parameters: [parameter('request', wAgentId)], result: resultOf('TestResult', wTest) },
        { id: 'dsh-agent-router#router/reset', service: 'router', namespace: 'router', method: 'reset', invocation: { kind: 'direct' }, parameters: [parameter('request', wEmpty)], result: resultOf('ResetResult', wReset) },
        { id: 'dsh-agent-router#router/config', service: 'router', namespace: 'router', method: 'config', invocation: { kind: 'direct' }, parameters: [parameter('request', wEmpty)], result: resultOf('ConfigResult', wConfig) },
        { id: 'dsh-agent-router#router/save', service: 'router', namespace: 'router', method: 'save', invocation: { kind: 'direct' }, parameters: [parameter('request', wSaveRequest)], result: resultOf('SaveResult', wSaveResult) },
        { id: 'dsh-agent-router#router/oauthTokenExchange', service: 'router', namespace: 'router', method: 'oauthTokenExchange', invocation: { kind: 'direct' }, parameters: [parameter('request', wOauthExchangeRequest)], result: resultOf('OauthTokenExchangeResult', wOauthExchangeResult) },
        { id: 'dsh-agent-router#router/oauthBegin', service: 'router', namespace: 'router', method: 'oauthBegin', invocation: { kind: 'direct' }, parameters: [parameter('request', wOauthBeginRequest)], result: resultOf('OauthBeginResult', wOauthBeginResult) },
        { id: 'dsh-agent-router#router/oauthDiscover', service: 'router', namespace: 'router', method: 'oauthDiscover', invocation: { kind: 'direct' }, parameters: [parameter('request', wOauthDiscoverRequest)], result: resultOf('OauthDiscoverResult', wOauthDiscoverResult) },
        { id: 'dsh-agent-router#router/cliStatus', service: 'router', namespace: 'router', method: 'cliStatus', invocation: { kind: 'direct' }, parameters: [parameter('request', wAgentId)], result: resultOf('CliStatusResult', wCliStatusResult) },
        { id: 'dsh-agent-router#router/cliLogin', service: 'router', namespace: 'router', method: 'cliLogin', invocation: { kind: 'direct' }, parameters: [parameter('request', wAgentId)], result: resultOf('CliLoginResult', wCliLoginResult) },
        { id: 'dsh-agent-router#router/cliModels', service: 'router', namespace: 'router', method: 'cliModels', invocation: { kind: 'direct' }, parameters: [parameter('request', wAgentId)], result: resultOf('CliModelsResult', wCliModelsResult) },
        { id: 'dsh-agent-router#router/imageData', service: 'router', namespace: 'router', method: 'imageData', invocation: { kind: 'direct' }, parameters: [parameter('request', wImageDataRequest)], result: resultOf('ImageDataResult', wImageDataResult) },
        { id: 'dsh-agent-router#router/uploadFile', service: 'router', namespace: 'router', method: 'uploadFile', invocation: { kind: 'direct' }, parameters: [parameter('request', wUploadFileRequest)], result: resultOf('UploadFileResult', wUploadFileResult) },
        { id: 'dsh-agent-router#router/readWorkspaceFile', service: 'router', namespace: 'router', method: 'readWorkspaceFile', invocation: { kind: 'direct' }, parameters: [parameter('request', wReadWorkspaceFileRequest)], result: resultOf('ReadWorkspaceFileResult', wReadWorkspaceFileResult) },
      ],
    }

    // ── 样式 ────────────────────────────────────────────────────────────────
    const CSS = `
.dshrouter-section{max-width:760px;display:flex;flex-direction:column;gap:12px;color:var(--dsw-alias-label-primary)}
.dshrouter-title{margin:0;font-size:16px;font-weight:500;line-height:24px}
.dshrouter-subtitle{margin:0;font-size:13px;font-weight:500;line-height:20px}
.dshrouter-intro{margin:0;font-size:14px;line-height:22px;color:var(--dsw-alias-label-tertiary)}
.dshrouter-error{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px;margin:0}
.dshrouter-ok{color:var(--dsw-alias-state-success-primary);font-size:12px;line-height:18px;margin:0}
.dshrouter-hint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;margin:0}
.dshrouter-card{border:1px solid rgba(140,140,140,.45);border:1px solid color-mix(in srgb,currentColor 26%,transparent);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:10px}
.dshrouter-card.disabled{opacity:.55}
.dshrouter-card-head{display:flex;align-items:center;gap:8px;width:100%;background:none;border:none;padding:0;font:inherit;color:inherit;cursor:pointer;text-align:left}
.dshrouter-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dshrouter-head{display:flex;align-items:center;gap:8px}
.dshrouter-name{font-size:14px;font-weight:500;line-height:22px}
.dshrouter-id{color:var(--dsw-alias-label-secondary);font-size:12px;border:1px solid var(--dsw-alias-border-l3);border-radius:4px;padding:0 6px}
.dshrouter-tag{color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;border:1px solid var(--dsw-alias-border-l3);border-radius:4px;padding:0 6px}
.dshrouter-spacer{flex:1}
.dshrouter-chevron{color:var(--dsw-alias-label-tertiary);font-size:12px;flex:none}
.dshrouter-field{display:flex;flex-direction:column;gap:4px;min-width:200px;flex:1}
.dshrouter-field-label{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.dshrouter-input,.dshrouter-select,.dshrouter-textarea{box-sizing:border-box;width:100%;font:inherit;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-input,transparent);border:1px solid var(--dsw-alias-border-l3);border-radius:8px;padding:6px 10px;outline:none}
.dshrouter-textarea{resize:vertical;min-height:56px}
.dshrouter-input:focus,.dshrouter-select:focus,.dshrouter-textarea:focus{border-color:var(--dsw-alias-button-primary-fill)}
.dshrouter-button{box-sizing:border-box;height:32px;font:inherit;font-size:13px;line-height:20px;cursor:pointer;border:none;border-radius:16px;padding:0 14px;display:inline-flex;align-items:center;gap:4px;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}
.dshrouter-button:hover:not(:disabled){filter:brightness(1.08)}
.dshrouter-button:disabled{opacity:.5;cursor:not-allowed}
.dshrouter-button.ghost{background:transparent;color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l3)}
.dshrouter-button.danger{background:transparent;color:var(--dsw-alias-state-error-primary);border:1px solid var(--dsw-alias-state-error-primary)}
.dshrouter-chip{box-sizing:border-box;height:28px;font:inherit;font-size:12px;line-height:18px;cursor:pointer;border:1px solid var(--dsw-alias-border-l3);border-radius:14px;padding:0 12px;display:inline-flex;align-items:center;gap:4px;background:transparent;color:var(--dsw-alias-label-primary)}
.dshrouter-chip:hover{border-color:var(--dsw-alias-button-primary-fill)}
.dshrouter-chip.active{border-color:var(--dsw-alias-button-primary-fill);background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}
.dshrouter-dot{width:8px;height:8px;border-radius:50%;display:inline-block;flex:none;background:#6f7280;vertical-align:middle}
.dshrouter-dot.ok{background:var(--dsw-alias-state-success-primary)}
.dshrouter-dot.bad{background:var(--dsw-alias-state-error-primary)}
.dshrouter-meta{font-size:12px;color:var(--dsw-alias-label-tertiary);line-height:18px}
.dshrouter-stats{border-top:1px solid rgba(140,140,140,.35);border-top:1px solid color-mix(in srgb,currentColor 20%,transparent);padding-top:8px;display:flex;flex-direction:column;gap:6px}
.dshrouter-table{width:100%;border-collapse:collapse;font-size:12px;line-height:18px}
.dshrouter-table th,.dshrouter-table td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--dsw-alias-border-l3)}
.dshrouter-table th{color:var(--dsw-alias-label-secondary);font-weight:500}
.dshrouter-table-row{cursor:pointer}
.dshrouter-table-row:hover td{background:var(--dsw-alias-bg-hover,rgba(255,255,255,.04))}
.dshrouter-bars{display:flex;align-items:flex-end;gap:2px;height:44px;padding:2px 0}
.dshrouter-bar{flex:1;min-width:2px;background:var(--dsw-alias-button-primary-fill);border-radius:1px 1px 0 0;opacity:.85}
.dshrouter-bar.err{background:var(--dsw-alias-state-error-primary)}
.dshrouter-modal{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.4);z-index:1000}
.dshrouter-modal-body{background:var(--dsw-alias-bg-overlay,#1b1d24);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:16px;min-width:360px;max-width:560px;max-height:70vh;overflow:auto;display:flex;flex-direction:column;gap:10px}
.dshrouter-modal-title{margin:0;font-size:14px;font-weight:500}
.dshrouter-candidate{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;cursor:pointer;font-size:13px}
.dshrouter-candidate:hover{background:var(--dsw-alias-bg-hover, rgba(255,255,255,.06))}
.dshrouter-switch{display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:13px}
.dshrouter-switch input{width:14px;height:14px}
.dshrouter-add{display:flex;align-items:center;justify-content:center;gap:6px;border:1px dashed rgba(140,140,140,.5);border:1px dashed color-mix(in srgb,currentColor 30%,transparent);border-radius:12px;padding:14px;cursor:pointer;color:var(--dsw-alias-label-secondary);font-size:13px}
.dshrouter-add:hover{border-color:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary)}
.dshrouter-divider{border:none;border-top:1px solid rgba(140,140,140,.35);border-top:1px solid color-mix(in srgb,currentColor 20%,transparent);margin:4px 0}
.dshrouter-category{border:1px solid rgba(140,140,140,.45);border:1px solid color-mix(in srgb,currentColor 26%,transparent);border-radius:12px;display:flex;flex-direction:column}
.dshrouter-category-head{display:flex;align-items:center;gap:10px;width:100%;background:none;border:none;padding:12px 14px;font:inherit;color:inherit;cursor:pointer;text-align:left}
.dshrouter-category-head:hover{background:var(--dsw-alias-bg-hover,rgba(255,255,255,.03))}
.dshrouter-category-title{font-size:14px;font-weight:500;line-height:22px}
.dshrouter-category-body{border-top:1px solid rgba(140,140,140,.35);border-top:1px solid color-mix(in srgb,currentColor 20%,transparent);padding:12px 14px;display:flex;flex-direction:column;gap:10px}
/* 多模态展示辅助：composer 附件按钮 / route_agent 工具卡片 */
.dshrouter-attach{box-sizing:border-box;width:28px;height:28px;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;flex:none;font-size:15px;line-height:1}
.dshrouter-attach:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dshrouter-attach:disabled{opacity:.5;cursor:not-allowed}
.dshrouter-attachcard{box-sizing:border-box;display:inline-flex;align-items:center;gap:4px;max-width:240px;font-size:12px;line-height:16px;color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l3);border-radius:8px;padding:2px 8px;background:var(--dsw-alias-bg-base,transparent);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:default}
.dshrouter-toolcard{border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:8px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary);min-width:0}
.dshrouter-toolcard-head{display:flex;align-items:center;gap:8px}
.dshrouter-toolcard-title{font-size:13px;font-weight:500}
.dshrouter-toolimages{display:flex;flex-wrap:wrap;gap:8px}
.dshrouter-toolgallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px}
.dshrouter-toolimage{display:block;border:1px solid var(--dsw-alias-border-l3);border-radius:8px;background:var(--dsw-alias-bg-base,transparent);object-fit:cover;width:160px;height:160px;cursor:zoom-in}
.dshrouter-toolimage:hover{opacity:.9}
.dshrouter-tooltext{white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-primary)}
.dshrouter-toolmeta{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}
.dshrouter-toolerror{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}
.dshrouter-toolfile{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
.dshrouter-toolpath{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:16px;color:var(--dsw-alias-label-secondary);word-break:break-all;white-space:pre-wrap}
.dshrouter-toolmedia{max-width:100%;border-radius:8px;background:var(--dsw-alias-bg-base,transparent)}
`
    const CSS_ID = 'dsh-agent-router'
    if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(CSS_ID) + ']') === null) {
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-agent-router'
      tag.dataset.pluginCss = CSS_ID
      tag.textContent = CSS
      document.head.appendChild(tag)
    }

    // ── 文案 ────────────────────────────────────────────────────────────────
    const zh = {
      nav: 'Agent 路由',
      title: '多模型路由',
      intro: '为不同能力配置专业 agent（图片识别、图片生成、翻译、语音识别等），每个 agent 可选独立服务商与模型；未配置时自动复用主 agent 模型。专业 Agent 是核心功能区（默认展开），多模态账号与统计信息默认折叠——点击分类卡片标题展开或收起。',
      masterSwitch: '启用多模型路由',
      masterHint: '关闭后 route_agent 工具将拒绝调用，提示段与统计暂停；组合层可通过禁用 dsh-agent-router 行整体关闭插件。',
      accountTitle: '多模态账号管理',
      accountSummary: (n) => `已配置 ${n} 个账号`,
      accountIntro: '为任意服务商配置 API Key（官方服务商、第三方中转与本地部署均可；ChatGPT/Claude/Grok/Gemini 订阅 plan 可用其官方 API Key）。',
      accountOAuth: '说明：harness 模型适配层目前仅支持 API Key 认证，官方 OAuth 登录流暂不在支持范围；登录后该服务商模型会立即出现在上方模型列表中，账号与模型的具体配置与「设置 → 模型」页同源。',
      accountAddHint: '配置式添加（与「设置 → 模型」模型基座同款逻辑）：适用于任意服务商——官方服务商填官方 Base URL 与 API Key，未集成服务商 / 第三方中转 / 本地部署（Ollama / One-API / LM Studio 等）填对应端点。保存后服务商立即注册到共享模型列表；模型留空时保存会自动从端点拉取并写入（同名内置服务商除外），也可在 Agent 配置中用「发现模型」拉取端点模型。',
      fieldProviderId: '服务商 ID（如 openai / my-gateway / one-api；已存在同名服务商时保存将覆盖其配置）',
      accountApi: '接口类型',
      accountModelsField: '模型（可选，逗号分隔；自定义服务商留空则保存时自动从端点拉取）',
      accountKeyOptional: 'API Key（可选：本地部署/免鉴权中转可留空）',
      accountBaseUrlRequired: 'Base URL（必填，如 http://127.0.0.1:11434/v1）',
      accountAddProvider: '添加提供方',
      accountCustom: '＋ 自定义',
      accountProvider: '服务商',
      accountKey: 'API Key',
      accountBaseUrl: 'Base URL（可选，覆盖默认端点，如代理网关）',
      accountDone: '已配置',
      accountMissing: '未配置',
      accountActive: '已激活',
      accountDormant: '未激活',
      accountList: '已配置账号',
      addAccount: '添加账号',
      accountEditTitle: '编辑配置',
      accountEditHint: '修改 Base URL 或 API Key 后点「保存」（Key 留空 = 保持原凭据；Base URL 不能为空）。',
      accountKeyKeep: '留空 = 保持原 Key',
      accountNoBaseUrlWarn: '该自定义服务商未配置 Base URL：缺少它会使整个模型目录失效（内置服务商无需填写）。请补全后保存。',
      accountCatalogEmptyWarn: '模型目录整体为空：通常由某个账号的无效配置引起（缺少 Base URL 的自定义服务商会使整个 llm-pi-ai 目录失效）。请逐个展开账号，为缺少 Base URL 的补全并保存。',
      accountDelete: '删除账号',
      accountModelsTitle: '模型列表',
      accountConfirmDelete: '确认删除该账号？（将移除该服务商的配置与凭据）',
      accountModels: '个模型',
      accountDiscoverFailed: '未能从端点拉取模型',
      accountModelsRequiredHint: '自定义服务商必须在模型列表中配置至少一个模型 id：请检查 Base URL / API Key 与网络后重试，或手工填写模型列表',
      accountDiscoverEmpty: '端点未返回任何模型：请手工填写模型 id，或检查端点地址是否正确',
      accountModelsKept: '已保留现有模型列表：自定义服务商必须列出模型才能生效，如需清空请改为手工填写',
      accountDiscovered: (n) => `已从端点自动发现并保存 ${n} 个模型`,
      oauthTitle: 'OAuth 账号（官方登录，插件独立管理）',
      oauthSummary: (n) => `${n} 个 OAuth 账号`,
      oauthIntro: 'OAuth 高级区（自建网关 / 账号池场景）。官方 API 现状：ChatGPT/Claude/Grok 官方 API 不提供 OAuth（仅支持粘贴 Web token 到自建兼容网关）；Gemini 支持 OAuth 但需自建 Google Cloud OAuth Client（内置公开 Client 已被 Google 禁用：授权页直接报 invalid_request / invalid_scope）。日常使用推荐上方 API Key 配置式添加。OAuth 账号只由本插件管理：不注册共享模型列表，调用经插件直连端点。',
      oauthLoginMode: '登录方式',
      oauthModeCode: '官方授权码登录（OAuth2 + PKCE）',
      oauthModePaste: '粘贴 access token',
      oauthToken: 'Access Token',
      oauthPaste: '保存 Token',
      oauthClientId: 'Client ID',
      oauthClientSecret: 'Client Secret（只写，可选；公共客户端可留空）',
      oauthAuthUrl: '官方授权端点',
      oauthTokenUrl: '官方 Token 端点',
      oauthScope: 'Scope',
      oauthOpenUrl: '打开官方授权页',
      oauthOpenHint: '将生成 PKCE 并打开官方授权 URL；完成后把浏览器跳转回来的完整地址粘贴到下方回调框。',
      oauthCallbackUrl: '回调地址（粘贴浏览器返回的完整 URL）',
      oauthExchange: '完成登录（交换 Token）',
      oauthExchanging: '交换中…',
      oauthOneClick: '一键授权登录',
      oauthOneClickHint: '自动弹出官方授权页；完成授权后自动完成 code 交换与保存，无需手工复制回调地址。',
      oauthRedirectUriLabel: '重定向地址（需在服务商控制台登记）',
      oauthPopupBlocked: '浏览器拦截了弹窗，请允许本页弹出窗口后重试。',
      oauthWaiting: '已打开授权页：请在弹窗中完成授权，登录状态将自动刷新。',
      oauthExpired: '等待授权超时，请重新发起。',
      oauthDone: '授权成功，access token 已保存。',
      oauthAutoDiscovering: '授权成功：正在自动发现模型…',
      oauthAfterLoginHint: '下一步：点「发现模型」从端点拉取模型（或手工填写模型 id）；然后把「专业 Agent」里某 agent 的「OAuth 账号」指向本账号即可开始使用。',
      oauthPublicClientLimit: '注意：Google 已禁用内置公开 Client——授权页直接报 invalid_request / invalid_scope，此账号无法完成登录。实际使用二选一：① 取消勾选「内置公开 OAuth Client」，改用自建 Client（Google Cloud 控制台创建，回调填 http://127.0.0.1:3080/router-oauth/callback，scope 用 cloud-platform + generative-language.retriever）；② 在「添加账号」用 Gemini API Key 配置 provider=google。',
      oauthFillScopes: '填入 Gemini 推荐 scope',
      oauthNeedPasteHint: '如需粘贴 access token 或配置自建 OAuth Client，展开下方「账号与登录设置」。',
      advancedLogin: '账号与登录设置',
      oauthNeedRestart: '一键授权需要 DSH 重启后生效（宿主侧新增回调端点）。',
      oauthOneClickAdd: '一键授权并添加',
      oauthAddOnly: '仅添加（稍后登录）',
      oauthNeedClientId: '需先填 Client ID',
      oauthClientIdHint: '官方授权码流需要你自有的 OAuth Client（在服务商控制台创建；回调地址登记下方所示地址，其余端点/Scope 已由预设填好）。',
      oauthPublicClientLabel: '使用内置公开 OAuth Client（已被 Google 禁用，不推荐）',
      oauthPublicClientHint: '内置 Google Cloud SDK 公开 Client 已被 Google 拒绝（授权页报 invalid_request / invalid_scope），仅保留兼容。请取消勾选，改用自建 Client（回调 http://127.0.0.1:3080/router-oauth/callback），或直接使用 Gemini API Key。',
      poolTitle: '账号池',
      poolIntro: '把多个已授权账号组成池：调用时按策略自动选择账号（健康优先 / 用量最低 / 轮询），单个账号失败自动切换到下一个。agent 的「OAuth 账号」可指向池。',
      poolSummary: (n) => `${n} 个账号池`,
      poolStrategy: '选号策略',
      poolStrategyHealthy: '健康优先（失败最少）',
      poolStrategyUsage: '用量最低优先',
      poolStrategyRoundRobin: '轮询',
      poolAccounts: '池内账号',
      poolAddAccount: '从已授权账号添加',
      poolRemove: '移出',
      poolNoAccounts: '池内还没有账号：从下方下拉选择已授权账号加入，或对账号执行「一键授权登录」后再加入。',
      poolAddPlaceholder: '新池 id（如 gemini-pool）',
      addPool: '添加账号池',
      poolDelete: '删除池',
      poolConfirmDelete: '确认删除该账号池？',
      poolOneClick: '一键授权登录',
      poolOneClickAdd: '一键授权并加入池',
      poolHealth: '健康',
      poolAccountSource: '账号池',
      oauthLoggedIn: '已登录',
      oauthNotLoggedIn: '未登录',
      oauthProtocol: '协议',
      oauthBaseUrl: 'Base URL',
      oauthModels: '模型（插件独立维护）',
      oauthDiscover: '发现模型',
      oauthDiscovering: '查询中…',
      oauthDelete: '删除账号',
      oauthConfirmDelete: '确认删除该 OAuth 账号？',
      oauthAdd: '添加 OAuth 账号',
      oauthCustomAdd: '＋ 自定义（自建 OAuth2 服务商）',
      oauthCustomHint: '已创建空白账号：请在卡片中填写协议、Base URL、授权/Token 端点、Client ID 与 Scope 后保存，再执行登录。',
      oauthQuickAddHint: '点击服务商即创建账号：Gemini 为自建 Client 形态（需在高级设置填 Client ID/Secret 后一键授权）；ChatGPT/Claude/Grok 仅适配自建网关——添加后把 Base URL 改为你的网关并粘贴 access token。',
      oauthGeminiSelfHint: 'Gemini 账号已创建（自建 Client 形态）：① Google Cloud 控制台创建 OAuth Client（Web 类型），回调填 http://127.0.0.1:3080/router-oauth/callback；② 展开卡片 → 账号与登录设置 → 填 Client ID/Secret，scope 点「填入 Gemini 推荐 scope」；③ 保存后点「一键授权登录」。',
      oauthAddedPasteHint: '账号已添加：官方 API 不提供 OAuth——把 Base URL 改为你的自建网关后，在此粘贴 access token 完成登录。',
      oauthOpenSite: '打开官方站登录',
      oauthBookmark: '获取 token 书签',
      oauthDragBookmark: '拖到浏览器书签栏；之后在官方站页面点一下书签，token 自动回传保存。',
      oauthCopyBookmark: '复制书签脚本',
      oauthBookmarkCopied: '已复制：在官方站页面的地址栏粘贴并回车即可回填。',
      oauthGetTokenHint: '登录官方站后，点书签栏的「获取 token」即自动回传保存到本账号。',
      oauthManualTokenHint: '该服务商无公开稳定的 token 接口：请登录官方站后从浏览器开发者工具（Network / LocalStorage）提取。',
      oauthTokenBack: 'access token 已自动保存。',
      oauthModelsCount: (n) => `${n} 个模型`,
      oauthNeedConfig: '请先完善账号配置（Base URL 等）再登录',
      oauthCallbackInvalid: '回调地址中未找到 code 参数',
      oauthTokenSaved: 'Token 已保存',
      oauthTokenSaveFailed: '保存 Token 失败',
      fieldAccount: 'OAuth 账号（插件独立管理，覆盖服务商/模型）',
      oauthChatOnly: 'OAuth 账号仅支持 chat 类型',
      statsTitle: '统计信息',
      statsIntro: '实时用量（每 2 秒刷新）：Agent 级与账号级（服务商）两级明细卡片，默认折叠，点击展开查看平均耗时、模型细分与分钟级 tokens 分布；统计保存在内存中，重启后清零。',
      statsSummary: (calls, errors) => `累计 ${calls} 次调用 / ${errors} 次失败`,
      statsCalls: '调用',
      statsErrors: '失败',
      statsTokens: 'tokens（入/出）',
      statsAvg: '平均耗时',
      statsLast: '最近调用',
      statsReset: '清空统计',
      statsDisabled: '多模型路由未启用',
      statsAgent: 'Agent',
      statsProvider: '服务商/模型',
      statsTime: '时间',
      statsStatus: '状态',
      statsOk: '成功',
      statsFail: '失败',
      statsRecent: '最近调用记录',
      statsSeries: 'tokens 分布（每分钟，近 90 分钟）',
      statsAgentLevel: 'Agent 级明细',
      statsAccountLevel: '账号级明细（服务商）',
      statsModelDetail: '模型细分',
      statsNoCalls: '暂无调用记录',
      agentsTitle: '专业 Agent',
      agentsSummary: (n) => `${n} 个专业 agent`,
      agentsIntro: '每个专业 Agent 用独立的服务商与模型处理特定能力（图片识别、生成、翻译、语音识别等）。卡片默认折叠，点击展开配置；服务商与模型留空时自动复用主 Agent 模型，点击末尾「+」添加。',
      addTitle: '添加专业 Agent',
      addPlaceholder: '新 agent id（如 vision / draw）',
      add: '添加',
      presets: '预设模板：',
      presetVision: '图片识别',
      presetImage: '图片生成',
      presetTranslate: '翻译',
      presetSpeech: '语音识别',
      presetVideo: '视频生成',
      presetGeneral: '通用子 Agent',
      cliPickerCodex: 'Codex CLI（OpenAI）',
      cliPickerClaude: 'Claude Code（Anthropic）',
      cliPickerGemini: 'Gemini CLI（Google）',
      fieldName: '名称',
      fieldType: '类型',
      fieldTypeHint: '类型只是执行方式（chat 调远端模型 / agent 委派 DSH 子代理 / image 文生图 / speech 语音转写 / cli 无头 CLI 子代理），不限制能力；能力标签才是你自定义的调度依据，files 图片分发也按它判定。',
      typeChat: 'chat · 对话型专业调用',
      typeAgent: 'agent · 完整子 Agent 委派',
      typeImage: 'image · 图片生成',
      typeSpeech: 'speech · 语音识别（转写）',
      typeCli: 'cli · 无头 CLI 子代理',
      fieldDescription: '能力说明（主模型据此判断何时调用）',
      fieldCapabilities: '能力标签（逗号分隔，如 image, audio）——自定义调度依据；files 传图片要求含 image',
      fieldProvider: '服务商（空 = 跟随主模型）',
      fieldModel: '模型（空 = 继承）',
      fieldDiscover: '发现模型',
      fieldReasoning: '推理强度（可选，如 high/max）',
      fieldTemperature: '温度',
      fieldMaxTokens: '最大输出 tokens（0 = 不限制）',
      fieldMaxRounds: '对话轮数上限',
      fieldSystemPrompt: 'System prompt（空 = 默认专业助手）',
      fieldEndpoint: '端点（image / speech 类型，空 = 官方端点）',
      fieldImageSize: '图片尺寸',
      fieldApiKeyEnv: '凭据引用（image / speech 类型，空 = OPENAI_API_KEY）',
      fieldTools: '工具白名单（agent 类型，逗号分隔；空 = 全部工具但禁用 route_agent）',
      fieldCommand: 'CLI 命令（如 codex / claude / gemini，或任意可执行路径）',
      fieldCliArgs: 'CLI 参数（空格分隔，可带引号；空 = 该 CLI 的安全默认参数；codex 未显式指定 --sandbox 时按平台自动补齐）',
      fieldCliTimeout: '执行超时（分钟，0 = 默认 15 分钟）',
      fieldCliConcurrent: '并发上限（同 agent，1-4）',
      cliSystemHint: 'cli 类型的 system prompt 会以「角色设定」段落注入任务头部（各 CLI 的原生 system prompt 参数形态不一，统一用注入方式生效）。',
      cliLoginStatus: '登录状态',
      cliStatusLoggedIn: '已登录',
      cliStatusLoggedOut: '未登录',
      cliStatusUnknown: '未检测',
      cliStatusRefresh: '刷新状态',
      cliLogin: '登录（打开终端窗口）',
      cliLoginWaiting: '等待登录…',
      cliRelogin: '重新登录',
      cliRemoteMissing: '宿主未提供 cliStatus/cliLogin 接口（dsh-agent-router 宿主行可能是旧版本）：请完全退出并重启 DSH，然后强制刷新页面（Ctrl+F5）。',
      cliRemoteFailed: 'CLI 接口调用失败',
      cliLoginTimeoutHint: '等待登录超时（约 60 秒未检测到登录完成）：请在终端窗口完成授权后点「刷新状态」；若已完成登录，刷新即显示「已登录」。',
      cliFetchModels: '拉取模型',
      cliFetchingModels: '拉取中…',
      cliTitle: '子代理（无头 CLI）',
      cliSummary: (n) => `${n} 个子代理`,
      cliIntro: '无头 CLI 子代理（Codex / Claude Code / Gemini CLI 等）作为账号类条目统一管理：配置命令与参数、完成登录、拉取模型、查看用量统计；专业 Agent 把「执行方式」设为 cli 后，从下拉直接选择这里的条目作为执行路径。',
      cliAdd: '添加子代理',
      cliQuickAddHint: '点击即创建子代理条目：Codex / Claude / Gemini 已预填命令与参数（登录/状态/模型列表命令走各 CLI 预设，可在高级设置覆盖）。',
      cliCustomAdd: '＋ 自定义',
      cliCustomHint: '已创建空白子代理：请在卡片中填写 CLI 命令与参数后保存，再执行登录。',
      cliConfirmDelete: '确认删除该子代理？（引用它的专业 agent 将无法调用）',
      cliDelete: '删除子代理',
      fieldCliAgent: '子代理（账号区维护的 CLI 条目）',
      cliAgentNone: '— 未选择（使用本 agent 内嵌命令，建议迁移）—',
      cliManageHint: '登录、拉取模型与命令参数在 多模态账号 → 子代理 中维护；此处模型字段为 -m / --model 覆盖参数（空 = CLI 默认模型）。',
      cliRoutingHint: '能力标签才是调度依据：保留能力标签（如 image），主 agent 仍会按对应任务路由到此 agent，cli 只决定交给哪个子代理执行；生成图片等产物时让子代理把文件写入工作区并在结果中报告路径。宿主会向子代理注入重试纪律（同一失败最多重试 2 次即报告错误结束），避免任务长时间卡死；图片生成走子代理自身的上游服务（如 ChatGPT 图片接口）时，请保证本机网络可达（例如开启代理）。',
      advancedSection: '高级扩展（OAuth 账号 / 账号池）',
      cliLegacyHint: '旧配置：本 agent 直接内嵌命令（未引用子代理条目）。建议在 多模态账号 → 子代理 中创建条目并在此选择，便于统一登录、模型与统计。',
      fieldCliLoginArgs: '登录命令参数（空 = 该 CLI 预设）',
      fieldCliStatusArgs: '状态命令参数（空 = 该 CLI 预设）',
      fieldCliModelsArgs: '模型列表命令参数（空 = 该 CLI 预设）',
      enable: '启用',
      save: '保存',
      saved: '已保存',
      saving: '保存中…',
      delete: '删除',
      confirmDelete: '确认删除该 agent？',
      test: '测试',
      testing: '测试中…',
      effective: '生效模型：',
      sourceAgent: '本 agent 配置',
      sourceMain: '复用主模型',
      sourceProvider: '服务商默认',
      sourceUnknown: '未知',
      loadFailed: '加载失败',
      retry: '重试',
      conflict: '配置已被他人修改，请重新加载后编辑。',
      readOnly: '设置文档只读。',
      fetching: '查询中…',
      fetchTitle: '发现模型',
      fetchEmpty: '端点没有公布模型',
      adopt: '选用',
      close: '关闭',
      cancel: '取消',
      routeDisabled: '多模型路由总开关已关闭',
      noAgents: '尚未配置任何专业 agent。点击下方「+」添加。',
      testNone: '尚未测试',
      invalidId: 'id 仅允许小写字母、数字与连字符',
      duplicateId: '该 id 已存在',
      advanced: '高级设置',
      inherit: '继承',
      expand: '展开',
      collapse: '收起',
      attach: '添加附件',
      attachUnavailable: '当前输入框不可用：无法添加附件',
      attachPickTitle: '选择附件',
      attachUploadFailed: '附件上传失败',
      imageLoadFailed: '图片加载失败，点击重试',
      imagePreviewTitle: '原图预览',
      toolRouteTitle: 'route_agent · 多模型路由',
      toolRunning: '正在处理…',
      toolImageLabel: '图片',
      openFile: '打开文件',
      fileOpening: '正在读取…',
      fileOpenFailed: '文件打开失败，点击重试',
      download: '下载',
    }
    const en = {
      nav: 'Agent Routing',
      title: 'Multi-model Routing',
      intro: 'Configure specialist agents (vision, image generation, translation, speech recognition, …) with their own provider and model; unset values inherit the main agent model. Specialist Agents is the core area (expanded by default); accounts and statistics are collapsed — click a category header to expand or collapse.',
      masterSwitch: 'Enable multi-model routing',
      masterHint: 'While disabled, route_agent refuses calls, the prompt section renders empty and stats pause. The whole native plugin can also be disabled by disabling the dsh-agent-router composition row.',
      accountTitle: 'Multimodal Accounts',
      accountSummary: (n) => `${n} account(s) configured`,
      accountIntro: 'Configure an API key for any provider — official providers, third-party relays and local deployments; ChatGPT/Claude/Grok/Gemini subscription plans work through their official API keys.',
      accountOAuth: 'Note: the harness model layer currently supports API-key authentication only; official OAuth sign-in flows are not provided. Once signed in, the provider models appear in the lists above; accounts share the same storage as Settings → Models.',
      accountAddHint: 'Configuration-style add (same as the Models foundation in Settings → Models): works for any provider — official providers take their official Base URL and API key, while unintegrated providers / third-party relays / local deployments (Ollama / One-API / LM Studio) take their own endpoint. Saving registers the provider into the shared model lists; with the model field left empty, saving auto-fetches the endpoint models and writes them (except when overwriting a built-in provider), or use "Discover models" in an agent to fetch them.',
      fieldProviderId: 'Provider id (e.g. openai / my-gateway / one-api; saving overwrites an existing route of the same id)',
      accountApi: 'API type',
      accountModelsField: 'Models (optional, comma separated; a custom provider auto-fetches them from the endpoint on save when left empty)',
      accountKeyOptional: 'API Key (optional: leave empty for keyless local deployments)',
      accountBaseUrlRequired: 'Base URL (required, e.g. http://127.0.0.1:11434/v1)',
      accountAddProvider: 'Add Provider',
      accountCustom: '+ Custom',
      accountProvider: 'Provider',
      accountKey: 'API Key',
      accountBaseUrl: 'Base URL (optional, overrides the default endpoint, e.g. a proxy gateway)',
      accountDone: 'Configured',
      accountMissing: 'Missing',
      accountActive: 'Active',
      accountDormant: 'Dormant',
      accountList: 'Configured accounts',
      addAccount: 'Add Account',
      accountEditTitle: 'Edit configuration',
      accountEditHint: 'Edit Base URL or API Key, then Save (leave Key empty to keep the current credential; Base URL must not be empty).',
      accountKeyKeep: 'empty = keep current key',
      accountNoBaseUrlWarn: 'This custom provider has no Base URL: a custom provider without one voids the whole model catalog (built-in providers need none). Fill it in and save.',
      accountCatalogEmptyWarn: 'The model catalog is entirely empty: usually caused by one invalid account (a custom provider without a Base URL voids the whole llm-pi-ai catalog). Expand each account and fill in the missing Base URL, then save.',
      accountDelete: 'Delete account',
      accountModelsTitle: 'Models',
      accountConfirmDelete: 'Delete this account? (Removes the provider config and its credential.)',
      accountModels: 'models',
      accountDiscoverFailed: 'Could not fetch models from the endpoint',
      accountModelsRequiredHint: 'A custom provider must list at least one model id: check the Base URL / API key and network and retry, or type the model ids by hand',
      accountDiscoverEmpty: 'The endpoint returned no models: type the model ids by hand, or check the endpoint URL',
      accountModelsKept: 'Kept the existing model list: a custom provider must list its models to serve; edit them by hand instead',
      accountDiscovered: (n) => `Auto-discovered ${n} models from the endpoint and saved`,
      oauthTitle: 'OAuth Accounts (official sign-in, plugin-managed)',
      oauthSummary: (n) => `${n} OAuth account(s)`,
      oauthIntro: 'OAuth advanced area (self-hosted gateway / account pool scenarios). Official API reality: ChatGPT/Claude/Grok offer no OAuth on their official APIs (paste a web token into your own compatible gateway); Gemini supports OAuth but needs your own Google Cloud OAuth client (the built-in public client has been disabled by Google: the authorization page now fails with invalid_request / invalid_scope). For everyday use prefer the API-key configuration above. OAuth accounts are plugin-managed: they never register in the shared model lists and calls go through the plugin directly.',
      oauthLoginMode: 'Sign-in method',
      oauthModeCode: 'Official authorization code (OAuth2 + PKCE)',
      oauthModePaste: 'Paste access token',
      oauthToken: 'Access Token',
      oauthPaste: 'Save Token',
      oauthClientId: 'Client ID',
      oauthClientSecret: 'Client Secret (write-only, optional; public clients may leave blank)',
      oauthAuthUrl: 'Authorization endpoint',
      oauthTokenUrl: 'Token endpoint',
      oauthScope: 'Scope',
      oauthOpenUrl: 'Open authorization page',
      oauthOpenHint: 'Generates PKCE and opens the official authorization URL; afterwards paste the full redirect URL from the browser into the callback box below.',
      oauthCallbackUrl: 'Callback URL (paste the full URL the browser returned)',
      oauthExchange: 'Complete sign-in (exchange token)',
      oauthExchanging: 'Exchanging…',
      oauthOneClick: 'One-click sign-in',
      oauthOneClickHint: 'Opens the official authorization page automatically and completes the code exchange and saving by itself — no copy-paste of the callback URL.',
      oauthRedirectUriLabel: 'Redirect URI (register it in the provider console)',
      oauthPopupBlocked: 'The browser blocked the popup; allow popups for this page and retry.',
      oauthWaiting: 'Authorization page opened: complete it in the popup and the login state refreshes automatically.',
      oauthExpired: 'Authorization timed out; start again.',
      oauthDone: 'Signed in; access token saved.',
      oauthAutoDiscovering: 'Signed in: discovering models automatically…',
      oauthAfterLoginHint: 'Next step: click "Discover models" to fetch endpoint models (or type model ids by hand); then point an agent\'s "OAuth account" field at this account to start using it.',
      oauthPublicClientLimit: 'Note: Google has disabled the built-in public client — the authorization page fails with invalid_request / invalid_scope and this account cannot sign in. To actually use it: ① uncheck "built-in public OAuth client" and use your own client (create one in the Google Cloud console, callback http://127.0.0.1:3080/router-oauth/callback, scope cloud-platform + generative-language.retriever); or ② configure a Gemini API Key for provider=google under "Add account".',
      oauthFillScopes: 'Fill recommended Gemini scopes',
      oauthNeedPasteHint: 'To paste an access token or configure your own OAuth client, expand "Account & sign-in settings" below.',
      advancedLogin: 'Account & sign-in settings',
      oauthNeedRestart: 'One-click sign-in requires a DSH restart (new host callback endpoint).',
      oauthOneClickAdd: 'One-click sign-in & add',
      oauthAddOnly: 'Add only (sign in later)',
      oauthNeedClientId: 'Client ID required',
      oauthClientIdHint: 'The authorization-code flow needs your own OAuth client (create it in the provider console; register the redirect URI shown below — endpoints and scope are pre-filled by the preset).',
      oauthPublicClientLabel: 'Use built-in public OAuth client (disabled by Google, not recommended)',
      oauthPublicClientHint: 'The built-in Google Cloud SDK public client has been rejected by Google (the authorization page fails with invalid_request / invalid_scope); it is kept for compatibility only. Uncheck it and use your own client (callback http://127.0.0.1:3080/router-oauth/callback), or use a Gemini API key instead.',
      poolTitle: 'Account Pools',
      poolIntro: 'Group authorized accounts into a pool: calls pick an account by strategy (healthy first / lowest usage / round robin) and fail over to the next one automatically. An agent\'s "OAuth account" can point at a pool.',
      poolSummary: (n) => `${n} account pool(s)`,
      poolStrategy: 'Routing strategy',
      poolStrategyHealthy: 'Healthy first (fewest failures)',
      poolStrategyUsage: 'Lowest usage first',
      poolStrategyRoundRobin: 'Round robin',
      poolAccounts: 'Pool accounts',
      poolAddAccount: 'Add from authorized accounts',
      poolRemove: 'Remove',
      poolNoAccounts: 'No accounts in this pool yet: pick authorized accounts below, or use one-click sign-in on an account first.',
      poolAddPlaceholder: 'New pool id (e.g. gemini-pool)',
      addPool: 'Add Account Pool',
      poolDelete: 'Delete pool',
      poolConfirmDelete: 'Delete this account pool?',
      poolOneClick: 'One-click sign-in',
      poolOneClickAdd: 'One-click sign-in & add to pool',
      poolHealth: 'Health',
      poolAccountSource: 'account pool',
      oauthLoggedIn: 'Signed in',
      oauthNotLoggedIn: 'Not signed in',
      oauthProtocol: 'Protocol',
      oauthBaseUrl: 'Base URL',
      oauthModels: 'Models (plugin-managed)',
      oauthDiscover: 'Discover models',
      oauthDiscovering: 'Querying…',
      oauthDelete: 'Delete account',
      oauthConfirmDelete: 'Delete this OAuth account?',
      oauthAdd: 'Add OAuth Account',
      oauthCustomAdd: '+ Custom (own OAuth2 provider)',
      oauthCustomHint: 'Blank account created: fill in protocol, Base URL, auth/token endpoints, Client ID and Scope, then save and sign in.',
      oauthQuickAddHint: 'Click a provider to create the account: Gemini is created in self-client mode (fill Client ID/Secret in advanced settings, then one-click sign-in); ChatGPT/Claude/Grok suit self-hosted gateways only — point Base URL at your gateway and paste the access token.',
      oauthGeminiSelfHint: 'Gemini account created (self-client mode): ① create an OAuth client (Web) in the Google Cloud console with callback http://127.0.0.1:3080/router-oauth/callback; ② expand the card → Account & sign-in settings → fill Client ID/Secret and click "Fill recommended Gemini scopes"; ③ save, then click "One-click sign-in".',
      oauthAddedPasteHint: 'Account created: official APIs offer no OAuth — point Base URL at your self-hosted gateway, then paste the access token here.',
      oauthOpenSite: 'Open official site to sign in',
      oauthBookmark: 'Get-token bookmark',
      oauthDragBookmark: 'Drag to the bookmarks bar; afterwards one click on the official site sends the token back automatically.',
      oauthCopyBookmark: 'Copy bookmark script',
      oauthBookmarkCopied: 'Copied: paste it into the address bar on the official site and press Enter.',
      oauthGetTokenHint: 'After signing in on the official site, click the bookmark to save the token back to this account automatically.',
      oauthManualTokenHint: 'No stable public token endpoint: sign in on the official site and extract it from DevTools (Network / LocalStorage).',
      oauthTokenBack: 'Access token saved automatically.',
      oauthModelsCount: (n) => `${n} models`,
      oauthNeedConfig: 'Complete the account configuration first (Base URL, …)',
      oauthCallbackInvalid: 'No code parameter found in the callback URL',
      oauthTokenSaved: 'Token saved',
      oauthTokenSaveFailed: 'Failed to save token',
      fieldAccount: 'OAuth account (plugin-managed, overrides provider/model)',
      oauthChatOnly: 'OAuth accounts support chat type only',
      statsTitle: 'Usage Statistics',
      statsIntro: 'Realtime usage (refreshed every 2s) at agent level and account (provider) level. Cards are collapsed by default — expand for average latency, model breakdown and per-minute token distribution; stats live in memory and reset on restart.',
      statsSummary: (calls, errors) => `${calls} calls / ${errors} errors`,
      statsCalls: 'Calls',
      statsErrors: 'Errors',
      statsTokens: 'tokens (in/out)',
      statsAvg: 'Avg latency',
      statsLast: 'Last call',
      statsReset: 'Clear stats',
      statsDisabled: 'Multi-model routing is disabled',
      statsAgent: 'Agent',
      statsProvider: 'Provider / model',
      statsTime: 'Time',
      statsStatus: 'Status',
      statsOk: 'OK',
      statsFail: 'Failed',
      statsRecent: 'Recent calls',
      statsSeries: 'Tokens per minute (last 90 min)',
      statsAgentLevel: 'Agent level',
      statsAccountLevel: 'Account level (provider)',
      statsModelDetail: 'Model breakdown',
      statsNoCalls: 'No calls recorded yet',
      agentsTitle: 'Specialist Agents',
      agentsSummary: (n) => `${n} specialist agent(s)`,
      agentsIntro: 'Each specialist agent handles one capability (vision, image generation, translation, speech recognition, …) with its own provider and model. Cards are collapsed by default — click to expand and configure; unset provider/model inherits the main agent model; use "+" at the end to add one.',
      addTitle: 'Add Specialist Agent',
      addPlaceholder: 'New agent id (e.g. vision / draw)',
      add: 'Add',
      presets: 'Templates:',
      presetVision: 'Vision',
      presetImage: 'Image Generation',
      presetTranslate: 'Translation',
      presetSpeech: 'Speech Recognition',
      presetVideo: 'Video Generation',
      presetGeneral: 'General Subagent',
      cliPickerCodex: 'Codex CLI (OpenAI)',
      cliPickerClaude: 'Claude Code (Anthropic)',
      cliPickerGemini: 'Gemini CLI (Google)',
      fieldName: 'Name',
      fieldType: 'Type',
      fieldTypeHint: 'Type is only the execution path (chat calls a remote model / agent delegates a DSH subagent / image generates images / speech transcribes audio / cli runs a headless CLI subagent) — it does not limit capability. Capability tags are your custom routing contract, and files image dispatch follows them.',
      typeChat: 'chat · specialist call',
      typeAgent: 'agent · full subagent delegation',
      typeImage: 'image · image generation',
      typeSpeech: 'speech · audio transcription',
      typeCli: 'cli · headless CLI subagent',
      fieldDescription: 'Capability description (guides the main model)',
      fieldCapabilities: 'Capability tags (comma separated, e.g. image, audio) — custom routing contract; files images require image',
      fieldProvider: 'Provider (empty = inherit main model)',
      fieldModel: 'Model (empty = inherit)',
      fieldDiscover: 'Discover models',
      fieldReasoning: 'Reasoning effort (optional, e.g. high/max)',
      fieldTemperature: 'Temperature',
      fieldMaxTokens: 'Max output tokens (0 = unset)',
      fieldMaxRounds: 'Max rounds',
      fieldSystemPrompt: 'System prompt (empty = default specialist)',
      fieldEndpoint: 'Endpoint (image / speech types; empty = official endpoint)',
      fieldImageSize: 'Image size',
      fieldApiKeyEnv: 'Credential ref (image / speech types; empty = OPENAI_API_KEY)',
      fieldTools: 'Tool allow-list (agent type, comma separated; empty = all tools except route_agent)',
      fieldCommand: 'CLI command (e.g. codex / claude / gemini, or any executable path)',
      fieldCliArgs: 'CLI args (space separated, quotes allowed; empty = safe defaults for this CLI; codex auto-fills --sandbox per platform when unspecified)',
      fieldCliTimeout: 'Timeout (minutes; 0 = default 15 minutes)',
      fieldCliConcurrent: 'Concurrency cap (same agent, 1-4)',
      cliSystemHint: 'For cli type, the system prompt is injected into the task as a "role" section (CLI-specific system-prompt flags vary, so injection keeps it uniform).',
      cliLoginStatus: 'Sign-in status',
      cliStatusLoggedIn: 'Signed in',
      cliStatusLoggedOut: 'Not signed in',
      cliStatusUnknown: 'Unknown',
      cliStatusRefresh: 'Refresh status',
      cliLogin: 'Sign in (opens terminal)',
      cliLoginWaiting: 'Waiting for sign-in…',
      cliRelogin: 'Sign in again',
      cliRemoteMissing: 'The host does not provide the cliStatus/cliLogin interface (outdated dsh-agent-router host plugin): fully quit and restart DSH, then hard-refresh the page (Ctrl+F5).',
      cliRemoteFailed: 'CLI interface call failed',
      cliLoginTimeoutHint: 'Sign-in was not detected within ~60s: complete the authorization in the terminal window, then click "Refresh status"; if you already signed in, refreshing shows "Signed in".',
      cliFetchModels: 'Fetch models',
      cliFetchingModels: 'Fetching…',
      cliTitle: 'Subagents (headless CLI)',
      cliSummary: (n) => `${n} subagent(s)`,
      cliIntro: 'Headless CLI subagents (Codex / Claude Code / Gemini CLI, …) are managed as account-like entries: configure command & args, sign in, fetch models, and review usage stats. Specialist agents pick one of these entries as their execution path when their type is set to cli.',
      cliAdd: 'Add Subagent',
      cliQuickAddHint: 'Click to create a subagent entry: Codex / Claude / Gemini come pre-filled (login/status/model-list commands use per-CLI presets, overridable in advanced settings).',
      cliCustomAdd: '+ Custom',
      cliCustomHint: 'Blank subagent created: fill in the CLI command and args, save, then sign in.',
      cliConfirmDelete: 'Delete this subagent? (agents referencing it will fail to run)',
      cliDelete: 'Delete subagent',
      fieldCliAgent: 'Subagent (CLI entry maintained under accounts)',
      cliAgentNone: '— None selected (uses this agent\'s embedded command; migrate recommended) —',
      cliManageHint: 'Sign-in, model fetching and command args live under Accounts → Subagents; the model field here is the -m / --model override (empty = CLI default model).',
      cliRoutingHint: 'Capability tags drive routing: keep tags like image and the main agent still routes matching tasks here — cli only picks which subagent executes them. For artifacts such as images, have the subagent write files into the workspace and report their paths in the result. The host injects a retry discipline (max 2 retries per failure, then report and exit) to prevent long hangs; when image generation goes through the subagent\'s own upstream (e.g. ChatGPT\'s image API), the machine must be able to reach it (e.g. with a proxy on).',
      advancedSection: 'Advanced extensions (OAuth accounts / account pools)',
      cliLegacyHint: 'Legacy config: this agent embeds its own command (no subagent reference). Create an entry under Accounts → Subagents and select it here for unified sign-in, models and stats.',
      fieldCliLoginArgs: 'Login command args (empty = CLI preset)',
      fieldCliStatusArgs: 'Status command args (empty = CLI preset)',
      fieldCliModelsArgs: 'Model-list command args (empty = CLI preset)',
      enable: 'Enabled',
      save: 'Save',
      saved: 'Saved',
      saving: 'Saving…',
      delete: 'Delete',
      confirmDelete: 'Delete this agent?',
      test: 'Test',
      testing: 'Testing…',
      effective: 'Effective model: ',
      sourceAgent: 'agent config',
      sourceMain: 'inherits main model',
      sourceProvider: 'provider default',
      sourceUnknown: 'unknown',
      loadFailed: 'Load failed',
      retry: 'Retry',
      conflict: 'Settings changed elsewhere; reload and retry.',
      readOnly: 'The settings document is read-only.',
      fetching: 'Querying…',
      fetchTitle: 'Discover models',
      fetchEmpty: 'The endpoint reported no models',
      adopt: 'Adopt',
      close: 'Close',
      cancel: 'Cancel',
      routeDisabled: 'Multi-model routing master switch is off',
      noAgents: 'No specialist agents yet. Click "+" below to add one.',
      testNone: 'Not tested',
      invalidId: 'id allows lowercase letters, digits and hyphens only',
      duplicateId: 'That id already exists',
      advanced: 'Advanced',
      inherit: 'Inherit',
      expand: 'Expand',
      collapse: 'Collapse',
      attach: 'Add attachments',
      attachUnavailable: 'Cannot add attachments: the input is unavailable right now',
      attachPickTitle: 'Choose attachments',
      attachUploadFailed: 'Attachment upload failed',
      imageLoadFailed: 'Image failed to load; click to retry',
      imagePreviewTitle: 'Original image preview',
      toolRouteTitle: 'route_agent · Multi-model routing',
      toolRunning: 'Processing…',
      toolImageLabel: 'Image',
      openFile: 'Open file',
      fileOpening: 'Opening…',
      fileOpenFailed: 'Failed to open file; click to retry',
      download: 'Download',
    }

    // ── 工具函数 ────────────────────────────────────────────────────────────
    function messageOf(error) {
      return error instanceof Error ? error.message : String(error)
    }
    function deriveKeyRef(provider) {
      return `${provider.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`
    }
    const ID_PATTERN = /^[a-z][a-z0-9-]*$/
    function timeOf(at) {
      return at ? new Date(at).toLocaleTimeString() : '—'
    }
    function fmtMs(ms) {
      return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`
    }
    function fmtTokens(n) {
      if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
      if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
      return String(n)
    }

    /** 从 describe 结果中取一个 namespace view。 */
    function viewOf(namespaces, ns) {
      return namespaces.find((view) => view.ns === ns)
    }

    /**
     * 询问服务商端点公布的模型（llm.discoverModels 一次性探测，绝不落盘）：
     * - 内置目录路由直接返回目录模型（不联网）；自定义路由按 baseURL 经
     *   GET /models 询问端点；
     * - `apiKey` 一次性携带（添加流程时 profile 尚未写入，宿主无法代取
     *   已存凭据）；该参数只服务于本次探测，服务端接口不保存；
     * - 失败抛错（端点不可达 / 无模型列表 / 协议不可探测），由调用方决定
     *   后续——添加流程中止写入并给出指引，编辑流程保留现有模型列表。
     */
    async function probeProviderModels(api, request) {
      const response = await api.llm.discoverModels({
        settingsNs: 'llm-pi-ai',
        provider: request.provider,
        ...(request.baseURL ? { baseURL: request.baseURL } : {}),
        ...(request.api ? { api: request.api } : {}),
        ...(request.apiKey ? { apiKey: request.apiKey } : {}),
      })
      if (!response.result.ok) throw new Error(response.result.error.message)
      return response.result.value.models ?? []
    }

    /**
     * 把端点发现的模型组装为 llm-pi-ai profile 的 models 条目：
     * 携带端点公布的 name/contextWindow/maxTokens（宿主 schema 可接收；
     * 容量字段必须是正整数，否则丢弃、按宿主默认容量走）。
     */
    function modelEntriesOf(discovered) {
      return (discovered ?? []).map((model) => ({
        id: model.id,
        ...(typeof model.name === 'string' && model.name ? { name: model.name } : {}),
        ...(Number.isInteger(model.contextWindow) && model.contextWindow > 0 ? { contextWindow: model.contextWindow } : {}),
        ...(Number.isInteger(model.maxTokens) && model.maxTokens > 0 ? { maxTokens: model.maxTokens } : {}),
      }))
    }

    /** 专业 agent 预设模板：都是能力起点（chat/agent/image/speech 执行方式），
     *  不是 agent 类别——codex/claude/gemini 等 CLI 工具不是预设，而是任意
     *  专业 agent 在「执行方式 = cli」时可选的子代理路径（见 CLI_PICKER）。 */
    const AGENT_PRESETS = [
      { id: 'vision', key: 'presetVision', draft: { name: '视觉识别', type: 'chat', description: '识别与描述图片内容（OCR、界面截图、图表解读等；可接收 files 图片路径/URL 与对话图片附件）', capabilities: ['image'] } },
      { id: 'draw', key: 'presetImage', draft: { name: '图片生成', type: 'image', provider: 'openai', model: 'dall-e-3', description: '根据文字描述生成图片', capabilities: ['image'] } },
      { id: 'translate', key: 'presetTranslate', draft: { name: '翻译', type: 'chat', description: '多语言互译与润色', capabilities: ['translate'] } },
      { id: 'voice', key: 'presetSpeech', draft: { name: '语音识别', type: 'speech', provider: 'openai', model: 'whisper-1', description: '把音频文件转写为文字（route_agent 经 filePath 指定工作区文件）', capabilities: ['audio'] } },
      { id: 'video', key: 'presetVideo', draft: { name: '视频生成', type: 'chat', description: '视频脚本、字幕与内容生成（无通用视频生成 API：请在高级设置中配置兼容网关与模型）', capabilities: ['video'] } },
      { id: 'assistant', key: 'presetGeneral', draft: { name: '通用子 Agent', type: 'agent', description: '把复杂子任务交给独立模型的完整 agent', capabilities: [] } },
    ]

    /** cli 执行方式的可选子代理工具（codex/claude/gemini + 自定义）。
     *  账号区的「子代理」快速添加使用：选中即预填条目名称/命令/参数
     *  （登录/状态/模型命令走运行时预设，可在条目高级设置覆盖）。
     *  codex 的 args 留空 = 运行时按平台自适应补齐沙箱参数（Windows 用
     *  danger-full-access——其 OS 沙箱无法启动 WindowsApps 的 shell；
     *  其余平台 workspace-write），不要再预填旧版固定模板。 */
    const CLI_PICKER = [
      { id: '', key: 'cliCustomAdd' },
      { id: 'codex', key: 'cliPickerCodex', fill: { name: 'Codex 子代理', command: 'codex', args: '' } },
      { id: 'claude', key: 'cliPickerClaude', fill: { name: 'Claude 子代理', command: 'claude', args: '-p --output-format json --permission-mode bypassPermissions' } },
      { id: 'gemini', key: 'cliPickerGemini', fill: { name: 'Gemini 子代理', command: 'gemini', args: '-p --output-format json --yolo' } },
    ]

    /** OAuth 账号预设（官方登录）。authUrl/tokenUrl 为空的预设仅支持粘贴 token。
     *  gemini 预设默认走自建 Client（publicClient=false）：scope 为官方组合
     *  （cloud-platform + generative-language.retriever，token 可调 API）；
     *  用户需在 Google Cloud 控制台创建 OAuth Client（回调
     *  http://127.0.0.1:3080/router-oauth/callback）。内置公开 Client 仅能
     *  完成授权、其 token 被 Google 禁用于 API 调用（403 insufficient
     *  scopes），故不再作为默认。 */
    const GEMINI_OAUTH_SCOPES = 'https://www.googleapis.com/auth/cloud-platform'
    const GEMINI_SELF_CLIENT_SCOPES = 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/generative-language.retriever'
    const OAUTH_PRESETS = [
      { id: 'gemini', label: 'Gemini · Google', draft: { name: 'Gemini', protocol: 'gemini', baseURL: 'https://generativelanguage.googleapis.com/v1beta', authUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token', scope: GEMINI_SELF_CLIENT_SCOPES, publicClient: false } },
      { id: 'chatgpt', label: 'ChatGPT · OpenAI（自建网关）', draft: { name: 'ChatGPT', protocol: 'openai-completions', baseURL: 'https://api.openai.com/v1' } },
      { id: 'claude', label: 'Claude · Anthropic（自建网关）', draft: { name: 'Claude', protocol: 'anthropic', baseURL: 'https://api.anthropic.com/v1' } },
      { id: 'grok', label: 'Grok · xAI（自建网关）', draft: { name: 'Grok', protocol: 'openai-completions', baseURL: 'https://api.x.ai/v1' } },
    ]

    // ── OAuth2 PKCE 工具 ────────────────────────────────────────────────────
    function pkceBase64Url(bytes) {
      let text = ''
      for (const byte of bytes) text += String.fromCharCode(byte)
      return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    }
    function pkceVerifier() {
      const bytes = new Uint8Array(32)
      if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') globalThis.crypto.getRandomValues(bytes)
      else for (let index = 0; index < bytes.length; index++) bytes[index] = Math.floor(Math.random() * 256)
      return pkceBase64Url(bytes)
    }
    async function pkceChallenge(verifier) {
      const data = new TextEncoder().encode(verifier)
      const digest = await globalThis.crypto.subtle.digest('SHA-256', data)
      return pkceBase64Url(new Uint8Array(digest))
    }
    /** 回调地址中的 code 参数。 */
    function codeFromCallback(url) {
      try {
        const parsed = new URL(url)
        return parsed.searchParams.get('code') ?? ''
      } catch {
        return ''
      }
    }

    /** 分钟级 tokens 柱状图。 */
    function BarChart(props) {
      const { buckets, height = 30, title } = props
      const shown = (buckets ?? []).slice(-48)
      const max = Math.max(1, ...shown.map((bucket) => bucket.inputTokens + bucket.outputTokens))
      return el('div', { className: 'dshrouter-bars', title: title || undefined },
        ...shown.map((bucket) => el('div', {
          key: bucket.minute,
          className: 'dshrouter-bar' + (bucket.errors > 0 && bucket.calls === bucket.errors ? ' err' : ''),
          style: { height: `${Math.max(2, Math.round(((bucket.inputTokens + bucket.outputTokens) / max) * height))}px` },
          title: `${bucket.minute} · in ${bucket.inputTokens} / out ${bucket.outputTokens} · ${bucket.errors} err`,
        })))
    }

    /** 折叠式统计卡片（Agent 级与账号级共用的摘要+详情形态）。 */
    function StatsRowCard(props) {
      const { title, badge, meta, calls, errors, inputTokens, outputTokens, totalMs, lastAt, buckets, expanded, t, onToggle } = props
      return el('div', { className: 'dshrouter-card' },
        el('button', { type: 'button', className: 'dshrouter-card-head', onClick: onToggle, 'aria-expanded': expanded, title: expanded ? t('collapse') : t('expand') },
          el('span', { className: 'dshrouter-name' }, title),
          badge ? el('span', { className: 'dshrouter-id' }, badge) : null,
          meta ? el('span', { className: 'dshrouter-tag' }, meta) : null,
          el('span', { className: 'dshrouter-meta' }, `${t('statsCalls')} ${calls} · ${t('statsErrors')} ${errors} · ${fmtTokens(inputTokens)}/${fmtTokens(outputTokens)}`),
          el('span', { className: 'dshrouter-spacer' }),
          el('span', { className: 'dshrouter-chevron' }, expanded ? '▾' : '▸')),
        expanded ? el('div', { className: 'dshrouter-stats' },
          el('div', { className: 'dshrouter-row' },
            el('span', { className: 'dshrouter-meta' }, `${t('statsCalls')}: ${calls}`),
            el('span', { className: 'dshrouter-meta', style: errors > 0 ? { color: 'var(--dsw-alias-state-error-primary)' } : undefined }, `${t('statsErrors')}: ${errors}`),
            el('span', { className: 'dshrouter-meta' }, `${t('statsTokens')}: ${fmtTokens(inputTokens)} / ${fmtTokens(outputTokens)}`),
            el('span', { className: 'dshrouter-meta' }, `${t('statsAvg')}: ${calls > 0 ? fmtMs(totalMs / calls) : '—'}`),
            el('span', { className: 'dshrouter-meta' }, `${t('statsLast')}: ${timeOf(lastAt)}`)),
          (buckets ?? []).length > 0 ? el(BarChart, { buckets, title: t('statsSeries') }) : el('p', { className: 'dshrouter-hint' }, t('statsNoCalls'))) : null)
    }

    /** 账号级统计卡片：摘要 + 模型细分表 + 账号级柱状图。 */
    function AccountStatsCard(props) {
      const { provider, displayName, active, calls, errors, inputTokens, outputTokens, totalMs, lastAt, models, buckets, expanded, t, onToggle } = props
      return el('div', { className: 'dshrouter-card' },
        el('button', { type: 'button', className: 'dshrouter-card-head', onClick: onToggle, 'aria-expanded': expanded, title: expanded ? t('collapse') : t('expand') },
          active ? el('span', { className: 'dshrouter-dot ok', title: t('accountActive') }) : el('span', { className: 'dshrouter-dot bad', title: t('accountDormant') }),
          el('span', { className: 'dshrouter-name' }, displayName),
          el('span', { className: 'dshrouter-id' }, provider),
          active ? el('span', { className: 'dshrouter-tag' }, t('accountActive')) : el('span', { className: 'dshrouter-tag' }, t('accountDormant')),
          el('span', { className: 'dshrouter-meta' }, `${t('statsCalls')} ${calls} · ${t('statsErrors')} ${errors} · ${fmtTokens(inputTokens)}/${fmtTokens(outputTokens)}`),
          el('span', { className: 'dshrouter-spacer' }),
          el('span', { className: 'dshrouter-chevron' }, expanded ? '▾' : '▸')),
        expanded ? el('div', { className: 'dshrouter-stats' },
          el('div', { className: 'dshrouter-row' },
            el('span', { className: 'dshrouter-meta' }, `${t('statsCalls')}: ${calls}`),
            el('span', { className: 'dshrouter-meta', style: errors > 0 ? { color: 'var(--dsw-alias-state-error-primary)' } : undefined }, `${t('statsErrors')}: ${errors}`),
            el('span', { className: 'dshrouter-meta' }, `${t('statsTokens')}: ${fmtTokens(inputTokens)} / ${fmtTokens(outputTokens)}`),
            el('span', { className: 'dshrouter-meta' }, `${t('statsAvg')}: ${calls > 0 ? fmtMs(totalMs / calls) : '—'}`),
            el('span', { className: 'dshrouter-meta' }, `${t('statsLast')}: ${timeOf(lastAt)}`)),
          el('div', { className: 'dshrouter-head' }, el('span', { className: 'dshrouter-meta' }, t('statsModelDetail'))),
          models.length === 0 ? el('p', { className: 'dshrouter-hint' }, t('statsNoCalls')) : el('table', { className: 'dshrouter-table' },
            el('thead', null, el('tr', null,
              el('th', null, t('fieldModel')), el('th', null, t('statsCalls')), el('th', null, t('statsErrors')), el('th', null, t('statsTokens')), el('th', null, t('statsAvg')), el('th', null, t('statsLast')))),
            el('tbody', null, ...models.map((modelTotal) => el('tr', { key: modelTotal.model },
              el('td', null, modelTotal.model),
              el('td', null, modelTotal.calls),
              el('td', null, modelTotal.errors > 0 ? el('span', { className: 'dshrouter-error' }, modelTotal.errors) : modelTotal.errors),
              el('td', null, `${fmtTokens(modelTotal.inputTokens)} / ${fmtTokens(modelTotal.outputTokens)}`),
              el('td', null, modelTotal.calls > 0 ? fmtMs(modelTotal.totalMs / modelTotal.calls) : '—'),
              el('td', null, timeOf(modelTotal.lastAt)))))),
          buckets.length > 0 ? el(BarChart, { buckets, title: t('statsSeries') }) : null) : null)
    }

    /** 已配置账号卡片：折叠摘要 + 展开编辑（Base URL / API Key / 删除）与模型列表。 */
    function AccountCard(props) {
      const { provider, displayName, active, models, profile, total, buckets, expanded, draft, busy, notice, failure, declared, t, writable, onToggle, onField, onSave, onDiscover, onDelete } = props
      return el('div', { className: 'dshrouter-card' },
        el('button', { type: 'button', className: 'dshrouter-card-head', onClick: onToggle, 'aria-expanded': expanded, title: expanded ? t('collapse') : t('expand') },
          active ? el('span', { className: 'dshrouter-dot ok', title: t('accountDone') }) : el('span', { className: 'dshrouter-dot bad', title: t('accountDormant') }),
          el('span', { className: 'dshrouter-name' }, displayName),
          el('span', { className: 'dshrouter-id' }, provider),
          active ? el('span', { className: 'dshrouter-tag' }, t('accountActive')) : el('span', { className: 'dshrouter-tag' }, t('accountDormant')),
          el('span', { className: 'dshrouter-meta' }, `${models.length} ${t('accountModels')} · ${t('statsCalls')} ${total ? total.calls : 0} · ${total ? fmtTokens(total.inputTokens) : 0}/${total ? fmtTokens(total.outputTokens) : 0}`),
          el('span', { className: 'dshrouter-spacer' }),
          el('span', { className: 'dshrouter-chevron' }, expanded ? '▾' : '▸')),
        expanded ? el('div', { className: 'dshrouter-stats' },
          el('div', { className: 'dshrouter-head' }, el('span', { className: 'dshrouter-subtitle' }, t('accountEditTitle'))),
          el('div', { className: 'dshrouter-row' },
            el('div', { className: 'dshrouter-field' },
              el('span', { className: 'dshrouter-field-label' }, t('accountApi')),
              el('select', { className: 'dshrouter-select', value: draft.api ?? 'openai-completions', onChange: (event) => onField('api', event.target.value) },
                el('option', { value: 'openai-completions' }, 'openai-completions'),
                el('option', { value: 'openai-responses' }, 'openai-responses'),
                el('option', { value: 'anthropic-messages' }, 'anthropic-messages'))),
            el('div', { className: 'dshrouter-field' },
              el('span', { className: 'dshrouter-field-label' }, t('accountBaseUrlRequired')),
              el('input', { className: 'dshrouter-input', value: draft.baseURL ?? '', placeholder: 'https://api.openai.com/v1', onChange: (event) => onField('baseURL', event.target.value) }),
              declared === true && profile && !profile.baseURL ? el('p', { className: 'dshrouter-error' }, t('accountNoBaseUrlWarn')) : null),
            el('div', { className: 'dshrouter-field' },
              el('span', { className: 'dshrouter-field-label' }, t('accountKeyOptional')),
              el('input', { className: 'dshrouter-input', type: 'password', autoComplete: 'off', value: draft.key ?? '', placeholder: t('accountKeyKeep'), onChange: (event) => onField('key', event.target.value) })),
            el('button', {
              type: 'button', className: 'dshrouter-button',
              disabled: busy || !writable || !(draft.baseURL ?? '').trim(),
              onClick: onSave,
            }, busy ? t('saving') : t('save'))),
          el('div', { className: 'dshrouter-row' },
            el('div', { className: 'dshrouter-field' },
              el('span', { className: 'dshrouter-field-label' }, t('accountModelsField')),
              el('input', { className: 'dshrouter-input', type: 'text', value: draft.models ?? '', placeholder: t('accountModelsField'), onChange: (event) => onField('models', event.target.value) })),
            el('button', {
              type: 'button', className: 'dshrouter-button ghost',
              disabled: busy || !writable || !(draft.baseURL ?? '').trim(),
              title: (draft.baseURL ?? '').trim() ? undefined : t('accountBaseUrlRequired'),
              onClick: onDiscover,
            }, busy ? t('oauthDiscovering') : t('fieldDiscover'))),
          el('p', { className: 'dshrouter-hint' }, t('accountEditHint')),
          notice ? el('p', { className: 'dshrouter-hint' }, notice) : null,
          el('div', { className: 'dshrouter-head' }, el('span', { className: 'dshrouter-meta' }, t('accountModelsTitle'))),
          failure ? el('p', { className: 'dshrouter-error' }, `模型目录解析失败：${failure}`) : null,
          models.length === 0 ? el('p', { className: 'dshrouter-hint' }, t('accountMissing')) : el('table', { className: 'dshrouter-table' },
            el('thead', null, el('tr', null, el('th', null, t('fieldModel')), el('th', null, t('fieldName')), el('th', null, 'input'))),
            el('tbody', null, ...models.map((model) => el('tr', { key: model.id },
              el('td', null, model.id),
              el('td', null, model.name || '—'),
              el('td', null, (model.inputModalities ?? []).join(', ') || '—'))))),
          (buckets ?? []).length > 0 ? el(BarChart, { buckets, title: t('statsSeries') }) : null,
          el('div', { className: 'dshrouter-row' },
            el('span', { className: 'dshrouter-spacer' }),
            el('button', { type: 'button', className: 'dshrouter-button danger', disabled: busy || !writable, onClick: onDelete }, t('accountDelete')))) : null)
    }

    /** 账号列表末尾的「+」登录卡片。 */
    /** 账号列表末尾的「+」添加卡片：配置式表单（与「设置 → 模型」模型基座
     *  同款逻辑）——服务商 ID / 接口类型 / Base URL / 可选 API Key / 可选模型。
     *  默认模式：下拉选择已注册服务商，填 Key 即保存（对已有 profile 只写
     *  凭据不覆盖）；「＋ 自定义」切换为配置表单（覆盖式写入完整 profile）。 */
    function AddAccountCard(props) {
      const { t, adding, setAdding, account, setAccount, providers, writable, busy, failure, onLogin, accountProvider } = props
      if (!adding) {
        return el('div', { className: 'dshrouter-add', role: 'button', tabIndex: 0, onClick: () => setAdding(true), onKeyDown: (event) => { if (event.key === 'Enter') setAdding(true) } },
          el('span', { style: { fontSize: 18, lineHeight: 1 } }, '+'),
          el('span', null, t('addAccount')))
      }
      const custom = account.custom === true
      const idEmpty = !account.provider.trim()
      const urlEmpty = custom && !account.baseUrl.trim()
      const invalid = idEmpty || urlEmpty
      return el('div', { className: 'dshrouter-card' },
        el('div', { className: 'dshrouter-head' },
          el('span', { className: 'dshrouter-name' }, t('addAccount')),
          el('span', { className: 'dshrouter-spacer' }),
          el('button', { type: 'button', className: 'dshrouter-button ghost', onClick: () => { setAdding(false); setAccount((current) => ({ ...current, key: '', custom: false, models: '', failure: null })) } }, t('cancel'))),
        el('div', { className: 'dshrouter-row' },
          el('button', {
            type: 'button',
            className: 'dshrouter-chip' + (custom ? ' active' : ''),
            onClick: () => setAccount((current) => ({ ...current, custom: !current.custom, ...(current.custom ? {} : { provider: '' }), failure: null })),
          }, t('accountCustom'))),
        el('div', { className: 'dshrouter-row' },
          custom
            ? el('input', {
                className: 'dshrouter-input', style: { flex: '0 0 240px' }, type: 'text',
                placeholder: t('fieldProviderId'), 'aria-label': t('fieldProviderId'),
                value: account.provider, onChange: (event) => setAccount((current) => ({ ...current, provider: event.target.value })),
              })
            : el('select', {
                className: 'dshrouter-select', style: { flex: '0 0 240px' },
                value: account.provider,
                onChange: (event) => setAccount((current) => ({ ...current, provider: event.target.value, baseUrl: '' })),
              }, providers.filter((entry) => entry.settingsNs === 'llm-pi-ai').map((entry) =>
                el('option', { value: entry.provider, key: entry.provider }, `${entry.displayName} (${entry.provider})`))),
          custom ? el('select', {
            className: 'dshrouter-select', style: { flex: '0 0 190px' },
            value: account.api ?? 'openai-completions',
            onChange: (event) => setAccount((current) => ({ ...current, api: event.target.value })),
          },
          el('option', { value: 'openai-completions' }, 'openai-completions'),
          el('option', { value: 'openai-responses' }, 'openai-responses'),
          el('option', { value: 'anthropic-messages' }, 'anthropic-messages')) : null,
          el('input', {
            className: 'dshrouter-input', type: 'password', autoComplete: 'off',
            placeholder: custom ? t('accountKeyOptional') : t('accountKey'), 'aria-label': t('accountKey'),
            value: account.key, onChange: (event) => setAccount((current) => ({ ...current, key: event.target.value })),
          }),
          el('input', {
            className: 'dshrouter-input', type: 'text',
            placeholder: custom ? t('accountBaseUrlRequired') : t('accountBaseUrl'), 'aria-label': t('accountBaseUrl'),
            value: account.baseUrl, onChange: (event) => setAccount((current) => ({ ...current, baseUrl: event.target.value })),
          }),
          el('button', {
            type: 'button', className: 'dshrouter-button',
            disabled: busy || !writable || invalid || (!custom && !account.key.trim()),
            onClick: onLogin,
          }, busy ? t('saving') : (custom ? t('accountAddProvider') : t('save')))),
        custom ? el('div', { className: 'dshrouter-field' },
          el('span', { className: 'dshrouter-field-label' }, t('accountModelsField')),
          el('input', {
            className: 'dshrouter-input', type: 'text',
            placeholder: t('accountModelsField'), 'aria-label': t('accountModelsField'),
            value: account.models ?? '', onChange: (event) => setAccount((current) => ({ ...current, models: event.target.value })),
          })) : null,
        custom ? el('p', { className: 'dshrouter-hint' }, t('accountAddHint')) : null,
        custom && invalid ? el('p', { className: 'dshrouter-error' }, idEmpty ? t('fieldProviderId') : t('accountBaseUrlRequired')) : null,
        accountProvider ? el('p', { className: 'dshrouter-meta' }, `${accountProvider.provider} · ${accountProvider.active ? t('accountActive') : t('accountDormant')}${custom ? '（同名服务商已存在：保存将覆盖其配置）' : ''}`) : null,
        failure ? el('p', { className: 'dshrouter-error' }, failure) : null)
    }

    /** 官方站与消费级 token 提取端点（token 面向 Web 后端，适用于自建网关/中转；官方 API 不认）。 */
    function tokenSourceOf(baseURL) {
      const base = typeof baseURL === 'string' ? baseURL.trim() : ''
      if (base.includes('api.openai.com') || base.includes('chatgpt.com')) return { site: 'https://chatgpt.com', sessionUrl: 'https://chatgpt.com/api/auth/session', bookmark: true }
      if (base.includes('api.anthropic.com') || base.includes('claude.ai')) return { site: 'https://claude.ai', sessionUrl: '', bookmark: false }
      if (base.includes('api.x.ai') || base.includes('grok.com')) return { site: 'https://grok.com', sessionUrl: '', bookmark: false }
      return null
    }

    /** 一键获取 access token 的书签脚本：在官方站页面点书签 → 自动回传 DSH 保存。 */
    function tokenBookmarkletOf(accountId, sessionUrl) {
      const origin = typeof window !== 'undefined' && window.location ? window.location.origin : 'http://127.0.0.1:3080'
      return `javascript:(async()=>{try{const r=await fetch('${sessionUrl}',{credentials:'include'});const j=await r.json();if(!j||!j.accessToken){alert('未获取到 access token：请确认已登录官方站');return}location.href='${origin}/?dshrouter-account=${encodeURIComponent(accountId)}&dshrouter-token='+encodeURIComponent(j.accessToken)}catch(e){alert('提取失败：'+e.message)}})()`
    }

    /** OAuth 账号卡片（官方登录，插件独立管理；折叠摘要 + 展开配置/登录/模型）。 */
    function OAuthAccountCard(props) {
      const { id, entry, tokenState, total, buckets, expanded, draft, busy, notice, t, writable, onToggle, onDraftField, onSave, onPasteToken, onOneClick, onAuthorize, onExchange, onDiscover, onDelete } = props
      const [loginMode, setLoginMode] = useState('paste')
      const [tokenDraft, setTokenDraft] = useState('')
      const [callbackUrl, setCallbackUrl] = useState('')
      const [bookmarkCopied, setBookmarkCopied] = useState(false)
      const tokenSource = tokenSourceOf(entry ? entry.baseURL : '')
      const copyBookmark = async () => {
        try {
          await navigator.clipboard.writeText(tokenBookmarkletOf(id, tokenSource.sessionUrl))
          setBookmarkCopied(true)
          window.setTimeout(() => setBookmarkCopied(false), 3000)
        } catch { /* 剪贴板不可用：忽略 */ }
      }
      const configured = tokenState && tokenState.configured === true
      return el('div', { className: 'dshrouter-card' },
        el('button', { type: 'button', className: 'dshrouter-card-head', onClick: onToggle, 'aria-expanded': expanded, title: expanded ? t('collapse') : t('expand') },
          configured ? el('span', { className: 'dshrouter-dot ok', title: t('oauthLoggedIn') }) : el('span', { className: 'dshrouter-dot bad', title: t('oauthNotLoggedIn') }),
          el('span', { className: 'dshrouter-name' }, entry.name || id),
          el('span', { className: 'dshrouter-id' }, id),
          el('span', { className: 'dshrouter-tag' }, entry.protocol),
          el('span', { className: 'dshrouter-meta' }, t('oauthModelsCount')((entry.models ?? []).length) + ` · ${t('statsCalls')} ${total ? total.calls : 0} · ${total ? fmtTokens(total.inputTokens) : 0}/${total ? fmtTokens(total.outputTokens) : 0}`),
          el('span', { className: 'dshrouter-spacer' }),
          el('span', { className: 'dshrouter-chevron' }, expanded ? '▾' : '▸')),
        expanded ? el('div', { className: 'dshrouter-stats' },
          notice ? el('p', { className: 'dshrouter-hint' }, notice) : null,
          // ── 主流程：已登录 = 维护模型列表；未登录 = 一键授权 ──────────
          configured ? el('div', { className: 'dshrouter-stats' },
            el('div', { className: 'dshrouter-head' }, el('span', { className: 'dshrouter-subtitle' }, t('oauthModels'))),
            el('div', { className: 'dshrouter-row' },
              el('input', {
                className: 'dshrouter-input', type: 'text',
                placeholder: t('oauthModels'), 'aria-label': t('oauthModels'),
                value: (draft.models ?? []).join(', '),
                onChange: (event) => onDraftField('models', event.target.value.split(',').map((item) => item.trim()).filter(Boolean)),
              }),
              el('button', { type: 'button', className: 'dshrouter-button ghost', disabled: busy || !writable, onClick: onDiscover }, busy ? t('oauthDiscovering') : t('oauthDiscover'))),
            el('p', { className: 'dshrouter-hint' }, t('oauthAfterLoginHint')),
            draft.publicClient === true ? el('p', { className: 'dshrouter-error' }, t('oauthPublicClientLimit')) : null) : el('div', { className: 'dshrouter-stats' },
            el('div', { className: 'dshrouter-row', style: { alignItems: 'flex-end' } },
              el('button', { type: 'button', className: 'dshrouter-button', disabled: busy || !writable, onClick: onOneClick }, busy ? t('oauthWaiting') : t('oauthOneClick')),
              el('button', { type: 'button', className: 'dshrouter-button ghost', disabled: busy || !writable, onClick: onAuthorize }, t('oauthOpenUrl'))),
            el('p', { className: 'dshrouter-hint' }, t('oauthOneClickHint')),
            el('p', { className: 'dshrouter-hint' }, t('oauthNeedPasteHint'))),
          // ── 高级：账号信息与登录方式（含粘贴 token / 自建 Client）─────
          el('details', null,
            el('summary', { className: 'dshrouter-meta' }, t('advancedLogin')),
            el('div', { className: 'dshrouter-stats', style: { marginTop: 8 } },
              el('div', { className: 'dshrouter-row' },
                el('div', { className: 'dshrouter-field' },
                  el('span', { className: 'dshrouter-field-label' }, t('fieldName')),
                  el('input', { className: 'dshrouter-input', value: draft.name ?? '', onChange: (event) => onDraftField('name', event.target.value) })),
                el('div', { className: 'dshrouter-field', style: { flex: '0 0 200px' } },
                  el('span', { className: 'dshrouter-field-label' }, t('oauthProtocol')),
                  el('select', { className: 'dshrouter-select', value: draft.protocol ?? 'openai-completions', onChange: (event) => onDraftField('protocol', event.target.value) },
                    el('option', { value: 'openai-completions' }, 'openai-completions'),
                    el('option', { value: 'anthropic' }, 'anthropic'),
                    el('option', { value: 'gemini' }, 'gemini')))),
              el('div', { className: 'dshrouter-field' },
                el('span', { className: 'dshrouter-field-label' }, t('oauthBaseUrl')),
                el('input', { className: 'dshrouter-input', value: draft.baseURL ?? '', placeholder: 'https://api.openai.com/v1', onChange: (event) => onDraftField('baseURL', event.target.value) })),
              el('div', { className: 'dshrouter-head' }, el('span', { className: 'dshrouter-subtitle' }, t('oauthLoginMode'))),
              el('div', { className: 'dshrouter-row' },
                el('label', { className: 'dshrouter-switch' },
                  el('input', { type: 'radio', checked: loginMode === 'paste', onChange: () => setLoginMode('paste') }),
                  t('oauthModePaste')),
                el('label', { className: 'dshrouter-switch' },
                  el('input', { type: 'radio', checked: loginMode === 'code', onChange: () => setLoginMode('code') }),
                  t('oauthModeCode'))),
              loginMode === 'paste' ? el('div', { className: 'dshrouter-stats' },
                el('div', { className: 'dshrouter-row' },
                  el('input', {
                    className: 'dshrouter-input', type: 'password', autoComplete: 'off',
                    placeholder: t('oauthToken'), 'aria-label': t('oauthToken'),
                    value: tokenDraft, onChange: (event) => setTokenDraft(event.target.value),
                  }),
                  el('button', {
                    type: 'button', className: 'dshrouter-button',
                    disabled: busy || !tokenDraft.trim() || !writable,
                    onClick: () => { onPasteToken(tokenDraft.trim()); setTokenDraft('') },
                  }, t('oauthPaste'))),
                el('div', { className: 'dshrouter-row' },
                  tokenSource ? el('button', { type: 'button', className: 'dshrouter-button ghost', onClick: () => window.open(tokenSource.site, '_blank', 'noopener') }, t('oauthOpenSite')) : null,
                  tokenSource && tokenSource.bookmark ? el('a', {
                    className: 'dshrouter-chip', href: tokenBookmarkletOf(id, tokenSource.sessionUrl),
                    draggable: true, title: t('oauthDragBookmark'), style: { textDecoration: 'none', userSelect: 'none' },
                  }, '🔖 ' + t('oauthBookmark')) : null,
                  tokenSource && tokenSource.bookmark ? el('button', {
                    type: 'button', className: 'dshrouter-button ghost',
                    onClick: copyBookmark,
                  }, bookmarkCopied ? t('oauthBookmarkCopied') : t('oauthCopyBookmark')) : null),
                el('p', { className: 'dshrouter-hint' }, tokenSource && tokenSource.bookmark ? t('oauthGetTokenHint') : t('oauthManualTokenHint'))) : el('div', { className: 'dshrouter-row', style: { alignItems: 'flex-end' } },
                el('label', { className: 'dshrouter-switch' },
                  el('input', { type: 'checkbox', checked: draft.publicClient === true, onChange: (event) => onDraftField('publicClient', event.target.checked) }),
                  t('oauthPublicClientLabel')),
                el('div', { className: 'dshrouter-field' },
                  el('span', { className: 'dshrouter-field-label' }, t('oauthClientId')),
                  el('input', { className: 'dshrouter-input', disabled: draft.publicClient === true, value: draft.clientId ?? '', onChange: (event) => onDraftField('clientId', event.target.value) })),
                el('div', { className: 'dshrouter-field' },
                  el('span', { className: 'dshrouter-field-label' }, t('oauthClientSecret')),
                  el('input', { className: 'dshrouter-input', type: 'password', autoComplete: 'off', disabled: draft.publicClient === true, value: draft.clientSecret ?? '', onChange: (event) => onDraftField('clientSecret', event.target.value) })),
                el('div', { className: 'dshrouter-field' },
                  el('span', { className: 'dshrouter-field-label' }, t('oauthAuthUrl')),
                  el('input', { className: 'dshrouter-input', value: draft.authUrl ?? '', placeholder: 'https://…/o/oauth2/v2/auth', onChange: (event) => onDraftField('authUrl', event.target.value) })),
                el('div', { className: 'dshrouter-field' },
                  el('span', { className: 'dshrouter-field-label' }, t('oauthTokenUrl')),
                  el('input', { className: 'dshrouter-input', value: draft.tokenUrl ?? '', placeholder: 'https://…/token', onChange: (event) => onDraftField('tokenUrl', event.target.value) })),
                el('div', { className: 'dshrouter-field' },
                  el('span', { className: 'dshrouter-field-label' }, t('oauthScope')),
                  el('input', { className: 'dshrouter-input', value: draft.scope ?? '', onChange: (event) => onDraftField('scope', event.target.value) }),
                  draft.protocol === 'gemini' && draft.publicClient !== true ? el('button', {
                    type: 'button', className: 'dshrouter-chip', style: { alignSelf: 'flex-start', marginTop: 2 },
                    onClick: () => onDraftField('scope', GEMINI_SELF_CLIENT_SCOPES),
                  }, t('oauthFillScopes')) : null),
                el('button', { type: 'button', className: 'dshrouter-button', disabled: busy || !writable, onClick: onOneClick }, busy ? t('oauthWaiting') : t('oauthOneClick')),
                el('button', { type: 'button', className: 'dshrouter-button ghost', disabled: busy || !writable, onClick: onAuthorize }, t('oauthOpenUrl'))),
              loginMode === 'code' ? el('p', { className: 'dshrouter-hint' }, t('oauthOneClickHint')) : null,
              loginMode === 'code' && draft.publicClient === true ? el('p', { className: 'dshrouter-error' }, t('oauthPublicClientHint')) : null,
              loginMode === 'code' ? el('p', { className: 'dshrouter-meta' }, `${t('oauthRedirectUriLabel')}: ${draft.publicClient === true ? 'http://localhost:8085/' : `${window.location.origin}/router-oauth/callback`}`) : null,
              loginMode === 'code' ? el('div', { className: 'dshrouter-row', style: { alignItems: 'flex-end' } },
                el('input', {
                  className: 'dshrouter-input', type: 'text',
                  placeholder: t('oauthCallbackUrl'), 'aria-label': t('oauthCallbackUrl'),
                  value: callbackUrl, onChange: (event) => setCallbackUrl(event.target.value),
                }),
                el('button', {
                  type: 'button', className: 'dshrouter-button',
                  disabled: busy || !callbackUrl.trim() || !writable,
                  onClick: () => onExchange(callbackUrl.trim()),
                }, busy ? t('oauthExchanging') : t('oauthExchange'))) : null)),
          (buckets ?? []).length > 0 ? el(BarChart, { buckets, title: t('statsSeries') }) : null,
          el('div', { className: 'dshrouter-row' },
            el('button', { type: 'button', className: 'dshrouter-button', disabled: busy || !writable, onClick: onSave }, busy ? t('saving') : t('save')),
            el('span', { className: 'dshrouter-spacer' }),
            el('button', { type: 'button', className: 'dshrouter-button danger', disabled: busy || !writable, onClick: onDelete }, t('oauthDelete')))) : null)
    }

    /** OAuth 账号列表末尾的「+」创建卡片（极简：选服务商即创建 + 一键授权）。 */
    function AddOAuthCard(props) {
      const { t, adding, setAdding, onQuickAdd } = props
      if (!adding) {
        return el('div', { className: 'dshrouter-add', role: 'button', tabIndex: 0, onClick: () => setAdding(true), onKeyDown: (event) => { if (event.key === 'Enter') setAdding(true) } },
          el('span', { style: { fontSize: 18, lineHeight: 1 } }, '+'),
          el('span', null, t('oauthAdd')))
      }
      return el('div', { className: 'dshrouter-card' },
        el('div', { className: 'dshrouter-head' },
          el('span', { className: 'dshrouter-name' }, t('oauthAdd')),
          el('span', { className: 'dshrouter-spacer' }),
          el('button', { type: 'button', className: 'dshrouter-button ghost', onClick: () => setAdding(false) }, t('cancel'))),
        el('p', { className: 'dshrouter-hint' }, t('oauthQuickAddHint')),
        el('div', { className: 'dshrouter-row' },
          ...OAUTH_PRESETS.map((preset) => el('button', {
            type: 'button', key: preset.id, className: 'dshrouter-chip',
            onClick: () => onQuickAdd(preset.id),
          }, preset.label)),
          el('button', { type: 'button', className: 'dshrouter-chip', onClick: () => onQuickAdd('custom') }, t('oauthCustomAdd'))))
    }

    /** 账号池卡片：折叠摘要 + 展开配置（策略 / 池内账号一键授权与健康度 / 增删）。 */
    function PoolCard(props) {
      const { id, pool, health, oauthEntries, tokenStates, expanded, draft, busy, notice, t, writable, onToggle, onField, onSave, onDelete, onAddAccount, onRemoveAccount, onOneClickAccount, onDiscoverAccount, onOauthAddToPool } = props
      const healthById = new Map((health ?? []).map((entry) => [entry.accountId, entry]))
      const accounts = pool.accounts ?? []
      const totalCalls = (health ?? []).reduce((sum, entry) => sum + entry.calls, 0)
      const totalErrors = (health ?? []).reduce((sum, entry) => sum + entry.errors, 0)
      const summary = el('div', { className: 'dshrouter-card' },
        el('button', { type: 'button', className: 'dshrouter-card-head', onClick: onToggle, 'aria-expanded': expanded, title: expanded ? t('collapse') : t('expand') },
          el('span', { className: 'dshrouter-name' }, draft.name || id),
          el('span', { className: 'dshrouter-id' }, id),
          el('span', { className: 'dshrouter-tag' }, ({ healthy: t('poolStrategyHealthy'), 'usage-lowest': t('poolStrategyUsage'), 'round-robin': t('poolStrategyRoundRobin') }[pool.strategy] ?? pool.strategy)),
          el('span', { className: 'dshrouter-meta' }, `${accounts.length} ${t('accountModels')} · ${t('statsCalls')} ${totalCalls} · ${t('statsErrors')} ${totalErrors}`),
          el('span', { className: 'dshrouter-spacer' }),
          el('span', { className: 'dshrouter-chevron' }, expanded ? '▾' : '▸')))
      if (!expanded) return summary
      const availableAccounts = (oauthEntries ?? []).filter((entry) => !accounts.includes(entry.id))
      return el('div', { className: 'dshrouter-card' + (pool.enabled === false ? ' disabled' : '') },
        el('button', { type: 'button', className: 'dshrouter-card-head', onClick: onToggle, 'aria-expanded': expanded, title: t('collapse') },
          el('span', { className: 'dshrouter-name' }, draft.name || id),
          el('span', { className: 'dshrouter-id' }, id),
          el('span', { className: 'dshrouter-spacer' }),
          el('span', { className: 'dshrouter-chevron' }, '▾')),
        el('div', { className: 'dshrouter-row' },
          el('div', { className: 'dshrouter-field' },
            el('span', { className: 'dshrouter-field-label' }, t('fieldName')),
            el('input', { className: 'dshrouter-input', value: draft.name ?? '', onChange: (event) => onField('name', event.target.value) })),
          el('div', { className: 'dshrouter-field', style: { flex: '0 0 240px' } },
            el('span', { className: 'dshrouter-field-label' }, t('poolStrategy')),
            el('select', { className: 'dshrouter-select', value: draft.strategy ?? 'healthy', onChange: (event) => onField('strategy', event.target.value) },
              el('option', { value: 'healthy' }, t('poolStrategyHealthy')),
              el('option', { value: 'usage-lowest' }, t('poolStrategyUsage')),
              el('option', { value: 'round-robin' }, t('poolStrategyRoundRobin'))))),
        el('div', { className: 'dshrouter-head', style: { marginTop: 4 } }, el('span', { className: 'dshrouter-subtitle' }, t('poolAccounts'))),
        accounts.length === 0 ? el('p', { className: 'dshrouter-hint' }, t('poolNoAccounts')) : null,
        el('div', { className: 'dshrouter-stats' },
          ...accounts.map((accountId) => {
            const entry = (oauthEntries ?? []).find((candidate) => candidate.id === accountId)
            const tokenState = entry && entry.tokenRef ? tokenStates[entry.tokenRef] : undefined
            const configured = tokenState && tokenState.configured === true
            const healthEntry = healthById.get(accountId)
            return el('div', { className: 'dshrouter-row', key: accountId },
              configured ? el('span', { className: 'dshrouter-dot ok', title: t('oauthLoggedIn') }) : el('span', { className: 'dshrouter-dot bad', title: t('oauthNotLoggedIn') }),
              el('span', { className: 'dshrouter-name' }, entry ? entry.name || accountId : accountId),
              el('span', { className: 'dshrouter-id' }, accountId),
              el('span', { className: 'dshrouter-meta' }, `${t('poolHealth')}: ${t('statsCalls')} ${healthEntry ? healthEntry.calls : 0} / ${t('statsErrors')} ${healthEntry ? healthEntry.errors : 0}${healthEntry && healthEntry.lastAt ? ` · ${timeOf(healthEntry.lastAt)}` : ''}`),
              el('span', { className: 'dshrouter-spacer' }),
              el('button', { type: 'button', className: 'dshrouter-button ghost', disabled: !writable || !entry || !entry.authUrl || (!entry.publicClient && !entry.clientId), title: !entry || !entry.authUrl || (!entry.publicClient && !entry.clientId) ? t('oauthNeedConfig') : undefined, onClick: () => onOneClickAccount(accountId) }, t('poolOneClick')),
              el('button', { type: 'button', className: 'dshrouter-button ghost', disabled: !entry || !entry.baseURL, onClick: () => onDiscoverAccount(accountId) }, t('oauthDiscover')),
              el('button', { type: 'button', className: 'dshrouter-button danger', disabled: !writable, onClick: () => onRemoveAccount(accountId) }, t('poolRemove')))
          })),
        el('div', { className: 'dshrouter-row' },
          el('select', {
            className: 'dshrouter-select', style: { flex: '0 0 280px' },
            value: '',
            disabled: !writable,
            onChange: (event) => { if (event.target.value) onAddAccount(event.target.value) },
          },
            el('option', { value: '' }, `+ ${t('poolAddAccount')}`),
            ...availableAccounts.map((entry) => el('option', { value: entry.id, key: entry.id }, `${entry.name || entry.id} (${entry.id})`)))),
        el('div', { className: 'dshrouter-row' },
          el('span', { className: 'dshrouter-meta' }, `+ ${t('poolAddAccount')}:`),
          ...OAUTH_PRESETS.map((preset) => el('button', {
            type: 'button', key: preset.id, className: 'dshrouter-chip',
            disabled: !writable,
            onClick: () => onOauthAddToPool(id, preset.id, ''),
          }, `+ ${preset.label}`))),
        notice ? el('p', { className: 'dshrouter-hint' }, notice) : null,
        el('div', { className: 'dshrouter-row' },
          el('button', { type: 'button', className: 'dshrouter-button', disabled: busy || !writable, onClick: onSave }, busy ? t('saving') : t('save')),
          el('span', { className: 'dshrouter-spacer' }),
          el('button', { type: 'button', className: 'dshrouter-button danger', disabled: busy || !writable, onClick: onDelete }, t('poolDelete'))))
    }

    /** 账号池列表末尾的「+」创建卡片。 */
    function AddPoolCard(props) {
      const { t, adding, setAdding, newId, setNewId, idTaken, idInvalid, writable, onSave } = props
      if (!adding) {
        return el('div', { className: 'dshrouter-add', role: 'button', tabIndex: 0, onClick: () => setAdding(true), onKeyDown: (event) => { if (event.key === 'Enter') setAdding(true) } },
          el('span', { style: { fontSize: 18, lineHeight: 1 } }, '+'),
          el('span', null, t('addPool')))
      }
      return el('div', { className: 'dshrouter-card' },
        el('div', { className: 'dshrouter-head' },
          el('span', { className: 'dshrouter-name' }, t('addPool')),
          el('span', { className: 'dshrouter-spacer' }),
          el('button', { type: 'button', className: 'dshrouter-button ghost', onClick: () => { setAdding(false); setNewId('') } }, t('cancel'))),
        el('div', { className: 'dshrouter-row' },
          el('input', {
            className: 'dshrouter-input', style: { flex: '0 0 280px' },
            placeholder: t('poolAddPlaceholder'), 'aria-label': t('poolAddPlaceholder'),
            value: newId, onChange: (event) => setNewId(event.target.value.trim()),
          }),
          el('button', {
            type: 'button', className: 'dshrouter-button',
            disabled: !newId || idInvalid || idTaken || !writable,
            onClick: onSave,
          }, t('add'))),
        newId && idInvalid ? el('p', { className: 'dshrouter-error' }, t('invalidId')) : null,
        newId && idTaken ? el('p', { className: 'dshrouter-error' }, t('duplicateId')) : null)
    }

    /**
     * 分级分类卡片（页面顶层分区：专业 Agent / 多模态账号 / 统计信息）。
     * 头部整行可点击展开/收起；内部再嵌各分区自己的子卡片。
     */
    function CategoryCard(props) {
      const { title, summary, expanded, t, onToggle, children } = props
      return el('div', { className: 'dshrouter-category' },
        el('button', { type: 'button', className: 'dshrouter-category-head', onClick: onToggle, 'aria-expanded': expanded, title: expanded ? t('collapse') : t('expand') },
          el('span', { className: 'dshrouter-category-title' }, title),
          summary ? el('span', { className: 'dshrouter-meta' }, summary) : null,
          el('span', { className: 'dshrouter-spacer' }),
          el('span', { className: 'dshrouter-chevron' }, expanded ? '▾' : '▸')),
        expanded ? el('div', { className: 'dshrouter-category-body' }, ...(Array.isArray(children) ? children : [children])) : null)
    }

    // ── 页面 ────────────────────────────────────────────────────────────────
    function AgentsPage(props) {
      const { api, remote, remoteReady, t, $on } = props
      const [ready, setReady] = useState(false)
      const [state, setState] = useState({ status: 'idle' })
      const [drafts, setDrafts] = useState({})
      const [newId, setNewId] = useState('')
      const [adding, setAdding] = useState(false)
      const [busy, setBusy] = useState({})
      const [notice, setNotice] = useState({})
      const [testResults, setTestResults] = useState({})
      const [cliStates, setCliStates] = useState({})
      const [cliDrafts, setCliDrafts] = useState({})
      const [cliBusy, setCliBusy] = useState({})
      const [cliNotice, setCliNotice] = useState({})
      const [addingCli, setAddingCli] = useState(false)
      const [expandedCli, setExpandedCli] = useState({})
      const [expandedAdvanced, setExpandedAdvanced] = useState(false)
      const [discover, setDiscover] = useState(null)
      const [account, setAccount] = useState({ provider: '', baseUrl: '', key: '', custom: false, api: 'openai-completions', models: '', busy: false, failure: null, state: null })
      const [stats, setStats] = useState(null)
      const [expandedAgents, setExpandedAgents] = useState({})
      const [expandedAccounts, setExpandedAccounts] = useState({})
      const [accountDrafts, setAccountDrafts] = useState({})
      const [accountBusy, setAccountBusy] = useState({})
      const [accountNotice, setAccountNotice] = useState({})
      const [addingAccount, setAddingAccount] = useState(false)
      const [expandedStats, setExpandedStats] = useState({})
      const [expandedOauth, setExpandedOauth] = useState({})
      const [addingOauth, setAddingOauth] = useState(false)
      const [oauthDrafts, setOauthDrafts] = useState({})
      const [oauthTokenStates, setOauthTokenStates] = useState({})
      const [oauthNotice, setOauthNotice] = useState({})
      const [oauthBusy, setOauthBusy] = useState({})
      const [oauthFlow, setOauthFlow] = useState(null)
      const [expandedPools, setExpandedPools] = useState({})
      const [addingPool, setAddingPool] = useState(false)
      const [newPoolId, setNewPoolId] = useState('')
      const [poolDrafts, setPoolDrafts] = useState({})
      const [poolBusy, setPoolBusy] = useState({})
      const [poolNotice, setPoolNotice] = useState({})
      // 分级分类卡片：专业 Agent 核心区前置且默认展开；账号与统计默认折叠。
      const [expandedSection, setExpandedSection] = useState({ agents: true, accounts: false, stats: false })
      const loadRef = useRef(() => {})

      const load = useCallback(async () => {
        const routerRemote = remote()
        if (!routerRemote) {
          setState((current) => ({ ...current, status: 'error', error: t('loadFailed') + ': remote.router 未就绪（宿主行 dsh-agent-router 未挂载或 Remote 挂载失败）' }))
          return
        }
        let configResponse, providersResponse, catalogResponse, settingsResponse
        try {
          ;[configResponse, providersResponse, catalogResponse, settingsResponse] = await Promise.all([
            routerRemote.config({}),
            api.llm.providers({}),
            routerRemote.catalog({}),
            api.settings.describe({}),
          ])
        } catch (error) {
          setState((current) => ({ ...current, status: 'error', error: messageOf(error) }))
          return
        }
        if (!configResponse.ok) { setState((current) => ({ ...current, status: 'error', error: configResponse.error.message })); return }
        const config = configResponse.value
        const providers = providersResponse.result.ok ? providersResponse.result.value.providers : []
        const catalog = catalogResponse.ok ? catalogResponse.value : null
        const llmPiAi = settingsResponse.result.ok ? viewOf(settingsResponse.result.value.namespaces, 'llm-pi-ai') : null
        setState({
          status: 'ready',
          error: null,
          writable: config.writable !== false,
          revision: config.revision,
          value: config.value ?? null,
          user: config.user ?? null,
          providers,
          catalog,
          models: [],
          modelsFailure: null,
          llmPiAi,
        })
        const groupResponse = await api.llm.models({})
        if (groupResponse.result.ok) {
          setState((current) => ({ ...current, models: groupResponse.result.value.groups ?? [], modelsFailure: groupResponse.result.value.failures ?? [] }))
        }
      }, [api, remote, t])

      useEffect(() => {
        loadRef.current = load
      }, [load])

      useEffect(() => {
        let alive = true
        remoteReady.then(() => { if (alive) setReady(true) }, () => { if (alive) setReady(true) })
        return () => { alive = false }
      }, [remoteReady])

      // ── OAuth 账号 token 状态：hooks 必须先于所有条件提前返回声明，
      //    否则 status 从 idle→ready 时 hook 数量变化触发 React #310 ────
      const oauthEntries = state.catalog?.oauthAccounts ?? []
      const oauthRefsKey = oauthEntries.map((entry) => entry.tokenRef).filter(Boolean).join('|')
      const refreshOauthTokens = useCallback(async () => {
        const refs = oauthRefsKey ? oauthRefsKey.split('|') : []
        if (refs.length === 0) return
        const response = await api.credentials.describe({ refs })
        if (response.result.ok) {
          setOauthTokenStates((current) => ({ ...current, ...Object.fromEntries(Object.entries(response.result.value.credentials ?? {}).map(([ref, info]) => [ref, info])) }))
        }
      }, [api, oauthRefsKey])

      useEffect(() => {
        if (state.status === 'ready') refreshOauthTokens()
      }, [state.status, refreshOauthTokens])

      useEffect(() => {
        if (!ready) return
        load()
        // 书签回传的 access token：主页已自动写入 credentials，这里补发提示并刷新登录态。
        const tokenBack = window.sessionStorage.getItem('dshrouter-token-saved')
        if (tokenBack) {
          window.sessionStorage.removeItem('dshrouter-token-saved')
          setOauthNotice((current) => ({ ...current, [tokenBack]: t('oauthTokenBack') }))
          refreshOauthTokens()
        }
        const offSettings = $on('settings/document-updated', (ns) => {
          if (ns === 'router' || ns === 'llm-pi-ai' || ns === 'llm-deepseek' || ns === 'agent-default-model') loadRef.current()
        })
        const offCred = $on('credentials/updated', () => loadRef.current())
        const offLlm = $on('llm/adapters-updated', () => loadRef.current())
        return () => { offSettings(); offCred(); offLlm() }
      }, [ready, $on, load, refreshOauthTokens])

      // 实时用量轮询（页签打开期间每 2 秒刷新一次）
      useEffect(() => {
        if (!ready) return
        let alive = true
        const poll = () => {
          const routerRemote = remote()
          if (!routerRemote) return
          routerRemote.stats({}).then((response) => {
            if (alive && response.ok) setStats(response.value)
          }, () => undefined)
        }
        poll()
        const timer = window.setInterval(poll, 2000)
        return () => { alive = false; window.clearInterval(timer) }
      }, [ready, remote])

      const clearStats = async () => {
        const routerRemote = remote()
        if (!routerRemote) return
        await routerRemote.reset({})
        const response = await routerRemote.stats({})
        if (response.ok) setStats(response.value)
      }

      // ── cli 子代理：登录状态 / 交互式登录 / 模型列表 ──────────────────
      // 接口探测：宿主行旧版本（未重启）时 remote 缺少 cliStatus/cliLogin/
      // cliModels——一律显式报错，绝不静默失败（按钮"无效"的第一大原因）。
      const cliRemote = () => {
        const routerRemote = remote()
        if (!routerRemote) return null
        return typeof routerRemote.cliStatus === 'function' && typeof routerRemote.cliLogin === 'function' && typeof routerRemote.cliModels === 'function'
          ? routerRemote
          : null
      }

      const runCliStatus = async (id, stateKey = id) => {
        const routerRemote = cliRemote()
        if (!routerRemote) {
          setCliStates((current) => ({ ...current, [stateKey]: { ...(current[stateKey] ?? {}), statusBusy: false, statusMessage: t('cliRemoteMissing') } }))
          return
        }
        setCliStates((current) => ({ ...current, [stateKey]: { ...(current[stateKey] ?? {}), statusBusy: true } }))
        try {
          const response = await routerRemote.cliStatus({ agentId: id })
          setCliStates((current) => ({ ...current, [stateKey]: { ...(current[stateKey] ?? {}), statusBusy: false, loggedIn: response.ok ? response.value.loggedIn : undefined, statusMessage: response.ok ? response.value.message : response.error.message } }))
        } catch (error) {
          setCliStates((current) => ({ ...current, [stateKey]: { ...(current[stateKey] ?? {}), statusBusy: false, statusMessage: `${t('cliRemoteFailed')}：${messageOf(error)}` } }))
        }
      }

      const runCliLogin = async (id, stateKey = id) => {
        const routerRemote = cliRemote()
        if (!routerRemote) {
          setCliStates((current) => ({ ...current, [stateKey]: { ...(current[stateKey] ?? {}), loginBusy: false, loginError: true, loginNotice: t('cliRemoteMissing') } }))
          return
        }
        setCliStates((current) => ({ ...current, [stateKey]: { ...(current[stateKey] ?? {}), loginBusy: true, loginError: false, loginNotice: '' } }))
        try {
          const response = await routerRemote.cliLogin({ agentId: id })
          if (!response.ok) {
            setCliStates((current) => ({ ...current, [stateKey]: { ...(current[stateKey] ?? {}), loginBusy: false, loginError: true, loginNotice: response.error.message } }))
            return
          }
          setCliStates((current) => ({ ...current, [stateKey]: { ...(current[stateKey] ?? {}), loginNotice: response.value.message } }))
          // 轮询登录状态：最多 20 次 × 3 秒，登录成功即停。轮询期间 loginBusy
          // 保持 true（按钮显示「等待登录…」并禁用，防止重复弹窗）；轮询任一
          // 失败与轮询耗尽都必须复位 busy 并给出明确提示，避免按钮永久卡死。
          for (let attempt = 0; attempt < 20; attempt++) {
            await new Promise((done) => window.setTimeout(done, 3000))
            try {
              const poll = await routerRemote.cliStatus({ agentId: id })
              const loggedIn = poll.ok && poll.value.loggedIn === true
              // 每次轮询都镜像探测结果（含负向）：登录流程中状态以端点为准，
              // 轮询耗尽时 chip 与按钮如实回到「未登录」而不是残留旧值。
              setCliStates((current) => ({ ...current, [stateKey]: { ...(current[stateKey] ?? {}), loggedIn: poll.ok ? poll.value.loggedIn === true : undefined, statusMessage: poll.ok ? poll.value.message : (current[stateKey]?.statusMessage ?? '') } }))
              if (loggedIn) {
                setCliStates((current) => ({ ...current, [stateKey]: { ...(current[stateKey] ?? {}), loginBusy: false, loginError: false, loginNotice: t('cliStatusLoggedIn') + `：${poll.value.message}` } }))
                return
              }
            } catch (pollError) {
              setCliStates((current) => ({ ...current, [stateKey]: { ...(current[stateKey] ?? {}), loginBusy: false, loginError: true, loginNotice: `${t('cliRemoteFailed')}：${messageOf(pollError)}` } }))
              return
            }
          }
          // 轮询耗尽（60 秒内未检测到登录完成）：复位并指引用户手动刷新状态。
          setCliStates((current) => ({ ...current, [stateKey]: { ...(current[stateKey] ?? {}), loginBusy: false, loginError: true, loginNotice: t('cliLoginTimeoutHint') } }))
        } catch (error) {
          setCliStates((current) => ({ ...current, [stateKey]: { ...(current[stateKey] ?? {}), loginBusy: false, loginError: true, loginNotice: `${t('cliRemoteFailed')}：${messageOf(error)}` } }))
        }
      }

      const runCliModels = async (id, stateKey = id) => {
        const routerRemote = cliRemote()
        if (!routerRemote) {
          setCliStates((current) => ({ ...current, [stateKey]: { ...(current[stateKey] ?? {}), modelsMessage: t('cliRemoteMissing') } }))
          return
        }
        setCliStates((current) => ({ ...current, [stateKey]: { ...(current[stateKey] ?? {}), modelsBusy: true } }))
        try {
          const response = await routerRemote.cliModels({ agentId: id })
          setCliStates((current) => ({ ...current, [stateKey]: { ...(current[stateKey] ?? {}), modelsBusy: false, models: response.ok ? response.value.models : [], modelsMessage: response.ok ? response.value.message : response.error.message } }))
        } catch (error) {
          setCliStates((current) => ({ ...current, [stateKey]: { ...(current[stateKey] ?? {}), modelsBusy: false, modelsMessage: `${t('cliRemoteFailed')}：${messageOf(error)}` } }))
        }
      }

      // 目录就绪后自动探测 CLI 子代理条目与旧形态 cli agent 的登录状态（幂等，可手动刷新）。
      useEffect(() => {
        if (state.status !== 'ready') return
        for (const entry of state.catalog?.cliAgents ?? []) {
          if (entry.enabled === false) continue
          const cached = cliStates[entry.id]
          if (cached?.statusBusy) continue
          if (!cached || cached.loggedIn === undefined) void runCliStatus(entry.id)
        }
        for (const agent of state.catalog?.agents ?? []) {
          if (agent.type !== 'cli' || agent.cliAgent) continue
          const key = `agent:${agent.id}`
          const cached = cliStates[key]
          if (cached?.statusBusy) continue
          if (!cached || cached.loggedIn === undefined) void runCliStatus(agent.id, key)
        }
        // cliStates 不在依赖内：避免状态更新触发循环；手动刷新走按钮。
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [state.status, state.catalog])

      const mutate = useCallback(async (ops) => {
        const routerRemote = remote()
        if (!routerRemote) return { ok: false, message: t('loadFailed') }
        const response = await routerRemote.save({
          ops,
          ...(state.revision !== undefined ? { expectedRevision: state.revision } : {}),
        })
        if (!response.ok) {
          const detail = response.error && response.error.message ? response.error.message : 'save failed'
          return { ok: false, message: /conflict|moved|revision/i.test(detail) ? t('conflict') : detail }
        }
        setState((current) => ({ ...current, revision: response.value.revision }))
        await load()
        return { ok: true }
      }, [remote, state.revision, load, t])

      const agentValue = (id) => {
        const v = state.value
        return v && v.agents ? v.agents[id] : null
      }
      const defaultDraft = () => ({
        name: '', type: 'chat', enabled: true, description: '', capabilities: [],
        provider: '', model: '', account: '', reasoningEffort: '', temperature: 0, maxTokens: 0,
        maxRounds: 1, systemPrompt: '', endpoint: '', imageSize: '1024x1024', apiKeyEnv: '', tools: [],
        command: '', args: '', timeoutMs: 0, maxConcurrent: 1, cliAgent: '',
      })
      const draftOf = (id) => drafts[id] ?? agentValue(id) ?? defaultDraft()
      const setDraft = (id, patch) => setDrafts((current) => ({ ...current, [id]: { ...draftOf(id), ...patch } }))
      const setDraftField = (id, key, value) => setDraft(id, { [key]: value })

      const saveAgent = async (id, isNew) => {
        if (isNew && (!ID_PATTERN.test(id) || id === '')) return
        if (isNew && state.value?.agents?.[id]) return
        setBusy((current) => ({ ...current, [id]: true }))
        const draft = draftOf(id)
        const outcome = await mutate([{ op: 'set', path: ['agents', id], value: draft }])
        setBusy((current) => ({ ...current, [id]: false }))
        if (outcome.ok) setNotice((current) => ({ ...current, [id]: t('saved') }))
        else setNotice((current) => ({ ...current, [id]: outcome.message }))
        if (isNew) { setNewId(''); setAdding(false) }
      }

      const deleteAgent = async (id) => {
        if (!window.confirm(t('confirmDelete'))) return
        setBusy((current) => ({ ...current, [id]: true }))
        await mutate([{ op: 'unset', path: ['agents', id] }])
        setBusy((current) => ({ ...current, [id]: false }))
        setDrafts((current) => { const next = { ...current }; delete next[id]; return next })
      }

      const toggleMaster = async () => {
        await mutate([{ op: 'set', path: ['enabled'], value: !(state.value && state.value.enabled !== false) }])
      }

      const runTest = async (id) => {
        const routerRemote = remote()
        if (!routerRemote) return
        setTestResults((current) => ({ ...current, [id]: { busy: true } }))
        const response = await routerRemote.test({ agentId: id })
        setTestResults((current) => ({ ...current, [id]: { busy: false, ok: response.ok, message: response.ok ? response.value.message : response.error.message } }))
      }

      const doLogin = async () => {
        const provider = account.provider.trim()
        const key = account.key.trim()
        const custom = account.custom === true
        if (!provider) return
        if (custom && !account.baseUrl.trim()) {
          setAccount((current) => ({ ...current, failure: t('accountBaseUrlRequired') }))
          return
        }
        if (!custom && !key) return
        setAccount((current) => ({ ...current, busy: true, failure: null }))
        try {
          const ref = deriveKeyRef(provider)
          const settingsResponse = await api.settings.describe({})
          if (!settingsResponse.result.ok) throw new Error(settingsResponse.result.error.message)
          const namespaces = settingsResponse.result.value.namespaces
          const llmView = viewOf(namespaces, 'llm-pi-ai')
          if (!llmView) throw new Error('llm-pi-ai namespace 不可用：请确认该适配器已挂载')
          if (custom) {
            // 配置式添加（与「设置 → 模型」模型基座同款逻辑）：覆盖式写入
            // 完整 provider profile；无凭据 = 免鉴权本地部署直连。
            // 自定义（未内置目录）路由的 profile 必须列出模型——宿主
            // llm-pi-ai 校验器会以 "resolves no models" 拒绝无模型列表的
            // 写入。因此模型留空时，保存前自动向端点拉取一次（与账号卡片
            // 「发现模型」同款探测，apiKey 一次性携带、绝不落盘），拉到即
            // 随 profile 一并写入；拉不到则中止并给出明确指引，绝不写入
            // 半成品配置。同名内置服务商（目录路由）保持旧行为：不写
            // models 即按目录默认模型服务。
            const apiType = ['openai-completions', 'openai-responses', 'anthropic-messages'].includes(account.api) ? account.api : 'openai-completions'
            const modelIds = String(account.models ?? '').split(',').map((item) => item.trim()).filter(Boolean)
            const catalogRoute = !!(accountProvider && accountProvider.declared === false)
            let modelEntries = modelIds.length > 0 ? modelIds.map((id) => ({ id })) : null
            let autoDiscovered = 0
            if (modelIds.length === 0 && !catalogRoute) {
              let discovered
              try {
                discovered = await probeProviderModels(api, { provider, baseURL: account.baseUrl.trim(), api: apiType, apiKey: key })
              } catch (error) {
                throw new Error(`${t('accountDiscoverFailed')}：${messageOf(error)}。${t('accountModelsRequiredHint')}`)
              }
              if (discovered.length === 0) throw new Error(t('accountDiscoverEmpty'))
              modelEntries = modelEntriesOf(discovered)
              autoDiscovered = discovered.length
            }
            const profile = {
              api: apiType,
              ...(account.baseUrl.trim() ? { baseURL: account.baseUrl.trim() } : {}),
              ...(key ? { apiKeyEnv: ref } : {}),
              // 中转/本地部署常同时服务文本与多模态模型：默认输入声明含
              // image，避免 pi-ai 默认纯文本导致视觉调用被拒。
              defaultInput: ['text', 'image'],
              ...(modelEntries !== null ? { models: modelEntries } : {}),
            }
            const response = await api.settings.mutate({
              ns: 'llm-pi-ai',
              ops: [{ op: 'set', path: ['providers', provider], value: profile }],
            })
            if (!response.result.ok) throw new Error(response.result.error.message)
            if (key) {
              const stored = await api.credentials.set({ ref, value: key })
              if (!stored.result.ok) throw new Error(stored.result.error.message)
            }
            setAccount((current) => ({ ...current, busy: false, provider: '', key: '', models: '', failure: null }))
            if (autoDiscovered > 0) setAccountNotice((current) => ({ ...current, [provider]: t('accountDiscovered')(autoDiscovered) }))
            await load()
            return
          }
          // 下拉模式：对已注册服务商保存凭据；已有 profile 不覆盖。
          const existing = llmView.value && llmView.value.providers ? llmView.value.providers[provider] : undefined
          if (existing === undefined) {
            const profile = {
              apiKeyEnv: ref,
              ...(account.baseUrl.trim() ? { baseURL: account.baseUrl.trim() } : {}),
            }
            const response = await api.settings.mutate({
              ns: 'llm-pi-ai',
              ops: [{ op: 'set', path: ['providers', provider], value: profile }],
            })
            if (!response.result.ok) throw new Error(response.result.error.message)
          }
          const stored = await api.credentials.set({ ref, value: key })
          if (!stored.result.ok) throw new Error(stored.result.error.message)
          setAccount((current) => ({ ...current, busy: false, key: '', failure: null }))
          await load()
        } catch (error) {
          setAccount((current) => ({ ...current, busy: false, failure: messageOf(error) }))
        }
      }

      useEffect(() => {
        if (state.status !== 'ready') return
        let alive = true
        const ref = deriveKeyRef(account.provider)
        api.credentials.describe({ refs: [ref] }).then((response) => {
          if (alive && response.result.ok) setAccount((current) => ({ ...current, state: response.result.value.credentials[ref] ?? null }))
        }, () => undefined)
        return () => { alive = false }
      }, [state.status, account.provider, api])

      if (state.status === 'idle') return el('div', { className: 'dshrouter-section' }, el('p', { className: 'dshrouter-intro' }, '…'))
      if (state.status === 'error') {
        return el('div', { className: 'dshrouter-section' },
          el('p', { className: 'dshrouter-error' }, `${t('loadFailed')}: ${state.error}`),
          el('button', { type: 'button', className: 'dshrouter-button ghost', onClick: () => load() }, t('retry')))
      }
      const value = state.value ?? { enabled: true, agents: {} }
      const enabled = value.enabled !== false
      const agentIds = Object.keys(value.agents ?? {}).sort()
      const catalogById = new Map((state.catalog?.agents ?? []).map((entry) => [entry.id, entry]))
      const providers = state.providers ?? []
      const providerEntry = (provider) => providers.find((entry) => entry.provider === provider)
      const accountProvider = providerEntry(account.provider)
      const idTaken = agentIds.includes(newId.trim())
      const idInvalid = newId.trim() !== '' && !ID_PATTERN.test(newId.trim())

      // 统计归一视图
      const statsTotals = stats ? new Map((stats.totals ?? []).map((entry) => [entry.agentId, entry])) : new Map()
      const statsSeries = stats ? new Map((stats.series ?? []).map((entry) => [entry.agentId, entry.buckets ?? []])) : new Map()
      const accountTotalsById = stats ? new Map((stats.accountTotals ?? []).map((entry) => [entry.provider, entry])) : new Map()
      const accountSeriesById = stats ? new Map((stats.accountSeries ?? []).map((entry) => [entry.provider, entry.buckets ?? []])) : new Map()
      const recentCalls = stats ? stats.recent ?? [] : []
      const sumAll = (stats ? stats.totals ?? [] : []).reduce(
        (acc, entry) => ({ calls: acc.calls + entry.calls, errors: acc.errors + entry.errors, inTokens: acc.inTokens + entry.inputTokens, outTokens: acc.outTokens + entry.outputTokens }),
        { calls: 0, errors: 0, inTokens: 0, outTokens: 0 })

      const addFromTemplate = (template) => {
        let id = template.id
        let n = 2
        while (agentIds.includes(id)) { id = `${template.id}-${n}`; n++ }
        setNewId(id)
        setDraft(id, { ...defaultDraft(), ...template.draft })
      }
      const toggleExpanded = (id) => setExpandedAgents((current) => ({ ...current, [id]: !current[id] }))
      const toggleAccount = (provider) => setExpandedAccounts((current) => ({ ...current, [provider]: !current[provider] }))
      const toggleStatCard = (key) => setExpandedStats((current) => ({ ...current, [key]: !current[key] }))
      const toggleSection = (key) => setExpandedSection((current) => ({ ...current, [key]: !current[key] }))

      // 已添加的账号（llm-pi-ai 目录中已激活的路由 = 已配置 profile）。
      const addedAccounts = providers
        .filter((entry) => entry.settingsNs === 'llm-pi-ai' && entry.active === true)
        .map((entry) => entry.provider)
      for (const total of stats ? stats.accountTotals ?? [] : []) {
        if (!addedAccounts.includes(total.provider)) addedAccounts.push(total.provider)
      }
      addedAccounts.sort()
      const accountModelsOf = (provider) => {
        const group = (state.models ?? []).find((entry) => entry.id === provider)
        return group ? group.models ?? [] : []
      }
      const accountProfileOf = (provider) => {
        const profiles = state.llmPiAi && state.llmPiAi.value && state.llmPiAi.value.providers ? state.llmPiAi.value.providers : null
        const profile = profiles ? profiles[provider] : undefined
        return profile && typeof profile === 'object' ? profile : null
      }
      // ── 已添加账号的编辑（Base URL / API Key / 模型 / 删除）──────────
      const accountDraftOf = (provider) => {
        const profile = accountProfileOf(provider)
        const modelsText = profile && Array.isArray(profile.models) ? profile.models.map((entry) => (typeof entry === 'string' ? entry : entry?.id)).filter(Boolean).join(', ') : ''
        const apiType = profile && ['openai-completions', 'openai-responses', 'anthropic-messages'].includes(profile.api) ? profile.api : 'openai-completions'
        return { baseURL: profile && profile.baseURL ? profile.baseURL : '', key: '', api: apiType, models: modelsText, ...(accountDrafts[provider] ?? {}) }
      }
      const setAccountDraftField = (provider, field, fieldValue) => {
        setAccountDrafts((current) => ({ ...current, [provider]: { ...accountDraftOf(provider), [field]: fieldValue } }))
      }
      const saveAccount = async (provider) => {
        const draft = accountDraftOf(provider)
        if (!(draft.baseURL ?? '').trim()) {
          setAccountNotice((current) => ({ ...current, [provider]: t('accountBaseUrlRequired') }))
          return
        }
        setAccountBusy((current) => ({ ...current, [provider]: true }))
        try {
          const settingsResponse = await api.settings.describe({})
          if (!settingsResponse.result.ok) throw new Error(settingsResponse.result.error.message)
          const llmView = viewOf(settingsResponse.result.value.namespaces, 'llm-pi-ai')
          const existing = llmView && llmView.value && llmView.value.providers ? llmView.value.providers[provider] : undefined
          const apiType = ['openai-completions', 'openai-responses', 'anthropic-messages'].includes(draft.api) ? draft.api : 'openai-completions'
          const modelIds = String(draft.models ?? '').split(',').map((item) => item.trim()).filter(Boolean)
          // 内置目录路由（declared === false）不写 models 即按目录默认模型
          // 服务；其余（自定义路由 / 目录缺失）必须列出模型，清空时需先向
          // 端点拉取——与添加流程同一套探测助手。
          const catalogRoute = providerEntry(provider)?.declared === false
          let notice = t('saved')
          if (existing === undefined) {
            // 与添加流程同源：profile 首次写入时模型留空必须拉到才能写入。
            let modelEntries = modelIds.length > 0 ? modelIds.map((id) => ({ id })) : null
            if (modelIds.length === 0 && !catalogRoute) {
              let discovered
              try {
                discovered = await probeProviderModels(api, { provider, baseURL: draft.baseURL.trim(), api: apiType, apiKey: draft.key.trim() })
              } catch (error) {
                throw new Error(`${t('accountDiscoverFailed')}：${messageOf(error)}。${t('accountModelsRequiredHint')}`)
              }
              if (discovered.length === 0) throw new Error(t('accountDiscoverEmpty'))
              modelEntries = modelEntriesOf(discovered)
              notice = t('accountDiscovered')(discovered.length)
            }
            const profile = {
              api: apiType,
              baseURL: draft.baseURL.trim(),
              ...(draft.key.trim() ? { apiKeyEnv: deriveKeyRef(provider) } : {}),
              // 中转/本地部署常同时服务文本与多模态模型：路由级默认输入
              // 声明含 image，避免 pi-ai 默认纯文本导致视觉调用被拒。
              defaultInput: ['text', 'image'],
              ...(modelEntries !== null ? { models: modelEntries } : {}),
            }
            const response = await api.settings.mutate({ ns: 'llm-pi-ai', ops: [{ op: 'set', path: ['providers', provider], value: profile }] })
            if (!response.result.ok) throw new Error(response.result.error.message)
          } else {
            // 已存在 profile：Base URL / 接口类型 / 模型列表合并进一次原子
            // 写入（旧实现拆两次写入，模型列表被宿主校验器拒绝时会出现
            // 半生效状态）。
            const ops = [
              { op: 'set', path: ['providers', provider, 'baseURL'], value: draft.baseURL.trim() },
              { op: 'set', path: ['providers', provider, 'api'], value: apiType },
              { op: 'set', path: ['providers', provider, 'defaultInput'], value: ['text', 'image'] },
            ]
            if (modelIds.length > 0) {
              ops.push({ op: 'set', path: ['providers', provider, 'models'], value: modelIds.map((id) => ({ id })) })
            } else if (catalogRoute) {
              // 内置目录路由：清空 = 恢复目录默认模型。
              ops.push({ op: 'unset', path: ['providers', provider, 'models'] })
            } else {
              // 自定义路由必须列出模型：清空时自动向端点拉取；拉不到保留
              // 现有模型列表（绝不写坏已生效的配置）。
              try {
                const discovered = await probeProviderModels(api, { provider, baseURL: draft.baseURL.trim(), api: apiType, apiKey: draft.key.trim() })
                if (discovered.length > 0) {
                  ops.push({ op: 'set', path: ['providers', provider, 'models'], value: modelEntriesOf(discovered) })
                  notice = t('accountDiscovered')(discovered.length)
                } else {
                  notice = `${t('accountDiscoverEmpty')}；${t('accountModelsKept')}`
                }
              } catch (error) {
                notice = `${t('accountDiscoverFailed')}：${messageOf(error)}；${t('accountModelsKept')}`
              }
            }
            const response = await api.settings.mutate({ ns: 'llm-pi-ai', ops })
            if (!response.result.ok) throw new Error(response.result.error.message)
          }
          if (draft.key.trim()) {
            const stored = await api.credentials.set({ ref: deriveKeyRef(provider), value: draft.key.trim() })
            if (!stored.result.ok) throw new Error(stored.result.error.message)
          }
          setAccountBusy((current) => ({ ...current, [provider]: false }))
          setAccountNotice((current) => ({ ...current, [provider]: notice }))
          setAccountDrafts((current) => ({ ...current, [provider]: { baseURL: draft.baseURL.trim(), key: '' } }))
          await load()
        } catch (error) {
          setAccountBusy((current) => ({ ...current, [provider]: false }))
          setAccountNotice((current) => ({ ...current, [provider]: messageOf(error) }))
        }
      }
      const discoverAccountModels = async (provider) => {
        setAccountBusy((current) => ({ ...current, [provider]: true }))
        try {
          const draft = accountDraftOf(provider)
          const response = await api.llm.discoverModels({
            settingsNs: 'llm-pi-ai',
            provider,
            ...(draft.baseURL.trim() ? { baseURL: draft.baseURL.trim() } : {}),
            ...(['openai-completions', 'openai-responses', 'anthropic-messages'].includes(draft.api) ? { api: draft.api } : {}),
          })
          if (!response.result.ok) throw new Error(response.result.error.message)
          const existing = String(draft.models ?? '').split(',').map((item) => item.trim()).filter(Boolean)
          const merged = [...new Set([...existing, ...(response.result.value.models ?? []).map((model) => model.id)])]
          setAccountDrafts((current) => ({ ...current, [provider]: { ...accountDraftOf(provider), models: merged.join(', ') } }))
          setAccountNotice((current) => ({ ...current, [provider]: `发现 ${(response.result.value.models ?? []).length} 个模型（已合并进模型列表，点「保存」生效）` }))
        } catch (error) {
          setAccountNotice((current) => ({ ...current, [provider]: `发现模型失败：${messageOf(error)}` }))
        } finally {
          setAccountBusy((current) => ({ ...current, [provider]: false }))
        }
      }
      const removeAccount = async (provider) => {
        if (!window.confirm(t('accountConfirmDelete'))) return
        setAccountBusy((current) => ({ ...current, [provider]: true }))
        try {
          const response = await api.settings.mutate({ ns: 'llm-pi-ai', ops: [{ op: 'unset', path: ['providers', provider] }] })
          if (!response.result.ok) throw new Error(response.result.error.message)
          await api.credentials.unset({ ref: deriveKeyRef(provider) }).catch(() => undefined)
          setAccountBusy((current) => ({ ...current, [provider]: false }))
          setAccountDrafts((current) => { const next = { ...current }; delete next[provider]; return next })
          await load()
        } catch (error) {
          setAccountBusy((current) => ({ ...current, [provider]: false }))
          setAccountNotice((current) => ({ ...current, [provider]: messageOf(error) }))
        }
      }
      // 统计卡片用的账号行（激活账号 + 有调用的账号）。
      const statsAccountRows = []
      for (const entry of providers) {
        if (entry.settingsNs !== 'llm-pi-ai') continue
        const total = accountTotalsById.get(entry.provider)
        if (entry.active !== true && !total) continue
        statsAccountRows.push({
          provider: entry.provider,
          displayName: entry.displayName,
          active: entry.active === true,
          calls: total ? total.calls : 0,
          errors: total ? total.errors : 0,
          inputTokens: total ? total.inputTokens : 0,
          outputTokens: total ? total.outputTokens : 0,
          totalMs: total ? total.totalMs : 0,
          lastAt: total ? total.lastAt : undefined,
        })
      }
      for (const total of stats ? stats.accountTotals ?? [] : []) {
        if (statsAccountRows.some((row) => row.provider === total.provider)) continue
        statsAccountRows.push({
          provider: total.provider,
          displayName: total.provider,
          active: true,
          calls: total.calls,
          errors: total.errors,
          inputTokens: total.inputTokens,
          outputTokens: total.outputTokens,
          totalMs: total.totalMs,
          lastAt: total.lastAt || undefined,
        })
      }
      statsAccountRows.sort((a, b) => (a.provider < b.provider ? -1 : 1))

      // ── OAuth 账号（插件独立管理）派生与操作 ──────────────────────────
      const oauthById = new Map(oauthEntries.map((entry) => [entry.id, entry]))
      const oauthIds = oauthEntries.map((entry) => entry.id).sort()
      const defaultOauthDraft = () => ({
        name: '', enabled: true, protocol: 'openai-completions', baseURL: '',
        clientId: '', clientSecret: '', publicClient: false, authUrl: '', tokenUrl: '', scope: '', models: [],
      })
      const oauthDraftOf = (id) => {
        const entry = oauthById.get(id)
        const base = entry ? { name: entry.name, enabled: entry.enabled, protocol: entry.protocol, baseURL: entry.baseURL, clientId: entry.clientId, publicClient: entry.publicClient === true, authUrl: entry.authUrl, tokenUrl: entry.tokenUrl, scope: entry.scope, models: entry.models ?? [] } : defaultOauthDraft()
        return { ...base, clientSecret: '', ...(oauthDrafts[id] ?? {}) }
      }
      const setOauthDraft = (id, patch) => setOauthDrafts((current) => ({ ...current, [id]: { ...oauthDraftOf(id), ...patch } }))

      const saveOauthAccount = async (id, isNew) => {
        if (isNew && (!ID_PATTERN.test(id) || id === '')) return
        if (isNew && oauthById.has(id)) return
        setOauthBusy((current) => ({ ...current, [id]: true }))
        const draft = oauthDraftOf(id)
        let ops
        if (isNew) {
          ops = [{ op: 'set', path: ['oauthAccounts', id], value: { ...draft, clientSecret: undefined, tokenRef: `ROUTER_OAUTH_${id.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_TOKEN` } }]
        } else {
          ops = ['name', 'enabled', 'protocol', 'baseURL', 'clientId', 'publicClient', 'authUrl', 'tokenUrl', 'scope'].map((field) => ({ op: 'set', path: ['oauthAccounts', id, field], value: draft[field] ?? '' }))
          ops.push({ op: 'set', path: ['oauthAccounts', id, 'models'], value: draft.models ?? [] })
          if (draft.clientSecret && draft.clientSecret.trim()) {
            ops.push({ op: 'set', path: ['oauthAccounts', id, 'clientSecret'], value: draft.clientSecret.trim() })
          }
        }
        const outcome = await mutate(ops)
        setOauthBusy((current) => ({ ...current, [id]: false }))
        setOauthNotice((current) => ({ ...current, [id]: outcome.ok ? t('saved') : outcome.message }))
        if (outcome.ok && isNew) setAddingOauth(false)
        if (outcome.ok) setOauthDrafts((current) => ({ ...current, [id]: { ...oauthDraftOf(id), clientSecret: '' } }))
      }

      const deleteOauthAccount = async (id) => {
        if (!window.confirm(t('oauthConfirmDelete'))) return
        const entry = oauthById.get(id)
        if (entry && entry.tokenRef) await api.credentials.unset({ ref: entry.tokenRef }).catch(() => undefined)
        await mutate([{ op: 'unset', path: ['oauthAccounts', id] }])
      }

      /** 快速添加账号：点服务商预设即创建账号；Gemini 立即一键授权，其余提示粘贴 token。
       *  'custom' 创建空白账号（自建 OAuth2 服务商：中转/自托管），展开卡片手动配置。 */
      const quickAddOauthAccount = async (presetId) => {
        if (presetId === 'custom') {
          let accountId = 'custom'
          let n = 2
          while (oauthById.has(accountId)) { accountId = `custom-${n++}` }
          const tokenRef = `ROUTER_OAUTH_${accountId.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_TOKEN`
          const outcome = await mutate([{ op: 'set', path: ['oauthAccounts', accountId], value: {
            name: '自定义',
            enabled: true,
            protocol: 'openai-completions',
            baseURL: '',
            clientId: '',
            publicClient: false,
            authUrl: '',
            tokenUrl: '',
            scope: '',
            models: [],
            tokenRef,
          } }])
          if (!outcome.ok) { setOauthNotice((current) => ({ ...current, [accountId]: outcome.message })); return }
          setAddingOauth(false)
          setExpandedOauth((current) => ({ ...current, [accountId]: true }))
          setOauthNotice((current) => ({ ...current, [accountId]: t('oauthCustomHint') }))
          return
        }
        const preset = OAUTH_PRESETS.find((entry) => entry.id === presetId)
        if (!preset) return
        let accountId = preset.id
        let n = 2
        while (oauthById.has(accountId)) { accountId = `${preset.id}-${n++}` }
        const tokenRef = `ROUTER_OAUTH_${accountId.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_TOKEN`
        const value = {
          name: preset.draft.name ?? preset.id,
          enabled: true,
          protocol: preset.draft.protocol ?? 'openai-completions',
          baseURL: preset.draft.baseURL ?? '',
          clientId: '',
          publicClient: preset.draft.publicClient === true,
          authUrl: preset.draft.authUrl ?? '',
          tokenUrl: preset.draft.tokenUrl ?? '',
          scope: preset.draft.scope ?? '',
          models: preset.draft.models ?? [],
          tokenRef,
        }
        const outcome = await mutate([{ op: 'set', path: ['oauthAccounts', accountId], value }])
        if (!outcome.ok) { setOauthNotice((current) => ({ ...current, [accountId]: outcome.message })); return }
        setAddingOauth(false)
        if (preset.draft.authUrl && (preset.draft.publicClient === true || preset.draft.clientId)) {
          await runOneClickOauth(accountId, tokenRef)
        } else if (preset.draft.protocol === 'gemini') {
          // 自建 Client 形态：引导用户填写 Client 配置后一键授权。
          setOauthNotice((current) => ({ ...current, [accountId]: t('oauthGeminiSelfHint') }))
          setExpandedOauth((current) => ({ ...current, [accountId]: true }))
        } else {
          setOauthNotice((current) => ({ ...current, [accountId]: t('oauthAddedPasteHint') }))
          setExpandedOauth((current) => ({ ...current, [accountId]: true }))
        }
      }

      // ── 子代理（无头 CLI 条目：账号区维护，专业 agent 经 cliAgent 引用）──
      const cliEntries = state.catalog?.cliAgents ?? []
      const cliEntriesById = new Map(cliEntries.map((entry) => [entry.id, entry]))
      const cliEntryIds = cliEntries.map((entry) => entry.id).sort()
      const cliValue = (id) => state.value && state.value.cliAgents ? state.value.cliAgents[id] ?? null : null
      const defaultCliDraft = () => ({
        name: '', enabled: true, command: '', args: '', timeoutMs: 0, maxConcurrent: 1,
        loginArgs: '', statusArgs: '', modelsArgs: '',
      })
      const cliDraftOf = (id) => {
        const entry = cliValue(id)
        const base = entry
          ? { name: entry.name, enabled: entry.enabled, command: entry.command, args: entry.args, timeoutMs: entry.timeoutMs, maxConcurrent: entry.maxConcurrent, loginArgs: entry.loginArgs, statusArgs: entry.statusArgs, modelsArgs: entry.modelsArgs }
          : defaultCliDraft()
        return { ...base, ...(cliDrafts[id] ?? {}) }
      }
      const setCliDraft = (id, patch) => setCliDrafts((current) => ({ ...current, [id]: { ...cliDraftOf(id), ...patch } }))

      const saveCliAgent = async (id, isNew) => {
        if (isNew && (!ID_PATTERN.test(id) || id === '')) return
        if (isNew && cliEntriesById.has(id)) return
        setCliBusy((current) => ({ ...current, [id]: true }))
        const draft = cliDraftOf(id)
        const outcome = await mutate([{ op: 'set', path: ['cliAgents', id], value: draft }])
        setCliBusy((current) => ({ ...current, [id]: false }))
        setCliNotice((current) => ({ ...current, [id]: outcome.ok ? t('saved') : outcome.message }))
        if (outcome.ok && isNew) setAddingCli(false)
        if (outcome.ok) setCliDrafts((current) => ({ ...current, [id]: { ...cliDraftOf(id) } }))
      }

      const deleteCliAgent = async (id) => {
        if (!window.confirm(t('cliConfirmDelete'))) return
        await mutate([{ op: 'unset', path: ['cliAgents', id] }])
        setCliDrafts((current) => { const next = { ...current }; delete next[id]; return next })
      }

      /** 快速添加子代理条目：'custom' 空白；其余按 CLI_PICKER 预填名称/命令/参数。 */
      const quickAddCli = async (kind) => {
        let id = kind === 'custom' ? 'custom' : kind
        if (!id) return
        let n = 2
        while (cliEntriesById.has(id)) { id = `${kind === 'custom' ? 'custom' : kind}-${n++}` }
        const pick = CLI_PICKER.find((entry) => entry.id === kind)
        const draft = pick?.fill
          ? { name: pick.fill.name, enabled: true, command: pick.fill.command, args: pick.fill.args, timeoutMs: 0, maxConcurrent: 1, loginArgs: '', statusArgs: '', modelsArgs: '' }
          : defaultCliDraft()
        const outcome = await mutate([{ op: 'set', path: ['cliAgents', id], value: draft }])
        if (!outcome.ok) { setCliNotice((current) => ({ ...current, [id]: outcome.message })); return }
        setAddingCli(false)
        setExpandedCli((current) => ({ ...current, [id]: true }))
        setCliNotice((current) => ({ ...current, [id]: pick?.fill ? t('saved') : t('cliCustomHint') }))
        void runCliStatus(id)
      }

      const pasteOauthToken = async (id, token) => {
        const entry = oauthById.get(id)
        if (!entry || !entry.tokenRef) { setOauthNotice((current) => ({ ...current, [id]: t('oauthNeedConfig') })); return }
        setOauthBusy((current) => ({ ...current, [id]: true }))
        const stored = await api.credentials.set({ ref: entry.tokenRef, value: token })
        setOauthBusy((current) => ({ ...current, [id]: false }))
        setOauthNotice((current) => ({ ...current, [id]: stored.result.ok ? t('oauthTokenSaved') : stored.result.error.message }))
        refreshOauthTokens()
      }

      /**
       * 一键授权登录：宿主生成 PKCE+state 并返回授权 URL，弹窗完成授权后
       * 服务商重定向到宿主回调页（/router-oauth/callback）自动交换 token；
       * 本页轮询凭据状态，成功后自动关闭弹窗并刷新登录态。
       * tokenRefOverride：刚创建/保存的账号尚未进入本渲染闭包的目录时，
       * 由调用方传入确定性构造的凭据引用（`ROUTER_OAUTH_<ID>_TOKEN`）。
       */
      const runOneClickOauth = async (id, tokenRefOverride) => {
        const entry = oauthById.get(id)
        const draft = oauthDraftOf(id)
        const tokenRef = tokenRefOverride ?? (entry ? entry.tokenRef : undefined)
        if (!draft.authUrl || (!draft.publicClient && !draft.clientId) || !tokenRef) {
          setOauthNotice((current) => ({ ...current, [id]: t('oauthNeedConfig') }))
          return
        }
        const routerRemote = remote()
        if (!routerRemote || typeof routerRemote.oauthBegin !== 'function') {
          setOauthNotice((current) => ({ ...current, [id]: t('oauthNeedRestart') }))
          return
        }
        const redirectUri = window.location.origin + '/router-oauth/callback'
        setOauthBusy((current) => ({ ...current, [id]: true }))
        const response = await routerRemote.oauthBegin({ accountId: id, redirectUri })
        setOauthBusy((current) => ({ ...current, [id]: false }))
        if (!response.ok) {
          setOauthNotice((current) => ({ ...current, [id]: response.error.message }))
          return
        }
        let popup
        try {
          popup = window.open(response.value.authUrl, 'dsh-agent-router-oauth', 'popup,width=520,height=680')
        } catch {
          popup = null
        }
        if (!popup) {
          setOauthNotice((current) => ({ ...current, [id]: t('oauthPopupBlocked') }))
          return
        }
        setOauthNotice((current) => ({ ...current, [id]: t('oauthWaiting') }))
        const ref = tokenRef
        const deadline = Date.now() + 3 * 60 * 1000
        const poll = async () => {
          if (popup.closed || Date.now() > deadline) {
            if (Date.now() > deadline) setOauthNotice((current) => ({ ...current, [id]: t('oauthExpired') }))
            return
          }
          let configured = false
          try {
            const describe = await api.credentials.describe({ refs: [ref] })
            configured = !!describe.result.ok && (describe.result.value.credentials ?? {})[ref]?.configured === true
          } catch {
            // 网络瞬时失败：继续轮询。
          }
          if (configured) {
            setOauthNotice((current) => ({ ...current, [id]: t('oauthAutoDiscovering') }))
            refreshOauthTokens()
            try { popup.close() } catch { /* 已由用户关闭 */ }
            // 授权成功后的下一步是模型列表：自动触发一次发现模型（等
            // load() 刷新账号目录后执行；失败则提示用户手动重试）。
            window.setTimeout(() => discoverOauth(id), 800)
            return
          }
          window.setTimeout(poll, 1200)
        }
        window.setTimeout(poll, 1000)
      }

      const openOauthAuthorize = async (id) => {
        const draft = oauthDraftOf(id)
        if (!draft.authUrl || !draft.clientId) { setOauthNotice((current) => ({ ...current, [id]: t('oauthNeedConfig') })); return }
        const verifier = pkceVerifier()
        const challenge = await pkceChallenge(verifier)
        const redirectUri = window.location.origin + '/'
        const params = new URLSearchParams({
          response_type: 'code',
          client_id: draft.clientId,
          redirect_uri: redirectUri,
          code_challenge: challenge,
          code_challenge_method: 'S256',
          state: `router-${id}`,
        })
        // 旧 Gemini scope 迁移：含旧名（且不含新名）时替换为现行组合。
        const scopeText = typeof draft.scope === 'string' && draft.scope.trim() ? draft.scope.trim() : ''
        if (scopeText) {
          params.set('scope', scopeText.includes('generativelanguage') && !scopeText.includes('generative-language') ? GEMINI_SELF_CLIENT_SCOPES : scopeText)
        }
        setOauthFlow({ accountId: id, verifier, redirectUri })
        window.open(`${draft.authUrl}?${params.toString()}`, '_blank', 'noopener')
        setOauthNotice((current) => ({ ...current, [id]: t('oauthOpenHint') }))
      }

      const exchangeOauthCode = async (id, callbackUrl) => {
        const code = codeFromCallback(callbackUrl)
        if (!code) { setOauthNotice((current) => ({ ...current, [id]: t('oauthCallbackInvalid') })); return }
        if (!oauthFlow || oauthFlow.accountId !== id) { setOauthNotice((current) => ({ ...current, [id]: t('oauthOpenHint') })); return }
        setOauthBusy((current) => ({ ...current, [id]: true }))
        const response = await remote().oauthTokenExchange({ accountId: id, code, codeVerifier: oauthFlow.verifier, redirectUri: oauthFlow.redirectUri })
        setOauthBusy((current) => ({ ...current, [id]: false }))
        setOauthNotice((current) => ({ ...current, [id]: response.ok ? response.value.message : response.error.message }))
        if (response.ok) { setOauthFlow(null); refreshOauthTokens() }
      }

      const discoverOauth = async (id) => {
        setOauthBusy((current) => ({ ...current, [id]: true }))
        const response = await remote().oauthDiscover({ accountId: id })
        setOauthBusy((current) => ({ ...current, [id]: false }))
        if (!response.ok) { setOauthNotice((current) => ({ ...current, [id]: `发现模型失败：${response.error.message}（可稍后重试）` })); return }
        const entry = oauthById.get(id)
        const merged = [...new Set([...(entry ? entry.models ?? [] : []), ...response.value.models])]
        const outcome = await mutate([{ op: 'set', path: ['oauthAccounts', id, 'models'], value: merged }])
        // 0 个模型时直接展示服务端诊断信息（响应形状与样例），便于定位。
        const count = response.value.models.length
        setOauthNotice((current) => ({ ...current, [id]: outcome.ok ? (count > 0 ? `已发现 ${count} 个模型并合并到模型列表` : response.value.message) : outcome.message }))
      }

      // ── 账号池（插件独立管理）派生与操作 ──────────────────────────────
      const poolEntries = state.catalog?.pools ?? []
      const poolById = new Map(poolEntries.map((entry) => [entry.id, entry]))
      const poolIds = poolEntries.map((entry) => entry.id).sort()
      const valuePools = state.value && state.value.pools ? state.value.pools : {}
      const poolIdsTaken = Object.keys(valuePools).sort()
      const poolIdInvalid = newPoolId.trim() !== '' && !ID_PATTERN.test(newPoolId.trim())
      const poolDraftOf = (id) => {
        const entry = poolById.get(id)
        const stored = valuePools[id] ?? null
        const base = entry
          ? { name: entry.name, enabled: entry.enabled, strategy: entry.strategy, accounts: entry.accounts ?? [] }
          : stored
            ? { name: stored.name ?? '', enabled: stored.enabled !== false, strategy: stored.strategy ?? 'healthy', accounts: stored.accounts ?? [] }
            : { name: '', enabled: true, strategy: 'healthy', accounts: [] }
        return { ...base, ...(poolDrafts[id] ?? {}) }
      }
      const setPoolDraft = (id, patch) => setPoolDrafts((current) => ({ ...current, [id]: { ...poolDraftOf(id), ...patch } }))

      const savePool = async (id, isNew) => {
        if (isNew && (!ID_PATTERN.test(id) || id === '')) return
        if (isNew && valuePools[id]) return
        setPoolBusy((current) => ({ ...current, [id]: true }))
        const draft = poolDraftOf(id)
        const value = { name: draft.name ?? '', enabled: draft.enabled !== false, strategy: draft.strategy ?? 'healthy', accounts: draft.accounts ?? [] }
        const outcome = await mutate([{ op: 'set', path: ['pools', id], value }])
        setPoolBusy((current) => ({ ...current, [id]: false }))
        setPoolNotice((current) => ({ ...current, [id]: outcome.ok ? t('saved') : outcome.message }))
        if (outcome.ok && isNew) { setNewPoolId(''); setAddingPool(false) }
      }

      const deletePool = async (id) => {
        if (!window.confirm(t('poolConfirmDelete'))) return
        await mutate([{ op: 'unset', path: ['pools', id] }])
        setPoolDrafts((current) => { const next = { ...current }; delete next[id]; return next })
      }

      const addAccountToPool = async (poolId, accountId) => {
        const draft = poolDraftOf(poolId)
        if ((draft.accounts ?? []).includes(accountId)) return
        const outcome = await mutate([{ op: 'set', path: ['pools', poolId, 'accounts'], value: [...(draft.accounts ?? []), accountId] }])
        setPoolNotice((current) => ({ ...current, [poolId]: outcome.ok ? t('saved') : outcome.message }))
      }

      const removeAccountFromPool = async (poolId, accountId) => {
        const draft = poolDraftOf(poolId)
        const outcome = await mutate([{ op: 'set', path: ['pools', poolId, 'accounts'], value: (draft.accounts ?? []).filter((item) => item !== accountId) }])
        setPoolNotice((current) => ({ ...current, [poolId]: outcome.ok ? t('saved') : outcome.message }))
      }

      /** 池内「一键授权并加入池」：按预设创建账号 → 入池 → 立即一键授权。
       *  clientId 留空 = 使用内置公开 OAuth Client（零配置）。 */
      const oauthAddToPool = async (poolId, presetId, clientId) => {
        const preset = OAUTH_PRESETS.find((entry) => entry.id === presetId)
        if (!preset) return
        const ownClient = typeof clientId === 'string' && clientId.trim() !== ''
        let accountId = preset.id
        let n = 2
        while (oauthById.has(accountId)) { accountId = `${preset.id}-${n++}` }
        const value = {
          name: preset.draft.name ?? preset.id,
          enabled: true,
          protocol: preset.draft.protocol ?? 'openai-completions',
          baseURL: preset.draft.baseURL ?? '',
          clientId: ownClient ? clientId.trim() : '',
          publicClient: !ownClient,
          authUrl: preset.draft.authUrl ?? '',
          tokenUrl: preset.draft.tokenUrl ?? '',
          scope: preset.draft.scope ?? '',
          models: preset.draft.models ?? [],
          tokenRef: `ROUTER_OAUTH_${accountId.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_TOKEN`,
        }
        const outcome = await mutate([{ op: 'set', path: ['oauthAccounts', accountId], value }])
        if (!outcome.ok) { setPoolNotice((current) => ({ ...current, [poolId]: outcome.message })); return }
        const joined = await mutate([{ op: 'set', path: ['pools', poolId, 'accounts'], value: [...(poolDraftOf(poolId).accounts ?? []), accountId] }])
        if (!joined.ok) { setPoolNotice((current) => ({ ...current, [poolId]: joined.message })); return }
        if (preset.draft.authUrl) await runOneClickOauth(accountId, value.tokenRef)
        else setPoolNotice((current) => ({ ...current, [poolId]: t('oauthNeedConfig') }))
      }

      // ── 分级分类卡片组装：专业 Agent 前置且默认展开，账号与统计默认折叠 ──
      const sectionHead = [
        el('h2', { className: 'dshrouter-title' }, t('title')),
        el('p', { className: 'dshrouter-intro' }, t('intro')),
        // ── 总开关（唯一不折叠，置顶）────────────────────────────────────
        el('div', { className: 'dshrouter-card' },
          el('label', { className: 'dshrouter-switch' },
            el('input', { type: 'checkbox', checked: enabled, disabled: !state.writable, onChange: toggleMaster }),
            t('masterSwitch')),
          el('p', { className: 'dshrouter-hint' }, t('masterHint')),
          !enabled ? el('p', { className: 'dshrouter-error' }, t('routeDisabled')) : null),
      ]
      // ── 多模态账号（API Key → 子代理 → 高级扩展[OAuth+账号池，默认折叠]）──
      const accountsBody = [
        el('p', { className: 'dshrouter-intro' }, t('accountIntro')),
        el('p', { className: 'dshrouter-hint' }, t('accountOAuth')),
        // llm-pi-ai 整体解析：任一账号无效（如缺 Base URL）会使整个模型
        // 目录回退为空（groups 与 failures 同时为空）——显式警示引导修复。
        addedAccounts.length > 0 && (state.models ?? []).length === 0 && (state.modelsFailure ?? []).length === 0
          ? el('p', { className: 'dshrouter-error' }, t('accountCatalogEmptyWarn'))
          : null,
        addedAccounts.length === 0 ? el('p', { className: 'dshrouter-hint' }, t('accountMissing')) : null,
        ...addedAccounts.map((provider) => {
          const entry = providerEntry(provider)
          const total = accountTotalsById.get(provider)
          return el(AccountCard, {
            key: provider,
            provider,
            displayName: entry ? entry.displayName : provider,
            active: entry ? entry.active === true : true,
            models: accountModelsOf(provider),
            profile: accountProfileOf(provider),
            total,
            buckets: accountSeriesById.get(provider) ?? [],
            expanded: expandedAccounts[provider] === true,
            draft: accountDraftOf(provider),
            busy: !!accountBusy[provider],
            notice: accountNotice[provider],
            failure: (state.modelsFailure ?? []).find((item) => item.id === provider)?.message ?? '',
            declared: entry ? entry.declared === true : false,
            t,
            writable: state.writable,
            onToggle: () => toggleAccount(provider),
            onField: (field, fieldValue) => setAccountDraftField(provider, field, fieldValue),
            onSave: () => saveAccount(provider),
            onDiscover: () => discoverAccountModels(provider),
            onDelete: () => removeAccount(provider),
          })
        }),
        el(AddAccountCard, {
          t, adding: addingAccount, setAdding: setAddingAccount,
          account, setAccount, providers, writable: state.writable, busy: account.busy,
          failure: account.failure, accountProvider,
          onLogin: doLogin,
        }),
        // ── 子代理（无头 CLI：codex/claude/gemini 等账号类条目，第二位）──
        el('hr', { className: 'dshrouter-divider' }),
        el('div', { className: 'dshrouter-head' },
          el('span', { className: 'dshrouter-subtitle' }, t('cliTitle')),
          el('span', { className: 'dshrouter-spacer' }),
          el('span', { className: 'dshrouter-meta' }, t('cliSummary')(cliEntryIds.length))),
        el('p', { className: 'dshrouter-hint' }, t('cliIntro')),
        cliEntryIds.length === 0 ? el('p', { className: 'dshrouter-hint' }, t('accountMissing')) : null,
        ...cliEntryIds.map((id) => {
          const entry = cliEntriesById.get(id)
          const total = accountTotalsById.get(`cli:${id}`)
          return el(CliAgentCard, {
            key: id, id, entry, total,
            expanded: expandedCli[id] === true,
            draft: cliDraftOf(id),
            busy: !!cliBusy[id],
            notice: cliNotice[id],
            cliState: cliStates[id],
            t, writable: state.writable,
            onToggle: () => setExpandedCli((current) => ({ ...current, [id]: !current[id] })),
            onField: (field, fieldValue) => setCliDraft(id, { [field]: fieldValue }),
            onSave: () => saveCliAgent(id, false),
            onDelete: () => deleteCliAgent(id),
            onCliLogin: () => runCliLogin(id),
            onCliStatus: () => runCliStatus(id),
            onCliModels: () => runCliModels(id),
          })
        }),
        el(AddCliCard, {
          t, adding: addingCli, setAdding: setAddingCli,
          onQuickAdd: (kind) => quickAddCli(kind),
        }),
        // ── 高级扩展：OAuth 账号 + 账号池（收进折叠卡片，默认不展开）─────
        el(CategoryCard, {
          title: t('advancedSection'),
          summary: `${t('oauthSummary')(oauthIds.length)} · ${t('poolSummary')(poolIds.length)}`,
          expanded: expandedAdvanced === true,
          t,
          onToggle: () => setExpandedAdvanced((current) => !current),
          children: [
            // OAuth 账号子区（官方登录，插件独立管理）
            el('div', { className: 'dshrouter-head' }, el('span', { className: 'dshrouter-subtitle' }, t('oauthTitle'))),
            el('p', { className: 'dshrouter-hint' }, t('oauthIntro')),
            oauthIds.length === 0 ? el('p', { className: 'dshrouter-hint' }, t('accountMissing')) : null,
            ...oauthIds.map((id) => {
              const entry = oauthById.get(id)
              const total = accountTotalsById.get(`oauth:${id}`)
              const tokenState = entry && entry.tokenRef ? oauthTokenStates[entry.tokenRef] : undefined
              return el(OAuthAccountCard, {
                key: id, id, entry, tokenState, total,
                buckets: accountSeriesById.get(`oauth:${id}`) ?? [],
                expanded: expandedOauth[id] === true,
                draft: oauthDraftOf(id),
                busy: !!oauthBusy[id],
                notice: oauthNotice[id],
                t, writable: state.writable,
                onToggle: () => setExpandedOauth((current) => ({ ...current, [id]: !current[id] })),
                onDraftField: (field, fieldValue) => setOauthDraft(id, { [field]: fieldValue }),
                onSave: () => saveOauthAccount(id, false),
                onPasteToken: (token) => pasteOauthToken(id, token),
                onOneClick: () => runOneClickOauth(id),
                onAuthorize: () => openOauthAuthorize(id),
                onExchange: (callbackUrl) => exchangeOauthCode(id, callbackUrl),
                onDiscover: () => discoverOauth(id),
                onDelete: () => deleteOauthAccount(id),
              })
            }),
            el(AddOAuthCard, {
              t, adding: addingOauth, setAdding: setAddingOauth,
              onQuickAdd: (presetId) => quickAddOauthAccount(presetId),
            }),
            // 账号池（扩展功能；多账号健康路由 + 失败切换）
            el('hr', { className: 'dshrouter-divider' }),
            el('div', { className: 'dshrouter-head' },
              el('span', { className: 'dshrouter-subtitle' }, t('poolTitle')),
              el('span', { className: 'dshrouter-spacer' }),
              el('span', { className: 'dshrouter-meta' }, t('poolSummary')(poolIds.length))),
            el('p', { className: 'dshrouter-hint' }, t('poolIntro')),
            poolIds.length === 0 ? el('p', { className: 'dshrouter-hint' }, t('accountMissing')) : null,
            ...poolIds.map((id) => {
              const entry = poolById.get(id)
              return el(PoolCard, {
                key: id, id, pool: entry ?? { name: '', enabled: true, strategy: 'healthy', accounts: [] },
                health: entry ? entry.accountHealth ?? [] : [],
                oauthEntries: oauthEntries, tokenStates: oauthTokenStates,
                expanded: expandedPools[id] === true,
                draft: poolDraftOf(id),
                busy: !!poolBusy[id],
                notice: poolNotice[id],
                t, writable: state.writable,
                onToggle: () => setExpandedPools((current) => ({ ...current, [id]: !current[id] })),
                onField: (field, fieldValue) => setPoolDraft(id, { [field]: fieldValue }),
                onSave: () => savePool(id, false),
                onDelete: () => deletePool(id),
                onAddAccount: (accountId) => addAccountToPool(id, accountId),
                onRemoveAccount: (accountId) => removeAccountFromPool(id, accountId),
                onOneClickAccount: (accountId) => runOneClickOauth(accountId),
                onDiscoverAccount: (accountId) => discoverOauth(accountId),
                onOauthAddToPool: (poolId, presetId, clientId) => oauthAddToPool(poolId, presetId, clientId),
              })
            }),
            el(AddPoolCard, {
              t, adding: addingPool, setAdding: setAddingPool,
              newId: newPoolId, setNewId: setNewPoolId,
              idTaken: poolIdsTaken.includes(newPoolId.trim()),
              idInvalid: poolIdInvalid,
              writable: state.writable,
              onSave: () => savePool(newPoolId.trim(), true),
            }),
          ],
        }),
      ]
      // ── 统计信息（辅助功能区，默认折叠）───────────────────────────────
      const statsBody = [
        el('p', { className: 'dshrouter-intro' }, t('statsIntro')),
        stats && stats.enabled === false ? el('p', { className: 'dshrouter-error' }, t('statsDisabled')) : null,
        el('div', { className: 'dshrouter-row' },
          el('span', { className: 'dshrouter-meta' }, `${t('statsCalls')}: ${sumAll.calls}`),
          el('span', { className: 'dshrouter-meta', style: sumAll.errors > 0 ? { color: 'var(--dsw-alias-state-error-primary)' } : undefined }, `${t('statsErrors')}: ${sumAll.errors}`),
          el('span', { className: 'dshrouter-meta' }, `${t('statsTokens')}: ${fmtTokens(sumAll.inTokens)} / ${fmtTokens(sumAll.outTokens)}`),
          el('span', { className: 'dshrouter-spacer' }),
          el('button', { type: 'button', className: 'dshrouter-button ghost', onClick: clearStats }, t('statsReset'))),
        // Agent 级明细卡片
        el('div', { className: 'dshrouter-head' }, el('span', { className: 'dshrouter-subtitle' }, t('statsAgentLevel'))),
        agentIds.length === 0 ? el('p', { className: 'dshrouter-hint' }, t('statsNoCalls')) : null,
        ...agentIds.map((id) => {
          const total = statsTotals.get(id)
          const statKey = `agent:${id}`
          return el(StatsRowCard, {
            key: statKey,
            title: total ? total.name : id,
            badge: id,
            meta: `${total ? total.provider : '—'}/${total ? total.model : '—'}`,
            calls: total ? total.calls : 0,
            errors: total ? total.errors : 0,
            inputTokens: total ? total.inputTokens : 0,
            outputTokens: total ? total.outputTokens : 0,
            totalMs: total ? total.totalMs : 0,
            lastAt: total ? total.lastAt : undefined,
            buckets: statsSeries.get(id) ?? [],
            expanded: expandedStats[statKey] === true,
            t,
            onToggle: () => toggleStatCard(statKey),
          })
        }),
        // 账号级明细卡片（激活账号）
        el('div', { className: 'dshrouter-head', style: { marginTop: 8 } }, el('span', { className: 'dshrouter-subtitle' }, t('statsAccountLevel'))),
        statsAccountRows.length === 0 ? el('p', { className: 'dshrouter-hint' }, t('statsNoCalls')) : null,
        ...statsAccountRows.map((row) => {
          const statKey = `acct:${row.provider}`
          const accountTotal = accountTotalsById.get(row.provider)
          const models = accountTotal && accountTotal.models ? accountTotal.models : []
          const buckets = accountSeriesById.get(row.provider) ?? []
          return el(AccountStatsCard, {
            key: statKey,
            provider: row.provider,
            displayName: row.displayName,
            active: row.active,
            calls: row.calls,
            errors: row.errors,
            inputTokens: row.inputTokens,
            outputTokens: row.outputTokens,
            totalMs: row.totalMs,
            lastAt: row.lastAt,
            models,
            buckets,
            expanded: expandedStats[statKey] === true,
            t,
            onToggle: () => toggleStatCard(statKey),
          })
        }),
        recentCalls.length > 0 ? el('details', null,
          el('summary', { className: 'dshrouter-meta' }, `${t('statsRecent')}（${recentCalls.length}）`),
          el('table', { className: 'dshrouter-table' },
            el('thead', null, el('tr', null,
              el('th', null, t('statsTime')), el('th', null, t('statsAgent')), el('th', null, t('statsProvider')), el('th', null, t('statsStatus')), el('th', null, t('statsAvg')))),
            el('tbody', null, ...recentCalls.slice(0, 20).map((row, index) => {
              const status = row.ok ? t('statsOk') : el('span', { className: 'dshrouter-error' }, row.error ? `${t('statsFail')}: ${row.error.slice(0, 60)}` : t('statsFail'))
              return el('tr', { key: index },
                el('td', null, timeOf(row.at)),
                el('td', null, row.agentId),
                el('td', null, `${row.provider || '?'}/${row.model || '?'}`),
                el('td', null, status),
                el('td', null, `${fmtMs(row.ms)}${row.outputTokens ? ` · ${fmtTokens(row.outputTokens)} out` : ''}`))
            })))) : null,
      ]
      // ── 核心区：专业 Agent（前置，默认展开）────────────────────────────
      const agentsBody = [
        el('p', { className: 'dshrouter-intro' }, t('agentsIntro')),
        agentIds.length === 0 ? el('p', { className: 'dshrouter-intro' }, t('noAgents')) : null,
        ...agentIds.map((id) => {
          const draft = draftOf(id)
          const catalog = catalogById.get(id)
          const testResult = testResults[id]
          return el(AgentCard, {
            key: id, id, draft, t, writable: state.writable, busy: !!busy[id], notice: notice[id],
            providers, models: state.models ?? [], catalog, oauthAccounts: oauthEntries, pools: poolEntries, cliEntries, testResult,
            stat: statsTotals.get(id) ?? null,
            buckets: statsSeries.get(id) ?? [],
            expanded: expandedAgents[id] === true,
            cliState: draft.type === 'cli' ? cliStates[(draft.cliAgent ?? '').trim() || `agent:${id}`] : undefined,
            onToggle: () => toggleExpanded(id),
            onField: (key, fieldValue) => setDraftField(id, key, fieldValue),
            onSave: () => saveAgent(id, false),
            onDelete: () => deleteAgent(id),
            onTest: () => runTest(id),
            onDiscover: (provider) => setDiscover({ id, provider }),
            onCliLogin: () => runCliLogin(id, (draft.cliAgent ?? '').trim() || `agent:${id}`),
          })
        }),
        el(AddAgentCard, {
          t, adding, setAdding, newId, setNewId, idTaken, idInvalid,
          writable: state.writable,
          agentIds,
          onSave: () => saveAgent(newId.trim(), true),
          onTemplate: addFromTemplate,
        }),
      ]
      return el('section', { className: 'dshrouter-section', 'aria-label': t('title') },
        ...sectionHead,
        // ── 分级分类卡片：专业 Agent 前置且默认展开；账号与统计默认折叠 ──
        el(CategoryCard, {
          title: t('agentsTitle'), summary: t('agentsSummary')(agentIds.length),
          expanded: expandedSection.agents === true, t, onToggle: () => toggleSection('agents'),
          children: agentsBody,
        }),
        el(CategoryCard, {
          title: t('accountTitle'), summary: `${t('accountSummary')(addedAccounts.length)} · ${t('cliSummary')(cliEntryIds.length)} · ${t('oauthSummary')(oauthIds.length)}`,
          expanded: expandedSection.accounts === true, t, onToggle: () => toggleSection('accounts'),
          children: accountsBody,
        }),
        el(CategoryCard, {
          title: t('statsTitle'), summary: t('statsSummary')(sumAll.calls, sumAll.errors),
          expanded: expandedSection.stats === true, t, onToggle: () => toggleSection('stats'),
          children: statsBody,
        }),
        // 发现模型弹窗
        discover ? el(DiscoverModal, {
          api, t, provider: discover.provider,
          providers,
          baseURL: (accountProfileOf(discover.provider) ?? {}).baseURL ?? '',
          onClose: () => setDiscover(null),
          onAdopt: (model) => { setDraftField(discover.id, 'model', model); setDiscover(null) },
        }) : null,
      )
    }

    /** cli 登录状态指示 chip（圆点与文字分离：dshrouter-dot 是纯色点，不承载文字）。
     *  未登录时文字以错误色（红）呈现，避免灰色小字不醒目。 */
    function cliStatusChipOf(cliState, t) {
      const loggedOut = !!cliState && cliState.loggedIn === false && !cliState.statusBusy
      const chip = cliState && cliState.statusBusy
        ? { dot: '', text: `${t('fetching')}…` }
        : cliState && cliState.loggedIn === true
          ? { dot: 'ok', text: t('cliStatusLoggedIn') }
          : cliState && cliState.loggedIn === false
            ? { dot: 'bad', text: t('cliStatusLoggedOut') }
            : { dot: '', text: t('cliStatusUnknown') }
      return el('span', { className: 'dshrouter-meta' + (loggedOut ? ' dshrouter-error' : ''), title: cliState && cliState.statusMessage },
        el('span', { className: `dshrouter-dot ${chip.dot}`.trim(), style: { marginRight: 6 } }),
        chip.text)
    }

    /** 子代理条目卡片（账号区的「子代理」区：命令/登录/模型/统计）。 */
    function CliAgentCard(props) {
      const { id, total, expanded, draft, busy, notice, cliState, t, writable, onToggle, onField, onSave, onDelete, onCliLogin, onCliStatus, onCliModels } = props
      return el('div', { className: 'dshrouter-card' },
        el('button', { type: 'button', className: 'dshrouter-card-head', onClick: onToggle, 'aria-expanded': expanded, title: expanded ? t('collapse') : t('expand') },
          el('span', { className: 'dshrouter-name' }, draft.name || id),
          el('span', { className: 'dshrouter-id' }, id),
          el('span', { className: 'dshrouter-tag' }, draft.command || 'cli'),
          el('span', { className: 'dshrouter-meta' }, `${t('statsCalls')} ${total ? total.calls : 0} · ${t('statsErrors')} ${total ? total.errors : 0} · ${total && total.calls > 0 ? fmtMs(total.totalMs / total.calls) : '—'}`),
          el('span', { className: 'dshrouter-spacer' }),
          el('span', { className: 'dshrouter-chevron' }, expanded ? '▾' : '▸')),
        expanded ? el('div', { className: 'dshrouter-stats' },
          notice ? el('p', { className: 'dshrouter-hint' }, notice) : null,
          el('div', { className: 'dshrouter-row', style: { alignItems: 'flex-end' } },
            el('div', { className: 'dshrouter-field', style: { flex: '0 0 150px' } },
              el('span', { className: 'dshrouter-field-label' }, t('cliLoginStatus')),
              cliStatusChipOf(cliState, t)),
            el('button', { type: 'button', className: 'dshrouter-button', disabled: busy || !writable || (cliState && cliState.loginBusy), onClick: onCliLogin },
              cliState && cliState.loginBusy ? t('cliLoginWaiting') : (cliState && cliState.loggedIn === true ? t('cliRelogin') : t('cliLogin'))),
            el('button', { type: 'button', className: 'dshrouter-button ghost', disabled: cliState && cliState.statusBusy, onClick: onCliStatus }, t('cliStatusRefresh'))),
          cliState && cliState.statusMessage ? el('p', { className: cliState.loggedIn === false ? 'dshrouter-error' : 'dshrouter-hint' }, cliState.statusMessage) : null,
          cliState && cliState.loginNotice ? el('p', { className: cliState.loginError === true ? 'dshrouter-error' : 'dshrouter-hint' }, cliState.loginNotice) : null,
          el('div', { className: 'dshrouter-row' },
            el('div', { className: 'dshrouter-field', style: { flex: '0 0 180px' } },
              el('span', { className: 'dshrouter-field-label' }, t('fieldName')),
              el('input', { className: 'dshrouter-input', value: draft.name ?? '', onChange: (event) => onField('name', event.target.value) })),
            el('div', { className: 'dshrouter-field' },
              el('span', { className: 'dshrouter-field-label' }, t('fieldCommand')),
              el('input', { className: 'dshrouter-input', value: draft.command ?? '', placeholder: 'codex', onChange: (event) => onField('command', event.target.value) })),
            el('div', { className: 'dshrouter-field', style: { flex: '0 0 260px' } },
              el('span', { className: 'dshrouter-field-label' }, t('fieldCliArgs')),
              el('input', { className: 'dshrouter-input', value: draft.args ?? '', placeholder: 'exec --json（留空 = 平台自适应默认）', onChange: (event) => onField('args', event.target.value) }))),
          el('div', { className: 'dshrouter-row', style: { alignItems: 'flex-end' } },
            el('div', { className: 'dshrouter-field', style: { flex: '0 0 180px' } },
              el('span', { className: 'dshrouter-field-label' }, t('fieldCliTimeout')),
              el('input', { className: 'dshrouter-input', type: 'number', min: 0, step: 1, value: draft.timeoutMs ? Math.round(Number(draft.timeoutMs) / 60000) : '', placeholder: '15', onChange: (event) => onField('timeoutMs', Math.max(0, Math.trunc(Number(event.target.value) || 0)) * 60000) })),
            el('div', { className: 'dshrouter-field', style: { flex: '0 0 120px' } },
              el('span', { className: 'dshrouter-field-label' }, t('fieldCliConcurrent')),
              el('input', { className: 'dshrouter-input', type: 'number', min: 1, max: 4, step: 1, value: draft.maxConcurrent ?? 1, onChange: (event) => onField('maxConcurrent', Math.max(1, Math.min(4, Math.trunc(Number(event.target.value) || 1)))) })),
            el('button', { type: 'button', className: 'dshrouter-button ghost', style: { flex: 'none' }, disabled: cliState && cliState.modelsBusy, onClick: onCliModels },
              cliState && cliState.modelsBusy ? t('cliFetchingModels') : t('cliFetchModels'))),
          cliState && cliState.modelsMessage ? el('p', { className: 'dshrouter-hint' }, cliState.modelsMessage) : null,
          el('details', null,
            el('summary', { className: 'dshrouter-meta' }, t('advancedLogin')),
            el('div', { className: 'dshrouter-stats', style: { marginTop: 8 } },
              el('div', { className: 'dshrouter-field' },
                el('span', { className: 'dshrouter-field-label' }, t('fieldCliLoginArgs')),
                el('input', { className: 'dshrouter-input', value: draft.loginArgs ?? '', placeholder: 'login / auth login', onChange: (event) => onField('loginArgs', event.target.value) })),
              el('div', { className: 'dshrouter-field' },
                el('span', { className: 'dshrouter-field-label' }, t('fieldCliStatusArgs')),
                el('input', { className: 'dshrouter-input', value: draft.statusArgs ?? '', placeholder: 'login status / auth status', onChange: (event) => onField('statusArgs', event.target.value) })),
              el('div', { className: 'dshrouter-field' },
                el('span', { className: 'dshrouter-field-label' }, t('fieldCliModelsArgs')),
                el('input', { className: 'dshrouter-input', value: draft.modelsArgs ?? '', placeholder: '--list-models', onChange: (event) => onField('modelsArgs', event.target.value) })))),
          el('div', { className: 'dshrouter-row' },
            el('button', { type: 'button', className: 'dshrouter-button', disabled: busy || !writable, onClick: onSave }, busy ? t('saving') : t('save')),
            el('span', { className: 'dshrouter-spacer' }),
            el('button', { type: 'button', className: 'dshrouter-button danger', disabled: busy || !writable, onClick: onDelete }, t('cliDelete')))) : null)
    }

    /** 子代理列表末尾的「+」创建卡片（选 CLI 即创建并预填）。 */
    function AddCliCard(props) {
      const { t, adding, setAdding, onQuickAdd } = props
      if (!adding) {
        return el('div', { className: 'dshrouter-add', role: 'button', tabIndex: 0, onClick: () => setAdding(true), onKeyDown: (event) => { if (event.key === 'Enter') setAdding(true) } },
          el('span', { style: { fontSize: 18, lineHeight: 1 } }, '+'),
          el('span', null, t('cliAdd')))
      }
      return el('div', { className: 'dshrouter-card' },
        el('div', { className: 'dshrouter-head' },
          el('span', { className: 'dshrouter-name' }, t('cliAdd')),
          el('span', { className: 'dshrouter-spacer' }),
          el('button', { type: 'button', className: 'dshrouter-button ghost', onClick: () => setAdding(false) }, t('cancel'))),
        el('p', { className: 'dshrouter-hint' }, t('cliQuickAddHint')),
        el('div', { className: 'dshrouter-row' },
          ...CLI_PICKER.map((pick) => el('button', {
            type: 'button', key: pick.id || 'custom', className: 'dshrouter-chip',
            onClick: () => onQuickAdd(pick.id),
          }, pick.id ? t(pick.key) : t('cliCustomAdd')))))
    }

    function AgentCard(props) {
      const { id, draft, t, writable, busy, notice, providers, models, catalog, oauthAccounts, pools, cliEntries, testResult, stat, buckets, expanded, cliState, onToggle, onField, onSave, onDelete, onTest, onDiscover, onCliLogin } = props
      const groups = models ?? []
      const group = groups.find((entry) => entry.id === (draft.provider || ''))
      const poolRef = typeof draft.account === 'string' && draft.account.startsWith('pool:') ? draft.account.slice(5) : ''
      const poolEntry = poolRef ? (pools ?? []).find((entry) => entry.id === poolRef) : undefined
      const poolFirstAccount = poolEntry && (poolEntry.accounts ?? []).length > 0
        ? (oauthAccounts ?? []).find((entry) => entry.id === poolEntry.accounts[0])
        : undefined
      const oauthEntry = poolRef ? poolFirstAccount : (oauthAccounts ?? []).find((entry) => entry.id === (draft.account || ''))
      const modelOptions = oauthEntry
        ? (oauthEntry.models ?? []).map((modelId) => ({ id: modelId, name: modelId }))
        : group ? group.models ?? [] : []
      const modelIds = new Set(modelOptions.map((model) => model.id))
      if (draft.model && !modelIds.has(draft.model)) modelOptions.push({ id: draft.model, name: draft.model })
      const providerChoice = providers.find((entry) => entry.provider === draft.provider)
      const effective = catalog ? `${catalog.effectiveProvider}/${catalog.effectiveModel}` : '—'
      const effectiveDisplay = draft.type === 'cli'
        ? `${draft.command || 'cli'}${draft.model ? `/${draft.model}` : ''}`
        : effective
      const sourceLabel = catalog ? ({ agent: t('sourceAgent'), main: t('sourceMain'), 'provider-default': t('sourceProvider'), account: t('fieldAccount'), pool: t('poolAccountSource') }[catalog.source] ?? t('sourceUnknown')) : ''
      const barBuckets = (buckets ?? []).slice(-48)
      const barMax = Math.max(1, ...barBuckets.map((bucket) => bucket.inputTokens + bucket.outputTokens))
      const typeLabel = ({ chat: t('typeChat'), agent: t('typeAgent'), image: t('typeImage'), speech: t('typeSpeech'), cli: t('typeCli') }[draft.type] ?? t('typeChat'))

      // 折叠摘要：类型 tag + 生效模型 + 简要用量
      const summary = el('div', { className: 'dshrouter-card' },
        el('button', { type: 'button', className: 'dshrouter-card-head', onClick: onToggle, 'aria-expanded': expanded, title: expanded ? t('collapse') : t('expand') },
          el('span', { className: 'dshrouter-name' }, draft.name || id),
          el('span', { className: 'dshrouter-id' }, id),
          el('span', { className: 'dshrouter-tag' }, draft.type || 'chat'),
          catalog && catalog.error ? el('span', { className: 'dshrouter-error', title: catalog.error }, '⚠') : null,
          el('span', { className: 'dshrouter-meta' }, `${effectiveDisplay}`),
          el('span', { className: 'dshrouter-meta' }, `${t('statsCalls')} ${stat ? stat.calls : 0} · ${t('statsErrors')} ${stat ? stat.errors : 0} · ${stat ? fmtTokens(stat.inputTokens) : 0}/${stat ? fmtTokens(stat.outputTokens) : 0}`),
          el('span', { className: 'dshrouter-spacer' }),
          el('span', { className: 'dshrouter-chevron' }, expanded ? '▾' : '▸')))

      if (!expanded) return summary

      return el('div', { className: 'dshrouter-card' + (draft.enabled === false ? ' disabled' : '') },
        el('button', { type: 'button', className: 'dshrouter-card-head', onClick: onToggle, 'aria-expanded': expanded, title: t('collapse') },
          el('span', { className: 'dshrouter-name' }, draft.name || id),
          el('span', { className: 'dshrouter-id' }, id),
          el('span', { className: 'dshrouter-tag' }, typeLabel),
          catalog && catalog.error ? el('span', { className: 'dshrouter-error', title: catalog.error }, catalog.error.slice(0, 60)) : null,
          el('span', { className: 'dshrouter-spacer' }),
          el('label', { className: 'dshrouter-switch', onClick: (event) => event.stopPropagation() },
            el('input', { type: 'checkbox', checked: draft.enabled !== false, disabled: !writable, onChange: (event) => onField('enabled', event.target.checked) }),
            t('enable')),
          el('span', { className: 'dshrouter-chevron' }, '▾')),
        el('div', { className: 'dshrouter-row' },
          el('div', { className: 'dshrouter-field' },
            el('span', { className: 'dshrouter-field-label' }, t('fieldName')),
            el('input', { className: 'dshrouter-input', value: draft.name ?? '', onChange: (event) => onField('name', event.target.value) })),
          el('div', { className: 'dshrouter-field', style: { flex: '0 0 240px' } },
            el('span', { className: 'dshrouter-field-label' }, t('fieldType')),
            el('select', { className: 'dshrouter-select', value: draft.type ?? 'chat', onChange: (event) => onField('type', event.target.value) },
              el('option', { value: 'chat' }, t('typeChat')),
              el('option', { value: 'agent' }, t('typeAgent')),
              el('option', { value: 'image' }, t('typeImage')),
              el('option', { value: 'speech' }, t('typeSpeech')),
              el('option', { value: 'cli' }, t('typeCli'))))),
        el('p', { className: 'dshrouter-hint' }, t('fieldTypeHint')),
        el('div', { className: 'dshrouter-field' },
          el('span', { className: 'dshrouter-field-label' }, t('fieldDescription')),
          el('textarea', { className: 'dshrouter-textarea', value: draft.description ?? '', onChange: (event) => onField('description', event.target.value) })),
        (draft.type !== 'cli' && ((oauthAccounts ?? []).length > 0 || (pools ?? []).length > 0)) ? el('div', { className: 'dshrouter-field' },
          el('span', { className: 'dshrouter-field-label' }, t('fieldAccount')),
          el('select', { className: 'dshrouter-select', value: draft.account ?? '', onChange: (event) => onField('account', event.target.value) },
            el('option', { value: '' }, `— ${t('inherit')} —`),
            ...(pools ?? []).map((entry) => el('option', { value: `pool:${entry.id}`, key: `pool:${entry.id}` }, `${t('poolTitle')} · ${entry.name || entry.id} (${entry.id})`)),
            ...(oauthAccounts ?? []).map((entry) => el('option', { value: entry.id, key: entry.id }, `${entry.name || entry.id} (${entry.id})`))),
          draft.account ? el('p', { className: 'dshrouter-hint' }, t('oauthChatOnly')) : null) : null,
        draft.type === 'cli' ? el('div', { className: 'dshrouter-stats' },
          el('div', { className: 'dshrouter-row', style: { alignItems: 'flex-end' } },
            el('div', { className: 'dshrouter-field' },
              el('span', { className: 'dshrouter-field-label' }, t('fieldCliAgent')),
              el('select', { className: 'dshrouter-select', value: draft.cliAgent ?? '', onChange: (event) => onField('cliAgent', event.target.value) },
                el('option', { value: '' }, t('cliAgentNone')),
                ...cliEntries.map((entry) => el('option', { value: entry.id, key: entry.id }, `${entry.name || entry.id} (${entry.id})`)))),
            el('div', { className: 'dshrouter-field', style: { flex: '0 0 170px' } },
              el('span', { className: 'dshrouter-field-label' }, t('cliLoginStatus')),
              cliStatusChipOf(cliState, t))),
          draft.cliAgent ? null : el('p', { className: 'dshrouter-hint' }, t('cliLegacyHint')),
          el('div', { className: 'dshrouter-field', style: { maxWidth: 420 } },
            el('span', { className: 'dshrouter-field-label' }, t('fieldModel')),
            el('input', { className: 'dshrouter-input', list: `dshrouter-cli-models-${id}`, value: draft.model ?? '', placeholder: `— ${t('inherit')} —`, onChange: (event) => onField('model', event.target.value) }),
            el('datalist', { id: `dshrouter-cli-models-${id}` },
              ...(Array.isArray(cliState?.models) ? cliState.models : []).map((model) => el('option', { value: model, key: model }, model)))),
          el('p', { className: 'dshrouter-hint' }, t('cliManageHint')),
          el('p', { className: 'dshrouter-hint' }, t('cliRoutingHint'))) : el('div', { className: 'dshrouter-row' },
          el('div', { className: 'dshrouter-field' },
            el('span', { className: 'dshrouter-field-label' }, t('fieldProvider')),
            el('select', { className: 'dshrouter-select', value: draft.provider ?? '', disabled: !!draft.account, onChange: (event) => onField('provider', event.target.value) },
              el('option', { value: '' }, `— ${t('inherit')} —`),
              ...providers.filter((entry) => entry.active || entry.provider === draft.provider).map((entry) => el('option', { value: entry.provider, key: entry.provider }, `${entry.displayName} (${entry.provider})`)))),
          el('div', { className: 'dshrouter-field' },
            el('span', { className: 'dshrouter-field-label' }, t('fieldModel')),
            el('input', {
              className: 'dshrouter-input', list: `dshrouter-models-${id}`,
              value: draft.model ?? '', placeholder: '—',
              onChange: (event) => onField('model', event.target.value),
            }),
            el('datalist', { id: `dshrouter-models-${id}` },
              ...modelOptions.map((model) => el('option', { value: model.id, key: model.id }, model.name || model.id)))),
          el('button', {
            type: 'button', className: 'dshrouter-button ghost',
            style: { flex: 'none' },
            disabled: !draft.provider || !!draft.account,
            title: draft.account ? t('oauthChatOnly') : draft.provider ? undefined : t('fieldProvider'),
            onClick: () => onDiscover(draft.provider),
          }, t('fieldDiscover'))),
        draft.type === 'image' || draft.type === 'speech' ? el('div', { className: 'dshrouter-row' },
          el('div', { className: 'dshrouter-field' },
            el('span', { className: 'dshrouter-field-label' }, t('fieldEndpoint')),
            el('input', { className: 'dshrouter-input', value: draft.endpoint ?? '', placeholder: 'https://api.openai.com/v1/images/generations', onChange: (event) => onField('endpoint', event.target.value) })),
          draft.type === 'image' ? el('div', { className: 'dshrouter-field', style: { flex: '0 0 180px' } },
            el('span', { className: 'dshrouter-field-label' }, t('fieldImageSize')),
            el('select', { className: 'dshrouter-select', value: draft.imageSize ?? '1024x1024', onChange: (event) => onField('imageSize', event.target.value) },
              el('option', { value: '1024x1024' }, '1024x1024'),
              el('option', { value: '1792x1024' }, '1792x1024'),
              el('option', { value: '1024x1792' }, '1024x1792'))) : null,
          el('div', { className: 'dshrouter-field' },
            el('span', { className: 'dshrouter-field-label' }, t('fieldApiKeyEnv')),
            el('input', { className: 'dshrouter-input', value: draft.apiKeyEnv ?? '', placeholder: 'OPENAI_API_KEY', onChange: (event) => onField('apiKeyEnv', event.target.value) }))) : null,
        draft.type === 'agent' ? el('div', { className: 'dshrouter-field' },
          el('span', { className: 'dshrouter-field-label' }, t('fieldTools')),
          el('input', { className: 'dshrouter-input', value: (draft.tools ?? []).join(', '), onChange: (event) => onField('tools', event.target.value.split(',').map((item) => item.trim()).filter(Boolean)) })) : null,
        el('details', null,
          el('summary', { className: 'dshrouter-meta' }, t('advanced')),
          el('div', { className: 'dshrouter-row', style: { marginTop: 8 } },
            draft.type !== 'cli' ? el('div', { className: 'dshrouter-field' },
              el('span', { className: 'dshrouter-field-label' }, t('fieldReasoning')),
              el('input', { className: 'dshrouter-input', value: draft.reasoningEffort ?? '', placeholder: 'high', onChange: (event) => onField('reasoningEffort', event.target.value) })) : null,
            draft.type !== 'cli' ? el('div', { className: 'dshrouter-field' },
              el('span', { className: 'dshrouter-field-label' }, t('fieldTemperature')),
              el('input', { className: 'dshrouter-input', type: 'number', min: 0, max: 2, step: 0.1, value: draft.temperature ?? 0, onChange: (event) => onField('temperature', Number(event.target.value) || 0) })) : null,
            draft.type !== 'cli' ? el('div', { className: 'dshrouter-field' },
              el('span', { className: 'dshrouter-field-label' }, t('fieldMaxTokens')),
              el('input', { className: 'dshrouter-input', type: 'number', min: 0, step: 1, value: draft.maxTokens ?? 0, onChange: (event) => onField('maxTokens', Number(event.target.value) || 0) })) : null,
            draft.type !== 'image' && draft.type !== 'cli' ? el('div', { className: 'dshrouter-field' },
              el('span', { className: 'dshrouter-field-label' }, t('fieldMaxRounds')),
              el('input', { className: 'dshrouter-input', type: 'number', min: 1, max: 8, step: 1, value: draft.maxRounds ?? 1, onChange: (event) => onField('maxRounds', Math.max(1, Math.min(8, Number(event.target.value) || 1))) })) : null,
            el('div', { className: 'dshrouter-field' },
              el('span', { className: 'dshrouter-field-label' }, t('fieldCapabilities')),
              el('input', { className: 'dshrouter-input', value: (draft.capabilities ?? []).join(', '), onChange: (event) => onField('capabilities', event.target.value.split(',').map((item) => item.trim()).filter(Boolean)) }))),
          el('div', { className: 'dshrouter-field', style: { marginTop: 8 } },
            el('span', { className: 'dshrouter-field-label' }, t('fieldSystemPrompt')),
            el('textarea', { className: 'dshrouter-textarea', value: draft.systemPrompt ?? '', onChange: (event) => onField('systemPrompt', event.target.value) })),
          draft.type === 'cli' ? el('p', { className: 'dshrouter-hint' }, t('cliSystemHint')) : null),
        draft.type === 'cli' ? null : el('p', { className: 'dshrouter-meta' },
          t('effective'), el('strong', null, effective),
          catalog && catalog.source ? ` · ${sourceLabel}` : null,
          providerChoice && !providerChoice.active ? ` · (${t('accountDormant')})` : null),
        // 该 agent 的实时用量
        el('div', { className: 'dshrouter-stats' },
          el('div', { className: 'dshrouter-row' },
            el('span', { className: 'dshrouter-meta' }, `${t('statsCalls')}: ${stat ? stat.calls : 0}`),
            el('span', { className: 'dshrouter-meta', style: stat && stat.errors > 0 ? { color: 'var(--dsw-alias-state-error-primary)' } : undefined }, `${t('statsErrors')}: ${stat ? stat.errors : 0}`),
            el('span', { className: 'dshrouter-meta' }, `${t('statsTokens')}: ${stat ? fmtTokens(stat.inputTokens) : 0} / ${stat ? fmtTokens(stat.outputTokens) : 0}`),
            el('span', { className: 'dshrouter-meta' }, `${t('statsAvg')}: ${stat && stat.calls > 0 ? fmtMs(stat.totalMs / stat.calls) : '—'}`),
            el('span', { className: 'dshrouter-meta' }, `${t('statsLast')}: ${timeOf(stat && stat.lastAt)}`)),
          barBuckets.length > 0 ? el('div', { className: 'dshrouter-bars', title: t('statsSeries') },
            ...barBuckets.map((bucket) => el('div', {
              key: bucket.minute,
              className: 'dshrouter-bar' + (bucket.errors > 0 && bucket.calls === bucket.errors ? ' err' : ''),
              style: { height: `${Math.max(2, Math.round(((bucket.inputTokens + bucket.outputTokens) / barMax) * 26))}px` },
              title: `${bucket.minute} · in ${bucket.inputTokens} / out ${bucket.outputTokens} · ${bucket.errors} err`,
            }))) : null),
        testResult ? el('p', { className: testResult.ok ? 'dshrouter-ok' : 'dshrouter-error' },
          testResult.busy ? t('testing') : testResult.message) : null,
        notice ? el('p', { className: 'dshrouter-hint' }, notice) : null,
        el('div', { className: 'dshrouter-row' },
          el('button', { type: 'button', className: 'dshrouter-button', disabled: busy || !writable, onClick: onSave }, busy ? t('saving') : t('save')),
          // cli 类型：测试按键替换为登录（CLI 无连通性测试，登录即就绪）。
          draft.type === 'cli'
            ? el('button', {
              type: 'button', className: 'dshrouter-button ghost',
              disabled: busy || !writable || (cliState && cliState.loginBusy),
              onClick: onCliLogin,
            }, cliState && cliState.loginBusy ? t('cliLoginWaiting') : (cliState && cliState.loggedIn === true ? t('cliRelogin') : t('cliLogin')))
            : el('button', { type: 'button', className: 'dshrouter-button ghost', disabled: testResult && testResult.busy, onClick: onTest }, testResult && testResult.busy ? t('testing') : t('test')),
          el('span', { className: 'dshrouter-spacer' }),
          el('button', { type: 'button', className: 'dshrouter-button danger', disabled: busy || !writable, onClick: onDelete }, t('delete'))),
      )
    }

    /** 列表末尾的「+」添加卡片。 */
    function AddAgentCard(props) {
      const { t, adding, setAdding, newId, setNewId, idTaken, idInvalid, writable, onSave, onTemplate } = props
      if (!adding) {
        return el('div', { className: 'dshrouter-add', role: 'button', tabIndex: 0, onClick: () => setAdding(true), onKeyDown: (event) => { if (event.key === 'Enter') setAdding(true) } },
          el('span', { style: { fontSize: 18, lineHeight: 1 } }, '+'),
          el('span', null, t('addTitle')))
      }
      return el('div', { className: 'dshrouter-card' },
        el('div', { className: 'dshrouter-head' },
          el('span', { className: 'dshrouter-name' }, t('addTitle')),
          el('span', { className: 'dshrouter-spacer' }),
          el('button', { type: 'button', className: 'dshrouter-button ghost', onClick: () => { setAdding(false); setNewId('') } }, t('cancel'))),
        el('div', { className: 'dshrouter-row' },
          el('input', {
            className: 'dshrouter-input', style: { flex: '0 0 240px' },
            placeholder: t('addPlaceholder'), 'aria-label': t('addPlaceholder'),
            value: newId, onChange: (event) => setNewId(event.target.value),
          }),
          el('button', {
            type: 'button', className: 'dshrouter-button',
            disabled: !newId.trim() || idInvalid || idTaken || !writable,
            onClick: onSave,
          }, t('add'))),
        newId.trim() && idInvalid ? el('p', { className: 'dshrouter-error' }, t('invalidId')) : null,
        newId.trim() && idTaken ? el('p', { className: 'dshrouter-error' }, t('duplicateId')) : null,
        el('div', { className: 'dshrouter-row' },
          el('span', { className: 'dshrouter-meta' }, t('presets')),
          ...AGENT_PRESETS.map((preset) => el('button', {
            type: 'button', key: preset.id, className: 'dshrouter-chip',
            onClick: () => onTemplate(preset),
          }, t(preset.key)))),
      )
    }

    function DiscoverModal(props) {
      const { api, t, provider, providers, baseURL, onClose, onAdopt } = props
      const [busy, setBusy] = useState(true)
      const [failure, setFailure] = useState(null)
      const [candidates, setCandidates] = useState([])
      const entry = providers.find((item) => item.provider === provider)
      useEffect(() => {
        let alive = true
        setBusy(true)
        setFailure(null)
        // 自定义服务商无内置模型目录：发现请求必须携带其 Base URL，
        // 否则 pi-ai 适配器报 "ships no catalog … set a baseURL"。
        api.llm.discoverModels({
          settingsNs: entry ? entry.settingsNs : 'llm-pi-ai',
          provider,
          ...(typeof baseURL === 'string' && baseURL.trim() ? { baseURL: baseURL.trim() } : {}),
        }).then((response) => {
          if (!alive) return
          if (!response.result.ok) { setFailure(response.result.error.message); return }
          setCandidates(response.result.value.models ?? [])
        }, (error) => { if (alive) setFailure(messageOf(error)) })
          .finally(() => { if (alive) setBusy(false) })
        return () => { alive = false }
      }, [api, provider, entry])
      return el('div', { className: 'dshrouter-modal', onClick: (event) => { if (event.target === event.currentTarget) onClose() } },
        el('div', { className: 'dshrouter-modal-body' },
          el('h4', { className: 'dshrouter-modal-title' }, `${t('fetchTitle')} · ${provider}`),
          busy ? el('p', { className: 'dshrouter-intro' }, t('fetching')) : null,
          failure ? el('p', { className: 'dshrouter-error' }, failure) : null,
          !busy && !failure && candidates.length === 0 ? el('p', { className: 'dshrouter-intro' }, t('fetchEmpty')) : null,
          candidates.map((model) => el('div', {
            className: 'dshrouter-candidate', key: model.id,
            onClick: () => onAdopt(model.id),
          },
            el('span', null, model.id),
            el('span', { className: 'dshrouter-meta' }, model.name || ''),
            el('span', { className: 'dshrouter-spacer' }),
            el('span', { className: 'dshrouter-meta' }, model.contextWindow ? `${fmtTokens(model.contextWindow)} ctx` : ''))),
          el('div', { className: 'dshrouter-row' },
            el('span', { className: 'dshrouter-spacer' }),
            el('button', { type: 'button', className: 'dshrouter-button ghost', onClick: onClose }, t('close')))))
    }

    // ── 多模态展示辅助（composer 附件按钮 / route_agent 工具卡片）────────
    //
    // 发送与准入由宿主准入包装（twin 路由）接管：选「+ 自动识图」组后
    // 粘贴/拖拽 + 回车即原生可用，图片块留在日志、Web UI 原生显示。本区
    // 保留三件展示辅助：
    // - composer 附件按钮：图片文件送进原生草稿栏（预览/移除原生机制）；
    //   音频/视频/文档经 router/uploadFile 落盘（F11，v3 §4.4.2）→ 附件
    //   卡片 + 结构化路径文本经 inputActions.setDraft 进 draft；
    // - 模型接管（无 UI）：多模态开启 → 会话自动切包装路由；
    // - route_agent 工具卡片：生成图片以纯文本标记渲染进工具结果，卡片
    //   解析标记经 router/imageData 取字节渲染缩略图。

    /** 模块级路由目录缓存：composer 组件共用（apply 内轮询刷新）。 */
    const routerCatalog = {
      value: null,
      version: 0,
      listeners: new Set(),
    }
    function setRouterCatalog(value) {
      if (routerCatalog.value === value) return
      routerCatalog.value = value
      routerCatalog.version += 1
      for (const listener of routerCatalog.listeners) listener()
    }
    /** 组件内订阅目录版本（兼容迷你 React 的 useState/useEffect）。 */
    function useRouterCatalog() {
      const [version, setVersion] = useState(routerCatalog.version)
      useEffect(() => {
        const listener = () => setVersion(routerCatalog.version)
        routerCatalog.listeners.add(listener)
        return () => { routerCatalog.listeners.delete(listener) }
      }, [])
      return routerCatalog.value
    }
    /** 目录中的多模态 agent 并集（识别 + 生图），按 id 排序：image 类型
     *  （生图端点）或 capabilities 含 image 的任意类型（chat/agent 识别、
     *  cli 生图子代理）都计入——附件按钮显隐与模型接管只看"是否有任一
     *  多模态 agent"，与宿主 MODALITY_ENTRIES 的 stateOf 门控一致。改写标记
     *  里的"识别 vs 图生图"分流由宿主 listImageVisionAgents /
     *  listImageGenerationAgents 负责，这里不分。 */
    function multimodalAgentsOf(catalog) {
      if (!catalog || catalog.ok !== true) return []
      return (catalog.agents ?? [])
        .filter((agent) => {
          if (agent.enabled === false) return false
          const capabilities = Array.isArray(agent.capabilities) ? agent.capabilities : []
          return agent.type === 'image' || capabilities.includes('image')
        })
        .sort((a, b) => (a.id < b.id ? -1 : 1))
    }
    /** 从文本提取图片标记的引用（容忍损坏负载）。 */
    function parseMarkersOf(text) {
      const out = []
      if (typeof text !== 'string') return out
      const re = /\[router:image:([^\]\n]+)\]/g
      let match
      while ((match = re.exec(text)) !== null) {
        try {
          const ref = JSON.parse(match[1])
          if (ref && typeof ref === 'object' && typeof ref.attachmentId === 'string' && ref.attachmentId) out.push(ref)
        } catch { /* 非 JSON 负载：忽略 */ }
      }
      return out
    }

    /** 包装路由后缀（与宿主 lib/wrapper.js 的 WRAP_SUFFIX 一致；双面各自定义）。 */
    const WRAP_SUFFIX = '-router'

    /** 接管来源记忆（FIX-002-R7 F1）：sessionId → 本组件接管时切走的原生
     *  provider——服务端 wrapper `tookOverFrom` 的客户端对等机制（"这个 twin
     *  选择是谁放上的"）。仅当会话当前停在本组件接管放上的 twin 上时，解除
     *  武装才还原；用户手动选的 twin（无记忆）一律尊重不撤销。接管/还原成功
     *  才写入/清除记忆（失败保持原状，下次 effect 触发重试）。 */
    const takeoverMemory = new Map()

    /**
     * 模型接管（无 UI）：多模态开启 → 当前会话切到包装路由（开启瞬间完成，
     * 之后贴图零操作、零竞态）；关闭 → 仅还原本组件接管放上的会话选择
     * （takeoverMemory 命中且仍停在我们的 twin 上），用户手动选的 twin 一律
     * 尊重不撤销（FIX-002-R7 F1）；会话已含图时宿主拒绝切回纯文本 → 静默
     * 保持。InputZone 快照随 input/session store 变化重渲染，草稿 imageIds
     * 实时：视觉已开启而用户手动切回纯文本组后贴图，同样自动归位到包装组。
     */
    function ModelTakeover(props) {
      const { sessionId, input, api } = props
      const catalog = useRouterCatalog()
      // FIX-002（客户端层）：会话级接管同样受 router.takeoverDefaultModel 开关
      // 约束（默认 false = 不接管——twin 路由在模型列表，用户手动选）。此前仅看
      // "目录有多模态 agent"即在每个会话（含子代理会话，sessionId 变化触发
      // effect）强制切 twin——覆盖用户手动选择（用户报障：起子代理时主代理
      // 配置被切）。开关开启时保留既有"开启瞬间切换 + 贴图自动归位"语义。
      // FIX-002-R7 F1：解除武装的还原同样需要来源记忆（takeoverMemory）——
      // 此前 !armed && wrapped 分支在每次 effect 触发（贴图/会话切换/子代理
      // sessionId）都把用户手动选的 twin 静默剥回原生。
      const takeoverArmed = multimodalAgentsOf(catalog).length > 0 && catalog.takeoverDefaultModel === true
      const imageCount = input && Array.isArray(input.imageIds) ? input.imageIds.length : 0
      useEffect(() => {
        const sessions = api && api.sessions
        if (!sessionId || !sessions || typeof sessions.models !== 'function' || typeof sessions.selectModel !== 'function') return
        let cancelled = false
        ;(async () => {
          try {
            const { result } = await sessions.models({ sessionId })
            if (cancelled || !result || !result.ok || !result.value || !result.value.current) return
            const current = result.value.current
            if (typeof current.provider !== 'string' || typeof current.model !== 'string' || current.model === '') return
            const wrapped = current.provider.endsWith(WRAP_SUFFIX)
            if (takeoverArmed && !wrapped) {
              // 接管：切到当前 provider 的包装路由。宿主包装组注册先于客户端
              // 感知（settings 事件本地先行、RPC 后至），开启瞬间完成切换；
              // 失败静默，下次快照变化再试。成功后记忆来源（FIX-002-R7 F1：
              // 与服务端 tookOverFrom 对等——只有本组件放上的 twin 才在解除
              // 武装时还原）。
              const taken = await sessions.selectModel({ sessionId, provider: `${current.provider}${WRAP_SUFFIX}`, model: current.model })
              if (taken && taken.result && taken.result.ok) takeoverMemory.set(sessionId, current.provider)
            } else if (!takeoverArmed && takeoverMemory.has(sessionId)) {
              // 恢复（FIX-002-R7 F1）：仅当 twin 选择是本组件接管逻辑放上的
              // （记忆命中且仍停在我们的 twin 上）才还原——用户手动选的 twin
              // （无记忆）一律尊重不撤销；用户已手动改走（原生/别的 twin）=
              // 尊重，静默清记忆不写设置。还原成功才清记忆（失败保留，下次
              // 触发重试）；会话已含图时宿主拒绝切回纯文本 → 静默。
              const native = takeoverMemory.get(sessionId)
              if (wrapped && current.provider === `${native}${WRAP_SUFFIX}`) {
                const restored = await sessions.selectModel({ sessionId, provider: native, model: current.model })
                if (restored && restored.result && restored.result.ok) takeoverMemory.delete(sessionId)
              } else {
                takeoverMemory.delete(sessionId)
              }
            }
          } catch { /* 接管失败容忍：准入是最终防线，用户仍可手动切组 */ }
        })()
        return () => { cancelled = true }
      }, [sessionId, api, takeoverArmed, imageCount])
      return null
    }

    /** 文件是否图片（type 前缀判定——与宿主导航栏 image 判定同口径）。 */
    function isImageFile(file) {
      return !!file && typeof file.type === 'string' && file.type.startsWith('image/')
    }

    /** 附件类型中文标签（结构化路径文本与卡片共用，§4.4.2 ③：音频/视频/文档）。 */
    function attachKind(mediaType) {
      return typeof mediaType === 'string' && mediaType.startsWith('audio/') ? '音频'
        : typeof mediaType === 'string' && mediaType.startsWith('video/') ? '视频' : '文档'
    }

    /** 结构化路径文本（v3 §4.4.2 ③ / §5.5 输入段格式）：
     *  [附件: 音频 xxx.wav 路径 .router-files/xxx.wav]——路径文本常驻模型输入，
     *  主 agent 据此 route_agent(agent=speech, filePath=路径) / files=[路径]。 */
    function attachPathText(mediaType, name, path) {
      return `[附件: ${attachKind(mediaType)} ${name} 路径 ${path}]`
    }

    /** composer 工具行附件按钮：多模态开启时出现（与模型接管共用同一目录
     *  信号——开启出现并接管、关闭消失并恢复，严格同步）。选文件按类型分流：
     *  图片进原生草稿图片栏（预览/移除都走原生机制，发送走原生回车，由准入
     *  包装放行）；音频/视频/文档经 router/uploadFile RPC 落盘到工作区
     *  .router-files/（F11 输入入口，v3 §4.4.2 / §5.5——浏览器无法直写文件
     *  系统，F8/F12 约束下唯一合规通路）→ 附件卡片渲染 + 结构化路径文本经
     *  inputActions.setDraft 注入 draft（读最近渲染 draft 追加回写，V-DSH-2
     *  结论：setDraft 是单一公共 draft 写通道，完全支持路径文本进 draft；
     *  F-01：全部上传落定后累积一次回写，多选不丢路径文本）。 */
    function AttachButton(props) {
      const { t, router, conversation, inputActions, useInput } = props
      const catalog = useRouterCatalog()
      const [error, setError] = useState('')
      const [cards, setCards] = useState([])
      const inputRef = useRef(null)
      // 当前 draft（渲染期快照，draftRef 每渲染刷新为最新值）：上传全部落定后
      // 以最近一次渲染的 draft 为基一次性回写路径文本（宿主会话 slot 恒提供
      // useInput，SessionStandardProps；缺失时仅跳过注入——上传与卡片不受影响）。
      // 快照口径：V-DSH-2 无 draft 读取事件通道，上传窗口内的用户输入以最近
      // 一次渲染为准（F-01 修复：多文件不再逐文件整体覆盖——累积全部路径文本
      // 后仅一次 setDraft，读-改-写全程一次完成，不丢写）。
      const currentDraft = typeof useInput === 'function'
        ? String(useInput((s) => (s && typeof s.draft === 'string' ? s.draft : '')) ?? '')
        : ''
      const draftRef = useRef(currentDraft)
      draftRef.current = currentDraft
      const agents = multimodalAgentsOf(catalog)
      if (agents.length === 0) return null
      /** 单个非图片文件上传：FileReader 读字节 → base64 → router/uploadFile RPC。
       *  成功返回该文件的结构化路径文本（由 intake 累积后一次 setDraft 注入），
       *  失败返回 null（错误已渲染，不注入 draft）。 */
      const uploadFile = (file) => {
        const FR = typeof window !== 'undefined' ? window.FileReader : undefined
        const remote = typeof router === 'function' ? router() : router
        if (typeof FR !== 'function' || !remote || typeof remote.uploadFile !== 'function') {
          setError(t('attachUnavailable'))
          return Promise.resolve(null)
        }
        const name = typeof file.name === 'string' && file.name.trim() ? file.name.trim() : `upload-${Date.now().toString(36)}`
        const mediaType = typeof file.type === 'string' && file.type ? file.type : 'application/octet-stream'
        return new Promise((resolve) => {
          const reader = new FR()
          reader.onload = () => {
            const dataBase64 = String(reader.result ?? '').split(',')[1] ?? ''
            remote.uploadFile({ name, mediaType, dataBase64 }).then((response) => {
              const value = response && response.ok && response.value ? response.value : null
              if (!value || value.ok !== true || !value.path) {
                const detail = value && typeof value.message === 'string'
                  ? `${value.code || 'UPLOAD_FAILED'}: ${value.message}`
                  : t('attachUploadFailed')
                setError(detail)
                resolve(null)
                return
              }
              const path = String(value.path)
              const cardName = typeof value.name === 'string' && value.name ? value.name : name
              setCards((current) => [...current, { name: cardName, mediaType, path }])
              resolve(attachPathText(mediaType, cardName, path))
            }, (failure) => {
              setError(failure && failure.message ? String(failure.message) : t('attachUploadFailed'))
              resolve(null)
            })
          }
          reader.onerror = () => { setError(t('attachUploadFailed')); resolve(null) }
          reader.readAsDataURL(file)
        })
      }
      const intake = (list) => {
        setError('')
        const files = Array.from(list ?? []).filter((file) => file && typeof file.name === 'string')
        const images = files.filter(isImageFile)
        const others = files.filter((file) => !isImageFile(file))
        if (images.length > 0) {
          const conversationSvc = typeof conversation === 'function' ? conversation() : conversation
          if (!conversationSvc || typeof conversationSvc.createDraftImages !== 'function' || !inputActions || typeof inputActions.addImages !== 'function') {
            setError(t('attachUnavailable'))
            return
          }
          try {
            const created = conversationSvc.createDraftImages(images)
            if (!inputActions.addImages(created.map((image) => image.id))) conversationSvc.releaseDraftImages(created)
          } catch (failure) {
            setError(messageOf(failure))
          }
        }
        // F-01：多文件非图片并发上传（multiple:true）——各文件独立 RPC，全部
        // 落定后把全部路径文本一次性 setDraft（以 draftRef 最新渲染值为基）；
        // 绝不逐文件整体覆盖（旧实现后完成者覆盖前 N-1 项，路径文本丢失，且
        // 上传窗口内用户输入被旧快照覆盖）。
        if (others.length === 0) return
        Promise.all(others.map(uploadFile)).then((texts) => {
          const lines = texts.filter((text) => text !== null)
          if (lines.length === 0) return
          if (inputActions && typeof inputActions.setDraft === 'function') {
            const base = draftRef.current.trim()
            inputActions.setDraft(base ? `${base}\n${lines.join('\n')}` : lines.join('\n'))
          }
        })
      }
      return el('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 } },
        ...cards.map((card) => el('span', {
          className: 'dshrouter-attachcard',
          key: card.path,
          title: card.path,
        }, `[${attachKind(card.mediaType)}] ${card.name} → ${card.path}`)),
        error ? el('span', { className: 'dshrouter-error' }, error) : null,
        el('input', {
          ref: inputRef,
          type: 'file',
          accept: 'image/png,image/jpeg,image/webp,image/gif,audio/*,video/*,.pdf,.doc,.docx,.txt,.md,.csv,.json,.zip',
          multiple: true,
          style: { display: 'none' },
          'aria-label': t('attachPickTitle'),
          onChange: (event) => {
            intake(Array.from(event.target.files ?? []))
            event.target.value = ''
          },
        }),
        el('button', {
          type: 'button',
          className: 'dshrouter-attach',
          'aria-label': t('attach'),
          title: error || t('attach'),
          onClick: () => {
            setError('')
            if (inputRef.current) inputRef.current.click()
          },
        }, error ? '⚠' : '📎'))
    }

    /** 单张图片缩略图：经 router/imageData 取字节渲染，失败可点击重试（具体错误码透传，便于诊断）。 */
    function RouteImage(props) {
      const { t, router, ref, onOpen } = props
      const [state, setState] = useState({ status: 'loading' })
      const load = () => {
        const remote = typeof router === 'function' ? router() : router
        if (!remote || typeof remote.imageData !== 'function') {
          setState({ status: 'error', detail: 'REMOTE_UNAVAILABLE' })
          return
        }
        setState({ status: 'loading' })
        remote.imageData({ ref }).then((response) => {
          if (response.ok && response.value && response.value.data) {
            setState({
              status: 'ready',
              src: `data:${response.value.mediaType || 'image/png'};base64,${response.value.data}`,
              alt: response.value.name || t('toolImageLabel'),
            })
          } else {
            const detail = response.value && typeof response.value.message === 'string'
              ? `${response.value.code || 'FAILED'}: ${response.value.message}`
              : (response.error && response.error.message ? String(response.error.message) : 'FAILED')
            setState({ status: 'error', detail })
          }
        }, (failure) => setState({ status: 'error', detail: failure && failure.message ? String(failure.message) : 'RPC_FAILED' }))
      }
      useEffect(() => { load() }, [])
      if (state.status === 'error') {
        return el('button', {
          type: 'button',
          className: 'dshrouter-toolcard',
          title: state.detail,
          onClick: load,
        }, `${t('imageLoadFailed')}（${state.detail}）`)
      }
      if (state.status === 'ready') {
        return el('img', {
          className: 'dshrouter-toolimage',
          src: state.src,
          alt: state.alt,
          onClick: () => onOpen({ src: state.src, alt: state.alt }),
        })
      }
      return el('span', { className: 'dshrouter-toolmeta' }, t('toolRunning'))
    }

    /** base64 → blob URL（L3 预览用；createObjectURL 不可用时回落 data: URL）。 */
    function blobUrlOf(dataBase64, mediaType) {
      try {
        const binary = atob(dataBase64)
        const bytes = new Uint8Array(binary.length)
        for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
        const blob = new Blob([bytes], { type: mediaType || 'application/octet-stream' })
        const url = window.URL && typeof window.URL.createObjectURL === 'function' ? window.URL.createObjectURL(blob) : ''
        if (url) return url
      } catch { /* 解码失败：回落 data: URL */ }
      return `data:${mediaType || 'application/octet-stream'};base64,${dataBase64}`
    }

    /**
     * L3 文件行（v3 §5 展示段 L3 / N-7）：路径文本 + 「打开文件」动作。点击 →
     * router/readWorkspaceFile 读字节 → blob 预览：audio/video 原生标签兜底
     * （V-DSH-3：宿主无播放组件，降级路径即最终路径），其余类型下载链接；
     * 失败显示错误码可重试（不静默）。
     */
    function RouteFileRow(props) {
      const { t, router, file } = props
      const [state, setState] = useState({ status: 'idle' })
      const open = () => {
        const remote = typeof router === 'function' ? router() : router
        if (!remote || typeof remote.readWorkspaceFile !== 'function') {
          setState({ status: 'error', detail: 'REMOTE_UNAVAILABLE' })
          return
        }
        setState({ status: 'loading' })
        remote.readWorkspaceFile({ path: file.path }).then((response) => {
          if (response && response.ok && response.value && response.value.ok === true && response.value.dataBase64) {
            const value = response.value
            setState({
              status: 'ready',
              previewUrl: blobUrlOf(value.dataBase64, value.mediaType),
              mediaType: typeof value.mediaType === 'string' ? value.mediaType : '',
              name: typeof value.name === 'string' && value.name ? value.name : file.name,
            })
          } else {
            const detail = response && response.value && typeof response.value.message === 'string'
              ? `${response.value.code || 'FAILED'}: ${response.value.message}`
              : (response && response.error && response.error.message ? String(response.error.message) : 'FAILED')
            setState({ status: 'error', detail })
          }
        }, (failure) => setState({ status: 'error', detail: failure && failure.message ? String(failure.message) : 'RPC_FAILED' }))
      }
      // blob URL 生命周期（F-2 R12）：createObjectURL 产生的 URL 必须随组件
      // 卸载 / previewUrl 变更释放（revokeObjectURL），否则长会话反复打开文件
      // 会累积 blob URL 与底层 Blob（每份上限 25MB）。data: URL 回落非 object
      // URL，无需（也无法）revoke——守卫跳过，失败回落路径不受影响。
      const previewUrl = state.status === 'ready' && typeof state.previewUrl === 'string' ? state.previewUrl : ''
      useEffect(() => {
        return () => {
          if (previewUrl && !previewUrl.startsWith('data:')) {
            try { window.URL.revokeObjectURL(previewUrl) } catch { /* URL API 不可用时无需释放 */ }
          }
        }
      }, [previewUrl])
      const pathText = el('span', { className: 'dshrouter-toolpath', title: file.path }, file.path)
      if (state.status === 'ready') {
        // ready 三态共用容器（F-11 R12）：audio/video 原生标签兜底（V-DSH-3），
        // 其余类型下载链接——提取共用避免重复。
        const mediaType = String(state.mediaType || '')
        const media = mediaType.startsWith('audio/')
          ? el('audio', { className: 'dshrouter-toolmedia', controls: true, src: previewUrl })
          : mediaType.startsWith('video/')
            ? el('video', { className: 'dshrouter-toolmedia', controls: true, src: previewUrl })
            : el('a', { className: 'dshrouter-button ghost', href: previewUrl, download: state.name || 'file' }, t('download'))
        return el('div', { className: 'dshrouter-toolfile' }, pathText, media)
      }
      const action = state.status === 'loading'
        ? el('span', { className: 'dshrouter-toolmeta' }, t('fileOpening'))
        : state.status === 'error'
          ? el('button', { type: 'button', className: 'dshrouter-button ghost', onClick: open }, `${t('fileOpenFailed')}（${state.detail}）`)
          : el('button', { type: 'button', className: 'dshrouter-button ghost', onClick: open }, t('openFile'))
      return el('div', { className: 'dshrouter-toolfile' }, pathText, action)
    }

    /** route_agent 工具卡片：解析结果中的图片标记渲染缩略图（兼容旧会话的真实图片块）。 */
    function RouteAgentToolCard(props) {
      const { t, router, block } = props
      const [lightbox, setLightbox] = useState(null)
      if (!block || block.kind !== 'tool-result') {
        return el('div', { className: 'dshrouter-toolcard' },
          el('div', { className: 'dshrouter-toolcard-head' },
            el('span', { className: 'dshrouter-toolcard-title' }, t('toolRouteTitle')),
            el('span', { className: 'dshrouter-toolmeta' }, t('toolRunning'))))
      }
      const refs = []
      const texts = []
      for (const contentBlock of block.content ?? []) {
        if (!contentBlock) continue
        if (contentBlock.type === 'image' && contentBlock.attachment) {
          refs.push(contentBlock.attachment)
          continue
        }
        if (contentBlock.type === 'text' && typeof contentBlock.text === 'string') {
          for (const ref of parseMarkersOf(contentBlock.text)) refs.push(ref)
          const cleaned = contentBlock.text.replace(/\[router:image:[^\]\n]+\]/g, '').trim()
          if (cleaned) texts.push(cleaned)
        }
      }
      const name = block.call && typeof block.call.name === 'string' ? block.call.name : 'route_agent'
      const open = (target) => setLightbox(target)
      // L3 文件引用（v3 §5 展示段 L3 / N-7）：从工具调用参数提取 filePath 与
      // files 的非 URL 条目——「打开文件」预览的确定性来源（audio/video 原生
      // 标签兜底 / 其他类型下载）；容错：argsRaw 非法时无 L3（不击穿渲染）。
      const fileRefs = []
      try {
        const args = JSON.parse(block.call && typeof block.call.argsRaw === 'string' ? block.call.argsRaw : '{}')
        const seenFiles = new Set()
        const pushFile = (value) => {
          const trimmed = typeof value === 'string' ? value.trim() : ''
          if (!trimmed || /^https?:\/\//i.test(trimmed) || seenFiles.has(trimmed)) return
          seenFiles.add(trimmed)
          fileRefs.push({ path: trimmed, name: String(trimmed).split(/[\\/]/).pop() || trimmed })
        }
        if (typeof args.filePath === 'string') pushFile(args.filePath)
        if (Array.isArray(args.files)) for (const item of args.files) pushFile(item)
      } catch { /* 容错：非法 argsRaw 不产生 L3 行 */ }
      return el('div', { className: 'dshrouter-toolcard' },
        el('div', { className: 'dshrouter-toolcard-head' },
          el('span', { className: 'dshrouter-toolcard-title' }, t('toolRouteTitle')),
          el('span', { className: 'dshrouter-toolmeta' }, name)),
        block.isError === true ? el('span', { className: 'dshrouter-toolerror' }, block.error && block.error.message ? block.error.message : t('statsFail')) : null,
        refs.length > 0 ? el('div', { className: 'dshrouter-toolimages dshrouter-toolgallery' },
          ...refs.map((ref, index) => el(RouteImage, {
            t, router, ref, onOpen: open,
            key: `${String(ref.attachmentId ?? '')}:${index}`,
          }))) : null,
        fileRefs.length > 0 ? el('div', { className: 'dshrouter-toolfiles' },
          ...fileRefs.map((file, index) => el(RouteFileRow, { t, router, file, key: `${file.path}:${index}` }))) : null,
        ...texts.map((text, index) => el('div', { className: 'dshrouter-tooltext', key: index }, text)),
        lightbox ? el('div', { className: 'dshrouter-modal', onClick: (event) => { if (event.target === event.currentTarget) setLightbox(null) } },
          el('div', { className: 'dshrouter-modal-body' },
            el('h4', { className: 'dshrouter-modal-title' }, t('imagePreviewTitle')),
            el('img', { src: lightbox.src, alt: lightbox.alt, style: { maxWidth: '100%', borderRadius: 8 } }),
            el('div', { className: 'dshrouter-row' },
              el('span', { className: 'dshrouter-spacer' }),
              el('button', { type: 'button', className: 'dshrouter-button ghost', onClick: () => setLightbox(null) }, t('close'))))) : null)
    }

    // ── 插件装配 ────────────────────────────────────────────────────────────
    const NS = 'router'
    const inject = ['slots', 'locale', 'connection', 'remote']

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-agent-router: locale')
      const connection = ctx.get('connection')
      const api = connection.api
      const t = ctx.locale.bind(NS)
      const remoteReady = ctx.remote.$mount(ROUTER_REMOTE).catch((error) => {
        console.error('dsh-agent-router: remote mount failed', error)
      })
      // 书签回传的 access token：官方站页面点「获取 token 书签」→ 跳回本页
      // 带 dshrouter-account/dshrouter-token 参数 → 自动写入 credentials。
      remoteReady.then(async () => {
        try {
          const params = new URLSearchParams(window.location.search)
          const accountId = params.get('dshrouter-account') ?? ''
          const token = params.get('dshrouter-token') ?? ''
          if (!accountId || !token) return
          window.history.replaceState(null, '', window.location.pathname)
          const routerRemote = ctx.get('remote.router')
          if (!routerRemote) return
          const response = await routerRemote.config({})
          if (!response.ok) return
          const configValue = response.value && response.value.value ? response.value.value : null
          const account = configValue && configValue.oauthAccounts ? configValue.oauthAccounts[accountId] : undefined
          if (!account || typeof account.tokenRef !== 'string' || !account.tokenRef) return
          const stored = await api.credentials.set({ ref: account.tokenRef, value: token })
          if (stored && stored.result && stored.result.ok) window.sessionStorage.setItem('dshrouter-token-saved', accountId)
        } catch { /* 静默：不影响页面加载 */ }
      })
      const $on = (event, listener) => ctx.remote.$on(event, listener)
      const injected = () => ({ api, remote: () => ctx.get('remote.router') ?? null, remoteReady, t, $on })
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'router-agents',
        order: 20,
        label: () => t('nav'),
        inject: injected,
      }, (props) => el(AgentsPage, {
        api: props.api,
        remote: props.remote,
        remoteReady: props.remoteReady,
        t: props.t,
        $on: props.$on,
      })))

      // ── 多模态展示辅助装配 ────────────────────────────────────────────
      const routerRemote = () => ctx.get('remote.router') ?? null
      const conversationFace = () => ctx.get('conversation')
      // 目录轮询：供 composer 附件按钮判定视觉 agent 可用性。
      const refreshCatalog = () => {
        const remote = routerRemote()
        if (!remote || typeof remote.catalog !== 'function') return
        remote.catalog({}).then((response) => {
          if (response && response.ok) setRouterCatalog(response.value ?? null)
        }, () => undefined)
      }
      refreshCatalog()
      remoteReady.then(() => refreshCatalog(), () => undefined)
      const offSettingsForCatalog = $on('settings/document-updated', () => refreshCatalog())
      const catalogTimer = window.setInterval(refreshCatalog, 30000)
      ctx.effect(() => () => {
        offSettingsForCatalog()
        window.clearInterval(catalogTimer)
      }, 'dsh-agent-router: composer catalog polling')
      // conversation 插槽由 ui-conversation 声明：声明存在才注册，注册失败
      // （如 key 冲突）只记录、绝不击穿插件其余功能（settings 页等不受影响）。
      const safeRegister = (options, render) => {
        try {
          return ctx.slots.register(options, render)
        } catch (error) {
          console.error(`dsh-agent-router: slot "${options.name}" registration failed`, error)
          return () => {}
        }
      }
      ctx.slots.inject('conversation.input.right', () => safeRegister({
        name: 'conversation.input.right',
        id: 'router-attach',
        order: 50,
        inject: () => ({ router: routerRemote, conversation: conversationFace }),
      }, (props) => el(AttachButton, {
        t,
        router: props.router,
        conversation: props.conversation,
        inputActions: props.inputActions,
        useInput: props.useInput,
      })))
      // 模型接管（无 UI）：与附件按钮同一槽位、独立条目，随 InputZone 快照驱动。
      ctx.slots.inject('conversation.input.right', () => safeRegister({
        name: 'conversation.input.right',
        id: 'router-model-takeover',
        order: 40,
        inject: () => ({ api }),
      }, (props) => el(ModelTakeover, {
        sessionId: props.sessionId,
        input: props.input,
        api: props.api,
      })))
      ctx.slots.inject('tool.call.toolview', () => safeRegister({
        name: 'tool.call.toolview',
        key: 'route_agent',
        inject: () => ({ router: routerRemote }),
      }, (props) => el(RouteAgentToolCard, {
        t,
        router: props.router,
        block: props.block,
      })))
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
