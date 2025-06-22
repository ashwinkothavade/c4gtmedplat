const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const multer = require('multer');
const XLSX = require('xlsx');
const fs = require('fs');

const app = express();
const port = 5000;

require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

app.use(cors());
app.use(express.json());

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
  if (!table || !xAxis || !indicator) {
    return res.status(400).json({ error: 'Missing table, xAxis, or indicator' });
  }
  try {
    // Count the number of rows grouped by xAxis where indicator is not null or empty
    const query = `
      SELECT "${xAxis}" as xAxisValue, COUNT("${indicator}") as count
      FROM "${table}"
      WHERE "${indicator}" IS NOT NULL AND "${indicator}" != ''
      GROUP BY "${xAxis}"
      ORDER BY xAxisValue
    `;
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
