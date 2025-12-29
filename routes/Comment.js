import express from "express";
import mongoose from "mongoose";
import { authMiddleware } from "../middleware/AuthMiddleware.js";
import Comments from "../models/Comments.js";
import Posts from "../models/Posts.js";
import Notification from "../models/Notification.js";
const router = express.Router()



// add comment to post
router.post("/:postId", authMiddleware, async(req,res)=> {

    const {postId} = req.params;
    if (!mongoose.Types.ObjectId.isValid(postId)) {
        return res.status(400).json({ error: "Invalid Post ID format" });
    }
    const {text} = req.body


    try {
        // const post = await Commnets.findById(req.params.postId)

        const comment = new Comments({
            text,
            user:req.user.id,
            post :req.params.postId
        })

        await comment.save()

        const populated = await comment.populate("user", "name avatar")

        // Get post to find post owner


        const post = await Posts.findById(req.params.postId)


         // Create notification if commenter is not post owner

         if(post.user.toString() !== req.user.id){
            const notification =  new Notification({
                recipient: post.user,
                sender:req.user.id,
                type:"comment",
                post : req.params.postId,
                comment:comment._id
            })
            await notification.save()

            const populatedNotification = await notification.populate("sender", "name avatar")
        
             // Send real-time notification
             const pusher = req.app.get("pusher");
             pusher.trigger(`user-${post.user.toString()}`, "notification:new", populatedNotification);
        }

        res.status(201).json(populated)

         
    } catch (error) {
     res.status(500).json({ error: error.message });

    }

})


// get all comments for post (including nested replies)
router.get("/:postId", authMiddleware, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.postId)) {
      return res.status(400).json({ error: "Invalid Post ID format" });
    }
    const comments = await Comments.find({ post: req.params.postId })
      .populate("user", "name avatar")
      .sort({ createdAt: 1 }); // Sort by creation date

    res.json(comments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// reply to comment
router.post("/reply/:commentId", authMiddleware, async (req, res) => {
  try {
    const { commentId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(400).json({ error: "Invalid Comment ID format" });
    }
    const { text } = req.body;
    const parentComment = await Comments.findById(req.params.commentId);

    if (!parentComment) {
      return res.status(404).json({ error: "Comment not found" });
    }

    const reply = new Comments({
      text,
      user: req.user.id,
      post: parentComment.post,
      parentId: parentComment._id,
    });

    await reply.save();
    const populated = await reply.populate("user", "name avatar");

    // Create notification
    if (parentComment.user.toString() !== req.user.id) {
      const notification = new Notification({
        recipient: parentComment.user,
        sender: req.user.id,
        type: "reply",
        post: parentComment.post,
        comment: reply._id,
      });
      await notification.save();

      const populatedNotification = await notification.populate(
        "sender",
        "name avatar"
      );

      const pusher = req.app.get("pusher");
      pusher.trigger(`user-${parentComment.user.toString()}`, "notification:new", populatedNotification);
    }

    res.json(populated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


router.get("/count/:postId", authMiddleware , async(req,res)=> {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.postId)) {
          return res.status(400).json({ error: "Invalid Post ID format" });
        }
        const count = await Comments.countDocuments({post:req.params.postId})
        res.json({count})
    } catch (error) {
         res.status(500).json({ error: error.message });
    }
})

// update comment
router.put("/:commentId", authMiddleware, async (req, res) => {
  try {
    const { commentId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(400).json({ error: "Invalid Comment ID format" });
    }
    const { text } = req.body;
    const comment = await Comments.findById(req.params.commentId);

    if (!comment) {
      return res.status(404).json({ error: "Comment not found" });
    }

    if (comment.user.toString() !== req.user.id) {
      return res.status(403).json({ error: "Not authorized to edit this comment" });
    }

    comment.text = text || comment.text;
    await comment.save();

    const populated = await comment.populate("user", "name avatar");
    res.json(populated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// delete comment
router.delete("/:commentId", authMiddleware, async (req, res) => {
  try {
    const { commentId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(400).json({ error: "Invalid Comment ID format" });
    }
    const comment = await Comments.findById(commentId);

    if (!comment) {
      return res.status(404).json({ error: "Comment not found" });
    }

    if (comment.user.toString() !== req.user.id) {
      return res.status(403).json({ error: "Not authorized to delete this comment" });
    }

    // Delete all child replies if this is a parent comment
    await Comments.deleteMany({ parentId: comment._id });
    await comment.deleteOne();

    res.json({ message: "Comment deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


export default router