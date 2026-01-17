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

/**
 * Islamic Inheritance Calculation Engine (Fara'id)
 * Follows the specific rules from the user-provided chart.
 */
function calculateFaraid(netEstate, heirs) {
    const results = {
        heirs: [],
        baseNumber: 24,
        totalFixedParts: 0,
        residueParts: 0,
        notes: [],
        case: 'Standard',
        netEstate: netEstate,
        groupSummary: {}
    };

    if (!heirs || heirs.length === 0) return results;

    // --- 1. Normalization & Grouping ---
    const normalizedHeirs = heirs.map(h => {
        let rel = h.relationship;
        // Map synonyms to standard keys used in calculation logic
        if (rel === 'Child' || rel === 'Children') {
            if (h.heir_group === 'Sons') rel = 'Son';
            else if (h.heir_group === 'Daughters') rel = 'Daughter';
        } else if (rel === 'Spouse') {
            if (h.heir_group === 'Wives' || h.gender === 'Female') rel = 'Wife';
            else if (h.gender === 'Male') rel = 'Husband';
        }

        // Detailed mappings based on the image's dropdown list
        // Synonyms for standard handling
        if (rel === 'Grandson (Son\'s Son)' || rel === 'Son\'s Son') rel = 'Grandson';
        if (rel === 'Son\'s Daughter') rel = 'Granddaughter';
        if (rel === 'Paternal Brother') rel = 'Consanguine Brother';
        if (rel === 'Paternal Sister') rel = 'Consanguine Sister';
        if (rel === 'Maternal Sibling') rel = h.gender === 'Male' ? 'Uterine Brother' : 'Uterine Sister';
        if (rel === 'Grandfather' || rel === 'Paternal Grandfather') rel = 'Grandfather'; // True Grandfather
        if (rel === 'Grandmother' || rel === 'Maternal Grandmother' || rel === 'Paternal Grandmother') rel = 'Grandmother'; // Handling generic, but logic will separate maternal/paternal if needed. For now treating as True Grandmother.
        if (rel === 'Nephew (Sister\'s Son)') rel = 'Nephew (Sis)'; // Distant
        if (rel === 'Full Nephew (Brother\'s Son)' || rel === 'Brother\'s Son') rel = 'Full Nephew'; // Residuary

        return { ...h, relationship: rel };
    });

    const count = (r) => normalizedHeirs.filter(h => h.relationship === r).length;
    const exists = (r) => count(r) > 0;

    // --- 2. Exclusion Logic (Hajb) ---
    // Define "Excluded" explicitly from image
    const alwaysExcluded = ['Step-father', 'Step-mother', 'Adopted Child', 'Foster Relations', 'Illegitimate Child'];
    const distantKindred = [
        'Maternal Grandfather', // False Grandfather
        'Daughter\'s Children',
        'Paternal Aunt',
        'Maternal Aunt',
        'Nephew (Sis)',
        'Niece (Sister\'s Daughter)',
        'Granddaughter (Daughter\'s Daughter)'
    ];

    const isExcluded = new Set();
    const addNote = (msg) => results.notes.push(msg);

    // Identify blockers
    const hasSon = exists('Son');
    const hasSonDescendant = hasSon || exists('Grandson'); // Male descendant
    const hasMaleDescendant = hasSonDescendant; // Logic equivalence
    const hasFemaleDescendant = exists('Daughter') || exists('Granddaughter');
    const hasDescendant = hasMaleDescendant || hasFemaleDescendant;
    const hasFather = exists('Father');
    const hasGrandfather = exists('Grandfather');
    const hasMaleAscendant = hasFather || hasGrandfather;

    normalizedHeirs.forEach(h => {
        // 1. Explicitly Excluded Categories
        if (alwaysExcluded.includes(h.relationship)) {
            isExcluded.add(h.id);
            addNote(`${h.name} (${h.relationship}) is excluded (No inheritance rights).`);
            return;
        }
        // 2. Distant Kindred (Excluded by closer heirs - generally always excluded in presence of any Quranic heir, simplified here to always 0 unless extended implementation requested)
        if (distantKindred.includes(h.relationship) || h.relationship.includes('Distant')) {
            isExcluded.add(h.id);
            addNote(`${h.name} (${h.relationship}) is Distant Kindred (Excluded).`);
            return;
        }

        // 3. Hajb Rules (Blocking)
        // Grandson: Excluded by Son
        if (h.relationship === 'Grandson' && hasSon) {
            isExcluded.add(h.id);
            addNote(`${h.name} excluded by Son.`);
        }
        // Grandfather: Excluded by Father
        if (h.relationship === 'Grandfather' && hasFather) {
            isExcluded.add(h.id);
            addNote(`${h.name} excluded by Father.`);
        }
        // Grandmother: Excluded by Mother
        if (h.relationship === 'Grandmother' && exists('Mother')) {
            isExcluded.add(h.id);
            addNote(`${h.name} excluded by Mother.`);
        }
        // Brothers/Sisters (Full/Consanguine/Uterine): Excluded by Son, Grandson, Father
        if (['Full Brother', 'Full Sister', 'Consanguine Brother', 'Consanguine Sister', 'Uterine Brother', 'Uterine Sister', 'Brother', 'Sister'].includes(h.relationship)) {
            if (hasMaleDescendant) {
                isExcluded.add(h.id);
                addNote(`${h.name} excluded by Male Descendant.`);
            } else if (hasFather) {
                isExcluded.add(h.id);
                addNote(`${h.name} excluded by Father.`);
            }
        }
        // Consanguine Siblings: Excluded by Full Brother
        if (['Consanguine Brother', 'Consanguine Sister'].includes(h.relationship) && exists('Full Brother')) {
            isExcluded.add(h.id);
            addNote(`${h.name} excluded by Full Brother.`);
        }
        // Uterine Siblings: Excluded by any Descendant or Male Ascendant (Father/Grandfather)
        if (['Uterine Brother', 'Uterine Sister'].includes(h.relationship)) {
            if (hasDescendant || hasMaleAscendant) {
                isExcluded.add(h.id); // Redundant check but clearer
                addNote(`${h.name} excluded by Descendant or Male Ascendant.`);
            }
        }
        // Granddaughter: Excluded by Son, or 2+ Daughters (unless Musahih/Blessed Grandson exists - ignoring complex blessed grandson for now unless implicit)
        if (h.relationship === 'Granddaughter') {
            if (hasSon) {
                isExcluded.add(h.id); addNote(`${h.name} excluded by Son.`);
            } else if (count('Daughter') >= 2 && !exists('Grandson')) {
                isExcluded.add(h.id); addNote(`${h.name} excluded by 2+ Daughters (no Blessed Son).`);
            }
        }
        // Full Nephew: Excluded by Son, Grandson, Father, Grandfather, Brother
        if (h.relationship === 'Full Nephew') {
            if (hasMaleDescendant || hasMaleAscendant || exists('Full Brother')) {
                isExcluded.add(h.id); addNote(`${h.name} excluded by closer male heir.`);
            }
        }
    });

    const activeHeirs = normalizedHeirs.filter(h => !isExcluded.has(h.id));

    // --- 3. Fixed Shares (Furud) Calculation ---
    // lcd is Base Number (usually 24 covers all, but we calculate parts out of 24)
    let partsMap = new Map(); // heir_id -> parts (out of 24)
    let labelMap = new Map();
    const setShare = (id, p, l) => { partsMap.set(id, p); labelMap.set(id, l); };

    activeHeirs.forEach(h => {
        let parts = 0;
        let label = '';
        const r = h.relationship;

        if (r === 'Husband') {
            // 1/2 or 1/4
            parts = hasDescendant ? 6 : 12;
            label = hasDescendant ? '1/4' : '1/2';
        } else if (r === 'Wife') {
            // 1/4 or 1/8 (Shared among wives)
            const wCount = count('Wife');
            const totalWifeParts = hasDescendant ? 3 : 6;
            parts = totalWifeParts / wCount;
            label = hasDescendant ? (wCount > 1 ? '1/8 (Shared)' : '1/8') : (wCount > 1 ? '1/4 (Shared)' : '1/4');
        } else if (r === 'Father') {
            // 1/6 if Male Descendant exists. (If Female Descendant only, 1/6 + Residue)
            if (hasMaleDescendant) {
                parts = 4; label = '1/6';
            } else if (hasFemaleDescendant) {
                parts = 4; label = '1/6 + Residue'; // Will handle residue later
            }
            // If no descendants, Father is purely Residuary (handled later)
        } else if (r === 'Mother') {
            // 1/6 if Descendant or 2+ Siblings, else 1/3
            // (Omitting Umariyyatain/Gharawain special case for Husband/Wife+Mother+Father for simplicity unless triggered)
            const sibCount = normalizedHeirs.filter(n => n.relationship.includes('Brother') || n.relationship.includes('Sister')).length;
            if (hasDescendant || sibCount >= 2) {
                parts = 4; label = '1/6';
            } else {
                parts = 8; label = '1/3';
            }
        } else if (r === 'Daughter') {
            // 1/2 (single), 2/3 (multiple) - Residuary if Son exists (Tasib)
            if (!hasSon) {
                const dCount = count('Daughter');
                if (dCount === 1) { parts = 12; label = '1/2'; }
                else { parts = 16 / dCount; label = '2/3 (Shared)'; }
            }
        } else if (r === 'Granddaughter') {
            // 1/2 (single), 2/3 (shared) if no Daughter
            // 1/6 (shared) if 1 Daughter (to make 2/3)
            // Residuary if Grandson exists
            if (!exists('Grandson')) {
                if (!exists('Daughter')) {
                    const gdCount = count('Granddaughter');
                    if (gdCount === 1) { parts = 12; label = '1/2'; }
                    else { parts = 16 / gdCount; label = '2/3 (Shared)'; }
                } else if (count('Daughter') === 1) {
                    const gdCount = count('Granddaughter');
                    parts = 4 / gdCount; label = '1/6 (Complement)';
                }
            }
        } else if (r === 'Grandfather') {
            // 1/6 if Male Descendant
            if (hasMaleDescendant) {
                parts = 4; label = '1/6';
            } else if (hasFemaleDescendant) {
                parts = 4; label = '1/6 + Residue';
            }
        } else if (r === 'Grandmother') {
            // 1/6 Shared
            const gCount = count('Grandmother');
            parts = 4 / gCount; label = '1/6 (Shared)';
        } else if (r.includes('Sister') && r !== 'Maternal Sister') {
            // Full/Consanguine Sisters are Residuary with Brother
            // Fixed shares if no Brother
            if (r === 'Full Sister' && !exists('Full Brother') && !hasDescendant && !hasMaleAscendant) {
                const sCount = count('Full Sister');
                if (sCount === 1) { parts = 12; label = '1/2'; }
                else { parts = 16 / sCount; label = '2/3 (Shared)'; }
            }
            if (r === 'Consanguine Sister' && !exists('Consanguine Brother') && !exists('Full Brother') && !exists('Full Sister') && !hasDescendant && !hasMaleAscendant) {
                const csCount = count('Consanguine Sister');
                if (csCount === 1) { parts = 12; label = '1/2'; }
                else { parts = 16 / csCount; label = '2/3 (Shared)'; }
            }
            // Consanguine Sister with 1 Full Sister -> 1/6 Complement
            if (r === 'Consanguine Sister' && count('Full Sister') === 1 && !exists('Full Brother') && !exists('Consanguine Brother') && !hasDescendant && !hasMaleAscendant) {
                const csCount = count('Consanguine Sister');
                parts = 4 / csCount; label = '1/6 (Complement)';
            }
        } else if (r === 'Uterine Brother' || r === 'Uterine Sister') {
            // 1/6 (single), 1/3 (multiple)
            const uCount = count('Uterine Brother') + count('Uterine Sister');
            parts = (uCount === 1 ? 4 : 8) / uCount;
            label = uCount === 1 ? '1/6' : '1/3 (Shared)';
        }

        if (parts > 0) setShare(h.id, parts, label);
    });

    // --- 4. Residue (Asabah) Distribution ---
    // Calculate total fixed parts used
    let totalFixed = 0;
    partsMap.forEach(p => totalFixed += p);

    let residue = 24 - totalFixed;

    // Identify Residuary Heirs by priority (Order: Son, Grandson, Father, Grandfather, Full Brother, Consanguine Brother, Full Nephew)
    // Note: Daughters/Granddaughters/Sisters become Residuary with counterparts (Tasib bi-ghayrihi)

    let residuaryGroup = [];

    if (hasSon) {
        residuaryGroup = [...activeHeirs.filter(h => h.relationship === 'Son'), ...activeHeirs.filter(h => h.relationship === 'Daughter')];
    } else if (exists('Grandson')) {
        residuaryGroup = [...activeHeirs.filter(h => h.relationship === 'Grandson'), ...activeHeirs.filter(h => h.relationship === 'Granddaughter')];
    } else if (hasFather) {
        // Father is residuary if no children (already got 1/6 if female present, so he takes residue too)
        residuaryGroup = [activeHeirs.find(h => h.relationship === 'Father')];
        // If Female Descendant exists, Father was already in fixed list. He gets +Residue
        // If No Descendants, Father gets *only* residue (so we must ensure he isn't excluded from residuary logic if he didn't get fixed share)
    } else if (hasGrandfather) {
        residuaryGroup = [activeHeirs.find(h => h.relationship === 'Grandfather')];
    } else if (exists('Full Brother')) {
        residuaryGroup = [...activeHeirs.filter(h => h.relationship === 'Full Brother'), ...activeHeirs.filter(h => h.relationship === 'Full Sister')];
    } else if (exists('Consanguine Brother')) {
        residuaryGroup = [...activeHeirs.filter(h => h.relationship === 'Consanguine Brother'), ...activeHeirs.filter(h => h.relationship === 'Consanguine Sister')];
    } else if (exists('Full Nephew')) {
        residuaryGroup = activeHeirs.filter(h => h.relationship === 'Full Nephew');
    }

    // Special case: Father/Grandfather with Female Descendant -> Checks if they are in residuaryGroup
    // If they were fixed share holders (1/6), they simply absorb the residue on top.

    if (residue > 0 && residuaryGroup.length > 0) {
        // Calculate weights (Male = 2, Female = 1)
        const maleTypes = ['Son', 'Grandson', 'Father', 'Grandfather', 'Full Brother', 'Consanguine Brother', 'Full Nephew', 'Brother', 'Paternal Brother', 'Son\'s Son', 'Grandson (Son\'s Son)'];
        let totalWeight = 0;
        residuaryGroup.forEach(h => {
            const isMale = maleTypes.includes(h.relationship) || h.gender === 'Male';
            const w = isMale ? 2 : 1;
            h._w = w;
            totalWeight += w;
        });

        residuaryGroup.forEach(h => {
            if (!h) return;
            const share = (h._w / totalWeight) * residue;
            const currentParts = partsMap.get(h.id) || 0;
            const currentLabel = labelMap.get(h.id);

            partsMap.set(h.id, currentParts + share);

            if (currentLabel) labelMap.set(h.id, currentLabel + ' + Residue');
            else labelMap.set(h.id, 'Residue');
        });

        // Residue fully distributed
        results.residueParts = 0; // Consumed
    } else {
        results.residueParts = Math.max(0, residue);
    }

    // --- 5. Radd (Return) & Awl (Increase) ---
    // Re-sum total parts
    let finalTotal = 0;
    partsMap.forEach(p => finalTotal += p);

    if (finalTotal > 24) {
        results.case = 'Awl';
        results.baseNumber = finalTotal; // Base increases
        addNote(`Awl Case: Total shares (${finalTotal}/24) exceed estate. Shares reduced proportionally.`);
    } else if (finalTotal < 24 && residue > 0) {
        // Radd Logic (if no residuary heir was found to take it)
        // Radd ignores Spouse
        const raddHeirs = activeHeirs.filter(h => h.relationship !== 'Husband' && h.relationship !== 'Wife' && partsMap.has(h.id));
        if (raddHeirs.length > 0) {
            results.case = 'Radd';
            addNote(`Radd Case: Surplus (${24 - finalTotal}/24) returned to blood heirs.`);

            let raddBase = 0;
            raddHeirs.forEach(h => raddBase += partsMap.get(h.id));

            const spouseParts = (partsMap.get(activeHeirs.find(h => h.relationship === 'Husband')?.id) || 0) +
                (activeHeirs.filter(h => h.relationship === 'Wife').reduce((s, w) => s + (partsMap.get(w.id) || 0), 0));

            // Simplification: We scale the Radd heirs' parts to look like they fill the remainder
            // New Formula: (Individual Share / Total Radd Shares) * Remainder after Spouse
            // Easier: Just keep 24 base, but increase parts of Radd heirs? No.
            // Standard Radd: Reduce Base Number to (Spouse Share denominator?) No.
            // We will simply allocate the residue proportionally to Radd Heirs.
            const surplus = 24 - finalTotal;
            raddHeirs.forEach(h => {
                const boost = (partsMap.get(h.id) / raddBase) * surplus;
                partsMap.set(h.id, partsMap.get(h.id) + boost);
            });
            finalTotal = 24;
            results.residueParts = 0;
        }
    }

    // --- 6. Formulate Output ---
    results.baseNumber = (results.case === 'Awl') ? finalTotal : 24;
    results.perPortion = netEstate / results.baseNumber;
    results.groupSummary = {};

    activeHeirs.forEach(h => {
        const parts = partsMap.get(h.id) || 0;
        const pct = (parts / results.baseNumber) * 100;
        const amt = (parts / results.baseNumber) * netEstate;

        results.heirs.push({
            ...h,
            fraction: labelMap.get(h.id) || 'Excluded',
            parts: parseFloat(parts.toFixed(3)),
            sharePercentage: parseFloat(pct.toFixed(2)),
            shareAmount: Math.round(amt)
        });

        // Group Summary
        if (!results.groupSummary[h.heir_group]) {
            results.groupSummary[h.heir_group] = {
                count: 0,
                totalShare: 0,
                fraction: labelMap.get(h.id) || 'N/A',
                partsPerHeir: parseFloat(parts.toFixed(3))
            };
        }
        results.groupSummary[h.heir_group].count++;
        results.groupSummary[h.heir_group].totalShare += amt;
    });

    results.totalFixedParts = finalTotal;

    return results;
}

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
                email VARCHAR(255),
                role VARCHAR(20) DEFAULT 'user',
                active BOOLEAN DEFAULT TRUE,
                must_change_password BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Add email and must_change_password columns if they don't exist (for existing databases)
        await pool.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='app_users' AND column_name='email') THEN
                    ALTER TABLE app_users ADD COLUMN email VARCHAR(255);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='app_users' AND column_name='must_change_password') THEN
                    ALTER TABLE app_users ADD COLUMN must_change_password BOOLEAN DEFAULT TRUE;
                END IF;
            END $$;
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
        // Family members from CAMPOST MANKON
        const heirs = [
            ['MODER PASMA IDRISU EPSE SALIFOU', 'Spouse', 'Wives', 0.0625],
            ['MENJIKOUE ABIBA SPOUSE NJIKAM', 'Spouse', 'Wives', 0.0625],
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

}


