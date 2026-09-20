const express = require("express");
const router = express.Router();
const Comment = require("../models/comment");
const authMiddleware = require('../middleware/authMiddleware')
 
router.post("/addcomment",authMiddleware, async (req, res) => {
  try {
    let ID = "TI"; // Default prefix
    if (req.user?.device) {
      const deviceNo = req.user.device.split(" ")[1];
      ID = deviceNo === "1" ? "TI" : `T${deviceNo}I`;
    }
    const { clientID, comment, executiveName, deadline, taskID } = req.body;

    if (!clientID || !comment || !executiveName) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const newComment = new Comment({
      clientID,
      comment,
      executiveName,
      deadline,
      taskID: taskID || `${ID}general`,
    });

    const savedComment = await newComment.save();
    res.status(201).json({ message: "Comment added successfully", savedComment });
  } catch (error) {
    console.error("❌ Error adding comment:", error.message);
    res.status(500).json({ error: "Failed to add comment", details: error.message });
  }
});

// 📌 2️⃣ Change Comment Status
router.put("/:id/status",authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["pending", "done", "cancel"].includes(status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }

    const updatedComment = await Comment.findByIdAndUpdate(
      id,
      { status },
      { new: true } // Returns updated document
    );

    if (!updatedComment) {
      return res.status(404).json({ error: "Comment not found" });
    }

    res.status(200).json({ message: "Comment status updated", updatedComment });
  } catch (error) {
    console.error("❌ Error updating comment status:", error.message);
    res.status(500).json({ error: "Failed to update status", details: error.message });
  }
});


// Get all comments for a specific taskID, sorted by deadline in descending order
router.get("/allcomment/:taskID",authMiddleware, async (req, res) => {
    try {
      const { taskID } = req.params;
  
      const comments = await Comment.find({ taskID })
        .sort({ deadline: -1 }) // Sort in descending order based on deadline
        .exec();
  
      res.status(200).json({ success: true, comments });
    } catch (error) {
      console.error("❌ Error fetching comments:", error);
      res.status(500).json({ success: false, message: "Failed to fetch comments", error: error.message });
    }
  }); 

// Search comments with pagination (by TaskID, ClientID, or Status)
router.get("/search", authMiddleware, async (req, res) => {
    try {
      let ID;
      if(req.user?.device){
        const deviceNo   = req.user.device.split(" ")[1]
        ID = deviceNo==="1"?"TI":`T${deviceNo}I`
      }
      console.log("API called...");
  
      const { search, page = 1, limit = 10 } = req.query;
  
      // Pagination settings
      const pageNumber = parseInt(page, 10);
      const pageSize = parseInt(limit, 10);
      const skip = (pageNumber - 1) * pageSize;
  
      
      let searchFilter = {
        taskID: { $regex: `^${ID}`, $options: "i" } };
      if (search) {
        searchFilter.$or = [
          { taskID: search },         // Match Task ID
          { clientID: search },       // Match Client ID
          { status: { $regex: new RegExp(search, "i") } }, // Match Status (case-insensitive)
        ];
      }
  
      // Fetch comments with sorting & pagination
      const comments = await Comment.find(searchFilter)
      .sort({status:-1})
        .sort({ deadline: -1 }) // Sort by deadline (Descending)
        .skip(skip)
        .limit(pageSize);
  
      // Get total count for pagination metadata
      const totalCount = await Comment.countDocuments(searchFilter);
    
      res.json({
        success: true,
        totalPages: Math.ceil(totalCount / pageSize),
        currentPage: pageNumber,
        totalComments: totalCount,
        comments,
      });
    } catch (error) {
      console.error("❌ Error fetching comments:", error);
      res.status(500).json({ success: false, message: "Internal Server Error" });
    }
  });
  
module.exports = router;
