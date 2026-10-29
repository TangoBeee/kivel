'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { LogoMark } from './logo';
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
            {/* A plain link, so the fragment change reaches the sign in page when you are already on it */}
            <a href="/account/#register" className="island-cta">
                Create account
            </a>
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
            <header className={`island ${open ? 'is-open' : ''}`}>
                <Link href="/" className="island-brand" aria-label="socket.help home">
                    <LogoMark size={28} />
                    <span>
                        socket<span className="island-dot">.</span>help
                    </span>
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
                                    <a
                                        ref={index === 0 ? firstLink : undefined}
                                        href={link.href}
                                        onClick={() => setOpen(false)}
                                    >
                                        {link.label}
                                    </a>
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
            { href: '/connect/', label: 'Connect an agent' },
            { href: '/catalog/', label: 'Free tools' },
            { href: '/integrations/', label: 'Integrations' },
            { href: '/plans/', label: 'Plans' },
            { href: '/account/', label: 'Workspace' },
        ],
    },
    {
        title: 'Developers',
        links: [
            { href: '/docs/', label: 'Documentation' },
            { href: '/docs/reference/', label: 'API reference' },
            { href: '/compare/', label: 'Compare tools' },
        ],
    },
    {
        title: 'Resources',
        links: [
            { href: '/blog/', label: 'Blog' },
            { href: '/privacy/', label: 'Privacy & limits' },
            { href: '/terms/', label: 'Terms' },
            { href: '/refunds/', label: 'Refunds & cancellation' },
            { href: '/contact/', label: 'Contact & support' },
            { href: '/beta/', label: 'Open beta' },
        ],
    },
];

export function Footer() {
    return (
        <footer className="site-footer">
            <div className="footer-inner">
                <div className="footer-about">
                    <Link href="/" className="footer-brand" aria-label="socket.help home">
                        <LogoMark size={28} />
                        <span>
                            socket<span className="island-dot">.</span>help
                        </span>
                    </Link>
                    <p>The internet toolkit for AI agents, and free tools for everyone else.</p>
                    <a href={supportHref}>{supportEmail}</a>
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
                <span>© {new Date().getFullYear()} socket.help</span>
                <span>Made for agents and the people who run them.</span>
            </div>
        </footer>
    );
}
