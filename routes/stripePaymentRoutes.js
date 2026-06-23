const express = require("express");
const mongoose = require("mongoose");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const Company = require("../models/Company");
const Payment = require("../models/Payment");
const { protect } = require("../middleware/authMiddleware");
const { sendEmail } = require("../lib/emailService");

const router = express.Router();

// @desc    Create Stripe Checkout Session for subscription
// @route   POST /api/payments/create-checkout-session
// @access  Private
router.post("/create-checkout-session", protect, async (req, res) => {
  try {
    const { plan } = req.body;
    if (!plan || !["monthly", "yearly"].includes(plan)) {
      return res.status(400).json({ message: "Invalid or missing subscription plan type." });
    }

    const company = await Company.findById(req.user.companyId);
    if (!company) {
      return res.status(404).json({ message: "Company settings not found." });
    }

    const priceId = plan === "yearly" ? process.env.STRIPE_YEARLY_PRICE_ID : process.env.STRIPE_MONTHLY_PRICE_ID;
    if (!priceId) {
      return res.status(500).json({ message: `Stripe Price ID for ${plan} is not configured on the server.` });
    }

    let customerId = company.stripeCustomerId;
    if (!customerId) {
      // Create a customer in Stripe
      const customer = await stripe.customers.create({
        email: company.email,
        name: company.name,
        metadata: { companyId: company._id.toString() },
      });
      customerId = customer.id;
      company.stripeCustomerId = customerId;
      await company.save();
    }

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `http://localhost:3000/dashboard/billing?session_id={CHECKOUT_SESSION_ID}&status=success`,
      cancel_url: `http://localhost:3000/dashboard/billing?status=cancel`,
      client_reference_id: company._id.toString(),
      metadata: {
        companyId: company._id.toString(),
        plan: plan,
      },
    });

    // Create a pending transaction record
    await Payment.create({
      companyId: company._id,
      amount: plan === "yearly" ? 100 : 10,
      currency: "USD",
      plan: plan,
      status: "pending",
      stripeSessionId: session.id,
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error("[Stripe] Create Checkout Session error:", error);
    res.status(500).json({ message: "Failed to create payment checkout session.", error: error.message });
  }
});

// @desc    Verify Stripe Checkout Session & update subscription plan
// @route   POST /api/payments/verify-session
// @access  Private
router.post("/verify-session", protect, async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ message: "Missing sessionId parameter." });
    }

    // Retrieve the session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (!session) {
      return res.status(404).json({ message: "Stripe session not found." });
    }

    if (session.payment_status === "paid") {
      const companyId = session.client_reference_id || (session.metadata && session.metadata.companyId);
      const plan = session.metadata && session.metadata.plan;

      // Verify that this session belongs to the logged-in user's company
      if (companyId !== req.user.companyId.toString()) {
        return res.status(403).json({ message: "Unauthorized payment session verification." });
      }

      const company = await Company.findById(companyId);
      if (company) {
        // Only update if not already updated (to prevent duplicate expiry extensions)
        const existingPayment = await Payment.findOne({ stripeSessionId: sessionId });
        
        if (!existingPayment || existingPayment.status !== "success") {
          const durationDays = plan === "yearly" ? 365 : 30;
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + durationDays);

          company.subscriptionPlan = plan;
          company.subscriptionExpiresAt = expiresAt;
          company.status = "active";
          company.stripeSubscriptionId = session.subscription;
          await company.save();

          // Mark payment success in database
          await Payment.findOneAndUpdate(
            { stripeSessionId: sessionId },
            { 
              status: "success", 
              stripeSubscriptionId: session.subscription,
              invoiceNumber: session.invoice || `INV-${Date.now().toString().slice(-6)}`
            },
            { upsert: true }
          );

          console.log(`[Stripe Verification] Subscription activated for company ${company.name} until ${expiresAt}`);
          
          // Send confirmation email
          try {
            await sendEmail({
              to: company.email,
              subject: "SaaS Subscription Activated",
              html: `
                <div style="font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px;">
                  <h2 style="color: #2563eb;">Subscription Successful</h2>
                  <p>Dear ${company.name} Admin,</p>
                  <p>We are excited to let you know that your subscription to the <strong>SaaS Inventory ${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan</strong> is now active!</p>
                  <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                    <tr>
                      <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Subscription Plan:</strong></td>
                      <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${plan.toUpperCase()}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Amount Paid:</strong></td>
                      <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">$${plan === "yearly" ? "100.00" : "10.00"} USD</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Expiry Date:</strong></td>
                      <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${expiresAt.toDateString()}</td>
                    </tr>
                  </table>
                  <p>Thank you for choosing SaaS Inventory. If you have any questions, feel free to reply to this email.</p>
                  <br/>
                  <p style="color: #666; font-size: 12px;">SaaS Inventory Team</p>
                </div>
              `
            });
          } catch (emailErr) {
            console.error("[Verification Email Error] Failed to send activation email:", emailErr);
          }
        }
        return res.json({ success: true, plan: company.subscriptionPlan, expiresAt: company.subscriptionExpiresAt });
      }
    }

    res.json({ success: false, message: "Session is not fully paid yet." });
  } catch (error) {
    console.error("[Stripe] Verify Session error:", error);
    res.status(500).json({ message: "Failed to verify session.", error: error.message });
  }
});

