export interface WaitOptions {
    token?: string;
    after?: string;
    timeoutSeconds?: number;
}
export interface AgentLogin {
    userCode: string;
    verificationUrl: string;
    deviceCode: string;
    expiresAt: string;
    interval: number;
    instructions: string;
}
export type AgentToken =
    | { status: 'pending'; interval: number }
    | { status: 'approved'; apiKey: string; mcp: { url: string; header: string }; next: string };
export interface AgentTrial {
    trialKey: string;
    expiresAt: string;
    limits: string;
    claim: { userCode: string; claimUrl: string; deviceCode: string; humanNotified: boolean };
    instructions: string;
}
export interface EmailInbox {
    id: string;
    address: string;
    expiresAt: string;
    persistent: boolean;
    managementToken?: string;
    messageCount?: number;
    messageLimit?: number;
}
export interface EmailMessage {
    id: string;
    receivedAt: string;
    from: string;
    to: string;
    subject: string;
    text: string;
    html?: string;
    codes: string[];
    links: { url: string; kind: 'verification' | 'other' }[];
    attachments: { filename: string; mimeType: string; size: number }[];
}
export interface MemoryEntry<T = unknown> {
    namespace: string;
    key: string;
    value: T;
    bytes: number;
    expiresAt?: string;
}
export interface MonitorInput {
    kind: 'http' | 'ssl' | 'heartbeat';
    name: string;
    target?: string;
    intervalSeconds?: number;
    graceSeconds?: number;
    expectStatus?: number;
    expectText?: string;
    sslDays?: number;
    alertWebhook?: string;
}
export interface Monitor extends MonitorInput {
    id: string;
    status: 'pending' | 'up' | 'down';
    paused: boolean;
    failures: number;
    createdAt: string;
    nextRunAt: string;
    lastCheckAt?: string;
    lastPingAt?: string;
    lastMessage?: string;
    pingUrl?: string;
    events?: { at: string; status: string; message: string }[];
}
export interface ApprovalInput {
    question: string;
    details?: string;
    options?: string[];
    timeoutMinutes?: number;
}
export interface Approval {
    id: string;
    agentName: string;
    question: string;
    details?: string;
    options: string[];
    status: 'pending' | 'answered' | 'expired';
    answer?: string;
    note?: string;
    createdAt: string;
    expiresAt: string;
    answeredAt?: string;
    answerUrl: string;
    emailed?: boolean;
    next?: string;
}
