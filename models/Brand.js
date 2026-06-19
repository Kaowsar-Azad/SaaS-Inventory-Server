const mongoose = require("mongoose");

const brandSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },
  },
  { timestamps: true }
);

// Unique brand name per company
brandSchema.index({ name: 1, companyId: 1 }, { unique: true });

module.exports = mongoose.model("Brand", brandSchema);
