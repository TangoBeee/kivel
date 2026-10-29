'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Cookie, X } from '@phosphor-icons/react';
import { api, ApiError } from '../../lib/api';

const COUPON_AT = 20;
type Coupon =
    | { state: 'idle' }
    | { state: 'claiming' }
    | { state: 'won'; code: string; months: number }
    | { state: 'sign-in' }
    | { state: 'no'; message: string };

/** The cookie banner we don't need: a button that hands out a cookie and explains why. */
export function CookieJar() {
    const [open, setOpen] = useState(false);
    const [eaten, setEaten] = useState(0);
    const [coupon, setCoupon] = useState<Coupon>({ state: 'idle' });
    const [copied, setCopied] = useState(false);
    async function claim() {
        setCoupon({ state: 'claiming' });
        try {
            const result = await (await api('/api/coupons/cookie', { method: 'POST' })).json();
            setCoupon({ state: 'won', code: result.code, months: result.months });
        } catch (failure) {
            if (failure instanceof ApiError && failure.status === 401)
                setCoupon({ state: 'sign-in' });
            else
                setCoupon({
                    state: 'no',
                    message: failure instanceof Error ? failure.message : 'No coupon this time.',
                });
        }
    }
    function eat() {
        const next = eaten + 1;
        setEaten(next);
        if (next === COUPON_AT) void claim();
    }
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
                        onClick={eat}
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
                    {coupon.state === 'claiming' && <small>Baking your coupon…</small>}
                    {coupon.state === 'won' && (
                        <div className="cookie-coupon">
                            <span>10% off Pro or Team for {coupon.months} months</span>
                            <button
                                type="button"
                                onClick={async () => {
                                    try {
                                        await navigator.clipboard.writeText(coupon.code);
                                        setCopied(true);
                                    } catch {}
                                }}
                            >
                                <code>{coupon.code}</code>
                                <small>{copied ? 'Copied' : 'Copy'}</small>
                            </button>
                            <small>It is applied for you at checkout. One per person.</small>
                        </div>
                    )}
                    {coupon.state === 'sign-in' && (
                        <small>
                            A coupon is waiting.{' '}
                            <Link href="/account/#register">Create a free account</Link> or{' '}
                            <Link href="/account/">sign in</Link>, then eat 20 more.
                        </small>
                    )}
                    {coupon.state === 'no' && <small>{coupon.message}</small>}
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
