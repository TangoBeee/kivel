import Link from 'next/link';
import { supportEmail, supportHref, policyUpdated } from '../../lib/support';
import { ReadingLayout } from '../../components/content-layout';
import { pageMetadata } from '../../lib/seo';
export const metadata = pageMetadata(
    'Privacy & data handling',
    'Understand what Kivel processes locally, what temporary tools store, how private access works, and how accounts, email recovery, logs, and cleanup handle data.',
    '/privacy/',
);
const sections = [
    { id: 'local', title: 'Local browser tools' },
    { id: 'resources', title: 'Temporary resources' },
    { id: 'agent-email', title: 'Owned agent email' },
    { id: 'authenticators', title: 'Authenticator secrets' },
    { id: 'access', title: 'Sharing & credentials' },
    { id: 'browser', title: 'Browser storage' },
    { id: 'accounts', title: 'Accounts & email' },
    { id: 'operations', title: 'Logs & backups' },
    { id: 'contact', title: 'Privacy requests' },
    { id: 'limits', title: 'Limits & deletion' },
];
export default function Privacy() {
    return (
        <ReadingLayout
            meta={`Updated ${policyUpdated}`}
            title="Know what happens to your data."
            description="No advertising or tracking analytics. Here is what stays on your device, what we store, and when it expires."
            path="/privacy/"
            sections={sections}
        >
            <aside className="reading-summary">
                <strong>The short version</strong>
                <p>
                    Browser tools run locally. Hosted tools send input to the server. Temporary
                    resources store what they need to work, with explicit access controls and
                    expiry.
                </p>
            </aside>
            <section id="local">
                <h2>Local browser tools</h2>
                <p>
                    Formatters, encoders, generators, and file checksums marked as browser-local
                    process input on your device. Their inputs, secrets, and results are not sent to
                    Kivel.
                </p>
                <p>
                    Using the same utility through the API, SDK, CLI, SSH, or MCP sends your input
                    to a bounded server processor. Input and results are not retained as execution
                    history.
                </p>
            </section>
            <section id="resources">
                <h2>Temporary resources</h2>
                <p>
                    Webhook inboxes store incoming methods, paths, headers, query parameters,
                    bodies, and timestamps for inspection. Header names containing authorization,
                    cookie, token, API key, secret, or password markers are redacted before storage.
                    Bodies and query parameters are preserved and may still contain sensitive data.
                </p>
                <p>
                    Mock API and mock MCP configurations, captured webhook data, and uploaded files
                    are stored in PostgreSQL. Resources start with one-hour lifetimes, with longer
                    retention available within plan limits. Expired resources become inaccessible
                    immediately; cleanup runs every minute.
                </p>
                <p>
                    Files are limited to 10 MiB. The final allowed download removes the stored
                    contents; lifecycle metadata remains until expiry or deletion. Downloads are
                    forced attachments. Files are not scanned for malware.
                </p>
            </section>
            <section id="agent-email">
                <h2>Owned agent email</h2>
                <p>
                    Owned inboxes store attachment content within the 5 MiB message limit and a 25
                    MiB attachment allowance per inbox. Stored bytes count against workspace
                    storage. Private download links expire after two minutes. Clearing messages or
                    deleting or expiring the inbox removes attachments and invalidates links. Files
                    are not scanned for malware and always download as attachments.
                </p>
                <p>
                    Agent inboxes store received and sent messages separately from account recovery
                    mail. Free inboxes expire after the selected lifetime; paid addresses remain
                    active while subscribed. Lapsed paid addresses pause immediately and their mail
                    is deleted after a 30-day grace period. Retired addresses remain reserved so
                    another workspace cannot receive mail intended for the previous owner.
                </p>
                <p>
                    When enabled, the server’s separate Postfix relay queues outgoing agent email
                    from socketspace.xyz and OpenDKIM signs it. Recipient mail servers process the
                    delivered content. An optional forwarding webhook receives message content only
                    when the workspace configures it. Delivery receipts, recipient addresses and
                    request hashes are retained for 90 days for retry safety and abuse prevention;
                    send receipts contain no message bodies. Suppression records are retained to
                    honor unsubscribe, bounce and complaint restrictions.
                </p>
                <p>
                    When phone service is enabled, Telnyx processes purchased numbers and received
                    SMS. SMS content is retained for up to 30 days, with at most 1,000 messages per
                    number. Lifecycle records remain until provider release is confirmed, including
                    after workspace deletion; number reservations prevent reassignment here. Lapsed
                    add-ons pause receiving and release excess numbers after seven days.
                </p>
            </section>
            <section id="access">
                <h2>Sharing and credentials</h2>
                <p>
                    New resources default to private. Private callers need a distinct access token
                    or current workspace access. Public endpoints work for anyone who knows the
                    link. Anonymous management tokens control management, not private download
                    access.
                </p>
                <p>
                    Tokens are stored on the server as hashes. Rotating a sharing token revokes the
                    old token. Private file links contain only a resource ID; share the access token
                    separately.
                </p>
            </section>
            <section id="browser">
                <h2>What your browser remembers</h2>
                <p>
                    This tab’s session storage keeps current inboxes, mock APIs, file shares, and
                    their credentials so refreshes work. Deleting a resource clears its saved
                    access. Stale saved sessions are ignored.
                </p>
                <p>
                    We do not use tracking cookies. Signing in sets a seven-day HttpOnly, SameSite
                    session cookie. Signing out or switching workspaces clears saved tool
                    credentials in this browser’s open tabs. Shared tokens remain valid until
                    rotated, exhausted, or expired.
                </p>
            </section>
            <section id="authenticators">
                <h2>Authenticator secrets</h2>
                <p>
                    Workspace TOTP secrets are encrypted at rest using a key derived from the server
                    secret. Setup URIs and QR images are processed during import and are not
                    retained. The API never returns a stored secret. Labels and service account
                    names remain visible to authorized workspace members and agents. Secrets remain
                    until you delete the authenticator or workspace; a plan downgrade does not
                    delete them. Keep the service recovery codes separately.
                </p>
                <p>
                    Code generation records the time, authenticator ID and requesting key in
                    workspace activity, without storing the generated code. As with other deleted
                    data, encrypted records may remain in backups until the backup retention period
                    ends.
                </p>
            </section>
            <section id="accounts">
                <h2>Accounts, recovery, and billing</h2>
                <p>
                    Accounts store a username, signup email, password hash, workspace memberships,
                    hashed credentials, and usage counters. Only a verified email address can be
                    used for password recovery.
                </p>
                <p>
                    Email verification and reset codes expire after 15 minutes. Queued email
                    contents are encrypted until sent or expired. The configured email provider
                    delivers account messages. Delivery is available only after an operator
                    configures SMTP.
                </p>
                <p>
                    When billing is configured, Dodo Payments handles card details. The app stores
                    Dodo Payments customer and subscription identifiers and verified entitlement
                    state.
                </p>
            </section>
            <section id="operations">
                <h2>Operational records and backups</h2>
                <p>
                    Application logs contain request IDs, HTTP methods, route patterns, response
                    codes, and timings. They exclude webhook bodies, query values, and
                    authentication tokens. IP addresses are hashed for short-lived rate-limit
                    records.
                </p>
                <p>
                    Resource lifecycle events retain metadata for 30 days and exclude payloads.
                    Hosting providers may retain network access logs. Operators control
                    infrastructure logging and backup retention; deleting live data does not
                    immediately erase an existing backup.
                </p>
            </section>
            <section id="contact">
                <h2>Privacy questions and requests</h2>
                <p>
                    Email <a href={supportHref}>{supportEmail}</a> for questions about processing or
                    to request access, correction or deletion of account information. Contact us
                    from your account email where possible; we may need to verify ownership before
                    sharing or removing private information. Do not email passwords, API keys or
                    sharing tokens.
                </p>
                <p>
                    Resource deletion removes live content under the published lifecycle. Backups
                    may retain earlier copies until their retention period ends. See{' '}
                    <Link href="/contact/">contact and support</Link> for reporting guidance.
                </p>
            </section>
            <section id="limits">
                <h2>Limits and deletion</h2>
                <p>
                    You can delete a resource before it expires. Expired data is removed during
                    cleanup and cannot be restored through the app. When an inbox reaches its
                    history limit, existing history stays available and further captures are
                    rejected.
                </p>
                <p>
                    Anonymous inboxes hold up to 100 requests or 1 MiB, with a 100 KiB body limit.
                    Account inboxes hold up to 1,000 requests or 10 MiB. Storage, creation, and
                    hosted execution quotas vary by plan. Public endpoints and total installation
                    capacity have additional limits.
                </p>
                <p>
                    Read the <Link href="/plans/">plans and limits</Link> before a workflow depends
                    on a resource. Use sample data for testing and keep an independent copy of
                    anything important.
                </p>
            </section>
        </ReadingLayout>
    );
}
