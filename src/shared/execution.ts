import type { ExecutionLog } from './types';

export const MESSAGE_SEND_INTERVAL_SECONDS = 5;

export function dateKey(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function countSentToday(logs: ExecutionLog[], now = new Date()): number {
  const today = dateKey(now);
  return logs.filter((log) => log.status === 'sent' && dateKey(log.at) === today).length;
}
