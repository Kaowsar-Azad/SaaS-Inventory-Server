const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

// Get all users for the authenticated company
router.get("/", protect, async (req, res) => {
  try {
    // Only company_owner or manager should probably see this, but let's restrict to owner for creating users
    if (req.user.role !== "company_owner") {
      return res.status(403).json({ message: "Not authorized. Only Company Owner can manage users." });
    }

    const users = await User.find({ companyId: req.user.companyId }).select("-password");
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create a new staff/manager
router.post("/", protect, async (req, res) => {
  try {
    if (req.user.role !== "company_owner") {
      return res.status(403).json({ message: "Not authorized. Only Company Owner can create users." });
    }

    const { name, email, password, role } = req.body;

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: "User with this email already exists" });
    }

    if (!["manager", "staff"].includes(role)) {
      return res.status(400).json({ message: "Invalid role specified" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role,
      companyId: req.user.companyId,
    });

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
