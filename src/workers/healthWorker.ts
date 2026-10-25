/// <reference lib="webworker" />
import { Unzip, UnzipInflate } from 'fflate';
import { HealthXmlParser } from '../lib/healthParser';
import type { HealthWorkerMessage, HealthWorkerRequest } from '../lib/healthTypes';

const post = (m: HealthWorkerMessage): void => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

self.onmessage = async (ev: MessageEvent<HealthWorkerRequest>) => {
  const { file, sinceDays } = ev.data;
  const parser = new HealthXmlParser(sinceDays);
  const decoder = new TextDecoder();
  try {
    const isZip = /\.zip$/i.test(file.name) || (await sniffZip(file));
    const reader = file.stream().getReader();
    let read = 0;
    let found = !isZip;

    let unzip: Unzip | null = null;
    if (isZip) {
      unzip = new Unzip();
      unzip.register(UnzipInflate);
      unzip.onfile = (entry) => {
        // English exports name it export.xml, Norwegian ones eksport.xml.
        if (!/(^|\/)(export|eksport)\.xml$/i.test(entry.name)) return;
        found = true;
        entry.ondata = (err, chunk, final) => {
          if (err) throw err;
          parser.push(decoder.decode(chunk, { stream: !final }));
        };
        entry.start();
      };
    }

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      read += value.byteLength;
      if (unzip) unzip.push(value);
      else parser.push(decoder.decode(value, { stream: true }));
      post({ type: 'progress', bytes: read, total: file.size });
    }
    if (unzip) unzip.push(new Uint8Array(0), true);
    else parser.push(decoder.decode());

    if (!found) throw new Error('Fant ikke export.xml i zip-filen.');
    const result = parser.finish();
    post({ type: 'done', days: result.days, workouts: result.workouts });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};

async function sniffZip(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  return head[0] === 0x50 && head[1] === 0x4b;
}
