const express = require("express");
const Supplier = require("../models/Supplier");
const { protect, checkPermission } = require("../middleware/authMiddleware");
const logActivity = require("../lib/activityLogger");

const router = express.Router();

// Get all suppliers for company
router.get("/", protect, checkPermission("suppliers"), async (req, res) => {
  try {
    const suppliers = await Supplier.find({ companyId: req.user.companyId });
    res.json(suppliers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create new supplier
router.post("/", protect, checkPermission("suppliers"), async (req, res) => {
  try {
    const { name, email, phone, address } = req.body;
    const supplier = new Supplier({
      name,
      email,
      phone,
      address,
      companyId: req.user.companyId,
    });
    const createdSupplier = await supplier.save();

    // Log Activity
    await logActivity(req, "CREATE", "suppliers", `Created supplier "${name}"`);

    res.status(201).json(createdSupplier);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update a supplier
router.put("/:id", protect, checkPermission("suppliers"), async (req, res) => {
  try {
    const { name, email, phone, address } = req.body;
    const supplier = await Supplier.findOne({ _id: req.params.id, companyId: req.user.companyId });
    if (!supplier) {
      return res.status(404).json({ message: "Supplier not found" });
    }

    supplier.name = name ?? supplier.name;
    supplier.email = email ?? supplier.email;
    supplier.phone = phone ?? supplier.phone;
    supplier.address = address ?? supplier.address;

    const updatedSupplier = await supplier.save();

    // Log Activity
    await logActivity(req, "UPDATE", "suppliers", `Updated supplier "${updatedSupplier.name}"`);

    res.json(updatedSupplier);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete a supplier
router.delete("/:id", protect, checkPermission("suppliers"), async (req, res) => {
  try {
    const supplier = await Supplier.findOneAndDelete({ _id: req.params.id, companyId: req.user.companyId });
    if (!supplier) {
      return res.status(404).json({ message: "Supplier not found" });
    }

    // Log Activity
    await logActivity(req, "DELETE", "suppliers", `Deleted supplier "${supplier.name}"`);

    res.json({ message: "Supplier deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
