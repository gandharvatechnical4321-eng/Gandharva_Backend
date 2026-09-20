const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Tutor = require("../models/tutor"); 
const Contact = require('../models/contact')
const authMiddleware = require('../middleware/authMiddleware')
const {encryptFunction, decryptFunction} = require('../phoneSecurity')
//write in googel sheet=====================================================
const { google } = require('googleapis');
const auth = new google.auth.GoogleAuth({
 keyFile: "./FolderLinkGeneration.json", // Replace with your JSON key file path
 scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const SPREADSHEET_ID_FOR_TUTOR_REGISTRATION = "1EaXOSm1Bj02HXQgDaPnp0i9rvFRnqouD8qfIkxBISh4";
const SHEET_NAME = "Sheet1"; // Replace with your actual sheet name
async function registerTutorsFromSheet(start,end) {
  try {
    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: authClient });

    const SPREADSHEET_ID = "1EaXOSm1Bj02HXQgDaPnp0i9rvFRnqouD8qfIkxBISh4"; // Your Sheet ID
    const SHEET_NAME = "Form Responses 1"; // Replace with your actual sheet name
    const START_ROW = start; // Assuming first row is headers
    const END_ROW = end; // Change to the last row you want to fetch

    const range = `${SHEET_NAME}!B${START_ROW}:U${END_ROW}`; // Fetch all required columns

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: range,
    });

    const rows = response.data.values;

    if (!rows || rows.length === 0) {
      console.log("No data found in the specified range.");
      return;
    }

    for (const row of rows) {
      try {
        const whatsappNo = formatWhatsAppNumber(row[2]) || ""; // Column D (WhatsApp Number)
        
        // Check if a tutor with the same WhatsApp number already exists
        const existingTutor = await Tutor.findOne({ whatsappNo });

        if (existingTutor) {
          console.log(`Skipping registration. Tutor with WhatsApp No: ${whatsappNo} already exists.`);
          continue; // Skip this tutor
        } 
        const tutorData = {
          name: row[1] || "", // Column C
          email: row[0] || "", // Column B
          whatsappNo: formatWhatsAppNumber(row[2]) || "", // Column D
          phoneNumber: formatWhatsAppNumber(row[2]) || "", // Column D (same as WhatsApp)
          instituteName: row[5] || "", // Column G
          highestDegree: row[6] || "", // Column H
          department: row[8] || "", // Column J
          expertSkills: row[9] ? row[9].split(",").map((s) => s.trim()) : [], // Column K (array)
          intermediateSkills: row[10] ? row[10].split(",").map((s) => s.trim()) : [], // Column L (array)
          beginnerSkills: row[11] ? row[11].split(",").map((s) => s.trim()) : [], // Column M (array)
          experience: "NA", // Column N
          collegeIdCardUrl: row[12] || "", // Column N
          isLateNightCallOk: row[14]?.toLowerCase() === "yes", // Column P (convert to boolean)
          previousAssignmentLinks: row[15] ? row[15].split("\n") : [], // Column Q (array)
          paymentDetails: {
            bankHolderName: row[17] || "", // Column S
            accountNumber: row[18] || "", // Column T
            IFSC: row[19] || "", // Column U
            upiHolderName: row[17] || "", // Column S (same as bank holder)
            upiID: row[16] || "", // Column R
          },
        };

        // Save the tutor in MongoDB
        const newTutor = new Tutor(tutorData);
        const savedTutor = await newTutor.save();
        console.log(`Tutor ${savedTutor.name} registered successfully`);
        delay(300)
      } catch (err) {
        console.error("Error registering tutor:", err.message);
      }


    }
  } catch (error) {
    console.error("Error fetching data from Google Sheets:", error.message);
  }
} 
async function checkTutorsFromSheet(start, end) {
  try {
    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: authClient });

    const SPREADSHEET_ID = "1EaXOSm1Bj02HXQgDaPnp0i9rvFRnqouD8qfIkxBISh4"; // Your Sheet ID
    const SHEET_NAME = "Form Responses 1"; // Replace with your actual sheet name
    const START_ROW = start;
    const END_ROW = end;
    
    const range = `${SHEET_NAME}!B${START_ROW}:U${END_ROW}`; // Fetch all required columns

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: range,
    });

    const rows = response.data.values;

    if (!rows || rows.length === 0) {
      console.log("No data found in the specified range.");
      return;
    }

    function isValidUpiId(upiID) {
      const upiRegex = /^[\w.-]+@[\w.-]+$/;
      return upiRegex.test(upiID);
    }

    for (const row of rows) {
      try {
        const whatsappNo = formatWhatsAppNumber(row[2]) || ""; // Column D (WhatsApp Number)
        
        // Check if a tutor with the same WhatsApp number exists
        const existingTutor = await Tutor.findOne({ whatsappNo });

        if (existingTutor) {
          // console.log("Tutor Found:", existingTutor);
          
          if (!existingTutor.paymentDetails.upiID || !isValidUpiId(existingTutor.paymentDetails.upiID)) {
            console.log(`Checking and updating payment details for tutor with WhatsApp No: ${whatsappNo}`);
            console.log(row[17], row[18] , row[19] , row[16])
            if (row[17] && row[18] && row[19] && row[16] && isValidUpiId(row[16])) {
              const updatedPaymentDetails = {
                bankHolderName: row[17], // Column S
                accountNumber: row[18], // Column T
                IFSC: row[19], // Column U
                upiHolderName: row[17], // Column S (same as bank holder)
                upiID: row[16], // Column R
              };
              console.log({updatedPaymentDetails})
              await Tutor.updateOne(
                { whatsappNo },
                { $set: { paymentDetails: updatedPaymentDetails } }
              );
              console.log("Payment details updated successfully.");
            } else {
              console.log("Incomplete or invalid payment details found, skipping update.");
            }
          }else{console.log(`upi exist!!! for ${whatsappNo}`)}
        } else {
          console.log(`No tutor found with WhatsApp No: ${whatsappNo}`);
        }
      } catch (err) {
        console.error("Error checking tutor:", err.message);
      }
    }
  } catch (error) {
    console.error("Error fetching data from Google Sheets:", error.message);
  }
}

