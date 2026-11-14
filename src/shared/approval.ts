import type { JobRecord } from './types';

export function isApprovedForQueue(job: JobRecord): boolean {
  return (
    job.stage === 'ready_for_review' &&
    job.approvalStatus === 'approved' &&
    job.executionStatus === 'idle' &&
    job.selectedGreeting.trim().length > 0
  );
}

export function approvedQueue(jobs: JobRecord[]): JobRecord[] {
  return jobs.filter(isApprovedForQueue);
}

export function canExecuteQueue(jobs: JobRecord[], secondConfirmation: boolean): boolean {
  return secondConfirmation && approvedQueue(jobs).length > 0;
}

export function recoverableJobs(jobs: JobRecord[]): JobRecord[] {
  return jobs.filter(
    (job) =>
      job.approvalStatus === 'approved' &&
      ['queued', 'sending', 'failed', 'blocked', 'manual_required'].includes(job.executionStatus),
  );
}
