import { HttpError } from './errors.js';
import type { EmailMessage } from './email.js';

export const emailAddressPattern =
    /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]{1,64}@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/;
const address = (value: string) =>
    (/<([^<>]+)>\s*$/.exec(value)?.[1] ?? value).trim().toLowerCase();

export const emailApprovalRequired =
    'This inbox requires human approval. Create a draft and submit it for approval.';

export interface EmailRules {
    requireApproval: boolean;
    inboundAllow: string[];
    inboundBlock: string[];
    outboundAllow: string[];
    outboundBlock: string[];
}
export const emptyEmailRules: EmailRules = {
    requireApproval: false,
    inboundAllow: [],
    inboundBlock: [],
    outboundAllow: [],
    outboundBlock: [],
};
export function emailRules(value: unknown, limit: number): EmailRules {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new HttpError(400, 'Provide an object with address lists.');
    const rules = { ...emptyEmailRules };
    for (const [key, list] of Object.entries(value)) {
        if (key === 'requireApproval') {
            if (typeof list !== 'boolean')
                throw new HttpError(400, 'requireApproval must be true or false.');
            rules.requireApproval = list;
            continue;
        }
        if (!Object.hasOwn(rules, key) || !Array.isArray(list) || list.length > limit)
            throw new HttpError(400, `Use up to ${limit} addresses or domains per list.`);
        rules[key as Exclude<keyof EmailRules, 'requireApproval'>] = [
            ...new Set(
                list.map((item: unknown) => {
                    if (typeof item !== 'string' || item.length > 254)
                        throw new HttpError(400, 'Provide plain email addresses or exact domains.');
                    const rule = item.trim().toLowerCase();
                    if (!emailAddressPattern.test(rule.includes('@') ? rule : `x@${rule}`))
                        throw new HttpError(400, 'Provide plain email addresses or exact domains.');
                    return rule;
                }),
            ),
        ];
    }
    return rules;
}

export function emailAllowed(
    value: string,
    rules: EmailRules | undefined,
    direction: 'inbound' | 'outbound',
) {
    if (!rules) return true;
    const mailbox = address(value);
    const domain = mailbox.split('@')[1];
    const matches = (rule: string) =>
        emailAddressPattern.test(mailbox) &&
        (rule.includes('@') ? rule === mailbox : rule === domain);
    return (
        !rules[`${direction}Block`].some(matches) &&
        (!rules[`${direction}Allow`].length || rules[`${direction}Allow`].some(matches))
    );
}

export function inboundEmailAllowed(from: string, mailFrom: string, rules: EmailRules | undefined) {
    if (rules?.inboundAllow.length && !mailFrom) return false;
    return [from, mailFrom]
        .filter(Boolean)
        .every((sender) => emailAllowed(sender, rules, 'inbound'));
}

function subject(value: string) {
    return value
        .replace(/^(?:\s*(?:re|fw|fwd)\s*:\s*)+/i, '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

export type ThreadMessage = Partial<Pick<EmailMessage, 'codes' | 'links' | 'attachments'>> & {
    hasCode?: boolean;
    hasLink?: boolean;
    hasAttachment?: boolean;
} & Pick<
        EmailMessage,
        | 'id'
        | 'receivedAt'
        | 'from'
        | 'to'
        | 'cc'
        | 'subject'
        | 'direction'
        | 'messageId'
        | 'inReplyTo'
        | 'references'
        | 'read'
        | 'labels'
    >;

export function groupEmailThreads<T extends ThreadMessage>(messages: T[], inboxId: string) {
    const ordered = [...messages].sort(
        (a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.id.localeCompare(b.id),
    );
    const parent = ordered.map((_, index) => index);
    function root(index: number): number {
        while (parent[index] !== index) index = parent[index]!;
        return index;
    }
    function merge(a: number, b: number) {
        a = root(a);
        b = root(b);
        parent[Math.max(a, b)] = Math.min(a, b);
    }
    const headerIndex = new Map<string, number>();
    const fallback = new Map<string, number>();
    ordered.forEach((message, index) => {
        const aliases =
            message.direction === 'outbound'
                ? Array.from(
                      { length: message.to.split(',').length + (message.cc?.length ?? 0) },
                      (_, recipient) => `<${message.id}.${recipient}@socketspace.xyz>`,
                  )
                : [];
        const keys = [
            ...aliases,
            message.messageId,
            message.inReplyTo,
            ...(message.references ?? []),
        ];
        for (const id of keys) {
            if (!id) continue;
            const previous = headerIndex.get(id);
            if (previous === undefined) headerIndex.set(id, index);
            else merge(index, previous);
        }
    });
    ordered.forEach((message, index) => {
        const people = [
            ...new Set(
                [message.from, ...message.to.split(','), ...(message.cc ?? [])]
                    .map(address)
                    .filter((item) => emailAddressPattern.test(item)),
            ),
        ].sort();
        const normalized = subject(message.subject);
        if (!normalized || people.length < 2) return;
        const key = JSON.stringify([normalized, people]);
        const previous = fallback.get(key);
        if (previous === undefined) fallback.set(key, index);
        else if (!message.inReplyTo && !message.references?.length && root(index) === index)
            merge(previous, index);
    });
    const grouped = new Map<number, T[]>();
    ordered.forEach((message, index) => {
        const first = root(index);
        const items = grouped.get(first) ?? [];
        items.push(message);
        grouped.set(first, items);
    });
    return [...grouped.values()].map((items) => {
        const first = items[0]!;
        const latest = items.at(-1)!;
        return {
            id: first.id,
            inboxId,
            subject: first.subject,
            lastAt: latest.receivedAt,
            from: latest.from,
            messageCount: items.length,
            unread: items.some((item) => item.direction !== 'outbound' && !item.read),
            hasCode: items.some((item) => item.hasCode || item.codes?.length),
            hasLink: items.some((item) => item.hasLink || item.links?.length),
            hasAttachment: items.some((item) => item.hasAttachment || item.attachments?.length),
            labels: [...new Set(items.flatMap((item) => item.labels ?? []))].slice(0, 10),
            messages: items,
        };
    });
}

export function pageEmailThreads(
    threads: ReturnType<typeof groupEmailThreads>,
    query: { cursor?: string; limit?: string },
) {
    const limit = query.limit === undefined ? 20 : Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50)
        throw new HttpError(400, 'Choose a page size from 1 to 50.');
    const key = (thread: { lastAt: string; id: string }) => `${thread.lastAt}:${thread.id}`;
    const cursor =
        typeof query.cursor === 'string' && query.cursor.length <= 100
            ? Buffer.from(query.cursor, 'base64url').toString()
            : '';
    if (query.cursor !== undefined && !/^\d{4}-\d{2}-\d{2}T[\d:.]+Z:[0-9a-f-]{36}$/i.test(cursor))
        throw new HttpError(400, 'Use a cursor returned by the thread list.');
    const selected = threads
        .filter((thread) => !cursor || key(thread) < cursor)
        .sort((a, b) => key(b).localeCompare(key(a)))
        .slice(0, limit + 1);
    return {
        threads: selected.slice(0, limit).map(({ messages: _, ...thread }) => thread),
        nextCursor:
            selected.length > limit
                ? Buffer.from(key(selected[limit - 1]!)).toString('base64url')
                : null,
    };
}
