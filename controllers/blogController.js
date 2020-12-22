const awsConfig = require("../config/dynamodb");
const uuid = require("uuid");

const dynamodb = awsConfig.dynamodb;
const docClient = awsConfig.docClient;
const tableName = "Blogs";

/**
 * create table (Blogs)
 */
const createBlogTable = (req, res) => {
  try {
    const tablePromise = dynamodb
      .listTables({})
      .promise()
      .then((data) => {
        const exists =
          data.TableNames.filter((name) => {
            return name === tableName;
          }).length > 0;
        if (exists) {
          return Promise.resolve();
        } else {
          const params = {
            TableName: tableName,
            KeySchema: [
              { AttributeName: "uid", KeyType: "HASH" }, // partition key
            ],
            AttributeDefinitions: [
              { AttributeName: "uid", AttributeType: "S" },
            ],
            ProvisionedThroughput: {
              ReadCapacityUnits: 10,
              WriteCapacityUnits: 10,
            },
          };

          return dynamodb.createTable(params, function (err, data) {});
        }
      });
  } catch (err) {
    console.log(err);
  }
};

/**
 * Create blog post
 * @param {*} req
 * @param {*} res
 * @method PUT
 */
const addBlogPost = (req, res) => {
  try {
    const params = {
      TableName: tableName,
      Item: {
        uid: uuid.v4(),
        title: req.body.title,
        content: req.body.content,
        userId: req.body.userId,
        createdAt: Date().toString(),
        updatedAt: Date().toString(),
      },
    };

    docClient.put(params, function (err, data) {
      if (err) {
        res.status(err.statusCode).json({ error: err.message });
      } else {
        res.status(200).json({ result: "success" });
      }
    });
  } catch (err) {
    res.status(500).json({ error: err });
  }
};

/**
 * Read blog post
 * @param {*} req
 * @param {*} res
 * @method GET
 */
const readBlogPost = (req, res) => {
  try {
    const blogId = req.query.uid;
    let params;
    if (blogId == undefined) {
      params = {
        TableName: tableName,
        ProjectionExpression:
          "#uid, #title, #content, #userId, #createdAt, #updatedAt",
        ExpressionAttributeNames: {
          "#uid": "uid",
          "#title": "title",
          "#content": "content",
          "#userId": "userId",
          "#createdAt": "createdAt",
          "#updatedAt": "updatedAt",
        },
      };

      docClient.scan(params, onScan);
      function onScan(err, data) {
        if (err) {
          res.status(err.statusCode).json({ error: err.message });
        } else {
          res.status(200).send(data.Items);
          if (typeof data.LastEvaluatedKey != "undefined") {
            // Scanning for more...
            params.ExclusiveStartKey = data.LastEvaluatedKey;
            docClient.scan(params, onScan);
          }
        }
      }
    } else {
      params = {
        TableName: tableName,
        Key: {
          uid: blogId,
        },
      };

      docClient.get(params, function (err, data) {
        if (err) {
          res.status(err.statusCode).json({ result: err.message });
        } else {
          res.status(200).json(data.Item);
        }
      });
    }
  } catch (err) {
    res.status(500).json({ error: err });
  }
};

/**
 * Update blog post
 * @param {*} req
 * @param {*} res
 * @method POST
 */
const updateBlogPost = (req, res) => {
  try {
    const blogId = req.query.uid;
    const params = {
      TableName: tableName,
      Key: {
        uid: blogId,
      },
      UpdateExpression:
        "set title = :title, content=:content, updatedAt=:updatedAt",
      ExpressionAttributeValues: {
        ":title": req.body.title,
        ":content": req.body.content,
        ":updatedAt": Date().toString(),
      },
      ReturnValues: "UPDATED_NEW",
    };

    docClient.update(params, function (err, data) {
      if (err) {
        res.status(err.statusCode).json({ error: err.message });
      } else {
        res.status(200).json({ result: "success" });
      }
    });
  } catch (err) {
    res.status(500).json({ error: err });
  }
};

/**
 * Delete blog post
 * @param {*} req
 * @param {*} res
 * @method DELETE
 */
const deleteBlogPost = (req, res) => {
  try {
    const blogId = req.query.uid;
    const params = {
      TableName: tableName,
      Key: {
        uid: blogId,
      },
    };

    docClient.delete(params, function (err, data) {
      if (err) {
        res.status(err.statusCode).json({ error: err.message });
      } else {
        res.status(200).json({ result: "success" });
      }
    });
  } catch (err) {
    res.status(500).json({ error: err });
  }
};

module.exports = {
  createBlogTable,
  addBlogPost,
  readBlogPost,
  updateBlogPost,
  deleteBlogPost,
};
