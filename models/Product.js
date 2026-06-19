const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    sku: {
      type: String,
      required: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
    },
    brand: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
    },
    price: {
      type: Number,
      required: true,
    },
    stock: {
      type: Number,
      default: 0,
    },
    variants: [
      {
        size: String,
        color: String,
        stock: {
          type: Number,
          default: 0,
        },
      }
    ],
    warehouseStocks: [
      {
        warehouseId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Warehouse",
        },
        stock: {
          type: Number,
          default: 0,
        },
      }
    ],
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },
  },
  { timestamps: true }
);

// Ensure SKU is unique per company
productSchema.index({ sku: 1, companyId: 1 }, { unique: true });

module.exports = mongoose.model("Product", productSchema);
