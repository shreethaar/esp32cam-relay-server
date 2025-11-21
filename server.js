import express from "express";
import http from "http";
import { WebSocketServer } from "ws";

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

wss.on("connection", (ws, req) => {
  // Parse Device ID from URL parameters
  // Example: ws://server/ws?id=24:6F:28:A1:B2:C3
  const url = new URL(req.url, `http://${req.headers.host}`);
  const deviceId = url.searchParams.get("id");
  
  if (!deviceId) {
    console.log("Client rejected: No Device ID provided.");
    ws.close();
    return;
  }
  
  ws.deviceId = deviceId;
  console.log(`Client connected to stream: ${deviceId}`);
  
  ws.on("message", (data, isBinary) => {
    // Broadcast to clients matching the SAME Device ID
    wss.clients.forEach((client) => {
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
