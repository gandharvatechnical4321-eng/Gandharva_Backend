const express = require('express');
const router = express.Router();
const Task = require("../models/task")
const TaskBin = require("../models/taskbin")
const cron = require('node-cron');

const authMiddleware = require('../middleware/authMiddleware')
// API to save task data
router.post('/newtask',authMiddleware, async (req, res) => {
  try {
    const taskData = req.body;
    console.log({taskData})
    if (!taskData || Object.keys(taskData).length === 0) {
      return res.status(400).json({ error: 'Invalid task data' });
    }
    const newTask = new Task(taskData);
    console.log({newTask})
    await newTask.save();
    res.status(200).json(newTask);
  } catch (error) {
    console.error('Error saving task:', error);
    res.status(500).json({ error: 'Failed to save task data',error });
  } 
});    

 
// Update Task API
router.put("/update-task/:taskID", authMiddleware, async (req, res) => {
  const { taskID } = req.params;
  const {status, subject, tutorDetails, agentComment, clientDetails,clientDeadline,tutorDeadline} = req.body;

  try {
    const existingTask = await Task.findOne({ taskID })
      .select("tutorDetails.paymentApprovalStatus tutorDetails.paymentApprovedBy tutorDetails.paidOn")
      .lean();

    if (!existingTask) {
      return res.status(404).json({ message: "Task not found" });
    }

    const paymentWasReleased =
      existingTask.tutorDetails?.paymentApprovalStatus === "Paid";
    const paymentStatus =
      paymentWasReleased || tutorDetails?.paymentStatus === "confirm"
        ? "confirm"
        : "hold";
    const paymentApprovalStatus =
      paymentWasReleased
        ? "Paid"
        : paymentStatus === "confirm"
        ? "Approved"
        : "Pending Approval";
    const approverName =
      req.user?.fullName ||
      req.user?.userName ||
      req.user?.employeeCode ||
      "Unknown";
    const employeeCode = req.user?.employeeCode || "";
    const paymentApprovedBy = employeeCode
      ? `${approverName} (${employeeCode})`
      : String(approverName);

    const updatedTask = await Task.findOneAndUpdate(
      { taskID },
      { 
        $set: {
          "status":status,
          "subject":subject,
          "tutorDetails.tutorID": tutorDetails.tutorID,
          "tutorDetails.name": tutorDetails.name,
          "tutorDetails.totalAmount":status==="Cancel"?0:tutorDetails.totalAmount,
          "tutorDetails.paymentStatus": paymentStatus,
          "tutorDetails.paymentApprovalStatus": paymentApprovalStatus,
          "tutorDetails.paymentApprovedBy":
            paymentWasReleased
              ? existingTask.tutorDetails?.paymentApprovedBy || ""
              : paymentStatus === "confirm"
              ? paymentApprovedBy
              : "",
          "tutorDetails.paidOn": paymentWasReleased
            ? existingTask.tutorDetails?.paidOn || null
            : null,
          "clientDetails.totalAmount": clientDetails.totalAmount, 
          "clientDetails.instituteName": clientDetails.instituteName, 
          "clientDetails.currencyType":clientDetails.currencyType,
          "clientDetails.receivedAmount": clientDetails.receivedAmount,
          "clientDetails.sessionStartTime": clientDetails.sessionStartTime, 
          "clientDetails.duration": clientDetails.duration,
          "clientDetails.type": clientDetails.type,
          "clientDetails.fullCourse": clientDetails.fullCourse,
          "clientDetails.refundAmount": clientDetails.refundAmount,
          "clientDetails.reasionForRefCan": clientDetails.reasionForRefCan,
          "agentDetails.comment": agentComment, 
          "clientDeadline":new Date(clientDeadline),
          "tutorDeadline":new Date(tutorDeadline),
        },
      },
      { new: true }   
    ); 

    if (!updatedTask) {
      return res.status(404).json({ message: "Task not found" });
    }

    res.status(200).json({ message: "Task updated successfully", task: updatedTask });
  } catch (error) {
    console.error("Error updating task:", error);
    res.status(500).json({ message: "Internal server error" });
  }})


 
