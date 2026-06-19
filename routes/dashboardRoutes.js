const express = require("express");
const mongoose = require("mongoose");
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

    // 2. Fetch Company details for threshold configuration
    const Company = require("../models/Company");
    const company = await Company.findById(companyId);
    const globalThreshold = company && company.lowStockThreshold !== undefined ? company.lowStockThreshold : 10;

    // 3. Fetch all products to compute Stock Value and Low Stock Alerts
    const products = await Product.find({ companyId });
    const totalStockValue = products.reduce((sum, prod) => sum + ((prod.stock || 0) * (prod.price || 0)), 0);

    const lowStockAlerts = [];
    let lowStockCount = 0;

    products.forEach(prod => {
      // Use custom reorder level if defined, otherwise fall back to global company threshold
      const threshold = prod.reorderLevel !== undefined ? prod.reorderLevel : globalThreshold;
      if ((prod.stock || 0) <= threshold) {
        lowStockCount++;
        lowStockAlerts.push({
          _id: prod._id,
          name: prod.name,
          sku: prod.sku,
          stock: prod.stock,
          reorderLevel: threshold,
          suggestedReorder: Math.max(1, (threshold * 2) - prod.stock)
        });
      }
    });

    const lowStockItems = lowStockCount;

    // 4. Total Sales Amount
    const sales = await Sale.find({ companyId });
    const totalSales = sales.reduce((sum, sale) => sum + (sale.totalAmount || 0), 0);

    // 5. Total Purchases Amount
    const purchases = await Purchase.find({ companyId });
    const totalPurchases = purchases.reduce((sum, purchase) => sum + (purchase.totalAmount || 0), 0);

    // 6. Revenue History by Days (for Chart)
    const daysQuery = Number(req.query.days) || 7;
    const startDate = new Date();
    startDate.setUTCDate(startDate.getUTCDate() - daysQuery + 1);
    startDate.setUTCHours(0, 0, 0, 0);

    const salesHistory = await Sale.aggregate([
      {
        $match: {
          companyId: new mongoose.Types.ObjectId(companyId.toString()),
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          total: { $sum: "$totalAmount" }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const revenueHistory = [];
    for (let i = 0; i < daysQuery; i++) {
      const date = new Date(startDate);
      date.setUTCDate(date.getUTCDate() + i);
      const dateStr = date.toISOString().split("T")[0];
      const matched = salesHistory.find(s => s._id === dateStr);
      revenueHistory.push({
        date: dateStr,
        label: date.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" }),
        amount: matched ? matched.total : 0
      });
    }

    // 7. Recent Activities
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
      totalStockValue,
      revenueHistory,
      recentProducts,
      recentSales,
      recentPurchases,
      lowStockAlerts,
      currency: company && company.currency ? company.currency : "USD",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
