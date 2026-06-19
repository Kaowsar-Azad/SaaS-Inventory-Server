const express = require("express");
const Supplier = require("../models/Supplier");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

// Get all suppliers for company
router.get("/", protect, async (req, res) => {
  try {
    const suppliers = await Supplier.find({ companyId: req.user.companyId });
    res.json(suppliers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create new supplier
router.post("/", protect, async (req, res) => {
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
    res.status(201).json(createdSupplier);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update a supplier
router.put("/:id", protect, async (req, res) => {
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
    res.json(updatedSupplier);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete a supplier
router.delete("/:id", protect, async (req, res) => {
  try {
    const supplier = await Supplier.findOneAndDelete({ _id: req.params.id, companyId: req.user.companyId });
    if (!supplier) {
      return res.status(404).json({ message: "Supplier not found" });
    }
    res.json({ message: "Supplier deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
