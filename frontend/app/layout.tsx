import type { Metadata } from 'next';
import { Header, Footer } from '../components/shell';
import { ToolboxProvider } from '../components/toolbox-provider';
import { NavProgress } from '../components/nav-progress';
import { GeistMono } from 'geist/font/mono';
import { Inter, Manrope } from 'next/font/google';
import './globals.css';
import { siteOrigin } from '../lib/site';

const text = Inter({
    subsets: ['latin'],
    weight: ['400', '500', '600'],
    display: 'swap',
    variable: '--font-text',
});
const display = Manrope({
    subsets: ['latin'],
    weight: ['400', '500', '600'],
    display: 'swap',
    variable: '--font-display',
});

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
        <html
            className={`${text.variable} ${display.variable} ${GeistMono.variable}`}
            lang="en"
            data-theme="dark"
            data-scroll-behavior="smooth"
            suppressHydrationWarning
        >
            <body>
                <ToolboxProvider>
                    <a className="skip-link" href="#main">
                        Skip to content
                    </a>
                    <NavProgress />
                    <Header />
                    <main id="main">{children}</main>
                    <Footer />
                </ToolboxProvider>
            </body>
        </html>
    );
}
