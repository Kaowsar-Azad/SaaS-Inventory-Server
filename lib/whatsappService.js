const twilio = require("twilio");
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

// Active clients map for free method
// key: companyId, value: whatsapp-web.js Client instance
const activeFreeClients = {};

const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const twilioFrom = process.env.TWILIO_FROM || "whatsapp:+14155238886";

let twilioClient = null;
if (twilioAccountSid && twilioAuthToken) {
  try {
    twilioClient = twilio(twilioAccountSid, twilioAuthToken);
    console.log("[WhatsAppService] Default Twilio client initialized successfully.");
  } catch (err) {
    console.error("[WhatsAppService] Twilio init failed:", err);
  }
}

/**
 * Initializes a free WhatsApp Web client for a company
 * @param {string} companyId 
 * @param {Function} [onQr] - Callback when QR code generated
 * @param {Function} [onReady] - Callback when client is ready/connected
 * @param {Function} [onDisconnected] - Callback when client is disconnected
 * @param {boolean} [forceNewSession] - Force clean up of old session data
 */
const initFreeClient = async (companyId, onQr, onReady, onDisconnected, forceNewSession = false) => {
  if (activeFreeClients[companyId]) {
    if (forceNewSession) {
      console.log(`[WhatsAppService] Destroying existing active client for company: ${companyId} due to forced new session.`);
      try {
        await activeFreeClients[companyId].destroy();
      } catch (err) {
        console.error("[WhatsAppService] Error destroying old client:", err);
      }
      delete activeFreeClients[companyId];
    } else {
      // Already running or initializing
      return activeFreeClients[companyId];
    }
  }

  if (forceNewSession) {
    const sessionPath = path.join(process.cwd(), '.wwebjs_auth', `session-company-${companyId}`);
    console.log(`[WhatsAppService] Cleaning up old session folder at: ${sessionPath}`);
    try {
      if (fs.existsSync(sessionPath)) {
        // Retry logic for Windows file locks
        for (let i = 0; i < 3; i++) {
          try {
            fs.rmSync(sessionPath, { recursive: true, force: true });
            console.log(`[WhatsAppService] Successfully deleted session folder.`);
            break;
          } catch (e) {
            console.warn(`[WhatsAppService] Deletion attempt ${i + 1} failed, retrying in 500ms...`);
            await new Promise(r => setTimeout(r, 500));
          }
        }
      }
    } catch (err) {
      console.error("[WhatsAppService] Failed to delete session folder:", err);
    }
  }

  console.log(`[WhatsAppService] Initializing free WhatsApp client for company: ${companyId}`);
  
  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: `company-${companyId}`
    }),
    webVersionCache: {
      type: "remote",
      remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1041831138-alpha.html",
    },
    puppeteer: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu"
      ],
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
  });

  activeFreeClients[companyId] = client;

  client.on("qr", async (qrCodeText) => {
    console.log(`[WhatsAppService] QR code generated for company ${companyId}. Prefix: ${qrCodeText.substring(0, 35)}...`);
    try {
      const qrDataUrl = await qrcode.toDataURL(qrCodeText);
      if (onQr) onQr(qrDataUrl);
    } catch (err) {
      console.error("Failed to generate QR data URL:", err);
    }
  });

  client.on("ready", async () => {
    console.log(`[WhatsAppService] WhatsApp client is ready for company ${companyId}`);
    try {
      const Company = mongoose.models.Company || mongoose.model("Company");
      await Company.findByIdAndUpdate(companyId, { whatsappStatus: "connected" });
      if (onReady) onReady();
    } catch (err) {
      console.error("Failed to update status on ready:", err);
    }
  });

  client.on("disconnected", async (reason) => {
    console.log(`[WhatsAppService] WhatsApp client disconnected for company ${companyId}:`, reason);
    try {
      const Company = mongoose.models.Company || mongoose.model("Company");
      await Company.findByIdAndUpdate(companyId, { whatsappStatus: "disconnected" });
      delete activeFreeClients[companyId];
      if (onDisconnected) onDisconnected();
    } catch (err) {
      console.error("Failed to update status on disconnect:", err);
    }
  });

  // Start initialization
  client.initialize().catch(err => {
    console.error(`[WhatsAppService] Initialization failed for company ${companyId}:`, err);
    delete activeFreeClients[companyId];
  });

  return client;
};

