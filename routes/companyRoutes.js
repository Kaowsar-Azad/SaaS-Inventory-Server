const express = require("express");
const Company = require("../models/Company");
const { protect, checkPermission } = require("../middleware/authMiddleware");
const logActivity = require("../lib/activityLogger");

const router = express.Router();

// @desc    Get company settings
// @route   GET /api/company/settings
// @access  Private
router.get("/settings", protect, checkPermission("settings"), async (req, res) => {
  try {
    const company = await Company.findById(req.user.companyId);
    if (!company) {
      return res.status(404).json({ message: "Company settings not found" });
    }
    res.json({
      name: company.name,
      email: company.email,
      phone: company.phone,
      address: company.address,
      currency: company.currency || "USD",
      taxRate: company.taxRate ?? 15,
      lowStockThreshold: company.lowStockThreshold ?? 10,
      subscriptionPlan: company.subscriptionPlan,
      subscriptionExpiresAt: company.subscriptionExpiresAt,
      status: company.status,
      smtpHost: company.smtpHost || "",
      smtpPort: company.smtpPort || 465,
      smtpUser: company.smtpUser || "",
      hasSmtpPass: !!company.smtpPass,
      whatsappSid: company.whatsappSid || "",
      whatsappFrom: company.whatsappFrom || "",
      hasWhatsappToken: !!company.whatsappToken,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Update company settings
// @route   PUT /api/company/settings
// @access  Private
router.put("/settings", protect, checkPermission("settings"), async (req, res) => {
  try {
    const company = await Company.findById(req.user.companyId);
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    const { 
      name, 
      email, 
      phone, 
      address, 
      currency, 
      taxRate, 
      lowStockThreshold,
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPass,
      whatsappSid,
      whatsappToken,
      whatsappFrom 
    } = req.body;

    company.name = name ?? company.name;
    company.email = email ?? company.email;
    company.phone = phone ?? company.phone;
    company.address = address ?? company.address;
    company.currency = currency ?? company.currency;
    company.taxRate = taxRate !== undefined ? Number(taxRate) : company.taxRate;
    company.lowStockThreshold = lowStockThreshold !== undefined ? Number(lowStockThreshold) : company.lowStockThreshold;
    company.smtpHost = smtpHost !== undefined ? smtpHost : company.smtpHost;
    company.smtpPort = smtpPort !== undefined ? Number(smtpPort) : company.smtpPort;
    company.smtpUser = smtpUser !== undefined ? smtpUser : company.smtpUser;
    
    if (smtpPass) {
      company.smtpPass = smtpPass;
    }

    company.whatsappSid = whatsappSid !== undefined ? whatsappSid : company.whatsappSid;
    company.whatsappFrom = whatsappFrom !== undefined ? whatsappFrom : company.whatsappFrom;
    if (whatsappToken) {
      company.whatsappToken = whatsappToken;
    }

    const updatedCompany = await company.save();

    // Log Activity
    await logActivity(req, "UPDATE", "settings", `Updated company settings`);

    res.json({
      name: updatedCompany.name,
      email: updatedCompany.email,
      phone: updatedCompany.phone,
      address: updatedCompany.address,
      currency: updatedCompany.currency,
      taxRate: updatedCompany.taxRate,
      lowStockThreshold: updatedCompany.lowStockThreshold,
      subscriptionPlan: updatedCompany.subscriptionPlan,
      subscriptionExpiresAt: updatedCompany.subscriptionExpiresAt,
      status: updatedCompany.status,
      smtpHost: updatedCompany.smtpHost,
      smtpPort: updatedCompany.smtpPort,
      smtpUser: updatedCompany.smtpUser,
      hasSmtpPass: !!updatedCompany.smtpPass,
      whatsappSid: updatedCompany.whatsappSid,
      whatsappFrom: updatedCompany.whatsappFrom,
      hasWhatsappToken: !!updatedCompany.whatsappToken,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/company/whatsapp/status
router.get("/whatsapp/status", protect, checkPermission("settings"), async (req, res) => {
  try {
    const Company = require("../models/Company");
    const company = await Company.findById(req.user.companyId);
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }
    res.json({
      whatsappMethod: company.whatsappMethod || "twilio",
      whatsappStatus: company.whatsappStatus || "disconnected",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/company/whatsapp/connect-free
router.post("/whatsapp/connect-free", protect, checkPermission("settings"), async (req, res) => {
  try {
    const companyId = req.user.companyId;
    const { initFreeClient } = require("../lib/whatsappService");

    const Company = require("../models/Company");
    await Company.findByIdAndUpdate(companyId, { whatsappMethod: "free" });

    let qrSent = false;
    await initFreeClient(
      companyId,
      (qrDataUrl) => {
        if (!qrSent) {
          qrSent = true;
          return res.json({ qr: qrDataUrl, status: "qr_ready" });
        }
      },
      () => {
        console.log(`Company ${companyId} WhatsApp Web ready.`);
      },
      () => {
        console.log(`Company ${companyId} WhatsApp Web disconnected.`);
      },
      true // forceNewSession
    );

    // Timeout fallback after 45s
    setTimeout(() => {
      if (!qrSent) {
        qrSent = true;
        res.status(408).json({ message: "Request timed out waiting for QR code. Please try again." });
      }
    }, 45000);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/company/whatsapp/disconnect-free
router.post("/whatsapp/disconnect-free", protect, checkPermission("settings"), async (req, res) => {
  try {
    const companyId = req.user.companyId;
    const { activeFreeClients } = require("../lib/whatsappService");

    const Company = require("../models/Company");
    await Company.findByIdAndUpdate(companyId, { 
      whatsappStatus: "disconnected",
      whatsappMethod: "twilio"
    });

    const client = activeFreeClients[companyId];
    if (client) {
      await client.destroy();
      delete activeFreeClients[companyId];
    }

    res.json({ message: "Free WhatsApp client disconnected successfully." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
