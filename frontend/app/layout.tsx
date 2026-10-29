import type { Metadata } from 'next';
import { Header, Footer } from '../components/shell';
import { ToolboxProvider } from '../components/toolbox-provider';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { siteOrigin } from '../lib/site';

export const metadata: Metadata = {
    metadataBase: new URL(siteOrigin),
    title: {
        default: 'socket.help | Your internet toolbox',
        template: '%s · socket.help',
    },
    description:
        'Explore tools for webhooks, mock APIs, AI agents, files, and everyday tasks. Available tools and the roadmap, in one place.',
    robots: { index: true, follow: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" data-theme="dark" data-scroll-behavior="smooth">
            <body className={`${GeistSans.variable} ${GeistMono.variable}`}>
                <ToolboxProvider>
                    <a className="skip-link" href="#main">
                        Skip to content
                    </a>
                    <Header />
                    <main id="main">{children}</main>
                    <Footer />
                </ToolboxProvider>
            </body>
        </html>
    );
}
