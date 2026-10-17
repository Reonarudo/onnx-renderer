import { parentPort, workerData } from 'node:worker_threads';
import { ELK } from './elk.js';
import { loadNetron } from './netron.js';
import { renderModel } from './render.js';
import { ENGINE, FAILED, HEADER, LENGTH, READY, STARTED } from './protocol.js';
const { buffer } = workerData;
const state = new Int32Array(buffer, 0, HEADER / 4);
const bytes = new Uint8Array(buffer, HEADER);
function write(text) {
    const encoded = new TextEncoder().encode(text);
    if (encoded.length > bytes.length)
        throw new RangeError('reply exceeds the shared buffer');
    bytes.set(encoded);
    Atomics.store(state, LENGTH, encoded.length);
    return encoded.length;
}
function reply(result) {
    try {
        write(JSON.stringify(result));
    }
    catch {
        write(JSON.stringify({ status: 'failure', message: 'The graph is too large to return.' }));
    }
    Atomics.store(state, READY, 1);
    Atomics.notify(state, READY);
}
const WARM_UP = '<ir_version: 8, opset_import: ["" : 17]>\nwarm (float[1] x) => (float[1] y) { y = Relu (x) }';
async function start() {
    const netron = await loadNetron();
    const elk = new ELK();
    const layout = (graph) => elk.layout(graph);
    const render = async ({ source, direction, nodes, outputBytes }) => {
        const result = await renderModel(source, netron, layout, direction, nodes);
        if (result.status === 'success' && Buffer.byteLength(result.output) > outputBytes) {
            return { status: 'failure', message: `The drawing exceeds the ${outputBytes}-byte output limit.` };
        }
        return result;
    };
    // The first layout in a fresh worker costs a few hundred milliseconds of warm-up that must not
    // be charged to an author's budget, so it is spent here, before this worker reports ready.
    const warm = await render({ source: WARM_UP, direction: 'down', nodes: Infinity, outputBytes: Infinity });
    if (warm.status !== 'success')
        throw new Error('the warm-up graph did not draw');
    return render;
}
start().then((render) => {
    parentPort.on('message', (request) => {
        render(request).then(reply, () => {
            // An unexpected error may leave the reader or ELK in a bad state; the host discards this worker.
            reply({ status: 'failure', message: 'The ONNX renderer stopped unexpectedly.', discard: true });
        });
    });
    Atomics.store(state, ENGINE, STARTED);
    Atomics.notify(state, ENGINE);
    parentPort.postMessage('started');
}, () => {
    // The error would name vendor paths on this machine; the reason stays plain and path-free.
    write('the ONNX layout engine could not start');
    Atomics.store(state, ENGINE, FAILED);
    Atomics.notify(state, ENGINE);
    parentPort.postMessage('failed');
});
