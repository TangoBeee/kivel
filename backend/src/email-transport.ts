import nodemailer from 'nodemailer';
import type { AgentEmailConfig, AgentEmailSend } from './email-sending.js';
import { HttpError } from './errors.js';

export function postfixAgentSender(config: AgentEmailConfig): AgentEmailSend {
    const transport = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: false,
        ignoreTLS: true,
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        socketTimeout: 15000,
        disableFileAccess: true,
        disableUrlAccess: true,
        logger: false,
        debug: false,
    });
    return async (body) => {
        const result = await transport.sendMail({ ...body, textEncoding: 'base64' });
        if (!result.accepted.length) throw new HttpError(422, 'The relay refused this recipient.');
        return { id: result.messageId };
    };
}
