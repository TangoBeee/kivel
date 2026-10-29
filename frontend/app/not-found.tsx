import Link from 'next/link';
import { Icon } from '../components/icons';
import { catalog } from '../lib/catalog';

const popular = catalog.filter((tool) => tool.status === 'available' && tool.href).slice(0, 4);

export default function NotFound() {
    return (
        <div className="page-width not-found">
            <h1>A loose connection.</h1>
            <p>We couldn’t find that page. Head back home, or pick up one of these tools.</p>
            <div className="not-found-actions">
                <Link href="/" className="button button-primary">
                    Back home
                </Link>
                <Link href="/catalog/" className="button">
                    Explore tools
                </Link>
            </div>
            <nav className="not-found-tools" aria-label="Popular tools">
                {popular.map((tool) => (
                    <Link key={tool.id} href={tool.href!}>
                        <span className="not-found-icon">
                            <Icon name={tool.icon} size={18} />
                        </span>
                        <span>
                            <strong>{tool.name}</strong>
                            <span>{tool.description}</span>
                        </span>
                    </Link>
                ))}
            </nav>
        </div>
    );
}
