import test from 'node:test';
import assert from 'node:assert/strict';
import { TIMEFRAMES, chartTimeframes, canAggregate, timeframeBucket, timeframeLabel, timeframeDescription, timeframeFromFilename } from '../lib/timeframes.ts';
import { aggregate, alignPlot, sampleDataset, parseMT5, inspectFile } from '../lib/engine.ts';

const at = date => Date.parse(date) / 1000;
const candle = (time, value, volume = 10) => ({ time, open: value, high: value + 1, low: value - .5, close: value + .5, volume, spread: volume });

test('all requested chart timeframes are available from M1, with readable labels', () => {
    assert.deepEqual(TIMEFRAMES.map(t => t.label), ['M1', 'M2', 'M3', 'M5', 'M10', 'M15', 'M30', 'H1', 'H2', 'H4', 'D1', 'W1']);
    assert.ok(chartTimeframes(1).every(t => t.available));
    assert.equal(timeframeLabel(120), 'H2');
    assert.equal(timeframeLabel(1440), 'D1');
    assert.equal(timeframeLabel(10080), 'W1');
    assert.equal(timeframeDescription(10080), '1 minggu');
});

test('larger or incompatible source bars cannot invent smaller chart candles', () => {
    const choices = new Map(chartTimeframes(5).map(t => [t.label, t.available]));
    for (const label of ['M1', 'M2', 'M3']) assert.equal(choices.get(label), false);
    for (const label of ['M5', 'M10', 'M15', 'M30', 'H1', 'H2', 'H4', 'D1', 'W1']) assert.equal(choices.get(label), true);
    assert.equal(canAggregate(2, 3), false);
    assert.equal(canAggregate(2, 5), false);
    assert.equal(canAggregate(3, 10), false);
    assert.equal(canAggregate(3, 15), true);
    assert.equal(canAggregate(0, 5), false);
    assert.equal(canAggregate(1, Infinity), false);
    assert.equal(canAggregate(1, 1.5), false);
    assert.ok(chartTimeframes(7).some(t => t.minutes === 7 && t.available));
});

test('M1 to M2 preserves OHLC, volume, spread and a partial last candle without future data', () => {
    const start = at('2026-09-07T00:00:00Z');
    const source = Array.from({ length: 6 }, (_, i) => candle(start + i * 60, i + 10, i + 1));
    source[5].high = 999;
    const result = aggregate(source, 1, 2, 4);
    assert.equal(result.length, 3);
    assert.deepEqual(result[0], { time: start, open: 10, high: 12, low: 9.5, close: 11.5, volume: 3, spread: 2 });
    assert.deepEqual(result[2], { ...source[4], time: start + 240 });
    assert.ok(result.every(bar => bar.high < 999));
});

test('daily aggregation uses midnight UTC and only candles already replayed', () => {
    const first = at('2026-09-12T23:59:00Z');
    const source = [candle(first, 10), candle(first + 60, 20), candle(first + 120, 999)];
    const result = aggregate(source, 1, 1440, 1);
    assert.deepEqual(result.map(bar => bar.time), [at('2026-09-12T00:00:00Z'), at('2026-09-13T00:00:00Z')]);
    assert.equal(result[1].high, 21);
});

test('weekly candles split at Monday midnight UTC instead of the Unix epoch Thursday', () => {
    const start = at('2026-09-13T23:58:00Z');
    const source = Array.from({ length: 5 }, (_, i) => candle(start + i * 60, 10 + i, 1));
    source[4].high = 999;
    const prefix = aggregate(source, 1, 10080, 1);
    assert.equal(prefix.length, 1);
    assert.equal(prefix[0].time, at('2026-09-07T00:00:00Z'));
    const result = aggregate(source, 1, 10080, 3);
    assert.deepEqual(result.map(bar => bar.time), [at('2026-09-07T00:00:00Z'), at('2026-09-14T00:00:00Z')]);
    assert.equal(result[1].open, 12);
    assert.equal(result[1].close, 13.5);
    assert.equal(result[1].high, 14);
    assert.equal(result[1].volume, 2);
    assert.equal(timeframeBucket(source[3].time, 10080), result[1].time);
});

test('weekly indicator points align with weekly candles and exclude future values', () => {
    const sunday = at('2026-09-13T23:59:00Z');
    const points = [{ time: sunday, value: 10 }, { time: sunday + 60, value: 20 }, { time: sunday + 120, value: 999 }];
    assert.deepEqual(alignPlot(points, 1, 10080, sunday + 60), [
        { time: at('2026-09-07T00:00:00Z'), value: 10 },
        { time: at('2026-09-14T00:00:00Z'), value: 20 },
    ]);
});

test('native W1 CSV import preserves the broker timestamps when viewed on W1', () => {
    const text = 'DATE,TIME,OPEN,HIGH,LOW,CLOSE,TICKVOL\n2026.09.07,00:00,10,11,9,10.5,100\n2026.09.14,00:00,10.5,12,10,11,200';
    const parsed = parseMT5(text, { minutes: 10080, timezone: 'UTC+02:00', duplicate: 'reject', mapping: inspectFile(text).mapping });
    assert.equal(parsed.issues.length, 0);
    assert.equal(parsed.gaps, 0);
    assert.equal(parsed.candles[0].time, at('2026-09-06T22:00:00Z'));
    assert.deepEqual(aggregate(parsed.candles, 10080, 10080, 1), parsed.candles);
});

test('the new M1 demonstration is deterministic, explicitly synthetic, and covers two UTC weeks', () => {
    const data = sampleDataset(1);
    assert.equal(data.minutes, 1);
    assert.equal(data.sample, true);
    assert.equal(data.candles.length, 14400);
    assert.equal(data.candles[1].time - data.candles[0].time, 60);
    assert.deepEqual(data.candles.slice(0, 10), sampleDataset(1).candles.slice(0, 10));
    assert.equal(aggregate(data.candles, 1, 10080, data.candles.length - 1).length, 2);
    const original = sampleDataset();
    assert.equal(original.minutes, 5);
    assert.equal(original.id, 'sample-eurusd');
    assert.equal(original.candles.length, 720);
    assert.equal(original.candles[0].close, 1.08397);
});

test('filename timeframe detection distinguishes M1 from M15 and avoids ambiguous guesses', () => {
    assert.equal(timeframeFromFilename('EURUSD_M1_2026.csv'), 1);
    assert.equal(timeframeFromFilename('EURUSD_M15_2026.csv'), 15);
    assert.equal(timeframeFromFilename('gold-H2.tsv'), 120);
    assert.equal(timeframeFromFilename('EURUSD_W1.csv'), 10080);
    assert.equal(timeframeFromFilename('EURUSD_M1_M5.csv'), undefined);
    assert.equal(timeframeFromFilename('candles.csv'), undefined);
});
