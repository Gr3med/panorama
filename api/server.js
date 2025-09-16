// server.js (النسخة المحدثة)

import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
// --- ★★★ إزالة axios ---
// import axios from 'axios'; 

import { sendReportEmail } from './notifications.js'; 
import { createCumulativePdfReport } from './pdfGenerator.js';
// --- ★★★ استيراد وحدة الواتساب الجديدة ★★★ ---
import { sendPdfReportToWhatsapp } from './whatsappClient.js';

dotenv.config();

// --- 1. الإعدادات والثوابت ---
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const REVIEWS_THRESHOLD = 1;
// --- ★★★ إزالة متغيرات الربط الخارجي ---
// const BOT_WEBHOOK_URL = 'http://localhost:9090/send-report';
// const WEBHOOK_API_SECRET = 'YourSuperSecretKeyForBotCommunication123!';
let newReviewsCounter = 0;

// --- 2. إعداد قاعدة البيانات (لا تغيير هنا) ---
const db = new sqlite3.Database('./hotel_reviews.db', (err) => {
    if (err) return console.error('❌ فشل الاتصال بقاعدة البيانات:', err.message);
    console.log('✅ تم الاتصال بنجاح بقاعدة بيانات SQLite.');
    db.run(`
        CREATE TABLE IF NOT EXISTS reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT, floor INTEGER, roomNumber INTEGER,
            guestName TEXT, guestPhone TEXT, email TEXT, internet INTEGER, maintenance INTEGER,
            reception INTEGER, bathroom INTEGER, laundry INTEGER, security INTEGER,
            minimarket INTEGER, lobby INTEGER, restaurant INTEGER, cleanliness INTEGER,
            howDidYouHear TEXT, suggestions TEXT, createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `, (err) => {
        if (!err) console.log("✅ الجدول جاهز.");
    });
});

// --- 3. إعداد تطبيق Express (لا تغيير هنا) ---
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// --- 4. الدالة الرئيسية لإنشاء وإرسال التقارير (تم تعديلها) ---
async function runReportGeneration() {
    console.log("\n--- [المهمة الرئيسية] بدء عملية إنشاء وإرسال التقرير ---");
    try {
        console.log("   -> الخطوة 1: سحب البيانات من قاعدة البيانات...");
        const statsQuery = `SELECT COUNT(id) as total_reviews, AVG(internet) as avg_internet, AVG(maintenance) as avg_maintenance, AVG(reception) as avg_reception, AVG(bathroom) as avg_bathroom, AVG(laundry) as avg_laundry, AVG(security) as avg_security, AVG(minimarket) as avg_minimarket, AVG(lobby) as avg_lobby, AVG(restaurant) as avg_restaurant, AVG(cleanliness) as avg_cleanliness FROM reviews;`;
        const recentReviewsQuery = `SELECT * FROM reviews ORDER BY createdAt DESC LIMIT 5`;
        const stats = await new Promise((resolve, reject) => db.get(statsQuery, (err, row) => err ? reject(err) : resolve(row)));
        const recentReviews = await new Promise((resolve, reject) => db.all(recentReviewsQuery, (err, rows) => err ? reject(err) : resolve(rows)));
        if (!stats || stats.total_reviews == 0) {
            console.log("   -> [تنبيه] لا توجد بيانات كافية، تم إلغاء إنشاء التقرير.");
            return;
        }
        
        console.log("   -> الخطوة 2: جاري إنشاء ملف PDF باستخدام Puppeteer...");
        const logoDataUri = `data:image/jpeg;base64,${fs.readFileSync(path.join(__dirname, 'logo.jpg')).toString('base64')}`;
        const { pdfBuffer, emailHtmlContent } = await createCumulativePdfReport(stats, recentReviews, logoDataUri);
        
        console.log("   -> الخطوة 3: ملف PDF جاهز، جاري إرساله...");
        const emailSubject = `📊 تقرير استبيان الفندق (${stats.total_reviews} تقييم)`;
        const whatsappCaption = `*تقرير استبيان فندق بانوراما*\n\nإجمالي التقييمات حتى الآن: ${stats.total_reviews}`;

        // --- ★★★ تعديل آلية الإرسال ★★★ ---
        await Promise.all([
            sendReportEmail(emailSubject, emailHtmlContent, [{ filename: `Hotel-Report.pdf`, content: pdfBuffer }]),
            // استدعاء دالة الواتساب بدلاً من axios
            sendPdfReportToWhatsapp(pdfBuffer, whatsappCaption) 
        ]);

        console.log("--- [المهمة الرئيسية] ✅ نجحت العملية! تم إرسال التقرير عبر الإيميل والواتساب. ---\n");
    } catch (error) {
        console.error("--- [المهمة الرئيسية] ❌ حدث فشل حاد في عملية إنشاء التقرير أو إرساله. ---");
        console.error("   -> تفاصيل الخطأ:", error.message);
        console.error("----------------------------------------------------------------------\n");
    }
}

// --- 5. إعداد مسار API لاستقبال التقييمات (لا تغيير هنا) ---
app.post('/api/review', (req, res) => {
    const { 
        date, floor, roomNumber, guestName, mobileNumber, email, 
        internet, maintenance, reception, bathroom, laundry, security, 
        minimarket, lobby, restaurant, cleanliness, comments 
    } = req.body;
    
    const query = `
        INSERT INTO reviews(
            date, floor, roomNumber, guestName, guestPhone, email, 
            internet, maintenance, reception, bathroom, laundry, security, 
            minimarket, lobby, restaurant, cleanliness, suggestions
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const params = [
        date, floor, roomNumber, guestName, mobileNumber, email, 
        internet, maintenance, reception, bathroom, laundry, security, 
        minimarket, lobby, restaurant, cleanliness, comments
    ];

    db.run(query, params, function(err) {
        if (err) {
            console.error("Error inserting data:", err);
            return res.status(500).json({ success: false, message: 'خطأ في السيرفر عند حفظ البيانات.' });
        }
        newReviewsCounter++;
        console.log(`👍 تقييم جديد. العداد: ${newReviewsCounter}/${REVIEWS_THRESHOLD}`);
        if (newReviewsCounter >= REVIEWS_THRESHOLD) {
            runReportGeneration();
            newReviewsCounter = 0;
        }
        res.status(201).json({ success: true, message: 'شكرًا لك! تم استلام تقييمك بنجاح.' });
    });
});

// --- 6. تشغيل الخادم (لا تغيير هنا) ---
app.listen(PORT, () => console.log(`🚀 السيرفر يعمل على http://localhost:${PORT}`));