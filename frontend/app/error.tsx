'use client';

import { Button } from '@radix-ui/themes';

export default function ErrorPage({ reset }: { reset: () => void }) {
    return (
        <div className="page-width not-found">
            <h1>Something interrupted the connection.</h1>
            <p>Try reloading this part of the page.</p>
            <Button size="3" variant="solid" color="green" onClick={reset}>
                Try again
            </Button>
        </div>
    );
}
