import { BaseRepository } from './base';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

const FS = FileSystem as typeof FileSystem & {
  documentDirectory: string | null;
  cacheDirectory: string | null;
};

interface TableInfo {
  name: string;
  type: string;
}

interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

interface ForeignKeyInfo {
  id: number;
  seq: number;
  table: string;
  from: string;
  to: string;
  on_update: string;
  on_delete: string;
  match: string;
}

interface IndexInfo {
  seq: number;
  name: string;
  unique: number;
  origin: string;
  partial: number;
}

interface IndexColumnInfo {
  seqno: number;
  cid: number;
  name: string;
}

export interface TableSchema {
  name: string;
  type: string;
  columns: ColumnInfo[];
  foreignKeys: ForeignKeyInfo[];
  indexes: {
    name: string;
    unique: boolean;
    columns: string[];
  }[];
}

export interface DatabaseInfo {
  schemaVersion: number;
  dbPath: string;
  tableCount: number;
  tables: string[];
}

export interface ChangeLogEntry {
  id: string;
  message: string;
  created_at: number;
  is_deleted: number;
}

export interface FileSizeInfo {
  dbSize: number;
  dbSizeReadable: string;
  documentDirSize: number;
  documentDirSizeReadable: string;
  cacheDirSize: number;
  cacheDirSizeReadable: string;
}

