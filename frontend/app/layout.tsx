import type { Metadata } from 'next';
import { Header, Footer } from '../components/shell';
import { ToolboxProvider } from '../components/toolbox-provider';
import { NavProgress } from '../components/nav-progress';
import { SiteFonts } from '../components/site-fonts';
import './globals.css';
import { siteOrigin } from '../lib/site';

export const metadata: Metadata = {
    metadataBase: new URL(siteOrigin),
    title: {
        default: 'Kivel: email, webhooks and tools for AI agents',
        template: '%s · Kivel',
    },
    description:
        'The internet toolkit for coding agents: HTTP, email, mocks, OAuth, files, monitors, memory, authenticators, jobs, status pages, test data, media, utilities and DNS.',
    robots: { index: true, follow: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return (
        <SiteFonts>
            <ToolboxProvider>
                <a className="skip-link" href="#main">
                    Skip to content
                </a>
                <NavProgress />
                <Header />
                <main id="main">{children}</main>
                <Footer />
            </ToolboxProvider>
        </SiteFonts>
    );
}
