const cron = require("node-cron");
const mongoose = require("mongoose");
const { sendEmail } = require("./emailService");
const { runDatabaseBackup } = require("./backupService");

/**
 * Initializes and schedules background cron tasks
 */
const initScheduler = () => {
  console.log("[Scheduler] Initializing cron scheduler...");

  // 1. Daily Summary Report - Runs daily at 11:59 PM (23:59)
  cron.schedule("59 23 * * *", async () => {
    console.log("[Scheduler] Running Daily Summary Report task...");
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      // Fetch Sales, Purchases, Returns and StockAdjustments models dynamically
      const Sale = mongoose.model("Sale");
      const Purchase = mongoose.model("Purchase");
      const Product = mongoose.model("Product");
      const Return = mongoose.models.Return || mongoose.model("Return");
      const StockAdjustment = mongoose.models.StockAdjustment || mongoose.model("StockAdjustment");

      // Today's Sales
      const sales = await Sale.find({
        createdAt: { $gte: todayStart, $lte: todayEnd }
      }).lean();

      // Today's Purchases
      const purchases = await Purchase.find({
        createdAt: { $gte: todayStart, $lte: todayEnd }
      }).lean();

      // Today's Returns
      const returns = await Return.find({
        createdAt: { $gte: todayStart, $lte: todayEnd }
      }).lean();

      // Today's Damages
      const damages = await StockAdjustment.find({
        type: "damage",
        createdAt: { $gte: todayStart, $lte: todayEnd }
      }).populate("productId", "price").lean();

      // Low Stock Items
      const lowStockProducts = await Product.find({
        $expr: { $lte: ["$stock", "$reorderLevel"] }
      }).lean();

      const grossSalesRevenue = sales.reduce((sum, s) => sum + (s.totalAmount || 0), 0);
      const totalRefunds = returns.reduce((sum, r) => sum + (r.refundAmount || 0), 0);
      const totalSalesRevenue = Math.max(0, grossSalesRevenue - totalRefunds); // Net Sales Revenue

      const purchaseExpenses = purchases.reduce((sum, p) => sum + (p.totalAmount || 0), 0);
      const damageLoss = damages.reduce((sum, d) => sum + (d.quantity * (d.productId?.price || 0)), 0);
      const totalPurchasesCost = purchaseExpenses + damageLoss; // Total Expenses

      const netProfit = totalSalesRevenue - totalPurchasesCost;

      // Generate HTML report
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 12px; background-color: #ffffff;">
          <h2 style="color: #1e3a8a; border-bottom: 2px solid #3b82f6; padding-bottom: 10px; margin-top: 0;">Daily Business Summary</h2>
          <p style="color: #6b7280; font-size: 14px;">Date: ${new Date().toLocaleDateString()}</p>
          
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr style="background-color: #f3f4f6;">
              <th style="text-align: left; padding: 10px; border: 1px solid #e5e7eb;">Metric</th>
              <th style="text-align: right; padding: 10px; border: 1px solid #e5e7eb;">Value</th>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #e5e7eb;">Total Sales Count</td>
              <td style="text-align: right; padding: 10px; border: 1px solid #e5e7eb; font-weight: bold;">${sales.length} orders</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #e5e7eb; color: #10b981;">Net Sales Revenue</td>
              <td style="text-align: right; padding: 10px; border: 1px solid #e5e7eb; font-weight: bold; color: #10b981;">$${totalSalesRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #e5e7eb; color: #f97316;">Today's Refunds</td>
              <td style="text-align: right; padding: 10px; border: 1px solid #e5e7eb; font-weight: bold; color: #f97316;">$${totalRefunds.toLocaleString(undefined, { minimumFractionDigits: 2 })} (${returns.length} items)</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #e5e7eb; color: #ef4444;">Total restock Cost (Purchases)</td>
              <td style="text-align: right; padding: 10px; border: 1px solid #e5e7eb; font-weight: bold; color: #ef4444;">$${purchaseExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #e5e7eb; color: #b45309;">Today's Damage Loss</td>
              <td style="text-align: right; padding: 10px; border: 1px solid #e5e7eb; font-weight: bold; color: #b45309;">$${damageLoss.toLocaleString(undefined, { minimumFractionDigits: 2 })} (${damages.length} items)</td>
            </tr>
            <tr style="background-color: #f9fafb;">
              <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold;">Net Profit/Loss</td>
              <td style="text-align: right; padding: 10px; border: 1px solid #e5e7eb; font-weight: bold; color: ${netProfit >= 0 ? '#10b981' : '#ef4444'};">
                ${netProfit >= 0 ? '+' : ''}$${netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #e5e7eb; color: #f59e0b;">Low Stock Alert items</td>
              <td style="text-align: right; padding: 10px; border: 1px solid #e5e7eb; font-weight: bold; color: #f59e0b;">${lowStockProducts.length} items</td>
            </tr>
          </table>

          ${lowStockProducts.length > 0 ? `
            <div style="background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; padding: 15px; margin-top: 20px;">
              <h4 style="color: #b45309; margin-top: 0; margin-bottom: 8px;">⚠️ Low Stock Items Warning:</h4>
              <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #78350f;">
                ${lowStockProducts.map(p => `<li><strong>${p.name}</strong> (SKU: ${p.sku}) - Stock: ${p.stock} remaining (Limit: ${p.reorderLevel})</li>`).join("")}
              </ul>
            </div>
          ` : ''}

          <p style="font-size: 11px; color: #9ca3af; text-align: center; margin-top: 30px;">
            SaaS Inventory Management System Automation. Please do not reply directly to this message.
          </p>
        </div>
      `;

      if (process.env.SMTP_USER) {
        await sendEmail({
          to: process.env.SMTP_USER,
          subject: `Daily Business Summary Report - ${new Date().toLocaleDateString()}`,
          html: emailHtml
        });
      } else {
        console.warn("[Scheduler] No SMTP_USER configured in env. Summary email skipped.");
      }
    } catch (error) {
      console.error("[Scheduler] Daily Summary Report task failed:", error);
    }
  });

  // 2. Database Backup - Runs daily at 2:00 AM
  cron.schedule("0 2 * * *", async () => {
    console.log("[Scheduler] Running Scheduled Database Backup task...");
    try {
      await runDatabaseBackup();
    } catch (error) {
      console.error("[Scheduler] Scheduled Database Backup task failed:", error);
    }
  });

  // 3. Low Stock Daily Check - Runs daily at 9:00 AM (09:00) to email alerts to Admins
  cron.schedule("0 9 * * *", async () => {
    console.log("[Scheduler] Running Low Stock Daily Check...");
    try {
      const Product = mongoose.model("Product");
      const lowStockProducts = await Product.find({
        $expr: { $lte: ["$stock", "$reorderLevel"] }
      }).lean();

      if (lowStockProducts.length > 0 && process.env.SMTP_USER) {
        const warningHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #fecaca; border-radius: 12px; background-color: #fff5f5;">
            <h2 style="color: #dc2626; border-bottom: 2px solid #f87171; padding-bottom: 10px; margin-top: 0;">⚠️ Low Stock Critical Warning</h2>
            <p style="color: #4b5563; font-size: 14px;">The following items are running low and need restocking immediately:</p>
            
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background-color: #ffffff;">
              <thead>
                <tr style="background-color: #fee2e2;">
                  <th style="text-align: left; padding: 10px; border: 1px solid #fca5a5;">Product Name</th>
                  <th style="text-align: left; padding: 10px; border: 1px solid #fca5a5;">SKU</th>
                  <th style="text-align: right; padding: 10px; border: 1px solid #fca5a5;">Current Stock</th>
                  <th style="text-align: right; padding: 10px; border: 1px solid #fca5a5;">Reorder Level</th>
                </tr>
              </thead>
              <tbody>
                ${lowStockProducts.map(p => `
                  <tr>
                    <td style="padding: 10px; border: 1px solid #fca5a5; font-weight: bold;">${p.name}</td>
                    <td style="padding: 10px; border: 1px solid #fca5a5; font-mono">${p.sku}</td>
                    <td style="text-align: right; padding: 10px; border: 1px solid #fca5a5; font-weight: bold; color: #dc2626;">${p.stock}</td>
                    <td style="text-align: right; padding: 10px; border: 1px solid #fca5a5;">${p.reorderLevel}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
            
            <p style="font-size: 11px; color: #9ca3af; text-align: center; margin-top: 30px;">
              SaaS Inventory Management System Automation. Please do not reply directly to this message.
            </p>
          </div>
        `;

        await sendEmail({
          to: process.env.SMTP_USER,
          subject: `⚠️ Low Stock Warning: ${lowStockProducts.length} Items Need Restocking`,
          html: warningHtml
        });
      }
    } catch (error) {
      console.error("[Scheduler] Low Stock Daily Check task failed:", error);
    }
  });

  console.log("[Scheduler] Background cron jobs scheduled successfully.");
};

module.exports = { initScheduler };
