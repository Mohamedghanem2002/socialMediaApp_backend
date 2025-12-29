import express from "express";
import Notification from "../models/Notification.js";
import {authMiddleware} from "../middleware/AuthMiddleware.js"



const router = express.Router()


router.get("/", authMiddleware, async(req,res)=> {
    try {
        const notification = await Notification.find({ recipient: req.user.id })
          .populate("sender", "name avatar")
          .populate("post", "text")
          .populate("comment", "text")
          .sort({ createdAt: -1 });


          res.json(notification)
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
})


router.get("/unread-count",authMiddleware, async(req,res)=> {
    
    try {
        const count = await Notification.countDocuments({
            recipient:req.user.id,
             read: false
        })

        res.json({ count });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }

})





router.post("/read-all", authMiddleware, async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user.id, read: false },
      { read: true }
    );
    res.json({ message: "All marked as read" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;