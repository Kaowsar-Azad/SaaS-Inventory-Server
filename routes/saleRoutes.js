const express = require("express");
const Sale = require("../models/Sale");
const Product = require("../models/Product");
const { protect, checkPermission } = require("../middleware/authMiddleware");
const logActivity = require("../lib/activityLogger");

const router = express.Router();

// Get all sales for company
router.get("/", protect, checkPermission("sales"), async (req, res) => {
  try {
    const sales = await Sale.find({ companyId: req.user.companyId })
      .populate("customerId", "name")
      .populate("productId", "name sku");
    res.json(sales);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create new sale (Stock Out)
router.post("/", protect, checkPermission("sales"), async (req, res) => {
  try {
    const { customerId, productId, quantity, unitPrice } = req.body;

    // Check if sufficient stock is available
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (product.stock < quantity) {
      return res.status(400).json({ message: `Insufficient stock. Only ${product.stock} left.` });
    }
    
    const Company = require("../models/Company");
    const company = await Company.findById(req.user.companyId);
    const currentTaxRate = company && company.taxRate !== undefined ? company.taxRate : 15;

    const totalAmount = quantity * unitPrice;
    const taxAmount = totalAmount * (currentTaxRate / 100);

    const sale = new Sale({
      customerId,
      productId,
      quantity,
      unitPrice,
      totalAmount,
      taxAmount,
      companyId: req.user.companyId,
    });

    const createdSale = await sale.save();

    // Decrease product stock
    const productObj = await Product.findByIdAndUpdate(productId, {
      $inc: { stock: -quantity }
    }, { new: true });

    // Real-time Low Stock Notification Alert
    if (productObj && productObj.stock <= productObj.reorderLevel) {
      // 1. Send Email Alert
      if (process.env.SMTP_USER) {
        const { sendEmail } = require("../lib/emailService");
        const warningHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #fecaca; border-radius: 12px; background-color: #fff5f5;">
            <h2 style="color: #dc2626; border-bottom: 2px solid #f87171; padding-bottom: 10px; margin-top: 0;">⚠️ Low Stock Alert</h2>
            <p style="color: #4b5563; font-size: 14px;">The following item has dropped below its reorder threshold during a sale transaction:</p>
            <p style="font-size: 16px; margin: 5px 0;"><strong>Product Name:</strong> ${productObj.name}</p>
            <p style="font-size: 14px; margin: 5px 0;"><strong>SKU:</strong> ${productObj.sku}</p>
            <p style="font-size: 16px; color: #dc2626; margin: 15px 0; font-weight: bold;">
              Current Stock: ${productObj.stock} (Threshold Limit: ${productObj.reorderLevel})
            </p>
            <p style="font-size: 12px; color: #4b5563;">Please restock this item soon to avoid running out of stock.</p>
          </div>
        `;
        const recipientEmail = req.user.email || process.env.SMTP_USER;
        sendEmail({
          to: recipientEmail,
          subject: `⚠️ Low Stock Alert: ${productObj.name} is running low`,
          html: warningHtml,
          companyId: req.user.companyId
        }).catch(err => console.error("Real-time low stock email notification failed:", err));
      }

      // 2. Send WhatsApp Alert
      const { sendWhatsAppAlert } = require("../lib/whatsappService");
      const whatsappMsg = `⚠️ Low Stock Alert: Product "${productObj.name}" (SKU: ${productObj.sku}) is running low! Current Stock: ${productObj.stock} (Threshold: ${productObj.reorderLevel}).`;
      
      // Log/Send WhatsApp warning
      sendWhatsAppAlert("Admin", whatsappMsg, req.user.companyId).catch(err => console.error("Real-time low stock WhatsApp notification failed:", err));
    }

    // Log Activity
    await logActivity(
      req, 
      "CREATE", 
      "sales", 
      `Recorded sale of ${quantity} units of "${productObj ? productObj.name : "Product"}" (Revenue: $${totalAmount})`
    );

    res.status(201).json(createdSale);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
