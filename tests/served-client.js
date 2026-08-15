/**
 * dsh-router 浏览器侧包（`./client`，dual-face 下发）。
 *
 * 单页签「Agent 路由」（settings.section list slot）。三大分区采用一致的
 * 「标题 + 说明 + 卡片列表」风格（每个卡片默认折叠、点击展开）：
 * - 总开关（唯一不折叠的配置）；
 * - 多模态账号管理：标题 + 说明（API Key 登录 / OAuth 边界）+ 已添加
 *   账号卡片列表（展开显示模型列表与 Base URL）+ 末尾「+」登录卡片
 *   （ChatGPT/Claude/Grok/Gemini 预设 + 任意服务商 + Base URL）；
 * - 统计信息：标题 + 说明 + Agent 级与账号级（服务商）两级明细卡片
 *   （展开显示平均耗时、模型细分、分钟级 tokens 分布）+ 最近调用记录；
 * - 专业 Agent 卡片列表：标题 + 说明 + 每卡默认折叠摘要（名称/类型/
 *   生效模型/简要用量），点击展开配置与明细统计；末尾「+」添加新 agent
 *   （图片识别/图片生成/翻译/语音识别/视频生成/通用子 Agent 预设）。
 *
 * wire 面：固定 apiproxy（llm/credentials/白名单 settings）+ 本包 $mount
 * 的 `remote.router` namespace（catalog/stats/test/reset/config/save）。
 */