// // GET tasks with clientDeadline ending in the next 24 hours
// router.get('/client-deadline/next-24-hours', async (req, res) => {
//     try {
//       const now = new Date();
//       const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Add 24 hours to the current time
  
//       const tasks = await Task.find({
//         clientDeadline: { $gte: now, $lte: next24Hours }, // Filter tasks in the next 24 hours
//       }).sort({ clientDeadline: 1 }); // Sort by clientDeadline in ascending order
  
//       res.status(200).json({
//         success: true,
//         data: tasks,
//       });
//     } catch (error) {
//       console.error('Error fetching tasks:', error);
//       res.status(500).json({
//         success: false,
//         message: 'An error occurred while fetching tasks.',
//         error: error.message,
//       });
//     }
//   });



router.get('/client-deadline/next-24-hours',authMiddleware, async (req, res) => {
  try {
    let ID;
    if(req.user?.device){
      const deviceNo   = req.user.device.split(" ")[1]
      ID = deviceNo==="1"?"TI":`T${deviceNo}I`
    }
      const { searchQuery, page = 1, limit = 7 } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const now = new Date();
      const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      // Construct search filter
      let searchFilter = {
        taskID: { $regex: `^${ID}`, $options: "i" },// Ensures taskID starts with ID
          clientDeadline: { $gte: now, $lte: next24Hours } // Filter within next 24 hours
      };

      if (searchQuery) {
          const regex = new RegExp(searchQuery, 'i'); // Case-insensitive search
          searchFilter.$or = [
              { taskID: regex },
              { "clientDetails.chatID": regex },
              { "tutorDetails.tutorID": regex },
              { status: regex }
          ];
      }

      // Get total count for pagination
      const totalCount = await Task.countDocuments(searchFilter);

      // Fetch matching tasks with pagination
      const tasks = await Task.find(searchFilter)
          .sort({ clientDeadline: 1 })
          .skip(skip)
          .limit(parseInt(limit));

      res.status(200).json({
          success: true,
          data: tasks,
          totalPages: Math.ceil(totalCount / limit),
          currentPage: parseInt(page),
          totalTasks: totalCount,
      });
  } catch (error) {
      console.error('Error fetching tasks:', error);
      res.status(500).json({
          success: false,
          message: 'An error occurred while fetching tasks.',
          error: error.message,
      });
  }
});



// GET tasks with clientDeadline ending in the next 24 hours with pagination
// router.get('/client-deadline/next-24-hours', async (req, res) => {
//   try {
//       const now = new Date();
//       const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

//       // Get page number from query, default to 1
//       let page = parseInt(req.query.page) || 1;
//       let limit =req.query.limit || 7; // Max 7 cards per page
//       let skip = (page - 1) * limit;

//       // Get total count for pagination metadata
//       const totalCount = await Task.countDocuments({
//           clientDeadline: { $gte: now, $lte: next24Hours },
//       });

//       const tasks = await Task.find({
//           clientDeadline: { $gte: now, $lte: next24Hours },
//       })
//           .sort({ clientDeadline: 1 })
//           .skip(skip)
//           .limit(limit);

//       res.status(200).json({
//           success: true,
//           data: tasks,
//           totalPages: Math.ceil(totalCount / limit),
//           currentPage: page,
//           totalTasks: totalCount,
//       });
//   } catch (error) {
//       console.error('Error fetching tasks:', error);
//       res.status(500).json({
//           success: false,
//           message: 'An error occurred while fetching tasks.',
//           error: error.message,
//       });
//   }
// });

  // GET tasks with clientDeadline after  now
// router.get('/client-deadline/after-now', async (req, res) => {
//     try {
//       const now = new Date(); 
//       const tasks = await Task.find({
//         clientDeadline: { $gt: now }, // Filter tasks with deadline after 24 hours
//       }).sort({ clientDeadline: 1 }); // Sort by clientDeadline in ascending order
  
