import express from "express";
import { authMiddleware } from "../middleware/AuthMiddleware.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
const router = express.Router();

// Get list of conversations (users chatted with)
router.get("/conversations", authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.user.id;

    // Find all messages where current user is sender or recipient
    const messages = await Message.find({
      $or: [{ sender: currentUserId }, { recipient: currentUserId }],
    }).sort({ createdAt: -1 });

    const userIds = new Set();
    messages.forEach((msg) => {
      const otherUser =
        msg.sender.toString() === currentUserId
          ? msg.recipient.toString()
          : msg.sender.toString();
      userIds.add(otherUser);
    });

    const users = await User.find({ _id: { $in: Array.from(userIds) } }).select(
      "name avatar email"
    );

    // Add unread count for each conversation
    const usersWithUnread = await Promise.all(
      users.map(async (u) => {
        const unreadCount = await Message.countDocuments({
          sender: u._id,
          recipient: currentUserId,
          read: false,
        });
        return { ...u.toObject(), unreadCount };
      })
    );

    res.json(usersWithUnread);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get total unread message count
router.get("/unread-count", authMiddleware, async (req, res) => {
  try {
    const count = await Message.countDocuments({
      recipient: req.user.id,
      read: false,
    });
    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark messages as read from a specific user
router.put("/read/:userId", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;

    await Message.updateMany(
      { sender: userId, recipient: currentUserId, read: false },
      { $set: { read: true } }
    );

    // Notify the sender that their messages have been read
    const pusher = req.app.get("pusher");
    pusher.trigger(`user-${userId}`, "messageRead", {
      readerId: currentUserId,
      senderId: userId,
    });

    res.json({ message: "Messages marked as read" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get message history with a specific user
router.get("/:userId", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;

    const messages = await Message.find({
      $or: [
        { sender: currentUserId, recipient: userId },
        { sender: userId, recipient: currentUserId },
      ],
    }).sort({ createdAt: 1 });

    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send a message
router.post("/send/:id", authMiddleware, async (req, res) => {
  try {
    const { text } = req.body;
    const { id: recipientId } = req.params;
    const senderId = req.user.id;

    const newMessage = new Message({
      sender: senderId,
      recipient: recipientId,
      text,
    });

    await newMessage.save();

    // Pusher integration
    const pusher = req.app.get("pusher");
    pusher.trigger(`user-${recipientId}`, "newMessage", newMessage);

    res.status(201).json(newMessage);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
