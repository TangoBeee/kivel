import Link from 'next/link';
import { ReadingLayout } from '../../components/content-layout';
import { pageMetadata } from '../../lib/seo';
import { supportEmail, supportHref, policyUpdated } from '../../lib/support';
export const metadata = pageMetadata(
    'Refund & cancellation policy',
    'Understand Kivel refunds and cancellation: free open beta, a seven-day refund window for the first subscription payment, renewal rules, and billing-error support.',
    '/refunds/',
);
export default function Refunds() {
    return (
        <ReadingLayout
            meta={`Updated ${policyUpdated}`}
            title="Refunds and cancellation, clearly."
            description="The open beta is free. These rules explain how refunds and cancellation work if you later choose a paid subscription."
            path="/refunds/"
            sections={[
                { id: 'beta', title: 'Free open beta' },
                { id: 'first-payment', title: 'First payment refunds' },
                { id: 'renewals', title: 'Renewals & cancellation' },
                { id: 'errors', title: 'Billing errors' },
                { id: 'request', title: 'Request a refund' },
                { id: 'rights', title: 'Your rights' },
            ]}
        >
            <aside className="reading-summary">
                <strong>Seven days on your first subscription payment.</strong>
                <p>
                    Request a refund within seven calendar days of your first paid subscription
                    charge. Billing errors are reviewed separately. Free beta users are not charged.
                </p>
            </aside>
            <section id="beta">
                <h2>No charges during the free open beta</h2>
                <p>
                    Anonymous and Free access do not require a payment method. Paid checkout is
                    disabled during the free beta. Creating an account does not subscribe you to a
                    paid plan, and beta accounts will not be converted or charged automatically.
                </p>
            </section>
            <section id="first-payment">
                <h2>Seven-day first-payment refund</h2>
                <p>
                    If you buy your first paid Kivel subscription, you can request a refund of that
                    first subscription payment within seven calendar days of the charge. The window
                    starts on the payment date shown on your receipt. This applies to the first
                    subscription payment for the workspace, not later renewals, upgrades or repeat
                    subscriptions.
                </p>
                <p>
                    When that first payment is refunded, we cancel the paid subscription and return
                    the workspace to Free access. Resources remain subject to their existing expiry
                    and the applicable access and storage rules; keep your own copy of important
                    data.
                </p>
            </section>
            <section id="renewals">
                <h2>Renewals and cancellation</h2>
                <p>
                    Future paid plans are monthly recurring subscriptions. Cancel before the next
                    renewal through Plan and billing in your workspace, which opens the Dodo
                    Payments customer portal. Cancellation stops future renewals. A cancellation
                    scheduled for the end of the paid period keeps paid access until that period
                    ends; immediate cancellation ends it when the provider marks it cancelled.
                </p>
                <p>
                    Renewal payments and mid-period plan changes are not covered by the general
                    first-payment refund window. Cancelling a subscription does not automatically
                    request a refund. Contact us if you believe a renewal or plan-change charge is
                    incorrect.
                </p>
            </section>
            <section id="errors">
                <h2>Duplicate, incorrect or unrecognized charges</h2>
                <p>
                    Report billing errors to <a href={supportHref}>{supportEmail}</a> as soon as you
                    notice them. We review duplicate charges, incorrect amounts, charges after an
                    effective cancellation, and unrecognized charges separately from the seven-day
                    first-payment policy. We may need to verify the payment and account before
                    resolving the issue.
                </p>
            </section>
            <section id="request">
                <h2>How to request a refund</h2>
                <p>
                    Email <a href={supportHref}>{supportEmail}</a> from the email associated with
                    your purchase. Include your workspace name, receipt or payment reference,
                    payment date and the reason for the request. Never send a password, API key,
                    sharing token, full card number or bank credentials.
                </p>
                <p>
                    We will communicate the decision by email. Approved refunds are processed
                    through Dodo Payments to the original payment method where supported. The time
                    until funds appear depends on the payment provider and your bank. For
                    first-payment requests, the date you sent the email determines whether you
                    requested it within the window.
                </p>
            </section>
            <section id="rights">
                <h2>Rights that apply regardless of this policy</h2>
                <p>
                    This policy does not limit refund, cancellation or other consumer rights that
                    apply under law. Read it with the <Link href="/terms/">terms of use</Link> and{' '}
                    <Link href="/privacy/">privacy policy</Link>. For a question about your
                    situation, <Link href="/contact/">contact support</Link>.
                </p>
            </section>
        </ReadingLayout>
    );
}
