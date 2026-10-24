import { Worker } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import type { ToolId as BrowserToolId } from './engine.js';
import type { MediaOperationId } from './media-definitions.js';
type ToolId = BrowserToolId | MediaOperationId;
export type ToolInputFile = { name: string; bytes: Uint8Array };
import type { OperationOptions } from './definitions.js';
export class ToolExecutionError extends Error {
    constructor(
        message: string,
        public code: 'invalid_input' | 'timeout' | 'busy' | 'cancelled' = 'invalid_input',
    ) {
        super(message);
    }
}
interface Task {
    id: string;
    toolId: ToolId;
    input: string;
    options: OperationOptions;
    file?: ToolInputFile | ToolInputFile[];
    resolve: (value: string) => void;
    reject: (error: Error) => void;
    signal?: AbortSignal;
    abort?: () => void;
}
export class ToolRunner {
    private queue: Task[] = [];
    private active = new Map<Worker, { task: Task; timer: ReturnType<typeof setTimeout> }>();
    private closed = false;
    private terminating = 0;
    constructor(
        private concurrency = 2,
        private queueLimit = 16,
        private timeoutMs = 3000,
    ) {}
    run(
        toolId: ToolId,
        input: string,
        options: OperationOptions = {},
        file?: ToolInputFile | ToolInputFile[],
        signal?: AbortSignal,
    ): Promise<string> {
        if (this.closed)
            return Promise.reject(new ToolExecutionError('Processor is shutting down.', 'busy'));
        if (signal?.aborted)
            return Promise.reject(new ToolExecutionError('Request cancelled.', 'cancelled'));
        if (
            this.queue.length + this.active.size + this.terminating >=
            this.queueLimit + this.concurrency
        )
            return Promise.reject(
                new ToolExecutionError('Tool processors are busy. Try again shortly.', 'busy'),
            );
        return new Promise((resolve, reject) => {
            const task: Task = {
                id: randomUUID(),
                toolId,
                input,
                options,
                resolve,
                reject,
                ...(file ? { file } : {}),
                ...(signal ? { signal } : {}),
            };
            task.abort = () => {
                const queued = this.queue.indexOf(task);
                if (queued >= 0) {
                    this.queue.splice(queued, 1);
                    this.finish(task, new ToolExecutionError('Request cancelled.', 'cancelled'));
                } else
                    for (const [worker, running] of this.active)
                        if (running.task === task)
                            this.stop(
                                worker,
                                new ToolExecutionError('Request cancelled.', 'cancelled'),
                            );
            };
            signal?.addEventListener('abort', task.abort, { once: true });
            this.queue.push(task);
            this.drain();
        });
    }
    private finish(task: Task, error?: Error, output = '') {
        if (task.abort) task.signal?.removeEventListener('abort', task.abort);
        if (error) task.reject(error);
        else task.resolve(output);
    }
    private drain() {
        while (
            !this.closed &&
            this.active.size + this.terminating < this.concurrency &&
            this.queue.length
        ) {
            const task = this.queue.shift()!;
            if (task.signal?.aborted) {
                this.finish(task, new ToolExecutionError('Request cancelled.', 'cancelled'));
                continue;
            }
            const worker = new Worker(new URL('./node-worker.js', import.meta.url), {
                execArgv: [],
                resourceLimits: {
                    maxOldGenerationSizeMb: [
                        'everyday-extract-pdf-text',
                        'everyday-pdf-to-image',
                    ].includes(task.toolId)
                        ? 128
                        : 64,
                    stackSizeMb: 4,
                },
            });
            const timer = setTimeout(
                () =>
                    this.stop(
                        worker,
                        new ToolExecutionError(
                            'Tool exceeded its processing time limit.',
                            'timeout',
                        ),
                    ),
                this.timeoutMs,
            );
            this.active.set(worker, { task, timer });
            worker.once('message', (message: { id: string; output?: string; error?: string }) => {
                if (message.id !== task.id)
                    return this.stop(worker, new ToolExecutionError('Invalid processor response.'));
                this.stop(
                    worker,
                    message.error ? new ToolExecutionError(message.error) : undefined,
                    message.output ?? '',
                );
            });
            worker.once('error', () =>
                this.stop(
                    worker,
                    new ToolExecutionError('Tool exceeded its memory limit or failed to start.'),
                ),
            );
            worker.once('exit', () => {
                if (this.active.has(worker))
                    this.stop(
                        worker,
                        new ToolExecutionError('Tool processor stopped unexpectedly.'),
                    );
            });
            worker.postMessage({
                id: task.id,
                toolId: task.toolId,
                input: task.input,
                options: task.options,
                ...(task.file ? { file: task.file } : {}),
            });
        }
    }
    private stop(worker: Worker, error?: Error, output = '') {
        const running = this.active.get(worker);
        if (!running) return;
        this.active.delete(worker);
        clearTimeout(running.timer);
        this.terminating++;
        void worker.terminate().finally(() => {
            this.terminating--;
            this.drain();
        });
        this.finish(running.task, error, output);
    }
    async close() {
        this.closed = true;
        for (const task of this.queue.splice(0))
            this.finish(task, new ToolExecutionError('Processor is shutting down.', 'cancelled'));
        const workers = [...this.active.keys()];
        for (const worker of workers)
            this.stop(worker, new ToolExecutionError('Processor is shutting down.', 'cancelled'));
        await Promise.all(workers.map((worker) => worker.terminate()));
    }
}
