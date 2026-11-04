/**
 * Pure aggregation of durable Session events into per-day usage buckets.
 *
 * Every fold input is a committed session event (`assistant/message` carries the
 * provider-reported `TokenUsage`), so results are deterministic and replayable.
 * The Host half calls these functions; nothing here performs I/O.
 */

export const DAY = 86_400_000
const HOUR = 3_600_000
const QUARTER = 900_000

/**
 * Built-in billing profile. The user file `pricing.json` overrides it.
 * Prices are CNY per 1M tokens; `cacheHit` is cached input, `cacheMiss` is
 * uncached input. Peak/off-peak windows are evaluated per request in the
 * configured timezone offset (Asia/Shanghai = +480 minutes).
 */
export const DEFAULT_PRICING = {
  schema: 2,
  currency: 'CNY',
  symbol: '¥',
  checkedAt: '2026-11-03',
  peak: {
    offsetMinutes: 480,
    weekdays: [1, 2, 3, 4, 5],
    windows: [
      ['09:00', '12:00'],
      ['14:00', '18:00'],
    ],
    holidays: [],
  },
  books: {
    'deepseek-flash-2026-11': {
      effectiveFrom: '2026-10-28',
      verifiedAt: '2026-11-03',
      source: 'DeepSeek 官方定价文档',
      url: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/',
      currency: 'CNY',
      note: '官方文档未公布价格生效日期，从本地最早日志日起适用；更早请求标记为价格未确认。',
      models: {
        'deepseek-flash': {
          offPeak: { cacheHit: 0.02, cacheMiss: 1, output: 4 },
          peak: { cacheHit: 0.04, cacheMiss: 2, output: 8 },
        },
        'glm-5.3-flash': {
          // 智谱官方文档（docs.bigmodel.cn/cn/guide/start/pricing），无峰谷价。
          offPeak: { cacheHit: 0.23, cacheMiss: 0.8, output: 2.8 },
        },
      },
    },
  },
  providers: {
    official: {
      label: 'DeepSeek 官方',
      book: 'deepseek-flash-2026-11',
      source: 'official',
      models: {
        'deepseek-flash': 'deepseek-flash',
        'deepseek-chat': 'deepseek-flash',
        'deepseek-reasoner': 'deepseek-flash',
      },
    },
    relay: {
      label: '第三方中转',
      book: 'deepseek-flash-2026-11',
      source: 'assumed-official',
      note: '第三方中转默认按官方价假设；把 providers 的 key 改成你自己的 provider 名即可。',
      models: {
        'deepseek-flash': 'deepseek-flash',
        'deepseek-v4-flash': 'deepseek-flash',
        'deepseek-v4.1-flash': 'deepseek-flash',
        'glm-5.3-flash': 'glm-5.3-flash',
      },
    },
  },
  tools: {
    search: { pricePer1000: 5, effectiveFrom: '2026-11-01', source: 'DeepSeek 官方', tracked: false },
    fetch: { pricePer1000: 5, effectiveFrom: '2026-11-01', source: 'DeepSeek 官方', tracked: false },
  },
}

/** Normalize the user price document; falls back to the built-in profile. */
export function normalizePricing(doc) {
  const base = doc && typeof doc === 'object' ? doc : {}
  if (!base.books || typeof base.books !== 'object' || !base.providers || typeof base.providers !== 'object') {
    return DEFAULT_PRICING
  }
  return {
    schema: 2,
    currency: typeof base.currency === 'string' ? base.currency : DEFAULT_PRICING.currency,
    symbol: typeof base.symbol === 'string' ? base.symbol : DEFAULT_PRICING.symbol,
    checkedAt: typeof base.checkedAt === 'string' ? base.checkedAt : DEFAULT_PRICING.checkedAt,
    peak: base.peak && typeof base.peak === 'object' ? base.peak : DEFAULT_PRICING.peak,
    books: base.books,
    providers: base.providers,
    tools: base.tools && typeof base.tools === 'object' ? base.tools : DEFAULT_PRICING.tools,
  }
}

