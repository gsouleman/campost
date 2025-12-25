/**
 * CAMPOST MANKON - Property & Billing Management System
 * PostgreSQL Database Backend for Render.com
 * Full CRUD operations for Bills and Payments
 */

const express = require('express');
const path = require('path');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

let dbConnected = false;

async function initDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS categories (
                id SERIAL PRIMARY KEY,
                name VARCHAR(50) UNIQUE NOT NULL,
                type VARCHAR(20) NOT NULL CHECK (type IN ('income', 'expense'))
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS expenses (
                id SERIAL PRIMARY KEY,
                expense_date DATE NOT NULL,
                description TEXT NOT NULL,
                category_id INTEGER REFERENCES categories(id),
                amount INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS heirs (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                relationship VARCHAR(50) NOT NULL,
                heir_group VARCHAR(50) NOT NULL,
                portions NUMERIC(10,2) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

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

        await initializeDefaultData();
        dbConnected = true;
        console.log('✓ Connected to PostgreSQL database');

    } catch (err) {
        console.error('Database initialization error:', err.message);
        dbConnected = false;
    }
}

async function initializeDefaultData() {
    const catResult = await pool.query('SELECT COUNT(*) FROM categories');
    if (parseInt(catResult.rows[0].count) === 0) {
        const categories = [
            ['Agent Fees', 'expense'],
            ['Maintenance', 'expense'],
            ['Transportation', 'expense'],
            ['Others', 'expense'],
            ['Inheritance Share', 'expense']
        ];
        for (const [name, type] of categories) {
            await pool.query('INSERT INTO categories (name, type) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING', [name, type]);
        }
    }

    const expResult = await pool.query('SELECT COUNT(*) FROM expenses');
    if (parseInt(expResult.rows[0].count) === 0) {
        const cats = await pool.query('SELECT id, name FROM categories');
        const catMap = {};
        cats.rows.forEach(c => catMap[c.name] = c.id);

        const expenses = [
            ['2024-10-01', 'Management Fee to Rental Agency Agent', 'Agent Fees', 150000],
            ['2024-10-10', 'Repair of HVAC in Common Area (Inv #7891)', 'Maintenance', 345000],
            ['2024-10-16', 'Fuel & Transport for Property Inspection', 'Transportation', 90000],
            ['2024-10-18', 'Purchase of Office Supplies (Bulbs, Cleaners)', 'Others', 51300],
            ['2024-10-22', 'Quarterly Pest Control Service (Inv #4567)', 'Maintenance', 180000],
            ['2024-10-25', 'Bank Fee for Cash Deposit Processing', 'Others', 27150],
            ['2024-10-28', 'Allocation of Net Profit to Islamic Inheritance', 'Inheritance Share', 456550]
        ];
        for (const [date, desc, cat, amount] of expenses) {
            await pool.query(
                'INSERT INTO expenses (expense_date, description, category_id, amount) VALUES ($1, $2, $3, $4)',
                [date, desc, catMap[cat], amount]
            );
        }
    }

    const heirResult = await pool.query('SELECT COUNT(*) FROM heirs');
    if (parseInt(heirResult.rows[0].count) === 0) {
        const heirs = [
            ['Wife 1', 'Spouse', 'Wives', 1.5],
            ['Wife 2', 'Spouse', 'Wives', 1.5],
            ['Daughter 1', 'Child', 'Daughters', 3],
            ['Daughter 2', 'Child', 'Daughters', 3],
            ['Daughter 3', 'Child', 'Daughters', 3],
            ['Daughter 4', 'Child', 'Daughters', 3],
            ['Daughter 5', 'Child', 'Daughters', 3],
            ['Daughter 6', 'Child', 'Daughters', 3],
            ['Daughter 7', 'Child', 'Daughters', 3],
            ['Son 1', 'Child', 'Sons', 6],
            ['Son 2', 'Child', 'Sons', 6],
            ['Son 3', 'Child', 'Sons', 6],
            ['Son 4', 'Child', 'Sons', 6],
            ['Son 5', 'Child', 'Sons', 6],
            ['Son 6', 'Child', 'Sons', 6],
            ['Son 7', 'Child', 'Sons', 6]
        ];
        for (const [name, rel, group, portions] of heirs) {
            await pool.query(
                'INSERT INTO heirs (name, relationship, heir_group, portions) VALUES ($1, $2, $3, $4)',
                [name, rel, group, portions]
            );
        }
    }

    const billResult = await pool.query('SELECT COUNT(*) FROM bills');
    if (parseInt(billResult.rows[0].count) === 0) {
        await initializeDefaultBills();
    }
}

async function initializeDefaultBills() {
    const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
    const periods = ['January to March', 'April to June', 'July to September', 'October to December'];
    let remaining = 3500000;
    const amt = 510000;

    for (let year = 2022; year <= 2025; year++) {
        for (let q = 0; q < 4; q++) {
            const billNumber = `${quarters[q]}-${year}-00${q + 1}`;
            let paid = 0;
            if (remaining >= amt) { paid = amt; remaining -= amt; }
            else if (remaining > 0) { paid = remaining; remaining = 0; }

            await pool.query(
                `INSERT INTO bills (bill_number, quarter, year, period, amount_due, paid_amount, outstanding, is_new)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (bill_number) DO NOTHING`,
                [billNumber, quarters[q], year, periods[q], amt, paid, amt - paid, false]
            );

            if (paid > 0) {
                const paymentDate = `${year}-${String((q * 3) + 2).padStart(2, '0')}-15`;
                await pool.query(
                    `INSERT INTO payments (bill_number, amount, payment_date, reference)
                     VALUES ($1, $2, $3, $4)`,
                    [billNumber, paid, paymentDate, `Payment for ${billNumber}`]
                );
            }
        }
    }
}

// ============== CATEGORIES API ==============
app.get('/api/categories', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM categories ORDER BY name');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============== EXPENSES API ==============
app.get('/api/expenses', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT e.*, c.name as category_name
            FROM expenses e LEFT JOIN categories c ON e.category_id = c.id
            ORDER BY e.expense_date DESC
        `);
        res.json(result.rows.map(r => ({
            id: r.id, date: r.expense_date, description: r.description,
            categoryId: r.category_id, categoryName: r.category_name, amount: r.amount
        })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/expenses', async (req, res) => {
    try {
        const { date, description, categoryId, amount } = req.body;
        const result = await pool.query(
            `INSERT INTO expenses (expense_date, description, category_id, amount) VALUES ($1, $2, $3, $4) RETURNING *`,
            [date, description, categoryId, Math.abs(amount)]
        );
        res.json({ success: true, id: result.rows[0].id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/expenses/:id', async (req, res) => {
    try {
        const { date, description, categoryId, amount } = req.body;
        await pool.query(
            'UPDATE expenses SET expense_date = $1, description = $2, category_id = $3, amount = $4 WHERE id = $5',
            [date, description, categoryId, Math.abs(amount), req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/expenses/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM expenses WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============== LEDGER API ==============
app.get('/api/ledger', async (req, res) => {
    try {
        const payments = await pool.query(`
            SELECT p.id, p.payment_date as date,
                CONCAT('Rental Payment - ', p.bill_number, ' (', b.period, ' ', b.year, ')') as description,
                'Rental Income' as category_name, p.amount, 'Income' as type
            FROM payments p JOIN bills b ON p.bill_number = b.bill_number
            ORDER BY p.payment_date DESC
        `);

        const expenses = await pool.query(`
            SELECT e.id, e.expense_date as date, e.description,
                c.name as category_name, e.amount, 'Expense' as type
            FROM expenses e LEFT JOIN categories c ON e.category_id = c.id
            ORDER BY e.expense_date DESC
        `);

        const ledger = [
            ...payments.rows.map(p => ({ ...p, amount: parseInt(p.amount), source: 'payment' })),
            ...expenses.rows.map(e => ({ ...e, amount: -parseInt(e.amount), source: 'expense' }))
        ].sort((a, b) => new Date(b.date) - new Date(a.date));

        res.json(ledger);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============== SUMMARY API ==============
app.get('/api/summary', async (req, res) => {
    try {
        const incomeResult = await pool.query('SELECT COALESCE(SUM(amount), 0) as total FROM payments');
        const totalBillsPaid = parseInt(incomeResult.rows[0].total);

        const totalExpensesResult = await pool.query('SELECT COALESCE(SUM(amount), 0) as total FROM expenses');
        const totalExpenses = parseInt(totalExpensesResult.rows[0].total);

        const expensesByCat = await pool.query(`
            SELECT c.name, COALESCE(SUM(e.amount), 0) as total
            FROM categories c LEFT JOIN expenses e ON c.id = e.category_id
            GROUP BY c.id, c.name ORDER BY c.name
        `);

        const inheritanceResult = await pool.query(`
            SELECT COALESCE(SUM(e.amount), 0) as total
            FROM expenses e JOIN categories c ON e.category_id = c.id
            WHERE c.name = 'Inheritance Share'
        `);
        const inheritanceAmount = parseInt(inheritanceResult.rows[0].total);

        const reserveFunds = totalBillsPaid - totalExpenses;

        res.json({
            totalBillsPaid, totalExpenses, reserveFunds, inheritanceAmount,
            expensesByCategory: expensesByCat.rows.map(r => ({ name: r.name, total: parseInt(r.total) }))
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============== HEIRS API ==============
app.get('/api/heirs', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM heirs ORDER BY heir_group, name');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/heirs', async (req, res) => {
    try {
        const { name, relationship, heirGroup, portions } = req.body;
        const result = await pool.query(
            'INSERT INTO heirs (name, relationship, heir_group, portions) VALUES ($1, $2, $3, $4) RETURNING *',
            [name, relationship, heirGroup, portions]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/heirs/:id', async (req, res) => {
    try {
        const { name, relationship, heirGroup, portions } = req.body;
        await pool.query(
            'UPDATE heirs SET name = $1, relationship = $2, heir_group = $3, portions = $4 WHERE id = $5',
            [name, relationship, heirGroup, portions, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/heirs/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM heirs WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============== INHERITANCE API ==============
app.get('/api/inheritance/calculate', async (req, res) => {
    try {
        const incomeResult = await pool.query('SELECT COALESCE(SUM(amount), 0) as total FROM payments');
        const totalBillsPaid = parseInt(incomeResult.rows[0].total);

        const expensesResult = await pool.query('SELECT COALESCE(SUM(amount), 0) as total FROM expenses');
        const totalExpenses = parseInt(expensesResult.rows[0].total);

        const reserveFunds = totalBillsPaid - totalExpenses;

        const inheritanceResult = await pool.query(`
            SELECT COALESCE(SUM(e.amount), 0) as total
            FROM expenses e JOIN categories c ON e.category_id = c.id
            WHERE c.name = 'Inheritance Share'
        `);
        const inheritanceAmount = parseInt(inheritanceResult.rows[0].total);

        const totalPortionsResult = await pool.query('SELECT SUM(portions) as total FROM heirs');
        const totalPortions = parseFloat(totalPortionsResult.rows[0].total) || 24;

        const sharePerPortion = inheritanceAmount > 0 ? inheritanceAmount / totalPortions : 0;

        const individualHeirs = await pool.query('SELECT * FROM heirs ORDER BY heir_group, name');
        const heirShares = individualHeirs.rows.map(h => ({
            ...h,
            shareAmount: Math.round(sharePerPortion * parseFloat(h.portions) * 100) / 100
        }));

        const groupSummary = {};
        heirShares.forEach(h => {
            if (!groupSummary[h.heir_group]) {
                groupSummary[h.heir_group] = { count: 0, totalShare: 0, portions: parseFloat(h.portions) };
            }
            groupSummary[h.heir_group].count++;
            groupSummary[h.heir_group].totalShare += h.shareAmount;
        });

        res.json({
            totalBillsPaid, totalExpenses, reserveFunds, inheritanceAmount,
            totalPortions, sharePerPortion: Math.round(sharePerPortion * 100) / 100,
            heirs: heirShares, groupSummary
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============== BILLS API (Full CRUD) ==============
app.get('/api/bills', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM bills ORDER BY year, quarter');
        res.json(result.rows.map(row => ({
            billNumber: row.bill_number, quarter: row.quarter, year: row.year,
            period: row.period, amountDue: row.amount_due, paidAmount: row.paid_amount,
            outstanding: row.outstanding, isNew: row.is_new, createdAt: row.created_at
        })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/bills/:billNumber', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM bills WHERE bill_number = $1', [req.params.billNumber]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Bill not found' });
        const row = result.rows[0];
        
        // Get payments for this bill
        const payments = await pool.query(
            'SELECT * FROM payments WHERE bill_number = $1 ORDER BY payment_date DESC',
            [req.params.billNumber]
        );
        
        res.json({
            billNumber: row.bill_number, quarter: row.quarter, year: row.year,
            period: row.period, amountDue: row.amount_due, paidAmount: row.paid_amount,
            outstanding: row.outstanding, isNew: row.is_new, createdAt: row.created_at,
            payments: payments.rows.map(p => ({
                id: p.id, amount: p.amount, date: p.payment_date, reference: p.reference
            }))
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/bills/:billNumber', async (req, res) => {
    try {
        const { quarter, year, period, amountDue } = req.body;
        // Recalculate outstanding based on current paid amount
        const current = await pool.query('SELECT paid_amount FROM bills WHERE bill_number = $1', [req.params.billNumber]);
        const paidAmount = current.rows[0]?.paid_amount || 0;
        const outstanding = amountDue - paidAmount;
        
        await pool.query(
            'UPDATE bills SET quarter = $1, year = $2, period = $3, amount_due = $4, outstanding = $5 WHERE bill_number = $6',
            [quarter, year, period, amountDue, outstanding, req.params.billNumber]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/bills/:billNumber', async (req, res) => {
    try {
        await pool.query('DELETE FROM bills WHERE bill_number = $1', [req.params.billNumber]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============== PAYMENTS API (Full CRUD) ==============
app.get('/api/payments', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.*, b.period, b.year 
            FROM payments p JOIN bills b ON p.bill_number = b.bill_number
            ORDER BY p.payment_date DESC
        `);
        res.json(result.rows.map(row => ({
            id: row.id, billNumber: row.bill_number, amount: row.amount,
            date: row.payment_date, reference: row.reference,
            period: row.period, year: row.year
        })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/payments/:id', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.*, b.period, b.year 
            FROM payments p JOIN bills b ON p.bill_number = b.bill_number
            WHERE p.id = $1
        `, [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Payment not found' });
        const row = result.rows[0];
        res.json({
            id: row.id, billNumber: row.bill_number, amount: row.amount,
            date: row.payment_date, reference: row.reference,
            period: row.period, year: row.year
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/payments', async (req, res) => {
    const client = await pool.connect();
    try {
        const { billNumber, amount, date, reference } = req.body;
        await client.query('BEGIN');
        const result = await client.query(
            'INSERT INTO payments (bill_number, amount, payment_date, reference) VALUES ($1, $2, $3, $4) RETURNING id',
            [billNumber, amount, date, reference || '']
        );
        await client.query(
            `UPDATE bills SET paid_amount = paid_amount + $1, outstanding = amount_due - (paid_amount + $1) WHERE bill_number = $2`,
            [amount, billNumber]
        );
        await client.query('COMMIT');
        res.json({ success: true, id: result.rows[0].id });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

app.put('/api/payments/:id', async (req, res) => {
    const client = await pool.connect();
    try {
        const { amount, date, reference } = req.body;
        await client.query('BEGIN');
        
        // Get old payment amount
        const oldPayment = await client.query('SELECT amount, bill_number FROM payments WHERE id = $1', [req.params.id]);
        if (oldPayment.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Payment not found' });
        }
        const oldAmount = oldPayment.rows[0].amount;
        const billNumber = oldPayment.rows[0].bill_number;
        const diff = amount - oldAmount;
        
        // Update payment
        await client.query(
            'UPDATE payments SET amount = $1, payment_date = $2, reference = $3 WHERE id = $4',
            [amount, date, reference || '', req.params.id]
        );
        
        // Update bill totals
        await client.query(
            `UPDATE bills SET paid_amount = paid_amount + $1, outstanding = outstanding - $1 WHERE bill_number = $2`,
            [diff, billNumber]
        );
        
        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

app.delete('/api/payments/:id', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Get payment details
        const payment = await client.query('SELECT amount, bill_number FROM payments WHERE id = $1', [req.params.id]);
        if (payment.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Payment not found' });
        }
        const { amount, bill_number } = payment.rows[0];
        
        // Delete payment
        await client.query('DELETE FROM payments WHERE id = $1', [req.params.id]);
        
        // Update bill totals
        await client.query(
            `UPDATE bills SET paid_amount = paid_amount - $1, outstanding = outstanding + $1 WHERE bill_number = $2`,
            [amount, bill_number]
        );
        
        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// ============== EXPORT ALL DATA ==============
app.get('/api/export/all', async (req, res) => {
    try {
        const bills = await pool.query('SELECT * FROM bills ORDER BY year, quarter');
        const payments = await pool.query(`
            SELECT p.*, b.period, b.year FROM payments p 
            JOIN bills b ON p.bill_number = b.bill_number ORDER BY p.payment_date DESC
        `);
        const expenses = await pool.query(`
            SELECT e.*, c.name as category_name FROM expenses e 
            LEFT JOIN categories c ON e.category_id = c.id ORDER BY e.expense_date DESC
        `);
        const heirs = await pool.query('SELECT * FROM heirs ORDER BY heir_group, name');
        const summary = await pool.query('SELECT COALESCE(SUM(amount), 0) as total_paid FROM payments');
        const expTotal = await pool.query('SELECT COALESCE(SUM(amount), 0) as total FROM expenses');
        
        res.json({
            bills: bills.rows,
            payments: payments.rows,
            expenses: expenses.rows,
            heirs: heirs.rows,
            summary: {
                totalBillsPaid: parseInt(summary.rows[0].total_paid),
                totalExpenses: parseInt(expTotal.rows[0].total),
                reserveFunds: parseInt(summary.rows[0].total_paid) - parseInt(expTotal.rows[0].total)
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============== RESET & STATUS ==============
app.post('/api/reset', async (req, res) => {
    try {
        await pool.query('DELETE FROM payments');
        await pool.query('DELETE FROM expenses');
        await pool.query('DELETE FROM bills');
        await pool.query('DELETE FROM heirs');
        await pool.query('DELETE FROM categories');
        await initializeDefaultData();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/status', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ connected: true, type: 'postgresql' });
    } catch (err) {
        res.json({ connected: false, type: 'postgresql', error: err.message });
    }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/health', (req, res) => res.json({ status: 'ok', database: dbConnected }));

initDatabase().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`\n✓ CAMPOST Server running on port ${PORT}\n`);
    });
});
