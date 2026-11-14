import { useState } from 'react';
import { CircleStop, Clock3, History, LockKeyhole, Send, ShieldCheck } from 'lucide-react';
import { approvedQueue } from '../shared/approval';
import { countSentToday } from '../shared/execution';
import type { AppState } from '../shared/types';
import { EmptyState } from './EmptyState';

interface QueueStepProps {
  state: AppState;
  connected: boolean;
  busy: boolean;
  onExecute: (secondConfirmation: boolean) => Promise<void>;
}

export function QueueStep({ state, connected, busy, onExecute }: QueueStepProps) {
  const [confirming, setConfirming] = useState(false);
  const queue = approvedQueue(state.jobs);
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
            </article>
          ))}
        </div>
      )}

      <button
        className="button button--primary button--wide"
        type="button"
        disabled={queue.length === 0 || !connected || remaining === 0 || busy}
        onClick={() => setConfirming(true)}
      >
        <Send aria-hidden="true" size={16} />
        {busy ? '正在执行批准队列' : '执行已批准队列'}
      </button>

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

      {confirming ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-send-title"
          >
            <span className="confirm-modal__icon">
              <CircleStop aria-hidden="true" size={22} />
            </span>
            <h2 id="confirm-send-title">确认发送 {queue.length} 条消息</h2>
            <p>只会处理已批准岗位，遇到验证页面、页面结构变化或发送异常时立即停止。</p>
            <div className="modal-actions">
              <button
                className="button button--ghost"
                type="button"
                onClick={() => setConfirming(false)}
              >
                取消
              </button>
              <button
                className="button button--primary"
                type="button"
                onClick={async () => {
                  setConfirming(false);
                  await onExecute(true);
                }}
              >
                <Send aria-hidden="true" size={16} />
                确认执行
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
