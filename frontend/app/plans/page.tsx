import { catalog, categories } from '../../lib/catalog';
import Link from 'next/link';
import { plans, type PlanId } from '@kivel.io/tools/plans';
import { PageIntro } from '../../components/content-layout';
import { pageMetadata } from '../../lib/seo';
import { Icon } from '../../components/icons';
import { StructuredData } from '../../components/content-layout';
import { FaqSection, absolute, faqSchema } from '../../components/content-blocks';
import { money, paidPlansEnabled, pricing } from '../../lib/pricing';
import { PlanAction, PlanBadge } from '../../components/plan-action';
export const metadata = pageMetadata(
    'Pricing, plans & API limits',
    'Compare Free, Pro and Team workspace limits for agents, API requests, storage and retention. Paid subscriptions are optional; Free needs no payment method.',
    '/plans/',
);
const ids = Object.keys(plans) as PlanId[];
const cardIds = ids.filter((id) => id !== 'anonymous');
const retention = (seconds: number) =>
    seconds < 86400 ? '1 hour' : `${seconds / 86400} ${seconds === 86400 ? 'day' : 'days'}`;
const number = (value: number) => value.toLocaleString('en-US');
const descriptions = {
    anonymous: 'Try it from an agent or the browser. No sign-up.',
    free: 'A workspace for you and up to 3 agents.',
    pro: 'For agents you use every day: 25 agents, forwarding and 30-day history.',
    team: 'One shared workspace for the whole team and its agents.',
};
const agents = (id: PlanId) =>
    plans[id].agents ? `${number(plans[id].agents)} connected agents` : '72 hour agent trials';
const questions = { anonymous: 'Not included', free: '20', pro: '200', team: '1,000' } as const;
const rows: { name: string; value: (id: PlanId) => string }[] = [
    {
        name: 'Connected agents',
        value: (id) => (plans[id].agents ? number(plans[id].agents) : 'Trials only'),
    },
    { name: 'Questions to you (ask_human) / day', value: (id) => questions[id] },
    { name: 'Active resources', value: (id) => number(plans[id].maxResources) },
    {
        name: 'Total storage',
        value: (id) =>
            plans[id].storageBytes >= 1073741824
                ? `${plans[id].storageBytes / 1073741824} GiB`
                : `${plans[id].storageBytes / 1048576} MiB`,
    },
    { name: 'Maximum retention', value: (id) => retention(plans[id].maxRetentionSeconds) },
    {
        name: 'Vault entries',
        value: (id) => (plans[id].credentials ? number(plans[id].credentials) : 'Not included'),
    },
    {
        name: 'TOTP authenticators',
        value: (id) =>
            plans[id].authenticators ? number(plans[id].authenticators) : 'Not included',
    },
    { name: 'Hosted utility runs / day', value: (id) => number(plans[id].runsPerDay) },
    { name: 'Utility input / request', value: (id) => `${plans[id].inputBytes / 1024} KiB` },
    { name: 'API requests / minute', value: (id) => number(plans[id].requestsPerMinute) },
    { name: 'Resource creations / minute', value: (id) => String(plans[id].creationsPerMinute) },
    { name: 'File size / upload', value: (id) => `${plans[id].fileBytes / 1048576} MiB` },
    {
        name: 'Persistent resource leases',
        value: (id) => (plans[id].persistent ? 'Included' : 'Not included'),
    },
    {
        name: 'Monitors',
        value: (id) =>
            ({
                anonymous: 'Not included',
                free: '20, every 5 min',
                pro: '100, every minute',
                team: '500, every minute',
            })[id],
    },
    {
        name: 'Agent memory',
        value: (id) =>
            plans[id].memoryBytes
                ? plans[id].memoryBytes >= 1073741824
                    ? `${plans[id].memoryBytes / 1073741824} GiB`
                    : `${plans[id].memoryBytes / 1048576} MiB`
                : 'Not included',
    },
    {
        name: 'Webhook forwarding to your server',
        value: (id) => (plans[id].persistent ? 'Included, with retries' : 'Not included'),
    },
    {
        name: 'Proxy & record real APIs',
        value: (id) => (plans[id].persistent ? 'Included' : 'Not included'),
    },
    {
        name: 'Custom webhook responses, mock call logs, MCP',
        value: () => 'Included',
    },
];

