import "@/lib/env";
import { createServer } from "node:http";
import app from "./app";
import { pool } from "./db/pool";
import { startRealtimeNotificationDelivery } from "./services/notifications/realtime-delivery.service";
import { initRealtime } from "./realtime/io";
import { startChatEventsBridge } from "./services/chat/chat-events.bridge";
import { startSlaChecker } from "./services/chat/sla.service";
const PORT = Number(process.env.PORT || 5000);
async function startServer() {
    try {
        await pool.query("SELECT 1");
        console.log("Database connection test passed");
        await startRealtimeNotificationDelivery();
        await startChatEventsBridge();
        startSlaChecker();
        // Socket.IO shares this HTTP server (and thus JWT auth + the pg pool).
        const httpServer = createServer(app);
        initRealtime(httpServer);
        httpServer.listen(PORT, "0.0.0.0", () => {
            console.log(`Server running on http://0.0.0.0:${PORT}`);
        });
    }
    catch (error) {
        console.error("Failed to start server", error);
        process.exit(1);
    }
}
startServer();
