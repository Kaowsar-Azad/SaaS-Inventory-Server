const express = require("express");
const Customer = require("../models/Customer");
const { protect, checkPermission } = require("../middleware/authMiddleware");
const logActivity = require("../lib/activityLogger");

const router = express.Router();

// Get all customers for company
router.get("/", protect, checkPermission("customers"), async (req, res) => {
  try {
    const customers = await Customer.find({ companyId: req.user.companyId });
    res.json(customers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create new customer
router.post("/", protect, checkPermission("customers"), async (req, res) => {
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

    // Log Activity
    await logActivity(req, "CREATE", "customers", `Created customer profile for "${name}"`);

    res.status(201).json(createdCustomer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update a customer
router.put("/:id", protect, checkPermission("customers"), async (req, res) => {
  try {
    const { name, email, phone, address, notes } = req.body;
    const customer = await Customer.findOne({ _id: req.params.id, companyId: req.user.companyId });
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    customer.name = name ?? customer.name;
    customer.email = email ?? customer.email;
    customer.phone = phone ?? customer.phone;
    customer.address = address ?? customer.address;
    customer.notes = notes ?? customer.notes;

    const updatedCustomer = await customer.save();

    // Log Activity
    await logActivity(req, "UPDATE", "customers", `Updated customer profile for "${updatedCustomer.name}"`);

    res.json(updatedCustomer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get customer's sales history (Customer Purchase History)
router.get("/:id/purchases", protect, checkPermission("customers"), async (req, res) => {
  try {
    const Sale = require("../models/Sale");
    const purchases = await Sale.find({
      customerId: req.params.id,
      companyId: req.user.companyId,
    })
      .populate("productId", "name sku price")
      .sort({ createdAt: -1 });
    
    res.json(purchases);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete a customer
router.delete("/:id", protect, checkPermission("customers"), async (req, res) => {
  try {
    const customer = await Customer.findOneAndDelete({ _id: req.params.id, companyId: req.user.companyId });
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    // Log Activity
    await logActivity(req, "DELETE", "customers", `Deleted customer profile of "${customer.name}"`);

    res.json({ message: "Customer deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
