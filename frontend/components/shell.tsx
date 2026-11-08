'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { LiveLogo } from './live-logo';
import { SearchLaunch } from './toolbox-provider';
import { supportEmail, supportHref } from '../lib/support';
import { useViewer } from '../lib/viewer';

const links = [
    {
        href: '/connect/',
        label: 'Setup',
        match: (path: string) => path.startsWith('/connect'),
    },
    { href: '/docs/', label: 'Docs', match: (path: string) => path.startsWith('/docs') },
    { href: '/plans/', label: 'Pricing', match: (path: string) => path === '/plans' },
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

// Signed out: sign in and create account. Signed in: a way back to the dashboard.
function HeaderAccount() {
    const viewer = useViewer();
    // Tells the first-load reveal (app/layout.tsx) that the header knows who is signed in.
    useEffect(() => {
        if (viewer.status !== 'loading') dispatchEvent(new Event('kivel:viewer'));
    }, [viewer.status]);
    if (viewer.status === 'loading')
        return <span className="island-account is-loading" aria-hidden="true" />;
    if (viewer.status === 'user')
        return (
            <div className="island-account">
                <Link href="/account/" className="island-cta">
                    <span className="island-avatar" aria-hidden="true">
                        {viewer.username[0]?.toUpperCase()}
                    </span>
                    Dashboard
                </Link>
            </div>
        );
    return (
        <div className="island-account">
            <Link href="/account/" className="island-signin">
                Sign in
            </Link>
            <Link
                href="/account/#register"
                className="island-cta"
                onClick={(event) => {
                    // Already on the account page: change the hash so the page switches to the
                    // create account tab itself, without a reload.
                    if (location.pathname.replace(/\/$/, '') === '/account') {
                        event.preventDefault();
                        location.hash = 'register';
                    }
                }}
            >
                Create account
            </Link>
        </div>
    );
}

export function Header() {
    const pathname = usePathname().replace(/\/$/, '');
    const viewer = useViewer();
    const accountLinks =
        viewer.status === 'user'
            ? [
                  {
                      href: '/account/',
                      label: 'Dashboard',
                      match: (path: string) => path === '/account',
                  },
              ]
            : [
                  {
                      href: '/account/',
                      label: 'Sign in',
                      match: (path: string) => path === '/account',
                  },
                  { href: '/account/#register', label: 'Create account', match: () => false },
              ];
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
            <header
                className={`island ${open ? 'is-open' : ''} ${pathname === '' ? 'is-landing' : ''}`}
            >
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
                <HeaderAccount />
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
                                {link.href.includes('#') ? (
                                    <Link
                                        ref={index === 0 ? firstLink : undefined}
                                        href={link.href}
                                        onClick={(event) => {
                                            setOpen(false);
                                            const hash = link.href.split('#')[1]!;
                                            if (
                                                location.pathname.replace(/\/$/, '') ===
                                                link.href.split('#')[0]!.replace(/\/$/, '')
                                            ) {
                                                event.preventDefault();
                                                location.hash = hash;
                                            }
                                        }}
                                    >
                                        {link.label}
                                    </Link>
                                ) : (
                                    <Link
                                        ref={index === 0 ? firstLink : undefined}
                                        href={link.href}
                                        aria-current={link.match(pathname) ? 'page' : undefined}
                                        onClick={() => setOpen(false)}
                                    >
                                        {link.label}
                                    </Link>
                                )}
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
            { href: '/plans/', label: 'Pricing' },
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
            { href: '/account/', label: 'Workspace' },
        ],
    },
];
const legalLinks = [
    { href: '/privacy/', label: 'Privacy' },
    { href: '/terms/', label: 'Terms' },
    { href: '/refunds/', label: 'Refunds' },
];

export function Footer() {
    const landing = usePathname().replace(/\/$/, '') === '';
    return (
        <footer className={`site-footer ${landing ? 'is-landing' : ''}`}>
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
