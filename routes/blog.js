const express = require("express");
const router = express.Router();
const blogController = require("../controllers/blogController");

router.get("/", blogController.readBlogPost);
router.put("/", blogController.addBlogPost);
router.delete("/", blogController.deleteBlogPost);
router.post("/", blogController.updateBlogPost);

module.exports = router;
