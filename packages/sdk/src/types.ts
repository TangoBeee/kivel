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
    expiresAt: string | null;
    persistent: boolean;
    status?: 'active' | 'paused';
    forwardingUrl?: string | null;
    managementToken?: string;
    messageCount?: number;
    messageLimit?: number;
}
export interface EmailInboxSettings {
    activeDays?: number | undefined;
    localPart?: string | undefined;
}
export interface SocketEventSource {
    kind: 'webhook' | 'email' | 'approval' | 'job' | 'sms';
    id: string;
    token?: string;
    after?: string;
}
export interface SocketEvent {
    kind: SocketEventSource['kind'];
    id: string;
    cursor: string;
    requests?: import('./index.js').CapturedRequest[];
    messages?: EmailMessage[];
    approval?: Approval;
    deliveries?: {
        id: string;
        at: string;
        deliveryId: string;
        attempt: number;
        status: number | null;
        error?: string;
    }[];
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
    attachments: { id?: string; filename: string; mimeType: string; size: number }[];
    direction?: 'inbound' | 'outbound';
    deliveryStatus?: 'pending' | 'sent';
    messageId?: string;
    inReplyTo?: string;
    references?: string[];
}
export interface SendEmailInput {
    to: string[];
    subject: string;
    text?: string | undefined;
    html?: string | undefined;
    replyTo?: string | undefined;
    idempotencyKey: string;
}
export interface MemoryEntry<T = unknown> {
    namespace: string;
    key: string;
    value: T;
    bytes: number;
    expiresAt?: string;
}
export interface MonitorInput {
    kind: 'http' | 'ssl' | 'heartbeat' | 'dns';
    name: string;
    target?: string;
    intervalSeconds?: number;
    graceSeconds?: number;
    expectStatus?: number;
    expectText?: string;
    sslDays?: number;
    dnsRecordType?: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS' | 'CAA';
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
    lastDurationMs?: number;
    recentChecks?: { at: string; status: string; durationMs: number }[];
    dnsBaseline?: string[];
    lastDnsAnswers?: string[];
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

export interface Authenticator {
    id: string;
    name: string;
    issuer: string;
    accountName: string;
    algorithm: 'SHA1' | 'SHA256' | 'SHA512';
    digits: 6 | 7 | 8;
    period: 30 | 60;
    createdAt: string;
}
export interface AuthenticatorInput {
    name: string;
    uri?: string;
    secret?: string;
    imageBase64?: string;
    algorithm?: 'SHA1' | 'SHA256' | 'SHA512';
    digits?: 6 | 7 | 8;
    period?: 30 | 60;
}
export interface TotpCode {
    id: string;
    code: string;
    secondsRemaining: number;
    expiresAt: string;
    nextCode?: string;
}
export interface EmailAttachmentLink {
    filename: string;
    size: number;
    expiresAt: string;
    downloadUrl: string;
}
