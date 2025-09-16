const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium-min');

// ... (كل دوال المساعدة getRatingText, getRatingColor, etc. تبقى كما هي من الملف الأصلي) ...

async function createCumulativePdfReport(stats, recentReviews) {
    // ... (كل محتوى HTML يبقى كما هو من الملف الأصلي، لكن بدون logoDataUri) ...
    const htmlContent = `...`; // انسخ محتوى HTML هنا
    const emailHtmlContent = `...`; // انسخ محتوى الإيميل هنا

    let browser = null;
    try {
        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
        });

        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });
        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
        return { pdfBuffer, emailHtmlContent };
    } catch (error) {
        console.error("Error during PDF generation:", error);
        throw error;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

module.exports = { createCumulativePdfReport };
