import Link from 'next/link';
import { ReadingLayout } from '../../components/content-layout';
import { pageMetadata } from '../../lib/seo';
import { supportEmail, supportHref } from '../../lib/support';
export const metadata = pageMetadata(
    'Contact & support',
    'Contact Kivel support for tool problems, account recovery, billing questions, privacy requests and abuse reports. Find what to include and what to keep private.',
    '/contact/',
);
export default function Contact() {
    return (
        <ReadingLayout
            title="A direct line to Kivel."
            description="Questions, something broken, or feedback from the beta? Email us and include enough context to reproduce the problem."
            path="/contact/"
            sections={[
                { id: 'email', title: 'Email support' },
                { id: 'report', title: 'Report a problem' },
                { id: 'security', title: 'Security & privacy' },
                { id: 'billing', title: 'Billing & refunds' },
            ]}
        >
            <section id="email">
                <h2>Email support</h2>
                <p>
                    For help with Kivel, contact <a href={supportHref}>{supportEmail}</a>. This is
                    the support and contact address for the service. Support is handled by email; we
                    do not promise a round-the-clock response or a guaranteed response time during
                    the open beta.
                </p>
                <p>
                    You can use the free tools without buying a subscription. Read{' '}
                    <Link href="/beta/">what to expect during beta</Link> and check the{' '}
                    <Link href="/docs/">documentation</Link> for interface setup and limits.
                </p>
            </section>
            <section id="report">
                <h2>Help us reproduce the problem</h2>
                <p>
                    Include the tool name or page URL, what you expected, what happened, and the
                    approximate time with your time zone. If an error shows a request ID, include
                    it. A browser/OS version, screenshot with private details removed, and a small
                    synthetic input are useful.
                </p>
                <p>
                    Do not email passwords, API keys, access or management tokens, card details, or
                    real customer files. Remove credentials from URLs, headers, screenshots and
                    exported configurations before sharing them. We will not ask you to send your
                    password.
                </p>
            </section>
            <section id="security">
                <h2>Security, abuse and privacy requests</h2>
                <p>
                    Use the same email address with a subject such as Security report, Abuse report,
                    or Privacy request. For an access-control issue, describe the affected endpoint
                    and steps using your own test accounts. Do not access or send another person’s
                    private data to demonstrate a report.
                </p>
                <p>
                    For an account or deletion request, email from the address associated with the
                    account. We may ask for additional verification before discussing private
                    account information. Resource IDs help locate a resource; its credentials should
                    remain private. See the <Link href="/privacy/">privacy policy</Link> for storage
                    and expiry.
                </p>
            </section>
            <section id="billing">
                <h2>Billing and refund questions</h2>
                <p>
                    The free open beta requires no payment method. If paid subscriptions are enabled
                    later, include your receipt or payment reference and workspace name for billing
                    help. Do not include full card numbers or bank credentials. The{' '}
                    <Link href="/refunds/">refund and cancellation policy</Link> explains the
                    seven-day first-payment window and how billing errors are handled.
                </p>
            </section>
        </ReadingLayout>
    );
}
