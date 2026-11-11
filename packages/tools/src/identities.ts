import type { OperationOptions } from './definitions.js';
import { passesLuhn } from './payment-cards.js';
import {
    companyFields,
    companyNames,
    identityLocales,
    jobTitles,
    olderFemale,
    olderMale,
    type IdentityLocale,
    type LocaleData,
    type Place,
} from './identity-data.js';

export const identityLimit = 100;
type Random = () => number;

// A seed makes a batch repeatable for snapshot tests; without one every run is fresh.
function generator(seed?: string): Random {
    if (!seed) {
        return () => crypto.getRandomValues(new Uint32Array(1))[0]! / 0x100000000;
    }
    let state = 2166136261;
    for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
    return () => {
        state = (state + 0x6d2b79f5) | 0;
        let value = Math.imul(state ^ (state >>> 15), 1 | state);
        value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
        return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
    };
}
function tools(random: Random) {
    const int = (max: number) => Math.floor(random() * max);
    const between = (min: number, max: number) => min + int(max - min + 1);
    const pick = <T>(items: readonly T[]): T => items[int(items.length)]!;
    const digits = (length: number) => Array.from({ length }, () => int(10)).join('');
    const chance = (p: number) => random() < p;
    // Box–Muller, clamped, for heights and weights that cluster like real ones.
    const normal = (mean: number, sd: number, min: number, max: number) => {
        const value =
            mean + sd * Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
        return Math.min(max, Math.max(min, value));
    };
    return { int, between, pick, digits, chance, normal };
}
type Tools = ReturnType<typeof tools>;

const ascii = (value: string) =>
    value
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/ß/g, 'ss')
        .replace(/ı/g, 'i')
        .replace(/ş/g, 's')
        .replace(/ç/g, 'c')
        .replace(/[^A-Za-z0-9]/g, '')
        .toLowerCase();
const display = (value: string) =>
    value.replace(/^O(Brien|Neill|Neal|Connor|Connell|Donnell)$/, "O'$1");

