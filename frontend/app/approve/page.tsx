import type { Metadata } from 'next';
import { AgentQuestion } from '../../components/agent-question';

export const metadata: Metadata = {
    title: 'Answer your agent',
    description: 'An AI agent in your socket.help workspace is waiting for your answer.',
    robots: { index: false, follow: false },
    alternates: { canonical: '/approve/' },
};

export default function ApprovePage() {
    return <AgentQuestion />;
}
