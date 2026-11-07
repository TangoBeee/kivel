'use client';
import { cardBrandNames } from '@kivel/tools/payment-cards';
import type { TestCardBatch } from '@kivel/tools/payment-cards';
import { CopyButton } from './copy-button';
import { Icon } from './icons';
import { downloadBlob } from './result-preview';

export function PaymentCardPreview({ text }: { text: string }) {
    const batch = JSON.parse(text) as TestCardBatch;
    const columns = [
        'brand',
        'funding',
        'number',
        'holder',
        'expiryMonth',
        'expiryYear',
        'cvc',
        'provider',
        'paymentMethod',
        'line1',
        'city',
        'region',
        'postalCode',
        'country',
    ];
    const csv = [
        columns,
        ...batch.cards.map((card) =>
            columns.map(
                (key) =>
                    (card as unknown as Record<string, unknown>)[key] ??
                    (card.billingAddress as Record<string, string> | undefined)?.[key] ??
                    '',
            ),
        ),
    ]
        .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))
        .join('\r\n');
    return (
        <section className="payment-card-results" aria-label="Generated test cards">
            <div className="payment-export-row">
                <p className="payment-results-count" role="status">
                    {batch.cards.length} test {batch.cards.length === 1 ? 'card' : 'cards'} ready
                </p>
                <div className="button-row">
                    <button
                        className="button button-small"
                        onClick={() =>
                            downloadBlob(
                                new Blob([text], { type: 'application/json' }),
                                'test-cards.json',
                            )
                        }
                    >
                        Export JSON
                    </button>
                    <button
                        className="button button-small"
                        onClick={() =>
                            downloadBlob(
                                new Blob([csv], { type: 'text/csv;charset=utf-8' }),
                                'test-cards.csv',
                            )
                        }
                    >
                        Export CSV
                    </button>
                </div>
            </div>
            <div className="payment-card-grid">
                {batch.cards.map((card, index) => {
                    const displayNumber =
                        card.brand === 'amex' || card.brand === 'diners'
                            ? `${card.number.slice(0, 4)} ${card.number.slice(4, 10)} ${card.number.slice(10)}`
                            : card.number.match(/.{1,4}/g)!.join(' ');
                    const expiry = `${String(card.expiryMonth).padStart(2, '0')}/${String(card.expiryYear).slice(-2)}`;
                    const fields = [
                        ['Cardholder', card.holder],
                        ['Expiry', expiry],
                        ['CVV', card.cvc],
                        ['Card type', card.funding],
                        ['Brand', cardBrandNames[card.brand]],
                    ];
                    if (card.provider) fields.push(['Provider', card.provider]);
                    if (card.paymentMethod) fields.push(['PaymentMethod', card.paymentMethod]);
                    if (card.billingAddress) fields.push(...Object.entries(card.billingAddress));
                    return (
                        <article
                            className="payment-test-card"
                            key={card.number}
                            aria-label={`${cardBrandNames[card.brand]} test card ${index + 1}`}
                        >
                            <div className="payment-card-top">
                                <strong>{cardBrandNames[card.brand]}</strong>
                                <span className="content-tag">TEST DATA</span>
                            </div>
                            <svg
                                className="payment-card-chip"
                                width="38"
                                height="30"
                                viewBox="0 0 38 30"
                                aria-hidden="true"
                            >
                                <rect
                                    x="1"
                                    y="1"
                                    width="36"
                                    height="28"
                                    rx="5"
                                    fill="none"
                                    stroke="currentColor"
                                />
                                <path
                                    d="M13 1v28M25 1v28M1 10h12m12 0h12M1 20h12m12 0h12M13 15h12"
                                    fill="none"
                                    stroke="currentColor"
                                />
                            </svg>
                            <div className="payment-card-number">
                                <strong>{displayNumber}</strong>
                                <CopyButton
                                    text={card.number}
                                    label={`Copy number ${index + 1}`}
                                    compact
                                />
                            </div>
                            <dl className="payment-card-fields">
                                {fields.map(([label, value]) => (
                                    <div key={label}>
                                        <dt>{label}</dt>
                                        <dd>
                                            <span>{value}</span>
                                            <CopyButton
                                                text={value!}
                                                label={`Copy ${label!.toLowerCase()} ${index + 1}`}
                                                compact
                                            />
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                        </article>
                    );
                })}
            </div>
            <p className="tool-notice">
                {batch.note}{' '}
                {batch.source && (
                    <a href={batch.source} target="_blank" rel="noreferrer">
                        Provider documentation
                    </a>
                )}
            </p>
        </section>
    );
}

export function CardValidationPreview({ text }: { text: string }) {
    const result = JSON.parse(text) as {
        digits: number;
        last4: string;
        checksumValid: boolean;
        recognizedTestCard: {
            provider: string;
            brand: keyof typeof cardBrandNames;
            funding: string;
        } | null;
    };
    return (
        <section
            className={`payment-validation ${result.checksumValid ? 'is-passing' : 'is-failing'}`}
            aria-label="Checksum result"
            role="status"
        >
            <Icon name={result.checksumValid ? 'check' : 'info'} size={22} />
            <div>
                <strong>
                    {result.checksumValid ? 'Checksum passes' : 'Checksum does not match'}
                </strong>
                <p>
                    {result.digits} digits · ending in {result.last4}
                    {result.recognizedTestCard
                        ? ` · Known ${result.recognizedTestCard.provider} ${cardBrandNames[result.recognizedTestCard.brand]} ${result.recognizedTestCard.funding} fixture`
                        : ' · No bundled test fixture match'}
                </p>
                <p>This result does not verify an active account or authorize a payment.</p>
            </div>
        </section>
    );
}
