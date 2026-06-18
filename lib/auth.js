const { betterAuth } = require("better-auth");
const { mongodbAdapter } = require("better-auth/adapters/mongodb");
const mongoose = require("mongoose");

let authInstance = null;

const getAuth = () => {
  if (!authInstance) {
    if (!mongoose.connection.db) {
      throw new Error("Mongoose connection is not established yet.");
    }
    
    authInstance = betterAuth({
      database: mongodbAdapter(mongoose.connection.db, {
        client: mongoose.connection.getClient()
      }),
      trustedOrigins: [
        "http://localhost:3000",
      ],
      emailAndPassword: {
        enabled: true,
      },
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
          }
        }
      },
      databaseHooks: {
        user: {
          create: {
            before: async (user) => {
              if (user.role === "super_admin") {
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

