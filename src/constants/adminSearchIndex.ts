/**
 * Static catalog for Admin bilingual settings search.
 * Add a row here (+ data-setting-key on the field) when introducing new searchable settings.
 */

export type AdminSearchEntry = {
  id: string;
  kind: 'tab' | 'setting';
  /** Main Admin tab id (ADMIN_TABS) */
  tab: string;
  /** Full location hash, e.g. #admin#mail-server or #admin#app-settings#ai */
  hash: string;
  /** Scroll target: [data-setting-key="…"] */
  settingKey?: string;
  /** i18next key under the `admin` namespace */
  labelKey: string;
  /** Extra EN/FR tokens (smtp, oauth, llm, …) */
  aliases?: string[];
};

export const ADMIN_SEARCH_INDEX: AdminSearchEntry[] = [
  // —— Tabs ——
  {
    id: 'tab-users',
    kind: 'tab',
    tab: 'users',
    hash: '#admin#users',
    labelKey: 'tabs.users',
    aliases: ['utilisateurs', 'user', 'members', 'membres'],
  },
  {
    id: 'tab-site-settings',
    kind: 'tab',
    tab: 'site-settings',
    hash: '#admin#site-settings',
    labelKey: 'tabs.siteSettings',
    aliases: ['branding', 'logo', 'site'],
  },
  {
    id: 'tab-sso',
    kind: 'tab',
    tab: 'sso',
    hash: '#admin#sso',
    labelKey: 'tabs.sso',
    aliases: ['oauth', 'google', 'connexion', 'login'],
  },
  {
    id: 'tab-mail',
    kind: 'tab',
    tab: 'mail-server',
    hash: '#admin#mail-server',
    labelKey: 'tabs.mailServer',
    aliases: ['smtp', 'email', 'courriel', 'mail', 'messagerie'],
  },
  {
    id: 'tab-tags',
    kind: 'tab',
    tab: 'tags',
    hash: '#admin#tags',
    labelKey: 'tabs.tags',
    aliases: ['étiquettes', 'etiquettes', 'labels'],
  },
  {
    id: 'tab-priorities',
    kind: 'tab',
    tab: 'priorities',
    hash: '#admin#priorities',
    labelKey: 'tabs.priorities',
    aliases: ['priorités', 'priorites'],
  },
  {
    id: 'tab-app-settings',
    kind: 'tab',
    tab: 'app-settings',
    hash: '#admin#app-settings#user-interface',
    labelKey: 'tabs.appSettings',
    aliases: ['application', 'ui', 'interface'],
  },
  {
    id: 'tab-project-settings',
    kind: 'tab',
    tab: 'project-settings',
    hash: '#admin#project-settings',
    labelKey: 'tabs.projectSettings',
    aliases: ['projet', 'project'],
  },
  {
    id: 'tab-sprint-settings',
    kind: 'tab',
    tab: 'sprint-settings',
    hash: '#admin#sprint-settings',
    labelKey: 'tabs.sprintSettings',
    aliases: ['sprint', 'agile'],
  },
  {
    id: 'tab-reporting',
    kind: 'tab',
    tab: 'reporting',
    hash: '#admin#reporting',
    labelKey: 'tabs.reporting',
    aliases: ['rapports', 'reports', 'analytics'],
  },
  {
    id: 'tab-lifecycle',
    kind: 'tab',
    tab: 'lifecycle',
    hash: '#admin#lifecycle',
    labelKey: 'tabs.lifecycle',
    aliases: ['cycle de vie', 'retention', 'rétention', 'trash', 'corbeille', 'purge'],
  },
  {
    id: 'tab-licensing',
    kind: 'tab',
    tab: 'licensing',
    hash: '#admin#licensing',
    labelKey: 'tabs.licensing',
    aliases: ['licence', 'license', 'subscription', 'abonnement'],
  },

  // —— Site settings ——
  {
    id: 'site-name',
    kind: 'setting',
    tab: 'site-settings',
    hash: '#admin#site-settings',
    settingKey: 'SITE_NAME',
    labelKey: 'siteSettings.siteName',
    aliases: ['nom du site', 'title', 'titre'],
  },
  {
    id: 'site-url',
    kind: 'setting',
    tab: 'site-settings',
    hash: '#admin#site-settings',
    settingKey: 'SITE_URL',
    labelKey: 'siteSettings.siteUrl',
    aliases: ['url'],
  },
  {
    id: 'site-logo',
    kind: 'setting',
    tab: 'site-settings',
    hash: '#admin#site-settings',
    settingKey: 'SITE_LOGO',
    labelKey: 'siteSettings.siteLogo',
    aliases: ['logo', 'branding', 'image'],
  },
  {
    id: 'site-logo-dark',
    kind: 'setting',
    tab: 'site-settings',
    hash: '#admin#site-settings',
    settingKey: 'SITE_LOGO_DARK',
    labelKey: 'siteSettings.siteLogoDark',
    aliases: ['logo dark', 'logo sombre'],
  },

  // —— SSO ——
  {
    id: 'google-client-id',
    kind: 'setting',
    tab: 'sso',
    hash: '#admin#sso',
    settingKey: 'GOOGLE_CLIENT_ID',
    labelKey: 'sso.googleClientId',
    aliases: ['oauth', 'google', 'client id'],
  },
  {
    id: 'google-client-secret',
    kind: 'setting',
    tab: 'sso',
    hash: '#admin#sso',
    settingKey: 'GOOGLE_CLIENT_SECRET',
    labelKey: 'sso.googleClientSecret',
    aliases: ['oauth', 'google', 'secret', 'secret client'],
  },
  {
    id: 'google-callback',
    kind: 'setting',
    tab: 'sso',
    hash: '#admin#sso',
    settingKey: 'GOOGLE_CALLBACK_URL',
    labelKey: 'sso.googleCallbackUrl',
    aliases: ['callback', 'redirect', 'oauth'],
  },

  // —— Mail ——
  {
    id: 'smtp-host',
    kind: 'setting',
    tab: 'mail-server',
    hash: '#admin#mail-server',
    settingKey: 'SMTP_HOST',
    labelKey: 'mail.smtpHost',
    aliases: ['smtp', 'host', 'serveur'],
  },
  {
    id: 'smtp-port',
    kind: 'setting',
    tab: 'mail-server',
    hash: '#admin#mail-server',
    settingKey: 'SMTP_PORT',
    labelKey: 'mail.smtpPort',
    aliases: ['smtp', 'port'],
  },
  {
    id: 'smtp-username',
    kind: 'setting',
    tab: 'mail-server',
    hash: '#admin#mail-server',
    settingKey: 'SMTP_USERNAME',
    labelKey: 'mail.smtpUsername',
    aliases: ['smtp', 'username', 'utilisateur'],
  },
  {
    id: 'smtp-password',
    kind: 'setting',
    tab: 'mail-server',
    hash: '#admin#mail-server',
    settingKey: 'SMTP_PASSWORD',
    labelKey: 'mail.smtpPassword',
    aliases: ['smtp', 'password', 'mot de passe', 'mdp'],
  },
  {
    id: 'smtp-from-email',
    kind: 'setting',
    tab: 'mail-server',
    hash: '#admin#mail-server',
    settingKey: 'SMTP_FROM_EMAIL',
    labelKey: 'mail.fromEmail',
    aliases: ['from', 'expéditeur', 'expediteur', 'sender'],
  },
  {
    id: 'smtp-from-name',
    kind: 'setting',
    tab: 'mail-server',
    hash: '#admin#mail-server',
    settingKey: 'SMTP_FROM_NAME',
    labelKey: 'mail.fromName',
    aliases: ['from name', 'nom expéditeur'],
  },
  {
    id: 'smtp-secure',
    kind: 'setting',
    tab: 'mail-server',
    hash: '#admin#mail-server',
    settingKey: 'SMTP_SECURE',
    labelKey: 'mail.smtpSecurity',
    aliases: ['tls', 'ssl', 'security', 'sécurité'],
  },

  // —— App settings / AI ——
  {
    id: 'ai-section',
    kind: 'setting',
    tab: 'app-settings',
    hash: '#admin#app-settings#ai',
    settingKey: 'AI_ENABLED',
    labelKey: 'appSettings.aiEnabled',
    aliases: ['ai', 'ia', 'agent', 'llm', 'openai', 'anthropic'],
  },
  {
    id: 'ai-provider',
    kind: 'setting',
    tab: 'app-settings',
    hash: '#admin#app-settings#ai',
    settingKey: 'AI_PROVIDER',
    labelKey: 'appSettings.aiProvider',
    aliases: ['provider', 'fournisseur', 'openai', 'anthropic', 'ollama', 'openrouter'],
  },
  {
    id: 'ai-api-key',
    kind: 'setting',
    tab: 'app-settings',
    hash: '#admin#app-settings#ai',
    settingKey: 'AI_API_KEY',
    labelKey: 'appSettings.aiApiKey',
    aliases: ['api key', 'clé api', 'cle api', 'token', 'secret'],
  },
  {
    id: 'ai-model',
    kind: 'setting',
    tab: 'app-settings',
    hash: '#admin#app-settings#ai',
    settingKey: 'AI_MODEL',
    labelKey: 'appSettings.aiModel',
    aliases: ['model', 'modèle', 'modele', 'gpt', 'claude'],
  },
  {
    id: 'ai-base-url',
    kind: 'setting',
    tab: 'app-settings',
    hash: '#admin#app-settings#ai',
    settingKey: 'AI_API_BASE_URL',
    labelKey: 'appSettings.aiApiBaseUrl',
    aliases: ['base url', 'endpoint', 'url'],
  },
  {
    id: 'ai-runner-url',
    kind: 'setting',
    tab: 'app-settings',
    hash: '#admin#app-settings#ai',
    settingKey: 'AI_RUNNER_URL',
    labelKey: 'appSettings.aiRunnerUrl',
    aliases: ['runner', 'agent runner'],
  },
  {
    id: 'ai-runner-token',
    kind: 'setting',
    tab: 'app-settings',
    hash: '#admin#app-settings#ai',
    settingKey: 'AI_RUNNER_TOKEN',
    labelKey: 'appSettings.aiRunnerToken',
    aliases: ['runner token', 'jeton runner'],
  },
  {
    id: 'ai-max-concurrent',
    kind: 'setting',
    tab: 'app-settings',
    hash: '#admin#app-settings#ai',
    settingKey: 'AI_MAX_CONCURRENT',
    labelKey: 'appSettings.aiMaxConcurrent',
    aliases: ['concurrent', 'simultané', 'limite', 'parallel'],
  },

  // —— Troubleshooting ——
  {
    id: 'troubleshooting',
    kind: 'setting',
    tab: 'app-settings',
    hash: '#admin#app-settings#troubleshooting',
    settingKey: 'TROUBLESHOOTING_SECTION',
    labelKey: 'appSettings.troubleshooting',
    aliases: ['debug', 'logs', 'débogage', 'debogage', 'fe_debug', 'server_debug'],
  },

  // —— File uploads (app settings) ——
  {
    id: 'file-uploads',
    kind: 'setting',
    tab: 'app-settings',
    hash: '#admin#app-settings#file-uploads',
    settingKey: 'UPLOADS_SECTION',
    labelKey: 'appSettings.fileUploads',
    aliases: ['upload', 'fichiers', 'attachments', 'pièces jointes'],
  },

  // —— Notifications ——
  {
    id: 'notifications',
    kind: 'setting',
    tab: 'app-settings',
    hash: '#admin#app-settings#notifications',
    settingKey: 'NOTIFICATIONS_SECTION',
    labelKey: 'appSettings.notifications',
    aliases: ['notification', 'email alerts', 'alertes'],
  },

  // —— Lifecycle ——
  {
    id: 'lifecycle-retention',
    kind: 'setting',
    tab: 'lifecycle',
    hash: '#admin#lifecycle',
    settingKey: 'LIFECYCLE_DELETED_RETENTION_DAYS',
    labelKey: 'lifecycle.deletedRetention',
    aliases: ['retention', 'rétention', 'purge', 'soft delete', 'suppression récupérable'],
  },
  {
    id: 'lifecycle-archived',
    kind: 'setting',
    tab: 'lifecycle',
    hash: '#admin#lifecycle',
    settingKey: 'LIFECYCLE_ARCHIVED_RETENTION_DAYS',
    labelKey: 'lifecycle.archivedRetention',
    aliases: ['archive', 'archivé', 'retention'],
  },
];
