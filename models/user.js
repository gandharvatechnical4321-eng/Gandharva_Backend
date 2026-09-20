const mongoose = require("mongoose");
const userSchema = new mongoose.Schema({
  device:{type:String, required:true, default: "device 1"},
  firebaseUid: { type: String, unique: true, sparse: true, index: true },
    email: { type: String, required: true, unique: true, trim:true, lowercase:true }, //some updates


            fullName: {
        type: String,
        },

        userName: {
        type: String,
        },

        username: {
        type: String,
        },

        employeeCode: {
        type: String,
        },

        employeeRole: {
        type: String,
        },

        dashboardRole: {
          type: String,
          default: "",
        },

        employeeStatus: {
        type: String,
        },

        profileImageUrl: {
        type: String,
        },

        externalEmployeeId: {
        type: mongoose.Schema.Types.ObjectId,
        }, 
        // device: {
        // type: String,
        // default: "device 1",
        // },


    // Firebase owns passwords; never store them in MongoDB.
    isVerified: { type: Boolean, default: false }, // To check if user verified OTP
    attempt:{type:Number,default:0}
});

module.exports = mongoose.model("User", userSchema);
