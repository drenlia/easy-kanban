import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  listUserApiTokens,
  createUserApiToken,
  revokeUserApiToken,
  getUserSshKey,
  generateUserSshKey,
  downloadUserSshPrivateKey,
  type UserApiTokenMeta,
  type UserSshKeyMeta
} from '../../api';
import { toast } from '../../utils/toast';

const ProfileDevTab: React.FC = () => {
  const { t } = useTranslation('common');
  const [tokens, setTokens] = useState<UserApiTokenMeta[]>([]);
  const [sshKey, setSshKey] = useState<UserSshKeyMeta | null>(null);
  const [rawToken, setRawToken] = useState<string | null>(null);
  const [privateKeyOnce, setPrivateKeyOnce] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tokenList, ssh] = await Promise.all([listUserApiTokens(), getUserSshKey()]);
      setTokens(tokenList.filter((tok) => !tok.revokedAt));
      setSshKey(ssh.key);
    } catch (error) {
      console.error('Failed to load Dev credentials:', error);
      toast.error(t('profile.devLoadError'), '');
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreateToken = async () => {
    setBusy(true);
    try {
      const result = await createUserApiToken(t('profile.devDefaultTokenName'));
      setRawToken(result.rawToken);
      await load();
      toast.success(t('profile.devTokenCreated'), '');
    } catch (error) {
      console.error(error);
      toast.error(t('profile.devTokenCreateError'), '');
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!window.confirm(t('profile.devTokenRevokeConfirm'))) return;
    setBusy(true);
    try {
      await revokeUserApiToken(id);
      await load();
      toast.success(t('profile.devTokenRevoked'), '');
    } catch (error) {
      console.error(error);
      toast.error(t('profile.devTokenRevokeError'), '');
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateSsh = async () => {
    if (sshKey && !window.confirm(t('profile.devSshRegenerateConfirm'))) return;
    setBusy(true);
    try {
      const result = await generateUserSshKey();
      setSshKey(result.key);
      setPrivateKeyOnce(result.privateKey);
      toast.success(t('profile.devSshGenerated'), '');
    } catch (error) {
      console.error(error);
      toast.error(t('profile.devSshGenerateError'), '');
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadPrivate = async () => {
    setBusy(true);
    try {
      const result = privateKeyOnce
        ? { privateKey: privateKeyOnce }
        : await downloadUserSshPrivateKey();
      const blob = new Blob([result.privateKey], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'easy-kanban-agent-ed25519';
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      toast.error(t('profile.devSshDownloadError'), '');
    } finally {
      setBusy(false);
    }
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('profile.devCopied'), '');
    } catch {
      toast.error(t('profile.devCopyError'), '');
    }
  };

  if (loading) {
    return <div className="text-sm text-gray-500 dark:text-gray-400">{t('profile.devLoading')}</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">
          {t('profile.devApiTokens')}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {t('profile.devApiTokensDescription')}
        </p>

        {rawToken && (
          <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 p-3">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-2">
              {t('profile.devTokenShowOnce')}
            </p>
            <code className="block text-xs break-all text-gray-800 dark:text-gray-100 mb-2">
              {rawToken}
            </code>
            <button
              type="button"
              onClick={() => copyText(rawToken)}
              className="text-sm text-blue-600 hover:underline"
            >
              {t('profile.devCopy')}
            </button>
          </div>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={handleCreateToken}
          className="px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {t('profile.devGenerateToken')}
        </button>

        <ul className="mt-4 divide-y divide-gray-200 dark:divide-gray-700">
          {tokens.length === 0 && (
            <li className="py-2 text-sm text-gray-500">{t('profile.devNoTokens')}</li>
          )}
          {tokens.map((tok) => (
            <li key={tok.id} className="py-3 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{tok.name}</div>
                <div className="text-xs text-gray-500 font-mono">{tok.tokenPrefix}…</div>
                <div className="text-xs text-gray-400">
                  {t('profile.devCreated')}: {new Date(tok.createdAt).toLocaleString()}
                  {tok.lastUsedAt
                    ? ` · ${t('profile.devLastUsed')}: ${new Date(tok.lastUsedAt).toLocaleString()}`
                    : ''}
                </div>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => handleRevoke(tok.id)}
                className="text-sm text-red-600 hover:underline disabled:opacity-50"
              >
                {t('profile.devRevoke')}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">
          {t('profile.devSshKey')}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {t('profile.devSshKeyDescription')}
        </p>

        {sshKey ? (
          <div className="space-y-3">
            <div>
              <div className="text-xs text-gray-500 mb-1">{t('profile.devFingerprint')}</div>
              <code className="text-xs text-gray-800 dark:text-gray-200">{sshKey.fingerprint}</code>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">{t('profile.devPublicKey')}</div>
              <textarea
                readOnly
                value={sshKey.publicKey}
                rows={3}
                className="w-full text-xs font-mono px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100"
              />
              <button
                type="button"
                onClick={() => copyText(sshKey.publicKey)}
                className="mt-1 text-sm text-blue-600 hover:underline"
              >
                {t('profile.devCopyPublicKey')}
              </button>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('profile.devSshGithubHint')}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={handleDownloadPrivate}
                className="px-3 py-2 text-sm font-medium text-gray-800 dark:text-gray-100 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
              >
                {t('profile.devDownloadPrivateKey')}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleGenerateSsh}
                className="px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {t('profile.devRegenerateSsh')}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={handleGenerateSsh}
            className="px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {t('profile.devGenerateSsh')}
          </button>
        )}
      </div>
    </div>
  );
};

export default ProfileDevTab;