// Initialize default users - only if table is empty, otherwise ensure admin exists
const userResult = await pool.query('SELECT COUNT(*) FROM app_users');
if (parseInt(userResult.rows[0].count) === 0) {
    // Admin user - must change password on first login
    await pool.query(
        'INSERT INTO app_users (username, password, full_name, email, role, active, must_change_password) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        ['admin', 'admin', 'Administrator', 'admin@example.com', 'admin', true, true]
    );
    // Standard user - must change password on first login
    await pool.query(
        'INSERT INTO app_users (username, password, full_name, email, role, active, must_change_password) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        ['user', '1234', 'Standard User', 'user@example.com', 'user', true, true]
    );
    // Guest user - must change password on first login
    await pool.query(
        'INSERT INTO app_users (username, password, full_name, email, role, active, must_change_password) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        ['guest', '1234', 'Guest User', 'guest@example.com', 'guest', true, true]
    );
} else {
    // Ensure admin user exists (in case it was deleted)
    const adminExists = await pool.query("SELECT id FROM app_users WHERE username = 'admin'");
    if (adminExists.rows.length === 0) {
        await pool.query(
            'INSERT INTO app_users (username, password, full_name, email, role, active, must_change_password) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            ['admin', 'admin', 'Administrator', 'admin@example.com', 'admin', true, true]
        );
    }
}

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

        // Get selected beneficiaries
        const beneficiariesResult = await pool.query('SELECT heir_id FROM campost_beneficiaries WHERE is_selected = TRUE');
        const selectedIds = beneficiariesResult.rows.map(r => r.heir_id);

        const heirsResult = await pool.query('SELECT * FROM heirs ORDER BY heir_group, name');
        let heirs = heirsResult.rows;

        // Filter heirs to only include selected beneficiaries
        if (selectedIds.length > 0) {
            heirs = heirs.filter(h => selectedIds.includes(h.id));
        }

        // Use the new Sequential Logic Flow
        const calculation = calculateFaraid(inheritanceAmount, heirs);

        res.json({
            totalBillsPaid, totalExpenses, reserveFunds, inheritanceAmount,
            baseNumber: calculation.baseNumber,
            perPortion: calculation.baseNumber > 0 ? (inheritanceAmount / calculation.baseNumber) : 0,
            notes: calculation.notes,
            calculationCase: calculation.case,
            heirs: calculation.heirs,
            groupSummary: calculation.groupSummary
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
            receiptNumber: row.receipt_number || null,
            period: row.period, year: row.year
        })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Generate receipt for regular Campost payment
