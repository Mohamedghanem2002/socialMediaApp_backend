import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import User from "./routes/User.js";
import Post from "./routes/Posts.js";
import Comment from "./routes/Comment.js";
import cookieParser from "cookie-parser";
import Notifications from "./routes/Notifications.js";
import Messages from "./routes/Messages.js";
import Pusher from "pusher";

dotenv.config();
const app = express();

// Pusher initialization
const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.PUSHER_CLUSTER,
  useTLS: true
});

app.use(cors({
  origin: ["http://localhost:3000", "http://localhost:5173", "https://social-media-app-frontend-one.vercel.app"],
  credentials: true,
}));

// Make pusher available to all routes
app.set("pusher", pusher);
app.use(cookieParser());
app.use(express.json());
app.use("/users", User);
app.use("/posts", Post);
app.use("/comments", Comment);
app.use("/notifications", Notifications);
app.use("/messages", Messages);

// Basic health check
app.get("/", (req, res) => {
  res.send("Server is running");
});

// Debug route (safe - only shows if keys exist, not their values)
app.get("/debug-env", (req, res) => {
  res.json({
    node_env: process.env.NODE_ENV,
    mongo_uri_set: !!process.env.MONGO_URI,
    jwt_secret_set: !!process.env.JWT_SECRET,
    pusher_app_id_set: !!process.env.PUSHER_APP_ID,
    pusher_key_set: !!process.env.PUSHER_KEY,
    pusher_secret_set: !!process.env.PUSHER_SECRET,
    pusher_cluster_set: !!process.env.PUSHER_CLUSTER,
    cloudinary_set: !!process.env.CLOUDINARY_CLOUD_NAME
  });
});

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((error) => {
    console.error("MongoDB Connection Error:", error);
    // On Vercel, we want to know if it failed
  });

// Port configuration for local and production
const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

// Export for Vercel
export default app;

