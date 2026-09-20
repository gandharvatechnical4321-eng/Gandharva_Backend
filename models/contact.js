const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema(
  {
    chatId: {
      type: String,
      unique: true,
      required: true
    },
    brand: {
      type: String,
      enum: ["", "NA", "AW", "GM", "AG", "IS", "MA","GS" , "TH"],
      default: "",
    },
    tutorID:{
      type:String,
      default:"TI0000"
    },
    lastMsgTime: {
      type: Date, 
      required: true,
      default: new Date('3000-01-01T00:00:00Z'), //1jan 2000
    },
    pined:{
      type:Boolean,
      default:false
    },
    name: {
      type: String,
      required: true, // Ensure every contact has a name
      trim: true, // Removes extra spaces 
    },
    phone_number: {
      type: String,
      required: true,
      unique: true, // Ensures no duplicate phone numbers
      match: /^\+\d{1,15}$/, // Validates international phone numbers
    },
    last_message_id: {
      type: mongoose.Schema.Types.ObjectId, // Reference to the last message
      ref: 'Message', // Reference to the Message collection
      default:null
    },
                  
    unread_count: {     
      type: Number,
      default: 0, // Count of unread messages
    },
    level : {
      type: String,
      enum: ['new client', 'old client', 'tutor', 'int_comm','useless'], // Possible statuses for the contact
      default: 'new client', // Default to active
    },
    comeThrough:{
      type:String,
      default:null,
      require:false
    },
    mark: {
        type: String,
        enum: ['bed', 'unknown','average', 'good'], // Possible statuses for the contact
        default: 'unknown', // Default to active
      },
    queryStatus:{
      type:String,
      require:false
    },
    queryDate:{
      type:Date,
      require:false
    }
  },
  {
    timestamps: true, // Adds createdAt and updatedAt fields automatically
  }
);
// Text index for searching chatId, tutorID, and name
contactSchema.index({
  chatId: "text",
  tutorID: "text",
  name: "text",
  phone_number:"text"
});
// Index for fast queries on phone_number
contactSchema.index({ pined: 1, lastMsgTime: -1 });
contactSchema.index({ queryStatus: 1, queryDate: -1 });

module.exports = mongoose.model('Contact', contactSchema);
