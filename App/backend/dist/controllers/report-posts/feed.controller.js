import { getReportPostsFeed, getReportPostDetail, ratePost, togglePostBookmark, getPostComments, addPostComment, } from "@/services/report-posts/feed.service";
export async function feedController(req, res, next) {
    try {
        const { wardId, category, sort, cursor, limit } = req.query;
        const viewerId = req.user?.id ?? null;
        const result = await getReportPostsFeed({
            wardId: wardId,
            category: category,
            sort: sort || "latest",
            cursor: cursor,
            limit: limit ? Number(limit) : 12,
            viewerId,
        });
        return res.json(result);
    }
    catch (err) {
        next(err);
    }
}
export async function detailController(req, res, next) {
    try {
        const viewerId = req.user?.id ?? null;
        const post = await getReportPostDetail(req.params.id, viewerId);
        if (!post)
            return res.status(404).json({ message: "Post not found" });
        return res.json(post);
    }
    catch (err) {
        next(err);
    }
}
export async function rateController(req, res, next) {
    try {
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ message: "Unauthorized" });
        const { rating } = req.body;
        const result = await ratePost(req.params.id, userId, Number(rating));
        return res.json(result);
    }
    catch (err) {
        next(err);
    }
}
export async function bookmarkController(req, res, next) {
    try {
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ message: "Unauthorized" });
        const result = await togglePostBookmark(req.params.id, userId);
        return res.json(result);
    }
    catch (err) {
        next(err);
    }
}
export async function commentsController(req, res, next) {
    try {
        const comments = await getPostComments(req.params.id);
        return res.json({ comments });
    }
    catch (err) {
        next(err);
    }
}
export async function bookmarkedPostsController(req, res, next) {
    try {
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ message: "Unauthorized" });
        const { getUserBookmarkedPosts } = await import("@/services/report-posts/feed.service");
        const posts = await getUserBookmarkedPosts(userId);
        return res.json({ posts });
    }
    catch (err) {
        next(err);
    }
}
export async function addCommentController(req, res, next) {
    try {
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ message: "Unauthorized" });
        const { content } = req.body;
        if (!content?.trim())
            return res.status(400).json({ message: "Content required" });
        const comment = await addPostComment(req.params.id, userId, content.trim());
        return res.json(comment);
    }
    catch (err) {
        next(err);
    }
}
