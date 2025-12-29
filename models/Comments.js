import express from "express";
import mongoose from "mongoose";

const commentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    post: { type: mongoose.Schema.Types.ObjectId, ref: "Post" },
    text: {
      type: String,
      createdAt: { type: Date, default: Date.now },
    },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: "Comment", default: null },
      replies: [
        {
          user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          text: { type: String },
          createdAt: { type: Date, default: Date.now },
        },
      ],
    },
  
  { timestamps: true }
);

export default mongoose.models.Comment || mongoose.model("Comment", commentSchema);