//       res.status(200).json({
//         success: true,
//         data: tasks,
//       });
//     } catch (error) {
//       console.error('Error fetching tasks:', error);
//       res.status(500).json({
//         success: false,
//         message: 'An error occurred while fetching tasks.',
//         error: error.message,
//       });
//     }
//   });
router.get('/client-deadline/after-now',authMiddleware, async (req, res) => {
  try {
    let ID;
    if(req.user?.device){
      const deviceNo   = req.user.device.split(" ")[1]
      ID = deviceNo==="1"?"TI":`T${deviceNo}I`
    }
      const now = new Date();
      let { searchQuery, page = 1, limit = 7 } = req.query;

      page = parseInt(page);
      limit = parseInt(limit);
      const skip = (page - 1) * limit;

      // Base filter: Only tasks where clientDeadline is in the future
      let searchFilter = {
        taskID: { $regex: `^${ID}`, $options: "i" },// Ensures taskID starts with ID
         clientDeadline: { $gt: now } };

      if (searchQuery) {
          const regex = new RegExp(searchQuery, 'i'); // Case-insensitive regex search
          searchFilter.$or = [
              { taskID: regex },
              { "clientDetails.chatID": regex },
              { "tutorDetails.tutorID": regex },
              { status: regex }
          ];
      }

      // Get total count for pagination
      const totalTasks = await Task.countDocuments(searchFilter);

      // Fetch matching tasks with pagination
      const tasks = await Task.find(searchFilter)
          .sort({ clientDeadline: 1 })
          .skip(skip)
          .limit(limit);

      res.status(200).json({
          success: true,
          data: tasks,
          totalPages: Math.ceil(totalTasks / limit),
          currentPage: page,
          totalTasks: totalTasks
      });
  } catch (error) {
      console.error('Error fetching tasks:', error);
      res.status(500).json({
          success: false,
          message: 'An error occurred while fetching tasks.',
          error: error.message,
      });
  } 
});

// GET tasks with clientDeadline ending in the next 24 hours with pagination
// router.get('/client-deadline/next-24-hours', async (req, res) => {
//   try {
//       const now = new Date();
//       const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

//       // Get page number from query, default to 1
//       let page = parseInt(req.query.page) || 1;
//       let limit =req.query.limit || 7; // Max 7 cards per page
//       let skip = (page - 1) * limit;

//       // Get total count for pagination metadata
//       const totalCount = await Task.countDocuments({
//           clientDeadline: { $gte: now, $lte: next24Hours },
//       });

//       const tasks = await Task.find({
//           clientDeadline: { $gte: now, $lte: next24Hours },
//       })
//           .sort({ clientDeadline: 1 })
//           .skip(skip)
//           .limit(limit);

//       res.status(200).json({
//           success: true,
//           data: tasks,
//           totalPages: Math.ceil(totalCount / limit),
//           currentPage: page,
//           totalTasks: totalCount,
//       });
//   } catch (error) {
//       console.error('Error fetching tasks:', error);
//       res.status(500).json({
//           success: false,
//           message: 'An error occurred while fetching tasks.',
//           error: error.message,
//       });
//   }
// });

  // GET tasks with clientDeadline after  now
// router.get('/client-deadline/after-now', async (req, res) => {
//     try {
//       const now = new Date(); 
//       const tasks = await Task.find({
//         clientDeadline: { $gt: now }, // Filter tasks with deadline after 24 hours
//       }).sort({ clientDeadline: 1 }); // Sort by clientDeadline in ascending order
  
