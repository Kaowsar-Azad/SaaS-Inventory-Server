const express = require("express");
const Return = require("../models/Return");
const Sale = require("../models/Sale");
const Product = require("../models/Product");
const { protect, checkPermission } = require("../middleware/authMiddleware");
const logActivity = require("../lib/activityLogger");

const router = express.Router();

// GET all returns
router.get("/", protect, checkPermission("sales"), async (req, res) => {
  try {
    const returns = await Return.find({ companyId: req.user.companyId })
      .populate({
        path: "saleId",
        populate: { path: "customerId", select: "name phone email" }
      })
      .populate("productId", "name sku price")
      .sort({ createdAt: -1 });

    res.json(returns);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// CREATE new product return
router.post("/", protect, checkPermission("sales"), async (req, res) => {
  try {
    const { saleId, productId, quantity, refundAmount, reason } = req.body;

    const sale = await Sale.findOne({ _id: saleId, companyId: req.user.companyId });
    if (!sale) {
      return res.status(404).json({ message: "Sale invoice not found." });
    }

    if (sale.productId.toString() !== productId) {
      return res.status(400).json({ message: "Selected product does not match the product in the sale record." });
    }

    // Check overall returns for this sale to ensure quantity doesn't exceed sold quantity
    const pastReturns = await Return.find({ saleId, productId, companyId: req.user.companyId });
    const totalReturnedQty = pastReturns.reduce((sum, r) => sum + r.quantity, 0);

    if (totalReturnedQty + Number(quantity) > sale.quantity) {
      return res.status(400).json({ 
        message: `Cannot return ${quantity} units. Already returned: ${totalReturnedQty} of ${sale.quantity} sold units.` 
      });
    }

    const returnRecord = new Return({
      saleId,
      productId,
      quantity: Number(quantity),
      refundAmount: Number(refundAmount),
      reason: reason || "",
      companyId: req.user.companyId,
    });

    const savedReturn = await returnRecord.save();

    // Increment product stock
    const product = await Product.findByIdAndUpdate(
      productId,
      { $inc: { stock: Number(quantity) } },
      { new: true }
    );

    // Log Activity
    await logActivity(
      req,
      "RETURN",
      "sales",
      `Recorded product return of ${quantity} units of "${product ? product.name : "Product"}" (Refund: $${refundAmount})`
    );

    res.status(201).json(savedReturn);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
