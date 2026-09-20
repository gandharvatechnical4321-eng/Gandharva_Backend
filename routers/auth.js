const express = require("express");
const axios = require("axios");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const router = express.Router();
const User = require("../models/user");
const Token = require("../models/token");
const authMiddleware = require("../middleware/authMiddleware");

const FIREBASE_AUTH_URL =
  "https://identitytoolkit.googleapis.com/v1/accounts";

const normalizeEmail = (email) =>
  String(email || "").trim().toLowerCase();

const getFirebaseApiKey = () => {
  const apiKey = process.env.FIREBASE_WEB_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("FIREBASE_WEB_API_KEY is missing from .env");
  }
  return apiKey;
};

const firebaseRequest = async (endpoint, body) => {
  try {
    const response = await axios.post(
      `${FIREBASE_AUTH_URL}:${endpoint}?key=${encodeURIComponent(
        getFirebaseApiKey()
      )}`,
      body,
      {
        headers: { "Content-Type": "application/json" },
        timeout: 10000,
      }
    );

    return response.data;
  } catch (error) {
    const code =
      error.response?.data?.error?.message || error.message;
    const firebaseError = new Error(code);
    firebaseError.code = code;
    throw firebaseError;
  }
};

const firebaseMessage = (error) => {
  const messages = {
    EMAIL_EXISTS: "An account with this email already exists.",
    EMAIL_NOT_FOUND: "Invalid email or password.",
    INVALID_PASSWORD: "Invalid email or password.",
    INVALID_LOGIN_CREDENTIALS: "Invalid email or password.",
    USER_DISABLED: "This account has been disabled.",
    OPERATION_NOT_ALLOWED:
      "Firebase Email/Password sign-in is not enabled.",
    TOO_MANY_ATTEMPTS_TRY_LATER:
      "Too many attempts. Please try again later.",
  };

  return messages[error.code] || "Authentication failed.";
};

const validateCredentials = (email, password) => {
  if (!email || !password) {
    return "Email and password are required.";
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return "Enter a valid email address.";
  }
  if (password.length < 6) {
    return "Password must be at least 6 characters.";
  }
  return null;
};

const requireDatabase = (req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      success: false,
      message:
        "Database is not connected. Check MONGO_CONNECTING_URL in the backend .env file.",
    });
  }
  return next();
};

const toPublicUser = (user) => ({
  id: user._id,
  firebaseUid: user.firebaseUid,
  fullName: user.fullName || "",
  userName: user.userName || user.username || "",
  email: user.email,
  employeeCode: user.employeeCode || "",
  employeeRole: user.employeeRole || "",
  role: user.dashboardRole || "operation executive",
  status: user.employeeStatus || "ACTIVE",
  profileImageUrl: user.profileImageUrl || "",
});

