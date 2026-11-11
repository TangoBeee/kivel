// Search copy for the tools people look for by name. Titles lead with the words searchers type;
// FAQs answer the questions those searches ask and are also published as FAQPage data.
export interface ToolSeo {
    title?: string;
    description: string;
    faq: readonly (readonly [string, string])[];
    // Tools a visitor to this page is likely to need next, across categories.
    related?: readonly string[];
}
export const toolSeo: Record<string, ToolSeo> = {
    'developer-fake-identity-generator': {
        description:
            'Generate realistic fake identities online: names, birthdays, addresses with real postal codes, phone numbers, emails, usernames, passwords, jobs and test card numbers for the US, UK, Canada, Australia, Germany and France. Free, no signup, JSON and CSV.',
        faq: [
            [
                'Is the fake identity generator free?',
                'Yes. It runs in your browser with no account, generates up to 100 people at a time and lets you download them as JSON or CSV. The same generator is available through the Kivel API, CLI and MCP server.',
            ],
            [
                'How realistic is the generated data?',
                'Each person gets a common first and last name for their country and birth decade, a real city with a matching postal code and area code, an address written the way locals write it, a plausible job, height, weight and blood type, plus a username and a strong password.',
            ],
            [
                'Can the phone numbers or emails reach a real person?',
                'No. Phone numbers come from ranges that Ofcom, NANPA, the Bundesnetzagentur, ARCEP and ACMA reserve for films and examples, and emails use the reserved example.com, example.net and example.org domains unless you enter your own domain.',
            ],
            [
                'Are the credit card numbers real?',
                'No. They pass the Luhn checksum that card forms validate, but they belong to no account and cannot be charged. Use the credit card generator for sandbox numbers from Stripe, Adyen, Braintree and PayPal.',
            ],
            [
                'Can I get the same people every time?',
                'Yes. Enter a seed and the generator returns the same records for the same options, which keeps snapshot tests and database seeds stable.',
            ],
            [
                'Which countries are supported?',
                'The United States, United Kingdom, Canada, Australia, Germany and France, each with local names, address formats, postal codes and phone formats.',
            ],
        ],
        related: [
            'developer-credit-card-generator',
            'email-temporary-email-inbox',
            'developer-test-bank-account-generator',
            'webhooks',
        ],
    },
    'developer-credit-card-generator': {
        title: 'Credit card generator: valid test card numbers with CVV and expiry',
        description:
            'Generate Luhn valid credit card numbers for Visa, Mastercard, American Express, Discover, JCB, Diners and UnionPay with CVV, expiry, holder name and billing address, or official Stripe, Adyen, Braintree and PayPal sandbox cards. Free, no signup.',
        faq: [
            [
                'Are these real credit card numbers?',
                'No. Generated numbers pass the Luhn checksum and use the right prefix and length for each brand, so card forms accept them, but no bank issued them and they cannot be charged.',
            ],
            [
                'Which numbers work in Stripe, Adyen, Braintree or PayPal test mode?',
                'Switch to sandbox mode and choose the provider. The tool returns the test cards that provider documents, with a link to its testing page.',
            ],
            [
                'Do the cards include a CVV and expiry date?',
                'Yes. Every card has a future expiry date, a CVV of the right length for its brand (four digits for American Express) and a holder name, with an optional billing address.',
            ],
            [
                'Can I export many cards at once?',
                'Yes. Generate a batch and download it as JSON or CSV, or call the same generator from the API, CLI or MCP server.',
            ],
            [
                'Is it legal to use a credit card generator?',
                'Generating numbers for testing forms, validation and payment sandboxes is legal. Trying to buy anything with a generated number is fraud and will be declined.',
            ],
        ],
        related: [
            'developer-debit-card-generator',
            'developer-prepaid-card-generator',
            'developer-fake-identity-generator',
            'developer-test-bank-account-generator',
        ],
    },
    'developer-debit-card-generator': {
        title: 'Debit card generator: valid test debit card numbers',
        description:
            'Generate Luhn valid Visa, Mastercard and other debit card numbers with CVV, expiry and billing address, or official sandbox debit cards for Stripe, Adyen, Braintree and PayPal. Free, no signup, JSON and CSV.',
        faq: [
            [
                'Are these real debit card numbers?',
                'No. They pass the Luhn check with the correct brand prefix and length but belong to no bank account and cannot be charged.',
            ],
            [
                'How is a debit card number different from a credit card number?',
                'The format is the same. The issuer decides whether a card is debit, credit or prepaid. In sandbox mode the tool returns cards your payment provider documents as debit, so funding checks behave as they would in production.',
            ],
        ],
        related: [
            'developer-credit-card-generator',
            'developer-prepaid-card-generator',
            'developer-fake-identity-generator',
        ],
    },
    webhooks: {
        title: 'Webhook tester: free webhook URL to inspect requests',
        description:
            'Get a free webhook URL and inspect every request live: headers, query, JSON body and signatures for Stripe, GitHub, Shopify, Slack, Twilio and more. Set a custom response and let your coding agent read the captures.',
        faq: [
            [
                'How do I get a free webhook URL?',
                'Open the webhook tester and Kivel creates an inbox with its own URL. Paste it into the service that sends webhooks and each request appears with its method, headers, query and body.',
            ],
            [
                'Can I verify webhook signatures?',
                'Yes. Choose the provider preset, add the signing secret and Kivel checks the signature on every captured request, including Stripe, GitHub, Shopify, Slack, Twilio, Paddle, Linear and Standard Webhooks.',
            ],
            [
                'Can I control the response?',
                'Yes. Set the status code, headers, body and an optional delay to see how the sender retries.',
            ],
            [
                'Is it a webhook.site alternative?',
                'Yes. Kivel covers request inspection and custom responses, and adds signature checks plus an MCP server so a coding agent can wait for and read requests itself.',
            ],
        ],
        related: [
            'mock-apis-webhook-event-simulator',
            'domains-temporary-callback-url',
            'email-temporary-email-inbox',
        ],
    },
    'email-temporary-email-inbox': {
        title: 'Email inbox for AI agents and signup tests: receive codes and links',
        description:
            'Create an email inbox your agent or test suite can read: receive signup emails, extract verification codes and magic links automatically, wait for the next message over the API and keep threads, attachments and rules in one place.',
        faq: [
            [
                'How do I get an email address for my agent?',
                'Create an inbox in Kivel and it gets its own address. Your agent reads it through the MCP server, the API or the CLI, and can wait for the next message instead of polling.',
            ],
            [
                'Can it pull out verification codes and magic links?',
                'Yes. Every message is parsed and the one time codes and sign in links are returned as separate fields, so a test or agent can continue a signup without reading the HTML.',
            ],
            [
                'Can I use it for automated signup and password reset tests?',
                'Yes. Create an address per run, trigger the email, then wait for it and assert on the subject, links and code from your test framework.',
            ],
        ],
        related: [
            'email-email-verification-tester',
            'developer-fake-identity-generator',
            'webhooks',
        ],
    },
};
