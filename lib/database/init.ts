import { Platform } from 'react-native';
import type * as SQLite from 'expo-sqlite';
import { MIGRATIONS, SCHEMA_VERSION } from './schema';

const DB_NAME = 'foodcartops.db';

let dbInstance: SQLite.SQLiteDatabase | null = null;
let isInitializing = false;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getSQLiteModule() {
  if (Platform.OS === 'web') {
    throw new Error('SQLite is not available on web. Please use a mobile device or emulator.');
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-sqlite') as typeof SQLite;
}

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (Platform.OS === 'web') {
    throw new Error('SQLite is not available on web. Please use a mobile device or emulator.');
  }

  if (dbInstance) {
    return dbInstance;
  }

  if (isInitializing && initPromise) {
    return initPromise;
  }

  isInitializing = true;
  initPromise = (async () => {
    const SQLiteModule = getSQLiteModule();
    const db = await SQLiteModule.openDatabaseAsync(DB_NAME);
    await runMigrations(db);
    dbInstance = db;
    isInitializing = false;
    return db;
  })();

  return initPromise;
}

async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  const result = await db.getFirstAsync<{ version: number }>(
    'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1'
  );

  const currentVersion = result?.version ?? 0;

  console.log(`[DB] Current schema version: ${currentVersion}`);

  for (const migration of MIGRATIONS) {
    if (migration.version > currentVersion) {
      console.log(`[DB] Applying migration ${migration.version}...`);
      
      try {
        await db.execAsync(migration.up);
        await db.runAsync(
          'INSERT INTO schema_version (version, applied_at) VALUES (?, ?)',
          [migration.version, Date.now()]
        );
        console.log(`[DB] Migration ${migration.version} applied successfully`);
      } catch (error) {
        console.error(`[DB] Migration ${migration.version} failed:`, error);
        throw error;
      }
    }
  }

  if (currentVersion < SCHEMA_VERSION) {
    console.log(`[DB] Database migrated to version ${SCHEMA_VERSION}`);
  } else {
    console.log(`[DB] Database is up to date`);
  }

  await trackSchemaChanges(db);
}

async function trackSchemaChanges(db: SQLite.SQLiteDatabase): Promise<void> {
  try {
    const { DatabaseRepository } = await import('../repositories/database.repository');
    const dbRepo = new DatabaseRepository();
    await dbRepo.trackSchemaChangesOnInit();
  } catch (error) {
    console.log('[DB] Schema tracking skipped:', error);
  }
}

export async function resetDatabase(): Promise<void> {
  const SQLiteModule = getSQLiteModule();

  if (dbInstance) {
    await dbInstance.closeAsync();
    dbInstance = null;
  }

  isInitializing = false;
  initPromise = null;

  try {
    await SQLiteModule.deleteDatabaseAsync(DB_NAME);
    console.log('[DB] Database reset');
  } catch (error: any) {
    if (error?.message?.includes('not found')) {
      console.log('[DB] Database does not exist, skipping delete');
    } else {
      throw error;
    }
  }
}
