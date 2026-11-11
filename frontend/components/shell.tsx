'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { LiveLogo } from './live-logo';
import { SearchLaunch } from './toolbox-provider';
import { supportEmail, supportHref } from '../lib/support';
import { appLink } from '../lib/app-routes';

const links = [
    {
        href: '/connect/',
        label: 'Setup',
        match: (path: string) => path.startsWith('/connect'),
    },
    { href: '/docs/', label: 'Docs', match: (path: string) => path.startsWith('/docs') },
    { href: '/pricing/', label: 'Pricing', match: (path: string) => path === '/pricing' },
    {
        href: '/catalog/',
        label: 'Free tools',
        match: (path: string) => path.startsWith('/catalog') || path.startsWith('/tools'),
    },
];
const menuLinks = [
    ...links,
    { href: '/blog/', label: 'Blog', match: (path: string) => path.startsWith('/blog') },
    {
        href: '/compare/',
        label: 'Compare tools',
        match: (path: string) => path.startsWith('/compare'),
    },
    {
        href: '/integrations/',
        label: 'Integrations',
        match: (path: string) => path === '/integrations',
    },
    { href: '/privacy/', label: 'Privacy & limits', match: (path: string) => path === '/privacy' },
    { href: '/terms/', label: 'Terms', match: (path: string) => path === '/terms' },
];

export function Header() {
    const pathname = usePathname().replace(/\/$/, '');
    const accountLinks = [{ href: appLink(), label: 'Open app', match: () => false }];
    const [open, setOpen] = useState(false);
    const toggle = useRef<HTMLButtonElement>(null);
    const firstLink = useRef<HTMLAnchorElement>(null);

    useEffect(() => setOpen(false), [pathname]);
    useEffect(() => {
        if (!open) return;
        const wide = matchMedia('(min-width: 721px)');
        const close = () => {
            setOpen(false);
            toggle.current?.focus();
        };
        const onKey = (event: KeyboardEvent) => event.key === 'Escape' && close();
        const onWide = () => wide.matches && setOpen(false);
        const behind = document.querySelectorAll<HTMLElement>('#main, .site-footer');
        behind.forEach((element) => (element.inert = true));
        document.documentElement.classList.add('menu-open');
        firstLink.current?.focus({ preventScroll: true });
        addEventListener('keydown', onKey);
        wide.addEventListener('change', onWide);
        return () => {
            behind.forEach((element) => (element.inert = false));
            document.documentElement.classList.remove('menu-open');
            removeEventListener('keydown', onKey);
            wide.removeEventListener('change', onWide);
        };
    }, [open]);

    return (
        <>
            <header className={`island ${open ? 'is-open' : ''}`}>
                <Link href="/" className="island-brand" aria-label="Kivel home">
                    <LiveLogo size={28} />
                    <span>Kivel</span>
                </Link>
                <nav className="island-nav" aria-label="Main navigation">
                    {links.map((link) => (
                        <Link
                            key={link.href}
                            href={link.href}
                            aria-current={link.match(pathname) ? 'page' : undefined}
                        >
                            {link.label}
                        </Link>
                    ))}
                </nav>
                <SearchLaunch compact />
                <div className="island-account">
                    <Link href={appLink()} className="island-cta">
                        Open app
                    </Link>
                </div>
                <button
                    ref={toggle}
                    className="island-toggle"
                    aria-label={open ? 'Close navigation' : 'Open navigation'}
                    aria-expanded={open}
                    aria-controls="island-menu"
                    onClick={() => setOpen((value) => !value)}
                >
                    <span className="island-toggle-line" />
                    <span className="island-toggle-line" />
                </button>
            </header>
            <div
                id="island-menu"
                className={`island-menu ${open ? 'is-open' : ''}`}
                inert={!open}
                aria-hidden={!open}
            >
                <nav aria-label="Mobile navigation">
                    <ul>
                        {[...accountLinks, ...menuLinks].map((link, index) => (
                            <li
                                key={link.href}
                                style={{ transitionDelay: `${100 + index * 50}ms` }}
                            >
                                <Link
                                    ref={index === 0 ? firstLink : undefined}
                                    href={link.href}
                                    aria-current={link.match(pathname) ? 'page' : undefined}
                                    onClick={() => setOpen(false)}
                                >
                                    {link.label}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </nav>
            </div>
        </>
    );
}

const footerColumns = [
    {
        title: 'Product',
        links: [
            { href: '/connect/', label: 'Setup' },
            { href: '/pricing/', label: 'Pricing' },
            { href: '/catalog/', label: 'Free tools' },
            { href: '/integrations/', label: 'Integrations' },
            { href: '/use-cases/', label: 'Use cases' },
        ],
    },
    {
        title: 'Developers',
        links: [
            { href: '/docs/', label: 'Documentation' },
            { href: '/docs/reference/', label: 'API reference' },
            { href: '/compare/', label: 'Compare tools' },
            { href: '/beta/', label: 'Open beta' },
        ],
    },
    {
        title: 'Company',
        links: [
            { href: '/blog/', label: 'Blog' },
            { href: '/contact/', label: 'Contact & support' },
            { href: appLink(), label: 'Workspace' },
        ],
    },
];
const legalLinks = [
    { href: '/privacy/', label: 'Privacy' },
    { href: '/terms/', label: 'Terms' },
    { href: '/refunds/', label: 'Refunds' },
];

export function Footer() {
    return (
        <footer className="site-footer">
            <div className="footer-inner">
                <div className="footer-about">
                    <Link href="/" className="footer-brand" aria-label="Kivel home">
                        <LiveLogo size={28} />
                        <span>Kivel</span>
                    </Link>
                    <p>The internet toolkit for AI agents, and free tools for everyone else.</p>
                </div>
                {footerColumns.map((column) => (
                    <nav key={column.title} className="footer-column" aria-label={column.title}>
                        <h2>{column.title}</h2>
                        {column.links.map((link) => (
                            <Link key={link.href} href={link.href}>
                                {link.label}
                            </Link>
                        ))}
                    </nav>
                ))}
            </div>
            <div className="footer-bottom">
                <span>© {new Date().getFullYear()} Kivel</span>
                <nav className="footer-legal" aria-label="Legal">
                    {legalLinks.map((link) => (
                        <Link key={link.href} href={link.href}>
                            {link.label}
                        </Link>
                    ))}
                    <a href={supportHref}>{supportEmail}</a>
                </nav>
            </div>
        </footer>
    );
}
