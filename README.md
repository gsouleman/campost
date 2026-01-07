# CAMPOST MANKON - Billing Management System

Web-based billing system with PostgreSQL database hosted on Render.com.

## 🚀 Deployment on Render.com

### Step 1: Create PostgreSQL Database

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **"New +"** → **"PostgreSQL"**
3. Configure:
   - **Name:** `campost-db`
   - **Database:** `campost_billing`
   - **User:** `campost_user`
   - **Region:** Choose nearest to you
   - **Plan:** **Free**
4. Click **"Create Database"**
5. Wait for database to be ready (1-2 minutes)
6. **Copy the "External Database URL"** - you'll need this!

### Step 2: Deploy Web Service

1. Click **"New +"** → **"Web Service"**
2. Connect your GitHub repo OR use "Public Git repository"
3. Configure:
   - **Name:** `campost-billing`
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** **Free**

### Step 3: Add Environment Variable

1. In your Web Service settings, go to **"Environment"**
2. Add environment variable:
   - **Key:** `DATABASE_URL`
   - **Value:** Paste the External Database URL from Step 1
3. Click **"Save Changes"**

### Step 4: Deploy!

1. Click **"Manual Deploy"** → **"Deploy latest commit"**
2. Wait for deployment (2-3 minutes)
3. Your app will be live at: `https://campost-billing.onrender.com`

## 📋 Features

- ✅ Dashboard with billing overview
- ✅ View and print bills
- ✅ Create new bills (2026+)
- ✅ Statement of Account
- ✅ Record payments
- ✅ Export to CSV
- ✅ PostgreSQL database (data persists)

## 💰 Pre-loaded Data

- 16 quarterly bills (Q1-2022 to Q4-2025)
- 510,000 XAF per quarter
- 3,500,000 XAF distributed as payments
- Outstanding balance: 4,660,000 XAF

## 📞 Client Information

- **Name:** GHOUENZEN Soulemanou
- **Address:** B.P 36 Mankon-Bamenda
- **Tel:** 675299868
- **Account:** 12003 14012 10868895015 89