// Function to update tutor skills from Google Sheet
async function updateTutorSkillsFromSheet(spreadsheetId, sheetName, start, end) {
  try {
    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: authClient });

    const START_ROW = start; // Starting row number
    const END_ROW = end; // Ending row number

    // Fetch data from columns A (TutorID), I (Column 9), J (Column 10), K (Column 11)
    const range = `${sheetName}!A${START_ROW}:K${END_ROW}`;

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: range,
    });

    const rows = response.data.values;

    if (!rows || rows.length === 0) {
      console.log("No data found in the specified range.");
      return { success: false, message: "No data found" };
    }

    let updatedCount = 0;
    let notFoundCount = 0;
    let errorCount = 0;
    const updateResults = [];

    for (const row of rows) {
      try {
        const tutorID = row[0] || ""; // Column A (TutorID)
        
        if (!tutorID || tutorID.trim() === "") {
          console.log("Skipping row with empty TutorID");
          continue;
        }

        // Find the tutor by tutorID
        const existingTutor = await Tutor.findOne({ tutorID: tutorID.trim() });

        if (existingTutor) {
          // Parse skills from columns 9, 10, 11 (indices 8, 9, 10)
          const expertSkills = row[8] ? row[8].split(",").map((s) => s.trim()).filter(s => s !== "") : [];
          const intermediateSkills = row[9] ? row[9].split(",").map((s) => s.trim()).filter(s => s !== "") : [];
          const beginnerSkills = row[10] ? row[10].split(",").map((s) => s.trim()).filter(s => s !== "") : [];

          // Update the tutor's skills
          const updatedTutor = await Tutor.findOneAndUpdate(
            { tutorID: tutorID.trim() },
            {
              $set: {
                expertSkills: expertSkills,
                intermediateSkills: intermediateSkills,
                beginnerSkills: beginnerSkills
              }
            },
            { new: true } // Return updated document
          );

          if (updatedTutor) {
            updatedCount++;
            updateResults.push({
              tutorID: tutorID,
              name: updatedTutor.name,
              status: 'updated',
              expertSkills: expertSkills,
              intermediateSkills: intermediateSkills,
              beginnerSkills: beginnerSkills
            });
            console.log(`Updated skills for tutor ${tutorID} - ${updatedTutor.name}`);
          }
        } else {
          notFoundCount++;
          updateResults.push({
            tutorID: tutorID,
            status: 'not_found',
            message: `Tutor with ID ${tutorID} not found`
          });
          console.log(`Tutor with ID ${tutorID} not found`);
        }

        // Add delay to avoid overwhelming the database
        await delay(200);

      } catch (err) {
        errorCount++;
        updateResults.push({
          tutorID: row[0] || "unknown",
          status: 'error',
          error: err.message
        });
        console.error("Error updating tutor skills:", err.message);
      }
    }

    const summary = {
      totalProcessed: rows.length,
      updated: updatedCount,
      notFound: notFoundCount,
      errors: errorCount,
      details: updateResults
    };

    console.log("Skills update completed:", summary);
    return { success: true, summary: summary };

  } catch (error) {
    console.error("Error fetching data from Google Sheets:", error.message);
    return { success: false, error: error.message };
  }
}

 // Endpoint to register tutors
