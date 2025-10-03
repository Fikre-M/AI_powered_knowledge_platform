const mysql = require("mysql2/promise");

class Database {
    constructor() {
        this.pool = null;
        this.isConnected = false;
    }

    // Create MySQL connection pool
    async connect() {
        try {
        // Prevent multiple connections
        if (this.isConnected && this.pool) {
            console.log("Using existing database connection pool");
            return this.pool;
        }

        // MySQL connection configuration
        const config = {
            host: process.env.DB_HOST || "localhost",
            port: parseInt(process.env.DB_PORT) || 3306,
            user: process.env.DB_USER || "root",
            password: process.env.DB_PASSWORD || "",
            database: process.env.DB_NAME || "contextbase",
            waitForConnections: true,
            connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
            queueLimit: 0,
            enableKeepAlive: true,
            keepAliveInitialDelay: 0,
            charset: "utf8mb4",
            timezone: "+00:00",
            connectTimeout: 10000, // 10 seconds
            acquireTimeout: 10000,
            // SSL configuration (if needed)
            ssl:
            process.env.DB_SSL === "true"
                ? {
                    rejectUnauthorized:
                    process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false",
                }
                : false,
        };

        // Create connection pool
        this.pool = mysql.createPool(config);

        // Test the connection
        const connection = await this.pool.getConnection();
        console.log("✅ MySQL connected successfully");
        console.log(`📊 Database: ${config.database}`);
        console.log(`🌐 Host: ${config.host}:${config.port}`);
        console.log(`👤 User: ${config.user}`);

        connection.release();
        this.isConnected = true;

        // Setup event handlers
        this.setupEventHandlers();

        return this.pool;
        } catch (error) {
        console.error("❌ MySQL connection error:", error.message);
        this.isConnected = false;
        throw error;
        }
    }

    // Setup event handlers
    setupEventHandlers() {
        // Handle pool events
        this.pool.on("acquire", (connection) => {
        console.log("📡 Connection %d acquired", connection.threadId);
        });

        this.pool.on("release", (connection) => {
        console.log("🔓 Connection %d released", connection.threadId);
        });

        this.pool.on("enqueue", () => {
        console.log("⏳ Waiting for available connection slot");
        });

        // Graceful shutdown handlers
        process.on("SIGINT", async () => {
        console.log("\n🛑 SIGINT received. Closing database connections...");
        await this.disconnect();
        process.exit(0);
        });

        process.on("SIGTERM", async () => {
        console.log("\n🛑 SIGTERM received. Closing database connections...");
        await this.disconnect();
        process.exit(0);
        });
    }

    // Execute query with automatic connection management
    async query(sql, params = []) {
        try {
        if (!this.pool) {
            throw new Error("Database pool not initialized. Call connect() first.");
        }

        const [rows, fields] = await this.pool.execute(sql, params);
        return { rows, fields };
        } catch (error) {
        console.error("❌ Query execution error:", error.message);
        console.error("SQL:", sql);
        throw error;
        }
    }

    // Execute multiple queries in a transaction
    async transaction(callback) {
        const connection = await this.pool.getConnection();

        try {
        await connection.beginTransaction();

        const result = await callback(connection);

        await connection.commit();
        return result;
        } catch (error) {
        await connection.rollback();
        console.error("❌ Transaction error:", error.message);
        throw error;
        } finally {
        connection.release();
        }
    }

    // Close connection pool
    async disconnect() {
        try {
        if (this.pool && this.isConnected) {
            await this.pool.end();
            this.isConnected = false;
            console.log("✅ MySQL disconnected successfully");
        }
        } catch (error) {
        console.error("❌ Error disconnecting from MySQL:", error.message);
        throw error;
        }
    }

    // Get connection status
    getConnectionStatus() {
        if (!this.pool) {
        return {
            isConnected: false,
            message: "Connection pool not initialized",
        };
        }

        return {
        isConnected: this.isConnected,
        poolSize: this.pool.pool.config.connectionLimit,
        activeConnections: this.pool.pool._allConnections.length,
        freeConnections: this.pool.pool._freeConnections.length,
        queuedRequests: this.pool.pool._connectionQueue.length,
        };
    }

    // Health check
    async healthCheck() {
        try {
        if (!this.isConnected || !this.pool) {
            return {
            status: "disconnected",
            message: "Database is not connected",
            };
        }

        // Execute simple query to test connection
        const [rows] = await this.pool.execute("SELECT 1 + 1 AS result");

        return {
            status: "healthy",
            message: "Database connection is healthy",
            details: {
            host: process.env.DB_HOST || "localhost",
            database: process.env.DB_NAME || "contextbase",
            testQuery: rows[0].result === 2 ? "passed" : "failed",
            },
        };
        } catch (error) {
        return {
            status: "unhealthy",
            message: "Database health check failed",
            error: error.message,
        };
        }
    }

