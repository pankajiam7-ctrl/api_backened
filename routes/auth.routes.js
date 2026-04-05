const express = require("express");
const router = express.Router();

const {
    register,
    login,
    logout,
    refreshToken,
    forgotPassword,
    resetPassword,
    googleAuth,
    microsoftAuth
} = require("../controllers/auth.controller");

router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);
router.post("/refresh", refreshToken);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/google", googleAuth);
router.post("/microsoft", microsoftAuth);

module.exports = router;