router.post('/register-tutors',authMiddleware, async (req, res) => {
  try {
      const { start, end } = req.body;

      // Validate inputs
      if (typeof start !== 'number' || typeof end !== 'number') {
          return res.status(400).json({ error: 'Invalid start or end value' });
      }
      // console.log({start,end})
      // Call your function with the provided start and end values
      await registerTutorsFromSheet(start, end);

      res.status(200).json({ message: 'Tutors registered successfully' });
  } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Something went wrong' });
  }
});
 
// Endpoint to update tutor skills from Google Sheet
router.put('/update-skills-from-sheet', async (req, res) => {
  try {
     const spreadsheetId= "1k8oneu9JP9Lvle8EryN9T6x2g1BmRyVZwN_ygn5uNf8";
     const  sheetName = "Tutors";
      const {  start, end } = req.body;

      // Validate inputs
      if (!spreadsheetId || !sheetName || typeof start !== 'number' || typeof end !== 'number') {
          return res.status(400).json({ 
              error: 'Invalid parameters. Required: spreadsheetId, sheetName, start, end',
              example: { 
                  start: 2,
                  end: 100
              }
          });
      }

      console.log(`Updating skills from sheet: ${sheetName}, rows ${start}-${end}`);
      
      // Call the function to update skills from sheet
      const result = await updateTutorSkillsFromSheet(spreadsheetId, sheetName, start, end);

      if (result.success) {
          res.status(200).json({ 
              message: 'Tutor skills updated successfully',
              summary: result.summary
          });
      } else {
          res.status(500).json({ 
              error: 'Failed to update skills',
              details: result.error
          });
      }

  } catch (error) {
      console.error('Error in update-skills-from-sheet:', error);
      res.status(500).json({ error: 'Something went wrong', details: error.message });
  }
});

// Save Tutor Data
router.post('/tutors', async (req, res) => {
  try {
      // Step 1: Format the WhatsApp number before saving
      const formattedWhatsAppNo = formatWhatsAppNumber(req.body.whatsappNo);
      const formattedPhonepNo = formatWhatsAppNumber(req.body.phoneNumber);
      // Step 2: Create a new tutor instance with formatted WhatsApp number
      const tutor = new Tutor({ ...req.body, whatsappNo: formattedWhatsAppNo, phoneNumber:formattedPhonepNo });

      // Step 3: Save the tutor data
      const savedTutor = await tutor.save();
    console.log({savedTutor})
      // Step 4: Update the ContactSchema entry if a match exists
      const updatedContact = await Contact.findOneAndUpdate(
          { phone_number: formattedWhatsAppNo }, // Use formatted number to match
          { $set: { tutorID: savedTutor.tutorID } }, // Update tutorID
          { new: true } // Return updated document
      );
      console.log({updatedContact})
      res.status(201).json({
          message: 'Tutor saved successfully',
          tutor: savedTutor,
          updatedContact: updatedContact || "No contact match"
      });

  } catch (error) {
      console.error('Error saving tutor:', error.message);
      res.status(500).json({ error: 'Failed to save tutor data', details: error.message });
  }
});
 
 //to change the status of the tutor 
