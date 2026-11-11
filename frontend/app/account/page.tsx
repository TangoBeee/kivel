import type { Metadata } from 'next';
import { LegacyWorkspaceBridge } from '../../components/legacy-workspace-bridge';
export const metadata: Metadata = {
    title: 'Your workspace',
    robots: { index: false, follow: false },
};
export default function AccountPage() {
    return <LegacyWorkspaceBridge />;
}
