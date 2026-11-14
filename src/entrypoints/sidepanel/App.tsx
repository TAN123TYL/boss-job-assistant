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
import { InlineNotice } from '../../components/InlineNotice';
import type { Notice } from '../../components/InlineNotice';
import { QueueStep } from '../../components/QueueStep';
import { ReviewStep } from '../../components/ReviewStep';
import { ScreenStep } from '../../components/ScreenStep';
import { SetupStep } from '../../components/SetupStep';
import { enhanceJobWithAi } from '../../shared/ai';
import { approvedQueue, canExecuteQueue } from '../../shared/approval';
import { backupToJson, parseAppBackup } from '../../shared/backup';
import { sendContentRequest } from '../../shared/browser-tab';
import { researchCompanyWithAi } from '../../shared/company-research';
import { countSentToday } from '../../shared/execution';
import { buildCandidateProfile } from '../../shared/matching';
import {
  canRecoverJob,
  transitionFromResult,
  transitionToQueued,
  transitionToRecovered,
  transitionToSending,
} from '../../shared/queue';
import { mergeScreenedJobs, screenJob } from '../../shared/screening';
import { loadAppState, saveAppState } from '../../shared/storage';
import type {
  AppState,
  BossPageStatus,
  BossSendResult,
  ExecutionLog,
  JobRecord,
  ScreeningSettings,
} from '../../shared/types';
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

