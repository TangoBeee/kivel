import type { Metadata } from 'next';
import { SiteFonts } from '../../frontend/components/site-fonts';
import { ToolboxProvider } from '../../frontend/components/toolbox-provider';
import { appOrigin } from '../../frontend/lib/site';
import '../../frontend/app/globals.css';
import './app.css';

export const metadata: Metadata = {
    metadataBase: new URL(appOrigin),
    title: { default: 'Kivel workspace', template: '%s · Kivel' },
    robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return (
        <SiteFonts>
            <ToolboxProvider>
                <a className="skip-link" href="#main">
                    Skip to content
                </a>
                <main id="main">{children}</main>
            </ToolboxProvider>
        </SiteFonts>
    );
}
