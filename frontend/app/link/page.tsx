import type { Metadata } from 'next';
import { AgentLink } from '../../components/agent-link';

export const metadata: Metadata = {
    title: 'Connect an agent',
    description: 'Approve an AI agent that asked to use your Kivel workspace.',
    robots: { index: false, follow: false },
    alternates: { canonical: '/link/' },
};

export default function LinkPage() {
    return <AgentLink />;
}
