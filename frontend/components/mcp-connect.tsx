'use client';
import { useEffect, useState } from 'react';
import { ToolHeader } from './tool-header';
import { CopyButton } from './copy-button';
import { ApiExample } from './api-example';
export function McpConnect() {
    const [origin, setOrigin] = useState('');
    useEffect(() => setOrigin(window.location.origin), []);
    const url = origin ? `${origin}/mcp` : '';
    return (
        <div className="page-width work-page">
            <ToolHeader toolId="agents-socket-help-mcp">
                <span className="badge badge-green">Streamable HTTP</span>
            </ToolHeader>
            <section className="resource-result">
                <div className="resource-result-heading">
                    <strong>MCP endpoint</strong>
                </div>
                <div className="resource-link">
                    <code>{url || 'Loading this instance…'}</code>
                    <CopyButton text={url} label="Copy endpoint" />
                </div>
                <p>
                    Add this URL to a client that supports Streamable HTTP MCP. No account is
                    required. All HTTP API quotas and expiry limits apply.
                </p>
            </section>
            <section className="resource-editor">
                <h2>Connect and test</h2>
                <p className="tool-notice">
                    The server supports protocol versions 2025-11-25, 2025-06-18, and 2025-03-26. It
                    returns JSON over POST; SSE streams and persistent transport sessions are not
                    used.
                </p>
                <ApiExample
                    code={`curl -X POST ${url || 'https://kivel.io/mcp'} \\\n  -H 'Content-Type: application/json' \\\n  -H 'Accept: application/json, text/event-stream' \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"my-client","version":"1.0"}}}'`}
                />
                <p className="tool-notice">
                    Call tools/list to discover the available tools. Agents can create, inspect, and
                    delete webhook inboxes, mock APIs, and file shares. MCP uploads support 64 KiB;
                    use the HTTP API for files up to 10 MiB. Keep returned tokens private and review
                    destructive tool calls in your client.
                </p>
            </section>
        </div>
    );
}