window.__ModuleLoader__.load({
  id: 'dsh-router',
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
        throw new Error(`dsh-router wire: ${path} is required`)
      }
      if (spec.kind === 'string') {
        if (typeof value !== 'string') throw new Error(`dsh-router wire: ${path} must be a string`)
        return value
      }
      if (spec.kind === 'boolean') {
        if (typeof value !== 'boolean') throw new Error(`dsh-router wire: ${path} must be a boolean`)
        return value
      }
      if (spec.kind === 'number') {
        if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`dsh-router wire: ${path} must be a finite number`)
        return value
      }
      if (spec.kind === 'array') {
        if (!Array.isArray(value)) throw new Error(`dsh-router wire: ${path} must be an array`)
        if (spec.items) for (let index = 0; index < value.length; index++) {
          const next = wireCheck(spec.items, value[index], `${path}[${index}]`)
          if (next !== undefined) value[index] = next
        }
        return value
      }
      if (spec.kind === 'object') {
        if (typeof value !== 'object' || Array.isArray(value)) throw new Error(`dsh-router wire: ${path} must be an object`)
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
        provider: wv.string(), model: wv.string(), account: wv.string(),
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

    // ── Remote 契约（与宿主 lib/rpc.js 一致）────────────────────────────────
    function parameter(name, schema) {
      return { name, wire: name, source: 'json', codec: { mode: 'strict', typeSymbol: `dsh-router/types#${name}`, schema } }
    }
    function resultOf(name, schema) {
      return { mode: 'strict', typeSymbol: `dsh-router/types#${name}`, schema }
    }
    const ROUTER_REMOTE = {
      package: 'dsh-router',
      descriptors: [
        { id: 'dsh-router#router/catalog', service: 'router', namespace: 'router', method: 'catalog', invocation: { kind: 'direct' }, parameters: [parameter('request', wEmpty)], result: resultOf('CatalogResult', wCatalog) },
        { id: 'dsh-router#router/stats', service: 'router', namespace: 'router', method: 'stats', invocation: { kind: 'direct' }, parameters: [parameter('request', wEmpty)], result: resultOf('StatsResult', wStats) },
        { id: 'dsh-router#router/test', service: 'router', namespace: 'router', method: 'test', invocation: { kind: 'direct' }, parameters: [parameter('request', wAgentId)], result: resultOf('TestResult', wTest) },
        { id: 'dsh-router#router/reset', service: 'router', namespace: 'router', method: 'reset', invocation: { kind: 'direct' }, parameters: [parameter('request', wEmpty)], result: resultOf('ResetResult', wReset) },
        { id: 'dsh-router#router/config', service: 'router', namespace: 'router', method: 'config', invocation: { kind: 'direct' }, parameters: [parameter('request', wEmpty)], result: resultOf('ConfigResult', wConfig) },
        { id: 'dsh-router#router/save', service: 'router', namespace: 'router', method: 'save', invocation: { kind: 'direct' }, parameters: [parameter('request', wSaveRequest)], result: resultOf('SaveResult', wSaveResult) },
        { id: 'dsh-router#router/oauthTokenExchange', service: 'router', namespace: 'router', method: 'oauthTokenExchange', invocation: { kind: 'direct' }, parameters: [parameter('request', wOauthExchangeRequest)], result: resultOf('OauthTokenExchangeResult', wOauthExchangeResult) },
        { id: 'dsh-router#router/oauthBegin', service: 'router', namespace: 'router', method: 'oauthBegin', invocation: { kind: 'direct' }, parameters: [parameter('request', wOauthBeginRequest)], result: resultOf('OauthBeginResult', wOauthBeginResult) },
        { id: 'dsh-router#router/oauthDiscover', service: 'router', namespace: 'router', method: 'oauthDiscover', invocation: { kind: 'direct' }, parameters: [parameter('request', wOauthDiscoverRequest)], result: resultOf('OauthDiscoverResult', wOauthDiscoverResult) },
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
.dshrouter-card{border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:10px}
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
.dshrouter-dot{width:8px;height:8px;border-radius:50%;display:inline-block;flex:none}
.dshrouter-dot.ok{background:var(--dsw-alias-state-success-primary)}
.dshrouter-dot.bad{background:var(--dsw-alias-state-error-primary)}
.dshrouter-meta{font-size:12px;color:var(--dsw-alias-label-tertiary);line-height:18px}
.dshrouter-stats{border-top:1px solid var(--dsw-alias-border-l3);padding-top:8px;display:flex;flex-direction:column;gap:6px}
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
.dshrouter-add{display:flex;align-items:center;justify-content:center;gap:6px;border:1px dashed var(--dsw-alias-border-l3);border-radius:12px;padding:14px;cursor:pointer;color:var(--dsw-alias-label-secondary);font-size:13px}
.dshrouter-add:hover{border-color:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary)}
.dshrouter-divider{border:none;border-top:1px solid var(--dsw-alias-border-l3);margin:4px 0}
`
    const CSS_ID = 'dsh-router'
    if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(CSS_ID) + ']') === null) {
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-router'
      tag.dataset.pluginCss = CSS_ID
      tag.textContent = CSS
      document.head.appendChild(tag)
    }

    // ── 文案 ────────────────────────────────────────────────────────────────
    const zh = {
      nav: 'Agent 路由',
      title: '多模型路由',
      intro: '为不同能力配置专业 agent（图片识别、图片生成、翻译、语音识别等），每个 agent 可选独立服务商与模型；未配置时自动复用主 agent 模型。除总开关外，各分类卡片可展开进行具体配置。',
      masterSwitch: '启用多模型路由',
      masterHint: '关闭后 route_agent 工具将拒绝调用，提示段与统计暂停；组合层可通过禁用 dsh-router 行整体关闭插件。',
      accountTitle: '多模态账号管理',
      accountSummary: (n) => `已配置 ${n} 个账号`,
      accountIntro: '为常用多模态服务商登录 API Key（ChatGPT/Claude/Grok/Gemini 等订阅 plan 均可使用其官方 API Key）。',
      accountOAuth: '说明：harness 模型适配层目前仅支持 API Key 认证，官方 OAuth 登录流暂不在支持范围；登录后该服务商模型会立即出现在上方模型列表中，账号与模型的具体配置与「设置 → 模型」页同源。',
      accountPresets: '账号预设：',
      accountProvider: '服务商',
      accountKey: 'API Key',
      accountBaseUrl: 'Base URL（可选，覆盖默认端点，如代理网关）',
      accountLogin: '登录',
      accountDone: '已配置',
      accountMissing: '未配置',
      accountActive: '已激活',
      accountDormant: '未激活',
      accountList: '已配置账号',
      addAccount: '添加账号',
      accountModels: '个模型',
      oauthTitle: 'OAuth 账号（官方登录，插件独立管理）',
      oauthIntro: '用官方 OAuth 授权流登录（ChatGPT/Claude/Grok/Gemini 等）。OAuth 账号只由本插件管理：不会注册到共享模型列表（设置 → 模型 / 服务商下拉均不出现），模型列表在插件内单独维护，调用经插件直连端点。ChatGPT/Claude 的消费级 OAuth token 面向其 Web 后端（非官方 API），如持有可用 token 请用「粘贴 token」；Gemini 等标准 OAuth2 服务商可直接走授权码登录。',
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
      oauthNeedRestart: '一键授权需要 DSH 重启后生效（宿主侧新增回调端点）。',
      oauthOneClickAdd: '一键授权并添加',
      oauthAddOnly: '仅添加（稍后登录）',
      oauthNeedClientId: '需先填 Client ID',
      oauthClientIdHint: '官方授权码流需要你自有的 OAuth Client（在服务商控制台创建；回调地址登记下方所示地址，其余端点/Scope 已由预设填好）。',
      oauthPublicClientLabel: '使用内置公开 OAuth Client（零配置，推荐）',
      oauthPublicClientHint: '内置 Google Cloud SDK 公开 Client：无需创建任何 OAuth Client，直接弹出官方登录页完成授权。回调走 127.0.0.1:8085（若该端口被 gcloud CLI 等占用，会提示降级；可取消勾选改用自建 Client）。',
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
      oauthQuickAddHint: '点击服务商即自动创建账号：Gemini 直接弹出官方登录完成一键授权；ChatGPT/Claude/Grok 添加后展开卡片粘贴 access token 即可。',
      oauthAddedPasteHint: '账号已添加：在此粘贴 access token 完成登录（官方 API 不提供 OAuth 一键登录）。',
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
      fieldName: '名称',
      fieldType: '类型',
      fieldTypeHint: '类型只是执行方式（chat 调远端模型 / agent 委派 DSH 子代理 / image 文生图 / speech 语音转写），不限制能力；能力标签才是你自定义的调度依据，files 图片分发也按它判定。',
      typeChat: 'chat · 对话型专业调用',
      typeAgent: 'agent · 完整子 Agent 委派',
      typeImage: 'image · 图片生成',
      typeSpeech: 'speech · 语音识别（转写）',
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
    }
    const en = {
      nav: 'Agent Routing',
      title: 'Multi-model Routing',
      intro: 'Configure specialist agents (vision, image generation, translation, speech recognition, …) with their own provider and model; unset values inherit the main agent model. Everything except the master switch lives in expandable category cards.',
      masterSwitch: 'Enable multi-model routing',
      masterHint: 'While disabled, route_agent refuses calls, the prompt section renders empty and stats pause. The whole native plugin can also be disabled by disabling the dsh-router composition row.',
      accountTitle: 'Multimodal Accounts',
      accountSummary: (n) => `${n} account(s) configured`,
      accountIntro: 'Sign in with an API key for common multimodal providers — ChatGPT/Claude/Grok/Gemini subscription plans all work through their official API keys.',
      accountOAuth: 'Note: the harness model layer currently supports API-key authentication only; official OAuth sign-in flows are not provided. Once signed in, the provider models appear in the lists above; accounts share the same storage as Settings → Models.',
      accountPresets: 'Presets:',
      accountProvider: 'Provider',
      accountKey: 'API Key',
      accountBaseUrl: 'Base URL (optional, overrides the default endpoint, e.g. a proxy gateway)',
      accountLogin: 'Sign in',
      accountDone: 'Configured',
      accountMissing: 'Missing',
      accountActive: 'Active',
      accountDormant: 'Dormant',
      accountList: 'Configured accounts',
      addAccount: 'Add Account',
      accountModels: 'models',
      oauthTitle: 'OAuth Accounts (official sign-in, plugin-managed)',
      oauthIntro: 'Sign in through official OAuth flows (ChatGPT/Claude/Grok/Gemini, …). OAuth accounts are managed by this plugin only: they never register in the shared model lists (Settings → Models / provider dropdowns), their model list is maintained here, and calls go through the plugin directly. ChatGPT/Claude consumer OAuth tokens target their web backends (not the official APIs) — use "paste token" when you hold a working token; standard OAuth2 providers such as Gemini can use the authorization-code flow directly.',
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
      oauthNeedRestart: 'One-click sign-in requires a DSH restart (new host callback endpoint).',
      oauthOneClickAdd: 'One-click sign-in & add',
      oauthAddOnly: 'Add only (sign in later)',
      oauthNeedClientId: 'Client ID required',
      oauthClientIdHint: 'The authorization-code flow needs your own OAuth client (create it in the provider console; register the redirect URI shown below — endpoints and scope are pre-filled by the preset).',
      oauthPublicClientLabel: 'Use built-in public OAuth client (zero-config, recommended)',
      oauthPublicClientHint: 'Built-in Google Cloud SDK public client: no OAuth client to create — it opens the official sign-in page directly. Callback goes to 127.0.0.1:8085 (if that port is taken, e.g. by the gcloud CLI, you will see a fallback error; uncheck to use your own client instead).',
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
      oauthQuickAddHint: 'Click a provider to create the account instantly: Gemini opens the official sign-in page for one-click authorization; ChatGPT/Claude/Grok just need a pasted access token afterwards.',
      oauthAddedPasteHint: 'Account created: paste the access token here to sign in (official APIs offer no OAuth one-click flow).',
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
      fieldName: 'Name',
      fieldType: 'Type',
      fieldTypeHint: 'Type is only the execution path (chat calls a remote model / agent delegates a DSH subagent / image generates images / speech transcribes audio) — it does not limit capability. Capability tags are your custom routing contract, and files image dispatch follows them.',
      typeChat: 'chat · specialist call',
      typeAgent: 'agent · full subagent delegation',
      typeImage: 'image · image generation',
      typeSpeech: 'speech · audio transcription',
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

    /** 账号（服务商）预设。 */
    const ACCOUNT_PRESETS = [
      { provider: 'openai', label: 'ChatGPT · OpenAI' },
      { provider: 'anthropic', label: 'Claude · Anthropic' },
      { provider: 'xai', label: 'Grok · xAI' },
      { provider: 'google', label: 'Gemini · Google' },
    ]

    /** 专业 agent 预设模板。 */
    const AGENT_PRESETS = [
      { id: 'vision', key: 'presetVision', draft: { name: '视觉识别', type: 'chat', description: '识别与描述图片内容（OCR、界面截图、图表解读等；可接收 files 图片路径/URL 与对话图片附件）', capabilities: ['image'] } },
      { id: 'draw', key: 'presetImage', draft: { name: '图片生成', type: 'image', provider: 'openai', model: 'dall-e-3', description: '根据文字描述生成图片', capabilities: ['image'] } },
      { id: 'translate', key: 'presetTranslate', draft: { name: '翻译', type: 'chat', description: '多语言互译与润色', capabilities: ['translate'] } },
      { id: 'voice', key: 'presetSpeech', draft: { name: '语音识别', type: 'speech', provider: 'openai', model: 'whisper-1', description: '把音频文件转写为文字（route_agent 经 filePath 指定工作区文件）', capabilities: ['audio'] } },
      { id: 'video', key: 'presetVideo', draft: { name: '视频生成', type: 'chat', description: '视频脚本、字幕与内容生成（无通用视频生成 API：请在高级设置中配置兼容网关与模型）', capabilities: ['video'] } },
      { id: 'assistant', key: 'presetGeneral', draft: { name: '通用子 Agent', type: 'agent', description: '把复杂子任务交给独立模型的完整 agent', capabilities: [] } },
    ]

    /** OAuth 账号预设（官方登录）。authUrl/tokenUrl 为空的预设仅支持粘贴 token。
     *  gemini 预设默认使用内置公开 OAuth Client（publicClient）：零配置
     *  一键授权（回调 127.0.0.1:8085）；取消勾选可改用自建 Client。 */
    const OAUTH_PRESETS = [
      { id: 'gemini', label: 'Gemini · Google', draft: { name: 'Gemini', protocol: 'gemini', baseURL: 'https://generativelanguage.googleapis.com/v1beta', authUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token', scope: 'https://www.googleapis.com/auth/generativelanguage', publicClient: true } },
      { id: 'chatgpt', label: 'ChatGPT · OpenAI', draft: { name: 'ChatGPT', protocol: 'openai-completions', baseURL: 'https://api.openai.com/v1' } },
      { id: 'claude', label: 'Claude · Anthropic', draft: { name: 'Claude', protocol: 'anthropic', baseURL: 'https://api.anthropic.com/v1' } },
      { id: 'grok', label: 'Grok · xAI', draft: { name: 'Grok', protocol: 'openai-completions', baseURL: 'https://api.x.ai/v1' } },
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

    /** 已配置账号卡片：折叠摘要 + 模型列表（与专业 Agent 卡片同形态）。 */
    function AccountCard(props) {
      const { provider, displayName, active, models, profile, total, buckets, expanded, t, onToggle } = props
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
          profile && profile.baseURL ? el('p', { className: 'dshrouter-meta' }, `${t('accountBaseUrl')}: ${profile.baseURL}`) : null,
          el('div', { className: 'dshrouter-head' }, el('span', { className: 'dshrouter-meta' }, t('accountModels'))),
          models.length === 0 ? el('p', { className: 'dshrouter-hint' }, t('accountMissing')) : el('table', { className: 'dshrouter-table' },
            el('thead', null, el('tr', null, el('th', null, t('fieldModel')), el('th', null, t('fieldName')), el('th', null, 'input'))),
            el('tbody', null, ...models.map((model) => el('tr', { key: model.id },
              el('td', null, model.id),
              el('td', null, model.name || '—'),
              el('td', null, (model.inputModalities ?? []).join(', ') || '—'))))),
          (buckets ?? []).length > 0 ? el(BarChart, { buckets, title: t('statsSeries') }) : null) : null)
    }

    /** 账号列表末尾的「+」登录卡片。 */
    function AddAccountCard(props) {
      const { t, adding, setAdding, account, setAccount, providers, writable, busy, failure, onLogin, accountProvider } = props
      if (!adding) {
        return el('div', { className: 'dshrouter-add', role: 'button', tabIndex: 0, onClick: () => setAdding(true), onKeyDown: (event) => { if (event.key === 'Enter') setAdding(true) } },
          el('span', { style: { fontSize: 18, lineHeight: 1 } }, '+'),
          el('span', null, t('addAccount')))
      }
      return el('div', { className: 'dshrouter-card' },
        el('div', { className: 'dshrouter-head' },
          el('span', { className: 'dshrouter-name' }, t('addAccount')),
          el('span', { className: 'dshrouter-spacer' }),
          el('button', { type: 'button', className: 'dshrouter-button ghost', onClick: () => { setAdding(false); setAccount((current) => ({ ...current, key: '', failure: null })) } }, t('cancel'))),
        el('div', { className: 'dshrouter-row' },
          el('span', { className: 'dshrouter-meta' }, t('accountPresets')),
          ...ACCOUNT_PRESETS.map((preset) => el('button', {
            type: 'button', key: preset.provider,
            className: 'dshrouter-chip' + (account.provider === preset.provider ? ' active' : ''),
            onClick: () => setAccount((current) => ({ ...current, provider: preset.provider, baseUrl: '' })),
          }, preset.label))),
        el('div', { className: 'dshrouter-row' },
          el('select', {
            className: 'dshrouter-select', style: { flex: '0 0 240px' },
            value: account.provider,
            onChange: (event) => setAccount((current) => ({ ...current, provider: event.target.value, baseUrl: '' })),
          }, providers.filter((entry) => entry.settingsNs === 'llm-pi-ai').map((entry) =>
            el('option', { value: entry.provider, key: entry.provider }, `${entry.displayName} (${entry.provider})`))),
          el('input', {
            className: 'dshrouter-input', type: 'password', autoComplete: 'off',
            placeholder: t('accountKey'), 'aria-label': t('accountKey'),
            value: account.key, onChange: (event) => setAccount((current) => ({ ...current, key: event.target.value })),
          }),
          el('input', {
            className: 'dshrouter-input', type: 'text',
            placeholder: t('accountBaseUrl'), 'aria-label': t('accountBaseUrl'),
            value: account.baseUrl, onChange: (event) => setAccount((current) => ({ ...current, baseUrl: event.target.value })),
          }),
          el('button', {
            type: 'button', className: 'dshrouter-button',
            disabled: busy || !account.key.trim() || !writable,
            onClick: onLogin,
          }, busy ? t('saving') : t('accountLogin'))),
        accountProvider ? el('p', { className: 'dshrouter-meta' }, `${accountProvider.provider} · ${accountProvider.active ? t('accountActive') : t('accountDormant')}`) : null,
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
              el('input', { className: 'dshrouter-input', value: draft.scope ?? '', onChange: (event) => onDraftField('scope', event.target.value) })),
            el('button', { type: 'button', className: 'dshrouter-button', disabled: busy || !writable, onClick: onOneClick }, busy ? t('oauthWaiting') : t('oauthOneClick')),
            el('button', { type: 'button', className: 'dshrouter-button ghost', disabled: busy || !writable, onClick: onAuthorize }, t('oauthOpenUrl'))),
          loginMode === 'code' ? el('p', { className: 'dshrouter-hint' }, t('oauthOneClickHint')) : null,
          loginMode === 'code' && draft.publicClient === true ? el('p', { className: 'dshrouter-hint' }, t('oauthPublicClientHint')) : null,
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
            }, busy ? t('oauthExchanging') : t('oauthExchange'))) : null,
          el('div', { className: 'dshrouter-head', style: { marginTop: 4 } }, el('span', { className: 'dshrouter-subtitle' }, t('oauthModels'))),
          el('div', { className: 'dshrouter-row' },
            el('input', {
              className: 'dshrouter-input', type: 'text',
              placeholder: t('oauthModels'), 'aria-label': t('oauthModels'),
              value: (draft.models ?? []).join(', '),
              onChange: (event) => onDraftField('models', event.target.value.split(',').map((item) => item.trim()).filter(Boolean)),
            }),
            el('button', { type: 'button', className: 'dshrouter-button ghost', disabled: busy || !writable, onClick: onDiscover }, busy ? t('oauthDiscovering') : t('oauthDiscover'))),
          notice ? el('p', { className: 'dshrouter-hint' }, notice) : null,
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
          }, preset.label))))
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
      const [discover, setDiscover] = useState(null)
      const [account, setAccount] = useState({ provider: 'openai', baseUrl: '', key: '', busy: false, failure: null, state: null })
      const [stats, setStats] = useState(null)
      const [expandedAgents, setExpandedAgents] = useState({})
      const [expandedAccounts, setExpandedAccounts] = useState({})
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
      const loadRef = useRef(() => {})

      const load = useCallback(async () => {
        const routerRemote = remote()
        if (!routerRemote) {
          setState((current) => ({ ...current, status: 'error', error: t('loadFailed') + ': remote.router 未就绪（宿主行 dsh-router 未挂载或 Remote 挂载失败）' }))
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
        const provider = account.provider
        const key = account.key.trim()
        if (!key) return
        setAccount((current) => ({ ...current, busy: true, failure: null }))
        try {
          const ref = deriveKeyRef(provider)
          const settingsResponse = await api.settings.describe({})
          if (!settingsResponse.result.ok) throw new Error(settingsResponse.result.error.message)
          const namespaces = settingsResponse.result.value.namespaces
          const llmView = viewOf(namespaces, 'llm-pi-ai')
          if (!llmView) throw new Error('llm-pi-ai namespace 不可用：请确认该适配器已挂载')
          const existing = llmView.value && llmView.value.providers ? llmView.value.providers[provider] : undefined
          if (existing === undefined) {
            const profile = { apiKeyEnv: ref, ...(account.baseUrl.trim() ? { baseURL: account.baseUrl.trim() } : {}) }
            const response = await api.settings.mutate({
              ns: 'llm-pi-ai',
              ops: [{ op: 'set', path: ['providers', provider], value: profile }],
            })
            if (!response.result.ok) throw new Error(response.result.error.message)
          }
          const stored = await api.credentials.set({ ref, value: key })
          if (!stored.result.ok) throw new Error(stored.result.error.message)
          setAccount((current) => ({ ...current, busy: false, key: '', state: { configured: true } }))
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

      // 已添加的账号（llm-pi-ai 目录中已激活的路由 = 已配置 profile）。
      const addedAccounts = providers
        .filter((entry) => entry.settingsNs === 'llm-pi-ai' && entry.active === true)
        .map((entry) => entry.provider)
      for (const total of stats ? stats.accountTotals ?? [] : []) {
        if (!addedAccounts.includes(total.provider)) addedAccounts.push(total.provider)
      }
      addedAccounts.sort()
      const accountModelsOf = (provider) => {
        const group = (state.models ?? []).find((entry) => entry.provider === provider)
        return group ? group.models ?? [] : []
      }
      const accountProfileOf = (provider) => {
        const profiles = state.llmPiAi && state.llmPiAi.value && state.llmPiAi.value.providers ? state.llmPiAi.value.providers : null
        const profile = profiles ? profiles[provider] : undefined
        return profile && typeof profile === 'object' ? profile : null
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

      /** 快速添加账号：点服务商预设即创建账号；Gemini 立即一键授权，其余提示粘贴 token。 */
      const quickAddOauthAccount = async (presetId) => {
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
        if (preset.draft.authUrl) {
          await runOneClickOauth(accountId, tokenRef)
        } else {
          setOauthNotice((current) => ({ ...current, [accountId]: t('oauthAddedPasteHint') }))
          setExpandedOauth((current) => ({ ...current, [accountId]: true }))
        }
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
          popup = window.open(response.value.authUrl, 'dsh-router-oauth', 'popup,width=520,height=680')
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
            setOauthNotice((current) => ({ ...current, [id]: t('oauthDone') }))
            refreshOauthTokens()
            try { popup.close() } catch { /* 已由用户关闭 */ }
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
        if (draft.scope) params.set('scope', draft.scope)
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
        if (!response.ok) { setOauthNotice((current) => ({ ...current, [id]: response.error.message })); return }
        const entry = oauthById.get(id)
        const merged = [...new Set([...(entry ? entry.models ?? [] : []), ...response.value.models])]
        const outcome = await mutate([{ op: 'set', path: ['oauthAccounts', id, 'models'], value: merged }])
        setOauthNotice((current) => ({ ...current, [id]: outcome.ok ? response.value.message : outcome.message }))
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

      return el('section', { className: 'dshrouter-section', 'aria-label': t('title') },
        el('h2', { className: 'dshrouter-title' }, t('title')),
        el('p', { className: 'dshrouter-intro' }, t('intro')),
        // ── 总开关（唯一不折叠）──────────────────────────────────────────
        el('div', { className: 'dshrouter-card' },
          el('label', { className: 'dshrouter-switch' },
            el('input', { type: 'checkbox', checked: enabled, disabled: !state.writable, onChange: toggleMaster }),
            t('masterSwitch')),
          el('p', { className: 'dshrouter-hint' }, t('masterHint')),
          !enabled ? el('p', { className: 'dshrouter-error' }, t('routeDisabled')) : null),
        // ── 多模态账号管理（标题 + 说明 + 卡片列表 + 末尾「+」）──────────
        el('div', { className: 'dshrouter-head' },
          el('h3', { className: 'dshrouter-title' }, t('accountTitle')),
          el('span', { className: 'dshrouter-spacer' }),
          el('span', { className: 'dshrouter-meta' }, t('accountSummary')(addedAccounts.length))),
        el('p', { className: 'dshrouter-intro' }, t('accountIntro')),
        el('p', { className: 'dshrouter-hint' }, t('accountOAuth')),
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
            t,
            onToggle: () => toggleAccount(provider),
          })
        }),
        el(AddAccountCard, {
          t, adding: addingAccount, setAdding: setAddingAccount,
          account, setAccount, providers, writable: state.writable, busy: account.busy,
          failure: account.failure, accountProvider,
          onLogin: doLogin,
        }),
        // OAuth 账号子区（官方登录，插件独立管理）
        el('hr', { className: 'dshrouter-divider' }),
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
        // ── 账号池（扩展功能；多账号健康路由 + 失败切换）─────────────────
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
        // ── 统计信息（标题 + 说明 + Agent 级/账号级卡片列表）────────────
        el('div', { className: 'dshrouter-head' },
          el('h3', { className: 'dshrouter-title' }, t('statsTitle')),
          el('span', { className: 'dshrouter-spacer' }),
          el('span', { className: 'dshrouter-meta' }, t('statsSummary')(sumAll.calls, sumAll.errors)),
          el('button', { type: 'button', className: 'dshrouter-button ghost', onClick: clearStats }, t('statsReset'))),
        el('p', { className: 'dshrouter-intro' }, t('statsIntro')),
        stats && stats.enabled === false ? el('p', { className: 'dshrouter-error' }, t('statsDisabled')) : null,
        el('div', { className: 'dshrouter-row' },
          el('span', { className: 'dshrouter-meta' }, `${t('statsCalls')}: ${sumAll.calls}`),
          el('span', { className: 'dshrouter-meta', style: sumAll.errors > 0 ? { color: 'var(--dsw-alias-state-error-primary)' } : undefined }, `${t('statsErrors')}: ${sumAll.errors}`),
          el('span', { className: 'dshrouter-meta' }, `${t('statsTokens')}: ${fmtTokens(sumAll.inTokens)} / ${fmtTokens(sumAll.outTokens)}`)),
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
        // ── 专业 Agent 卡片列表（标题 + 说明 + 卡片 + 末尾「+」）──────────
        el('div', { className: 'dshrouter-head' }, el('h3', { className: 'dshrouter-title' }, t('agentsTitle'))),
        el('p', { className: 'dshrouter-intro' }, t('agentsIntro')),
        agentIds.length === 0 ? el('p', { className: 'dshrouter-intro' }, t('noAgents')) : null,
        ...agentIds.map((id) => {
          const draft = draftOf(id)
          const catalog = catalogById.get(id)
          const testResult = testResults[id]
          return el(AgentCard, {
            key: id, id, draft, t, writable: state.writable, busy: !!busy[id], notice: notice[id],
            providers, models: state.models ?? [], catalog, oauthAccounts: oauthEntries, pools: poolEntries, testResult,
            stat: statsTotals.get(id) ?? null,
            buckets: statsSeries.get(id) ?? [],
            expanded: expandedAgents[id] === true,
            onToggle: () => toggleExpanded(id),
            onField: (key, fieldValue) => setDraftField(id, key, fieldValue),
            onSave: () => saveAgent(id, false),
            onDelete: () => deleteAgent(id),
            onTest: () => runTest(id),
            onDiscover: (provider) => setDiscover({ id, provider }),
          })
        }),
        el(AddAgentCard, {
          t, adding, setAdding, newId, setNewId, idTaken, idInvalid,
          writable: state.writable,
          agentIds,
          onSave: () => saveAgent(newId.trim(), true),
          onTemplate: addFromTemplate,
        }),
        // 发现模型弹窗
        discover ? el(DiscoverModal, {
          api, t, provider: discover.provider,
          providers,
          onClose: () => setDiscover(null),
          onAdopt: (model) => { setDraftField(discover.id, 'model', model); setDiscover(null) },
        }) : null,
      )
    }

    function AgentCard(props) {
      const { id, draft, t, writable, busy, notice, providers, models, catalog, oauthAccounts, pools, testResult, stat, buckets, expanded, onToggle, onField, onSave, onDelete, onTest, onDiscover } = props
      const groups = models ?? []
      const group = groups.find((entry) => entry.provider === (draft.provider || ''))
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
      const sourceLabel = catalog ? ({ agent: t('sourceAgent'), main: t('sourceMain'), 'provider-default': t('sourceProvider'), account: t('fieldAccount'), pool: t('poolAccountSource') }[catalog.source] ?? t('sourceUnknown')) : ''
      const barBuckets = (buckets ?? []).slice(-48)
      const barMax = Math.max(1, ...barBuckets.map((bucket) => bucket.inputTokens + bucket.outputTokens))
      const typeLabel = ({ chat: t('typeChat'), agent: t('typeAgent'), image: t('typeImage'), speech: t('typeSpeech') }[draft.type] ?? t('typeChat'))

      // 折叠摘要：类型 tag + 生效模型 + 简要用量
      const summary = el('div', { className: 'dshrouter-card' },
        el('button', { type: 'button', className: 'dshrouter-card-head', onClick: onToggle, 'aria-expanded': expanded, title: expanded ? t('collapse') : t('expand') },
          el('span', { className: 'dshrouter-name' }, draft.name || id),
          el('span', { className: 'dshrouter-id' }, id),
          el('span', { className: 'dshrouter-tag' }, draft.type || 'chat'),
          catalog && catalog.error ? el('span', { className: 'dshrouter-error', title: catalog.error }, '⚠') : null,
          el('span', { className: 'dshrouter-meta' }, `${effective}`),
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
              el('option', { value: 'speech' }, t('typeSpeech'))))),
        el('p', { className: 'dshrouter-hint' }, t('fieldTypeHint')),
        el('div', { className: 'dshrouter-field' },
          el('span', { className: 'dshrouter-field-label' }, t('fieldDescription')),
          el('textarea', { className: 'dshrouter-textarea', value: draft.description ?? '', onChange: (event) => onField('description', event.target.value) })),
        ((oauthAccounts ?? []).length > 0 || (pools ?? []).length > 0) ? el('div', { className: 'dshrouter-field' },
          el('span', { className: 'dshrouter-field-label' }, t('fieldAccount')),
          el('select', { className: 'dshrouter-select', value: draft.account ?? '', onChange: (event) => onField('account', event.target.value) },
            el('option', { value: '' }, `— ${t('inherit')} —`),
            ...(pools ?? []).map((entry) => el('option', { value: `pool:${entry.id}`, key: `pool:${entry.id}` }, `${t('poolTitle')} · ${entry.name || entry.id} (${entry.id})`)),
            ...(oauthAccounts ?? []).map((entry) => el('option', { value: entry.id, key: entry.id }, `${entry.name || entry.id} (${entry.id})`))),
          draft.account ? el('p', { className: 'dshrouter-hint' }, t('oauthChatOnly')) : null) : null,
        el('div', { className: 'dshrouter-row' },
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
            el('div', { className: 'dshrouter-field' },
              el('span', { className: 'dshrouter-field-label' }, t('fieldReasoning')),
              el('input', { className: 'dshrouter-input', value: draft.reasoningEffort ?? '', placeholder: 'high', onChange: (event) => onField('reasoningEffort', event.target.value) })),
            el('div', { className: 'dshrouter-field' },
              el('span', { className: 'dshrouter-field-label' }, t('fieldTemperature')),
              el('input', { className: 'dshrouter-input', type: 'number', min: 0, max: 2, step: 0.1, value: draft.temperature ?? 0, onChange: (event) => onField('temperature', Number(event.target.value) || 0) })),
            el('div', { className: 'dshrouter-field' },
              el('span', { className: 'dshrouter-field-label' }, t('fieldMaxTokens')),
              el('input', { className: 'dshrouter-input', type: 'number', min: 0, step: 1, value: draft.maxTokens ?? 0, onChange: (event) => onField('maxTokens', Number(event.target.value) || 0) })),
            draft.type !== 'image' ? el('div', { className: 'dshrouter-field' },
              el('span', { className: 'dshrouter-field-label' }, t('fieldMaxRounds')),
              el('input', { className: 'dshrouter-input', type: 'number', min: 1, max: 8, step: 1, value: draft.maxRounds ?? 1, onChange: (event) => onField('maxRounds', Math.max(1, Math.min(8, Number(event.target.value) || 1))) })) : null,
            el('div', { className: 'dshrouter-field' },
              el('span', { className: 'dshrouter-field-label' }, t('fieldCapabilities')),
              el('input', { className: 'dshrouter-input', value: (draft.capabilities ?? []).join(', '), onChange: (event) => onField('capabilities', event.target.value.split(',').map((item) => item.trim()).filter(Boolean)) }))),
          el('div', { className: 'dshrouter-field', style: { marginTop: 8 } },
            el('span', { className: 'dshrouter-field-label' }, t('fieldSystemPrompt')),
            el('textarea', { className: 'dshrouter-textarea', value: draft.systemPrompt ?? '', onChange: (event) => onField('systemPrompt', event.target.value) }))),
        el('p', { className: 'dshrouter-meta' },
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
          el('button', { type: 'button', className: 'dshrouter-button ghost', disabled: testResult && testResult.busy, onClick: onTest }, testResult && testResult.busy ? t('testing') : t('test')),
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
      const { api, t, provider, providers, onClose, onAdopt } = props
      const [busy, setBusy] = useState(true)
      const [failure, setFailure] = useState(null)
      const [candidates, setCandidates] = useState([])
      const entry = providers.find((item) => item.provider === provider)
      useEffect(() => {
        let alive = true
        setBusy(true)
        setFailure(null)
        api.llm.discoverModels({
          settingsNs: entry ? entry.settingsNs : 'llm-pi-ai',
          provider,
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

    // ── 插件装配 ────────────────────────────────────────────────────────────
    const NS = 'router'
    const inject = ['slots', 'locale', 'connection', 'remote']

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-router: locale')
      const connection = ctx.get('connection')
      const api = connection.api
      const t = ctx.locale.bind(NS)
      const remoteReady = ctx.remote.$mount(ROUTER_REMOTE).catch((error) => {
        console.error('dsh-router: remote mount failed', error)
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
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