const extras: Record<PlanId, string[]> = {
    anonymous: [
        'Browser utilities, test data and public network checks',
        'Temporary HTTP, mock and file resources',
    ],
    free: [
        'Email, memory, monitors and authenticators',
        'Jobs, status pages and scoped agent keys',
    ],
    pro: ['Forward webhooks to your server', 'Proxy and record real APIs'],
    team: ['Everything in Pro, shared', 'Forwarding and proxy mocks for the team'],
};
const faqs = [
    {
        question: 'Is Kivel free?',
        answer: paidPlansEnabled
            ? 'Browser tools and the Free workspace are free within published allowances. Pro and Team are optional monthly subscriptions.'
            : 'Yes. The open beta is free. Browser tools work without an account, and a free account adds a workspace with published resource allowances. Paid plans are a preview and are not required to use the beta.',
    },
    {
        question: 'Is Team priced per seat?',
        answer: `No. Team is ${money(pricing.team.monthly)} a month for the whole workspace, with up to 20 members sharing its allowances.`,
    },
    {
        question: paidPlansEnabled
            ? 'Will my free account be charged automatically?'
            : 'Will the open beta charge me?',
        answer: paidPlansEnabled
            ? 'No. Anonymous and Free access require no payment method. Buying a subscription is an explicit action; a free account is not automatically converted or charged.'
            : 'No. Anonymous and Free access require no payment method. Pro and Team are planned monthly subscriptions; checkout is disabled during the free beta. There is no automatic conversion to a paid plan.',
    },
    {
        question: 'How do I cancel or change plans?',
        answer: 'Workspace owners manage subscriptions from Plan and billing in the workspace, which opens the Dodo Payments billing portal to change plans, update the card, or cancel.',
    },
    {
        question: 'What happens to failed or invalid runs?',
        answer: 'Invalid input and failed processing do not use the allowance. A completed API scenario report counts as one run even when its checks fail.',
    },
];

