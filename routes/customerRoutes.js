const express = require("express");
const Customer = require("../models/Customer");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

// Get all customers for company
router.get("/", protect, async (req, res) => {
  try {
    const customers = await Customer.find({ companyId: req.user.companyId });
    res.json(customers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create new customer
router.post("/", protect, async (req, res) => {
  try {
    const { name, email, phone, address } = req.body;
    const customer = new Customer({
      name,
      email,
      phone,
      address,
      companyId: req.user.companyId,
    });
    const createdCustomer = await customer.save();
    res.status(201).json(createdCustomer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
