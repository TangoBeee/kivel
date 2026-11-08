'use client';

import { useRef } from 'react';
import { CheckCircle } from '@phosphor-icons/react';
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react';
import { Reveal, ScrollRise } from './reveal';

const stack = [
    {
        label: 'Magic links',
        rows: [
            ['Notion', 'Sign in to Notion', '4:31 AM'],
            ['Vercel', 'Log in link', '4:30 AM'],
            ['Figma', 'Your login link', '4:28 AM'],
        ],
    },
    {
        label: 'Signup codes',
        rows: [
            ['Slack', 'Code 771 204', '4:31 AM'],
            ['Supabase', 'Code 090 431', '4:29 AM'],
            ['Resend', 'Code 318 557', '4:27 AM'],
        ],
    },
    {
        label: 'Latest email',
        rows: [
            ['GitHub', 'Code 482 913', '4:31 AM'],
            ['Linear', 'Sign-in link', '4:29 AM'],
            ['Stripe', 'Verify your email', '4:26 AM'],
        ],
    },
];

function InboxStack() {
    const box = useRef<HTMLDivElement>(null);
    const still = useReducedMotion();
    const { scrollYProgress } = useScroll({ target: box, offset: ['start end', 'center center'] });
    const progress = useSpring(scrollYProgress, { stiffness: 110, damping: 26, mass: 0.5 });
    const spread = useTransform(progress, [0.2, 1], [0, 1]);
    const offsets = [
        { x: useTransform(spread, [0, 1], [0, 70]), y: useTransform(spread, [0, 1], [0, -70]) },
        { x: useTransform(spread, [0, 1], [0, 35]), y: useTransform(spread, [0, 1], [0, -35]) },
        { x: 0, y: 0 },
    ];
    return (
        <div ref={box} className="kv-stack" aria-hidden="true">
            <div className="kv-stack-plane">
                {stack.map((card, index) => (
                    <motion.div
                        key={card.label}
                        className="kv-stack-slot"
                        style={still ? undefined : offsets[index]}
                    >
                        {/* The slot follows the scroll and takes the hover; the card inside slides up and turns blue. */}
                        <div className="kv-stack-card">
                            <small>{card.label}</small>
                            {card.rows.map(([from, subject, time]) => (
                                <span key={from} className="kv-stack-row">
                                    <span className="kv-stack-line">
                                        <CheckCircle size={18} weight="bold" />
                                        <b>{from}</b> {subject}
                                        <time>{time}</time>
                                    </span>
                                </span>
                            ))}
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    );
}

function Cube({ className }: { className: string }) {
    return (
        <span className={`kv-cube ${className}`} aria-hidden="true">
            <span className="kv-cube-body">
                <i className="is-front" />
                <i className="is-back" />
                <i className="is-right" />
                <i className="is-left" />
                <i className="is-top" />
                <i className="is-bottom" />
            </span>
        </span>
    );
}

const endpoints = [
    ['GET', '/v1/users', '200'],
    ['POST', '/v1/charges', '402'],
    ['POST', '/oauth/token', '200'],
];

export function FeatureSplits() {
    return (
        <>
            <section className="kv-container kv-split" aria-labelledby="inbox-heading">
                <Reveal className="kv-split-copy">
                    <h2 id="inbox-heading" className="kv-split-title">
                        Real inboxes, codes extracted
                    </h2>
                    <p>
                        Your agent gets its own email address. Signup codes and magic links arrive
                        already pulled out of the message, so it can finish the flow without
                        guessing.
                    </p>
                </Reveal>
                <ScrollRise className="kv-split-art">
                    <InboxStack />
                </ScrollRise>
            </section>

            <section className="kv-container kv-split is-reversed" aria-labelledby="mock-heading">
                <ScrollRise className="kv-split-art kv-cubes">
                    <Cube className="is-1" />
                    <Cube className="is-2" />
                    <Cube className="is-3" />
                    <Cube className="is-4" />
                    <Cube className="is-5" />
                    <Cube className="is-6" />
                    <div className="kv-mock-panel" aria-hidden="true">
                        <small>Mock endpoints</small>
                        {endpoints.map(([method, path, status]) => (
                            <span key={path}>
                                <b>{method}</b> {path}
                                <em>{status}</em>
                            </span>
                        ))}
                    </div>
                </ScrollRise>
                <Reveal className="kv-split-copy">
                    <h2 id="mock-heading" className="kv-split-title">
                        Mock any API in seconds
                    </h2>
                    <p>
                        Fake Stripe, GitHub or your own service with real routes, test data and
                        failures. Add mock OAuth providers so your agent can test the hard paths
                        too.
                    </p>
                </Reveal>
            </section>
        </>
    );
}
