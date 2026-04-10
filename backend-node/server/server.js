import express from "express";
import cors from "cors";
import axios from "axios";

const app = express();
app.use(cors());
app.use(express.json());

// CHATBOT API
app.post("/employee/:eid/datasets/:did/chatbot", async (req, res) => {
  try {
    const { message } = req.body;

    const response = await axios.post(
      "http://localhost:11434/api/generate",
      {
        model: "phi",
        prompt: message,
        stream: false,
      }
    );

    res.json({
      reply: response.data.response,
    });
  } catch (err) {
    res.status(500).json({ error: "Chatbot error" });
  }
});

app.listen(5000, () => {
  console.log("Server running on port 5000");
});