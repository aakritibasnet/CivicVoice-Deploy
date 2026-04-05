import { pool } from "@/db/pool";
import { sendPushNotification } from "./push.service";
const NOTIFICATION_CHANNEL = "notification_events";
const PUSH_BRIDGE_LOCK_KEY = 24040101;
let bridgeStarted = false;
async function handleNotificationEvent(rawPayload) {
    if (!rawPayload) {
        return;
    }
    let payload;
    try {
        payload = JSON.parse(rawPayload);
    }
    catch (error) {
        console.error("Failed to parse notification event payload:", error);
        return;
    }
    const notification = payload.notification;
    const recipientId = notification?.user_id ?? notification?.officer_id;
    const recipientRole = notification?.officer_id ? "officer" : "citizen";
    if (payload.action !== "created" || !notification || !recipientId) {
        return;
    }
    try {
        await sendPushNotification(recipientId, {
            title: notification.title,
            body: notification.message,
            data: {
                notificationId: notification.id,
                reportId: notification.report_id ?? undefined,
                type: notification.type,
                link: notification.link ?? undefined,
                ...(notification.metadata ?? {}),
            },
        }, recipientRole);
    }
    catch (error) {
        console.error("Realtime push delivery error:", error);
    }
}
export async function startRealtimeNotificationDelivery() {
    if (bridgeStarted) {
        return;
    }
    const client = await pool.connect();
    try {
        const lockResult = await client.query("SELECT pg_try_advisory_lock($1) AS acquired", [PUSH_BRIDGE_LOCK_KEY]);
        if (!lockResult.rows[0]?.acquired) {
            client.release();
            console.log("Notification push bridge already active on another backend instance");
            return;
        }
        await client.query(`LISTEN ${NOTIFICATION_CHANNEL}`);
        client.on("notification", (msg) => {
            void handleNotificationEvent(msg.payload);
        });
        client.on("error", (error) => {
            console.error("Notification push bridge listener error:", error);
        });
        bridgeStarted = true;
        console.log(`Realtime notification push bridge listening on ${NOTIFICATION_CHANNEL}`);
    }
    catch (error) {
        client.release();
        throw error;
    }
}
