import type { Metadata } from 'next';
import { SharedFile } from '../../components/shared-file';
export const metadata: Metadata = {
    title: 'Shared file',
    robots: { index: false, follow: false },
    description: 'Open a shared file with public or private access.',
};
export default function SharePage() {
    return <SharedFile />;
}
