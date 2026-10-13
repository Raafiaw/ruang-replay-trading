import { runPine } from './pine.ts';
self.onmessage = (event) => { try {
    const { source, data, knownIndex, config, inputs, lot, range } = event.data;
    const result = runPine(source, data, knownIndex, config, inputs, lot, range);
    self.postMessage({ ok: true, result });
}
catch (e) {
    self.postMessage({ ok: false, error: (e as Error).message, line: (e as {
            line?: number;
        }).line ?? 1 });
} };
