const express = require("express");
const User = require("../models/User");
const { protect } = require("../middleware/authMiddleware");
const { getAuth } = require("../lib/auth");

const router = express.Router();

// Get all users for the authenticated company
router.get("/", protect, async (req, res) => {
  try {
    // Only admin can manage users in their company
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized. Only Company Admin can manage users." });
    }

    const users = await User.find({ companyId: req.user.companyId });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create a new staff/manager using Better Auth
router.post("/", protect, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized. Only Company Admin can create users." });
    }

    const { name, email, password, role } = req.body;

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: "User with this email already exists" });
    }

    if (!["manager", "staff"].includes(role)) {
      return res.status(400).json({ message: "Invalid role specified" });
    }

    const authInstance = getAuth();

    // Use Better Auth programmatic signup to write to both user & account collections
    const authResult = await authInstance.api.signUpEmail({
      body: {
        email,
        password,
        name,
        role,
        companyId: req.user.companyId.toString(),
      }
    });

    res.status(201).json({
      _id: authResult.user.id,
      name: authResult.user.name,
      email: authResult.user.email,
      role: authResult.user.role,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;

