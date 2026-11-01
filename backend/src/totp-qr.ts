import { Worker } from 'node:worker_threads';
import { HttpError } from './errors.js';

const decoder = `
const { parentPort, workerData } = require('node:worker_threads');
const load = require('node:module').createRequire(workerData.moduleUrl);
try {
    const bytes = Buffer.from(workerData.bytes);
    let image;
    if (bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
        if (bytes.length < 24 || !bytes.readUInt32BE(16) || !bytes.readUInt32BE(20) || bytes.readUInt32BE(16) * bytes.readUInt32BE(20) > 1048576) throw new Error();
        image = load('pngjs').PNG.sync.read(bytes);
    } else image = load('jpeg-js').decode(bytes, { useTArray: true, maxResolutionInMP: 1, maxMemoryUsageInMB: 32 });
    const decoded = load('jsqr')(new Uint8ClampedArray(image.data), image.width, image.height, { inversionAttempts: 'attemptBoth' });
    parentPort.postMessage({ text: decoded && decoded.data });
} catch { parentPort.postMessage({}); }
`;
let active = 0;
export async function decodeTotpQr(input: unknown): Promise<string> {
    if (typeof input !== 'string' || input.length > 1400000)
        throw new HttpError(400, 'imageBase64 must contain a PNG or JPEG of at most 1 MiB.');
    const bytes = Buffer.from(input, 'base64');
    if (!bytes.length || bytes.length > 1048576 || bytes.toString('base64') !== input)
        throw new HttpError(
            400,
            'imageBase64 must be canonical Base64 for a PNG or JPEG of at most 1 MiB.',
        );
    if (active >= 2) throw new HttpError(503, 'QR decoders are busy. Try again shortly.', 2);
    active++;
    try {
        return await new Promise<string>((resolve, reject) => {
            const worker = new Worker(decoder, {
                eval: true,
                execArgv: [],
                workerData: { bytes, moduleUrl: import.meta.url },
                resourceLimits: { maxOldGenerationSizeMb: 96 },
            });
            const timer = setTimeout(() => {
                void worker.terminate();
                reject(new HttpError(400, 'QR decoding timed out. Use a smaller, clear image.'));
            }, 5000);
            worker.once('message', (result: { text?: string }) => {
                clearTimeout(timer);
                void worker.terminate();
                result.text
                    ? resolve(result.text)
                    : reject(
                          new HttpError(
                              400,
                              'No readable TOTP QR code. Use a PNG or JPEG up to one million pixels.',
                          ),
                      );
            });
            worker.once('error', () => {
                clearTimeout(timer);
                reject(new HttpError(400, 'Unable to decode this QR image.'));
            });
            worker.once('exit', (code) => {
                clearTimeout(timer);
                if (code !== 0) reject(new HttpError(400, 'Unable to decode this QR image.'));
            });
        });
    } finally {
        active--;
    }
}
