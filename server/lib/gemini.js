const { GoogleGenerativeAI } = require("@google/generative-ai");

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.warn("GEMINI_API_KEY not set. Assistant features will be unavailable.");
}

let genAI;
let model;

if (API_KEY) {
  genAI = new GoogleGenerativeAI(API_KEY);
  model = genAI.getGenerativeModel({
    model: "gemini-3.6-flash",
  });
}

// Tool declarations for function calling
const tools = [
  {
    functionDeclarations: [
      {
        name: "get_customer_history",
        description:
          "Retrieve a customer's recent transaction history including amounts, merchants, channels, timestamps, and fraud scores.",
        parameters: {
          type: "object",
          properties: {
            customer_id: {
              type: "string",
              description: "The customer ID (e.g., C-0001)",
            },
            limit: {
              type: "number",
              description: "Maximum number of transactions to return (default 20)",
            },
          },
          required: ["customer_id"],
        },
      },
      {
        name: "get_transaction_details",
        description:
          "Get full details of a specific transaction including amount, merchant, channel, fraud score, and explanation factors.",
        parameters: {
          type: "object",
          properties: {
            transaction_id: {
              type: "number",
              description: "The transaction ID",
            },
          },
          required: ["transaction_id"],
        },
      },
    ],
  },
];

async function generateContent(prompt, systemInstruction) {
  if (!model) {
    throw new Error("Gemini API not configured. Set GEMINI_API_KEY.");
  }

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    systemInstruction: { parts: [{ text: systemInstruction }] },
  });

  return result.response.text();
}

async function generateWithTools(messages, systemInstruction) {
  if (!model) {
    throw new Error("Gemini API not configured. Set GEMINI_API_KEY.");
  }

  const chatModel = genAI.getGenerativeModel({
    model: "gemini-3.6-flash",
    tools: tools,
    systemInstruction: { parts: [{ text: systemInstruction }] },
  });

  const chat = chatModel.startChat({
    history: messages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
  });

  const lastMessage = messages[messages.length - 1];
  const result = await chat.sendMessage(lastMessage.content);

  return result;
}

module.exports = { generateContent, generateWithTools, tools };
