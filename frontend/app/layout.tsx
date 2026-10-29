import type { Metadata } from 'next';
import { Header, Footer } from '../components/shell';
import { ToolboxProvider } from '../components/toolbox-provider';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { Instrument_Serif } from 'next/font/google';
import './globals.css';
import { siteOrigin } from '../lib/site';

// Display headlines: a light, high-contrast serif that sits well over the archive photographs.
const display = Instrument_Serif({
    weight: '400',
    style: ['normal', 'italic'],
    subsets: ['latin'],
    display: 'swap',
    variable: '--font-display',
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
        <html lang="en" data-theme="dark" data-scroll-behavior="smooth">
            <body className={`${GeistSans.variable} ${GeistMono.variable} ${display.variable}`}>
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
