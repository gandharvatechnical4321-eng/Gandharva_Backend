const express = require('express');
const nodemailer = require('nodemailer');
const router = express.Router();
const dotenv =require("dotenv")
dotenv.config()
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const upload = require('./multer');

// Ensure tmp directory exists (for file uploads)
const tmpDir = path.join(__dirname, '../tmp');
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}
// POST /api/send-mail-with-attachment
router.post('/send-mail-with-attachment', upload.single('file'), async (req, res) => {
  try {
    console.log('Received file:', req.file);
    const { email, que, subject } = req.body;
    if (!email || !que || !subject || !req.file) {
      return res.status(400).json({ error: 'email, que, subject, and file are required.' });
    }

    // Send main mail to dashboardforassignment@gmail.com
    const mainMailOptions = {
      from: process.env.EMAIL_FOR_OTP,
      to: 'dashboardforassignment@gmail.com',
      subject: subject,
      text: `Query: ${que}\nSubmitted by: ${email}`,
      attachments: [
        {
          filename: req.file.originalname,
          path: req.file.path
        }
      ]
    };
    await transporter.sendMail(mainMailOptions);

    // Send thank you mail to submitter
    const thankYouHtml = `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:20px;border:1px solid #eee;border-radius:8px;">
        <h2>Thank you for getting a quote with us!</h2>
        <p>We will get back to you within 24 hours.</p>
        <p>If you want an immediate response, contact us on WhatsApp:</p>
        <a href="https://wa.me/917763875269" style="display:inline-block;padding:10px 20px;background:#25D366;color:#fff;text-decoration:none;border-radius:5px;font-weight:bold;">Chat on WhatsApp</a>
      </div>
    `;
    const thankYouMailOptions = {
      from: process.env.EMAIL_FOR_OTP,
      to: email,
      subject: 'Thank you for your query',
      html: thankYouHtml
    };
    await transporter.sendMail(thankYouMailOptions);

    // Optionally, delete the file after sending
    fs.unlink(req.file.path, (err) => {
      if (err) console.error('Error deleting uploaded file:', err);
    });

    res.status(200).json({ success: true, message: 'Mail sent successfully!' });
  } catch (err) {
    console.error('Mail send error:', err);
    res.status(500).json({ error: 'Failed to send email.' });
  }
});
const auth = new google.auth.GoogleAuth({
  keyFile: "./FolderLinkGeneration.json", // Replace with your JSON key file path
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = '174LBeo9kUnwNgiS37cvsvxlYS2aBEJNts-uoHTLrPJI'; // Replace with your Google Sheet ID
// Configure your mail transport (use your real credentials in production)
const transporter = nodemailer.createTransport({
  service: 'gmail', // or another SMTP provider
  auth: {
    user: process.env.EMAIL_FOR_OTP, // set in your .env
    pass: process.env.EMAIL_PASSWORD_FOR_OTP  // set in your .env
  }
});

// POST /api/contact - handle contact form submissions
router.post('/contact', async (req, res) => {
  const { name, email, message, phoneNumber, serviceNeeded, deadline } = req.body;
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  // Build email text with optional fields if provided
  let emailText = `Name: ${name}\nEmail: ${email}\nMessage: ${message}`;
  if (phoneNumber) emailText += `\nPhone Number: ${phoneNumber}`;
  if (serviceNeeded) emailText += `\nService Needed: ${serviceNeeded}`;
  if (deadline) emailText += `\nDeadline: ${deadline}`;

  const mailOptions = {
    from: process.env.EMAIL_FOR_OTP,
    to: "dashboardforassignment@gmail.com",
    subject: 'New Contact Form Submission',
    text: emailText
  };

  try {
    // Write contact details to Google Sheet (add new fields, keep order consistent)
    const client = await auth.getClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          name,
          email,
          message,
          phoneNumber || '',
          serviceNeeded || '',
          deadline || ''
        ]]
      },
      auth: client
    });
    await transporter.sendMail(mailOptions);
    res.status(200).json({ success: true, message: 'Thank you for contacting us!' });
  } catch (err) {
    console.error('Mail send error:', err);
    res.status(500).json({ error: 'Failed to send email.' });
  }
});

module.exports = router;
