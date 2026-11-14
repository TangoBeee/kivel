export interface EmailFilters {
    from?: string | undefined;
    mailFrom?: string | undefined;
    subject?: string | undefined;
    text?: string | undefined;
    hasCode?: boolean | undefined;
    hasLink?: boolean | undefined;
    hasAttachment?: boolean | undefined;
    read?: boolean | undefined;
    label?: string | undefined;
}
export interface EmailSearchOptions extends EmailFilters {
    token?: string | undefined;
    cursor?: string | undefined;
    limit?: number | undefined;
}
export interface EmailWaitOptions extends WaitOptions, EmailFilters {
    cursor?: string | undefined;
    limit?: number | undefined;
    checkpoint?: boolean | undefined;
}
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
export interface EmailDelivery {
    messageId: string;
    pending: boolean;
    attempts: { at: string; status?: number; error?: string }[];
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
    mailFrom?: string;
    to: string;
    cc?: string[];
    subject: string;
    text: string;
    html?: string;
    codes: string[];
    links: { url: string; kind: 'verification' | 'other' }[];
    attachments: { id?: string; filename: string; mimeType: string; size: number }[];
    direction?: 'inbound' | 'outbound';
    deliveryStatus?: 'pending' | 'sent';
    read?: boolean;
    labels?: string[];
    messageId?: string;
    inReplyTo?: string;
    references?: string[];
}
export type EmailMessageUpdate = Pick<EmailMessage, 'read' | 'labels'>;
export interface EmailContent {
    to: string[];
    cc?: string[];
    subject: string;
    text?: string | undefined;
    html?: string | undefined;
    replyTo?: string | undefined;
}
export interface SendEmailInput extends EmailContent {
    idempotencyKey: string;
}
export interface EmailThreadSummary {
    id: string;
    inboxId: string;
    subject: string;
    lastAt: string;
    from: string;
    messageCount: number;
    unread?: boolean;
    hasCode?: boolean;
    hasLink?: boolean;
    hasAttachment?: boolean;
    labels?: string[];
}
export interface EmailThread extends EmailThreadSummary {
    messages: EmailMessage[];
}
export interface EmailThreadsPage {
    threads: EmailThreadSummary[];
    nextCursor: string | null;
}
export interface EmailDraft {
    id: string;
    inboxId: string;
    subject: string;
    status:
        | 'draft'
        | 'awaitingApproval'
        | 'scheduled'
        | 'completed'
        | 'failed'
        | 'rejected'
        | 'expired';
    sendAt: string | null;
    expiresAt: string;
    approvalId?: string;
    approvalExpiresAt?: string;
    answerUrl?: string;
    events: { id: string; at: string; attempt: number; status: number | null; error?: string }[];
}
export interface EmailRules {
    requireApproval: boolean;
    inboundAllow: string[];
    inboundBlock: string[];
    outboundAllow: string[];
    outboundBlock: string[];
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

export type OAuthScenario =
    | 'none'
    | 'access_denied'
    | 'invalid_grant'
    | 'expired_code'
    | 'wrong_redirect_uri'
    | 'invalid_pkce_verifier'
    | 'expired_tokens'
    | 'slow_token_endpoint'
    | 'rotated_signing_key';
export interface OAuthProviderInput {
    name: string;
    redirectUris: string[];
    users: { sub: string; email: string; name: string; claims?: Record<string, unknown> }[];
    claims?: Record<string, unknown>;
    headless?: boolean;
    scenario?: OAuthScenario;
}
export interface OAuthProvider {
    id: string;
    issuer: string;
    endpointUrl: string;
    discoveryUrl: string;
    client_id: string;
    expiresAt: string;
    oauth: OAuthProviderInput;
}
export interface CreatedOAuthProvider extends OAuthProvider {
    client_secret: string;
}

export interface Credential {
    id: string;
    name: string;
    url: string;
    username: string;
    agentMayRead: boolean;
    authenticatorId?: string;
    inboxId?: string;
    createdAt: string;
    updatedAt: string;
}
export interface CredentialInput {
    name: string;
    url: string;
    username: string;
    password?: string;
    passwordLength?: number;
    notes?: string;
    agentMayRead?: boolean;
    authenticatorId?: string | null;
    inboxId?: string | null;
}
export type CredentialReveal =
    | { status: 'awaitingApproval'; approvalId: string; answerUrl: string }
    | { status: 'revealed'; id: string; password: string; notes: string };

export type TestPaymentKind = 'wallet' | 'paywall' | 'checkout';
export type CheckoutOutcome =
    'succeeded' | 'declined' | 'insufficient_funds' | 'requires_verification' | 'expired';
export interface TestTransaction {
    id: string;
    at: string;
    kind: 'payment' | 'topup';
    amount: number;
    payee: string;
    memo: string;
    status: 'awaitingApproval' | 'authorized' | 'succeeded' | 'refused' | 'expired';
    reason?: string;
    approvalId?: string;
    events: { at: string; status: string; reason?: string }[];
}
export interface TestPaymentResource {
    id: string;
    kind: TestPaymentKind;
    testMode: true;
    name: string;
    expiresAt: string;
    endpointUrl?: string;
    balance?: number;
    availableBalance?: number;
    reservedBalance?: number;
    perPaymentLimit?: number;
    dailyLimit?: number;
    approvalThreshold?: number;
    amount?: number;
    currency?: string;
    item?: string;
    description?: string;
    modes?: ('wallet' | 'permissive')[];
    response?: { status: number; body: unknown };
    successUrl?: string;
    cancelUrl?: string;
    webhookUrl?: string;
    attempts?: {
        id: string;
        at: string;
        outcome: CheckoutOutcome;
        last4?: string;
        verified?: boolean;
    }[];
    deliveries?: {
        requestId: string;
        at: string;
        attempts: number;
        status?: number;
        error?: string;
    }[];
}

export interface TestWalletInput {
    name: string;
    balance?: number;
    availableBalance?: number;
    reservedBalance?: number;
    ttlSeconds?: number;
    persistent?: boolean;
    /** Only an owner/admin browser session can set spending controls. Agent keys omit them. */
    perPaymentLimit?: number;
    dailyLimit?: number;
    approvalThreshold?: number;
}
export interface TestPaywallInput {
    name: string;
    amount: number;
    description?: string;
    modes?: ('wallet' | 'permissive')[];
    response?: { status: number; body: unknown };
    ttlSeconds?: number;
    persistent?: boolean;
}
export interface TestCheckoutInput {
    name: string;
    item: string;
    description?: string;
    amount: number;
    currency?: 'USD' | 'EUR' | 'GBP' | 'CAD' | 'AUD';
    successUrl?: string;
    cancelUrl?: string;
    webhookUrl?: string;
    ttlSeconds?: number;
    persistent?: boolean;
}
export interface TestPaymentInput {
    payee: string;
    amount?: number;
    memo?: string;
    idempotencyKey: string;
    authorizeOnly?: boolean;
}
export interface TestPaymentResult {
    testMode: true;
    status: 'awaitingApproval' | 'authorized' | 'succeeded';
    transaction?: TestTransaction;
    transactionId?: string;
    approvalId?: string;
    answerUrl?: string;
    paymentHeader?: string;
    headerName?: 'X-PAYMENT';
    expiresAt?: string;
    content?: unknown;
    checkout?: TestCheckoutAttempt;
}
export interface TestCheckoutAttempt {
    testMode: true;
    id: string;
    at: string;
    outcome: CheckoutOutcome;
    last4?: string;
    verified?: boolean;
    confirmationToken?: string;
}
