import { faker } from '@faker-js/faker';
import { TableSchema, ColumnSchema } from './schemaInferrer';

export interface RowData {
  [columnName: string]: any;
}

export interface MockTableData {
  schema: TableSchema;
  rows: RowData[];
}

// Generate deterministic seeds so that the data doesn't randomize on every keypress,
// but feels consistent during queries.
export function seedFaker(seedValue = 42) {
  faker.seed(seedValue);
}

/**
 * Generates mock data for a given schema.
 * Generates between 10-15 rows.
 */
export function generateMockData(schema: TableSchema): MockTableData {
  const rowCount = schema.name === 'departments' ? 4 : 10; // keep departments small for joins
  const rows: RowData[] = [];

  for (let i = 1; i <= rowCount; i++) {
    const row: RowData = {};
    
    // Seed primary key id first
    row['id'] = i;

    schema.columns.forEach((col) => {
      if (col.name === 'id') return;

      row[col.name] = generateMockValue(schema.name, col, i);
    });

    rows.push(row);
  }

  return {
    schema,
    rows
  };
}

/**
 * Specialized cell values based on table name and column settings.
 */
function generateMockValue(tableName: string, col: ColumnSchema, index: number): any {
  const cName = col.name.toLowerCase();
  const tName = tableName.toLowerCase();

  // Helper for generating consistent dates
  const getRandomDateString = (daysAgoMin: number, daysAgoMax: number) => {
    const d = faker.date.between({
      from: new Date(Date.now() - daysAgoMax * 24 * 60 * 60 * 1000),
      to: new Date(Date.now() - daysAgoMin * 24 * 60 * 60 * 1000)
    });
    return d.toISOString().split('T')[0];
  };

  // Archetype: employees
  if (tName === 'employees') {
    if (cName === 'first_name') return faker.person.firstName();
    if (cName === 'last_name') return faker.person.lastName();
    if (cName === 'email') return faker.internet.email();
    if (cName === 'salary') {
      // Return a set of discrete values to make GROUP BY examples clean
      return faker.helpers.arrayElement([45000, 52000, 68000, 75000, 88000, 95000, 120000]);
    }
    if (cName === 'dept_id') return faker.helpers.arrayElement([1, 2, 3, 4]); // references departments.id
    if (cName === 'hire_date') return getRandomDateString(100, 1500);
    if (cName === 'age') return faker.number.int({ min: 22, max: 62 });
  }

  // Archetype: departments
  if (tName === 'departments') {
    if (cName === 'name') return ['Engineering', 'Marketing', 'Sales', 'HR'][index - 1] || 'Operations';
    if (cName === 'budget') return [500000, 180000, 320000, 110000][index - 1] || 150000;
    if (cName === 'location') return ['San Francisco', 'New York', 'Chicago', 'Austin'][index - 1] || 'Remote';
  }

  // Archetype: users
  if (tName === 'users') {
    if (cName === 'name') return faker.person.fullName();
    if (cName === 'email') return faker.internet.email();
    if (cName === 'age') return faker.number.int({ min: 18, max: 70 });
    if (cName === 'role') return faker.helpers.arrayElement(['User', 'Admin', 'Editor', 'Manager']);
    if (cName === 'created_at') return getRandomDateString(10, 300);
  }

  // Archetype: orders
  if (tName === 'orders') {
    if (cName === 'user_id') return faker.number.int({ min: 1, max: 10 }); // references users.id
    if (cName === 'product_id') return faker.number.int({ min: 1, max: 8 }); // references products.id
    if (cName === 'amount') return parseFloat(faker.commerce.price({ min: 15, max: 350 }));
    if (cName === 'status') return faker.helpers.arrayElement(['Completed', 'Pending', 'Cancelled', 'Shipped']);
    if (cName === 'order_date') return getRandomDateString(2, 60);
  }

  // Archetype: products
  if (tName === 'products') {
    if (cName === 'name') return faker.commerce.productName();
    if (cName === 'price') return parseFloat(faker.commerce.price({ min: 5, max: 150 }));
    if (cName === 'category') return faker.commerce.department();
    if (cName === 'stock') return faker.number.int({ min: 5, max: 120 });
  }

  // Archetype: transactions
  if (tName === 'transactions') {
    if (cName === 'account_id') return faker.number.int({ min: 1001, max: 1010 });
    if (cName === 'type') return faker.helpers.arrayElement(['deposit', 'withdrawal', 'transfer', 'payment']);
    if (cName === 'amount') return parseFloat(faker.finance.amount({ min: 5, max: 1000 }));
    if (cName === 'timestamp') return getRandomDateString(0, 10) + ' ' + faker.date.anytime().toTimeString().split(' ')[0];
  }

  // Archetype: inventory
  if (tName === 'inventory') {
    if (cName === 'product_id') return index;
    if (cName === 'warehouse') return faker.helpers.arrayElement(['North', 'East', 'South', 'West']);
    if (cName === 'quantity') return faker.number.int({ min: 10, max: 500 });
  }

  // Fallbacks based on field keywords
  if (cName.includes('email')) return faker.internet.email();
  if (cName.includes('name')) return faker.person.fullName();
  if (cName.includes('phone')) return faker.phone.number();
  if (cName.includes('city') || cName.includes('location')) return faker.location.city();
  if (cName.includes('country')) return faker.location.country();
  if (cName.includes('price') || cName.includes('cost') || cName.includes('salary') || cName.includes('amount') || cName.includes('budget')) {
    return col.type === 'INTEGER' ? faker.number.int({ min: 10, max: 500 }) : parseFloat(faker.commerce.price({ min: 10, max: 500 }));
  }
  if (cName.includes('date') || cName.includes('time') || cName.includes('created') || cName.includes('updated')) {
    return getRandomDateString(1, 100);
  }
  if (cName.includes('status')) return faker.helpers.arrayElement(['Active', 'Inactive', 'Pending']);
  if (cName.includes('age')) return faker.number.int({ min: 18, max: 65 });

  // Standard type fallbacks
  if (col.type === 'INTEGER') {
    return faker.number.int({ min: 1, max: 100 });
  }
  if (col.type === 'REAL' || col.type === 'NUMERIC') {
    return parseFloat(faker.number.float({ min: 1, max: 100 }).toFixed(2));
  }
  return faker.lorem.word();
}

