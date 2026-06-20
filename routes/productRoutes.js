const express = require("express");
const Product = require("../models/Product");
const { protect, checkPermission } = require("../middleware/authMiddleware");
const logActivity = require("../lib/activityLogger");

const router = express.Router();

// Get all products for the authenticated company
router.get("/", protect, checkPermission("products"), async (req, res) => {
  try {
    const products = await Product.find({ companyId: req.user.companyId })
      .populate("category", "name")
      .populate("brand", "name");
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create a new product
router.post("/", protect, checkPermission("products"), async (req, res) => {
  try {
    const { name, sku, category, brand, price, stock, variants } = req.body;

    // Check subscription plan limit (e.g. 25 products for 'free' plan)
    const Company = require("../models/Company");
    const company = await Company.findById(req.user.companyId);
    if (company && company.subscriptionPlan === "free") {
      const productCount = await Product.countDocuments({ companyId: req.user.companyId });
      if (productCount >= 25) {
        return res.status(403).json({ message: "Subscription limit reached. Free trial accounts are limited to 25 products. Please upgrade your plan." });
      }
    }

    const product = new Product({
      name,
      sku,
      category: category || null,
      brand: brand || null,
      price,
      stock,
      variants: variants || [],
      companyId: req.user.companyId,
    });

    const createdProduct = await product.save();
    
    // Log Activity
    await logActivity(req, "CREATE", "products", `Created product "${name}" (SKU: ${sku})`);

    res.status(201).json(createdProduct);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update a product
router.put("/:id", protect, checkPermission("products"), async (req, res) => {
  try {
    const { name, sku, category, brand, price, stock, variants } = req.body;
    const product = await Product.findOne({ _id: req.params.id, companyId: req.user.companyId });
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (sku && sku !== product.sku) {
      const existingSku = await Product.findOne({ sku, companyId: req.user.companyId });
      if (existingSku) {
        return res.status(400).json({ message: "Product with this SKU already exists in your company" });
      }
    }

    product.name = name ?? product.name;
    product.sku = sku ?? product.sku;
    product.category = category || null;
    product.brand = brand || null;
    product.price = price ?? product.price;
    product.stock = stock ?? product.stock;
    product.variants = variants ?? product.variants;

    const updatedProduct = await product.save();
    
    // Log Activity
    await logActivity(req, "UPDATE", "products", `Updated product "${updatedProduct.name}" (SKU: ${updatedProduct.sku})`);

    res.json(updatedProduct);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete a product
router.delete("/:id", protect, checkPermission("products"), async (req, res) => {
  try {
    const product = await Product.findOneAndDelete({ _id: req.params.id, companyId: req.user.companyId });
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    
    // Log Activity
    await logActivity(req, "DELETE", "products", `Deleted product "${product.name}" (SKU: ${product.sku})`);

    res.json({ message: "Product deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Bulk create products (Excel Import)
router.post("/bulk", protect, checkPermission("products"), async (req, res) => {
  try {
    const productsData = req.body;
    if (!Array.isArray(productsData)) {
      return res.status(400).json({ message: "Invalid payload, expected array" });
    }

    // Check subscription plan limit
    const Company = require("../models/Company");
    const company = await Company.findById(req.user.companyId);
    const existingCount = await Product.countDocuments({ companyId: req.user.companyId });

    if (company && company.subscriptionPlan === "free") {
      if (existingCount + productsData.length > 25) {
        return res.status(403).json({ message: `Subscription limit reached. Importing these products would exceed the 25 product limit for Free trial accounts. Current count: ${existingCount}.` });
      }
    }

    // Validate SKUs (ensure no duplicate SKUs in database)
    const skus = productsData.map(p => p.sku);
    const duplicatesInDb = await Product.find({ sku: { $in: skus }, companyId: req.user.companyId });
    if (duplicatesInDb.length > 0) {
      const duplicateSkus = duplicatesInDb.map(p => p.sku).join(", ");
      return res.status(400).json({ message: `Bulk import failed. The following SKUs already exist: ${duplicateSkus}` });
    }

    // Validate SKUs (ensure no duplicate SKUs inside the file itself)
    const uniqueSkusInImport = new Set(skus);
    if (uniqueSkusInImport.size !== skus.length) {
      return res.status(400).json({ message: "Bulk import failed. Duplicate SKUs found within the uploaded file." });
    }

    const preparedProducts = productsData.map(p => ({
      name: p.name,
      sku: p.sku,
      category: p.category || null,
      brand: p.brand || null,
      price: Number(p.price) || 0,
      stock: Number(p.stock) || 0,
      variants: p.variants || [],
      companyId: req.user.companyId,
    }));

    const insertedProducts = await Product.insertMany(preparedProducts);
    
    // Log Activity
    await logActivity(req, "BULK_IMPORT", "products", `Bulk imported ${insertedProducts.length} products`);

    res.status(201).json(insertedProducts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
