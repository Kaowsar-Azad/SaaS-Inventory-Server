const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "USD",
    },
    plan: {
      type: String,
      enum: ["monthly", "yearly"],
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "success", "failed"],
      default: "pending",
    },
    stripeSessionId: {
      type: String,
      required: true,
      unique: true,
    },
    stripeSubscriptionId: {
      type: String,
    },
    invoiceNumber: {
      type: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payment", paymentSchema);
