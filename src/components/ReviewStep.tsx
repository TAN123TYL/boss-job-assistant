import { useState } from 'react';
import {
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Globe2,
  ShieldAlert,
  SkipForward,
  Sparkles,
} from 'lucide-react';
import type { JobRecord } from '../shared/types';
import { EmptyState } from './EmptyState';
import { ScoreRing } from './ScoreRing';

type ReviewFilter = 'pending' | 'approved' | 'skipped';

interface ReviewStepProps {
  jobs: JobRecord[];
  onApprove: (jobId: string, greeting: string) => Promise<void>;
  onSkip: (jobId: string) => Promise<void>;
}

interface JobReviewItemProps {
  job: JobRecord;
  onApprove: ReviewStepProps['onApprove'];
  onSkip: ReviewStepProps['onSkip'];
}

function JobReviewItem({ job, onApprove, onSkip }: JobReviewItemProps) {
  const [greeting, setGreeting] = useState(job.selectedGreeting);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleApprove = async () => {
    setSaving(true);
    try {
      await onApprove(job.id, greeting);
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="review-job">
      <div className="review-job__heading">
        <ScoreRing value={job.finalScore} label="综合分" />
        <div className="review-job__title">
          <div>
            <strong>{job.title}</strong>
            <span className={`grade grade--${job.companyAssessment.grade.toLowerCase()}`}>
              公司 {job.companyAssessment.grade}
            </span>
          </div>
          <p>
            {job.company} · {job.location} · {job.salary}
          </p>
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label={expanded ? '收起详情' : '展开详情'}
          title={expanded ? '收起详情' : '展开详情'}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
      </div>

      <div className="evidence-line">
        {job.matchResult.matchedKeywords.slice(0, 4).map((keyword) => (
          <span key={keyword}>{keyword}</span>
        ))}
        {job.matchResult.matchedKeywords.length === 0 ? <span>标题方向相近</span> : null}
      </div>

      {job.aiReview ? (
        <div className="ai-review-callout">
          <Bot aria-hidden="true" size={16} />
          <div>
            <strong>AI 复核 {job.aiReview.score} 分</strong>
            <p>{job.aiReview.summary || 'AI 已完成岗位匹配复核'}</p>
            {job.aiReview.concerns.length > 0 ? (
              <small>{job.aiReview.concerns.slice(0, 3).join('；')}</small>
            ) : null}
          </div>
        </div>
      ) : null}

      {expanded ? (
        <div className="review-details">
          <div className="detail-group">
            <h3>匹配依据</h3>
            <ul>
              {job.matchResult.evidence.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          {job.matchResult.gaps.length > 0 ? (
            <div className="detail-group detail-group--risk">
              <h3>待确认项</h3>
              <ul>
                {job.matchResult.gaps.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="detail-group">
            <h3>公司信号</h3>
            <div className="trust-line">
              <Globe2 aria-hidden="true" size={14} />
              <span>
                {job.companyAssessment.source === 'ai_web_verified'
                  ? `全网核验：${job.companyAssessment.trustDecision}`
                  : '页面信号评估'}
              </span>
              <strong>{job.companyAssessment.score} 分</strong>
            </div>
            {job.companyAssessment.aiSummary ? <p>{job.companyAssessment.aiSummary}</p> : null}
            <p>{job.companyAssessment.positives.join('；') || '页面信息不足'}</p>
            {job.companyAssessment.risks.length > 0 ? (
              <div className="risk-callout">
                <ShieldAlert aria-hidden="true" size={16} />
                <span>{job.companyAssessment.risks.join('；')}</span>
              </div>
            ) : null}
            <div className="text-links">
              {job.companyAssessment.aiEvidence.map((source) => (
                <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                  {source.title || '核验来源'}
                  <ExternalLink aria-hidden="true" size={13} />
                </a>
              ))}
              {job.companyAssessment.externalLinks.map((link) => (
                <a key={link.label} href={link.url} target="_blank" rel="noreferrer">
                  {link.label}
                  <ExternalLink aria-hidden="true" size={13} />
                </a>
              ))}
            </div>
          </div>
          <div className="detail-group">
            <h3>岗位描述</h3>
            <p className="job-description">{job.description || '当前页面未提取到完整岗位描述。'}</p>
          </div>
        </div>
      ) : null}

      <div className="greeting-options" aria-label="沟通文案版本">
        {job.greetingOptions.map((option) => (
          <button
            className={`choice-chip ${greeting === option.text ? 'is-selected' : ''}`}
            type="button"
            key={option.id}
            onClick={() => setGreeting(option.text)}
          >
            {option.id === job.recommendedGreetingId ? (
              <Sparkles aria-hidden="true" size={13} />
            ) : null}
            {option.label}
          </button>
        ))}
      </div>

      <label className="field">
        <span className="field__label">沟通内容</span>
        <textarea rows={4} value={greeting} onChange={(event) => setGreeting(event.target.value)} />
      </label>

      <div className="review-actions">
        <button
          className="button button--primary"
          type="button"
          disabled={saving || greeting.trim().length < 5}
          onClick={() => void handleApprove()}
        >
          <Check aria-hidden="true" size={16} />
          {job.approvalStatus === 'approved' ? '更新批准' : '批准入队'}
        </button>
        <button
          className="button button--ghost"
          type="button"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await onSkip(job.id);
            } finally {
              setSaving(false);
            }
          }}
        >
          <SkipForward aria-hidden="true" size={16} />
          跳过
        </button>
      </div>
    </article>
  );
}

export function ReviewStep({ jobs, onApprove, onSkip }: ReviewStepProps) {
  const [filter, setFilter] = useState<ReviewFilter>('pending');
  const eligibleJobs = jobs.filter((job) => job.stage === 'ready_for_review');
  const visibleJobs = eligibleJobs
    .filter((job) => job.approvalStatus === filter)
    .sort((left, right) => right.finalScore - left.finalScore);
  const counts = {
    pending: eligibleJobs.filter((job) => job.approvalStatus === 'pending').length,
    approved: eligibleJobs.filter((job) => job.approvalStatus === 'approved').length,
    skipped: eligibleJobs.filter((job) => job.approvalStatus === 'skipped').length,
  };

  return (
    <section className="step-panel" aria-labelledby="review-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">人工门禁</p>
          <h2 id="review-title">岗位确认</h2>
        </div>
      </div>

      <div className="segmented-control" role="tablist" aria-label="审核状态">
        {(['pending', 'approved', 'skipped'] as const).map((value) => (
          <button
            type="button"
            role="tab"
            key={value}
            aria-selected={filter === value}
            className={filter === value ? 'is-active' : ''}
            onClick={() => setFilter(value)}
          >
            {value === 'pending' ? '待审' : value === 'approved' ? '已批准' : '已跳过'}
            <span>{counts[value]}</span>
          </button>
        ))}
      </div>

      {visibleJobs.length === 0 ? (
        <EmptyState
          icon={Check}
          title={filter === 'pending' ? '没有待审岗位' : '此列表为空'}
          description={
            filter === 'pending'
              ? '完成页面扫描后，符合条件的岗位会出现在这里。'
              : '切换状态查看其他岗位。'
          }
        />
      ) : (
        <div className="review-list">
          {visibleJobs.map((job) => (
            <JobReviewItem key={job.id} job={job} onApprove={onApprove} onSkip={onSkip} />
          ))}
        </div>
      )}
    </section>
  );
}
