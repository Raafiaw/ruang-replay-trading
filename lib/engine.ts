import { canAggregate, timeframeBucket } from './timeframes.ts';

export type Candle = {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    spread?: number;
};
export type SymbolSpec = {
    symbol: string;
    digits: number;
    tickSize: number;
    point: number;
    pip: number;
    contractSize: number;
    quoteCurrency: string;
    minLot: number;
    maxLot: number;
    lotStep: number;
};
export type Dataset = {
    id: string;
    name: string;
    symbol: SymbolSpec;
    minutes: number;
    timezone: string;
    candles: Candle[];
    sample?: boolean;
};
export const EURUSD: SymbolSpec = { symbol: 'EURUSD', digits: 5, tickSize: 0.00001, point: 0.00001, pip: 0.0001, contractSize: 100000, quoteCurrency: 'USD', minLot: 0.01, maxLot: 100, lotStep: 0.01 };
export type ImportOptions = {
    mapping: Record<string, string>;
    minutes: number;
    timezone: string;
    duplicate: 'reject' | 'first' | 'last';
};
export type RowIssue = {
    line: number;
    message: string;
};
export function decimal(value: string | number) { const n = Number(String(value).trim().replace(',', '.')); return Number.isFinite(n) ? n : NaN; }
function splitRow(s: string, sep: string) { const out: string[] = []; let v = '', q = false; for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') {
        if (q && s[i + 1] === '"') {
            v += '"';
            i++;
        }
        else
            q = !q;
    }
    else if (c === sep && !q) {
        out.push(v.trim());
        v = '';
    }
    else
        v += c;
} out.push(v.trim()); return out; }
export function inspectFile(text: string) { const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(x => x.trim()); if (lines.length < 2)
    throw new Error('File harus memiliki header dan minimal satu candle.'); const candidates = ['\t', ';', ',']; const sep = candidates.sort((a, b) => splitRow(lines[0], b).length - splitRow(lines[0], a).length)[0]; const headers = splitRow(lines[0], sep); const normalize = (x: string) => x.toLowerCase().replace(/[<>\s_]/g, ''); const aliases: Record<string, string[]> = { date: ['date', 'tanggal'], time: ['time', 'waktu'], timestamp: ['timestamp', 'datetime'], open: ['open'], high: ['high'], low: ['low'], close: ['close'], volume: ['tickvol', 'volume', 'vol', 'realvol'], spread: ['spread'] }; const mapping: Record<string, string> = {}; for (const [k, vs] of Object.entries(aliases))
    mapping[k] = headers.find(h => vs.includes(normalize(h))) ?? ''; return { headers, mapping, rows: lines.slice(1, 7).map(l => splitRow(l, sep)), sep }; }
export function brokerTime(date: string, time: string, zone: string) { const m = (date + ' ' + time).trim().match(/^(\d{4})[.\/-](\d{2})[.\/-](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/); if (!m)
    throw new Error('Tanggal/waktu harus YYYY.MM.DD HH:mm[:ss].'); const [y, mo, d, h, mi, s] = m.slice(1).map(x => Number(x ?? 0)); const local = Date.UTC(y, mo - 1, d, h, mi, s); const dt = new Date(local); if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d || h > 23 || mi > 59 || s > 59)
    throw new Error('Tanggal/waktu tidak valid.'); const fixed = zone.match(/^UTC(?:([+-])(\d{1,2})(?::(\d{2}))?)?$/); if (fixed) {
    const offset = (fixed[1] === '-' ? -1 : 1) * (Number(fixed[2] ?? 0) * 60 + Number(fixed[3] ?? 0));
    if (Math.abs(offset) > 840)
        throw new Error('Offset zona waktu maksimal 14 jam.');
    return local / 1000 - offset * 60;
} const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }); let utc = local; for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(fmt.formatToParts(utc).map(p => [p.type, p.value]));
    const observed = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    utc += local - observed;
} const p = Object.fromEntries(fmt.formatToParts(utc).map(x => [x.type, x.value])); if (+p.hour !== h || +p.day !== d)
    throw new Error('Waktu tidak ada saat perubahan DST; gunakan offset UTC eksplisit.'); return utc / 1000; }
