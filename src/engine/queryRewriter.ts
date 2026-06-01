import { Parser } from 'node-sql-parser';
import { executeQuery, executeScript, getDbTables } from './sqlEngine';

export interface VisualizerStage {
  id: string; // 'from' | 'join' | 'where' | 'groupby' | 'having' | 'select' | 'distinct' | 'orderby' | 'limit' | 'ddl' | 'dml'
  name: string;
  explanation: string;
  sqlClause: string;
  columns: string[];
  rows: any[];
  rowStates?: Record<string, 'kept' | 'added' | 'removed' | 'modified'>;
  meta?: any;
}

const parser = new Parser();

/**
 * Serializes any AST expression (where clause, select column, having expression)
 * back into a SQL string using node-sql-parser.
 */
export function sqlifyExpr(expr: any): string {
  if (!expr) return '';
  try {
    const dummyAst: any = {
      with: null,
      type: 'select',
      options: null,
      distinct: null,
      columns: [{ expr, as: 'val' }],
      from: null,
      where: null,
      groupby: null,
      having: null,
      orderby: null,
      limit: null
    };
    const sql = parser.sqlify(dummyAst, { database: 'sqlite' });
    const match = sql.match(/SELECT\s+(.+)\s+AS\s+[`"']?val[`"']?/i);
    return match ? match[1].trim() : '';
  } catch (err) {
    console.error('Error sqlifying expression:', err);
    return '';
  }
}

/**
 * Serializes a list of columns/expressions.
 */
function sqlifyColumns(columns: any[]): string {
  if (!columns || columns.length === 0) return '*';
  try {
    const dummyAst: any = {
      type: 'select',
      columns,
      from: null
    };
    const sql = parser.sqlify(dummyAst, { database: 'sqlite' });
    return sql.replace(/^SELECT\s+/i, '').trim();
  } catch (err) {
    return '*';
  }
}

/**
 * Serializes a FROM/JOIN AST clause back to SQL.
 */
function sqlifyFrom(fromClause: any[]): string {
  try {
    const dummyAst: any = {
      type: 'select',
      columns: [{ expr: { type: 'column_ref', table: null, column: '*' }, as: null }],
      from: fromClause
    };
    const sql = parser.sqlify(dummyAst, { database: 'sqlite' });
    const match = sql.match(/FROM\s+(.+)$/i);
    return match ? match[1].trim() : '';
  } catch (err) {
    return '';
  }
}

/**
 * Main function: Compiles a SQL query into a list of visual execution stages.
 */
export async function compileQueryStages(sql: string): Promise<VisualizerStage[]> {
  const stages: VisualizerStage[] = [];
  
  // Clean query of comments and split into commands
  const cleanSql = sql.replace(/--.*$/gm, '').trim();
  
  let ast: any;
  try {
    ast = parser.astify(cleanSql, { database: 'sqlite' });
  } catch (err: any) {
    // If it's a DDL or DML statement that the parser fails on,
    // let's try postgresql dialect, else throw
    try {
      ast = parser.astify(cleanSql, { database: 'postgresql' });
    } catch {
      throw new Error(`SQL Parsing Error: ${err.message || 'Syntax error'}`);
    }
  }

  const astArray = Array.isArray(ast) ? ast : [ast];
  const mainAst = astArray[astArray.length - 1]; // Focus on the main query

  if (!mainAst) {
    throw new Error('No valid SQL statements found.');
  }

  // Handle DDL/DML operations
  const isDML = ['insert', 'update', 'delete'].includes(mainAst.type);
  const isDDL = ['create', 'drop', 'alter'].includes(mainAst.type);

  if (isDDL || isDML) {
    return compileDDLDMLStages(cleanSql, mainAst);
  }

  // If there are CTEs (WITH clause), register them as temp views first
  const ctes = mainAst.with;
  if (ctes && ctes.length > 0) {
    for (const cte of ctes) {
      const cteName = cte.name.value || cte.name;
      const cteSql = parser.sqlify(cte.stmt, { database: 'sqlite' });
      
      // Let's create a temp view in the database for this CTE
      executeScript(`DROP VIEW IF EXISTS ${cteName};`);
      executeScript(`CREATE TEMP VIEW ${cteName} AS ${cteSql};`);
    }
  }

  // Now process the main SELECT AST
  return compileSelectStages(mainAst);
}

/**
 * Compiles a standard SELECT query AST into sequential stages.
 */
function compileSelectStages(ast: any): VisualizerStage[] {
  const stages: VisualizerStage[] = [];
  const fromClause = ast.from;

  if (!fromClause || fromClause.length === 0) {
    // Queries like "SELECT 1 + 1"
    const result = executeQuery(parser.sqlify(ast, { database: 'sqlite' }));
    stages.push({
      id: 'select',
      name: 'SELECT (Simple Projection)',
      explanation: 'Evaluating raw expressions without table references.',
      sqlClause: parser.sqlify(ast, { database: 'sqlite' }),
      columns: result.columns,
      rows: result.rows.map((r, i) => ({ ...r, __row_id: `scalar_${i}` })),
      rowStates: {}
    });
    return stages;
  }

  // Extract variables
  const fromSql = sqlifyFrom(fromClause);
  const hasJoins = fromClause.length > 1 || fromClause.some((f: any) => f.join);
  const whereExpr = ast.where;
  const groupbyExprs = ast.groupby?.columns;
  const havingExpr = ast.having;
  const selectCols = ast.columns;
  const distinct = ast.distinct;
  const orderbyExprs = ast.orderby;
  const limitObj = ast.limit;

  // Let's track queries for stages
  let currentBaseQuery = `SELECT * FROM ${fromSql}`;

  // -------------------------------------------------------------
  // STAGE 1: FROM / JOIN
  // -------------------------------------------------------------
  // We want to inject rowid values for identity tracking
  // SQLite rowid is select-able as rowid.
  // For multiple tables, we fetch table rowids as __rowid_<tablename>
  const getRowIdProjection = (from: any[]): string => {
    const list: string[] = [];
    from.forEach((tableRef: any) => {
      const tableVal = typeof tableRef.table === 'string' ? tableRef.table : '';
      const aliasVal = typeof tableRef.as === 'string' ? tableRef.as : '';
      const tName = (aliasVal || tableVal || 'tbl').toLowerCase();

      // Only inject rowid for physical tables, skip subqueries or CTEs (which don't have rowids in SQLite)
      const tablesInDb = getDbTables().map((t: string) => t.toLowerCase());
      const rawTable = typeof tableRef.table === 'string' ? tableRef.table.toLowerCase() : '';
      
      if (tablesInDb.includes(rawTable)) {
        list.push(`${tName}.rowid AS __rowid_${tName}`);
      } else {
        // Fallback: CTE or subquery might already have id or rowid.
        // We can select its `id` if it exists.
        list.push(`NULL AS __rowid_${tName}`);
      }
    });
    return list.join(', ');
  };

  const rowIdProj = getRowIdProjection(fromClause);
  const fromSelect = `SELECT ${rowIdProj ? rowIdProj + ', ' : ''} * FROM ${fromSql}`;
  
  let fromResult = executeQuery(fromSelect);
  
  // Assign stable __row_id to each row
  fromResult.rows = fromResult.rows.map((row, index) => {
    // Generate composite row ID
    const rowIdKeys = Object.keys(row).filter(k => k.startsWith('__rowid_'));
    const compositeId = rowIdKeys.map(k => row[k]).filter(v => v !== null && v !== undefined).join('_');
    return {
      ...row,
      __row_id: compositeId || `from_${index}`
    };
  });

  // Filter out the internal __rowid_* columns from display
  const displayCols = fromResult.columns.filter(c => !c.startsWith('__rowid_'));

  stages.push({
    id: 'from',
    name: hasJoins ? 'FROM & JOIN' : 'FROM',
    explanation: hasJoins 
      ? `Combining datasets from tables. Cartesian product created, then JOIN filters applied.`
      : `Loaded initial dataset from table: ${fromClause[0].table}.`,
    sqlClause: `FROM ${fromSql}`,
    columns: displayCols,
    rows: fromResult.rows,
    rowStates: {}
  });

  let activeRows: any[] = [...fromResult.rows];
  let activeColumns = [...displayCols];

  // -------------------------------------------------------------
  // STAGE 2: WHERE
  // -------------------------------------------------------------
  if (whereExpr) {
    const whereSql = sqlifyExpr(whereExpr);
    // Execute a query that evaluates the WHERE predicate as a boolean column `__where_passed`
    const whereEvalQuery = `
      SELECT ${rowIdProj ? rowIdProj + ', ' : ''} *, (${whereSql}) AS __where_passed 
      FROM ${fromSql}
    `;
    const whereEvalRes = executeQuery(whereEvalQuery);
    
    // Map evaluated results back to active rows
    const rowStates: Record<string, 'kept' | 'removed'> = {};
    const processedRows = whereEvalRes.rows.map((row, index) => {
      const rowIdKeys = Object.keys(row).filter(k => k.startsWith('__rowid_'));
      const compositeId = rowIdKeys.map(k => row[k]).filter(v => v !== null).join('_') || `from_${index}`;
      
      const passed = row['__where_passed'] === 1;
      rowStates[compositeId] = passed ? 'kept' : 'removed';
      
      return {
        ...row,
        __row_id: compositeId
      };
    });

    stages.push({
      id: 'where',
      name: 'WHERE',
      explanation: `Filtering rows. Evaluated predicate: "${whereSql}".`,
      sqlClause: `WHERE ${whereSql}`,
      columns: activeColumns,
      rows: processedRows,
      rowStates: rowStates
    });

    // Update active rows for the next stage (only keep survivors)
    activeRows = processedRows.filter((r: any) => r.__where_passed === 1);
  }

  // Helper SQL filter string for subsequent aggregates/SELECT
  const whereFilterSql = whereExpr ? `WHERE ${sqlifyExpr(whereExpr)}` : '';

  // -------------------------------------------------------------
  // STAGE 3: GROUP BY
  // -------------------------------------------------------------
  let isGrouped = false;
  let groupKeys: string[] = [];
  if (groupbyExprs && groupbyExprs.length > 0) {
    isGrouped = true;
    groupKeys = groupbyExprs.map((g: any) => sqlifyExpr(g));

    // To visualize groupings, we will cluster rows in JavaScript
    // Let's attach a `__group_key` column to each active row
    const groupKeySelects = groupKeys.map((k, i) => `${k} AS __gkey_${i}`).join(', ');
    const groupKeysQuery = `
      SELECT ${rowIdProj ? rowIdProj + ', ' : ''} ${groupKeySelects ? groupKeySelects + ', ' : ''} * 
      FROM ${fromSql}
      ${whereFilterSql}
    `;
    const groupKeysRes = executeQuery(groupKeysQuery);
    
    const groupedRows = groupKeysRes.rows.map((row, index) => {
      const rowIdKeys = Object.keys(row).filter(k => k.startsWith('__rowid_'));
      const compositeId = rowIdKeys.map(k => row[k]).filter(v => v !== null).join('_') || `from_${index}`;
      
      // Construct a single group value string
      const groupValStr = groupKeys.map((_, i) => row[`__gkey_${i}`]).join(' | ');
      
      return {
        ...row,
        __row_id: compositeId,
        __group_key: groupValStr
      };
    });

    stages.push({
      id: 'groupby',
      name: 'GROUP BY',
      explanation: `Bucketing rows into groups by: ${groupKeys.join(', ')}.`,
      sqlClause: `GROUP BY ${groupKeys.join(', ')}`,
      columns: activeColumns,
      rows: groupedRows,
      rowStates: {},
      meta: { groupKeys }
    });

    activeRows = groupedRows;
  }

  // -------------------------------------------------------------
  // STAGE 4: HAVING
  // -------------------------------------------------------------
  let havingFilterSql = '';
  if (havingExpr && isGrouped) {
    const havingSql = sqlifyExpr(havingExpr);
    havingFilterSql = `HAVING ${havingSql}`;

    // Execute query to see which groups passed
    const groupKeySelects = groupKeys.map((k, i) => `${k} AS __gkey_${i}`).join(', ');
    const havingEvalQuery = `
      SELECT ${groupKeySelects}, (${havingSql}) AS __having_passed
      FROM ${fromSql}
      ${whereFilterSql}
      GROUP BY ${groupKeys.join(', ')}
    `;
    const havingEvalRes = executeQuery(havingEvalQuery);
    
    // Mark row states depending on if their group survived
    const rowStates: Record<string, 'kept' | 'removed'> = {};
    const groupPassedMap: Record<string, boolean> = {};
    
    havingEvalRes.rows.forEach((r) => {
      const groupValStr = groupKeys.map((_, i) => r[`__gkey_${i}`]).join(' | ');
      groupPassedMap[groupValStr] = r['__having_passed'] === 1;
    });

    const processedRows = activeRows.map((row) => {
      const gKey = row.__group_key || '';
      const passed = groupPassedMap[gKey] ?? false;
      rowStates[row.__row_id] = passed ? 'kept' : 'removed';
      return {
        ...row,
        __having_passed: passed ? 1 : 0
      };
    });

    stages.push({
      id: 'having',
      name: 'HAVING',
      explanation: `Filtering groups. Evaluated condition: "${havingSql}".`,
      sqlClause: `HAVING ${havingSql}`,
      columns: activeColumns,
      rows: processedRows,
      rowStates: rowStates
    });

    activeRows = processedRows.filter(r => r.__having_passed === 1);
  }

  // -------------------------------------------------------------
  // STAGE 5: SELECT (Columns Projection)
  // -------------------------------------------------------------
  // Build SELECT query
  const colSql = sqlifyColumns(selectCols);
  const selectQuery = `
    SELECT ${colSql}
    FROM ${fromSql}
    ${whereFilterSql}
    ${isGrouped ? `GROUP BY ${groupKeys.join(', ')}` : ''}
    ${havingFilterSql}
  `;
  const selectRes = executeQuery(selectQuery);
  
  // Assign simple primary key row ids to the projected list since identities change
  selectRes.rows = selectRes.rows.map((row, idx) => ({
    ...row,
    __row_id: `select_${idx}`
  }));

  stages.push({
    id: 'select',
    name: 'SELECT',
    explanation: `Projecting requested columns and calculating aggregate functions.`,
    sqlClause: `SELECT ${colSql}`,
    columns: selectRes.columns,
    rows: selectRes.rows,
    rowStates: {}
  });

  activeRows = [...selectRes.rows];
  activeColumns = [...selectRes.columns];

  // -------------------------------------------------------------
  // STAGE 6: DISTINCT
  // -------------------------------------------------------------
  if (distinct === 'DISTINCT') {
    const distinctQuery = `
      SELECT DISTINCT ${colSql}
      FROM ${fromSql}
      ${whereFilterSql}
      ${isGrouped ? `GROUP BY ${groupKeys.join(', ')}` : ''}
      ${havingFilterSql}
    `;
    const distinctRes = executeQuery(distinctQuery);
    
    // Diff to see which rows were eliminated as duplicates
    const rowStates: Record<string, 'kept' | 'removed'> = {};
    const distinctRowKeys = new Set(distinctRes.rows.map(r => JSON.stringify(r)));

    const processedRows = activeRows.map((row) => {
      // Create a clean object without __row_id to compare
      const cleanRow = { ...row };
      delete cleanRow.__row_id;
      
      const survived = distinctRowKeys.has(JSON.stringify(cleanRow));
      rowStates[row.__row_id] = survived ? 'kept' : 'removed';
      
      return row;
    });

    stages.push({
      id: 'distinct',
      name: 'DISTINCT',
      explanation: `Removing duplicate rows from the projected set.`,
      sqlClause: `SELECT DISTINCT`,
      columns: activeColumns,
      rows: processedRows,
      rowStates: rowStates
    });

    // Update active rows with the actual unique rows (giving them new ids)
    activeRows = distinctRes.rows.map((row, idx) => ({
      ...row,
      __row_id: `distinct_${idx}`
    }));
  }

  // -------------------------------------------------------------
  // STAGE 7: ORDER BY
  // -------------------------------------------------------------
  if (orderbyExprs && orderbyExprs.length > 0) {
    const orderbySql = orderbyExprs.map((o: any) => `${sqlifyExpr(o.expr)} ${o.type || 'ASC'}`).join(', ');
    const orderbyQuery = `
      SELECT ${colSql}
      FROM ${fromSql}
      ${whereFilterSql}
      ${isGrouped ? `GROUP BY ${groupKeys.join(', ')}` : ''}
      ${havingFilterSql}
      ${distinct === 'DISTINCT' ? 'DISTINCT' : ''}
      ORDER BY ${orderbySql}
    `;
    const orderbyRes = executeQuery(orderbyQuery);

    // Compute row indices before and after sort for UI arrows
    // Match rows based on value serialization since ids changed
    const finalSortedRows = orderbyRes.rows.map((row, idx) => {
      // Find matching row in previous stage
      const matchingPrevRow = activeRows.find(ar => {
        const arClean = { ...ar }; delete arClean.__row_id;
        const rowClean = { ...row }; delete rowClean.__row_id;
        return JSON.stringify(arClean) === JSON.stringify(rowClean);
      });

      return {
        ...row,
        __row_id: matchingPrevRow ? matchingPrevRow.__row_id : `order_${idx}`
      };
    });

    stages.push({
      id: 'orderby',
      name: 'ORDER BY',
      explanation: `Sorting rows in order of: ${orderbySql}.`,
      sqlClause: `ORDER BY ${orderbySql}`,
      columns: activeColumns,
      rows: finalSortedRows,
      rowStates: {}
    });

    activeRows = finalSortedRows;
  }

  // -------------------------------------------------------------
  // STAGE 8: LIMIT / OFFSET
  // -------------------------------------------------------------
  if (limitObj) {
    // In node-sql-parser limit has value array: [ { type: 'number', value: N }, { type: 'number', value: M } ]
    const limitVal = limitObj.value[0]?.value;
    const offsetVal = limitObj.value[1]?.value || 0;
    
    const limitQuery = `
      SELECT ${colSql}
      FROM ${fromSql}
      ${whereFilterSql}
      ${isGrouped ? `GROUP BY ${groupKeys.join(', ')}` : ''}
      ${havingFilterSql}
      ${distinct === 'DISTINCT' ? 'DISTINCT' : ''}
      ${orderbyExprs && orderbyExprs.length > 0 ? `ORDER BY ${orderbyExprs.map((o: any) => `${sqlifyExpr(o.expr)} ${o.type || 'ASC'}`).join(', ')}` : ''}
      LIMIT ${limitVal} OFFSET ${offsetVal}
    `;
    const limitRes = executeQuery(limitQuery);
    const limitRowKeys = new Set(limitRes.rows.map(r => JSON.stringify(r)));

    // Highlight which rows are sliced out
    const rowStates: Record<string, 'kept' | 'removed'> = {};
    const processedRows = activeRows.map((row) => {
      const cleanRow = { ...row };
      delete cleanRow.__row_id;
      const survived = limitRowKeys.has(JSON.stringify(cleanRow));
      rowStates[row.__row_id] = survived ? 'kept' : 'removed';
      return row;
    });

    stages.push({
      id: 'limit',
      name: 'LIMIT / OFFSET',
      explanation: `Slicing dataset: keeping up to ${limitVal} rows${offsetVal ? ` starting from offset ${offsetVal}` : ''}.`,
      sqlClause: `LIMIT ${limitVal} ${offsetVal ? `OFFSET ${offsetVal}` : ''}`,
      columns: activeColumns,
      rows: processedRows,
      rowStates: rowStates
    });
  }

  return stages;
}

/**
 * Visualizes DDL and DML operations.
 */
function compileDDLDMLStages(sql: string, ast: any): VisualizerStage[] {
  const stages: VisualizerStage[] = [];
  const type = ast.type.toUpperCase();

  if (type === 'CREATE') {
    const tableName = ast.table[0].table;
    const columns = ast.create_definitions.map((def: any) => `${def.column.column} ${def.definition.dataType}`);

    // DDL Step 1: Create
    stages.push({
      id: 'ddl',
      name: 'CREATE TABLE',
      explanation: `Creating a new empty table structure named "${tableName}".`,
      sqlClause: sql,
      columns: ast.create_definitions.map((def: any) => def.column.column),
      rows: [],
      rowStates: {}
    });
  } 
  else if (type === 'INSERT') {
    const tableName = ast.table[0].table;
    
    // Get existing table state before insert
    const beforeResult = executeQuery(`SELECT rowid AS __row_id, * FROM ${tableName}`);
    const beforeCols = beforeResult.columns.filter(c => c !== '__row_id');

    // Run the actual insert in the database
    executeScript(sql);

    // Get table state after insert
    const afterResult = executeQuery(`SELECT rowid AS __row_id, * FROM ${tableName}`);
    const afterCols = afterResult.columns.filter(c => c !== '__row_id');

    // Diff row states
    const rowStates: Record<string, 'kept' | 'added'> = {};
    const beforeIds = new Set(beforeResult.rows.map(r => r.__row_id));
    
    const processedRows = afterResult.rows.map((row) => {
      const isNew = !beforeIds.has(row.__row_id);
      rowStates[row.__row_id] = isNew ? 'added' : 'kept';
      return row;
    });

    stages.push({
      id: 'dml',
      name: 'INSERT INTO',
      explanation: `Inserting ${afterResult.rows.length - beforeResult.rows.length} new row(s) into table "${tableName}".`,
      sqlClause: sql,
      columns: afterCols,
      rows: processedRows,
      rowStates: rowStates as any
    });
  } 
  else if (type === 'UPDATE') {
    const tableName = ast.table[0].table;
    
    // Get existing table state
    const beforeResult = executeQuery(`SELECT rowid AS __row_id, * FROM ${tableName}`);
    const beforeCols = beforeResult.columns.filter(c => c !== '__row_id');

    // Get row ids that match the where condition
    const whereSql = ast.where ? sqlifyExpr(ast.where) : '';
    const matchingRes = executeQuery(`SELECT rowid AS __row_id FROM ${tableName} ${whereSql ? `WHERE ${whereSql}` : ''}`);
    const matchingIds = new Set(matchingRes.rows.map(r => r.__row_id));

    // Run the actual update
    executeScript(sql);

    // Get after update rows
    const afterResult = executeQuery(`SELECT rowid AS __row_id, * FROM ${tableName}`);
    const afterCols = afterResult.columns.filter(c => c !== '__row_id');

    // Diff row states: show modified
    const rowStates: Record<string, 'kept' | 'modified'> = {};
    const processedRows = afterResult.rows.map((row) => {
      const isModified = matchingIds.has(row.__row_id);
      rowStates[row.__row_id] = isModified ? 'modified' : 'kept';
      return row;
    });

    stages.push({
      id: 'dml',
      name: 'UPDATE TABLE',
      explanation: `Updating columns in table "${tableName}" where conditions match.`,
      sqlClause: sql,
      columns: afterCols,
      rows: processedRows,
      rowStates: rowStates as any
    });
  } 
  else if (type === 'DELETE') {
    const tableName = ast.table[0].table;

    // Get state before delete
    const beforeResult = executeQuery(`SELECT rowid AS __row_id, * FROM ${tableName}`);
    const beforeCols = beforeResult.columns.filter(c => c !== '__row_id');

    // Get matching row ids that will be deleted
    const whereSql = ast.where ? sqlifyExpr(ast.where) : '';
    const matchingRes = executeQuery(`SELECT rowid AS __row_id FROM ${tableName} ${whereSql ? `WHERE ${whereSql}` : ''}`);
    const matchingIds = new Set(matchingRes.rows.map(r => r.__row_id));

    // Run delete
    executeScript(sql);

    // DML Stage: show table before delete but highlight deleted rows in red
    const rowStates: Record<string, 'kept' | 'removed'> = {};
    beforeResult.rows.forEach((row) => {
      const isDeleted = matchingIds.has(row.__row_id);
      rowStates[row.__row_id] = isDeleted ? 'removed' : 'kept';
    });

    stages.push({
      id: 'dml',
      name: 'DELETE FROM',
      explanation: `Removing ${matchingIds.size} row(s) matching criteria from table "${tableName}".`,
      sqlClause: sql,
      columns: beforeCols,
      rows: beforeResult.rows,
      rowStates: rowStates as any
    });
  }

  return stages;
}