const createSession = async (user, firebaseUser) => {
  const role = user.dashboardRole || "operation executive";
  const publicUser = toPublicUser(user);
  const token = jwt.sign(
    {
      id: user._id,
      firebaseUid: firebaseUser.localId,
      fullName: publicUser.fullName,
      email: publicUser.email,
      employeeCode: publicUser.employeeCode,
      employeeRole: publicUser.employeeRole,
      status: publicUser.status,
      profileImageUrl: publicUser.profileImageUrl,
      device: "device 1",
      userName: publicUser.userName,
      role,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  await Token.create({
    userId: user._id,
    userName: publicUser.userName,
    device: "device 1",
    token,
    role,
    expireDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  return { token, user: publicUser };
};

const upsertUserProfile = async ({ email, firebaseUser, fullName }) =>
  User.findOneAndUpdate(
    { email },
    {
      $set: {
        firebaseUid: firebaseUser.localId,
        email,
        ...(fullName ? {
          fullName,
          userName: fullName,
          username: fullName,
        } : {}),
        device: "device 1",
        employeeStatus: "ACTIVE",
        isVerified: true,
      },
      $setOnInsert: {
        fullName: fullName || email.split("@")[0],
        userName: fullName || email.split("@")[0],
        username: fullName || email.split("@")[0],
        dashboardRole: "operation executive",
      },
    },
    { new: true, upsert: true, runValidators: true }
  );

router.post("/register", requireDatabase, async (req, res) => {
  try {
    const fullName = String(req.body.fullName || "").trim();
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");
    const validationError = validateCredentials(email, password);

    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }
    if (!fullName) {
      return res.status(400).json({ success: false, message: "Full name is required." });
    }

    const firebaseUser = await firebaseRequest("signUp", {
      email,
      password,
      returnSecureToken: true,
    });

    const user = await upsertUserProfile({
      email,
      firebaseUser,
      fullName,
    });

    const session = await createSession(user, firebaseUser);
    return res.status(201).json({ success: true, ...session, message: "Registration successful." });
  } catch (error) {
    console.error("Registration error:", error.message);
    if (error.code === "EMAIL_EXISTS") {
      try {
        const firebaseUser = await firebaseRequest("signInWithPassword", {
          email: normalizeEmail(req.body.email),
          password: String(req.body.password || ""),
          returnSecureToken: true,
        });
        const user = await upsertUserProfile({
          email: normalizeEmail(req.body.email),
          firebaseUser,
          fullName: String(req.body.fullName || "").trim(),
        });
        const session = await createSession(user, firebaseUser);
        return res.json({
          success: true,
          ...session,
          message: "Account already existed; login successful.",
        });
      } catch (recoveryError) {
        console.error("Existing Firebase account recovery failed:", recoveryError.message);
        return res.status(
          recoveryError.code === "INVALID_PASSWORD" ||
            recoveryError.code === "INVALID_LOGIN_CREDENTIALS"
            ? 401
            : 500
        ).json({
          success: false,
          message: firebaseMessage(recoveryError),
        });
      }
    }

    const status = 500;
    return res.status(status).json({ success: false, message: firebaseMessage(error) });
  }
});

router.post("/login", requireDatabase, async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email || req.body.identifier);
    const password = String(req.body.password || "");
    const validationError = validateCredentials(email, password);

    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }

    const firebaseUser = await firebaseRequest("signInWithPassword", {
      email,
      password,
      returnSecureToken: true,
    });

    const user = await upsertUserProfile({ email, firebaseUser });

    const session = await createSession(user, firebaseUser);
    return res.json({ success: true, ...session, message: "Login successful." });
  } catch (error) {
    console.error("Login error:", error.message);
    const status = [
      "EMAIL_NOT_FOUND",
      "INVALID_PASSWORD",
      "INVALID_LOGIN_CREDENTIALS",
      "USER_DISABLED",
    ].includes(error.code)
      ? 401
      : 500;
    return res.status(status).json({ success: false, message: firebaseMessage(error) });
  }
});

router.get("/active-sessions", authMiddleware, async (req, res) => {
  try {
    if (!["admin", "owner"].includes(req.user?.role)) {
      return res.status(403).json({ success: false, message: "You are not authorized." });
    }

    const sessions = await Token.find()
      .populate("userId", "email fullName employeeCode dashboardRole profileImageUrl")
      .sort({ createdAt: -1 });

    return res.json({ success: true, sessions });
  } catch (error) {
    console.error("Error fetching active sessions:", error.message);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

router.post("/expire-token", authMiddleware, async (req, res) => {
  try {
    if (!["admin", "owner"].includes(req.user?.role)) {
      return res.status(403).json({ success: false, message: "You are not authorized." });
    }
    const token = String(req.body.token || "");
    if (!token) {
      return res.status(400).json({ success: false, message: "Token is required." });
    }

    const result = await Token.deleteOne({ token });
    authMiddleware.clearToken(token);
    return res.json({
      success: result.deletedCount > 0,
      message: result.deletedCount > 0 ? "Token expired successfully." : "Token not found.",
    });
  } catch (error) {
    console.error("Error expiring token:", error.message);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

module.exports = router;
