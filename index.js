const express = require('express');
const app = express();
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const { reset } = require('nodemon');

const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

require('dotenv').config();


// Middleware
app.use(express.json());
app.use(express.urlencoded({ limit: '200mb', extended: true, parameterLimit: 500000 }));
app.use(cors());

const userId = process.env.USER_ID;
const password = process.env.PASSWORD;

const uri = `mongodb+srv://${userId}:${password}@job-portal.ipinpor.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        await client.connect();
        const db = client.db("blogPortal");
        const blogsCollection = db.collection("blogs");
        const userActionsCollection = db.collection("userActions");
        const userProfilesCollection = db.collection("userProfiles"); // Define userProfilesCollection
        const userCommentsCollection = db.collection("comments");
        const userReportsCollection = db.collection("reports");
        const userCommentActionCollection = db.collection("userCommentsAction");
        const messagesCollection = db.collection("messages");
        const userNotificationsCollection = db.collection("notification");

        // Creating index for blog sorting, last blog posted will show first
        await blogsCollection.createIndex({ createdAt: -1 }, { name: "createdAtIndex" });
        await userNotificationsCollection.createIndex({ createdAt: -1 }, { name: "createdAtIndex" });


        // Routes

        // Change the backend route to accept the email parameter
        app.post("/send-message", async (req, res) => {
            const { message, reciverEmail, senderEmail } = req.body; // Correct typo in variable name
            try {
                const result = await messagesCollection.insertOne({
                    message,
                    reciverEmail, // Correct typo in variable name
                    senderEmail,
                    createdAt: new Date()
                });
                res.status(200).json({ success: true, message: "Message submitted successfully" });
            } catch (error) {
                console.error("Error submitting message:", error);
                res.status(500).json({ success: false, error: "Internal server error" });
            }
        });

        app.post("/send-notification", async (req, res) => {
            const { email } = req.body;
            try {
                const userComments = await userCommentsCollection.find({ email: email, notification: false }).toArray();
                
                if (userComments.length > 0) {
                    const notificationsToInsert = userComments.map(comment => ({
                        createdAt: new Date(),
                        email: email,
                        name: comment.name,
                        comment: comment.comment,
                        message: "You got a new comment on your blog",
                        blogId: comment.blogId,
                    }));
        
                    await userNotificationsCollection.insertMany(notificationsToInsert);
        
                    await userCommentsCollection.updateMany(
                        { email: email, notification: false },
                        { $set: { notification: true } }
                    );
        
                    res.json({ success: true, message: "New comments added to notifications" });
                } else {
                    res.json({ success: false, message: "No new comments found" });
                }

                const userActions = await userActionsCollection.find({})



            } catch (error) {
                console.error("Unable to find or insert notifications:", error);
                res.status(500).json({ success: false, error: "Internal Server Error" });
            }
        });
        

        // Get all notifications
        app.get("/notifications", async (req, res) => {
            try {
                const notifications = await userNotificationsCollection
                    .find({ email: req.query.email }) // Filter notifications by user's email
                    .sort({ createdAt: -1 }) // Sort notifications by createdAt field in descending order
                    .toArray();
                res.json(notifications);
            } catch (error) {
                console.error("Error fetching notifications:", error);
                res.status(500).json({ success: false, error: "Internal server error" });
            }
        });


        // Get user action for a specific post
        app.get("/user-action/:postId", async (req, res) => {
            const { postId } = req.params;
            const { userId } = req.query;

            try {
                const userAction = await userActionsCollection.findOne({
                    postId: postId,
                    userId: userId
                });

                res.json({ success: true, action: userAction ? userAction.action : null });
            } catch (error) {
                console.error("Error fetching user action:", error);
                res.status(500).json({ success: false, error: "Internal server error" });
            }
        });

        app.post("/like/:id", async (req, res) => {
            const { id } = req.params;
            const { userId, email } = req.body;
        
            try {
                const existingLikeAction = await userActionsCollection.findOne({
                    postId: id,
                    user: userId,
                    action: true,
                });
        
                const existingDislikeAction = await userActionsCollection.findOne({
                    postId: id,
                    user: userId,
                    action: false,
                });
        
                if (existingLikeAction) {
                    return res.status(200).json({ success: true, message: "Already Liked" });
                } else if (existingDislikeAction) {
                    await blogsCollection.updateOne(
                        { _id: new ObjectId(id) },
                        { $inc: { dislikes: -1 } }
                    );
                    await userActionsCollection.updateOne(
                        { postId: id },
                        { $set: { action: true } }
                    );
                    await blogsCollection.updateOne(
                        { _id: new ObjectId(id) },
                        { $inc: { likes: 1 } }
                    );
                } else {
                    await userActionsCollection.insertOne({
                        postId: id,
                        user: userId,
                        action: true,
                        email: email,
                    });
                    await blogsCollection.updateOne(
                        { _id: new ObjectId(id) },
                        { $inc: { likes: 1 } }
                    );
                }
                return res.status(200).json({ success: true, message: "Liked successfully" });
            } catch (error) {
                console.error("Error adding like:", error);
                return res.status(500).json({ success: false, error: "Internal server error" });
            }
        });
        
        app.post("/dislike/:id", async (req, res) => {
            const { id } = req.params;
            const { userId, email } = req.body;
        
            try {
                const existingDislikeAction = await userActionsCollection.findOne({
                    postId: id,
                    user: userId,
                    action: false,
                });
        
                const existingLikeAction = await userActionsCollection.findOne({
                    postId: id,
                    user: userId,
                    action: true,
                });
        
                if (existingDislikeAction) {
                    return res.json({ success: true, message: "Already Disliked" });
                } else if (existingLikeAction) {
                    await blogsCollection.updateOne(
                        { _id: new ObjectId(id) },
                        { $inc: { likes: -1 } }
                    );
        
                    await userActionsCollection.updateOne(
                        { postId: id },
                        { $set: { action: false } }
                    );
        
                    await blogsCollection.updateOne(
                        { _id: new ObjectId(id) },
                        { $inc: { dislikes: 1 } }
                    );
                } else {
                    await userActionsCollection.insertOne({
                        postId: id,
                        user: userId,
                        action: false,
                        email: email,
                    });
                    await blogsCollection.updateOne(
                        { _id: new ObjectId(id) },
                        { $inc: { dislikes: 1 } }
                    );
                }
                return res.status(200).json({ success: true, message: "Disliked successfully" });
            } catch (error) {
                console.error("Error adding dislike:", error);
                return res.status(500).json({ success: false, error: "Internal server error" });
            }
        });
        
    
        app.post("/report/:id", async (req, res) => {
            const { id } = req.params;
            const { userId } = req.body;
            try {
                // Check if the user has already reported this post
                const existingReport = await userReportsCollection.findOne({ postId: id, repoter: userId });

                if (!existingReport) {
                    // Increment report count and mark the post as reported
                    const result = await userReportsCollection.updateOne(
                        { postId: id },
                        {
                            $push: { repoter: userId }
                        },
                        {
                            $inc: { reportCount: +1 },
                        }
                    )
                    const updatedReport = await userReportsCollection.findOne({ postId: id });
                    if (updatedReport && updatedReport.reportCount > 1) {
                        // Delete the post if the report count exceeds 20
                        await blogsCollection.deleteOne({ _id: new ObjectId(id) });
                        console.log("blog deleted");
                        return res.status(200).json({ success: false, message: "Blog Deleted" });
                    }
                    return res.status(200).json({ success: true, message: "Report successful" });
                }
                else {
                    return res.status(200).json({ success: false, error: "You have already reported this post" });
                }
            } catch (error) {
                console.error("Error reporting post:", error);
                res.status(500).json({ success: false, error: "Internal server error" });
            }
        });

        app.post("/comment/like/:commentId", async (req, res) => {
            // Handle like action for the comment with commentId
            const { commentId } = req.params;
            const { userId,email } = req.body;

            try {
                const existingLikeAction = await userCommentActionCollection.findOne({
                    _id: new ObjectId(commentId),
                    userId,
                    action: "like"
                });

                if (existingLikeAction) {
                    console.log("Already Liked");
                    return res.json({ success: true, message: "Already Liked" });
                }

                const existingDislikeAction = await userCommentActionCollection.findOne({
                    _id: new ObjectId(commentId),
                    userId,
                    action: "dislike"
                });

                if (existingDislikeAction) {
                    await userCommentsCollection.updateOne(
                        { _id: new ObjectId(commentId) },
                        { $inc: { dislikes: -1 } }
                    );

                    await userCommentActionCollection.deleteOne({
                        _id: new ObjectId(commentId),
                        userId,
                        action: "dislike"
                    });
                }

                await userCommentActionCollection.insertOne({
                    _id: new ObjectId(commentId),
                    userId,
                    action: "like"
                });

                await userCommentsCollection.updateOne(
                    { _id: new ObjectId(commentId) },
                    { $inc: { likes: 1 } }
                );

                res.json({ success: true });
            } catch (error) {
                console.error("Error adding like:", error);
                res.status(500).json({ success: false, error: "Internal server error" });
            }
        });

        app.post("/comment/dislike/:commentId", async (req, res) => {
            // Handle dislike action for the comment with commentId
            const { commentId } = req.params;
            const { userId } = req.body;

            try {
                const existingDislikeAction = await userCommentActionCollection.findOne({
                    _id: new ObjectId(commentId),
                    userId,
                    action: "dislike"
                });

                if (existingDislikeAction) {
                    console.log("Already Disliked");
                    return res.json({ success: true, message: "Already Disliked" });
                }

                const existingLikeAction = await userCommentActionCollection.findOne({
                    _id: new ObjectId(commentId),
                    userId,
                    action: "like"
                });

                if (existingLikeAction) {
                    await userCommentsCollection.updateOne(
                        { _id: new ObjectId(commentId) },
                        { $inc: { likes: -1 } }
                    );

                    await userCommentActionCollection.deleteOne({
                        _id: new ObjectId(commentId),
                        userId,
                        action: "like"
                    });
                }

                await userCommentActionCollection.insertOne({
                    _id: new ObjectId(commentId),
                    userId,
                    action: "dislike"
                });

                await userCommentsCollection.updateOne(
                    { _id: new ObjectId(commentId) },
                    { $inc: { dislikes: 1 } }
                );

                res.json({ success: true });
            } catch (error) {
                console.error("Error adding dislike:", error);
                res.status(500).json({ success: false, error: "Internal server error" });
            }
        });



        app.post("/comment/report/:commentId", async (req, res) => {
            // Handle report action for the comment with commentId
            const { commentId } = req.params;
            const { userId } = req.body;
            try {
                // Check if the user has already reported this post
                const existingReport = await userReportsCollection.findOne({ postId: commentId, repoter: userId });

                if (!existingReport) {
                    // Increment report count and mark the post as reported
                    const result = await userReportsCollection.updateOne(
                        { postId: commentId },
                        {
                            $push: { repoter: userId }
                        },
                        {
                            $inc: { reportCount: +1 },
                        }
                    )
                    const updatedReport = await userReportsCollection.findOne({ postId: commentId });
                    if (updatedReport && updatedReport.reportCount > 1) {
                        // Delete the post if the report count exceeds 20
                        await blogsCollection.deleteOne({ _id: new ObjectId(id) });
                        console.log("blog deleted");
                        return res.status(200).json({ success: false, message: "Blog Deleted" });
                    }
                    return res.status(200).json({ success: true, message: "Report successful" });
                }
                else {
                    return res.status(200).json({ success: false, error: "You have already reported this post" });
                }
            } catch (error) {
                console.error("Error reporting post:", error);
                res.status(500).json({ success: false, error: "Internal server error" });
            }
        });

        // Post a blog
        app.post("/post-blog", async (req, res) => {
            const body = req.body;
            body.createdAt = new Date();
            try {
                const result = await blogsCollection.insertOne(body);
                if (result?.insertedId) {
                    return res.status(200).send(result);
                    reset();
                } else {
                    return res.status(404).send({
                        message: "Can not insert, try again later",
                        status: false,
                    });
                }
            } catch (error) {
                return res.status(500).json({ success: false, error: "Image size is too large" });
            }
        });

        // Get all blogs
        app.get("/all-blogs", async (req, res) => {
            try {
                const blogs = await blogsCollection
                    .find({})
                    .sort({ createdAt: -1 })
                    .toArray();
                res.send(blogs);
            } catch (error) {
                console.error("Error fetching all blogs:", error);
                res.status(500).json({ success: false, error: "Internal server error" });
            }
        });

        // Get single blog using id
        app.get("/all-blogs/:id", async (req, res) => {
            const { id } = req.params;
            try {
                const blog = await blogsCollection.findOne({
                    _id: new ObjectId(id),
                });
                if (blog) {
                    res.send(blog);
                } else {
                    res.status(404).json({ success: false, error: "Blog not found" });
                }
            } catch (error) {
                console.error("Error fetching single blog:", error);
                res.status(500).json({ success: false, error: "Internal server error" });
            }
        });

        // Get blogs based on email for my blog listing
        app.get("/yourBlogs/:email", async (req, res) => {
            const { email } = req.params;
            try {
                const blogs = await blogsCollection
                    .find({
                        postedBy: email,
                    })
                    .toArray();
                res.send(blogs);
            } catch (error) {
                console.error("Error fetching blogs by email:", error);
                res.status(500).json({ success: false, error: "Internal server error" });
            }
        });

        // Delete a blog
        app.delete("/delete-blog/:id", async (req, res) => {
            const { id } = req.params;
            try {
                const result = await blogsCollection.deleteOne({ _id: new ObjectId(id) });
                res.send(result);
            } catch (error) {
                console.error("Error deleting blog:", error);
                res.status(500).json({ success: false, error: "Internal server error" });
            }
        });

        // Update a blog
        app.patch("/update-blog/:id", async (req, res) => {
            const { id } = req.params;
            const { body: blogData } = req;
            try {
                const result = await blogsCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { ...blogData } }
                );
                res.send(result);
            } catch (error) {
                console.error("Error updating blog:", error);
                res.status(500).json({ success: false, error: "Internal server error" });
            }
        });

        // Post a blog
        app.post("/edit-profile/:email", asyncHandler(async (req, res) => {
            const { email } = req.params; // Extract email from params
            const body = req.body;

            try {
                // Update the user profile based on the email
                const result = await userProfilesCollection.updateOne(
                    { email: email }, // Match the user profile by email
                    { $set: { ...body } }, // Update the user profile data
                    { upsert: true } // Create a new document if not found
                );

                res.status(200).json({ success: true, message: "Profile updated successfully" });
            } catch (error) {
                console.error("Error updating profile:", error);
                res.status(500).json({ success: false, error: "Internal server error" });
            }
        }));

        // Get user profile based on email
        app.get("/userProfile/:email", async (req, res) => {
            const { email } = req.params;
            try {
                const userProfile = await userProfilesCollection.findOne({ email });
                if (userProfile) {
                    res.json(userProfile);
                } else {
                    res.status(404).json({ success: false, error: "User profile not found" });
                }
            } catch (error) {
                console.error("Error fetching user profile:", error);
                res.status(500).json({ success: false, error: "Internal server error" });
            }
        });
        app.post("/follow/:email", async (req, res) => {
            const { email } = req.params;
            const { followerEmail } = req.body; // Extract follow status from request body

            try {
                // Find user profile by email
                const userProfile = await userProfilesCollection.findOne({ email });
                if (!userProfile) {
                    return res.status(404).json({ success: false, error: "User profile not found" });
                }

                // Check if the user is already following
                const isFollowing = userProfile.followers && userProfile.followers.includes(followerEmail);

                if (isFollowing) {
                    await userProfilesCollection.updateOne(
                        { email },
                        { $set: { isFollowing: true } }
                    );

                    await userProfilesCollection.updateOne(
                        { email },
                        { $pull: { followers: followerEmail } }
                    );

                    // Remove email from following list for follower
                    await userProfilesCollection.updateOne(
                        { email: followerEmail },
                        { $pull: { following: email } }
                    );
                    // Update follower count for the user being followed
                    await userProfilesCollection.updateOne(
                        { email },
                        { $inc: { followerCount: -1 } }
                    );

                    // Update following count for the follower
                    await userProfilesCollection.updateOne(
                        { email: followerEmail },
                        { $inc: { followingCount: -1 } }
                    );
                }
                else {
                    // If follow is true, add followerEmail to followers list
                    await userProfilesCollection.updateOne(
                        { email },
                        { $set: { isFollowing: false } }
                    );
                    await userProfilesCollection.updateOne(
                        { email },
                        { $push: { followers: followerEmail } },
                    );
                    // Add email to following list for follower
                    await userProfilesCollection.updateOne(
                        { email: followerEmail },
                        { $push: { following: email } },
                    );
                    // Update follower count for the user being followed
                    await userProfilesCollection.updateOne(
                        { email },
                        { $inc: { followerCount: +1 } }
                    );

                    // Update following count for the follower
                    await userProfilesCollection.updateOne(
                        { email: followerEmail },
                        { $inc: { followingCount: +1 } }
                    );
                }

                res.status(200).json({ success: true, message: "Follow status updated successfully" });
            } catch (error) {
                console.error("Error updating follow status:", error);
                res.status(500).json({ success: false, error: "Internal server error" });
            }
        });
        // Post a Comment
        app.post("/post-comment/:blogId", async (req, res) => {
            const { blogId } = req.params;
            const { name } = req.body;
            const { photoURL } = req.body;
            const { email } = req.body;
            const body = req.body;
            body.createdAt = new Date();
            body.blogId = blogId; // Add blogId to the comment
            body.commenterName = name; // Add commenter's userId to the comment
            body.photoURL = photoURL;
            body.email = email;
            body.notification = false;
            console.log(body.commenterName);
            console.log(email);
            try {
                const result = await userCommentsCollection.insertOne(
                    body
                )
                if (result?.insertedId) {
                    console.log(result);
                    return res.status(200).send(result);

                } else {
                    return res.status(404).send({
                        message: "Can not insert, try again later",
                        status: false,

                    });
                }
            } catch (error) {
                return res.status(500).json({ success: false, error: "Internal Server Error" });
            }
        });

        // Get comments for a specific blog post
        app.get("/comments/:blogId", async (req, res) => {
            const { blogId } = req.params;
            try {
                const comments = await userCommentsCollection
                    .find({ blogId })
                    .toArray();
                res.json(comments);
            } catch (error) {
                console.error("Error fetching comments:", error);
                res.status(500).json({ success: false, error: "Internal server error" });
            }
        });





        // Error handling middleware for other errors
        app.use((err, req, res, next) => {
            // Handle other errors here
            console.error(err);
            res.status(500).send({
                message: 'Internal server error',
                status: false
            });
        });


        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}

run().catch(console.dir);

const port = process.env.PORT || 5000;
app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});