router.put('/status', async (req, res) => {
  try { 
      const {tutorID, status } = req.body; 
      // Validate status
      console.log({tutorID,status})
      const validStatuses = ['new', 'active', 'inactive', 'warning 1', 'warning 2', 'warning 3', 'delete'];
      if (!validStatuses.includes(status)) {
          return res.status(400).json({ error: "Invalid status value" });
      }

      // Update tutor status
      const updatedTutor = await Tutor.findOneAndUpdate(
          {tutorID},
          { $set: { status } },
          { new: true } // Return updated document
      ); 
      if (!updatedTutor) {
          return res.status(404).json({ error: "Tutor not found" });
      }

      res.status(200).json({
          message: "Tutor status updated successfully",
          tutor: updatedTutor
      });
  } catch (error) {
      console.error("Error updating tutor status:", error.message);
      res.status(500).json({ error: "Failed to update tutor status", details: error.message });
  }
});

// // Get Tutors with Pagination
// router.get('/tutors', async (req, res) => {
//     try {
//       const skip = parseInt(req.query.skip) || 0; // Default skip to 0
//       const limit = parseInt(req.query.limit) || 30; // Default limit to 30
  
//       const tutors = await Tutor.find()
//         .sort({ overallRating: -1 }) // Sort by overallRating in descending order
//         .skip(skip) // Skip the specified number of records
//         .limit(limit); // Limit the number of records returned
  
//       res.status(200).json(tutors);
//     } catch (error) {
//       console.error('Error fetching tutors:', error.message);
//       res.status(500).json({ error: 'Failed to fetch tutors', details: error.message });
//     }
//   });
  

