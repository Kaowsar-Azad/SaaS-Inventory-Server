const mongoose = require("mongoose");

let authInstance = null;

const getAuth = async () => {
  if (!authInstance) {
    const client = mongoose.connection.getClient();
    const db = mongoose.connection.db || (client && client.db());
    
    if (!db) {
      throw new Error("Mongoose connection is not established yet.");
    }
    
    const { betterAuth } = await import("better-auth");
    const { mongodbAdapter } = await import("better-auth/adapters/mongodb");
    const { jwt } = await import("better-auth/plugins");
    
    authInstance = betterAuth({
      database: mongodbAdapter(db, {
        client: client
      }),
      secret: process.env.BETTER_AUTH_SECRET,
      baseURL: process.env.BETTER_AUTH_URL || "http://localhost:5000",
      trustedOrigins: [
        "http://localhost:3000",
        process.env.CLIENT_URL,
        "https://saa-s-inventory-client.vercel.app"
      ].filter(Boolean),
      emailAndPassword: {
        enabled: true,
      },
      rateLimit: {
        enabled: false,
      },
      plugins: [
        jwt({
          jwt: {
            // JWT-এ যে ডেটা থাকবে তা কাস্টমাইজ করা হচ্ছে
            // মাল্টি-টেন্যান্সির জন্য companyId ও role সবসময় টোকেনে থাকবে
            definePayload: ({ user }) => ({
              id: user.id,
              email: user.email,
              name: user.name,
              role: user.role,
              companyId: user.companyId,
              companyName: user.companyName,
              permissions: user.permissions,
            }),
          },
        }),
      ],
      user: {
        additionalFields: {
          companyName: {
            type: "string",
            required: false,
          },
          companyId: {
            type: "string",
            required: false,
          },
          role: {
            type: "string",
            required: false,
            defaultValue: "admin", // the person registering is the company admin
          },
          permissions: {
            type: "string",
            required: false,
            defaultValue: "",
          }
        }
      },
      databaseHooks: {
        user: {
          create: {
            before: async (user) => {
              if (user.role === "super_admin" || user.companyId) {
                return { data: user };
              }

              // Create Company
              const Company = require("../models/Company");
              const companyName = user.companyName || "My Company";
              const company = await Company.create({
                name: companyName,
                email: user.email,
              });

              return {
                data: {
                  ...user,
                  companyId: company._id.toString()
                }
              };
            }
          }
        }
      }
    });
  }
  return authInstance;
};

module.exports = { getAuth };

