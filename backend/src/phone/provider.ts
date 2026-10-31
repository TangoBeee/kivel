import { HttpError } from '../errors.js';

export class PhonePurchaseRejected extends HttpError {
    constructor(readonly providerStatus: number) {
        super(
            502,
            `Phone provider rejected this order (${providerStatus}). No number was purchased.`,
        );
    }
}
export interface PhoneOrder {
    id: string;
    status: 'pending' | 'success' | 'failure';
    number: string;
}
export interface PhoneOffer {
    number: string;
    monthlyCost: string;
    upfrontCost: string;
    currency: string;
}
export interface InboundSms {
    id: string;
    at: string;
    from: string;
    to: string;
    text: string;
}
export interface PhoneProvider {
    available(areaCode?: string): Promise<PhoneOffer[]>;
    purchase(number: string, reference: string): Promise<PhoneOrder>;
    order(id: string): Promise<PhoneOrder>;
    findOrder(reference: string): Promise<PhoneOrder | undefined>;
    numberId(number: string): Promise<string | undefined>;
    release(id: string): Promise<void>;
    verify(headers: Record<string, unknown>, raw: Buffer): boolean;
    inbound(raw: Buffer): InboundSms | undefined;
}
