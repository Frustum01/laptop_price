import express from "express";
import {
  login,
  signup
} from "../controllers/authController.js";

const router = express.Router();

// Test route
router.get("/test", (req, res) => {
  res.send("Auth route working");
});

// Auth routes
router.post("/login", login);
router.post("/signup", signup);

export default router;