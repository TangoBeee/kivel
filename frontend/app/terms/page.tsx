import Link from 'next/link';
import { supportEmail, supportHref, policyUpdated } from '../../lib/support';
import { ReadingLayout } from '../../components/content-layout';
import { pageMetadata } from '../../lib/seo';
export const metadata = pageMetadata(
    'Terms of use',
    'Read the socket.help terms for tool and API use, acceptable behavior, your content, temporary resource expiry, service availability, and liability.',
    '/terms/',
);
const sections = [
    { id: 'using', title: 'Using the tools' },
    { id: 'acceptable-use', title: 'Acceptable use' },
    { id: 'content', title: 'Your content' },
    { id: 'billing', title: 'Subscriptions & refunds' },
    { id: 'contact', title: 'Contact & support' },
    { id: 'availability', title: 'Availability' },
    { id: 'liability', title: 'Liability' },
    { id: 'changes', title: 'Changes to these terms' },
];
export default function Terms() {
    return (
        <ReadingLayout
            meta={`Updated ${policyUpdated}`}
            title="Terms of use, in plain words."
            description="These terms cover the tools, hosted interfaces, and temporary resources. By using socket.help, you agree to them."
            path="/terms/"
            sections={sections}
        >
            <aside className="reading-summary">
                <strong>Use responsibly. Keep a backup.</strong>
                <p>
                    The tools are for useful tasks and development workflows. Resource lifetimes and
                    published limits apply across every hosted interface.
                </p>
            </aside>
            <section id="using">
                <h2>Using the tools</h2>
                <p>
                    You may use socket.help and its HTTP API from a browser, a script, a CI job, or
                    an AI agent, within the <Link href="/plans/">published allowances</Link>.
                    Available tools have an anonymous allowance. Creating an account gives access to
                    a workspace and its plan limits.
                </p>
                <p>
                    Keep your credentials secure. Use only resources and workspaces you are
                    authorized to access. The <Link href="/privacy/">privacy page</Link> explains
                    processing, storage, and cleanup.
                </p>
            </section>
            <section id="acceptable-use">
                <h2>What you must not do</h2>
                <p>
                    Do not use socket.help to break the law, collect data from people without their
                    agreement, distribute malware, send spam, or host phishing pages. Do not bypass
                    rate limits, overload the service, or access data that is not yours.
                </p>
                <p>
                    We may block traffic or remove resources that break these rules, without notice.
                </p>
            </section>
            <section id="content">
                <h2>Your content stays yours</h2>
                <p>
                    You keep ownership of content you submit. We process and store it to provide the
                    tools as described on the privacy page. Resource contents become inaccessible on
                    expiry or deletion; live expired records are removed during cleanup.
                </p>
                <p>
                    Resources start with a one-hour lifetime. Plan settings can allow longer
                    retention or persistent leases. Request bodies and query parameters may be
                    stored as received by tools with capture history. The HTTP echo tool does not
                    retain request history. Use sample data and avoid submitting secrets or personal
                    information that your workflow does not require.
                </p>
            </section>
            <section id="billing">
                <h2>Subscriptions and refunds</h2>
                <p>
                    The open beta offers free Anonymous and Free access with no payment method. Beta
                    accounts are not automatically converted to paid subscriptions. Pro and Team are
                    planned monthly plans. When checkout is enabled, the price, currency and
                    recurring billing period are shown before you authorize payment through Dodo
                    Payments.
                </p>
                <p>
                    Future subscriptions renew monthly until cancelled. Workspace owners can cancel
                    through the billing portal. Cancelling stops future renewals; a scheduled
                    cancellation retains access until the paid period ends. A request to cancel is
                    separate from a request for a refund.
                </p>
                <p>
                    You can request a refund within seven calendar days of the first subscription
                    payment for a workspace. Renewals, upgrades and repeat subscriptions are not
                    included in that general window. Billing errors are reviewed separately. Read
                    the full <Link href="/refunds/">refund and cancellation policy</Link>;
                    applicable mandatory consumer rights are not limited by these terms.
                </p>
            </section>
            <section id="contact">
                <h2>Contact and support</h2>
                <p>
                    socket.help provides this service. For account help, billing, privacy requests,
                    security reports or abuse reports, email{' '}
                    <a href={supportHref}>{supportEmail}</a>. The{' '}
                    <Link href="/contact/">contact page</Link> explains what to include and how to
                    keep credentials private. Beta support has no guaranteed response time.
                </p>
            </section>
            <section id="availability">
                <h2>Service availability and expiry</h2>
                <p>
                    Tools are provided as they are, without warranties of any kind. Resources can
                    expire, limits can change, and the service can be unavailable. Do not use
                    socket.help as the only copy of important data or as a dependency requiring
                    guaranteed uptime.
                </p>
                <p>
                    Pro and Team checkout is disabled until recurring prices and billing are
                    configured. If checkout is available, review the price and billing period shown
                    before purchasing. Current plan allowances and subscription status appear in
                    your workspace.
                </p>
            </section>
            <section id="liability">
                <h2>Liability</h2>
                <p>
                    To the extent the law allows, socket.help and its operators are not liable for
                    indirect or consequential losses, lost data, or lost profits arising from using
                    the service or being unable to use it.
                </p>
            </section>
            <section id="changes">
                <h2>Changes to these terms</h2>
                <p>
                    We may update these terms as the service changes. The date at the top identifies
                    this version. Continuing to use socket.help after a change means you accept the
                    updated terms.
                </p>
            </section>
        </ReadingLayout>
    );
}