function postalCode(locale: IdentityLocale, place: Place, t: Tools) {
    const stem = t.pick(place.postal);
    if (locale === 'en-GB') {
        const letters = 'ABDEFGHJLNPQRSTUWXYZ';
        return `${stem} ${t.int(10)}${t.pick([...letters])}${t.pick([...letters])}`;
    }
    if (locale === 'en-CA') {
        const letters = 'ABCEGHJKLMNPRSTVWXYZ';
        return `${stem} ${t.int(10)}${t.pick([...letters])}${t.int(10)}`;
    }
    return stem;
}
function street(locale: IdentityLocale, data: LocaleData, t: Tools) {
    const name = t.pick(data.streets);
    if (locale === 'de-DE')
        return `${name} ${t.between(1, 140)}${t.chance(0.1) ? t.pick(['a', 'b']) : ''}`;
    if (locale === 'fr-FR') {
        const number = t.between(1, 180);
        const repeat = t.chance(0.06) ? ' bis' : '';
        return `${number}${repeat} ${t.pick(data.suffixes)} ${name}`;
    }
    const number = locale === 'en-US' ? t.between(100, 9899) : t.between(1, 240);
    const suffix = name.startsWith('The ') ? '' : ` ${t.pick(data.suffixes)}`;
    return `${number} ${name}${suffix}`;
}
function secondLine(locale: IdentityLocale, t: Tools) {
    if (!t.chance(locale === 'de-DE' || locale === 'fr-FR' ? 0.12 : 0.22)) return undefined;
    switch (locale) {
        case 'en-US':
            return `${t.pick(['Apt', 'Apt', 'Unit', 'Suite', '#'])} ${t.between(1, 32)}${t.pick(['', '', 'A', 'B', 'C'])}`;
        case 'en-CA':
            return `${t.pick(['Unit', 'Apt', 'Suite'])} ${t.between(101, 2408)}`;
        case 'en-GB':
            return `Flat ${t.between(1, 24)}`;
        case 'en-AU':
            return `Unit ${t.between(1, 18)}`;
        case 'de-DE':
            return `${t.between(1, 5)}. OG`;
        case 'fr-FR':
            return `Bâtiment ${t.pick(['A', 'B', 'C'])}, ${t.between(1, 6)}e étage`;
    }
}
// Every number below sits in a block the national regulator reserves for drama and examples.
function phone(locale: IdentityLocale, place: Place, t: Tools) {
    switch (locale) {
        case 'en-US':
        case 'en-CA': {
            const line = `01${t.digits(2)}`;
            return { phone: `(${place.dial}) 555-${line}`, e164: `+1${place.dial}555${line}` };
        }
        case 'en-GB': {
            const national = `${place.dial}${t.digits(3)}`;
            return { phone: national, e164: `+44${national.replace(/\s/g, '').slice(1)}` };
        }
        case 'de-DE': {
            const national = `${place.dial}${t.digits(3)}`;
            return { phone: national, e164: `+49${national.replace(/\s/g, '').slice(1)}` };
        }
        case 'fr-FR': {
            const rest = t.digits(4);
            const national = `${place.dial} ${rest.slice(0, 2)} ${rest.slice(2)}`;
            return { phone: national, e164: `+33${national.replace(/\s/g, '').slice(1)}` };
        }
        case 'en-AU': {
            const national = `${place.dial} ${t.digits(4)}`;
            return { phone: national, e164: `+61${national.replace(/\s/g, '').slice(1)}` };
        }
    }
}
function company(locale: IdentityLocale, data: LocaleData, last: string, t: Tools) {
    const ending = t.pick(data.companyEnd);
    const tail = ending ? ` ${ending}` : '';
    if (locale === 'de-DE')
        return `${t.chance(0.5) ? display(t.pick(data.last)) : t.pick(companyNames)} ${t.pick(companyFields.de)}${tail}`;
    if (locale === 'fr-FR') return `${t.pick(companyFields.fr)} ${t.pick(data.last)}${tail}`;
    const founder = display(t.chance(0.3) ? last : t.pick(data.last));
    const base = t.chance(0.6)
        ? t.pick(companyNames)
        : `${founder}${t.chance(0.4) ? ' & ' + display(t.pick(data.last)) : ''}`;
    const field = t.pick(companyFields.en);
    const end = base.includes('&') || field.includes('&') ? tail.replace(/ & Co$/, '') : tail;
    return `${base} ${field}${end}`;
}
function birthDate(minAge: number, maxAge: number, t: Tools, now: Date) {
    const latest = new Date(now);
    latest.setUTCFullYear(latest.getUTCFullYear() - minAge);
    const earliest = new Date(now);
    earliest.setUTCFullYear(earliest.getUTCFullYear() - maxAge - 1);
    earliest.setUTCDate(earliest.getUTCDate() + 1);
    const time = earliest.getTime() + t.int(latest.getTime() - earliest.getTime());
    const date = new Date(time);
    let age = now.getUTCFullYear() - date.getUTCFullYear();
    const before =
        now.getUTCMonth() < date.getUTCMonth() ||
        (now.getUTCMonth() === date.getUTCMonth() && now.getUTCDate() < date.getUTCDate());
    if (before) age -= 1;
    return { date: date.toISOString().slice(0, 10), age };
}
function card(t: Tools, now: Date) {
    const brand = t.pick(['Visa', 'Visa', 'Visa', 'Mastercard', 'Mastercard', 'American Express']);
    const prefix =
        brand === 'Visa'
            ? '4'
            : brand === 'American Express'
              ? t.pick(['34', '37'])
              : String(t.between(51, 55));
    const length = brand === 'American Express' ? 15 : 16;
    let body = prefix + t.digits(length - 1 - prefix.length);
    let number = '';
    for (let digit = 0; digit < 10; digit++)
        if (passesLuhn(body + digit)) {
            number = body + digit;
            break;
        }
    const expiry = new Date(Date.UTC(now.getUTCFullYear() + t.between(1, 5), t.int(12), 1));
    return {
        brand,
        number,
        expiry: `${String(expiry.getUTCMonth() + 1).padStart(2, '0')}/${String(expiry.getUTCFullYear()).slice(2)}`,
        cvc: t.digits(brand === 'American Express' ? 4 : 3),
    };
}
const browsers = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 19_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:145.0) Gecko/20100101 Firefox/145.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
];
function password(t: Tools) {
    const sets = ['abcdefghijkmnpqrstuvwxyz', 'ABCDEFGHJKLMNPQRSTUVWXYZ', '23456789', '!@#$%&*?'];
    const chars = sets.map((set) => t.pick([...set]));
    while (chars.length < 14) chars.push(t.pick([...sets.join('')]));
    for (let i = chars.length - 1; i > 0; i--) {
        const j = t.int(i + 1);
        [chars[i], chars[j]] = [chars[j]!, chars[i]!];
    }
    return chars.join('');
}
function username(first: string, last: string, year: number, t: Tools) {
    const f = ascii(first),
        l = ascii(last);
    return t.pick([
        `${f}${l}`,
        `${f}.${l}`,
        `${f}_${l}`,
        `${f[0]}${l}`,
        `${f}${l}${String(year).slice(2)}`,
        `${f}${t.between(1, 99)}`,
        `${l}${f[0]}${t.between(1, 999)}`,
    ]);
}
function uuid(t: Tools) {
    const hex = Array.from({ length: 32 }, () => t.int(16).toString(16));
    hex[12] = '4';
    hex[16] = (8 + t.int(4)).toString(16);
    const s = hex.join('');
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
// Postal conventions: the order a local would write the address on an envelope.
function formatAddress(
    locale: IdentityLocale,
    line1: string,
    line2: string | undefined,
    place: Place,
    postal: string,
    country: string,
) {
    const lines =
        locale === 'de-DE'
            ? [line1, line2, `${postal} ${place.city}`]
            : locale === 'fr-FR'
              ? [line1, line2, `${postal} ${place.city.toUpperCase()}`]
              : locale === 'en-GB'
                ? [line2, line1, place.city.toUpperCase(), postal]
                : locale === 'en-AU'
                  ? [
                        line2 ? `${line2.replace('Unit ', '')}/${line1}` : line1,
                        `${place.city} ${place.regionCode} ${postal}`,
                    ]
                  : [line1, line2, `${place.city}, ${place.regionCode} ${postal}`];
    return [...lines.filter(Boolean), country].join(', ');
}
const signs = [
    ['Capricorn', 1, 19],
    ['Aquarius', 2, 18],
    ['Pisces', 3, 20],
    ['Aries', 4, 19],
    ['Taurus', 5, 20],
    ['Gemini', 6, 20],
    ['Cancer', 7, 22],
    ['Leo', 8, 22],
    ['Virgo', 9, 22],
    ['Libra', 10, 22],
    ['Scorpio', 11, 21],
    ['Sagittarius', 12, 21],
] as const;
// Each entry names the sign that ends on that month and day; later days start the next sign.
function zodiac(month: number, day: number) {
    const [sign, , last] = signs[month - 1]!;
    return day <= last ? sign : signs[month % 12]![0];
}

export function generateIdentities(options: OperationOptions = {}, now = new Date()) {
    const count = Number(options.count ?? 5);
    if (!Number.isInteger(count) || count < 1 || count > identityLimit)
        throw new Error(`Choose 1 to ${identityLimit} records.`);
    const locale = (options.locale ?? 'en-US') as IdentityLocale;
    if (!Object.hasOwn(identityLocales, locale))
        throw new Error(`Choose one of ${Object.keys(identityLocales).join(', ')}.`);
    const gender = options.mode ?? 'any';
    if (!['any', 'female', 'male'].includes(gender)) throw new Error('Choose any, female or male.');
    const minAge = Number(options.min ?? 18),
        maxAge = Number(options.max ?? 75);
    if (![minAge, maxAge].every(Number.isInteger) || minAge < 0 || maxAge > 100 || minAge > maxAge)
        throw new Error('Choose an age range between 0 and 100.');
    const domain = (options.domain ?? '').trim().toLowerCase();
    if (domain && !/^(?=.{3,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain))
        throw new Error('Enter a domain such as example.com.');
    if (options.seed !== undefined && options.seed.length > 100)
        throw new Error('Use a seed of at most 100 characters.');
    const t = tools(generator(options.seed));
    const data: LocaleData = identityLocales[locale];
    const seen = new Set<string>();
    const rows = [];
    for (let i = 0; i < count; i++) {
        let sex: 'female' | 'male',
            first: string,
            last: string,
            contact: { phone: string; e164: string };
        let place: Place,
            attempts = 0;
        const birth = birthDate(minAge, maxAge, t, now);
        const [year, month, day] = birth.date.split('-').map(Number) as [number, number, number];
        const english = locale.startsWith('en-');
        const older = english && year < 1982 && t.chance(0.85);
        do {
            sex =
                gender === 'any'
                    ? t.chance(0.5)
                        ? 'female'
                        : 'male'
                    : (gender as 'female' | 'male');
            first = t.pick(
                sex === 'female'
                    ? older
                        ? olderFemale
                        : data.female
                    : older
                      ? olderMale
                      : data.male,
            );
            last = display(t.pick(data.last));
            place = t.pick(data.places);
            contact = phone(locale, place, t);
            attempts++;
        } while ((seen.has(`${first} ${last}`) || seen.has(contact.e164)) && attempts < 200);
        seen.add(`${first} ${last}`);
        seen.add(contact.e164);
        const handle = username(first, last, year, t);
        let email = `${handle}@${domain || t.pick(['example.com', 'example.net', 'example.org'])}`;
        while (seen.has(email)) email = email.replace('@', String(t.int(10)) + '@');
        seen.add(email);
        const heightCm = Math.round(
            sex === 'female' ? t.normal(163, 7, 145, 188) : t.normal(177, 7.5, 155, 203),
        );
        const bmi = t.normal(26, 3.8, 19.5, 38);
        const weightKg = Math.round(((bmi * heightCm * heightCm) / 10000) * 10) / 10;
        const imperial = locale === 'en-US';
        const line1 = street(locale, data, t);
        const line2 = secondLine(locale, t);
        const postal = postalCode(locale, place, t);
        const job = t.pick(jobTitles);
        rows.push({
            id: uuid(t),
            gender: sex,
            title:
                locale === 'de-DE'
                    ? sex === 'female'
                        ? 'Frau'
                        : 'Herr'
                    : locale === 'fr-FR'
                      ? sex === 'female'
                          ? 'Mme'
                          : 'M.'
                      : sex === 'female'
                        ? t.pick(['Ms.', 'Ms.', 'Mrs.'])
                        : 'Mr.',
            firstName: first,
            lastName: last,
            name: `${first} ${last}`,
            dateOfBirth: birth.date,
            age: birth.age,
            zodiac: zodiac(month, day),
            email,
            username: handle,
            password: password(t),
            phone: contact.phone,
            phoneE164: contact.e164,
            address: {
                line1,
                ...(line2 ? { line2 } : {}),
                city: place.city,
                region: place.region,
                regionCode: place.regionCode,
                postalCode: postal,
                country: data.country,
                countryName: data.countryName,
                formatted: formatAddress(locale, line1, line2, place, postal, data.countryName),
            },
            company: company(locale, data, last, t),
            jobTitle:
                birth.age < 18 || (birth.age < 23 && t.chance(0.6))
                    ? 'Student'
                    : birth.age >= 67 && t.chance(0.7)
                      ? 'Retired'
                      : job,
            height: imperial
                ? `${Math.floor(heightCm / 2.54 / 12)}′${Math.round((heightCm / 2.54) % 12)}″ (${heightCm} cm)`
                : `${heightCm} cm`,
            weight: imperial
                ? `${Math.round(weightKg * 2.20462)} lb (${weightKg} kg)`
                : `${weightKg} kg`,
            bloodType: t.pick(['O+', 'O+', 'O+', 'A+', 'A+', 'A+', 'B+', 'AB+', 'O−', 'A−', 'B−']),
            eyeColor: t.pick(['Brown', 'Brown', 'Brown', 'Blue', 'Blue', 'Hazel', 'Green', 'Gray']),
            favoriteColor: t.pick([
                'Blue',
                'Green',
                'Purple',
                'Red',
                'Black',
                'Orange',
                'Yellow',
                'Teal',
            ]),
            creditCard: card(t, now),
            userAgent: t.pick(browsers),
            ipv4: `${t.pick(['192.0.2', '198.51.100', '203.0.113'])}.${t.between(1, 254)}`,
        });
    }
    return {
        locale,
        count: rows.length,
        ...(options.seed ? { seed: options.seed } : {}),
        notice: 'Synthetic people. Phone numbers come from regulator reserved fiction ranges, email domains are reserved unless you set your own, card numbers pass Luhn checks but belong to no account, and IP addresses are documentation ranges.',
        identities: rows,
    };
}
export function identitiesCsv(rows: ReturnType<typeof generateIdentities>['identities']) {
    const columns = [
        'name',
        'gender',
        'dateOfBirth',
        'age',
        'email',
        'username',
        'password',
        'phone',
        'phoneE164',
        'line1',
        'line2',
        'city',
        'region',
        'postalCode',
        'country',
        'company',
        'jobTitle',
        'cardBrand',
        'cardNumber',
        'cardExpiry',
        'cardCvc',
    ];
    const cell = (value: unknown) => {
        const text = String(value ?? '');
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const lines = rows.map((row) =>
        [
            row.name,
            row.gender,
            row.dateOfBirth,
            row.age,
            row.email,
            row.username,
            row.password,
            row.phone,
            row.phoneE164,
            row.address.line1,
            row.address.line2,
            row.address.city,
            row.address.region,
            row.address.postalCode,
            row.address.country,
            row.company,
            row.jobTitle,
            row.creditCard.brand,
            row.creditCard.number,
            row.creditCard.expiry,
            row.creditCard.cvc,
        ]
            .map(cell)
            .join(','),
    );
    return [columns.join(','), ...lines].join('\n');
}
