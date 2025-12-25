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

        await pool.query(`
            CREATE TABLE IF NOT EXISTS properties (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                location VARCHAR(255) NOT NULL,
                type VARCHAR(50) NOT NULL,
                status VARCHAR(50) NOT NULL,
                rent_amount NUMERIC(12,2) DEFAULT 0,
                rent_period VARCHAR(20) DEFAULT 'Monthly',
                tax_rate NUMERIC(5,2) DEFAULT 15,
                islamic_inheritance VARCHAR(10) DEFAULT 'Yes',
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // ==================== FAMILY REAL ESTATES TABLES ====================
        
        // RE Heirs (separate from CAMPOST heirs)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS re_heirs (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                relationship VARCHAR(50) NOT NULL,
                gender VARCHAR(20) NOT NULL,
                heir_group VARCHAR(50) NOT NULL,
                portions NUMERIC(10,3) NOT NULL,
                is_beneficiary BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // RE Bills
        await pool.query(`
            CREATE TABLE IF NOT EXISTS re_bills (
                id SERIAL PRIMARY KEY,
                property_id INTEGER REFERENCES properties(id) ON DELETE CASCADE,
                tenant_name VARCHAR(255) NOT NULL,
                bill_date DATE NOT NULL,
                due_date DATE NOT NULL,
                amount NUMERIC(12,2) NOT NULL,
                status VARCHAR(20) DEFAULT 'Unpaid',
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // RE Payments
        await pool.query(`
            CREATE TABLE IF NOT EXISTS re_payments (
                id SERIAL PRIMARY KEY,
                bill_id INTEGER REFERENCES re_bills(id) ON DELETE CASCADE,
                amount NUMERIC(12,2) NOT NULL,
                payment_date DATE NOT NULL,
                payment_method VARCHAR(50) DEFAULT 'Cash',
                reference VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // RE Expenses
        await pool.query(`
            CREATE TABLE IF NOT EXISTS re_expenses (
                id SERIAL PRIMARY KEY,
                property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
                expense_date DATE NOT NULL,
                description TEXT NOT NULL,
                category VARCHAR(50) NOT NULL,
                amount NUMERIC(12,2) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // RE Settings
        await pool.query(`
            CREATE TABLE IF NOT EXISTS re_settings (
                id SERIAL PRIMARY KEY,
                setting_key VARCHAR(50) UNIQUE NOT NULL,
                setting_value TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // CAMPOST Settings
        await pool.query(`
            CREATE TABLE IF NOT EXISTS campost_settings (
                id SERIAL PRIMARY KEY,
                setting_key VARCHAR(50) UNIQUE NOT NULL,
                setting_value TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Users table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS app_users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                full_name VARCHAR(100) NOT NULL,
                role VARCHAR(20) DEFAULT 'user',
                active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // CAMPOST Beneficiaries selection
        await pool.query(`
            CREATE TABLE IF NOT EXISTS campost_beneficiaries (
                id SERIAL PRIMARY KEY,
                heir_id INTEGER REFERENCES heirs(id) ON DELETE CASCADE,
                is_selected BOOLEAN DEFAULT TRUE,
                UNIQUE(heir_id)
            )
        `);
        
        // RE Beneficiaries selection
        await pool.query(`
            CREATE TABLE IF NOT EXISTS re_beneficiaries (
                id SERIAL PRIMARY KEY,
                heir_id INTEGER REFERENCES re_heirs(id) ON DELETE CASCADE,
                is_selected BOOLEAN DEFAULT TRUE,
                UNIQUE(heir_id)
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
        // Family members from NJIKAM SALIFU estate
        const heirs = [
            ['MODER PASMA IDRISU EPSE SALIFOU', 'Spouse', 'Wives', 3],
            ['MENJIKOUE ABIBA SPOUSE NJIKAM', 'Spouse', 'Wives', 3],
            ['SAHNATU SALIFU', 'Child', 'Daughters', 1],
            ['MOHAMAN SALIFU', 'Child', 'Sons', 2],
            ['ABIBATU SALIFU', 'Child', 'Daughters', 1],
            ['ZAKARE SALIFU', 'Child', 'Sons', 2],
            ['FERER ALIMATU SALIFU', 'Child', 'Daughters', 1],
            ['NTENTIE REKIATU NJIKAM', 'Child', 'Daughters', 1],
            ['KAHPUI MARIAMA SALIFU', 'Child', 'Daughters', 1],
            ['GHOUENZEN SOULEMANOU', 'Child', 'Sons', 2],
            ['NGAMENPOUYE MAIMUNATE', 'Child', 'Daughters', 1],
            ['LOUMNGAM NCHINTOUO AMINATOUO', 'Child', 'Daughters', 1],
            ['MENTCHA ABOUBAKAR SALIFOU', 'Child', 'Sons', 2],
            ['HAROUNA SALIFU', 'Child', 'Sons', 2],
            ['MBALLEY ABDOU RAHAMA SALIFOU', 'Child', 'Sons', 2],
            ['NGAMDAMOUN IBRAHIM SALIFOU', 'Child', 'Sons', 2]
        ];
        for (const [name, rel, group, portions] of heirs) {
            await pool.query(
                'INSERT INTO heirs (name, relationship, heir_group, portions) VALUES ($1, $2, $3, $4)',
                [name, rel, group, portions]
            );
        }
    }

    // Initialize RE Heirs (same family members)
    const reHeirResult = await pool.query('SELECT COUNT(*) FROM re_heirs');
    if (parseInt(reHeirResult.rows[0].count) === 0) {
        const reHeirs = [
            ['MODER PASMA IDRISU EPSE SALIFOU', 'Spouse', 'Female', 'Wives', 3],
            ['MENJIKOUE ABIBA SPOUSE NJIKAM', 'Spouse', 'Female', 'Wives', 3],
            ['SAHNATU SALIFU', 'Child', 'Female', 'Daughters', 1],
            ['MOHAMAN SALIFU', 'Child', 'Male', 'Sons', 2],
            ['ABIBATU SALIFU', 'Child', 'Female', 'Daughters', 1],
            ['ZAKARE SALIFU', 'Child', 'Male', 'Sons', 2],
            ['FERER ALIMATU SALIFU', 'Child', 'Female', 'Daughters', 1],
            ['NTENTIE REKIATU NJIKAM', 'Child', 'Female', 'Daughters', 1],
            ['KAHPUI MARIAMA SALIFU', 'Child', 'Female', 'Daughters', 1],
            ['GHOUENZEN SOULEMANOU', 'Child', 'Male', 'Sons', 2],
            ['NGAMENPOUYE MAIMUNATE', 'Child', 'Female', 'Daughters', 1],
            ['LOUMNGAM NCHINTOUO AMINATOUO', 'Child', 'Female', 'Daughters', 1],
            ['MENTCHA ABOUBAKAR SALIFOU', 'Child', 'Male', 'Sons', 2],
            ['HAROUNA SALIFU', 'Child', 'Male', 'Sons', 2],
            ['MBALLEY ABDOU RAHAMA SALIFOU', 'Child', 'Male', 'Sons', 2],
            ['NGAMDAMOUN IBRAHIM SALIFOU', 'Child', 'Male', 'Sons', 2]
        ];
        for (const [name, rel, gender, group, portions] of reHeirs) {
            await pool.query(
                'INSERT INTO re_heirs (name, relationship, gender, heir_group, portions) VALUES ($1, $2, $3, $4, $5)',
                [name, rel, gender, group, portions]
            );
        }
    }
    
    // Initialize default users
    const userResult = await pool.query('SELECT COUNT(*) FROM app_users');
    if (parseInt(userResult.rows[0].count) === 0) {
        await pool.query(
            'INSERT INTO app_users (username, password, full_name, role, active) VALUES ($1, $2, $3, $4, $5)',
            ['admin', '12345', 'Administrator', 'admin', true]
        );
        await pool.query(
            'INSERT INTO app_users (username, password, full_name, role, active) VALUES ($1, $2, $3, $4, $5)',
            ['user', 'user123', 'Standard User', 'user', true]
        );
    }
    
    // Initialize default settings
    const settingsResult = await pool.query('SELECT COUNT(*) FROM re_settings');
    if (parseInt(settingsResult.rows[0].count) === 0) {
        await pool.query("INSERT INTO re_settings (setting_key, setting_value) VALUES ('currency', 'XAF') ON CONFLICT (setting_key) DO NOTHING");
        await pool.query("INSERT INTO re_settings (setting_key, setting_value) VALUES ('reservedFundsPercent', '10') ON CONFLICT (setting_key) DO NOTHING");
    }
    
    const campostSettingsResult = await pool.query('SELECT COUNT(*) FROM campost_settings');
    if (parseInt(campostSettingsResult.rows[0].count) === 0) {
        await pool.query("INSERT INTO campost_settings (setting_key, setting_value) VALUES ('currency', 'XAF') ON CONFLICT (setting_key) DO NOTHING");
        await pool.query("INSERT INTO campost_settings (setting_key, setting_value) VALUES ('reservedFundsPercent', '10') ON CONFLICT (setting_key) DO NOTHING");
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

// Reset heirs to default family members
app.post('/api/heirs/reset-defaults', async (req, res) => {
    try {
        // Delete all existing heirs
        await pool.query('DELETE FROM heirs');
        
        // Insert default family members from NJIKAM SALIFU estate
        const heirs = [
            ['MODER PASMA IDRISU EPSE SALIFOU', 'Spouse', 'Wives', 3],
            ['MENJIKOUE ABIBA SPOUSE NJIKAM', 'Spouse', 'Wives', 3],
            ['SAHNATU SALIFU', 'Child', 'Daughters', 1],
            ['MOHAMAN SALIFU', 'Child', 'Sons', 2],
            ['ABIBATU SALIFU', 'Child', 'Daughters', 1],
            ['ZAKARE SALIFU', 'Child', 'Sons', 2],
            ['FERER ALIMATU SALIFU', 'Child', 'Daughters', 1],
            ['NTENTIE REKIATU NJIKAM', 'Child', 'Daughters', 1],
            ['KAHPUI MARIAMA SALIFU', 'Child', 'Daughters', 1],
            ['GHOUENZEN SOULEMANOU', 'Child', 'Sons', 2],
            ['NGAMENPOUYE MAIMUNATE', 'Child', 'Daughters', 1],
            ['LOUMNGAM NCHINTOUO AMINATOUO', 'Child', 'Daughters', 1],
            ['MENTCHA ABOUBAKAR SALIFOU', 'Child', 'Sons', 2],
            ['HAROUNA SALIFU', 'Child', 'Sons', 2],
            ['MBALLEY ABDOU RAHAMA SALIFOU', 'Child', 'Sons', 2],
            ['NGAMDAMOUN IBRAHIM SALIFOU', 'Child', 'Sons', 2]
        ];
        
        for (const [name, rel, group, portions] of heirs) {
            await pool.query(
                'INSERT INTO heirs (name, relationship, heir_group, portions) VALUES ($1, $2, $3, $4)',
                [name, rel, group, portions]
            );
        }
        
        res.json({ success: true, message: 'Heirs reset to default family members', count: heirs.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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

// ==========================================
// PROPERTIES API ENDPOINTS
// ==========================================

// Get all properties
app.get('/api/properties', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM properties ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get single property
app.get('/api/properties/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM properties WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Property not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create property
app.post('/api/properties', async (req, res) => {
    const { name, location, type, status, rent_amount, rent_period, tax_rate, islamic_inheritance, notes } = req.body;
    
    // If not rented, income is zero
    const actualRentAmount = status === 'Rented' ? (rent_amount || 0) : 0;
    
    try {
        const result = await pool.query(
            `INSERT INTO properties (name, location, type, status, rent_amount, rent_period, tax_rate, islamic_inheritance, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [name, location, type, status, actualRentAmount, rent_period || 'Monthly', tax_rate || 15, islamic_inheritance || 'Yes', notes]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update property
app.put('/api/properties/:id', async (req, res) => {
    const { name, location, type, status, rent_amount, rent_period, tax_rate, islamic_inheritance, notes } = req.body;
    
    // If not rented, income is zero
    const actualRentAmount = status === 'Rented' ? (rent_amount || 0) : 0;
    
    try {
        const result = await pool.query(
            `UPDATE properties SET 
                name = $1, location = $2, type = $3, status = $4, 
                rent_amount = $5, rent_period = $6, tax_rate = $7, 
                islamic_inheritance = $8, notes = $9, updated_at = CURRENT_TIMESTAMP
             WHERE id = $10 RETURNING *`,
            [name, location, type, status, actualRentAmount, rent_period || 'Monthly', tax_rate || 15, islamic_inheritance || 'Yes', notes, req.params.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Property not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete property
app.delete('/api/properties/:id', async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM properties WHERE id = $1 RETURNING *', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Property not found' });
        }
        res.json({ success: true, deleted: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get rented properties only
app.get('/api/properties/rented', async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM properties WHERE status = 'Rented' ORDER BY name");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// FAMILY REAL ESTATES API ENDPOINTS
// ==========================================

// ============== RE HEIRS API ==============
app.get('/api/re/heirs', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM re_heirs ORDER BY heir_group, name');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/re/heirs', async (req, res) => {
    try {
        const { name, relationship, gender, heirGroup, portions } = req.body;
        const result = await pool.query(
            'INSERT INTO re_heirs (name, relationship, gender, heir_group, portions) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [name, relationship, gender, heirGroup, portions]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/re/heirs/:id', async (req, res) => {
    try {
        const { name, relationship, gender, heirGroup, portions } = req.body;
        await pool.query(
            'UPDATE re_heirs SET name = $1, relationship = $2, gender = $3, heir_group = $4, portions = $5 WHERE id = $6',
            [name, relationship, gender, heirGroup, portions, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/re/heirs/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM re_heirs WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Reset RE heirs to defaults
app.post('/api/re/heirs/reset-defaults', async (req, res) => {
    try {
        await pool.query('DELETE FROM re_heirs');
        const reHeirs = [
            ['MODER PASMA IDRISU EPSE SALIFOU', 'Spouse', 'Female', 'Wives', 3],
            ['MENJIKOUE ABIBA SPOUSE NJIKAM', 'Spouse', 'Female', 'Wives', 3],
            ['SAHNATU SALIFU', 'Child', 'Female', 'Daughters', 1],
            ['MOHAMAN SALIFU', 'Child', 'Male', 'Sons', 2],
            ['ABIBATU SALIFU', 'Child', 'Female', 'Daughters', 1],
            ['ZAKARE SALIFU', 'Child', 'Male', 'Sons', 2],
            ['FERER ALIMATU SALIFU', 'Child', 'Female', 'Daughters', 1],
            ['NTENTIE REKIATU NJIKAM', 'Child', 'Female', 'Daughters', 1],
            ['KAHPUI MARIAMA SALIFU', 'Child', 'Female', 'Daughters', 1],
            ['GHOUENZEN SOULEMANOU', 'Child', 'Male', 'Sons', 2],
            ['NGAMENPOUYE MAIMUNATE', 'Child', 'Female', 'Daughters', 1],
            ['LOUMNGAM NCHINTOUO AMINATOUO', 'Child', 'Female', 'Daughters', 1],
            ['MENTCHA ABOUBAKAR SALIFOU', 'Child', 'Male', 'Sons', 2],
            ['HAROUNA SALIFU', 'Child', 'Male', 'Sons', 2],
            ['MBALLEY ABDOU RAHAMA SALIFOU', 'Child', 'Male', 'Sons', 2],
            ['NGAMDAMOUN IBRAHIM SALIFOU', 'Child', 'Male', 'Sons', 2]
        ];
        for (const [name, rel, gender, group, portions] of reHeirs) {
            await pool.query(
                'INSERT INTO re_heirs (name, relationship, gender, heir_group, portions) VALUES ($1, $2, $3, $4, $5)',
                [name, rel, gender, group, portions]
            );
        }
        await pool.query('DELETE FROM re_beneficiaries');
        res.json({ success: true, message: 'RE Heirs reset to defaults', count: reHeirs.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============== RE BILLS API ==============
app.get('/api/re/bills', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT b.*, p.name as property_name 
            FROM re_bills b 
            LEFT JOIN properties p ON b.property_id = p.id 
            ORDER BY b.bill_date DESC
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/re/bills', async (req, res) => {
    try {
        const { propertyId, tenantName, billDate, dueDate, amount, status, notes } = req.body;
        const result = await pool.query(
            'INSERT INTO re_bills (property_id, tenant_name, bill_date, due_date, amount, status, notes) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [propertyId, tenantName, billDate, dueDate, amount, status || 'Unpaid', notes]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/re/bills/:id', async (req, res) => {
    try {
        const { propertyId, tenantName, billDate, dueDate, amount, status, notes } = req.body;
        await pool.query(
            'UPDATE re_bills SET property_id = $1, tenant_name = $2, bill_date = $3, due_date = $4, amount = $5, status = $6, notes = $7 WHERE id = $8',
            [propertyId, tenantName, billDate, dueDate, amount, status, notes, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/re/bills/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM re_bills WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============== RE PAYMENTS API ==============
app.get('/api/re/payments', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT pay.*, b.tenant_name, p.name as property_name 
            FROM re_payments pay 
            LEFT JOIN re_bills b ON pay.bill_id = b.id 
            LEFT JOIN properties p ON b.property_id = p.id 
            ORDER BY pay.payment_date DESC
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/re/payments', async (req, res) => {
    try {
        const { billId, amount, paymentDate, paymentMethod, reference } = req.body;
        const result = await pool.query(
            'INSERT INTO re_payments (bill_id, amount, payment_date, payment_method, reference) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [billId, amount, paymentDate, paymentMethod || 'Cash', reference]
        );
        
        // Update bill status based on payments
        const billPayments = await pool.query('SELECT SUM(amount) as total FROM re_payments WHERE bill_id = $1', [billId]);
        const billInfo = await pool.query('SELECT amount FROM re_bills WHERE id = $1', [billId]);
        if (billInfo.rows.length > 0) {
            const totalPaid = parseFloat(billPayments.rows[0].total) || 0;
            const billAmount = parseFloat(billInfo.rows[0].amount);
            let status = 'Unpaid';
            if (totalPaid >= billAmount) status = 'Paid';
            else if (totalPaid > 0) status = 'Partial';
            await pool.query('UPDATE re_bills SET status = $1 WHERE id = $2', [status, billId]);
        }
        
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/re/payments/:id', async (req, res) => {
    try {
        const { billId, amount, paymentDate, paymentMethod, reference } = req.body;
        await pool.query(
            'UPDATE re_payments SET bill_id = $1, amount = $2, payment_date = $3, payment_method = $4, reference = $5 WHERE id = $6',
            [billId, amount, paymentDate, paymentMethod, reference, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/re/payments/:id', async (req, res) => {
    try {
        // Get bill_id before deleting
        const payment = await pool.query('SELECT bill_id FROM re_payments WHERE id = $1', [req.params.id]);
        await pool.query('DELETE FROM re_payments WHERE id = $1', [req.params.id]);
        
        // Recalculate bill status
        if (payment.rows.length > 0) {
            const billId = payment.rows[0].bill_id;
            const billPayments = await pool.query('SELECT SUM(amount) as total FROM re_payments WHERE bill_id = $1', [billId]);
            const billInfo = await pool.query('SELECT amount FROM re_bills WHERE id = $1', [billId]);
            if (billInfo.rows.length > 0) {
                const totalPaid = parseFloat(billPayments.rows[0].total) || 0;
                const billAmount = parseFloat(billInfo.rows[0].amount);
                let status = 'Unpaid';
                if (totalPaid >= billAmount) status = 'Paid';
                else if (totalPaid > 0) status = 'Partial';
                await pool.query('UPDATE re_bills SET status = $1 WHERE id = $2', [status, billId]);
            }
        }
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============== RE EXPENSES API ==============
app.get('/api/re/expenses', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT e.*, p.name as property_name 
            FROM re_expenses e 
            LEFT JOIN properties p ON e.property_id = p.id 
            ORDER BY e.expense_date DESC
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/re/expenses', async (req, res) => {
    try {
        const { propertyId, expenseDate, description, category, amount } = req.body;
        const result = await pool.query(
            'INSERT INTO re_expenses (property_id, expense_date, description, category, amount) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [propertyId, expenseDate, description, category, amount]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/re/expenses/:id', async (req, res) => {
    try {
        const { propertyId, expenseDate, description, category, amount } = req.body;
        await pool.query(
            'UPDATE re_expenses SET property_id = $1, expense_date = $2, description = $3, category = $4, amount = $5 WHERE id = $6',
            [propertyId, expenseDate, description, category, amount, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/re/expenses/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM re_expenses WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============== RE SETTINGS API ==============
app.get('/api/re/settings', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM re_settings');
        const settings = {};
        result.rows.forEach(row => { settings[row.setting_key] = row.setting_value; });
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/re/settings', async (req, res) => {
    try {
        const { key, value } = req.body;
        await pool.query(
            'INSERT INTO re_settings (setting_key, setting_value) VALUES ($1, $2) ON CONFLICT (setting_key) DO UPDATE SET setting_value = $2, updated_at = CURRENT_TIMESTAMP',
            [key, value]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============== CAMPOST SETTINGS API ==============
app.get('/api/campost/settings', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM campost_settings');
        const settings = {};
        result.rows.forEach(row => { settings[row.setting_key] = row.setting_value; });
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/campost/settings', async (req, res) => {
    try {
        const { key, value } = req.body;
        await pool.query(
            'INSERT INTO campost_settings (setting_key, setting_value) VALUES ($1, $2) ON CONFLICT (setting_key) DO UPDATE SET setting_value = $2, updated_at = CURRENT_TIMESTAMP',
            [key, value]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============== RE BENEFICIARIES API ==============
app.get('/api/re/beneficiaries', async (req, res) => {
    try {
        const result = await pool.query('SELECT heir_id FROM re_beneficiaries WHERE is_selected = TRUE');
        res.json(result.rows.map(r => r.heir_id));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/re/beneficiaries', async (req, res) => {
    try {
        const { selectedIds } = req.body;
        await pool.query('DELETE FROM re_beneficiaries');
        for (const id of selectedIds) {
            await pool.query('INSERT INTO re_beneficiaries (heir_id, is_selected) VALUES ($1, TRUE)', [id]);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============== CAMPOST BENEFICIARIES API ==============
app.get('/api/campost/beneficiaries', async (req, res) => {
    try {
        const result = await pool.query('SELECT heir_id FROM campost_beneficiaries WHERE is_selected = TRUE');
        res.json(result.rows.map(r => r.heir_id));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/campost/beneficiaries', async (req, res) => {
    try {
        const { selectedIds } = req.body;
        await pool.query('DELETE FROM campost_beneficiaries');
        for (const id of selectedIds) {
            await pool.query('INSERT INTO campost_beneficiaries (heir_id, is_selected) VALUES ($1, TRUE)', [id]);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============== USERS API ==============
app.get('/api/users', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, username, full_name, role, active, created_at FROM app_users ORDER BY created_at');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users', async (req, res) => {
    try {
        const { username, password, fullName, role, active } = req.body;
        const result = await pool.query(
            'INSERT INTO app_users (username, password, full_name, role, active) VALUES ($1, $2, $3, $4, $5) RETURNING id, username, full_name, role, active',
            [username.toLowerCase(), password, fullName, role || 'user', active !== false]
        );
        res.json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') {
            res.status(400).json({ error: 'Username already exists' });
        } else {
            res.status(500).json({ error: err.message });
        }
    }
});

app.put('/api/users/:id', async (req, res) => {
    try {
        const { username, password, fullName, role, active } = req.body;
        if (password) {
            await pool.query(
                'UPDATE app_users SET username = $1, password = $2, full_name = $3, role = $4, active = $5 WHERE id = $6',
                [username.toLowerCase(), password, fullName, role, active, req.params.id]
            );
        } else {
            await pool.query(
                'UPDATE app_users SET username = $1, full_name = $2, role = $3, active = $4 WHERE id = $5',
                [username.toLowerCase(), fullName, role, active, req.params.id]
            );
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/users/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM app_users WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const result = await pool.query(
            'SELECT id, username, full_name, role, active FROM app_users WHERE LOWER(username) = LOWER($1) AND password = $2 AND active = TRUE',
            [username, password]
        );
        if (result.rows.length > 0) {
            res.json({ success: true, user: result.rows[0] });
        } else {
            res.status(401).json({ success: false, error: 'Invalid credentials or inactive account' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users/change-password', async (req, res) => {
    try {
        const { userId, currentPassword, newPassword } = req.body;
        const user = await pool.query('SELECT * FROM app_users WHERE id = $1 AND password = $2', [userId, currentPassword]);
        if (user.rows.length === 0) {
            res.status(400).json({ error: 'Current password is incorrect' });
            return;
        }
        await pool.query('UPDATE app_users SET password = $1 WHERE id = $2', [newPassword, userId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============== RE INHERITANCE CALCULATION ==============
app.get('/api/re/inheritance/calculate', async (req, res) => {
    try {
        // Get total payments (income)
        const paymentsResult = await pool.query('SELECT COALESCE(SUM(amount), 0) as total FROM re_payments');
        const totalIncome = parseFloat(paymentsResult.rows[0].total) || 0;
        
        // Get total expenses
        const expensesResult = await pool.query('SELECT COALESCE(SUM(amount), 0) as total FROM re_expenses');
        const totalExpenses = parseFloat(expensesResult.rows[0].total) || 0;
        
        // Get reserved funds percentage
        const settingsResult = await pool.query("SELECT setting_value FROM re_settings WHERE setting_key = 'reservedFundsPercent'");
        const reservedPercent = settingsResult.rows.length > 0 ? parseFloat(settingsResult.rows[0].setting_value) : 10;
        
        // Calculate inheritance pool
        const netBalance = totalIncome - totalExpenses;
        const reservedFunds = netBalance * (reservedPercent / 100);
        const inheritancePool = Math.max(0, netBalance - reservedFunds);
        
        // Get selected beneficiaries
        const beneficiariesResult = await pool.query('SELECT heir_id FROM re_beneficiaries WHERE is_selected = TRUE');
        const selectedIds = beneficiariesResult.rows.map(r => r.heir_id);
        
        // Get heirs (filtered by beneficiaries if any selected)
        let heirsQuery = 'SELECT * FROM re_heirs ORDER BY heir_group, name';
        const heirsResult = await pool.query(heirsQuery);
        let heirs = heirsResult.rows;
        
        if (selectedIds.length > 0) {
            heirs = heirs.filter(h => selectedIds.includes(h.id));
        }
        
        // Calculate portions
        const totalPortions = heirs.reduce((sum, h) => sum + parseFloat(h.portions), 0);
        const perPortion = totalPortions > 0 ? inheritancePool / totalPortions : 0;
        
        // Calculate shares
        const heirShares = heirs.map(h => ({
            ...h,
            shareAmount: parseFloat(h.portions) * perPortion
        }));
        
        // Group summary
        const groupSummary = {};
        heirShares.forEach(h => {
            if (!groupSummary[h.heir_group]) {
                groupSummary[h.heir_group] = { count: 0, totalPortions: 0, totalShare: 0 };
            }
            groupSummary[h.heir_group].count++;
            groupSummary[h.heir_group].totalPortions += parseFloat(h.portions);
            groupSummary[h.heir_group].totalShare += h.shareAmount;
        });
        
        res.json({
            totalIncome,
            totalExpenses,
            netBalance,
            reservedFunds,
            inheritancePool,
            totalPortions,
            perPortion,
            heirs: heirShares,
            groupSummary
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============== RE DASHBOARD ==============
app.get('/api/re/dashboard', async (req, res) => {
    try {
        const totalProps = await pool.query('SELECT COUNT(*) as count FROM properties');
        const rentedProps = await pool.query("SELECT COUNT(*) as count FROM properties WHERE status = 'Rented'");
        const totalIncome = await pool.query('SELECT COALESCE(SUM(amount), 0) as total FROM re_payments');
        const totalExpenses = await pool.query('SELECT COALESCE(SUM(amount), 0) as total FROM re_expenses');
        
        const settingsResult = await pool.query("SELECT setting_value FROM re_settings WHERE setting_key = 'reservedFundsPercent'");
        const reservedPercent = settingsResult.rows.length > 0 ? parseFloat(settingsResult.rows[0].setting_value) : 10;
        
        const income = parseFloat(totalIncome.rows[0].total) || 0;
        const expenses = parseFloat(totalExpenses.rows[0].total) || 0;
        const netBalance = income - expenses;
        const reservedFunds = netBalance * (reservedPercent / 100);
        
        res.json({
            totalProperties: parseInt(totalProps.rows[0].count),
            rentedProperties: parseInt(rentedProps.rows[0].count),
            totalIncome: income,
            totalExpenses: expenses,
            netBalance: netBalance,
            reservedFunds: reservedFunds
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============== RE LEDGER ==============
app.get('/api/re/ledger', async (req, res) => {
    try {
        // Get all payments as income
        const payments = await pool.query(`
            SELECT pay.payment_date as date, p.name as property, 
                   'Payment: ' || b.tenant_name as description, 
                   'Income' as type, pay.amount as income, 0 as expense
            FROM re_payments pay
            LEFT JOIN re_bills b ON pay.bill_id = b.id
            LEFT JOIN properties p ON b.property_id = p.id
        `);
        
        // Get all expenses
        const expenses = await pool.query(`
            SELECT e.expense_date as date, COALESCE(p.name, 'General') as property,
                   e.description, 'Expense' as type, 0 as income, e.amount as expense
            FROM re_expenses e
            LEFT JOIN properties p ON e.property_id = p.id
        `);
        
        // Combine and sort
        const ledger = [...payments.rows, ...expenses.rows].sort((a, b) => new Date(a.date) - new Date(b.date));
        
        // Calculate running balance
        let balance = 0;
        const ledgerWithBalance = ledger.map(entry => {
            balance += (parseFloat(entry.income) || 0) - (parseFloat(entry.expense) || 0);
            return { ...entry, balance };
        });
        
        res.json(ledgerWithBalance);
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
