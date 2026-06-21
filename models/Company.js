const mongoose = require("mongoose");

const companySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    phone: {
      type: String,
    },
    address: {
      type: String,
    },
    subscriptionPlan: {
      type: String,
      enum: ["free", "monthly", "yearly"],
      default: "free",
    },
    subscriptionExpiresAt: {
      type: Date,
    },
    stripeCustomerId: {
      type: String,
      default: "",
    },
    stripeSubscriptionId: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["active", "suspended"],
      default: "active",
    },
    currency: {
      type: String,
      default: "USD",
    },
    taxRate: {
      type: Number,
      default: 15,
    },
    lowStockThreshold: {
      type: Number,
      default: 10,
    },
    smtpHost: {
      type: String,
      default: "",
    },
    smtpPort: {
      type: Number,
      default: 465,
    },
    smtpUser: {
      type: String,
      default: "",
    },
    smtpPass: {
      type: String,
      default: "",
    },
    whatsappSid: {
      type: String,
      default: "",
    },
    whatsappToken: {
      type: String,
      default: "",
    },
    whatsappFrom: {
      type: String,
      default: "",
    },
    whatsappMethod: {
      type: String,
      enum: ["twilio", "free"],
      default: "twilio",
    },
    whatsappStatus: {
      type: String,
      enum: ["disconnected", "connected"],
      default: "disconnected",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Company", companySchema);
