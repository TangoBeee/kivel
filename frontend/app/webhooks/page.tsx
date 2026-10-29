import type { Metadata } from 'next';
export const metadata: Metadata = {
    title: 'Webhook workspace',
    robots: { index: false, follow: false },
};
import WebhookWorkbench from '../../components/webhook-workbench';
export default function WebhooksPage() {
    return <WebhookWorkbench />;
}
