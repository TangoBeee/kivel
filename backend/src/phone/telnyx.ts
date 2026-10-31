import { createPublicKey, verify } from 'node:crypto';
import type { PhoneProvider, PhoneOrder, PhoneOffer, InboundSms } from './provider.js';
import { PhonePurchaseRejected } from './provider.js';
import { HttpError } from '../errors.js';
const usNumber = /^\+1[2-9]\d{9}$/;
interface OrderData {
    id?: string;
    status?: string;
    phone_numbers?: { phone_number?: string }[];
}
function order(data: OrderData): PhoneOrder {
    const number = data.phone_numbers?.[0]?.phone_number;
    if (
        !data.id ||
        !number ||
        !usNumber.test(number) ||
        !['pending', 'success', 'failure'].includes(data.status ?? '')
    )
        throw new HttpError(502, 'Invalid phone provider order response.');
    return { id: data.id, status: data.status as PhoneOrder['status'], number };
}
export class TelnyxProvider implements PhoneProvider {
    private publicKey;
    constructor(
        private config: { apiKey: string; publicKey: string; messagingProfileId: string },
        private request = fetch,
    ) {
        const raw = Buffer.from(config.publicKey, 'base64');
        if (raw.length !== 32) throw new Error('TELNYX_PUBLIC_KEY must be a base64 Ed25519 key.');
        this.publicKey = createPublicKey({
            key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw]),
            format: 'der',
            type: 'spki',
        });
    }
    private async api(path: string, method = 'GET', body?: object, absent = false) {
        const response = await this.request(`https://api.telnyx.com/v2${path}`, {
            method,
            headers: {
                authorization: `Bearer ${this.config.apiKey}`,
                ...(body ? { 'content-type': 'application/json' } : {}),
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
            signal: AbortSignal.timeout(10000),
            redirect: 'error',
        });
        if (absent && response.status === 404) return undefined;
        if (
            path === '/number_orders' &&
            method === 'POST' &&
            response.status >= 400 &&
            response.status < 500 &&
            response.status !== 408
        )
            throw new PhonePurchaseRejected(response.status);
        if (!response.ok)
            throw new HttpError(
                502,
                `Phone provider request failed (${response.status}). A purchase must be reconciled before retrying.`,
            );
        return response.status === 204 ? {} : ((await response.json()) as Record<string, unknown>);
    }
    async available(areaCode?: string): Promise<PhoneOffer[]> {
        if (areaCode && !/^[2-9]\d{2}$/.test(areaCode))
            throw new HttpError(400, 'Use a three-digit US area code.');
        const query = new URLSearchParams({
            'filter[country_code]': 'US',
            'filter[phone_number_type]': 'local',
            'filter[features][]': 'sms',
            'filter[limit]': '10',
            ...(areaCode ? { 'filter[national_destination_code]': areaCode } : {}),
        });
        const result = await this.api(`/available_phone_numbers?${query}`);
        const numbers = result!.data as
            | {
                  phone_number?: string;
                  cost_information?: {
                      monthly_cost?: string;
                      upfront_cost?: string;
                      currency?: string;
                  };
              }[]
            | undefined;
        return (numbers ?? [])
            .filter((item) => item.phone_number && usNumber.test(item.phone_number))
            .map((item) => ({
                number: item.phone_number!,
                monthlyCost: item.cost_information?.monthly_cost ?? '',
                upfrontCost: item.cost_information?.upfront_cost ?? '',
                currency: item.cost_information?.currency ?? '',
            }));
    }
    async purchase(number: string, reference: string) {
        if (!usNumber.test(number) || !/^[a-f0-9-]{36}$/i.test(reference))
            throw new HttpError(400, 'Use a valid US number and purchase reference.');
        const result = await this.api('/number_orders', 'POST', {
            phone_numbers: [{ phone_number: number }],
            messaging_profile_id: this.config.messagingProfileId,
            customer_reference: reference,
        });
        return order(result!.data as OrderData);
    }
    async order(id: string) {
        return order(
            (await this.api(`/number_orders/${encodeURIComponent(id)}`))!.data as OrderData,
        );
    }
    async findOrder(reference: string) {
        const result = await this.api(
            `/number_orders?${new URLSearchParams({ 'filter[customer_reference]': reference, 'page[size]': '2' })}`,
        );
        const orders = result!.data as OrderData[];
        if (!Array.isArray(orders) || orders.length > 1)
            throw new HttpError(502, 'Ambiguous phone order. Operator reconciliation is required.');
        return orders[0] ? order(orders[0]) : undefined;
    }
    async numberId(number: string) {
        const result = await this.api(
            `/phone_numbers?${new URLSearchParams({ 'filter[phone_number]': number.replace(/^\+/, ''), 'page[size]': '10' })}`,
        );
        const matches = (result!.data as { id?: string; phone_number?: string }[]).filter(
            (item) => item.phone_number === number,
        );
        if (matches.length > 1) throw new HttpError(502, 'Ambiguous phone number.');
        return matches[0]?.id;
    }
    async release(id: string) {
        await this.api(`/phone_numbers/${encodeURIComponent(id)}`, 'DELETE', undefined, true);
    }
    verify(headers: Record<string, unknown>, raw: Buffer) {
        const time = headers['telnyx-timestamp'],
            signature = headers['telnyx-signature-ed25519'];
        if (
            typeof time !== 'string' ||
            !/^\d{10}$/.test(time) ||
            Math.abs(Date.now() / 1000 - Number(time)) > 300 ||
            typeof signature !== 'string' ||
            signature.length > 100
        )
            return false;
        try {
            return verify(
                null,
                Buffer.concat([Buffer.from(`${time}|`), raw]),
                this.publicKey,
                Buffer.from(signature, 'base64'),
            );
        } catch {
            return false;
        }
    }
    inbound(raw: Buffer): InboundSms | undefined {
        const event = JSON.parse(raw.toString()) as {
            data?: {
                id?: string;
                occurred_at?: string;
                event_type?: string;
                payload?: {
                    id?: string;
                    type?: string;
                    text?: string;
                    from?: { phone_number?: string };
                    to?: { phone_number?: string }[];
                };
            };
        };
        const data = event.data,
            payload = data?.payload;
        if (data?.event_type !== 'message.received' || payload?.type !== 'SMS') return;
        if (
            !data.id ||
            data.id.length > 100 ||
            !data.occurred_at ||
            !Number.isFinite(Date.parse(data.occurred_at)) ||
            !payload.from?.phone_number ||
            !/^\+[1-9]\d{7,14}$/.test(payload.from.phone_number) ||
            payload.to?.length !== 1 ||
            !usNumber.test(payload.to[0]?.phone_number ?? '') ||
            typeof payload.text !== 'string' ||
            Buffer.byteLength(payload.text) > 16384
        )
            throw new HttpError(400, 'Invalid SMS event.');
        return {
            id: data.id,
            at: data.occurred_at,
            from: payload.from.phone_number,
            to: payload.to[0]!.phone_number!,
            text: payload.text,
        };
    }
}
