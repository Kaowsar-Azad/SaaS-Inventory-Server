const express = require("express");
const Product = require("../models/Product");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

// Get all products for the authenticated company
router.get("/", protect, async (req, res) => {
  try {
    const products = await Product.find({ companyId: req.user.companyId });
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create a new product
router.post("/", protect, async (req, res) => {
  try {
    const { name, sku, category, brand, price, stock } = req.body;

    const product = new Product({
      name,
      sku,
      category,
      brand,
      price,
      stock,
      companyId: req.user.companyId,
    });

    const createdProduct = await product.save();
    res.status(201).json(createdProduct);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
