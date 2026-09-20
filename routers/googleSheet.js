const express = require('express');
const router = express.Router();
const Tutor = require('../models/tutor')
const Contact = require('../models/contact')
const Task = require('../models/task')

//google sheet write and readt creadential 
const { google } = require('googleapis');
// const keys = require('../FolderLinkGeneration.json'); // Replace with your key file

// const auth = new google.auth.GoogleAuth({
//   credentials: keys,
//   scopes: ['https://www.googleapis.com/auth/spreadsheets'],
// });
const auth = new google.auth.GoogleAuth({
  keyFile: "./FolderLinkGeneration.json", // Replace with your JSON key file path
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: 'v4', auth });

const SPREADSHEET_ID = '1WbEOBjDX6Jrbz5am1wyWwq-hff57_QnTYcMAEkMXvrU'; // Replace with your Google Sheet ID


// Read Data
async function readSheet(range) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: range,
  });
  console.log(response.data.values);
}
  
// readSheet('Sheet1!A1:C10'); // Read A1 to C10
async function writeSheet(values) {
  // Get the current data to determine the next empty row
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Shift Communication!A:J', // Check column A for the last filled row
  });

  const numRows = response.data.values ? response.data.values.length : 0; // Get last row index
  const nextRow = numRows + 1; // Next available row (Google Sheets starts at 1)

  const range = `Shift Communication!A${nextRow}`; // Adjust range dynamically

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: range,
    valueInputOption: 'RAW',
    requestBody: { values: values },
  });

  console.log(`Data written to row ${nextRow}`);
}

// Example Usage
// writeSheet([['New Data', 'Added Here', '123']]); // Appends to the next available row
  
//========================================to save this data inside a google sheet========================================================================= 
 
const PASSWORD = "templeForKrishna"; // Password for API access

// 1. API to Get All Task Data
router.get("/fetchtaskdata", async (req, res) => {
  try {
    let { password, skip, limit } = req.query;

    if (password !== PASSWORD) {
      return res.status(403).json({ error: "Unauthorized Access" });
    }

    skip = parseInt(skip) || 0;
    limit = parseInt(limit) || 0;

    const tasks = await Task.find()
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    res.status(200).json({
      tasks,
      meta: { skip, limit, total: await Task.countDocuments() },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch tasks", details: error.message });
  }
});

// 2. API to Get All Contacts
router.get("/contactsforsheet", async (req, res) => {
  try {
    let { password, skip, limit } = req.query;

    if (password !== PASSWORD) {
      return res.status(403).json({ error: "Unauthorized Access" });
    }

    skip = parseInt(skip) || 0;
    limit = parseInt(limit) || 0;

    const contacts = await Contact.find()
      .skip(skip)
      .limit(limit)
      .sort({ lastMsgTime: -1 });

    res.status(200).json({
      contacts,
      meta: { skip, limit, total: await Contact.countDocuments() },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch contacts", details: error.message });
  }
});

// 3. API to Get All Tutors
router.get("/fetchtutordata", async (req, res) => {
  try {
    let { password, skip, limit } = req.query;

    if (password !== PASSWORD) {
      return res.status(403).json({ error: "Unauthorized Access" });
    }

    skip = parseInt(skip) || 0;
    limit = parseInt(limit) || 0;

    const tutors = await Tutor.find()
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    res.status(200).json({
      tutors,
      meta: { skip, limit, total: await Tutor.countDocuments() },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch tutors", details: error.message });
  }
});
 

router.get('/tasks-with-contacts', async (req, res) => {
  try {
   let { password, skip, limit} = req.query;

    if (password !== PASSWORD) {
      return res.status(403).json({ error: "Unauthorized Access" });
    }
    skip = parseInt(skip) || 0;
    limit = parseInt(limit) || 0;
    const tasks = await Task.aggregate([
      {
        $lookup: {
          from: "contacts", // Name of the contacts collection
          localField: "clientDetails.chatID", // Field in Task schema
          foreignField: "chatId", // Field in Contact schema
          as: "contactInfo",
        },
      },
      {
        $unwind: {
          path: "$contactInfo",
          preserveNullAndEmptyArrays: true, // If no match, keep task details
        },
      },
      {
        $project: {
          _id: 1,
          taskID: 1,
          clientDetails: 1,
          tutorDetails: 1,
          agentDetails:1,
          status: 1, 
          subject:1,
          driveLink: 1,
          clientDeadline: 1,
          tutorDeadline: 1,
          createdAt: 1,
          updatedAt: 1,
          "contactInfo.phone_number": 1, // Include phoneNumber from Contact schema
        },
      },
      { $skip:  skip }
    ]);

    res.status(200).json({ success: true, tasks });
  } catch (error) {
    console.error('Error fetching tasks with contacts:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});







module.exports = router 