function logStatusFromResult(status: BossSendResult['status']): ExecutionLog['status'] {
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

function updateJob(
  state: AppState,
  jobId: string,
  updater: (job: JobRecord) => JobRecord,
): AppState {
  return {
    ...state,
    jobs: state.jobs.map((job) => (job.id === jobId ? updater(job) : job)),
  };
}

function createExecutionLog(job: JobRecord, result: BossSendResult, at: string): ExecutionLog {
  return {
    id: createId(),
    jobId: job.id,
    company: job.company,
    title: job.title,
    at,
    status: logStatusFromResult(result.status),
    message: result.message,
  };
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

  const exportBackup = () => {
    if (!state) {
      return;
    }

    const blob = new Blob([backupToJson(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `boss-job-assistant-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice({
      kind: 'success',
      message: '备份已导出，不包含 API Key',
    });
  };

  const importBackup = async (content: string) => {
    if (!state) {
      return;
    }

    const imported = parseAppBackup(content, state.settings);
    await persist(imported);
    setNotice({
      kind: 'success',
      message: '备份已恢复，当前 API Key 保持不变',
    });
  };

  const scanJobs = async () => {
    if (!state) {
      return;
    }

    setBusyAction('scan');
    setNotice(null);

    try {
      const response = await sendContentRequest({
        type: 'BOSS_SCAN_JOBS',
        maxPages: state.settings.maxScanPages,
      });
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
        throw new Error('未读取到岗位，请确认位于 Boss 搜索结果页');
      }

      const profile = buildCandidateProfile(state.settings);
      const scannedAt = new Date().toISOString();
      let screenedJobs = response.payload.drafts.map((draft) =>
        screenJob(draft, profile, state.settings, scannedAt),
      );
      let aiFailures = 0;
      let researchFailures = 0;

      const candidates = screenedJobs
        .filter((job) => job.stage === 'ready_for_review')
        .sort((left, right) => right.finalScore - left.finalScore)
        .slice(0, 12);

      if (state.settings.aiEnabled) {
        for (const candidate of candidates) {
          try {
            const enhanced = await enhanceJobWithAi(candidate, state.settings);
            screenedJobs = screenedJobs.map((job) => (job.id === candidate.id ? enhanced : job));
          } catch {
            aiFailures += 1;
          }
        }
      }

      if (state.settings.companyResearchEnabled) {
        for (const candidate of screenedJobs.filter((job) => job.stage === 'ready_for_review')) {
          try {
            const researched = await researchCompanyWithAi(candidate, state.settings);
            screenedJobs = screenedJobs.map((job) => (job.id === candidate.id ? researched : job));
          } catch (error) {
            researchFailures += 1;
            const message = error instanceof Error ? error.message : '公司全网核验失败';
            screenedJobs = screenedJobs.map((job) =>
              job.id === candidate.id
                ? {
                    ...job,
                    stage: 'company_rejected' as const,
                    companyAssessment: {
                      ...job.companyAssessment,
                      trustDecision: 'unverified' as const,
                      aiSummary: message,
                    },
                    rejectionReasons: [`公司全网核验失败，未进入待投递队列：${message}`],
                  }
                : job,
            );
          }
        }
      }

      const nextState: AppState = {
        ...state,
        jobs: mergeScreenedJobs(state.jobs, screenedJobs),
        lastScanAt: scannedAt,
      };

      await persist(nextState);
      setPageStatus(response.payload.page);
      const readyCount = screenedJobs.filter((job) => job.stage === 'ready_for_review').length;
      const notes = [
        `扫描 ${response.payload.pagesScanned} 页`,
        `去重 ${response.payload.duplicatesSkipped} 个`,
        `${readyCount} 个待确认`,
      ];
      if (aiFailures > 0) {
        notes.push(`${aiFailures} 个 AI 复核失败`);
      }
      if (researchFailures > 0) {
        notes.push(`${researchFailures} 个公司核验失败`);
      }
      if (response.payload.stoppedReason) {
        notes.push(response.payload.stoppedReason);
      }
      setNotice({
        kind: readyCount > 0 ? 'success' : 'info',
        message: notes.join('，'),
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
    const nextState = updateJob(state, jobId, (job) => ({
      ...job,
      approvalStatus: 'approved',
      selectedGreeting: greeting.trim(),
      executionStatus: 'idle',
      queueError: '',
      lastAttemptAt: null,
      approvedAt: now,
      updatedAt: now,
    }));

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
    const nextState = updateJob(state, jobId, (job) => ({
      ...job,
      approvalStatus: 'skipped',
      updatedAt: now,
    }));

    await persist(nextState);
    setNotice({
      kind: 'info',
      message: '岗位已跳过',
    });
  };

  const recoverJob = async (jobId: string, manualRiskAcknowledged: boolean) => {
    if (!state) {
      return;
    }
    const job = state.jobs.find((candidate) => candidate.id === jobId);
    if (!job || !canRecoverJob(job, manualRiskAcknowledged)) {
      setNotice({
        kind: 'error',
        message: '该岗位不能自动恢复，请先在 Boss 页面人工核对',
      });
      return;
    }

    const now = new Date().toISOString();
    const nextState = updateJob(state, jobId, (candidate) => transitionToRecovered(candidate, now));
    await persist(nextState);
    setNotice({
      kind: 'info',
      message: '岗位已恢复到待发送状态，请重新确认后执行',
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
        message: '没有待发送岗位，或尚未完成发送前确认',
      });
      return;
    }

    setBusyAction('execute');
    setNotice({
      kind: 'info',
      message: '开始执行已批准队列',
    });

    let workingState = state;
    let sentCount = 0;
    let stoppedReason = '';

    try {
      for (let index = 0; index < queue.length; index += 1) {
        const queueItem = queue[index];
        if (!queueItem) {
          break;
        }

        if (countSentToday(workingState.executionLogs) >= state.settings.maxDailyMessages) {
          stoppedReason = '已达到今日发送上限';
          break;
        }

        if (index > 0) {
          await delay(state.settings.sendIntervalSeconds * 1_000);
        }

        const beforeQueued = workingState.jobs.find((job) => job.id === queueItem.id);
        if (!beforeQueued || beforeQueued.executionStatus !== 'idle') {
          continue;
        }

        const queuedAt = new Date().toISOString();
        workingState = updateJob(workingState, queueItem.id, (job) =>
          transitionToQueued(job, queuedAt),
        );
        await persist(workingState);

        const sendingAt = new Date().toISOString();
        workingState = updateJob(workingState, queueItem.id, (job) =>
          transitionToSending(job, sendingAt),
        );
        await persist(workingState);

        let result: BossSendResult;
        try {
          const response = await sendContentRequest({
            type: 'BOSS_SEND_GREETING',
            url: queueItem.sourceUrl,
            text: queueItem.selectedGreeting,
          });
          if (!response.ok) {
            throw new Error(response.error);
          }
          if (!('result' in response)) {
            throw new Error('页面未返回发送结果');
          }
          result = response.result;
        } catch (error) {
          result = {
            status: 'manual_required',
            message: `页面通信中断，可能已经发送，请人工核对：${
              error instanceof Error ? error.message : '未知错误'
            }`,
          };
        }

        const completedAt = new Date().toISOString();
        workingState = updateJob(workingState, queueItem.id, (job) =>
          transitionFromResult(job, result.status, result.message, completedAt),
        );
        const log = createExecutionLog(queueItem, result, completedAt);
        workingState = {
          ...workingState,
          executionLogs: [...workingState.executionLogs, log],
        };
        await persist(workingState);

        if (result.status === 'sent') {
          sentCount += 1;
        } else {
          stoppedReason = result.message;
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
          <SetupStep
            settings={state.settings}
            connected={connected}
            onSave={saveSettings}
            onExportBackup={exportBackup}
            onImportBackup={importBackup}
          />
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
            onRecover={recoverJob}
          />
        ) : null}
      </main>

      <footer className="app-footer">
        <span>v0.2.1</span>
        <span>数据仅保存在本机</span>
      </footer>
    </div>
  );
}