app.post('/api/receipts/generate', async (req, res) => {
    try {
        const { paymentId, receiptDate } = req.body;

        // 1. Verify Payment
        const check = await pool.query('SELECT * FROM payments WHERE id = $1', [paymentId]);
        if (check.rows.length === 0) return res.status(404).json({ error: 'Payment not found' });
        if (check.rows[0].receipt_number) return res.status(400).json({ error: 'Receipt already exists' });

        // 2. Generate Receipt Number
        // Format: RCP-[YEAR]-[0000]
        const year = new Date().getFullYear();
        const countRes = await pool.query('SELECT COUNT(*) FROM payments WHERE receipt_number IS NOT NULL');
        const nextNum = parseInt(countRes.rows[0].count) + 1;
        const receiptNumber = `RCP-${year}-${String(nextNum).padStart(4, '0')}`;
        const actualDate = receiptDate || new Date();

        // 3. Update Payment
        const result = await pool.query(
            'UPDATE payments SET receipt_number = $1, receipt_date = $2 WHERE id = $3 RETURNING *',
            [receiptNumber, actualDate, paymentId]
        );

        // Fetch full details for return
        const fullDetails = await pool.query(`
            SELECT p.*, b.period, b.year, b.bill_number as bill_ref
            FROM payments p 
            JOIN bills b ON p.bill_number = b.bill_number
            WHERE p.id = $1
        `, [paymentId]);

        res.json(fullDetails.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update receipt details
app.put('/api/receipts/:id', async (req, res) => {
    try {
        const { date, paymentMethod } = req.body;
        const result = await pool.query(
            'UPDATE payments SET receipt_date = $1, payment_method = $2 WHERE id = $3 RETURNING *',
            [date, paymentMethod, req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Payment not found' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Void receipt (delete receipt number)
app.delete('/api/receipts/:id', async (req, res) => {
    try {
        const result = await pool.query(
            'UPDATE payments SET receipt_number = NULL, receipt_date = NULL WHERE id = $1 RETURNING *',
            [req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Payment not found' });
        res.json({ message: 'Receipt voided', payment: result.rows[0] });
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
            period: row.period, year: row.year,
            receiptNumber: row.receipt_number, receiptDate: row.receipt_date,
            paymentMethod: row.payment_method
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/payments', async (req, res) => {
    const client = await pool.connect();
    try {
        const { billNumber, amount, date, reference, paymentMethod } = req.body;
        await client.query('BEGIN');
        const result = await client.query(
            'INSERT INTO payments (bill_number, amount, payment_date, reference, payment_method) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [billNumber, amount, date, reference || '', paymentMethod || 'Cash']
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

        // Insert default family members from CAMPOST MANKON
        const heirs = [
            ['MODER PASMA IDRISU EPSE SALIFOU', 'Spouse', 'Wives', 0.0625],
            ['MENJIKOUE ABIBA SPOUSE NJIKAM', 'Spouse', 'Wives', 0.0625],
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
        const result = await pool.query('SELECT id, username, full_name, email, role, active, must_change_password, created_at FROM app_users ORDER BY created_at');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users', async (req, res) => {
    try {
        const { username, password, fullName, email, role, active } = req.body;
        const result = await pool.query(
            'INSERT INTO app_users (username, password, full_name, email, role, active, must_change_password) VALUES ($1, $2, $3, $4, $5, $6, TRUE) RETURNING id, username, full_name, email, role, active, must_change_password',
            [username.toLowerCase(), password || '1234', fullName, email || '', role || 'user', active !== false]
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
        const { username, password, fullName, email, role, active, mustChangePassword } = req.body;
        if (password) {
            await pool.query(
                'UPDATE app_users SET username = $1, password = $2, full_name = $3, email = $4, role = $5, active = $6, must_change_password = $7 WHERE id = $8',
                [username.toLowerCase(), password, fullName, email || '', role, active, mustChangePassword !== false, req.params.id]
            );
        } else {
            await pool.query(
                'UPDATE app_users SET username = $1, full_name = $2, email = $3, role = $4, active = $5 WHERE id = $6',
                [username.toLowerCase(), fullName, email || '', role, active, req.params.id]
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
            'SELECT id, username, full_name, email, role, active, must_change_password FROM app_users WHERE LOWER(username) = LOWER($1) AND password = $2 AND active = TRUE',
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
        await pool.query('UPDATE app_users SET password = $1, must_change_password = FALSE WHERE id = $2', [newPassword, userId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Force password change (for first login or password reset)
app.post('/api/users/force-change-password', async (req, res) => {
    try {
        const { userId, newPassword } = req.body;
        await pool.query('UPDATE app_users SET password = $1, must_change_password = FALSE WHERE id = $2', [newPassword, userId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Password reset request
app.post('/api/users/reset-password', async (req, res) => {
    try {
        const { username, email } = req.body;
        const result = await pool.query(
            'SELECT id, email FROM app_users WHERE LOWER(username) = LOWER($1) AND LOWER(email) = LOWER($2) AND active = TRUE',
            [username, email]
        );
        if (result.rows.length === 0) {
            res.status(400).json({ error: 'No active account found with that username and email' });
            return;
        }

        // Generate temporary password
        const tempPassword = 'temp' + Math.random().toString(36).substring(2, 8);

        // Update password and set must_change_password flag
        await pool.query(
            'UPDATE app_users SET password = $1, must_change_password = TRUE WHERE id = $2',
            [tempPassword, result.rows[0].id]
        );

        // In production, you would send an email here
        // For now, we'll return the temp password (in real app, this would be sent via email)
        res.json({
            success: true,
            message: 'Temporary password has been set. Please check your email.',
            // In production, remove this line - only for demo purposes
            tempPassword: tempPassword
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============== CAMPOST DASHBOARD ==============
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

async function ensureCampostReceiptColumns() {
    try {
        await pool.query(`
            ALTER TABLE payments 
            ADD COLUMN IF NOT EXISTS receipt_number VARCHAR(50),
            ADD COLUMN IF NOT EXISTS receipt_date TIMESTAMP,
            ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'Cash'
        `);
        console.log('✓ Receipt columns verified in payments (Campost)');
    } catch (err) {
        console.error('Migration Error (Campost):', err.message);
    }
}

initDatabase().then(async () => {
    await ensureCampostReceiptColumns();
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`\n✓ CAMPOST Server running on port ${PORT}\n`);
    });
});