//       res.status(200).json({
//         success: true,
//         data: tasks,
//       });
//     } catch (error) {
//       console.error('Error fetching tasks:', error);
//       res.status(500).json({
//         success: false,
//         message: 'An error occurred while fetching tasks.',
//         error: error.message,
//       });
//     }
//   });
router.get('/client-deadline/before-30days',authMiddleware, async (req, res) => {
  try {
    let ID;
    if(req.user?.device){
      const deviceNo   = req.user.device.split(" ")[1]
      ID = deviceNo==="1"?"TI":`T${deviceNo}I`
    }
      const preRecord = new Date(new Date().getTime() - 30 * 24 * 60 * 60 * 1000);
      let { searchQuery, page = 1, limit = 0 } = req.query;

      page = parseInt(page);
      limit = parseInt(limit);
      const skip = (page - 1) * limit;

      // Base filter: Only tasks where clientDeadline is in the future
      let searchFilter = {
        taskID: { $regex: `^${ID}`, $options: "i" },// Ensures taskID starts with ID
         clientDeadline: { $lt: preRecord } };

      if (searchQuery) {
          const regex = new RegExp(searchQuery, 'i'); // Case-insensitive regex search
          searchFilter.$or = [
              { taskID: regex },
              { "clientDetails.chatID": regex },
              { "tutorDetails.tutorID": regex },
              { status: regex }
          ];
      }

      // Get total count for pagination
      const totalTasks = await Task.countDocuments(searchFilter);

      // Fetch matching tasks with pagination
      const tasks = await Task.find(searchFilter)
          .sort({ clientDeadline: -1 })
          .skip(skip)
          .limit(limit);

      res.status(200).json({
          success: true,
          data: tasks,
          totalPages: Math.ceil(totalTasks / limit),
          currentPage: page,
          totalTasks: totalTasks
      });
  } catch (error) {
      console.error('Error fetching tasks:', error);
      res.status(500).json({
          success: false,
          message: 'An error occurred while fetching tasks.',
          error: error.message,
      });
  } 
});

  // GET tasks with clientDeadline between now and the past 30 days
// router.get('/client-deadline/last-30-days', async (req, res) => {
//     try {
//       const now = new Date();
//       const past30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // Calculate 30 days before now
  
//       const tasks = await Task.find({
//         clientDeadline: { $gte: past30Days, $lte: now }, // Filter tasks with deadline between past 3 days and now
//       }).sort({ clientDeadline: -1 }); // Sort by clientDeadline in ascending order
  
//       res.status(200).json({
//         success: true,
//         data: tasks,
//       });
//     } catch (error) {
//       console.error('Error fetching tasks:', error);
//       res.status(500).json({
//         success: false,
//         message: 'An error occurred while fetching tasks.',
//         error: error.message,
//       });
//     }
//   });
  
router.get('/client-deadline/alltask',authMiddleware, async (req, res) => {
  try {
    let ID;
    if(req.user?.device){
      const deviceNo   = req.user.device.split(" ")[1]
      ID = deviceNo==="1"?"TI":`T${deviceNo}I`
    }
      // const now = new Date();
      // const past30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days before now

      let { searchQuery, page = 1, limit = 7 } = req.query;
      page = parseInt(page);
      limit = parseInt(limit);
      const skip = (page - 1) * limit;

      // Base filter: Only tasks where clientDeadline is within the last 30 days
      let searchFilter = {
        taskID: { $regex: `^${ID}`, $options: "i" },// Ensures taskID starts with ID
         };

      if (searchQuery==="hold") {
          const regex = new RegExp(searchQuery, 'i'); // Case-insensitive regex search
          searchFilter.$or = [
              { "tutorDetails.paymentStatus": regex }
          ];
      }else{
        const regex = new RegExp(searchQuery, 'i'); // Case-insensitive regex search
        searchFilter.$or = [
            { taskID: regex },
            { "clientDetails.chatID": regex },
            { "tutorDetails.tutorID": regex },
            { status: regex }
        ];
      }

      // Get total count for pagination
      const totalTasks = await Task.countDocuments(searchFilter);

      // Fetch matching tasks with pagination
      const tasks = await Task.find(searchFilter)
          .sort({ clientDeadline: -1 }) // Sort in descending order (most recent first)
          .skip(skip)
          .limit(limit);

      res.status(200).json({
          success: true,
          data: tasks,
          totalPages: Math.ceil(totalTasks / limit),
          currentPage: page,
          totalTasks: totalTasks
      });
  } catch (error) {
      console.error('Error fetching tasks:', error);
      res.status(500).json({
          success: false,
          message: 'An error occurred while fetching tasks.',
          error: error.message,
      });
  }
});


// GET tasks with status 'Advance Received' or 'Tutor Notified'
// router.get('/status/advance-or-notified', async (req, res) => {
//   try {
//     // Query tasks where status is 'Advance Received' or 'Tutor Notified'
//     const tasks = await Task.find({
//       status: { $in: ['Advance Received', 'Tutor Notified'] },
//     }).sort({ clientDeadline: 1 }); // Optional sorting by deadline

