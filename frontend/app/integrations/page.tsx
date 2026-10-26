import Link from 'next/link';
import { PageIntro } from '../../components/content-layout';
import { CodeExample } from '../../components/code-example';
import { Icon } from '../../components/icons';
import { integrations } from '../../lib/integrations';
import { pageMetadata } from '../../lib/seo';
export const metadata = pageMetadata(
    'API, SDK, CLI, SSH & MCP integrations',
    'Use socket.help from HTTP and cURL, TypeScript, a command line, SSH, or an MCP agent. Practical examples, setup requirements, authentication, and package availability.',
    '/integrations/',
);
export default function Integrations() {
    return (
        <div className="content-page integrations-page">
            <PageIntro
                label="Integrations"
                title="Your workflow. The same toolbox."
                description="Connect from a terminal, application, or agent with the same resources, permissions, and hosted allowances."
            >
                <Link className="button button-primary" href="/docs/">
                    Read the quickstart →
                </Link>
                <Link className="button button-secondary" href="/account/">
                    Manage API keys
                </Link>
            </PageIntro>
            <nav className="integration-directory" aria-label="Choose an integration">
                {integrations.map((item) => (
                    <a key={item.id} href={`#${item.id}`}>
                        <Icon name={item.icon} size={23} />
                        <strong>{item.title}</strong>
                        <span>{item.description}</span>
                        <span className="text-link">View setup ↘</span>
                    </a>
                ))}
            </nav>
            <div className="integration-examples">
                {integrations.map((item) => (
                    <section id={item.id} key={item.id} className="integration-example">
                        <div>
                            <span className="content-tag">{item.availability}</span>
                            <h2>{item.title}</h2>
                            <p>{item.description}</p>
                            <p>{item.note}</p>
                        </div>
                        <CodeExample title={`${item.title} example`} code={item.code} />
                    </section>
                ))}
            </div>
            <section className="content-section">
                <h2>One access model to learn.</h2>
                <div className="explanation-grid">
                    <div>
                        <h3>Account keys</h3>
                        <p>
                            Create scoped keys in your workspace. Send{' '}
                            <code>Authorization: Bearer sh_…</code> for account access. Keys can be
                            revoked at any time. Workspace membership controls access to
                            account-owned resources.
                        </p>
                    </div>
                    <div>
                        <h3>Resource credentials</h3>
                        <p>
                            Anonymous resources return a management token. Private resources also
                            return a separate access token for callers. If an account key already
                            occupies Authorization, send the anonymous management token in{' '}
                            <code>X-Resource-Token</code>. Private callers send their access token
                            in X-Access-Token. Keep tokens out of URLs.
                        </p>
                    </div>
                    <div>
                        <h3>Local or hosted</h3>
                        <p>
                            Browser utilities process input on your device. API, SDK, CLI, SSH, and
                            MCP calls run on the server; input and results are not saved as
                            execution history.
                        </p>
                    </div>
                    <div>
                        <h3>Shared allowances</h3>
                        <p>
                            Switching interfaces does not reset quotas. All hosted clients share the
                            same workspace or anonymous allowances.{' '}
                            <Link href="/plans/">Compare the limits →</Link>
                        </p>
                    </div>
                </div>
            </section>
        </div>
    );
}
