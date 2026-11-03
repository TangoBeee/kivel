import type { Metadata } from 'next';
import { Header, Footer } from '../components/shell';
import { ToolboxProvider } from '../components/toolbox-provider';
import { NavProgress } from '../components/nav-progress';
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
        'The internet toolkit for coding agents: HTTP, email, mocks, OAuth, files, monitors, memory, authenticators, jobs, status pages, test data, media, utilities and DNS.',
    robots: { index: true, follow: true },
};

// Hold the first paint until fonts, images and the sign-in check are ready, then fade the whole page in at once.
// It never waits longer than 1.5 seconds, and without JavaScript the page simply shows.
const revealWhenReady = `(function(){var d=document.documentElement;d.classList.add('is-loading');var done=false;function show(){if(done)return;done=true;d.classList.remove('is-loading');}var loaded=new Promise(function(r){if(document.readyState==='complete')r();else addEventListener('load',r);});var signedIn=new Promise(function(r){addEventListener('socket-help:viewer',r,{once:true});});Promise.all([loaded,signedIn,document.fonts?document.fonts.ready:null]).then(show,show);setTimeout(show,1500);})();`;

export default function Layout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" data-theme="light" data-scroll-behavior="smooth" suppressHydrationWarning>
            <head>
                <script dangerouslySetInnerHTML={{ __html: revealWhenReady }} />
            </head>
            <body className={`${sans.variable} ${GeistMono.variable}`}>
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
