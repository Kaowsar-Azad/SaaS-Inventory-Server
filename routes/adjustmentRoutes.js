const express = require("express");
const StockAdjustment = require("../models/StockAdjustment");
const Product = require("../models/Product");
const { protect, checkPermission } = require("../middleware/authMiddleware");
const logActivity = require("../lib/activityLogger");

const router = express.Router();

// GET all adjustments
router.get("/", protect, checkPermission("adjustments"), async (req, res) => {
  try {
    const adjustments = await StockAdjustment.find({ companyId: req.user.companyId })
      .populate("productId", "name sku price")
      .populate("warehouseId", "name")
      .sort({ createdAt: -1 });
    res.json(adjustments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// CREATE stock adjustment / damage log
router.post("/", protect, checkPermission("adjustments"), async (req, res) => {
  try {
    const { productId, quantity, type, reason, warehouseId } = req.body;

    const product = await Product.findOne({ _id: productId, companyId: req.user.companyId });
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Initialize arrays if they don't exist
    if (!product.warehouseStocks) {
      product.warehouseStocks = [];
    }

    if (warehouseId) {
      // Validate warehouse stock for subtraction/damage
      let wStockObj = product.warehouseStocks.find(w => w.warehouseId.toString() === warehouseId);
      const currentWStock = wStockObj ? wStockObj.stock : 0;

      if ((type === "subtraction" || type === "damage") && currentWStock < quantity) {
        return res.status(400).json({ message: `Insufficient stock in selected warehouse. Available: ${currentWStock}` });
      }

      // Update warehouse stock
      if (type === "addition") {
        if (wStockObj) {
          wStockObj.stock += quantity;
        } else {
          product.warehouseStocks.push({ warehouseId, stock: quantity });
        }
      } else {
        wStockObj.stock -= quantity;
      }
    }

    // Validate global product stock for subtraction/damage
    if ((type === "subtraction" || type === "damage") && product.stock < quantity) {
      return res.status(400).json({ message: `Insufficient overall stock. Available: ${product.stock}` });
    }

    // Update overall product stock
    if (type === "addition") {
      product.stock += quantity;
    } else {
      product.stock -= quantity;
    }

    await product.save();

    // Create log
    const adjustment = new StockAdjustment({
      productId,
      quantity,
      type,
      reason,
      warehouseId: warehouseId || null,
      companyId: req.user.companyId,
    });
    const created = await adjustment.save();

    // Log Activity
    await logActivity(
      req, 
      type === "damage" ? "DAMAGE_LOG" : "STOCK_ADJUSTMENT", 
      "adjustments", 
      `Logged ${type} of ${quantity} units for product "${product.name}" (Reason: ${reason || "N/A"})`
    );

    res.status(201).json(created);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
