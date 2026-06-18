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

module.exports = router;
