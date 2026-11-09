import { notFound } from 'next/navigation';
import { AccountDashboard } from '../../../../frontend/components/account-dashboard';
import { toolGlyphs } from '../../../../frontend/components/tool-glyphs';
import { workspacePanel, workspaceSections } from '../../../../frontend/lib/app-routes';

export const dynamicParams = false;
export function generateStaticParams() {
    return workspaceSections.map((section) => ({ section }));
}

export default async function Page({ params }: { params: Promise<{ section: string }> }) {
    const { section } = await params;
    if (!workspaceSections.includes(section)) notFound();
    return (
        <AccountDashboard
            glyphs={toolGlyphs(18)}
            initialPanel={workspacePanel(`/${section}/`, new URLSearchParams())}
        />
    );
}
