const express = require("express");
const Warehouse = require("../models/Warehouse");
const Product = require("../models/Product");
const WarehouseTransfer = require("../models/WarehouseTransfer");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

// GET all warehouses
router.get("/", protect, async (req, res) => {
  try {
    const warehouses = await Warehouse.find({ companyId: req.user.companyId });
    res.json(warehouses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// CREATE new warehouse
router.post("/", protect, async (req, res) => {
  try {
    const { name, address } = req.body;
    const exists = await Warehouse.findOne({ name, companyId: req.user.companyId });
    if (exists) {
      return res.status(400).json({ message: "Warehouse with this name already exists" });
    }

    const warehouse = new Warehouse({
      name,
      address,
      companyId: req.user.companyId,
    });
    const created = await warehouse.save();
    res.status(201).json(created);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// UPDATE warehouse
router.put("/:id", protect, async (req, res) => {
  try {
    const { name, address } = req.body;
    const warehouse = await Warehouse.findOne({ _id: req.params.id, companyId: req.user.companyId });
    if (!warehouse) {
      return res.status(404).json({ message: "Warehouse not found" });
    }

    if (name && name !== warehouse.name) {
      const exists = await Warehouse.findOne({ name, companyId: req.user.companyId });
      if (exists) {
        return res.status(400).json({ message: "Warehouse with this name already exists" });
      }
    }

    warehouse.name = name ?? warehouse.name;
    warehouse.address = address ?? warehouse.address;

    const updated = await warehouse.save();
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// DELETE warehouse
router.delete("/:id", protect, async (req, res) => {
  try {
    const warehouse = await Warehouse.findOneAndDelete({ _id: req.params.id, companyId: req.user.companyId });
    if (!warehouse) {
      return res.status(404).json({ message: "Warehouse not found" });
    }
    res.json({ message: "Warehouse deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Stock transfer between warehouses
router.post("/transfer", protect, async (req, res) => {
  try {
    const { productId, quantity, fromWarehouseId, toWarehouseId } = req.body;
    
    if (fromWarehouseId === toWarehouseId) {
      return res.status(400).json({ message: "Source and destination warehouses must be different." });
    }

    const product = await Product.findOne({ _id: productId, companyId: req.user.companyId });
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Initialize warehouseStocks if undefined
    if (!product.warehouseStocks) {
      product.warehouseStocks = [];
    }

    // Find stock in fromWarehouse
    const fromStockObj = product.warehouseStocks.find(w => w.warehouseId.toString() === fromWarehouseId);
    const fromStock = fromStockObj ? fromStockObj.stock : 0;

    if (fromStock < quantity) {
      return res.status(400).json({ message: `Insufficient stock in source warehouse. Only ${fromStock} units available.` });
    }

    // Decrement from fromWarehouse
    fromStockObj.stock -= quantity;

    // Increment in toWarehouse
    let toStockObj = product.warehouseStocks.find(w => w.warehouseId.toString() === toWarehouseId);
    if (toStockObj) {
      toStockObj.stock += quantity;
    } else {
      product.warehouseStocks.push({ warehouseId: toWarehouseId, stock: quantity });
    }

    await product.save();

    // Create WarehouseTransfer log
    const transfer = new WarehouseTransfer({
      productId,
      quantity,
      fromWarehouseId,
      toWarehouseId,
      companyId: req.user.companyId,
    });
    await transfer.save();

    res.json({ message: "Stock transferred successfully", product });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET all transfers
router.get("/transfers", protect, async (req, res) => {
  try {
    const transfers = await WarehouseTransfer.find({ companyId: req.user.companyId })
      .populate("productId", "name sku")
      .populate("fromWarehouseId", "name")
      .populate("toWarehouseId", "name")
      .sort({ createdAt: -1 });
    res.json(transfers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET warehouse stock reports
router.get("/reports", protect, async (req, res) => {
  try {
    const warehouses = await Warehouse.find({ companyId: req.user.companyId });
    const products = await Product.find({ companyId: req.user.companyId })
      .populate("category", "name")
      .populate("brand", "name");

    const report = warehouses.map(wh => {
      const items = [];
      let totalStock = 0;
      let totalValue = 0;

      products.forEach(p => {
        const whStock = p.warehouseStocks?.find(ws => ws.warehouseId?.toString() === wh._id.toString());
        const stockQty = whStock ? whStock.stock : 0;
        if (stockQty > 0) {
          totalStock += stockQty;
          totalValue += stockQty * (p.price || 0);
          items.push({
            _id: p._id,
            name: p.name,
            sku: p.sku,
            price: p.price,
            category: p.category?.name || "—",
            brand: p.brand?.name || "—",
            stock: stockQty,
          });
        }
      });

      return {
        _id: wh._id,
        name: wh.name,
        address: wh.address,
        totalItemsCount: items.length,
        totalStock,
        totalValue,
        items,
      };
    });

    res.json(report);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
