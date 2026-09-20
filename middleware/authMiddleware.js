const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const Token = require("../models/token");

const tokenCache = new Map(); // In-memory token cache

const authMiddleware = async (req, res, next) => {
    try {
        const token = req.header("Authorization")?.split(" ")[1]; // Extract token
        if (!token) {
            return res.status(401).json({ message: "No token, authorization denied" });
        }

        // Check if token is cached
        if (tokenCache.has(token)) {
            req.user = tokenCache.get(token); // Use cached user data
            return next();
        }

        // Check if token exists in MongoDB
        // const session = await Token.findOne({ token });
        // if (!session) {
        //     return res.status(401).json({ message: "Token expired or invalid" });
        // }


        // new
        const session = await Token.findOne({
            token,
            });

        if (
        !session ||
        !session.expireDate ||
        session.expireDate.getTime() <= Date.now()
        ) {
        if (session) {
            await Token.deleteOne({
            _id: session._id,
            });
        }

        tokenCache.delete(token);

        return res.status(401).json({
            success: false,
            message:
            "Token expired or invalid",
        });
        }

        // Verify & decode token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;

        // Cache token with expiry time
        tokenCache.set(token, decoded);
        setTimeout(() => tokenCache.delete(token), 3 * 60 * 1000); // Cache for 5 minutes

        next();
    } catch (error) {
        console.error("Auth Middleware Error:", error);
        res.status(401).json({ status: false, message: "Invalid token" });
    }
};

authMiddleware.clearToken = (token) => {
    tokenCache.delete(token);
};

module.exports = authMiddleware;
