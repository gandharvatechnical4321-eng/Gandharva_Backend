const express = require("express");

const Task = require("../models/task");
const Tutor = require("../models/tutor");
const Contact = require("../models/contact");
const authMiddleware = require(
  "../middleware/authMiddleware"
);

const router = express.Router();

/*
|--------------------------------------------------------------------------
| Roles
|--------------------------------------------------------------------------
*/

const ROLES = Object.freeze({
  OWNER: "owner",
  ADMIN: "admin",
  OPERATION_EXECUTIVE:
    "operation executive",
});

const READ_ROLES = new Set([
  ROLES.OWNER,
  ROLES.ADMIN,
  ROLES.OPERATION_EXECUTIVE,
]);

const MANAGE_ROLES = new Set([
  ROLES.OWNER,
  ROLES.ADMIN,
]);

/*
|--------------------------------------------------------------------------
| Payment statuses
|--------------------------------------------------------------------------
*/

const PAYMENT_APPROVAL_STATUSES =
  Object.freeze([
    "Pending Approval",
    "Approved",
    "On Hold",
    "Rejected",
    "Paid",
  ]);

const STATUS_UPDATE_VALUES = new Set([
  "Pending Approval",
  "Approved",
  "On Hold",
  "Rejected",
]);

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

const normalizeText = (value) =>
  String(value || "").trim();

const normalizeRole = (value) =>
  normalizeText(value).toLowerCase();

const escapeRegex = (value) =>
  String(value || "").replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );

const getRequestRole = (req) =>
  normalizeRole(req.user?.role);

const canReadPayments = (req) =>
  READ_ROLES.has(getRequestRole(req));

const canManagePayments = (req) =>
  MANAGE_ROLES.has(getRequestRole(req));

const getApproverName = (req) => {
  const name =
    req.user?.fullName ||
    req.user?.userName ||
    req.user?.employeeCode ||
    "Unknown";

  const employeeCode =
    req.user?.employeeCode || "";

  return employeeCode
    ? `${name} (${employeeCode})`
    : String(name);
};

const getTutorUPI = (paymentDetails) => {
  if (!paymentDetails) {
    return "";
  }

  if (typeof paymentDetails === "string") {
    return paymentDetails.trim();
  }

  /*
    Supports common existing key variations.
    Once you confirm the exact saved key, this
    can be reduced to only that key.
  */
  return String(
    paymentDetails.upiId ||
      paymentDetails.upiID ||
      paymentDetails.UPI_ID ||
      paymentDetails.upi ||
      paymentDetails.vpa ||
      paymentDetails["UPI ID"] ||
      ""
  ).trim();
};

const parsePositiveInteger = (
  value,
  fallback,
  maximum
) => {
  const parsedValue = Number.parseInt(
    value,
    10
  );

  if (
    !Number.isInteger(parsedValue) ||
    parsedValue <= 0
  ) {
    return fallback;
  }

  return Math.min(parsedValue, maximum);
};

const parseDateBoundary = (
  value,
  endOfDay = false
) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }

  return date;
};

const sendServerError = (
  res,
  message,
  error
) => {
  console.error(message, error);

  return res.status(500).json({
    success: false,
    message,

    error:
      process.env.NODE_ENV ===
      "development"
        ? error.message
        : undefined,
  });
};

/*
|--------------------------------------------------------------------------
| GET /api/tutor-payments
|--------------------------------------------------------------------------
|
| Allowed roles:
| owner
| admin
| operation executive
|
| Query parameters:
| search
| paymentStatus
| taskStatus
| brand
| paid
| startDate
| endDate
| page
| limit
|
*/

