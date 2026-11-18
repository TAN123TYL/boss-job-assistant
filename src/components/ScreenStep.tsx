import { useEffect, useState } from 'react';
import {
  BriefcaseBusiness,
  Building2,
  LoaderCircle,
  MapPin,
  Radar,
  RotateCcw,
  ShieldCheck,
  Square,
} from 'lucide-react';
import { canReevaluateRejectedJob } from '../shared/screening';
import type { JobRecord, ScanProgress } from '../shared/types';
import { EmptyState } from './EmptyState';
import { ScoreRing } from './ScoreRing';

interface ScreenStepProps {
  jobs: JobRecord[];
  lastScanAt: string | null;
  busy: boolean;
  onScan: () => Promise<void>;
  onResetRejected: () => Promise<void>;
  progress: ScanProgress | null;
  startedAt: number | null;
  onCancel: () => Promise<void>;
}

export function ScreenStep({
  jobs,
  lastScanAt,
  busy,
  onScan,
  onResetRejected,
  progress,
  startedAt,
  onCancel,
}: ScreenStepProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const readyJobs = jobs.filter((job) => job.stage === 'ready_for_review');
  const reevaluatableCount = jobs.filter(canReevaluateRejectedJob).length;
  const rejectedJobs = [...jobs]
    .filter((job) => job.stage !== 'ready_for_review')
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 6);
  const resumeRejected = jobs.filter((job) => job.stage === 'resume_rejected').length;
  const cityRejected = jobs.filter((job) => job.stage === 'city_rejected').length;
  const companyRejected = jobs.filter((job) => job.stage === 'company_rejected').length;
  const progressPercent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : null;

  useEffect(() => {
    if (!busy || !startedAt) {
      return;
    }

    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1_000)));
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [busy, startedAt]);

  return (
    <section className="step-panel" aria-labelledby="screen-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">当前页面</p>
          <h2 id="screen-title">岗位筛选</h2>
        </div>
        <div className="section-actions">
          <button
            className="button button--secondary button--compact"
            type="button"
            disabled={busy || reevaluatableCount === 0}
            onClick={() => void onResetRejected()}
          >
            <RotateCcw aria-hidden="true" size={15} />
            重置排除 {reevaluatableCount}
          </button>
          <button
            className="button button--primary button--compact"
            type="button"
            disabled={busy}
            onClick={() => void onScan()}
          >
            <Radar aria-hidden="true" size={16} />
            {busy ? '处理中' : '扫描岗位'}
          </button>
        </div>
      </div>

      {busy ? (
        <div className="scan-progress-panel" role="status" aria-live="polite">
          <div className="scan-progress-panel__heading">
            <LoaderCircle className="spin" aria-hidden="true" size={18} />
            <div>
              <strong>{progress?.message ?? '正在准备扫描'}</strong>
              <span>
                {progress && progress.total > 0
                  ? `${progress.current} / ${progress.total}`
                  : '正在等待页面响应'}
                {' · '}
                已用时 {startedAt ? elapsedSeconds : 0} 秒
              </span>
            </div>
            <button
              className="button button--ghost button--compact"
              type="button"
              onClick={() => void onCancel()}
            >
              <Square aria-hidden="true" size={13} />
              停止
            </button>
          </div>
          <div className="scan-progress-panel__track">
            <span
              className={progressPercent === null ? 'is-indeterminate' : ''}
              style={progressPercent === null ? undefined : { width: `${progressPercent}%` }}
            />
          </div>
          <p>单个岗位 JD 最多等待 3.5 秒；整次扫描最多等待 5 分钟。停止后会保留已读取岗位。</p>
        </div>
      ) : null}

      <div className="metrics-grid">
        <article className="metric">
          <BriefcaseBusiness aria-hidden="true" size={18} />
          <span>待确认</span>
          <strong>{readyJobs.length}</strong>
        </article>
        <article className="metric">
          <MapPin aria-hidden="true" size={18} />
          <span>简历排除</span>
          <strong>{resumeRejected}</strong>
        </article>
        <article className="metric">
          <Building2 aria-hidden="true" size={18} />
          <span>城市排除</span>
          <strong>{cityRejected}</strong>
        </article>
        <article className="metric">
          <ShieldCheck aria-hidden="true" size={18} />
          <span>公司排除</span>
          <strong>{companyRejected}</strong>
        </article>
      </div>

      {lastScanAt ? (
        <p className="timestamp">
          最近扫描 {new Date(lastScanAt).toLocaleString('zh-CN', { hour12: false })}
        </p>
      ) : null}

      {readyJobs.length === 0 ? (
        <EmptyState
          icon={Radar}
          title="尚无待确认岗位"
          description="打开 Boss 岗位列表后扫描当前页面，排除原因会显示在下方。"
        />
      ) : (
        <div className="compact-list">
          {[...readyJobs]
            .sort((left, right) => right.finalScore - left.finalScore)
            .slice(0, 8)
            .map((job) => (
              <article className="compact-job" key={job.id}>
                <ScoreRing value={job.finalScore} label="综合分" />
                <div className="compact-job__body">
                  <strong>{job.title}</strong>
                  <span>
                    {job.company} · {job.location} · {job.salary} · 简历{' '}
                    {job.matchedResumeName || '主简历'}
                  </span>
                </div>
                <span className={`grade grade--${job.companyAssessment.grade.toLowerCase()}`}>
                  {job.companyAssessment.grade}
                </span>
              </article>
            ))}
        </div>
      )}

      {rejectedJobs.length > 0 ? (
        <div className="rejection-summary">
          <div className="execution-history__heading">
            <Radar aria-hidden="true" size={16} />
            <h3>最近排除原因</h3>
          </div>
          {rejectedJobs.map((job) => (
            <article className="rejection-item" key={job.id}>
              <div>
                <strong>
                  {job.title} · {job.company}
                </strong>
                <p>{job.rejectionReasons[0] ?? '未满足当前筛选条件'}</p>
              </div>
              <span>{job.stage.replace('_rejected', '')}</span>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
