const awsConfig = require("../config/dynamodb");
const uuid = require("uuid");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const mailgun = require("mailgun-js");
const DOMAIN = "sandbox95f7700f94204f7d9c1564f6176d798b.mailgun.org";
const mg = mailgun({ apiKey: process.env.MAILGUN_APIKEY, domain: DOMAIN });

const dynamodb = awsConfig.dynamodb;
const docClient = awsConfig.docClient;
const tableName = "Users";
const key = "authentication";

/**
 * create table (Users)
 */
const createAuthTable = (req, res) => {
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
              { AttributeName: "email", KeyType: "HASH" }, // partition key
            ],
            AttributeDefinitions: [
              { AttributeName: "email", AttributeType: "S" },
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
 * generated hashed password (sha512)
 * @param { string } password 
 */
const generateHashdPassword = (password) => {
  const hash = crypto.createHmac("sha512", key);
  hash.update(password);
  return hash.digest("hex").toString();
};

/**
 * registration
 * @param {*} req
 * @param {*} res
 * @method POST
 */
const registration = (req, res) => {
  try {
    const params = {
      TableName: tableName,
      Key: {
        email: req.body.email,
      },
    };

    // check email is exist or not
    docClient.get(params, function (err, data) {
      if (err) {
        res.status(err.statusCode).json({ result: err.message });
      } else {
        if (data.Item == undefined) {
          // create hash password
          const name = req.body.name;
          const email = req.body.email;
          const password = generateHashdPassword(req.body.password);

          const token = jwt.sign(
            { name, email, password },
            process.env.JWT_ACC_ACTIVE,
            { expiresIn: "20m" },
          );

          const data = {
            from: "noreply@hello.com",
            to: email,
            subject: "Account Activiation Link",
            html: `
              <h2>Please click on given link to activate your account</h2>
              <p>${process.env.CLIENT_URL}/auth/activate/${token}</p>
            `,
          };
          sendMail(data, res);
        } else {
          res.status(400).json({
            result: "account_exists",
          });
        }
      }
    });
  } catch (err) {
    res.status(500).json({ error: err });
  }
};

/**
 * send email to the user
 * @param {*} data
 * @param {*} res
 */
const sendMail = (data, res) => {
  mg.messages().send(data, function (err, body) {
    if (err) {
      return res.status(403).json({ result: "Email sending Error" });
    }
    return res.status(200).json({ result: "Email has been sent" });
  });
};

/**
 * activate account (simply click on the given link)
 * @param {*} req
 * @param {*} res
 * @method POST
 */
const activateAccount = (req, res) => {
  try {
    const token = req.url.split("/")[2];
    if (token) {
      jwt.verify(
        token,
        process.env.JWT_ACC_ACTIVE,
        function (err, decodedToken) {
          if (err) {
            return res
              .status(400)
              .json({ result: "Incorrect or Expired Link" });
          }
          const { name, email, password } = decodedToken;
          const paramsWrite = {
            TableName: tableName,
            Item: {
              uid: uuid.v1(),
              email: email,
              name: name,
              password: password,
              createdAt: Date().toString(),
              updatedAt: Date().toString(),
              authtoken: token,
            },
          };

          docClient.put(paramsWrite, function (err, data) {
            if (err) {
              res.status(403).json({ result: "Invalid credentail" });
            } else {
              res.status(200).json({ result: "activated" });
            }
          });
        },
      );
    }
  } catch (err) {
    res.status(500).json({ error: err });
  }
};

/**
 * login
 * @param {*} req
 * @param {*} res
 * @method GET
 */
const login = (req, res) => {
  try {
    const hashed_password = generateHashdPassword(req.query.password);

    const params = {
      TableName: tableName,
      Key: {
        email: req.query.email,
      },
    };

    docClient.get(params, function (err, data) {
      if (err) {
        res.status(err.statusCode).json({ result: err.message });
      } else {
        if (data.Item == undefined) {
          res
            .status(400)
            .json({ result: "Users with this account does not exist" });
        } else {
          if (hashed_password === data.Item.password) {
            res.status(200).send({
              userId: data.Item.uid,
              name: data.Item.name,
              createdAt: data.Item.createdAt,
              updatedAt: data.Item.updatedAt,
            });
          } else {
            res.status(403).json({
              result: "credentials are incorrect.",
            });
          }
        }
      }
    });
  } catch (err) {
    res.status(500).json({ error: err });
  }
};

/**
 * Generate a reset password token and send email to the user
 * @param {*} req
 * @param {*} res
 * @method POST
 */
const forgotPassword = (req, res) => {
  try {
    const email = req.body.email;
    let params = {
      TableName: tableName,
      Key: {
        email: email,
      },
    };

    // check email is exist or not
    docClient.get(params, function (err, data) {
      if (err) {
        res.status(err.statusCode).json({ result: err.message });
      } else {
        if (data.Item.uid != undefined) {
          const token = jwt.sign(
            { _id: data.Item.uid },
            process.env.RESET_PASSWORD_KEY,
            { expiresIn: "20m" },
          );
          const emailData = {
            from: "noreply@hello.com",
            to: email,
            subject: "Token",
            html: `<p>${token}</p>`,
          };
          // update user (token)
          params = {
            TableName: tableName,
            Key: {
              email: email,
            },
            UpdateExpression: "set authtoken = :authtoken",
            ExpressionAttributeValues: {
              ":authtoken": token,
            },
            ReturnValues: "UPDATED_NEW",
          };

          docClient.update(params, function (err, data) {
            if (err) {
              res.status(err.statusCode).json({ error: err.message });
            } else {
              sendMail(emailData, res);
            }
          });
        } else {
          res.status(400).json({
            result: "User with this email doesn't exist",
          });
        }
      }
    });
  } catch (err) {
    res.status(500).json({ error: err });
  }
};

/**
 * reset the password
 * @param {*} req
 * @param {*} res
 * @method POST
 */
const resetPassword = (req, res) => {
  try {
    const { token, email, newPassword } = req.body;
    if (token) {
      jwt.verify(
        token,
        process.env.RESET_PASSWORD_KEY,
        function (err, decodedToken) {
          if (err) {
            return res
              .status(400)
              .json({ error: "Incorrect token or it is expired" });
          }

          // find the user by token
          let params = {
            TableName: tableName,
            Key: {
              email: email,
            },
          };

          docClient.get(params, function (err, data) {
            if (err) {
              res.status(err.statusCode).json({ error: err.message });
            } else {
              if (data.Item.authtoken == token) {
                params = {
                  TableName: tableName,
                  Key: {
                    email: data.Item.email,
                  },
                  UpdateExpression:
                    "set password = :password, updatedAt=:updatedAt, authtoken=:authtoken",
                  ExpressionAttributeValues: {
                    ":password": generateHashdPassword(newPassword),
                    ":updatedAt": Date().toString(),
                    ":authtoken": "",
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
              } else {
                res
                  .status(400)
                  .json({ error: "User with this token does not exist" });
              }
            }
          });
        },
      );
    }
  } catch (err) {
    res.status(500).json({ error: err });
  }
};

module.exports = {
  createAuthTable,
  registration,
  forgotPassword,
  login,
  activateAccount,
  resetPassword,
};
