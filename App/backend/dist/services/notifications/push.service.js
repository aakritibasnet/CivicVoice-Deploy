import { Expo } from "expo-server-sdk";
import { prisma } from "@/lib/prisma";
const expo = new Expo();
function isOfficerRole(role) {
    return role === "officer";
}
function buildRecipientWhere(recipientId, recipientRole) {
    if (isOfficerRole(recipientRole)) {
        return {
            OR: [{ officer_id: recipientId }, { user_id: recipientId }],
        };
    }
    return { user_id: recipientId };
}
/**
 * Send a push notification to all registered devices for a recipient.
 */
export async function sendPushNotification(recipientId, payload, recipientRole) {
    const rows = await prisma.push_tokens.findMany({
        where: buildRecipientWhere(recipientId, recipientRole),
        select: { token: true },
    });
    if (!rows.length)
        return;
    const messages = [];
    for (const row of rows) {
        if (!Expo.isExpoPushToken(row.token)) {
            console.warn(`Invalid Expo push token for recipient ${recipientId}: ${row.token}`);
            await prisma.push_tokens.deleteMany({
                where: {
                    token: row.token,
                    ...buildRecipientWhere(recipientId, recipientRole),
                },
            });
            continue;
        }
        messages.push({
            to: row.token,
            sound: "default",
            title: payload.title,
            body: payload.body,
            data: payload.data || {},
        });
    }
    if (!messages.length)
        return;
    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
        try {
            const tickets = await expo.sendPushNotificationsAsync(chunk);
            for (let index = 0; index < tickets.length; index += 1) {
                const ticket = tickets[index];
                const target = chunk[index];
                if (ticket.status !== "error") {
                    continue;
                }
                console.error("Push notification error:", ticket.message);
                if (ticket.details?.error === "DeviceNotRegistered" && target.to) {
                    await prisma.push_tokens.deleteMany({
                        where: {
                            token: String(target.to),
                            ...buildRecipientWhere(recipientId, recipientRole),
                        },
                    });
                }
            }
        }
        catch (err) {
            console.error("Failed to send push notification chunk:", err);
        }
    }
}
/**
 * Register or update an Expo push token for a recipient.
 */
export async function registerPushToken(recipientId, token, platform, recipientRole) {
    const existing = await prisma.push_tokens.findFirst({
        where: {
            token,
            ...buildRecipientWhere(recipientId, recipientRole),
        },
        select: { id: true },
    });
    if (existing) {
        await prisma.push_tokens.update({
            where: { id: existing.id },
            data: {
                platform,
                updated_at: new Date(),
            },
        });
        return;
    }
    await prisma.push_tokens.create({
        data: {
            user_id: isOfficerRole(recipientRole) ? null : recipientId,
            officer_id: isOfficerRole(recipientRole) ? recipientId : null,
            token,
            platform,
        },
    });
}
/**
 * Remove a push token for a recipient (e.g., on logout).
 */
export async function removePushToken(recipientId, token, recipientRole) {
    await prisma.push_tokens.deleteMany({
        where: {
            token,
            ...buildRecipientWhere(recipientId, recipientRole),
        },
    });
}
