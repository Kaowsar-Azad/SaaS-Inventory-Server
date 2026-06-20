const twilio = require("twilio");

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_FROM || "whatsapp:+14155238886"; // Default Twilio Sandbox number

let client = null;
if (accountSid && authToken) {
  try {
    client = twilio(accountSid, authToken);
    console.log("[WhatsAppService] Twilio client initialized successfully.");
  } catch (error) {
    console.error("[WhatsAppService] Failed to initialize Twilio client:", error);
  }
}

/**
 * Sends a WhatsApp alert
 * @param {string} to - Destination phone number in E.164 format (e.g. "+88017XXXXXXXX")
 * @param {string} message - Message text
 * @param {string} [companyId] - Company ID to load custom Twilio settings
 */
const sendWhatsAppAlert = async (to, message, companyId) => {
  const formattedTo = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
  
  let activeClient = client;
  let activeFrom = fromNumber;

  if (companyId) {
    try {
      const mongoose = require("mongoose");
      const Company = mongoose.models.Company || mongoose.model("Company");
      const company = await Company.findById(companyId);
      
      if (company && company.whatsappSid && company.whatsappToken) {
        console.log(`[WhatsAppService] Using custom Twilio settings for company: ${company.name}`);
        activeClient = twilio(company.whatsappSid, company.whatsappToken);
        activeFrom = company.whatsappFrom || "whatsapp:+14155238886";
      }
    } catch (err) {
      console.error("[WhatsAppService] Error fetching custom company Twilio settings:", err);
    }
  }
  
  if (activeClient) {
    try {
      const response = await activeClient.messages.create({
        from: activeFrom,
        body: message,
        to: formattedTo
      });
      console.log(`[WhatsAppService] WhatsApp alert sent: ${response.sid}`);
      return response;
    } catch (error) {
      console.error("[WhatsAppService] Twilio WhatsApp sending failed:", error);
      throw error;
    }
  } else {
    console.log(`[WhatsAppService] [MOCK MODE] Alert to ${formattedTo}: "${message}"`);
    return { mock: true, to: formattedTo, body: message };
  }
};

module.exports = { sendWhatsAppAlert };
