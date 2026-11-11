import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { plans } from '@kivel.io/tools/plans';
import type { Access } from './access.js';
import { emailApprovalRequired } from './email-threading.js';
import type { EmailRules } from './email-threading.js';
import { HttpError } from './errors.js';
import { effectivePlan } from './identity.js';
import { isUuid } from './security.js';
import type { ResourceRepository } from './resources.js';
import type { ApprovalRepository, registerApprovals } from './approvals.js';
import type { registerEmail } from './email.js';
import { validateEmailContent } from './email-sending.js';
import type { EmailContent, registerEmailSending } from './email-sending.js';
import type { JobStore, ScheduledJob } from './scheduled-jobs.js';

export function registerEmailDrafts(
    app: FastifyInstance,
    access: Access,
    resources: ResourceRepository,
    jobs: JobStore,
    email: ReturnType<typeof registerEmail>,
    deliverEmail: ReturnType<typeof registerEmailSending>,
    approvals: ApprovalRepository,
    review: ReturnType<typeof registerApprovals>,
) {
    async function owned(request: FastifyRequest, id: string, write = false) {
        const actor = await access.workspace(request, write ? 'resources:write' : 'resources:read');
        const ownerId = actor.identity.account.id;
        const resource = isUuid(id) && (await resources.read(id, 'job', '', ownerId));
        const job = resource && (await jobs.get(id));
        if (!job || !job.emailDraft || job.ownerId !== ownerId || job.status === 'cancelled')
            throw new HttpError(404, 'Email draft unavailable.');
        return { job, actor, content: resource.payload.emailContent as EmailContent };
    }
    async function view(job: ScheduledJob, content?: EmailContent) {
        const { inboxId, sendAt, approvalId } = job.emailDraft!;
        const approval = approvalId ? await approvals.get(job.ownerId, approvalId) : undefined;
        return {
            id: job.id,
            inboxId,
            subject: approval?.editedEmail?.subject ?? content?.subject ?? job.name,
            sendAt,
            expiresAt: job.expiresAt,
            status:
                job.status === 'scheduled' && approvalId
                    ? approval?.status === 'expired'
                        ? 'expired'
                        : approval?.status === 'answered'
                          ? approval.answer === 'Approve'
                              ? 'scheduled'
                              : 'rejected'
                          : 'awaitingApproval'
                    : job.status,
            ...(approvalId
                ? {
                      approvalId,
                      approvalExpiresAt: approval?.expiresAt,
                      answerUrl: access.appUrl(`/approve/?id=${approvalId}`),
                  }
                : {}),
            ...(content ? { content: approval?.editedEmail ?? content } : {}),
            events: job.events,
        };
    }
    type Inbox = { Params: { id: string } };
    app.post<Inbox>('/api/email-inboxes/:id/drafts', async (request, reply) => {
        const actor = await access.workspace(request, 'resources:write');
        const { inbox, row } = await email.owned(request, request.params.id);
        if (!row || row.pausedAt) throw new HttpError(403, 'Use an active, owned email inbox.');
        const content = validateEmailContent(
            request.body,
            plans[actor.plan].emailRecipients,
            plans[actor.plan].emailDraftBytes,
        );
        const allocation = await access.allocation(request, {
            ttlSeconds: Math.min(7 * 86400, plans[actor.plan].maxRetentionSeconds),
        });
        await access.rate(request, true);
        const ownerId = actor.identity.account.id;
        const created = await resources.create(
            'job',
            {
                name: content.subject.slice(0, 80),
                emailContent: content,
            },
            undefined,
            allocation,
        );
        if (!created) throw new HttpError(503, 'Draft storage capacity reached.');
        const job: ScheduledJob = {
            id: created.id,
            ownerId,
            name: content.subject,
            url: '',
            body: null,
            nextRunAt: null,
            intervalSeconds: null,
            remaining: 1,
            run: 0,
            attempt: 0,
            status: 'draft',
            events: [],
            expiresAt: created.expiresAt,
            emailDraft: { inboxId: inbox.id, sendAt: null },
        };
        try {
            await jobs.create(job);
        } catch (error) {
            await resources.delete(created.id, 'job', '', ownerId);
            throw error;
        }
        return reply.code(201).send(await view(job, content));
    });
    app.get<Inbox>('/api/email-inboxes/:id/drafts', async (request) => {
        const actor = await access.workspace(request, 'resources:read');
        await email.owned(request, request.params.id);
        const list = (await jobs.list(actor.identity.account.id)).filter(
            (job) => job.emailDraft?.inboxId === request.params.id && job.status !== 'cancelled',
        );
        return { drafts: await Promise.all(list.map((job) => view(job))) };
    });
    app.get<Inbox>('/api/email-drafts/:id', async (request) => {
        const { job, content } = await owned(request, request.params.id);
        return view(job, content);
    });
    app.delete<Inbox>('/api/email-drafts/:id', async (request, reply) => {
        const { job } = await owned(request, request.params.id, true);
        if (!(await jobs.cancelDraft(job.id, job.ownerId)))
            throw new HttpError(
                409,
                'This draft is being sent. Check its status before trying again.',
            );
        await resources.delete(job.id, 'job', '', job.ownerId);
        return reply.code(204).send();
    });
    app.post<Inbox>('/api/email-drafts/:id/send', async (request, reply) => {
        const { job, actor, content } = await owned(request, request.params.id, true);
        const input = (request.body ?? {}) as { approval?: boolean; sendAt?: string };
        if (
            typeof input !== 'object' ||
            Array.isArray(input) ||
            Object.keys(input).some((key) => !['approval', 'sendAt'].includes(key)) ||
            (input.approval !== undefined && typeof input.approval !== 'boolean')
        )
            throw new HttpError(400, 'Provide optional approval and sendAt fields.');
        const { inbox } = await email.resolveInbox(job.emailDraft!.inboxId, job.ownerId);
        if (
            (inbox.payload.emailRules as EmailRules | undefined)?.requireApproval &&
            !input.approval
        )
            throw new HttpError(403, emailApprovalRequired);
        const previousId = job.emailDraft!.approvalId;
        const previous = previousId ? await approvals.get(job.ownerId, previousId) : undefined;
        const resubmit =
            previousId &&
            job.status !== 'draft' &&
            (previous?.status === 'expired' ||
                (previous?.status === 'answered' && previous.answer !== 'Approve'));
        if (resubmit) {
            const human = await access.require(request, 'resources:write', true);
            if (!['owner', 'admin'].includes(human.role))
                throw new HttpError(403, 'Only workspace owners and admins can resubmit a draft.');
            if (!input.approval)
                throw new HttpError(409, 'Submit this draft for a new human approval.');
        }
        const at = input.sendAt === undefined ? null : Date.parse(input.sendAt);
        if (
            at !== null &&
            (typeof input.sendAt !== 'string' ||
                !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(input.sendAt) ||
                !Number.isFinite(at) ||
                ((job.status === 'draft' || resubmit) &&
                    (at <= Date.now() || at >= Date.parse(job.expiresAt))))
        )
            throw new HttpError(400, 'Choose a future ISO timestamp before this draft expires.');
        const sendAt = at === null ? null : new Date(at).toISOString();
        if (job.status !== 'draft' && !resubmit) {
            if (
                job.emailDraft!.sendAt !== sendAt ||
                Boolean(previousId) !== Boolean(input.approval)
            )
                throw new HttpError(
                    409,
                    'This draft was already submitted with different settings.',
                );
            if (!input.approval || previous) return reply.code(202).send(await view(job, content));
            if (job.status !== 'scheduled')
                throw new HttpError(409, 'This draft is no longer scheduled.');
        }
        const approval = input.approval
            ? await review.prepare(
                  request,
                  {
                      question: 'Approve sending this email draft?',
                      options: ['Approve', 'Reject'],
                      timeoutMinutes: 1440,
                  },
                  {
                      id: job.id,
                      approvalId: resubmit ? randomUUID() : (previousId ?? job.id),
                      expiresAt: new Date(
                          Math.min(at ?? Infinity, Date.parse(job.expiresAt)),
                      ).toISOString(),
                  },
              )
            : undefined;
        const queued: ScheduledJob = {
            ...job,
            status: 'scheduled',
            nextRunAt: approval ? new Date().toISOString() : (sendAt ?? new Date().toISOString()),
            emailDraft: {
                inboxId: job.emailDraft!.inboxId,
                sendAt,
                ...(approval ? { approvalId: approval.id } : {}),
            },
        };
        const queue =
            job.status === 'draft' || resubmit
                ? (client?: PoolClient) =>
                      jobs.queueDraft(queued, resubmit ? previousId : undefined, client)
                : undefined;
        if (approval) await review.submit(approval, actor.plan, queue);
        else if (queue && !(await queue()))
            throw new HttpError(409, 'This draft was already submitted. Check its status.');
        return reply.code(202).send(await view(queued, content));
    });

    return async function sendDraft(job: ScheduledJob, now: number) {
        const draft = job.emailDraft!;
        let status: number | null = null;
        let reason: string | undefined;
        try {
            const approval = draft.approvalId
                ? await approvals.get(job.ownerId, draft.approvalId)
                : undefined;
            if (draft.approvalId && (!approval || approval.status === 'pending')) {
                job.nextRunAt = new Date(now + 5000).toISOString();
                return;
            }
            if (approval && (approval.status !== 'answered' || approval.answer !== 'Approve')) {
                job.status = approval.status === 'answered' ? 'rejected' : 'expired';
                job.nextRunAt = null;
                return;
            }
            if (draft.sendAt && Date.parse(draft.sendAt) > now) {
                job.nextRunAt = draft.sendAt;
                return;
            }
            const account = await access.identities.account(job.ownerId);
            const resource = await resources.read(job.id, 'job', '', job.ownerId);
            if (!account || !resource)
                throw new HttpError(404, 'The draft is no longer available.');
            const context = await email.resolveInbox(draft.inboxId, job.ownerId);
            await deliverEmail(
                { ...context, actor: { plan: effectivePlan(account), quotaKey: account.quotaKey } },
                approval?.editedEmail ?? resource.payload.emailContent,
                {
                    draftId: job.id,
                    approved: approval?.status === 'answered' && approval.answer === 'Approve',
                },
            );
            status = 202;
            job.status = 'completed';
            job.nextRunAt = null;
        } catch (error) {
            status = error instanceof HttpError ? error.statusCode : null;
            reason = error instanceof HttpError ? error.message : 'Email delivery failed.';
            if (
                (status === 429 || status === 503) &&
                job.attempt < 2 &&
                now + 60000 < Date.parse(job.expiresAt)
            ) {
                job.nextRunAt = new Date(now + 60000).toISOString();
            } else {
                job.status = 'failed';
                job.nextRunAt = null;
            }
        }
        job.events.push({
            id: randomUUID(),
            at: new Date(now).toISOString(),
            deliveryId: job.id,
            attempt: ++job.attempt,
            status,
            ...(reason ? { error: reason } : {}),
        });
    };
}
