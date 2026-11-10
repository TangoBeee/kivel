import { Icon } from '../icons';

export function InboxPreview() {
    return (
        <figure className="landing-preview">
            <figcaption>
                <Icon name="mail" size={18} />
                <strong>Inbox</strong>
                <code>build-agent@socketspace.xyz</code>
            </figcaption>
            <div className="landing-inbox-row is-selected">
                <div>
                    <strong>Verify your sign-in</strong>
                    <span>Acme Accounts</span>
                </div>
                <code className="landing-chip">482901</code>
            </div>
            <div className="landing-inbox-row">
                <div>
                    <strong>Your workspace is ready</strong>
                    <span>Acme Workspace</span>
                </div>
                <span>09:18</span>
            </div>
            <div className="landing-inbox-row">
                <div>
                    <strong>Build report</strong>
                    <span>Build service</span>
                </div>
                <span>09:12</span>
            </div>
        </figure>
    );
}

export function WebhookPreview() {
    return (
        <figure className="landing-preview">
            <figcaption>
                <Icon name="webhook" size={18} />
                <strong>Request log</strong>
                <span>Latest request</span>
            </figcaption>
            <div className="landing-preview-route">
                <code className="landing-chip">POST</code>
                <code>/hooks/…/orders</code>
                <code className="landing-status">200 OK</code>
            </div>
            <dl className="landing-headers">
                <div>
                    <dt>content-type</dt>
                    <dd>application/json</dd>
                </div>
                <div>
                    <dt>x-event-type</dt>
                    <dd>order.created</dd>
                </div>
            </dl>
            <pre>
                <code>{'{\n  "event": "order.created",\n  "orderId": "ord_1042"\n}'}</code>
            </pre>
        </figure>
    );
}

export function MockPreview() {
    return (
        <figure className="landing-preview">
            <figcaption>
                <Icon name="braces" size={18} />
                <strong>Mock route</strong>
                <span>JSON response</span>
            </figcaption>
            <div className="landing-preview-route">
                <code className="landing-chip">GET</code>
                <code>/v1/customers/42</code>
                <code className="landing-status">200 OK</code>
            </div>
            <pre>
                <code>{'{\n  "id": 42,\n  "name": "Sam Rivera",\n  "status": "active"\n}'}</code>
            </pre>
        </figure>
    );
}
