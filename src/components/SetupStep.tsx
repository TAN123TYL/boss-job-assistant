import { useRef, useState } from 'react';
import { FileText, Save, Upload } from 'lucide-react';
import type { ScreeningSettings } from '../shared/types';
import { splitList } from '../shared/utils';

interface SetupStepProps {
  settings: ScreeningSettings;
  connected: boolean;
  onSave: (settings: ScreeningSettings) => Promise<void>;
}

export function SetupStep({ settings, connected, onSave }: SetupStepProps) {
  const [draft, setDraft] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [fileError, setFileError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const update = <Key extends keyof ScreeningSettings>(key: Key, value: ScreeningSettings[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) {
      return;
    }

    if (!/\.(txt|md|markdown)$/iu.test(file.name)) {
      setFileError('当前版本支持 TXT 或 Markdown，PDF 内容可直接粘贴');
      return;
    }

    const text = await file.text();
    update('resumeText', text);
    setFileError('');
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
          placeholder="粘贴完整简历文本，保留技能、项目、量化成果和工作时间。"
          rows={10}
        />
      </label>

      <div className="inline-actions">
        <input
          ref={fileInputRef}
          className="visually-hidden"
          type="file"
          accept=".txt,.md,.markdown,text/plain,text/markdown"
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
        <button
          className="button button--secondary button--compact"
          type="button"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload aria-hidden="true" size={15} />
          导入文本
        </button>
        <span className="field-note">
          <FileText aria-hidden="true" size={14} />
          只读取本地 TXT / MD
        </span>
      </div>
      {fileError ? <p className="field-error">{fileError}</p> : null}

      <div className="form-grid">
        <label className="field">
          <span className="field__label">目标岗位</span>
          <input
            value={draft.targetTitles}
            onChange={(event) => update('targetTitles', event.target.value)}
            placeholder="产品经理, AI 产品经理"
          />
        </label>
        <label className="field">
          <span className="field__label">目标城市</span>
          <input
            value={draft.targetCities}
            onChange={(event) => update('targetCities', event.target.value)}
            placeholder="上海, 杭州"
          />
        </label>
      </div>

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
            公司信号阈值
            <strong>{draft.minimumCompanyScore}</strong>
          </span>
          <input
            type="range"
            min="30"
            max="80"
            step="5"
            value={draft.minimumCompanyScore}
            onChange={(event) => update('minimumCompanyScore', Number(event.target.value))}
          />
        </label>
      </div>

      <div className="form-grid">
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

      <button
        className="button button--primary button--wide"
        type="button"
        disabled={!isValid || saving}
        onClick={async () => {
          setSaving(true);
          try {
            await onSave({
              ...draft,
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