router.get(
  "/",
  authMiddleware,
  async (req, res) => {
    try {
      if (!canReadPayments(req)) {
        return res.status(403).json({
          success: false,
          message:
            "You are not authorized to view tutor payments.",
        });
      }

      const page = parsePositiveInteger(
        req.query.page,
        1,
        100000
      );

      const limit = parsePositiveInteger(
        req.query.limit,
        10,
        100000
      );

      const search = normalizeText(
        req.query.search
      );

      const paymentStatus = normalizeText(
        req.query.paymentStatus
      );

      const taskStatus = normalizeText(
        req.query.taskStatus
      );

      const brand = normalizeText(
        req.query.brand
      );

      const paidFilter = normalizeText(
        req.query.paid
      ).toLowerCase();

      const startDate = parseDateBoundary(
        req.query.startDate
      );

      const endDate = parseDateBoundary(
        req.query.endDate,
        true
      );

      if (
        req.query.startDate &&
        !startDate
      ) {
        return res.status(400).json({
          success: false,
          message:
            "startDate must be a valid date.",
        });
      }

      if (
        req.query.endDate &&
        !endDate
      ) {
        return res.status(400).json({
          success: false,
          message:
            "endDate must be a valid date.",
        });
      }

      if (
        paymentStatus &&
        !PAYMENT_APPROVAL_STATUSES.includes(
          paymentStatus
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid payment status.",
          allowedStatuses:
            PAYMENT_APPROVAL_STATUSES,
        });
      }

      /*
        Base Task filter.

        Only tasks having a valid assigned tutor
        and a tutor amount greater than zero are
        displayed.
      */
      const taskMatch = {
        "tutorDetails.tutorID": {
          $exists: true,
          $nin: [
            null,
            "",
            "NA",
            "N/A",
          ],
        },

        "tutorDetails.totalAmount": {
          $gt: 0,
        },
      };

      if (taskStatus) {
        taskMatch.status = taskStatus;
      }

      if (startDate || endDate) {
        taskMatch.createdAt = {};

        if (startDate) {
          taskMatch.createdAt.$gte =
            startDate;
        }

        if (endDate) {
          taskMatch.createdAt.$lte =
            endDate;
        }
      }

      if (search) {
        const searchRegex = new RegExp(
          escapeRegex(search),
          "i"
        );

        taskMatch.$or = [
          {
            taskID: searchRegex,
          },
          {
            subject: searchRegex,
          },
          {
            "tutorDetails.tutorID":
              searchRegex,
          },
          {
            "tutorDetails.name":
              searchRegex,
          },
        ];
      }

      /*
        Get actual collection names from Mongoose
        instead of assuming "forms" or "contacts".
      */
      const tutorCollectionName =
        Tutor.collection.name;

      const contactCollectionName =
        Contact.collection.name;

      const pipeline = [
        {
          $match: taskMatch,
        },

        /*
          Join Tutor using tutorID.
        */
        {
          $lookup: {
            from: tutorCollectionName,

            localField:
              "tutorDetails.tutorID",

            foreignField: "tutorID",

            as: "tutorRecord",
          },
        },

        {
          $unwind: {
            path: "$tutorRecord",
            preserveNullAndEmptyArrays: true,
          },
        },

        /*
          Join Contact to obtain existing brand.
        */
        {
          $lookup: {
            from: contactCollectionName,

            localField:
              "clientDetails.chatID",

            foreignField: "chatId",

            as: "contactRecord",
          },
        },

        {
          $unwind: {
            path: "$contactRecord",
            preserveNullAndEmptyArrays: true,
          },
        },

        /*
          Normalize old Task documents that do
          not yet have paymentApprovalStatus.
        */
        {
          $addFields: {
            resolvedPaymentStatus: {
  $ifNull: [
    "$tutorDetails.paymentApprovalStatus",
    {
      $cond: [
        {
          $eq: [
            "$tutorDetails.paymentStatus",
            "confirm",
          ],
        },
        {
          $cond: [
            {
              $and: [
                {
                  $gt: [
                    "$tutorDetails.totalAmount",
                    0,
                  ],
                },
                {
                  $gte: [
                    "$tutorDetails.amountPaid",
                    "$tutorDetails.totalAmount",
                  ],
                },
              ],
            },
            "Paid",
            "Approved",
          ],
        },
        "Pending Approval",
      ],
    },
  ],
},

            resolvedBrand: {
              $ifNull: [
                "$contactRecord.brand",
                "",
              ],
            },
          },
        },
      ];

      if (paymentStatus) {
        pipeline.push({
          $match: {
            resolvedPaymentStatus:
              paymentStatus,
          },
        });
      }

      if (brand) {
        pipeline.push({
          $match: {
            resolvedBrand: brand,
          },
        });
      }

      if (
        ["true", "yes", "paid"].includes(
          paidFilter
        )
      ) {
        pipeline.push({
          $match: {
            resolvedPaymentStatus:
              "Paid",
          },
        });
      }

      if (
        [
          "false",
          "no",
          "pending",
          "unpaid",
        ].includes(paidFilter)
      ) {
        pipeline.push({
          $match: {
            resolvedPaymentStatus: {
              $ne: "Paid",
            },
          },
        });
      }

      pipeline.push({
        $facet: {
          metadata: [
            {
              $count: "totalRecords",
            },
          ],

          summary: [
            {
              $group: {
                _id: null,

                paidAmount: {
                  $sum: {
                    $cond: [
                      {
                        $eq: [
                          "$resolvedPaymentStatus",
                          "Paid",
                        ],
                      },
                      {
                        $ifNull: [
                          "$tutorDetails.totalAmount",
                          0,
                        ],
                      },
                      0,
                    ],
                  },
                },

                paidCount: {
                  $sum: {
                    $cond: [
                      {
                        $eq: [
                          "$resolvedPaymentStatus",
                          "Paid",
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },

                onHoldAmount: {
                  $sum: {
                    $cond: [
                      {
                        $eq: [
                          "$resolvedPaymentStatus",
                          "On Hold",
                        ],
                      },
                      {
                        $ifNull: [
                          "$tutorDetails.totalAmount",
                          0,
                        ],
                      },
                      0,
                    ],
                  },
                },

                onHoldCount: {
                  $sum: {
                    $cond: [
                      {
                        $eq: [
                          "$resolvedPaymentStatus",
                          "On Hold",
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },

                pendingApprovalCount: {
                  $sum: {
                    $cond: [
                      {
                        $eq: [
                          "$resolvedPaymentStatus",
                          "Pending Approval",
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },

                approvedCount: {
                  $sum: {
                    $cond: [
                      {
                        $eq: [
                          "$resolvedPaymentStatus",
                          "Approved",
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },

                rejectedCount: {
                  $sum: {
                    $cond: [
                      {
                        $eq: [
                          "$resolvedPaymentStatus",
                          "Rejected",
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
              },
            },
          ],

          payments: [
            {
              $sort: {
                createdAt: -1,
                _id: -1,
              },
            },

            {
              $skip: (page - 1) * limit,
            },

            {
              $limit: limit,
            },

            {
              $project: {
                _id: 0,

                id: {
                  $toString: "$_id",
                },

                taskDate: "$createdAt",

                taskID: {
                  $ifNull: [
                    "$taskID",
                    "",
                  ],
                },

                subject: {
                  $ifNull: [
                    "$subject",
                    "",
                  ],
                },

                brand: "$resolvedBrand",

                tutorID: {
                  $ifNull: [
                    "$tutorDetails.tutorID",
                    "$tutorRecord.tutorID",
                  ],
                },

                tutorName: {
                  $cond: [
                    {
                      $and: [
                        {
                          $ne: [
                            "$tutorDetails.name",
                            null,
                          ],
                        },
                        {
                          $ne: [
                            "$tutorDetails.name",
                            "",
                          ],
                        },
                        {
                          $ne: [
                            "$tutorDetails.name",
                            "NA",
                          ],
                        },
                      ],
                    },
                    "$tutorDetails.name",
                    {
                      $ifNull: [
                        "$tutorRecord.name",
                        "",
                      ],
                    },
                  ],
                },

                tutorAmount: {
                  $ifNull: [
                    "$tutorDetails.totalAmount",
                    0,
                  ],
                },

                amountPaid: {
                  $ifNull: [
                    "$tutorDetails.amountPaid",
                    0,
                  ],
                },

                paymentApprovalStatus:
                  "$resolvedPaymentStatus",

                paymentApprovedBy: {
  $cond: [
    {
      $and: [
        {
          $ne: [
            "$tutorDetails.paymentApprovedBy",
            null,
          ],
        },
        {
          $ne: [
            "$tutorDetails.paymentApprovedBy",
            "",
          ],
        },
      ],
    },
    "$tutorDetails.paymentApprovedBy",
    "NA",
  ],
},

paidOn: {
  $ifNull: [
    "$tutorDetails.paidOn",
    null,
  ],
},

paymentRemarks: {
  $cond: [
    {
      $and: [
        {
          $ne: [
            "$tutorDetails.paymentRemarks",
            null,
          ],
        },
        {
          $ne: [
            "$tutorDetails.paymentRemarks",
            "",
          ],
        },
      ],
    },
    "$tutorDetails.paymentRemarks",
    "NA",
  ],
},
                taskStatus: {
                  $ifNull: [
                    "$status",
                    "",
                  ],
                },

                expectedPayDate: {
                  $dateAdd: {
                    startDate: "$tutorDeadline",
                    unit: "day",
                    amount: 7
                  }
                },

                paid: {
                  $eq: [
                    "$resolvedPaymentStatus",
                    "Paid",
                  ],
                },

                paidOn: {
                  $ifNull: [
                    "$tutorDetails.paidOn",
                    null,
                  ],
                },

                paymentRemarks: {
                  $ifNull: [
                    "$tutorDetails.paymentRemarks",
                    "",
                  ],
                },

                paymentDetails:
                  "$tutorRecord.paymentDetails",

                clientChatID: {
                  $ifNull: [
                    "$clientDetails.chatID",
                    "",
                  ],
                },
              },
            },
          ],
        },
      });

      const [result] =
        await Task.aggregate(pipeline);

      const totalRecords =
        result?.metadata?.[0]
          ?.totalRecords || 0;

      const totalPages = Math.max(
        1,
        Math.ceil(totalRecords / limit)
      );

      /*
        Convert existing tutor paymentDetails to
        a clean tutorUPI value.
      */
      const payments = (
        result?.payments || []
      ).map((payment) => {
        const {
          paymentDetails,
          ...cleanPayment
        } = payment;

        return {
          ...cleanPayment,

          remainingAmount: Math.max(
            Number(
              payment.tutorAmount || 0
            ) -
              Number(
                payment.amountPaid || 0
              ),
            0
          ),

          tutorUPI:
            getTutorUPI(
              paymentDetails
            ),
        };
      });

      const summary =
        result?.summary?.[0] || {
          paidAmount: 0,
          paidCount: 0,
          onHoldAmount: 0,
          onHoldCount: 0,
          pendingApprovalCount: 0,
          approvedCount: 0,
          rejectedCount: 0,
        };

      return res.status(200).json({
        success: true,
        payments,

        pagination: {
          page,
          limit,
          totalRecords,
          totalPages,
        },

        summary,
      });
    } catch (error) {
      return sendServerError(
        res,
        "Unable to fetch tutor payments.",
        error
      );
    }
  }
);

/*
|--------------------------------------------------------------------------
| PATCH /api/tutor-payments/:taskID/status
|--------------------------------------------------------------------------
|
| Allowed roles:
| owner
| admin
|
| Body:
| {
|   "status": "Approved",
|   "paymentRemarks": "Verified"
| }
|
*/

router.patch(
  "/:taskID/status",
  authMiddleware,
  async (req, res) => {
    try {
      if (!canManagePayments(req)) {
        return res.status(403).json({
          success: false,
          message:
            "Only Owner/Admin can update payment status.",
        });
      }

      const taskID = normalizeText(
        req.params.taskID
      );

      const status = normalizeText(
        req.body.status
      );

      const hasRemarks =
        Object.prototype.hasOwnProperty.call(
          req.body,
          "paymentRemarks"
        );

      const paymentRemarks = hasRemarks
        ? normalizeText(
            req.body.paymentRemarks
          )
        : undefined;

      if (!taskID) {
        return res.status(400).json({
          success: false,
          message:
            "Task ID is required.",
        });
      }

      if (
        !STATUS_UPDATE_VALUES.has(status)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid payment status. Use the paid endpoint for Paid status.",

          allowedStatuses: [
            ...STATUS_UPDATE_VALUES,
          ],
        });
      }

      if (
        paymentRemarks &&
        paymentRemarks.length > 1000
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Payment remarks cannot exceed 1000 characters.",
        });
      }

      const task = await Task.findOne({
        taskID,
      });

      if (!task) {
        return res.status(404).json({
          success: false,
          message:
            "Task was not found.",
        });
      }

      const currentPaymentStatus =
        task.tutorDetails
          ?.paymentApprovalStatus ||
        "Pending Approval";

      if (
        currentPaymentStatus === "Paid"
      ) {
        return res.status(409).json({
          success: false,
          message:
            "A paid payment cannot be changed through the status endpoint.",
        });
      }

      const tutorID = normalizeText(
        task.tutorDetails?.tutorID
      );

      if (
        !tutorID ||
        ["NA", "N/A"].includes(tutorID)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "A valid tutor is not assigned to this task.",
        });
      }

      const tutorAmount = Number(
        task.tutorDetails?.totalAmount ||
          0
      );

      if (
        !Number.isFinite(tutorAmount) ||
        tutorAmount <= 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Tutor amount must be greater than zero.",
        });
      }

      const updateFields = {
        "tutorDetails.paymentApprovalStatus": status,
        "tutorDetails.paymentStatus":
          status === "Approved" ? "confirm" : "hold",
        "tutorDetails.paidOn": null,
      };

      if (status === "Approved") {
        updateFields["tutorDetails.paymentApprovedBy"] =
          getApproverName(req);
      }

      if (hasRemarks) {
        updateFields["tutorDetails.paymentRemarks"] = paymentRemarks;
      }

      const updatedTask = await Task.findOneAndUpdate(
        {
          taskID,
          "tutorDetails.paymentApprovalStatus": {
            $ne: "Paid",
          },
        },
        {
          $set: updateFields,
        },
        {
          new: true,
          runValidators: true,
        }
      ).lean();

      if (!updatedTask) {
        return res.status(409).json({
          success: false,
          message:
            "Payment was already marked as paid or changed by another request.",
        });
      }

      return res.status(200).json({
        success: true,
        message: `Payment status updated to ${status}.`,

        payment: {
          taskID:
            updatedTask.taskID,

          tutorID:
            updatedTask.tutorDetails
              ?.tutorID || "",

          paymentApprovalStatus:
            updatedTask.tutorDetails
              ?.paymentApprovalStatus,

          paymentApprovedBy:
            updatedTask.tutorDetails
              ?.paymentApprovedBy || "",

          paidOn:
            updatedTask.tutorDetails
              ?.paidOn || null,

          paymentRemarks:
            updatedTask.tutorDetails
              ?.paymentRemarks || "",
        },
      });
    } catch (error) {
      return sendServerError(
        res,
        "Unable to update tutor payment status.",
        error
      );
    }
  }
);

/*
|--------------------------------------------------------------------------
| PATCH /api/tutor-payments/:taskID/paid
|--------------------------------------------------------------------------
|
| Allowed roles:
| owner
| admin
|
| Body:
| {
|   "paymentRemarks": "Paid through UPI"
| }
|
*/

router.patch(
  "/:taskID/paid",
  authMiddleware,
  async (req, res) => {
    try {
      if (!canManagePayments(req)) {
        return res.status(403).json({
          success: false,
          message:
            "Only Owner/Admin can mark a payment as paid.",
        });
      }

      const taskID = normalizeText(
        req.params.taskID
      );

      const hasRemarks =
        Object.prototype.hasOwnProperty.call(
          req.body,
          "paymentRemarks"
        );

      const paymentRemarks = hasRemarks
        ? normalizeText(
            req.body.paymentRemarks
          )
        : undefined;

      if (!taskID) {
        return res.status(400).json({
          success: false,
          message:
            "Task ID is required.",
        });
      }

      if (
        paymentRemarks &&
        paymentRemarks.length > 1000
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Payment remarks cannot exceed 1000 characters.",
        });
      }

      /*
        Read task first for validation and to get
        Tutor ID and amount.
      */
      const task = await Task.findOne({
        taskID,
      })
        .select(
          [
            "taskID",
            "tutorDetails",
          ].join(" ")
        )
        .lean();

      if (!task) {
        return res.status(404).json({
          success: false,
          message:
            "Task was not found.",
        });
      }

      const tutorID = normalizeText(
        task.tutorDetails?.tutorID
      );

      if (
        !tutorID ||
        ["NA", "N/A"].includes(tutorID)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "A valid tutor is not assigned to this task.",
        });
      }

      const tutorAmount = Number(
        task.tutorDetails?.totalAmount ||
          0
      );

      if (
        !Number.isFinite(tutorAmount) ||
        tutorAmount <= 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Tutor amount must be greater than zero.",
        });
      }

      const currentStatus =
        task.tutorDetails
          ?.paymentApprovalStatus ||
        "Pending Approval";

      if (currentStatus === "Paid") {
        return res.status(409).json({
          success: false,
          message:
            "Payment is already marked as paid.",
        });
      }

      if (currentStatus !== "Approved") {
        return res.status(400).json({
          success: false,
          message:
            "Payment must be approved before it can be marked as paid.",
          currentStatus,
        });
      }

      /*
        Confirm tutor and existing UPI details.
      */
      const tutor = await Tutor.findOne({
        tutorID,
      })
        .select(
          "tutorID name paymentDetails"
        )
        .lean();

      if (!tutor) {
        return res.status(404).json({
          success: false,
          message:
            "Tutor record was not found.",
        });
      }

      const tutorUPI = getTutorUPI(
        tutor.paymentDetails
      );

      if (!tutorUPI) {
        return res.status(400).json({
          success: false,
          message:
            "Tutor UPI ID is not available.",
        });
      }

      const updateFields = {
        "tutorDetails.paymentApprovalStatus":
          "Paid",

        "tutorDetails.paymentApprovedBy":
          getApproverName(req),

        "tutorDetails.paymentStatus":
          "confirm",

        "tutorDetails.amountPaid":
          tutorAmount,

        "tutorDetails.paidOn":
          new Date(),
      };

      if (hasRemarks) {
        updateFields[
          "tutorDetails.paymentRemarks"
        ] = paymentRemarks;
      }

      /*
        Atomic update:
        only an Approved payment can become Paid.
      */
      const updatedTask =
        await Task.findOneAndUpdate(
          {
            taskID,

            "tutorDetails.paymentApprovalStatus":
              "Approved",
          },
          {
            $set: updateFields,
          },
          {
            new: true,
            runValidators: true,
          }
        ).lean();

      if (!updatedTask) {
        return res.status(409).json({
          success: false,
          message:
            "Payment status changed before this request completed. Refresh and try again.",
        });
      }

      return res.status(200).json({
        success: true,
        message:
          "Tutor payment marked as paid.",

        payment: {
          taskID:
            updatedTask.taskID,

          tutorID:
            updatedTask.tutorDetails
              ?.tutorID || "",

          tutorName:
            updatedTask.tutorDetails
              ?.name ||
            tutor.name ||
            "",

          tutorAmount:
            updatedTask.tutorDetails
              ?.totalAmount || 0,

          amountPaid:
            updatedTask.tutorDetails
              ?.amountPaid || 0,

          paymentApprovalStatus:
            updatedTask.tutorDetails
              ?.paymentApprovalStatus,

          paymentApprovedBy:
            updatedTask.tutorDetails
              ?.paymentApprovedBy || "",

          paidOn:
            updatedTask.tutorDetails
              ?.paidOn || null,

          paymentRemarks:
            updatedTask.tutorDetails
              ?.paymentRemarks || "",

          tutorUPI,
        },
      });
    } catch (error) {
      return sendServerError(
        res,
        "Unable to mark tutor payment as paid.",
        error
      );
    }
  }
);


/*
|--------------------------------------------------------------------------
| PATCH /api/tutor-payments/:taskID/approved-by
|--------------------------------------------------------------------------
*/

router.patch(
  "/:taskID/approved-by",
  authMiddleware,
  async (req, res) => {
    try {
      if (!canManagePayments(req)) {
        return res.status(403).json({
          success: false,
          message: "Only Owner/Admin can update Approved By.",
        });
      }

      const taskID = normalizeText(req.params.taskID);
      const paymentApprovedBy = normalizeText(req.body.paymentApprovedBy);

      if (!taskID) {
        return res.status(400).json({
          success: false,
          message: "Task ID is required.",
        });
      }

      const updatedTask = await Task.findOneAndUpdate(
        { taskID },
        {
          $set: {
            "tutorDetails.paymentApprovedBy": paymentApprovedBy,
            "tutorDetails.paymentApprovalStatus": "Approved",
          },
        },
        { new: true }
      );

      if (!updatedTask) {
        return res.status(404).json({
          success: false,
          message: "Task not found.",
        });
      }

      return res.json({
        success: true,
        message: "Approved By updated.",
        paymentApprovedBy:
          updatedTask.tutorDetails?.paymentApprovedBy || paymentApprovedBy,

          paymentApprovalStatus:
          updatedTask.tutorDetails?.paymentApprovalStatus || "Approved",
      });
    } catch (error) {
      return sendServerError(
        res,
        "Unable to update Approved By.",
        error
      );
    }
  }
);

/*
|--------------------------------------------------------------------------
| PATCH /api/tutor-payments/:taskID/paid-on
|--------------------------------------------------------------------------
*/
router.patch(
  "/:taskID/paid-on",
  authMiddleware,
  async (req, res) => {
    try {
      if (!canManagePayments(req)) {
        return res.status(403).json({
          success: false,
          message: "Only Owner/Admin can update Paid On date.",
        });
      }

      const taskID = normalizeText(req.params.taskID);
      const paidOnDate = req.body.paidOn ? new Date(req.body.paidOn) : null;

      if (!taskID) {
        return res.status(400).json({
          success: false,
          message: "Task ID is required.",
        });
      }

      // { strict: false } forces Mongoose to save the date even if the Schema is missing the field
      const updatedTask = await Task.findOneAndUpdate(
        { taskID },
        { $set: { "tutorDetails.paidOn": paidOnDate } },
        { new: true, strict: false }
      );

      if (!updatedTask) {
        return res.status(404).json({
          success: false,
          message: "Task not found.",
        });
      }

      return res.json({
        success: true,
        message: "Paid On date updated.",
        paidOn: updatedTask.tutorDetails?.paidOn || paidOnDate,
      });
    } catch (error) {
      return sendServerError(
        res,
        "Unable to update Paid On date.",
        error
      );
    }
  }
);

module.exports = router;