export default function Plans() {
    return (
        <div className="content-page plans-page">
            <StructuredData value={faqSchema(faqs)} />
            <StructuredData
                value={{
                    '@context': 'https://schema.org',
                    '@type': 'Product',
                    name: 'Kivel',
                    description: 'An online toolbox for developers, everyday users, and AI agents.',
                    url: absolute('/plans/'),
                    offers: [
                        { name: 'Free', price: 0 },
                        ...(paidPlansEnabled
                            ? [
                                  { name: 'Pro (monthly)', price: pricing.pro.monthly },
                                  { name: 'Team (monthly)', price: pricing.team.monthly },
                              ]
                            : []),
                    ].map((offer) => ({
                        '@type': 'Offer',
                        name: offer.name,
                        price: offer.price,
                        priceCurrency: pricing.currency,
                        url: absolute('/plans/'),
                    })),
                }}
            />
            <PageIntro
                title="Start with 3 agents free. $2 when you need more."
                description={
                    paidPlansEnabled
                        ? 'Every limit is listed below. Nothing is charged or blocked silently, and you can cancel anytime.'
                        : 'Every limit is listed below. During the open beta everything is free; Pro and Team open after it, and no account is ever charged automatically.'
                }
            />
            <p className="content-lede">
                One catalog of {catalog.filter((tool) => tool.status === 'available').length} tools
                across {categories.length} categories: HTTP and webhooks, email, mocks and OAuth,
                files, monitors, memory, authenticators, scheduled jobs and status pages, test data
                and media, developer utilities, DNS and network. Browser utilities are free. Hosted
                runs, storage and account requirements follow the limits below.
            </p>
            <div className="pricing-grid">
                {cardIds.map((id) => (
                    <section
                        key={id}
                        className={`pricing-card ${id === 'pro' ? 'is-featured' : ''}`}
                    >
                        <div className="pricing-card-top">
                            <h2>{plans[id].name}</h2>
                            <PlanBadge
                                id={id}
                                fallback={
                                    id === 'free' ? (
                                        <span className="content-tag">Start here</span>
                                    ) : undefined
                                }
                            />
                            {!paidPlansEnabled && (id === 'pro' || id === 'team') && (
                                <span className="content-tag">Planned</span>
                            )}
                        </div>
                        <p>{descriptions[id]}</p>
                        <div className="pricing-price">
                            {id === 'free' ? (
                                <>
                                    <strong>$0</strong>
                                    <span>No payment required</span>
                                </>
                            ) : (
                                <>
                                    <span className="price-figure price-monthly">
                                        <strong>{money(pricing[id].monthly)}</strong>
                                        <em>/ month</em>
                                    </span>
                                    <span className="price-monthly">
                                        {id === 'team'
                                            ? 'Per workspace, billed monthly'
                                            : 'Billed monthly'}
                                    </span>
                                </>
                            )}
                        </div>
                        <PlanAction id={id} name={plans[id].name} checkoutOpen={paidPlansEnabled} />
                        <ul>
                            {[
                                agents(id),
                                `${number(plans[id].maxResources)} active resources`,
                                rows[3]!.value(id) + ' storage',
                                `Up to ${retention(plans[id].maxRetentionSeconds)} retention`,
                                `${number(plans[id].runsPerDay)} hosted runs / day`,
                                id === 'team'
                                    ? 'Up to 20 workspace members'
                                    : plans[id].persistent
                                      ? 'Persistent resource leases'
                                      : 'Automatic resource cleanup',
                                ...extras[id],
                            ].map((feature) => (
                                <li key={feature}>
                                    <Icon name="check" size={15} />
                                    {feature}
                                </li>
                            ))}
                        </ul>
                    </section>
                ))}
            </div>
            <p className="pricing-after">
                No account? Agents can start a 72 hour trial, and the browser tools work without
                signing up.{' '}
                {paidPlansEnabled ? 'Paid plans are billed monthly through Dodo Payments.' : ''}{' '}
                <Link href="/refunds/">Refunds and cancellation</Link>
            </p>
            <section className="content-section">
                <h2>The details, side by side.</h2>
                <p>Allowances apply across the API, SDK, CLI, SSH, and MCP.</p>
                <div className="content-table-wrap">
                    <table className="content-table plan-comparison">
                        <caption>Hosted plan allowances</caption>
                        <thead>
                            <tr>
                                <th scope="col">Allowance</th>
                                {ids.map((id) => (
                                    <th key={id} scope="col">
                                        {plans[id].name}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr key={row.name}>
                                    <th scope="row">{row.name}</th>
                                    {ids.map((id) => (
                                        <td key={id}>{row.value(id)}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
            <section className="content-section">
                <h2>A few things to know.</h2>
                <div className="explanation-grid">
                    <div>
                        <h3>Usage is shared</h3>
                        <p>
                            Account keys and workspace members share the workspace’s allowances.
                            Anonymous limits use a protected IP identifier, so people on the same
                            connection share limits. Hosted runs reset at 00:00 UTC. Only successful
                            utility processing counts; failed validation and processing do not use
                            your allowance. A completed API scenario report counts once, including
                            failed checks.
                        </p>
                    </div>
                    <div>
                        <h3>One hour to start</h3>
                        <p>
                            Resources start with a one-hour lifetime. Set a longer TTL through the
                            API or renew from your workspace, within your plan’s maximum lifetime
                            from creation. Expired resources cannot be recovered.
                        </p>
                    </div>
                    <div>
                        <h3>Tool limits still apply</h3>
                        <p>
                            Files are limited to 10 MiB each. Inboxes hold 100 requests or 1 MiB
                            anonymously, and 1,000 requests or 10 MiB with an account. Public
                            endpoints have their own rate limits. Installation capacity can also
                            limit new allocations.
                        </p>
                    </div>
                    <div>
                        <h3>Persistent is a lease</h3>
                        <p>
                            Paid persistent resources last through the current subscription period
                            plus a 24-hour cleanup grace period. Successful renewals extend live
                            leases. Cancellation stops those extensions.
                        </p>
                    </div>
                </div>
            </section>
            <FaqSection faqs={faqs} title="Pricing questions" />
            <div className="content-end">
                <h2>Start free with your agent.</h2>
                <Link className="button button-primary" href="/connect/">
                    Connect your agent
                </Link>
            </div>
        </div>
    );
}
