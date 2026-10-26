'use client';
import { cardBrandNames } from '@socket-help/tools/payment-cards';
import type { TestCardBatch } from '@socket-help/tools/payment-cards';
import { CopyButton } from './copy-button';
import { Icon } from './icons';

export function PaymentCardPreview({ text }: { text: string }) {
    const batch = JSON.parse(text) as TestCardBatch;
    return (
        <section className="payment-card-results" aria-label="Generated sandbox cards">
            <p className="payment-results-count" role="status">
                {batch.cards.length} test {batch.cards.length === 1 ? 'fixture' : 'fixtures'} ready
            </p>
            <div className="payment-card-grid">
                {batch.cards.map((card, index) => {
                    const displayNumber =
                        card.brand === 'amex'
                            ? `${card.number.slice(0, 4)} ${card.number.slice(4, 10)} ${card.number.slice(10)}`
                            : card.number.match(/.{1,4}/g)!.join(' ');
                    const expiry = `${String(card.expiryMonth).padStart(2, '0')}/${String(card.expiryYear).slice(-2)}`;
                    return (
                        <article
                            className="payment-test-card"
                            key={index}
                            aria-label={`${cardBrandNames[card.brand]} ${card.funding} test fixture ${index + 1}`}
                        >
                            <div className="payment-card-top">
                                <span>
                                    <Icon name="receipt" size={18} />
                                    {cardBrandNames[card.brand]}
                                </span>
                                <span className="content-tag">{card.funding} · TEST</span>
                            </div>
                            <div className="payment-card-number">
                                <div>
                                    <span>Test card number</span>
                                    <strong>{displayNumber}</strong>
                                </div>
                                <CopyButton
                                    text={card.number}
                                    label={`Copy test number ${index + 1}`}
                                    compact
                                />
                            </div>
                            <dl className="payment-card-fields">
                                <div>
                                    <dt>Expiry</dt>
                                    <dd>{expiry}</dd>
                                </div>
                                <div>
                                    <dt>CVC</dt>
                                    <dd>{card.cvc}</dd>
                                </div>
                                <div>
                                    <dt>Cardholder</dt>
                                    <dd>{card.holder}</dd>
                                </div>
                            </dl>
                            <div className="payment-method">
                                <span>PaymentMethod</span>
                                <code>{card.paymentMethod}</code>
                                <CopyButton
                                    text={card.paymentMethod}
                                    label={`Copy PaymentMethod ${index + 1}`}
                                    compact
                                />
                            </div>
                        </article>
                    );
                })}
            </div>
            <p className="tool-notice">
                Published sandbox numbers repeat between fixtures. These are not issued cards and
                cannot fund live payments. For Stripe API tests, use the PaymentMethod identifier.
            </p>
        </section>
    );
}

export function CardValidationPreview({ text }: { text: string }) {
    const result = JSON.parse(text) as {
        digits: number;
        last4: string;
        checksumValid: boolean;
        recognizedTestCard: { brand: keyof typeof cardBrandNames; funding: string } | null;
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
                        ? ` · Known Stripe ${cardBrandNames[result.recognizedTestCard.brand]} ${result.recognizedTestCard.funding} fixture`
                        : ' · No bundled test fixture match'}
                </p>
                <p>This result does not verify an active account or authorize a payment.</p>
            </div>
        </section>
    );
}
