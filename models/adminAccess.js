const mongoose = require("mongoose");

const adminAccessSchema = new mongoose.Schema(
  {
    employeeCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },

    employeeId: {
      type: String,
      default: null,
    },

    fullName: {
      type: String,
      default: "",
    },

    username: {
      type: String,
      default: "",
    },

    email: {
      type: String,
      default: "",
    },

    employeeDatabaseRole: {
      type: String,
      default: "INCHARGE",
    },

    dashboardRole: {
      type: String,
      default: "admin",
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "AdminAccess",
  adminAccessSchema
);