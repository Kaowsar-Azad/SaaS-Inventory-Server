const nodemailer = require("nodemailer");

const platformTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "465"),
  secure: process.env.SMTP_PORT === "465", // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Sends an email
 * @param {Object} options
 * @param {string} options.to
 * @param {string} options.subject
 * @param {string} options.html
 * @param {string} [options.companyId]
 */
const sendEmail = async ({ to, subject, html, companyId }) => {
  try {
    let activeTransporter = platformTransporter;
    let fromEmail = process.env.SMTP_USER;

    if (companyId) {
      const mongoose = require("mongoose");
      const Company = mongoose.models.Company || mongoose.model("Company");
      const company = await Company.findById(companyId);
      
      if (company && company.smtpUser && company.smtpPass) {
        console.log(`[EmailService] Using custom SMTP settings for company: ${company.name}`);
        activeTransporter = nodemailer.createTransport({
          host: company.smtpHost || "smtp.gmail.com",
          port: parseInt(company.smtpPort || "465"),
          secure: company.smtpPort === 465,
          auth: {
            user: company.smtpUser,
            pass: company.smtpPass,
          },
        });
        fromEmail = company.smtpUser;
      }
    }

    const mailOptions = {
      from: `"SaaS Inventory Notification" <${fromEmail}>`,
      to,
      subject,
      html,
    };

    const info = await activeTransporter.sendMail(mailOptions);
    console.log(`[EmailService] Email sent successfully: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error("[EmailService] Failed to send email:", error);
    throw error;
  }
};

module.exports = { sendEmail };
