const mongoose = require('mongoose');

// Define schema for the form data
const FormSchema = new mongoose.Schema({
  tutorID: {
    type: String,
    unique: true, // Ensure uniqueness
    required: false, // Set to false to allow middleware to generate it
  },
  name: String,
  email: String,
  whatsappNo: String,
  phoneNumber:{type: String, index:true},
  instituteName: String, 
  highestDegree: String,
  department: String,
  expertSkills: { type: [String], default: [] },
  intermediateSkills: { type: [String], required: false, default: [] },
  beginnerSkills: { type: [String], required: false, default: [] },
  experience: String,
  collegeIdCardUrl: String, // URL of the uploaded image
  isLateNightCallOk: Boolean,
  previousAssignmentLinks: {
    type: [String],
    default: [],
  },
  paymentDetails: {
    type: Object,
    default: {},
  },
  status: {
    type: String,
    default: "new",
    enum: ['new', 'active', 'inactive', 'warning 1','warning 2','warning 3', 'delete'],
  },
  rating: {
    type: Number,
    default: 0,
    set: (value) => {
      const numericValue = Number(value);

      if (!Number.isFinite(numericValue)) {
        return 0;
      }

      return Number(numericValue.toFixed(3));
    },
  },
  ratingPerAssignment: { type: Array, required: false, default: [], },
});

// Pre-save middleware to generate tutorID automatically
FormSchema.pre('save', async function (next) {
    if (!this.tutorID) {
      const lastTutor = await this.constructor.findOne().sort({ _id: -1 }).exec();
      
      if (lastTutor && lastTutor.tutorID) {
        // Extract numeric part of the last tutorID and increment it
        const lastID = lastTutor.tutorID;
        const num = parseInt(lastID.replace('TI', ''), 10);
        if (Number.isFinite(num)) {
          this.tutorID = `TI${String(num + 1).padStart(4, "0")}`;
        } else {
        // If no tutors exist, start with the first ID
        this.tutorID = 'TI0001';
      }
    }
    next();
  }});
 
// Compound index for skills and tutorID
FormSchema.index({
  tutorID: 1,
  expertSkills: 1,
  intermediateSkills: 1,
  beginnerSkills: 1,
  name:1,
  rating: -1,
});

module.exports = mongoose.model('Form', FormSchema);
