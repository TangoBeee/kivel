import { validateScenario } from '@socket-help/tools/api-scenarios';
import type { ApiScenario } from '@socket-help/tools/api-scenarios';
const KEY = 'socket-help:scenario-draft';
export function saveScenarioDraft(scenario: ApiScenario) {
    sessionStorage.setItem(
        KEY,
        JSON.stringify({ createdAt: Date.now(), scenario: validateScenario(scenario) }),
    );
}
export function takeScenarioDraft(): ApiScenario | undefined {
    const text = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!text) return;
    const value = JSON.parse(text);
    if (
        !Number.isFinite(value.createdAt) ||
        Date.now() - value.createdAt < 0 ||
        Date.now() - value.createdAt > 600000
    )
        return;
    return validateScenario(value.scenario);
}
