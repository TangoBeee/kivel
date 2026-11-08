// Glowing product glyphs for the landing page. Each one draws a Kivel resource, not a third-party logo.
import type { ReactNode } from 'react';

function Glyph({ id, stops, children }: { id: string; stops: string[]; children: ReactNode }) {
    return (
        <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
            <defs>
                <linearGradient
                    id={id}
                    x1="8"
                    y1="6"
                    x2="56"
                    y2="58"
                    gradientUnits="userSpaceOnUse"
                >
                    {stops.map((color, index) => (
                        <stop key={color} offset={index / (stops.length - 1)} stopColor={color} />
                    ))}
                </linearGradient>
            </defs>
            {children}
        </svg>
    );
}

/** An inbox envelope with a code badge: email with one-time codes extracted. */
export function InboxGlyph() {
    return (
        <Glyph id="kv-g-inbox" stops={['#ff4fd8', '#8b5cff', '#ff8a3d']}>
            <rect x="6" y="14" width="44" height="34" rx="9" fill="url(#kv-g-inbox)" />
            <path
                d="m12 22 16 12 16-12"
                stroke="#fff"
                strokeOpacity=".9"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <circle cx="48" cy="16" r="10" fill="#ffb347" />
            <path d="M44 16h8" stroke="#1a0f00" strokeWidth="3.5" strokeLinecap="round" />
        </Glyph>
    );
}

/** A hook that catches a request: webhook URLs. */
export function WebhookGlyph() {
    return (
        <Glyph id="kv-g-hook" stops={['#5ad2ff', '#2f7bff', '#2337ff']}>
            <path
                d="M40 10H54V24"
                stroke="url(#kv-g-hook)"
                strokeWidth="9"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path d="M52 12 31 33" stroke="url(#kv-g-hook)" strokeWidth="9" strokeLinecap="round" />
            <path
                d="M24 26a14 14 0 1 0 14 14"
                stroke="url(#kv-g-hook)"
                strokeWidth="9"
                strokeLinecap="round"
            />
        </Glyph>
    );
}

/** Two arrows chasing each other: mock APIs that answer like the real service. */
export function MockGlyph() {
    return (
        <Glyph id="kv-g-mock" stops={['#7b8cff', '#4052ee', '#2a2fd6']}>
            <path
                d="M14 30a18 18 0 0 1 31-12l4 4"
                stroke="url(#kv-g-mock)"
                strokeWidth="9"
                strokeLinecap="round"
            />
            <path d="M52 10v14H38" fill="url(#kv-g-mock)" />
            <path
                d="M50 34a18 18 0 0 1-31 12l-4-4"
                stroke="url(#kv-g-mock)"
                strokeWidth="9"
                strokeLinecap="round"
            />
            <path d="M12 54V40h14" fill="url(#kv-g-mock)" />
        </Glyph>
    );
}

/** A key with a six digit code: authenticators and the password vault. */
export function KeyGlyph() {
    return (
        <Glyph id="kv-g-key" stops={['#fff27a', '#ffd21f', '#ffb000']}>
            <circle cx="22" cy="24" r="14" stroke="url(#kv-g-key)" strokeWidth="9" />
            <path
                d="M32 34 52 54M44 46l6-6M38 40l5-5"
                stroke="url(#kv-g-key)"
                strokeWidth="8"
                strokeLinecap="round"
            />
        </Glyph>
    );
}
