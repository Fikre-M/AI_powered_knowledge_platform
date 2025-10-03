const database = require("../../config/database");
const { v4: uuidv4 } = require("uuid");

class DatabaseMigrations {
  constructor() {
    this.db = database;
  }

  // Run all migrations
  async runMigrations() {
    try {
      console.log("🚀 Starting database migrations...\n");

      // Connect to database
      await this.db.connect();

      // Create tables in order of dependencies
      await this.createUsersTable();
      await this.createEntriesTable();
      await this.createCommentsTable();
      await this.createLikesTable();
      await this.createConversationsTable();
      await this.createMediaTable();
      await this.createTagsTable();
      await this.createEntryTagsTable();

      console.log("\n✅ All migrations completed successfully!");
      console.log("📊 Database is ready for use.\n");

      // Display summary
      await this.displayMigrationSummary();
    } catch (error) {
      console.error("❌ Migration failed:", error.message);
      throw error;
    }
  }

  // Create Users table
  async createUsersTable() {
    try {
      console.log("📝 Creating users table...");

      await this.db.query(`
        CREATE TABLE IF NOT EXISTS users (
          id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
          username VARCHAR(50) UNIQUE NOT NULL,
          email VARCHAR(100) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          role ENUM('user', 'moderator', 'admin') DEFAULT 'user',
          profile_picture VARCHAR(500),
          bio TEXT,
          location VARCHAR(100),
          website VARCHAR(255),
          social_links JSON,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          last_login TIMESTAMP NULL,
          
          INDEX idx_email (email),
          INDEX idx_username (username),
          INDEX idx_role (role),
          INDEX idx_is_active (is_active),
          INDEX idx_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      console.log("✅ Users table created successfully");
    } catch (error) {
      console.error("❌ Error creating users table:", error.message);
      throw error;
    }
  }

  // Create Entries table
  async createEntriesTable() {
    try {
      console.log("📝 Creating entries table...");

      await this.db.query(`
        CREATE TABLE IF NOT EXISTS entries (
          id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
          title VARCHAR(255) NOT NULL,
          description TEXT NOT NULL,
          category ENUM(
            'Architecture', 'Art', 'Music', 'Dance', 'Literature',
            'Cuisine', 'Festivals', 'Rituals', 'Crafts', 'Clothing',
            'Language', 'Folklore', 'Religion', 'Sports', 'Business Etiquette',
            'Marketing Practices', 'HR & Diversity', 'Sales Strategies', 'Other'
          ) DEFAULT 'Other',
          
          cultural_context TEXT,
          historical_period VARCHAR(100),
          significance TEXT,
          traditions JSON,
          materials JSON,
          techniques JSON,
          
          location_name VARCHAR(255),
          location_country VARCHAR(100),
          location_region VARCHAR(100),
          location_address VARCHAR(500),
          location_coordinates JSON,
          
          sources JSON,
          references JSON,
          
          author_id CHAR(36) NOT NULL,
          status ENUM('draft', 'published', 'archived') DEFAULT 'draft',
          is_public BOOLEAN DEFAULT TRUE,
          featured BOOLEAN DEFAULT FALSE,
          
          views INT UNSIGNED DEFAULT 0,
          
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          published_at TIMESTAMP NULL,
          featured_at TIMESTAMP NULL,
          
          FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
          
          INDEX idx_title (title),
          INDEX idx_category (category),
          INDEX idx_country (location_country),
          INDEX idx_region (location_region),
          INDEX idx_author (author_id),
          INDEX idx_status (status),
          INDEX idx_is_public (is_public),
          INDEX idx_featured (featured),
          INDEX idx_created_at (created_at),
          INDEX idx_views (views),
          INDEX idx_published_at (published_at),
          
          FULLTEXT idx_search (title, description, cultural_context, significance)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      console.log("✅ Entries table created successfully");
    } catch (error) {
      console.error("❌ Error creating entries table:", error.message);
      throw error;
    }
  }

  // Create Comments table
  async createCommentsTable() {
    try {
      console.log("📝 Creating comments table...");

      await this.db.query(`
        CREATE TABLE IF NOT EXISTS comments (
          id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
          entry_id CHAR(36) NOT NULL,
          author_id CHAR(36) NOT NULL,
          content TEXT NOT NULL,
          parent_comment_id CHAR(36) NULL,
          
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          
          FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE,
          FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (parent_comment_id) REFERENCES comments(id) ON DELETE CASCADE,
          
          INDEX idx_entry (entry_id),
          INDEX idx_author (author_id),
          INDEX idx_parent (parent_comment_id),
          INDEX idx_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      console.log("✅ Comments table created successfully");
    } catch (error) {
      console.error("❌ Error creating comments table:", error.message);
      throw error;
    }
  }

  // Create Likes table
  async createLikesTable() {
    try {
      console.log("📝 Creating likes table...");

      await this.db.query(`
        CREATE TABLE IF NOT EXISTS likes (
          id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
          entry_id CHAR(36) NOT NULL,
          user_id CHAR(36) NOT NULL,
          
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          
          FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          
          UNIQUE KEY unique_like (entry_id, user_id),
          INDEX idx_entry (entry_id),
          INDEX idx_user (user_id),
          INDEX idx_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      console.log("✅ Likes table created successfully");
    } catch (error) {
      console.error("❌ Error creating likes table:", error.message);
      throw error;
    }
  }

  // Create Conversations table (for AI chat)
  async createConversationsTable() {
    try {
      console.log("📝 Creating conversations table...");

      await this.db.query(`
        CREATE TABLE IF NOT EXISTS conversations (
          id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
          user_id CHAR(36) NOT NULL,
          title VARCHAR(255) NOT NULL,
          messages JSON NOT NULL,
          
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          
          INDEX idx_user (user_id),
          INDEX idx_created_at (created_at),
          INDEX idx_updated_at (updated_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      console.log("✅ Conversations table created successfully");
    } catch (error) {
      console.error("❌ Error creating conversations table:", error.message);
      throw error;
    }
  }

  // Create Media table (for images, audio, video, documents)
  async createMediaTable() {
    try {
      console.log("📝 Creating media table...");

      await this.db.query(`
        CREATE TABLE IF NOT EXISTS media (
          id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
          entry_id CHAR(36) NOT NULL,
          media_type ENUM('image', 'audio', 'video', 'document') NOT NULL,
          url VARCHAR(500) NOT NULL,
          public_id VARCHAR(255),
          file_name VARCHAR(255),
          file_size INT UNSIGNED,
          mime_type VARCHAR(100),
          width INT UNSIGNED,
          height INT UNSIGNED,
          duration INT UNSIGNED,
          thumbnail_url VARCHAR(500),
          
          uploaded_by CHAR(36) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          
          FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE,
          FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE,
          
          INDEX idx_entry (entry_id),
          INDEX idx_type (media_type),
          INDEX idx_uploaded_by (uploaded_by),
          INDEX idx_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      console.log("✅ Media table created successfully");
    } catch (error) {
      console.error("❌ Error creating media table:", error.message);
      throw error;
    }
  }

  // Create Tags table
  async createTagsTable() {
    try {
      console.log("📝 Creating tags table...");

      await this.db.query(`
        CREATE TABLE IF NOT EXISTS tags (
          id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
          name VARCHAR(50) UNIQUE NOT NULL,
          slug VARCHAR(50) UNIQUE NOT NULL,
          description TEXT,
          usage_count INT UNSIGNED DEFAULT 0,
          
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          
          INDEX idx_name (name),
          INDEX idx_slug (slug),
          INDEX idx_usage_count (usage_count)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      console.log("✅ Tags table created successfully");
    } catch (error) {
      console.error("❌ Error creating tags table:", error.message);
      throw error;
    }
  }

  // Create Entry_Tags junction table
  async createEntryTagsTable() {
    try {
      console.log("📝 Creating entry_tags table...");

      await this.db.query(`
        CREATE TABLE IF NOT EXISTS entry_tags (
          entry_id CHAR(36) NOT NULL,
          tag_id CHAR(36) NOT NULL,
          
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          
          PRIMARY KEY (entry_id, tag_id),
          FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE,
          FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
          
          INDEX idx_entry (entry_id),
          INDEX idx_tag (tag_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      console.log("✅ Entry_tags table created successfully");
    } catch (error) {
      console.error("❌ Error creating entry_tags table:", error.message);
      throw error;
    }
  }

  // Display migration summary
  async displayMigrationSummary() {
    try {
      const stats = await this.db.getStats();

      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("📊 Database Migration Summary");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log(`Database: ${stats.database}`);
      console.log(`Total Size: ${stats.totalSize}`);
      console.log(`Tables Created: ${stats.tableCount}`);
      console.log("");
      console.log("Tables:");
      stats.tables.forEach((table) => {
        console.log(
          `  ✓ ${table.name.padEnd(20)} - ${table.rows} rows, ${table.size}`
        );
      });
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    } catch (error) {
      console.log("⚠️  Could not display summary");
    }
  }

  // Rollback - drop all tables
  async rollback() {
    try {
      console.log("⚠️  Starting rollback - dropping all tables...\n");

      if (process.env.NODE_ENV === "production") {
        throw new Error("Cannot rollback in production environment!");
      }

      await this.db.connect();

      // Disable foreign key checks
      await this.db.query("SET FOREIGN_KEY_CHECKS = 0");

      // Drop tables in reverse order
      const tables = [
        "entry_tags",
        "tags",
        "media",
        "conversations",
        "likes",
        "comments",
        "entries",
        "users",
      ];

      for (const table of tables) {
        await this.db.query(`DROP TABLE IF EXISTS ${table}`);
        console.log(`✓ Dropped table: ${table}`);
      }

      // Re-enable foreign key checks
      await this.db.query("SET FOREIGN_KEY_CHECKS = 1");

      console.log("\n✅ Rollback completed successfully\n");
    } catch (error) {
      console.error("❌ Rollback failed:", error.message);
      throw error;
    }
  }

  // Seed database with sample data
  async seedDatabase() {
    try {
      console.log("🌱 Seeding database with sample data...\n");

      await this.db.connect();

      // Create admin user
      const bcrypt = require("bcryptjs");
      const adminPassword = await bcrypt.hash("Admin123!", 12);
      const adminId = uuidv4();

      await this.db.query(
        `
        INSERT INTO users (id, username, email, password, role, bio, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
        [
          adminId,
          "admin",
          "admin@contextbase.com",
          adminPassword,
          "admin",
          "System Administrator",
          true,
        ]
      );
      console.log("✓ Created admin user (admin@contextbase.com / Admin123!)");

      // Create sample user
      const userPassword = await bcrypt.hash("User123!", 12);
      const userId = uuidv4();

      await this.db.query(
        `
        INSERT INTO users (id, username, email, password, role, bio, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
        [
          userId,
          "john_doe",
          "john@contextbase.com",
          userPassword,
          "user",
          "Product Manager specializing in APAC markets",
          true,
        ]
      );
      console.log("✓ Created sample user (john@contextbase.com / User123!)");

      // Create sample tags
      const tags = [
        { name: "Japan", slug: "japan" },
        { name: "Business Etiquette", slug: "business-etiquette" },
        { name: "Asia Pacific", slug: "asia-pacific" },
        { name: "Corporate Culture", slug: "corporate-culture" },
      ];

      for (const tag of tags) {
        const tagId = uuidv4();
        await this.db.query(
          `
          INSERT INTO tags (id, name, slug, usage_count)
          VALUES (?, ?, ?, ?)
        `,
          [tagId, tag.name, tag.slug, 0]
        );
      }
      console.log(`✓ Created ${tags.length} sample tags`);

      // Create sample entry
      const entryId = uuidv4();
      await this.db.query(
        `
        INSERT INTO entries (
          id, title, description, category, cultural_context,
          historical_period, significance, location_name, location_country,
          location_region, author_id, status, is_public, views
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          entryId,
          "Japanese Business Card Exchange Protocol",
          "The meishi koukan (business card exchange) is a formal ritual in Japanese business culture that demonstrates respect and establishes hierarchy from the first interaction.",
          "Business Etiquette",
          "Business cards are extensions of one's identity in Japan. The exchange follows specific protocols including two-handed presentation, careful reading, and respectful handling.",
          "Modern (Post-1945)",
          "Critical for first impressions and building trust in Japanese business relationships",
          "Tokyo",
          "Japan",
          "Asia Pacific",
          adminId,
          "published",
          true,
          156,
        ]
      );
      console.log("✓ Created sample entry");

      console.log("\n✅ Database seeded successfully!\n");
      console.log("🔐 Login credentials:");
      console.log("   Admin: admin@contextbase.com / Admin123!");
      console.log("   User:  john@contextbase.com / User123!\n");
    } catch (error) {
      console.error("❌ Seeding failed:", error.message);
      throw error;
    }
  }
}

// Export the class and create CLI interface
const migrations = new DatabaseMigrations();

// CLI commands
const command = process.argv[2];

(async () => {
  try {
    switch (command) {
      case "up":
      case "migrate":
        await migrations.runMigrations();
        break;

      case "down":
      case "rollback":
        await migrations.rollback();
        break;

      case "seed":
        await migrations.seedDatabase();
        break;

      case "fresh":
        await migrations.rollback();
        await migrations.runMigrations();
        await migrations.seedDatabase();
        break;

      default:
        console.log("Available commands:");
        console.log(
          "  node database/migrations/createTables.js migrate  - Run migrations"
        );
        console.log(
          "  node database/migrations/createTables.js rollback - Drop all tables"
        );
        console.log(
          "  node database/migrations/createTables.js seed     - Seed sample data"
        );
        console.log(
          "  node database/migrations/createTables.js fresh    - Rollback + Migrate + Seed"
        );
    }

    process.exit(0);
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
})();

module.exports = DatabaseMigrations;
