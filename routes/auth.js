const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");

router.post("/register", authController.registration);
router.get("/login", authController.login);
router.post("/activate/:token", authController.activateAccount);
router.post("/forgotpassword", authController.forgotPassword);
router.post("/resetpassword", authController.resetPassword);

module.exports = router;
