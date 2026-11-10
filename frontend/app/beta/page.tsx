import Link from 'next/link';
import { ReadingLayout } from '../../components/content-layout';
import { pageMetadata } from '../../lib/seo';
import { supportEmail, supportHref } from '../../lib/support';
export const metadata = pageMetadata(
    'Free open beta: what to expect',
    'Try Kivel during the free open beta. Learn about available tools, account and API limits, data retention, planned features, feedback and support.',
    '/beta/',
);
export default function Beta() {
    return (
        <ReadingLayout
            title="Useful now. Improving with your feedback."
            description="Use the available tools, try the APIs, and tell us what gets in your way. No card is required for the free beta."
            path="/beta/"
            sections={[
                { id: 'access', title: 'What is available' },
                { id: 'limits', title: 'Limits & data retention' },
                { id: 'payments', title: 'No automatic charges' },
                { id: 'feedback', title: 'Feedback & support' },
            ]}
        >
            <section id="access">
                <h2>Use the tools that are available today</h2>
                <p>
                    Kivel is an online toolbox for HTTP debugging, mock APIs, file sharing, data
                    utilities, media processing and agent integrations. Available tools have working
                    interfaces and documented limits. Features labelled Coming soon are a roadmap,
                    not part of the current service.
                </p>
                <p>
                    Many browser tools need no account. A Free account provides a workspace, API
                    keys and resource management. Hosted interfaces include HTTP, the TypeScript
                    SDK, CLI and MCP. SSH access depends on the operator enabling the separate
                    command gateway. Start in the <Link href="/catalog/">catalog</Link> or{' '}
                    <Link href="/docs/quickstart/">API quickstart</Link>.
                </p>
            </section>
            <section id="limits">
                <h2>Expect limits and keep your own copies</h2>
                <p>
                    Hosted runs, active resources, storage, request rates and retention are bounded.
                    See the <Link href="/plans/">current allowances</Link> and each tool’s guide.
                    Anonymous users on the same internet connection share limits. Browser-local
                    processing does not consume a hosted run; completed API scenario reports count
                    once even when assertions fail.
                </p>
                <p>
                    Resources expire automatically, and expired content cannot be recovered. Beta
                    features can change, fail, or be temporarily unavailable. Use synthetic data for
                    testing and keep important files elsewhere. We do not provide an uptime
                    guarantee. The <Link href="/privacy/">privacy policy</Link> explains processing,
                    sharing and storage.
                </p>
            </section>
            <section id="payments">
                <h2>No payment method and no automatic conversion</h2>
                <p>
                    Anonymous and Free beta access require no payment method. Paid checkout is
                    closed during the free beta. Pro and Team are planned monthly subscriptions,
                    shown as a preview. If paid subscriptions become available, purchasing will be a
                    separate, explicit action with the price and billing period shown before
                    confirmation.
                </p>
            </section>
            <section id="feedback">
                <h2>Help us improve the release</h2>
                <p>
                    Send feedback or report a problem to <a href={supportHref}>{supportEmail}</a>.
                    Include the tool name, a small synthetic example, expected and observed
                    behavior, and any request ID. Redact personal information and credentials from
                    screenshots. <Link href="/contact/">Contact and support</Link> has the details;
                    do not email passwords or API keys.
                </p>
            </section>
        </ReadingLayout>
    );
}