export function parseMT5(text: string, options: ImportOptions) { if (text.length > 12000000)
    throw new Error('Ukuran file maksimal 12 MB.'); if (!Number.isInteger(options.minutes) || options.minutes < 1)
    throw new Error('Timeframe dasar harus menit bulat positif.'); const info = inspectFile(text), lines = text.replace(/^\uFEFF/, '').split(/\r?\n/); const issues: RowIssue[] = [], bars = new Map<number, Candle>(); let duplicates = 0; const col = (row: string[], k: string) => row[info.headers.indexOf(options.mapping[k])] ?? ''; if (!['open', 'high', 'low', 'close'].every(k => options.mapping[k]) || !(options.mapping.date || options.mapping.timestamp))
    throw new Error('Petakan tanggal/timestamp dan keempat kolom OHLC.'); for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim())
        continue;
    try {
        const row = splitRow(lines[i], info.sep);
        let t: number;
        if (options.mapping.timestamp) {
            const raw = col(row, 'timestamp');
            if (/[zZ]|[+-]\d\d:\d\d$/.test(raw)) {
                t = Date.parse(raw) / 1000;
            }
            else {
                const [date, time] = raw.split(/[ T]/);
                t = brokerTime(date, time ?? '00:00:00', options.timezone);
            }
        }
        else
            t = brokerTime(col(row, 'date'), col(row, 'time') || '00:00:00', options.timezone);
        const b: Candle = { time: t, open: decimal(col(row, 'open')), high: decimal(col(row, 'high')), low: decimal(col(row, 'low')), close: decimal(col(row, 'close')), volume: options.mapping.volume ? decimal(col(row, 'volume')) : 0 };
        if (options.mapping.spread)
            b.spread = decimal(col(row, 'spread'));
        if (!Number.isFinite(t) || ![b.open, b.high, b.low, b.close, b.volume].every(Number.isFinite) || b.volume < 0 || Math.min(b.open, b.high, b.low, b.close) <= 0 || b.low > Math.min(b.open, b.close) || b.high < Math.max(b.open, b.close) || b.low > b.high || b.spread !== undefined && (!Number.isFinite(b.spread) || b.spread < 0))
            throw new Error('OHLC, volume, spread, atau timestamp tidak valid.');
        if (bars.has(t)) {
            duplicates++;
            if (options.duplicate === 'reject') {
                issues.push({ line: i + 1, message: 'Timestamp duplikat; publikasi diblokir.' });
                continue;
            }
            if (options.duplicate === 'first')
                continue;
        }
        bars.set(t, b);
    }
    catch (e) {
        issues.push({ line: i + 1, message: (e as Error).message });
    }
} const candles = [...bars.values()].sort((a, b) => a.time - b.time); if (candles.length > 50000)
    throw new Error('Maksimal 50.000 candle per dataset.'); let gaps = 0; for (let i = 1; i < candles.length; i++)
    if (candles[i].time - candles[i - 1].time > options.minutes * 60)
        gaps++; return { candles, issues, duplicates, gaps }; }
