const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");
const path = require("path");

class CloudinaryConfig {
    constructor() {
        this.isConfigured = false;
        this.storage = null;
        this.upload = null;
        this.initialize();
    }

    // Initialize Cloudinary configuration
    initialize() {
        try {
        // Configure Cloudinary with environment variables
        cloudinary.config({
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET,
            secure: true,
        });

        // Check if configuration is complete
        if (
            process.env.CLOUDINARY_CLOUD_NAME &&
            process.env.CLOUDINARY_API_KEY &&
            process.env.CLOUDINARY_API_SECRET
        ) {
            this.isConfigured = true;
            console.log("✅ Cloudinary configured successfully");
        } else {
            console.warn("⚠️  Cloudinary credentials not fully configured");
        }

        // Setup storage configurations
        this.setupStorageConfigurations();
        } catch (error) {
        console.error("❌ Error configuring Cloudinary:", error.message);
        this.isConfigured = false;
        }
    }

    // Setup different storage configurations for different file types
    setupStorageConfigurations() {
        // Profile Pictures Storage
        this.profilePictureStorage = new CloudinaryStorage({
        cloudinary: cloudinary,
        params: {
            folder: "contextbase/profiles",
            allowed_formats: ["jpg", "jpeg", "png", "gif", "webp"],
            transformation: [
            { width: 500, height: 500, crop: "fill", gravity: "face" },
            { quality: "auto:good" },
            { fetch_format: "auto" },
            ],
            public_id: (req, file) => {
            const userId = req.user?.userId || "anonymous";
            const timestamp = Date.now();
            return `profile_${userId}_${timestamp}`;
            },
        },
        });

        // Entry Images Storage
        this.entryImageStorage = new CloudinaryStorage({
        cloudinary: cloudinary,
        params: {
            folder: "contextbase/entries/images",
            allowed_formats: ["jpg", "jpeg", "png", "gif", "webp"],
            transformation: [
            { width: 1200, height: 800, crop: "limit" },
            { quality: "auto:good" },
            { fetch_format: "auto" },
            ],
            public_id: (req, file) => {
            const timestamp = Date.now();
            const originalName = path.parse(file.originalname).name;
            return `entry_${originalName}_${timestamp}`;
            },
        },
        });

        // Audio Files Storage
        this.audioStorage = new CloudinaryStorage({
        cloudinary: cloudinary,
        params: {
            folder: "contextbase/entries/audio",
            allowed_formats: ["mp3", "wav", "ogg", "m4a"],
            resource_type: "video", // Cloudinary treats audio as video
            public_id: (req, file) => {
            const timestamp = Date.now();
            const originalName = path.parse(file.originalname).name;
            return `audio_${originalName}_${timestamp}`;
            },
        },
        });

        // Video Files Storage
        this.videoStorage = new CloudinaryStorage({
        cloudinary: cloudinary,
        params: {
            folder: "contextbase/entries/videos",
            allowed_formats: ["mp4", "mov", "avi", "webm"],
            resource_type: "video",
            transformation: [
            { width: 1920, height: 1080, crop: "limit" },
            { quality: "auto:good" },
            ],
            public_id: (req, file) => {
            const timestamp = Date.now();
            const originalName = path.parse(file.originalname).name;
            return `video_${originalName}_${timestamp}`;
            },
        },
        });

        // Documents Storage (PDFs, docs, etc.)
        this.documentStorage = new CloudinaryStorage({
        cloudinary: cloudinary,
        params: {
            folder: "contextbase/entries/documents",
            allowed_formats: [
            "pdf",
            "doc",
            "docx",
            "txt",
            "xls",
            "xlsx",
            "ppt",
            "pptx",
            ],
            resource_type: "raw",
            public_id: (req, file) => {
            const timestamp = Date.now();
            const originalName = path.parse(file.originalname).name;
            return `document_${originalName}_${timestamp}`;
            },
        },
        });
    }

    // Get multer upload middleware for profile pictures
    getProfilePictureUpload() {
        return multer({
        storage: this.profilePictureStorage,
        limits: {
            fileSize: 5 * 1024 * 1024, // 5MB limit
        },
        fileFilter: (req, file, cb) => {
            this.imageFileFilter(req, file, cb);
        },
        });
    }

