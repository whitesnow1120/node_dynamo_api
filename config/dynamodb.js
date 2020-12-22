// AWS
const AWS = require("aws-sdk");

AWS.config.update({
  apiVersion: "2020–12–21",
  accessKeyId: "abcde",
  secretAccessKey: "abcde",
  region: "eu-west-2",
  endpoint: "http://localhost:8000",
});

const docClient = new AWS.DynamoDB.DocumentClient();
const dynamodb = new AWS.DynamoDB();

exports.docClient = docClient;
exports.dynamodb = dynamodb;
