import express from "express";
import mongoose from "mongoose";
import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { authMiddleware } from "../middleware/AuthMiddleware.js";
import Notification from "../models/Notification.js";

const router = express.Router();

// Helper: set auth cookie
function setAuthCookie(res, token) {
  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 1 week
  });
}

// ======= Test endpoint =======
router.get("/", (req, res) => {
  res.send("Users route is working!");
});

// ======= Auth routes =======
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ name, email, password: hashedPassword });
    await user.save();

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    setAuthCookie(res, token);

    res.status(201).json({
      message: "User registered successfully",
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: "User already exists" });
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "Invalid Password" });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    setAuthCookie(res, token);

    res.status(201).json({
      message: "User logged in successfully",
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/logout", (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  });
  res.status(200).json({ message: "User logged out successfully" });
});

// ======= Profile =======
router.get("/me/profile", async (req, res) => {
  try {
    const headerToken = req.header("Authorization")?.replace("Bearer ", "");
    const cookieToken = req.cookies.token;
    const token = headerToken || cookieToken;

    if (!token) return res.status(200).json(null);

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id)
      .select("-password")
      .populate("followers", "name email avatar")
      .populate("following", "name email avatar");

    res.status(200).json(user || null);
  } catch {
    res.status(200).json(null);
  }
});

// ======= Search & suggestions =======
router.get("/search/users", authMiddleware, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);

    const users = await User.find({
      $and: [
        { _id: { $ne: req.user.id } },
        {
          $or: [
            { name: { $regex: q, $options: "i" } },
            { email: { $regex: q, $options: "i" } },
          ],
        },
      ],
    }).select("name email avatar followers following");

    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/suggestions/users", authMiddleware, async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.id);
    const suggestions = await User.find({
      _id: { $nin: [...currentUser.following, req.user.id] },
    })
      .limit(5)
      .select("name email avatar");

    res.json(suggestions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ======= User by ID =======
router.get("/:id", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "Invalid User ID format" });
    }
    const user = await User.findById(req.params.id)
      .select("-password")
      .populate("followers", "name email avatar")
      .populate("following", "name email avatar");
    if (!user) return res.status(404).json({ error: "User not found" });

    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ======= Avatar update =======
router.put("/:id/avatar", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid User ID format" });

    const { avatar } = req.body;
    const user = await User.findByIdAndUpdate(id, { avatar }, { new: true });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ======= Follow/Unfollow =======
router.post("/follow/:id", authMiddleware, async (req, res) => {
  try {
    const targetUserId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(targetUserId)) return res.status(400).json({ error: "Invalid User ID format" });

    const currentUserId = req.user.id;
    if (targetUserId === currentUserId) return res.status(400).json({ error: "You cannot follow yourself" });

    const targetUser = await User.findById(targetUserId);
    const currentUser = await User.findById(currentUserId);
    if (!targetUser || !currentUser) return res.status(404).json({ error: "User not found" });

    const isFollowing = currentUser.following.some((id) => id.toString() === targetUserId);

    if (isFollowing) {
      currentUser.following.pull(targetUserId);
      targetUser.followers.pull(currentUserId);
    } else {
      currentUser.following.push(targetUserId);
      targetUser.followers.push(currentUserId);

      const notification = new Notification({
        recipient: targetUserId,
        sender: currentUserId,
        type: "follow",
      });
      await notification.save();
      const populatedNotification = await notification.populate("sender", "name avatar");

      const pusher = req.app.get("pusher");
      pusher.trigger(`user-${targetUserId}`, "notification:new", populatedNotification);
    }

    await currentUser.save();
    await targetUser.save();

    res.json({
      following: currentUser.following,
      followersCount: targetUser.followers.length,
      isFollowing: !isFollowing,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
