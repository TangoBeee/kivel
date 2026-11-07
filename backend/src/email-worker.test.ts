import assert from 'node:assert/strict';
import { test } from 'node:test';
import PostalMime from 'postal-mime';
// The Cloudflare worker deliberately ships plain JavaScript.
// @ts-expect-error worker module has no TypeScript declaration
import { deliveryFeedback } from '../../deploy/email-worker/src/feedback.js';

test('real MIME delivery reports extract only permanent failures and ARF complaints', async () => {
    const mime = (type: string, report: string) =>
        `From: postmaster@example.com\r\nTo: bounces@example.com\r\nSubject: Delivery report\r\nMIME-Version: 1.0\r\nContent-Type: multipart/report; report-type=${type === 'message/delivery-status' ? 'delivery-status' : 'feedback-report'}; boundary="report"\r\n\r\n--report\r\nContent-Type: text/plain\r\n\r\nReport attached.\r\n--report\r\nContent-Type: ${type}\r\nContent-Disposition: attachment\r\n\r\n${report}\r\n--report--\r\n`;
    const report =
        'Reporting-MTA: dns; mx.example.com\r\n\r\nFinal-Recipient: rfc822; receiver@example.com\r\nAction: failed\r\nStatus: 5.1.1\r\n';
    const bounce = await PostalMime.parse(mime('message/delivery-status', report));
    assert.deepEqual(deliveryFeedback(bounce, ''), {
        type: 'bounce',
        recipient: 'receiver@example.com',
    });
    assert.equal(deliveryFeedback(bounce, 'sender@example.com'), undefined);
    assert.equal(
        deliveryFeedback(
            await PostalMime.parse(
                mime('message/delivery-status', report.replace('5.1.1', '4.2.0')),
            ),
            '',
        ),
        undefined,
    );
    const complaint = await PostalMime.parse(
        mime(
            'message/feedback-report',
            'Feedback-Type: abuse\r\nOriginal-Recipient: rfc822; receiver@example.com\r\n',
        ),
    );
    assert.deepEqual(deliveryFeedback(complaint, 'feedback@example.com'), {
        type: 'complaint-review',
        recipient: 'receiver@example.com',
    });
});

test('the email worker preserves the envelope sender independently of a forged header From', async (t) => {
    // @ts-expect-error worker module has no TypeScript declaration
    const { createEmailWorker } = await import('../../deploy/email-worker/src/handler.js');
    let delivered: Record<string, unknown> | undefined;
    t.mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => {
        delivered = JSON.parse(String(options.body));
        return new Response(JSON.stringify({ stored: false }), { status: 202 });
    });
    const raw =
        'From: Trusted <trusted@example.com>\r\nTo: inbox@example.test\r\nSubject: Forged sender\r\n\r\nMessage';
    const worker = createEmailWorker((input: ArrayBuffer) => PostalMime.parse(input));
    await worker.email(
        {
            from: 'attacker@other.test',
            to: 'inbox@example.test',
            rawSize: Buffer.byteLength(raw),
            raw: new Response(raw).body,
            setReject: (reason: string) => assert.fail(reason),
        },
        {
            INGEST_URL: 'https://socket.example/hooks/email',
            EMAIL_INGEST_SECRET: 'test-worker-secret',
        },
    );
    assert.equal(delivered?.mailFrom, 'attacker@other.test');
    assert.equal(delivered?.from, 'Trusted <trusted@example.com>');
});
