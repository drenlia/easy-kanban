import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import api from '../../api';
import {
  AI_PROVIDER_PRESETS,
  getAiProviderPreset,
  isSuggestedOrEmptyBaseUrl,
} from '../../constants/aiProviders';
import { isMaskedApiKeyDisplay, maskApiKey } from '../../utils/maskSecret';
import { useSettings } from '../../contexts/SettingsContext';
import { toast } from '../../utils/toast';

interface AdminAISettingsTabProps {
  editingSettings: { [key: string]: string | undefined };
  onSettingsChange: (settings: { [key: string]: string | undefined }) => void;
  onAutoSave: (key: string, value: string) => Promise<void>;
}

interface AiModelOption {
  id: string;
  name?: string;
}

const CUSTOM_MODEL = '__custom__';

function isEnabled(value: string | undefined): boolean {
  return value === 'true';
}

function initialBaseUrl(settings: { [key: string]: string | undefined }): string {
  const saved = (settings.AI_API_BASE_URL || '').trim();
  if (saved) return saved;
  return getAiProviderPreset(settings.AI_PROVIDER || 'openai').suggestedBaseUrl;
}

const AdminAISettingsTab: React.FC<AdminAISettingsTabProps> = ({
  editingSettings,
  onSettingsChange,
}) => {
  const { t } = useTranslation('admin');
  const { updateSiteSetting } = useSettings();
  const [savingEnabled, setSavingEnabled] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingAgentName, setSavingAgentName] = useState(false);
  const [testing, setTesting] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState(editingSettings.AI_API_KEY || '');
  const [runnerTokenDraft, setRunnerTokenDraft] = useState(
    editingSettings.AI_RUNNER_TOKEN || ''
  );
  const [agentName, setAgentName] = useState(editingSettings.AI_AGENT_NAME || 'Agent');
  const [provider, setProvider] = useState(editingSettings.AI_PROVIDER || 'openai');
  const [baseUrl, setBaseUrl] = useState(() => initialBaseUrl(editingSettings));
  const [model, setModel] = useState(editingSettings.AI_MODEL || '');
  const [maxConcurrent, setMaxConcurrent] = useState(
    editingSettings.AI_MAX_CONCURRENT || '1'
  );
  const [runnerUrl, setRunnerUrl] = useState(
    editingSettings.AI_RUNNER_URL || 'http://kanban-runner:8080'
  );
  const [modelMode, setModelMode] = useState<'list' | 'custom'>('custom');
  const [models, setModels] = useState<AiModelOption[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validationOk, setValidationOk] = useState<string | null>(null);
  const [testingRunner, setTestingRunner] = useState(false);

  const selectedPreset = useMemo(() => getAiProviderPreset(provider), [provider]);
  const savedKeyMask = editingSettings.AI_API_KEY || '';
  const savedRunnerTokenMask = editingSettings.AI_RUNNER_TOKEN || '';

  useEffect(() => {
    setAgentName(editingSettings.AI_AGENT_NAME || 'Agent');
  }, [editingSettings.AI_AGENT_NAME]);

  useEffect(() => {
    setProvider(editingSettings.AI_PROVIDER || 'openai');
    setBaseUrl(initialBaseUrl(editingSettings));
    setModel(editingSettings.AI_MODEL || '');
    setApiKeyDraft(editingSettings.AI_API_KEY || '');
    setMaxConcurrent(editingSettings.AI_MAX_CONCURRENT || '1');
    setRunnerUrl(editingSettings.AI_RUNNER_URL || 'http://kanban-runner:8080');
    setRunnerTokenDraft(editingSettings.AI_RUNNER_TOKEN || '');
  }, [
    editingSettings.AI_PROVIDER,
    editingSettings.AI_API_BASE_URL,
    editingSettings.AI_MODEL,
    editingSettings.AI_API_KEY,
    editingSettings.AI_MAX_CONCURRENT,
    editingSettings.AI_RUNNER_URL,
    editingSettings.AI_RUNNER_TOKEN,
  ]);

  useEffect(() => {
    if (models.length === 0) {
      setModelMode('custom');
      return;
    }
    if (model && models.some((m) => m.id === model)) {
      setModelMode('list');
    } else if (model) {
      setModelMode('custom');
    }
  }, [models, model]);

  const enabled = isEnabled(editingSettings.AI_ENABLED);
  const keySet = editingSettings.AI_API_KEY_SET === 'true' || Boolean(savedKeyMask);
  const runnerTokenSet =
    editingSettings.AI_RUNNER_TOKEN_SET === 'true' || Boolean(savedRunnerTokenMask);
  const trimmedKey = apiKeyDraft.trim();
  const keyReplaced =
    trimmedKey !== '' &&
    trimmedKey !== savedKeyMask &&
    !isMaskedApiKeyDisplay(trimmedKey);
  const trimmedRunnerToken = runnerTokenDraft.trim();
  const runnerTokenReplaced =
    trimmedRunnerToken !== '' &&
    trimmedRunnerToken !== savedRunnerTokenMask &&
    !isMaskedApiKeyDisplay(trimmedRunnerToken);

  const savedAgentName = editingSettings.AI_AGENT_NAME || 'Agent';
  const agentNameDirty = (agentName.trim() || 'Agent') !== savedAgentName;

  const configDirty =
    provider !== (editingSettings.AI_PROVIDER || 'openai') ||
    baseUrl.trim() !== (editingSettings.AI_API_BASE_URL || '') ||
    model.trim() !== (editingSettings.AI_MODEL || '') ||
    maxConcurrent.trim() !== (editingSettings.AI_MAX_CONCURRENT || '1') ||
    runnerUrl.trim() !==
      (editingSettings.AI_RUNNER_URL || 'http://kanban-runner:8080') ||
    keyReplaced ||
    runnerTokenReplaced;

  const putSetting = async (key: string, value: string) => {
    const { data } = await api.put('/admin/settings', { key, value });
    const isSecret = ['AI_API_KEY', 'AI_RUNNER_TOKEN'].includes(key);
    const publicValue = isSecret ? (data?.value ?? maskApiKey(value)) : value;
    updateSiteSetting(key, publicValue);
    return data as { value?: string };
  };

  const draftPayload = () => ({
    provider,
    baseUrl: baseUrl.trim(),
    // Only send a newly pasted key; masks/empty use the saved secret on the server
    apiKey: keyReplaced ? trimmedKey : undefined,
    model: model.trim(),
  });

  /** Fill suggested endpoint when switching presets; keep a real custom override. */
  const applyProviderChange = (nextId: string) => {
    const next = getAiProviderPreset(nextId);
    setProvider(nextId);
    setModels([]);
    setValidationError(null);
    setValidationOk(null);
    if (isSuggestedOrEmptyBaseUrl(baseUrl) && next.suggestedBaseUrl) {
      setBaseUrl(next.suggestedBaseUrl);
    } else if (!next.suggestedBaseUrl && isSuggestedOrEmptyBaseUrl(baseUrl)) {
      setBaseUrl('');
    }
  };

  const applyAgentName = async () => {
    if (!agentNameDirty || savingAgentName) return;
    setSavingAgentName(true);
    try {
      const name = agentName.trim() || 'Agent';
      await putSetting('AI_AGENT_NAME', name);
      setAgentName(name);
      onSettingsChange({
        ...editingSettings,
        AI_AGENT_NAME: name,
      });
      toast.success(t('appSettings.aiAgentNameApplied'), '');
    } catch (error: any) {
      console.error('Failed to apply agent name:', error);
      const msg =
        error?.response?.data?.error ||
        error?.message ||
        t('failedToSaveSettings');
      toast.error(String(msg), '');
    } finally {
      setSavingAgentName(false);
    }
  };

  const saveConfiguration = async () => {
    setSavingConfig(true);
    setValidationError(null);
    setValidationOk(null);
    try {
      const url = baseUrl.trim();
      const modelVal = model.trim();
      const maxVal = String(
        Math.min(10, Math.max(1, parseInt(maxConcurrent, 10) || 1))
      );
      const runnerUrlVal = runnerUrl.trim();
      const next: { [key: string]: string | undefined } = {
        ...editingSettings,
        AI_PROVIDER: provider,
        AI_API_BASE_URL: url,
        AI_MODEL: modelVal,
        AI_MAX_CONCURRENT: maxVal,
        AI_RUNNER_URL: runnerUrlVal,
      };

      if (provider !== (editingSettings.AI_PROVIDER || 'openai')) {
        await putSetting('AI_PROVIDER', provider);
      }
      if (url !== (editingSettings.AI_API_BASE_URL || '')) {
        await putSetting('AI_API_BASE_URL', url);
      }
      if (modelVal !== (editingSettings.AI_MODEL || '')) {
        await putSetting('AI_MODEL', modelVal);
      }
      if (maxVal !== (editingSettings.AI_MAX_CONCURRENT || '1')) {
        await putSetting('AI_MAX_CONCURRENT', maxVal);
        setMaxConcurrent(maxVal);
      }
      if (runnerUrlVal !== (editingSettings.AI_RUNNER_URL || '')) {
        await putSetting('AI_RUNNER_URL', runnerUrlVal);
      }
      if (keyReplaced) {
        const saved = await putSetting('AI_API_KEY', trimmedKey);
        const hint = saved?.value || maskApiKey(trimmedKey);
        setApiKeyDraft(hint);
        next.AI_API_KEY_SET = 'true';
        next.AI_API_KEY = hint;
      }
      if (runnerTokenReplaced) {
        const saved = await putSetting('AI_RUNNER_TOKEN', trimmedRunnerToken);
        const hint = saved?.value || maskApiKey(trimmedRunnerToken);
        setRunnerTokenDraft(hint);
        next.AI_RUNNER_TOKEN_SET = 'true';
        next.AI_RUNNER_TOKEN = hint;
      }
      onSettingsChange(next);
      toast.success(t('appSettings.aiConfigSaved'), '');
    } catch (error: any) {
      console.error('Failed to save AI configuration:', error);
      const msg =
        error?.response?.data?.error ||
        error?.message ||
        t('failedToSaveSettings');
      toast.error(String(msg), '');
    } finally {
      setSavingConfig(false);
    }
  };

  const runValidate = async () => {
    const { data } = await api.post('/admin/settings/ai/validate', draftPayload());
    return data as {
      ok: boolean;
      detail?: string;
      error?: string;
      models?: AiModelOption[];
      provider?: string;
    };
  };

  const refreshModels = async () => {
    setLoadingModels(true);
    setValidationError(null);
    try {
      const { data } = await api.post('/admin/settings/ai/models', draftPayload());
      if (!data?.ok) {
        setValidationError(data?.error || t('appSettings.aiModelsFailed'));
        return;
      }
      const list = (data.models || []) as AiModelOption[];
      setModels(list);
      if (list.length > 0) {
        toast.success(t('appSettings.aiModelsLoaded', { count: list.length }), '');
        if (!model && list[0]?.id) {
          setModel(list[0].id);
          setModelMode('list');
        }
      } else {
        toast.success(t('appSettings.aiModelsEmpty'), '');
        setModelMode('custom');
      }
    } catch (error: any) {
      const msg =
        error?.response?.data?.error ||
        error?.message ||
        t('appSettings.aiModelsFailed');
      setValidationError(String(msg));
      toast.error(String(msg), '');
    } finally {
      setLoadingModels(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setValidationError(null);
    setValidationOk(null);
    try {
      const result = await runValidate();
      if (!result.ok) {
        setValidationError(result.error || t('appSettings.aiValidationFailed'));
        toast.error(result.error || t('appSettings.aiValidationFailed'), '');
        return;
      }
      const detail = result.detail || t('appSettings.aiValidationOk');
      setValidationOk(detail);
      toast.success(detail, '');
      if (Array.isArray(result.models) && result.models.length > 0) {
        setModels(result.models);
        if (!model && result.models[0]?.id) {
          setModel(result.models[0].id);
          setModelMode('list');
        }
      } else {
        void refreshModels();
      }
    } catch (error: any) {
      const msg =
        error?.response?.data?.error ||
        error?.message ||
        t('appSettings.aiValidationFailed');
      setValidationError(String(msg));
      toast.error(String(msg), '');
    } finally {
      setTesting(false);
    }
  };

  const testRunner = async () => {
    setTestingRunner(true);
    setValidationError(null);
    setValidationOk(null);
    try {
      const { data } = await api.post('/admin/settings/ai/runner/probe', {
        runnerUrl: runnerUrl.trim(),
        runnerToken: runnerTokenReplaced ? trimmedRunnerToken : undefined,
      });
      if (!data?.ok) {
        setValidationError(data?.error || t('appSettings.aiRunnerProbeFailed'));
        toast.error(data?.error || t('appSettings.aiRunnerProbeFailed'), '');
        return;
      }
      setValidationOk(data.detail || t('appSettings.aiRunnerProbeOk'));
      toast.success(data.detail || t('appSettings.aiRunnerProbeOk'), '');
    } catch (error: any) {
      const msg =
        error?.response?.data?.error ||
        error?.message ||
        t('appSettings.aiRunnerProbeFailed');
      setValidationError(String(msg));
      toast.error(String(msg), '');
    } finally {
      setTestingRunner(false);
    }
  };

  const toggleEnabled = async () => {
    const previous = editingSettings.AI_ENABLED ?? 'false';
    const turningOn = !isEnabled(previous);
    setSavingEnabled(true);
    setValidationError(null);
    setValidationOk(null);

    try {
      if (turningOn) {
        if (configDirty) {
          setValidationError(t('appSettings.aiSaveBeforeEnable'));
          toast.error(t('appSettings.aiSaveBeforeEnable'), '');
          return;
        }
        try {
          await runValidate();
        } catch (error: any) {
          const msg =
            error?.response?.data?.error ||
            error?.message ||
            t('appSettings.aiValidationFailed');
          setValidationError(String(msg));
          toast.error(String(msg), '');
          return;
        }
      }

      await putSetting('AI_ENABLED', turningOn ? 'true' : 'false');
      onSettingsChange({
        ...editingSettings,
        AI_ENABLED: turningOn ? 'true' : 'false',
      });
      toast.success(
        turningOn ? t('appSettings.aiEnabledSuccess') : t('appSettings.aiDisabledSuccess'),
        ''
      );
    } catch (error: any) {
      const msg =
        error?.response?.data?.error ||
        error?.message ||
        t('failedToSaveSettings');
      setValidationError(String(msg));
      onSettingsChange({ ...editingSettings, AI_ENABLED: previous });
      toast.error(String(msg), '');
    } finally {
      setSavingEnabled(false);
    }
  };

  const modelSelectValue =
    modelMode === 'custom' || !models.some((m) => m.id === model)
      ? CUSTOM_MODEL
      : model;

  const sectionClass =
    'rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/30 p-4 sm:p-5 space-y-4';

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Sparkles
            size={18}
            className="text-teal-600 dark:text-teal-400 shrink-0"
            aria-hidden
          />
          {t('appSettings.aiTitle')}
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {t('appSettings.aiDescription')}
        </p>
      </div>

      <div className="px-6 py-5 space-y-5">
        {validationError && (
          <div
            role="alert"
            className="rounded-md border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-800 dark:text-red-200"
          >
            {validationError}
          </div>
        )}
        {validationOk && !validationError && (
          <div
            role="status"
            className="rounded-md border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20 px-4 py-3 text-sm text-green-800 dark:text-green-200"
          >
            {validationOk}
          </div>
        )}

        {/* 1. Enable */}
        <section className={sectionClass} aria-labelledby="ai-section-enable">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h4
                id="ai-section-enable"
                className="text-sm font-semibold text-gray-900 dark:text-gray-100"
              >
                {t('appSettings.aiSectionEnable')}
              </h4>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                {t('appSettings.aiSectionEnableHint')}
              </p>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                {t('appSettings.aiEnabledDescription')}
              </p>
            </div>
            <div className="flex flex-shrink-0 items-center gap-3">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {enabled ? t('appSettings.enabled') : t('appSettings.disabled')}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                disabled={savingEnabled}
                onClick={() => void toggleEnabled()}
                className={`${
                  enabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'
                } relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50`}
              >
                <span
                  className={`${
                    enabled ? 'translate-x-5' : 'translate-x-0'
                  } pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
                />
              </button>
            </div>
          </div>
        </section>

        {/* 2. Agent identity */}
        <section className={sectionClass} aria-labelledby="ai-section-agent">
          <div>
            <h4
              id="ai-section-agent"
              className="text-sm font-semibold text-gray-900 dark:text-gray-100"
            >
              {t('appSettings.aiSectionAgent')}
            </h4>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              {t('appSettings.aiSectionAgentHint')}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('appSettings.aiAgentName')}
            </label>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
              {t('appSettings.aiAgentNameDescription')}
            </p>
            <div className="flex flex-wrap items-center gap-2 max-w-md">
              <input
                type="text"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && agentNameDirty && !savingAgentName) {
                    e.preventDefault();
                    void applyAgentName();
                  }
                }}
                className="block min-w-0 flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
              <button
                type="button"
                disabled={!agentNameDirty || savingAgentName}
                onClick={() => void applyAgentName()}
                className="px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingAgentName
                  ? t('appSettings.saving')
                  : t('appSettings.aiAgentNameApply')}
              </button>
            </div>
          </div>
        </section>

        {/* 3. LLM */}
        <section className={sectionClass} aria-labelledby="ai-section-llm">
          <div>
            <h4
              id="ai-section-llm"
              className="text-sm font-semibold text-gray-900 dark:text-gray-100"
            >
              {t('appSettings.aiSectionLlm')}
            </h4>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              {t('appSettings.aiSectionLlmHint')}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('appSettings.aiProvider')}
            </label>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
              {t('appSettings.aiProviderDescription')}
            </p>
            <select
              value={provider}
              onChange={(e) => applyProviderChange(e.target.value)}
              className="block w-full max-w-md px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              {AI_PROVIDER_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            {selectedPreset.hint && (
              <p className="mt-2 text-sm text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md px-3 py-2">
                {selectedPreset.hint}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('appSettings.aiApiBaseUrl')}
            </label>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
              {t('appSettings.aiApiBaseUrlDescription')}
            </p>
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={
                selectedPreset.suggestedBaseUrl || 'https://api.openai.com/v1'
              }
              className="block w-full max-w-xl px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
            {selectedPreset.suggestedBaseUrl && (
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                {t('appSettings.aiSuggestedEndpoint')}:{' '}
                <button
                  type="button"
                  className="font-mono text-blue-600 dark:text-blue-400 hover:underline"
                  onClick={() => setBaseUrl(selectedPreset.suggestedBaseUrl)}
                >
                  {selectedPreset.suggestedBaseUrl}
                </button>
                {baseUrl.trim() !== selectedPreset.suggestedBaseUrl
                  ? ` — ${t('appSettings.aiUseSuggestedUrlShort')}`
                  : ''}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('appSettings.aiApiKey')}
            </label>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
              {selectedPreset && !selectedPreset.apiKeyRequired
                ? t('appSettings.aiApiKeyOptional')
                : t('appSettings.aiApiKeyDescription')}
              {keySet ? ` ${t('appSettings.aiApiKeyConfigured')}` : ''}
            </p>
            <input
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={apiKeyDraft}
              onChange={(e) => setApiKeyDraft(e.target.value)}
              placeholder={
                keySet
                  ? t('appSettings.aiApiKeyReplacePlaceholder')
                  : selectedPreset && !selectedPreset.apiKeyRequired
                    ? t('appSettings.aiApiKeyOptionalPlaceholder')
                    : ''
              }
              className="block w-full max-w-xl px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm font-mono bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
            {keySet && isMaskedApiKeyDisplay(apiKeyDraft) && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {t('appSettings.aiApiKeyMaskHint')}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('appSettings.aiModel')}
            </label>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
              {t('appSettings.aiModelDescription')}
            </p>
            <div className="flex flex-wrap items-end gap-2 max-w-xl">
              <select
                value={modelSelectValue}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === CUSTOM_MODEL) {
                    setModelMode('custom');
                    return;
                  }
                  setModelMode('list');
                  setModel(v);
                }}
                className="block w-full max-w-md px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value={CUSTOM_MODEL}>
                  {t('appSettings.aiModelCustomOption')}
                </option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name && m.name !== m.id ? `${m.name} (${m.id})` : m.id}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={loadingModels || testing}
                onClick={() => void refreshModels()}
                className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
              >
                {loadingModels
                  ? t('appSettings.aiLoadingModels')
                  : t('appSettings.aiRefreshModels')}
              </button>
            </div>
            {(modelMode === 'custom' || models.length === 0) && (
              <input
                type="text"
                value={model}
                onChange={(e) => {
                  setModelMode('custom');
                  setModel(e.target.value);
                }}
                placeholder={t('appSettings.aiModelPlaceholder')}
                className="mt-2 block w-full max-w-md px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            )}
          </div>

          <div className="flex flex-wrap gap-2 pt-1 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              disabled={testing || savingConfig}
              onClick={() => void testConnection()}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
            >
              {testing ? t('appSettings.aiTesting') : t('appSettings.aiTestConnection')}
            </button>
          </div>
        </section>

        {/* 4. Job limits */}
        <section className={sectionClass} aria-labelledby="ai-section-jobs">
          <div>
            <h4
              id="ai-section-jobs"
              className="text-sm font-semibold text-gray-900 dark:text-gray-100"
            >
              {t('appSettings.aiSectionJobs')}
            </h4>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              {t('appSettings.aiSectionJobsHint')}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('appSettings.aiMaxConcurrent')}
            </label>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
              {t('appSettings.aiMaxConcurrentDescription')}
            </p>
            <input
              type="number"
              min={1}
              max={10}
              value={maxConcurrent}
              onChange={(e) => setMaxConcurrent(e.target.value)}
              className="block w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
        </section>

        {/* 5. Runner */}
        <section className={sectionClass} aria-labelledby="ai-section-runner">
          <div>
            <h4
              id="ai-section-runner"
              className="text-sm font-semibold text-gray-900 dark:text-gray-100"
            >
              {t('appSettings.aiSectionRunner')}
            </h4>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              {t('appSettings.aiSectionRunnerHint')}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('appSettings.aiRunnerUrl')}
            </label>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
              {t('appSettings.aiRunnerUrlDescription')}
            </p>
            <input
              type="url"
              value={runnerUrl}
              onChange={(e) => setRunnerUrl(e.target.value)}
              placeholder="http://kanban-runner:8080"
              className="block w-full max-w-xl px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm font-mono bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('appSettings.aiRunnerToken')}
            </label>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
              {t('appSettings.aiRunnerTokenDescription')}
              {runnerTokenSet ? ` ${t('appSettings.aiApiKeyConfigured')}` : ''}
            </p>
            <input
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={runnerTokenDraft}
              onChange={(e) => setRunnerTokenDraft(e.target.value)}
              placeholder={
                runnerTokenSet
                  ? t('appSettings.aiApiKeyReplacePlaceholder')
                  : t('appSettings.aiRunnerTokenPlaceholder')
              }
              className="block w-full max-w-xl px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm font-mono bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>

          <div className="rounded-md border border-gray-200 dark:border-gray-600 bg-white/70 dark:bg-gray-800/60 px-3 py-2 text-sm text-gray-600 dark:text-gray-300">
            {t('appSettings.aiRunnerNote')}
          </div>

          <div className="flex flex-wrap gap-2 pt-1 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              disabled={testingRunner || savingConfig}
              onClick={() => void testRunner()}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
            >
              {testingRunner
                ? t('appSettings.aiTestingRunner')
                : t('appSettings.aiTestRunner')}
            </button>
          </div>
        </section>

        {/* Shared save */}
        <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20 px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {t('appSettings.aiConfigSaveHint')}
          </p>
          <button
            type="button"
            disabled={!configDirty || savingConfig}
            onClick={() => void saveConfiguration()}
            className="shrink-0 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {savingConfig ? t('appSettings.saving') : t('appSettings.aiSaveConfiguration')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminAISettingsTab;
