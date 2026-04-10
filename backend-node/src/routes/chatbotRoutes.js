import express from "express";
import { chatbotController } from "../controllers/chatbotController.js";

const router = express.Router();

router.post(
  "/employee/:employee_id/datasets/:dataset_id/chatbot",
  chatbotController
);

export default router;