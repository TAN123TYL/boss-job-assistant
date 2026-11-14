import { useRef, useState } from 'react';
import { Bot, Database, Download, FileText, Globe2, Save, Upload, Wifi } from 'lucide-react';
import { testAiConnection } from '../shared/ai';
import { extractResumeText } from '../shared/resume-parser';
import type { ScreeningSettings } from '../shared/types';
import { splitList } from '../shared/utils';
import { CitySelect } from './CitySelect';

interface SetupStepProps {
  settings: ScreeningSettings;
  connected: boolean;
  onSave: (settings: ScreeningSettings) => Promise<void>;
  onExportBackup: () => void;
  onImportBackup: (content: string) => Promise<void>;
}

export function SetupStep({
  settings,
  connected,
  onSave,
  onExportBackup,
  onImportBackup,
}: SetupStepProps) {
  const [draft, setDraft] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [fileMessage, setFileMessage] = useState('');
  const [fileError, setFileError] = useState('');
  const [aiTestMessage, setAiTestMessage] = useState('');
  const [testingAi, setTestingAi] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  const update = <Key extends keyof ScreeningSettings>(key: Key, value: ScreeningSettings[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const handleResumeFile = async (file: File | undefined) => {
    if (!file) {
      return;
    }

    setParsing(true);
    setFileError('');
    setFileMessage('');
    try {
      const parsed = await extractResumeText(file);
      if (parsed.text.length < 30) {
        throw new Error('简历可提取文字过少，请检查文件或直接粘贴文本');
      }
      update('resumeText', parsed.text);
      setFileMessage(
        `已导入 ${file.name}${parsed.warnings.length > 0 ? `：${parsed.warnings.join('；')}` : ''}`,
      );
    } catch (error) {
      setFileError(error instanceof Error ? error.message : '简历解析失败');
    } finally {
      setParsing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleBackupFile = async (file: File | undefined) => {
    if (!file) {
      return;
    }

    try {
      await onImportBackup(await file.text());
      setFileMessage('备份已恢复，API Key 沿用当前设置');
      setFileError('');
    } catch (error) {
      setFileError(error instanceof Error ? error.message : '备份恢复失败');
    } finally {
      if (backupInputRef.current) {
        backupInputRef.current.value = '';
      }
    }
  };

  const handleAiTest = async () => {
    setTestingAi(true);
    setAiTestMessage('');
    try {
      setAiTestMessage(
        await testAiConnection({
          ...draft,
          aiEnabled: true,
        }),
      );
    } catch (error) {
      setAiTestMessage(error instanceof Error ? error.message : 'AI 连接失败');
    } finally {
      setTestingAi(false);
    }
  };

  const isValid =
    draft.resumeText.trim().length >= 30 &&
    splitList(draft.targetTitles).length > 0 &&
    splitList(draft.targetCities).length > 0;

  return (
    <section className="step-panel" aria-labelledby="setup-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">筛选依据</p>
          <h2 id="setup-title">简历与目标</h2>
        </div>
        <span className={`connection-dot ${connected ? 'is-online' : ''}`}>
          {connected ? 'Boss 已连接' : '等待 Boss 页面'}
        </span>
      </div>

      <label className="field field--large">
        <span className="field__label">
          简历内容
          <small>{draft.resumeText.length.toLocaleString('zh-CN')} 字</small>
        </span>
        <textarea
          value={draft.resumeText}
          onChange={(event) => update('resumeText', event.target.value)}
          placeholder="导入 PDF、DOCX 或粘贴完整简历，保留技能、项目、量化成果和工作时间。"
          rows={10}
        />
      </label>

      <div className="inline-actions">
        <input
          ref={fileInputRef}
          className="visually-hidden"
          type="file"
          accept=".pdf,.docx,.txt,.md,.markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
          onChange={(event) => void handleResumeFile(event.target.files?.[0])}
        />
        <button
          className="button button--secondary button--compact"
          type="button"
          disabled={parsing}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload aria-hidden="true" size={15} />
          {parsing ? '正在解析' : '导入简历'}
        </button>
        <span className="field-note">
          <FileText aria-hidden="true" size={14} />
          本地解析 PDF / DOCX / TXT / MD
        </span>
      </div>
      {fileMessage ? <p className="field-success">{fileMessage}</p> : null}
      {fileError ? <p className="field-error">{fileError}</p> : null}

      <label className="field">
        <span className="field__label">目标岗位</span>
        <input
          value={draft.targetTitles}
          onChange={(event) => update('targetTitles', event.target.value)}
          placeholder="产品经理, AI 产品经理"
        />
      </label>

      <CitySelect value={draft.targetCities} onChange={(value) => update('targetCities', value)} />

      <label className="field">
        <span className="field__label">排除词</span>
        <input
          value={draft.excludedKeywords}
          onChange={(event) => update('excludedKeywords', event.target.value)}
          placeholder="外包, 保险, 长期出差"
        />
      </label>

      <div className="range-grid">
        <label className="field">
          <span className="field__label">
            简历匹配阈值
            <strong>{draft.minimumResumeScore}</strong>
          </span>
          <input
            type="range"
            min="40"
            max="90"
            step="5"
            value={draft.minimumResumeScore}
            onChange={(event) => update('minimumResumeScore', Number(event.target.value))}
          />
        </label>
        <label className="field">
          <span className="field__label">
            公司可信阈值
            <strong>{draft.companyTrustThreshold}</strong>
          </span>
          <input
            type="range"
            min="50"
            max="90"
            step="5"
            value={draft.companyTrustThreshold}
            onChange={(event) => update('companyTrustThreshold', Number(event.target.value))}
          />
        </label>
      </div>

      <div className="form-grid form-grid--three">
        <label className="field">
          <span className="field__label">滚动加载轮数</span>
          <input
            type="number"
            min="1"
            max="30"
            value={draft.maxScanPages}
            onChange={(event) => update('maxScanPages', Number(event.target.value))}
          />
        </label>
        <label className="field">
          <span className="field__label">每日上限</span>
          <input
            type="number"
            min="1"
            max="50"
            value={draft.maxDailyMessages}
            onChange={(event) => update('maxDailyMessages', Number(event.target.value))}
          />
        </label>
        <label className="field">
          <span className="field__label">发送间隔（秒）</span>
          <input
            type="number"
            min="10"
            max="300"
            value={draft.sendIntervalSeconds}
            onChange={(event) => update('sendIntervalSeconds', Number(event.target.value))}
          />
        </label>
      </div>

      <div className="switch-stack">
        <label className="switch-row">
          <input
            type="checkbox"
            checked={draft.allowRemote}
            onChange={(event) => update('allowRemote', event.target.checked)}
          />
          <span>
            接受远程岗位
            <small>岗位地点明确标注远程时保留</small>
          </span>
        </label>
        <label className="switch-row">
          <input
            type="checkbox"
            checked={draft.replyNotificationsEnabled}
            onChange={(event) => update('replyNotificationsEnabled', event.target.checked)}
          />
          <span>
            HR 回复通知
            <small>每 5 分钟检测 BOSS 未读消息</small>
          </span>
        </label>
      </div>

      <details className="settings-group" open={draft.aiEnabled}>
        <summary>
          <Bot aria-hidden="true" size={17} />
          AI 岗位复核
          <span>{draft.aiEnabled ? '已启用' : '本地规则模式'}</span>
        </summary>
        <div className="settings-group__body">
          <label className="switch-row">
            <input
              type="checkbox"
              checked={draft.aiEnabled}
              onChange={(event) => update('aiEnabled', event.target.checked)}
            />
            <span>
              启用 OpenAI 兼容模型
              <small>简历和岗位摘要会发送到你配置的模型服务</small>
            </span>
          </label>
          <div className="form-grid">
            <label className="field">
              <span className="field__label">接口地址</span>
              <input
                value={draft.aiEndpoint}
                onChange={(event) => update('aiEndpoint', event.target.value)}
                placeholder="https://api.deepseek.com/v1"
              />
            </label>
            <label className="field">
              <span className="field__label">模型</span>
              <input
                value={draft.aiModel}
                onChange={(event) => update('aiModel', event.target.value)}
                placeholder="deepseek-chat"
              />
            </label>
          </div>
          <label className="field">
            <span className="field__label">AI API Key</span>
            <input
              type="password"
              autoComplete="off"
              value={draft.aiApiKey}
              onChange={(event) => update('aiApiKey', event.target.value)}
              placeholder="只保存在本机"
            />
          </label>
          <div className="inline-actions">
            <button
              className="button button--ghost button--compact"
              type="button"
              disabled={testingAi || !draft.aiApiKey.trim()}
              onClick={() => void handleAiTest()}
            >
              <Wifi aria-hidden="true" size={15} />
              {testingAi ? '测试中' : '测试 AI'}
            </button>
            {aiTestMessage ? <span className="field-note">{aiTestMessage}</span> : null}
          </div>
        </div>
      </details>

      <details className="settings-group" open={draft.companyResearchEnabled}>
        <summary>
          <Globe2 aria-hidden="true" size={17} />
          公司全网核验
          <span>{draft.companyResearchEnabled ? '已启用' : '仅页面信号'}</span>
        </summary>
        <div className="settings-group__body">
          <label className="switch-row">
            <input
              type="checkbox"
              checked={draft.companyResearchEnabled}
              onChange={(event) => update('companyResearchEnabled', event.target.checked)}
            />
            <span>
              对通过初筛的公司进行全网资料检索
              <small>需要同时配置 AI Key 和 Tavily Search Key</small>
            </span>
          </label>
          <label className="field">
            <span className="field__label">Tavily Search Key</span>
            <input
              type="password"
              autoComplete="off"
              value={draft.tavilyApiKey}
              onChange={(event) => update('tavilyApiKey', event.target.value)}
              placeholder="用于检索工商、诉讼、欠薪和经营异常信息"
            />
          </label>
          <p className="field-note">
            招聘页信息只作为线索。工商异常、失信、欠薪和劳动争议会降低可信分，所有 AI
            结论保留来源链接。
          </p>
        </div>
      </details>

      <details className="settings-group">
        <summary>
          <Database aria-hidden="true" size={17} />
          本地备份
          <span>不包含 API Key</span>
        </summary>
        <div className="settings-group__body">
          <div className="inline-actions">
            <input
              ref={backupInputRef}
              className="visually-hidden"
              type="file"
              accept=".json,application/json"
              onChange={(event) => void handleBackupFile(event.target.files?.[0])}
            />
            <button
              className="button button--ghost button--compact"
              type="button"
              onClick={onExportBackup}
            >
              <Download aria-hidden="true" size={15} />
              导出备份
            </button>
            <button
              className="button button--ghost button--compact"
              type="button"
              onClick={() => backupInputRef.current?.click()}
            >
              <Upload aria-hidden="true" size={15} />
              恢复备份
            </button>
          </div>
        </div>
      </details>

      <button
        className="button button--primary button--wide"
        type="button"
        disabled={!isValid || saving}
        onClick={async () => {
          setSaving(true);
          try {
            await onSave({
              ...draft,
              maxScanPages: Math.max(1, Math.min(30, draft.maxScanPages)),
              maxDailyMessages: Math.max(1, Math.min(50, draft.maxDailyMessages)),
              sendIntervalSeconds: Math.max(10, Math.min(300, draft.sendIntervalSeconds)),
            });
          } finally {
            setSaving(false);
          }
        }}
      >
        <Save aria-hidden="true" size={16} />
        {saving ? '正在保存' : '保存筛选方案'}
      </button>
    </section>
  );
}
