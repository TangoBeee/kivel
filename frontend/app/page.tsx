import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Plus } from '@phosphor-icons/react/dist/ssr';
import { Capabilities } from '../components/home/capabilities';
import { CopyPrompt } from '../components/home/copy-prompt';
import { LiveWebhook } from '../components/home/live-webhook';
import { RidgeField } from '../components/home/ridge-field';
import { Reveal } from '../components/landing/reveal';
import { TaglineReveal } from '../components/landing/tagline-reveal';
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

const clients = [
    { file: 'claude', name: 'Claude Code' },
    { file: 'cursor', name: 'Cursor' },
    { file: 'githubcopilot', name: 'GitHub Copilot' },
    { file: 'windsurf', name: 'Windsurf' },
    { file: 'zedindustries', name: 'Zed' },
    { file: 'cline', name: 'Cline' },
    { file: 'googlegemini', name: 'Gemini CLI' },
];

const joinSteps = [
    {
        title: 'Your agent asks to join',
        body: 'It calls start_login and shows you a link and a short code. Nothing is created yet.',
    },
    {
        title: 'You approve in your browser',
        body: 'You see its name and how many agents your plan allows. On a full plan, replace one or upgrade.',
    },
    {
        title: 'It gets its own key',
        body: 'The key goes straight to the agent, never through the chat. Disconnect it and it stops at once.',
    },
];

const pricing = [
    {
        name: 'socket.help Pro',
        price: '$2',
        note: 'Webhooks, email, mocks, memory, monitors and approvals',
        ours: true,
    },
    { name: 'AgentMail', price: '$20', note: 'Email inboxes' },
    { name: 'Inkbox', price: '$25', note: 'Email and phone identity' },
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
                <RidgeField />
                <div className="home-container home-hero-grid">
                    <div className="home-hero-copy">
                        <h1 id="hero-heading">
                            Give your coding agent <br />
                            the internet.
                        </h1>
                        <p>
                            Webhook URLs, email inboxes, mock APIs, memory and human approval over
                            one MCP connection. Agents sign themselves up.
                        </p>
                        <div className="home-actions">
                            <CopyPrompt prompt={setupPrompt} />
                            <Link href="/connect/" className="home-button home-button-ghost">
                                Setup guide
                                <ArrowRight size={16} weight="bold" />
                            </Link>
                        </div>
                    </div>
                    <LiveWebhook />
                </div>
            </section>

            <section className="home-clients" aria-label="Works with">
                <div className="home-container">
                    <p>Works with any MCP client</p>
                    <ul>
                        {clients.map((client) => (
                            <li key={client.file}>
                                <img
                                    src={`/logos/${client.file}.svg`}
                                    alt=""
                                    width={20}
                                    height={20}
                                    loading="lazy"
                                />
                                <span>{client.name}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </section>

            <section className="home-section home-container" aria-labelledby="caps-heading">
                <Reveal>
                    <h2 id="caps-heading" className="home-heading">
                        Everything it cannot do from a laptop.
                    </h2>
                    <p className="home-lede">
                        Six tools your agent calls directly. Each one returns what the agent needs
                        next, not a page to read.
                    </p>
                </Reveal>
                <Reveal>
                    <Capabilities />
                </Reveal>
            </section>

            <section className="home-section home-container" aria-labelledby="desk-heading">
                <Reveal>
                    <h2 id="desk-heading" className="home-heading">
                        One place to see what they did.
                    </h2>
                    <p className="home-lede">
                        Your agents, the questions waiting for you, every resource they created and
                        every tool they called. Disconnect an agent and its key stops at once.
                    </p>
                </Reveal>
                <Reveal className="home-desk">
                    <img
                        src="/home/dashboard.webp"
                        alt="The socket.help dashboard: two of three agents connected, one question waiting for an answer, usage and recent resources."
                        width={2560}
                        height={1600}
                        loading="lazy"
                    />
                </Reveal>
            </section>

            <section
                className="home-section home-container home-join"
                aria-labelledby="join-heading"
            >
                <Reveal className="home-join-copy">
                    <h2 id="join-heading" className="home-heading">
                        Agents sign up.
                        <br />
                        You stay in charge.
                    </h2>
                    <ol className="home-steps">
                        {joinSteps.map((step) => (
                            <li key={step.title}>
                                <h3>{step.title}</h3>
                                <p>{step.body}</p>
                            </li>
                        ))}
                    </ol>
                </Reveal>
                <Reveal className="home-shots">
                    <img
                        className="home-shot home-shot-back"
                        src="/home/approve-agent.webp"
                        alt="The approval page, where you connect an agent to your workspace."
                        width={1040}
                        height={765}
                        loading="lazy"
                    />
                    <img
                        className="home-shot home-shot-front"
                        src="/home/answer-question.webp"
                        alt="An agent asking whether to deploy build 412, with answer buttons."
                        width={1040}
                        height={958}
                        loading="lazy"
                    />
                </Reveal>
            </section>

            <section className="home-section home-container" aria-labelledby="price-heading">
                <Reveal>
                    <h2 id="price-heading" className="home-heading">
                        $2 a month. Not $20.
                    </h2>
                    <p className="home-lede">
                        Free covers 3 agents with hard caps and no card. Pro adds 25 agents, 30 day
                        history, forwarding and recorded mocks.
                    </p>
                </Reveal>
                <Reveal className="home-prices">
                    {pricing.map((plan) => (
                        <div key={plan.name} className={`home-price ${plan.ours ? 'is-ours' : ''}`}>
                            <span className="home-price-name">{plan.name}</span>
                            <span className="home-price-value">
                                {plan.price}
                                <small>/month</small>
                            </span>
                            <span className="home-price-note">{plan.note}</span>
                        </div>
                    ))}
                </Reveal>
                <p className="home-footnote">
                    Entry paid plans from each vendor’s pricing page, October 2026.{' '}
                    <Link href="/plans/">Compare our plans</Link>
                </p>
            </section>

            <section className="home-tagline home-container" aria-label="Summary">
                <TaglineReveal lines={['Your agent does the work.', 'You approve what matters.']} />
            </section>

            <section className="home-section home-container home-faq" aria-labelledby="faq-heading">
                <h2 id="faq-heading" className="home-heading">
                    Questions
                </h2>
                <div>
                    {faqs.map((faq) => (
                        <details key={faq.question}>
                            <summary>
                                {faq.question}
                                <Plus size={18} aria-hidden="true" />
                            </summary>
                            <p>{faq.answer}</p>
                        </details>
                    ))}
                </div>
            </section>

            <section className="home-final" aria-labelledby="final-heading">
                <div className="home-container">
                    <h2 id="final-heading">Paste one prompt. Approve once.</h2>
                    <p>Your agent handles the rest.</p>
                    <div className="home-actions home-actions-center">
                        <CopyPrompt prompt={setupPrompt} />
                    </div>
                </div>
            </section>
        </div>
    );
}
