import { CronExpressionParser } from 'cron-parser/dist/CronExpressionParser.js';

export function parseCron(expression: string, timezone: string, currentDate?: string | number) {
    new Intl.DateTimeFormat('en', { timeZone: timezone });
    return CronExpressionParser.parse(expression, {
        tz: timezone,
        ...(currentDate !== undefined ? { currentDate } : {}),
    });
}
