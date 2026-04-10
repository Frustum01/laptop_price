import { useState } from "react";

const Chatbot = ({ datasetId }) => {
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {
    if (!message) return;

    setLoading(true);

    try {
      const res = await fetch(
        `http://localhost:5000/api/employee/1/datasets/${datasetId}/chatbot`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message }),
        }
      );

      const data = await res.json();
      setReply(data.reply);
    } catch (error) {
      setReply("Error connecting to chatbot");
    }

    setLoading(false);
  };

  return (
    <div
      style={{
        background: "#1e293b",
        padding: "20px",
        borderRadius: "10px",
        marginTop: "20px",
      }}
    >
      <h2>🤖 AI Chatbot</h2>

      <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ask about your data..."
          style={{
            flex: 1,
            padding: "10px",
            borderRadius: "5px",
            border: "none",
          }}
        />

        <button
          onClick={sendMessage}
          style={{
            padding: "10px 15px",
            background: "#6366f1",
            border: "none",
            borderRadius: "5px",
            color: "white",
            cursor: "pointer",
          }}
        >
          Send
        </button>
      </div>

      {loading && <p>Thinking...</p>}

      {reply && (
        <div
          style={{
            background: "#0f172a",
            padding: "10px",
            borderRadius: "5px",
          }}
        >
          <b>Reply:</b> {reply}
        </div>
      )}
    </div>
  );
};

export default Chatbot;