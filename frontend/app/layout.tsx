import type { Metadata } from 'next';
import { Header, Footer } from '../components/shell';
import { ToolboxProvider } from '../components/toolbox-provider';
import { GeistMono } from 'geist/font/mono';
import { Hanken_Grotesk } from 'next/font/google';
import './globals.css';
import { siteOrigin } from '../lib/site';

// One typeface for the whole site: headlines and text alike.
const sans = Hanken_Grotesk({
    subsets: ['latin'],
    display: 'swap',
    variable: '--font-sans',
});

export const metadata: Metadata = {
    metadataBase: new URL(siteOrigin),
    title: {
        default: 'socket.help | The internet toolkit for AI agents',
        template: '%s · socket.help',
    },
    description:
        'Webhook URLs, email inboxes, mock APIs, memory, monitors and human approval for coding agents over one MCP connection. Free tools for everyone else.',
    robots: { index: true, follow: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" data-theme="light" data-scroll-behavior="smooth">
            <body className={`${sans.variable} ${GeistMono.variable}`}>
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
