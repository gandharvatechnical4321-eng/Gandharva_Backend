// const mongoose = require('mongoose');

// const TaskSchema =new mongoose.Schema(
//   {
//     taskID: {
//       type: String,
//       required: true,
//       unique: true,
//       index: true, // For faster search by taskID
//     },
//     subject: {
//       type: String, 
//       required: false,
//     },
//     subjectDes: {
//       type: String, 
//       required: false,
//     },
//     clientDetails: {
//         chatID: {
//             type: String,
//             required: true,
//           },   
//           name: {
//             type: String,
//             required: true,
//           },
//          currencyType:{
//           type:String,
//           require:true
//          },
//          instituteName:{
//           type:String,
//           require:false
//          },
//           totalAmount: {
//             type: Number, 
//             required: true,
//           },
//           receivedAmount: {
//             type: Number,
//             default:0,
//             required: false,
//           },
//           sessionStartTime: {
//             type: Date,  
//             default:new Date('2000-01-01T00:00:00Z'),  
//           },
//           duration: {
//             type: Number, 
//             required: false, // Duration in hours or minutes depending on your use case
//           },
//           type: {
//             type: String,
//             enum: ['assignment', 'project', 'session'],
//             default:"assignment",
//             required: false,
//           },
//           fullCourse:{
//             type:Boolean,
//             default:false
//           },
//           refundAmount: {
//             type: Number,
//             default: 0
//         },
//         reasionForRefCan: {
//             type: String,
//             default: "NA"
//         }
//     },
//     tutorDetails: {
//         tutorID: {
//             type: String,
//             default:"NA",
//             required: false,
//           },
//           name: {
//             type: String,
//             default:"NA",
//             required: false,
//           },
//           totalAmount: {
//             type: Number,
//             default:0,
//             required: false,
//           },
//           amountPaid: {
//             type: Number,
//             default:0,
//             required: false,
//           },
//           paymentStatus:{
//             type: String,
//             enum: ["hold", "confirm"],
//             default: "hold", // New field
//             required: true,
//           }
//     },
//     status: {
//       type: String,
//       // enum: ['New Task', 'Advance Received', 'Tutor Notified' , 'Tutot Assigned' , 'Solution Received' , 'Task Complited','Task Completed','Being Modified','Cancel','Refund'], // Example statuses
//       default: 'New Task',
//     },
//     agentDetails: {
//       name:{
//         type: String,
//         require:false,
//       },
//       comment:{
//         type:String,
//         require:false
//       }
//     },
//     driveLink: {
//       type: String,
//       default:"NA",
//       require:false
//     },
//     clientDeadline: {
//       type: Date,
//       index: true, // Optimized for filtering
//     },
//     tutorDeadline: {
//       type: Date,  
//       default:new Date(),  
//     },
//     intrestedTutors:{
//       type:[Object],
//       require:false
//     }
//   },
//   { timestamps: true }
// );
 
// module.exports = mongoose.model('Task', TaskSchema);


// new



const mongoose = require("mongoose");

const PAYMENT_APPROVAL_STATUSES = [
  "Pending Approval",
  "Approved",
  "On Hold",
  "Rejected",
  "Paid",
];

const TASK_TYPES = [
  "assignment",
  "project",
  "session",
];

const TaskSchema = new mongoose.Schema(
  {
    taskID: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    subject: {
      type: String,
      required: false,
      trim: true,
      default: "",
    },

    subjectDes: {
      type: String,
      required: false,
      default: "",
    },

    clientDetails: {
      chatID: {
        type: String,
        required: true,
        trim: true,
        index: true,
      },

      name: {
        type: String,
        required: true,
        trim: true,
      },

      currencyType: {
        type: String,
        required: true,
        trim: true,
      },

      instituteName: {
        type: String,
        required: false,
        trim: true,
        default: "",
      },

      totalAmount: {
        type: Number,
        required: true,
        min: 0,
      },

      receivedAmount: {
        type: Number,
        default: 0,
        required: false,
        min: 0,
      },

      sessionStartTime: {
        type: Date,
        default: () =>
          new Date("2000-01-01T00:00:00Z"),
      },

      duration: {
        type: Number,
        required: false,
        min: 0,
      },

      type: {
        type: String,
        enum: TASK_TYPES,
        default: "assignment",
        required: false,
      },

      fullCourse: {
        type: Boolean,
        default: false,
      },

      refundAmount: {
        type: Number,
        default: 0,
        min: 0,
      },

      reasionForRefCan: {
        type: String,
        default: "NA",
      },
    },

    tutorDetails: {
      tutorID: {
        type: String,
        default: "NA",
        required: false,
        trim: true,
        index: true,
      },

      name: {
        type: String,
        default: "NA",
        required: false,
        trim: true,
      },

      totalAmount: {
        type: Number,
        default: 0,
        required: false,
        min: 0,
      },

      amountPaid: {
        type: Number,
        default: 0,
        required: false,
        min: 0,
      },

      /*
        Existing field retained for old frontend/backend logic.
      */
      paymentStatus: {
        type: String,
        enum: ["hold", "confirm"],
        default: "hold",
        required: true,
      },

      paymentApprovalStatus: {
        type: String,
        enum: PAYMENT_APPROVAL_STATUSES,
        default: "Pending Approval",
        index: true,
      },

      paymentApprovedBy: {
        type: String,
        default: "",
        trim: true,
      },

      paidOn: {
        type: Date,
        default: null,
      },

      paymentRemarks: {
        type: String,
        default: "",
        trim: true,
        maxlength: 1000,
      },
    },

    status: {
      type: String,
      default: "New Task",
      index: true,
    },

    agentDetails: {
      name: {
        type: String,
        required: false,
        default: "",
      },

      comment: {
        type: String,
        required: false,
        default: "",
      },
    },

    driveLink: {
      type: String,
      default: "NA",
      required: false,
    },

    clientDeadline: {
      type: Date,
      index: true,
      default: null,
    },

    tutorDeadline: {
      type: Date,
      default: Date.now,
    },

    intrestedTutors: {
      type: [Object],
      required: false,
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

/*
  Useful indexes for the Tutor Payments page.
*/
TaskSchema.index({
  "tutorDetails.paymentApprovalStatus": 1,
  createdAt: -1,
});

TaskSchema.index({
  "tutorDetails.tutorID": 1,
  createdAt: -1,
});

TaskSchema.index({
  status: 1,
  "tutorDetails.paymentApprovalStatus": 1,
});

module.exports = mongoose.model(
  "Task",
  TaskSchema
);