    // Get multer upload middleware for entry images
    getEntryImageUpload() {
        return multer({
        storage: this.entryImageStorage,
        limits: {
            fileSize: 10 * 1024 * 1024, // 10MB limit
        },
        fileFilter: (req, file, cb) => {
            this.imageFileFilter(req, file, cb);
        },
        });
    }

    // Get multer upload middleware for audio files
    getAudioUpload() {
        return multer({
        storage: this.audioStorage,
        limits: {
            fileSize: 25 * 1024 * 1024, // 25MB limit
        },
        fileFilter: (req, file, cb) => {
            this.audioFileFilter(req, file, cb);
        },
        });
    }

    // Get multer upload middleware for video files
    getVideoUpload() {
        return multer({
        storage: this.videoStorage,
        limits: {
            fileSize: 100 * 1024 * 1024, // 100MB limit
        },
        fileFilter: (req, file, cb) => {
            this.videoFileFilter(req, file, cb);
        },
        });
    }

    // Get multer upload middleware for documents
    getDocumentUpload() {
        return multer({
        storage: this.documentStorage,
        limits: {
            fileSize: 10 * 1024 * 1024, // 10MB limit
        },
        fileFilter: (req, file, cb) => {
            this.documentFileFilter(req, file, cb);
        },
        });
    }

    // Image file filter
    imageFileFilter(req, file, cb) {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(
        path.extname(file.originalname).toLowerCase()
        );
        const mimetype = allowedTypes.test(file.mimetype);

        if (extname && mimetype) {
        return cb(null, true);
        } else {
        cb(new Error("Only image files (JPEG, PNG, GIF, WebP) are allowed!"));
        }
    }

    // Audio file filter
    audioFileFilter(req, file, cb) {
        const allowedTypes = /mp3|wav|ogg|m4a/;
        const extname = allowedTypes.test(
        path.extname(file.originalname).toLowerCase()
        );
        const mimetype = /audio/.test(file.mimetype);

        if (extname && mimetype) {
        return cb(null, true);
        } else {
        cb(new Error("Only audio files (MP3, WAV, OGG, M4A) are allowed!"));
        }
    }

    // Video file filter
    videoFileFilter(req, file, cb) {
        const allowedTypes = /mp4|mov|avi|webm/;
        const extname = allowedTypes.test(
        path.extname(file.originalname).toLowerCase()
        );
        const mimetype = /video/.test(file.mimetype);

        if (extname && mimetype) {
        return cb(null, true);
        } else {
        cb(new Error("Only video files (MP4, MOV, AVI, WebM) are allowed!"));
        }
    }

    // Document file filter
    documentFileFilter(req, file, cb) {
        const allowedTypes = /pdf|doc|docx|txt|xls|xlsx|ppt|pptx/;
        const extname = allowedTypes.test(
        path.extname(file.originalname).toLowerCase()
        );

        if (extname) {
        return cb(null, true);
        } else {
        cb(
            new Error(
            "Only document files (PDF, DOC, DOCX, TXT, XLS, XLSX, PPT, PPTX) are allowed!"
            )
        );
        }
    }

    // Upload file directly to Cloudinary (without multer)
    async uploadFile(filePath, options = {}) {
        try {
        if (!this.isConfigured) {
            throw new Error("Cloudinary is not configured");
        }

        const defaultOptions = {
            folder: "contextbase/misc",
            resource_type: "auto",
            quality: "auto:good",
            fetch_format: "auto",
        };

        const uploadOptions = { ...defaultOptions, ...options };
        const result = await cloudinary.uploader.upload(filePath, uploadOptions);

        return {
            success: true,
            url: result.secure_url,
            publicId: result.public_id,
            format: result.format,
            width: result.width,
            height: result.height,
            bytes: result.bytes,
            resourceType: result.resource_type,
        };
        } catch (error) {
        console.error("Error uploading file to Cloudinary:", error.message);
        throw error;
        }
    }

    // Delete file from Cloudinary
    async deleteFile(publicId, resourceType = "image") {
        try {
        if (!this.isConfigured) {
            throw new Error("Cloudinary is not configured");
        }

        const result = await cloudinary.uploader.destroy(publicId, {
            resource_type: resourceType,
        });

        return {
            success: result.result === "ok",
            message:
            result.result === "ok"
                ? "File deleted successfully"
                : "File not found",
        };
        } catch (error) {
        console.error("Error deleting file from Cloudinary:", error.message);
        throw error;
        }
    }

