import Link from 'next/link';
import { appLink } from '../../lib/app-routes';
import { PageIntro } from '../../components/content-layout';
import { pageMetadata } from '../../lib/seo';

const description =
    'Give your agent a webhook URL. Capture HTTP requests, inspect their bodies and headers, and forward events to your services.';
export const metadata = pageMetadata('Webhook URLs for agents', description, '/webhooks/');

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
