const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// JSON file storage
const DATA_FILE = path.join(__dirname, 'data.json');

function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        }
    } catch (e) {}
    return { bills: generateDefaultBills(), payments: [] };
}

function saveData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.log('Note: Data saved to memory only');
    }
}

let appData = loadData();

function generateDefaultBills() {
    const bills = [];
    const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
    const periods = ['January to March', 'April to June', 'July to September', 'October to December'];
    let remaining = 3500000;
    const amt = 510000;
    
    for (let year = 2022; year <= 2025; year++) {
        for (let q = 0; q < 4; q++) {
            let paid = 0;
            if (remaining >= amt) { paid = amt; remaining -= amt; }
            else if (remaining > 0) { paid = remaining; remaining = 0; }
            bills.push({
                billNumber: `${quarters[q]}-${year}-00${q + 1}`,
                quarter: quarters[q],
                year: year,
                period: periods[q],
                amountDue: amt,
                paidAmount: paid,
                outstanding: amt - paid,
                isNew: false,
                createdAt: new Date().toISOString()
            });
        }
    }
    return bills;
}

// API Routes
app.get('/api/bills', (req, res) => {
    res.json(appData.bills.sort((a, b) => a.year - b.year || a.quarter.localeCompare(b.quarter)));
});

app.get('/api/bills/:billNumber', (req, res) => {
    const bill = appData.bills.find(b => b.billNumber === req.params.billNumber);
    bill ? res.json(bill) : res.status(404).json({ error: 'Not found' });
});

app.post('/api/bills', (req, res) => {
    const { billNumber, quarter, year, period, amountDue, paidAmount, outstanding, isNew } = req.body;
    if (appData.bills.find(b => b.billNumber === billNumber)) {
        return res.status(400).json({ error: 'Bill exists' });
    }
    const newBill = { billNumber, quarter, year, period, amountDue, paidAmount: paidAmount || 0, outstanding, isNew: isNew || false, createdAt: new Date().toISOString() };
    appData.bills.push(newBill);
    saveData(appData);
    res.json({ success: true, billNumber });
});

app.put('/api/bills/:billNumber', (req, res) => {
    const bill = appData.bills.find(b => b.billNumber === req.params.billNumber);
    if (bill) {
        bill.paidAmount = req.body.paidAmount;
        bill.outstanding = req.body.outstanding;
        saveData(appData);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Not found' });
    }
});

app.delete('/api/bills/:billNumber', (req, res) => {
    appData.bills = appData.bills.filter(b => b.billNumber !== req.params.billNumber);
    saveData(appData);
    res.json({ success: true });
});

app.get('/api/payments', (req, res) => {
    res.json(appData.payments.sort((a, b) => new Date(b.date) - new Date(a.date)));
});

app.post('/api/payments', (req, res) => {
    const { billNumber, amount, date, reference } = req.body;
    const payment = { id: Date.now(), billNumber, amount, date, reference: reference || '' };
    appData.payments.push(payment);
    
    const bill = appData.bills.find(b => b.billNumber === billNumber);
    if (bill) {
        bill.paidAmount += amount;
        bill.outstanding = bill.amountDue - bill.paidAmount;
    }
    saveData(appData);
    res.json({ success: true });
});

app.post('/api/reset', (req, res) => {
    appData = { bills: generateDefaultBills(), payments: [] };
    saveData(appData);
    res.json({ success: true });
});

app.get('/api/status', (req, res) => {
    res.json({ connected: true, type: 'json', path: 'Cloud Storage' });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`CAMPOST Billing running on port ${PORT}`);
});
