import {
    Bell,
    ClockCounterClockwise,
    House,
    Key,
    Plugs,
    Plus,
    ShieldCheck,
    Stack,
    Tray,
    WebhooksLogo,
} from '@phosphor-icons/react/dist/ssr';
import { LogoMark } from '../logo';

const emails = [
    { from: 'GitHub', subject: 'Code 482 913', time: '4:31 AM' },
    { from: 'Linear', subject: 'Sign-in link', time: '4:29 AM' },
    { from: 'Stripe', subject: 'Verify your email', time: '4:26 AM' },
];
const hooks = [
    { route: 'POST /stripe', status: '200', time: '4:31 AM' },
    { route: 'POST /github', status: '200', time: '4:30 AM' },
    { route: 'POST /shopify', status: '202', time: '4:27 AM' },
];

/** A static picture of the Kivel dashboard, drawn in HTML so it stays sharp at every size. */
export function DashboardMock() {
    return (
        <div className="kv-dash" aria-hidden="true">
            <aside className="kv-dash-side">
                <LogoMark size={22} />
                <span className="kv-dash-create">
                    <Plus size={14} /> Create
                </span>
                <span className="kv-dash-nav is-active">
                    <House size={16} /> Home
                </span>
                <span className="kv-dash-nav">
                    <Tray size={16} /> Inboxes
                </span>
                <span className="kv-dash-nav">
                    <WebhooksLogo size={16} /> Webhooks
                </span>
                <span className="kv-dash-nav">
                    <Plugs size={16} /> Mocks
                </span>
                <span className="kv-dash-nav">
                    <ShieldCheck size={16} /> Approvals
                </span>
            </aside>
            <div className="kv-dash-main">
                <div className="kv-dash-top">
                    <strong>Home</strong>
                    <span className="kv-dash-tools">
                        <Stack size={15} />
                        <Key size={15} />
                        <Bell size={15} />
                        <ClockCounterClockwise size={15} />
                        <i />
                    </span>
                </div>
                <p className="kv-dash-date">Monday, November 9</p>
                <p className="kv-dash-hello">Good morning</p>
                <p className="kv-dash-stats">
                    <span>
                        <b>12</b> emails caught
                    </span>
                    <span>
                        <b>3</b> codes waiting
                    </span>
                    <span>
                        <b>2</b> agents online
                    </span>
                </p>
                {[0, 1, 2].map((row) => (
                    <div className="kv-dash-row" key={row}>
                        <div className="kv-dash-panel">
                            <small>Latest emails</small>
                            {emails.map((item) => (
                                <span key={item.from}>
                                    <em>{item.from}</em> {item.subject}
                                    <time>{item.time}</time>
                                </span>
                            ))}
                        </div>
                        <div className="kv-dash-panel">
                            <small>Webhooks</small>
                            {hooks.map((item) => (
                                <span key={item.route}>
                                    <em>{item.status}</em> {item.route}
                                    <time>{item.time}</time>
                                </span>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
