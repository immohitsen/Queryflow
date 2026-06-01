import { Parser } from 'node-sql-parser';

export interface ColumnSchema {
  name: string;
  type: 'INTEGER' | 'REAL' | 'TEXT' | 'NUMERIC';
  isNullable?: boolean;
  isPrimaryKey?: boolean;
}

export interface TableSchema {
  name: string;
  columns: ColumnSchema[];
}

const parser = new Parser();

// Pre-defined Archetype Schemas
export const TABLE_ARCHETYPES: Record<string, ColumnSchema[]> = {
  users: [
    { name: 'id', type: 'INTEGER', isPrimaryKey: true },
    { name: 'name', type: 'TEXT' },
    { name: 'email', type: 'TEXT' },
    { name: 'age', type: 'INTEGER' },
    { name: 'role', type: 'TEXT' },
    { name: 'created_at', type: 'TEXT' }
  ],
  employees: [
    { name: 'id', type: 'INTEGER', isPrimaryKey: true },
    { name: 'first_name', type: 'TEXT' },
    { name: 'last_name', type: 'TEXT' },
    { name: 'email', type: 'TEXT' },
    { name: 'salary', type: 'REAL' },
    { name: 'dept_id', type: 'INTEGER' },
    { name: 'hire_date', type: 'TEXT' },
    { name: 'age', type: 'INTEGER' }
  ],
  departments: [
    { name: 'id', type: 'INTEGER', isPrimaryKey: true },
    { name: 'name', type: 'TEXT' },
    { name: 'budget', type: 'REAL' },
    { name: 'location', type: 'TEXT' }
  ],
  orders: [
    { name: 'id', type: 'INTEGER', isPrimaryKey: true },
    { name: 'user_id', type: 'INTEGER' },
    { name: 'product_id', type: 'INTEGER' },
    { name: 'amount', type: 'REAL' },
    { name: 'status', type: 'TEXT' },
    { name: 'order_date', type: 'TEXT' }
  ],
  products: [
    { name: 'id', type: 'INTEGER', isPrimaryKey: true },
    { name: 'name', type: 'TEXT' },
    { name: 'price', type: 'REAL' },
    { name: 'category', type: 'TEXT' },
    { name: 'stock', type: 'INTEGER' }
  ],
  transactions: [
    { name: 'id', type: 'INTEGER', isPrimaryKey: true },
    { name: 'account_id', type: 'INTEGER' },
    { name: 'type', type: 'TEXT' },
    { name: 'amount', type: 'REAL' },
    { name: 'timestamp', type: 'TEXT' }
  ],
  inventory: [
    { name: 'id', type: 'INTEGER', isPrimaryKey: true },
    { name: 'product_id', type: 'INTEGER' },
    { name: 'warehouse', type: 'TEXT' },
    { name: 'quantity', type: 'INTEGER' }
  ]
};

// Recursively walks the AST to find column references and their details
function walkAST(node: any, callback: (node: any) => void) {
  if (!node || typeof node !== 'object') return;

  callback(node);

  for (const key in node) {
    if (Object.prototype.hasOwnProperty.call(node, key)) {
      const child = node[key];
      if (Array.isArray(child)) {
        child.forEach(item => walkAST(item, callback));
      } else {
        walkAST(child, callback);
      }
    }
  }
}

/**
 * Parses a query and infers schemas for any referenced tables.
 */
export function inferSchemas(sql: string): TableSchema[] {
  const schemas: TableSchema[] = [];
  try {
    // 1. Get AST
    const opt = { database: 'postgresql' }; // Use pg as a robust parser option
    let ast: any;
    try {
      ast = parser.astify(sql, opt);
    } catch (e) {
      // Fallback to SQLite dialect if PostgreSQL parsing fails
      ast = parser.astify(sql, { database: 'sqlite' });
    }

    // Support single and multiple AST nodes
    const astArray = Array.isArray(ast) ? ast : [ast];

    // 2. Extract referenced tables using tableList
    // E.g. parser.tableList returns strings like "select::null::employees"
    const tables: string[] = [];
    astArray.forEach(singleAst => {
      try {
        const tableList = parser.tableList(sql);
        tableList.forEach(tStr => {
          const parts = tStr.split('::');
          const tableName = parts[parts.length - 1];
          if (tableName && !tables.includes(tableName)) {
            tables.push(tableName.toLowerCase());
          }
        });
      } catch (err) {
        // Fallback manual table extraction if tableList fails
        walkAST(singleAst, (node) => {
          if (node.type === 'table_ref' || (node.table && typeof node.table === 'string' && node.type === 'from')) {
            const tName = (node.table || '').toLowerCase();
            if (tName && !tables.includes(tName)) {
              tables.push(tName);
            }
          }
        });
      }
    });

    // 3. For each table, compile column references from AST to infer types
    tables.forEach(tableName => {
      const lowerTableName = tableName.toLowerCase();

      // If it exists in our pre-defined archetypes, use that!
      if (TABLE_ARCHETYPES[lowerTableName]) {
        schemas.push({
          name: lowerTableName,
          columns: TABLE_ARCHETYPES[lowerTableName]
        });
        return;
      }

      // Otherwise, infer custom columns
      const inferredCols: Record<string, ColumnSchema> = {
        id: { name: 'id', type: 'INTEGER', isPrimaryKey: true }
      };

      astArray.forEach(singleAst => {
        walkAST(singleAst, (node) => {
          // Check for column references
          // In node-sql-parser: { type: 'column_ref', table: 't', column: 'col' }
          if (node.type === 'column_ref') {
            const colTable = node.table ? node.table.toLowerCase() : null;
            const colName = node.column.toLowerCase();

            // Match if table is omitted or matches our target table
            if (!colTable || colTable === lowerTableName) {
              if (colName !== 'id' && colName !== '*') {
                // Infer type based on name keywords
                let inferredType: 'INTEGER' | 'REAL' | 'TEXT' | 'NUMERIC' = 'TEXT';
                if (/(_id|age|count|quantity|stock|year|month|day)$/.test(colName)) {
                  inferredType = 'INTEGER';
                } else if (/(salary|price|amount|budget|avg|rate|score|value|temp)$/.test(colName)) {
                  inferredType = 'REAL';
                } else if (/(date|time|created_at|updated_at)$/.test(colName)) {
                  inferredType = 'TEXT'; // Dates stored as ISO strings
                }

                inferredCols[colName] = {
                  name: colName,
                  type: inferredType
                };
              }
            }
          }
        });
      });

      // If no columns could be inferred, add some generic dummy columns
      if (Object.keys(inferredCols).length === 1) {
        inferredCols['name'] = { name: 'name', type: 'TEXT' };
        inferredCols['value'] = { name: 'value', type: 'INTEGER' };
        inferredCols['created_at'] = { name: 'created_at', type: 'TEXT' };
      }

      schemas.push({
        name: lowerTableName,
        columns: Object.values(inferredCols)
      });
    });

  } catch (error) {
    console.error('Error during schema inference:', error);
  }

  return schemas;
}
