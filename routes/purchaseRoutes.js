const express = require("express");
const Purchase = require("../models/Purchase");
const Product = require("../models/Product");
const { protect, checkPermission } = require("../middleware/authMiddleware");
const logActivity = require("../lib/activityLogger");

const router = express.Router();

// Get all purchases for company
router.get("/", protect, checkPermission("purchases"), async (req, res) => {
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
router.post("/", protect, checkPermission("purchases"), async (req, res) => {
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
    const productObj = await Product.findByIdAndUpdate(productId, {
      $inc: { stock: quantity }
    }, { new: true });

    // Log Activity
    await logActivity(
      req, 
      "CREATE", 
      "purchases", 
      `Recorded purchase of ${quantity} units of "${productObj ? productObj.name : "Product"}" (Cost: $${totalAmount})`
    );

    res.status(201).json(createdPurchase);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