export class DatabaseRepository extends BaseRepository {
  async getDatabaseInfo(): Promise<DatabaseInfo> {
    const db = await this.getDb();
    
    const versionResult = await db.getFirstAsync<{ version: number }>(
      'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1'
    );
    const schemaVersion = versionResult?.version ?? 0;

    const tables = await db.getAllAsync<TableInfo>(
      "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );

    const dbPath = Platform.OS === 'web' 
      ? 'N/A (Web)' 
      : `${FS.documentDirectory}SQLite/foodcartops.db`;

    return {
      schemaVersion,
      dbPath,
      tableCount: tables.length,
      tables: tables.map(t => t.name),
    };
  }

  async getTableSchema(tableName: string): Promise<TableSchema> {
    const db = await this.getDb();

    const columns = await db.getAllAsync<ColumnInfo>(
      `PRAGMA table_info('${tableName}')`
    );

    const foreignKeys = await db.getAllAsync<ForeignKeyInfo>(
      `PRAGMA foreign_key_list('${tableName}')`
    );

    const indexList = await db.getAllAsync<IndexInfo>(
      `PRAGMA index_list('${tableName}')`
    );

    const indexes = await Promise.all(
      indexList.map(async (idx) => {
        const indexColumns = await db.getAllAsync<IndexColumnInfo>(
          `PRAGMA index_info('${idx.name}')`
        );
        return {
          name: idx.name,
          unique: idx.unique === 1,
          columns: indexColumns.map(col => col.name),
        };
      })
    );

    return {
      name: tableName,
      type: 'table',
      columns,
      foreignKeys,
      indexes,
    };
  }

  async getAllTableSchemas(): Promise<TableSchema[]> {
    const info = await this.getDatabaseInfo();
    const schemas: TableSchema[] = await Promise.all(
      info.tables.map(tableName => this.getTableSchema(tableName))
    );
    return schemas;
  }

  async computeSchemaHash(): Promise<string> {
    const schemas = await this.getAllTableSchemas();
    
    const schemaString = schemas.map(schema => {
      const columnsStr = schema.columns
        .map(col => `${col.name}:${col.type}:${col.notnull}:${col.pk}`)
        .join(',');
      const fkStr = schema.foreignKeys
        .map(fk => `${fk.from}->${fk.table}.${fk.to}`)
        .join(',');
      const idxStr = schema.indexes
        .map(idx => `${idx.name}:${idx.columns.join(',')}`)
        .join(',');
      return `${schema.name}|${columnsStr}|${fkStr}|${idxStr}`;
    }).join('||');

    let hash = 0;
    for (let i = 0; i < schemaString.length; i++) {
      const char = schemaString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  async getStoredSchemaHash(): Promise<string | null> {
    const db = await this.getDb();
    
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS db_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    const result = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM db_meta WHERE key = ?',
      ['schema_hash']
    );
    
    return result?.value || null;
  }

  async setStoredSchemaHash(hash: string): Promise<void> {
    const db = await this.getDb();
    const now = this.now();

    await db.runAsync(
      `INSERT OR REPLACE INTO db_meta (key, value, updated_at) VALUES (?, ?, ?)`,
      ['schema_hash', hash, now]
    );
  }

  async detectSchemaChanges(): Promise<string[]> {
    const currentHash = await this.computeSchemaHash();
    const storedHash = await this.getStoredSchemaHash();

    if (!storedHash) {
      await this.setStoredSchemaHash(currentHash);
      return ['Schema tracking initialized'];
    }

    if (currentHash === storedHash) {
      return [];
    }

    const messages: string[] = [];
    const db = await this.getDb();

    const currentInfo = await this.getDatabaseInfo();
    const currentTables = new Set(currentInfo.tables);

    const storedSnapshot = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM db_meta WHERE key = ?',
      ['schema_snapshot']
    );

    if (storedSnapshot) {
      try {
        const oldTables = new Set(JSON.parse(storedSnapshot.value));

        for (const table of currentTables) {
          if (!oldTables.has(table)) {
            messages.push(`Added table: ${table}`);
          }
        }

        for (const table of oldTables) {
          const tableStr = String(table);
          if (!currentTables.has(tableStr)) {
            messages.push(`Removed table: ${tableStr}`);
          }
        }

        for (const table of currentTables) {
          if (oldTables.has(table)) {
            messages.push(`Modified table: ${table}`);
          }
        }
      } catch {
        messages.push('Schema changed (details unavailable)');
      }
    } else {
      messages.push('Schema changed');
    }

    await db.runAsync(
      `INSERT OR REPLACE INTO db_meta (key, value, updated_at) VALUES (?, ?, ?)`,
      ['schema_snapshot', JSON.stringify(Array.from(currentTables)), this.now()]
    );

    await this.setStoredSchemaHash(currentHash);

    return messages;
  }

  async addChangeLogEntry(message: string): Promise<void> {
    const db = await this.getDb();
    const id = this.generateId();
    const now = this.now();

    await db.runAsync(
      `INSERT INTO db_change_log (id, message, created_at, is_deleted) VALUES (?, ?, ?, ?)`,
      [id, message, now, 0]
    );

    console.log('[DatabaseRepo] Change log entry added:', message);
  }

  async getChangeLog(): Promise<ChangeLogEntry[]> {
    const db = await this.getDb();
    
    const logs = await db.getAllAsync<ChangeLogEntry>(
      `SELECT id, message, created_at, is_deleted 
       FROM db_change_log 
       WHERE is_deleted = 0 
       ORDER BY created_at DESC`
    );

    return logs;
  }

  async deleteChangeLogEntry(id: string, userId: string): Promise<void> {
    const db = await this.getDb();

    await db.runAsync(
      `UPDATE db_change_log SET is_deleted = 1 WHERE id = ?`,
      [id]
    );

    await this.auditLog(
      userId,
      'db_change_log',
      id,
      'delete',
      { id },
      { id, is_deleted: 1 }
    );

    console.log('[DatabaseRepo] Change log entry deleted:', id);
  }

  async clearAllChangeLog(userId: string): Promise<void> {
    const db = await this.getDb();

    await db.runAsync(
      `UPDATE db_change_log SET is_deleted = 1 WHERE is_deleted = 0`
    );

    await this.auditLog(
      userId,
      'db_change_log',
      'all',
      'delete',
      {},
      { cleared: true }
    );

    console.log('[DatabaseRepo] All change log entries cleared');
  }

  async getFileSizes(): Promise<FileSizeInfo> {
    if (Platform.OS === 'web') {
      return {
        dbSize: 0,
        dbSizeReadable: 'N/A (Web)',
        documentDirSize: 0,
        documentDirSizeReadable: 'N/A (Web)',
        cacheDirSize: 0,
        cacheDirSizeReadable: 'N/A (Web)',
      };
    }

    const formatSize = (bytes: number): string => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
    };

    let dbSize = 0;
    let documentDirSize = 0;
    let cacheDirSize = 0;

    try {
      const dbPath = `${FS.documentDirectory}SQLite/foodcartops.db`;
      const dbInfo = await FileSystem.getInfoAsync(dbPath);
      if (dbInfo.exists && !dbInfo.isDirectory) {
        dbSize = dbInfo.size || 0;
      }
    } catch (e) {
      console.log('[DatabaseRepo] Could not get DB file size:', e);
    }

    try {
      const dirInfo = await FileSystem.getInfoAsync(FS.documentDirectory || '');
      if (dirInfo.exists && dirInfo.isDirectory) {
        documentDirSize = dirInfo.size || 0;
      }
    } catch (e) {
      console.log('[DatabaseRepo] Could not get document dir size:', e);
    }

    try {
      const cacheInfo = await FileSystem.getInfoAsync(FS.cacheDirectory || '');
      if (cacheInfo.exists && cacheInfo.isDirectory) {
        cacheDirSize = cacheInfo.size || 0;
      }
    } catch (e) {
      console.log('[DatabaseRepo] Could not get cache dir size:', e);
    }

    return {
      dbSize,
      dbSizeReadable: formatSize(dbSize),
      documentDirSize,
      documentDirSizeReadable: formatSize(documentDirSize),
      cacheDirSize,
      cacheDirSizeReadable: formatSize(cacheDirSize),
    };
  }

  async trackSchemaChangesOnInit(): Promise<void> {
    const changes = await this.detectSchemaChanges();
    
    for (const message of changes) {
      await this.addChangeLogEntry(message);
    }

    if (changes.length > 0) {
      console.log('[DatabaseRepo] Schema changes tracked:', changes.length);
    }
  }
}
