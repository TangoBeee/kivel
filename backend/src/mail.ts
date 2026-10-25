import nodemailer from 'nodemailer';

export interface MailMessage {
    to: string;
    subject: string;
    text: string;
}
export interface MailSender {
    send(message: MailMessage): Promise<void>;
    close(): void;
}
export interface MailConfig {
    host: string;
    port: number;
    user?: string;
    password?: string;
    from: string;
    local: boolean;
}
export function smtpSender(config: MailConfig): MailSender {
    const transport = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.port === 465,
        requireTLS: !config.local,
        ...(config.user ? { auth: { user: config.user, pass: config.password } } : {}),
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        socketTimeout: 15000,
        disableFileAccess: true,
        disableUrlAccess: true,
        logger: false,
        debug: false,
    });
    return {
        async send(message) {
            const result = await transport.sendMail({ ...message, from: config.from });
            if (!result.accepted.length) throw new Error('Email delivery rejected.');
        },
        close: () => transport.close(),
    };
}
