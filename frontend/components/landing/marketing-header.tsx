'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../icons';
import { LogoMark } from '../logo';
import { useViewer } from '../../lib/viewer';
import { productLinks } from './product-links';

export function MarketingHeader() {
    const pathname = usePathname();
    const viewer = useViewer();
    const [open, setOpen] = useState(false);
    const header = useRef<HTMLElement>(null);
    const products = useRef<HTMLDetailsElement>(null);
    const toggle = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        setOpen(false);
        if (products.current) products.current.open = false;
    }, [pathname]);
    useEffect(() => {
        function closeOutside(event: PointerEvent) {
            if (!products.current?.contains(event.target as Node) && products.current)
                products.current.open = false;
            if (!header.current?.contains(event.target as Node)) setOpen(false);
        }
        function escape(event: KeyboardEvent) {
            if (event.key !== 'Escape') return;
            if (products.current?.open) {
                products.current.open = false;
                products.current.querySelector('summary')?.focus();
            } else if (open) {
                setOpen(false);
                toggle.current?.focus();
            }
        }
        document.addEventListener('pointerdown', closeOutside);
        document.addEventListener('keydown', escape);
        return () => {
            document.removeEventListener('pointerdown', closeOutside);
            document.removeEventListener('keydown', escape);
        };
    }, [open]);

    return (
        <header ref={header} className="marketing-header">
            <div className="marketing-width marketing-nav-row">
                <Link href="/" className="marketing-brand" aria-label="Kivel home">
                    <LogoMark size={25} /> Kivel
                </Link>
                <button
                    ref={toggle}
                    type="button"
                    className="marketing-menu-button"
                    aria-label={open ? 'Close navigation' : 'Open navigation'}
                    aria-expanded={open}
                    aria-controls="marketing-nav"
                    onClick={() => setOpen((value) => !value)}
                >
                    <Icon name={open ? 'close' : 'menu'} size={21} />
                </button>
                <nav
                    id="marketing-nav"
                    className={open ? 'is-open' : undefined}
                    aria-label="Main navigation"
                >
                    <details ref={products} className="marketing-products">
                        <summary>
                            Products <Icon name="caret-down" size={14} />
                        </summary>
                        <div className="marketing-products-menu">
                            {Object.values(productLinks).map(({ href, name, icon }) => (
                                <Link key={href} href={href}>
                                    <Icon name={icon} size={17} />
                                    {name}
                                </Link>
                            ))}
                        </div>
                    </details>
                    <Link
                        href="/docs/"
                        aria-current={pathname.startsWith('/docs') ? 'page' : undefined}
                    >
                        Docs
                    </Link>
                    <Link
                        href="/pricing/"
                        aria-current={pathname.startsWith('/pricing') ? 'page' : undefined}
                    >
                        Pricing
                    </Link>
                    <Link
                        href="/blog/"
                        aria-current={pathname.startsWith('/blog') ? 'page' : undefined}
                    >
                        Blog
                    </Link>
                    {viewer.status !== 'user' && (
                        <Link href="/account/" className="marketing-mobile-signin">
                            Sign in
                        </Link>
                    )}
                </nav>
                <div className="marketing-account">
                    {viewer.status === 'user' ? (
                        <Link className="marketing-button is-primary" href="/account/">
                            Dashboard
                        </Link>
                    ) : (
                        <>
                            <Link className="marketing-signin" href="/account/">
                                Sign in
                            </Link>
                            <Link className="marketing-button is-primary" href="/account/#register">
                                Get started
                            </Link>
                        </>
                    )}
                </div>
            </div>
        </header>
    );
}
