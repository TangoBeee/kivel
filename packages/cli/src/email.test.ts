import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Kivel } from '@kivel.io/sdk';
import { command } from './commands.js';
import { needsInput } from './agent-commands.js';

test('email commands inspect, update and filter messages through the SDK', async () => {
    const messages = '/api/email-inboxes/inbox/messages';
    const calls: [string, string, string | undefined][] = [];
    const client = new Kivel({
        fetch: async (url, options) => {
            const path = new URL(String(url));
            calls.push([
                options!.method!,
                path.pathname + path.search,
                options!.body as string | undefined,
            ]);
            return Response.json({ id: 'message-id' });
        },
    });
    const update = ['email', 'message-update', 'inbox', 'message-id'];
    assert.equal(needsInput(update), true);
    await command(client, ['email', 'message', 'inbox', 'message-id']);
    await command(client, update, new TextEncoder().encode('{"read":true,"labels":["Work"]}'));
    await command(client, ['email', 'messages', 'inbox', '--read', 'true', '--label', 'Work']);
    assert.deepEqual(calls, [
        ['GET', `${messages}/message-id`, undefined],
        ['PATCH', `${messages}/message-id`, '{"read":true,"labels":["Work"]}'],
        ['GET', `${messages}?read=true&label=Work`, undefined],
    ]);
});
