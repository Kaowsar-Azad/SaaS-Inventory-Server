const twilio = require("twilio");
const mongoose = require("mongoose");

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
        
        const formattedTo = recipient.startsWith("whatsapp:") ? recipient : `whatsapp:${recipient}`;
        
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

// Placeholder for removed free clients reconnect
const initAllFreeClientsOnStartup = async () => {
  // Free WhatsApp method removed.
};

module.exports = {
  sendWhatsAppAlert,
  initAllFreeClientsOnStartup
};
