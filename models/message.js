const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    contact_id: {
      type: mongoose.Schema.Types.ObjectId, // Reference to a contact
      required: true,
      index: true, // Secondary index for faster queries by contact_id
    },
    message_id: { 
      type: String,
      required: true, // Ensure a message is always provided
      default:"none",
      index: true, // Index for faster lookups by message_id
    },
    message: {
      type: Object,
      required: true, // Ensure a message is always provided
    },
    direction: {
      type: String,
      enum: ['sent', 'received','both'],
      required: true, // Indicates whether the message was sent or received
    },
    timestamp: {
      type: Date,
      required: true,
      default: Date.now, // Automatically set the current date/time
    },
    messageSenderName: {
      type: String, 
      required: false, // Indicates whether the message was sent or received
    },
    status: {
      type: Number,
      enum: [-1,0,1, 2,3,4,5,6,7 ],
      //           0     1           2       3       4
      default:0, // Default message status
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 10519200, // TTL: Deletes documents after 120 days (4 months)
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt fields automatically
  }
);

// Compound index for sorting and filtering by contact_id and timestamp
messageSchema.index({ contact_id: 1, timestamp: 1 });

module.exports = mongoose.model('Message', messageSchema);
