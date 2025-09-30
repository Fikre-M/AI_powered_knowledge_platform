const Entry = require("../models/Entry");
const Conversation = require("../models/Conversation");
const { validationResult } = require("express-validator");

class AIController {
    constructor() {
        // Initialize AI service based on environment configuration
        this.aiService = this.initializeAIService();
        this.conversationCache = new Map();
    }

  // Initialize AI service
    initializeAIService() {
        const aiProvider = process.env.AI_PROVIDER || "openai";

        try {
        switch (aiProvider.toLowerCase()) {
            case "openai":
            const { OpenAI } = require("openai");
            return new OpenAI({
                apiKey: process.env.OPENAI_API_KEY,
            });

            case "anthropic":
            const { Anthropic } = require("@anthropic-ai/sdk");
            return new Anthropic({
                apiKey: process.env.ANTHROPIC_API_KEY,
            });

            case "google":
            const { GoogleGenerativeAI } = require("@google/generative-ai");
            return new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);

            default:
            console.warn("No AI provider configured or unsupported provider");
            return null;
        }
        } catch (error) {
        console.error("Failed to initialize AI service:", error.message);
        return null;
        }
    }

    // Main Q&A endpoint - Ask AI about cultural heritage topics
    async askQuestion(req, res) {
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
            question,
            context,
            includeEntries = false,
            conversationId = null,
            temperature = 0.7,
            maxTokens = 1000,
        } = req.body;

        if (!this.aiService) {
            return res.status(503).json({
            success: false,
            message: "AI service not available. Please check configuration.",
            });
        }

        // Prepare context from user's entries if requested
        let entryContext = "";
        if (includeEntries) {
            try {
            const userEntries = await Entry.find({
                author: req.user.userId,
                status: "published",
            })
                .limit(5)
                .select("title description culturalContext category location");

            if (userEntries.length > 0) {
                entryContext =
                "\n\nRelevant cultural entries from your collection:\n";
                userEntries.forEach((entry, index) => {
                entryContext += `${index + 1}. ${entry.title} (${
                    entry.category
                })\n`;
                entryContext += `   Description: ${entry.description.substring(
                    0,
                    200
                )}...\n`;
                if (entry.culturalContext) {
                    entryContext += `   Cultural Context: ${entry.culturalContext.substring(
                    0,
                    150
                    )}...\n`;
                }
                if (entry.location?.country) {
                    entryContext += `   Location: ${entry.location.country}\n`;
                }
                });
            }
            } catch (entryError) {
            console.warn("Failed to fetch user entries for context:", entryError);
            }
        }

        // Retrieve conversation history if conversationId is provided
        let conversationHistory = [];
        if (conversationId) {
            const conversation = await Conversation.findOne({
            _id: conversationId,
            userId: req.user.userId,
            });

            if (conversation) {
            conversationHistory = conversation.messages.slice(-5); // Last 5 messages
            }
        }

        // Construct AI prompt
        const systemPrompt = `You are a knowledgeable assistant specializing in cultural heritage, history, anthropology, and cultural preservation. 

    Your expertise includes:
    - World cultural practices and traditions
    - Historical contexts and evolution of cultures
    - Indigenous knowledge and wisdom
    - Cultural artifacts and their significance
    - Preservation techniques and best practices
    - Ethical considerations in cultural documentation

    Guidelines:
    1. Provide accurate, respectful, and educational responses
    2. Acknowledge cultural diversity and complexity
    3. Emphasize the importance of cultural preservation
    4. Respect indigenous knowledge and cultural ownership
    5. Encourage proper permissions and ethical practices
    6. Cite sources when possible
    7. Admit uncertainty rather than speculate
    8. Be sensitive to cultural appropriation concerns`;

        const userPrompt = `Question: ${question}

    ${context ? `Additional context: ${context}` : ""}${entryContext}

    ${
    conversationHistory.length > 0
        ? `\nPrevious conversation:\n${conversationHistory
            .map((msg) => `${msg.role}: ${msg.content}`)
            .join("\n")}`
        : ""
    }

    Please provide a comprehensive, educational response about this cultural heritage topic.`;

        // Make AI API call based on provider
        let aiResponse;
        const aiProvider = process.env.AI_PROVIDER || "openai";

        if (aiProvider === "openai") {
            const messages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
            ];

            const completion = await this.aiService.chat.completions.create({
            model: process.env.OPENAI_MODEL || "gpt-3.5-turbo",
            messages: messages,
            max_tokens: maxTokens,
            temperature: temperature,
            });

            aiResponse = completion.choices[0].message.content;
        } else if (aiProvider === "anthropic") {
            const message = await this.aiService.messages.create({
            model: process.env.ANTHROPIC_MODEL || "claude-3-sonnet-20240229",
            max_tokens: maxTokens,
            temperature: temperature,
            system: systemPrompt,
            messages: [{ role: "user", content: userPrompt }],
            });

            aiResponse = message.content[0].text;
        } else if (aiProvider === "google") {
            const model = this.aiService.getGenerativeModel({
            model: process.env.GOOGLE_MODEL || "gemini-pro",
            });

            const result = await model.generateContent([systemPrompt, userPrompt]);
            const response = await result.response;
            aiResponse = response.text();
        }

        // Save conversation history
        let newConversationId = conversationId;
        if (!conversationId) {
            const newConversation = new Conversation({
            userId: req.user.userId,
            title: question.substring(0, 100),
            messages: [
                { role: "user", content: question },
                { role: "assistant", content: aiResponse },
            ],
            });
            const savedConversation = await newConversation.save();
            newConversationId = savedConversation._id;
        } else {
            await Conversation.findByIdAndUpdate(conversationId, {
            $push: {
                messages: {
                $each: [
                    { role: "user", content: question },
                    { role: "assistant", content: aiResponse },
                ],
                },
            },
            $set: { updatedAt: new Date() },
            });
        }

        res.json({
            success: true,
            data: {
            question,
            answer: aiResponse,
            conversationId: newConversationId,
            timestamp: new Date(),
            provider: aiProvider,
            model:
                process.env.OPENAI_MODEL ||
                process.env.ANTHROPIC_MODEL ||
                process.env.GOOGLE_MODEL ||
                "default",
            },
        });
        } catch (error) {
        console.error("AI question error:", error);

        // Handle specific AI service errors
        if (error.code === "insufficient_quota" || error.status === 429) {
            return res.status(503).json({
            success: false,
            message: "AI service quota exceeded. Please try again later.",
            });
        }

        if (error.code === "rate_limit_exceeded" || error.status === 429) {
            return res.status(429).json({
            success: false,
            message: "Too many requests. Please wait before trying again.",
            });
        }

        if (error.code === "context_length_exceeded") {
            return res.status(400).json({
            success: false,
            message:
                "Question or context is too long. Please shorten your input.",
            });
        }

        res.status(500).json({
            success: false,
            message: "Internal server error while processing AI request",
            error:
            process.env.NODE_ENV === "development" ? error.message : undefined,
        });
        }
    }

    // Get suggestions for cultural entry enhancement
    async getEntrySuggestions(req, res) {
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
        const canAccess =
            entry.author.toString() === req.user.userId ||
            entry.isPublic ||
            req.user.role === "admin";

        if (!canAccess) {
            return res.status(403).json({
            success: false,
            message: "Access denied to this entry",
            });
        }

        if (!this.aiService) {
            return res.status(503).json({
            success: false,
            message: "AI service not available",
            });
        }

        // Create prompt for entry enhancement
        const prompt = `Analyze this cultural heritage entry and provide actionable suggestions for enhancement:

    Title: ${entry.title}
    Description: ${entry.description}
    Category: ${entry.category}
    Cultural Context: ${entry.culturalContext || "Not provided"}
    Historical Period: ${entry.historicalPeriod || "Not provided"}
    Location: ${entry.location?.name || "Not provided"}, ${
            entry.location?.country || "Unknown"
        }
    Current Tags: ${entry.tags.join(", ") || "None"}

    Please provide specific, actionable suggestions in the following areas:

    1. DESCRIPTION IMPROVEMENTS:
    - What details could enhance the description?
    - What aspects are missing?

    2. CULTURAL CONTEXT:
    - What additional cultural information should be included?
    - What cultural connections could be explored?

    3. RECOMMENDED TAGS:
    - Suggest 5-8 relevant tags that are missing

    4. RESEARCH QUESTIONS:
    - What questions should be investigated further?
    - What sources should be consulted?

    5. RELATED TOPICS:
    - What related cultural elements should be documented?
    - What connections to other cultures exist?

    Format your response clearly with bullet points under each section.`;

        const aiProvider = process.env.AI_PROVIDER || "openai";
        let suggestions;

        if (aiProvider === "openai") {
            const completion = await this.aiService.chat.completions.create({
            model: process.env.OPENAI_MODEL || "gpt-3.5-turbo",
            messages: [
                {
                role: "system",
                content:
                    "You are an expert in cultural heritage documentation and preservation. Provide helpful, specific, and respectful suggestions for improving cultural entries.",
                },
                { role: "user", content: prompt },
            ],
            max_tokens: 1200,
            temperature: 0.6,
            });

            suggestions = completion.choices[0].message.content;
        } else if (aiProvider === "anthropic") {
            const message = await this.aiService.messages.create({
            model: process.env.ANTHROPIC_MODEL || "claude-3-sonnet-20240229",
            max_tokens: 1200,
            temperature: 0.6,
            system:
                "You are an expert in cultural heritage documentation and preservation. Provide helpful, specific, and respectful suggestions for improving cultural entries.",
            messages: [{ role: "user", content: prompt }],
            });

            suggestions = message.content[0].text;
        }

        res.json({
            success: true,
            data: {
            entryId: id,
            entryTitle: entry.title,
            suggestions,
            timestamp: new Date(),
            },
        });
        } catch (error) {
        console.error("Get entry suggestions error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error while generating suggestions",
        });
        }
    }

    // Generate tags for an entry based on content
    async generateTags(req, res) {
        try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
            success: false,
            message: "Validation failed",
            errors: errors.array(),
            });
        }

        const { title, description, culturalContext, category, location } =
            req.body;

        if (!this.aiService) {
            return res.status(503).json({
            success: false,
            message: "AI service not available",
            });
        }

        const prompt = `Generate relevant, specific tags for this cultural heritage entry. Return ONLY a comma-separated list of 10-15 tags.

    Title: ${title}
    Description: ${description}
    Category: ${category}
    Cultural Context: ${culturalContext || "Not provided"}
    Location: ${location?.country || "Not provided"}

    Requirements:
    - Focus on cultural aspects, practices, and traditions
    - Include historical periods if relevant
    - Add geographic/regional identifiers
    - Include material types and techniques
    - Add social and community aspects
    - Use specific, searchable terms
    - Avoid generic tags

    Return format: tag1, tag2, tag3, ...`;

        const aiProvider = process.env.AI_PROVIDER || "openai";
        let tagsText;

        if (aiProvider === "openai") {
            const completion = await this.aiService.chat.completions.create({
            model: process.env.OPENAI_MODEL || "gpt-3.5-turbo",
            messages: [
                {
                role: "system",
                content:
                    "You are an expert in cultural heritage taxonomy. Generate relevant, specific tags for cultural entries. Return only the comma-separated list of tags, nothing else.",
                },
                { role: "user", content: prompt },
            ],
            max_tokens: 200,
            temperature: 0.5,
            });

            tagsText = completion.choices[0].message.content;
        } else if (aiProvider === "anthropic") {
            const message = await this.aiService.messages.create({
            model: process.env.ANTHROPIC_MODEL || "claude-3-sonnet-20240229",
            max_tokens: 200,
            temperature: 0.5,
            system:
                "You are an expert in cultural heritage taxonomy. Generate relevant, specific tags for cultural entries. Return only the comma-separated list of tags, nothing else.",
            messages: [{ role: "user", content: prompt }],
            });

            tagsText = message.content[0].text;
        }

        // Parse tags from AI response
        const tags = tagsText
            .split(",")
            .map((tag) => tag.trim())
            .filter((tag) => tag.length > 0 && tag.length < 50)
            .slice(0, 15); // Limit to 15 tags

        res.json({
            success: true,
            data: {
            tags,
            count: tags.length,
            timestamp: new Date(),
            },
        });
        } catch (error) {
        console.error("Generate tags error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error while generating tags",
        });
        }
    }

    // Analyze cultural significance of an entry
    async analyzeCulturalSignificance(req, res) {
        try {
        const { id } = req.params;

        const entry = await Entry.findById(id).populate("author", "username");
        if (!entry) {
            return res.status(404).json({
            success: false,
            message: "Cultural entry not found",
            });
        }

        // Check permissions
        const canAccess =
            entry.author._id.toString() === req.user.userId ||
            entry.isPublic ||
            req.user.role === "admin";

        if (!canAccess) {
            return res.status(403).json({
            success: false,
            message: "Access denied to this entry",
            });
        }

        if (!this.aiService) {
            return res.status(503).json({
            success: false,
            message: "AI service not available",
            });
        }

        const prompt = `Provide a comprehensive analysis of the cultural significance of this heritage entry:

    Title: ${entry.title}
    Description: ${entry.description}
    Category: ${entry.category}
    Cultural Context: ${entry.culturalContext || "Not provided"}
    Historical Period: ${entry.historicalPeriod || "Not provided"}
    Location: ${entry.location?.name || "Not provided"}, ${
            entry.location?.country || "Unknown"
        }
    Region: ${entry.location?.region || "Unknown"}

    Please provide a detailed analysis covering:

    1. CULTURAL IMPORTANCE
    - What makes this culturally significant?
    - What values or beliefs does it represent?

    2. HISTORICAL CONTEXT
    - How has this evolved over time?
    - What historical events influenced it?

    3. SOCIAL SIGNIFICANCE
    - How does it impact the community?
    - What role does it play in society?

    4. PRESERVATION CHALLENGES
    - What threatens its continuation?
    - What preservation efforts are needed?

    5. EDUCATIONAL VALUE
    - What can we learn from this?
    - How can this knowledge be shared?

    6. CONTEMPORARY RELEVANCE
    - How is it relevant today?
    - How is it adapting to modern times?

    Provide a thoughtful, respectful analysis that honors the cultural sensitivity of the subject.`;

        const aiProvider = process.env.AI_PROVIDER || "openai";
        let analysis;

        if (aiProvider === "openai") {
            const completion = await this.aiService.chat.completions.create({
            model: process.env.OPENAI_MODEL || "gpt-4-turbo-preview",
            messages: [
                {
                role: "system",
                content:
                    "You are a cultural anthropologist and heritage expert. Provide insightful, respectful, and comprehensive analysis of cultural significance. Be thorough but concise.",
                },
                { role: "user", content: prompt },
            ],
            max_tokens: 1500,
            temperature: 0.7,
            });

            analysis = completion.choices[0].message.content;
        } else if (aiProvider === "anthropic") {
            const message = await this.aiService.messages.create({
            model: process.env.ANTHROPIC_MODEL || "claude-3-sonnet-20240229",
            max_tokens: 1500,
            temperature: 0.7,
            system:
                "You are a cultural anthropologist and heritage expert. Provide insightful, respectful, and comprehensive analysis of cultural significance. Be thorough but concise.",
            messages: [{ role: "user", content: prompt }],
            });

            analysis = message.content[0].text;
        }

        res.json({
            success: true,
            data: {
            entryId: id,
            entryTitle: entry.title,
            analysis,
            timestamp: new Date(),
            },
        });
        } catch (error) {
        console.error("Analyze cultural significance error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error while analyzing cultural significance",
        });
        }
    }

    // Get conversation history
    async getConversations(req, res) {
        try {
        const { page = 1, limit = 20 } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const conversations = await Conversation.find({ userId: req.user.userId })
            .sort({ updatedAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .select("title createdAt updatedAt messages")
            .lean();

        const total = await Conversation.countDocuments({
            userId: req.user.userId,
        });
        const totalPages = Math.ceil(total / parseInt(limit));

        // Add message count to each conversation
        const conversationsWithCount = conversations.map((conv) => ({
            ...conv,
            messageCount: conv.messages.length,
            lastMessage:
            conv.messages[conv.messages.length - 1]?.content.substring(0, 100) ||
            "",
        }));

        res.json({
            success: true,
            data: {
            conversations: conversationsWithCount,
            pagination: {
                currentPage: parseInt(page),
                totalPages,
                total,
                hasNext: parseInt(page) < totalPages,
                hasPrev: parseInt(page) > 1,
            },
            },
        });
        } catch (error) {
        console.error("Get conversations error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error while fetching conversations",
        });
        }
    }

    // Get single conversation by ID
    async getConversationById(req, res) {
        try {
        const { id } = req.params;

        const conversation = await Conversation.findOne({
            _id: id,
            userId: req.user.userId,
        });

        if (!conversation) {
            return res.status(404).json({
            success: false,
            message: "Conversation not found",
            });
        }

        res.json({
            success: true,
            data: { conversation },
        });
        } catch (error) {
        console.error("Get conversation error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error while fetching conversation",
        });
        }
    }

    // Delete conversation
    async deleteConversation(req, res) {
        try {
        const { id } = req.params;

        const conversation = await Conversation.findOneAndDelete({
            _id: id,
            userId: req.user.userId,
        });

        if (!conversation) {
            return res.status(404).json({
            success: false,
            message: "Conversation not found",
            });
        }

        res.json({
            success: true,
            message: "Conversation deleted successfully",
        });
        } catch (error) {
        console.error("Delete conversation error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error while deleting conversation",
        });
        }
    }

    // Get AI service status
    async getServiceStatus(req, res) {
        try {
        const isAvailable = this.aiService !== null;
        const provider = process.env.AI_PROVIDER || "none";

        res.json({
            success: true,
            data: {
            available: isAvailable,
            provider,
            model:
                process.env.OPENAI_MODEL ||
                process.env.ANTHROPIC_MODEL ||
                process.env.GOOGLE_MODEL ||
                "default",
            features: {
                questionsAndAnswers: isAvailable,
                conversationHistory: isAvailable,
                entrySuggestions: isAvailable,
                tagGeneration: isAvailable,
                culturalAnalysis: isAvailable,
            },
            },
        });
        } catch (error) {
        console.error("Get AI service status error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error while checking service status",
        });
        }
    }
}

module.exports = new AIController();
