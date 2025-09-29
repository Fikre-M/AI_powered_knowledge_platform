    const bcrypt = require("bcryptjs");
    const jwt = require("jsonwebtoken");
    const User = require("../models/User");
    const { validationResult } = require("express-validator");

    class AuthController {
    // Register new user
    async register(req, res) {
        try {
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
            success: false,
            message: "Validation failed",
            errors: errors.array(),
            });
        }

        const { username, email, password } = req.body;

        // Check if user already exists
        const existingUser = await User.findOne({
            $or: [{ email }, { username }],
        });

        if (existingUser) {
            return res.status(409).json({
            success: false,
            message: "User already exists with this email or username",
            });
        }

        // Hash password
        const saltRounds = 12;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Create new user
        const newUser = new User({
            username,
            email,
            password: hashedPassword,
        });

        const savedUser = await newUser.save();

        // Generate JWT token
        const token = jwt.sign(
            {
            userId: savedUser._id,
            username: savedUser.username,
            role: savedUser.role,
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
        );

        res.status(201).json({
            success: true,
            message: "User registered successfully",
            data: {
            user: {
                id: savedUser._id,
                username: savedUser.username,
                email: savedUser.email,
                role: savedUser.role,
                createdAt: savedUser.createdAt,
            },
            token,
            },
        });
        } catch (error) {
        console.error("Registration error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error during registration",
        });
        }
    }

    // Login user
    async login(req, res) {
        try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
            success: false,
            message: "Validation failed",
            errors: errors.array(),
            });
        }

        const { email, password } = req.body;

        // Find user by email
        const user = await User.findOne({ email }).select("+password");
        if (!user) {
            return res.status(401).json({
            success: false,
            message: "Invalid email or password",
            });
        }

        // Check if account is active
        if (!user.isActive) {
            return res.status(403).json({
            success: false,
            message: "Account is deactivated. Please contact support.",
            });
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({
            success: false,
            message: "Invalid email or password",
            });
        }

        // Update last login
        user.lastLogin = new Date();
        await user.save();

        // Generate JWT token
        const token = jwt.sign(
            {
            userId: user._id,
            username: user.username,
            role: user.role,
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
        );

        res.json({
            success: true,
            message: "Login successful",
            data: {
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                lastLogin: user.lastLogin,
            },
            token,
            },
        });
        } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error during login",
        });
        }
    }

    // Logout user
    async logout(req, res) {
        try {
        // In a more complex setup, you might want to blacklist the token
        // For now, we'll just send a success response
        res.json({
            success: true,
            message: "Logout successful",
        });
        } catch (error) {
        console.error("Logout error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error during logout",
        });
        }
    }

    // Get current user profile
    async getProfile(req, res) {
        try {
        const user = await User.findById(req.user.userId).select("-password");

        if (!user) {
            return res.status(404).json({
            success: false,
            message: "User not found",
            });
        }

        res.json({
            success: true,
            data: {
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                isActive: user.isActive,
                createdAt: user.createdAt,
                lastLogin: user.lastLogin,
            },
            },
        });
        } catch (error) {
        console.error("Get profile error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
        }
    }

    // Change password
    async changePassword(req, res) {
        try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
            success: false,
            message: "Validation failed",
            errors: errors.array(),
            });
        }

        const { currentPassword, newPassword } = req.body;
        const userId = req.user.userId;

        // Get user with password
        const user = await User.findById(userId).select("+password");
        if (!user) {
            return res.status(404).json({
            success: false,
            message: "User not found",
            });
        }

        // Verify current password
        const isCurrentPasswordValid = await bcrypt.compare(
            currentPassword,
            user.password
        );
        if (!isCurrentPasswordValid) {
            return res.status(400).json({
            success: false,
            message: "Current password is incorrect",
            });
        }

        // Hash new password
        const saltRounds = 12;
        const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

        // Update password
        user.password = hashedNewPassword;
        await user.save();

        res.json({
            success: true,
            message: "Password changed successfully",
        });
        } catch (error) {
        console.error("Change password error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
        }
    }

    // Refresh JWT token
    async refreshToken(req, res) {
        try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(401).json({
            success: false,
            message: "Refresh token is required",
            });
        }

        // Verify refresh token
        const decoded = jwt.verify(
            refreshToken,
            process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET
        );
        const user = await User.findById(decoded.userId);

        if (!user || !user.isActive) {
            return res.status(403).json({
            success: false,
            message: "Invalid refresh token or user not found",
            });
        }

        // Generate new access token
        const newToken = jwt.sign(
            {
            userId: user._id,
            username: user.username,
            role: user.role,
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
        );

        res.json({
            success: true,
            message: "Token refreshed successfully",
            data: { token: newToken },
        });
        } catch (error) {
        console.error("Refresh token error:", error);
        res.status(403).json({
            success: false,
            message: "Invalid refresh token",
        });
        }
    }
    }

    module.exports = new AuthController();
