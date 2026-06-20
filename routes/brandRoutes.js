const express = require("express");
const Brand = require("../models/Brand");
const { protect, checkPermission } = require("../middleware/authMiddleware");
const logActivity = require("../lib/activityLogger");

const router = express.Router();

// Get all brands for authenticated company
router.get("/", protect, checkPermission("products"), async (req, res) => {
  try {
    const brands = await Brand.find({ companyId: req.user.companyId });
    res.json(brands);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create new brand
router.post("/", protect, checkPermission("products"), async (req, res) => {
  try {
    const { name, description } = req.body;
    
    // Check if brand name already exists for company
    const exists = await Brand.findOne({ name, companyId: req.user.companyId });
    if (exists) {
      return res.status(400).json({ message: "Brand with this name already exists" });
    }

    const brand = new Brand({
      name,
      description,
      companyId: req.user.companyId,
    });

    const createdBrand = await brand.save();

    // Log Activity
    await logActivity(req, "CREATE", "brands", `Created brand "${name}"`);

    res.status(201).json(createdBrand);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update brand
router.put("/:id", protect, checkPermission("products"), async (req, res) => {
  try {
    const { name, description } = req.body;
    const brand = await Brand.findOne({ _id: req.params.id, companyId: req.user.companyId });
    if (!brand) {
      return res.status(404).json({ message: "Brand not found" });
    }

    if (name && name !== brand.name) {
      const exists = await Brand.findOne({ name, companyId: req.user.companyId });
      if (exists) {
        return res.status(400).json({ message: "Brand with this name already exists" });
      }
    }

    brand.name = name ?? brand.name;
    brand.description = description ?? brand.description;

    const updatedBrand = await brand.save();

    // Log Activity
    await logActivity(req, "UPDATE", "brands", `Updated brand "${updatedBrand.name}"`);

    res.json(updatedBrand);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete brand
router.delete("/:id", protect, checkPermission("products"), async (req, res) => {
  try {
    const brand = await Brand.findOneAndDelete({ _id: req.params.id, companyId: req.user.companyId });
    if (!brand) {
      return res.status(404).json({ message: "Brand not found" });
    }

    // Log Activity
    await logActivity(req, "DELETE", "brands", `Deleted brand "${brand.name}"`);

    res.json({ message: "Brand deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