// Update Rating Per Task (Append New Rating)
router.patch('/api/tutors/:id/rating', async (req, res) => {
    try {
      const { id } = req.params;
      const { newRating } = req.body; // Expect `newRating` object in the request body
  
      if (!newRating || typeof newRating !== 'object') {
        return res.status(400).json({ error: '`newRating` must be an object' });
      }
  
      // Update the array by appending the new rating
      const updatedTutor = await Tutor.findByIdAndUpdate(
        id,
        { $push: { rattingPerTask: newRating } }, // Append the object to `rattingPerTask`
        { new: true } // Return the updated document
      );
  
      if (!updatedTutor) {
        return res.status(404).json({ error: 'Tutor not found' });
      }
  
      res.status(200).json({
        message: 'Rating updated successfully',
        tutor: updatedTutor,
      });
    } catch (error) {
      console.error('Error updating rating:', error.message);
      res.status(500).json({ error: 'Failed to update rating', details: error.message });
    }
  });

  router.get('/search', authMiddleware, async (req, res) => {
    try {
      const searchTerm = req.query.q || ""; // Search term from frontend
      const skip = parseInt(req.query.skip, 10) || 0; // Number of items to skip
      const limit = parseInt(req.query.limit, 10) || 30; // Number of items to return
  
      // Aggregation Pipeline
      const query = [
        {
          $match: {
            $or: [
              { tutorID: { $regex: searchTerm, $options: "i" } },
              { name: { $regex: searchTerm, $options: "i" } },
              { expertSkills: { $elemMatch: { $regex: searchTerm, $options: "i" } } }, // Search inside expertSkills array
              { intermediateSkills: { $elemMatch: { $regex: searchTerm, $options: "i" } } }, // Search inside intermediateSkills array
              { beginnerSkills: { $elemMatch: { $regex: searchTerm, $options: "i" } } } // Search inside beginnerSkills array
            ]
          }
        },
        {
          $addFields: {
            priorityScore: {
              $switch: {
                branches: [
                  { case: { $regexMatch: { input: "$tutorID", regex: searchTerm, options: "i" } }, then: 3 },
                  { case: { $regexMatch: { input: "$name", regex: searchTerm, options: "i" } }, then: 3 },
                  { case: { $gt: [{ $size: { $filter: { input: "$expertSkills", as: "skill", cond: { $regexMatch: { input: "$$skill", regex: searchTerm, options: "i" } } } } }, 0] }, then: 3 },
                  { case: { $gt: [{ $size: { $filter: { input: "$intermediateSkills", as: "skill", cond: { $regexMatch: { input: "$$skill", regex: searchTerm, options: "i" } } } } }, 0] }, then: 2 },
                  { case: { $gt: [{ $size: { $filter: { input: "$beginnerSkills", as: "skill", cond: { $regexMatch: { input: "$$skill", regex: searchTerm, options: "i" } } } } }, 0] }, then: 1 }
                ],
                default: 0
              }
            }
          }
        },
        {
          $match: {
            priorityScore: { $gt: 0 } // Ensure only matched results are included
          }
        },
        {
          $sort: { priorityScore: -1, rating: -1 } // Sort by priority and rating
        },
        {
          $skip: skip
        },
        {
          $limit: limit
        }
      ];
  
      // Fetch results
      const results = await Tutor.aggregate(query);
  
      // Encrypt sensitive data
      const encryptedResults =(req.user?.role && req.user?.role==="admin")?results : results.map(tutor => ({
        ...tutor,
        whatsappNo: encryptFunction(tutor.whatsappNo),
        phoneNumber: encryptFunction(tutor.phoneNumber)
      }));
  
      // Count total matching documents (excluding pagination)
      const totalCountResult = await Tutor.aggregate([
        ...query.slice(0, -3), // Remove $skip & $limit
        { $count: "total" }
      ]);
      const total = totalCountResult.length > 0 ? totalCountResult[0].total : 0;
  
      // Send response
      res.status(200).json({
        success: true,
        data: encryptedResults,
        pagination: { skip, limit, total }
      });
  
    } catch (error) {
      console.error("Search API error:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  // for the reviews adding 

  router.get("/:tutorID/reviews", authMiddleware, async (req, res) => {
    try {
      const { tutorID } = req.params;
  
      const tutor = await Tutor.findOne({ tutorID }).select(
        "tutorID name rating ratingPerAssignment"
      );
  
      if (!tutor) {
        return res.status(404).json({
          success: false,
          message: "Tutor not found",
        });
      }
  
      return res.status(200).json({
        success: true,
        reviews: tutor.ratingPerAssignment || [],
      });
    } catch (error) {
      console.error("Fetch tutor reviews error:", error);
  
      return res.status(500).json({
        success: false,
        message: "Failed to fetch tutor reviews",
        error: error.message,
      });
    }
  });
  
  router.post("/:tutorID/review", authMiddleware, async (req, res) => {
    try {
      const { tutorID } = req.params;
      const { rating, taskID, comment } = req.body;
  
      const numericRating = Number(rating);
      const cleanTaskID = String(taskID || "").trim();
      const cleanComment = String(comment || "").trim();
  
      if (!cleanTaskID) {
        return res.status(400).json({
          success: false,
          message: "Task ID is required",
        });
      }
  
      if (
        !Number.isFinite(numericRating) ||
        numericRating < 1 ||
        numericRating > 5
      ) {
        return res.status(400).json({
          success: false,
          message: "Rating must be between 1 and 5",
        });
      }
  
      const tutor = await Tutor.findOne({ tutorID });
  
      if (!tutor) {
        return res.status(404).json({
          success: false,
          message: "Tutor not found",
        });
      }
  
      if (!Array.isArray(tutor.ratingPerAssignment)) {
        tutor.ratingPerAssignment = [];
      }
  
      const review = {
        rating: numericRating,
        taskID: cleanTaskID,
        comment: cleanComment,
        ratedBy:
          req.user?.userName ||
          req.user?.name ||
          req.user?.email ||
          "Admin",
        createdAt: new Date(),
      };
  
      tutor.ratingPerAssignment.push(review);
  
      const totalRating = tutor.ratingPerAssignment.reduce(
        (sum, item) => sum + Number(item?.rating || 0),
        0
      );
  
      tutor.rating =
        tutor.ratingPerAssignment.length > 0
          ? Number(
              (
                totalRating / tutor.ratingPerAssignment.length
              ).toFixed(1)
            )
          : 0;
  
      await tutor.save();
  
      const savedReview =
        tutor.ratingPerAssignment[
          tutor.ratingPerAssignment.length - 1
        ];
  
      return res.status(201).json({
        success: true,
        message: "Review added successfully",
        review: savedReview,
        averageRating: tutor.rating,
        totalReviews: tutor.ratingPerAssignment.length,
      });
    } catch (error) {
      console.error("Add tutor review error:", error);
  
      return res.status(500).json({
        success: false,
        message: "Failed to add tutor review",
        error: error.message,
      });
    }
  });
  
  
  // Update TestScore and TestMarks for a Tutor
router.put('/update-test-score/:phoneNumber', async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const { testScore, totlaMarks } = req.body;

   

    // Update the tutor document
    const updatedTutor = await Tutor.findOneAndUpdate(
      { phoneNumber },
      { $set: { testScore, totlaMarks } },
      { new: true }
    );

    if (!updatedTutor) {
      return res.status(404).json({ error: 'Tutor not found' });
    }

    res.status(200).json({
      message: 'Test score and marks updated successfully',
      tutor: updatedTutor
    });
  } catch (error) {
    console.error('Error updating test score:', error.message);
    res.status(500).json({ error: 'Failed to update test score', details: error.message });
  }
});
  
  
//rating the tutor per task 
  router.post("/rate-tutor",authMiddleware, async (req, res) => {
    try {
      console.log("Rate Tutor Request Body:", req.body);
      const { tutorID, taskID, rating, ratedBy } = req.body;
  
      // Validation
      if (!tutorID || !taskID || typeof rating !== "number") {
        return res.status(400).json({ message: "Invalid data provided" });
      }

      if (rating < 1 || rating > 5) {
        return res.status(400).json({ message: "Rating must be between 1 and 5" });
      }
  
      // Find the tutor
      const tutor = await Tutor.findOne({ tutorID });
      if (!tutor) {
        return res.status(404).json({ message: "Tutor not found" });
      }
  
      // Update or insert rating for the given taskID
      const existingIndex = tutor.ratingPerAssignment.findIndex((entry) => entry.taskID === taskID);
      if (existingIndex !== -1) {
        // Update existing rating
        tutor.ratingPerAssignment[existingIndex].rating = rating;
        tutor.ratingPerAssignment[existingIndex].updatedAt = new Date();
        if (ratedBy) {
          tutor.ratingPerAssignment[existingIndex].ratedBy = ratedBy;
        }
      } else {
        // Add new rating
        const newRatingEntry = {
          taskID,
          rating,
          createdAt: new Date(),
          ratedBy: ratedBy || "Anonymous"
        };
        tutor.ratingPerAssignment.push(newRatingEntry);
      }
  
      // Calculate new average rating (with safety check)
      const totalRatings = tutor.ratingPerAssignment.length;
      if (totalRatings === 0) {
        return res.status(400).json({ message: "No ratings found" });
      }
      
      const avgRating = tutor.ratingPerAssignment.reduce((sum, entry) => sum + entry.rating, 0) / totalRatings;
  
      // Update the tutor's overall rating (simple Number field)
      tutor.rating = parseFloat(avgRating.toFixed(3));
  
      // Save the updated tutor document
      await tutor.save();
  
      res.json({ 
        message: "Rating submitted successfully", 
        overallRating: tutor.rating,
        totalRatings: totalRatings,
        taskID: taskID
      });
    } catch (error) {
      console.error("Error rating tutor:", error);
      res.status(500).json({ message: "Internal server error", details: error.message });
    }
  });

  // router.get('/search', async (req, res) => {
  //   try {
  //     const searchTerm = req.query.q || ""; // Search term from the frontend
  //     const skip = parseInt(req.query.skip, 10) || 0; // Number of items to skip
  //     const limit = parseInt(req.query.limit, 10) || 30; // Number of items to return
  
  //     // Build the aggregation pipeline
  //     const aggregationPipeline = [
  //       // Match tutors that have the searchTerm in any of the skills or tutorID
  //       {
  //         $match: {
  //           $or: [
  //             { tutorID: { $regex: searchTerm, $options: "i" } },
  //             { expertSkills: { $regex: searchTerm, $options: "i" } },
  //             { intermediateSkills: { $regex: searchTerm, $options: "i" } },
  //             { beginnerSkills: { $regex: searchTerm, $options: "i" } },
  //           ],
  //         },
  //       },
  //       // Project a new field that will contain the skill level priority based on the search term match
  //       {
  //         $project: {
  //           name: 1,
  //           tutorID: 1,
  //           expertSkills: 1,
  //           intermediateSkills: 1,
  //           beginnerSkills: 1,
  //           rating: 1,
  //           ratingPerAssignment: 1,
  //           highestDegree: 1,
  //           department: 1,
  //           status: 1,
  //           searchMatchLevel: {
  //             $cond: {
  //               if: {
  //                 $gt: [
  //                   { $size: { $ifNull: [{ $regexMatch: { input: { $arrayElemAt: ["$expertSkills", 0] }, regex: searchTerm, options: "i" } }, []] } },
  //                   0
  //                 ]
  //               },
  //               then: 1, // 1 for expert skills
  //               else: {
  //                 $cond: {
  //                   if: {
  //                     $gt: [
  //                       { $size: { $ifNull: [{ $regexMatch: { input: { $arrayElemAt: ["$intermediateSkills", 0] }, regex: searchTerm, options: "i" } }, []] } },
  //                       0
  //                     ]
  //                   },
  //                   then: 2, // 2 for intermediate skills
  //                   else: 3, // 3 for beginner skills
  //                 },
  //               },
  //             },
  //           },
  //         },
  //       },
  //       // Sort the results to prioritize based on the searchMatchLevel (1 = expert, 2 = intermediate, 3 = beginner)
  //       {
  //         $sort: {
  //           searchMatchLevel: 1, // Sorting to show experts first, intermediates second, and beginners last
  //           rating: -1, // Sort by rating in descending order
  //         },
  //       },
  //       // Paginate the results
  //       {
  //         $skip: skip,
  //       },
  //       {
  //         $limit: limit,
  //       },
  //     ];
  
  //     // Execute the aggregation pipeline
  //     const results = await Tutor.aggregate(aggregationPipeline);
  
  //     // Send response
  //     res.status(200).json({
  //       success: true,
  //       data: results,
  //       pagination: {
  //         skip,
  //         limit,
  //         total: await Tutor.countDocuments({
  //           $or: [
  //             { tutorID: { $regex: searchTerm, $options: "i" } },
  //             { expertSkills: { $regex: searchTerm, $options: "i" } },
  //             { intermediateSkills: { $regex: searchTerm, $options: "i" } },
  //             { beginnerSkills: { $regex: searchTerm, $options: "i" } },
  //           ],
  //         }),
  //       },
  //     });
  //   } catch (error) {
  //     console.error("Search API error:", error);
  //     res.status(500).json({ success: false, message: "Internal server error" });
  //   }
  // });
  

  // Function to format WhatsApp number
const formatWhatsAppNumber = (number) => {
  if (!number) return null;
  
  // Remove all non-numeric characters
  let digits = number.replace(/\D/g, ""); 

  // Ensure it's a valid Indian number (10 digits)
  if (digits.length === 10) {
    return `+91${digits}`; // Prepend +91
  } else if (digits.length === 12 && digits.startsWith("91")) {
    return `+${digits}`; // Already in correct format
  } else {
    return "Invalid Number"; // Doesn't match expected format
  }
}; 
// API to format and update all WhatsApp and phone numbers in MongoDB
router.put("/update-contacts", async (req, res) => {
  try {
    const tutors = await Tutor.find({}); // Fetch all tutors

    let updatedTutors = [];

    for (let tutor of tutors) {
      const formattedWhatsApp = formatWhatsAppNumber(tutor.whatsappNo);
      const formattedPhone = formatWhatsAppNumber(tutor.phoneNumber);

      // Only update if there is a change
      if (formattedWhatsApp !== "Invalid Number" || formattedPhone !== "Invalid Number") {
        const updatedTutor = await Tutor.findByIdAndUpdate(
          tutor._id,
          { 
            whatsappNo: formattedWhatsApp, 
            phoneNumber: formattedPhone 
          },
          { new: true } // Return the updated document
        );

        updatedTutors.push(updatedTutor);
      }
    }

    console.log("Updated Tutor Contacts:", updatedTutors);
    return res.json({ message: "Contacts updated successfully", data: updatedTutors });

  } catch (error) {
    console.error("Error updating contacts:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

  
 
// API to match contacts with tutors and update tutorID
router.put("/update-contact-tutors", async (req, res) => {
  try {
    console.log("start refresh tutor id...")
    // Fetch all contacts
    const contacts = await Contact.find({});
    
    let updatedContacts = [];

    for (let contact of contacts) {
      // Find a matching tutor by whatsappNo
      if(contact.tutorID!=="TI0000")continue;
      const matchingTutor = await Tutor.findOne({ whatsappNo: contact.phone_number });

      if (matchingTutor) {
        // Update the tutorID in ContactSchema if a match is found
        const updatedContact = await Contact.findByIdAndUpdate(
          contact._id,
          { tutorID: matchingTutor.tutorID },
          { new: true } // Return updated document
        );

        updatedContacts.push(updatedContact);
      }
    }

    console.log("Updated Contacts:", updatedContacts);
    return res.json({ message: "Contacts updated successfully", data: updatedContacts });

  } catch (error) {
    console.error("Error updating contacts:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});


// DELETE API to delete a tutor by tutorID
router.delete('/delete-tutor/:tutorID', authMiddleware, async (req, res) => {
  const { tutorID } = req.params;

  try {
    const result = await Tutor.findOneAndDelete({ tutorID }); // Correct usage
    if (result) {
      res.status(200).json({ success: true, message: `Tutor with ID ${tutorID} deleted successfully` });
    } else {
      res.status(404).json({ success: false, message: `Tutor with ID ${tutorID} not found` });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong while deleting the tutor' });
  }
});


const Task = require("../models/task")
async function findInvalidTutorsTask() {
  try {
    // Fetch all tasks where tutorID is not "NA"
    const tasks = await Task.find({ "tutorDetails.tutorID": { $ne: "NA" } }, "tutorDetails.tutorID tutorDetails.name");
    // console.log(tasks)
    // Extract unique tutorIDs from tasks
    const tutorIDs = [...new Set(tasks.map(task => task.tutorDetails.tutorID))];
    
    // Find which tutorIDs exist in the Tutor collection
    const existingTutors = await Tutor.find({ tutorID: { $in: tutorIDs } }, "tutorID");
    const existingTutorIDs = new Set(existingTutors.map(tutor => tutor.tutorID));
    
    // Filter out tasks whose tutorID is not found in Tutor collection
    const invalidTutors = tasks.filter(task => !existingTutorIDs.has(task.tutorDetails.tutorID));
    
    // Return tutorID and name of tasks whose tutor is not found in Tutor schema
    return invalidTutors.map(task => console.log({ tutorID: task.tutorDetails.tutorID, name: task.tutorDetails.name }));
  } catch (error) {
    console.error("Error finding invalid tutors:", error.message);
    return [];
  }
}


const findInvalidTutors = async () => {
  try {
    // Find all contacts where tutorID is not "TI0000"
    const contacts = await Contact.find({ tutorID: { $ne: "TI0000" } }, "tutorID phone_number");
    
    if (!contacts.length) {
      console.log("No contacts found with a tutorID other than TI0000.");
      return [];
    }

    // Get all unique tutorIDs from contacts
    const tutorIDs = [...new Set(contacts.map(contact => contact.tutorID))];
    
    // Find tutorIDs that exist in the Tutor collection
    const existingTutors = await Tutor.find({ tutorID: { $in: tutorIDs } }, "tutorID");
    const existingTutorIDs = new Set(existingTutors.map(tutor => tutor.tutorID));
    
    // Filter out contacts whose tutorID is not found in Tutor
    const invalidTutors = contacts.filter(contact => !existingTutorIDs.has(contact.tutorID));

    console.log("Invalid Tutors:", invalidTutors);
    return invalidTutors;
  } catch (error) {
    console.error("Error finding invalid tutors:", error);
    return [];
  }
};
 
// findInvalidTutors()
router.get('/tutors-by-date', async (req, res) => {
  try {
    const queryDate = req.query.date; // e.g., ?date=2025-05-05

    if (!queryDate) {
      return res.status(400).json({ error: 'Date query param is required in format YYYY-MM-DD' });
    }

    const startOfDay = new Date(queryDate);
    const endOfDay = new Date(queryDate);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const startObjectId = mongoose.Types.ObjectId.createFromTime(startOfDay.getTime() / 1000);
    const endObjectId = mongoose.Types.ObjectId.createFromTime(endOfDay.getTime() / 1000);

    const tutors = await Tutor.find({
      _id: {
        $gte: startObjectId,
        $lt: endObjectId
      }
    }).select('name phoneNumber');
    tutors.map(v=>console.log(v.name," ",v.phoneNumber))
    res.json(tutors);
  } catch (error) {
    console.error('Error fetching tutors by date:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


module.exports = router 