    // Get database statistics
    async getStats() {
        try {
        if (!this.isConnected) {
            throw new Error("Database is not connected");
        }

        // Get database size
        const [sizeResult] = await this.pool.execute(
            `
            SELECT 
            table_schema AS 'database',
            ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS 'size_mb'
            FROM information_schema.tables 
            WHERE table_schema = ?
            GROUP BY table_schema
        `,
            [process.env.DB_NAME || "contextbase"]
        );

        // Get table count
        const [tableCount] = await this.pool.execute(
            `
            SELECT COUNT(*) AS table_count 
            FROM information_schema.tables 
            WHERE table_schema = ?
        `,
            [process.env.DB_NAME || "contextbase"]
        );

        // Get tables info
        const [tables] = await this.pool.execute(
            `
            SELECT 
            table_name,
            table_rows,
            ROUND(((data_length + index_length) / 1024 / 1024), 2) AS size_mb
            FROM information_schema.tables 
            WHERE table_schema = ?
            ORDER BY (data_length + index_length) DESC
        `,
            [process.env.DB_NAME || "contextbase"]
        );

        return {
            database: sizeResult[0]?.database || process.env.DB_NAME,
            totalSize: sizeResult[0]?.size_mb
            ? `${sizeResult[0].size_mb} MB`
            : "0 MB",
            tableCount: tableCount[0].table_count,
            tables: tables.map((t) => ({
            name: t.table_name,
            rows: t.table_rows,
            size: `${t.size_mb} MB`,
            })),
        };
        } catch (error) {
        console.error("Error getting database stats:", error.message);
        throw error;
        }
    }

    // Check if table exists
    async tableExists(tableName) {
        try {
        const [rows] = await this.pool.execute(
            `
            SELECT COUNT(*) AS count 
            FROM information_schema.tables 
            WHERE table_schema = ? AND table_name = ?
        `,
            [process.env.DB_NAME || "contextbase", tableName]
        );

        return rows[0].count > 0;
        } catch (error) {
        console.error("Error checking table existence:", error.message);
        throw error;
        }
    }

