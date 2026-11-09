import { AccountDashboard } from '../../../frontend/components/account-dashboard';
import { toolGlyphs } from '../../../frontend/components/tool-glyphs';

export default function Home() {
    return <AccountDashboard glyphs={toolGlyphs(18)} />;
}