    // Delete multiple files from Cloudinary
    async deleteFiles(publicIds, resourceType = "image") {
        try {
        if (!this.isConfigured) {
            throw new Error("Cloudinary is not configured");
        }

        const result = await cloudinary.api.delete_resources(publicIds, {
            resource_type: resourceType,
        });

        return {
            success: true,
            deleted: result.deleted,
            deletedCount: Object.keys(result.deleted).length,
        };
        } catch (error) {
        console.error("Error deleting files from Cloudinary:", error.message);
        throw error;
        }
    }

    // Get file URL with transformations
    getTransformedUrl(publicId, transformations) {
        try {
        if (!this.isConfigured) {
            throw new Error("Cloudinary is not configured");
        }

        return cloudinary.url(publicId, transformations);
        } catch (error) {
        console.error("Error getting transformed URL:", error.message);
        throw error;
        }
    }

    // Generate thumbnail URL
    getThumbnailUrl(publicId, width = 200, height = 200) {
        return this.getTransformedUrl(publicId, {
        width,
        height,
        crop: "fill",
        gravity: "auto",
        quality: "auto:good",
        fetch_format: "auto",
        });
    }

    // Get optimized image URL
    getOptimizedImageUrl(publicId, width = 1200) {
        return this.getTransformedUrl(publicId, {
        width,
        crop: "limit",
        quality: "auto:best",
        fetch_format: "auto",
        });
    }

    // List files in a folder
    async listFiles(folder, options = {}) {
        try {
        if (!this.isConfigured) {
            throw new Error("Cloudinary is not configured");
        }

        const defaultOptions = {
            type: "upload",
            prefix: folder,
            max_results: 100,
        };

        const listOptions = { ...defaultOptions, ...options };
        const result = await cloudinary.api.resources(listOptions);

        return {
            success: true,
            resources: result.resources,
            total: result.total_count,
            nextCursor: result.next_cursor,
        };
        } catch (error) {
        console.error("Error listing files from Cloudinary:", error.message);
        throw error;
        }
    }

    // Get folder details
    async getFolderDetails(folder) {
        try {
        if (!this.isConfigured) {
            throw new Error("Cloudinary is not configured");
        }

        const result = await cloudinary.api.sub_folders(folder);

        return {
            success: true,
            folders: result.folders,
            total: result.total_count,
        };
        } catch (error) {
        console.error("Error getting folder details:", error.message);
        throw error;
        }
    }

    // Get storage usage
    async getUsage() {
        try {
        if (!this.isConfigured) {
            throw new Error("Cloudinary is not configured");
        }

        const result = await cloudinary.api.usage();

        return {
            success: true,
            plan: result.plan,
            usage: {
            credits: result.credits.usage,
            creditsLimit: result.credits.limit,
            bandwidth: this.formatBytes(result.bandwidth.usage),
            bandwidthLimit: this.formatBytes(result.bandwidth.limit),
            storage: this.formatBytes(result.storage.usage),
            storageLimit: this.formatBytes(result.storage.limit),
            requests: result.requests,
            requestsLimit: result.requests_limit,
            },
        };
        } catch (error) {
        console.error("Error getting Cloudinary usage:", error.message);
        throw error;
        }
    }

    // Format bytes to human-readable format
    formatBytes(bytes) {
        if (bytes === 0) return "0 Bytes";

        const k = 1024;
        const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    }

    // Health check
    async healthCheck() {
        try {
        if (!this.isConfigured) {
            return {
            status: "not_configured",
            message: "Cloudinary is not configured",
            };
        }

        // Ping Cloudinary API
        await cloudinary.api.ping();

        return {
            status: "healthy",
            message: "Cloudinary connection is healthy",
            configured: true,
        };
        } catch (error) {
        return {
            status: "unhealthy",
            message: "Cloudinary health check failed",
            error: error.message,
        };
        }
    }

    // Check if Cloudinary is configured
    isReady() {
        return this.isConfigured;
    }
}

// Export singleton instance
module.exports = new CloudinaryConfig();
