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
