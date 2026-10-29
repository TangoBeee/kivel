import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Plus } from '@phosphor-icons/react/dist/ssr';
import { CopyPrompt } from '../components/home/copy-prompt';
import { LiveWebhook } from '../components/home/live-webhook';
import { LampField } from '../components/lamp-field';
import { Reveal } from '../components/landing/reveal';
import { paidPlansEnabled } from '../lib/pricing';
import { setupPrompt } from '../lib/setup-prompt';
import { siteOrigin } from '../lib/site';
import './home.css';

const title = 'socket.help | The internet toolkit for AI agents';
const description =
    'Webhook URLs, email inboxes, mock APIs, memory, monitors and human approval for coding agents, over one MCP connection. Agents sign themselves up and you approve them. Free to start, Pro is $2 a month.';

export const metadata: Metadata = {
    metadataBase: new URL(siteOrigin),
    title: { absolute: title },
    description,
    alternates: { canonical: '/' },
    openGraph: { type: 'website', url: '/', siteName: 'socket.help', title, description },
    twitter: { card: 'summary_large_image', title, description },
};

// The switchboard photograph and the part of it where the lamps sit, in image coordinates.
const HERO_ART = { width: 2400, height: 1906 };
const HERO_BOARD: [number, number, number, number] = [0.02, 0.3, 0.68, 0.6];

const clients = [
    'Claude Code',
    'Cursor',
    'Codex',
    'GitHub Copilot',
    'Windsurf',
    'Zed',
    'Gemini CLI',
];

// Each card shows the real tool call an agent makes and the shape of what comes back.
const tools = [
    {
        title: 'Catch the webhook.',
        body: 'A private URL that records every request. Your agent waits until Stripe or GitHub calls it, then reads the body.',
        call: 'wait_for_webhook()',
        result: '{ "type": "checkout.session.completed" }',
    },
    {
        title: 'Read the signup email.',
        body: 'A receive only inbox for sign up and reset tests. Codes and verification links come back extracted.',
        call: 'wait_for_email()',
        result: '{ "codes": ["482913"] }',
    },
    {
        title: 'Ask before it acts.',
        body: 'Before a deploy or a payment, your agent asks. You answer from a link; only you can approve.',
        call: 'ask_human("Deploy build 412?")',
        result: '{ "answer": "Deploy" }',
    },
];

const plans = [
    { name: 'Free', price: '$0', note: '3 agents, 7 days of history, hard limits, no card.' },
    { name: 'Pro', price: '$2', note: '25 agents, 30 days, forwarding and recorded mocks.' },
    { name: 'Team', price: '$6', note: '100 agents and one shared workspace for the team.' },
];

const faqs = [
    {
        question: 'What does my agent need to get started?',
        answer: 'Only the MCP address. Paste the setup prompt into Claude Code, Cursor or any MCP client and the agent adds the server, asks to join your workspace and waits for you to approve it.',
    },
    {
        question: 'Can an agent sign up without me?',
        answer: 'Yes, with a 72 hour trial key that has anonymous limits and a claim link for you. It joins your workspace, and counts against your plan, only after you approve it.',
    },
    {
        question: 'Can an agent approve its own request?',
        answer: 'No. Questions from ask_human can only be answered by a signed in owner or admin in a browser. API keys are refused, and opening the email link does not answer anything by itself.',
    },
    {
        question: 'What happens when I reach the free limit of 3 agents?',
        answer: 'The approval page lists your agents with when each was last active. Replace one, upgrade to Pro for 25 agents, or say no. Nothing is blocked or charged silently.',
    },
    {
        question: 'Does the email inbox send email?',
        answer: 'No. Inboxes are receive only, built for sign up and password reset tests. That keeps them out of spam fights and lets agents create them without a human.',
    },
    {
        question: 'How long does data stay?',
        answer: 'Anonymous resources last one hour. Free workspaces keep data up to 7 days, Pro 30 days and Team 90 days. Every resource can be deleted early.',
    },
    {
        question: 'I just want to format some JSON.',
        answer: 'The free browser tools are still here, with no account and no ads. Open Free tools in the menu.',
    },
];

const jsonLd = [
    {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'socket.help',
        url: `${siteOrigin}/`,
        applicationCategory: 'DeveloperApplication',
        description,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    },
    {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqs.map(({ question, answer }) => ({
            '@type': 'Question',
            name: question,
            acceptedAnswer: { '@type': 'Answer', text: answer },
        })),
    },
];

