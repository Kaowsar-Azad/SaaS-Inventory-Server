const express = require("express");
const bcrypt = require("bcryptjs");
const Company = require("../models/Company");
const User = require("../models/User");
const { protect } = require("../middleware/authMiddleware");
const { adminProtect } = require("../middleware/adminMiddleware");

const router = express.Router();

// Seed Super Admin Account
router.post("/seed", async (req, res) => {
  try {
    const existingAdmin = await User.findOne({ role: "super_admin" });
    if (existingAdmin) {
      return res.status(400).json({ message: "Super admin already exists" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash("admin123", salt);

    const superAdmin = await User.create({
      name: "Super Admin",
      email: "admin@saas.com",
      password: hashedPassword,
      role: "super_admin",
      // Super admin does not need a companyId
    });

    res.status(201).json({ message: "Super admin created. Email: admin@saas.com, Password: admin123" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get System Stats
router.get("/stats", protect, adminProtect, async (req, res) => {
  try {
    const totalCompanies = await Company.countDocuments();
    
    // Calculate simple mock MRR based on plans
    const companies = await Company.find();
    let mrr = 0;
    let activeSubscriptions = 0;

    companies.forEach((comp) => {
      if (comp.subscriptionPlan === "monthly") {
        mrr += 50; // Mock $50/mo
        activeSubscriptions += 1;
      } else if (comp.subscriptionPlan === "yearly") {
        mrr += 500 / 12; // Mock $500/yr
        activeSubscriptions += 1;
      }
    });

    res.json({
      totalCompanies,
      activeSubscriptions,
      mrr: mrr.toFixed(2),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all companies list
router.get("/companies", protect, adminProtect, async (req, res) => {
  try {
    const companies = await Company.find().sort({ createdAt: -1 });
    res.json(companies);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update company plan
router.put("/companies/:id/plan", protect, adminProtect, async (req, res) => {
  try {
    const { plan } = req.body;
    const validPlans = ["free", "monthly", "yearly"];

    if (!validPlans.includes(plan)) {
      return res.status(400).json({ message: "Invalid plan type" });
    }

    const company = await Company.findByIdAndUpdate(
      req.params.id,
      { subscriptionPlan: plan },
      { new: true }
    );

    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    res.json(company);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
