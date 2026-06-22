require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const productRoutes = require("./routes/productRoutes");
const supplierRoutes = require("./routes/supplierRoutes");
const customerRoutes = require("./routes/customerRoutes");
const purchaseRoutes = require("./routes/purchaseRoutes");
const saleRoutes = require("./routes/saleRoutes");
const adminRoutes = require("./routes/adminRoutes");
const userRoutes = require("./routes/userRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const brandRoutes = require("./routes/brandRoutes");
const warehouseRoutes = require("./routes/warehouseRoutes");
const adjustmentRoutes = require("./routes/adjustmentRoutes");
const companyRoutes = require("./routes/companyRoutes");
const activityRoutes = require("./routes/activityRoutes");
const stripePaymentRoutes = require("./routes/stripePaymentRoutes");
const returnRoutes = require("./routes/returnRoutes");
const User = require("./models/User");
const bcrypt = require("bcryptjs");

const app = express();

app.use(cors({
  origin: "http://localhost:3000",
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
}));

// Stripe webhook needs raw body for signature verification
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));
app.use(express.json());

// Ensure MongoDB is connected in serverless environment before any request is handled
app.use(async (req, res, next) => {
  try {
    if (mongoose.connection.readyState === 2) {
      // Wait for the connection to be established if it is already in progress
      await new Promise((resolve) => {
        mongoose.connection.once("connected", resolve);
        mongoose.connection.once("error", resolve);
      });
    } else if (mongoose.connection.readyState !== 1) {
      const mongoUri = process.env.MONGODB_URI;
      if (!mongoUri) throw new Error("MONGODB_URI is not defined in environment variables");
      await mongoose.connect(mongoUri);
      console.log("MongoDB Connected lazily in middleware");
    }
    next();
  } catch (err) {
    next(err);
  }
});

// Better Auth Route Handler
const { getAuth } = require("./lib/auth");
let toNodeHandlerFn = null;

app.use("/api/auth", async (req, res, next) => {
  try {
    if (!toNodeHandlerFn) {
      const { toNodeHandler } = await import("better-auth/node");
      toNodeHandlerFn = toNodeHandler;
    }
    const authInstance = await getAuth();
    return toNodeHandlerFn(authInstance)(req, res, next);
  } catch (err) {
    next(err);
  }
});

// app.use("/api/auth", authRoutes); // Replaced by Better Auth
app.use("/api/products", productRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use("/api/sales", saleRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/users", userRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/brands", brandRoutes);
app.use("/api/warehouses", warehouseRoutes);
app.use("/api/adjustments", adjustmentRoutes);
app.use("/api/company", companyRoutes);
app.use("/api/activities", activityRoutes);
app.use("/api/payments", stripePaymentRoutes);
app.use("/api/returns", returnRoutes);

// Root Welcome Route
app.get("/", (req, res) => {
  res.json({
    status: "success",
    message: "SaaS Inventory Server API is running successfully!",
    version: "1.0.0",
    database: mongoose.connection.readyState === 1 ? "connected" : "connecting/disconnected"
  });
});

// Database connection
const PORT = process.env.PORT || 5000;

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) throw new Error("MONGODB_URI is not defined in .env");

    await mongoose.connect(mongoUri);
    console.log(`MongoDB Connected: ${mongoose.connection.host}`);

    // Initialize background cron scheduler
    const { initScheduler } = require("./lib/scheduler");
    initScheduler();

    // Seed Super Admin
    const existingAdmin = await User.findOne({ role: "super_admin" });
    if (!existingAdmin) {
      const authInstance = await getAuth();
      await authInstance.api.signUpEmail({
        body: {
          email: "admin@saas.com",
          password: "admin123",
          name: "Super Admin",
          role: "super_admin",
        }
      });
      console.log("Super Admin Seeded: admin@saas.com / admin123");
    }
    
    if (process.env.NODE_ENV !== "production") {
      app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    }
  } catch (err) {
    console.error("Failed to connect to MongoDB", err);
  }
};

if (process.env.NODE_ENV !== "production") {
  connectDB();
} else {
  // For Vercel production serverless mode, connect to database immediately when imported
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
      console.log("MongoDB Connected for Vercel Serverless");
      // Initialize background cron scheduler
      const { initScheduler } = require("./lib/scheduler");
      initScheduler();
    })
    .catch(err => console.error("Failed to connect to MongoDB", err));
}

module.exports = app;
