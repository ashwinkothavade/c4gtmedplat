const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const multer = require('multer');
const XLSX = require('xlsx');
const fs = require('fs');

const app = express();
const port = 5000;

require('dotenv').config();

console.log('DB ENV:', {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  name: process.env.DB_NAME,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
});

/*
CREATE TABLE IF NOT EXISTS indicator_master (
  id SERIAL PRIMARY KEY,
  indicator_name TEXT NOT NULL,
  description TEXT,
  sql_query TEXT NOT NULL,
  query_result INTEGER,
  created_by INTEGER,
  created_on TIMESTAMP DEFAULT NOW()
);
*/

// const pool = new Pool({
//   user: process.env.DB_USER,
//   host: process.env.DB_HOST,
//   database: process.env.DB_NAME,
//   password: process.env.DB_PASSWORD,
//   port: parseInt(process.env.DB_PORT,10),
// });

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'medplat',
  password: '12345678',
  port: 5432,
});

app.use(cors());
app.use(express.json());

// Ensure derived_attributes table exists
(async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS derived_attributes (
      id SERIAL PRIMARY KEY,
      derived_name TEXT NOT NULL,
      formula TEXT NOT NULL,
      result INTEGER,
      created_on TIMESTAMP DEFAULT NOW()
    )
  `);
})();

// POST /api/attribute-value
// Body: { table, column, indicator } (either column+table or indicator)
app.post('/api/attribute-value', async (req, res) => {
  const { table, column, indicator } = req.body;
  try {
    if (indicator) {
      // Get value from indicator_master
      const result = await pool.query('SELECT query_result FROM indicator_master WHERE indicator_name = $1', [indicator]);
      if (result.rows.length > 0) {
        return res.json({ value: result.rows[0].query_result });
      } else {
        return res.status(404).json({ error: 'Indicator not found' });
      }
    } else if (table && column) {
      // Get count of non-null values in column
      const query = `SELECT COUNT("${column}") AS cnt FROM "${table}"`;
      const result = await pool.query(query);
      const value = result.rows[0] && result.rows[0].cnt ? parseInt(result.rows[0].cnt, 10) : 0;
      return res.json({ value });
    } else {
      return res.status(400).json({ error: 'Missing table/column or indicator' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/derived-attribute
// Body: { derived_name, formula, result }
app.post('/api/derived-attribute', async (req, res) => {
  const { derived_name, formula, result } = req.body;
  if (!derived_name || !formula || (typeof result !== 'number' && typeof result !== 'string')) {
    return res.status(400).json({ error: 'Missing derived_name, formula, or result' });
  }
  // Accept result as decimal (string or number)
  let resultVal = result;
  if (typeof result === 'string') {
    resultVal = parseFloat(result);
    if (isNaN(resultVal)) {
      return res.status(400).json({ error: 'Result must be a valid decimal number' });
    }
  }
  try {
    await pool.query(
      'INSERT INTO derived_attributes (derived_name, formula, result) VALUES ($1, $2, $3)',
      [derived_name, formula, resultVal]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/derived-attributes
app.get('/api/derived-attributes', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM derived_attributes ORDER BY created_on DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/table-metadata/:table - columns and types
app.get('/api/table-metadata/:table', async (req, res) => {
  const { table } = req.params;
  try {
    const result = await pool.query(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
      [table]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sample-data/:table?limit=10 - sample rows
app.get('/api/sample-data/:table', async (req, res) => {
  const { table } = req.params;
  const limit = parseInt(req.query.limit, 10) || 10;
  try {
    const result = await pool.query(`SELECT * FROM "${table}" LIMIT $1`, [limit]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/preview-sql - preview SQL query result (limit 20 rows)
app.post('/api/preview-sql', async (req, res) => {
  const { sql } = req.body;
  if (!sql || typeof sql !== 'string' || !sql.trim().toLowerCase().startsWith('select')) {
    return res.status(400).json({ error: 'Only SELECT queries are allowed.' });
  }
  // Force LIMIT 20 for preview
  let previewSql = sql.trim().replace(/;*$/, '');
  if (!/limit\s+\d+/i.test(previewSql)) {
    previewSql += ' LIMIT 20';
  }
  try {
    const result = await pool.query(previewSql);
    res.json({ rows: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/save-dataset - save previewed dataset as new table
// app.post('/api/save-dataset', async (req, res) => {
//   const { sql, tableName } = req.body;
//   if (!sql || typeof sql !== 'string' || !sql.trim().toLowerCase().startsWith('select')) {
//     return res.status(400).json({ error: 'Only SELECT queries are allowed.' });
//   }
//   if (!tableName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
//     return res.status(400).json({ error: 'Invalid table name.' });
//   }
//   try {
//     // Create table as select
//     await pool.query(`CREATE TABLE "${tableName}" AS ${sql.trim().replace(/;*$/, '')}`);
//     // Check if table exists
//     const check = await pool.query(`SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`, [tableName]);
//     if (check.rowCount === 0) {
//       return res.status(404).json({ error: `Table '${tableName}' was not created.` });
//     }
//     res.json({ success: true, message: `Table '${tableName}' created.` });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// --- Indicator Master Endpoints ---
// POST /api/indicator-master
app.post('/api/indicator-master', async (req, res) => {
  const { indicator_name, description, sql_query, created_by } = req.body;
  if (!indicator_name || !sql_query) {
    return res.status(400).json({ error: 'Missing indicator_name or sql_query' });
  }
  try {
    // Run the provided SQL query and expect a single integer result
    const result = await pool.query(sql_query);
    let query_result = null;
    if (result.rows.length > 0) {
      const firstRow = result.rows[0];
      // Try to find the first integer value in the first row, even if it's a string
      for (const v of Object.values(firstRow)) {
        if (typeof v === 'number' && Number.isInteger(v)) {
          query_result = v;
          break;
        }
        if (typeof v === 'string' && /^\d+$/.test(v)) {
          query_result = parseInt(v, 10);
          break;
        }
      }
    }
    // Insert into indicator_master
    await pool.query(
      `INSERT INTO indicator_master (indicator_name, description, sql_query, query_result, created_by) VALUES ($1, $2, $3, $4, $5)`,
      [indicator_name, description, sql_query, query_result, created_by || null]
    );
    res.json({ success: true, query_result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/indicator-master
app.get('/api/indicator-master', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM indicator_master');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Multer setup for file uploads
const upload = multer({ dest: 'uploads/' });

// Endpoint: Get all table names
app.get('/api/tables', async (req, res) => {
  try {
    const result = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
    res.json(result.rows.map(row => row.table_name));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/test-db', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ success: true, message: 'Database connection successful!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint: Get columns for a specific table
app.get('/api/columns/:table', async (req, res) => {
  const { table } = req.params;
  try {
    const result = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
      [table]
    );
    res.json(result.rows.map(row => row.column_name));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint: Get data for selected columns from a table
app.post('/api/data', async (req, res) => {
  const { table, columns } = req.body;
  if (!table || !columns || !Array.isArray(columns) || columns.length === 0) {
    return res.status(400).json({ error: 'Invalid table or columns' });
  }
  try {
    const colString = columns.map(col => `"${col}"`).join(', ');
    const query = `SELECT ${colString} FROM "${table}"`;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint: Upload XLSX and insert data into table
app.post('/api/upload-xlsx', upload.single('file'), async (req, res) => {
  const table = req.body.table;
  if (!req.file || !table) {
    return res.status(400).json({ error: 'Missing file or table name' });
  }
  try {
    // Read and parse the uploaded file
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });
    if (!jsonData.length) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'No data found in the Excel sheet' });
    }
    // Get columns from the first row
    const columns = Object.keys(jsonData[0]);
    // Create table if it doesn't exist
    const colDefs = columns.map(col => `"${col}" TEXT`).join(', ');
    await pool.query(`CREATE TABLE IF NOT EXISTS "${table}" (${colDefs})`);
    // Insert data
    for (const row of jsonData) {
      const values = columns.map(col => row[col]);
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
      await pool.query(
        `INSERT INTO "${table}" (${columns.map(col => `"${col}"`).join(', ')}) VALUES (${placeholders})`,
        values
      );
    }
    fs.unlinkSync(req.file.path);
    res.json({ success: true, message: 'File uploaded and data inserted!' });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint: Grouped count for dynamic charts
app.post('/api/grouped-count', async (req, res) => {
  const { table, xAxis, indicator } = req.body;
  if (!table || !xAxis) {
    return res.status(400).json({ error: 'Missing table or xAxis' });
  }
  try {
    let query;
    if (indicator) {
      query = `
        SELECT "${xAxis}" as xAxisValue, COUNT("${indicator}") as count
        FROM "${table}"
        GROUP BY "${xAxis}"
        ORDER BY xAxisValue
      `;
    } else {
      query = `
        SELECT "${xAxis}" as xAxisValue, COUNT(*) as count
        FROM "${table}"
        GROUP BY "${xAxis}"
        ORDER BY xAxisValue
      `;
    }
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint: Run arbitrary SQL query (for trusted/local dev use only!)

app.post('/api/run-sql', async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'Missing SQL query' });
  try {
    const result = await pool.query(query);
    res.json({ rows: result.rows, fields: result.fields.map(f => f.name) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});



// Endpoint: Get a single dataset master entry by id
app.get('/api/dataset-master/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM dataset_master WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint: List all dataset master entries
app.get('/api/dataset-master', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM dataset_master ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint: Save dataset as new table
app.post('/api/save-dataset', async (req, res) => {
  const { tableName, sql } = req.body;
  if (!tableName || !sql || typeof sql !== 'string' || !sql.trim().toLowerCase().startsWith('select')) {
    return res.status(400).json({ error: 'Invalid tableName or only SELECT queries are allowed.' });
  }
  try {
    // Create table as select
    await pool.query(`CREATE TABLE IF NOT EXISTS dataset_master (
      id SERIAL PRIMARY KEY,
      dataset_name TEXT NOT NULL,
      sql_query TEXT NOT NULL,
      created_on TIMESTAMP DEFAULT NOW(),
      created_by INTEGER
    )`);
    await pool.query(
      `INSERT INTO dataset_master (dataset_name, sql_query, created_by) VALUES ($1, $2, $3)`,
      [tableName, sql, req.user && req.user.id]
    );
    res.json({ success: true, message: `Dataset '${tableName}' created.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
