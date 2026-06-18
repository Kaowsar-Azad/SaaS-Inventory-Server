const express = require("express");
const Product = require("../models/Product");
const Sale = require("../models/Sale");
const Purchase = require("../models/Purchase");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

// Get stats and recent activities for the logged-in user's company
router.get("/stats", protect, async (req, res) => {
  try {
    const companyId = req.user.companyId;

    if (!companyId) {
      return res.status(400).json({ message: "No company associated with this account" });
    }

    // 1. Total Products
    const totalProducts = await Product.countDocuments({ companyId });

    // 2. Low Stock Products (stock < 10)
    const lowStockItems = await Product.countDocuments({ companyId, stock: { $lt: 10 } });

    // 3. Total Sales Amount
    const sales = await Sale.find({ companyId });
    const totalSales = sales.reduce((sum, sale) => sum + (sale.totalAmount || 0), 0);

    // 4. Total Purchases Amount
    const purchases = await Purchase.find({ companyId });
    const totalPurchases = purchases.reduce((sum, purchase) => sum + (purchase.totalAmount || 0), 0);

    // 5. Recent Activities
    const recentProducts = await Product.find({ companyId })
      .sort({ createdAt: -1 })
      .limit(3);

    const recentSales = await Sale.find({ companyId })
      .populate("productId", "name sku")
      .sort({ createdAt: -1 })
      .limit(3);

    const recentPurchases = await Purchase.find({ companyId })
      .populate("productId", "name sku")
      .sort({ createdAt: -1 })
      .limit(3);

    res.json({
      totalProducts,
      lowStockItems,
      totalSales,
      totalPurchases,
      recentProducts,
      recentSales,
      recentPurchases,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
