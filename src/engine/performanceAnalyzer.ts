export interface PerformanceHint {
  type: 'warning' | 'info' | 'success';
  title: string;
  description: string;
  recommendation?: string;
}

/**
 * Analyzes SQL text and returns performance tips and index recommendations.
 */
export function analyzePerformance(sql: string): PerformanceHint[] {
  const hints: PerformanceHint[] = [];
  const lowerSql = sql.toLowerCase();

  // 1. Check for CROSS JOIN or lack of join predicates
  if (lowerSql.includes('cross join') || (lowerSql.includes('join') && !lowerSql.includes(' on ') && !lowerSql.includes(' using '))) {
    hints.push({
      type: 'warning',
      title: 'Cartesian Product Risk',
      description: 'The query performs a CROSS JOIN or a JOIN without join predicates. This multiplies all rows together.',
      recommendation: 'Specify matching columns using an ON clause (e.g., JOIN departments d ON e.dept_id = d.id).'
    });
  }

  // 2. Check for missing indexes on foreign key joins
  // E.g. JOIN departments d ON e.dept_id = d.id -> Suggest index on e.dept_id
  const joinMatch = lowerSql.match(/join\s+(\w+)\s+(?:as\s+)?(\w+)?\s+on\s+([\w.]+)\s*=\s*([\w.]+)/g);
  if (joinMatch) {
    joinMatch.forEach((match) => {
      // Extract join conditions e.g. e.dept_id = d.id
      const onPart = match.split(/\bon\b/i)[1];
      if (onPart) {
        const sides = onPart.split('=');
        sides.forEach((side) => {
          const cleanSide = side.trim();
          // If it looks like a foreign key (e.g. e.dept_id) and is not .id (which is primary key and indexed by default)
          if (cleanSide.includes('.') && !cleanSide.endsWith('.id') && (cleanSide.endsWith('_id') || cleanSide.endsWith('id'))) {
            const tableAlias = cleanSide.split('.')[0];
            const colName = cleanSide.split('.')[1];
            
            hints.push({
              type: 'info',
              title: `Unindexed Join Column: ${colName}`,
              description: `The database joins on "${cleanSide}" which is likely a foreign key. Joining without an index forces a full table scan.`,
              recommendation: `Run: "CREATE INDEX idx_${tableAlias}_${colName} ON employees(${colName});" to speed up the join lookup.`
            });
          }
        });
      }
    });
  }

  // 3. Check for SELECT * scans without WHERE
  if (lowerSql.includes('select *') && !lowerSql.includes('where') && !lowerSql.includes('limit')) {
    hints.push({
      type: 'warning',
      title: 'Unbounded Table Scan',
      description: 'The query uses SELECT * without a WHERE clause or LIMIT. This forces the database to read and return all rows from disk.',
      recommendation: 'Add a WHERE filter to reduce returned records, or use a LIMIT clause to restrict visual output.'
    });
  }

  // 4. Suggest sort optimization for ORDER BY
  if (lowerSql.includes('order by') && !lowerSql.includes('index')) {
    hints.push({
      type: 'info',
      title: 'Sort Operation Overhead',
      description: 'The query sorts rows using ORDER BY. Without a matching index on the sorted column, the database performs an in-memory filesort.',
      recommendation: 'If this table grows large, consider creating an index on the sorted columns to read rows already in order.'
    });
  }

  // If no warnings are found, add a success indicator
  if (hints.length === 0) {
    hints.push({
      type: 'success',
      title: 'Query Optimized',
      description: 'No obvious performance bottlenecks detected. The query structure is clean.',
    });
  }

  return hints;
}
