import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

export type DatabaseEnvDiagnostics = {
  hasDatabaseUrl: boolean;
  protocol: string | null;
  host: string | null;
  database: string | null;
  hasPassword: boolean;
  passwordIsString: boolean;
  sslMode: string | null;
  databaseSsl: string | null;
  error?: string;
};

export function getDatabaseEnvDiagnostics(): DatabaseEnvDiagnostics {
  const databaseUrl = process.env.DATABASE_URL;
  const databaseSsl = process.env.DATABASE_SSL ?? null;

  if (typeof databaseUrl !== 'string' || databaseUrl.length === 0) {
    return {
      hasDatabaseUrl: false,
      protocol: null,
      host: null,
      database: null,
      hasPassword: false,
      passwordIsString: typeof databaseUrl === 'string',
      sslMode: null,
      databaseSsl,
    };
  }

  try {
    const parsedUrl = new URL(databaseUrl);
    const password = parsedUrl.password;

    return {
      hasDatabaseUrl: true,
      protocol: parsedUrl.protocol.replace(/:$/, '') || null,
      host: parsedUrl.hostname || null,
      database: parsedUrl.pathname ? parsedUrl.pathname.replace(/^\//, '') || null : null,
      hasPassword: password.length > 0,
      passwordIsString: typeof password === 'string',
      sslMode: parsedUrl.searchParams.get('sslmode'),
      databaseSsl,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid DATABASE_URL';
    return {
      hasDatabaseUrl: true,
      protocol: null,
      host: null,
      database: null,
      hasPassword: false,
      passwordIsString: false,
      sslMode: null,
      databaseSsl,
      error: message,
    };
  }
}
