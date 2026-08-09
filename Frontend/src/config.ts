type AppConfig = {
  app: {
    name: string;
    subtitle: string;
  };
  api: {
    base_url: string;
  };
};

const DEFAULT_CONFIG: AppConfig = {
  app: {
    name: 'Sotera',
    subtitle: 'A persona, not a platform.',
  },
  api: {
    base_url: '',
  },
};

let cachedConfig: AppConfig | null = null;

const normalizeBaseUrl = (value: string | undefined | null): string => {
  const raw = (value || '').trim();
  if (!raw) {
    return '';
  }
  return raw.replace(/\/+$/, '');
};

const parseConfig = (raw: unknown): AppConfig => {
  const obj = raw as {
    app?: { name?: string; subtitle?: string };
    api?: { base_url?: string };
  };
  return {
    app: {
      name: String(obj?.app?.name || DEFAULT_CONFIG.app.name).trim() || DEFAULT_CONFIG.app.name,
      subtitle: String(obj?.app?.subtitle || DEFAULT_CONFIG.app.subtitle).trim() || DEFAULT_CONFIG.app.subtitle,
    },
    api: {
      base_url: normalizeBaseUrl(obj?.api?.base_url),
    },
  };
};

const loadConfigFrom = async (path: string): Promise<AppConfig> => {
  // Hard timeout: a stalled config fetch used to hang the top-level await in main.tsx
  // forever, leaving a blank gradient until a manual refresh. Always resolve fast so
  // the app mounts (falling back to defaults) even when the network misbehaves.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const response = await fetch(path, { cache: 'no-store', signal: ctrl.signal });
    if (!response.ok) {
      throw new Error(`Failed to load ${path}`);
    }
    return parseConfig(await response.json());
  } finally {
    clearTimeout(timer);
  }
};

export const initAppConfig = async (): Promise<void> => {
  if (cachedConfig) {
    return;
  }

  try {
    cachedConfig = await loadConfigFrom('/config.json');
  } catch {
    try {
      cachedConfig = await loadConfigFrom('/config.example.json');
    } catch {
      cachedConfig = { ...DEFAULT_CONFIG };
    }
  }
};

export const getAppConfig = (): AppConfig => {
  if (!cachedConfig) {
    return { ...DEFAULT_CONFIG };
  }
  return cachedConfig;
};

export const apiUrl = (path: string): string => {
  if (!path.startsWith('/')) {
    throw new Error(`apiUrl path must start with '/': ${path}`);
  }

  const baseUrl = getAppConfig().api.base_url;
  return baseUrl ? `${baseUrl}${path}` : path;
};
