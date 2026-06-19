const mongoose = require("mongoose");

const warehouseSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    address: {
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

// Ensure warehouse name is unique per company
warehouseSchema.index({ name: 1, companyId: 1 }, { unique: true });

module.exports = mongoose.model("Warehouse", warehouseSchema);
