import type { Metadata } from 'next';
import { ResourceView } from '../../components/resource-view';

export const metadata: Metadata = {
    title: { default: 'Browser tools', template: '%s · socket.help' },
    robots: { index: false, follow: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return (
        <>
            <ResourceView />
            {children}
        </>
    );
}
