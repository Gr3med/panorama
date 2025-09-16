const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();
const { sendReportEmail } = require('./notifications.js'); 
const { createCumulativePdfReport } = require('./pdfGenerator.js');

const app = express();
app.use(cors());
app.use(express.json());

// الاتصال بقاعدة بيانات Vercel Postgres
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

// دالة لإنشاء الجدول إذا لم يكن موجوداً
async function createTableIfNotExists() {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS reviews (
        id SERIAL PRIMARY KEY,
        date TEXT, floor INTEGER, roomNumber INTEGER,
        guestName TEXT, guestPhone TEXT, email TEXT,
        internet INTEGER, maintenance INTEGER, reception INTEGER,
        bathroom INTEGER, laundry INTEGER, security INTEGER,
        minimarket INTEGER, lobby INTEGER, restaurant INTEGER,
        cleanliness INTEGER, suggestions TEXT,
        createdAt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;
  try {
    await pool.query(createTableQuery);
    console.log("Table 'reviews' is ready.");
  } catch (err) {
    console.error("Error creating table:", err);
  }
}
createTableIfNotExists();


async function runReportGeneration() {
    console.log("Starting report generation...");
    try {
        const statsQuery = `SELECT COUNT(id) as total_reviews, AVG(internet) as avg_internet, AVG(reception) as avg_reception, AVG(cleanliness) as avg_cleanliness FROM reviews;`;
        const recentReviewsQuery = `SELECT * FROM reviews ORDER BY createdAt DESC LIMIT 5`;
        
        const statsResult = await pool.query(statsQuery);
        const recentReviewsResult = await pool.query(recentReviewsQuery);

        const stats = statsResult.rows[0];
        const recentReviews = recentReviewsResult.rows;

        if (!stats || stats.total_reviews == 0) {
            console.log("No data to generate report.");
            return;
        }

        console.log("Generating PDF...");
        const { pdfBuffer, emailHtmlContent } = await createCumulativePdfReport(stats, recentReviews);
        
        console.log("Sending email...");
        const emailSubject = `📊 تقرير استبيان الفندق (${stats.total_reviews} تقييم)`;
        await sendReportEmail(emailSubject, emailHtmlContent, [{ filename: `Hotel-Report.pdf`, content: pdfBuffer }]);
        console.log("Report sent successfully!");
    } catch (error) {
        console.error("Failed to run report generation:", error);
    }
}

// الـ Endpoint الرئيسي
app.post('/api/review', async (req, res) => {
    const { date, floor, roomNumber, guestName, mobileNumber, email, internet, maintenance, reception, bathroom, laundry, security, minimarket, lobby, restaurant, cleanliness, comments } = req.body;
    const query = `INSERT INTO reviews(date, floor, roomNumber, guestName, guestPhone, email, internet, maintenance, reception, bathroom, laundry, security, minimarket, lobby, restaurant, cleanliness, suggestions) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id`;
    const params = [date, floor, roomNumber, guestName, mobileNumber, email, internet, maintenance, reception, bathroom, laundry, security, minimarket, lobby, restaurant, cleanliness, comments];

    try {
        const result = await pool.query(query, params);
        console.log(`New review saved with ID: ${result.rows[0].id}`);
        
        // التحقق من إجمالي التقييمات وإطلاق التقرير
        const countResult = await pool.query('SELECT COUNT(id) as total_reviews FROM reviews;');
        if (parseInt(countResult.rows[0].total_reviews, 10) >= 1) { // يمكنك تغيير هذا الرقم
            await runReportGeneration();
        }

        res.status(201).json({ success: true, message: 'شكرًا لك! تم استلام تقييمك بنجاح.' });
    } catch (err) {
        console.error("Error inserting data:", err);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر عند حفظ البيانات.' });
    }
});

// Vercel تقوم بتشغيل الملف مباشرة، لا نحتاج لـ app.listen
module.exports = app;
