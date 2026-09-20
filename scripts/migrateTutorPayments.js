const mongoose = require("mongoose");
const Task = require("./models/task");

async function migrateTutorPaymentFields() {
  try {
    await mongoose.connect(
      process.env.MONGODB_URI
    );

    const result = await Task.updateMany(
      {
        "tutorDetails.paymentApprovalStatus": {
          $exists: false,
        },
      },
      {
        $set: {
          "tutorDetails.paymentApprovalStatus":
            "Pending Approval",

          "tutorDetails.paymentApprovedBy":
            "",

          "tutorDetails.paidOn":
            null,

          "tutorDetails.paymentRemarks":
            "",
        },
      }
    );

    console.log(
      "Matched tasks:",
      result.matchedCount
    );

    console.log(
      "Updated tasks:",
      result.modifiedCount
    );
  } catch (error) {
    console.error(
      "Migration failed:",
      error
    );
  } finally {
    await mongoose.disconnect();
  }
}

migrateTutorPaymentFields();


// node scripts/migrateTutorPayments.js