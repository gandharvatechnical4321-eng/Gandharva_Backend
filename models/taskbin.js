const mongoose = require('mongoose');

const TaskBinSchema = new mongoose.Schema(
  {
    taskID: {
      type: String,
      required: true,
      unique: true,
      index: true, // For faster search by taskID
    },
    clientDetails: {
        clientID: {
            type: String,
            required: true,
          },
          name: {
            type: String,
            required: true,
          },
          subject: {
            type: String, 
            required: false,
          },
          totalAmount: {
            type: Number, 
            required: true,
          },
          receivedAmount: {
            type: Number,
            default:0,
            required: true,
          },
          duration: {
            type: Number, 
            required: false, // Duration in hours or minutes depending on your use case
          },
          type: {
            type: String,
            enum: ['assignment', 'project', 'session'],
            default:"assignment",
            required: true,
          },
    },
    tutorDetails: {
        tutorID: {
            type: String,
            default:"NA",
            required: false,
          },
          name: {
            type: String,
            default:"NA",
            required: false,
          },
          totalAmount: {
            type: Number,
            default:0,
            required: false,
          },
          amountPaid: {
            type: Number,
            default:0,
            required: true,
          },
    },
    status: {
      type: String,
      enum: ['New Task', 'Advance Received', 'Tutor Notified' , 'Tutot Assigned' , 'Solution Received' , 'Task Complited','Being Modified','Cencel'], // Example statuses
      default: 'Pending',
    },
    agentDetails: {
      name:{
        type: String,
        require:false,
      },
      comment:{
        type:String,
        require:false
      }
    },
    driveLink: {
      type: String,
      default:"NA",
      require:false
    },
    clientDeadline: {
      type: Date,
      index: true, // Optimized for filtering
    },
    tutorDeadline: {
      type: Date,  
      default:new Date('2000-01-01T00:00:00Z'),  
    },
  },
  { timestamps: true }
);

 
module.exports = mongoose.model('TaskBin', TaskBinSchema);
