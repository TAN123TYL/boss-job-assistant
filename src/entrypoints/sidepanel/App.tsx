import { useEffect, useState } from 'react';
import {
  BriefcaseBusiness,
  ClipboardCheck,
  Send,
  Settings2,
  ShieldCheck,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { SetupStep } from '../../components/SetupStep';
import { ScreenStep } from '../../components/ScreenStep';
import { ReviewStep } from '../../components/ReviewStep';
import { QueueStep } from '../../components/QueueStep';
import { InlineNotice } from '../../components/InlineNotice';
import type { Notice } from '../../components/InlineNotice';
import { approvedQueue, canExecuteQueue } from '../../shared/approval';
import { sendContentRequest } from '../../shared/browser-tab';
import { countSentToday } from '../../shared/execution';
import { buildCandidateProfile } from '../../shared/matching';
import { mergeScreenedJobs, screenJob } from '../../shared/screening';
import { loadAppState, saveAppState } from '../../shared/storage';
import type { AppState, BossPageStatus, ExecutionLog, ScreeningSettings } from '../../shared/types';
import { createId } from '../../shared/utils';

type TabId = 'setup' | 'screen' | 'review' | 'queue';

const TABS: Array<{
  id: TabId;
  label: string;
  icon: typeof Settings2;
}> = [
  { id: 'setup', label: '方案', icon: Settings2 },
  { id: 'screen', label: '筛选', icon: BriefcaseBusiness },
  { id: 'review', label: '确认', icon: ClipboardCheck },
  { id: 'queue', label: '发送', icon: Send },
];

function delay(duration: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, duration);
  });
}

function executionStatusFromResult(
  status: 'sent' | 'blocked' | 'manual_required' | 'not_found',
): AppState['jobs'][number]['executionStatus'] {
  if (status === 'sent') {
    return 'sent';
  }
  if (status === 'blocked') {
    return 'blocked';
  }
  if (status === 'manual_required') {
    return 'manual_required';
  }
  return 'failed';
}

function logStatusFromResult(
  status: 'sent' | 'blocked' | 'manual_required' | 'not_found',
): ExecutionLog['status'] {
  if (status === 'sent') {
    return 'sent';
  }
  if (status === 'blocked') {
    return 'blocked';
  }
  if (status === 'manual_required') {
    return 'manual_required';
  }
  return 'failed';
}

