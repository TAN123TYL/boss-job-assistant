import type { ExecutionStatus, JobRecord } from './types';

const RECOVERABLE_STATUSES = new Set<ExecutionStatus>([
  'queued',
  'sending',
  'failed',
  'blocked',
  'manual_required',
]);

export function canRecoverJob(job: JobRecord, manualRiskAcknowledged: boolean): boolean {
  if (job.executionStatus === 'manual_required' && !manualRiskAcknowledged) {
    return false;
  }

  return RECOVERABLE_STATUSES.has(job.executionStatus);
}

export function transitionToQueued(job: JobRecord, at: string): JobRecord {
  if (job.approvalStatus !== 'approved') {
    throw new Error('Only approved jobs can enter the queue');
  }

  return {
    ...job,
    executionStatus: 'queued',
    queueError: '',
    updatedAt: at,
  };
}

export function transitionToSending(job: JobRecord, at: string): JobRecord {
  if (job.executionStatus !== 'queued') {
    throw new Error('Only queued jobs can start sending');
  }

  return {
    ...job,
    executionStatus: 'sending',
    queueError: '',
    lastAttemptAt: at,
    updatedAt: at,
  };
}

export function transitionFromResult(
  job: JobRecord,
  status: 'sent' | 'blocked' | 'manual_required' | 'not_found',
  message: string,
  at: string,
): JobRecord {
  if (job.executionStatus !== 'sending') {
    throw new Error('A send result requires a sending job');
  }

  const executionStatus: ExecutionStatus =
    status === 'sent'
      ? 'sent'
      : status === 'blocked'
        ? 'blocked'
        : status === 'manual_required'
          ? 'manual_required'
          : 'failed';

  return {
    ...job,
    executionStatus,
    queueError: status === 'sent' ? '' : message,
    updatedAt: at,
  };
}

export function transitionToFailed(job: JobRecord, message: string, at: string): JobRecord {
  return {
    ...job,
    executionStatus: 'failed',
    queueError: message,
    updatedAt: at,
  };
}

export function transitionToRecovered(job: JobRecord, at: string): JobRecord {
  return {
    ...job,
    executionStatus: 'idle',
    queueError: '',
    updatedAt: at,
  };
}

export function confirmManualSend(job: JobRecord, at: string): JobRecord {
  if (job.executionStatus !== 'manual_required') {
    throw new Error('Only manually unverified jobs can be confirmed as sent');
  }

  return {
    ...job,
    executionStatus: 'sent',
    queueError: '',
    updatedAt: at,
  };
}
