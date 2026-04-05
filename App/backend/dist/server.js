import "@/lib/env";
import app from "./app";
import { pool } from "./db/pool";
import { startRealtimeNotificationDelivery } from "./services/notifications/realtime-delivery.service";
const PORT = Number(process.env.PORT || 5000);
async function startServer() {
    try {
        await pool.query("SELECT 1");
        console.log("Database connection test passed");
        await startRealtimeNotificationDelivery();
        app.listen(PORT, "0.0.0.0", () => {
            console.log(`Server running on http://0.0.0.0:${PORT}`);
        });
    }
    catch (error) {
        console.error("Failed to start server", error);
        process.exit(1);
    }
}
startServer();
