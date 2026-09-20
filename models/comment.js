const mongoose = require('mongoose');
const { Schema } = mongoose;

const commentSchema = new Schema(
  {
    taskID: {
      type: String,
      default: "T0Igeneral",
    },
    clientID: {
      type: String,
      required: true,
    },
    comment: {
      type: String,
      required: true,
    },
    executiveName: {
      type: String,
      required: true,
    },
    deadline: {
      type: Date, // optional field
      default:new Date()
    },
    status: {
      type: String,
      enum: ["pending", "done", "cancel"],
      default: "pending",
    },
  },
  { timestamps: true } // automatically adds createdAt and updatedAt fields
);

module.exports = mongoose.model('Comment', commentSchema);