// @desc    Get company billing history
// @route   GET /api/payments/history
// @access  Private
router.get("/history", protect, async (req, res) => {
  try {
    // Auto-expire pending payments older than 24 hours (Stripe's checkout session expiration)
    const expirationLimit = new Date();
    expirationLimit.setHours(expirationLimit.getHours() - 24);
    await Payment.updateMany(
      {
        companyId: req.user.companyId,
        status: "pending",
        createdAt: { $lt: expirationLimit },
      },
      { status: "failed" }
    );

    const history = await Payment.find({ companyId: req.user.companyId }).sort({ createdAt: -1 });
    res.json(history);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Stripe Webhook endpoint
// @route   POST /api/payments/webhook
// @access  Public
router.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error(`[Webhook Signature Verification Failed] ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    console.log(`[Stripe Webhook] Received event type: ${event.type}`);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const companyId = session.client_reference_id || (session.metadata && session.metadata.companyId);
      const plan = session.metadata && session.metadata.plan;

      if (companyId && plan) {
        const company = await Company.findById(companyId);
        if (company) {
          // Extend subscription duration: Monthly = 30 days, Yearly = 365 days
          const durationDays = plan === "yearly" ? 365 : 30;
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + durationDays);

          company.subscriptionPlan = plan;
          company.subscriptionExpiresAt = expiresAt;
          company.status = "active";
          company.stripeSubscriptionId = session.subscription;
          await company.save();

          // Mark payment success in database
          await Payment.findOneAndUpdate(
            { stripeSessionId: session.id },
            { 
              status: "success", 
              stripeSubscriptionId: session.subscription,
              invoiceNumber: session.invoice || `INV-${Date.now().toString().slice(-6)}`
            },
            { upsert: true }
          );

          console.log(`[Stripe Webhook] Subscription activated for company ${company.name} until ${expiresAt}`);

          // Send confirmation email
          try {
            await sendEmail({
              to: company.email,
              subject: "SaaS Subscription Activated",
              html: `
                <div style="font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px;">
                  <h2 style="color: #2563eb;">Subscription Successful</h2>
                  <p>Dear ${company.name} Admin,</p>
                  <p>We are excited to let you know that your subscription to the <strong>SaaS Inventory ${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan</strong> is now active!</p>
                  <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                    <tr>
                      <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Subscription Plan:</strong></td>
                      <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${plan.toUpperCase()}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Amount Paid:</strong></td>
                      <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">$${plan === "yearly" ? "100.00" : "10.00"} USD</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Expiry Date:</strong></td>
                      <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${expiresAt.toDateString()}</td>
                    </tr>
                  </table>
                  <p>Thank you for choosing SaaS Inventory. If you have any questions, feel free to reply to this email.</p>
                  <br/>
                  <p style="color: #666; font-size: 12px;">SaaS Inventory Team</p>
                </div>
              `
            });
          } catch (emailErr) {
            console.error("[Webhook Email Error] Failed to send activation email:", emailErr);
          }
        }
      }
    } else if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object;
      if (invoice.subscription) {
        const company = await Company.findOne({ stripeSubscriptionId: invoice.subscription });
        if (company) {
          // Retrieve subscription detail from Stripe
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
          const expiresAt = new Date(subscription.current_period_end * 1000);
          
          company.subscriptionExpiresAt = expiresAt;
          company.status = "active";
          await company.save();

          // Save transaction details
          await Payment.create({
            companyId: company._id,
            amount: invoice.amount_paid / 100,
            currency: invoice.currency.toUpperCase(),
            plan: company.subscriptionPlan,
            status: "success",
            stripeSessionId: invoice.charge || `ch_${Date.now().toString().slice(-8)}`,
            stripeSubscriptionId: invoice.subscription,
            invoiceNumber: invoice.number || `INV-${Date.now().toString().slice(-6)}`
          });

          console.log(`[Stripe Webhook] Subscription renewed for company ${company.name} until ${expiresAt}`);
        }
      }
    } else if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;
      const company = await Company.findOne({ stripeSubscriptionId: subscription.id });
      if (company) {
        company.subscriptionPlan = "free";
        company.status = "active"; // Keep active but demoted to free plan
        await company.save();
        console.log(`[Stripe Webhook] Subscription cancelled/deleted for company ${company.name}. Demoted to free plan.`);
      }
    }

    res.json({ received: true });
  } catch (webhookProcessingError) {
    console.error("[Stripe Webhook Processing Error]", webhookProcessingError);
    res.status(500).json({ error: webhookProcessingError.message });
  }
});

module.exports = router;
