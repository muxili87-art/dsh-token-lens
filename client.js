window.__ModuleLoader__.load({
  id: 'dsh-token-lens',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState } = React

    const NS = 'usage.dashboard'
    const PANEL_ID = 'usage'
    const DAY = 86_400_000
    const TZ = -new Date().getTimezoneOffset()
    const PAGE_SIZE = 50
    // Stable per-model identity colors; independent from status and heat scales.
    const MODEL_COLORS = {
      'deepseek-v4-flash': '#8D9BE8',
      'deepseek-v4.1-flash': '#A495E8',
      'deepseek-flash': '#54BEA5',
    }
    const FALLBACK_COLORS = ['#C9A0D8', '#D8B47E', '#7FB8D9', '#B48FD6', '#8FC7A8', '#D89FA4']
    // Model names are public unless they visibly embed an account, path or credential.
    const SENSITIVE_MODEL = /(@[a-z0-9.-]+\.[a-z]{2,}|[/](?:Users|home|var|tmp|private|opt)[/]|^[/]|https?:[/][/]|\b(?:sk|ak|ghp|gho|AKIA)[-_][A-Za-z0-9]{6,})/i
    function modelColor(name) {
      const key = String(name || '')
      if (MODEL_COLORS[key] !== undefined) return MODEL_COLORS[key]
      let hash = 0
      for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
      return FALLBACK_COLORS[hash % FALLBACK_COLORS.length]
    }

    const zh = {
      panel: '用量分析',
      title: '用量分析',
      subtitle: '本地会话日志 · Token、费用与请求诊断',
      'range.today': '今日',
      'range.7d': '7 天',
      'range.30d': '30 天',
      'range.all': '全部',
      'range.custom': '自定义',
      refresh: '刷新',
      updated: '更新于',
      loading: '正在读取会话日志…',
      scanning: '正在统计历史会话',
      'scan.hint': '首次统计需要读取本地会话日志，完成后会缓存。',
      retry: '重试',
      'error.auth': '登录状态已失效，请刷新页面。',
      'error.http': '请求失败',
      'error.progress': '有 TH 个会话读取失败，统计可能不完整。',
      'error.more': '详情',
      empty: '这段时间还没有用量记录。',
      'kpi.tokens': '总 Token',
      'kpi.cost': '费用（估算）',
      'kpi.requests': '请求数',
      'kpi.cacheShare': '缓存读取占比',
      'kpi.avgTokens': '平均每次',
      'kpi.avgCost': '平均每次',
      'kpi.cacheTokens': '缓存读取',
      'kpi.costTip': '按 pricing.json 价格估算，非供应商账单',
      'kpi.costNote': '说明',
      'kpi.notBill': '非账单',
      'billing.tier': '价格档位',
      'billing.peak': '高峰',
      'billing.offPeak': '空闲',
      'billing.hit': '缓存命中',
      'billing.miss': '缓存未命中',
      'billing.output': '输出',
      'billing.write': '缓存写入',
      'billing.total': '合计',
      'billing.book': '价格版本',
      'billing.official': '官方价',
      'billing.assumed': '官方价假设',
      'billing.unconfirmed': '价格未确认',
      'billing.unknownCount': '未定价请求',
      'billing.tools': '工具调用费用未统计',
      'billing.checkedAt': '核对于',
      'billing.perMillion': '/百万',
      'billing.footer': '计费口径：',
      'billing.reason.provider-unconfigured': '供应商未配置',
      'billing.reason.provider-unconfirmed': '供应商价格未确认',
      'billing.reason.book-missing': '价目表缺失',
      'billing.reason.model-unmapped': '模型未映射',
      'billing.reason.price-not-effective': '该日期无生效价格',
      'billing.reason.tier-missing': '价格档位缺失',
      'sub.unpriced': '未定价模型',
      'sub.cacheShareHint': '缓存读取 ÷（输入 + 缓存读取）',
      'sub.input': '输入',
      'sub.output': '输出',
      'sub.cacheRead': '缓存读取',
      'sub.failures': '失败',
      'sub.aborted': '中断',
      'sub.success': '成功率',
      'sub.sessions': '会话',
      'sub.llm': '模型耗时',
      'sub.tool': '工具耗时',
      'meta.time': '对话时长',
      'meta.active': '活跃',
      'meta.days': '天',
      'meta.timeHint': '回合起止累计；与模型 + 工具之差为排队与回合开销。',
      'trend.title': '用量趋势',
      'trend.tokens': 'Token',
      'trend.requests': '请求',
      'trend.cost': '费用',
      'trend.time': '模型耗时',
      'trend.speed': '速度',
      'trend.speedEmpty': '暂无速度数据',
      'trend.speedBasis': '端到端',
      'trend.chartType': '图表类型',
      'trend.chartBar': '柱状图',
      'trend.chartLine': '折线图',
      'trend.speedGap': '该区间缺少有效速度观测',
      'trend.speedP50Note': '端到端 P50：按有效请求速度取中位数',
      'speed.compare': '速度分布',
      'speed.trend': '速度趋势',
      'speed.samples': '有效请求',
      'speed.rangeNote': 'P25–P75 区间 · 圆点为 P50',
      'speed.lowSamples': '样本不足',
      'trend.hour': '按小时',
      'trend.quarter': '按 15 分钟',
      'trend.day': '按天',
      'trend.week': '按周',
      'trend.month': '按月',
      'trend.chartDisabledSpeed': '速度分布不区分图表类型，切到速度趋势后可选',
      'trend.chartDisabledSpeedMulti': '多模型时速度用折线对比；筛选单个模型后可选柱状',
      'trend.empty': '暂无趋势数据',
      'trend.all': '全部模型',
      'trend.filtered': '已筛选',
      'share.fullRange': '全模型',
      'share.title': '模型分布',
      'share.requests': '请求',
      'share.tokens': 'Token',
      'share.cost': '费用',
      'share.total': '合计',
      'share.empty': '暂无模型记录',
      'share.hint': '点击模型可筛选趋势和请求明细',
      'eff.title': '模型效率',
      'eff.all': '全部模型（汇总）',
      'eff.tokens': '消耗 Token',
      'eff.cost': '估算费用',
      'eff.avg': '平均请求耗时',
      'eff.avgHint': '按有耗时记录的请求取平均',
      'eff.speed': '加权平均速率',
      'eff.speedHint': '加权平均：输出 Token 总和 ÷ 有效耗时总和（端到端，不含工具与排队）',
      'heat.title': '使用热力图',
      'heat.byDay': '按天',
      'heat.requests': '请求数',
      'heat.tokens': 'Token',
      'heat.cost': '费用',
      'heat.time': '对话耗时',
      'heat.less': '少',
      'heat.more': '多',
      'heat.unknown': '未采集',
      'heat.out': '不在所选范围',
      'heat.empty': '这段时间还没有每日记录',
      'week.mon': '一',
      'week.tue': '二',
      'week.wed': '三',
      'week.thu': '四',
      'week.fri': '五',
      'week.sat': '六',
      'week.sun': '日',
      'filter.day': '已筛选日期',
      'filter.model': '已筛选模型',
      'filter.clear': '清除',
      'filter.all': '清除全部',
      'privacy.off': '隐私模式',
      'privacy.on': '隐私保护已开启',
      'privacy.hint': '隐藏会话名、账号与错误详情，统计数字保持不变',
      'privacy.session': '会话',
      'privacy.account': '账号',
      'privacy.textHidden': '内容已隐藏',
      'privacy.modelHidden': '模型已隐藏',
      'privacy.searchHidden': '筛选条件已隐藏',
      'requests.title': '请求明细',
      'requests.all': '最近',
      'requests.faults': '异常',
      'requests.search': '搜索会话或模型…',
      'requests.time': '时间',
      'requests.session': '会话',
      'requests.model': '模型',
      'requests.input': '输入',
      'requests.cache': '缓存',
      'requests.output': '输出',
      'requests.duration': '耗时',
      'requests.cost': '费用',
      'requests.speed': '速度',
      'requests.speedHint': '端到端：输出 Token ÷ 模型调用耗时',
      'requests.columns': '列',
      'requests.status': '状态',
      'requests.kind': '类型',
      'requests.message': '信息',
      'requests.ok': '成功',
      'requests.failed': '失败',
      'requests.aborted': '中断',
      'requests.empty': '没有请求记录',
      'requests.noneFaults': '没有失败或中断的请求',
      'requests.loading': '正在读取请求…',
      'requests.prev': '上一页',
      'requests.next': '下一页',
      'requests.page': '第 PG / TP 页',
      'requests.count': '共 TN 条',
      'requests.inputHint': '输入 = 未命中缓存的输入 Token；总 Token = 输入 + 缓存 + 输出。',
      'note.unpriced': '以下模型没有价格，费用按 0 计：',
      'footer.source': '数据来自本地会话日志；这是本地记录的请求，不等价于供应商平台的完整用量。',
      'footer.coverage': '本地日志：SE 个会话（进行中 LE 个，读取失败 ER 个）。',
      'footer.cache': '缓存读取占比 = 缓存读取 ÷（输入 + 缓存读取），只反映输入侧。',
      'footer.time': '对话时长是回合起止累计，不等于会话经过时间；与模型 + 工具之差为排队与回合开销。',
      'footer.price': '费用按 pricing.json 中的价格估算，仅供参考，最终以供应商账单为准。',
    }

    const en = {
      panel: 'Usage Analysis',
      title: 'Usage Analysis',
      subtitle: 'Local session logs · tokens, cost and request diagnostics',
      'range.today': 'Today',
      'range.7d': '7 days',
      'range.30d': '30 days',
      'range.all': 'All time',
      'range.custom': 'Custom',
      refresh: 'Refresh',
      updated: 'Updated',
      loading: 'Reading session logs…',
      scanning: 'Scanning history',
      'scan.hint': 'The first scan reads local session logs, then caches the result.',
      retry: 'Retry',
      'error.auth': 'Your session expired. Reload the page.',
      'error.http': 'Request failed',
      'error.progress': 'TH sessions could not be read; totals may be incomplete.',
      'error.more': 'details',
      empty: 'No usage recorded in this range.',
      'kpi.tokens': 'Total tokens',
      'kpi.cost': 'Cost (est.)',
      'kpi.requests': 'Requests',
      'kpi.cacheShare': 'Cache read share',
      'kpi.avgTokens': 'avg / request',
      'kpi.avgCost': 'avg / request',
      'kpi.cacheTokens': 'cache reads',
      'kpi.costTip': 'estimated from pricing.json, not a provider bill',
      'kpi.costNote': 'note',
      'kpi.notBill': 'not a bill',
      'billing.tier': 'Price tier',
      'billing.peak': 'peak',
      'billing.offPeak': 'off-peak',
      'billing.hit': 'Cache hit',
      'billing.miss': 'Cache miss',
      'billing.output': 'Output',
      'billing.write': 'Cache write',
      'billing.total': 'Total',
      'billing.book': 'Price book',
      'billing.official': 'official',
      'billing.assumed': 'assumed official',
      'billing.unconfirmed': 'price unconfirmed',
      'billing.unknownCount': 'Unpriced requests',
      'billing.tools': 'tool call fees not counted',
      'billing.checkedAt': 'checked',
      'billing.perMillion': '/1M',
      'billing.footer': 'Billing: ',
      'billing.reason.provider-unconfigured': 'provider not configured',
      'billing.reason.provider-unconfirmed': 'provider price unconfirmed',
      'billing.reason.book-missing': 'price book missing',
      'billing.reason.model-unmapped': 'model not mapped',
      'billing.reason.price-not-effective': 'no price effective on that date',
      'billing.reason.tier-missing': 'price tier missing',
      'sub.unpriced': 'unpriced models',
      'sub.cacheShareHint': 'cache reads ÷ (input + cache reads)',
      'sub.input': 'in',
      'sub.output': 'out',
      'sub.cacheRead': 'cache reads',
      'sub.failures': 'failed',
      'sub.aborted': 'aborted',
      'sub.success': 'success',
      'sub.sessions': 'sessions',
      'sub.llm': 'model',
      'sub.tool': 'tools',
      'meta.time': 'Conversation time',
      'meta.active': 'Active',
      'meta.days': 'days',
      'meta.timeHint': 'Sum of turn durations; the gap to model + tools is queueing and turn overhead.',
      'trend.title': 'Usage trend',
      'trend.tokens': 'Tokens',
      'trend.requests': 'Requests',
      'trend.cost': 'Cost',
      'trend.time': 'Model time',
      'trend.speed': 'Speed',
      'trend.speedEmpty': 'No speed data',
      'trend.speedBasis': 'end-to-end',
      'trend.chartType': 'Chart type',
      'trend.chartBar': 'Bars',
      'trend.chartLine': 'Line',
      'trend.speedGap': 'No speed observation in this interval',
      'trend.speedP50Note': 'End-to-end P50: median of valid per-request speeds',
      'speed.compare': 'Speed distribution',
      'speed.trend': 'Speed trend',
      'speed.samples': 'valid requests',
      'speed.rangeNote': 'P25–P75 range · dot is P50',
      'speed.lowSamples': 'small sample',
      'trend.hour': 'hourly',
      'trend.quarter': '15-min',
      'trend.day': 'daily',
      'trend.week': 'weekly',
      'trend.month': 'monthly',
      'trend.chartDisabledSpeed': 'Chart type is unavailable for speed distribution',
      'trend.chartDisabledSpeedMulti': 'Speed uses lines to compare models; filter to one model for bars',
      'trend.empty': 'No trend data',
      'trend.all': 'All models',
      'trend.filtered': 'filtered',
      'share.fullRange': 'all models',
      'share.title': 'Model mix',
      'share.requests': 'Requests',
      'share.tokens': 'Tokens',
      'share.cost': 'Cost',
      'share.total': 'total',
      'share.empty': 'No model records',
      'share.hint': 'Click a model to filter the trend and requests',
      'eff.title': 'Model efficiency',
      'eff.all': 'All models (total)',
      'eff.tokens': 'Tokens used',
      'eff.cost': 'Estimated cost',
      'eff.avg': 'Avg request time',
      'eff.avgHint': 'averaged over requests with a recorded duration',
      'eff.speed': 'Weighted avg rate',
      'eff.speedHint': 'weighted average: total output tokens ÷ total valid call time (end-to-end)',
      'heat.title': 'Usage heatmap',
      'heat.byDay': 'by day',
      'heat.requests': 'Requests',
      'heat.tokens': 'Tokens',
      'heat.cost': 'Cost',
      'heat.time': 'Conversation time',
      'heat.less': 'Less',
      'heat.more': 'More',
      'heat.unknown': 'not collected',
      'heat.out': 'outside the selected range',
      'heat.empty': 'No daily records in this window',
      'week.mon': 'Mon',
      'week.tue': 'Tue',
      'week.wed': 'Wed',
      'week.thu': 'Thu',
      'week.fri': 'Fri',
      'week.sat': 'Sat',
      'week.sun': 'Sun',
      'filter.day': 'Date filter',
      'filter.model': 'Model filter',
      'filter.clear': 'clear',
      'filter.all': 'Clear all',
      'privacy.off': 'Privacy mode',
      'privacy.on': 'Privacy on',
      'privacy.hint': 'Hide session names, accounts and error details; totals stay accurate',
      'privacy.session': 'Session',
      'privacy.account': 'Account',
      'privacy.textHidden': 'Content hidden',
      'privacy.modelHidden': 'Model hidden',
      'privacy.searchHidden': 'Filter hidden',
      'requests.title': 'Requests',
      'requests.all': 'Recent',
      'requests.faults': 'Faults',
      'requests.search': 'Search session or model…',
      'requests.time': 'Time',
      'requests.session': 'Session',
      'requests.model': 'Model',
      'requests.input': 'In',
      'requests.cache': 'Cache',
      'requests.output': 'Out',
      'requests.duration': 'Took',
      'requests.cost': 'Cost',
      'requests.speed': 'Speed',
      'requests.speedHint': 'end-to-end: output tokens ÷ model call time',
      'requests.columns': 'Columns',
      'requests.status': 'Status',
      'requests.kind': 'Type',
      'requests.message': 'Message',
      'requests.ok': 'ok',
      'requests.failed': 'failed',
      'requests.aborted': 'aborted',
      'requests.empty': 'No requests recorded',
      'requests.noneFaults': 'No failed or aborted requests',
      'requests.loading': 'Loading requests…',
      'requests.prev': 'Prev',
      'requests.next': 'Next',
      'requests.page': 'PG / TP',
      'requests.count': 'TN total',
      'requests.inputHint': 'In = uncached input tokens; total = input + cache + output.',
      'note.unpriced': 'These models have no price, so their cost is counted as 0:',
      'footer.source': 'Local session logs only; these are locally recorded requests, not the provider’s full usage.',
      'footer.coverage': 'Local logs: SE sessions (LE live, ER unreadable).',
      'footer.cache': 'Cache read share = cache reads ÷ (input + cache reads), input side only.',
      'footer.time': 'Conversation time sums turn durations, not session wall time; the gap to model + tools is queueing and turn overhead.',
      'footer.price': 'Cost is estimated from pricing.json and is not a bill; the provider statement is authoritative.',
    }

    const CSS = `
.ud-page,.ud-page *,.ud-page *::before,.ud-page *::after{box-sizing:border-box}
.ud-page{
  --ud-bg:var(--dsw-alias-bg-base);--ud-card:var(--dsw-alias-bg-layer-1);--ud-sub:var(--dsw-alias-bg-layer-2);
  --ud-hover:color-mix(in srgb, var(--dsw-alias-label-primary) 6%, var(--dsw-alias-bg-layer-2));
  --ud-border:var(--dsw-alias-border-l1);--ud-border-strong:var(--dsw-alias-border-l2);
  --ud-text:var(--dsw-alias-label-primary);--ud-text2:var(--dsw-alias-label-secondary);
  --ud-accent:var(--dsw-alias-brand-primary);
  --ud-success:var(--dsw-alias-state-success-primary);--ud-error:var(--dsw-alias-state-error-primary);
  --ud-grid:color-mix(in srgb, var(--ud-border) 55%, transparent);
  --ud-shadow:0 1px 2px rgba(0,0,0,.22);
  display:flex;flex-direction:column;width:100%;height:100%;min-height:0;overflow:hidden;
  background:var(--ud-bg);color:var(--ud-text);font-size:14px;line-height:1.55;
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;
}
.ud-scroll{flex:1;min-height:0;overflow:auto;scrollbar-gutter:stable}
.ud-content{width:100%;max-width:1360px;margin:0 auto;padding:0 clamp(24px,3vw,48px) 56px}
.ud-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:16px;padding:26px 0 16px}
.ud-head h1{margin:0;font-size:20px;font-weight:600;line-height:28px;letter-spacing:-.01em}
.ud-sub{margin:5px 0 0;font-size:12.5px;color:var(--ud-text2)}
.ud-controls{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.ud-tabs{display:inline-flex;gap:2px;padding:3px;border-radius:10px;background:var(--ud-sub)}
.ud-tab{height:26px;padding:0 11px;border:0;border-radius:8px;background:transparent;color:var(--ud-text2);font:inherit;font-size:12.5px;line-height:26px;cursor:pointer;white-space:nowrap;transition:background .12s,color .12s}
.ud-tab:hover{color:var(--ud-text);background:color-mix(in srgb, var(--ud-hover) 55%, transparent)}
.ud-tab[data-active="true"]{background:var(--ud-card);color:var(--ud-text);box-shadow:0 0 0 1px var(--ud-border)}
.ud-tabs.small{padding:2px}
.ud-tabs.small .ud-tab{height:22px;font-size:11.5px;line-height:22px;padding:0 9px}
.ud-tab[data-disabled='true']{cursor:default;opacity:.35}
.ud-tab[data-disabled='true']:hover{background:transparent;color:var(--ud-text2)}
.ud-tabs .ud-tab svg{display:block}
.ud-refresh{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border-radius:8px;border:1px solid var(--ud-border);background:transparent;color:var(--ud-text2);font:inherit;font-size:12.5px;cursor:pointer;transition:background .12s,color .12s,border-color .12s}
.ud-refresh:hover{background:var(--ud-hover);color:var(--ud-text);border-color:color-mix(in srgb, var(--ud-border) 60%, var(--ud-text2))}
.ud-refresh[data-busy="true"] svg{animation:ud-spin 1s linear infinite}
.ud-refresh:disabled{cursor:default;opacity:.5}
.ud-refresh[data-active="true"]{background:var(--ud-sub);color:var(--ud-text)}
@keyframes ud-spin{to{transform:rotate(360deg)}}
.ud-meta{font-size:11.5px;color:var(--ud-text2)}
.ud-dates{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:0 0 14px;font-size:12.5px;color:var(--ud-text2)}
.ud-dates input{height:30px;padding:0 10px;border-radius:8px;border:1px solid var(--ud-border);background:var(--ud-sub);color:var(--ud-text);font:inherit;font-size:12.5px;color-scheme:light dark}
.ud-banner{display:flex;align-items:center;gap:10px;margin-bottom:14px;padding:10px 12px;border-radius:10px;border:1px solid var(--ud-border);background:var(--ud-card);font-size:12.5px;color:var(--ud-text2)}
.ud-banner[data-kind="error"]{color:var(--ud-error);border-color:color-mix(in srgb, var(--ud-error) 45%, var(--ud-border))}
.ud-banner[data-kind="warn"]{color:var(--ud-text2)}
.ud-banner button{margin-left:auto;height:26px;padding:0 10px;border-radius:7px;border:1px solid currentColor;background:transparent;color:inherit;font:inherit;font-size:12px;cursor:pointer}
.ud-bar{flex:1;height:4px;border-radius:999px;background:var(--ud-sub);overflow:hidden;min-width:60px}
.ud-bar i{display:block;height:100%;border-radius:999px;background:var(--ud-text2);transition:width .3s}
.ud-empty{padding:28px 0;text-align:center;color:var(--ud-text2);font-size:12.5px}
.ud-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:14px}
.ud-card{min-width:0;padding:16px 18px 18px;border-radius:14px;border:1px solid var(--ud-border);background:var(--ud-card);box-shadow:var(--ud-shadow)}
.ud-card-label{font-size:12px;font-weight:400;color:var(--ud-text2)}
.ud-card{display:flex;flex-direction:column}
.ud-card-value{margin-top:6px;font-size:25px;font-weight:600;line-height:1.2;letter-spacing:-.015em;font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ud-card-sub{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 12px;margin-top:10px;padding-top:10px;border-top:1px solid color-mix(in srgb, var(--ud-border) 60%, transparent)}
.ud-sub-item{min-width:0;display:flex;flex-direction:column;gap:2px}
.ud-sub-item span{font-size:10.5px;line-height:14px;color:var(--ud-text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ud-sub-item b{font-size:12.5px;font-weight:500;line-height:16px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ud-meter{margin-top:10px;height:4px;border-radius:999px;background:var(--ud-sub);overflow:hidden}
.ud-meter i{display:block;height:100%;border-radius:999px;background:var(--ud-text2);opacity:.75}
.ud-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px 16px;margin-bottom:14px;padding:10px 16px;border-radius:12px;border:1px solid var(--ud-border);background:color-mix(in srgb, var(--ud-card) 55%, transparent)}
.ud-strip-group{min-width:0;display:flex;flex-direction:column;gap:2px}
.ud-strip-group span{font-size:10.5px;line-height:14px;color:var(--ud-text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ud-strip-group b{font-size:12.5px;font-weight:500;line-height:16px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ud-filterbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:14px}
.ud-filter{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 4px 0 10px;border-radius:8px;background:var(--ud-sub);border:1px solid var(--ud-border);color:var(--ud-text);font-size:12px}
.ud-filter b{font-weight:400;color:var(--ud-text2)}
.ud-filter button{height:18px;width:18px;border:0;border-radius:6px;background:transparent;color:var(--ud-text2);font:inherit;font-size:13px;line-height:1;cursor:pointer}
.ud-filter button:hover{background:var(--ud-hover);color:var(--ud-text)}
.ud-filter-clear{height:26px;padding:0 10px;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--ud-text2);font:inherit;font-size:12px;cursor:pointer}
.ud-filter-clear:hover{color:var(--ud-text);border-color:var(--ud-border)}
.ud-trend-grid{display:grid;grid-template-columns:minmax(0,1.85fr) minmax(0,1fr);gap:14px;margin-bottom:14px}
.ud-section{min-width:0;padding:20px;border-radius:14px;border:1px solid var(--ud-border);background:var(--ud-card);box-shadow:var(--ud-shadow);display:flex;flex-direction:column}
.ud-section-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;margin-bottom:14px}
.ud-speedbar{display:flex;align-items:center;justify-content:flex-start;margin:-6px 0 10px 46px}
.ud-section-title{font-size:13.5px;font-weight:500;letter-spacing:-.005em}
.ud-section-note{font-size:11.5px;color:var(--ud-text2)}
.ud-chart{display:flex;flex-direction:column;flex:1 1 auto;min-height:0}
.ud-chart-scroll{flex:1 1 auto;min-height:160px;overflow-x:auto;overflow-y:hidden;margin:0 -2px;padding:2px}
.ud-chart-inner{display:flex;flex-direction:column;height:100%}
.ud-plot{position:relative;flex:1 1 150px;height:150px;min-height:120px;padding-left:46px}
.ud-yaxis{position:absolute;left:0;top:0;bottom:0;width:42px;font-size:10px;color:var(--ud-text2);font-variant-numeric:tabular-nums}
.ud-yaxis span{position:absolute;right:3px;white-space:nowrap}
.ud-gridlines{position:absolute;left:46px;right:0;top:0;bottom:0;pointer-events:none}
.ud-gridlines i{position:absolute;left:0;right:0;border-top:1px solid var(--ud-grid)}
.ud-bars{position:relative;display:flex;align-items:flex-end;gap:4px;height:100%}
.ud-barbox{flex:1 0 0;min-width:6px;height:100%;display:flex;align-items:flex-end;justify-content:center;border-radius:4px;transition:background .12s}
.ud-barbox:hover{background:color-mix(in srgb, var(--ud-hover) 45%, transparent)}
.ud-barcol{width:20px;max-width:100%;min-width:3px;display:flex;flex-direction:column-reverse;gap:1px;border-radius:2px 2px 0 0;overflow:hidden}
.ud-groupbars{display:flex;align-items:flex-end;justify-content:center;gap:3px;width:auto;max-width:100%;height:100%}
.ud-groupslot{flex:0 0 20px;width:20px;height:100%;display:flex;align-items:flex-end;justify-content:center}
.ud-groupbar{width:100%;border-radius:2px 2px 0 0;min-height:1px;transition:opacity .12s}
.ud-lines{position:relative;height:100%}
.ud-lines svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.ud-line-dot{position:absolute;width:6px;height:6px;border-radius:50%;transform:translate(-50%,-50%);pointer-events:none}
.ud-line-hover{position:absolute;inset:0;display:flex}
.ud-line-hover i{flex:1 1 0;height:100%}
.ud-seg{width:100%;min-height:1px;transition:opacity .12s}
.ud-axis{display:flex;gap:3px;margin-top:8px;padding-left:46px}
.ud-axis span{flex:1 0 0;min-width:6px;font-size:10px;line-height:14px;color:var(--ud-text2);text-align:center;white-space:nowrap;overflow:visible}
.ud-legendrow{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
.ud-chip{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 9px;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--ud-text2);font:inherit;font-size:11.5px;cursor:pointer;transition:background .12s,color .12s,border-color .12s}
.ud-chip:hover{background:var(--ud-hover);color:var(--ud-text)}
.ud-chip[data-active="true"]{background:var(--ud-sub);border-color:var(--ud-border);color:var(--ud-text)}
.ud-chip[data-hover="true"]{background:var(--ud-hover);color:var(--ud-text)}
.ud-chip i{width:7px;height:7px;border-radius:50%;flex:none;display:inline-block}
.ud-chip[data-dim="true"]{opacity:.45}
.ud-share-wrap{display:flex;flex-wrap:wrap;align-items:center;gap:16px}
.ud-donut{position:relative;width:104px;height:104px;flex:none}
.ud-donut svg{display:block;width:100%;height:100%}
.ud-donut-hole{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;line-height:1.2;pointer-events:none}
.ud-donut-hole b{font-size:14px;font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.ud-donut-hole span{font-size:10px;color:var(--ud-text2);margin-top:2px}
.ud-modelrows{display:flex;flex-direction:column;gap:2px;flex:1;min-width:150px}
.ud-modelrow{display:flex;align-items:center;gap:9px;width:100%;padding:7px 8px;border:1px solid transparent;border-radius:9px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;transition:background .12s,border-color .12s}
.ud-modelrow:hover{background:var(--ud-hover)}
.ud-modelrow[data-active="true"]{background:var(--ud-sub);border-color:var(--ud-border)}
.ud-modelrow .dot{width:8px;height:8px;border-radius:50%;flex:none}
.ud-modelrow .name{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.ud-modelrow .name b{font-weight:500;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ud-modelrow .name span{font-size:11px;color:var(--ud-text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ud-modelrow .pct{font-size:12.5px;font-weight:500;font-variant-numeric:tabular-nums;white-space:nowrap}
.ud-eff{margin-top:12px;padding-top:12px;border-top:1px solid var(--ud-border)}
.ud-eff-head{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:11.5px;color:var(--ud-text2)}
.ud-eff-head>span:first-child{color:var(--ud-text);font-size:12px;font-weight:500}
.ud-eff-scope{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:62%}
.ud-eff-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:10px}
.ud-eff-item{min-width:0;display:flex;flex-direction:column;gap:3px}
.ud-eff-item span{font-size:10.5px;color:var(--ud-text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ud-eff-item b{font-size:13.5px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ud-heat{display:flex;gap:12px;align-items:flex-start;margin-top:2px}
.ud-weekdays{display:grid;grid-template-rows:repeat(7,16px);gap:4px;padding-top:20px;width:24px;flex:none}
.ud-weekdays span{font-size:9.5px;line-height:16px;color:var(--ud-text2);text-align:right}
.ud-heat-scroll{flex:1;min-width:0;overflow-x:auto;padding-bottom:2px}
.ud-months{position:relative;height:16px;margin-bottom:4px}
.ud-months span{position:absolute;top:0;font-size:10.5px;color:var(--ud-text2);white-space:nowrap}
.ud-grid{display:grid;grid-auto-flow:column;grid-template-rows:repeat(7,16px);grid-auto-columns:16px;gap:4px;width:max-content}
.ud-cell{width:16px;height:16px;border-radius:3px;background:var(--ud-sub)}
.ud-cell[data-day="true"]{cursor:pointer}
.ud-cell[data-day="true"]:hover{outline:1px solid var(--ud-text2);outline-offset:1px}
.ud-cell.is-unknown{background:transparent;box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--ud-border) 80%, transparent);opacity:.7}
.ud-cell.is-out{opacity:.32}
.ud-cell.is-selected{outline:2px solid var(--ud-text);outline-offset:1px}
.ud-cell.is-today{box-shadow:inset 0 0 0 1px var(--ud-text2)}
.ud-tip{position:fixed;z-index:60;width:212px;padding:10px 12px;border-radius:10px;border:1px solid var(--ud-border);background:var(--ud-card);box-shadow:0 10px 30px rgba(3,7,18,.45);color:var(--ud-text);font-size:11.5px;pointer-events:none}
.ud-tip-head{font-size:11.5px;color:var(--ud-text2);margin-bottom:6px}
.ud-tip-row{display:flex;justify-content:space-between;gap:12px;line-height:1.7}
.ud-tip-row span{color:var(--ud-text2)}
.ud-tip-row b{font-weight:500;font-variant-numeric:tabular-nums}
.ud-tip-note{margin-top:6px;padding-top:6px;border-top:1px solid var(--ud-border);font-size:10.5px;color:var(--ud-text2);line-height:1.5}
.ud-legend{display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--ud-text2)}
.ud-legend .ud-cell{width:12px;height:12px}
.ud-table-wrap{overflow-x:auto}
.ud-table{width:100%;border-collapse:collapse;font-size:12.5px;font-variant-numeric:tabular-nums}
.ud-table th{padding:7px 10px;border-bottom:1px solid var(--ud-border);font-size:11px;font-weight:400;letter-spacing:.02em;text-align:right;color:var(--ud-text2);white-space:nowrap}
.ud-table td{padding:8px 10px;border-bottom:1px solid color-mix(in srgb, var(--ud-border) 55%, transparent);text-align:right;white-space:nowrap;color:var(--ud-text)}
.ud-table th:first-child,.ud-table td:first-child{text-align:left}
.ud-table tr:last-child td{border-bottom:0}
.ud-table tbody tr{transition:background .1s}
.ud-table tbody tr:hover{background:color-mix(in srgb, var(--ud-hover) 55%, transparent)}
.ud-session{display:inline-block;max-width:190px;overflow:hidden;text-overflow:ellipsis;vertical-align:bottom;text-align:left}
.ud-modelcell{display:inline-block;max-width:170px;overflow:hidden;text-overflow:ellipsis;vertical-align:bottom}
.ud-tag{display:inline-flex;align-items:center;gap:5px;padding:0 8px;height:21px;border-radius:6px;font-size:11px;background:color-mix(in srgb, var(--ud-success) 12%, transparent);color:var(--ud-success)}
.ud-tag::before{content:'';width:5px;height:5px;border-radius:50%;background:currentColor}
.ud-tag.error{background:color-mix(in srgb, var(--ud-error) 12%, transparent);color:var(--ud-error)}
.ud-tag.neutral{background:var(--ud-sub);color:var(--ud-text2)}
.ud-msg{display:inline-block;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:bottom;text-align:left;color:var(--ud-text2)}
.ud-search{height:30px;padding:0 12px;border-radius:8px;border:1px solid var(--ud-border);background:var(--ud-sub);color:var(--ud-text);font:inherit;font-size:12px;width:210px;max-width:52vw;outline:none;transition:border-color .12s,background .12s}
.ud-search::placeholder{color:var(--ud-text2)}
.ud-search:focus{border-color:var(--ud-accent);background:var(--ud-card)}
.ud-search-hidden{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 4px 0 12px;border-radius:8px;border:1px dashed var(--ud-border);background:var(--ud-sub);color:var(--ud-text2);font-size:12px;white-space:nowrap}
.ud-search-hidden button{height:20px;width:20px;border:0;border-radius:6px;background:transparent;color:var(--ud-text2);font:inherit;font-size:14px;line-height:1;cursor:pointer}
.ud-search-hidden button:hover{background:var(--ud-hover);color:var(--ud-text)}
.ud-pager{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding-top:12px;font-size:11.5px;color:var(--ud-text2)}
.ud-pager button{height:26px;padding:0 11px;border-radius:8px;border:1px solid var(--ud-border);background:transparent;color:var(--ud-text2);font:inherit;font-size:11.5px;cursor:pointer;transition:background .12s,color .12s}
.ud-pager button:hover:not(:disabled){background:var(--ud-hover);color:var(--ud-text)}
.ud-pager button:disabled{opacity:.4;cursor:default}
.ud-cmp{display:flex;flex-direction:column;gap:6px;padding:2px 0 4px}
.ud-cmp-axis{display:grid;grid-template-columns:170px minmax(0,1fr) 84px;gap:10px;align-items:center;font-size:10.5px;color:var(--ud-text2)}
.ud-cmp-axis .ud-cmp-ticks{display:flex;justify-content:space-between}
.ud-cmp-row{display:grid;grid-template-columns:170px minmax(0,1fr) 84px;gap:10px;align-items:center;padding:7px 6px;border:1px solid transparent;border-radius:8px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;transition:background .12s,border-color .12s,opacity .12s}
.ud-cmp-row:hover{background:var(--ud-hover)}
.ud-cmp-row[data-active="true"]{background:var(--ud-sub);border-color:var(--ud-border)}
.ud-cmp-label{display:flex;align-items:center;gap:7px;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ud-cmp-label i{width:8px;height:8px;border-radius:50%;flex:none}
.ud-cmp-name{overflow:hidden;text-overflow:ellipsis}
.ud-cmp-samples{font-size:10.5px;color:var(--ud-text2);flex:none}
.ud-cmp-warn{font-size:10px;color:var(--ud-warn, var(--ud-text2));border:1px solid var(--ud-border);border-radius:5px;padding:0 4px;flex:none}
.ud-cmp-track{position:relative;height:16px;border-radius:8px;background:var(--ud-sub)}
.ud-cmp-range{position:absolute;top:50%;height:4px;border-radius:2px;transform:translateY(-50%)}
.ud-cmp-dot{position:absolute;top:50%;width:9px;height:9px;border-radius:50%;transform:translate(-50%,-50%);box-shadow:0 0 0 2px var(--ud-card)}
.ud-cmp-value{text-align:right;font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap}
.ud-colmenu{position:relative;font-size:11.5px;color:var(--ud-text2)}
.ud-colmenu summary{list-style:none;cursor:pointer;height:28px;line-height:26px;padding:0 10px;border-radius:8px;border:1px solid var(--ud-border);background:transparent}
.ud-colmenu summary::-webkit-details-marker{display:none}
.ud-colmenu[open] summary{background:var(--ud-sub);color:var(--ud-text)}
.ud-colmenu label{position:absolute;right:0;top:32px;z-index:5;display:flex;align-items:center;gap:6px;padding:8px 10px;border-radius:8px;border:1px solid var(--ud-border);background:var(--ud-card);box-shadow:0 8px 24px rgba(0,0,0,.3);white-space:nowrap}
.ud-footer{font-size:11.5px;line-height:1.8;color:var(--ud-text2);padding-top:4px}
.ud-footer code{padding:1px 5px;border-radius:5px;background:var(--ud-sub);font-size:10.5px}
.ud-page :focus-visible{outline:2px solid var(--ud-accent);outline-offset:2px}
@media (width <= 980px){.ud-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (width <= 900px){.ud-trend-grid{grid-template-columns:minmax(0,1fr)}}
@media (width <= 560px){.ud-head{padding-top:18px}.ud-kpis{grid-template-columns:minmax(0,1fr)}.ud-card-value{font-size:23px}.ud-content{padding:0 16px 48px}}

`

    function localStart(moment) {
      const date = new Date(moment)
      date.setHours(0, 0, 0, 0)
      return date.getTime()
    }

    function parseDateText(text) {
      const parts = String(text || '').split('-').map(Number)
      if (parts.length !== 3 || parts.some((value) => !Number.isFinite(value))) return null
      return new Date(parts[0], parts[1] - 1, parts[2]).getTime()
    }

    function isoDate(moment) {
      const date = new Date(moment)
      return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0')
    }

    function boundsOf(range, custom, now) {
      const moment = now || Date.now()
      const today = localStart(moment)
      if (range === 'today') return [today, moment]
      if (range === '7d') return [today - 6 * DAY, moment]
      if (range === '30d') return [today - 29 * DAY, moment]
      if (range === 'all') return [0, moment]
      const from = parseDateText(custom.from)
      const to = parseDateText(custom.to)
      if (from === null || to === null) return [today - 6 * DAY, moment]
      return [Math.min(from, to), Math.max(from, to) + DAY - 1]
    }

    function pad(value) {
      return String(value).padStart(2, '0')
    }

    function fmtInt(value) {
      return Math.round(Number(value) || 0).toLocaleString('en-US')
    }

    function fmtCompact(value) {
      const number = Number(value) || 0
      if (number >= 1e9) return (number / 1e9).toFixed(2).replace(/\.?0+$/, '') + 'B'
      if (number >= 1e6) return (number / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M'
      if (number >= 1e4) return (number / 1e3).toFixed(1).replace(/\.0$/, '') + 'K'
      return fmtInt(number)
    }

    function fmtPercent(value) {
      if (value === null || value === undefined || !Number.isFinite(value)) return '—'
      const percent = value * 100
      const digits = percent >= 99.9 && percent < 100 ? 2 : 1
      return percent.toFixed(digits) + '%'
    }

    function fmtDuration(value) {
      const total = Math.max(0, Math.round((Number(value) || 0) / 1000))
      const hours = Math.floor(total / 3600)
      const minutes = Math.floor((total % 3600) / 60)
      const seconds = total % 60
      if (hours > 0) return hours + 'h ' + minutes + 'm'
      if (minutes > 0) return minutes + 'm ' + seconds + 's'
      return seconds + 's'
    }

    function fmtMs(value) {
      if (value === null || value === undefined || !Number.isFinite(value)) return '—'
      const ms = Math.max(0, Number(value))
      if (ms < 1000) return Math.round(ms) + 'ms'
      if (ms < 60_000) return (ms / 1000).toFixed(1) + 's'
      return Math.floor(ms / 60_000) + 'm' + pad(Math.round((ms % 60_000) / 1000)) + 's'
    }

    function fmtMoney(value, symbol) {
      if (value === null || value === undefined || !Number.isFinite(value)) return '—'
      if (value === 0) return symbol + '0'
      if (value < 0.01) return '<' + symbol + '0.01'
      if (value >= 1000) return symbol + Math.round(value).toLocaleString('en-US')
      return symbol + value.toFixed(2)
    }

    function fmtAxis(value, metric, symbol) {
      if (metric === 'speed') return fmtSpeed(value)
      if (metric === 'cost') return value >= 1000 ? symbol + (value / 1000).toFixed(1) + 'K' : symbol + Math.round(value)
      if (metric === 'time') return fmtDuration(value)
      return fmtCompact(value)
    }

    function fmtClock(moment) {
      return new Date(moment).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    }

    function fmtBucketRange(t, granularity) {
      const start = new Date(t)
      if (granularity === 'quarter' || granularity === 'hour') {
        const span = granularity === 'quarter' ? 15 * 60_000 : 3_600_000
        const end = new Date(t + span)
        const label = (date) => pad(date.getHours()) + ':' + pad(date.getMinutes())
        return label(start) + '–' + label(end)
      }
      if (granularity === 'week') {
        const end = new Date(t + 6 * DAY)
        return new Date(t).toISOString().slice(0, 10) + ' – ' + end.toISOString().slice(0, 10)
      }
      if (granularity === 'month') {
        return new Date(t).getFullYear() + '-' + pad(new Date(t).getMonth() + 1)
      }
      return new Date(t).toISOString().slice(0, 10)
    }

    function fmtPoint(t, granularity) {
      const date = new Date(t)
      if (granularity === 'quarter') return pad(date.getHours()) + ':' + pad(date.getMinutes())
      if (granularity === 'hour') return pad(date.getHours()) + ':00'
      if (granularity === 'month') return date.getFullYear() + '-' + pad(date.getMonth() + 1)
      return pad(date.getMonth() + 1) + '-' + pad(date.getDate())
    }

    function fmtWhen(t) {
      const date = new Date(t)
      return pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
    }

    // Heat scale: neutral greys matching the Harness dark surface family.
    const HEAT_COLORS = ['#49494E', '#69696F', '#96969D', '#C7C7CE']
    function cacheColor(level) {
      if (level === 0) return '#303033'
      return HEAT_COLORS[Math.min(HEAT_COLORS.length - 1, Math.max(0, level - 1))]
    }

    function MetricTabs(props) {
      return h(
        'div',
        { className: 'ud-tabs small', role: 'group', 'aria-label': props.label },
        props.options.map((option) =>
          h(
            'button',
            {
              key: option.value,
              type: 'button',
              className: 'ud-tab',
              'data-active': String(props.value === option.value),
              'aria-pressed': props.value === option.value,
              onClick: () => props.onChange(option.value),
            },
            option.label,
          ),
        ),
      )
    }

    function ChartModeTabs(props) {
      const disabled = props.disabled === true
      const button = (value, label, icon) =>
        h(
          'button',
          {
            type: 'button',
            className: 'ud-tab',
            'data-active': String(props.value === value),
            'data-disabled': String(disabled),
            'aria-pressed': props.value === value,
            'aria-disabled': disabled,
            'aria-label': label,
            title: disabled ? props.disabledTitle : label,
            onClick: disabled ? undefined : () => props.onChange(value),
          },
          icon,
        )
      return h(
        'div',
        { className: 'ud-tabs small', role: 'group', 'aria-label': props.label },
        button(
          'bar',
          props.barLabel,
          h(
            'svg',
            { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'currentColor', 'aria-hidden': 'true' },
            h('rect', { x: 2, y: 8, width: 3, height: 6, rx: 1 }),
            h('rect', { x: 6.5, y: 5, width: 3, height: 9, rx: 1 }),
            h('rect', { x: 11, y: 2, width: 3, height: 12, rx: 1 }),
          ),
        ),
        button(
          'line',
          props.lineLabel,
          h(
            'svg',
            { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, 'aria-hidden': 'true' },
            h('path', { d: 'M2 11.5 6 7l3.2 2.2L14 3.5', strokeLinecap: 'round', strokeLinejoin: 'round' }),
            h('circle', { cx: 2, cy: 11.5, r: 1.4, fill: 'currentColor', stroke: 'none' }),
            h('circle', { cx: 14, cy: 3.5, r: 1.4, fill: 'currentColor', stroke: 'none' }),
          ),
        ),
      )
    }

    function StatCard(props) {
      return h(
        'div',
        { className: 'ud-card' },
        h('div', { className: 'ud-card-label' }, props.label),
        h('div', { className: 'ud-card-value', title: props.title || props.value }, props.value),
        props.items && props.items.length > 0
          ? h(
              'div',
              { className: 'ud-card-sub' },
              props.items.map((item) =>
                h(
                  'div',
                  { key: item.label, className: 'ud-sub-item', title: item.title || '' },
                  h('span', null, item.label),
                  h('b', null, item.value),
                ),
              ),
            )
          : null,
        props.meter !== undefined && props.meter !== null
          ? h('div', { className: 'ud-meter' }, h('i', { style: { width: Math.max(0, Math.min(100, props.meter * 100)) + '%' } }))
          : null,
      )
    }

    function bucketValue(bucket, key, metric) {
      const row = bucket && bucket.m ? bucket.m[key] : undefined
      if (row === undefined) return 0
      if (metric === 'requests') return Number(row.requests) || 0
      if (metric === 'cost') return Number(row.cost) || 0
      if (metric === 'time') return Number(row.llmMs) || 0
      return Number(row.tokens) || 0
    }

    function billingTip(row, symbol, t) {
      const billing = row.billing || {}
      if (!row.priced || !billing.prices) {
        const reason = billing.reason ? t('billing.reason.' + billing.reason) : ''
        return t('billing.unconfirmed') + (reason ? ' · ' + reason : '')
      }
      const prices = billing.prices
      const source = billing.source === 'official' ? t('billing.official') : t('billing.assumed')
      const lines = [
        t('billing.tier') + ': ' + (billing.tier === 'peak' ? t('billing.peak') : t('billing.offPeak')),
        t('billing.miss') + ': ' + fmtInt(row.input) + ' × ' + symbol + prices.miss + t('billing.perMillion'),
        t('billing.hit') + ': ' + fmtInt(row.cacheRead) + ' × ' + symbol + prices.hit + t('billing.perMillion'),
      ]
      if (row.cacheWrite > 0) {
        lines.push(t('billing.write') + ': ' + fmtInt(row.cacheWrite) + ' × ' + symbol + prices.write + t('billing.perMillion'))
      }
      lines.push(t('billing.output') + ': ' + fmtInt(row.output) + ' × ' + symbol + prices.output + t('billing.perMillion'))
      lines.push(t('billing.total') + ': ' + fmtMoney(row.cost, symbol))
      lines.push(
        t('billing.book') + ': ' + (billing.book || '—') + ' · ' + source +
        (billing.effectiveFrom ? ' · ' + billing.effectiveFrom : '') +
        (billing.verifiedAt ? ' · ' + t('billing.checkedAt') + ' ' + billing.verifiedAt : ''),
      )
      return lines.join('\n')
    }

    function fmtSpeed(value) {
      if (value === null || value === undefined || !Number.isFinite(value)) return '—'
      return (value >= 100 ? value.toFixed(0) : value.toFixed(1)) + ' t/s'
    }

    function fmtMetric(value, metric, symbol) {
      if (metric === 'cost') return fmtMoney(value, symbol)
      if (metric === 'time') return fmtDuration(value)
      if (metric === 'requests') return fmtInt(value)
      return fmtCompact(value) + ' tokens'
    }

    function TrendChart(props) {
      const { trend, models, metric, filter, hover, chartMode, symbol, t, maskModel } = props
      const [tip, setTip] = useState(null)
      const [hoverPoint, setHoverPoint] = useState(null)
      const speed = metric === 'speed'
      const lineMode = chartMode === 'line' || (speed && filter === null)
      // 模型耗时 uses the same stacked-column visual as Token/请求/费用 when
      // multiple models are active (per-model bars would not fit the sidebar);
      // grouped bars only appear for a single filtered model (or few models).
      const groupedMode = !lineMode && !speed && metric === 'time' && filter !== null
      // Speed bars: only when a single model is filtered (one bar per bucket
      // fits); multi-model speed is line-only so the sidebar never scrolls.
      const speedBars = !lineMode && speed && filter !== null
      const granularity = trend.granularity
      const buckets = trend.buckets
      const keys = models.map((row) => row.key)
      const nameByKey = new Map(models.map((row) => [row.key, row.model]))
      const colorOf = (key) => modelColor(nameByKey.get(key) || key)
      const nameOf = (key) => {
        const row = models.find((item) => item.key === key)
        return row === undefined ? key : maskModel(row.model)
      }
      const focus = filter !== null ? filter : hover

      const totals = new Map()
      if (!speed) {
        for (const bucket of buckets) {
          for (const key of keys) {
            totals.set(key, (totals.get(key) || 0) + bucketValue(bucket, key, metric))
          }
        }
      }

      const values = buckets.map((bucket) => {
        const parts = []
        for (const key of keys) {
          if (filter !== null && key !== filter) continue
          if (speed) {
            const row = bucket.m ? bucket.m[key] : undefined
            if (row === undefined || row.speedP50 === undefined || row.speedP50 === null) continue
            parts.push({ key, value: row.speedP50, samples: row.speedSamples || 0 })
          } else if (lineMode) {
            if ((totals.get(key) || 0) <= 0) continue
            parts.push({ key, value: bucketValue(bucket, key, metric) })
          } else {
            const value = bucketValue(bucket, key, metric)
            if (value > 0) parts.push({ key, value })
          }
        }
        parts.sort((a, b) => b.value - a.value)
        const total = parts.reduce((sum, part) => sum + part.value, 0)
        const samples = parts.reduce((sum, part) => sum + (part.samples || 0), 0)
        return { bucket, parts, total, samples }
      })

      const max = lineMode || groupedMode || speedBars
        ? Math.max(0, ...values.reduce((list, item) => list.concat(item.parts.map((part) => part.value)), []))
        : Math.max(0, ...values.map((item) => item.total))
      if (max <= 0) {
        return h('div', { className: 'ud-empty' }, t(speed ? 'trend.speedEmpty' : 'trend.empty'))
      }

      const showTip = (event, head, rows, note) => {
        const rect = event.currentTarget.getBoundingClientRect()
        const x = typeof event.clientX === 'number' && event.clientX > 0 ? event.clientX : rect.left + rect.width / 2
        const y = typeof event.clientY === 'number' && event.clientY > 0 ? event.clientY : rect.top + 12
        setTip({ x, y, head, rows, note })
      }

      const every = Math.max(1, Math.ceil(values.length / 7))
      // Day buckets wider than ~2 weeks get sparser labels so a 30-day range
      // renders without a horizontal scrollbar (30 buckets ≈ every 2 days).
      const every2 =
        granularity === 'day' && values.length > 16
          ? Math.max(every, Math.ceil(values.length / 15))
          : every
      // Grouped metrics (模型耗时 / 速度): every model mini-bar is a fixed 20px
      // wide — the same thickness as a stacked column — plus a 3px gap,
      // regardless of how many models are active. The chart scrolls
      // horizontally when the whole group exceeds the panel width (user
      // preference: match per-bar thickness, not total group width).
      const modelCount =
        groupedMode || speedBars
          ? Math.max(
              1,
              (filter !== null ? [filter] : keys).filter((key) =>
                values.some((item) => item.parts.some((part) => part.key === key)),
              ).length,
            )
          : 1
      const barUnit = lineMode ? 9 : groupedMode || speedBars ? 23 * modelCount : 11
      const innerWidth = Math.max(values.length * barUnit, 100)
      const viewport = typeof window !== 'undefined' && window.innerWidth ? window.innerWidth : 1280
      const n = values.length
      const scale = max * 1.06
      const timeUnit = max >= 3_600_000 ? 'h' : max >= 60_000 ? 'm' : 's'
      const fmtYAxis = (value) => {
        if (speed) return fmtSpeed(value)
        if (metric === 'cost') return value >= 1000 ? symbol + (value / 1000).toFixed(1) + 'K' : symbol + Math.round(value)
        if (metric === 'time') {
          if (timeUnit === 'h') return (value / 3_600_000).toFixed(1) + 'h'
          if (timeUnit === 'm') return (value / 60_000).toFixed(1) + 'm'
          return Math.round(value / 1000) + 's'
        }
        return fmtCompact(value)
      }

      const tipRowsFor = (item) => {
        const head = fmtBucketRange(item.bucket.t, granularity)
        let rows
        if (speed) {
          rows = item.parts.map((part) => [nameOf(part.key) + ' · n=' + part.samples, fmtSpeed(part.value)])
          if (item.parts.length === 0) rows = [[t('trend.speedGap'), '']]
        } else {
          rows = item.parts.map((part) => [nameOf(part.key), fmtMetric(part.value, metric, symbol)])
          if (item.parts.length > 1) rows.push([t('share.total'), fmtMetric(item.total, metric, symbol)])
        }
        return { head, rows, note: speed ? t('trend.speedP50Note') : null }
      }

      let chartBody
      if (lineMode) {
        const segments = []
        if (speed) {
          for (const key of keys) {
            if (filter !== null && key !== filter) continue
            const points = []
            values.forEach((item, index) => {
              const part = item.parts.find((entry) => entry.key === key)
              if (part !== undefined) points.push({ index, value: part.value, samples: part.samples })
            })
            for (let i = 0; i < points.length; i += 1) {
              if (i === 0) {
                segments.push({ key, solid: true, points: [points[i]] })
                continue
              }
              const prev = points[i - 1]
              const current = points[i]
              const solid = current.index === prev.index + 1
              segments.push({ key, solid, points: [prev, current] })
            }
          }
        } else {
          for (const key of keys) {
            if (filter !== null && key !== filter) continue
            if ((totals.get(key) || 0) <= 0) continue
            segments.push({
              key,
              solid: true,
              points: values.map((item, index) => {
                const part = item.parts.find((entry) => entry.key === key)
                return { index, value: part === undefined ? 0 : part.value, samples: 0 }
              }),
            })
          }
        }
        const toXY = (point) => ({
          x: ((point.index + 0.5) / n) * 100,
          y: 100 - (point.value / scale) * 100,
          ...point,
        })
        const lines = segments.map((segment, index) => {
          const xy = segment.points.map(toXY)
          return h('polyline', {
            key: segment.key + '-' + index,
            points: xy.map((point) => point.x.toFixed(2) + ',' + point.y.toFixed(2)).join(' '),
            fill: 'none',
            stroke: colorOf(segment.key),
            strokeWidth: speed ? 1.6 : 2,
            strokeLinejoin: 'round',
            strokeLinecap: segment.solid ? 'round' : 'butt',
            strokeDasharray: segment.solid ? undefined : '6 6',
            vectorEffect: 'non-scaling-stroke',
            opacity: focus !== null && segment.key !== focus ? 0.22 : segment.solid ? 1 : 0.6,
          })
        })
        const dots = []
        const seen = new Set()
        for (const segment of segments) {
          for (const point of segment.points) {
            const dotKey = segment.key + '-' + point.index
            if (seen.has(dotKey)) continue
            seen.add(dotKey)
            const xy = toXY(point)
            dots.push(
              h('span', {
                key: dotKey,
                className: 'ud-line-dot',
                style: {
                  left: xy.x + '%',
                  top: xy.y + '%',
                  width: hoverPoint === point.index ? '10px' : '6px',
                  height: hoverPoint === point.index ? '10px' : '6px',
                  background: colorOf(segment.key),
                  opacity: focus !== null && segment.key !== focus ? 0.22 : 1,
                },
              }),
            )
          }
        }
        const hoverCells = values.map((item, index) => {
          const data = tipRowsFor(item)
          return h('i', {
            key: item.bucket.t,
            'aria-label': data.head + '，' + data.rows.map((row) => row[0] + ' ' + row[1]).join('，'),
            onMouseEnter: (event) => {
              setHoverPoint(index)
              showTip(event, data.head, data.rows, data.note)
            },
            onMouseLeave: () => {
              setHoverPoint(null)
              setTip(null)
            },
          })
        })
        chartBody = h(
          'div',
          { className: 'ud-lines' },
          h('svg', { viewBox: '0 0 100 100', preserveAspectRatio: 'none', 'aria-hidden': 'true' }, lines),
          dots,
          h('div', { className: 'ud-line-hover' }, hoverCells),
        )
      } else {
        const bars = values.map((item) => {
          const data = tipRowsFor(item)
          const hasData = item.parts.length > 0
          return h(
            'div',
            {
              key: item.bucket.t,
              className: 'ud-barbox',
              'aria-label': data.head + '，' + data.rows.map((row) => row[0] + ' ' + row[1]).join('，'),
              onMouseEnter: hasData ? (event) => showTip(event, data.head, data.rows, data.note) : undefined,
              onMouseLeave: hasData ? () => setTip(null) : undefined,
            },
            !hasData
              ? null
              : groupedMode || speedBars
                ? h(
                    'div',
                    { className: 'ud-groupbars' },
                    filter === null
                      ? keys.map((key) => {
                          const part = item.parts.find((entry) => entry.key === key)
                          return h(
                            'div',
                            { key, className: 'ud-groupslot' },
                            part === undefined
                              ? null
                              : h('div', {
                                  className: 'ud-groupbar',
                                  style: {
                                    height: (part.value / max) * 100 + '%',
                                    background: colorOf(part.key),
                                    opacity: focus !== null && part.key !== focus ? 0.22 : 1,
                                  },
                                }),
                          )
                        })
                      : item.parts.map((part) =>
                          h(
                            'div',
                            { key: part.key, className: 'ud-groupslot' },
                            h('div', {
                              className: 'ud-groupbar',
                              style: {
                                height: (part.value / max) * 100 + '%',
                                background: colorOf(part.key),
                              },
                            }),
                          ),
                        ),
                  )
                : h(
                    'div',
                    { className: 'ud-barcol', style: { height: (item.total / max) * 100 + '%' } },
                    item.parts.map((part) =>
                      h('div', {
                        key: part.key,
                        className: 'ud-seg',
                        style: {
                          flexGrow: part.value,
                          background: colorOf(part.key),
                          opacity: focus !== null && part.key !== focus ? 0.22 : 1,
                        },
                      }),
                    ),
                  ),
          )
        })
        chartBody = h('div', { className: 'ud-bars' }, bars)
      }

      const axis = values.map((item, index) =>
        h('span', { key: item.bucket.t }, index % every2 === 0 ? fmtPoint(item.bucket.t, granularity) : ''),
      )
      return h(
        'div',
        { className: 'ud-chart' },
        h(
          'div',
          { className: 'ud-chart-scroll' },
          h(
            'div',
            { className: 'ud-chart-inner', style: { minWidth: innerWidth + 'px' } },
            h(
              'div',
              { className: 'ud-plot' },
              h(
                'div',
                { className: 'ud-yaxis' },
                h('span', { style: { top: 0 } }, fmtYAxis(max)),
                h('span', { style: { top: '50%', transform: 'translateY(-50%)' } }, fmtYAxis(max / 2)),
                h('span', { style: { bottom: 0 } }, speed ? '0 t/s' : '0'),
              ),
              h(
                'div',
                { className: 'ud-gridlines' },
                [0, 25, 50, 75, 100].map((top) => h('i', { key: top, style: { top: top + '%' } })),
              ),
              chartBody,
            ),
            h('div', { className: 'ud-axis' }, axis),
          ),
        ),
        h(
          'div',
          { className: 'ud-legendrow' },
          h(
            'button',
            {
              type: 'button',
              className: 'ud-chip',
              'data-active': String(filter === null),
              onClick: () => props.onFilter(null),
              onMouseEnter: () => props.onHover(null),
            },
            t('trend.all'),
          ),
          models.map((row) =>
            h(
              'button',
              {
                key: row.key,
                type: 'button',
                className: 'ud-chip',
                'data-active': String(filter === row.key),
                'data-hover': String(hover === row.key),
                'data-dim': String(filter !== null ? filter !== row.key : hover !== null && hover !== row.key),
                onClick: () => props.onFilter(filter === row.key ? null : row.key),
                onMouseEnter: () => props.onHover(row.key),
                onMouseLeave: () => props.onHover(null),
                onFocus: () => props.onHover(row.key),
                onBlur: () => props.onHover(null),
              },
              h('i', { style: { background: colorOf(row.key) } }),
              maskModel(row.model),
            ),
          ),
        ),
        tip === null
          ? null
          : h(
              'div',
              {
                className: 'ud-tip',
                style: {
                  left: Math.min(Math.max(8, tip.x - 106), Math.max(8, viewport - 228)) + 'px',
                  top: Math.max(8, tip.y - 14) + 'px',
                },
              },
              h('div', { className: 'ud-tip-head' }, tip.head),
              tip.rows.map((row, index) =>
                h('div', { key: index, className: 'ud-tip-row' }, h('span', null, row[0]), h('b', null, row[1])),
              ),
              tip.note ? h('div', { className: 'ud-tip-note' }, tip.note) : null,
            ),
      )
    }

    function SharePanel(props) {
      const { models, metric, filter, hover, symbol, totals, t, maskModel, maskAccount } = props
      if (models.length === 0) return h('div', { className: 'ud-empty' }, t('share.empty'))
      const nameByKey = new Map(models.map((row) => [row.key, row.model]))
      const colorOf = (key) => modelColor(nameByKey.get(key) || key)
      const valueOf = (row) => (metric === 'requests' ? row.requests : metric === 'tokens' ? row.tokens : row.cost)
      const total = models.reduce((sum, row) => sum + valueOf(row), 0)
      const shareOf = (row) => (total > 0 ? valueOf(row) / total : 0)
      const textOf = (row) => {
        if (metric === 'requests') return fmtInt(row.requests) + ' ' + t('share.requests')
        if (metric === 'tokens') return fmtCompact(row.tokens) + ' tokens'
        if ((row.unknown || 0) > 0) return t('billing.unconfirmed')
        return fmtMoney(row.cost, symbol)
      }
      const selected = filter === null ? null : models.find((row) => row.key === filter)
      const measuredCount = models.reduce((sum, row) => sum + (row.msCount || 0), 0)
      const measuredMs = models.reduce((sum, row) => sum + (row.llmMs || 0), 0)
      const aggregateAvg = measuredCount > 0 ? measuredMs / measuredCount : null
      const speedOut = models.reduce((sum, row) => sum + (row.speedOut || 0), 0)
      const speedMs = models.reduce((sum, row) => sum + (row.speedMs || 0), 0)
      const aggregateSpeed = speedMs > 0 ? speedOut / (speedMs / 1000) : null
      const hasEfficiency = selected !== null ? selected.requests > 0 : totals.requests > 0
      const efficiency = hasEfficiency
        ? [
            { key: 'tokens', label: t('eff.tokens'), value: fmtCompact(selected !== null ? selected.tokens : totals.tokens) },
            { key: 'cost', label: t('eff.cost'), value: fmtMoney(selected !== null ? selected.cost : totals.cost, symbol) },
            { key: 'avg', label: t('eff.avg'), value: fmtMs(selected !== null ? selected.avgMs : aggregateAvg), hint: t('eff.avgHint') },
            { key: 'speed', label: t('eff.speed'), value: fmtSpeed(selected !== null ? selected.speed : aggregateSpeed), hint: t('eff.speedHint') },
          ]
        : [
            { key: 'tokens', label: t('eff.tokens'), value: '—' },
            { key: 'cost', label: t('eff.cost'), value: '—' },
            { key: 'avg', label: t('eff.avg'), value: '—' },
            { key: 'speed', label: t('eff.speed'), value: '—', hint: t('eff.speedHint') },
          ]
      const efficiencyScope =
        filter === null ? t('eff.all') : selected !== undefined ? maskModel(selected.model) : maskModel(filter.split('/').slice(-1)[0])
      const circumference = 2 * Math.PI * 40
      let cursor = 0
      const arcs = models.map((row) => {
        const length = shareOf(row) * circumference
        const arc = { key: row.key, color: colorOf(row.key), length, offset: cursor, active: filter === null || filter === row.key }
        cursor += length
        return arc
      })
      return h(
        'div',
        null,
        h(
          'div',
          { className: 'ud-share-wrap' },
          h(
            'div',
            { className: 'ud-donut' },
            h(
              'svg',
              { viewBox: '0 0 104 104', width: 104, height: 104, 'aria-hidden': 'true' },
              h('circle', { cx: 52, cy: 52, r: 40, fill: 'none', stroke: 'var(--ud-sub)', strokeWidth: 9 }),
              arcs.map((arc) =>
                h('circle', {
                  key: arc.key,
                  cx: 52,
                  cy: 52,
                  r: 40,
                  fill: 'none',
                  stroke: arc.color,
                  strokeWidth: 9,
                  strokeDasharray: arc.length + ' ' + (circumference - arc.length),
                  strokeDashoffset: -arc.offset,
                  transform: 'rotate(-90 52 52)',
                  opacity: filter !== null ? (arc.key === filter ? 1 : 0.26) : hover !== null && hover !== arc.key ? 0.3 : 1,
                  onMouseEnter: () => props.onHover(arc.key),
                  onMouseLeave: () => props.onHover(null),
                  onClick: () => props.onFilter(filter === arc.key ? null : arc.key),
                }),
              ),
            ),
            h('div', { className: 'ud-donut-hole' }, h('b', null, fmtAxis(total, metric, symbol)), h('span', null, t('share.total'))),
          ),
          h(
            'div',
            { className: 'ud-modelrows' },
            models.map((row) =>
              h(
                'button',
                {
                  key: row.key,
                  type: 'button',
                  className: 'ud-modelrow',
                  'data-active': String(filter === row.key),
                  onClick: () => props.onFilter(filter === row.key ? null : row.key),
                  onMouseEnter: () => props.onHover(row.key),
                  onMouseLeave: () => props.onHover(null),
                  onFocus: () => props.onHover(row.key),
                  onBlur: () => props.onHover(null),
                  title: t('share.hint'),
                },
                h('i', { className: 'dot', style: { background: colorOf(row.key) } }),
                h(
                  'span',
                  { className: 'name' },
                  h('b', { title: maskModel(row.model) }, maskModel(row.model)),
                  h('span', null, maskAccount(row.provider) + ' · ' + textOf(row)),
                ),
                h('span', { className: 'pct' }, fmtPercent(shareOf(row))),
              ),
            ),
          ),
        ),
        h(
          'div',
          { className: 'ud-eff', title: t('eff.title') + ' · ' + efficiencyScope },
          h(
            'div',
            { className: 'ud-eff-head' },
            h('span', null, t('eff.title')),
            h('span', { className: 'ud-eff-scope' }, efficiencyScope),
          ),
          h(
            'div',
            { className: 'ud-eff-grid' },
            efficiency.map((item) =>
              h(
                'div',
                { key: item.key, className: 'ud-eff-item', title: item.hint || '' },
                h('span', null, item.label),
                h('b', null, item.value),
              ),
            ),
          ),
        ),
      )
    }

    function SpeedCompare(props) {
      const { models, filter, hover, t, maskModel, onFilter, onHover } = props
      const available = models.filter((row) => (row.speedSamples || 0) > 0 && row.p50 !== null && row.p50 !== undefined)
      const rows = filter === null ? available : available.filter((row) => row.key === filter)
      if (rows.length === 0) return h('div', { className: 'ud-empty' }, t('trend.speedEmpty'))
      const max = Math.max(...rows.map((row) => row.p75 || row.p50 || 0), 1) * 1.05
      const pct = (value) => Math.min(100, Math.max(0, (value / max) * 100))
      return h(
        'div',
        { className: 'ud-cmp' },
        h(
          'div',
          { className: 'ud-cmp-axis' },
          h('span', null),
          h(
            'span',
            { className: 'ud-cmp-ticks' },
            h('span', null, '0'),
            h('span', null, fmtSpeed(max / 2)),
            h('span', null, fmtSpeed(max)),
          ),
          h('span', null),
        ),
        rows.map((row) => {
          const color = modelColor(row.model)
          const width = Math.max(1, pct(row.p75) - pct(row.p25))
          return h(
            'button',
            {
              key: row.key,
              type: 'button',
              className: 'ud-cmp-row',
              'data-active': String(filter === row.key),
              style: { opacity: hover !== null && hover !== row.key ? 0.55 : 1 },
              title:
                t('speed.samples') + ': ' + row.speedSamples +
                ' · P25 ' + fmtSpeed(row.p25) +
                ' · P50 ' + fmtSpeed(row.p50) +
                ' · P75 ' + fmtSpeed(row.p75),
              onMouseEnter: () => onHover(row.key),
              onMouseLeave: () => onHover(null),
              onFocus: () => onHover(row.key),
              onBlur: () => onHover(null),
              onClick: () => onFilter(filter === row.key ? null : row.key),
            },
            h(
              'span',
              { className: 'ud-cmp-label' },
              h('i', { style: { background: color } }),
              h('span', { className: 'ud-cmp-name' }, maskModel(row.model)),
              h('span', { className: 'ud-cmp-samples' }, 'n=' + row.speedSamples),
              row.speedSamples < 10 ? h('span', { className: 'ud-cmp-warn' }, t('speed.lowSamples')) : null,
            ),
            h(
              'span',
              { className: 'ud-cmp-track' },
              h('span', {
                className: 'ud-cmp-range',
                style: { left: pct(row.p25) + '%', width: width + '%', background: color },
              }),
              h('span', { className: 'ud-cmp-dot', style: { left: pct(row.p50) + '%', background: color } }),
            ),
            h('span', { className: 'ud-cmp-value' }, fmtSpeed(row.p50)),
          )
        }),
        h(
          'div',
          { className: 'ud-cmp-axis' },
          h('span', null),
          h('span', { className: 'ud-cmp-ticks' }, h('span', null, t('speed.rangeNote'))),
          h('span', null),
        ),
      )
    }

    function Heatmap(props) {
      const { heat, metric, t, selected, rangeFrom, rangeTo, onPick } = props
      const symbolOf = props.symbol
      const [tip, setTip] = useState(null)
      const dayIndexOf = (moment) => Math.floor((moment + TZ * 60_000) / DAY)

      const model = useMemo(() => {
        if (!heat || typeof heat.start !== 'number' || typeof heat.end !== 'number') return null
        const coverage = typeof heat.coverageStart === 'number' ? heat.coverageStart : heat.start
        const start = heat.start
        const end = heat.end
        const span = end - start + 1
        const offset = (new Date(start * DAY).getUTCDay() + 6) % 7
        const weeks = Math.max(1, Math.ceil((offset + span) / 7))
        const values = []
        for (const key in heat.days) {
          const cell = heat.days[key]
          const value = metric === 'requests' ? cell.requests : metric === 'tokens' ? cell.tokens : metric === 'cost' ? cell.cost : cell.convMs
          if (value > 0) values.push(value)
        }
        values.sort((a, b) => a - b)
        const quantile = (ratio) => (values.length === 0 ? 0 : values[Math.min(values.length - 1, Math.floor(values.length * ratio))])
        const thresholds = [quantile(0.25), quantile(0.5), quantile(0.75)]
        const monthFormat = new Intl.DateTimeFormat(undefined, { month: 'short', timeZone: 'UTC' })
        const months = []
        let previous = -1
        for (let week = 0; week < weeks; week += 1) {
          let label = null
          for (let row = 0; row < 7; row += 1) {
            const day = start - offset + week * 7 + row
            if (day >= start && day <= end) {
              label = day
              break
            }
          }
          if (label === null) continue
          const month = new Date(label * DAY).getUTCMonth()
          if (month !== previous) {
            months.push({ week, text: monthFormat.format(new Date(label * DAY)) })
            previous = month
          }
        }
        return { start, end, coverage, offset, weeks, thresholds, months }
      }, [heat, metric])

      const showTip = (event, head, rows) => {
        const rect = event.currentTarget.getBoundingClientRect()
        const x = typeof event.clientX === 'number' && event.clientX > 0 ? event.clientX : rect.left + rect.width / 2
        const y = typeof event.clientY === 'number' && event.clientY > 0 ? event.clientY : rect.top + rect.height / 2
        setTip({ x, y, head, rows })
      }

      if (model === null) return h('div', { className: 'ud-empty' }, t('heat.empty'))
      const fromDay = dayIndexOf(rangeFrom)
      const toDay = dayIndexOf(rangeTo)
      const todayDay = dayIndexOf(Date.now())
      const weekday = [t('week.mon'), t('week.tue'), t('week.wed'), t('week.thu'), t('week.fri'), t('week.sat'), t('week.sun')]

      const cells = []
      for (let week = 0; week < model.weeks; week += 1) {
        for (let row = 0; row < 7; row += 1) {
          const day = model.start - model.offset + week * 7 + row
          const key = week + '-' + row
          if (day < model.start || day > model.end) {
            cells.push(h('div', { key, className: 'ud-cell', style: { visibility: 'hidden' } }))
            continue
          }
          const date = new Date(day * DAY).toISOString().slice(0, 10)
          const cell = heat.days[day]
          const value = cell === undefined ? 0 : metric === 'requests' ? cell.requests : metric === 'tokens' ? cell.tokens : metric === 'cost' ? cell.cost : cell.convMs
          const level = value === 0 ? 0 : value <= model.thresholds[0] ? 1 : value <= model.thresholds[1] ? 2 : value <= model.thresholds[2] ? 3 : 4
          const unknown = day < model.coverage
          const inRange = day >= fromDay && day <= toDay
          const classes = ['ud-cell']
          if (unknown) classes.push('is-unknown')
          else if (!inRange) classes.push('is-out')
          if (selected === date) classes.push('is-selected')
          if (day === todayDay) classes.push('is-today')

          let head
          let rows
          if (unknown) {
            head = date + ' · ' + weekday[row]
            rows = [[t('heat.unknown'), '—']]
          } else {
            head = date + ' · ' + weekday[row] + (inRange ? '' : ' · ' + t('heat.out'))
            rows =
              cell === undefined
                ? [
                    [t('heat.requests'), '0'],
                    [t('heat.tokens'), '0'],
                    [t('heat.cost'), '—'],
                    [t('heat.time'), '—'],
                    [t('sub.sessions'), '0'],
                  ]
                : [
                    [t('heat.requests'), fmtInt(cell.requests)],
                    [t('heat.tokens'), fmtCompact(cell.tokens)],
                    [t('heat.cost'), fmtMoney(cell.cost, symbolOf)],
                    [t('heat.time'), fmtDuration(cell.convMs)],
                    [t('sub.sessions'), String(cell.sessions)],
                  ]
          }
          const aria = head + '，' + rows.map((item) => item[0] + ' ' + item[1]).join('，')
          cells.push(
            h('div', {
              key,
              className: classes.join(' '),
              'data-day': unknown ? 'false' : 'true',
              style: unknown ? undefined : { background: cacheColor(level) },
              'aria-label': aria,
              role: 'button',
              tabIndex: unknown ? -1 : 0,
              onClick: unknown ? undefined : () => onPick(date),
              onKeyDown: unknown
                ? undefined
                : (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onPick(date)
                    }
                  },
              onMouseEnter: (event) => showTip(event, head, rows),
              onMouseLeave: () => setTip(null),
              onFocus: (event) => showTip(event, head, rows),
              onBlur: () => setTip(null),
            }),
          )
        }
      }

      const heatmap = h(
        'div',
        { className: 'ud-heat' },
        h(
          'div',
          { className: 'ud-weekdays', 'aria-hidden': 'true' },
          weekday.map((text, index) => h('span', { key: index }, text)),
        ),
        h(
          'div',
          { className: 'ud-heat-scroll' },
          h(
            'div',
            { className: 'ud-months', style: { width: model.weeks * 20 - 4 + 'px' } },
            model.months.map((month) => h('span', { key: month.week, style: { left: month.week * 20 + 'px' } }, month.text)),
          ),
          h('div', { className: 'ud-grid' }, cells),
        ),
      )

      const viewport = typeof window !== 'undefined' && window.innerWidth ? window.innerWidth : 1280
      return h(
        'div',
        null,
        heatmap,
        tip === null
          ? null
          : h(
              'div',
              {
                className: 'ud-tip',
                style: {
                  left: Math.min(Math.max(8, tip.x - 106), Math.max(8, viewport - 228)) + 'px',
                  top: Math.max(8, tip.y - 14) + 'px',
                },
              },
              h('div', { className: 'ud-tip-head' }, tip.head),
              tip.rows.map((row, index) =>
                h('div', { key: index, className: 'ud-tip-row' }, h('span', null, row[0]), h('b', null, row[1])),
              ),
            ),
      )
    }

    function RequestsPanel(props) {
      const { t, symbol, from, to, model, view, onView, revision, privacy, maskSession, maskModel, maskAccount, maskText } = props
      const [input, setInput] = useState('')
      const [search, setSearch] = useState('')
      const [order, setOrder] = useState('desc')
      const [sort, setSort] = useState('time')
      const [showSpeed, setShowSpeed] = useState(true)
      const [page, setPage] = useState(0)
      const [state, setState] = useState({ loading: true, error: null, data: null })
      const [hiddenQuery, setHiddenQuery] = useState(false)
      const previousPrivacy = useRef(privacy)

      useEffect(() => {
        if (privacy && !previousPrivacy.current && input.trim().length > 0) setHiddenQuery(true)
        if (!privacy) setHiddenQuery(false)
        previousPrivacy.current = privacy
      }, [privacy])

      useEffect(() => {
        const timer = setTimeout(() => setSearch(input.trim()), 250)
        return () => clearTimeout(timer)
      }, [input])

      useEffect(() => {
        setPage(0)
      }, [model, view, search, sort, order, from, to])

      useEffect(() => {
        let cancelled = false
        const controller = new AbortController()
        const url =
          'usage-dashboard/requests?from=' + from + '&to=' + to + '&tz=' + TZ +
          '&view=' + view + '&sort=' + sort + '&order=' + order + '&offset=' + page * PAGE_SIZE + '&limit=' + PAGE_SIZE +
          (model ? '&model=' + encodeURIComponent(model) : '') +
          (search ? '&q=' + encodeURIComponent(search) : '')
        setState((previous) => ({ ...previous, loading: true, error: null }))
        fetch(url, { signal: controller.signal, credentials: 'same-origin', headers: { accept: 'application/json' } })
          .then((response) => {
            if (!response.ok) throw new Error(t('error.http') + ' ' + response.status)
            return response.json()
          })
          .then((data) => {
            if (cancelled) return
            if (data.status === 'error') throw new Error(data.error || t('error.http'))
            setState({ loading: false, error: null, data })
          })
          .catch((error) => {
            if (!cancelled && error && error.name !== 'AbortError') {
              setState((previous) => ({ ...previous, loading: false, error: (error && error.message) || String(error) }))
            }
          })
        return () => {
          cancelled = true
          controller.abort()
        }
      }, [from, to, model, view, search, sort, order, page, revision])

      const data = state.data
      const counts = (data && data.counts) || { requests: 0, faults: 0 }
      const total = data ? data.total : 0
      const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
      const rows = data && Array.isArray(data.rows) ? data.rows : []

      let table
      if (state.error) {
        table = h('div', { className: 'ud-empty' }, state.error)
      } else if (data === null) {
        table = h('div', { className: 'ud-empty' }, t('requests.loading'))
      } else if (rows.length === 0) {
        table = h('div', { className: 'ud-empty' }, view === 'faults' ? t('requests.noneFaults') : t('requests.empty'))
      } else if (view === 'faults') {
        table = h(
          'div',
          { className: 'ud-table-wrap' },
          h(
            'table',
            { className: 'ud-table' },
            h(
              'thead',
              null,
              h(
                'tr',
                null,
                h('th', null, t('requests.time')),
                h('th', null, t('requests.session')),
                h('th', null, t('requests.model')),
                h('th', null, t('requests.kind')),
                h('th', null, t('requests.message')),
              ),
            ),
            h(
              'tbody',
              null,
              rows.map((row, index) =>
                h(
                  'tr',
                  { key: index },
                  h('td', null, fmtWhen(row.t)),
                  h(
                    'td',
                    null,
                    h('span', { className: 'ud-session', title: maskSession(row.sessionId, row.session) }, maskSession(row.sessionId, row.session)),
                  ),
                  h(
                    'td',
                    null,
                    h(
                      'span',
                      { className: 'ud-modelcell', title: maskAccount(row.provider) + '/' + maskModel(row.model) },
                      maskModel(row.model),
                    ),
                  ),
                  h(
                    'td',
                    null,
                    h('span', { className: 'ud-tag' + (row.kind === 'error' ? ' error' : ' neutral') }, row.kind === 'error' ? t('requests.failed') : t('requests.aborted')),
                  ),
                  h(
                    'td',
                    null,
                    h(
                      'span',
                      { className: 'ud-msg', title: privacy ? maskText : row.message || row.code || '' },
                      privacy ? maskText : row.message || row.code || '—',
                    ),
                  ),
                ),
              ),
            ),
          ),
        )
      } else {
        table = h(
          'div',
          { className: 'ud-table-wrap' },
          h(
            'table',
            { className: 'ud-table' },
            h(
              'thead',
              null,
              h(
                'tr',
                null,
                h(
                  'th',
                  {
                    style: { cursor: 'pointer' },
                    title: t('requests.time'),
                    onClick: () => {
                      if (sort === 'time') setOrder(order === 'desc' ? 'asc' : 'desc')
                      else {
                        setSort('time')
                        setOrder('desc')
                      }
                    },
                  },
                  t('requests.time') + (sort === 'time' ? ' ' + (order === 'desc' ? '↓' : '↑') : ''),
                ),
                h('th', null, t('requests.session')),
                h('th', null, t('requests.model')),
                h('th', { title: t('requests.inputHint') }, t('requests.input')),
                h('th', null, t('requests.cache')),
                h('th', null, t('requests.output')),
                h('th', null, t('requests.duration')),
                h(
                  'th',
                  {
                    style: showSpeed ? { cursor: 'pointer' } : { display: 'none' },
                    title: t('requests.speedHint'),
                    onClick: () => {
                      if (sort === 'speed') setOrder(order === 'desc' ? 'asc' : 'desc')
                      else {
                        setSort('speed')
                        setOrder('desc')
                      }
                    },
                  },
                  t('requests.speed') + (sort === 'speed' ? ' ' + (order === 'desc' ? '↓' : '↑') : ''),
                ),
                h('th', null, t('requests.cost')),
                h('th', null, t('requests.status')),
              ),
            ),
            h(
              'tbody',
              null,
              rows.map((row, index) =>
                h(
                  'tr',
                  { key: index },
                  h('td', null, fmtWhen(row.t)),
                  h(
                    'td',
                    null,
                    h('span', { className: 'ud-session', title: maskSession(row.sessionId, row.session) }, maskSession(row.sessionId, row.session)),
                  ),
                  h(
                    'td',
                    null,
                    h(
                      'span',
                      { className: 'ud-modelcell', title: maskAccount(row.provider) + '/' + maskModel(row.model) },
                      maskModel(row.model),
                    ),
                  ),
                  h('td', null, fmtInt(row.input)),
                  h('td', null, fmtInt(row.cacheRead)),
                  h('td', null, fmtInt(row.output)),
                  h('td', null, fmtMs(row.ms)),
                  h(
                    'td',
                    { style: showSpeed ? undefined : { display: 'none' }, title: t('requests.speedHint') },
                    fmtSpeed(row.speed),
                  ),
                  h(
                    'td',
                    { title: billingTip(row, symbol, t) },
                    row.priced ? fmtMoney(row.cost, symbol) : '—',
                  ),
                  h('td', null, h('span', { className: 'ud-tag ok' }, t('requests.ok'))),
                ),
              ),
            ),
          ),
        )
      }

      return h(
        'section',
        { className: 'ud-section', style: { marginBottom: '14px' } },
        h(
          'div',
          { className: 'ud-section-head' },
          h(
            'div',
            { className: 'ud-section-title' },
            t('requests.title') + ' ',
            h('span', { className: 'ud-section-note' }, t('requests.count').replace('TN', fmtInt(total)) + (state.loading ? ' · …' : '')),
          ),
          h(
            'div',
            { className: 'ud-controls' },
            h(
              'details',
              { className: 'ud-colmenu' },
              h('summary', null, t('requests.columns')),
              h(
                'label',
                null,
                h('input', {
                  type: 'checkbox',
                  checked: showSpeed,
                  onChange: (event) => {
                    const next = event.target.checked
                    setShowSpeed(next)
                    if (!next && sort === 'speed') {
                      setSort('time')
                      setOrder('desc')
                    }
                  },
                }),
                t('requests.speed'),
              ),
            ),
            privacy && hiddenQuery
              ? h(
                  'span',
                  { className: 'ud-search-hidden' },
                  t('privacy.searchHidden'),
                  h(
                    'button',
                    {
                      type: 'button',
                      'aria-label': t('filter.clear'),
                      onClick: () => {
                        setInput('')
                        setSearch('')
                        setHiddenQuery(false)
                      },
                    },
                    '×',
                  ),
                )
              : h('input', {
                  className: 'ud-search',
                  type: 'search',
                  value: input,
                  autoComplete: 'off',
                  placeholder: t('requests.search'),
                  'aria-label': t('requests.search'),
                  onChange: (event) => {
                    setInput(event.target.value)
                    setHiddenQuery(false)
                  },
                }),
            h(MetricTabs, {
              label: t('requests.title'),
              value: view,
              onChange: onView,
              options: [
                { value: 'requests', label: t('requests.all') + ' ' + fmtInt(counts.requests) },
                { value: 'faults', label: t('requests.faults') + ' ' + fmtInt(counts.faults) },
              ],
            }),
          ),
        ),
        table,
        h(
          'div',
          { className: 'ud-pager' },
          h('button', { type: 'button', disabled: page <= 0, onClick: () => setPage(page - 1) }, t('requests.prev')),
          h('button', { type: 'button', disabled: page >= pages - 1, onClick: () => setPage(page + 1) }, t('requests.next')),
          h('span', null, t('requests.page').replace('PG', String(Math.min(page + 1, pages))).replace('TP', String(pages))),
        ),
        data && data.status === 'scanning'
          ? h('div', { className: 'ud-section-note', style: { marginTop: '8px' } }, t('scanning') + ' ' + data.progress.done + '/' + data.progress.total)
          : null,
      )
    }

    function UsagePage(props) {
      const { t } = props
      const today = isoDate(Date.now())
      const [range, setRange] = useState('today')
      const [custom, setCustom] = useState(() => ({ from: isoDate(Date.now() - 6 * DAY), to: today }))
      const [revision, setRevision] = useState(0)
      const [state, setState] = useState({ loading: true, error: null, data: null })
      const [trendMetric, setTrendMetric] = useState('tokens')
      const [chartMode, setChartMode] = useState('bar')
      const [speedView, setSpeedView] = useState('trend')
      const [shareMetric, setShareMetric] = useState('requests')
      const [heatMetric, setHeatMetric] = useState('requests')
      const [filter, setFilter] = useState(null)
      const [hover, setHover] = useState(null)
      const [requestView, setRequestView] = useState('requests')
      const [dayFilter, setDayFilter] = useState(null)
      const [restore, setRestore] = useState(null)
      const [privacy, setPrivacy] = useState(false)
      const sessionMap = useRef(null)
      const accountMap = useRef(null)
      const sessionSeq = useRef(0)
      const accountSeq = useRef(0)
      if (sessionMap.current === null) sessionMap.current = new Map()
      if (accountMap.current === null) accountMap.current = new Map()

      const maskSession = (id, title) => {
        if (!privacy) return title
        const key = String(id || title || '')
        if (!sessionMap.current.has(key)) {
          sessionSeq.current += 1
          sessionMap.current.set(key, t('privacy.session') + ' ' + String(sessionSeq.current).padStart(2, '0'))
        }
        return sessionMap.current.get(key)
      }
      const maskAccount = (value) => {
        if (!privacy) return value
        const key = String(value || '')
        if (!accountMap.current.has(key)) {
          accountSeq.current += 1
          const index = accountSeq.current - 1
          const letter = String.fromCharCode(65 + (index % 26)) + (index >= 26 ? String(Math.floor(index / 26)) : '')
          accountMap.current.set(key, t('privacy.account') + ' ' + letter)
        }
        return accountMap.current.get(key)
      }
      const maskModel = (name) => (privacy && SENSITIVE_MODEL.test(String(name || '')) ? t('privacy.modelHidden') : name)

      const customKey = custom.from + '|' + custom.to
      const anchor = Math.floor(Date.now() / 60_000) * 60_000
      const bounds = boundsOf(range, custom, anchor)
      const from = bounds[0]
      const to = bounds[1]

      const refresh = useCallback(() => setRevision((value) => value + 1), [])

      useEffect(() => {
        let cancelled = false
        const controller = new AbortController()
        const url = 'usage-dashboard/summary?from=' + from + '&to=' + to + '&tz=' + TZ + '&mode=' + range
        setState((previous) => ({ ...previous, loading: true, error: null }))
        fetch(url, { signal: controller.signal, credentials: 'same-origin', headers: { accept: 'application/json' } })
          .then((response) => {
            if (!response.ok) {
              const code = response.status
              throw new Error(code === 401 || code === 403 ? t('error.auth') : t('error.http') + ' ' + code)
            }
            return response.json()
          })
          .then((data) => {
            if (!cancelled) {
              if (data.status === 'error') throw new Error(data.error || t('error.http'))
              setState({ loading: false, error: null, data })
            }
          })
          .catch((error) => {
            if (!cancelled && error && error.name !== 'AbortError') {
              setState((previous) => ({ ...previous, loading: false, error: (error && error.message) || String(error) }))
            }
          })
        return () => {
          cancelled = true
          controller.abort()
        }
      }, [from, to, range, revision])

      useEffect(() => {
        const timer = setInterval(() => {
          if (typeof document === 'undefined' || !document.hidden) setRevision((value) => value + 1)
        }, 60_000)
        return () => clearInterval(timer)
      }, [])

      const scanning = Boolean(state.data && state.data.status === 'scanning')
      useEffect(() => {
        if (!scanning) return undefined
        const timer = setTimeout(() => setRevision((value) => value + 1), 1500)
        return () => clearTimeout(timer)
      }, [scanning, state.data])

      const data = state.data
      const totals = data ? data.totals : null
      const symbol = (data && data.symbol) || '¥'
      const busy = state.loading || scanning
      const empty = totals !== null && totals.attempts === 0 && totals.tokens === 0 && totals.convMs === 0
      const models = data && Array.isArray(data.models) ? data.models : []
      const trend = data && data.trend ? data.trend : { granularity: 'day', buckets: [] }
      const heat = data ? data.heatmap : null
      const errors = data && Array.isArray(data.errors) ? data.errors : []

      const clearDay = () => {
        if (restore !== null) {
          setRange(restore.range)
          setCustom(restore.custom)
        }
        setDayFilter(null)
        setRestore(null)
      }

      const pickTab = (value) => {
        setDayFilter(null)
        setRestore(null)
        setRange(value)
      }

      const pickDay = (date) => {
        if (dayFilter === date) {
          clearDay()
          return
        }
        if (restore === null) setRestore({ range, custom })
        setCustom({ from: date, to: date })
        setRange('custom')
        setDayFilter(date)
      }

      const clearAll = () => {
        setFilter(null)
        clearDay()
      }

      const tab = (value, label) =>
        h(
          'button',
          {
            key: value,
            type: 'button',
            className: 'ud-tab',
            'data-active': String(range === value),
            'aria-pressed': range === value,
            onClick: () => pickTab(value),
          },
          label,
        )

      const granularityLabel =
        trend.granularity === 'quarter'
          ? t('trend.quarter')
          : trend.granularity === 'hour'
            ? t('trend.hour')
            : trend.granularity === 'week'
              ? t('trend.week')
              : trend.granularity === 'month'
                ? t('trend.month')
                : t('trend.day')

      const header = h(
        'header',
        { className: 'ud-head' },
        h('div', null, h('h1', null, t('title')), h('p', { className: 'ud-sub' }, t('subtitle'))),
        h(
          'div',
          { className: 'ud-controls' },
          h(
            'div',
            { className: 'ud-tabs', role: 'group', 'aria-label': t('title') },
            tab('today', t('range.today')),
            tab('7d', t('range.7d')),
            tab('30d', t('range.30d')),
            tab('all', t('range.all')),
            tab('custom', t('range.custom')),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'ud-refresh ud-privacy',
              'data-active': String(privacy),
              'aria-pressed': privacy,
              title: t('privacy.hint'),
              onClick: () => setPrivacy(!privacy),
            },
            h(
              'svg',
              { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, 'aria-hidden': 'true' },
              h('path', { d: 'M1.7 8S4.1 3.9 8 3.9 14.3 8 14.3 8 11.9 12.1 8 12.1 1.7 8 1.7 8Z', strokeLinejoin: 'round' }),
              h('circle', { cx: 8, cy: 8, r: 1.9 }),
              privacy ? h('path', { d: 'M2.6 2.6 13.4 13.4', strokeLinecap: 'round' }) : null,
            ),
            privacy ? t('privacy.on') : t('privacy.off'),
          ),
          h(
            'button',
            { type: 'button', className: 'ud-refresh', 'data-busy': String(busy), onClick: refresh, disabled: state.loading },
            h(
              'svg',
              { width: 13, height: 13, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, 'aria-hidden': 'true' },
              h('path', { d: 'M13.5 8a5.5 5.5 0 1 1-1.6-3.9', strokeLinecap: 'round' }),
              h('path', { d: 'M13.5 2.5v3.9H9.6', strokeLinecap: 'round', strokeLinejoin: 'round' }),
            ),
            t('refresh'),
          ),
          data && data.scannedAt ? h('span', { className: 'ud-meta' }, t('updated') + ' ' + fmtClock(data.scannedAt)) : null,
        ),
      )

      const dates =
        range === 'custom'
          ? h(
              'div',
              { className: 'ud-dates' },
              h('input', {
                type: 'date',
                value: custom.from,
                max: custom.to,
                'aria-label': t('range.custom'),
                onChange: (event) => setCustom((previous) => ({ ...previous, from: event.target.value })),
              }),
              h('span', null, '→'),
              h('input', {
                type: 'date',
                value: custom.to,
                min: custom.from,
                'aria-label': t('range.custom'),
                onChange: (event) => setCustom((previous) => ({ ...previous, to: event.target.value })),
              }),
            )
          : null

      let banner = null
      if (state.error) {
        banner = h(
          'div',
          { className: 'ud-banner', 'data-kind': 'error' },
          h('span', null, state.error),
          h('button', { type: 'button', onClick: refresh }, t('retry')),
        )
      } else if (scanning) {
        const progress = (data && data.progress) || { done: 0, total: 0 }
        const ratio = progress.total > 0 ? progress.done / progress.total : 0
        banner = h(
          'div',
          { className: 'ud-banner' },
          h('span', null, t('scanning') + ' ' + progress.done + '/' + progress.total),
          h('div', { className: 'ud-bar' }, h('i', { style: { width: Math.round(ratio * 100) + '%' } })),
          h('span', { className: 'ud-section-note' }, t('scan.hint')),
        )
      } else if (errors.length > 0) {
        banner = h(
          'div',
          { className: 'ud-banner', 'data-kind': 'warn' },
          h('span', null, t('error.progress').replace('TH', String(errors.length))),
          h('span', { className: 'ud-section-note', title: errors.map((item) => item.session + ': ' + item.message).join('\n') }, t('error.more')),
        )
      }

      const filterBar =
        dayFilter !== null || filter !== null
          ? h(
              'div',
              { className: 'ud-filterbar' },
              dayFilter !== null
                ? h(
                    'span',
                    { className: 'ud-filter' },
                    h('b', null, t('filter.day') + '：'),
                    dayFilter,
                    h('button', { type: 'button', 'aria-label': t('filter.clear'), onClick: clearDay }, '×'),
                  )
                : null,
              filter !== null
                ? h(
                    'span',
                    { className: 'ud-filter' },
                    h('b', null, t('filter.model') + '：'),
                    maskModel(filter.split('/').slice(-1)[0]),
                    h('button', { type: 'button', 'aria-label': t('filter.clear'), onClick: () => setFilter(null) }, '×'),
                  )
                : null,
              h('button', { type: 'button', className: 'ud-filter-clear', onClick: clearAll }, t('filter.all')),
            )
          : null

      let body = null
      if (data === null) {
        body = h('div', { className: 'ud-empty' }, t('loading'))
      } else {
        const avgTokens = totals.requests > 0 ? totals.tokens / totals.requests : 0
        const avgCost = totals.requests > 0 ? totals.cost / totals.requests : 0
        const kpis = h(
          'div',
          { className: 'ud-kpis' },
          h(StatCard, {
            label: t('kpi.tokens'),
            value: fmtCompact(totals.tokens),
            title: fmtInt(totals.tokens),
            items: [
              { label: t('sub.input'), value: fmtCompact(totals.input) },
              { label: t('sub.cacheRead'), value: fmtCompact(totals.cacheRead) },
              { label: t('sub.output'), value: fmtCompact(totals.output) },
              { label: t('kpi.avgTokens'), value: fmtCompact(avgTokens) },
            ],
          }),
          h(StatCard, {
            label: t('kpi.cost'),
            value: fmtMoney(totals.cost, symbol),
            title:
              t('kpi.costTip') +
              (data.unpriced && data.unpriced.length > 0 ? ' · ' + t('sub.unpriced') + ' ' + data.unpriced.length : ''),
            items: [
              { label: t('kpi.avgCost'), value: fmtMoney(avgCost, symbol) },
              {
                label: totals.unpricedRequests > 0 ? t('billing.unknownCount') : t('kpi.costNote'),
                value: totals.unpricedRequests > 0 ? fmtInt(totals.unpricedRequests) : t('kpi.notBill'),
                title: t('kpi.costTip'),
              },
            ],
          }),
          h(StatCard, {
            label: t('kpi.requests'),
            value: fmtInt(totals.requests),
            title: t('sub.aborted') + ' ' + totals.aborted,
            items: [
              { label: t('sub.success'), value: fmtPercent(totals.successRate) },
              { label: t('sub.failures'), value: fmtInt(totals.failures), title: t('sub.aborted') + ' ' + totals.aborted },
            ],
          }),
          h(StatCard, {
            label: t('kpi.cacheShare'),
            value: fmtPercent(totals.cacheReadShare),
            title: t('sub.cacheShareHint'),
            items: [{ label: t('kpi.cacheTokens'), value: fmtCompact(totals.cacheRead) }],
            meter: totals.cacheReadShare,
          }),
        )

        const stripGroup = (label, value, title) =>
          h(
            'div',
            { className: 'ud-strip-group', title: title || '' },
            h('span', null, label),
            h('b', null, value),
          )

        const strip = h(
          'div',
          { className: 'ud-strip' },
          stripGroup(t('meta.time'), fmtDuration(totals.convMs), t('meta.timeHint')),
          stripGroup(t('sub.llm') + ' / ' + t('sub.tool'), fmtDuration(totals.llmMs) + ' / ' + fmtDuration(totals.toolMs)),
          stripGroup(t('meta.active'), String(totals.activeDays) + ' ' + t('meta.days') + ' / ' + totals.sessions + ' ' + t('sub.sessions')),
        )

        const speedCompare = trendMetric === 'speed' && speedView === 'compare'
        const trendSection = h(
          'section',
          { className: 'ud-section' },
          h(
            'div',
            { className: 'ud-section-head' },
            h(
              'div',
              { className: 'ud-section-title' },
              t('trend.title') + ' ',
              h(
                'span',
                { className: 'ud-section-note' },
                '· ' + granularityLabel + (trendMetric === 'speed' ? ' · ' + t('trend.speedBasis') : '') + (filter !== null ? ' · ' + t('trend.filtered') + ' ' + maskModel(filter.split('/').slice(-1)[0]) : ''),
              ),
            ),
            h(
              'div',
              { className: 'ud-controls' },
              h(MetricTabs, {
                label: t('trend.title'),
                value: trendMetric,
                onChange: setTrendMetric,
                options: [
                  { value: 'tokens', label: t('trend.tokens') },
                  { value: 'requests', label: t('trend.requests') },
                  { value: 'cost', label: t('trend.cost') },
                  { value: 'time', label: t('trend.time') },
                  { value: 'speed', label: t('trend.speed') },
                ],
              }),
              h(ChartModeTabs, {
                value: chartMode,
                onChange: setChartMode,
                label: t('trend.chartType'),
                barLabel: t('trend.chartBar'),
                lineLabel: t('trend.chartLine'),
                disabled: speedCompare || (trendMetric === 'speed' && filter === null),
                disabledTitle:
                  trendMetric === 'speed' && filter === null
                    ? t('trend.chartDisabledSpeedMulti')
                    : t('trend.chartDisabledSpeed'),
              }),
            ),
          ),
          trendMetric === 'speed'
            ? h(
                'div',
                { className: 'ud-speedbar' },
                h(MetricTabs, {
                  label: t('trend.speed'),
                  value: speedView,
                  onChange: setSpeedView,
                  options: [
                    { value: 'compare', label: t('speed.compare') },
                    { value: 'trend', label: t('speed.trend') },
                  ],
                }),
              )
            : null,
          speedCompare
            ? h(SpeedCompare, {
                models,
                filter,
                hover,
                t,
                maskModel,
                onFilter: setFilter,
                onHover: setHover,
              })
            : h(TrendChart, {
                trend,
                models,
                metric: trendMetric,
                filter,
                hover,
                chartMode,
                symbol,
                t,
                maskModel,
                onFilter: setFilter,
                onHover: setHover,
              }),
        )

        const shareSection = h(
          'section',
          { className: 'ud-section' },
          h(
            'div',
            { className: 'ud-section-head' },
            h(
              'div',
              { className: 'ud-section-title' },
              t('share.title') + ' ',
              filter !== null ? h('span', { className: 'ud-section-note' }, '· ' + t('share.fullRange')) : null,
            ),
            h(MetricTabs, {
              label: t('share.title'),
              value: shareMetric,
              onChange: setShareMetric,
              options: [
                { value: 'requests', label: t('share.requests') },
                { value: 'tokens', label: t('share.tokens') },
                { value: 'cost', label: t('share.cost') },
              ],
            }),
          ),
          h(SharePanel, { models, metric: shareMetric, filter, hover, symbol, totals, t, maskModel, maskAccount, onFilter: setFilter, onHover: setHover }),
          h('p', { className: 'ud-section-note', style: { marginTop: '10px' } }, t('share.hint')),
        )

        const trendGrid = h('div', { className: 'ud-trend-grid' }, trendSection, shareSection)

        const heatSection = h(
          'section',
          { className: 'ud-section', style: { marginBottom: '14px' } },
          h(
            'div',
            { className: 'ud-section-head' },
            h('div', { className: 'ud-section-title' }, t('heat.title') + ' ', h('span', { className: 'ud-section-note' }, '· ' + t('heat.byDay'))),
            h(MetricTabs, {
              label: t('heat.title'),
              value: heatMetric,
              onChange: setHeatMetric,
              options: [
                { value: 'requests', label: t('heat.requests') },
                { value: 'tokens', label: t('heat.tokens') },
                { value: 'cost', label: t('heat.cost') },
                { value: 'time', label: t('heat.time') },
              ],
            }),
          ),
          h(Heatmap, { heat, metric: heatMetric, symbol, t, selected: dayFilter, rangeFrom: from, rangeTo: to, onPick: pickDay }),
          h(
            'div',
            { className: 'ud-legend', style: { marginTop: '10px' } },
            h('span', null, t('heat.less')),
            [0, 1, 2, 3, 4].map((level) => h('span', { key: level, className: 'ud-cell', style: { background: cacheColor(level) } })),
            h('span', null, t('heat.more')),
            h('span', { className: 'ud-cell is-unknown', style: { marginLeft: '6px' } }),
            h('span', null, t('heat.unknown')),
          ),
        )

        const requestsSection = h(RequestsPanel, {
          t, symbol, from, to, model: filter, view: requestView, onView: setRequestView, revision,
          privacy, maskSession, maskModel, maskAccount, maskText: t('privacy.textHidden'),
        })

        const unpricedNote =
          data.unpriced && data.unpriced.length > 0
            ? h('p', { className: 'ud-section-note', style: { marginTop: '10px' } }, t('note.unpriced') + ' ' + data.unpriced.map((row) => row.model).join(' · '))
            : null

        body = h(
          'div',
          null,
          empty ? h('div', { className: 'ud-empty' }, t('empty')) : null,
          kpis,
          strip,
          filterBar,
          trendGrid,
          heatSection,
          requestsSection,
          unpricedNote,
        )
      }

      return h(
        'section',
        { className: 'ud-page', 'aria-label': t('title') },
        h('style', null, CSS),
        h(
          'div',
          { className: 'ud-scroll' },
          h(
            'div',
            { className: 'ud-content' },
            header,
            dates,
            banner,
            body,
            h(
              'footer',
              { className: 'ud-footer' },
              h('div', null, t('footer.source')),
              data && data.coverage
                ? h(
                    'div',
                    null,
                    t('footer.coverage')
                      .replace('SE', fmtInt(data.coverage.sessions))
                      .replace('LE', fmtInt(data.coverage.live))
                      .replace('ER', fmtInt(data.coverage.errors)),
                  )
                : null,
              h('div', null, t('footer.cache')),
              h('div', null, t('footer.time')),
              h('div', null, t('footer.price'), ' ', h('code', null, 'pricing.json')),
              data && data.pricing
                ? h(
                    'div',
                    null,
                    t('billing.footer') +
                      data.pricing.providers
                        .map(
                          (item) =>
                            item.label +
                            '（' +
                            (item.source === 'official'
                              ? t('billing.official')
                              : item.source === 'assumed-official'
                                ? t('billing.assumed')
                                : t('billing.unconfirmed')) +
                            '）',
                        )
                        .join(' · ') +
                      (data.pricing.checkedAt ? ' · ' + t('billing.checkedAt') + ' ' + data.pricing.checkedAt : '') +
                      (data.pricing.tools ? ' · ' + t('billing.tools') : ''),
                  )
                : null,
            ),
          ),
        ),
      )
    }

    function UsageIcon(props) {
      const size = (props && props.size) || 18
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 18 18', fill: 'currentColor', 'aria-hidden': 'true' },
        h('rect', { x: 1, y: 8, width: 3.4, height: 9, rx: 1, opacity: 0.35 }),
        h('rect', { x: 5.6, y: 5.5, width: 3.4, height: 11.5, rx: 1, opacity: 0.55 }),
        h('rect', { x: 10.2, y: 3, width: 3.4, height: 14, rx: 1, opacity: 0.78 }),
        h('rect', { x: 14.8, y: 1, width: 2.4, height: 16, rx: 0.8, opacity: 1 }),
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'usage-dashboard: dictionaries')
        const t = ctx.locale.bind(NS)
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            { name: 'sidebar.panellist', id: PANEL_ID, order: 20, locale: NS, label: () => t('panel') },
            UsageIcon,
          ),
        )
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS }, UsagePage))
      },
    }
  },
})
