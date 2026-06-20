const mongoose = require("mongoose");

const activityLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    userName: {
      type: String,
      required: true,
    },
    userRole: {
      type: String,
      required: true,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },
    action: {
      type: String, // e.g. "CREATE", "UPDATE", "DELETE", "TRANSFER", "ADJUST"
      required: true,
    },
    module: {
      type: String, // e.g. "products", "sales", "warehouses", "customers", "suppliers", "categories", "brands", "purchases", "users"
      required: true,
    },
    details: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ActivityLog", activityLogSchema);
