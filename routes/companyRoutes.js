const express = require("express");
const Company = require("../models/Company");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

// @desc    Get company settings
// @route   GET /api/company/settings
// @access  Private
router.get("/settings", protect, async (req, res) => {
  try {
    const company = await Company.findById(req.user.companyId);
    if (!company) {
      return res.status(404).json({ message: "Company settings not found" });
    }
    res.json({
      name: company.name,
      email: company.email,
      phone: company.phone,
      address: company.address,
      currency: company.currency || "USD",
      taxRate: company.taxRate ?? 15,
      lowStockThreshold: company.lowStockThreshold ?? 10,
      subscriptionPlan: company.subscriptionPlan,
      subscriptionExpiresAt: company.subscriptionExpiresAt,
      status: company.status,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Update company settings
// @route   PUT /api/company/settings
// @access  Private
router.put("/settings", protect, async (req, res) => {
  try {
    const company = await Company.findById(req.user.companyId);
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    const { name, email, phone, address, currency, taxRate, lowStockThreshold } = req.body;

    company.name = name ?? company.name;
    company.email = email ?? company.email;
    company.phone = phone ?? company.phone;
    company.address = address ?? company.address;
    company.currency = currency ?? company.currency;
    company.taxRate = taxRate !== undefined ? Number(taxRate) : company.taxRate;
    company.lowStockThreshold = lowStockThreshold !== undefined ? Number(lowStockThreshold) : company.lowStockThreshold;

    const updatedCompany = await company.save();

    res.json({
      name: updatedCompany.name,
      email: updatedCompany.email,
      phone: updatedCompany.phone,
      address: updatedCompany.address,
      currency: updatedCompany.currency,
      taxRate: updatedCompany.taxRate,
      lowStockThreshold: updatedCompany.lowStockThreshold,
      subscriptionPlan: updatedCompany.subscriptionPlan,
      subscriptionExpiresAt: updatedCompany.subscriptionExpiresAt,
      status: updatedCompany.status,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