export function aggregate(candles: Candle[], base: number, target: number, knownIndex: number) { if (!canAggregate(base, target))
    throw new Error('Timeframe harus kelipatan timeframe dasar; candle lebih kecil tidak dibuat.'); if(target===base)return candles.slice(0,knownIndex+1).map(b=>({...b}));const out: Candle[] = []; for (const b of candles.slice(0, knownIndex + 1)) {
    const time = timeframeBucket(b.time, target);
    const last = out.at(-1);
    if (last?.time === time) {
        last.high = Math.max(last.high, b.high);
        last.low = Math.min(last.low, b.low);
        last.close = b.close;
        last.volume += b.volume;
        last.spread = b.spread;
    }
    else
        out.push({ ...b, time });
} return out; }
export function sampleDataset(minutes: 1 | 5 = 5): Dataset { let seed = 4817; const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; const candles: Candle[] = []; let close = 1.0842; for (let i = 0; i < (minutes === 1 ? 14400 : 720); i++) {
    const open = close, drift = Math.sin(i / 28) * (minutes === 1 ? 0.000005 : 0.000075);
    close = +(open + (rand() - .5) * (minutes === 1 ? .0001 : .0005) + drift).toFixed(5);
    candles.push({ time: Date.UTC(2026, 8, 7) / 1000 + i * minutes * 60, open, high: +(Math.max(open, close) + rand() * .00021).toFixed(5), low: +(Math.min(open, close) - rand() * .00021).toFixed(5), close, volume: Math.round(40 + rand() * 320), spread: 10 });
} return { id: minutes === 1 ? 'sample-eurusd-m1' : 'sample-eurusd', name: minutes === 1 ? 'EURUSD · Contoh M1 (sintetis)' : 'EURUSD · Latihan September', symbol: { ...EURUSD }, minutes, timezone: 'UTC', candles, sample: true }; }
export type Config = {
    initial: number;
    currency: string;
    leverage: number;
    quoteToAccount: number;
    spread: number;
    spreadUnit: 'pip' | 'point' | 'price';
    spreadSource: 'manual' | 'dataset';
    commission: number;
    slippage: number;
};
export const DEFAULT_CONFIG: Config = { initial: 10000, currency: 'USD', leverage: 100, quoteToAccount: 1, spread: 0.25, spreadUnit: 'pip', spreadSource: 'manual', commission: 0, slippage: 0 };
export type Order = {
    id: string;
    side: 'buy' | 'sell';
    type: 'market' | 'limit' | 'stop';
    lot: number;
    price?: number;
    sl?: number;
    tp?: number;
};
export type Position = Order & {
    entry: number;
    entryTime: number;
    entryIndex: number;
    fee: number;
};
export type Trade = Position & {
    exit: number;
    exitTime: number;
    pnl: number;
    reason: string;
    ambiguous: boolean;
};
export type Event = {
    index: number;
    phase?: 'open' | 'close';
    kind: 'order' | 'close' | 'deposit' | 'cancel' | 'modify' | 'config';
    order?: Order;
    id?: string;
    amount?: number;
    sl?: number;
    tp?: number;
    config?: Partial<Config>;
};
export type Account = {
    balance: number;
    positions: Position[];
    pending: Order[];
    trades: Trade[];
    deposits: {
        time: number;
        amount: number;
    }[];
    errors: {
        index: number;
        message: string;
    }[];
    curve: {
        time: number;
        equity: number;
    }[];
};
export function validateConfig(c: Config, s: SymbolSpec) { if (!/^[A-Z]{3}$/.test(c.currency) || !Number.isFinite(c.initial) || c.initial < 0 || !Number.isFinite(c.leverage) || c.leverage < 1 || c.leverage > 1000 || !Number.isFinite(c.quoteToAccount) || c.quoteToAccount <= 0 || ![c.spread, c.commission, c.slippage].every(x => Number.isFinite(x) && x >= 0))
    throw new Error('Konfigurasi akun/biaya tidak valid.'); if (c.currency === s.quoteCurrency && c.quoteToAccount !== 1)
    throw new Error('Kurs harus 1 bila mata uang akun sama dengan mata uang profit.'); }
export function validateSpec(s: SymbolSpec) { if (!s.symbol.trim() || !Number.isInteger(s.digits) || s.digits < 0 || s.digits > 8 || ![s.tickSize, s.point, s.pip, s.contractSize, s.minLot, s.maxLot, s.lotStep].every(x => Number.isFinite(x) && x > 0) || s.maxLot < s.minLot || !/^[A-Z]{3}$/.test(s.quoteCurrency))
    throw new Error('Spesifikasi simbol tidak valid.'); }
export function spreadPrice(c: Config, s: SymbolSpec, b: Candle) { if (c.spreadSource === 'dataset') {
    if (b.spread === undefined)
        throw new Error('Dataset tidak memiliki spread MT5 pada candle ini.');
    return b.spread * s.point;
} return c.spread * (c.spreadUnit === 'pip' ? s.pip : c.spreadUnit === 'point' ? s.point : 1); }
export function quotes(b: Candle, c: Config, s: SymbolSpec) { const spread = spreadPrice(c, s, b); return { bid: b.close, ask: b.close + spread, spread }; }
export function profit(side: 'buy' | 'sell', lot: number, entry: number, exit: number, s: SymbolSpec, c: Config) { return (side === 'buy' ? 1 : -1) * (exit - entry) * lot * s.contractSize * c.quoteToAccount; }
export function margin(lot: number, price: number, s: SymbolSpec, c: Config) { return lot * s.contractSize * price * c.quoteToAccount / c.leverage; }
export function metrics(a: Account, b: Candle, s: SymbolSpec, c: Config) { const q = quotes(b, c, s); const floating = a.positions.reduce((sum, p) => sum + profit(p.side, p.lot, p.entry, p.side === 'buy' ? q.bid : q.ask, s, c), 0); const used = a.positions.reduce((sum, p) => sum + margin(p.lot, q.bid, s, c), 0); return { balance: a.balance, equity: a.balance + floating, floating, margin: used, freeMargin: a.balance + floating - used }; }
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
function tick(price: number, s: SymbolSpec) { return Math.round(price / s.tickSize) * s.tickSize; }
function validateOrder(o: Order, s: SymbolSpec, reference: number) { if (!Number.isFinite(o.lot) || o.lot < s.minLot - 1e-8 || o.lot > s.maxLot || Math.abs(o.lot / s.lotStep - Math.round(o.lot / s.lotStep)) > 1e-6)
    throw new Error(`Lot ${s.minLot}–${s.maxLot}, langkah ${s.lotStep}.`); if (o.type !== 'market' && (!o.price || !Number.isFinite(o.price)))
    throw new Error('Harga pending order wajib diisi.'); for (const v of [o.price, o.sl, o.tp])
    if (v !== undefined && (!Number.isFinite(v) || v <= 0 || Math.abs(v / s.tickSize - Math.round(v / s.tickSize)) > 1e-5))
        throw new Error('Harga harus positif dan sesuai tick size.'); const ref = o.price ?? reference; if (o.sl !== undefined && (o.side === 'buy' ? o.sl >= ref : o.sl <= ref))
    throw new Error('Stop loss harus berada di sisi kerugian.'); if (o.tp !== undefined && (o.side === 'buy' ? o.tp <= ref : o.tp >= ref))
    throw new Error('Take profit harus berada di sisi keuntungan.'); }
