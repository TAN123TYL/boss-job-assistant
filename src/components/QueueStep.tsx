import {
  CircleAlert,
  CheckCircle2,
  Clock3,
  ExternalLink,
  History,
  LockKeyhole,
  RotateCcw,
  Send,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { approvedQueue, recoverableJobs } from '../shared/approval';
import { countSentToday } from '../shared/execution';
import type { AppState } from '../shared/types';
import { EmptyState } from './EmptyState';

interface QueueStepProps {
  state: AppState;
  connected: boolean;
  busy: boolean;
  busyMessage: string;
  onExecute: () => Promise<void>;
  onRecover: (jobId: string, manualRiskAcknowledged: boolean) => Promise<void>;
  onDismiss: (jobId: string) => Promise<void>;
  onConfirmSent: (jobId: string) => Promise<void>;
}

export function QueueStep({
  state,
  connected,
  busy,
  busyMessage,
  onExecute,
  onRecover,
  onDismiss,
  onConfirmSent,
}: QueueStepProps) {
  const queue = approvedQueue(state.jobs);
  const attentionJobs = recoverableJobs(state.jobs);
  const sentToday = countSentToday(state.executionLogs);
  const remaining = Math.max(0, state.settings.maxDailyMessages - sentToday);

  return (
    <section className="step-panel" aria-labelledby="queue-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">批准后执行</p>
          <h2 id="queue-title">发送队列</h2>
        </div>
        <span className={`connection-dot ${connected ? 'is-online' : ''}`}>
          {connected ? '页面可用' : '页面未连接'}
        </span>
      </div>

      <div className="queue-status">
        <div>
          <Send aria-hidden="true" size={18} />
          <span>待发送</span>
          <strong>{queue.length}</strong>
        </div>
        <div>
          <Clock3 aria-hidden="true" size={18} />
          <span>今日剩余</span>
          <strong>{remaining}</strong>
        </div>
        <div>
          <ShieldCheck aria-hidden="true" size={18} />
          <span>发送间隔</span>
          <strong>{state.settings.sendIntervalSeconds}s</strong>
        </div>
      </div>

      {queue.length === 0 ? (
        <EmptyState
          icon={LockKeyhole}
          title="队列中没有岗位"
          description="只有在岗位确认页批准的内容才会进入这里。"
        />
      ) : (
        <div className="queue-list">
          {queue.map((job, index) => (
            <article className="queue-item" key={job.id}>
              <span className="queue-index">{String(index + 1).padStart(2, '0')}</span>
              <div>
                <strong>{job.title}</strong>
                <p>
                  {job.company} · {job.finalScore} 分
                </p>
              </div>
              <div className="queue-item__actions">
                <a
                  className="icon-button"
                  href={job.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`打开 ${job.title} 原岗位`}
                  title="打开原岗位"
                >
                  <ExternalLink aria-hidden="true" size={14} />
                </a>
                <button
                  className="icon-button"
                  type="button"
                  disabled={busy}
                  aria-label={`将 ${job.title} 标记为岗位失效`}
                  title="岗位失效，移出队列"
                  onClick={() => {
                    if (window.confirm(`确认 ${job.company} 的岗位已失效并移出队列？`)) {
                      void onDismiss(job.id);
                    }
                  }}
                >
                  <Trash2 aria-hidden="true" size={14} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {attentionJobs.length > 0 ? (
        <div className="recovery-list">
          <div className="execution-history__heading">
            <CircleAlert aria-hidden="true" size={16} />
            <h3>失败与待处理岗位 · {attentionJobs.length}</h3>
          </div>
          {attentionJobs.map((job) => (
            <article className="recovery-item" key={job.id}>
              <div>
                <strong>
                  {job.company} · {job.title}
                </strong>
                <p>{job.queueError || `状态：${job.executionStatus}，需要人工核对后再恢复`}</p>
              </div>
              <div className="recovery-item__actions">
                <a
                  className="icon-button"
                  href={job.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`打开 ${job.title} 原岗位`}
                  title="打开原岗位"
                >
                  <ExternalLink aria-hidden="true" size={14} />
                </a>
                {job.executionStatus === 'manual_required' ? (
                  <button
                    className="button button--primary button--compact"
                    type="button"
                    disabled={busy}
                    title="打开 Boss 会话确认消息已存在后使用"
                    onClick={() => void onConfirmSent(job.id)}
                  >
                    <CheckCircle2 aria-hidden="true" size={14} />
                    确认已发送
                  </button>
                ) : null}
                <button
                  className="button button--ghost button--compact"
                  type="button"
                  disabled={busy}
                  onClick={() => void onRecover(job.id, job.executionStatus === 'manual_required')}
                >
                  <RotateCcw aria-hidden="true" size={14} />
                  {job.executionStatus === 'manual_required' ? '核对后恢复' : '恢复重试'}
                </button>
                <button
                  className="icon-button"
                  type="button"
                  disabled={busy}
                  aria-label={`将 ${job.title} 标记为岗位失效`}
                  title="岗位失效，移出队列"
                  onClick={() => {
                    if (window.confirm(`确认 ${job.company} 的岗位已失效并移出队列？`)) {
                      void onDismiss(job.id);
                    }
                  }}
                >
                  <Trash2 aria-hidden="true" size={14} />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      <button
        className="button button--primary button--wide"
        type="button"
        disabled={queue.length === 0 || !connected || remaining === 0 || busy}
        onClick={() => void onExecute()}
      >
        <Send aria-hidden="true" size={16} />
        {busy ? '正在自动发送' : '一键自动发送'}
      </button>

      {busy && busyMessage ? (
        <p className="queue-progress" role="status">
          {busyMessage}
        </p>
      ) : null}

      {state.executionLogs.length > 0 ? (
        <div className="execution-history">
          <div className="execution-history__heading">
            <History aria-hidden="true" size={16} />
            <h3>执行记录</h3>
          </div>
          {[...state.executionLogs]
            .reverse()
            .slice(0, 10)
            .map((log) => (
              <div className="execution-log" key={log.id}>
                <span className={`log-dot log-dot--${log.status}`} />
                <div>
                  <strong>{log.company}</strong>
                  <p>{log.message}</p>
                </div>
                <time dateTime={log.at}>
                  {new Date(log.at).toLocaleTimeString('zh-CN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                  })}
                </time>
              </div>
            ))}
        </div>
      ) : null}
    </section>
  );
}
