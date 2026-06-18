const express = require("express");
const Sale = require("../models/Sale");
const Product = require("../models/Product");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

// Get all sales for company
router.get("/", protect, async (req, res) => {
  try {
    const sales = await Sale.find({ companyId: req.user.companyId })
      .populate("customerId", "name")
      .populate("productId", "name sku");
    res.json(sales);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create new sale (Stock Out)
router.post("/", protect, async (req, res) => {
  try {
    const { customerId, productId, quantity, unitPrice } = req.body;

    // Check if sufficient stock is available
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (product.stock < quantity) {
      return res.status(400).json({ message: `Insufficient stock. Only ${product.stock} left.` });
    }
    
    const totalAmount = quantity * unitPrice;

    const sale = new Sale({
      customerId,
      productId,
      quantity,
      unitPrice,
      totalAmount,
      companyId: req.user.companyId,
    });

    const createdSale = await sale.save();

    // Decrease product stock
    await Product.findByIdAndUpdate(productId, {
      $inc: { stock: -quantity }
    });

    res.status(201).json(createdSale);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