export function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('setup');
  const [pageStatus, setPageStatus] = useState<BossPageStatus | null>(null);
  const [busyAction, setBusyAction] = useState<'scan' | 'execute' | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const refreshPageStatus = async () => {
    try {
      const response = await sendContentRequest({ type: 'BOSS_PAGE_STATUS' });
      if (response.ok && 'status' in response) {
        setPageStatus(response.status);
      }
    } catch {
      setPageStatus(null);
    }
  };

  useEffect(() => {
    let cancelled = false;

    void loadAppState().then((loadedState) => {
      if (!cancelled) {
        setState(loadedState);
        void refreshPageStatus();
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const persist = async (nextState: AppState) => {
    setState(nextState);
    await saveAppState(nextState);
  };

  const saveSettings = async (settings: ScreeningSettings) => {
    if (!state) {
      return;
    }

    await persist({
      ...state,
      settings,
    });
    setNotice({
      kind: 'success',
      message: '筛选方案已保存在本地',
    });
  };

  const scanJobs = async () => {
    if (!state) {
      return;
    }

    setBusyAction('scan');
    setNotice(null);

    try {
      const response = await sendContentRequest({ type: 'BOSS_SCAN_JOBS' });
      if (!response.ok) {
        throw new Error(response.error);
      }
      if (!('payload' in response)) {
        throw new Error('页面未返回岗位数据');
      }
      if (response.payload.page.isVerificationPage) {
        setPageStatus(response.payload.page);
        throw new Error(response.payload.page.message);
      }
      if (response.payload.drafts.length === 0) {
        throw new Error('当前页面没有读取到岗位卡片，请确认位于岗位搜索结果页');
      }

      const profile = buildCandidateProfile(state.settings);
      const scannedAt = new Date().toISOString();
      const screenedJobs = response.payload.drafts.map((draft) =>
        screenJob(draft, profile, state.settings, scannedAt),
      );
      const nextState: AppState = {
        ...state,
        jobs: mergeScreenedJobs(state.jobs, screenedJobs),
        lastScanAt: scannedAt,
      };

      await persist(nextState);
      setPageStatus(response.payload.page);
      const readyCount = screenedJobs.filter((job) => job.stage === 'ready_for_review').length;
      setNotice({
        kind: readyCount > 0 ? 'success' : 'info',
        message:
          readyCount > 0
            ? `已筛选 ${response.payload.drafts.length} 个岗位，${readyCount} 个等待确认`
            : `已筛选 ${response.payload.drafts.length} 个岗位，没有岗位通过当前条件`,
      });

      if (readyCount > 0) {
        setActiveTab('review');
      }
    } catch (error) {
      setNotice({
        kind: 'error',
        message: error instanceof Error ? error.message : '扫描岗位失败',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const approveJob = async (jobId: string, greeting: string) => {
    if (!state) {
      return;
    }

    const now = new Date().toISOString();
    const nextState: AppState = {
      ...state,
      jobs: state.jobs.map((job) =>
        job.id === jobId
          ? {
              ...job,
              approvalStatus: 'approved' as const,
              selectedGreeting: greeting.trim(),
              approvedAt: now,
              updatedAt: now,
            }
          : job,
      ),
    };

    await persist(nextState);
    setNotice({
      kind: 'success',
      message: '岗位已批准，可在发送页复核队列',
    });
  };

  const skipJob = async (jobId: string) => {
    if (!state) {
      return;
    }

    const now = new Date().toISOString();
    const nextState: AppState = {
      ...state,
      jobs: state.jobs.map((job) =>
        job.id === jobId
          ? {
              ...job,
              approvalStatus: 'skipped' as const,
              updatedAt: now,
            }
          : job,
      ),
    };

    await persist(nextState);
    setNotice({
      kind: 'info',
      message: '岗位已跳过',
    });
  };

  const executeQueue = async (secondConfirmation: boolean) => {
    if (!state) {
      return;
    }

    const queue = approvedQueue(state.jobs);
    if (!canExecuteQueue(state.jobs, secondConfirmation)) {
      setNotice({
        kind: 'error',
        message: '没有已批准岗位，或尚未完成发送前确认',
      });
      return;
    }

    setBusyAction('execute');
    setNotice({
      kind: 'info',
      message: '开始执行已批准队列',
    });

    let workingState: AppState = {
      ...state,
      jobs: state.jobs.map((job) =>
        queue.some((queuedJob) => queuedJob.id === job.id)
          ? { ...job, executionStatus: 'queued' as const }
          : job,
      ),
    };
    await persist(workingState);

    let sentCount = 0;
    let stoppedReason = '';

    try {
      for (let index = 0; index < queue.length; index += 1) {
        const job = queue[index];
        if (!job) {
          break;
        }

        if (countSentToday(workingState.executionLogs) >= state.settings.maxDailyMessages) {
          stoppedReason = '已达到今日发送上限';
          break;
        }

        if (index > 0) {
          await delay(state.settings.sendIntervalSeconds * 1_000);
        }

        const response = await sendContentRequest({
          type: 'BOSS_SEND_GREETING',
          url: job.sourceUrl,
          text: job.selectedGreeting,
        });
        if (!response.ok) {
          throw new Error(response.error);
        }
        if (!('result' in response)) {
          throw new Error('页面未返回发送结果');
        }

        const result = response.result;
        const log: ExecutionLog = {
          id: createId(),
          jobId: job.id,
          company: job.company,
          title: job.title,
          at: new Date().toISOString(),
          status: logStatusFromResult(result.status),
          message: result.message,
        };
        const executionStatus = executionStatusFromResult(result.status);
        if (result.status === 'sent') {
          sentCount += 1;
        } else {
          stoppedReason = result.message;
        }

        workingState = {
          ...workingState,
          jobs: workingState.jobs.map((candidate) =>
            candidate.id === job.id
              ? {
                  ...candidate,
                  executionStatus,
                  updatedAt: log.at,
                }
              : candidate,
          ),
          executionLogs: [...workingState.executionLogs, log],
        };
        await persist(workingState);

        if (result.status !== 'sent') {
          break;
        }
      }

      setNotice({
        kind: sentCount > 0 && !stoppedReason ? 'success' : sentCount > 0 ? 'info' : 'error',
        message: stoppedReason
          ? `已发送 ${sentCount} 条，队列已停止：${stoppedReason}`
          : `批准队列执行完成，共发送 ${sentCount} 条`,
      });
    } catch (error) {
      setNotice({
        kind: 'error',
        message: `队列已停止：${error instanceof Error ? error.message : '发送失败'}`,
      });
    } finally {
      setBusyAction(null);
    }
  };

  if (!state) {
    return (
      <div className="loading-screen" role="status">
        <ShieldCheck aria-hidden="true" size={26} />
        <span>正在读取本地方案</span>
      </div>
    );
  }

  const connected = Boolean(pageStatus?.connected && !pageStatus.isVerificationPage);
  const pendingReview = state.jobs.filter(
    (job) => job.stage === 'ready_for_review' && job.approvalStatus === 'pending',
  ).length;
  const approvedCount = approvedQueue(state.jobs).length;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand__mark">
            <ShieldCheck aria-hidden="true" size={19} />
          </span>
          <div>
            <strong>Boss 岗位助手</strong>
            <span>{connected ? '本地筛选已就绪' : '等待岗位页面'}</span>
          </div>
        </div>
        <span className={`connection-icon ${connected ? 'is-online' : ''}`}>
          {connected ? (
            <Wifi aria-hidden="true" size={17} />
          ) : (
            <WifiOff aria-hidden="true" size={17} />
          )}
        </span>
      </header>

      <nav className="step-nav" aria-label="工作流">
        {TABS.map((tab, index) => {
          const Icon = tab.icon;
          const badge =
            tab.id === 'review' && pendingReview > 0
              ? pendingReview
              : tab.id === 'queue' && approvedCount > 0
                ? approvedCount
                : null;

          return (
            <button
              key={tab.id}
              type="button"
              className={activeTab === tab.id ? 'is-active' : ''}
              aria-current={activeTab === tab.id ? 'step' : undefined}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="step-nav__icon">
                <Icon aria-hidden="true" size={17} />
                {badge ? <small>{badge > 99 ? '99+' : badge}</small> : null}
              </span>
              <span>{tab.label}</span>
              <em>{index + 1}</em>
            </button>
          );
        })}
      </nav>

      <main className="app-main">
        {notice ? <InlineNotice notice={notice} /> : null}

        {activeTab === 'setup' ? (
          <SetupStep settings={state.settings} connected={connected} onSave={saveSettings} />
        ) : null}
        {activeTab === 'screen' ? (
          <ScreenStep
            jobs={state.jobs}
            lastScanAt={state.lastScanAt}
            busy={busyAction === 'scan'}
            onScan={scanJobs}
          />
        ) : null}
        {activeTab === 'review' ? (
          <ReviewStep jobs={state.jobs} onApprove={approveJob} onSkip={skipJob} />
        ) : null}
        {activeTab === 'queue' ? (
          <QueueStep
            state={state}
            connected={connected}
            busy={busyAction === 'execute'}
            onExecute={executeQueue}
          />
        ) : null}
      </main>

      <footer className="app-footer">
        <span>v0.1.0</span>
        <span>数据仅保存在本机</span>
      </footer>
    </div>
  );
}
