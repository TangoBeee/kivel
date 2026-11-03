import Link from 'next/link';
import { AuthenticatorWorkbench } from './authenticator-workbench';
import { WebSocketWorkbench } from './websocket-workbench';
import { OAuthWorkbench } from './oauth-workbench';
import { ScheduledJobWorkbench } from './scheduled-job-workbench';
import { SmtpWorkbench } from './smtp-workbench';
import { MemoryWorkbench } from './memory-workbench';
import { MonitorWorkbench } from './monitor-workbench';
import { StatusPageWorkbench } from './status-page-workbench';
import { LlmWorkbench } from './llm-workbench';
import { ApiScenarioWorkbench } from './api-scenario-workbench';
import { AudioComposer } from './audio-composer';
import { MusicLibrary } from './music-library';
import { BrowserWorkbench } from './browser-workbench';
import { BrowserOperation } from './browser-operation';
import { ResourceWorkbench } from './resource-workbench';
import WebhookWorkbench from './webhook-workbench';
import { McpConnect } from './mcp-connect';
import { EmailInboxWorkbench } from './email-inbox-workbench';
import { ToolHeader } from './tool-header';
import { mediaOperations } from '@socket-help/tools/media-definitions';
import type { MediaOperationId } from '@socket-help/tools/media-definitions';
import { networkOperations } from '@socket-help/tools/network-definitions';
import type { NetworkOperationId } from '@socket-help/tools/network-definitions';
import { browserOperations } from '../lib/browser-tool-definitions';
import type { BrowserOperationId } from '../lib/browser-tool-definitions';
import {
    catalog,
    categories,
    fileToolIds,
    monitorToolIds,
    memoryToolIds,
    scheduledToolIds,
} from '../lib/catalog';

/** The working part of a tool: the same screen on its public page and inside the dashboard. */
export function ToolWorkbench({ toolId }: { toolId: string }) {
    const tool = catalog.find((entry) => entry.id === toolId)!;
    return tool.id === 'agents-agent-authenticator' ? (
        <AuthenticatorWorkbench toolId={tool.id} />
    ) : tool.status === 'coming-soon' ? (
        <div className="page-width work-page">
            <ToolHeader toolId={tool.id}>
                <span className="badge">Coming soon</span>
            </ToolHeader>
            <p className="tool-notice">This tool is planned. It is not available yet.</p>
            <Link className="text-link" href={`/catalog/${tool.categoryId}/`}>
                Explore {categories.find((category) => category.id === tool.categoryId)?.name}
            </Link>
        </div>
    ) : tool.id === 'mock-apis-mock-websocket-server' ? (
        <WebSocketWorkbench toolId={tool.id} />
    ) : tool.id === 'mock-apis-mock-oauth-provider' ? (
        <OAuthWorkbench toolId={tool.id} />
    ) : tool.id === 'email-mock-smtp' ? (
        <SmtpWorkbench toolId={tool.id} />
    ) : tool.id === 'monitoring-public-status-page' ? (
        <StatusPageWorkbench toolId={tool.id} />
    ) : [
          'agents-mock-llm-endpoint',
          'agents-mock-agents-llms',
          'agents-llm-streaming-simulator',
      ].includes(tool.id) ? (
        <LlmWorkbench toolId={tool.id} />
    ) : scheduledToolIds.includes(tool.id) ? (
        <ScheduledJobWorkbench toolId={tool.id} />
    ) : memoryToolIds.includes(tool.id) ? (
        <MemoryWorkbench toolId={tool.id} />
    ) : monitorToolIds.includes(tool.id) ? (
        <MonitorWorkbench toolId={tool.id} />
    ) : tool.id === 'mock-apis-api-test-scenarios' ? (
        <ApiScenarioWorkbench />
    ) : ['test-media-audio-composer', 'test-media-sample-audio'].includes(tool.id) ? (
        <AudioComposer toolId={tool.id} />
    ) : tool.id === 'test-media-music-library' ? (
        <MusicLibrary />
    ) : ['email-temporary-email-inbox', 'email-email-webhook-forwarding'].includes(tool.id) ? (
        <EmailInboxWorkbench toolId={tool.id} />
    ) : tool.id === 'agents-socket-help-mcp' ? (
        <McpConnect />
    ) : ['webhooks', 'domains-temporary-callback-url', 'network-request-forwarding'].includes(
          tool.id,
      ) ? (
        <WebhookWorkbench toolId={tool.id} />
    ) : Object.hasOwn(networkOperations, tool.id) || Object.hasOwn(mediaOperations, tool.id) ? (
        <BrowserOperation key={tool.id} toolId={tool.id as NetworkOperationId | MediaOperationId} />
    ) : Object.hasOwn(browserOperations, tool.id) ? (
        <BrowserOperation key={tool.id} toolId={tool.id as BrowserOperationId} />
    ) : tool.local ? (
        <BrowserWorkbench toolId={tool.id} />
    ) : (
        <ResourceWorkbench
            key={tool.id}
            toolId={tool.id}
            kind={
                fileToolIds.includes(tool.id)
                    ? 'file'
                    : ['agents-mock-mcp-server', 'agents-tool-failure-simulator'].includes(tool.id)
                      ? 'mcp'
                      : 'mock'
            }
        />
    );
}
