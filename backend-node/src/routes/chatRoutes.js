import express from "express";
import { askQuestion } from "../controllers/chatController.js";
// import { protect } from "../middleware/authMiddleware.js";
import { queryLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

router.post("/chat", queryLimiter, askQuestion);
router.post("/query", queryLimiter, askQuestion);

export default router;
