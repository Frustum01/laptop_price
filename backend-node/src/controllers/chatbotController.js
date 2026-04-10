import axios from "axios";

export const chatbotController = async (req, res) => {
  try {
    const { message } = req.body;
    const { employee_id, dataset_id } = req.params;

    const response = await axios.post(
      "http://localhost:11434/api/generate",
      {
        model: "phi",
        prompt: `Dataset ${dataset_id}: ${message}`,
        stream: false,
      }
    );

    res.json({
      employee_id,
      dataset_id,
      reply: response.data.response,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Chatbot error" });
  }
};