    // Create database tables (migrations)
    async createTables() {
        try {
        console.log("📑 Creating database tables...");

        // Users table
        await this.pool.execute(`
            CREATE TABLE IF NOT EXISTS users (
            id VARCHAR(36) PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            email VARCHAR(100) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            role ENUM('user', 'moderator', 'admin') DEFAULT 'user',
            profile_picture VARCHAR(500),
            bio TEXT,
            location VARCHAR(100),
            website VARCHAR(255),
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            last_login TIMESTAMP NULL,
            INDEX idx_email (email),
            INDEX idx_username (username),
            INDEX idx_role (role),
            INDEX idx_created_at (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // Entries table
        await this.pool.execute(`
            CREATE TABLE IF NOT EXISTS entries (
            id VARCHAR(36) PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            description TEXT NOT NULL,
            category VARCHAR(50) NOT NULL,
            cultural_context TEXT,
            historical_period VARCHAR(100),
            significance TEXT,
            location_name VARCHAR(255),
            location_country VARCHAR(100),
            location_region VARCHAR(100),
            location_coordinates JSON,
            tags JSON,
            media JSON,
            sources JSON,
            references JSON,
            author_id VARCHAR(36) NOT NULL,
            status ENUM('draft', 'published', 'archived') DEFAULT 'draft',
            is_public BOOLEAN DEFAULT TRUE,
            featured BOOLEAN DEFAULT FALSE,
            views INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            published_at TIMESTAMP NULL,
            featured_at TIMESTAMP NULL,
            FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
            INDEX idx_title (title),
            INDEX idx_category (category),
            INDEX idx_country (location_country),
            INDEX idx_author (author_id),
            INDEX idx_status (status),
            INDEX idx_created_at (created_at),
            INDEX idx_views (views),
            FULLTEXT idx_search (title, description, cultural_context)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // Comments table
        await this.pool.execute(`
            CREATE TABLE IF NOT EXISTS comments (
            id VARCHAR(36) PRIMARY KEY,
            entry_id VARCHAR(36) NOT NULL,
            author_id VARCHAR(36) NOT NULL,
            content TEXT NOT NULL,
            parent_comment_id VARCHAR(36) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE,
            FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (parent_comment_id) REFERENCES comments(id) ON DELETE CASCADE,
            INDEX idx_entry (entry_id),
            INDEX idx_author (author_id),
            INDEX idx_created_at (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // Likes table
        await this.pool.execute(`
            CREATE TABLE IF NOT EXISTS likes (
            id VARCHAR(36) PRIMARY KEY,
            entry_id VARCHAR(36) NOT NULL,
            user_id VARCHAR(36) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE KEY unique_like (entry_id, user_id),
            INDEX idx_entry (entry_id),
            INDEX idx_user (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // AI Conversations table
        await this.pool.execute(`
            CREATE TABLE IF NOT EXISTS conversations (
            id VARCHAR(36) PRIMARY KEY,
            user_id VARCHAR(36) NOT NULL,
            title VARCHAR(255) NOT NULL,
            messages JSON NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            INDEX idx_user (user_id),
            INDEX idx_created_at (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        console.log("✅ Database tables created successfully");
        } catch (error) {
        console.error("Error creating tables:", error.message);
        throw error;
        }
    }

    // Drop all tables (use with caution - mainly for testing)
    async dropAllTables() {
        try {
        if (process.env.NODE_ENV === "production") {
            throw new Error("Cannot drop tables in production environment");
        }

        if (!this.isConnected) {
            throw new Error("Database is not connected");
        }

        console.log("⚠️  Dropping all tables...");

        // Disable foreign key checks
        await this.pool.execute("SET FOREIGN_KEY_CHECKS = 0");

        // Drop tables in reverse order of dependencies
        await this.pool.execute("DROP TABLE IF EXISTS conversations");
        await this.pool.execute("DROP TABLE IF EXISTS likes");
        await this.pool.execute("DROP TABLE IF EXISTS comments");
        await this.pool.execute("DROP TABLE IF EXISTS entries");
        await this.pool.execute("DROP TABLE IF EXISTS users");

        // Re-enable foreign key checks
        await this.pool.execute("SET FOREIGN_KEY_CHECKS = 1");

        console.log("✅ All tables dropped successfully");
        } catch (error) {
        console.error("Error dropping tables:", error.message);
        throw error;
        }
    }

    // Truncate all tables (use with caution - mainly for testing)
    async truncateAllTables() {
        try {
        if (process.env.NODE_ENV === "production") {
            throw new Error("Cannot truncate tables in production environment");
        }

        if (!this.isConnected) {
            throw new Error("Database is not connected");
        }

        console.log("⚠️  Truncating all tables...");

        // Disable foreign key checks
        await this.pool.execute("SET FOREIGN_KEY_CHECKS = 0");

        await this.pool.execute("TRUNCATE TABLE conversations");
        await this.pool.execute("TRUNCATE TABLE likes");
        await this.pool.execute("TRUNCATE TABLE comments");
        await this.pool.execute("TRUNCATE TABLE entries");
        await this.pool.execute("TRUNCATE TABLE users");

        // Re-enable foreign key checks
        await this.pool.execute("SET FOREIGN_KEY_CHECKS = 1");

        console.log("✅ All tables truncated successfully");
        } catch (error) {
        console.error("Error truncating tables:", error.message);
        throw error;
        }
    }

    // Backup database (basic implementation)
    async backup(backupPath) {
        try {
        if (!this.isConnected) {
            throw new Error("Database is not connected");
        }

        console.log("💾 Starting database backup...");
        console.log(`Backup would be created at: ${backupPath}`);
        console.log(
            "⚠️  Note: Implement actual backup logic using mysqldump or cloud service"
        );

        // Example: mysqldump command
        // mysqldump -u username -p database_name > backup.sql
        } catch (error) {
        console.error("Error creating backup:", error.message);
        throw error;
        }
    }

    // Get MySQL version
    async getVersion() {
        try {
        const [rows] = await this.pool.execute("SELECT VERSION() AS version");
        return rows[0].version;
        } catch (error) {
        console.error("Error getting MySQL version:", error.message);
        throw error;
        }
    }

    // Check if database exists
    async databaseExists(dbName) {
        try {
        const [rows] = await this.pool.execute(
            `
            SELECT SCHEMA_NAME 
            FROM INFORMATION_SCHEMA.SCHEMATA 
            WHERE SCHEMA_NAME = ?
        `,
            [dbName]
        );

        return rows.length > 0;
        } catch (error) {
        console.error("Error checking database existence:", error.message);
        throw error;
        }
    }
    }

// Export singleton instance
module.exports = new Database();