export function simulate(data: Dataset, initialConfig: Config, events: Event[], until: number, seed?: Account, start = 0): Account { let c = { ...initialConfig }; validateSpec(data.symbol); validateConfig(c, data.symbol); const a: Account = seed ?? { balance: c.initial, positions: [], pending: [], trades: [], deposits: [], errors: [], curve: [] }; const s = data.symbol, fee = (lot: number) => lot * c.commission, slip = c.slippage * s.point; const exit = (p: Position, price: number, b: Candle, reason: string, ambiguous = false) => { const fill = price + (p.side === 'buy' ? -slip : slip); const gross = profit(p.side, p.lot, p.entry, fill, s, c); a.balance += gross - fee(p.lot); a.trades.push({ ...p, exit: fill, exitTime: b.time, pnl: gross - fee(p.lot) - p.fee, reason, ambiguous }); a.positions = a.positions.filter(x => x.id !== p.id); }; const enter = (o: Order, price: number, b: Candle, i: number) => { if (a.positions.some(p => p.id === o.id))
    return; const fill = price + (o.side === 'buy' ? slip : -slip); const account = metrics(a, b, s, c); if (margin(o.lot, fill, s, c) + fee(o.lot) > account.freeMargin + 1e-8)
    throw new Error('Free margin tidak mencukupi.'); a.balance -= fee(o.lot); a.positions.push({ ...o, entry: fill, entryTime: b.time, entryIndex: i, fee: fee(o.lot) }); }; const apply = (e: Event, b: Candle, i: number, open: boolean) => { try {
    const q = quotes({ ...b, close: open ? b.open : b.close }, c, s);
    if (e.kind === 'config') {
        const next = { ...c, ...e.config };
        validateConfig(next, s);
        spreadPrice(next, s, b);
        c = next;
    }
    else if (e.kind === 'deposit') {
        if (!e.amount || !Number.isFinite(e.amount) || e.amount <= 0)
            throw new Error('Setoran harus positif.');
        a.balance += e.amount;
        a.deposits.push({ time: b.time, amount: e.amount });
    }
    else if (e.kind === 'order' && e.order) {
        const o = clone(e.order);
        validateOrder(o, s, o.side === 'buy' ? q.ask : q.bid);
        if (a.pending.some(p => p.id === o.id) || a.positions.some(p => p.id === o.id))
            throw new Error('ID order sudah dipakai.');
        if (o.type === 'market')
            enter(o, o.side === 'buy' ? q.ask : q.bid, b, i);
        else {
            const ref = o.side === 'buy' ? q.ask : q.bid;
            if (o.type === 'limit' && (o.side === 'buy' ? o.price! >= ref : o.price! <= ref) || o.type === 'stop' && (o.side === 'buy' ? o.price! <= ref : o.price! >= ref))
                throw new Error('Harga limit/stop berada di sisi pasar yang keliru.');
            a.pending.push(o);
        }
    }
    else if (e.kind === 'close') {
        for (const p of [...a.positions].filter(p => !e.id || p.id === e.id))
            exit(p, p.side === 'buy' ? q.bid : q.ask, b, 'Manual / sinyal');
    }
    else if (e.kind === 'cancel')
        a.pending = a.pending.filter(o => o.id !== e.id);
    else if (e.kind === 'modify') {
        const p = a.positions.find(x => x.id === e.id);
        if (p) {
            const next = { ...p, sl: e.sl, tp: e.tp };
              const reference = open ? quotes(data.candles[Math.max(0, i - 1)], c, s) : q;
              validateOrder({ ...next, price: undefined }, s, p.side === 'buy' ? reference.bid : reference.ask);
            p.sl = e.sl;
            p.tp = e.tp;
        }
    }
}
catch (error) {
    a.errors.push({ index: i, message: (error as Error).message });
} }; const byIndex = new Map<number, Event[]>(); events.forEach(e => { const list = byIndex.get(e.index) ?? []; list.push(e); byIndex.set(e.index, list); }); for (let i = start; i <= Math.min(until, data.candles.length - 1); i++) {
    const b = data.candles[i];
    const spread = spreadPrice(c, s, b), es = byIndex.get(i) ?? [];
    es.filter(e => e.phase === 'open').forEach(e => apply(e, b, i, true));
    for (const o of [...a.pending]) {
        const add = o.side === 'buy' ? spread : 0, lo = b.low + add, hi = b.high + add, op = b.open + add;
        const hit = o.type === 'limit' ? (o.side === 'buy' ? lo <= o.price! : hi >= o.price!) : (o.side === 'buy' ? hi >= o.price! : lo <= o.price!);
        if (hit) {
            const fill = o.type === 'limit' ? (o.side === 'buy' ? Math.min(op, o.price!) : Math.max(op, o.price!)) : (o.side === 'buy' ? Math.max(op, o.price!) : Math.min(op, o.price!));
            a.pending = a.pending.filter(p => p.id !== o.id);
            try {
                enter(o, fill, b, i);
            }
            catch (e) {
                a.errors.push({ index: i, message: (e as Error).message });
            }
        }
    }
    for (const p of [...a.positions]) {
        const add = p.side === 'sell' ? spread : 0, lo = b.low + add, hi = b.high + add, op = b.open + add;
        const stop = p.sl !== undefined && (p.side === 'buy' ? lo <= p.sl : hi >= p.sl), take = p.tp !== undefined && (p.side === 'buy' ? hi >= p.tp : lo <= p.tp);
        if (stop || take) {
            const level = stop ? p.sl! : p.tp!;
            const price = stop ? (p.side === 'buy' ? Math.min(op, level) : Math.max(op, level)) : (p.side === 'buy' ? Math.max(op, level) : Math.min(op, level));
            exit(p, price, b, stop ? 'Stop loss' : 'Take profit', stop && take || p.type !== 'market' && p.entryIndex === i);
        }
    }
    es.filter(e => e.phase !== 'open').forEach(e => apply(e, b, i, false));
    a.curve.push({ time: b.time, equity: metrics(a, b, s, c).equity });
} return a; }
export type Branch = {
    id: string;
    name: string;
    parent?: string;
    forkIndex?: number;
    events: Event[];
    furthest: number;
};
export function branchEvent(branch: Branch, event: Event) { if (event.index < branch.furthest) {
    const id = crypto.randomUUID();
    return { id, name: `Cabang ${id.slice(0, 4)}`, parent: branch.id, forkIndex: event.index, events: [...branch.events.filter(e => e.index <= event.index), event], furthest: event.index } satisfies Branch;
} return { ...branch, events: [...branch.events, event], furthest: Math.max(branch.furthest, event.index) }; }
export function report(a: Account, c: Config) { const wins = a.trades.filter(t => t.pnl > 0), loss = a.trades.filter(t => t.pnl < 0); const total = a.trades.reduce((s, t) => s + t.pnl, 0), positive = wins.reduce((s, t) => s + t.pnl, 0), negative = -loss.reduce((s, t) => s + t.pnl, 0); let peak = c.initial, maxDrawdown = 0, deposits = 0; for (const point of a.curve) {
    deposits = a.deposits.filter(d => d.time <= point.time).reduce((s, d) => s + d.amount, 0);
    const equity = point.equity - deposits;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
} return { netProfit: total, winRate: a.trades.length ? wins.length / a.trades.length * 100 : 0, profitFactor: negative ? positive / negative : positive ? Infinity : 0, maxDrawdown, trades: a.trades.length, ambiguous: a.trades.filter(t => t.ambiguous).length }; }
export function csv(rows: Record<string, unknown>[]) { if (!rows.length)
    return ''; const keys = Object.keys(rows[0]); const cell = (x: unknown) => '"' + String(x ?? '').replace(/"/g, '""') + '"'; return '\uFEFF' + [keys.map(cell).join(','), ...rows.map(r => keys.map(k => cell(r[k])).join(','))].join('\r\n'); }

export function alignPlot(points:{time:number;value:number}[],base:number,target:number,knownTime:number){const values=new Map<number,{time:number;value:number}>();for(const p of points){if(p.time>knownTime)continue;const time=target===base?p.time:timeframeBucket(p.time,target);values.set(time,{time,value:p.value});}return [...values.values()].sort((a,b)=>a.time-b.time);}
