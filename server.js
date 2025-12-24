/**
 * CAMPOST MANKON - Billing Management System
 * PostgreSQL Database Backend for Render.com
 */

const express = require('express');
const path = require('path');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// PostgreSQL Connection
// Use DATABASE_URL environment variable from Render.com
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

let dbConnected = false;

// Initialize Database Tables
async function initDatabase() {
    try {
        // Create bills table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS bills (
                bill_number VARCHAR(20) PRIMARY KEY,
                quarter VARCHAR(5) NOT NULL,
                year INTEGER NOT NULL,
                period VARCHAR(50) NOT NULL,
                amount_due INTEGER NOT NULL,
                paid_amount INTEGER DEFAULT 0,
                outstanding INTEGER NOT NULL,
                is_new BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create payments table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS payments (
                id SERIAL PRIMARY KEY,
                bill_number VARCHAR(20) REFERENCES bills(bill_number) ON DELETE CASCADE,
                amount INTEGER NOT NULL,
                payment_date DATE NOT NULL,
                reference VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Check if bills table is empty
        const result = await pool.query('SELECT COUNT(*) FROM bills');
        if (parseInt(result.rows[0].count) === 0) {
            await initializeDefaultBills();
        }

        dbConnected = true;
        console.log('✓ Connected to PostgreSQL database');
        console.log('✓ Tables initialized');

    } catch (err) {
        console.error('Database initialization error:', err.message);
        console.log('\n⚠️  Make sure DATABASE_URL environment variable is set in Render.com');
        dbConnected = false;
    }
}

// Initialize default bills (Q1-2022 to Q4-2025)
async function initializeDefaultBills() {
    const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
    const periods = ['January to March', 'April to June', 'July to September', 'October to December'];
    
    let totalPaidRemaining = 3500000;
    const amountDue = 510000;

    console.log('  Initializing default bills...');

    for (let year = 2022; year <= 2025; year++) {
        for (let q = 0; q < 4; q++) {
            const billNumber = `${quarters[q]}-${year}-00${q + 1}`;
            let paidAmount = 0;

            if (totalPaidRemaining >= amountDue) {
                paidAmount = amountDue;
                totalPaidRemaining -= amountDue;
            } else if (totalPaidRemaining > 0) {
                paidAmount = totalPaidRemaining;
                totalPaidRemaining = 0;
            }

            const outstanding = amountDue - paidAmount;

            await pool.query(
                `INSERT INTO bills (bill_number, quarter, year, period, amount_due, paid_amount, outstanding, is_new)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 ON CONFLICT (bill_number) DO NOTHING`,
                [billNumber, quarters[q], year, periods[q], amountDue, paidAmount, outstanding, false]
            );
        }
    }
    console.log('  ✓ Initialized 16 default bills (Q1-2022 to Q4-2025)');
}

// ============== API ROUTES ==============

// Get all bills
app.get('/api/bills', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM bills ORDER BY year, quarter'
        );
        const bills = result.rows.map(row => ({
            billNumber: row.bill_number,
            quarter: row.quarter,
            year: row.year,
            period: row.period,
            amountDue: row.amount_due,
            paidAmount: row.paid_amount,
            outstanding: row.outstanding,
            isNew: row.is_new,
            createdAt: row.created_at
        }));
        res.json(bills);
    } catch (err) {
        console.error('Error getting bills:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Get single bill
app.get('/api/bills/:billNumber', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM bills WHERE bill_number = $1',
            [req.params.billNumber]
        );
        if (result.rows.length > 0) {
            const row = result.rows[0];
            res.json({
                billNumber: row.bill_number,
                quarter: row.quarter,
                year: row.year,
                period: row.period,
                amountDue: row.amount_due,
                paidAmount: row.paid_amount,
                outstanding: row.outstanding,
                isNew: row.is_new,
                createdAt: row.created_at
            });
        } else {
            res.status(404).json({ error: 'Bill not found' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create new bill
app.post('/api/bills', async (req, res) => {
    try {
        const { billNumber, quarter, year, period, amountDue, paidAmount, outstanding, isNew } = req.body;
        
        await pool.query(
            `INSERT INTO bills (bill_number, quarter, year, period, amount_due, paid_amount, outstanding, is_new)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [billNumber, quarter, year, period, amountDue, paidAmount || 0, outstanding, isNew || false]
        );
        
        res.json({ success: true, billNumber });
    } catch (err) {
        console.error('Error creating bill:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Update bill
app.put('/api/bills/:billNumber', async (req, res) => {
    try {
        const { paidAmount, outstanding } = req.body;
        
        await pool.query(
            'UPDATE bills SET paid_amount = $1, outstanding = $2 WHERE bill_number = $3',
            [paidAmount, outstanding, req.params.billNumber]
        );
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete bill
app.delete('/api/bills/:billNumber', async (req, res) => {
    try {
        await pool.query('DELETE FROM bills WHERE bill_number = $1', [req.params.billNumber]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all payments
app.get('/api/payments', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM payments ORDER BY created_at DESC'
        );
        const payments = result.rows.map(row => ({
            id: row.id,
            billNumber: row.bill_number,
            amount: row.amount,
            date: row.payment_date,
            reference: row.reference,
            createdAt: row.created_at
        }));
        res.json(payments);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Record payment
app.post('/api/payments', async (req, res) => {
    const client = await pool.connect();
    try {
        const { billNumber, amount, date, reference } = req.body;
        
        await client.query('BEGIN');
        
        // Insert payment
        await client.query(
            'INSERT INTO payments (bill_number, amount, payment_date, reference) VALUES ($1, $2, $3, $4)',
            [billNumber, amount, date, reference || '']
        );
        
        // Update bill
        await client.query(
            `UPDATE bills 
             SET paid_amount = paid_amount + $1, 
                 outstanding = amount_due - (paid_amount + $1)
             WHERE bill_number = $2`,
            [amount, billNumber]
        );
        
        await client.query('COMMIT');
        res.json({ success: true });
        
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error recording payment:', err.message);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// Get statistics
app.get('/api/stats', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                COUNT(*) as total_bills,
                COALESCE(SUM(amount_due), 0) as total_due,
                COALESCE(SUM(paid_amount), 0) as total_paid,
                COALESCE(SUM(outstanding), 0) as total_outstanding
            FROM bills
        `);
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Reset data
app.post('/api/reset', async (req, res) => {
    try {
        await pool.query('DELETE FROM payments');
        await pool.query('DELETE FROM bills');
        await initializeDefaultBills();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Database status
app.get('/api/status', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({
            connected: true,
            type: 'postgresql',
            path: 'Render.com PostgreSQL'
        });
    } catch (err) {
        res.json({
            connected: false,
            type: 'postgresql',
            error: err.message
        });
    }
});

// Serve main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check for Render.com
app.get('/health', (req, res) => {
    res.json({ status: 'ok', database: dbConnected });
});

// Start server
initDatabase().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║   CAMPOST MANKON - Billing Management System                   ║
║                                                                ║
║   Server running on port ${PORT}                                 ║
║   Database: PostgreSQL                                         ║
║   Status: ${dbConnected ? 'CONNECTED ✓' : 'NOT CONNECTED ✗'}                                      ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
        `);
    });
});
