import type { Article } from './articles';
const source = {
    title: 'Stripe: official sandbox cards and PaymentMethod fixtures',
    url: 'https://docs.stripe.com/testing',
};
export const paymentArticles: Article[] = [
    {
        slug: 'credit-card-generator-for-testing',
        publishedAt: '2026-10-26',
        icon: 'receipt',
        title: 'Credit card generators for testing: what the output means',
        category: 'Payment testing',
        description:
            'Create clearly labeled credit-card fixtures for checkout tests. Understand sandbox numbers, sample CVCs, PaymentMethod identifiers, and checksum limits.',
        sections: [
            {
                id: 'purpose',
                title: 'Generate a fixture, not an account',
                paragraphs: [
                    'A credit card generator is useful when you are building a payment form, writing a test, or checking how a card summary looks. Its output should be recognizable as test data, with no real customer information mixed in.',
                    'The socket.help tool combines published Stripe sandbox numbers with a future expiry, a sample CVC, and the name TEST CARDHOLDER. It does not issue a card or create an account. The same documented card number can appear in multiple records; the number is a reusable fixture, not a unique identifier.',
                ],
            },
            {
                id: 'generate',
                title: 'Pick a brand and generate',
                paragraphs: [
                    'Open the Credit card generator, choose all supported brands or one brand, and request between one and 20 records. Credit fixtures include Visa, Mastercard, American Express, and Discover.',
                    'The preview shows the number, expiry, CVC, and PaymentMethod identifier. Copy a number for a manual sandbox form test, or download the JSON to organize sample records in your project. Generating in the browser keeps the operation on your device.',
                ],
            },
            {
                id: 'automation',
                title: 'Use the right fixture in automated tests',
                paragraphs: [
                    'Stripe recommends its test PaymentMethod identifiers for API test code rather than sending raw card numbers. The tool includes the matching identifier so a fixture can support both a manual form check and a provider API test.',
                    'You can also generate the same structured output through the socket.help API. Hosted generation uses the normal tool allowance. The response output is JSON text; parse it once before reading the cards array.',
                ],
                code: {
                    title: 'Generate two credit-card fixtures',
                    value: `curl https://socket.help/api/tools/developer-credit-card-generator/run \\
  -H 'Content-Type: application/json' \\
  -d '{"options":{"brand":"visa","count":"2"}}'`,
                },
            },
            {
                id: 'coverage',
                title: 'Check the interface as well as the request',
                paragraphs: [
                    'Verify that your form accepts the intended number length, displays the right brand, keeps the expiry readable, and handles the different CVC length on an American Express fixture. Check keyboard entry, validation messages, and narrow layouts.',
                    'These fixtures cover successful sandbox scenarios. For declines or authentication challenges, choose the corresponding fixture from your provider’s documentation. A random number that passes Luhn does not select a particular payment outcome.',
                ],
            },
            {
                id: 'limits',
                title: 'Keep the boundaries visible',
                paragraphs: [
                    'Generated records are labeled testOnly and identify their source. They are for the named provider’s sandbox and do not guarantee compatibility with another payment processor.',
                    'Use separate fixture IDs in your own test records when uniqueness matters. Do not use a card number as an application record key, and do not put real customer card data into a general-purpose developer tool.',
                ],
            },
        ],
        sources: [source],
        related: [
            { title: 'Credit card generator', href: '/tools/credit-card-generator/' },
            { title: 'Debit card generator', href: '/tools/debit-card-generator/' },
            { title: 'What a Luhn check proves', href: '/blog/card-number-validation-luhn/' },
        ],
    },
    {
        slug: 'debit-card-generator-for-checkout-tests',
        publishedAt: '2026-10-26',
        icon: 'receipt',
        title: 'Using debit-card test data in a checkout flow',
        category: 'Payment testing',
        description:
            'Generate debit-card sandbox fixtures, preserve the funding label in tests, and check your checkout without using real banking details.',
        sections: [
            {
                id: 'separate',
                title: 'Keep debit fixtures separate',
                paragraphs: [
                    'A payment interface may need to show or handle a provider’s funding classification. A debit-card fixture lets you exercise that branch intentionally, instead of assuming that every Visa or Mastercard record represents the same funding type.',
                    'The socket.help Debit card generator uses the provider’s published Visa debit and Mastercard debit test fixtures. Funding labels come from that fixture list; the tool does not infer a live account’s funding type from a number.',
                ],
            },
            {
                id: 'create',
                title: 'Create a small, labeled dataset',
                paragraphs: [
                    'Choose a supported brand and generate one to 20 records. Each result includes funding: debit, a sandbox number, sample expiry and CVC values, and a matching PaymentMethod identifier.',
                    'Use the card preview for a manual form test or copy the JSON into a development fixture file. Published numbers repeat when you request multiple records of the same brand. Add your own record IDs when your test needs distinct application objects.',
                ],
                code: {
                    title: 'Generate a Mastercard debit fixture',
                    value: `curl https://socket.help/api/tools/developer-debit-card-generator/run \\
  -H 'Content-Type: application/json' \\
  -d '{"options":{"brand":"mastercard","count":"1"}}'`,
                },
            },
            {
                id: 'exercise',
                title: 'Assert the behavior you own',
                paragraphs: [
                    'Check that a debit result is displayed with the right funding label, that the saved-payment summary remains readable, and that the form preserves the entered values when a request fails.',
                    'Use the provider’s test environment for payment behavior. Your local UI fixtures can test rendering and branching, but they do not prove how a particular bank, account, or live transaction will behave. A checksum check cannot establish that either.',
                ],
            },
            {
                id: 'interfaces',
                title: 'Use the same data from a script',
                paragraphs: [
                    'The generator is available through the shared socket.help execution endpoint. SDK, CLI, SSH, and MCP clients use the same tool ID and string options. Browser generation is local; hosted calls count toward the normal daily allowance.',
                    'Store these records as clearly named test fixtures. They are public sandbox values, not customer banking details, and they should not be used to attempt live payments.',
                ],
            },
        ],
        sources: [source],
        related: [
            { title: 'Debit card generator', href: '/tools/debit-card-generator/' },
            {
                title: 'Credit-card testing guide',
                href: '/blog/credit-card-generator-for-testing/',
            },
            { title: 'API and client setup', href: '/integrations/' },
        ],
    },
    {
        slug: 'prepaid-card-test-fixtures',
        publishedAt: '2026-10-26',
        icon: 'receipt',
        title: 'Prepaid-card fixtures for payment integration tests',
        category: 'Payment testing',
        description:
            'Create a prepaid sandbox fixture and test funding-aware UI. Understand reusable numbers, provider-specific behavior, and what the generator does not simulate.',
        sections: [
            {
                id: 'why',
                title: 'Make the funding case explicit',
                paragraphs: [
                    'If your application shows a funding label or branches on a provider’s card metadata, include a prepaid fixture in the test dataset. An explicit case is easier to understand than a generic card object whose intended meaning is hidden.',
                    'The socket.help Prepaid card generator currently supplies the published Stripe Mastercard prepaid fixture. The interface shows that supported brand directly rather than offering combinations the tool cannot provide.',
                ],
            },
            {
                id: 'generate',
                title: 'Generate and inspect the record',
                paragraphs: [
                    'Choose a record count from one to 20, then generate. Each preview includes the same documented prepaid number with sample expiry and CVC values, the funding label, and a PaymentMethod identifier.',
                    'Copy a field for a manual sandbox test, or download the JSON for your project. Multiple generated records do not represent separate issued prepaid accounts, stored balances, or redeemable value.',
                ],
                code: {
                    title: 'Generate a prepaid fixture with the CLI',
                    value: `socket-help run developer-prepaid-card-generator \\
  --options '{"count":"1"}' < /dev/null`,
                },
            },
            {
                id: 'test',
                title: 'Test the rule, not an invented balance',
                paragraphs: [
                    'For a funding-aware interface, assert that the prepaid label appears and that the intended branch of your own application runs. Include a credit or debit fixture as a comparison case.',
                    'This generator does not simulate loading money, spending down a balance, redeeming a gift card, or an issuer’s rules. If a workflow depends on those behaviors, use the specific provider’s testing facilities. Changing the sample CVC does not create a new payment scenario.',
                ],
            },
            {
                id: 'repeat',
                title: 'Keep fixtures repeatable',
                paragraphs: [
                    'Use the documented PaymentMethod identifier when testing Stripe APIs. For application-only tests, name the fixture by its role, such as prepaid-card-summary, and assert the behavior you expect.',
                    'The generator runs locally in the browser and through the same hosted execution interface as other utilities. No file or temporary account is created, so there is no resource lease to manage; hosted usage quotas still apply.',
                ],
            },
        ],
        sources: [source],
        related: [
            { title: 'Prepaid card generator', href: '/tools/prepaid-card-generator/' },
            { title: 'Debit card generator', href: '/tools/debit-card-generator/' },
            { title: 'Plans and hosted limits', href: '/plans/' },
        ],
    },
    {
        slug: 'card-number-validation-luhn',
        publishedAt: '2026-10-26',
        icon: 'fingerprint',
        title: 'What a Luhn card-number check can and cannot tell you',
        category: 'Validation basics',
        description:
            'Understand card-number checksum validation, test valid and invalid inputs, and avoid treating a passing Luhn check as proof of a real or usable payment card.',
        sections: [
            {
                id: 'checksum',
                title: 'A checksum is a typing check',
                paragraphs: [
                    'Luhn is a checksum calculation over a sequence of digits. It helps detect many common entry mistakes. It does not contact an issuer, inspect an account, or authorize a payment.',
                    'A generated or invented number can pass the calculation without belonging to any issued card. The result is therefore useful for form validation and test fixtures, but is not evidence of ownership, available funds, or payment acceptance.',
                ],
            },
            {
                id: 'calculation',
                title: 'How the calculation works',
                paragraphs: [
                    'Starting at the rightmost digit, keep the first digit unchanged and double every second digit while moving left. When a doubled digit is greater than nine, subtract nine. Add the resulting values together.',
                    'The number passes when the total is divisible by ten. The socket.help checker accepts 13 to 19 digits, allowing spaces and hyphens for readability, and returns the checksum result without echoing the full number.',
                ],
                code: {
                    title: 'Check a published sandbox number',
                    value: `curl https://socket.help/api/tools/developer-card-number-validator/run \\
  -H 'Content-Type: application/json' \\
  -d '{"input":"4242 4242 4242 4242"}'`,
                },
            },
            {
                id: 'result',
                title: 'Read each output field literally',
                paragraphs: [
                    'checksumValid reports only the mathematical result. digits gives the normalized length, and last4 helps identify the fixture without repeating the whole input.',
                    'recognizedTestCard is populated only when the number exactly matches a fixture bundled with these generators. It identifies that known sandbox example; a null value does not establish whether an arbitrary number is real or fake.',
                ],
            },
            {
                id: 'cases',
                title: 'Include negative cases in your form tests',
                paragraphs: [
                    'Use a known test number as a positive case, then change its final digit for a failing-checksum case. Also test empty input, unsupported characters, a too-short value, and a too-long value.',
                    'Check that your interface explains the problem without losing other fields or leaving keyboard focus in an unusable state. After local validation, payment outcomes still belong to the payment provider’s sandbox flow. Use test data in this checker, not customer card details.',
                ],
            },
        ],
        sources: [source],
        related: [
            { title: 'Card number validator', href: '/tools/card-number-validator/' },
            { title: 'Credit card generator', href: '/tools/credit-card-generator/' },
            { title: 'Payment testing guide', href: '/blog/credit-card-generator-for-testing/' },
        ],
    },
];