/**
 * Creates sql.js-compatible SQL queries to register and seed tables.
 */
export function generateSeedSQL(tables: MockTableData[]): string {
  let sql = '';
  tables.forEach((t) => {
    // Drop table if exists
    sql += `DROP TABLE IF EXISTS ${t.schema.name};\n`;
    
    // Create Table statement
    const colDefs = t.schema.columns.map((col) => {
      let def = `${col.name} ${col.type}`;
      if (col.isPrimaryKey) def += ' PRIMARY KEY AUTOINCREMENT';
      return def;
    });
    sql += `CREATE TABLE ${t.schema.name} (${colDefs.join(', ')});\n`;

    // Insert statements
    t.rows.forEach((row) => {
      const colNames: string[] = [];
      const values: string[] = [];

      Object.entries(row).forEach(([col, val]) => {
        // Skip id because it autoincrements, except if manually needed
        // But sql.js accepts explicit ids too.
        colNames.push(col);
        if (val === null) {
          values.push('NULL');
        } else if (typeof val === 'string') {
          // Escape single quotes for SQL safety
          values.push(`'${val.replace(/'/g, "''")}'`);
        } else {
          values.push(val.toString());
        }
      });

      sql += `INSERT INTO ${t.schema.name} (${colNames.join(', ')}) VALUES (${values.join(', ')});\n`;
    });
    sql += '\n';
  });

  return sql;
}
