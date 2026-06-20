const express = require("express");
const Category = require("../models/Category");
const { protect, checkPermission } = require("../middleware/authMiddleware");
const logActivity = require("../lib/activityLogger");

const router = express.Router();

// Get all categories for authenticated company
router.get("/", protect, checkPermission("products"), async (req, res) => {
  try {
    const categories = await Category.find({ companyId: req.user.companyId });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create new category
router.post("/", protect, checkPermission("products"), async (req, res) => {
  try {
    const { name, description } = req.body;
    
    // Check if category name already exists for company
    const exists = await Category.findOne({ name, companyId: req.user.companyId });
    if (exists) {
      return res.status(400).json({ message: "Category with this name already exists" });
    }

    const category = new Category({
      name,
      description,
      companyId: req.user.companyId,
    });

    const createdCategory = await category.save();

    // Log Activity
    await logActivity(req, "CREATE", "categories", `Created category "${name}"`);

    res.status(201).json(createdCategory);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update category
router.put("/:id", protect, checkPermission("products"), async (req, res) => {
  try {
    const { name, description } = req.body;
    const category = await Category.findOne({ _id: req.params.id, companyId: req.user.companyId });
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    if (name && name !== category.name) {
      const exists = await Category.findOne({ name, companyId: req.user.companyId });
      if (exists) {
        return res.status(400).json({ message: "Category with this name already exists" });
      }
    }

    category.name = name ?? category.name;
    category.description = description ?? category.description;

    const updatedCategory = await category.save();

    // Log Activity
    await logActivity(req, "UPDATE", "categories", `Updated category "${updatedCategory.name}"`);

    res.json(updatedCategory);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete category
router.delete("/:id", protect, checkPermission("products"), async (req, res) => {
  try {
    const category = await Category.findOneAndDelete({ _id: req.params.id, companyId: req.user.companyId });
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    // Log Activity
    await logActivity(req, "DELETE", "categories", `Deleted category "${category.name}"`);

    res.json({ message: "Category deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
