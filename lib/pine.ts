import { simulate, report, DEFAULT_CONFIG } from './engine.ts';
import type { Dataset, Config, Event, Account } from './engine.ts';
type Node = {
    kind: string;
    value?: string | number;
    left?: Node;
    right?: Node;
    args?: {
        name?: string;
        node: Node;
    }[];
    extra?: Node;
    id: number;
};
type Statement = {
    kind: 'assign' | 'call' | 'if';
    line: number;
    name?: string;
    node: Node;
    body?: Statement[];
    persistent?: boolean;
};
type Token = {
    value: string;
    type: string;
};
export class PineError extends Error {
    line: number;
    constructor(message: string, line = 1) { super(message); this.line = line; }
}
const powers: Record<string, number> = { or: 1, and: 2, '==': 3, '!=': 3, '>': 4, '<': 4, '>=': 4, '<=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6 };
let nextNode = 0;
function expression(source: string): Node { const tokens: Token[] = []; const pattern = /\s+|(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[A-Za-z_]\w*(?:\.\w+)*|==|!=|>=|<=|:=|[()+\-*\/%<>=,\[\]?:]/gy; let at = 0; while (at < source.length) {
    pattern.lastIndex = at;
    const m = pattern.exec(source);
    if (!m)
        throw new PineError(`Karakter tidak didukung: ${source[at]}`);
    at = pattern.lastIndex;
    if (!m[0].trim())
        continue;
    tokens.push({ value: m[0], type: /^[\d.]/.test(m[0]) ? 'number' : /^["']/.test(m[0]) ? 'string' : 'token' });
} let p = 0; const node = (kind: string, props: Partial<Node> = {}): Node => ({ kind, id: ++nextNode, ...props }); const get = () => tokens[p]?.value; const consume = (s: string) => { if (get() !== s)
    throw new PineError(`Diharapkan '${s}', ditemukan '${get() ?? 'akhir baris'}'.`); p++; }; function parse(min = 0): Node { const t = tokens[p++]; if (!t)
    throw new PineError('Ekspresi belum lengkap.'); let left: Node; if (t.value === '(') {
    left = parse();
    consume(')');
}
else if (['-', '+', 'not'].includes(t.value))
    left = node('unary', { value: t.value, right: parse(7) });
else if (t.type === 'number')
    left = node('number', { value: Number(t.value) });
else if (t.type === 'string')
    left = node('string', { value: t.value.slice(1, -1) });
else if (/^[A-Za-z_]/.test(t.value)) {
    left = node('var', { value: t.value });
    if (get() === '(') {
        p++;
        const args: {
            name?: string;
            node: Node;
        }[] = [];
        if (get() !== ')') {
            do {
                let name: string | undefined;
                if (tokens[p + 1]?.value === '=') {
                    name = get();
                    p += 2;
                }
                args.push({ name, node: parse() });
                if (get() !== ',')
                    break;
                p++;
            } while (true);
        }
        consume(')');
        left = node('call', { value: t.value, args });
    }
}
else
    throw new PineError(`Token tidak didukung: ${t.value}`); while (get() === '[') {
    p++;
    const n = parse();
    consume(']');
    left = node('history', { left, right: n });
} while (get() && powers[get()] >= min) {
    const op = get();
    p++;
    left = node('binary', { value: op, left, right: parse(powers[op] + 1) });
} if (min === 0 && get() === '?') {
    p++;
    const yes = parse();
    consume(':');
    left = node('ternary', { left, right: yes, extra: parse() });
} return left; } const result = parse(); if (p !== tokens.length)
    throw new PineError(`Sintaks tidak didukung dekat '${get()}'.`); return result; }
const allowedCalls = new Set(['indicator', 'strategy', 'plot', 'hline', 'input.int', 'input.float', 'input.bool', 'input.string', 'ta.sma', 'ta.ema', 'ta.rma', 'ta.rsi', 'ta.atr', 'ta.highest', 'ta.lowest', 'ta.stdev', 'ta.crossover', 'ta.crossunder', 'math.abs', 'math.max', 'math.min', 'math.round', 'math.sqrt', 'na', 'nz', 'strategy.entry', 'strategy.exit', 'strategy.close', 'strategy.close_all']);
function validateNode(n: Node, line: number) { if (n.kind === 'call' && !allowedCalls.has(String(n.value)))
    throw new PineError(`Fungsi '${n.value}' belum didukung. request.*, loop, array, dan JavaScript bebas tidak tersedia.`, line); if (n.left)
    validateNode(n.left, line); if (n.right)
    validateNode(n.right, line); if (n.extra)
    validateNode(n.extra, line); n.args?.forEach(a => validateNode(a.node, line));
    if(n.kind==='call'){
        const names:Record<string,string[]>={indicator:['title','shorttitle','overlay'],strategy:['title','shorttitle','overlay'],plot:['series','title','color'],hline:['price','title','color'],'input.int':['defval','title','minval','maxval','step'],'input.float':['defval','title','minval','maxval','step'],'input.bool':['defval','title'],'input.string':['defval','title'],'strategy.entry':['id','direction','qty','limit','stop'],'strategy.exit':['id','from_entry','stop','limit'],'strategy.close':['id'],'strategy.close_all':[]};
        const list=names[String(n.value)];
        if(list)for(const arg of n.args??[])if(arg.name&&!list.includes(arg.name))throw new PineError(`Parameter '${arg.name}' pada ${n.value} belum didukung. Biaya/modal diatur pada panel akun/backtest.`,line);
        if(n.value==='strategy.entry'&&n.args?.some(a=>a.name==='limit')&&n.args.some(a=>a.name==='stop'))throw new PineError('Stop-limit gabungan belum didukung.',line);
    }
}
export function compilePine(source: string) { if (source.length > 24000)
    throw new PineError('Skrip maksimal 24 KB.'); if (!/^\s*\/\/@version=[56]\b/.test(source))
    throw new PineError('Gunakan //@version=5 atau //@version=6.'); nextNode = 0; const raw = source.split(/\r?\n/).map((line, i) => ({ text: line.trim(), indent: line.match(/^\s*/)?.[0].replace(/\t/g, '    ').length ?? 0, line: i + 1 })).filter(x => x.text && !x.text.startsWith('//')); let cursor = 0; function block(indent: number): Statement[] { const result: Statement[] = []; while (cursor < raw.length && raw[cursor].indent >= indent) {
    const item = raw[cursor];
    if (item.indent !== indent)
        throw new PineError('Indentasi blok tidak valid.', item.line);
    cursor++;
    let statement: Statement;
    try {
        if (item.text.startsWith('if ')) {
            const cond = expression(item.text.slice(3));
            if (!raw[cursor] || raw[cursor].indent <= indent)
                throw new PineError('Blok if membutuhkan baris terindentasi.');
            statement = { kind: 'if', line: item.line, node: cond, body: block(raw[cursor].indent) };
        }
        else {
            const assignment = item.text.match(/^(var\s+)?(?:(float|int|bool|string)\s+)?([A-Za-z_]\w*)\s*(?::=|=)\s*(.+)$/);
            if (assignment) {
                statement = { kind: 'assign', line: item.line, name: assignment[3], node: expression(assignment[4]), persistent: !!assignment[1] };
            }
            else
                statement = { kind: 'call', line: item.line, node: expression(item.text) };
        }
    }
    catch (e) {
        throw new PineError((e as Error).message, item.line);
    }
    validateNode(statement.node, item.line);
    result.push(statement);
} return result; } const statements = block(0); if (nextNode > 2000)
    throw new PineError('Skrip terlalu kompleks (maksimal 2.000 node).'); const declaration = statements.find(s => s.kind === 'call' && ['indicator', 'strategy'].includes(String(s.node.value))); if (!declaration)
    throw new PineError('Deklarasi indicator() atau strategy() diperlukan.'); return { statements, mode: declaration.node.value as 'indicator' | 'strategy' }; }
export type PineResult = {
    mode: string;
    plots: {
        name: string;
        color: string;
        overlay: boolean;
        values: {
            time: number;
            value: number;
        }[];
    }[];
    inputs: {
        name: string;
        value: string | number | boolean;
        type: string;
    }[];
    events: Event[];
    account: Account;
    stats: ReturnType<typeof report>;
    warnings: string[];
};
export function runPine(source: string, data: Dataset, knownIndex: number, config: Config = DEFAULT_CONFIG, overrides: Record<string, unknown> = {}, lot = .1, range?: {
    from: number;
    to: number;
}): PineResult {
    if(Object.keys(overrides).length>64||JSON.stringify(overrides).length>32000)throw new PineError('Input Pine terlalu besar.');
    for(const value of Object.values(overrides))if(typeof value==='string'&&value.length>256)throw new PineError('Input string maksimal 256 karakter.');
    const compiled = compilePine(source);
    const end = Math.min(knownIndex, data.candles.length - 1);
    if (end >= 5000)
        throw new PineError('Pine dibatasi 5.000 candle per eksekusi. Pilih dataset lebih pendek.');
    const histories: Record<string, unknown[]> = {}, cache = new Map<string, unknown>(), smooth = new Map<string, [
        number,
        number
    ]>();
    const events: Event[] = [], inputs: PineResult['inputs'] = [], plots: PineResult['plots'] = [], plotMap = new Map<number, PineResult['plots'][number]>();
    let activeLine = 1, ops = 0, current = 0, overlay = true, account = simulate(data, config, [], -1);
    const warnings = ['Pine 5/6 terbatas: entry/exit dieksekusi pada open candle berikutnya. SL lebih dahulu jika SL/TP tersentuh bersama. Tidak identik dengan TradingView.'];
    const arg = (n: Node, name: string, index: number) => n.args?.find(a => a.name === name)?.node ?? n.args?.filter(a => !a.name)[index]?.node;
    const evaluate = (n: Node, i: number): any => {
        if (++ops > 5000000)
            throw new PineError('Batas 5 juta operasi tercapai.', activeLine);
        if (i < 0)
            return NaN;
        if (cache.size > 100000 || Object.keys(histories).length > 64 || plots.length > 16)
            throw new PineError('Batas struktur memori Pine tercapai.', activeLine);
        const key = n.id + ':' + i;
        if (cache.has(key) && n.kind === 'call' && String(n.value).startsWith('ta.'))
            return cache.get(key);
        let v: any;
        const ev = (x?: Node, j = i) => x ? evaluate(x, j) : undefined;
        switch (n.kind) {
            case 'number':
            case 'string':
                v = n.value;
                break;
            case 'var': {
                const name = String(n.value);
                const bar = data.candles[i];
                if (name === 'time')
                    v = bar.time * 1000;
                else if (['open', 'high', 'low', 'close', 'volume'].includes(name))
                    v = bar[name as keyof typeof bar];
                else if (name === 'hl2')
                    v = (bar.high + bar.low) / 2;
                else if (name === 'hlc3')
                    v = (bar.high + bar.low + bar.close) / 3;
                else if (name === 'bar_index')
                    v = i;
                else if (name === 'true' || name === 'false')
                    v = name === 'true';
                else if (name === 'na')
                    v = NaN;
                else if (name === 'strategy.long' || name === 'strategy.short')
                    v = name.endsWith('long') ? 'buy' : 'sell';
                else if (name === 'strategy.position_size')
                    v = histories[name]?.[i] ?? 0;
                else if (name === 'strategy.equity')
                    v = histories[name]?.[i] ?? config.initial;
                else if (name.startsWith('color.'))
                    v = ({ teal: '#36d6b5', green: '#36d6b5', red: '#ef7c88', orange: '#eeb866', blue: '#76a5ff', purple: '#b294ff', white: '#dce8f3' } as Record<string, string>)[name.slice(6)] ?? '#76a5ff';
                else if (histories[name])
                    v = histories[name][i] ?? histories[name][i - 1] ?? NaN;
                else
                    throw new PineError(`Variabel '${name}' tidak dikenal.`, activeLine);
                break;
            }
            case 'history': {
                const back = ev(n.right);
                if (!Number.isInteger(back) || back < 0 || back > 5000)
                    throw new PineError('Referensi historis harus 0–5000; akses masa depan ditolak.', activeLine);
                v = ev(n.left, i - back);
                break;
            }
            case 'unary':
                v = n.value === 'not' ? !ev(n.right) : n.value === '-' ? -ev(n.right) : +ev(n.right);
                break;
            case 'binary': {
                const a = ev(n.left);
                if (n.value === 'and') {
                    v = !!a && !!ev(n.right);
                    break;
                }
                if (n.value === 'or') {
                    v = !!a || !!ev(n.right);
                    break;
                }
                const b = ev(n.right);
                if(['+','-','*','/','%'].includes(String(n.value))&&(typeof a!=='number'||typeof b!=='number'))throw new PineError('Operasi aritmetik hanya mendukung angka; penggandaan string ditolak.',activeLine);
                switch (n.value) {
                    case '+':
                        v = a + b;
                        break;
                    case '-':
                        v = a - b;
                        break;
                    case '*':
                        v = a * b;
                        break;
                    case '/':
                        v = a / b;
                        break;
                    case '%':
                        v = a % b;
                        break;
                    case '>':
                        v = a > b;
                        break;
                    case '<':
                        v = a < b;
                        break;
                    case '>=':
                        v = a >= b;
                        break;
                    case '<=':
                        v = a <= b;
                        break;
                    case '==':
                        v = a === b;
                        break;
                    case '!=': v = a !== b;
                }
                break;
            }
            case 'ternary':
                v = ev(n.left) ? ev(n.right) : ev(n.extra);
                break;
            case 'call': {
                const name = String(n.value), a = (pos: number, named = '') => ev(arg(n, named, pos)), sourceNode = arg(n, 'source', 0);
                if (name === 'indicator' || name === 'strategy') {
                    const ov = arg(n, 'overlay', 99);
                    overlay = ov ? !!ev(ov) : name === 'strategy';
                    v = 0;
                }
                else if (name.startsWith('input.')) {
                    const def = a(0, 'defval'), title = String(a(1, 'title') ?? `Input ${n.id}`);
                    v = overrides[title] ?? def;
                    const type = name.split('.')[1];
                    if (type === 'bool' && typeof v !== 'boolean')
                        throw new PineError('Input bool harus true/false.', activeLine);
                    if (type === 'int' || type === 'float') {
                        v = Number(v);
                        const min = a(99, 'minval'), max = a(99, 'maxval');
                        if (!Number.isFinite(v) || type === 'int' && !Number.isInteger(v) || min !== undefined && v < min || max !== undefined && v > max)
                            throw new PineError(`Input '${title}' tidak valid.`, activeLine);
                    }
                    if (!inputs.some(x => x.name === title))
                        inputs.push({ name: title, value: v, type });
                }
                else if (name === 'plot' || name === 'hline') {
                    let p = plotMap.get(n.id);
                    if (!p) {
                        p = { name: String(a(1, 'title') ?? `Plot ${plots.length + 1}`), color: String(a(2, 'color') ?? '#76a5ff'), overlay, values: [] };
                        plotMap.set(n.id, p);
                        plots.push(p);
                    }
                    const val = Number(a(0));
                    if (Number.isFinite(val) && p.values.length < 5000)
                        p.values.push({ time: data.candles[i].time, value: val });
                    v = val;
                }
                else if (name.startsWith('math.')) {
                    const values = n.args?.map(x => Number(ev(x.node))) ?? [];
                    const f = name.slice(5);
                    v = f === 'abs' ? Math.abs(values[0]) : f === 'round' ? Math.round(values[0]) : f === 'sqrt' ? Math.sqrt(values[0]) : f === 'max' ? Math.max(...values) : Math.min(...values);
                }
                else if (name === 'nz') {
                    const val = a(0);
                    v = Number.isNaN(val) || val === undefined ? (a(1) ?? 0) : val;
                }
                else if (name === 'na')
                    v = Number.isNaN(a(0));
                else if (name === 'ta.crossover' || name === 'ta.crossunder') {
                    const one = arg(n, 'source1', 0), two = arg(n, 'source2', 1);
                    v = name === 'ta.crossover' ? ev(one) > ev(two) && ev(one, i - 1) <= ev(two, i - 1) : ev(one) < ev(two) && ev(one, i - 1) >= ev(two, i - 1);
                }
                else if (name.startsWith('ta.')) {
                    const atr = name === 'ta.atr', length = Number(atr ? a(0, 'length') : a(1, 'length'));
                    if (!Number.isInteger(length) || length < 1 || length > 500)
                        throw new PineError('Panjang indikator harus 1–500.', activeLine);
                    const sample = (j: number) => { if (j < 0)
                        return NaN; if (atr) {
                        const b = data.candles[j], prev = data.candles[j - 1]?.close ?? b.close;
                        return Math.max(b.high - b.low, Math.abs(b.high - prev), Math.abs(b.low - prev));
                    } return Number(ev(sourceNode, j)); };
                    if (name === 'ta.ema') {
                        const prev = cache.get(n.id + ':' + (i - 1));
                        const val = sample(i);
                        v = Number.isFinite(prev as number) ? val * 2 / (length + 1) + Number(prev) * (1 - 2 / (length + 1)) : val;
                    }
                    else if (name === 'ta.rma' || atr) {
                        if (i < length - 1)
                            v = NaN;
                        else if (i === length - 1) {
                            v = Array.from({ length }, (_, k) => sample(i - k)).reduce((s, x) => s + x, 0) / length;
                        }
                        else
                            v = (Number(cache.get(n.id + ':' + (i - 1))) * (length - 1) + sample(i)) / length;
                    }
                    else if (name === 'ta.rsi') {
                        if (i < length)
                            v = NaN;
                        else {
                            let gain = 0, loss = 0;
                            if (i === length) {
                                for (let j = 1; j <= length; j++) {
                                    const diff = sample(j) - sample(j - 1);
                                    gain += Math.max(diff, 0) / length;
                                    loss += Math.max(-diff, 0) / length;
                                }
                            }
                            else {
                                const prev = smooth.get(n.id + ':' + (i - 1)) ?? [0, 0], diff = sample(i) - sample(i - 1);
                                gain = (prev[0] * (length - 1) + Math.max(diff, 0)) / length;
                                loss = (prev[1] * (length - 1) + Math.max(-diff, 0)) / length;
                            }
                            smooth.set(key, [gain, loss]);
                            v = loss === 0 ? gain === 0 ? 50 : 100 : 100 - 100 / (1 + gain / loss);
                        }
                    }
                    else {
                        const values = Array.from({ length: Math.min(i + 1, length) }, (_, k) => sample(i - k));
                        if (values.length < length || values.some(x => !Number.isFinite(x)))
                            v = NaN;
                        else {
                            const avg = values.reduce((s, x) => s + x, 0) / length;
                            v = name === 'ta.sma' ? avg : name === 'ta.highest' ? Math.max(...values) : name === 'ta.lowest' ? Math.min(...values) : Math.sqrt(values.reduce((s, x) => s + (x - avg) ** 2, 0) / length);
                        }
                    }
                    cache.set(key, v);
                }
                else if (name.startsWith('strategy.')) {
                    if (compiled.mode !== 'strategy')
                        throw new PineError('Perintah strategi hanya boleh dalam strategy().', activeLine);
                    const bar = data.candles[i];
                    if (i === current && i < end && (!range || bar.time >= range.from && bar.time <= range.to)) {
                        const index = i + 1;
                        const id = String(a(0, 'id') ?? 'entry');
                        if (name === 'strategy.entry') {
                            const side = a(1, 'direction');
                            if (side !== 'buy' && side !== 'sell')
                                throw new PineError('Gunakan strategy.long atau strategy.short.', activeLine);
                            if (!account.positions.some(p => p.side === side) && !account.pending.length) {
                                if (account.positions.length)
                                    events.push({ index, phase: 'open', kind: 'close' });
                                const limit = a(99, 'limit'), stop = a(99, 'stop');
                                events.push({ index, phase: 'open', kind: 'order', order: { id, side, lot: Number(a(99, 'qty') ?? lot), type: limit !== undefined ? 'limit' : stop !== undefined ? 'stop' : 'market', price: limit ?? stop } });
                            }
                        }
                        else if (name === 'strategy.close_all')
                            events.push({ index, phase: 'open', kind: 'close' });
                        else if (name === 'strategy.close')
                            events.push({ index, phase: 'open', kind: 'close', id });
                        else if (name === 'strategy.exit') {
                            if (arg(n, 'profit', 99) || arg(n, 'loss', 99) || arg(n, 'trail_points', 99))
                                throw new PineError('strategy.exit mendukung stop dan limit absolut saja.', activeLine);
                            const from = String(a(99, 'from_entry') ?? id), sl = a(99, 'stop'), tp = a(99, 'limit');
                            events.push({ index, phase: 'open', kind: 'modify', id: from, sl, tp });
                        }
                    }
                    v = 0;
                }
                break;
            }
        }
        return v;
    };
    const execute = (statements: Statement[], i: number) => { for (const statement of statements) {
        activeLine = statement.line;
        if (statement.kind === 'if') {
            if (evaluate(statement.node, i))
                execute(statement.body!, i);
        }
        else if (statement.kind === 'assign') {
            const history = histories[statement.name!] ?? (histories[statement.name!] = []);
            history[i] = statement.persistent && i > 0 ? history[i - 1] : evaluate(statement.node, i);
        }
        else
            evaluate(statement.node, i);
    } };
    for (let i = 0; i <= end; i++) {
        current = i;
        account = simulate(data, config, events.filter(e => e.index === i), i, account, i);
        (histories['strategy.position_size'] ??= [])[i] = account.positions.reduce((s,p)=>s+(p.side==='buy'?1:-1)*p.lot,0);
        (histories['strategy.equity'] ??= [])[i] = account.curve.at(-1)?.equity ?? config.initial;
        execute(compiled.statements, i);
    }
    return { mode: compiled.mode, plots, inputs, events, account, stats: report(account, config), warnings };
}
export const INDICATOR_EXAMPLE = `//@version=6\nindicator("Dua EMA", overlay=true)\nfast = input.int(12, "EMA cepat", minval=1, maxval=500)\nslow = input.int(26, "EMA lambat", minval=1, maxval=500)\nemaFast = ta.ema(close, fast)\nemaSlow = ta.ema(close, slow)\nplot(emaFast, "EMA cepat", color.teal)\nplot(emaSlow, "EMA lambat", color.orange)`;
export const STRATEGY_EXAMPLE = `//@version=6\nstrategy("Persilangan EMA", overlay=true)\nfast = input.int(12, "EMA cepat", minval=1, maxval=500)\nslow = input.int(26, "EMA lambat", minval=1, maxval=500)\na = ta.ema(close, fast)\nb = ta.ema(close, slow)\nplot(a, "EMA cepat", color.teal)\nplot(b, "EMA lambat", color.orange)\nif ta.crossover(a, b)\n    strategy.entry("Long", strategy.long)\nif ta.crossunder(a, b)\n    strategy.entry("Short", strategy.short)`;
