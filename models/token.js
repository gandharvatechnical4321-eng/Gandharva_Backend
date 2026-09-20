const mongoose = require("mongoose");

const TokenSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // Reference to user
    userName:{type:String,require:false},
    device:{type:String, require:true},
    token: { type: String, required: true, unique: true }, // JWT token 
    role: { type: String, enum: ["owner","admin", "operation executive"], required: true }, // User role
    expireDate: { type: Date, required: true }, // Expiry date of the token
    createdAt: { type: Date, default: Date.now }, // Token creation time
});

module.exports = mongoose.model("Token", TokenSchema);