/**
 * Sends a WhatsApp alert
 * @param {string} to - Destination phone number in E.164 format (e.g. "+88017XXXXXXXX")
 * @param {string} message - Message text
 * @param {string} [companyId] - Company ID to load custom Twilio settings
 */
const sendWhatsAppAlert = async (to, message, companyId) => {
  let recipient = to;
  
  if (companyId) {
    try {
      const Company = mongoose.models.Company || mongoose.model("Company");
      const company = await Company.findById(companyId);
      
      if (company) {
        // Fallback to company phone if recipient is "Admin" or empty
        if ((recipient === "Admin" || !recipient) && company.phone) {
          recipient = company.phone;
        }
        
        const method = company.whatsappMethod || "twilio";
        const formattedTo = recipient.startsWith("whatsapp:") ? recipient : `whatsapp:${recipient}`;
        
        if (method === "free") {
          // Send via whatsapp-web.js
          const clientInstance = activeFreeClients[companyId];
          if (clientInstance && company.whatsappStatus === "connected") {
            const rawNumber = recipient.replace(/[^0-9]/g, ""); // keep only digits
            if (!rawNumber) {
              console.log("[WhatsAppService] No valid phone number digits found for free client. Alert skipped.");
              return { success: false, error: "Invalid number" };
            }
            const formattedJid = `${rawNumber}@c.us`;
            
            await clientInstance.sendMessage(formattedJid, message);
            console.log(`[WhatsAppService] Free alert sent to ${formattedJid}`);
            return { success: true, method: "free" };
          } else {
            console.log(`[WhatsAppService] Free client for company ${company.name} is not connected. Alert skipped.`);
            return { success: false, error: "Disconnected" };
          }
        } else {
          // Send via Twilio custom or fallback
          let currentClient = twilioClient;
          let currentFrom = twilioFrom;
          
          if (company.whatsappSid && company.whatsappToken) {
            currentClient = twilio(company.whatsappSid, company.whatsappToken);
            currentFrom = company.whatsappFrom || "whatsapp:+14155238886";
          }
          
          if (currentClient && recipient && recipient !== "Admin") {
            const response = await currentClient.messages.create({
              from: currentFrom,
              body: message,
              to: formattedTo
            });
            console.log(`[WhatsAppService] Twilio alert sent: ${response.sid}`);
            return response;
          }
        }
      }
    } catch (err) {
      console.error("[WhatsAppService] sendWhatsAppAlert failed:", err);
    }
  }

  // Fallback / platform defaults
  const formattedTo = recipient.startsWith("whatsapp:") ? recipient : `whatsapp:${recipient}`;
  if (twilioClient && recipient && recipient !== "Admin") {
    try {
      const response = await twilioClient.messages.create({
        from: twilioFrom,
        body: message,
        to: formattedTo
      });
      console.log(`[WhatsAppService] Default Twilio alert sent: ${response.sid}`);
      return response;
    } catch (error) {
      console.error("[WhatsAppService] Default Twilio WhatsApp failed:", error);
    }
  }

  console.log(`[WhatsAppService] [MOCK MODE] Alert to ${formattedTo}: "${message}"`);
  return { mock: true, to: formattedTo, body: message };
};

// Initialize all previously connected free clients on server startup
const initAllFreeClientsOnStartup = async () => {
  try {
    const Company = mongoose.models.Company || mongoose.model("Company");
    const connectedCompanies = await Company.find({
      whatsappMethod: "free",
      whatsappStatus: "connected"
    }).lean();
    
    console.log(`[WhatsAppService] Reconnecting ${connectedCompanies.length} free WhatsApp clients on startup...`);
    for (const company of connectedCompanies) {
      await initFreeClient(company._id.toString());
    }
  } catch (err) {
    console.error("[WhatsAppService] Failed to reconnect free clients on startup:", err);
  }
};

module.exports = {
  sendWhatsAppAlert,
  initFreeClient,
  activeFreeClients,
  initAllFreeClientsOnStartup
};
