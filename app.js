const dotenv = require('dotenv');
dotenv.config();

const express = require("express");
const PORT = process.env.PORT || 4000;
const morgan = require("morgan");
const cors = require("cors");
const bodyParser = require("body-parser");
const blogController = require("./controllers/blogController");
const authController = require("./controllers/authController");
const app = express();

//registering cors
app.use(cors());
//configure body parser
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
//configure body-parser ends here
app.use(morgan("dev")); // configire morgan

// create tables (Blogs, Users)
blogController.createBlogTable();
authController.createAuthTable();

// define first route
app.get("/", (req, res) => {
  res.json("API endpoints");
});

const auth = require("./routes/auth");
app.use("/auth", auth);

const blog = require("./routes/blog");
app.use("/blog", blog);

app.listen(PORT, () => {
  console.log(`App is running on ${PORT}`);
});

module.exports = app;
