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
const User = require("./models/User");
const bcrypt = require("bcryptjs");

const app = express();

app.use(cors({
  origin: "http://localhost:3000",
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
}));
app.use(express.json());

// Better Auth Route Handler
const { toNodeHandler } = require("better-auth/node");
const { getAuth } = require("./lib/auth");

app.use("/api/auth", (req, res, next) => {
  try {
    const authInstance = getAuth();
    return toNodeHandler(authInstance)(req, res, next);
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

// Database connection
const PORT = process.env.PORT || 5000;

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) throw new Error("MONGODB_URI is not defined in .env");

    await mongoose.connect(mongoUri);
    console.log(`MongoDB Connected: ${mongoose.connection.host}`);

    // Seed Super Admin
    const existingAdmin = await User.findOne({ role: "super_admin" });
    if (!existingAdmin) {
      const authInstance = getAuth();
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
    
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    console.error("Failed to connect to MongoDB", err);
  }
};

connectDB();
