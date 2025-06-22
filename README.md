# Dynamic Data Visualization Dashboard

A full-stack web application for dynamic data visualization, charting, and Excel data upload using React, Node.js/Express, and PostgreSQL.

## Features

- **Connect to PostgreSQL**: Configure your DB credentials in a `.env` file.
- **Upload Excel Files**: Upload `.xlsx` files to create or update tables in your database.
- **Visualize Data**: Select a table and columns to plot Bar, Line, Pie, Histogram, or Heatmap charts.
- **Run Custom SQL**: Enter and execute any SQL query and view the results in a table.
- **Modern UI**: Responsive, card-based dashboard with easy navigation.

## Project Structure

```
medplat/
├── client/         # React frontend
├── server/         # Node.js/Express backend
├── .env            # Environment variables (DB credentials)
├── .gitignore      # Git ignore rules
└── README.md       # This file
```

## Getting Started

### 1. Prerequisites
- Node.js (v14+ recommended)
- npm or yarn
- PostgreSQL (running locally or remotely)

### 2. Backend Setup
1. `cd server`
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file in the root project directory (see below).
4. Start the backend server:
   ```
   node index.js
   ```

### 3. Frontend Setup
1. `cd client`
2. Install dependencies:
   ```
   npm install
   ```
3. Start the React app:
   ```
   npm start
   ```

### 4. Environment Variables
Create a `.env` file in the project root with:
```
DB_USER=your_db_username
DB_PASSWORD=your_db_password
DB_NAME=medplat
DB_HOST=localhost
DB_PORT=5432
```

### 5. Usage
- **Upload Data**: Go to "Upload Data" and upload your `.xlsx` file to any table.
- **Visualize Data**: Go to "Visualize Data", select a table and columns, and choose a chart type (Bar, Line, Pie, Histogram, Heatmap).
- **Run SQL**: Go to "Run SQL" and enter any SQL query to view the results.

## Security Warning
- The `/api/run-sql` endpoint allows arbitrary SQL execution. **Do not expose this app to untrusted users or the public internet without removing or securing this feature!**
- Never commit your `.env` file with real credentials to version control.

## License
MIT
