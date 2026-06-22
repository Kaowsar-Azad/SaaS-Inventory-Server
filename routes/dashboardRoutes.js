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

    // 4. Total Sales Amount (Net Sales = Sales - Refunds)
    const sales = await Sale.find({ companyId });
    const totalSalesGross = sales.reduce((sum, sale) => sum + (sale.totalAmount || 0), 0);
    
    const Return = mongoose.models.Return || require("../models/Return");
    const returns = await Return.find({ companyId });
    const totalRefunds = returns.reduce((sum, ret) => sum + (ret.refundAmount || 0), 0);
    const totalSales = Math.max(0, totalSalesGross - totalRefunds);

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

// Get dues summary (receivables and payables) for the logged-in user's company
router.get("/dues-summary", protect, async (req, res) => {
  try {
    const companyId = req.user.companyId;
    if (!companyId) {
      return res.status(400).json({ message: "No company associated with this account" });
    }

    // 1. Fetch sales with outstanding dues
    const salesWithDues = await Sale.find({ companyId, amountDue: { $gt: 0 } })
      .populate("customerId", "name phone email")
      .populate("productId", "name sku")
      .sort({ createdAt: -1 });

    const totalCustomerDue = salesWithDues.reduce((sum, sale) => sum + (sale.amountDue || 0), 0);

    // 2. Fetch purchases with outstanding dues
    const purchasesWithDues = await Purchase.find({ companyId, amountDue: { $gt: 0 } })
      .populate("supplierId", "name phone email")
      .populate("productId", "name sku")
      .sort({ createdAt: -1 });

    const totalSupplierDue = purchasesWithDues.reduce((sum, purchase) => sum + (purchase.amountDue || 0), 0);

    // 3. Group dues by Customer for summary view
    const customerDuesMap = {};
    salesWithDues.forEach(sale => {
      const customer = sale.customerId;
      if (!customer) return;
      const cid = customer._id.toString();
      if (!customerDuesMap[cid]) {
        customerDuesMap[cid] = {
          customerId: cid,
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
          totalDue: 0,
          salesCount: 0
        };
      }
      customerDuesMap[cid].totalDue += sale.amountDue;
      customerDuesMap[cid].salesCount += 1;
    });
    const customerDues = Object.values(customerDuesMap).sort((a, b) => b.totalDue - a.totalDue);

    // 4. Group dues by Supplier for summary view
    const supplierDuesMap = {};
    purchasesWithDues.forEach(purchase => {
      const supplier = purchase.supplierId;
      if (!supplier) return;
      const sid = supplier._id.toString();
      if (!supplierDuesMap[sid]) {
        supplierDuesMap[sid] = {
          supplierId: sid,
          name: supplier.name,
          phone: supplier.phone,
          email: supplier.email,
          totalDue: 0,
          purchasesCount: 0
        };
      }
      supplierDuesMap[sid].totalDue += purchase.amountDue;
      supplierDuesMap[sid].purchasesCount += 1;
    });
    const supplierDues = Object.values(supplierDuesMap).sort((a, b) => b.totalDue - a.totalDue);

    res.json({
      totalCustomerDue,
      totalSupplierDue,
      customerDues,
      supplierDues,
      salesWithDues,
      purchasesWithDues
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
