const Entry = require("../models/Entry");
const User = require("../models/User");
const { validationResult } = require("express-validator");

class EntryController {
  // Create new cultural entry ---fikremariam
    async createEntry(req, res) {
        try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
            success: false,
            message: "Validation failed",
            errors: errors.array(),
            });
        }

        const {
            title,
            description,
            category,
            location,
            culturalContext,
            historicalPeriod,
            significance,
            traditions,
            materials,
            techniques,
            tags,
            images,
            audioFiles,
            videoFiles,
            documents,
            sources,
            references,
            isPublic,
            status,
        } = req.body;

        // Validate category
        const validCategories = [
            "Architecture",
            "Art",
            "Music",
            "Dance",
            "Literature",
            "Cuisine",
            "Festivals",
            "Rituals",
            "Crafts",
            "Clothing",
            "Language",
            "Folklore",
            "Religion",
            "Sports",
            "Other",
        ];

        if (category && !validCategories.includes(category)) {
            return res.status(400).json({
            success: false,
            message: `Invalid category. Must be one of: ${validCategories.join(
                ", "
            )}`,
            });
        }

        const newEntry = new Entry({
            title,
            description,
            category: category || "Other",
            location: {
            name: location?.name || "",
            coordinates: location?.coordinates || [],
            country: location?.country || "",
            region: location?.region || "",
            address: location?.address || "",
            },
            culturalContext: culturalContext || "",
            historicalPeriod: historicalPeriod || "",
            significance: significance || "",
            traditions: traditions || [],
            materials: materials || [],
            techniques: techniques || [],
            tags: tags || [],
            media: {
            images: images || [],
            audioFiles: audioFiles || [],
            videoFiles: videoFiles || [],
            documents: documents || [],
            },
            sources: sources || [],
            references: references || [],
            isPublic: isPublic !== false,
            author: req.user.userId,
            status: status || "draft",
            views: 0,
            likes: [],
            comments: [],
        });

        const savedEntry = await newEntry.save();
        await savedEntry.populate("author", "username email profilePicture");

        res.status(201).json({
            success: true,
            message: "Cultural entry created successfully",
            data: { entry: savedEntry },
        });
        } catch (error) {
        console.error("Create entry error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error while creating entry",
            error:
            process.env.NODE_ENV === "development" ? error.message : undefined,
        });
        }
    }

    // Get all entries with advanced filtering and pagination
    async getAllEntries(req, res) {
        try {
        const {
            page = 1,
            limit = 12,
            category,
            country,
            region,
            search,
            tags,
            sortBy = "createdAt",
            sortOrder = "desc",
            status,
            authorId,
            featured,
            minViews,
            fromDate,
            toDate,
        } = req.query;

        // Build filter object
        const filter = {};

        // Public visibility filter
        if (req.user?.role !== "admin") {
            if (authorId && authorId === req.user?.userId) {
            filter.author = authorId;
            } else {
            filter.isPublic = true;
            filter.status = "published";
            }
        }

        // Admin or specific status filter
        if (status && req.user?.role === "admin") {
            filter.status = status;
        } else if (!authorId) {
            filter.status = "published";
        }

        // Category filter
        if (category && category !== "all") {
            filter.category = category;
        }

        // Location filters
        if (country) {
            filter["location.country"] = new RegExp(country, "i");
        }
        if (region) {
            filter["location.region"] = new RegExp(region, "i");
        }

        // Search filter
        if (search && search.trim()) {
            filter.$or = [
            { title: new RegExp(search.trim(), "i") },
            { description: new RegExp(search.trim(), "i") },
            { culturalContext: new RegExp(search.trim(), "i") },
            { significance: new RegExp(search.trim(), "i") },
            { tags: { $in: [new RegExp(search.trim(), "i")] } },
            ];
        }

        // Tags filter
        if (tags) {
            const tagArray = tags.split(",").map((tag) => tag.trim());
            filter.tags = { $in: tagArray };
        }

        // Author filter
        if (
            authorId &&
            authorId !== req.user?.userId &&
            req.user?.role !== "admin"
        ) {
            filter.author = authorId;
            filter.isPublic = true;
        }

        // Featured filter
        if (featured === "true") {
            filter.featured = true;
        }

        // Views filter
        if (minViews) {
            filter.views = { $gte: parseInt(minViews) };
        }

        // Date range filter
        if (fromDate || toDate) {
            filter.createdAt = {};
            if (fromDate) filter.createdAt.$gte = new Date(fromDate);
            if (toDate) filter.createdAt.$lte = new Date(toDate);
        }

        // Calculate pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const sortOptions = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

        // Execute query with population
        const entries = await Entry.find(filter)
            .populate("author", "username email profilePicture")
            .sort(sortOptions)
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        // Get total count for pagination
        const totalEntries = await Entry.countDocuments(filter);
        const totalPages = Math.ceil(totalEntries / parseInt(limit));

        // Get category statistics
        const categories = await Entry.distinct("category", filter);

        res.json({
            success: true,
            data: {
            entries,
            pagination: {
                currentPage: parseInt(page),
                totalPages,
                totalEntries,
                limit: parseInt(limit),
                hasNext: parseInt(page) < totalPages,
                hasPrev: parseInt(page) > 1,
            },
            filters: {
                categories,
                appliedFilters: {
                category,
                country,
                region,
                search,
                tags,
                status,
                },
            },
            },
        });
        } catch (error) {
        console.error("Get entries error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error while fetching entries",
        });
        }
    }

    // Get single entry by ID with detailed information
    async getEntryById(req, res) {
        try {
        const { id } = req.params;
        const { incrementView = true } = req.query;

        const entry = await Entry.findById(id)
            .populate("author", "username email profilePicture bio createdAt")
            .populate("comments.author", "username profilePicture")
            .populate("likes", "username profilePicture");

        if (!entry) {
            return res.status(404).json({
            success: false,
            message: "Cultural entry not found",
            });
        }

        // Check if user can view this entry
        const canView =
            entry.isPublic ||
            entry.author._id.toString() === req.user?.userId ||
            req.user?.role === "admin";

        if (!canView) {
            return res.status(403).json({
            success: false,
            message: "Access denied to this entry",
            });
        }

        // Increment view count (skip if it's the author viewing)
        if (
            incrementView === "true" &&
            entry.author._id.toString() !== req.user?.userId
        ) {
            entry.views = (entry.views || 0) + 1;
            await entry.save();
        }

        // Get related entries (same category or tags)
        const relatedEntries = await Entry.find({
            _id: { $ne: id },
            $or: [{ category: entry.category }, { tags: { $in: entry.tags } }],
            isPublic: true,
            status: "published",
        })
            .limit(4)
            .select("title description category media.images author createdAt")
            .populate("author", "username")
            .lean();

        res.json({
            success: true,
            data: {
            entry,
            relatedEntries,
            userHasLiked: req.user
                ? entry.likes.some(
                    (like) => like._id.toString() === req.user.userId
                )
                : false,
            },
        });
        } catch (error) {
        console.error("Get entry by ID error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error while fetching entry",
        });
        }
    }

    // Update entry
    async updateEntry(req, res) {
        try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
            success: false,
            message: "Validation failed",
            errors: errors.array(),
            });
        }

        const { id } = req.params;
        const updateData = req.body;

        // Find entry
        const entry = await Entry.findById(id);
        if (!entry) {
            return res.status(404).json({
            success: false,
            message: "Cultural entry not found",
            });
        }

        // Check permissions
        const canEdit =
            entry.author.toString() === req.user.userId ||
            req.user.role === "admin";

        if (!canEdit) {
            return res.status(403).json({
            success: false,
            message: "Access denied. You can only edit your own entries.",
            });
        }

        // Handle nested location updates
        if (updateData.location) {
            updateData.location = {
            name: updateData.location.name ?? entry.location.name,
            coordinates:
                updateData.location.coordinates ?? entry.location.coordinates,
            country: updateData.location.country ?? entry.location.country,
            region: updateData.location.region ?? entry.location.region,
            address: updateData.location.address ?? entry.location.address,
            };
        }

        // Handle nested media updates
        if (
            updateData.images ||
            updateData.audioFiles ||
            updateData.videoFiles ||
            updateData.documents
        ) {
            updateData.media = {
            images: updateData.images ?? entry.media.images,
            audioFiles: updateData.audioFiles ?? entry.media.audioFiles,
            videoFiles: updateData.videoFiles ?? entry.media.videoFiles,
            documents: updateData.documents ?? entry.media.documents,
            };
            delete updateData.images;
            delete updateData.audioFiles;
            delete updateData.videoFiles;
            delete updateData.documents;
        }

        // Prevent changing author
        delete updateData.author;
        delete updateData.views;
        delete updateData.likes;
        delete updateData.comments;

        updateData.updatedAt = new Date();

        const updatedEntry = await Entry.findByIdAndUpdate(id, updateData, {
            new: true,
            runValidators: true,
        }).populate("author", "username email profilePicture");

        res.json({
            success: true,
            message: "Cultural entry updated successfully",
            data: { entry: updatedEntry },
        });
        } catch (error) {
        console.error("Update entry error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error while updating entry",
        });
        }
    }

    // Delete entry
    async deleteEntry(req, res) {
        try {
        const { id } = req.params;

        const entry = await Entry.findById(id);
        if (!entry) {
            return res.status(404).json({
            success: false,
            message: "Cultural entry not found",
            });
        }

        // Check permissions
        const canDelete =
            entry.author.toString() === req.user.userId ||
            req.user.role === "admin";

        if (!canDelete) {
            return res.status(403).json({
            success: false,
            message: "Access denied. You can only delete your own entries.",
            });
        }

        await Entry.findByIdAndDelete(id);

        res.json({
            success: true,
            message: "Cultural entry deleted successfully",
        });
        } catch (error) {
        console.error("Delete entry error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error while deleting entry",
        });
        }
    }

    // Get user's own entries
    async getUserEntries(req, res) {
        try {
        const {
            page = 1,
            limit = 10,
            status,
            category,
            sortBy = "updatedAt",
            sortOrder = "desc",
            search,
        } = req.query;

        const filter = { author: req.user.userId };

        if (status) filter.status = status;
        if (category && category !== "all") filter.category = category;

        if (search && search.trim()) {
            filter.$or = [
            { title: new RegExp(search.trim(), "i") },
            { description: new RegExp(search.trim(), "i") },
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const sortOptions = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

        const entries = await Entry.find(filter)
            .sort(sortOptions)
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        const totalEntries = await Entry.countDocuments(filter);
        const totalPages = Math.ceil(totalEntries / parseInt(limit));

        // Get status breakdown
        const statusCounts = await Entry.aggregate([
            { $match: { author: req.user.userId } },
            { $group: { _id: "$status", count: { $sum: 1 } } },
        ]);

        res.json({
            success: true,
            data: {
            entries,
            pagination: {
                currentPage: parseInt(page),
                totalPages,
                totalEntries,
                hasNext: parseInt(page) < totalPages,
                hasPrev: parseInt(page) > 1,
            },
            statusBreakdown: statusCounts.reduce((acc, item) => {
                acc[item._id] = item.count;
                return acc;
            }, {}),
            },
        });
        } catch (error) {
        console.error("Get user entries error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error while fetching user entries",
        });
        }
    }

    // Toggle publish status
    async togglePublishStatus(req, res) {
        try {
        const { id } = req.params;
        const { status } = req.body;

        if (!["published", "draft", "archived"].includes(status)) {
            return res.status(400).json({
            success: false,
            message:
                'Invalid status. Must be "published", "draft", or "archived"',
            });
        }

        const entry = await Entry.findById(id);
        if (!entry) {
            return res.status(404).json({
            success: false,
            message: "Cultural entry not found",
            });
        }

        // Check permissions
        const canEdit =
            entry.author.toString() === req.user.userId ||
            req.user.role === "admin";

        if (!canEdit) {
            return res.status(403).json({
            success: false,
            message: "Access denied",
            });
        }

        entry.status = status;
        if (status === "published" && !entry.publishedAt) {
            entry.publishedAt = new Date();
        }
        entry.updatedAt = new Date();

        await entry.save();

        res.json({
            success: true,
            message: `Entry ${status} successfully`,
            data: { entry },
        });
        } catch (error) {
        console.error("Toggle publish status error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error while updating entry status",
        });
        }
    }

    // Add comment to entry
    async addComment(req, res) {
        try {
        const { id } = req.params;
        const { content, parentCommentId } = req.body;

        if (!content || content.trim().length === 0) {
            return res.status(400).json({
            success: false,
            message: "Comment content is required",
            });
        }

        if (content.length > 1000) {
            return res.status(400).json({
            success: false,
            message: "Comment must be less than 1000 characters",
            });
        }

        const entry = await Entry.findById(id);
        if (!entry) {
            return res.status(404).json({
            success: false,
            message: "Cultural entry not found",
            });
        }

        // Check if entry allows comments
        if (!entry.isPublic && entry.author.toString() !== req.user.userId) {
            return res.status(403).json({
            success: false,
            message: "Cannot comment on private entries",
            });
        }

        const comment = {
            author: req.user.userId,
            content: content.trim(),
            parentComment: parentCommentId || null,
            createdAt: new Date(),
            likes: [],
        };

        entry.comments.push(comment);
        await entry.save();

        const populatedEntry = await Entry.findById(id).populate(
            "comments.author",
            "username profilePicture"
        );

        const newComment =
            populatedEntry.comments[populatedEntry.comments.length - 1];

        res.status(201).json({
            success: true,
            message: "Comment added successfully",
            data: { comment: newComment },
        });
        } catch (error) {
        console.error("Add comment error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error while adding comment",
        });
        }
    }

    // Delete comment
    async deleteComment(req, res) {
        try {
        const { id, commentId } = req.params;

        const entry = await Entry.findById(id);
        if (!entry) {
            return res.status(404).json({
            success: false,
            message: "Cultural entry not found",
            });
        }

        const comment = entry.comments.id(commentId);
        if (!comment) {
            return res.status(404).json({
            success: false,
            message: "Comment not found",
            });
        }

        // Check permissions - comment author, entry author, or admin
        const canDelete =
            comment.author.toString() === req.user.userId ||
            entry.author.toString() === req.user.userId ||
            req.user.role === "admin";

        if (!canDelete) {
            return res.status(403).json({
            success: false,
            message: "Access denied",
            });
        }

        comment.deleteOne();
        await entry.save();

        res.json({
            success: true,
            message: "Comment deleted successfully",
        });
        } catch (error) {
        console.error("Delete comment error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error while deleting comment",
        });
        }
    }

    // Like/Unlike entry
    async toggleLike(req, res) {
        try {
        const { id } = req.params;

        const entry = await Entry.findById(id);
        if (!entry) {
            return res.status(404).json({
            success: false,
            message: "Cultural entry not found",
            });
        }

        const userIdIndex = entry.likes.indexOf(req.user.userId);
        let action;

        if (userIdIndex > -1) {
            // Unlike
            entry.likes.splice(userIdIndex, 1);
            action = "unliked";
        } else {
            // Like
            entry.likes.push(req.user.userId);
            action = "liked";
        }

        await entry.save();

        res.json({
            success: true,
            message: `Entry ${action} successfully`,
            data: {
            likesCount: entry.likes.length,
            hasLiked: action === "liked",
            },
        });
        } catch (error) {
        console.error("Toggle like error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error while toggling like",
        });
        }
    }

    // Get entry statistics
    async getEntryStats(req, res) {
        try {
        const userId = req.user.userId;
        const userFilter = req.user.role === "admin" ? {} : { author: userId };

        const stats = await Entry.aggregate([
            { $match: userFilter },
            {
            $group: {
                _id: null,
                totalEntries: { $sum: 1 },
                publishedEntries: {
                $sum: { $cond: [{ $eq: ["$status", "published"] }, 1, 0] },
                },
                draftEntries: {
                $sum: { $cond: [{ $eq: ["$status", "draft"] }, 1, 0] },
                },
                archivedEntries: {
                $sum: { $cond: [{ $eq: ["$status", "archived"] }, 1, 0] },
                },
                totalViews: { $sum: "$views" },
                totalLikes: { $sum: { $size: "$likes" } },
                totalComments: { $sum: { $size: "$comments" } },
            },
            },
        ]);

        const categoryStats = await Entry.aggregate([
            { $match: userFilter },
            { $group: { _id: "$category", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
        ]);

        const recentEntries = await Entry.find(userFilter)
            .sort({ createdAt: -1 })
            .limit(5)
            .select("title status createdAt views")
            .lean();

        const popularEntries = await Entry.find(userFilter)
            .sort({ views: -1 })
            .limit(5)
            .select("title status views likes")
            .lean();

        res.json({
            success: true,
            data: {
            overview: stats[0] || {
                totalEntries: 0,
                publishedEntries: 0,
                draftEntries: 0,
                archivedEntries: 0,
                totalViews: 0,
                totalLikes: 0,
                totalComments: 0,
            },
            categoryBreakdown: categoryStats,
            recentEntries,
            popularEntries,
            },
        });
        } catch (error) {
        console.error("Get entry stats error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error while fetching statistics",
        });
        }
    }

    // Get trending entries
    async getTrendingEntries(req, res) {
        try {
        const { limit = 10, days = 7 } = req.query;

        const dateThreshold = new Date();
        dateThreshold.setDate(dateThreshold.getDate() - parseInt(days));

        const trendingEntries = await Entry.find({
            isPublic: true,
            status: "published",
            createdAt: { $gte: dateThreshold },
        })
            .sort({ views: -1, likes: -1 })
            .limit(parseInt(limit))
            .populate("author", "username profilePicture")
            .select(
            "title description category media.images views likes comments createdAt"
            )
            .lean();

        res.json({
            success: true,
            data: {
            trending: trendingEntries,
            period: `Last ${days} days`,
            },
        });
        } catch (error) {
        console.error("Get trending entries error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error while fetching trending entries",
        });
        }
    }

    // Get featured entries
    async getFeaturedEntries(req, res) {
        try {
        const { limit = 6 } = req.query;

        const featuredEntries = await Entry.find({
            isPublic: true,
            status: "published",
            featured: true,
        })
            .sort({ featuredAt: -1 })
            .limit(parseInt(limit))
            .populate("author", "username profilePicture")
            .select("title description category media.images views likes createdAt")
            .lean();

        res.json({
            success: true,
            data: { featured: featuredEntries },
        });
        } catch (error) {
        console.error("Get featured entries error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error while fetching featured entries",
        });
        }
    }

    // Toggle featured status (Admin only)
    async toggleFeatured(req, res) {
        try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
            success: false,
            message: "Access denied. Admin privileges required.",
            });
        }

        const { id } = req.params;
        const { featured } = req.body;

        const entry = await Entry.findById(id);
        if (!entry) {
            return res.status(404).json({
            success: false,
            message: "Cultural entry not found",
            });
        }

        entry.featured = featured;
        if (featured) {
            entry.featuredAt = new Date();
        }

        await entry.save();

        res.json({
            success: true,
            message: `Entry ${featured ? "featured" : "unfeatured"} successfully`,
            data: { entry },
        });
        } catch (error) {
        console.error("Toggle featured error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error while toggling featured status",
        });
        }
    }

    // Bulk operations (Admin only)
    async bulkDelete(req, res) {
        try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
            success: false,
            message: "Access denied. Admin privileges required.",
            });
        }

        const { entryIds } = req.body;

        if (!Array.isArray(entryIds) || entryIds.length === 0) {
            return res.status(400).json({
            success: false,
            message: "Entry IDs array is required",
            });
        }

        const result = await Entry.deleteMany({
            _id: { $in: entryIds },
        });

        res.json({
            success: true,
            message: `${result.deletedCount} entries deleted successfully`,
            data: { deletedCount: result.deletedCount },
        });
        } catch (error) {
        console.error("Bulk delete error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error while deleting entries",
        });
        }
    }

    // Export entry data
    async exportEntry(req, res) {
        try {
        const { id } = req.params;
        const { format = "json" } = req.query;

        const entry = await Entry.findById(id)
            .populate("author", "username email")
            .lean();

        if (!entry) {
            return res.status(404).json({
            success: false,
            message: "Cultural entry not found",
            });
        }

        // Check permissions
        const canExport =
            entry.author._id.toString() === req.user.userId ||
            req.user.role === "admin" ||
            entry.isPublic;

        if (!canExport) {
            return res.status(403).json({
            success: false,
            message: "Access denied",
            });
        }

        if (format === "json") {
            res.json({
            success: true,
            data: { entry },
            });
        } else {
            // Could add CSV, PDF export formats here
            res.status(400).json({
            success: false,
            message: "Unsupported export format",
            });
        }
        } catch (error) {
        console.error("Export entry error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error while exporting entry",
        });
        }
    }
}

module.exports = new EntryController();
