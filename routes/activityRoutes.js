const express = require("express");
const ActivityLog = require("../models/ActivityLog");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

// GET all activity logs for company (accessible only by admin)
router.get("/", protect, async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "super_admin") {
      return res.status(403).json({ message: "Not authorized. Only Company Admin can view activity logs." });
    }

    const logs = await ActivityLog.find({ companyId: req.user.companyId })
      .populate("userId", "name email")
      .sort({ createdAt: -1 })
      .limit(200); // Limit to top 200 logs

    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
