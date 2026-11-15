import { BriefcaseBusiness, Building2, MapPin, Radar, ShieldCheck } from 'lucide-react';
import type { JobRecord } from '../shared/types';
import { EmptyState } from './EmptyState';
import { ScoreRing } from './ScoreRing';

interface ScreenStepProps {
  jobs: JobRecord[];
  lastScanAt: string | null;
  busy: boolean;
  onScan: () => Promise<void>;
}

export function ScreenStep({ jobs, lastScanAt, busy, onScan }: ScreenStepProps) {
  const readyJobs = jobs.filter((job) => job.stage === 'ready_for_review');
  const rejectedJobs = [...jobs]
    .filter((job) => job.stage !== 'ready_for_review')
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 6);
  const resumeRejected = jobs.filter((job) => job.stage === 'resume_rejected').length;
  const cityRejected = jobs.filter((job) => job.stage === 'city_rejected').length;
  const companyRejected = jobs.filter((job) => job.stage === 'company_rejected').length;

  return (
    <section className="step-panel" aria-labelledby="screen-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">当前页面</p>
          <h2 id="screen-title">岗位筛选</h2>
        </div>
        <button
          className="button button--primary button--compact"
          type="button"
          disabled={busy}
          onClick={() => void onScan()}
        >
          <Radar aria-hidden="true" size={16} />
          {busy ? '扫描中' : '扫描岗位'}
        </button>
      </div>

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
                    {job.company} · {job.location} · {job.salary}
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
