import Link from 'next/link';
import { appLink } from '../../lib/app-routes';
import { PageIntro } from '../../components/content-layout';
import { pageMetadata } from '../../lib/seo';

const description =
    'Create a webhook inbox to capture HTTP requests, inspect headers and payloads, replay events and forward them to your services.';
export const metadata = pageMetadata(
    'Webhook inbox and request inspector',
    description,
    '/webhooks/',
);

export default function WebhooksPage() {
    return (
        <div className="content-page page-width">
            <PageIntro meta="Webhooks" title="Webhooks for your agents" description={description} />
            <Link className="button button-primary" href={appLink('/webhooks/')}>
                Open webhooks
            </Link>
            <Link className="button" href="/docs/webhook-inboxes/">
                Read the guide
            </Link>
        </div>
    );
}