//     res.status(200).json({
//       success: true,
//       data: tasks,
//     });
//   } catch (error) {
//     console.error('Error fetching tasks:', error);
//     res.status(500).json({
//       success: false,
//       message: 'An error occurred while fetching tasks.',
//       error: error.message,
//     });
//   }
// });
router.get('/status/advance-or-notified',authMiddleware, async (req, res) => {
  try {
    let ID;
    if(req.user?.device){
      const deviceNo   = req.user.device.split(" ")[1]
      ID = deviceNo==="1"?"TI":`T${deviceNo}I`
    }
    const page = parseInt(req.query.page) || 1; // Default to page 1
    const limit = parseInt(req.query.limit) || 10; // Default limit to 10 tasks per page
    const skip = (page - 1) * limit;
    const { searchQuery } = req.query;

    // Base filter: Only tasks with status 'Advance Received' or 'Tutor Notified'
    let searchFilter = {
      taskID: { $regex: `^${ID}`, $options: "i" },// Ensures taskID starts with ID
       status: { $in: ['Advance Received', 'Tutor Notified'] } };

    if (searchQuery) {
      const regex = new RegExp(searchQuery, 'i'); // Case-insensitive regex search
      searchFilter.$or = [
        { taskID: regex },
        { "clientDetails.chatID": regex },
        { "tutorDetails.tutorID": regex },
        { status: regex }
      ];
    }

    const totalTasks = await Task.countDocuments(searchFilter);

    const tasks = await Task.find(searchFilter)
      .sort({ clientDeadline: 1 }) // Optional sorting by deadline
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      success: true,
      data: tasks,
      totalPages: Math.ceil(totalTasks / limit),
      currentPage: page,
      totalTasks: totalTasks,
    });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching tasks.',
      error: error.message,
    });
  }
});

router.post("/getNewTaskID", authMiddleware, async (req, res) => {
  try {
    const { chatID } = req.body;
    if (!chatID) {
      return res.status(400).json({ error: "chatID is required" });
    }

    let ID = "TI"; // Default prefix
    if (req.user?.device) {
      const deviceNo = req.user.device.split(" ")[1];
      ID = deviceNo === "1" ? "TI" : `T${deviceNo}I`;
    }

    // Count existing tasks where chatID is inside clientDetails
    const taskCount = await Task.countDocuments({ "clientDetails.chatID": chatID });

    // Increment task count and format it as a 4-digit number
    const newTaskNumber = String(taskCount + 1).padStart(4, "0"); // Ensures 4-digit format

    // Generate new TaskID
    const newTaskID = `${ID}${chatID}${newTaskNumber}`;

    res.status(200).json({ newTaskID });
  } catch (error) {
    console.error("Error generating new TaskID:", error);
    res.status(500).json({ error: "Failed to generate new TaskID" });
  }
});

 





// Schedule the cron job to run daily at midnight to move task in taskbin whose Clinet dedline has passed by one month
cron.schedule('0 0 * * *', async () => {
    try {
      const now = new Date();
   
      // Calculate the 30-days-ago threshold
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  
      // Find tasks that need to be moved
      const tasksToMove = await Task.find({ clientDeadline: { $lte: thirtyDaysAgo } });
  
      if (tasksToMove.length > 0) {
        // Attempt to move tasks to TaskBin
        const result = await TaskBin.insertMany(tasksToMove);
  
        // Check if all tasks were successfully moved
        const movedTaskIds = result.map((task) => task._id.toString());
        const allMovedSuccessfully = movedTaskIds.length === tasksToMove.length;
  
        if (allMovedSuccessfully) {
          // Delete only the tasks that were moved successfully
          await Task.deleteMany({ _id: { $in: movedTaskIds } });
  
          console.log(`Successfully moved and deleted ${movedTaskIds.length} tasks.`);
        } else {
          console.warn('Some tasks were not moved successfully. No tasks were deleted.');
        }
      } else {
        console.log('No tasks to move at this time.');
      }
    } catch (error) {
      console.error('Error moving tasks:', error);
    }
  });

module.exports = router 




