export type CardFunding = 'credit' | 'debit' | 'prepaid';
export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'discover' | 'jcb' | 'diners' | 'unionpay';
export type SandboxProvider = 'stripe' | 'adyen' | 'braintree' | 'paypal';
export interface TestCardFixture {
    brand: CardBrand;
    funding: CardFunding | 'unspecified';
    provider?: SandboxProvider;
    number: string;
    paymentMethod?: string;
    cvc?: string;
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
export const sandboxSources: Record<SandboxProvider, string> = {
    stripe: testCardSource,
    adyen: 'https://docs.adyen.com/development-resources/test-cards-and-credentials/test-card-numbers/',
    braintree: 'https://developer.paypal.com/braintree/docs/reference/general/testing/node',
    paypal: 'https://developer.paypal.com/sandbox-testing/card-testing',
};
export const sandboxCards: readonly TestCardFixture[] = [
    ...testCardFixtures.map((card) => ({ ...card, provider: 'stripe' as const })),
    {
        provider: 'adyen',
        brand: 'visa',
        funding: 'unspecified',
        number: '4035501000000008',
        cvc: '737',
    },
    {
        provider: 'adyen',
        brand: 'mastercard',
        funding: 'unspecified',
        number: '5555555555554444',
        cvc: '737',
    },
    {
        provider: 'adyen',
        brand: 'amex',
        funding: 'unspecified',
        number: '370000000000002',
        cvc: '7373',
    },
    {
        provider: 'adyen',
        brand: 'discover',
        funding: 'unspecified',
        number: '6011601160116611',
        cvc: '737',
    },
    {
        provider: 'adyen',
        brand: 'jcb',
        funding: 'unspecified',
        number: '3569990010095841',
        cvc: '737',
    },
    {
        provider: 'adyen',
        brand: 'diners',
        funding: 'unspecified',
        number: '36006666333344',
        cvc: '737',
    },
    { provider: 'braintree', brand: 'visa', funding: 'unspecified', number: '4111111111111111' },
    {
        provider: 'braintree',
        brand: 'mastercard',
        funding: 'unspecified',
        number: '2223000048400011',
    },
    { provider: 'braintree', brand: 'amex', funding: 'unspecified', number: '378282246310005' },
    {
        provider: 'braintree',
        brand: 'discover',
        funding: 'unspecified',
        number: '6011000991300009',
    },
    { provider: 'braintree', brand: 'jcb', funding: 'unspecified', number: '3530111333300000' },
    { provider: 'braintree', brand: 'diners', funding: 'unspecified', number: '36259600000004' },
    {
        provider: 'braintree',
        brand: 'unionpay',
        funding: 'unspecified',
        number: '6243030000000001',
    },
    { provider: 'paypal', brand: 'visa', funding: 'unspecified', number: '4012888888881881' },
    { provider: 'paypal', brand: 'mastercard', funding: 'unspecified', number: '2223000048400011' },
    { provider: 'paypal', brand: 'amex', funding: 'unspecified', number: '371449635398431' },
    { provider: 'paypal', brand: 'diners', funding: 'unspecified', number: '36461510000039' },
    { provider: 'paypal', brand: 'unionpay', funding: 'unspecified', number: '6200680000000004' },
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
    jcb: 'JCB',
    diners: 'Diners Club',
    unionpay: 'UnionPay',
};
export interface GeneratedTestCard extends TestCardFixture {
    expiryMonth: number;
    expiryYear: number;
    cvc: string;
    holder: string;
    billingAddress?: {
        line1: string;
        city: string;
        region: string;
        postalCode: string;
        country: string;
    };
}
export interface TestCardBatch {
    testOnly: true;
    mode: 'generated' | 'sandbox';
    provider?: SandboxProvider;
    source?: string;
    note: string;
    cards: GeneratedTestCard[];
}
const firstNames = [
    'Aisha',
    'Mateo',
    'Priya',
    'Oliver',
    'Mei',
    'Amara',
    'Luca',
    'Sofia',
    'Arjun',
    'Nora',
    'Hana',
    'Leo',
    'Zara',
    'Diego',
    'Yuki',
    'Maya',
    'Ibrahim',
    'Chloe',
    'Leila',
    'Kai',
    'Anika',
    'Noah',
    'Elena',
    'Ravi',
    'Ada',
    'Isabel',
    'Omar',
    'Eva',
    'Rosa',
    'Sana',
];
const lastNames = [
    'Patel',
    'Garcia',
    'Chen',
    'Okafor',
    'Silva',
    'Martin',
    'Kim',
    'Anderson',
    'Khan',
    'Rossi',
    'Nguyen',
    'Tanaka',
    'Ali',
    'Santos',
    'Wilson',
    'Singh',
    'Lopez',
    'Costa',
    'Bennett',
    'Dubois',
];
const addresses = [
    { line1: 'Example Lane', city: 'Portland', region: 'OR', postalCode: '97205', country: 'US' },
    {
        line1: 'Sample Road',
        city: 'London',
        region: 'London',
        postalCode: 'SW1A 1AA',
        country: 'GB',
    },
    {
        line1: 'Fixture Avenue',
        city: 'Toronto',
        region: 'ON',
        postalCode: 'M5V 2T6',
        country: 'CA',
    },
    { line1: 'Example Street', city: 'Sydney', region: 'NSW', postalCode: '2000', country: 'AU' },
    {
        line1: 'Sample Marg',
        city: 'Pune',
        region: 'Maharashtra',
        postalCode: '411001',
        country: 'IN',
    },
];
const random = (max: number) => crypto.getRandomValues(new Uint32Array(1))[0]! % max;
function shuffled<T>(values: T[]): T[] {
    for (let i = values.length - 1; i > 0; i--) {
        const j = random(i + 1);
        [values[i], values[j]] = [values[j]!, values[i]!];
    }
    return values;
}
function cardNumber(brand: CardBrand): string {
    const prefix = {
        visa: '4',
        mastercard: random(2) ? String(51 + random(5)) : String(2221 + random(500)),
        amex: random(2) ? '34' : '37',
        discover: random(2) ? '6011' : String(644 + random(6)),
        jcb: String(3528 + random(62)),
        diners: random(2) ? String(300 + random(6)) : '36',
        unionpay: '62',
    }[brand];
    const length = brand === 'amex' ? 15 : brand === 'diners' ? 14 : 16;
    let body = prefix;
    while (body.length < length - 1) body += random(10);
    for (let digit = 0; digit < 10; digit++) if (passesLuhn(body + digit)) return body + digit;
    throw new Error('Could not create a checksum.');
}
export function generateTestCards(
    funding: CardFunding,
    options: {
        count?: string;
        brand?: string;
        mode?: string;
        provider?: string;
        address?: string;
    } = {},
    now = new Date(),
): TestCardBatch {
    const count = Number(options.count ?? '1');
    if (!Number.isInteger(count) || count < 1 || count > 50)
        throw new Error('Choose between 1 and 50 test cards.');
    const mode = options.mode ?? 'generated';
    if (!['generated', 'sandbox'].includes(mode))
        throw new Error('Choose generated or sandbox mode.');
    const brand = options.brand ?? 'all';
    const brands = Object.keys(cardBrandNames) as CardBrand[];
    if (brand !== 'all' && !brands.includes(brand as CardBrand))
        throw new Error('Choose a supported card brand.');
    if (options.address !== undefined && !['true', 'false'].includes(options.address))
        throw new Error('Choose whether to include a billing address.');
    const provider = options.provider ?? 'stripe';
    if (!Object.hasOwn(sandboxSources, provider))
        throw new Error('Choose Stripe, Adyen, Braintree or PayPal.');
    const fixtures = sandboxCards.filter(
        (card) =>
            card.provider === provider &&
            (card.funding === 'unspecified' || card.funding === funding) &&
            (brand === 'all' || card.brand === brand),
    );
    if (mode === 'sandbox' && count > fixtures.length)
        throw new Error(
            `This selection has ${fixtures.length} distinct official numbers. Reduce the count or choose another provider or brand.`,
        );
    const holders = shuffled(
        firstNames.flatMap((first) => lastNames.map((last) => `${first} ${last}`)),
    );
    const expiries = shuffled(
        Array.from({ length: 60 }, (_, index) => ({
            expiryMonth: (index % 12) + 1,
            expiryYear: now.getUTCFullYear() + 1 + Math.floor(index / 12),
        })),
    );
    const cvcs = shuffled(
        Array.from({ length: 1000 }, (_, index) => String(index).padStart(3, '0')),
    );
    const numbers = new Set<string>();
    return {
        testOnly: true,
        mode: mode as TestCardBatch['mode'],
        ...(mode === 'sandbox'
            ? {
                  provider: provider as SandboxProvider,
                  source: sandboxSources[provider as SandboxProvider],
              }
            : {}),
        note:
            mode === 'sandbox'
                ? 'Official sandbox numbers work only in the named provider test environment; follow its documented expiry and security code requirements.'
                : 'Fake test data for forms and fixtures, not usable payment cards. Funding and billing details are synthetic, not issuer information.',
        cards: Array.from({ length: count }, (_, index) => {
            const fixture = mode === 'sandbox' ? fixtures[index]! : undefined;
            const selectedBrand =
                fixture?.brand ??
                (brand === 'all' ? brands[index % brands.length]! : (brand as CardBrand));
            let number = fixture?.number ?? cardNumber(selectedBrand);
            for (let attempts = 0; numbers.has(number); attempts++) {
                if (attempts > 100) throw new Error('Could not generate unique cards. Try again.');
                number = cardNumber(selectedBrand);
            }
            numbers.add(number);
            const address = addresses[index % addresses.length]!;
            return {
                ...(fixture ?? { brand: selectedBrand, funding }),
                number,
                ...expiries[index]!,
                ...(provider === 'adyen' && fixture ? { expiryMonth: 3, expiryYear: 2030 } : {}),
                cvc: fixture?.cvc ?? (selectedBrand === 'amex' ? '1' : '') + cvcs[index]!,
                holder: holders[index]!,
                ...(options.address === 'true'
                    ? { billingAddress: { ...address, line1: `${100 + index} ${address.line1}` } }
                    : {}),
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
    const fixture = sandboxCards.find((card) => card.number === number);
    return {
        digits: number.length,
        last4: number.slice(-4),
        checksumValid: passesLuhn(number),
        recognizedTestCard: fixture
            ? { provider: fixture.provider, brand: fixture.brand, funding: fixture.funding }
            : null,
        note: 'A checksum does not verify issuance, ownership, available funds, or payment acceptance.',
    };
}
