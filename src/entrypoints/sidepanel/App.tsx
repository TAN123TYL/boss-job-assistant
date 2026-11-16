import { useEffect, useRef, useState } from 'react';
import {
  BriefcaseBusiness,
  ClipboardCheck,
  Send,
  Settings2,
  ShieldCheck,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { browser } from 'wxt/browser';
import { InlineNotice } from '../../components/InlineNotice';
import type { Notice } from '../../components/InlineNotice';
import { QueueStep } from '../../components/QueueStep';
import { ReviewStep } from '../../components/ReviewStep';
import { ScreenStep } from '../../components/ScreenStep';
import { SetupStep } from '../../components/SetupStep';
import { enhanceJobWithAi } from '../../shared/ai';
import { approvedQueue, canExecuteQueue } from '../../shared/approval';
import { backupToJson, parseAppBackup } from '../../shared/backup';
import {
  closeTab,
  createAutomationTab,
  createOrGetChatListTab,
  listZhipinTabIds,
  navigateTabToJob,
  sendContentRequest,
  sendContentRequestToTab,
  waitForTabOpenedBy,
  waitForNewZhipinTab,
} from '../../shared/browser-tab';
import { researchCompanyWithAi } from '../../shared/company-research';
import { countSentToday } from '../../shared/execution';
import { buildCandidateProfile } from '../../shared/matching';
import {
  canRecoverJob,
  confirmManualSend,
  transitionFromResult,
  transitionToQueued,
  transitionToRecovered,
  transitionToSending,
} from '../../shared/queue';
import {
  canReevaluateRejectedJob,
  mergeScreenedJobs,
  reevaluateStoredJob,
  screenJob,
} from '../../shared/screening';
import { loadAppState, saveAppState } from '../../shared/storage';
import type {
  AppState,
  BossPageStatus,
  BossSendResult,
  ContentResponse,
  ExecutionLog,
  JobRecord,
  ScanProgress,
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
  if (status === 'chat_opened') {
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
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const [scanStartedAt, setScanStartedAt] = useState<number | null>(null);
  const cancelScanRef = useRef(false);

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

  useEffect(() => {
    const handleProgress = (message: unknown) => {
      if (
        message &&
        typeof message === 'object' &&
        'type' in message &&
        message.type === 'BOSS_SCAN_PROGRESS' &&
        'progress' in message
      ) {
        setScanProgress(message.progress as ScanProgress);
      }
    };

    browser.runtime.onMessage.addListener(handleProgress);
    return () => {
      browser.runtime.onMessage.removeListener(handleProgress);
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

  const applyExternalChecks = async (
    jobs: JobRecord[],
    settings: ScreeningSettings,
  ): Promise<{
    jobs: JobRecord[];
    aiFailures: number;
    researchFailures: number;
  }> => {
    let checkedJobs = jobs;
    let aiFailures = 0;
    let researchFailures = 0;
    const candidates = checkedJobs
      .filter((job) => job.stage === 'ready_for_review' && job.approvalStatus === 'pending')
      .sort((left, right) => right.finalScore - left.finalScore)
      .slice(0, 12);

    if (settings.aiEnabled) {
      for (let index = 0; index < candidates.length; index += 1) {
        if (cancelScanRef.current) {
          break;
        }
        const candidate = candidates[index];
        if (!candidate) {
          continue;
        }
        setScanProgress({
          phase: 'analyzing',
          message: `AI 正在复核岗位：${candidate.title}`,
          current: index + 1,
          total: candidates.length,
        });
        try {
          const enhanced = await enhanceJobWithAi(candidate, settings);
          checkedJobs = checkedJobs.map((job) => (job.id === candidate.id ? enhanced : job));
        } catch {
          aiFailures += 1;
        }
      }
    }

    if (settings.companyResearchEnabled) {
      const researchCandidates = checkedJobs.filter(
        (job) => job.stage === 'ready_for_review' && job.approvalStatus === 'pending',
      );
      for (let index = 0; index < researchCandidates.length; index += 1) {
        if (cancelScanRef.current) {
          break;
        }
        const candidate = researchCandidates[index];
        if (!candidate) {
          continue;
        }
        setScanProgress({
          phase: 'analyzing',
          message: `正在核验公司：${candidate.company}`,
          current: index + 1,
          total: researchCandidates.length,
        });
        try {
          const researched = await researchCompanyWithAi(candidate, settings);
          checkedJobs = checkedJobs.map((job) => (job.id === candidate.id ? researched : job));
        } catch (error) {
          researchFailures += 1;
          const message = error instanceof Error ? error.message : '公司全网核验失败';
          checkedJobs = checkedJobs.map((job) =>
            job.id === candidate.id
              ? {
                  ...job,
                  companyAssessment: {
                    ...job.companyAssessment,
                    passed: true,
                    trustDecision: 'review' as const,
                    aiSummary: message,
                    risks: [...new Set([...job.companyAssessment.risks, message])],
                  },
                }
              : job,
          );
        }
      }
    }

    return { jobs: checkedJobs, aiFailures, researchFailures };
  };

  const cancelScan = async () => {
    cancelScanRef.current = true;
    setScanProgress({
      phase: 'finishing',
      message: '正在停止扫描并保留已读取结果',
      current: 0,
      total: 0,
    });
    setNotice({
      kind: 'info',
      message: '停止请求已发送，当前网络请求结束后会保留已有结果',
    });
    try {
      await sendContentRequest({ type: 'BOSS_CANCEL_SCAN' }, 5_000);
    } catch {
      // The side-panel cancellation flag still stops AI and company checks.
    }
  };

  const scanJobs = async () => {
    if (!state) {
      return;
    }

    if (
      state.settings.companyResearchEnabled &&
      (!state.settings.aiEnabled ||
        !state.settings.aiApiKey.trim() ||
        !state.settings.tavilyApiKey.trim())
    ) {
      setNotice({
        kind: 'error',
        message: '公司全网核验需要同时启用 AI 并配置 AI Key 和 Tavily Key',
      });
      return;
    }

    cancelScanRef.current = false;
    setScanStartedAt(Date.now());
    setScanProgress({
      phase: 'collecting',
      message: '正在连接 Boss 页面并准备扫描',
      current: 0,
      total: state.settings.maxScanPages,
    });
    setBusyAction('scan');
    setNotice(null);

    try {
      const response = await sendContentRequest(
        {
          type: 'BOSS_SCAN_JOBS',
          maxPages: state.settings.maxScanPages,
          hydrateDetails: state.settings.hydrateJobDetails,
          maxDetails: state.settings.maxJobDetails,
        },
        5 * 60_000,
      );
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
      setScanProgress({
        phase: 'analyzing',
        message: '岗位读取完成，正在执行简历匹配',
        current: 0,
        total: response.payload.drafts.length,
      });
      const screenedJobs = response.payload.drafts.map((draft) =>
        screenJob(draft, profile, state.settings, scannedAt),
      );
      const checked = await applyExternalChecks(screenedJobs, state.settings);
      const enhancedJobs = checked.jobs;
      const { aiFailures, researchFailures } = checked;
      setScanProgress({
        phase: 'finishing',
        message: '正在保存筛选结果',
        current: enhancedJobs.length,
        total: enhancedJobs.length,
      });

      const nextState: AppState = {
        ...state,
        jobs: mergeScreenedJobs(state.jobs, enhancedJobs),
        lastScanAt: scannedAt,
      };

      await persist(nextState);
      setPageStatus(response.payload.page);
      const readyCount = enhancedJobs.filter((job) => job.stage === 'ready_for_review').length;
      const notes = [
        `加载 ${response.payload.pagesScanned} 轮`,
        `去重 ${response.payload.duplicatesSkipped} 个`,
        `抓取 JD ${response.payload.detailsHydrated} 个`,
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
      cancelScanRef.current = true;
      void sendContentRequest({ type: 'BOSS_CANCEL_SCAN' }, 5_000).catch(() => undefined);
      setNotice({
        kind: 'error',
        message: error instanceof Error ? error.message : '扫描岗位失败',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const resetRejectedJobs = async () => {
    if (!state) {
      return;
    }

    const candidates = state.jobs.filter(canReevaluateRejectedJob);
    if (candidates.length === 0) {
      setNotice({
        kind: 'info',
        message: '没有可重置的历史排除岗位',
      });
      return;
    }

    if (
      state.settings.companyResearchEnabled &&
      (!state.settings.aiEnabled ||
        !state.settings.aiApiKey.trim() ||
        !state.settings.tavilyApiKey.trim())
    ) {
      setNotice({
        kind: 'error',
        message: '公司全网核验需要同时启用 AI 并配置 AI Key 和 Tavily Key',
      });
      return;
    }

    cancelScanRef.current = false;
    setScanStartedAt(Date.now());
    setScanProgress({
      phase: 'analyzing',
      message: `正在重新评估 ${candidates.length} 个历史排除岗位`,
      current: 0,
      total: candidates.length,
    });
    setBusyAction('scan');
    setNotice({
      kind: 'info',
      message: `正在用当前规则重新评估 ${candidates.length} 个历史排除岗位`,
    });

    try {
      const profile = buildCandidateProfile(state.settings);
      const timestamp = new Date().toISOString();
      const candidateIds = new Set(candidates.map((job) => job.id));
      const reevaluated = state.jobs.map((job) =>
        canReevaluateRejectedJob(job)
          ? reevaluateStoredJob(job, profile, state.settings, timestamp)
          : job,
      );
      const checked = await applyExternalChecks(reevaluated, state.settings);
      const recovered = checked.jobs.filter(
        (job) => candidateIds.has(job.id) && job.stage === 'ready_for_review',
      ).length;
      await persist({
        ...state,
        jobs: checked.jobs,
      });
      setScanProgress({
        phase: 'finishing',
        message: '历史岗位重新评估完成',
        current: candidates.length,
        total: candidates.length,
      });

      const notes = [`重新评估 ${candidates.length} 个岗位`, `${recovered} 个恢复为待确认`];
      if (checked.aiFailures > 0) {
        notes.push(`${checked.aiFailures} 个 AI 复核失败`);
      }
      if (checked.researchFailures > 0) {
        notes.push(`${checked.researchFailures} 个公司核验失败`);
      }
      setNotice({
        kind: recovered > 0 ? 'success' : 'info',
        message: notes.join('，'),
      });
      if (recovered > 0) {
        setActiveTab('review');
      }
    } catch (error) {
      setNotice({
        kind: 'error',
        message: error instanceof Error ? error.message : '历史岗位重新评估失败',
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

  const dismissQueuedJob = async (jobId: string) => {
    if (!state) {
      return;
    }
    const job = state.jobs.find((candidate) => candidate.id === jobId);
    if (!job || job.executionStatus === 'sent') {
      setNotice({
        kind: 'error',
        message: '已发送岗位不能标记为失效',
      });
      return;
    }

    const now = new Date().toISOString();
    const nextState = updateJob(state, jobId, (candidate) => ({
      ...candidate,
      approvalStatus: 'skipped',
      executionStatus: 'idle',
      queueError: '岗位页面已失效，已从发送队列移除',
      updatedAt: now,
    }));
    await persist(nextState);
    setNotice({
      kind: 'info',
      message: '岗位已标记为失效并移出发送队列',
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

  const confirmManuallySentJob = async (jobId: string) => {
    if (!state) {
      return;
    }
    const job = state.jobs.find((candidate) => candidate.id === jobId);
    if (!job || job.executionStatus !== 'manual_required') {
      setNotice({
        kind: 'error',
        message: '只有“可能已发送”的岗位可以人工确认',
      });
      return;
    }

    const now = new Date().toISOString();
    const log: ExecutionLog = {
      id: createId(),
      jobId: job.id,
      company: job.company,
      title: job.title,
      at: now,
      status: 'sent',
      message: '人工打开 Boss 会话后确认消息已发送',
    };
    const nextState = updateJob(state, jobId, (candidate) => confirmManualSend(candidate, now));
    await persist({
      ...nextState,
      executionLogs: [...nextState.executionLogs, log],
    });
    setNotice({
      kind: 'success',
      message: '已人工确认发送，不会再次进入发送队列',
    });
  };

  const sendApprovedGreeting = async (
    job: JobRecord,
    automationTabId: number,
    chatListTabId: number,
  ): Promise<BossSendResult> => {
    await navigateTabToJob(automationTabId, job.sourceUrl);
    const existingTabs = await listZhipinTabIds();
    let response: ContentResponse;
    try {
      response = await sendContentRequestToTab(
        automationTabId,
        {
          type: 'BOSS_SEND_GREETING',
          url: job.sourceUrl,
          text: job.selectedGreeting,
        },
        45_000,
      );
    } catch {
      response = {
        ok: true,
        result: {
          status: 'chat_opened',
          message: '岗位页请求中断，正在进入 Boss 消息列表',
        },
      };
    }
    if (!response.ok) {
      throw new Error(response.error);
    }
    if (!('result' in response)) {
      throw new Error('原岗位页面未返回发送结果');
    }
    if (response.result.status === 'chat_opened') {
      const popupTabId =
        (await waitForTabOpenedBy(automationTabId, 4_000)) ??
        (await waitForNewZhipinTab(existingTabs, 4_000));
      const chatResponse = await sendContentRequestToTab(
        chatListTabId,
        {
          type: 'BOSS_SEND_CHAT_LIST_TEXT',
          company: job.company,
          title: job.title,
          recruiter: job.recruiter,
          text: job.selectedGreeting,
        },
        45_000,
      );
      if (!chatResponse.ok) {
        throw new Error(chatResponse.error);
      }
      if (!('result' in chatResponse)) {
        throw new Error('消息列表未返回 AI 文案发送结果');
      }
      if (chatResponse.result.status === 'sent' && popupTabId) {
        await closeTab(popupTabId);
      }
      return {
        status: chatResponse.result.status,
        message:
          chatResponse.result.status === 'sent'
            ? `已进入 Boss 消息列表，在对应会话中发送 AI 文案并确认气泡：${chatResponse.result.message}`
            : `Boss 消息列表发送 AI 文案失败：${chatResponse.result.message}`,
      };
    }

    return {
      status: response.result.status,
      message:
        response.result.status === 'sent'
          ? `已通过已有会话发送并确认气泡：${response.result.message}`
          : `已有会话发送失败：${response.result.message}`,
    };
  };

  const executeQueue = async () => {
    if (!state) {
      return;
    }

    const queue = approvedQueue(state.jobs);
    if (!canExecuteQueue(state.jobs)) {
      setNotice({
        kind: 'error',
        message: '没有待发送岗位',
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
    let automationTabId: number | null = null;

    try {
      automationTabId = await createAutomationTab();
      const chatListTabId = await createOrGetChatListTab();
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
          result = await sendApprovedGreeting(queueItem, automationTabId, chatListTabId);
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
      if (automationTabId !== null) {
        await closeTab(automationTabId);
      }
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
            onResetRejected={resetRejectedJobs}
            progress={scanProgress}
            startedAt={scanStartedAt}
            onCancel={cancelScan}
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
            onDismiss={dismissQueuedJob}
            onConfirmSent={confirmManuallySentJob}
          />
        ) : null}
      </main>

      <footer className="app-footer">
        <span>v0.3.9</span>
        <span>数据仅保存在本机</span>
      </footer>
    </div>
  );
}
