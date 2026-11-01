// Agent activity in plain words: "Created a webhook inbox" instead of create_webhook_inbox.
const labels: Record<string, string> = {
    accept_dns_changes: 'Accepted DNS changes',
    add_authenticator: 'Added an authenticator',
    ask_human: 'Asked you a question',
    call_mock_api: 'Called a mock API',
    create_email_inbox: 'Created an email inbox',
    create_mock_api: 'Created a mock API',
    create_monitor: 'Created a monitor',
    create_oauth_provider: 'Created a mock OAuth provider',
    create_phone_number: 'Created a phone number',
    create_webhook_inbox: 'Created a webhook inbox',
    delete_authenticator: 'Deleted an authenticator',
    delete_mock_api: 'Deleted a mock API',
    delete_monitor: 'Deleted a monitor',
    delete_temporary_file: 'Deleted a file',
    delete_webhook_inbox: 'Deleted a webhook inbox',
    describe_tool: 'Looked up a tool',
    download_temporary_file: 'Downloaded a file',
    finish_login: 'Finished signing in',
    get_email_attachment: 'Downloaded an email attachment',
    get_totp_code: 'Got a sign-in code',
    inspect_mock_api: 'Checked a mock API',
    inspect_monitor: 'Checked a monitor',
    inspect_temporary_file: 'Checked a file',
    inspect_webhook_inbox: 'Read webhook requests',
    list_authenticators: 'Listed authenticators',
    list_emails: 'Read emails',
    list_monitors: 'Listed monitors',
    list_phone_numbers: 'Listed phone numbers',
    list_sms: 'Read text messages',
    list_tools: 'Listed tools',
    memory_delete: 'Deleted a memory',
    memory_get: 'Read a memory',
    memory_list: 'Listed memories',
    memory_set: 'Saved a memory',
    pause_monitor: 'Paused a monitor',
    ping_monitor: 'Checked in a cron job',
    release_phone_number: 'Released a phone number',
    resource_request: 'Managed a resource',
    run_tool: 'Ran a tool',
    search_tools: 'Searched tools',
    send_email: 'Sent an email',
    set_webhook_response: 'Changed a webhook response',
    start_login: 'Asked to join',
    start_trial: 'Started a trial',
    upload_temporary_file: 'Uploaded a file',
    wait_for_approval: 'Waited for your answer',
    wait_for_email: 'Waited for an email',
    wait_for_event: 'Waited for an event',
    wait_for_sms: 'Waited for a text message',
    wait_for_webhook: 'Waited for a webhook',
    workspace_status: 'Checked the workspace',
};

export function activityLabel(tool: string) {
    if (labels[tool]) return labels[tool];
    const words = tool.replace(/[_-]+/g, ' ').trim();
    return words ? words[0]!.toUpperCase() + words.slice(1) : 'Called a tool';
}

/** "just now", "4 min ago", "3 h ago", "2 days ago", then a date. */
export function timeAgo(value: string, now = Date.now()) {
    const seconds = Math.round((now - Date.parse(value)) / 1000);
    if (seconds < 45) return 'just now';
    if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} min ago`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`;
    if (seconds < 86400 * 7) {
        const days = Math.round(seconds / 86400);
        return `${days} day${days === 1 ? '' : 's'} ago`;
    }
    return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** "in 59 min", "in 3 h", "in 2 days", or a date further out. */
export function timeLeft(value: string, now = Date.now()) {
    const seconds = Math.round((Date.parse(value) - now) / 1000);
    if (seconds <= 0) return 'expired';
    if (seconds < 3600) return `in ${Math.max(1, Math.round(seconds / 60))} min`;
    if (seconds < 86400) return `in ${Math.round(seconds / 3600)} h`;
    if (seconds < 86400 * 30) {
        const days = Math.round(seconds / 86400);
        return `in ${days} day${days === 1 ? '' : 's'}`;
    }
    return `on ${new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}
