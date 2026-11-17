import type { Approval } from '@kivel.io/sdk';

export type ApprovalRequester = { agentName: string; requesterKind?: 'agent' | 'human' };

export const approvalRequester = (approval: ApprovalRequester) =>
    approval.requesterKind === 'human' ? 'Workspace member' : approval.agentName;

export function approvalStatus(approval: Pick<Approval, 'status' | 'answer'>) {
    if (approval.status === 'pending') return 'Waiting';
    if (approval.status === 'expired') return 'Expired';
    const answer = approval.answer?.toLowerCase();
    if (answer === 'approve' || answer === 'approved') return 'Approved';
    if (answer === 'deny' || answer === 'denied' || answer === 'reject' || answer === 'rejected')
        return 'Denied';
    return 'Answered';
}
