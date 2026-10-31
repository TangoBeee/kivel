export function deliveryFeedback(parsed, envelopeFrom) {
    for (const attachment of parsed.attachments ?? []) {
        const type = attachment.mimeType?.toLowerCase();
        const report = new TextDecoder()
            .decode(attachment.content ?? new Uint8Array())
            .slice(0, 65536);
        const recipient = /(?:Final|Original)-Recipient:\s*rfc822;\s*([^\s<>]+)/i.exec(report)?.[1];
        if (
            type === 'message/delivery-status' &&
            !envelopeFrom &&
            /(?:^|\n)Status:\s*5\./i.test(report) &&
            recipient
        )
            return { type: 'bounce', recipient };
        if (
            type === 'message/feedback-report' &&
            /(?:^|\n)Feedback-Type:\s*abuse\b/i.test(report) &&
            recipient
        )
            return { type: 'complaint-review', recipient };
    }
    return undefined;
}
