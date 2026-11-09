import { GeistMono } from 'geist/font/mono';
import { Hanken_Grotesk } from 'next/font/google';

const sans = Hanken_Grotesk({
    subsets: ['latin'],
    display: 'swap',
    variable: '--font-sans',
});

export function SiteFonts({ children }: { children: React.ReactNode }) {
    return (
        <html
            className={`${sans.variable} ${GeistMono.variable}`}
            lang="en"
            data-theme="light"
            data-scroll-behavior="smooth"
        >
            <body>{children}</body>
        </html>
    );
}
