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
    const { supplierId, productId, quantity, unitPrice, amountPaid, paymentMethod } = req.body;
    
    const totalAmount = quantity * unitPrice;
    const amountPaidNum = Number(amountPaid || 0);
    const amountDue = Math.max(0, totalAmount - amountPaidNum);
    let paymentStatus = "paid";
    if (amountPaidNum === 0) paymentStatus = "due";
    else if (amountDue > 0) paymentStatus = "partial";

    const purchase = new Purchase({
      supplierId,
      productId,
      quantity,
      unitPrice,
      totalAmount,
      amountPaid: amountPaidNum,
      amountDue,
      paymentStatus,
      companyId: req.user.companyId,
    });

    const createdPurchase = await purchase.save();

    if (amountPaidNum > 0) {
      const DuePayment = require("../models/DuePayment");
      await DuePayment.create({
        purchaseId: createdPurchase._id,
        companyId: req.user.companyId,
        amountPaid: amountPaidNum,
        paymentMethod: paymentMethod || "cash",
        note: "Initial payment during purchase creation",
      });
    }

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

// Add payment for a purchase due
router.post("/:id/payments", protect, checkPermission("purchases"), async (req, res) => {
  try {
    const { amountPaid, paymentMethod, note } = req.body;
    const purchase = await Purchase.findById(req.params.id);
    if (!purchase) {
      return res.status(404).json({ message: "Purchase not found" });
    }

    const payAmount = Number(amountPaid);
    if (isNaN(payAmount) || payAmount <= 0) {
      return res.status(400).json({ message: "Invalid payment amount" });
    }

    if (payAmount > purchase.amountDue) {
      return res.status(400).json({ message: `Payment amount $${payAmount} exceeds outstanding due of $${purchase.amountDue}` });
    }

    const DuePayment = require("../models/DuePayment");
    const payment = new DuePayment({
      purchaseId: purchase._id,
      companyId: req.user.companyId,
      amountPaid: payAmount,
      paymentMethod,
      note: note || "",
    });
    await payment.save();

    purchase.amountPaid += payAmount;
    purchase.amountDue = Math.max(0, purchase.amountDue - payAmount);
    if (purchase.amountDue === 0) {
      purchase.paymentStatus = "paid";
    } else {
      purchase.paymentStatus = "partial";
    }
    await purchase.save();

    // Log Activity
    await logActivity(
      req,
      "UPDATE",
      "purchases",
      `Recorded due payment of $${payAmount} for purchase ID ${purchase._id}`
    );

    res.json({ purchase, payment });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get payments for a purchase
router.get("/:id/payments", protect, checkPermission("purchases"), async (req, res) => {
  try {
    const DuePayment = require("../models/DuePayment");
    const payments = await DuePayment.find({ purchaseId: req.params.id, companyId: req.user.companyId }).sort({ createdAt: -1 });
    res.json(payments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
