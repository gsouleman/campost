
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function updateCategories() {
    try {
        console.log('Connecting to database...');

        // Define the new categories list
        const newCategories = [
            'Property Maintenance & Repairs',
            'Utilities & Services',
            'Administrative & Professional Fees',
            'Taxes, Levies & Regulatory Costs',
            'Capital Improvements & Renovations',
            'Security & Safety',
            'Insurance',
            'Miscellaneous/Other Operating Expenses',
            'Agent Fees',
            'Transportation',
            'Inheritance Share'
        ];

        // 1. Insert new categories if they don't exist
        for (const name of newCategories) {
            console.log(`Ensuring category: ${name}`);
            await pool.query(
                "INSERT INTO categories (name, type) VALUES ($1, 'expense') ON CONFLICT (name) DO NOTHING",
                [name]
            );
        }

        // Optional: If we wanted to delete old unused categories, we could do that here.
        // But for safety, we usually keep them or just rely on the UI only showing what is needed 
        // if we were fetching a specific list. 
        // However, the requested task implies "Use this new categories", suggesting these should be the options.
        // The API returns all categories from the table. 
        // To make the UI strictly show these, we might want to mark others as inactive or delete them if unused.
        // For now, simply adding them ensures they are available.

        console.log('Categories updated successfully.');
    } catch (err) {
        console.error('Error updating categories:', err);
    } finally {
        await pool.end();
    }
}

updateCategories();
