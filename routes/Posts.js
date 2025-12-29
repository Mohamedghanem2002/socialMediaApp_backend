
import express from "express";

import Post from "../models/Posts.js"
import User from "../models/User.js"

import cloudinary from "../utils/cloudinary.js"
const router = express.Router()
import {authMiddleware} from "../middleware/AuthMiddleware.js"
import Notification from "../models/Notification.js";


router.post("/", authMiddleware, async(req,res)=> {
    try {
        const {image , text}  = req.body
       

       

        const newPost = new Post({
            user : req.user?.id ,
            text,
            image
        })

        await newPost.save()
        res.status(201).json(newPost);
    } catch (error) {
        res.status(500).json({ error: error.message }); 
    }
})


router.get("/", authMiddleware, async(req,res)=> {
    try {
        const { filter } = req.query;
        let query = {};

        if (filter === "following") {
            const currentUser = await User.findById(req.user.id);
            if (currentUser && currentUser.following.length > 0) {
                // Return posts from users the current user follows
                query = { user: { $in: currentUser.following } };
            } else {
                // If they don't follow anyone, return empty array for this filter
                return res.json([]);
            }
        }

        const posts = await Post.find(query)
        .populate("user","name email avatar")
        .populate("likes")
        .sort({ createdAt: -1 });

        const postsWithLikeStatus = posts.map(post => {
            const isLikedByUser = post.likes.some(like => like._id.toString() === req.user.id);
            return {
                ...post.toObject(),
                isLikedByUser
            };
        });

         res.json(postsWithLikeStatus);

    } catch (error) {
         res.status(500).json({ error: error.message });     
    }
})


router.put("/:id", authMiddleware, async(req,res)=> {
    try {
        const post = await Post.findById(req.params.id)
        if(post.user.toString() !== req.user.id){
            return res.status(403).json({error:"Not Authorized"})

        }

        post.text = req.body.text ||  post.text
        post.image = req.body.image ||  post.image
        await post.save();

        res.json(post);

    } catch (error) {
        res.status(500).json({error:error.message})
    }
})

router.delete("/:postId", authMiddleware, async(req,res)=> {
    try {
        const post = await Post.findById(req.params.postId) 

        if(post.user.toString() !== req.user.id){
            return res.status(403).json({error:"Not Authorized"})

        }

        await post.deleteOne()
        res.json({message:"Post Deleted Successfully"})

    } catch (error) {
       res.status(500).json({error:error.message}) 
    }
})

router.get("/by-user/:userId", async(req,res)=> {
    try {
       const posts = await Post.find({user:req.params.userId}) 
       .populate("user" , "name email avatar")
        .sort({ createdAt: -1 });
        res.json(posts)
    } catch (error) {
          res.status(500).json({ error: error.message });
    }
})

router.get("/:id", authMiddleware, async(req,res)=> {
    try {
        const post = await Post.findById(req.params.id)
            .populate("user", "name email avatar")
            .populate("likes", "name avatar");
            
        if (!post) {
            return res.status(404).json({ error: "Post not found" });
        }

        const isLikedByUser = post.likes.some(like => like._id.toString() === req.user.id);
        
        res.json({
            ...post.toObject(),
            isLikedByUser
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
})

router.post("/like/:id", authMiddleware, async(req,res)=> {

    try {
        const {id} = req.params
    const userId = req.user.id

    const post = await Post.findById(id)
    const hasLiked = post.likes.includes(userId)
    if(hasLiked){
        post.likes.pull(userId)
    }else{
        post.likes.push(userId)

          // Create notification if liker is not post owner
        
                 if(post.user.toString() !== req.user.id){
                    const notification =  new Notification({
                        recipient: post.user,
                        sender:userId,
                        type:"like",
                        post : id,
                      
                    })
                    await notification.save()
        
                    const populatedNotification = await notification.populate("sender", "name avatar")
                
                     // Send real-time notification
                     const pusher = req.app.get("pusher");
                     pusher.trigger(`user-${post.user.toString()}`, "notification:new", populatedNotification);
                }

    }

      await post.save();

      res.json({
       id:post._id,
       liked: !hasLiked,
       likesCount: post.likes.length,
      })
    } catch (error) {
          res.status(500).json({ error: error.message });
    }
    
})



export default router