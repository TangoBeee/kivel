import Link from 'next/link';
import { LiveLogo } from '../../../frontend/components/live-logo';

export default function Layout({ children }: { children: React.ReactNode }) {
    return (
        <>
            <div className="app-standalone-brand">
                <Link href="/" aria-label="Kivel workspace">
                    <LiveLogo size={28} />
                    Kivel
                </Link>
            </div>
            {children}
        </>
    );
}
