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

    const { name, email, password, role, permissions } = req.body;

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

    // Save initial permissions
    const createdUser = await User.findById(authResult.user.id);
    if (createdUser) {
      createdUser.permissions = permissions || "";
      await createdUser.save();
    }

    // Log Activity
    const logActivity = require("../lib/activityLogger");
    await logActivity(req, "CREATE", "users", `Created user "${name}" (${email}) as ${role}`);

    res.status(201).json({
      _id: authResult.user.id,
      name: authResult.user.name,
      email: authResult.user.email,
      role: authResult.user.role,
      permissions: permissions || "",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update a user's role and permissions
router.put("/:id", protect, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized. Only Company Admin can update users." });
    }

    const { role, permissions } = req.body;

    const userToUpdate = await User.findOne({ _id: req.params.id, companyId: req.user.companyId });
    if (!userToUpdate) {
      return res.status(404).json({ message: "User not found" });
    }

    if (userToUpdate.role === "super_admin") {
      return res.status(400).json({ message: "Cannot modify super admin account" });
    }

    if (role) {
      if (!["admin", "manager", "staff"].includes(role)) {
        return res.status(400).json({ message: "Invalid role specified" });
      }
      userToUpdate.role = role;
    }

    if (permissions !== undefined) {
      userToUpdate.permissions = permissions;
    }

    const updatedUser = await userToUpdate.save();

    // Log Activity
    const logActivity = require("../lib/activityLogger");
    await logActivity(req, "UPDATE", "users", `Updated user "${updatedUser.name}" (${updatedUser.email}) role: ${updatedUser.role}, permissions: ${updatedUser.permissions}`);

    res.json({
      _id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
      permissions: updatedUser.permissions,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;

