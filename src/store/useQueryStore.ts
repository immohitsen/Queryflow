import { create } from 'zustand';
import { inferSchemas, TableSchema } from '../engine/schemaInferrer';
import { generateMockData, generateSeedSQL, MockTableData, seedFaker } from '../engine/dummyData';
import { 
  initDatabase, 
  executeScript, 
  executeQuery, 
  getExplainPlan, 
  QueryPlanNode,
  isTransactionActive,
  getDbTables,
  getTableColumns
} from '../engine/sqlEngine';
import { compileQueryStages, VisualizerStage } from '../engine/queryRewriter';
import { analyzePerformance, PerformanceHint } from '../engine/performanceAnalyzer';

interface QueryState {
  query: string;
  dialect: 'sqlite' | 'postgres' | 'mysql' | 'ansi';
  isLoadingDb: boolean;
  isDbInitialized: boolean;
  error: string | null;
  stages: VisualizerStage[];
  sourceTables: MockTableData[];
  explainPlan: QueryPlanNode | null;
  activeStageId: string | null;
  performanceHints: PerformanceHint[];
  isTransactionOpen: boolean;
  
  setQuery: (q: string) => void;
  setDialect: (d: 'sqlite' | 'postgres' | 'mysql' | 'ansi') => void;
  setActiveStageId: (id: string | null) => void;
  setError: (err: string | null) => void;
  
  initializeDb: () => Promise<void>;
  runQuery: (customSql?: string) => Promise<void>;
  regenerateMockData: () => Promise<void>;
  resetAll: () => Promise<void>;
}

const DEFAULT_QUERY = `-- QueryFlow Demo Query
-- Hover over stage cards on the right to see their SQL clauses highlight!
SELECT 
  d.name AS dept_name,
  AVG(e.salary) AS avg_salary,
  COUNT(e.id) AS employee_count
FROM employees e
JOIN departments d ON e.dept_id = d.id
WHERE e.age > 25
GROUP BY d.name
HAVING AVG(e.salary) > 60000
ORDER BY avg_salary DESC;`;

export const useQueryStore = create<QueryState>((set, get) => ({
  query: DEFAULT_QUERY,
  dialect: 'sqlite',
  isLoadingDb: false,
  isDbInitialized: false,
  error: null,
  stages: [],
  sourceTables: [],
  explainPlan: null,
  activeStageId: null,
  performanceHints: [],
  isTransactionOpen: false,

  setQuery: (query) => set({ query }),
  setDialect: (dialect) => set({ dialect }),
  setActiveStageId: (activeStageId) => set({ activeStageId }),
  setError: (error) => set({ error }),

  initializeDb: async () => {
    if (get().isDbInitialized) return;
    set({ isLoadingDb: true, error: null });
    try {
      await initDatabase();
      set({ isDbInitialized: true });
      // Generate default data on startup
      await get().runQuery();
    } catch (err: any) {
      set({ error: `Database Initialization Error: ${err.message}` });
    } finally {
      set({ isLoadingDb: false });
    }
  },

  runQuery: async (customSql?: string) => {
    const sqlToRun = customSql !== undefined ? customSql : get().query;
    if (!get().isDbInitialized) {
      await get().initializeDb();
    }

    set({ isLoadingDb: true, error: null });

    try {
      // Small artificial delay for visual transition and loading states
      await new Promise((resolve) => setTimeout(resolve, 450));

      // 1. Get list of existing tables in the active SQLite database
      const existingTables = getDbTables().map((t: string) => t.toLowerCase());

      // 2. Infer schemas from the SQL query
      const inferred = inferSchemas(sqlToRun);

      // 3. For any table that does not exist in the DB, generate mock data and append it
      const currentMockTables = [...get().sourceTables];
      const newMockTables: MockTableData[] = [];

      seedFaker(42); // Consistent seed for initial generation

      inferred.forEach((schema) => {
        const tName = schema.name.toLowerCase();
        if (!existingTables.includes(tName)) {
          const mockTable = generateMockData(schema);
          newMockTables.push(mockTable);
          currentMockTables.push(mockTable);
        }
      });

      // Seed only the newly discovered tables
      if (newMockTables.length > 0) {
        const seedSql = generateSeedSQL(newMockTables);
        executeScript(seedSql);
      }

      // 4. Compile step-by-step query execution stages on the active DB
      const compiledStages = await compileQueryStages(sqlToRun);
      set({ stages: compiledStages });

      // 5. Generate query explain plan
      const plan = getExplainPlan(sqlToRun);
      set({ explainPlan: plan });

      // 6. Generate performance hints
      const hints = analyzePerformance(sqlToRun);
      set({ performanceHints: hints });

      // 7. Check transaction state
      const txnOpen = isTransactionActive();
      set({ isTransactionOpen: txnOpen });

      // 8. Synchronize catalog drawer with the actual live SQLite database state
      const allDbTables = getDbTables();
      const synchronizedTables: MockTableData[] = [];
      
      allDbTables.forEach((tName: string) => {
        const cols = getTableColumns(tName).map((c: any) => ({
          name: c.name,
          type: c.type as any,
          isPrimaryKey: false
        }));
        
        try {
          const res = executeQuery(`SELECT rowid AS __row_id, * FROM ${tName}`);
          synchronizedTables.push({
            schema: {
              name: tName,
              columns: cols
            },
            rows: res.rows
          });
        } catch (e) {
          // Table might be locked or empty, skip safely
        }
      });

      set({ sourceTables: synchronizedTables });

    } catch (err: any) {
      console.error(err);
      set({ error: err.message || 'An error occurred during query execution.' });
    } finally {
      set({ isLoadingDb: false });
    }
  },

  regenerateMockData: async () => {
    const currentTables = get().sourceTables;
    if (currentTables.length === 0) return;

    // Use current time seed to randomize data
    seedFaker(Math.floor(Math.random() * 10000));
    
    const newMockTables = currentTables.map((t) => generateMockData(t.schema));
    
    // Wipe and reseed the DB
    await initDatabase();
    const seedSql = generateSeedSQL(newMockTables);
    executeScript(seedSql);

    set({ sourceTables: newMockTables });

    // Rerun query to reflect new mock data
    await get().runQuery();
  },

  resetAll: async () => {
    set({
      query: DEFAULT_QUERY,
      sourceTables: [],
      stages: [],
      explainPlan: null,
      error: null,
      activeStageId: null,
      performanceHints: [],
      isTransactionOpen: false
    });
    // Wipe DB and create clean database
    await initDatabase();
    await get().runQuery(DEFAULT_QUERY);
  }
}));

