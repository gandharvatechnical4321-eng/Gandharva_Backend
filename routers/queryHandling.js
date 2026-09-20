
const express = require('express');
const router = express.Router();
const Contact = require('../models/contact'); // Adjust the path as per your project structure
const authMiddleware = require('../middleware/authMiddleware')
 //write in googel sheet=====================================================
 const { google } = require('googleapis');
const auth = new google.auth.GoogleAuth({
    keyFile: "./FolderLinkGeneration.json", // Replace with your JSON key file path
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  function getIndianTime() {
    return new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  }
async function writeContactToSheet(writeValue) {
  try {
    const sheets = google.sheets({ version: "v4", auth });

    // Prepare values to write
    const values = writeValue;

    // Append the new data to the sheet (auto-finds next empty row)
    await sheets.spreadsheets.values.append({
      spreadsheetId:'1TAzqr6Wt4BM14oFssHxFpjdi-Im41SeovWjVyyrOrc8',
      range: "Sheet1!A:E", // Adjust if necessary
      valueInputOption: "RAW",
      requestBody: { values: values },
    });

    console.log(`✅ Contact successfully written to Google Sheets`);
  } catch (error) {
    console.error("❌ Error writing to Google Sheets:", error);
  }
}
router.post('/create',authMiddleware, async (req, res) => {
    try {
        const { chatId } = req.body;

        if (!chatId) {
            return res.status(400).json({ message: 'chatId is required' });
        }

        // Find the contact by chatId
        let contact = await Contact.findOne({ chatId });

        if (contact && contact.queryStatus === 'pending') {
            return res.status(400).json({ message: 'You already have a pending query' });
        }

        // If no contact exists, create a new one
        if (!contact) {
            return res.status(400).json({ message: 'No contact is avelable with this ChatID' });
        }
        const currentDate=new Date()
        // Update query status and date
        contact.queryStatus = 'pending';
        contact.queryDate = currentDate;

        await contact.save();
        writeContactToSheet([[currentDate.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),chatId,"pending",req.user.userName,"NR"]])
        res.status(200).json({
            _id:contact._id,
            name:contact.name,
            chatId: contact.chatId,
            queryStatus: contact.queryStatus,
            queryDate: currentDate,
        });
    } catch (error) {
        console.error('Error creating query:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});
 

router.put('/update-query-status',authMiddleware, async (req, res) => {
    try {
        const { chatId, queryStatus } = req.body;
        console.log({ chatId, queryStatus })
        if (!chatId || !queryStatus) {
            return res.status(400).json({ message: 'chatId and queryStatus are required' });
        }

        const updatedContact = await Contact.findOneAndUpdate(
            { chatId }, // Find the contact by chatId
            { queryStatus }, // Update the queryStatus
            { new: true } // Return the updated document
        );
        if (!updatedContact) {
            return res.status(404).json({ message: 'Contact not found' });
        }
        
        // Await the Google Sheets update and handle errors
        const sheetUpdateResult = await updateColumnC(chatId, queryStatus, req.user.userName);
        
        if (!sheetUpdateResult.success) {
            return res.status(500).json({ 
                message: sheetUpdateResult.error || 'Failed to update Google Sheets. Please check if the data exists in the sheet.' 
            });
        }
        
        // console.log({updatedContact})

        res.status(200).json({
            _id:updatedContact._id,
            name:updatedContact.name,
            chatId: updatedContact.chatId,
            queryStatus: updatedContact.queryStatus,
            queryDate: updatedContact.queryDate,
        });
    } catch (error) {
        console.error('Error updating query status:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});
  

router.get('/search',authMiddleware, async (req, res) => {
    try {
        const { searchQuery, page = 1, limit = 10 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        let searchFilter = {};

        if (searchQuery) {
            const regex = new RegExp(searchQuery, 'i'); // Case-insensitive search
            searchFilter.$or = [
                { chatId: regex },
                { queryStatus: regex }
            ];
        }

        // Fetch pending queries first, sorted in descending order by queryDate
        if(searchQuery===""){
            const pendingQueries = await Contact.find({ queryStatus: 'pending' })
            .sort({ queryDate: -1 })
            .select('_id chatId name queryStatus queryDate'); // Select only required fields
            res.status(200).json({
                success: true, 
                queries:pendingQueries, 
            }); 
             }
        else{
            // Fetch other queries matching the search filter
        const otherQueries = await Contact.find(searchFilter)
        .sort({ queryDate: -1 })
        .skip(skip)
        .select('_id chatId name queryStatus queryDate'); // Select only required fields
        // .limit(parseInt(limit))
    
    res.status(200).json({
        success: true, 
        queries:otherQueries, 
    });
        }
    } catch (error) {
        console.error('Error searching queries:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

router.get('/report', authMiddleware, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        const filter = {};
        if (startDate || endDate) {
            filter.queryDate = {};
            if (startDate) filter.queryDate.$gte = new Date(`${startDate}T00:00:00.000Z`);
            if (endDate) filter.queryDate.$lte = new Date(`${endDate}T23:59:59.999Z`);
        }

        const queries = await Contact.find({
            ...filter,
            queryStatus: { $exists: true, $ne: null, $ne: "" },
        })
            .select('_id chatId name queryStatus queryDate createdAt')
            .sort({ queryDate: -1, createdAt: -1 });

        res.status(200).json({
            success: true,
            queries,
            total: queries.length,
        });
    } catch (error) {
        console.error('Error fetching query report:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});


async function updateColumnC(matchValue, updateValue, whoUpdated) {
    try {
        const sheets = google.sheets({ version: "v4", auth });

        // Step 1: Read all rows from Column A & C
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: '1TAzqr6Wt4BM14oFssHxFpjdi-Im41SeovWjVyyrOrc8',
            range: "Sheet1!A:E",
        });

        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            console.log("No data found in Google Sheets.");
            return { success: false, error: 'No data found in Google Sheets' };
        }
        
        let found = false;
        let rowIndex = rows.length; // Default to last row if no match found
        console.log(rows[rows.length-1][1])
        
        for (let i = rows.length-1; i > 0; i--) {
            console.log(rows[i][1], matchValue)
            if (rows[i][1] === matchValue) { // Column B is at index 1
                console.log("Match found!")
                found = true;
                rowIndex = i + 1; // Convert to 1-based index
                break;
            }
        }

        if (!found) {
            console.log("Match not found for:", matchValue);
            return { success: false, error: `ChatID "${matchValue}" not found in Google Sheets` };
        }

        await sheets.spreadsheets.values.update({
            spreadsheetId: '1TAzqr6Wt4BM14oFssHxFpjdi-Im41SeovWjVyyrOrc8',
            range: `Sheet1!C${rowIndex}`,
            valueInputOption: "RAW",
            requestBody: {
                values: [[updateValue]],
            },
        });
        
        await sheets.spreadsheets.values.update({
            spreadsheetId: '1TAzqr6Wt4BM14oFssHxFpjdi-Im41SeovWjVyyrOrc8',
            range: `Sheet1!C${rowIndex}:E${rowIndex}`,
            valueInputOption: "RAW",
            requestBody: {
                values: [[updateValue, , whoUpdated]], // Leave D column empty with a blank value
            },
        });
        
        console.log(`Updated Column C in row ${rowIndex} with value: ${updateValue}`);
        return { success: true, rowIndex };
    } catch (error) {
        console.error("Error updating Column C:", error);
        return { success: false, error: error.message || 'Failed to update Google Sheets' };
    }
}

// updateColumnC("CI0660","testing")

module.exports = router;
