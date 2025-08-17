
import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { EventHubConsumerClient } from "@azure/event-hubs";
import dotenv from "dotenv";
import mongoose from "mongoose";
import fs from "fs";
dotenv.config();
import PowerData from "./models/PowerData.js";


mongoose.connect(process.env.MONGO_URI);

// Manually parse .env if dotenv fails
if (!process.env.EVENT_HUB_CONNECTION_STRING) {
    const envData = fs.readFileSync(".env", "utf-8");
    const lines = envData.split("\n");
    for (const line of lines) {
        const [key, value] = line.split("=");
        if (key && value) process.env[key.trim()] = value.trim();
    }
}

console.log("EVENT_HUB_CONNECTION_STRING:", process.env.EVENT_HUB_CONNECTION_STRING ? "✅ Loaded" : "❌ Not Found");
console.log("EVENT_HUB_NAME:", process.env.EVENT_HUB_NAME ? "✅ Loaded" : "❌ Not Found");
console.log("MONGO_URI:", process.env.MONGO_URI ? "✅ Loaded" : "❌ Not Found");

// ✅ Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log("✅ MongoDB Connected"))
    .catch(err => console.error("❌ MongoDB Connection Error:", err));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 8080;
const server = http.createServer(app);
const wss = new WebSocketServer({ server });


const eventHubConnectionString = process.env.EVENT_HUB_CONNECTION_STRING;
const eventHubName = process.env.EVENT_HUB_NAME;

// Track clients
let clients = new Set();

// IoT Hub consumer setup
let iotClient;
if (eventHubConnectionString && eventHubName) {
    try {
        iotClient = new EventHubConsumerClient("$Default", eventHubConnectionString, eventHubName);
        console.log("✅ Connected to Azure Event Hub for IoT data");
    } catch (error) {
        console.error("❌ Failed to connect to Event Hub:", error);
    }
}

const savePowerData = async (data) => {
    if (!data) {
        console.error("❌ No data received for MongoDB insertion.");
        return;
    }

    console.log("🔄 Received Data for MongoDB:", JSON.stringify(data, null, 2));

    try {
        const newPowerData = new PowerData({
            voltage: data.voltage || { R: 0, Y: 0, B: 0 }, // Default to 0 if undefined
            current: data.current || { R: 0, Y: 0, B: 0 },
            powerFactor: data.powerFactor ?? 1.0, // Default to 1.0 if null/undefined
            thd: data.thd ?? 0.0,
            activePower: data.activePower ?? 0.0,
        });

        await newPowerData.save();
        console.log("✅ Data Inserted into MongoDB:", newPowerData);
    } catch (error) {
        console.error("❌ MongoDB Insert Error:", error);
    }
};

// WebSocket server logic
wss.on("connection", (ws) => {
    console.log("✅ Client Connected");
    clients.add(ws);
    
    // Check if connection closes immediately
    const connectionCheck = setTimeout(() => {
        if (ws.readyState !== ws.OPEN) {
            console.warn("⚠️ Connection terminated immediately.");
        }
    }, 2000);

    // Heartbeat mechanism
    const interval = setInterval(() => {
        if (ws.readyState === ws.OPEN) {
            ws.ping();
        }
    }, 5000);
    
    ws.on("connection", (ws) => {
        console.log("✅ Client Connected");
        ws.on("message", (message) => {
            console.log("📩 Received:", message);
        });
        ws.on("close", () => {
            console.log("❌ Client Disconnected");
        });
    });
    
    ws.on("message", (message) => {
        try {
            const parsedMessage = JSON.parse(message.toString()); // Convert Buffer to string & parse JSON
            
            // Check if `data` is still a Buffer and convert it
            if (parsedMessage.data && parsedMessage.data.type === "Buffer") {
                parsedMessage.data = Buffer.from(parsedMessage.data.data).toString("utf-8");
            }
    
            console.log("📩 Received:", parsedMessage);
    
            // Echo the properly formatted data back
            ws.send(JSON.stringify({ type: "echo", data: parsedMessage }));
        } catch (error) {
            console.error("❌ Error handling message:", error);
        }
    });
    
    
    ws.on("close", () => {
        console.log("❌ Client Disconnected");
        clearInterval(interval);
        clearTimeout(connectionCheck);
        clients.delete(ws);
    });

    ws.on("error", (error) => {
        console.error("❌ WebSocket Error:", error);
    });
});

const startIoTStreaming = async () => {
    if (!iotClient) {
        console.warn("⚠️ No Event Hub connection. Sending test data instead.");
        setInterval(sendTestData, 5000);
        return;
    }

    try {
        const subscription = iotClient.subscribe({
            processEvents: async (events, context) => {
                for (const event of events) {
                    console.log("📡 IoT Data Received (Raw):", event.body);

                    let iotData = event.body; // Store raw IoT data

                    // Convert Buffer to string if necessary
                    if (Buffer.isBuffer(iotData)) {
                        iotData = iotData.toString("utf-8");
                    }

                    const formattedData = {
                        type: "iot",
                        data: iotData // Now it's a string
                    };

                    console.log("📩 Sending IoT Data:", formattedData);

                    // Send the properly formatted data to all connected clients
                    for (const client of clients) {
                        if (client.readyState === client.OPEN) {
                            client.send(JSON.stringify(formattedData));
                        }
                    }
                }
            },
            processError: async (error, context) => {
                console.error("❌ IoT Hub Error:", error);
            },
        });

        console.log("🚀 IoT Hub Data Streaming Started");

    } catch (error) {
        console.error("❌ Error in IoT Hub Streaming:", error);
        setInterval(sendTestData, 5000);
    }
};

// Start the IoT Hub data stream
startIoTStreaming();
// ✅ Serve static files first
app.use("/public", express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.get("/dashboard", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});


// Start server
server.listen(PORT, () => {
    console.log(`🚀 WebSocket Server running at http://localhost:${PORT}`);
});
app.get('/favicon.ico', (req, res) => res.status(204).end());
