import { prisma } from "@/lib/prisma";
export async function followReport(userId, reportId) {
    const existing = await prisma.report_followers.findUnique({
        where: {
            report_id_user_id: {
                report_id: reportId,
                user_id: userId,
            },
        },
        select: { id: true },
    });
    if (existing) {
        await prisma.report_followers.delete({
            where: { id: existing.id },
        });
        return { following: false };
    }
    await prisma.report_followers.create({
        data: {
            report_id: reportId,
            user_id: userId,
        },
    });
    return { following: true };
}
export async function isFollowing(userId, reportId) {
    const existing = await prisma.report_followers.findUnique({
        where: {
            report_id_user_id: {
                report_id: reportId,
                user_id: userId,
            },
        },
        select: { id: true },
    });
    return Boolean(existing);
}
export async function getFollowerIds(reportId) {
    const followers = await prisma.report_followers.findMany({
        where: { report_id: reportId },
        select: { user_id: true },
    });
    return followers.map((follower) => follower.user_id);
}
