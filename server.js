import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// WebSocket server on /ws path
const wss = new WebSocketServer({
  server,
  path: "/ws"
});

app.get("/", (req, res) => {
  res.send("ESP32-CAM Multi-Stream WebSocket Relay Running.");
});

// ======================================================
// SETTINGS API (Mimicking PHP behavior)
// ======================================================
const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const getDefaultState = () => ({
  stream: "OFF",
  framesize: "QVGA",
  fps: 10,
  quality: 12,
  rotation: 0
});

// GET STATE
app.get("/get_state.php", (req, res) => {
  const id = req.query.id ? req.query.id.replace(/[^a-zA-Z0-9]/g, "") : "default";
  const filePath = path.join(DATA_DIR, `state_${id}.json`);

  if (!fs.existsSync(filePath)) {
    const defaultState = getDefaultState();
    fs.writeFileSync(filePath, JSON.stringify(defaultState, null, 2));
    return res.json(defaultState);
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    res.json(data);
  } catch (e) {
    res.json(getDefaultState());
  }
});

// SET STATE
app.get("/set_state.php", (req, res) => {
  const id = req.query.id ? req.query.id.replace(/[^a-zA-Z0-9]/g, "") : "default";
  const filePath = path.join(DATA_DIR, `state_${id}.json`);

  let data = getDefaultState();
  if (fs.existsSync(filePath)) {
    try {
      data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (e) {}
  }

  // Update values
  if (req.query.stream) data.stream = req.query.stream;
  if (req.query.framesize) data.framesize = req.query.framesize;
  if (req.query.fps) data.fps = parseInt(req.query.fps);
  if (req.query.quality) data.quality = parseInt(req.query.quality);
  if (req.query.rotation) data.rotation = parseInt(req.query.rotation);

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  res.json(data);
});

wss.on("connection", (ws, req) => {
  // 1. Parse Device ID from URL parameters
  // Example URL: ws://localhost:3000/ws?id=24:6F:28:A1:B2:C3
  const url = new URL(req.url, `http://${req.headers.host}`);
  const deviceId = url.searchParams.get("id");

  if (!deviceId) {
    console.log("Client rejected: No Device ID provided.");
    ws.close(); // Close connection if no ID is provided
    return;
  }

  // 2. Attach the Device ID to the WebSocket client object for later identification
  ws.deviceId = deviceId;
  
  console.log(`Client connected to stream: ${deviceId}`);

  ws.on("message", (data, isBinary) => {
    // Optional: Log frame size (can be noisy for video streams)
    // console.log(`Frame from ${ws.deviceId}:`, isBinary ? data.byteLength : data.length);

    // 3. Broadcast to clients matching the SAME Device ID
    wss.clients.forEach((client) => {
      // Check if client is open, is not the sender, and shares the same deviceId
      if (
        client !== ws && 
        client.readyState === ws.OPEN && 
        client.deviceId === ws.deviceId
      ) {
        client.send(data, { binary: isBinary });
      }
    });
  });

  ws.on("close", () => {
    console.log(`Client disconnected from stream: ${ws.deviceId}`);
  });
  
  ws.on("error", (error) => {
    console.error(`WebSocket error on ${ws.deviceId}:`, error);
  });
});

// Render PORT
const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log("Relay server running on", port);
});
