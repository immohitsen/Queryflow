import initSqlJs, { Database } from 'sql.js';

export interface QueryResult {
  columns: string[];
  rows: Record<string, any>[];
}

export interface QueryPlanNode {
  id: number;
  parent: number;
  detail: string;
  children: QueryPlanNode[];
}

let SQLInstance: any = null;
let activeDb: Database | null = null;

/**
 * Initializes the WebAssembly sql.js module.
 */
export async function getSQL() {
  if (SQLInstance) return SQLInstance;
  SQLInstance = await initSqlJs({
    locateFile: (file) => `/sql-wasm.wasm`
  });
  return SQLInstance;
}

/**
 * Creates a new in-memory SQLite database.
 */
export async function initDatabase(): Promise<Database> {
  const SQL = await getSQL();
  if (activeDb) {
    activeDb.close();
  }
  const db = new SQL.Database();
  activeDb = db;
  return db;
}

/**
 * Retrieves the currently active database instance.
 */
export function getActiveDb(): Database {
  if (!activeDb) {
    throw new Error('Database is not initialized. Call initDatabase() first.');
  }
  return activeDb;
}

/**
 * Executes a SQL query and formats the matrix results into an object array.
 */
export function executeQuery(sql: string): QueryResult {
  const db = getActiveDb();
  try {
    const res = db.exec(sql);
    if (res.length === 0) {
      return { columns: [], rows: [] };
    }

    const { columns, values } = res[0];

    // Disambiguate duplicate column names (e.g., from JOINs: id -> id, id_2)
    const colCounts: Record<string, number> = {};
    const uniqueColumns = columns.map((col) => {
      colCounts[col] = (colCounts[col] || 0) + 1;
      return colCounts[col] > 1 ? `${col}_${colCounts[col]}` : col;
    });

    const rows = values.map((rowValues) => {
      const row: Record<string, any> = {};
      uniqueColumns.forEach((col, idx) => {
        row[col] = rowValues[idx];
      });
      return row;
    });

    return { columns: uniqueColumns, rows };
  } catch (err: any) {
    throw new Error(err.message || 'Error executing SQL query');
  }
}

/**
 * Executes a multi-statement query (DDL/DML scripting).
 */
export function executeScript(sql: string): void {
  const db = getActiveDb();
  try {
    db.run(sql);
  } catch (err: any) {
    throw new Error(err.message || 'Error executing SQL script');
  }
}

/**
 * Returns a list of all user-created tables in the database.
 */
export function getDbTables(): string[] {
  const db = getActiveDb();
  try {
    const res = db.exec("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%';");
    if (res.length === 0) return [];
    return res[0].values.map((v) => v[0] as string);
  } catch (err) {
    return [];
  }
}

/**
 * Retrieves schema structure (columns and data types) for a given table.
 */
export function getTableColumns(tableName: string): { name: string; type: string }[] {
  const db = getActiveDb();
  try {
    const res = db.exec(`PRAGMA table_info(${tableName});`);
    if (res.length === 0) return [];
    
    // table_info columns: cid, name, type, notnull, dflt_value, pk
    const nameIdx = res[0].columns.indexOf('name');
    const typeIdx = res[0].columns.indexOf('type');
    
    return res[0].values.map((row) => ({
      name: row[nameIdx] as string,
      type: row[typeIdx] as string
    }));
  } catch (err) {
    return [];
  }
}

/**
 * Runs EXPLAIN QUERY PLAN and returns a clean tree structure of the execution steps.
 */
export function getExplainPlan(sql: string): QueryPlanNode | null {
  const db = getActiveDb();
  try {
    const res = db.exec(`EXPLAIN QUERY PLAN ${sql};`);
    if (res.length === 0) return null;

    // SQLite EXPLAIN columns: id, parent, notused, detail
    const idIdx = res[0].columns.indexOf('id');
    const parentIdx = res[0].columns.indexOf('parent');
    const detailIdx = res[0].columns.indexOf('detail');

    const nodes: QueryPlanNode[] = res[0].values.map((row) => ({
      id: row[idIdx] as number,
      parent: row[parentIdx] as number,
      detail: row[detailIdx] as string,
      children: []
    }));

    // Create a virtual root node to hold all top-level operations (where parent is 0)
    const virtualRoot: QueryPlanNode = {
      id: 0,
      parent: -1,
      detail: 'Query Plan Root',
      children: []
    };

    const nodeMap = new Map<number, QueryPlanNode>();
    nodes.forEach(n => nodeMap.set(n.id, n));
    nodeMap.set(0, virtualRoot);

    nodes.forEach((node) => {
      const parentNode = nodeMap.get(node.parent);
      if (parentNode) {
        parentNode.children.push(node);
      } else {
        // Fallback: if parent not found, attach directly to virtual root
        virtualRoot.children.push(node);
      }
    });

    return virtualRoot;
  } catch (err) {
    console.error('Error generating query plan:', err);
    return null;
  }
}

/**
 * Checks if there is currently an uncommitted transaction in SQLite.
 * Uses SQLite's native sqlite3_get_autocommit property mapped to getAutocommit()
 */
export function isTransactionActive(): boolean {
  try {
    const db = getActiveDb();
    // getAutocommit returns 0 if auto-commit is disabled (i.e. transaction is active)
    return (db as any).getAutocommit() === 0;
  } catch (err) {
    return false;
  }
}

