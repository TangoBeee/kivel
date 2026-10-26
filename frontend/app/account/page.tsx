import type { Metadata } from 'next';
import { AccountDashboard } from '../../components/account-dashboard';
import { toolGlyphs } from '../../components/tool-glyphs';
export const metadata: Metadata = {
    title: 'Your workspace',
    robots: { index: false, follow: false },
};
export default function AccountPage() {
    return <AccountDashboard glyphs={toolGlyphs(18)} />;
}