export default function Home() {
    return (
        <div className="home">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
                }}
            />

            <section className="home-hero" aria-labelledby="hero-heading">
                <div className="home-hero-art">
                    <img
                        src="/art/switchboard.webp"
                        alt=""
                        width={2400}
                        height={1906}
                        fetchPriority="high"
                    />
                    <LampField cover={HERO_ART} region={HERO_BOARD} spacing={20} every={240} />
                </div>
                <div className="home-container home-hero-copy">
                    <h1 id="hero-heading">
                        Give your coding agent <br />
                        the <em>internet</em>.
                    </h1>
                    <p>
                        Webhooks, email inboxes, mock APIs, memory and your approval, over one MCP
                        connection.
                    </p>
                    <div className="home-actions">
                        <CopyPrompt prompt={setupPrompt} className="home-pill home-pill-light" />
                        <Link href="/connect/" className="home-link home-link-light">
                            Read the setup guide
                        </Link>
                    </div>
                </div>
            </section>

            <section className="home-container home-problem" aria-labelledby="problem-heading">
                <Reveal className="home-problem-art">
                    <img
                        src="/art/operator-print.webp"
                        alt="A telephone operator at her switchboard console, 1943."
                        width={1400}
                        height={1133}
                        loading="lazy"
                    />
                </Reveal>
                <Reveal className="home-problem-copy">
                    <h2 id="problem-heading">
                        Your agent can write the code. It can&apos;t take the call.
                    </h2>
                    <p>
                        It cannot receive the Stripe webhook, open the verification email or ask you
                        before it deploys. So it stops, and waits for you.
                    </p>
                </Reveal>
            </section>

            <section className="home-container home-statement" aria-label="The idea">
                <Reveal>
                    <p>
                        socket.help is the <em>switchboard</em>.
                    </p>
                </Reveal>
            </section>

            <section className="home-tools" aria-labelledby="tools-heading">
                <div className="home-container">
                    <Reveal>
                        <h2 id="tools-heading">Everything it needs, over one connection.</h2>
                    </Reveal>
                    <div className="home-tool-grid">
                        {tools.map((tool) => (
                            <Reveal key={tool.title} className="home-tool">
                                <div className="home-tool-call" translate="no">
                                    <span>→ {tool.call}</span>
                                    <span>← {tool.result}</span>
                                </div>
                                <h3>{tool.title}</h3>
                                <p>{tool.body}</p>
                            </Reveal>
                        ))}
                    </div>
                    <p className="home-tools-more">
                        Also mock APIs, memory and uptime monitors.{' '}
                        <Link href="/docs/" className="home-link">
                            See every tool
                        </Link>
                    </p>
                </div>
            </section>

            <section className="home-container home-try" aria-labelledby="try-heading">
                <Reveal className="home-try-copy">
                    <h2 id="try-heading">
                        Try it. This URL is <em>live</em>.
                    </h2>
                    <p>
                        The same webhook inbox your agent gets. Send it a request and watch it
                        arrive.
                    </p>
                </Reveal>
                <LiveWebhook />
            </section>

            <section className="home-container home-charge" aria-labelledby="charge-heading">
                <Reveal className="home-charge-copy">
                    <h2 id="charge-heading">Agents sign up. You stay in charge.</h2>
                    <ol>
                        <li>Your agent asks to join and shows you a short code.</li>
                        <li>You approve it in your browser, once.</li>
                        <li>It gets its own key. Disconnect it any time.</li>
                    </ol>
                </Reveal>
                <Reveal className="home-charge-shot">
                    <img
                        src="/home/dashboard.webp"
                        alt="The socket.help dashboard: three agents connected, one question waiting for an answer, and recent agent activity."
                        width={2560}
                        height={1600}
                        loading="lazy"
                    />
                </Reveal>
            </section>

            <section className="home-container home-pricing" aria-labelledby="pricing-heading">
                <Reveal>
                    <h2 id="pricing-heading">
                        {paidPlansEnabled
                            ? 'Free to start. $2 when you grow.'
                            : 'Free in beta. $2 when you grow.'}
                    </h2>
                </Reveal>
                <div className="home-plans">
                    {plans.map((plan) => (
                        <div key={plan.name} className="home-plan">
                            <span>{plan.name}</span>
                            <strong>
                                {plan.price}
                                <small>/month</small>
                            </strong>
                            <p>{plan.note}</p>
                        </div>
                    ))}
                </div>
                <p className="home-pricing-note">
                    {paidPlansEnabled
                        ? 'Comparable agent email products start at $20 a month.'
                        : 'Paid plans open after the beta. Comparable agent email products start at $20 a month.'}{' '}
                    <Link href="/plans/" className="home-link">
                        Compare plans
                    </Link>
                </p>
            </section>

            <section className="home-container home-faq" aria-labelledby="faq-heading">
                <h2 id="faq-heading">Questions</h2>
                <div>
                    {faqs.map((faq) => (
                        <details key={faq.question}>
                            <summary>
                                {faq.question}
                                <Plus size={16} aria-hidden="true" />
                            </summary>
                            <p>{faq.answer}</p>
                        </details>
                    ))}
                </div>
            </section>

            <section className="home-container home-final" aria-labelledby="final-heading">
                <div className="home-final-copy">
                    <h2 id="final-heading">
                        Ready to give your agent the <em>internet</em>?
                    </h2>
                    <p>Paste one prompt into Claude Code, Cursor or Codex, and approve once.</p>
                    <div className="home-actions">
                        <CopyPrompt prompt={setupPrompt} className="home-pill" />
                        <Link href="/connect/" className="home-link">
                            Read the setup guide
                        </Link>
                    </div>
                    <p className="home-clients">Works with {clients.join(', ')}.</p>
                </div>
                <figure className="home-final-art">
                    <img
                        src="/art/exchange-print.webp"
                        alt="An international telephone exchange in 1938."
                        width={1600}
                        height={1020}
                        loading="lazy"
                    />
                    <figcaption>
                        Photographs: U.S. National Archives and Bell Telephone Magazine, via the
                        Internet Archive.
                    </figcaption>
                </figure>
            </section>
        </div>
    );
}