function clockMinutes(text) {
  const parts = String(text || '').split(':').map(Number)
  if (parts.length !== 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null
  return parts[0] * 60 + parts[1]
}

function dayText(dayIndex) {
  return new Date(dayIndex * DAY).toISOString().slice(0, 10)
}

/**
 * Build the per-request billing resolver: provider -> price book -> explicit
 * model mapping -> peak/off-peak unit prices. Every answer carries its source
 * and reason so the UI can show why a request is priced or not.
 */
export function createBilling(pricing) {
  const peak = pricing.peak && typeof pricing.peak === 'object' ? pricing.peak : DEFAULT_PRICING.peak
  const offset = Number.isFinite(peak.offsetMinutes) ? peak.offsetMinutes : 480
  const weekdays = new Set(Array.isArray(peak.weekdays) ? peak.weekdays : [1, 2, 3, 4, 5])
  const windows = (Array.isArray(peak.windows) ? peak.windows : DEFAULT_PRICING.peak.windows)
    .map((pair) => [clockMinutes(pair[0]), clockMinutes(pair[1])])
    .filter((pair) => pair[0] !== null && pair[1] !== null)
  const holidays = new Set(Array.isArray(peak.holidays) ? peak.holidays : [])
  const books = pricing.books || {}
  const providers = pricing.providers || {}

  function isPeak(time) {
    const local = time + offset * 60_000
    const day = Math.floor(local / DAY)
    if (holidays.has(dayText(day))) return false
    if (!weekdays.has(new Date(day * DAY).getUTCDay())) return false
    const minute = Math.floor((local - day * DAY) / 60_000)
    return windows.some((pair) => minute >= pair[0] && minute < pair[1])
  }

  function unpriced(reason, extra) {
    return {
      priced: false,
      cost: 0,
      reason,
      provider: extra && extra.provider,
      model: extra && extra.model,
      book: extra && extra.book,
      source: extra && extra.source,
      providerLabel: extra && extra.providerLabel,
      note: extra && extra.note,
      tier: null,
      prices: null,
      currency: pricing.currency,
      symbol: pricing.symbol,
      effectiveFrom: extra && extra.effectiveFrom,
      verifiedAt: extra && extra.verifiedAt,
    }
  }

  function billRequest(provider, model, time, usage) {
    const providerConfig = providers[provider]
    if (providerConfig === undefined) return unpriced('provider-unconfigured', { provider, model })
    const label = providerConfig.label || provider
    if (providerConfig.source === 'unconfirmed' || providerConfig.book === null || providerConfig.book === undefined) {
      return unpriced('provider-unconfirmed', {
        provider, model, providerLabel: label, source: providerConfig.source || 'unconfirmed', note: providerConfig.note,
      })
    }
    const book = books[providerConfig.book]
    if (book === undefined) {
      return unpriced('book-missing', { provider, model, providerLabel: label, book: providerConfig.book })
    }
    const day = Math.floor((time + offset * 60_000) / DAY)
    const date = dayText(day)
    if (typeof book.effectiveFrom === 'string' && date < book.effectiveFrom) {
      return unpriced('price-not-effective', {
        provider, model, providerLabel: label, source: providerConfig.source, book: providerConfig.book,
        effectiveFrom: book.effectiveFrom, verifiedAt: book.verifiedAt, note: book.note,
      })
    }
    const bookModel = providerConfig.models && typeof providerConfig.models[model] === 'string'
      ? providerConfig.models[model]
      : null
    if (bookModel === null) {
      return unpriced('model-unmapped', {
        provider, model, providerLabel: label, source: providerConfig.source, book: providerConfig.book,
        effectiveFrom: book.effectiveFrom, verifiedAt: book.verifiedAt, note: providerConfig.note,
      })
    }
    const modelPrices = book.models ? book.models[bookModel] : undefined
    if (modelPrices === undefined) {
      return unpriced('model-unmapped', {
        provider, model, providerLabel: label, source: providerConfig.source, book: providerConfig.book,
        effectiveFrom: book.effectiveFrom, verifiedAt: book.verifiedAt, note: book.note,
      })
    }
    const tier = isPeak(time) ? 'peak' : 'offPeak'
    const prices = modelPrices[tier] || modelPrices.offPeak
    if (prices === undefined) {
      return unpriced('tier-missing', {
        provider, model, providerLabel: label, source: providerConfig.source, book: providerConfig.book,
        effectiveFrom: book.effectiveFrom, verifiedAt: book.verifiedAt, note: book.note,
      })
    }
    const miss = Number(prices.cacheMiss) || 0
    const hit = Number(prices.cacheHit) || 0
    const output = Number(prices.output) || 0
    const write = prices.cacheWrite === undefined ? miss : Number(prices.cacheWrite) || 0
    const input = Number(usage && usage.input) || 0
    const cacheRead = Number(usage && usage.cacheRead) || 0
    const cacheWrite = Number(usage && usage.cacheWrite) || 0
    const outputTokens = Number(usage && usage.output) || 0
    const cost = (input * miss + cacheRead * hit + cacheWrite * write + outputTokens * output) / 1_000_000
    return {
      priced: true,
      cost,
      reason: null,
      provider,
      model,
      providerLabel: label,
      book: providerConfig.book,
      bookModel,
      source: providerConfig.source || 'official',
      tier,
      prices: { miss, hit, write, output },
      currency: book.currency || pricing.currency,
      symbol: pricing.symbol,
      effectiveFrom: book.effectiveFrom,
      verifiedAt: book.verifiedAt,
      note: providerConfig.note || book.note,
    }
  }

  return { billRequest, isPeak }
}

export function createEntry() {
  return {
    days: {},
    lastSeq: -1,
    lastTime: 0,
    route: null,
    openTurn: null,
    openStep: null,
    tools: new Map(),
    title: '',
    reqs: [],
    fails: [],
    size: null,
    warning: null,
    live: false,
    fetchedAt: 0,
    done: true,
    error: null,
    // Seeded continuation: the parent session's history is replayed into this
    // log with its original timestamps, so every event older than `seedFrom`
    // (the child's createdAt) is a copy, not a new billed request.
    seeded: false,
    seedFrom: 0,
  }
}

export function emptyDay() {
  return { r: 0, f: 0, a: 0, i: 0, o: 0, cr: 0, cw: 0, rt: 0, c: 0, l: 0, k: 0, cost: 0, m: {} }
}

function toolCallId(data) {
  if (typeof data.callId === 'string') return data.callId
  const message = data.message
  if (message && typeof message === 'object') {
    if (typeof message.toolCallId === 'string') return message.toolCallId
    if (message.source && typeof message.source.callId === 'string') return message.source.callId
  }
  return null
}

function num(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function modelKey(provider, model) {
  return provider + '/' + model
}

function bucket(entry, time, tz) {
  const day = Math.floor((time + tz * 60_000) / DAY)
  let slot = entry.days[day]
  if (slot === undefined) slot = entry.days[day] = emptyDay()
  return slot
}

/**
 * Fold one batch of events into an entry. Call repeatedly with successive
 * slices of the same session log; boundary state (open turn/step, in-flight
 * tool calls) lives on the entry.
 */
export function foldEvents(entry, events, tz) {
  // Pre-scan this slice for seed markers before folding anything. A seeded
  // continuation replays the parent log with original timestamps, so the
  // boundary must be known up front: the `session` header carries `isSeeded`
  // and `createdAt`, and `session/end-seed` closes the replayed region.
  for (const event of events) {
    if (!event || typeof event !== 'object') continue
    if (event.type === 'session') {
      if (event.isSeeded === true) {
        entry.seeded = true
        if (typeof event.createdAt === 'number' && event.createdAt > entry.seedFrom) {
          entry.seedFrom = event.createdAt
        }
      }
    } else if (event.type === 'session/end-seed' && event.data && event.data.inherited === true) {
      // `inherited` marks the fork-inherited prefix; the same event type also
      // appears with an empty payload for unrelated series markers, which
      // must not truncate the session.
      entry.seeded = true
      if (typeof event.time === 'number' && event.time > entry.seedFrom) {
        entry.seedFrom = event.time
      }
    }
  }
  for (const event of events) {
    if (!event || typeof event !== 'object') continue
    const time = typeof event.time === 'number' ? event.time : 0
    const data = event.data && typeof event.data === 'object' ? event.data : {}
    // Seeded replay of the parent log: those events were already counted in
    // the parent session, so skip them (advance the seq cursor only).
    if (entry.seeded && entry.seedFrom > 0 && time < entry.seedFrom) {
      if (typeof event.seq === 'number' && event.seq > entry.lastSeq) entry.lastSeq = event.seq
      if (time > entry.lastTime) entry.lastTime = time
      continue
    }
    switch (event.type) {
      case 'session/title':
        if (typeof data.title === 'string' && data.title.length > 0) entry.title = data.title
        break
      case 'request/context':
        if (typeof data.provider === 'string' && typeof data.model === 'string') {
          entry.route = { provider: data.provider, model: data.model }
        }
        break
      case 'turn/start':
        entry.openTurn = time
        entry.openStep = null
        break
      case 'turn/end': {
        if (entry.openTurn !== null && time >= entry.openTurn) {
          bucket(entry, time, tz).c += time - entry.openTurn
        }
        entry.openTurn = null
        entry.openStep = null
        const kind = data.reason && data.reason.kind
        if (kind === 'error') bucket(entry, time, tz).f += 1
        else if (kind === 'aborted' || kind === 'interrupted') bucket(entry, time, tz).a += 1
        if (kind === 'error' || kind === 'aborted' || kind === 'interrupted') {
          const error = data.reason && data.reason.error
          const route = entry.route
          entry.fails.push([
            time,
            kind,
            route ? modelKey(route.provider, route.model) : 'unknown/unknown',
            (error && typeof error.message === 'string' && error.message) || '',
            (error && typeof error.code === 'string' && error.code) || '',
          ])
        }
        entry.tools.clear()
        break
      }
      case 'step/start':
        entry.openStep = time
        break
      case 'step/end':
        entry.openStep = null
        break
      case 'assistant/message': {
        const usage = data.usage
        const source = data.message && data.message.source ? data.message.source : null
        const provider = (source && source.provider) || (entry.route && entry.route.provider) || 'unknown'
        const model = (source && source.model) || (entry.route && entry.route.model) || 'unknown'
        const key = modelKey(provider, model)
        const slot = bucket(entry, time, tz)
        let duration = null
        if (entry.openStep !== null && time >= entry.openStep) {
          duration = time - entry.openStep
          slot.l += duration
          entry.openStep = null
        }
        if (usage && typeof usage === 'object') {
          const input = num(usage.inputTokens)
          const output = num(usage.outputTokens)
          const cacheRead = num(usage.cacheReadTokens)
          const cacheWrite = num(usage.cacheWriteTokens)
          const reasoning = num(usage.reasoningTokens)
          slot.r += 1
          slot.i += input
          slot.o += output
          slot.cr += cacheRead
          slot.cw += cacheWrite
          slot.rt += reasoning
          let row = slot.m[key]
          if (row === undefined) row = slot.m[key] = { r: 0, i: 0, o: 0, cr: 0, cw: 0 }
          row.r += 1
          row.i += input
          row.o += output
          row.cr += cacheRead
          row.cw += cacheWrite
          entry.reqs.push([time, key, input, output, cacheRead, cacheWrite, duration])
        }
        break
      }
      case 'tool/call': {
        const callId = toolCallId(data)
        if (callId !== null) entry.tools.set(callId, time)
        break
      }
      case 'tool/result': {
        const callId = toolCallId(data)
        if (callId !== null) {
          const start = entry.tools.get(callId)
          if (start !== undefined && time >= start) bucket(entry, time, tz).k += time - start
          entry.tools.delete(callId)
        }
        break
      }
      default:
        break
    }
    if (typeof event.seq === 'number' && event.seq > entry.lastSeq) entry.lastSeq = event.seq
    if (time > entry.lastTime) entry.lastTime = time
  }
  return entry
}

function quantile(sorted, q) {
  if (sorted.length === 0) return null
  const position = (sorted.length - 1) * q
  const base = Math.floor(position)
  const rest = position - base
  const next = sorted[base + 1]
  if (next === undefined) return sorted[base]
  return sorted[base] + rest * (next - sorted[base])
}

function dayLabel(dayIndex) {
  return new Date(dayIndex * DAY).toISOString().slice(0, 10)
}

// Local-calendar month key of a day index, in the stats timezone:
// YYYY-MM encoded as an integer (months since year 0 * 12 + month).
function monthKeyOf(day) {
  const date = new Date(day * DAY)
  return date.getUTCFullYear() * 12 + date.getUTCMonth()
}

function monthKeyStartDay(key) {
  const year = Math.floor(key / 12)
  const month = key % 12
  return Math.floor(Date.UTC(year, month, 1) / DAY)
}

// Days a month bucket covers, clipped to the queried range.
function monthKeySpanDays(key, firstDay, lastDay) {
  const start = monthKeyStartDay(key)
  const next = monthKeyStartDay(key + 1)
  const from = Math.max(start, firstDay)
  const to = Math.min(next - 1, lastDay)
  return to - from + 1
}

// Month key of a bucket timestamp (ms in the stats timezone).
function monthKeyOfT(t, tzMs) {
  return monthKeyOf(Math.floor((t + tzMs) / DAY))
}

// Collect request-level speed samples of one model across a whole month,
// recomputing the bucket P50 from raw observations instead of averaging the
// daily P50s (a ratio/quantile must not be summed or averaged).
function collectMonthSpeedSamples(bucketSpeeds, modelId, monthKey, tzMs) {
  const samples = []
  const first = monthKeyStartDay(monthKey)
  const last = monthKeyStartDay(monthKey + 1) - 1
  for (let day = first; day <= last; day++) {
    const perModel = bucketSpeeds.get(day)
    if (perModel === undefined) continue
    const values = perModel.get(modelId)
    if (values === undefined || values.length === 0) continue
    for (const value of values) samples.push(value)
  }
  return samples
}

function splitModelKey(key) {
  const split = key.indexOf('/')
  if (split === -1) return { provider: 'unknown', model: key }
  return { provider: key.slice(0, split), model: key.slice(split + 1) }
}

function sessionLabel(entry, id) {
  if (typeof entry.title === 'string' && entry.title.length > 0) return entry.title
  return '…' + String(id).slice(-8)
}

/**
 * Aggregate every cached session into one range: day buckets (for the heatmap
 * and totals), a trend series, per-model rows and the recent request log.
 * `from`/`to` are epoch milliseconds in the caller's time zone offset `tz`
 * (minutes east of UTC; +480 for UTC+8).
 */
export function summarize(sessions, from, to, tz, pricing, options) {
  const billing = createBilling(pricing)
  const tzMs = tz * 60_000
  const now = Date.now()
  const upper = Math.min(Number.isFinite(to) ? to : now, now + DAY)

  let fromDay = 0
  let toDay = Math.floor((upper - 1 + tzMs) / DAY)
  let earliest = null
  for (const entry of sessions.values()) {
    for (const key in entry.days) {
      const day = Number(key)
      if (earliest === null || day < earliest) earliest = day
    }
  }
  if (from > 0) fromDay = Math.floor((from + tzMs) / DAY)
  else if (earliest !== null) fromDay = Math.min(earliest, toDay)
  if (fromDay > toDay) fromDay = toDay
  if (toDay - fromDay > 3700) fromDay = toDay - 3700

  const daily = new Map()
  for (let day = fromDay; day <= toDay; day++) daily.set(day, emptyDay())
  const models = new Map()
  const touched = new Set()

  for (const [sessionId, entry] of sessions) {
    if (entry.error) continue
    if (entry.live === true) {
      const day = Math.floor((entry.lastTime + tzMs) / DAY)
      const target = daily.get(day)
      if (target !== undefined) {
        if (entry.openTurn !== null && entry.lastTime > entry.openTurn) target.c += entry.lastTime - entry.openTurn
        if (entry.openStep !== null && entry.lastTime > entry.openStep) target.l += entry.lastTime - entry.openStep
      }
    }
    for (const key in entry.days) {
      const day = Number(key)
      if (day < fromDay || day > toDay) continue
      const source = entry.days[key]
      const target = daily.get(day)
      target.r += num(source.r)
      target.f += num(source.f)
      target.a += num(source.a)
      target.i += num(source.i)
      target.o += num(source.o)
      target.cr += num(source.cr)
      target.cw += num(source.cw)
      target.rt += num(source.rt)
      target.c += num(source.c)
      target.l += num(source.l)
      target.k += num(source.k)
      const modelRows = source.m && typeof source.m === 'object' ? source.m : {}
      for (const modelId in modelRows) {
        const row = modelRows[modelId]
        const { provider, model } = splitModelKey(modelId)
        let aggregate = models.get(modelId)
        if (aggregate === undefined) {
          aggregate = { key: modelId, provider, model, requests: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, tokens: 0, cost: 0, unknown: 0, llmMs: 0, msCount: 0, avgMs: null, speedOut: 0, speedMs: 0, speedCount: 0, speed: null, priced: false }
          models.set(modelId, aggregate)
        }
        aggregate.requests += num(row.r)
        aggregate.input += num(row.i)
        aggregate.output += num(row.o)
        aggregate.cacheRead += num(row.cr)
        aggregate.cacheWrite += num(row.cw)
      }
      if (target.r || target.i || target.o || target.cr || target.cw) touched.add(sessionId)
    }
  }

  // Request-level pass: per-day model split and the trend series.
  const mode = options && typeof options.mode === 'string' ? options.mode : 'auto'
  const spanDays = toDay - fromDay + 1
  // Bars aggregate per hour/day/week/month: pick the granularity from the real
  // span so the bucket count stays readable (target ≈ ≤ 45 buckets).
  const barGranularity =
    mode === 'today'
      ? 'hour'
      : mode === '7d' || mode === '30d'
        ? 'day'
        : spanDays <= 1
          ? 'hour'
          : spanDays <= 45
            ? 'day'
            : spanDays <= 315
              ? 'week'
              : 'month'
  const speedGranularity = barGranularity
  const subSpecs = []
  const addSpec = (granularity) => {
    if (granularity !== 'hour' && granularity !== 'quarter') return
    if (subSpecs.some((spec) => spec.granularity === granularity)) return
    const ms = granularity === 'quarter' ? QUARTER : HOUR
    const first = Math.floor((from + tzMs) / ms)
    const last = Math.floor((upper - 1 + tzMs) / ms)
    const map = new Map()
    for (let bucket = first; bucket <= last; bucket++) {
      map.set(bucket, { tokens: 0, requests: 0, cost: 0, llmMs: 0, m: {} })
    }
    subSpecs.push({ granularity, ms, map })
  }
  addSpec(barGranularity)
  addSpec(speedGranularity)
  const weekStartOf = (day) => day - ((new Date(day * DAY).getUTCDay() + 6) % 7)
  const speedBucketKey = (time) => {
    if (barGranularity === 'hour') return Math.floor((time + tzMs) / HOUR)
    if (barGranularity === 'quarter') return Math.floor((time + tzMs) / QUARTER)
    const day = Math.floor((time + tzMs) / DAY)
    return barGranularity === 'week' ? weekStartOf(day) : day
  }
  const bucketKeyOfT = (time) => {
    if (barGranularity === 'hour') return Math.floor((time + tzMs) / HOUR)
    if (barGranularity === 'quarter') return Math.floor((time + tzMs) / QUARTER)
    const day = Math.floor((time + tzMs) / DAY)
    return barGranularity === 'week' ? weekStartOf(day) : day
  }
  const todayDay = Math.floor((now + tzMs) / DAY)
  let heatStart = todayDay - 364
  if (earliest !== null && earliest < heatStart) heatStart = earliest
  const modelSpeeds = new Map()
  const bucketSpeeds = new Map()
  const dayModels = new Map()
  const dayCosts = new Map()
  const heatCosts = new Map()
  let unknownRequests = 0
  for (const [sessionId, entry] of sessions) {
    if (entry.error) continue
    const reqs = Array.isArray(entry.reqs) ? entry.reqs : []
    for (const item of reqs) {
      const time = num(item[0])
      const day = Math.floor((time + tzMs) / DAY)
      const modelId = typeof item[1] === 'string' ? item[1] : 'unknown/unknown'
      const { provider, model } = splitModelKey(modelId)
      const input = num(item[2])
      const output = num(item[3])
      const cacheRead = num(item[4])
      const cacheWrite = num(item[5])
      const ms = item[6] === null || item[6] === undefined ? null : num(item[6])
      const bill = billing.billRequest(provider, model, time, { input, output, cacheRead, cacheWrite })
      const cost = bill.priced ? bill.cost : 0
      if (!bill.priced) unknownRequests += 1
      if (day >= heatStart && day <= todayDay) {
        heatCosts.set(day, (heatCosts.get(day) || 0) + cost)
      }
      if (day < fromDay || day > toDay) continue
      const tokens = input + output + cacheRead + cacheWrite
      let split = dayModels.get(day)
      if (split === undefined) {
        split = {}
        dayModels.set(day, split)
      }
      let row = split[modelId]
      if (row === undefined) row = split[modelId] = { tokens: 0, requests: 0, cost: 0, llmMs: 0, speedOut: 0, speedMs: 0, speedCount: 0 }
      row.requests += 1
      row.tokens += tokens
      row.cost += cost
      if (ms !== null) row.llmMs += ms
      if (ms !== null && ms > 0) {
        row.speedOut += output
        row.speedMs += ms
        row.speedCount += 1
      }
      if (ms !== null && ms > 0) {
        const perSecond = output / (ms / 1000)
        let speeds = modelSpeeds.get(modelId)
        if (speeds === undefined) modelSpeeds.set(modelId, (speeds = []))
        speeds.push(perSecond)
        const bucketId = speedBucketKey(time)
        let perBucket = bucketSpeeds.get(bucketId)
        if (perBucket === undefined) bucketSpeeds.set(bucketId, (perBucket = new Map()))
        let bucketValues = perBucket.get(modelId)
        if (bucketValues === undefined) perBucket.set(modelId, (bucketValues = []))
        bucketValues.push(perSecond)
      }
      const modelAggregate = models.get(modelId)
      if (modelAggregate !== undefined) {
        modelAggregate.cost += cost
        if (!bill.priced) modelAggregate.unknown += 1
      }
      dayCosts.set(day, (dayCosts.get(day) || 0) + cost)
      if (modelAggregate !== undefined && ms !== null) {
        modelAggregate.llmMs += ms
        modelAggregate.msCount += 1
        if (ms > 0) {
          modelAggregate.speedOut += output
          modelAggregate.speedMs += ms
          modelAggregate.speedCount = (modelAggregate.speedCount || 0) + 1
        }
      }
      for (const spec of subSpecs) {
        const bucket = Math.floor((time + tzMs) / spec.ms)
        const slot = spec.map.get(bucket)
        if (slot === undefined) continue
        slot.tokens += tokens
        slot.requests += 1
        slot.cost += cost
        if (ms !== null) slot.llmMs += ms
        let hm = slot.m[modelId]
        if (hm === undefined) hm = slot.m[modelId] = { tokens: 0, requests: 0, cost: 0, llmMs: 0, speedOut: 0, speedMs: 0, speedCount: 0 }
        hm.tokens += tokens
        hm.requests += 1
        hm.cost += cost
        if (ms !== null) hm.llmMs += ms
        if (ms !== null && ms > 0) {
          hm.speedOut += output
          hm.speedMs += ms
          hm.speedCount += 1
        }
      }
    }
  }

  const totals = {
    requests: 0,
    failures: 0,
    aborted: 0,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    reasoning: 0,
    tokens: 0,
    cost: 0,
    llmMs: 0,
    toolMs: 0,
    convMs: 0,
    sessions: touched.size,
    activeDays: 0,
    unpricedRequests: 0,
  }
  const series = []
  for (let day = fromDay; day <= toDay; day++) {
    const slot = daily.get(day)
    const tokens = slot.i + slot.o + slot.cr + slot.cw
    if (slot.r > 0 || tokens > 0) totals.activeDays += 1
    totals.requests += slot.r
    totals.failures += slot.f
    totals.aborted += slot.a
    totals.input += slot.i
    totals.output += slot.o
    totals.cacheRead += slot.cr
    totals.cacheWrite += slot.cw
    totals.reasoning += slot.rt
    totals.tokens += tokens
    const dayCost = dayCosts.get(day) || 0
    totals.cost += dayCost
    totals.llmMs += slot.l
    totals.toolMs += slot.k
    totals.convMs += slot.c
    const item = {
      day,
      t: day * DAY - tzMs,
      date: dayLabel(day),
      tokens,
      input: slot.i,
      output: slot.o,
      cacheRead: slot.cr,
      cacheWrite: slot.cw,
      requests: slot.r,
      failures: slot.f,
      aborted: slot.a,
      cost: dayCost,
      llmMs: slot.l,
      toolMs: slot.k,
      convMs: slot.c,
    }
    const split = dayModels.get(day)
    if (split !== undefined) item.m = split
    series.push(item)
  }

  const buildSubTrend = (spec) => {
    const list = []
    for (const [index, slot] of [...spec.map.entries()].sort((a, b) => a[0] - b[0])) {
      list.push({ t: index * spec.ms - tzMs, tokens: slot.tokens, requests: slot.requests, cost: slot.cost, llmMs: slot.llmMs, m: slot.m })
    }
    return { granularity: spec.granularity, buckets: list }
  }

  let trend
  if (barGranularity === 'month') {
    // Calendar months (stats timezone), keyed YYYY-MM. Partial edge months keep
    // their real size; speeds are recomputed from request-level samples instead
    // of averaging the daily P50s, so a short edge month is not diluted.
    const buckets = new Map()
    for (const item of series) {
      const monthKey = monthKeyOf(item.day)
      let bucket = buckets.get(monthKey)
      if (bucket === undefined) {
        bucket = {
          t: monthKeyStartDay(monthKey) * DAY - tzMs,
          tokens: 0,
          requests: 0,
          cost: 0,
          llmMs: 0,
          m: {},
        }
        buckets.set(monthKey, bucket)
      }
      bucket.tokens += item.tokens
      bucket.requests += item.requests
      bucket.cost += item.cost
      bucket.llmMs += item.llmMs
      const split = item.m || {}
      for (const key in split) {
        const source = split[key]
        let row = bucket.m[key]
        if (row === undefined) row = bucket.m[key] = { tokens: 0, requests: 0, cost: 0, llmMs: 0, speedOut: 0, speedMs: 0, speedCount: 0 }
        row.tokens += source.tokens
        row.requests += source.requests
        row.cost += source.cost
        row.llmMs += source.llmMs
        row.speedOut += source.speedOut || 0
        row.speedMs += source.speedMs || 0
        row.speedCount += source.speedCount || 0
      }
    }
    const list = [...buckets.values()].sort((a, b) => a.t - b.t)
    for (const bucket of list) {
      const monthKey = monthKeyOfT(bucket.t, tzMs)
      for (const modelId in bucket.m) {
        const row = bucket.m[modelId]
        if (row.speedCount <= 0) continue
        const samples = collectMonthSpeedSamples(bucketSpeeds, modelId, monthKey, tzMs)
        if (samples.length > 0) {
          samples.sort((a, b) => a - b)
          row.speedP50 = quantile(samples, 0.5)
          row.speedSamples = samples.length
        }
      }
    }
    trend = { granularity: 'month', buckets: list }
  } else if (barGranularity === 'week') {
    // Fixed Monday-anchored weeks spanning the entire queried range, so the
    // first/last buckets are whole weeks instead of ragged edges.
    const firstWeek = weekStartOf(fromDay)
    const lastWeek = weekStartOf(toDay)
    const buckets = new Map()
    for (let week = firstWeek; week <= lastWeek; week += 7) {
      buckets.set(week, { t: week * DAY - tzMs, tokens: 0, requests: 0, cost: 0, llmMs: 0, m: {} })
    }
    for (const item of series) {
      const startDay = weekStartOf(item.day)
      const bucket = buckets.get(startDay)
      if (bucket === undefined) continue
      bucket.tokens += item.tokens
      bucket.requests += item.requests
      bucket.cost += item.cost
      bucket.llmMs += item.llmMs
      const split = item.m || {}
      for (const key in split) {
        const source = split[key]
        let row = bucket.m[key]
        if (row === undefined) row = bucket.m[key] = { tokens: 0, requests: 0, cost: 0, llmMs: 0, speedOut: 0, speedMs: 0, speedCount: 0 }
        row.tokens += source.tokens
        row.requests += source.requests
        row.cost += source.cost
        row.llmMs += source.llmMs
        row.speedOut += source.speedOut || 0
        row.speedMs += source.speedMs || 0
        row.speedCount += source.speedCount || 0
      }
    }
    trend = { granularity: 'week', buckets: [...buckets.values()] }
  } else if (barGranularity === 'day') {
    trend = {
      granularity: 'day',
      buckets: series.map((item) => ({
        t: item.t,
        tokens: item.tokens,
        requests: item.requests,
        cost: item.cost,
        llmMs: item.llmMs,
        m: item.m || {},
      })),
    }
  } else {
    trend = buildSubTrend(subSpecs.find((spec) => spec.granularity === barGranularity))
  }
  for (const bucket of trend.buckets) {
    // Month buckets already carry a P50 recomputed from request-level samples
    // across the whole month; bucketKeyOfT would only see the month start day.
    if (barGranularity === 'month') continue
    const perModel = bucketSpeeds.get(bucketKeyOfT(bucket.t))
    if (perModel === undefined) continue
    for (const modelId in bucket.m) {
      const values = perModel.get(modelId)
      if (values === undefined || values.length === 0) continue
      values.sort((a, b) => a - b)
      bucket.m[modelId].speedP50 = quantile(values, 0.5)
      bucket.m[modelId].speedSamples = values.length
    }
  }
  const speedTrend =
    speedGranularity === barGranularity
      ? null
      : buildSubTrend(subSpecs.find((spec) => spec.granularity === speedGranularity))

  // Heatmap window: last 53 weeks, widened when the log holds older days.
  const heatDays = {}
  for (const entry of sessions.values()) {
    if (entry.error) continue
    for (const key in entry.days) {
      const day = Number(key)
      if (day < heatStart || day > todayDay) continue
      const slot = entry.days[key]
      const tokens = slot.i + slot.o + slot.cr + slot.cw
      if (tokens === 0 && slot.r === 0 && slot.c === 0 && slot.f === 0 && slot.a === 0) continue
      let cell = heatDays[day]
      if (cell === undefined) cell = heatDays[day] = { requests: 0, tokens: 0, cost: 0, convMs: 0, sessions: 0 }
      cell.requests += slot.r
      cell.tokens += tokens
      cell.convMs += slot.c
      cell.sessions += 1
      cell.cost = heatCosts.get(day) || 0
    }
  }
  for (const entry of sessions.values()) {
    if (entry.live === true && entry.openTurn !== null && entry.lastTime > entry.openTurn) {
      const day = Math.floor((entry.lastTime + tzMs) / DAY)
      const cell = heatDays[day]
      if (cell !== undefined) cell.convMs += entry.lastTime - entry.openTurn
    }
  }

  const rows = [...models.values()]
  for (const row of rows) {
    row.tokens = row.input + row.output + row.cacheRead + row.cacheWrite
    row.avgMs = row.msCount > 0 ? row.llmMs / row.msCount : null
    row.speed = row.speedMs > 0 ? row.speedOut / (row.speedMs / 1000) : null
    row.speedCount = row.speedCount || row.msCount || 0
    const samples = modelSpeeds.get(row.key)
    if (samples !== undefined && samples.length > 0) {
      samples.sort((a, b) => a - b)
      row.speedSamples = samples.length
      row.p25 = quantile(samples, 0.25)
      row.p50 = quantile(samples, 0.5)
      row.p75 = quantile(samples, 0.75)
    } else {
      row.speedSamples = 0
      row.p25 = null
      row.p50 = null
      row.p75 = null
    }
    row.priced = (row.unknown || 0) === 0
  }
  rows.sort((a, b) => b.tokens - a.tokens || b.requests - a.requests)
  totals.unpricedRequests = unknownRequests
  const unpriced = rows.filter((row) => !row.priced && row.requests > 0).map((row) => ({
    provider: row.provider,
    model: row.model,
    requests: row.requests,
    unknown: row.unknown || 0,
    tokens: row.tokens,
  }))

  const successes = totals.requests
  const attempts = successes + totals.failures
  return {
    from: fromDay * DAY - tzMs,
    to: (toDay + 1) * DAY - tzMs,
    tz,
    totals: {
      ...totals,
      attempts,
      successRate: attempts > 0 ? successes / attempts : null,
      cacheReadShare: totals.input + totals.cacheRead > 0 ? totals.cacheRead / (totals.input + totals.cacheRead) : null,
    },
    daily: series,
    trend,
    speedTrend,
    heatmap: { start: heatStart, end: todayDay, coverageStart: earliest, days: heatDays },
    models: rows,
    unpriced,
    pricing: {
      currency: pricing.currency,
      symbol: pricing.symbol,
      checkedAt: pricing.checkedAt,
      providers: Object.keys(pricing.providers || {}).map((id) => ({
        id,
        label: pricing.providers[id].label || id,
        source: pricing.providers[id].source || 'official',
        book: pricing.providers[id].book || null,
      })),
      tools: pricing.tools || null,
      pricedModels: rows.filter((row) => row.priced && row.requests > 0).length,
    },
  }
}

/**
 * Page through one range's request log (completed model calls) or turn-level
 * failures. Shared by the dashboard summary's counts and the request table.
 */
export function queryRequests(sessions, from, to, tz, pricing, options) {
  const opts = options || {}
  const billing = createBilling(pricing)
  const tzMs = tz * 60_000
  const now = Date.now()
  const upper = Math.min(Number.isFinite(to) ? to : now, now + DAY)
  const view = opts.view === 'faults' ? 'faults' : 'requests'
  const limit = Number.isFinite(opts.limit) ? Math.max(1, Math.min(500, Math.round(opts.limit))) : 50
  const offset = Number.isFinite(opts.offset) ? Math.max(0, Math.round(opts.offset)) : 0
  const order = opts.order === 'asc' ? 'asc' : 'desc'
  const modelFilter = typeof opts.model === 'string' && opts.model.length > 0 ? opts.model : null
  const query = typeof opts.q === 'string' ? opts.q.trim().toLowerCase().slice(0, 120) : ''

  const toDay = Math.floor((upper - 1 + tzMs) / DAY)
  let earliest = null
  for (const entry of sessions.values()) {
    for (const key in entry.days) {
      const day = Number(key)
      if (earliest === null || day < earliest) earliest = day
    }
  }
  let fromDay = 0
  if (from > 0) fromDay = Math.floor((from + tzMs) / DAY)
  else if (earliest !== null) fromDay = Math.min(earliest, toDay)
  if (fromDay > toDay) fromDay = toDay

  const requests = []
  const faults = []
  let requestCount = 0
  let faultCount = 0
  for (const [sessionId, entry] of sessions) {
    if (entry.error) continue
    const label = sessionLabel(entry, sessionId)
    const lowerLabel = label.toLowerCase()
    const lowerSessionId = String(sessionId).toLowerCase()
    for (const item of Array.isArray(entry.reqs) ? entry.reqs : []) {
      const time = num(item[0])
      const day = Math.floor((time + tzMs) / DAY)
      if (day < fromDay || day > toDay) continue
      const modelId = typeof item[1] === 'string' ? item[1] : 'unknown/unknown'
      if (modelFilter !== null && modelId !== modelFilter) continue
      requestCount += 1
      if (query.length > 0 && !lowerLabel.includes(query) && !lowerSessionId.includes(query) && !modelId.toLowerCase().includes(query)) continue
      const { provider, model } = splitModelKey(modelId)
      const input = num(item[2])
      const output = num(item[3])
      const cacheRead = num(item[4])
      const cacheWrite = num(item[5])
      const ms = item[6] === null || item[6] === undefined ? null : num(item[6])
      const bill = billing.billRequest(provider, model, time, { input, output, cacheRead, cacheWrite })
      requests.push({
        t: time,
        session: label,
        sessionId,
        provider,
        model,
        input,
        output,
        cacheRead,
        cacheWrite,
        tokens: input + output + cacheRead + cacheWrite,
        cost: bill.priced ? bill.cost : 0,
        priced: bill.priced,
        billing: {
          tier: bill.tier,
          source: bill.source,
          book: bill.book,
          providerLabel: bill.providerLabel,
          prices: bill.prices,
          effectiveFrom: bill.effectiveFrom,
          verifiedAt: bill.verifiedAt,
          reason: bill.reason,
          currency: bill.currency,
          symbol: bill.symbol,
          note: bill.note,
        },
        ms,
        speed: ms !== null && ms > 0 ? output / (ms / 1000) : null,
        status: 'ok',
      })
    }
    for (const item of Array.isArray(entry.fails) ? entry.fails : []) {
      const time = num(item[0])
      const day = Math.floor((time + tzMs) / DAY)
      if (day < fromDay || day > toDay) continue
      const modelId = typeof item[2] === 'string' ? item[2] : 'unknown/unknown'
      if (modelFilter !== null && modelId !== modelFilter) continue
      faultCount += 1
      const kind = typeof item[1] === 'string' ? item[1] : 'error'
      const message = typeof item[3] === 'string' ? item[3] : ''
      if (query.length > 0 && !lowerLabel.includes(query) && !lowerSessionId.includes(query) && !modelId.toLowerCase().includes(query) && !kind.includes(query) && !message.toLowerCase().includes(query)) continue
      const { provider, model } = splitModelKey(modelId)
      faults.push({
        t: time,
        session: label,
        sessionId,
        provider,
        model,
        kind,
        message,
        code: typeof item[4] === 'string' ? item[4] : '',
        status: kind,
      })
    }
  }
  const sortKey = opts.sort === 'speed' ? 'speed' : 'time'
  const compare = (a, b) => {
    if (sortKey === 'speed') {
      const left = a.speed === null || a.speed === undefined ? null : a.speed
      const right = b.speed === null || b.speed === undefined ? null : b.speed
      if (left === null && right === null) return order === 'asc' ? a.t - b.t : b.t - a.t
      if (left === null) return 1
      if (right === null) return -1
      if (left !== right) return order === 'asc' ? left - right : right - left
      return order === 'asc' ? a.t - b.t : b.t - a.t
    }
    return order === 'asc' ? a.t - b.t : b.t - a.t
  }
  requests.sort(compare)
  faults.sort(compare)
  const source = view === 'faults' ? faults : requests
  return {
    view,
    rows: source.slice(offset, offset + limit),
    total: source.length,
    offset,
    limit,
    counts: { requests: requestCount, faults: faultCount },
  }
}
