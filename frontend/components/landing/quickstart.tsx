'use client';

import { Tabs } from '@radix-ui/themes';
import { CopyButton } from '../copy-button';

export function Quickstart({ origin }: { origin: string }) {
    const samples = [
        {
            label: 'MCP config',
            filename: 'mcp.json',
            code: JSON.stringify(
                {
                    mcpServers: {
                        kivel: {
                            type: 'http',
                            url: `${origin}/mcp`,
                            headers: { Authorization: 'Bearer YOUR_KIVEL_API_KEY' },
                        },
                    },
                },
                null,
                2,
            ),
            note: 'Call create_email_inbox. Use its address to receive a code, then pass its id to wait_for_email and read messages[0].codes.',
        },
        {
            label: 'TypeScript',
            filename: 'inbox.ts',
            code: `import { Kivel } from '@kivel.io/sdk';

const kivel = new Kivel({ apiKey: process.env.KIVEL_API_KEY });
const inbox = await kivel.createEmailInbox();
console.log(inbox.address);

// Send a code to the address above, then wait for it.
const { messages } = await kivel.waitForEmail(inbox.id);
console.log(messages[0]?.codes[0]);`,
        },
        {
            label: 'curl',
            filename: 'terminal',
            code: `INBOX=$(curl -fsS -X POST ${origin}/api/email-inboxes \\
  -H "Authorization: Bearer $KIVEL_API_KEY" \\
  -H "Content-Type: application/json" -d '{}')
echo "$INBOX" | jq -r .address
ID=$(echo "$INBOX" | jq -r .id)

# Send a code to the address above, then run this.
curl -fsS "${origin}/api/email-inboxes/$ID/wait" \\
  -H "Authorization: Bearer $KIVEL_API_KEY" \\
  | jq -r '.messages[0].codes[0] // empty'`,
        },
    ];
    return (
        <Tabs.Root defaultValue={samples[0]!.label} className="landing-quickstart">
            <Tabs.List aria-label="Inbox quickstart examples">
                {samples.map(({ label }) => (
                    <Tabs.Trigger key={label} value={label}>
                        {label}
                    </Tabs.Trigger>
                ))}
            </Tabs.List>
            {samples.map(({ label, filename, code, note }) => (
                <Tabs.Content key={label} value={label}>
                    <div className="landing-code-heading">
                        <span>{filename}</span>
                        <CopyButton text={code} label={`Copy ${label}`} compact />
                    </div>
                    <pre tabIndex={0}>
                        <code>{code}</code>
                    </pre>
                    {note && <p className="landing-code-note">{note}</p>}
                </Tabs.Content>
            ))}
        </Tabs.Root>
    );
}
