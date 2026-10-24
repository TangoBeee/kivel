export type CardFunding = 'credit' | 'debit' | 'prepaid';
export interface TestCardFixture {
    brand: 'visa' | 'mastercard' | 'amex' | 'discover';
    funding: CardFunding;
    number: string;
    paymentMethod: string;
}
export const testCardSource = 'https://docs.stripe.com/testing';
export const testCardFixtures: readonly TestCardFixture[] = [
    { brand: 'visa', funding: 'credit', number: '4242424242424242', paymentMethod: 'pm_card_visa' },
    {
        brand: 'mastercard',
        funding: 'credit',
        number: '5555555555554444',
        paymentMethod: 'pm_card_mastercard',
    },
    { brand: 'amex', funding: 'credit', number: '378282246310005', paymentMethod: 'pm_card_amex' },
    {
        brand: 'discover',
        funding: 'credit',
        number: '6011111111111117',
        paymentMethod: 'pm_card_discover',
    },
    {
        brand: 'visa',
        funding: 'debit',
        number: '4000056655665556',
        paymentMethod: 'pm_card_visa_debit',
    },
    {
        brand: 'mastercard',
        funding: 'debit',
        number: '5200828282828210',
        paymentMethod: 'pm_card_mastercard_debit',
    },
    {
        brand: 'mastercard',
        funding: 'prepaid',
        number: '5105105105105100',
        paymentMethod: 'pm_card_mastercard_prepaid',
    },
];
export const paymentGeneratorFunding = {
    'developer-credit-card-generator': 'credit',
    'developer-debit-card-generator': 'debit',
    'developer-prepaid-card-generator': 'prepaid',
} as const;
export const cardBrandNames = {
    visa: 'Visa',
    mastercard: 'Mastercard',
    amex: 'American Express',
    discover: 'Discover',
};
export interface GeneratedTestCard extends TestCardFixture {
    expiryMonth: number;
    expiryYear: number;
    cvc: string;
    holder: string;
}
export interface TestCardBatch {
    testOnly: true;
    provider: 'stripe';
    source: string;
    cards: GeneratedTestCard[];
}
export function generateTestCards(
    funding: CardFunding,
    options: { count?: string; brand?: string } = {},
    now = new Date(),
): TestCardBatch {
    const count = Number(options.count ?? '1');
    if (!Number.isInteger(count) || count < 1 || count > 20)
        throw new Error('Choose between 1 and 20 test cards.');
    const fixtures = testCardFixtures.filter(
        (card) =>
            card.funding === funding &&
            (!options.brand || options.brand === 'all' || card.brand === options.brand),
    );
    if (!fixtures.length) throw new Error('Choose a supported brand for this card type.');
    return {
        testOnly: true,
        provider: 'stripe',
        source: testCardSource,
        cards: Array.from({ length: count }, (_, index) => {
            const fixture = fixtures[index % fixtures.length]!;
            const cvcLength = fixture.brand === 'amex' ? 4 : 3;
            return {
                ...fixture,
                expiryMonth: now.getUTCMonth() + 1,
                expiryYear: now.getUTCFullYear() + 2,
                cvc: String(
                    crypto.getRandomValues(new Uint32Array(1))[0]! % 10 ** cvcLength,
                ).padStart(cvcLength, '0'),
                holder: 'TEST CARDHOLDER',
            };
        }),
    };
}
export function passesLuhn(number: string): boolean {
    if (!/^\d+$/.test(number)) return false;
    let sum = 0,
        double = false;
    for (let index = number.length - 1; index >= 0; index--) {
        let digit = Number(number[index]);
        if (double) {
            digit *= 2;
            if (digit > 9) digit -= 9;
        }
        sum += digit;
        double = !double;
    }
    return sum % 10 === 0;
}
export function inspectCardNumber(input: string) {
    if (input.length > 64 || !/^[\d -]+$/.test(input.trim()))
        throw new Error('Enter test digits, with optional spaces or hyphens.');
    const number = input.replace(/[ -]/g, '').trim();
    if (number.length < 13 || number.length > 19)
        throw new Error('Use a card number with 13 to 19 digits.');
    const fixture = testCardFixtures.find((card) => card.number === number);
    return {
        digits: number.length,
        last4: number.slice(-4),
        checksumValid: passesLuhn(number),
        recognizedTestCard: fixture
            ? { provider: 'stripe', brand: fixture.brand, funding: fixture.funding }
            : null,
        note: 'A checksum does not verify issuance, ownership, available funds, or payment acceptance.',
    };
}
