const express = require("express");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");
const Company = require("../models/Company");
const User = require("../models/User");
const { protect } = require("../middleware/authMiddleware");
const { adminProtect } = require("../middleware/adminMiddleware");
const { runDatabaseBackup } = require("../lib/backupService");

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

// GET all backups
router.get("/backups", protect, adminProtect, async (req, res) => {
  try {
    const backupDir = path.join(__dirname, "..", "backups");
    if (!fs.existsSync(backupDir)) {
      return res.json([]);
    }

    const files = fs.readdirSync(backupDir)
      .filter(f => f.startsWith("backup-") && f.endsWith(".json"))
      .map(f => {
        const filePath = path.join(backupDir, f);
        const stats = fs.statSync(filePath);
        return {
          filename: f,
          size: stats.size,
          createdAt: stats.mtime
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt); // Newest first

    res.json(files);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Run manual backup
router.post("/backups/run", protect, adminProtect, async (req, res) => {
  try {
    const filepath = await runDatabaseBackup();
    const filename = path.basename(filepath);
    res.status(201).json({ message: "Backup executed successfully", filename });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Download backup file
router.get("/backups/download/:filename", protect, adminProtect, async (req, res) => {
  try {
    const filename = req.params.filename;
    // Prevent directory traversal attacks
    if (filename.includes("/") || filename.includes("..") || filename.includes("\\")) {
      return res.status(400).json({ message: "Invalid filename" });
    }

    const filepath = path.join(__dirname, "..", "backups", filename);
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ message: "Backup file not found" });
    }

    res.download(filepath, filename);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete backup file
router.delete("/backups/delete/:filename", protect, adminProtect, async (req, res) => {
  try {
    const filename = req.params.filename;
    if (filename.includes("/") || filename.includes("..") || filename.includes("\\")) {
      return res.status(400).json({ message: "Invalid filename" });
    }

    const filepath = path.join(__dirname, "..", "backups", filename);
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ message: "Backup file not found" });
    }

    fs.unlinkSync(filepath);
    res.json({ message: "Backup file deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
