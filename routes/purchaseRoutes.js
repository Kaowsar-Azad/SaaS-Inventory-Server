const express = require("express");
const Purchase = require("../models/Purchase");
const Product = require("../models/Product");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

// Get all purchases for company
router.get("/", protect, async (req, res) => {
  try {
    const purchases = await Purchase.find({ companyId: req.user.companyId })
      .populate("supplierId", "name")
      .populate("productId", "name sku");
    res.json(purchases);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create new purchase (Stock In)
router.post("/", protect, async (req, res) => {
  try {
    const { supplierId, productId, quantity, unitPrice } = req.body;
    
    const totalAmount = quantity * unitPrice;

    const purchase = new Purchase({
      supplierId,
      productId,
      quantity,
      unitPrice,
      totalAmount,
      companyId: req.user.companyId,
    });

    const createdPurchase = await purchase.save();

    // Increase product stock
    await Product.findByIdAndUpdate(productId, {
      $inc: { stock: quantity }
    });

    res.status(201).json(createdPurchase);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
