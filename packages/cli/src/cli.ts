#!/usr/bin/env node
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { SocketHelp, SocketError } from '@socket-help/sdk';
import { command, needsInput as commandNeedsInput } from './commands.js';
import { listen } from './listen.js';
import type { ListenOptions } from './listen.js';
try {
    const args = process.argv.slice(2);
    const needsInput = commandNeedsInput(args);
    const chunks: Buffer[] = [];
    let size = 0;
    if (needsInput && !process.stdin.isTTY)
        for await (const chunk of process.stdin) {
            size += chunk.length;
            if (size > 10 * 1024 * 1024) throw new Error('Input exceeds 10 MiB.');
            chunks.push(Buffer.from(chunk));
        }
    const client = new SocketHelp({
        ...(process.env.SOCKET_HELP_URL ? { baseUrl: process.env.SOCKET_HELP_URL } : {}),
        ...(process.env.SOCKET_HELP_API_KEY ? { apiKey: process.env.SOCKET_HELP_API_KEY } : {}),
        timeoutMs: 90000,
    });
    if (args[0] === 'listen' && args[1]) {
        const options: ListenOptions = {};
        for (let index = 2; index < args.length; index++) {
            const flag = args[index]!;
            if (flag === '--all') options.all = true;
            else if (flag === '--token' && args[index + 1]) options.token = args[++index]!;
            else if (flag === '--forward' && args[index + 1]) options.forward = args[++index]!;
            else throw new Error(`Unknown option: ${flag}`);
        }
        const stop = new AbortController();
        process.once('SIGINT', () => {
            stop.abort();
            process.exit(0);
        });
        await listen(
            client,
            args[1],
            options,
            (line) => process.stdout.write(`${JSON.stringify(line)}\n`),
            stop.signal,
        );
        process.exit(0);
    }
    if (args[0] === 'download' && args.length === 2 && process.env.SOCKET_HELP_ACCESS_TOKEN)
        args.push('--access-token', process.env.SOCKET_HELP_ACCESS_TOKEN);
    const result = await command(client, args, Buffer.concat(chunks));
    if (!args.length || ['--help', 'help'].includes(args[0]!))
        process.stdout.write(`${(result as { help: string }).help}\n`);
    else if (args.length === 1 && args[0] === '--version')
        process.stdout.write(`${(result as { version: string }).version}\n`);
    else if (result instanceof Uint8Array) process.stdout.write(result);
    else if (result !== undefined) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
    process.stderr.write(
        `${JSON.stringify({ error: error instanceof Error ? error.message : 'Command failed.', ...(error instanceof SocketError ? { status: error.status, requestId: error.requestId, retryAfter: error.retryAfter, requiredPlan: error.requiredPlan, upgradeUrl: error.upgradeUrl } : {}) })}\n`,
    );
    process.exitCode = 1;
}
