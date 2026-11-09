import Link from 'next/link';

export default function NotFound() {
    return (
        <div className="page-width not-found">
            <h1>Page not found</h1>
            <p>That workspace page is unavailable.</p>
            <Link href="/" className="button button-primary">
                Go to workspace
            </Link>
        </div>
    );
}
