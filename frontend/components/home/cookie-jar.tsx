'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { appLink } from '../../lib/app-routes';
import { Cookie, X } from '@phosphor-icons/react';

const COUPON_AT = 20;
/** The cookie banner we don't need: a button that hands out a cookie and explains why. */
export function CookieJar() {
    const [open, setOpen] = useState(false);
    const [eaten, setEaten] = useState(0);
    const panel = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
        addEventListener('keydown', onKey);
        panel.current?.focus();
        return () => removeEventListener('keydown', onKey);
    }, [open]);
    return (
        <div className="cookie-jar">
            {open && (
                <div
                    ref={panel}
                    className="cookie-card"
                    role="dialog"
                    aria-label="About cookies"
                    tabIndex={-1}
                >
                    <button
                        type="button"
                        className="cookie-close"
                        aria-label="Close"
                        onClick={() => setOpen(false)}
                    >
                        <X size={14} />
                    </button>
                    <strong>No cookie banner here.</strong>
                    <p>
                        We don&apos;t track you, run ads or use analytics. The only cookie we set
                        keeps you signed in. So instead, here&apos;s one from us.
                    </p>
                    <button
                        type="button"
                        className={`cookie-treat ${eaten ? 'is-eaten' : ''}`}
                        key={eaten}
                        onClick={() => setEaten(eaten + 1)}
                        aria-label="Eat the cookie"
                    >
                        <Cookie size={44} weight="duotone" />
                    </button>
                    <small aria-live="polite">
                        {eaten === 0
                            ? 'Go on, take it.'
                            : eaten === 1
                              ? 'Crunchy. Still not tracking you.'
                              : eaten < 10
                                ? `${eaten} cookies, zero trackers.`
                                : eaten < COUPON_AT
                                  ? `${eaten} cookies. Something happens at ${COUPON_AT}.`
                                  : eaten < 50
                                    ? `${eaten} cookies. You earned this.`
                                    : eaten < 75
                                      ? 'That was the last prize. There is nothing more in the jar.'
                                      : eaten < 100
                                        ? 'Still nothing. We checked the jar twice.'
                                        : `${eaten} cookies. Your dentist has been notified.`}
                    </small>
                    {eaten >= COUPON_AT && (
                        <Link
                            className="text-link"
                            href={appLink('/usage/?tab=billing&reward=cookie')}
                        >
                            Claim your cookie reward
                        </Link>
                    )}
                </div>
            )}
            <button
                type="button"
                className="cookie-button"
                aria-label={open ? 'Close the cookie note' : 'Cookies'}
                aria-expanded={open}
                onClick={() => setOpen((value) => !value)}
            >
                <Cookie size={22} weight="regular" />
            </button>
        </div>
    );
}
